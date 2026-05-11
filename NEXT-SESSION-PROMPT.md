# Next chat — handover prompt

Paste this as your first message in the new chat. Attach the IdoYourQuotes repo zip alongside it.

---

## Context

Wez is the sole developer and dogfood customer of **IdoYourQuotes** (idoyourquotes.com) — AI-powered quoting/proposal SaaS for UK trades and service businesses. Production-live on Render, Postgres 16, Cloudflare R2 for files. Wez runs Sweetbyte Ltd (IT MSP) on the Pro tier as the only live customer. Marketing launch is imminent — this week's sessions have been launch-readiness work.

Wez is a non-coder owner. You handle all code. He thinks in app terms and reacts in short directional signals.

Blueprint at `IdoYourQuotes-Blueprint.md` (v3.10 as of repo state — the Document History table at the bottom is the running changelog up to E.24, May 9 2026). This session's work has NOT been written into the blueprint yet — it should be added retrospectively in this next session as a series E.25 / E.26 / E.27 / E.28 sweep, see "On the roadmap" below.

## How we work

**Communication:**
- Wez writes in short directional signals: "go", "continue", "yes", single-letter approvals → these are full greenlights, proceed without re-confirmation.
- Match the tone: direct, minimal, decisive. Don't ramble. Don't present open questions when you can recommend.
- Describe changes in **app terms** (what the user sees) before any code-terms (file paths, function names). Code-terms appear only at delivery time.
- Get architectural alignment first; never write code without explicit alignment confirmation.

**Delivery:**
- **Complete files only** — never patches or diffs. Every delivery is a full file replacement (or a new file).
- **Folder location next to every filename** in delivery summaries (e.g. `server/services`, `client/src/pages`, `repo root`).
- **Hold the TypeScript baseline of 69 errors exactly.** Verify per-file with `node node_modules/typescript/lib/tsc.js --noEmit` (NOT `npx tsc` — `--ignore-scripts` skips the `.bin` symlink).
- Zero new TS errors in any modified file. Always run the check before delivering.

**Locked files:**
- `server/pdfGenerator.ts` — never modify under any circumstance.
- `server/routers.ts` — add-only. Don't refactor existing entries. Adding a new sub-router import + mount line is acceptable.
- `client/src/pages/QuoteWorkspace.tsx` — explicit permission required.
- `client/src/pages/AdminPanel.tsx` — explicit permission required (the polish rewrite of an earlier session; treat with the same care).

**Schema rules:**
- Direct SQL only on Render shell. `drizzle-kit push` is broken on Render for enum-rename scenarios and will offer destructive operations.
- **Dual schema rule:** `shared/schema.ts` and `drizzle/schema.ts` must always be updated identically.
- Prefix every Render shell command with `echo go;` — the terminal eats the first ~8 characters on paste.

**Dependencies:**
- If adding an npm dependency, update `pnpm-lock.yaml` (authoritative) alongside `package.json`. Render ignores `package-lock.json`.
- Regenerate with `npx pnpm@<version-from-devDependencies> install --ignore-scripts --no-frozen-lockfile`.

**Sector scope:**
- **Electrical sector is permanently deleted** — not paused. Four GTM sectors remain: IT Services, Commercial Cleaning, Website & Digital Marketing, Pest Control. All code must be sector-agnostic across these four; no electrical-specific assumptions outside designated engine/addendum blocks.
- Of the four, **IT Services is where the active development energy goes** — Wez's own sector, the catalog is the deepest, the AI prompt has the most addendum tuning.

## What's shipped this session (all deployed unless noted)

This session focused on launch-readiness: a global UX fix, a massive IT catalogue expansion, AI prompt hardening, polish bundle, public chatbot. Everything below has been TS-verified at the 69 baseline.

### 1. Category dropdown in the catalogue UI (deployed, working)
- **Problem:** the Category column on `/catalog` was a free-text field. Users typing "Website Services" had to type the exact string or fall into "Uncategorized".
- **Fix:** `client/src/pages/Catalog.tsx` — Category column rewritten as a native `<select>` dropdown matching the existing Pricing column. Three sections inside: "Suggested for your sector" (from the seed), "Your custom categories" (deduped, from the user's own catalogue), "+ New category…" (swaps cell to a free-text input).
- **Sector-agnostic.** Works the same for all four GTM sectors.
- **Add Item dialog** also got the same picker.
- **No schema, no API, no locked files.** Single file edit.

### 2. IT seed expansion — 22 → 88 items (deployed)
- **File:** `server/catalogSeeds/itServicesSeed.ts`
- **Original:** 22 items across Microsoft 365 & Licensing, Security & Backup, IT Support Contracts, Website Services, Productivity Tools, Engineer Labour.
- **Added in this session:**
  - **Connectivity (24)** — FTTC/SOGEA/FTTP at every speed tier (40/80/100/300/500/1G), static IPs, broadband provision, 5 leased line tiers (100M/200M/500M/1G/10G), leased line provision, SD-WAN edge + management, 4G/5G failover + provision, satellite tiers + provision
  - **Wi-Fi & LAN (5)** — Meraki AP, Ubiquiti AP, cloud licence per AP, site survey, install labour
  - **SIP & Voice Lines (6)** — Gamma SIP channel, DDI single/block-of-10/block-of-100, number porting, SIP provision
  - **VoIP Telephony (10)** — three user tiers (Essentials/Standard/Premium), 5 Yealink handsets, VoIP provision, per-user onboarding
  - **Google Workspace & Licensing (8)** — Business Starter/Standard/Plus Monthly+Annual, Enterprise Standard, Enterprise Plus
  - **Cyber Security (9)** — Cyber Essentials cert, CE Plus cert, readiness support, audit day, vulnerability scanning, dark web monitoring, security awareness training, hardware MFA token, pen test
  - **Website Services expansion (+4)** — Website Development 7 Pages (£795), Database App site (£2,495), E-commerce site (£3,495), Customer Portal site (£3,995)
- **Total: 88 items across 12 categories.**

### 3. Auto-seed already wired — repurposed manual button to "Recover deleted" (deployed)
- **Existing:** `server/db.ts createUser()` line 309 was already calling `seedCatalogFromSectorTemplate` on every new signup with a sector. So new IT signups have always been getting the 88-item starter catalogue auto-loaded.
- **The manual "Load Starter Catalog" button was redundant for new signups.** Repurposed to **"Recover deleted"** for cases where a user deletes some items and wants them back.
- **Dialog title** → "Recover deleted starter items"
- **Default selection** → empty (deliberate pick, not flood-recover)
- **Toast copy** → "Recovered N items"
- **Dashboard nudge CTA** unified to always read "Open Catalogue" (was switching between "Load Starter Catalogue" / "Open Catalogue" — with auto-seed this branching was misleading).

### 4. AI prompt tuning — IT addendum extended for connectivity/voice/cyber/Google Workspace (deployed)
- **File:** `server/engines/generalEngine.ts`
- **All changes inside the `if (this.tradePreset === "it_services")` block — zero impact on other sectors.**
- **UK MSP anchor rates** extended with ~47 new rows covering broadband at every tier, leased lines, SD-WAN, 4G/5G failover, satellite, Wi-Fi APs, SIP, VoIP user tiers, handsets, Google Workspace tiers, Cyber Essentials + Plus + audit + readiness, vulnerability scanning, dark web monitoring, security awareness training, MFA tokens, pen test.
- **Commodity category enum** extended with 17 new precise tags: `broadband`, `leased_line`, `sd_wan`, `mobile_failover`, `satellite_internet`, `sip_trunk`, `voip_user_licence`, `voip_handset`, `telephony_platform`, `wifi_hardware`, `wifi_management_licence`, `google_workspace_licence`, `cyber_essentials`, `cyber_essentials_plus`, `vulnerability_scanning`, `security_awareness_training`, `dark_web_monitoring`, `mfa_token`, `penetration_test`. The old generic `"telephony"` is replaced by the more precise split.
- **POSITIVE / NEGATIVE substitution lists** extended with the typical UK competitors in each category (BT, Openreach, Vodafone Business, Colt, Virgin Media Business, Gamma, Voiceflex, Yealink, Meraki, Ubiquiti, Starlink Business, Tenable, KnowBe4, YubiKey, etc).
- **Anti-fabrication rule** hardened: explicit four-condition test for the "Replaces existing" prefix, three concrete FORBIDDEN PATTERNS (taken from real failure modes observed in smoke testing), a "NEW SERVICE WITH NO CATALOG MATCH" rule, a quantity-anti-fabrication rule.

### 5. Delivery 1 — quick wins bundle (deployed)
Five surgical changes across eight files:
- **Trial + Solo `maxCatalogItems` 100 → 200** in `server/services/stripe.ts` TIER_CONFIG, plus public `/pricing` page in `server/services/subscriptionRouter.ts`, plus the cancel-flow downgrade fallback (was hardcoded `100`), plus `canAddCatalogItem` `?? 100` → `?? 200`.
- **Schema column default 100 → 200** in `shared/schema.ts` AND `drizzle/schema.ts` (dual schema rule).
- **Backfill SQL run on Render shell** for existing trial+solo orgs: `UPDATE organizations SET max_catalog_items = 200 WHERE max_catalog_items = 100 AND subscription_tier IN ('trial', 'solo');`
- **Soften Dashboard nudge wording** in `client/src/pages/Dashboard.tsx` — was "Better catalogue, better first quote" / "review the rates, add your buy-in costs" → now "Your starter catalogue is ready" / "We've pre-loaded the common products and services… you can quote with it straight away. Tweak prices and add buy-in costs over time as you sell things." Acknowledges the 88-item reality is friendly, not a chore.
- **Remove demo-quote auto-seed from `createUser`** (E1 flavour) in `server/db.ts`. New signups no longer get the "Acme Group" example quote pre-seeded. The demo factory + `seedDemoQuoteForSector` helper + Dashboard "Load Example Quote" button are all preserved — users can still manually trigger an example quote.
- **Fix stale `supportKnowledge.ts` reference to email-verification banner** — line 58 mentioned a verification banner that hasn't existed since E.24. Updated to match new "Your starter catalogue is ready" copy.
- **Dictation auto-restart on browser-auto-end** in `client/src/components/DictationButton.tsx`. The Web Speech API auto-ends recognition after ~60 seconds in Chrome. We now auto-restart with seamless transcript accumulation across restarts, fail-safe capped at 10 minutes total per session. Long-form dictation now actually works.

### 6. Delivery 2 — public Quote Assistant chatbot (deployed)
A new amber/orange chatbot widget on every public marketing page, deliberately distinct from the teal in-app SupportDrawer.

- **2 new tables:** `prospect_threads`, `prospect_messages` plus 2 enums (`prospect_thread_status`, `prospect_message_role`). Schema added to both `shared/schema.ts` and `drizzle/schema.ts`. Migration ran successfully on Render shell, both tables + enums confirmed via verification query.
- **New files:**
  - `server/services/prospectKnowledge.ts` — public-safe marketing knowledge ONLY. Strict boundary: no customer data, no org data, no user identity. Distinct from `supportKnowledge.ts`.
  - `server/services/prospectBotRouter.ts` — 4 `publicProcedure` endpoints (`startThread`, `getThread`, `sendMessage`, `escalate`), three-layer rate limiting: 20 messages/hour per clientUuid, 20/hour per IP, 1,000/day global cost cap. Hardened system prompt with refusal rules baked in (no jailbreak engagement, no medical/legal/financial advice, no fake pricing, no fake URLs, never claim to be human, polite, no swearing).
  - `client/src/components/PublicChatWidget.tsx` — amber gradient launcher with pulse animation, slide-up chat panel, three views (chat / escalate / escalated), suggested prompts on welcome.
- **Modified files:**
  - `server/services/smtpMailer.ts` — added `sendProspectEscalationEmail` with amber-branded HTML template, `[Prospect]` subject tag, sends to `support@mail.idoyourquotes.com` with Reply-To set to the prospect's email.
  - `server/routers.ts` — add-only: import + mount line for `prospectBot`.
  - `client/src/App.tsx` — imports + mounts `<PublicChatWidget />` at App level; the widget self-gates rendering based on path.
- **Persistence:** clientUuid in `sessionStorage` (per-tab, wipes on browser close). Conversations persisted server-side for analytics.
- **Routes where the widget shows:** `/`, `/features`, `/pricing`, `/register`, `/404`. Explicitly excluded: `/login`, `/set-password`, all signed-in routes.
- **No new npm deps. No new env vars** (reuses existing `SMTP_HOST` / `SMTP_PORT` / `SMTP_USER` / `SMTP_PASS` / `SUPPORT_INBOX`).

### 7. Delivery 3 — email scheduler piggyback fix (deployed)
- **Background:** an external code audit (Manus AI) flagged that the email-scheduler dedupe flags (`checkInSent`, `trialReminderSent`, `trialEndedSent`, `limitApproachingSent`, `limitReachedSent`) were piggybacking inside `organizations.default_day_work_rates` JSON under `_emailFlags`. Settings → Save shallow-merges the day-rates blob server-side, which currently preserved the flags as a side effect — but the architecture was a footgun: any future code path touching `defaultDayWorkRates` without remembering to merge could wipe the flags and trigger duplicate trial emails.
- **Fix:** moved flags into a dedicated `emailFlags` JSONB column on the `organizations` table.
- **Files touched:**
  - `shared/schema.ts` + `drizzle/schema.ts` (dual rule) — added `emailFlags` column, deprecated `_emailFlags` typing inside `defaultDayWorkRates`
  - `server/services/emailScheduler.ts` — reads + writes the new column; has a transitional merge that also reads any legacy `_emailFlags` value so dedupe holds across deploy
  - `server/routers.ts` — two writers updated per explicit per-line permission (quota reset path ~line 532, limit-warning path ~line 567). The Settings → Save merge at ~line 310 was left alone since it does no harm.
  - **SQL migration** (run on Render shell) — added `email_flags JSONB` column with `default '{}'::jsonb`, then backfilled from `default_day_work_rates -> '_emailFlags'` for any org that had legacy values.
- **TS baseline held at 69. Zero new errors.**

## External audit — Manus AI report (May 2026)

Wez commissioned a deep code + market audit from Manus AI mid-session. Most of the marketing-numbers projections in the report are loose (MRR forecasts assume conversion + churn rates more optimistic than realistic), but the **bug findings are verifiable and largely accurate**, and the **strategic direction on distributor APIs + PSA integration is correct**.

### Pre-launch bugs flagged by Manus

| # | Issue | Severity | Status |
|---|-------|----------|--------|
| 1 | File upload trusts client-supplied `contentType` — no MIME validation. XSS/malware vector via own app. | Critical | **NOT FIXED** |
| 2 | No rate limiting on `/api/auth/login` and `/api/auth/register`. Blueprint claims E.15 shipped this; code shows it never landed. | Critical | **NOT FIXED** |
| 3 | Email scheduler piggyback hack — flags stored inside `defaultDayWorkRates._emailFlags`. | High | **FIXED in Delivery 3** |
| 4 | File uploads held entirely in RAM as base64. OOM crash risk under load. | High | Not launch-blocking (one live customer) |
| 5 | `inputTypeEnum` migration for `document` value may not be applied to prod. Word/Excel uploads 500-error if missing. | High | **VERIFY ON RENDER SHELL** before launch |
| 6 | Dual-path tenant isolation fallback in `getQuoteWithOrgAccess`. Fragile IDOR risk. | Medium | Defensive cleanup post-launch |

**Critical bugs 1 + 2 are still outstanding and should be the very first work in the next session before any marketing email fires.** Bug 5 is a 1-minute verification — paste this into the Render shell:

```sh
echo go; psql $DATABASE_URL -c "SELECT enumlabel FROM pg_enum WHERE enumtypid = 'input_type'::regtype;"
```

Should include `document` in the returned values. If not, the migration in `drizzle/0024_add_email_input_type.sql` (or similar) needs running.

### Manus's marketing intel (the parts worth keeping)

- **UK MSP market is ~13,000 active firms, 9,800+ are micro/small** (Frontier Economics 2025 govt-commissioned report). Sweet spot is the 1-5 person IT shop too small for enterprise CPQ but sophisticated enough to need professional proposals.
- **Cold email alone at 50/day will not build a viable business.** Industry benchmarks: 27.7% open, 3.4% reply, 0.2% conversion → ~1 paid customer/month from 1,000 emails. Multi-channel (LinkedIn social selling + SEO comparison content + MSP-coach partnerships) is the credible path to meaningful MRR.
- **The voice-note-to-quote differentiator is genuinely unique** in the MSP CPQ space and aimed at exactly the right segment. ConnectWise CPQ, QuoteWerks, Quoter, Zomentum are all built for enterprise procurement workflows and complete the same job in weeks not minutes.

### Strategic gaps Manus flagged (Year-1 roadmap, not launch blockers)

**These are real and worth taking seriously**, but they're not "fix this week" items. They're "build over the next 12 months as users grow beyond the catalogue-only quoting use case."

1. **Live distributor pricing — Ingram Micro / Pax8 / TD SYNNEX APIs.**
   - All three have free OAuth 2.0 REST APIs (same auth pattern as our Stripe integration).
   - Pattern to copy: **Salesbuildr's "Dynamic Pricing"** — user enters their own reseller credentials in Settings (BYOC = Bring Your Own Credentials), configures global margin rules ("Hardware +15%, Software +20%"), and the quote editor fires live API calls to pull cost prices + stock + applies margin to derive sell price.
   - **Unfair-advantage angle:** combine with our AI. User dictates "5 Dell Latitude 3540s + M365 setup + 2 days labour" → AI silently queries Ingram for the laptop, Pax8 for the M365 SKU, pulls live cost + applies margin + adds labour from user's day rates → fully priced quote without the user ever doing a search. **No competitor does this.**
   - **Build order:** Ingram Micro first (biggest UK distributor, best docs), then Pax8, then TD SYNNEX. Estimate 2-3 weeks per distributor for a solid integration.
   - **Adoption barrier to watch:** each user needs an active reseller account with each distributor plus dev portal access plus generated API keys pasted into our Settings. The "user speaks and gets live-priced quote" dream only works after a 5-minute setup.

2. **PSA integration — ConnectWise Manage / Autotask / Syncro / Halo.**
   - MSPs live in their PSA. If accepting a quote doesn't push a ticket + line items into the PSA, they have to type everything twice — and IT people hate double data entry more than they hate quoting.
   - Manus called this the most-cited churn risk for users who grow beyond solo operation. Plausible.
   - **Build order:** start with whichever PSA the earliest paying customers ask for. ConnectWise Manage and Syncro are the two highest-volume in the UK micro-MSP segment.

3. **Mobile app or fully responsive PWA.**
   - Voice-to-quote is our killer feature but IT engineers are on site, in server rooms, in vans — not at desks.
   - The web app is responsive but a true install-from-the-home-screen PWA experience would unlock the field-use-case properly. Genuine differentiator if done well.

4. **"Human-in-the-loop review screen" before PDF generation.**
   - Manus flagged this as missing. **It actually exists** — the QuoteWorkspace IS the review screen, every AI line is editable before publish. What's missing is a **mandatory confirmation gate** ("AI generated this — review before PDF?"). Worth considering but debatable: mandatory clicks add friction for power users.

5. **Tighter cold-email targeting.**
   - 50 generic emails/day → 200 hyper-targeted emails/day to 1-5 person UK IT shops, 2-5 years in business, not yet on ConnectWise. Quality of list beats quantity.
   - Tools mentioned: Apollo.io, Cognism for the targeted lists; Instantly or Smartlead for sending.



## On the roadmap

### Critical — fix before any marketing email fires

These are pulled from the Manus audit above. They are the next session's first work:

1. **Add `file-type` MIME validation to the upload endpoint** in `server/routers.ts` (`uploadFile` procedure). Reject anything that doesn't match a per-format allowlist. Single file change, ~30 min including testing.
2. **Add `express-rate-limit` to `/api/auth/login` and `/api/auth/register`** in `server/_core/oauth.ts`. 10 attempts per 15 min per IP is the sane default. Will need a new `express-rate-limit` dependency (add to package.json + pnpm-lock.yaml per the rules) and `app.set('trust proxy', true)` somewhere central so the rate limiter sees the real client IP via Render's proxy header.
3. **Verify the `inputTypeEnum 'document'` migration is applied to production.** One-line Render shell check (SQL above in the Manus section). If missing, run the migration.

### Immediate (highest priority)

- **Blueprint updates** — this entire session's work needs writing into `IdoYourQuotes-Blueprint.md`. Suggested entries:
  - **E.25** — Catalog category dropdown + IT seed expansion 22 → 88 + Recover deleted button + Dashboard nudge softening + demo-quote auto-seed removal (rolled into one entry since they all support the same theme: "new IT signup polish")
  - **E.26** — AI prompt tuning for connectivity / voice / cyber / Google Workspace (extends the IT addendum)
  - **E.27** — Trial+Solo catalogue cap 100 → 200, dictation auto-restart, supportKnowledge.ts staleness fix
  - **E.28** — Public Quote Assistant chatbot
  - **E.29** — Email scheduler piggyback fix: dedicated `email_flags` JSONB column on `organizations`, transitional read-merge so dedupe holds across deploy
  - The Document History table format is consistent — match the style of E.21 / E.22 / E.23 / E.24 entries already in place.

- **Smoke-test report from Wez on Delivery 2** (public chatbot). He hasn't tested it post-deploy yet. Expect feedback on:
  - Widget visual on each public page
  - Reply quality / latency
  - Whether escalation email actually lands at `support@mail.idoyourquotes.com`
  - Anything visual that looks off (colour, position, animation)

### Parked items from this session

- **Refresh the IT demo quote (Delivery 2 was D in the plan, deferred)** — the "Acme Group" example quote currently shows 6 lines (M365 Annual, ESET, SaaS Protect, E-Mail Protect, Silver Support, Engineer Onsite). All still valid against the 88-item seed, but doesn't showcase the new breadth. Worth refreshing to include a SIP line, a broadband line, a cyber line. File: `server/demoQuotes/itServicesDemo.ts`. Still only fires via the manual "Load Example Quote" button on the Dashboard since auto-seed is gone.
- **Pre-existing parked items (predate this session):**
  - A5 landscape brochure pages embedded in A4 landscape proposals render at native size with visible letterbox margin (upscale-to-fit one-line fix proposed).
  - Wasted GPT-4o tone/font-feel extraction call (output never read by any renderer).
  - R2 storage orphan on brochure replacement (upload helper mints new ID each time rather than reusing a stable key).
  - Phantom contract-term line, EDR boundary, soft tender requirements.
  - **Electrical sector full deletion sweep** across all files, routes, DB tables, columns, UI references (already mostly done but a final sweep would be hygienic).
  - **Rate-limit module missing.** Blueprint claims E.15 shipped `server/_core/rateLimit.ts` and `authRateLimiter` on `/api/auth/*` — neither exists in the codebase, no `express-rate-limit` in `package.json`, no `trust proxy` set. Either reverted or never landed. **Worth fixing before launch** since the blueprint claims rate limiting exists; right now anyone can brute-force `/api/auth/login` and `/api/auth/register`. The prospect chatbot has its own in-memory rate limit independent of this.

### Year-1 roadmap (from Manus audit + product instinct)

Build order, prioritised:

1. **Ingram Micro live pricing integration** (biggest UK distributor, best API docs)
   - "Bring Your Own Credentials" Settings form — user pastes their Ingram Client ID + Secret
   - Global margin rules (one % for hardware, one % for software, one for cloud)
   - Live product search bar in the quote-editor line items
   - OAuth 2.0 token refresh, 24-hour token lifetime
   - Per-org credential storage encrypted at rest
   - **Estimate: 2-3 weeks**
2. **First PSA integration — ConnectWise Manage or Syncro** (whichever the earliest customers ask for)
   - Quote-accept → ticket creation + line-item sync
   - Bidirectional contact lookup
   - **Estimate: 3-4 weeks**
3. **Pax8 integration** (cloud/software products — M365, GW, security stack)
   - Same BYOC pattern as Ingram. Faster build once Ingram pattern is proven.
   - **Estimate: 1-2 weeks**
4. **TD SYNNEX integration** (third major UK distributor)
   - Same pattern. **Estimate: 1-2 weeks**
5. **AI auto-query of distributor APIs during quote generation** — the killer feature
   - User dictates "5 Dell Latitude 3540s with M365 setup and 2 days labour"
   - Backend silently queries Ingram for the laptop, Pax8 for the M365 SKU, applies margins, adds labour from the user's day rates → fully priced quote
   - **No competitor does this.** Build only after at least Ingram + Pax8 are solid. **Estimate: 2-3 weeks** on top of distributor foundations
6. **Mobile / PWA polish** — service workers, install prompt, native-feeling voice capture on phones. The voice-to-quote use case is field-first. **Estimate: 2-3 weeks**
7. **Second PSA integration** based on customer signal.



- **Admin view of prospect conversations** — admin panel doesn't yet surface the prospect_threads / prospect_messages tables. Adding a "Prospects" tab next to the existing "Conversations" tab would let Wez see incoming marketing chat, who escalated, how the bot is performing.
- **Cost dashboard** for the prospect bot — daily count, today's spend estimate, average reply length.
- **A/B test** the widget copy (welcome message, suggested prompts) once there's traffic data.
- **Refresh the IT demo quote** (Delivery D parked).
- **Marketing site copy review** — with the chatbot live and the catalogue at 88 items, the public Home / Features / Pricing pages may want copy that matches.

## Working with this codebase

- **Stack:** React 19, Tailwind 4, shadcn/ui, Wouter routing, tRPC 11 + TanStack Query, Drizzle ORM, Postgres 16, Express 4, OpenAI GPT-4o + Claude (vision) + Whisper (transcription). Node 22 on Render.
- **Deploy flow:** Wez pushes via GitHub Desktop → Render auto-deploys. No staging.
- **Database access:** Render shell only, never via dashboard SQL editor.
- **TS baseline 69** — measured against this session's final state. If you see more or fewer errors than 69 on first read of the repo, something has drifted; flag it before doing any work.

## First reply expectation

Don't write code in your first reply. Confirm you've read the repo, summarise (briefly — he knows) what's already shipped from the "What's shipped this session" section, and ask which roadmap item to start on. If he names one, walk through the plan in **app terms** before any code.

When code starts, every delivery is complete files with folder locations next to filenames, TS baseline verified at 69, locked-file rules respected.

Good luck. Marketing launch is this week — keep the bar high but ship fast.
