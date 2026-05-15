// apply-phase2-patches.mjs
//
// Phase 2 — applies three small additive edits to existing files in
// the repo. Idempotent: detects already-applied changes and no-ops.
// Safe to re-run.
//
// Why a script rather than full-file replacements: the three target
// files are large (routers.ts is 5,494 lines; the two schema files
// are 922 + 746). Redelivering them in full to add one line each
// adds risk of accidentally clobbering unrelated work — a small,
// deterministic patch is cleaner and easier to audit.
//
// Usage (Windows, from repo root):
//   node apply-phase2-patches.mjs
//
// The script edits:
//   1. server/routers.ts — adds one import + one sub-router mount
//   2. shared/schema.ts  — adds proposal_template_v2 column on quotes
//   3. drizzle/schema.ts — adds proposal_template_v2 column on quotes
//
// All three changes are pure additions. Existing code is untouched.
// After running, verify the diff in GitHub Desktop before committing.

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname);

let changesApplied = 0;
let alreadyApplied = 0;
const results = [];

// ── Patch 1: routers.ts — import + mount ─────────────────────────────

(function patchRouters() {
  const filePath = resolve(repoRoot, "server/routers.ts");
  if (!existsSync(filePath)) {
    results.push("✗ server/routers.ts not found — are you running from repo root?");
    process.exit(1);
  }
  let src = readFileSync(filePath, "utf8");
  const originalLength = src.length;

  // 1a. Import line — insert directly after the existing brandedProposalRouter import.
  const importMarker = `import { brandedProposalRouter } from "./services/brandedProposalRouter";`;
  const newImport = `import { templateProposalRouter } from "./services/templateProposalRouter";`;
  if (src.includes(newImport)) {
    alreadyApplied++;
    results.push("• routers.ts import: already applied, skipping");
  } else if (src.includes(importMarker)) {
    src = src.replace(importMarker, importMarker + "\n" + newImport);
    changesApplied++;
    results.push("✓ routers.ts import inserted");
  } else {
    results.push("✗ routers.ts: could not find import anchor — file may have been edited; bailing");
    process.exit(1);
  }

  // 1b. Mount line — insert directly after the brandedProposal mount.
  const mountMarker = `  brandedProposal: brandedProposalRouter,`;
  const newMount = `  templateProposal: templateProposalRouter,`;
  if (src.includes(newMount)) {
    alreadyApplied++;
    results.push("• routers.ts mount: already applied, skipping");
  } else if (src.includes(mountMarker)) {
    src = src.replace(mountMarker, mountMarker + "\n" + newMount);
    changesApplied++;
    results.push("✓ routers.ts mount inserted");
  } else {
    results.push("✗ routers.ts: could not find mount anchor — bailing");
    process.exit(1);
  }

  if (src.length !== originalLength) {
    writeFileSync(filePath, src, "utf8");
  }
})();

// ── Patch 2: shared/schema.ts — proposal_template_v2 column ──────────

(function patchSharedSchema() {
  const filePath = resolve(repoRoot, "shared/schema.ts");
  if (!existsSync(filePath)) {
    results.push("✗ shared/schema.ts not found");
    process.exit(1);
  }
  let src = readFileSync(filePath, "utf8");

  // Anchor: the existing proposal_template column on quotes. We add
  // proposal_template_v2 directly after it, with explanatory comment.
  // Distinguish from the org-level proposal_template column (which is
  // .notNull()) by matching the nullable one.
  const marker = `  proposalTemplate: text("proposal_template"),`;
  const insertion = `  proposalTemplate: text("proposal_template"),
  // Phase 2 — v2.1 template library. Stores the picked template id in
  // "sector/style" form (e.g. "it-services/01-split-screen"). NULL means
  // "use sector default" — resolved by templateProposalRouter on render.
  // Coexists with the legacy proposalTemplate column above; old endpoint
  // reads proposalTemplate, new endpoint reads proposalTemplateV2.
  proposalTemplateV2: varchar("proposal_template_v2", { length: 64 }),`;

  if (src.includes(`proposalTemplateV2:`)) {
    alreadyApplied++;
    results.push("• shared/schema.ts: already applied, skipping");
  } else if (src.includes(marker)) {
    src = src.replace(marker, insertion);
    writeFileSync(filePath, src, "utf8");
    changesApplied++;
    results.push("✓ shared/schema.ts: proposal_template_v2 column added");
  } else {
    results.push("✗ shared/schema.ts: could not find anchor — bailing");
    process.exit(1);
  }
})();

// ── Patch 3: drizzle/schema.ts — proposal_template_v2 column ─────────

(function patchDrizzleSchema() {
  const filePath = resolve(repoRoot, "drizzle/schema.ts");
  if (!existsSync(filePath)) {
    results.push("✗ drizzle/schema.ts not found");
    process.exit(1);
  }
  let src = readFileSync(filePath, "utf8");

  // The drizzle schema file lays columns out the same way but may use
  // slightly different formatting. We anchor on the same column name
  // (nullable proposal_template on quotes) but try a couple of variants.
  const variants = [
    `proposalTemplate: text("proposal_template"),`,
    `proposalTemplate: text('proposal_template'),`,
  ];
  const insertion = (marker) => `${marker}
\tproposalTemplateV2: varchar("proposal_template_v2", { length: 64 }),`;

  if (src.includes("proposalTemplateV2:")) {
    alreadyApplied++;
    results.push("• drizzle/schema.ts: already applied, skipping");
    return;
  }

  let matched = false;
  for (const m of variants) {
    if (src.includes(m)) {
      src = src.replace(m, insertion(m));
      writeFileSync(filePath, src, "utf8");
      changesApplied++;
      results.push("✓ drizzle/schema.ts: proposal_template_v2 column added");
      matched = true;
      break;
    }
  }
  if (!matched) {
    // Soft-fail — drizzle/schema.ts is auto-generated by drizzle-kit
    // pull in many setups. If the column ends up missing here it'll
    // get regenerated on next pull. Warn but don't bail.
    results.push("⚠ drizzle/schema.ts: no anchor matched — will be picked up on next drizzle pull");
  }
})();

// ── Summary ───────────────────────────────────────────────────────────

console.log("\n=== Phase 2 patch summary ===");
results.forEach((r) => console.log("  " + r));
console.log(`\nChanges applied: ${changesApplied}`);
console.log(`Already applied: ${alreadyApplied}`);
console.log(`\nNext step: verify the diff in GitHub Desktop, then continue with the README instructions.`);
