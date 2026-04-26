/**
 * Phase 4A Delivery 20 — Bold proposal template renderer.
 *
 * The "Bold" design template, sector-agnostic. Adapted from Manus's
 * marketing-bold showcase HTML (see
 * client/public/proposal-showcase/source/marketing-bold.html) with a
 * deliberate decision to stay generic across all four GTM sectors —
 * the source's marketing-specific pages (services breakdown, KPI
 * table, cred-strip with named partner accreditations) are dropped
 * because they all rely on data the quote system doesn't capture.
 *
 * Key design decision — the Bold identity is fixed editorial chrome,
 * NOT brand-driven background colour. The cover and section dividers
 * use a fixed near-black (#0a0a0a) regardless of the org's brand
 * colours. The brand contributes ONE token: the accent colour, mapped
 * to --brand-secondary. If we let --brand-primary paint the cover,
 * an org with a pale brand would render a pale Bold cover and lose
 * the brutalist mood entirely. Black-and-accent is the template's
 * point of view.
 *
 * What carries over from the source:
 *   - Near-black cover with vivid accent stripes
 *   - Ultra-bold uppercase typography on cover H1 (44pt, weight 900)
 *   - Single-word accent in the H1 for editorial punch
 *   - Sec-dividers as full-bleed black bars with numbered prefix
 *   - Bold-callout block on the exec page (black bg, accent text)
 *   - Stat-strip on cover (accent bg, black numbers)
 *   - Heavy table chrome — black headers, accent total row
 *
 * What's intentionally dropped from the source:
 *   - Cred-strip pills naming partner accreditations — needs an
 *     accreditations field on organization that doesn't exist yet.
 *   - "The Programme" services breakdown — sector-specific structure.
 *   - KPI table — also sector-specific (organic traffic, lead targets).
 *
 * Result: same four-page proposal as Modern / Structured (Cover →
 * Executive Summary → Pricing → Terms + Acceptance) but in the Bold
 * editorial treatment.
 *
 * Stat-strip cells are derived from quote totals so they work for any
 * sector — no MSP-specific hardcoded defaults like Modern's "15 min
 * SLA / 99.9% uptime". The toggle (organizations.coverStatStripEnabled)
 * is shared with Modern so a user who's flipped it off there gets it
 * off here too.
 *
 * Helper functions and types are imported from the parent
 * brandedProposalRenderer.
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
  accentForDarkBg,
} from "../brandedProposalRenderer";

// ── Stat strip ───────────────────────────────────────────────────────

interface StatCell {
  num: string;
  label: string;
}

/**
 * Compute up to four stat cells for the Bold cover. Cells fall back
 * gracefully — for a recurring deal we get monthly / annual / term /
 * line-count; for a one-off project we get project total / line count
 * (2-up). When nothing computes (e.g. a brand-new draft with no
 * priced items yet) the array is empty and the caller omits the strip.
 */
function computeStatCells(quote: Quote, lineItems: QuoteLineItem[]): StatCell[] {
  const cells: StatCell[] = [];

  const monthlyTotal = parseFloat(String((quote as any).monthlyTotal || "0"));
  const storedAnnualTotal = parseFloat(String((quote as any).annualTotal || "0"));

  // Recurring path — monthly is the strongest signal that this is an
  // ongoing engagement. When monthly is set we always show it first,
  // followed by an annual figure (using stored annualTotal when set,
  // otherwise extrapolating monthly × 12), an engagement term, and
  // the count of priced line items.
  const hasMonthly = Number.isFinite(monthlyTotal) && monthlyTotal > 0;
  const hasStoredAnnual = Number.isFinite(storedAnnualTotal) && storedAnnualTotal > 0;

  if (hasMonthly) {
    cells.push({
      num: formatCurrency(monthlyTotal),
      label: "Monthly Investment",
    });

    const annualValue = hasStoredAnnual
      ? storedAnnualTotal
      : monthlyTotal * 12;
    cells.push({
      num: formatCurrency(annualValue),
      label: "Annual Value",
    });

    cells.push({ num: "12 Months", label: "Engagement Term" });
  } else if (hasStoredAnnual) {
    // Annual-recurring with no monthly equivalent — render annual
    // first, drop the term cell to avoid suggesting a monthly cadence.
    cells.push({
      num: formatCurrency(storedAnnualTotal),
      label: "Annual Investment",
    });
  } else {
    // One-off path — sum the non-optional one-off line items as the
    // "project value". Quietly skip when the sum is zero so we don't
    // render "£0" on the cover for an unpriced draft.
    const oneOffNonOptional = lineItems.filter((li) => {
      const pt = (li as any).pricingType || "one_off";
      const opt = (li as any).isOptional;
      return pt !== "monthly" && pt !== "annual" && !opt;
    });
    const oneOffTotal = sumDecimal(oneOffNonOptional.map((li) => (li as any).total));
    if (oneOffTotal > 0) {
      cells.push({
        num: formatCurrency(oneOffTotal),
        label: "Project Total",
      });
    }
  }

  // Line count — works for any path. Counts non-optional priced rows
  // only ("the deal", not the upsells). Capped at 99 for layout.
  const pricedCount = lineItems.filter((li) => {
    if ((li as any).isOptional) return false;
    const qty = parseFloat(String((li as any).quantity || "0"));
    return Number.isFinite(qty) && qty > 0;
  }).length;
  if (pricedCount > 0) {
    const display = pricedCount > 99 ? "99+" : String(pricedCount);
    cells.push({ num: display, label: "Service Lines" });
  }

  // Cap at 4 — anything beyond starts to look cluttered and the
  // grid-template-columns inline override goes from useful to unwieldy.
  return cells.slice(0, 4);
}

// ── Cover ────────────────────────────────────────────────────────────

/**
 * Wrap the last token of the title in a `.ac` span for the editorial
 * accent-word effect. Single-word titles get the whole word accented.
 * Empty / whitespace-only titles fall back to a generic "Proposal".
 */
function renderTitleWithAccent(title: string): string {
  const safe = (title || "").trim();
  if (!safe) {
    return `<span class="ac">${escapeHtml("Proposal")}</span>`;
  }

  const tokens = safe.split(/\s+/);
  if (tokens.length === 1) {
    return `<span class="ac">${escapeHtml(tokens[0])}</span>`;
  }

  const head = tokens.slice(0, -1).join(" ");
  const tail = tokens[tokens.length - 1];
  return `${escapeHtml(head)}<br><span class="ac">${escapeHtml(tail)}</span>`;
}

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
  clientAddress: string | null;
  title: string;
  description: string | null;
  notes: string | null;
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
    clientAddress,
    title,
    description,
    notes,
    statCells,
  } = args;

  // Wordmark fallback — same approach as Modern / Structured.
  const wordmarkText = companyName.length > 16
    ? companyName.slice(0, 16).toUpperCase()
    : companyName.toUpperCase();

  const logoContent = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo" style="max-width:160px;max-height:48px;object-fit:contain;">`
    : `<span>${escapeHtml(wordmarkText)}</span>`;

  // Cover description — short editorial line under the H1. Prefer
  // notes, then description, then a generic factual line.
  const descText = (notes && notes.trim())
    || (description && description.trim())
    || `Prepared for ${clientName} by ${companyName}.`;

  // Prepared-for line — adds the named contact when set.
  const preparedForValue = contactName && contactName.trim()
    ? `${escapeHtml(contactName)} &nbsp;·&nbsp; ${escapeHtml(clientName)}`
    : escapeHtml(clientName);

  // Service-address sub-block on the client block. Only when set.
  const addressBlock = clientAddress && clientAddress.trim()
    ? `<div class="cb-label" style="margin-top:6px;">Service address</div>
      <div class="cb-value">${escapeHtml(clientAddress)}</div>`
    : "";

  // Contact strip — same auto-fit pattern as Modern. Cells with no
  // value are skipped rather than rendering empty placeholders.
  const contactCells: string[] = [];
  if (companyAddress && companyAddress.trim()) {
    contactCells.push(`<div><div class="cs-label">Address</div><div class="cs-value">${escapeHtml(companyAddress)}</div></div>`);
  }
  const contactValue = [companyPhone, companyEmail]
    .filter((v) => v && String(v).trim())
    .map((v) => escapeHtml(v as string))
    .join("<br>");
  if (contactValue) {
    contactCells.push(`<div><div class="cs-label">Phone &amp; Email</div><div class="cs-value">${contactValue}</div></div>`);
  }
  if (websiteUrl && websiteUrl.trim()) {
    const websiteDisplay = websiteUrl.replace(/^https?:\/\//, "");
    contactCells.push(`<div><div class="cs-label">Website</div><div class="cs-value">${escapeHtml(websiteDisplay)}</div></div>`);
  }
  const contactStripHtml = contactCells.length > 0
    ? `<div class="cover-contact-strip">${contactCells.join("")}</div>`
    : "";

  // Stat strip — only render when caller passed cells (caller already
  // honoured the toggle and the empty-cells fallback).
  const statStripHtml = statCells.length > 0
    ? `<div class="cover-stat-strip" style="grid-template-columns: repeat(${statCells.length}, 1fr);">${
        statCells.map((c) => `<div class="stat-item"><div class="stat-num">${escapeHtml(c.num)}</div><div class="stat-label">${escapeHtml(c.label)}</div></div>`).join("")
      }</div>`
    : "";

  // Top-right cover-ref block — three short lines, uppercase confidential
  // tag at the bottom.
  const refBlockLines = [
    escapeHtml(reference),
    escapeHtml(dateStr),
    "CONFIDENTIAL",
  ];

  return `
<div class="cover">
  <div class="cover-nav">
    <div class="logo-box">${logoContent}</div>
    <div class="cover-ref">${refBlockLines.join("<br>")}</div>
  </div>
  <div class="cover-hero">
    <div class="cover-eyebrow">Service Proposal</div>
    <h1>${renderTitleWithAccent(title)}</h1>
    <p class="cover-desc">${escapeHtml(descText)}</p>
    <div class="cover-client-block">
      <div class="cb-label">Prepared for</div>
      <div class="cb-value">${preparedForValue}</div>
      ${addressBlock}
    </div>
  </div>
  ${contactStripHtml}
  ${statStripHtml}
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

  // Bold-callout content — the showcase element on this page. Prefer
  // notes (the proposal-author's deliberate framing line), fall back
  // to description, then to a generic statement built from title.
  const calloutText = (notes && notes.trim())
    || (description && description.trim())
    || `${title} — scope, pricing, and terms in one document. Sign to start.`;

  return `
<div class="page">
  <div class="sec-div"><span class="div-num">01</span><span class="div-title">Executive Summary</span><div class="div-line"></div></div>
  <h2>${escapeHtml(title)}</h2>
  <div class="bold-callout">${escapeHtml(calloutText)}</div>
  <p>${escapeHtml(companyName)} is pleased to submit this proposal to ${escapeHtml(clientName)}. Section 02 sets out the pricing schedule line by line; Section 03 covers the contract terms and the dual-signature acceptance block.</p>
  <p>The pricing in this document is valid for the period stated on the cover and is inclusive of every deliverable described. Anything not listed in Section 02 sits outside the scope of this proposal and will be quoted separately.</p>
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

  const renderTable = (
    label: string,
    rows: QuoteLineItem[],
    totalLabel: string,
    total: number,
  ) => {
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

  const oneOffTable = renderTable("One-off / Project", oneOff, "One-off subtotal (excl. VAT)", oneOffSubtotal);
  const monthlyTable = renderTable("Monthly Recurring", monthly, "Monthly subtotal (excl. VAT)", monthlySubtotal);
  const annualTable = renderTable("Annual Recurring", annual, "Annual subtotal (excl. VAT)", annualSubtotal);

  const hasAny = oneOff.length + monthly.length + annual.length > 0;
  const emptyNotice = hasAny
    ? ""
    : `<p style="color:#666;font-style:italic;">No priced line items on this quote yet.</p>`;

  const grandTotals = hasAny
    ? `
    <table class="totals-table">
      <tbody>
        ${oneOffSubtotal > 0 && taxRate > 0 ? `<tr class="vat-row"><td colspan="3">VAT @ ${taxRate}% on one-off fees</td><td>${formatCurrency(oneOffTax)}</td></tr>` : ""}
        ${oneOffSubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>One-off Total (inc. VAT)</strong></td><td><strong>${formatCurrency(oneOffTotalIncVat)}</strong></td></tr>` : ""}
        ${monthlySubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>Monthly Recurring (excl. VAT)</strong></td><td><strong>${formatCurrency(monthlySubtotal)}</strong></td></tr>` : ""}
        ${annualSubtotal > 0 ? `<tr class="total-row"><td colspan="3"><strong>Annual Recurring (excl. VAT)</strong></td><td><strong>${formatCurrency(annualSubtotal)}</strong></td></tr>` : ""}
      </tbody>
    </table>`
    : "";

  return `
<div class="page">
  <div class="sec-div"><span class="div-num">02</span><span class="div-title">Pricing</span><div class="div-line"></div></div>
  <h2>The Investment</h2>
  ${emptyNotice}
  ${oneOffTable}
  ${monthlyTable}
  ${annualTable}
  ${grandTotals}
  ${pageFooter}
</div>`;
}

// ── Page: Terms + Acceptance ─────────────────────────────────────────

function renderTerms(args: {
  quote: Quote;
  organization: Organization | null | undefined;
  tenderContext: BrandedProposalData["tenderContext"];
  companyName: string;
  clientName: string;
  pageFooter: string;
}): string {
  const { quote, organization, tenderContext, companyName, clientName, pageFooter } = args;

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
    : `<p class="term-muted">None explicitly recorded — this proposal is priced against the scope as described in the Executive Summary and pricing schedule.</p>`;

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

  return `
<div class="page">
  <div class="sec-div"><span class="div-num">03</span><span class="div-title">Terms &amp; Acceptance</span><div class="div-line"></div></div>
  <h2>The Terms</h2>
  <p><strong>Validity:</strong> ${escapeHtml(validityLine)}</p>
  <p><strong>Payment:</strong> ${escapeHtml(paymentTerms)}</p>
  <p><strong>Scope:</strong> The work covered is as described in the Executive Summary and itemised in the Pricing Schedule. Work outside that scope will be quoted separately.</p>
  <h3>Assumptions</h3>
  ${assumptionsHtml}
  <h3>Exclusions</h3>
  ${exclusionsHtml}
  ${terms && terms.trim() ? `<h3>Additional Terms</h3><p>${escapeHtml(terms)}</p>` : ""}

  <h2 style="margin-top:20px;">Sign &amp; Proceed</h2>
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
  // Bold's chrome is fixed editorial palette — only the accent token
  // varies with the org's brand. See the file-level comment for the
  // design rationale.
  const inkBlack = "#0a0a0a";
  const inkBody = "#2a2a2a";
  const inkMuted = "#666666";
  const hairline = "#e0e0e0";
  const zebraTint = "#f5f5f5";

  // Phase 4A Delivery 23 — accent is filtered through accentForDarkBg
  // so dark brand secondaries (e.g. Sweetbyte's #1154a0) get lifted
  // into a readable variant of themselves before being interpolated
  // into the CSS. Bright brand accents pass through unchanged. This
  // protects every Bold use of --brand-secondary at once: text on
  // black (eyebrow, H1 accent word, bold-callout), filled bands with
  // black numbers on top (stat-strip, total-row), and decorative
  // borders.
  const safeAccent = accentForDarkBg(brand.secondary, inkBlack);

  return `
  :root {
    --brand-secondary: ${safeAccent};
    --brand-secondary-rgb: ${hexToRgbTriple(safeAccent)};
    /* Fixed editorial chrome — Bold's identity is black + accent. */
    --bold-ink: ${inkBlack};
    --bold-body: ${inkBody};
    --bold-muted: ${inkMuted};
  }
  @page { size: A4; margin: 0; }
  /* Phase 4A Delivery 10 — Chrome strips background colours from print
     output by default. -webkit-print-color-adjust:exact tells Chrome
     to render backgrounds in PDF exactly as on screen. */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 10pt; line-height: 1.7; color: ${inkBlack}; background: #fff; max-width: 210mm; margin: 0 auto; }

  /* ── COVER ─────────────────────────────────────────────────────── */
  .cover { min-height: 100vh; background: ${inkBlack}; display: flex; flex-direction: column; page-break-after: always; }
  .cover-nav { padding: 14mm 16mm 0; display: flex; justify-content: space-between; align-items: flex-start; gap: 20px; }
  /* Logo box uses an accent-colour border — distinct from Modern's
     white-panel-with-shadow and Structured's brand-primary border. */
  .logo-box { min-width: 180px; min-height: 60px; max-width: 220px; border: 2px solid var(--brand-secondary); display: flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 10pt; letter-spacing: 0.2em; color: var(--brand-secondary); text-transform: uppercase; font-weight: 700; background: transparent; }
  /* When a real <img> logo is present it sits inside the accent box.
     Image styles are inline on the <img> tag to keep the bordered
     wordmark fallback's CSS unchanged. */
  .logo-box img { background: #fff; padding: 4px 8px; border-radius: 2px; }
  .cover-ref { text-align: right; font-size: 7.5pt; color: rgba(255,255,255,0.3); line-height: 1.9; letter-spacing: 0.05em; }
  .cover-hero { flex: 1; padding: 10mm 16mm 0; display: flex; flex-direction: column; justify-content: center; }
  .cover-eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 0.25em; text-transform: uppercase; color: var(--brand-secondary); margin-bottom: 14px; }
  .cover h1 { font-size: 44pt; font-weight: 900; color: #fff; line-height: 0.93; letter-spacing: -0.04em; text-transform: uppercase; margin-bottom: 22px; word-break: break-word; }
  .cover h1 .ac { color: var(--brand-secondary); }
  .cover-desc { font-size: 11pt; color: rgba(255,255,255,0.5); max-width: 460px; line-height: 1.6; font-weight: 300; margin-bottom: 28px; }
  .cover-client-block { border-left: 3px solid var(--brand-secondary); padding-left: 14px; }
  .cb-label { font-size: 7.5pt; color: rgba(255,255,255,0.4); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
  .cb-value { font-size: 10pt; color: #fff; font-weight: 600; }
  .cover-contact-strip { background: rgba(255,255,255,0.04); border-top: 1px solid rgba(255,255,255,0.08); padding: 8mm 16mm; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
  .cs-label { font-size: 7pt; color: rgba(255,255,255,0.35); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
  .cs-value { font-size: 8.5pt; color: rgba(255,255,255,0.75); word-wrap: break-word; }

  /* ── COVER STAT STRIP ──────────────────────────────────────────── */
  /* Accent band across the bottom of the cover — same role as Modern's
     stat-strip but uses --brand-secondary for the bg with black numbers
     for the high-contrast brutalist read. */
  .cover-stat-strip { background: var(--brand-secondary); padding: 8mm 16mm; display: grid; gap: 0; }
  .stat-item { padding: 0 14px 0 0; border-right: 1px solid rgba(0,0,0,0.18); }
  .stat-item:first-child { padding-left: 0; }
  .stat-item:last-child { border-right: none; padding-left: 14px; padding-right: 0; }
  /* When there's only one cell, the first/last selectors collide;
     this rule keeps the single-cell layout from picking up the
     last-child padding-left override on top of the first-child rule. */
  .stat-item:only-child { padding: 0; border-right: none; }
  .stat-num { font-size: 18pt; font-weight: 900; color: ${inkBlack}; line-height: 1; letter-spacing: -0.03em; }
  .stat-label { font-size: 7.5pt; color: rgba(0,0,0,0.6); text-transform: uppercase; letter-spacing: 0.1em; margin-top: 3px; font-weight: 700; }

  /* ── PAGES ─────────────────────────────────────────────────────── */
  .page { padding: 0 20mm 20px; page-break-before: always; }

  /* Sec-divider — full-bleed black bar that sits at the top of every
     section page. Negative margin pulls it to the page edges through
     the page padding. */
  .sec-div { background: ${inkBlack}; color: #fff; padding: 13px 20mm; display: flex; align-items: center; gap: 14px; margin: 0 -20mm 0; }
  .div-num { font-size: 8pt; font-weight: 900; color: var(--brand-secondary); letter-spacing: 0.15em; min-width: 34px; }
  .div-title { font-size: 13pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; }
  .div-line { flex: 1; height: 1px; background: rgba(255,255,255,0.15); }

  h2 { font-size: 22pt; font-weight: 900; color: ${inkBlack}; letter-spacing: -0.03em; line-height: 1.1; text-transform: uppercase; margin: 16px 0 14px; }
  h3 { font-size: 11pt; font-weight: 800; color: ${inkBlack}; text-transform: uppercase; letter-spacing: 0.08em; margin: 20px 0 7px; border-left: 4px solid var(--brand-secondary); padding-left: 10px; }
  p { margin-bottom: 12px; color: ${inkBody}; }

  /* Bold-callout — black block with accent-coloured display type.
     The signature element of the Bold exec page. */
  .bold-callout { background: ${inkBlack}; color: var(--brand-secondary); padding: 14px 18px; font-size: 11.5pt; font-weight: 700; line-height: 1.4; margin: 14px 0; }

  /* Pricing tables — black header with accent-coloured header text,
     accent-coloured total row. Heavier chrome than Modern / Structured. */
  table { width: 100%; border-collapse: collapse; margin: 13px 0; page-break-inside: avoid; font-size: 9pt; }
  thead tr { background: ${inkBlack}; }
  thead th { padding: 10px 13px; text-align: left; color: var(--brand-secondary); font-weight: 800; font-size: 7.5pt; letter-spacing: 0.12em; text-transform: uppercase; }
  tbody tr:nth-child(even) { background: ${zebraTint}; }
  tbody td { padding: 8px 13px; border-bottom: 1px solid ${hairline}; color: ${inkBody}; vertical-align: top; }
  tfoot td { padding: 10px 13px; font-weight: 800; border-top: 3px solid ${inkBlack}; }
  .subtotal-row td { background: ${zebraTint}; color: ${inkBlack}; }
  .totals-table { margin-top: 8px; }
  .totals-table tbody td { border-bottom: 1px solid ${hairline}; }
  .total-row td { background: var(--brand-secondary); color: ${inkBlack}; font-weight: 900; font-size: 10pt; }
  .total-row td strong { color: ${inkBlack}; }
  .vat-row td { background: ${zebraTint}; color: ${inkMuted}; font-style: italic; }
  .opt-badge { display: inline-block; background: ${inkMuted}; color: #fff; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 2px; margin-left: 6px; vertical-align: middle; }

  /* Term lists + signature blocks. Heavy black top border on sig
     blocks — the structural Bold signature, distinct from Structured's
     full-perimeter brand-primary border. */
  .term-list { margin: 8px 0 14px; padding-left: 20px; color: ${inkBody}; }
  .term-list li { margin-bottom: 5px; line-height: 1.6; }
  .term-muted { color: ${inkMuted}; font-style: italic; margin-bottom: 14px; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 26px; }
  .sig-block { border-top: 4px solid ${inkBlack}; padding-top: 13px; }
  .sig-label { font-size: 7.5pt; font-weight: 900; letter-spacing: 0.15em; text-transform: uppercase; color: ${inkBlack}; margin-bottom: 9px; }
  .sig-line { border-bottom: 1px solid ${inkBlack}; height: 36px; margin: 8px 0; }
  .sig-field { font-size: 8pt; color: ${inkMuted}; }

  .page-footer { margin-top: 22px; padding-top: 9px; border-top: 2px solid ${inkBlack}; font-size: 7.5pt; color: ${inkMuted}; display: flex; justify-content: space-between; gap: 10px; font-weight: 600; letter-spacing: 0.04em; text-transform: uppercase; }
  .page-footer span { flex: 1; }
  .page-footer span:nth-child(2) { text-align: center; }
  .page-footer span:nth-child(3) { text-align: right; }

  @media print {
    .cover { min-height: 297mm; }
    .page { page-break-before: always; }
    table { page-break-inside: avoid; }
    /* Phase 4A Delivery 26 (hotfix) — see modernTemplate.ts for why.
       Suppresses tfoot auto-repeat across page breaks so the subtotal
       row only appears once at the end of the table. */
    tfoot { display: table-row-group; }
  }`;
}

// ── Main entry point ─────────────────────────────────────────────────

export async function renderBoldTemplate(
  data: BrandedProposalData,
): Promise<string> {
  const { quote, lineItems, user, organization, tenderContext, brandMode } = data;

  const brand = resolveBrand(organization, brandMode);

  // Company identity — same fallback chain as Modern / Structured.
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
  const clientAddress = (quote as any).clientAddress || null;
  const title = (quote as any).title || "Service Proposal";
  const description = (quote as any).description || null;
  const notes = tenderContext?.notes || null;
  const dateStr = formatDate((quote as any).createdAt) || formatDate(new Date());

  // Stat strip — gated by the same org toggle Modern uses, so users
  // who've turned it off there get it off here too.
  const statStripEnabled = (organization as any)?.coverStatStripEnabled !== false;
  const statCells = statStripEnabled
    ? computeStatCells(quote, lineItems)
    : [];

  // Shared page footer — uppercase + letter-spaced to match the Bold
  // typographic register. Same 3-cell shape as Modern / Structured.
  const footerParts = [
    escapeHtml(companyName) + (companyAddress ? ` &nbsp;·&nbsp; ${escapeHtml(companyAddress)}` : ""),
    [companyPhone, companyEmail].filter(Boolean).map(escapeHtml).join(" &nbsp;·&nbsp; ") || "&nbsp;",
    escapeHtml(reference) + " &nbsp;·&nbsp; CONFIDENTIAL",
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
    clientAddress,
    title,
    description,
    notes,
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
