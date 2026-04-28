/**
 * docxGenerator.ts
 *
 * Phase 4A — Delivery 38. Builds a Microsoft Word (.docx) file from
 * the same quote payload generatePDF consumes. No graphics, no logo,
 * no tables-as-graphics — just professional bold/normal text with
 * proper Word headings, bullet lists, and pricing tables that Word
 * itself recognises and lets the user mark up natively.
 *
 * Why we hand-roll the docx
 * -------------------------
 * Render's pnpm install runs with --frozen-lockfile, so adding a
 * docx npm package would force a pnpm-lock.yaml regen. The .docx
 * format is a zip of OOXML files; with Node's built-in zlib we have
 * everything we need to author one by hand. The minimal-docx pattern
 * below follows the OOXML "WordprocessingML" subset Word, LibreOffice,
 * and Google Docs all accept without complaint:
 *
 *   /[Content_Types].xml      MIME map
 *   /_rels/.rels              package-level relationships
 *   /word/document.xml        the document body
 *   /word/styles.xml          paragraph styles (Heading1, Heading2…)
 *   /word/numbering.xml       bullet list definitions
 *   /word/_rels/document.xml.rels  document relationships
 *
 * No images, no embedded fonts, no headers/footers, no metadata
 * beyond what Word requires to open the file.
 *
 * A note on the ZIP writer
 * ------------------------
 * .docx readers expect a "store" or "deflate" ZIP with no signature
 * tricks. We use deflate-raw via zlib.deflateRawSync, then assemble
 * the ZIP central directory by hand. This is around 80 lines and
 * well-trodden territory — every "minimal docx without a lib" guide
 * online uses the same pattern.
 *
 * Output content
 * --------------
 *   1. Title (Heading 1) — quote title or fallback
 *   2. Reference / date / prepared-for block
 *   3. Description paragraph (if present)
 *   4. Pricing table — line items with description, qty, unit, rate,
 *      total. Native Word table, not pre-formatted text.
 *   5. Totals — subtotal / VAT / total
 *   6. Assumptions (bullet list, if any)
 *   7. Exclusions (bullet list, if any)
 *   8. Terms & conditions (paragraphs)
 *   9. Signature block — signatory name + position (if set)
 *
 * Critical: every text node passes through escapeXml() before
 * insertion. Word will refuse to open the file if any unescaped
 * ampersand or angle-bracket sneaks in, and it gives no error
 * pointing to the offending byte.
 */

import { deflateRawSync } from "zlib";
import { Quote, QuoteLineItem, User, Organization } from "../drizzle/schema";

interface DOCXQuoteData {
  quote: Quote;
  lineItems: QuoteLineItem[];
  user: User;
  organization?: Organization | null;
  tenderContext?: {
    assumptions?: any[] | null;
    exclusions?: any[] | null;
    [key: string]: any;
  } | null;
}

// ── XML helpers ────────────────────────────────────────────────────

/**
 * Escape every character Word's XML parser cares about. Crucially
 * this includes apostrophes — the parser is forgiving on those, but
 * we escape to be safe.
 */
function escapeXml(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

/**
 * Format a GBP amount the way the rest of the app does. Mirrored
 * here rather than imported because pdfGenerator.ts is locked and
 * we shouldn't grow its public surface area for the docx path.
 */
function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(num);
}

function formatQuantity(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(value || "1");
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  const d = typeof date === "string" ? new Date(date) : date;
  if (isNaN(d.getTime())) return "";
  return d.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

// ── Document body building blocks ──────────────────────────────────

/**
 * A normal paragraph. Splits on \n into runs separated by <w:br/> so
 * line breaks within a single string render correctly in Word.
 */
function paragraph(text: string, opts?: { bold?: boolean; size?: number }): string {
  if (!text) return `<w:p><w:r><w:t></w:t></w:r></w:p>`;
  const lines = text.split(/\r?\n/);
  const runs = lines
    .map((line, i) => {
      const props = `<w:rPr>${opts?.bold ? "<w:b/>" : ""}${opts?.size ? `<w:sz w:val="${opts.size}"/>` : ""}</w:rPr>`;
      const t = `<w:t xml:space="preserve">${escapeXml(line)}</w:t>`;
      const br = i < lines.length - 1 ? "<w:br/>" : "";
      return `<w:r>${props}${t}${br}</w:r>`;
    })
    .join("");
  return `<w:p>${runs}</w:p>`;
}

/** Heading at a given level — maps to the Heading1/Heading2/Heading3 styles defined in styles.xml. */
function heading(text: string, level: 1 | 2 | 3): string {
  const styleId = `Heading${level}`;
  return `<w:p><w:pPr><w:pStyle w:val="${styleId}"/></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * A bullet-list item. Word ties bullets to a numbering definition by
 * id; ListBullet (numId 1) is the simple round-bullet list defined
 * in numbering.xml below.
 */
function bullet(text: string): string {
  return `<w:p><w:pPr><w:pStyle w:val="ListBullet"/><w:numPr><w:ilvl w:val="0"/><w:numId w:val="1"/></w:numPr></w:pPr><w:r><w:t xml:space="preserve">${escapeXml(text)}</w:t></w:r></w:p>`;
}

/**
 * A pricing-table row. Word tables are nested cell elements; each
 * cell needs at least one paragraph or Word treats the whole table
 * as malformed. The column widths use the "twip" unit (twentieths of
 * a point); the values below sum to 9000 ≈ 6.25" which fits an A4
 * portrait page minus the default 1" margins.
 */
function tableRow(cells: { text: string; bold?: boolean; align?: "left" | "right" }[], opts?: { header?: boolean }): string {
  const cellXml = cells
    .map((c) => {
      const align = c.align === "right" ? `<w:jc w:val="right"/>` : "";
      const shading = opts?.header ? `<w:shd w:val="clear" w:color="auto" w:fill="EEEEEE"/>` : "";
      const tcPr = `<w:tcPr>${shading}</w:tcPr>`;
      const props = `<w:rPr>${c.bold || opts?.header ? "<w:b/>" : ""}</w:rPr>`;
      const para = `<w:p><w:pPr>${align}</w:pPr><w:r>${props}<w:t xml:space="preserve">${escapeXml(c.text)}</w:t></w:r></w:p>`;
      return `<w:tc>${tcPr}${para}</w:tc>`;
    })
    .join("");
  return `<w:tr>${cellXml}</w:tr>`;
}

function pricingTable(lineItems: QuoteLineItem[]): string {
  const tblPr = `<w:tblPr><w:tblW w:w="9000" w:type="dxa"/><w:tblBorders><w:top w:val="single" w:sz="4" w:color="000000"/><w:left w:val="single" w:sz="4" w:color="000000"/><w:bottom w:val="single" w:sz="4" w:color="000000"/><w:right w:val="single" w:sz="4" w:color="000000"/><w:insideH w:val="single" w:sz="4" w:color="CCCCCC"/><w:insideV w:val="single" w:sz="4" w:color="CCCCCC"/></w:tblBorders></w:tblPr>`;
  const tblGrid = `<w:tblGrid><w:gridCol w:w="4500"/><w:gridCol w:w="900"/><w:gridCol w:w="900"/><w:gridCol w:w="1350"/><w:gridCol w:w="1350"/></w:tblGrid>`;
  const header = tableRow(
    [
      { text: "Description" },
      { text: "Qty", align: "right" },
      { text: "Unit" },
      { text: "Rate", align: "right" },
      { text: "Total", align: "right" },
    ],
    { header: true },
  );
  const rows = lineItems
    .map((li) =>
      tableRow([
        { text: li.description || "" },
        { text: formatQuantity(li.quantity), align: "right" },
        { text: li.unit || "each" },
        { text: formatCurrency(li.rate), align: "right" },
        { text: formatCurrency(li.total), align: "right" },
      ]),
    )
    .join("");
  return `<w:tbl>${tblPr}${tblGrid}${header}${rows}</w:tbl>`;
}

// ── Document assembler ─────────────────────────────────────────────

function buildDocumentXml(data: DOCXQuoteData): string {
  const { quote, lineItems, organization, tenderContext } = data;
  const parts: string[] = [];

  // Title
  parts.push(heading(quote.title || "Quote", 1));

  // Ref / date / prepared-for. Each on its own paragraph; bold the
  // labels, normal the values, line break between three pieces of
  // metadata so they read as a compact block.
  const ref = `Ref: Q-${quote.id}`;
  const date = `Date: ${formatDate(quote.createdAt) || formatDate(new Date())}`;
  const preparedFor = quote.clientName ? `Prepared for: ${quote.clientName}` : "";
  parts.push(paragraph([ref, date, preparedFor].filter(Boolean).join("\n")));

  // Description (if present). Description is the AI-drafted scope
  // paragraph the user reviewed in the modal.
  if (quote.description) {
    parts.push(heading("Project overview", 2));
    parts.push(paragraph(quote.description));
  }

  // Pricing table
  if (lineItems.length > 0) {
    parts.push(heading("Pricing", 2));
    parts.push(pricingTable(lineItems));

    // Totals — subtotal / VAT / total. We compute these here rather
    // than adding extra rows to the pricing table because Word's
    // alignment is cleaner with separate paragraphs for the totals
    // strip, especially when a user wants to mark the table up.
    const subtotal = lineItems.reduce(
      (acc, li) => acc + parseFloat(li.total || "0"),
      0,
    );
    const taxRate = parseFloat((quote as any).taxRate || "0");
    const vat = subtotal * (taxRate / 100);
    const total = subtotal + vat;

    parts.push(paragraph(""));
    parts.push(
      paragraph(
        `Subtotal: ${formatCurrency(subtotal)}\nVAT (${taxRate}%): ${formatCurrency(vat)}\nTotal: ${formatCurrency(total)}`,
        { bold: false },
      ),
    );
  }

  // Assumptions
  const assumptions =
    (tenderContext?.assumptions as any[] | null | undefined) || null;
  if (assumptions && assumptions.length > 0) {
    parts.push(heading("Assumptions", 2));
    for (const a of assumptions) {
      const text = typeof a === "string" ? a : a?.text;
      if (text) parts.push(bullet(text));
    }
  }

  // Exclusions
  const exclusions =
    (tenderContext?.exclusions as any[] | null | undefined) || null;
  if (exclusions && exclusions.length > 0) {
    parts.push(heading("Exclusions", 2));
    for (const e of exclusions) {
      const text = typeof e === "string" ? e : e?.text;
      if (text) parts.push(bullet(text));
    }
  }

  // Terms & conditions. The terms paragraph is normally numbered
  // ("1. Working hours… 2. Quote validity…") so we render as plain
  // paragraphs and let the user's own numbering carry through.
  if (quote.terms) {
    parts.push(heading("Terms & conditions", 2));
    parts.push(paragraph(quote.terms));
  }

  // Signature block. We render it whenever a signatory name is set
  // — falling back to the org's defaultSignatoryName when the
  // per-quote field is empty so Word docs match the PDF cascade.
  const signatoryName =
    (quote as any).signatoryName ||
    (organization as any)?.defaultSignatoryName ||
    null;
  const signatoryPosition =
    (quote as any).signatoryPosition ||
    (organization as any)?.defaultSignatoryPosition ||
    null;
  if (signatoryName) {
    parts.push(paragraph(""));
    parts.push(heading("Acceptance", 2));
    parts.push(paragraph("Signed:_____________________________"));
    parts.push(paragraph(""));
    parts.push(
      paragraph(
        `${signatoryName}${signatoryPosition ? `, ${signatoryPosition}` : ""}`,
        { bold: true },
      ),
    );
    parts.push(paragraph("Date:_______________________________"));
  }

  // Wrap the body in the Word root element. The sectPr at the end is
  // mandatory — Word refuses to open a docx that lacks page-size /
  // margin metadata in the body's final section. A4 portrait, default
  // 1" margins.
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:body>
    ${parts.join("\n    ")}
    <w:sectPr>
      <w:pgSz w:w="11906" w:h="16838"/>
      <w:pgMar w:top="1440" w:right="1440" w:bottom="1440" w:left="1440" w:header="708" w:footer="708" w:gutter="0"/>
    </w:sectPr>
  </w:body>
</w:document>`;
}

// ── Static OOXML files ─────────────────────────────────────────────
// These are the bones every Word doc needs. They never change so
// they're stored as constants.

const CONTENT_TYPES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types">
  <Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/>
  <Default Extension="xml" ContentType="application/xml"/>
  <Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/>
  <Override PartName="/word/styles.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.styles+xml"/>
  <Override PartName="/word/numbering.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.numbering+xml"/>
</Types>`;

const RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/>
</Relationships>`;

const DOCUMENT_RELS_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">
  <Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/styles" Target="styles.xml"/>
  <Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/numbering" Target="numbering.xml"/>
</Relationships>`;

// Three heading styles + ListBullet style. Sizes are in half-points
// (Word's native unit) — so w:val="32" = 16pt. Calibri at 11pt for
// body, the user can switch the entire doc to a different font in
// one click without our generator having to know about fonts.
const STYLES_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:styles xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:docDefaults>
    <w:rPrDefault><w:rPr><w:rFonts w:ascii="Calibri" w:hAnsi="Calibri" w:cs="Calibri"/><w:sz w:val="22"/></w:rPr></w:rPrDefault>
    <w:pPrDefault><w:pPr><w:spacing w:after="120"/></w:pPr></w:pPrDefault>
  </w:docDefaults>
  <w:style w:type="paragraph" w:styleId="Heading1">
    <w:name w:val="heading 1"/>
    <w:pPr><w:spacing w:before="240" w:after="120"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="36"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading2">
    <w:name w:val="heading 2"/>
    <w:pPr><w:spacing w:before="200" w:after="80"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="28"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="Heading3">
    <w:name w:val="heading 3"/>
    <w:pPr><w:spacing w:before="160" w:after="60"/></w:pPr>
    <w:rPr><w:b/><w:sz w:val="24"/></w:rPr>
  </w:style>
  <w:style w:type="paragraph" w:styleId="ListBullet">
    <w:name w:val="List Bullet"/>
    <w:pPr><w:spacing w:after="60"/></w:pPr>
  </w:style>
</w:styles>`;

// One bullet definition (numId=1). Word ties every bulleted paragraph
// to a numId; with one definition the entire doc can use bullets
// without the generator caring about list nesting.
const NUMBERING_XML = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>
<w:numbering xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main">
  <w:abstractNum w:abstractNumId="0">
    <w:lvl w:ilvl="0">
      <w:start w:val="1"/>
      <w:numFmt w:val="bullet"/>
      <w:lvlText w:val="•"/>
      <w:lvlJc w:val="left"/>
      <w:pPr><w:ind w:left="720" w:hanging="360"/></w:pPr>
    </w:lvl>
  </w:abstractNum>
  <w:num w:numId="1">
    <w:abstractNumId w:val="0"/>
  </w:num>
</w:numbering>`;

// ── Minimal ZIP writer ─────────────────────────────────────────────
// The .docx package is a ZIP. We deflate each file with zlib, then
// concatenate local file headers + central directory + end-of-central-
// directory. No spec-perfect ZIP64, no UTF-8 filenames flag — every
// filename here is ASCII and the package is well under 4GB.

function crc32(buf: Buffer): number {
  // Standard CRC-32 (IEEE 802.3 polynomial). Cached lookup table
  // built once on first call.
  let table = (crc32 as any)._table as number[] | undefined;
  if (!table) {
    table = new Array(256);
    for (let n = 0; n < 256; n++) {
      let c = n;
      for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
      table[n] = c;
    }
    (crc32 as any)._table = table;
  }
  let crc = 0xffffffff;
  for (let i = 0; i < buf.length; i++) {
    crc = (table[(crc ^ buf[i]) & 0xff] ^ (crc >>> 8)) >>> 0;
  }
  return (crc ^ 0xffffffff) >>> 0;
}

interface ZipEntry {
  name: string;
  data: Buffer;
  compressed: Buffer;
  crc: number;
  localHeaderOffset: number;
}

function buildZip(files: Array<{ name: string; content: string }>): Buffer {
  const entries: ZipEntry[] = [];
  const localHeaders: Buffer[] = [];
  let offset = 0;

  for (const f of files) {
    const data = Buffer.from(f.content, "utf8");
    const compressed = deflateRawSync(data);
    const crc = crc32(data);
    const nameBuf = Buffer.from(f.name, "utf8");
    // Local file header: 30 bytes fixed + filename
    const local = Buffer.alloc(30 + nameBuf.length);
    local.writeUInt32LE(0x04034b50, 0); // signature
    local.writeUInt16LE(20, 4); // version needed (2.0)
    local.writeUInt16LE(0, 6); // flags
    local.writeUInt16LE(8, 8); // method = deflate
    local.writeUInt16LE(0, 10); // mod time
    local.writeUInt16LE(0, 12); // mod date
    local.writeUInt32LE(crc, 14);
    local.writeUInt32LE(compressed.length, 18);
    local.writeUInt32LE(data.length, 22);
    local.writeUInt16LE(nameBuf.length, 26);
    local.writeUInt16LE(0, 28); // extra length
    nameBuf.copy(local, 30);

    entries.push({ name: f.name, data, compressed, crc, localHeaderOffset: offset });
    localHeaders.push(local);
    localHeaders.push(compressed);
    offset += local.length + compressed.length;
  }

  // Central directory
  const cdParts: Buffer[] = [];
  let cdSize = 0;
  for (const e of entries) {
    const nameBuf = Buffer.from(e.name, "utf8");
    const cd = Buffer.alloc(46 + nameBuf.length);
    cd.writeUInt32LE(0x02014b50, 0); // signature
    cd.writeUInt16LE(20, 4); // version made by
    cd.writeUInt16LE(20, 6); // version needed
    cd.writeUInt16LE(0, 8); // flags
    cd.writeUInt16LE(8, 10); // method
    cd.writeUInt16LE(0, 12); // mod time
    cd.writeUInt16LE(0, 14); // mod date
    cd.writeUInt32LE(e.crc, 16);
    cd.writeUInt32LE(e.compressed.length, 20);
    cd.writeUInt32LE(e.data.length, 24);
    cd.writeUInt16LE(nameBuf.length, 28);
    cd.writeUInt16LE(0, 30); // extra
    cd.writeUInt16LE(0, 32); // comment
    cd.writeUInt16LE(0, 34); // disk
    cd.writeUInt16LE(0, 36); // internal attr
    cd.writeUInt32LE(0, 38); // external attr
    cd.writeUInt32LE(e.localHeaderOffset, 42);
    nameBuf.copy(cd, 46);
    cdParts.push(cd);
    cdSize += cd.length;
  }
  const cdOffset = offset;

  // End of central directory record
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4); // disk
  eocd.writeUInt16LE(0, 6); // disk with cd
  eocd.writeUInt16LE(entries.length, 8);
  eocd.writeUInt16LE(entries.length, 10);
  eocd.writeUInt32LE(cdSize, 12);
  eocd.writeUInt32LE(cdOffset, 16);
  eocd.writeUInt16LE(0, 20); // comment length

  return Buffer.concat([...localHeaders, ...cdParts, eocd]);
}

// ── Public entrypoint ──────────────────────────────────────────────

/**
 * Build a .docx file as a base64 string ready for client-side
 * download. The client decodes the base64 to a Blob and triggers a
 * normal browser download — no streaming, no signed URLs, the
 * generated file is small enough (typically <50KB) for an inline
 * data transfer.
 */
export function generateQuoteDOCX(data: DOCXQuoteData): string {
  const documentXml = buildDocumentXml(data);
  const zip = buildZip([
    { name: "[Content_Types].xml", content: CONTENT_TYPES_XML },
    { name: "_rels/.rels", content: RELS_XML },
    { name: "word/_rels/document.xml.rels", content: DOCUMENT_RELS_XML },
    { name: "word/document.xml", content: documentXml },
    { name: "word/styles.xml", content: STYLES_XML },
    { name: "word/numbering.xml", content: NUMBERING_XML },
  ]);
  return zip.toString("base64");
}
