// server/services/templateProposalRouter.ts
//
// tRPC sub-router for the v2.1 template library pipeline.
//
// Mounted at appRouter.templateProposal in routers.ts. Single endpoint:
// generateBrandedProposalV2. The "V2" suffix avoids stepping on the
// existing generateBrandedProposal procedure in routers.ts; both coexist
// while the picker UI migrates users across.
//
// Endpoint flow:
//   1. Resolve quote + organisation via the org-then-user fallback used
//      across the rest of the codebase.
//   2. Pro/Team tier gate (defence-in-depth — the picker also gates).
//   3. Resolve effective templateId via the cascade: explicit override →
//      stored per-quote choice → sector default.
//   4. Persist the chosen templateId on the quote when explicitly
//      supplied (so re-generation remembers the user's pick).
//   5. Load line items + build slot content. Phase 2.5: the narrative
//      blocks (about/summary/methodology) are AI-written when the org's
//      plan allows it; slotContentBuilder falls back to deterministic
//      prose on any failure.
//   6. Call templateRenderer → PDF Buffer.
//   7. DELIVERY (the important bit — see DELIVERY ARCHITECTURE below):
//      upload the PDF to R2 and return a SMALL JSON payload containing
//      a /api/file/<key> URL. The client downloads the binary directly
//      from that route. Base64-over-tRPC is retained ONLY as a fallback
//      for environments where R2 isn't configured.
//
// ── DELIVERY ARCHITECTURE — why this changed ────────────────────────
//
// The original step 7 returned the PDF as a base64 string inside the
// tRPC JSON response. In production this failed with a client-side
// "Failed to fetch": a 2.85MB PDF becomes ~3.8MB as base64, wrapped in
// superjson/tRPC JSON, buffered whole on both ends, ~3.36MB on the wire
// and ~8s end to end. The browser fetch dropped the connection before
// the large, slow response completed (a network-layer TypeError, not
// an HTTP error).
//
// Fix: stop shipping binaries through tRPC. The codebase already serves
// every other file (logos, brochures, quote inputs) via R2 + the
// authenticated /api/file/<key> Express route, which streams with the
// correct Content-Type and no base64 inflation. We reuse exactly that
// path: render → uploadToR2() → return { fileUrl }. The tRPC response
// drops from ~3.36MB to a few hundred bytes and completes instantly;
// the browser streams the PDF from /api/file like it already does for
// the org logo.
//
// Backward-compatible response: the payload still includes templateId /
// templateSource / sizeBytes / durationMs, ADDS fileUrl, and only
// includes pdfBase64 when R2 is unconfigured (so dev/test environments
// without R2 still work). The client prefers fileUrl and falls back to
// pdfBase64 if fileUrl is absent.

import { z } from "zod";
import { router, protectedProcedure } from "../_core/trpc";
import {
  getQuoteById,
  getQuoteByIdAndOrg,
  getUserPrimaryOrg,
  getLineItemsByQuoteId,
  updateQuote,
  logUsage,
} from "../db";

import { renderTemplate } from "./templateRenderer";
import {
  validateTemplateId,
  tradePresetToSector,
  SECTOR_META,
  SECTORS,
  type SectorId,
} from "./templateLibrary";
import { buildSlotContent } from "./slotContentBuilder";
import { canUseAIFeatures } from "./stripe";
import { uploadToR2, isR2Configured } from "../r2Storage";

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

/** R2 folder the branded proposal PDFs live under. Keyed by org so a
 *  later cleanup / quota job can scope by tenant. */
const R2_FOLDER = "branded-proposals";

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

/** A filesystem-safe slug for the templateId, used in the R2 filename
 *  (templateId is "<sector>/<style>" — the slash can't go in a name). */
function templateSlug(templateId: string): string {
  return templateId.replace(/[^a-zA-Z0-9._-]+/g, "-");
}

// ── Router ──────────────────────────────────────────────────────────

export const templateProposalRouter = router({
  /**
   * Generate a branded proposal PDF using the v2.1 template library.
   *
   * Returns a small JSON payload. The PDF itself is delivered out of
   * band via R2 + the /api/file route (see DELIVERY ARCHITECTURE at
   * the top of this file). `fileUrl` is the download path; `pdfBase64`
   * is only present as a fallback when R2 is unconfigured.
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

      // Phase 2.5 — narrative context for AI-written about/summary/
      // methodology. The sector is derived from the already-resolved
      // effective templateId ("<sector>/<style>"), so the prose framing
      // always matches the design the user actually picked. AI is gated
      // by canUseAIFeatures as defence-in-depth on top of the Pro/Team
      // tile gate; if it's not allowed for any reason the builder
      // silently falls back to the deterministic Phase 2 prose — a
      // proposal never fails to generate because AI was unavailable.
      const sectorFromTemplate = templateId.split("/")[0];
      const sectorId: SectorId = (SECTORS as readonly string[]).includes(
        sectorFromTemplate,
      )
        ? (sectorFromTemplate as SectorId)
        : (tradePresetToSector(quote.tradePreset ?? null) ?? "it-services");
      // Cast mirrors assertAIAccess in routers.ts — the resolved org
      // type widens these fields to nullable, but canUseAIFeatures
      // handles the runtime values fine. Same pattern, same `as any`.
      const aiCheck = canUseAIFeatures(org as any);
      const aiEnabled = aiCheck.allowed;
      console.log(
        "[generateBrandedProposalV2] AI narrative:",
        aiEnabled ? "enabled" : "disabled",
        aiEnabled ? "" : "(" + (aiCheck.reason ?? "not allowed") + ")",
        "sector:", sectorId,
      );

      const slotContent = await buildSlotContent({
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
        narrative: {
          aiEnabled,
          sectorLabel: SECTOR_META[sectorId]?.name ?? null,
        },
      });

      // Phase 2.5 — log AI narrative spend so it shows in usage like
      // the other AI features. Only when AI was actually attempted;
      // non-fatal if the insert fails.
      if (aiEnabled) {
        try {
          await logUsage({
            orgId: org.id,
            userId: ctx.user.id,
            actionType: "branded_proposal_ai_narrative",
            creditsUsed: 1,
            metadata: { quoteId: input.quoteId, templateId, sector: sectorId },
          });
        } catch (err) {
          console.warn(
            "[generateBrandedProposalV2] Failed to log AI usage:", err,
          );
        }
      }

      // 6. Render — brand colours + logo straight off the org row.
      //    Accent is null until a later phase adds the schema column +
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

      console.log(
        "[generateBrandedProposalV2] rendered",
        result.pdf.length, "bytes in", result.durationMs + "ms",
        "template:", templateId,
      );

      // 7. DELIVERY — upload to R2, return a small JSON payload with a
      //    /api/file URL. See DELIVERY ARCHITECTURE at top of file.
      //
      //    The previous base64-in-tRPC approach is retained ONLY as a
      //    fallback for environments without R2 configured, so dev/test
      //    don't break. In production (R2 configured) the response is a
      //    few hundred bytes and the browser streams the binary from
      //    the existing authenticated /api/file route.
      const renderedAt = new Date().toISOString();

      if (isR2Configured()) {
        try {
          const filename =
            `proposal-${input.quoteId}-${templateSlug(templateId)}.pdf`;
          const { url, key } = await uploadToR2(
            result.pdf,
            filename,
            "application/pdf",
            `${R2_FOLDER}/${org.id}`,
          );

          const totalMs = Date.now() - startedAt;
          console.log(
            "[generateBrandedProposalV2] uploaded to R2",
            "key:", key,
            "(", result.pdf.length, "bytes,",
            "total endpoint time:", totalMs + "ms)",
          );

          // Small payload — no binary on the tRPC wire.
          return {
            fileUrl: url, // "/api/file/branded-proposals/<orgId>/<...>.pdf"
            // pdfBase64 intentionally omitted — fileUrl is the channel.
            pdfBase64: null as string | null,
            templateId,
            templateSource: source,
            renderedAt,
            sizeBytes: result.pdf.length,
            durationMs: result.durationMs,
          };
        } catch (err) {
          // R2 is configured but the upload failed (transient network,
          // creds, quota). Don't fail the whole generation — fall back
          // to base64 so the user still gets their PDF. Logged loudly
          // because a persistent failure here means every proposal is
          // taking the fragile path.
          console.error(
            "[generateBrandedProposalV2] R2 upload failed — falling back " +
              "to base64 delivery:",
            err instanceof Error ? err.message : err,
          );
        }
      } else {
        console.warn(
          "[generateBrandedProposalV2] R2 not configured — using base64 " +
            "fallback delivery. Configure R2 for robust large-PDF delivery.",
        );
      }

      // Fallback path: base64 over tRPC (legacy behaviour). Only reached
      // when R2 is unconfigured or the upload threw.
      const totalMs = Date.now() - startedAt;
      console.log(
        "[generateBrandedProposalV2] base64 fallback delivery",
        "(", result.pdf.length, "bytes,",
        "total endpoint time:", totalMs + "ms)",
        "template:", templateId,
      );

      return {
        fileUrl: null as string | null,
        pdfBase64: result.pdf.toString("base64"),
        templateId,
        templateSource: source,
        renderedAt,
        sizeBytes: result.pdf.length,
        durationMs: result.durationMs,
      };
    }),
});
