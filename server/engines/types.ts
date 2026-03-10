/**
 * IdoYourQuotes — AI Engine Type Contracts
 *
 * This file defines the sealed input/output contracts for all sector engines.
 * Every engine reads EngineInput and writes EngineOutput — nothing else.
 *
 * GUARDRAIL G1: Never change the EngineOutput shape without simultaneously
 * updating ALL downstream consumers (parseDictationSummary, QuoteDraftSummary.tsx).
 * Shape changes require a full trace before implementation.
 *
 * GUARDRAIL G11: No engine may import from another engine file.
 * No engine may call any DB function directly.
 * All DB context must arrive via EngineInput.
 */

// ─── Catalog item as passed to every engine ───────────────────────────────────

export interface EngineCatalogItem {
  name: string;
  defaultRate: string | number;
  unit: string;
  costPrice?: string | number | null;
  installTimeHrs?: number | null;
  category?: string | null;
  pricingType?: string;
  description?: string | null;
}

// ─── Electrical-specific context (only populated for ElectricalEngine) ─────────

export interface ElectricalContext {
  /**
   * Symbol mappings derived from a parsed legend PDF.
   * Keys are symbol codes (e.g. "SPD", "WP"), values are human-readable descriptions.
   * Empty object if no legend has been parsed for this quote.
   */
  symbolMappings: Record<string, string>;
}

// ─── What every engine receives ───────────────────────────────────────────────

export interface EngineInput {
  /**
   * The quote's tradePreset value (e.g. "electrical", "it_services").
   * Used by engines to select the correct sector guidance.
   */
  tradePreset: string | null;

  /**
   * The user's default trade sector — used as fallback when tradePreset is null.
   */
  userTradeSector: string | null;

  /**
   * All input records for this quote, pre-filtered to exclude reference-only inputs.
   * Each engine must filter for its own reference-only check as a belt-and-braces guard.
   */
  inputRecords: EngineInputRecord[];

  /**
   * Pre-formatted catalog context string, ready for prompt injection.
   * Assembled by parseDictationSummary before calling the engine.
   * Empty string if the org has no catalog items.
   */
  catalogContext: string;

  /**
   * Org-level defaults for rate/markup context.
   */
  orgDefaults?: {
    defaultMarkup?: number | null;
    defaultSundries?: number | null;
  };

  /**
   * Electrical-specific context. Only populated when ElectricalEngine is selected.
   */
  electricalContext?: ElectricalContext;
}

export interface EngineInputRecord {
  id: number;
  inputType: string;
  content: string | null;
  fileUrl: string | null;
  filename: string | null;
  processedContent: string | null;
  extractedText?: string | null;
  mimeType?: string | null;
}

// ─── What every engine must return ────────────────────────────────────────────
//
// This is identical to the existing parseDictationSummary JSON contract (G1).
// The legacy fields (isTradeRelevant) remain for backwards compatibility.

export interface EngineOutputMaterial {
  item: string;
  quantity: number;
  unitPrice: number;
  unit: string;
  description: string;
  pricingType: "standard" | "monthly" | "optional" | "annual";
  estimated: boolean;
}

export interface EngineOutputLabour {
  role: string;
  quantity: number;
  duration: string;
}

export interface EngineOutput {
  // ── Client details ──
  clientName: string | null;
  clientEmail: string | null;
  clientPhone: string | null;

  // ── Core QDS fields ──
  jobDescription: string;
  labour: EngineOutputLabour[];
  materials: EngineOutputMaterial[];

  // ── Financial defaults ──
  markup: number | null;
  sundries: number | null;
  contingency: string | null;

  // ── Notes & flags ──
  notes: string | null;

  /**
   * Legacy field — kept for downstream compatibility.
   * Engines should always return true unless content is genuinely unrelated.
   */
  isTradeRelevant: boolean;

  // ── Engine metadata (new fields — additive only) ──

  /**
   * Which engine produced this output. Used for diagnostics and logging.
   * e.g. "GeneralEngine", "DrawingEngine", "ElectricalEngine"
   */
  engineUsed: string;

  /**
   * Engine version string. Increment when the engine prompt or logic changes significantly.
   * Format: "1.0.0"
   */
  engineVersion: string;

  /**
   * Risk notes / post-processing warnings from the engine.
   * For ElectricalEngine: may contain unknown symbol warnings.
   * For other engines: currently unused, set to null.
   */
  riskNotes: string | null;
}

// ─── The interface every engine must implement ────────────────────────────────

export interface SectorEngine {
  /**
   * Analyse all inputs and return a structured QDS output.
   *
   * CONTRACT:
   * - Must always return an EngineOutput, never throw to the caller.
   * - If AI call fails, return a degraded EngineOutput with empty arrays and
   *   a descriptive error in riskNotes.
   * - Must set engineUsed and engineVersion on every return.
   * - Must filter reference-only inputs before passing to AI.
   */
  analyse(input: EngineInput): Promise<EngineOutput>;
}
