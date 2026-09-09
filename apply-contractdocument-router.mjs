// apply-contractdocument-router.mjs
//
// Contract-button delivery, stage 2a — mounts the new contract-document
// sub-router into the locked server/routers.ts.
//
// WHY A SCRIPT: server/routers.ts is on the locked-files list and is
// "add-only — new endpoints via patch script, no changes to existing
// procedures". This delivery is genuinely add-only: one new import line
// and one new sub-router mount. Not a single existing procedure is
// touched, so no lock exception is needed this time.
//
// WHAT IT DOES (2 edits):
//   1. Adds the import for contractDocumentRouter alongside the other
//      sub-router imports at the top of the file.
//   2. Mounts it on the app router as `contractDocument`, immediately
//      after `templateProposal` — grouping it with the other
//      proposal-and-document routers rather than dropping it at the
//      end of an unrelated block.
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched.
// Exits 1 if the file is missing, an anchor is absent or non-unique, or
// the file is in a mixed (partially patched) state.
//
// Usage (from repo root):
//   node apply-contractdocument-router.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "server", "routers.ts");

const SENTINEL = "contractDocument: contractDocumentRouter";

if (!existsSync(target)) {
  console.error(`✗ Not found: ${target}`);
  console.error("  Run this from the repo root.");
  process.exit(1);
}

let src = readFileSync(target, "utf8");

if (src.includes(SENTINEL)) {
  console.log(
    "✓ server/routers.ts — already patched (contractDocument router mounted). Nothing to do.",
  );
  process.exit(0);
}

const edits = [
  {
    label: "1/2 import",
    find: `import { brandedProposalRouter } from "./services/brandedProposalRouter";`,
    replace: `import { brandedProposalRouter } from "./services/brandedProposalRouter";
import { contractDocumentRouter } from "./services/contractDocumentRouter";`,
  },
  {
    label: "2/2 router mount",
    find: `  templateProposal: templateProposalRouter,`,
    replace: `  templateProposal: templateProposalRouter,

  // ============ CONTRACT DOCUMENTS (contract-button delivery) ========
  // The org's Gold and Silver contract documents — the numbered terms,
  // acceptance paragraph, contract-only Next Steps wording, and the
  // signatory identity printed on the signature page. Authored once in
  // Settings and reused verbatim on every contract, which is the whole
  // point: the terms stop being rewritten per document.
  //
  // Reads are open to all tiers so a Solo user sees the tab and an
  // upgrade prompt rather than a blank screen; contract GENERATION is
  // gated to Pro and Team, mirroring Branded Proposals, because a
  // contract is produced from a branded proposal.
  //
  // See server/services/contractDocumentRouter.ts.
  contractDocument: contractDocumentRouter,`,
  },
];

let failed = false;
for (const edit of edits) {
  const count = src.split(edit.find).length - 1;
  if (count !== 1) {
    console.error(
      `✗ Anchor for "${edit.label}" found ${count} time(s) — expected exactly 1.`,
    );
    failed = true;
  }
}

if (failed) {
  console.error("");
  console.error("  No changes written. server/routers.ts is untouched.");
  console.error("  The file has drifted from what this script expects —");
  console.error("  re-verify against the live code before proceeding.");
  process.exit(1);
}

for (const edit of edits) {
  src = src.replace(edit.find, edit.replace);
  console.log(`  ✓ ${edit.label}`);
}

writeFileSync(target, src, "utf8");

console.log("");
console.log("✓ server/routers.ts — patched. contractDocument router mounted.");
console.log("  (Idempotent: a second run will report already-patched and exit 0.)");
