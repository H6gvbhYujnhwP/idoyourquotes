# IdoYourQuotes — Build Rules

## Non-negotiables — never modify without permission
- `server/pdfGenerator.ts` — **NEVER modify under any circumstance.** Build a parallel file (e.g. `pdfGeneratorV2.ts`) when a redesign is needed; original stays as rollback.
- `client/src/pages/QuoteWorkspace.tsx` — explicit permission required per session.
- `client/src/pages/AdminPanel.tsx` — explicit permission required per session.
- `server/routers.ts` — **add-only.** Don't refactor existing procedures. Adding a new sub-router import + mount line is acceptable.

## Sector scope (current)
- **Four GTM sectors only:** IT Services, Commercial Cleaning, Website & Digital Marketing, Pest Control.
- **Electrical sector is permanently deleted** — not paused. No electrical-specific code outside any pre-existing dead branches awaiting cleanup.
- All code must be sector-agnostic across the four remaining sectors. IT Services gets the active development energy.

## Pre-code protocol
- List every file and function in the call chain before writing any code.
- Confirm architectural plan in app terms (what the user sees) before code terms (file paths).
- No code without explicit greenlight ("go", "yes", "continue", single-letter approvals all count).
- **TypeScript baseline: 69 errors.** Hold it exactly.
- Verify with: `node node_modules/typescript/lib/tsc.js --noEmit` (NOT `npx tsc` — `--ignore-scripts` skips the `.bin` symlink).
- Zero new TS errors in any modified or new file.

## Schema rules
- **Dual schema:** `shared/schema.ts` and `drizzle/schema.ts` must always be updated identically.
- **Direct SQL only on Render shell.** `drizzle-kit push` is broken on Render for enum-rename scenarios — will offer destructive operations.
- Prefix every Render shell command with `echo go;` — the terminal eats the first ~8 characters on paste.

## Dependencies
- Lockfile is authoritative: `pnpm-lock.yaml`. Render ignores `package-lock.json`.
- Use the pnpm version pinned in `packageManager` field (currently `pnpm@10.4.1`).
- Install pnpm globally if needed: `npm install -g pnpm@10.4.1`.
- Regenerate with `pnpm install --ignore-scripts --no-frozen-lockfile`.
- State exact pinned dep versions in delivery summaries.

## Delivery
- **Complete files only**, not patches or diffs.
- **Folder location next to every filename** in delivery summaries.
- Stage in `/mnt/user-data/outputs/<delivery-name>/<repo-relative-path>/` and use `present_files`.
- Run TS check before delivery, confirm 69-baseline held.

## Communication style
- Wez writes in short directional signals — single-word greenlights are full approvals.
- App-terms before code-terms.
- No interactive pop-ups for questions (no `ask_user_input_v0`). Prose only.
- For UX proposals: show 2-3 rendered mockups side-by-side via the Visualizer (mockup module).
- Direct, minimal, decisive. Don't ramble. Recommend when you can rather than asking open questions.

## Deployment flow
- Wez deploys via GitHub Desktop → Render auto-deploy.
- Schema changes: direct SQL on Render shell, NOT `drizzle-kit push`.

## Historical docs
- `IdoYourQuotes-Blueprint.md` — running source of truth, Document History changelog at the bottom.
- `NEXT-SESSION-PROMPT.md` — current session handover (read this first in every new chat).
- `todo.md` — parked items.
- `ELECTRICAL-BUILD-BRIEF.md`, `ELECTRICAL-ROADMAP.md` — historical only (sector deleted, retained for reference).
