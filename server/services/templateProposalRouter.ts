// server/services/templateProposalRouter.ts
//
// Phase 2 — tRPC sub-router for the v2.1 template library pipeline.
//
// Mounted at appRouter.templateProposal in routers.ts. Single endpoint
// for now: generateBrandedProposalV2. The "V2" suffix avoids stepping on
// the existing generateBrandedProposal procedure in routers.ts; both
// coexist while the picker UI (Phase 3) migrates users across.
//
// Endpoint flow:
//   1. Resolve quote + organisation via the org-then-user fallback used
//      across the rest of the codebase.
//   2. Pro/Team tier gate (defence-in-depth — the picker also gates).
//   3. Resolve effective templateId via the cascade: explicit override →
//      stored per-quote choice → sector default.
//   4. Persist the chosen templateId on the quote when explicitly
//      supplied (so re-generation remembers the user's pick).
//   5. Load line items, build slot content deterministically from
//      quote/lineItems/org data.
//   6. Call templateRenderer → PDF Buffer.
//   7. Return base64-encoded PDF to the client (mirrors how generatePDF
//      delivers results — keeps client wrapping code consistent).
//
// This file depends only on Phase 1 + Phase 2 modules. It does NOT
// import any AI helpers, the brochure-embed engine, or the deprecated
// brandedProposalRenderer. Hot paths stay clean.

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getQuoteById,
  getQuoteByIdAndOrg,
  getUserPrimaryOrg,
  getLineItemsByQuoteId,
  updateQuote,
} from "../db";

import { renderTemplate } from "./templateRenderer";
import {
  validateTemplateId,
  tradePresetToSector,
  type SectorId,
} from "./templateLibrary";
import { buildSlotContent } from "./slotContentBuilder";

// ── Constants ───────────────────────────────────────────────────────

/** Branded templates are a Pro+ feature. Defence-in-depth — the picker
 *  also gates by tier before the call reaches this endpoint. */
const ALLOWED_TIERS = ["pro", "team"] as const;

/** Default style picked when neither the quote nor explicit input
 *  specifies one. Split Screen ships clean across every QA palette and
 *  sector, so it's the safest stock pick. */
const DEFAULT_STYLE_ID = "01-split-screen";

/** Default sector when the organisation has no trade preset set.
 *  IT Services has the deepest QA coverage. */
const DEFAULT_SECTOR_ID: SectorId = "it-services";

// ── Helpers ─────────────────────────────────────────────────────────

async function getQuoteWithOrgAccess(quoteId: number, userId: number) {
  const org = await getUserPrimaryOrg(userId);
  if (org) {
    const quote = await getQuoteByIdAndOrg(quoteId, org.id);
    if (quote) return { quote, org };
  }
  const quote = await getQuoteById(quoteId, userId);
  return { quote, org };
}

/**
 * Resolve which template to render. Cascade:
 *   1. Explicit override on this call
 *   2. Stored per-quote choice
 *   3. Sector default — derived from org.tradePreset paired with
 *      DEFAULT_STYLE_ID. A fresh quote with no choice ever made still
 *      gets a sector-appropriate template instead of arbitrary fallback.
 */
function resolveTemplateId(args: {
  inputTemplateId?: string;
  quoteTemplateId?: string | null;
  orgTradePreset?: string | null;
}): { templateId: string; source: "explicit" | "quote" | "sector-default" } {
  if (args.inputTemplateId && validateTemplateId(args.inputTemplateId)) {
    return { templateId: args.inputTemplateId, source: "explicit" };
  }
  if (args.quoteTemplateId && validateTemplateId(args.quoteTemplateId)) {
    return { templateId: args.quoteTemplateId, source: "quote" };
  }
  const sector = tradePresetToSector(args.orgTradePreset) ?? DEFAULT_SECTOR_ID;
  return {
    templateId: `${sector}/${DEFAULT_STYLE_ID}`,
    source: "sector-default",
  };
}

// ── Router ──────────────────────────────────────────────────────────

export const templateProposalRouter = router({
  /**
   * Generate a branded proposal PDF using the v2.1 template library.
   * Returns the PDF as a base64 string the client can turn into a Blob
   * for download / preview.
   */
  generateBrandedProposalV2: protectedProcedure
    .input(
      z.object({
        quoteId: z.number(),
        /** Template id in "sector/style" form, e.g.
         *  "it-services/01-split-screen". Optional — falls back to the
         *  stored per-quote choice, then to the sector default. */
        templateId: z.string().optional(),
      }),
    )
    .mutation(async ({ ctx, input }) => {
      const startedAt = Date.now();
      console.log(
        "[generateBrandedProposalV2]",
        "quoteId:", input.quoteId,
        "templateId:", input.templateId ?? "(default)",
        "userId:", ctx.user.id,
      );

      // 1. Quote + org access
      const { quote, org } = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
      if (!quote) {
        throw new Error("Quote not found");
      }
      if (!org) {
        throw new Error("No organisation found for this user");
      }

      // 2. Tier gate
      const tier = org.subscriptionTier;
      if (!tier || !(ALLOWED_TIERS as readonly string[]).includes(tier)) {
        throw new Error(
          "Branded templates are a Pro feature. Upgrade to Pro to use designed templates.",
        );
      }

      // 3. Resolve effective templateId
      const { templateId, source } = resolveTemplateId({
        inputTemplateId: input.templateId,
        quoteTemplateId: quote.proposalTemplateV2 ?? null,
        orgTradePreset: quote.tradePreset ?? null,
      });
      console.log(
        "[generateBrandedProposalV2] effective template:",
        templateId, "(from:", source + ")",
      );

      // 4. Persist explicit choice when it differs from what's stored
      if (
        input.templateId &&
        input.templateId === templateId &&
        input.templateId !== (quote.proposalTemplateV2 ?? null)
      ) {
        try {
          await updateQuote(input.quoteId, ctx.user.id, {
            proposalTemplateV2: input.templateId,
          });
        } catch (err) {
          console.warn(
            "[generateBrandedProposalV2] Failed to persist template choice:", err,
          );
          // Non-fatal — render proceeds; user re-picks next time.
        }
      }

      // 5. Line items + slot content
      const lineItems = await getLineItemsByQuoteId(input.quoteId);
      const slotContent = buildSlotContent({
        quote: {
          id: quote.id,
          reference: quote.reference,
          title: quote.title,
          description: quote.description,
          terms: quote.terms,
          clientName: quote.clientName,
          clientAddress: quote.clientAddress,
          subtotal: quote.subtotal,
          taxRate: quote.taxRate,
          taxAmount: quote.taxAmount,
          total: quote.total,
          monthlyTotal: quote.monthlyTotal,
        },
        organization: {
          name: org.name,
          companyName: org.companyName,
          companyAddress: org.companyAddress,
          companyPhone: org.companyPhone,
          companyEmail: org.companyEmail,
          companyWebsite: org.companyWebsite,
          defaultTerms: org.defaultTerms,
        },
        lineItems: lineItems.map((li) => ({
          id: li.id,
          description: li.description,
          quantity: li.quantity,
          unit: li.unit,
          rate: li.rate,
          total: li.total,
          pricingType: li.pricingType ?? null,
        })),
      });

      // 6. Render — brand colours + logo straight off the org row.
      //    Accent is null until Phase 3 adds the schema column +
      //    picker UI; colourUtils derives one from the primary.
      const result = await renderTemplate({
        templateId,
        brand: {
          primary: org.brandPrimaryColor,
          secondary: org.brandSecondaryColor,
          accent: null,
        },
        slotContent,
        logoUrl: org.companyLogo,
      });

      const totalMs = Date.now() - startedAt;
      console.log(
        "[generateBrandedProposalV2] rendered",
        result.pdf.length, "bytes in", result.durationMs + "ms",
        "(total endpoint time:", totalMs + "ms)",
        "template:", templateId,
      );

      // 7. Return base64-encoded PDF.
      return {
        pdfBase64: result.pdf.toString("base64"),
        templateId,
        templateSource: source,
        renderedAt: new Date().toISOString(),
        sizeBytes: result.pdf.length,
        durationMs: result.durationMs,
      };
    }),
});
