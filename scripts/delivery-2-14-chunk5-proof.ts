/**
 * Delivery 2.14 Chunk 5 proof — sector chapter sets.
 *
 *   npx tsx scripts/delivery-2-14-chunk5-proof.ts
 */

process.env.OPENAI_API_KEY ||= "not-used-by-this-proof";

import { getSectorPack, chapterSetIdFor, sectorCompleteness } from "../server/sectorPacks";
import { GTM_SECTOR_KEYS, SECTOR_KEYS } from "../shared/sectors";

let pass = 0, fail = 0;
const ok = (name: string, actual: unknown, expected: unknown) => {
  const a = String(actual), e = String(expected);
  if (a === e) { pass++; console.log(`  PASS  ${name} = ${a}`); }
  else { fail++; console.log(`  FAIL  ${name}: got ${a}, expected ${e}`); }
};

const engine = await import("../server/engines/brandedProposalEngine");
const SLOT_DEFS = (engine as any).SLOT_DEFS as any[];
const CHAPTER_SETS = (engine as any).CHAPTER_SETS as Record<string, any[]>;
const getChapterSet = (engine as any).getChapterSet as (id?: string | null) => any[];

console.log("── Each go-to-market sector has its own set ──");
ok("it_services", chapterSetIdFor("it_services"), "it-services-v1");
ok("commercial_cleaning", chapterSetIdFor("commercial_cleaning"), "commercial-cleaning-v1");
ok("pest_control", chapterSetIdFor("pest_control"), "pest-control-v1");
ok("website_marketing", chapterSetIdFor("website_marketing"), "website-marketing-v1");
ok("registered sets", Object.keys(CHAPTER_SETS).sort().join(","),
   "commercial-cleaning-v1,it-services-v1,pest-control-v1,website-marketing-v1");

console.log("\n── Sectors without a set of their own still borrow IT's ──");
ok("plumbing", chapterSetIdFor("plumbing"), "it-services-v1");
ok("custom", chapterSetIdFor("custom"), "it-services-v1");
ok("unknown", chapterSetIdFor("not-a-sector"), "it-services-v1");

console.log("\n── The IT set is untouched in shape ──");
ok("chapter count", SLOT_DEFS.length, 19);
ok("still resolves to the same array", getChapterSet("it-services-v1") === SLOT_DEFS, "true");
ok("pricing chapter unmoved", SLOT_DEFS[15].chapterId, "pricing-summary");

console.log("\n── Every set is well formed ──");
for (const [id, set] of Object.entries(CHAPTER_SETS)) {
  const ids = set.map((d) => d.chapterId);
  const indices = set.map((d) => d.slotIndex);
  const roles = set.filter((d) => d.role === "pricing");
  const problems: string[] = [];
  if (new Set(ids).size !== ids.length) problems.push("duplicate chapterId");
  if (indices.join(",") !== Array.from({ length: set.length }, (_, i) => i + 1).join(","))
    problems.push("indices not 1..n in order");
  if (roles.length !== 1) problems.push(`${roles.length} pricing chapters`);
  if (set[0].chapterId !== "cover") problems.push("does not open with the cover");
  if (set[set.length - 1].chapterId !== "call-to-action") problems.push("does not close with the call to action");
  if (set.some((d) => !d.generateTitle && d.fillerType !== "always-embed-first-page"))
    problems.push("a generated chapter has no title");
  ok(`${id} (${set.length} chapters)`, problems.join("; ") || "well formed", "well formed");
}

console.log("\n── Every set shares the same spine ──");
const SPINE_OPEN = ["cover","title-page","executive-summary","about-the-supplier","what-makes-us-different","track-record","understanding-requirements"];
const SPINE_CLOSE = ["pricing-summary","contract-terms","why-us","call-to-action"];
for (const [id, set] of Object.entries(CHAPTER_SETS)) {
  const ids = set.map((d) => d.chapterId);
  ok(`${id} opening`, ids.slice(0, 7).join(","), SPINE_OPEN.join(","));
  ok(`${id} closing`, ids.slice(-4).join(","), SPINE_CLOSE.join(","));
}

console.log("\n── The sector middles carry what the research said they must ──");
const middleOf = (id: string) => CHAPTER_SETS[id].slice(7, -4).map((d) => d.chapterId);
const cleaning = middleOf("commercial-cleaning-v1");
ok("cleaning middle length", cleaning.length, 11);
for (const required of ["scope-and-frequencies","staffing-supervision-management","recruitment-vetting-training","business-continuity","equipment-materials-coshh","quality-assurance","environmental-waste","tupe","social-value","mobilisation-plan"]) {
  ok(`cleaning has ${required}`, cleaning.includes(required), "true");
}
const pest = middleOf("pest-control-v1");
ok("pest middle length", pest.length, 9);
for (const required of ["survey-risk-assessment","ipm-approach","treatment-programme","response-and-callouts","technician-competence","records-reporting","legal-environmental"]) {
  ok(`pest has ${required}`, pest.includes(required), "true");
}
const web = middleOf("website-marketing-v1");
ok("web middle length", web.length, 7);
for (const required of ["approach-and-deliverables","design-build-process","ongoing-marketing","hosting-support","measurement-reporting","timeline-milestones","what-we-need-from-you"]) {
  ok(`web has ${required}`, web.includes(required), "true");
}

console.log("\n── Conditional chapters disappear rather than argue ──");
const CONDITIONAL = "ONLY include this chapter if";
const NO_ARGUING = "do NOT write a chapter explaining that the requirement was not mentioned";
const conditionals = Object.entries(CHAPTER_SETS).flatMap(([id, set]) =>
  set.filter((d) => d.generateGuidance?.includes(CONDITIONAL)).map((d) => `${id}/${d.chapterId}`),
);
ok("conditional chapters exist", conditionals.length > 0, "true");
ok("cleaning TUPE is conditional", conditionals.includes("commercial-cleaning-v1/tupe"), "true");
ok("cleaning social value is conditional", conditionals.includes("commercial-cleaning-v1/social-value"), "true");
ok("IT cybersecurity is NOW conditional", conditionals.includes("it-services-v1/cybersecurity-compliance"), "true");
ok("IT disaster recovery is NOW conditional", conditionals.includes("it-services-v1/disaster-recovery-continuity"), "true");
const arguing = Object.entries(CHAPTER_SETS).flatMap(([id, set]) =>
  set.filter((d) => d.generateGuidance?.includes(CONDITIONAL) && !d.generateGuidance.includes(NO_ARGUING))
     .map((d) => `${id}/${d.chapterId}`),
);
ok("conditional chapters missing the do-not-argue rule", arguing.join(",") || "none", "none");

console.log("\n── No chapter may narrate its sources or print the reference ──");
const HOUSE = "Never mention the supplier's own source documents";
const missing = Object.entries(CHAPTER_SETS).flatMap(([id, set]) =>
  set.filter((d) => d.fillerType !== "always-embed-first-page" && d.chapterId !== "title-page" && !d.generateGuidance?.includes(HOUSE))
     .map((d) => `${id}/${d.chapterId}`),
);
ok("generated chapters without the house rules", missing.join(",") || "none", "none");
const keyPersonnel = SLOT_DEFS.find((d) => d.chapterId === "key-personnel")!;
ok("Key Personnel no longer mentions an absent brochure name", /brochure names no one/.test(keyPersonnel.generateGuidance), "false");
ok("and forbids remarking on it", /never remark on whether anyone is named/.test(keyPersonnel.generateGuidance), "true");

console.log("\n── Tables permitted only where named ──");
const PERMISSION = "You MAY use a table here";
const permitted = Object.entries(CHAPTER_SETS).flatMap(([id, set]) =>
  set.filter((d) => d.generateGuidance?.includes(PERMISSION)).map((d) => `${id}/${d.chapterId}`),
).sort();
ok("chapters permitted a table", permitted.join(","),
   "commercial-cleaning-v1/scope-and-frequencies,it-services-v1/cybersecurity-compliance,it-services-v1/service-level-agreement,pest-control-v1/treatment-programme,website-marketing-v1/timeline-milestones");

console.log("\n── Completeness now reflects reality ──");
for (const key of GTM_SECTOR_KEYS) {
  const c = sectorCompleteness(key)!;
  ok(`${key} owns a chapter set`, c.ownChapterSet, "true");
  ok(`${key} score`, c.score, 5);
  ok(`${key} outstanding`, c.outstanding.join(","), "contract starting point");
}
ok("plumbing does not own one", sectorCompleteness("plumbing")!.ownChapterSet, "false");
ok("sectors defined", SECTOR_KEYS.length, 26);

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
