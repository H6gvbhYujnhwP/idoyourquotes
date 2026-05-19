// server/services/slotContentBuilder.ts
//
// Phase 2.5 — builds the slot content map that templateRenderer injects
// into a v2.1 template's data-slot elements.
//
// Single source of truth for "what content goes where" — keyed against
// Manus's DATA-SLOTS.md. Takes a quote + line items + organisation +
// narrative context, returns a SlotContent map.
//
// HISTORY
//   Phase 2   — deterministic only. Narrative blocks were polished but
//               generic boilerplate built from quote fields. No AI.
//   Phase 2.5 — the three narrative blocks (about / summary /
//               methodology) are now AI-written, tailored to the
//               specific client, job and trade. Everything else
//               (pricing, terms, contact, dates) stays deterministic.
//
// CONTRACT WITH templateProposalRouter
//   The router already resolves the effective sector and runs the
//   canUseAIFeatures tier gate. It passes the result down as
//   `narrative: { aiEnabled, sectorLabel }`:
//     - aiEnabled  : router's verdict on whether to attempt AI at all.
//                    The gate lives in the router (single place); this
//                    module just honours the flag. When false we skip
//                    the LLM entirely and use deterministic prose.
//     - sectorLabel: humanised sector name (e.g. "Commercial Cleaning")
//                    used to frame the AI prompt. May be null.
//
// RELIABILITY CONTRACT
//   A proposal must NEVER fail to generate because the AI was slow,
//   unavailable, rate-limited, or returned malformed output. Every AI
//   path has a deterministic fallback that produces the exact same
//   professional boilerplate Phase 2 shipped. If the model is down the
//   user simply gets the Phase 2 experience instead of an error.
//
//   The AI returns PLAIN PROSE only — never HTML. Its output is run
//   through the same esc() + formatProseToHtml() path user-supplied
//   text already uses, so the renderer always receives safe markup and
//   the model can never inject tags into the template.

import type { SlotContent } from "./templateRenderer";
import { invokeLLM } from "../_core/llm";

// ── Types ───────────────────────────────────────────────────────────

/** Subset of the quotes row we read from. Loose typing because the
 *  full Drizzle row type imports transitive deps; this keeps the
 *  module portable and testable. */
export interface QuoteForSlots {
  id: number;
  reference?: string | null;
  title?: string | null;
  description?: string | null;
  terms?: string | null;
  clientName?: string | null;
  clientAddress?: string | null;
  subtotal?: string | null;
  taxRate?: string | null;
  taxAmount?: string | null;
  total?: string | null;
  monthlyTotal?: string | null;
}

/** Subset of organizations row used here. */
export interface OrganizationForSlots {
  name: string;
  companyName?: string | null;
  companyAddress?: string | null;
  companyPhone?: string | null;
  companyEmail?: string | null;
  companyWebsite?: string | null;
  defaultTerms?: string | null;
}

/** Subset of quote_line_items row. `rate` is the per-unit price;
 *  `pricingType` distinguishes one-off (default "standard") from
 *  monthly / annual recurring. */
export interface LineItemForSlots {
  id: number;
  description?: string | null;
  quantity?: string | number | null;
  unit?: string | null;
  rate?: string | number | null;
  total?: string | number | null;
  pricingType?: string | null; // "standard" | "monthly" | "annual" | etc.
}

/** Narrative context supplied by templateProposalRouter. The router
 *  owns the AI-access decision (canUseAIFeatures) and the sector
 *  resolution; this module just consumes the verdict. */
export interface NarrativeContextForSlots {
  /** Router's verdict — attempt AI narrative at all? When false the
   *  LLM is never called and deterministic prose is used. */
  aiEnabled: boolean;
  /** Humanised sector name for prompt framing, e.g.
   *  "Commercial Cleaning". May be null — prompt degrades gracefully. */
  sectorLabel?: string | null;
}

// ── Public API ──────────────────────────────────────────────────────

/**
 * Build the full slot content map for a quote. Anything not populated
 * here is left as the template's sample content.
 *
 * Phase 2.5: this is async. When narrative.aiEnabled is true the three
 * narrative slots are filled by a single AI call (one round-trip, JSON
 * object out). If aiEnabled is false, or the call fails for ANY reason,
 * the deterministic Phase 2 builders fill those slots instead — the
 * function always resolves with valid content.
 *
 * Slots with multiple matching elements in the HTML (e.g. the two
 * pricing-table elements in most templates — one-off + monthly) accept
 * an array of strings: index 0 fills the first matching element,
 * index 1 the second.
 */
export async function buildSlotContent(args: {
  quote: QuoteForSlots;
  organization: OrganizationForSlots;
  lineItems: LineItemForSlots[];
  narrative: NarrativeContextForSlots;
}): Promise<SlotContent> {
  const { quote, organization, lineItems, narrative } = args;
  const companyName = organization.companyName ?? organization.name;
  const today = formatDateUK(new Date());

  // Split line items by pricing type. "standard" = one-off, "monthly"
  // and "annual" are recurring. We surface one-off + monthly for v1;
  // annual rolls into the monthly table as a separate visual section
  // if it has any items (rare enough that a dedicated third table
  // isn't worth the complexity).
  const oneOffItems = lineItems.filter(
    (li) => (li.pricingType ?? "standard") === "standard",
  );
  const monthlyItems = lineItems.filter((li) => li.pricingType === "monthly");
  const annualItems = lineItems.filter((li) => li.pricingType === "annual");

  // Tax rate as a number (Drizzle returns decimals as strings).
  const taxRatePct = parseFloat(quote.taxRate ?? "20") || 20;

  // Two-table pricing structure — first slot one-off, second slot
  // recurring (monthly + any annuals). If only one bucket has items
  // we blank the other slot so stale sample content doesn't survive.
  const recurringItems = [...monthlyItems, ...annualItems];
  const pricingTables: string[] = [
    oneOffItems.length > 0
      ? buildPricingTableInner(oneOffItems, taxRatePct, "one_off")
      : '<tbody><tr><td colspan="4" style="text-align:center;padding:1rem;color:#9ca3af;">No one-off charges</td></tr></tbody>',
    recurringItems.length > 0
      ? buildPricingTableInner(recurringItems, taxRatePct, "recurring")
      : "",
  ];

  // Mirror the table headings (templates render a separate
  // pricing-title slot per table) so the two halves stay in sync.
  const pricingTitles: string[] = [
    "One-Off Investment",
    recurringItems.length > 0 ? "Recurring Services" : "",
  ];

  // ── Narrative blocks ──────────────────────────────────────────────
  // Single AI round-trip fills about / summary / methodology when the
  // router enabled it. On disabled-or-any-failure each falls back to
  // its deterministic Phase 2 builder.
  const narrativeBlocks = await buildNarrative({
    quote,
    organization,
    companyName,
    lineItems,
    narrative,
  });

  return {
    // Global
    "quote-ref": esc(quote.reference ?? `Q-${quote.id}`),
    "date": esc(today),

    // Identity
    "company-name": esc(companyName),
    "client-name": esc(quote.clientName ?? ""),

    // Narrative blocks — AI-written when enabled (Phase 2.5), with
    // deterministic Phase 2 fallback baked into buildNarrative.
    "about-text": narrativeBlocks.about,
    "summary-text": narrativeBlocks.summary,
    "methodology-title": "Our Approach",
    "methodology-text": narrativeBlocks.methodology,
    "terms-text": buildTermsText(quote, organization),

    // Pricing — array so the two table slots get one-off and recurring
    // respectively.
    "pricing-title": pricingTitles,
    "pricing-table": pricingTables,

    // Contact block from organisation settings. Falls back to empty
    // string (rather than a placeholder) when a field is unset, so
    // designs that show the contact block don't carry stale sample data.
    "account-manager": "",
    "phone": esc(organization.companyPhone ?? ""),
    "email": esc(organization.companyEmail ?? ""),
    "website": esc(organization.companyWebsite ?? ""),
    "address": esc(organization.companyAddress ?? ""),
  };
}

// ── Narrative — AI with deterministic fallback ──────────────────────

interface NarrativeBlocks {
  /** Safe HTML — already escaped + paragraph-wrapped. */
  about: string;
  summary: string;
  methodology: string;
}

/**
 * Produce the three narrative blocks as safe HTML.
 *
 * If narrative.aiEnabled is false the LLM is never touched — straight
 * to deterministic prose. Otherwise a single AI call returns plain
 * prose for all three; the prose is escaped and paragraph-wrapped here
 * (the model never emits HTML). ANY failure (no API key, network,
 * timeout, malformed JSON, empty fields) returns the deterministic
 * Phase 2 builders so the caller always gets valid content.
 */
async function buildNarrative(args: {
  quote: QuoteForSlots;
  organization: OrganizationForSlots;
  companyName: string;
  lineItems: LineItemForSlots[];
  narrative: NarrativeContextForSlots;
}): Promise<NarrativeBlocks> {
  const { quote, organization, companyName, lineItems, narrative } = args;

  // The deterministic blocks double as the guaranteed fallback.
  const fallback: NarrativeBlocks = {
    about: buildAboutTextDeterministic(organization),
    summary: buildSummaryTextDeterministic(quote, companyName),
    methodology: buildMethodologyTextDeterministic(),
  };

  // Router's gate said no (tier/trial/payment) — skip the LLM entirely.
  if (!narrative.aiEnabled) return fallback;

  try {
    const ai = await enhanceNarrativeWithAI({
      quote,
      companyName,
      lineItems,
      sectorLabel: narrative.sectorLabel ?? null,
    });
    if (!ai) return fallback;

    // Each block independently falls back if the model returned an
    // empty / whitespace-only string for it. Belt and braces — a
    // partial AI response still beats failing, and a missing field
    // never produces a blank section in the PDF.
    return {
      about: ai.about.trim().length > 0
        ? formatProseToHtml(ai.about)
        : fallback.about,
      summary: ai.summary.trim().length > 0
        ? formatProseToHtml(ai.summary)
        : fallback.summary,
      methodology: ai.methodology.trim().length > 0
        ? formatProseToHtml(ai.methodology)
        : fallback.methodology,
    };
  } catch (err) {
    console.warn(
      "[slotContentBuilder] AI narrative enhancement failed — " +
        "falling back to deterministic content:",
      err instanceof Error ? err.message : err,
    );
    return fallback;
  }
}

interface RawNarrative {
  about: string;
  summary: string;
  methodology: string;
}

/**
 * Single AI round-trip. Returns plain-prose narrative for all three
 * blocks as a JSON object, or null if the response can't be used.
 *
 * Uses the codebase-standard invokeLLM wrapper with
 * response_format: json_object — the same pattern used throughout
 * routers.ts. Temperature 0.4: deliberately above the global 0.1
 * default so two proposals don't read identically, but low enough to
 * stay on-topic and professional.
 */
async function enhanceNarrativeWithAI(args: {
  quote: QuoteForSlots;
  companyName: string;
  lineItems: LineItemForSlots[];
  sectorLabel: string | null;
}): Promise<RawNarrative | null> {
  const { quote, companyName, lineItems, sectorLabel } = args;

  const sector =
    (sectorLabel ?? "").trim().length > 0
      ? (sectorLabel as string).trim()
      : "professional services";

  const clientName = (quote.clientName ?? "").trim() || "the client";
  const jobTitle = (quote.title ?? "").trim() || "the proposed work";
  const jobDescription = (quote.description ?? "").trim();

  // Descriptions only — no prices. Prices live in the deterministic
  // pricing table; feeding them to the model risks it restating or
  // contradicting figures elsewhere in the document.
  const scopeLines = lineItems
    .map((li) => (li.description ?? "").trim())
    .filter((d) => d.length > 0)
    .slice(0, 25);
  const scopeBlock =
    scopeLines.length > 0
      ? scopeLines.map((d) => `- ${d}`).join("\n")
      : "(no itemised scope provided)";

  const systemPrompt =
    `You are a senior bid writer for a UK ${sector} company. ` +
    `You write proposal copy that wins work: specific, confident, and ` +
    `grounded in the actual job — never generic marketing filler.\n\n` +
    `Write three sections of British English prose for a client proposal.\n\n` +
    `RULES:\n` +
    `- Plain prose only. No markdown, no HTML, no bullet points, no headings.\n` +
    `- Separate paragraphs with a blank line.\n` +
    `- British spelling and conventions throughout.\n` +
    `- Refer to the supplying company as "${companyName}" and the client ` +
    `as "${clientName}" naturally — do not over-repeat either name.\n` +
    `- Be concrete about THIS job and THIS trade. No phrases like ` +
    `"in today's fast-paced world" or "we pride ourselves on".\n` +
    `- Do NOT mention prices, figures, totals or VAT — pricing is ` +
    `presented elsewhere in the document.\n` +
    `- "about": 1 short paragraph on the supplying company's relevant ` +
    `credibility for this kind of ${sector} work.\n` +
    `- "summary": 1–2 paragraphs framing what the client needs and the ` +
    `recommended approach at a high level.\n` +
    `- "methodology": 1–2 paragraphs describing, in concrete terms, how ` +
    `the work will be delivered for this specific engagement.\n\n` +
    `Respond with valid JSON only, exactly this shape:\n` +
    `{"about": "...", "summary": "...", "methodology": "..."}`;

  const userPrompt =
    `Supplying company: ${companyName}\n` +
    `Sector: ${sector}\n` +
    `Client: ${clientName}\n` +
    `Job title: ${jobTitle}\n` +
    `Job description: ${jobDescription || "(none supplied)"}\n\n` +
    `Scope (line-item descriptions, no prices):\n${scopeBlock}`;

  const response = await invokeLLM({
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    // Above the global 0.1 default — we WANT per-proposal variation
    // so competing proposals don't read identically. Still low enough
    // to stay professional and on-scope.
    temperature: 0.4,
    // Three short prose sections — a tight cap keeps cost ~$0.01–0.03
    // and latency low. The wrapper honours caller-supplied maxTokens.
    maxTokens: 900,
  });

  const content = response.choices[0]?.message?.content;
  const responseText = typeof content === "string" ? content : "";
  if (responseText.trim().length === 0) return null;

  let parsed: unknown;
  try {
    parsed = JSON.parse(responseText);
  } catch {
    // Some models occasionally wrap JSON in stray prose or fences
    // despite json_object mode. Salvage the first {...} block.
    const match = responseText.match(/\{[\s\S]*\}/);
    if (!match) return null;
    try {
      parsed = JSON.parse(match[0]);
    } catch {
      return null;
    }
  }

  if (typeof parsed !== "object" || parsed === null) return null;
  const obj = parsed as Record<string, unknown>;

  const about = typeof obj.about === "string" ? obj.about : "";
  const summary = typeof obj.summary === "string" ? obj.summary : "";
  const methodology =
    typeof obj.methodology === "string" ? obj.methodology : "";

  // If the model gave us nothing usable at all, signal failure so the
  // caller uses the full deterministic set rather than three blanks.
  if (
    about.trim().length === 0 &&
    summary.trim().length === 0 &&
    methodology.trim().length === 0
  ) {
    return null;
  }

  return { about, summary, methodology };
}

// ── Internals — deterministic content builders (Phase 2 + fallback) ──

function buildAboutTextDeterministic(org: OrganizationForSlots): string {
  const name = esc(org.companyName ?? org.name);
  return `<p>${name} is committed to delivering exceptional service and ` +
    `building lasting partnerships with our clients. Every engagement ` +
    `is treated as an opportunity to demonstrate the quality, ` +
    `expertise and care that defines our work.</p>`;
}

function buildSummaryTextDeterministic(
  quote: QuoteForSlots,
  companyName: string,
): string {
  const desc = (quote.description ?? "").trim();
  const clientName = esc(quote.clientName ?? "your organisation");
  const safeCompany = esc(companyName);

  if (desc.length === 0) {
    return `<p>This proposal sets out our recommended approach for ` +
      `${clientName}. The pages that follow detail our understanding of ` +
      `your requirements, our proposed delivery, the investment, and the ` +
      `terms under which we'll work together.</p>`;
  }

  return `<p>This proposal sets out our recommended approach for ` +
    `${clientName}, prepared by ${safeCompany}.</p>` +
    `<p>${formatProseToHtml(desc)}</p>`;
}

function buildMethodologyTextDeterministic(): string {
  return `<p>Our delivery follows a structured Discover, Design, Deploy ` +
    `and Operate framework, refined over many similar engagements.</p>` +
    `<p>We begin with a discovery phase to confirm scope and surface ` +
    `risks early. The design phase produces a written plan that you ` +
    `sign off before any change happens. Deployment is phased, with ` +
    `daily progress updates. Once live we move into a hypercare period ` +
    `followed by ongoing managed support — with regular service reviews ` +
    `keeping the engagement aligned to your evolving needs.</p>`;
}

function buildTermsText(quote: QuoteForSlots, org: OrganizationForSlots): string {
  // Cascade: per-quote terms → org default terms → built-in fallback.
  // Terms stay deterministic by design — they're legal text and the
  // codebase already has dedicated VAT-clause handling elsewhere; AI
  // does not touch this surface.
  const raw = (quote.terms ?? org.defaultTerms ?? "").trim();
  if (raw.length === 0) {
    return `<p>Standard terms and conditions apply. Please contact us ` +
      `if you'd like a full copy of our terms in advance of acceptance.</p>`;
  }
  return formatProseToHtml(raw);
}

// ── Internals — pricing ─────────────────────────────────────────────

function buildPricingTableInner(
  items: LineItemForSlots[],
  taxRatePct: number,
  mode: "one_off" | "recurring",
): string {
  const taxFactor = taxRatePct / 100;

  let subtotal = 0;
  const rowsHtml = items
    .map((li) => {
      const qty = Number(li.quantity ?? 1) || 1;
      const rate = Number(li.rate ?? 0) || 0;
      const lineTotal = Number(li.total ?? qty * rate) || 0;
      subtotal += lineTotal;
      const vat = lineTotal * taxFactor;
      const gross = lineTotal + vat;

      // For recurring items, suffix the description with the period
      // so the line reads correctly inside a mixed table.
      let desc = esc((li.description ?? "").trim() || "Line item");
      if (mode === "recurring" && li.pricingType) {
        const period = li.pricingType === "annual" ? "/year" : "/month";
        desc += ` <span style="color:#6b7280;font-size:0.85em;">(${period})</span>`;
      }

      return `<tr>` +
        `<td>${desc}</td>` +
        `<td>${formatGBP(lineTotal)}</td>` +
        `<td>${formatGBP(vat)}</td>` +
        `<td>${formatGBP(gross)}</td>` +
        `</tr>`;
    })
    .join("");

  const totalVat = subtotal * taxFactor;
  const totalGross = subtotal + totalVat;

  return `<thead><tr>` +
    `<th>Description</th><th>Net</th><th>VAT (${taxRatePct}%)</th><th>Gross</th>` +
    `</tr></thead>` +
    `<tbody>${rowsHtml}</tbody>` +
    `<tfoot>` +
    `<tr><td colspan="3">Subtotal (ex. VAT)</td><td>${formatGBP(subtotal)}</td></tr>` +
    `<tr><td colspan="3">VAT @ ${taxRatePct}%</td><td>${formatGBP(totalVat)}</td></tr>` +
    `<tr class="total-row"><td colspan="3"><strong>Total (inc. VAT)</strong></td>` +
    `<td><strong>${formatGBP(totalGross)}</strong></td></tr>` +
    `</tfoot>`;
}

// ── Internals — formatting helpers ──────────────────────────────────

const gbpFormatter = new Intl.NumberFormat("en-GB", {
  style: "currency",
  currency: "GBP",
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});

function formatGBP(n: number): string {
  if (!Number.isFinite(n)) return "£0.00";
  return gbpFormatter.format(n);
}

function formatDateUK(d: Date): string {
  const months = [
    "January", "February", "March", "April", "May", "June",
    "July", "August", "September", "October", "November", "December",
  ];
  return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
}

/**
 * Turn loosely-formatted text into safe HTML paragraphs. Splits on
 * blank lines, escapes HTML, wraps each chunk in <p>. Preserves single
 * line breaks within a paragraph as <br>. Used for both user-supplied
 * text and AI prose — neither is ever trusted as HTML.
 */
function formatProseToHtml(raw: string): string {
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Escape text for safe inclusion in HTML content. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
