/**
 * Catalog Seeds Registry
 *
 * Maps trade sector keys to their starter catalog templates.
 * Adding a new sector seed is a one-line addition to SEED_REGISTRY.
 *
 * Consumers:
 *   - server/db.ts seedCatalogFromSectorTemplate() — reads from here
 *   - server/routers.ts catalog.seedFromSectorTemplate — reads from here
 *   - client/src/pages/Catalog.tsx — imports isSeedableSector to gate the UI button
 *
 * Design: sector seeds are fully isolated from each other. Changing the IT
 * seed cannot affect any other sector's registration flow. The registry is
 * a plain lookup with no shared state.
 */

import { IT_SERVICES_CATALOG_SEED, type CatalogSeedItem } from "./itServicesSeed";

/**
 * Registry of available catalog seeds keyed by tradePreset / defaultTradeSector.
 * Add future sector seeds here (e.g. "commercial_cleaning", "building_maintenance").
 */
const SEED_REGISTRY: Record<string, readonly CatalogSeedItem[]> = {
  it_services: IT_SERVICES_CATALOG_SEED,
};

/**
 * Returns the catalog seed array for a given sector, or null if no seed exists.
 * Null is the normal case — most sectors don't have seeds yet.
 */
export function getCatalogSeedForSector(sector: string | null | undefined): readonly CatalogSeedItem[] | null {
  if (!sector) return null;
  return SEED_REGISTRY[sector] ?? null;
}

/**
 * True if a seed exists for the given sector. Used by the client UI to decide
 * whether to render the "Load starter catalog" button.
 */
export function isSeedableSector(sector: string | null | undefined): boolean {
  if (!sector) return false;
  return sector in SEED_REGISTRY;
}

/**
 * List of all sector keys that have seeds available. Exported for potential
 * future use by admin panels or analytics.
 */
export function listSeedableSectors(): string[] {
  return Object.keys(SEED_REGISTRY);
}

export type { CatalogSeedItem };
