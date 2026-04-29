// Orchestrator for the branded-proof D1 script.
//
// Run on Render shell with:
//
//   echo go; npx tsx scripts/branded-proof/src/run.ts
//
// (The "echo go;" prefix is a standing rule from the infra gotchas:
//  the Render terminal eats the first ~8 chars of every command.)
//
// Inputs (already bundled in scripts/branded-proof/inputs/):
//   - sweetbyte-brochure.pdf
//   - headway-tender.pdf
//
// Output:
//   - scripts/branded-proof/outputs/branded-proof-output.pdf
//
// Console output:
//   - The page classification table from Step 1
//   - The slot plan from Step 2
//   - Token usage and cost summary
//   - Final output path

import { promises as fs } from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createRequire } from "module";
import { PDFDocument } from "pdf-lib";

import { classifyBrochurePages } from "./classifyBrochurePages";
import { generateNarrative } from "./generateNarrative";
import { renderNarrativePages } from "./renderNarrativePages";
import { assembleFinalPdf } from "./assembleFinalPdf";

// pdf-parse v2 default-exports a CJS function. The project is ESM
// (package.json "type": "module"), so we use createRequire to load it.
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string }> = require("pdf-parse");

// ESM-safe equivalent of __dirname / __filename
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SCRIPT_DIR = path.resolve(__dirname, "..");
const INPUTS = {
  brochure: path.join(SCRIPT_DIR, "inputs", "sweetbyte-brochure.pdf"),
  tender: path.join(SCRIPT_DIR, "inputs", "headway-tender.pdf"),
};
const OUTPUT_PATH = path.join(SCRIPT_DIR, "outputs", "branded-proof-output.pdf");

// Approximate Anthropic Sonnet 4 pricing for cost reporting (USD per million tokens)
// Refresh these if Anthropic publishes new prices — they're for log output only.
const CLAUDE_INPUT_USD_PER_MTOK = 3;
const CLAUDE_OUTPUT_USD_PER_MTOK = 15;

function formatGbp(usd: number): string {
  // Quick rough conversion for log output. Not financial-grade.
  const gbp = usd * 0.79;
  return `£${gbp.toFixed(3)}`;
}

function logSection(title: string) {
  console.log("\n" + "─".repeat(64));
  console.log("  " + title);
  console.log("─".repeat(64));
}

async function main() {
  const startTime = Date.now();

  logSection("Branded proposal — proof of concept (D1)");
  console.log("  Brochure: " + INPUTS.brochure);
  console.log("  Tender:   " + INPUTS.tender);
  console.log("  Output:   " + OUTPUT_PATH);

  // Validate inputs exist
  for (const [name, p] of Object.entries(INPUTS)) {
    try {
      await fs.access(p);
    } catch {
      throw new Error(`Input file missing: ${p} (expected for ${name})`);
    }
  }

  if (!process.env.ANTHROPIC_API_KEY) {
    throw new Error(
      "ANTHROPIC_API_KEY is not set. On Render this should be available — " +
      "verify with: echo go; printenv ANTHROPIC_API_KEY | head -c 8",
    );
  }

  // ── Load inputs ──────────────────────────────────────────────────
  const brochureBuffer = await fs.readFile(INPUTS.brochure);
  const tenderBuffer = await fs.readFile(INPUTS.tender);

  // Detect brochure page dimensions so the narrative pages match
  const brochureDocForDims = await PDFDocument.load(brochureBuffer);
  const firstBrochurePage = brochureDocForDims.getPage(0);
  const { width: brochureWidth, height: brochureHeight } = firstBrochurePage.getSize();
  const dim = { width: brochureWidth, height: brochureHeight };
  console.log(
    `  Brochure dimensions: ${brochureWidth.toFixed(0)} × ${brochureHeight.toFixed(0)} pt ` +
    `(${(brochureWidth * 0.3528).toFixed(0)} × ${(brochureHeight * 0.3528).toFixed(0)} mm)`,
  );

  // Extract tender text
  const tenderParsed = await pdfParse(tenderBuffer);
  const tenderText = tenderParsed.text;
  console.log(`  Tender text length: ${tenderText.length} chars`);

  // ── Step 1: Classify brochure pages ──────────────────────────────
  logSection("Step 1 — Classifying brochure pages");
  const t1 = Date.now();
  const classifyResult = await classifyBrochurePages(brochureBuffer);
  console.log(`  ${classifyResult.classifications.length} pages classified in ${((Date.now() - t1) / 1000).toFixed(1)}s`);
  console.log(`  Tokens: ${classifyResult.inputTokens} in, ${classifyResult.outputTokens} out`);
  console.log("\n  Page-by-page classification:");
  console.log("  " + "─".repeat(58));
  console.log("  Page  Tag             Clarity   Facts");
  console.log("  " + "─".repeat(58));
  for (const c of classifyResult.classifications) {
    const factsPreview = c.facts.length > 0 ? `(${c.facts.length}) ${c.facts[0].slice(0, 22)}…` : "(none)";
    console.log(
      `  ${String(c.pageNumber).padStart(4, " ")}  ${c.tag.padEnd(15, " ")} ${c.clarity.padEnd(9, " ")} ${factsPreview}`,
    );
  }

  // ── Step 2: Generate narrative + slot plan ───────────────────────
  logSection("Step 2 — Generating narrative chapters");
  const t2 = Date.now();
  const narrativeResult = await generateNarrative({
    tenderText,
    classifications: classifyResult.classifications,
  });
  console.log(`  ${narrativeResult.slots.length} slots planned in ${((Date.now() - t2) / 1000).toFixed(1)}s`);
  console.log(`  Tokens: ${narrativeResult.inputTokens} in, ${narrativeResult.outputTokens} out`);
  console.log("\n  Slot plan:");
  console.log("  " + "─".repeat(72));
  for (const s of narrativeResult.slots) {
    if (s.source === "embed") {
      console.log(
        `  ${String(s.slotIndex).padStart(2, " ")}. ${s.slotName.padEnd(32, " ")} EMBED brochure page ${s.brochurePageNumber}`,
      );
    } else {
      const bodyLen = s.body.length;
      const status = bodyLen > 0 ? `${bodyLen} chars` : "(empty — skipped)";
      console.log(
        `  ${String(s.slotIndex).padStart(2, " ")}. ${s.slotName.padEnd(32, " ")} GENERATE  ${status}`,
      );
    }
  }

  // ── Step 3: Render narrative pages ───────────────────────────────
  logSection("Step 3 — Rendering narrative pages to PDF");
  const t3 = Date.now();
  const renderResult = await renderNarrativePages({
    slots: narrativeResult.slots,
    pageDimensions: dim,
  });
  const narrativeDoc = await PDFDocument.load(renderResult.narrativePdfBytes);
  console.log(
    `  ${narrativeDoc.getPageCount()} narrative pages rendered in ${((Date.now() - t3) / 1000).toFixed(1)}s`,
  );

  // ── Step 4: Assemble final PDF ───────────────────────────────────
  logSection("Step 4 — Assembling final PDF");
  const t4 = Date.now();
  const finalBytes = await assembleFinalPdf({
    brochurePdfBytes: brochureBuffer,
    narrativePdfBytes: renderResult.narrativePdfBytes,
    slots: narrativeResult.slots,
    pageIndexBySlot: renderResult.pageIndexBySlot,
  });
  await fs.mkdir(path.dirname(OUTPUT_PATH), { recursive: true });
  await fs.writeFile(OUTPUT_PATH, finalBytes);
  const finalDoc = await PDFDocument.load(finalBytes);
  console.log(
    `  ${finalDoc.getPageCount()} pages assembled in ${((Date.now() - t4) / 1000).toFixed(1)}s`,
  );
  console.log(`  Output size: ${(finalBytes.byteLength / 1024).toFixed(0)} KB`);

  // ── Cost summary ─────────────────────────────────────────────────
  logSection("Cost summary");
  const totalIn = classifyResult.inputTokens + narrativeResult.inputTokens;
  const totalOut = classifyResult.outputTokens + narrativeResult.outputTokens;
  const usd =
    (totalIn / 1_000_000) * CLAUDE_INPUT_USD_PER_MTOK +
    (totalOut / 1_000_000) * CLAUDE_OUTPUT_USD_PER_MTOK;
  console.log(`  Total input tokens:  ${totalIn.toLocaleString()}`);
  console.log(`  Total output tokens: ${totalOut.toLocaleString()}`);
  console.log(`  Approximate cost:    $${usd.toFixed(3)} (~${formatGbp(usd)})`);

  const totalTime = ((Date.now() - startTime) / 1000).toFixed(1);
  console.log("\n  Total time: " + totalTime + "s");
  console.log("\n  ✓ Done. Open the PDF and compare to the Manus Headway proposal.");
  console.log("  → " + OUTPUT_PATH + "\n");
}

main().catch((err) => {
  console.error("\n  ✗ Failed: " + (err as Error).message);
  if ((err as Error).stack) {
    console.error("\n" + (err as Error).stack);
  }
  process.exit(1);
});
