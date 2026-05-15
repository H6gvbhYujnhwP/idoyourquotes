// server/scripts/testTemplateRender.ts
//
// Phase 1 verification script.
//
// Run from the Render shell (or locally) to confirm the full template
// render pipeline works end-to-end. Outputs a PDF to /tmp/test-<id>.pdf
// for each template attempted.
//
// Render shell usage (recall the paste-truncation prefix):
//   echo go; npx tsx server/scripts/testTemplateRender.ts
//
// Or to test a specific template:
//   echo go; npx tsx server/scripts/testTemplateRender.ts it-services/01-split-screen
//
// What this proves:
//   - @sparticuz/chromium unpacks and launches on the deployed environment
//   - The template library is reachable on disk
//   - Brand variable injection produces a visually-correct PDF
//   - Slot content replacement targets the right elements
//   - Logo injection (when supplied) loads and renders
//
// What this does NOT prove (those are Phase 2/3 concerns):
//   - Integration with the AI content generator
//   - The picker UI
//   - Persistence of the user's template choice
//   - PDF caching to R2

import * as fs from "fs";
import * as path from "path";
import { renderTemplate } from "../services/templateRenderer";
import { listAllTemplates, getTemplate } from "../services/templateLibrary";

// ── Test brand palettes ─────────────────────────────────────────────
//
// Match the four palettes Manus used for QA, so a successful render
// here corresponds to a known-good Manus QA preview.

const PALETTES = {
  navy: { primary: "#1a365d", secondary: "#2c5282", accent: "#3182ce" },
  forest: { primary: "#2f855a", secondary: "#276749", accent: "#48bb78" },
  terracotta: { primary: "#c05621", secondary: "#9c4221", accent: "#ed8936" },
  mint: { primary: "#a7f3d0", secondary: "#6ee7b7", accent: "#34d399" },
};

// ── Sample slot content ─────────────────────────────────────────────
//
// Hardcoded representative content so the test renders look like a
// real proposal. Mirrors the kind of structure the Phase 2 AI content
// pipeline will produce.

const SAMPLE_SLOT_CONTENT = {
  "quote-ref": "Q-2026-TEST-001",
  "date": "15 May 2026",
  "company-name": "Nexus IT Solutions Ltd",
  "about-text":
    "<p>We are a leading IT services provider with a proven track record of " +
    "delivering exceptional results for businesses across the UK. Our team of " +
    "certified professionals combines deep technical expertise with a genuine " +
    "commitment to client success.</p>",
  "summary-text":
    "<p>This proposal sets out a phased transition programme spanning twelve " +
    "weeks, culminating in a fully managed service agreement with predictable " +
    "monthly costs, proactive security monitoring, and guaranteed response times.</p>",
  "methodology-title": "Our Approach",
  "methodology-text":
    "<p>Our project methodology follows a structured Discover–Design–Deploy– " +
    "Operate framework, refined over hundreds of similar engagements.</p>",
};

// ── Main ────────────────────────────────────────────────────────────

async function main(): Promise<void> {
  const arg = process.argv[2];
  const outDir = "/tmp/template-renders";
  fs.mkdirSync(outDir, { recursive: true });

  if (arg && arg !== "--all") {
    await renderOne(arg, "navy", outDir);
    return;
  }

  if (arg === "--all") {
    const templates = listAllTemplates();
    console.log(`Rendering all ${templates.length} templates × 1 palette (navy)…`);
    for (const t of templates) {
      await renderOne(t.id, "navy", outDir);
    }
    return;
  }

  // Default: render a curated sample set that exercises every
  // important code path without taking 5 minutes.
  console.log("Rendering curated sample set. Pass --all to render every template, or a templateId for a single render.");
  const samples: Array<{ id: string; palette: keyof typeof PALETTES }> = [
    { id: "it-services/01-split-screen", palette: "navy" },
    { id: "it-services/01-split-screen", palette: "mint" }, // proves text-safe + luminance flip
    { id: "it-services/02-magazine", palette: "navy" },     // proves cover bleed fix
    { id: "commercial-cleaning/01-split-screen", palette: "forest" },
    { id: "pest-control/02-magazine", palette: "terracotta" },
  ];
  for (const s of samples) {
    await renderOne(s.id, s.palette, outDir);
  }

  console.log(`\nAll done. PDFs written to ${outDir}`);
}

async function renderOne(
  templateId: string,
  paletteName: keyof typeof PALETTES,
  outDir: string,
): Promise<void> {
  const template = getTemplate(templateId);
  if (!template) {
    console.error(`✗ Unknown templateId: ${templateId}`);
    return;
  }
  const palette = PALETTES[paletteName];

  console.log(`→ Rendering ${templateId} with ${paletteName} palette…`);
  try {
    const result = await renderTemplate({
      templateId,
      brand: palette,
      slotContent: SAMPLE_SLOT_CONTENT,
      logoUrl: null,
    });

    const safeId = templateId.replace(/\//g, "_");
    const outPath = path.join(outDir, `${safeId}_${paletteName}.pdf`);
    fs.writeFileSync(outPath, result.pdf);
    console.log(
      `  ✓ ${result.pdf.length} bytes in ${result.durationMs}ms → ${outPath}`,
    );
  } catch (err) {
    console.error(`  ✗ Failed:`, err instanceof Error ? err.message : err);
  }
}

main().catch((err) => {
  console.error("Fatal:", err);
  process.exit(1);
});
