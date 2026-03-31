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
| `server/data/electricalLabourRates.ts` | Spon's UK labour rate lookup table |

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
if (quote.sector === 'electrical') {
  return <ElectricalWorkspace quoteId={quoteId} />;
}
return <QuoteWorkspace quoteId={quoteId} />;
```

The sector field already exists on the quotes table. No schema changes needed for routing.

---

## 4. UI Layout — Fixed Height, Single Scroll

**Critical:** The current general workspace has three competing scrollbars. The electrical workspace must be built with a fixed-height layout from day one.

### Layout Rules
- Workspace is a **fixed viewport layout** — outer page does not scroll while in the workspace
- Left sidebar (drawing list): fixed height, scrolls independently within its own column
- Main content area: takes remaining width and height, scrolls within itself only
- No nested scroll contexts competing with each other
- Only one scrollbar visible at any time

### Tab Structure
1. **Inputs** — Upload drawings, optional symbol legend PDF, paste email/text scope
2. **Takeoff** — Per-drawing symbol review table, measurements, scope toggles
3. **QDS** — Quantities + labour auto-calculated from Spon's reference + plant hire
4. **Quote** — Line items, totals, phases, timelines
5. **PDF** — Tender submission document

---

## 5. Input Rules

- Drawings upload: multiple PDFs, processed one by one
- Legend/symbol key: **single dedicated upload slot**, labelled "Upload Symbol Legend (optional)" — visually distinct from drawing upload zone
- Legend can also be embedded in a drawing — the AI detects and uses it either way
- **Job-level legend memory**: once a legend is uploaded or defined, it applies to ALL drawings on that job. Never uploaded twice
- Paste email/text field: drives scope inclusion/exclusion — AI reads this to know what to include/exclude
- All inputs survive re-analysis — nothing the user has edited is ever destroyed

---

## 6. Legend Handling — Three Scenarios

The AI must always try to resolve symbols automatically before involving the user.

### Scenario A — Legend embedded on drawing
AI reads the legend from the drawing page, builds complete symbol map, counts everything. No questions asked.

### Scenario B — Legend uploaded as separate PDF
AI reads the legend upload slot first, builds symbol map, processes all drawings against it. Applies to all drawings on the job.

### Scenario C — No legend found
AI asks **once** per job:

> *"I've analysed this drawing but couldn't find a symbol legend. You can upload a legend PDF using the legend slot above, or I can show you the symbols I found and you can describe them below."*

Two options: upload legend (AI re-processes automatically) or define manually (symbol review table with blank descriptions). Never asks again after this.

---

## 7. Takeoff Panel — Symbol Review Table (Not a Question Flow)

**Replace the current per-symbol question drip entirely.**

### Review Table Structure

| Toggle | Symbol Code | AI Description | Count | Unit | Measurement | Status |
|---|---|---|---|---|---|---|
| ✓ | A1 | IP65 LED Recessed Downlight | 24 | each | — | Matched |
| ✓ | B1 | IP65 Wall Mounted LED Bulkhead | 8 | each | — | Matched |
| ✓ | HOB | 32A DP Switch Serving Hob | 2 | each | — | Matched |
| ⚠ | FAP | Fire Alarm Panel Isolator | 2 | each | — | Review |
| ✗ | CD | — | 5 | — | — | Excluded |

### Column Behaviours
- **Toggle**: green = include, grey = exclude. User clicks to toggle
- **AI Description**: editable inline — user corrects any wrong match
- **Count**: editable — user corrects AI count
- **Measurement**: editable — for linear/area items (cable tray lengths, trunking runs)
- **Status**: Matched / Review (amber, AI uncertain) / Excluded (user toggled or auto-excluded)

### What the AI Does Automatically
1. Reads legend first (embedded, uploaded, or job-level memory)
2. Matches every symbol to legend — pre-fills all descriptions
3. Flags uncertain matches as Review in amber
4. Auto-excludes title block annotations, engineer initials, revision markers — never asks the user about these
5. Only truly unresolvable symbols appear with blank descriptions

### Per-Drawing Grouping
Left sidebar lists drawings. Selecting one shows its symbol review table. Counts are per-drawing and aggregated in QDS.

---

## 8. QDS Behaviour

### Core Rules
- QDS built from confirmed takeoff — never re-runs takeoff automatically
- **Re-analysis NEVER destroys user edits:**
  - `plantHire` array preserved (captured before parse, injected back)
  - `assumptions` and `exclusions` only written on first generation
  - User-edited quantities, prices, labour hours preserved via `takeoffOverrides`
- QDS manually editable at all times

### Labour Auto-Calculation
When a symbol/item is confirmed in takeoff:
1. Match item description to Spon's UK reference data (Section 10)
2. Multiply hours/unit by quantity, or hours/metre by measurement
3. Apply productivity multiplier (user selects — see Section 10)
4. Apply user's labour rate from settings (default £60/hr)
5. Show as editable field — user overrides any value

### QDS Sections for Electrical
- **Line Items** — fittings, accessories, devices (per symbol, per fitting)
- **Containment** — cable tray/trunking by metre, with fittings
- **Cabling** — by metre and type
- **First Points** — circuits × first point charge (user-entered rate)
- **Plant / Hire** — daily/weekly with buy-in/sell/profit auto-calc
- **Preliminaries** — accommodation, welfare, travel
- **Labour Summary** — auto-totalled
- **Sundries** — allowance per fitting

---

## 9. PDF Output for Electrical

Formal tender submission document:

- Cover page: project name, reference, date, tender submission
- Project description and scope
- **Phases and timeline** — derived from total labour hours: first fix → second fix → testing → commissioning. User edits in QDS before generating
- Line item breakdown by discipline (only sections with items)
- Plant hire breakdown with buy-in / sell / profit
- Labour summary
- Exclusions and assumptions
- Terms and conditions

---

## 10. Labour Reference Data — UK Spon's (Authentic)

**Source:** Spon's Construction Resource Handbook (Bryan Spain, E&FN Spon / Taylor & Francis), verified against Spon's M&E Services Price Book 2024. Grade: LQ (Qualified Electrician). These are authentic UK figures — they supersede all previous Durand Associates (US) data.

Stored in `server/data/electricalLabourRates.ts` as a typed lookup table.

---

### Cable Tray — Straight Runs (hrs/m)

| Width | Hours/m |
|---|---|
| 50mm | 0.25 |
| 75mm | 0.28 |
| 100mm | 0.30 |
| 150mm | 0.34 |
| 225mm | 0.40 |
| 300mm | 0.46 |
| 450mm | 0.57 |
| 600mm | 0.70 |

### Cable Tray Fittings (hrs/unit)

| Width | Flat Bend | Tee | Riser | 4-Way Crossover |
|---|---|---|---|---|
| 50mm | 0.25 | 0.25 | 0.38 | 0.31 |
| 100mm | 0.28 | 0.28 | 0.48 | 0.35 |
| 150mm | 0.30 | 0.30 | 0.51 | 0.38 |
| 225mm | 0.32 | 0.32 | 0.60 | 0.40 |
| 300mm | 0.36 | 0.36 | 0.69 | 0.45 |
| 450mm | 0.43 | 0.43 | 0.86 | 0.54 |
| 600mm | 0.50 | 0.50 | 1.05 | 0.63 |

### Galvanised Steel Trunking (hrs/m)

| Size | Single | Twin | Triple |
|---|---|---|---|
| 50x50mm | 0.41 | 0.46 | 0.51 |
| 75x75mm | 0.50 | 0.55 | 0.60 |
| 100x100mm | 0.60 | 0.65 | 0.70 |
| 150x150mm | 0.77 | 0.82 | 0.87 |

### Steel Conduit Surface Fixed (hrs/m)

| Size | Surface | Chase/Screed |
|---|---|---|
| 20mm | 0.65 | 0.50 |
| 25mm | 0.75 | 0.60 |
| 32mm | 1.00 | 0.70 |

### Socket Outlets and Switches (hrs/unit, including back box)

| Item | Hours |
|---|---|
| 13A 1-gang switched socket outlet | 0.55 |
| 13A 2-gang switched socket outlet | 0.50 |
| 13A DP switch fused connection unit (FCU) | 0.50 |
| 1-gang light switch | 0.40 |
| 2-gang light switch | 0.50 |
| 3-gang light switch | 0.68 |
| 4-gang light switch | 0.78 |
| Telephone / data / TV outlet | 0.40 |

### Luminaires (hrs/unit, fixed to background or suspended)

| Type | Hours |
|---|---|
| LED/fluorescent batten 1200–1500mm surface | 1.05 |
| LED/fluorescent batten twin surface | 1.35 |
| Recessed modular luminaire 600x600mm false ceiling | 1.31 |
| Recessed LED wall washer / downlight | 0.75 |
| IP65 waterproof bulkhead/batten 1200mm | 1.64 |
| Emergency luminaire 8W bulkhead non-maintained | 0.95 |
| High bay suspended with chains/hooks | 1.26 |
| Floodlight wall mounted 250W/400W | 1.98 |

### Distribution Boards / Consumer Units (hrs/unit)

| Type | Hours |
|---|---|
| 4-way SP&N single phase | 1.35 |
| 8-way SP&N single phase | 1.89 |
| 12-way SP&N single phase | 2.30 |
| 18-way SP&N single phase | 2.70 |
| 4-way TP&N three phase | 2.97 |
| 12-way TP&N three phase | 3.65 |
| 18-way TP&N three phase | 4.32 |
| MCB/RCBO per device | 0.15–0.25 |

### Twin and Earth Cable Clipped Direct (hrs/m)

| Size | 2-core | 3-core |
|---|---|---|
| 1.5mm² | 0.18 | 0.20 |
| 2.5mm² | 0.19 | 0.22 |
| 4.0mm² | 0.21 | 0.23 |
| 6.0mm² | 0.22 | 0.27 |
| 10.0mm² | 0.26 | 0.30 |
| 16.0mm² | 0.30 | 0.33 |

### SWA Cable Clipped to Tray (hrs/m)

| Size | 2-core | 3-core | 4-core |
|---|---|---|---|
| 1.5mm² | 0.32 | 0.32 | 0.32 |
| 2.5mm² | 0.32 | 0.32 | 0.34 |
| 4.0mm² | 0.34 | 0.34 | 0.34 |
| 6.0mm² | 0.34 | 0.34 | 0.37 |
| 10.0mm² | 0.37 | 0.38 | 0.43 |
| 16.0mm² | 0.37 | 0.40 | 0.46 |

### SWA Gland Terminations (hrs/unit, includes brass locknut, earth ring, drilling)

| Size | 2-core | 3-core | 4-core |
|---|---|---|---|
| 1.5mm² | 0.66 | 0.75 | 0.83 |
| 2.5mm² | 0.66 | 0.75 | 0.83 |
| 4.0mm² | 0.88 | 0.75 | 1.00 |
| 6.0mm² | 0.99 | 0.92 | 1.00 |
| 10.0mm² | 1.19 | 1.09 | 1.19 |
| 16.0mm² | 1.39 | 1.39 | 1.59 |

### Fixings and Supports (hrs/unit)

| Item | Hours |
|---|---|
| Unistrut P1000 cut to 1m | 0.60 |
| Unistrut P1000 fixed to background | 1.07 |
| Self-drill anchor 10mm | 0.15 |
| Self-drill anchor 12mm | 0.17 |
| Composite fixing rate 1 fixing | 0.18 |
| Composite fixing rate 2 fixings | 0.23 |

### Productivity Multipliers (user-selectable in QDS)

| Condition | Multiplier |
|---|---|
| New build / open access | 0.85 |
| Standard conditions | 1.00 |
| Refurb / occupied | 1.25 |
| Working at height above 3m | 1.20 |

---

## 11. Key Architectural Guardrails

- **Sector agnosticism** — ElectricalEngine dispatched by `engineRouter.ts`. Changes cannot affect other engines
- **No duplication** — use existing tRPC routes. Never create parallel versions
- **plantHire protection** — implemented in QuoteWorkspace.tsx. Must be in ElectricalWorkspace.tsx from day one
- **QDS edit preservation** — capture user state before AI call, inject back. Apply to ALL editable fields
- **No measurements hardcoded** — every drawing measured fresh from its own scale
- **AI includes everything** — never silently drops symbols
- **Legend memory is job-level** — one upload covers all drawings
- **Single question per job** — if no legend found, ask once only

---

## 12. Build Order (Phases)

**Phase 1 — Routing split**
Detect electrical sector, render ElectricalWorkspace skeleton with fixed-height layout. Deploy and verify routing.

**Phase 2 — Workspace shell**
Tab structure, drawing upload zone, legend upload slot (visually distinct), paste email/text. Fixed-height layout fully implemented.

**Phase 3 — Takeoff Panel**
Symbol review table (not question flow). Three legend scenarios. Job-level legend memory. Per-drawing grouping. Greyed-out toggles, editable counts and measurements. Title block annotations auto-excluded.

**Phase 4 — ElectricalQDS + Drawing Viewer** ✅ COMPLETE
All QDS sections built. Labour auto-calculation using Spon's UK rates with productivity multiplier. plantHire and full re-analysis edit preservation. View Marked Drawing restored with full marker editing.

**Phase 5 — electricalEngine.ts** ✅ COMPLETE
Server-side AI engine. Two exports: (1) `ElectricalEngine` class — `parseDictationSummary` routes here for `tradePreset === "electrical"`. Reads `ELECTRICAL TAKEOFF` blocks from `processedContent`, aggregates counts across drawings, applies Spon's M&E 2024 rates, returns `EngineOutput`. (2) `generateElectricalLineItems(qds, startSortIdx)` — called by `generateDraft` when `qdsSummaryJson._type === "electrical"`. Converts QDS rows to supply items, splits total labour into Phase 1/2/3 (40/40/20%), adds programme note, firstPoints, plantHire, preliminaries, sundries allowance.

**Phase 6 — Electrical PDF** ✅ COMPLETE
Tender submission format with phases, timelines, plant hire, labour summary.

---

## 13. Shared Infrastructure Reference

| Need | Use |
|---|---|
| Save/load quote | `trpc.quotes.updateQuote`, `trpc.quotes.getFull` |
| Line items | `trpc.lineItems.*` |
| Assumptions/exclusions | `trpc.tenderContext.upsert` |
| Catalog | `trpc.catalog.*` |
| File upload | existing R2 upload routes |
| Recalculate totals | `recalculateQuoteTotals` in db.ts |
| PDF trigger | add electrical branch in `generatePDF` route |

---

## 14. Patrixbourne Avenue — Reference Tender Pack

Primary validation test. Six documents:
- `A1101-KCL-00-00-D-E-2401.pdf` — Ground floor small power (legend embedded)
- `A1101-KCL-00-01-D-E-2411.pdf` — First floor small power
- `A1101-KCL-00-00-D-E-2501.pdf` — Ground floor lighting (A1, B1, C1, D1, G1, H1, J1, PIR — legend embedded)
- `A1101-KCL-00-01-D-E-2511.pdf` — First floor lighting
- `A1101-KCL-XX-XX-L-E-2401.pdf` — Distribution board schedule (26 circuits, cable lengths)
- `A1101-KCL-XX-XX-L-E-2411.pdf` — Equipment schedules (switchgear, accessories, fire alarm)

**Phase 3 validation target:** All symbols matched automatically from embedded legends. HOB, FAP, C, K, EPH, WP, TR all resolved without asking. CD (engineer initials) auto-excluded. Zero questions asked.

---

## 15. Phase 4 — Completed Work

### New files

| File | Purpose |
|---|---|
| `server/data/electricalLabourRates.ts` | Spon's M&E 2024 UK labour rate lookup. `matchSponsRate(description)` → `{ hoursPerUnit, unit }` or `null`. `PRODUCTIVITY_MULTIPLIERS` constant. Authoritative server copy — imported by `electricalEngine.ts` (Phase 5). |
| `client/src/components/electrical/ElectricalQDS.tsx` | Full QDS component. 8 sections: Line Items, Containment, Cabling, First Points, Plant/Hire, Preliminaries, Labour Summary, Sundries. Spon's rates auto-applied. Labour rate + productivity multiplier in header. Auto-save debounced 1500ms to `qdsSummaryJson`. |
| `client/src/components/electrical/ElectricalDrawingViewer.tsx` | Full-screen marked drawing viewer. PDF rendered via PDF.js. Interactive SVG marker overlay. Three feedback paths all persist to DB (see below). |

### Modified files

| File | Change |
|---|---|
| `client/src/pages/ElectricalWorkspace.tsx` | QDS tab wired to `ElectricalQDS`. "View" button added per drawing in Takeoff tab. `viewingTakeoffId` state. Viewer modal rendered as sibling via React fragment. `handleViewerExcludedCodesChange` and `handleViewerMarkersUpdated` callbacks. |

### ElectricalQDS — key behaviours

**Stable row key:** `i{inputId}:{code}` — `inputId` never changes even when takeoff record is deleted and recreated on re-analyse. Makes deduplication and edit-preservation reliable.

**Merge on "Update from Takeoff":** Each editable field (`description`, `qty`, `supplyPrice`, `hoursPerUnit`) has a corresponding `*Edited` boolean flag. On rebuild, only unedited fields take fresh takeoff values. Edited fields always survive.

**What survives a QDS rebuild:** `plantHire`, `preliminaries`, `firstPoints`, `sundries`, `labourRate`, `productivityMultiplier` — these live in the root of `ElectricalQDSData` and are never touched by the row merge.

**`qdsSummaryJson` discriminator:** `_type: "electrical"` field distinguishes electrical QDS from general `QuoteDraftData`. Both use the same DB column.

**Section classification:** Description keyword scan routes each row — `cable tray|trunking|conduit|unistrut` → Containment; `cable|swa|t&e|twin.*earth` → Cabling; everything else → Line Items.

**Spon's rates:** Inlined in `ElectricalQDS.tsx` as a client-side mirror of `server/data/electricalLabourRates.ts`. If no rate matches, amber triangle shown — user fills in manually. Both files must be kept in sync when rates are updated.

### ElectricalDrawingViewer — three feedback paths

| Action | How | Persists to DB via |
|---|---|---|
| Chip toggle (grey out symbol type) | Click chip in header bar | `electricalTakeoff.updateExcludedCodes` — immediate, no Save needed |
| Remove individual marker | Click marker on drawing (turns red X) → Save | `electricalTakeoff.updateMarkers` → counts + svgOverlay regenerated |
| Add new marker | Edit Mode → select symbol code chip → click drawing → Save | `electricalTakeoff.updateMarkers` → counts + svgOverlay regenerated |

After `updateMarkers` saves: `refetchTakeoffs()` fires in parent, local `initializedTakeoffs` ref clears for that takeoffId so excluded codes re-initialise from fresh server data.

**"View" button visibility:** Only shown when `takeoff.svgOverlay` exists. Drawings analysed before the svgOverlay feature existed will need a re-analyse first.

---

## 16. Phase 5 — Completed Work

### New files

| File | Purpose |
|---|---|
| `server/engines/electricalEngine.ts` | Tier 3 sector engine. Two exports: `ElectricalEngine` class (SectorEngine) for `parseDictationSummary`, and `generateElectricalLineItems(qds, startSortIdx)` for `generateDraft`. |

### Modified files

| File | Change |
|---|---|
| `server/engines/engineRouter.ts` | Added `ElectricalEngine` import. Removed `"electrical"` from `DRAWING_SECTORS`. Added `tradePreset === "electrical"` branch returning `new ElectricalEngine()` before the DrawingEngine check. Updated comments. |
| `server/routers.ts` | Added `generateElectricalLineItems` import. Added `_type === "electrical"` branch at the top of the `qdsSummaryRaw` parse block in `generateDraft` — calls `generateElectricalLineItems(qds, 0)` and skips the general materials/labour/plantHire paths. |

### ElectricalEngine — key behaviours

**parseDictationSummary path (`ElectricalEngine.analyse`):**
- Filters reference-only inputs (legend PDFs) as belt-and-braces
- Parses `ELECTRICAL TAKEOFF — Drawing: ...` blocks from `processedContent`
- Aggregates counts across drawings (same code+description = one row)
- Calls `matchSponsRate(description)` from `electricalLabourRates.ts` for each item
- Returns `materials[]` (one per symbol type, `unitPrice: 0`, `estimated: true`) and one aggregate `labour[]` entry with total hours
- `riskNotes` lists items with no Spon's match so the user knows which QDS rows need manual hours
- Errors are caught and returned as degraded `EngineOutput` — never throws

**generateDraft path (`generateElectricalLineItems`):**
- Supply items: one line item per QDS row — `[CODE] description — supply`, quantity, supplyPrice
- Phase labour: `Phase 1 — First Fix Labour` (40%), `Phase 2 — Second Fix Labour` (40%), `Phase 3 — Testing & Commissioning` (20%) — each as `qty hrs @ labourRate`
- Productivity multiplier applied to total hours before phase split
- Programme note: `Programme: Xw total @ 2 operatives (Phase 1: Xw, Phase 2: Xw, T&C: Xw)` — zero-cost `unit: "note"` line
- First Points, Plant/Hire (with markup and costPrice), Preliminaries, Sundries allowance (% of supply total)
- startSortIdx param so future callers can offset sort order if needed

### Isolation verification
- `ElectricalEngine` imports only `./types` and `../data/electricalLabourRates` — no cross-engine imports
- `engineRouter.ts` electrical branch gated on strict `=== "electrical"` — no other sector reaches it
- `generateDraft` electrical branch gated on `qds._type === "electrical"` — only fires for electrical QDS
- All 25 other sectors: routing unchanged, `generateDraft` unchanged
- `QuoteWorkspace.tsx`, `pdfGenerator.ts`, `ElectricalQDS.tsx`, `ElectricalWorkspace.tsx` — untouched

---

## 18. Phase 6 — Completed Work

### Modified files

| File | Change |
|---|---|
| `client/src/components/electrical/ElectricalQDS.tsx` | Added `costPrice: number` and `costEdited: boolean` to `ElectricalQDSRow` interface. `buildOrMergeQDS` carries `costPrice` forward (`prev?.costEdited ? prev.costPrice : (prev?.costPrice ?? 0)`) — existing saved QDS without `costPrice` reads safely as `0` via `?? 0`. Added "Buy-in £" column to `ItemTableHeader` (now 12 columns, colSpan updated). Added buy-in input cell in `ItemRow` between Supply £/unit and Supply £ total. `totals` useMemo now accumulates `supplyBuyInTotal` and derives `supplyProfit`, `plantProfit`, `totalProfit`. Grand total card shows internal-only profit rows: supply buy-in, supply profit (green/red + %), plant profit, total profit (bold, green/red + %). All profit rows are QDS-only — never appear in PDF. |
| `server/engines/electricalEngine.ts` | `generateElectricalLineItems`: supply rows now include `costPrice: (row.costPrice ?? 0) > 0 ? String(Math.round((row.costPrice ?? 0) * 100) / 100) : null`. Plant hire already passed `costPrice` correctly — no change. |
| `server/pdfGenerator.ts` | Added electrical branch in `generateQuoteHTML`: `if ((quote as any).tradePreset === "electrical") { html = generateElectricalQuoteHTML(resolvedData); }` — before the existing `isComprehensive` branch. Added `generateElectricalQuoteHTML(data: PDFQuoteData): string` as a new private function at end of file. Template: cover page (navy/teal, logo, project name, TENDER SUBMISSION, client, ref, date), project description, programme table (Phase 1/2/3 with hours and weeks, @ 2 operatives footer), schedule of works (6 sections: Electrical Installation, Containment, Cabling, Labour, Plant & Hire, Preliminaries, Sundries — only non-empty sections rendered), pricing summary (supply/labour/first points/plant/prelims/sundries/subtotal/VAT/total), assumptions & exclusions two-column, terms & conditions, footer. Sell prices only — no cost/margin/profit anywhere in HTML output. |

### Files NOT modified
- `server/routers.ts` — untouched (electrical PDF branch is inside `generateQuoteHTML`, not in the route)
- `server/engines/engineRouter.ts` — untouched
- `QuoteWorkspace.tsx` — untouched (already reads `item.costPrice` correctly for margin display)
- `generateSimpleQuoteHTML` — body byte-for-byte unchanged

### Isolation verification
- `generateSimpleQuoteHTML` body identical to pre-Phase-6 version ✅
- Non-electrical quotes still route through `isComprehensive` / `generateSimpleQuoteHTML` unchanged ✅
- No cost/buy-in/profit data in `generateElectricalQuoteHTML` HTML output ✅
- `costPrice` defaults to `0` in all new QDS rows; existing saved QDS without field reads safely via `?? 0` ✅
- `npx tsc --noEmit --skipLibCheck` = zero new errors (only pre-existing TS2688 @types stubs) ✅

---

## 19. Phase 7 — Completed Work

### Modified files

| File | Change |
|---|---|
| `client/src/pages/ElectricalWorkspace.tsx` | Added `ElectricalPDFTab` component. Added `Printer` and `Info` to icon imports. Replaced `PlaceholderTab` for `activeTab === "pdf"` with `<ElectricalPDFTab quoteId={quoteId} quote={quote} lineItems={fullQuote.lineItems} drawings={drawings} />`. Quote tab still uses `PlaceholderTab`. |

### ElectricalPDFTab — key behaviours

- Pre-generation summary card: project name, client, reference, drawing count, line item count, total hours, programme duration, subtotal, VAT (if applicable), total tender price — all derived from already-loaded `fullQuote.lineItems` and `quote` fields, zero extra queries
- Guard: if `lineItems.length === 0`, button is disabled and an amber warning card explains that a draft quote must be generated first (QDS → Quote tab)
- "Generate Tender PDF" button calls `trpc.quotes.generatePDF.useMutation()` — same route, same server function as all other sectors; the electrical branch in `generateQuoteHTML` handles the routing
- On success: `window.open("", "_blank")` → `document.write(html)` → `print()` after 250ms delay — identical pattern to `QuoteWorkspace.tsx`
- On popup blocked: `toast.error("Please allow popups...")`
- On server error: `toast.error` + console log

### Files NOT modified
- `server/routers.ts` — untouched
- `server/pdfGenerator.ts` — untouched (Phase 6 already complete)
- `server/engines/electricalEngine.ts` — untouched
- `server/engines/engineRouter.ts` — untouched
- `QuoteWorkspace.tsx` — untouched
- All non-electrical components — untouched

### Isolation verification
- `QuoteWorkspace.tsx` untouched ✅
- `routers.ts` untouched ✅
- No new tRPC routes — uses existing `quotes.generatePDF` ✅
- `npx tsc --noEmit --skipLibCheck` = zero new errors ✅

---

## 21. Phase 8 — Completed Work (Quote Tab)

### Modified files

| File | Change |
|---|---|
| `client/src/pages/ElectricalWorkspace.tsx` | Added `Input` import from `@/components/ui/input`. Added `Sparkles`, `Trash2`, `Plus` to lucide imports. Replaced `PlaceholderTab` for `activeTab === "quote"` with `<ElectricalQuoteTab>`. Added `ElectricalQuoteTab` component. |

### ElectricalQuoteTab — key behaviours

**Empty state:** "Generate Draft from QDS" button calls `trpc.ai.generateDraft` — which for electrical reads `qdsSummaryJson._type === "electrical"` and runs `generateElectricalLineItems`. No AI reinterpretation of confirmed QDS rows.

**Confirm on regenerate:** if line items already exist, `window.confirm` before replacing — same guard as `QuoteWorkspace`.

**Line item grouping:** Items classified into 9 sections using the same rules as `pdfGenerator.ts`: Supply, Containment, Cabling, Labour, Programme (note rows), First Points, Plant & Hire, Preliminaries, Sundries. Sections with no items are hidden.

**Programme note rows** (`unit === "note"`): rendered as full-width italic rows — no qty/rate/total columns.

**Inline editing:** click any cell (description, qty, unit, rate) to edit inline. Enter or blur to save via `trpc.lineItems.update`. Escape to cancel. Same pattern as `QuoteWorkspace`.

**Margin column** (internal only, never in PDF): reads `item.costPrice` stored on the line item (written by `generateElectricalLineItems` from QDS buy-in). Shows `£X.XX (Y%)` in green/red. No catalog fallback needed — electrical always stores `costPrice` directly.

**Totals card:** Supply, Containment, Cabling, Labour, First Points, Plant & Hire, Prelims, Sundries (only non-zero lines shown), then Subtotal + VAT + Total tender price.

**Delete:** per-row trash icon on hover, calls `trpc.lineItems.delete`.

**Toolbar:** "Regenerate from QDS" button + line item count. Column header labels aligned to the grid.

### Files NOT modified
- `server/routers.ts` — untouched
- `server/pdfGenerator.ts` — untouched
- `server/engines/electricalEngine.ts` — untouched
- `QuoteWorkspace.tsx` — untouched
- All other files — untouched

---

## 22. Phase 9 — Validation Session (Patrixbourne Avenue Reference Pack)

The electrical workspace is feature-complete end-to-end:
- Inputs ✅ — drawings, legend, scope
- Takeoff ✅ — symbol review table, drawing viewer, include/exclude toggles
- QDS ✅ — Spon's rates, buy-in margin, plant hire, prelims, sundries
- Quote ✅ — line items grouped by section, inline edit, margin display, totals
- PDF ✅ — tender submission document

### Validation test
Mitch ran the complete workspace against the Patrixbourne Avenue reference tender pack (6 drawings). Results: takeoff picked up only 3 symbol types per drawing; FAP, HOB, TR, A1, B1, C1 etc. all missing; all present rows showed "Matched" even when uncertain.

### Bugs found and fixed (2026-03-30)

**Bug 1 — Unknown symbols silently dropped (server/services/electricalTakeoff.ts)**

Root cause: `unknownCodeCounts` (codes not in `DEFAULT_SYMBOL_DESCRIPTIONS` or `symbolMap`) was populated correctly but never merged into `counts` or `detectedSymbols`. The `// Don't drop` comment was incorrect — they were dropped. Result: FAP, HOB, TR, CD, A1, B1 and any other non-default codes produced 0 takeoff rows.

Fix: After step 9 builds counts from known symbols, added step 9b that merges `unknownCodeCounts` entries with `count >= 2` into `counts` (using the correct total) and adds positioned grey markers to `detectedSymbols` for the SVG overlay. Single-occurrence codes (count === 1) remain filtered as likely noise.

**Bug 2 — "Review" status never shown (client/src/pages/ElectricalWorkspace.tsx)**

Root cause: `reviewCodes` Set was built from raw question IDs like `"unknown-symbol-FAP"` and `"status-marker-N"`. The test was `reviewCodes.has(code)` where `code` is `"FAP"`. String mismatch → every row showed "Matched" regardless of questions.

Fix: Strip `unknown-symbol-` and `status-marker-` prefixes when building `reviewCodes` and `questionTextByCode` so bare symbol codes match correctly against `counts` keys.

### Files changed
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | Added step 9b: merge unknownCodeCounts (>= 2) into counts and detectedSymbols |
| `client/src/pages/ElectricalWorkspace.tsx` | Strip question ID prefixes in reviewCodes and questionTextByCode builders |

**Must NOT be modified:** `QuoteWorkspace.tsx`, `routers.ts`, `pdfGenerator.ts`, all other non-electrical files.

### Validation session 2 fixes (2026-03-30)

**Bug C — All marker circles grey (server/services/takeoffMarkup.ts + electricalTakeoff.ts)**

Root cause: `SYMBOL_STYLES` only defines colours for ~20 hardcoded default codes (J, JE, N, AD etc.). Every other code — FAP, HOB, A1, B1, C1, PIR etc. — fell through to the `|| { colour: '#888888' }` fallback. Same in the client viewer via the same `SYMBOL_STYLES` table.

Fix: Added `COLOUR_PALETTE` (20 distinct vivid colours) + deterministic `codeToColour(code)` hash function + exported `computeSymbolStyles(codes[])` to `electricalTakeoff.ts`. `takeoffMarkup.ts` now uses `result.symbolColours ?? computeSymbolStyles(allCodes)` for both SVG overlay and markup data — all codes get a distinct colour. Client computes a matching `allSymbolStyles` from actual takeoff counts using the same palette and hash, passed directly to `ElectricalDrawingViewer` instead of the static `symbolStyles` prop from the DB response.

**Bug D — A1 count inflated (e.g. 22 A1 where 3 expected) (server/services/electricalTakeoff.ts)**

Root cause: pdfjs-dist splits `A1/E` (emergency downlight) into two text elements: `A1` and `/E`. The `/E` was correctly filtered (starts with slash) but `A1` passed through as a normal A1 count — so every emergency fitting on a drawing also added a spurious A1 count.

Fix: Added a word-merging pass immediately after pdfjs extraction. Any word immediately followed by a `/`-prefixed word at the same y-position with negligible x-gap is merged into a single compound token: `A1` + `/E` → `A1/E`. Generic — handles any CODE/SUFFIX convention, not just /E. Also added auto-description for CODE/E variants: `A1/E` is pre-populated as `${A1 description} — Emergency` so these surface as Matched rows rather than Review.

**Files changed — session 2**
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | `symbolColours` on `TakeoffResult` interface; `COLOUR_PALETTE` + `codeToColour` + exported `computeSymbolStyles`; word-merge pass for CODE/SUFFIX tokens; auto-describe CODE/E variants; `symbolColours` added to return |
| `server/services/takeoffMarkup.ts` | Import `computeSymbolStyles`; both `generateSvgOverlay` and `generateMarkupData` use dynamic styles instead of hardcoded `SYMBOL_STYLES` |
| `client/src/pages/ElectricalWorkspace.tsx` | Compute `allSymbolStyles` from actual takeoff codes using client-side `COLOUR_PALETTE` + hash; pass to `ElectricalDrawingViewer` instead of `viewingTakeoff.symbolStyles` |

### Validation session 3 fixes (2026-03-30)

**Bug C (revised) — Colours still grey after session 2 fix**

Root cause: The original `COLOUR_PALETTE` contained dark colours (`#264653` navy, `#9B2226` dark red, `#0077B6` dark blue) that are near-invisible against the dark viewer background. "A1" hashed to index 4 = `#264653` — effectively black on a dark background. All other codes also fell on dark palette entries for this drawing.

Fix: Replaced `COLOUR_PALETTE` (server) and `COLOUR_PALETTE_CLIENT` (client) with 20 bright/vivid colours all visible on dark backgrounds (`#FF6B6B`, `#4ECDC4`, `#FFE66D` etc.). Also updated `STATIC_STYLES_CLIENT` known-code colours to brighter equivalents. Converted `allSymbolStyles` from IIFE to `useMemo(deps: [takeoffList])` to ensure it only recomputes when data changes. Added `useMemo` to React import.

**Bug E — Legend not detected for left-panel legends**

Root cause: Legend detection only scanned `x > pageWidth * 0.6 && y > pageHeight * 0.6` (bottom-right quadrant). The Patrixbourne lighting drawings have their legend in a left side panel (x ≈ 0–280). Result: all codes except J and SB showed "Unknown symbol" because the legend was never read.

**Critical sub-bug — `inArea` excluded entire drawing if legend was left-side**

Root cause: `inArea` only checked `x >= legendExcludeRegion.xMin && y >= legendExcludeRegion.yMin` (two bounds). A left-panel legend with xMin≈30 would have caused every point with x≥30 to be excluded — the entire main drawing. This bug was dormant because legends were never found outside the bottom-right; fixing legend detection would have broken counting entirely without this fix.

Fix: `inArea` now checks all four bounds (`xMin ≤ x ≤ xMax` AND `yMin ≤ y ≤ yMax`).

**Legend detection rewrite:**
The `legendCandidateWords` approach (bottom-right filter) was replaced with a full-page scan:
1. For every short uppercase CODE word, look for a DESCRIPTION word at the same y (±15px), to the right, within 35% of page width, ≥4 chars, not itself a code
2. Collect all CODE→DESCRIPTION pairs found anywhere
3. Group pairs by code x-position in 80px bands — legend codes share a vertical column
4. The band with the most pairs (≥3) is the legend block
5. Exclude that bounding box (xMin–xMax, yMin–yMax) from installation counting
6. Merge found descriptions into `allDescriptions` so all codes surface as Matched not Unknown

**Files changed — session 3**
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | Replace `COLOUR_PALETTE` with bright colours; full legend detection rewrite (position-agnostic); fix `inArea` to check all 4 bounds |
| `client/src/pages/ElectricalWorkspace.tsx` | Replace `COLOUR_PALETTE_CLIENT` with bright colours; brighter `STATIC_STYLES_CLIENT` entries; `useMemo` import; IIFE → `useMemo` |

### Validation session 4 fixes (2026-03-30)

**Bug F — "Unknown symbol" on legend-detected codes**

Root cause: `performElectricalTakeoff` correctly read the embedded legend (X, A1, B1, C1, D1, PC, PIR, H1, G1, J1) and stored descriptions locally in `allDescriptions` — but never persisted them. The client resolves descriptions from `tenderContext.symbolMappings` (already in `fullQuote`) merged into `legendDescriptions` → `allDescriptions`. Since symbolMappings was never populated by the embedded legend path, all codes that weren't in `DEFAULT_SYMBOL_DESCRIPTIONS` showed "Unknown symbol".

Fix: Added `embeddedLegendSymbols?: Record<string, string>` to `TakeoffResult`. `performElectricalTakeoff` now returns the detected embedded legend. In `routers.ts`, both the auto-takeoff path and the manual `analyze` path now save these to `tenderContext.symbolMappings` (merging with any existing entries from an uploaded legend) immediately after `createElectricalTakeoff`. On next `getFull` the client receives them in `fullQuote.tenderContext.symbolMappings` and the description column resolves correctly.

**Bug G (final) — Colours not distinct enough / invisible on white**

Previous rainbow palette contained near-white colours (yellow `#FFEE00`, lime `#66FF00`, cyan `#00FFCC`, mint `#00FFCC`) that are invisible on white drawing backgrounds. Replaced with Option A — 20 bold primary colours, all mid-brightness and fully saturated, chosen specifically for visibility on white:

| # | Hex | Name | | # | Hex | Name |
|---|---|---|---|---|---|---|
| 1 | `#FF0000` | Red | | 11 | `#CC3300` | Brick |
| 2 | `#FF6600` | Orange | | 12 | `#006633` | Forest |
| 3 | `#CC9900` | Gold | | 13 | `#6600FF` | Purple |
| 4 | `#00AA00` | Green | | 14 | `#FF6699` | Rose |
| 5 | `#0066FF` | Blue | | 15 | `#009966` | Emerald |
| 6 | `#9900CC` | Violet | | 16 | `#CC6600` | Copper |
| 7 | `#FF0099` | Hot pink | | 17 | `#3300CC` | Indigo |
| 8 | `#00AAAA` | Teal | | 18 | `#FF0044` | Scarlet |
| 9 | `#FF3300` | Crimson | | 19 | `#00CC66` | Mint |
| 10 | `#0099FF` | Sky | | 20 | `#FF9900` | Amber |

No pastels, no near-whites. Every colour reads clearly against a white CAD drawing. Both `COLOUR_PALETTE` (server, `electricalTakeoff.ts`) and `COLOUR_PALETTE_CLIENT` (client, `ElectricalWorkspace.tsx`) updated in sync. Pure frontend change — no re-upload required, colours recompute at render time from stored counts.

**Files changed — session 4**
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | Add `embeddedLegendSymbols` to `TakeoffResult`; return from `performElectricalTakeoff`; rainbow palette |
| `server/routers.ts` | Save `embeddedLegendSymbols` to `tenderContext.symbolMappings` after auto-takeoff + after `analyze`; add-only changes |
| `client/src/pages/ElectricalWorkspace.tsx` | Rainbow `COLOUR_PALETTE_CLIENT` |

### Validation session 5 fixes (2026-03-30)

**Fix 1 — CODE/E variants show "Unknown symbol" (e.g. A1/E, D1/E)**

Root cause: The auto-describe loop correctly derived descriptions (`A1/E → "IP 65 Rated LED Recessed Downlight — Emergency"`) but stored them in `allDescriptions` (local variable) only. Like the embedded legend before it, these were never persisted. `tenderContext.symbolMappings` was never updated, so the frontend saw "Unknown symbol".

Fix: Added `derivedVariantSymbols: Record<string,string>` to `TakeoffResult`. The derived descriptions are now tracked in this map and merged into `embeddedLegendSymbols` on return. The router already saves `embeddedLegendSymbols` to `tenderContext.symbolMappings` — so the merged map covers both legend codes and CODE/E variants in one write. No router changes needed.

**Fix 2 — Legend pair scanner grabbing bracket annotations as descriptions**

Root cause: `g X  INTERMEDIATE LIGHT SWITCH` followed by `(g = DENOTES NO. OF GANGS)` — the pair scanner took the nearest text to the right of `X`, which on some line layouts was the bracket annotation `(g = DENOTES NO. OF GANGS)` rather than `INTERMEDIATE LIGHT SWITCH`.

Fix: Added two exclusion rules to the candidate description filter: (1) skip any text starting with `(` — these are always parenthetical annotations, never device descriptions; (2) skip text starting with a digit — these are measurements or counts, never descriptions. The scanner now correctly picks `INTERMEDIATE LIGHT SWITCH` as the description for `X`.

**Fix 3 — Switch gang-count notations counted as devices (e.g. X counted as device)**

Root cause: On lighting drawings, switch symbols are annotated with gang counts in the form `2`, `2G`, `G`, `3G` etc. These appear as text tokens on the drawing very close to a switch circle. The code `X` denoting "Intermediate Light Switch" was not the issue — the pair scanner fix above handles description. The actual issue was numeric/gang tokens (`2`, `2G`, `G`) near switches being counted.

Fix: Added Step 5c — gang-count notation exclusion. Before the proximity status-marker logic, any word token matching `^([0-9]+G?|G)$` found within 35px of any detected symbol is immediately flagged as `isStatusMarker: true`. Pure coordinate-proximity logic — no hardcoding of switch types or symbol meanings. Works for 1-gang, 2-gang, 3-gang, 4-gang switches from any consultant on any drawing.

**Files changed — session 5**
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | `derivedVariantSymbols` on `TakeoffResult`; tracked in auto-describe loop; merged with `embeddedLegendSymbols` on return; legend pair scanner rejects bracket + numeric annotations; Step 5c gang-count exclusion |

### Known open items
- Existing takeoffs still need re-upload to pick up all fixes
- After re-upload: A1/E and D1/E should resolve as Matched with Emergency descriptions
- X description should now correctly read "INTERMEDIATE LIGHT SWITCH" not "(g = DENOTES NO. OF GANGS)"
- CD and P02 remain Review — they are title block initials/revision refs, Mitch should exclude them
- `standardFontDataUrl` warning in pdfjs-dist may still affect some drawing fonts

---

## 23. Roadmap — Document Type Classification (Planned)

### Problem

When Mitch uploads an equipment schedule (like `A1101-KCL-XX-XX-L-E-2411.pdf` — Electrical Equipment Schedules, 8 pages), the takeoff engine runs on it and returns spurious results (`A: 2`, `XX: 2` from the project reference string). The PDF viewer also only shows page 1. Both issues stem from the system treating every uploaded PDF identically — as a floor plan drawing.

Real electrical tender packs contain multiple document types, each requiring different handling:

| Type | Examples | Correct behaviour |
|---|---|---|
| **Floor plan drawing** | Lighting layout, small power layout | Run electrical takeoff, render page 1 as drawing |
| **Legend / key sheet** | Symbol key as separate PDF | Mark reference-only, parse as symbolMap |
| **Equipment schedule** | Luminaire schedule, equipment schedule, accessories schedule | Mark reference-only, make content available as AI context |
| **DB / circuit schedule** | Distribution board schedule with circuit list | Mark reference-only, extract circuit data |
| **Riser / schematic** | Single line diagram, riser diagram | Mark reference-only, no takeoff |
| **Specification document** | NBS spec, employer's requirements | Mark reference-only, AI context only |

### Desired behaviour

Upload is magical — the system classifies the document immediately and configures itself appropriately. Mitch never has to manually toggle "reference only" or wonder why a schedule is producing Review rows.

### Detection signals (all generic, no hardcoding)

**Equipment / luminaire schedule:**
- Multiple pages (≥3)
- Contains structured table headers: REF, LOCATIONS, DESCRIPTION, MANUFACTURER, RATING, MODEL (any 3+ of these)
- Low symbol-code density — few short uppercase tokens in counting area
- Contains product names / manufacturer names (Hager, MK, Apollo, Legrand etc.)

**DB / circuit schedule:**
- Table headers: CIRCUIT, DESCRIPTION, RATING, MCB, RCBO, RCD, LOAD
- Contains amperage values (6A, 16A, 32A, 63A, 100A)
- Contains circuit identifiers (DB/LP/01, L1, L2 etc.)

**Legend / key sheet:**
- High CODE→DESCRIPTION pair density relative to page area
- Single page or very few pages
- No floor plan geometry

**Riser / schematic:**
- Contains keywords: RISER, SINGLE LINE, SCHEMATIC, SLD
- No floor plan room labels

**Floor plan drawing (default):**
- Contains room names (BEDROOM, KITCHEN, OFFICE, WC, CORRIDOR etc.)
- Contains scale information (SCALE 1:50, SCALE 1:100)
- Low page count (usually 1)
- Standard A0/A1/A3 page dimensions

### Implementation plan

**Phase 1 — Classification function**
New function `classifyElectricalPDF(text: string, pageCount: number, pageWidth: number, pageHeight: number): PDFDocumentType` in `electricalTakeoff.ts` (or a new `documentClassifier.ts`). Returns one of: `'floor_plan' | 'equipment_schedule' | 'db_schedule' | 'legend' | 'riser_schematic' | 'specification'`. Pure text analysis — no AI API call. Fast, deterministic, runs at upload time.

**Phase 2 — Auto-routing in the upload handler**
After text extraction in the auto-analyze block in `routers.ts`, call classifier. Based on result:
- `floor_plan` → run electrical takeoff (existing behaviour)
- `legend` → auto-set reference-only + run parseLegend (existing flow, but now automatic)
- `equipment_schedule` / `db_schedule` / `riser_schematic` / `specification` → auto-set reference-only, store processed content for AI context, show descriptive badge in Inputs tab ("Equipment Schedule", "DB Schedule" etc.), skip takeoff entirely
- Confidence score returned — if below threshold, fall back to current behaviour and show a "Couldn't classify — please confirm type" prompt

**Phase 3 — Multi-page viewer**
PDF viewer currently renders page 1 only. For reference-only documents, render all pages with a page navigation control. For floor plan drawings, page 1 only remains correct (takeoff is per-page).

**Phase 4 — Inputs tab badges**
Each uploaded document shows its detected type as a coloured badge next to the filename:
- 🟢 Floor Plan — takeoff running
- 🔵 Equipment Schedule — reference only
- 🔵 DB Schedule — reference only
- 🟡 Legend — symbol key loaded
- 🔵 Specification — reference only
- 🟠 Unclassified — manual review needed

User can override the classification if the AI got it wrong.

### Phase 23 implementation — completed (2026-03-31)

**Phase 1 — `classifyElectricalPDF` in `electricalTakeoff.ts`** ✅
- Exported `extractWithPdfParse` (was private)
- Added `PDFDocumentType` union type: `'floor_plan' | 'equipment_schedule' | 'db_schedule' | 'legend' | 'riser_schematic' | 'specification'`
- Added `ClassificationResult` interface: `{ type, confidence: number, signals: string[] }`
- Added `classifyElectricalPDF(text, pageCount, pageWidth?, pageHeight?)` — pure scoring function. Each type accumulates evidence from text signals; highest score wins; below threshold (score < 3) defaults to `floor_plan`. No AI call. Deterministic.

**Phase 2 — auto-routing in `routers.ts`** ✅  
- Added imports: `classifyElectricalPDF`, `extractWithPdfParse`
- Inside auto-takeoff block (after `pdfBuf` fetched): calls `extractWithPdfParse` → `classifyElectricalPDF`
- Non-floor-plan result: calls `updateInputMimeType` with `;reference=true;docType=<type>` — skips `performElectricalTakeoff` entirely
- Floor-plan result: existing takeoff path unchanged
- All changes add-only. No existing procedures modified.

**Phase 3 — `ElectricalReferenceViewer.tsx`** ✅  
- New file: `client/src/components/electrical/ElectricalReferenceViewer.tsx`
- Multi-page PDF viewer: pan/zoom (same UX as `ElectricalDrawingViewer`), page navigation (prev/next buttons + keyboard ← →), page X/Y counter
- Exports `getDocTypeBadgeProps(docType)` — shared helper for badge labels and Tailwind classes
- No marker editing, no symbol chips. Reference-only footer note.

**Phase 4 — `ElectricalWorkspace.tsx` badges** ✅  
- Updated `legend` filter: now matches `;docType=legend` OR `;reference=true` without docType (backwards compat)
- Added `referenceInputs` computed array: PDFs with `;reference=true;docType=` that are not legend
- Added `viewingReferenceId` state
- Sidebar: new "References" section below drawings list — shows filename + docType badge + clickable to open viewer
- `InputsTab` props extended: `referenceInputs`, `onDeleteReference`, `onViewReference`
- `InputsTab` render: new "Reference Documents" card at bottom — blue border, lists each doc with badge + View + delete
- Added `ElectricalReferenceViewer` modal (alongside existing drawing viewer modal)
- Imported `ElectricalReferenceViewer` and `getDocTypeBadgeProps`

**mimeType encoding convention** (Phase 23):
`application/pdf;reference=true;docType=<PDFDocumentType>`  
Read with: `mimeType.match(/;docType=([^;]*)/)?.[1]`

**Files changed — Section 23**
| File | Change |
|---|---|
| `server/services/electricalTakeoff.ts` | Export `extractWithPdfParse`; add `PDFDocumentType`, `ClassificationResult`, `classifyElectricalPDF` |
| `server/routers.ts` | Import `classifyElectricalPDF` + `extractWithPdfParse`; add classification + auto-routing inside auto-takeoff block (add-only) |
| `client/src/components/electrical/ElectricalReferenceViewer.tsx` | **New file** — multi-page reference viewer + `getDocTypeBadgeProps` helper |
| `client/src/pages/ElectricalWorkspace.tsx` | Updated legend/referenceInputs filters; viewingReferenceId state; sidebar References section; InputsTab props + Reference Documents card; reference viewer modal |

**Must NOT be modified:** `QuoteWorkspace.tsx`, `generateSimpleQuoteHTML`, `ElectricalDrawingViewer.tsx`, `pdfGenerator.ts`, `engineRouter.ts`, any non-electrical file.

**Isolation verified:**
- `generateSimpleQuoteHTML` body unchanged ✅
- Non-electrical sectors: no paths touched ✅
- `ElectricalDrawingViewer.tsx`: not modified ✅
- `npx tsc --noEmit --skipLibCheck` = zero new errors (only pre-existing TS2688 @types stubs) ✅

**Bug fix (post-deploy, 2026-03-31):**
`setReferenceOnly` mutation in `ElectricalWorkspace.tsx` (line 312) was calling `trpc.electricalTakeoff.setReferenceOnly` — wrong namespace. The procedure lives in the `inputs` router, not `electricalTakeoff`. Fixed to `trpc.inputs.setReferenceOnly`. Affected the legend manual upload path only — auto-classification of equipment/DB schedules on upload was unaffected. Only file changed: `ElectricalWorkspace.tsx`.

**Bug fix 2 (post-deploy, 2026-03-31):**
`extractWithPdfParse` in `electricalTakeoff.ts` was broken by a `pdf-parse` ESM/CJS interop issue. `require('pdf-parse')` on Render returns `{ default: fn }` instead of `fn` directly; calling it threw `pdfParse is not a function`. The inner `try/catch` silently swallowed this and returned `{ text: '', pages: 1 }`. The classifier received an empty string + pageCount=1, scored everything zero, and defaulted to `floor_plan` — causing equipment/DB schedule PDFs to run takeoff instead of being classified as reference. Fix: normalise the require result: `typeof mod === 'function' ? mod : (mod.default ?? mod)`. After fix, all 8 pages of text are extracted; equipment_schedule scores ~17 — well above the threshold. Only file changed: `electricalTakeoff.ts`.

**Bug fix 4 (post-deploy, 2026-03-31):**
Floor plan drawings were being misclassified as DB Schedule. Root cause: three compounding scorer issues: (1) room name cap of 6 was too low — a floor plan with 7+ rooms was capped at 6 points while DB schedule scored ~10 from circuit annotations present on the drawing. (2) "CONSUMER UNIT" was in the db_schedule keyword list — it appears as a symbol label on every floor plan, incorrectly adding 5 points to db_schedule. (3) "SYMBOL LEGEND" section (present on all floor plans, never on schedules) was not being scored. Fixes: (1) raise room name cap from 6 to 12; (2) remove CONSUMER UNIT from db_schedule trigger keyword list; (3) add SYMBOL LEGEND/SYMBOL KEY as floor_plan signal worth +4. Post-fix: floor plan scores ~18.5 vs db_schedule ~5. DB schedule scores ~14 vs floor_plan 0. Both classify correctly. Only file changed: `electricalTakeoff.ts`.

**Bug fix 3 (post-deploy, 2026-03-31):**
`extractWithPdfParse` was using `pdf-parse` which has persistent CJS/ESM interop issues on Render (the interop normalisation in Bug fix 2 resolved the "not a function" error, but `pdf-parse` still failed for other reasons silently swallowed by the catch block). Root cause identified: `extractWithPdfJs` (which works) only reads **page 1** — so classification was always receiving 35 chars from the cover page regardless of the fix. Correct fix: rewrote `extractWithPdfParse` to use pdfjs-dist (the same proven dynamic import path already used by `extractWithPdfJs`) looping over ALL pages and concatenating text. Eliminates `pdf-parse` dependency for classification entirely. With all 8 pages extracted, the equipment_schedule classifier receives "ELECTRICAL EQUIPMENT SCHEDULES", REF, LOCATIONS, MANUFACTURER, Hager, MK, Apollo etc. — score ~17, well above threshold. Only file changed: `electricalTakeoff.ts`.

**Bug fix 4 (post-deploy, 2026-03-31):**
Floor plan drawings were being misclassified as DB Schedule. Root cause: three compounding scorer issues: (1) room name cap of 6 was too low — a floor plan with 7+ rooms was capped at 6 points while DB schedule scored ~10 from circuit annotations present on the drawing. (2) "CONSUMER UNIT" was in the db_schedule keyword list — it appears as a symbol label on every floor plan, incorrectly adding 5 points to db_schedule. (3) "SYMBOL LEGEND" section (present on all floor plans, never on schedules) was not being scored. Fixes: (1) raise room name cap from 6 to 12; (2) remove CONSUMER UNIT from db_schedule trigger keyword list; (3) add SYMBOL LEGEND/SYMBOL KEY as floor_plan signal worth +4. Post-fix: floor plan scores ~18.5 vs db_schedule ~5. DB schedule scores ~14 vs floor_plan 0. Both classify correctly. Only file changed: `electricalTakeoff.ts`.

---

### Overview

Three things to build, in this order:

1. **Add `costPrice` to `ElectricalQDSRow`** — buy-in column in QDS table, preserved across rebuilds, flows through to generated line items so `QuoteWorkspace.tsx` shows margin exactly as all other sectors do
2. **Pass `costPrice` through `generateElectricalLineItems`** — so `QuoteWorkspace.tsx` reads it from the line item record and shows per-row and total margin (zero extra work on the quote display side — already works this way for all sectors)
3. **`generateElectricalQuoteHTML`** — new PDF function; renders sell prices only, never cost/margin

---

### How the rest of the app does margin (match this exactly)

**Pattern in `QuoteWorkspace.tsx`:**
- Each line item record has a `costPrice` column (in `drizzle/schema.ts` — added 26 Mar 2026)
- Per-row margin cell reads `item.costPrice`; calculates `(rate − costPrice) × qty`; shown as `£X.XX (Y%)`
- `resolveCostPrice()` helper: reads `item.costPrice` first, falls back to catalog match only if null
- Margin summary bar: one colour-coded row per `pricingType` — `standard` = green, `monthly` = teal, `annual` = amber, `optional` = purple; shows `£revenue − £cost = £margin (Y%)`
- **No changes needed to `QuoteWorkspace.tsx`** — it already reads `item.costPrice` correctly. Just pass `costPrice` through from the QDS row and it works.

---

### Concern A — Exact file changes

**`client/src/components/electrical/ElectricalQDS.tsx`:**

1. Add to `ElectricalQDSRow` interface (after `supplyEdited`):
```typescript
costPrice: number;    // £ per unit buy-in
costEdited: boolean;
```

2. Add defaults in `buildRow()` (alongside `supplyPrice: 0, supplyEdited: false`):
```typescript
costPrice: prev?.costEdited ? prev.costPrice : 0,
costEdited: false,
```
Also add `?? 0` fallback when reading from saved JSON: `costPrice: row.costPrice ?? 0` — so existing saved QDS data without `costPrice` deserialises without error.

3. Add "Buy-in £" column to the row table — between supply price and hours columns. Input style identical to `supplyPrice` input. `onChange` sets `{ costPrice: numInput(e.target.value), costEdited: true }`.

4. Update `totals` useMemo — add inside the `for (const r of rows)` loop:
```typescript
let supplyBuyInTotal = 0;
// inside loop:
supplyBuyInTotal += r.costPrice * r.qty;
```
After the loop, derive:
```typescript
const supplyProfit = supplyTotal - supplyBuyInTotal;
const plantProfit  = plantSell - plantBuyIn;  // plantBuyIn/plantSell already calculated
const totalProfit  = supplyProfit + plantProfit;
```
Return `supplyBuyInTotal`, `supplyProfit`, `plantProfit`, `totalProfit` from the useMemo.

5. Add profit display to the grand total card — internal only, never in PDF:
- "Supply buy-in: £X.XX" (grey label)
- "Supply profit: £X.XX (Y%)" — green if positive, red if negative
- "Plant profit: £X.XX" — only rendered if `plantHire.length > 0`
- **"Total profit: £X.XX (Y%)"** — bold, green/red

---

**`server/engines/electricalEngine.ts` — `generateElectricalLineItems`:**

For supply rows, add `costPrice` field:
```typescript
costPrice: (row.costPrice ?? 0) > 0 ? String(Math.round((row.costPrice ?? 0) * 100) / 100) : null,
```
Plant hire already passes `costPrice` correctly from Phase 5 — no change needed.

---

### Concern B — PDF must never show cost/profit

`generateElectricalQuoteHTML` outputs sell prices and totals only:
- No margin column, no buy-in column, no profit row, no cost price anywhere in the HTML
- `costPrice` field on line items is used by `QuoteWorkspace.tsx` for the margin display — the PDF function ignores it entirely

---

### Phase 6 — PDF function spec

**New function:** `generateElectricalQuoteHTML(quoteData: FullQuoteData): Promise<string>`
Add to `server/pdfGenerator.ts` — add-only, never modify `generateSimpleQuoteHTML`.

`FullQuoteData` is already the type returned by `getFullQuoteData` and used by `generateSimpleQuoteHTML` — same shape, same import, no new DB queries needed.

**Route change in `server/routers.ts`** — add before the existing `generateSimpleQuoteHTML` call inside `quotes.generatePDF`:
```typescript
if ((quote as any).tradePreset === "electrical") {
  html = await generateElectricalQuoteHTML(fullQuoteData);
} else {
  html = await generateSimpleQuoteHTML(fullQuoteData);  // unchanged
}
```

**Template sections (sell prices only):**

1. **Cover page** — company logo, project name, "TENDER SUBMISSION", date, quote reference. Navy (`#1a2b4a`) header band, teal (`#0d9488`) accent.

2. **Project scope** — `quote.description` paragraph.

3. **Programme table** — derived from phase labour line items:
   | Phase | Scope | Hours | Weeks |
   |---|---|---|---|
   | Phase 1 — First Fix | Containment, back boxes, cabling | Xhrs | Xw |
   | Phase 2 — Second Fix | Fittings, accessories, devices | Xhrs | Xw |
   | Phase 3 — T&C | EIC, EICR, client handover | Xhrs | Xw |
   Footer note: `@ 2 operatives, 40 hrs/week`

4. **Schedule of Works** — line items grouped under section headings:
   - Electrical Installation (supply rows, not containment/cabling)
   - Containment (description ends with `— containment`)
   - Cabling (description ends with `— cabling`)
   - Labour (description starts with `Phase 1`, `Phase 2`, `Phase 3`)
   - Plant & Hire (description contains `day(s)` or `week(s)`)
   - Preliminaries (everything else with rate > 0)

   Each row: Description | Qty | Unit | Rate (£) | Total (£)
   Programme note rows (`unit === "note"`): full-width italic, no amounts columns.

5. **Pricing Summary:**
   ```
   Supply Total          £X,XXX.XX
   Labour Total          £X,XXX.00
   First Points          £X,XXX.00   (omit if £0)
   Plant & Hire          £X,XXX.00   (omit if £0)
   Preliminaries         £X,XXX.00   (omit if £0)
   Sundries              £X,XXX.00   (omit if £0)
   ─────────────────────────────────
   Subtotal              £X,XXX.00
   VAT (20%)             £X,XXX.00   (omit if quote.taxRate === 0)
   ─────────────────────────────────
   TOTAL TENDER PRICE    £X,XXX.00
   ```

6. **Assumptions & Exclusions** — bullet lists from `quote.assumptions` / `quote.exclusions`.

7. **Terms & Conditions** — `quote.terms` full text.

8. **Footer** — company name, address, contact email/phone.

---

### How to identify line item types from the `lineItems` array

All set by `generateElectricalLineItems` (Phase 5):

| Type | Identify by |
|---|---|
| Supply — line items | not containment/cabling, not phase labour, not note, not circuit, not sundries, not prelim pattern |
| Supply — containment | description ends with `— containment` |
| Supply — cabling | description ends with `— cabling` |
| Phase labour | description starts with `"Phase 1"`, `"Phase 2"`, or `"Phase 3"` |
| Programme note | `unit === "note"` |
| First Points | `unit === "circuit"` |
| Plant/Hire | description contains `" day(s)"` OR `" week(s)"` |
| Sundries | description starts with `"Sundries allowance"` |
| Preliminaries | everything else with `rate > 0` |

---

### Files to change — Phase 6

| File | Change |
|---|---|
| `client/src/components/electrical/ElectricalQDS.tsx` | Add `costPrice` + `costEdited` to `ElectricalQDSRow`; add buy-in input column; add profit lines to grand total card |
| `server/engines/electricalEngine.ts` | Pass `costPrice` on supply rows in `generateElectricalLineItems` |
| `server/pdfGenerator.ts` | Add `generateElectricalQuoteHTML` — new function, sell prices only |
| `server/routers.ts` | Add electrical branch in `quotes.generatePDF` — add only |

**Must NOT be modified:** `QuoteWorkspace.tsx`, `generateSimpleQuoteHTML`, `generalEngine.ts`, `drawingEngine.ts`, `engineRouter.ts`, any non-electrical component.

---

### Isolation checklist for Phase 6

Before delivery, verify:
- [ ] `generateSimpleQuoteHTML` body byte-for-byte unchanged
- [ ] `generatePDF` route: non-electrical quotes still hit existing path unchanged
- [ ] No `costPrice`, margin, or profit appears anywhere in the HTML/PDF output
- [ ] `ElectricalQDS.tsx` change is additive — `costPrice` defaults to `0`; existing saved QDS without `costPrice` reads as `0` via `?? 0` fallback; no data loss
- [ ] `npx tsc --noEmit --skipLibCheck` = zero new errors
