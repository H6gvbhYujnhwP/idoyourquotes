// apply-customsections-workspace-wiring.mjs
//
// Phase 4B Custom-Sections delivery — wires the Review modal's new
// initialCustomSections prop into the locked QuoteWorkspace.tsx.
//
// Without this patch, the modal still works (the prop is optional) but
// the user starts with an empty custom-sections list every time they
// re-open the modal on a quote that already has saved custom sections
// — past additions would be invisible. Adding the prop hydrates the
// modal from the tender-context payload the parent already fetches.
//
// WHY A SCRIPT (not a complete file replacement):
//   client/src/pages/QuoteWorkspace.tsx is on the locked-files list and
//   gets idempotent patch scripts, not full-file deliveries. The change
//   here is a single prop addition on the Quick-mode ReviewBeforeGenerate-
//   Modal call site — the Branded-mode invocation a few lines below is
//   intentionally NOT patched, since custom sections are Quick-mode only.
//
// WHAT IT DOES:
//   - Locates the Quick-mode ReviewBeforeGenerateModal invocation by
//     anchoring on the unique `orgDefaults={{` block that immediately
//     follows the initialExclusions prop in that invocation.
//   - Inserts the initialCustomSections prop between initialExclusions
//     and orgDefaults.
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched.
// Exits 1 only if the file is missing, the anchor isn't unique, or the
// file is in mixed state.
//
// Usage (Windows, from repo root):
//   node apply-customsections-workspace-wiring.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname);
const targetPath = resolve(repoRoot, "client/src/pages/QuoteWorkspace.tsx");

if (!existsSync(targetPath)) {
  console.error(
    "\u2717 client/src/pages/QuoteWorkspace.tsx not found \u2014 run from repo root.",
  );
  process.exit(1);
}

// Sentinel: present once the patch has landed.
const SENTINEL = "initialCustomSections={";

// The exact OLD block. Anchored on the Quick-mode invocation's pattern:
// initialExclusions={...} immediately followed by orgDefaults={{...
// This pair appears in the Branded-mode invocation too, but the
// Branded one uses brandedExclusions defaults rather than the
// defaultExclusions used here — so we anchor on the defaultExclusions
// line inside the orgDefaults object to uniquely identify the
// Quick-mode call. Verified to appear exactly once in the file.
const OLD = `        initialExclusions={
          (fullQuote as any)?.tenderContext?.exclusions ?? null
        }
        orgDefaults={{
          defaultTerms: (orgProfile as any)?.defaultTerms ?? null,
          defaultExclusions: (orgProfile as any)?.defaultExclusions ?? null,
        }}`;

const NEW = `        initialExclusions={
          (fullQuote as any)?.tenderContext?.exclusions ?? null
        }
        initialCustomSections={
          (fullQuote as any)?.tenderContext?.customSections ?? null
        }
        orgDefaults={{
          defaultTerms: (orgProfile as any)?.defaultTerms ?? null,
          defaultExclusions: (orgProfile as any)?.defaultExclusions ?? null,
        }}`;

const original = readFileSync(targetPath, "utf8");

const alreadyPatched = original.includes(SENTINEL);
const oldCount = (original.match(new RegExp(escapeRegex(OLD), "g")) || []).length;

if (alreadyPatched && oldCount === 0) {
  console.log(
    "\u2713 QuoteWorkspace.tsx \u2014 already patched (initialCustomSections prop present, original anchor consumed). Nothing to do.",
  );
  process.exit(0);
}

if (alreadyPatched && oldCount > 0) {
  console.error(
    "\u2717 QuoteWorkspace.tsx \u2014 mixed state: sentinel found AND original anchor still present. Manual review required.",
  );
  process.exit(1);
}

if (oldCount === 0) {
  console.error(
    "\u2717 QuoteWorkspace.tsx \u2014 anchor block not found. File doesn't match the expected shape; refusing to edit blindly.",
  );
  console.error("   Looked for anchor:");
  console.error("   " + OLD.split("\n").map((l) => "    " + l).join("\n"));
  process.exit(1);
}

if (oldCount > 1) {
  console.error(
    `\u2717 QuoteWorkspace.tsx \u2014 anchor block found ${oldCount} times; not unique. Aborting rather than corrupt unintended sites.`,
  );
  process.exit(1);
}

const patched = original.replace(OLD, NEW);

if (patched === original) {
  console.error(
    "\u2717 QuoteWorkspace.tsx \u2014 replace produced no change. Aborting.",
  );
  process.exit(1);
}

writeFileSync(targetPath, patched, "utf8");
console.log(
  "\u2713 QuoteWorkspace.tsx \u2014 patched. Added initialCustomSections prop to the Quick-mode ReviewBeforeGenerateModal call.",
);
console.log(
  "  (Idempotent: a second run will report already-patched and exit 0.)",
);
process.exit(0);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
