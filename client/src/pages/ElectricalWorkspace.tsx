/**
 * ElectricalWorkspace.tsx
 * Phase 2 + Phase 3
 *
 * Phase 2 fix: legend now uploads as inputType="pdf" then calls setReferenceOnly.
 *   - Drawing filter: inputType==="pdf" && !mimeType?.includes(";reference=true")
 *   - Legend filter:  inputType==="pdf" &&  mimeType?.includes(";reference=true")
 *   - This feeds parseLegend → symbolMappings → tenderContext → all drawing takeoffs re-run
 *
 * Phase 3: Takeoff tab — combined symbol review table for all drawings on this quote.
 *   - Data: electricalTakeoff.list({ quoteId })  (one record per drawing)
 *   - Descriptions: merge SYMBOL_DESCRIPTIONS (static) + tenderContext.symbolMappings (legend)
 *   - Excluded codes: persisted via electricalTakeoff.updateExcludedCodes
 *   - Re-analyse: electricalTakeoff.analyze({ inputId, quoteId, force: true })
 *
 * Layout contract (unchanged):
 *   Outer: h-full flex flex-col overflow-hidden
 *   Header: shrink-0 h-14 | Tab bar: shrink-0 h-10
 *   Content: flex-1 overflow-hidden → sidebar + right panel each scroll independently
 */

import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, Zap, Upload, Grid, Calculator,
  FileText, File, X, CheckCircle, AlertCircle, Clock,
  Mail, BookOpen, RefreshCw, RotateCcw, AlertTriangle,
  ToggleLeft, ToggleRight, Eye, Printer, Info,
  Sparkles, Trash2, Plus,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteInput } from "@shared/schema";
import ElectricalQDS, { type IncludedTakeoffRow } from "@/components/electrical/ElectricalQDS";
import ElectricalDrawingViewer from "@/components/electrical/ElectricalDrawingViewer";
import ElectricalReferenceViewer, { getDocTypeBadgeProps } from "@/components/electrical/ElectricalReferenceViewer";

// ─── Constants ────────────────────────────────────────────────────────────────
const MAX_PDF_MB   = 20;
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

// ─── Types ────────────────────────────────────────────────────────────────────
type Tab = "inputs" | "takeoff" | "qds" | "quote" | "pdf";

interface TabDef { id: Tab; label: string; icon: React.ComponentType<{ className?: string }>; }
const TABS: TabDef[] = [
  { id: "inputs",  label: "Inputs",  icon: Upload     },
  { id: "takeoff", label: "Takeoff", icon: Grid       },
  { id: "qds",     label: "QDS",     icon: Calculator },
  { id: "quote",   label: "Quote",   icon: FileText   },
  { id: "pdf",     label: "PDF",     icon: File       },
];

type TakeoffRow = {
  key: string;
  takeoffId: number;
  inputId: number;
  drawingName: string;
  code: string;
  description: string;
  count: number;
  status: "matched" | "review" | "excluded";
  questionText?: string;
};

// ─── Props ────────────────────────────────────────────────────────────────────
interface ElectricalWorkspaceProps { quoteId: number; }

// ─── Helpers ──────────────────────────────────────────────────────────────────
function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload  = () => resolve((reader.result as string).split(",")[1]);
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

function shortFilename(raw: string | null | undefined): string {
  if (!raw) return "Drawing";
  // Strip R2 path prefix (orgs/.../quotes/.../filename.pdf)
  const parts = raw.split("/");
  const base = parts[parts.length - 1] ?? raw;
  // Strip .pdf extension for display
  return base.replace(/\.pdf$/i, "");
}

function getExcludedCodes(takeoff: { userAnswers?: Record<string, string> | null }): string[] {
  try {
    const ua = (takeoff.userAnswers ?? {}) as Record<string, string>;
    return JSON.parse(ua._excludedCodes ?? "[]");
  } catch { return []; }
}

// ─── Status badge ─────────────────────────────────────────────────────────────
function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "pending")
    return <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal gap-1"><Clock className="h-2.5 w-2.5" />Pending</Badge>;
  if (status === "processing")
    return <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-amber-100 text-amber-700 border-amber-200 gap-1"><Loader2 className="h-2.5 w-2.5 animate-spin" />Processing</Badge>;
  if (status === "complete" || status === "completed")
    return <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-green-100 text-green-700 border-green-200 gap-1"><CheckCircle className="h-2.5 w-2.5" />Ready</Badge>;
  if (status === "error" || status === "failed")
    return <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-red-100 text-red-700 border-red-200 gap-1"><AlertCircle className="h-2.5 w-2.5" />Error</Badge>;
  return null;
}

// ─── Main component ───────────────────────────────────────────────────────────
export default function ElectricalWorkspace({ quoteId }: ElectricalWorkspaceProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab]             = useState<Tab>("inputs");
  const [activeDrawingId, setActiveDrawingId] = useState<number | null>(null);
  const [viewingTakeoffId,   setViewingTakeoffId]   = useState<number | null>(null);
  const [viewingReferenceId, setViewingReferenceId] = useState<number | null>(null);

  // Upload states
  const [isUploadingDrawing, setIsUploadingDrawing] = useState(false);
  const [isUploadingLegend,  setIsUploadingLegend]  = useState(false);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const legendInputRef  = useRef<HTMLInputElement>(null);
  const [isDraggingOver, setIsDraggingOver]   = useState(false);

  // Scope/email text
  const [scopeText, setScopeText]       = useState("");
  const [scopeInputId, setScopeInputId] = useState<number | null>(null);
  const [scopeDirty, setScopeDirty]     = useState(false);
  const [isSavingScope, setIsSavingScope] = useState(false);

  // Polling gate — declared BEFORE useQuery to avoid TDZ crash
  const [hasProcessingInputs, setHasProcessingInputs] = useState(false);

  // ── Quote data ───────────────────────────────────────────────────────────────
  const { data: fullQuote, isLoading, error, refetch } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0, retry: 1, refetchInterval: hasProcessingInputs ? 3000 : false }
  );

  const inputs: QuoteInput[] = fullQuote?.inputs ?? [];
  // Phase 2 fix: legend is now inputType=pdf with ;reference=true mimeType.
  // Phase 23: reference-only docs now also carry ;docType=<type>.
  //   drawings       = floor-plan PDFs (no ;reference=true)
  //   legend         = reference PDF where docType=legend, OR ;reference=true without docType
  //                    (backwards compat for docs uploaded before classification existed)
  //   referenceInputs = all other reference PDFs (equipment_schedule, db_schedule,
  //                    riser_schematic, specification) — shown in sidebar + Inputs tab
  const drawings = inputs.filter(i => i.inputType === "pdf" && !i.mimeType?.includes(";reference=true"));
  const legend   = inputs.find(i  => {
    if (i.inputType !== "pdf" || !i.mimeType?.includes(";reference=true")) return false;
    const dtMatch = i.mimeType.match(/;docType=([^;]*)/);
    const dt = dtMatch?.[1] ?? null;
    // If docType is absent (old upload) or is 'legend', treat as legend slot
    return !dt || dt === 'legend';
  }) ?? null;
  const referenceInputs = inputs.filter(i => {
    if (i.inputType !== "pdf" || !i.mimeType?.includes(";reference=true")) return false;
    const dtMatch = i.mimeType.match(/;docType=([^;]*)/);
    const dt = dtMatch?.[1] ?? null;
    // Include only docs with an explicit non-legend docType
    return dt && dt !== 'legend';
  });
  const scopeRecord = inputs.find(i => i.inputType === "email") ?? null;

  // Keep polling flag in sync
  useEffect(() => {
    setHasProcessingInputs(
      inputs.some(i => i.processingStatus === "processing" || i.processingStatus === "pending")
    );
  }, [fullQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first drawing
  useEffect(() => {
    if (drawings.length > 0 && activeDrawingId === null) setActiveDrawingId(drawings[0].id);
    if (drawings.length === 0) setActiveDrawingId(null);
  }, [drawings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate scope (once)
  const scopeHydrated = useRef(false);
  useEffect(() => {
    if (scopeRecord && !scopeHydrated.current) {
      setScopeText(scopeRecord.content ?? "");
      setScopeInputId(scopeRecord.id);
      scopeHydrated.current = true;
    }
  }, [scopeRecord]);

  // ── Takeoff data (Phase 3) ───────────────────────────────────────────────────
  const [hasPendingTakeoffs, setHasPendingTakeoffs] = useState(false);
  const { data: takeoffList, refetch: refetchTakeoffs } = trpc.electricalTakeoff.list.useQuery(
    { quoteId },
    { enabled: quoteId > 0, refetchInterval: (hasProcessingInputs || hasPendingTakeoffs) ? 3000 : false }
  );

  // Symbol descriptions: static built-ins merged with legend mappings
  const legendMappings = (fullQuote?.tenderContext as any)?.symbolMappings ?? {};
  const legendDescriptions: Record<string, string> = {};
  for (const [k, v] of Object.entries(legendMappings)) {
    legendDescriptions[k.toUpperCase()] = (v as any)?.meaning ?? String(v);
  }
  const baseDescriptions: Record<string, string> =
    (takeoffList?.[0] as any)?.symbolDescriptions ?? {};
  const allDescriptions: Record<string, string> = { ...baseDescriptions, ...legendDescriptions };

  // Dynamic symbol styles: compute a distinct colour for every code found across all takeoffs.
  // Codes in the static SYMBOL_STYLES table keep their existing colour.
  // Unknown codes get a deterministic generated colour — never grey.
  // This is a pure client-side computation matching the server palette in electricalTakeoff.ts.
  // Option A — bold primary palette. All mid-brightness, fully saturated.
  // Visible on white drawing backgrounds. No pastels, no near-whites.
  // Must stay in sync with COLOUR_PALETTE in electricalTakeoff.ts (server).
  const COLOUR_PALETTE_CLIENT = [
    '#FF0000', // red
    '#FF6600', // orange
    '#CC9900', // gold
    '#00AA00', // green
    '#0066FF', // blue
    '#9900CC', // violet
    '#FF0099', // hot pink
    '#00AAAA', // teal
    '#FF3300', // crimson
    '#0099FF', // sky
    '#CC3300', // brick
    '#006633', // forest
    '#6600FF', // purple
    '#FF6699', // rose
    '#009966', // emerald
    '#CC6600', // copper
    '#3300CC', // indigo
    '#FF0044', // scarlet
    '#00CC66', // mint
    '#FF9900' // amber
  ];
  const STATIC_STYLES_CLIENT: Record<string, { colour: string; shape: string; radius: number }> = {
    'J':     { colour: '#00DD00', shape: 'circle', radius: 28 },
    'JE':    { colour: '#FF8200', shape: 'circle', radius: 32 },
    'N':     { colour: '#4488FF', shape: 'circle', radius: 22 },
    'AD':    { colour: '#00AAFF', shape: 'square', radius: 26 },
    'ADE':   { colour: '#FF8800', shape: 'square', radius: 28 },
    'EX':    { colour: '#00DDDD', shape: 'circle', radius: 24 },
    'SO':    { colour: '#FF4444', shape: 'diamond', radius: 26 },
    'CO':    { colour: '#FF2266', shape: 'diamond', radius: 24 },
    'HF':    { colour: '#FF44AA', shape: 'diamond', radius: 24 },
    'P1':    { colour: '#CC44FF', shape: 'square', radius: 22 },
    'P2':    { colour: '#CC44FF', shape: 'square', radius: 22 },
    'P3':    { colour: '#CC44FF', shape: 'square', radius: 22 },
    'P4':    { colour: '#CC44FF', shape: 'square', radius: 24 },
    'LCM':   { colour: '#FFDD00', shape: 'square', radius: 20 },
    'EXIT1': { colour: '#00FFCC', shape: 'square', radius: 30 },
    'FARP':  { colour: '#FF4444', shape: 'square', radius: 28 },
    'VESDA': { colour: '#FF4444', shape: 'square', radius: 28 },
  };
  // useMemo so styles only recompute when takeoffList changes, not on every render.
  const allSymbolStyles = useMemo(() => {
    const allCodes = new Set<string>();
    for (const t of (takeoffList ?? [])) {
      for (const code of Object.keys((t.counts ?? {}) as Record<string, number>)) {
        allCodes.add(code);
      }
    }
    const result: Record<string, { colour: string; shape: string; radius: number }> = {};
    for (const code of allCodes) {
      if (STATIC_STYLES_CLIENT[code]) {
        result[code] = STATIC_STYLES_CLIENT[code];
      } else {
        let hash = 0;
        for (let i = 0; i < code.length; i++) hash = (hash * 31 + code.charCodeAt(i)) & 0xFFFFFF;
        const colour = COLOUR_PALETTE_CLIENT[Math.abs(hash) % COLOUR_PALETTE_CLIENT.length];
        result[code] = { colour, shape: 'circle', radius: 20 };
      }
    }
    return result;
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [takeoffList]);

  // Detect whether drawings still have no takeoff (auto-takeoff still running)
  useEffect(() => {
    if (!takeoffList || !drawings.length) return;
    const takeoffInputIds = new Set(takeoffList.map(t => Number(t.inputId)));
    const pending = drawings.some(d =>
      (d.processingStatus === "completed" || d.processingStatus === "complete") &&
      !takeoffInputIds.has(d.id)
    );
    setHasPendingTakeoffs(pending);
  }, [takeoffList, fullQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Local excluded codes — one Set<string> per takeoffId
  // Initialized from server once; optimistically updated on toggle
  const initializedTakeoffs = useRef<Set<number>>(new Set());
  const [localExcluded, setLocalExcluded] = useState<Record<number, string[]>>({});
  useEffect(() => {
    if (!takeoffList) return;
    const updates: Record<number, string[]> = {};
    for (const t of takeoffList) {
      if (!initializedTakeoffs.current.has(t.id)) {
        updates[t.id] = getExcludedCodes(t);
        initializedTakeoffs.current.add(t.id);
      }
    }
    if (Object.keys(updates).length) setLocalExcluded(prev => ({ ...prev, ...updates }));
  }, [takeoffList]);

  // ── Mutations ────────────────────────────────────────────────────────────────
  const uploadFile = trpc.inputs.uploadFile.useMutation({
    onSuccess: () => { refetch(); refetchTakeoffs(); },
    onError:   (e) => toast.error("Upload failed: " + e.message),
  });

  const setReferenceOnly = trpc.electricalTakeoff.setReferenceOnly.useMutation({
    onSuccess: () => { refetch(); refetchTakeoffs(); },
    onError:   (e) => toast.error("Legend processing failed: " + e.message),
  });

  const createInput = trpc.inputs.create.useMutation({
    onSuccess: (data) => { if (data?.id) setScopeInputId((data as any).id); refetch(); },
    onError:   (e) => toast.error("Failed to save scope: " + e.message),
  });

  const updateContent = trpc.inputs.updateContent.useMutation({
    onSuccess: () => refetch(),
    onError:   (e) => toast.error("Failed to update scope: " + e.message),
  });

  const deleteInput = trpc.inputs.delete.useMutation({
    onSuccess: () => { refetch(); refetchTakeoffs(); },
    onError:   (e) => toast.error("Failed to delete: " + e.message),
  });

  const updateExcludedCodes = trpc.electricalTakeoff.updateExcludedCodes.useMutation({
    onSuccess: () => refetchTakeoffs(),
    onError:   (e) => toast.error("Failed to update: " + e.message),
  });

  const analyzeDrawing = trpc.electricalTakeoff.analyze.useMutation({
    onSuccess: () => { refetchTakeoffs(); toast.success("Re-analysis started."); },
    onError:   (e) => toast.error("Re-analysis failed: " + e.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────
  const handleDrawingUpload = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter(f => f.type === "application/pdf");
    if (!arr.length) { toast.error("Please upload PDF files only."); return; }
    setIsUploadingDrawing(true);
    try {
      for (const file of arr) {
        if (file.size > MAX_PDF_BYTES) { toast.error(`${file.name} exceeds ${MAX_PDF_MB}MB.`); continue; }
        await uploadFile.mutateAsync({
          quoteId, filename: file.name, contentType: "application/pdf",
          base64Data: await fileToBase64(file), inputType: "pdf",
        });
      }
    } finally { setIsUploadingDrawing(false); }
  }, [quoteId, uploadFile]);

  const handleLegendUpload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") { toast.error("Legend must be a PDF."); return; }
    if (file.size > MAX_PDF_BYTES)       { toast.error(`File exceeds ${MAX_PDF_MB}MB.`); return; }
    // Delete existing legend (job-level — only one allowed)
    if (legend) await deleteInput.mutateAsync({ id: legend.id, quoteId });
    setIsUploadingLegend(true);
    try {
      // Upload as inputType="pdf" then immediately mark as reference-only.
      // This triggers parseLegend → symbolMappings saved to tenderContext
      // → all drawing takeoffs re-run with the legend applied.
      const result = await uploadFile.mutateAsync({
        quoteId, filename: file.name, contentType: "application/pdf",
        base64Data: await fileToBase64(file), inputType: "pdf",
      });
      if (result?.id) {
        await setReferenceOnly.mutateAsync({
          inputId: result.id, quoteId, isReference: true,
        });
      }
    } finally { setIsUploadingLegend(false); }
  }, [quoteId, legend, uploadFile, setReferenceOnly, deleteInput]);

  const handleSaveScope = useCallback(async () => {
    if (!scopeText.trim()) return;
    setIsSavingScope(true);
    try {
      if (scopeInputId) await updateContent.mutateAsync({ id: scopeInputId, quoteId, content: scopeText });
      else await createInput.mutateAsync({ quoteId, inputType: "email", content: scopeText, filename: "Scope Notes" });
      setScopeDirty(false);
      toast.success("Scope saved.");
    } finally { setIsSavingScope(false); }
  }, [scopeText, scopeInputId, quoteId, updateContent, createInput]);

  const handleToggleCode = useCallback((takeoffId: number, code: string, currentlyExcluded: boolean) => {
    const current = localExcluded[takeoffId] ?? [];
    const updated = currentlyExcluded
      ? current.filter(c => c !== code)
      : [...current, code];
    setLocalExcluded(prev => ({ ...prev, [takeoffId]: updated }));
    updateExcludedCodes.mutate({ takeoffId, excludedCodes: updated });
  }, [localExcluded, updateExcludedCodes]);

  const onDragOver  = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(true); };
  const onDragLeave = () => setIsDraggingOver(false);
  const onDrop      = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(false); if (e.dataTransfer.files.length) handleDrawingUpload(e.dataTransfer.files); };

  // ── Loading / error ──────────────────────────────────────────────────────────
  if (isLoading) return (
    <div className="flex items-center justify-center h-64 text-muted-foreground">
      <Loader2 className="h-5 w-5 animate-spin mr-2" />Loading electrical workspace…
    </div>
  );
  if (error || !fullQuote) return (
    <div className="flex items-center justify-center h-64 text-destructive">Quote not found.</div>
  );

  // ── Viewer callbacks ─────────────────────────────────────────────────────────
  const viewingTakeoff = viewingTakeoffId != null
    ? (takeoffList ?? []).find(t => t.id === viewingTakeoffId) ?? null
    : null;

  const handleViewerExcludedCodesChange = (codes: string[]) => {
    if (!viewingTakeoff) return;
    // Optimistic local update
    setLocalExcluded(prev => ({ ...prev, [viewingTakeoff.id]: codes }));
    updateExcludedCodes.mutate({ takeoffId: viewingTakeoff.id, excludedCodes: codes });
  };

  const handleViewerMarkersUpdated = () => {
    refetchTakeoffs();
    // Reset local excluded for this takeoff so it re-initialises from fresh server data
    initializedTakeoffs.current.delete(viewingTakeoffId!);
  };

  const quote = fullQuote.quote;
  const title = quote.title || "Untitled Quote";
  const reference = (quote as any).reference || "";

  // ── Build takeoff rows for Takeoff tab ───────────────────────────────────────
  const takeoffRows: TakeoffRow[] = [];
  if (takeoffList) {
    for (const t of takeoffList) {
      const inputRecord = drawings.find(d => d.id === Number(t.inputId));
      const drawingName = shortFilename(inputRecord?.filename);
      const excluded    = localExcluded[t.id] ?? getExcludedCodes(t);
      const reviewCodes = new Set<string>(
        ((t.questions ?? []) as Array<{ symbolsAffected: number; question: string; id: string }>)
          .flatMap(q => {
            // Question IDs use prefixed form: "unknown-symbol-FAP", "status-marker-N"
            // Strip known prefixes to get the bare symbol code for comparison against counts keys
            const id = q.id;
            if (id.startsWith('unknown-symbol-')) return [id.slice('unknown-symbol-'.length)];
            if (id.startsWith('status-marker-')) return [id.slice('status-marker-'.length)];
            return [id];
          })
      );
      const questionTextByCode: Record<string, string> = {};
      for (const q of (t.questions ?? []) as Array<{ id: string; question: string }>) {
        // Key by bare symbol code (same prefix-stripping as reviewCodes above)
        const id = q.id;
        const key = id.startsWith('unknown-symbol-') ? id.slice('unknown-symbol-'.length)
                  : id.startsWith('status-marker-')  ? id.slice('status-marker-'.length)
                  : id;
        questionTextByCode[key] = q.question;
      }

      for (const [code, count] of Object.entries((t.counts ?? {}) as Record<string, number>)) {
        const isExcluded = excluded.includes(code);
        const isReview   = reviewCodes.has(code);
        const status: TakeoffRow["status"] = isExcluded ? "excluded" : isReview ? "review" : "matched";
        takeoffRows.push({
          key: `${t.id}-${code}`,
          takeoffId: t.id,
          inputId: Number(t.inputId),
          drawingName,
          code,
          description: allDescriptions[code.toUpperCase()] ?? allDescriptions[code] ?? "—",
          count: count as number,
          status,
          questionText: questionTextByCode[code],
        });
      }
    }
    // Sort: drawing name → status (matched first) → code
    takeoffRows.sort((a, b) => {
      if (a.drawingName !== b.drawingName) return a.drawingName.localeCompare(b.drawingName);
      const sOrder = { matched: 0, review: 1, excluded: 2 };
      if (a.status !== b.status) return sOrder[a.status] - sOrder[b.status];
      return a.code.localeCompare(b.code);
    });
  }

  // Drawings still processing (input done but no takeoff yet)
  const pendingDrawingNames = drawings
    .filter(d => {
      const done = d.processingStatus === "completed" || d.processingStatus === "complete";
      const hasTakeoff = takeoffList?.some(t => Number(t.inputId) === d.id);
      return done && !hasTakeoff;
    })
    .map(d => shortFilename(d.filename));

  const stillProcessingNames = drawings
    .filter(d => d.processingStatus === "processing" || d.processingStatus === "pending")
    .map(d => shortFilename(d.filename));

  // ── Render ───────────────────────────────────────────────────────────────────
  return (
    <>
    <div className="h-full flex flex-col overflow-hidden">

      {/* Header */}
      <div className="flex items-center justify-between px-4 border-b bg-background shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Button variant="ghost" size="sm" onClick={() => setLocation("/dashboard")} className="shrink-0 -ml-1">
            <ArrowLeft className="h-4 w-4 mr-1" />Back
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
            <span className="font-semibold truncate">{title}</span>
            {reference && <span className="text-xs text-muted-foreground shrink-0">{reference}</span>}
            <Badge className="text-xs shrink-0 bg-yellow-100 text-yellow-800 border-yellow-200">Electrical</Badge>
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground italic">Electrical Workspace</div>
      </div>

      {/* Tab bar */}
      <div className="flex items-center gap-1 px-4 border-b bg-background shrink-0 h-10">
        {TABS.map(tab => {
          const Icon = tab.icon;
          const active = activeTab === tab.id;
          return (
            <button key={tab.id} onClick={() => setActiveTab(tab.id)}
              className={cn("flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors h-7",
                active ? "bg-primary text-primary-foreground" : "text-muted-foreground hover:text-foreground hover:bg-muted")}>
              <Icon className="h-3.5 w-3.5" />{tab.label}
            </button>
          );
        })}
      </div>

      {/* Main content */}
      <div className="flex flex-1 overflow-hidden">

        {/* Sidebar */}
        <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden bg-muted/20">
          <div className="px-3 py-2 border-b bg-background flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">Drawings</span>
            {drawings.length > 0 && <span className="text-xs text-muted-foreground">{drawings.length}</span>}
          </div>
          <div className="flex-1 overflow-y-auto">
            {drawings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-3 py-4 text-center">No drawings uploaded yet</p>
            ) : (
              <ul className="py-1">
                {drawings.map(d => (
                  <li key={d.id}>
                    <button onClick={() => setActiveDrawingId(d.id)}
                      className={cn("w-full text-left px-3 py-2 flex flex-col gap-1 hover:bg-muted/60 transition-colors",
                        activeDrawingId === d.id && "bg-muted")}>
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-medium truncate leading-tight flex-1 min-w-0">
                          {shortFilename(d.filename)}
                        </span>
                        <button onClick={e => { e.stopPropagation(); deleteInput.mutate({ id: d.id, quoteId }); }}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5" title="Remove">
                          <X className="h-3 w-3" />
                        </button>
                      </div>
                      <StatusBadge status={d.processingStatus} />
                    </button>
                  </li>
                ))}
              </ul>
            )}

            {/* Reference documents section — schedules, specs, risers auto-classified */}
            {referenceInputs.length > 0 && (
              <>
                <div className="px-3 py-1.5 mt-1 border-t border-b bg-muted/30 flex items-center justify-between">
                  <span className="text-[10px] font-semibold text-muted-foreground uppercase tracking-wider">References</span>
                  <span className="text-[10px] text-muted-foreground">{referenceInputs.length}</span>
                </div>
                <ul className="py-1">
                  {referenceInputs.map(r => {
                    const dtMatch = r.mimeType?.match(/;docType=([^;]*)/);
                    const dt = dtMatch?.[1] ?? 'unclassified';
                    const badge = getDocTypeBadgeProps(dt);
                    return (
                      <li key={r.id}>
                        <button
                          onClick={() => setViewingReferenceId(r.id)}
                          className="w-full text-left px-3 py-2 flex flex-col gap-1 hover:bg-muted/60 transition-colors">
                          <div className="flex items-start justify-between gap-1">
                            <span className="text-xs font-medium truncate leading-tight flex-1 min-w-0">
                              {shortFilename(r.filename)}
                            </span>
                            <button onClick={e => { e.stopPropagation(); deleteInput.mutate({ id: r.id, quoteId }); }}
                              className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5" title="Remove">
                              <X className="h-3 w-3" />
                            </button>
                          </div>
                          <Badge className={`text-[10px] px-1.5 py-0 h-4 font-normal self-start ${badge.className}`}>
                            {badge.label}
                          </Badge>
                        </button>
                      </li>
                    );
                  })}
                </ul>
              </>
            )}
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "inputs" && (
            <InputsTab
              quoteId={quoteId} drawings={drawings} legend={legend}
              referenceInputs={referenceInputs}
              scopeText={scopeText} scopeDirty={scopeDirty} isSavingScope={isSavingScope}
              isUploadingDrawing={isUploadingDrawing} isUploadingLegend={isUploadingLegend}
              isDraggingOver={isDraggingOver}
              drawingInputRef={drawingInputRef} legendInputRef={legendInputRef}
              onScopeChange={v => { setScopeText(v); setScopeDirty(true); }}
              onSaveScope={handleSaveScope}
              onDrawingFiles={handleDrawingUpload}
              onLegendFile={handleLegendUpload}
              onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
              onDeleteLegend={() => legend && deleteInput.mutate({ id: legend.id, quoteId })}
              onDeleteReference={(id) => deleteInput.mutate({ id, quoteId })}
              onViewReference={(id) => setViewingReferenceId(id)}
            />
          )}
          {activeTab === "takeoff" && (
            <TakeoffTab
              drawings={drawings}
              takeoffList={takeoffList ?? []}
              takeoffRows={takeoffRows}
              stillProcessingNames={stillProcessingNames}
              pendingDrawingNames={pendingDrawingNames}
              onToggle={handleToggleCode}
              onReanalyse={(inputId) => analyzeDrawing.mutate({ inputId, quoteId, force: true })}
              isReanalysing={analyzeDrawing.isPending}
              localExcluded={localExcluded}
              onViewDrawing={(takeoffId) => setViewingTakeoffId(takeoffId)}
            />
          )}
          {activeTab === "qds" && (() => {
            const includedRows: IncludedTakeoffRow[] = takeoffRows
              .filter(r => r.status !== "excluded")
              .map(r => ({
                key:         r.key,
                takeoffId:   r.takeoffId,
                inputId:     r.inputId,
                drawingName: r.drawingName,
                code:        r.code,
                description: r.description,
                count:       r.count,
              }));
            return (
              <ElectricalQDS
                quoteId={quoteId}
                includedRows={includedRows}
                savedQdsJson={(quote as any).qdsSummaryJson ?? null}
              />
            );
          })()}
          {(activeTab === "quote") && (
            <ElectricalQuoteTab
              quoteId={quoteId}
              quote={quote}
              lineItems={fullQuote.lineItems ?? []}
              refetch={refetch}
            />
          )}
          {activeTab === "pdf" && (
            <ElectricalPDFTab
              quoteId={quoteId}
              quote={quote}
              lineItems={fullQuote.lineItems ?? []}
              drawings={drawings}
            />
          )}
        </div>
      </div>
    </div>

    {/* ── Drawing Viewer Modal ──────────────────────────────────────────────── */}
    {viewingTakeoff && viewingTakeoffId != null && (
      <ElectricalDrawingViewer
        takeoffId={viewingTakeoff.id}
        inputId={Number(viewingTakeoff.inputId)}
        drawingRef={shortFilename((drawings.find(d => d.id === Number(viewingTakeoff.inputId)))?.filename)}
        symbols={(viewingTakeoff.symbols ?? []) as Array<{id:string;symbolCode:string;category:string;x:number;y:number;confidence:string;isStatusMarker:boolean;nearbySymbol?:string}>}
        pageWidth={parseFloat(String(viewingTakeoff.pageWidth)) || 2384}
        pageHeight={parseFloat(String(viewingTakeoff.pageHeight)) || 1684}
        symbolStyles={allSymbolStyles}
        symbolDescriptions={allDescriptions}
        initialExcludedCodes={new Set(localExcluded[viewingTakeoff.id] ?? getExcludedCodes(viewingTakeoff))}
        onExcludedCodesChange={handleViewerExcludedCodesChange}
        onMarkersUpdated={handleViewerMarkersUpdated}
        onClose={() => setViewingTakeoffId(null)}
      />
    )}

    {/* ── Reference Document Viewer Modal ──────────────────────────────────── */}
    {viewingReferenceId != null && (() => {
      const refInput = referenceInputs.find(r => r.id === viewingReferenceId);
      if (!refInput) return null;
      const dtMatch = refInput.mimeType?.match(/;docType=([^;]*)/);
      const dt = dtMatch?.[1] ?? 'unclassified';
      return (
        <ElectricalReferenceViewer
          inputId={refInput.id}
          filename={shortFilename(refInput.filename)}
          docType={dt}
          onClose={() => setViewingReferenceId(null)}
        />
      );
    })()}
    </>
  );
}

// ─── Inputs Tab ───────────────────────────────────────────────────────────────
interface InputsTabProps {
  quoteId: number; drawings: QuoteInput[]; legend: QuoteInput | null;
  referenceInputs: QuoteInput[];
  scopeText: string; scopeDirty: boolean; isSavingScope: boolean;
  isUploadingDrawing: boolean; isUploadingLegend: boolean; isDraggingOver: boolean;
  drawingInputRef: React.RefObject<HTMLInputElement>; legendInputRef: React.RefObject<HTMLInputElement>;
  onScopeChange: (v: string) => void; onSaveScope: () => void;
  onDrawingFiles: (f: FileList | File[]) => void; onLegendFile: (f: File) => void;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  onDeleteLegend: () => void;
  onDeleteReference: (id: number) => void;
  onViewReference: (id: number) => void;
}

function InputsTab({
  drawings, legend, referenceInputs, scopeText, scopeDirty, isSavingScope,
  isUploadingDrawing, isUploadingLegend, isDraggingOver,
  drawingInputRef, legendInputRef,
  onScopeChange, onSaveScope, onDrawingFiles, onLegendFile,
  onDragOver, onDragLeave, onDrop, onDeleteLegend,
  onDeleteReference, onViewReference,
}: InputsTabProps) {
  return (
    <div className="p-5 flex flex-col gap-5 max-w-4xl">

      {/* Row 1: Drawing upload + Scope & AI Instructions */}
      <div className="grid grid-cols-2 gap-4">

        {/* Drawing upload */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Upload Drawings</span>
            <span className="text-xs text-muted-foreground">(PDF, multiple allowed)</span>
          </div>
          <div onDragOver={onDragOver} onDragLeave={onDragLeave} onDrop={onDrop}
            onClick={() => drawingInputRef.current?.click()}
            className={cn("border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2",
              "cursor-pointer transition-colors select-none min-h-[120px]",
              isDraggingOver ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30")}>
            {isUploadingDrawing ? (
              <><Loader2 className="h-6 w-6 animate-spin text-primary" /><p className="text-sm text-muted-foreground">Uploading…</p></>
            ) : (
              <><Upload className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground text-center">Drop PDFs here or <span className="text-primary font-medium">browse</span></p>
                <p className="text-xs text-muted-foreground/60">Max {MAX_PDF_MB}MB per file</p></>
            )}
          </div>
          <input ref={drawingInputRef} type="file" accept="application/pdf" multiple className="hidden"
            onChange={e => e.target.files && onDrawingFiles(e.target.files)} />
          {drawings.length > 0 && (
            <p className="text-xs text-muted-foreground">{drawings.length} drawing{drawings.length !== 1 ? "s" : ""} uploaded</p>
          )}
        </div>

        {/* Scope & AI Instructions */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Scope &amp; AI Instructions</span>
          </div>
          <Textarea value={scopeText} onChange={e => onScopeChange(e.target.value)}
            placeholder={"Paste the client's email, scope of works, or any instructions here.\n\nThe AI reads this to understand what to include and exclude from the quote."}
            className="flex-1 min-h-[120px] resize-none text-sm" />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {scopeText.length > 0
                ? `${scopeText.length} characters${scopeDirty ? " — unsaved" : " — saved"}`
                : "Drives scope inclusion/exclusion"}
            </span>
            {scopeDirty && (
              <Button size="sm" variant="outline" onClick={onSaveScope}
                disabled={isSavingScope || !scopeText.trim()} className="h-7 text-xs">
                {isSavingScope && <Loader2 className="h-3 w-3 animate-spin mr-1" />}Save
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* Symbol Legend — visually distinct */}
      <div className={cn("rounded-lg border-2 p-4 flex flex-col gap-3",
        legend ? "border-teal-200 bg-teal-50/50" : "border-dashed border-amber-200 bg-amber-50/40")}>
        <div className="flex items-center gap-2">
          <BookOpen className={cn("h-4 w-4", legend ? "text-teal-600" : "text-amber-600")} />
          <span className="text-sm font-semibold">
            Symbol Legend
            {!legend && <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>}
          </span>
          {legend && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 text-teal-700 border-teal-200 ml-auto">
              Job-level — applies to all drawings
            </Badge>
          )}
        </div>

        {legend ? (
          <div className="flex items-center justify-between bg-background rounded-md px-3 py-2 border border-teal-200">
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 text-teal-600 shrink-0" />
              <span className="text-sm truncate">{shortFilename(legend.filename)}</span>
              <StatusBadge status={legend.processingStatus} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button onClick={() => legendInputRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors">
                <RefreshCw className="h-3 w-3" />Replace
              </button>
              <button onClick={onDeleteLegend}
                className="text-muted-foreground hover:text-destructive transition-colors">
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          <div onClick={() => legendInputRef.current?.click()}
            className="flex items-center gap-3 cursor-pointer hover:bg-amber-50 transition-colors rounded-md px-3 py-2">
            {isUploadingLegend
              ? <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
              : <Upload className="h-4 w-4 text-amber-500" />}
            <div>
              <p className="text-sm text-amber-700 font-medium">Upload Symbol Legend (optional)</p>
              <p className="text-xs text-muted-foreground">
                Upload once — applied to every drawing on this job automatically.
                Leave blank if the legend is embedded in the drawings.
              </p>
            </div>
          </div>
        )}

        <input ref={legendInputRef} type="file" accept="application/pdf" className="hidden"
          onChange={e => { if (e.target.files?.[0]) { onLegendFile(e.target.files[0]); e.target.value = ""; } }} />
      </div>

      {/* Reference Documents — auto-classified on upload (schedules, specs, risers) */}
      {referenceInputs.length > 0 && (
        <div className="rounded-lg border border-blue-200 bg-blue-50/30 p-4 flex flex-col gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-blue-600" />
            <span className="text-sm font-semibold">Reference Documents</span>
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-blue-100 text-blue-700 border-blue-200 ml-auto">
              Available as AI context
            </Badge>
          </div>
          <p className="text-xs text-muted-foreground -mt-1">
            These documents were automatically classified as reference material.
            No takeoff runs on them — they are available to the AI when generating your quote.
          </p>
          <ul className="flex flex-col gap-1.5">
            {referenceInputs.map(r => {
              const dtMatch = r.mimeType?.match(/;docType=([^;]*)/);
              const dt = dtMatch?.[1] ?? 'unclassified';
              const badge = getDocTypeBadgeProps(dt);
              return (
                <li key={r.id}
                  className="flex items-center justify-between bg-background rounded-md px-3 py-2 border border-blue-100">
                  <div className="flex items-center gap-2 min-w-0">
                    <File className="h-4 w-4 text-blue-500 shrink-0" />
                    <span className="text-sm truncate">{shortFilename(r.filename)}</span>
                    <Badge className={`text-[10px] px-1.5 py-0 h-4 font-normal shrink-0 ${badge.className}`}>
                      {badge.label}
                    </Badge>
                    <StatusBadge status={r.processingStatus} />
                  </div>
                  <div className="flex items-center gap-2 shrink-0">
                    <button onClick={() => onViewReference(r.id)}
                      className="text-xs text-primary hover:text-primary/80 font-medium flex items-center gap-1 transition-colors">
                      View
                    </button>
                    <button onClick={() => onDeleteReference(r.id)}
                      className="text-muted-foreground hover:text-destructive transition-colors">
                      <X className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </div>
  );
}

// ─── Takeoff Tab ──────────────────────────────────────────────────────────────
interface TakeoffTabProps {
  drawings: QuoteInput[];
  takeoffList: any[];
  takeoffRows: TakeoffRow[];
  stillProcessingNames: string[];
  pendingDrawingNames: string[];
  localExcluded: Record<number, string[]>;
  onToggle: (takeoffId: number, code: string, currentlyExcluded: boolean) => void;
  onReanalyse: (inputId: number) => void;
  isReanalysing: boolean;
  onViewDrawing: (takeoffId: number) => void;
}

function TakeoffTab({
  drawings, takeoffList, takeoffRows,
  stillProcessingNames, pendingDrawingNames,
  onToggle, onReanalyse, isReanalysing, localExcluded, onViewDrawing,
}: TakeoffTabProps) {

  const noDrawings       = drawings.length === 0;
  const allProcessing    = stillProcessingNames.length > 0;
  const awaitingTakeoffs = pendingDrawingNames.length > 0;
  const noTakeoffs       = takeoffList.length === 0;
  const hasRows          = takeoffRows.length > 0;

  if (noDrawings) return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-2 p-8 text-center">
      <Upload className="h-8 w-8 text-muted-foreground/40" />
      <p className="text-sm font-medium">No drawings uploaded</p>
      <p className="text-xs text-muted-foreground">Upload drawings on the Inputs tab to begin.</p>
    </div>
  );

  return (
    <div className="flex flex-col gap-0 h-full">

      {/* Processing banners */}
      {allProcessing && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-amber-50 border-b border-amber-200 text-amber-800 text-sm shrink-0">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            <span className="font-medium">Analysing:</span>{" "}
            {stillProcessingNames.join(", ")} — results will appear automatically.
          </span>
        </div>
      )}
      {awaitingTakeoffs && !allProcessing && (
        <div className="flex items-center gap-2 px-4 py-2.5 bg-blue-50 border-b border-blue-200 text-blue-800 text-sm shrink-0">
          <Loader2 className="h-4 w-4 animate-spin shrink-0" />
          <span>
            <span className="font-medium">Running symbol takeoff:</span>{" "}
            {pendingDrawingNames.join(", ")} — this takes a moment.
          </span>
        </div>
      )}

      {/* Empty state when processing is ongoing */}
      {noTakeoffs && (allProcessing || awaitingTakeoffs) && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 text-center p-8">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground/40" />
          <p className="text-sm text-muted-foreground">Waiting for takeoff results…</p>
        </div>
      )}

      {/* Main table */}
      {hasRows && (
        <div className="flex-1 overflow-auto">
          <table className="w-full text-sm border-collapse">
            <thead className="sticky top-0 bg-background z-10">
              <tr className="border-b">
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-10">Inc.</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Drawing</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Code</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground">Description</th>
                <th className="text-right px-3 py-2 text-xs font-semibold text-muted-foreground w-16">Count</th>
                <th className="text-left px-3 py-2 text-xs font-semibold text-muted-foreground w-24">Status</th>
                <th className="px-3 py-2 w-8"></th>
              </tr>
            </thead>
            <tbody>
              {takeoffRows.map((row, i) => {
                const excluded = (localExcluded[row.takeoffId] ?? []).includes(row.code);
                const prev = takeoffRows[i - 1];
                const isNewDrawing = !prev || prev.drawingName !== row.drawingName;
                return (
                  <>
                    {isNewDrawing && i > 0 && (
                      <tr key={`sep-${row.key}`}><td colSpan={7} className="border-t border-muted pt-1" /></tr>
                    )}
                    <tr key={row.key}
                      className={cn("border-b border-muted/50 transition-colors",
                        excluded ? "opacity-50 bg-muted/20" : "hover:bg-muted/30",
                        row.status === "review" && !excluded && "bg-amber-50/50")}>

                      {/* Toggle */}
                      <td className="px-3 py-1.5">
                        <button onClick={() => onToggle(row.takeoffId, row.code, excluded)}
                          className="transition-colors" title={excluded ? "Click to include" : "Click to exclude"}>
                          {excluded
                            ? <ToggleLeft  className="h-5 w-5 text-muted-foreground/40" />
                            : <ToggleRight className="h-5 w-5 text-primary" />}
                        </button>
                      </td>

                      {/* Drawing */}
                      <td className="px-3 py-1.5 text-xs text-muted-foreground max-w-[140px] truncate">
                        {isNewDrawing ? <span className="font-medium text-foreground">{row.drawingName}</span> : ""}
                      </td>

                      {/* Code */}
                      <td className="px-3 py-1.5 font-mono text-xs font-semibold">{row.code}</td>

                      {/* Description */}
                      <td className="px-3 py-1.5 text-xs">
                        {row.description !== "—"
                          ? row.description
                          : <span className="text-muted-foreground italic">Unknown symbol</span>}
                        {row.questionText && !excluded && (
                          <div className="text-[10px] text-amber-600 mt-0.5">{row.questionText}</div>
                        )}
                      </td>

                      {/* Count */}
                      <td className="px-3 py-1.5 text-right font-medium tabular-nums">{row.count}</td>

                      {/* Status */}
                      <td className="px-3 py-1.5">
                        {excluded ? (
                          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">Excluded</Badge>
                        ) : row.status === "review" ? (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-amber-100 text-amber-700 border-amber-200 gap-1">
                            <AlertTriangle className="h-2.5 w-2.5" />Review
                          </Badge>
                        ) : (
                          <Badge className="text-[10px] px-1.5 py-0 h-4 bg-green-100 text-green-700 border-green-200 gap-1">
                            <CheckCircle className="h-2.5 w-2.5" />Matched
                          </Badge>
                        )}
                      </td>

                      {/* View drawing + Re-analyse (only show on first row of each drawing) */}
                      <td className="px-2 py-1.5">
                        {isNewDrawing && (() => {
                          const t = takeoffList.find(t => Number(t.inputId) === row.inputId);
                          const hasSvg = !!(t?.svgOverlay);
                          return (
                            <div className="flex items-center gap-1.5">
                              {hasSvg && (
                                <button
                                  onClick={() => onViewDrawing(t!.id)}
                                  title="View marked drawing"
                                  className="text-xs font-medium text-primary hover:text-primary/80 transition-colors flex items-center gap-0.5 whitespace-nowrap">
                                  <Eye className="h-3 w-3" />View
                                </button>
                              )}
                              <button
                                onClick={() => onReanalyse(row.inputId)}
                                disabled={isReanalysing}
                                title="Re-analyse this drawing"
                                className="text-muted-foreground hover:text-foreground transition-colors disabled:opacity-40">
                                <RotateCcw className="h-3.5 w-3.5" />
                              </button>
                            </div>
                          );
                        })()}
                      </td>
                    </tr>
                  </>
                );
              })}
            </tbody>
          </table>

          {/* Summary row */}
          <div className="px-4 py-3 border-t bg-muted/20 flex items-center justify-between text-xs text-muted-foreground">
            <span>
              {takeoffRows.filter(r => !((localExcluded[r.takeoffId] ?? []).includes(r.code))).length} items included
              {" · "}
              {takeoffRows.filter(r => (localExcluded[r.takeoffId] ?? []).includes(r.code)).length} excluded
              {" · "}
              {takeoffRows.filter(r => r.status === "review" && !(localExcluded[r.takeoffId] ?? []).includes(r.code)).length} need review
            </span>
            <span>{takeoffRows.length} total symbols across {takeoffList.length} drawing{takeoffList.length !== 1 ? "s" : ""}</span>
          </div>
        </div>
      )}

      {/* No rows + not processing = all drawings had nothing */}
      {!hasRows && !allProcessing && !awaitingTakeoffs && takeoffList.length > 0 && (
        <div className="flex flex-col items-center justify-center flex-1 gap-2 p-8 text-center">
          <AlertCircle className="h-8 w-8 text-muted-foreground/40" />
          <p className="text-sm font-medium">No symbols found</p>
          <p className="text-xs text-muted-foreground max-w-xs">
            The AI could not extract symbols from these drawings. Check the drawings are electrical plans, then re-analyse.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Electrical Quote Tab ─────────────────────────────────────────────────────

interface ElectricalQuoteTabProps {
  quoteId: number;
  quote: any;
  lineItems: any[];
  refetch: () => void;
}

// Line item section classifier — mirrors pdfGenerator.ts rules exactly
function classifyLineItem(item: any): string {
  const d: string = item.description ?? "";
  const u: string = item.unit ?? "";
  if (u === "note")    return "note";
  if (u === "circuit") return "firstPoints";
  if (/^Phase [123]\s*[—–\-]/.test(d))  return "labour";
  if (d.endsWith("— containment"))       return "containment";
  if (d.endsWith("— cabling"))           return "cabling";
  if (/ day\(s\)| week\(s\)/.test(d))    return "plantHire";
  if (d.startsWith("Sundries allowance")) return "sundries";
  const rate = Number(item.rate) || 0;
  const qty  = Number(item.quantity) || 0;
  // Prelims: items that aren't supply but have a cost — catch-all after supply patterns
  if (d.startsWith("[") || d.endsWith("— supply")) return "supply";
  if (rate > 0 && qty > 0) return "prelims";
  return "supply";
}

const SECTION_ORDER = ["supply", "containment", "cabling", "labour", "note", "firstPoints", "plantHire", "prelims", "sundries"] as const;
const SECTION_LABELS: Record<string, string> = {
  supply:      "Electrical Installation",
  containment: "Containment",
  cabling:     "Cabling",
  labour:      "Labour",
  note:        "Programme",
  firstPoints: "First Points",
  plantHire:   "Plant & Hire",
  prelims:     "Preliminaries",
  sundries:    "Sundries",
};

function fmt2(n: number) {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function ElectricalQuoteTab({ quoteId, quote, lineItems, refetch }: ElectricalQuoteTabProps) {
  const [editingItemId,  setEditingItemId]  = useState<number | null>(null);
  const [editingField,   setEditingField]   = useState<string | null>(null);
  const [editValue,      setEditValue]      = useState("");
  const [isGenerating,   setIsGenerating]   = useState(false);

  const generateDraft = trpc.ai.generateDraft.useMutation({
    onSuccess: () => {
      toast.success("Draft generated — line items ready.");
      setIsGenerating(false);
      refetch();
    },
    onError: (e) => {
      toast.error("Draft generation failed: " + e.message);
      setIsGenerating(false);
    },
  });

  const deleteLineItem = trpc.lineItems.delete.useMutation({
    onSuccess: () => refetch(),
    onError:   (e) => toast.error("Failed to delete: " + e.message),
  });

  const updateLineItem = trpc.lineItems.update.useMutation({
    onSuccess: () => refetch(),
    onError:   (e) => toast.error("Failed to update: " + e.message),
  });

  const handleGenerateDraft = () => {
    if (lineItems.length > 0) {
      if (!window.confirm("This will replace all existing line items. Continue?")) return;
    }
    setIsGenerating(true);
    generateDraft.mutate({ quoteId });
  };

  const startEdit = (id: number, field: string, val: string) => {
    setEditingItemId(id); setEditingField(field); setEditValue(val ?? "");
  };
  const saveEdit = (id: number, field: string) => {
    updateLineItem.mutate({ id, quoteId, [field]: editValue });
    setEditingItemId(null); setEditingField(null); setEditValue("");
  };
  const cancelEdit = () => { setEditingItemId(null); setEditingField(null); setEditValue(""); };
  const onKeyDown = (e: React.KeyboardEvent, id: number, field: string) => {
    if (e.key === "Enter")  { e.preventDefault(); saveEdit(id, field); }
    if (e.key === "Escape") cancelEdit();
  };

  // Group items by section
  const grouped = new Map<string, any[]>();
  for (const s of SECTION_ORDER) grouped.set(s, []);
  for (const item of lineItems) {
    const sec = classifyLineItem(item);
    (grouped.get(sec) ?? grouped.get("supply")!).push(item);
  }

  // Totals
  const sectionTotal = (keys: string[]) =>
    keys.flatMap(k => grouped.get(k) ?? [])
        .reduce((s, i) => s + (Number(i.total) || Number(i.quantity) * Number(i.rate) || 0), 0);

  const supplyTotal   = sectionTotal(["supply"]);
  const containTotal  = sectionTotal(["containment"]);
  const cablingTotal  = sectionTotal(["cabling"]);
  const labourTotal   = sectionTotal(["labour"]);
  const fpTotal       = sectionTotal(["firstPoints"]);
  const plantTotal    = sectionTotal(["plantHire"]);
  const prelimTotal   = sectionTotal(["prelims"]);
  const sundriesTotal = sectionTotal(["sundries"]);
  const subtotal      = supplyTotal + containTotal + cablingTotal + labourTotal + fpTotal + plantTotal + prelimTotal + sundriesTotal;
  const taxRate       = Number((quote as any).taxRate) || 0;
  const vatAmount     = taxRate > 0 ? subtotal * (taxRate / 100) : 0;
  const grandTotal    = subtotal + vatAmount;

  // ── No items yet ──────────────────────────────────────────────────────────
  if (lineItems.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8 text-center">
        <FileText className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-semibold">No draft generated yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Complete the QDS tab first, then generate a draft here.
            Line items are built directly from the QDS — no AI reinterpretation.
          </p>
        </div>
        <Button onClick={handleGenerateDraft} disabled={isGenerating} className="gap-2">
          {isGenerating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            : <><Sparkles className="h-4 w-4" />Generate Draft from QDS</>}
        </Button>
      </div>
    );
  }

  // ── Editable cell helpers ─────────────────────────────────────────────────
  const EditableCell = ({ item, field, type = "text", className = "" }: {
    item: any; field: string; type?: string; className?: string;
  }) => {
    const isEditing = editingItemId === item.id && editingField === field;
    const raw = item[field] ?? "";
    if (isEditing) {
      return (
        <Input
          type={type} value={editValue}
          onChange={e => setEditValue(e.target.value)}
          onBlur={() => saveEdit(item.id, field)}
          onKeyDown={e => onKeyDown(e, item.id, field)}
          autoFocus
          className={cn("h-7 text-xs px-1.5", className)}
        />
      );
    }
    const display = type === "number"
      ? (field === "rate" ? `£${parseFloat(raw || "0").toFixed(2)}` : (() => { const n = parseFloat(raw || "0"); return n % 1 === 0 ? n.toFixed(0) : n.toFixed(2); })())
      : (raw || <span className="text-muted-foreground/40 italic">—</span>);
    return (
      <span
        onClick={() => startEdit(item.id, field, String(raw))}
        className={cn("cursor-pointer hover:bg-muted/50 px-1.5 py-0.5 rounded block", className)}
      >{display}</span>
    );
  };

  // ── Section renderer ─────────────────────────────────────────────────────
  const renderSection = (key: string) => {
    const items = grouped.get(key) ?? [];
    if (items.length === 0) return null;
    const label = SECTION_LABELS[key];

    return (
      <div key={key}>
        {/* Section header */}
        <div className="px-3 py-1.5 bg-muted/40 border-y flex items-center gap-2">
          <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">{label}</span>
          <span className="text-xs text-muted-foreground">({items.length})</span>
          <span className="ml-auto text-xs font-semibold tabular-nums text-muted-foreground">
            {sectionTotal([key]) > 0 ? `£${fmt2(sectionTotal([key]))}` : ""}
          </span>
        </div>

        {items.map((item: any) => {
          const isNote = item.unit === "note";
          const qty    = Number(item.quantity) || 0;
          const rate   = Number(item.rate) || 0;
          const total  = Number(item.total) || qty * rate;

          // Margin from stored costPrice
          const costPriceNum = item.costPrice ? parseFloat(item.costPrice) : null;
          const showMargin = costPriceNum && costPriceNum > 0 && rate > 0 && qty > 0;
          const marginTotal = showMargin ? (rate - costPriceNum!) * qty : null;
          const marginPct   = showMargin ? Math.round(((rate - costPriceNum!) / rate) * 100) : null;

          if (isNote) {
            // Programme note — full-width italic row, no qty/rate
            return (
              <div key={item.id} className="px-3 py-2 border-b border-muted/40 flex items-center gap-2">
                <span className="flex-1 text-xs italic text-muted-foreground">{item.description}</span>
                <button onClick={() => deleteLineItem.mutate({ id: item.id, quoteId })}
                  className="opacity-0 hover:opacity-100 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all ml-2">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            );
          }

          return (
            <div key={item.id} className="group grid text-xs border-b border-muted/30 hover:bg-muted/10 transition-colors"
              style={{ gridTemplateColumns: "1fr 60px 55px 80px 90px 90px 24px" }}>
              {/* Description */}
              <div className="px-3 py-1.5 min-w-0">
                <EditableCell item={item} field="description" className="truncate" />
              </div>
              {/* Qty */}
              <div className="px-1.5 py-1.5 text-right">
                <EditableCell item={item} field="quantity" type="number" className="text-right" />
              </div>
              {/* Unit */}
              <div className="px-1.5 py-1.5 text-muted-foreground">
                <EditableCell item={item} field="unit" />
              </div>
              {/* Rate */}
              <div className="px-1.5 py-1.5 text-right">
                <EditableCell item={item} field="rate" type="number" className="text-right" />
              </div>
              {/* Total */}
              <div className="px-3 py-1.5 text-right font-medium tabular-nums">
                £{fmt2(total)}
              </div>
              {/* Margin — internal only */}
              <div className="px-3 py-1.5 text-right tabular-nums">
                {showMargin && marginTotal !== null ? (
                  <span className={marginTotal >= 0 ? "text-green-600" : "text-red-500"}>
                    £{fmt2(marginTotal)} ({marginPct}%)
                  </span>
                ) : (
                  <span className="text-muted-foreground/30">—</span>
                )}
              </div>
              {/* Delete */}
              <div className="flex items-center justify-center py-1.5">
                <button onClick={() => deleteLineItem.mutate({ id: item.id, quoteId })}
                  className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                  <Trash2 className="h-3 w-3" />
                </button>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // ── Main render ──────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* Header toolbar */}
      <div className="shrink-0 px-4 py-2.5 border-b bg-background flex items-center gap-3 flex-wrap">
        <Button size="sm" onClick={handleGenerateDraft} disabled={isGenerating}
          className="gap-1.5 h-7 text-xs bg-primary hover:bg-primary/90">
          {isGenerating
            ? <><Loader2 className="h-3 w-3 animate-spin" />Regenerating…</>
            : <><Sparkles className="h-3 w-3" />Regenerate from QDS</>}
        </Button>
        <span className="text-xs text-muted-foreground">{lineItems.length} line items</span>
        {/* Column headers (right-aligned, mirror the grid below) */}
        <div className="ml-auto hidden sm:grid text-[10px] font-semibold text-muted-foreground uppercase tracking-wider"
          style={{ gridTemplateColumns: "1fr 60px 55px 80px 90px 90px 24px", minWidth: "560px" }}>
          <span className="px-3">Description</span>
          <span className="px-1.5 text-right">Qty</span>
          <span className="px-1.5">Unit</span>
          <span className="px-1.5 text-right">Rate</span>
          <span className="px-3 text-right">Total</span>
          <span className="px-3 text-right text-green-600">Margin</span>
          <span />
        </div>
      </div>

      {/* Line items — scrollable */}
      <div className="flex-1 overflow-y-auto">
        {SECTION_ORDER.map(sec => renderSection(sec))}

        {/* Totals card */}
        <div className="m-4 p-4 rounded-lg border bg-muted/20 max-w-sm ml-auto">
          <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm">
            {supplyTotal   > 0 && <><span className="text-muted-foreground">Supply</span>           <span className="text-right tabular-nums">£{fmt2(supplyTotal)}</span></>}
            {containTotal  > 0 && <><span className="text-muted-foreground">Containment</span>      <span className="text-right tabular-nums">£{fmt2(containTotal)}</span></>}
            {cablingTotal  > 0 && <><span className="text-muted-foreground">Cabling</span>          <span className="text-right tabular-nums">£{fmt2(cablingTotal)}</span></>}
            {labourTotal   > 0 && <><span className="text-muted-foreground">Labour</span>           <span className="text-right tabular-nums">£{fmt2(labourTotal)}</span></>}
            {fpTotal       > 0 && <><span className="text-muted-foreground">First Points</span>     <span className="text-right tabular-nums">£{fmt2(fpTotal)}</span></>}
            {plantTotal    > 0 && <><span className="text-muted-foreground">Plant &amp; Hire</span> <span className="text-right tabular-nums">£{fmt2(plantTotal)}</span></>}
            {prelimTotal   > 0 && <><span className="text-muted-foreground">Preliminaries</span>    <span className="text-right tabular-nums">£{fmt2(prelimTotal)}</span></>}
            {sundriesTotal > 0 && <><span className="text-muted-foreground">Sundries</span>         <span className="text-right tabular-nums">£{fmt2(sundriesTotal)}</span></>}
            {taxRate > 0 && <>
              <span className="text-muted-foreground border-t pt-1 mt-1">Subtotal</span>
              <span className="text-right tabular-nums border-t pt-1 mt-1">£{fmt2(subtotal)}</span>
              <span className="text-muted-foreground">VAT ({taxRate}%)</span>
              <span className="text-right tabular-nums">£{fmt2(vatAmount)}</span>
            </>}
            <span className="font-bold border-t pt-1 mt-1">Total tender price</span>
            <span className="font-bold text-right tabular-nums border-t pt-1 mt-1 text-primary">
              £{fmt2(grandTotal)}
            </span>
          </div>
        </div>
      </div>

    </div>
  );
}

// ─── Electrical PDF Tab ───────────────────────────────────────────────────────

interface ElectricalPDFTabProps {
  quoteId: number;
  quote: any;
  lineItems: any[];
  drawings: QuoteInput[];
}

function ElectricalPDFTab({ quoteId, quote, lineItems, drawings }: ElectricalPDFTabProps) {
  const [isGenerating, setIsGenerating] = useState(false);
  const generatePDFMutation = trpc.quotes.generatePDF.useMutation();

  const navy = "#1a2b4a";

  // Calculate summary figures from line items (sell prices only)
  const activeItems = lineItems.filter(i =>
    i.pricingType !== "optional" && (i.unit ?? "") !== "note"
  );
  const grandTotal = activeItems.reduce((sum: number, i: any) => {
    return sum + (Number(i.total) || Number(i.quantity) * Number(i.rate) || 0);
  }, 0);

  const hasLineItems = lineItems.length > 0;
  const taxRate = Number((quote as any).taxRate) || 0;
  const vatAmount = taxRate > 0 ? grandTotal * (taxRate / 100) : 0;
  const totalWithVat = grandTotal + vatAmount;

  const phaseItems = lineItems.filter(i =>
    /^Phase [123]\s*[—–\-]/.test(i.description ?? "")
  );
  const totalHours = phaseItems.reduce((s: number, i: any) => s + (Number(i.quantity) || 0), 0);
  const teamSize = 2;
  const totalWeeks = totalHours > 0 ? Math.max(1, Math.ceil(totalHours / (teamSize * 40))) : 0;

  const handleGeneratePDF = async () => {
    setIsGenerating(true);
    try {
      const result = await generatePDFMutation.mutateAsync({ id: quoteId });
      if (!result?.html) throw new Error("No HTML content received from server");

      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(result.html);
        printWindow.document.close();
        printWindow.onload = () => {
          setTimeout(() => { printWindow.print(); }, 250);
        };
      } else {
        toast.error("Please allow popups to generate PDF");
      }
    } catch (err) {
      console.error("PDF generation error:", err);
      toast.error("Failed to generate PDF — check console for details");
    } finally {
      setIsGenerating(false);
    }
  };

  return (
    <div className="p-6 max-w-2xl flex flex-col gap-5">

      {/* Header */}
      <div>
        <div className="flex items-center gap-2 mb-1">
          <File className="h-5 w-5 text-primary" />
          <h2 className="text-base font-semibold">Tender Submission PDF</h2>
        </div>
        <p className="text-xs text-muted-foreground">
          Generates a formal tender document — cover page, programme, schedule of works,
          pricing summary, assumptions, exclusions, and terms.
          Opens in a new window for printing or saving as PDF.
        </p>
      </div>

      {/* Pre-generation summary card */}
      <div className="rounded-lg border bg-muted/20 p-4 flex flex-col gap-3">
        <p className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
          Document preview
        </p>

        <div className="grid grid-cols-2 gap-x-8 gap-y-2 text-sm">
          <span className="text-muted-foreground">Project</span>
          <span className="font-medium truncate">{(quote as any).title || "Untitled"}</span>

          {(quote as any).clientName && <>
            <span className="text-muted-foreground">Client</span>
            <span className="truncate">{(quote as any).clientName}</span>
          </>}

          <span className="text-muted-foreground">Reference</span>
          <span className="font-mono text-xs">
            {(quote as any).quoteReference || `Q-${quoteId}`}
          </span>

          <span className="text-muted-foreground">Drawings</span>
          <span>{drawings.length} drawing{drawings.length !== 1 ? "s" : ""}</span>

          {hasLineItems ? (
            <>
              <span className="text-muted-foreground">Line items</span>
              <span>{lineItems.length} items</span>

              {totalHours > 0 && <>
                <span className="text-muted-foreground">Programme</span>
                <span>
                  {totalHours.toFixed(1)} hrs &nbsp;·&nbsp; ~{totalWeeks}w
                  <span className="text-muted-foreground ml-1 text-xs">@ {teamSize} operatives</span>
                </span>
              </>}

              <span className="text-muted-foreground border-t pt-2">
                {taxRate > 0 ? "Subtotal" : "Total tender price"}
              </span>
              <span className="font-semibold tabular-nums border-t pt-2">
                £{grandTotal.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>

              {taxRate > 0 && <>
                <span className="text-muted-foreground">VAT ({taxRate}%)</span>
                <span className="tabular-nums">
                  £{vatAmount.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
                <span className="font-bold">Total tender price</span>
                <span className="font-bold tabular-nums text-primary">
                  £{totalWithVat.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </span>
              </>}
            </>
          ) : (
            <>
              <span className="text-muted-foreground">Line items</span>
              <span className="text-amber-600 font-medium">None — draft not generated</span>
            </>
          )}
        </div>
      </div>

      {/* No line items warning */}
      {!hasLineItems && (
        <div className="flex items-start gap-3 rounded-lg border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
          <Info className="h-4 w-4 shrink-0 mt-0.5 text-amber-600" />
          <div>
            <p className="font-medium">Draft quote not generated yet</p>
            <p className="text-xs text-amber-700 mt-0.5">
              Complete the QDS tab, then use the Quote tab to generate a draft before producing the PDF.
              The PDF will have no line items until a draft exists.
            </p>
          </div>
        </div>
      )}

      {/* Generate button */}
      <div className="flex items-center gap-3">
        <Button
          onClick={handleGeneratePDF}
          disabled={isGenerating || !hasLineItems}
          className="gap-2"
          style={hasLineItems ? { backgroundColor: navy } : undefined}
        >
          {isGenerating
            ? <><Loader2 className="h-4 w-4 animate-spin" />Generating…</>
            : <><Printer className="h-4 w-4" />Generate Tender PDF</>}
        </Button>

        {hasLineItems && (
          <p className="text-xs text-muted-foreground">
            Opens in a new window — use your browser's Print / Save as PDF.
          </p>
        )}
      </div>

    </div>
  );
}

// ─── Placeholder tabs ─────────────────────────────────────────────────────────
function PlaceholderTab({ tab, quoteId }: { tab: Tab; quoteId: number }) {
  const labels: Record<string, { heading: string; body: string }> = {
    qds:   { heading: "QDS",   body: "Quantities, Spon's labour auto-calculation, plant hire, preliminaries. (Phase 4)" },
    quote: { heading: "Quote", body: "Line items, phases, timelines, totals. (Phase 5)" },
    pdf:   { heading: "PDF",   body: "Tender submission document — cover page, breakdown, terms. (Phase 6)" },
  };
  const { heading, body } = labels[tab] ?? { heading: tab, body: "" };
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-3 p-8 text-center">
      <p className="text-lg font-semibold">{heading}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
      <p className="text-xs text-muted-foreground/50">Quote ID: {quoteId}</p>
    </div>
  );
}
