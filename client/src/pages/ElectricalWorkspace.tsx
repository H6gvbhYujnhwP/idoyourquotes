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

import { useState, useEffect, useRef, useCallback } from "react";
import { useLocation } from "wouter";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "sonner";
import {
  Loader2, ArrowLeft, Zap, Upload, Grid, Calculator,
  FileText, File, X, CheckCircle, AlertCircle, Clock,
  Mail, BookOpen, RefreshCw, RotateCcw, AlertTriangle,
  ToggleLeft, ToggleRight, Eye,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteInput } from "@shared/schema";
import ElectricalQDS, { type IncludedTakeoffRow } from "@/components/electrical/ElectricalQDS";
import ElectricalDrawingViewer from "@/components/electrical/ElectricalDrawingViewer";

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
  const [viewingTakeoffId, setViewingTakeoffId] = useState<number | null>(null);

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
  // Phase 2 fix: legend is now inputType=pdf with ;reference=true mimeType
  const drawings = inputs.filter(i => i.inputType === "pdf" && !i.mimeType?.includes(";reference=true"));
  const legend   = inputs.find(i  => i.inputType === "pdf" &&  i.mimeType?.includes(";reference=true")) ?? null;
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
            // questions don't directly store codes — use symbolsAffected > 0 as proxy;
            // the question id often matches the symbol code
            return [q.id];
          })
      );
      const questionTextByCode: Record<string, string> = {};
      for (const q of (t.questions ?? []) as Array<{ id: string; question: string }>) {
        questionTextByCode[q.id] = q.question;
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
          </div>
        </div>

        {/* Right panel */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "inputs" && (
            <InputsTab
              quoteId={quoteId} drawings={drawings} legend={legend}
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
          {(activeTab === "quote" || activeTab === "pdf") && (
            <PlaceholderTab tab={activeTab} quoteId={quoteId} />
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
        symbolStyles={((viewingTakeoff as any).symbolStyles ?? {}) as Record<string,{colour:string;shape:string;radius:number}>}
        symbolDescriptions={allDescriptions}
        initialExcludedCodes={new Set(localExcluded[viewingTakeoff.id] ?? getExcludedCodes(viewingTakeoff))}
        onExcludedCodesChange={handleViewerExcludedCodesChange}
        onMarkersUpdated={handleViewerMarkersUpdated}
        onClose={() => setViewingTakeoffId(null)}
      />
    )}
    </>
  );
}

// ─── Inputs Tab ───────────────────────────────────────────────────────────────
interface InputsTabProps {
  quoteId: number; drawings: QuoteInput[]; legend: QuoteInput | null;
  scopeText: string; scopeDirty: boolean; isSavingScope: boolean;
  isUploadingDrawing: boolean; isUploadingLegend: boolean; isDraggingOver: boolean;
  drawingInputRef: React.RefObject<HTMLInputElement>; legendInputRef: React.RefObject<HTMLInputElement>;
  onScopeChange: (v: string) => void; onSaveScope: () => void;
  onDrawingFiles: (f: FileList | File[]) => void; onLegendFile: (f: File) => void;
  onDragOver: (e: React.DragEvent) => void; onDragLeave: () => void; onDrop: (e: React.DragEvent) => void;
  onDeleteLegend: () => void;
}

function InputsTab({
  drawings, legend, scopeText, scopeDirty, isSavingScope,
  isUploadingDrawing, isUploadingLegend, isDraggingOver,
  drawingInputRef, legendInputRef,
  onScopeChange, onSaveScope, onDrawingFiles, onLegendFile,
  onDragOver, onDragLeave, onDrop, onDeleteLegend,
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
