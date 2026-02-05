// PDF Generation for Quotes
// Uses PDFKit-style HTML generation for clean, professional quotes

import { Quote, QuoteLineItem, User, Organization } from "../drizzle/schema";

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
  const defaultPrimary = '#0d6a6a'; // Teal
  const defaultSecondary = '#0a5454'; // Darker teal
  
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
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${index + 1}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb;">${item.description || ""}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.quantity || "1"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: center;">${item.unit || "each"}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right;">${formatCurrency(item.rate)}</td>
        <td style="padding: 12px; border-bottom: 1px solid #e5e7eb; text-align: right; font-weight: 500;">${formatCurrency(item.total)}</td>
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
  // This ensures changes in Settings are reflected on PDFs
  const companyName = user.companyName || organization?.name || user.name || "Your Company";

  const html = `
<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Quote ${quote.reference || `Q-${quote.id}`}</title>
  <style>
    * {
      margin: 0;
      padding: 0;
      box-sizing: border-box;
    }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
      font-size: 14px;
      line-height: 1.5;
      color: #1f2937;
      background: white;
    }
    .container {
      max-width: 800px;
      margin: 0 auto;
      padding: 40px;
    }
    .header {
      display: flex;
      justify-content: space-between;
      align-items: flex-start;
      margin-bottom: 40px;
      padding-bottom: 20px;
      border-bottom: 2px solid ${colors.primary};
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
      background: #f9fafb;
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
      font-size: 13px;
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
      background: #f9fafb;
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
      <strong>Valid Until:</strong> ${formatDate(quote.validUntil)}
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
