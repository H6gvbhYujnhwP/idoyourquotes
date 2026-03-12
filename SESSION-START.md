# SESSION-START — IdoYourQuotes
## Read This File First. Every Session. Before Any Code.

**This is the single source of truth for every Claude session. It replaces all separate docs.
Lives at repo root. Always in the zip. Always read first.**

---

## MANDATORY PRE-CODE PROTOCOL

Before writing a single line of code, Claude must:

1. Read this file in full
2. Identify which feature area the request touches
3. Find the relevant call chain in the Flow Map below
4. Write in chat: **"Traced call chain: [every node]"** — naming every server function, client component, state variable, and DB column in the chain
5. Only then write code

> This protocol catches regressions before they happen. Skipping it means touching state that feeds other features without knowing it.

---

## Tech Stack

| Layer | Tech |
|---|---|
| Frontend | React 19, Tailwind CSS 4, shadcn/ui, Wouter routing, tRPC + TanStack Query |
| Backend | Node.js 22, Express 4, tRPC 11, Drizzle ORM |
| Database | PostgreSQL 16 on Render |
| Storage | Cloudflare R2 (org-scoped folder structure) |
| AI | OpenAI GPT-4o (primary), Anthropic Claude (secondary) |
| Payments | Stripe (full lifecycle) |
| Email | Resend |
| Auth | JWT + bcrypt, Google OAuth |

**Deployment:** GitHub Desktop → GitHub → Render auto-deploy
**Schema changes:** `npx drizzle-kit push` on Render shell after deploy
**File outputs:** `/mnt/user-data/outputs/` for all Claude-produced files

---

## Key File Locations

| File | Purpose |
|---|---|
| `server/routers.ts` | ALL tRPC mutations and queries — the main server file |
| `server/db.ts` | All DB access functions |
| `server/services/stripe.ts` | Billing logic — `TIER_CONFIG` is pricing source of truth |
| `server/services/electricalTakeoff.ts` | Symbol detection, open symbol detection, legend parse |
| `server/engines/engineRouter.ts` | `selectEngine()` — routes to correct sector engine |
| `server/engines/generalEngine.ts` | GeneralEngine — non-drawing sectors |
| `server/engines/drawingEngine.ts` | DrawingEngine — drawing-aware sectors |
| `server/engines/types.ts` | `EngineInput`, `EngineOutput`, `SectorEngine` interface |
| `server/tradePresets.ts` | Sector-specific AI prompt guidance |
| `drizzle/schema.ts` | DB schema — source of truth for all columns |
| `client/src/pages/QuoteWorkspace.tsx` | Main quote page — all state lives here |
| `client/src/components/QuoteDraftSummary.tsx` | QDS display + `mergeSummaryWithTakeoffs()` |
| `client/src/components/InputsPanel.tsx` | File upload, legend toggle, takeoff panels |
| `client/src/components/TakeoffPanel.tsx` | Electrical takeoff questions UI |
| `client/src/lib/tradeSectors.ts` | 26-sector options list |
| `client/src/lib/brandTheme.ts` | Colour constants — all UI styling references here |

---

## Shared State Map

Every piece of state read by more than one feature. Changing any of these affects every entry in its row.

| State | Lives In | Written By | Read By |
|---|---|---|---|
| `voiceSummary` | `QuoteWorkspace` useState | `triggerVoiceAnalysis` (all materials, source:"voice"), `onSave` handler (voice-only after user edit) | `QuoteDraftSummary` props, rehydration useEffect |
| `qdsSummaryJson` | `quotes` DB column | `triggerVoiceAnalysis` auto-save, `onSave` handler (manual save) | Rehydration useEffect Case 1 — page refresh restore |
| `userPrompt` | `quotes` DB column + useState | `triggerVoiceAnalysis` (text marker), `onSave` handler (structured text), `onSave` new (also via updateQuote) | `hasSavedQDS` guard (Case 2), `generateDraft` AI context |
| `takeoffList` | tRPC query cache (`electricalTakeoff.list`) | `uploadFile` auto-takeoff, `setReferenceOnly`, `answerQuestions`, `updateExcludedCodes` | `QuoteDraftSummary` mergeSummaryWithTakeoffs, `TakeoffPanel` |
| `takeoffOverrides` | `QuoteWorkspace` useState | `onSave` QDS handler | `mergeSummaryWithTakeoffs` in QuoteDraftSummary |
| `mimeType` | `quote_inputs` DB column | `setReferenceOnly` (appends/removes `;reference=true`) | `parseDictationSummary` engine filter, `generateDraft` loop, auto-takeoff skip, InputsPanel toggle display |
| `symbolMappings` | `tenderContexts` DB column (JSON) | `setReferenceOnly` ON: LLM legend parse; OFF: cleared | Auto-takeoff on upload (fetched at upload time), `answerQuestions`, `updateExcludedCodes`, `getByInputId` |
| `hasRehydratedRef` | `QuoteWorkspace` useRef | Set true by rehydration useEffect; reset false by `setReferenceOnly.onSuccess` | Rehydration useEffect guard (prevents double-fire) |
| `processedContent` | `quote_inputs` DB column | `uploadFile` auto-analyze, `transcribeAudio`, `extractPdfText`, `analyzeImage`, `setReferenceOnly` legend parse | `parseDictationSummary` engine input, `generateDraft` context loop |

---

## Flow Map — Complete Call Chains

### 1. Upload a File (PDF / image / audio / document)

```
User: drops file in InputsPanel
  → InputsPanel: onUpload prop
  → QuoteWorkspace: uploadFile.mutate (tRPC inputs.uploadFile)
  → server: inputs.uploadFile
    → uploadToR2 (Cloudflare R2, org-scoped folder)
    → db.createInput (quote_inputs row, processingStatus: "processing")
    → [PDF] extractWithPdfJs → updateInputProcessing (processedContent, status:"completed")
    → [PDF, not reference-only] performElectricalTakeoff(pdfBuf, filename, symbolMap from tenderContexts)
        → createElectricalTakeoff (electrical_takeoffs row)
        → updateInputProcessing (processedContent = formatted ELECTRICAL TAKEOFF block)
    → [audio] Whisper transcription → updateInputProcessing
    → [image] OpenAI vision → updateInputProcessing
    → [document] mammoth/xlsx extract → updateInputProcessing
    → logUsage (credits)
  → client: uploadFile.onSuccess → refetch() → fullQuote updates
  → QuoteWorkspace: wasProcessing→isProcessing useEffect detects completion
    → if !hasSavedQDS && !voiceSummary → triggerVoiceAnalysis() [500ms delay]
```

**State touched:** `quote_inputs.processedContent`, `quote_inputs.processingStatus`, `electrical_takeoffs`, `takeoffList` (via refetch), `voiceSummary` (if auto-analysis fires)

---

### 2. QDS Auto-Analysis (triggerVoiceAnalysis)

```
triggerVoiceAnalysis()
  → setIsSummaryLoading(true)
  → parseDictationSummary.mutateAsync({ quoteId })
  → server: ai.parseDictationSummary
    → getInputsByQuoteId (ALL inputs for quote)
    → selectEngine(tradePreset) → engine.analyse(engineInput)
        → engine filters inputs where mimeType includes ";reference=true"
        → builds AI prompt from processedContent of remaining inputs
        → calls OpenAI/Anthropic LLM → returns structured JSON
    → return { hasSummary, summary }
  → client: setVoiceSummary({ ...result, materials: source:"voice" })
  → auto-fill clientName, title if empty
  → build summaryToSave JSON → updateFields.qdsSummaryJson = JSON.stringify(...)
  → build autoPrompt text → updateFields.userPrompt = autoPrompt
  → updateQuote.mutateAsync({ qdsSummaryJson, userPrompt, clientName, title })
  → setIsSummaryLoading(false)
```

**State touched:** `voiceSummary`, `quotes.qds_summary_json`, `quotes.user_prompt`, `quotes.clientName`, `quotes.title`

**CRITICAL:** Never trigger this on page refresh. The rehydration useEffect guards against this. Only fire when: new input processed, legend toggle fires, user clicks Re-analyse.

---

### 3. Page Refresh / Navigate Back to Quote

```
QuoteWorkspace mounts → trpc.quotes.getFull.useQuery fires
  → fullQuote.quote.qdsSummaryJson populated from DB
  → Rehydration useEffect (hasRehydratedRef guard):
      Case 1: qdsSummaryJson exists
          → JSON.parse → setVoiceSummary (exact snapshot from last session)
          → hasRehydratedRef.current = true → RETURN — NO AI CALL
      Case 2: userPrompt exists but no qdsSummaryJson (legacy quotes pre-March 2026)
          → hasRehydratedRef.current = true → RETURN — no AI call
      Case 3: no qdsSummaryJson, no userPrompt (brand new quote)
          → if hasAnalysableInputs && !voiceSummary → triggerVoiceAnalysis()
```

**State touched:** `voiceSummary` (restored from DB snapshot, no AI cost)

---

### 4. Toggle Legend / Reference Only

```
User: flips switch on a PDF in InputsPanel
  → InputsPanel: optimisticReference local state updates immediately (visual feedback)
  → onSetReferenceOnly prop called
  → QuoteWorkspace: setReferenceOnly.mutate({ inputId, quoteId, isReference })
  → server: inputs.setReferenceOnly
      → db.updateInput (mimeType: append/remove ";reference=true")
      → if isReference ON:
          → deleteElectricalTakeoffByInputId
          → invokeLLM (extract symbol map from legend PDF text)
          → upsertTenderContext (symbolMappings = { CODE: { meaning, confirmed } })
          → updateInputProcessing (processedContent = "[LEGEND/KEY SHEET...]")
          → for each non-reference PDF with takeoff:
              → performElectricalTakeoff(pdfBuf, ref, symbolMap) [re-run all drawings]
              → updateElectricalTakeoff + updateInputProcessing
      → if isReference OFF:
          → upsertTenderContext (symbolMappings = {})
          → re-run all drawings without symbolMap
  → client: setReferenceOnly.onSuccess
      → await refetch() (mimeType correct, fullQuote updates)
      → refetchTakeoffs() (takeoffList updates)
      → hasRehydratedRef.current = false
      → triggerVoiceAnalysis() → saves new clean qdsSummaryJson to DB
```

**State touched:** `mimeType`, `symbolMappings`, `processedContent`, `takeoffList`, `voiceSummary`, `qdsSummaryJson`, `userPrompt`

⚠️ Most side-effectful action in the app. Any change to setReferenceOnly or its onSuccess MUST trace all of the above.

---

### 5. QDS Save (User clicks Save in QuoteDraftSummary)

```
User: clicks Save in QuoteDraftSummary
  → QuoteDraftSummary: handleSave → onSave(sanitized data) prop
  → QuoteWorkspace: onSave handler
      → build takeoffOverrides from takeoff/containment materials → setTakeoffOverrides
      → setVoiceSummary({ ...data, materials: voice-only }) [strips takeoff rows]
      → build userPrompt structured text → setUserPrompt
      → build qdsSave JSON (ALL materials including takeoff) → updateQuote.mutate({ qdsSummaryJson, userPrompt })
      → if clientName new → updateQuote.mutate({ clientName, title })
      → saveVoiceNoteSummary.mutate({ quoteId, summary: voice-only data })
          → onSuccess: toast "saved", refetch()
```

**State touched:** `takeoffOverrides`, `voiceSummary` (voice-only), `userPrompt` (DB+state), `qdsSummaryJson` (DB), `quotes.clientName`

**BOTH `triggerVoiceAnalysis` and `onSave` now write `qdsSummaryJson`.** Refresh always restores last saved state.

---

### 6. Generate Quote Draft (AI → Line Items)

```
User: clicks "Regenerate Draft"
  → QuoteWorkspace: generateDraft.mutate({ quoteId, userPrompt })
  → server: ai.generateDraft
      → getInputsByQuoteId → skip mimeType includes ";reference=true"
      → build processedEvidence from processedContent of remaining inputs
      → fetchCatalog → build catalogContext
      → call OpenAI (long structured prompt with USER-CONFIRMED prices)
      → deleteLineItemsByQuoteId (ALL existing line items deleted first)
      → create new line items from AI response
      → recalculateQuoteTotals (standard items only)
  → client: onSuccess → toast, setActiveTab("quote"), refetch()
```

**State touched:** `line_items` table (fully replaced), `lineItems` query cache

⚠️ All manual line item edits made after last generation are lost on regenerate.

---

### 7. Generate PDF

```
User: clicks Generate PDF
  → QuoteWorkspace: handleGeneratePDF
      → await updateQuote.mutateAsync({ all current fields }) [saves latest first]
      → generatePDF.mutate({ id: quoteId })
  → server: quotes.generatePDF
      → getFullQuoteData (quote + lineItems + org branding)
      → build PDF with PDFKit (cream/white bg, navy structure, brand accent)
      → uploadToR2 → updateQuote (pdfUrl)
  → client: opens PDF in new tab
```

---

### 8. Electrical Takeoff — Answer Questions

```
User: answers a question in TakeoffPanel
  → TakeoffPanel: handleConfirmQuestion
      → for unknown-symbol + "define": encodes as "define:Description"
      → answerQuestions.mutate({ takeoffId, questionId, answer })
  → server: electricalTakeoff.answerQuestions
      → fetch tenderContexts (symbolMappings)
      → applyUserAnswers → recalculate counts
      → updateElectricalTakeoff (userAnswers, counts, status)
      → formatTakeoffForQuoteContext(result, symbolMap) → updateInputProcessing
  → client: refetchTakeoffs() → takeoffList updates → QDS merge re-renders
```

**State touched:** `electrical_takeoffs.userAnswers/status/counts`, `quote_inputs.processedContent`, `takeoffList`

---

### 9. New Input Triggers QDS Update

```
wasProcessing/isProcessing useEffect in QuoteWorkspace:
  → watches fullQuote.inputs for processingStatus changes
  → when ANY input transitions from "processing" → "completed":
      → if !hasSavedQDS (no userPrompt in DB) && !voiceSummary
          → triggerVoiceAnalysis() [500ms delay]
      → if hasSavedQDS:
          → triggerVoiceAnalysis() regardless (new evidence should update QDS)
```

⚠️ This is the ONLY place new uploads trigger QDS re-analysis. Do not add additional triggers elsewhere.

---

### 10. Billing / Subscription

```
Stripe webhook → server: /api/stripe/webhook (raw body — before JSON parser)
  → checkout.session.completed → activateSubscription → updateOrg (tier, status, limits)
  → customer.subscription.updated → updateOrg (tier, status, cancelAtPeriodEnd)
  → customer.subscription.deleted → updateOrg (tier:"trial", status:"canceled", maxQuotes:0)
  → invoice.payment_succeeded → resetMonthlyCount → status:"active"
  → invoice.payment_failed → status:"past_due"

All AI mutations guarded by assertAIAccess(userId):
  → getUserPrimaryOrg → canUseAIFeatures(org) → throws if blocked
  → logUsage after success (credits deducted)

Quote creation guarded by canCreateQuote():
  → checks status, trial expiry, monthly count
```

---

## Sector Engine Architecture

### Engine Tiers

```
selectEngine(tradePreset) in server/engines/engineRouter.ts
    ├── 'electrical' → ElectricalEngine (Tier 3)
    ├── drawing sectors → DrawingEngine(tradePreset) (Tier 2)
    └── everything else → GeneralEngine(tradePreset) (Tier 1)
```

### All 26 Sectors

| Key | Display Name | Engine |
|---|---|---|
| `electrical` | Electrical Installation | ElectricalEngine |
| `it_services` | IT Services / MSP | GeneralEngine |
| `commercial_cleaning` | Commercial Cleaning | GeneralEngine |
| `building_maintenance` | Building Maintenance / FM | GeneralEngine |
| `pest_control` | Pest Control | GeneralEngine |
| `scaffolding` | Scaffolding / Access | GeneralEngine |
| `painting` | Painting & Decorating | GeneralEngine |
| `custom` | Other / Custom | GeneralEngine |
| `construction_steel` | Structural Steel / Engineering | DrawingEngine |
| `metalwork_bespoke` | Architectural & Bespoke Metalwork | DrawingEngine |
| `general_construction` | General Construction | DrawingEngine |
| `bathrooms_kitchens` | Bathrooms & Kitchens | DrawingEngine |
| `windows_doors` | Windows / Doors / Conservatories | DrawingEngine |
| `roofing` | Roofing & Cladding | DrawingEngine |
| `joinery` | Joinery & Carpentry | DrawingEngine |
| `fire_protection` | Fire Stopping / Passive Fire | DrawingEngine |
| `insulation_retrofit` | Air Tightness / Insulation | DrawingEngine |
| `plumbing` | Plumbing & Drainage | DrawingEngine |
| `hvac` | HVAC | DrawingEngine |
| `groundworks` | Groundworks / Civil Engineering | DrawingEngine |
| `solar_ev` | Solar PV / Battery / EV Charging | DrawingEngine |
| `telecoms_cabling` | Telecoms / Network Cabling | DrawingEngine |
| `fire_security` | Fire & Security Systems | DrawingEngine |
| `lifts_access` | Lifts / Access Systems | DrawingEngine |
| `mechanical_fabrication` | Mechanical Engineering | DrawingEngine |

### Engine Isolation Rules (Hard — Never Violate)

- Each engine may only read from `EngineInput` and write `EngineOutput`
- No engine imports from another engine file
- No engine calls DB functions directly — all DB data arrives via `EngineInput`
- `ElectricalEngine` is the ONLY file permitted to import `electricalTakeoff.ts`
- `EngineOutput` shape changes require updating `types.ts` AND all downstream consumers simultaneously
- Every engine must catch errors and return degraded `EngineOutput` — never throw unhandled

### EngineInput / EngineOutput Contract

**EngineInput** (assembled in `parseDictationSummary` before calling engine):
- `tradePreset`, `userTradeSector`, `inputRecords[]` (with mimeType for reference-only filtering), `catalogContext`
- `electricalContext?.symbolMappings` — only populated when `tradePreset === 'electrical'`

**EngineOutput** (identical shape for all engines):
- `jobDescription`, `clientName`, `clientEmail`, `clientPhone`
- `labour[]`, `materials[]` (with `pricingType`: standard/monthly/optional)
- `markup`, `labourRate`, `sundries`, `contingency`, `preliminaries`, `plantMarkup`
- `notes`, `engineUsed`, `engineVersion`

---

## Billing System

### Subscription Tiers

| Tier | Price | Quotes/Month | Users | Catalog Items |
|---|---|---|---|---|
| Trial | Free (14 days) | 10 | 1 | 50 |
| Solo | £59/month | 10 | 1 | 50 |
| Pro | £99/month | 15 | 2 | Unlimited |
| Team | £159/month | 50 | 5 | Unlimited |
| Business | £249/month | Unlimited | 10 | Unlimited |

**Source of truth:** `TIER_CONFIG` in `server/services/stripe.ts`. All price displays must match this.

### What's AI-Gated (assertAIAccess)

All AI mutations: `generateDraft`, `parseDictationSummary`, `askAboutQuote`, `generateEmail`, `transcribeAudio`, `extractPdfText`, `analyzeImage`, `uploadFile`, `electricalTakeoff.analyze`, `containmentTakeoff.analyze`

### What's Free (no gate)

`lineItems.update`, `quotes.update`, `quotes.generatePDF`, all `.get` / `.list` queries

### AI Access Logic

Blocked when: `status === 'canceled'` AND `tier === 'trial'` (expired), OR `status === 'canceled'` (period ended), OR `status === 'unpaid'`

NOT blocked during: `past_due` (grace period), `cancelAtPeriodEnd: true` while period still active

### Quota Emails

- 80% usage → "approaching limit" email (sent once per cycle via `_emailFlags`)
- 100% usage → "limit reached" email (sent once per cycle)

### Delete Account Order (never change)

Stripe hard cancel → data purge (8 tables) → R2 files → org soft-delete → user deactivate → goodbye email

---

## Subscription Status Reference

| Status | Can Create Quotes | Can Use AI | Notes |
|---|---|---|---|
| `trialing` | ✅ (up to 10) | ✅ | Trial banner shown |
| `active` | ✅ (tier limit) | ✅ | Normal UI |
| `past_due` | ❌ | ✅ (grace) | Amber banner |
| `canceled` | ❌ | ❌ | Red banner |
| `unpaid` | ❌ | ❌ | Similar to past_due |

---

## Price Hierarchy (Who Wins)

| Priority | Source |
|---|---|
| 1 (highest) | USER-CONFIRMED prices in Processing Instructions |
| 2 | User's voice/text instructions ("charge £700/day") |
| 3 | Company catalog rates |
| 4 | Org default settings (markup %, labour rate) |
| 5 (lowest) | AI estimates — set to £0, never invented |

---

## Persistence Reference

| Data | Table/Column | Written By | Read By |
|---|---|---|---|
| QDS JSON snapshot | `quotes.qds_summary_json` | `triggerVoiceAnalysis`, `onSave` handler | Rehydration useEffect Case 1 |
| Processing Instructions | `quotes.user_prompt` | `triggerVoiceAnalysis`, `onSave` handler | `generateDraft`, `hasSavedQDS` guard |
| Symbol mappings | `tenderContexts.symbol_mappings` | `setReferenceOnly` (legend parse) | auto-takeoff, `answerQuestions`, engine |
| Takeoff data | `electrical_takeoffs` | `uploadFile` auto-takeoff, `analyze` | `takeoffList` query, TakeoffPanel |
| Line items | `line_items` | `generateDraft` (replaces all) | Quote view, PDF |
| Uploaded files | Cloudflare R2 | `uploadFile` | Signed URLs on demand |

---

## Guardrails — Never Break These

### System Guardrails (G1–G11)

**G1 — AI JSON Contract:** Never change `EngineOutput` shape without updating `types.ts` AND all consumers simultaneously.

**G2 — Processing Instructions Bridge Markers:** These strings in `userPrompt` are read verbatim by `generateDraft`:
- `"USER-CONFIRMED PRICED MATERIALS (use these EXACT prices):"`
- `"Materials (need pricing from catalog or estimate):"`
- `"[install: Xhrs/unit]"` — generateDraft creates supply+install split lines
- `"[labour: £X]"` — generateDraft uses calculated labour cost
Never change these marker strings without updating the `generateDraft` prompt too.

**G3 — Install Tag Source Filtering:** Only `source === "takeoff"` or `source === "containment"` materials get `[install:]` tags. Voice items never get them — it duplicates every service line.

**G4 — Deep Clone in QDS Edit Mode:** `cloneData()` deep-clones before edit mode. When adding new array fields to `QuoteDraftData`, add them to `cloneData()`.

**G5 — Temporal Dead Zone:** `fullQuote` is destructured at ~line 1291. Any `useEffect` before that line must use `fullQuote?.inputs` not `inputs`.

**G6 — QDS Rehydration:** Never remove the `hasRehydratedRef` useEffect. Without it QDS goes blank on every reload.

**G7 — voiceSummary Sources:** `voiceSummary` is set in exactly two places: `triggerVoiceAnalysis` (all materials, source:"voice") and `onSave` (voice-only). Never set it with takeoff materials — they come via the `takeoffs` prop and merge in `mergeSummaryWithTakeoffs`.

**G8 — Line Items Deleted on Regenerate:** `generateDraft` deletes all line items before creating new ones. Manual post-generation edits are lost on re-generation. Warn users.

**G9 — Catalog Price Matching Independence:** QDS merges catalog prices client-side in `mergeSummaryWithTakeoffs`. The AI prompt also receives the catalog. These are independent — catalog format changes in the AI prompt must be tested against `matchCatalogPrice()`.

**G10 — User Data Sovereignty:** Never auto-overwrite user-edited fields without explicit user action. Every editable field must persist across page reloads and tab switches. Before adding any auto-save or auto-analysis trigger, verify it doesn't silently overwrite user edits.

**G11 — Engine Isolation:** A change to any one engine file must be physically incapable of affecting any other sector's output. See Engine Isolation Rules above.

### Billing Guardrails (B1–B11)

**B1** — Webhook handlers must be idempotent (overwrite with absolute values, never increment).
**B2** — Never assume subscription is active after Stripe checkout return — wait for webhook.
**B3** — Stripe webhook route MUST receive raw body. `express.raw()` MUST be before JSON parser.
**B4** — `STRIPE_PRICE_*` env vars must match actual Stripe Dashboard Price IDs.
**B5** — Always include `metadata: { orgId, tier }` on Stripe customers and subscriptions.
**B6** — All quote creation goes through `quotes.create`. Never add a second route without the quota check.
**B7** — `monthlyQuoteCount` increment is in `quotes.create`, not in webhooks.
**B8** — Never hard-delete user records. Deactivate only (`isActive: false`).
**B9** — Use Stripe test mode for all development. Verify `test_` prefix in secret key.
**B10** — Delete account order matters: Stripe cancel → data purge → session invalidate. Always.
**B11** — VAT rate is org-controlled once the VAT settings feature is built. Not per-quote editable.

### Multi-Tenancy Rule

Every DB query must filter by `orgId`. `getQuoteWithOrgAccess()` must be called to verify ownership before any quote mutation. Never skip this.

### Sector Agnosticism Rule

Never hardcode assumptions toward "general trades/construction" or electrical in shared code. Use `quote.tradePreset || user.defaultTradeSector` throughout. Electrical UI panels (`TakeoffPanel`, `ContainmentTakeoffPanel`) are gated behind `tradePreset === "electrical"` in `InputsPanel`.

---

## Known Bugs / Open Work

| # | Issue | Location | Priority |
|---|---|---|---|
| 1 | Auto-takeoff runs for all sectors (wasteful, not harmful) | `routers.ts` inputs.uploadFile ~line 1616 | Low |
| 2 | Legend PDFs run takeoff before reference toggle (mitigated: setReferenceOnly deletes it) | `routers.ts` inputs.uploadFile | Medium |
| 3 | Cancel subscription confirmation email not sent | `subscriptionRouter.ts` | Low |
| 4 | Resubscribe flow after full cancellation untested | `subscriptionRouter.ts` | Medium |
| 5 | Team member sessions not invalidated when owner deletes account | `db.ts` deleteAllOrgData | Medium |
| 6 | "Tax" label in QuoteWorkspace should be "VAT" (PDF already says VAT) | `QuoteWorkspace.tsx` totals section | Low |
| 7 | No org-level VAT default — users must set VAT on every quote | Needs new org fields + Settings UI | Medium |
| 8 | DrawingEngine sectors not yet using sector-specific prompt injections (Phase 5) | `drawingEngine.ts`, `engineRouter.ts` | Low |

---

## Electrical Sector Build Status

- [x] Phase 1 — Sector split (construction_steel / metalwork_bespoke)
- [x] Phase 2 — Engine infrastructure (GeneralEngine, DrawingEngine, engineRouter)
- [x] Phase 3 — Bug fixes (legend trigger guard, generateDraft reference skip, unknown symbol handling)
- [x] Phase 4 — Open symbol detection, legend parse flow, status marker detection, sector UI isolation
- [ ] Phase 5 — DrawingEngine prompt injections, GeneralEngine sector guidance

---

## VAT System (Current State + Planned)

**Current:** `taxRate` decimal on `quotes` table. User sets per-quote. `recalculateQuoteTotals` computes `subtotal × (taxRate/100)`. VAT line suppressed in PDF when `taxRate === 0`.

**Known bug:** UI label says "Tax" — PDF says "VAT (X%)". Fix: rename label to "VAT" in `QuoteWorkspace.tsx`.

**Planned feature (not yet built):** Org-level VAT setting. Two new fields on `organizations`: `defaultVatRate` (decimal, default 20.00) and `vatExempt` (boolean, default false). `quotes.create` pre-populates `taxRate` from org setting. `QuoteWorkspace` shows VAT as read-only (not editable per-quote). Settings > Tax & VAT section to configure.

---

## Session Handover Template

At the end of every session, produce a handover note with:
- What was changed and the root cause (not just symptoms)
- Files changed with paths
- Call chain nodes touched
- Verified-not-broken checklist: QDS persists on refresh, legend toggle works, no duplicate QDS items, non-electrical sectors unaffected, billing gates intact, orgId filters present
- Updated copy of this SESSION-START.md if any flows changed
- Known bugs updated

---

## Changes Log

| Date | Files Changed | What Changed |
|---|---|---|
| 12 Mar 2026 | `server/engines/generalEngine.ts` | Added `PRICING TYPE RULES` block to system prompt. Fixes recurring/monthly items (support contracts, MSP retainers) being silently ignored for all GeneralEngine sectors. AI now correctly assigns `pricingType: "monthly"` and estimates monthly costs when not stated. IT-sector specific guidance included (£150–£350/month range for ~16 managed devices). |
| 12 Mar 2026 | `server/pdfGenerator.ts` | Fixed PDF filename. Both `generateSimpleQuoteHTML` and `generateComprehensiveProposalHTML` now set `<title>` to `{clientName} - {DD Mon YYYY}` (e.g. `Ian Frith - 12 Mar 2026`). Browser uses `<title>` as default filename in save-as-PDF dialog. Previously used quote reference (`Q-XXXX`). |

---

*Single source of truth for all Claude sessions on IdoYourQuotes. Update this file whenever a flow changes, a bug is fixed, or a feature is added. Version: March 2026 — updated 12 Mar 2026.*
