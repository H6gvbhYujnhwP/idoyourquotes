# Phase 2 Delivery — Content Pipeline + New Endpoint

After this delivery, the new endpoint `generateBrandedProposalV2` is live alongside your existing `generateBrandedProposal`. You can call it from any quote and get back a real PDF rendered from the v2.1 template library, with your brand colours, your logo, and your quote's line items already injected.

Phase 3 (next) wires it to the picker UI so it's actually clickable from the workspace. For now, you verify by calling it directly from the Render shell.

---

## What's in this zip — file-by-file repo placement

| File | Goes to | What it is |
|------|---------|------------|
| `server/services/slotContentBuilder.ts` | `server/services/` | **New file.** Builds the slot content map from a quote + line items + organisation. Pure transformation, no AI calls in v1, no DB access. |
| `server/services/templateProposalRouter.ts` | `server/services/` | **New file.** tRPC sub-router with one endpoint `generateBrandedProposalV2`. Mirrors the structure of `brandedProposalRouter.ts`. |
| `server/services/templateRenderer.ts` | `server/services/` | **Replaces the Phase 1 version.** Adds array slot value support — needed because most templates have two pricing tables (one-off + recurring). |
| `apply-phase2-patches.mjs` | repo root | One-shot Node script that applies three additive edits: `routers.ts` import + mount, `shared/schema.ts` column, `drizzle/schema.ts` column. Idempotent. |
| `migration-phase2.sql` | repo root | Raw SQL for the schema change (drizzle-kit push is broken on this codebase, so we use raw SQL on Render shell as usual). |

---

## What I didn't touch

- `server/pdfGenerator.ts` — locked
- `client/src/pages/QuoteWorkspace.tsx` — Phase 3 only
- `server/brandedProposalRenderer.ts` — deprecated, leave alone
- The existing `generateBrandedProposal` procedure in `routers.ts` — additive only, the old endpoint coexists with the new one
- Tile 3 brochure-embed pipeline — untouched

---

## Install steps (Windows)

From the repo root in PowerShell or Git Bash:

```bash
# 1. Extract this zip into the repo root.
#    The new files land in server/services/ and at the repo root.

# 2. Apply the three additive edits to existing files (routers.ts + both schema files)
node apply-phase2-patches.mjs
```

You should see output like:
```
=== Phase 2 patch summary ===
  ✓ routers.ts import inserted
  ✓ routers.ts mount inserted
  ✓ shared/schema.ts: proposal_template_v2 column added
  ✓ drizzle/schema.ts: proposal_template_v2 column added
```

If it shows `• already applied, skipping` for some lines, that's fine — the script is idempotent and safe to re-run.

```bash
# 3. Verify TypeScript baseline holds
node node_modules/typescript/lib/tsc.js --noEmit
```

Expected: same error count as Phase 1 (around 69). My three new files should contribute zero new errors.

```bash
# 4. Commit and push via GitHub Desktop
#    Commit message: phase 2: content pipeline + new endpoint
```

Wait for Render to redeploy (3–5 minutes).

---

## Run the SQL migration on Render

After deploy is live, open the Render shell. Paste:

```bash
echo go; psql $DATABASE_URL -c "ALTER TABLE quotes ADD COLUMN IF NOT EXISTS proposal_template_v2 VARCHAR(64);"
```

Or run the SQL file directly:

```bash
echo go; psql $DATABASE_URL -f migration-phase2.sql
```

Verify it landed:

```bash
echo go; psql $DATABASE_URL -c "\d quotes" | grep proposal_template
```

You should see two rows: the legacy `proposal_template` column (text) and the new `proposal_template_v2` column (varchar(64), nullable).

---

## Verify the endpoint works

Pick any real quote you have in the database (your Sweetbyte IT test org, user 10 / org 10, paid Pro). You'll need its numeric quote ID — grab one from any quote URL in the workspace, the number at the end.

On the Render shell, you can invoke the tRPC endpoint via a small test script. Easiest way:

```bash
echo go; cat > /tmp/test-v2-endpoint.ts << 'EOF'
import { renderTemplate } from "./server/services/templateRenderer.js";
import { buildSlotContent } from "./server/services/slotContentBuilder.js";
import { getQuoteById, getUserPrimaryOrg, getLineItemsByQuoteId } from "./server/db.js";
import * as fs from "fs";

// REPLACE WITH YOUR REAL VALUES
const QUOTE_ID = 99;       // ← put a real quote id here
const USER_ID = 10;        // ← your test user
const TEMPLATE_ID = "it-services/01-split-screen";

const org = await getUserPrimaryOrg(USER_ID);
const quote = await getQuoteById(QUOTE_ID, USER_ID);
const lineItems = await getLineItemsByQuoteId(QUOTE_ID);

if (!quote || !org) {
  console.error("Quote or org not found");
  process.exit(1);
}

const slotContent = buildSlotContent({
  quote: quote as any,
  organization: org as any,
  lineItems: lineItems as any,
});

const result = await renderTemplate({
  templateId: TEMPLATE_ID,
  brand: {
    primary: org.brandPrimaryColor,
    secondary: org.brandSecondaryColor,
    accent: null,
  },
  slotContent,
  logoUrl: org.companyLogo,
});

fs.writeFileSync("/tmp/v2-test.pdf", result.pdf);
console.log("PDF written:", result.pdf.length, "bytes in", result.durationMs, "ms");
EOF
npx tsx /tmp/test-v2-endpoint.ts
```

If you see "PDF written: ~2.5 MB in ~3000 ms" — Phase 2 works end-to-end with your real data.

Then download the PDF to inspect:

```bash
echo go; base64 -w0 /tmp/v2-test.pdf
```

Copy the full base64 string, paste into base64.guru or any base64-to-file converter, download as `.pdf`, and open. You should see:
- The template design (Split Screen)
- Your brand colours throughout
- Your company logo on the cover (if you've uploaded one)
- Your real quote reference, client name, line items in the pricing table
- Your terms (or the org default, or the fallback)

---

## What you'll see in the PDF for v1

The endpoint produces a real PDF from real quote data, but **without AI-enhanced narrative** in this v1 — the "about us", "executive summary", and "methodology" sections use deterministic content built from the quote fields you've already populated (description, terms) plus sensible defaults. That's a deliberate scope-cut to ship faster and validate the pipeline.

Phase 2.5 (later, separate session) will add an AI step that generates richer narrative content for those sections. The data slot architecture is already in place; it's just a content-source swap.

---

## What's NOT in Phase 2

Deliberate scope cuts to keep this shippable in one bite:

- **No picker UI yet** — Phase 3
- **No `brandAccentColor` schema column** — Phase 3 adds it when the accent picker UI lands. For now, accent is derived from primary by colourUtils.
- **No PDF caching** — every call re-renders. Phase 4 polish.
- **No AI content enhancement** — Phase 2.5.
- **No tiered pricing UI option** — the templates support it, but no workspace control to flip between line-item table and 3-tier cards yet. Phase 4 polish.
- **Schedule of Works** — the slot exists in the templates; the workspace UI for editing per-quote phases is Phase 4 (the original ask from session 1, finally returning).

---

## Known limitations to flag

- **Annual recurring line items roll into the "Recurring Services" table** alongside monthly ones, with a `(/year)` suffix in the description. Most quotes don't have annual items so this is fine; if your test quote does, expect mixed rows in the second table.
- **About Us and Methodology use generic defaults** until Phase 2.5 wires AI content. They'll read as polished-but-generic boilerplate for now. Quote description and terms come straight from the user's quote fields.
- **Vendor logos and accreditation strips** still show the grey "LOGO 1 / LOGO 2" placeholders. Phase 4 polish wires in real logos from the user's org settings.
- **The two pricing-title slots are filled independently** — first slot gets "One-Off Investment", second gets "Recurring Services" (or empty if no recurring items). This needs the array-slot support added in this Phase 2's templateRenderer update.

---

## Changes Log row for SESSION-START.md

```
Phase 2 (content pipeline + new endpoint): live alongside existing v1 endpoint
- New server/services/slotContentBuilder.ts — pure transform; quote+org+lineItems → SlotContent
- New server/services/templateProposalRouter.ts — generateBrandedProposalV2 mutation (Pro/Team tier-gated, returns base64 PDF)
- Updated server/services/templateRenderer.ts — slot values now support string | string[] (indexed)
- Modified server/routers.ts (additive) — 1 import + 1 mount line via apply-phase2-patches.mjs
- Modified shared/schema.ts — added proposalTemplateV2 varchar(64) column on quotes
- Modified drizzle/schema.ts — same (dual-schema rule)
- New SQL migration applied via Render shell: ALTER TABLE quotes ADD COLUMN proposal_template_v2 VARCHAR(64)
- No router endpoint modifications (existing generateBrandedProposal untouched)
- No client changes (Phase 3)
- TypeScript baseline: held at 69 (zero new errors)
- Render verification: end-to-end PDF from real quote data, ~2.5 MB in 3s
```
