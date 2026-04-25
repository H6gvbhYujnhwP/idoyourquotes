// Phase 4A — Delivery 7.
//
// Branded Contract/Tender proposal renderer.
//
// A SEPARATE, additive pipeline from server/pdfGenerator.ts. The locked
// quote PDF generator is untouched. This module produces a design-led,
// multi-page HTML proposal derived from the Manus IT-Modern template.
//
// v1 scope:
//   - IT sector only (dogfood-first; the brief's explicit decision).
//   - 4 pages: Cover → Executive Summary → Pricing → Terms + Signature.
//     Pages from the full Manus template that require data the quote
//     doesn't yet capture (stat strip, credentials strip, deep service
//     prose, SLA table) are omitted until those fields land post-4A.
//   - No AI calls during render — deterministic HTML only.
//   - Brand mode "branded": prefer AI-extracted brand tokens, fall back
//     to logo-pixel extraction, fall back to template defaults (navy /
//     violet). Never blocks — a fresh org with nothing set up still gets
//     a sensible render.
//   - Brand mode "template": force template defaults regardless of what
//     the org has.
//
// Called from the new server/routers.ts quotes.generateBrandedProposal
// endpoint. Returns an HTML string; the client opens it in a print
// window the same way the existing generatePDF path does.

import { Quote, QuoteLineItem, User, Organization } from "../drizzle/schema";
import { getPresignedUrl } from "./r2Storage";

// ── Data contract ────────────────────────────────────────────────────

export type BrandMode = "branded" | "template";

// Phase 4A Delivery 17 — design template choice. Distinct from BrandMode:
// BrandMode controls colour palette ("use the org's brand" vs "use the
// template's built-in palette"), DesignTemplate controls visual mood
// ("Modern restraint" vs "Structured operational" vs "Bold editorial").
// Modern is the only renderer shipped in Delivery 18; Structured / Bold
// fall through to the legacy renderer below until D19 / D20 land. The
// picker UIs (Settings + BrandChoiceModal) disable un-built options
// with a "Coming soon" badge so users can't pick something that won't
// render — but the dispatch is still safe if they somehow reach here.
export type DesignTemplate = "modern" | "structured" | "bold";

export interface BrandedProposalData {
  quote: Quote;
  lineItems: QuoteLineItem[];
  user: User;
  organization?: Organization | null;
  tenderContext?: {
    assumptions?: Array<{ text: string; confirmed: boolean }> | null;
    exclusions?: Array<{ text: string; confirmed: boolean }> | null;
    notes?: string | null;
    [key: string]: any;
  } | null;
  brandMode: BrandMode;
  /**
   * Phase 4A Delivery 17 — effective design template, resolved upstream
   * by the generateBrandedProposal mutation via the fallback chain
   * (per-call override → quote.proposalTemplate → org.proposalTemplate
   * → 'modern'). Optional for backward compatibility with any caller
   * that didn't get updated; treated as 'modern' when absent.
   */
  template?: DesignTemplate;
}

// ── Template default palette (IT-Modern) ─────────────────────────────
//
// The "template" brand mode uses these unconditionally. The "branded"
// mode uses these as the last-resort fallback when the org has no brand
// tokens at all.
//
// Phase 4A Delivery 17 — exported so modernTemplate.ts can reuse the
// same fallback values. Same constants, same palette, same fallback
// behaviour across all design templates.

export const TEMPLATE_DEFAULT_PRIMARY = "#1e1b4b";   // deep indigo — chrome
export const TEMPLATE_DEFAULT_SECONDARY = "#818cf8"; // violet — accent
export const TEMPLATE_DEFAULT_TINT = "#eef2ff";      // pale violet — callout bg
export const TEMPLATE_DEFAULT_TINT_ALT = "#f5f3ff";  // pale violet — table zebra

export interface ResolvedBrand {
  primary: string;
  secondary: string;
  tint: string;      // lightest bg tint derived from primary
  tintAlt: string;   // alternate light tint for table zebra
  onPrimaryText: string; // text colour that sits on top of primary bg
  usingTemplate: boolean; // true when we fell all the way through
}

// ── Utilities ────────────────────────────────────────────────────────

export function escapeHtml(text: string | null | undefined): string {
  if (text == null) return "";
  return String(text)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(String(value || "0"));
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(Number.isFinite(num) ? num : 0);
}

export function formatQuantity(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(String(value || "1"));
  if (!Number.isFinite(num)) return "1";
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
}

export function formatDate(d: Date | string | null | undefined): string {
  if (!d) return "";
  try {
    return new Date(d).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  } catch {
    return "";
  }
}

/** Plain-text conversion for fields stored with our list-separator syntax. */
export function plainLineItemText(text: string | null | undefined): string {
  if (!text) return "";
  // Collapse both bullet (`||`) and numbered (`##`) separators into commas —
  // the branded table cells don't need inline list markup.
  return String(text)
    .split(/\s*(?:\|\||##)\s*/)
    .filter(Boolean)
    .join(". ");
}

/** Validate a hex colour (#rgb or #rrggbb) and return it or undefined. */
export function validHex(v: unknown): string | undefined {
  if (typeof v !== "string") return undefined;
  const s = v.trim();
  if (/^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(s)) return s;
  return undefined;
}

/**
 * Hex-to-rgb then back to a darker variant. Used to cheaply derive a
 * "chrome" colour that sits well against text on primary backgrounds.
 * Returns the input if parsing fails (safe fallback).
 */
export function lighten(hex: string, amount: number): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return hex;
  const mix = (c: number) => Math.round(c + (255 - c) * amount);
  const toHex = (n: number) => n.toString(16).padStart(2, "0");
  return `#${toHex(mix(r))}${toHex(mix(g))}${toHex(mix(b))}`;
}

/** Rough luminance check — returns true if colour is dark enough that
 * white text should go on top. Used for the primary/accent bars. */
export function isDark(hex: string): boolean {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16) || 0;
  const g = parseInt(full.slice(2, 4), 16) || 0;
  const b = parseInt(full.slice(4, 6), 16) || 0;
  // Perceived luminance, Rec. 709-ish.
  const lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
  return lum < 0.55;
}

/**
 * Phase 4A Delivery 12 — return a hex colour as a comma-separated RGB
 * triple suitable for use inside `rgba(...)` via a CSS variable. Lets
 * us define a single `--brand-primary-rgb: 0, 0, 99` and then use
 * `rgba(var(--brand-primary-rgb), 0.78)` for translucent overlays
 * without hardcoding the colour at the call site.
 */
export function hexToRgbTriple(hex: string): string {
  const h = hex.replace("#", "");
  const full = h.length === 3 ? h.split("").map((c) => c + c).join("") : h;
  const r = parseInt(full.slice(0, 2), 16);
  const g = parseInt(full.slice(2, 4), 16);
  const b = parseInt(full.slice(4, 6), 16);
  if ([r, g, b].some((n) => Number.isNaN(n))) return "0, 0, 0";
  return `${r}, ${g}, ${b}`;
}

// ── Brand resolution ─────────────────────────────────────────────────

/**
 * Resolve the brand palette with the layered fallback chain:
 *   brandExtracted* → brandPrimary/Secondary (logo pixels) → template.
 *
 * In "template" mode, returns template defaults unconditionally.
 */
export function resolveBrand(
  organization: Organization | null | undefined,
  mode: BrandMode,
): ResolvedBrand {
  if (mode === "template") {
    return {
      primary: TEMPLATE_DEFAULT_PRIMARY,
      secondary: TEMPLATE_DEFAULT_SECONDARY,
      tint: TEMPLATE_DEFAULT_TINT,
      tintAlt: TEMPLATE_DEFAULT_TINT_ALT,
      onPrimaryText: "#ffffff",
      usingTemplate: true,
    };
  }

  const org = (organization ?? {}) as any;

  const extractedPrimary = validHex(org.brandExtractedPrimaryColor);
  const extractedSecondary = validHex(org.brandExtractedSecondaryColor);
  const logoPrimary = validHex(org.brandPrimaryColor);
  const logoSecondary = validHex(org.brandSecondaryColor);

  const primary =
    extractedPrimary || logoPrimary || TEMPLATE_DEFAULT_PRIMARY;
  const secondary =
    extractedSecondary || logoSecondary || TEMPLATE_DEFAULT_SECONDARY;

  const usingTemplate =
    primary === TEMPLATE_DEFAULT_PRIMARY &&
    secondary === TEMPLATE_DEFAULT_SECONDARY;

  // Derive light tints from the secondary so the callout and zebra
  // rows feel cohesive with the brand — even when the user supplies
  // an unusual palette.
  const tint = lighten(secondary, 0.88);
  const tintAlt = lighten(secondary, 0.93);

  return {
    primary,
    secondary,
    tint,
    tintAlt,
    onPrimaryText: isDark(primary) ? "#ffffff" : "#111827",
    usingTemplate,
  };
}

// ── Print-asset URL resolution ───────────────────────────────────────
//
// Mirrors the pattern used by the locked pdfGenerator — if a stored
// URL is a /api/file/ proxy URL it won't load in the print dialog
// (no cookies), so we swap it for a 1-hour signed URL here. On failure
// we fall through to null — the caller decides what to do (e.g. fall
// back to the wordmark for logos). We never block the render.

export async function resolveLogoUrl(raw: string | null | undefined): Promise<string | null> {
  if (!raw) return null;
  if (!raw.startsWith("/api/file/")) return raw;
  const key = raw.slice("/api/file/".length);
  try {
    return await getPresignedUrl(key, 3600);
  } catch (err) {
    console.warn("[brandedProposalRenderer] failed to sign asset URL, falling back:", err);
    return null;
  }
}

// ── Page: Cover ──────────────────────────────────────────────────────

function renderCover(args: {
  brand: ResolvedBrand;
  companyName: string;
  logoUrl: string | null;
  websiteUrl: string | null;
  companyAddress: string | null;
  companyPhone: string | null;
  companyEmail: string | null;
  reference: string;
  dateStr: string;
  clientName: string;
  contactName: string | null;
  title: string;
}): string {
  const {
    brand,
    companyName,
    logoUrl,
    websiteUrl,
    companyAddress,
    companyPhone,
    companyEmail,
    reference,
    dateStr,
    clientName,
    contactName,
    title,
  } = args;

  // Wordmark fallback — uppercase, letter-spaced, truncated to keep the
  // logo-box proportions sensible even on long names.
  const wordmarkText = companyName.length > 16
    ? companyName.slice(0, 16).toUpperCase()
    : companyName.toUpperCase();

  const logoContent = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo" style="max-width:160px;max-height:48px;object-fit:contain;">`
    : `<span>${escapeHtml(wordmarkText)}</span>`;

  const contactValue = [companyPhone, companyEmail].filter(Boolean).map(escapeHtml).join("<br>");
  const websiteDisplay = websiteUrl
    ? escapeHtml(websiteUrl.replace(/^https?:\/\//, ""))
    : "";

  const preparedForLine = contactName
    ? `${escapeHtml(contactName)} &nbsp;·&nbsp; ${escapeHtml(clientName)}`
    : escapeHtml(clientName);

  // Phase 4A Delivery 9 — build the contact strip from only the cells
  // that have actual data. Previously every cell rendered with an "—"
  // placeholder, which looked unfinished for orgs with sparse profiles
  // (e.g. only an email set, no address / phone / website). Now: each
  // cell is conditional, and the wrapping strip is omitted entirely if
  // the org has no contact data at all — the cover-hero's flex:1 fills
  // the remaining space cleanly without a half-empty bottom band.
  const contactCells: string[] = [];
  if (companyAddress && companyAddress.trim()) {
    contactCells.push(`<div><div class="contact-label">Address</div><div class="contact-value">${escapeHtml(companyAddress)}</div></div>`);
  }
  if (contactValue) {
    contactCells.push(`<div><div class="contact-label">Phone &amp; Email</div><div class="contact-value">${contactValue}</div></div>`);
  }
  if (websiteDisplay) {
    contactCells.push(`<div><div class="contact-label">Website</div><div class="contact-value">${websiteDisplay}</div></div>`);
  }
  const contactStripHtml = contactCells.length > 0
    ? `\n  <div class="cover-contact-strip">${contactCells.join("")}</div>`
    : "";

  // Phase 4A Delivery 21 — AI cover image pipeline (D12–D16) was
  // abandoned and the supporting columns dropped. The legacy cover
  // now always renders flat — brand-primary background, accent-bar,
  // typography. All three live design templates (Modern / Structured
  // / Bold) handle their own covers; this legacy path is only ever
  // reached as a defensive backstop.

  return `
<div class="cover">
  <div class="cover-nav">
    <div class="logo-box">${logoContent}</div>
    <div class="cover-ref-block">Ref: ${escapeHtml(reference)}<br>Date: ${escapeHtml(dateStr)}<br>Prepared for: ${escapeHtml(clientName)}<br>Confidential</div>
  </div>
  <div class="cover-hero">
    <div class="accent-bar"></div>
    <h1>${escapeHtml(title)}</h1>
    <p class="cover-tagline">A formal proposal from ${escapeHtml(companyName)} — scope of work, pricing, terms, and acceptance in a single document.</p>
    <div class="cover-prepared-for">Prepared for</div>
    <div class="cover-client-name">${preparedForLine}</div>
  </div>${contactStripHtml}
</div>`;
}

// ── Page: Executive Summary ──────────────────────────────────────────

function renderExecSummary(args: {
  companyName: string;
  clientName: string;
  title: string;
  description: string | null;
  notes: string | null;
  pageFooter: string;
}): string {
  const { companyName, clientName, title, description, notes, pageFooter } = args;

  // Prefer tenderContext.notes (the richer scope text) for the callout,
  // fall back to the quote's own description. If neither is present we
  // synthesise a one-liner from the quote title so the page isn't empty.
  const calloutText = (notes && notes.trim())
    || (description && description.trim())
    || `This proposal sets out the scope, pricing, and terms for ${title} on behalf of ${clientName}.`;

  return `
<div class="page">
  <div class="eyebrow">01 — Executive Summary</div>
  <h2>${escapeHtml(title)}</h2>
  <div class="callout"><p>${escapeHtml(calloutText)}</p></div>
  <p>${escapeHtml(companyName)} is pleased to submit this proposal to ${escapeHtml(clientName)}. The following pages set out the commercial detail: line-by-line pricing in Section 02, contract terms in Section 03, and a signature block for acceptance.</p>
  <p>The pricing in this document is valid for the period stated on the cover and is inclusive of all deliverables described. Exclusions and assumptions are listed in Section 03 — please review these alongside the pricing.</p>
  ${pageFooter}
</div>`;
}

// ── Page: Pricing ────────────────────────────────────────────────────

export function sumDecimal(values: Array<string | number | null | undefined>): number {
  return values.reduce<number>((acc, v) => {
    const n = typeof v === "number" ? v : parseFloat(String(v || "0"));
    return acc + (Number.isFinite(n) ? n : 0);
  }, 0);
}

function renderPricing(args: {
  quote: Quote;
  lineItems: QuoteLineItem[];
  pageFooter: string;
}): string {
  const { quote, lineItems, pageFooter } = args;

  // Partition by pricing type so one-off and recurring appear in separate
  // tables. Mirrors the logic in the locked generator without importing it.
  const oneOff = lineItems.filter((li) => {
    const pt = (li as any).pricingType || "one_off";
    return pt !== "monthly" && pt !== "annual";
  });
  const monthly = lineItems.filter((li) => (li as any).pricingType === "monthly");
  const annual = lineItems.filter((li) => (li as any).pricingType === "annual");

  const renderRow = (li: QuoteLineItem) => {
    const desc = plainLineItemText(li.description as any) || "—";
    const qty = formatQuantity(li.quantity as any);
    const unit = escapeHtml((li as any).unit || "");
    const rate = formatCurrency((li as any).rate);
    const total = formatCurrency((li as any).total);
    const optionalBadge = (li as any).isOptional
      ? ` <span class="opt-badge">OPTIONAL</span>`
      : "";
    return `<tr>
      <td><strong>${escapeHtml(desc)}</strong>${optionalBadge}</td>
      <td>${qty}${unit ? ` ${unit}` : ""}</td>
      <td>${rate}</td>
      <td>${total}</td>
    </tr>`;
  };

  const renderTable = (label: string, rows: QuoteLineItem[], totalLabel: string, total: number) => {
    if (rows.length === 0) return "";
    const body = rows.map(renderRow).join("");
    return `
    <h3>${escapeHtml(label)}</h3>
    <table>
      <thead><tr><th>Service / Item</th><th>Qty</th><th>Rate</th><th>Amount</th></tr></thead>
      <tbody>${body}</tbody>
      <tfoot>
        <tr class="subtotal-row"><td colspan="3"><strong>${escapeHtml(totalLabel)}</strong></td><td><strong>${formatCurrency(total)}</strong></td></tr>
      </tfoot>
    </table>`;
  };

  // Totals. We prefer the stored aggregates on the quote where they exist
  // (they've been computed by the existing quote engine) and fall back to
  // summing the line items directly when they don't.
  const nonOptionalOneOff = oneOff.filter((li) => !(li as any).isOptional);
  const oneOffSubtotal = sumDecimal(nonOptionalOneOff.map((li) => (li as any).total));
  const monthlySubtotal = parseFloat(String((quote as any).monthlyTotal || "0"))
    || sumDecimal(monthly.map((li) => (li as any).total));
  const annualSubtotal = parseFloat(String((quote as any).annualTotal || "0"))
    || sumDecimal(annual.map((li) => (li as any).total));

  const taxRate = parseFloat(String((quote as any).taxRate || "0"));
  const storedTaxAmount = parseFloat(String((quote as any).taxAmount || "0"));
  const oneOffTax = storedTaxAmount > 0 ? storedTaxAmount : oneOffSubtotal * (taxRate / 100);
  const oneOffTotalIncVat = oneOffSubtotal + oneOffTax;

  const oneOffTable = renderTable("One-off / project fees", oneOff, "One-off subtotal (excl. VAT)", oneOffSubtotal);
  const monthlyTable = renderTable("Recurring — monthly", monthly, "Monthly subtotal (excl. VAT)", monthlySubtotal);
  const annualTable = renderTable("Recurring — annual", annual, "Annual subtotal (excl. VAT)", annualSubtotal);

  // Only show the grand-total block if there's anything to total. If
  // nothing's priced, we still render the page with an empty tables
  // notice so the client can see the pricing was intentionally blank.
  const hasAny = oneOff.length + monthly.length + annual.length > 0;
  const emptyNotice = hasAny
    ? ""
    : `<p style="color:#6b7280;font-style:italic;">No priced line items on this quote yet.</p>`;

  const grandTotals = hasAny
    ? `
    <table class="totals-table">
      <tbody>
        ${oneOffSubtotal > 0 && taxRate > 0 ? `<tr class="vat-row"><td colspan="3">VAT @ ${taxRate}% on one-off fees</td><td>${formatCurrency(oneOffTax)}</td></tr>` : ""}
        ${oneOffSubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>One-off total (inc. VAT)</strong></td><td><strong>${formatCurrency(oneOffTotalIncVat)}</strong></td></tr>` : ""}
        ${monthlySubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>Monthly recurring (excl. VAT)</strong></td><td><strong>${formatCurrency(monthlySubtotal)}</strong></td></tr>` : ""}
        ${annualSubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>Annual recurring (excl. VAT)</strong></td><td><strong>${formatCurrency(annualSubtotal)}</strong></td></tr>` : ""}
      </tbody>
    </table>`
    : "";

  return `
<div class="page">
  <div class="eyebrow">02 — Pricing</div>
  <h2>Investment summary</h2>
  ${emptyNotice}
  ${oneOffTable}
  ${monthlyTable}
  ${annualTable}
  ${grandTotals}
  ${pageFooter}
</div>`;
}

// ── Page: Terms + Exclusions + Assumptions + Signature ───────────────

function renderTerms(args: {
  quote: Quote;
  organization: Organization | null | undefined;
  tenderContext: BrandedProposalData["tenderContext"];
  companyName: string;
  clientName: string;
  pageFooter: string;
}): string {
  const { quote, organization, tenderContext, companyName, clientName, pageFooter } = args;

  const terms = (quote as any).terms
    || (organization as any)?.defaultTerms
    || "Standard UK commercial terms apply. Full terms are available on request.";

  const paymentTerms = (organization as any)?.defaultPaymentTerms
    || "Monthly invoicing, payable within 30 days of invoice date.";

  const validUntilRaw = (quote as any).validUntil;
  const validityLine = validUntilRaw
    ? `This proposal is valid until ${formatDate(validUntilRaw)}.`
    : (organization as any)?.defaultValidityDays
      ? `This proposal is valid for ${(organization as any).defaultValidityDays} days from the cover date.`
      : "This proposal is valid for 30 days from the cover date.";

  const assumptions = (tenderContext?.assumptions || []).filter((a) => a && a.text && a.text.trim());
  const exclusions = (tenderContext?.exclusions || []).filter((e) => e && e.text && e.text.trim());

  // Fall back to the org-level default exclusions when the quote-specific
  // tender context hasn't collected any.
  const orgDefaultExclusions = (organization as any)?.defaultExclusions as string | null | undefined;

  const assumptionsHtml = assumptions.length > 0
    ? `<ul class="term-list">${assumptions.map((a) => `<li>${escapeHtml(a.text)}</li>`).join("")}</ul>`
    : `<p class="term-muted">None explicitly recorded — this proposal is priced against the scope as described in the Executive Summary and line items.</p>`;

  let exclusionsHtml: string;
  if (exclusions.length > 0) {
    exclusionsHtml = `<ul class="term-list">${exclusions.map((e) => `<li>${escapeHtml(e.text)}</li>`).join("")}</ul>`;
  } else if (orgDefaultExclusions && orgDefaultExclusions.trim()) {
    // Split the org default exclusions text on newlines / semicolons /
    // bullets so it renders as a list even when stored as a blob.
    const parts = orgDefaultExclusions
      .split(/[\n;•·]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    exclusionsHtml = parts.length > 1
      ? `<ul class="term-list">${parts.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(orgDefaultExclusions)}</p>`;
  } else {
    exclusionsHtml = `<p class="term-muted">None explicitly recorded.</p>`;
  }

  const signatoryName = (organization as any)?.defaultSignatoryName || "";
  const signatoryPosition = (organization as any)?.defaultSignatoryPosition || "";
  const supplierSigLabel = signatoryName && signatoryPosition
    ? `${escapeHtml(signatoryName)}, ${escapeHtml(signatoryPosition)}`
    : signatoryName
      ? escapeHtml(signatoryName)
      : "";

  return `
<div class="page">
  <div class="eyebrow">03 — Terms &amp; Conditions</div>
  <h2>Commercial terms</h2>
  <p><strong>Validity:</strong> ${escapeHtml(validityLine)}</p>
  <p><strong>Payment:</strong> ${escapeHtml(paymentTerms)}</p>
  <p><strong>Scope:</strong> The work covered is as described in the Executive Summary and itemised in the Pricing section. Work outside that scope will be quoted separately and is not included in the pricing above.</p>
  <h3>Assumptions</h3>
  ${assumptionsHtml}
  <h3>Exclusions</h3>
  ${exclusionsHtml}
  ${terms && terms.trim() ? `<h3>Additional terms</h3><p>${escapeHtml(terms)}</p>` : ""}

  <div class="eyebrow" style="margin-top:24px;">04 — Acceptance</div>
  <h2>Sign &amp; proceed</h2>
  <p>By signing below, both parties agree to be bound by the terms set out in this proposal. Once countersigned, this document constitutes a binding agreement.</p>
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-label">For ${escapeHtml(companyName)}</div>
      <div class="sig-line"></div><div class="sig-field">Signature${supplierSigLabel ? ` — ${supplierSigLabel}` : ""}</div>
      <div class="sig-line"></div><div class="sig-field">Full Name &amp; Title</div>
      <div class="sig-line"></div><div class="sig-field">Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">For ${escapeHtml(clientName)}</div>
      <div class="sig-line"></div><div class="sig-field">Signature</div>
      <div class="sig-line"></div><div class="sig-field">Full Name &amp; Title</div>
      <div class="sig-line"></div><div class="sig-field">Date</div>
    </div>
  </div>
  ${pageFooter}
</div>`;
}

// ── CSS ──────────────────────────────────────────────────────────────
//
// Palette values are interpolated once and then referenced throughout
// via CSS custom properties so the generated HTML stays small and the
// theming stays consistent across pages.

function renderCss(brand: ResolvedBrand): string {
  const headingTextColor = "#111827";
  const bodyTextColor = "#374151";
  const mutedTextColor = "#6b7280";
  const hairlineColor = "#e5e7eb";

  // Phase 4A Delivery 21 — page-band uses a flat brand-primary →
  // brand-secondary gradient. The previous variant pulled a horizontal
  // slice of the AI-generated cover image into the band; with the
  // cover-image pipeline retired the gradient is the sole rendering.

  return `
  :root {
    --brand-primary: ${brand.primary};
    --brand-primary-rgb: ${hexToRgbTriple(brand.primary)};
    --brand-secondary: ${brand.secondary};
    --brand-tint: ${brand.tint};
    --brand-tint-alt: ${brand.tintAlt};
    --brand-on-primary: ${brand.onPrimaryText};
    --page-band-image: linear-gradient(90deg, var(--brand-primary), var(--brand-secondary));
    --page-band-size: 100% 100%;
    --page-band-position: center;
  }
  @page { size: A4; margin: 0; }
  /* Phase 4A Delivery 10 — Chrome strips background colours from print
     output by default ("save toner" mode). That made the PDF look
     completely different from the preview tab — the dark cover
     collapsed to white, all the brand colour panels disappeared.
     -webkit-print-color-adjust:exact + print-color-adjust:exact tells
     Chrome (and any other Blink-based engine) to render backgrounds
     in PDF exactly as they appear on screen. Set on the universal
     selector so every element honours it regardless of where it sits
     in the DOM. Applies to all renderer outputs (Contract/Tender
     today, Project/Migration when it lands). */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.7; color: ${bodyTextColor}; background: #fff; max-width: 210mm; margin: 0 auto; }

  .cover { min-height: 100vh; background: var(--brand-primary); display: flex; flex-direction: column; page-break-after: always; color: var(--brand-on-primary); }
  .cover-nav { padding: 14mm 16mm 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  /* Phase 4A Delivery 9 — white panel behind logo so any logo (light,
     dark, or multi-colour) renders against a known contrast surface.
     Wordmark fallback text flips to dark slate so it stays legible on
     the white panel. Subtle radius keeps the panel feeling like a
     polished badge rather than a raw rectangle. */
  .logo-box { min-width: 140px; min-height: 48px; max-width: 200px; background: #ffffff; border: 1px solid rgba(0,0,0,0.08); border-radius: 6px; padding: 8px 14px; display: flex; align-items: center; justify-content: center; font-size: 9.5pt; letter-spacing: 0.2em; color: #1f2937; text-transform: uppercase; font-weight: 700; }
  .cover-ref-block { text-align: right; font-size: 7.5pt; color: rgba(255,255,255,0.55); line-height: 1.9; letter-spacing: 0.06em; }
  .cover-hero { flex: 1; padding: 12mm 16mm; display: flex; flex-direction: column; justify-content: center; }
  /* Phase 4A Delivery 15 — subtle left-side dark gradient applied
     only when the cover has a background image. Acts as a contrast
     safety-net for the title/tagline text in case Gemini does not
     keep the lower-left zone perfectly quiet. Fades to transparent
     by 60% of the width so the geometric design dominates the
     right side of the cover. */
  .cover-hero.has-bg { background: linear-gradient(to right, rgba(0,0,0,0.18) 0%, rgba(0,0,0,0.10) 30%, rgba(0,0,0,0) 60%); }
  .accent-bar { width: 48px; height: 4px; background: var(--brand-secondary); margin-bottom: 20px; }
  .cover h1 { font-size: 32pt; font-weight: 800; color: #fff; line-height: 1.08; letter-spacing: -0.025em; max-width: 500px; margin-bottom: 16px; }
  .cover-tagline { font-size: 11.5pt; color: rgba(255,255,255,0.7); font-weight: 300; max-width: 440px; line-height: 1.6; margin-bottom: 28px; }
  .cover-prepared-for { font-size: 8.5pt; color: rgba(255,255,255,0.5); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
  /* Phase 4A Delivery 9 — was var(--brand-secondary), but on covers
     where primary and secondary brand colours are both dark (e.g. navy
     primary + medium-blue secondary) the contrast against the cover
     bg failed. Switched to var(--brand-on-primary) so the prepared-for
     line stays legible regardless of the org's brand palette. The
     accent-bar above the title still carries brand-secondary so colour
     identity is preserved on the cover. */
  .cover-client-name { font-size: 13pt; font-weight: 700; color: var(--brand-on-primary); }
  /* Phase 4A Delivery 9 — auto-fit columns so the strip lays out
     cleanly when the org has only 1 or 2 contact fields populated.
     With 3 fields it behaves identically to the previous repeat(3, 1fr). */
  .cover-contact-strip { background: rgba(255,255,255,0.06); border-top: 1px solid rgba(255,255,255,0.12); padding: 10mm 16mm; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
  .contact-label { font-size: 7pt; color: rgba(255,255,255,0.45); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
  .contact-value { font-size: 9pt; color: rgba(255,255,255,0.9); word-wrap: break-word; }

  /* Phase 4A Delivery 15 — every section page gets a 6mm decorative
     top band. When --page-band-image is a url(...) (Gemini graphic
     present) it shows a horizontal slice of the cover graphic,
     anchoring brand cohesion across the document. When it falls
     back to a linear-gradient, every page still gets a thin coloured
     top stripe — design rhythm survives without AI generation. The
     band is positioned absolutely so the existing 14mm top padding
     of .page is unchanged; section content layout is unaffected. */
  .page { padding: 14mm 16mm; page-break-before: always; color: ${bodyTextColor}; position: relative; }
  .page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 6mm;
    background-image: var(--page-band-image);
    background-size: var(--page-band-size);
    background-position: var(--page-band-position);
    background-repeat: no-repeat;
  }
  .eyebrow { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--brand-secondary); margin-bottom: 6px; }
  h2 { font-size: 22pt; font-weight: 800; color: var(--brand-primary); letter-spacing: -0.025em; line-height: 1.15; margin-bottom: 18px; }
  h3 { font-size: 11pt; font-weight: 700; color: var(--brand-primary); margin: 20px 0 7px; }
  p { margin-bottom: 12px; color: ${bodyTextColor}; }

  .callout { background: var(--brand-tint); border-left: 4px solid var(--brand-secondary); padding: 13px 17px; margin: 14px 0; border-radius: 0 6px 6px 0; }
  .callout p { margin: 0; color: ${headingTextColor}; font-weight: 500; }

  table { width: 100%; border-collapse: collapse; margin: 14px 0; page-break-inside: avoid; font-size: 9pt; }
  thead tr { background: var(--brand-primary); }
  thead th { padding: 9px 13px; text-align: left; color: var(--brand-on-primary); font-weight: 600; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; }
  tbody tr:nth-child(even) { background: var(--brand-tint-alt); }
  tbody td { padding: 8px 13px; border-bottom: 1px solid ${hairlineColor}; color: ${bodyTextColor}; vertical-align: top; }
  tfoot td { padding: 9px 13px; font-weight: 700; border-top: 2px solid var(--brand-primary); }
  .subtotal-row td { background: var(--brand-tint); color: var(--brand-primary); }
  .totals-table { margin-top: 8px; }
  .totals-table tbody td { border-bottom: 1px solid ${hairlineColor}; }
  .total-row td { background: var(--brand-secondary); color: var(--brand-on-primary); font-weight: 700; }
  .total-row td strong { color: var(--brand-on-primary); }
  .vat-row td { background: var(--brand-tint); color: var(--brand-primary); font-style: italic; }
  .opt-badge { display: inline-block; background: ${mutedTextColor}; color: #fff; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 2px; margin-left: 6px; vertical-align: middle; }

  .term-list { margin: 8px 0 14px; padding-left: 20px; color: ${bodyTextColor}; }
  .term-list li { margin-bottom: 5px; line-height: 1.6; }
  .term-muted { color: ${mutedTextColor}; font-style: italic; margin-bottom: 14px; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; }
  .sig-block { border-top: 3px solid var(--brand-secondary); padding-top: 12px; }
  .sig-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-secondary); margin-bottom: 8px; }
  .sig-line { border-bottom: 1px solid #d1d5db; height: 36px; margin: 8px 0; }
  .sig-field { font-size: 8pt; color: ${mutedTextColor}; }
  .page-footer { margin-top: 26px; padding-top: 9px; border-top: 1px solid ${hairlineColor}; font-size: 7.5pt; color: ${mutedTextColor}; display: flex; justify-content: space-between; gap: 10px; }
  .page-footer span { flex: 1; }
  .page-footer span:nth-child(2) { text-align: center; }
  .page-footer span:nth-child(3) { text-align: right; }

  @media print {
    .cover { min-height: 297mm; }
    .page { page-break-before: always; }
    table { page-break-inside: avoid; }
  }`;
}

// ── Main entry point ─────────────────────────────────────────────────

import { renderModernTemplate } from "./templates/modernTemplate";
import { renderStructuredTemplate } from "./templates/structuredTemplate";
import { renderBoldTemplate } from "./templates/boldTemplate";

export async function generateBrandedProposalHTML(
  data: BrandedProposalData,
): Promise<string> {
  // Phase 4A Delivery 17/18/19/20 — design template dispatcher.
  //
  // All three design templates now have built renderers: Modern (D18,
  // typography-led with stat strip), Structured (D19, operational with
  // scope-box on cover), and Bold (D20, brutalist editorial with
  // accent-band stat strip). The legacy fall-through below is now
  // dead code in normal operation but is kept in place as a defensive
  // backstop — if a future template key is somehow added to the picker
  // without a matching renderer, the fall-through still produces a
  // valid proposal rather than a hard failure.
  //
  // Backward-compat: when `template` is absent on `data` we treat it
  // as 'modern' so any caller that wasn't updated still gets a proper
  // renderer.
  const template = data.template ?? "modern";
  if (template === "modern") {
    return renderModernTemplate(data);
  }
  if (template === "structured") {
    return renderStructuredTemplate(data);
  }
  if (template === "bold") {
    return renderBoldTemplate(data);
  }

  // ── Legacy renderer (defensive backstop) ──────────────────────────
  // The code below is the pre-D18 renderer — kept in place as a
  // defensive backstop. With Modern, Structured, and Bold all wired
  // above, no in-product template key falls through here in normal
  // operation. The block survives only to keep the function
  // well-defined if a future template key is added to the picker
  // without a matching renderer (or if a stale client somehow sends
  // an unknown value).

  const { quote, lineItems, user, organization, tenderContext, brandMode } = data;

  const brand = resolveBrand(organization, brandMode);

  // Company identity — prefer org, fall back to user. Both can be null
  // in edge cases (e.g. a newly signed-up org with no profile yet) so
  // we always have a string to interpolate.
  const companyName =
    (organization as any)?.companyName
    || (user as any)?.companyName
    || (user as any)?.name
    || "Your Company";
  const companyAddress =
    (organization as any)?.companyAddress
    || (user as any)?.companyAddress
    || null;
  const companyPhone =
    (organization as any)?.companyPhone
    || (user as any)?.companyPhone
    || null;
  const companyEmail =
    (organization as any)?.companyEmail
    || (user as any)?.companyEmail
    || (user as any)?.email
    || null;
  const companyWebsite = (organization as any)?.companyWebsite || null;

  const rawLogo =
    (organization as any)?.companyLogo
    || (user as any)?.companyLogo
    || null;
  const logoUrl = await resolveLogoUrl(rawLogo);

  const reference = (quote as any).reference || `Q-${(quote as any).id}`;
  const clientName = (quote as any).clientName || "Client";
  const contactName = (quote as any).contactName || null;
  const title = (quote as any).title || "Professional Services Proposal";
  const description = (quote as any).description || null;
  const notes = tenderContext?.notes || null;
  const dateStr = formatDate((quote as any).createdAt) || formatDate(new Date());

  // Shared page footer — the Manus template repeats supplier contact +
  // reference on every page; we mirror that for document feel.
  const footerParts = [
    escapeHtml(companyName) + (companyAddress ? ` &nbsp;·&nbsp; ${escapeHtml(companyAddress)}` : ""),
    [companyPhone, companyEmail].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ") || "&nbsp;",
    escapeHtml(reference) + " &nbsp;·&nbsp; Confidential",
  ];
  const pageFooter = `<div class="page-footer"><span>${footerParts[0]}</span><span>${footerParts[1]}</span><span>${footerParts[2]}</span></div>`;

  const coverHtml = renderCover({
    brand,
    companyName,
    logoUrl,
    websiteUrl: companyWebsite,
    companyAddress,
    companyPhone,
    companyEmail,
    reference,
    dateStr,
    clientName,
    contactName,
    title,
  });

  const execHtml = renderExecSummary({
    companyName,
    clientName,
    title,
    description,
    notes,
    pageFooter,
  });

  const pricingHtml = renderPricing({
    quote,
    lineItems,
    pageFooter,
  });

  const termsHtml = renderTerms({
    quote,
    organization,
    tenderContext,
    companyName,
    clientName,
    pageFooter,
  });

  const css = renderCss(brand);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${escapeHtml(title)} — ${escapeHtml(clientName)}</title>
<style>${css}</style>
</head>
<body>
${coverHtml}
${execHtml}
${pricingHtml}
${termsHtml}
</body>
</html>`;
}
