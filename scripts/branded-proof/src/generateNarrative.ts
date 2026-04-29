// Step 2 of the proof pipeline.
//
// Given:
//  - Classified brochure pages (from Step 1)
//  - The tender text (Headway pack)
//
// Produce:
//  - A flat ordered list of ChapterSlots, each one either:
//    * source = "embed" with a brochurePageNumber pointing at a CLEAN page
//      tagged with the matching purpose (about / usp / track-record / etc.)
//    * source = "generate" with title + body for chapters that don't have
//      a clean brochure page or that need to weave tender-specific context
//      (Understanding Your Needs, Service Delivery, Pricing, etc.)
//
// The narrative-writing call is given the full classification context AND
// is told explicitly which slots will be filled by embedded brochure pages,
// so adjacent generated chapters don't repeat the same content.

import { callClaude, extractJson } from "./claudeClient";
import type { ChapterSlot, PageClassification } from "./types";

// The 18 chapter slots that match the Manus Headway proposal structure.
// "fillerType" tells us how the slot is normally filled:
//  - "embed-or-generate": prefer to embed a brochure page if a clean one
//    exists with the matching tag; otherwise generate text from facts.
//  - "always-generate": this slot is too tender-specific to ever embed
//    (e.g., Understanding Your Needs is per-client, not in a brochure).
interface SlotDef {
  slotIndex: number;
  slotName: string;
  fillerType: "embed-or-generate" | "always-generate";
  preferredTags: string[]; // brochure page tags that can fill this slot
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
      "3–4 paragraphs. Open with a sentence that shows you understand THIS client's situation specifically (not generic IT-speak). Reference the client's mission/sector/size. State three priorities your service addresses for them. End with a confidence-building line about your operating model.",
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
      "PROOF SCRIPT NOTE: For the proof, write a representative pricing structure based on what the tender's scope implies (one-off project costs separated from monthly recurring; show monthly recurring breakdown by service line; show total monthly + total annual ex-VAT and inc-VAT). In the live feature this slot is fed by the existing pricing engine; the proof simulates that.",
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

interface NarrativeChapterFromAI {
  slotIndex: number;
  title: string;
  body: string;
}

export async function generateNarrative(params: {
  tenderText: string;
  classifications: PageClassification[];
}): Promise<{
  slots: ChapterSlot[];
  inputTokens: number;
  outputTokens: number;
}> {
  // Step 2a: decide which slots get embedded brochure pages.
  // Pure logic, no AI needed — pick the FIRST clean page matching each
  // slot's preferred tag. This deterministically resolves "which page
  // becomes the About Us embed" without risking AI inconsistency.
  const slotPlan: Array<
    | { type: "embed"; slotIndex: number; slotName: string; brochurePageNumber: number; tag: string }
    | { type: "generate"; def: SlotDef }
  > = [];

  const usedPages = new Set<number>();

  for (const def of SLOT_DEFS) {
    if (def.fillerType === "always-generate") {
      slotPlan.push({ type: "generate", def });
      continue;
    }

    // embed-or-generate: find the first clean page with a preferred tag, not yet used
    const match = params.classifications.find(
      (c) =>
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
      // No clean page found — fall back to generated text using whatever facts exist
      slotPlan.push({ type: "generate", def });
    }
  }

  // Step 2b: build a single Claude call to generate text for the
  // "generate" slots only. Tell it which adjacent slots are filled by
  // embedded brochure pages so it doesn't duplicate that content.
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

  // Bundle facts from all classified pages, organised by tag, for narrative grounding
  const factsByTag: Record<string, string[]> = {};
  for (const c of params.classifications) {
    if (c.facts.length === 0) continue;
    if (!factsByTag[c.tag]) factsByTag[c.tag] = [];
    factsByTag[c.tag].push(...c.facts);
  }
  const factsBlock = Object.entries(factsByTag)
    .map(([tag, facts]) => `${tag.toUpperCase()}:\n${facts.map((f) => `  - ${f}`).join("\n")}`)
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

  const response = await callClaude({
    system,
    user,
    maxTokens: 8192,
    temperature: 0.1,
  });

  const parsed = extractJson<{ chapters: NarrativeChapterFromAI[] }>(response.text);
  const generatedBySlot = new Map<number, NarrativeChapterFromAI>();
  for (const ch of parsed.chapters) {
    if (typeof ch.slotIndex === "number") {
      generatedBySlot.set(ch.slotIndex, ch);
    }
  }

  // Now zip slotPlan with the generated content to produce ChapterSlot[]
  const slots: ChapterSlot[] = slotPlan.map((s, idx) => {
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
    inputTokens: response.inputTokens,
    outputTokens: response.outputTokens,
  };
}
