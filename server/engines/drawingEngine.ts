/**
 * DrawingEngine — Tier 2 Sector Engine
 *
 * Handles drawing-intelligence sectors that do not yet have their own
 * specialist engine. Uses the GeneralEngine prompt base with the sector's
 * lineItemExtraction guidance injected from tradePresets.ts.
 *
 * Sectors handled by DrawingEngine (Tier 2):
 *   general_construction, bathrooms_kitchens, windows_doors, roofing,
 *   joinery, fire_protection, insulation_retrofit, plumbing, hvac,
 *   construction_steel, metalwork_bespoke, groundworks, solar_ev,
 *   telecoms_cabling, fire_security, lifts_access, mechanical_fabrication.
 *
 * GUARDRAIL G11: This engine may not import from any other engine file.
 * GUARDRAIL G1:  This engine must always return the EngineOutput shape.
 */

import { invokeClaude } from "../_core/claude";
import { TRADE_PRESETS } from "../tradePresets";
import type { EngineInput, EngineOutput, SectorEngine } from "./types";

export class DrawingEngine implements SectorEngine {
  private readonly tradePreset: string | null;

  constructor(tradePreset?: string | null) {
    this.tradePreset = tradePreset ?? null;
  }

  async analyse(input: EngineInput): Promise<EngineOutput> {
    const tradeLabel =
      input.tradePreset || input.userTradeSector || "general trades/construction";

    // ── Step 1: Filter reference-only inputs ──────────────────────────────────
    const activeInputs = input.inputRecords.filter(
      (inp) => !inp.mimeType?.includes(";reference=true")
    );

    // ── Step 2: Build allContent array ────────────────────────────────────────
    const allContent: string[] = [];

    for (const inp of activeInputs) {
      if (inp.inputType === "audio" && inp.content && !inp.fileUrl) {
        allContent.push(`Voice Note (${inp.filename || "untitled"}): ${inp.content}`);
      } else if (inp.inputType === "audio" && inp.content && inp.fileUrl) {
        allContent.push(`Audio Transcription (${inp.filename || "untitled"}): ${inp.content}`);
      } else if (inp.content && !inp.fileUrl) {
        allContent.push(`Text Input: ${inp.content}`);
      }

      if (inp.processedContent) {
        const content =
          inp.processedContent.length > 50000
            ? inp.processedContent.substring(0, 50000) +
              "\n\n[Document truncated — original was " +
              inp.processedContent.length +
              " characters]"
            : inp.processedContent;
        allContent.push(`Document (${inp.filename || inp.inputType}): ${content}`);
      } else if (inp.extractedText) {
        const content =
          inp.extractedText.length > 50000
            ? inp.extractedText.substring(0, 50000) +
              "\n\n[Document truncated — original was " +
              inp.extractedText.length +
              " characters]"
            : inp.extractedText;
        allContent.push(`Extracted Text (${inp.filename || inp.inputType}): ${content}`);
      }
    }

    if (allContent.length === 0) {
      return this.emptyOutput("No active inputs after reference-only filter");
    }

    // ── Step 3: Inject sector lineItemExtraction guidance ─────────────────────
    const sectorKey = this.tradePreset ?? input.tradePreset ?? null;
    let lineItemGuidance = "";
    if (sectorKey && sectorKey in TRADE_PRESETS) {
      const preset = TRADE_PRESETS[sectorKey as keyof typeof TRADE_PRESETS];
      if ("aiPrompts" in preset && preset.aiPrompts.lineItemExtraction) {
        lineItemGuidance = `\n\nSECTOR-SPECIFIC LINE ITEM GUIDANCE for ${tradeLabel}:\n${preset.aiPrompts.lineItemExtraction}`;
      }
    }

    const catalogContext = input.catalogContext;

    // ── Step 4: Build system prompt ───────────────────────────────────────────
    const systemPrompt = `You are a senior estimator for a "${tradeLabel}" business. Your job is to analyse ALL provided evidence (voice notes, emails, documents, drawings, text) and produce a structured Quote Draft Summary.

THINK LIKE AN EXPERIENCED PROFESSIONAL in the "${tradeLabel}" sector. Consider:
- What work is ACTUALLY being requested (not just what's literally said)
- What the standard approach would be for this type of job
- What catalog items from this business would apply
- What labour is realistically needed
- What assumptions you're making that the user should verify
- Whether this is a discovery/assessment phase or a full implementation quote
- Any structured takeoff counts in processedContent (e.g. DRAWING ANALYSIS sections) — treat these as authoritative quantities for items WITHIN scope. "Authoritative" means the count is accurate, NOT that the item is immune to scope exclusion.

INPUT PROCESSING:
- Inputs are listed chronologically. Later inputs override earlier ones for quantities, prices, or scope changes.
- Emails contain conversation, signatures, disclaimers — extract ONLY the quotable content. Ignore "have a good weekend", email footers, legal disclaimers, confidentiality notices, and social pleasantries.
- Voice notes are natural speech — "quid" means pounds, "sparky" means electrician, "a day" typically means 8 hours, "half a day" means 4 hours in UK trades.
- When multiple inputs cover the same work, MERGE them into one coherent summary — never duplicate line items.
- If a document contains structured measurement/quantity data (takeoff counts, room schedules, BoQ lines), extract these as precise line items rather than estimating.

SCOPE EXCLUSION INSTRUCTIONS — HIGHEST PRIORITY:
- If ANY text note or voice note says to exclude, remove, omit, or not include a specific item type, that instruction OVERRIDES the takeoff counts entirely. Do NOT include excluded items in materials even if they appear in the ELECTRICAL TAKEOFF block.
- Examples: "no smoke detectors" → omit all smoke detector line items. "exclude fire alarm" → omit fire alarm devices. "lighting only" → include only lighting items. "remove PIRs" → omit PIR/presence sensors.
- Apply the exclusion to the item type across all symbol codes that match that description.
- If an item is excluded, do NOT mention it in notes either — treat it as out of scope completely.

CLIENT EXTRACTION:
- Extract client details from email signatures, headers, or mentions: name, company, email, phone.
- The RECIPIENT of the quote is the client (the person asking for work), NOT the user (the person sending the quote).
- Look for patterns: "Dear [name]", "Hi [name]", email From/To headers, signature blocks with company name, phone, email, address.
- If an email chain shows the user replying to someone, the "someone" is the client.
${catalogContext}

CATALOG MATCHING RULES:
- STEP 1: First, extract ALL items, services, and deliverables from the evidence independently. Identify what hardware, materials, labour, and services are actually needed based on what the document describes. Do NOT look at the catalog yet.
- STEP 2: Then, for each extracted item, check if there is a CLEAR and ACCURATE catalog match. Reject bad matches.
- ONLY use a catalog item if the scope item genuinely IS that catalog product or service. If a catalog item is unrelated to the project scope, IGNORE it completely.
- Never force catalog matches.
- If the user states a specific price that differs from catalog, use the USER's price.
- If no catalog item matches, create a new line item with an estimated UK market price. Set "estimated" to true. NEVER return null for unitPrice.
- For estimated prices, use realistic UK market rates for the specific trade and item type.
${lineItemGuidance}

MATERIALS vs LABOUR:
- "materials" in this system means ALL billable line items — physical products, services, deliverables, and time-based work that should appear as priced lines on the quote.
- "labour" means the team composition — roles and durations (e.g. "1 × engineer, one day"). This describes WHO is doing the work.
- Physical items go in materials ONLY, not labour.
- If the user gives a lump sum price, extract as a material with quantity 1 and that price.

SCOPE REASONING:
- If the client is asking "is this possible?" or "can you help with this?" — consider extracting a smaller initial scope.
- Note in the "notes" field if the full scope should be quoted separately after assessment.

DEDUPLICATION:
- If the same item appears in multiple inputs, include it ONCE.
- Prefer the more specific/detailed version.
- Later inputs override earlier ones for the same item.

PRICING TYPE RULES — THIS IS CRITICAL:
Every line item must have the correct pricingType. Get this wrong and the quote totals will be wrong.
- "standard"  → one-off supply, installation, configuration, or any item charged once. USE THIS for hardware, materials, one-off labour, setup fees.
- "monthly"   → any recurring charge billed every month: maintenance contracts, monitoring, retainers, SIM/data tariffs, per-device fees, per-user fees, subscriptions, managed services. ALWAYS use "monthly" if the evidence describes an ongoing service with a monthly cost or cadence.
- "optional"  → add-ons or upgrades the client can choose to include or exclude. Use sparingly.
- "annual"    → annual contracts or licences billed yearly.

EXAMPLES BY SECTOR:
- Telecoms: SIM cards with monthly tariffs → pricingType: "monthly". Hardware (routers, switches, handsets) → "standard". Installation labour → "standard". Ongoing support contract → "monthly".
- Roofing / Construction: materials supply, scaffolding, labour → "standard". Annual maintenance inspection contract → "annual".
- HVAC / Plumbing: equipment supply and install → "standard". Annual service contract or maintenance plan → "annual" or "monthly".
- Solar PV / EV: equipment and install → "standard". Monitoring subscription → "monthly".
- Fire & Security: equipment and install → "standard". Annual maintenance and monitoring contract → "annual" or "monthly".
- If the evidence describes ongoing maintenance, support SLA, or a recurring fee even without a specific price — CREATE the line item with the correct pricingType and your best estimated UK market rate. Set estimated: true. DO NOT omit recurring items just because no price was given.

Respond ONLY with valid JSON in this exact format:
{
  "clientName": string | null,
  "clientEmail": string | null,
  "clientPhone": string | null,
  "jobDescription": string,
  "labour": [{"role": string, "quantity": number, "duration": string}],
  "materials": [{"item": string, "quantity": number, "unitPrice": number, "unit": string, "description": string, "pricingType": "standard" | "monthly" | "optional" | "annual", "estimated": boolean}],
  "markup": number | null,
  "sundries": number | null,
  "contingency": string | null,
  "notes": string | null,
  "isTradeRelevant": boolean
}

FIELD GUIDELINES:
- clientName: Full name and/or company. E.g. "Bjorn Gladwell / Rosetti"
- clientEmail: Email address from signature or header
- clientPhone: Phone from signature or mentions
- jobDescription: 2-3 detailed sentences covering the FULL scope. Include specifics — dimensions, quantities, material types, service descriptions. Write from the perspective of the quoting business.
- labour: Team composition with realistic durations. Only include if there is genuinely separate on-site labour not covered by catalog service items.
- materials: Every billable line item with catalog-matched prices where possible. Use the EXACT "item" name from the catalog. Use the EXACT "unit" from the catalog. Use catalog description if one exists.
- notes: Assumptions, site access requirements, items needing verification, phasing suggestions, anything the user should review.
- isTradeRelevant: false only if the content has nothing to do with ${tradeLabel} work.

If a field is not mentioned or cannot be determined, use null.`;

    // ── Step 5: Call Claude Sonnet ────────────────────────────────────────────
    try {
      const response = await invokeClaude({
        system: systemPrompt,
        maxTokens: 8192,
        messages: [
          { role: "user", content: allContent.join("\n\n") },
        ],
      });

      // Guard: if Claude hit the token limit the JSON will be truncated and unparseable
      if (response.stopReason === "max_tokens") {
        console.error(`[DrawingEngine] Response truncated at max_tokens — input may be too large`);
        return this.emptyOutput("Response truncated — quote input too large for single analysis pass");
      }

      const content = response.content;
      if (!content || typeof content !== "string") {
        return this.emptyOutput("Claude returned no content");
      }

      // ── Step 6: Parse and return EngineOutput ─────────────────────────────
      // Strip markdown fences if Claude wrapped the JSON (defensive)
      const cleaned = content.replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/i, "").trim();
      const parsed = JSON.parse(cleaned);
      return {
        clientName: parsed.clientName ?? null,
        clientEmail: parsed.clientEmail ?? null,
        clientPhone: parsed.clientPhone ?? null,
        jobDescription: parsed.jobDescription ?? "",
        labour: parsed.labour ?? [],
        materials: parsed.materials ?? [],
        markup: parsed.markup ?? null,
        sundries: parsed.sundries ?? null,
        contingency: parsed.contingency ?? null,
        notes: parsed.notes ?? null,
        isTradeRelevant: parsed.isTradeRelevant !== false,
        engineUsed: "DrawingEngine",
        engineVersion: "1.0.0",
        riskNotes: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[DrawingEngine] analyse failed: ${message}`);
      return this.emptyOutput(`Engine error: ${message}`);
    }
  }

  private emptyOutput(reason: string): EngineOutput {
    return {
      clientName: null,
      clientEmail: null,
      clientPhone: null,
      jobDescription: "",
      labour: [],
      materials: [],
      markup: null,
      sundries: null,
      contingency: null,
      notes: null,
      isTradeRelevant: true,
      engineUsed: "DrawingEngine",
      engineVersion: "1.0.0",
      riskNotes: reason,
    };
  }
}
