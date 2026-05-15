// client/src/components/BrandedTemplatePickerV2.tsx
//
// Phase 3 — the picker UI for the v2.1 template library.
//
// Replaces the BrandChoiceModal experience for the "Use a branded
// colour template" card in the export format picker. Shows the six
// design directions filtered to the user's sector, lets them pick one,
// then fires the new generateBrandedProposalV2 endpoint and downloads
// the resulting PDF.
//
// Key differences from the legacy BrandChoiceModal:
//   - 6 sector-specific designs instead of 3 generic templates
//   - Each template is presented with a real preview thumbnail
//   - Returns a base64 PDF that downloads as a Blob, instead of HTML
//     opened in a print window
//   - Single endpoint call — no separate brand-mode parameter
//
// API contract — keep it close to BrandChoiceModal's so the parent
// (QuoteWorkspace) only has minor changes:
//   open, onDismiss, onBack, isGenerating, plus the new tradePreset and
//   quoteId. onGenerate emits the chosen templateId string.

import { useState, useMemo } from "react";
import { ArrowLeft, X, Loader2, CheckCircle2 } from "lucide-react";
import { toast } from "sonner";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { trpc } from "@/lib/trpc";

// ── Sector & style metadata ─────────────────────────────────────────
//
// Duplicated from server/services/templateLibrary.ts because client-
// side bundling can't easily import server-only modules. Single small
// constant; if the library grows we can extract to shared/.

const SECTORS = [
  "it-services",
  "commercial-cleaning",
  "web-marketing",
  "pest-control",
] as const;
type SectorId = (typeof SECTORS)[number];

const STYLES: Array<{
  id: string;
  name: string;
  description: string;
}> = [
  { id: "01-split-screen", name: "Split Screen", description: "Half cinematic image, half clean content panel." },
  { id: "02-magazine", name: "Magazine", description: "Full-bleed cover with bold display headline." },
  { id: "03-dark-premium", name: "Dark Premium", description: "Restrained, luxury feel with serif typography on a dark canvas." },
  { id: "04-cards-grid", name: "Cards & Grid", description: "Image mosaic cover with structured card-based interior." },
  { id: "05-geometric", name: "Geometric Bold", description: "Diagonal cuts and uppercase display type." },
  { id: "06-clean-tech", name: "Clean Tech", description: "White canvas with accent block. Minimal and technical." },
];

const DEFAULT_SECTOR: SectorId = "it-services";

/**
 * Map a tradePreset string to a sector id. Tolerant of underscore /
 * hyphen / lowercase variants since historical rows may differ.
 */
function tradePresetToSector(tradePreset: string | null | undefined): SectorId {
  if (!tradePreset) return DEFAULT_SECTOR;
  const normalised = tradePreset.toLowerCase().replace(/_/g, "-");
  switch (normalised) {
    case "it-services":
    case "it":
      return "it-services";
    case "commercial-cleaning":
    case "cleaning":
      return "commercial-cleaning";
    case "web-marketing":
    case "web":
    case "digital-marketing":
      return "web-marketing";
    case "pest-control":
    case "pest":
      return "pest-control";
    default:
      return DEFAULT_SECTOR;
  }
}

// ── Props ───────────────────────────────────────────────────────────

interface BrandedTemplatePickerV2Props {
  open: boolean;
  /** Close without action (overlay click, Esc, [×]). */
  onDismiss: () => void;
  /** Return to the format picker. */
  onBack: () => void;
  /** The quote id to generate for. */
  quoteId: number;
  /** The quote's trade preset — drives which sector's 6 designs show.
   *  Falls back to it-services when unknown. */
  tradePreset?: string | null;
  /** Optional callback fired after the PDF downloads successfully. The
   *  parent can use this to flip status or refresh state. */
  onGenerated?: (templateId: string) => void;
}

// ── Component ───────────────────────────────────────────────────────

export default function BrandedTemplatePickerV2(props: BrandedTemplatePickerV2Props) {
  const { open, onDismiss, onBack, quoteId, tradePreset, onGenerated } = props;

  const sector = useMemo(() => tradePresetToSector(tradePreset), [tradePreset]);
  const [selectedStyleId, setSelectedStyleId] = useState<string | null>(null);
  const selectedTemplateId = selectedStyleId ? `${sector}/${selectedStyleId}` : null;

  const generate = trpc.templateProposal.generateBrandedProposalV2.useMutation();

  async function handleGenerate() {
    if (!selectedTemplateId) {
      toast.error("Pick a design first");
      return;
    }
    try {
      const result = await generate.mutateAsync({
        quoteId,
        templateId: selectedTemplateId,
      });
      if (!result?.pdfBase64) {
        throw new Error("No PDF received from server");
      }

      // base64 → Blob via fetch on a data URL. Avoids the Uint8Array →
      // Blob type wrangling (Uint8Array.buffer is now ArrayBufferLike,
      // not strictly ArrayBuffer) and keeps the code short. For a ~3MB
      // PDF the data-URL trip adds maybe 20ms — negligible against the
      // 3–5s Chromium render.
      const blob = await fetch(`data:application/pdf;base64,${result.pdfBase64}`)
        .then((r) => r.blob());
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = `proposal-${quoteId}.pdf`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success("Proposal generated");
      onGenerated?.(selectedTemplateId);
      onDismiss();
    } catch (err) {
      const msg = err instanceof Error ? err.message : "Generation failed";
      console.error("[BrandedTemplatePickerV2] generate error:", err);
      toast.error(msg);
    }
  }

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) onDismiss(); }}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto p-0">
        {/* Header */}
        <div className="flex items-start justify-between p-6 pb-4 border-b">
          <div className="flex items-start gap-3">
            <button
              type="button"
              onClick={onBack}
              disabled={generate.isPending}
              className="mt-1 text-slate-500 hover:text-slate-800 disabled:opacity-40"
              aria-label="Back"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div>
              <DialogTitle className="text-xl font-semibold">
                Choose a design
              </DialogTitle>
              <DialogDescription className="mt-1 text-sm text-slate-500">
                Pick a style for your proposal. We'll tint it to your brand
                colour automatically.
              </DialogDescription>
            </div>
          </div>
          <button
            type="button"
            onClick={onDismiss}
            disabled={generate.isPending}
            className="text-slate-400 hover:text-slate-700 disabled:opacity-40"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Design grid */}
        <div className="p-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 gap-4">
            {STYLES.map((style) => {
              const isSelected = selectedStyleId === style.id;
              const thumbnailUrl = `/template-thumbnails/${sector}_${style.id}.png`;
              return (
                <button
                  key={style.id}
                  type="button"
                  onClick={() => setSelectedStyleId(style.id)}
                  disabled={generate.isPending}
                  className={
                    "group relative flex flex-col text-left rounded-lg border-2 overflow-hidden " +
                    "transition-all disabled:opacity-60 disabled:cursor-not-allowed " +
                    (isSelected
                      ? "border-blue-600 ring-2 ring-blue-200 shadow-sm"
                      : "border-slate-200 hover:border-slate-400 hover:shadow-sm")
                  }
                  aria-pressed={isSelected}
                >
                  {isSelected && (
                    <div className="absolute top-2 right-2 bg-blue-600 text-white rounded-full p-1 shadow-md z-10">
                      <CheckCircle2 className="h-4 w-4" />
                    </div>
                  )}
                  <div className="aspect-[7/10] bg-slate-100 overflow-hidden">
                    <img
                      src={thumbnailUrl}
                      alt=""
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  </div>
                  <div className="p-3">
                    <div className="font-medium text-sm text-slate-900">
                      {style.name}
                    </div>
                    <div className="mt-1 text-xs text-slate-500 leading-snug">
                      {style.description}
                    </div>
                  </div>
                </button>
              );
            })}
          </div>

          {/* Sector hint — quietly reassuring */}
          <p className="mt-4 text-xs text-slate-400">
            Showing designs for {humaniseSector(sector)}.
            {!tradePreset && " Set your sector in Settings to see more relevant options."}
          </p>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between gap-3 p-6 pt-4 border-t bg-slate-50">
          <div className="text-sm text-slate-600">
            {selectedStyleId
              ? <>Selected: <span className="font-medium text-slate-900">{STYLES.find((s) => s.id === selectedStyleId)?.name}</span></>
              : <span className="text-slate-400">No design selected</span>}
          </div>
          <Button
            onClick={handleGenerate}
            disabled={!selectedTemplateId || generate.isPending}
            className="min-w-[160px]"
          >
            {generate.isPending ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Generating…
              </>
            ) : (
              <>Generate proposal</>
            )}
          </Button>
        </div>
      </DialogContent>
    </Dialog>
  );
}

// ── Helpers ─────────────────────────────────────────────────────────

function humaniseSector(s: SectorId): string {
  switch (s) {
    case "it-services": return "IT Services";
    case "commercial-cleaning": return "Commercial Cleaning";
    case "web-marketing": return "Web & Digital Marketing";
    case "pest-control": return "Pest Control";
  }
}
