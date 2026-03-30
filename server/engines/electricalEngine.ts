/**
 * electricalEngine.ts — Tier 3 Sector Engine (Phase 5)
 *
 * Two exports:
 *
 * 1. ElectricalEngine (class) — implements SectorEngine for parseDictationSummary.
 *    Reads ELECTRICAL TAKEOFF blocks from processedContent, applies Spon's M&E 2024
 *    labour rates, and returns a structured EngineOutput.
 *
 * 2. generateElectricalLineItems (function) — called by generateDraft in routers.ts
 *    when qdsSummaryJson._type === "electrical". Converts ElectricalQDSData (rows,
 *    plantHire, preliminaries, firstPoints, sundries) into the flat line-item array
 *    that createLineItem expects. Calculates phases (40/40/20%) and timeline.
 *
 * GUARDRAIL G11: This file may only import from:
 *   - ./types   (EngineInput / EngineOutput / SectorEngine)
 *   - ../data/electricalLabourRates  (Spon's lookup, PRODUCTIVITY_MULTIPLIERS)
 * Never imports from generalEngine.ts or drawingEngine.ts.
 *
 * ISOLATION RULE: Changes to this file must not affect any of the 25 other sectors.
 * The electrical branch in engineRouter.ts and generateDraft is gated strictly on
 * tradePreset === "electrical" / _type === "electrical".
 */

import type { SectorEngine, EngineInput, EngineOutput } from "./types";
import { matchSponsRate } from "../data/electricalLabourRates";

// ─── ELECTRICAL TAKEOFF block parser ─────────────────────────────────────────
//
// processedContent format written by electricalTakeoff.ts:
//
//   ELECTRICAL TAKEOFF — Drawing: A1101-KCL-00-00-D-E-2501
//   Symbol: A1 | Description: IP65 LED Recessed Downlight | Count: 24 | Status: matched
//   Symbol: B1 | Description: IP65 Wall Mounted LED Bulkhead | Count: 8 | Status: matched
//   Symbol: CD | Description: Engineer initials (auto-excluded) | Count: 0 | Status: excluded
//   ...

interface ParsedTakeoffRow {
  code: string;
  description: string;
  count: number;
  status: string;
}

interface ParsedTakeoff {
  drawingName: string;
  rows: ParsedTakeoffRow[];
}

function parseTakeoffBlocks(processedContent: string): ParsedTakeoff[] {
  const takeoffs: ParsedTakeoff[] = [];

  // Split on the drawing-header marker (handles em-dash, en-dash, or hyphen)
  const sections = processedContent.split(
    /ELECTRICAL TAKEOFF\s*[—–\-]+\s*Drawing:\s*/i
  );

  for (let i = 1; i < sections.length; i++) {
    const section = sections[i];
    const drawingName = (section.split("\n")[0] || "").trim() || `Drawing ${i}`;
    const rows: ParsedTakeoffRow[] = [];

    // Parse "Symbol: CODE | Description: TEXT | Count: N | Status: STATUS" lines
    const symbolRe =
      /Symbol:\s*([^|]+)\s*\|\s*Description:\s*([^|]+)\s*\|\s*Count:\s*(\d+)\s*\|\s*Status:\s*([^\n\r]+)/gi;
    let m: RegExpExecArray | null;
    while ((m = symbolRe.exec(section)) !== null) {
      const status = m[4].trim().toLowerCase();
      if (status === "excluded") continue;
      const count = parseInt(m[3], 10) || 0;
      if (count <= 0) continue;
      rows.push({
        code: m[1].trim(),
        description: m[2].trim(),
        count,
        status,
      });
    }

    if (rows.length > 0) {
      takeoffs.push({ drawingName, rows });
    }
  }

  return takeoffs;
}

// ─── ElectricalEngine — SectorEngine implementation ───────────────────────────

export class ElectricalEngine implements SectorEngine {
  async analyse(input: EngineInput): Promise<EngineOutput> {
    try {
      // Belt-and-braces: filter reference-only inputs (legend PDFs)
      const activeInputs = input.inputRecords.filter(
        (r) => !r.mimeType?.includes(";reference=true")
      );

      const allContent = activeInputs
        .map((r) => r.processedContent ?? "")
        .filter(Boolean)
        .join("\n\n");

      if (!allContent.trim()) {
        return this.empty(
          "No processed content found. Upload electrical drawings and wait for takeoff to complete."
        );
      }

      const takeoffs = parseTakeoffBlocks(allContent);

      if (takeoffs.length === 0) {
        return this.empty(
          "No ELECTRICAL TAKEOFF blocks found in processed content. " +
            "Ensure drawings have been analysed via the Takeoff tab."
        );
      }

      // ── Aggregate rows across all drawings ────────────────────────────────
      // Key = "code:desc_lowercase" to de-duplicate across drawings
      const aggregated = new Map<
        string,
        { item: string; qty: number }
      >();

      for (const takeoff of takeoffs) {
        for (const row of takeoff.rows) {
          const key = `${row.code.toLowerCase()}:${row.description.toLowerCase()}`;
          const existing = aggregated.get(key);
          if (existing) {
            existing.qty += row.count;
          } else {
            aggregated.set(key, { item: row.description, qty: row.count });
          }
        }
      }

      // ── Build EngineOutput materials ──────────────────────────────────────
      const materials: EngineOutput["materials"] = [];
      let totalLabourHours = 0;
      const noRateItems: string[] = [];

      for (const { item, qty } of aggregated.values()) {
        const spons = matchSponsRate(item);
        const hoursPerUnit = spons?.hoursPerUnit ?? 0;
        const unit = spons?.unit ?? "each";
        totalLabourHours += qty * hoursPerUnit;
        if (!spons) noRateItems.push(item);

        materials.push({
          item,
          quantity: qty,
          unitPrice: 0,       // Supply price unknown — user fills in QDS
          unit,
          description: `Supply and install ${item}`,
          pricingType: "standard",
          estimated: true,
        });
      }

      // ── Labour summary (aggregate hours) ─────────────────────────────────
      const labourEntries: EngineOutput["labour"] =
        totalLabourHours > 0
          ? [
              {
                role: "Electrical Installation Labour",
                quantity: Math.round(totalLabourHours * 10) / 10,
                duration: "hrs",
              },
            ]
          : [];

      const drawingList = takeoffs.map((t) => t.drawingName).join(", ");
      const teamSize = 2;
      const weeksTotal = Math.ceil(totalLabourHours / (teamSize * 40));

      const riskNotes =
        noRateItems.length > 0
          ? `No Spon's rate found for: ${noRateItems.slice(0, 5).join(", ")}${
              noRateItems.length > 5 ? ` (+${noRateItems.length - 5} more)` : ""
            }. Hours for these items are 0 — enter manually in the QDS tab.`
          : null;

      return {
        clientName: null,
        clientEmail: null,
        clientPhone: null,
        jobDescription:
          `Electrical installation across ${takeoffs.length} drawing(s): ${drawingList}. ` +
          `${aggregated.size} symbol type(s) identified. ` +
          `Estimated labour: ${Math.round(totalLabourHours * 10) / 10} hrs ` +
          `(~${weeksTotal} week(s) @ ${teamSize} operatives).`,
        materials,
        labour: labourEntries,
        markup: null,
        sundries: null,
        contingency: null,
        notes:
          "Labour hours estimated from Spon's M&E 2024 rates (grade LQ). " +
          "Supply prices are zero — enter in QDS tab. " +
          "Review quantities and adjust for site conditions before generating quote.",
        isTradeRelevant: true,
        engineUsed: "ElectricalEngine",
        engineVersion: "1.0.0",
        riskNotes,
      };
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      return this.empty(`ElectricalEngine error: ${msg}`);
    }
  }

  private empty(riskNotes: string): EngineOutput {
    return {
      clientName: null,
      clientEmail: null,
      clientPhone: null,
      jobDescription: "",
      materials: [],
      labour: [],
      markup: null,
      sundries: null,
      contingency: null,
      notes: null,
      isTradeRelevant: true,
      engineUsed: "ElectricalEngine",
      engineVersion: "1.0.0",
      riskNotes,
    };
  }
}

// ─── generateElectricalLineItems ─────────────────────────────────────────────
//
// Called by generateDraft in routers.ts when qdsSummaryJson._type === "electrical".
// Converts ElectricalQDSData into the flat line-item array that createLineItem uses.
//
// Output shape matches what generateDraft already expects for qdsLineItems:
//   { description, quantity, unit, rate, costPrice?, pricingType, sortOrder }

export interface ElectricalLineItem {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  costPrice?: string | null;
  pricingType: string;
  sortOrder: number;
}

export function generateElectricalLineItems(
  qds: any,
  startSortIdx: number = 0
): ElectricalLineItem[] {
  const items: ElectricalLineItem[] = [];
  let sortIdx = startSortIdx;

  const labourRate = Number(qds.labourRate) || 60;
  const multiplier = Number(qds.productivityMultiplier) || 1.0;
  const rows: any[] = Array.isArray(qds.rows) ? qds.rows : [];

  // ── 1. Supply line items (one per QDS row) ────────────────────────────────
  // Each row in the QDS becomes a supply-only line item. Labour is broken out
  // below as phase-grouped totals (more readable on tender documents).
  for (const row of rows) {
    const desc = String(row.description || "").trim();
    if (!desc) continue;
    const qty = Number(row.qty) || 0;
    if (qty <= 0) continue;

    // Include symbol code prefix for traceability
    const codePrefix = row.code ? `[${row.code}] ` : "";
    const sectionSuffix =
      row.section === "containment"
        ? " — containment"
        : row.section === "cabling"
        ? " — cabling"
        : "";

    items.push({
      description: `${codePrefix}${desc}${sectionSuffix} — supply`,
      quantity: qty,
      unit: String(row.unit || "each"),
      rate: Number(row.supplyPrice) || 0,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });
  }

  // ── 2. Phase-based labour ─────────────────────────────────────────────────
  // Total hours across all rows, adjusted by productivity multiplier.
  // Split: First fix 40% | Second fix 40% | Testing & Commissioning 20%
  const totalHours = rows.reduce((sum: number, r: any) => {
    const qty = Number(r.qty) || 0;
    const hrs = Number(r.hoursPerUnit) || 0;
    return sum + qty * hrs * multiplier;
  }, 0);

  if (totalHours > 0) {
    const round1 = (n: number) => Math.round(n * 10) / 10;
    const firstFixHrs  = round1(totalHours * 0.4);
    const secondFixHrs = round1(totalHours * 0.4);
    const testingHrs   = round1(totalHours * 0.2);

    items.push({
      description: `Phase 1 — First Fix Labour`,
      quantity: firstFixHrs,
      unit: "hrs",
      rate: labourRate,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });

    items.push({
      description: `Phase 2 — Second Fix Labour`,
      quantity: secondFixHrs,
      unit: "hrs",
      rate: labourRate,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });

    items.push({
      description: `Phase 3 — Testing & Commissioning`,
      quantity: testingHrs,
      unit: "hrs",
      rate: labourRate,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });

    // Timeline informational note (zero-cost)
    const teamSize = 2;
    const totalWeeks  = Math.max(1, Math.ceil(totalHours / (teamSize * 40)));
    const ph1Weeks    = Math.max(1, Math.ceil(firstFixHrs / (teamSize * 40)));
    const ph2Weeks    = Math.max(1, Math.ceil(secondFixHrs / (teamSize * 40)));
    const ph3Weeks    = Math.max(1, Math.ceil(testingHrs / (teamSize * 40)));

    items.push({
      description:
        `Programme: ${totalWeeks}w total @ ${teamSize} operatives ` +
        `(Phase 1: ${ph1Weeks}w, Phase 2: ${ph2Weeks}w, T&C: ${ph3Weeks}w)`,
      quantity: 0,
      unit: "note",
      rate: 0,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });
  }

  // ── 3. First Points ───────────────────────────────────────────────────────
  const fp = qds.firstPoints;
  if (fp) {
    const circuits = Number(fp.circuits) || 0;
    const ratePerCircuit = Number(fp.ratePerCircuit) || 0;
    if (circuits > 0 && ratePerCircuit > 0) {
      items.push({
        description: `First Points (${circuits} circuits @ £${ratePerCircuit}/circuit)`,
        quantity: circuits,
        unit: "circuit",
        rate: ratePerCircuit,
        pricingType: "standard",
        sortOrder: sortIdx++,
      });
    }
  }

  // ── 4. Plant / Hire ───────────────────────────────────────────────────────
  for (const p of Array.isArray(qds.plantHire) ? qds.plantHire : []) {
    const desc = String(p.description || "").trim();
    if (!desc) continue;

    const dailyCost   = (Number(p.dailyRate) || 0) * (Number(p.numDays) || 0);
    const weeklyCost  = (Number(p.weeklyRate) || 0) * (Number(p.numWeeks) || 0);
    const delivery    = Number(p.deliveryCharge) || 0;
    const collection  = Number(p.collectionCharge) || 0;
    const baseCost    = dailyCost + weeklyCost + delivery + collection;
    const markupPct   = Number(p.markup) || 0;
    const sellPrice   = baseCost * (1 + markupPct / 100);
    const costPriceVal = baseCost;

    const durationNote = p.numDays
      ? `${p.numDays} day(s)`
      : p.numWeeks
      ? `${p.numWeeks} week(s)`
      : null;

    items.push({
      description: durationNote ? `${desc} (${durationNote})` : desc,
      quantity: 1,
      unit: "each",
      rate: Math.round(sellPrice * 100) / 100,
      costPrice: costPriceVal > 0 ? String(Math.round(costPriceVal * 100) / 100) : null,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });
  }

  // ── 5. Preliminaries ──────────────────────────────────────────────────────
  for (const prelim of Array.isArray(qds.preliminaries) ? qds.preliminaries : []) {
    const desc = String(prelim.description || "").trim();
    if (!desc) continue;
    items.push({
      description: desc,
      quantity: 1,
      unit: "each",
      rate: Number(prelim.cost) || 0,
      pricingType: "standard",
      sortOrder: sortIdx++,
    });
  }

  // ── 6. Sundries allowance (% of supply total) ────────────────────────────
  const sundriesPct = Number(qds.sundries) || 0;
  if (sundriesPct > 0) {
    const supplyTotal = items
      .filter((i) => i.unit !== "hrs" && i.unit !== "note" && i.unit !== "circuit")
      .reduce((sum, i) => sum + i.quantity * i.rate, 0);
    if (supplyTotal > 0) {
      const sundriesAmount = Math.round(supplyTotal * (sundriesPct / 100) * 100) / 100;
      items.push({
        description: `Sundries allowance (${sundriesPct}% of supply)`,
        quantity: 1,
        unit: "each",
        rate: sundriesAmount,
        pricingType: "standard",
        sortOrder: sortIdx++,
      });
    }
  }

  return items;
}
