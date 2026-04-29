// Step 3 of the proof pipeline.
//
// Takes the "generate" ChapterSlots from Step 2 and draws them as PDF
// pages using pdf-lib. Output dimensions match the brochure's page size
// so when we splice everything together in Step 4, page sizes are
// consistent (no jarring switches between A5 landscape and A4 portrait).
//
// Typography is deliberately calm and restrained:
//  - Helvetica throughout (StandardFonts — no font-loading risk on Render)
//  - Generous margins
//  - Plain title at top, body below
//  - No decorative elements
//
// The brochure pages provide visual richness; the narrative pages provide
// readability. Contrast is the design.

import { PDFDocument, StandardFonts, rgb, PageSizes, PDFPage, PDFFont } from "pdf-lib";
import type { ChapterSlot } from "./types";

interface PageDimensions {
  width: number;
  height: number;
}

// Layout constants. Tuned for A5 landscape (the Sweetbyte brochure
// dimensions) — about 595 × 421 pts. Margins scale to whatever the
// brochure's actual size is.
function computeLayout(dim: PageDimensions) {
  const marginX = Math.max(dim.width * 0.08, 36);
  const marginTop = Math.max(dim.height * 0.10, 36);
  const marginBottom = Math.max(dim.height * 0.08, 32);
  const contentWidth = dim.width - marginX * 2;
  const contentTop = dim.height - marginTop;
  const contentBottom = marginBottom;
  return { marginX, marginTop, marginBottom, contentWidth, contentTop, contentBottom };
}

/**
 * Word-wrap a paragraph to fit within a given width at a given font/size.
 * Returns an array of lines.
 */
function wrapText(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
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
      // If a single word is wider than maxWidth, just emit it on its own
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines;
}

/**
 * Draw a chapter's title + body across as many pages as needed.
 * Returns the array of pages added (in case the caller wants to track).
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

  const ink = rgb(0.10, 0.10, 0.13); // near-black, soft
  const titleInk = rgb(0.06, 0.06, 0.10);

  // Split body into paragraphs on double newlines
  const paragraphs = body
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter((p) => p.length > 0);

  // Pre-wrap all paragraphs into lines so we know how to flow across pages
  const allLines: Array<{ text: string; isParagraphStart: boolean; isFirstOnChapter: boolean }> = [];
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

  // Draw title on first page
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

    // Need a new page?
    if (y - lineHeight < layout.contentBottom) {
      currentPage = doc.addPage([dim.width, dim.height]);
      pages.push(currentPage);
      y = layout.contentTop;
    }

    // Add a small gap before the start of a new paragraph (except first)
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
 * Draw a stand-in pricing chapter as a simple two-column table.
 * Used for the proof. In the live feature this is replaced by output
 * from the existing pricing engine.
 */
function drawPricingChapter(
  doc: PDFDocument,
  dim: PageDimensions,
  title: string,
  body: string,
  fonts: { regular: PDFFont; bold: PDFFont },
): PDFPage[] {
  // For the proof we render the body as normal narrative — pricing
  // tables are post-D6 work. The body the AI writes will describe the
  // pricing in prose form which is acceptable for proving the angle.
  return drawChapter(doc, dim, title, body, fonts);
}

/**
 * Draw the cover page. Dedicated layout — large title, client name,
 * supplier name, no body text. The body string from the slot is parsed
 * for proposal title (line 1) and prepared-for (line 2).
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

  // Title — wrapped if needed
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

  // Accent line under title
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

/**
 * Render all "generate"-type slots into a single PDF document.
 * Returns the PDF as bytes. The assembly step will splice these
 * generated pages together with the brochure pages.
 *
 * IMPORTANT: we keep a map from slotIndex → array of generated pages
 * (returned alongside the bytes) so the assembler knows which generated
 * pages belong to which slot.
 */
export async function renderNarrativePages(params: {
  slots: ChapterSlot[];
  pageDimensions: PageDimensions;
}): Promise<{
  narrativePdfBytes: Uint8Array;
  /**
   * Maps slotIndex → 0-based page indices in narrativePdfBytes that
   * make up that slot. A multi-page chapter has multiple indices.
   */
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

    const indices: number[] = [];
    let pages: PDFPage[];

    if (slot.slotName === "Cover") {
      const coverPage = drawCover(doc, params.pageDimensions, slot.body, fonts);
      pages = [coverPage];
    } else if (slot.slotName === "Pricing Summary") {
      pages = drawPricingChapter(doc, params.pageDimensions, slot.title, slot.body, fonts);
    } else if (!slot.body || slot.body.trim().length === 0) {
      // Empty body — slot was conditional and the tender didn't trigger it. Skip.
      continue;
    } else {
      pages = drawChapter(doc, params.pageDimensions, slot.title, slot.body, fonts);
    }

    for (let i = 0; i < pages.length; i++) {
      indices.push(runningIndex);
      runningIndex++;
    }
    pageIndexBySlot.set(slot.slotIndex, indices);
  }

  const bytes = await doc.save();
  return { narrativePdfBytes: bytes, pageIndexBySlot };
}
