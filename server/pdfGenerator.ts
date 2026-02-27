// PDF Generation for Quotes
// Uses HTML generation for clean, professional quotes and multi-page proposals

import { Quote, QuoteLineItem, User, Organization, ComprehensiveConfig } from "../drizzle/schema";

interface PDFQuoteData {
  quote: Quote;
  lineItems: QuoteLineItem[];
  user: User;
  organization?: Organization | null;
  tenderContext?: { assumptions?: any[] | null; exclusions?: any[] | null; [key: string]: any } | null;
  trialWatermark?: boolean;
}

interface BrandColors {
  primary: string;
  secondary: string;
}

/**
 * Get brand colors from organization or use defaults
 */
function getBrandColors(organization?: Organization | null): BrandColors {
  const defaultPrimary = '#1a365d';
  const defaultSecondary = '#2c5282';
  
  if (!organization) {
    return { primary: defaultPrimary, secondary: defaultSecondary };
  }
  
  return {
    primary: organization.brandPrimaryColor || defaultPrimary,
    secondary: organization.brandSecondaryColor || defaultSecondary,
  };
}

function formatCurrency(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(value || "0");
  return new Intl.NumberFormat("en-GB", {
    style: "currency",
    currency: "GBP",
  }).format(num);
}

function formatQuantity(value: string | number | null | undefined): string {
  const num = typeof value === "number" ? value : parseFloat(value || "1");
  return num % 1 === 0 ? num.toFixed(0) : num.toFixed(2);
}

function formatDate(date: Date | string | null | undefined): string {
  if (!date) return "";
  return new Date(date).toLocaleDateString("en-GB", {
    day: "numeric",
    month: "long",
    year: "numeric",
  });
}

function escapeHtml(text: string): string {
  return text
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

/**
 * Generate the shared CSS styles
 */
function generateStyles(colors: BrandColors): string {
  return `
    @page {
      margin: 18mm 20mm;
      @bottom-center {
        content: counter(page) " of " counter(pages);
        font-size: 9pt;
        color: #9ca3af;
      }
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: 'Segoe UI', Arial, Helvetica, sans-serif;
      font-size: 10.5pt;
      line-height: 1.65;
      color: #2d3748;
      background: white;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 30px 40px;
    }

    /* ===== COVER PAGE ===== */
    .cover-page {
      display: flex;
      flex-direction: column;
      justify-content: center;
      align-items: center;
      min-height: 90vh;
      text-align: center;
      padding: 60px 40px;
    }

    .cover-logo {
      margin-bottom: 40px;
    }

    .cover-logo img {
      max-height: 100px;
      max-width: 280px;
      object-fit: contain;
    }

    .cover-title {
      font-size: 32pt;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: 16px;
      line-height: 1.2;
    }

    .cover-subtitle {
      font-size: 16pt;
      color: #4a5568;
      margin-bottom: 40px;
      font-weight: 400;
    }

    .cover-divider {
      width: 120px;
      height: 3px;
      background: ${colors.primary};
      margin: 0 auto 40px auto;
    }

    .cover-meta {
      font-size: 12pt;
      color: #6b7280;
      line-height: 2;
    }

    .cover-meta strong {
      color: #2d3748;
    }

    .cover-company {
      font-size: 14pt;
      font-weight: 600;
      color: ${colors.primary};
      margin-top: 40px;
    }

    /* ===== HEADINGS ===== */
    h1 {
      font-size: 22pt;
      font-weight: 700;
      color: ${colors.primary};
      margin: 0 0 6mm 0;
      padding-bottom: 3mm;
      border-bottom: 2.5pt solid ${colors.primary};
    }

    h2 {
      font-size: 16pt;
      font-weight: 600;
      color: ${colors.primary};
      margin: 8mm 0 4mm 0;
    }

    h3 {
      font-size: 13pt;
      font-weight: 600;
      color: #2d3748;
      margin: 6mm 0 3mm 0;
    }

    h4 {
      font-size: 11pt;
      font-weight: 600;
      color: #4a5568;
      margin: 4mm 0 2mm 0;
    }

    /* ===== PARAGRAPHS ===== */
    p {
      margin: 0 0 4mm 0;
      text-align: justify;
    }

    /* ===== LISTS ===== */
    ul, ol {
      margin: 2mm 0 5mm 0;
      padding-left: 8mm;
    }

    ul li, ol li {
      margin-bottom: 2mm;
      line-height: 1.55;
    }

    /* ===== TABLES ===== */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4mm 0 6mm 0;
    }

    th {
      background-color: ${colors.primary};
      color: white;
      padding: 3mm;
      text-align: left;
      font-weight: 600;
      font-size: 9.5pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    td {
      padding: 2.5mm 3mm;
      border-bottom: 0.5pt solid #e2e8f0;
      font-size: 10pt;
      vertical-align: top;
    }

    tr:nth-child(even) {
      background-color: #f8fafc;
    }

    /* ===== SECTIONS ===== */
    .section {
      margin-bottom: 8mm;
    }

    .page-break {
      page-break-before: always;
    }

    /* ===== PHASE BLOCKS ===== */
    .phase-block {
      margin: 5mm 0;
      padding: 4mm 5mm;
      border-left: 3pt solid ${colors.secondary};
      background-color: #f8fafc;
      page-break-inside: avoid;
    }

    .phase-header {
      display: flex;
      justify-content: space-between;
      align-items: baseline;
      margin-bottom: 2mm;
    }

    .phase-cost {
      font-size: 12pt;
      font-weight: 700;
      color: ${colors.primary};
    }

    .phase-description {
      text-align: justify;
      margin: 2mm 0 3mm 0;
    }

    .phase-meta {
      display: flex;
      flex-wrap: wrap;
      gap: 4mm;
      margin: 2mm 0;
    }

    .phase-meta-item {
      font-size: 9.5pt;
      color: #4a5568;
    }

    .phase-meta-item strong {
      color: #2d3748;
    }

    .deliverables-list {
      margin: 2mm 0;
      padding-left: 6mm;
    }

    .deliverables-list li {
      font-size: 10pt;
      margin-bottom: 1.5mm;
    }

    /* ===== INFO BOXES ===== */
    .info-box {
      margin: 3mm 0;
      padding: 3mm 4mm;
      border-radius: 2mm;
      font-size: 10pt;
    }

    .info-box-warning {
      background-color: #fffaf0;
      border-left: 2.5pt solid #f6ad55;
    }

    .info-box-danger {
      background-color: #fff5f5;
      border-left: 2.5pt solid #fc8181;
    }

    .info-box-info {
      background-color: #ebf8ff;
      border-left: 2.5pt solid #63b3ed;
    }

    .info-box-success {
      background-color: #f0fff4;
      border-left: 2.5pt solid #68d391;
    }

    /* ===== DETAIL ROWS ===== */
    .detail-row {
      margin: 1.5mm 0;
      padding: 1mm 0;
    }

    .label {
      font-weight: 600;
      display: inline-block;
      min-width: 130pt;
      color: #4a5568;
    }

    .value {
      color: #2d3748;
    }

    /* ===== HEADER (simple quotes) ===== */
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 30px;
      padding-bottom: 16px;
      border-bottom: 2pt solid ${colors.primary};
    }

    .company-info { flex: 1; }

    .company-name {
      font-size: 22px;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: 6px;
    }

    .company-details {
      color: #6b7280;
      font-size: 12px;
    }

    .logo-container { margin-left: 30px; }

    .quote-title { text-align: right; }

    .quote-label {
      font-size: 28px;
      font-weight: 700;
      color: ${colors.primary};
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .quote-ref {
      font-size: 14px;
      color: #6b7280;
      margin-top: 4px;
    }

    .quote-date {
      font-size: 13px;
      color: #6b7280;
      margin-top: 6px;
    }

    /* ===== PARTIES ===== */
    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 30px;
    }

    .party { flex: 1; }

    .party-label {
      font-size: 10pt;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 6px;
    }

    .party-name {
      font-size: 15pt;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .party-details {
      color: #6b7280;
      font-size: 10.5pt;
      line-height: 1.6;
    }

    /* ===== DESCRIPTION BOX ===== */
    .description-box {
      background: #f8fafc;
      padding: 18px 22px;
      border-radius: 6px;
      margin-bottom: 24px;
      border-left: 3pt solid ${colors.primary};
    }

    .description-label {
      font-size: 10pt;
      font-weight: 600;
      color: ${colors.primary};
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    /* ===== ITEMS TABLE ===== */
    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 24px;
    }

    .items-table th {
      background: ${colors.primary};
      color: white;
      padding: 10px 12px;
      text-align: left;
      font-weight: 600;
      font-size: 9.5pt;
      text-transform: uppercase;
      letter-spacing: 0.3px;
    }

    .items-table th:nth-child(3),
    .items-table th:nth-child(4) { text-align: center; }

    .items-table th:nth-child(5),
    .items-table th:nth-child(6) { text-align: right; }

    .items-table td {
      padding: 8px 12px;
      border-bottom: 0.5pt solid #e2e8f0;
      font-size: 10pt;
    }

    .phase-group-header {
      background-color: #edf2f7;
      font-weight: 600;
      font-size: 10.5pt;
      color: ${colors.primary};
    }

    .phase-group-header td {
      padding: 8px 12px;
      border-bottom: 1.5pt solid ${colors.secondary};
    }

    .category-subheader {
      background-color: #f7fafc;
    }

    .category-subheader td {
      font-weight: 600;
      font-size: 9.5pt;
      color: #4a5568;
      font-style: italic;
      padding: 6px 12px 6px 24px;
    }

    /* ===== TOTALS ===== */
    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 30px;
    }

    .totals-table { width: 280px; }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 7px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .totals-row.total {
      border-bottom: none;
      border-top: 2.5px solid ${colors.primary};
      padding-top: 10px;
      margin-top: 6px;
    }

    .totals-label { color: #6b7280; font-size: 10.5pt; }
    .totals-value { font-weight: 500; font-size: 10.5pt; }

    .totals-row.total .totals-label,
    .totals-row.total .totals-value {
      font-size: 16pt;
      font-weight: 700;
      color: ${colors.primary};
    }

    /* ===== TERMS ===== */
    .terms-box {
      background: #f8fafc;
      padding: 18px 22px;
      border-radius: 6px;
      margin-bottom: 24px;
    }

    .terms-label {
      font-size: 10pt;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .terms-content {
      color: #4b5563;
      font-size: 10pt;
      white-space: pre-wrap;
      line-height: 1.7;
    }

    /* ===== VALIDITY ===== */
    .validity {
      background: #fef3c7;
      color: #92400e;
      padding: 10px 18px;
      border-radius: 6px;
      margin-bottom: 24px;
      font-size: 10.5pt;
    }

    /* ===== FOOTER ===== */
    .footer {
      text-align: center;
      padding-top: 24px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 9.5pt;
    }

    /* ===== ASSUMPTIONS / EXCLUSIONS ===== */
    .assumption-item, .exclusion-item {
      padding: 2mm 0;
      border-bottom: 0.5pt solid #f0f0f0;
      font-size: 10pt;
    }

    .assumption-item:last-child, .exclusion-item:last-child {
      border-bottom: none;
    }

    /* ===== COVER LETTER ===== */
    .cover-letter {
      padding: 20px 0;
      line-height: 1.8;
      font-size: 11pt;
    }

    .cover-letter p {
      margin-bottom: 5mm;
      text-align: justify;
    }

    /* ===== CHECKLIST ===== */
    .checklist-item {
      display: flex;
      align-items: flex-start;
      padding: 2mm 0;
      border-bottom: 0.5pt solid #f0f0f0;
    }

    .checklist-icon {
      width: 16pt;
      font-size: 11pt;
      flex-shrink: 0;
    }

    .checklist-text {
      flex: 1;
      font-size: 10pt;
    }

    .checklist-notes {
      font-size: 9pt;
      color: #6b7280;
      font-style: italic;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .container { padding: 20px; }
    }
  `;
}

/**
 * Generate trial watermark CSS and HTML overlay
 */
function getTrialWatermarkCSS(): string {
  return `
    .trial-watermark {
      position: fixed;
      top: 0;
      left: 0;
      width: 100%;
      height: 100%;
      z-index: 9999;
      pointer-events: none;
      display: flex;
      align-items: center;
      justify-content: center;
    }
    .trial-watermark-text {
      font-size: 72pt;
      font-weight: 800;
      color: rgba(220, 38, 38, 0.08);
      transform: rotate(-35deg);
      white-space: nowrap;
      letter-spacing: 8px;
      text-transform: uppercase;
      user-select: none;
    }
    @media print {
      .trial-watermark { position: fixed; }
    }
  `;
}

function getTrialWatermarkHTML(): string {
  return `<div class="trial-watermark"><div class="trial-watermark-text">TRIAL — IdoYourQuotes.com</div></div>`;
}

/**
 * Generate HTML for a professional quote PDF
 * Routes to either simple or comprehensive format based on quote mode
 */
export function generateQuoteHTML(data: PDFQuoteData): string {
  const { quote, trialWatermark } = data;
  const isComprehensive = (quote as any).quoteMode === "comprehensive";

  let html: string;
  if (isComprehensive) {
    html = generateComprehensiveProposalHTML(data);
  } else {
    html = generateSimpleQuoteHTML(data);
  }

  // Inject trial watermark if applicable
  if (trialWatermark) {
    // Inject watermark CSS before </head> and watermark HTML after <body>
    html = html.replace('</head>', `<style>${getTrialWatermarkCSS()}</style></head>`);
    html = html.replace(/<body[^>]*>/, (match) => `${match}${getTrialWatermarkHTML()}`);
  }

  return html;
}

/**
 * Generate HTML for a simple (standard) quote
 */
function generateSimpleQuoteHTML(data: PDFQuoteData): string {
  const { quote, lineItems, user, organization } = data;
  const colors = getBrandColors(organization);

  const lineItemsHTML = lineItems
    .map(
      (item, index) => `
      <tr>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; font-size: 10pt;">${index + 1}</td>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; font-size: 10pt;">${escapeHtml(item.description || "")}</td>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; text-align: center; font-size: 10pt;">${formatQuantity(item.quantity)}</td>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; text-align: center; font-size: 10pt;">${item.unit || "each"}</td>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; text-align: right; font-size: 10pt;">${formatCurrency(item.rate)}</td>
        <td style="padding: 8px 12px; border-bottom: 0.5pt solid #e2e8f0; text-align: right; font-weight: 600; font-size: 10pt;">${formatCurrency(item.total)}</td>
      </tr>
    `
    )
    .join("");

  const logoUrl = organization?.companyLogo || user.companyLogo;
  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" alt="Company Logo" style="max-height: 80px; max-width: 200px; object-fit: contain;" />`
    : "";
  const companyName = user.companyName || organization?.name || user.name || "Your Company";

  return `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Quote ${quote.reference || `Q-${quote.id}`}</title>
  <style>${generateStyles(colors)}</style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        ${logoHTML ? `<div style="margin-bottom: 10px;">${logoHTML}</div>` : ""}
        <div class="company-name">${escapeHtml(companyName)}</div>
        <div class="company-details">
          ${user.companyAddress ? `${escapeHtml(user.companyAddress)}<br>` : ""}
          ${user.companyPhone ? `Tel: ${escapeHtml(user.companyPhone)}<br>` : ""}
          ${user.companyEmail ? `Email: ${escapeHtml(user.companyEmail)}` : ""}
        </div>
      </div>
      <div class="quote-title">
        <div class="quote-label">Quote</div>
        <div class="quote-ref">${quote.reference || `Q-${quote.id}`}</div>
        <div class="quote-date">Date: ${formatDate(quote.createdAt)}</div>
      </div>
    </div>

    <div class="parties">
      <div class="party">
        <div class="party-label">Quote For</div>
        <div class="party-name">${escapeHtml(quote.clientName || "Client")}</div>
        <div class="party-details">
          ${quote.clientAddress ? `${escapeHtml(quote.clientAddress)}<br>` : ""}
          ${quote.clientPhone ? `Tel: ${escapeHtml(quote.clientPhone)}<br>` : ""}
          ${quote.clientEmail ? `Email: ${escapeHtml(quote.clientEmail)}` : ""}
        </div>
      </div>
    </div>

    ${quote.title ? `<h2 style="margin-bottom: 16px;">${escapeHtml(quote.title)}</h2>` : ""}

    ${quote.description ? `
    <div class="description-box">
      <div class="description-label">Description</div>
      <div>${quote.description}</div>
    </div>` : ""}

    ${quote.validUntil ? `
    <div class="validity">
      <strong>Valid Until:</strong> ${formatDate(quote.validUntil)}
    </div>` : ""}

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 36px;">#</th>
          <th>Description</th>
          <th style="width: 70px;">Qty</th>
          <th style="width: 70px;">Unit</th>
          <th style="width: 90px;">Rate</th>
          <th style="width: 110px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${lineItemsHTML}
      </tbody>
    </table>

    <div class="totals">
      <div class="totals-table">
        <div class="totals-row">
          <span class="totals-label">Subtotal</span>
          <span class="totals-value">${formatCurrency(quote.subtotal)}</span>
        </div>
        ${parseFloat(quote.taxRate || "0") > 0 ? `
        <div class="totals-row">
          <span class="totals-label">VAT (${quote.taxRate}%)</span>
          <span class="totals-value">${formatCurrency(quote.taxAmount)}</span>
        </div>` : ""}
        <div class="totals-row total">
          <span class="totals-label">Total</span>
          <span class="totals-value">${formatCurrency(quote.total)}</span>
        </div>
      </div>
    </div>

    ${quote.terms ? `
    <div class="terms-box">
      <div class="terms-label">Terms &amp; Conditions</div>
      <div class="terms-content">${escapeHtml(quote.terms)}</div>
    </div>` : ""}

    ${(() => {
      const assumptions = data.tenderContext?.assumptions;
      const exclusions = data.tenderContext?.exclusions;
      if ((!assumptions || assumptions.length === 0) && (!exclusions || exclusions.length === 0)) return "";
      return `
      <div class="terms-box" style="margin-top: 12pt;">
        ${exclusions && exclusions.length > 0 ? `
        <div class="terms-label">Exclusions</div>
        <div class="terms-content">The following items are excluded from this quotation:
${exclusions.map((e: any) => `• ${escapeHtml(typeof e === "string" ? e : e.text || "")}`).join("\n")}</div>
        ` : ""}
        ${assumptions && assumptions.length > 0 ? `
        <div class="terms-label" style="margin-top: 8pt;">Assumptions</div>
        <div class="terms-content">
${assumptions.map((a: any) => `• ${escapeHtml(typeof a === "string" ? a : a.text || "")}`).join("\n")}</div>
        ` : ""}
      </div>`;
    })()}

    <div class="footer">
      <p>Thank you for your business</p>
    </div>
  </div>
</body>
</html>`;
}


/**
 * Generate HTML for a comprehensive multi-page proposal
 */
function generateComprehensiveProposalHTML(data: PDFQuoteData): string {
  const { quote, lineItems, user, organization, tenderContext } = data;
  const colors = getBrandColors(organization);
  const config = (quote as any).comprehensiveConfig as ComprehensiveConfig | undefined;

  const logoUrl = organization?.companyLogo || user.companyLogo;
  const companyName = user.companyName || organization?.name || user.name || "Your Company";

  // Group line items by phase, then by category within each phase
  const groupedItems = groupLineItemsByPhase(lineItems);

  let html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <title>Proposal - ${escapeHtml(quote.title || quote.reference || `Q-${quote.id}`)}</title>
  <style>${generateStyles(colors)}</style>
</head>
<body>`;

  // ===== PAGE 1: COVER PAGE =====
  html += `
  <div class="cover-page">
    ${logoUrl ? `<div class="cover-logo"><img src="${logoUrl}" alt="Company Logo" /></div>` : ""}
    <div class="cover-title">${escapeHtml(quote.title || "Project Proposal")}</div>
    <div class="cover-divider"></div>
    <div class="cover-subtitle">Comprehensive Project Proposal</div>
    <div class="cover-meta">
      <strong>Prepared for:</strong> ${escapeHtml(quote.clientName || "Client")}<br>
      <strong>Reference:</strong> ${quote.reference || `Q-${quote.id}`}<br>
      <strong>Date:</strong> ${formatDate(quote.createdAt)}<br>
      ${quote.validUntil ? `<strong>Valid Until:</strong> ${formatDate(quote.validUntil)}<br>` : ""}
    </div>
    <div class="cover-company">${escapeHtml(companyName)}</div>
    <div class="company-details" style="margin-top: 8px; text-align: center; color: #6b7280; font-size: 11pt;">
      ${user.companyAddress ? `${escapeHtml(user.companyAddress)}<br>` : ""}
      ${user.companyPhone ? `Tel: ${escapeHtml(user.companyPhone)}` : ""}${user.companyPhone && user.companyEmail ? ` | ` : ""}${user.companyEmail ? `Email: ${escapeHtml(user.companyEmail)}` : ""}
    </div>
  </div>`;

  // ===== PAGE 2: COVER LETTER =====
  const coverLetterContent = config?.sections?.coverLetter?.content;
  if (coverLetterContent) {
    html += `
  <div class="container page-break">
    <div class="parties" style="margin-bottom: 20px;">
      <div class="party">
        <div class="party-label">To</div>
        <div class="party-name">${escapeHtml(quote.clientName || "Client")}</div>
        <div class="party-details">
          ${quote.clientAddress ? `${escapeHtml(quote.clientAddress)}<br>` : ""}
          ${quote.clientEmail ? `Email: ${escapeHtml(quote.clientEmail)}` : ""}
        </div>
      </div>
      <div class="party" style="text-align: right;">
        <div class="party-label">From</div>
        <div class="party-name">${escapeHtml(companyName)}</div>
        <div class="party-details">
          ${user.companyAddress ? `${escapeHtml(user.companyAddress)}<br>` : ""}
          ${user.companyPhone ? `Tel: ${escapeHtml(user.companyPhone)}<br>` : ""}
          ${user.companyEmail ? `Email: ${escapeHtml(user.companyEmail)}` : ""}
        </div>
      </div>
    </div>

    <p style="margin-bottom: 6mm; color: #6b7280;">${formatDate(quote.createdAt)}</p>

    <div class="cover-letter">
      ${formatParagraphs(coverLetterContent)}
    </div>
  </div>`;
  }

  // ===== PAGE 3: EXECUTIVE SUMMARY =====
  html += `
  <div class="container page-break">
    <h1>Executive Summary</h1>

    <div class="parties" style="margin-bottom: 20px;">
      <div class="party">
        <div class="party-label">Client</div>
        <div class="party-name">${escapeHtml(quote.clientName || "Client")}</div>
        <div class="party-details">
          ${quote.clientAddress ? `${escapeHtml(quote.clientAddress)}<br>` : ""}
          ${quote.clientPhone ? `Tel: ${escapeHtml(quote.clientPhone)}<br>` : ""}
          ${quote.clientEmail ? `Email: ${escapeHtml(quote.clientEmail)}` : ""}
        </div>
      </div>
      <div class="party" style="text-align: right;">
        <div class="detail-row"><span class="label">Reference:</span> <span class="value">${quote.reference || `Q-${quote.id}`}</span></div>
        <div class="detail-row"><span class="label">Date:</span> <span class="value">${formatDate(quote.createdAt)}</span></div>
        ${config?.timeline?.estimatedDuration ? `<div class="detail-row"><span class="label">Duration:</span> <span class="value">${config.timeline.estimatedDuration.value} ${config.timeline.estimatedDuration.unit}</span></div>` : ""}
        <div class="detail-row"><span class="label">Total Investment:</span> <span class="value" style="font-weight: 700; font-size: 14pt; color: ${colors.primary};">${formatCurrency(quote.total)}</span></div>
      </div>
    </div>

    ${quote.description ? `<div style="margin-top: 6mm;">${formatParagraphs(quote.description)}</div>` : ""}
  </div>`;

  // ===== SCOPE OF WORKS (Line Items grouped by phase/category) =====
  html += `
  <div class="container page-break">
    <h1>Scope of Works</h1>`;

  if (groupedItems.hasPhases) {
    // Render grouped by phase
    for (const phaseGroup of groupedItems.phases) {
      html += `
    <h2>${escapeHtml(phaseGroup.phase)}</h2>`;

      if (phaseGroup.categories.length > 0) {
        for (const catGroup of phaseGroup.categories) {
          if (catGroup.category) {
            html += `<h3>${escapeHtml(catGroup.category)}</h3>`;
          }
          html += renderLineItemsTable(catGroup.items, colors);
          // Category subtotal
          const catTotal = catGroup.items.reduce((sum, item) => sum + parseFloat(item.total || "0"), 0);
          html += `
    <div style="text-align: right; margin-bottom: 4mm;">
      <span style="font-weight: 600; color: #4a5568; font-size: 10pt;">${catGroup.category ? escapeHtml(catGroup.category) + " " : ""}Subtotal: </span>
      <span style="font-weight: 700; color: ${colors.primary}; font-size: 11pt;">${formatCurrency(catTotal)}</span>
    </div>`;
        }
      }

      // Phase subtotal
      const phaseTotal = phaseGroup.categories.reduce((sum, cat) =>
        sum + cat.items.reduce((s, item) => s + parseFloat(item.total || "0"), 0), 0);
      html += `
    <div style="text-align: right; margin: 4mm 0 8mm 0; padding-top: 3mm; border-top: 1.5pt solid ${colors.primary};">
      <span style="font-weight: 600; color: ${colors.primary}; font-size: 12pt;">${escapeHtml(phaseGroup.phase)} Total: </span>
      <span style="font-weight: 700; color: ${colors.primary}; font-size: 13pt;">${formatCurrency(phaseTotal)}</span>
    </div>`;
    }
  } else {
    // No phases - render flat table
    html += renderLineItemsTable(lineItems, colors);
  }

  // Grand totals
  html += `
    <div class="totals" style="margin-top: 8mm;">
      <div class="totals-table">
        <div class="totals-row">
          <span class="totals-label">Subtotal</span>
          <span class="totals-value">${formatCurrency(quote.subtotal)}</span>
        </div>
        ${parseFloat(quote.taxRate || "0") > 0 ? `
        <div class="totals-row">
          <span class="totals-label">VAT (${quote.taxRate}%)</span>
          <span class="totals-value">${formatCurrency(quote.taxAmount)}</span>
        </div>` : ""}
        <div class="totals-row total">
          <span class="totals-label">Total</span>
          <span class="totals-value">${formatCurrency(quote.total)}</span>
        </div>
      </div>
    </div>
  </div>`;

  // ===== PROJECT TIMELINE =====
  if (config?.timeline?.enabled && config.timeline.phases && config.timeline.phases.length > 0) {
    html += `
  <div class="container page-break">
    <h1>Project Timeline</h1>

    ${config.timeline.estimatedDuration ? `
    <div class="info-box info-box-info">
      <strong>Estimated Project Duration:</strong> ${config.timeline.estimatedDuration.value} ${config.timeline.estimatedDuration.unit}
      ${config.timeline.startDate ? ` | <strong>Start:</strong> ${formatDate(config.timeline.startDate)}` : ""}
      ${config.timeline.endDate ? ` | <strong>Completion:</strong> ${formatDate(config.timeline.endDate)}` : ""}
    </div>` : ""}

    <!-- Timeline overview table -->
    <table style="margin: 6mm 0;">
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Phase</th>
          <th style="width: 100px;">Duration</th>
          <th style="width: 120px;">Resources</th>
          <th style="width: 100px; text-align: right;">Cost</th>
        </tr>
      </thead>
      <tbody>
        ${config.timeline.phases.map((phase, idx) => `
        <tr>
          <td style="font-weight: 600;">${idx + 1}</td>
          <td>${escapeHtml(phase.name)}</td>
          <td>${phase.duration?.value || ""} ${phase.duration?.unit || ""}</td>
          <td>${phase.resources?.manpower ? escapeHtml(phase.resources.manpower) : "-"}</td>
          <td style="text-align: right; font-weight: 600;">${phase.costBreakdown?.total != null ? formatCurrency(phase.costBreakdown.total) : "-"}</td>
        </tr>`).join("")}
      </tbody>
    </table>

    <h2>Detailed Phase Breakdown</h2>

    ${config.timeline.phases.map((phase, idx) => `
    <div class="phase-block">
      <div class="phase-header">
        <h3 style="margin: 0;">Phase ${idx + 1}: ${escapeHtml(phase.name)}</h3>
        ${phase.costBreakdown?.total != null ? `<span class="phase-cost">${formatCurrency(phase.costBreakdown.total)}</span>` : ""}
      </div>

      <p class="phase-description">${escapeHtml(phase.description)}</p>

      <div class="phase-meta">
        <span class="phase-meta-item"><strong>Duration:</strong> ${phase.duration?.value || ""} ${phase.duration?.unit || ""}</span>
        ${phase.resources?.manpower ? `<span class="phase-meta-item"><strong>Team:</strong> ${escapeHtml(phase.resources.manpower)}</span>` : ""}
      </div>

      ${phase.costBreakdown && (phase.costBreakdown.labour || phase.costBreakdown.materials || phase.costBreakdown.equipment) ? `
      <h4>Cost Breakdown</h4>
      <table style="width: 60%; margin: 2mm 0;">
        <tbody>
          ${phase.costBreakdown.labour ? `<tr><td>Labour</td><td style="text-align: right;">${formatCurrency(phase.costBreakdown.labour)}</td></tr>` : ""}
          ${phase.costBreakdown.materials ? `<tr><td>Materials / Hardware</td><td style="text-align: right;">${formatCurrency(phase.costBreakdown.materials)}</td></tr>` : ""}
          ${phase.costBreakdown.equipment ? `<tr><td>Equipment / Licensing</td><td style="text-align: right;">${formatCurrency(phase.costBreakdown.equipment)}</td></tr>` : ""}
          <tr style="border-top: 1.5pt solid ${colors.primary};"><td style="font-weight: 700;">Phase Total</td><td style="text-align: right; font-weight: 700;">${formatCurrency(phase.costBreakdown.total)}</td></tr>
        </tbody>
      </table>` : ""}

      ${phase.resources?.equipment && phase.resources.equipment.length > 0 ? `
      <h4>Equipment Required</h4>
      <ul>${phase.resources.equipment.map(e => `<li>${escapeHtml(e)}</li>`).join("")}</ul>` : ""}

      ${phase.resources?.materials && phase.resources.materials.length > 0 ? `
      <h4>Materials Required</h4>
      <ul>${phase.resources.materials.map(m => `<li>${escapeHtml(m)}</li>`).join("")}</ul>` : ""}

      ${phase.dependencies && phase.dependencies.length > 0 ? `
      <div class="info-box info-box-danger">
        <h4 style="margin: 0 0 2mm 0;">Prerequisites</h4>
        <ul style="margin: 0; padding-left: 6mm;">
          ${phase.dependencies.map((dep: string) => `<li>${escapeHtml(dep)}</li>`).join("")}
        </ul>
      </div>` : ""}

      ${phase.riskFactors && phase.riskFactors.length > 0 ? `
      <div class="info-box info-box-warning">
        <h4 style="margin: 0 0 2mm 0;">Risk Factors</h4>
        <ul style="margin: 0; padding-left: 6mm;">
          ${phase.riskFactors.map((risk: string) => `<li>${escapeHtml(risk)}</li>`).join("")}
        </ul>
      </div>` : ""}

      ${(phase as any).deliverables && (phase as any).deliverables.length > 0 ? `
      <div class="info-box info-box-success">
        <h4 style="margin: 0 0 2mm 0;">Deliverables</h4>
        <ul class="deliverables-list" style="margin: 0;">
          ${(phase as any).deliverables.map((d: string) => `<li>${escapeHtml(d)}</li>`).join("")}
        </ul>
      </div>` : ""}
    </div>
    `).join("\n")}
  </div>`;
  }

  // ===== SITE REQUIREMENTS =====
  const siteData = config?.sections?.siteRequirements;
  if (siteData?.enabled && siteData.data) {
    const sd = siteData.data;
    const hasSiteContent = sd.workingHours || (sd.accessRestrictions && sd.accessRestrictions.length > 0) ||
      (sd.safetyRequirements && sd.safetyRequirements.length > 0) || sd.parkingStorage ||
      (sd.permitNeeds && sd.permitNeeds.length > 0) || (sd.constraints && sd.constraints.length > 0);

    if (hasSiteContent) {
      html += `
  <div class="container page-break">
    <h1>Site Requirements</h1>

    ${sd.workingHours ? `
    <div class="detail-row">
      <span class="label">Working Hours:</span>
      <span class="value">${escapeHtml(sd.workingHours.start)} - ${escapeHtml(sd.workingHours.end)} (${escapeHtml(sd.workingHours.days)})</span>
    </div>` : ""}

    ${sd.parkingStorage ? `
    <div class="detail-row">
      <span class="label">Parking / Storage:</span>
      <span class="value">${escapeHtml(sd.parkingStorage)}</span>
    </div>` : ""}

    ${sd.accessRestrictions && sd.accessRestrictions.length > 0 ? `
    <h2>Access Restrictions</h2>
    <ul>${sd.accessRestrictions.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}

    ${sd.safetyRequirements && sd.safetyRequirements.length > 0 ? `
    <h2>Safety Requirements</h2>
    <ul>${sd.safetyRequirements.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}

    ${sd.permitNeeds && sd.permitNeeds.length > 0 ? `
    <h2>Permits Required</h2>
    <ul>${sd.permitNeeds.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}

    ${sd.constraints && sd.constraints.length > 0 ? `
    <h2>Constraints</h2>
    <ul>${sd.constraints.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
  </div>`;
    }
  }

  // ===== QUALITY & COMPLIANCE =====
  const qualityData = config?.sections?.qualityCompliance;
  if (qualityData?.enabled && qualityData.data) {
    const qd = qualityData.data;
    const hasQualityContent = (qd.requiredStandards && qd.requiredStandards.length > 0) ||
      (qd.certifications && qd.certifications.length > 0) ||
      (qd.inspectionPoints && qd.inspectionPoints.length > 0) ||
      (qd.testingSchedule && qd.testingSchedule.length > 0);

    if (hasQualityContent) {
      html += `
  <div class="container page-break">
    <h1>Quality and Compliance</h1>

    ${qd.requiredStandards && qd.requiredStandards.length > 0 ? `
    <h2>Required Standards</h2>
    <ul>${qd.requiredStandards.map(s => `<li>${escapeHtml(s)}</li>`).join("")}</ul>` : ""}

    ${qd.certifications && qd.certifications.length > 0 ? `
    <h2>Certifications</h2>
    <table>
      <thead>
        <tr>
          <th>Certification</th>
          <th style="width: 100px;">Status</th>
          <th>Provided By</th>
        </tr>
      </thead>
      <tbody>
        ${qd.certifications.map(c => `
        <tr>
          <td>${escapeHtml(c.name)}</td>
          <td>${c.required ? "Required" : "Optional"}</td>
          <td>${c.providedBy ? escapeHtml(c.providedBy) : "-"}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

    ${qd.inspectionPoints && qd.inspectionPoints.length > 0 ? `
    <h2>Inspection Points</h2>
    <table>
      <thead>
        <tr>
          <th>Phase</th>
          <th>Description</th>
        </tr>
      </thead>
      <tbody>
        ${qd.inspectionPoints.map(p => `
        <tr>
          <td>${escapeHtml(p.phase)}</td>
          <td>${escapeHtml(p.description)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

    ${qd.testingSchedule && qd.testingSchedule.length > 0 ? `
    <h2>Testing Schedule</h2>
    <table>
      <thead>
        <tr>
          <th>Test</th>
          <th>Timing</th>
          <th>Responsibility</th>
        </tr>
      </thead>
      <tbody>
        ${qd.testingSchedule.map(t => `
        <tr>
          <td>${escapeHtml(t.test)}</td>
          <td>${escapeHtml(t.timing)}</td>
          <td>${escapeHtml(t.responsibility)}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}
  </div>`;
    }
  }

  // ===== TECHNICAL REVIEW =====
  const techData = config?.sections?.technicalReview;
  if (techData?.enabled && techData.data) {
    const td = techData.data;
    const hasTechContent = (td.specialRequirements && td.specialRequirements.length > 0) ||
      (td.inspectionRequirements && td.inspectionRequirements.length > 0) ||
      (td.checklist && td.checklist.length > 0) ||
      (td.materialTypes && td.materialTypes.length > 0);

    if (hasTechContent) {
      html += `
  <div class="container page-break">
    <h1>Technical Review</h1>

    ${td.specialRequirements && td.specialRequirements.length > 0 ? `
    <h2>Technical Requirements</h2>
    <ul>${td.specialRequirements.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}

    ${td.materialTypes && td.materialTypes.length > 0 ? `
    <h2>Material Schedule</h2>
    <table>
      <thead>
        <tr>
          <th>Item</th>
          <th>Specification</th>
          <th>Grade</th>
          <th>Quantity</th>
        </tr>
      </thead>
      <tbody>
        ${td.materialTypes.map(m => `
        <tr>
          <td>${escapeHtml(m.item)}</td>
          <td>${escapeHtml(m.specification)}</td>
          <td>${m.grade ? escapeHtml(m.grade) : "-"}</td>
          <td>${m.quantity ? escapeHtml(m.quantity) : "-"}</td>
        </tr>`).join("")}
      </tbody>
    </table>` : ""}

    ${td.checklist && td.checklist.length > 0 ? `
    <h2>Technical Checklist</h2>
    ${td.checklist.map(item => `
    <div class="checklist-item">
      <span class="checklist-icon">${item.status === "yes" ? "&#9745;" : item.status === "no" ? "&#9746;" : "&#9744;"}</span>
      <span class="checklist-text">
        ${escapeHtml(item.item)}
        ${item.notes ? `<br><span class="checklist-notes">${escapeHtml(item.notes)}</span>` : ""}
      </span>
    </div>`).join("")}` : ""}

    ${td.inspectionRequirements && td.inspectionRequirements.length > 0 ? `
    <h2>Inspection Requirements</h2>
    <ul>${td.inspectionRequirements.map(r => `<li>${escapeHtml(r)}</li>`).join("")}</ul>` : ""}
  </div>`;
    }
  }

  // ===== ASSUMPTIONS & EXCLUSIONS =====
  const assumptions = tenderContext?.assumptions;
  const exclusions = tenderContext?.exclusions;
  if ((assumptions && assumptions.length > 0) || (exclusions && exclusions.length > 0)) {
    html += `
  <div class="container page-break">
    <h1>Assumptions and Exclusions</h1>

    ${assumptions && assumptions.length > 0 ? `
    <h2>Assumptions</h2>
    <p>The following assumptions have been made in preparing this proposal. Should any of these assumptions prove incorrect, the scope and pricing may need to be adjusted.</p>
    <ol>
      ${assumptions.map((a: any) => `<li class="assumption-item">${escapeHtml(typeof a === "string" ? a : a.text || "")}</li>`).join("")}
    </ol>` : ""}

    ${exclusions && exclusions.length > 0 ? `
    <h2>Exclusions</h2>
    <p>The following items are explicitly excluded from this proposal. If any of these items are required, they can be quoted separately.</p>
    <ol>
      ${exclusions.map((e: any) => `<li class="exclusion-item">${escapeHtml(typeof e === "string" ? e : e.text || "")}</li>`).join("")}
    </ol>` : ""}
  </div>`;
  }

  // ===== TERMS & CONDITIONS =====
  if (quote.terms) {
    html += `
  <div class="container page-break">
    <h1>Terms and Conditions</h1>
    <div class="terms-content" style="line-height: 1.8;">${escapeHtml(quote.terms)}</div>
  </div>`;
  }

  // ===== FINANCIAL SUMMARY (final page) =====
  html += `
  <div class="container page-break">
    <h1>Financial Summary</h1>

    <table style="margin: 6mm 0;">
      <thead>
        <tr>
          <th>Description</th>
          <th style="text-align: right; width: 140px;">Amount</th>
        </tr>
      </thead>
      <tbody>`;

  if (groupedItems.hasPhases) {
    for (const phaseGroup of groupedItems.phases) {
      const phaseTotal = phaseGroup.categories.reduce((sum, cat) =>
        sum + cat.items.reduce((s, item) => s + parseFloat(item.total || "0"), 0), 0);
      html += `
        <tr>
          <td style="font-weight: 600;">${escapeHtml(phaseGroup.phase)}</td>
          <td style="text-align: right; font-weight: 600;">${formatCurrency(phaseTotal)}</td>
        </tr>`;
    }
  } else {
    html += `
        <tr>
          <td style="font-weight: 600;">All Works</td>
          <td style="text-align: right; font-weight: 600;">${formatCurrency(quote.subtotal)}</td>
        </tr>`;
  }

  html += `
      </tbody>
    </table>

    <div class="totals" style="margin-top: 10mm;">
      <div class="totals-table" style="width: 320px;">
        <div class="totals-row">
          <span class="totals-label">Subtotal (excl. VAT)</span>
          <span class="totals-value">${formatCurrency(quote.subtotal)}</span>
        </div>
        ${parseFloat(quote.taxRate || "0") > 0 ? `
        <div class="totals-row">
          <span class="totals-label">VAT @ ${quote.taxRate}%</span>
          <span class="totals-value">${formatCurrency(quote.taxAmount)}</span>
        </div>` : ""}
        <div class="totals-row total">
          <span class="totals-label">Total Investment</span>
          <span class="totals-value">${formatCurrency(quote.total)}</span>
        </div>
      </div>
    </div>

    ${quote.validUntil ? `
    <div class="validity" style="margin-top: 10mm;">
      This proposal is valid until <strong>${formatDate(quote.validUntil)}</strong>. After this date, pricing may be subject to revision.
    </div>` : ""}

    <div class="footer" style="margin-top: 20mm;">
      <p style="font-size: 11pt; color: #2d3748; font-weight: 600;">Thank you for considering ${escapeHtml(companyName)}</p>
      <p style="margin-top: 6px;">We look forward to working with you on this project.</p>
    </div>
  </div>`;

  html += `
</body>
</html>`;

  return html;
}


// ===== HELPER FUNCTIONS =====

/**
 * Format a text string into HTML paragraphs.
 * Splits on double newlines or treats the whole thing as one paragraph if no breaks.
 */
function formatParagraphs(text: string): string {
  if (!text) return "";
  // Split on double newlines, or on single newlines if that's all we have
  const paragraphs = text.split(/\n\n+/).filter(p => p.trim());
  if (paragraphs.length <= 1) {
    // Try splitting on single newlines
    const lines = text.split(/\n/).filter(l => l.trim());
    if (lines.length > 1) {
      return lines.map(l => `<p>${l.trim()}</p>`).join("\n");
    }
  }
  return paragraphs.map(p => `<p>${p.trim()}</p>`).join("\n");
}

/**
 * Group line items by phase, then by category within each phase
 */
function groupLineItemsByPhase(lineItems: QuoteLineItem[]): {
  hasPhases: boolean;
  phases: Array<{
    phase: string;
    categories: Array<{
      category: string;
      items: QuoteLineItem[];
    }>;
  }>;
} {
  const hasPhases = lineItems.some(item => item.phaseId);
  if (!hasPhases) {
    return { hasPhases: false, phases: [] };
  }

  const phaseMap = new Map<string, Map<string, QuoteLineItem[]>>();

  for (const item of lineItems) {
    const phase = item.phaseId || "Other";
    const category = item.category || "";

    if (!phaseMap.has(phase)) {
      phaseMap.set(phase, new Map());
    }
    const catMap = phaseMap.get(phase)!;
    if (!catMap.has(category)) {
      catMap.set(category, []);
    }
    catMap.get(category)!.push(item);
  }

  const phases: Array<{
    phase: string;
    categories: Array<{ category: string; items: QuoteLineItem[] }>;
  }> = [];

  Array.from(phaseMap.entries()).forEach(([phase, catMap]) => {
    const categories: Array<{ category: string; items: QuoteLineItem[] }> = [];
    Array.from(catMap.entries()).forEach(([category, items]) => {
      categories.push({ category, items });
    });
    phases.push({ phase, categories });
  });

  return { hasPhases: true, phases };
}

/**
 * Render a table of line items
 */
function renderLineItemsTable(items: QuoteLineItem[], colors: BrandColors): string {
  return `
    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 30px;">#</th>
          <th>Description</th>
          <th style="width: 65px;">Qty</th>
          <th style="width: 65px;">Unit</th>
          <th style="width: 85px;">Rate</th>
          <th style="width: 100px;">Amount</th>
        </tr>
      </thead>
      <tbody>
        ${items.map((item, idx) => `
        <tr>
          <td style="font-size: 10pt;">${idx + 1}</td>
          <td style="font-size: 10pt;">${escapeHtml(item.description || "")}</td>
          <td style="text-align: center; font-size: 10pt;">${formatQuantity(item.quantity)}</td>
          <td style="text-align: center; font-size: 10pt;">${item.unit || "each"}</td>
          <td style="text-align: right; font-size: 10pt;">${formatCurrency(item.rate)}</td>
          <td style="text-align: right; font-weight: 600; font-size: 10pt;">${formatCurrency(item.total)}</td>
        </tr>`).join("")}
      </tbody>
    </table>`;
}
