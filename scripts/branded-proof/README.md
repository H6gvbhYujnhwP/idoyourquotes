# Branded proposal — proof of concept (Delivery 1)

> **Status: superseded — kept for archival reference.** Phase 4B Deliveries
> A, B and C have shipped the live Tile 3 ("Branded with your artwork
> and company story") pipeline. The proof's logic now lives in:
>
> - `server/services/brochureExtractor.ts` — page classification, ported
>   from `src/classifyBrochurePages.ts`
> - `server/engines/brandedProposalEngine.ts` — chapter generation,
>   ported from `src/generateNarrative.ts`
> - `server/services/brandedProposalAssembler.ts` — pdf-lib splice,
>   ported from `src/renderNarrativePages.ts` and
>   `src/assembleFinalPdf.ts`
> - `client/src/pages/BrandedProposalWorkspace.tsx` — the user-facing
>   edit/render workflow, replacing the standalone `run.ts` orchestrator
>
> This script directory lives outside `tsconfig.json`'s `include` scope
> and outside the Vite build root, so it ships nothing to production.
> Safe to leave or delete; the live pipeline does not depend on it.

---

This is the proof-of-concept script for the new "Branded with your artwork
and company story" quote mode (Tile 3). It exists to answer **one question**:

> Can the AI correctly classify a company brochure's pages by purpose, and
> can pdf-lib losslessly splice those brochure pages into a generated
> proposal — producing the kind of designed document Manus produced for
> Sweetbyte / Headway?

The answer needs to be a clear yes before D2 onwards (database, upload,
extraction pipeline, workspace, etc.) is built.

## What's in here

```
scripts/branded-proof/
  README.md                          (this file)
  inputs/
    sweetbyte-brochure.pdf           (28 pages, A5 landscape)
    headway-tender.pdf               (the IT support tender)
  src/
    types.ts                         (shared type definitions)
    claudeClient.ts                  (minimal fetch-based Claude client)
    classifyBrochurePages.ts         (Step 1: tag every brochure page)
    generateNarrative.ts             (Step 2: write generated chapters)
    renderNarrativePages.ts          (Step 3: pdf-lib draws narrative pages)
    assembleFinalPdf.ts              (Step 4: splice brochure + narrative)
    run.ts                           (orchestrator — run this)
  outputs/
    .gitkeep
    smoke-test-output-preview.pdf    (preview of the deterministic parts,
                                      built locally during development —
                                      shows pages 1-6 of what you'll get)
```

The proof bundles the input PDFs so it runs out of the box — you don't have
to upload anything.

## Running it

On the Render shell:

```
echo go; npx tsx scripts/branded-proof/src/run.ts
```

(The `echo go;` prefix is the standing rule from the infra gotchas — the
Render terminal eats the first ~8 characters of every command.)

Reads `ANTHROPIC_API_KEY` from the existing Render environment. Writes
the output PDF to `scripts/branded-proof/outputs/branded-proof-output.pdf`.
Takes about 60 seconds. Costs roughly $0.30 (£0.25) per run in Claude API
spend.

To download the result so you can eyeball it locally:

```
echo go; cat scripts/branded-proof/outputs/branded-proof-output.pdf | base64 > /tmp/out.b64
```

…then copy the b64 contents and decode locally. Or use `render shell scp`
if available in your Render plan.

## What to look for

The console will log the page classification table. **Look at this first.**
If the AI classifies brochure page 3 as `cover` instead of `about`, the
embed pairing will be wrong and the rest of the proof fails. Sensible
classifications for the Sweetbyte brochure should look something like:

```
  Page  Tag             Clarity   Facts
  ────────────────────────────────────────────────────────
     1  cover           clean     (1) Your Next-Generation IT…
     2  contents        clean     (none)
     3  about           clean     (3) 25+ Years Experience…
     4  usp             clean     (3) 98.8% SLA Adherence…
     5  service         clean     (2) Silver/Gold/Your Very Own IT…
    ...
    27  testimonial     clean     (3) Local Estate Agent…
    28  contact         clean     (3) 01702 540776…
```

Then open the PDF. The acceptance criteria are:

1. Opens cleanly in Adobe Reader and Chrome
2. Has a generated cover page
3. Has 12+ chapters in total (mix of generated and embedded)
4. **Brochure pages 3 (About Sweetbyte) and 4 (Why Choose Sweetbyte) appear
   verbatim in the document at the right narrative slots** — full fidelity,
   no rasterisation, no cropping
5. At least one additional brochure page (testimonials at p27, or a service
   page) appears at a contextually correct slot
6. Generated chapters reference Headway-specific tender details: 26 users,
   two sites (Colchester + Benfleet), charity context, WordPress site,
   on-prem server
7. No content duplicated between embedded brochure pages and adjacent
   generated chapters
8. Page transitions look clean, no jarring size changes

Items 1–8 pass → proof passes → proceed to D2.

If item 4 fails (brochure pages don't render correctly when copied) or
item 6 fails (generated text is generic, doesn't reference the tender),
we have a real conversation about whether the angle works before any
more code lands.

## What this proof is NOT

- **Not connected to the app.** No tRPC endpoints, no DB changes, no UI.
  Lives entirely under `scripts/branded-proof/` and reads only its own
  input files.
- **Not using your live brochure upload flow** (doesn't exist yet — that's
  D2/D3).
- **Not using your live pricing engine.** The pricing chapter is written
  by the AI in prose form for the proof. In the real feature (D6+) this
  slot is fed by your existing pricing engine with all the determinism
  work intact (D1–D3 from your previous session: temperature pin, tender
  mode, scope dedup, IT addendum).
- **Not optimised.** No caching, no retry logic, no error UI. If the API
  call fails, you re-run.

## Architecture summary

The previous attempt tried to extract images from brochure pages and
re-host them alongside generated text. That approach had two failure
modes you described:

1. Extracted images didn't blend into the proposal layout
2. The AI placed images in the wrong chapters

This proof uses a **different angle**: we don't extract images at all.
We embed entire brochure pages verbatim using pdf-lib's `copyPages()`,
which preserves rendering fidelity at the PDF structure level (no
rasterisation, no quality loss). The AI's job becomes simpler — classify
each page once by purpose, then a deterministic step picks one clean
page per chapter slot.

When a brochure page is "partial" (cluttered, mixed content), the
fallback kicks in: generate a narrative chapter using the page's
extracted facts, but don't embed the page itself. This is the "use
common sense to use important info and slightly reduce" behaviour
agreed in the design discussion.

## Files NOT touched

- `server/pdfGenerator.ts` — locked, untouched
- `server/routers.ts` — untouched
- `client/src/pages/QuoteWorkspace.tsx` — untouched
- `server/catalogSeeds/itServicesSeed.ts` — untouched
- `tsconfig.json` — untouched (the script lives outside `include` scope)
- `package.json` — **zero new dependencies** (pdf-lib and pdf-parse are
  already present)
- `pnpm-lock.yaml` — no changes
- `shared/schema.ts` — untouched
- `drizzle/schema.ts` — untouched
- `server/brandedProposalRenderer.ts` — untouched (deprecation marking
  deferred to a separate D1.5 hotfix)
- `server/templates/{modern,structured,bold}Template.ts` — untouched

## After the proof passes

D2 begins: database schema for storing brochure knowledge per org,
brochure upload endpoint, brochure extraction pipeline. The proof's
`classifyBrochurePages.ts` and `generateNarrative.ts` become the
foundation for the live extraction service.

Before D2 starts, the deprecation markings on the old branded renderer
(`brandedProposalRenderer.ts` plus the three template files) will be
applied as a single small hotfix, so the next session doesn't
accidentally extend the wrong code.

---

**Next step after running:** open the PDF, eyeball it, tell me wow or
rubbish.
