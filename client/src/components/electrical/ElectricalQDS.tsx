/**
 * ElectricalQDS.tsx — Phase 4
 *
 * Electrical Quantity/Labour Summary built from confirmed takeoff.
 *
 * Core guarantees:
 *   1. QDS NEVER re-runs takeoff automatically — only on explicit user action.
 *   2. All user edits (qty, supply price, hrs/unit, description) are preserved
 *      across QDS rebuilds via stable row keys: "i{inputId}:{code}".
 *   3. plantHire, firstPoints, prelims, sundries, labourRate, multiplier
 *      are ALL preserved when the user hits "Update QDS from Takeoff".
 *   4. Auto-saves to qdsSummaryJson (debounced 1500ms) on every edit.
 *   5. No items are ever duplicated — merge function uses the key map.
 *
 * Spon's UK labour rates are inlined here (client-side mirror of
 * server/data/electricalLabourRates.ts). Keep both in sync.
 */

import { useState, useRef, useEffect, useCallback, useMemo } from "react";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "sonner";
import {
  ChevronDown, ChevronRight, Plus, Trash2, Loader2,
  Calculator, AlertTriangle, CheckCircle2, Save,
  Zap, Building2, Cable, CircleDot, Truck, Wrench, Hash, Sigma,
} from "lucide-react";
import { cn } from "@/lib/utils";

// ─── Types ────────────────────────────────────────────────────────────────────

/** Minimal shape passed in from ElectricalWorkspace (included rows only) */
export interface IncludedTakeoffRow {
  key: string;        // "${takeoffId}-${code}" — NOT the stable key; we use inputId
  takeoffId: number;
  inputId: number;    // stable across re-analyses — used as merge key base
  drawingName: string;
  code: string;
  description: string;
  count: number;
}

type QDSSection = "lineItems" | "containment" | "cabling";

interface ElectricalQDSRow {
  /** Stable merge key: "i{inputId}:{code}" — survives takeoff re-analysis */
  key: string;
  code: string;
  drawingName: string;
  section: QDSSection;
  description: string;
  qty: number;
  unit: "each" | "m";
  supplyPrice: number;    // £ per unit
  hoursPerUnit: number;   // Spon's default or user override
  noSponsRate: boolean;   // true = Spon's couldn't match
  costPrice: number;    // £ per unit buy-in
  costEdited: boolean;
  // Edit-preservation flags — determines what survives a QDS rebuild
  supplyEdited: boolean;
  hoursEdited: boolean;
  qtyEdited: boolean;
  descEdited: boolean;
}

interface ElectricalFirstPoints {
  circuits: number;
  ratePerCircuit: number;
}

interface ElectricalPlantHireItem {
  id: string;
  description: string;
  dailyRate: number | null;
  numDays: number | null;
  weeklyRate: number | null;
  numWeeks: number | null;
  deliveryCharge: number | null;
  collectionCharge: number | null;
  markup: number; // %
}

interface ElectricalPrelimItem {
  id: string;
  description: string;
  cost: number;
}

export interface ElectricalQDSData {
  _type: "electrical";
  labourRate: number;
  productivityMultiplier: number;
  rows: ElectricalQDSRow[];
  firstPoints: ElectricalFirstPoints;
  plantHire: ElectricalPlantHireItem[];
  preliminaries: ElectricalPrelimItem[];
  sundries: number | null;  // % of supply total
  notes: string | null;
  builtAt: string | null;
}

// ─── Spon's Rate Data (client-side mirror of server/data/electricalLabourRates.ts) ──

interface SponsRule {
  keywords: string[];
  hrs: number;
  unit: "each" | "m";
}

const SPONS_RULES: SponsRule[] = [
  // Cable Tray (hrs/m)
  { keywords: ["600mm", "tray"],            hrs: 0.70, unit: "m" },
  { keywords: ["450mm", "tray"],            hrs: 0.57, unit: "m" },
  { keywords: ["300mm", "tray"],            hrs: 0.46, unit: "m" },
  { keywords: ["225mm", "tray"],            hrs: 0.40, unit: "m" },
  { keywords: ["150mm", "tray"],            hrs: 0.34, unit: "m" },
  { keywords: ["100mm", "tray"],            hrs: 0.30, unit: "m" },
  { keywords: ["75mm",  "tray"],            hrs: 0.28, unit: "m" },
  { keywords: ["50mm",  "tray"],            hrs: 0.25, unit: "m" },
  { keywords: ["cable tray"],               hrs: 0.34, unit: "m" },
  // Trunking (hrs/m)
  { keywords: ["150x150", "trunking"],      hrs: 0.77, unit: "m" },
  { keywords: ["100x100", "trunking"],      hrs: 0.60, unit: "m" },
  { keywords: ["75x75",   "trunking"],      hrs: 0.50, unit: "m" },
  { keywords: ["50x50",   "trunking"],      hrs: 0.41, unit: "m" },
  { keywords: ["trunking"],                 hrs: 0.60, unit: "m" },
  // Conduit (hrs/m)
  { keywords: ["32mm", "conduit"],          hrs: 1.00, unit: "m" },
  { keywords: ["25mm", "conduit"],          hrs: 0.75, unit: "m" },
  { keywords: ["20mm", "conduit"],          hrs: 0.65, unit: "m" },
  { keywords: ["conduit"],                  hrs: 0.65, unit: "m" },
  // Unistrut
  { keywords: ["unistrut", "fix"],          hrs: 1.07, unit: "each" },
  { keywords: ["unistrut"],                 hrs: 0.60, unit: "each" },
  // Luminaires — specific first
  { keywords: ["ip65", "emergency"],        hrs: 0.95, unit: "each" },
  { keywords: ["ip65", "bulkhead"],         hrs: 1.64, unit: "each" },
  { keywords: ["ip65", "batten"],           hrs: 1.64, unit: "each" },
  { keywords: ["emergency", "bulkhead"],    hrs: 0.95, unit: "each" },
  { keywords: ["emergency"],               hrs: 0.95, unit: "each" },
  { keywords: ["high bay"],                 hrs: 1.26, unit: "each" },
  { keywords: ["floodlight"],              hrs: 1.98, unit: "each" },
  { keywords: ["recessed", "600"],          hrs: 1.31, unit: "each" },
  { keywords: ["recessed", "downlight"],    hrs: 0.75, unit: "each" },
  { keywords: ["recessed", "wall wash"],    hrs: 0.75, unit: "each" },
  { keywords: ["downlight"],               hrs: 0.75, unit: "each" },
  { keywords: ["twin", "batten"],           hrs: 1.35, unit: "each" },
  { keywords: ["twin", "fluorescent"],      hrs: 1.35, unit: "each" },
  { keywords: ["batten"],                  hrs: 1.05, unit: "each" },
  { keywords: ["fluorescent"],             hrs: 1.05, unit: "each" },
  { keywords: ["led", "panel"],             hrs: 1.31, unit: "each" },
  // Distribution boards
  { keywords: ["18-way", "tp"],             hrs: 4.32, unit: "each" },
  { keywords: ["12-way", "tp"],             hrs: 3.65, unit: "each" },
  { keywords: ["4-way",  "tp"],             hrs: 2.97, unit: "each" },
  { keywords: ["18-way"],                  hrs: 2.70, unit: "each" },
  { keywords: ["12-way"],                  hrs: 2.30, unit: "each" },
  { keywords: ["8-way"],                   hrs: 1.89, unit: "each" },
  { keywords: ["4-way"],                   hrs: 1.35, unit: "each" },
  { keywords: ["distribution board"],      hrs: 2.30, unit: "each" },
  { keywords: ["consumer unit"],           hrs: 2.30, unit: "each" },
  { keywords: ["rcbo"],                    hrs: 0.20, unit: "each" },
  { keywords: ["mcb"],                     hrs: 0.20, unit: "each" },
  // Sockets & switches
  { keywords: ["fcu"],                     hrs: 0.50, unit: "each" },
  { keywords: ["fused connection"],        hrs: 0.50, unit: "each" },
  { keywords: ["4-gang", "switch"],        hrs: 0.78, unit: "each" },
  { keywords: ["3-gang", "switch"],        hrs: 0.68, unit: "each" },
  { keywords: ["2-gang", "socket"],        hrs: 0.50, unit: "each" },
  { keywords: ["2-gang", "switch"],        hrs: 0.50, unit: "each" },
  { keywords: ["1-gang", "socket"],        hrs: 0.55, unit: "each" },
  { keywords: ["1-gang", "switch"],        hrs: 0.40, unit: "each" },
  { keywords: ["light switch"],            hrs: 0.40, unit: "each" },
  { keywords: ["socket"],                  hrs: 0.55, unit: "each" },
  { keywords: ["telephone", "outlet"],     hrs: 0.40, unit: "each" },
  { keywords: ["data", "outlet"],          hrs: 0.40, unit: "each" },
  { keywords: ["tv", "outlet"],            hrs: 0.40, unit: "each" },
  // T&E Cable (hrs/m)
  { keywords: ["16mm", "t&e"],             hrs: 0.30, unit: "m" },
  { keywords: ["10mm", "t&e"],             hrs: 0.26, unit: "m" },
  { keywords: ["6mm",  "t&e"],             hrs: 0.22, unit: "m" },
  { keywords: ["4mm",  "t&e"],             hrs: 0.21, unit: "m" },
  { keywords: ["2.5mm", "t&e"],            hrs: 0.19, unit: "m" },
  { keywords: ["1.5mm", "t&e"],            hrs: 0.18, unit: "m" },
  { keywords: ["twin", "earth"],           hrs: 0.19, unit: "m" },
  // SWA Cable (hrs/m)
  { keywords: ["16mm", "swa", "4-core"],   hrs: 0.46, unit: "m" },
  { keywords: ["16mm", "swa", "3-core"],   hrs: 0.40, unit: "m" },
  { keywords: ["16mm", "swa"],             hrs: 0.37, unit: "m" },
  { keywords: ["10mm", "swa"],             hrs: 0.37, unit: "m" },
  { keywords: ["swa"],                     hrs: 0.34, unit: "m" },
];

function matchSpons(description: string): { hoursPerUnit: number; unit: "each" | "m" } | null {
  const d = description.toLowerCase();
  for (const rule of SPONS_RULES) {
    if (rule.keywords.every(kw => d.includes(kw))) {
      return { hoursPerUnit: rule.hrs, unit: rule.unit };
    }
  }
  return null;
}

const PRODUCTIVITY_MULTIPLIERS = [
  { label: "New build / open access",  value: 0.85 },
  { label: "Standard conditions",      value: 1.00 },
  { label: "Refurb / occupied",        value: 1.25 },
  { label: "Working at height (>3m)",  value: 1.20 },
];

// ─── Section Classification ───────────────────────────────────────────────────

function classifySection(description: string): QDSSection {
  const d = description.toLowerCase();
  if (/cable tray|trunking|conduit|unistrut/.test(d)) return "containment";
  if (/\bcable\b|swa|t&e|twin.*earth|cpc/.test(d))    return "cabling";
  return "lineItems";
}

// ─── Build / Merge QDS from Takeoff ──────────────────────────────────────────

/**
 * Builds or rebuilds the QDS from the current included takeoff rows.
 * If existing QDS data is provided, ALL user edits are preserved.
 * Rows are matched by stable key "i{inputId}:{code}".
 * No duplicates are possible — the key map is a 1:1 lookup.
 */
function buildOrMergeQDS(
  includedRows: IncludedTakeoffRow[],
  existing: ElectricalQDSData | null
): ElectricalQDSData {
  const existingByKey = new Map<string, ElectricalQDSRow>(
    (existing?.rows ?? []).map(r => [r.key, r])
  );

  // Deduplicate by stable key (same symbol on same drawing = one row)
  const seen = new Set<string>();
  const newRows: ElectricalQDSRow[] = [];

  for (const row of includedRows) {
    const key = `i${row.inputId}:${row.code}`;
    if (seen.has(key)) continue;
    seen.add(key);

    const prev = existingByKey.get(key);
    const spons = matchSpons(row.description);

    newRows.push({
      key,
      code: row.code,
      drawingName: row.drawingName,
      section: classifySection(row.description),
      // Preserve description edit; else use latest from takeoff
      description: prev?.descEdited  ? prev.description  : row.description,
      // Preserve qty edit; else use latest takeoff count
      qty:         prev?.qtyEdited   ? prev.qty          : row.count,
      unit:        spons?.unit ?? "each",
      // Preserve supply price if user has entered one
      supplyPrice: prev?.supplyEdited ? prev.supplyPrice  : 0,
      // Preserve buy-in cost if user has entered one
      costPrice: prev?.costEdited ? prev.costPrice : (prev?.costPrice ?? 0),
      // Preserve hours override; else use Spon's (or 0 if no match)
      hoursPerUnit: prev?.hoursEdited ? prev.hoursPerUnit : (spons?.hoursPerUnit ?? 0),
      noSponsRate: !spons,
      // Carry forward edit flags
      supplyEdited: prev?.supplyEdited ?? false,
      costEdited:   prev?.costEdited   ?? false,
      hoursEdited:  prev?.hoursEdited  ?? false,
      qtyEdited:    prev?.qtyEdited    ?? false,
      descEdited:   prev?.descEdited   ?? false,
    });
  }

  // Preserve all non-row data from existing QDS (plant hire, prelims, etc.)
  return {
    _type: "electrical",
    labourRate:             existing?.labourRate             ?? 60,
    productivityMultiplier: existing?.productivityMultiplier ?? 1.00,
    rows: newRows,
    firstPoints:   existing?.firstPoints   ?? { circuits: 0, ratePerCircuit: 0 },
    plantHire:     existing?.plantHire     ?? [],
    preliminaries: existing?.preliminaries ?? [],
    sundries:      existing?.sundries      ?? null,
    notes:         existing?.notes         ?? null,
    builtAt: new Date().toISOString(),
  };
}

// ─── Calculation Helpers ──────────────────────────────────────────────────────

function plantHireBuyIn(p: ElectricalPlantHireItem): number {
  return (
    (p.dailyRate  ?? 0) * (p.numDays   ?? 0) +
    (p.weeklyRate ?? 0) * (p.numWeeks  ?? 0) +
    (p.deliveryCharge   ?? 0) +
    (p.collectionCharge ?? 0)
  );
}

function plantHireSell(p: ElectricalPlantHireItem): number {
  return plantHireBuyIn(p) * (1 + p.markup / 100);
}

function fmt(n: number): string {
  return n.toLocaleString("en-GB", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function numInput(raw: string): number {
  const n = parseFloat(raw.replace(/[^0-9.-]/g, ""));
  return isNaN(n) ? 0 : Math.max(0, n);
}

// ─── Sub-components ───────────────────────────────────────────────────────────

interface SectionHeaderProps {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  count?: number;
  totalHours?: number;
  totalSupply?: number;
  totalLabour?: number;
  open: boolean;
  onToggle: () => void;
  onAddRow?: () => void;
}

function SectionHeader({
  icon: Icon, title, count, totalHours, totalSupply, totalLabour,
  open, onToggle, onAddRow,
}: SectionHeaderProps) {
  const totalCost = (totalSupply ?? 0) + (totalLabour ?? 0);
  return (
    <div className="flex items-center gap-2 px-4 py-2.5 bg-muted/40 border-b border-t select-none">
      <button onClick={onToggle} className="flex items-center gap-2 flex-1 text-left min-w-0">
        {open
          ? <ChevronDown className="h-3.5 w-3.5 text-muted-foreground shrink-0" />
          : <ChevronRight className="h-3.5 w-3.5 text-muted-foreground shrink-0" />}
        <Icon className="h-3.5 w-3.5 text-primary shrink-0" />
        <span className="text-sm font-semibold">{title}</span>
        {count !== undefined && (
          <Badge variant="secondary" className="text-[10px] px-1.5 py-0 h-4">{count}</Badge>
        )}
      </button>
      <div className="flex items-center gap-4 shrink-0 text-xs text-muted-foreground tabular-nums">
        {totalHours !== undefined && totalHours > 0 && (
          <span>{fmt(totalHours)} hrs</span>
        )}
        {totalSupply !== undefined && totalSupply > 0 && (
          <span>Supply £{fmt(totalSupply)}</span>
        )}
        {totalLabour !== undefined && totalLabour > 0 && (
          <span>Labour £{fmt(totalLabour)}</span>
        )}
        {totalCost > 0 && (
          <span className="font-semibold text-foreground">£{fmt(totalCost)}</span>
        )}
      </div>
      {onAddRow && (
        <button onClick={onAddRow}
          className="shrink-0 text-xs text-primary hover:underline flex items-center gap-0.5 ml-2">
          <Plus className="h-3 w-3" />Add
        </button>
      )}
    </div>
  );
}

// Column header row shared by line items / containment / cabling
function ItemTableHeader() {
  return (
    <thead className="sticky top-0 bg-background z-10">
      <tr className="border-b text-xs font-semibold text-muted-foreground">
        <th className="text-left px-3 py-1.5 w-16">Code</th>
        <th className="text-left px-3 py-1.5">Description</th>
        <th className="text-right px-3 py-1.5 w-20">Qty</th>
        <th className="text-left px-3 py-1.5 w-12">Unit</th>
        <th className="text-right px-3 py-1.5 w-24">Supply £/unit</th>
        <th className="text-right px-3 py-1.5 w-24">Buy-in £</th>
        <th className="text-right px-3 py-1.5 w-24">Supply £ total</th>
        <th className="text-right px-3 py-1.5 w-20">Hrs/unit</th>
        <th className="text-right px-3 py-1.5 w-20">Total hrs</th>
        <th className="text-right px-3 py-1.5 w-24">Labour £</th>
        <th className="text-right px-3 py-1.5 w-24">Total £</th>
        <th className="w-6" />
      </tr>
    </thead>
  );
}

interface ItemRowProps {
  row: ElectricalQDSRow;
  labourRate: number;
  productivityMultiplier: number;
  onChange: (key: string, patch: Partial<ElectricalQDSRow>) => void;
  onDelete: (key: string) => void;
}

function ItemRow({ row, labourRate, productivityMultiplier, onChange, onDelete }: ItemRowProps) {
  const supplyTotal = row.supplyPrice * row.qty;
  const costTotal   = (row.costPrice ?? 0) * row.qty;
  const totalHrs    = row.qty * row.hoursPerUnit * productivityMultiplier;
  const labourTotal = totalHrs * labourRate;
  const rowTotal    = supplyTotal + labourTotal;

  return (
    <tr className="border-b border-muted/50 hover:bg-muted/20 transition-colors group text-xs">
      {/* Code */}
      <td className="px-3 py-1 font-mono font-semibold text-muted-foreground">{row.code}</td>

      {/* Description */}
      <td className="px-3 py-1 min-w-[180px]">
        <input
          className="w-full bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none py-0.5 text-xs"
          value={row.description}
          onChange={e => onChange(row.key, { description: e.target.value, descEdited: true })}
        />
      </td>

      {/* Qty */}
      <td className="px-3 py-1 text-right">
        <input
          className="w-16 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none py-0.5 tabular-nums"
          value={row.qty}
          onChange={e => onChange(row.key, { qty: numInput(e.target.value), qtyEdited: true })}
          type="number" min="0" step="1"
        />
      </td>

      {/* Unit */}
      <td className="px-3 py-1 text-muted-foreground">{row.unit}</td>

      {/* Supply £/unit */}
      <td className="px-3 py-1 text-right">
        <input
          className="w-20 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none py-0.5 tabular-nums"
          value={row.supplyPrice === 0 && !row.supplyEdited ? "" : row.supplyPrice}
          placeholder="0.00"
          onChange={e => onChange(row.key, { supplyPrice: numInput(e.target.value), supplyEdited: true })}
          type="number" min="0" step="0.01"
        />
      </td>

      {/* Buy-in £/unit */}
      <td className="px-3 py-1 text-right">
        <input
          className="w-20 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none py-0.5 tabular-nums text-muted-foreground"
          value={(row.costPrice ?? 0) === 0 && !row.costEdited ? "" : (row.costPrice ?? 0)}
          placeholder="0.00"
          title={costTotal > 0 ? `Buy-in total: £${fmt(costTotal)}` : "Enter buy-in cost per unit"}
          onChange={e => onChange(row.key, { costPrice: numInput(e.target.value), costEdited: true })}
          type="number" min="0" step="0.01"
        />
      </td>

      {/* Supply £ total */}
      <td className="px-3 py-1 text-right tabular-nums">
        {supplyTotal > 0 ? `£${fmt(supplyTotal)}` : <span className="text-muted-foreground/40">—</span>}
      </td>

      {/* Hrs/unit */}
      <td className="px-3 py-1 text-right">
        <div className="flex items-center justify-end gap-1">
          {row.noSponsRate && !row.hoursEdited && (
            <AlertTriangle className="h-2.5 w-2.5 text-amber-500 shrink-0" title="No Spon's rate — enter manually" />
          )}
          <input
            className={cn(
              "w-16 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none py-0.5 tabular-nums",
              row.noSponsRate && !row.hoursEdited ? "text-amber-600" : ""
            )}
            value={row.hoursPerUnit}
            onChange={e => onChange(row.key, { hoursPerUnit: numInput(e.target.value), hoursEdited: true })}
            type="number" min="0" step="0.01"
          />
        </div>
      </td>

      {/* Total hrs */}
      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
        {totalHrs > 0 ? fmt(totalHrs) : <span className="opacity-30">0.00</span>}
      </td>

      {/* Labour £ */}
      <td className="px-3 py-1 text-right tabular-nums text-muted-foreground">
        {labourTotal > 0 ? `£${fmt(labourTotal)}` : <span className="opacity-30">—</span>}
      </td>

      {/* Total £ */}
      <td className="px-3 py-1 text-right tabular-nums font-medium">
        {rowTotal > 0 ? `£${fmt(rowTotal)}` : <span className="opacity-30">—</span>}
      </td>

      {/* Delete */}
      <td className="px-1 py-1">
        <button onClick={() => onDelete(row.key)}
          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
          <Trash2 className="h-3 w-3" />
        </button>
      </td>
    </tr>
  );
}

// ─── Main Component ───────────────────────────────────────────────────────────

interface ElectricalQDSProps {
  quoteId: number;
  includedRows: IncludedTakeoffRow[];
  savedQdsJson: string | null;
}

type SaveStatus = "idle" | "saving" | "saved";

export default function ElectricalQDS({ quoteId, includedRows, savedQdsJson }: ElectricalQDSProps) {

  // ── State ──────────────────────────────────────────────────────────────────
  const [qdsData, setQdsData] = useState<ElectricalQDSData | null>(null);
  const [saveStatus, setSaveStatus] = useState<SaveStatus>("idle");
  const [isBuilding, setIsBuilding] = useState(false);

  // Section open/closed state
  const [openSections, setOpenSections] = useState({
    lineItems: true, containment: true, cabling: true,
    firstPoints: true, plantHire: true, preliminaries: false,
    labourSummary: true, sundries: false,
  });

  const saveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // ── Hydrate from saved JSON on mount ──────────────────────────────────────
  useEffect(() => {
    if (!savedQdsJson) return;
    try {
      const parsed = JSON.parse(savedQdsJson) as ElectricalQDSData;
      if (parsed._type === "electrical") {
        setQdsData(parsed);
      }
    } catch {
      // malformed — ignore, user will rebuild
    }
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  // ── Save mutation ──────────────────────────────────────────────────────────
  const updateQuote = trpc.quotes.update.useMutation({
    onError: (e) => { toast.error("Failed to save QDS: " + e.message); setSaveStatus("idle"); },
  });

  // ── Auto-save (debounced) ─────────────────────────────────────────────────
  const scheduleSave = useCallback((data: ElectricalQDSData) => {
    if (saveTimerRef.current) clearTimeout(saveTimerRef.current);
    setSaveStatus("saving");
    saveTimerRef.current = setTimeout(async () => {
      try {
        await updateQuote.mutateAsync({ id: quoteId, qdsSummaryJson: JSON.stringify(data) });
        setSaveStatus("saved");
        setTimeout(() => setSaveStatus("idle"), 2000);
      } catch {
        setSaveStatus("idle");
      }
    }, 1500);
  }, [quoteId, updateQuote]);

  // ── Update data + schedule save ────────────────────────────────────────────
  const update = useCallback((patch: Partial<ElectricalQDSData> | ((prev: ElectricalQDSData) => ElectricalQDSData)) => {
    setQdsData(prev => {
      if (!prev) return prev;
      const next = typeof patch === "function" ? patch(prev) : { ...prev, ...patch };
      scheduleSave(next);
      return next;
    });
  }, [scheduleSave]);

  // ── Row-level edit handler ─────────────────────────────────────────────────
  const onRowChange = useCallback((key: string, rowPatch: Partial<ElectricalQDSRow>) => {
    update(prev => ({
      ...prev,
      rows: prev.rows.map(r => r.key === key ? { ...r, ...rowPatch } : r),
    }));
  }, [update]);

  const onRowDelete = useCallback((key: string) => {
    update(prev => ({ ...prev, rows: prev.rows.filter(r => r.key !== key) }));
  }, [update]);

  // ── Build / Update QDS from takeoff ───────────────────────────────────────
  const handleBuild = useCallback(() => {
    setIsBuilding(true);
    try {
      const built = buildOrMergeQDS(includedRows, qdsData);
      setQdsData(built);
      scheduleSave(built);
    } finally {
      setIsBuilding(false);
    }
  }, [includedRows, qdsData, scheduleSave]);

  // ── Section toggle ─────────────────────────────────────────────────────────
  const toggleSection = (key: keyof typeof openSections) =>
    setOpenSections(prev => ({ ...prev, [key]: !prev[key] }));

  // ── Derived totals ─────────────────────────────────────────────────────────
  const totals = useMemo(() => {
    if (!qdsData) return null;
    const { labourRate, productivityMultiplier, rows, firstPoints, plantHire, preliminaries, sundries } = qdsData;

    let supplyTotal = 0;
    let supplyBuyInTotal = 0;
    let labourTotal = 0;
    let totalHours  = 0;

    for (const r of rows) {
      supplyTotal     += r.supplyPrice * r.qty;
      supplyBuyInTotal += (r.costPrice ?? 0) * r.qty;
      const hrs = r.qty * r.hoursPerUnit * productivityMultiplier;
      totalHours  += hrs;
      labourTotal += hrs * labourRate;
    }

    const firstPointsTotal = firstPoints.circuits * firstPoints.ratePerCircuit;

    let plantBuyIn = 0;
    let plantSell  = 0;
    for (const p of plantHire) {
      plantBuyIn += plantHireBuyIn(p);
      plantSell  += plantHireSell(p);
    }

    const prelimTotal = preliminaries.reduce((s, p) => s + p.cost, 0);
    const sundriesTotal = sundries != null ? (supplyTotal * sundries / 100) : 0;

    const grandTotal = supplyTotal + labourTotal + firstPointsTotal + plantSell + prelimTotal + sundriesTotal;

    const supplyProfit = supplyTotal - supplyBuyInTotal;
    const plantProfit  = plantSell - plantBuyIn;
    const totalProfit  = supplyProfit + plantProfit;

    return {
      supplyTotal, supplyBuyInTotal, supplyProfit, labourTotal, totalHours, firstPointsTotal,
      plantBuyIn, plantSell, plantProfit,
      prelimTotal, sundriesTotal, grandTotal, totalProfit,
    };
  }, [qdsData]);

  // ── Section-level totals ──────────────────────────────────────────────────
  function sectionTotals(section: QDSSection) {
    if (!qdsData) return { supply: 0, labour: 0, hours: 0 };
    const { labourRate, productivityMultiplier, rows } = qdsData;
    return rows
      .filter(r => r.section === section)
      .reduce((acc, r) => {
        const hrs = r.qty * r.hoursPerUnit * productivityMultiplier;
        return {
          supply: acc.supply + r.supplyPrice * r.qty,
          labour: acc.labour + hrs * labourRate,
          hours:  acc.hours  + hrs,
        };
      }, { supply: 0, labour: 0, hours: 0 });
  }

  // ── No QDS yet ────────────────────────────────────────────────────────────
  if (!qdsData) {
    return (
      <div className="flex flex-col items-center justify-center min-h-64 gap-4 p-8 text-center">
        <Calculator className="h-10 w-10 text-muted-foreground/30" />
        <div>
          <p className="text-sm font-semibold">No QDS built yet</p>
          <p className="text-xs text-muted-foreground mt-1 max-w-xs">
            Build the QDS from your confirmed takeoff. Spon's UK labour rates are applied automatically.
            You can edit any value and they'll persist if you update the QDS later.
          </p>
        </div>
        <Button onClick={handleBuild} disabled={isBuilding || includedRows.length === 0}
          className="gap-2">
          {isBuilding
            ? <><Loader2 className="h-4 w-4 animate-spin" />Building…</>
            : <><Calculator className="h-4 w-4" />Build QDS from Takeoff</>}
        </Button>
        {includedRows.length === 0 && (
          <p className="text-xs text-muted-foreground/70">
            No included symbols found — check the Takeoff tab.
          </p>
        )}
      </div>
    );
  }

  const { labourRate, productivityMultiplier, rows, firstPoints, plantHire, preliminaries, sundries } = qdsData;
  const lineItemRows  = rows.filter(r => r.section === "lineItems");
  const containRows   = rows.filter(r => r.section === "containment");
  const cablingRows   = rows.filter(r => r.section === "cabling");
  const liTotals   = sectionTotals("lineItems");
  const ctTotals   = sectionTotals("containment");
  const caTotals   = sectionTotals("cabling");
  const noSponsCount = rows.filter(r => r.noSponsRate && !r.hoursEdited).length;

  // ─────────────────────────────────────────────────────────────────────────
  return (
    <div className="flex flex-col h-full overflow-hidden">

      {/* ── QDS Header ────────────────────────────────────────────────────── */}
      <div className="shrink-0 px-4 py-3 border-b bg-background flex items-center gap-4 flex-wrap">
        {/* Labour rate */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Labour rate:</span>
          <div className="flex items-center border rounded-md overflow-hidden h-7">
            <span className="px-2 text-xs text-muted-foreground bg-muted border-r">£</span>
            <input
              type="number" min="0" step="1"
              className="w-16 px-2 text-xs outline-none tabular-nums h-full"
              value={labourRate}
              onChange={e => update({ labourRate: numInput(e.target.value) })}
            />
            <span className="px-2 text-xs text-muted-foreground bg-muted border-l">/hr</span>
          </div>
        </div>

        {/* Productivity multiplier */}
        <div className="flex items-center gap-2 text-sm">
          <span className="text-muted-foreground text-xs">Conditions:</span>
          <select
            className="h-7 text-xs border rounded-md px-2 outline-none bg-background"
            value={productivityMultiplier}
            onChange={e => update({ productivityMultiplier: parseFloat(e.target.value) })}
          >
            {PRODUCTIVITY_MULTIPLIERS.map(m => (
              <option key={m.value} value={m.value}>{m.label} (×{m.value})</option>
            ))}
          </select>
        </div>

        {/* Save indicator */}
        <div className="ml-auto flex items-center gap-3">
          {noSponsCount > 0 && (
            <div className="flex items-center gap-1 text-xs text-amber-600">
              <AlertTriangle className="h-3 w-3" />
              {noSponsCount} row{noSponsCount > 1 ? "s" : ""} missing Spon's rate
            </div>
          )}
          {saveStatus === "saving" && (
            <div className="flex items-center gap-1 text-xs text-muted-foreground">
              <Loader2 className="h-3 w-3 animate-spin" />Saving…
            </div>
          )}
          {saveStatus === "saved" && (
            <div className="flex items-center gap-1 text-xs text-green-600">
              <CheckCircle2 className="h-3 w-3" />Saved
            </div>
          )}
          <Button size="sm" variant="outline" onClick={handleBuild}
            disabled={isBuilding} className="h-7 text-xs gap-1">
            {isBuilding
              ? <Loader2 className="h-3 w-3 animate-spin" />
              : <Zap className="h-3 w-3" />}
            Update from Takeoff
          </Button>
        </div>
      </div>

      {/* ── Scrollable QDS body ────────────────────────────────────────────── */}
      <div className="flex-1 overflow-y-auto">

        {/* ── 1. Line Items ───────────────────────────────────────────────── */}
        <SectionHeader
          icon={Building2} title="Line Items" count={lineItemRows.length}
          totalHours={liTotals.hours} totalSupply={liTotals.supply} totalLabour={liTotals.labour}
          open={openSections.lineItems} onToggle={() => toggleSection("lineItems")}
        />
        {openSections.lineItems && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <ItemTableHeader />
              <tbody>
                {lineItemRows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-4 text-xs text-muted-foreground italic text-center">
                    No line items — include symbols on the Takeoff tab.
                  </td></tr>
                ) : lineItemRows.map(row => (
                  <ItemRow key={row.key} row={row}
                    labourRate={labourRate} productivityMultiplier={productivityMultiplier}
                    onChange={onRowChange} onDelete={onRowDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 2. Containment ──────────────────────────────────────────────── */}
        <SectionHeader
          icon={Cable} title="Containment" count={containRows.length}
          totalHours={ctTotals.hours} totalSupply={ctTotals.supply} totalLabour={ctTotals.labour}
          open={openSections.containment} onToggle={() => toggleSection("containment")}
        />
        {openSections.containment && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <ItemTableHeader />
              <tbody>
                {containRows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-4 text-xs text-muted-foreground italic text-center">
                    No containment items detected in takeoff.
                  </td></tr>
                ) : containRows.map(row => (
                  <ItemRow key={row.key} row={row}
                    labourRate={labourRate} productivityMultiplier={productivityMultiplier}
                    onChange={onRowChange} onDelete={onRowDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 3. Cabling ──────────────────────────────────────────────────── */}
        <SectionHeader
          icon={CircleDot} title="Cabling" count={cablingRows.length}
          totalHours={caTotals.hours} totalSupply={caTotals.supply} totalLabour={caTotals.labour}
          open={openSections.cabling} onToggle={() => toggleSection("cabling")}
        />
        {openSections.cabling && (
          <div className="overflow-x-auto">
            <table className="w-full text-sm border-collapse min-w-[800px]">
              <ItemTableHeader />
              <tbody>
                {cablingRows.length === 0 ? (
                  <tr><td colSpan={12} className="px-4 py-4 text-xs text-muted-foreground italic text-center">
                    No cabling items detected in takeoff.
                  </td></tr>
                ) : cablingRows.map(row => (
                  <ItemRow key={row.key} row={row}
                    labourRate={labourRate} productivityMultiplier={productivityMultiplier}
                    onChange={onRowChange} onDelete={onRowDelete} />
                ))}
              </tbody>
            </table>
          </div>
        )}

        {/* ── 4. First Points ─────────────────────────────────────────────── */}
        <SectionHeader
          icon={Hash} title="First Points"
          totalLabour={firstPoints.circuits * firstPoints.ratePerCircuit}
          open={openSections.firstPoints} onToggle={() => toggleSection("firstPoints")}
        />
        {openSections.firstPoints && (
          <div className="p-4 flex items-center gap-6 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-20">Circuits:</span>
              <input type="number" min="0" step="1"
                className="w-20 border rounded-md px-2 py-1 text-xs outline-none"
                value={firstPoints.circuits}
                onChange={e => update({ firstPoints: { ...firstPoints, circuits: numInput(e.target.value) } })}
              />
            </div>
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs w-28">Rate per circuit:</span>
              <div className="flex items-center border rounded-md overflow-hidden h-7">
                <span className="px-2 text-xs text-muted-foreground bg-muted border-r">£</span>
                <input type="number" min="0" step="0.01"
                  className="w-20 px-2 text-xs outline-none tabular-nums h-full"
                  value={firstPoints.ratePerCircuit}
                  onChange={e => update({ firstPoints: { ...firstPoints, ratePerCircuit: numInput(e.target.value) } })}
                />
              </div>
            </div>
            <span className="text-sm tabular-nums font-medium">
              Total: £{fmt(firstPoints.circuits * firstPoints.ratePerCircuit)}
            </span>
          </div>
        )}

        {/* ── 5. Plant / Hire ─────────────────────────────────────────────── */}
        <SectionHeader
          icon={Truck} title="Plant / Hire" count={plantHire.length}
          totalSupply={totals?.plantBuyIn} totalLabour={undefined}
          open={openSections.plantHire} onToggle={() => toggleSection("plantHire")}
          onAddRow={() => update(prev => ({
            ...prev,
            plantHire: [...prev.plantHire, {
              id: crypto.randomUUID(),
              description: "",
              dailyRate: null, numDays: null,
              weeklyRate: null, numWeeks: null,
              deliveryCharge: null, collectionCharge: null,
              markup: 15,
            }],
          }))}
        />
        {openSections.plantHire && (
          <div className="p-3 flex flex-col gap-2">
            {plantHire.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1 py-2">
                No plant/hire items. Click Add to add equipment.
              </p>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-xs border-collapse min-w-[700px]">
                  <thead>
                    <tr className="border-b text-[10px] font-semibold text-muted-foreground">
                      <th className="text-left px-2 py-1.5">Description</th>
                      <th className="text-right px-2 py-1.5 w-20">Day rate £</th>
                      <th className="text-right px-2 py-1.5 w-16">Days</th>
                      <th className="text-right px-2 py-1.5 w-20">Week rate £</th>
                      <th className="text-right px-2 py-1.5 w-16">Weeks</th>
                      <th className="text-right px-2 py-1.5 w-20">Delivery £</th>
                      <th className="text-right px-2 py-1.5 w-20">Collection £</th>
                      <th className="text-right px-2 py-1.5 w-16">Markup %</th>
                      <th className="text-right px-2 py-1.5 w-20">Buy-in £</th>
                      <th className="text-right px-2 py-1.5 w-20">Sell £</th>
                      <th className="text-right px-2 py-1.5 w-20">Profit £</th>
                      <th className="w-6" />
                    </tr>
                  </thead>
                  <tbody>
                    {plantHire.map(p => {
                      const buyIn   = plantHireBuyIn(p);
                      const sell    = plantHireSell(p);
                      const profit  = sell - buyIn;
                      const updatePlant = (patch: Partial<ElectricalPlantHireItem>) =>
                        update(prev => ({
                          ...prev,
                          plantHire: prev.plantHire.map(x => x.id === p.id ? { ...x, ...patch } : x),
                        }));
                      return (
                        <tr key={p.id} className="border-b border-muted/50 hover:bg-muted/20 group">
                          <td className="px-2 py-1">
                            <input className="w-full bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none"
                              value={p.description}
                              onChange={e => updatePlant({ description: e.target.value })}
                              placeholder="Equipment description" />
                          </td>
                          {/* Day rate */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="0.01"
                              className="w-18 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.dailyRate ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ dailyRate: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Num days */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="1"
                              className="w-12 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.numDays ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ numDays: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Week rate */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="0.01"
                              className="w-18 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.weeklyRate ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ weeklyRate: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Num weeks */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="1"
                              className="w-12 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.numWeeks ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ numWeeks: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Delivery */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="0.01"
                              className="w-18 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.deliveryCharge ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ deliveryCharge: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Collection */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="0.01"
                              className="w-18 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.collectionCharge ?? ""}
                              placeholder="—"
                              onChange={e => updatePlant({ collectionCharge: e.target.value ? numInput(e.target.value) : null })} />
                          </td>
                          {/* Markup */}
                          <td className="px-2 py-1 text-right">
                            <input type="number" min="0" step="1"
                              className="w-12 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                              value={p.markup}
                              onChange={e => updatePlant({ markup: numInput(e.target.value) })} />
                          </td>
                          {/* Buy-in / sell / profit (read-only) */}
                          <td className="px-2 py-1 text-right tabular-nums text-muted-foreground">£{fmt(buyIn)}</td>
                          <td className="px-2 py-1 text-right tabular-nums">£{fmt(sell)}</td>
                          <td className="px-2 py-1 text-right tabular-nums text-green-600">£{fmt(profit)}</td>
                          <td className="px-1 py-1">
                            <button
                              onClick={() => update(prev => ({ ...prev, plantHire: prev.plantHire.filter(x => x.id !== p.id) }))}
                              className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                              <Trash2 className="h-3 w-3" />
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

        {/* ── 6. Preliminaries ────────────────────────────────────────────── */}
        <SectionHeader
          icon={Wrench} title="Preliminaries" count={preliminaries.length}
          totalLabour={totals?.prelimTotal}
          open={openSections.preliminaries} onToggle={() => toggleSection("preliminaries")}
          onAddRow={() => update(prev => ({
            ...prev,
            preliminaries: [...prev.preliminaries, { id: crypto.randomUUID(), description: "", cost: 0 }],
          }))}
        />
        {openSections.preliminaries && (
          <div className="p-3">
            {preliminaries.length === 0 ? (
              <p className="text-xs text-muted-foreground italic px-1 py-2">
                No preliminaries. Click Add for accommodation, welfare, travel, etc.
              </p>
            ) : (
              <table className="w-full text-xs border-collapse">
                <thead>
                  <tr className="border-b text-[10px] font-semibold text-muted-foreground">
                    <th className="text-left px-2 py-1.5">Description</th>
                    <th className="text-right px-2 py-1.5 w-28">Cost £</th>
                    <th className="w-6" />
                  </tr>
                </thead>
                <tbody>
                  {preliminaries.map(p => (
                    <tr key={p.id} className="border-b border-muted/50 hover:bg-muted/20 group">
                      <td className="px-2 py-1">
                        <input className="w-full bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none"
                          value={p.description}
                          placeholder="e.g. Welfare facilities, travel allowance"
                          onChange={e => update(prev => ({
                            ...prev,
                            preliminaries: prev.preliminaries.map(x => x.id === p.id ? { ...x, description: e.target.value } : x),
                          }))} />
                      </td>
                      <td className="px-2 py-1 text-right">
                        <input type="number" min="0" step="0.01"
                          className="w-24 text-right bg-transparent border-b border-transparent hover:border-muted focus:border-primary outline-none tabular-nums"
                          value={p.cost}
                          onChange={e => update(prev => ({
                            ...prev,
                            preliminaries: prev.preliminaries.map(x => x.id === p.id ? { ...x, cost: numInput(e.target.value) } : x),
                          }))} />
                      </td>
                      <td className="px-1 py-1">
                        <button
                          onClick={() => update(prev => ({ ...prev, preliminaries: prev.preliminaries.filter(x => x.id !== p.id) }))}
                          className="opacity-0 group-hover:opacity-100 text-muted-foreground hover:text-destructive transition-all">
                          <Trash2 className="h-3 w-3" />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        )}

        {/* ── 7. Labour Summary ───────────────────────────────────────────── */}
        <SectionHeader
          icon={Sigma} title="Labour Summary"
          totalHours={totals?.totalHours}
          totalLabour={totals ? totals.labourTotal + totals.firstPointsTotal : undefined}
          open={openSections.labourSummary} onToggle={() => toggleSection("labourSummary")}
        />
        {openSections.labourSummary && totals && (
          <div className="p-4">
            <table className="text-xs border-collapse w-full max-w-md">
              <tbody>
                {liTotals.hours > 0 && (
                  <tr className="border-b border-muted/30">
                    <td className="py-1 text-muted-foreground">Line items labour</td>
                    <td className="py-1 text-right tabular-nums w-24">{fmt(liTotals.hours)} hrs</td>
                    <td className="py-1 text-right tabular-nums w-28">£{fmt(liTotals.labour)}</td>
                  </tr>
                )}
                {ctTotals.hours > 0 && (
                  <tr className="border-b border-muted/30">
                    <td className="py-1 text-muted-foreground">Containment labour</td>
                    <td className="py-1 text-right tabular-nums">{fmt(ctTotals.hours)} hrs</td>
                    <td className="py-1 text-right tabular-nums">£{fmt(ctTotals.labour)}</td>
                  </tr>
                )}
                {caTotals.hours > 0 && (
                  <tr className="border-b border-muted/30">
                    <td className="py-1 text-muted-foreground">Cabling labour</td>
                    <td className="py-1 text-right tabular-nums">{fmt(caTotals.hours)} hrs</td>
                    <td className="py-1 text-right tabular-nums">£{fmt(caTotals.labour)}</td>
                  </tr>
                )}
                {totals.firstPointsTotal > 0 && (
                  <tr className="border-b border-muted/30">
                    <td className="py-1 text-muted-foreground">First points</td>
                    <td className="py-1 text-right tabular-nums">{firstPoints.circuits} circuits</td>
                    <td className="py-1 text-right tabular-nums">£{fmt(totals.firstPointsTotal)}</td>
                  </tr>
                )}
                <tr className="border-t-2 border-muted font-semibold">
                  <td className="py-1.5">Total labour</td>
                  <td className="py-1.5 text-right tabular-nums">{fmt(totals.totalHours)} hrs</td>
                  <td className="py-1.5 text-right tabular-nums">£{fmt(totals.labourTotal + totals.firstPointsTotal)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}

        {/* ── 8. Sundries ─────────────────────────────────────────────────── */}
        <SectionHeader
          icon={Hash} title="Sundries"
          totalLabour={totals?.sundriesTotal}
          open={openSections.sundries} onToggle={() => toggleSection("sundries")}
        />
        {openSections.sundries && (
          <div className="p-4 flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2 text-sm">
              <span className="text-muted-foreground text-xs">% of supply value:</span>
              <input type="number" min="0" step="0.5"
                className="w-16 border rounded-md px-2 py-1 text-xs outline-none tabular-nums"
                value={sundries ?? ""}
                placeholder="0"
                onChange={e => update({ sundries: e.target.value ? numInput(e.target.value) : null })}
              />
              <span className="text-xs text-muted-foreground">%</span>
            </div>
            {sundries != null && totals && (
              <span className="text-xs tabular-nums text-muted-foreground">
                = £{fmt(totals.sundriesTotal)} ({sundries}% of £{fmt(totals.supplyTotal)} supply)
              </span>
            )}
          </div>
        )}

        {/* ── Grand Total ─────────────────────────────────────────────────── */}
        {totals && (
          <div className="m-4 p-4 rounded-lg border bg-muted/20">
            <div className="grid grid-cols-2 gap-x-8 gap-y-1 text-sm max-w-sm">
              <span className="text-muted-foreground">Supply total</span>
              <span className="text-right tabular-nums">£{fmt(totals.supplyTotal)}</span>
              <span className="text-muted-foreground">Labour total</span>
              <span className="text-right tabular-nums">£{fmt(totals.labourTotal + totals.firstPointsTotal)}</span>
              {totals.plantSell > 0 && <>
                <span className="text-muted-foreground">Plant / hire</span>
                <span className="text-right tabular-nums">£{fmt(totals.plantSell)}</span>
              </>}
              {totals.prelimTotal > 0 && <>
                <span className="text-muted-foreground">Preliminaries</span>
                <span className="text-right tabular-nums">£{fmt(totals.prelimTotal)}</span>
              </>}
              {totals.sundriesTotal > 0 && <>
                <span className="text-muted-foreground">Sundries</span>
                <span className="text-right tabular-nums">£{fmt(totals.sundriesTotal)}</span>
              </>}
              <span className="font-bold border-t pt-1 mt-1">Grand total</span>
              <span className="font-bold text-right tabular-nums border-t pt-1 mt-1">
                £{fmt(totals.grandTotal)}
              </span>

              {/* ── Internal margin (never appears in PDF) ─── */}
              {totals.supplyBuyInTotal > 0 && <>
                <span className="text-muted-foreground/60 text-xs mt-3">Supply buy-in</span>
                <span className="text-right tabular-nums text-xs mt-3 text-muted-foreground/60">£{fmt(totals.supplyBuyInTotal)}</span>
                <span className="text-muted-foreground/60 text-xs">Supply profit</span>
                <span className={cn("text-right tabular-nums text-xs", totals.supplyProfit >= 0 ? "text-green-600" : "text-red-500")}>
                  £{fmt(totals.supplyProfit)}
                  {totals.supplyTotal > 0 && (
                    <span className="ml-1 text-[10px]">({Math.round((totals.supplyProfit / totals.supplyTotal) * 100)}%)</span>
                  )}
                </span>
              </>}
              {totals.plantSell > 0 && totals.plantProfit !== 0 && <>
                <span className="text-muted-foreground/60 text-xs">Plant profit</span>
                <span className={cn("text-right tabular-nums text-xs", totals.plantProfit >= 0 ? "text-green-600" : "text-red-500")}>
                  £{fmt(totals.plantProfit)}
                </span>
              </>}
              {(totals.supplyBuyInTotal > 0 || totals.plantSell > 0) && <>
                <span className="font-semibold text-xs border-t pt-1 mt-1">Total profit</span>
                <span className={cn("font-bold text-right tabular-nums text-xs border-t pt-1 mt-1", totals.totalProfit >= 0 ? "text-green-600" : "text-red-500")}>
                  £{fmt(totals.totalProfit)}
                  {totals.grandTotal > 0 && (
                    <span className="ml-1 font-normal text-[10px]">({Math.round((totals.totalProfit / totals.grandTotal) * 100)}%)</span>
                  )}
                </span>
              </>}
            </div>
          </div>
        )}

      </div>{/* end scrollable body */}
    </div>
  );
}
