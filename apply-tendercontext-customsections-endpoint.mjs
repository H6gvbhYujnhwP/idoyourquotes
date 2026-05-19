// apply-tendercontext-customsections-endpoint.mjs
//
// Phase 4B Custom-Sections delivery — adds a new endpoint to the
// locked server/routers.ts under the tenderContext router:
//
//   tenderContext.upsertCustomSections
//     input:  { quoteId, customSections: [{ heading, body }] }
//     body:   upserts only the custom_sections column on the row
//
// WHY A SCRIPT (not a complete file replacement):
//   server/routers.ts is on the locked-files list and is "add-only
//   (new endpoints only, no changes to existing procedures)". The new
//   endpoint is purely additive — it sits as a sibling under the
//   existing tenderContext router after `upsert`. The existing
//   tenderContext.upsert procedure is left untouched (and continues to
//   carry assumptions/exclusions/notes/symbolMappings as before). The
//   Review modal saves customSections via this new endpoint in parallel
//   with the existing upsert call.
//
// WHAT IT DOES:
//   Locates the closing `}),` of the existing tenderContext.upsert
//   procedure (anchored on the `return upsertTenderContext(quoteId, data);`
//   line, which is unique across the 5,497-line file). Inserts the new
//   `upsertCustomSections` procedure immediately afterwards, before the
//   `}),` that closes the tenderContext router. Existing code shifts
//   down by one procedure block; no edits to procedures above or below.
//
// Idempotent. Safe to re-run. Exits 0 on success or already-patched.
// Exits 1 only if the file is missing, the anchor isn't unique, or the
// file is in mixed state.
//
// Usage (Windows, from repo root):
//   node apply-tendercontext-customsections-endpoint.mjs

import { readFileSync, writeFileSync, existsSync } from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname);
const targetPath = resolve(repoRoot, "server/routers.ts");

if (!existsSync(targetPath)) {
  console.error(
    "\u2717 server/routers.ts not found \u2014 run from repo root.",
  );
  process.exit(1);
}

// Unique sentinel — if present, the endpoint is already in place.
const SENTINEL = "upsertCustomSections: protectedProcedure";

// Unique anchor block: the closing of tenderContext.upsert followed by
// the closing of the tenderContext router and the next-section comment.
// Verified to appear exactly once across the file.
const ANCHOR = `        return upsertTenderContext(quoteId, data);
      }),
  }),

  // ============ INTERNAL ESTIMATE ============`;

// What the anchor block looks like AFTER the new endpoint is inserted.
// The new procedure sits between the existing upsert's closing and the
// router's closing brace.
const REPLACEMENT = `        return upsertTenderContext(quoteId, data);
      }),

    // Phase 4B Custom-Sections — additive endpoint for the Standard
    // Quote Review modal. Writes ONLY the custom_sections column on
    // the tender_contexts row; existing fields (assumptions/exclusions/
    // notes/symbolMappings) are preserved because the Drizzle helper
    // only updates columns present in the SET clause. The Review modal
    // calls this in parallel with tenderContext.upsert on save when
    // the custom-sections list is dirty.
    upsertCustomSections: protectedProcedure
      .input(z.object({
        quoteId: z.number(),
        customSections: z.array(z.object({
          heading: z.string(),
          body: z.string(),
        })),
      }))
      .mutation(async ({ ctx, input }) => {
        const quote = await getQuoteWithOrgAccess(input.quoteId, ctx.user.id);
        if (!quote) throw new Error("Quote not found");

        return upsertTenderContext(input.quoteId, {
          customSections: input.customSections,
        });
      }),
  }),

  // ============ INTERNAL ESTIMATE ============`;

const original = readFileSync(targetPath, "utf8");

const alreadyPatched = original.includes(SENTINEL);
const anchorCount = (original.match(new RegExp(escapeRegex(ANCHOR), "g")) || [])
  .length;

if (alreadyPatched && anchorCount === 0) {
  console.log(
    "\u2713 server/routers.ts \u2014 already patched (upsertCustomSections endpoint present, original anchor consumed). Nothing to do.",
  );
  process.exit(0);
}

if (alreadyPatched && anchorCount > 0) {
  console.error(
    "\u2717 server/routers.ts \u2014 mixed state: sentinel found AND original anchor still present. Manual review required.",
  );
  process.exit(1);
}

if (anchorCount === 0) {
  console.error(
    "\u2717 server/routers.ts \u2014 anchor block not found. File doesn't match the expected shape; refusing to edit blindly.",
  );
  console.error("   Looked for anchor:");
  console.error("   " + ANCHOR.split("\n").map((l) => "    " + l).join("\n"));
  process.exit(1);
}

if (anchorCount > 1) {
  console.error(
    `\u2717 server/routers.ts \u2014 anchor block found ${anchorCount} times; not unique. Aborting rather than corrupt unintended sites.`,
  );
  process.exit(1);
}

const patched = original.replace(ANCHOR, REPLACEMENT);

if (patched === original) {
  console.error(
    "\u2717 server/routers.ts \u2014 replace produced no change. Aborting.",
  );
  process.exit(1);
}

writeFileSync(targetPath, patched, "utf8");
console.log(
  "\u2713 server/routers.ts \u2014 patched. Added tenderContext.upsertCustomSections endpoint.",
);
console.log(
  "  (Idempotent: a second run will report already-patched and exit 0.)",
);
process.exit(0);

function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
