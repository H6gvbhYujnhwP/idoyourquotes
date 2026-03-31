/**
 * ElectricalReferenceViewer.tsx
 *
 * Multi-page PDF viewer for reference-only documents (equipment schedules,
 * DB schedules, riser diagrams, specifications).
 *
 * Intentionally distinct from ElectricalDrawingViewer — no marker editing,
 * no symbol chips, no takeoff machinery. Just a clean paginated PDF viewer
 * with pan/zoom and a document-type badge.
 *
 * Electrical sector only. Does not touch QuoteWorkspace, DrawingViewer,
 * any other sector, or any server-side code.
 *
 * Props:
 *   inputId    — for getPdfData query (fetches base64 PDF bytes)
 *   filename   — display name in toolbar
 *   docType    — classification result (for badge)
 *   onClose    — dismiss callback
 */

import { useState, useRef, useEffect, useCallback } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ZoomIn, ZoomOut, Maximize, ChevronLeft, ChevronRight,
  Loader2, X, AlertTriangle, FileText,
} from "lucide-react";

// ─── Doc-type badge helper (shared with ElectricalWorkspace) ─────────────────

export function getDocTypeBadgeProps(docType: string): { label: string; className: string } {
  switch (docType) {
    case 'equipment_schedule':
      return { label: 'Equipment Schedule', className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'db_schedule':
      return { label: 'DB Schedule',         className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'legend':
      return { label: 'Legend',              className: 'bg-teal-100 text-teal-700 border-teal-200' };
    case 'riser_schematic':
      return { label: 'Riser / Schematic',   className: 'bg-blue-100 text-blue-700 border-blue-200' };
    case 'specification':
      return { label: 'Specification',       className: 'bg-purple-100 text-purple-700 border-purple-200' };
    case 'floor_plan':
      return { label: 'Floor Plan',          className: 'bg-green-100 text-green-700 border-green-200' };
    default:
      return { label: 'Unclassified',        className: 'bg-orange-100 text-orange-700 border-orange-200' };
  }
}

// ─── Props ────────────────────────────────────────────────────────────────────

export interface ElectricalReferenceViewerProps {
  inputId: number;
  filename: string;
  docType: string;
  onClose: () => void;
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function ElectricalReferenceViewer({
  inputId,
  filename,
  docType,
  onClose,
}: ElectricalReferenceViewerProps) {

  // ── State ──────────────────────────────────────────────────────────────────
  const canvasRef    = useRef<HTMLCanvasElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const [zoom,         setZoom]         = useState(1);
  const [position,     setPosition]     = useState({ x: 0, y: 0 });
  const [isDragging,   setIsDragging]   = useState(false);
  const [dragStart,    setDragStart]    = useState({ x: 0, y: 0 });
  const [isLoading,    setIsLoading]    = useState(true);
  const [renderError,  setRenderError]  = useState<string | null>(null);
  const [currentPage,  setCurrentPage]  = useState(1);
  const [totalPages,   setTotalPages]   = useState(1);
  const [pdfDims,      setPdfDims]      = useState({ width: 0, height: 0 });

  // Keep a stable ref to the loaded PDF document so page-turns don't reload
  const pdfDocRef = useRef<any>(null);

  // ── Data ───────────────────────────────────────────────────────────────────
  const { data: pdfData } = trpc.electricalTakeoff.getPdfData.useQuery(
    { inputId },
    { enabled: !!inputId }
  );

  // ── Zoom helpers ───────────────────────────────────────────────────────────
  const zoomToPoint = useCallback((newZoom: number, clientX: number, clientY: number) => {
    const clamped = Math.max(0.25, Math.min(5, newZoom));
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) { setZoom(clamped); return; }
    const mouseX   = clientX - rect.left;
    const mouseY   = clientY - rect.top;
    const contentX = (mouseX - position.x) / zoom;
    const contentY = (mouseY - position.y) / zoom;
    setZoom(clamped);
    setPosition({ x: mouseX - contentX * clamped, y: mouseY - contentY * clamped });
  }, [zoom, position]);

  const handleZoomIn  = () => { const r = containerRef.current?.getBoundingClientRect(); r ? zoomToPoint(zoom + 0.25, r.left + r.width / 2, r.top + r.height / 2) : setZoom(z => Math.min(z + 0.25, 5)); };
  const handleZoomOut = () => { const r = containerRef.current?.getBoundingClientRect(); r ? zoomToPoint(zoom - 0.25, r.left + r.width / 2, r.top + r.height / 2) : setZoom(z => Math.max(z - 0.25, 0.25)); };
  const handleFit     = () => { setZoom(1); setPosition({ x: 0, y: 0 }); };
  const handleWheel   = (e: React.WheelEvent) => { e.preventDefault(); zoomToPoint(zoom + (e.deltaY > 0 ? -0.15 : 0.15), e.clientX, e.clientY); };

  // ── Pan ────────────────────────────────────────────────────────────────────
  const handleMouseDown = (e: React.MouseEvent) => {
    if (e.button !== 0) return;
    setIsDragging(true);
    setDragStart({ x: e.clientX - position.x, y: e.clientY - position.y });
  };
  const handleMouseMove = (e: React.MouseEvent) => { if (!isDragging) return; setPosition({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y }); };
  const handleMouseUp   = () => setIsDragging(false);

  // ── Page navigation ────────────────────────────────────────────────────────
  const goToPage = useCallback((page: number) => {
    setCurrentPage(page);
    setPosition({ x: 0, y: 0 }); // reset pan on page change
  }, []);

  const prevPage = () => { if (currentPage > 1)           goToPage(currentPage - 1); };
  const nextPage = () => { if (currentPage < totalPages)  goToPage(currentPage + 1); };

  // ── Keyboard: Escape, arrow keys ───────────────────────────────────────────
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape')      onClose();
      if (e.key === 'ArrowRight')  nextPage();
      if (e.key === 'ArrowLeft')   prevPage();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [currentPage, totalPages, onClose]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Load PDF bytes + initialise pdfDocRef ──────────────────────────────────
  useEffect(() => {
    if (!pdfData?.base64) return;
    let cancelled = false;

    const loadPdf = async () => {
      try {
        if (!(window as any).pdfjsLib) {
          await new Promise<void>((resolve, reject) => {
            const s = document.createElement('script');
            s.src = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js';
            s.onload = () => {
              const lib = (window as any).pdfjsLib;
              if (lib) {
                lib.GlobalWorkerOptions.workerSrc =
                  'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';
                resolve();
              } else reject(new Error('pdfjsLib not found'));
            };
            s.onerror = () => reject(new Error('Failed to load PDF.js'));
            document.head.appendChild(s);
          });
        }
        const lib   = (window as any).pdfjsLib;
        const bytes = Uint8Array.from(atob(pdfData.base64), c => c.charCodeAt(0));
        if (cancelled) return;
        const doc = await lib.getDocument({ data: bytes }).promise;
        if (cancelled) return;
        pdfDocRef.current = doc;
        setTotalPages(doc.numPages);
        setCurrentPage(1);
      } catch (err: any) {
        if (!cancelled) setRenderError(err.message || 'Failed to load PDF');
      }
    };

    loadPdf();
    return () => { cancelled = true; };
  }, [pdfData]);

  // ── Render current page whenever pdfDocRef or currentPage changes ──────────
  useEffect(() => {
    if (!pdfDocRef.current || !canvasRef.current) return;
    let cancelled = false;

    const renderPage = async () => {
      try {
        setIsLoading(true);
        setRenderError(null);
        const page     = await pdfDocRef.current.getPage(currentPage);
        if (cancelled) return;
        const scale    = 2;
        const vp       = page.getViewport({ scale });
        const canvas   = canvasRef.current!;
        canvas.width   = vp.width;
        canvas.height  = vp.height;
        canvas.style.width  = `${vp.width  / scale}px`;
        canvas.style.height = `${vp.height / scale}px`;
        setPdfDims({ width: vp.width / scale, height: vp.height / scale });
        const ctx = canvas.getContext('2d')!;
        await page.render({ canvasContext: ctx, viewport: vp }).promise;
        if (!cancelled) setIsLoading(false);
      } catch (err: any) {
        if (!cancelled) {
          setRenderError(err.message || 'Failed to render page');
          setIsLoading(false);
        }
      }
    };

    renderPage();
    return () => { cancelled = true; };
  }, [currentPage, pdfDocRef.current]); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Badge ──────────────────────────────────────────────────────────────────
  const badge = getDocTypeBadgeProps(docType);

  // ── Render ─────────────────────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 bg-black/80 flex flex-col">

      {/* ── Toolbar ─────────────────────────────────────────────────────── */}
      <div className="bg-white border-b px-4 py-2 flex items-center justify-between flex-shrink-0">
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-2">
            <FileText className="h-4 w-4 text-muted-foreground" />
            <h3 className="text-sm font-semibold">{filename}</h3>
            <Badge className={`text-[10px] px-1.5 py-0 h-4 font-normal ${badge.className}`}>
              {badge.label}
            </Badge>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 ml-2 border-l pl-3">
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomOut}><ZoomOut className="h-4 w-4" /></Button>
            <span className="text-xs font-mono w-12 text-center">{Math.round(zoom * 100)}%</span>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleZoomIn}><ZoomIn className="h-4 w-4" /></Button>
            <Button variant="ghost" size="icon" className="h-8 w-8" onClick={handleFit} title="Reset view"><Maximize className="h-4 w-4" /></Button>
          </div>

          {/* Page navigation */}
          {totalPages > 1 && (
            <div className="flex items-center gap-1 border-l pl-3">
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={prevPage} disabled={currentPage <= 1}>
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs font-mono whitespace-nowrap">
                Page {currentPage} / {totalPages}
              </span>
              <Button variant="ghost" size="icon" className="h-8 w-8"
                onClick={nextPage} disabled={currentPage >= totalPages}>
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          )}
        </div>

        <Button variant="ghost" size="icon" onClick={onClose}>
          <X className="h-5 w-5" />
        </Button>
      </div>

      {/* ── Drawing canvas ────────────────────────────────────────────────── */}
      <div
        ref={containerRef}
        className="flex-1 overflow-hidden bg-gray-800 relative select-none cursor-grab active:cursor-grabbing"
        onMouseDown={handleMouseDown}
        onMouseMove={handleMouseMove}
        onMouseUp={handleMouseUp}
        onMouseLeave={handleMouseUp}
        onWheel={handleWheel}
      >
        <div
          className="absolute"
          style={{
            transform: `translate(${position.x}px, ${position.y}px) scale(${zoom})`,
            transformOrigin: '0 0',
            transition: isDragging ? 'none' : 'transform 0.1s ease-out',
          }}
        >
          <div
            className="relative"
            style={pdfDims.width ? { width: pdfDims.width, height: pdfDims.height } : undefined}
          >
            {/* Loading */}
            {isLoading && (
              <div className="absolute inset-0 flex items-center justify-center bg-gray-700 z-10 min-h-[400px] min-w-[600px]">
                <div className="text-center">
                  <Loader2 className="h-8 w-8 animate-spin text-gray-400 mx-auto" />
                  <p className="text-gray-400 text-sm mt-2">Rendering page {currentPage}…</p>
                </div>
              </div>
            )}

            {/* Error */}
            {renderError && (
              <div className="flex items-center justify-center bg-gray-700 min-h-[400px] min-w-[600px]">
                <div className="text-center p-8">
                  <AlertTriangle className="h-12 w-12 text-amber-400 mx-auto mb-3" />
                  <p className="text-gray-300 text-sm">Failed to render: {renderError}</p>
                </div>
              </div>
            )}

            {/* PDF canvas */}
            {!renderError && <canvas ref={canvasRef} className="block" style={{ imageRendering: 'auto' }} />}
          </div>
        </div>
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div className="bg-gray-900 px-4 py-1.5 text-[11px] text-gray-500 flex items-center gap-4 flex-shrink-0">
        <span>Scroll to zoom · Drag to pan</span>
        {totalPages > 1 && (
          <>
            <span>·</span>
            <span>← → arrow keys to navigate pages</span>
          </>
        )}
        <span>·</span>
        <span>Reference only — no takeoff runs on this document</span>
      </div>
    </div>
  );
}
