// apply-phase3-patches.mjs
//
// Phase 3 — surgical edit to client/src/pages/QuoteWorkspace.tsx so the
// "Use a branded colour template" trigger opens the new
// BrandedTemplatePickerV2 instead of the legacy BrandChoiceModal.
//
// Four additive edits, each anchored on a unique string in the file:
//   1. NEW IMPORT — adds the BrandedTemplatePickerV2 import.
//   2. NEW STATE — adds showBrandedTemplatePickerV2 state next to the
//      legacy showBrandChoiceModal state.
//   3. TRIGGER SWAP — inside handlePickerSelectContractTender, changes
//      `setShowBrandChoiceModal(true)` to `setShowBrandedTemplatePickerV2(true)`.
//      This is the only line that's MODIFIED rather than added. Legacy
//      modal still exists in the file but never opens (dead code; safe
//      to remove in a later cleanup).
//   4. NEW JSX — mounts the new picker just before the legacy
//      BrandChoiceModal JSX.
//
// Idempotent: detects already-applied state and no-ops.
//
// Usage (Windows, from repo root):
//   node apply-phase3-patches.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname);
const filePath = resolve(repoRoot, "client/src/pages/QuoteWorkspace.tsx");

if (!existsSync(filePath)) {
  console.error("✗ client/src/pages/QuoteWorkspace.tsx not found — are you running from repo root?");
  process.exit(1);
}

let src = readFileSync(filePath, "utf8");
let changesApplied = 0;
let alreadyApplied = 0;
const results = [];

// ── Patch 1: import line ─────────────────────────────────────────────

const importMarker = `import BrandChoiceModal, { type BrandMode } from "@/components/BrandChoiceModal";`;
const importInsertion = `import BrandedTemplatePickerV2 from "@/components/BrandedTemplatePickerV2";`;
if (src.includes(importInsertion)) {
  alreadyApplied++;
  results.push("• import: already applied, skipping");
} else if (src.includes(importMarker)) {
  src = src.replace(importMarker, importMarker + "\n" + importInsertion);
  changesApplied++;
  results.push("✓ import inserted");
} else {
  console.error("✗ Could not find import anchor — has QuoteWorkspace.tsx been edited heavily? Bailing.");
  process.exit(1);
}

// ── Patch 2: state declaration ───────────────────────────────────────

const stateMarker = `  const [showBrandChoiceModal, setShowBrandChoiceModal] = useState(false);`;
const stateInsertion = `  // Phase 3 — v2.1 template picker. Sibling to showBrandChoiceModal;
  // both modals are mounted, but the picker trigger now opens this one
  // and the legacy modal's open flag never becomes true. Legacy is dead
  // code; safe to remove in a later cleanup once Phase 3 is verified.
  const [showBrandedTemplatePickerV2, setShowBrandedTemplatePickerV2] = useState(false);`;
if (src.includes("showBrandedTemplatePickerV2")) {
  alreadyApplied++;
  results.push("• state: already applied, skipping");
} else if (src.includes(stateMarker)) {
  src = src.replace(stateMarker, stateMarker + "\n" + stateInsertion);
  changesApplied++;
  results.push("✓ state inserted");
} else {
  console.error("✗ Could not find state anchor — bailing.");
  process.exit(1);
}

// ── Patch 3: trigger swap ────────────────────────────────────────────
//
// Inside handlePickerSelectContractTender, swap which modal opens.
// The handler is short enough that we can match on its full body and
// avoid any other call sites of setShowBrandChoiceModal(true).

const triggerMarker =
  `  const handlePickerSelectContractTender = () => {
    setShowFormatPickerModal(false);
    setShowBrandChoiceModal(true);
  };`;
const triggerReplacement =
  `  const handlePickerSelectContractTender = () => {
    setShowFormatPickerModal(false);
    // Phase 3 — opens the v2.1 template picker. Legacy modal still
    // mounted but unreachable from this trigger.
    setShowBrandedTemplatePickerV2(true);
  };`;
if (src.includes(triggerReplacement)) {
  alreadyApplied++;
  results.push("• trigger: already applied, skipping");
} else if (src.includes(triggerMarker)) {
  src = src.replace(triggerMarker, triggerReplacement);
  changesApplied++;
  results.push("✓ trigger swapped");
} else {
  console.error("✗ Could not find trigger anchor — bailing.");
  process.exit(1);
}

// ── Patch 4: new modal JSX ───────────────────────────────────────────
//
// Insert the new picker just before the legacy BrandChoiceModal JSX.
// Uses the `<BrandChoiceModal` line as the anchor.

const jsxMarker = `      <BrandChoiceModal`;
const jsxInsertion =
  `      {/* Phase 3 — v2.1 template picker. Sector-filtered six-design
          grid that drives the new generateBrandedProposalV2 endpoint.
          Replaces the legacy BrandChoiceModal in the user-visible flow;
          legacy mount kept below but its open state is never set. */}
      <BrandedTemplatePickerV2
        open={showBrandedTemplatePickerV2}
        onDismiss={() => setShowBrandedTemplatePickerV2(false)}
        onBack={() => {
          setShowBrandedTemplatePickerV2(false);
          setShowFormatPickerModal(true);
        }}
        quoteId={quoteId}
        tradePreset={tradePreset}
        onGenerated={async () => {
          const currentStatus = (quote as any)?.status as string | undefined;
          if (currentStatus && currentStatus !== "pdf_generated") {
            try {
              await updateStatus.mutateAsync({
                id: quoteId,
                status: "pdf_generated",
              });
            } catch (err) {
              console.warn(
                "[QuoteWorkspace] phase 3 pdf_generated status flip failed:",
                err,
              );
            }
          }
        }}
      />

`;
if (src.includes("<BrandedTemplatePickerV2")) {
  alreadyApplied++;
  results.push("• modal JSX: already applied, skipping");
} else if (src.includes(jsxMarker)) {
  src = src.replace(jsxMarker, jsxInsertion + jsxMarker);
  changesApplied++;
  results.push("✓ modal JSX inserted");
} else {
  console.error("✗ Could not find JSX anchor — bailing.");
  process.exit(1);
}

// ── Write back ───────────────────────────────────────────────────────

if (changesApplied > 0) {
  writeFileSync(filePath, src, "utf8");
}

console.log("\n=== Phase 3 patch summary ===");
results.forEach((r) => console.log("  " + r));
console.log(`\nChanges applied: ${changesApplied}`);
console.log(`Already applied: ${alreadyApplied}`);
console.log("\nNext: verify the diff in GitHub Desktop, run tsc to confirm baseline holds, then commit + push.");
