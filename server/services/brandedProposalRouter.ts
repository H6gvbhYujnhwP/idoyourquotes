/**
 * Branded proposal tRPC sub-router.
 *
 * Phase 4B Delivery A. Three endpoints that drive the Branded-with-
 * Brochure (Tile 3) workflow:
 *
 *   1. generateDraft — given a quoteId, read the tender text from its
 *      inputs, read the org's brochure knowledge, run the engine, return
 *      the chapter slot list. Cost: ~$0.10, time: ~30-90s.
 *
 *   2. regenerateChapter — given a slotIndex + current slots, regenerate
 *      ONE chapter. Used by the workspace's per-chapter regenerate
 *      button. Cost: ~$0.02, time: ~5-10s.
 *
 *   3. renderPdf — given final slots (after the user has reviewed and
 *      possibly edited in the workspace), assemble the final PDF using
 *      the brochure file from R2 + pdf-lib. Returns base64 — the client
 *      decodes to a Blob and triggers a download. No AI calls in this
 *      step. Time: <2s.
 *
 * State is held client-side between generateDraft, regenerateChapter,
 * and renderPdf — the server is stateless wrt the workspace's
 * intermediate state. If the user refreshes mid-edit they lose
 * progress; persistence can be added in a later delivery if needed.
 *
 * Tier-gated to Pro/Business — same as the brochure router. Uses the
 * existing assertAIAccess pattern for AI feature gating.
 */

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getUserPrimaryOrg,
  getQuoteByIdAndOrg,
  getQuoteById,
  getInputsByQuoteId,
  logUsage,
} from "../db";
import { getFileBuffer } from "../r2Storage";
import {
  generateBrandedProposalDraft,
  regenerateSingleChapter,
  type ChapterSlot,
} from "../engines/brandedProposalEngine";
import { assembleBrandedProposal } from "./brandedProposalAssembler";
import type { BrochureKnowledge } from "./brochureExtractor";

// Runtime tier values are "trial" / "solo" / "pro" / "team" — see
// server/services/stripe.ts TIER_CONFIG. Schema files say "business"
// but the live DB and all runtime writes use "team".
const ALLOWED_TIERS = ["pro", "team"] as const;

// ─── Helpers ─────────────────────────────────────────────────────────

async function getQuoteWithOrgAccess(quoteId: number, userId: number) {
  const org = await getUserPrimaryOrg(userId);
  if (org) {
    const quote = await getQuoteByIdAndOrg(quoteId, org.id);
    if (quote) return { quote, org };
  }
  // Fallback to user-based access for legacy data
  const quote = await getQuoteById(quoteId, userId);
  return { quote, org };
}

/**
 * Build tender text from a quote's inputs. Concatenates extracted text
 * from PDF/document inputs + dictation/text inputs. Skips audio inputs
 * (the dictation summary lives in the input.content field for those).
 */
async function gatherTenderText(quoteId: number): Promise<string> {
  const inputs = await getInputsByQuoteId(quoteId);
  const parts: string[] = [];

  for (const inp of inputs) {
    const inpAny = inp as any;
    // Skip reference materials (e.g. company brochure copies that some
    // users upload alongside the tender) — they're not the tender itself.
    if (inpAny.mimeType?.includes(";reference=true")) continue;

    if (inpAny.processedContent) {
      parts.push(inpAny.processedContent);
    } else if (inpAny.extractedText) {
      parts.push(inpAny.extractedText);
    } else if (inpAny.content) {
      parts.push(inpAny.content);
    }
  }

  return parts.join("\n\n---\n\n");
}

const ChapterSlotSchema = z.union([
  z.object({
    slotIndex: z.number(),
    slotName: z.string(),
    source: z.literal("embed"),
    brochurePageNumber: z.number(),
    reason: z.string(),
  }),
  z.object({
    slotIndex: z.number(),
    slotName: z.string(),
    source: z.literal("generate"),
    title: z.string(),
    body: z.string(),
  }),
]);

// ─── Router ──────────────────────────────────────────────────────────

export const brandedProposalRouter = router({
  /**
   * Phase 1 of the workflow: generate the chapter draft.
   *
   * Reads the tender text from the quote's inputs, reads the brochure
   * knowledge from the org, runs the engine. Returns the ordered slot
   * list ready for the workspace to display.
   */
  generateDraft: protectedProcedure
    .input(z.object({ quoteId: z.number() }))
    .mutation(async ({ ctx, input }) => {
      const { quote, org } = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
      if (!quote) throw new Error("Quote not found");
      if (!org) throw new Error("Organisation not found");

      const orgAny = org as any;
      if (!ALLOWED_TIERS.includes(orgAny.subscriptionTier)) {
        throw new Error(
          "Branded Proposals with brochure are available on Pro and Team plans.",
        );
      }

      const knowledge = orgAny.brochureKnowledge as BrochureKnowledge | null;
      if (!knowledge || orgAny.brochureDeletedAt) {
        throw new Error(
          "No brochure uploaded. Upload a brochure in Settings → Company Brochure to use this proposal mode.",
        );
      }

      const tenderText = await gatherTenderText(input.quoteId);
      if (!tenderText || tenderText.trim().length < 50) {
        throw new Error(
          "Not enough tender content to generate a proposal. Add the tender PDF or your dictation notes to this quote first.",
        );
      }

      const draft = await generateBrandedProposalDraft({
        tenderText,
        brochureKnowledge: knowledge,
      });

      // Log usage so it shows up alongside other AI actions in admin.
      await logUsage({
        orgId: org.id,
        userId: ctx.user.id,
        actionType: "branded_proposal_draft",
        creditsUsed: 5,
        metadata: {
          quoteId: input.quoteId,
          slotCount: draft.slots.length,
          embeddedSlotCount: draft.slots.filter((s) => s.source === "embed").length,
          tokenInput: draft.tokenUsage.inputTokens,
          tokenOutput: draft.tokenUsage.outputTokens,
        },
      });

      return {
        slots: draft.slots,
        tokenUsage: draft.tokenUsage,
      };
    }),

  /**
   * Phase 2 (optional, called from workspace): regenerate one chapter.
   *
   * Embedded chapters (brochure pages) cannot be regenerated — the
   * brochure page is fixed. Calling this on an embed slot returns the
   * slot unchanged with no AI cost.
   */
  regenerateChapter: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        slotIndex: z.number(),
        currentSlots: z.array(ChapterSlotSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { quote, org } = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
      if (!quote) throw new Error("Quote not found");
      if (!org) throw new Error("Organisation not found");

      const orgAny = org as any;
      if (!ALLOWED_TIERS.includes(orgAny.subscriptionTier)) {
        throw new Error("Branded Proposals are available on Pro and Team plans.");
      }

      const knowledge = orgAny.brochureKnowledge as BrochureKnowledge | null;
      if (!knowledge || orgAny.brochureDeletedAt) {
        throw new Error("No brochure uploaded.");
      }

      const tenderText = await gatherTenderText(input.quoteId);

      const result = await regenerateSingleChapter({
        slotIndex: input.slotIndex,
        currentSlots: input.currentSlots as ChapterSlot[],
        tenderText,
        brochureKnowledge: knowledge,
      });

      // Lighter usage log — single-chapter regen costs less than full draft.
      await logUsage({
        orgId: org.id,
        userId: ctx.user.id,
        actionType: "branded_proposal_regen_chapter",
        creditsUsed: 1,
        metadata: {
          quoteId: input.quoteId,
          slotIndex: input.slotIndex,
          tokenInput: result.tokenUsage.inputTokens,
          tokenOutput: result.tokenUsage.outputTokens,
        },
      });

      return result;
    }),

  /**
   * Phase 3 of the workflow: assemble the final PDF.
   *
   * No AI calls. Reads the brochure file from R2, runs the assembler,
   * returns the PDF as base64 (the client decodes to a Blob and
   * triggers a download).
   *
   * If the user manually edited any chapter bodies in the workspace,
   * those edits are reflected here because the slots payload comes
   * from the client's current state.
   */
  renderPdf: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        slots: z.array(ChapterSlotSchema),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const { quote, org } = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
      if (!quote) throw new Error("Quote not found");
      if (!org) throw new Error("Organisation not found");

      const orgAny = org as any;
      if (!ALLOWED_TIERS.includes(orgAny.subscriptionTier)) {
        throw new Error("Branded Proposals are available on Pro and Team plans.");
      }

      if (!orgAny.brochureFileKey || orgAny.brochureDeletedAt) {
        throw new Error(
          "Brochure no longer available — re-upload your brochure to render.",
        );
      }

      const brochureBuffer = await getFileBuffer(orgAny.brochureFileKey);
      const brochureBytes = new Uint8Array(brochureBuffer);

      const pdfBytes = await assembleBrandedProposal({
        brochurePdfBytes: brochureBytes,
        slots: input.slots as ChapterSlot[],
      });

      // Build a sensible filename: "<client-name> Proposal <ref>.pdf"
      const quoteAny = quote as any;
      const clientName = quoteAny.clientName?.trim() || "Proposal";
      const reference = quoteAny.reference?.trim() || `Q-${quote.id}`;
      const safeName = `${clientName} ${reference}`
        .replace(/[^a-zA-Z0-9 \-_]/g, "")
        .replace(/\s+/g, "_");
      const filename = `${safeName}.pdf`;

      // Convert to base64 for transport. Same pattern as the existing
      // generateDOCX endpoint.
      const base64 = Buffer.from(pdfBytes).toString("base64");

      await logUsage({
        orgId: org.id,
        userId: ctx.user.id,
        actionType: "branded_proposal_render",
        creditsUsed: 0, // No AI cost on render
        metadata: {
          quoteId: input.quoteId,
          slotCount: input.slots.length,
          pdfSizeBytes: pdfBytes.byteLength,
        },
      });

      return {
        base64,
        filename,
        sizeBytes: pdfBytes.byteLength,
      };
    }),
});
