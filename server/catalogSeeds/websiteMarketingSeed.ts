/**
 * Website & Digital Marketing — Starter Catalog Seed
 *
 * 44 items covering the common product stack for a UK digital agency starting
 * out: website build & development, hosting & care plans, email & productivity
 * licensing (Microsoft 365 + Google Workspace + email add-ons), SEO, paid
 * media, social media, content, branding, and labour rates.
 *
 * Prices are UK mid-market reference points — every agency that signs up will
 * edit these to match their own production costs, supplier relationships, and
 * retail margins.
 *
 * Fired by:
 *   - server/db.ts createUser() — automatic on new Website & Digital Marketing
 *     sector registration
 *   - server/routers.ts catalog.seedFromSectorTemplate — manual button in UI
 *
 * All prices are EXCLUSIVE of VAT. Billing cadence is monthly for retainers
 * and standard (one-off) for projects. Where a service has commitment terms
 * longer than a month (e.g. a 6-month SEO retainer), "monthly" is still the
 * billing cadence — commitment sits in the description.
 *
 * Naming convention follows how UK mid-market agencies actually label services
 * on their public rate cards so AI extraction from competitor-agency invoices
 * or proposals matches cleanly. The Microsoft 365 entries use Microsoft's
 * canonical product names matching the IT Services seed verbatim — same
 * names, same prices — so a user switching sectors (or working alongside an
 * MSP partner) keeps consistent line items and AI extraction lands the same
 * way in both contexts.
 */

import type { CatalogSeedItem } from "./itServicesSeed";

export const WEBSITE_MARKETING_CATALOG_SEED: readonly CatalogSeedItem[] = [
  // ───────── Web Design & Development (7) ─────────
  {
    name: "Brochure Website — 5 Pages",
    description: "Professional brochure website with up to 5 pages || Custom design based on brand guidelines || Fully responsive across desktop, tablet, mobile || CMS-managed (WordPress or equivalent) || Contact form and Google Maps integration || On-page SEO fundamentals (meta titles, descriptions, schema) || 30-day post-launch support included",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1995.00",
    costPrice: null,
  },
  {
    name: "Business Website — 10–15 Pages",
    description: "Mid-size business website with 10–15 pages || Custom design and bespoke layout || Fully responsive across all devices || CMS-managed with editor training || Contact forms with CRM integration (HubSpot, Mailchimp, Salesforce) || Blog / news module included || On-page SEO optimised || Google Analytics 4 and GTM setup || 30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "3495.00",
    costPrice: null,
  },
  {
    name: "Shopify eCommerce Store",
    description: "Shopify online store build with up to 50 products loaded || Custom theme design and development || Mobile-first responsive layout || Payment gateway setup (Stripe, PayPal, Apple Pay) || Shipping and tax configuration || Essential apps configured (reviews, upsell, abandoned cart) || Staff training on admin and order fulfilment || 30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "4495.00",
    costPrice: null,
  },
  {
    name: "WooCommerce eCommerce Store",
    description: "WordPress WooCommerce online store with up to 50 products loaded || Custom theme and bespoke checkout flow || Mobile-first responsive layout || Payment gateway setup (Stripe, PayPal, Klarna) || Shipping zones and tax rules configured || Essential plugins configured (reviews, cross-sell, cart recovery) || Staff training on admin || 30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "5495.00",
    costPrice: null,
  },
  {
    name: "Landing Page — Single Page Conversion Optimised",
    description: "Single-page campaign landing page, conversion-optimised || Custom design tailored to campaign goal || Above-the-fold hook and CTA structure || Responsive across all devices || Lead capture form with email / CRM integration || Thank-you page and conversion tracking (GA4, Meta Pixel) || A/B testing variant option || 14-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "695.00",
    costPrice: null,
  },
  {
    name: "Website Refresh — Existing Site Redesign",
    description: "Visual refresh of an existing website (same CMS, new design) || New page layouts for up to 10 existing pages || Updated typography, colour, and component library || Responsive review across all devices || SEO preserved (URL structure, meta, redirects mapped) || Content migrated as-is (copy updates quoted separately) || 14-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1195.00",
    costPrice: null,
  },
  {
    name: "Custom Development — Hourly",
    description: "Bespoke web development work charged by the hour || Custom feature builds, plugin customisation, API integrations || Complex forms, calculators, or bespoke admin tools || Bug fixes and technical investigation outside a care plan || Work against agreed spec with scope documented in advance",
    category: "Web Design & Development",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },

  // ───────── Hosting & Care Plans (4) ─────────
  {
    name: "Managed WordPress Hosting",
    description: "Managed WordPress hosting with 99.9% uptime SLA || Daily automated backups (30-day retention) || Free SSL certificate (Let's Encrypt) || CDN included for global performance || Core WordPress and plugin security updates || Malware scanning and removal || Staging environment included || Ideal for brochure and business sites",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "35.00",
    costPrice: "12.00",
  },
  {
    name: "Website Care Plan — Basic",
    description: "Entry-level website care plan for WordPress sites || Monthly core, theme, and plugin updates || Daily backups with 30-day retention || Uptime monitoring (15-minute intervals) || Basic security hardening and malware scanning || 1 hour of content edits per month (additional hours at hourly rate) || Monthly activity report",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Website Care Plan — Pro",
    description: "Premium website care plan for business-critical sites || Everything in Basic plan || Weekly core, theme, and plugin updates || 3 hours of content edits per month (additional hours at reduced rate) || Performance monitoring and optimisation || Priority support with 4-hour response SLA || Quarterly SEO health check || Monthly activity and SEO report",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Domain Registration & Management",
    description: "Domain name registration and annual renewal || .co.uk, .com, or other standard TLD || DNS management and nameserver configuration || Privacy protection where available || Transfer support and renewal reminders",
    category: "Hosting & Care Plans",
    unit: "Year",
    pricingType: "annual",
    defaultRate: "15.00",
    costPrice: "8.00",
  },

  // ───────── Email & Productivity Licensing (16) ─────────
  // Microsoft 365 entries are duplicated verbatim from itServicesSeed.ts
  // (same canonical names, same prices) so a Web agency reselling email
  // services to its clients matches the IT/MSP world's terminology and AI
  // extraction from supplier / competitor invoices lands consistently in
  // both sectors. Google Workspace entries follow Google's UK published
  // pricing (1-year-term billed monthly is the discounted "Annual"; the
  // 1-month-term flexible plan is the "Monthly"). Email add-ons (Exclaimer
  // signature management + advanced email protection) round out the stack
  // a typical web agency needs to package alongside hosting and email.
  {
    name: "Microsoft 365 Business Basic — Monthly",
    description: "Microsoft 365 Business Basic [NCE / 1-Month term, no annual commitment] || Web and mobile Office apps (Word, Excel, PowerPoint) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || No desktop Office apps — web/mobile only",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.52",
    costPrice: "4.69",
  },
  {
    name: "Microsoft 365 Business Basic — Annual",
    description: "Microsoft 365 Business Basic [NCE / 1-Year term, billed monthly — best value] || Web and mobile Office apps (Word, Excel, PowerPoint) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || No desktop Office apps — web/mobile only",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.83",
    costPrice: "4.11",
  },
  {
    name: "Microsoft 365 Business Standard — Monthly",
    description: "Microsoft 365 Business Standard [NCE / 1-Month term, no annual commitment] || Full desktop Office apps (Word, Excel, PowerPoint, Outlook) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || Installs on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "11.52",
    costPrice: "9.79",
  },
  {
    name: "Microsoft 365 Business Standard — Annual",
    description: "Microsoft 365 Business Standard [NCE / 1-Year term, billed monthly — best value] || Full desktop Office apps (Word, Excel, PowerPoint, Outlook) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || Installs on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "10.08",
    costPrice: "8.57",
  },
  {
    name: "Microsoft 365 Business Premium — Monthly",
    description: "Microsoft 365 Business Premium [NCE / 1-Month term, no annual commitment] || Everything in Business Standard || Intune mobile device management || Azure AD Premium P1 (conditional access, SSO) || Defender for Business (endpoint protection) || Information Protection and DLP",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "20.28",
    costPrice: "17.24",
  },
  {
    name: "Microsoft 365 Business Premium — Annual",
    description: "Microsoft 365 Business Premium [NCE / 1-Year term, billed monthly — best value] || Everything in Business Standard || Intune mobile device management || Azure AD Premium P1 (conditional access, SSO) || Defender for Business (endpoint protection) || Information Protection and DLP",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "17.75",
    costPrice: "15.09",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 1 — Monthly",
    description: "Exchange Online Plan 1 [NCE / 1-Month term, billed monthly] || 50GB mailbox per user || Anti-spam and anti-malware filtering || Calendar, contacts, shared mailboxes || Web-based Outlook access",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "3.72",
    costPrice: "3.16",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 2 — Monthly",
    description: "Exchange Online Plan 2 [NCE / 1-Month term, billed monthly] || 100GB mailbox per user || Data Loss Prevention (DLP) policies || Hosted voicemail || Unlimited archive mailbox || In-place eDiscovery and hold",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "7.44",
    costPrice: "6.32",
  },
  {
    name: "Google Workspace Business Starter — Monthly",
    description: "Google Workspace Business Starter [Flexible / 1-Month term, no annual commitment] || Custom email at the client's domain || 30GB pooled cloud storage per user (Drive, Gmail, Photos) || Gmail, Calendar, Meet (100-participant video meetings), Chat, Docs, Sheets, Slides || Standard support || No annual commitment — cancel any month",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "6.00",
    costPrice: "5.10",
  },
  {
    name: "Google Workspace Business Starter — Annual",
    description: "Google Workspace Business Starter [Annual / 1-Year term, billed monthly — best value] || Custom email at the client's domain || 30GB pooled cloud storage per user || Gmail, Calendar, Meet (100-participant video meetings), Chat, Docs, Sheets, Slides || Standard support || 12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.60",
    costPrice: "3.91",
  },
  {
    name: "Google Workspace Business Standard — Monthly",
    description: "Google Workspace Business Standard [Flexible / 1-Month term, no annual commitment] || Custom email at the client's domain || 2TB pooled cloud storage per user || Gmail, Calendar, Meet (150-participant meetings with recording + noise cancellation), Chat, Docs, Sheets, Slides || Shared drives for teams || eSignature with Docs and PDFs || Standard support",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "12.00",
    costPrice: "10.20",
  },
  {
    name: "Google Workspace Business Standard — Annual",
    description: "Google Workspace Business Standard [Annual / 1-Year term, billed monthly — best value] || Custom email at the client's domain || 2TB pooled cloud storage per user || Gmail, Calendar, Meet (150-participant meetings with recording + noise cancellation), Chat, Docs, Sheets, Slides || Shared drives for teams || eSignature with Docs and PDFs || 12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "9.20",
    costPrice: "7.82",
  },
  {
    name: "Google Workspace Business Plus — Monthly",
    description: "Google Workspace Business Plus [Flexible / 1-Month term, no annual commitment] || Custom email at the client's domain with eDiscovery and retention || 5TB pooled cloud storage per user || Gmail, Calendar, Meet (500-participant meetings with recording + attendance tracking), Chat, Docs, Sheets, Slides || Shared drives, Vault (eDiscovery + retention), enhanced security and management controls || Standard support",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: "15.30",
  },
  {
    name: "Google Workspace Business Plus — Annual",
    description: "Google Workspace Business Plus [Annual / 1-Year term, billed monthly — best value] || Custom email at the client's domain with eDiscovery and retention || 5TB pooled cloud storage per user || Gmail, Calendar, Meet (500-participant meetings with recording + attendance tracking), Chat, Docs, Sheets, Slides || Vault and enhanced security controls || 12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "13.80",
    costPrice: "11.73",
  },
  {
    name: "Advanced Email Protection (E-Mail Protect)",
    description: "Advanced email threat protection per mailbox || Anti-phishing and impersonation detection || URL rewriting and time-of-click analysis || Attachment sandboxing || Business email compromise (BEC) protection",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "2.00",
    costPrice: "1.15",
  },
  {
    name: "Email Signature Management (Exclaimer)",
    description: "Centralised email signature management per mailbox || Consistent branded signatures across all devices || Campaign banners and marketing content in signatures || Signatures applied server-side (mobile and desktop included) || Central admin console for updates",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "1.25",
    costPrice: "1.00",
  },

  // ───────── SEO Services (4) ─────────
  {
    name: "SEO Audit — Full Technical & Content Review",
    description: "Comprehensive SEO audit (one-off) || Technical audit: crawlability, indexation, Core Web Vitals, schema || Content audit: keyword targeting, cannibalisation, content gaps || Backlink profile review and toxic link identification || Competitor analysis (top 3–5 competitors) || Prioritised action plan with effort and impact estimates || 45-minute findings walkthrough",
    category: "SEO Services",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Local SEO Retainer",
    description: "Monthly local SEO retainer for single-location businesses || Google Business Profile optimisation and weekly updates || Local citation building and directory cleanup || On-page local SEO (location pages, schema, NAP consistency) || Reviews management and response support || Monthly performance report with local ranking tracking || Minimum 3-month commitment",
    category: "SEO Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "National SEO Retainer",
    description: "Monthly national SEO retainer for multi-location or national businesses || Technical SEO monitoring and fixes || 2 SEO-optimised blog articles per month (1,000+ words) || Monthly link-building outreach and digital PR || Monthly keyword ranking and traffic reporting || Quarterly strategy review || Minimum 6-month commitment",
    category: "SEO Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "995.00",
    costPrice: null,
  },
  {
    name: "SEO Content Article — 1,000 Words",
    description: "SEO-optimised blog article or landing page copy || Keyword research and target keyword selection || 1,000 words of original, human-written content || Meta title, meta description, and heading structure || Internal linking suggestions || Up to 2 rounds of revisions || Published direct to CMS on request",
    category: "SEO Services",
    unit: "Article",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },

  // ───────── Paid Media Management (3) ─────────
  {
    name: "Google Ads Management",
    description: "Monthly Google Ads management fee || Campaign setup, keyword research, and ad copy creation || Ongoing bid management, negative keywords, and search terms review || Landing page conversion tracking setup (GA4, conversion goals) || Weekly optimisation and reporting || Monthly strategy review with client || Ad spend billed separately directly to Google || Assumes up to £5,000 monthly ad spend — tiered pricing above this",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Meta Ads Management (Facebook + Instagram)",
    description: "Monthly Meta Ads management fee || Campaign setup and creative production coordination || Audience targeting, lookalikes, and retargeting setup || Ad copy and image/video asset delivery coordination || Meta Pixel setup and Conversions API || Weekly optimisation and monthly reporting || Ad spend billed separately directly to Meta || Assumes up to £3,000 monthly ad spend — tiered pricing above this",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "395.00",
    costPrice: null,
  },
  {
    name: "LinkedIn Ads Management",
    description: "Monthly LinkedIn Ads management fee for B2B campaigns || Campaign setup and audience targeting (job titles, industries, companies) || Sponsored Content, Message Ads, and Lead Gen Forms setup || Ad copy writing and creative coordination || LinkedIn Insight Tag setup and conversion tracking || Weekly optimisation and monthly reporting || Ad spend billed separately directly to LinkedIn",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "595.00",
    costPrice: null,
  },

  // ───────── Social Media Management (3) ─────────
  {
    name: "Social Media Management — 2 Channels",
    description: "Monthly social media management across 2 channels (e.g. LinkedIn + Instagram) || 12 static posts per month per channel (24 total) || Content planning and editorial calendar || Community management during business hours (DMs, comments, mentions) || Monthly performance report || Channel strategy review quarterly",
    category: "Social Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "395.00",
    costPrice: null,
  },
  {
    name: "Social Media Management — 4 Channels",
    description: "Monthly social media management across 4 channels || 12 static posts per channel per month (48 total) || Content planning and editorial calendar || Community management during business hours || Monthly reels or short-form video (2 per month) || Monthly performance report with audience and engagement analysis || Quarterly strategy review",
    category: "Social Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "795.00",
    costPrice: null,
  },
  {
    name: "Social Content Pack — 12 Posts",
    description: "One-off pack of 12 branded social media posts || Custom-designed graphics or curated photography || Caption writing optimised per platform || Suggested posting schedule || Supplied as a scheduled pack ready to publish or as source files || Ideal for one-off campaigns, event promotion, or topping up in-house social",
    category: "Social Media Management",
    unit: "Pack",
    pricingType: "standard",
    defaultRate: "295.00",
    costPrice: null,
  },

  // ───────── Content & Branding (4) ─────────
  {
    name: "Logo Design",
    description: "Custom logo design with brand discovery workshop || 3 initial concept directions || Up to 2 rounds of revisions on chosen concept || Final logo in all standard formats (SVG, PNG, JPG, PDF) || Colour and black-and-white variants || Logo usage guidelines (1-page summary)",
    category: "Content & Branding",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "595.00",
    costPrice: null,
  },
  {
    name: "Full Brand Identity Package",
    description: "Complete brand identity development || Brand discovery workshop and positioning exercise || Logo suite (primary, secondary, icon, monochrome) || Colour palette with hex, RGB, CMYK, and Pantone values || Typography system with web and print pairings || Brand guidelines document (15–20 pages) || Template starter pack (letterhead, business card, email signature)",
    category: "Content & Branding",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1995.00",
    costPrice: null,
  },
  {
    name: "Marketing Collateral Design",
    description: "Branded marketing collateral design (per deliverable) || Scope can include brochures, flyers, leaflets, pitch decks, one-pagers || Print-ready and digital-ready file delivery || Up to 2 rounds of revisions || Produced to match existing brand guidelines || Print production quoted separately if required",
    category: "Content & Branding",
    unit: "Deliverable",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },
  {
    name: "Copywriting — Website or Marketing",
    description: "Professional copywriting per page or asset || Website page copy, sales page copy, email copy, or ad copy || Discovery brief covering tone, audience, and conversion goal || 1 round of substantive revisions included || Plain-English, UK-market-tuned writing || Ideal for business owners who want polished copy without AI-generated filler",
    category: "Content & Branding",
    unit: "Page",
    pricingType: "standard",
    defaultRate: "175.00",
    costPrice: null,
  },

  // ───────── Labour Rates (3) ─────────
  {
    name: "Web Developer — Hourly",
    description: "Front-end and back-end web development per hour || WordPress, Shopify, WooCommerce, custom PHP or JavaScript work || Plugin and theme customisation || API integrations || Bug fixes and technical investigation",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Designer — Hourly",
    description: "Graphic and web design per hour || Web page design, marketing collateral, social graphics || Photoshop, Illustrator, Figma, or equivalent || Client-facing design work outside a fixed-scope project",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Digital Marketer — Hourly",
    description: "Digital marketing specialist work per hour || Strategy sessions, ad account audits, SEO consultations || Marketing automation setup (HubSpot, Mailchimp, Klaviyo) || Analytics and reporting outside a fixed-scope retainer",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "75.00",
    costPrice: null,
  },
] as const;
