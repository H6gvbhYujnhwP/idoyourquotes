/**
 * Demo Quotes Registry
 *
 * Maps trade sector keys to their demo-quote factory. Mirror of the
 * `catalogSeeds/index.ts` registry pattern: one-line addition per new
 * sector, plain lookup with no shared state.
 *
 * Consumers:
 *   - server/db.ts seedDemoQuoteForSector() — auto-seed on new registration
 *     (called inside createUser() after the existing catalog seed block)
 *     and manual trigger from Dashboard.
 *   - server/routers.ts quotes.seedDemoForSector — reads from here to
 *     validate the user's sector has a demo factory available.
 *
 * Design:
 *   - Factories are plain-data functions — no DB access, no side effects.
 *   - Each factory returns a fully-formed { quoteFields, qdsSummaryJson,
 *     lineItems[] } bundle that the seedDemoQuoteForSector helper in
 *     db.ts writes in the correct order: createQuote → updateQuote (for
 *     qdsSummaryJson, which createQuote doesn't set) → loop createLineItem
 *     → recalculateQuoteTotals.
 *   - Demo factories are fully isolated from each other. Changing the IT
 *     demo cannot affect any other sector's registration flow.
 *   - Factories that return null mean "no demo available" — handled
 *     gracefully throughout (auto-seed no-ops, tRPC procedure throws a
 *     clear error for manual triggers).
 */

import { getDemoQuote as getItServicesDemo } from "./itServicesDemo";
import { getDemoQuote as getWebsiteMarketingDemo } from "./websiteMarketingDemo";
import { getDemoQuote as getCommercialCleaningDemo } from "./commercialCleaningDemo";
import { getDemoQuote as getPestControlDemo } from "./pestControlDemo";

/**
 * Shape returned by every demo factory — this is the contract all four
 * factory files implement.
 */
export interface DemoQuoteBundle {
  /**
   * Fields written via createQuote() in db.ts. Only columns that
   * createQuote explicitly spreads are honoured here; qdsSummaryJson is
   * handled separately below.
   */
  quoteFields: {
    reference: string;
    status: "draft" | "sent" | "accepted" | "declined";
    quoteMode: "simple" | "comprehensive";
    tradePreset: string;
    title: string;
    description: string;
    clientName: string;
    contactName?: string;
    clientEmail?: string;
    clientPhone?: string;
    clientAddress?: string;
    terms?: string;
    validUntil?: Date;
  };
  /**
   * Stringified QDS snapshot. Shape matches what triggerVoiceAnalysis
   * writes to quotes.qds_summary_json. Note: demo quotes have no inputs,
   * so the QuoteWorkspace rehydration useEffect bails on the
   * `inputs.length === 0` guard — this column stays in the DB ready for
   * future use but doesn't render on the QDS tab. The Quote tab (line
   * items + totals) is the user-visible payoff.
   */
  qdsSummaryJson: string;
  /**
   * Pre-totalled line-item rows. quoteId and sortOrder are injected by
   * the seedDemoQuoteForSector helper; every other field comes from the
   * factory. Descriptions follow the "{item} — {description}" prefix
   * convention so formatLineItemDescription in pdfGenerator.ts and
   * renderDescNode in QuoteDraftSummary.tsx split correctly on "||".
   */
  lineItems: Array<{
    description: string;
    quantity: string;
    unit: string;
    rate: string;
    total: string;
    pricingType: "standard" | "monthly" | "annual" | "optional";
    category: string;
    costPrice: string | null;
  }>;
}

export type DemoQuoteFactory = () => DemoQuoteBundle;

/**
 * Registry of available demo factories keyed by tradePreset /
 * defaultTradeSector. Add future sector demos here.
 */
const DEMO_REGISTRY: Record<string, DemoQuoteFactory> = {
  it_services: getItServicesDemo,
  website_marketing: getWebsiteMarketingDemo,
  commercial_cleaning: getCommercialCleaningDemo,
  pest_control: getPestControlDemo,
};

/**
 * Returns the demo-quote factory for a given sector, or null if no demo
 * exists. Null is the normal case for sectors without demos — callers
 * must handle null gracefully (auto-seed should no-op, manual triggers
 * should surface a user-visible error).
 */
export function getDemoQuoteForSector(
  sector: string | null | undefined
): DemoQuoteFactory | null {
  if (!sector) return null;
  return DEMO_REGISTRY[sector] ?? null;
}

/**
 * True if a demo factory exists for the given sector.
 */
export function isDemoSector(sector: string | null | undefined): boolean {
  if (!sector) return false;
  return sector in DEMO_REGISTRY;
}

/**
 * List of all sector keys that have demos available. Exported for
 * potential future use by admin panels or analytics.
 */
export function listDemoSectors(): string[] {
  return Object.keys(DEMO_REGISTRY);
}
