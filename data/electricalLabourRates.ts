/**
 * UK Electrical Installation Labour Constants
 * Source: Spon's Construction Resource Handbook (Bryan Spain, E&FN Spon / Taylor & Francis)
 * Verified against: Spon's Mechanical and Electrical Services Price Book 2024 (AECOM / CRC Press)
 * Grade: LQ — Qualified Electrician (JIB graded)
 * Standard: BS 7671 UK wiring methods
 *
 * All values in decimal hours per unit.
 * These are UK-specific figures and supersede any US-based (Durand Associates) data.
 */

// ─── Cable Tray — Straight Runs (hrs/m) ───────────────────────────────────────

export const CABLE_TRAY_STRAIGHT: Record<number, number> = {
  50: 0.25,
  75: 0.28,
  100: 0.30,
  150: 0.34,
  225: 0.40,
  300: 0.46,
  450: 0.57,
  600: 0.70,
  750: 0.80,
  900: 0.92,
};

// ─── Cable Tray Fittings (hrs/unit) ───────────────────────────────────────────

export const CABLE_TRAY_FLAT_BEND: Record<number, number> = {
  50: 0.25, 75: 0.28, 100: 0.28, 150: 0.30,
  225: 0.32, 300: 0.36, 450: 0.43, 600: 0.50,
  750: 0.60, 900: 0.75,
};

export const CABLE_TRAY_TEE: Record<number, number> = {
  50: 0.25, 75: 0.25, 100: 0.28, 150: 0.30,
  225: 0.32, 300: 0.36, 450: 0.43, 600: 0.50,
  750: 0.75, 900: 1.05,
};

export const CABLE_TRAY_RISER: Record<number, number> = {
  50: 0.38, 75: 0.40, 100: 0.48, 150: 0.51,
  225: 0.60, 300: 0.69, 450: 0.86, 600: 1.05,
  750: 1.25, 900: 1.38,
};

export const CABLE_TRAY_CROSSOVER: Record<number, number> = {
  50: 0.31, 75: 0.31, 100: 0.35, 150: 0.38,
  225: 0.40, 300: 0.45, 450: 0.54, 600: 0.63,
  750: 0.94, 900: 1.31,
};

/** Returns the closest tray width key from the lookup tables */
export function nearestTrayWidth(widthMm: number): number {
  const widths = [50, 75, 100, 150, 225, 300, 450, 600, 750, 900];
  return widths.reduce((prev, curr) =>
    Math.abs(curr - widthMm) < Math.abs(prev - widthMm) ? curr : prev
  );
}

// ─── Steel Trunking — Single Compartment (hrs/m) ──────────────────────────────

export const TRUNKING_SINGLE: Record<string, number> = {
  "50x50": 0.41, "75x75": 0.50, "100x75": 0.55,
  "100x100": 0.60, "150x100": 0.70, "150x150": 0.77,
};

export const TRUNKING_TWIN: Record<string, number> = {
  "50x50": 0.46, "75x75": 0.55, "100x75": 0.60,
  "100x100": 0.65, "150x100": 0.75, "150x150": 0.82,
};

export const TRUNKING_TRIPLE: Record<string, number> = {
  "50x50": 0.51, "75x75": 0.60, "100x75": 0.65,
  "100x100": 0.70, "150x100": 0.80, "150x150": 0.87,
};

// ─── Steel Conduit Surface Fixed (hrs/m) ──────────────────────────────────────

export const CONDUIT_STEEL_SURFACE: Record<number, number> = {
  20: 0.65, 25: 0.75, 32: 1.00,
};

export const CONDUIT_STEEL_CHASE: Record<number, number> = {
  20: 0.50, 25: 0.60, 32: 0.70,
};

export const CONDUIT_PVC_SURFACE: Record<number, number> = {
  16: 0.60, 20: 0.60, 25: 0.60, 32: 0.95,
};

// ─── Socket Outlets and Switches (hrs/unit, including back box) ───────────────

export const ACCESSORIES: Record<string, number> = {
  "socket_1gang":     0.55,  // 13A 1-gang switched socket outlet
  "socket_2gang":     0.50,  // 13A 2-gang switched socket outlet
  "fcu":              0.50,  // 13A DP switch fused connection unit
  "switch_1gang":     0.40,  // 1-gang light switch
  "switch_2gang":     0.50,  // 2-gang light switch
  "switch_3gang":     0.68,  // 3-gang light switch
  "switch_4gang":     0.78,  // 4-gang light switch
  "switch_6gang":     1.18,  // 6-gang light switch
  "data_outlet":      0.40,  // telephone / data / TV outlet
  "rotary_isolator":  0.50,  // rotary isolator (estimated, not in Spon's directly)
  "dp_switch_20a":    0.50,  // 20A DP switch
};

// ─── Luminaires (hrs/unit, fixed to background or suspended) ──────────────────

export const LUMINAIRES: Record<string, number> = {
  "batten_surface_1200":      1.05,  // LED/fluorescent batten 1200–1500mm surface
  "batten_surface_twin":      1.35,  // twin batten surface
  "recessed_600x600":         1.31,  // recessed modular 600x600mm false ceiling
  "recessed_downlight":       0.75,  // recessed LED wall washer / downlight
  "bulkhead_ip65_1200":       1.64,  // IP65 waterproof bulkhead/batten 1200mm
  "emergency_bulkhead":       0.95,  // emergency luminaire 8W non-maintained
  "high_bay":                 1.26,  // high bay suspended with chains/hooks
  "floodlight_wall":          1.98,  // floodlight wall mounted 250–400W
  "pir_detector":             0.40,  // PIR presence/infrared detector (estimated)
};

// ─── Distribution Boards / Consumer Units (hrs/unit) ─────────────────────────

export const DISTRIBUTION_BOARDS: Record<string, number> = {
  "cu_4way_spn":    1.35,  // 4-way SP&N single phase
  "cu_8way_spn":    1.89,  // 8-way SP&N single phase
  "cu_12way_spn":   2.30,  // 12-way SP&N single phase
  "cu_18way_spn":   2.70,  // 18-way SP&N single phase
  "db_4way_tpn":    2.97,  // 4-way TP&N three phase
  "db_12way_tpn":   3.65,  // 12-way TP&N three phase
  "db_18way_tpn":   4.32,  // 18-way TP&N three phase
  "mcb_rcbo":       0.20,  // MCB/RCBO per device (mid-range estimate)
};

/** Returns the DB installation hours for a given number of ways */
export function distributionBoardHours(ways: number, phase: "single" | "three"): number {
  if (phase === "single") {
    if (ways <= 4) return 1.35;
    if (ways <= 8) return 1.89;
    if (ways <= 12) return 2.30;
    return 2.70;
  } else {
    if (ways <= 4) return 2.97;
    if (ways <= 12) return 3.65;
    return 4.32;
  }
}

// ─── Twin and Earth Cable Clipped Direct (hrs/m) ──────────────────────────────

export const CABLE_TE_2CORE: Record<string, number> = {
  "1.5": 0.18, "2.5": 0.19, "4.0": 0.21,
  "6.0": 0.22, "10.0": 0.26, "16.0": 0.30,
};

export const CABLE_TE_3CORE: Record<string, number> = {
  "1.5": 0.20, "2.5": 0.22, "4.0": 0.23,
  "6.0": 0.27, "10.0": 0.30, "16.0": 0.33,
};

// ─── SWA Cable Clipped to Tray (hrs/m) ────────────────────────────────────────

export const CABLE_SWA_2CORE: Record<string, number> = {
  "1.5": 0.32, "2.5": 0.32, "4.0": 0.34,
  "6.0": 0.34, "10.0": 0.37, "16.0": 0.37,
};

export const CABLE_SWA_3CORE: Record<string, number> = {
  "1.5": 0.32, "2.5": 0.32, "4.0": 0.34,
  "6.0": 0.34, "10.0": 0.38, "16.0": 0.40,
};

export const CABLE_SWA_4CORE: Record<string, number> = {
  "1.5": 0.32, "2.5": 0.34, "4.0": 0.34,
  "6.0": 0.37, "10.0": 0.43, "16.0": 0.46,
};

// ─── SWA Gland Terminations (hrs/unit) ────────────────────────────────────────

export const SWA_GLAND_2CORE: Record<string, number> = {
  "1.5": 0.66, "2.5": 0.66, "4.0": 0.88,
  "6.0": 0.99, "10.0": 1.19, "16.0": 1.39,
};

export const SWA_GLAND_3CORE: Record<string, number> = {
  "1.5": 0.75, "2.5": 0.75, "4.0": 0.75,
  "6.0": 0.92, "10.0": 1.09, "16.0": 1.39,
};

export const SWA_GLAND_4CORE: Record<string, number> = {
  "1.5": 0.83, "2.5": 0.83, "4.0": 1.00,
  "6.0": 1.00, "10.0": 1.19, "16.0": 1.59,
};

// ─── Fixings and Supports (hrs/unit) ─────────────────────────────────────────

export const FIXINGS: Record<string, number> = {
  "unistrut_cut":       0.60,
  "unistrut_fixed":     1.07,
  "anchor_10mm":        0.15,
  "anchor_12mm":        0.17,
  "anchor_16mm":        0.21,
  "fixing_single":      0.18,
  "fixing_double":      0.23,
  "fixing_triple":      0.40,
};

// ─── Productivity Multipliers ─────────────────────────────────────────────────

export const PRODUCTIVITY: Record<string, number> = {
  "new_build":      0.85,  // new build / open access
  "standard":       1.00,  // standard conditions (default)
  "refurb":         1.25,  // refurb / occupied premises
  "height_3m":      1.20,  // working at height above 3m
};

export type ProductivityCondition = keyof typeof PRODUCTIVITY;

// ─── Helper: resolve item type to labour hours ────────────────────────────────

/**
 * Given a symbol description string, returns the best-match labour hours per unit.
 * Used by ElectricalEngine to auto-populate installTimeHrs on QDS items.
 */
export function resolveLabourHours(description: string): number | null {
  const d = description.toLowerCase();

  // Luminaires
  if (d.includes("high bay")) return LUMINAIRES["high_bay"];
  if (d.includes("floodlight")) return LUMINAIRES["floodlight_wall"];
  if (d.includes("emergency") && (d.includes("exit") || d.includes("luminaire") || d.includes("bulkhead"))) return LUMINAIRES["emergency_bulkhead"];
  if (d.includes("ip65") && (d.includes("bulkhead") || d.includes("batten") || d.includes("waterproof"))) return LUMINAIRES["bulkhead_ip65_1200"];
  if (d.includes("recessed") && (d.includes("downlight") || d.includes("modular") || d.includes("600x600"))) return LUMINAIRES["recessed_600x600"];
  if (d.includes("downlight") || d.includes("wall washer")) return LUMINAIRES["recessed_downlight"];
  if (d.includes("twin") && d.includes("batten")) return LUMINAIRES["batten_surface_twin"];
  if (d.includes("batten") || d.includes("linear") || d.includes("fluorescent")) return LUMINAIRES["batten_surface_1200"];
  if (d.includes("pir") || d.includes("presence") || d.includes("infrared detector")) return LUMINAIRES["pir_detector"];

  // Accessories
  if (d.includes("fused connection") || d.includes("fcu")) return ACCESSORIES["fcu"];
  if (d.includes("2-gang") && d.includes("socket")) return ACCESSORIES["socket_2gang"];
  if (d.includes("socket") || d.includes("outlet")) return ACCESSORIES["socket_1gang"];
  if (d.includes("rotary isolator")) return ACCESSORIES["rotary_isolator"];
  if (d.includes("6-gang") && d.includes("switch")) return ACCESSORIES["switch_6gang"];
  if (d.includes("4-gang") && d.includes("switch")) return ACCESSORIES["switch_4gang"];
  if (d.includes("3-gang") && d.includes("switch")) return ACCESSORIES["switch_3gang"];
  if (d.includes("2-gang") && d.includes("switch")) return ACCESSORIES["switch_2gang"];
  if (d.includes("switch") || d.includes("dp switch")) return ACCESSORIES["switch_1gang"];
  if (d.includes("data") || d.includes("rj45") || d.includes("telephone")) return ACCESSORIES["data_outlet"];

  return null; // no match — user must enter manually
}
