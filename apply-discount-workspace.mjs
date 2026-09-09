// apply-discount-workspace.mjs
//
// Discount delivery — adds the per-line Disc % column to the quote
// workspace line-item table, and makes the workspace's profit and
// margin figures discount-aware.
//
// WHY A SCRIPT: client/src/pages/QuoteWorkspace.tsx is on the
// locked-files list and takes idempotent patch scripts rather than
// complete file replacements.
//
// WHAT IT DOES (5 edits):
//   1. Row total fallback — when a row has no stored total yet (a
//      brand-new row, mid-type), the on-screen figure falls back to
//      qty × rate. That fallback now applies the discount too, so the
//      Total cell doesn't briefly show the undiscounted figure before
//      the save round-trips.
//   2. Table header — new "Disc %" column between Rate and Total.
//      All ten column widths rebalanced so the grid still totals 100%.
//   3. Table row — the matching editable Disc % cell.
//   4. Row PROFIT cell — margin computed against the DISCOUNTED sell
//      price, not the list price.
//   5. Green totals card — the same correction for the aggregate
//      one-off / monthly / annual profit figures.
//
// WHY 4 AND 5 MATTER MOST:
//   `rate` deliberately holds the LIST price so the concession stays
//   visible on the customer document. That means every profit
//   calculation reading `rate` directly is now overstating margin on
//   any discounted line. There are exactly two such calculations in
//   this file (the per-row cell and the totals memo) and both are
//   corrected here. The dashboard's equivalent aggregate is corrected
//   separately in server/db.ts.
//
// COLUMN WIDTHS: the pre-patch grid was 9+24+8+8+10+10+10+9+8+4 = 100.
// The new grid is 8+22+7+7+9+6+10+9+9+8+5 = 100. The customer-facing
// block gives up a little width; the internal COST/PROFIT block keeps
// its weight and its dashed boundary border.
//
// BACKWARD COMPATIBILITY: a row with no discount (null) behaves exactly
// as before — the multiplier is 1, the Disc box renders empty, and the
// profit arithmetic is unchanged.
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched.
// Exits 1 if the file is missing, an anchor is absent or non-unique, or
// the file is in a mixed (partially patched) state.
//
// Usage (Windows, from repo root):
//   node apply-discount-workspace.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(
  __dirname,
  "client",
  "src",
  "pages",
  "QuoteWorkspace.tsx",
);

const SENTINEL = "DISCOUNT_DELIVERY_WORKSPACE";

if (!existsSync(target)) {
  console.error(`✗ Not found: ${target}`);
  console.error("  Run this from the repo root.");
  process.exit(1);
}

let src = readFileSync(target, "utf8");

if (src.includes(SENTINEL)) {
  console.log(
    "✓ client/src/pages/QuoteWorkspace.tsx — already patched (Disc % column present). Nothing to do.",
  );
  process.exit(0);
}

const edits = [
  // ── 1. Row total fallback ─────────────────────────────────────────
  {
    label: "1/5 rowTotal — discount-aware fallback",
    find: `  const rowTotal = useMemo(() => {
    const q = parseNum(row.quantity);
    const r = parseNum(row.rate);
    const stored = parseNum(row.total);
    return stored || q * r;
  }, [row.quantity, row.rate, row.total]);`,
    replace: `  // ${SENTINEL} — the stored total already carries the discount (the
  // server applies it on save). This fallback only fires for a row
  // that has no stored total yet, so it has to apply the discount
  // itself or the Total cell flickers to the undiscounted figure
  // between keystroke and save.
  const rowTotal = useMemo(() => {
    const q = parseNum(row.quantity);
    const r = parseNum(row.rate);
    const d = clampDiscount((row as any).discountPercent);
    const stored = parseNum(row.total);
    return stored || q * r * (1 - d / 100);
  }, [row.quantity, row.rate, row.total, (row as any).discountPercent]);`,
  },

  // ── 2. Table header ───────────────────────────────────────────────
  {
    label: "2/5 table header — Disc % column + width rebalance",
    find: `            <th className="text-left px-2 py-2 w-[9%]">Catalog</th>
            <th className="text-left px-4 py-2 w-[24%]">Line item</th>
            <th className="text-right px-2 py-2 w-[8%]">Qty</th>
            <th className="text-left px-2 py-2 w-[8%]">Unit</th>
            <th className="text-right px-2 py-2 w-[10%]">Rate</th>
            <th className="text-right px-2 py-2 w-[10%]">Total</th>`,
    replace: `            <th className="text-left px-2 py-2 w-[8%]">Catalog</th>
            <th className="text-left px-4 py-2 w-[22%]">Line item</th>
            <th className="text-right px-2 py-2 w-[7%]">Qty</th>
            <th className="text-left px-2 py-2 w-[7%]">Unit</th>
            <th className="text-right px-2 py-2 w-[9%]">Rate</th>
            {/* Discount delivery — negotiated discount per line, as a
                percentage off the Rate. Sits between Rate and Total so
                the customer-facing arithmetic reads left to right:
                qty × rate − discount = total. Grid rebalanced to
                8+22+7+7+9+6+10+9+9+8+5 = 100. */}
            <th
              className="text-right px-2 py-2 w-[6%]"
              title="Discount off the Rate for this line, as a percentage"
            >
              Disc %
            </th>
            <th className="text-right px-2 py-2 w-[10%]">Total</th>`,
  },

  // ── 2b. Remaining header widths ───────────────────────────────────
  {
    label: "2/5 table header — trailing column widths",
    find: `            <th className="text-left px-2 py-2 w-[10%]">Type</th>
            <th
              className="text-right px-2 py-2 w-[9%]"
              style={{ borderLeft: \`1px dashed \${brand.borderLight}\` }}
              title="Internal — not shown on customer PDF"
            >
              Buy-in Cost
            </th>
            <th
              className="text-right px-2 py-2 w-[8%]"
              title="Internal — not shown on customer PDF"
            >
              Profit
            </th>
            <th className="w-[4%]" />`,
    replace: `            <th className="text-left px-2 py-2 w-[9%]">Type</th>
            <th
              className="text-right px-2 py-2 w-[9%]"
              style={{ borderLeft: \`1px dashed \${brand.borderLight}\` }}
              title="Internal — not shown on customer PDF"
            >
              Buy-in Cost
            </th>
            <th
              className="text-right px-2 py-2 w-[8%]"
              title="Internal — not shown on customer PDF"
            >
              Profit
            </th>
            <th className="w-[5%]" />`,
  },

  // ── 3. Table row cell ─────────────────────────────────────────────
  {
    label: "3/5 table row — Disc % cell",
    find: `      <td className="px-2 py-2 text-right">
        <RowCellInput
          value={row.rate || ""}
          onSave={(v) => onSave(row.id, { rate: v })}
          align="right"
          inputMode="decimal"
          placeholder="0.00"
        />
      </td>`,
    replace: `      <td className="px-2 py-2 text-right">
        <RowCellInput
          value={row.rate || ""}
          onSave={(v) => onSave(row.id, { rate: v })}
          align="right"
          inputMode="decimal"
          placeholder="0.00"
        />
      </td>
      {/* Discount delivery — editable discount percentage. Blank means
          no discount (the server normalises "" to null), so the box
          reads empty rather than "0" on every undiscounted line, which
          would be visual noise on a long quote. Click propagation is
          stopped so editing doesn't toggle the row's active state,
          matching the COST cell. */}
      <td
        className="px-2 py-2 text-right"
        onClick={(e) => e.stopPropagation()}
      >
        <RowCellInput
          value={(row as any).discountPercent ?? ""}
          onSave={(v) => onSave(row.id, { discountPercent: v })}
          align="right"
          inputMode="decimal"
          placeholder="—"
        />
      </td>`,
  },

  // ── 4. Row PROFIT cell ────────────────────────────────────────────
  {
    label: "4/5 row PROFIT cell — margin against discounted price",
    find: `          const cost = parseNum(costRaw);
          const rate = parseNum(row.rate);
          const profitPerUnit = rate - cost;
          const totalProfit = profitPerUnit * qty;
          const marginPct = rate > 0 ? (profitPerUnit / rate) * 100 : 0;`,
    replace: `          const cost = parseNum(costRaw);
          // Discount delivery — profit and margin are computed against
          // what the customer actually pays, not the list Rate. Without
          // this, discounting a line would show the margin that WOULD
          // have been earned at full price, which is silently wrong in
          // the one place you look before agreeing a concession.
          const listRate = parseNum(row.rate);
          const discPct = clampDiscount((row as any).discountPercent);
          const rate = listRate * (1 - discPct / 100);
          const profitPerUnit = rate - cost;
          const totalProfit = profitPerUnit * qty;
          const marginPct = rate > 0 ? (profitPerUnit / rate) * 100 : 0;`,
  },

  // ── 5a. Totals memo — revenue buckets ─────────────────────────────
  // Companion to edit 1. The stored total already carries the discount,
  // so this only matters for a row mid-edit with no total saved yet —
  // but without it the green card's revenue figure jumps for a moment.
  {
    label: "5/6 totals card — revenue bucket fallback",
    find: `      const total =
        parseNum(li.total) || parseNum(li.quantity) * parseNum(li.rate);`,
    replace: `      const total =
        parseNum(li.total) ||
        parseNum(li.quantity) *
          parseNum(li.rate) *
          (1 - clampDiscount((li as any).discountPercent) / 100);`,
  },

  // ── 5b. Totals memo — profit buckets ──────────────────────────────
  {
    label: "6/6 totals card — aggregate profit against discounted price",
    find: `        const qty = parseNum(li.quantity);
        const rate = parseNum(li.rate);
        const profit = (rate - cost) * qty;`,
    replace: `        const qty = parseNum(li.quantity);
        // Discount delivery — same correction as the per-row PROFIT
        // cell, applied to the headline one-off / monthly / annual
        // profit figures on the green totals card.
        const listRate = parseNum(li.rate);
        const discPct = clampDiscount((li as any).discountPercent);
        const rate = listRate * (1 - discPct / 100);
        const profit = (rate - cost) * qty;`,
  },
];

// ── Shared helper insertion ──────────────────────────────────────────
// clampDiscount mirrors the server-side clamp so the on-screen figure
// can never disagree with the saved one. Inserted immediately after the
// existing parseNum helper, which every edit above depends on.

const helperAnchorCandidates = [
  "function parseNum(",
  "const parseNum = (",
];

let helperAnchor = null;
for (const candidate of helperAnchorCandidates) {
  if (src.split(candidate).length - 1 === 1) {
    helperAnchor = candidate;
    break;
  }
}

if (!helperAnchor) {
  console.error(
    "✗ Could not locate a unique parseNum helper to anchor clampDiscount against.",
  );
  console.error("  No changes written. QuoteWorkspace.tsx is untouched.");
  process.exit(1);
}

// ── Pre-flight: every anchor must exist exactly once ─────────────────
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
  console.error("  No changes written. QuoteWorkspace.tsx is untouched.");
  console.error("  The file has drifted from what this script expects —");
  console.error("  re-verify against the live code before proceeding.");
  process.exit(1);
}

// ── Apply ────────────────────────────────────────────────────────────
for (const edit of edits) {
  src = src.replace(edit.find, edit.replace);
  console.log(`  ✓ ${edit.label}`);
}

// Insert the helper immediately before the parseNum declaration.
const helperBlock = `// Discount delivery — mirror of the server-side clamp. A discount is a
// percentage in the range 0–100; anything outside that (or non-numeric,
// or null for an undiscounted line) resolves to 0, which makes the
// multiplier (1 - 0/100) = 1 and leaves the arithmetic unchanged.
function clampDiscount(raw: unknown): number {
  const n = parseFloat(String(raw ?? "0"));
  if (!Number.isFinite(n)) return 0;
  return Math.min(Math.max(n, 0), 100);
}

`;

src = src.replace(helperAnchor, helperBlock + helperAnchor);
console.log("  ✓ clampDiscount helper inserted");

writeFileSync(target, src, "utf8");

console.log("");
console.log(
  "✓ client/src/pages/QuoteWorkspace.tsx — patched. Disc % column live, profit is discount-aware.",
);
console.log("  (Idempotent: a second run will report already-patched and exit 0.)");
