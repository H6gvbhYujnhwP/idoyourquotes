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
    description: "Professional brochure website with up to 5 pages\nCustom design based on brand guidelines\nFully responsive across desktop, tablet, mobile\nCMS-managed (WordPress or equivalent)\nContact form and Google Maps integration\nOn-page SEO fundamentals (meta titles, descriptions, schema)\n30-day post-launch support included",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1995.00",
    costPrice: null,
  },
  {
    name: "Business Website — 10–15 Pages",
    description: "Mid-size business website with 10–15 pages\nCustom design and bespoke layout\nFully responsive across all devices\nCMS-managed with editor training\nContact forms with CRM integration (HubSpot, Mailchimp, Salesforce)\nBlog / news module included\nOn-page SEO optimised\nGoogle Analytics 4 and GTM setup\n30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "3495.00",
    costPrice: null,
  },
  {
    name: "Shopify eCommerce Store",
    description: "Shopify online store build with up to 50 products loaded\nCustom theme design and development\nMobile-first responsive layout\nPayment gateway setup (Stripe, PayPal, Apple Pay)\nShipping and tax configuration\nEssential apps configured (reviews, upsell, abandoned cart)\nStaff training on admin and order fulfilment\n30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "4495.00",
    costPrice: null,
  },
  {
    name: "WooCommerce eCommerce Store",
    description: "WordPress WooCommerce online store with up to 50 products loaded\nCustom theme and bespoke checkout flow\nMobile-first responsive layout\nPayment gateway setup (Stripe, PayPal, Klarna)\nShipping zones and tax rules configured\nEssential plugins configured (reviews, cross-sell, cart recovery)\nStaff training on admin\n30-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "5495.00",
    costPrice: null,
  },
  {
    name: "Landing Page — Single Page Conversion Optimised",
    description: "Single-page campaign landing page, conversion-optimised\nCustom design tailored to campaign goal\nAbove-the-fold hook and CTA structure\nResponsive across all devices\nLead capture form with email / CRM integration\nThank-you page and conversion tracking (GA4, Meta Pixel)\nA/B testing variant option\n14-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "695.00",
    costPrice: null,
  },
  {
    name: "Website Refresh — Existing Site Redesign",
    description: "Visual refresh of an existing website (same CMS, new design)\nNew page layouts for up to 10 existing pages\nUpdated typography, colour, and component library\nResponsive review across all devices\nSEO preserved (URL structure, meta, redirects mapped)\nContent migrated as-is (copy updates quoted separately)\n14-day post-launch support",
    category: "Web Design & Development",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1195.00",
    costPrice: null,
  },
  {
    name: "Custom Development — Hourly",
    description: "Bespoke web development work charged by the hour\nCustom feature builds, plugin customisation, API integrations\nComplex forms, calculators, or bespoke admin tools\nBug fixes and technical investigation outside a care plan\nWork against agreed spec with scope documented in advance",
    category: "Web Design & Development",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },

  // ───────── Hosting & Care Plans (4) ─────────
  {
    name: "Managed WordPress Hosting",
    description: "Managed WordPress hosting with 99.9% uptime SLA\nDaily automated backups (30-day retention)\nFree SSL certificate (Let's Encrypt)\nCDN included for global performance\nCore WordPress and plugin security updates\nMalware scanning and removal\nStaging environment included\nIdeal for brochure and business sites",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "35.00",
    costPrice: "12.00",
  },
  {
    name: "Website Care Plan — Basic",
    description: "Entry-level website care plan for WordPress sites\nMonthly core, theme, and plugin updates\nDaily backups with 30-day retention\nUptime monitoring (15-minute intervals)\nBasic security hardening and malware scanning\n1 hour of content edits per month (additional hours at hourly rate)\nMonthly activity report",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Website Care Plan — Pro",
    description: "Premium website care plan for business-critical sites\nEverything in Basic plan\nWeekly core, theme, and plugin updates\n3 hours of content edits per month (additional hours at reduced rate)\nPerformance monitoring and optimisation\nPriority support with 4-hour response SLA\nQuarterly SEO health check\nMonthly activity and SEO report",
    category: "Hosting & Care Plans",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "125.00",
    costPrice: null,
  },
  {
    name: "Domain Registration & Management",
    description: "Domain name registration and annual renewal\n.co.uk, .com, or other standard TLD\nDNS management and nameserver configuration\nPrivacy protection where available\nTransfer support and renewal reminders",
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
    description: "Microsoft 365 Business Basic [NCE / 1-Month term, no annual commitment]\nWeb and mobile Office apps (Word, Excel, PowerPoint)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nNo desktop Office apps — web/mobile only",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.52",
    costPrice: "4.69",
  },
  {
    name: "Microsoft 365 Business Basic — Annual",
    description: "Microsoft 365 Business Basic [NCE / 1-Year term, billed monthly — best value]\nWeb and mobile Office apps (Word, Excel, PowerPoint)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nNo desktop Office apps — web/mobile only",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.83",
    costPrice: "4.11",
  },
  {
    name: "Microsoft 365 Business Standard — Monthly",
    description: "Microsoft 365 Business Standard [NCE / 1-Month term, no annual commitment]\nFull desktop Office apps (Word, Excel, PowerPoint, Outlook)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nInstalls on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "11.52",
    costPrice: "9.79",
  },
  {
    name: "Microsoft 365 Business Standard — Annual",
    description: "Microsoft 365 Business Standard [NCE / 1-Year term, billed monthly — best value]\nFull desktop Office apps (Word, Excel, PowerPoint, Outlook)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nInstalls on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "10.08",
    costPrice: "8.57",
  },
  {
    name: "Microsoft 365 Business Premium — Monthly",
    description: "Microsoft 365 Business Premium [NCE / 1-Month term, no annual commitment]\nEverything in Business Standard\nIntune mobile device management\nAzure AD Premium P1 (conditional access, SSO)\nDefender for Business (endpoint protection)\nInformation Protection and DLP",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "20.28",
    costPrice: "17.24",
  },
  {
    name: "Microsoft 365 Business Premium — Annual",
    description: "Microsoft 365 Business Premium [NCE / 1-Year term, billed monthly — best value]\nEverything in Business Standard\nIntune mobile device management\nAzure AD Premium P1 (conditional access, SSO)\nDefender for Business (endpoint protection)\nInformation Protection and DLP",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "17.75",
    costPrice: "15.09",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 1 — Monthly",
    description: "Exchange Online Plan 1 [NCE / 1-Month term, billed monthly]\n50GB mailbox per user\nAnti-spam and anti-malware filtering\nCalendar, contacts, shared mailboxes\nWeb-based Outlook access",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "3.72",
    costPrice: "3.16",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 2 — Monthly",
    description: "Exchange Online Plan 2 [NCE / 1-Month term, billed monthly]\n100GB mailbox per user\nData Loss Prevention (DLP) policies\nHosted voicemail\nUnlimited archive mailbox\nIn-place eDiscovery and hold",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "7.44",
    costPrice: "6.32",
  },
  {
    name: "Google Workspace Business Starter — Monthly",
    description: "Google Workspace Business Starter [Flexible / 1-Month term, no annual commitment]\nCustom email at the client's domain\n30GB pooled cloud storage per user (Drive, Gmail, Photos)\nGmail, Calendar, Meet (100-participant video meetings), Chat, Docs, Sheets, Slides\nStandard support\nNo annual commitment — cancel any month",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "6.00",
    costPrice: "5.10",
  },
  {
    name: "Google Workspace Business Starter — Annual",
    description: "Google Workspace Business Starter [Annual / 1-Year term, billed monthly — best value]\nCustom email at the client's domain\n30GB pooled cloud storage per user\nGmail, Calendar, Meet (100-participant video meetings), Chat, Docs, Sheets, Slides\nStandard support\n12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.60",
    costPrice: "3.91",
  },
  {
    name: "Google Workspace Business Standard — Monthly",
    description: "Google Workspace Business Standard [Flexible / 1-Month term, no annual commitment]\nCustom email at the client's domain\n2TB pooled cloud storage per user\nGmail, Calendar, Meet (150-participant meetings with recording + noise cancellation), Chat, Docs, Sheets, Slides\nShared drives for teams\neSignature with Docs and PDFs\nStandard support",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "12.00",
    costPrice: "10.20",
  },
  {
    name: "Google Workspace Business Standard — Annual",
    description: "Google Workspace Business Standard [Annual / 1-Year term, billed monthly — best value]\nCustom email at the client's domain\n2TB pooled cloud storage per user\nGmail, Calendar, Meet (150-participant meetings with recording + noise cancellation), Chat, Docs, Sheets, Slides\nShared drives for teams\neSignature with Docs and PDFs\n12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "9.20",
    costPrice: "7.82",
  },
  {
    name: "Google Workspace Business Plus — Monthly",
    description: "Google Workspace Business Plus [Flexible / 1-Month term, no annual commitment]\nCustom email at the client's domain with eDiscovery and retention\n5TB pooled cloud storage per user\nGmail, Calendar, Meet (500-participant meetings with recording + attendance tracking), Chat, Docs, Sheets, Slides\nShared drives, Vault (eDiscovery + retention), enhanced security and management controls\nStandard support",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: "15.30",
  },
  {
    name: "Google Workspace Business Plus — Annual",
    description: "Google Workspace Business Plus [Annual / 1-Year term, billed monthly — best value]\nCustom email at the client's domain with eDiscovery and retention\n5TB pooled cloud storage per user\nGmail, Calendar, Meet (500-participant meetings with recording + attendance tracking), Chat, Docs, Sheets, Slides\nVault and enhanced security controls\n12-month commitment",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "13.80",
    costPrice: "11.73",
  },
  {
    name: "Advanced Email Protection (E-Mail Protect)",
    description: "Advanced email threat protection per mailbox\nAnti-phishing and impersonation detection\nURL rewriting and time-of-click analysis\nAttachment sandboxing\nBusiness email compromise (BEC) protection",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "2.00",
    costPrice: "1.15",
  },
  {
    name: "Email Signature Management (Exclaimer)",
    description: "Centralised email signature management per mailbox\nConsistent branded signatures across all devices\nCampaign banners and marketing content in signatures\nSignatures applied server-side (mobile and desktop included)\nCentral admin console for updates",
    category: "Email & Productivity Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "1.25",
    costPrice: "1.00",
  },

  // ───────── SEO Services (4) ─────────
  {
    name: "SEO Audit — Full Technical & Content Review",
    description: "Comprehensive SEO audit (one-off)\nTechnical audit: crawlability, indexation, Core Web Vitals, schema\nContent audit: keyword targeting, cannibalisation, content gaps\nBacklink profile review and toxic link identification\nCompetitor analysis (top 3–5 competitors)\nPrioritised action plan with effort and impact estimates\n45-minute findings walkthrough",
    category: "SEO Services",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Local SEO Retainer",
    description: "Monthly local SEO retainer for single-location businesses\nGoogle Business Profile optimisation and weekly updates\nLocal citation building and directory cleanup\nOn-page local SEO (location pages, schema, NAP consistency)\nReviews management and response support\nMonthly performance report with local ranking tracking\nMinimum 3-month commitment",
    category: "SEO Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "National SEO Retainer",
    description: "Monthly national SEO retainer for multi-location or national businesses\nTechnical SEO monitoring and fixes\n2 SEO-optimised blog articles per month (1,000+ words)\nMonthly link-building outreach and digital PR\nMonthly keyword ranking and traffic reporting\nQuarterly strategy review\nMinimum 6-month commitment",
    category: "SEO Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "995.00",
    costPrice: null,
  },
  {
    name: "SEO Content Article — 1,000 Words",
    description: "SEO-optimised blog article or landing page copy\nKeyword research and target keyword selection\n1,000 words of original, human-written content\nMeta title, meta description, and heading structure\nInternal linking suggestions\nUp to 2 rounds of revisions\nPublished direct to CMS on request",
    category: "SEO Services",
    unit: "Article",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },

  // ───────── Paid Media Management (3) ─────────
  {
    name: "Google Ads Management",
    description: "Monthly Google Ads management fee\nCampaign setup, keyword research, and ad copy creation\nOngoing bid management, negative keywords, and search terms review\nLanding page conversion tracking setup (GA4, conversion goals)\nWeekly optimisation and reporting\nMonthly strategy review with client\nAd spend billed separately directly to Google\nAssumes up to £5,000 monthly ad spend — tiered pricing above this",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "495.00",
    costPrice: null,
  },
  {
    name: "Meta Ads Management (Facebook + Instagram)",
    description: "Monthly Meta Ads management fee\nCampaign setup and creative production coordination\nAudience targeting, lookalikes, and retargeting setup\nAd copy and image/video asset delivery coordination\nMeta Pixel setup and Conversions API\nWeekly optimisation and monthly reporting\nAd spend billed separately directly to Meta\nAssumes up to £3,000 monthly ad spend — tiered pricing above this",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "395.00",
    costPrice: null,
  },
  {
    name: "LinkedIn Ads Management",
    description: "Monthly LinkedIn Ads management fee for B2B campaigns\nCampaign setup and audience targeting (job titles, industries, companies)\nSponsored Content, Message Ads, and Lead Gen Forms setup\nAd copy writing and creative coordination\nLinkedIn Insight Tag setup and conversion tracking\nWeekly optimisation and monthly reporting\nAd spend billed separately directly to LinkedIn",
    category: "Paid Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "595.00",
    costPrice: null,
  },

  // ───────── Social Media Management (3) ─────────
  {
    name: "Social Media Management — 2 Channels",
    description: "Monthly social media management across 2 channels (e.g. LinkedIn + Instagram)\n12 static posts per month per channel (24 total)\nContent planning and editorial calendar\nCommunity management during business hours (DMs, comments, mentions)\nMonthly performance report\nChannel strategy review quarterly",
    category: "Social Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "395.00",
    costPrice: null,
  },
  {
    name: "Social Media Management — 4 Channels",
    description: "Monthly social media management across 4 channels\n12 static posts per channel per month (48 total)\nContent planning and editorial calendar\nCommunity management during business hours\nMonthly reels or short-form video (2 per month)\nMonthly performance report with audience and engagement analysis\nQuarterly strategy review",
    category: "Social Media Management",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "795.00",
    costPrice: null,
  },
  {
    name: "Social Content Pack — 12 Posts",
    description: "One-off pack of 12 branded social media posts\nCustom-designed graphics or curated photography\nCaption writing optimised per platform\nSuggested posting schedule\nSupplied as a scheduled pack ready to publish or as source files\nIdeal for one-off campaigns, event promotion, or topping up in-house social",
    category: "Social Media Management",
    unit: "Pack",
    pricingType: "standard",
    defaultRate: "295.00",
    costPrice: null,
  },

  // ───────── Content & Branding (4) ─────────
  {
    name: "Logo Design",
    description: "Custom logo design with brand discovery workshop\n3 initial concept directions\nUp to 2 rounds of revisions on chosen concept\nFinal logo in all standard formats (SVG, PNG, JPG, PDF)\nColour and black-and-white variants\nLogo usage guidelines (1-page summary)",
    category: "Content & Branding",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "595.00",
    costPrice: null,
  },
  {
    name: "Full Brand Identity Package",
    description: "Complete brand identity development\nBrand discovery workshop and positioning exercise\nLogo suite (primary, secondary, icon, monochrome)\nColour palette with hex, RGB, CMYK, and Pantone values\nTypography system with web and print pairings\nBrand guidelines document (15–20 pages)\nTemplate starter pack (letterhead, business card, email signature)",
    category: "Content & Branding",
    unit: "Project",
    pricingType: "standard",
    defaultRate: "1995.00",
    costPrice: null,
  },
  {
    name: "Marketing Collateral Design",
    description: "Branded marketing collateral design (per deliverable)\nScope can include brochures, flyers, leaflets, pitch decks, one-pagers\nPrint-ready and digital-ready file delivery\nUp to 2 rounds of revisions\nProduced to match existing brand guidelines\nPrint production quoted separately if required",
    category: "Content & Branding",
    unit: "Deliverable",
    pricingType: "standard",
    defaultRate: "195.00",
    costPrice: null,
  },
  {
    name: "Copywriting — Website or Marketing",
    description: "Professional copywriting per page or asset\nWebsite page copy, sales page copy, email copy, or ad copy\nDiscovery brief covering tone, audience, and conversion goal\n1 round of substantive revisions included\nPlain-English, UK-market-tuned writing\nIdeal for business owners who want polished copy without AI-generated filler",
    category: "Content & Branding",
    unit: "Page",
    pricingType: "standard",
    defaultRate: "175.00",
    costPrice: null,
  },

  // ───────── Labour Rates (3) ─────────
  {
    name: "Web Developer — Hourly",
    description: "Front-end and back-end web development per hour\nWordPress, Shopify, WooCommerce, custom PHP or JavaScript work\nPlugin and theme customisation\nAPI integrations\nBug fixes and technical investigation",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "85.00",
    costPrice: null,
  },
  {
    name: "Designer — Hourly",
    description: "Graphic and web design per hour\nWeb page design, marketing collateral, social graphics\nPhotoshop, Illustrator, Figma, or equivalent\nClient-facing design work outside a fixed-scope project",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "65.00",
    costPrice: null,
  },
  {
    name: "Digital Marketer — Hourly",
    description: "Digital marketing specialist work per hour\nStrategy sessions, ad account audits, SEO consultations\nMarketing automation setup (HubSpot, Mailchimp, Klaviyo)\nAnalytics and reporting outside a fixed-scope retainer",
    category: "Labour Rates",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "75.00",
    costPrice: null,
  },
] as const;
