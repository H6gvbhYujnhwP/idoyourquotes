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

// ─── Slot definitions ────────────────────────────────────────────────
// The 18 chapter slots that match the Manus Headway proposal structure.
// fillerType:
//   "embed-or-generate": prefer to embed a brochure page if a clean one
//     with a matching tag exists; otherwise generate text from facts.
//   "always-generate": this slot is too tender-specific to ever embed.

interface SlotDef {
  slotIndex: number;
  slotName: string;
  fillerType: "embed-or-generate" | "always-generate";
  preferredTags: string[];
  generateTitle: string;
  generateGuidance: string;
}

const SLOT_DEFS: SlotDef[] = [
  {
    slotIndex: 1,
    slotName: "Cover",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Cover Page",
    generateGuidance:
      "Title of the proposal, the client's name, the supplier's name, and a one-line value statement. Plain, calm, professional.",
  },
  {
    slotIndex: 2,
    slotName: "Executive Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Executive Summary",
    generateGuidance:
      "3–4 paragraphs. Open with a sentence that shows you understand THIS client's situation specifically (not generic industry-speak). Reference the client's mission/sector/size. State three priorities your service addresses for them. End with a confidence-building line about your operating model.",
  },
  {
    slotIndex: 3,
    slotName: "About the Supplier",
    fillerType: "embed-or-generate",
    preferredTags: ["about"],
    generateTitle: "About Us",
    generateGuidance:
      "Use ONLY the facts the brochure provides about company history, location, focus. Do not invent founding dates, locations, founders, or certifications. 2–3 paragraphs.",
  },
  {
    slotIndex: 4,
    slotName: "What Makes Us Different",
    fillerType: "embed-or-generate",
    preferredTags: ["usp"],
    generateTitle: "What Makes Us Different",
    generateGuidance:
      "Use ONLY the USPs the brochure states. Tie each USP to a specific tender requirement where reasonable. Don't pad — if there are 3 USPs, write about 3.",
  },
  {
    slotIndex: 5,
    slotName: "Track Record",
    fillerType: "embed-or-generate",
    preferredTags: ["track-record", "testimonial"],
    generateTitle: "Track Record",
    generateGuidance:
      "Use ONLY the metrics or social proof the brochure states (e.g. SLA percentages, review scores, testimonial themes). If the brochure has none, write a brief paragraph about retention and client relationships without inventing statistics.",
  },
  {
    slotIndex: 6,
    slotName: "Understanding Your Requirements",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Understanding Your Requirements",
    generateGuidance:
      "Read the tender carefully and restate the client's situation in your own words. Mention specific numbers (user count, sites, technology stack) the tender provides. Show comprehension, not regurgitation.",
  },
  {
    slotIndex: 7,
    slotName: "Proposed Service Delivery",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Proposed Service Delivery",
    generateGuidance:
      "Map the tender's scope of services to your delivery commitments. Use the brochure's service descriptions for HOW you deliver each, but the structure follows the tender's scope sections, not the brochure's sales order.",
  },
  {
    slotIndex: 8,
    slotName: "Cloud Migration Approach",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Cloud Migration Approach",
    generateGuidance:
      "Only include this chapter if the tender mentions cloud migration. Outline a discovery-led, phased approach. 6 stages: assess → plan → migrate → test → train → document. Keep it generic-but-credible — no invented timelines.",
  },
  {
    slotIndex: 9,
    slotName: "Cybersecurity & Compliance",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Cybersecurity & Compliance",
    generateGuidance:
      "Cover the controls the tender expects (GDPR, MFA, endpoint protection, email protection, backup verification, secure operations). Brief table-of-controls format works well here.",
  },
  {
    slotIndex: 10,
    slotName: "Disaster Recovery & Continuity",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Disaster Recovery & Business Continuity",
    generateGuidance:
      "DR plan, annual review, annual testing, backup verification, secure handling of test data. Match what the tender asks for if those details are present.",
  },
  {
    slotIndex: 11,
    slotName: "Website Hosting & Support",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Website Hosting & Support",
    generateGuidance:
      "Only include if the tender mentions a website. Cover hosting type, SSL, plugin updates, support hours per month. Match the tender's specific language (e.g. WordPress, VPS).",
  },
  {
    slotIndex: 12,
    slotName: "Service Level Agreement",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Service Level Agreement",
    generateGuidance:
      "Response times, resolution targets, escalation, reporting, review meetings. Match the tender's stated SLA expectations precisely where given.",
  },
  {
    slotIndex: 13,
    slotName: "Implementation & Onboarding",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Implementation & Onboarding",
    generateGuidance:
      "Discovery → Audit → Tooling → Stabilisation → Optimisation. Phased approach with clear outcomes per phase.",
  },
  {
    slotIndex: 14,
    slotName: "Key Personnel",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Key Personnel",
    generateGuidance:
      "Use ONLY names and roles explicitly named in the brochure. If the brochure names no one, describe the team in role terms only (helpdesk-led, account-managed) without inventing names.",
  },
  {
    slotIndex: 15,
    slotName: "Pricing Summary",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Pricing Summary",
    generateGuidance:
      "PROOF-EQUIVALENT NOTE: For Delivery A this slot is filled by the AI based on tender scope. Delivery C wires this to the existing pricing engine (the IT addendum, tender mode, and scope dedup work from previous deliveries continue to drive line-item generation; the engine output is then formatted into a clean pricing table for this chapter).",
  },
  {
    slotIndex: 16,
    slotName: "Contract Terms",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Contract Terms",
    generateGuidance:
      "Contract length, notice period, performance basis. Use the brochure's stated contract posture (e.g. no long contracts, 3-month rolling) if present. 2–3 short paragraphs.",
  },
  {
    slotIndex: 17,
    slotName: "Why Us",
    fillerType: "always-generate",
    preferredTags: [],
    generateTitle: "Why Us — In Summary",
    generateGuidance:
      "One concise paragraph pulling together the top 3–4 reasons (drawn from the brochure's USPs and the tender's stated priorities) why this supplier fits this client.",
  },
  {
    slotIndex: 18,
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
1. Use ONLY facts that are explicitly provided to you (tender text + brochure facts). Never invent: founding dates, founder names, certifications, locations, contract lengths, statistics, customer counts, employee counts, awards.
2. Reference SPECIFIC details from the tender (user count, site count, technology names, sector type, mission). The proposal must read as written for THIS client, not a template.
3. Where the brochure provides facts (USPs, service descriptions, contract posture), USE THEM verbatim or near-verbatim. Don't paraphrase loosely and lose the specificity.
4. No marketing waffle. No "leveraging synergies" or "best-in-class". Plain, confident, professional UK English.
5. No source attribution superscripts. No footnotes.
6. If a slot's guidance says "only include if the tender mentions X" and the tender doesn't mention X, return an empty body for that slot (just the title) — the assembly step will skip it.

Return ONLY valid JSON in this exact shape:
{
  "chapters": [
    { "slotIndex": 1, "title": "...", "body": "..." },
    ...
  ]
}

The body should be plain text with double-newlines (\\n\\n) between paragraphs. No HTML, no markdown, no headings inside body.`;

  const user = `# Tender text
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
      return {
        slotIndex: s.slotIndex,
        slotName: s.slotName,
        source: "embed",
        brochurePageNumber: s.brochurePageNumber,
        reason: `Brochure page ${s.brochurePageNumber} classified as "${s.tag}" with clean clarity`,
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

Return ONLY valid JSON:
{ "slotIndex": ${params.slotIndex}, "title": "...", "body": "..." }`;

  const user = `# Chapter to rewrite
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
