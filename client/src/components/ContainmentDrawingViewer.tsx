/**
 * ContainmentDrawingViewer — full-screen interactive PDF viewer for containment takeoffs.
 *
 * Renders the actual drawing PDF on a canvas (PDF.js, identical to DrawingViewerModal in
 * TakeoffPanel) with an interactive SVG overlay showing each tray run as coloured line segments.
 *
 * Interactions:
 *   - Zoom / pan (scroll to zoom, drag to pan)
 *   - Click a tray run line segment → select that run, show edit panel
 *   - Edit panel: adjust length, change size, change tray type, exclude from quote
 *   - Legend chips: click to toggle a run's visibility
 *   - Save → trpc.containmentTakeoff.updateTrayRuns (existing mutation)
 *   - Overlay On/Off toggle hides all lines without losing edits
 *
 * DOES NOT TOUCH: symbol takeoff, TakeoffPanel, TakeoffViewer, QDS, billing, other sectors.
 * Only changes when saved: containment_takeoffs.tray_runs (via existing updateTrayRuns).
 *
 * No new tRPC mutations. No schema changes. No drizzle-kit push.
 */
import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import {
  ZoomIn, ZoomOut, Maximize, Eye, EyeOff,
  X, Save, Loader2, AlertTriangle, Pencil, RotateCcw,
  MousePointer2,
} from "lucide-react";

// ── Brand / size colours (mirrors ContainmentTakeoffPanel) ──────────────────

const TRAY_SIZE_COLOURS: Record<number, string> = {
  50:  "#22c55e",
  75:  "#06b6d4",
  100: "#3b82f6",
  150: "#8b5cf6",
  225: "#f59e0b",
  300: "#ef4444",
  450: "#ec4899",
  600: "#f97316",
};

const TRAY_TYPES = ["LV", "FA", "ELV", "SUB", "SUBMAIN", "DATA", "COMMS"];

function runColour(sizeMillimetres: number, colourFromPdf?: string): string {
  // Prefer colour extracted from drawing (matches what Mitch actually drew),
  // fall back to size-based UI colour for readability
  if (colourFromPdf && colourFromPdf !== "#000000" && colourFromPdf !== "#888888") {
    return colourFromPdf;
  }
  return TRAY_SIZE_COLOURS[sizeMillimetres] || "#14b8a6";
}

function runLabel(run: TrayRun): string {
  return `${run.sizeMillimetres}mm ${run.trayType}`;
}

// ── Types ─────────────────────────────────────────────────────────────────────

interface TraySegment {
  x1: number; y1: number;
  x2: number; y2: number;
  lengthMetres: number;
}

interface TrayRun {
  id: string;
  sizeMillimetres: number;
  trayType: string;
  lengthMetres: number;
  heightMetres: number;
  wholesalerLengths: number;
  tPieces: number;
  crossPieces: number;
  bends90: number;
  drops: number;
  segments: TraySegment[];
  colour?: string;
}

interface Props {
  inputId: number;
  takeoffId: number;
  trayRuns: TrayRun[];
  pageWidth: number;
  pageHeight: number;
  drawingRef: string;
  isVerified: boolean;
  wholesalerLengthMetres: number;
  onClose: () => void;
  onSaved: () => void;
}

// ── Component ─────────────────────────────────────────────────────────────────

export default function ContainmentDrawingViewer({
  inputId,
  takeoffId,
  trayRuns: initialRuns,
  pageWidth: pdfPageWidth,
  pageHeight: pdfPageHeight,
  drawingRef,
  isVerified,
  wholesalerLengthMetres,
  onClose,
  onSaved,
}: Props) {
  // ── State ────────────────────────────────────────────────────────────────

  // Working copy of tray runs — user edits these locally, Save flushes to DB
  const [runs, setRuns] = useState<TrayRun[]>(() =>
    initialRuns.map(r => ({ ...r, segments: r.segments || [] }))
  );
  const [hiddenRunIds, setHiddenRunIds] = useState<Set<string>>(new Set());
  const [selectedRunId, setSelectedRunId] = useState<string | null>(null);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Edit panel state — for the selected run
  const [editLength, setEditLength] = useState("");
  const [editSize, setEditSize] = useState("");
  const [editType, setEditType] = useState("");
  const [editExcluded, setEditExcluded] = useState(false);

  // PDF rendering
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [isLoadingPdf, setIsLoadingPdf] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });

  // Pan / zoom
  const [zoom, setZoom] = useState(1);
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // Excluded run IDs (local — not yet saved)
  const [excludedRunIds, setExcludedRunIds] = useState<Set<string>>(new Set());

  const hasChanges = useMemo(() => {
    const origById = new Map(initialRuns.map(r => [r.id, r]));
    return runs.some(r => {
      const o = origById.get(r.id);
      if (!o) return true;
      return (
        r.lengthMetres !== o.lengthMetres ||
        r.sizeMillimetres !== o.sizeMillimetres ||
        r.trayType !== o.trayType
      );
    }) || excludedRunIds.size > 0;
  }, [runs, excludedRunIds, initialRuns]);

  // ── tRPC ──────────────────────────────────────────────────────────────────

  const { data: pdfData } = trpc.electricalTakeoff.getPdfData.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  const updateRunsMut = trpc.containmentTakeoff.updateTrayRuns.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      setSaveError(null);
      onSaved();
    },
    onError: (e) => {
      setIsSaving(false);
      setSaveError(e.message);
    },
  });

  // ── PDF rendering (identical to DrawingViewerModal in TakeoffPanel) ────────

  useEffect(() => {
    if (!pdfData?.base64 || !canvasRef.current) return;
    let cancelled = false;

    const renderPdf = async () => {
      try {
        setIsLoadingPdf(true);
        setRenderError(null);

        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const script = document.createElement("script");
            script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            script.onload = () => {
              const lib = (window as any).pdfjsLib;
              if (lib) {
                lib.GlobalWorkerOptions.workerSrc =
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                resolve();
              } else reject(new Error("pdfjsLib not found"));
            };
            script.onerror = () => reject(new Error("Failed to load PDF.js"));
            document.head.appendChild(script);
          });
        }

        const pdfjsLib = (window as any).pdfjsLib;
        if (!pdfjsLib) throw new Error("PDF.js not available");

        const binaryString = atob(pdfData.base64);
        const bytes = new Uint8Array(binaryString.length);
        for (let i = 0; i < binaryString.length; i++) bytes[i] = binaryString.charCodeAt(i);

        if (cancelled) return;

        const pdf = await pdfjsLib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const renderScale = 2;
        const viewport = page.getViewport({ scale: renderScale });
        const canvas = canvasRef.current;
        if (!canvas) return;

        canvas.width = viewport.width;
        canvas.height = viewport.height;
        canvas.style.width = `${viewport.width / renderScale}px`;
        canvas.style.height = `${viewport.height / renderScale}px`;

        setPdfDimensions({
          width: viewport.width / renderScale,
          height: viewport.height / renderScale,
        });

        const ctx = canvas.getContext("2d");
        if (!ctx) throw new Error("Cannot get canvas context");

        await page.render({ canvasContext: ctx, viewport }).promise;
        if (!cancelled) setIsLoadingPdf(false);
      } catch (err: any) {
        if (!cancelled) {
          setRenderError(err.message || "Failed to render PDF");
          setIsLoadingPdf(false);
        }
      }
    };

    renderPdf();
    return () => { cancelled = true; };
  }, [pdfData]);

  // ── Zoom / pan ────────────────────────────────────────────────────────────

  const zoomToPoint = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const clamped = Math.max(0.2, Math.min(6, newZoom));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(clamped); return; }
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;
    setZoom(clamped);
    setPosition({ x: mouseX - contentX * clamped, y: mouseY - contentY * clamped });
  }, [zoom, position]);

  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    zoomToPoint(zoom + (e.deltaY > 0 ? -0.12 : 0.12) * zoom * 0.3, e.clientX, e.clientY);
  }, [zoom, zoomToPoint]);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  }, [position]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  }, [isDragging, dragStart]);

  const handleMouseUp = useCallback(() => setIsDragging(false), []);

  const handleFit = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  // ── Segment click — select run ────────────────────────────────────────────

  const handleSegmentClick = useCallback((runId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (isVerified) return;
    const run = runs.find(r => r.id === runId);
    if (!run) return;
    setSelectedRunId(prev => prev === runId ? null : runId);
    if (run) {
      setEditLength(String(run.lengthMetres));
      setEditSize(String(run.sizeMillimetres));
      setEditType(run.trayType);
      setEditExcluded(excludedRunIds.has(runId));
    }
  }, [runs, isVerified, excludedRunIds]);

  // Clear selection when clicking blank drawing area
  const handleDrawingClick = useCallback(() => {
    setSelectedRunId(null);
  }, []);

  // ── Edit panel actions ────────────────────────────────────────────────────

  const applyRunEdit = () => {
    if (!selectedRunId) return;
    const len = parseFloat(editLength);
    const size = parseInt(editSize, 10);
    if (isNaN(len) || isNaN(size) || len < 0) return;

    if (editExcluded) {
      setExcludedRunIds(prev => { const n = new Set(prev); n.add(selectedRunId); return n; });
    } else {
      setExcludedRunIds(prev => { const n = new Set(prev); n.delete(selectedRunId); return n; });
    }

    setRuns(prev => prev.map(r =>
      r.id !== selectedRunId ? r : {
        ...r,
        lengthMetres: len,
        sizeMillimetres: size,
        trayType: editType,
        wholesalerLengths: Math.ceil(len / wholesalerLengthMetres),
      }
    ));
    setSelectedRunId(null);
  };

  const resetEdits = () => {
    setRuns(initialRuns.map(r => ({ ...r, segments: r.segments || [] })));
    setExcludedRunIds(new Set());
    setSelectedRunId(null);
    setSaveError(null);
  };

  // ── Save ─────────────────────────────────────────────────────────────────

  const handleSave = () => {
    setIsSaving(true);
    setSaveError(null);
    const toSave = runs
      .filter(r => !excludedRunIds.has(r.id))
      .map(r => ({
        id: r.id,
        sizeMillimetres: r.sizeMillimetres,
        trayType: r.trayType,
        lengthMetres: r.lengthMetres,
        heightMetres: r.heightMetres,
        tPieces: r.tPieces,
        crossPieces: r.crossPieces,
        bends90: r.bends90,
        drops: r.drops,
      }));
    updateRunsMut.mutate({ takeoffId, trayRuns: toSave });
  };

  // ── Close on Escape ────────────────────────────────────────────────────────

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (selectedRunId) setSelectedRunId(null);
        else onClose();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [onClose, selectedRunId]);

  // ── Derived ───────────────────────────────────────────────────────────────

  const selectedRun = runs.find(r => r.id === selectedRunId) ?? null;
  const visibleRuns = runs.filter(r => !hiddenRunIds.has(r.id) && !excludedRunIds.has(r.id));
  const totalMetres = visibleRuns.reduce((s, r) => s + r.lengthMetres, 0);
  const totalLengths = visibleRuns.reduce((s, r) => s + r.wholesalerLengths, 0);

  // Scale: convert PDF coordinate → CSS pixel in the rendered canvas
  const scaleX = pdfDimensions.width > 0 ? pdfDimensions.width / pdfPageWidth : 1;
  const scaleY = pdfDimensions.height > 0 ? pdfDimensions.height / pdfPageHeight : 1;

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div className="fixed inset-0 z-50 bg-black/85 flex flex-col">

      {/* ── Header toolbar ── */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4 text-teal-600" />
              Containment Drawing — {drawingRef}
              {isVerified && <Badge className="bg-green-100 text-green-800 text-xs">Approved</Badge>}
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              {runs.length} tray run{runs.length !== 1 ? "s" : ""} · {totalMetres.toFixed(1)}m total · {totalLengths} lengths
            </p>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-4">
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => zoomToPoint(zoom - 0.25, window.innerWidth / 2, window.innerHeight / 2)}>
              <ZoomOut className="h-4 w-4" />
            </Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8"
              onClick={() => zoomToPoint(zoom + 0.25, window.innerWidth / 2, window.innerHeight / 2)}>
              <ZoomIn className="h-4 w-4" />
            </Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit}>
              <Maximize className="h-4 w-4" />
            </Button>
          </div>

          {/* Overlay toggle */}
          <Button
            variant={showOverlay ? "default" : "outline"}
            size="sm"
            className="h-8 text-xs ml-2"
            onClick={() => setShowOverlay(s => !s)}
          >
            {showOverlay ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {showOverlay ? "Overlay On" : "Overlay Off"}
          </Button>
        </div>

        {/* Right: Reset + Save + Close */}
        <div className="flex items-center gap-2">
          {hasChanges && !isVerified && (
            <Button variant="ghost" size="sm" className="h-8 text-xs text-slate-500" onClick={resetEdits}>
              <RotateCcw className="h-3 w-3 mr-1" /> Reset
            </Button>
          )}
          {hasChanges && !isVerified && (
            <Button
              size="sm"
              className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
              onClick={handleSave}
              disabled={isSaving}
            >
              {isSaving
                ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                : <Save className="h-3 w-3 mr-1" />}
              Save Changes
              {excludedRunIds.size > 0 && ` (-${excludedRunIds.size} excluded)`}
            </Button>
          )}
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>
      </div>

      {/* Save error bar */}
      {saveError && (
        <div className="bg-red-50 border-b border-red-200 px-4 py-1.5 text-xs text-red-700 flex items-center gap-2">
          <AlertTriangle className="h-3 w-3" /> {saveError}
        </div>
      )}

      {/* ── Legend chip bar ── */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
        <span className="text-[11px] text-slate-400 self-center mr-1">Toggle runs:</span>
        {runs.map(run => {
          const colour = runColour(run.sizeMillimetres, run.colour);
          const isHidden = hiddenRunIds.has(run.id);
          const isExcluded = excludedRunIds.has(run.id);
          const isSelected = selectedRunId === run.id;
          return (
            <button
              key={run.id}
              className={`flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all ${
                isExcluded
                  ? "bg-gray-100 text-gray-400 border-gray-200 line-through"
                  : isHidden
                    ? "bg-gray-100 text-gray-400 border-gray-200"
                    : isSelected
                      ? "ring-2 ring-offset-1"
                      : "hover:opacity-80"
              }`}
              style={isHidden || isExcluded ? {} : {
                backgroundColor: `${colour}18`,
                borderColor: `${colour}50`,
                color: colour,
                ...(isSelected ? { ringColor: colour } : {}),
              }}
              onClick={() => {
                if (isVerified) return;
                setHiddenRunIds(prev => {
                  const n = new Set(prev);
                  n.has(run.id) ? n.delete(run.id) : n.add(run.id);
                  return n;
                });
              }}
              title={`${isHidden ? "Show" : "Hide"} ${runLabel(run)} — ${run.lengthMetres}m (${run.wholesalerLengths} lengths)`}
            >
              <span className="w-2 h-2 rounded-full" style={{ backgroundColor: isHidden || isExcluded ? "#ccc" : colour }} />
              {runLabel(run)}: {run.lengthMetres}m
              {isExcluded && <span className="ml-0.5 text-[10px]">excluded</span>}
              {isHidden && !isExcluded && <EyeOff className="h-2.5 w-2.5 ml-0.5" />}
            </button>
          );
        })}
        {hasChanges && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            Unsaved changes
          </div>
        )}
      </div>

      {/* ── Click instruction bar ── */}
      {!isVerified && (
        <div className="bg-slate-50 border-b px-4 py-1.5 text-xs text-slate-500 flex items-center gap-2 flex-shrink-0">
          <MousePointer2 className="h-3 w-3" />
          Click a coloured line to select a tray run and edit its length, size or exclude it from scope. Use the legend chips above to show/hide runs.
        </div>
      )}

      {/* ── Main: drawing canvas ── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-800 relative cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
        onClick={handleDrawingClick}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: "0 0",
            transition: isDragging ? "none" : "transform 0.1s ease-out",
          }}
        >
          <div
            className="relative"
            style={pdfDimensions.width ? { width: pdfDimensions.width, height: pdfDimensions.height } : undefined}
          >
            {/* Loading state */}
            {isLoadingPdf && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10 min-h-[400px] min-w-[600px]">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
                  <p className="text-gray-400 text-sm mt-2">Loading drawing…</p>
                </div>
              </div>
            )}

            {/* Render error */}
            {renderError ? (
              <div className="flex items-center justify-center bg-gray-700 min-h-[400px] min-w-[600px]">
                <div className="text-center p-8">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Failed to render PDF: {renderError}</p>
                  <p className="text-gray-500 text-xs mt-2">Tray run data is still available in the panel.</p>
                </div>
              </div>
            ) : (
              <>
                {/* PDF canvas */}
                <canvas ref={canvasRef} className="block" style={{ imageRendering: "auto" }} />

                {/* Interactive SVG overlay */}
                {pdfDimensions.width > 0 && showOverlay && (
                  <svg
                    className="absolute top-0 left-0"
                    width={pdfDimensions.width}
                    height={pdfDimensions.height}
                    viewBox={`0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
                    style={{ pointerEvents: isVerified ? "none" : "all" }}
                  >
                    {runs.map(run => {
                      if (hiddenRunIds.has(run.id) || excludedRunIds.has(run.id)) return null;
                      const colour = runColour(run.sizeMillimetres, run.colour);
                      const isSelected = selectedRunId === run.id;
                      const segments = run.segments || [];

                      if (segments.length === 0) return null;

                      return (
                        <g key={run.id}>
                          {segments.map((seg, si) => {
                            // Convert PDF coords → canvas CSS pixels
                            const x1 = seg.x1 * scaleX;
                            const y1 = seg.y1 * scaleY;
                            const x2 = seg.x2 * scaleX;
                            const y2 = seg.y2 * scaleY;
                            const midX = (x1 + x2) / 2;
                            const midY = (y1 + y2) / 2;

                            return (
                              <g key={si}>
                                {/* Hit target — wide invisible stroke for easier clicking */}
                                <line
                                  x1={x1} y1={y1} x2={x2} y2={y2}
                                  stroke="transparent"
                                  strokeWidth={12}
                                  style={{ cursor: "pointer" }}
                                  onClick={(e) => handleSegmentClick(run.id, e)}
                                />
                                {/* Visible line */}
                                <line
                                  x1={x1} y1={y1} x2={x2} y2={y2}
                                  stroke={colour}
                                  strokeWidth={isSelected ? 5 : 3}
                                  strokeOpacity={isSelected ? 1 : 0.75}
                                  strokeLinecap="round"
                                  style={{ pointerEvents: "none" }}
                                />
                                {/* Selection glow */}
                                {isSelected && (
                                  <line
                                    x1={x1} y1={y1} x2={x2} y2={y2}
                                    stroke={colour}
                                    strokeWidth={10}
                                    strokeOpacity={0.2}
                                    strokeLinecap="round"
                                    style={{ pointerEvents: "none" }}
                                  />
                                )}
                                {/* Length label on each segment */}
                                <rect
                                  x={midX - 18} y={midY - 7}
                                  width={36} height={14}
                                  rx={3}
                                  fill="white" fillOpacity={0.9}
                                  stroke={colour} strokeWidth={0.5}
                                  style={{ pointerEvents: "none" }}
                                />
                                <text
                                  x={midX} y={midY + 4}
                                  textAnchor="middle"
                                  fontSize={8}
                                  fontWeight="bold"
                                  fill={colour}
                                  style={{ pointerEvents: "none" }}
                                >
                                  {seg.lengthMetres}m
                                </text>
                              </g>
                            );
                          })}
                        </g>
                      );
                    })}
                  </svg>
                )}
              </>
            )}
          </div>
        </div>

        {/* ── Floating edit panel — appears when a run is selected ── */}
        {selectedRun && !isVerified && (
          <div
            className="absolute bottom-4 left-1/2 -translate-x-1/2 bg-white rounded-xl shadow-2xl border border-slate-200 p-4 flex items-start gap-4 z-20 min-w-[420px]"
            onClick={e => e.stopPropagation()}
          >
            {/* Run identity */}
            <div className="flex-shrink-0">
              <div
                className="w-3 h-3 rounded-full mt-0.5"
                style={{ backgroundColor: runColour(selectedRun.sizeMillimetres, selectedRun.colour) }}
              />
            </div>
            <div className="flex-1 space-y-3">
              <div className="flex items-center gap-2">
                <span className="text-sm font-semibold text-slate-800">{runLabel(selectedRun)}</span>
                <Badge variant="outline" className="text-[10px]">
                  {selectedRun.wholesalerLengths} × {wholesalerLengthMetres}m lengths
                </Badge>
              </div>

              <div className="grid grid-cols-3 gap-3">
                {/* Length */}
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 block mb-1">
                    Length (m)
                  </label>
                  <Input
                    type="number"
                    step="0.5"
                    min="0"
                    value={editLength}
                    onChange={e => setEditLength(e.target.value)}
                    className="h-8 text-sm"
                  />
                </div>
                {/* Size */}
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 block mb-1">
                    Size (mm)
                  </label>
                  <select
                    value={editSize}
                    onChange={e => setEditSize(e.target.value)}
                    className="w-full h-8 text-sm rounded border border-slate-200 px-2"
                  >
                    {[50, 75, 100, 150, 225, 300, 450, 600].map(s => (
                      <option key={s} value={s}>{s}mm</option>
                    ))}
                  </select>
                </div>
                {/* Type */}
                <div>
                  <label className="text-[10px] font-semibold uppercase text-slate-500 block mb-1">
                    Type
                  </label>
                  <select
                    value={editType}
                    onChange={e => setEditType(e.target.value)}
                    className="w-full h-8 text-sm rounded border border-slate-200 px-2"
                  >
                    {TRAY_TYPES.map(t => (
                      <option key={t} value={t}>{t}</option>
                    ))}
                  </select>
                </div>
              </div>

              {/* Exclude toggle */}
              <label className="flex items-center gap-2 cursor-pointer text-sm text-slate-700">
                <input
                  type="checkbox"
                  checked={editExcluded}
                  onChange={e => setEditExcluded(e.target.checked)}
                  className="rounded"
                />
                Exclude this run from quote scope
              </label>

              {/* Actions */}
              <div className="flex items-center gap-2 pt-1">
                <Button
                  size="sm"
                  className="h-8 text-xs bg-teal-600 hover:bg-teal-700 text-white"
                  onClick={applyRunEdit}
                >
                  <Pencil className="h-3 w-3 mr-1" /> Apply
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  className="h-8 text-xs"
                  onClick={() => setSelectedRunId(null)}
                >
                  Cancel
                </Button>
                <span className="text-[11px] text-slate-400 ml-2">
                  Changes are staged — click Save Changes to persist
                </span>
              </div>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
