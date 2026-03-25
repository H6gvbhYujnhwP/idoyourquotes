/**
 * ElectricalWorkspace.tsx
 * Phase 2 — Inputs tab fully wired.
 *
 * Layout contract (unchanged from Phase 1):
 *   - Outer wrapper: h-full flex flex-col overflow-hidden  (no outer page scroll)
 *   - Header:  shrink-0 h-14
 *   - Tab bar: shrink-0 h-10
 *   - Content: flex-1 overflow-hidden
 *     - Sidebar:      fixed width, overflow-y-auto (independent scroll)
 *     - Right panel:  flex-1, overflow-y-auto (independent scroll)
 *
 * Storage mapping (zero schema changes):
 *   inputType "pdf"      → electrical drawing
 *   inputType "document" → symbol legend (one per job)
 *   inputType "email"    → scope / tender email text
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
  Mail, BookOpen, RefreshCw,
} from "lucide-react";
import { cn } from "@/lib/utils";
import type { QuoteInput } from "@shared/schema";

// ─── Constants ───────────────────────────────────────────────────────────────

const MAX_PDF_MB = 20;
const MAX_PDF_BYTES = MAX_PDF_MB * 1024 * 1024;

// ─── Types ───────────────────────────────────────────────────────────────────

type Tab = "inputs" | "takeoff" | "qds" | "quote" | "pdf";

interface TabDefinition {
  id: Tab;
  label: string;
  icon: React.ComponentType<{ className?: string }>;
}

const TABS: TabDefinition[] = [
  { id: "inputs",  label: "Inputs",  icon: Upload     },
  { id: "takeoff", label: "Takeoff", icon: Grid       },
  { id: "qds",     label: "QDS",     icon: Calculator },
  { id: "quote",   label: "Quote",   icon: FileText   },
  { id: "pdf",     label: "PDF",     icon: File       },
];

// ─── Props ───────────────────────────────────────────────────────────────────

interface ElectricalWorkspaceProps {
  quoteId: number;
}

// ─── Status badge ─────────────────────────────────────────────────────────────

function StatusBadge({ status }: { status: string | null }) {
  if (!status || status === "pending") {
    return (
      <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4 font-normal">
        Pending
      </Badge>
    );
  }
  if (status === "processing") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-amber-100 text-amber-700 border-amber-200 gap-1">
        <Loader2 className="h-2.5 w-2.5 animate-spin" />
        Processing
      </Badge>
    );
  }
  if (status === "complete") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-green-100 text-green-700 border-green-200 gap-1">
        <CheckCircle className="h-2.5 w-2.5" />
        Ready
      </Badge>
    );
  }
  if (status === "error") {
    return (
      <Badge className="text-[10px] px-1.5 py-0 h-4 font-normal bg-red-100 text-red-700 border-red-200 gap-1">
        <AlertCircle className="h-2.5 w-2.5" />
        Error
      </Badge>
    );
  }
  return null;
}

// ─── File-to-base64 helper ───────────────────────────────────────────────────

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      resolve(result.split(",")[1]);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

// ─── Component ───────────────────────────────────────────────────────────────

export default function ElectricalWorkspace({ quoteId }: ElectricalWorkspaceProps) {
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState<Tab>("inputs");
  const [activeDrawingId, setActiveDrawingId] = useState<number | null>(null);

  // Upload states
  const [isUploadingDrawing, setIsUploadingDrawing] = useState(false);
  const [isUploadingLegend, setIsUploadingLegend] = useState(false);
  const drawingInputRef = useRef<HTMLInputElement>(null);
  const legendInputRef  = useRef<HTMLInputElement>(null);

  // Drag state
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  // Scope/email text
  const [scopeText, setScopeText]     = useState("");
  const [scopeInputId, setScopeInputId] = useState<number | null>(null);
  const [scopeDirty, setScopeDirty]   = useState(false);
  const [isSavingScope, setIsSavingScope] = useState(false);

  // Polling — true while any input is processing or pending.
  // Must be declared BEFORE useQuery so the query options can reference it
  // without hitting a temporal dead zone (const TDZ crash).
  const [hasProcessingInputs, setHasProcessingInputs] = useState(false);

  // ── Data ────────────────────────────────────────────────────────────────────

  const { data: fullQuote, isLoading, error, refetch } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    {
      enabled: quoteId > 0,
      retry: 1,
      refetchInterval: hasProcessingInputs ? 3000 : false,
    }
  );

  const inputs: QuoteInput[] = fullQuote?.inputs ?? [];
  const drawings = inputs.filter((i) => i.inputType === "pdf");
  const legend   = inputs.find((i)  => i.inputType === "document") ?? null;
  const scopeRecord = inputs.find((i) => i.inputType === "email") ?? null;

  // Keep polling flag in sync — must use useEffect, NOT a refetchInterval
  // callback that closes over fullQuote (causes TDZ crash before initialization)
  useEffect(() => {
    const anyProcessing = inputs.some(
      (i) => i.processingStatus === "processing" || i.processingStatus === "pending"
    );
    setHasProcessingInputs(anyProcessing);
  }, [fullQuote]); // eslint-disable-line react-hooks/exhaustive-deps

  // Auto-select first drawing
  useEffect(() => {
    if (drawings.length > 0 && activeDrawingId === null) {
      setActiveDrawingId(drawings[0].id);
    }
    if (drawings.length === 0) {
      setActiveDrawingId(null);
    }
  }, [drawings.length]); // eslint-disable-line react-hooks/exhaustive-deps

  // Hydrate scope textarea from DB (once, on first load)
  const scopeHydratedRef = useRef(false);
  useEffect(() => {
    if (scopeRecord && !scopeHydratedRef.current) {
      setScopeText(scopeRecord.content ?? "");
      setScopeInputId(scopeRecord.id);
      scopeHydratedRef.current = true;
    }
  }, [scopeRecord]);

  // ── Mutations ────────────────────────────────────────────────────────────────

  const uploadFile = trpc.inputs.uploadFile.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error("Upload failed: " + err.message),
  });

  const createInput = trpc.inputs.create.useMutation({
    onSuccess: (data) => {
      if (data?.id) setScopeInputId((data as QuoteInput).id);
      refetch();
    },
    onError: (err) => toast.error("Failed to save scope: " + err.message),
  });

  const updateContent = trpc.inputs.updateContent.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error("Failed to update scope: " + err.message),
  });

  const deleteInput = trpc.inputs.delete.useMutation({
    onSuccess: () => refetch(),
    onError: (err) => toast.error("Failed to delete: " + err.message),
  });

  // ── Handlers ─────────────────────────────────────────────────────────────────

  const handleDrawingUpload = useCallback(async (files: FileList | File[]) => {
    const arr = Array.from(files).filter((f) => f.type === "application/pdf");
    if (arr.length === 0) {
      toast.error("Please upload PDF files only.");
      return;
    }

    setIsUploadingDrawing(true);
    try {
      for (const file of arr) {
        if (file.size > MAX_PDF_BYTES) {
          toast.error(`${file.name} exceeds ${MAX_PDF_MB}MB limit.`);
          continue;
        }
        const base64Data = await fileToBase64(file);
        await uploadFile.mutateAsync({
          quoteId,
          filename: file.name,
          contentType: "application/pdf",
          base64Data,
          inputType: "pdf",
        });
      }
    } finally {
      setIsUploadingDrawing(false);
    }
  }, [quoteId, uploadFile]);

  const handleLegendUpload = useCallback(async (file: File) => {
    if (file.type !== "application/pdf") {
      toast.error("Legend must be a PDF.");
      return;
    }
    if (file.size > MAX_PDF_BYTES) {
      toast.error(`File exceeds ${MAX_PDF_MB}MB limit.`);
      return;
    }

    // Delete existing legend first (job-level memory: only one)
    if (legend) {
      await deleteInput.mutateAsync({ id: legend.id, quoteId });
    }

    setIsUploadingLegend(true);
    try {
      const base64Data = await fileToBase64(file);
      await uploadFile.mutateAsync({
        quoteId,
        filename: file.name,
        contentType: "application/pdf",
        base64Data,
        inputType: "document",
      });
    } finally {
      setIsUploadingLegend(false);
    }
  }, [quoteId, legend, uploadFile, deleteInput]);

  const handleSaveScope = useCallback(async () => {
    if (!scopeText.trim()) return;
    setIsSavingScope(true);
    try {
      if (scopeInputId) {
        await updateContent.mutateAsync({ id: scopeInputId, quoteId, content: scopeText });
      } else {
        await createInput.mutateAsync({
          quoteId,
          inputType: "email",
          content: scopeText,
          filename: "Scope Notes",
        });
      }
      setScopeDirty(false);
      toast.success("Scope saved.");
    } finally {
      setIsSavingScope(false);
    }
  }, [scopeText, scopeInputId, quoteId, updateContent, createInput]);

  // Drag-and-drop on the drawing zone
  const onDragOver = (e: React.DragEvent) => { e.preventDefault(); setIsDraggingOver(true); };
  const onDragLeave = () => setIsDraggingOver(false);
  const onDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDraggingOver(false);
    if (e.dataTransfer.files.length) handleDrawingUpload(e.dataTransfer.files);
  };

  // ── Loading / error ──────────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading electrical workspace…
      </div>
    );
  }
  if (error || !fullQuote) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Quote not found or could not be loaded.
      </div>
    );
  }

  const quote = fullQuote.quote;
  const title = quote.title || "Untitled Quote";
  const reference = (quote as any).reference || "";

  // ── Render ───────────────────────────────────────────────────────────────────

  return (
    <div className="h-full flex flex-col overflow-hidden">

      {/* ── Header ─────────────────────────────────────────────────────────── */}
      <div className="flex items-center justify-between px-4 border-b bg-background shrink-0 h-14">
        <div className="flex items-center gap-3 min-w-0">
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setLocation("/dashboard")}
            className="shrink-0 -ml-1"
          >
            <ArrowLeft className="h-4 w-4 mr-1" />
            Back
          </Button>
          <div className="flex items-center gap-2 min-w-0">
            <Zap className="h-4 w-4 text-yellow-500 shrink-0" />
            <span className="font-semibold truncate">{title}</span>
            {reference && (
              <span className="text-xs text-muted-foreground shrink-0">{reference}</span>
            )}
            <Badge className="text-xs shrink-0 bg-yellow-100 text-yellow-800 border-yellow-200">
              Electrical
            </Badge>
          </div>
        </div>
        <div className="shrink-0 text-xs text-muted-foreground italic">
          Electrical Workspace
        </div>
      </div>

      {/* ── Tab bar ────────────────────────────────────────────────────────── */}
      <div className="flex items-center gap-1 px-4 border-b bg-background shrink-0 h-10">
        {TABS.map((tab) => {
          const Icon = tab.icon;
          const isActive = activeTab === tab.id;
          return (
            <button
              key={tab.id}
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "flex items-center gap-1.5 px-3 py-1 rounded-md text-sm font-medium transition-colors h-7",
                isActive
                  ? "bg-primary text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground hover:bg-muted"
              )}
            >
              <Icon className="h-3.5 w-3.5" />
              {tab.label}
            </button>
          );
        })}
      </div>

      {/* ── Main content ───────────────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Left sidebar — drawing list */}
        <div className="w-56 shrink-0 border-r flex flex-col overflow-hidden bg-muted/20">
          <div className="px-3 py-2 border-b bg-background flex items-center justify-between">
            <span className="text-xs font-semibold text-muted-foreground uppercase tracking-wider">
              Drawings
            </span>
            {drawings.length > 0 && (
              <span className="text-xs text-muted-foreground">{drawings.length}</span>
            )}
          </div>
          <div className="flex-1 overflow-y-auto">
            {drawings.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-3 py-4 text-center">
                No drawings uploaded yet
              </p>
            ) : (
              <ul className="py-1">
                {drawings.map((d) => (
                  <li key={d.id}>
                    <button
                      onClick={() => setActiveDrawingId(d.id)}
                      className={cn(
                        "w-full text-left px-3 py-2 flex flex-col gap-1 hover:bg-muted/60 transition-colors",
                        activeDrawingId === d.id && "bg-muted"
                      )}
                    >
                      <div className="flex items-start justify-between gap-1">
                        <span className="text-xs font-medium truncate leading-tight flex-1 min-w-0">
                          {d.filename ?? "Drawing"}
                        </span>
                        <button
                          onClick={(e) => {
                            e.stopPropagation();
                            deleteInput.mutate({ id: d.id, quoteId });
                          }}
                          className="shrink-0 text-muted-foreground hover:text-destructive transition-colors mt-0.5"
                          title="Remove drawing"
                        >
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

        {/* Right panel — tab content */}
        <div className="flex-1 overflow-y-auto">
          {activeTab === "inputs" ? (
            <InputsTab
              quoteId={quoteId}
              drawings={drawings}
              legend={legend}
              scopeText={scopeText}
              scopeDirty={scopeDirty}
              isSavingScope={isSavingScope}
              isUploadingDrawing={isUploadingDrawing}
              isUploadingLegend={isUploadingLegend}
              isDraggingOver={isDraggingOver}
              drawingInputRef={drawingInputRef}
              legendInputRef={legendInputRef}
              onScopeChange={(v) => { setScopeText(v); setScopeDirty(true); }}
              onSaveScope={handleSaveScope}
              onDrawingFiles={handleDrawingUpload}
              onLegendFile={handleLegendUpload}
              onDragOver={onDragOver}
              onDragLeave={onDragLeave}
              onDrop={onDrop}
              onDeleteLegend={() => legend && deleteInput.mutate({ id: legend.id, quoteId })}
            />
          ) : (
            <PlaceholderTab tab={activeTab} quoteId={quoteId} />
          )}
        </div>

      </div>
    </div>
  );
}

// ─── Inputs tab ──────────────────────────────────────────────────────────────

interface InputsTabProps {
  quoteId: number;
  drawings: QuoteInput[];
  legend: QuoteInput | null;
  scopeText: string;
  scopeDirty: boolean;
  isSavingScope: boolean;
  isUploadingDrawing: boolean;
  isUploadingLegend: boolean;
  isDraggingOver: boolean;
  drawingInputRef: React.RefObject<HTMLInputElement>;
  legendInputRef: React.RefObject<HTMLInputElement>;
  onScopeChange: (v: string) => void;
  onSaveScope: () => void;
  onDrawingFiles: (files: FileList | File[]) => void;
  onLegendFile: (file: File) => void;
  onDragOver: (e: React.DragEvent) => void;
  onDragLeave: () => void;
  onDrop: (e: React.DragEvent) => void;
  onDeleteLegend: () => void;
}

function InputsTab({
  quoteId, drawings, legend, scopeText, scopeDirty, isSavingScope,
  isUploadingDrawing, isUploadingLegend, isDraggingOver,
  drawingInputRef, legendInputRef,
  onScopeChange, onSaveScope,
  onDrawingFiles, onLegendFile,
  onDragOver, onDragLeave, onDrop, onDeleteLegend,
}: InputsTabProps) {

  return (
    <div className="p-5 flex flex-col gap-5 max-w-4xl">

      {/* ── Row 1: Drawing upload + Email for tender ─────────────────────── */}
      <div className="grid grid-cols-2 gap-4">

        {/* Drawing upload zone */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Upload className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Upload Drawings</span>
            <span className="text-xs text-muted-foreground">(PDF, multiple allowed)</span>
          </div>
          <div
            onDragOver={onDragOver}
            onDragLeave={onDragLeave}
            onDrop={onDrop}
            onClick={() => drawingInputRef.current?.click()}
            className={cn(
              "border-2 border-dashed rounded-lg p-6 flex flex-col items-center justify-center gap-2",
              "cursor-pointer transition-colors select-none min-h-[120px]",
              isDraggingOver
                ? "border-primary bg-primary/5"
                : "border-muted-foreground/25 hover:border-primary/50 hover:bg-muted/30"
            )}
          >
            {isUploadingDrawing ? (
              <>
                <Loader2 className="h-6 w-6 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">Uploading…</p>
              </>
            ) : (
              <>
                <Upload className="h-6 w-6 text-muted-foreground/60" />
                <p className="text-sm text-muted-foreground text-center">
                  Drop PDFs here or <span className="text-primary font-medium">browse</span>
                </p>
                <p className="text-xs text-muted-foreground/60">Max {20}MB per file</p>
              </>
            )}
          </div>
          <input
            ref={drawingInputRef}
            type="file"
            accept="application/pdf"
            multiple
            className="hidden"
            onChange={(e) => e.target.files && onDrawingFiles(e.target.files)}
          />
          {drawings.length > 0 && (
            <p className="text-xs text-muted-foreground">
              {drawings.length} drawing{drawings.length !== 1 ? "s" : ""} uploaded
            </p>
          )}
        </div>

        {/* Scope instructions / AI input */}
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-2">
            <Mail className="h-4 w-4 text-primary" />
            <span className="text-sm font-semibold">Scope &amp; AI Instructions</span>
          </div>
          <Textarea
            value={scopeText}
            onChange={(e) => onScopeChange(e.target.value)}
            placeholder={
              "Paste the client's email, scope of works, or any instructions here.\n\n" +
              "The AI reads this to understand what to include and exclude from the quote."
            }
            className="flex-1 min-h-[120px] resize-none text-sm"
          />
          <div className="flex items-center justify-between">
            <span className="text-xs text-muted-foreground">
              {scopeText.length > 0
                ? `${scopeText.length} characters${scopeDirty ? " — unsaved" : " — saved"}`
                : "Drives scope inclusion/exclusion"}
            </span>
            {scopeDirty && (
              <Button
                size="sm"
                variant="outline"
                onClick={onSaveScope}
                disabled={isSavingScope || !scopeText.trim()}
                className="h-7 text-xs"
              >
                {isSavingScope ? <Loader2 className="h-3 w-3 animate-spin mr-1" /> : null}
                Save
              </Button>
            )}
          </div>
        </div>
      </div>

      {/* ── Row 2: Legend upload — visually distinct ─────────────────────── */}
      <div className={cn(
        "rounded-lg border-2 p-4 flex flex-col gap-3",
        legend
          ? "border-teal-200 bg-teal-50/50"
          : "border-dashed border-amber-200 bg-amber-50/40"
      )}>
        <div className="flex items-center gap-2">
          <BookOpen className={cn("h-4 w-4", legend ? "text-teal-600" : "text-amber-600")} />
          <span className="text-sm font-semibold">
            Symbol Legend
            {!legend && (
              <span className="ml-1.5 text-xs font-normal text-muted-foreground">(optional)</span>
            )}
          </span>
          {legend && (
            <Badge className="text-[10px] px-1.5 py-0 h-4 bg-teal-100 text-teal-700 border-teal-200 ml-auto">
              Job-level — applies to all drawings
            </Badge>
          )}
        </div>

        {legend ? (
          /* Legend already uploaded */
          <div className="flex items-center justify-between bg-background rounded-md px-3 py-2 border border-teal-200">
            <div className="flex items-center gap-2 min-w-0">
              <File className="h-4 w-4 text-teal-600 shrink-0" />
              <span className="text-sm truncate">{legend.filename ?? "Symbol Legend"}</span>
              <StatusBadge status={legend.processingStatus} />
            </div>
            <div className="flex items-center gap-2 shrink-0">
              <button
                onClick={() => legendInputRef.current?.click()}
                className="text-xs text-muted-foreground hover:text-foreground flex items-center gap-1 transition-colors"
                title="Replace legend"
              >
                <RefreshCw className="h-3 w-3" />
                Replace
              </button>
              <button
                onClick={onDeleteLegend}
                className="text-muted-foreground hover:text-destructive transition-colors"
                title="Remove legend"
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          </div>
        ) : (
          /* No legend — upload slot */
          <div
            onClick={() => legendInputRef.current?.click()}
            className="flex items-center gap-3 cursor-pointer hover:bg-amber-50 transition-colors rounded-md px-3 py-2"
          >
            {isUploadingLegend ? (
              <Loader2 className="h-4 w-4 animate-spin text-amber-600" />
            ) : (
              <Upload className="h-4 w-4 text-amber-500" />
            )}
            <div>
              <p className="text-sm text-amber-700 font-medium">
                Upload Symbol Legend (optional)
              </p>
              <p className="text-xs text-muted-foreground">
                Upload once — the AI applies it to every drawing on this job.
                Leave blank if the legend is embedded in the drawings.
              </p>
            </div>
          </div>
        )}

        <input
          ref={legendInputRef}
          type="file"
          accept="application/pdf"
          className="hidden"
          onChange={(e) => {
            if (e.target.files?.[0]) {
              onLegendFile(e.target.files[0]);
              e.target.value = "";
            }
          }}
        />
      </div>

    </div>
  );
}

// ─── Placeholder tabs (Phases 3–6) ───────────────────────────────────────────

function PlaceholderTab({ tab, quoteId }: { tab: Tab; quoteId: number }) {
  const labels: Record<Tab, { heading: string; body: string }> = {
    inputs:  { heading: "Inputs",  body: "" },
    takeoff: { heading: "Takeoff", body: "Symbol review table — counts, descriptions, toggles per drawing. (Phase 3)" },
    qds:     { heading: "QDS",     body: "Quantities, Spon's labour auto-calculation, plant hire, preliminaries. (Phase 4)" },
    quote:   { heading: "Quote",   body: "Line items, phases, timelines, totals. (Phase 5)" },
    pdf:     { heading: "PDF",     body: "Tender submission document — cover page, breakdown, terms. (Phase 6)" },
  };
  const { heading, body } = labels[tab];
  return (
    <div className="flex flex-col items-center justify-center min-h-64 gap-3 p-8 text-center">
      <p className="text-lg font-semibold">{heading}</p>
      <p className="text-sm text-muted-foreground max-w-sm">{body}</p>
      <p className="text-xs text-muted-foreground/50">Quote ID: {quoteId}</p>
    </div>
  );
}
