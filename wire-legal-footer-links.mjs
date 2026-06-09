#!/usr/bin/env node
/**
 * wire-legal-footer-links.mjs
 * ─────────────────────────────────────────────────────────────────
 * One-shot, idempotent patch that wires the footer "Privacy Policy"
 * and "Terms of Service" entries on the three public marketing
 * pages (Home, Pricing, Features) to the new /privacy and /terms
 * routes.
 *
 * Why a script rather than three full-file replacements:
 *   - Each of the three pages is 500-700 lines and only 2 lines per
 *     file actually change. A patch script is dramatically less
 *     noisy than three full files in the chat / commit diff.
 *   - Mirrors the in-repo convention (apply-template-quality-
 *     fixes.mjs, apply-phaseN-patches.mjs) for surgical, idempotent,
 *     anchor-based multi-file changes.
 *
 * Safety:
 *   - Anchor-based exact-string match. If an anchor isn't found,
 *     the file is reported as "skipped" — no mutation.
 *   - Idempotent. Re-running after a successful run reports
 *     "already patched" and changes nothing.
 *   - Both Link imports are already present at the top of all three
 *     target files (verified before script was written), so no
 *     import edits are needed.
 *
 * Run:
 *   node wire-legal-footer-links.mjs
 *
 * Expected on a fresh run:
 *   Privacy   newly patched : 3   already patched : 0   skipped : 0
 *   Terms     newly patched : 3   already patched : 0   skipped : 0
 *
 * Expected on a re-run:
 *   Privacy   newly patched : 0   already patched : 3   skipped : 0
 *   Terms     newly patched : 0   already patched : 3   skipped : 0
 */
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const _filename = fileURLToPath(import.meta.url);
const _dirname = dirname(_filename);

const TARGETS = [
  "client/src/pages/Home.tsx",
  "client/src/pages/Pricing.tsx",
  "client/src/pages/Features.tsx",
];

const REPLACEMENTS = [
  {
    label: "Privacy Policy",
    from: `<li><span className="opacity-60">Privacy Policy</span></li>`,
    to: `<li><Link href="/privacy" className="hover:text-[#0d9488] transition-colors">Privacy Policy</Link></li>`,
  },
  {
    label: "Terms of Service",
    from: `<li><span className="opacity-60">Terms of Service</span></li>`,
    to: `<li><Link href="/terms" className="hover:text-[#0d9488] transition-colors">Terms of Service</Link></li>`,
  },
];

let totalPatched = 0;
let totalAlready = 0;
let totalSkipped = 0;
const perFileSummary = [];

for (const rel of TARGETS) {
  const path = resolve(_dirname, rel);
  if (!existsSync(path)) {
    console.error(`  ✗ missing file: ${rel}`);
    totalSkipped += REPLACEMENTS.length;
    perFileSummary.push({ rel, patched: 0, already: 0, skipped: REPLACEMENTS.length });
    continue;
  }
  let src = readFileSync(path, "utf8");
  let patched = 0;
  let already = 0;
  let skipped = 0;
  for (const r of REPLACEMENTS) {
    if (src.includes(r.to)) {
      already++;
      continue;
    }
    if (src.includes(r.from)) {
      src = src.replace(r.from, r.to);
      patched++;
      continue;
    }
    // Neither pre- nor post-state anchor present: don't touch.
    console.warn(`  ! anchor not found in ${rel} for "${r.label}" — skipped`);
    skipped++;
  }
  if (patched > 0) writeFileSync(path, src);
  totalPatched += patched;
  totalAlready += already;
  totalSkipped += skipped;
  perFileSummary.push({ rel, patched, already, skipped });
}

console.log("Footer legal-link wiring — summary");
for (const s of perFileSummary) {
  console.log(
    `  ${s.rel.padEnd(34)} patched: ${s.patched}  already: ${s.already}  skipped: ${s.skipped}`,
  );
}
console.log(
  `\n  TOTAL  patched: ${totalPatched}  already patched: ${totalAlready}  skipped: ${totalSkipped}`,
);

if (totalSkipped > 0) {
  console.error("\n  ✗ One or more anchors missing — inspect the warnings above.");
  process.exit(1);
}
console.log("\n  ✓ Done. Footer links wired on all three public pages.");
