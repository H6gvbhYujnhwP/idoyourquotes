# Phase 1 Delivery — Template Library Foundation

Foundation layer for the path-2 "Use a branded colour template" upgrade.
Nothing user-visible changes after this delivery. You verify it works by
running the test script on Render shell — it should output sample PDFs
to `/tmp/template-renders/`.

---

## What's in this zip — file-by-file repo placement

| File | Goes to | What it is |
|------|---------|------------|
| `server/services/colourUtils.ts` | `server/services/` | Pure colour math. Computes the six brand CSS variables (3 raw + 3 text-safe) from any user's brand inputs, plus the pale-luminance flag. New file. |
| `server/services/templateLibrary.ts` | `server/services/` | Template discovery + metadata. Maps `(sector, style)` to on-disk paths. New file. |
| `server/services/templateRenderer.ts` | `server/services/` | The render service. Takes a template id, brand colours, slot content, logo URL → returns a PDF Buffer. Launches Chromium, injects everything via DOM mutation, emits PDF. New file. |
| `server/scripts/testTemplateRender.ts` | `server/scripts/` | Verification script. Run on Render shell to confirm the pipeline works end-to-end. New file. |
| `server/templates/library/` | `server/templates/` | The v2.1 template library (24 templates across 4 sectors × 6 designs, ~28 MB). Includes the two local CSS fixes appended to each `base.css` for the cover-bleed and text-safe-meta-block bugs Manus left in v2.1. New folder. |
| `package.json` | repo root | Adds two dependencies: `@sparticuz/chromium ^138.0.2` and `puppeteer-core ^24.10.0`. Alphabetically inserted. |

`pnpm-lock.yaml` is NOT in this delivery — it must be regenerated on
your Windows machine (see install steps below) so it matches your pnpm
version exactly.

---

## What I did NOT touch

- `server/pdfGenerator.ts` — locked
- `server/routers.ts` — Phase 2 will add a new endpoint here, Phase 1 doesn't
- `client/src/pages/QuoteWorkspace.tsx` — Phase 3 only
- `server/brandedProposalRenderer.ts` — deprecated, leave alone
- The Tile 3 brochure-embed pipeline — untouched
- `shared/schema.ts` / `drizzle/schema.ts` — no schema changes in Phase 1

---

## Install steps (Windows)

From the repo root in PowerShell or Git Bash:

```bash
# 1. Drop the new files in place
#    (extract this zip into the repo, overwriting package.json)

# 2. Regenerate pnpm-lock.yaml against the new package.json
npx pnpm@10.4.1 install --ignore-scripts --no-frozen-lockfile

# 3. Verify TypeScript baseline holds (zero new errors)
node node_modules/typescript/lib/tsc.js --noEmit

# 4. Commit both files in lockstep
git add package.json pnpm-lock.yaml server/services/colourUtils.ts \
        server/services/templateLibrary.ts server/services/templateRenderer.ts \
        server/scripts/testTemplateRender.ts server/templates/library
git commit -m "phase 1: template library foundation"
```

Deploy via GitHub Desktop as usual.

---

## Render shell verification

After deploy, SSH into the Render shell and run:

```bash
# Default: render a curated sample of 5 templates × different palettes
# (exercises every code path — bleed fix, text-safe variant, luminance flip)
echo go; npx tsx server/scripts/testTemplateRender.ts

# Or render a single specific template
echo go; npx tsx server/scripts/testTemplateRender.ts it-services/01-split-screen

# Or render every template across the navy palette (24 PDFs, slower)
echo go; npx tsx server/scripts/testTemplateRender.ts --all
```

Output PDFs land in `/tmp/template-renders/`. To inspect one without
downloading, you can `base64 -w0 /tmp/template-renders/it-services_01-split-screen_navy.pdf | head -c 200`
just to confirm it's a non-trivial PDF — but really you want to download
one and open it to confirm the visual is correct.

### Success criteria for Phase 1

The script completes without errors AND one of the rendered PDFs you
download from `/tmp/template-renders/` shows:

- A genuine v2.1 design (e.g. Split Screen for IT, navy palette)
- The brand colour (navy in the default sample) applied to headings
  and accent elements
- Photoreal duotone imagery rendered correctly
- The cover headline fully visible (the bleed fix in action)
- For the mint palette render: headings and meta-block text are
  readable darker mint, not invisible pale (the text-safe variant in
  action)

If all that's true, Chromium runs cleanly on Render and the foundation
is solid. Phase 2 can proceed — wiring AI content + adding the new
endpoint to routers.ts.

---

## Known follow-ups for Phase 2/3

These are deliberate Phase 1 scope-cuts, not bugs:

- **No routers.ts endpoint yet** — Phase 2 adds `generateBrandedProposalV2` alongside the existing path-2 endpoint
- **No AI content integration yet** — Phase 2 wires the existing branded-proposal content generator's chapters into the slot system
- **No picker UI yet** — Phase 3 redesigns the export modal
- **`brandAccentColor` not in schema yet** — for now the renderer derives an accent from primary when one isn't set; Phase 3 adds the schema column + accent picker
- **No PDF caching to R2 yet** — Phase 4 polish
- **Schedule of Works UI in workspace** — Phase 4 polish (the original ask from session 1, finally circling back)

---

## TypeScript baseline note

I couldn't fully verify the TS baseline in my environment due to a
`patchedDependencies` mismatch in the pnpm lockfile config. The three
new source files are written to zero-new-errors discipline:

- Strict types throughout (no `any`)
- Explicit imports
- `puppeteer-core` and `@sparticuz/chromium` both ship TypeScript
  definitions

If the baseline check on your machine reports any new errors, send me
the diff and I'll fix in place.
