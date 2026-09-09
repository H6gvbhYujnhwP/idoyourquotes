/**
 * Contract Document tRPC sub-router.
 *
 * Contract-button delivery, stage 2a. Manages the organisation's Gold
 * and Silver contract documents, and the signatory identity that the
 * contract's acceptance page prints.
 *
 * Endpoints:
 *   - list:      return the org's contract documents, seeding them from
 *                the shipped defaults on first call.
 *   - save:      upsert one document (clauses + the four body texts).
 *   - resetTier: discard the org's edits for one tier and restore the
 *                shipped default.
 *   - getSignatory:    signatory name, title and signature image.
 *   - saveSignatory:   update name and title.
 *   - uploadSignature: receive a base64 image, store in R2, save key.
 *   - deleteSignature: clear the stored signature.
 *
 * SEED-ON-READ, NOT SEED-ON-SIGNUP:
 *   `list` creates the two rows the first time an org asks for them.
 *   Doing it here rather than at signup means no backfill is needed for
 *   existing orgs, and an org that never opens the Contracts tab never
 *   accumulates rows it does not use. Once seeded, the org's copy is
 *   authoritative — a later change to the shipped defaults never
 *   overwrites it, because silently reverting Wez's edited clause on a
 *   deploy would be the worst possible failure mode for a legal
 *   document.
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

  const haveTiers = new Set(existing.map((d: { tier: string }) => d.tier));
  const missing = CONTRACT_DOCUMENT_SEEDS.filter((s) => !haveTiers.has(s.tier));

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
      canGenerateContracts: ALLOWED_TIERS.includes(orgAny.subscriptionTier),
      signatory: {
        name: orgAny.contractSignatoryName ?? null,
        title: orgAny.contractSignatoryTitle ?? null,
        signatureImage: orgAny.contractSignatureImage ?? null,
      },
    };
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

      // Seed first so an org saving before it has ever read still ends
      // up with both rows present rather than just the one it edited.
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

      const seed = CONTRACT_DOCUMENT_SEEDS.find((s) => s.tier === input.tier);
      if (!seed) throw new Error(`No shipped default for tier "${input.tier}"`);

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

  /** Signatory name and title for the provider signature block. */
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
