/**
 * ExportFormatPickerModal.tsx
 *
 * Phase 4A — Delivery 6 (initial), Delivery 7 (Contract/Tender live),
 * Delivery 32 (live preview thumbnail), Delivery 33 (tier pill placement).
 *
 * Phase 4B Delivery C — three-tile picker.
 *   - Tile 2 relabelled from "Contract / Tender" to "Use a branded
 *     colour template". Existing wiring unchanged: it still routes to
 *     BrandChoiceModal in QuoteWorkspace via onSelectContractTender.
 *   - New Tile 3: "Branded with your artwork and company story".
 *     Carries a NEW chip alongside the PRO·TEAM tier chip. Routes
 *     through onSelectBrandedProposal in QuoteWorkspace, which decides
 *     between (a) opening BrochureUploadModal first-run or (b)
 *     navigating straight to /branded-proposal/:quoteId based on
 *     whether the org has a brochure uploaded.
 *
 * Phase 4B Tile-2-retirement delivery — Tile 2 card removed from the
 * picker entirely. The picker now offers two paths:
 *   - Standard quote (Tile 1) — standard PDF with logo + line items.
 *     Title relabelled from "Quick quote" in the Custom-Sections
 *     delivery; pairs more cleanly with "Branded" and matches the
 *     body copy ("Standard PDF with your logo…").
 *   - Branded with your artwork and company story (Tile 3) — multi-
 *     chapter proposal built from the user's own brochure.
 * Grid drops from 3-up to 2-up; modal width tightens from 920 to 720
 * so the two remaining cards keep balanced proportions rather than
 * stretching across the full original frame. The backend that
 * powered Tile 2 (BrandChoiceModal, BrandedTemplatePickerV2, 24
 * designed templates, slot content builder, template proposal
 * router, design picker + stat-strip toggle in Settings) stays
 * intact on this round so the cut is fully reversible from the UI
 * side; cleanup of the dormant backend happens in a later delivery
 * once we're sure.
 *
 * The onSelectContractTender prop stays in the interface because the
 * locked QuoteWorkspace.tsx still passes it (handlePickerSelect-
 * ContractTender remains wired to the dormant BrandChoiceModal). We
 * accept the prop and ignore it — nothing inside the picker calls
 * it any more. Same backward-compat pattern as sectorHint.
 *
 * Shown when a Pro / Team tier user clicks "Generate PDF" on the quote
 * workspace. Solo / Trial users never reach this modal — they're
 * intercepted by SoloUpgradeModal upstream in handleGeneratePDFClick.
 *
 * Removed in Delivery 32:
 *   - The Project / Migration "coming soon" tile (its 8-section
 *     migration appendix ships inside the Contract / Tender flow).
 *   - The static showcase thumbnails (it-modern-thumb.webp etc.).
 *     They're still used by the marketing pages — see
 *     PROPOSAL_SHOWCASES in client/src/lib/proposalShowcaseAssets.ts.
 */
import { useEffect } from "react";
import {
  X,
  FileText,
  Sparkles,
  ArrowRight,
  BookOpen,
  Wand2,
} from "lucide-react";
import { brand } from "@/lib/brandTheme";

interface ExportFormatPickerModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×] button). */
  onDismiss: () => void;
  /** Fires when the user picks the Quick quote card. */
  onSelectQuickQuote: () => void;
  /**
   * Legacy Tile 2 ("Use a branded colour template") selection callback.
   * Kept in the interface so the locked QuoteWorkspace.tsx can keep
   * passing it without a parent edit — the picker UI no longer offers
   * Tile 2, so this is never invoked from inside the modal. Removed
   * for good in a later delivery when the locked-file lock is broken
   * to clean up the workspace-side BrandChoiceModal wiring.
   */
  onSelectContractTender?: () => void;
  /**
   * Phase 4B Delivery C — fires when the user picks the new
   * "Branded with your artwork and company story" card. Parent decides
   * whether to open the BrochureUploadModal first (no brochure yet) or
   * navigate straight to the Branded Proposal Workspace.
   */
  onSelectBrandedProposal: () => void;
  /**
   * Sector hint accepted for backward-compat with QuoteWorkspace's
   * call site. No longer used internally — the live SVG preview that
   * previously consumed it was removed alongside Tile 2. Kept in the
   * interface to avoid touching the (locked) QuoteWorkspace JSX.
   */
  sectorHint?: string | null;
}

export default function ExportFormatPickerModal({
  open,
  onDismiss,
  onSelectQuickQuote,
  onSelectBrandedProposal,
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
        className="bg-white rounded-2xl shadow-2xl w-[720px] max-w-[94vw] my-6 relative"
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

        {/* Cards — 2-up on desktop, 1-up on mobile. Tile 2 retired in
            the Tile-2-retirement delivery; the two remaining cards are
            Quick quote and Branded with your artwork and company story. */}
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
              {/* Tier pill row — Quick Quote is available on every paid
                  tier including Solo, signposted by the muted "All
                  plans" badge. Solo / Trial users actually reach this
                  modal via SoloUpgradeModal's "Download basic PDF" fall-
                  through, so the badge speaks to them too. */}
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
                Standard quote
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

            {/* ── Card 2: Branded with your artwork and company story ── */}
            {/* Phase 4B Delivery C — routes through onSelectBrandedProposal
                in QuoteWorkspace, which checks brochure presence and either
                opens BrochureUploadModal (first-run) or navigates straight
                to /branded-proposal/:quoteId. After the Tile-2-retirement
                delivery this is the only branded path on offer. */}
            <button
              type="button"
              onClick={onSelectBrandedProposal}
              className="text-left rounded-xl overflow-hidden transition-all hover:shadow-md group flex flex-col relative"
              style={{
                backgroundColor: brand.white,
                border: `1px solid ${brand.border}`,
                boxShadow: brand.shadow,
              }}
            >
              {/* Decorative visual block — stylised "your brochure
                  pages woven into a designed proposal" feel without
                  needing a real preview image. Two layered card
                  silhouettes plus a Wand icon on a soft teal tint. */}
              <div
                className="relative w-full overflow-hidden flex items-center justify-center"
                style={{
                  aspectRatio: "4 / 3",
                  background: `linear-gradient(135deg, ${brand.tealBg} 0%, ${brand.white} 70%)`,
                  borderBottom: `1px solid ${brand.border}`,
                }}
              >
                {/* Back card — represents a brochure page */}
                <div
                  className="absolute"
                  style={{
                    width: "44%",
                    height: "62%",
                    top: "18%",
                    left: "20%",
                    backgroundColor: brand.white,
                    border: `1px solid ${brand.tealBorder}`,
                    borderRadius: "6px",
                    transform: "rotate(-6deg)",
                    boxShadow: brand.shadow,
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      top: "12%",
                      left: "12%",
                      right: "12%",
                      height: "18%",
                      backgroundColor: brand.tealBg,
                      borderRadius: "3px",
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      top: "38%",
                      left: "12%",
                      right: "30%",
                      height: "6%",
                      backgroundColor: brand.borderLight,
                      borderRadius: "2px",
                    }}
                  />
                  <div
                    className="absolute"
                    style={{
                      top: "50%",
                      left: "12%",
                      right: "20%",
                      height: "6%",
                      backgroundColor: brand.borderLight,
                      borderRadius: "2px",
                    }}
                  />
                </div>
                {/* Front card — represents the AI-generated narrative page */}
                <div
                  className="absolute"
                  style={{
                    width: "44%",
                    height: "62%",
                    top: "20%",
                    left: "38%",
                    backgroundColor: brand.white,
                    border: `1px solid ${brand.border}`,
                    borderRadius: "6px",
                    transform: "rotate(5deg)",
                    boxShadow: brand.shadow,
                  }}
                >
                  <div
                    className="absolute"
                    style={{
                      top: "14%",
                      left: "14%",
                      width: "22%",
                      height: "8%",
                      backgroundColor: brand.teal,
                      borderRadius: "2px",
                    }}
                  />
                  {[28, 38, 48, 58, 68, 78].map((top) => (
                    <div
                      key={top}
                      className="absolute"
                      style={{
                        top: `${top}%`,
                        left: "14%",
                        right: top % 20 === 8 ? "30%" : "14%",
                        height: "4%",
                        backgroundColor: brand.borderLight,
                        borderRadius: "1px",
                      }}
                    />
                  ))}
                </div>
                {/* Wand badge — the "AI-woven" cue */}
                <div
                  className="absolute rounded-full flex items-center justify-center shadow-md"
                  style={{
                    width: "44px",
                    height: "44px",
                    bottom: "12%",
                    right: "12%",
                    backgroundColor: brand.teal,
                  }}
                >
                  <Wand2 className="w-5 h-5" style={{ color: brand.white }} />
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
                {/* Tier pill row — PRO·TEAM chip. The NEW chip was
                    dropped alongside Tile-2 retirement; this surface is
                    no longer the "newer of two" — it's the only branded
                    path on offer. */}
                <div className="flex justify-end gap-1.5 mb-2">
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
                  <BookOpen
                    className="w-5 h-5"
                    style={{ color: brand.teal }}
                  />
                </div>
                <div
                  className="text-sm font-bold mb-1"
                  style={{ color: brand.navy }}
                >
                  Branded with your artwork and company story
                </div>
                <div
                  className="text-xs leading-relaxed flex-1"
                  style={{ color: brand.navyMuted }}
                >
                  Multi-chapter proposal that weaves your About Us, USPs
                  and infographics straight from your brochure into a
                  client-specific narrative. Upload your brochure once,
                  reuse on every quote.
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
