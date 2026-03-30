/**
 * ElectricalDrawingViewer.tsx
 *
 * Full-screen marked-drawing viewer for the electrical workspace.
 * Adapted from the DrawingViewerModal inside TakeoffPanel.tsx — containment
 * props removed, both feedback paths fully wired to persist to DB:
 *
 *   Chip toggle  → updateExcludedCodes mutation → TakeoffTab table re-fetches
 *   Marker add/remove → updateMarkers mutation  → counts + svgOverlay updated in DB
 *
 * Props contract:
 *   takeoffId, inputId, drawingRef            — which takeoff / input to operate on
 *   symbols, pageWidth, pageHeight            — from electricalTakeoff.list (already loaded)
 *   svgOverlay                                — rendered SVG string from DB
 *   symbolStyles, symbolDescriptions          — for chip / marker colouring
 *   initialExcludedCodes                      — Set<string> of currently-excluded codes
 *   onExcludedCodesChange(codes: string[])    — caller persists via updateExcludedCodes
 *   onMarkersUpdated()                        — caller calls refetchTakeoffs()
 *   onClose()
 *
 * DOES NOT TOUCH: QuoteWorkspace, TakeoffPanel, GeneralEngine, or any other sector.
 */

import { useState, useRef, useEffect, useMemo, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import {
  ZoomIn, ZoomOut, Maximize, Eye, EyeOff,
  Loader2, X, Plus, Save, MousePointer2, AlertTriangle,
} from "lucide-react";

// ─── Types ────────────────────────────────────────────────────────────────────

interface MarkerData {
  id: string;
  symbolCode: string;
  x: number;
  y: number;
  isStatusMarker: boolean;
  isNew?: boolean;
}

export interface ElectricalDrawingViewerProps {
  takeoffId: number;
  inputId: number;
  drawingRef: string;
  symbols: Array<{
    id: string; symbolCode: string; category: string;
    x: number; y: number; confidence: string;
    isStatusMarker: boolean; nearbySymbol?: string;
  }>;
  pageWidth: number;
  pageHeight: number;
  symbolStyles: Record<string, { colour: string; shape: string; radius: number }>;
  symbolDescriptions: Record<string, string>;
  initialExcludedCodes: Set<string>;
  onExcludedCodesChange: (codes: string[]) => void;
  onMarkersUpdated: () => void;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ElectricalDrawingViewer({
  takeoffId,
  inputId,
  drawingRef,
  symbols: initialSymbols,
  pageWidth: pdfPageWidth,
  pageHeight: pdfPageHeight,
  symbolStyles,
  symbolDescriptions,
  initialExcludedCodes,
  onExcludedCodesChange,
  onMarkersUpdated,
  onClose,
}: ElectricalDrawingViewerProps) {

  // ── Canvas / PDF state ─────────────────────────────────────────────────────
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const [zoom, setZoom] = useState(1);
  const [showOverlay, setShowOverlay] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [renderError, setRenderError] = useState<string | null>(null);
  const [pdfDimensions, setPdfDimensions] = useState({ width: 0, height: 0 });
  const [position, setPosition] = useState({ x: 0, y: 0 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });

  // ── Marker editing state ───────────────────────────────────────────────────
  const [markers, setMarkers] = useState<MarkerData[]>(() =>
    initialSymbols.filter(s => !s.isStatusMarker).map(s => ({
      id: s.id, symbolCode: s.symbolCode,
      x: s.x, y: s.y, isStatusMarker: false,
    }))
  );
  const [removedIds, setRemovedIds]       = useState<Set<string>>(new Set());
  const [addedMarkers, setAddedMarkers]   = useState<MarkerData[]>([]);
  const [editMode, setEditMode]           = useState<string | null>(null); // null=pan, string=code to place
  const [isSaving, setIsSaving]           = useState(false);

  // ── Excluded codes — local optimistic copy, persisted via callback ─────────
  const [excludedCodes, setExcludedCodes] = useState<Set<string>>(new Set(initialExcludedCodes));

  const hasMarkerChanges = removedIds.size > 0 || addedMarkers.length > 0;

  // ── Live counts (from current markers state) ───────────────────────────────
  const liveCounts = useMemo(() => {
    const c: Record<string, number> = {};
    for (const m of markers) {
      if (!removedIds.has(m.id)) c[m.symbolCode] = (c[m.symbolCode] || 0) + 1;
    }
    for (const m of addedMarkers) {
      c[m.symbolCode] = (c[m.symbolCode] || 0) + 1;
    }
    return c;
  }, [markers, removedIds, addedMarkers]);

  // ── Mutations ──────────────────────────────────────────────────────────────
  const updateMarkersMutation = trpc.electricalTakeoff.updateMarkers.useMutation({
    onSuccess: () => {
      setIsSaving(false);
      toast.success("Drawing updated — counts recalculated.");
      onMarkersUpdated(); // triggers refetchTakeoffs in parent
      // Clear pending changes — markers are now the server state
      setRemovedIds(new Set());
      setAddedMarkers([]);
    },
    onError: (err) => {
      setIsSaving(false);
      toast.error("Failed to save: " + err.message);
    },
  });

  const handleSaveMarkers = useCallback(() => {
    if (!hasMarkerChanges) return;
    setIsSaving(true);
    updateMarkersMutation.mutate({
      takeoffId,
      removedIds: Array.from(removedIds),
      addedMarkers: addedMarkers.map(m => ({ symbolCode: m.symbolCode, x: m.x, y: m.y })),
    });
  }, [takeoffId, removedIds, addedMarkers, hasMarkerChanges, updateMarkersMutation]);

  // ── Chip toggle — persists excluded codes ──────────────────────────────────
  const handleChipToggle = useCallback((code: string) => {
    setExcludedCodes(prev => {
      const next = new Set(prev);
      next.has(code) ? next.delete(code) : next.add(code);
      onExcludedCodesChange(Array.from(next));
      return next;
    });
  }, [onExcludedCodesChange]);

  // ── Marker interactions ────────────────────────────────────────────────────
  const handleMarkerClick = useCallback((markerId: string, isAdded: boolean) => {
    if (isAdded) {
      setAddedMarkers(prev => prev.filter(m => m.id !== markerId));
    } else {
      setRemovedIds(prev => {
        const next = new Set(prev);
        next.has(markerId) ? next.delete(markerId) : next.add(markerId);
        return next;
      });
    }
  }, []);

  const handleDrawingClick = useCallback((e: React.MouseEvent) => {
    if (!editMode || !pdfDimensions.width || isDragging) return;
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const mouseX = e.clientX - rect.left;
    const mouseY = e.clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;
    const pdfX = (contentX / pdfDimensions.width) * pdfPageWidth;
    const pdfY = (contentY / pdfDimensions.height) * pdfPageHeight;
    if (pdfX < 0 || pdfX > pdfPageWidth || pdfY < 0 || pdfY > pdfPageHeight) return;
    setAddedMarkers(prev => [...prev, {
      id: `added-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`,
      symbolCode: editMode, x: pdfX, y: pdfY,
      isStatusMarker: false, isNew: true,
    }]);
  }, [editMode, pdfDimensions, position, zoom, pdfPageWidth, pdfPageHeight, isDragging]);

  // ── Zoom ───────────────────────────────────────────────────────────────────
  const zoomToPoint = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const clamped = Math.max(0.25, Math.min(5, newZoom));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(clamped); return; }
    const mouseX = clientX - rect.left;
    const mouseY = clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;
    setZoom(clamped);
    setPosition({ x: mouseX - contentX * clamped, y: mouseY - contentY * clamped });
  }, [zoom, position]);

  const handleZoomIn  = () => { const r = containerRef.current?.getBoundingClientRect(); r ? zoomToPoint(zoom + 0.25, r.left + r.width / 2, r.top + r.height / 2) : setZoom(z => Math.min(z + 0.25, 5)); };
  const handleZoomOut = () => { const r = containerRef.current?.getBoundingClientRect(); r ? zoomToPoint(zoom - 0.25, r.left + r.width / 2, r.top + r.height / 2) : setZoom(z => Math.max(z - 0.25, 0.25)); };
  const handleFit = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };

  // ── Pan ────────────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0 || editMode) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    if (!isDragging) return;
    setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
  };
  const handleMouseUp = () => setIsDragging(false);
  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    zoomToPoint(zoom + (e.deltaY > 0 ? -0.15 : 0.15), e.clientX, e.clientY);
  };

  // ── Fetch + render PDF ─────────────────────────────────────────────────────
  const { data: pdfData } = trpc.electricalTakeoff.getPdfData.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  useEffect(() => {
    if (!pdfData?.base64 || !canvasRef.current) return;
    let cancelled = false;

    const render = async () => {
      try {
        setIsLoading(true);
        setRenderError(null);

        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement("script");
            s.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js";
            s.onload = () => {
              const lib = (window as any).pdfjsLib;
              if (lib) {
                lib.GlobalWorkerOptions.workerSrc =
                  "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js";
                resolve();
              } else reject(new Error("pdfjsLib not found"));
            };
            s.onerror = () => reject(new Error("Failed to load PDF.js"));
            document.head.appendChild(s);
          });
        }

        const lib = (window as any).pdfjsLib;
        if (!lib) throw new Error("PDF.js not available");

        const bytes = Uint8Array.from(atob(pdfData.base64), c => c.charCodeAt(0));
        if (cancelled) return;

        const pdf  = await lib.getDocument({ data: bytes }).promise;
        const page = await pdf.getPage(1);
        if (cancelled) return;

        const scale   = 2;
        const vp      = page.getViewport({ scale });
        const canvas  = canvasRef.current!;
        canvas.width  = vp.width;
        canvas.height = vp.height;
        canvas.style.width  = `${vp.width  / scale}px`;
        canvas.style.height = `${vp.height / scale}px`;
        setPdfDimensions({ width: vp.width / scale, height: vp.height / scale });

        const ctx = canvas.getContext("2d")!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setIsLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setRenderError(err.message || "Failed to render PDF");
          setIsLoading(false);
        }
      }
    };

    render();
    return () => { cancelled = true; };
  }, [pdfData]);

  // ── Escape key ─────────────────────────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") editMode ? setEditMode(null) : onClose();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [editMode, onClose]);

  // ── Render a single marker ─────────────────────────────────────────────────
  const renderMarker = (m: MarkerData, isRemoved: boolean, isAdded: boolean) => {
    if (isRemoved || excludedCodes.has(m.symbolCode) || !showOverlay) return null;
    if (!pdfDimensions.width) return null;

    const style = symbolStyles[m.symbolCode] || { colour: "#888888", shape: "circle", radius: 20 };
    const r  = style.radius / 4;
    const cx = (m.x / pdfPageWidth)  * pdfDimensions.width;
    const cy = (m.y / pdfPageHeight) * pdfDimensions.height;

    return (
      <g key={m.id}
        style={{ cursor: "pointer" }}
        onClick={e => { e.stopPropagation(); handleMarkerClick(m.id, isAdded); }}>
        {style.shape === "circle" && (
          <>
            <circle cx={cx} cy={cy} r={r} fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9} />
            <circle cx={cx} cy={cy} r={1.5} fill={style.colour} />
          </>
        )}
        {style.shape === "square" && (
          <>
            <rect x={cx - r} y={cy - r} width={r * 2} height={r * 2} fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9} />
            <circle cx={cx} cy={cy} r={1.2} fill={style.colour} />
          </>
        )}
        {style.shape === "diamond" && (
          <polygon
            points={`${cx},${cy - r} ${cx + r},${cy} ${cx},${cy + r} ${cx - r},${cy}`}
            fill="none" stroke={style.colour} strokeWidth={1.5} strokeOpacity={0.9}
          />
        )}
        {isAdded && (
          <circle cx={cx} cy={cy} r={r + 2} fill="none" stroke="#22c55e" strokeWidth={0.8} strokeDasharray="2,2" />
        )}
        <title>
          {m.symbolCode} — {symbolDescriptions[m.symbolCode] || m.symbolCode}
          {" "}— click to {isAdded ? "remove" : "toggle removal"}
        </title>
      </g>
    );
  };

  // ── Counts ─────────────────────────────────────────────────────────────────
  const totalItems   = Object.values(liveCounts).reduce((a, b) => a + b, 0);
  const visibleTotal = Object.entries(liveCounts)
    .filter(([code]) => !excludedCodes.has(code))
    .reduce((s, [, n]) => s + n, 0);
  const allCodes = Object.keys(liveCounts).sort();

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div>
            <h3 className="text-sm font-semibold flex items-center gap-2">
              <Eye className="h-4 w-4" />
              {drawingRef}
            </h3>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-2 border-l pl-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit}><Maximize className="h-4 w-4" /></Button>
          </div>

          {/* Overlay toggle */}
          <Button
            variant={showOverlay ? "default" : "outline"}
            size="sm" className="h-8 text-xs"
            onClick={() => setShowOverlay(v => !v)}>
            {showOverlay ? <Eye className="h-3 w-3 mr-1" /> : <EyeOff className="h-3 w-3 mr-1" />}
            {showOverlay ? "Overlay On" : "Overlay Off"}
          </Button>

          {/* Edit mode */}
          <div className="flex items-center gap-1 border-l pl-3">
            <Button
              variant={editMode ? "outline" : "ghost"}
              size="sm"
              className={`h-8 text-xs ${editMode ? "bg-amber-50 border-amber-300 text-amber-700" : ""}`}
              onClick={() => setEditMode(editMode ? null : (allCodes[0] || null))}>
              {editMode
                ? <><MousePointer2 className="h-3 w-3 mr-1" />Pan Mode</>
                : <><Plus className="h-3 w-3 mr-1" />Edit Markers</>}
            </Button>

            {hasMarkerChanges && (
              <Button size="sm" className="h-8 text-xs bg-green-600 hover:bg-green-700 text-white"
                onClick={handleSaveMarkers} disabled={isSaving}>
                {isSaving
                  ? <Loader2 className="h-3 w-3 mr-1 animate-spin" />
                  : <Save className="h-3 w-3 mr-1" />}
                Save
                {removedIds.size > 0 && ` (−${removedIds.size})`}
                {addedMarkers.length > 0 && ` (+${addedMarkers.length})`}
              </Button>
            )}
          </div>
        </div>

        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Symbol chips ─────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-2 flex flex-wrap gap-1.5 flex-shrink-0">
        {editMode && (
          <span className="text-xs text-amber-700 font-medium mr-1 flex items-center self-center">
            Place:
          </span>
        )}

        {allCodes.map(code => {
          const count      = liveCounts[code] ?? 0;
          const style      = symbolStyles[code];
          const isExcluded = excludedCodes.has(code);
          const isSelected = editMode === code;

          return (
            <button key={code}
              className={[
                "flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-medium border transition-all",
                isSelected   ? "bg-amber-100 border-amber-400 ring-2 ring-amber-300" :
                isExcluded   ? "bg-gray-100 text-gray-400 border-gray-200 line-through" :
                               "bg-white hover:bg-gray-50",
              ].join(" ")}
              style={isExcluded && !isSelected ? {} : {
                borderColor: isSelected ? undefined : (style?.colour ? `${style.colour}60` : "#ddd"),
                color: isSelected ? undefined : (style?.colour || "#666"),
              }}
              title={editMode
                ? `${isSelected ? "Deselect" : "Select"} ${code} to place on drawing`
                : `${isExcluded ? "Include" : "Exclude"} ${code} (${symbolDescriptions[code] || "unknown"}) from quote`}
              onClick={() => {
                if (editMode) {
                  setEditMode(isSelected ? null : code);
                } else {
                  handleChipToggle(code);
                }
              }}>
              <span className="w-2 h-2 rounded-full flex-shrink-0"
                style={{ backgroundColor: isExcluded && !isSelected ? "#ccc" : (style?.colour || "#888") }} />
              {code}: {count}
              {isExcluded && !editMode && <EyeOff className="h-2.5 w-2.5 ml-0.5" />}
            </button>
          );
        })}

        <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-gray-100 text-gray-700">
          Showing: {visibleTotal}/{totalItems}
        </div>

        {excludedCodes.size > 0 && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs bg-gray-100 text-gray-500">
            {excludedCodes.size} code{excludedCodes.size > 1 ? "s" : ""} excluded from quote
          </div>
        )}

        {hasMarkerChanges && (
          <div className="flex items-center gap-1 px-2 py-0.5 rounded-full text-xs font-bold bg-amber-100 text-amber-700">
            Unsaved marker changes
          </div>
        )}
      </div>

      {/* ── Edit mode instructions ────────────────────────────────────────── */}
      {editMode && (
        <div className="bg-amber-50 border-b border-amber-200 px-4 py-1.5 text-xs text-amber-800 flex items-center gap-2 flex-shrink-0">
          <Plus className="h-3 w-3 flex-shrink-0" />
          <span>
            <strong>Adding {editMode}</strong> ({symbolDescriptions[editMode] || editMode}) —
            click the drawing to place a new marker. Click an existing marker to remove it.
            Press <kbd className="px-1 bg-amber-100 rounded border border-amber-300">Esc</kbd> to return to pan mode.
          </span>
        </div>
      )}

      {/* ── Drawing canvas ────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className={`flex-1 overflow-hidden bg-gray-800 relative select-none ${
          editMode ? "cursor-crosshair" : "cursor-grab active:cursor-grabbing"
        }`}
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
            {/* Loading */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10 min-h-[400px] min-w-[600px]">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
                  <p className="text-gray-400 text-sm mt-2">Rendering drawing…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {renderError && (
              <div className="flex items-center justify-center bg-gray-700 min-h-[400px] min-w-[600px]">
                <div className="text-center p-8">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Failed to render PDF: {renderError}</p>
                  <p className="text-gray-500 text-xs mt-2">
                    The symbol counts and positions are still available in the takeoff table.
                  </p>
                </div>
              </div>
            )}

            {/* PDF canvas */}
            {!renderError && <canvas ref={canvasRef} className="block" style={{ imageRendering: "auto" }} />}

            {/* Interactive SVG overlay */}
            {pdfDimensions.width > 0 && !renderError && (
              <svg
                className="absolute top-0 left-0"
                width={pdfDimensions.width}
                height={pdfDimensions.height}
                viewBox={`0 0 ${pdfDimensions.width} ${pdfDimensions.height}`}
                style={{ pointerEvents: "all" }}
              >
                {/* Existing markers */}
                {markers.map(m => renderMarker(m, removedIds.has(m.id), false))}

                {/* Added markers (green dashed ring) */}
                {addedMarkers.map(m => renderMarker(m, false, true))}

                {/* Removed markers — faded red X so user can undo */}
                {Array.from(removedIds).map(id => {
                  const m = markers.find(mk => mk.id === id);
                  if (!m || excludedCodes.has(m.symbolCode) || !showOverlay) return null;
                  const cx = (m.x / pdfPageWidth)  * pdfDimensions.width;
                  const cy = (m.y / pdfPageHeight) * pdfDimensions.height;
                  return (
                    <g key={`removed-${id}`}
                      style={{ cursor: "pointer", opacity: 0.5 }}
                      onClick={e => { e.stopPropagation(); handleMarkerClick(id, false); }}>
                      <line x1={cx - 5} y1={cy - 5} x2={cx + 5} y2={cy + 5} stroke="red" strokeWidth={2} />
                      <line x1={cx + 5} y1={cy - 5} x2={cx - 5} y2={cy + 5} stroke="red" strokeWidth={2} />
                      <title>Removed {m.symbolCode} — click to restore</title>
                    </g>
                  );
                })}
              </svg>
            )}
          </div>
        </div>
      </div>

      {/* ── Help footer ──────────────────────────────────────────────────── */}
      <div className="bg-gray-900 px-4 py-1.5 text-[11px] text-gray-500 flex items-center gap-4 flex-shrink-0">
        <span>Scroll to zoom · Drag to pan</span>
        <span>·</span>
        <span>Click a chip to <strong className="text-gray-400">exclude/include</strong> from quote (persists immediately)</span>
        <span>·</span>
        <span>In Edit mode: click drawing to <strong className="text-gray-400">add</strong> · click marker to <strong className="text-gray-400">remove</strong> · Save to update counts</span>
      </div>
    </div>
  );
}
