# IdoYourQuotes — Electrical Workspace Build Brief
**For use in new build chats alongside the codebase zip. Do not feed SESSION-START.md into electrical build chats — use this file only.**

---

## 1. What We Are Building

A completely separate frontend workspace for the electrical sector. The goal is full end-to-end workflow: upload drawings → symbol takeoff → QDS with labour auto-calculation → quote generation → PDF tender submission document.

This is **not a modification of QuoteWorkspace.tsx**. It is a new set of files that share only the server infrastructure (tRPC routes, DB, billing, auth, R2 storage).

---

## 2. New Files Being Created

| File | Purpose |
|---|---|
| `client/src/pages/ElectricalWorkspace.tsx` | Main workspace page for electrical sector |
| `client/src/components/electrical/ElectricalQDS.tsx` | Electrical-specific QDS component |
| `client/src/components/electrical/ElectricalTakeoffPanel.tsx` | Symbol counts, measurements, editable takeoff |
| `client/src/components/electrical/ElectricalPDF.tsx` | Electrical PDF template (phases, timelines, plant hire, labour) |
| `server/engines/electricalEngine.ts` | Server-side electrical AI engine (Tier 3) |

**Files that must NOT be modified:**
- `QuoteWorkspace.tsx` — untouched
- `QuoteDraftSummary.tsx` — untouched
- `routers.ts` — only add new routes, never modify existing ones
- `db.ts` — only add new queries if needed
- `pdfGenerator.ts` — add electrical template as a new function, do not modify existing `generateSimpleQuoteHTML`

---

## 3. Routing Rule

In the quote routing component, detect sector and render the correct workspace:

```typescript
// Pseudocode — check quote.sector field
if (quote.sector === 'electrical') {
  return <ElectricalWorkspace quoteId={quoteId} />;
}
return <QuoteWorkspace quoteId={quoteId} />;
```

The sector field already exists on the quotes table. No schema changes needed for routing.

---

## 4. Electrical Workspace Flow

### Tab Structure
1. **Inputs** — Upload drawings, optional symbol legend PDF, paste email/text scope
2. **Takeoff** — Per-drawing symbol counts, measurements, scope confirmation
3. **QDS** — Quantities + labour auto-calculated from Spon's reference + plant hire
4. **Quote** — Line items, totals, phases, timelines
5. **PDF** — Tender submission document

### Input Rules
- Drawings upload: multiple PDFs, processed one by one
- Legend/symbol key: **single dedicated upload slot**, labelled "Symbol Legend (optional)" — separate from drawings
- Legend can also be embedded in a drawing — the AI should detect and use it either way
- Paste email/text field: drives scope inclusion/exclusion — AI reads this to know what to include and exclude from the takeoff
- All inputs survive re-analysis — nothing the user has edited is ever destroyed

---

## 5. Takeoff Panel Behaviour

- AI analyses every drawing and extracts **every symbol it can find** — it never silently drops anything
- Each symbol shown as a row: symbol code | description | count | unit | editable measurement field
- **Greyed-out toggle per row** — user can grey out / exclude items not in scope (ELV tray, fire alarm tray, symbols not their responsibility)
- Measurements are editable — user can correct AI-extracted lengths, counts, areas
- Unknown symbols are **always shown**, never silently dropped — user resolves them (describe it / exclude it)
- Legend handling: AI reads legend from whatever source it finds — embedded on drawing, separate PDF upload, or user-defined in the takeoff panel
- Per-drawing grouping — drawings listed separately so Mitch can see quantities per floor/drawing

---

## 6. QDS Behaviour

### Core Rules
- QDS is built from confirmed takeoff data — never re-runs takeoff automatically
- **Re-analysis NEVER destroys user edits** — this is enforced at every level:
  - `plantHire` array is preserved on re-analysis (captured before parse, injected back)
  - `assumptions` and `exclusions` only written on first generation, never overwritten
  - User-edited quantities, prices, and labour hours are preserved via `takeoffOverrides`
- QDS is manually editable at all times

### Labour Auto-Calculation
When a symbol/item is in the QDS, the system automatically calculates labour hours using:
1. Match item type to Spon's reference data (see Section 8)
2. Multiply by quantity and measurement
3. Apply user's labour rate (from settings, defaulting to £60/hr)
4. Show as editable field — user can override any calculated value

### QDS Sections for Electrical
- **Line Items** — fittings, accessories, devices (per symbol, per fitting)
- **Containment** — cable tray/trunking by metre, with fittings (Ts, bends, crossovers)
- **Cabling** — by metre and type where extracted from DB schedule or measured
- **First Points** — number of circuits × first point charge (user-entered rate)
- **Plant / Hire** — daily/weekly rate fields (built, see QuoteDraftSummary.tsx)
- **Preliminaries** — site accommodation, welfare, travel
- **Labour Summary** — auto-totalled from all sections
- **Sundries** — allowance per fitting

---

## 7. PDF Output for Electrical

The electrical PDF is a **formal tender submission document**, not the standard quote layout. It must include:

- Cover page: project name, reference, date, tender submission
- Project description and scope
- **Phases and timeline** — AI extracts from QDS labour hours and applies realistic programme (e.g. first fix, second fix, testing, commissioning). User can edit phase names and durations in QDS before generating
- Line item breakdown by discipline section (Lighting / Small Power / Containment / Fire Alarm etc — only sections with items)
- Plant hire breakdown with buy-in / sell / profit per item
- Labour summary
- Exclusions and assumptions (from tenderContext)
- Terms and conditions

---

## 8. Labour Reference Data (Spon's / Durand)

Stored in `server/data/electricalLabourRates.ts` as a typed lookup table. The electrical engine uses this to auto-populate `installTimeHrs` on QDS items.

### Key rates to implement:

**Luminaires (hrs/unit)**
- LED recessed downlight: 0.60
- LED bulkhead (wall mounted, IP65): 0.45
- LED surface linear (IP20): 0.70
- LED surface linear (IP66): 0.70
- Emergency exit sign/bulkhead: 0.80
- External floodlight: 0.90
- PIR presence detector: 0.25

**Accessories (hrs/unit)**
- Single socket outlet: 0.23
- Double socket outlet: 0.25
- FCU (fused connection unit): 0.25
- 20A DP switch: 0.25
- 1-gang light switch: 0.16
- 2-gang light switch: 0.20
- Dimmer switch: 0.25
- Rotary isolator: 0.40

**Cable tray — straight runs (hrs/m)**
- 150mm medium duty: 0.26
- 300mm medium duty: 0.39
- 450mm medium duty: 0.46
- 600mm medium duty: 0.59

**Cable tray fittings (hrs/unit, 300mm)**
- 90 degree bend: 0.90
- Equal tee: 1.20
- Four-way crossover: 1.40
- Internal riser: 1.00

**Distribution boards**
- 12-way consumer unit: 2.40
- 26-way DB (100A): ~3.00
- MCB/RCBO per device: 0.18

**Testing (hrs/circuit)**
- Dead test: 0.25
- Live test: 0.15

**Productivity multipliers** (user-selectable in QDS):
- New build / open access: 0.85
- Standard: 1.00
- Refurb / occupied: 1.25
- Working at height >3m: 1.20

---

## 9. Key Architectural Guardrails

- **Sector agnosticism of shared code** — ElectricalEngine is a Tier 3 engine dispatched by `engineRouter.ts`. Changes to it cannot affect GeneralEngine or DrawingEngine
- **No duplication of infrastructure** — use existing tRPC routes for quotes, lineItems, tenderContext, catalog, R2 storage. Never create parallel versions
- **plantHire protection** — already implemented in QuoteWorkspace.tsx output. Must be replicated in ElectricalWorkspace.tsx from day one
- **QDS edit preservation** — the pattern is: capture existing user state before any AI call, inject it back into the result. Apply this to ALL user-editable QDS fields in the electrical workspace
- **No measurements hardcoded** — every drawing measured fresh from its own geometry and scale. Scale bar on the drawing is always the reference
- **AI includes everything** — the AI never silently drops symbols. Unknown symbols are flagged, not removed

---

## 10. Build Order (Phases)

### Phase 1 — Routing split
Detect `quote.sector === 'electrical'` and render `ElectricalWorkspace`. Skeleton page with tabs. No functionality yet. Deploy and verify routing works.

### Phase 2 — ElectricalWorkspace shell
Full tab structure, input handling, drawing upload, legend upload slot. Wire to existing tRPC input routes. Paste email/text field with scope instruction behaviour.

### Phase 3 — Takeoff Panel
Per-drawing symbol extraction with greyed-out toggles, editable measurements, unknown symbol resolution, legend detection (embedded or separate PDF).

### Phase 4 — ElectricalQDS
QDS with all electrical sections. Labour auto-calculation from Spon's reference. plantHire protection from day one. Re-analysis protection on all user-edited fields.

### Phase 5 — electricalEngine.ts
Server-side AI engine. Reads confirmed takeoff + QDS to generate line items with Spon's labour. Produces phases and timelines from total labour hours.

### Phase 6 — Electrical PDF template
Tender submission format. Phases, timelines, plant hire, labour summary, exclusions, assumptions.

---

## 11. Shared Infrastructure Reference

These existing routes/functions should be called directly — never duplicated:

| Need | Use |
|---|---|
| Save/load quote fields | `trpc.quotes.updateQuote`, `trpc.quotes.getFull` |
| Line items | `trpc.lineItems.*` |
| Tender context (assumptions/exclusions) | `trpc.tenderContext.upsert` |
| Catalog | `trpc.catalog.*` |
| File upload to R2 | existing upload routes |
| Recalculate totals | `recalculateQuoteTotals` in db.ts |
| PDF generation trigger | add electrical branch in `generatePDF` route |

---

## 12. Patrixbourne Avenue — Reference Tender Pack

Mitch's test job. Six documents uploaded:
- `A1101-KCL-00-00-D-E-2401.pdf` — Ground floor small power layout
- `A1101-KCL-00-01-D-E-2411.pdf` — First floor small power layout
- `A1101-KCL-00-00-D-E-2501.pdf` — Ground floor lighting layout (symbols: A1, B1, C1, D1, G1, H1, J1, PIR)
- `A1101-KCL-00-01-D-E-2511.pdf` — First floor lighting layout
- `A1101-KCL-XX-XX-L-E-2401.pdf` — Distribution board schedule (26 circuits, cable lengths)
- `A1101-KCL-XX-XX-L-E-2411.pdf` — Equipment schedules (switchgear, accessories, fire alarm)

This pack should be used as the primary validation test for each phase.

