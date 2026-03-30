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

**Phase 5 — electricalEngine.ts**
Server-side AI engine. Confirmed takeoff → line items with Spon's labour. Phases and timelines from total labour hours.

**Phase 6 — Electrical PDF**
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
| `server/data/electricalLabourRates.ts` | Spon's M&E 2024 UK labour rate lookup. `matchSponsRate(description)` → `{ hoursPerUnit, unit }` or `null`. `PRODUCTIVITY_MULTIPLIERS` constant. Authoritative server copy — Phase 5 electricalEngine will import from here. |
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

## 16. Phase 5 — Next Build (electricalEngine.ts)

**File:** `server/engines/electricalEngine.ts`

**Dispatch:** Add electrical branch in `server/engines/engineRouter.ts` — detect `tradePreset === "electrical"` and call `electricalEngine` instead of `generalEngine` or `drawingEngine`.

**Input:** Confirmed QDS data from `qdsSummaryJson` (already has labour hours, supply prices, plant hire). Should NOT re-run takeoff. Reads `ElectricalQDSData` (discriminated by `_type: "electrical"`).

**Output:** Line items written via `createLineItem`. Phases and timelines derived from total labour hours:
- First fix: ~40% of total hours
- Second fix: ~40% of total hours  
- Testing & commissioning: ~20% of total hours
- Timeline in weeks: total hours ÷ (team size × 40hrs/week)

**Labour rates:** Import `matchSponsRate` and `PRODUCTIVITY_MULTIPLIERS` from `server/data/electricalLabourRates.ts`.

**Guardrail:** `engineRouter.ts` changes must not affect `generalEngine` or `drawingEngine` dispatch paths. Electrical branch must be gated strictly on `tradePreset === "electrical"`.
