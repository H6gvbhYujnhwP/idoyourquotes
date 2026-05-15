# Phase 3 Delivery — Picker UI

After this delivery, the **user-visible flow is live**. Click "Generate PDF" → "Use a branded colour template" → the new picker opens with six designs filtered to your sector → pick one → click Generate → PDF downloads in your brand colour. End-to-end.

---

## What's in this zip — file-by-file repo placement

| File | Goes to | Action |
|------|---------|--------|
| `client/src/components/BrandedTemplatePickerV2.tsx` | `client/src/components/` | **New file** — the picker modal (sector-filtered 6-design grid + generate button). |
| `client/public/template-thumbnails/` (24 PNGs) | `client/public/` | **New folder** — 280px-wide PNG thumbnails for each template (navy palette). ~830 KB total. |
| `apply-phase3-patches.mjs` | repo root | **One-shot script** that surgically edits QuoteWorkspace.tsx (4 anchored edits, idempotent). |

The legacy `BrandChoiceModal.tsx` stays in the codebase unchanged. Its mount remains in QuoteWorkspace but is unreachable from any user flow — dead code, safe to remove in a later cleanup once Phase 3 is verified in production.

---

## What I didn't touch

- `server/pdfGenerator.ts` — locked
- `server/routers.ts` — Phase 2 work is complete, no changes here
- `server/brandedProposalRenderer.ts` — deprecated, leave alone
- `client/src/components/BrandChoiceModal.tsx` — kept as fallback / archival
- `client/src/components/ExportFormatPickerModal.tsx` — its existing "Branded colour template" card already calls `onSelectContractTender`, we just route it differently
- Tile 3 brochure-embed pipeline — untouched

---

## Install steps (Windows)

From the repo root in a terminal:

```bash
# 1. Extract the zip into the repo root. Three new things land:
#    - client/src/components/BrandedTemplatePickerV2.tsx
#    - client/public/template-thumbnails/ (24 PNG files)
#    - apply-phase3-patches.mjs

# 2. Apply the surgical edits to QuoteWorkspace.tsx
node apply-phase3-patches.mjs
```

Expect output:
```
=== Phase 3 patch summary ===
  ✓ import inserted
  ✓ state inserted
  ✓ trigger swapped
  ✓ modal JSX inserted

Changes applied: 4
```

If you see `• already applied, skipping` lines, that's fine — script is idempotent.

```bash
# 3. Verify TypeScript baseline holds
node node_modules/typescript/lib/tsc.js --noEmit
```

Expect: same error count as Phase 2 (~69). My new component contributes zero new errors.

```bash
# 4. Commit + push via GitHub Desktop
#    Commit message: phase 3: branded template picker UI
```

Wait for Render to deploy (3–5 minutes).

---

## Verify in the live app

1. Open any quote in the workspace (use your Sweetbyte IT test account — user 10 / org 10 / Pro tier).
2. Click **Generate PDF**.
3. In the export format picker, click **"Use a branded colour template"**.
4. **The new picker opens** — six design thumbnails for your sector (IT Services), each with name + one-line description. The trigger that used to open the legacy BrandChoiceModal now opens this.
5. Click a thumbnail to select it (blue border + checkmark appears).
6. Click **"Generate proposal"**.
7. Loading spinner runs for ~3–5 seconds (Chromium rendering on Render).
8. PDF downloads as `proposal-<quoteId>.pdf`.
9. Open it — should show:
   - The chosen design
   - Your brand colours throughout (whatever you have set on the org)
   - Your company logo on the cover (if uploaded)
   - Your real quote reference, client name, line items in the pricing tables
   - Your terms

10. The quote's status flips to `pdf_generated` (same behaviour as the legacy flow).

11. **Persistence check** — open the picker again on the same quote. Your last-picked design should be remembered (the server stored it on `quote.proposal_template_v2`).

---

## What's user-visible after Phase 3

This is the first user-visible delivery in the whole rollout:

- New picker UI replaces the 3-template gallery
- 24 designs available (filtered to 6 per sector)
- PDF downloads directly (no print-window popup)
- Per-quote template choice is remembered

Everything else (Quick PDF, Tile 3 Brochure pipeline) is untouched.

---

## What's NOT in Phase 3 (and is on the horizon)

These are deliberate scope cuts to keep the picker shipping quickly:

- **Thumbnails are navy-tinted, not your-brand-tinted.** A user with a forest brand sees navy previews but generates a forest PDF. Phase 4 polish can swap to per-user previews (render thumbs on-the-fly with the user's brand colours, cache to R2).
- **No brand accent colour picker.** The accent is derived from primary by colourUtils. Phase 4 can add a `brand_accent_color` column on organizations + a settings control.
- **No AI-enhanced narrative content.** "About us" and "Methodology" sections use deterministic defaults. Phase 2.5 plugs an AI step into the slot builder.
- **No PDF caching.** Every generation re-renders. Phase 4 caches by `(templateId + brandHash + contentHash)` in R2.
- **Schedule of Works UI in workspace** — the original ask from session 1, still pending Phase 4.
- **Tiered pricing UI** — the templates support it; the workspace control to flip between line-item table and 3-tier cards is pending.

---

## Known limitations

- **Legacy BrandChoiceModal still mounted (dead code).** It sits in the JSX tree but its open flag is never set. TypeScript and React both happily ignore it. Removing properly is a Phase 4 cleanup task — for now the safety of keeping the rollback path outweighs the dead-code smell.
- **`BrandMode` type still imported in QuoteWorkspace** because legacy handlers reference it. Same reason as above.
- **Sector mapping is tolerant** (`it_services`, `it-services`, `IT` all map correctly) but falls back to `it-services` for unrecognised values. If your org has an oddly-named tradePreset, the picker shows IT designs as a safe fallback.

---

## Changes Log row for SESSION-START.md

```
Phase 3 (picker UI): branded template picker live in workspace
- New client/src/components/BrandedTemplatePickerV2.tsx — sector-filtered 6-design picker, calls generateBrandedProposalV2, downloads PDF as Blob
- New client/public/template-thumbnails/ — 24 navy-palette PNGs (280px wide, ~830 KB total)
- Modified client/src/pages/QuoteWorkspace.tsx (4 surgical edits via apply-phase3-patches.mjs): 1 new import, 1 new state, 1 trigger swap, 1 new modal mount
- No router changes (Phase 2's endpoint is the target)
- No schema changes (deferred — accent derived from primary; thumbnails use static assets)
- No server-side work
- BrandChoiceModal kept in repo as dead code (open flag never set, easily re-enabled if rollback needed)
- TypeScript baseline: held at 69
- User-visible flow live: Generate PDF → Branded colour template → new picker → PDF download
```

---

## Once Phase 3 verifies, the natural next steps are

1. **Phase 2.5** — AI content generation for the narrative slots (about-us, methodology). Plug an OpenAI/Claude call into `slotContentBuilder`.
2. **Phase 4 polish** — per-user preview thumbnails, accent picker, PDF caching to R2, Schedule of Works workspace UI, tiered pricing UI.
3. **Cleanup** — remove BrandChoiceModal + legacy generateBrandedProposal endpoint + deprecated brandedProposalRenderer.ts.

Give me a "go" with whichever you want first.
