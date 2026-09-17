/**
 * Sector packs — Delivery 2.14, Chunk 3.
 *
 * WHY THIS FILE EXISTS
 *
 * "What does IDYQ have for Commercial Cleaning?" could not be answered
 * from one place. The artefacts that make up a sector were spread
 * across five registries in five files:
 *
 *   - server/tradePresets.ts          sections config and AI prompts
 *   - server/catalogSeeds/index.ts    starter catalogue
 *   - server/demoQuotes/index.ts      demo quote
 *   - server/templates/library/       six proposal designs
 *   - server/engines/…Engine.ts       the proposal chapter list
 *
 * Until Chunk 1 they did not even agree on how to spell a sector's
 * name, which is exactly how a broken preset-to-design mapping hid for
 * months and how Website & Digital Marketing came to be offered at
 * signup with no trade preset at all. Nobody could see the gaps because
 * nothing put them side by side.
 *
 * A sector pack is that side-by-side view: one entry per sector naming
 * every artefact it has, and — just as usefully — every artefact it
 * does not.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not move the artefacts. The catalogue seeds still live in
 * catalogSeeds, the demo quotes still live in demoQuotes, the chapter
 * definitions still live in the engine. This module sits ON TOP of
 * those registries and reads from them; it is not a replacement, and
 * inverting the dependency would have meant rewriting four working
 * files for no gain and a real risk of import cycles.
 *
 * It also changes no behaviour whatsoever. Every sector still resolves
 * to exactly what it resolved to before. Chunk 3's whole value is that
 * Chunks 4 and 5 have somewhere to put a sector's chapter set.
 *
 * CHAPTER SETS
 *
 * The one genuinely new field is `chapterSetId`. Today every sector
 * points at "it-services-v1", which is the existing nineteen-chapter
 * list carried across verbatim (the owner's decision, 17 Sep 2026: lift
 * it unchanged, and do the tidying in Chunk 5 where it belongs
 * alongside the other sectors' sets). So the field is real, it is
 * wired, and it currently makes no difference — which is precisely
 * what a foundation chunk should look like.
 *
 * The id is a plain string rather than an imported chapter array on
 * purpose: importing the proposal engine constructs an OpenAI client at
 * module load, and pulling that into the catalogue and demo-quote paths
 * would couple registration to an AI client it never uses. The engine
 * owns the sets and resolves the id; this file only names one.
 */

import {
  canonicalSectorKey,
  templateSectorFor,
  TEMPLATE_SECTOR_NAMES,
  SECTOR_KEYS,
  type TemplateSectorId,
} from "@shared/sectors";
import { getCatalogSeedForSector, type CatalogSeedItem } from "./catalogSeeds/index";
import { getDemoQuoteForSector, type DemoQuoteFactory } from "./demoQuotes/index";
import { TRADE_PRESETS } from "./tradePresets";

/**
 * Identifies a chapter set. Resolved by the proposal engine, not here.
 * Versioned in the id so a set can be revised without silently changing
 * proposals generated from the previous one — Chunk 4 stamps this into
 * the saved state for exactly that reason.
 */
export type ChapterSetId =
  | "it-services-v1"
  | "commercial-cleaning-v1"
  | "pest-control-v1"
  | "website-marketing-v1";

/**
 * The chapter set used by any sector that has none of its own.
 *
 * Delivery 2.14 Chunk 5 — this is now genuinely a FALLBACK rather than
 * the only set. The four go-to-market sectors each have their own; the
 * remaining twenty-two, which are engine-level only and not selectable
 * at signup, still borrow the IT set until they are given one.
 */
export const DEFAULT_CHAPTER_SET_ID: ChapterSetId = "it-services-v1";

/**
 * Delivery 2.14 Chunk 5 — which set each sector's proposals are built
 * from. A sector absent from this map falls back to the default.
 */
const CHAPTER_SET_BY_SECTOR: Record<string, ChapterSetId> = {
  it_services: "it-services-v1",
  commercial_cleaning: "commercial-cleaning-v1",
  pest_control: "pest-control-v1",
  website_marketing: "website-marketing-v1",
};

export interface SectorPack {
  /** Canonical underscored key — see shared/sectors.ts. */
  key: string;
  /** Display name, where the sector has its own designs. */
  displayName: string | null;
  /**
   * True for the four sectors selectable at signup since the 18 Apr 2026
   * go-to-market narrowing. The rest remain valid at the engine level —
   * selectEngine() routes them correctly — they are simply not offered.
   */
  isGoToMarket: boolean;
  /** Does a trade preset exist (sections config + AI prompts)? */
  hasTradePreset: boolean;
  /** Starter catalogue, or null. */
  catalogueSeed: readonly CatalogSeedItem[] | null;
  /** Demo quote factory, or null. */
  demoQuote: DemoQuoteFactory | null;
  /** Template library folder, or null when the sector borrows the default. */
  templateSector: TemplateSectorId | null;
  /** Which chapter set this sector's proposals are built from. */
  chapterSetId: ChapterSetId;
  /**
   * Whether a contract starting point ships for this sector.
   *
   * FALSE FOR EVERY SECTOR TODAY, and that is accurate rather than an
   * oversight. The shipped Gold and Silver documents are Sweetbyte's own
   * IT support agreements, allow-listed to one organisation id via the
   * CONTRACT_SEED_ORG_IDS setting — an ORG-level arrangement, not a
   * sector-level one. Every other business opens the tab to an empty
   * clause list. Note the machinery itself is fully generic: any org can
   * already create, name, edit, sign and render contracts. What is
   * missing is a starting point, not permission. Chunks 7 and 8.
   */
  hasContractStartingPoint: boolean;
}

/**
 * Every sector, built from the registries that own each artefact.
 *
 * Derived rather than hand-written, so a pack can never disagree with
 * the registry it describes — the failure mode that made the original
 * five-registry sprawl so hard to see through.
 */
const PACKS: Map<string, SectorPack> = new Map(
  SECTOR_KEYS.map((key) => {
    const templateSector = templateSectorFor(key);
    return [
      key,
      {
        key,
        displayName: templateSector ? TEMPLATE_SECTOR_NAMES[templateSector] : null,
        isGoToMarket: templateSector !== null,
        hasTradePreset: key in TRADE_PRESETS,
        catalogueSeed: getCatalogSeedForSector(key),
        demoQuote: getDemoQuoteForSector(key),
        templateSector,
        chapterSetId: CHAPTER_SET_BY_SECTOR[key] ?? DEFAULT_CHAPTER_SET_ID,
        hasContractStartingPoint: false,
      } satisfies SectorPack,
    ];
  }),
);

/**
 * The pack for a sector, tolerant of any historical spelling. Returns
 * null for a value the vocabulary does not recognise, so callers can
 * decide between falling back and treating it as an error.
 */
export function getSectorPack(sector: string | null | undefined): SectorPack | null {
  const key = canonicalSectorKey(sector);
  return key ? PACKS.get(key) ?? null : null;
}

/** Every pack, in vocabulary order. */
export function listSectorPacks(): SectorPack[] {
  return SECTOR_KEYS.map((k) => PACKS.get(k)!).filter(Boolean);
}

/** Just the four sectors offered at signup. */
export function listGoToMarketPacks(): SectorPack[] {
  return listSectorPacks().filter((p) => p.isGoToMarket);
}

/**
 * Which chapter set a sector's proposals are built from. Every sector
 * returns the same id today; the function exists so that Chunk 5 is a
 * change to data rather than a change to call sites.
 */
export function chapterSetIdFor(sector: string | null | undefined): ChapterSetId {
  return getSectorPack(sector)?.chapterSetId ?? DEFAULT_CHAPTER_SET_ID;
}

/**
 * The seven artefacts that define a finished sector, as agreed 16 Sep
 * 2026 and recorded in the blueprint's Sector Completeness Programme.
 *
 * The seventh — one real quote taken end to end through Xero by the
 * owner — is not something code can observe, so it is reported as
 * unknown rather than guessed at. Chunk 9 surfaces the rest in the
 * admin panel.
 */
export interface SectorCompleteness {
  key: string;
  tradePreset: boolean;
  catalogueSeed: boolean;
  catalogueItemCount: number;
  demoQuote: boolean;
  ownDesigns: boolean;
  ownChapterSet: boolean;
  contractStartingPoint: boolean;
  /** Artefacts satisfied out of the six that code can check. */
  score: number;
  outstanding: string[];
}

export function sectorCompleteness(sector: string | null | undefined): SectorCompleteness | null {
  const pack = getSectorPack(sector);
  if (!pack) return null;

  const tradePreset = pack.hasTradePreset;
  const catalogueSeed = pack.catalogueSeed !== null;
  const demoQuote = pack.demoQuote !== null;
  const ownDesigns = pack.templateSector !== null;
  // "Own" means a set written for this sector rather than a borrowed
  // one. Delivery 2.14 Chunk 5 — true for all four go-to-market
  // sectors; IT Services counts because it-services-v1 IS its own set,
  // which the other twenty-two sectors merely borrow.
  const ownChapterSet =
    pack.chapterSetId !== DEFAULT_CHAPTER_SET_ID || pack.key === "it_services";
  const contractStartingPoint = pack.hasContractStartingPoint;

  const checks: Array<[boolean, string]> = [
    [tradePreset, "trade preset"],
    [catalogueSeed, "starter catalogue"],
    [demoQuote, "demo quote"],
    [ownDesigns, "proposal designs"],
    [ownChapterSet, "chapter set of its own"],
    [contractStartingPoint, "contract starting point"],
  ];

  return {
    key: pack.key,
    tradePreset,
    catalogueSeed,
    catalogueItemCount: pack.catalogueSeed?.length ?? 0,
    demoQuote,
    ownDesigns,
    ownChapterSet,
    contractStartingPoint,
    score: checks.filter(([ok]) => ok).length,
    outstanding: checks.filter(([ok]) => !ok).map(([, label]) => label),
  };
}
