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
import sharp from "sharp";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getUserPrimaryOrg,
  getQuoteByIdAndOrg,
  getQuoteById,
  getInputsByQuoteId,
  getLineItemsByQuoteId,
  logUsage,
} from "../db";
import { getFileBuffer } from "../r2Storage";
import {
  generateBrandedProposalDraft,
  regenerateSingleChapter,
  type ChapterSlot,
  type QuoteContext,
  type QuoteContextLineItem,
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

/**
 * Phase 4B Delivery D Phase 1 — assemble the structured quote context
 * the engine and assembler need. Called once at the top of every
 * endpoint that runs an AI step or renders a PDF; same shape passed
 * through so prompt builders and renderers don't each re-implement
 * decimal-string parsing or pricing-type filtering.
 *
 * Defensive parsing:
 *   - Decimal columns come out of Drizzle as strings; we parseFloat
 *     them once here so downstream code is dealing with numbers.
 *   - Unknown / null pricingType values default to "standard". This
 *     matches the existing pdfGenerator behaviour (see line ~661 of
 *     server/pdfGenerator.ts).
 *   - If parsing fails for any single line item field, we return 0
 *     for that field rather than throw — a single corrupt row
 *     shouldn't block proposal generation.
 */
async function gatherQuoteContext(
  quote: any,
  quoteId: number,
): Promise<QuoteContext> {
  const dbLineItems = await getLineItemsByQuoteId(quoteId);

  const lineItems: QuoteContextLineItem[] = dbLineItems.map((li: any) => {
    const rawType = (li.pricingType ?? "standard") as string;
    const normalisedType: QuoteContextLineItem["pricingType"] =
      rawType === "monthly" ||
      rawType === "annual" ||
      rawType === "optional"
        ? rawType
        : "standard";

    return {
      description: li.description ?? "",
      quantity: parseFloat(li.quantity ?? "0") || 0,
      unit: li.unit ?? "each",
      rate: parseFloat(li.rate ?? "0") || 0,
      total: parseFloat(li.total ?? "0") || 0,
      pricingType: normalisedType,
      sortOrder: typeof li.sortOrder === "number" ? li.sortOrder : 0,
    };
  });

  return {
    clientName: quote.clientName ?? null,
    contactName: quote.contactName ?? null,
    clientEmail: quote.clientEmail ?? null,
    title: quote.title ?? null,
    reference: quote.reference ?? null,
    taxRate: parseFloat(quote.taxRate ?? "0") || 0,
    lineItems,
  };
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

// ─── Logo fetch (Phase 4B Delivery E.3) ──────────────────────────────
//
// The supplier's company logo from Settings → Company Profile is
// embedded in the proposal cover. Logos are stored on R2 (uploaded
// via the uploadLogo tRPC mutation in routers.ts, which puts them in
// /api/file/{key} format).
//
// pdf-lib only supports PNG and JPEG natively. For any other format
// (SVG, WEBP, GIF, AVIF…) we run the bytes through sharp to convert
// to PNG before handing them to the assembler. Sharp is already a
// runtime dependency used by the colour extractor.
//
// All paths are best-effort. If the logo fetch fails, the file is
// missing or corrupt, or sharp can't decode it, we return null and
// the cover renders without a logo. Never block the render.

interface LogoBytes {
  bytes: Uint8Array;
  format: "png" | "jpeg";
}

/**
 * Detect image format from the first few bytes by magic number.
 * PNG: 89 50 4E 47    JPEG: FF D8 FF
 * Returns null for anything else (we'll feed those through sharp).
 */
function detectImageFormat(bytes: Uint8Array): "png" | "jpeg" | null {
  if (bytes.length < 4) return null;
  if (bytes[0] === 0x89 && bytes[1] === 0x50 && bytes[2] === 0x4e && bytes[3] === 0x47) {
    return "png";
  }
  if (bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff) {
    return "jpeg";
  }
  return null;
}

async function fetchAndNormaliseLogo(
  rawLogoUrl: string | null | undefined,
): Promise<LogoBytes | null> {
  if (!rawLogoUrl) return null;
  // Logos uploaded via Settings always land at /api/file/{key}. We
  // only support that format here — external URLs (legacy seed data,
  // manual DB edits) are skipped rather than risking an unbounded
  // outbound fetch from the render endpoint.
  if (!rawLogoUrl.startsWith("/api/file/")) {
    console.warn(
      "[brandedProposalRouter] Logo URL is not /api/file/{key}, skipping cover logo:",
      rawLogoUrl,
    );
    return null;
  }
  const key = rawLogoUrl.slice("/api/file/".length);

  let buffer: Buffer;
  try {
    buffer = await getFileBuffer(key);
  } catch (err) {
    console.warn(
      "[brandedProposalRouter] Failed to fetch logo bytes from R2, rendering without logo:",
      err,
    );
    return null;
  }

  const bytes = new Uint8Array(buffer);
  const detected = detectImageFormat(bytes);
  if (detected) {
    return { bytes, format: detected };
  }

  // Format we can't embed directly. Try sharp → PNG. Handles SVG,
  // WEBP, GIF, AVIF, TIFF and a few others. Any failure here means
  // the logo is genuinely unrenderable; we skip and the cover still
  // ships without it.
  try {
    const png = await sharp(buffer).png().toBuffer();
    return { bytes: new Uint8Array(png), format: "png" };
  } catch (err) {
    console.warn(
      "[brandedProposalRouter] sharp could not normalise logo to PNG, rendering without logo:",
      err,
    );
    return null;
  }
}

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

      // Phase 4B Delivery D Phase 1 — gather structured quote data
      // alongside the tender text. Plumbed into the engine but not yet
      // consumed by it (Phase 2 wires this into the cover and chapter
      // prompts so we stop saying "Your Organisation" and stop
      // inventing service specifics).
      const quoteContext = await gatherQuoteContext(quote, input.quoteId);

      const draft = await generateBrandedProposalDraft({
        tenderText,
        brochureKnowledge: knowledge,
        quoteContext,
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

      // Phase 4B Delivery D Phase 1 — same structured context the
      // initial draft endpoint receives. Phase 2 will use this to keep
      // regenerated chapters consistent with the line items.
      const quoteContext = await gatherQuoteContext(quote, input.quoteId);

      const result = await regenerateSingleChapter({
        slotIndex: input.slotIndex,
        currentSlots: input.currentSlots as ChapterSlot[],
        tenderText,
        brochureKnowledge: knowledge,
        quoteContext,
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

      // Phase 4B Delivery D Phase 1 — gather quote context for the
      // assembler. Phase 1 plumbs but doesn't render this; Phase 3
      // will use the line items to draw a real pricing table for
      // slot 15 (Pricing Summary).
      const quoteContext = await gatherQuoteContext(quote, input.quoteId);

      // Phase 4B Delivery E.3 — fetch the supplier company logo for
      // the cover. Best-effort. Any failure is logged and the render
      // proceeds without the logo (cover then matches its pre-E.3
      // appearance — title and subline only).
      const logo = await fetchAndNormaliseLogo(orgAny.companyLogo);

      // Phase 4B Delivery E.4 — resolve brand accent colour and
      // proposal orientation from the org record. Both are best-effort:
      // the assembler validates and falls back gracefully if either
      // is missing or unrecognised.
      //
      // Brand colour fallback chain mirrors the existing brandedProposal
      // renderer (Tile 2): the AI-extracted colour wins when present
      // (subjective brand identity), falling back to the logo-pixel
      // extracted colour, falling back to undefined (assembler then
      // uses the original dark-navy ink).
      const brandPrimaryHex: string | undefined =
        orgAny.brandExtractedPrimaryColor ||
        orgAny.brandPrimaryColor ||
        undefined;

      // proposalOrientation accepts 'auto' | 'portrait' | 'landscape'
      // at the schema level. 'auto' currently maps to 'portrait' (the
      // E.1 default — A4 portrait regardless of brochure shape). Any
      // unexpected value also maps to 'portrait' as a safe default.
      const orientationRaw = orgAny.proposalOrientation as string | null | undefined;
      const targetOrientation: "portrait" | "landscape" =
        orientationRaw === "landscape" ? "landscape" : "portrait";

      const pdfBytes = await assembleBrandedProposal({
        brochurePdfBytes: brochureBytes,
        slots: input.slots as ChapterSlot[],
        quoteContext,
        companyLogoBytes: logo?.bytes,
        companyLogoFormat: logo?.format,
        brandPrimaryHex,
        targetOrientation,
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
