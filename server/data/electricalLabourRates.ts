/**
 * electricalLabourRates.ts
 * Server-side authoritative Spon's UK labour rate data.
 * Source: Spon's Construction Resource Handbook (Bryan Spain), M&E 2024.
 * Grade: LQ (Qualified Electrician).
 *
 * Client-side mirror lives in client/src/components/electrical/ElectricalQDS.tsx
 * (inlined to avoid cross-bundle imports). Keep both in sync when updating rates.
 */

export type SponsUnit = "each" | "m";

export interface SponsMatch {
  hoursPerUnit: number;
  unit: SponsUnit;
}

interface SponsRule {
  /** All keywords must appear in the lowercase description */
  keywords: string[];
  hrs: number;
  unit: SponsUnit;
}

// Rules are evaluated top-to-bottom; first match wins.
// More specific rules must come before general fallbacks.
const SPONS_RULES: SponsRule[] = [
  // ── Cable Tray (hrs/m) ──────────────────────────────────────────────────────
  { keywords: ["600mm", "tray"],            hrs: 0.70, unit: "m" },
  { keywords: ["450mm", "tray"],            hrs: 0.57, unit: "m" },
  { keywords: ["300mm", "tray"],            hrs: 0.46, unit: "m" },
  { keywords: ["225mm", "tray"],            hrs: 0.40, unit: "m" },
  { keywords: ["150mm", "tray"],            hrs: 0.34, unit: "m" },
  { keywords: ["100mm", "tray"],            hrs: 0.30, unit: "m" },
  { keywords: ["75mm",  "tray"],            hrs: 0.28, unit: "m" },
  { keywords: ["50mm",  "tray"],            hrs: 0.25, unit: "m" },
  { keywords: ["cable tray"],               hrs: 0.34, unit: "m" }, // fallback: 150mm

  // ── Trunking (hrs/m) ───────────────────────────────────────────────────────
  { keywords: ["150x150", "trunking"],      hrs: 0.77, unit: "m" },
  { keywords: ["100x100", "trunking"],      hrs: 0.60, unit: "m" },
  { keywords: ["75x75",   "trunking"],      hrs: 0.50, unit: "m" },
  { keywords: ["50x50",   "trunking"],      hrs: 0.41, unit: "m" },
  { keywords: ["trunking"],                 hrs: 0.60, unit: "m" }, // fallback: 100x100

  // ── Steel Conduit (hrs/m) ──────────────────────────────────────────────────
  { keywords: ["32mm", "conduit"],          hrs: 1.00, unit: "m" },
  { keywords: ["25mm", "conduit"],          hrs: 0.75, unit: "m" },
  { keywords: ["20mm", "conduit"],          hrs: 0.65, unit: "m" },
  { keywords: ["conduit"],                  hrs: 0.65, unit: "m" }, // fallback: 20mm surface

  // ── Unistrut / Supports (hrs/unit) ────────────────────────────────────────
  { keywords: ["unistrut", "fix"],          hrs: 1.07, unit: "each" },
  { keywords: ["unistrut"],                 hrs: 0.60, unit: "each" },

  // ── Luminaires — specific first ────────────────────────────────────────────
  { keywords: ["ip65", "emergency"],        hrs: 0.95, unit: "each" },
  { keywords: ["ip65", "bulkhead"],         hrs: 1.64, unit: "each" },
  { keywords: ["ip65", "batten"],           hrs: 1.64, unit: "each" },
  { keywords: ["emergency", "bulkhead"],    hrs: 0.95, unit: "each" },
  { keywords: ["emergency"],               hrs: 0.95, unit: "each" },
  { keywords: ["high bay"],                 hrs: 1.26, unit: "each" },
  { keywords: ["floodlight"],              hrs: 1.98, unit: "each" },
  { keywords: ["recessed", "600"],          hrs: 1.31, unit: "each" }, // 600x600 modular
  { keywords: ["recessed", "downlight"],    hrs: 0.75, unit: "each" },
  { keywords: ["recessed", "wall wash"],    hrs: 0.75, unit: "each" },
  { keywords: ["downlight"],               hrs: 0.75, unit: "each" },
  { keywords: ["twin", "batten"],           hrs: 1.35, unit: "each" },
  { keywords: ["twin", "fluorescent"],      hrs: 1.35, unit: "each" },
  { keywords: ["batten"],                  hrs: 1.05, unit: "each" },
  { keywords: ["fluorescent"],             hrs: 1.05, unit: "each" },
  { keywords: ["led", "panel"],             hrs: 1.31, unit: "each" },

  // ── Distribution Boards / Consumer Units (hrs/unit) ───────────────────────
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

  // ── Sockets & Accessories (hrs/unit, including back box) ──────────────────
  { keywords: ["fcu"],                     hrs: 0.50, unit: "each" },
  { keywords: ["fused connection"],        hrs: 0.50, unit: "each" },
  { keywords: ["4-gang", "switch"],        hrs: 0.78, unit: "each" },
  { keywords: ["3-gang", "switch"],        hrs: 0.68, unit: "each" },
  { keywords: ["2-gang", "socket"],        hrs: 0.50, unit: "each" },
  { keywords: ["2-gang", "switch"],        hrs: 0.50, unit: "each" },
  { keywords: ["1-gang", "socket"],        hrs: 0.55, unit: "each" },
  { keywords: ["1-gang", "switch"],        hrs: 0.40, unit: "each" },
  { keywords: ["light switch"],            hrs: 0.40, unit: "each" },
  { keywords: ["socket"],                  hrs: 0.55, unit: "each" }, // fallback: 1-gang
  { keywords: ["telephone", "outlet"],     hrs: 0.40, unit: "each" },
  { keywords: ["data", "outlet"],          hrs: 0.40, unit: "each" },
  { keywords: ["tv", "outlet"],            hrs: 0.40, unit: "each" },

  // ── Cable — T&E clipped direct (hrs/m) ────────────────────────────────────
  { keywords: ["16mm", "t&e"],             hrs: 0.30, unit: "m" },
  { keywords: ["10mm", "t&e"],             hrs: 0.26, unit: "m" },
  { keywords: ["6mm",  "t&e"],             hrs: 0.22, unit: "m" },
  { keywords: ["4mm",  "t&e"],             hrs: 0.21, unit: "m" },
  { keywords: ["2.5mm", "t&e"],            hrs: 0.19, unit: "m" },
  { keywords: ["1.5mm", "t&e"],            hrs: 0.18, unit: "m" },
  { keywords: ["twin.*earth"],             hrs: 0.19, unit: "m" }, // fallback: 2.5mm

  // ── SWA Cable clipped to tray (hrs/m) ─────────────────────────────────────
  { keywords: ["16mm", "swa", "4-core"],   hrs: 0.46, unit: "m" },
  { keywords: ["16mm", "swa", "3-core"],   hrs: 0.40, unit: "m" },
  { keywords: ["16mm", "swa"],             hrs: 0.37, unit: "m" },
  { keywords: ["10mm", "swa"],             hrs: 0.37, unit: "m" },
  { keywords: ["swa"],                     hrs: 0.34, unit: "m" }, // fallback
];

/**
 * Look up the Spon's labour rate for a given item description.
 * Returns null if no rate can be matched (user must fill in manually).
 */
export function matchSponsRate(description: string): SponsMatch | null {
  const d = description.toLowerCase();
  for (const rule of SPONS_RULES) {
    if (rule.keywords.every(kw => d.includes(kw))) {
      return { hoursPerUnit: rule.hrs, unit: rule.unit };
    }
  }
  return null;
}

/**
 * Productivity multipliers (user-selectable in QDS).
 */
export const PRODUCTIVITY_MULTIPLIERS = [
  { label: "New build / open access", value: 0.85 },
  { label: "Standard conditions",     value: 1.00 },
  { label: "Refurb / occupied",       value: 1.25 },
  { label: "Working at height (>3m)", value: 1.20 },
] as const;

export type ProductivityMultiplier = typeof PRODUCTIVITY_MULTIPLIERS[number]["value"];
