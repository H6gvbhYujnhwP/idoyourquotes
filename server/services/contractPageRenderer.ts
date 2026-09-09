/**
 * contractPageRenderer.ts
 *
 * Contract-button delivery, stage 2c — draws the pages that exist on a
 * contract but never on a proposal:
 *
 *   1. The numbered Terms & Conditions, flowing across as many pages as
 *      the clauses need (Sweetbyte's live documents run to three).
 *   2. The acceptance page: commencement date and monthly fee, the
 *      provider signature block with the signature image, and the
 *      customer signature block left blank to sign.
 *   3. The closing thank-you line.
 *
 * WHY A SEPARATE MODULE, NOT PART OF THE ASSEMBLER:
 *   brandedProposalAssembler.ts is 1,700 lines and its page-drawing
 *   helpers live inside the closure of renderNarrativePages, scoped to
 *   the chapter-flow state machine. Reaching into that to draw a
 *   completely different kind of page would have meant either hoisting
 *   a lot of it or duplicating the flow logic. This module takes the
 *   finished PDFDocument and appends to it using pdf-lib directly,
 *   which keeps the contract pages independent of any future change to
 *   how chapters flow.
 *
 * TYPOGRAPHY: deliberately matched to the assembler's narrative pages
 * (Helvetica, same margins, same body size) so the appended pages do
 * not read as a different document stapled on the end.
 */

import {
  PDFDocument,
  PDFFont,
  PDFPage,
  StandardFonts,
  rgb,
} from "pdf-lib";

export interface ContractSignatory {
  name?: string | null;
  title?: string | null;
  /** PNG or JPEG bytes. Absent means print a blank line to sign. */
  signatureBytes?: Uint8Array;
  signatureFormat?: "png" | "jpeg";
}

export interface ContractClause {
  number: number;
  heading: string;
  body: string;
}

export interface AppendContractPagesParams {
  doc: PDFDocument;
  pageWidth: number;
  pageHeight: number;
  /** Heading printed above the terms, e.g. 'IT Support/Services
   *  Contract Agreement "Gold" package'. Page numbering (1/3, 2/3) is
   *  appended automatically once the page count is known. */
  displayName: string;
  clauses: ContractClause[];
  acceptanceBody: string;
  thankYouBody: string;
  providerName: string;
  customerName: string;
  signatory: ContractSignatory;
  /** Brand accent as [r,g,b] 0-1, matched to the proposal's chapters. */
  accent?: [number, number, number];
}

const MARGIN = 48;
const TITLE_SIZE = 15;
const HEADING_SIZE = 9.5;
const BODY_SIZE = 8.5;
const LINE_GAP = 1.35;
const PARA_GAP = 5;

const INK = rgb(0.13, 0.16, 0.22);
const MUTED = rgb(0.42, 0.46, 0.53);
const RULE = rgb(0.85, 0.87, 0.9);

/** Wrap a paragraph to a pixel width. Mirrors the assembler's helper. */
function wrap(
  text: string,
  font: PDFFont,
  size: number,
  maxWidth: number,
): string[] {
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const candidate = current ? `${current} ${word}` : word;
    if (font.widthOfTextAtSize(candidate, size) <= maxWidth) {
      current = candidate;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length > 0 ? lines : [""];
}

/**
 * pdf-lib's WinAnsi encoding rejects characters outside its range, and
 * a single smart quote pasted from Word would otherwise throw mid-render
 * and fail the whole contract. Normalise the common offenders rather
 * than lose the document.
 */
function sanitise(text: string): string {
  return text
    .replace(/[\u2018\u2019\u201B]/g, "'")
    .replace(/[\u201C\u201D]/g, '"')
    .replace(/[\u2013\u2014]/g, "-")
    .replace(/\u2026/g, "...")
    .replace(/\u00A0/g, " ")
    .replace(/[\u200B-\u200D\uFEFF]/g, "");
}

/**
 * Substitute the {{placeholder}} tokens. Unknown tokens are left as
 * written rather than blanked, so a typo shows up visibly on the page
 * instead of silently deleting a sentence from a legal document.
 */
export function substitutePlaceholders(
  text: string,
  values: Record<string, string>,
): string {
  return text.replace(/\{\{(\w+)\}\}/g, (whole, key: string) =>
    Object.prototype.hasOwnProperty.call(values, key) ? values[key] : whole,
  );
}

export async function appendContractPages(
  params: AppendContractPagesParams,
): Promise<void> {
  const {
    doc,
    pageWidth,
    pageHeight,
    clauses,
    acceptanceBody,
    thankYouBody,
    signatory,
  } = params;

  const regular = await doc.embedFont(StandardFonts.Helvetica);
  const bold = await doc.embedFont(StandardFonts.HelveticaBold);
  const accent = params.accent
    ? rgb(params.accent[0], params.accent[1], params.accent[2])
    : rgb(0.1, 0.17, 0.29);

  const contentWidth = pageWidth - MARGIN * 2;
  const contentBottom = MARGIN + 24;

  let page: PDFPage = doc.addPage([pageWidth, pageHeight]);
  let y = pageHeight - MARGIN;
  const termsPages: PDFPage[] = [page];

  const newTermsPage = () => {
    page = doc.addPage([pageWidth, pageHeight]);
    termsPages.push(page);
    y = pageHeight - MARGIN;
    return page;
  };

  /** Reserve vertical space, starting a new page if it will not fit. */
  const ensure = (needed: number) => {
    if (y - needed < contentBottom) newTermsPage();
  };

  // Title is drawn last, once we know how many pages the terms took —
  // that is the only way to print "1/3" honestly. Space is reserved
  // here on every page as it is created.
  const TITLE_BLOCK = TITLE_SIZE * 2.4;
  y -= TITLE_BLOCK;

  // ── Clauses ───────────────────────────────────────────────────────
  for (const clause of clauses) {
    const heading = sanitise(`${clause.number}. ${clause.heading}`);
    const paragraphs = sanitise(clause.body)
      .split(/\n\s*\n/)
      .map((p) => p.replace(/\s+/g, " ").trim())
      .filter(Boolean);

    // Keep the heading with at least two lines of its body. A heading
    // alone at the foot of a page reads as though the clause is missing.
    const firstWrapped = wrap(
      paragraphs[0] ?? "",
      regular,
      BODY_SIZE,
      contentWidth,
    );
    const keepTogether =
      HEADING_SIZE * LINE_GAP +
      PARA_GAP +
      BODY_SIZE * LINE_GAP * Math.min(2, firstWrapped.length);
    ensure(keepTogether);

    // A new page mid-terms needs its own title block reserved.
    if (y === pageHeight - MARGIN) y -= TITLE_BLOCK;

    page.drawText(heading, {
      x: MARGIN,
      y: y - HEADING_SIZE,
      size: HEADING_SIZE,
      font: bold,
      color: accent,
    });
    y -= HEADING_SIZE * LINE_GAP + 2;

    for (let pi = 0; pi < paragraphs.length; pi++) {
      const lines = wrap(paragraphs[pi], regular, BODY_SIZE, contentWidth);
      for (const line of lines) {
        ensure(BODY_SIZE * LINE_GAP);
        if (y === pageHeight - MARGIN) y -= TITLE_BLOCK;
        page.drawText(line, {
          x: MARGIN,
          y: y - BODY_SIZE,
          size: BODY_SIZE,
          font: regular,
          color: INK,
        });
        y -= BODY_SIZE * LINE_GAP;
      }
      if (pi < paragraphs.length - 1) y -= PARA_GAP;
    }
    y -= PARA_GAP + 3;
  }

  // ── Terms page titles, now the count is known ─────────────────────
  const totalTermsPages = termsPages.length;
  termsPages.forEach((p, i) => {
    const label = `${params.displayName} ${i + 1}/${totalTermsPages}`;
    const lines = wrap(sanitise(label), bold, TITLE_SIZE, contentWidth);
    let ty = pageHeight - MARGIN;
    for (const line of lines) {
      p.drawText(line, {
        x: MARGIN,
        y: ty - TITLE_SIZE,
        size: TITLE_SIZE,
        font: bold,
        color: accent,
      });
      ty -= TITLE_SIZE * 1.2;
    }
    p.drawLine({
      start: { x: MARGIN, y: ty - 4 },
      end: { x: MARGIN + contentWidth, y: ty - 4 },
      thickness: 0.5,
      color: RULE,
    });
  });

  // ── Acceptance page ───────────────────────────────────────────────
  // Always a fresh page. The signature blocks must not be split across
  // a page break, and reserving them reliably at the foot of the last
  // terms page is not worth the complexity.
  const acc = doc.addPage([pageWidth, pageHeight]);
  let ay = pageHeight - MARGIN;

  acc.drawText("Acceptance", {
    x: MARGIN,
    y: ay - TITLE_SIZE,
    size: TITLE_SIZE,
    font: bold,
    color: accent,
  });
  ay -= TITLE_SIZE * 1.2;
  acc.drawLine({
    start: { x: MARGIN, y: ay - 4 },
    end: { x: MARGIN + contentWidth, y: ay - 4 },
    thickness: 0.5,
    color: RULE,
  });
  ay -= 18;

  for (const paragraph of sanitise(acceptanceBody)
    .split(/\n\s*\n/)
    .map((p) => p.replace(/\s+/g, " ").trim())
    .filter(Boolean)) {
    for (const line of wrap(paragraph, regular, BODY_SIZE, contentWidth)) {
      acc.drawText(line, {
        x: MARGIN,
        y: ay - BODY_SIZE,
        size: BODY_SIZE,
        font: regular,
        color: INK,
      });
      ay -= BODY_SIZE * LINE_GAP;
    }
    ay -= PARA_GAP;
  }

  ay -= 16;

  // ── Provider signature block ──────────────────────────────────────
  acc.drawText(sanitise(`For ${params.providerName}`), {
    x: MARGIN,
    y: ay - HEADING_SIZE,
    size: HEADING_SIZE,
    font: bold,
    color: accent,
  });
  ay -= HEADING_SIZE * LINE_GAP + 4;

  const providerIntro = sanitise(
    `I, ${signatory.name || "________________________"}${
      signatory.title ? `, ${signatory.title},` : ""
    } of ${params.providerName}, agree to provide the services described in this agreement subject to the above terms and conditions.`,
  );
  for (const line of wrap(providerIntro, regular, BODY_SIZE, contentWidth)) {
    acc.drawText(line, {
      x: MARGIN,
      y: ay - BODY_SIZE,
      size: BODY_SIZE,
      font: regular,
      color: INK,
    });
    ay -= BODY_SIZE * LINE_GAP;
  }
  ay -= 10;

  // Signature image, if one is on file. Any embed failure degrades to
  // the blank line rather than failing the contract.
  if (signatory.signatureBytes && signatory.signatureFormat) {
    try {
      const img =
        signatory.signatureFormat === "png"
          ? await doc.embedPng(signatory.signatureBytes)
          : await doc.embedJpg(signatory.signatureBytes);
      const maxW = 150;
      const maxH = 40;
      const scale = Math.min(maxW / img.width, maxH / img.height, 1);
      const w = img.width * scale;
      const h = img.height * scale;
      acc.drawImage(img, { x: MARGIN + 46, y: ay - h + 6, width: w, height: h });
      ay -= h;
    } catch {
      ay -= 18;
    }
  } else {
    ay -= 18;
  }

  acc.drawText("Signed: ______________________________", {
    x: MARGIN,
    y: ay - BODY_SIZE,
    size: BODY_SIZE,
    font: regular,
    color: INK,
  });
  acc.drawText("Date: ____________________", {
    x: MARGIN + 240,
    y: ay - BODY_SIZE,
    size: BODY_SIZE,
    font: regular,
    color: INK,
  });
  ay -= 34;

  // ── Customer signature block ──────────────────────────────────────
  acc.drawText(sanitise(`For ${params.customerName}`), {
    x: MARGIN,
    y: ay - HEADING_SIZE,
    size: HEADING_SIZE,
    font: bold,
    color: accent,
  });
  ay -= HEADING_SIZE * LINE_GAP + 4;

  const customerIntro = sanitise(
    `I, __________________________________________ of ${params.customerName}, agree to purchase the IT services described in this agreement subject to the above terms and conditions.`,
  );
  for (const line of wrap(customerIntro, regular, BODY_SIZE, contentWidth)) {
    acc.drawText(line, {
      x: MARGIN,
      y: ay - BODY_SIZE,
      size: BODY_SIZE,
      font: regular,
      color: INK,
    });
    ay -= BODY_SIZE * LINE_GAP;
  }
  ay -= 22;

  const signLines: Array<[string, string]> = [
    ["Signed: ______________________________", "Date: ____________________"],
    ["Name: _______________________________", "Position: _________________"],
  ];
  for (const [left, right] of signLines) {
    acc.drawText(left, {
      x: MARGIN,
      y: ay - BODY_SIZE,
      size: BODY_SIZE,
      font: regular,
      color: INK,
    });
    acc.drawText(right, {
      x: MARGIN + 240,
      y: ay - BODY_SIZE,
      size: BODY_SIZE,
      font: regular,
      color: INK,
    });
    ay -= 26;
  }

  // ── Closing line ──────────────────────────────────────────────────
  if (thankYouBody.trim()) {
    ay -= 20;
    const closing = sanitise(thankYouBody.replace(/\s+/g, " ").trim());
    for (const line of wrap(closing, bold, HEADING_SIZE, contentWidth - 40)) {
      const lineWidth = bold.widthOfTextAtSize(line, HEADING_SIZE);
      acc.drawText(line, {
        x: MARGIN + (contentWidth - lineWidth) / 2,
        y: ay - HEADING_SIZE,
        size: HEADING_SIZE,
        font: bold,
        color: accent,
      });
      ay -= HEADING_SIZE * LINE_GAP;
    }
  }

  // Generation stamp. Wez chose not to lock contracts against later
  // edits to the quote, so two contracts generated from the same quote
  // on different days can legitimately differ. This is the only way to
  // tell them apart.
  acc.drawText(
    `Generated ${new Date().toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    })}`,
    {
      x: MARGIN,
      y: contentBottom - 12,
      size: 6.5,
      font: regular,
      color: MUTED,
    },
  );
}
