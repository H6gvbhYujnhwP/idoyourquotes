# IdoYourQuotes — Build Rules

## Non-negotiables — never modify
- client/src/pages/QuoteWorkspace.tsx
- generateSimpleQuoteHTML function in server/pdfGenerator.ts
- Any existing procedure body in server/routers.ts (additions only, no modifications)

## Electrical workspace
- Must stay fully isolated from the other 25 sectors
- Current state source of truth: ELECTRICAL-BUILD-BRIEF.md
- Historical log: SESSION-START.md (read only when relevant to current task, never dump it all into context)

## Pre-code protocol
- List every file and function in the call chain before writing any code
- Confirm the file list with me before touching anything
- Run `npx tsc --noEmit --skipLibCheck` before declaring done
- Zero new tsc errors vs baseline (baseline was 83 as of 18 Apr)

## Sector agnosticism
- No trade-specific examples in code, comments, or reasoning
- All 26 sectors must keep working — features scoped only to one sector are bugs unless explicitly electrical-only

## Delivery
- Deliver complete files, not patches
- Show the file list before editing, wait for confirmation

## Labour rates
- Spon's M&E 2024, grade LQ — never US figures

## Deployment flow
- I deploy via GitHub Desktop → Render auto-deploy
- Schema changes: `npx drizzle-kit push` on the Render shell
