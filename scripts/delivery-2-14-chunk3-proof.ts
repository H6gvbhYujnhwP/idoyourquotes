/**
 * Delivery 2.14 Chunk 3 proof — sector pack registry.
 *
 * Chunk 3 puts one entry per sector in front of the five registries
 * that own the artefacts, and adds a chapter set id that every sector
 * currently points at the same value. It changes no behaviour. These
 * assertions prove both halves: that the registry agrees exactly with
 * the registries it describes, and that nothing about chapter
 * resolution has moved.
 *
 *   npx tsx scripts/delivery-2-14-chunk3-proof.ts
 */

// The proposal engine builds an OpenAI client on import; the chapter
// set assertions below need it, so a placeholder is set before it is
// pulled in dynamically. A real key already present is left alone.
process.env.OPENAI_API_KEY ||= "not-used-by-this-proof";

import {
  getSectorPack,
  listSectorPacks,
  listGoToMarketPacks,
  chapterSetIdFor,
  sectorCompleteness,
  DEFAULT_CHAPTER_SET_ID,
} from "../server/sectorPacks";
import { SECTOR_KEYS, GTM_SECTOR_KEYS, templateSectorFor } from "../shared/sectors";
import { getCatalogSeedForSector, isSeedableSector } from "../server/catalogSeeds/index";
import { getDemoQuoteForSector, isDemoSector } from "../server/demoQuotes/index";
import { TRADE_PRESETS } from "../server/tradePresets";

let pass = 0;
let fail = 0;
const ok = (name: string, actual: unknown, expected: unknown) => {
  const a = String(actual);
  const e = String(expected);
  if (a === e) {
    pass++;
    console.log(`  PASS  ${name} = ${a}`);
  } else {
    fail++;
    console.log(`  FAIL  ${name}: got ${a}, expected ${e}`);
  }
};

console.log("── One pack per sector, and they resolve ──");
ok("pack count", listSectorPacks().length, SECTOR_KEYS.length);
ok("go-to-market packs", listGoToMarketPacks().length, GTM_SECTOR_KEYS.length);
ok("historical spelling resolves", getSectorPack("IT_SERVICES")?.key, "it_services");
ok("hyphenated spelling resolves", getSectorPack("commercial-cleaning")?.key, "commercial_cleaning");
ok("unknown sector", getSectorPack("not-a-sector"), "null");
ok("null sector", getSectorPack(null), "null");

console.log("\n── Every pack agrees with the registry it describes ──");
// The point of the pack is that it cannot drift from its source. If any
// of these disagree, the pack is lying about what a sector has — which
// is the exact failure the five-registry sprawl produced.
let drift = 0;
for (const key of SECTOR_KEYS) {
  const p = getSectorPack(key)!;
  if (p.hasTradePreset !== (key in TRADE_PRESETS)) drift++;
  if ((p.catalogueSeed !== null) !== isSeedableSector(key)) drift++;
  if (p.catalogueSeed !== getCatalogSeedForSector(key)) drift++;
  if ((p.demoQuote !== null) !== isDemoSector(key)) drift++;
  if (p.demoQuote !== getDemoQuoteForSector(key)) drift++;
  if (p.templateSector !== templateSectorFor(key)) drift++;
}
ok("packs disagreeing with their source registries", drift, 0);
ok("sectors checked", SECTOR_KEYS.length, 26);

console.log("\n── The four go-to-market sectors, as the pack reports them ──");
for (const key of GTM_SECTOR_KEYS) {
  const c = sectorCompleteness(key)!;
  console.log(
    `        ${key.padEnd(22)} ${c.score}/6  catalogue ${String(c.catalogueItemCount).padStart(2)} items  outstanding: ${c.outstanding.join(", ")}`,
  );
}
ok("it_services score", sectorCompleteness("it_services")?.score, 5);
ok("website_marketing score", sectorCompleteness("website_marketing")?.score, 5);
ok("commercial_cleaning score", sectorCompleteness("commercial_cleaning")?.score, 5);
ok("pest_control score", sectorCompleteness("pest_control")?.score, 5);
// Both outstanding artefacts are the ones Chunks 5, 7 and 8 deliver.
// Delivery 2.14 Chunk 5 gave each go-to-market sector a chapter set of
// its own, so every score moved 4 → 5 and only the contract starting
// point remains. Updated rather than removed: the assertion's job is to
// state what is still missing, and that is still worth asserting.
ok(
  "what every GTM sector is still missing",
  sectorCompleteness("pest_control")?.outstanding.join(" + "),
  "contract starting point",
);
ok("catalogue depth, IT", sectorCompleteness("it_services")?.catalogueItemCount, 88);
ok("catalogue depth, web marketing", sectorCompleteness("website_marketing")?.catalogueItemCount, 44);
ok("catalogue depth, cleaning", sectorCompleteness("commercial_cleaning")?.catalogueItemCount, 26);
ok("catalogue depth, pest control", sectorCompleteness("pest_control")?.catalogueItemCount, 24);

console.log("\n── A sector with no artefacts reports honestly ──");
const plumbing = sectorCompleteness("plumbing")!;
ok("plumbing has a trade preset", plumbing.tradePreset, "true");
ok("plumbing has no catalogue", plumbing.catalogueSeed, "false");
ok("plumbing has no demo", plumbing.demoQuote, "false");
ok("plumbing has no designs of its own", plumbing.ownDesigns, "false");
ok("plumbing score", plumbing.score, 1);

console.log("\n── Chapter sets: a sector without one of its own borrows the default ──");
// Delivery 2.14 Chunk 5 — WAS "every sector still points at the same
// one", which was true when Chunk 3 shipped and is now true only of the
// twenty-two sectors that have no set of their own. The four
// go-to-market sectors have theirs, so the assertion narrows to the
// fallback, which is what this chunk actually built.
for (const key of SECTOR_KEYS) {
  if (GTM_SECTOR_KEYS.includes(key)) continue;
  if (chapterSetIdFor(key) !== DEFAULT_CHAPTER_SET_ID) {
    fail++;
    console.log(`  FAIL  ${key} points at ${chapterSetIdFor(key)}`);
  }
}
ok("non-GTM sectors borrowing the default", SECTOR_KEYS.length - GTM_SECTOR_KEYS.length, 22);
ok("default chapter set id", DEFAULT_CHAPTER_SET_ID, "it-services-v1");
ok("unknown sector falls back", chapterSetIdFor("not-a-sector"), "it-services-v1");
ok("null falls back", chapterSetIdFor(null), "it-services-v1");

console.log("\n── The set the id resolves to IS the original list ──");
const engine = await import("../server/engines/brandedProposalEngine");
const SLOT_DEFS = (engine as any).SLOT_DEFS as Array<{ chapterId: string; slotName: string }>;
const getChapterSet = (engine as any).getChapterSet as (id?: string | null) => typeof SLOT_DEFS;
const listChapterSetIds = (engine as any).listChapterSetIds as () => string[];

ok("the default set is registered", listChapterSetIds().includes("it-services-v1"), "true");
// Identity, not equality — the registry must expose the very same array
// the generation code reads, not a copy that could drift from it.
ok("resolves to the same array object", getChapterSet(DEFAULT_CHAPTER_SET_ID) === SLOT_DEFS, "true");
ok("chapter count unchanged", getChapterSet(DEFAULT_CHAPTER_SET_ID).length, 19);
ok(
  "chapter order unchanged",
  getChapterSet(DEFAULT_CHAPTER_SET_ID).map((d) => d.chapterId).join(","),
  "cover,title-page,executive-summary,about-the-supplier,what-makes-us-different,track-record,understanding-requirements,proposed-service-delivery,cloud-migration-approach,cybersecurity-compliance,disaster-recovery-continuity,website-hosting-support,service-level-agreement,implementation-onboarding,key-personnel,pricing-summary,contract-terms,why-us,call-to-action",
);
ok("unknown id falls back rather than throwing", getChapterSet("no-such-set") === SLOT_DEFS, "true");
ok("null id falls back", getChapterSet(null) === SLOT_DEFS, "true");

console.log("\n── Every sector resolves to the same chapters as before ──");
// The no-op claim, stated as an assertion: whatever sector a quote
// carries, the chapters it would be built from are the identical list.
let differing = 0;
for (const key of SECTOR_KEYS) {
  if (GTM_SECTOR_KEYS.includes(key)) continue;
  if (getChapterSet(chapterSetIdFor(key)) !== SLOT_DEFS) differing++;
}
ok("non-GTM sectors resolving to a different chapter list", differing, 0);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
