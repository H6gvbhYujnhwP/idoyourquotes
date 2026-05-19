// apply-tile3-copy-fix.mjs
//
// Tile-2-retirement delivery — surgical copy fix for the locked
// client/src/pages/QuoteWorkspace.tsx.
//
// WHY A SCRIPT (not a complete file replacement):
//   QuoteWorkspace.tsx is on the locked-files list and gets idempotent
//   patch scripts, not full-file deliveries. The change here is a
//   two-word string-literal swap inside the description prop passed to
//   BrochureUploadModal: "every Tile 3 proposal" -> "every branded
//   proposal". With Tile 2 retired in this delivery there is only one
//   branded proposal path, so internal nomenclature ("Tile 3") in
//   user-facing copy stops carrying meaning.
//
// WHAT IT DOES:
//   - Reads <repo>/client/src/pages/QuoteWorkspace.tsx.
//   - If the NEW copy is already present  -> reports already-patched.
//   - Else if the OLD copy is present     -> swaps in place, writes.
//   - Else (neither present)              -> reports skipped (file
//                                            doesn't match expected
//                                            shape; never silently
//                                            corrupt).
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched;
// exits 1 only if the file is missing or in an unexpected shape.
//
// Usage (Windows, from repo root):
//   node apply-tile3-copy-fix.mjs

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

// The exact OLD substring we replace. Verified unique across the
// 3,397-line file: appears exactly once, in the BrochureUploadModal
// description prop at the Tile 3 first-run call site. Deliberately
// kept short and free of sentence-initial casing so the script
// doesn't break if surrounding wording shifts slightly later.
const OLD = "weave them into every Tile 3 proposal you generate from now on.";

// The exact NEW substring. Same shape, "Tile 3" -> "branded".
const NEW = "weave them into every branded proposal you generate from now on.";

const original = readFileSync(targetPath, "utf8");

const oldCount = (original.match(new RegExp(escapeRegex(OLD), "g")) || []).length;
const newCount = (original.match(new RegExp(escapeRegex(NEW), "g")) || []).length;

if (newCount > 0 && oldCount === 0) {
  console.log(
    "\u2713 QuoteWorkspace.tsx \u2014 already patched (NEW copy present, OLD copy absent). Nothing to do.",
  );
  process.exit(0);
}

if (oldCount === 0 && newCount === 0) {
  console.error(
    "\u2717 QuoteWorkspace.tsx \u2014 neither OLD nor NEW copy found. File doesn't match the expected shape; refusing to edit blindly.",
  );
  console.error("   Looked for OLD:");
  console.error(`   \"${OLD}\"`);
  process.exit(1);
}

if (oldCount > 1) {
  console.error(
    `\u2717 QuoteWorkspace.tsx \u2014 OLD copy found ${oldCount} times; anchor is not unique. Aborting rather than corrupt unintended sites.`,
  );
  process.exit(1);
}

// Mixed state (both old and new in the file) shouldn't happen given OLD
// and NEW are nearly identical, but report and abort if it does.
if (oldCount > 0 && newCount > 0) {
  console.error(
    "\u2717 QuoteWorkspace.tsx \u2014 BOTH OLD and NEW copies present. Mixed state; manual review required.",
  );
  process.exit(1);
}

// Straight one-shot replace; oldCount is 1 here.
const patched = original.replace(OLD, NEW);

if (patched === original) {
  // Defensive — should be impossible given the count checks above.
  console.error("\u2717 QuoteWorkspace.tsx \u2014 replace produced no change. Aborting.");
  process.exit(1);
}

writeFileSync(targetPath, patched, "utf8");
console.log(
  '\u2713 QuoteWorkspace.tsx \u2014 patched. "every Tile 3 proposal" \u2192 "every branded proposal".',
);
console.log(
  "  (Idempotent: a second run will report already-patched and exit 0.)",
);
process.exit(0);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
