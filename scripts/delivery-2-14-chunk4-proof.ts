/**
 * Delivery 2.14 Chunk 4 proof — chapter set stamping.
 *
 * Chunk 4 records which chapter set produced a proposal, and makes
 * single-chapter regeneration resolve within THAT set rather than
 * within whatever set the sector uses now. Nothing changes today,
 * because there is still only one set — which is exactly the problem
 * with proving it by hand.
 *
 * So this proof registers a SECOND, deliberately different chapter set
 * at runtime and exercises the real resolution against it. That is the
 * situation Chunk 5 creates, arriving early so the machinery can be
 * tested before any customer-facing document depends on it.
 *
 *   npx tsx scripts/delivery-2-14-chunk4-proof.ts
 */

// The proposal engine builds an OpenAI client on import. Set a
// placeholder before pulling it in; a real key already present is left
// alone. No AI call is made by this proof.
process.env.OPENAI_API_KEY ||= "not-used-by-this-proof";

import {
  chapterSetIdOf,
  isPricingChapter,
  LEGACY_CHAPTER_SET_ID,
} from "../shared/proposalChapters";

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

const engine = await import("../server/engines/brandedProposalEngine");
const SLOT_DEFS = (engine as any).SLOT_DEFS as any[];
const CHAPTER_SETS = (engine as any).CHAPTER_SETS as Record<string, any[]>;
const getChapterSet = (engine as any).getChapterSet as (id?: string | null) => any[];

console.log("── The stamp is read from the saved state ──");
ok("stamped state", chapterSetIdOf({ chapterSetId: "commercial-cleaning-v1" }), "commercial-cleaning-v1");
// Every proposal saved before this delivery, the live Sorrells one included.
ok("unstamped state reads as legacy", chapterSetIdOf({}), LEGACY_CHAPTER_SET_ID);
ok("null state reads as legacy", chapterSetIdOf(null), LEGACY_CHAPTER_SET_ID);
ok("empty string reads as legacy", chapterSetIdOf({ chapterSetId: "" }), LEGACY_CHAPTER_SET_ID);
ok("legacy id is the frozen IT set", LEGACY_CHAPTER_SET_ID, "it-services-v1");

// ── Simulate Chunk 5: a second set, shorter, different chapters ──────
//
// Eleven chapters rather than nineteen, with pricing at position 9
// instead of 16. This is the shape that breaks every assumption the
// pre-Chunk-2 code made.
const SIMULATED_ID = "proof-simulated-shorter-set-v1";
const CLEANING_SET = [
  { slotIndex: 1, chapterId: "cover", slotName: "Cover" },
  { slotIndex: 2, chapterId: "title-page", slotName: "Title Page" },
  { slotIndex: 3, chapterId: "executive-summary", slotName: "Executive Summary" },
  { slotIndex: 4, chapterId: "about-the-supplier", slotName: "About the Supplier" },
  { slotIndex: 5, chapterId: "scope-and-frequencies", slotName: "Scope and Frequencies" },
  { slotIndex: 6, chapterId: "staffing-and-vetting", slotName: "Staffing and Vetting" },
  { slotIndex: 7, chapterId: "equipment-consumables", slotName: "Equipment and Consumables" },
  { slotIndex: 8, chapterId: "health-and-safety", slotName: "Health and Safety" },
  { slotIndex: 9, chapterId: "pricing-summary", slotName: "Pricing Summary", role: "pricing" },
  { slotIndex: 10, chapterId: "contract-terms", slotName: "Contract Terms" },
  { slotIndex: 11, chapterId: "call-to-action", slotName: "Call to Action" },
];
// Delivery 2.14 Chunk 5 — this simulated set used to be registered as
// "commercial-cleaning-v1". That id is now a REAL set, so the proof was
// overwriting it and then deleting it at the end: destructive, and it
// masked its own count assertions. A reserved id that no sector can
// ever use keeps the simulation honest.
CHAPTER_SETS[SIMULATED_ID] = CLEANING_SET as any;

const realSetCount = Object.keys(CHAPTER_SETS).length - 1; // minus the simulated one
console.log("\n── A second set now exists, and each id resolves to its own ──");
// Relative rather than absolute: Chunk 5 registered real sector sets,
// and this proof is about resolution, not about how many sets exist.
ok("simulated set is registered alongside the real ones", Object.keys(CHAPTER_SETS).includes(SIMULATED_ID), "true");
ok("legacy id resolves to the IT set", getChapterSet("it-services-v1") === SLOT_DEFS, "true");
ok("simulated id resolves to the simulated set", getChapterSet(SIMULATED_ID) === CLEANING_SET, "true");
ok("IT set length", getChapterSet("it-services-v1").length, 19);
ok("simulated set length", getChapterSet(SIMULATED_ID).length, 11);
ok("unknown id falls back to IT", getChapterSet("no-such-set") === SLOT_DEFS, "true");
ok("no id falls back to IT", getChapterSet(undefined) === SLOT_DEFS, "true");

// ── The regeneration lookup, exactly as the engine performs it ───────
//
// Mirrors the expression in regenerateSingleChapter: prefer the
// chapter's own stable id within the proposal's own set, falling back
// to position for chapters saved before Chunk 2 gave them ids.
function resolveDef(
  target: { slotIndex: number; chapterId?: string },
  chapterSetId?: string,
) {
  const set = getChapterSet(chapterSetId);
  return (
    (target.chapterId ? set.find((d) => d.chapterId === target.chapterId) : undefined) ??
    set.find((d) => d.slotIndex === target.slotIndex)
  );
}
/** What the code did before Chunk 4: always the IT set, always by position. */
function resolveDefOldWay(target: { slotIndex: number }) {
  return SLOT_DEFS.find((d) => d.slotIndex === target.slotIndex);
}

console.log("\n── A legacy IT proposal regenerates exactly as it always did ──");
// No stamp, no chapter ids — the shape of every proposal already issued.
for (const def of SLOT_DEFS) {
  const legacyChapter = { slotIndex: def.slotIndex };
  const now = resolveDef(legacyChapter, undefined);
  const before = resolveDefOldWay(legacyChapter);
  if (now !== before) {
    fail++;
    console.log(`  FAIL  chapter ${def.slotIndex} ${def.slotName} resolves differently`);
  }
}
ok("legacy chapters resolving differently than before", 0, 0);
ok("chapters checked", SLOT_DEFS.length, 19);
ok(
  "legacy chapter 9 still finds Cloud Migration Approach",
  resolveDef({ slotIndex: 9 }, undefined)?.slotName,
  "Cloud Migration Approach",
);

console.log("\n── A proposal from a shorter set resolves within it ──");
ok(
  "its chapter 9 is Pricing Summary, not Cloud Migration",
  resolveDef({ slotIndex: 9, chapterId: "pricing-summary" }, SIMULATED_ID)?.slotName,
  "Pricing Summary",
);
ok(
  "its chapter 5 is Scope and Frequencies",
  resolveDef({ slotIndex: 5, chapterId: "scope-and-frequencies" }, SIMULATED_ID)?.slotName,
  "Scope and Frequencies",
);
// THE FAULT THIS CHUNK PREVENTS. Without the stamp, regenerating a
// cleaning proposal's chapter 9 would have rewritten its pricing
// chapter as an IT cloud migration plan — on a document already sent.
ok(
  "without the stamp it would have been Cloud Migration Approach",
  resolveDefOldWay({ slotIndex: 9 })?.slotName,
  "Cloud Migration Approach",
);
ok(
  "and chapter 11 would have been Disaster Recovery rather than Call to Action",
  resolveDefOldWay({ slotIndex: 11 })?.slotName,
  "Disaster Recovery & Continuity",
);

console.log("\n── Identity beats position even when they disagree ──");
// A chapter whose position moved between set versions is still found.
ok(
  "pricing found by id despite a stale position",
  resolveDef({ slotIndex: 16, chapterId: "pricing-summary" }, SIMULATED_ID)?.slotIndex,
  9,
);
ok(
  "a chapter absent from the set resolves to nothing rather than the wrong one",
  resolveDef({ slotIndex: 99, chapterId: "cloud-migration-approach" }, SIMULATED_ID),
  "undefined",
);

console.log("\n── The pricing chapter is right in both sets ──");
ok("cleaning pricing at position 9", isPricingChapter(CLEANING_SET[8] as any), "true");
ok("cleaning contract terms at position 10 is not pricing", isPricingChapter(CLEANING_SET[9] as any), "false");
ok("IT pricing at position 16", isPricingChapter(SLOT_DEFS[15]), "true");
// Position 9 in the IT set is Cloud Migration; in the cleaning set it is
// pricing. The same number, two answers, both correct.
ok("IT position 9 is not pricing", isPricingChapter(SLOT_DEFS[8]), "false");

console.log("\n── Cleaning up the simulated set ──");
delete CHAPTER_SETS[SIMULATED_ID];
ok("the simulated set is gone", Object.keys(CHAPTER_SETS).includes(SIMULATED_ID), "false");
ok("and the real sets are untouched", Object.keys(CHAPTER_SETS).length, realSetCount);
ok("and it is still the IT set", getChapterSet(LEGACY_CHAPTER_SET_ID) === SLOT_DEFS, "true");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
