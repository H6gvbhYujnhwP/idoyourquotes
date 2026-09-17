/**
 * Chapter set spine — Delivery 2.14, Chunk 5.
 *
 * Every sector's proposal shares eleven chapters and differs only in
 * the middle. That keeps the documents recognisably one product, means
 * a fifth sector is mostly a matter of writing its middle, and stops
 * each set drifting its own version of "About the Supplier".
 *
 * WHY THE TYPES LIVE HERE RATHER THAN IN THE ENGINE
 *
 * The engine registers the sets, so the sets cannot import the engine
 * without a cycle. SlotDef and the table permission therefore live in
 * this module, which imports nothing from the engine, and the engine
 * re-exports SlotDef so existing importers are unaffected.
 *
 * CONTENT RULES BAKED IN HERE, not bolted on per sector:
 *
 *   - A chapter that is not relevant returns an EMPTY BODY and is
 *     dropped at render. It must never spend a page explaining why it
 *     is not relevant. A live IT proposal carried two such pages.
 *   - The supplier's source documents are never named to the client.
 *     "The brochure does not name individual team members" was printed
 *     to a customer.
 *   - The quote reference is never written into prose. The renderer
 *     draws it on the title page from the quote record.
 *   - No start dates — see the shared anti-invention rules in the
 *     engine, which both prompts carry.
 */

import type { ChapterRole } from "@shared/proposalChapters";

export interface SlotDef {
  slotIndex: number;
  chapterId: string;
  role?: ChapterRole;
  slotName: string;
  fillerType: "always-embed-first-page" | "embed-or-generate" | "always-generate";
  preferredTags: string[];
  generateTitle: string;
  generateGuidance: string;
}

/**
 * Appended to the guidance of chapters permitted to use a table.
 * Named chapters only (owner's decision, 17 Sep 2026). A chapter
 * without this text is governed by the blanket plain-text rule in both
 * prompts.
 */
export const TABLE_GUIDANCE =
  "You MAY use a table here where it genuinely helps. Format it as a markdown pipe table: a header row, then a row of dashes, then one row per entry, e.g. 'Control area | How it is delivered' on one line, then '--- | ---' on the next. Maximum FOUR columns — a wider table cannot be drawn and will be rendered as plain lines instead. Do not use any other markup: no asterisks for emphasis, no headings.";

/**
 * Appended to any chapter that should disappear when the evidence does
 * not call for it.
 *
 * The mechanism already existed and worked — the prompt tells the model
 * to return an empty body where guidance says "only include if", and
 * the assembler skips empty-bodied chapters. What was missing was the
 * instruction NOT to write a chapter explaining its own absence, which
 * is what produced two pages of "the tender does not specify…" in a
 * live document.
 */
export function onlyIf(condition: string): string {
  return ` ONLY include this chapter if ${condition}. If it does not, return an EMPTY body — do not write a single word, and in particular do NOT write a chapter explaining that the requirement was not mentioned, not specified or not in scope. An absent chapter is invisible to the reader; a chapter arguing for its own irrelevance is not.`;
}

/** Rules every generated chapter obeys, appended to each spine chapter. */
const HOUSE_RULES =
  " Never mention the supplier's own source documents to the reader — not the brochure, not the tender, not 'the information provided', and never that one of them lacks something. Never write the quote reference into the prose; it is printed on the title page automatically.";

/**
 * The seven chapters that open every proposal, in order.
 *
 * slotIndex is assigned by composeChapterSet, so a set can insert its
 * middle without renumbering by hand.
 */
const OPENING: Omit<SlotDef, "slotIndex">[] = [
  {
    chapterId: "cover",
    slotName: "Cover",
    fillerType: "always-embed-first-page",
    preferredTags: [],
    generateTitle: "",
    generateGuidance: "",
  },
  {
    chapterId: "title-page",
    slotName: "Title Page",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Title Page",
    generateGuidance:
      "Output exactly two short lines (separated by a blank line):\nLine 1: 'Proposal for {Client Name}' — use the exact client name from the quote facts, no extra words.\nLine 2: One single sentence of 8-12 words capturing the supplier's core value statement for THIS specific client. Plain, calm, professional. No marketing hyperbole.\nThe supplier's name, quote reference, and date are added automatically — do NOT include them. Do not use markdown.",
  },
  {
    chapterId: "executive-summary",
    slotName: "Executive Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Executive Summary",
    generateGuidance:
      "3–4 paragraphs. Open with a sentence that shows you understand THIS client's situation specifically (not generic industry-speak). Reference the client's own context, size and priorities as given in the evidence. State three priorities your service addresses for them. End with a confidence-building line about your operating model. State no dates." +
      HOUSE_RULES,
  },
  {
    chapterId: "about-the-supplier",
    slotName: "About the Supplier",
    fillerType: "embed-or-generate",
    preferredTags: ["about"],
    generateTitle: "About Us",
    generateGuidance:
      "Who the supplier is, how long they have operated, where they are based, the size and shape of the business, and the kinds of client they serve. Use only what the evidence states." +
      HOUSE_RULES,
  },
  {
    chapterId: "what-makes-us-different",
    slotName: "What Makes Us Different",
    fillerType: "embed-or-generate",
    preferredTags: ["usp"],
    generateTitle: "What Makes Us Different",
    generateGuidance:
      "The three or four things that genuinely distinguish this supplier, drawn from the evidence rather than invented. Concrete beats adjectival: an accreditation, a response commitment or a way of working beats 'passionate about quality'." +
      HOUSE_RULES,
  },
  {
    chapterId: "track-record",
    slotName: "Track Record",
    fillerType: "embed-or-generate",
    preferredTags: ["track-record", "testimonial"],
    generateTitle: "Track Record",
    generateGuidance:
      "Comparable work, client types, length of relationships, and any measurable results the evidence states. Where the evidence gives none, describe the kind of work undertaken without inventing figures or naming clients." +
      HOUSE_RULES,
  },
  {
    chapterId: "understanding-requirements",
    slotName: "Understanding Your Requirements",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Understanding Your Requirements",
    generateGuidance:
      "Restate the client's requirement in your own words to demonstrate you have read it properly: what they need, where, at what scale, and any constraints they have stated. This chapter proves comprehension — it must not introduce anything the evidence does not contain." +
      HOUSE_RULES,
  },
];

/** The four chapters that close every proposal, in order. */
const CLOSING: Omit<SlotDef, "slotIndex">[] = [
  {
    chapterId: "pricing-summary",
    role: "pricing",
    slotName: "Pricing Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Pricing Summary",
    generateGuidance:
      "Write a SHORT intro of 2-3 sentences ONLY. Frame the pricing approach in plain English (e.g. 'Our pricing separates one-off work from ongoing monthly services, with all costs based on the scope agreed with you.'). Do NOT write any line items, prices, totals, percentages, monthly figures, or numerical breakdowns of any kind — these are rendered as a structured table immediately below your prose, drawn directly from the quote's line items. Anything you write containing a £ amount or a numerical total will be redundant with the table that follows." +
      HOUSE_RULES,
  },
  {
    chapterId: "contract-terms",
    slotName: "Contract Terms",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Contract Terms",
    generateGuidance:
      "Contract length, notice period, review arrangements and how changes in scope are handled. Use only the posture the evidence states. State no commencement date and no first invoice month." +
      HOUSE_RULES,
  },
  {
    chapterId: "why-us",
    slotName: "Why Us",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Why Us — In Summary",
    generateGuidance:
      "One tight closing paragraph drawing together the strongest specific reasons to appoint this supplier for THIS engagement. No new facts, no new numbers." +
      HOUSE_RULES,
  },
  {
    chapterId: "call-to-action",
    slotName: "Call to Action",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Next Steps",
    generateGuidance:
      "What happens next, in two short paragraphs: the conversation being proposed, and how to make contact using the details in the evidence. Low pressure. No dates." +
      HOUSE_RULES,
  },
];

/**
 * Build a complete chapter set: the shared opening, the sector's own
 * middle, then the shared closing, numbered from 1.
 *
 * Numbering is derived rather than written down, so inserting a chapter
 * into a middle cannot silently renumber another set — and since
 * Chunk 2 a chapter is identified by its chapterId anyway, the index is
 * only an ordering.
 */
export function composeChapterSet(middle: Omit<SlotDef, "slotIndex">[]): SlotDef[] {
  return [...OPENING, ...middle, ...CLOSING].map((def, i) => ({
    ...def,
    slotIndex: i + 1,
  }));
}

/** Appended to every middle chapter, so sector files stay readable. */
export function houseRules(guidance: string): string {
  return guidance + HOUSE_RULES;
}
