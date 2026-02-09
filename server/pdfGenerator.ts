// PDF Generation for Quotes
// Uses PDFKit-style HTML generation for clean, professional quotes

import { Quote, QuoteLineItem, User, Organization, ComprehensiveConfig } from "../drizzle/schema";

interface PDFQuoteData {
  quote: Quote;
  lineItems: QuoteLineItem[];
  user: User;
  organization?: Organization | null;
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

/**
 * Generate HTML for a professional quote PDF
 * This HTML can be converted to PDF using a headless browser or PDF library
 */
export function generateQuoteHTML(data: PDFQuoteData): string {
  const { quote, lineItems, user, organization } = data;
  const colors = getBrandColors(organization);

  const formatCurrency = (value: string | null | undefined): string => {
    const num = parseFloat(value || "0");
    return new Intl.NumberFormat("en-GB", {
      style: "currency",
      currency: "GBP",
    }).format(num);
  };

  const formatDate = (date: Date | null | undefined): string => {
    if (!date) return "";
    return new Date(date).toLocaleDateString("en-GB", {
      day: "numeric",
      month: "long",
      year: "numeric",
    });
  };

  const lineItemsHTML = lineItems
    .map(
      (item, index) => `
      <tr>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; font-size: 10pt;">${index + 1}</td>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; font-size: 10pt;">${item.description || ""}</td>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; text-align: center; font-size: 10pt;">${item.quantity || "1"}</td>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; text-align: center; font-size: 10pt;">${item.unit || "each"}</td>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; text-align: right; font-size: 10pt;">${formatCurrency(item.rate)}</td>
        <td style="padding: 10px 12px; border-bottom: 1pt solid #e2e8f0; text-align: right; font-weight: 600; font-size: 10pt;">${formatCurrency(item.total)}</td>
      </tr>
    `
    )
    .join("");

  // Use organization logo if available, otherwise fall back to user logo
  const logoUrl = organization?.companyLogo || user.companyLogo;
  const logoHTML = logoUrl
    ? `<img src="${logoUrl}" alt="Company Logo" style="max-height: 80px; max-width: 200px; object-fit: contain;" />`
    : "";

  // Priority: user's company name from Settings > organization name > user's name
  const companyName = user.companyName || organization?.name || user.name || "Your Company";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote ${quote.reference || `Q-${quote.id}`}</title>
  <style>
    @page {
      margin: 20mm;
    }

    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }

    body {
      font-family: Arial, Helvetica, sans-serif;
      font-size: 11pt;
      line-height: 1.6;
      color: #2d3748;
      background: white;
    }

    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }

    /* HEADINGS - Clean hierarchy */
    h1 {
      font-size: 24pt;
      font-weight: 600;
      color: ${colors.primary};
      margin: 0 0 8mm 0;
      padding: 0;
      border-bottom: 2pt solid ${colors.primary};
      padding-bottom: 3mm;
    }

    h2 {
      font-size: 18pt;
      font-weight: 600;
      color: ${colors.primary};
      margin: 8mm 0 4mm 0;
      padding: 0;
    }

    h3 {
      font-size: 14pt;
      font-weight: 600;
      color: #2d3748;
      margin: 6mm 0 3mm 0;
      padding: 0;
    }

    h4 {
      font-size: 12pt;
      font-weight: 600;
      color: #4a5568;
      margin: 4mm 0 2mm 0;
      padding: 0;
    }

    /* PARAGRAPHS - Natural flow */
    p {
      margin: 0 0 4mm 0;
      text-align: justify;
    }

    /* LISTS - Clean bullets */
    ul {
      margin: 3mm 0 4mm 0;
      padding-left: 8mm;
    }

    ul li {
      margin-bottom: 2mm;
      line-height: 1.5;
    }

    /* LABELS */
    .label {
      font-weight: 600;
      display: inline-block;
      min-width: 120pt;
    }

    .value {
      font-weight: normal;
    }

    /* TABLES - Professional, clean borders */
    table {
      width: 100%;
      border-collapse: collapse;
      margin: 4mm 0;
    }

    th {
      background-color: ${colors.primary};
      color: white;
      padding: 3mm;
      text-align: left;
      font-weight: 600;
      font-size: 10pt;
    }

    td {
      padding: 2.5mm 3mm;
      border-bottom: 1pt solid #e2e8f0;
      font-size: 10pt;
    }

    tr:nth-child(even) {
      background-color: #f7fafc;
    }

    /* SECTIONS */
    .section {
      margin-bottom: 10mm;
    }

    .page-break {
      page-break-before: always;
    }

    /* PHASE BLOCKS */
    .phase-block {
      margin: 5mm 0;
      padding: 4mm;
      border-left: 3pt solid ${colors.secondary};
      background-color: #f7fafc;
    }

    .phase-description {
      text-align: justify;
      margin: 3mm 0;
    }

    .prerequisites {
      margin: 3mm 0;
      padding: 3mm;
      background-color: #fff5f5;
      border-left: 2pt solid #fc8181;
    }

    .risk-factors {
      margin: 3mm 0;
      padding: 3mm;
      background-color: #fffaf0;
      border-left: 2pt solid #f6ad55;
    }

    /* DETAIL ROWS */
    .detail-row {
      margin: 2mm 0;
      padding: 2mm 0;
    }

    .detail-row .label {
      font-weight: 600;
      color: #4a5568;
    }

    .detail-row .value {
      color: #2d3748;
    }

    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2pt solid ${colors.primary};
    }

    .company-info {
      flex: 1;
    }

    .company-name {
      font-size: 24px;
      font-weight: 700;
      color: ${colors.primary};
      margin-bottom: 8px;
    }

    .company-details {
      color: #6b7280;
      font-size: 13px;
    }

    .logo-container {
      margin-left: 40px;
    }

    .quote-title {
      text-align: right;
    }

    .quote-label {
      font-size: 32px;
      font-weight: 700;
      color: ${colors.primary};
      text-transform: uppercase;
      letter-spacing: 2px;
    }

    .quote-ref {
      font-size: 16px;
      color: #6b7280;
      margin-top: 4px;
    }

    .quote-date {
      font-size: 14px;
      color: #6b7280;
      margin-top: 8px;
    }

    .parties {
      display: flex;
      justify-content: space-between;
      margin-bottom: 40px;
    }

    .party {
      flex: 1;
    }

    .party-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .party-name {
      font-size: 18px;
      font-weight: 600;
      color: #1f2937;
      margin-bottom: 4px;
    }

    .party-details {
      color: #6b7280;
      font-size: 13px;
    }

    .description {
      background: #f7fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }

    .description-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .items-table {
      width: 100%;
      border-collapse: collapse;
      margin-bottom: 30px;
    }

    .items-table th {
      background: ${colors.primary};
      color: white;
      padding: 12px;
      text-align: left;
      font-weight: 600;
      font-size: 10pt;
      text-transform: uppercase;
      letter-spacing: 0.5px;
    }

    .items-table th:nth-child(3),
    .items-table th:nth-child(4) {
      text-align: center;
    }

    .items-table th:nth-child(5),
    .items-table th:nth-child(6) {
      text-align: right;
    }

    .totals {
      display: flex;
      justify-content: flex-end;
      margin-bottom: 40px;
    }

    .totals-table {
      width: 300px;
    }

    .totals-row {
      display: flex;
      justify-content: space-between;
      padding: 8px 0;
      border-bottom: 1px solid #e5e7eb;
    }

    .totals-row.total {
      border-bottom: none;
      border-top: 2px solid ${colors.primary};
      padding-top: 12px;
      margin-top: 8px;
    }

    .totals-label {
      color: #6b7280;
    }

    .totals-value {
      font-weight: 500;
    }

    .totals-row.total .totals-label,
    .totals-row.total .totals-value {
      font-size: 18px;
      font-weight: 700;
      color: ${colors.primary};
    }

    .terms {
      background: #f7fafc;
      padding: 20px;
      border-radius: 8px;
      margin-bottom: 30px;
    }

    .terms-label {
      font-size: 12px;
      font-weight: 600;
      color: #6b7280;
      text-transform: uppercase;
      letter-spacing: 1px;
      margin-bottom: 8px;
    }

    .terms-content {
      color: #4b5563;
      font-size: 13px;
      white-space: pre-wrap;
    }

    .footer {
      text-align: center;
      padding-top: 30px;
      border-top: 1px solid #e5e7eb;
      color: #9ca3af;
      font-size: 12px;
    }

    .validity {
      background: #fef3c7;
      color: #92400e;
      padding: 12px 20px;
      border-radius: 8px;
      margin-bottom: 30px;
      font-size: 13px;
    }

    @media print {
      body {
        print-color-adjust: exact;
        -webkit-print-color-adjust: exact;
      }
      .container {
        padding: 20px;
      }
    }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <div class="company-info">
        ${logoHTML ? `<div class="logo-container" style="margin-bottom: 12px;">${logoHTML}</div>` : ""}
        <div class="company-name">${companyName}</div>
        <div class="company-details">
          ${user.companyAddress ? `${user.companyAddress}<br>` : ""}
          ${user.companyPhone ? `Tel: ${user.companyPhone}<br>` : ""}
          ${user.companyEmail ? `Email: ${user.companyEmail}` : ""}
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
        <div class="party-name">${quote.clientName || "Client"}</div>
        <div class="party-details">
          ${quote.clientAddress ? `${quote.clientAddress}<br>` : ""}
          ${quote.clientPhone ? `Tel: ${quote.clientPhone}<br>` : ""}
          ${quote.clientEmail ? `Email: ${quote.clientEmail}` : ""}
        </div>
      </div>
    </div>

    ${
      quote.description
        ? `
    <div class="description">
      <div class="description-label">Description</div>
      <div>${quote.description}</div>
    </div>
    `
        : ""
    }

    ${
      quote.validUntil
        ? `
    <div class="validity">
      <span class="label">Valid Until:</span> ${formatDate(quote.validUntil)}
    </div>
    `
        : ""
    }

    <table class="items-table">
      <thead>
        <tr>
          <th style="width: 40px;">#</th>
          <th>Description</th>
          <th style="width: 80px;">Qty</th>
          <th style="width: 80px;">Unit</th>
          <th style="width: 100px;">Rate</th>
          <th style="width: 120px;">Amount</th>
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
        ${
          parseFloat(quote.taxRate || "0") > 0
            ? `
        <div class="totals-row">
          <span class="totals-label">VAT (${quote.taxRate}%)</span>
          <span class="totals-value">${formatCurrency(quote.taxAmount)}</span>
        </div>
        `
            : ""
        }
        <div class="totals-row total">
          <span class="totals-label">Total</span>
          <span class="totals-value">${formatCurrency(quote.total)}</span>
        </div>
      </div>
    </div>

    ${
      quote.terms
        ? `
    <div class="terms">
      <div class="terms-label">Terms & Conditions</div>
      <div class="terms-content">${quote.terms}</div>
    </div>
    `
        : ""
    }

    ${generateComprehensiveSections(quote, colors)}

    <div class="footer">
      <p>Thank you for your business</p>
      <p style="margin-top: 8px;">Generated by IdoYourQuotes</p>
    </div>
  </div>
</body>
</html>
`;

  return html;
}

/**
 * Generate additional HTML sections for comprehensive quotes.
 * Uses professional formatting with clean heading hierarchy,
 * no mid-sentence bolding, and natural paragraph flow.
 */
function generateComprehensiveSections(quote: Quote, colors: BrandColors): string {
  if ((quote as any).quoteMode !== "comprehensive") return "";
  
  const config = (quote as any).comprehensiveConfig as ComprehensiveConfig | undefined;
  if (!config) return "";

  let html = "";

  // Timeline section
  if (config.timeline?.enabled && config.timeline.phases && config.timeline.phases.length > 0) {
    html += `
    <div class="section page-break">
      <h2>Project Timeline</h2>
      
      ${config.timeline.estimatedDuration ? `
      <div class="detail-row">
        <span class="label">Estimated Duration:</span>
        <span class="value">${config.timeline.estimatedDuration.value} ${config.timeline.estimatedDuration.unit}</span>
      </div>` : ""}
      ${config.timeline.startDate ? `
      <div class="detail-row">
        <span class="label">Start Date:</span>
        <span class="value">${new Date(config.timeline.startDate).toLocaleDateString('en-GB')}</span>
      </div>` : ""}
      ${config.timeline.endDate ? `
      <div class="detail-row">
        <span class="label">Completion Date:</span>
        <span class="value">${new Date(config.timeline.endDate).toLocaleDateString('en-GB')}</span>
      </div>` : ""}

      <h3>Phased Programme</h3>
      
      ${config.timeline.phases.map((phase, idx) => `
      <div class="phase-block">
        <h4>Phase ${idx + 1}: ${phase.name}</h4>
        
        <p class="phase-description">${phase.description}</p>
        
        <div class="detail-row">
          <span class="label">Duration:</span>
          <span class="value">${phase.duration?.value || ""} ${phase.duration?.unit || ""}</span>
        </div>
        ${phase.resources?.manpower ? `
        <div class="detail-row">
          <span class="label">Resources:</span>
          <span class="value">${phase.resources.manpower}</span>
        </div>` : ""}
        ${phase.costBreakdown?.total != null ? `
        <div class="detail-row">
          <span class="label">Cost:</span>
          <span class="value">\u00A3${phase.costBreakdown.total.toLocaleString()}</span>
        </div>` : ""}
        
        ${phase.dependencies && phase.dependencies.length > 0 ? `
        <div class="prerequisites">
          <h4 style="margin-bottom: 2mm;">Prerequisites</h4>
          <ul>
            ${phase.dependencies.map((dep: string) => `<li>${dep}</li>`).join("")}
          </ul>
        </div>` : ""}
        
        ${phase.riskFactors && phase.riskFactors.length > 0 ? `
        <div class="risk-factors">
          <h4 style="margin-bottom: 2mm;">Risk Factors</h4>
          <ul>
            ${phase.riskFactors.map((risk: string) => `<li>${risk}</li>`).join("")}
          </ul>
        </div>` : ""}
      </div>
      `).join("\n")}
    </div>`;
  }

  // Site Requirements section
  const siteData = config.sections?.siteRequirements;
  if (siteData?.enabled && siteData.data) {
    const sd = siteData.data;
    html += `
    <div class="section">
      <h2>Site Requirements</h2>
      ${sd.workingHours ? `
      <div class="detail-row">
        <span class="label">Working Hours:</span>
        <span class="value">${sd.workingHours.start} - ${sd.workingHours.end} (${sd.workingHours.days})</span>
      </div>` : ""}
      ${sd.accessRestrictions && sd.accessRestrictions.length > 0 ? `
      <h3>Access Restrictions</h3>
      <ul>
        ${sd.accessRestrictions.map(r => `<li>${r}</li>`).join("")}
      </ul>` : ""}
      ${sd.safetyRequirements && sd.safetyRequirements.length > 0 ? `
      <h3>Safety Requirements</h3>
      <ul>
        ${sd.safetyRequirements.map(r => `<li>${r}</li>`).join("")}
      </ul>` : ""}
    </div>`;
  }

  // Quality & Compliance section
  const qualityData = config.sections?.qualityCompliance;
  if (qualityData?.enabled && qualityData.data) {
    const qd = qualityData.data;
    html += `
    <div class="section">
      <h2>Quality and Compliance</h2>
      ${qd.requiredStandards && qd.requiredStandards.length > 0 ? `
      <h3>Required Standards</h3>
      <ul>
        ${qd.requiredStandards.map(s => `<li>${s}</li>`).join("")}
      </ul>` : ""}
      ${qd.certifications && qd.certifications.length > 0 ? `
      <h3>Certifications</h3>
      <table>
        <thead>
          <tr>
            <th>Certification</th>
            <th>Status</th>
          </tr>
        </thead>
        <tbody>
          ${qd.certifications.map(c => `
          <tr>
            <td>${c.name}</td>
            <td>${c.required ? 'Required' : 'Optional'}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}
      ${qd.inspectionPoints && qd.inspectionPoints.length > 0 ? `
      <h3>Inspection Points</h3>
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
            <td>${p.phase}</td>
            <td>${p.description}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}
    </div>`;
  }

  // Technical Review section
  const techData = config.sections?.technicalReview;
  if (techData?.enabled && techData.data) {
    const td = techData.data;
    html += `
    <div class="section">
      <h2>Technical Review</h2>
      ${td.materialTypes && td.materialTypes.length > 0 ? `
      <h3>Material Schedule</h3>
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
            <td>${m.item}</td>
            <td>${m.specification}</td>
            <td>${m.grade || ''}</td>
            <td>${m.quantity || ''}</td>
          </tr>`).join("")}
        </tbody>
      </table>` : ""}
      ${td.specialRequirements && td.specialRequirements.length > 0 ? `
      <h3>Special Requirements</h3>
      <ul>
        ${td.specialRequirements.map(r => `<li>${r}</li>`).join("")}
      </ul>` : ""}
      ${td.inspectionRequirements && td.inspectionRequirements.length > 0 ? `
      <h3>Inspection Requirements</h3>
      <ul>
        ${td.inspectionRequirements.map(r => `<li>${r}</li>`).join("")}
      </ul>` : ""}
    </div>`;
  }

  return html;
}
