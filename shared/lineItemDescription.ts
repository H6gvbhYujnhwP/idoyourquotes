/**
 * Line-item description format — delivery 2.5 (new-line bullets).
 *
 * THE FORMAT (from this delivery on):
 *   A description is plain text. The FIRST line is the summary. Every
 *   following line is one feature point, printed as a bullet. A line that
 *   starts with a number ("1. ", "2) ") is a numbered step and keeps its
 *   number. That's it — the user presses Enter for a new point, exactly
 *   as it will print.
 *
 *     Keeper Password Manager for 22 users
 *     Secure encrypted password vault
 *     Shared team vaults with role-based access
 *
 * WHY THIS REPLACED "||" AND "##":
 *   The old separators only became bullets in the quote PDF. The Word
 *   export, the colour-template proposal and (soon) Xero printed them
 *   raw, and in the quote workspace the user edited one long paragraph
 *   full of "||". A new line reads correctly everywhere, including places
 *   that do no formatting at all.
 *
 * LEGACY TOLERANCE:
 *   Every surface still understands the old markers, so an unconverted
 *   description can never print wrongly:
 *     "||" -> a bullet boundary
 *     "##" -> a numbered-step boundary (numbered 1, 2, 3 in order)
 *   Lines already starting with "•", "-", "*" or "·" are bullets with the
 *   marker removed, so a pasted bulleted list doesn't get double bullets.
 *
 * This file has no imports: it is shared by the server (renderers, Word,
 * Xero, the AI engine) and the client (Catalogue page).
 */

export interface DescriptionPoint {
  text: string;
  /** Set for a numbered step, e.g. "1". Absent for a bullet. */
  number?: string;
}

export interface DescriptionParts {
  /** The headline line. May be empty if the text starts with a bullet. */
  summary: string;
  points: DescriptionPoint[];
}

const BULLET_MARKER = /^\s*[•\-\*·▪◦]\s+/;
const NUMBER_MARKER = /^\s*(\d{1,3})[.)]\s+/;

type Token =
  | { kind: "plain"; text: string }
  | { kind: "bullet"; text: string }
  | { kind: "number"; text: string; number: string };

function classify(segment: string): Token | null {
  const s = segment.trim();
  if (!s) return null;
  const num = s.match(NUMBER_MARKER);
  if (num) {
    const text = s.slice(num[0].length).trim();
    return text ? { kind: "number", text, number: num[1] } : null;
  }
  const bul = s.match(BULLET_MARKER);
  if (bul) {
    const text = s.slice(bul[0].length).trim();
    return text ? { kind: "bullet", text } : null;
  }
  return { kind: "plain", text: s };
}

/** Split a description into its summary and its points. */
export function parseLineItemDescription(
  raw: string | null | undefined,
): DescriptionParts {
  const text = String(raw ?? "").replace(/\r\n?/g, "\n");
  const tokens: Token[] = [];
  let legacyStep = 0;

  for (const line of text.split("\n")) {
    if (line.includes("##")) {
      // Legacy numbered steps: first segment is ordinary, the rest are
      // numbered in order.
      const segs = line.split("##");
      const first = classify(segs[0]);
      if (first) tokens.push(first);
      for (const seg of segs.slice(1)) {
        const t = seg.trim();
        if (!t) continue;
        legacyStep += 1;
        tokens.push({ kind: "number", text: t, number: String(legacyStep) });
      }
      continue;
    }
    if (line.includes("||")) {
      // Legacy bullets: first segment is ordinary, the rest are bullets.
      const segs = line.split("||");
      const first = classify(segs[0]);
      if (first) tokens.push(first);
      for (const seg of segs.slice(1)) {
        const t = seg.trim();
        if (t) tokens.push({ kind: "bullet", text: t });
      }
      continue;
    }
    const tok = classify(line);
    if (tok) tokens.push(tok);
  }

  if (tokens.length === 0) return { summary: "", points: [] };

  let summary = "";
  let rest = tokens;
  if (tokens[0].kind === "plain") {
    summary = tokens[0].text;
    rest = tokens.slice(1);
  }
  const points: DescriptionPoint[] = rest.map((t) =>
    t.kind === "number" ? { text: t.text, number: t.number } : { text: t.text },
  );
  return { summary, points };
}

/** The headline only — for tables and pickers with no room for points. */
export function descriptionSummary(raw: string | null | undefined): string {
  const { summary, points } = parseLineItemDescription(raw);
  return summary || points[0]?.text || "";
}

/**
 * The description as plain text with visible markers, one point per line:
 *
 *   Keeper Password Manager for 22 users
 *   • Secure encrypted password vault
 *   1. Remove old switch
 *
 * Used where the output is text rather than HTML: Word, Xero, and AI
 * prompts. `bullet` lets a caller choose the marker.
 */
export function descriptionAsText(
  raw: string | null | undefined,
  opts: { bullet?: string } = {},
): string {
  const bullet = opts.bullet ?? "•";
  const { summary, points } = parseLineItemDescription(raw);
  const lines: string[] = [];
  if (summary) lines.push(summary);
  for (const p of points) {
    lines.push(p.number ? `${p.number}. ${p.text}` : `${bullet} ${p.text}`);
  }
  return lines.join("\n");
}

/**
 * The storage format: summary on line 1, one point per line, bullets
 * with no marker, numbered steps as "N. text". Converts any legacy
 * "||" / "##" description into the new format; a description already in
 * the new format comes back unchanged apart from trimmed whitespace and
 * dropped blank lines.
 */
export function normaliseLineItemDescription(
  raw: string | null | undefined,
): string {
  const { summary, points } = parseLineItemDescription(raw);
  const lines: string[] = [];
  if (summary) lines.push(summary);
  for (const p of points) {
    // With no summary line, bullets keep a visible marker — otherwise
    // the first bullet would be read back as the summary.
    lines.push(p.number ? `${p.number}. ${p.text}` : summary ? p.text : `• ${p.text}`);
  }
  return lines.join("\n");
}
