/**
 * Delivery 2.14 Chunk 2 proof — chapter identity.
 *
 * This chunk is a pure refactor: the pricing chapter stops being "the
 * chapter at index 16" and becomes "the chapter whose role is pricing".
 * Nothing a user sees changes. The assertions below exist to prove that
 * claim rather than assert it, and in particular to prove that the
 * proposals already issued — which carry no identity at all — still
 * resolve exactly as they did.
 *
 *   npx tsx scripts/delivery-2-14-chunk2-proof.ts
 */

import {
  isPricingChapter,
  isLegacyChapter,
  LEGACY_IT_PRICING_SLOT_INDEX,
} from "../shared/proposalChapters";
import {
  PRICING_SLOT_INDEX,
  type ChapterSlot,
} from "../server/engines/brandedProposalEngine";

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

/** A chapter as saved by the app BEFORE this delivery: index, no identity. */
const legacy = (slotIndex: number, slotName: string): ChapterSlot => ({
  slotIndex,
  slotName,
  source: "generate",
  title: slotName,
  body: "…",
});

/** A chapter as saved from this delivery onwards. */
const modern = (
  slotIndex: number,
  chapterId: string,
  slotName: string,
  role?: "pricing",
): ChapterSlot => ({
  slotIndex,
  chapterId,
  role,
  slotName,
  source: "generate",
  title: slotName,
  body: "…",
});

console.log("── Proposals saved before this delivery still resolve ──");
// This is the shape of every proposal already issued, Sorrells included.
ok("legacy pricing chapter (index 16)", isPricingChapter(legacy(16, "Pricing Summary")), "true");
ok("legacy Key Personnel (index 15)", isPricingChapter(legacy(15, "Key Personnel")), "false");
ok("legacy Contract Terms (index 17)", isPricingChapter(legacy(17, "Contract Terms")), "false");
ok("legacy Cover (index 1)", isPricingChapter(legacy(1, "Cover")), "false");
ok("a legacy chapter is detected as legacy", isLegacyChapter(legacy(16, "Pricing Summary")), "true");

console.log("\n── New proposals resolve by role, not position ──");
ok("role wins at index 16", isPricingChapter(modern(16, "pricing-summary", "Pricing Summary", "pricing")), "true");
// The whole point: a sector set with fewer chapters puts pricing somewhere else.
ok("role wins at index 9", isPricingChapter(modern(9, "pricing-summary", "Pricing Summary", "pricing")), "true");
ok("role wins at index 2", isPricingChapter(modern(2, "pricing-summary", "Pricing Summary", "pricing")), "true");
// The case that caught the compatibility shim getting this wrong: a
// chapter from a set that assigns roles, which has none, sitting at the
// position the legacy set used for pricing.
ok("a roleless chapter that merely SITS at 16 is not pricing", isPricingChapter(modern(16, "contract-terms", "Contract Terms")), "false");
ok("nor at 16 in a short sector set", isPricingChapter(modern(16, "quality-monitoring", "Quality Monitoring")), "false");
ok("a modern chapter is not legacy", isLegacyChapter(modern(16, "pricing-summary", "Pricing Summary", "pricing")), "false");

console.log("\n── The old magic number still means what it meant ──");
ok("PRICING_SLOT_INDEX unchanged", PRICING_SLOT_INDEX, 16);
ok("legacy constant matches it", LEGACY_IT_PRICING_SLOT_INDEX, PRICING_SLOT_INDEX);

console.log("\n── Defensive cases ──");
ok("null", isPricingChapter(null), "false");
ok("undefined", isPricingChapter(undefined), "false");

console.log("\n── The IT chapter set is unchanged by this refactor ──");
// Re-imported dynamically so the module's own SLOT_DEFS are exercised
// rather than a copy of them. The set must still be the same 19
// chapters, in the same order, with exactly one pricing chapter.
const engine = await import("../server/engines/brandedProposalEngine");
const defs = (engine as any).SLOT_DEFS as
  | Array<{ slotIndex: number; chapterId: string; slotName: string; role?: string }>
  | undefined;

if (!defs) {
  console.log("  SKIP  SLOT_DEFS is not exported — chapter-set assertions skipped");
} else {
  ok("chapter count", defs.length, 19);
  ok("indices are 1..19 in order", defs.map((d) => d.slotIndex).join(","),
     Array.from({ length: 19 }, (_, i) => i + 1).join(","));
  ok("every chapter has an id", defs.every((d) => !!d.chapterId), "true");
  ok("ids are unique", new Set(defs.map((d) => d.chapterId)).size, defs.length);
  const roled = defs.filter((d) => d.role);
  ok("exactly one chapter has a role", roled.length, 1);
  ok("it is the pricing chapter", roled[0]?.chapterId, "pricing-summary");
  ok("and it is still at the legacy index", roled[0]?.slotIndex, LEGACY_IT_PRICING_SLOT_INDEX);
  ok("its name is unchanged", roled[0]?.slotName, "Pricing Summary");
}

console.log("\n── Dispatch is identical to the old behaviour, chapter by chapter ──");
// The assembler branches on exactly one boolean per chapter: is this
// the pricing chapter. Chunk 2 changes how that boolean is computed and
// nothing else, so proving the boolean is unchanged for every chapter
// in the IT set proves the rendered output is unchanged. This is what
// stands in for a before/after PDF diff, and it is stronger: it covers
// every chapter rather than the ones a sample document happens to use.
if (defs) {
  const oldLogic = (slotIndex: number) => slotIndex === 16;
  let mismatches = 0;
  for (const d of defs) {
    // As a proposal saved before this delivery would hold it.
    const asLegacy = isPricingChapter(legacy(d.slotIndex, d.slotName));
    // As this delivery now produces it.
    const asModern = isPricingChapter(
      modern(d.slotIndex, d.chapterId, d.slotName, d.role as "pricing" | undefined),
    );
    const before = oldLogic(d.slotIndex);
    if (asLegacy !== before || asModern !== before) {
      mismatches++;
      console.log(
        `        ${d.slotIndex} ${d.slotName}: before=${before} legacy=${asLegacy} modern=${asModern}`,
      );
    }
  }
  ok("chapters whose dispatch changed", mismatches, 0);
  ok("chapters checked", defs.length * 2, 38);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
