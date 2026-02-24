import { useState, useEffect, useMemo } from "react";
import { brand } from "@/lib/brandTheme";
import {
  FileText, User, Wrench, Package, Percent, PoundSterling,
  AlertTriangle, Loader2, Pencil, Check, X, ClipboardList,
} from "lucide-react";

// ---- Types ----

interface LabourItem {
  role: string;
  quantity: number;
  duration: string;
}

interface MaterialItem {
  item: string;
  quantity: number;
  unitPrice: number | null;
  source: "voice" | "takeoff" | "containment" | "document";
  symbolCode?: string; // for takeoff and containment items
}

export interface QuoteDraftData {
  clientName: string | null;
  jobDescription: string;
  labour: LabourItem[];
  materials: MaterialItem[];
  markup: number | null;
  sundries: number | null;
  contingency: string | null;
  notes: string | null;
}

interface TakeoffInfo {
  counts: Record<string, number>;
  symbolDescriptions: Record<string, string>;
  userAnswers?: Record<string, string>;
  status: string;
  source?: "takeoff" | "containment"; // defaults to "takeoff"
}

interface QuoteDraftSummaryProps {
  // Data from voice parse
  voiceSummary: QuoteDraftData | null;
  // Takeoff data from all PDFs
  takeoffs: TakeoffInfo[];
  // User overrides for takeoff material quantities/names
  takeoffOverrides: Record<string, { quantity?: number; item?: string; unitPrice?: number | null }>;
  // Loading state
  isLoading: boolean;
  // Whether any voice notes exist
  hasVoiceNotes: boolean;
  // Callbacks
  onSave: (data: QuoteDraftData) => void;
  onTriggerVoiceAnalysis: () => void;
}

// ---- Helpers ----

function mergeSummaryWithTakeoffs(
  voiceSummary: QuoteDraftData | null,
  takeoffs: TakeoffInfo[],
  takeoffOverrides: Record<string, { quantity?: number; item?: string; unitPrice?: number | null }>
): QuoteDraftData {
  const base: QuoteDraftData = voiceSummary
    ? { ...voiceSummary, materials: [...voiceSummary.materials] }
    : {
        clientName: null,
        jobDescription: "",
        labour: [],
        materials: [],
        markup: null,
        sundries: null,
        contingency: null,
        notes: null,
      };

  // Add takeoff and containment materials (excluding excluded symbols)
  for (const takeoff of takeoffs) {
    const materialSource = takeoff.source || "takeoff";
    const excludedCodes = new Set<string>();
    if (takeoff.userAnswers?._excludedCodes) {
      try {
        const codes = JSON.parse(takeoff.userAnswers._excludedCodes) as string[];
        codes.forEach((c) => excludedCodes.add(c));
      } catch {}
    }

    for (const [code, count] of Object.entries(takeoff.counts)) {
      if (count <= 0) continue;
      if (excludedCodes.has(code)) continue;

      const desc = takeoff.symbolDescriptions[code] || code;
      const override = takeoffOverrides[code];

      // Check if this material already exists (from same source with same code)
      const existing = base.materials.find(
        (m) => m.source === materialSource && m.symbolCode === code
      );
      if (existing) {
        existing.quantity = override?.quantity ?? count;
        if (override?.item) existing.item = override.item;
        if (override?.unitPrice !== undefined) existing.unitPrice = override.unitPrice;
      } else {
        base.materials.push({
          item: override?.item ?? desc,
          quantity: override?.quantity ?? count,
          unitPrice: override?.unitPrice ?? null,
          source: materialSource,
          symbolCode: code,
        });
      }
    }
  }

  return base;
}

// ---- Component ----

export default function QuoteDraftSummary({
  voiceSummary,
  takeoffs,
  takeoffOverrides,
  isLoading,
  hasVoiceNotes,
  onSave,
  onTriggerVoiceAnalysis,
}: QuoteDraftSummaryProps) {
  const [isEditing, setIsEditing] = useState(false);

  // Merge voice summary + takeoff data + user overrides
  const mergedData = useMemo(
    () => mergeSummaryWithTakeoffs(voiceSummary, takeoffs, takeoffOverrides),
    [voiceSummary, takeoffs, takeoffOverrides]
  );

  const [edited, setEdited] = useState<QuoteDraftData>({ ...mergedData });

  // Sync edited state when merged data changes (new takeoff, new voice parse)
  useEffect(() => {
    if (!isEditing) {
      setEdited({ ...mergedData });
    }
  }, [mergedData]); // eslint-disable-line react-hooks/exhaustive-deps

  const data = isEditing ? edited : mergedData;
  const hasLabour = data.labour.length > 0;
  const voiceMaterials = data.materials.filter((m) => m.source === "voice");
  const takeoffMaterials = data.materials.filter((m) => m.source === "takeoff");
  const containmentMaterials = data.materials.filter((m) => m.source === "containment");
  const hasMaterials = data.materials.length > 0;
  const hasFinancials = data.markup !== null || data.sundries !== null || data.contingency !== null;
  const isEmpty = !data.jobDescription && !hasLabour && !hasMaterials && !data.notes && !data.clientName;

  const updateField = <K extends keyof QuoteDraftData>(key: K, value: QuoteDraftData[K]) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };

  const updateLabour = (index: number, field: string, value: string | number) => {
    setEdited((prev) => {
      const labour = [...prev.labour];
      labour[index] = { ...labour[index], [field]: value };
      return { ...prev, labour };
    });
  };

  const updateMaterial = (index: number, field: string, value: string | number | null) => {
    setEdited((prev) => {
      const materials = [...prev.materials];
      materials[index] = { ...materials[index], [field]: value };
      return { ...prev, materials };
    });
  };

  const startEditing = () => {
    setEdited({ ...mergedData });
    setIsEditing(true);
  };

  const cancelEditing = () => {
    setEdited({ ...mergedData });
    setIsEditing(false);
  };

  const handleSave = () => {
    // Sanitize numbers
    const sanitized: QuoteDraftData = {
      ...edited,
      labour: edited.labour.map((l) => ({ ...l, quantity: Number(l.quantity) || 1 })),
      materials: edited.materials.map((m) => ({
        ...m,
        quantity: Number(m.quantity) || 1,
        unitPrice: m.unitPrice != null ? Number(m.unitPrice) || 0 : null,
      })),
      markup: edited.markup != null ? Number(edited.markup) || 0 : null,
      sundries: edited.sundries != null ? Number(edited.sundries) || 0 : null,
    };
    onSave(sanitized);
    setIsEditing(false);
  };

  const inputStyle = {
    color: brand.navy,
    backgroundColor: `${brand.teal}06`,
    border: `1px solid ${brand.teal}30`,
  };

  // ---- Loading state ----
  if (isLoading) {
    return (
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
        <div className="px-5 py-3 flex items-center gap-3" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
          <Loader2 className="h-4 w-4 animate-spin text-teal-300" />
          <span className="text-sm font-bold text-white">Analysing your inputs…</span>
        </div>
        <div className="px-5 py-5 flex justify-center" style={{ backgroundColor: brand.tealBg }}>
          <div className="flex items-center gap-2">
            <Loader2 className="h-5 w-5 animate-spin" style={{ color: brand.teal }} />
            <span className="text-sm font-medium" style={{ color: brand.navyMuted }}>
              Building quote draft summary
            </span>
          </div>
        </div>
      </div>
    );
  }

  // ---- Empty state ----
  if (isEmpty && !hasVoiceNotes) {
    return (
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1.5px solid ${brand.border}` }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
          <ClipboardList className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Quote Draft Summary</span>
        </div>
        <div className="px-5 py-6 text-center" style={{ backgroundColor: brand.white }}>
          <p className="text-sm" style={{ color: brand.navyMuted }}>
            Upload files or dictate to build your quote summary
          </p>
        </div>
      </div>
    );
  }

  // ---- Main summary ----
  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Quote Draft Summary</span>
          {isEditing && (
            <span className="text-[9px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">
              Editing
            </span>
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
              Cancel
            </button>
          )}
        </div>
      </div>

      {/* Content */}
      <div className="px-5 py-4 space-y-3" style={{ backgroundColor: brand.white }}>

        {/* Job description */}
        {(data.jobDescription || isEditing) && (
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
                  placeholder="Job description"
                  className="w-full text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300"
                  style={inputStyle}
                />
              ) : (
                <p className="text-sm font-medium" style={{ color: brand.navy }}>{data.jobDescription}</p>
              )}
            </div>
          </div>
        )}

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
                      <input type="number" value={l.quantity} onChange={(e) => updateLabour(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                      <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                      <input type="text" value={l.role} onChange={(e) => updateLabour(i, "role", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                      <input type="text" value={l.duration} onChange={(e) => updateLabour(i, "duration", e.target.value)} placeholder="Duration" className="w-28 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
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

        {/* Materials — voice-sourced */}
        {voiceMaterials.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f0fdf4" }}>
              <Package className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>
                Materials <span className="text-[8px] font-medium">(from voice)</span>
              </p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.materials.map((m, i) => {
                    if (m.source !== "voice") return null;
                    return (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input type="number" value={m.quantity} onChange={(e) => updateMaterial(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                        <input type="text" value={m.item} onChange={(e) => updateMaterial(i, "item", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm" style={{ color: brand.navyMuted }}>£</span>
                          <input type="number" value={m.unitPrice ?? ""} onChange={(e) => updateMaterial(i, "unitPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                voiceMaterials.map((m, i) => (
                  <p key={i} className="text-sm font-medium" style={{ color: brand.navy }}>
                    {m.quantity} × {m.item}{m.unitPrice ? ` @ £${m.unitPrice}` : ""}
                  </p>
                ))
              )}
            </div>
          </div>
        )}

        {/* Materials — from takeoff (symbol counts) */}
        {takeoffMaterials.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f5f3ff" }}>
              <Package className="h-3.5 w-3.5" style={{ color: "#8b5cf6" }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>
                Materials <span className="text-[8px] font-medium">(from drawing takeoff)</span>
              </p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.materials.map((m, i) => {
                    if (m.source !== "takeoff") return null;
                    return (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input type="number" value={m.quantity} onChange={(e) => updateMaterial(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                        <input type="text" value={m.item} onChange={(e) => updateMaterial(i, "item", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        {m.symbolCode && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#f5f3ff", color: "#8b5cf6" }}>
                            {m.symbolCode}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm" style={{ color: brand.navyMuted }}>£</span>
                          <input type="number" value={m.unitPrice ?? ""} onChange={(e) => updateMaterial(i, "unitPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {takeoffMaterials.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm font-medium py-1 px-2.5 rounded-lg"
                      style={{ backgroundColor: "#f5f3ff", border: "1px solid #e9e5ff" }}
                    >
                      <span className="font-extrabold" style={{ color: "#8b5cf6", minWidth: 28 }}>{m.quantity}</span>
                      <span style={{ color: brand.navyMuted }}>×</span>
                      <span style={{ color: brand.navy }}>{m.item}</span>
                      {m.symbolCode && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ backgroundColor: "#ede9fe", color: "#8b5cf6" }}>
                          {m.symbolCode}
                        </span>
                      )}
                      {m.unitPrice != null && m.unitPrice > 0 && (
                        <span className="text-xs" style={{ color: brand.navyMuted }}>@ £{m.unitPrice}</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Materials — from containment takeoff (tray runs, fittings, cable) */}
        {containmentMaterials.length > 0 && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f0fdfa" }}>
              <Package className="h-3.5 w-3.5" style={{ color: brand.teal }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[10px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>
                Containment <span className="text-[8px] font-medium">(from containment takeoff)</span>
              </p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.materials.map((m, i) => {
                    if (m.source !== "containment") return null;
                    return (
                      <div key={i} className="flex gap-1.5 items-center">
                        <input type="number" value={m.quantity} onChange={(e) => updateMaterial(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                        <input type="text" value={m.item} onChange={(e) => updateMaterial(i, "item", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        {m.symbolCode && (
                          <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#f0fdfa", color: brand.teal }}>
                            {m.symbolCode}
                          </span>
                        )}
                        <div className="flex items-center gap-0.5">
                          <span className="text-sm" style={{ color: brand.navyMuted }}>£</span>
                          <input type="number" value={m.unitPrice ?? ""} onChange={(e) => updateMaterial(i, "unitPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm font-medium px-2 py-1 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                      </div>
                    );
                  })}
                </div>
              ) : (
                <div className="space-y-1">
                  {containmentMaterials.map((m, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-2 text-sm font-medium py-1 px-2.5 rounded-lg"
                      style={{ backgroundColor: "#f0fdfa", border: "1px solid #ccfbf1" }}
                    >
                      <span className="font-extrabold" style={{ color: brand.teal, minWidth: 28 }}>{m.quantity}</span>
                      <span style={{ color: brand.navyMuted }}>×</span>
                      <span style={{ color: brand.navy }}>{m.item}</span>
                      {m.symbolCode && (
                        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded ml-auto" style={{ backgroundColor: "#ccfbf1", color: brand.teal }}>
                          {m.symbolCode}
                        </span>
                      )}
                      {m.unitPrice != null && m.unitPrice > 0 && (
                        <span className="text-xs" style={{ color: brand.navyMuted }}>@ £{m.unitPrice}</span>
                      )}
                    </div>
                  ))}
                </div>
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
                    <input type="number" value={edited.markup ?? ""} onChange={(e) => updateField("markup", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
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
                    <input type="number" value={edited.sundries ?? ""} onChange={(e) => updateField("sundries", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
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
                    <input type="text" value={edited.contingency ?? ""} onChange={(e) => updateField("contingency", e.target.value || null)} className="w-24 text-xs font-bold px-1.5 py-0.5 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
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
                <textarea value={edited.notes || ""} onChange={(e) => updateField("notes", e.target.value || null)} placeholder="Additional notes..." rows={2} className="w-full text-xs px-2 py-1.5 rounded-md resize-none outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
              ) : (
                <p className="text-xs" style={{ color: brand.navyMuted }}>{data.notes}</p>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Save bar — only in edit mode */}
      {isEditing && (
        <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: brand.slate, borderTop: `1px solid ${brand.border}` }}>
          <button
            onClick={handleSave}
            className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-colors"
            style={{ backgroundColor: brand.teal, color: "#fff" }}
          >
            <Check className="h-4 w-4" />
            Save Changes
          </button>
          <button
            onClick={cancelEditing}
            className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors"
            style={{ backgroundColor: brand.white, color: brand.navy, border: `1.5px solid ${brand.border}` }}
          >
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export type { QuoteDraftData, MaterialItem, LabourItem };
