import { brand } from "@/lib/brandTheme";
import { Mic, User, Wrench, Package, Percent, PoundSterling, FileText, AlertTriangle, Loader2, X, Sparkles, ChevronRight } from "lucide-react";

interface DictationSummary {
  clientName: string | null;
  jobDescription: string;
  labour: Array<{ role: string; quantity: number; duration: string }>;
  materials: Array<{ item: string; quantity: number; unitPrice: number | null }>;
  markup: number | null;
  sundries: number | null;
  contingency: string | null;
  notes: string | null;
  isTradeRelevant: boolean;
}

interface DictationSummaryCardProps {
  summary: DictationSummary;
  isLoading?: boolean;
  onConfirm: () => void;
  onEdit: () => void;
  onDismiss: () => void;
}

export default function DictationSummaryCard({
  summary,
  isLoading = false,
  onConfirm,
  onEdit,
  onDismiss,
}: DictationSummaryCardProps) {
  if (isLoading) {
    return (
      <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
        <div className="px-5 py-4 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
          <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
          <span className="text-sm font-bold text-white">Parsing your dictation…</span>
        </div>
        <div className="px-5 py-6 flex justify-center" style={{ backgroundColor: brand.tealBg }}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: brand.teal }} />
            <span className="text-sm font-medium" style={{ color: brand.navyMuted }}>Extracting details from your voice notes</span>
          </div>
        </div>
      </div>
    );
  }

  const hasLabour = summary.labour && summary.labour.length > 0;
  const hasMaterials = summary.materials && summary.materials.length > 0;
  const hasFinancials = summary.markup !== null || summary.sundries !== null || summary.contingency !== null;

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Voice Summary</span>
        </div>
        <button onClick={onDismiss} className="p-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors">
          <X className="h-4 w-4" />
        </button>
      </div>

      {/* Trade relevance warning */}
      {!summary.isTradeRelevant && (
        <div className="px-5 py-2.5 flex items-center gap-2" style={{ backgroundColor: "#fffbeb", borderBottom: `1px solid #fde68a` }}>
          <AlertTriangle className="h-4 w-4 flex-shrink-0" style={{ color: "#d97706" }} />
          <span className="text-xs font-medium" style={{ color: "#92400e" }}>
            This doesn't seem to relate to your trade. You can still generate if intended.
          </span>
        </div>
      )}

      {/* Summary content */}
      <div className="px-5 py-4 space-y-3" style={{ backgroundColor: brand.white }}>

        {/* Job description */}
        <div className="flex items-start gap-3">
          <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${brand.teal}12` }}>
            <FileText className="h-3.5 w-3.5" style={{ color: brand.teal }} />
          </div>
          <div className="flex-1 min-w-0">
            <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Job</p>
            <p className="text-sm font-medium" style={{ color: brand.navy }}>{summary.jobDescription}</p>
          </div>
        </div>

        {/* Client */}
        {summary.clientName && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${brand.navy}08` }}>
              <User className="h-3.5 w-3.5" style={{ color: brand.navy }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Client</p>
              <p className="text-sm font-medium" style={{ color: brand.navy }}>{summary.clientName}</p>
            </div>
          </div>
        )}

        {/* Labour */}
        {hasLabour && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#eff6ff" }}>
              <Wrench className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Labour</p>
              {summary.labour.map((l, i) => (
                <p key={i} className="text-sm font-medium" style={{ color: brand.navy }}>
                  {l.quantity} × {l.role}{l.duration ? ` — ${l.duration}` : ""}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Materials */}
        {hasMaterials && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f0fdf4" }}>
              <Package className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Materials</p>
              {summary.materials.map((m, i) => (
                <p key={i} className="text-sm font-medium" style={{ color: brand.navy }}>
                  {m.quantity} × {m.item}{m.unitPrice ? ` @ £${m.unitPrice}` : ""}
                </p>
              ))}
            </div>
          </div>
        )}

        {/* Financials row */}
        {hasFinancials && (
          <div className="flex flex-wrap gap-3">
            {summary.markup !== null && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${brand.teal}08`, border: `1px solid ${brand.teal}20` }}>
                <Percent className="h-3 w-3" style={{ color: brand.teal }} />
                <span className="text-xs font-bold" style={{ color: brand.navy }}>Markup: {summary.markup}%</span>
              </div>
            )}
            {summary.sundries !== null && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${brand.navy}06`, border: `1px solid ${brand.navy}12` }}>
                <PoundSterling className="h-3 w-3" style={{ color: brand.navy }} />
                <span className="text-xs font-bold" style={{ color: brand.navy }}>Sundries: £{summary.sundries}</span>
              </div>
            )}
            {summary.contingency !== null && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#fef9ee", border: "1px solid #fde68a" }}>
                <PoundSterling className="h-3 w-3" style={{ color: "#d97706" }} />
                <span className="text-xs font-bold" style={{ color: brand.navy }}>Contingency: {summary.contingency}</span>
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {summary.notes && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f8fafc" }}>
              <FileText className="h-3.5 w-3.5" style={{ color: brand.navyMuted }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Notes</p>
              <p className="text-xs" style={{ color: brand.navyMuted }}>{summary.notes}</p>
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: brand.slate, borderTop: `1px solid ${brand.border}` }}>
        <button
          onClick={onConfirm}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-colors"
          style={{ backgroundColor: brand.teal, color: "#fff" }}
        >
          <Sparkles className="h-4 w-4" />
          Looks Good — Generate
        </button>
        <button
          onClick={onEdit}
          className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors"
          style={{ backgroundColor: brand.white, color: brand.navy, border: `1.5px solid ${brand.border}` }}
        >
          Re-dictate
        </button>
      </div>
    </div>
  );
}

export type { DictationSummary };
