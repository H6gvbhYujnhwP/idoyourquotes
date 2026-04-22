/**
 * Website & Digital Marketing — Demo Quote Factory
 *
 * Returns a canonical "(Example)" quote for a small business brand launch:
 * new business website + logo + launch content + ongoing hosting, care,
 * and local SEO. Mixes one-off project work with monthly recurring
 * retainers — the classic agency engagement shape.
 *
 * Every line-item `name` here matches an entry in
 * `WEBSITE_MARKETING_CATALOG_SEED` byte-for-byte. See the IT demo for the
 * full factory-contract rationale; this file follows the same shape.
 */

import type { DemoQuoteFactory, DemoQuoteBundle, CoreDemoLineItem } from "./index";
import { enrichDemoLineItem } from "./index";

const CLIENT_NAME = "Thornley Landscapes Ltd";
const CONTACT_NAME = "James Thornley";

export const getDemoQuote: DemoQuoteFactory = (): DemoQuoteBundle => {
  const today = new Date();
  const todayUK = today.toLocaleDateString("en-GB");
  const validUntil = new Date(today);
  validUntil.setDate(validUntil.getDate() + 30);

  const mul = (qty: number, rate: number) => (qty * rate).toFixed(2);

  const coreLineItems: CoreDemoLineItem[] = [
    {
      description:
        "Business Website — 10–15 Pages — Mid-size business website with 10–15 pages || Custom design and bespoke layout || Fully responsive across all devices || CMS-managed with editor training || Contact forms with CRM integration (HubSpot, Mailchimp, Salesforce) || Blog / news module included || On-page SEO optimised || Google Analytics 4 and GTM setup || 30-day post-launch support",
      quantity: "1.0000",
      unit: "Project",
      rate: "3495.00",
      total: mul(1, 3495.0),
      pricingType: "one_off",
      category: "Web Design & Development",
      costPrice: null,
    },
    {
      description:
        "Logo Design — Custom logo design with brand discovery workshop || 3 initial concept directions || Up to 2 rounds of revisions on chosen concept || Final logo in all standard formats (SVG, PNG, JPG, PDF) || Colour and black-and-white variants || Logo usage guidelines (1-page summary)",
      quantity: "1.0000",
      unit: "Project",
      rate: "595.00",
      total: mul(1, 595.0),
      pricingType: "one_off",
      category: "Content & Branding",
      costPrice: null,
    },
    {
      description:
        "SEO Content Article — 1,000 Words — Launch-phase blog content bundle || 3 SEO-optimised articles covering core service categories || Keyword research and target keyword selection per article || Meta title, meta description, and heading structure || Internal linking and publishing direct to CMS",
      quantity: "3.0000",
      unit: "Article",
      rate: "185.00",
      total: mul(3, 185.0),
      pricingType: "one_off",
      category: "SEO Services",
      costPrice: null,
    },
    {
      description:
        "Managed WordPress Hosting — Managed WordPress hosting with 99.9% uptime SLA || Daily automated backups (30-day retention) || Free SSL certificate (Let's Encrypt) || CDN included for global performance || Core WordPress and plugin security updates || Malware scanning and removal || Staging environment included",
      quantity: "1.0000",
      unit: "Month",
      rate: "35.00",
      total: mul(1, 35.0),
      pricingType: "monthly",
      category: "Hosting & Care Plans",
      costPrice: "12.00",
    },
    {
      description:
        "Website Care Plan — Basic — Entry-level website care plan for WordPress sites || Monthly core, theme, and plugin updates || Daily backups with 30-day retention || Uptime monitoring (15-minute intervals) || Basic security hardening and malware scanning || 1 hour of content edits per month (additional hours at hourly rate) || Monthly activity report",
      quantity: "1.0000",
      unit: "Month",
      rate: "65.00",
      total: mul(1, 65.0),
      pricingType: "monthly",
      category: "Hosting & Care Plans",
      costPrice: null,
    },
    {
      description:
        "Local SEO Retainer — Monthly local SEO retainer for single-location businesses || Google Business Profile optimisation and weekly updates || Local citation building and directory cleanup || On-page local SEO (location pages, schema, NAP consistency) || Reviews management and response support || Monthly performance report with local ranking tracking || Minimum 3-month commitment",
      quantity: "1.0000",
      unit: "Month",
      rate: "495.00",
      total: mul(1, 495.0),
      pricingType: "monthly",
      category: "SEO Services",
      costPrice: null,
    },
  ];

  // Beta-2 provenance is uniform across demo rows — enrich in one pass.
  const lineItems: DemoQuoteBundle["lineItems"] = coreLineItems.map(enrichDemoLineItem);

  const quoteFields: DemoQuoteBundle["quoteFields"] = {
    reference: `EXAMPLE-WEB-${today.getTime()}`,
    status: "draft",
    quoteMode: "simple",
    tradePreset: "website_marketing",
    title: `(Example) — New Website & Monthly Support — ${CLIENT_NAME}`,
    description: `Brand launch project for ${CLIENT_NAME} — bespoke 10–15 page WordPress site, new logo, and launch content package, followed by ongoing managed hosting, Basic care plan, and Local SEO retainer. Site build delivered in 4–6 weeks; recurring services commence from launch. Quote dated ${todayUK}.`,
    clientName: CLIENT_NAME,
    contactName: CONTACT_NAME,
    clientEmail: "james@example-thornleylandscapes.co.uk",
    clientPhone: "01905 123 456",
    clientAddress: "Unit 7, Oakwood Business Park\nWorcester\nWR5 3AA",
    validUntil,
  };

  return { quoteFields, lineItems };
};
