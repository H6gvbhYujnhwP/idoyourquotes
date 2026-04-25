/**
 * Phase 4A Delivery 19 — Structured proposal template renderer.
 *
 * The "Structured" design template, sector-agnostic. Adapted from
 * Manus's cleaning-operational showcase HTML (see
 * client/public/proposal-showcase/source/cleaning-operational.html)
 * with a deliberate decision to stay generic across all four GTM
 * sectors rather than replicate the source's cleaning-specific pages
 * (rota matrix, area-by-area checklist, SLA table) which all rely on
 * data the quote system doesn't capture.
 *
 * What carries over from the source:
 *   - Operational / methodical visual mood: pale main panel with
 *     deep structural elements, uppercase doc-type pill, scope-box
 *     with ticked items, sec-banner section headers numbered 01 / 02
 *     / 03 instead of Modern's lower-key eyebrows.
 *   - Brand-primary used for chrome (banners, table headers, scope-
 *     box border + header, signature block borders).
 *   - Brand-secondary used for accents (scope ticks, tick markers).
 *   - Pale brand-tint as the cover main background — distinct from
 *     Modern's brand-primary cover that takes the full bleed.
 *
 * What's intentionally dropped from the source:
 *   - Provider-credentials table — needs an accreditations field on
 *     organization that doesn't exist yet (parked todo).
 *   - Cred-strip on cover — same reason.
 *   - Cleaning-rota matrix and area-checklist — cleaning-specific,
 *     would need scope data we don't capture and would be wrong for
 *     IT / marketing / pest-control quotes.
 *   - SLA table — needs SLA fields on org or per-quote scope; the
 *     same hardcoded "15 min / 99.9%" pair Modern uses on the cover
 *     stat-strip would feel out of place printed as a full table.
 *
 * Result: same four-page proposal as Modern (Cover → Executive
 * Summary → Pricing → Terms + Acceptance) but rendered in the
 * structured/operational visual treatment.
 *
 * The cover's signature element is the scope-box — up to six ticked
 * items derived from non-optional line items. Title is the truncated
 * description; sub-line is qty/unit. When zero non-optional priced
 * lines exist (e.g. brand-new draft) the scope-box is omitted and
 * the cover still reads cleanly because the client-info table and
 * contact strip carry the visual weight.
 *
 * Helper functions and types are imported from the parent
 * brandedProposalRenderer to keep one source of truth for colour
 * resolution, R2 URL signing, escaping, formatting, and totals
 * arithmetic.
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
} from "../brandedProposalRenderer";

// ── Scope items (cover scope-box) ────────────────────────────────────

interface ScopeItem {
  title: string; // bold lead line — truncated description
  detail: string; // sub-line — qty + unit OR pricing rhythm hint
}

/**
 * Compute up to six scope items for the cover scope-box. Pulled from
 * non-optional line items with a positive quantity. Returned in the
 * order the user laid them out on the quote (no re-sorting). Caller
 * decides whether to render the scope-box at all (zero items → omit).
 */
function computeScopeItems(lineItems: QuoteLineItem[]): ScopeItem[] {
  const SCOPE_MAX = 6;
  const TITLE_MAX = 60; // characters before truncation

  const items: ScopeItem[] = [];

  for (const li of lineItems) {
    if (items.length >= SCOPE_MAX) break;

    // Skip optional and zero-qty rows — they're not "scope" the
    // client should see prominently on the cover.
    if ((li as any).isOptional) continue;
    const qtyNum = parseFloat(String((li as any).quantity || "0"));
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) continue;

    const rawDesc = plainLineItemText((li as any).description as any).trim();
    if (!rawDesc) continue;

    // Take the first line / first sentence for the title — line items
    // sometimes carry multi-line descriptions where the first line is
    // the headline and the rest is detail prose.
    const firstLine = rawDesc.split(/[\r\n]+/, 1)[0] ?? rawDesc;
    const title = firstLine.length > TITLE_MAX
      ? firstLine.slice(0, TITLE_MAX - 1).trimEnd() + "…"
      : firstLine;

    const unit = String((li as any).unit || "").trim();
    const qtyStr = formatQuantity((li as any).quantity);
    const pricingType = (li as any).pricingType || "one_off";

    let detail: string;
    if (pricingType === "monthly") {
      detail = unit
        ? `${qtyStr} ${unit} · monthly`
        : `${qtyStr} · monthly`;
    } else if (pricingType === "annual") {
      detail = unit
        ? `${qtyStr} ${unit} · annual`
        : `${qtyStr} · annual`;
    } else {
      detail = unit
        ? `${qtyStr} ${unit}`
        : `Qty ${qtyStr}`;
    }

    items.push({ title, detail });
  }

  return items;
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
  subtitleAddress: string | null;
  scopeItems: ScopeItem[];
  contractTermLine: string | null;
  monthlyHeadline: string | null;
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
    subtitleAddress,
    scopeItems,
    contractTermLine,
    monthlyHeadline,
  } = args;

  // Wordmark fallback when no logo uploaded — matches Modern's
  // approach (uppercase, letter-spaced).
  const wordmarkText = companyName.length > 16
    ? companyName.slice(0, 16).toUpperCase()
    : companyName.toUpperCase();

  const logoContent = logoUrl
    ? `<img src="${escapeHtml(logoUrl)}" alt="${escapeHtml(companyName)} logo" style="max-width:160px;max-height:48px;object-fit:contain;">`
    : `<span>${escapeHtml(wordmarkText)}</span>`;

  // Doc-ref block — top-right of cover. Always shows ref + date. Adds
  // the named recipient when contactName is set, then a "Confidential"
  // tag.
  const docRefLines = [`Ref: ${escapeHtml(reference)}`, `Date: ${escapeHtml(dateStr)}`];
  if (contactName && contactName.trim()) {
    docRefLines.push(`Prepared for: ${escapeHtml(contactName)}`);
  } else {
    docRefLines.push(`Prepared for: ${escapeHtml(clientName)}`);
  }
  docRefLines.push("Confidential");
  const docRefHtml = docRefLines.join("<br>");

  // Subtitle line under the H1. Always carries the client name; adds
  // the address as a separator-divided trailing fragment when set.
  const subtitleParts: string[] = [escapeHtml(clientName)];
  if (subtitleAddress && subtitleAddress.trim()) {
    subtitleParts.push(escapeHtml(subtitleAddress));
  }
  const subtitleHtml = subtitleParts.join(" &nbsp;·&nbsp; ");

  // Scope-box header — left side names the client, right side carries
  // the headline metric (monthly recurring) when we have one.
  const scopeBoxHeaderRight = monthlyHeadline
    ? escapeHtml(monthlyHeadline)
    : "";

  const scopeBoxHtml = scopeItems.length > 0
    ? `
    <div class="scope-box">
      <div class="scope-box-header"><span>Scope Summary — ${escapeHtml(clientName)}</span><span>${scopeBoxHeaderRight}</span></div>
      <div class="scope-box-body">
        ${scopeItems.map((it) => `<div class="scope-item"><span class="scope-tick">&#10003;</span><div class="scope-text"><strong>${escapeHtml(it.title)}</strong><span>${escapeHtml(it.detail)}</span></div></div>`).join("")}
      </div>
    </div>`
    : "";

  // Client-info table — always shown. Cells are omitted gracefully
  // when their value is empty so a sparse-data render still looks
  // intentional rather than skeletal.
  const infoRows: Array<[string, string]> = [];
  infoRows.push(["Client", escapeHtml(clientName)]);
  if (contactName && contactName.trim()) {
    infoRows.push(["Named Recipient", escapeHtml(contactName)]);
  }
  if (subtitleAddress && subtitleAddress.trim()) {
    infoRows.push(["Service Address", escapeHtml(subtitleAddress)]);
  }
  infoRows.push(["Provider", escapeHtml(companyName)]);
  if (contractTermLine) {
    infoRows.push(["Contract Term", escapeHtml(contractTermLine)]);
  }
  if (monthlyHeadline) {
    infoRows.push(["Monthly Fee (ex VAT)", escapeHtml(monthlyHeadline)]);
  }

  const infoTableHtml = `
    <table class="client-info-table">
      <tbody>
        ${infoRows.map(([k, v]) => `<tr><td>${k}</td><td>${v}</td></tr>`).join("")}
      </tbody>
    </table>`;

  // Contact strip — same auto-fit layout as Modern. Omit cells that
  // have no value rather than rendering empty placeholders.
  const contactCells: string[] = [];
  if (companyPhone && companyPhone.trim()) {
    contactCells.push(`<div><div class="cc-label">Phone</div><div class="cc-value">${escapeHtml(companyPhone)}</div></div>`);
  }
  if (companyEmail && companyEmail.trim()) {
    contactCells.push(`<div><div class="cc-label">Email</div><div class="cc-value">${escapeHtml(companyEmail)}</div></div>`);
  }
  if (websiteUrl && websiteUrl.trim()) {
    const websiteDisplay = websiteUrl.replace(/^https?:\/\//, "");
    contactCells.push(`<div><div class="cc-label">Website</div><div class="cc-value">${escapeHtml(websiteDisplay)}</div></div>`);
  }
  const contactRowHtml = contactCells.length > 0
    ? `<div class="cover-contact-row">${contactCells.join("")}</div>`
    : "";

  // Footer strip — company identity left, ref + confidential right.
  const footerLeftParts: string[] = [escapeHtml(companyName)];
  if (companyAddress && companyAddress.trim()) {
    footerLeftParts.push(escapeHtml(companyAddress));
  }
  const footerLeft = footerLeftParts.join(" &nbsp;·&nbsp; ");

  return `
<div class="cover">
  <div class="cover-top-bar"></div>
  <div class="cover-main">
    <div class="cover-header-row">
      <div class="logo-box">${logoContent}</div>
      <div class="cover-doc-type">
        <div class="doc-type-label">Service Proposal</div>
        <div class="doc-ref">${docRefHtml}</div>
      </div>
    </div>
    <div class="cover-rule"></div>
    <h1>${escapeHtml(title)}</h1>
    <p class="cover-sub">${subtitleHtml}</p>
    ${scopeBoxHtml}
    ${infoTableHtml}
  </div>
  ${contactRowHtml}
  <div class="cover-footer-strip">
    <span>${footerLeft}</span>
    <span>Confidential &nbsp;·&nbsp; ${escapeHtml(reference)}</span>
  </div>
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

  // Lead paragraph — prefer notes, fall back to description, fall back
  // to a generic statement of intent.
  const leadText = (notes && notes.trim())
    || (description && description.trim())
    || `This proposal sets out the scope, pricing, and commercial terms proposed by ${companyName} for ${title}, on behalf of ${clientName}. The pages that follow detail the pricing schedule and contract terms.`;

  return `
<div class="page">
  <div class="sec-banner"><span class="sec-num">01</span><span class="sec-title">Executive Summary</span></div>
  <p>${escapeHtml(leadText)}</p>
  <p>${escapeHtml(companyName)} is pleased to submit this proposal to ${escapeHtml(clientName)}. The pricing in Section 02 covers the scope as described above and itemised line-by-line. Contract terms and the acceptance block are in Section 03.</p>
  <h3>How This Document Is Structured</h3>
  <p>Section 02 is the pricing schedule — every chargeable line, grouped by one-off and recurring (monthly / annual) where applicable, with VAT shown explicitly. Section 03 sets out the commercial terms: validity, payment, scope boundaries, assumptions, exclusions, and the dual-signature acceptance block that turns this proposal into a binding agreement once countersigned.</p>
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

  const oneOffTable = renderTable("One-off / Project Fees", oneOff, "One-off subtotal (excl. VAT)", oneOffSubtotal);
  const monthlyTable = renderTable("Recurring — Monthly", monthly, "Monthly subtotal (excl. VAT)", monthlySubtotal);
  const annualTable = renderTable("Recurring — Annual", annual, "Annual subtotal (excl. VAT)", annualSubtotal);

  const hasAny = oneOff.length + monthly.length + annual.length > 0;
  const emptyNotice = hasAny
    ? ""
    : `<p style="color:#6b7280;font-style:italic;">No priced line items on this quote yet.</p>`;

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
  <div class="sec-banner"><span class="sec-num">02</span><span class="sec-title">Pricing Schedule</span></div>
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

  const orgDefaultExclusions = (organization as any)?.defaultExclusions as string | null | undefined;

  const assumptionsHtml = assumptions.length > 0
    ? `<ul class="term-list">${assumptions.map((a) => `<li>${escapeHtml(a.text)}</li>`).join("")}</ul>`
    : `<p class="term-muted">None explicitly recorded — this proposal is priced against the scope as described in the Executive Summary and pricing schedule.</p>`;

  let exclusionsHtml: string;
  if (exclusions.length > 0) {
    exclusionsHtml = `<ul class="term-list">${exclusions.map((e) => `<li>${escapeHtml(e.text)}</li>`).join("")}</ul>`;
  } else if (orgDefaultExclusions && orgDefaultExclusions.trim()) {
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
  <div class="sec-banner"><span class="sec-num">03</span><span class="sec-title">Contract Terms &amp; Acceptance</span></div>
  <p><strong>Validity:</strong> ${escapeHtml(validityLine)}</p>
  <p><strong>Payment:</strong> ${escapeHtml(paymentTerms)}</p>
  <p><strong>Scope:</strong> The work covered is as described in the Executive Summary and itemised in the Pricing Schedule. Work outside that scope will be quoted separately and is not included in the pricing above.</p>
  <h3>Assumptions</h3>
  ${assumptionsHtml}
  <h3>Exclusions</h3>
  ${exclusionsHtml}
  ${terms && terms.trim() ? `<h3>Additional Terms</h3><p>${escapeHtml(terms)}</p>` : ""}

  <p style="margin-top:18px;">By signing below, both parties confirm their agreement to the terms set out in this proposal. Once countersigned, this document constitutes a binding agreement.</p>
  <div class="sig-grid">
    <div class="sig-block">
      <div class="sig-label">For and on behalf of ${escapeHtml(companyName)}</div>
      <div class="sig-line"></div><div class="sig-field">Signature${supplierSigLabel ? ` — ${supplierSigLabel}` : ""}</div>
      <div class="sig-line"></div><div class="sig-field">Full Name &amp; Title</div>
      <div class="sig-line"></div><div class="sig-field">Date</div>
    </div>
    <div class="sig-block">
      <div class="sig-label">For and on behalf of ${escapeHtml(clientName)}</div>
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
  // Text colours — fixed neutral palette regardless of brand. Same
  // conservative ramp as Modern. Keeps body text consistently readable
  // on the pale main background and inside white-bg tables.
  const headingTextColor = "#111827";
  const bodyTextColor = "#1a1a2e"; // slightly cooler than Modern's #374151 — matches the source's typographic mood
  const mutedTextColor = "#4a5a6a";
  const hairlineColor = "#d5e8d5"; // mint-tinted hairline (source uses #c8e6c9 family); brand-tint-alt would be too pale

  return `
  :root {
    --brand-primary: ${brand.primary};
    --brand-primary-rgb: ${hexToRgbTriple(brand.primary)};
    --brand-secondary: ${brand.secondary};
    --brand-secondary-rgb: ${hexToRgbTriple(brand.secondary)};
    --brand-tint: ${brand.tint};
    --brand-tint-alt: ${brand.tintAlt};
    --brand-on-primary: ${brand.onPrimaryText};
  }
  @page { size: A4; margin: 0; }
  /* Phase 4A Delivery 10 — Chrome strips background colours from print
     output by default. -webkit-print-color-adjust:exact tells Chrome
     to render backgrounds in PDF exactly as on screen. */
  *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', 'Helvetica Neue', Arial, sans-serif; font-size: 9.5pt; line-height: 1.65; color: ${bodyTextColor}; background: #fff; max-width: 210mm; margin: 0 auto; }

  /* ── COVER ─────────────────────────────────────────────────────── */
  .cover { min-height: 100vh; display: flex; flex-direction: column; page-break-after: always; }
  .cover-top-bar { background: var(--brand-primary); height: 8px; }
  .cover-main { flex: 1; background: var(--brand-tint); display: flex; flex-direction: column; padding: 14mm 18mm; }
  .cover-header-row { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
  /* White panel behind the logo for contrast — same Delivery 9 fix
     as Modern. Letter-spaced wordmark fallback when no logo set. */
  .logo-box { min-width: 180px; min-height: 60px; max-width: 220px; background: #ffffff; border: 2px solid var(--brand-primary); display: flex; align-items: center; justify-content: center; padding: 6px 12px; font-size: 9.5pt; letter-spacing: 0.18em; color: var(--brand-primary); text-transform: uppercase; font-weight: 700; }
  .cover-doc-type { text-align: right; }
  .doc-type-label { font-size: 7pt; font-weight: 700; letter-spacing: 0.18em; text-transform: uppercase; color: var(--brand-primary); background: var(--brand-tint-alt); padding: 4px 11px; display: inline-block; margin-bottom: 6px; }
  .doc-ref { font-size: 8pt; color: ${mutedTextColor}; line-height: 1.9; }
  .cover-rule { width: 100%; height: 2px; background: var(--brand-primary); margin-bottom: 20px; }
  .cover h1 { font-size: 24pt; font-weight: 800; color: var(--brand-primary); line-height: 1.15; letter-spacing: -0.02em; margin-bottom: 8px; text-transform: uppercase; }
  .cover-sub { font-size: 11pt; color: ${mutedTextColor}; margin-bottom: 24px; font-weight: 400; }

  /* Scope-box — the showcase element. Brand-primary border + filled
     header strip, white body with two-column ticked items. */
  .scope-box { border: 2px solid var(--brand-primary); background: #fff; margin-bottom: 20px; }
  .scope-box-header { background: var(--brand-primary); color: var(--brand-on-primary); padding: 7px 14px; font-size: 8pt; font-weight: 700; letter-spacing: 0.12em; text-transform: uppercase; display: flex; justify-content: space-between; gap: 12px; }
  .scope-box-body { padding: 14px; display: grid; grid-template-columns: 1fr 1fr; gap: 8px 24px; }
  .scope-item { display: flex; gap: 10px; align-items: flex-start; font-size: 8.5pt; }
  .scope-tick { color: var(--brand-secondary); font-weight: bold; font-size: 11pt; line-height: 1; margin-top: 1px; }
  .scope-text { color: ${headingTextColor}; }
  .scope-text strong { display: block; font-weight: 700; }
  .scope-text span { color: ${mutedTextColor}; font-size: 8pt; font-weight: 400; }

  /* Client-info table on cover — left column is a brand-primary
     filled header cell; right column is a white-on-tint detail cell. */
  .client-info-table { width: 100%; border-collapse: collapse; margin-bottom: 16px; }
  .client-info-table td { padding: 6px 10px; border: 1px solid ${hairlineColor}; font-size: 8.5pt; background: #fff; }
  .client-info-table td:first-child { background: var(--brand-primary); color: var(--brand-on-primary); font-weight: 700; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; width: 140px; }

  /* Cover contact row — runs full-width along the bottom of the
     cover, brand-primary background, three-up auto-fit grid. */
  .cover-contact-row { background: var(--brand-primary); padding: 10mm 18mm; display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 16px; }
  .cc-label { font-size: 7pt; color: rgba(255,255,255,0.55); letter-spacing: 0.12em; text-transform: uppercase; margin-bottom: 3px; }
  .cc-value { font-size: 9pt; color: var(--brand-on-primary); word-wrap: break-word; }

  /* Cover footer strip — brand-secondary band beneath the contact
     row. Slim, low-emphasis, carries the muted reference + confidential
     tag. */
  .cover-footer-strip { background: var(--brand-secondary); padding: 7px 18mm; font-size: 7.5pt; color: rgba(255,255,255,0.78); display: flex; justify-content: space-between; gap: 12px; }

  /* ── PAGES ─────────────────────────────────────────────────────── */
  .page { padding: 14mm 18mm; page-break-before: always; color: ${bodyTextColor}; }

  /* Section banner — solid brand-primary bar with section number on
     the left in a brand-secondary tint and section title on the right
     in white. Replaces Modern's "eyebrow + h2" pairing. */
  .sec-banner { background: var(--brand-primary); color: var(--brand-on-primary); padding: 9px 14px; margin-bottom: 16px; display: flex; align-items: center; gap: 12px; }
  .sec-num { font-size: 7.5pt; font-weight: 900; color: var(--brand-tint-alt); letter-spacing: 0.15em; }
  .sec-title { font-size: 12pt; font-weight: 800; text-transform: uppercase; letter-spacing: 0.06em; color: var(--brand-on-primary); }

  h3 { font-size: 10pt; font-weight: 700; color: var(--brand-primary); text-transform: uppercase; letter-spacing: 0.06em; margin: 18px 0 7px; border-left: 4px solid var(--brand-secondary); padding-left: 9px; }
  p { margin-bottom: 11px; color: ${bodyTextColor}; }

  /* Pricing tables — brand-primary header, alt-tint zebra, brand-tint
     subtotal rows, brand-secondary total row. */
  table { width: 100%; border-collapse: collapse; margin: 12px 0; page-break-inside: avoid; font-size: 9pt; }
  thead tr { background: var(--brand-primary); }
  thead th { padding: 8px 12px; text-align: left; color: var(--brand-on-primary); font-weight: 700; font-size: 7.5pt; letter-spacing: 0.08em; text-transform: uppercase; }
  tbody tr:nth-child(even) { background: var(--brand-tint-alt); }
  tbody td { padding: 7px 12px; border-bottom: 1px solid ${hairlineColor}; color: ${bodyTextColor}; vertical-align: top; }
  tfoot td { padding: 8px 12px; font-weight: 700; border-top: 2px solid var(--brand-primary); }
  .subtotal-row td { background: var(--brand-tint); color: var(--brand-primary); }
  .totals-table { margin-top: 8px; }
  .totals-table tbody td { border-bottom: 1px solid ${hairlineColor}; }
  .total-row td { background: var(--brand-secondary); color: var(--brand-on-primary); font-weight: 700; }
  .total-row td strong { color: var(--brand-on-primary); }
  .vat-row td { background: var(--brand-tint); color: var(--brand-primary); font-style: italic; }
  .opt-badge { display: inline-block; background: ${mutedTextColor}; color: #fff; font-size: 6.5pt; font-weight: 700; letter-spacing: 0.08em; padding: 1px 6px; border-radius: 2px; margin-left: 6px; vertical-align: middle; }

  /* Term lists + signature blocks. Sig blocks carry a brand-primary
     border on all sides — the structured visual signature, distinct
     from Modern's top-edge-only treatment. */
  .term-list { margin: 8px 0 14px; padding-left: 20px; color: ${bodyTextColor}; }
  .term-list li { margin-bottom: 5px; line-height: 1.6; }
  .term-muted { color: ${mutedTextColor}; font-style: italic; margin-bottom: 14px; }

  .sig-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 40px; margin-top: 24px; }
  .sig-block { border: 2px solid var(--brand-primary); padding: 14px; }
  .sig-label { font-size: 7.5pt; font-weight: 700; letter-spacing: 0.1em; text-transform: uppercase; color: var(--brand-primary); margin-bottom: 8px; }
  .sig-line { border-bottom: 1px solid var(--brand-primary); height: 36px; margin: 8px 0; }
  .sig-field { font-size: 8pt; color: ${mutedTextColor}; }

  .page-footer { margin-top: 22px; padding-top: 8px; border-top: 2px solid var(--brand-primary); font-size: 7.5pt; color: ${mutedTextColor}; display: flex; justify-content: space-between; gap: 10px; }
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

export async function renderStructuredTemplate(
  data: BrandedProposalData,
): Promise<string> {
  const { quote, lineItems, user, organization, tenderContext, brandMode } = data;

  const brand = resolveBrand(organization, brandMode);

  // Company identity — prefer org, fall back to user. Same fallback
  // chain Modern uses.
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

  // Cover scope items — derived from line items. Empty array → omit
  // scope-box. Caller of computeScopeItems already filters optional
  // and zero-qty rows.
  const scopeItems = computeScopeItems(lineItems);

  // Contract term + monthly headline — best-effort details for the
  // client-info table. Show contract term only when monthly recurring
  // is present (otherwise it implies a recurring relationship that
  // doesn't exist for one-off proposals). Validity copy is the safe
  // default text — picks up org default when set.
  const monthlyTotalNum = parseFloat(String((quote as any).monthlyTotal || "0"));
  const annualTotalNum = parseFloat(String((quote as any).annualTotal || "0"));
  const isRecurring = (Number.isFinite(monthlyTotalNum) && monthlyTotalNum > 0)
    || (Number.isFinite(annualTotalNum) && annualTotalNum > 0);

  const contractTermLine = isRecurring
    ? "12 months · auto-renew annually"
    : null;

  const monthlyHeadline = (Number.isFinite(monthlyTotalNum) && monthlyTotalNum > 0)
    ? formatCurrency(monthlyTotalNum)
    : null;

  // Shared page footer — 3-cell strip at the bottom of every page
  // after the cover. Same shape Modern uses.
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
    subtitleAddress: clientAddress,
    scopeItems,
    contractTermLine,
    monthlyHeadline,
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
