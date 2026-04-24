/**
 * ExportFormatPickerModal.tsx
 *
 * Phase 4A — Delivery 6 (initial), Delivery 7 (Contract/Tender live).
 *
 * Shown when a Pro / Team tier user clicks "Generate PDF" on the quote
 * workspace. Presents three export format options as cards:
 *
 *   1. Quick quote         — active. Fires the existing basic PDF flow.
 *   2. Contract / Tender   — active (Delivery 7). Opens the Brand Choice
 *                            modal which handles branded proposal gen.
 *                            Preview thumbnail is sector-matched: IT →
 *                            IT-Modern, Cleaning → Cleaning-Operational,
 *                            Marketing → Marketing-Bold.
 *   3. Project / Migration — greyed. "Coming soon". Icon only, no
 *                            preview (template doesn't exist yet).
 *
 * Solo / Trial users do NOT see this modal — they see the Solo
 * upgrade modal from Delivery 5 instead. Tier routing happens in the
 * QuoteWorkspace's handleGeneratePDFClick.
 *
 * Client-side only. No server interaction. No new dependencies.
 */
import { useEffect } from "react";
import {
  X,
  FileText,
  Sparkles,
  Layers,
  ArrowRight,
  Lock,
} from "lucide-react";
import { brand } from "@/lib/brandTheme";
import {
  PROPOSAL_SHOWCASES,
  type ProposalShowcaseSector,
} from "@/lib/proposalShowcaseAssets";

interface ExportFormatPickerModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×] button). */
  onDismiss: () => void;
  /** Fires when the user picks the Quick quote card. */
  onSelectQuickQuote: () => void;
  /**
   * Fires when the user picks the Contract/Tender card (Delivery 7).
   * Parent (QuoteWorkspace) closes this picker and opens the Brand
   * Choice modal.
   */
  onSelectContractTender: () => void;
  /**
   * Sector hint used to pick the right preview thumbnail on the
   * Contract/Tender card. Typically derived from the quote's
   * tradePreset, falling back to the org's default sector. When
   * unrecognised we default to IT — the v1 target of the branded
   * renderer.
   */
  sectorHint?: string | null;
}

/** Map a free-text sector string to one of the three showcase sectors. */
function resolveShowcaseSector(hint: string | null | undefined): ProposalShowcaseSector {
  const s = (hint || "").toLowerCase().trim();
  if (!s) return "it";
  if (s.includes("clean")) return "cleaning";
  if (
    s.includes("market")
    || s.includes("digital")
    || s.includes("website")
    || s.includes("web")
    || s.includes("seo")
  ) return "marketing";
  // IT is the default — it's also the v1 target of the branded renderer
  // and the sector most users will see when this first lands.
  return "it";
}

export default function ExportFormatPickerModal({
  open,
  onDismiss,
  onSelectQuickQuote,
  onSelectContractTender,
  sectorHint,
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

  // Sector-matched preview on the Contract/Tender card so the user sees
  // a representative visual of what they're about to generate — even
  // though v1 only actually produces the IT-Modern layout. Post-4A adds
  // the other two sectors' renderers; the thumbnail is already right.
  const showcaseSector = resolveShowcaseSector(sectorHint);
  const contractTenderPreview = PROPOSAL_SHOWCASES[showcaseSector].assets.thumb;
  const showcaseSectorLabel = PROPOSAL_SHOWCASES[showcaseSector].sectorLabel;

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
        className="bg-white rounded-2xl shadow-2xl w-[900px] max-w-[94vw] my-6 relative"
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

        {/* Cards */}
        <div className="px-8 pb-6">
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
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

            {/* ── Card 2: Contract / Tender (active — Delivery 7) ── */}
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
              {/* Preview strip */}
              <div
                className="relative w-full overflow-hidden"
                style={{
                  aspectRatio: "4 / 3",
                  backgroundColor: brand.white,
                  borderBottom: `1px solid ${brand.border}`,
                }}
              >
                <img
                  src={contractTenderPreview}
                  alt={`${showcaseSectorLabel} Contract / Tender preview`}
                  className="w-full h-full object-cover object-top transition-transform group-hover:scale-[1.02]"
                  draggable={false}
                />
                <div
                  className="absolute top-2 right-2 px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase flex items-center gap-1"
                  style={{
                    backgroundColor: brand.teal,
                    color: brand.white,
                  }}
                >
                  <Sparkles className="w-2.5 h-2.5" />
                  Pro
                </div>
              </div>
              <div className="p-5 flex-1 flex flex-col">
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
                  pricing, and signature. Your logo and brand colours are
                  applied automatically.
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

            {/* ── Card 3: Project / Migration (coming soon, no preview) ── */}
            <div
              className="rounded-xl p-5 flex flex-col"
              style={{
                backgroundColor: brand.slate,
                border: `1px solid ${brand.border}`,
                cursor: "not-allowed",
              }}
              aria-disabled="true"
            >
              <div className="flex items-start justify-between mb-3">
                <div
                  className="w-10 h-10 rounded-lg flex items-center justify-center"
                  style={{ backgroundColor: "#f1f5f9" }}
                >
                  <Layers
                    className="w-5 h-5"
                    style={{ color: brand.navyMuted }}
                  />
                </div>
                <div
                  className="px-2 py-0.5 rounded text-[10px] font-bold tracking-wide uppercase flex items-center gap-1"
                  style={{
                    backgroundColor: brand.navy,
                    color: brand.white,
                  }}
                >
                  <Lock className="w-2.5 h-2.5" />
                  Coming soon
                </div>
              </div>
              <div
                className="text-sm font-bold mb-1"
                style={{ color: brand.navy }}
              >
                Project / Migration
              </div>
              <div
                className="text-xs leading-relaxed flex-1"
                style={{ color: brand.navyMuted }}
              >
                Multi-phase project proposal with a delivery roadmap,
                phased pricing, and stage acceptance gates.
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
