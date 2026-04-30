/**
 * Branded proposal engine.
 *
 * Phase 4B Delivery A. Takes a tender's evidence (user-supplied tender
 * text — typically the extracted text from a tender PDF) plus the
 * org's stored brochure knowledge, and produces an ordered list of
 * chapter slots that the assembler will turn into the final PDF.
 *
 * Each slot is either:
 *   - source = "embed": the assembler copies a brochure page verbatim
 *     into the final PDF at this position. Used for chapters that have
 *     a clean, self-contained brochure page that fits the slot's
 *     purpose (typically About / USP / Track Record).
 *   - source = "generate": the assembler renders this chapter's text
 *     to a fresh PDF page using pdf-lib. Used for tender-specific
 *     chapters (Understanding Your Needs, Service Delivery) and any
 *     embed-or-generate slot where no clean brochure page matched.
 *
 * Key design points:
 *   - Slot-to-page pairing is deterministic. We don't ask the AI which
 *     page goes where — we just walk the slot definitions in order and
 *     pick the first clean page with a matching tag, marking it used
 *     so it can't be assigned twice.
 *   - The narrative-generation Claude call is told which slots will be
 *     filled by embedded brochure pages, so adjacent chapters don't
 *     repeat that content.
 *   - All Claude calls run at temperature 0.1 (the determinism default
 *     established in the previous session's D1 work).
 *
 * Ported from scripts/branded-proof/src/generateNarrative.ts. The slot
 * definitions and prompts are unchanged; the Claude integration uses
 * the live invokeClaude helper instead of the proof's standalone client.
 */

import { invokeClaude } from "../_core/claude";
import type { BrochureKnowledge } from "../services/brochureExtractor";

// ─── Public types ────────────────────────────────────────────────────

export type ChapterSlot =
  | {
      slotIndex: number;
      slotName: string;
      source: "embed";
      brochurePageNumber: number;
      reason: string;
    }
  | {
      slotIndex: number;
      slotName: string;
      source: "generate";
      title: string;
      body: string;
    };

export interface BrandedProposalDraft {
  slots: ChapterSlot[];
  /**
   * The final PDF will use the brochure's page dimensions throughout
   * (so embedded brochure pages and generated narrative pages are the
   * same size — no jarring transitions). The assembler reads this off
   * the brochure file directly, but we surface tokens for cost
   * reporting.
   */
  tokenUsage: {
    inputTokens: number;
    outputTokens: number;
  };
}

// ─── Quote context — Phase 4B Delivery D, Phase 1 ────────────────────
//
// The structured data attached to the quote that the engine and the
// assembler need in order to:
//
//   - render a real client name on the cover (Phase 2)
//   - keep narrative chapters anchored to contractual specifics from
//     the line items rather than letting the AI invent numbers
//     (Phase 2)
//   - render a real pricing table from the quote's line items rather
//     than letting the AI write generic prose (Phase 3)
//
// PHASE 1 SCOPE: this type is defined and threaded through the
// engine + assembler call signatures, but neither function reads from
// it yet. Phase 1 is plumbing-only so a regression after deploy can
// only have come from the new arguments being passed, not from prompt
// or rendering changes.
//
// Field choices:
//   - All fields are optional so legacy callers (none in production
//     today, but defensive against future test harnesses) can omit
//     anything they don't have.
//   - `taxRate` is a number (e.g. 20 for 20%), already parsed from the
//     decimal column at the router boundary. This keeps prompt-side
//     and assembler-side code free of decimal-string parsing.
//   - `lineItems` carries only the fields the renderer needs. We don't
//     forward every column from quote_line_items because most are
//     irrelevant (createdAt, updatedAt, phaseId etc.) and including
//     them wastes prompt tokens once Phase 2 wires this into Claude.

export interface QuoteContextLineItem {
  description: string;
  quantity: number;
  unit: string;
  rate: number;
  total: number;
  /**
   * One of "standard" (one-off, default), "monthly", "annual",
   * "optional". Matches the existing pdfGenerator grouping. Optional
   * items are shown but excluded from the headline totals.
   */
  pricingType: "standard" | "monthly" | "annual" | "optional";
  sortOrder: number;
}

export interface QuoteContext {
  /** The quote's client / customer name. Used for the cover and exec
   *  summary in Phase 2. Renders as "Your Organisation" if absent. */
  clientName?: string | null;
  /** Optional contact person at the client. Used in salutations. */
  contactName?: string | null;
  /** Optional contact email. Currently unused; reserved for a later
   *  delivery that adds a "How to reach us" appendix. */
  clientEmail?: string | null;
  /** The quote's own title (e.g. "IT Support, Security, and Website
   *  Development"). Used as the proposal title on the cover. */
  title?: string | null;
  /** The quote reference (e.g. "Q-187"). Used in the cover ref block
   *  and the rendered PDF filename. */
  reference?: string | null;
  /** VAT rate as a number (e.g. 20 for 20%). 0 means VAT not applied. */
  taxRate?: number;
  /** All line items on the quote, ordered by sortOrder. */
  lineItems?: QuoteContextLineItem[];
}

// ─── Slot index constants — Phase 4B Delivery D Phase 3 ──────────────
//
// The assembler needs to dispatch slot 15 to a custom renderer (one
// that draws a real pricing table from the quote's line items rather
// than rendering the AI's prose body verbatim). Exporting a named
// constant beats sprinkling the magic number `15` across files —
// reorder the SLOT_DEFS later and the constant is the single source
// of truth that needs updating.

export const PRICING_SLOT_INDEX = 16;

// ─── Slot definitions ────────────────────────────────────────────────
// The 19 chapter slots that match the Manus Headway proposal structure.
//
// Phase 4B Delivery E.4.3 — slot 1 (Cover) changed from generated
// content to "always-embed-first-page" (brochure page 1 verbatim is
// the proposal cover). New slot 2 (Title Page) inserted to carry the
// formal "Proposal for X" content that previously lived on slot 1.
// All subsequent slots renumbered +1 (PRICING was 15, now 16).
//
// fillerType:
//   "always-embed-first-page": ignore brochure classification; always
//     embed brochure page 1. Used for the new cover slot which IS the
//     brochure's own cover by definition.
//   "embed-or-generate": prefer to embed a brochure page if a clean
//     one with a matching tag exists; otherwise generate text from
//     facts.
//   "always-generate": this slot is too tender-specific to ever embed.

interface SlotDef {
  slotIndex: number;
  slotName: string;
  fillerType: "always-embed-first-page" | "embed-or-generate" | "always-generate";
  preferredTags: string[];
  generateTitle: string;
  generateGuidance: string;
}

const SLOT_DEFS: SlotDef[] = [
  {
    // Phase 4B Delivery E.4.3 — Cover IS the brochure's own first page.
    // No generation, no overlay, no logo from Settings (the brochure
    // page already carries the supplier's brand identity). Page 1
    // verbatim is the proposal's cover.
    slotIndex: 1,
    slotName: "Cover",
    fillerType: "always-embed-first-page",
    preferredTags: [],
    generateTitle: "",
    generateGuidance: "",
  },
  {
    // Phase 4B Delivery E.4.3 — formal title page. "Proposal for X"
    // with the supplier's logo, quote reference, and date. This is
    // what the old Cover slot used to render before E.4.3 split the
    // brochure cover and the formal title page into two slots.
    slotIndex: 2,
    slotName: "Title Page",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Title Page",
    generateGuidance:
      "Output exactly two short lines (separated by a blank line):\nLine 1: 'Proposal for {Client Name}' — use the exact client name from the tender, no extra words.\nLine 2: One single sentence of 8-12 words capturing the supplier's core value statement for THIS specific client. Plain, calm, professional. No marketing hyperbole.\nThe supplier's name, quote reference, and date are added automatically — do NOT include them. Do not use markdown.",
  },
  {
    slotIndex: 3,
    slotName: "Executive Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Executive Summary",
    generateGuidance:
      "3–4 paragraphs. Open with a sentence that shows you understand THIS client's situation specifically (not generic industry-speak). Reference the client's mission/sector/size. State three priorities your service addresses for them. End with a confidence-building line about your operating model.",
  },
  {
    slotIndex: 4,
    slotName: "About the Supplier",
    fillerType: "embed-or-generate",
    preferredTags: ["about"],
    generateTitle: "About Us",
    generateGuidance:
      "Use ONLY the facts the brochure provides about company history, location, focus. Do not invent founding dates, locations, founders, or certifications. 2–3 paragraphs.",
  },
  {
    slotIndex: 5,
    slotName: "What Makes Us Different",
    fillerType: "embed-or-generate",
    preferredTags: ["usp"],
    generateTitle: "What Makes Us Different",
    generateGuidance:
      "Use ONLY the USPs the brochure states. Tie each USP to a specific tender requirement where reasonable. Don't pad — if there are 3 USPs, write about 3.",
  },
  {
    slotIndex: 6,
    slotName: "Track Record",
    fillerType: "embed-or-generate",
    preferredTags: ["track-record", "testimonial"],
    generateTitle: "Track Record",
    generateGuidance:
      "Use ONLY the metrics or social proof the brochure states (e.g. SLA percentages, review scores, testimonial themes). If the brochure has none, write a brief paragraph about retention and client relationships without inventing statistics.",
  },
  {
    slotIndex: 7,
    slotName: "Understanding Your Requirements",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Understanding Your Requirements",
    generateGuidance:
      "Read the tender carefully and restate the client's situation in your own words. Mention specific numbers (user count, sites, technology stack) the tender provides. Show comprehension, not regurgitation.",
  },
  {
    slotIndex: 8,
    slotName: "Proposed Service Delivery",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Proposed Service Delivery",
    generateGuidance:
      "Map the tender's scope of services to your delivery commitments. Use the brochure's service descriptions for HOW you deliver each, but the structure follows the tender's scope sections, not the brochure's sales order.",
  },
  {
    slotIndex: 9,
    slotName: "Cloud Migration Approach",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Cloud Migration Approach",
    generateGuidance:
      "Only include this chapter if the tender mentions cloud migration. Outline a discovery-led, phased approach. 6 stages: assess → plan → migrate → test → train → document. Keep it generic-but-credible — no invented timelines.",
  },
  {
    slotIndex: 10,
    slotName: "Cybersecurity & Compliance",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Cybersecurity & Compliance",
    generateGuidance:
      "Cover the controls the tender expects (GDPR, MFA, endpoint protection, email protection, backup verification, secure operations). Brief table-of-controls format works well here.",
  },
  {
    slotIndex: 11,
    slotName: "Disaster Recovery & Continuity",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Disaster Recovery & Business Continuity",
    generateGuidance:
      "DR plan, annual review, annual testing, backup verification, secure handling of test data. Match what the tender asks for if those details are present.",
  },
  {
    slotIndex: 12,
    slotName: "Website Hosting & Support",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Website Hosting & Support",
    generateGuidance:
      "Only include if the tender mentions a website. Cover hosting type, SSL, plugin updates, support hours per month. Match the tender's specific language (e.g. WordPress, VPS).",
  },
  {
    slotIndex: 13,
    slotName: "Service Level Agreement",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Service Level Agreement",
    generateGuidance:
      "Response times, resolution targets, escalation, reporting, review meetings. Match the tender's stated SLA expectations precisely where given.",
  },
  {
    slotIndex: 14,
    slotName: "Implementation & Onboarding",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Implementation & Onboarding",
    generateGuidance:
      "Discovery → Audit → Tooling → Stabilisation → Optimisation. Phased approach with clear outcomes per phase.",
  },
  {
    slotIndex: 15,
    slotName: "Key Personnel",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Key Personnel",
    generateGuidance:
      "Use ONLY names and roles explicitly named in the brochure. If the brochure names no one, describe the team in role terms only (helpdesk-led, account-managed) without inventing names.",
  },
  {
    slotIndex: 16,
    slotName: "Pricing Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Pricing Summary",
    generateGuidance:
      "Write a SHORT intro of 2-3 sentences ONLY. Frame the pricing approach in plain English (e.g. 'Our pricing separates one-off project work from ongoing monthly services, with all costs based on the scope agreed in your tender.'). Do NOT write any line items, prices, totals, percentages, monthly figures, or numerical breakdowns of any kind — these are rendered as a structured table immediately below your prose, drawn directly from the quote's line items. Anything you write that contains a £ amount or a numerical total will be redundant with the table that follows.",
  },
  {
    slotIndex: 17,
    slotName: "Contract Terms",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Contract Terms",
    generateGuidance:
      "Contract length, notice period, performance basis. Use the brochure's stated contract posture (e.g. no long contracts, 3-month rolling) if present. 2–3 short paragraphs.",
  },
  {
    slotIndex: 18,
    slotName: "Why Us",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Why Us — In Summary",
    generateGuidance:
      "One concise paragraph pulling together the top 3–4 reasons (drawn from the brochure's USPs and the tender's stated priorities) why this supplier fits this client.",
  },
  {
    slotIndex: 19,
    slotName: "Call to Action",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Next Steps",
    generateGuidance:
      "Invitation to a clarification meeting or discovery session. Two short paragraphs. Warm but professional.",
  },
];

// ─── Helpers ─────────────────────────────────────────────────────────

function extractJson<T>(text: string): T {
  let cleaned = text.trim();
  if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```(?:json)?\s*/, "").replace(/\s*```$/, "");
  }
  try {
    return JSON.parse(cleaned) as T;
  } catch {
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
      throw new Error(`Malformed JSON: ${text.slice(0, 200)}`);
    }
    return JSON.parse(cleaned.slice(firstBrace, lastBrace + 1)) as T;
  }
}

interface NarrativeChapterFromAI {
  slotIndex: number;
  title: string;
  body: string;
}

// ─── Quote-facts prompt helpers — Phase 4B Delivery D Phase 2 ────────
//
// The engine's two AI calls (initial draft + per-chapter regenerate)
// both need to put the quote's structured data in front of the model
// in a way that's:
//
//   1. Visually distinct from the tender text and brochure facts so
//      the model can apply different trust levels (line items =
//      contractual truth, brochure = supplier capability claims).
//   2. Compact enough not to blow the prompt token budget, but
//      complete enough that scope-relevant detail (e.g. "4-hour
//      response SLA" buried in a sub-bullet of a line item) survives.
//   3. Resilient — when a field is missing (Q-187 has no clientName)
//      we don't crash; we hand the model an explicit fallback so it
//      knows to use the placeholder rather than invent something.

/**
 * Render a single line item description with its sub-bullets / numbered
 * steps as the human-facing PDF generator does (see
 * server/pdfGenerator.ts ~line 72). Same convention:
 *   - "||"  → bullet separator (sub-detail items)
 *   - "##"  → numbered step separator (multi-step scope)
 *
 * Reusing the convention is important: line items often carry the
 * actual contractual specifics (SLAs, scope inclusions, exclusions) in
 * their sub-bullets. If we only fed the AI the description's first
 * line, "Silver IT Support — Unlimited Remote — Managed IT support
 * contract per named user" would surface but "Ticket-based support
 * with 4-hour response SLA" would not — and 4-hour is exactly the
 * fact the narrative chapters were inventing wrong before this fix.
 */
function formatLineItemForPrompt(li: QuoteContextLineItem): string {
  const desc = (li.description || "(no description)").trim();
  const rate = li.rate.toFixed(2);
  const qty = li.quantity;
  const unit = li.unit || "each";

  // Numbered steps take precedence over bullets if both are present
  // (matches pdfGenerator's ordering).
  if (desc.includes("##")) {
    const parts = desc.split("##").map((p) => p.trim()).filter(Boolean);
    const summary = parts[0];
    const steps = parts.slice(1);
    const header = `    - ${summary} (qty ${qty} ${unit} @ £${rate})`;
    if (steps.length === 0) return header;
    return [header, ...steps.map((s, i) => `        ${i + 1}. ${s}`)].join("\n");
  }
  if (desc.includes("||")) {
    const parts = desc.split("||").map((p) => p.trim()).filter(Boolean);
    const summary = parts[0];
    const bullets = parts.slice(1);
    const header = `    - ${summary} (qty ${qty} ${unit} @ £${rate})`;
    if (bullets.length === 0) return header;
    return [header, ...bullets.map((b) => `        • ${b}`)].join("\n");
  }
  return `    - ${desc} (qty ${qty} ${unit} @ £${rate})`;
}

/**
 * Render the full QuoteContext as a structured prompt block. This is
 * the single place that decides what the AI sees about a quote — so
 * every prompt change for fact-discipline goes here, not duplicated
 * across the two AI-call functions.
 *
 * Special handling:
 *   - clientName empty → explicit fallback note. The AI must use
 *     "Your Organisation" on the cover rather than fabricate.
 *   - taxRate 0 → omitted entirely. Some users aren't VAT-registered
 *     and a "VAT rate: 0%" line would be misleading.
 *   - Empty line item list → explicit "(none recorded yet)" so the
 *     AI doesn't silently assume there are line items it hasn't been
 *     shown.
 *   - Line items grouped by pricingType. The cadence matters when
 *     writing: monthly recurring vs one-off vs optional has different
 *     contractual implications, and the chapter narrative should not
 *     describe a one-off project as a monthly subscription.
 */
function buildQuoteFactsBlock(qc: QuoteContext | undefined): string {
  if (!qc) return "(no quote facts available)";

  const lines: string[] = [];

  if (qc.clientName && qc.clientName.trim().length > 0) {
    lines.push(`Client name: ${qc.clientName}`);
  } else {
    lines.push(
      `Client name: (NOT SET — when chapter copy needs the client's name, use the placeholder "Your Organisation" on the cover, and "your organisation" / "you" / "your business" in body prose. Do NOT invent a name.)`,
    );
  }
  if (qc.title && qc.title.trim().length > 0) {
    lines.push(`Proposal title: ${qc.title}`);
  } else {
    lines.push(
      `Proposal title: (NOT SET — invent a sensible title from the tender scope.)`,
    );
  }
  if (qc.reference) lines.push(`Quote reference: ${qc.reference}`);
  if (qc.contactName) lines.push(`Client contact: ${qc.contactName}`);
  if (typeof qc.taxRate === "number" && qc.taxRate > 0) {
    lines.push(`VAT rate: ${qc.taxRate}%`);
  }

  const items = qc.lineItems ?? [];
  if (items.length === 0) {
    lines.push("");
    lines.push(
      "Line items: (none recorded yet — be vague about service specifics rather than invent them)",
    );
    return lines.join("\n");
  }

  lines.push("");
  lines.push(
    "Line items (the contractual scope being delivered — every number, SLA, and inclusion below is the truth and overrides anything else):",
  );

  const byType: Record<string, QuoteContextLineItem[]> = {
    standard: [],
    monthly: [],
    annual: [],
    optional: [],
  };
  for (const li of items) {
    byType[li.pricingType].push(li);
  }

  const groups: Array<[string, string]> = [
    ["standard", "One-off / standard items:"],
    ["monthly", "Monthly recurring items:"],
    ["annual", "Annual recurring items:"],
    ["optional", "Optional add-ons (offered but not in the headline totals):"],
  ];

  for (const [key, label] of groups) {
    const group = byType[key];
    if (!group || group.length === 0) continue;
    lines.push(`  ${label}`);
    for (const li of group) {
      lines.push(formatLineItemForPrompt(li));
    }
  }

  return lines.join("\n");
}

// ─── Authority hierarchy — applied to both AI calls ──────────────────
//
// Phase 4B Delivery D Phase 2. This block is appended to both
// system prompts (initial draft and regenerate) so the model has the
// same fact-discipline constraints whichever path it's taking.
//
// The named examples ("8-hour SLA", "1TB OneDrive", "99.9% uptime",
// "£49 per workstation setup", "50GB Exchange Email") are taken
// directly from the prior live Q-187 output where the model
// hallucinated industry defaults. Calling them out by name in the
// prompt is the strongest deterrent — softer rules ("don't invent
// statistics") have proven insufficient because the model interprets
// gaps in the tender as licence to fill in plausible defaults.

const AUTHORITY_HIERARCHY_RULES = `
AUTHORITY HIERARCHY — when sources conflict or you need a specific number, follow this ranking:

1. QUOTE LINE ITEMS are the contractual truth. If a line item or its sub-bullets specify "4-hour response SLA", "£18 per user", "ESET at £4 per device", "Silver Support for 6 users", or any other concrete fact — that is exactly what is being delivered. Reflect it accurately in chapter narrative or stay vague — NEVER contradict.

2. TENDER TEXT is the client's stated requirements and context. Use it to understand what they need, what their environment looks like, and what specific concerns to address.

3. BROCHURE FACTS are the supplier's general capability claims and credentials. Use them for "About Us"-style content (history, location, team size, awards, testimonials), and for capability descriptions ("our backup uses zero-knowledge architecture") — but NOT to assert engagement-specific commitments. The brochure says what the supplier CAN do; the line items say what THIS engagement IS.

4. ANYTHING ELSE is forbidden. Do NOT invent: response times, storage allocations (e.g. "1TB OneDrive per user"), mailbox sizes (e.g. "50GB Exchange Email"), uptime guarantees (e.g. "99.9% uptime"), included service hours (e.g. "6 hours per month"), per-workstation setup fees (e.g. "£49 per workstation"), certifications, scope items, or any other specific number not present in the line items, tender, or brochure.

If you find yourself reaching for a default like "8-hour SLA" or "1TB OneDrive" or "99.9% uptime" or "£49 per workstation" — STOP. Check the line items first, then the tender, then the brochure. If the number isn't in any of those, omit the sentence or hedge with phrasing like "as set out in your line items", "per the contract terms below", or "in line with the scope agreed with you". Capability statements ("we provide secure cloud backup") are fine; specific commitments ("with 99.9% uptime") are not, unless the line items or tender say so.
`.trim();

// ─── Public entry point ──────────────────────────────────────────────

/**
 * Build the chapter slot list for a branded proposal. Two phases:
 *   1. Pure-logic slot planning: walk SLOT_DEFS, pair each
 *      embed-or-generate slot to the first matching clean brochure
 *      page (deterministic — no AI in this step).
 *   2. AI narrative pass: send Claude the tender text + brochure facts
 *      + the slots that need text, get back chapter content.
 *
 * Returns the full ordered slot list ready for the assembler.
 */
export async function generateBrandedProposalDraft(params: {
  tenderText: string;
  brochureKnowledge: BrochureKnowledge;
  /**
   * Phase 4B Delivery D Phase 1 — structured data from the quote
   * record. Optional (legacy callers and tests omit it). Phase 1
   * stores but does not read from this; Phase 2 will wire it into
   * the cover and narrative prompts so chapters stop inventing
   * numbers and the cover stops saying "Your Organisation".
   */
  quoteContext?: QuoteContext;
}): Promise<BrandedProposalDraft> {
  // ── Phase 1: deterministic slot-to-page pairing ───────────────────
  const slotPlan: Array<
    | {
        type: "embed";
        slotIndex: number;
        slotName: string;
        brochurePageNumber: number;
        tag: string;
      }
    | { type: "generate"; def: SlotDef }
  > = [];

  const usedPages = new Set<number>();

  for (const def of SLOT_DEFS) {
    if (def.fillerType === "always-embed-first-page") {
      // Phase 4B Delivery E.4.3 — Cover slot. Brochure page 1 is
      // ALWAYS the proposal cover, regardless of how the brochure
      // extractor classified that page (some brochures don't
      // self-identify their first page as "cover" but it's still
      // the cover by convention).
      usedPages.add(1);
      slotPlan.push({
        type: "embed",
        slotIndex: def.slotIndex,
        slotName: def.slotName,
        brochurePageNumber: 1,
        tag: "cover",
      });
      continue;
    }

    if (def.fillerType === "always-generate") {
      slotPlan.push({ type: "generate", def });
      continue;
    }

    const match = params.brochureKnowledge.classifications.find(
      (c: BrochureKnowledge["classifications"][number]) =>
        c.clarity === "clean" &&
        def.preferredTags.includes(c.tag) &&
        !usedPages.has(c.pageNumber),
    );

    if (match) {
      usedPages.add(match.pageNumber);
      slotPlan.push({
        type: "embed",
        slotIndex: def.slotIndex,
        slotName: def.slotName,
        brochurePageNumber: match.pageNumber,
        tag: match.tag,
      });
    } else {
      slotPlan.push({ type: "generate", def });
    }
  }

  // ── Phase 2: AI narrative pass ────────────────────────────────────
  const slotsToGenerate = slotPlan.filter((s) => s.type === "generate") as Array<{
    type: "generate";
    def: SlotDef;
  }>;
  const embeddedSlotsContext = slotPlan
    .filter((s) => s.type === "embed")
    .map(
      (s: any) =>
        `  - Slot ${s.slotIndex} (${s.slotName}) is filled by embedding brochure page ${s.brochurePageNumber} (tag: ${s.tag}). Do NOT regenerate this content in adjacent chapters.`,
    )
    .join("\n");

  const factsByTag: Record<string, string[]> = {};
  for (const c of params.brochureKnowledge.classifications) {
    if (c.facts.length === 0) continue;
    if (!factsByTag[c.tag]) factsByTag[c.tag] = [];
    factsByTag[c.tag].push(...c.facts);
  }
  const factsBlock = Object.entries(factsByTag)
    .map(
      ([tag, facts]) =>
        `${tag.toUpperCase()}:\n${facts.map((f) => `  - ${f}`).join("\n")}`,
    )
    .join("\n\n");

  const slotInstructions = slotsToGenerate
    .map(
      (s) =>
        `## Slot ${s.def.slotIndex} — ${s.def.slotName}\nTitle: "${s.def.generateTitle}"\nGuidance: ${s.def.generateGuidance}`,
    )
    .join("\n\n");

  const system = `You are writing a B2B services proposal. The structure is fixed: 18 chapter slots. Some slots will be filled by embedding the supplier's brochure pages verbatim. You are writing the OTHER slots — the ones that need generated text.

CRITICAL RULES:
1. Use ONLY facts that are explicitly provided to you (quote line items + tender text + brochure facts). Never invent: founding dates, founder names, certifications, locations, contract lengths, statistics, customer counts, employee counts, awards.
2. Reference SPECIFIC details from the tender (user count, site count, technology names, sector type, mission). The proposal must read as written for THIS client, not a template.
3. Where the brochure provides facts (USPs, service descriptions, contract posture), USE THEM verbatim or near-verbatim. Don't paraphrase loosely and lose the specificity.
4. No marketing waffle. No "leveraging synergies" or "best-in-class". Plain, confident, professional UK English.
5. No source attribution superscripts. No footnotes.
6. If a slot's guidance says "only include if the tender mentions X" and the tender doesn't mention X, return an empty body for that slot (just the title) — the assembly step will skip it.

${AUTHORITY_HIERARCHY_RULES}

When chapter content needs the CLIENT'S NAME, use the value of "Client name:" from the Quote Facts block. When it needs the PROPOSAL TITLE (e.g. on the cover), use the value of "Proposal title:" from the Quote Facts block. Follow the explicit fallback instructions if either field is marked NOT SET.

Return ONLY valid JSON in this exact shape:
{
  "chapters": [
    { "slotIndex": 1, "title": "...", "body": "..." },
    ...
  ]
}

The body should be plain text with double-newlines (\\n\\n) between paragraphs. No HTML, no markdown, no headings inside body.`;

  const user = `# Quote facts (the contractual scope being delivered)
${buildQuoteFactsBlock(params.quoteContext)}

# Tender text
${params.tenderText.slice(0, 8000)}

# Brochure facts (organised by page purpose)
${factsBlock || "(none extracted)"}

# Slots already filled by embedded brochure pages
${embeddedSlotsContext || "(none)"}

# Slots you must write
${slotInstructions}`;

  const result = await invokeClaude({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 8192,
    temperature: 0.1,
  });

  const parsed = extractJson<{ chapters: NarrativeChapterFromAI[] }>(result.content);
  const generatedBySlot = new Map<number, NarrativeChapterFromAI>();
  for (const ch of parsed.chapters || []) {
    if (typeof ch.slotIndex === "number") {
      generatedBySlot.set(ch.slotIndex, ch);
    }
  }

  // Zip the slot plan with generated content into the final ChapterSlot[]
  const slots: ChapterSlot[] = slotPlan.map((s) => {
    if (s.type === "embed") {
      // Phase 4B Delivery E.4.3 — Cover slot has a different reason
      // text. It's not a brochure-classification match, it's a
      // hard-coded "page 1 is your cover" rule.
      const reason =
        s.slotName === "Cover"
          ? "Page 1 of your brochure is the proposal cover"
          : `Brochure page ${s.brochurePageNumber} classified as "${s.tag}" with clean clarity`;
      return {
        slotIndex: s.slotIndex,
        slotName: s.slotName,
        source: "embed",
        brochurePageNumber: s.brochurePageNumber,
        reason,
      };
    }
    const gen = generatedBySlot.get(s.def.slotIndex);
    return {
      slotIndex: s.def.slotIndex,
      slotName: s.def.slotName,
      source: "generate",
      title: gen?.title ?? s.def.generateTitle,
      body: (gen?.body ?? "").trim(),
    };
  });

  return {
    slots,
    tokenUsage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}

/**
 * Regenerate a single chapter — used by the workspace's per-chapter
 * regenerate button (Delivery C). Re-runs only the targeted slot's
 * narrative generation, keeping all other slots unchanged. Cheaper
 * and faster than regenerating the whole document.
 *
 * Embedded slots can't be regenerated (the brochure page is fixed).
 * Calling this with an embed slot index is a no-op that returns the
 * existing slot unchanged.
 */
export async function regenerateSingleChapter(params: {
  slotIndex: number;
  currentSlots: ChapterSlot[];
  tenderText: string;
  brochureKnowledge: BrochureKnowledge;
  /**
   * Phase 4B Delivery D Phase 1 — same structured quote data the
   * draft endpoint receives. Optional. Phase 1 stores but does not
   * read from this; Phase 2 will use it to keep regenerated chapters
   * factually consistent with the line items.
   */
  quoteContext?: QuoteContext;
}): Promise<{ slot: ChapterSlot; tokenUsage: { inputTokens: number; outputTokens: number } }> {
  const target = params.currentSlots.find((s) => s.slotIndex === params.slotIndex);
  if (!target) {
    throw new Error(`Slot ${params.slotIndex} not found`);
  }
  if (target.source === "embed") {
    // Can't regenerate an embedded brochure page — return as-is.
    return { slot: target, tokenUsage: { inputTokens: 0, outputTokens: 0 } };
  }

  const def = SLOT_DEFS.find((d) => d.slotIndex === params.slotIndex);
  if (!def) {
    throw new Error(`No slot definition for index ${params.slotIndex}`);
  }

  // Build context about what other slots contain (so the regenerated
  // chapter doesn't conflict). Just titles + a one-line summary.
  const otherSlotsContext = params.currentSlots
    .filter((s) => s.slotIndex !== params.slotIndex)
    .map((s) => {
      if (s.source === "embed") {
        return `  - Slot ${s.slotIndex} (${s.slotName}): embedded brochure page ${s.brochurePageNumber}`;
      }
      const preview = s.body.split("\n")[0]?.slice(0, 100) || "(empty)";
      return `  - Slot ${s.slotIndex} (${s.slotName}): "${preview}…"`;
    })
    .join("\n");

  const factsByTag: Record<string, string[]> = {};
  for (const c of params.brochureKnowledge.classifications) {
    if (c.facts.length === 0) continue;
    if (!factsByTag[c.tag]) factsByTag[c.tag] = [];
    factsByTag[c.tag].push(...c.facts);
  }
  const factsBlock = Object.entries(factsByTag)
    .map(
      ([tag, facts]) =>
        `${tag.toUpperCase()}:\n${facts.map((f) => `  - ${f}`).join("\n")}`,
    )
    .join("\n\n");

  const system = `You are rewriting a SINGLE chapter of an existing B2B services proposal. Same rules as before:

1. Use ONLY facts explicitly provided. Never invent dates, names, certifications, locations, statistics.
2. Reference specific tender details — make it read as written for THIS client.
3. No marketing waffle, no source attribution superscripts.

${AUTHORITY_HIERARCHY_RULES}

When chapter content needs the CLIENT'S NAME, use the value of "Client name:" from the Quote Facts block. When it needs the PROPOSAL TITLE, use the value of "Proposal title:" from the Quote Facts block. Follow the explicit fallback instructions if either field is marked NOT SET.

Return ONLY valid JSON:
{ "slotIndex": ${params.slotIndex}, "title": "...", "body": "..." }`;

  const user = `# Quote facts (the contractual scope being delivered)
${buildQuoteFactsBlock(params.quoteContext)}

# Chapter to rewrite
Slot ${def.slotIndex} — ${def.slotName}
Title: "${def.generateTitle}"
Guidance: ${def.generateGuidance}

# Other chapters in the proposal (for context — don't duplicate their content)
${otherSlotsContext}

# Tender text
${params.tenderText.slice(0, 8000)}

# Brochure facts
${factsBlock || "(none)"}`;

  // Slightly higher temperature for regeneration — gives the user a
  // genuinely different result rather than the same paragraph back.
  const result = await invokeClaude({
    system,
    messages: [{ role: "user", content: user }],
    maxTokens: 2048,
    temperature: 0.4,
  });

  const parsed = extractJson<NarrativeChapterFromAI>(result.content);

  const slot: ChapterSlot = {
    slotIndex: def.slotIndex,
    slotName: def.slotName,
    source: "generate",
    title: parsed.title || def.generateTitle,
    body: (parsed.body || "").trim(),
  };

  return {
    slot,
    tokenUsage: {
      inputTokens: result.usage.inputTokens,
      outputTokens: result.usage.outputTokens,
    },
  };
}
