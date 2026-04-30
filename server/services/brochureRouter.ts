/**
 * Brochure tRPC sub-router.
 *
 * Phase 4B Delivery A. Manages the org's single uploaded brochure.
 *
 * Endpoints:
 *   - upload: receive a base64 PDF, validate, store in R2, classify
 *     pages with Claude, persist knowledge to organizations.
 *   - get: return the org's current brochure metadata + knowledge.
 *   - delete: soft-archive (set brochureDeletedAt) — keeps the file in
 *     R2 so any saved proposals that referenced its embedded pages
 *     still render, but treats the org as having no brochure for new
 *     proposals.
 *
 * Tier gating:
 *   - Tile 3 ("Branded with your artwork and company story") is
 *     limited to Pro and Business tiers (per the design discussion).
 *   - The upload mutation enforces this before doing any expensive
 *     work (no point spending Claude tokens on a Solo user who can't
 *     use the result).
 *   - The get query is open to all tiers — we still want Solo users
 *     to see "you have a brochure uploaded, upgrade to use it" copy
 *     in Settings.
 *
 * Wired into the main router at server/routers.ts as `brochure`.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getDb,
  getUserPrimaryOrg,
  updateOrganization,
} from "../db";
import { organizations } from "../../shared/schema";
import { eq } from "drizzle-orm";
import {
  uploadToR2,
  isR2Configured,
  getFileBuffer,
  getProxyUrl,
} from "../r2Storage";
import {
  extractBrochureKnowledge,
  hashBrochureFile,
  isBrochureThin,
  type BrochureKnowledge,
} from "./brochureExtractor";
import { PDFDocument } from "pdf-lib";

const MAX_PAGE_COUNT = 30;
const MAX_FILE_SIZE_BYTES = 25 * 1024 * 1024; // 25 MB
// Runtime tier values are "trial" / "solo" / "pro" / "team" — see
// server/services/stripe.ts TIER_CONFIG. The shared/schema.ts enum
// still says "business" but the DB-level enum was migrated to "team"
// in production some time ago. All runtime writes use "team", so the
// tier gate must check against "team".
const ALLOWED_TIERS = ["pro", "team"] as const;
type AllowedTier = (typeof ALLOWED_TIERS)[number];

// ─── Helpers ─────────────────────────────────────────────────────────

/**
 * Tier check matching the existing pattern. Solo / Trial are blocked
 * from upload but can still view their brochure (if they have one
 * from a previous Pro period). The error message is structured so the
 * client modal can show the upgrade CTA instead of a generic error.
 */
function checkTierAllowed(tier: string): { allowed: boolean; message: string } {
  if (ALLOWED_TIERS.includes(tier as AllowedTier)) {
    return { allowed: true, message: "" };
  }
  return {
    allowed: false,
    message:
      "Brochure upload is available on Pro and Team plans. Upgrade your plan to enable Branded Proposals with your brochure.",
  };
}

// ─── Router ──────────────────────────────────────────────────────────

export const brochureRouter = router({
  /**
   * Get the org's current brochure (or null if none uploaded /
   * soft-deleted). Open to all tiers — the response is the same shape
   * regardless of tier; the client renders different CTAs based on
   * the tier separately.
   */
  get: protectedProcedure.query(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) return null;

    const orgAny = org as any;
    if (!orgAny.brochureFileKey || orgAny.brochureDeletedAt) {
      return null;
    }

    return {
      filename: orgAny.brochureFilename ?? "brochure.pdf",
      fileUrl: orgAny.brochureFileUrl ?? null,
      fileSize: orgAny.brochureFileSize ?? null,
      pageCount: orgAny.brochurePageCount ?? null,
      extractedAt: orgAny.brochureExtractedAt ?? null,
      knowledge: (orgAny.brochureKnowledge ?? null) as BrochureKnowledge | null,
      // Phase 4B Delivery E.4 — orientation choice for branded
      // proposal renders. UI reads this to populate the selector.
      proposalOrientation:
        (orgAny.proposalOrientation as string | null | undefined) ?? "auto",
    };
  }),

  /**
   * Upload a brochure PDF. Validates size + page count, uploads to R2,
   * runs Claude classification, persists knowledge.
   *
   * If the user re-uploads an identical file (same SHA-256 hash), we
   * skip extraction and reuse the existing knowledge — saves a Claude
   * call on accidental re-uploads.
   *
   * Returns the same shape as get(), so the client can update its
   * cached state directly from the upload response.
   */
  upload: protectedProcedure
    .input(
      z.object({
        filename: z.string().min(1).max(500),
        base64Data: z.string().min(1),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      // Tier check before any expensive work
      const tierCheck = checkTierAllowed((org as any).subscriptionTier);
      if (!tierCheck.allowed) {
        throw new Error(tierCheck.message);
      }

      if (!isR2Configured()) {
        throw new Error("File storage is not configured");
      }

      const buffer = Buffer.from(input.base64Data, "base64");

      if (buffer.length > MAX_FILE_SIZE_BYTES) {
        throw new Error(
          `Brochure too large (${(buffer.length / 1024 / 1024).toFixed(1)} MB). Max is ${MAX_FILE_SIZE_BYTES / 1024 / 1024} MB.`,
        );
      }

      // Quick page-count check via pdf-lib BEFORE running expensive
      // pdf-parse / Claude calls — fast-fails on oversized brochures
      // that would burn tokens before hitting the cap.
      let pageCount: number;
      try {
        const probeDoc = await PDFDocument.load(buffer);
        pageCount = probeDoc.getPageCount();
      } catch {
        throw new Error(
          "Couldn't read this PDF — it may be password-protected or corrupted.",
        );
      }

      if (pageCount > MAX_PAGE_COUNT) {
        throw new Error(
          `Brochure has ${pageCount} pages — max is ${MAX_PAGE_COUNT}. Trim it down or split into a focused version for proposals.`,
        );
      }

      // Re-upload deduplication: if hash matches the existing brochure,
      // skip Claude extraction and reuse stored knowledge.
      const newHash = await hashBrochureFile(buffer);
      const orgAny = org as any;
      const existingHash = orgAny.brochureHash as string | undefined;
      const isReUpload =
        existingHash === newHash && !orgAny.brochureDeletedAt && orgAny.brochureFileKey;

      if (isReUpload) {
        return {
          filename: orgAny.brochureFilename ?? input.filename,
          fileUrl: orgAny.brochureFileUrl,
          fileSize: orgAny.brochureFileSize ?? buffer.length,
          pageCount: orgAny.brochurePageCount ?? pageCount,
          extractedAt: orgAny.brochureExtractedAt,
          knowledge: orgAny.brochureKnowledge as BrochureKnowledge,
          thinness: isBrochureThin(orgAny.brochureKnowledge as BrochureKnowledge),
          reUploadedSameFile: true,
        };
      }

      // Upload to R2 at org-scoped path. The brochure is the org's
      // SINGLE source of truth, so we put it under a stable key —
      // re-uploading replaces, doesn't accumulate.
      const orgFolder = (org as any).slug || `org-${org.id}`;
      const folder = `orgs/${orgFolder}/brochure`;
      const { key, url } = await uploadToR2(
        buffer,
        input.filename,
        "application/pdf",
        folder,
      );

      // Run extraction (Claude call — the expensive bit)
      let knowledge: BrochureKnowledge;
      try {
        knowledge = await extractBrochureKnowledge(buffer);
      } catch (err: any) {
        // If extraction fails after upload, we still want to clean up.
        // For now: surface the error; the file lingers in R2 (orphan)
        // but the DB stays untouched so the user can re-upload.
        throw new Error(
          `Brochure uploaded but classification failed: ${err?.message || "unknown error"}. Try uploading again.`,
        );
      }

      // Persist
      await updateOrganization(org.id, {
        brochureFileUrl: url,
        brochureFileKey: key,
        brochureFilename: input.filename,
        brochureFileSize: buffer.length,
        brochurePageCount: pageCount,
        brochureHash: newHash,
        brochureExtractedAt: new Date(),
        brochureDeletedAt: null,
        brochureKnowledge: knowledge,
      } as any);

      return {
        filename: input.filename,
        fileUrl: url,
        fileSize: buffer.length,
        pageCount,
        extractedAt: new Date(),
        knowledge,
        thinness: isBrochureThin(knowledge),
        reUploadedSameFile: false,
      };
    }),

  /**
   * Soft-delete the org's brochure. Sets brochureDeletedAt timestamp;
   * the file stays in R2 so any saved proposals that referenced
   * embedded pages still render. Future Branded-with-Brochure proposals
   * will see the org as having no brochure and surface the re-upload
   * message.
   */
  delete: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organisation found");

    await updateOrganization(org.id, {
      brochureDeletedAt: new Date(),
    } as any);

    return { success: true };
  }),

  /**
   * Re-extract knowledge from the existing brochure file without
   * re-uploading. Useful if the classification prompt is improved in a
   * later delivery — admins can refresh extraction without forcing
   * users to re-upload.
   *
   * Tier-gated like upload.
   */
  reExtract: protectedProcedure.mutation(async ({ ctx }) => {
    const org = await getUserPrimaryOrg(ctx.user.id);
    if (!org) throw new Error("No organisation found");

    const tierCheck = checkTierAllowed((org as any).subscriptionTier);
    if (!tierCheck.allowed) {
      throw new Error(tierCheck.message);
    }

    const orgAny = org as any;
    if (!orgAny.brochureFileKey) {
      throw new Error("No brochure to re-extract from");
    }

    const buffer = await getFileBuffer(orgAny.brochureFileKey);
    const knowledge = await extractBrochureKnowledge(buffer);

    await updateOrganization(org.id, {
      brochureExtractedAt: new Date(),
      brochureKnowledge: knowledge,
    } as any);

    return {
      knowledge,
      thinness: isBrochureThin(knowledge),
    };
  }),
  /**
   * Phase 4B Delivery E.4 — set the org's proposal orientation
   * preference. Affects all subsequent Tile 3 Branded Proposal
   * renders. Existing renders are unaffected (proposals are
   * generated on demand, not stored).
   *
   * Accepts 'auto' | 'portrait' | 'landscape'. 'auto' currently
   * resolves to portrait (matching the E.1 default behaviour); the
   * value is preserved as 'auto' rather than 'portrait' so a future
   * iteration can change auto's resolution (e.g. detect from brochure
   * shape) without rewriting everyone's stored preference.
   *
   * Tier-gated to Pro/Team — same as upload/reExtract.
   */
  setProposalOrientation: protectedProcedure
    .input(
      z.object({
        orientation: z.enum(["auto", "portrait", "landscape"]),
      }),
    )
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    .mutation(async ({ ctx, input }: { ctx: any; input: { orientation: "auto" | "portrait" | "landscape" } }) => {
      const org = await getUserPrimaryOrg(ctx.user.id);
      if (!org) throw new Error("No organisation found");

      const tierCheck = checkTierAllowed((org as any).subscriptionTier);
      if (!tierCheck.allowed) {
        throw new Error(tierCheck.message);
      }

      await updateOrganization(org.id, {
        proposalOrientation: input.orientation,
      } as any);

      return { orientation: input.orientation };
    }),
});
