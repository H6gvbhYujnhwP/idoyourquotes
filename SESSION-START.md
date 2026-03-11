# SESSION-START — Read This First, Every Time

**This file lives at the repo root. Every Claude session must read it in full before touching any code.**

---

## MANDATORY PRE-CODE PROTOCOL

Before writing a single line of code, Claude must:

1. Read this file in full
2. Identify the feature area the request touches
3. Look up the call chain for that feature in the Flow Map below
4. Write out explicitly in chat every node in that chain — server function, client component, state variable, DB column — and state what each one does
5. Only then begin implementation

**The phrase "Traced call chain: [list of nodes]" must appear before any code block.**

Skipping this protocol will break something else. It always does.

---

## Shared State Map

These pieces of state are read by more than one feature. Changing any of them affects every entry in its row.

| State | Lives In | Written By | Read By |
|---|---|---|---|
| `voiceSummary` | `QuoteWorkspace` useState | `triggerVoiceAnalysis` (AI call result), `onSave` QDS handler (filters to voice-only) | `QuoteDraftSummary` via props, rehydration useEffect |
| `qdsSummaryJson` | `quotes` DB column | `triggerVoiceAnalysis` auto-save only | Rehydration useEffect Case 1 (page refresh restore) |
| `userPrompt` | `quotes` DB column + useState | `triggerVoiceAnalysis` (text marker), `onSave` QDS handler (structured text) | `hasSavedQDS` guard, rehydration useEffect Case 2, `generateDraft` AI context |
| `takeoffList` | tRPC query cache (`electricalTakeoff.list`) | `uploadFile` auto-takeoff, `setReferenceOnly`, `answerQuestions`, `updateExcludedCodes` | `QuoteDraftSummary` mergeSummaryWithTakeoffs, `TakeoffPanel` display |
| `takeoffOverrides` | `QuoteWorkspace` useState | `onSave` QDS handler | `mergeSummaryWithTakeoffs` in `QuoteDraftSummary` |
| `mimeType` | `quote_inputs` DB column | `setReferenceOnly` (appends/removes `;reference=true`) | `parseDictationSummary` engine filter, `generateDraft` loop filter, auto-takeoff skip guard, `InputsPanel` toggle display |
| `symbolMappings` | `tenderContexts` DB column (JSON) | `setReferenceOnly` ON: LLM legend parse; OFF: cleared | Auto-takeoff on upload (fetches at upload time), `answerQuestions`, `updateExcludedCodes`, `getByInputId` (merges into symbolDescriptions) |
| `hasRehydratedRef` | `QuoteWorkspace` useRef | Set true by rehydration useEffect; reset to false by `setReferenceOnly.onSuccess` | Rehydration useEffect guard (prevents double-run) |
| `processedContent` | `quote_inputs` DB column | `uploadFile` auto-analyze, `transcribeAudio`, `extractPdfText`, `analyzeImage`, `setReferenceOnly` (legend parse) | `parseDictationSummary` engine input, `generateDraft` context loop |

---

## Flow Map — Major User Actions

### 1. Upload a File (PDF / image / audio / document)

```
User: drops file in InputsPanel
  → InputsPanel: onUpload prop
  → QuoteWorkspace: uploadFile.mutate (tRPC inputs.uploadFile)
  → server: inputs.uploadFile
    → uploadToR2 (Cloudflare R2 storage)
    → db.createInput (quote_inputs row, processingStatus: "processing")
    → [PDF] extractWithPdfJs → updateInputProcessing (processedContent, status: "completed")
    → [PDF, electrical only] performElectricalTakeoff(pdfBuf, filename, symbolMap from tenderContexts)
      → createElectricalTakeoff (electrical_takeoffs row)
      → updateInputProcessing (processedContent = formatted takeoff summary)
    → [audio] transcribeAudio (OpenAI Whisper) → updateInputProcessing
    → [image] analyzeImage (OpenAI vision) → updateInputProcessing
    → [document] mammoth/xlsx extract → updateInputProcessing
    → logUsage (credits)
  → client: uploadFile.onSuccess → refetch() → fullQuote updates
  → QuoteWorkspace: wasProcessing/isProcessing useEffect detects transition
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
      → engine filters out inputs where mimeType includes ";reference=true"
      → builds AI prompt from processedContent of remaining inputs
      → calls OpenAI/Anthropic LLM
      → returns { jobDescription, materials, labour, markup, ... }
  → client: setVoiceSummary({ ...result, materials: source "voice" })
  → auto-fill clientName, title if empty
  → build summaryToSave JSON → updateFields.qdsSummaryJson = JSON.stringify(...)
  → build autoPrompt text → updateFields.userPrompt = autoPrompt
  → updateQuote.mutateAsync({ qdsSummaryJson, userPrompt, clientName, title })
  → setIsSummaryLoading(false)
```

**State touched:** `voiceSummary`, `quotes.qds_summary_json`, `quotes.user_prompt`, `quotes.clientName`, `quotes.title`

**CRITICAL — DO NOT trigger this on refresh.** The rehydration useEffect guards against this using `qdsSummaryJson` (Case 1) and `userPrompt` (Case 2). Only fire this when: new input processed, legend toggle changes, user clicks Re-analyse.

---

### 3. Page Refresh / Navigate Back to Quote

```
QuoteWorkspace mounts → trpc.quotes.getFull.useQuery fires
  → fullQuote.quote.qdsSummaryJson populated from DB
  → Rehydration useEffect (hasRehydratedRef guard):
    → Case 1: qdsSummaryJson exists
        → JSON.parse → setVoiceSummary (exact state from last session)
        → hasRehydratedRef.current = true
        → RETURN — no AI call
    → Case 2: userPrompt exists but no qdsSummaryJson (legacy quotes)
        → hasRehydratedRef.current = true
        → RETURN — no AI call (QDS shows empty until manual Re-analyse)
    → Case 3: no qdsSummaryJson, no userPrompt (brand new quote)
        → if hasAnalysableInputs → triggerVoiceAnalysis()
```

**State touched:** `voiceSummary` (restored from DB snapshot)

**THE LEGEND REFRESH BUG was here:** old code used userPrompt as the only guard. If userPrompt was written before the legend toggle completed its re-analysis, the guard fired too early and a subsequent page refresh ran fresh analysis that included the legend. Fixed by qdsSummaryJson: the snapshot is always written AFTER the clean analysis completes.

---

### 4. Toggle Legend / Reference Only

```
User: flips switch on a PDF input in InputsPanel
  → InputsPanel: optimisticReference local state updates immediately (visual feedback)
  → onSetReferenceOnly prop called
  → QuoteWorkspace: setReferenceOnly.mutate({ inputId, quoteId, isReference })
  → server: inputs.setReferenceOnly
    → db.updateInput (mimeType: append/remove ";reference=true")
    → if isReference ON:
        → deleteElectricalTakeoffByInputId (remove old takeoff for this input)
        → invokeLLM (extract symbol map from legend PDF text)
        → upsertTenderContext (symbolMappings = { CODE: { meaning, confirmed } })
        → updateInputProcessing (processedContent = "[LEGEND/KEY SHEET — N symbols extracted]")
        → getInputsByQuoteId → for each non-reference PDF with a takeoff:
            → performElectricalTakeoff(pdfBuf, ref, symbolMap) [re-run with legend]
            → updateElectricalTakeoff (new symbols/counts/questions)
            → updateInputProcessing (processedContent = new formatted takeoff)
    → if isReference OFF:
        → upsertTenderContext (symbolMappings = {})
        → for each non-reference PDF with a takeoff: re-run without symbolMap
  → client: setReferenceOnly.onSuccess
    → await refetch() (fullQuote updates, mimeType now correct)
    → refetchTakeoffs() (takeoffList updates)
    → hasRehydratedRef.current = false (allow re-analysis)
    → triggerVoiceAnalysis() (re-runs QDS, now with/without legend in inputs)
      → saves new clean qdsSummaryJson to DB
```

**State touched:** `mimeType`, `symbolMappings`, `processedContent`, `takeoffList`, `voiceSummary`, `qdsSummaryJson`, `userPrompt`

**IMPORTANT:** This is the most side-effectful action in the app. Any change to setReferenceOnly or its onSuccess MUST trace all of the above.

---

### 5. QDS Save (User clicks Save in QuoteDraftSummary)

```
User: clicks Save button in QuoteDraftSummary
  → QuoteDraftSummary: handleSave → onSave(sanitized data)
  → QuoteWorkspace: onSave handler
    → build takeoffOverrides from takeoff/containment materials → setTakeoffOverrides
    → setVoiceSummary({ ...data, materials: voice-only }) [strips takeoff rows]
    → build userPrompt text (structured summary for AI)
    → setUserPrompt(text)
    → if clientName new → updateQuote.mutate({ clientName, title })
    → saveVoiceNoteSummary.mutate({ quoteId, summary: voice-only data })
      → server: ai.saveVoiceNoteSummary → updates quote record
      → onSuccess: toast "saved", refetch()
  ⚠️ NOTE: `qdsSummaryJson` IS now saved by onSave — updateQuote.mutate includes it.
     Both triggerVoiceAnalysis (auto) and onSave (manual) write qdsSummaryJson.
     Refresh will always restore the user's last saved state.
```

**State touched:** `takeoffOverrides`, `voiceSummary` (voice-only), `userPrompt` (DB + state), `quotes.clientName`

---

### 6. Generate Quote Draft (AI → Line Items)

```
User: clicks "Generate Draft" in QDS panel
  → QuoteWorkspace: generateDraft.mutate({ quoteId, userPrompt })
  → server: ai.generateDraft
    → getInputsByQuoteId → skip mimeType includes ";reference=true"
    → build processedEvidence from processedContent of remaining inputs
    → fetchCatalog → build catalogContext
    → call OpenAI LLM (long structured prompt)
    → parse response → create line items via createLineItem
    → return { itemCount }
  → client: onSuccess → toast, setActiveTab("quote"), refetch()
```

**State touched:** `quote_line_items` table, `lineItems` query cache

---

### 7. Generate PDF

```
User: clicks Generate PDF
  → QuoteWorkspace: handleGeneratePDF
    → await updateQuote.mutateAsync({ all current field values })  [saves latest edits first]
    → generatePDF.mutate({ id: quoteId })
    → server: quotes.generatePDF
      → getFullQuoteData (quote + lineItems + org branding)
      → build PDF with PDFKit (cream/white bg, navy structure, brand accent)
      → uploadToR2 (PDF stored in R2)
      → updateQuote (pdfUrl = R2 url)
    → client: opens PDF in new tab
```

**State touched:** `quotes.pdfUrl`, quote fields (saved before PDF generation)

---

### 8. Electrical Takeoff — Answer Questions

```
User: answers a question in TakeoffPanel chat
  → TakeoffPanel: handleConfirmQuestion
    → for unknown-symbol questions with "define": encodes as "define:Description"
    → answerQuestions.mutate({ takeoffId, questionId, answer })
  → server: electricalTakeoff.answerQuestions
    → fetch tenderContexts (symbolMappings)
    → applyUserAnswers (recalculate counts with answer applied)
    → if all questions answered: status = "approved"; else status = "questions"
    → updateElectricalTakeoff (userAnswers, counts, status)
    → formatTakeoffForQuoteContext(result, symbolMap) → updateInputProcessing (processedContent)
  → client: refetchTakeoffs() → takeoffList updates → QDS merge re-renders
```

**State touched:** `electrical_takeoffs.userAnswers`, `electrical_takeoffs.status`, `electrical_takeoffs.counts`, `quote_inputs.processedContent`, `takeoffList`

---

### 9. Team Invite / User Creation

```
Admin: sends invite from team settings
  → server: team.invite
    → create user record (hashed temp password)
    → generate set-password token (stored in DB)
    → send invitation email (token link)
  → Invitee: clicks link → set-password page
    → server: auth.setPasswordFromToken
      → validate token, update password, mark token used
      → add user to org
```

---

### 10. Billing / Subscription Changes

```
Stripe webhook → server: /webhook
  → switch event.type:
    → checkout.session.completed → updateOrg (tier, stripeCustomerId)
    → customer.subscription.updated → updateOrg (tier, status)
    → customer.subscription.deleted → updateOrg (tier: "free")
    → invoice.payment_failed → email notification

All AI mutations guarded by assertAIAccess(userId):
  → getUserPrimaryOrg → canUseAIFeatures(org) → throws if over quota
  → logUsage after success (credits deducted)
```

---

## Known Gaps (fix before closing)

1. **Auto-takeoff runs for all sectors** (wasteful, not harmful) — the auto-takeoff block in `inputs.uploadFile` runs for every org regardless of `defaultTradeSector`. Fix: add `org.defaultTradeSector === 'electrical'` guard around the auto-takeoff block (~line 1616 of routers.ts).

2. **Legend PDFs trigger takeoff before reference toggle** — if a legend PDF is uploaded before being toggled to reference-only, the auto-takeoff runs on it and writes noisy processedContent. Partial mitigation: `setReferenceOnly` deletes the takeoff when toggled. Full fix: detect legend-like PDFs at upload time.

---

## Guardrails — Never Break These

**System Guardrails (G1–G10)**
- G1: AI JSON contract — never change the shape of data returned from engines without updating all consumers
- G10: User data sovereignty — never auto-overwrite data the user has manually edited without explicit user action

**Billing Guardrails (B1–B10)**
- All AI mutations must call `assertAIAccess(userId)` before any LLM call
- `quotes.update`, `lineItems.update`, `generatePDF` are NOT gated (no AI cost)
- All DB queries must filter by `orgId` for multi-tenancy

**Sector Agnosticism**
- Never hardcode sector assumptions. Use `quote.tradePreset || user.defaultTradeSector` everywhere.
- Electrical UI panels (`TakeoffPanel`, `ContainmentTakeoffPanel`) are gated behind `tradePreset === "electrical"` in `InputsPanel`

---

## Key File Locations

| File | Purpose |
|---|---|
| `server/routers.ts` | All tRPC mutations and queries |
| `server/db.ts` | All DB access functions |
| `server/services/electricalTakeoff.ts` | Symbol detection, takeoff engine |
| `server/engines/engineRouter.ts` | selectEngine() — routes to GeneralEngine/DrawingEngine |
| `server/engines/generalEngine.ts` | GeneralEngine — all non-electrical sectors |
| `server/engines/drawingEngine.ts` | DrawingEngine — drawing-aware sectors |
| `drizzle/schema.ts` | DB schema (source of truth for all columns) |
| `client/src/pages/QuoteWorkspace.tsx` | Main quote page — all state lives here |
| `client/src/components/QuoteDraftSummary.tsx` | QDS display + mergeSummaryWithTakeoffs |
| `client/src/components/InputsPanel.tsx` | File upload, legend toggle, takeoff panels |
| `client/src/components/TakeoffPanel.tsx` | Electrical takeoff questions UI |
| `shared/schema.ts` | Shared types and Zod schemas |
