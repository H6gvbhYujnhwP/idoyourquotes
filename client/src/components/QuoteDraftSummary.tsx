import { useState, useEffect, useMemo } from "react";
import { brand } from "@/lib/brandTheme";
import {
  FileText, User, Wrench, Package, Percent, PoundSterling,
  AlertTriangle, Loader2, Pencil, Check, X, ClipboardList, Truck,
  Plus,
} from "lucide-react";

// ---- Types ----

interface LabourItem {
  role: string;
  quantity: number;
  duration: string;
}

interface PlantHireItem {
  description: string;
  costPrice: number | null;
  sellPrice: number | null;
  quantity: number;
  duration: string;
}

interface MaterialItem {
  item: string;
  quantity: number;
  unitPrice: number | null;
  costPrice: number | null;
  installTimeHrs: number | null;
  labourCost: number | null;
  unit?: string;
  description?: string;
  source: "voice" | "takeoff" | "containment" | "document";
  symbolCode?: string;
  catalogName?: string;
}

export interface QuoteDraftData {
  clientName: string | null;
  jobDescription: string;
  labour: LabourItem[];
  materials: MaterialItem[];
  plantHire: PlantHireItem[];
  markup: number | null;
  sundries: number | null;
  contingency: string | null;
  preliminaries: number | null;
  labourRate: number | null;
  plantMarkup: number | null;
  notes: string | null;
}

interface TakeoffInfo {
  counts: Record<string, number>;
  symbolDescriptions: Record<string, string>;
  userAnswers?: Record<string, string>;
  status: string;
  source?: "takeoff" | "containment";
}

interface CatalogItemRef {
  name: string;
  defaultRate: string | null;
  costPrice: string | null;
  installTimeHrs: string | null;
  unit: string | null;
  category: string | null;
}

interface QuoteDraftSummaryProps {
  voiceSummary: QuoteDraftData | null;
  takeoffs: TakeoffInfo[];
  takeoffOverrides: Record<string, { quantity?: number; item?: string; unitPrice?: number | null; installTimeHrs?: number | null }>;
  catalogItems: CatalogItemRef[];
  defaultMarkup: number | null;
  defaultLabourRate: number | null;
  defaultPlantMarkup: number | null;
  isLoading: boolean;
  hasVoiceNotes: boolean;
  onSave: (data: QuoteDraftData) => void;
  onTriggerVoiceAnalysis: () => void;
}

// ---- Helpers ----

function matchCatalogPrice(
  itemDescription: string,
  catalogItems: CatalogItemRef[],
): { rate: number; costPrice: number | null; catalogName: string; installTimeHrs: number | null } | null {
  if (!catalogItems.length || !itemDescription) return null;
  const normalise = (s: string) => s.toLowerCase().replace(/[^a-z0-9 ]/g, "").trim();
  const itemNorm = normalise(itemDescription);
  const itemWords = new Set(itemNorm.split(/\s+/).filter(w => w.length > 2));
  let bestMatch: { rate: number; costPrice: number | null; catalogName: string; installTimeHrs: number | null; score: number } | null = null;
  for (const cat of catalogItems) {
    const rate = parseFloat(cat.defaultRate || "0");
    if (rate <= 0) continue;
    const catNorm = normalise(cat.name);
    const installTime = cat.installTimeHrs ? parseFloat(cat.installTimeHrs) : null;
    const costPrice = cat.costPrice ? parseFloat(cat.costPrice) : null;
    if (catNorm === itemNorm) return { rate, costPrice, catalogName: cat.name, installTimeHrs: installTime };
    if (catNorm.length > 3 && (itemNorm.includes(catNorm) || catNorm.includes(itemNorm))) {
      const score = catNorm.length;
      if (!bestMatch || score > bestMatch.score) bestMatch = { rate, costPrice, catalogName: cat.name, installTimeHrs: installTime, score };
      continue;
    }
    const catWords = catNorm.split(/\s+/).filter(w => w.length > 2);
    if (catWords.length > 0) {
      const overlap = catWords.filter(w => itemWords.has(w)).length;
      if (overlap / catWords.length >= 0.6 && overlap >= 2) {
        if (!bestMatch || overlap > bestMatch.score) bestMatch = { rate, costPrice, catalogName: cat.name, installTimeHrs: installTime, score: overlap };
      }
    }
  }
  return bestMatch ? { rate: bestMatch.rate, costPrice: bestMatch.costPrice, catalogName: bestMatch.catalogName, installTimeHrs: bestMatch.installTimeHrs } : null;
}

function mergeSummaryWithTakeoffs(
  voiceSummary: QuoteDraftData | null,
  takeoffs: TakeoffInfo[],
  takeoffOverrides: Record<string, { quantity?: number; item?: string; unitPrice?: number | null; installTimeHrs?: number | null }>,
  catalogItems: CatalogItemRef[],
  defaultMarkup: number | null,
  defaultLabourRate: number | null,
  defaultPlantMarkup: number | null,
): QuoteDraftData {
  const base: QuoteDraftData = voiceSummary
    ? { ...voiceSummary, materials: [...voiceSummary.materials], plantHire: [...(voiceSummary.plantHire || [])] }
    : { clientName: null, jobDescription: "", labour: [], materials: [], plantHire: [], markup: null, sundries: null, contingency: null, preliminaries: null, labourRate: null, plantMarkup: null, notes: null };
  if (base.preliminaries === undefined) base.preliminaries = null;
  if (base.labourRate === undefined) base.labourRate = null;
  if (base.plantMarkup === undefined) base.plantMarkup = null;
  if (!base.plantHire) base.plantHire = [];
  if (base.markup === null && defaultMarkup !== null && defaultMarkup > 0) base.markup = defaultMarkup;
  if (base.labourRate === null && defaultLabourRate !== null && defaultLabourRate > 0) base.labourRate = defaultLabourRate;
  if (base.plantMarkup === null && defaultPlantMarkup !== null && defaultPlantMarkup > 0) base.plantMarkup = defaultPlantMarkup;

  for (const takeoff of takeoffs) {
    const materialSource = takeoff.source || "takeoff";
    const excludedCodes = new Set<string>();
    if (takeoff.userAnswers?._excludedCodes) {
      try { const codes = JSON.parse(takeoff.userAnswers._excludedCodes) as string[]; codes.forEach((c) => excludedCodes.add(c)); } catch {}
    }
    for (const [code, count] of Object.entries(takeoff.counts)) {
      if (count <= 0 || excludedCodes.has(code)) continue;
      const desc = takeoff.symbolDescriptions[code] || code;
      const override = takeoffOverrides[code];
      const existing = base.materials.find((m) => m.source === materialSource && m.symbolCode === code);
      let autoPrice: number | null = null;
      let autoInstallTime: number | null = null;
      const catalogMatch = matchCatalogPrice(override?.item ?? desc, catalogItems);
      if (override?.unitPrice === undefined || override?.unitPrice === null) { if (catalogMatch) autoPrice = catalogMatch.rate; }
      if (override?.installTimeHrs !== undefined && override?.installTimeHrs !== null) { autoInstallTime = override.installTimeHrs; } else if (catalogMatch) { autoInstallTime = catalogMatch.installTimeHrs; }
      const itemQty = override?.quantity ?? count;
      const itemCostPrice = catalogMatch?.costPrice ?? null;
      const itemLabourCost = (autoInstallTime && autoInstallTime > 0 && base.labourRate) ? autoInstallTime * base.labourRate * itemQty : null;
      if (existing) {
        existing.quantity = itemQty;
        if (override?.item) existing.item = override.item;
        if (override?.unitPrice !== undefined) { existing.unitPrice = override.unitPrice; } else if (autoPrice !== null) { existing.unitPrice = autoPrice; }
        existing.costPrice = itemCostPrice;
        existing.installTimeHrs = autoInstallTime;
        existing.labourCost = (existing.installTimeHrs && existing.installTimeHrs > 0 && base.labourRate) ? existing.installTimeHrs * base.labourRate * existing.quantity : null;
      } else {
        base.materials.push({ item: override?.item ?? desc, quantity: itemQty, unitPrice: override?.unitPrice ?? autoPrice, costPrice: itemCostPrice, installTimeHrs: autoInstallTime, labourCost: itemLabourCost, source: materialSource, symbolCode: code });
      }
    }
  }

  for (const mat of base.materials) {
    if (mat.source !== "voice") continue;
    const catalogMatch = matchCatalogPrice(mat.item, catalogItems);
    if (!catalogMatch) continue;
    if (mat.unitPrice === null || mat.unitPrice === undefined || mat.unitPrice === 0) mat.unitPrice = catalogMatch.rate;
    if (mat.costPrice === null || mat.costPrice === undefined) mat.costPrice = catalogMatch.costPrice ?? null;
    if (mat.installTimeHrs === null || mat.installTimeHrs === undefined || mat.installTimeHrs === 0) mat.installTimeHrs = catalogMatch.installTimeHrs ?? null;
    if (mat.installTimeHrs && mat.installTimeHrs > 0 && base.labourRate) mat.labourCost = mat.installTimeHrs * base.labourRate * mat.quantity;
    if (catalogMatch.catalogName) mat.catalogName = catalogMatch.catalogName;
  }
  return base;
}

/** Deep clone QuoteDraftData so edits never mutate mergedData */
function cloneData(d: QuoteDraftData): QuoteDraftData {
  return {
    ...d,
    labour: d.labour.map(l => ({ ...l })),
    materials: d.materials.map(m => ({ ...m })),
    plantHire: (d.plantHire || []).map(p => ({ ...p })),
  };
}

function fmtGBP(value: number): string {
  return value.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

const sourceBadgeStyles: Record<string, { bg: string; color: string }> = {
  takeoff: { bg: "#f5f3ff", color: "#8b5cf6" },
  containment: { bg: "#f0fdfa", color: "#0d9488" },
  voice: { bg: "#f0fdf4", color: "#0f766e" },
  document: { bg: "#fff7ed", color: "#ea580c" },
  catalog: { bg: "#eff6ff", color: "#3b82f6" },
};

// ---- Component ----

export default function QuoteDraftSummary({
  voiceSummary, takeoffs, takeoffOverrides, catalogItems,
  defaultMarkup, defaultLabourRate, defaultPlantMarkup,
  isLoading, hasVoiceNotes, onSave, onTriggerVoiceAnalysis,
}: QuoteDraftSummaryProps) {
  const [isEditing, setIsEditing] = useState(false);
  const mergedData = useMemo(
    () => mergeSummaryWithTakeoffs(voiceSummary, takeoffs, takeoffOverrides, catalogItems, defaultMarkup, defaultLabourRate, defaultPlantMarkup),
    [voiceSummary, takeoffs, takeoffOverrides, catalogItems, defaultMarkup, defaultLabourRate, defaultPlantMarkup]
  );
  const [edited, setEdited] = useState<QuoteDraftData>(cloneData(mergedData));

  // Sync edited state when merged data changes — but ONLY when not editing
  useEffect(() => {
    if (!isEditing) {
      setEdited(cloneData(mergedData));
    }
  }, [mergedData, isEditing]);

  const data = isEditing ? edited : mergedData;
  const hasLabour = data.labour.length > 0;
  const hasMaterials = data.materials.length > 0;
  const hasPlantHire = data.plantHire && data.plantHire.length > 0;
  const hasFinancials = data.markup !== null || data.sundries !== null || data.contingency !== null || data.preliminaries !== null || data.labourRate !== null || data.plantMarkup !== null;
  const isEmpty = !data.jobDescription && !hasLabour && !hasMaterials && !data.notes && !data.clientName;

  const materialSubtotal = useMemo(() => data.materials.reduce((sum, m) => (m.unitPrice != null && m.unitPrice > 0) ? sum + m.unitPrice * m.quantity : sum, 0), [data.materials]);
  const totalMargin = useMemo(() => {
    let marginAmt = 0; let pricedCount = 0;
    for (const m of data.materials) { if (m.unitPrice != null && m.costPrice != null && m.unitPrice > 0 && m.costPrice > 0) { marginAmt += (m.unitPrice - m.costPrice) * m.quantity; pricedCount++; } }
    return { amount: marginAmt, percent: materialSubtotal > 0 ? (marginAmt / materialSubtotal) * 100 : 0, pricedCount };
  }, [data.materials, materialSubtotal]);
  const totalLabourCost = useMemo(() => data.materials.reduce((sum, m) => sum + (m.labourCost ?? 0), 0), [data.materials]);

  const updateField = <K extends keyof QuoteDraftData>(key: K, value: QuoteDraftData[K]) => {
    setEdited((prev) => ({ ...prev, [key]: value }));
  };
  const updateLabour = (index: number, field: string, value: string | number) => {
    setEdited((prev) => {
      const labour = prev.labour.map((l, i) => i === index ? { ...l, [field]: value } : l);
      return { ...prev, labour };
    });
  };
  const updateMaterial = (index: number, field: string, value: string | number | null) => {
    setEdited((prev) => {
      const materials = prev.materials.map((m, i) => i === index ? { ...m, [field]: value } : m);
      return { ...prev, materials };
    });
  };
  const removeMaterial = (index: number) => {
    setEdited((prev) => ({ ...prev, materials: prev.materials.filter((_, i) => i !== index) }));
  };
  const removeLabour = (index: number) => {
    setEdited((prev) => ({ ...prev, labour: prev.labour.filter((_, i) => i !== index) }));
  };
  const updatePlantHire = (index: number, field: string, value: string | number | null) => {
    setEdited((prev) => {
      const plantHire = (prev.plantHire || []).map((p, i) => i === index ? { ...p, [field]: value } : p);
      return { ...prev, plantHire };
    });
  };
  const removePlantHire = (index: number) => {
    setEdited((prev) => ({ ...prev, plantHire: (prev.plantHire || []).filter((_, i) => i !== index) }));
  };
  const addPlantHire = () => {
    setEdited((prev) => ({ ...prev, plantHire: [...(prev.plantHire || []), { description: "", costPrice: null, sellPrice: null, quantity: 1, duration: "" }] }));
  };
  const addMaterial = () => {
    setEdited((prev) => ({ ...prev, materials: [...prev.materials, { item: "", quantity: 1, unitPrice: null, costPrice: null, installTimeHrs: null, labourCost: null, unit: "each", description: "", source: "voice" as const }] }));
  };
  const addLabour = () => {
    setEdited((prev) => ({ ...prev, labour: [...prev.labour, { role: "", quantity: 1, duration: "" }] }));
  };
  const startEditing = () => {
    setEdited(cloneData(mergedData));
    setIsEditing(true);
  };
  const cancelEditing = () => {
    setEdited(cloneData(mergedData));
    setIsEditing(false);
  };
  const handleSave = () => {
    const sanitized: QuoteDraftData = {
      ...edited,
      labour: edited.labour.map((l) => ({ ...l, quantity: Number(l.quantity) || 1 })),
      materials: edited.materials.map((m) => ({
        ...m,
        quantity: Number(m.quantity) || 1,
        unitPrice: m.unitPrice != null ? Number(m.unitPrice) || 0 : null,
        installTimeHrs: m.installTimeHrs != null ? Number(m.installTimeHrs) || 0 : null,
        labourCost: (m.installTimeHrs && edited.labourRate) ? Number(m.installTimeHrs) * Number(edited.labourRate) * (Number(m.quantity) || 1) : null,
      })),
      plantHire: (edited.plantHire || []).filter(p => p.description.trim()).map((p) => ({
        ...p,
        quantity: Number(p.quantity) || 1,
        costPrice: p.costPrice != null ? Number(p.costPrice) || 0 : null,
        sellPrice: p.sellPrice != null ? Number(p.sellPrice) || 0 : null,
      })),
      markup: edited.markup != null ? Number(edited.markup) || 0 : null,
      sundries: edited.sundries != null ? Number(edited.sundries) || 0 : null,
      preliminaries: edited.preliminaries != null ? Number(edited.preliminaries) || 0 : null,
      labourRate: edited.labourRate != null ? Number(edited.labourRate) || 0 : null,
      plantMarkup: edited.plantMarkup != null ? Number(edited.plantMarkup) || 0 : null,
    };
    onSave(sanitized);
    setIsEditing(false);
  };
  const inputStyle = { color: brand.navy, backgroundColor: `${brand.teal}06`, border: `1px solid ${brand.teal}30` };

  const SourceBadge = ({ source, symbolCode, catalogName }: { source: string; symbolCode?: string; catalogName?: string }) => (
    <span className="inline-flex items-center gap-1 flex-wrap">
      {(source === "takeoff" || source === "containment") && symbolCode && (
        <span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: sourceBadgeStyles[source].bg, color: sourceBadgeStyles[source].color }}>
          {source === "takeoff" ? "Takeoff" : "Containment"}: {symbolCode}
        </span>
      )}
      {catalogName && (<span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: sourceBadgeStyles.catalog.bg, color: sourceBadgeStyles.catalog.color }}>Catalog</span>)}
      {source === "voice" && !symbolCode && !catalogName && (<span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: sourceBadgeStyles.voice.bg, color: sourceBadgeStyles.voice.color }}>Voice</span>)}
      {source === "document" && !symbolCode && !catalogName && (<span className="text-[9px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: sourceBadgeStyles.document.bg, color: sourceBadgeStyles.document.color }}>Document</span>)}
    </span>
  );

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
            <span className="text-sm font-medium" style={{ color: brand.navyMuted }}>Building quote draft summary</span>
          </div>
        </div>
      </div>
    );
  }

  if (isEmpty && !hasVoiceNotes) {
    return (
      <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1.5px solid ${brand.border}` }}>
        <div className="px-5 py-3 flex items-center gap-2" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
          <ClipboardList className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Quote Draft Summary</span>
        </div>
        <div className="px-5 py-6 text-center" style={{ backgroundColor: brand.white }}>
          <p className="text-sm" style={{ color: brand.navyMuted }}>Upload files or dictate to build your quote summary</p>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-xl overflow-hidden mb-4" style={{ border: `1.5px solid ${brand.tealBorder}` }}>
      {/* Header */}
      <div className="px-5 py-3 flex items-center justify-between" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
        <div className="flex items-center gap-2">
          <ClipboardList className="h-4 w-4 text-teal-300" />
          <span className="text-sm font-extrabold text-white">Quote Draft Summary</span>
          {isEditing && <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-amber-500/20 text-amber-300">Editing</span>}
        </div>
        <div className="flex items-center gap-2">
          {!isEditing ? (
            <button onClick={startEditing} className="text-xs font-bold px-3 py-1.5 rounded-lg text-teal-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors flex items-center gap-1.5"><Pencil className="h-3 w-3" />Edit</button>
          ) : (
            <button onClick={cancelEditing} className="text-xs font-bold px-3 py-1.5 rounded-lg text-white/60 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors">Cancel</button>
          )}
        </div>
      </div>

      {/* Body */}
      <div className="px-5 py-4 space-y-3" style={{ backgroundColor: brand.white }}>
        <p className="text-[10px] italic px-1 -mb-1" style={{ color: brand.navyMuted }}>AI-assisted summary — review all details, quantities, and prices before generating your quote</p>

        {/* Job description */}
        {(data.jobDescription || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: `${brand.teal}12` }}>
              <FileText className="h-3.5 w-3.5" style={{ color: brand.teal }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Job</p>
              {isEditing ? (
                <textarea
                  value={edited.jobDescription}
                  onChange={(e) => updateField("jobDescription", e.target.value)}
                  placeholder="Job description — what's the scope of work?"
                  rows={3}
                  className="w-full text-sm font-medium px-2.5 py-2 rounded-md outline-none focus:ring-1 focus:ring-teal-300 resize-none"
                  style={inputStyle}
                />
              ) : (
                <p className="text-sm font-medium leading-relaxed" style={{ color: brand.navy }}>{data.jobDescription}</p>
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
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1" style={{ color: brand.navyMuted }}>Labour</p>
              {isEditing ? (
                <div className="space-y-1.5">
                  {edited.labour.map((l, i) => (
                    <div key={i} className="flex gap-1.5 items-center">
                      <button onClick={() => removeLabour(i)} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-red-400 hover:text-red-600 flex-shrink-0 transition-colors" title="Remove"><X className="h-3 w-3" /></button>
                      <input type="number" value={l.quantity} onChange={(e) => updateLabour(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1.5 rounded-md text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                      <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                      <input type="text" value={l.role} onChange={(e) => updateLabour(i, "role", e.target.value)} className="flex-1 text-sm font-medium px-2 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} placeholder="Role" />
                      <input type="text" value={l.duration} onChange={(e) => updateLabour(i, "duration", e.target.value)} placeholder="Duration" className="w-28 text-sm font-medium px-2 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                    </div>
                  ))}
                  <button onClick={addLabour} className="text-xs font-medium px-2.5 py-1 rounded hover:opacity-80 flex items-center gap-1" style={{ color: "#3b82f6", backgroundColor: "#eff6ff" }}><Plus className="h-3 w-3" /> Add Labour</button>
                </div>
              ) : (
                <div className="flex flex-wrap gap-2">
                  {data.labour.map((l, i) => (
                    <div key={i} className="flex items-center gap-2 px-3 py-2 rounded-lg text-sm" style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                      <span className="font-bold" style={{ color: "#1d4ed8" }}>{l.quantity}</span>
                      <span style={{ color: brand.navyMuted }}>×</span>
                      <span className="font-semibold" style={{ color: brand.navy }}>{l.role}</span>
                      {l.duration && <span className="text-xs px-1.5 py-0.5 rounded" style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}>{l.duration}</span>}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* ======== UNIFIED LINE ITEMS ======== */}
        {(hasMaterials || isEditing) && (
          <div>
            <div className="flex items-center gap-2 mb-1.5">
              <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0" style={{ backgroundColor: "#f0fdf4" }}>
                <Package className="h-3.5 w-3.5" style={{ color: "#22c55e" }} />
              </div>
              <p className="text-[11px] font-bold uppercase tracking-wider" style={{ color: brand.navyMuted }}>Line Items</p>
            </div>

            {isEditing ? (
              <div className="space-y-2">
                {edited.materials.map((m, i) => {
                  const labourRate = edited.labourRate || 0;
                  const calcLabour = (m.installTimeHrs && labourRate) ? m.installTimeHrs * labourRate * m.quantity : null;
                  const lineTotal = (m.unitPrice ?? 0) * m.quantity;
                  const marginAmt = (m.unitPrice && m.costPrice && m.unitPrice > 0 && m.costPrice > 0) ? (m.unitPrice - m.costPrice) * m.quantity : null;
                  const marginPct = (m.unitPrice && m.costPrice && m.unitPrice > 0) ? ((m.unitPrice - m.costPrice) / m.unitPrice * 100) : null;
                  return (
                    <div key={i} className="rounded-lg p-3" style={{ backgroundColor: "#f8fffe", border: "1px solid #e5e7eb" }}>
                      {/* Row 1: remove + item name + badges */}
                      <div className="flex gap-1.5 items-start mb-1.5">
                        <button onClick={() => removeMaterial(i)} className="w-5 h-5 flex items-center justify-center rounded-full hover:bg-red-100 text-red-400 hover:text-red-600 flex-shrink-0 mt-1 transition-colors" title="Remove"><X className="h-3.5 w-3.5" /></button>
                        <div className="flex-1 min-w-0">
                          <input type="text" value={m.item} onChange={(e) => updateMaterial(i, "item", e.target.value)} className="w-full text-sm font-bold px-2.5 py-1.5 rounded-md outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} placeholder="Item name" />
                        </div>
                        <SourceBadge source={m.source} symbolCode={m.symbolCode} catalogName={m.catalogName} />
                      </div>
                      {/* Row 2: description */}
                      <div className="ml-7 mb-2">
                        <input type="text" value={m.description || ""} onChange={(e) => updateMaterial(i, "description", e.target.value)} className="w-full text-xs px-2.5 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} placeholder="Description (optional)" />
                      </div>
                      {/* Row 3: qty, unit, rate, cost, total, margin */}
                      <div className="flex items-center gap-2.5 ml-7 flex-wrap">
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold" style={{ color: brand.navyMuted }}>QTY</span>
                          <input type="number" value={m.quantity} onChange={(e) => updateMaterial(i, "quantity", parseInt(e.target.value) || 0)} className="w-14 text-sm font-medium px-2 py-1 rounded text-center outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold" style={{ color: brand.navyMuted }}>UNIT</span>
                          <input type="text" value={m.unit || "each"} onChange={(e) => updateMaterial(i, "unit", e.target.value)} className="w-16 text-sm px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold" style={{ color: brand.navyMuted }}>RATE £</span>
                          <input type="number" value={m.unitPrice ?? ""} onChange={(e) => updateMaterial(i, "unitPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm font-medium px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                        <div className="flex items-center gap-1">
                          <span className="text-[10px] font-bold" style={{ color: brand.navyMuted }}>COST £</span>
                          <input type="number" value={m.costPrice ?? ""} onChange={(e) => updateMaterial(i, "costPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm font-medium px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
                        </div>
                        {lineTotal > 0 && <span className="text-xs font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#f0f9ff", color: brand.navy }}>= £{fmtGBP(lineTotal)}</span>}
                        {marginAmt != null && marginPct != null && <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: marginAmt >= 0 ? "#f0fdf4" : "#fef2f2", color: marginAmt >= 0 ? "#0f766e" : "#dc2626" }}>Margin: £{fmtGBP(marginAmt)} ({marginPct.toFixed(0)}%)</span>}
                      </div>
                      {/* Row 4: install time + labour */}
                      <div className="flex items-center gap-2 ml-7 mt-1.5">
                        <span className="text-[10px] font-bold" style={{ color: brand.navyMuted }}>INSTALL:</span>
                        <input type="number" step="0.5" value={m.installTimeHrs ?? ""} onChange={(e) => updateMaterial(i, "installTimeHrs", e.target.value ? parseFloat(e.target.value) : null)} placeholder="hrs" className="w-16 text-xs px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-300" style={inputStyle} />
                        <span className="text-[10px]" style={{ color: brand.navyMuted }}>hrs/unit</span>
                        {calcLabour != null && calcLabour > 0 && <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}>Labour: £{fmtGBP(calcLabour)}</span>}
                      </div>
                    </div>
                  );
                })}
                <button onClick={addMaterial} className="text-xs font-medium px-2.5 py-1.5 rounded hover:opacity-80 flex items-center gap-1" style={{ color: "#22c55e", backgroundColor: "#f0fdf4" }}><Plus className="h-3 w-3" /> Add Line Item</button>
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full" style={{ borderCollapse: "collapse" }}>
                  <thead>
                    <tr style={{ borderBottom: `2px solid ${brand.border}` }}>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: brand.navyMuted }}>Item</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: brand.navyMuted }}>Qty</th>
                      <th className="text-left text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: brand.navyMuted }}>Unit</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: brand.navyMuted }}>Rate</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: brand.navyMuted }}>Total</th>
                      <th className="text-right text-[10px] font-bold uppercase tracking-wider py-1.5 px-2" style={{ color: "#0f766e" }}>Margin</th>
                    </tr>
                  </thead>
                  <tbody>
                    {data.materials.map((m, i) => {
                      const lineTotal = (m.unitPrice != null && m.unitPrice > 0) ? m.unitPrice * m.quantity : null;
                      const marginAmt = (m.unitPrice && m.costPrice && m.unitPrice > 0 && m.costPrice > 0) ? (m.unitPrice - m.costPrice) * m.quantity : null;
                      const marginPct = (m.unitPrice && m.costPrice && m.unitPrice > 0) ? ((m.unitPrice - m.costPrice) / m.unitPrice * 100) : null;
                      return (
                        <tr key={i} style={{ borderBottom: `1px solid ${brand.borderLight}` }}>
                          <td className="py-2 px-2 align-top">
                            <div className="flex items-center gap-1.5 flex-wrap">
                              <span className="text-[13px] font-semibold" style={{ color: brand.navy }}>{m.item}</span>
                              <SourceBadge source={m.source} symbolCode={m.symbolCode} catalogName={m.catalogName} />
                            </div>
                            {m.description && <p className="text-xs mt-0.5 leading-snug" style={{ color: brand.navyMuted }}>{m.description}</p>}
                            {m.installTimeHrs != null && m.installTimeHrs > 0 && (
                              <div className="mt-0.5">
                                <span className="text-[10px] font-bold px-1.5 py-0.5 rounded inline-flex items-center gap-1" style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}>
                                  Install: {m.installTimeHrs}hrs/unit{m.labourCost != null && m.labourCost > 0 && <>{" "}→ Labour: £{fmtGBP(m.labourCost)}</>}
                                </span>
                              </div>
                            )}
                          </td>
                          <td className="text-right py-2 px-2 align-top text-[13px] font-semibold" style={{ color: brand.navy }}>{m.quantity}</td>
                          <td className="py-2 px-2 align-top text-[13px]" style={{ color: brand.navyMuted }}>{m.unit || "each"}</td>
                          <td className="text-right py-2 px-2 align-top text-[13px]" style={{ color: m.unitPrice != null && m.unitPrice > 0 ? brand.navy : brand.navyMuted }}>{m.unitPrice != null && m.unitPrice > 0 ? `£${fmtGBP(m.unitPrice)}` : "—"}</td>
                          <td className="text-right py-2 px-2 align-top text-[13px] font-bold" style={{ color: lineTotal ? brand.navy : brand.navyMuted }}>{lineTotal ? `£${fmtGBP(lineTotal)}` : "—"}</td>
                          <td className="text-right py-2 px-2 align-top">
                            {marginAmt != null && marginPct != null ? (
                              <span className="text-xs font-semibold" style={{ color: marginAmt >= 0 ? "#0f766e" : "#dc2626" }}>£{fmtGBP(marginAmt)} ({marginPct.toFixed(0)}%)</span>
                            ) : <span className="text-[13px]" style={{ color: brand.navyMuted }}>—</span>}
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                  {materialSubtotal > 0 && (
                    <tfoot>
                      <tr style={{ borderTop: `2px solid ${brand.teal}`, backgroundColor: brand.tealBg }}>
                        <td colSpan={4} className="text-right py-2 px-2 text-sm font-bold" style={{ color: brand.navy }}>Subtotal{data.materials.some(m => !m.unitPrice || m.unitPrice <= 0) ? " (priced items)" : ""}</td>
                        <td className="text-right py-2 px-2 text-sm font-bold" style={{ color: brand.navy }}>£{fmtGBP(materialSubtotal)}</td>
                        <td className="py-2 px-2"></td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
            )}

            {!isEditing && totalMargin.pricedCount > 0 && (
              <div className="mt-2 px-3 py-2 rounded-lg flex items-center justify-between flex-wrap gap-2" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                <div>
                  <span className="text-xs font-medium" style={{ color: "#0f766e" }}>Total Margin: </span>
                  <span className="text-sm font-bold" style={{ color: "#0f766e" }}>£{fmtGBP(totalMargin.amount)} ({totalMargin.percent.toFixed(1)}%)</span>
                  <span className="block text-[10px]" style={{ color: "#5b8a7a" }}>Margin on {totalMargin.pricedCount} priced item{totalMargin.pricedCount !== 1 ? "s" : ""} · Internal only — not on PDF</span>
                </div>
                {totalLabourCost > 0 && (
                  <span className="text-[10px] font-bold px-2 py-1 rounded" style={{ backgroundColor: "#dbeafe", color: "#1d4ed8" }}>Total Install Labour: £{fmtGBP(totalLabourCost)}</span>
                )}
              </div>
            )}
          </div>
        )}

        {/* Plant / Hire */}
        {(hasPlantHire || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#fef3c7" }}>
              <Truck className="h-3.5 w-3.5" style={{ color: "#d97706" }} />
            </div>
            <div className="flex-1">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-1.5" style={{ color: brand.navyMuted }}>Plant / Hire</p>
              {isEditing ? (
                <div className="space-y-2">
                  {(edited.plantHire || []).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 flex-wrap">
                      <span className="text-red-400 cursor-pointer text-sm font-bold" onClick={() => removePlantHire(i)} title="Remove">×</span>
                      <input type="number" min="1" value={p.quantity} onChange={(e) => updatePlantHire(i, "quantity", parseInt(e.target.value) || 1)} className="w-14 text-sm font-bold px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-amber-300" style={inputStyle} />
                      <span className="text-sm" style={{ color: brand.navyMuted }}>×</span>
                      <input value={p.description} onChange={(e) => updatePlantHire(i, "description", e.target.value)} placeholder="Equipment description" className="flex-1 min-w-[180px] text-sm px-2.5 py-1.5 rounded outline-none focus:ring-1 focus:ring-amber-300" style={inputStyle} />
                      <input value={p.duration} onChange={(e) => updatePlantHire(i, "duration", e.target.value)} placeholder="Duration" className="w-28 text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-amber-300" style={inputStyle} />
                      <div className="flex items-center gap-1"><span className="text-[10px]" style={{ color: brand.navyMuted }}>Cost £</span><input type="number" step="0.01" value={p.costPrice ?? ""} onChange={(e) => updatePlantHire(i, "costPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-amber-300" style={inputStyle} /></div>
                      <div className="flex items-center gap-1"><span className="text-[10px]" style={{ color: brand.navyMuted }}>Sell £</span><input type="number" step="0.01" value={p.sellPrice ?? ""} onChange={(e) => updatePlantHire(i, "sellPrice", e.target.value ? parseFloat(e.target.value) : null)} placeholder="—" className="w-20 text-sm px-2 py-1.5 rounded outline-none focus:ring-1 focus:ring-amber-300" style={inputStyle} /></div>
                      {p.costPrice != null && p.sellPrice != null && p.sellPrice > 0 && p.costPrice > 0 && (
                        <span className="text-[10px] font-bold px-2 py-0.5 rounded" style={{ backgroundColor: "#f0fdf4", color: "#0f766e" }}>Margin: £{fmtGBP((p.sellPrice - p.costPrice) * p.quantity)} ({((p.sellPrice - p.costPrice) / p.sellPrice * 100).toFixed(0)}%)</span>
                      )}
                    </div>
                  ))}
                  <button onClick={addPlantHire} className="text-xs font-medium px-2.5 py-1.5 rounded hover:opacity-80 flex items-center gap-1" style={{ color: "#d97706", backgroundColor: "#fef3c7" }}><Plus className="h-3 w-3" /> Add Plant / Hire Item</button>
                </div>
              ) : (
                <div className="space-y-1">
                  {(data.plantHire || []).map((p, i) => (
                    <div key={i} className="flex items-center gap-2 text-sm font-medium py-1.5 px-2.5 rounded-lg flex-wrap" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
                      <span className="font-extrabold" style={{ color: "#d97706", minWidth: 28 }}>{p.quantity}</span>
                      <span style={{ color: brand.navyMuted }}>×</span>
                      <span style={{ color: brand.navy }}>{p.description}</span>
                      {p.duration && <span className="text-[10px] px-1.5 py-0.5 rounded" style={{ backgroundColor: "#fef3c7", color: "#92400e" }}>{p.duration}</span>}
                      {p.sellPrice != null && p.sellPrice > 0 && <span className="text-xs" style={{ color: brand.navyMuted }}>@ £{fmtGBP(p.sellPrice)}</span>}
                      {p.costPrice != null && p.sellPrice != null && p.sellPrice > 0 && p.costPrice > 0 && (
                        <span className="text-[10px] font-bold px-1.5 py-0.5 rounded" style={{ backgroundColor: "#f0fdf4", color: "#0f766e" }}>Margin: £{fmtGBP((p.sellPrice - p.costPrice) * p.quantity)} ({((p.sellPrice - p.costPrice) / p.sellPrice * 100).toFixed(0)}%)</span>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Financials */}
        {(hasFinancials || isEditing) && (
          <div>
            <div className="flex flex-wrap gap-2">
              {(data.labourRate !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#eff6ff", border: "1px solid #bfdbfe" }}>
                  <PoundSterling className="h-3.5 w-3.5" style={{ color: "#3b82f6" }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Labour: £</span><input type="number" value={edited.labourRate ?? ""} onChange={(e) => updateField("labourRate", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-blue-300" style={inputStyle} /><span className="text-sm" style={{ color: brand.navyMuted }}>/hr</span></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Labour: £{data.labourRate}/hr</span>)}
                </div>
              )}
              {(data.markup !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${brand.teal}08`, border: `1px solid ${brand.teal}20` }}>
                  <Percent className="h-3.5 w-3.5" style={{ color: brand.teal }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Material Markup:</span><input type="number" value={edited.markup ?? ""} onChange={(e) => updateField("markup", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} /><span className="text-sm" style={{ color: brand.navyMuted }}>%</span></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Material Markup: {data.markup}%</span>)}
                </div>
              )}
              {(data.plantMarkup !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef9ee", border: "1px solid #fde68a" }}>
                  <Percent className="h-3.5 w-3.5" style={{ color: "#d97706" }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Plant Markup:</span><input type="number" value={edited.plantMarkup ?? ""} onChange={(e) => updateField("plantMarkup", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} /><span className="text-sm" style={{ color: brand.navyMuted }}>%</span></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Plant Markup: {data.plantMarkup}%</span>)}
                </div>
              )}
              {(data.sundries !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: `${brand.navy}06`, border: `1px solid ${brand.navy}12` }}>
                  <PoundSterling className="h-3.5 w-3.5" style={{ color: brand.navy }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Sundries: £</span><input type="number" value={edited.sundries ?? ""} onChange={(e) => updateField("sundries", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} /></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Sundries: £{data.sundries}</span>)}
                </div>
              )}
              {(data.preliminaries !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#f0fdf4", border: "1px solid #bbf7d0" }}>
                  <Percent className="h-3.5 w-3.5" style={{ color: "#0f766e" }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Prelims:</span><input type="number" value={edited.preliminaries ?? ""} onChange={(e) => updateField("preliminaries", e.target.value ? parseFloat(e.target.value) : null)} className="w-16 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} /><span className="text-sm" style={{ color: brand.navyMuted }}>%</span></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Prelims: {data.preliminaries}%</span>)}
                </div>
              )}
              {(data.contingency !== null || isEditing) && (
                <div className="flex items-center gap-2 px-3 py-2 rounded-lg" style={{ backgroundColor: "#fef9ee", border: "1px solid #fde68a" }}>
                  <PoundSterling className="h-3.5 w-3.5" style={{ color: "#d97706" }} />
                  {isEditing ? (<div className="flex items-center gap-1"><span className="text-sm font-bold" style={{ color: brand.navy }}>Contingency:</span><input type="text" value={edited.contingency ?? ""} onChange={(e) => updateField("contingency", e.target.value || null)} className="w-24 text-sm font-bold px-2 py-1 rounded outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} /></div>) : (<span className="text-sm font-bold" style={{ color: brand.navy }}>Contingency: {data.contingency}</span>)}
                </div>
              )}
            </div>
            <p className="text-[10px] mt-1.5 ml-1" style={{ color: brand.navyMuted }}>Defaults loaded from Settings — update in <a href="/settings" className="underline hover:no-underline" style={{ color: brand.teal }}>Settings</a> to change defaults</p>
          </div>
        )}

        {/* Notes */}
        {(data.notes || isEditing) && (
          <div className="flex items-start gap-3">
            <div className="w-7 h-7 rounded-lg flex items-center justify-center flex-shrink-0 mt-0.5" style={{ backgroundColor: "#f8fafc" }}>
              <FileText className="h-3.5 w-3.5" style={{ color: brand.navyMuted }} />
            </div>
            <div className="flex-1 min-w-0">
              <p className="text-[11px] font-bold uppercase tracking-wider mb-0.5" style={{ color: brand.navyMuted }}>Notes</p>
              {isEditing ? (
                <textarea value={edited.notes || ""} onChange={(e) => updateField("notes", e.target.value || null)} placeholder="Additional notes..." rows={2} className="w-full text-sm px-2.5 py-2 rounded-md resize-none outline-none focus:ring-1 focus:ring-teal-300" style={inputStyle} />
              ) : (
                <p className="text-sm" style={{ color: brand.navyMuted }}>{data.notes}</p>
              )}
            </div>
          </div>
        )}

      </div>

      {/* Save bar */}
      {isEditing && (
        <div className="px-5 py-3 flex items-center gap-3" style={{ backgroundColor: brand.slate, borderTop: `1px solid ${brand.border}` }}>
          <button onClick={handleSave} className="flex-1 flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg shadow-sm transition-colors" style={{ backgroundColor: brand.teal, color: "#fff" }}>
            <Check className="h-4 w-4" />Save Changes
          </button>
          <button onClick={cancelEditing} className="flex items-center justify-center gap-2 px-4 py-2.5 text-sm font-bold rounded-lg transition-colors" style={{ backgroundColor: brand.white, color: brand.navy, border: `1.5px solid ${brand.border}` }}>
            Cancel
          </button>
        </div>
      )}
    </div>
  );
}

export type { QuoteDraftData, MaterialItem, LabourItem };
