Two repo zips attached.

**1. IdoYourQuotes** (idoyourquotes.com) — AI-powered quoting/proposal SaaS for UK tradespeople. Production-live, deployed to Render. Blueprint at v3.10 in repo root (`IdoYourQuotes-Blueprint.md`) — read it first, the Document History table at the bottom is the running changelog and recent series E.22 / E.23 / E.24 (May 8-9 2026) overhauled the customer email layer end-to-end. I dogfood through my own IT MSP business (Sweetbyte Ltd) on a Pro tier — only live customer.

**2. TGA Studio** (studio.thegreenagents.com) — internal tool I run. Sidebar today has three section headings: "SOCIAL MEDIA" (LinkedIn / Facebook / Instagram / TikTok / Pixels), "EMAIL CAMPAIGNS" (Customers / Domain Health / Mailboxes), "CUSTOMER PORTAL" (Portal Customers).

---

## Goal

Add a new sidebar heading **"APPS"** to TGA Studio with one entry **"IdoYourQuotes"** underneath. Clicking it opens the IdoYourQuotes Admin page inside Studio.

The IDYQ Admin already exists at `client/src/pages/AdminPanel.tsx` (mounted at `/manage-7k9x2m4q8r` in `client/src/App.tsx`, owner-gated). It's a tRPC-driven owner panel for managing users / orgs / trials / tiers across the IDYQ install.

---

## Pre-code questions to resolve before any code

1. **Integration approach.** Three options worth considering:
   - **(a) Iframe** the live `idoyourquotes.com/manage-7k9x2m4q8r` URL into a new Studio page. Simplest. Cookie auth on idoyourquotes.com still gates access — whoever's logged in there is who sees the admin.
   - **(b) Lift the AdminPanel React component + tRPC client** from the IDYQ repo into Studio's source tree. Cleanest UI inside Studio, but Studio needs to talk to IDYQ's tRPC server (CORS, auth).
   - **(c) Build a thin Studio-side admin page** that talks to IDYQ's tRPC API directly via a service-account token. Most decoupled. Most code.

   Pick one and justify against the constraints — single owner-user (me), Studio is internal-only, IDYQ is public production, cross-domain (`studio.thegreenagents.com` ↔ `idoyourquotes.com`).

2. **Authentication.** Whatever integration approach lands, answer "how does Studio prove the request is from me?" Options: cookie sharing across subdomains (won't work — different root domains), shared service-account bearer token, OAuth, signed JWT, something else.

3. **Folder location.** Once you've read TGA Studio's repo, propose where the new APPS section + IdoYourQuotes page should live in its file structure — should match how the existing sections are organised.

---

## Working rules (carry over from prior sessions on the IDYQ project)

- **App-terms not code-terms** in planning discussion. Architectural alignment confirmed before any code is written.
- **Complete file deliveries only** — never patches or diffs. Full repo-root path and folder location stated next to every filename in delivery summaries.
- **IDYQ locked files:** `server/pdfGenerator.ts` (no modifications), `server/routers.ts` (add-only — modifications need explicit per-line permission), `client/src/pages/QuoteWorkspace.tsx` (explicit permission required). For this session, also treat `client/src/pages/AdminPanel.tsx` as **explicit-permission-required** if any direct modification is needed.
- **TS check** via `node node_modules/typescript/lib/tsc.js --noEmit` (not `npx tsc`). IDYQ baseline is 69 errors, hold the line — no new errors. TGA Studio baseline TBD on first read.
- **Render shell** commands prefixed with `echo go;` (the terminal eats the first ~8 chars on paste).
- **Schema changes** via direct SQL on Render shell, not drizzle-kit push (drizzle-kit push is broken on Render for enum changes).
- **Dual-schema rule (IDYQ):** `shared/schema.ts` and `drizzle/schema.ts` must always be updated identically.
- **Direct, minimal tone.** Short directional signals from me ("go", "continue", a single letter) are full greenlights — proceed without re-asking permission. I push back when direction is wrong.
- **Changes log.** IDYQ uses the Document History table at the bottom of `IdoYourQuotes-Blueprint.md`. TGA Studio's changelog location: find on first read of the repo, follow the same pattern there.

---

## Where IDYQ stands today (the short version)

- **Sender identity:** all transactional email goes from `IdoYourQuotes <support@mail.idoyourquotes.com>` via Resend (env-driven `RESEND_FROM_EMAIL` on Render). Old `noreply@idoyourquotes.com` is the code-level fallback default but no longer actively used.
- **Email verification at registration:** **removed** in E.24. New self-signups land with `emailVerified=true` immediately. The `/api/auth/verify-email` and `/api/auth/resend-verification` routes still exist as no-op redirects/success-stubs for backward compat. Team-invite flow still uses `emailVerified=false` as a "pending password set" state — untouched. The schema column stays.
- **Email scheduler:** Day 3 check-in / Day 12 reminder / Day 14 trial-ended (the new E.22 one) all fire on schedule, deduped via `_emailFlags` in `defaultDayWorkRates`.
- **Stripe webhooks:** activation, payment_failed, subscription_ended, and tier-change-via-portal recovery all wired and emailed.
- **Single-tenant production state:** Sweetbyte Ltd Pro tier, no other live customers — meaning aggressive refactors are still safe.

---

## What I want from your first response

Read both zips, the IDYQ Blueprint, and the TGA Studio repo structure. **Don't write code yet.** Reply with:

1. Which integration approach (a/b/c) and a one-paragraph justification
2. Auth proposal — what flow protects the new APPS surface
3. Which files in TGA Studio you'd touch (folder + filename) and what each change is in app-terms
4. Any IDYQ-side change needed to enable the integration (e.g. an admin tRPC procedure exposed to a service token, a CORS allowance) and what file would carry it
5. Anything in either codebase you'd need me to clarify before the plan is reasonable

Then I'll review and we go from there.
