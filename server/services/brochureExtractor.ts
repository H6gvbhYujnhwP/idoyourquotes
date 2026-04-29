/**
 * Brochure extractor service.
 *
 * Phase 4B Delivery A. Lives behind the brochure upload endpoint —
 * called once per brochure upload, output stored on
 * organizations.brochureKnowledge for reuse on every Branded-with-
 * Brochure proposal generation.
 *
 * Two responsibilities:
 *   1. Read the brochure PDF page-by-page (pdf-parse v2 class API,
 *      same pattern as server/_core/claude.ts). The "-- N of M --"
 *      page markers v2 injects are used to split per-page text.
 *   2. Send all pages to Claude in ONE batched call asking for a
 *      structured per-page classification (tag + clarity + facts).
 *
 * Output shape matches the brochureKnowledge JSON column on
 * organizations. The branded proposal engine reads that shape directly,
 * so what's stored is what the engine consumes — no transformation
 * layer between extraction and generation.
 *
 * Reuses invokeClaude from server/_core/claude.ts at temperature 0.1
 * (the determinism default established in the previous session's D1).
 *
 * Ported from scripts/branded-proof/src/classifyBrochurePages.ts —
 * same approach, integrated to use the live LLM helpers and the
 * structured Knowledge shape.
 */

import { createRequire } from "module";
import { invokeClaude } from "../_core/claude";

// pdf-parse v2 exports the class { PDFParse }, not a callable default.
// Same pattern already used in server/_core/claude.ts.
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
    getText: () => Promise<{ text: string; total: number }>;
    destroy: () => Promise<void>;
  };
};

export type BrochurePageTag =
  | "cover"
  | "contents"
  | "about"
  | "usp"
  | "track-record"
  | "service"
  | "testimonial"
  | "contact"
  | "other";

export type BrochurePageClarity = "clean" | "partial";

export interface BrochurePageClassification {
  pageNumber: number;
  tag: BrochurePageTag;
  clarity: BrochurePageClarity;
  facts: string[];
}

/**
 * The shape persisted on organizations.brochureKnowledge.
 *
 * pageCount is duplicated at the top level so we don't have to scan
 * classifications[] every time we need to know "does this org have a
 * usable brochure".
 */
export interface BrochureKnowledge {
  pageCount: number;
  classifications: BrochurePageClassification[];
}

const VALID_TAGS: BrochurePageTag[] = [
  "cover",
  "contents",
  "about",
  "usp",
  "track-record",
  "service",
  "testimonial",
  "contact",
  "other",
];

interface PerPageText {
  pageNumber: number;
  text: string;
}

/**
 * Read PDF and split into per-page text using pdf-parse v2's
 * "-- N of M --" page markers. Marker N appears AT THE END of page N,
 * so content between marker N-1 (or doc start) and marker N belongs to
 * page N.
 */
async function extractPerPageText(pdfBuffer: Buffer): Promise<PerPageText[]> {
  const parser = new PDFParse({ data: pdfBuffer });
  let parsed: { text: string; total: number };
  try {
    parsed = await parser.getText();
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* noop — parser may have already torn down */
    }
  }

  const totalFromParser = parsed.total || 1;
  const raw = parsed.text || "";

  const markerPattern = /--\s*(\d+)\s+of\s+\d+\s*--/g;
  const pages = new Map<number, string>();

  let lastIdx = 0;
  let match: RegExpExecArray | null;
  while ((match = markerPattern.exec(raw)) !== null) {
    const pageNumber = parseInt(match[1], 10);
    const segment = raw.slice(lastIdx, match.index).trim();
    pages.set(pageNumber, segment);
    lastIdx = match.index + match[0].length;
  }
  // Trailing content after the final marker — usually empty, but keep
  // it just in case so we don't lose a malformed brochure's last page.
  const tail = raw.slice(lastIdx).trim();
  if (tail.length > 0) {
    const seenKeys = Array.from(pages.keys());
    const maxSeen = seenKeys.length > 0 ? Math.max(...seenKeys) : 0;
    pages.set(maxSeen + 1, tail);
  }

  // Fallback: no markers found (rare — happens with PDFs pdf-parse
  // can't extract structured text from). Treat as single page.
  if (pages.size === 0) {
    return [{ pageNumber: 1, text: raw.trim() }];
  }

  const result: PerPageText[] = [];
  const pageKeys = Array.from(pages.keys());
  const maxPage = Math.max(totalFromParser, ...pageKeys);
  for (let n = 1; n <= maxPage; n++) {
    result.push({ pageNumber: n, text: pages.get(n) || "" });
  }
  return result;
}

/**
 * Strip code-fence wrappers and parse JSON from a Claude response.
 * Handles the "```json ... ```" wrapper Claude sometimes adds despite
 * being told not to.
 */
function extractJson<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
    // Recovery: find first { or [ and last matching close
    const firstBrace = Math.min(
      ...["{", "["].map((c) => {
        const idx = cleaned.indexOf(c);
        return idx === -1 ? Infinity : idx;
      }),
    );
    if (!isFinite(firstBrace)) {
      throw new Error(`No JSON in Claude response: ${text.slice(0, 200)}`);
    }
    const lastBrace = Math.max(cleaned.lastIndexOf("}"), cleaned.lastIndexOf("]"));
    if (lastBrace <= firstBrace) {
      throw new Error(`Malformed JSON in Claude response: ${text.slice(0, 200)}`);
    }
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
  }
}

/**
 * Classify each brochure page in one batched Claude call. Returns the
 * structured BrochureKnowledge ready to persist on organizations.
 *
 * Cost: roughly $0.05 per brochure (about £0.04). Time: ~15-30 seconds
 * for a 28-page brochure.
 */
export async function extractBrochureKnowledge(
  pdfBuffer: Buffer,
): Promise<BrochureKnowledge> {
  const pages = await extractPerPageText(pdfBuffer);

  const pagesBlock = pages
    .map(
      (p) =>
        `=== PAGE ${p.pageNumber} ===\n${p.text.slice(0, 2000)}`, // 2000 chars/page input cap
    )
    .join("\n\n");

  const system = `You are classifying pages of a company marketing brochure for use in a proposal generator.

For each page, return:
1. "tag": one of these exact strings:
   - "cover": title page, company name with logo as the dominant element
   - "contents": table of contents / index page
   - "about": About Us page — company history, founding, who we are
   - "usp": Why Choose Us / What Makes Us Different / unique selling points
   - "track-record": stats, social proof, customer satisfaction metrics
   - "service": describes a specific service offering (IT support, cyber security, backup, etc.)
   - "testimonial": customer quotes, reviews, case studies
   - "contact": contact details / get in touch / where to find us
   - "other": anything that doesn't clearly fit above

2. "clarity": one of:
   - "clean": the page is a self-contained marketing page about ONE topic, suitable for embedding verbatim in a proposal
   - "partial": the page has mixed content, multiple topics, or is too cluttered for a clean embed

3. "facts": array of up to 5 short factual claims explicitly stated on this page that would matter in a proposal (e.g., "25+ years experience", "98.8% SLA adherence", "based in Rayleigh, Essex"). Empty array if no clear factual claims.

Return ONLY valid JSON in this exact shape, no preamble, no fences:
{
  "classifications": [
    { "pageNumber": 1, "tag": "cover", "clarity": "clean", "facts": [] },
    ...
  ]
}`;

  const user = `Brochure has ${pages.length} pages. Classify each one.\n\n${pagesBlock}`;

  const result = await invokeClaude({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 4096,
    temperature: 0.1,
  });

  const parsed = extractJson<{ classifications: any[] }>(result.content);

  // Defensive validation — reject bad tags/clarity rather than crash.
  // Worst case for an unrecognised tag is "other" (the fallback chain
  // in the engine treats "other" as not-embeddable).
  const classifications: BrochurePageClassification[] = (parsed.classifications || []).map(
    (c, idx) => ({
      pageNumber: typeof c.pageNumber === "number" ? c.pageNumber : idx + 1,
      tag: VALID_TAGS.includes(c.tag) ? (c.tag as BrochurePageTag) : "other",
      clarity: c.clarity === "clean" ? "clean" : ("partial" as BrochurePageClarity),
      facts: Array.isArray(c.facts)
        ? c.facts.filter((f: any) => typeof f === "string").slice(0, 5)
        : [],
    }),
  );

  return {
    pageCount: pages.length,
    classifications,
  };
}

/**
 * Compute SHA-256 hex digest of a buffer. Used for re-upload
 * deduplication — if the user uploads an identical brochure, we skip
 * extraction and reuse the existing knowledge.
 */
export async function hashBrochureFile(pdfBuffer: Buffer): Promise<string> {
  const { createHash } = await import("crypto");
  return createHash("sha256").update(pdfBuffer).digest("hex");
}

/**
 * Quick "is this brochure thin?" check used by the upload endpoint to
 * surface the soft hard-block in the UI. A thin brochure has fewer
 * than 4 clean pages with non-empty facts, OR no clean "about" or
 * "usp" page at all. The user can override and continue anyway —
 * see the modal in Delivery B.
 */
export function isBrochureThin(knowledge: BrochureKnowledge): {
  thin: boolean;
  reasons: string[];
} {
  const reasons: string[] = [];
  const cleanPages = knowledge.classifications.filter((c) => c.clarity === "clean");
  const hasAbout = cleanPages.some((c) => c.tag === "about");
  const hasUsp = cleanPages.some((c) => c.tag === "usp");

  if (!hasAbout) reasons.push("No clear About Us page found");
  if (!hasUsp) reasons.push("No clear Why Choose Us / USP page found");
  if (cleanPages.filter((c) => c.facts.length > 0).length < 3) {
    reasons.push("Few extractable facts — proposal will be sparse");
  }

  return { thin: reasons.length > 0, reasons };
}
