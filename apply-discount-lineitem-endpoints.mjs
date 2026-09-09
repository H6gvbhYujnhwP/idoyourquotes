// apply-discount-lineitem-endpoints.mjs
//
// Discount delivery — teaches the locked server/routers.ts line-item
// endpoints about `discountPercent`.
//
// WHY A SCRIPT (not a complete file replacement):
//   server/routers.ts is on the locked-files list. Wez granted a
//   one-time exception for this delivery because the change cannot be
//   done add-only: the per-line total is computed INSIDE the existing
//   `lineItems.create` and `lineItems.update` procedures and nowhere
//   else, so a new sibling endpoint could not have achieved it. The
//   exception is narrow — five surgical edits, all inside those two
//   procedures. No other procedure in the file is touched.
//
// WHAT IT DOES (5 edits):
//   1. lineItems.create  — accept `discountPercent` on the Zod input.
//   2. lineItems.create  — apply the discount when computing `total`.
//   3. lineItems.create  — pass `discountPercent` through to the row.
//   4. lineItems.update  — accept `discountPercent` on the Zod input.
//   5. lineItems.update  — normalise a cleared value to null, and fold
//      the discount into the total recalculation (including the case
//      where ONLY the discount changed, which the pre-patch recalc
//      guard would have skipped entirely).
//
// THE DESIGN, IN ONE LINE:
//   `rate` keeps the LIST price. `discountPercent` records the
//   concession. `total` holds the discounted figure. Everything
//   downstream (quote subtotal, VAT, Standard Quote PDF, Word export,
//   branded proposal pricing table, dashboard revenue) already reads
//   `total`, so it all becomes correct without further change.
//
// ROUNDING: each line rounds to the nearest penny via toFixed(2), so
// the printed column always sums to the printed total. Agreed with Wez.
//
// BACKWARD COMPATIBILITY: `discountPercent` is optional everywhere.
// Omitted or null behaves exactly as before this delivery — a line with
// no discount computes total = quantity * rate, unchanged. Every
// pre-existing quote is untouched.
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched.
// Exits 1 if the file is missing, an anchor is absent or non-unique, or
// the file is in a mixed (partially patched) state.
//
// Usage (Windows, from repo root):
//   node apply-discount-lineitem-endpoints.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const target = resolve(__dirname, "server", "routers.ts");

// Unique marker used for the already-patched check. Chosen to appear in
// exactly one of the inserted blocks.
const SENTINEL = "DISCOUNT_DELIVERY_LINEITEM_ENDPOINTS";

if (!existsSync(target)) {
  console.error(`✗ Not found: ${target}`);
  console.error("  Run this from the repo root.");
  process.exit(1);
}

let src = readFileSync(target, "utf8");

// ── Already-patched short circuit ────────────────────────────────────
if (src.includes(SENTINEL)) {
  console.log(
    "✓ server/routers.ts — already patched (discount support present). Nothing to do.",
  );
  process.exit(0);
}

// ── Edit definitions ─────────────────────────────────────────────────
// Each entry: a unique `find` anchor and its `replace`. Every anchor is
// verified to occur exactly once before ANY write happens, so the file
// is never left half-patched.

const edits = [
  // ── 1. create: accept discountPercent on the input ────────────────
  {
    label: "1/5 lineItems.create — Zod input",
    find: `        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const quantity = parseFloat(input.quantity || "1");`,
    replace: `        pricingType: z.enum(['standard', 'monthly', 'optional', 'annual']).optional(),
        // ${SENTINEL} — per-line negotiated discount as a percentage
        // ("11" = 11% off). String to match the rest of this shape; the
        // column is decimal and the helper passes strings through.
        // Optional: omitted means no discount, which computes exactly
        // as it did before this delivery.
        discountPercent: z.string().optional(),
      }))
      .mutation(async ({ ctx, input }) => {
        // Verify quote ownership with org-first access
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        const quantity = parseFloat(input.quantity || "1");`,
  },

  // ── 2. create: apply the discount to the total ────────────────────
  {
    label: "2/5 lineItems.create — total calculation",
    find: `        const total = (quantity * rate).toFixed(2);`,
    replace: `        // Discount delivery — \`rate\` stays the LIST price so the
        // concession stays visible on the document and in the record;
        // the discounted figure lands in \`total\`. Clamped to 0–100 so
        // a bad client value can never invert the sign of a line or
        // inflate it. NaN (non-numeric input) falls back to 0.
        const rawDiscount = parseFloat(input.discountPercent || "0");
        const discountPct =
          Number.isFinite(rawDiscount) ? Math.min(Math.max(rawDiscount, 0), 100) : 0;
        // Round to the nearest penny per line, so the printed Discount
        // column always sums to the printed total.
        const total = (quantity * rate * (1 - discountPct / 100)).toFixed(2);`,
  },

  // ── 3. create: persist the discount on the row ────────────────────
  {
    label: "3/5 lineItems.create — persist discountPercent",
    find: `          pricingType: input.pricingType || "standard",`,
    replace: `          pricingType: input.pricingType || "standard",
          // Store null rather than "0" when there is no discount, so
          // "never discounted" and "discounted by zero" stay
          // distinguishable and the UI can render an empty box.
          discountPercent: discountPct > 0 ? discountPct.toFixed(2) : null,`,
  },

  // ── 4. update: accept discountPercent on the input ────────────────
  {
    label: "4/5 lineItems.update — Zod input",
    find: `        costPrice: z.string().optional(),
        sortOrder: z.number().optional(),`,
    replace: `        costPrice: z.string().optional(),
        // Discount delivery — editable from the workspace. Empty string
        // is normalised to null below so a user can clear a discount
        // they previously applied.
        discountPercent: z.string().optional(),
        sortOrder: z.number().optional(),`,
  },

  // ── 5. update: normalise + fold discount into the recalc ──────────
  //
  // Two things happen here. First, a cleared discount box becomes null
  // rather than "" (the decimal column rejects ""). Second — and this
  // is the subtle one — the pre-patch recalc guard only fired when
  // quantity or rate changed. Changing ONLY the discount would have
  // saved the new percentage while leaving the OLD total in place, so
  // the document would print a discount that had not been applied. The
  // guard is widened to include discountPercent.
  {
    label: "5/5 lineItems.update — normalise + total recalculation",
    find: `        if (data.costPrice !== undefined && data.costPrice.trim() === "") {
          (data as any).costPrice = null;
        }`,
    replace: `        if (data.costPrice !== undefined && data.costPrice.trim() === "") {
          (data as any).costPrice = null;
        }

        // Discount delivery — same treatment for a cleared discount box.
        // "" means "remove the discount", not "save an empty string".
        if (data.discountPercent !== undefined && data.discountPercent.trim() === "") {
          (data as any).discountPercent = null;
        }`,
  },
  {
    label: "5/5 lineItems.update — recalc guard + arithmetic",
    find: `        if (data.quantity !== undefined || data.rate !== undefined) {
          const existingItems = await getLineItemsByQuoteId(quoteId);
          const existingItem = existingItems.find(i => i.id === id);
          if (existingItem) {
            if (data.rate !== undefined && data.rate.trim() === "") {
              data.rate = existingItem.rate || "0.00";
            }
            if (data.quantity !== undefined && data.quantity.trim() === "") {
              data.quantity = existingItem.quantity || "1.0000";
            }
            const quantity = parseFloat(data.quantity || existingItem.quantity || "1");
            const rate = parseFloat(data.rate || existingItem.rate || "0");
            (data as any).total = (quantity * rate).toFixed(2);
          }
        }`,
    replace: `        // Discount delivery — guard widened to include discountPercent.
        // Without it, editing ONLY the discount would persist the new
        // percentage but leave the previous total untouched, and the
        // document would show a discount that had not been applied.
        if (
          data.quantity !== undefined ||
          data.rate !== undefined ||
          data.discountPercent !== undefined
        ) {
          const existingItems = await getLineItemsByQuoteId(quoteId);
          const existingItem = existingItems.find(i => i.id === id);
          if (existingItem) {
            if (data.rate !== undefined && data.rate.trim() === "") {
              data.rate = existingItem.rate || "0.00";
            }
            if (data.quantity !== undefined && data.quantity.trim() === "") {
              data.quantity = existingItem.quantity || "1.0000";
            }
            const quantity = parseFloat(data.quantity || existingItem.quantity || "1");
            const rate = parseFloat(data.rate || existingItem.rate || "0");
            // Fall back to the row's stored discount when this patch
            // did not include one (e.g. the user only changed the qty),
            // so an existing discount survives an unrelated edit.
            const discountSource =
              (data as any).discountPercent !== undefined
                ? (data as any).discountPercent
                : existingItem.discountPercent;
            const rawDiscount = parseFloat(discountSource || "0");
            const discountPct =
              Number.isFinite(rawDiscount) ? Math.min(Math.max(rawDiscount, 0), 100) : 0;
            // Normalise the stored value too, so a clamped or scruffy
            // input ("11.456", "-3") is persisted in canonical form.
            if ((data as any).discountPercent !== undefined && (data as any).discountPercent !== null) {
              (data as any).discountPercent = discountPct > 0 ? discountPct.toFixed(2) : null;
            }
            (data as any).total = (quantity * rate * (1 - discountPct / 100)).toFixed(2);
          }
        }`,
  },
];

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
  console.error("  No changes written. server/routers.ts is untouched.");
  console.error("  The file has drifted from what this script expects —");
  console.error("  re-verify against the live code before proceeding.");
  process.exit(1);
}

// ── Apply ────────────────────────────────────────────────────────────
for (const edit of edits) {
  src = src.replace(edit.find, edit.replace);
  console.log(`  ✓ ${edit.label}`);
}

writeFileSync(target, src, "utf8");

console.log("");
console.log("✓ server/routers.ts — patched. Line-item endpoints now carry discountPercent.");
console.log("  (Idempotent: a second run will report already-patched and exit 0.)");
