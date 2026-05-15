// server/services/slotContentBuilder.ts
//
// Phase 2 — builds the slot content map that templateRenderer injects
// into a v2.1 template's data-slot elements.
//
// Single source of truth for "what content goes where" — keyed against
// Manus's DATA-SLOTS.md. Pure transformation: takes a quote + line items
// + organisation, returns a SlotContent map. No DB access, no AI calls
// in v1; deterministic output from existing quote data.
//
// AI enhancement is a deliberate Phase 2.5 task — get the pipeline
// working end-to-end first with content built straight from the user's
// quote, validate visual output, then layer richer AI-generated
// narrative on top.

import type { SlotContent } from "./templateRenderer";

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

// ── Public API ──────────────────────────────────────────────────────

/**
 * Build the full slot content map for a quote. Anything not populated
 * here is left as the template's sample content — perfectly fine for
 * v1 where the template's defaults are professional placeholders.
 *
 * Slots with multiple matching elements in the HTML (e.g. the two
 * pricing-table elements in most templates — one-off + monthly) accept
 * an array of strings: index 0 fills the first matching element,
 * index 1 the second. Phase 2 extended the renderer to support this.
 */
export function buildSlotContent(args: {
  quote: QuoteForSlots;
  organization: OrganizationForSlots;
  lineItems: LineItemForSlots[];
}): SlotContent {
  const { quote, organization, lineItems } = args;
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

  return {
    // Global
    "quote-ref": esc(quote.reference ?? `Q-${quote.id}`),
    "date": esc(today),

    // Identity
    "company-name": esc(companyName),
    "client-name": esc(quote.clientName ?? ""),

    // Narrative blocks — pulled from quote fields the user has already
    // populated. AI enhancement is Phase 2.5.
    "about-text": buildAboutText(organization),
    "summary-text": buildSummaryText(quote, companyName),
    "methodology-title": "Our Approach",
    "methodology-text": buildMethodologyText(),
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

// ── Internals — content builders ────────────────────────────────────

function buildAboutText(org: OrganizationForSlots): string {
  const name = esc(org.companyName ?? org.name);
  return `<p>${name} is committed to delivering exceptional service and ` +
    `building lasting partnerships with our clients. Every engagement ` +
    `is treated as an opportunity to demonstrate the quality, ` +
    `expertise and care that defines our work.</p>`;
}

function buildSummaryText(quote: QuoteForSlots, companyName: string): string {
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

function buildMethodologyText(): string {
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
 * Turn loosely-formatted user text into safe HTML paragraphs. Splits on
 * blank lines, escapes HTML, wraps each chunk in <p>. Preserves single
 * line breaks within a paragraph as <br>.
 */
function formatProseToHtml(raw: string): string {
  const paragraphs = raw
    .split(/\n\s*\n/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length === 0) return "";
  return paragraphs.map((p) => `<p>${esc(p).replace(/\n/g, "<br>")}</p>`).join("");
}

/** Escape user-supplied text for safe inclusion in HTML content. */
function esc(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}
