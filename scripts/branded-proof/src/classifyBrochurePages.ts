// Step 1 of the proof pipeline.
//
// Reads the brochure PDF page-by-page (text only, via pdf-parse) and asks
// Claude to classify each page into one of the well-defined tags. One
// batched API call, not 28 separate calls — significantly cheaper and
// gives the model context across pages so it can spot, for example, that
// page 3 is the "About" page only relative to other pages it has seen.

import { createRequire } from "module";
import { callClaude, extractJson } from "./claudeClient";
import type { PageClassification, PageTag, Clarity } from "./types";

// pdf-parse v2 default-exports a CJS function. We're ESM, so use createRequire.
const require = createRequire(import.meta.url);
const pdfParse: (buffer: Buffer) => Promise<{ text: string; numpages: number }> = require("pdf-parse");

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
 * pdf-parse v2 gives the full document text in one go. We need per-page
 * text. Standard trick: split on form-feed characters (\f) which pdf-parse
 * inserts between pages. Falls back to whole-doc as a single page if no
 * form feeds are present (rare — happens with malformed PDFs).
 */
async function extractPerPageText(pdfBuffer: Buffer): Promise<PageText[]> {
  const parsed = await pdfParse(pdfBuffer);
  const totalPages = parsed.numpages;
  const segments = parsed.text.split("\f");

  // Some PDFs don't have form feeds. Fallback: estimate equal slices.
  if (segments.length < 2) {
    return [{ pageNumber: 1, text: parsed.text }];
  }

  const pages: PageText[] = [];
  for (let i = 0; i < segments.length && i < totalPages; i++) {
    pages.push({
      pageNumber: i + 1,
      text: segments[i].trim(),
    });
  }
  return pages;
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
