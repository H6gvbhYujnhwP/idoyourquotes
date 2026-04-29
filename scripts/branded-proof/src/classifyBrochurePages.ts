// Step 1 of the proof pipeline.
//
// Reads the brochure PDF page-by-page (text only, via pdf-parse v2) and
// asks Claude to classify each page into one of the well-defined tags.
// One batched API call, not 28 separate calls — significantly cheaper
// and gives the model context across pages.
//
// pdf-parse v2 injects "-- N of M --" page markers into its output.
// We use those as the per-page splitter; falls back to whole-doc if the
// markers aren't present (rare).

import { createRequire } from "module";
import { callClaude, extractJson } from "./claudeClient";
import type { PageClassification, PageTag, Clarity } from "./types";

// pdf-parse v2 exports the class { PDFParse }, not a callable default.
// This matches the pattern already used in server/_core/claude.ts.
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer | Uint8Array }) => {
    getText: () => Promise<{ text: string; total: number }>;
    destroy: () => Promise<void>;
  };
};

const VALID_TAGS: PageTag[] = [
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

interface PageText {
  pageNumber: number;
  text: string;
}

/**
 * pdf-parse v2 returns the full document text in `parsed.text` with
 * "-- N of M --" markers inserted between pages. Split on those to get
 * per-page text. The marker is also useful as a sanity check on page
 * count (pdf-parse's `total` may disagree with what we see).
 */
async function extractPerPageText(pdfBuffer: Buffer): Promise<PageText[]> {
  const parser = new PDFParse({ data: pdfBuffer });
  let parsed: { text: string; total: number };
  try {
    parsed = await parser.getText();
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* noop */
    }
  }

  const totalFromParser = parsed.total || 1;
  const raw = parsed.text || "";

  // Split on the "-- N of M --" markers. pdf-parse v2 places the marker
  // AT THE END of each page's content (so content between the start and
  // the first marker is page 1; content between marker N-1 and marker N
  // is page N).
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
  // Any content after the final marker is trailing junk in well-formed
  // PDFs; in malformed ones it might be the last page. Attach it to
  // (max seen + 1) so we don't lose it.
  const tail = raw.slice(lastIdx).trim();
  if (tail.length > 0) {
    const maxSeen = Math.max(0, ...pages.keys());
    pages.set(maxSeen + 1, tail);
  }

  // Fallback: if we found no markers at all, treat the whole thing as page 1
  if (pages.size === 0) {
    return [{ pageNumber: 1, text: raw.trim() }];
  }

  // Build sorted array, filling missing page numbers with empty strings
  const result: PageText[] = [];
  const maxPage = Math.max(totalFromParser, ...pages.keys());
  for (let n = 1; n <= maxPage; n++) {
    result.push({ pageNumber: n, text: pages.get(n) || "" });
  }
  return result;
}

export async function classifyBrochurePages(pdfBuffer: Buffer): Promise<{
  classifications: PageClassification[];
  pageCount: number;
  inputTokens: number;
  outputTokens: number;
}> {
  const pages = await extractPerPageText(pdfBuffer);

  // Build a single prompt with all pages numbered. Claude is good at
  // batch tasks like this when the structure is unambiguous.
  const pagesBlock = pages
    .map(
      (p) =>
        `=== PAGE ${p.pageNumber} ===\n${p.text.slice(0, 2000)}`, // cap at 2000 chars/page to keep input bounded
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

  const response = await callClaude({
    system,
    user,
    maxTokens: 4096,
    temperature: 0.1,
  });

  const parsed = extractJson<{ classifications: any[] }>(response.text);

  // Validate + coerce. Bad tags fall back to "other"; bad clarity falls back to "partial".
  const classifications: PageClassification[] = parsed.classifications.map((c, idx) => ({
    pageNumber: typeof c.pageNumber === "number" ? c.pageNumber : idx + 1,
    tag: VALID_TAGS.includes(c.tag) ? (c.tag as PageTag) : "other",
    clarity: c.clarity === "clean" ? "clean" : ("partial" as Clarity),
    facts: Array.isArray(c.facts) ? c.facts.filter((f: any) => typeof f === "string").slice(0, 5) : [],
  }));

  return {
    classifications,
    pageCount: pages.length,
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}
