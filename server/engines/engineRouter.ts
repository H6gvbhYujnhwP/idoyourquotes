/**
 * IdoYourQuotes — Engine Router
 *
 * selectEngine() maps a quote's tradePreset to the correct sector engine.
 * This is the ONLY place that makes routing decisions. All other code calls
 * this function and receives a SectorEngine — it never knows which engine ran.
 *
 * Routing table (matches Section 3.2 of the Sector Engine Modularisation Roadmap):
 *
 *   Tier 1 — GeneralEngine (no drawing intelligence needed):
 *     commercial_cleaning, building_maintenance, pest_control, scaffolding,
 *     painting, it_services, custom, and any unrecognised sector (catch-all)
 *
 *   Tier 2 — DrawingEngine (drawing-intelligence sectors, no specialist pipeline):
 *     general_construction, bathrooms_kitchens, windows_doors, roofing,
 *     joinery, fire_protection, insulation_retrofit, plumbing, hvac,
 *     construction_steel, metalwork_bespoke, groundworks, solar_ev,
 *     telecoms_cabling, fire_security, lifts_access, mechanical_fabrication
 *
 *   Tier 3 — ElectricalEngine (specialist engine — Phase 5 COMPLETE):
 *     electrical
 *
 * GUARDRAIL G11: No engine may import from another engine file.
 * This router is the ONLY file that imports from multiple engine files.
 */

import { GeneralEngine } from "./generalEngine";
import { DrawingEngine } from "./drawingEngine";
import { ElectricalEngine } from "./electricalEngine";
import type { SectorEngine } from "./types";

// ─── Drawing-intelligence sectors (Tier 2) ────────────────────────────────────
// These sectors may receive structured takeoff counts or drawing analysis in
// their processedContent. DrawingEngine is aware of this and handles it.
//
// Note: 'electrical' is NOT in this set — it routes to ElectricalEngine (Tier 3).
const DRAWING_SECTORS = new Set([
  "general_construction",
  "bathrooms_kitchens",
  "windows_doors",
  "roofing",
  "joinery",
  "fire_protection",
  "insulation_retrofit",
  "plumbing",
  "hvac",
  "construction_steel",
  "metalwork_bespoke",
  "groundworks",
  "solar_ev",
  "telecoms_cabling",
  "fire_security",
  "lifts_access",
  "mechanical_fabrication",
]);

// ─── Selector ─────────────────────────────────────────────────────────────────

/**
 * selectEngine — returns the correct SectorEngine for a given tradePreset.
 *
 * @param tradePreset - The quote's tradePreset value (e.g. "electrical", "it_services")
 *                      or the user's defaultTradeSector as a fallback.
 *                      Pass null/undefined to get the GeneralEngine catch-all.
 *
 * @returns A SectorEngine instance. The caller should call engine.analyse(input).
 *
 * IMPORTANT: The returned engine is a new instance each time. Engines are
 * stateless — all state is in EngineInput.
 */
export function selectEngine(tradePreset?: string | null): SectorEngine {
  if (!tradePreset) {
    return new GeneralEngine(null);
  }

  // Phase 5 — ElectricalEngine (Tier 3)
  // Gated strictly on tradePreset === "electrical". No other sector reaches this branch.
  if (tradePreset === "electrical") {
    return new ElectricalEngine();
  }

  if (DRAWING_SECTORS.has(tradePreset)) {
    return new DrawingEngine(tradePreset);
  }

  // Tier 1 catch-all — GeneralEngine handles all unrecognised sectors too
  return new GeneralEngine(tradePreset);
}

export { DRAWING_SECTORS };
