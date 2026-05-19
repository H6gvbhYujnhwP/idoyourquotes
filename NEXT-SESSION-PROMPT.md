# IdoYourQuotes — Next Session Handover (Tile 2 continuation)

**Read this first.** This is a self-contained handover. A fresh Claude chat
reading this, plus the prior `SESSION-START-tile2-blueprint.md`, has
everything needed to continue. Read the blueprint too — this document
assumes its context (project, stack, pathways, hard-won lessons,
communication style) and only records what changed *after* it.

---

## 0. One-paragraph orientation

Wez is the sole developer of IdoYourQuotes (idoyourquotes.com, Sweetbyte
Ltd). UK SaaS generating AI proposal PDFs for tradespeople/SMEs. Stack:
React/TS+Vite, tRPC, Drizzle, PostgreSQL, Stripe, Cloudflare R2, OpenAI,
Claude. Deploys on Render via GitHub Desktop on Windows, pnpm@10.4.1.
Four GTM sectors: IT Services, Commercial Cleaning, Web & Digital
Marketing, Pest Control. Wez communicates in short signals ("go", "yes"
= full greenlight). **Hard rules that still apply:** TypeScript baseline
is exactly **69** errors (all pre-existing in electrical/admin/stripe/
core; every delivery must hold at 69, zero new). Locked files
(`routers.ts`, `QuoteWorkspace.tsx`) get idempotent patch scripts, not
full files. Dual-schema rule. drizzle-kit push is broken — schema
changes via raw SQL on Render shell. Never trust the repo zip for file
state; verify live. Render shell paste eats first ~8 chars — prefix
multi-line commands with `echo go;`.

---

## 1. What this session was about

The blueprint left Tile 2 ("Use a branded colour template") verified
working with 24 templates. This session: Wez asked for **Phase 2.5 (AI
content enhancement)**, then a cascade of real-world bugs surfaced as he
tested on production with a real quote (quoteId 201, Sweetbyte Ltd org,
26-user Headway Essex IT tender). Everything below was found and fixed
by testing against live Render output, not theory.

---

## 2. What shipped this session (all verified)

Delivered in order. Each is a complete file unless noted. **All hold the
TypeScript baseline at exactly 69.**

### 2.1 Phase 2.5 — AI narrative enhancement
- **File:** `server/services/slotContentBuilder.ts` (complete file, 581 lines)
- The three narrative slots (`about-text`, `summary-text`,
  `methodology-text`) are now AI-written via the codebase-standard
  `invokeLLM` wrapper (`response_format: json_object`, `temperature:
  0.4`, `maxTokens: 900`) in a single round-trip, tailored to client/
  job/sector. Deterministic Phase-2 prose retained as guaranteed
  fallback for ANY AI failure or when `narrative.aiEnabled` is false.
- **Key discovery:** the zip's `templateProposalRouter.ts` was already
  wired for this contract (`narrative: { aiEnabled, sectorLabel }`),
  but the deployed router was the OLD Phase-2 one. The builder's
  `narrative` arg was made **optional and defaulted** (`{ aiEnabled:
  false }`) so a missing arg can never crash — backward- and
  forward-compatible with either router. This is why `narrative` is
  optional with optional-chained guards; do not "tidy" that away.
- Terms stay deterministic by design (legal text; codebase has
  separate VAT-clause handling).
- **Confirmed live:** AI narrative is genuinely good — proposals
  mention the client's actual mission, scope, cloud migration, etc.

### 2.2 Crash fix — `Cannot read properties of undefined (reading 'aiEnabled')`
- Same file (2.1). Root cause: deployed router (old Phase-2) called
  `buildSlotContent` without a `narrative` arg → new builder threw.
  The optional-default fix above resolves it. Verified gone in live
  logs.

### 2.3 "Unknown templateId" fix
- **File:** `server/services/templateLibrary.ts` (complete file, 278 lines)
- Root cause: `getLibraryRoot()` resolved relative to `_dirname`,
  correct under tsx (dev) but WRONG in the esbuild-bundled prod build
  (`dist/index.js` → pointed at `src/templates/library`, missing the
  `server/` segment). `fs.existsSync` failed → every template
  "unknown".
- Fix: ordered multi-candidate probe (cwd-first for prod, `_dirname`
  for dev), memoised, `TEMPLATE_LIBRARY_ROOT` env override retained.
- **Confirmed live:** logs show `library root resolved: /opt/render/
  project/src/server/templates/library`.

### 2.4 Modal UI fixes
- **File:** `client/src/components/BrandedTemplatePickerV2.tsx`
  (complete file, 304 lines)
- Squashed/narrow modal: shadcn base `sm:max-w-lg` wasn't overridden
  by unprefixed `max-w-4xl`. Changed to `w-[95vw] sm:max-w-4xl`.
- Double X: removed the custom close button (shadcn `DialogContent`
  renders its own); removed now-unused `X` import.
- Also updated (see 2.6) to prefer `fileUrl` delivery.

### 2.5 "Failed to fetch" — PDF delivery rearchitected
- **File:** `server/services/templateProposalRouter.ts` (complete file,
  508 lines)
- Root cause: endpoint base64-encoded the ~2.85 MB PDF into the tRPC
  JSON response (~3.36 MB on the wire, ~8 s). Browser fetch dropped
  the oversized/slow response (network-layer error, not HTTP).
- Fix: render → `uploadToR2()` → return a small `{ fileUrl: "/api/
  file/branded-proposals/<orgId>/...pdf" }` payload. Client downloads
  directly from the existing authenticated `/api/file` streaming route
  (same path logos use). Base64 retained ONLY as fallback when R2
  unconfigured/upload fails. Client (`BrandedTemplatePickerV2.tsx`)
  prefers `fileUrl`, falls back to `pdfBase64`.
- **Confirmed live:** PDF downloads cleanly.

### 2.6 Logo fix
- Same file as 2.5. Root cause: renderer loads templates via `file://`
  and `org.companyLogo` is a relative `/api/file/{key}` path → resolves
  to non-existent `file:///api/file/...` server-side (worked in-browser
  only because base is https).
- Fix: `resolveLogoDataUri()` in the router resolves the logo to a
  self-contained base64 `data:` URI before render (R2 fetch via
  `getFileBuffer` → PNG/JPEG magic-byte detect → `sharp`→PNG fallback),
  mirroring the proven `fetchAndNormaliseLogo` in
  `brandedProposalRouter.ts`. Renderer unchanged. Best-effort/null-safe.
- **Confirmed live:** Sweetbyte logo renders on cover.

### 2.7 Template-quality fixes 1, 2, 5 (the big one)
- **Deliverable:** `apply-template-quality-fixes.mjs` (repo root,
  idempotent patch script, 290 lines) — NOT a hand-placed file.
- After full audit of all 6 designs: **all 24 templates share one
  byte-identical 702-line `base.css`** (plus `_shared/base.css`, which
  is a different unreferenced source artifact). One CSS fix block
  corrects all 24.
- **Fix 1 (near-black images):** `.duotone-wrap img` used `grayscale +
  mix-blend-mode:multiply` over `background:var(--brand-primary)` —
  multiply × dark brand = black (proven by pixel math). Replaced with
  inline-filter neutralisation (`!important`), full-tonal photo +
  translucent brand `::after` wash; pale-brand + duotone-light/accent
  variants handled.
- **Fix 2 (logo/image collision):** injected `img[data-injected-logo]`
  constrained (max 220×64, contain), cover content gutter + image
  clipping.
- **Fix 5 (LOGO 1-4 boxes):** audited — strip appears 3× with 2 parent
  structures. Hide `[data-slot="accreditation-strip"]` +
  `.logo-placeholder` everywhere; collapse ONLY the scoped
  `margin-top:1.5rem` label-wrapper via `:has()` (Chromium 138) to
  avoid orphaning the "Technology Partners" label AND avoid wrongly
  hiding the cover/about content column. Slot kept in DOM for a future
  partner-logo feature.
- **The script:** mirrors `apply-phaseN-patches.mjs`. Unique-anchor
  append, idempotent, scoped md5 dual-rule check (24 served files;
  `_shared` informational — it was never byte-identical in stock lib).
  Verified against pristine-from-zip: produces **byte-exact match to
  the hand-tested split-screen file (md5 `817360ff80fed6cd5feacd5595
  76403b`)**, idempotent on re-run, all 24 designs carry all 3 fixes.
- **Confirmed live:** split-screen visually verified (images visible,
  logo clean, no LOGO boxes). All 24 templates render successfully on
  Render (`testTemplateRender.ts --all` → 24/24 ✓ after patch).

---

## 3. CURRENT STATE / WHAT WEZ MUST STILL DO

**This is the most important section. The work is done but NOT all
deployed.**

1. **Code files (2.1–2.6):** these are complete files Wez needs in his
   repo. STATUS: delivered as files. He must place them, commit via
   GitHub Desktop, deploy. **VERIFY with Wez whether these are already
   committed/deployed** — some were confirmed working live (logo, R2
   delivery, AI narrative, path fix), implying they ARE deployed, but
   confirm rather than assume (lesson #1).

2. **Template fix script (2.7):** STATUS: Wez ran
   `apply-template-quality-fixes.mjs` **on the Render shell** — output
   was clean (`newly patched: 24`, md5 `817360ff` confirmed). **BUT
   the Render filesystem is ephemeral — that shell run is NOT persisted
   and reverts on next deploy/restart.** Wez MUST:
   - Run `node apply-template-quality-fixes.mjs` in his **local
     Windows repo checkout** (idempotent; will reproduce md5
     `817360ff`).
   - Commit the 25 changed `base.css` files via GitHub Desktop.
   - Push/deploy.
   Until this local-run-and-commit happens, the template fixes are NOT
   permanently live.

3. **Visual verification still outstanding:** Wez has only visually
   confirmed **split-screen**. The other 5 designs (magazine,
   dark-premium, cards-grid, geometric, clean-tech) render successfully
   (24/24 ✓) but have NOT been eyeballed. The shared-CSS fix should
   carry across all, but "should" ≠ confirmed. Recommend: after deploy,
   generate real proposals on `02-magazine` and `03-dark-premium`
   (most likely to surface issues) before sending any to a client.
   - One tunable knob if a design needs it: duotone wash strength is
     `opacity: 0.28` (and `0.16` for pale brands) in the fix block.

---

## 4. The big open decision (Wez was mid-deliberation)

Wez had **second thoughts about Tile 2's templates** — "designs are
awful, text runs off, blank spaces, greyscale images." After the fixes
he decided: **keep Tile 2, fix the templates** (chose this over
pivoting to Tile 3 for tenders). Fixes 1/2/5 done. Still on the table
from the audit:

- **Problem 3 — text run-off:** Manus already added "v2.1 OVERFLOW FIX"
  blocks per design; split-screen contains its text. Needs a visual
  render-audit of the OTHER 5 designs to size whether run-off is still
  systemic. PARKED — Wez to decide.
- **Problem 4 — blank space / content-density mismatch:** STRUCTURAL,
  not CSS. Templates allocate fixed full-page regions designed for
  sparser content than a 13-page real tender (page 2 ~95% empty, etc).
  This is the one genuinely large piece. Honest framing given to Wez:
  these 24 templates were designed as showcases, not dense-tender
  containers; "fixing" this may mean per-design page-break
  restructuring OR repositioning Tile 2 as the "fast simple proposal"
  tile with Tile 3 (brochure-driven) owning dense tenders. This is a
  PRODUCT decision, not engineering — do not proceed without Wez's
  explicit direction. PARKED.

---

## 5. The OTHER big workstream: Tile 2 full editable-text parity (Delivery B)

Wez explicitly asked for this: **"these will be full-on tender quotes
... we need all text to be editable ... same treatment for 2nd [Tile 2]
as 3rd [Tile 3]."** NOT STARTED. Architecture was agreed before the
template-quality detour:

**Key finding that shrinks this dramatically:** Tile 3's editor has
**NO persistence and NO schema** — it's stateless (`brandedProposal
Router.ts` line ~24: "persistence can be added in a later delivery").
Edits live in client React state and are passed back at render time
(`generateDraft` → user edits → `renderPdf`). So Tile 2 parity needs
the SAME stateless pattern — **no schema change, no migration, no
override store.** Much smaller/lower-risk than first feared.

**Agreed architecture (phased, each verifiable on Render before next):**
- **B1** — Add `prepareBrandedProposalV2` (returns resolved editable
  slot map + editable-slot manifest to client; does NOT render).
  Adapt the render endpoint to accept edited slots back (falls back to
  building its own if none passed — backward compatible). No UI. Proves
  the data path. Mirrors Tile 3's `generateDraft`/`renderPdf` exactly.
- **B2** — Editor UI in `BrandedTemplatePickerV2.tsx`: select design →
  prepare → edit every text slot (about, summary, methodology, terms,
  stats, testimonials, service descriptions, titles) in React state →
  render. Structured pricing tables stay computed/read-only (same as
  Tile 3 — editing a computed VAT table by hand is a footgun).
- **B3** — Parity polish: per-section AI-regenerate buttons (Tile 3 has
  `regenerateChapter`), slot-coverage gaps.

**Phasing was agreed: B1 → B2 → B3, each verified on Render before the
next** (the discipline that kept the baseline clean throughout).

---

## 6. Deferred / parked (from blueprint + this session)

In rough priority:
- **Delivery B** (section 5) — the explicitly-requested big one.
- **Problem 4** (section 4) — structural blank-space / product decision.
- **Problem 3** (section 4) — text run-off audit on 5 unverified designs.
- **Partner-logo upload feature** — the `[data-slot="accreditation-
  strip"]` is hidden but retained in DOM; a future feature lets users
  upload partner/accreditation logos and stops hiding it.
- From blueprint, still parked: per-user preview thumbnails;
  `brandAccentColor` schema column + UI; PDF caching to R2 by content
  hash (the R2 upload is now done in 2.5, caching is the remaining
  add-on); Schedule of Works workspace UI; tiered pricing toggle;
  cleanup (remove `BrandChoiceModal`, legacy `generateBrandedProposal`,
  `brandedProposalRenderer`, drop legacy `proposal_template` column);
  phantom contract-term line item; EDR boundary; soft tender
  requirements; IT catalogue expansion; M365 anchor; R2 storage
  hygiene (brochure replacement orphans old file); support chat
  widget / ticket form / SEO.

---

## 7. File map — everything changed this session

| Path | Folder | This session |
|------|--------|--------------|
| `server/services/slotContentBuilder.ts` | server/services | COMPLETE FILE — Phase 2.5 AI narrative + optional-narrative crash fix |
| `server/services/templateLibrary.ts` | server/services | COMPLETE FILE — multi-candidate `getLibraryRoot()` |
| `server/services/templateProposalRouter.ts` | server/services | COMPLETE FILE — R2 delivery + `resolveLogoDataUri` logo fix |
| `client/src/components/BrandedTemplatePickerV2.tsx` | client/src/components | COMPLETE FILE — modal width/double-X + `fileUrl` download |
| `apply-template-quality-fixes.mjs` | repo root | NEW idempotent script — propagates duotone/logo/strip fixes to all 24 `base.css` + `_shared` |
| (25× `base.css`) | server/templates/library/**/assets/ + _shared | MODIFIED BY THE SCRIPT — do not hand-edit; run the script |

Untouched/locked, as always: `pdfGenerator.ts`,
`brandedProposalRenderer.ts`, `brandedProposalAssembler.ts`,
`BrandChoiceModal.tsx`, `routers.ts` (only the existing Phase-2 mount),
`QuoteWorkspace.tsx`.

---

## 8. Verification protocol (to confirm nothing regressed)

1. TypeScript: `node node_modules/typescript/lib/tsc.js --noEmit` →
   exactly **69** errors, none in the 4 changed `.ts/.tsx` files.
2. Template script: `node apply-template-quality-fixes.mjs` (local) →
   `newly patched` + `already patched` = 25, `skipped (no anchor): 0`,
   `✓ All 24 served template base.css are byte-identical (md5
   817360ff80fed6cd5feacd559576403b)`. Re-run = `newly patched: 0`
   (idempotent).
3. Render shell: `echo go; npx tsx server/scripts/testTemplateRender.ts
   --all` → 24/24 ✓.
4. Live app: generate a Pro/Team proposal on 2-3 designs → PDF
   downloads (R2 path, fast), logo present, images visible (not black),
   no "LOGO 1-4" boxes, AI narrative client-specific, pricing correct.

---

## 9. Immediate next action for the new chat

Open by confirming with Wez:
- (a) Are the section-2 code files committed/deployed? (logo, R2,
  AI narrative, path fix all confirmed working live — likely yes, but
  verify.)
- (b) Has he run the template script **locally** and committed the 25
  `base.css` files? (Shell run does NOT persist.)
- (c) Has he visually checked a non-split-screen design?

Then ask which he wants next: **Delivery B (editable-text parity — the
explicitly requested big one)**, Problem 4 (structural/product
decision), Problem 3 (run-off audit), or a parked item. Architecture
first, alignment, then code. Hold baseline at 69.
