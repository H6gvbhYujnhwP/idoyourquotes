/**
 * Delivery 2.14 Chunk 4a proof — markdown in chapter bodies.
 *
 * A regenerated Cybersecurity & Compliance chapter came back as a
 * markdown table and printed its pipes, dashes and asterisks to the
 * client (Sorrells, 17 Sep 2026). Two independent causes, both asserted
 * here so neither can come back:
 *
 *   1. The single-chapter regenerate prompt never carried the
 *      plain-text rule that the full-draft prompt ends with. The draft
 *      path was told to stay plain and did; the regenerate path was not
 *      told anything, which is why the fault only ever appeared on a
 *      regenerate.
 *
 *   2. That chapter's own guidance said "Brief table-of-controls format
 *      works well here" — asking for a layout the renderer cannot draw.
 *
 * These assertions read the real prompt strings rather than a copy, so
 * they fail if either rule is edited away later.
 *
 *   npx tsx scripts/delivery-2-14-chunk4a-proof.ts
 */

process.env.OPENAI_API_KEY ||= "not-used-by-this-proof";

import * as fs from "fs";
import * as path from "path";

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

const enginePath = path.resolve(process.cwd(), "server", "engines", "brandedProposalEngine.ts");
const source = fs.readFileSync(enginePath, "utf8");

console.log("── Both prompts now carry a plain-text rule ──");
// The draft prompt has always had one; the regenerate prompt had none.
const plainTextRules = source.match(/No HTML, no markdown/g) ?? [];
ok("prompts carrying the rule", plainTextRules.length, 2);
// Delivery 2.14 Chunk 4b — the rule became CONDITIONAL rather than
// absolute: tables are drawable now, but only where a chapter's own
// guidance permits one. Both prompts must say so, or the prompt and the
// chapter guidance contradict each other and the model picks either.
ok(
  "the draft prompt scopes tables to permitting chapters",
  source.includes("ONLY in a chapter whose own guidance explicitly permits one"),
  "true",
);
ok(
  "the regenerate prompt scopes them the same way",
  source.includes("Tables are allowed ONLY where this chapter's guidance above explicitly permits one"),
  "true",
);
ok("and both say why", source.includes("printed literally to the client"), "true");

console.log("── No chapter asks for markup the renderer cannot draw ──");
const engine = await import("../server/engines/brandedProposalEngine");
const SLOT_DEFS = (engine as any).SLOT_DEFS as Array<{
  chapterId: string;
  slotName: string;
  generateGuidance: string;
}>;

// Several chapters legitimately NAME markdown and tables in order to
// forbid them — Title Page, Pricing Summary, and now Cybersecurity
// itself. So the test has to distinguish an invitation from a
// prohibition, which a plain keyword match does not: the first version
// of this assertion flagged "Do NOT use a markdown table" as an
// offender. Negated sentences are dropped before matching.
const INVITES = [
  /table[- ]of[- ]\w+ format/i,
  /use a (markdown )?table/i,
  /format as a table/i,
  /bullet points? using [-*•]/i,
];
const NEGATED = /\b(do not|don't|never|avoid|no)\b/i;
const invitesMarkup = (guidance: string) =>
  guidance
    .split(/(?<=[.:])\s+/)
    .filter((sentence) => !NEGATED.test(sentence))
    .some((sentence) => INVITES.some((re) => re.test(sentence)));

// Delivery 2.14 Chunk 4b — inviting a table is now LEGITIMATE, but only
// for a chapter that carries the permission text, which also states the
// four-column cap and forbids other markup. So the assertion changed
// from "nobody invites a table" to "nobody invites one without saying
// what is allowed".
const PERMISSION = "You MAY use a table here";
const offenders = SLOT_DEFS.filter(
  (d) => invitesMarkup(d.generateGuidance) && !d.generateGuidance.includes(PERMISSION),
).map((d) => d.chapterId);
ok("chapters inviting a table without the permission text", offenders.join(",") || "none", "none");
ok("chapters checked", SLOT_DEFS.length, 19);

// Named chapters only — owner's decision, 17 Sep 2026. If this count
// grows, it grew deliberately.
const permitted = SLOT_DEFS.filter((d) => d.generateGuidance.includes(PERMISSION)).map(
  (d) => d.chapterId,
);
ok("chapters permitted to use a table", permitted.join(","), "cybersecurity-compliance,service-level-agreement");
ok("every permitted chapter states the cap", permitted.every((id) => SLOT_DEFS.find((d) => d.chapterId === id)!.generateGuidance.includes("Maximum FOUR columns")), "true");

console.log("── The chapter that caused it is now permitted, with rules ──");
const cyber = SLOT_DEFS.find((d) => d.chapterId === "cybersecurity-compliance")!;
// 4a banned tables here; 4b draws them, so the ban is lifted for this
// chapter specifically rather than everywhere.
ok("no longer the vague original wording", /table-of-controls format works well/.test(cyber.generateGuidance), "false");
ok("carries the permission", cyber.generateGuidance.includes(PERMISSION), "true");
ok("states the four-column cap", /Maximum FOUR columns/.test(cyber.generateGuidance), "true");
ok("still forbids other markup", /no asterisks for emphasis/.test(cyber.generateGuidance), "true");
// The two-column mapping is the right way to present controls, so the
// substance has to survive every one of these rewrites.
ok("keeps the control-area content", /GDPR, MFA, endpoint protection/.test(cyber.generateGuidance), "true");

console.log("── The chapter set is otherwise untouched ──");
ok("chapter count", SLOT_DEFS.length, 19);
ok("cybersecurity still at its own position", cyber.slotName, "Cybersecurity & Compliance");

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
