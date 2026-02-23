import { useState } from "react";
import { brand } from "@/lib/brandTheme";
import { Mic, User, Wrench, Package, Percent, PoundSterling, FileText, AlertTriangle, Loader2, X, Check, Pencil } from "lucide-react";

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
  onConfirm: (editedSummary: DictationSummary) => void;
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
  const [isEditing, setIsEditing] = useState(false);
  const [edited, setEdited] = useState<DictationSummary>({ ...summary });

  const updateField = <K extends keyof DictationSummary>(key: K, value: DictationSummary[K]) => {
    setEdited(prev => ({ ...prev, [key]: value }));
  };

  const updateLabour = (index: number, field: string, value: string | number) => {
    setEdited(prev => {
      const labour = [...prev.labour];
      labour[index] = { ...labour[index], [field]: value };
      return { ...prev, labour };
    });
  };

  const updateMaterial = (index: number, field: string, value: string | number | null) => {
    setEdited(prev => {
      const materials = [...prev.materials];
      materials[index] = { ...materials[index], [field]: value };
      return { ...prev, materials };
    });
  };

  const startEditing = () => {
    setEdited({ ...summary });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEdited({ ...summary });
    setIsEditing(false);
  };

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

  const data = isEditing ? edited : summary;
  const hasLabour = data.labour && data.labour.length > 0;
  const hasMaterials = data.materials && data.materials.length > 0;
  const hasFinancials = data.markup !== null || data.sundries !== null || data.contingency !== null;

  const inputStyle = {
    color: brand.navy,
    backgroundColor: `${brand.teal}06`,
    border: `1px solid ${brand.teal}30`,
  };

  return (
    <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
        <div className="flex items-center gap-2">
          <Mic className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Voice Summary</span>
          {isEditing && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">Editing</span>
          )}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button
              onClick={startEditing}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-teal-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors flex items-center gap-1.5"
            >
              <Pencil className="h-3 w-3" />
              Edit
            </button>
          ) : (
            <button
              onClick={cancelEditing}
              className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
            >
              Cancel Edit
            </button>
          )}
          <button onClick={onDismiss} className="p-1 rounded-lg text-white/40 hover:text-white/70 hover:bg-white/10 transition-colors">
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Trade relevance warning */}
      {!data.isTradeRelevant && (
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
            {isEditing ? (
              <input
                type="text"
                value={edited.jobDescription}
                onChange={(e) => updateField("jobDescription", e.target.value)}
                className="w-full text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                style={inputStyle}
              />
            ) : (
              <p className="text-sm font-medium" style={{ color: brand.navy }}>{data.jobDescription}</p>
            )}
          </div>
        </div>

        {/* Client */}
        {(data.clientName || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${brand.navy}08` }}>
              <User className="h-3.5 w-3.5" style={{ color: brand.navy }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Client</p>
              {isEditing ? (
                <input
                  type="text"
                  value={edited.clientName || ""}
                  onChange={(e) => updateField("clientName", e.target.value || null)}
                  placeholder="Client name"
                  className="w-full text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                  style={inputStyle}
                />
              ) : (
                <p className="text-sm font-medium" style={{ color: brand.navy }}>{data.clientName}</p>
              )}
            </div>
          </div>
        )}

        {/* Labour */}
        {(hasLabour || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#eff6ff" }}>
              <Wrench className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Labour</p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.labour.map((l, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input
                        type="number"
                        value={l.quantity}
                        onChange={(e) => updateLabour(i, "quantity", parseInt(e.target.value) || 0)}
                        className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300"
                        style={inputStyle}
                      />
                      <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                      <input
                        type="text"
                        value={l.role}
                        onChange={(e) => updateLabour(i, "role", e.target.value)}
                        className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                        style={inputStyle}
                      />
                      <input
                        type="text"
                        value={l.duration}
                        onChange={(e) => updateLabour(i, "duration", e.target.value)}
                        placeholder="Duration"
                        className="w-28 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                        style={inputStyle}
                      />
                    </div>
                  ))}
                </div>
              ) : (
                data.labour.map((l, i) => (
                  <p key={i} className="text-sm font-medium" style={{ color: brand.navy }}>
                    {l.quantity} × {l.role}{l.duration ? ` — ${l.duration}` : ""}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {/* Materials */}
        {(hasMaterials || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f0fdf4" }}>
              <Package className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Materials</p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.materials.map((m, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <input
                        type="number"
                        value={m.quantity}
                        onChange={(e) => updateMaterial(i, "quantity", parseInt(e.target.value) || 0)}
                        className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300"
                        style={inputStyle}
                      />
                      <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                      <input
                        type="text"
                        value={m.item}
                        onChange={(e) => updateMaterial(i, "item", e.target.value)}
                        className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                        style={inputStyle}
                      />
                      <div className="flex items-center gap-0.5">
                        <span className="text-sm" style={{ color: brand.navyMuted }}>£</span>
                        <input
                          type="number"
                          value={m.unitPrice ?? ""}
                          onChange={(e) => updateMaterial(i, "unitPrice", e.target.value ? parseFloat(e.target.value) : null)}
                          placeholder="—"
                          className="w-20 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                          style={inputStyle}
                        />
                      </div>
                    </div>
                  ))}
                </div>
              ) : (
                data.materials.map((m, i) => (
                  <p key={i} className="text-sm font-medium" style={{ color: brand.navy }}>
                    {m.quantity} × {m.item}{m.unitPrice ? ` @ £${m.unitPrice}` : ""}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {/* Financials row */}
        {(hasFinancials || isEditing) && (
          <div className="flex flex-wrap gap-3">
            {(data.markup !== null || isEditing) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${brand.teal}08`, border: `1px solid ${brand.teal}20` }}>
                <Percent className="h-3 w-3" style={{ color: brand.teal }} />
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold" style={{ color: brand.navy }}>Markup:</span>
                    <input
                      type="number"
                      value={edited.markup ?? ""}
                      onChange={(e) => updateField("markup", e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-16 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300"
                      style={inputStyle}
                    />
                    <span className="text-xs" style={{ color: brand.navyMuted }}>%</span>
                  </div>
                ) : (
                  <span className="text-xs font-bold" style={{ color: brand.navy }}>Markup: {data.markup}%</span>
                )}
              </div>
            )}
            {(data.sundries !== null || isEditing) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: `${brand.navy}06`, border: `1px solid ${brand.navy}12` }}>
                <PoundSterling className="h-3 w-3" style={{ color: brand.navy }} />
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold" style={{ color: brand.navy }}>Sundries: £</span>
                    <input
                      type="number"
                      value={edited.sundries ?? ""}
                      onChange={(e) => updateField("sundries", e.target.value ? parseFloat(e.target.value) : null)}
                      className="w-16 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300"
                      style={inputStyle}
                    />
                  </div>
                ) : (
                  <span className="text-xs font-bold" style={{ color: brand.navy }}>Sundries: £{data.sundries}</span>
                )}
              </div>
            )}
            {(data.contingency !== null || isEditing) && (
              <div className="flex items-center gap-2 px-3 py-1.5 rounded-lg" style={{ backgroundColor: "#fef9ee", border: "1px solid #fde68a" }}>
                <PoundSterling className="h-3 w-3" style={{ color: "#d97706" }} />
                {isEditing ? (
                  <div className="flex items-center gap-1">
                    <span className="text-xs font-bold" style={{ color: brand.navy }}>Contingency:</span>
                    <input
                      type="text"
                      value={edited.contingency ?? ""}
                      onChange={(e) => updateField("contingency", e.target.value || null)}
                      className="w-24 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300"
                      style={inputStyle}
                    />
                  </div>
                ) : (
                  <span className="text-xs font-bold" style={{ color: brand.navy }}>Contingency: {data.contingency}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Notes */}
        {(data.notes || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f8fafc" }}>
              <FileText className="h-3.5 w-3.5" style={{ color: brand.navyMuted }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Notes</p>
              {isEditing ? (
                <textarea
                  value={edited.notes || ""}
                  onChange={(e) => updateField("notes", e.target.value || null)}
                  placeholder="Additional notes..."
                  rows={2}
                  className="w-full text-xs px-2 py-1.5 rounded-md resize-none outline-none focus:ring-1 focus:ring-teal-300"
                  style={inputStyle}
                />
              ) : (
                <p className="text-xs" style={{ color: brand.navyMuted }}>{data.notes}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Action buttons */}
      <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: brand.slate, borderTop: `1px solid ${brand.border}` }}>
        <button
          onClick={() => onConfirm(isEditing ? edited : summary)}
          className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-colors"
          style={{ backgroundColor: brand.teal, color: "#fff" }}
        >
          <Check className="h-4 w-4" />
          {isEditing ? "Save Changes" : "Confirm"}
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
