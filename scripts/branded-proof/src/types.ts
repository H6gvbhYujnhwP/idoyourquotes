// Shared types for the branded-proof D1 script.
//
// This is a STANDALONE proof of concept. It does not import from the
// running app and is not imported by it. Lives outside tsconfig include
// scope so it cannot affect the live TS baseline.

export type PageTag =
  | "cover"
  | "contents"
  | "about"
  | "usp"
  | "track-record"
  | "service"
  | "testimonial"
  | "contact"
  | "other";

export type Clarity = "clean" | "partial";

/**
 * One entry per brochure page after the AI classification pass.
 *
 * - tag: what this page is "about" semantically
 * - clarity: "clean" = self-contained marketing page suitable for verbatim
 *   embed; "partial" = mixed content, prefer to extract facts and generate
 *   a narrative chapter rather than embed the cluttered page.
 * - facts: short bullet list of important factual claims on the page,
 *   used by the narrative engine even when the page itself is embedded
 *   (so adjacent chapters can reference them without duplicating).
 */
export interface PageClassification {
  pageNumber: number; // 1-indexed to match human reading
  tag: PageTag;
  clarity: Clarity;
  facts: string[];
}

/**
 * One slot in the assembled proposal. Either:
 * - source = "embed": copy a brochure page verbatim
 * - source = "generate": draw the narrative chapter as a PDF page
 */
export type ChapterSlot =
  | {
      slotIndex: number;
      slotName: string;
      source: "embed";
      brochurePageNumber: number; // 1-indexed
      reason: string; // why this page was picked for this slot
    }
  | {
      slotIndex: number;
      slotName: string;
      source: "generate";
      title: string;
      body: string; // multi-paragraph narrative text
    };

export interface ProofRunResult {
  brochurePageCount: number;
  classifications: PageClassification[];
  slots: ChapterSlot[];
  outputPath: string;
  tokenUsage: {
    classificationTokens: number;
    narrativeTokens: number;
  };
}
