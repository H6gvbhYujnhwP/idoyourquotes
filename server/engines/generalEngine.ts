/**
 * GeneralEngine — Tier 1 Sector Engine
 *
 * Handles all sectors that do not use drawing intelligence.
 * This is the current parseDictationSummary prompt, moved into a sealed engine
 * with zero prompt changes for zero regression risk.
 *
 * Sectors handled by GeneralEngine (Tier 1):
 *   commercial_cleaning, building_maintenance, pest_control, scaffolding,
 *   painting, it_services, custom, and any unrecognised sector (catch-all).
 *
 * GUARDRAIL G11: This engine may not import from any other engine file.
 * GUARDRAIL G1:  This engine must always return the EngineOutput shape.
 */

import { invokeClaude } from "../_core/claude";
import type { EngineInput, EngineOutput, SectorEngine } from "./types";

export class GeneralEngine implements SectorEngine {
  private readonly tradePreset: string | null;

  constructor(tradePreset?: string | null) {
    this.tradePreset = tradePreset ?? null;
  }

  async analyse(input: EngineInput): Promise<EngineOutput> {
    const tradeLabel =
      input.tradePreset || input.userTradeSector || "general trades/construction";

    // ── Step 1: Filter reference-only inputs ──────────────────────────────────
    // Belt-and-braces: parseDictationSummary also skips reference-only, but
    // each engine does its own check per G11 isolation rules.
    const activeInputs = input.inputRecords.filter(
      (inp) => !inp.mimeType?.includes(";reference=true")
    );

    // ── Step 2: Build allContent array (matches current parseDictationSummary logic) ─
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

    // ── Step 3: Build catalog context (already formatted by parseDictationSummary) ─
    const catalogContext = input.catalogContext;

    // ── Step 4: Build system prompt (exact copy of current parseDictationSummary prompt) ─
    //
    // IT-gated addendum: runs ONLY when this.tradePreset === "it_services".
    // For every other sector (cleaning, pest control, scaffolding, painting,
    // building maintenance, custom, and the null catch-all) this evaluates to
    // an empty string and the interpolated prompt is byte-identical to the
    // pre-existing prompt — zero behaviour change for non-IT sectors.
    //
    // Purpose: the base prompt is framed around "what work is being requested",
    // which causes the model to return empty materials when given invoice /
    // contract / statement evidence (a core MSP workflow). This addendum tells
    // the model to treat invoice evidence as valid scope definition and map
    // every line item into materials[].
    const itInvoiceAddendum = this.tradePreset === "it_services" ? `IT SECTOR — INVOICE / CONTRACT / STATEMENT EVIDENCE (CRITICAL FOR MSP WORKFLOWS):

The evidence for an IT/MSP quote frequently includes invoices, contracts, service agreements, or statements from a previous provider. This is expected and legitimate. Common MSP scenarios:
- A prospect has shared their current provider's invoice so you can quote to match or improve it
- Renewal cycle: last invoice becomes the basis for the next contract quote
- Takeover/transition: you are inheriting scope from the incumbent provider's billing
- Cost-reduction review: you are pricing an alternative to the client's current arrangement

When the evidence is an invoice, contract, statement, or service agreement, DO NOT return empty materials with a note saying "this is not a request for quotation". The document IS the scope definition. Extract every line item into the materials[] array. Set isTradeRelevant: true — an invoice from another IT provider is always trade-relevant for an MSP.

INVOICE LINE ITEM MAPPING:
- Each numbered/listed row on the invoice → ONE material in the output.
- "item": the service or product name. Strip administrative prefixes like "Contract:" or "Service:" — e.g. "Contract: M365 (Mar25) - Business Standard" becomes item: "M365 Business Standard".
- "description": preserve the full technical detail INCLUDING bracket tags that encode contract terms (e.g. "[NCE/1-Year/Monthly]", "[36-month]", "[Core]", "[Gold]", "/Baseline /Backup /Spam"). These tags matter to the client. Use the "||" separator if you expand on the service scope.
- "quantity": exactly as shown on the invoice (14 for "Qty 14 - M365 Business Standard Named Users"; 6.00 for "6.00 hours of Project Engineer").
- "unit": match the invoice's billing unit. "User" for per-user licensing, "Month" for retainers billed monthly, "Agent" or "Device" for per-agent/per-device services, "Hour" for time-billed engineer labour, "each" for one-off items.

PRICING TYPE FROM CADENCE MARKERS (match these patterns):
- "[NCE/1-Year/Monthly]", "[Monthly]", "per month", a service date range that spans one calendar month → pricingType: "monthly"
- "[1-Year/Annual]", "[Annual]", "per annum" → pricingType: "annual"
- "[36-month]", "[24-month]" (multi-year contract terms billed monthly) → pricingType: "monthly". The commitment term belongs in the description, not the cadence.
- Dated hourly labour lines ("23 Jan 2026 — Project Engineer, 6.00") → pricingType: "standard", unit: "Hour", quantity: the hour count. Each dated labour row is a SEPARATE material even if the role name repeats — different engagements on different dates.
- Prorated line items ("Prorated [07/01/2026 - 22/01/2026]") on the same service as a full-month line: DROP the prorated line entirely. It is historical billing catch-up, not forward-looking scope. Keep only the full-month line.

REDACTED OR MISSING PRICES (very common on shared invoices):
When the invoice shows prices as blacked-out boxes, "POA", or blank, you MUST still populate unitPrice with a realistic UK MSP resale estimate and set "estimated": true. Use these typical UK MSP resale ranges (ex VAT):
- Microsoft 365 Business Basic: £7–£8 per user per month
- Microsoft 365 Business Standard: £13–£16 per user per month
- Microsoft 365 Business Premium: £22–£28 per user per month
- Microsoft 365 Apps for Business: £9–£11 per user per month
- Managed IT support — Named User: £18–£35 per user per month (basic to premium SLA)
- Managed Server (monthly support): £100–£200 per server per month
- Sophos Managed Firewall XGS series: £80–£250 per month (XGS 87/107/116 lower; XGS 118/126/136 mid; XGS 2100+ upper)
- BCDR (backup and disaster recovery) — per protected agent: £30–£60 per agent per month (Gold/Premium tiers top of range)
- Project Engineer: £75–£110 per hour
- Service Desk / Helpdesk Engineer: £55–£85 per hour
- Senior IT Consultant: £95–£150 per hour
- Generic per-device monitoring / RMM: £3–£8 per device per month

Pick one specific number near the middle of the range — never return null for unitPrice. The user reviews every estimated price before the quote goes to the client.

ADDITIVE BEHAVIOUR — MIXED EVIDENCE:
If the evidence is a MIX of an invoice/contract AND a separate request for new or additional work (e.g. invoice attached plus an email saying "we also want to add 10 more users and a backup service"), extract BOTH — every invoice line item AND the additional requested work. All flow into materials[].

SMART CATEGORY SUBSTITUTION (THIS IS HOW AN MSP WINS COMPETITIVE QUOTES):
An MSP's catalog represents the vendor THEY have chosen in each commodity category. When invoice/contract evidence mentions a product from a DIFFERENT vendor in the SAME commodity category, the MSP will quote their own equivalent — that is the whole point of a competitive takeover quote. You must substitute in favour of the user's catalog item, at the user's catalog price, and note the substitution in the description.

CATEGORIES WHERE SUBSTITUTION IS CORRECT (brand-agnostic commodities):
- Password managers: LastPass, 1Password, Keeper, Bitwarden, Dashlane, NordPass, RoboForm — all interchangeable commodities.
- Endpoint security / anti-virus: ESET, Sophos Intercept X, Sophos Endpoint, Bitdefender, CrowdStrike Falcon, SentinelOne, Webroot, Malwarebytes, Trend Micro Apex One, Microsoft Defender for Business, Kaspersky, Norton Small Business — all interchangeable commodities. (NOT to be confused with firewalls — see below.)
- Email threat protection / secure email gateway: Mimecast, Proofpoint Essentials, Barracuda Email Protection, Avanan, IRONSCALES, Microsoft Defender for Office 365 — all interchangeable commodities.
- Microsoft 365 backup (cloud-to-cloud): Datto SaaS Protect, Barracuda Cloud-to-Cloud Backup, Veeam Backup for M365, SkyKick Cloud Backup, Spanning, AvePoint Cloud Backup, Redstor — all interchangeable commodities.
- Server/workstation backup and BCDR: Datto SIRIS, Datto ALTO, Veeam Backup & Replication, Acronis Cyber Protect, Axcient x360Recover, NAKIVO, StorageCraft ShadowProtect — all interchangeable commodities.
- Email signature management: Exclaimer, CodeTwo, Rocketseed, Opensense, Templafy — all interchangeable commodities.
- Remote monitoring and management (RMM): Datto RMM, NinjaOne, Atera, ConnectWise Automate, Kaseya VSA, N-able N-sight, N-able RMM, Pulseway — all interchangeable commodities.
- IT documentation: IT Glue, Hudu, ITBoost, Confluence (in MSP context) — all interchangeable commodities.
- DNS filtering / web filtering: Webroot DNS, Cisco Umbrella, DNSFilter, SafeDNS — all interchangeable commodities.

CATEGORIES WHERE SUBSTITUTION IS WRONG (client-specific choices — quote exactly as evidenced):
- Microsoft 365 vs Google Workspace vs Zoho — productivity suites are a client ecosystem decision. Never swap.
- Specific firewall brands: Sophos XGS/XG vs Fortinet FortiGate vs WatchGuard vs Cisco Meraki MX vs SonicWall vs Ubiquiti UniFi — different management, licensing, and integration. Quote the exact brand/model the evidence specifies.
- Specific hardware SKUs — if the evidence names a model (e.g. "Sophos XGS 118"), quote that model. The client may already own it or have integration requirements.
- Telephony systems: 3CX vs Microsoft Teams Phone vs Zoom Phone vs RingCentral vs Gamma Horizon — different integration and porting implications. Quote the same system.
- Named-user support contracts from the EXISTING provider (e.g. "Reach IT Support [Core] Named User" on an Urban Network invoice) — these are the OLD provider's contract. Map these to the user's catalog support tier if one exists (e.g. "Silver IT Support — Unlimited Remote"), noting the substitution. This IS a valid substitution — the named-user support category is commodity.

HOW TO SUBSTITUTE:
1. Read the evidence item. Identify its commodity category (password manager? AV? M365 backup?).
2. Scan the user's catalog (provided above) for an item in the same category.
3. If a catalog match exists in a SUBSTITUTABLE category:
   - Use the catalog item's exact "name" as the materials "item" field.
   - Use the catalog item's defaultRate as unitPrice. Set estimated: false.
   - Copy quantity from the evidence.
   - Start the "description" with "Replaces existing [evidenced product name]" followed by "||" then the catalog description. For example: "Replaces existing LastPass subscription || Enterprise password manager per user || Secure encrypted vault..."
4. If a catalog match exists in a NON-SUBSTITUTABLE category (e.g. client has a specific firewall), use the evidenced product name verbatim — do NOT substitute your catalog's firewall item.
5. If no catalog match exists in the evidenced category, fall back to the UK MSP rates above with estimated: true.
6. Silent substitution is a bug. Every substituted item MUST have "Replaces existing [original product]" visible in the description so the user can review and revert in the QDS if needed.

DO NOT INVENT SCOPE:
Extract only what the evidence actually shows. If an invoice has 14 M365 licences, the quote has 14 — not 15, not "14 or so". If prices are redacted, flag with estimated:true — do not fabricate exact unit prices. If the client is asking about adding services, only quote what they asked for.

` : "";

    const systemPrompt = `You are a senior estimator for a "${tradeLabel}" business. Your job is to analyse ALL provided evidence (voice notes, emails, documents, text) and produce a structured Quote Draft Summary.

THINK LIKE AN EXPERIENCED PROFESSIONAL in the "${tradeLabel}" sector. Consider:
- What work is ACTUALLY being requested (not just what's literally said)
- What the standard approach would be for this type of job
- What catalog items from this business would apply
- What labour is realistically needed
- What assumptions you're making that the user should verify
- Whether this is a discovery/assessment phase or a full implementation quote

INPUT PROCESSING:
- Inputs are listed chronologically. Later inputs override earlier ones for quantities, prices, or scope changes.
- Emails contain conversation, signatures, disclaimers — extract ONLY the quotable content. Ignore "have a good weekend", email footers, legal disclaimers, confidentiality notices, and social pleasantries.
- Voice notes are natural speech — "quid" means pounds, "sparky" means electrician, "a day" typically means 8 hours, "half a day" means 4 hours in UK trades.
- When multiple inputs cover the same work, MERGE them into one coherent summary — never duplicate line items.

CLIENT EXTRACTION:
- Extract client details from email signatures, headers, or mentions: name, company, email, phone.
- The RECIPIENT of the quote is the client (the person asking for work), NOT the user (the person sending the quote).
- Look for patterns: "Dear [name]", "Hi [name]", email From/To headers, signature blocks with company name, phone, email, address.
- If an email chain shows the user replying to someone, the "someone" is the client.
${catalogContext}

CATALOG MATCHING RULES:
- STEP 1: First, extract ALL items, services, and deliverables from the evidence independently. Identify what hardware, software, labour, and services are actually needed based on what the document describes. Do NOT look at the catalog yet.
- STEP 2: Then, for each extracted item, check if there is a CLEAR and ACCURATE catalog match. "IT Labour Onsite" matches "engineer onsite for installation" — that is a good match. "Website 7 Pages" does NOT match "network infrastructure upgrade" — that is a bad match. Reject bad matches.
- ONLY use a catalog item if the scope item genuinely IS that catalog product or service. If a catalog item is unrelated to the project scope, IGNORE it completely.
- Never force catalog matches. If the catalog has 3 items and the project needs 10 different things, create 10 line items — only the ones that genuinely match get catalog prices, the rest get estimated prices.
- If the user states a specific price that differs from catalog, use the USER's price.
- If no catalog item matches, create a new line item with an estimated UK market price. Set "estimated" to true on that material. NEVER return null for unitPrice — always provide either a catalog price or a reasonable estimate.
- For estimated prices, use realistic UK market rates for the specific trade and item type. Be specific: "Ubiquiti U6 Pro WAP" not "networking equipment"; "VoIP Desk Phone" not "phone setup".
- ALL prices must be EXCLUSIVE of VAT (ex VAT). Never include VAT in any unitPrice. VAT is calculated separately by the system after quote generation.

MATERIALS vs LABOUR:
- "materials" in this system means ALL billable line items — physical products, services, deliverables, and time-based work that should appear as priced lines on the quote.
- "labour" means the team composition summary — roles and durations (e.g. "1 × Network Engineer — Onsite, 1 day"). This describes WHO is doing the work, for the cover narrative only. It is NOT the billable output.
- Physical items (cable, hardware, servers) go in materials ONLY, not labour.
- If the user gives a lump sum price (e.g. "the server costs £4,650"), extract as a material with quantity 1 and that price.

LABOUR LINE ITEMS — CRITICAL: Every distinct labour engagement must become its own materials line item. Do NOT collapse or merge labour engagements just because the role name is the same. The following are always separate line items if each is separately mentioned:
- Onsite labour (travel to client site — day rate or hourly)
- Remote labour (phone/screen share support — hourly)
- Workshop / bench labour (work carried out at your own premises — configuration, fabrication, testing, staging)
- Discovery / scoping session (initial consultation to scope the work)
- Training session (customer-facing knowledge transfer)
- Project management (coordination, scheduling, stakeholder communication)
- Commissioning / go-live (final setup and sign-off at client site)
- Site survey / audit (assessment visit before quoting or starting)
- Out-of-hours / emergency labour (premium rate callouts)

EXAMPLES OF CORRECT SEPARATION — do not merge these into one line item:
- "1 day onsite labour" + "1 day workshop labour" → TWO separate materials line items
- "discovery session" + "installation day" → TWO separate materials line items
- "remote configuration" + "onsite commissioning" → TWO separate materials line items

ANTI-DUPLICATION RULE: The deduplication rule applies to the SAME engagement mentioned twice across inputs (e.g. email says "1 day onsite" and voice note also says "1 day onsite" — that's one item). It does NOT apply to different engagements that happen to use the same role or person.

- IMPORTANT: If the catalog items already represent the services being delivered (e.g. "Discovery Session", "Email Campaign", "Website Design"), do NOT create labour entries in the labour[] array. The catalog service items ARE the deliverables. Only add to labour[] when there is genuinely separate hands-on labour not covered by a catalog item.
- CRITICAL — NO DOUBLE-COUNTING: If a labour engagement (e.g. "IT Labour Workshop", "Network Engineer — Onsite", "Installation Labour") already appears as a materials line item, it must NOT also appear in labour[]. The labour[] array is ONLY for roles with no corresponding materials line item. If every labour role is already captured as a priced line item, leave labour[] empty.

SCOPE REASONING:
- If the client is asking "is this possible?" or "can you help with this?" — this is likely a discovery/assessment phase. Consider extracting a smaller initial scope (assessment, site survey) rather than the full project.
- Note in the "notes" field if the full scope should be quoted separately after assessment.
- If the client describes a problem (e.g. "server going end of life"), reason about what the ${tradeLabel} business would typically propose as a solution.

DEDUPLICATION:
- If the same item appears in multiple inputs (e.g. mentioned in email AND voice note), include it ONCE.
- Prefer the more specific/detailed version with the most accurate quantity and price.
- Later inputs override earlier ones for the same item.

PRICING TYPE RULES — THIS IS CRITICAL:
Every line item must have the correct pricingType. Get this wrong and the quote totals will be wrong.
- "standard"  → one-off supply, installation, configuration, or any item charged once. USE THIS for hardware, one-off labour, setup fees.
- "monthly"   → any recurring charge billed every month: managed support contracts, monitoring, maintenance retainers, per-device fees, per-user fees, SaaS subscriptions, helpdesk contracts. ALWAYS use "monthly" if the evidence describes an ongoing service with a monthly cost or cadence.
- "optional"  → add-ons or upgrades the client can choose to include or exclude. Use sparingly.
- "annual"    → annual contracts or licences billed yearly.

FOR IT SERVICES / MSP QUOTES SPECIFICALLY:
- Managed support contracts, network monitoring, helpdesk retainers, per-device management fees → pricingType: "monthly"
- Microsoft 365, software subscriptions, security monitoring → pricingType: "monthly"
- Hardware supply, one-off installation days, configuration → pricingType: "standard"
- If the evidence describes ongoing maintenance, support SLA, or a monthly fee even without a specific price — CREATE the line item with pricingType "monthly" and your best estimated UK market rate. Set estimated: true.
- A support contract for ~16 managed devices (router, switches, APs, fibre converters) typically runs £150–£350/month in the UK depending on SLA level. Use this range if no price is stated.
- DO NOT omit monthly items just because no price was given. Estimate and flag.

${itInvoiceAddendum}Respond ONLY with valid JSON in this exact format:
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
- jobDescription: 2-3 detailed sentences covering the FULL scope. Include specifics — server types, cable lengths, page counts, service descriptions. Write from the perspective of the quoting business describing the work they'll do.
- labour: Team composition summary — one entry per distinct role/mode combination. ALWAYS include the delivery mode in the role name so entries are unambiguous: "Network Engineer — Onsite", "Network Engineer — Workshop", "IT Consultant — Remote", "Engineer — Commissioning". Never write just "Network Engineer" if that person appears in multiple modes. Only include labour entries when there is genuinely separate hands-on labour not covered by catalog service items. CRITICAL: if the labour role already exists as a materials line item (e.g. "IT Labour Workshop" is a priced line), do NOT also add it to labour[]. Check every labour entry against the materials list before including it — if it's already there as a line item, omit it from labour[].
- materials: Every billable line item with catalog-matched prices where possible. Use the EXACT "item" name from the catalog. Use the EXACT "unit" from the catalog (Per Hour, Per Month, Per 5,000, Session, etc.).
  For "description" — choose the right format based on item type. NEVER use newlines, "•", or any other separator — only "||", "##", or plain text.
  - SIMPLE items (single hardware unit, straightforward supply): one clear plain sentence. E.g. "24-port managed PoE switch for main communications cabinet."
  - STANDARD items covering multiple deliverables or tasks (a labour day with several activities, a setup service with multiple components): use "||" to list each element. E.g. "1.5 days onsite installation || Vigor Router setup on Gigaclear line || WiFi access point deployment across 9 locations || VLAN testing and commissioning". Only use "||" when a breakdown genuinely helps the client understand what they're getting.
  - SEQUENTIAL items where order matters (installation sequences, commissioning steps, phased rollouts): use "##" to list numbered steps. E.g. "Network infrastructure installation ## Remove old switch and patch panel ## Rack-mount and cable new PoE switch ## Configure VLANs and test connectivity ## Commission and handover". Use "##" when steps must happen in order.
  - MONTHLY or ANNUAL items (contracts, retainers, ongoing services): ALWAYS use "||". The description IS the sales document. Format: summary sentence || feature 1 || feature 2 || feature 3 (minimum 4 features). Draw from the evidence AND your knowledge of what a well-structured contract at this price point includes. Examples per sector:
    - IT/MSP: monitoring coverage, incident response SLA, included remote support hours, patch management, backup verification, reporting cadence
    - Cleaning: visit frequency, areas covered, tasks per visit, consumables, supervisor checks, emergency call-out terms
    - Maintenance/FM: planned visits per year, reactive call-out SLA, included labour hours, parts coverage, compliance docs
    - Pest control: inspection frequency, covered pests, treatment methods, certificates provided
    Example: "Comprehensive managed support for 16-device network || 24/7 monitoring of all network devices || Security patch management and firmware updates || Remote support up to 4 hours/month || Monthly health report and configuration backups || 4-hour response SLA during business hours"
  Never leave description blank for any item.
- notes: Assumptions, site access requirements, items needing verification, phasing suggestions, anything the user should review.
- isTradeRelevant: false only if the content has nothing to do with ${tradeLabel} work.

BEFORE OUTPUTTING JSON — run this mental checklist:
1. Have I created a separate materials line item for EVERY distinct labour engagement mentioned (onsite, workshop, remote, discovery, training, commissioning etc.)?
2. Have I included ALL recurring/monthly items? Check the evidence again for any ongoing support, maintenance, monitoring, or subscription mentioned.
3. Have I included every piece of equipment, hardware, or product mentioned — even items without explicit prices?
4. Does every materials line item have a meaningful description drawn from the evidence?
5. Are pricingTypes correct — standard for one-off, monthly for recurring?
6. Does labour[] contain ONLY roles that are NOT already priced as materials line items? If a labour role appears in materials, remove it from labour[].
Only output JSON once all six checks pass.

If a field is not mentioned or cannot be determined, use null. Respond with valid JSON only — no preamble, no explanation, no markdown fences.`;

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
        console.error(`[GeneralEngine] Response truncated at max_tokens — input may be too large`);
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
        engineUsed: "GeneralEngine",
        engineVersion: "1.0.0",
        riskNotes: null,
      };
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      console.error(`[GeneralEngine] analyse failed: ${message}`);
      return this.emptyOutput(`Engine error: ${message}`);
    }
  }

  // ─── Degraded output — always returns valid shape per G1 ─────────────────
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
      engineUsed: "GeneralEngine",
      engineVersion: "1.0.0",
      riskNotes: reason,
    };
  }
}
