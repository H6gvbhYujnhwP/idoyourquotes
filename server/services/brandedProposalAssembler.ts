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
  type PDFEmbeddedPage,
  type PDFImage,
} from "pdf-lib";
import type {
  ChapterSlot,
  QuoteContext,
  QuoteContextLineItem,
} from "../engines/brandedProposalEngine";
import { PRICING_SLOT_INDEX } from "../engines/brandedProposalEngine";

interface PageDimensions {
  width: number;
  height: number;
}

// ─── Layout helpers ──────────────────────────────────────────────────

function computeLayout(dim: PageDimensions) {
  // Fixed pt values for A4 portrait business documents
  // (Phase 4B Delivery E.2). The previous height-percentage formula
  // was calibrated for narrative pages that inherited the brochure's
  // native size (typically A5 landscape, ~420pt tall). Once Delivery
  // E.1 forced narrative pages to A4 portrait (842pt tall — exactly
  // 2x taller), every margin and font size doubled with it. We now
  // anchor to absolute values appropriate for A4 portrait. If the
  // target page size ever changes (computeTargetDimensions returns
  // something other than A4 portrait), revisit these.
  const marginX = 48;       // ~17 mm — conventional A4 side margin
  const marginTop = 60;     // ~21 mm
  const marginBottom = 50;  // ~17.5 mm
  return {
    marginX,
    marginTop,
    marginBottom,
    contentWidth: dim.width - marginX * 2,
    contentTop: dim.height - marginTop,
    contentBottom: marginBottom,
  };
}

// ─── A4 sizing & letterboxing — Phase 4B Delivery E ──────────────────
//
// The original assembler (Delivery A) inherited the brochure's page
// dimensions throughout — so a brochure authored at A5 landscape
// produced an A5 landscape proposal, half the size of A4 and
// presentation-feeling rather than business-document-feeling.
//
// Delivery E shifts to: narrative pages always render at A4 PORTRAIT
// regardless of the brochure's native orientation, and embedded
// brochure pages are drawn at their NATIVE size centred on those A4
// portrait pages (letterboxed with white margin around them). No
// upscaling — preserves brochure fidelity perfectly.
//
// Why forced A4 portrait rather than orientation-matched A4:
//   - Conventional business documents are A4 portrait. Customers
//     receiving a quote/proposal expect a vertical document, not a
//     landscape deck.
//   - Brochures are often authored in landscape because they're
//     designed as marketing handouts. The branded proposal is a
//     business document wrapped around a brochure — the document's
//     orientation should match the document's purpose, not the
//     brochure's.
//   - Letterboxing landscape-authored brochure pages onto A4 portrait
//     leaves visible whitespace above/below the embedded page. That's
//     an acceptable trade-off for keeping the document conventional.
//
// Special-case behaviour:
//   - Brochure already A4 portrait → no change (target == source).
//   - Brochure larger than A4 portrait → embed page scales DOWN to fit
//     (preserving aspect ratio) inside the A4 portrait canvas. Never
//     enlarges, so raster content stays sharp.

const A4_WIDTH_PT = 595;   // 210 mm at 72 dpi
const A4_HEIGHT_PT = 842;  // 297 mm at 72 dpi

/**
 * Decide the target page size for the rendered proposal.
 *
 * History:
 *   E   — initially returned orientation-matched A4
 *   E.1 — always returned A4 portrait regardless of brochure shape
 *   E.4 — accepts an orientation choice from the caller. The org
 *         setting is read in the router; the assembler is just
 *         told 'portrait' or 'landscape'. Defaults to portrait so
 *         existing call sites stay correct.
 *
 * Why this is per-org rather than auto-detected:
 *   Customers receiving a quote / proposal expect a portrait business
 *   document by convention. A landscape proposal feels like a deck.
 *   But if the supplier's brochure is landscape and they want their
 *   narrative pages to match, they should be able to opt in. Hence
 *   the per-org override.
 */
function computeTargetDimensions(
  _brochureWidth: number,
  _brochureHeight: number,
  orientation: "portrait" | "landscape" = "portrait",
): PageDimensions {
  if (orientation === "landscape") {
    return { width: A4_HEIGHT_PT, height: A4_WIDTH_PT };
  }
  return { width: A4_WIDTH_PT, height: A4_HEIGHT_PT };
}

/**
 * Draw a brochure page (already embedded into the final doc via
 * embedPdf) onto a fresh target-sized page, scaling to fit the
 * target while preserving aspect ratio. Centred on the target page.
 *
 * Phase 4B Delivery E.8 — switched from no-upscale-only to
 * scale-to-fit-both-ways. The previous rule kept brochure pages at
 * native size when they were smaller than the target, which left
 * visible whitespace around small-format brochures (A5 landscape
 * brochures inside an A4 landscape proposal letterboxed by ~30% on
 * each axis). Scaling up to fill A4 from A5 is a 1.41× factor —
 * small enough that vector content (text, shapes) is unchanged and
 * raster content (logos, photos) softens only marginally. The
 * trade-off favours a full-bleed feel over preserving every pixel
 * of the source raster at 1:1.
 */
function drawBrochurePageLetterboxed(
  targetPage: PDFPage,
  embed: PDFEmbeddedPage,
  sourceWidth: number,
  sourceHeight: number,
  targetWidth: number,
  targetHeight: number,
) {
  // Scale to fit the target on the smaller-axis ratio, preserving
  // aspect. Works in both directions: brochure larger than target
  // (scales down) and brochure smaller than target (scales up).
  const scale = Math.min(
    targetWidth / sourceWidth,
    targetHeight / sourceHeight,
  );
  const drawWidth = sourceWidth * scale;
  const drawHeight = sourceHeight * scale;

  const offsetX = (targetWidth - drawWidth) / 2;
  const offsetY = (targetHeight - drawHeight) / 2;
  targetPage.drawPage(embed, {
    x: offsetX,
    y: offsetY,
    width: drawWidth,
    height: drawHeight,
  });
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

// ─── Brand-colour resolution (Phase 4B Delivery E.4) ─────────────────
//
// The branded proposal pulls in the supplier's brand primary colour
// for narrative chapter titles, the underline beneath those titles,
// and the pricing chapter's accent (section heads + totals strip).
// This makes the narrative pages visually cohere with the brochure
// they sit between.
//
// The colour is resolved by the caller (router) from
// org.brand_extracted_primary_color (preferred — populated by the
// AI brand-extraction pipeline) falling back to org.brand_primary_color
// (logo-pixel extraction). Either may be missing, malformed, or too
// light to read on a white background. We defend against all three.
//
// Fallback chain at draw time:
//   1. Caller supplied a hex string → parse it.
//   2. Parsed colour passes the readability check (luminance ≤ 0.6
//      against white) → use it.
//   3. Otherwise → fall back to the original dark-navy ink.
//
// We don't try to "fix" a too-pale colour by darkening it — that
// produces unpredictable visual results. Better to fall back cleanly.

interface RGB01 {
  r: number; // 0-1
  g: number; // 0-1
  b: number; // 0-1
}

/**
 * Parse a hex colour like "#1A2B3C" or "1A2B3C" or "#abc" (3-char
 * shorthand) into 0-1 floats. Returns null for anything malformed.
 */
function parseHexColour(hex: string | null | undefined): RGB01 | null {
  if (!hex) return null;
  let h = hex.trim().replace(/^#/, "");
  if (h.length === 3) {
    // Expand #abc → #aabbcc
    h = h
      .split("")
      .map((c) => c + c)
      .join("");
  }
  if (h.length !== 6) return null;
  if (!/^[0-9a-fA-F]{6}$/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return { r, g, b };
}

/**
 * WCAG-style relative luminance, returned in 0-1. Used to decide
 * whether the colour reads on white. Standard formula uses sRGB
 * gamma-corrected channel weights; we use the simple 0.299/0.587/0.114
 * approximation here because we only need a rough cutoff, not a
 * contrast-ratio compliance check.
 */
function relativeLuminance(c: RGB01): number {
  return 0.299 * c.r + 0.587 * c.g + 0.114 * c.b;
}

/**
 * Convert a parsed RGB01 to pdf-lib's rgb() ink. Tiny shim for
 * readability at call sites.
 */
function toRgbInk(c: RGB01) {
  return rgb(c.r, c.g, c.b);
}

/**
 * Resolve the brand accent colour for a draw operation.
 * Returns the parsed RGB01 if usable on white, null if missing /
 * malformed / too pale. Callers fall back to their own default ink.
 */
function resolveBrandAccent(brandPrimaryHex: string | null | undefined): RGB01 | null {
  const parsed = parseHexColour(brandPrimaryHex);
  if (!parsed) return null;
  // 0.78 is a deliberately permissive ceiling. Most brand colours
  // pass; only very pale yellows / pinks / mints are caught and
  // diverted to fallback. A stricter 0.6 threshold would fall back
  // for many legitimate mid-tone brand colours.
  if (relativeLuminance(parsed) > 0.78) return null;
  return parsed;
}

// ─── Per-chapter renderers ───────────────────────────────────────────

/**
 * State threaded between consecutive narrative chapters so a short
 * chapter ending mid-page can let the next chapter continue on the
 * same page below a separator instead of forcing a fresh page break.
 *
 * Phase 4B Delivery E.4.2 — added to consolidate whitespace. Earlier
 * deliveries always started each chapter on a new page, which left
 * lots of half-empty pages on a typical 17-chapter proposal.
 */
interface ChapterFlowState {
  page: PDFPage;
  /** Cursor y on `page` where the next chapter could start drawing. */
  y: number;
}

interface DrawChapterResult {
  pages: PDFPage[];
  /** The actual page on which the chapter's last body line was drawn.
   *  May be a flowed-onto page from the previous chapter (in which case
   *  `pages` is empty), or the final page in `pages` if the chapter
   *  spanned multiple. Caller uses this to thread flow state forward. */
  lastPage: PDFPage;
  /** Bottom y on lastPage after body draw — handed to the next
   *  chapter's flowFrom so it can continue on the same page. */
  endY: number;
}

/**
 * Draw a normal chapter (title + multi-paragraph body) across as many
 * pages as needed.
 *
 * Phase 4B Delivery E.4 — accepts an optional brand accent colour.
 *
 * Phase 4B Delivery E.4.2 — accepts an optional `flowFrom` state.
 * When provided AND there is enough space remaining on that page for
 * the chapter title plus a few lines of body, the chapter starts on
 * that page below a thin grey separator rule. Otherwise drawChapter
 * falls back to its original behaviour and starts a fresh page.
 *
 * Returns both the pages added (may be 0 if the chapter flowed
 * entirely onto the prior page!) and the cursor y after the last
 * body line, so the caller can flow the next chapter into the same
 * page if room remains.
 */
function drawChapter(
  doc: PDFDocument,
  dim: PageDimensions,
  title: string,
  body: string,
  fonts: { regular: PDFFont; bold: PDFFont },
  brandAccent?: RGB01 | null,
  flowFrom?: ChapterFlowState | null,
): DrawChapterResult {
  const layout = computeLayout(dim);
  const pages: PDFPage[] = [];

  // Fixed pt sizes for A4 portrait business documents
  // (Phase 4B Delivery E.4 — reduced one notch from E.2's 20/11
  // after live testing showed narrative typography sat heavier than
  // most brochures' body type, making narrative pages feel chunky
  // next to embedded brochure pages). Previously 20/11. Earlier
  // (pre-E.2) these were dim.height * 0.045 / 0.024 — see drawCover
  // for the full E.2 rationale on why height-percentage scaling
  // was wrong for forced A4 portrait.
  const titleSize = 18;
  const bodySize = 10;
  const lineHeight = bodySize * 1.55;
  const paragraphGap = bodySize * 0.7;

  const ink = rgb(0.10, 0.10, 0.13);
  const fallbackTitleInk = rgb(0.06, 0.06, 0.10);
  const fallbackUnderlineInk = rgb(0.45, 0.45, 0.50);
  const separatorRuleColor = rgb(0.85, 0.85, 0.88); // soft grey, deliberately neutral
  // Brand accent if usable, otherwise fall back. Title and underline
  // share a colour intentionally — keeps the chapter heading visually
  // unified and makes the supplier's brand land harder.
  const titleInk = brandAccent ? toRgbInk(brandAccent) : fallbackTitleInk;
  const underlineInk = brandAccent ? toRgbInk(brandAccent) : fallbackUnderlineInk;

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

  // ── Decide: flow onto previous page, or start fresh? ─────────────
  // To flow we need room for the separator + title block + a useful
  // chunk of body. If we'd squeeze on just the title with one line of
  // body, that looks worse than a fresh page. Threshold below targets
  // ~3 body lines minimum after the title block.
  const separatorTopGap = 24;
  const separatorBottomGap = 16;
  const titleBlockHeight = titleSize * 1.6 + titleSize * 0.5; // title + underline gap
  const minBodyHeight = 3 * lineHeight;
  const flowMinSpace =
    separatorTopGap + separatorBottomGap + titleBlockHeight + minBodyHeight;

  let currentPage: PDFPage;
  let y: number;

  if (flowFrom && flowFrom.y - flowMinSpace > layout.contentBottom) {
    // ── Flow path: continue on the prior chapter's page ──────────────
    currentPage = flowFrom.page;
    y = flowFrom.y;

    // Visual separator: gap, thin rule across content width, gap.
    y -= separatorTopGap;
    currentPage.drawLine({
      start: { x: layout.marginX, y },
      end: { x: layout.marginX + layout.contentWidth, y },
      thickness: 0.5,
      color: separatorRuleColor,
    });
    y -= separatorBottomGap;
  } else {
    // ── Fresh-page path: original behaviour ──────────────────────────
    currentPage = doc.addPage([dim.width, dim.height]);
    pages.push(currentPage);
    y = layout.contentTop;
  }

  // Title (same drawing logic regardless of flow vs fresh)
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
    color: underlineInk,
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

  return { pages, lastPage: currentPage, endY: y };
}

/**
 * Cover page — distinct layout from regular chapters. Big title, no
 * underline, supplier/client names below. Body string is parsed for
 * lines: line 1 = proposal title, line 2 = subline (e.g. "for X"),
 * lines 3+ = value statement.
 *
 * Phase 4B Delivery E.3 — accepts an optional pre-embedded company
 * logo image. When present, the logo is drawn centred above the
 * title in the empty band between the top margin and the title's
 * top edge (which currently sits ~38% down the A4 portrait page,
 * leaving ~80mm of vertical whitespace to play with). When absent,
 * the cover renders exactly as before.
 */
function drawCover(
  doc: PDFDocument,
  dim: PageDimensions,
  body: string,
  fonts: { regular: PDFFont; bold: PDFFont },
  logoImage?: PDFImage,
  quoteReference?: string,
  quoteDateStr?: string,
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

  const titleSize = 32;
  const sublineSize = 16;
  const valueSize = 12;
  // Fixed pt sizes for the A4 portrait cover (Phase 4B Delivery E.2).
  // Previously dim.height * 0.075 / 0.035 / 0.025, which produced a
  // 63pt title on A4 portrait — wrapping the proposal title to 4
  // lines instead of 2 and crowding the page. See drawChapter for
  // the same fix's full rationale.

  const inkPrimary = rgb(0.06, 0.06, 0.10);
  const inkSecondary = rgb(0.30, 0.30, 0.35);

  const titleLines = wrapText(proposalTitle, fonts.bold, titleSize, layout.contentWidth);
  const titleBaselineY = dim.height * 0.62;

  // ── Logo (Delivery E.3) ────────────────────────────────────────
  // Draw the supplier's company logo centred horizontally above
  // the title, vertically centred within the band between the top
  // margin and the title's visual top edge. Sized at ~32mm tall
  // (90pt) by default, capped on width for banner-shaped logos.
  // Aspect ratio always preserved.
  if (logoImage) {
    const titleVisualTopY = titleBaselineY + titleSize; // approx top of cap
    const bandTopY = layout.contentTop;                 // top margin line
    const bandBottomY = titleVisualTopY + 24;           // 24pt breathing gap above title

    const maxLogoH = 90;                                // ~32 mm
    const maxLogoW = Math.min(220, layout.contentWidth * 0.5); // ~78 mm cap

    const srcW = logoImage.width;
    const srcH = logoImage.height;
    const aspect = srcW / srcH;

    let logoH = maxLogoH;
    let logoW = maxLogoH * aspect;
    if (logoW > maxLogoW) {
      logoW = maxLogoW;
      logoH = maxLogoW / aspect;
    }
    // Defensive: never enlarge a small logo beyond its natural size.
    if (logoW > srcW && logoH > srcH) {
      logoW = srcW;
      logoH = srcH;
    }

    const bandHeight = bandTopY - bandBottomY;
    if (bandHeight >= logoH) {
      const logoBottomY = bandBottomY + (bandHeight - logoH) / 2;
      const logoLeftX = (dim.width - logoW) / 2;
      page.drawImage(logoImage, {
        x: logoLeftX,
        y: logoBottomY,
        width: logoW,
        height: logoH,
      });
    }
    // If the band can't accommodate the logo at default size (would
    // only happen on a very different page geometry), silently skip
    // rather than overlapping the title. The cover still renders
    // cleanly without the logo.
  }

  let y = titleBaselineY;
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

  // ── Reference + date strip (Delivery E.4.3) ─────────────────────
  // Below the value statement, in muted ink. Only rendered when at
  // least one of the two strings is present. Format: "Q-1234 · 30 April 2026"
  // (separator omitted if only one is given).
  if (quoteReference || quoteDateStr) {
    y -= valueSize * 0.6; // small additional gap before the meta line
    const meta = [quoteReference, quoteDateStr]
      .filter((s) => s && s.trim().length > 0)
      .join("  ·  ");
    page.drawText(meta, {
      x: layout.marginX,
      y,
      size: valueSize * 0.85,
      font: fonts.regular,
      color: inkSecondary,
    });
  }

  return page;
}

// ─── Pricing chapter — Phase 4B Delivery D Phase 3 ───────────────────
//
// Custom renderer for slot 15 (Pricing Summary). Replaces the prose-
// only chapter with a structured layout: short AI intro at the top,
// then real line item tables drawn directly from the quote's line
// items, then a totals strip. The AI is instructed (via slot 15's
// generateGuidance) to write only an intro paragraph and never any
// numbers — the table is the source of truth.
//
// Why this matters:
//   - Numbers in the proposal must match the quote DB exactly. If the
//     user edits a line item and re-renders, the table updates with no
//     AI involvement (no regenerate needed). The intro prose is
//     ornament; the table is contract.
//   - Cadence (one-off vs monthly vs annual vs optional) is visually
//     distinct so a customer can see at a glance what they're
//     committing to. The existing pdfGenerator pipeline does the same
//     split — we match its convention rather than invent a new one.
//   - VAT only applies to the one-off (standard) subtotal, mirroring
//     pdfGenerator's behaviour. Recurring rows display as "+ VAT"
//     since the VAT is per-period and depends on when it's applied.
//
// Pagination: when there are too many line items to fit on one page
// the table flows onto continuation pages. Each continuation page
// re-emits the column header. Totals only appear at the end.

function formatCurrency(value: number): string {
  // £-prefixed, two-decimal, thousands separator. Negative values
  // show as "-£123.45". This matches the existing PDF generator's
  // formatting (see formatCurrency in pdfGenerator.ts).
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  const fixed = abs.toFixed(2);
  const [whole, frac] = fixed.split(".");
  const withSep = whole.replace(/\B(?=(\d{3})+(?!\d))/g, ",");
  return `${sign}£${withSep}.${frac}`;
}

function formatQuantity(value: number): string {
  // Show quantities as integers when they're whole numbers, otherwise
  // up to 2 decimal places. Matches the existing PDF behaviour and
  // avoids "6.00 User" looking odd next to "1 each".
  if (Number.isInteger(value)) return value.toString();
  return value.toFixed(2).replace(/\.?0+$/, "");
}

/**
 * Pull the summary (first line before any "||" or "##" sub-bullet
 * separator) from a line item description. Sub-bullet detail is
 * relevant in the AI's narrative chapters (where it informs scope
 * specifics) but would crowd the pricing table — so the table shows
 * the headline only.
 */
function extractDescriptionSummary(desc: string): string {
  if (!desc) return "";
  const split = desc.split(/\|\||##/);
  return split[0].trim();
}

interface PricingTableColumns {
  descriptionX: number;
  descriptionWidth: number;
  qtyX: number;
  qtyWidth: number;
  unitX: number;
  unitWidth: number;
  rateX: number;
  rateWidth: number;
  totalX: number;
  totalWidth: number;
}

/** Compute column positions inside the chapter content area. */
function buildColumns(layout: ReturnType<typeof computeLayout>): PricingTableColumns {
  const totalWidth = 70;
  const rateWidth = 60;
  const unitWidth = 50;
  const qtyWidth = 40;
  const gap = 8;
  const descriptionWidth =
    layout.contentWidth - totalWidth - rateWidth - unitWidth - qtyWidth - gap * 4;
  const descriptionX = layout.marginX;
  const qtyX = descriptionX + descriptionWidth + gap;
  const unitX = qtyX + qtyWidth + gap;
  const rateX = unitX + unitWidth + gap;
  const totalX = rateX + rateWidth + gap;
  return {
    descriptionX,
    descriptionWidth,
    qtyX,
    qtyWidth,
    unitX,
    unitWidth,
    rateX,
    rateWidth,
    totalX,
    totalWidth,
  };
}

interface RenderState {
  page: PDFPage;
  y: number;
}

/**
 * Right-align text inside a column. pdf-lib's drawText is left-anchored
 * so we measure the rendered width and offset accordingly. Used for
 * Qty (right), Rate (right), and Total (right) columns; description
 * stays left-aligned, unit centred.
 */
function drawTextInColumn(
  page: PDFPage,
  text: string,
  font: PDFFont,
  size: number,
  columnX: number,
  columnWidth: number,
  baselineY: number,
  align: "left" | "right" | "center",
  color: ReturnType<typeof rgb>,
) {
  const width = font.widthOfTextAtSize(text, size);
  let x: number;
  if (align === "right") x = columnX + columnWidth - width;
  else if (align === "center") x = columnX + (columnWidth - width) / 2;
  else x = columnX;
  page.drawText(text, { x, y: baselineY, size, font, color });
}

interface PricingTotals {
  oneOffSubtotal: number;
  monthlySubtotal: number;
  annualSubtotal: number;
  vat: number;
  oneOffWithVat: number;
}

/** Compute totals across the line item groups. VAT applies to the
 *  one-off subtotal only (matching the existing pdfGenerator
 *  convention — recurring services have their VAT applied per-period
 *  and aren't summed into a single number). */
function computeTotals(
  lineItems: QuoteContextLineItem[],
  taxRate: number,
): PricingTotals {
  const oneOff = lineItems
    .filter((li) => li.pricingType === "standard")
    .reduce((s, li) => s + li.total, 0);
  const monthly = lineItems
    .filter((li) => li.pricingType === "monthly")
    .reduce((s, li) => s + li.total, 0);
  const annual = lineItems
    .filter((li) => li.pricingType === "annual")
    .reduce((s, li) => s + li.total, 0);
  const vat = taxRate > 0 ? oneOff * (taxRate / 100) : 0;
  return {
    oneOffSubtotal: oneOff,
    monthlySubtotal: monthly,
    annualSubtotal: annual,
    vat,
    oneOffWithVat: oneOff + vat,
  };
}

function drawPricingChapter(
  doc: PDFDocument,
  dim: PageDimensions,
  introBody: string,
  quoteContext: QuoteContext,
  fonts: { regular: PDFFont; bold: PDFFont },
  brandAccent?: RGB01 | null,
): PDFPage[] {
  const layout = computeLayout(dim);
  const cols = buildColumns(layout);
  const pages: PDFPage[] = [];

  // Fixed pt sizes for A4 portrait pricing chapter
  // (Phase 4B Delivery E.4 — reduced one notch from E.2's 20/13/11/9.5
  // after live testing showed narrative typography felt heavier than
  // most brochures'). Earlier (pre-E.2) these were:
  //   titleSize:   dim.height * 0.045  → ~38pt on A4 portrait
  //   sectionSize: dim.height * 0.028  → ~24pt
  //   bodySize:    dim.height * 0.024  → ~20pt
  //   tableSize:   dim.height * 0.022  → ~19pt
  // See drawChapter for the full E.2 rationale.
  // Section heads are intentionally smaller than the chapter title
  // so they read as sub-sections within the chapter (one-off /
  // monthly recurring / annual / optional) rather than competing
  // with the chapter heading itself.
  const titleSize = 18;
  const sectionSize = 12;
  const bodySize = 10;
  const tableSize = 9;
  const lineHeight = bodySize * 1.55;
  const tableLineHeight = tableSize * 1.6;
  const paragraphGap = bodySize * 0.7;

  const ink = rgb(0.10, 0.10, 0.13);
  const fallbackTitleInk = rgb(0.06, 0.06, 0.10);
  const mutedInk = rgb(0.45, 0.45, 0.50);
  const ruleColor = rgb(0.85, 0.85, 0.88);
  // Phase 4B Delivery E.4 — brand accent for chapter title and the
  // section heads / totals strip. Was hardcoded teal (0.05, 0.58, 0.53)
  // pre-E.4, marked as "matches the brand teal" but actually only
  // matched Sweetbyte's brand. Now resolves from the supplier's own
  // primary colour with a clean fallback.
  const titleInk = brandAccent ? toRgbInk(brandAccent) : fallbackTitleInk;
  const accentColor = brandAccent
    ? toRgbInk(brandAccent)
    : rgb(0.05, 0.58, 0.53); // legacy teal kept as the no-brand fallback

  // ── Page management ─────────────────────────────────────────────
  const newPage = (): PDFPage => {
    const p = doc.addPage([dim.width, dim.height]);
    pages.push(p);
    return p;
  };

  let state: RenderState = { page: newPage(), y: layout.contentTop };

  const ensureSpace = (needed: number) => {
    if (state.y - needed < layout.contentBottom) {
      state = { page: newPage(), y: layout.contentTop };
    }
  };

  // ── Chapter title ───────────────────────────────────────────────
  state.page.drawText("Pricing Summary", {
    x: layout.marginX,
    y: state.y - titleSize,
    size: titleSize,
    font: fonts.bold,
    color: titleInk,
  });
  state.y -= titleSize * 1.6;
  state.page.drawLine({
    start: { x: layout.marginX, y: state.y },
    end: { x: layout.marginX + Math.min(layout.contentWidth * 0.35, 120), y: state.y },
    thickness: 0.75,
    color: mutedInk,
  });
  state.y -= titleSize * 0.5;

  // ── Intro prose ─────────────────────────────────────────────────
  // Cap to a sensible length. The slot 15 prompt asks for 2-3 sentences
  // only, but the assembler is the second line of defence: if the
  // model writes a long body anyway, we truncate at 600 chars to
  // reserve room for the table without losing all of the AI's framing.
  const trimmedIntro = (introBody || "").trim();
  const cappedIntro =
    trimmedIntro.length > 600
      ? trimmedIntro.slice(0, 600).replace(/\s+\S*$/, "") + "…"
      : trimmedIntro;

  if (cappedIntro.length > 0) {
    const introParagraphs = cappedIntro
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter((p) => p.length > 0);

    introParagraphs.forEach((paragraph, idx) => {
      if (idx > 0) state.y -= paragraphGap;
      const wrapped = wrapText(paragraph, fonts.regular, bodySize, layout.contentWidth);
      for (const line of wrapped) {
        ensureSpace(lineHeight);
        state.page.drawText(line, {
          x: layout.marginX,
          y: state.y - bodySize,
          size: bodySize,
          font: fonts.regular,
          color: ink,
        });
        state.y -= lineHeight;
      }
    });
    state.y -= paragraphGap;
  }

  // ── Tables, grouped by pricing type ─────────────────────────────
  const lineItems = quoteContext.lineItems ?? [];
  const groups: Array<{
    label: string;
    totalLabel: string;
    items: QuoteContextLineItem[];
    showSubtotal: boolean;
    excludedFromHeadline: boolean;
  }> = [
    {
      label: "One-off charges",
      totalLabel: "Subtotal (ex VAT)",
      items: lineItems.filter((li) => li.pricingType === "standard"),
      showSubtotal: true,
      excludedFromHeadline: false,
    },
    {
      label: "Monthly recurring services",
      totalLabel: "Monthly total (ex VAT)",
      items: lineItems.filter((li) => li.pricingType === "monthly"),
      showSubtotal: true,
      excludedFromHeadline: false,
    },
    {
      label: "Annual recurring services",
      totalLabel: "Annual total (ex VAT)",
      items: lineItems.filter((li) => li.pricingType === "annual"),
      showSubtotal: true,
      excludedFromHeadline: false,
    },
    {
      label: "Optional add-ons (not included in totals)",
      totalLabel: "",
      items: lineItems.filter((li) => li.pricingType === "optional"),
      showSubtotal: false,
      excludedFromHeadline: true,
    },
  ];

  const drawTableHeader = () => {
    // Column header row — small caps, muted, with a thin rule below.
    const headerY = state.y - tableSize;
    drawTextInColumn(
      state.page,
      "Description",
      fonts.bold,
      tableSize,
      cols.descriptionX,
      cols.descriptionWidth,
      headerY,
      "left",
      mutedInk,
    );
    drawTextInColumn(
      state.page,
      "Qty",
      fonts.bold,
      tableSize,
      cols.qtyX,
      cols.qtyWidth,
      headerY,
      "right",
      mutedInk,
    );
    drawTextInColumn(
      state.page,
      "Unit",
      fonts.bold,
      tableSize,
      cols.unitX,
      cols.unitWidth,
      headerY,
      "center",
      mutedInk,
    );
    drawTextInColumn(
      state.page,
      "Rate",
      fonts.bold,
      tableSize,
      cols.rateX,
      cols.rateWidth,
      headerY,
      "right",
      mutedInk,
    );
    drawTextInColumn(
      state.page,
      "Amount",
      fonts.bold,
      tableSize,
      cols.totalX,
      cols.totalWidth,
      headerY,
      "right",
      mutedInk,
    );
    state.y -= tableLineHeight;
    state.page.drawLine({
      start: { x: layout.marginX, y: state.y + tableSize * 0.2 },
      end: { x: layout.marginX + layout.contentWidth, y: state.y + tableSize * 0.2 },
      thickness: 0.5,
      color: ruleColor,
    });
    state.y -= tableSize * 0.3;
  };

  for (const group of groups) {
    if (group.items.length === 0) continue;

    // Section heading — needs the rest of the heading + at least one row to fit
    ensureSpace(sectionSize * 1.6 + tableLineHeight * 2);

    state.page.drawText(group.label, {
      x: layout.marginX,
      y: state.y - sectionSize,
      size: sectionSize,
      font: fonts.bold,
      color: titleInk,
    });
    state.y -= sectionSize * 1.6;

    drawTableHeader();

    // Rows — each row may need 1 or more lines for description wrapping
    for (const li of group.items) {
      const desc = extractDescriptionSummary(li.description) || "(no description)";
      const wrappedDesc = wrapText(desc, fonts.regular, tableSize, cols.descriptionWidth);
      const rowHeight = tableLineHeight * wrappedDesc.length;

      // Page break BEFORE drawing the row if it won't fit. Re-emit
      // header on the new page so the table reads coherently.
      if (state.y - rowHeight < layout.contentBottom) {
        state = { page: newPage(), y: layout.contentTop };
        drawTableHeader();
      }

      // Description (may wrap across multiple lines)
      const rowTopY = state.y;
      wrappedDesc.forEach((line, lineIdx) => {
        state.page.drawText(line, {
          x: cols.descriptionX,
          y: rowTopY - tableSize - lineIdx * tableLineHeight,
          size: tableSize,
          font: fonts.regular,
          color: ink,
        });
      });
      // Qty / Unit / Rate / Total — drawn on the first line only
      const firstLineY = rowTopY - tableSize;
      drawTextInColumn(
        state.page,
        formatQuantity(li.quantity),
        fonts.regular,
        tableSize,
        cols.qtyX,
        cols.qtyWidth,
        firstLineY,
        "right",
        ink,
      );
      drawTextInColumn(
        state.page,
        li.unit || "each",
        fonts.regular,
        tableSize,
        cols.unitX,
        cols.unitWidth,
        firstLineY,
        "center",
        mutedInk,
      );
      drawTextInColumn(
        state.page,
        formatCurrency(li.rate),
        fonts.regular,
        tableSize,
        cols.rateX,
        cols.rateWidth,
        firstLineY,
        "right",
        ink,
      );
      drawTextInColumn(
        state.page,
        formatCurrency(li.total),
        fonts.bold,
        tableSize,
        cols.totalX,
        cols.totalWidth,
        firstLineY,
        "right",
        accentColor,
      );

      state.y -= rowHeight;

      // Faint row separator
      state.page.drawLine({
        start: { x: layout.marginX, y: state.y + tableSize * 0.15 },
        end: { x: layout.marginX + layout.contentWidth, y: state.y + tableSize * 0.15 },
        thickness: 0.25,
        color: ruleColor,
      });
      state.y -= tableSize * 0.25;
    }

    // Group subtotal
    if (group.showSubtotal) {
      ensureSpace(tableLineHeight * 1.4);
      const subtotal = group.items.reduce((s, li) => s + li.total, 0);
      const labelX = cols.rateX;
      const labelWidth = cols.rateWidth + cols.totalWidth + 8;
      drawTextInColumn(
        state.page,
        group.totalLabel,
        fonts.bold,
        tableSize,
        labelX,
        labelWidth - cols.totalWidth - 8,
        state.y - tableSize,
        "right",
        mutedInk,
      );
      drawTextInColumn(
        state.page,
        formatCurrency(subtotal),
        fonts.bold,
        tableSize,
        cols.totalX,
        cols.totalWidth,
        state.y - tableSize,
        "right",
        titleInk,
      );
      state.y -= tableLineHeight * 1.2;
    }

    // Spacing between groups
    state.y -= paragraphGap;
  }

  // ── Headline totals strip ───────────────────────────────────────
  // Always rendered (even if only one group exists) so the customer
  // gets a clear "what do I pay" summary at the bottom. VAT and
  // total-including-VAT only appear when there are one-off items
  // (recurring totals don't get summed into a single grand total here
  // — the cadence matters too much to flatten).
  const totals = computeTotals(lineItems, quoteContext.taxRate ?? 0);

  if (totals.oneOffSubtotal > 0 && (quoteContext.taxRate ?? 0) > 0) {
    ensureSpace(tableLineHeight * 3);

    // Visual strip on the right — three rows of label + value.
    const stripLabelX = cols.rateX - 60;
    const stripLabelWidth = cols.rateWidth + cols.totalWidth + 60 - cols.totalWidth - 8;

    const drawStripRow = (
      label: string,
      value: string,
      bold: boolean,
      color: ReturnType<typeof rgb>,
    ) => {
      const f = bold ? fonts.bold : fonts.regular;
      drawTextInColumn(
        state.page,
        label,
        f,
        tableSize,
        stripLabelX,
        stripLabelWidth,
        state.y - tableSize,
        "right",
        bold ? titleInk : mutedInk,
      );
      drawTextInColumn(
        state.page,
        value,
        fonts.bold,
        tableSize,
        cols.totalX,
        cols.totalWidth,
        state.y - tableSize,
        "right",
        color,
      );
      state.y -= tableLineHeight;
    };

    // Top rule on the strip
    state.page.drawLine({
      start: { x: stripLabelX, y: state.y },
      end: { x: cols.totalX + cols.totalWidth, y: state.y },
      thickness: 0.5,
      color: ruleColor,
    });
    state.y -= tableSize * 0.4;

    drawStripRow(
      "Subtotal (one-off, ex VAT)",
      formatCurrency(totals.oneOffSubtotal),
      false,
      ink,
    );
    drawStripRow(
      `VAT (${quoteContext.taxRate}%)`,
      formatCurrency(totals.vat),
      false,
      ink,
    );
    drawStripRow(
      "Total one-off (inc VAT)",
      formatCurrency(totals.oneOffWithVat),
      true,
      accentColor,
    );

    // Recurring summary lines underneath — separate because they're
    // per-period, not summed into the headline.
    if (totals.monthlySubtotal > 0) {
      drawStripRow(
        "Monthly recurring (ex VAT)",
        formatCurrency(totals.monthlySubtotal) + " / month",
        true,
        accentColor,
      );
    }
    if (totals.annualSubtotal > 0) {
      drawStripRow(
        "Annual recurring (ex VAT)",
        formatCurrency(totals.annualSubtotal) + " / year",
        true,
        accentColor,
      );
    }
  } else if (lineItems.length > 0) {
    // No VAT case — just the three recurring/one-off subtotals.
    ensureSpace(tableLineHeight * 2);
    state.page.drawLine({
      start: { x: cols.rateX - 60, y: state.y },
      end: { x: cols.totalX + cols.totalWidth, y: state.y },
      thickness: 0.5,
      color: ruleColor,
    });
    state.y -= tableSize * 0.4;
    if (totals.oneOffSubtotal > 0) {
      drawTextInColumn(
        state.page,
        "Total one-off",
        fonts.bold,
        tableSize,
        cols.rateX - 60,
        cols.rateWidth + 60 - 8,
        state.y - tableSize,
        "right",
        titleInk,
      );
      drawTextInColumn(
        state.page,
        formatCurrency(totals.oneOffSubtotal),
        fonts.bold,
        tableSize,
        cols.totalX,
        cols.totalWidth,
        state.y - tableSize,
        "right",
        accentColor,
      );
      state.y -= tableLineHeight;
    }
  }

  return pages;
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
  quoteContext?: QuoteContext;
  /**
   * Phase 4B Delivery E.3 — supplier company logo bytes. Already
   * normalised to PNG or JPEG by the caller (or absent). The bytes
   * are embedded once here and the resulting PDFImage is handed to
   * drawCover. Optional — when missing, the cover renders without
   * a logo and behaves exactly as it did pre-E.3.
   */
  companyLogoBytes?: Uint8Array;
  /**
   * 'png' | 'jpeg' — tells us which pdf-lib embed function to use.
   * Required when companyLogoBytes is provided.
   */
  companyLogoFormat?: "png" | "jpeg";
  /**
   * Phase 4B Delivery E.4 — supplier brand primary colour as a hex
   * string (e.g. "#FF6B35"). Resolved once via resolveBrandAccent
   * and used to tint chapter titles, the underline, and the pricing
   * accent. Optional and silently fallback-on-bad: missing, malformed,
   * or too-pale colours produce the same render as pre-E.4.
   */
  brandPrimaryHex?: string;
  /**
   * Phase 4B Delivery E.4.3 — quote reference + formatted date string
   * for rendering on the Title Page slot (e.g. "Q-1234" + "30 April
   * 2026"). Both optional; drawCover renders gracefully when absent.
   */
  quoteReference?: string;
  quoteDateStr?: string;
}): Promise<{
  narrativePdfBytes: Uint8Array;
  pageIndexBySlot: Map<number, number[]>;
}> {
  const doc = await PDFDocument.create();
  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const fonts = { regular, bold };

  // Embed the logo once, defensively. Any failure here is logged
  // and downgraded to "no logo" rather than failing the whole
  // render — a corrupt or unexpectedly-formatted logo file must
  // never block a paid customer's proposal.
  let logoImage: PDFImage | undefined = undefined;
  if (params.companyLogoBytes && params.companyLogoFormat) {
    try {
      logoImage =
        params.companyLogoFormat === "png"
          ? await doc.embedPng(params.companyLogoBytes)
          : await doc.embedJpg(params.companyLogoBytes);
    } catch (err) {
      console.warn(
        "[brandedProposalAssembler] Failed to embed company logo, rendering without it:",
        err,
      );
      logoImage = undefined;
    }
  }

  // Phase 4B Delivery E.4 — resolve the brand accent once. resolveBrandAccent
  // returns null for missing / malformed / too-pale colours; downstream
  // drawers fall back gracefully.
  const brandAccent = resolveBrandAccent(params.brandPrimaryHex);

  const pageIndexBySlot = new Map<number, number[]>();
  let runningIndex = 0;

  // Phase 4B Delivery E.4.2 — flow state for chapter consolidation.
  // When a short narrative chapter ends mid-page, the next narrative
  // chapter (if it's the immediately-following slot in slot order)
  // can flow onto the same page below a thin separator instead of
  // forcing a fresh page break. Reset to null whenever flow must
  // break: cover, pricing chapter, or an embed slot in between.
  let flowState: ChapterFlowState | null = null;

  // Slot 15 (Pricing Summary) gets the structured renderer when we
  // have line items to draw from. If lineItems is empty (legacy
  // quotes, partial data), fall back to the prose-only drawChapter
  // path so the proposal still renders coherently.
  const hasLineItems =
    !!params.quoteContext?.lineItems &&
    params.quoteContext.lineItems.length > 0;

  for (const slot of params.slots) {
    if (slot.source !== "generate") {
      // Embed slot — splits narrative. Break flow so the next narrative
      // chapter starts on a fresh page (it'll render on a NEW narrative
      // page in renderNarrativePages, then assembleBrandedProposal
      // splices the brochure pages between them).
      flowState = null;
      continue;
    }

    let pages: PDFPage[];
    if (slot.slotName === "Title Page") {
      // Phase 4B Delivery E.4.3 — Title Page replaces the old Cover
      // slot. Brochure page 1 is now the actual cover (handled via
      // standard embed letterboxing in assembleBrandedProposal).
      // Title Page is the formal "Proposal for X" page that follows
      // immediately after, drawn here as a generated page with the
      // company logo from Settings, the AI-generated title and value
      // statement, plus the quote reference and date.
      flowState = null;
      pages = [
        drawCover(
          doc,
          params.pageDimensions,
          slot.body,
          fonts,
          logoImage,
          params.quoteReference,
          params.quoteDateStr,
        ),
      ];
    } else if (
      slot.slotIndex === PRICING_SLOT_INDEX &&
      hasLineItems &&
      params.quoteContext
    ) {
      // Phase 4B Delivery D Phase 3 — structured pricing chapter.
      // The AI body is the intro prose; the table comes from the DB.
      // Pricing manages its own pages via tables and section heads;
      // doesn't share the flow model.
      flowState = null;
      pages = drawPricingChapter(
        doc,
        params.pageDimensions,
        slot.body,
        params.quoteContext,
        fonts,
        brandAccent,
      );
    } else if (!slot.body || slot.body.trim().length === 0) {
      // Empty body = conditional slot the tender didn't trigger. Skip
      // without breaking flow — the previous chapter's flowState is
      // still valid for whichever narrative chapter comes next.
      continue;
    } else {
      // Phase 4B Delivery E.4.2 — narrative chapters flow consecutively.
      // drawChapter checks if there's room on the previous chapter's
      // last page and either continues there below a thin separator,
      // or starts a fresh page. Threshold: title block + 3 body lines.
      const result = drawChapter(
        doc,
        params.pageDimensions,
        slot.title,
        slot.body,
        fonts,
        brandAccent,
        flowState,
      );
      pages = result.pages;
      flowState = { page: result.lastPage, y: result.endY };
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
  /**
   * Phase 4B Delivery E.3 — supplier company logo bytes for the cover.
   * Caller is responsible for fetching from storage AND for normalising
   * to PNG or JPEG (sharp does this for non-PNG/JPEG uploads such as
   * SVG, WEBP). companyLogoFormat tells us which embed function to use.
   *
   * Both fields optional. When absent, the cover renders without a
   * logo (same as it did pre-E.3). Any embed failure is also downgraded
   * to "no logo" — a corrupt logo file never blocks the render.
   */
  companyLogoBytes?: Uint8Array;
  companyLogoFormat?: "png" | "jpeg";
  /**
   * Phase 4B Delivery E.4 — supplier brand primary colour as a hex
   * string (e.g. "#FF6B35"). Caller is responsible for resolving
   * which org field to read from (extracted vs logo-pixel). The
   * assembler validates and falls back if missing / malformed /
   * too pale to read on white. Optional.
   */
  brandPrimaryHex?: string;
  /**
   * Phase 4B Delivery E.4 — page orientation for the rendered
   * proposal. 'portrait' (default) keeps the existing A4 portrait
   * behaviour. 'landscape' produces an A4 landscape proposal —
   * narrative pages are laid out landscape and brochure pages
   * letterbox onto landscape canvases. Caller resolves the org
   * setting (with its 'auto' option) to one of the two values
   * before calling.
   */
  targetOrientation?: "portrait" | "landscape";
  /**
   * Phase 4B Delivery E.4.3 — quote reference (e.g. "Q-1234") and
   * formatted date string (e.g. "30 April 2026") for rendering on
   * the Title Page slot. Caller resolves these from the quote record
   * and current date. Both optional; drawCover renders gracefully
   * when absent.
   */
  quoteReference?: string;
  quoteDateStr?: string;
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
  // Step 1: detect brochure dimensions, decide target output dimensions.
  // Phase 4B Delivery E — output is always A4 (in matching orientation)
  // when the brochure is smaller than A4. Brochure pages embed at
  // native size, centred and letterboxed onto A4. Never upscale.
  const brochureDoc = await PDFDocument.load(params.brochurePdfBytes);
  const firstPage = brochureDoc.getPage(0);
  const { width: brochureWidth, height: brochureHeight } = firstPage.getSize();
  const sourceDim: PageDimensions = {
    width: brochureWidth,
    height: brochureHeight,
  };
  const targetDim = computeTargetDimensions(
    brochureWidth,
    brochureHeight,
    params.targetOrientation ?? "portrait",
  );

  // If target equals source the dimensions match — fall back to the
  // original copyPages path (cheaper than embedPdf and avoids any
  // chance of subtle rendering differences for the no-op case).
  const needsLetterbox =
    targetDim.width !== sourceDim.width || targetDim.height !== sourceDim.height;

  // Step 2: render narrative pages at TARGET dimensions
  // Phase 4B Delivery D Phase 3 — quoteContext flows in so slot 15
  // (Pricing Summary) can draw the structured pricing table from the
  // line items rather than relying on the AI's prose alone.
  // Phase 4B Delivery E.3 — companyLogoBytes / companyLogoFormat flow
  // in so the cover can render the supplier's logo above the title.
  // Phase 4B Delivery E.4 — brandPrimaryHex flows in so chapter titles,
  // the underline, and the pricing accent pick up the supplier's brand.
  const { narrativePdfBytes, pageIndexBySlot } = await renderNarrativePages({
    slots: params.slots,
    pageDimensions: targetDim,
    quoteContext: params.quoteContext,
    companyLogoBytes: params.companyLogoBytes,
    companyLogoFormat: params.companyLogoFormat,
    brandPrimaryHex: params.brandPrimaryHex,
    quoteReference: params.quoteReference,
    quoteDateStr: params.quoteDateStr,
  });

  // Step 3: assemble final PDF
  const finalDoc = await PDFDocument.create();
  const narrativeDoc = await PDFDocument.load(narrativePdfBytes);

  // Pre-collect the source-page indices we'll need from each source.
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

  // Phase 4B Delivery E — branch the brochure-page handling based on
  // whether we're letterboxing.
  //   - Letterbox path: embedPdf gives PDFEmbeddedPage objects we draw
  //     onto fresh target-sized pages. Lets us position the brochure
  //     content anywhere on the target canvas at any (downscaled) size.
  //   - Pass-through path: copyPages preserves dimensions as before.
  //     Used when the brochure is already at A4, or larger than A4.
  let copiedBrochurePages: PDFPage[] = [];
  let embeddedBrochurePages: PDFEmbeddedPage[] = [];

  if (needsLetterbox && brochureIndicesArr.length > 0) {
    // embedPdf accepts the raw bytes + indices and returns
    // PDFEmbeddedPage[] in the same order. These can be drawn onto
    // any target page at any size.
    embeddedBrochurePages = await finalDoc.embedPdf(
      params.brochurePdfBytes,
      brochureIndicesArr,
    );
  } else if (brochureIndicesArr.length > 0) {
    copiedBrochurePages = await finalDoc.copyPages(
      brochureDoc,
      brochureIndicesArr,
    );
  }

  const copiedNarrativePages =
    narrativeIndicesArr.length > 0
      ? await finalDoc.copyPages(narrativeDoc, narrativeIndicesArr)
      : [];

  // Lookup tables: source-index → either a copied PDFPage (pass-through)
  // OR a PDFEmbeddedPage (letterbox path). We don't unify the type
  // because the consumer below dispatches on whether we're letterboxing.
  const brochureCopiedByIdx = new Map<number, PDFPage>();
  const brochureEmbedByIdx = new Map<number, PDFEmbeddedPage>();
  brochureIndicesArr.forEach((srcIdx, i) => {
    if (needsLetterbox) {
      brochureEmbedByIdx.set(srcIdx, embeddedBrochurePages[i]);
    } else {
      brochureCopiedByIdx.set(srcIdx, copiedBrochurePages[i]);
    }
  });
  const narrativePageByIdx = new Map<number, PDFPage>();
  narrativeIndicesArr.forEach((srcIdx, i) => {
    narrativePageByIdx.set(srcIdx, copiedNarrativePages[i]);
  });

  // Add pages to finalDoc in slot order
  for (const slot of params.slots) {
    if (slot.source === "embed") {
      const srcIdx = slot.brochurePageNumber - 1;
      if (needsLetterbox) {
        const embed = brochureEmbedByIdx.get(srcIdx);
        if (embed) {
          // Read this specific page's dimensions — defensive against
          // brochures that mix page sizes (rare but legal in PDF).
          const srcPage = brochureDoc.getPage(srcIdx);
          const { width: srcW, height: srcH } = srcPage.getSize();
          const targetPage = finalDoc.addPage([targetDim.width, targetDim.height]);
          drawBrochurePageLetterboxed(
            targetPage,
            embed,
            srcW,
            srcH,
            targetDim.width,
            targetDim.height,
          );
        }
      } else {
        const page = brochureCopiedByIdx.get(srcIdx);
        if (page) finalDoc.addPage(page);
      }
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
