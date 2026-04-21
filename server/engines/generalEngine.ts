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
      // Beta-1: tag every evidence block with [INPUT_ID: N] so the model can
      // echo the IDs back on each materials row (see sourceInputIds in the
      // system prompt below). A single input that emits multiple blocks
      // (content + processedContent) shares the same tag — both trace back
      // to the same input row.
      const idTag = `[INPUT_ID: ${inp.id}]`;
      if (inp.inputType === "audio" && inp.content && !inp.fileUrl) {
        allContent.push(`${idTag} Voice Note (${inp.filename || "untitled"}): ${inp.content}`);
      } else if (inp.inputType === "audio" && inp.content && inp.fileUrl) {
        allContent.push(`${idTag} Audio Transcription (${inp.filename || "untitled"}): ${inp.content}`);
      } else if (inp.content && !inp.fileUrl) {
        allContent.push(`${idTag} Text Input: ${inp.content}`);
      }

      if (inp.processedContent) {
        const content =
          inp.processedContent.length > 50000
            ? inp.processedContent.substring(0, 50000) +
              "\n\n[Document truncated — original was " +
              inp.processedContent.length +
              " characters]"
            : inp.processedContent;
        allContent.push(`${idTag} Document (${inp.filename || inp.inputType}): ${content}`);
      } else if (inp.extractedText) {
        const content =
          inp.extractedText.length > 50000
            ? inp.extractedText.substring(0, 50000) +
              "\n\n[Document truncated — original was " +
              inp.extractedText.length +
              " characters]"
            : inp.extractedText;
        allContent.push(`${idTag} Extracted Text (${inp.filename || inp.inputType}): ${content}`);
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

Pick one specific number near the middle of the range — never return null for unitPrice on anchor-rated rows. The user reviews every estimated price before the quote goes to the client.

SCOPE OF THESE ANCHOR RATES — IMPORTANT: the anchor rates above apply ONLY to:
(a) non-substitutable rows where the evidence price is redacted / POA / blank, and
(b) as a sanity check for catalog-substituted rows (catalog defaultRate takes precedence).
Anchor rates DO NOT apply to PASSTHROUGH rows. Passthrough rows echo the source evidence price exactly, or 0 if the evidence shows no price — they never fabricate a price from anchor ranges. See PASSTHROUGH FALLBACK below.

ADDITIVE BEHAVIOUR — MIXED EVIDENCE:
If the evidence is a MIX of an invoice/contract AND a separate request for new or additional work (e.g. invoice attached plus an email saying "we also want to add 10 more users and a backup service"), extract BOTH — every invoice line item AND the additional requested work. All flow into materials[].

═══════════════════════════════════════════════════════════════
CATEGORY-FIRST REASONING — HOW TO AVOID SILENT BUGS
═══════════════════════════════════════════════════════════════

An MSP's catalog represents the vendor THEY have chosen in each commodity category. When invoice/contract evidence mentions a product from a DIFFERENT vendor in the SAME commodity category, the MSP will quote their own equivalent — that is how a competitive takeover quote works. But reasoning by "nearest vibe-match" causes silent, expensive bugs: firewalls get replaced with password managers, server/workstation backup agents get replaced with M365 cloud-to-cloud backup, unmapped named-user support gets reused at an invented price behind a "Catalog" badge. Reason CATEGORY-FIRST, and honour hard boundaries between categories.

FORCED CATEGORISATION STEP — do this for EVERY evidence line item BEFORE deciding how to price it:

STEP 1 — Identify the commodity category of the evidenced item. Emit it on the material row as "evidenceCategory" (short snake_case). Use one of these values; extend only if none fit:
"firewall", "password_manager", "m365_backup", "server_backup", "endpoint_security", "email_threat_protection", "dns_filter", "email_signature_management", "rmm", "it_documentation", "named_user_support", "managed_server_support", "project_labour", "service_desk_labour", "microsoft_365_licence", "telephony", "specific_hardware", "other".

STEP 2 — Determine whether that category is SUBSTITUTABLE per the rules below. Emit on the material row as "substitutable": true | false.

STEP 3 (only if substitutable === true) — Scan the user's catalog for an item that semantically fits the evidenceCategory. Match on the catalog item's NAME, DESCRIPTION, UNIT, and PRICING TYPE — NOT on the catalog item's "category" field. The catalog's category field is a HINT, not a filter: a catalog item whose name, description, unit, and pricing model clearly match the evidenceCategory is a valid match regardless of what its category field says. For example, an item named "Managed Server Support" with unit "Server" and a description mentioning OS patching, monitoring, and AD health is a valid match for evidenceCategory: "managed_server_support" even if its category field is "IT Support Contracts", "Servers", "Management", or blank.
  - If a semantically-matching catalog item IS FOUND → substitute (see HOW TO SUBSTITUTE below).
  - If NO semantically-matching catalog item is found → apply the PASSTHROUGH FALLBACK (see below). Do NOT reuse a near-miss catalog item at an invented price or invented unit.

STEP 4 (only if substitutable === false) — Quote the source evidence verbatim:
  - "item" and "description" from source (apply administrative-prefix strip and bracket-tag preservation as above).
  - "quantity" and "unit" exactly as shown on the evidence.
  - "unitPrice" echoes the source evidence price if shown; applies the anchor rate from the UK MSP rates block above if the evidence price is redacted / POA / blank.
  - "estimated": true when anchor rate is used, false when evidence price is echoed.
  - Do NOT set passthrough: true for non-substitutable items — they are correctly-handled client-specific rows, not fallback rows.

EXPLICIT CATEGORY BOUNDARIES — NON-NEGOTIABLE:

- A FIREWALL is NOT a password manager, NOT endpoint security, NOT email threat protection, NOT a DNS filter, NOT any other security category. Firewalls (Sophos XGS, Sophos XG, Fortinet FortiGate, WatchGuard, Cisco Meraki MX, SonicWall, Ubiquiti UniFi, Juniper SRX, DrayTek Vigor) are NON-SUBSTITUTABLE and MUST be quoted by the EXACT brand / model named in the evidence. Never map a firewall to any catalog item that is not itself a firewall of the same brand and model.

- MICROSOFT 365 BACKUP (cloud-to-cloud, tenant-level, agentless — Datto SaaS Protect, Barracuda Cloud-to-Cloud Backup, Veeam Backup for M365, SkyKick, Spanning, AvePoint, Redstor) and SERVER / WORKSTATION BACKUP / BCDR (agent-based, on-prem — Datto SIRIS, Datto ALTO, Veeam Backup & Replication, Acronis Cyber Protect, Axcient x360Recover, NAKIVO, StorageCraft ShadowProtect) are DIFFERENT product categories that do NOT substitute for each other. The word "Agent" in an evidenced item (e.g. "BCDR Agent", "Protected Agent") is a STRONG SIGNAL of server / workstation backup — NOT M365 backup. A per-user or per-tenant quantity with no agent count is a signal of M365 backup. These two categories do not share a single catalog item.

- ENDPOINT SECURITY / AV is NOT a firewall and is NOT email threat protection. These sound related; they are SEPARATE categories. Do not cross-map.

POSITIVE LIST — CATEGORIES WHERE SUBSTITUTION IS CORRECT (brand-agnostic commodities):
- Password managers: LastPass, 1Password, Keeper, Bitwarden, Dashlane, NordPass, RoboForm — all interchangeable commodities.
- Endpoint security / anti-virus: ESET, Sophos Intercept X, Sophos Endpoint, Bitdefender, CrowdStrike Falcon, SentinelOne, Webroot, Malwarebytes, Trend Micro Apex One, Microsoft Defender for Business, Kaspersky, Norton Small Business — all interchangeable commodities. (NOT to be confused with firewalls — see above.)
- Email threat protection / secure email gateway: Mimecast, Proofpoint Essentials, Barracuda Email Protection, Avanan, IRONSCALES, Microsoft Defender for Office 365 — all interchangeable commodities.
- Microsoft 365 backup (cloud-to-cloud, agentless): Datto SaaS Protect, Barracuda Cloud-to-Cloud Backup, Veeam Backup for M365, SkyKick Cloud Backup, Spanning, AvePoint Cloud Backup, Redstor — all interchangeable commodities. These are NOT interchangeable with server / workstation backup.
- Server / workstation backup and BCDR (agent-based): Datto SIRIS, Datto ALTO, Veeam Backup & Replication, Acronis Cyber Protect, Axcient x360Recover, NAKIVO, StorageCraft ShadowProtect — all interchangeable commodities. These are NOT interchangeable with M365 backup.
- Email signature management: Exclaimer, CodeTwo, Rocketseed, Opensense, Templafy — all interchangeable commodities.
- Remote monitoring and management (RMM): Datto RMM, NinjaOne, Atera, ConnectWise Automate, Kaseya VSA, N-able N-sight, N-able RMM, Pulseway — all interchangeable commodities.
- IT documentation: IT Glue, Hudu, ITBoost, Confluence (in MSP context) — all interchangeable commodities.
- DNS filtering / web filtering: Webroot DNS, Cisco Umbrella, DNSFilter, SafeDNS — all interchangeable commodities.
- Named-user support contracts from a competing provider (e.g. "Reach IT Support [Core] Named User" on an incumbent invoice): named-user support IS a commodity category. Map to the user's catalog support tier if a semantic match exists (e.g. "Silver IT Support — Unlimited Remote" with unit "User" and pricingType "monthly"), noting the substitution. If no semantic match exists, apply PASSTHROUGH — do NOT reuse a support SKU with a different unit or a different pricing model.

NEGATIVE LIST — CATEGORIES WHERE SUBSTITUTION IS WRONG (client-specific — quote exactly as evidenced):
- Microsoft 365 vs Google Workspace vs Zoho — productivity suites are a client ecosystem decision. Never swap.
- Specific firewall brands AND MODELS: Sophos XGS / XG, Fortinet FortiGate, WatchGuard, Cisco Meraki MX, SonicWall, Ubiquiti UniFi, Juniper SRX, DrayTek Vigor — different management, licensing, and integration. Quote the EXACT brand AND model named in the evidence.
- Specific hardware SKUs — if the evidence names a model (e.g. "Sophos XGS 118", "Cisco Catalyst 9200L-24P"), quote that exact model. The client may already own it or have integration requirements.
- Telephony systems: 3CX vs Microsoft Teams Phone vs Zoom Phone vs RingCentral vs Gamma Horizon — different integration and porting implications. Quote the same system.
- Managed server support tier (per-server) — if the incumbent bills per-server for managed server support, this is NOT a named-user support line and does NOT substitute into a per-user support SKU. It is either mapped to a catalog item whose UNIT is "Server" and whose description describes server management (substitutable: true, semantic match on unit), or it is applied via PASSTHROUGH.

HOW TO SUBSTITUTE (only when substitutable: true AND a semantic catalog match exists on NAME + DESCRIPTION + UNIT + PRICING TYPE):
1. Use the catalog item's EXACT "name" as the materials "item" field.
2. Use the catalog item's EXACT "unit". Do NOT change the unit to fit evidence. If the catalog unit is "User" and the evidence is billed per "Month" (or per "Server", or per "Site"), the item DOES NOT MATCH — apply PASSTHROUGH instead.
3. Use the catalog item's EXACT "defaultRate" as unitPrice. Set estimated: false. Never invent a different price to fit the evidence.
4. Copy quantity from the evidence, converting only when the unit conversion is exact and unambiguous (e.g. evidence "14 users" + catalog unit "User" → quantity 14). When in doubt, passthrough.
5. Start the "description" with "Replaces existing [evidenced product name]" followed by " || " then the catalog description. Example: "Replaces existing LastPass subscription || Enterprise password manager per user || Secure encrypted vault..."
6. Emit: passthrough: false, evidenceCategory: <category>, substitutable: true.
7. Silent substitution is a bug. Every substituted item MUST show "Replaces existing [original product]" in the description so the user can review and revert in the QDS.

PASSTHROUGH FALLBACK — when evidenceCategory IS substitutable AND NO catalog item semantically fits:
1. Set passthrough: true.
2. Set "item" to the source item name verbatim. Apply the administrative-prefix strip ("Contract:" / "Service:" removed) from the INVOICE LINE ITEM MAPPING rules above.
3. Set "description" to the source detail verbatim. Do NOT prefix with "Replaces existing" — nothing is being replaced. Preserve bracket tags exactly as evidenced.
4. Set "quantity" and "unit" EXACTLY as shown on the source evidence. Do NOT convert units.
5. Set "unitPrice": echo the source evidence price if shown; set to 0 if the evidence shows no price (redacted, POA, blank). Do NOT apply anchor rates. Do NOT fabricate a price.
6. Set "estimated": false. (Estimation applies only to anchor-rated rows, never to passthrough rows.)
7. Set "evidenceCategory" to the best category identification (not null). Set "substitutable": true. (You reached passthrough BECAUSE the category is substitutable — the category exists, the catalog just has no semantic match.)

FIELD EMISSION — every material row from this addendum MUST carry evidenceCategory, substitutable, and passthrough:
- Catalog-substituted row         → passthrough: false, evidenceCategory: <category>, substitutable: true
- Client-specific row (firewall, specific hardware SKU, telephony, productivity suite, named model) → passthrough: false, evidenceCategory: <category>, substitutable: false
- Passthrough row (substitutable category, no catalog semantic match) → passthrough: true, evidenceCategory: <category>, substitutable: true

ANTI-FABRICATION RULE — NON-NEGOTIABLE:
If you use a catalog item's "name" on a material row, you MUST also use that item's EXACT "unit" and EXACT "defaultRate" from the catalog. You may NOT change a catalog item's unit or price to fit evidence that doesn't match. If the evidence doesn't fit any catalog item's unit / pricing model, apply the PASSTHROUGH FALLBACK instead of reusing a near-miss catalog SKU at an invented price or invented unit. The moment you find yourself typing a unitPrice that is not the evidence price, not a catalog defaultRate, and not one of the UK MSP anchor rates above — stop. That is fabrication. Use passthrough (with unitPrice 0 if no price is known) and let the user set the price in the QDS.

DO NOT INVENT SCOPE:
Extract only what the evidence actually shows. If an invoice has 14 M365 licences, the quote has 14 — not 15, not "14 or so". If prices are redacted, flag with estimated: true on anchor-rated rows, or use passthrough with unitPrice 0 when the row cannot be anchor-rated — do not fabricate exact unit prices. If the client is asking about adding services, only quote what they asked for.

` : "";

    // ── Website & Digital Marketing addendum (gated on "website_marketing") ────
    //
    // Mirrors the itInvoiceAddendum pattern for digital agencies. Activates only
    // when this.tradePreset === "website_marketing". For every other sector
    // this evaluates to an empty string and the interpolated prompt is
    // byte-identical to the pre-existing prompt — zero behaviour change.
    //
    // Purpose: agency takeover workflow (prospect shares an incumbent-agency
    // retainer statement, SOW, or hosting contract; Wez needs the AI to treat
    // it as scope, not reject it as "not a request for quotation"). Canonical
    // item names and price anchors are drawn from websiteMarketingSeed.ts.
    const websiteMarketingAddendum = this.tradePreset === "website_marketing" ? `WEBSITE & DIGITAL MARKETING SECTOR — INVOICE / CONTRACT / RETAINER EVIDENCE (CRITICAL FOR AGENCY TAKEOVER QUOTES):

The evidence for a digital agency quote frequently includes invoices, retainer statements, scope-of-work documents, or hosting contracts from a previous agency or freelancer. This is expected and legitimate. Common agency scenarios:
- Prospect shares their current agency's retainer invoice so you can quote to match or improve it
- Renewal cycle: last month's invoice becomes the basis for the next 12-month retainer quote
- Takeover/migration: client is moving website hosting, SEO retainer, or paid media management to you
- Cost-reduction review: prospect is pricing an alternative to their current agency's arrangement

When the evidence is an invoice, retainer statement, SOW, or hosting contract, DO NOT return empty materials with a note saying "this is not a request for quotation". The document IS the scope definition. Extract every line item into the materials[] array. Set isTradeRelevant: true — an invoice from another digital agency is always trade-relevant.

INVOICE LINE ITEM MAPPING:
- Each numbered/listed row on the invoice → ONE material in the output.
- "item": the service name. Strip administrative prefixes like "Retainer:" or "Monthly Fee:" — e.g. "Retainer: SEO — National — Feb 26" becomes item: "National SEO Retainer". Match to the user's catalog naming where possible ("Business Website — 10–15 Pages", "Managed WordPress Hosting", "Website Care Plan — Pro", "Local SEO Retainer", "Google Ads Management", "Social Media Management — 2 Channels", "Logo Design", "Full Brand Identity Package").
- "description": preserve the technical detail including commitment terms ("[6-month minimum]", "[12-month commitment]"), included scope ("up to £5,000 monthly ad spend", "12 posts/month across 2 channels", "1,000+ word articles ×2/month"), and platform specifics ("Shopify", "WordPress + WooCommerce", "Webflow"). Use "||" separator when expanding scope.
- "quantity": exactly as shown on the invoice (1 for a single retainer; 2 for "2 × SEO articles"; 12 for "12 social posts"; hour count for dated dev time).
- "unit": match the invoice's billing unit. "Month" for retainers, "Year" for annual hosting or domain renewals, "Project" for one-off builds or audits, "Article" for content pieces, "Hour" for ad-hoc dev/design, "Pack" for content packs, "Page" for copywriting charged per page, "Deliverable" for marketing collateral.

PRICING TYPE FROM CADENCE MARKERS:
- "Monthly retainer", "per month", "/mo", "hosting — monthly", "care plan — monthly", "management fee — monthly", "Social media — monthly", any recurring retainer → pricingType: "monthly". Commitment terms (3/6/12-month minimum) belong in the description, NOT the cadence.
- "Annual domain renewal", "SSL certificate — 1 year", "annual licence", "yearly hosting prepay" → pricingType: "annual".
- "Website build", "landing page", "design project", "one-off audit", "brand identity package", "ad-hoc dev hours this month", "logo design", "content pack — one-off" → pricingType: "standard".
- Dated hourly dev/design lines on an invoice (e.g. "12 Feb 2026 — Web Developer, 3.5 hrs") → pricingType: "standard", unit: "Hour", each dated row a SEPARATE material even if the role repeats.
- CRITICAL — "Ad spend reimbursement", "Media spend — passed through", or any line that represents client ad spend paid to Google/Meta/LinkedIn: DROP these entirely. Ad spend is paid DIRECTLY to the platform by the client and is NOT billed by the agency. Only the management fee is billed. If a single line combines management fee + ad spend ("Google Ads £3,695 — includes £3,200 spend + £495 management"), extract ONLY the management fee portion (£495 in this example) as a materials line and note "Ad spend billed separately direct to Google" in the description.

REDACTED OR MISSING PRICES (common on shared retainer statements):
Populate unitPrice with a realistic UK mid-market agency estimate and set "estimated": true. UK mid-market anchors (ex VAT):
- Brochure website (5 pages): £1,500–£3,000 project
- Business website (10–15 pages): £3,000–£6,000 project
- Shopify / WooCommerce store (up to 50 products): £4,000–£8,000 project
- Landing page (single conversion-optimised): £500–£1,000 project
- Website refresh (existing site redesign): £900–£1,800 project
- Managed WordPress hosting: £25–£45/month
- Website care plan — basic: £50–£90/month
- Website care plan — pro: £100–£175/month
- Domain registration: £12–£20/year
- SEO audit (one-off technical + content): £350–£750 project
- Local SEO retainer: £400–£750/month
- National SEO retainer: £800–£2,000/month (complexity-driven)
- SEO content article (1,000 words): £150–£300/article
- Google Ads management fee: £350–£650/month (at up to £5,000 monthly ad spend); tiered upward above
- Meta Ads (Facebook + Instagram) management fee: £300–£550/month (at up to £3,000 monthly ad spend); tiered upward above
- LinkedIn Ads management fee: £450–£800/month
- Social media management — 2 channels (12 posts/channel): £300–£500/month
- Social media management — 4 channels: £650–£1,000/month
- Social content pack (12 branded posts): £225–£375 one-off
- Logo design: £400–£900 project
- Full brand identity package: £1,500–£3,000 project
- Marketing collateral design: £150–£250 per deliverable
- Copywriting (per page or asset): £120–£250
- Web developer — hourly: £65–£100
- Designer — hourly: £55–£80
- Digital marketer / strategist — hourly: £65–£100

Pick one specific number near the middle of each range — never return null for unitPrice. The user reviews every estimated price before the quote goes to the client.

ADDITIVE BEHAVIOUR — MIXED EVIDENCE:
If the evidence is a MIX of an incumbent retainer invoice AND a separate request for new work (e.g. retainer invoice attached plus an email "we also want a Black Friday landing page this month and 3 extra social posts"), extract BOTH — every retainer line AND the additional requested work. All flow into materials[].

SMART CATEGORY SUBSTITUTION (HOW AN AGENCY WINS A COMPETITIVE TAKEOVER):
When incumbent-agency evidence names a vendor or platform in a commodity category where the user's catalog represents the user's chosen equivalent, substitute in favour of the user's catalog item at the user's catalog price. For channel-locked categories (paid ads on a specific platform), match the same channel — never swap channels.

CATEGORIES WHERE SUBSTITUTION IS CORRECT (brand-agnostic commodities):
- Website hosting providers: WP Engine, Kinsta, SiteGround, Cloudways, 20i, Krystal, GoDaddy hosting, Bluehost, Flywheel, Pressable, Hostinger, Namecheap hosting, Liquid Web, DreamHost — all substitutable commodity hosting. Agency resells its preferred stack.
- Domain registrars: GoDaddy, Namecheap, 123-reg, Google Domains, Gandi, Hover, Cloudflare Registrar — commodity.
- Website care / maintenance plan providers: any competitor-agency "WordPress care plan", "maintenance plan", "support plan" — substitute for the user's equivalent care tier (Basic vs Pro).
- Email marketing / automation platforms where the agency bills a MANAGEMENT FEE: Mailchimp, Klaviyo, HubSpot Marketing, Constant Contact, ActiveCampaign, Drip, Brevo (formerly Sendinblue), Campaign Monitor, MailerLite — the MANAGEMENT FEE is commodity; the platform subscription is paid by the client direct to the vendor.
- CRM admin retainers: HubSpot CRM admin, Salesforce admin, Pipedrive admin, Zoho CRM admin — agency's admin time is commodity.
- SEO tooling platforms (Ahrefs, SEMrush, Moz, SE Ranking) where the agency bills a retainer that INCLUDES tool access: substitute — the user's SEO retainer covers equivalent tooling.

CATEGORIES WHERE SUBSTITUTION IS WRONG (channel-locked or strategic client choices — quote as evidenced):
- Google Ads management fee: CHANNEL-LOCKED. If the incumbent runs Google Ads, quote a Google Ads management fee — NOT a Meta Ads or LinkedIn Ads fee. The channel reflects where the client's audience converts and is a strategic decision, not a commodity choice.
- Meta Ads (Facebook + Instagram) management fee: CHANNEL-LOCKED to Meta.
- LinkedIn Ads management fee: CHANNEL-LOCKED to LinkedIn (B2B-specific).
- TikTok / Pinterest / X (Twitter) / Amazon Ads management fees: each CHANNEL-LOCKED to that platform.
- The AD SPEND itself is NEVER substitutable — it is paid directly by the client to the platform. Agencies bill ONLY the management fee, never the spend. Invoice line combining both should be split; only the management fee goes into materials[].
- CMS platform choice: WordPress vs Shopify vs Webflow vs Squarespace vs Wix vs Magento — the CMS is a strategic client decision with migration costs, team skill implications, and ecosystem lock-in. If the incumbent built on Shopify, do NOT substitute a WooCommerce build unless the client explicitly requests migration.
- Specific branded design systems, component libraries, or franchise-wide templates — client-mandated, never substitute.
- Named integrations the client has already committed to (e.g. "integration with Xero", "sync to HubSpot Enterprise", "embed Calendly") — scope the same integration, don't swap for a different platform.
- Productivity suites (Microsoft 365 vs Google Workspace) — client ecosystem decision, not the agency's call.

HOW TO SUBSTITUTE:
1. Read the evidence item. Identify its commodity category (hosting? care plan? email platform management? SEO retainer?).
2. Scan the user's catalog for an item in the same category.
3. If a catalog match exists in a SUBSTITUTABLE category:
   - Use the catalog item's exact "name" as the materials "item" field.
   - Use the catalog item's defaultRate as unitPrice. Set estimated: false.
   - Copy quantity from the evidence.
   - Start the "description" with "Replaces existing [evidenced provider/product]" followed by "||" then the catalog description.
4. If the category is CHANNEL-LOCKED (Google Ads, Meta Ads, LinkedIn Ads, specific CMS), match the same channel/platform at the user's catalog rate for that channel. Do NOT swap channels.
5. If no catalog match exists in the evidenced category, fall back to UK mid-market anchors above with estimated: true.
6. Silent substitution is a bug. Every substituted item MUST have "Replaces existing [original provider]" visible in the description so the user can review and revert in the QDS if needed.

DO NOT INVENT SCOPE:
Preserve exact counts. If the retainer covers 12 social posts/month across 2 channels, quote 12 across 2 — not 15, not "around a dozen", not 4 channels. If the SEO retainer commits to 2 articles/month, quote 2. If the ad management tier is pegged to £5,000/month ad spend, preserve that spend bracket in the description (the management fee tier depends on it). Don't inflate or round.

` : "";

    // ── Commercial Cleaning addendum (gated on "commercial_cleaning") ─────────
    //
    // Mirrors the itInvoiceAddendum pattern for commercial cleaning firms.
    // Activates only when this.tradePreset === "commercial_cleaning". For
    // every other sector this evaluates to an empty string and the interpolated
    // prompt is byte-identical to the pre-existing prompt.
    //
    // Purpose: contract takeover workflow (B2B prospect shares an incumbent-
    // provider monthly invoice or FM tender scope; AI must treat it as scope,
    // not reject it). Canonical item names and price anchors are drawn from
    // commercialCleaningSeed.ts.
    const commercialCleaningAddendum = this.tradePreset === "commercial_cleaning" ? `COMMERCIAL CLEANING SECTOR — INVOICE / CONTRACT / STATEMENT EVIDENCE (CRITICAL FOR CONTRACT TAKEOVER QUOTES):

The evidence for a commercial cleaning quote frequently includes invoices, service contracts, or monthly statements from an incumbent cleaning provider (UK majors include Rentokil Initial, Servest, Mitie, OCS, ISS Facilities, ABM UK, Bidvest Noonan, Atalian Servest, Churchill Contract Services, or regional and independent firms). This is expected and legitimate. Common scenarios:
- B2B prospect shares the incumbent's monthly invoice so you can quote to match or undercut
- FM (facilities management) annual review driving a retender
- Landlord / tenant handover where the cleaning contract transfers or retenders
- Cost-reduction review — prospect is pricing an alternative to the current arrangement
- Sector change: new food premises opening, or a site moving from standard office to healthcare/CQC

When the evidence is an invoice, contract, or statement, DO NOT return empty materials with a note saying "this is not a request for quotation". The document IS the scope definition. Extract every line item into the materials[] array. Set isTradeRelevant: true — an invoice from another commercial cleaning provider is always trade-relevant.

INVOICE LINE ITEM MAPPING:
- Each numbered/listed row on the invoice → ONE material in the output.
- "item": the service name. Strip administrative prefixes like "Cleaning Services:" or "Monthly Contract:" — e.g. "Monthly Contract: Office Cleaning — Mon–Fri evenings, 3hr/night" becomes item: "Daily Office Cleaning — Medium Site (2,000–10,000 sq ft)" (mapped to the nearest catalog tier by footprint/hours). Match to user catalog naming where possible ("Daily Office Cleaning — Small / Medium / Large Site", "Retail Cleaning — Daily", "Healthcare / GP Surgery Cleaning — Daily", "Communal Area Cleaning", "Washroom Services Contract", "Deep Clean — Office").
- "description": preserve specifics — visit frequency ("Mon–Fri evenings, 3hrs/night", "7-day retail, early-morning"), footprint ("4,500 sq ft"), scope ("office + kitchen + 2 washrooms"), compliance ("CQC-audited", "BICSc Level 2 trained", "BRC-compliant documentation"), staff arrangement ("dedicated cleaner, DBS-checked", "2-person evening team"), billing cadence ("Billed quarterly in arrears"). Use "||" between elements.
- "quantity": match the invoice's billing unit. For monthly retainers, quantity is typically 1. For consumables with a headcount, quantity may be the user headcount. For sanitary bins, quantity is the number of units. For per-sq-ft services, quantity is the area.
- "unit": match the invoice's billing unit. "Month" for retainers, "Washroom" for washroom services per washroom, "Unit" for per-unit hygiene services (sanitary bins, air freshener units), "Sq ft" or "Sq m" for area-based pricing (deep cleans, carpet, hard floor), "Visit" for per-visit periodic cleans, "Property" for end-of-tenancy, "Chair" for upholstery cleaning, "Hour" for hourly labour, "Callout" for biohazard/emergency.

PRICING TYPE FROM CADENCE MARKERS:
- "Monthly contract", "per month", "nightly Mon–Fri", "daily cleaning", "weekly cleaning", "Mon–Fri evening cleans", any recurring retainer → pricingType: "monthly".
- CRITICAL: recurring contracts on a quarterly billing cycle (very common in FM — "Billed quarterly in arrears") STILL use pricingType: "monthly". The figure in unitPrice is the MONTHLY AVERAGE. The quarterly billing cadence lives in the description (e.g. "Monthly figure shown is average — billed quarterly in arrears"). Do not use pricingType: "annual" for a quarterly-billed monthly-service contract.
- "One-off deep clean", "carpet clean — single visit", "window clean — single visit", "end-of-tenancy", "post-construction / builders' clean", "emergency callout", "biohazard response", "one-off office clean" → pricingType: "standard".
- "Per sq ft" or "per sq m" pricing on a deep/periodic clean → pricingType: "standard" (area-based one-off charge).
- "Annual contract" billed as a single annual fee (rare in commercial cleaning, sometimes seen on window-cleaning-only contracts) → pricingType: "annual" ONLY if the invoice shows one annual line with no monthly breakdown.
- Dated hourly cleaner/supervisor lines ("14 Feb 2026 — Cleaner OOH, 4.5 hrs") → pricingType: "standard", unit: "Hour", each dated row a SEPARATE material.

REDACTED OR MISSING PRICES (very common on incumbent-provider invoices — national contractors often mask rates):
Populate unitPrice with a realistic UK mid-market estimate and set "estimated": true. UK mid-market anchors (ex VAT):
- Daily office cleaning — small site (under 2,000 sq ft, Mon–Fri evenings): £400–£600/month
- Daily office cleaning — medium site (2,000–10,000 sq ft): £1,000–£1,800/month (mid-range ~£1,250 for ~5,000 sq ft)
- Daily office cleaning — large site (10,000+ sq ft): £1,800–£3,500/month (scales heavily with footprint)
- Retail cleaning — daily (6- or 7-day schedule): £700–£1,100/month
- Healthcare / GP surgery cleaning — daily, CQC-compliant: £1,400–£2,200/month
- Communal area cleaning (residential block or commercial, weekly): £250–£550/month
- Deep clean — office, per sq ft: £0.30–£0.50
- Carpet cleaning (hot water extraction), per sq ft: £0.50–£0.85
- Hard floor strip, clean & polish, per sq m: £3.50–£6.00
- Window cleaning — internal, per visit (standard office): £100–£175
- Post-construction / builders' clean, per sq ft: £0.35–£0.55
- End-of-tenancy / void property clean (3-bed residential equivalent): £250–£350
- Upholstery cleaning — per office chair: £12–£18
- Pressure / jet washing, per sq m: £1.75–£2.75
- Graffiti removal, per sq m: £22–£35
- Biohazard / trauma cleanup (starting callout rate, scales with incident): £350–£650
- Washroom services contract, per washroom/month: £15–£25
- Consumables monthly supply (~30-user office): £75–£125/month
- Feminine hygiene unit servicing: £5.50–£8.00/unit/month
- Air freshener service: £4.00–£6.50/unit/month
- One-off office clean (non-contract visit, ~3 hrs): £130–£200/visit
- Emergency out-of-hours callout: £55–£80/hour (min 2-hour charge)
- Cleaner — daytime: £18–£26/hour
- Cleaner — out-of-hours (evening / early-morning): £22–£28/hour
- Cleaner — weekend / bank holiday: £28–£36/hour
- Supervisor / team leader: £28–£36/hour

Pick one specific number near the middle of each range — never return null for unitPrice. The user reviews every estimated price before the quote goes to the client.

ADDITIVE BEHAVIOUR — MIXED EVIDENCE:
If the evidence is a MIX of an incumbent contract AND a separate request for additional work (e.g. monthly invoice attached plus an email "we're also moving to new premises next month — can you quote a post-construction clean?" or "we've had a flood in the server room — emergency callout needed"), extract BOTH — every incumbent contract line AND the additional requested work.

SMART CATEGORY SUBSTITUTION:
A cleaning firm's catalog represents the supplier THEY have chosen for commodity services and consumables. When incumbent-provider evidence names a vendor in a commodity category, substitute in favour of the user's catalog item at the user's catalog price and note the substitution.

CATEGORIES WHERE SUBSTITUTION IS CORRECT (brand-agnostic commodities):
- Washroom services / sanitary waste providers: Initial Washroom Hygiene, Phs Group, Citron Hygiene, Cannon Hygiene, Anglian Washrooms, Grundon Sanitary, WasteCare — all substitutable commodity washroom services.
- Consumables suppliers (toilet paper, hand towels, hand soap, bin liners, general janitorial): Bunzl, Pattersons, Nisbets Hygiene, Janiking, CleanStream, Northwood Hygiene — commodity.
- Air freshener services: Initial, Phs, Citron Hygiene, Airscent, Prestige Hygiene — commodity.
- Feminine hygiene unit servicing: commodity across all national and regional providers.
- Cleaning chemicals sold as a monthly consumables top-up: Diversey, Ecolab, Jangro, Evans Vanodine, Selden, Prochem (for carpet care), 2Work — commodity when sold as consumables supply.
- Window cleaning (internal, standard reach height): commodity service across providers.
- Pressure washing, carpet cleaning, upholstery cleaning as standalone services: the service itself is commodity — user's catalog rate applies.

CATEGORIES WHERE SUBSTITUTION IS WRONG (client-specific or compliance-driven — quote as evidenced):
- Visit frequency: if the incumbent contract runs 5-nights-per-week, do NOT silently change to 3 nights because the user's default tier is 3-nights. Quote the same frequency or flag in notes that a reduced-frequency alternative is available for discussion.
- Compliance tier: if the incumbent contract is CQC-compliant (healthcare), BRC / SALSA / CIEH-compliant (food), or Ofsted-relevant (schools with DBS-checked staff), the user MUST match the compliance tier. Do NOT substitute a standard office contract for a healthcare or food-sector contract — doing so puts the client in breach at their next audit.
- Dedicated-staff arrangements (named dedicated cleaner, day porter, shared porter, on-site supervisor): contractual commitments that matter to the client. Match the arrangement.
- Site-specific PPE, hygiene protocols, or colour-coded equipment (infection-control kits, food-contact colour-coding, specialist PPE for biohazard): compliance-driven. Match the tier.
- Waste disposal routes (licensed waste carriers for clinical waste, sanitary waste, biohazard, category 1 healthcare waste): regulated — quote matching licensed routes, not commodity alternatives.
- Branded chemicals the client has standardised on (e.g. "site uses Ecolab exclusively for food-safe protocols", "Diversey chemicals as per group contract"): quote the same brand.

HOW TO SUBSTITUTE:
1. Read the evidence item. Identify its commodity category AND its compliance tier AND its visit frequency.
2. Scan the user's catalog for an item that matches ALL THREE.
3. If a catalog match exists in a SUBSTITUTABLE category AND matches compliance AND frequency:
   - Use the catalog item's exact "name" as the materials "item" field.
   - Use the catalog item's defaultRate as unitPrice. Set estimated: false.
   - Copy quantity from the evidence (number of washrooms, headcount, sq ft, sanitary units).
   - Start the "description" with "Replaces existing [evidenced provider]" followed by "||" then the catalog description.
4. If the category is NON-SUBSTITUTABLE (compliance-driven, frequency-specific), match the incumbent's tier at the user's catalog price for that tier — or flag with estimated: true if the user has no matching tier yet.
5. If no catalog match exists, fall back to UK mid-market anchors above with estimated: true.
6. Silent substitution is a bug. Every substituted item MUST have "Replaces existing [original provider]" visible in the description so the user can review and revert in the QDS.

DO NOT INVENT SCOPE:
Preserve exact visit counts, exact headcount, exact washroom count, exact sanitary unit count, exact square footage. If the incumbent invoice shows "20 visits/month", quote 20. If consumables are for 30 users, quote 30 users. If there are 4 washrooms under contract, quote 4 washrooms — not "approximately 4", not 5 to round up. Do not inflate and do not round.

` : "";

    // ── Pest Control addendum (gated on "pest_control") ──────────────────────
    //
    // Mirrors the itInvoiceAddendum pattern for pest control firms. Activates
    // only when this.tradePreset === "pest_control". For every other sector
    // this evaluates to an empty string and the interpolated prompt is
    // byte-identical to the pre-existing prompt.
    //
    // Purpose: incumbent takeover workflow (commercial prospect shares an
    // incumbent-provider contract invoice or audit-compliance statement;
    // AI must treat it as scope, not reject it). Canonical item names and
    // price anchors are drawn from pestControlSeed.ts.
    const pestControlAddendum = this.tradePreset === "pest_control" ? `PEST CONTROL SECTOR — INVOICE / CONTRACT / STATEMENT EVIDENCE (CRITICAL FOR INCUMBENT TAKEOVER QUOTES):

The evidence for a pest control quote frequently includes invoices, service contracts, or audit-compliant statements from an incumbent pest control provider (UK majors include Rentokil, Ecolab Pest Elimination, Cleankill, SafeGuard Pest Control, PestUK, Pelsis, Orkin UK, Insight Pest Solutions, or regional BPCA-member independents). This is expected and legitimate. Common scenarios:
- Commercial prospect shares the incumbent's contract invoice so you can quote to match or undercut
- BRC, SALSA, CIEH, CQC, or Ofsted audit driving a retender
- Food premises opening, expanding, or changing sector (retail → food-to-go, café → restaurant)
- Cost-reduction review — prospect is pricing an alternative to the current arrangement
- Residential / domestic one-off treatment after an infestation event

When the evidence is an invoice, contract, or audit-compliant statement, DO NOT return empty materials with a note saying "this is not a request for quotation". The document IS the scope definition. Extract every line item into the materials[] array. Set isTradeRelevant: true — an invoice from another pest control provider is always trade-relevant.

INVOICE LINE ITEM MAPPING:
- Each numbered/listed row on the invoice → ONE material in the output.
- "item": the service name. Strip administrative prefixes like "Service:" or "Contract:" — e.g. "Contract: Food Premises Servicing — 8 visits/yr" becomes item: "Food Premises Pest Control Contract — Restaurant / Café". Match to user catalog naming where possible ("Office / Retail Pest Control Contract", "Food Premises Pest Control Contract — Restaurant / Café", "Food Manufacturing / Warehouse Contract", "Healthcare / Pharmacy Pest Control Contract", "Schools / Nurseries Pest Control Contract", "Wasp / Hornet Nest Removal", "Rat Treatment — Residential", "Electronic Rodent Monitoring — Monthly").
- "description": preserve specifics — visit frequency ("8 visits/year", "quarterly in arrears", "monthly", "termly"), site type ("restaurant kitchen", "food manufacturing, risk rating A"), compliance ("BRC-compliant documentation", "CQC-audited", "DBS-checked staff", "BPCA member"), pest scope ("rodents + crawling insects + flying insects + EFKs"), number of monitoring stations, number of EFKs serviced, any chemical restrictions ("no SGARs in food areas", "IPM approach"). Use "||" between elements.
- "quantity": match the invoice's billing unit. For monthly contracts, typically 1. For electronic rodent monitoring (per-unit pricing), quantity is the number of units. For bird proofing, quantity is sq m. For mileage, quantity is miles.
- "unit": match the invoice's billing unit. "Month" for retainers, "Unit" for per-station or per-EFK monthly services, "Treatment" for one-off domestic/commercial treatments, "Property" for whole-property treatments (bed bugs, fleas), "Hour" for hourly technician work, "Survey" for site surveys, "Sq m" for bird proofing area, "Mile" for travel charges.

PRICING TYPE FROM CADENCE MARKERS:
- "Monthly servicing", "monthly retainer", "per month" → pricingType: "monthly".
- CRITICAL: "Quarterly servicing" / "4 visits per year" / "Quarterly in arrears" → pricingType: "monthly". The retainer is on a monthly cadence from the client's perspective (cost of doing business); the MONTHLY AVERAGE populates unitPrice, and the quarterly billing / visit cadence lives in the description (e.g. "Monthly figure shown is average — billed quarterly in arrears, 4 scheduled visits per year"). Do NOT use pricingType: "annual" for quarterly-billed quarterly-visited contracts.
- "Bi-monthly" / "8 visits per year" (typical food-sector cadence, BRC-compliant) → pricingType: "monthly".
- "Termly servicing" (schools, 3 or 4 visits per year aligned to school terms) → pricingType: "monthly".
- "Annual contract with [N] visits" → pricingType: "monthly" if the invoice structure bills periodically (monthly or quarterly); pricingType: "annual" ONLY if the invoice shows a single annual fee with no periodic breakdown.
- "Electronic monitoring — per unit per month" → pricingType: "monthly", unit: "Unit", quantity: the number of units.
- "One-off treatment", "wasp nest removal", "bed bug treatment", "cockroach programme", "emergency callout", "initial site survey", "rodent proofing works", "EFK supply & install" → pricingType: "standard".
- Dated hourly technician lines ("22 Feb 2026 — BPCA Technician, 2 hrs") → pricingType: "standard", unit: "Hour", each dated row a SEPARATE material.

REDACTED OR MISSING PRICES (very common on contract statements — nationals often redact rates):
Populate unitPrice with a realistic UK mid-market estimate and set "estimated": true. UK mid-market anchors (ex VAT):
- Office / retail pest control contract (quarterly, 4 visits/yr): £35–£60/month average
- Food premises contract — restaurant / café (8 visits/yr, BRC-compliant): £75–£130/month average
- Food manufacturing / warehouse contract (monthly or fortnightly visits): £200–£400/month (scales heavily with site size and risk rating)
- Healthcare / pharmacy contract (quarterly, CQC-compliant): £70–£110/month
- Schools / nurseries contract (termly, child-safe IPM, DBS-checked): £50–£85/month
- Wasp / hornet nest removal: £65–£110/treatment
- Rat treatment — residential (programme with follow-ups, 90-day guarantee): £150–£240
- Mouse treatment — residential: £110–£170
- Bed bug chemical treatment (1-bedroom property, 2 visits): £275–£395
- Cockroach treatment — residential: £175–£275
- Flea treatment — residential (whole property): £125–£180
- Ant treatment — residential: £75–£125
- Commercial rodent clear-out (one-off programme, medium premises): £400–£600
- Commercial crawling / flying insect treatment: £325–£475
- Rodent proofing survey (written report with photos): £120–£180
- Rodent proofing works (hourly — sealing, mesh, door sweeps, drain caps): £55–£85/hour
- Bird proofing — netting or spikes, per sq m: £35–£60 (access / platform hire quoted separately)
- Electronic rodent monitoring (per unit per month): £10–£18/unit
- Electric fly killer (EFK) supply & install (standard 30W unit): £200–£320/unit
- Pest control technician (BPCA-qualified), hourly: £65–£90
- Senior / BPCA Advanced Technician, hourly: £85–£120
- Emergency / out-of-hours callout: £110–£160/hour (min 2-hour charge)
- Initial site survey (paid rate, often waived on contract sign within 30 days): £100–£175
- Mileage / travel charge (beyond standard service radius): £0.55–£0.80/mile

Pick one specific number near the middle of each range — never return null for unitPrice. The user reviews every estimated price before the quote goes to the client.

ADDITIVE BEHAVIOUR — MIXED EVIDENCE:
If the evidence is a MIX of an incumbent contract AND a separate request for new or additional work (e.g. quarterly contract invoice attached plus an email "we've also had a wasp nest discovered at the back of the building — can you deal with that too?" or "we're opening a second site in Manchester next month — please quote for that as well"), extract BOTH — the full existing contract line AND the additional requested work.

SMART CATEGORY SUBSTITUTION:
A pest control firm's catalog represents the equipment AND approach THEY have chosen in each commodity category. When incumbent-provider evidence names a specific monitoring system, bait product, or EFK brand, substitute in favour of the user's catalog item at the user's catalog price and note the substitution. For compliance-tier items, match the tier exactly — never substitute a lower compliance tier for a higher one.

CATEGORIES WHERE SUBSTITUTION IS CORRECT (brand-agnostic commodities):
- Electronic rodent monitoring systems: Anticimex SMART, Rentokil PestConnect, Bayer Digital Pest Management, Bell Labs iQ, Xcluder Connect, Pelsis Agrisense — all substitutable commodity remote-monitoring platforms. The user quotes their preferred system at their catalog rate.
- Tamper-resistant bait stations: Bell Labs (Protecta, Aegis), Rodent Control UK, Bait Box UK, PestWest, PelGar — commodity hardware when included under a contract.
- Electric fly killer (EFK) brands: Rentokil Luminos, Insect-O-Cutor, EnviroBug, P+L Systems (Genus), PestWest Chameleon, Brandenburg — commodity when the scope is "EFK supply + servicing".
- Monitoring station servicing (inspection, rebait, activity log keeping) as a unit-of-service: commodity across providers.
- Generic rodenticide, insecticide, or IPM bait materials where the active ingredient is equivalent and NOT sector-restricted (see below).
- Bird proofing hardware (nets, spike systems, wire): commodity brands across Jones Bird Control, Defender, Bird Free, Avishock — substitutable.

CATEGORIES WHERE SUBSTITUTION IS WRONG (compliance-, frequency-, or chemistry-driven — quote as evidenced):
- Sector compliance tier: if the incumbent contract is BRC, SALSA, or CIEH-audited (food sector), CQC-compliant (healthcare), or Ofsted-aligned (education), the user MUST match the compliance tier at the same documentation depth. Do NOT substitute a standard "Office / Retail" contract for a food-manufacturing contract. Doing so puts the client in breach at their next audit.
- Visit frequency: if the incumbent schedule is 8 visits/year (bi-monthly, food-sector standard) and the user's default tier is 4 visits/year (quarterly, office standard), quote 8 visits at an uplifted rate — OR flag to the client. Do not silently halve the visit count to fit a lower catalog tier.
- BPCA (British Pest Control Association) membership: if the incumbent is a BPCA member and the user is not, FLAG this in notes — some client contracts (notably food-sector audits and multi-site FM contracts) require a BPCA-member provider. Not a price decision, but a qualification decision.
- Chemical actives restricted by the client site: some food producers prohibit 2nd-generation anticoagulant rodenticides (SGARs: difenacoum, bromadiolone, brodifacoum) in or adjacent to food areas; some pharmaceutical / healthcare sites restrict all chemical use. If the incumbent's documentation restricts actives, the user's quote MUST respect the same restrictions and note it in the description.
- Integrated Pest Management (IPM) / monitoring-first approach: if the incumbent contract explicitly commits to IPM (minimal chemical, monitoring-led, non-toxic where possible), match the approach — don't substitute a bait-first programme.
- Child-safe and DBS-checked staff for schools, nurseries, and certain healthcare sites: match the staff vetting requirement. Note: "DBS-checked" vetting is NOT optional for education — it is a legal / safeguarding requirement.
- Specific bird species exclusion works: pigeon, gull (herring / lesser black-backed), starling, house sparrow, and feral-dove proofing have different legal protections and net-gauge specifications. Quote the same species scope — some species are legally protected and require a licence for interference.

HOW TO SUBSTITUTE:
1. Read the evidence item. Identify its commodity category AND its compliance tier AND its visit frequency AND any chemical restrictions.
2. Scan the user's catalog for an item that matches ALL of these attributes.
3. If a catalog match exists in a SUBSTITUTABLE category AND matches the compliance/frequency/chemistry constraints:
   - Use the catalog item's exact "name" as the materials "item" field.
   - Use the catalog item's defaultRate as unitPrice. Set estimated: false.
   - Copy quantity from the evidence (number of monitoring units, number of EFKs, number of bait stations, sq m of bird proofing).
   - Start the "description" with "Replaces existing [evidenced provider/product]" followed by "||" then the catalog description.
4. If the category is NON-SUBSTITUTABLE (compliance, frequency, BPCA qualification, chemical restriction, IPM commitment, species-specific works), match the incumbent's tier at the user's catalog price for that tier — or flag with estimated: true if the user has no matching tier yet.
5. If no catalog match exists, fall back to UK mid-market anchors above with estimated: true.
6. Silent substitution is a bug. Every substituted item MUST have "Replaces existing [original provider]" visible in the description so the user can review and revert in the QDS.

DO NOT INVENT SCOPE:
Preserve exact visit counts, exact monitoring station counts, exact EFK counts, exact bait station counts, exact proofing quantities. If the incumbent invoice shows "12 monitoring stations serviced quarterly", quote 12 stations quarterly — not 10 to round down, not 15 to be thorough. If bird proofing scope is 45 sq m of netting, quote 45 sq m. If the contract runs 8 visits/year, quote 8 — never 4 to fit a cheaper tier, never 12 to inflate. Audit trails depend on accurate counts.

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
- Each evidence block begins with an identifier in the form [INPUT_ID: N] where N is the numeric ID of that evidence record. These IDs must be echoed back on every materials row you emit (see the sourceInputIds field in the JSON schema and field guidelines below) — they are how the app links each quote line back to the evidence it came from.
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

${itInvoiceAddendum}${websiteMarketingAddendum}${commercialCleaningAddendum}${pestControlAddendum}Respond ONLY with valid JSON in this exact format:
{
  "clientName": string | null,
  "clientEmail": string | null,
  "clientPhone": string | null,
  "jobDescription": string,
  "labour": [{"role": string, "quantity": number, "duration": string}],
  "materials": [{"item": string, "quantity": number, "unitPrice": number, "unit": string, "description": string, "pricingType": "standard" | "monthly" | "optional" | "annual", "estimated": boolean, "sourceInputIds": number[]}],
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
- sourceInputIds: On every materials row, an array of the input IDs whose evidence contributed to that row. Read the [INPUT_ID: N] prefix at the start of each evidence block and include those numbers here as integers. If a row comes from one evidence block, it is a single-element array (e.g. [3]). If a row merges evidence from multiple inputs (for example one block stating the item and another confirming the quantity), include every contributing ID (e.g. [3, 7]). Never omit this field. Never leave it as an empty array — every materials row must trace back to at least one input.
- notes: Assumptions, site access requirements, items needing verification, phasing suggestions, anything the user should review.
- isTradeRelevant: false only if the content has nothing to do with ${tradeLabel} work.

BEFORE OUTPUTTING JSON — run this mental checklist:
1. Have I created a separate materials line item for EVERY distinct labour engagement mentioned (onsite, workshop, remote, discovery, training, commissioning etc.)?
2. Have I included ALL recurring/monthly items? Check the evidence again for any ongoing support, maintenance, monitoring, or subscription mentioned.
3. Have I included every piece of equipment, hardware, or product mentioned — even items without explicit prices?
4. Does every materials line item have a meaningful description drawn from the evidence?
5. Are pricingTypes correct — standard for one-off, monthly for recurring?
6. Does labour[] contain ONLY roles that are NOT already priced as materials line items? If a labour role appears in materials, remove it from labour[].
7. Does every materials row include a non-empty sourceInputIds array naming the [INPUT_ID: N] values of the evidence block(s) that justify the row?
Only output JSON once all seven checks pass.

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
