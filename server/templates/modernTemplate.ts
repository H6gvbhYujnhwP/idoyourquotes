/**
 * Phase 4A Delivery 18 — Modern proposal template renderer.
 *
 * The "Modern" design template, sector-agnostic. Adapted from Manus's
 * IT-Modern showcase HTML (client/public/proposal-showcase/source/it-modern.html)
 * with these changes vs the legacy renderer:
 *
 *   1. **Stat strip on the cover** — the missing visual hook that the
 *      Manus original carried but the legacy renderer dropped in favour
 *      of an AI-generated background image (D12–D16). Three sessions of
 *      Gemini iteration confirmed the AI image couldn't carry the cover
 *      design. Concrete numbers (users covered / SLA / uptime / per-user
 *      monthly) are more visually striking AND more useful to the reader
 *      than abstract decoration. Toggle via organizations.coverStatStripEnabled.
 *
 *   2. **No AI cover image** — the brand extraction chainpoint that
 *      triggered Gemini was removed in the same delivery (see
 *      server/services/brandExtraction.ts). The supporting schema
 *      columns were dropped in Delivery 21.
 *
 *   3. **Page bands use a simple gradient** — the previous renderer
 *      pulled a horizontal slice from the AI image as a 6mm decorative
 *      top band on every page. With no image, page bands are a clean
 *      brand-secondary → brand-primary linear gradient. Same design
 *      rhythm, no AI dependency.
 *
 *   4. **Stat strip data** — derived as follows:
 *        - Users covered: sum of `quantity` from line items whose unit
 *          is "User" / "Users" / "Per User" or whose description contains
 *          "per user". When zero matches, the cell is omitted (strip
 *          drops to 3-up).
 *        - P1 Response SLA: hardcoded "15 min" (universal MSP standard).
 *        - Uptime Objective: hardcoded "99.9%" (universal MSP standard).
 *        - Per User / Month: monthlyTotal / usersCovered, rounded to
 *          nearest pound. Omitted when either value is zero or missing.
 *      The strip survives gracefully at 4 / 3 / 2 cells; if everything
 *      misses we omit the strip entirely (the toggle setting also
 *      respected — a user who turned it off never sees it regardless).
 *
 * Helper functions and types are imported from the parent
 * brandedProposalRenderer to keep one source of truth for colour
 * resolution, R2 URL signing, escaping, formatting, and totals
 * arithmetic. This module focuses on layout, content, and the new
 * stat strip — nothing else.
 */

import type { Quote, QuoteLineItem, Organization } from "../../drizzle/schema";
import {
  type BrandedProposalData,
  type ResolvedBrand,
  escapeHtml,
  formatCurrency,
  formatQuantity,
  formatDate,
  plainLineItemText,
  hexToRgbTriple,
  resolveBrand,
  resolveLogoUrl,
  sumDecimal,
  readableTextOn,
  termsCoverValidity,
  termsCoverPayment,
} from "../brandedProposalRenderer";
import { renderMigrationAppendix } from "./migrationAppendix";

// ── Stat strip ──────────────────────────────────────────────────────

interface StatCell {
  num: string;   // the big bold number ("40", "£67", "99.9%")
  label: string; // small uppercase label ("Users Covered", etc.)
}

/**
 * Compute the four stat cells for the cover. Returns whatever cells
 * have data to render — caller decides whether to omit the strip
 * entirely (e.g. when stat strip is toggled off, or when the strip
 * comes back empty).
 */
function computeStatCells(quote: Quote, lineItems: QuoteLineItem[]): StatCell[] {
  const cells: StatCell[] = [];

  // 1. Users covered — derive from line items where the unit / description
  //    smells like "per user". Tolerant of common variations ("User",
  //    "Users", "User/Month", description containing "per user").
  let userCount = 0;
  for (const li of lineItems) {
    const unit = String((li as any).unit || "").trim().toLowerCase();
    const desc = plainLineItemText((li as any).description as any).toLowerCase();
    const isPerUser =
      unit === "user"
      || unit === "users"
      || unit.startsWith("user/")
      || unit.startsWith("user ")
      || /\bper\s+user\b/.test(desc);
    if (isPerUser) {
      const qty = parseFloat(String((li as any).quantity || "0"));
      if (Number.isFinite(qty) && qty > 0) {
        // Multiple per-user lines for the same user count is the common
        // shape (e.g. "Helpdesk per user × 40", "M365 per user × 40",
        // "EDR per user × 40"). Take the MAX rather than the SUM —
        // they're parallel charges against the same user population,
        // not separate users.
        userCount = Math.max(userCount, Math.round(qty));
      }
    }
  }
  if (userCount > 0) {
    cells.push({ num: String(userCount), label: "Users Covered" });
  }

  // 2. P1 Response SLA — hardcoded universal default. Future delivery
  //    may make this an org-level configurable.
  cells.push({ num: "15 min", label: "P1 Response SLA" });

  // 3. Uptime Objective — hardcoded universal default.
  cells.push({ num: "99.9%", label: "Uptime Objective" });

  // 4. Per User / Month — derive from monthlyTotal / userCount. Omit
  //    when either is zero. Round to nearest pound for the cover (the
  //    pricing page carries the precise figure).
  const monthlyTotal = parseFloat(String((quote as any).monthlyTotal || "0"));
  if (Number.isFinite(monthlyTotal) && monthlyTotal > 0 && userCount > 0) {
    const perUser = Math.round(monthlyTotal / userCount);
    if (Number.isFinite(perUser) && perUser > 0) {
      cells.push({ num: `£${perUser}`, label: "Per User / Month" });
    }
  }

  return cells;
}

// ── Cover ────────────────────────────────────────────────────────────

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
  statCells: StatCell[];
}): string {
  const {
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
    statCells,
  } = args;

  // Wordmark fallback — the Manus template uses an uppercase letter-
  // spaced text block when no logo is uploaded. Truncate long names
  // to keep the badge proportions sensible.
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

  // Build contact strip from cells that actually have data. Same
  // pattern as Delivery 9 — auto-fit so 1, 2, or 3 populated cells
  // all lay out cleanly without an "—" placeholder filler.
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

  // Stat strip — only render when caller passed cells in (caller
  // already honoured the org's coverStatStripEnabled toggle and the
  // empty-strip fallback). 2/3/4 cells all render via the same grid.
  const statStripHtml = statCells.length > 0
    ? `\n  <div class="cover-stat-strip" style="grid-template-columns: repeat(${statCells.length}, 1fr);">${
        statCells.map((c, idx) => {
          const cls = idx === statCells.length - 1 ? "stat-item stat-item-last" : "stat-item";
          return `<div class="${cls}"><div class="stat-num">${escapeHtml(c.num)}</div><div class="stat-label">${escapeHtml(c.label)}</div></div>`;
        }).join("")
      }</div>`
    : "";

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
  </div>${contactStripHtml}${statStripHtml}
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

function renderPricing(args: {
  quote: Quote;
  lineItems: QuoteLineItem[];
  pageFooter: string;
}): string {
  const { quote, lineItems, pageFooter } = args;

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
  /**
   * Phase 4A Delivery 28 — when the migration appendix renders ahead
   * of this page, it occupies the next section number and Terms shifts
   * down by one. Caller passes the number Terms should display.
   * Default 3 preserves pre-D28 behaviour for any path that doesn't
   * supply it.
   */
  sectionStart?: number;
}): string {
  const { quote, organization, tenderContext, companyName, clientName, pageFooter } = args;
  const termsSec = args.sectionStart ?? 3;
  const acceptanceSec = termsSec + 1;
  const termsSecStr = String(termsSec).padStart(2, "0");
  const acceptanceSecStr = String(acceptanceSec).padStart(2, "0");

  // Phase 4A Delivery 24 — branded-renderer cascade chain.
  //   quote.X → organizations.brandedX → organizations.defaultX → fallback
  // Per-quote overrides (quote.X) win when set; otherwise the branded-
  // mode default takes over; otherwise we fall through to the legacy
  // default* (which was the only source pre-D24, so existing orgs that
  // set those in Settings continue to see them in branded output until
  // they explicitly fork by ticking save-as-default in the review gate).
  const terms = (quote as any).terms
    || (organization as any)?.brandedTerms
    || (organization as any)?.defaultTerms
    || "Standard UK commercial terms apply. Full terms are available on request.";

  const paymentTerms = (quote as any).paymentTerms
    || (organization as any)?.brandedPaymentTerms
    || (organization as any)?.defaultPaymentTerms
    || "Monthly invoicing, payable within 30 days of invoice date.";

  const validUntilRaw = (quote as any).validUntil;
  const validityLine = validUntilRaw
    ? `This proposal is valid until ${formatDate(validUntilRaw)}.`
    : (organization as any)?.defaultValidityDays
      ? `This proposal is valid for ${(organization as any).defaultValidityDays} days from the cover date.`
      : "This proposal is valid for 30 days from the cover date.";

  const assumptions = (tenderContext?.assumptions || []).filter((a) => a && a.text && a.text.trim());
  const exclusions = (tenderContext?.exclusions || []).filter((e) => e && e.text && e.text.trim());

  // Exclusions cascade applies only when tenderContext.exclusions is empty.
  const orgExclusionsBlob =
    ((organization as any)?.brandedExclusions as string | null | undefined)
    || ((organization as any)?.defaultExclusions as string | null | undefined);

  const assumptionsHtml = assumptions.length > 0
    ? `<ul class="term-list">${assumptions.map((a) => `<li>${escapeHtml(a.text)}</li>`).join("")}</ul>`
    : `<p class="term-muted">None explicitly recorded — this proposal is priced against the scope as described in the Executive Summary and line items.</p>`;

  let exclusionsHtml: string;
  if (exclusions.length > 0) {
    exclusionsHtml = `<ul class="term-list">${exclusions.map((e) => `<li>${escapeHtml(e.text)}</li>`).join("")}</ul>`;
  } else if (orgExclusionsBlob && orgExclusionsBlob.trim()) {
    const parts = orgExclusionsBlob
      .split(/[\n;•·]+/)
      .map((s) => s.trim())
      .filter(Boolean);
    exclusionsHtml = parts.length > 1
      ? `<ul class="term-list">${parts.map((p) => `<li>${escapeHtml(p)}</li>`).join("")}</ul>`
      : `<p>${escapeHtml(orgExclusionsBlob)}</p>`;
  } else {
    exclusionsHtml = `<p class="term-muted">None explicitly recorded.</p>`;
  }

  const signatoryName =
    (quote as any).signatoryName
    || (organization as any)?.brandedSignatoryName
    || (organization as any)?.defaultSignatoryName
    || "";
  const signatoryPosition =
    (quote as any).signatoryPosition
    || (organization as any)?.brandedSignatoryPosition
    || (organization as any)?.defaultSignatoryPosition
    || "";
  const supplierSigLabel = signatoryName && signatoryPosition
    ? `${escapeHtml(signatoryName)}, ${escapeHtml(signatoryPosition)}`
    : signatoryName
      ? escapeHtml(signatoryName)
      : "";

  // Phase 4A Delivery 31 — duplicate-clause suppression. When the
  // resolved `terms` text already covers a topic, the hardcoded
  // summary line for that topic is suppressed so the same statement
  // doesn't appear twice on the page (once as a renderer summary,
  // once inside the user's "Additional terms" block).
  const hideValidity = termsCoverValidity(terms);
  const hidePayment = termsCoverPayment(terms);

  return `
<div class="page">
  <div class="eyebrow">${termsSecStr} — Terms &amp; Conditions</div>
  <h2>Commercial terms</h2>
  ${hideValidity ? "" : `<p><strong>Validity:</strong> ${escapeHtml(validityLine)}</p>`}
  ${hidePayment ? "" : `<p><strong>Payment:</strong> ${escapeHtml(paymentTerms)}</p>`}
  <p><strong>Scope:</strong> The work covered is as described in the Executive Summary and itemised in the Pricing section. Work outside that scope will be quoted separately and is not included in the pricing above.</p>
  <h3>Assumptions</h3>
  ${assumptionsHtml}
  <h3>Exclusions</h3>
  ${exclusionsHtml}
  ${terms && terms.trim() ? `<h3>Additional terms</h3><p>${escapeHtml(terms)}</p>` : ""}

  <div class="eyebrow" style="margin-top:24px;">${acceptanceSecStr} — Acceptance</div>
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

function renderCss(brand: ResolvedBrand): string {
  const headingTextColor = "#111827";
  const bodyTextColor = "#374151";
  const mutedTextColor = "#6b7280";
  const hairlineColor = "#e5e7eb";

  // Phase 4A Delivery 23 — stat-num text colour is contrast-checked
  // against the stat-strip's accent fill. The intended look is
  // brand-primary on brand-secondary (a brand-on-brand statement),
  // and that's what's used whenever the two colours have at least
  // 4.5:1 contrast. When they stack too closely (e.g. Sweetbyte's
  // dark-navy primary on dark-navy secondary), readableTextOn flips
  // to white or black so the numbers stay readable. Stat-label keeps
  // its rgba black-with-alpha — small text against a coloured fill
  // sits in a different visual register and the slight bleed reads
  // as supporting metadata rather than primary content.
  const statNumColor = readableTextOn(brand.secondary, brand.primary);

  return `
  :root {
    --brand-primary: ${brand.primary};
    --brand-primary-rgb: ${hexToRgbTriple(brand.primary)};
    --brand-secondary: ${brand.secondary};
    --brand-tint: ${brand.tint};
    --brand-tint-alt: ${brand.tintAlt};
    --brand-on-primary: ${brand.onPrimaryText};
  }
  @page { size: A4; margin: 0; }
  /* Phase 4A Delivery 10 — Chrome strips background colours from print
     output by default. -webkit-print-color-adjust:exact tells Chrome
     to render backgrounds in PDF exactly as on screen. */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.7; color: ${bodyTextColor}; background: #fff; max-width: 210mm; margin: 0 auto; }

  /* ── COVER ─────────────────────────────────────────────────────── */
  /* Phase 4A Delivery 32 — the cover-nav becomes a 32mm white strip
     so the logo and ref block sit on a clean white surface, then the
     brand-primary bleed picks up below the strip and runs to the
     bottom of the page. The previous design painted the entire cover
     in brand-primary and gave the logo its own white card (Delivery 9);
     a white card on a coloured field reads as a sticker against the
     bleed and fights any logo that already has its own internal
     padding. The flipped surface — coloured field starts BELOW the
     logo — is more typical of letterhead / annual-report covers and
     lets uploaded logos sit on the same neutral surface they were
     designed against. */
  .cover { min-height: 100vh; background: var(--brand-primary); display: flex; flex-direction: column; page-break-after: always; color: var(--brand-on-primary); }
  .cover-nav { background: #ffffff; min-height: 32mm; padding: 6mm 16mm; display: flex; justify-content: space-between; align-items: center; gap: 20px; }
  /* Two faces: a real <img> logo renders naked on the white strip
     (no card, no border, no padding); the wordmark fallback gets a
     thin brand-primary outline so it reads as an intentional
     placeholder rather than orphaned text. */
  .logo-box { min-height: 48px; max-width: 220px; display: flex; align-items: center; }
  .logo-box img { max-width: 220px; max-height: 56px; object-fit: contain; }
  .logo-box span { font-size: 11pt; letter-spacing: 0.18em; color: var(--brand-primary); text-transform: uppercase; font-weight: 700; padding: 8px 14px; border: 1.5px solid var(--brand-primary); border-radius: 4px; }
  .cover-ref-block { text-align: right; font-size: 7.5pt; color: var(--brand-primary); line-height: 1.9; letter-spacing: 0.06em; }
  .cover-hero { flex: 1; padding: 12mm 16mm; display: flex; flex-direction: column; justify-content: center; }
  .accent-bar { width: 48px; height: 4px; background: var(--brand-secondary); margin-bottom: 20px; }
  .cover h1 { font-size: 32pt; font-weight: 800; color: #fff; line-height: 1.08; letter-spacing: -0.025em; max-width: 500px; margin-bottom: 16px; }
  .cover-tagline { font-size: 11.5pt; color: rgba(255,255,255,0.7); font-weight: 300; max-width: 440px; line-height: 1.6; margin-bottom: 28px; }
  .cover-prepared-for { font-size: 8.5pt; color: rgba(255,255,255,0.5); letter-spacing: 0.1em; text-transform: uppercase; margin-bottom: 4px; }
  .cover-client-name { font-size: 13pt; font-weight: 700; color: var(--brand-on-primary); }
  .cover-contact-strip { background: rgba(255,255,255,0.06); border-top: 1px solid rgba(255,255,255,0.12); padding: 10mm 16mm; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
  .contact-label { font-size: 7pt; color: rgba(255,255,255,0.45); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
  .contact-value { font-size: 9pt; color: rgba(255,255,255,0.9); word-wrap: break-word; }

  /* ── COVER STAT STRIP — Delivery 18 ────────────────────────────── */
  /* The visual hook the Manus IT-Modern template has carried since
     day one. Lavender (brand-secondary) bar across the bottom of the
     cover with 2-4 big bold numbers. The grid-template-columns is
     set inline so a 2/3/4 cell strip lays out evenly without
     hardcoding a 4-up template that breaks for sparse data. */
  .cover-stat-strip { background: var(--brand-secondary); padding: 10mm 16mm; display: grid; gap: 0; }
  .stat-item { padding: 0 16px 0 0; border-right: 1px solid rgba(255,255,255,0.3); }
  .stat-item-last { border-right: none; padding-left: 16px; padding-right: 0; }
  /* First cell has no left padding; last cell has no right border —
     middle cells inherit standard spacing. */
  .stat-item:first-child { padding-left: 0; }
  .stat-num { font-size: 18pt; font-weight: 900; color: ${statNumColor}; line-height: 1; letter-spacing: -0.02em; }
  .stat-label { font-size: 7.5pt; color: rgba(0,0,0,0.55); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; }

  /* ── PAGES ─────────────────────────────────────────────────────── */
  /* Phase 4A Delivery 18 — every section page gets a 4mm decorative
     top stripe in a brand-secondary → brand-primary linear gradient.
     Replaces the previous AI-image-derived band. Same design rhythm,
     no AI dependency. */
  .page { padding: 14mm 16mm; page-break-before: always; color: ${bodyTextColor}; position: relative; }
  .page::before {
    content: '';
    position: absolute;
    top: 0;
    left: 0;
    right: 0;
    height: 4mm;
    background: linear-gradient(90deg, var(--brand-secondary), var(--brand-primary));
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
    /* Phase 4A Delivery 26 (hotfix) — by default browsers repeat <tfoot>
       at the bottom of every page when a table spans pages, the same
       way <thead> repeats at the top. That caused the subtotal row to
       appear twice on long line-item tables (16+ items in the Headway
       Essex tender response). Treating tfoot as a regular row group
       suppresses the auto-repeat — the subtotal still renders at the
       end of the table because it sits last in source order. */
    tfoot { display: table-row-group; }
  }`;
}

// ── Main entry point ─────────────────────────────────────────────────

export async function renderModernTemplate(
  data: BrandedProposalData,
): Promise<string> {
  const { quote, lineItems, user, organization, tenderContext, brandMode } = data;

  const brand = resolveBrand(organization, brandMode);

  // Company identity — prefer org, fall back to user.
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

  // Stat strip — gated by org toggle. Default true; users can flip
  // off via Settings → Proposal Branding. When off OR when nothing
  // computes, the strip is omitted entirely (the cover-hero's flex:1
  // fills the remaining space cleanly without a gap).
  const statStripEnabled = (organization as any)?.coverStatStripEnabled !== false;
  const statCells = statStripEnabled
    ? computeStatCells(quote, lineItems)
    : [];

  // Shared page footer.
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
    statCells,
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

  // Phase 4A Delivery 28 — migration appendix slots between Pricing
  // and Terms. The appendix renders only when the AI inference helper
  // wrote a valid type into quote.migrationTypeSuggested AND the quote
  // is in the IT Services sector. When it renders, the Terms page
  // shifts from section 03 to section 04 (and the inline Acceptance
  // sub-eyebrow shifts from 04 to 05).
  const appendixHtml = renderMigrationAppendix({
    quote,
    organization,
    templateStyle: "modern",
    sectionNumber: 3,
    pageFooter,
  });
  const termsSectionStart = appendixHtml ? 4 : 3;

  const termsHtml = renderTerms({
    quote,
    organization,
    tenderContext,
    companyName,
    clientName,
    pageFooter,
    sectionStart: termsSectionStart,
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
${appendixHtml}
${termsHtml}
</body>
</html>`;
}
