# Next chat — handover prompt

Paste this as your first message in the new chat. Attach the IdoYourQuotes repo zip alongside it.

---

## Context

Wez is the sole developer and dogfood customer of **IdoYourQuotes** (idoyourquotes.com) — AI-powered quoting/proposal SaaS for UK trades and service businesses. Production-live on Render, Postgres 16, Cloudflare R2 for files. Wez runs Sweetbyte Ltd (IT MSP) on the Pro tier as the only live customer. **Marketing launch is imminent** — launch sequencing is flexible if needed.

Wez is a non-coder owner. You handle all code. He thinks in app terms and reacts in short directional signals.

Blueprint at `IdoYourQuotes-Blueprint.md` (v3.10 — Document History changelog up to E.24, May 9 2026). Recent sessions' work has NOT been written into the blueprint yet — see "On the roadmap → blueprint sweep" below.

## How we work

**Communication:**
- Wez writes in short directional signals: "go", "continue", "yes", single-letter approvals → full greenlights, proceed without re-confirmation.
- Match the tone: direct, minimal, decisive. Don't ramble. Don't present open questions when you can recommend.
- Describe changes in **app terms** (what the user sees) before any code-terms (file paths, function names). Code-terms appear only at delivery time.
- Get architectural alignment first; never write code without explicit alignment confirmation.
- **No interactive pop-ups (no `ask_user_input_v0`).** Ask in prose, he answers in the prompt field.
- For UX proposals, show 2-3 rendered mockup options side-by-side using the Visualizer tool rather than describing them in words.

**Delivery:**
- **Complete files only** — never patches or diffs. Every delivery is a full file replacement (or a new file).
- **Folder location next to every filename** in delivery summaries (e.g. `server/services`, `client/src/pages`, `repo root`).
- **Hold the TypeScript baseline of 69 errors exactly.** Verify with `node node_modules/typescript/lib/tsc.js --noEmit` (NOT `npx tsc` — `--ignore-scripts` skips the `.bin` symlink).
- Zero new TS errors in any modified file. Always run the check before delivering.
- Stage all deliverable files in `/mnt/user-data/outputs/<delivery-name>/<repo-relative-path>/` and use `present_files` so Wez can pull them down.

**Locked files:**
- `server/pdfGenerator.ts` — **NEVER modify under any circumstance.** ⚠️ **This file is the centre of the next session's work.** Do NOT touch it directly. Either: (a) propose unlocking it explicitly and get Wez's one-time greenlight, or (b) build a new alternative generator file (e.g. `server/pdfGeneratorV2.ts`) and leave the original as the rollback. **Default to (b).** Read-only inspection (viewing imports to identify the PDF library in use) is permitted — the locked-file rule applies to writes only.
- `server/routers.ts` — add-only. Don't refactor existing entries. Adding a new sub-router import + mount line is acceptable.
- `client/src/pages/QuoteWorkspace.tsx` — explicit permission required.
- `client/src/pages/AdminPanel.tsx` — explicit permission required.

**Schema rules:**
- Direct SQL only on Render shell. `drizzle-kit push` is broken on Render for enum-rename scenarios.
- **Dual schema rule:** `shared/schema.ts` and `drizzle/schema.ts` must always be updated identically.
- Prefix every Render shell command with `echo go;` — the terminal eats the first ~8 characters on paste.

**Dependencies:**
- If adding an npm dependency, update `pnpm-lock.yaml` (authoritative) alongside `package.json`. Render ignores `package-lock.json`.
- Use the pnpm version pinned in `packageManager` (currently `pnpm@10.4.1`). Install globally first if needed: `npm install -g pnpm@10.4.1`.
- Regenerate with `pnpm install --ignore-scripts --no-frozen-lockfile`. State the exact pinned version in the delivery summary.

**Sector scope:**
- **Electrical sector is permanently deleted** — not paused. Four GTM sectors remain: IT Services, Commercial Cleaning, Website & Digital Marketing, Pest Control.
- Of the four, **IT Services is where active development energy goes** — Wez's own sector, the deepest catalogue, the most AI-prompt addendum tuning.

---

## What shipped in the previous session

### 1. Three audit bugs closed (all deployed and confirmed working in prod)

**Bug 1 — MIME validation on uploads.** New helper `server/_core/uploadValidation.ts` using `file-type@^22.0.1`. Validates the actual bytes of uploaded files against a per-`inputType` allowlist (pdf / image / audio / email / document). Mounted in `server/routers.ts` on `uploadFile` (line ~2010) AND `uploadLogo` (line ~351) — both insertions are add-only. Closes the XSS vector where a forged Content-Type could ship malicious HTML disguised as a PDF.

**Bug 2 — Rate limiting on auth endpoints.** New helper `server/_core/rateLimit.ts` using `express-rate-limit@^8.5.1`. 10 attempts per 15 min per IP, `skipSuccessfulRequests: true` so legitimate logins don't burn quota. 429 response shape matches existing auth error JSON. Mounted in `server/_core/oauth.ts` on `/api/auth/login` and `/api/auth/register` ONLY (no other auth routes). `app.set("trust proxy", 1)` added in `server/_core/index.ts` immediately after `const app = express()` so the limiter sees the real client IP via Render's X-Forwarded-For. Wez confirmed the rate limit works in production — got locked out at attempt 11, restart of the Render service cleared the in-memory bucket immediately. **Future note:** the limiter is in-memory (no Redis/Postgres backing); a service restart resets all buckets. Acceptable for V1; revisit if scaling to multiple Render instances.

**Bug 3 — Document enum verified on prod.** Confirmed via Render shell that `input_type` enum already includes `'document'`. Output: `pdf, image, audio, email, text, document` (6 rows). No migration needed.

### 2. Distributor pricing investigation (DECISION: do not build for V1)

Long architecture exploration on adding live distributor pricing (Ingram Micro, Pax8, TD SYNNEX) to the AI quote generation, prompted by a Manus-AI strategic brief Wez received. Four shapes considered: full distributor API integration with BYOC credentials; public web-scraping via cloud fetch; commercial pricing APIs (SerpAPI / Bright Data / Keepa); Anthropic web search during AI generation.

Empirical findings:
- Direct cloud-IP fetches to retailers (Amazon, Currys, Ebuyer, Scan, Google Shopping) all return **403 Forbidden** — Cloudflare/Akamai bot protection. Same blocking would happen from Render. Tested live in the session.
- Anthropic web search CAN reach UK price aggregators (PriceSpy, idealo, PriceRunner) and trade resellers (Ballicom, Senetic, BT Shop) — but data quality has a 7-link chain of trust (retailer wrong → aggregator stale → wrong product match → snippet outdated → AI misreads → etc.). PriceSpy's own docs confirm prices update only 3-5×/day and tell users to verify before purchase.
- **Most importantly:** real-world test on a quote with 9 mixed hardware items (3× 27-inch monitors, 5× Yealink handsets, 4× 16GB DDR4 RAM, 2× routers, 1× firewall, 1× 24-port switch, 2× WAPs, 6× Cat6 patches, 1× 2U rack) showed the existing AI engine **already produces sensible UK trade estimates for ALL hardware items**, not the £0.00 passthrough rows the prompt rules strictly predicted. Static trace predicted 2 of 9 lines at £0.00; reality showed all 9 lines populated with defensible UK trade prices (£8 Cat6 patch, £45 RAM stick, £85 entry handset, £150 server rack, £180 router, £180 WAP, £220 monitor, £320 24-port switch, £450 firewall), all correctly flagged with amber `ESTIMATE` chips. The model goes outside the explicit anchor list and produces reasonable estimates from training data.

The case for distributor integration weakened significantly. **Wez chose: park the distributor roadmap; keep the AI prompt as-is.** Distributor-objection conversation about competitors seeing pricing data also reinforced this decision.

### 3. UX confusion identified (NOT FIXED — open task, low priority)

In `QuoteWorkspace`, every line item shows a green `Catalog ▾` dropdown on the left. This is the catalogue-picker action button (in `client/src/components/CatalogPicker.tsx`), not a status indicator — but its visual style (filled green, "Catalog" label) competes with the actual `Catalog` source-badge chip (same green, same word) in `SourceBadge.tsx`. Users would reasonably misread the green button as "this row is from my catalogue" when it's actually the trigger to LINK a catalogue item. Especially confusing on an all-estimated quote where every row shows both a green `Catalog ▾` button AND an amber `ESTIMATE` chip — those two messages contradict each other to a fresh user.

**Recommended fix (not yet shipped):**
- Rename button label from `Catalog ▾` to `+ Link ▾` in `client/src/components/CatalogPicker.tsx` (~2 lines, no locked-file touch).
- Optionally hide the button on already-matched rows in `client/src/pages/QuoteWorkspace.tsx` (~5 lines, **locked file — requires permission**).

Wez confirmed "no" to the fix in this session — keep on the roadmap, not launch-blocking.

---

## Next task — Schedule of Works + PDF "Jazzing Up"

**Wez's brief verbatim:** *"add schedule of works to the quotes when generating pdf and to make the generated pdf look less boring they need jazzing up"*

A **two-part PDF feature**, and both parts touch the most locked file in the repo (`server/pdfGenerator.ts`). Recommended approach: build a new generator alongside the original.

### Part A — Schedule of Works section

A new optional section in the generated PDF showing the implementation timeline for the quoted work. Possible formats: phased list ("Phase 1: Discovery", "Phase 2: Install"), week-by-week milestone table, Gantt-style bars.

**Architectural decisions to align with Wez before code:**

1. **AI-generated, manual, or hybrid?**
   - AI: lives in the engine output (`server/engines/generalEngine.ts`); needs prompt addendum + new field on quote schema.
   - Manual: lives as a new editable section in `QuoteWorkspace.tsx` (locked) + new schema column (`quotes.schedule_of_works` JSONB).
   - **Recommended: Hybrid** — AI drafts a sensible default from the line items, user edits in workspace before generating PDF. Best of both. AI infers phases from line types (installation lines → install phase; subscription lines → activation; training lines → onboarding).

2. **Visual format in the PDF:** timeline bar, phased table, milestone list, week-by-week? Recommend showing Wez 2-3 mockup options.

3. **Default-on or opt-in per quote?** Recommended: opt-in toggle in the workspace, default-off so existing quotes aren't disrupted on first deploy.

4. **Where the toggle/editor lives in the workspace UI.** Likely a new collapsible section between line items and totals, similar to how notes/terms currently render.

### Part B — PDF visual redesign ("jazzing up")

Current PDF is functional but plain. Wez wants visual personality. Likely candidates:
- Better typography (font pairing, hierarchy).
- Accent colours pulled from the org's brand (already extracted in `server/services/brandExtraction.ts` — that pipeline produces a brand palette JSON that's currently underused in the PDF).
- Section headers with visual weight.
- Cover page.
- "Your project at a glance" summary block.
- Icons next to line items by category.

**Critical constraint:** `server/pdfGenerator.ts` is **permanently locked.** Two paths:

**Path 1 — Build a new generator alongside (RECOMMENDED).**
- Create `server/pdfGeneratorV2.ts` as the new "jazzed up" generator.
- Feature-flag at the call site in `server/routers.ts` — env var `PDF_GENERATOR_VERSION=v2` or per-org flag in `organizations.feature_flags` JSONB.
- Original `pdfGenerator.ts` stays as rollback. If V2 breaks, flip the flag, original returns instantly.
- Once V2 proven, original can be deleted in a future session with explicit unlock.

**Path 2 — Ask for one-time unlock on `pdfGenerator.ts`.**
- Higher risk: no rollback path other than git revert.
- Only choose if Wez explicitly says "yes, unlocked for this session" at the start.

**Default to Path 1 unless Wez says otherwise.**

**Architectural decisions to align with Wez before code:**

1. Path 1 (parallel V2 file) or Path 2 (unlock original)?
2. What does "jazzed up" look like? — **propose 2-3 visual PDF mockups side-by-side** using the Visualizer (mockup module) with the existing brand colour palette. Let Wez pick.
3. Cover page yes/no?
4. Per-line icons by category yes/no?
5. "Project at a glance" summary block yes/no?
6. Check the PDF library in use first — inspect `pdfGenerator.ts` imports (likely PDFKit, pdf-lib, or Puppeteer). Does it support the richness needed, or does this require switching libraries? Puppeteer (HTML→PDF) gives full CSS control but adds significant cost and complexity; PDFKit is leaner but harder to style. **Inspecting the imports is read-only — locked-file rule still applies for writes.**

### Suggested session sequencing

1. **Inspect `pdfGenerator.ts` imports (read-only)** to identify the current PDF library — this constrains everything downstream.
2. **Architectural alignment.** Show 2-3 mockup PDF designs side-by-side. Get Wez's pick on visual direction, AI-vs-manual schedule, parallel-vs-unlock approach. **No code until aligned.**
3. **Schema additions** if needed for schedule storage (`quotes.schedule_of_works` JSONB, nullable). Direct SQL on Render shell. Dual-schema (`shared/schema.ts` + `drizzle/schema.ts`).
4. **Part A (schedule)** first — smaller, more contained, doesn't require the V2 generator yet if rendered into the existing PDF structure or as a separate section.
5. **Part B (visual redesign)** second — bigger, requires the V2 generator decision.
6. **Feature flag** so V2 can ship to staging without affecting prod customers (Sweetbyte) until validated.

---

## On the roadmap (priority order)

### Critical before marketing launch
1. **Blueprint sweep — E.25 through E.30** retroactive entries:
   - E.25 — Catalogue Category dropdown
   - E.26 — IT seed 22 → 88 expansion + AI addendum hardening
   - E.27 — Polish bundle (Trial cap 100→200, Dashboard nudge softened, demo-quote auto-seed removed, supportKnowledge staleness fix, dictation auto-restart)
   - E.28 — Public Quote Assistant chatbot (prospect_threads / prospect_messages tables, /, /features, /pricing, /register, /404)
   - E.29 — Email scheduler piggyback fix (emailFlags JSONB column with transitional read-merge)
   - E.30 — Audit bugs (MIME validation on uploadFile + uploadLogo, auth rate limiting on login + register, trust proxy added)
2. **Public chatbot smoke-test feedback** — needs a pass with real prospect-style questions before marketing fires.
3. **CatalogPicker rename** (`Catalog ▾` → `+ Link ▾`) — Wez deferred; revisit only if it surfaces in beta feedback.

### After launch (parked)
- Distributor pricing integration (Ingram / Pax8 / TD SYNNEX) — **parked indefinitely**; revisit only if real users complain about hardware pricing accuracy. AI estimates were demonstrated good enough in the previous session.
- Various parked items in `todo.md`.

---

## House style reminders

- App-terms before code-terms.
- No code without alignment.
- 69 TS-error baseline, locked files respected, dual schema rule, complete files only with folder paths.
- No interactive pop-ups for questions — prose only.
- Visual mockups (Visualizer) for UX proposals.
- `echo go;` prefix on every Render shell command.

When ready, start with: *"Read the next session prompt. I'll wait."*
