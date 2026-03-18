/**
 * ContainmentMeasurementReview — Phase 2 interactive segment reviewer.
 *
 * Renders all raw PDF vector segments on a pannable/zoomable canvas.
 * Segments are coloured by their current assignment (not their extracted layer colour).
 * Users can click segments or box-select multiple segments to reassign or exclude them.
 * Lengths recalculate in real-time as assignments change. Save calls
 * containmentTakeoff.updateSegmentAssignments on the server.
 *
 * DOES NOT TOUCH: symbol takeoff, QDS, billing, other sectors.
 * Only electrical sector containment measurement is affected.
 */
import { useState, useRef, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  ZoomIn, ZoomOut, Maximize, Save, RotateCcw, X,
  Eye, EyeOff, MousePointer, Square, Info,
} from "lucide-react";

// ---- Brand colours (matches brandTheme.ts) ----
const brand = {
  navy: "#1a2b4a",
  teal: "#0d9488",
  bg: "#f5f7fa",
  border: "#e2e8f0",
  muted: "#64748b",
};

// UI colours for each tray group — independent of drawing layer colour.
// These are the colours segments turn AFTER assignment in the reviewer.
const GROUP_UI_COLOURS: Record<string, string> = {
  "50-LV":   "#22c55e",
  "75-LV":   "#16a34a",
  "100-LV":  "#3b82f6",
  "150-LV":  "#8b5cf6",
  "225-LV":  "#f59e0b",
  "300-LV":  "#ef4444",
  "50-FA":   "#dc2626",
  "75-FA":   "#b91c1c",
  "100-FA":  "#f87171",
  "150-FA":  "#fca5a5",
  "50-ELV":  "#fbbf24",
  "100-ELV": "#f59e0b",
  "150-ELV": "#d97706",
  "225-ELV": "#92400e",
  "50-SUB":  "#06b6d4",
  "100-SUB": "#0891b2",
};

function getGroupColour(groupKey: string): string {
  if (GROUP_UI_COLOURS[groupKey]) return GROUP_UI_COLOURS[groupKey];
  // Fallback: hash the key to a colour
  let hash = 0;
  for (let i = 0; i < groupKey.length; i++) hash = groupKey.charCodeAt(i) + ((hash << 5) - hash);
  return `hsl(${Math.abs(hash) % 360}, 65%, 50%)`;
}

// ---- Types ----

interface RawSegment {
  x: number; y: number; colour: string;
  x1: number; y1: number; x2: number; y2: number;
  lengthPdfUnits: number;
}

interface TrayRun {
  id: string;
  sizeMillimetres: number;
  trayType: string;
  lengthMetres: number;
  wholesalerLengths: number;
}

interface Props {
  takeoffId: number;
  rawSegments: RawSegment[];
  initialAssignments: Record<number, string>;
  trayRuns: TrayRun[];
  pageWidth: number;
  pageHeight: number;
  detectedScale: string | null;
  onClose: () => void;
  onSaved: () => void;
}

// ---- Helpers ----

function recalcLengths(
  segments: RawSegment[],
  assignments: Record<number, string>,
  metresPerUnit: number,
): Map<string, number> {
  const acc = new Map<string, number>();
  for (const [iStr, key] of Object.entries(assignments)) {
    if (key === "excluded") continue;
    const seg = segments[parseInt(iStr, 10)];
    if (!seg) continue;
    acc.set(key, (acc.get(key) || 0) + seg.lengthPdfUnits);
  }
  const result = new Map<string, number>();
  for (const [k, pdfUnits] of acc) {
    result.set(k, Math.round(pdfUnits * metresPerUnit * 10) / 10);
  }
  return result;
}

function getMetresPerUnit(scale: string | null, pageWidth: number): number {
  const scaleRatio = scale ? parseInt(scale.replace("1:", ""), 10) || 100 : 100;
  // A0 landscape = 1189mm wide
  return (1189 / pageWidth) * scaleRatio / 1000;
}

export default function ContainmentMeasurementReview({
  takeoffId,
  rawSegments,
  initialAssignments,
  trayRuns,
  pageWidth,
  pageHeight,
  detectedScale,
  onClose,
  onSaved,
}: Props) {
  // ---- State ----
  const [assignments, setAssignments] = useState<Record<number, string>>({ ...initialAssignments });
  const [selectedIndices, setSelectedIndices] = useState<Set<number>>(new Set());
  const [zoom, setZoom] = useState(1);
  const [pan, setPan] = useState({ x: 20, y: 20 });
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const [isBoxSelecting, setIsBoxSelecting] = useState(false);
  const [boxStart, setBoxStart] = useState({ x: 0, y: 0 });
  const [boxEnd, setBoxEnd] = useState({ x: 0, y: 0 });
  const [mode, setMode] = useState<"pan" | "select">("pan");
  const [highlightedGroup, setHighlightedGroup] = useState<string | null>(null);
  const [showExcluded, setShowExcluded] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);
  const [isDirty, setIsDirty] = useState(false);

  const svgRef = useRef<SVGSVGElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const metresPerUnit = useMemo(() => getMetresPerUnit(detectedScale, pageWidth), [detectedScale, pageWidth]);
  const wholesalerLen = (trayRuns[0] ? 3 : 3); // default 3m sticks

  // Live-recalculated lengths as assignments change
  const liveLengths = useMemo(() => recalcLengths(rawSegments, assignments, metresPerUnit), [rawSegments, assignments, metresPerUnit]);

  // All unique group keys from current assignments (exclude "excluded")
  const allGroupKeys = useMemo(() => {
    const keys = new Set<string>();
    for (const v of Object.values(assignments)) {
      if (v !== "excluded") keys.add(v);
    }
    return Array.from(keys).sort();
  }, [assignments]);

  const updateMut = trpc.containmentTakeoff.updateSegmentAssignments.useMutation({
    onSuccess: () => { setIsSaving(false); setIsDirty(false); onSaved(); },
    onError: (e) => { setIsSaving(false); setSaveError(e.message); },
  });

  const resetMut = trpc.containmentTakeoff.resetSegmentAssignments.useMutation({
    onSuccess: (data) => {
      const newAssign = (data.takeoff?.segmentAssignmentsJson as Record<number, string>) || {};
      setAssignments(newAssign);
      setIsDirty(false);
      setSelectedIndices(new Set());
    },
  });

  // ---- Segment colour in reviewer (by assignment) ----
  function segColour(idx: number): string {
    const key = assignments[idx];
    if (!key || key === "excluded") return "#94a3b8"; // grey = unassigned/excluded
    if (highlightedGroup && key !== highlightedGroup) return "#e2e8f0"; // dimmed
    return getGroupColour(key);
  }

  function segOpacity(idx: number): number {
    const key = assignments[idx];
    if (key === "excluded" && !showExcluded) return 0;
    if (key === "excluded") return 0.2;
    if (highlightedGroup && key !== highlightedGroup) return 0.15;
    return selectedIndices.has(idx) ? 1 : 0.7;
  }

  function segStrokeWidth(idx: number): number {
    if (selectedIndices.has(idx)) return Math.max(3, 2 / zoom);
    return Math.max(1.5, 1.5 / zoom);
  }

  // ---- Pan / zoom ----
  const handleWheel = useCallback((e: React.WheelEvent) => {
    e.preventDefault();
    setZoom(z => Math.max(0.1, Math.min(8, z + (e.deltaY > 0 ? -0.1 : 0.1) * z * 0.2)));
  }, []);

  const handleMouseDown = useCallback((e: React.MouseEvent) => {
    if (e.button !== 0) return;
    if (mode === "pan") {
      setIsDragging(true);
      setDragStart({ x: e.clientX - pan.x, y: e.clientY - pan.y });
    } else {
      // box select
      const rect = containerRef.current!.getBoundingClientRect();
      const sx = (e.clientX - rect.left - pan.x) / zoom;
      const sy = (e.clientY - rect.top - pan.y) / zoom;
      setBoxStart({ x: sx, y: sy });
      setBoxEnd({ x: sx, y: sy });
      setIsBoxSelecting(true);
    }
  }, [mode, pan, zoom]);

  const handleMouseMove = useCallback((e: React.MouseEvent) => {
    if (isDragging) {
      setPan({ x: e.clientX - dragStart.x, y: e.clientY - dragStart.y });
    }
    if (isBoxSelecting) {
      const rect = containerRef.current!.getBoundingClientRect();
      setBoxEnd({
        x: (e.clientX - rect.left - pan.x) / zoom,
        y: (e.clientY - rect.top - pan.y) / zoom,
      });
    }
  }, [isDragging, dragStart, isBoxSelecting, pan, zoom]);

  const handleMouseUp = useCallback((e: React.MouseEvent) => {
    if (isDragging) { setIsDragging(false); return; }
    if (isBoxSelecting) {
      setIsBoxSelecting(false);
      // Select all segments whose midpoint falls inside the box
      const minX = Math.min(boxStart.x, boxEnd.x);
      const maxX = Math.max(boxStart.x, boxEnd.x);
      const minY = Math.min(boxStart.y, boxEnd.y);
      const maxY = Math.max(boxStart.y, boxEnd.y);
      const boxW = maxX - minX;
      const boxH = maxY - minY;
      if (boxW < 3 && boxH < 3) return; // too small — treat as click miss
      const newly = new Set<number>();
      rawSegments.forEach((seg, idx) => {
        if (seg.x >= minX && seg.x <= maxX && seg.y >= minY && seg.y <= maxY) {
          newly.add(idx);
        }
      });
      setSelectedIndices(prev => {
        const merged = new Set(prev);
        newly.forEach(i => merged.add(i));
        return merged;
      });
    }
  }, [isDragging, isBoxSelecting, boxStart, boxEnd, rawSegments]);

  const handleSegmentClick = useCallback((idx: number, e: React.MouseEvent) => {
    e.stopPropagation();
    if (mode !== "select") return;
    setSelectedIndices(prev => {
      const n = new Set(prev);
      if (n.has(idx)) n.delete(idx); else n.add(idx);
      return n;
    });
  }, [mode]);

  // ---- Assignment actions ----
  function assignSelected(groupKey: string) {
    if (selectedIndices.size === 0) return;
    setAssignments(prev => {
      const n = { ...prev };
      for (const idx of selectedIndices) n[idx] = groupKey;
      return n;
    });
    setIsDirty(true);
    setSelectedIndices(new Set());
  }

  function excludeSelected() {
    if (selectedIndices.size === 0) return;
    setAssignments(prev => {
      const n = { ...prev };
      for (const idx of selectedIndices) n[idx] = "excluded";
      return n;
    });
    setIsDirty(true);
    setSelectedIndices(new Set());
  }

  function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    const strAssign: Record<string, string> = {};
    for (const [k, v] of Object.entries(assignments)) strAssign[String(k)] = v;
    updateMut.mutate({ takeoffId, assignments: strAssign });
  }

  function handleReset() {
    if (!confirm("Reset all assignments back to the AI auto-pass? This cannot be undone.")) return;
    resetMut.mutate({ takeoffId });
  }

  // ---- Box select overlay in SVG space ----
  const boxRect = useMemo(() => ({
    x: Math.min(boxStart.x, boxEnd.x),
    y: Math.min(boxStart.y, boxEnd.y),
    w: Math.abs(boxEnd.x - boxStart.x),
    h: Math.abs(boxEnd.y - boxStart.y),
  }), [boxStart, boxEnd]);

  // ---- Summary: group key → live metres → lengths ----
  const groupSummary = useMemo(() => {
    return allGroupKeys.map(key => {
      const metres = liveLengths.get(key) || 0;
      const sticks = Math.ceil(metres / wholesalerLen);
      const segCount = Object.values(assignments).filter(v => v === key).length;
      return { key, metres, sticks, segCount };
    });
  }, [allGroupKeys, liveLengths, assignments, wholesalerLen]);

  const totalSaved = trayRuns.reduce((s, r) => s + r.wholesalerLengths, 0);
  const totalLive = groupSummary.reduce((s, g) => s + g.sticks, 0);

  return (
    <div className="fixed inset-0 z-50 flex flex-col" style={{ backgroundColor: "#0f172a" }}>

      {/* ── Header ── */}
      <div className="flex items-center justify-between px-4 py-2.5 border-b" style={{ borderColor: "#1e293b", backgroundColor: "#0f172a" }}>
        <div className="flex items-center gap-3">
          <div className="w-2 h-2 rounded-full bg-teal-400 animate-pulse" />
          <span className="text-sm font-semibold text-white">Measurement Review</span>
          <span className="text-xs text-slate-400">
            {rawSegments.length} segments · scale {detectedScale || "1:100"}
          </span>
          {isDirty && (
            <Badge className="text-[10px] bg-amber-500/20 text-amber-300 border-amber-500/30">Unsaved changes</Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {/* Mode toggle */}
          <div className="flex rounded-md overflow-hidden border border-slate-700">
            <button
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${mode === "pan" ? "bg-slate-700 text-white" : "text-slate-400 hover:text-white"}`}
              onClick={() => setMode("pan")}
            >
              <MousePointer className="h-3 w-3" /> Pan
            </button>
            <button
              className={`px-3 py-1.5 text-xs flex items-center gap-1.5 transition-colors ${mode === "select" ? "bg-teal-600 text-white" : "text-slate-400 hover:text-white"}`}
              onClick={() => setMode("select")}
            >
              <Square className="h-3 w-3" /> Select
            </button>
          </div>

          {/* Zoom controls */}
          <div className="flex items-center gap-1 px-2 rounded border border-slate-700">
            <button className="text-slate-400 hover:text-white p-1" onClick={() => setZoom(z => Math.max(0.1, z - 0.15))}>
              <ZoomOut className="h-3.5 w-3.5" />
            </button>
            <span className="text-xs text-slate-300 w-10 text-center font-mono">{Math.round(zoom * 100)}%</span>
            <button className="text-slate-400 hover:text-white p-1" onClick={() => setZoom(z => Math.min(8, z + 0.15))}>
              <ZoomIn className="h-3.5 w-3.5" />
            </button>
            <button className="text-slate-400 hover:text-white p-1" onClick={() => { setZoom(1); setPan({ x: 20, y: 20 }); }}>
              <Maximize className="h-3.5 w-3.5" />
            </button>
          </div>

          <button
            className="text-slate-400 hover:text-white p-1.5 rounded border border-slate-700"
            onClick={() => setShowExcluded(s => !s)}
            title={showExcluded ? "Hide excluded" : "Show excluded"}
          >
            {showExcluded ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
          </button>

          {/* Actions */}
          <Button
            size="sm"
            variant="outline"
            className="h-7 text-xs border-slate-700 text-slate-300 hover:text-white hover:bg-slate-700"
            onClick={handleReset}
            disabled={resetMut.isPending}
          >
            <RotateCcw className="h-3 w-3 mr-1" />
            {resetMut.isPending ? "Resetting…" : "Reset to AI"}
          </Button>

          <Button
            size="sm"
            className="h-7 text-xs"
            style={{ backgroundColor: isDirty ? brand.teal : "#334155", color: "white" }}
            onClick={handleSave}
            disabled={isSaving || !isDirty}
          >
            <Save className="h-3 w-3 mr-1" />
            {isSaving ? "Saving…" : "Save"}
          </Button>

          <button className="text-slate-400 hover:text-white p-1.5 rounded border border-slate-700 ml-1" onClick={onClose}>
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {saveError && (
        <div className="px-4 py-1.5 bg-red-900/40 text-red-300 text-xs border-b border-red-800">{saveError}</div>
      )}

      {/* ── Main layout: canvas + sidebar ── */}
      <div className="flex flex-1 overflow-hidden">

        {/* Canvas */}
        <div
          ref={containerRef}
          className="flex-1 overflow-hidden relative"
          style={{ cursor: mode === "pan" ? (isDragging ? "grabbing" : "grab") : "crosshair", backgroundColor: "#1e293b" }}
          onMouseDown={handleMouseDown}
          onMouseMove={handleMouseMove}
          onMouseUp={handleMouseUp}
          onMouseLeave={() => { setIsDragging(false); setIsBoxSelecting(false); }}
          onWheel={handleWheel}
        >
          <svg
            ref={svgRef}
            width="100%"
            height="100%"
            style={{ position: "absolute", inset: 0 }}
          >
            {/* Drawing boundary */}
            <rect
              x={pan.x}
              y={pan.y}
              width={pageWidth * zoom}
              height={pageHeight * zoom}
              fill="#ffffff05"
              stroke="#334155"
              strokeWidth={1}
            />

            {/* Segments */}
            <g>
              {rawSegments.map((seg, idx) => {
                const op = segOpacity(idx);
                if (op === 0) return null;
                return (
                  <line
                    key={idx}
                    x1={pan.x + seg.x1 * zoom}
                    y1={pan.y + seg.y1 * zoom}
                    x2={pan.x + seg.x2 * zoom}
                    y2={pan.y + seg.y2 * zoom}
                    stroke={segColour(idx)}
                    strokeWidth={segStrokeWidth(idx)}
                    strokeOpacity={op}
                    strokeLinecap="round"
                    style={{ cursor: mode === "select" ? "pointer" : undefined }}
                    onClick={(e) => handleSegmentClick(idx, e)}
                  />
                );
              })}
            </g>

            {/* Box select rectangle */}
            {isBoxSelecting && boxRect.w > 2 && boxRect.h > 2 && (
              <rect
                x={pan.x + boxRect.x * zoom}
                y={pan.y + boxRect.y * zoom}
                width={boxRect.w * zoom}
                height={boxRect.h * zoom}
                fill="rgba(20,184,166,0.08)"
                stroke="#14b8a6"
                strokeWidth={1}
                strokeDasharray="4 3"
              />
            )}
          </svg>

          {/* Selection action bar — floats above canvas when segments selected */}
          {selectedIndices.size > 0 && (
            <div className="absolute bottom-4 left-1/2 -translate-x-1/2 flex items-center gap-2 px-3 py-2 rounded-xl border shadow-2xl"
              style={{ backgroundColor: "#0f172a", borderColor: "#1e293b" }}>
              <span className="text-xs text-slate-400 mr-1">{selectedIndices.size} selected — assign to:</span>
              <div className="flex flex-wrap gap-1.5 max-w-xl">
                {allGroupKeys.map(key => (
                  <button
                    key={key}
                    className="px-2 py-0.5 rounded text-[11px] font-medium text-white transition-opacity hover:opacity-90"
                    style={{ backgroundColor: getGroupColour(key) }}
                    onClick={() => assignSelected(key)}
                  >
                    {key}
                  </button>
                ))}
              </div>
              <button
                className="px-2 py-0.5 rounded text-[11px] font-medium bg-slate-700 text-slate-300 hover:bg-slate-600 ml-1"
                onClick={excludeSelected}
              >
                Exclude
              </button>
              <button
                className="text-slate-500 hover:text-slate-300 ml-1"
                onClick={() => setSelectedIndices(new Set())}
              >
                <X className="h-3.5 w-3.5" />
              </button>
            </div>
          )}

          {/* Mode hint */}
          {mode === "select" && selectedIndices.size === 0 && (
            <div className="absolute top-3 left-1/2 -translate-x-1/2 px-3 py-1.5 rounded-full text-xs text-slate-400 bg-slate-800/80 border border-slate-700 pointer-events-none">
              Click segments or drag to box-select, then assign to a tray group
            </div>
          )}
        </div>

        {/* Sidebar */}
        <div className="w-64 flex flex-col border-l overflow-y-auto"
          style={{ borderColor: "#1e293b", backgroundColor: "#0f172a" }}>

          {/* Group legend */}
          <div className="px-3 pt-3 pb-1">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Tray Groups</p>
            <div className="space-y-1">
              {groupSummary.map(({ key, metres, sticks, segCount }) => {
                const isHighlighted = highlightedGroup === key;
                return (
                  <button
                    key={key}
                    className="w-full flex items-center gap-2 px-2 py-1.5 rounded text-left transition-colors"
                    style={{
                      backgroundColor: isHighlighted ? `${getGroupColour(key)}20` : "transparent",
                      border: `1px solid ${isHighlighted ? getGroupColour(key) + "60" : "transparent"}`,
                    }}
                    onClick={() => setHighlightedGroup(h => h === key ? null : key)}
                  >
                    <span
                      className="w-2.5 h-2.5 rounded-full flex-shrink-0"
                      style={{ backgroundColor: getGroupColour(key) }}
                    />
                    <div className="flex-1 min-w-0">
                      <p className="text-xs font-medium text-white truncate">{key}</p>
                      <p className="text-[10px] text-slate-400">{metres}m · {sticks} lengths · {segCount} segs</p>
                    </div>
                  </button>
                );
              })}
            </div>
          </div>

          <div className="mx-3 my-2 border-t" style={{ borderColor: "#1e293b" }} />

          {/* Totals comparison */}
          <div className="px-3 pb-3">
            <p className="text-[10px] font-semibold uppercase tracking-widest text-slate-500 mb-2">Totals</p>
            <div className="space-y-1.5">
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-400">AI original</span>
                <span className="text-[11px] text-slate-300 font-mono">{totalSaved} lengths</span>
              </div>
              <div className="flex justify-between items-center">
                <span className="text-[11px] text-slate-400">Current (live)</span>
                <span
                  className="text-[11px] font-mono font-semibold"
                  style={{ color: totalLive !== totalSaved ? "#f59e0b" : "#4ade80" }}
                >
                  {totalLive} lengths
                </span>
              </div>
            </div>
          </div>

          <div className="mx-3 my-1 border-t" style={{ borderColor: "#1e293b" }} />

          {/* Excluded count */}
          <div className="px-3 py-2">
            <button
              className="w-full flex items-center justify-between text-[11px] text-slate-400 hover:text-slate-300"
              onClick={() => setShowExcluded(s => !s)}
            >
              <span>Excluded segments</span>
              <span className="font-mono">{Object.values(assignments).filter(v => v === "excluded").length}</span>
            </button>
          </div>

          <div className="mx-3 my-1 border-t" style={{ borderColor: "#1e293b" }} />

          {/* Instructions */}
          <div className="px-3 py-2">
            <div className="flex gap-1.5 text-[10px] text-slate-500">
              <Info className="h-3 w-3 flex-shrink-0 mt-0.5" />
              <p>Switch to <strong className="text-slate-400">Select</strong> mode, click or drag-select segments, then assign them to a tray group using the bar that appears. Click a group above to highlight it.</p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
