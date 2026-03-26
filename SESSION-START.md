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

## MANDATORY POST-CODE PROTOCOL

After every fix or feature — no exceptions, not just at session end — Claude must:

1. Add a row to the **Changes Log** table at the bottom of this file (date, files changed, what changed and why)
2. Update the **Known Bugs** table if a bug was fixed or a new one discovered
3. Update any **Flow Map** or **Shared State Map** entries if the fix changed a flow
4. Deliver the updated `SESSION-START.md` alongside the changed code file(s)

> Wez uploads SESSION-START.md to GitHub with every push. It is the guardrail that prevents future sessions from breaking existing flows. A fix delivered without an updated SESSION-START.md is an incomplete fix.

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
| `userPrompt` | `quotes` DB column + useState | **No longer written by UI** — Takeoff Instructions field removed | `hasSavedQDS` guard (Case 2, legacy rehydration only) — do not write from new code |
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
  → updateQuote.mutateAsync({ qdsSummaryJson, clientName, title })
  → setIsSummaryLoading(false)
```

**State touched:** `voiceSummary`, `quotes.qds_summary_json`, `quotes.clientName`, `quotes.title`

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
      → build qdsSave JSON (ALL materials including takeoff) → updateQuote.mutate({ qdsSummaryJson })
      → if clientName new → updateQuote.mutate({ clientName, title })
      → saveVoiceNoteSummary.mutate({ quoteId, summary: voice-only data })
          → onSuccess: toast "saved", refetch()
```

**State touched:** `takeoffOverrides`, `voiceSummary` (voice-only), `qdsSummaryJson` (DB), `quotes.clientName`

**BOTH `triggerVoiceAnalysis` and `onSave` write `qdsSummaryJson`.** Refresh always restores last saved state. No text serialisation — generateDraft reads qdsSummaryJson directly.

---

### 6. Generate Quote Draft (AI → Line Items)

```
User: clicks "Regenerate Draft"
  → QuoteWorkspace: generateDraft.mutate({ quoteId })
  → server: ai.generateDraft
      → getQuoteWithOrgAccess → quote (includes qdsSummaryJson)
      → getInputsByQuoteId → skip mimeType includes ";reference=true"
      → build processedEvidence from processedContent of remaining inputs (PDFs, voice notes, text)
      → parse qdsSummaryJson → build qdsLineItems directly (materials, labour, plantHire)
        — NO AI reinterpretation of QDS items
      → call GPT-4o with evidence ONLY for: description, title, clientName/address, assumptions, exclusions, terms, riskNotes
      → deleteLineItemsByQuoteId (ALL existing line items deleted first)
      → if simple quote + qdsLineItems exist → insert qdsLineItems directly as line items
      → if comprehensive OR no QDS → insert AI-generated line items
      → recalculateQuoteTotals (standard items only)
  → client: onSuccess → toast, setActiveTab("quote"), refetch()
```

**State touched:** `line_items` table (fully replaced), `lineItems` query cache

⚠️ All manual line item edits made after last generation are lost on regenerate.
⚠️ QDS must be saved (qdsSummaryJson non-null) before generating draft for direct line item passthrough.

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
      → if !hasSavedQDS (no qdsSummaryJson in DB) && !voiceSummary
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
  → customer.subscription.updated → updateOrg (tier, status, cancelAtPeriodEnd, quota reset if upgrading)
  → customer.subscription.deleted → updateOrg (tier:"trial", status:"canceled", maxQuotes:0)
  → invoice.payment_succeeded → resetMonthlyCount → status:"active"
  → invoice.payment_failed → status:"past_due"

Upgrade flow (existing subscriber, higher tier):
  → Pricing.tsx: handleSelectTier detects isUpgrade && hasActiveSubscription → upgrade modal
  → handleConfirmUpgrade → upgradeSubscription.mutate
  → server: subscription.upgradeSubscription → changeSubscriptionTier() upgrade path
      → subscriptions.update (new price, proration_behavior:none)
      → invoices.create (auto_advance:false, automatic_tax:true, pending_invoice_items_behavior:exclude)
      → invoiceItems.create (invoice:invoice.id — attached directly, never dangling)
      → finalizeInvoice → pay (catches invoice_already_paid — Stripe auto-collect)
      → updateOrganization immediately (tier, limits, monthlyQuoteCount:0)
  → customer.subscription.updated webhook fires — idempotent, confirms DB state

Downgrade flow (existing subscriber, lower tier):
  → Pricing.tsx: handleSelectTier detects isDowngrade && hasActiveSubscription → downgrade modal
  → handleConfirmDowngrade → downgradeSubscription.mutate
  → server: subscription.downgradeSubscription → changeSubscriptionTier() downgrade path
      → subscriptions.update (new price, proration_behavior:none, metadata includes downgradeEffectiveAt=current_period_end)
      → no invoice, no charge today
  → customer.subscription.updated webhook fires IMMEDIATELY (Stripe fires on any sub mutation)
      → isPendingDowngrade=true (now < downgradeEffectiveAt) → limits columns SKIPPED
      → subscriptionTier updated to new tier, limits left at old tier values
  → customer.subscription.updated webhook fires AGAIN at renewal
      → isPendingDowngrade=false (period has ended) → limits applied normally
      → shouldClearDowngradeFlag=true → downgradeEffectiveAt cleared from Stripe metadata

New subscriber flow:
  → Pricing.tsx: handleSelectTier (no active sub, status !== past_due) → createCheckout → Stripe Checkout redirect
  → checkout.session.completed webhook → activateSubscription → updateOrg

Past-due subscriber flow:
  → Pricing.tsx: handleSelectTier detects status === 'past_due' → toast error + createPortal.mutate()
  → Stripe Billing Portal opens for payment method recovery
  → (prevents double-subscription: routing past-due through createCheckout would create a second active sub)

All AI mutations guarded by assertAIAccess(userId):
  → getUserPrimaryOrg → canUseAIFeatures(org) → throws if blocked
  → logUsage after success (credits deducted)

Quote creation guarded by canCreateQuote():
  → checks status, trial expiry, monthly count

NOTE: quotes.user_prompt DB column still exists and is read by the legacy rehydration
guard (hasSavedQDS Case 2 — old quotes that predate qdsSummaryJson). The Takeoff
Instructions UI field has been removed. userPrompt is no longer written by any UI
interaction. Do not repurpose this column without updating the rehydration guard.
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
| 1 (highest) | QDS confirmed items — read directly from qdsSummaryJson, never reinterpreted |
| 2 | User's voice/text inputs and Paste Email/Text evidence |
| 3 | Company catalog rates |
| 4 | Org default settings (markup %, labour rate) |
| 5 (lowest) | AI estimates — realistic UK market rates, never £0 |

---

## Persistence Reference

| Data | Table/Column | Written By | Read By |
|---|---|---|---|
| QDS JSON snapshot | `quotes.qds_summary_json` | `triggerVoiceAnalysis`, `onSave` handler | Rehydration useEffect Case 1 |
| Takeoff Instructions (electrical) | `quotes.user_prompt` | **UI field removed 20 Mar 2026** — column preserved for legacy rehydration guard only | `hasSavedQDS` Case 2 guard (legacy quotes pre-qdsSummaryJson) |
| Symbol mappings | `tenderContexts.symbol_mappings` | `setReferenceOnly` (legend parse) | auto-takeoff, `answerQuestions`, engine |
| Takeoff data | `electrical_takeoffs` | `uploadFile` auto-takeoff, `analyze` | `takeoffList` query, TakeoffPanel |
| Line items | `line_items` | `generateDraft` (replaces all) | Quote view, PDF |
| Uploaded files | Cloudflare R2 | `uploadFile` | Signed URLs on demand |

---

## Guardrails — Never Break These

### System Guardrails (G1–G11)

**G1 — AI JSON Contract:** Never change `EngineOutput` shape without updating `types.ts` AND all consumers simultaneously.

**G2 — QDS Direct Passthrough:** `generateDraft` reads `qdsSummaryJson` directly from the DB and converts it to line items without AI reinterpretation. For simple quotes:
- Every material in `qdsSummaryJson.materials` → one line item (exact name, qty, unitPrice, unit, pricingType, description)
- Every labour item in `qdsSummaryJson.labour` → one line item (role, qty, labourRate)
- Every plant/hire item in `qdsSummaryJson.plantHire` → one line item
- GPT-4o only writes: `description`, `title`, `clientName/address/email/phone`, `assumptions`, `exclusions`, `terms`, `riskNotes`
- Comprehensive quotes still use AI-generated line items (full proposal mode needs AI structuring)
- `userPrompt` DB column is preserved for legacy rehydration (Case 2) only — the Takeoff Instructions UI field has been removed. No new code should write to this column.

**G3 — Install Time Source Filtering:** Only `source === "takeoff"` or `source === "containment"` materials have `installTimeHrs` applied in QDS. Voice items never get install time — it would duplicate every service line into supply+install. This is enforced in QDS `mergeSummaryWithTakeoffs` and should not be changed.

**G4 — Deep Clone in QDS Edit Mode:** `cloneData()` deep-clones before edit mode. When adding new array fields to `QuoteDraftData`, add them to `cloneData()`.

**G5 — Temporal Dead Zone:** `fullQuote` is destructured at ~line 1291. Any `useEffect` before that line must use `fullQuote?.inputs` not `inputs`.

**G6 — QDS Rehydration:** Never remove the `hasRehydratedRef` useEffect. Without it QDS goes blank on every reload.

**G7 — voiceSummary Sources:** `voiceSummary` is set in exactly two places: `triggerVoiceAnalysis` (all materials, source:"voice") and `onSave` (voice-only). Never set it with takeoff materials — they come via the `takeoffs` prop and merge in `mergeSummaryWithTakeoffs`.

**G8 — Line Items Deleted on Regenerate:** `generateDraft` deletes all line items before creating new ones. Manual post-generation edits are lost on re-generation. Warn users.

**G9 — Catalog Price Matching Independence:** QDS merges catalog prices client-side in `mergeSummaryWithTakeoffs`. The AI prompt also receives the catalog. These are independent — catalog format changes in the AI prompt must be tested against `matchCatalogPrice()`.

**G10 — User Data Sovereignty:** Never auto-overwrite user-edited fields without explicit user action. Every editable field must persist across page reloads and tab switches. Before adding any auto-save or auto-analysis trigger, verify it doesn't silently overwrite user edits.

**G11 — Engine Isolation:** A change to any one engine file must be physically incapable of affecting any other sector's output. See Engine Isolation Rules above.

### Billing Guardrails (B1–B13)

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
**B12** — Existing subscriber upgrades use `upgradeSubscription` mutation → `changeSubscriptionTier()` → full price charged immediately, billing anchor unchanged. Never route existing subscribers through `createCheckout`. New subscribers only use `createCheckout`.
**B13** — Upgrade invoice flow: (1) subscription update `proration_behavior:'none'`, (2) `invoiceItems.create` for full tier price (ex-VAT pence), (3) `invoices.create` with `automatic_tax: { enabled: true }` + `finalizeInvoice` + `pay`. All three steps must succeed. The `customer.subscription.updated` webhook handles DB tier/limits/quota reset.
**B14** — All tier prices in `TIER_CONFIG.monthlyPrice` and `TIER_PRICES` are ex-VAT. VAT (20%) is always added by Stripe via `automatic_tax`. Never charge ex-VAT amounts as if they are the final total. UI must always show ex-VAT, VAT line, and VAT-inclusive total separately.

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
| 11 | ~~Deleting a PDF input left orphaned containment + electrical takeoff records in DB — old results returned on reload~~ FIXED 17 Mar 2026: inputs.delete now calls deleteElectricalTakeoffByInputId + deleteContainmentTakeoffByInputId before deleteInput | Fixed | — |
| 3 | Cancel subscription confirmation email not sent | `subscriptionRouter.ts` | Low |
| 4 | Resubscribe flow after full cancellation — **verified working** 17 Mar 2026. After `customer.subscription.deleted` webhook, DB sets `stripeSubscriptionId: null` but keeps `stripeCustomerId`. `hasActiveSubscription` evaluates to `false` → user is correctly routed to `createCheckout`. `createCheckoutSession` reuses existing `stripeCustomerId` — no duplicate Stripe customer created. New subscription written to DB on `checkout.session.completed`. | — | No fix needed |
| 5 | Team member sessions not invalidated when owner deletes account | `db.ts` deleteAllOrgData | Medium |
| 6 | ~~"Tax" label + VAT not saving/recalculating~~ — FIXED: label renamed to "VAT", added `onBlur` to trigger `handleSaveQuote` → `recalculateQuoteTotals` | Fixed 13 Mar 2026 | — |
| 7 | ~~No org-level VAT default~~ — FIXED: quotes.create now reads defaultVatRate from org.defaultDayWorkRates | Fixed 13 Mar 2026 | — |
| 8 | DrawingEngine sectors not yet using sector-specific prompt injections (Phase 5) | `drawingEngine.ts`, `engineRouter.ts` | Low |
| 9 | ~~Wez (westley@sweetbyte.co.uk) had a £99 dangling pending Stripe invoice item (`ii_1TBt7iPMGUpLvQsyNcsMHTUX`) from failed upgrade attempt on 17 Mar.~~ **RESOLVED** — item deleted from Stripe dashboard 17 Mar 2026. Next renewal 1 Apr is clean (£99 only). | — | Resolved |
| 10 | `monthlyQuoteCount` not reset for Wez after manual admin tier fix (still shows 10/15). Run `UPDATE organizations SET monthly_quote_count = 0 WHERE id = 7;` on Render shell, or wait for 1 Apr renewal to auto-reset. | Render DB shell | Low |

---

## Containment Takeoff Roadmap

### Current State (17 Mar 2026)
- Auto-detection on upload works for most containment drawings
- Text annotation parsing works — finds "NEW 100 LV TRAY @12500" etc.
- Tray type filtering now correct (no silent LV assumption — user decides)
- Stick length now user-confirmable (default 3m, editable)
- Manual "Run Containment Takeoff" button when auto-detection misses
- Line items flow through to QDS and quote correctly for confirmed scope

### Known Issues / Roadmap

| # | Issue | Location | Priority |
|---|---|---|---|
| C1 | ~~**Measurement accuracy** — lengths calculated from annotation label spacing, not actual line geometry.~~ **FIXED 17 Mar 2026** — `extractPdfLineColours` now emits per-segment geometry (x1,y1,x2,y2,lengthPdfUnits). `measureTrayRunsFromVectors` sums segment lengths by colour proximity to annotations. Fallback to annotation spacing when no vector data. | `electricalTakeoff.ts`, `containmentTakeoff.ts` | **Done** |
| C2 | ~~**Fittings estimated from annotation direction changes**~~ **FIXED 19 Mar 2026** — new `detectFittingsFromGeometry()` function clusters segment endpoints within 0.5m real-world proximity. 2-endpoint clusters → bends (dot product check); 3-endpoint → T-piece (attributed to run with most endpoints, tie-break: larger size); 4+ → cross-piece (largest run). Only fires when `anyRunUsedVectorMeasurement=true`. Falls back to annotation direction estimate when vector data unavailable. | Fixed | — |
| C3 | **Scope evidence not connected to tray filter** — email says "fire alarm excluded" but FA tray still appears in takeoff questions with no hint. Should scan evidence context and pre-suggest filter options (not silently apply — ask user). Pattern: `diagnoseEvidence` already exists for QDS. | New function in `containmentTakeoff.ts`, called from `containmentTakeoff.analyze` | Medium |
| C4 | **Auto-detection can miss** — `isContainmentDrawing()` uses keyword scoring; unusual drawings score below threshold. Manual trigger button now exists as fallback. Long term: lower the threshold or use filename + drawing title pattern matching. | `server/services/containmentTakeoff.ts` `isContainmentDrawing()` | Low |
| C5 | **Fittings for mixed-size crossings** — when 100mm LV crosses 150mm LV, the correct fitting size is ambiguous. Mitch said he allows for the larger size. Should ask: "Cross-pieces where trays meet — use larger size?" | `server/services/containmentTakeoff.ts` questions array | Low |
| C6 | **No progress indicator during manual takeoff run** — `analyzeMut.isPending` shows "Analysing…" text but no spinner in the button. Minor UX polish. | `client/src/components/ContainmentTakeoffPanel.tsx` | Low |

### Build Order
1. **C1** — Vector measurement (highest value, unlocks C2)
2. **C2** — Fitting detection from geometry (depends on C1)
3. **C3** — Evidence-to-scope connection (standalone)
4. **C4, C5, C6** — Polish items, do together in one session

- [x] Phase 1 — Sector split (construction_steel / metalwork_bespoke)
- [x] Phase 2 — Engine infrastructure (GeneralEngine, DrawingEngine, engineRouter)
- [x] Phase 3 — Bug fixes (legend trigger guard, generateDraft reference skip, unknown symbol handling)
- [x] Phase 4 — Open symbol detection, legend parse flow, status marker detection, sector UI isolation
- [ ] Phase 5 — DrawingEngine prompt injections, GeneralEngine sector guidance

---

## VAT System (Current State + Planned)

**Current:** `taxRate` decimal on `quotes` table. `recalculateQuoteTotals` computes `subtotal × (taxRate/100)`. VAT line suppressed in PDF when `taxRate === 0`.

**Quote creation:** `quotes.create` now pre-populates `taxRate` from `org.defaultDayWorkRates.defaultVatRate`. Priority: explicit input value → org default → undefined. Existing quotes are not retroactively updated.

**Storage:** `defaultVatRate` lives inside the `defaultDayWorkRates` JSON blob on the `organizations` table — not a separate column.

**Known bug:** UI label says "Tax" — PDF says "VAT (X%)". ~~Fix: rename label to "VAT" in `QuoteWorkspace.tsx`.~~ **FIXED 13 Mar 2026** — label renamed to "VAT" and `onBlur` added to trigger save + recalculate.

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


---

## Rollback Guide — 18 Mar 2026 Session

If anything breaks after the 18 Mar 2026 session deploys, here is what changed and how to revert each piece.

### What was changed and why

| File | Change | Revert if... |
|---|---|---|
| `client/src/components/InputsPanel.tsx` | Removed `tradePreset === "electrical"` gate from TakeoffPanel and ContainmentTakeoffPanel render conditions. This was the root cause of "View Marked Drawing" disappearing — simple quotes never store `tradePreset` in DB so the gate always evaluated false. | TakeoffPanel starts appearing for non-electrical sectors (cleaning, IT etc) and that's unwanted. To revert: add `&& tradePreset === "electrical"` back to both conditions — but also add `|| !tradePreset` so simple electrical quotes still work. |
| `client/src/pages/QuoteWorkspace.tsx` | Added `|| (user as any)?.defaultTradeSector` fallback to the `tradePreset` prop passed to InputsPanel, and to the Takeoff Instructions gate. Belt-and-braces alongside the InputsPanel gate removal. | Causes unexpected side effects. To revert: change back to `(quote as any).tradePreset \|\| ''`. |
| `client/src/components/TakeoffPanel.tsx` | `Image` → `ImageIcon` in lucide import and JSX. | Icons break. Revert to `Image` — but verify lucide version first. |
| `client/src/components/ContainmentTakeoffPanel.tsx` | `Image` → `ImageIcon`. Added "↺ Re-run Takeoff" button (force:true). Removed unused `hasRawSegments` variable. | Re-run button causes issues. Remove the button block. |
| `client/src/components/ContainmentDrawingViewer.tsx` | New file — interactive PDF viewer for containment drawings. | Crashes on render. Delete the file and remove import from ContainmentTakeoffPanel. |
| `server/routers.ts` | Added `force: z.boolean().optional()` + delete-before-insert to `containmentTakeoff.analyze`. Removed `updateSegmentAssignments` and `resetSegmentAssignments` mutations. Removed `rawSegmentsJson`/`segmentAssignmentsJson` writes from 3 call sites. Removed `getMetresPerPdfUnit`/`recalculateLengthsFromAssignments` from import. | Any of these cause build errors or runtime failures. The mutations removal is safe — nothing calls them. The column writes removal is safe — those columns aren't in drizzle/schema.ts. |
| `server/services/containmentTakeoff.ts` | Two early returns got `rawSegments: [], segmentAssignments: {}`. Vector segments now populate `trayRuns[].segments` from `segmentAssignments` (not synthetic annotation waypoints). | "View Drawing" button stops appearing. Revert the segment population change in `performContainmentTakeoff` Step 7. |

### Files deleted
- `client/src/components/ContainmentMeasurementReview.tsx` — was replaced by `ContainmentDrawingViewer.tsx`. Can be recovered from git history if needed.

### Outstanding action (Mitch)
After deploy: click **↺ Re-run Takeoff** on the containment drawing (65005-P02) to regenerate segment geometry. Existing DB record has empty segments — the "View Drawing" button on the containment panel will not appear until re-run.

### DB note
`rawSegmentsJson` and `segmentAssignmentsJson` columns were added to `containment_takeoffs` via raw SQL (not via drizzle-kit push — they are in `shared/schema.ts` not `drizzle/schema.ts`). These columns still exist in the DB but are no longer written to. They can be dropped via: `ALTER TABLE containment_takeoffs DROP COLUMN raw_segments_json, DROP COLUMN segment_assignments_json;` — but there is no urgency.


## Changes Log

| Date | Files Changed | What Changed |
|---|---|---|
| 12 Mar 2026 | `server/engines/generalEngine.ts` | Added `PRICING TYPE RULES` block to system prompt. Fixes recurring/monthly items (support contracts, MSP retainers) being silently ignored for all GeneralEngine sectors. AI now correctly assigns `pricingType: "monthly"` and estimates monthly costs when not stated. IT-sector specific guidance included (£150–£350/month range for ~16 managed devices). |
| 12 Mar 2026 | `server/pdfGenerator.ts` | Fixed PDF filename. Both `generateSimpleQuoteHTML` and `generateComprehensiveProposalHTML` now set `<title>` to `{clientName} - {DD Mon YYYY}` (e.g. `Ian Frith - 12 Mar 2026`). Browser uses `<title>` as default filename in save-as-PDF dialog. Previously used quote reference (`Q-XXXX`). |
| 12 Mar 2026 | `server/db.ts` | `recalculateQuoteTotals` now also writes `monthlyTotal` and `annualTotal` to the `quotes` table. Previously these DB columns were always `0.00` even when monthly/annual line items existed. |
| 12 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | QDS subtotal tfoot now shows separate rows for One-off Total, Recurring Monthly (teal), Recurring Annual (amber), and Optional Items (purple). Previously all pricingTypes were summed into one misleading subtotal. Added `monthlySubtotal`, `annualSubtotal`, `optionalSubtotal` useMemos alongside existing `materialSubtotal`. |
| 12 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | Quote view totals section now shows Recurring monthly / Recurring annual / Optional items rows below the main Total, computed live from `lineItems` filtered by `pricingType`. Only rendered when values > 0. Labelled "Not included in total above". |
| 12 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | Added Re-analyse button to QDS header (alongside Edit). Calls `onTriggerVoiceAnalysis` directly — no new props. Visible only when not editing, disabled + spinner while `isLoading`. Fixes UX gap where file-only quotes had no way to trigger fresh analysis without the text input box. |
| 12 Mar 2026 | `server/engines/generalEngine.ts` | Fixed labour type collapse. Rewrote MATERIALS vs LABOUR section: (1) Added LABOUR LINE ITEMS — CRITICAL block listing 9 distinct labour delivery modes (onsite, remote, workshop, discovery, training, PM, commissioning, site survey, out-of-hours) — each must be its own materials line item. (2) Added ANTI-DUPLICATION RULE clarifying deduplication applies to the same engagement mentioned twice, NOT to different engagements with the same role. (3) Updated labour[] field guideline to require delivery mode in role name (e.g. "Network Engineer — Onsite" not "Network Engineer") to prevent AI collapsing different modes into one entry. No schema changes. |
| 12 Mar 2026 | `server/engines/generalEngine.ts` | Switched GeneralEngine from GPT-4o (invokeLLM) to Claude Sonnet (invokeClaude) for more reliable structured JSON output, consistent re-analysis, and richer descriptions. maxTokens set to 8192 (was 1500, ignored by invokeLLM anyway). Added stop_reason: max_tokens guard. Added markdown fence stripping on response. Fixed description guideline — now instructs Claude to write scope-specific 1-sentence descriptions from evidence rather than deferring to catalog. Added 5-point self-check instruction: Claude must verify all labour types, monthly items, equipment, descriptions, and pricingTypes before outputting JSON. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | Part A of description flow fix. onSave handler now appends `[desc: ...]` tag to every material line in userPrompt when a description is present. Both priced and unpriced material serialisation updated. No other state touched. |
| 13 Mar 2026 | `server/routers.ts` | Part B of description flow fix. generateDraft DRAFT SUMMARY MATERIALS prompt block updated: added DESCRIPTION RULE to use `[desc:]` tag verbatim; added explicit instruction for monthly/annual items to expand description into bullet-point format with "• " prefix covering all service deliverables. Standard items without [desc:] tag retain existing brief-note behaviour. |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | Part C of description flow fix. Materials description guideline rewritten to apply different rules by pricingType: standard items get 1-sentence scope-specific description; monthly/annual items get structured bullet-point breakdown (minimum 4 bullets) covering all contract deliverables per sector. Sector-specific examples provided for IT/MSP, cleaning, maintenance/FM, pest control. |
| 13 Mar 2026 | `server/pdfGenerator.ts` | Added formatLineItemDescription() helper. Splits on "•" character, renders summary sentence then each bullet as indented block element. Both line item table render points updated (main table + monthly/annual table). Previously descriptions with bullets rendered as one long run-on paragraph. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | Added formatLineItemDesc() React helper. Splits on "•" character, renders summary + indented bullet spans. Applied to editable line items table row and catalog search result description display. |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | Changed monthly/annual description separator from "•" to "||" (pipe-pipe). GPT-4o JSON mode strips "•" characters from JSON string values; "||" is plain ASCII and survives. Updated prompt to instruct Claude to use "||" between each element, no newlines or bullet chars. |
| 13 Mar 2026 | `server/routers.ts` | Updated generateDraft DESCRIPTION RULE: copy [desc:] tag verbatim including "||" separators — do not convert. For monthly/annual items without [desc:] tag, use "||" separator format. |
| 13 Mar 2026 | `server/pdfGenerator.ts` | Updated formatLineItemDescription() to split on "||" instead of "•". |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | Updated formatLineItemDesc() to split on "||" instead of "•". |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | Extended "||" separator to standard items — Claude uses judgement: single sentence for simple hardware items, "||" breakdown when item covers multiple deliverables/steps. Monthly/annual always use "||" with minimum 4 features. No newlines or "•" anywhere in descriptions. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | onSave [desc:] tag now normalises • bullets to || before writing to userPrompt (regex replace). Handles legacy QDS snapshots generated before the || format was introduced. Both priced and unpriced material paths updated. |
| 13 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | QDS description display now renders || and • separated descriptions as bullet points. IIFE pattern handles both legacy (•) and new (||) format. Plain text descriptions unaffected. |
| 13 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | Added detectDescFormat, normaliseDescToFormat, renderDescNode as exported helpers. Description edit field changed from <input> to <textarea> with Plain/•Bullets/1.Numbered toolbar using lucide icons. Toolbar converts existing text to chosen format on click. Display render uses renderDescNode (handles ||, ##, •, plain). React import added. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | Replaced local formatLineItemDesc with imported renderDescNode from QuoteDraftSummary. All 3 render sites updated. onSave normalisation updated: preserves ##, converts • to ||, auto-detects 1.2.3. numbered lists → ## for both priced and unpriced material paths. |
| 13 Mar 2026 | `server/routers.ts` | generateDraft DESCRIPTION RULE updated: preserve both || and ## verbatim. Added ## instruction for sequential/phased items. Updated lineItems schema IMPORTANT block to cover all 3 formats (plain/||/##). |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | Description rules extended with ## numbered separator for sequential items. Four distinct cases now: simple (plain sentence), multi-deliverable (||), sequential/ordered (##), monthly/annual (always ||). |
| 13 Mar 2026 | `server/pdfGenerator.ts` | formatLineItemDescription updated to handle ##: numbered list rendered as 1. 2. 3. with indented spans. || path unchanged. Plain text fallback unchanged. |

---

| 13 Mar 2026 | `server/routers.ts`, `client/src/pages/QuoteWorkspace.tsx` | **Major refactor: QDS Direct Passthrough.** generateDraft now reads qdsSummaryJson directly from DB and converts confirmed QDS items to line items without AI reinterpretation. GPT-4o only writes description, title, client details, assumptions, exclusions, terms, riskNotes. Removed: userPrompt from generateDraft zod schema, priceHierarchyContext/DRAFT SUMMARY MATERIALS prompt blocks, parts serialisation from onSave, autoPrompt building from triggerVoiceAnalysis, userPrompt from handleGenerateDraft mutate call, userPrompt from handleSaveQuote. hasSavedQDS check #1 changed from !!userPrompt to !!qdsSummaryJson. Processing Instructions textarea renamed to "Takeoff Instructions" and hidden for non-electrical sectors. userPrompt DB column now only used for electrical symbol filtering in TakeoffPanel. |

| 13 Mar 2026 | `server/routers.ts` | **VAT default fix.** `quotes.create` now reads `org.defaultDayWorkRates.defaultVatRate` and passes it as `taxRate` when creating a new quote. Previously every new quote started at 0% VAT regardless of org settings. Existing quotes unaffected. |
| 13 Mar 2026 | `server/routers.ts` | **Email greeting first name only.** `generateEmail` now extracts the first word of the contact name for the greeting. "John Smith" → "Hi John,". Previously used full name. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | **Button labels.** "Generate Draft" → "Generate Quote". "Regenerate Draft" → "Regenerate Quote". |

| 17 Mar 2026 | `server/services/stripe.ts` | **Upgrade invoice item ordering bug — root cause fix.** Previous code created the invoice item before the invoice existed, leaving a £99 dangling pending item on the customer account. When `invoices.create` was called next, the invoice was empty (£0), Stripe auto-paid it immediately, and `.pay()` threw `invoice_already_paid` on a zero-value invoice. The £99 item was left as a pending item that would have rolled into the next renewal, causing a double charge. Fix: (1) Create the invoice first (`auto_advance: false`, `automatic_tax: enabled`, `pending_invoice_items_behavior: 'exclude'`). (2) Create the invoice item with `invoice: invoice.id` to attach it directly — never left as a pending item. (3) Catch `invoice_already_paid` from `.pay()` and treat as success (Stripe sometimes auto-collects on finalise). (4) Update DB immediately after confirmed payment (`subscriptionTier`, `maxUsers`, `maxQuotesPerMonth`, `maxCatalogItems`, `monthlyQuoteCount: 0`, `quoteCountResetAt`) — no longer relies solely on webhook for DB update. `pending_invoice_items_behavior: 'exclude'` prevents any pre-existing dangling items from being swept into the upgrade invoice on retry. Applies to all upgrade paths: Solo→Pro, Solo→Team, Solo→Business, Pro→Team, Pro→Business, Team→Business. |
| 17 Mar 2026 | `server/services/subscriptionRouter.ts` | **`downgradeSubscription` mutation added.** New mutation handles Pro→Solo, Team→Pro, Team→Solo, Business→any downgrades. Validates it is a genuine downgrade (rank check). Calls `changeSubscriptionTier()` downgrade path (already correct — `proration_behavior: none`, takes effect at renewal). Sends tier change email async. Returns `{ success, newTierName, effectiveDate }`. Previously all lower-tier button clicks for existing subscribers fell through to `createCheckout`, which would have created a second Stripe subscription — a double-charge bug. |
| 17 Mar 2026 | `client/src/pages/Pricing.tsx` | **Downgrade flow built end-to-end.** `handleSelectTier` now has three branches: upgrade (existing sub, higher tier) → upgrade modal; downgrade (existing sub, lower tier) → new downgrade modal; new sub → Stripe Checkout. Added `downgradeTier` state, `downgradeSubscription` mutation, `handleConfirmDowngrade` handler. New amber downgrade modal: shows no charge today, exact effective date from `subStatus.data.currentPeriodEnd`, new tier limits at renewal, cancel = "Keep Current Plan". Button labels on tier cards now context-aware: Solo card shows "Downgrade to Solo" when user is on Pro/Team/Business; Pro card shows "Downgrade to Pro" when on Team/Business; Team card shows "Downgrade to Team" when on Business. |
| 17 Mar 2026 | `server/services/adminRouter.ts`, `client/src/pages/AdminPanel.tsx` | **Admin panel tier override.** New `setSubscriptionTier` admin mutation sets `subscriptionTier`, `maxUsers`, `maxQuotesPerMonth`, `maxCatalogItems` in one call — used to fix DB/Stripe sync issues without shell access. Reads tier limits from `TIER_CONFIG`. New "Set Subscription Tier" dropdown in Admin Actions section of OrgDetail view, styled consistently with existing controls. Fixes the gap where a failed upgrade left Stripe on Pro but DB on Solo with no admin UI remedy. |

| 17 Mar 2026 | `client/src/components/ContainmentTakeoffPanel.tsx`, `client/src/pages/QuoteWorkspace.tsx`, `client/src/components/TakeoffPanel.tsx`, `server/routers.ts`, `server/services/containmentTakeoff.ts` | **No silent trayFilter assumption + manual takeoff trigger.** (1) `trayFilter` default changed from `"LV"` to `"all"` everywhere — in all 3 `defaultUserInputs` blocks in `routers.ts`, in `ContainmentTakeoffPanel.tsx` defaults, in `QuoteWorkspace.tsx` and `TakeoffPanel.tsx` fallbacks. The tray filter question in `containmentTakeoff.ts` now shows "All types" as the first option with `defaultValue: "all"` — the context no longer suggests LV. (2) `ContainmentTakeoffPanel.tsx` — replaced `return null` when no takeoff record exists with a "Run Containment Takeoff" button that calls `containmentTakeoff.analyze`. Auto-detection can miss on some drawings — this gives the user an explicit manual trigger as a fallback. Zero cross-sector impact. | — user-confirmable per job.** Previously hardcoded as `WHOLESALER_LENGTH_METRES = 3` throughout. All `/ 3` divisions and `× 3m` labels now use `userInputs.wholesalerLengthMetres` (default 3, min 0.5, max 12). Changes: (1) `containmentTakeoff.ts` — `wholesalerLengthMetres` added to `UserInputs` interface; `performContainmentTakeoff` accepts it as optional param (default 3); wholesalerLengths on each TrayRun uses it; new question "What length are your tray sticks?" added to questions array with 3m/6m/1.5m options and default 3m pre-selected; `calculateCableSummary` reads `userInputs.wholesalerLengthMetres`; `formatContainmentForQuoteContext` shows confirmed stick length in output. (2) `routers.ts` — all three `defaultUserInputs` blocks include `wholesalerLengthMetres: 3`; `updateUserInputs` Zod schema adds `wholesalerLengthMetres: z.number().min(0.5).max(12).default(3)`; `updateTrayRuns` now reads `storedUserInputs.wholesalerLengthMetres` instead of hardcoded `/ 3`. (3) `ContainmentTakeoffPanel.tsx` — edit form adds stick length dropdown (3m/6m/1.5m); read-only display shows confirmed value; `updateRun` inline recalculation uses `userInputs.wholesalerLengthMetres`; table `×3m` column header is now dynamic. No schema changes. Zero cross-sector impact. | — root cause fix.** ELV, FA, and SUB tray types were appearing in line items and QDS for lighting-only quotes. Root cause: three separate places all iterated raw `trayRuns` without applying `userInputs.trayFilter`. (1) `QuoteWorkspace.tsx` containment map (~line 2140) — now reads `ct.userInputs.trayFilter`, filters `trayRuns`, rebuilds `fittingSummary` from filtered runs only (the DB-stored `fittingSummary` is keyed by size only, mixing LV+ELV fittings). (2) `TakeoffPanel.tsx` three containment loops (containmentCounts, containmentDescriptions, containmentColours) for the drawing viewer modal — now apply same filter. (3) `containmentTakeoff.ts` `formatContainmentForQuoteContext` — also fixed (belt-and-braces for the server-side processed content path). For `trayFilter:'LV'` (the default), only LV runs and their fittings appear. `trayFilter:'all'` passes everything through unchanged. Zero cross-sector impact — all changes are inside electrical-only components. | `formatContainmentForQuoteContext` was passing all tray runs (LV + ELV + FA + SUB) to the processed content that feeds `generateDraft`, completely ignoring `userInputs.trayFilter`. The filter only applied inside `calculateCableSummary`. Fix: apply `trayFilter` at the top of `formatContainmentForQuoteContext` to produce `filteredRuns`. Also rebuild `fittingSummary` from `filteredRuns` (the passed-in summary is pre-keyed by size only with no type separation, so ELV/FA fittings were mixed into LV counts). Result: for a lighting-only quote with `trayFilter:'LV'`, only LV tray runs and their fittings flow through to line items. ELV, FA, SUB tray excluded entirely from scope. Zero cross-sector impact — function is only called from the containment takeoff pipeline. | — bug fix.** `downgradeSubscription` mutation was calling `changeSubscriptionTier` (Stripe only) then returning, with no DB update. The DB was left showing the old tier (e.g. Pro) until the `customer.subscription.updated` webhook fired — which may not fire reliably. Fix: added `updateOrganization(org.id, { subscriptionTier: input.newTier })` immediately after `changeSubscriptionTier` succeeds. Only `subscriptionTier` is updated — NOT `maxUsers`/`maxQuotesPerMonth`/`maxCatalogItems` (user has paid for current period, keeps current limits until renewal). The `customer.subscription.updated` webhook at renewal continues to update the limit columns as before. Idempotent: if the webhook also fires immediately, it overwrites with the same tier value. | All four billing files verified correct. Key findings: (1) `Pricing.tsx` Solo button label is correct — `currentRank > 1` correctly shows "Downgrade to Solo" for Pro/Team/Business users. (2) Downgrade flow is correctly wired end-to-end: click Solo → amber modal → `downgradeSubscription.mutate` → `changeSubscriptionTier` downgrade path → Stripe `subscriptions.update` with new price, effective at renewal, no charge. (3) Upgrade flow is correctly wired: click Pro → teal modal → `upgradeSubscription.mutate` → `changeSubscriptionTier` upgrade path → invoice create → item create (attached) → finalize → pay → DB update immediately. (4) Webhook `customer.subscription.updated` correctly handles both upgrade (resets quota) and downgrade at renewal (updates limits, no quota reset — that's done by `invoice.payment_succeeded`). (5) Resubscribe after cancellation works correctly — `stripeCustomerId` preserved, `stripeSubscriptionId` nulled, new checkout reuses existing customer. (6) Bug #9 (£99 dangling item) confirmed deleted. (7) If previous test showed Stripe Checkout on downgrade, most likely cause was the deploy hadn't propagated yet, or the test user had `status !== 'active'` causing `hasActiveSubscription = false`. No code changes needed. |

| 17 Mar 2026 | `server/services/electricalTakeoff.ts`, `server/services/containmentTakeoff.ts` | **C1: Vector measurement accuracy.** `extractPdfLineColours` return type extended from `{x, y, colour}` to `ColouredSegment` which adds `{x1, y1, x2, y2, lengthPdfUnits}` — one record per consecutive point pair in each stroked path (both `constructPath` and `stroke`/`closeStroke` paths). Backward compat: `x/y` midpoint fields preserved. `containmentTakeoff.ts`: new `measureTrayRunsFromVectors(trayAnnotationGroups, vectorSegments, metresPerUnit)` function — groups segments by colour, for each annotation group finds dominant colour via proximity, sums `lengthPdfUnits × metresPerUnit`, handles shared colours by nearest-annotation proximity split, deduplication is implicit (each segment contributes to exactly one group). `performContainmentTakeoff` Step 7 rewritten: when `colouredLines` contains geometry-rich segments, calls `measureTrayRunsFromVectors` first; falls back to annotation-spacing estimate when no geometry data. `drawingNotes` now includes measurement method used. Zero impact on any other sector, billing, QDS, or line items. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | **VAT input fix + label rename (bug #6 resolved).** VAT input had `onChange` but no `onBlur` — user could type a rate but it was never saved and `recalculateQuoteTotals` was never triggered. Added `onBlur={() => handleSaveQuote()}`. Flow: VAT input blur → `handleSaveQuote()` → `quotes.update` with `taxRate` → server detects `data.taxRate !== undefined` → `recalculateQuoteTotals` rewrites `taxAmount` + `total` to DB → TanStack Query invalidates → totals re-render. Also renamed label "Tax" → "VAT". |
| 13 Mar 2026 | `server/routers.ts` | **VAT default not persisting from Settings (root cause fix).** `defaultVatRate` was being sent by the Settings page client inside `defaultDayWorkRates` but was silently stripped by the Zod schema on the `profile.update` mutation — the field was not declared. Added `defaultVatRate: z.number().optional()` to the `defaultDayWorkRates` Zod object. Flow: Settings save → `defaultDayWorkRates.defaultVatRate` now passes Zod → written to `organizations.defaultDayWorkRates` JSON blob → `quotes.create` reads `org.defaultDayWorkRates.defaultVatRate` → new quotes inherit org VAT rate automatically. |
| 13 Mar 2026 | `server/routers.ts` | **VAT default not applying on existing quotes / regenerate (root cause fix 2).** Two bugs: (1) `generateDraft` called `recalculateQuoteTotals` without first checking if the quote's `taxRate` was still 0 from before the VAT feature existed. Fix: before `recalculateQuoteTotals`, fetch quote + org — if `taxRate === 0` and `org.defaultDayWorkRates.defaultVatRate > 0`, call `updateQuote` to set it first. (2) Settings `profile.update` was doing a full replace of `defaultDayWorkRates`, wiping `_emailFlags`. Fix: merge with spread — `{ ...existingRates, ...defaultDayWorkRates }`. Both in `server/routers.ts`. |
| 13 Mar 2026 | `client/src/pages/Catalog.tsx` | **Ex VAT labelling in Catalog.** Column headers renamed: "Sell (£)" → "Sell ex VAT (£)", "Buy-in (£)" → "Buy-in ex VAT (£)". Add-item form labels updated: "Sell Price" → "Sell Price (ex VAT)", "Buy-in Price" → "Buy-in Price (ex VAT)". No logic changes — labels only. |
| 13 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | **Ex VAT labelling in QDS subtotal footer.** All four subtotal rows now include "(ex VAT)" in their labels: "One-off Total (ex VAT)", "Recurring Monthly (ex VAT)", "Recurring Annual (ex VAT)", "Optional Items (ex VAT)". Also tightened the partial-pricing suffix: "(priced items)" → "— priced items only". No logic changes — labels only. |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | **Explicit ex-VAT instruction added to AI pricing prompt.** Added: "ALL prices must be EXCLUSIVE of VAT (ex VAT). Never include VAT in any unitPrice. VAT is calculated separately by the system after quote generation." Prevents AI from ever returning VAT-inclusive prices. |
| 13 Mar 2026 | `server/routers.ts` | **Terms & Conditions guardrail — Option C.** Previously `generateDraft` always overwrote `quotes.terms` with AI-generated terms, ignoring the user's "Default Terms & Conditions" from Settings. Root causes: (1) `defaultTerms` was absent from the `orgDefaults` object; (2) `draft.terms` was written unconditionally in both the shared and `isComprehensive` write-back paths. Fix: added `defaultTerms: org.defaultTerms || ctx.user.defaultTerms` to `orgDefaults`. Applied Option C guardrail: `resolvedTerms = orgDefaults.defaultTerms OR draft.terms` — org T&Cs always win, AI fallback only for users with no T&Cs set. Removed redundant second `draft.terms` write in comprehensive path. Also added `defaultTerms` to `companyDefaultsContext` so AI receives the instruction to reproduce verbatim (belt-and-braces). Updated both AI prompt `terms` field descriptions to reflect this. Flows not touched: `quotes.create` (still uses `input?.terms || ctx.user.defaultTerms`), PDF render, QuoteWorkspace terms textarea. |
| 13 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | **Ex VAT teal pill in QDS edit row.** Added a single teal pill ("ex VAT") between the BUY-IN £ input and the line total span in the edit row for each material. Pill style matches brand teal (#0d9488 / #f0fdfa / #99f6e4 border). One pill covers both SELL £ and BUY-IN £ fields. No logic changes — cosmetic only. |
| 13 Mar 2026 | `client/src/components/QuoteDraftSummary.tsx` | **"Sell Price ex VAT" column header in QDS summary view.** Added teal "ex VAT" suffix to the Sell Price column header in the non-edit table view. Styled as smaller, lighter weight, teal text inline with the header. No logic changes. |
| 13 Mar 2026 | `server/engines/generalEngine.ts` | **Labour duplication fix.** AI was putting labour roles in both materials[] (as priced line items e.g. "IT Labour Workshop") AND labour[] (as blue pill summary e.g. "Network Engineer — Workshop") simultaneously. Root cause: the anti-duplication rule was too weak. Fix: (1) Strengthened inline rule — "CRITICAL: if the labour role already exists as a materials line item, do NOT also add it to labour[]". (2) Strengthened labour[] field description — "Check every labour entry against the materials list before including it". (3) Added check #6 to the AI self-check list: "Does labour[] contain ONLY roles that are NOT already priced as materials line items?" Self-check now requires 6 passes before outputting JSON. |
| 13 Mar 2026 | `server/routers.ts` | **Item title missing from generated quote line items (all sectors).** QDS stores both `item` (title e.g. "8-port Gigabit PoE Switch") and `description` (scope e.g. "Edge switches for co-working...") separately. `generateDraft` QDS direct passthrough was using `m.description || m.item` — so when a description existed, the item title was silently dropped from the generated line item. Fix: always build `description = "{item} — {description}"` when description is present, or just `item` when not. Works correctly with || and ## formatted descriptions — title prepends the whole string, formatLineItemDescription() splits on separators after the title. Applies to all sectors, all pricingTypes. |
| 13 Mar 2026 | `server/pdfGenerator.ts` | **Removed # column from PDF line items table.** `renderLineItemsTable()` had a `#` header column and `idx + 1` sequential number cell on every row. Both removed. Description column gains the freed width. Timeline phases table (construction sector) unaffected. Applies to all sectors. |
| 13 Mar 2026 | `server/routers.ts` | **Buy-in cost / margin not flowing from QDS to generated quote line items.** QDS correctly stores `costPrice` in `qdsSummaryJson` and the DB schema supports it on line items, but the `generateDraft` QDS→lineItems conversion block never read `m.costPrice` — it was silently dropped on every `qdsLineItems.push()`. Fix: parse `m.costPrice` and pass it as `costPrice: String(costPrice)` into the push. All sectors. |
| 13 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | **Margin not showing on generated quote line items.** QuoteWorkspace was calculating margin exclusively via live catalog fuzzy-match on description strings — completely ignoring `item.costPrice` stored on the line item record. This meant buy-in costs entered in the QDS were written to the DB correctly but never read back. Fixed both the per-row margin cell and the total margin summary footer: now reads `item.costPrice` first, falls back to catalog match only if null. QDS margin system untouched. |
| 14 Mar 2026 | `server/routers.ts` | **costPrice still not reaching line items — missing from createLineItem call.** Previous fix correctly read `m.costPrice` into `qdsLineItems` array, but the `createLineItem()` call inside the `generateDraft` write loop explicitly listed each field and omitted `costPrice`. Added `costPrice: (item as any).costPrice ?? null` to the call. This is the final link in the chain: QDS JSON → qdsLineItems array → createLineItem → DB → QuoteWorkspace reads it back. Only one createLineItem call is in generateDraft (line 4021); the other (line 1309) is the manual UI add and correctly has no costPrice. |
| 14 Mar 2026 | `server/routers.ts`, `client/src/pages/QuoteWorkspace.tsx`, `client/src/components/QuoteDraftSummary.tsx` | **Evidence diagnosis & clarification flow.** New two-stage QDS analysis: Stage 1 `diagnoseEvidence` mutation (fast Claude call, ~400 tokens) reads evidence and returns `{ canQuote, understood, sector, clientName, clarificationQuestion }`. If `canQuote:true` → `parseDictationSummary` runs exactly as before (zero regression on happy path). If `canQuote:false` → clarification UI renders in QDS panel showing what the AI understood + one focused question. User replies via `ClarificationInput` textarea → `addClarificationInput` mutation writes synthetic text evidence record to DB → `triggerVoiceAnalysis(skipDiagnosis=true)` re-runs bypassing diagnosis → `parseDictationSummary` runs with enriched evidence. `diagnoseEvidence` always fails-open (any error or parse failure → `canQuote:true`). Legacy `tradeRelevanceCheck` kept as no-op alias. New state: `clarificationState` in `QuoteWorkspace`. New mutations: `diagnoseEvidence`, `addClarificationInput`. `GeneralEngine`, `generateDraft`, PDF, billing — all untouched. |
| 14 Mar 2026 | `server/services/stripe.ts` | **Upgrade billing architecture rewrite.** `changeSubscriptionTier()` rewritten: upgrade path now uses `proration_behavior: none` (no Stripe proration credits/debits), creates a one-off invoice item for the full new tier price, creates + finalises + pays the invoice immediately against the saved payment method. Billing anchor unchanged — remainder of current period on new tier is free. Return type changed from `void` to `{ chargedAmountPence, nextBillingDate }`. Downgrade path unchanged (still `proration_behavior: none`, takes effect at renewal). |
| 14 Mar 2026 | `server/services/subscriptionRouter.ts` | **`upgradeSubscription` mutation added.** Replaces the previous broken path where existing subscribers were routed through `createCheckout` (full price, no proration, Stripe redirect). New mutation: owner/admin guard, validates it is an upgrade, calls `changeSubscriptionTier()`, fires `sendTierChangeEmail` async, returns `{ success, chargedAmountPence, nextBillingDate, newTierName, newMaxQuotesPerMonth }` to client. Also added `changeSubscriptionTier`, `isTierUpgrade`, `getTierRank` to stripe imports. |
| 14 Mar 2026 | `client/src/pages/Pricing.tsx` | **Pricing page upgrade flow fixed end-to-end.** Removed `prorationQuery` (no longer needed). Added `hasActiveSubscription` derived bool. `handleSelectTier` now branches: existing active subscriber → modal; new subscriber → `createCheckout` direct. `handleConfirmUpgrade` now calls `upgradeSubscription.mutate` (not `createCheckout`). Modal fully rewritten: shows exact price charged, free days explanation, quota reset, current usage context, VAT notice. Button label is “Confirm Upgrade — £X”. Cancel disabled during processing. `formatPence` helper removed (unused). |

| 14 Mar 2026 | `server/services/stripe.ts` | **VAT fix on upgrade invoice.** `invoices.create` in `changeSubscriptionTier()` upgrade path now includes `automatic_tax: { enabled: true }` — matching the checkout session behaviour. Without this, Stripe was not adding VAT to the one-off upgrade invoice. Comment updated to clarify `chargedAmountPence` is always ex-VAT; Stripe adds VAT. |
| 14 Mar 2026 | `client/src/pages/Pricing.tsx` | **VAT breakdown in upgrade confirmation modal.** Modal now shows: plan price (ex VAT), VAT at 20%, and Total charged today (inc VAT) in a billing summary table. Footnote updated to show VAT-inclusive amount. Confirm button label now shows VAT-inclusive total e.g. “Confirm Upgrade — £118.80 inc VAT”. Billing guardrail B14 added to SESSION-START. |

| 16 Mar 2026 | `server/r2Storage.ts`, `server/_core/index.ts`, `server/_core/voiceTranscription.ts`, `server/routers.ts`, `server/pdfGenerator.ts` | **R2 URL expiry — permanent fix via server-side file proxy.** Cloudflare R2 caps signed URLs at 7 days maximum — the attempted 10-year expiry was rejected by R2 at runtime. Root cause was storing signed URLs in the DB at all. Full fix: (1) `r2Storage.ts` — removed `longLived` param and `SIGNED_URL_LOGO_EXPIRY`. `uploadToR2` now returns a permanent proxy URL (`/api/file/{key}`) instead of a signed URL. Added `getProxyUrl(key)` helper. (2) `_core/index.ts` — new `/api/file/*` Express route, authenticated via session cookie (`sdk.authenticateRequest`), streams file buffer from R2 via `getFileBuffer`. Registered after body parsers, before tRPC (Stripe webhook order preserved). (3) `voiceTranscription.ts` — added `transcribeAudioFromBuffer(buffer, mimeType)` export that skips the URL-fetch step (for when audio is retrieved directly from R2). (4) `routers.ts` — `uploadLogo` drops `longLived: true` arg; manual `transcribeAudio` retrigger now uses `getFileBuffer(fileKey)` + `transcribeAudioFromBuffer` (proxy URL unreachable by Whisper); image analysis now uses `getFileBuffer(fileKey)` + base64 inline (proxy URL unreachable by OpenAI Vision); `generatePDF` uses `await generateQuoteHTML(...)`. (5) `pdfGenerator.ts` — `generateQuoteHTML` is now async; added `resolvePdfLogoUrl()` helper that, at PDF generation time only, extracts the R2 key from `/api/file/` and generates a fresh 1-hour signed URL for the `<img src>` in the print dialog (print dialog has no auth cookie). Signed URL is never stored — only used in the HTML string for that request. **Impact on existing data:** Users with logos uploaded before this deploy will see their logo immediately (proxy URL resolves their stored `/api/file/` URL directly). Logos uploaded before the previous 10-year attempt (i.e. still stored as expired 7-day signed URLs) must be re-uploaded once. All new uploads are permanently fixed. |
| 17 Mar 2026 | `server/services/electricalTakeoff.ts` | **Fill colour fallback for vector extraction.** Added `fR/fG/fB` fill colour tracking variables. Added fill colour setters: `setFillRGBColor`, `setFillGray`, `setFillColorN`, `setFillColor`, `setFillCMYKColor`. Added `resolveColour()` helper: tries stroke first, falls back to fill if stroke is black/absent, returns null if neither passes brightness+saturation check. All segment emission sites (`constructPath`, `stroke`/`fill`/`eoFill`/`fillStroke`/`eoFillStroke`) now call `resolveColour()` instead of hardcoding stroke only. Fixes drawings where AutoCAD draws tray lines as filled shapes (fill carries layer colour, stroke stays black). Zero impact on any other file. |
| 17 Mar 2026 | `server/routers.ts` | **Orphaned takeoff records on input delete.** `inputs.delete` handler now calls `deleteElectricalTakeoffByInputId` and `deleteContainmentTakeoffByInputId` before `deleteInput`. Previously deleting a PDF left orphaned takeoff records in DB — old results were returned on reload as if the drawing was still present. |
| 17 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | **QDS auto-reanalyse on input delete.** `deleteInput.onSuccess` now awaits refetch, calls `refetchTakeoffs()`, resets `hasRehydratedRef`, and fires `triggerVoiceAnalysis()`. Previously deleting a file left the QDS stale until manual Re-analyse. |
| 17 Mar 2026 | `server/services/adminRouter.ts`, `client/src/pages/AdminPanel.tsx` | **Admin: Reset Monthly Count button.** New `resetMonthlyCount` mutation sets `monthlyQuoteCount: 0` and `quoteCountResetAt: new Date()` for an org. New amber "Reset to 0" button in the Admin Actions panel showing current count. Fixes the gap where users hitting their monthly limit required a Render shell command to unblock. |
| 17 Mar 2026 | `server/services/electricalTakeoff.ts` | **Rectangle geometry fix + dedup.** (1) `rectangle` sub-op inside `constructPath` now expands (x,y,w,h) into 4 corner points + close — previously pushed no points so rectangle paths emitted zero segments. AutoCAD draws tray lines as thin filled rectangles; this was the root cause of 0 coloured segments on drawing 65005. (2) Closed paths that look like rectangles (first/last point coincide) now emit only the longest segment — prevents opposite sides of the same rectangle being counted twice (double-length bug). Non-rectangle polylines unchanged. Only `electricalTakeoff.ts` changed. |
| 17 Mar 2026 | `server/services/electricalTakeoff.ts` | **Interleaved constructPath encoding fix — root cause of 0 coloured segments.** Diagnostic revealed pdfjs returns `constructPath` with `subOps=[]` (empty) and all data in `subArgs` as interleaved `[opcode, x, y, opcode, x, y, ...]` stream (0=moveTo, 1=lineTo, 2=curveTo, 6=closePath). Previous code only handled the separate-arrays encoding. Added `else` branch: when `subOps.length === 0`, parse `subArgs` as interleaved stream. Both encodings now handled. Removed temporary diagnostic logging. Only `electricalTakeoff.ts` changed. |
| 17 Mar 2026 | `server/services/electricalTakeoff.ts`, `server/scripts/extractColours.py` (NEW), `server/services/containmentTakeoff.ts` | **C1 — Python pdfminer.six vector extraction replacing pdfjs (electrical sector containment only).** Root cause of 0 coloured segments: AutoCAD PDFs encode layer colours in `setGState` graphics state dictionaries; pdfjs resolves these internally for rendering but does NOT re-emit the resolved RGB values into the operator stream, so all colour tracking variables stayed at (0,0,0) black on every AutoCAD drawing. Fix: `extractPdfLineColours()` in `electricalTakeoff.ts` replaced with a Python subprocess call to new `server/scripts/extractColours.py`, which uses `pdfminer.six` — a content stream analyser that exposes `stroking_color`/`non_stroking_color` already resolved from the graphics state. The Python script: writes PDF buffer to a UUID temp file, runs `python3 extractColours.py <path>`, parses JSON stdout `[{x1,y1,x2,y2,lengthPdfUnits,colour,x,y}]`, applies y-flip (pdfminer bottom-left → pdfjs top-left origin), cleans up temp file in `finally`. `ColouredSegment[]` return type unchanged. Also fixed a second bug in `containmentTakeoff.ts`: the `rawLines.map()` was stripping `x1/y1/x2/y2/lengthPdfUnits` from every segment, causing `measureTrayRunsFromVectors` to be silently skipped even when segments were present. Map now preserves all geometry fields. No changes to `routers.ts`, symbol takeoff, QDS, any other sector, billing, or PDF generator. Requires `pip install pdfminer.six --break-system-packages` on Render. Script path: `server/scripts/extractColours.py`. |
| 17 Mar 2026 | `shared/schema.ts`, `server/services/containmentTakeoff.ts`, `server/routers.ts` | **Phase 1 — Measurement reviewer segment storage.** Added two nullable JSON columns to `containmentTakeoffs` table: `rawSegmentsJson` (all geometry-bearing segments from Python extraction, typed as `Array<{x,y,colour,x1,y1,x2,y2,lengthPdfUnits}>`) and `segmentAssignmentsJson` (AI auto-pass assignments typed as `Record<segmentIndex, groupKey \| "excluded">`). `measureTrayRunsFromVectors()` return type changed from `Map<string,number>` to `{ lengths: Map<string,number>; assignments: Record<number,string> }` — assigns every geometry segment an index-keyed group key or "excluded" for use in the reviewer. `ContainmentTakeoffResult` interface extended with `rawSegments` and `segmentAssignments` fields. Final return of `performContainmentTakeoff` populates both from `colouredLines`. All 3 `createContainmentTakeoff` call sites in `routers.ts` updated to write both new columns (null when no segments). `drizzle-kit push` required. Symbol takeoff, QDS, billing, other sectors — zero contact. Requires `npx drizzle-kit push` on Render shell. |
| 18 Mar 2026 | `server/services/containmentTakeoff.ts`, `server/routers.ts`, `client/src/components/ContainmentMeasurementReview.tsx` (NEW), `client/src/components/ContainmentTakeoffPanel.tsx` | **Phase 2 — Interactive Measurement Reviewer.** `getMetresPerPdfUnit` exported from `containmentTakeoff.ts`. New `recalculateLengthsFromAssignments()` exported — pure arithmetic, sums `lengthPdfUnits` per group key, converts to metres. Two new mutations on `containmentTakeoff` router: `updateSegmentAssignments` (saves user-edited assignments, recalculates tray run lengths and wholesaler counts, marks status=verified) and `resetSegmentAssignments` (re-runs full takeoff from stored R2 PDF, reverts to AI auto-pass). New `ContainmentMeasurementReview.tsx` — full-screen dark-theme interactive SVG viewer: pan/zoom, click-to-select individual segments, drag box-select, floating assignment bar, group legend sidebar with live metre totals, show/hide excluded, save/reset. `ContainmentTakeoffPanel.tsx` — "Review Measurements" button (teal outline, Ruler icon) shown when `rawSegmentsJson` is populated; opens reviewer as full-screen overlay; `onSaved` triggers panel refetch. Symbol takeoff, QDS, billing, other sectors — zero contact. No schema changes — columns already added in Phase 1. No `drizzle-kit push` required. |
| 18 Mar 2026 | `server/services/containmentTakeoff.ts` | **Phase 2 bug fix — ContainmentTakeoffPanel silent crash.** `performContainmentTakeoff` has two early return paths (extraction-failed catch block, no-text-layer guard) that returned objects missing `rawSegments` and `segmentAssignments` fields added to `ContainmentTakeoffResult` in Phase 1. This caused a TypeScript type error in the return type of `performContainmentTakeoff`, which broke `AppRouter` type inference in `routers.ts`, propagating to the tRPC client — making `trpc.containmentTakeoff.updateSegmentAssignments` and `trpc.containmentTakeoff.resetSegmentAssignments` unresolvable at runtime. When `ContainmentMeasurementReview.tsx` called `.useMutation()` on undefined it threw, crashing `ContainmentTakeoffPanel` at module-load time. Since `ContainmentTakeoffPanel` is imported at module level by `InputsPanel` → `QuoteWorkspace`, the entire inputs section rendered nothing and `getByInputId` never fired. Fix: added `rawSegments: [], segmentAssignments: {}` to both early returns. All three return paths now satisfy `ContainmentTakeoffResult`. Zero impact on symbol takeoff, QDS, billing, other sectors. |
| 18 Mar 2026 | `server/services/containmentTakeoff.ts` | **Containment Drawing Viewer — segment population fix.** "View Drawing" button in `ContainmentTakeoffPanel` was never appearing because it gates on `trayRuns.some(r => r.segments?.length > 0)`. The vector measurement path in `performContainmentTakeoff` was building `run.segments` from annotation label positions (waypoints between text labels on the drawing), not from the 1,978 actual Python vector segments. If a tray type had only 1 annotation label, `annotations.length - 1 = 0` → zero segments → button hidden. Fix: when vector measurement path runs (`usedVectorMeasurement = true`), iterate `segmentAssignments` (built by `measureTrayRunsFromVectors`) to find all `colouredLines` assigned to this group key, and push their real `{x1,y1,x2,y2,lengthMetres}` geometry into `run.segments`. Fallback: if no segments found from assignments (edge case), still use annotation waypoints so overlay shows something. Result: `ContainmentDrawingViewer` now receives real line geometry matching the actual PDF drawing. Mitch must re-run the takeoff (Re-analyse or re-upload) on existing drawings to regenerate segments with this fix. `ContainmentDrawingViewer.tsx` already exists and is complete — no changes needed. `ContainmentTakeoffPanel.tsx` already imports and uses it — no changes needed. Zero contact with symbol takeoff, QDS, billing, other sectors. |
| 18 Mar 2026 | `server/routers.ts`, `client/src/components/ContainmentTakeoffPanel.tsx` | **Containment Re-run Takeoff — force param + button.** Two bugs fixed: (1) `containmentTakeoff.analyze` had no `force` param — once a record existed, calling analyze again (without force) returned the old stale record; with force=true, the server now deletes the existing record via `deleteContainmentTakeoffByInputId` before re-running, ensuring the fresh result is the only row and `getByInputId` (which has no ORDER BY) returns it reliably. (2) `ContainmentTakeoffPanel` had no way for a user to re-run extraction on an existing takeoff — "Run Containment Takeoff" only showed when no record existed. Added "↺ Re-run Takeoff" button in the header (hidden when verified) that calls `analyzeMut.mutate({ inputId, quoteId, force: true })`. After re-run, `trayRuns[].segments` are populated from real Python vector geometry (per the containmentTakeoff.ts fix earlier today), so "View Drawing" button becomes visible. Action required: Mitch must click "↺ Re-run Takeoff" on his existing containment drawing (65005) after this deploy — existing DB records have stale/empty segments. Zero contact with symbol takeoff, QDS, billing, other sectors. |
| 18 Mar 2026 | `client/src/components/TakeoffPanel.tsx`, `client/src/components/ContainmentTakeoffPanel.tsx` | **Root cause fix — "View Marked Drawing" missing.** Both files imported `Image` from `lucide-react`. In lucide-react v0.453.0, `Image` does not exist — it was renamed to `ImageIcon` around v0.400. `ImageIcon` is already used correctly in `Settings.tsx`. When `Image` resolves to `undefined` at module load, React throws when the component tries to render `<Image className="..." />`. This crashed `ContainmentTakeoffPanel` at module load time, which cascaded to crash `InputsPanel` (which imports `ContainmentTakeoffPanel`), which prevented `TakeoffPanel` from ever mounting either — so the "View Marked Drawing" button never appeared despite `svgOverlay` being correctly populated in the DB. Fix: replaced `Image` → `ImageIcon` in both the import statement and JSX usage in both files. Zero other changes. No server changes. |
| 18 Mar 2026 | `client/src/components/InputsPanel.tsx` | **InputsPanel scroll fix — "View Marked Drawing" permanently below fold.** The desktop split view outer container had `maxHeight: "calc(100vh - 320px)"` but no fixed `height`. CSS `overflow-y-auto` only activates when content exceeds the element's *fixed* height — `maxHeight` alone does not trigger scrolling. Result: the panel grew with content, overflowed the page, and the browser had no scroll target (the page layout prevented page-level scroll too). The dark `#1e293b` TakeoffPanel strip containing "View Marked Drawing" — which is the first element after the file header — was sitting just below the fold with no way to reach it. Fix: added `height: "calc(100vh - 320px)"` alongside the existing `maxHeight`. Now the container is a fixed-height flex box, `flex-1 overflow-y-auto` on the right panel activates correctly, and TakeoffPanel content (including "View Marked Drawing") is always visible at the top of the scrollable area without needing to scroll. Zero impact on QDS, billing, other sectors. |
| 18 Mar 2026 | `client/src/pages/QuoteWorkspace.tsx` | **Root cause fix — TakeoffPanel never rendered for simple quotes.** `tradePreset` on the `quotes` table is only written for comprehensive quotes (Dashboard.tsx explicitly passes `tradePreset: undefined` for simple/standard quotes). Mitch's quote 113 is a simple quote so `quote.tradePreset` is `null` in the DB. `QuoteWorkspace` was passing `tradePreset={(quote as any).tradePreset || ''}` to `InputsPanel`, which evaluated to `''`. `InputsPanel` gates `TakeoffPanel` and `ContainmentTakeoffPanel` behind `tradePreset === "electrical"` — `'' === "electrical"` is false, so neither panel ever rendered. The entire white content area appeared empty. Fix: changed prop to `(quote as any).tradePreset || (user as any)?.defaultTradeSector || ''` — falls back to the user's `defaultTradeSector` (set at registration, always "electrical" for Mitch). `user` is already available from `useAuth()` at line 135. Applied same fallback to the Takeoff Instructions gate at line 1975. No DB changes, no schema changes, no other files changed. |
| 18 Mar 2026 | `client/src/components/InputsPanel.tsx` | **FINAL FIX — TakeoffPanel gate removed, matches old working code.** Removed `tradePreset === "electrical"` condition from both TakeoffPanel and ContainmentTakeoffPanel render blocks. This is an exact revert to the old behavior that always worked. The gate was added in a previous session to prevent electrical panels showing for non-electrical sectors, but broke all simple quotes because simple quotes never store tradePreset in the DB (Dashboard passes tradePreset:undefined on simple quote create). TakeoffPanel and ContainmentTakeoffPanel both self-manage: each fetches its own data via tRPC and renders nothing meaningful when no takeoff record exists (ContainmentTakeoffPanel shows the "Run Containment Takeoff" button; TakeoffPanel shows "Run Symbol Takeoff"). For non-electrical sectors this is a minor cosmetic addition but causes no harm. For electrical quotes (both simple and Tender Pack) both panels now render correctly. |
| 18 Mar 2026 | `server/routers.ts`, `client/src/components/ContainmentTakeoffPanel.tsx` | **Dead code cleanup — Phase 2 segment reviewer orphans removed.** Removed: (1) `updateSegmentAssignments` and `resetSegmentAssignments` mutations from `routers.ts` — these served `ContainmentMeasurementReview.tsx` which was replaced by `ContainmentDrawingViewer.tsx`. (2) `getMetresPerPdfUnit` and `recalculateLengthsFromAssignments` removed from `routers.ts` import (still exist and are used internally in `containmentTakeoff.ts` service). (3) All `rawSegmentsJson`/`segmentAssignmentsJson` write lines removed from the 3 `createContainmentTakeoff` call sites in `routers.ts` — these columns are not in `drizzle/schema.ts` so Drizzle silently ignored them anyway. (4) `hasRawSegments` dead variable removed from `ContainmentTakeoffPanel.tsx` — it was defined but never used (the "View Drawing" button correctly gates on `trayRuns.some(r => r.segments?.length > 0)` not on `rawSegmentsJson`). (5) `ContainmentMeasurementReview.tsx` deleted from `client/src/components/` — fully replaced by `ContainmentDrawingViewer.tsx`. The internal `rawSegments`/`segmentAssignments` logic and `getMetresPerPdfUnit` in `containmentTakeoff.ts` are preserved — they populate `trayRuns[].segments` which is what `ContainmentDrawingViewer` uses. Zero functional changes. Zero impact on any working feature. |
| 19 Mar 2026 | `server/services/containmentTakeoff.ts` | **C2 — Geometry-based fitting detection.** New `detectFittingsFromGeometry(trayRuns, metresPerUnit)` function replaces annotation-direction-change heuristic for bends and removes the always-zero T-piece/cross-piece counts. Algorithm: collects all segment endpoints (start + end) with outward unit direction vectors; clusters endpoints within 0.5m real-world proximity threshold (converted to PDF units via `metresPerUnit`); classifies each junction — 2 endpoints same run with dot product > -0.5 = 90° bend (dot ≈ -1 = straight through, no fitting), 3 endpoints = T-piece (attributed to run with most endpoints, tie-break: larger tray size wins), 4+ endpoints = cross-piece (largest run). Called from `performContainmentTakeoff` Step 7b only when `anyRunUsedVectorMeasurement=true`. New `anyRunUsedVectorMeasurement` bool tracks whether any run used C1 vector data. `detectFittingsFromGeometry` resets `bends90/tPieces/crossPieces` to 0 only on runs with real segments before populating from junction analysis — annotation-fallback runs (segments.length === 0) are left unchanged. Old annotation-direction-change bend detection now wrapped in `!usedVectorMeasurement` guard (runs only on fallback path). Drawing notes: vector path logs `Fitting detection: Junction geometry analysis (N fittings detected from segment endpoints)`; fallback path logs `Fitting detection: Annotation direction change estimate`. No schema changes, no router changes, no client changes. Action required: Mitch must ↺ Re-run Takeoff on drawing 65005 after deploy. |
| 20 Mar 2026 | `server/services/stripe.ts` | **Downgrade deferred limits fix (Option B).** Root cause: `changeSubscriptionTier()` downgrade branch called `stripe.subscriptions.update()` which fires `customer.subscription.updated` immediately — not at the billing period end. The webhook was unconditionally writing new lower limits (maxUsers, maxQuotesPerMonth, maxCatalogItems) right away, even though the user had paid for the current period on their existing tier. Fix: downgrade branch now sets `downgradeEffectiveAt: String(subscription.current_period_end)` in Stripe subscription metadata alongside `orgId` and `tier`. Webhook handler reads this flag: `isPendingDowngrade = flag set AND now < effectiveAt` — when true, limits columns are excluded from `updatePayload` via spread conditional. At renewal (`isPendingDowngrade=false`), limits apply normally and `shouldClearDowngradeFlag=true` triggers a fire-and-forget `stripe.subscriptions.update` to clear the flag (prevents it affecting future webhooks). Upgrade path, checkout path, deleted handler, invoice handlers — all untouched. |
| 20 Mar 2026 | `client/src/pages/Pricing.tsx` | **Past-due subscriber guard.** Past-due users clicking any tier button were falling through to `createCheckout`, which would create a second Stripe subscription on a customer with an existing open past-due one — two concurrent subscriptions. Fix: added `createPortal` mutation (mirrors `Settings.tsx` pattern). `handleSelectTier` now checks `subStatus.data?.status === 'past_due'` as first guard after the auth check — shows an error toast and calls `createPortal.mutate()` to open the Stripe Billing Portal for payment method recovery. All other paths (upgrade modal, downgrade modal, new subscriber checkout) are unchanged. | (1) Burger menu auto-close: `SidebarMenuButton` onClick now calls `toggleSidebar()` when `isMobile` after `setLocation()` — sidebar overlay closed immediately after nav item tap. (2) Blank screen after sign out: `DashboardLayout` was returning `null` after setting `window.location.href = "/"` — browser hadn't navigated yet, causing a white flash. Fixed by returning `<DashboardLayoutSkeleton />` instead. (3) Homepage nav button overflow: nav `h-36`/logo `h-32` left no room for buttons on ~375px screens. Fixed: nav becomes `h-16 md:h-36`, logo becomes `h-10 md:h-32` on mobile, Pricing link hidden on `< sm` breakpoint with `hidden sm:inline-flex`, added `shrink-0` to both logo and button containers to prevent flex squish. (4) Catalog horizontal scroll on iOS: `CardContent` `overflow-x-auto` class was not reliably triggering momentum scroll on Safari iOS. Switched to inline style `overflowX: "auto", WebkitOverflowScrolling: "touch"` which activates native iOS momentum scrolling on the 800px-wide table. No server changes, no schema changes, no billing impact. |
| 20 Mar 2026 | `client/src/components/TakeoffPanel.tsx`, `client/src/components/InputsPanel.tsx` | **Chip exclusion now immediately removes symbol from QDS (no re-analysis).** Root cause: `saveExcludedMutation` had no `onSuccess` callback, so after a chip was greyed out the server wrote the exclusion to `userAnswers._excludedCodes` but `takeoffList` was never refetched. `mergeSummaryWithTakeoffs` reads `takeoff.userAnswers._excludedCodes` to decide which symbols to skip — with stale `takeoffList` it still had the old data, so the excluded symbol remained in QDS materials until the next unrelated refetch. Fix: (1) Added `onExclusionChanged?: () => void` prop to `TakeoffPanel` interface and destructure. (2) `saveExcludedMutation` now has `onSuccess: () => onExclusionChanged?.()`. (3) `InputItem` interface and destructure gain `onExclusionChanged: () => void`, passed down to `TakeoffPanel`. (4) Both mobile and desktop `InputItem` call sites in `InputsPanel` pass `onExclusionChanged={onTakeoffChanged}`. `onTakeoffChanged` in `InputsPanelProps` already maps to `refetchTakeoffs` in `QuoteWorkspace` — no `QuoteWorkspace` changes needed. Full chain: chip toggle → `saveExcludedMutation.onSuccess` → `refetchTakeoffs()` → `takeoffList` updates → `mergeSummaryWithTakeoffs` re-runs → excluded symbol skipped → QDS updates. No AI call, no re-analysis, no user edits lost. | When Mitch typed "no smoke detectors in this quote" in Paste Email/Text and re-analysed, the smoke detector still appeared in the QDS. Root cause: the system prompt told the AI to treat structured takeoff counts as "authoritative quantities" with no caveat — so when the AI saw 20 SO (Optical Smoke Detectors) in the ELECTRICAL TAKEOFF block and "no smoke detectors" in the text note, the takeoff data won because it was labelled authoritative. Fix: (1) Clarified "authoritative" — the count is accurate for items *within scope*, not immune to exclusion instructions. (2) Added explicit SCOPE EXCLUSION INSTRUCTIONS block with HIGHEST PRIORITY label: any text/voice note saying to exclude an item type overrides takeoff counts entirely — the item must not appear in materials even if present in the takeoff block. Concrete examples provided for common patterns: "no smoke detectors", "exclude fire alarm", "lighting only", "remove PIRs". Only `drawingEngine.ts` changed. No schema changes. No other sectors affected (GeneralEngine has no takeoff data so the clarification is irrelevant there). | (electrical sector).** The field wrote to `quotes.user_prompt` on blur and fed `TakeoffPanel` as `processingInstructions` for client-side symbol filtering only — it was never read by `parseDictationSummary` or any engine, so it had no effect on QDS or quote content. Users typing "lighting only" saw symbols hidden in the panel but got all symbols in the QDS anyway. Removed: (1) Takeoff Instructions JSX block from `QuoteWorkspace.tsx` (electrical-gated textarea + onBlur `updateQuote` call). (2) `userPrompt` prop removed from InputsPanel call, `InputsPanelProps` interface, outer component destructure, `InputItem` interface, `InputItem` destructure, and both `InputItem` render call sites (mobile + desktop). (3) `processingInstructions` prop removed from `TakeoffPanel` interface and destructure. (4) Entire `excludedCodes` useMemo (~95 lines) removed from `TakeoffPanel`. (5) `allExcludedCodes` simplified to alias `userExcludedCodes` directly — no more two-set merge. (6) `toggleChipExclusion` guard `if (excludedCodes.has(code)) return` removed. (7) Chip render cleaned of `isInstructionExcluded`/`isUserExcluded` variables; `isClickable`, `title`, and cursor logic simplified. **Preserved:** `userPrompt` state, hydration (`setUserPrompt` on fullQuote load), and `hasSavedQDS` guard in `QuoteWorkspace.tsx` — these serve the legacy rehydration Case 2 (old quotes pre-qdsSummaryJson that have `userPrompt` but no `qdsSummaryJson`). `quotes.user_prompt` DB column untouched. User-toggled chip exclusions (`userExcludedCodes`, `saveExcludedMutation`, `_excludedCodes` in DB) fully preserved — only the instruction-text-parsing path is gone. No server changes. No schema changes. No other sectors affected. | (1) **No default_payment_method** — `invoices.pay(invoice.id)` was called with no `payment_method` parameter. Stripe Checkout doesn't automatically set `invoice_settings.default_payment_method` on the customer object, so Stripe threw "There is no default_payment_method set on this Customer or Invoice". Fix: resolve payment method before calling `pay()` in priority order: (a) `subscription.default_payment_method`, (b) `customer.invoice_settings.default_payment_method`, (c) first card from `paymentMethods.list`. Pass resolved PM ID as `{ payment_method: resolvedPaymentMethodId }` to `invoices.pay()`. If no PM found at all, throw a clear error. (2) **RangeError: Invalid time value in webhook** — `customer.subscription.updated` handler passed `new Date(subscription.current_period_start * 1000)` directly to Drizzle. If either field is null/undefined during a subscription transition, `undefined * 1000 = NaN`, `new Date(NaN)` is an invalid date, Drizzle's `PgTimestamp.mapToDriverValue` calls `.toISOString()` on it → `RangeError`. Fix: guard both timestamp fields — `subscription.current_period_start ? new Date(...) : undefined`. Webhook now skips writing those fields rather than crashing. **Wez's current state:** Subscription is Active on Pro in Stripe (£99 next billing 1 Apr). The £99 upgrade invoice shows "Incomplete" — it was finalised but payment was never collected due to bug 1. Wez was not charged. This needs manual resolution: either void the incomplete invoice in Stripe dashboard (since Wez already has Pro active and next billing picks it up correctly) or manually pay it via Stripe. No code change needed for this specific invoice. |
| 20 Mar 2026 | `client/src/pages/Settings.tsx`, `server/services/subscriptionRouter.ts`, `server/services/emailService.ts` | **Team tab improvements.** (1) **Role descriptions panel** — collapsible "What can each role do?" info box in the invite form, showing Member vs Admin permissions in a two-column grid. (2) **Pending badge** — members who have been invited but haven't set their password yet (`emailVerified: false`) show an amber "Pending" pill next to their name. `teamMembers` query now returns `isPending` field. (3) **Reset password button** — Mail icon button on each non-owner member row, visible to owner/admin only. Clicking shows inline "Send reset? Yes / No" confirmation. Sends a fresh set-password link via the existing `sendTeamInviteEmail` flow (generates new `emailVerificationToken`, same `/set-password?token=` endpoint). New `resetTeamMemberPassword` mutation in `subscriptionRouter.ts`. (4) **Junk folder notice** — amber warning box below invite form; success toast updated to mention junk folder; invite email HTML now contains a yellow junk folder reminder box. (5) **Email logo fix** — added `width: auto; max-width: 180px;` inline style to prevent Outlook/Gmail expanding the PNG to full container width. (6) **Role dropdown guard** — Members can no longer change other members' roles (UI disabled for `role === 'member'`); was already guarded server-side. No schema changes. No billing impact. |
| 20 Mar 2026 | `drizzle/schema.ts`, `server/services/subscriptionRouter.ts`, `client/src/pages/Settings.tsx` | **Team tab — full feature set.** (1) **Set password directly** — new `setTeamMemberPassword` mutation; owner/admin enters new password inline below member row; bcrypt hashes it, marks emailVerified=true, clears invite token. UI: Shield icon button → inline two-field form (password + confirm) with Cancel. (2) **Last seen** — `teamMembers` query now returns `lastSignedIn` from users table (already written on every login). Displayed as "Just now / Xm ago / Xh ago / Xd ago" below each member's email. Pending members show "Has not logged in yet". (3) **Resend invite label** — Mail button tooltip and confirmation text now say "Resend invite?" for Pending members and "Send reset?" for active members. Same `resetTeamMemberPassword` mutation either way. (4) **Audit log** — new `teamAuditLog` table in schema.ts (orgId, actorUserId, targetUserId, action, detail, createdAt). New `logTeamAction()` helper called on: invite (both paths), remove, role_change, reset_password, set_password. New `teamAuditLog` tRPC query returns last 100 events enriched with actor name. UI: collapsible "Team Activity Log" card at bottom of Team tab, owner/admin only, loaded lazily on expand. (5) **Schema** — `teamAuditLog` table added to `drizzle/schema.ts`. Run raw SQL to create: `CREATE TABLE IF NOT EXISTS team_audit_log (id bigserial PRIMARY KEY, org_id bigint NOT NULL, actor_user_id bigint NOT NULL, target_user_id bigint NOT NULL, action varchar(50) NOT NULL, detail text, created_at timestamp DEFAULT now() NOT NULL);` on Render shell. No drizzle-kit push needed. |
| 20 Mar 2026 | `client/src/pages/Settings.tsx` | **Team tab — canManageTeam split (bug fix).** All per-member action buttons (reset password, resend invite, set password, remove, role dropdown) were gated behind `canManageTeam` which is `false` on Solo/Trial plans. Root cause: the flag was designed to gate *inviting new members* (requires Pro+) but accidentally blocked management of *existing* members too. Fix: split into `canInviteNewMembers = canManageTeam` (gates invite form — Pro+ only) and `canManageExistingMembers = isOwnerOrAdmin` (gates per-member actions — owner/admin any plan). Role dropdown disabled state, action buttons, and audit log card all updated to use the correct variable. No server changes. |
| 26 Mar 2026 | `server/engines/drawingEngine.ts` | **DrawingEngine broken for all 17 non-electrical sectors — fixed.** Root cause: DrawingEngine was calling `invokeLLM` (OpenAI format) at line 173 despite the function no longer existing — it was removed when GeneralEngine switched to `invokeClaude` on 12 Mar 2026 but DrawingEngine was never updated. This caused a silent `invokeLLM is not defined` crash for every DrawingEngine sector (telecoms_cabling, roofing, plumbing, HVAC, general_construction, bathrooms_kitchens, windows_doors, joinery, fire_protection, insulation_retrofit, construction_steel, metalwork_bespoke, groundworks, solar_ev, fire_security, lifts_access, mechanical_fabrication). Three fixes applied: (1) Replaced `invokeLLM(...)` OpenAI call with `invokeClaude(...)` Anthropic format (`system:`, `maxTokens:`, `messages:`). Updated response parsing from `response.choices[0].message.content` to `response.content` with markdown fence stripping. (2) Raised `max_tokens` from 1500 to 8192 — prevents JSON truncation on complex quotes. (3) Added `PRICING TYPE RULES` block to system prompt with sector-specific examples (telecoms SIM tariffs → monthly, hardware → standard; HVAC/roofing service contracts → annual; solar monitoring → monthly etc.) — mirrors the equivalent block in GeneralEngine. Added `stopReason === "max_tokens"` guard. GeneralEngine, ElectricalEngine, engineRouter, and all other files untouched. |
| 26 Mar 2026 | `drizzle/schema.ts` | **costPrice missing from quote_line_items table — margin never persisted after generateDraft.** Root cause: `costPrice` column existed on `catalogItems` table but was never added to `quoteLineItems` table in `drizzle/schema.ts`. The 14 Mar 2026 fix correctly wired `costPrice` through the `generateDraft` → `qdsLineItems` → `createLineItem` call chain, but Drizzle silently dropped the value at write time because the column wasn't in the schema mapping. Result: after generating a quote, all margin cells showed `—` and the margin totals were blank even when buy-in costs had been entered in QDS. Fix: added `costPrice: decimal("cost_price", { precision: 12, scale: 2 })` to `quoteLineItems` table definition. **Requires `npx drizzle-kit push` on Render shell after deploy** to create the column in the live DB. Electrical tables (`electricalTakeoffs`, `containmentTakeoffs`, `tenderContexts`) untouched. No other code changes needed — the read path in `QuoteWorkspace.tsx` already handles `item.costPrice` correctly. |
