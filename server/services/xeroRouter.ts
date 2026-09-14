/**
 * Xero tRPC sub-router — what the Settings panel calls.
 *
 * Delivery 2.11. Read and disconnect only. Nothing here writes to Xero;
 * the connect handshake itself is a pair of browser redirects in
 * xeroRoutes.ts, because it moves through the address bar rather than
 * through JSON.
 *
 *   status        is Xero set up on this server, is this org connected,
 *                 to which Xero organisation, and did we find its VAT code
 *   refreshRates  re-read the tenant's tax rates (after fixing them in
 *                 Xero, or changing your own VAT rate in Settings)
 *   disconnect    delete the stored tokens
 *
 * DISCONNECT IS LOCAL. It removes IDYQ's copy of the tokens, which stops
 * this app reaching Xero. It does NOT revoke the connection at Xero's
 * end — that lives under the user's Xero account, in Settings →
 * Connected Apps. The panel says so rather than implying a clean break
 * that hasn't happened.
 */
import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getUserPrimaryOrg,
  getXeroConnectionByOrgId,
  deleteXeroConnectionByOrgId,
  upsertXeroConnection,
} from "../db";
import {
  isXeroConfigured,
  getValidAccessToken,
  fetchSalesTaxRates,
  pickSalesTaxType,
} from "./xeroClient";
import { resolveOrgVatRate, isVatCharged } from "./vatRate";



// ─── The push (delivery 2.12) ────────────────────────────────────────
//
// preview   build the plan, match the customer, report blockers.
//           Reads from Xero; writes nothing.
// push      create the contact (only if the user asked for a new one),
//           then the repeating invoices and the one-off draft.
// settings  the two org-level Xero options and the account list.
//
// The preview and the push build the plan from the same function with
// the same inputs, so what the user approved is what gets sent.

import {
  buildPushPlan,
  buildRepeatingInvoicePayload,
  buildOneOffInvoicePayload,
  diffLines,
  type PlanLineSource,
  type XeroLineItem,
} from "./xeroInvoicePlan";
import {
  searchContacts,
  createContact,
  fetchRevenueAccounts,
  createRepeatingInvoice,
  updateRepeatingInvoice,
  getRepeatingInvoice,
  createInvoice,
} from "./xeroClient";
import {
  getQuoteByIdAndOrg,
  getLineItemsByQuoteId,
  updateOrganization,
  getDb,
} from "../db";
import { quotes } from "../../drizzle/schema";
import { eq } from "drizzle-orm";

async function loadPlanInputs(userId: number, quoteId: number) {
  const org = await getUserPrimaryOrg(userId);
  if (!org) throw new Error("No organisation found");
  const quote = await getQuoteByIdAndOrg(quoteId, org.id);
  if (!quote) throw new Error("Quote not found");
  const conn = await getXeroConnectionByOrgId(org.id);
  if (!conn) throw new Error("Xero isn't connected — connect it in Settings");

  const dbLines = await getLineItemsByQuoteId(quoteId);
  const lines: PlanLineSource[] = dbLines.map((li: any) => ({
    id: li.id,
    itemName: li.itemName ?? null,
    description: li.description ?? "",
    quantity: parseFloat(li.quantity ?? "0") || 0,
    unit: li.unit ?? null,
    rate: parseFloat(li.rate ?? "0") || 0,
    total: parseFloat(li.total ?? "0") || 0,
    pricingType: li.pricingType ?? null,
    discountPercent: li.discountPercent
      ? parseFloat(li.discountPercent) || null
      : null,
    isOptional: !!li.isOptional,
    sortOrder: li.sortOrder ?? 0,
  }));

  return { org, quote, conn, lines };
}

function planOptionsFor(org: any, conn: any, quote: any, commencementDate?: string | null) {
  const vatRate = resolveOrgVatRate(org);
  return {
    vatRate: isVatCharged(vatRate) ? vatRate : 0,
    taxType: isVatCharged(vatRate) ? conn.salesTaxType ?? null : null,
    accountCode: org.xeroSalesAccountCode ?? null,
    monthYearSuffix: !!org.xeroMonthYearSuffix,
    commencementDate: commencementDate ?? null,
    reference:
      (quote.title?.trim() as string) ||
      (quote.reference?.trim() as string) ||
      `Quote ${quote.id}`,
  };
}

const pushProcedures = {
  /** Revenue accounts, for the optional default-account picker. */
  accounts: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organisation found");
    return { accounts: await fetchRevenueAccounts(org.id) };
  }),

  saveOptions: protectedProcedure
    .input(
      z.object({
        monthYearSuffix: z.boolean().optional(),
        salesAccountCode: z.string().max(20).nullable().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");
      const patch: any = {};
      if (input.monthYearSuffix !== undefined) {
        patch.xeroMonthYearSuffix = input.monthYearSuffix;
      }
      if (input.salesAccountCode !== undefined) {
        patch.xeroSalesAccountCode = input.salesAccountCode || null;
      }
      await updateOrganization(org.id, patch);
      return { ok: true };
    }),

  /**
   * Everything the preview screen needs, and nothing written.
   *
   * Contact matching is offered, never decided: an exact name match is
   * pre-selected, near matches are listed, and creating a new customer
   * is an explicit choice with every field editable.
   */
  preview: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        commencementDate: z.string().optional(),
      }),
    )
    .query(async ({ ctx, input }) => {
      const { org, quote, conn, lines } = await loadPlanInputs(
        ctx.user.id,
        input.quoteId,
      );
      const q = quote as any;

      const plan = buildPushPlan(
        lines,
        planOptionsFor(org, conn, q, input.commencementDate),
      );

      const clientName = (q.clientName ?? "").trim();
      let matches: Awaited<ReturnType<typeof searchContacts>> = [];
      if (clientName) {
        try {
          matches = await searchContacts(org.id, clientName);
        } catch (err: any) {
          console.error("[xero] contact search:", err?.message || err);
        }
      }
      const exact =
        matches.find(
          (m) => m.name.trim().toLowerCase() === clientName.toLowerCase(),
        ) ?? null;

      // An existing push to a DIFFERENT Xero organisation is a real
      // hazard — the same quote billing out of two sets of books.
      const existing = (q.xeroPush ?? null) as any;
      const tenantMismatch =
        existing && existing.tenantId && existing.tenantId !== conn.tenantId
          ? {
              pushedTo: existing.tenantName ?? existing.tenantId,
              nowConnectedTo: conn.tenantName ?? conn.tenantId,
            }
          : null;

      // For an already-pushed quote, show what would change rather than
      // what would be created.
      let diffs: Record<string, ReturnType<typeof diffLines>> | null = null;
      if (existing && !tenantMismatch) {
        diffs = {};
        for (const group of plan.groups) {
          const id =
            group.cadence === "monthly"
              ? existing.monthlyRepeatingInvoiceId
              : group.cadence === "annual"
                ? existing.annualRepeatingInvoiceId
                : null;
          if (!id) continue;
          const live = await getRepeatingInvoice(org.id, id);
          const liveLines: XeroLineItem[] = (live?.LineItems ?? []).map(
            (l: any) => ({
              Description: String(l.Description ?? ""),
              Quantity: Number(l.Quantity ?? 0),
              UnitAmount: Number(l.UnitAmount ?? 0),
              DiscountRate: l.DiscountRate ? Number(l.DiscountRate) : undefined,
            }),
          );
          diffs[group.cadence] = diffLines(liveLines, group.lines);
        }
      }

      return {
        plan,
        tenantName: conn.tenantName ?? null,
        clientName,
        contactSuggestion: {
          exact,
          matches: matches.slice(0, 5),
          /** Pre-fill for the create-new form. Editable by the user. */
          draft: {
            name: clientName,
            contactPerson: q.contactName ?? "",
            email: q.clientEmail ?? "",
            phone: q.clientPhone ?? "",
            address: q.clientAddress ?? "",
          },
        },
        alreadyPushed: existing,
        tenantMismatch,
        diffs,
      };
    }),

  /**
   * Create or update. Ordered so the riskiest step is last: contact
   * first (reusable if a later step fails), then documents. Whatever
   * succeeds is recorded immediately, so a partial failure is visible
   * rather than repeated on the next attempt.
   */
  push: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        commencementDate: z.string(),
        contact: z.union([
          z.object({ mode: z.literal("existing"), contactId: z.string() }),
          z.object({
            mode: z.literal("new"),
            name: z.string().min(1),
            contactPerson: z.string().optional(),
            email: z.string().optional(),
            phone: z.string().optional(),
            address: z.string().optional(),
          }),
        ]),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { org, quote, conn, lines } = await loadPlanInputs(
        ctx.user.id,
        input.quoteId,
      );
      const q = quote as any;

      const plan = buildPushPlan(
        lines,
        planOptionsFor(org, conn, q, input.commencementDate),
      );
      if (plan.blockers.length > 0) {
        throw new Error(plan.blockers.map((b) => b.message).join(" "));
      }

      const existing = (q.xeroPush ?? null) as any;
      if (existing?.tenantId && existing.tenantId !== conn.tenantId) {
        throw new Error(
          `This quote was already sent to ${existing.tenantName ?? "another Xero organisation"}. ` +
            "Reconnect that organisation before pushing again.",
        );
      }

      let contactId: string;
      let contactName: string;
      if (input.contact.mode === "existing") {
        contactId = input.contact.contactId;
        contactName = q.clientName ?? "";
      } else {
        const created = await createContact(org.id, {
          name: input.contact.name,
          contactPerson: input.contact.contactPerson,
          email: input.contact.email,
          phone: input.contact.phone,
          address: input.contact.address,
        });
        contactId = created.contactId;
        contactName = created.name;
      }

      const record: any = {
        tenantId: conn.tenantId,
        tenantName: conn.tenantName ?? null,
        contactId,
        contactName,
        monthlyRepeatingInvoiceId: existing?.monthlyRepeatingInvoiceId ?? null,
        annualRepeatingInvoiceId: existing?.annualRepeatingInvoiceId ?? null,
        oneOffInvoiceId: existing?.oneOffInvoiceId ?? null,
        oneOffInvoiceNumber: existing?.oneOffInvoiceNumber ?? null,
        pushedAt: new Date().toISOString(),
        pushedByUserId: ctx.user.id,
        commencementDate: input.commencementDate,
      };

      const created: string[] = [];
      const db = await getDb();
      const save = async () => {
        await db
          .update(quotes)
          .set({ xeroPush: record })
          .where(eq(quotes.id, input.quoteId));
      };

      for (const group of plan.groups) {
        if (group.cadence === "oneOff") {
          // A one-off invoice is never rewritten — it may already be
          // approved, sent or paid. A changed quote gets a new one.
          if (record.oneOffInvoiceId) continue;
          const inv = await createInvoice(
            org.id,
            buildOneOffInvoicePayload({
              contactId,
              group,
              startDate: plan.startDate,
              reference: plan.reference,
            }),
          );
          record.oneOffInvoiceId = inv.id;
          record.oneOffInvoiceNumber = inv.number;
          created.push("one-off draft invoice");
          await save();
          continue;
        }

        const payload = buildRepeatingInvoicePayload({
          contactId,
          group,
          startDate: plan.startDate!,
          reference: plan.reference,
        });
        const key =
          group.cadence === "monthly"
            ? "monthlyRepeatingInvoiceId"
            : "annualRepeatingInvoiceId";
        if (record[key]) {
          await updateRepeatingInvoice(org.id, record[key], payload);
          created.push(`${group.cadence} repeating invoice (updated)`);
        } else {
          const rep = await createRepeatingInvoice(org.id, payload);
          record[key] = rep.id;
          created.push(`${group.cadence} repeating invoice`);
        }
        await save();
      }

      return { ok: true, created, record };
    }),
};

export const xeroRouter = router({
  status: protectedProcedure.query(async ({ ctx }) => {
    const configured = isXeroConfigured();
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) {
      return { configured, connected: false as const };
    }

    const conn = await getXeroConnectionByOrgId(org.id);
    const orgVatRate = resolveOrgVatRate(org as any);
    const vatCharged = isVatCharged(orgVatRate);

    if (!conn) {
      return {
        configured,
        connected: false as const,
        orgVatRate,
        vatCharged,
      };
    }

    return {
      configured,
      connected: true as const,
      tenantName: conn.tenantName ?? null,
      connectedAt: conn.connectedAt,
      scopes: conn.scopes ?? null,
      orgVatRate,
      vatCharged,
      /** The tenant's code for our VAT rate, e.g. OUTPUT2. Null means
       *  we couldn't find a matching sales rate in that Xero org — the
       *  panel turns that into a warning, because invoices would
       *  otherwise be raised without VAT. */
      salesTaxType: conn.salesTaxType ?? null,
      taxRates: conn.taxRates ?? [],
      // Delivery 2.12 — push options, shown on the same panel.
      monthYearSuffix: !!(org as any).xeroMonthYearSuffix,
      salesAccountCode: (org as any).xeroSalesAccountCode ?? null,
    };
  }),

  refreshRates: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organisation found");

    const conn = await getXeroConnectionByOrgId(org.id);
    if (!conn) throw new Error("Xero isn't connected");

    const token = await getValidAccessToken(org.id);
    if (!token) {
      throw new Error(
        "The Xero connection has expired — reconnect from this page",
      );
    }

    const rates = await fetchSalesTaxRates(token.accessToken, token.tenantId);
    const orgVatRate = resolveOrgVatRate(org as any);
    const salesTaxType = pickSalesTaxType(rates, orgVatRate);

    await upsertXeroConnection({
      orgId: org.id,
      tenantId: conn.tenantId,
      tenantName: conn.tenantName ?? null,
      accessToken: conn.accessToken,
      refreshToken: conn.refreshToken,
      expiresAt: conn.expiresAt,
      scopes: conn.scopes ?? null,
      salesTaxType,
      taxRates: rates,
      connectedByUserId: conn.connectedByUserId ?? null,
      connectedAt: conn.connectedAt,
    });

    return { salesTaxType, taxRates: rates, orgVatRate };
  }),

  disconnect: protectedProcedure
    .input(z.object({}).optional())
    .mutation(async ({ ctx }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");
      await deleteXeroConnectionByOrgId(org.id);
      return { ok: true };
    }),

  // Delivery 2.12 — preview / push / options. Defined below the
  // connection procedures and spread in here so this file reads as one
  // router while keeping the two concerns visibly separate.
  ...pushProcedures,
});
