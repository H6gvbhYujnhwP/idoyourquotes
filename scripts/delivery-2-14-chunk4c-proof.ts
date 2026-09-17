/**
 * Delivery 2.14 Chunk 4c proof — no invented start dates.
 *
 * A contract's Executive Summary said service started 1 September while
 * its own Acceptance page said 1 October. The model is never given the
 * commencement date — QuoteContext has no date field at all — so any
 * date in chapter prose is invented, and a document naming two
 * different start dates contradicts itself in front of the client.
 *
 *   npx tsx scripts/delivery-2-14-chunk4c-proof.ts
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

const source = fs.readFileSync(
  path.resolve(process.cwd(), "server", "engines", "brandedProposalEngine.ts"),
  "utf8",
);

console.log("── The rule exists and is unambiguous ──");
ok("rule present", source.includes("NEVER STATE WHEN THE SERVICE STARTS"), "true");
ok("names the forms it must not use", source.includes('not "from 1 September"'), "true");
ok("explains why it cannot know", source.includes("typed by the supplier when the contract is produced"), "true");
ok("gives a dateless alternative", source.includes("from the agreed commencement date"), "true");

console.log("\n── Both prompt paths inherit it ──");
// The rule sits in AUTHORITY_HIERARCHY_RULES rather than in one
// chapter's guidance, so the full draft and the single-chapter
// regenerate both carry it. The fault appeared in an Executive Summary,
// but any chapter could have produced it.
const interpolations = source.match(/\$\{AUTHORITY_HIERARCHY_RULES\}/g) ?? [];
ok("prompts interpolating the shared rules", interpolations.length, 2);
ok("the rule is inside those shared rules", source.indexOf("NEVER STATE WHEN THE SERVICE STARTS") > source.indexOf("AUTHORITY_HIERARCHY_RULES = `"), "true");
ok(
  "and before the block closes",
  source.indexOf("NEVER STATE WHEN THE SERVICE STARTS") <
    source.indexOf("`.trim();", source.indexOf("AUTHORITY_HIERARCHY_RULES = `")),
  "true",
);

console.log("\n── The model still has no date to work from ──");
// If a date ever IS given to the engine, this rule has to be revisited
// rather than left contradicting the facts block. Asserting the absence
// makes that a failing test rather than a silent inconsistency.
const engine = await import("../server/engines/brandedProposalEngine");
const buildQuoteFactsBlock = (engine as any).buildQuoteFactsBlock as
  | ((qc: any) => string)
  | undefined;
if (!buildQuoteFactsBlock) {
  console.log("  SKIP  buildQuoteFactsBlock is not exported — facts-block assertion skipped");
} else {
  const facts = buildQuoteFactsBlock({
    clientName: "Sorrells Custom Wine Cellars",
    title: "Comprehensive IT Support",
    reference: "Q-1789392897217",
    lineItems: [],
  });
  ok("facts block mentions no commencement date", /commencement|start date|go-live/i.test(facts), "false");
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail === 0 ? 0 : 1);
