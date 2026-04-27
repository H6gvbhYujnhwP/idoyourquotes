/**
 * ExportFormatPickerModal.tsx
 *
 * Phase 4A — Delivery 6 (initial), Delivery 7 (Contract/Tender live),
 * Delivery 32 (live preview thumbnail), Delivery 33 (this delivery).
 *
 * Shown when a Pro / Team tier user clicks "Generate PDF" on the quote
 * workspace. Now presents two export format options as cards:
 *
 *   1. Quick quote        — active. Fires the existing basic PDF flow.
 *                           Tagged "All plans" — available on every
 *                           tier including Solo / Trial.
 *   2. Contract / Tender  — active. Opens the Brand Choice modal which
 *                           handles branded proposal generation. Tagged
 *                           "Pro · Team" so the tier requirement reads
 *                           at a glance. The preview thumbnail is a
 *                           live inline SVG (CoverPreviewSVG) that
 *                           reflects the new white-strip-on-top cover
 *                           layout and shows the user's actual logo +
 *                           brand-primary the moment they're set on
 *                           the org.
 *
 * Delivery 33 — tier pill placement:
 *   The "Pro" badge previously sat as an absolute overlay on the
 *   thumbnail's top-right corner, which collided with the cover's
 *   ref block (Q-XXX / Date / Prepared for / CONFIDENTIAL) the moment
 *   the live preview replaced the static .webp. Both tiles now carry
 *   a header chip pill at the top of the card body — out of the
 *   thumbnail entirely — and the pill copy spells out the full tier
 *   list rather than just "Pro".
 *
 * Removed in Delivery 32:
 *   - The Project / Migration "coming soon" tile. The 8-section
 *     migration appendix that was the original use-case for that tile
 *     ships inside the Contract / Tender flow today (Deliveries 27–29),
 *     so a separate format card was redundant. Removing it also lets
 *     the modal drop from a 3-up to a cleaner 2-up grid.
 *   - The static showcase thumbnails (it-modern-thumb.webp etc.).
 *     They're still used by the marketing pages — see
 *     PROPOSAL_SHOWCASES in client/src/lib/proposalShowcaseAssets.ts.
 *
 * Solo / Trial users do NOT see this modal — they see the Solo
 * upgrade modal from Delivery 5 instead. Tier routing happens in the
 * QuoteWorkspace's handleGeneratePDFClick.
 */
import { useEffect } from "react";
import {
  X,
  FileText,
  Sparkles,
  ArrowRight,
} from "lucide-react";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";
import CoverPreviewSVG from "@/components/CoverPreviewSVG";

interface ExportFormatPickerModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×] button). */
  onDismiss: () => void;
  /** Fires when the user picks the Quick quote card. */
  onSelectQuickQuote: () => void;
  /**
   * Fires when the user picks the Contract/Tender card.
   * Parent (QuoteWorkspace) closes this picker and opens the Brand
   * Choice modal.
   */
  onSelectContractTender: () => void;
  /**
   * Sector hint accepted for backward-compat with QuoteWorkspace's
   * call site. No longer used internally — the live SVG preview is
   * driven by org branding rather than by sector. Kept in the
   * interface to avoid touching the (locked) QuoteWorkspace JSX.
   */
  sectorHint?: string | null;
}

// ── Hex helper — only used to validate brand colours before passing
// them to the preview SVG, which has its own internal fallbacks too. ─
function isValidHex(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

export default function ExportFormatPickerModal({
  open,
  onDismiss,
  onSelectQuickQuote,
  onSelectContractTender,
}: ExportFormatPickerModalProps) {
  // Esc closes. Match the overlay-click-to-close behaviour below. Bound
  // only while open to avoid leaking listeners across the app lifecycle.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onDismiss]);

  // Pull the org so the Contract/Tender preview can render the user's
  // actual logo + brand-primary. Same query BrandChoiceModal already
  // uses, so when both modals are mounted in sequence tRPC dedupes.
  const { data: orgProfile } = trpc.auth.orgProfile.useQuery(undefined, {
    enabled: open,
  });

  // Resolve the brand tokens the preview needs. Read priority mirrors
  // the BrandChoiceModal's readBrandTokens helper: web-extracted hex
  // first (when present), then logo-pixel hex, else null. The preview
  // component falls back to brand.navy internally if both are missing.
  const logoUrl =
    ((orgProfile as { companyLogo?: string | null } | undefined)
      ?.companyLogo as string | null) || null;
  const companyName =
    (orgProfile as { companyName?: string } | undefined)?.companyName || "";
  const extractedPrimary = (orgProfile as { brandExtractedPrimaryColor?: string | null } | undefined)
    ?.brandExtractedPrimaryColor;
  const logoPrimary = (orgProfile as { brandPrimaryColor?: string | null } | undefined)
    ?.brandPrimaryColor;
  const previewPrimary = isValidHex(extractedPrimary)
    ? extractedPrimary
    : isValidHex(logoPrimary)
      ? logoPrimary
      : null;
  const extractedSecondary = (orgProfile as { brandExtractedSecondaryColor?: string | null } | undefined)
    ?.brandExtractedSecondaryColor;
  const logoSecondary = (orgProfile as { brandSecondaryColor?: string | null } | undefined)
    ?.brandSecondaryColor;
  const previewSecondary = isValidHex(extractedSecondary)
    ? extractedSecondary
    : isValidHex(logoSecondary)
      ? logoSecondary
      : null;

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-format-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[760px] max-w-[94vw] my-6 relative"
        style={{ border: `1px solid ${brand.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-slate-100"
          style={{ color: brand.navyMuted }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-5">
          <h2
            id="export-format-title"
            className="text-xl font-bold leading-snug"
            style={{ color: brand.navy }}
          >
            How should this quote go out?
          </h2>
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            Pick a format for this client. Your choice here only affects
            this one document — you can pick differently next time.
          </p>
        </div>

        {/* Cards — Delivery 32 dropped the third "coming soon" tile so
            the layout is now 2-up. */}
        <div className="px-8 pb-7">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {/* ── Card 1: Quick quote (active) ── */}
            <button
              type="button"
              onClick={onSelectQuickQuote}
              className="text-left rounded-xl p-5 transition-all hover:shadow-md group flex flex-col"
              style={{
                backgroundColor: brand.white,
                border: `2px solid ${brand.tealBorder}`,
                boxShadow: brand.shadow,
              }}
            >
              {/* Tier pill row — Quick Quote is available on every
                  paid tier including Solo, signposted by the muted
                  "All plans" badge. Solo / Trial users actually reach
                  this modal via the SoloUpgradeModal's "Download basic
                  PDF" fall-through, so the badge speaks to them too. */}
              <div className="flex justify-end mb-2">
                <span
                  className="inline-flex items-center text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded"
                  style={{
                    backgroundColor: brand.slate,
                    color: brand.navyMuted,
                  }}
                >
                  All plans
                </span>
              </div>
              <div
                className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                style={{ backgroundColor: brand.tealBg }}
              >
                <FileText
                  className="w-5 h-5"
                  style={{ color: brand.teal }}
                />
              </div>
              <div
                className="text-sm font-bold mb-1"
                style={{ color: brand.navy }}
              >
                Quick quote
              </div>
              <div
                className="text-xs leading-relaxed flex-1"
                style={{ color: brand.navyMuted }}
              >
                Standard PDF with your logo, line items, totals, and
                terms. Ready in seconds.
              </div>
              <div
                className="text-xs font-semibold mt-3 flex items-center gap-1 transition-transform group-hover:translate-x-0.5"
                style={{ color: brand.teal }}
              >
                Choose this
                <ArrowRight className="w-3.5 h-3.5" />
              </div>
            </button>

            {/* ── Card 2: Contract / Tender (active) ── */}
            <button
              type="button"
              onClick={onSelectContractTender}
              className="text-left rounded-xl overflow-hidden transition-all hover:shadow-md group flex flex-col"
              style={{
                backgroundColor: brand.white,
                border: `1px solid ${brand.border}`,
                boxShadow: brand.shadow,
              }}
            >
              {/* Live preview — shows the new white-strip cover layout
                  with the user's logo + brand-primary the moment those
                  are available, or a "Your Logo" placeholder otherwise.
                  Critically the placeholder must NEVER fall back to
                  the company name — that's a deliberate departure
                  from the actual PDF cover's wordmark fallback (see
                  CoverPreviewSVG.tsx for the full rationale). */}
              <div
                className="relative w-full overflow-hidden"
                style={{
                  aspectRatio: "4 / 3",
                  backgroundColor: brand.white,
                  borderBottom: `1px solid ${brand.border}`,
                }}
              >
                <CoverPreviewSVG
                  logoUrl={logoUrl}
                  companyName={companyName}
                  primaryColor={previewPrimary}
                  secondaryColor={previewSecondary}
                />
              </div>
              <div className="p-5 flex-1 flex flex-col">
                {/* Tier pill row — Contract / Tender is the branded
                    proposal flow and requires a Pro or Team tier
                    subscription. Solo / Trial users would not reach
                    this card directly (QuoteWorkspace routes them to
                    SoloUpgradeModal first), but the explicit pill
                    makes the tier mapping legible at a glance for
                    anyone evaluating which option to pick. */}
                <div className="flex justify-end mb-2">
                  <span
                    className="inline-flex items-center gap-1 text-[10px] font-bold tracking-wide uppercase px-2 py-0.5 rounded"
                    style={{
                      backgroundColor: brand.teal,
                      color: brand.white,
                    }}
                  >
                    <Sparkles className="w-2.5 h-2.5" />
                    Pro · Team
                  </span>
                </div>
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center mb-3"
                  style={{ backgroundColor: brand.tealBg }}
                >
                  <Sparkles
                    className="w-5 h-5"
                    style={{ color: brand.teal }}
                  />
                </div>
                <div
                  className="text-sm font-bold mb-1"
                  style={{ color: brand.navy }}
                >
                  Contract / Tender
                </div>
                <div
                  className="text-xs leading-relaxed flex-1"
                  style={{ color: brand.navyMuted }}
                >
                  Multi-page branded proposal with cover, exec summary,
                  pricing, and signature. Your logo and brand colours
                  are applied automatically.
                </div>
                <div
                  className="text-xs font-semibold mt-3 flex items-center gap-1 transition-transform group-hover:translate-x-0.5"
                  style={{ color: brand.teal }}
                >
                  Choose this
                  <ArrowRight className="w-3.5 h-3.5" />
                </div>
              </div>
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
