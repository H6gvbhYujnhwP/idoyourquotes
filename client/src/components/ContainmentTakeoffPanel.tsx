/**
 * ContainmentTakeoffPanel — displays containment/cable tray takeoff results
 * Shows: tray runs by size, fittings summary, cable calculation, user inputs
 * Allows editing tray measurements and user inputs for cable calculation
 */
import { useState, useMemo } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import {
  Ruler,
  Check,
  Pencil,
  Lock,
  Unlock,
  Cable,
  ArrowDown,
  Zap,
  ChevronDown,
  ChevronUp,
  Save,
  X,
} from "lucide-react";

// Brand colours
const brand = {
  navy: "#1a2b4a",
  teal: "#1fb5a3",
  white: "#ffffff",
  bg: "#f5f7fa",
  border: "#e2e8f0",
  navyMuted: "#64748b",
};

// Tray size colours (must match server TRAY_SIZE_COLOURS)
const TRAY_COLOURS: Record<number, { stroke: string; label: string }> = {
  50: { stroke: "#22c55e", label: "50mm" },
  75: { stroke: "#06b6d4", label: "75mm" },
  100: { stroke: "#3b82f6", label: "100mm" },
  150: { stroke: "#8b5cf6", label: "150mm" },
  225: { stroke: "#f59e0b", label: "225mm" },
  300: { stroke: "#ef4444", label: "300mm" },
  450: { stroke: "#ec4899", label: "450mm" },
  600: { stroke: "#f97316", label: "600mm" },
};

// ---- Types ----

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
}

interface FittingSummaryBySize {
  tPieces: number;
  crossPieces: number;
  bends90: number;
  drops: number;
  couplers: number;
}

interface UserInputs {
  trayFilter: string;
  trayDuty: string;
  extraDropPerFitting: number;
  firstPointRunLength: number;
  numberOfCircuits: number;
  additionalCablePercent: number;
}

interface CableSummary {
  trayRouteLengthMetres: number;
  dropAllowanceMetres: number;
  firstPointMetres: number;
  additionalAllowanceMetres: number;
  totalCableMetres: number;
  cableDrums: number;
}

interface ContainmentTakeoffPanelProps {
  takeoff: {
    id: number;
    status: string;
    detectedScale: string | null;
    paperSize: string | null;
    trayRuns: TrayRun[] | null;
    fittingSummary: Record<string, FittingSummaryBySize> | null;
    userInputs: UserInputs | null;
    cableSummary: CableSummary | null;
    drawingNotes: string[] | null;
  };
  onUpdateUserInputs: (inputs: UserInputs) => void;
  onUpdateTrayRuns: (runs: TrayRun[]) => void;
  onVerify: () => void;
  onUnlock: () => void;
  isUpdating?: boolean;
}

// ---- Component ----

export default function ContainmentTakeoffPanel({
  takeoff,
  onUpdateUserInputs,
  onUpdateTrayRuns,
  onVerify,
  onUnlock,
  isUpdating,
}: ContainmentTakeoffPanelProps) {
  const [isEditingRuns, setIsEditingRuns] = useState(false);
  const [isEditingInputs, setIsEditingInputs] = useState(false);
  const [showCableCalc, setShowCableCalc] = useState(true);
  const [editedRuns, setEditedRuns] = useState<TrayRun[]>([]);
  const [editedInputs, setEditedInputs] = useState<UserInputs | null>(null);

  const trayRuns = takeoff.trayRuns || [];
  const fittingSummary = takeoff.fittingSummary || {};
  const userInputs = takeoff.userInputs || {
    trayFilter: "LV",
    trayDuty: "medium",
    extraDropPerFitting: 2.0,
    firstPointRunLength: 15.0,
    numberOfCircuits: 0,
    additionalCablePercent: 10,
  };
  const cableSummary = takeoff.cableSummary;
  const isVerified = takeoff.status === "verified";

  // Totals
  const totalMetres = useMemo(() =>
    trayRuns.reduce((sum, r) => sum + r.lengthMetres, 0),
    [trayRuns]
  );
  const totalLengths = useMemo(() =>
    trayRuns.reduce((sum, r) => sum + r.wholesalerLengths, 0),
    [trayRuns]
  );

  const startEditingRuns = () => {
    setEditedRuns(trayRuns.map(r => ({ ...r })));
    setIsEditingRuns(true);
  };

  const cancelEditingRuns = () => {
    setIsEditingRuns(false);
    setEditedRuns([]);
  };

  const saveRuns = () => {
    onUpdateTrayRuns(editedRuns);
    setIsEditingRuns(false);
  };

  const startEditingInputs = () => {
    setEditedInputs({ ...userInputs });
    setIsEditingInputs(true);
  };

  const cancelEditingInputs = () => {
    setIsEditingInputs(false);
    setEditedInputs(null);
  };

  const saveInputs = () => {
    if (editedInputs) {
      onUpdateUserInputs(editedInputs);
    }
    setIsEditingInputs(false);
  };

  const updateEditedRun = (index: number, field: keyof TrayRun, value: number) => {
    setEditedRuns(prev => {
      const updated = [...prev];
      updated[index] = {
        ...updated[index],
        [field]: value,
        wholesalerLengths: field === "lengthMetres" ? Math.ceil(value / 3) : updated[index].wholesalerLengths,
      };
      return updated;
    });
  };

  const displayRuns = isEditingRuns ? editedRuns : trayRuns;

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cable className="h-5 w-5" style={{ color: brand.teal }} />
          <h3 className="font-semibold text-sm" style={{ color: brand.navy }}>
            Containment Takeoff
          </h3>
          {takeoff.detectedScale && (
            <Badge variant="outline" className="text-[10px]">
              {takeoff.detectedScale} @ {takeoff.paperSize || "?"}
            </Badge>
          )}
          {isVerified && (
            <Badge className="text-[10px] bg-green-100 text-green-700">
              <Lock className="h-3 w-3 mr-1" /> Verified
            </Badge>
          )}
        </div>
        <div className="flex gap-1.5">
          {isVerified ? (
            <Button variant="outline" size="sm" className="h-7 text-xs" onClick={onUnlock}>
              <Unlock className="h-3 w-3 mr-1" /> Unlock
            </Button>
          ) : (
            <Button
              size="sm"
              className="h-7 text-xs text-white"
              style={{ backgroundColor: brand.teal }}
              onClick={onVerify}
            >
              <Check className="h-3 w-3 mr-1" /> Approve
            </Button>
          )}
        </div>
      </div>

      {/* Tray Runs Table */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: brand.bg }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.navy }}>
            Tray Runs
          </span>
          <div className="flex items-center gap-2">
            <span className="text-xs" style={{ color: brand.navyMuted }}>
              {totalMetres.toFixed(1)}m total · {totalLengths} lengths
            </span>
            {!isVerified && !isEditingRuns && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={startEditingRuns}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
            {isEditingRuns && (
              <>
                <Button size="sm" className="h-6 text-xs text-white" style={{ backgroundColor: brand.teal }} onClick={saveRuns} disabled={isUpdating}>
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEditingRuns}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>

        <table className="w-full text-xs">
          <thead>
            <tr style={{ backgroundColor: `${brand.navy}08` }}>
              <th className="text-left px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>Size</th>
              <th className="text-left px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>Type</th>
              <th className="text-right px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>Length (m)</th>
              <th className="text-right px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>Lengths</th>
              <th className="text-right px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>Height (m)</th>
              <th className="text-center px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>T</th>
              <th className="text-center px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>+</th>
              <th className="text-center px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>L</th>
              <th className="text-center px-3 py-1.5 font-medium" style={{ color: brand.navyMuted }}>↓</th>
            </tr>
          </thead>
          <tbody>
            {displayRuns.map((run, i) => {
              const colour = TRAY_COLOURS[run.sizeMillimetres] || { stroke: "#888", label: `${run.sizeMillimetres}mm` };
              return (
                <tr key={run.id} style={{ borderTop: `1px solid ${brand.border}` }}>
                  <td className="px-3 py-2">
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-sm" style={{ backgroundColor: colour.stroke }} />
                      <span className="font-medium" style={{ color: brand.navy }}>{colour.label}</span>
                    </div>
                  </td>
                  <td className="px-3 py-2">
                    <Badge variant="outline" className="text-[10px]">{run.trayType}</Badge>
                  </td>
                  {isEditingRuns ? (
                    <>
                      <td className="px-3 py-1">
                        <Input
                          type="number"
                          value={run.lengthMetres}
                          onChange={e => updateEditedRun(i, "lengthMetres", parseFloat(e.target.value) || 0)}
                          className="h-7 w-20 text-xs text-right ml-auto"
                        />
                      </td>
                      <td className="text-right px-3 py-2 text-xs" style={{ color: brand.navyMuted }}>
                        {Math.ceil(run.lengthMetres / 3)}
                      </td>
                      <td className="px-3 py-1">
                        <Input
                          type="number"
                          value={run.heightMetres}
                          onChange={e => updateEditedRun(i, "heightMetres", parseFloat(e.target.value) || 0)}
                          className="h-7 w-16 text-xs text-right ml-auto"
                        />
                      </td>
                      <td className="px-3 py-1 text-center">
                        <Input
                          type="number"
                          value={run.tPieces}
                          onChange={e => updateEditedRun(i, "tPieces", parseInt(e.target.value) || 0)}
                          className="h-7 w-12 text-xs text-center mx-auto"
                        />
                      </td>
                      <td className="px-3 py-1 text-center">
                        <Input
                          type="number"
                          value={run.crossPieces}
                          onChange={e => updateEditedRun(i, "crossPieces", parseInt(e.target.value) || 0)}
                          className="h-7 w-12 text-xs text-center mx-auto"
                        />
                      </td>
                      <td className="px-3 py-1 text-center">
                        <Input
                          type="number"
                          value={run.bends90}
                          onChange={e => updateEditedRun(i, "bends90", parseInt(e.target.value) || 0)}
                          className="h-7 w-12 text-xs text-center mx-auto"
                        />
                      </td>
                      <td className="px-3 py-1 text-center">
                        <Input
                          type="number"
                          value={run.drops}
                          onChange={e => updateEditedRun(i, "drops", parseInt(e.target.value) || 0)}
                          className="h-7 w-12 text-xs text-center mx-auto"
                        />
                      </td>
                    </>
                  ) : (
                    <>
                      <td className="text-right px-3 py-2 font-semibold" style={{ color: colour.stroke }}>{run.lengthMetres}m</td>
                      <td className="text-right px-3 py-2" style={{ color: brand.navyMuted }}>{run.wholesalerLengths}</td>
                      <td className="text-right px-3 py-2" style={{ color: brand.navyMuted }}>{run.heightMetres}m</td>
                      <td className="text-center px-3 py-2" style={{ color: brand.navy }}>{run.tPieces || "—"}</td>
                      <td className="text-center px-3 py-2" style={{ color: brand.navy }}>{run.crossPieces || "—"}</td>
                      <td className="text-center px-3 py-2" style={{ color: brand.navy }}>{run.bends90 || "—"}</td>
                      <td className="text-center px-3 py-2" style={{ color: brand.navy }}>{run.drops || "—"}</td>
                    </>
                  )}
                </tr>
              );
            })}
          </tbody>
        </table>

        {trayRuns.length === 0 && (
          <div className="px-4 py-6 text-center text-sm" style={{ color: brand.navyMuted }}>
            No tray runs detected. The AI will analyse this drawing when processing completes.
          </div>
        )}
      </div>

      {/* Fittings Summary */}
      {Object.keys(fittingSummary).length > 0 && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
          <div className="px-3 py-2" style={{ backgroundColor: brand.bg }}>
            <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.navy }}>
              Fittings Summary
            </span>
          </div>
          <div className="px-3 py-2 flex flex-wrap gap-3">
            {Object.entries(fittingSummary).map(([size, fittings]) => (
              <div key={size} className="flex items-center gap-2 text-xs">
                <span className="font-medium" style={{ color: brand.navy }}>{size}:</span>
                {fittings.tPieces > 0 && <Badge variant="outline" className="text-[10px]">{fittings.tPieces} T</Badge>}
                {fittings.crossPieces > 0 && <Badge variant="outline" className="text-[10px]">{fittings.crossPieces} +</Badge>}
                {fittings.bends90 > 0 && <Badge variant="outline" className="text-[10px]">{fittings.bends90} L</Badge>}
                {fittings.drops > 0 && <Badge variant="outline" className="text-[10px]">{fittings.drops} ↓</Badge>}
                {fittings.couplers > 0 && <Badge variant="outline" className="text-[10px]">{fittings.couplers} cplr</Badge>}
              </div>
            ))}
          </div>
        </div>
      )}

      {/* User Inputs for Cable Calculation */}
      <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
        <div className="flex items-center justify-between px-3 py-2" style={{ backgroundColor: brand.bg }}>
          <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.navy }}>
            Cable Calculation Inputs
          </span>
          <div className="flex items-center gap-1.5">
            {!isVerified && !isEditingInputs && (
              <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={startEditingInputs}>
                <Pencil className="h-3 w-3 mr-1" /> Edit
              </Button>
            )}
            {isEditingInputs && (
              <>
                <Button size="sm" className="h-6 text-xs text-white" style={{ backgroundColor: brand.teal }} onClick={saveInputs} disabled={isUpdating}>
                  <Save className="h-3 w-3 mr-1" /> Save
                </Button>
                <Button variant="ghost" size="sm" className="h-6 text-xs" onClick={cancelEditingInputs}>
                  <X className="h-3 w-3" />
                </Button>
              </>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 px-3 py-3">
          {isEditingInputs && editedInputs ? (
            <>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Tray Filter</label>
                <select
                  value={editedInputs.trayFilter}
                  onChange={e => setEditedInputs(p => p ? { ...p, trayFilter: e.target.value } : p)}
                  className="w-full h-8 text-xs rounded border px-2 mt-0.5"
                  style={{ borderColor: brand.border, color: brand.navy }}
                >
                  <option value="LV">LV only</option>
                  <option value="FA">FA only</option>
                  <option value="ELV">ELV only</option>
                  <option value="all">All types</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Tray Duty</label>
                <select
                  value={editedInputs.trayDuty}
                  onChange={e => setEditedInputs(p => p ? { ...p, trayDuty: e.target.value } : p)}
                  className="w-full h-8 text-xs rounded border px-2 mt-0.5"
                  style={{ borderColor: brand.border, color: brand.navy }}
                >
                  <option value="light">Light</option>
                  <option value="medium">Medium</option>
                  <option value="heavy">Heavy</option>
                </select>
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Drop per fitting (m)</label>
                <Input
                  type="number"
                  step="0.5"
                  value={editedInputs.extraDropPerFitting}
                  onChange={e => setEditedInputs(p => p ? { ...p, extraDropPerFitting: parseFloat(e.target.value) || 0 } : p)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>First point run (m)</label>
                <Input
                  type="number"
                  step="0.5"
                  value={editedInputs.firstPointRunLength}
                  onChange={e => setEditedInputs(p => p ? { ...p, firstPointRunLength: parseFloat(e.target.value) || 0 } : p)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>No. of circuits</label>
                <Input
                  type="number"
                  value={editedInputs.numberOfCircuits}
                  onChange={e => setEditedInputs(p => p ? { ...p, numberOfCircuits: parseInt(e.target.value) || 0 } : p)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
              <div>
                <label className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Extra cable %</label>
                <Input
                  type="number"
                  value={editedInputs.additionalCablePercent}
                  onChange={e => setEditedInputs(p => p ? { ...p, additionalCablePercent: parseInt(e.target.value) || 0 } : p)}
                  className="h-8 text-xs mt-0.5"
                />
              </div>
            </>
          ) : (
            <>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Tray Filter</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.trayFilter}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Tray Duty</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.trayDuty}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Drop / fitting</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.extraDropPerFitting}m</p>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>First point run</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.firstPointRunLength}m</p>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Circuits</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.numberOfCircuits}</p>
              </div>
              <div>
                <span className="text-[10px] font-medium uppercase" style={{ color: brand.navyMuted }}>Extra cable</span>
                <p className="text-xs font-medium mt-0.5" style={{ color: brand.navy }}>{userInputs.additionalCablePercent}%</p>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Cable Calculation Summary */}
      {cableSummary && (
        <div className="rounded-lg overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
          <button
            className="flex items-center justify-between w-full px-3 py-2 text-left"
            style={{ backgroundColor: brand.bg }}
            onClick={() => setShowCableCalc(!showCableCalc)}
          >
            <div className="flex items-center gap-2">
              <Zap className="h-4 w-4" style={{ color: "#f59e0b" }} />
              <span className="text-xs font-semibold uppercase tracking-wide" style={{ color: brand.navy }}>
                Cable Estimate
              </span>
              <Badge className="text-[10px] font-bold" style={{ backgroundColor: `${brand.teal}15`, color: brand.teal }}>
                {cableSummary.totalCableMetres}m · {cableSummary.cableDrums} drums
              </Badge>
            </div>
            {showCableCalc ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>

          {showCableCalc && (
            <div className="px-3 py-3 space-y-1.5">
              <div className="flex justify-between text-xs">
                <span style={{ color: brand.navyMuted }}>Tray route cable</span>
                <span style={{ color: brand.navy }}>{cableSummary.trayRouteLengthMetres}m</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: brand.navyMuted }}>Drop allowance ({takeoff.userInputs?.extraDropPerFitting || 2}m × drops)</span>
                <span style={{ color: brand.navy }}>{cableSummary.dropAllowanceMetres}m</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: brand.navyMuted }}>First point runs ({takeoff.userInputs?.numberOfCircuits || 0} × {takeoff.userInputs?.firstPointRunLength || 15}m)</span>
                <span style={{ color: brand.navy }}>{cableSummary.firstPointMetres}m</span>
              </div>
              <div className="flex justify-between text-xs">
                <span style={{ color: brand.navyMuted }}>Additional allowance ({takeoff.userInputs?.additionalCablePercent || 10}%)</span>
                <span style={{ color: brand.navy }}>{cableSummary.additionalAllowanceMetres}m</span>
              </div>
              <div className="flex justify-between text-xs font-bold pt-1.5" style={{ borderTop: `1px solid ${brand.border}` }}>
                <span style={{ color: brand.navy }}>Total cable required</span>
                <span style={{ color: brand.teal }}>{cableSummary.totalCableMetres}m ({cableSummary.cableDrums} × 100m drums)</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Drawing Notes */}
      {takeoff.drawingNotes && takeoff.drawingNotes.length > 0 && (
        <div className="text-[10px] space-y-0.5 px-1" style={{ color: brand.navyMuted }}>
          {takeoff.drawingNotes.map((note, i) => (
            <p key={i}>· {note}</p>
          ))}
        </div>
      )}
    </div>
  );
}
