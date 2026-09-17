/**
 * Canonical sector vocabulary — Delivery 2.14, Chunk 1.
 *
 * WHY THIS FILE EXISTS
 *
 * A sector's identity was spread across five registries that did not
 * agree with each other:
 *
 *   - server/tradePresets.ts          keys like "it_services"
 *   - server/catalogSeeds/index.ts    keys like "it_services"
 *   - server/demoQuotes/index.ts      keys like "it_services"
 *   - server/templates/library/       folders like "it-services"
 *   - two copies of a preset → sector mapping, one server-side in
 *     templateLibrary.ts and one hand-written inside the proposal
 *     template picker component
 *
 * The server copy matched on HYPHENATED ids ("commercial-cleaning")
 * while every stored value is UNDERSCORED ("commercial_cleaning"), so
 * it never matched anything: all 25 trade presets fell through to the
 * IT Services default. The client copy normalised underscores and so
 * worked for three of the four go-to-market sectors, but not for
 * Website & Digital Marketing, whose key normalises to
 * "website-marketing" while its template folder is "web-marketing".
 *
 * Net effect before this delivery: eighteen finished proposal designs
 * (three sectors × six styles), complete with thumbnails, could not be
 * reached by the sector default, and Website & Digital Marketing could
 * not reach its six at all.
 *
 * This module is the single place that answers "what sector is this,
 * and what is it called in each subsystem". Both the server and the
 * client import it. There is no second copy.
 *
 * NAMING RULE
 *
 *   sector key      underscored, e.g. "commercial_cleaning".
 *                   This is what is stored on users.default_trade_sector
 *                   and quotes.trade_preset, and what keys the trade
 *                   preset, catalogue seed and demo quote registries.
 *                   It is the canonical form. Everything else derives
 *                   from it.
 *
 *   template sector hyphenated folder name under the template library,
 *                   e.g. "commercial-cleaning". Derived, never stored.
 *
 * Adding a sector means adding one entry to SECTOR_DEFS. Nothing else
 * in this file needs touching.
 */

/** Hyphenated folder ids under server/templates/library. */
export const TEMPLATE_SECTORS = [
  "it-services",
  "commercial-cleaning",
  "web-marketing",
  "pest-control",
] as const;
export type TemplateSectorId = (typeof TEMPLATE_SECTORS)[number];

/**
 * The sector used when a trade preset is missing or maps to no template
 * sector of its own. IT Services is the broadest of the four designs and
 * the original stock pick.
 */
export const DEFAULT_TEMPLATE_SECTOR: TemplateSectorId = "it-services";

interface SectorDef {
  /** Canonical underscored key. */
  key: string;
  /** Template library folder, or null when the sector has no designs of
   *  its own yet and should fall back to the default. */
  templateSector: TemplateSectorId | null;
  /** Older or shorthand spellings that have appeared in stored rows or
   *  in the two mappings this file replaces. Matched case-insensitively
   *  after underscores are normalised to hyphens. */
  aliases: string[];
}

/**
 * Every sector the app recognises. The four go-to-market sectors carry
 * a template sector; the rest are engine-level only (selectEngine still
 * routes them correctly) and fall back to the default design set until
 * they get designs of their own.
 *
 * Only the four GTM sectors plus "custom" are selectable at signup —
 * see VISIBLE_TRADE_SECTOR_OPTIONS in client/src/lib/tradeSectors.ts.
 * That narrowing is a go-to-market decision, not a capability one.
 */
const SECTOR_DEFS: SectorDef[] = [
  // ── Go-to-market four ──────────────────────────────────────────────
  { key: "it_services", templateSector: "it-services", aliases: ["it", "it-services"] },
  {
    key: "website_marketing",
    templateSector: "web-marketing",
    // "website-marketing" is what the key itself normalises to, and is
    // the alias that was missing from both old mappings — the reason
    // this sector never reached its own six designs.
    aliases: ["web", "web-marketing", "website-marketing", "digital-marketing"],
  },
  {
    key: "commercial_cleaning",
    templateSector: "commercial-cleaning",
    aliases: ["cleaning", "commercial-cleaning"],
  },
  { key: "pest_control", templateSector: "pest-control", aliases: ["pest", "pest-control"] },

  // ── Engine-level sectors, no designs of their own yet ──────────────
  { key: "custom", templateSector: null, aliases: [] },
  { key: "electrical", templateSector: null, aliases: [] },
  { key: "construction_steel", templateSector: null, aliases: [] },
  { key: "metalwork_bespoke", templateSector: null, aliases: [] },
  { key: "building_maintenance", templateSector: null, aliases: [] },
  { key: "general_construction", templateSector: null, aliases: [] },
  { key: "bathrooms_kitchens", templateSector: null, aliases: [] },
  { key: "windows_doors", templateSector: null, aliases: [] },
  { key: "scaffolding", templateSector: null, aliases: [] },
  { key: "mechanical_fabrication", templateSector: null, aliases: [] },
  { key: "fire_protection", templateSector: null, aliases: [] },
  { key: "lifts_access", templateSector: null, aliases: [] },
  { key: "insulation_retrofit", templateSector: null, aliases: [] },
  { key: "plumbing", templateSector: null, aliases: [] },
  { key: "hvac", templateSector: null, aliases: [] },
  { key: "roofing", templateSector: null, aliases: [] },
  { key: "joinery", templateSector: null, aliases: [] },
  { key: "painting", templateSector: null, aliases: [] },
  { key: "groundworks", templateSector: null, aliases: [] },
  { key: "fire_security", templateSector: null, aliases: [] },
  { key: "telecoms_cabling", templateSector: null, aliases: [] },
  { key: "solar_ev", templateSector: null, aliases: [] },
];

/** All canonical sector keys, in declaration order. */
export const SECTOR_KEYS: string[] = SECTOR_DEFS.map((d) => d.key);

/** The four sectors that have designs, catalogue seeds and demo quotes. */
export const GTM_SECTOR_KEYS: string[] = SECTOR_DEFS.filter(
  (d) => d.templateSector !== null,
).map((d) => d.key);

/**
 * Normalise any spelling to the comparison form: lowercased, trimmed,
 * underscores as hyphens. "IT_Services" and "it-services" both become
 * "it-services".
 */
function normalise(raw: string): string {
  return raw.trim().toLowerCase().replace(/_/g, "-");
}

/** Lookup built once: every normalised key and alias → its definition. */
const BY_NORMALISED = new Map<string, SectorDef>();
for (const def of SECTOR_DEFS) {
  BY_NORMALISED.set(normalise(def.key), def);
  for (const alias of def.aliases) {
    BY_NORMALISED.set(normalise(alias), def);
  }
}

/**
 * Resolve any stored or historical spelling to its canonical key.
 * Returns null for an unrecognised value so callers can decide whether
 * to fall back or to treat it as an error.
 */
export function canonicalSectorKey(raw: string | null | undefined): string | null {
  if (!raw) return null;
  return BY_NORMALISED.get(normalise(raw))?.key ?? null;
}

/**
 * The template library folder for a sector, or null when it has no
 * designs of its own. Tolerant of every spelling that has ever been
 * stored — this is the function that replaces both old copies.
 *
 * Callers that need a design no matter what should use
 * resolveTemplateSector() instead, which applies the default.
 */
export function templateSectorFor(
  tradePreset: string | null | undefined,
): TemplateSectorId | null {
  if (!tradePreset) return null;
  return BY_NORMALISED.get(normalise(tradePreset))?.templateSector ?? null;
}

/**
 * The template library folder for a sector, falling back to the default
 * when the sector is unknown or has no designs yet. Never returns null,
 * so a proposal always has a design to render with.
 */
export function resolveTemplateSector(
  tradePreset: string | null | undefined,
): TemplateSectorId {
  return templateSectorFor(tradePreset) ?? DEFAULT_TEMPLATE_SECTOR;
}

/**
 * True when the sector has designs of its own rather than borrowing the
 * default. Used to decide whether to tell the user their designs are
 * sector-specific or generic.
 */
export function hasOwnTemplates(tradePreset: string | null | undefined): boolean {
  return templateSectorFor(tradePreset) !== null;
}

/**
 * Human-readable name for a template sector.
 *
 * These strings are the ones already shown by the picker and by the
 * server's SECTOR_META, reproduced here verbatim so that centralising
 * them changes nothing a user sees. Both sides now read from here.
 */
export const TEMPLATE_SECTOR_NAMES: Record<TemplateSectorId, string> = {
  "it-services": "IT Services",
  "commercial-cleaning": "Commercial Cleaning",
  "web-marketing": "Web & Digital Marketing",
  "pest-control": "Pest Control",
};
