/**
 * Chapter body blocks — Delivery 2.14, Chunk 4b.
 *
 * WHY THIS FILE EXISTS
 *
 * A chapter body has always been plain text: paragraphs separated by
 * blank lines, wrapped and drawn one line at a time. When a regenerated
 * chapter came back as a markdown table it printed its pipes, dashes
 * and asterisks to the client (Sorrells, 17 Sep 2026). Chunk 4a fixed
 * that by forbidding tables. This chunk draws them instead, because a
 * control area next to how it is delivered genuinely IS a table, and so
 * are a cleaning frequency schedule and a pest treatment programme.
 *
 * The parser lives here, shared by the PDF assembler and the workspace
 * preview, so the two cannot disagree about what counts as a table. A
 * chapter that shows as a table on screen and prints as pipes in the
 * PDF would be worse than not supporting tables at all.
 *
 * SYNTAX: markdown pipe tables. Chosen because it is what the model
 * already produced unprompted, so chapter guidance can say "you may use
 * a table here" rather than teaching an invented format. A table is a
 * header row, a separator row of dashes, then data rows:
 *
 *     Control area | How it is delivered
 *     --- | ---
 *     Endpoint protection | SentinelOne EDR across all 23 devices
 *     Email security | Advanced Email Protection on 30 mailboxes
 *
 * Leading and trailing pipes are optional. Emphasis markers around cell
 * text are stripped rather than rendered, since the renderers draw a
 * header row in bold anyway and `**` in a cell is the exact artefact
 * this chunk exists to stop showing to clients.
 */

export interface ParagraphBlock {
  kind: "paragraph";
  text: string;
}

export interface TableBlock {
  kind: "table";
  header: string[];
  rows: string[][];
}

export type ChapterBlock = ParagraphBlock | TableBlock;

/**
 * Widest table the renderers will draw.
 *
 * Beyond this, the table is returned as paragraphs instead (see
 * parseChapterBody). Four columns is comfortable on a landscape page
 * and tight on portrait; five or more means either unreadably narrow
 * columns or shrinking the type below the document's body size, and a
 * proposal that quietly changes type size mid-chapter looks broken in a
 * way that is harder to explain than a table rendered as prose.
 *
 * The fallback is deliberately silent — a chapter still reads correctly,
 * it just is not a table. Owner's decision, 17 Sep 2026: cap it.
 */
export const MAX_TABLE_COLUMNS = 4;

/** Minimum rows (excluding the header) for a table to be worth drawing. */
const MIN_TABLE_ROWS = 1;

const SEPARATOR_ROW = /^\s*\|?\s*:?-{2,}:?\s*(\|\s*:?-{2,}:?\s*)*\|?\s*$/;

function looksLikeTableRow(line: string): boolean {
  // A pipe inside ordinary prose is rare, but one pipe alone is not a
  // table — require the line to split into at least two cells.
  return splitRow(line).length >= 2;
}

function splitRow(line: string): string[] {
  const trimmed = line.trim().replace(/^\|/, "").replace(/\|$/, "");
  if (!trimmed.includes("|")) return [];
  return trimmed.split("|").map((c) => cleanCell(c));
}

/**
 * Strip the emphasis markers the model tends to wrap header cells in.
 * Rendering them is not an option: `**Control Area**` printed literally
 * is the fault this chunk exists to remove.
 */
function cleanCell(cell: string): string {
  return cell
    .trim()
    .replace(/^\*\*(.*)\*\*$/, "$1")
    .replace(/^__(.*)__$/, "$1")
    .replace(/\*\*/g, "")
    .trim();
}

/**
 * Split a chapter body into paragraphs and tables.
 *
 * A body with no tables produces exactly the paragraphs the old
 * splitting produced, so every existing chapter renders byte-identically
 * — the delivery proof asserts this across real chapter text.
 *
 * A table too wide to draw is returned as paragraphs rather than
 * dropped: its rows are still readable, one per line, which is what the
 * chapter would have said had the model written prose.
 */
export function parseChapterBody(body: string): ChapterBlock[] {
  const blocks: ChapterBlock[] = [];
  const lines = (body || "").split("\n");

  let paragraphBuffer: string[] = [];

  const flushParagraphs = () => {
    if (paragraphBuffer.length === 0) return;
    // Same rule the assembler has always used: blank lines separate
    // paragraphs, and whitespace inside one collapses.
    const joined = paragraphBuffer.join("\n");
    for (const p of joined.split(/\n\s*\n/)) {
      const text = p.replace(/\s+/g, " ").trim();
      if (text.length > 0) blocks.push({ kind: "paragraph", text });
    }
    paragraphBuffer = [];
  };

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const next = lines[i + 1];

    // A table starts at a row followed by a separator row.
    if (looksLikeTableRow(line) && next !== undefined && SEPARATOR_ROW.test(next)) {
      const header = splitRow(line);
      const rows: string[][] = [];
      let j = i + 2;
      while (j < lines.length && looksLikeTableRow(lines[j])) {
        const cells = splitRow(lines[j]);
        // Pad or trim to the header's width so the renderers never have
        // to guess what a ragged row means.
        while (cells.length < header.length) cells.push("");
        rows.push(cells.slice(0, header.length));
        j++;
      }

      if (rows.length >= MIN_TABLE_ROWS) {
        flushParagraphs();
        if (header.length > MAX_TABLE_COLUMNS) {
          // Too wide to draw. Fall back to one row per line, which is
          // the layout the guidance asked for before tables existed.
          blocks.push({
            kind: "paragraph",
            text: header.join(" — "),
          });
          for (const r of rows) {
            blocks.push({ kind: "paragraph", text: r.join(" — ") });
          }
        } else {
          blocks.push({ kind: "table", header, rows });
        }
        i = j - 1;
        continue;
      }
      // A header and separator with no rows is not a table; fall
      // through and treat the lines as ordinary text.
    }

    paragraphBuffer.push(line);
  }

  flushParagraphs();
  return blocks;
}

/** True when the body contains at least one drawable table. */
export function hasTable(body: string): boolean {
  return parseChapterBody(body).some((b) => b.kind === "table");
}
