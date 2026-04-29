/**
 * Branded proposal assembler.
 *
 * Phase 4B Delivery A. Takes the engine's chapter slots + the
 * brochure file (loaded from R2 by the calling endpoint) and produces
 * the final PDF as a Uint8Array buffer.
 *
 * Two parts:
 *   1. Render generated narrative chapters to a single PDF using
 *      pdf-lib's StandardFonts. Page dimensions match the brochure's
 *      so embed/generated transitions don't jar.
 *   2. Splice: pdf-lib's copyPages() copies brochure pages verbatim
 *      from the source PDF into the final PDF at embed slots, and
 *      narrative pages from the just-rendered PDF at generate slots.
 *      No rasterisation — embedded brochure pages preserve every
 *      pixel of the original at full PDF fidelity.
 *
 * No AI calls happen in this module. The engine has already done all
 * the writing; the assembler is pure layout and PDF manipulation.
 *
 * Ported from scripts/branded-proof/src/renderNarrativePages.ts and
 * scripts/branded-proof/src/assembleFinalPdf.ts. Same approach,
 * combined into one module so the calling endpoint only has one
 * import.
 */

import {
  PDFDocument,
  StandardFonts,
  rgb,
  type PDFPage,
  type PDFFont,
} from "pdf-lib";
import type { ChapterSlot, QuoteContext } from "../engines/brandedProposalEngine";

interface PageDimensions {
  width: number;
  height: number;
}

// ─── Layout helpers ──────────────────────────────────────────────────

function computeLayout(dim: PageDimensions) {
  const marginX = Math.max(dim.width * 0.08, 36);
  const marginTop = Math.max(dim.height * 0.10, 36);
  const marginBottom = Math.max(dim.height * 0.08, 32);
  return {
    marginX,
    marginTop,
    marginBottom,
    contentWidth: dim.width - marginX * 2,
    contentTop: dim.height - marginTop,
    contentBottom: marginBottom,
  };
}

/**
 * Word-wrap text to a given width at a given font/size. Returns line
 * array. Words longer than maxWidth get emitted on their own line.
 */
function wrapText(text: string, font: PDFFont, size: number, maxWidth: number): string[] {
  const words = text.split(/\s+/).filter((w) => w.length > 0);
  const lines: string[] = [];
  let current = "";

  for (const word of words) {
    const trial = current ? `${current} ${word}` : word;
    const trialWidth = font.widthOfTextAtSize(trial, size);
    if (trialWidth <= maxWidth) {
      current = trial;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

// ─── Per-chapter renderers ───────────────────────────────────────────

/**
 * Draw a normal chapter (title + multi-paragraph body) across as many
 * pages as needed. Returns the array of pages added.
 */
function drawChapter(
  doc: PDFDocument,
  dim: PageDimensions,
  title: string,
  body: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): PDFPage[] {
  const layout = computeLayout(dim);
  const pages: PDFPage[] = [];

  const titleSize = Math.max(dim.height * 0.045, 18);
  const bodySize = Math.max(dim.height * 0.024, 10);
  const lineHeight = bodySize * 1.55;
  const paragraphGap = bodySize * 0.7;

  const ink = rgb(0.10, 0.10, 0.13);
  const titleInk = rgb(0.06, 0.06, 0.10);

  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  // Pre-wrap all paragraphs into individual lines + flow markers
  const allLines: Array<{
    text: string;
    isParagraphStart: boolean;
    isFirstOnChapter: boolean;
  }> = [];
  paragraphs.forEach((p, idx) => {
    const wrapped = wrapText(p, fonts.regular, bodySize, layout.contentWidth);
    wrapped.forEach((line, lineIdx) => {
      allLines.push({
        text: line,
        isParagraphStart: lineIdx === 0,
        isFirstOnChapter: idx === 0 && lineIdx === 0,
      });
    });
  });

  let currentPage = doc.addPage([dim.width, dim.height]);
  pages.push(currentPage);
  let y = layout.contentTop;

  // Title at top of first chapter page
  currentPage.drawText(title, {
    x: layout.marginX,
    y: y - titleSize,
    size: titleSize,
    font: fonts.bold,
    color: titleInk,
  });
  y -= titleSize * 1.6;

  // Thin underline beneath title
  currentPage.drawLine({
    start: { x: layout.marginX, y },
    end: { x: layout.marginX + Math.min(layout.contentWidth * 0.35, 120), y },
    thickness: 0.75,
    color: rgb(0.45, 0.45, 0.50),
  });
  y -= titleSize * 0.5;

  for (let i = 0; i < allLines.length; i++) {
    const line = allLines[i];

    // New page if we'd overflow
    if (y - lineHeight < layout.contentBottom) {
      currentPage = doc.addPage([dim.width, dim.height]);
      pages.push(currentPage);
      y = layout.contentTop;
    }

    // Gap before new paragraph (except first on chapter)
    if (line.isParagraphStart && !line.isFirstOnChapter) {
      y -= paragraphGap;
      if (y - lineHeight < layout.contentBottom) {
        currentPage = doc.addPage([dim.width, dim.height]);
        pages.push(currentPage);
        y = layout.contentTop;
      }
    }

    currentPage.drawText(line.text, {
      x: layout.marginX,
      y: y - bodySize,
      size: bodySize,
      font: fonts.regular,
      color: ink,
    });
    y -= lineHeight;
  }

  return pages;
}

/**
 * Cover page — distinct layout from regular chapters. Big title, no
 * underline, supplier/client names below. Body string is parsed for
 * lines: line 1 = proposal title, line 2 = subline (e.g. "for X"),
 * lines 3+ = value statement.
 */
function drawCover(
  doc: PDFDocument,
  dim: PageDimensions,
  body: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): PDFPage {
  const page = doc.addPage([dim.width, dim.height]);
  const layout = computeLayout(dim);

  const lines = body
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => l.length > 0);

  const proposalTitle = lines[0] ?? "Service Proposal";
  const subline = lines[1] ?? "";
  const valueLine = lines.slice(2).join(" ").trim();

  const titleSize = Math.max(dim.height * 0.075, 28);
  const sublineSize = Math.max(dim.height * 0.035, 14);
  const valueSize = Math.max(dim.height * 0.025, 11);

  const inkPrimary = rgb(0.06, 0.06, 0.10);
  const inkSecondary = rgb(0.30, 0.30, 0.35);

  const titleLines = wrapText(proposalTitle, fonts.bold, titleSize, layout.contentWidth);
  let y = dim.height * 0.62;
  for (const line of titleLines) {
    page.drawText(line, {
      x: layout.marginX,
      y,
      size: titleSize,
      font: fonts.bold,
      color: inkPrimary,
    });
    y -= titleSize * 1.15;
  }

  page.drawLine({
    start: { x: layout.marginX, y: y + 4 },
    end: { x: layout.marginX + Math.min(layout.contentWidth * 0.25, 100), y: y + 4 },
    thickness: 1.5,
    color: rgb(0.28, 0.32, 0.55),
  });
  y -= titleSize * 0.6;

  if (subline) {
    page.drawText(subline, {
      x: layout.marginX,
      y,
      size: sublineSize,
      font: fonts.regular,
      color: inkSecondary,
    });
    y -= sublineSize * 1.6;
  }

  if (valueLine) {
    const valueLines = wrapText(valueLine, fonts.regular, valueSize, layout.contentWidth * 0.85);
    for (const line of valueLines) {
      page.drawText(line, {
        x: layout.marginX,
        y,
        size: valueSize,
        font: fonts.regular,
        color: inkSecondary,
      });
      y -= valueSize * 1.5;
    }
  }

  return page;
}

// ─── Render narrative half ───────────────────────────────────────────

/**
 * Render all "generate"-type slots into a fresh in-memory PDF. The
 * assembler later splices these pages into the final PDF alongside
 * embedded brochure pages.
 *
 * Returns the rendered PDF bytes plus a map from slotIndex to the
 * 0-based page indices in those bytes that belong to that slot. A
 * multi-page chapter occupies multiple indices.
 */
async function renderNarrativePages(params: {
  slots: ChapterSlot[];
  pageDimensions: PageDimensions;
}): Promise<{
  narrativePdfBytes: Uint8Array;
  pageIndexBySlot: Map<number, number[]>;
}> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  const pageIndexBySlot = new Map<number, number[]>();
  let runningIndex = 0;

  for (const slot of params.slots) {
    if (slot.source !== "generate") continue;

    let pages: PDFPage[];
    if (slot.slotName === "Cover") {
      pages = [drawCover(doc, params.pageDimensions, slot.body, fonts)];
    } else if (!slot.body || slot.body.trim().length === 0) {
      // Empty body = conditional slot the tender didn't trigger. Skip.
      continue;
    } else {
      pages = drawChapter(doc, params.pageDimensions, slot.title, slot.body, fonts);
    }

    const indices: number[] = [];
    for (let i = 0; i < pages.length; i++) {
      indices.push(runningIndex);
      runningIndex++;
    }
    pageIndexBySlot.set(slot.slotIndex, indices);
  }

  const bytes = await doc.save();
  return { narrativePdfBytes: bytes, pageIndexBySlot };
}

// ─── Public entry point ──────────────────────────────────────────────

export interface AssembleParams {
  /** Bytes of the source brochure PDF (loaded from R2 by the caller). */
  brochurePdfBytes: Uint8Array;
  /** Chapter slots from generateBrandedProposalDraft(). */
  slots: ChapterSlot[];
  /**
   * Phase 4B Delivery D Phase 1 — structured data from the quote
   * record (clientName, reference, taxRate, line items, etc.).
   * Optional. Phase 1 receives but does not render this; Phase 3 will
   * use the line items to draw a real pricing table for slot 15
   * (Pricing Summary) instead of relying on the AI's prose-only
   * placeholder.
   */
  quoteContext?: QuoteContext;
}

/**
 * Build the final branded proposal PDF.
 *
 * Steps:
 *   1. Detect brochure page dimensions (final PDF uses these throughout).
 *   2. Render narrative chapters to an in-memory PDF.
 *   3. copyPages() to splice brochure pages and narrative pages into a
 *      single final PDF in slot order.
 *
 * Output: PDF bytes ready to write to R2 or stream to the client.
 *
 * Typical timing for a 28-page brochure with ~17 narrative chapters:
 *   - Brochure load + dim detect: <50ms
 *   - Narrative render: ~200-500ms
 *   - Assembly (copyPages): ~200-500ms
 *   - Total: well under 2 seconds
 *
 * (The bulk of "Render PDF" wall time is the engine's Claude calls,
 *  which already happened by the time this is invoked.)
 */
export async function assembleBrandedProposal(
  params: AssembleParams,
): Promise<Uint8Array> {
  // Phase 4B Delivery D Phase 1 plumbing log — confirms in Render logs
  // that the router is passing the new context through to the
  // assembler. Removed in Phase 3 once the line items are actively
  // consumed to render the pricing table.
  if (params.quoteContext) {
    const qc = params.quoteContext;
    console.log(
      `[brandedProposal] assemble received quoteContext: client="${qc.clientName ?? ""}", ref="${qc.reference ?? ""}", taxRate=${qc.taxRate ?? 0}, lineItems=${qc.lineItems?.length ?? 0}`,
    );
  }

  // Step 1: detect dimensions
  const brochureDoc = await PDFDocument.load(params.brochurePdfBytes);
  const firstPage = brochureDoc.getPage(0);
  const { width, height } = firstPage.getSize();
  const dim: PageDimensions = { width, height };

  // Step 2: render narrative pages
  const { narrativePdfBytes, pageIndexBySlot } = await renderNarrativePages({
    slots: params.slots,
    pageDimensions: dim,
  });

  // Step 3: assemble final PDF
  const finalDoc = await PDFDocument.create();
  const narrativeDoc = await PDFDocument.load(narrativePdfBytes);

  // Pre-collect the source-page indices we'll need from each source
  // (cheaper than calling copyPages once per page).
  const brochurePagesNeeded = new Set<number>();
  const narrativePagesNeeded = new Set<number>();

  for (const slot of params.slots) {
    if (slot.source === "embed") {
      brochurePagesNeeded.add(slot.brochurePageNumber - 1); // 1-indexed → 0-indexed
    } else {
      const indices = pageIndexBySlot.get(slot.slotIndex) ?? [];
      indices.forEach((idx) => narrativePagesNeeded.add(idx));
    }
  }

  // Validate brochure page indices are in range
  const brochurePageCount = brochureDoc.getPageCount();
  Array.from(brochurePagesNeeded).forEach((idx) => {
    if (idx < 0 || idx >= brochurePageCount) {
      throw new Error(
        `Brochure page index ${idx} out of range (brochure has ${brochurePageCount} pages)`,
      );
    }
  });

  const brochureIndicesArr = Array.from(brochurePagesNeeded).sort((a, b) => a - b);
  const narrativeIndicesArr = Array.from(narrativePagesNeeded).sort((a, b) => a - b);

  const copiedBrochurePages =
    brochureIndicesArr.length > 0
      ? await finalDoc.copyPages(brochureDoc, brochureIndicesArr)
      : [];
  const copiedNarrativePages =
    narrativeIndicesArr.length > 0
      ? await finalDoc.copyPages(narrativeDoc, narrativeIndicesArr)
      : [];

  // Lookup tables: source-index → copied page object
  const brochurePageByIdx = new Map<number, any>();
  brochureIndicesArr.forEach((srcIdx, i) => {
    brochurePageByIdx.set(srcIdx, copiedBrochurePages[i]);
  });
  const narrativePageByIdx = new Map<number, any>();
  narrativeIndicesArr.forEach((srcIdx, i) => {
    narrativePageByIdx.set(srcIdx, copiedNarrativePages[i]);
  });

  // Add pages to finalDoc in slot order
  for (const slot of params.slots) {
    if (slot.source === "embed") {
      const srcIdx = slot.brochurePageNumber - 1;
      const page = brochurePageByIdx.get(srcIdx);
      if (page) finalDoc.addPage(page);
    } else {
      const indices = pageIndexBySlot.get(slot.slotIndex) ?? [];
      for (const idx of indices) {
        const page = narrativePageByIdx.get(idx);
        if (page) finalDoc.addPage(page);
      }
    }
  }

  return finalDoc.save();
}
