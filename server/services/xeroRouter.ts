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
});
