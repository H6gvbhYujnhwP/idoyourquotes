# IdoYourQuotes — Electrical Workspace Roadmap
**Strategic plan and rationale. Read alongside ELECTRICAL-BUILD-BRIEF.md.**

---

## Why a Separate Workspace

The electrical sector workflow is fundamentally different from all other sectors:
- Input is always technical drawings — not voice, not emails alone
- Quantities come from symbol counts and physical measurements, not AI interpretation of text
- Labour is calculated from reference rates (Spon's) applied to measured quantities
- Output is a formal tender submission, not a standard quote

The existing `QuoteWorkspace.tsx` and `QuoteDraftSummary.tsx` share components across all 26 sectors and cannot safely carry electrical-specific logic without constantly breaking other sectors. The solution is a dedicated frontend flow that shares only the server infrastructure.

---

## Core Principle: The AI Sees Everything, The User Controls Scope

The system never decides what's in or out of scope. It extracts everything it can find and presents it. The user then:
1. Greys out items not in their scope (ELV tray, fire alarm tray, excluded disciplines)
2. Edits measurements and counts where the AI got them wrong
3. Uses the email/text paste field to tell the AI what's included/excluded upfront

This reflects how Mitch actually works — he looks at every drawing and decides what he's responsible for, drawing by drawing. The system assists that decision, it doesn't make it.

---

## The QDS Re-Analysis Protection Principle

**Nothing a user has edited is ever destroyed by re-analysis.**

This is enforced at three levels:
1. **plantHire** — captured before parse, injected back into result
2. **assumptions/exclusions** — only written on first generation (server-side guard in routers.ts)
3. **takeoffOverrides** — symbol quantity/name/price edits stored separately, merged back in

Every new editable field added to the electrical workspace must follow the same pattern from day one.

---

## Labour Calculation Philosophy

The system is "magically automatic but always editable":
- AI extracts symbol types and quantities from drawings
- Spon's/Durand reference rates are applied automatically per item type
- Labour hours appear pre-filled in the QDS
- Every figure is editable — Mitch's experience overrides the reference
- Productivity multiplier (new build vs refurb vs working at height) applied globally

This means Mitch never needs to manually look up Spon's — the system does it — but he keeps full control.

---

## Phase Summary

| Phase | What Gets Built | Validation |
|---|---|---|
| 1 | Routing split — electrical sector opens ElectricalWorkspace | Navigate to an electrical quote, see new shell |
| 2 | Workspace shell — tabs, input handling, drawing + legend upload | Upload Patrixbourne drawings, see them listed |
| 3 | Takeoff panel — symbol counts, measurements, toggles, unknown symbols | Count A1/B1/C1 fittings from Patrixbourne lighting drawings |
| 4 | ElectricalQDS — all sections, labour auto-calc, plant hire, protection | QDS populated from takeoff, labour hours shown, re-analyse without destroying edits |
| 5 | ElectricalEngine — server-side AI, phases and timelines | Generate quote with phases and labour summary |
| 6 | Electrical PDF — tender submission format | PDF matches tender pack requirements |

---

## Token/Memory Management for Build Chats

Each build chat receives:
- `ELECTRICAL-BUILD-BRIEF.md` — this is the primary context document
- Codebase zip — for reading affected files
- Do NOT feed `SESSION-START.md` into electrical build chats

At the end of each build chat, note any decisions that need to go back into `SESSION-START.md` in a handover block.

---

## What Success Looks Like for Mitch

Mitch uploads the Patrixbourne pack (6 PDFs). The system:
1. Identifies 4 drawing types (small power GF, small power FF, lighting GF, lighting FF) and 2 schedule documents
2. Extracts all symbols from all 4 drawings with counts
3. Asks him what's in scope (or reads his paste email to determine it)
4. Pre-fills QDS with quantities, Spon's labour hours, and cost estimates
5. Mitch edits what needs editing, adds plant hire, confirms
6. Generates a professional tender submission PDF with phases, timelines, and full breakdown

A job that currently takes 16 hours takes under 2.

