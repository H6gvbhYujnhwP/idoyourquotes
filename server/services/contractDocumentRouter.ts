/**
 * Contract Document tRPC sub-router.
 *
 * Contract-button delivery, stage 2a. Manages the organisation's contract
 * documents, and the signatory identity that the contract's acceptance
 * page prints.
 *
 * Endpoints:
 *   - list:      return the org's contract documents (seeding Sweetbyte's
 *                Gold and Silver on first call, for allow-listed orgs only
 *                — see SHIPPED DEFAULTS below).
 *   - create:    add a new, empty contract document with the user's name.
 *   - remove:    delete one contract document.
 *   - save:      upsert one document (clauses + the four body texts).
 *   - resetTier: discard the org's edits for one tier and restore the
 *                shipped default (allow-listed orgs, shipped tiers only).
 *   - getSignatory:    signatory name, title and signature image.
 *   - saveSignatory:   update name and title.
 *   - uploadSignature: receive a base64 image, store in R2, save key.
 *   - deleteSignature: clear the stored signature.
 *
 * SHIPPED DEFAULTS ARE SWEETBYTE'S, AND ONLY SWEETBYTE GETS THEM
 * (contracts-per-business delivery, delivery 2 of the Xero sequence):
 *   The Gold and Silver documents in contractDocumentSeeds.ts are
 *   Sweetbyte's own live contracts — its SLA hours, onsite allowance,
 *   notice period and Direct Debit wording. Previously every org that
 *   opened the Contracts tab was seeded with them, so another MSP (or a
 *   pest-control firm) would have issued Sweetbyte's service terms under
 *   its own name. Now only organisations listed in the Render setting
 *   CONTRACT_SEED_ORG_IDS (comma-separated org ids, e.g. "10") receive
 *   them. Every other organisation starts with no contract documents and
 *   adds its own via `create`. Unset / empty = nobody is seeded.
 *
 *   Confirmed on 11 Sep 2026 that contract_documents held zero rows for
 *   every org before this delivery, so no existing org had been seeded.
 *
 * SEED ONCE, ON FIRST READ:
 *   An allow-listed org is seeded only when it has NO documents at all.
 *   Previously the rule was "any shipped tier missing", which — now that
 *   documents can be deleted — would silently resurrect a package the
 *   user had just removed. Once seeded, the org's copy is authoritative:
 *   a later change to the shipped defaults never overwrites it, because
 *   silently reverting an edited clause on a deploy would be the worst
 *   possible failure mode for a legal document.
 *
 * TIER GATING:
 *   Contracts follow Branded Proposals: Pro and Team only, since the
 *   contract is generated from a branded proposal. Reads are open to
 *   all tiers so a Solo user sees the tab and the upgrade prompt rather
 *   than a blank screen.
 *
 * Wired into the main router at server/routers.ts as `contractDocument`.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getDb,
  getUserPrimaryOrg,
  updateOrganization,
} from "../db";
import { contractDocuments } from "../../shared/schema";
import { and, eq } from "drizzle-orm";
import { uploadToR2, isR2Configured } from "../r2Storage";
import {
  CONTRACT_DOCUMENT_SEEDS,
  type ContractDocumentSeed,
} from "./contractDocumentSeeds";

/** Tiers permitted to generate a contract. Mirrors Branded Proposals. */
const ALLOWED_TIERS = ["pro", "team"];

/** Signature images are small. 2MB is generous for a PNG of a
 *  signature and keeps a mis-selected photo from reaching R2. */
const MAX_SIGNATURE_BYTES = 2 * 1024 * 1024;

const ALLOWED_SIGNATURE_TYPES = ["image/png", "image/jpeg", "image/webp"];

/** Most contract documents one organisation can hold. Generous — real
 *  businesses run one to three — but stops a runaway client loop. */
const MAX_DOCUMENTS_PER_ORG = 20;

/**
 * Org ids allowed to receive the shipped (Sweetbyte) documents, read
 * from CONTRACT_SEED_ORG_IDS on every call so a Render env change takes
 * effect on the next restart without a code change.
 */
function seedOrgIds(): Set<number> {
  const raw = process.env.CONTRACT_SEED_ORG_IDS ?? "";
  return new Set(
    raw
      .split(",")
      .map((v) => parseInt(v.trim(), 10))
      .filter((n) => Number.isInteger(n) && n > 0),
  );
}

function orgGetsShippedDefaults(orgId: number): boolean {
  return seedOrgIds().has(orgId);
}

/**
 * The neutral starting point for a contract a user adds themselves.
 * Deliberately contains no terms: IDYQ must not author another
 * business's legal wording. The acceptance paragraph only states facts
 * the renderer fills in (who, when, how much), using {{monthlyFee}} so
 * it reads correctly whether or not the business is VAT registered.
 * The pricing note is NOT passed through placeholder substitution by
 * the renderer, so it carries no placeholders.
 */
const BLANK_DOCUMENT_TEXTS = {
  acceptanceBody:
    "This agreement between {{providerName}} and {{customerName}} will commence on {{commencementDate}}. The first invoice will be issued for {{firstInvoiceMonth}}. The monthly fee for the services set out in this agreement is {{monthlyFee}}.",
  nextStepsBody: "",
  thankYouBody: "Thank you for choosing {{providerName}}.",
  pricingCaveatBody:
    "The prices set out in this agreement are the agreed prices for the services described.",
};

/**
 * Turn a user-given name into the row's `tier` key: lower-case letters,
 * digits and hyphens, at most 32 characters (the column width), unique
 * within the org. "Managed Services Agreement" -> "managed-services-agreement".
 */
function slugForName(name: string, taken: Set<string>): string {
  const base =
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 28)
      .replace(/-+$/g, "") || "contract";
  if (!taken.has(base)) return base;
  for (let i = 2; i < 1000; i++) {
    const candidate = `${base}-${i}`;
    if (!taken.has(candidate)) return candidate;
  }
  return `${base}-${Date.now().toString(36)}`.slice(0, 32);
}

const ClauseSchema = z.object({
  number: z.number().int().min(1).max(999),
  heading: z.string().min(1).max(255),
  body: z.string().max(20000),
});

/**
 * Fetch the org's documents, seeding on first call.
 *
 * Returns them in the shipped order (gold, then silver) rather than by
 * id, so the Settings tabs never reshuffle.
 */
async function loadOrSeed(orgId: number) {
  const db = await getDb();
  if (!db) throw new Error("Database unavailable");

  const existing = await db
    .select()
    .from(contractDocuments)
    .where(eq(contractDocuments.orgId, orgId));

  // Seed only an allow-listed org that has no documents at all. See
  // SHIPPED DEFAULTS and SEED ONCE in the header.
  const missing =
    existing.length === 0 && orgGetsShippedDefaults(orgId)
      ? CONTRACT_DOCUMENT_SEEDS
      : [];

  if (missing.length > 0) {
    await db.insert(contractDocuments).values(
      missing.map((seed: ContractDocumentSeed) => ({
        orgId,
        tier: seed.tier,
        displayName: seed.displayName,
        clauses: seed.clauses,
        acceptanceBody: seed.acceptanceBody,
        nextStepsBody: seed.nextStepsBody,
        thankYouBody: seed.thankYouBody,
        pricingCaveatBody: seed.pricingCaveatBody,
      })),
    );
  }

  const rows =
    missing.length > 0
      ? await db
          .select()
          .from(contractDocuments)
          .where(eq(contractDocuments.orgId, orgId))
      : existing;

  // Shipped order, then anything the org has added beyond it.
  // Widened to string[]: the seeds are typed as the literal union
  // "gold" | "silver", but a row's tier comes back from Postgres as a
  // plain string, and indexOf on the narrow type rejects it.
  const order: string[] = CONTRACT_DOCUMENT_SEEDS.map((s) => s.tier);
  return rows.slice().sort((a: { tier: string }, b: { tier: string }) => {
    const ai = order.indexOf(a.tier);
    const bi = order.indexOf(b.tier);
    if (ai === -1 && bi === -1) return a.tier.localeCompare(b.tier);
    if (ai === -1) return 1;
    if (bi === -1) return -1;
    return ai - bi;
  });
}

export const contractDocumentRouter = router({
  /**
   * Read the org's contract documents, seeding on first call.
   * Open to all tiers — a Solo user should see the content and the
   * upgrade prompt, not an empty page.
   */
  list: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("Organisation not found");

    const documents = await loadOrSeed(org.id);
    const orgAny = org as any;

    return {
      documents,
      // Tiers this org may "Reset to default". Empty for every org that
      // isn't allow-listed, so the Reset button never offers another
      // business Sweetbyte's wording.
      shippedDefaults: orgGetsShippedDefaults(org.id)
        ? CONTRACT_DOCUMENT_SEEDS.map((s) => s.tier as string)
        : ([] as string[]),
      canGenerateContracts: ALLOWED_TIERS.includes(orgAny.subscriptionTier),
      signatory: {
        name: orgAny.contractSignatoryName ?? null,
        title: orgAny.contractSignatoryTitle ?? null,
        signatureImage: orgAny.contractSignatureImage ?? null,
      },
    };
  }),

  /**
   * Add a new contract document. Starts with no clauses and the neutral
   * texts above; the user writes their own terms in Settings.
   */
  create: protectedProcedure
    .input(z.object({ displayName: z.string().trim().min(1).max(255) }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Seed first, so an allow-listed org adding a third contract before
      // ever opening the tab still receives Gold and Silver.
      const existing = await loadOrSeed(org.id);
      if (existing.length >= MAX_DOCUMENTS_PER_ORG) {
        throw new Error(
          `You can hold up to ${MAX_DOCUMENTS_PER_ORG} contract documents.`,
        );
      }

      const taken = new Set<string>(
        existing.map((d: { tier: string }) => d.tier as string),
      );
      const tier = slugForName(input.displayName, taken);

      const [created] = await db
        .insert(contractDocuments)
        .values({
          orgId: org.id,
          tier,
          displayName: input.displayName,
          clauses: [],
          ...BLANK_DOCUMENT_TEXTS,
        })
        .returning();

      return created;
    }),

  /**
   * Delete one contract document. Contracts are rendered on demand and
   * never stored, so no already-issued contract depends on this row.
   * The client confirms first.
   */
  remove: protectedProcedure
    .input(z.object({ tier: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      const deleted = await db
        .delete(contractDocuments)
        .where(
          and(
            eq(contractDocuments.orgId, org.id),
            eq(contractDocuments.tier, input.tier),
          ),
        )
        .returning();

      if (deleted.length === 0) {
        throw new Error("That contract document no longer exists.");
      }
      return { success: true };
    }),

  /**
   * Save one document. Whole-document upsert rather than per-clause
   * patching: the Settings screen holds the entire document in state
   * and saves it as a unit, and a partial write on a legal document is
   * a worse failure than a redundant one.
   */
  save: protectedProcedure
    .input(
      z.object({
        tier: z.string().min(1).max(32),
        displayName: z.string().min(1).max(255),
        clauses: z.array(ClauseSchema).max(100),
        acceptanceBody: z.string().max(20000),
        nextStepsBody: z.string().max(20000),
        thankYouBody: z.string().max(5000),
        pricingCaveatBody: z.string().max(5000),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      // Seed first so an allow-listed org saving before it has ever read
      // still ends up with its shipped rows present.
      await loadOrSeed(org.id);

      const [updated] = await db
        .update(contractDocuments)
        .set({
          displayName: input.displayName,
          clauses: input.clauses,
          acceptanceBody: input.acceptanceBody,
          nextStepsBody: input.nextStepsBody,
          thankYouBody: input.thankYouBody,
          pricingCaveatBody: input.pricingCaveatBody,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contractDocuments.orgId, org.id),
            eq(contractDocuments.tier, input.tier),
          ),
        )
        .returning();

      if (!updated) throw new Error(`No ${input.tier} contract document found`);
      return updated;
    }),

  /**
   * Restore one tier to the shipped default, discarding the org's
   * edits. Destructive and irreversible, so the client confirms first.
   */
  resetTier: protectedProcedure
    .input(z.object({ tier: z.string().min(1).max(32) }))
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      // Only an allow-listed org may restore Sweetbyte's shipped wording.
      if (!orgGetsShippedDefaults(org.id)) {
        throw new Error("This contract has no shipped default to restore.");
      }
      const seed = CONTRACT_DOCUMENT_SEEDS.find((s) => s.tier === input.tier);
      if (!seed) throw new Error("This contract has no shipped default to restore.");

      const db = await getDb();
      if (!db) throw new Error("Database unavailable");

      await loadOrSeed(org.id);

      const [restored] = await db
        .update(contractDocuments)
        .set({
          displayName: seed.displayName,
          clauses: seed.clauses,
          acceptanceBody: seed.acceptanceBody,
          nextStepsBody: seed.nextStepsBody,
          thankYouBody: seed.thankYouBody,
          pricingCaveatBody: seed.pricingCaveatBody,
          updatedAt: new Date(),
        })
        .where(
          and(
            eq(contractDocuments.orgId, org.id),
            eq(contractDocuments.tier, input.tier),
          ),
        )
        .returning();

      return restored;
    }),

  /** Signatory name and title for the provider signature block.
   *  Shared by all of the org's contract documents. */
  saveSignatory: protectedProcedure
    .input(
      z.object({
        name: z.string().max(255),
        title: z.string().max(255),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      // Empty string means "clear", not "save a blank".
      await updateOrganization(org.id, {
        contractSignatoryName: input.name.trim() || null,
        contractSignatoryTitle: input.title.trim() || null,
      } as any);

      return { name: input.name.trim(), title: input.title.trim() };
    }),

  /**
   * Upload a signature image. Mirrors the existing logo upload: base64
   * in, R2 out, permanent proxy URL stored on the org.
   */
  uploadSignature: protectedProcedure
    .input(
      z.object({
        base64: z.string().min(1),
        filename: z.string().min(1).max(255),
        contentType: z.string().min(1).max(100),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      if (!isR2Configured()) {
        throw new Error("File storage is not configured.");
      }

      if (!ALLOWED_SIGNATURE_TYPES.includes(input.contentType)) {
        throw new Error("Signature must be a PNG, JPEG or WebP image.");
      }

      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("Organisation not found");

      // Strip a data-URL prefix if the client sent one.
      const cleaned = input.base64.replace(/^data:[^;]+;base64,/, "");
      const buffer = Buffer.from(cleaned, "base64");

      if (buffer.length === 0) {
        throw new Error("Signature image was empty.");
      }
      if (buffer.length > MAX_SIGNATURE_BYTES) {
        throw new Error("Signature image must be under 2MB.");
      }

      const { key, url } = await uploadToR2(
        buffer,
        input.filename,
        input.contentType,
        `signatures/${org.id}`,
      );

      await updateOrganization(org.id, {
        contractSignatureImage: url,
      } as any);

      return { url, key };
    }),

  /**
   * Clear the stored signature. The R2 object is deliberately left in
   * place — same convention as the brochure soft-delete — so a contract
   * PDF already generated against it is unaffected.
   */
  deleteSignature: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("Organisation not found");

    await updateOrganization(org.id, {
      contractSignatureImage: null,
    } as any);

    return { success: true };
  }),
});
