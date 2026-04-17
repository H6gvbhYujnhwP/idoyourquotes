/**
 * IT Services / MSP — Starter Catalog Seed
 *
 * 22 items covering the common product stack for a UK MSP starting out:
 * Microsoft 365 licensing, security & backup, IT support contracts,
 * website services, productivity tools, and engineer labour rates.
 *
 * Prices are illustrative starting points (Wez's own numbers) — every
 * MSP that signs up will edit these to match their own buy-in costs,
 * supplier relationships, and resale margins.
 *
 * Fired by:
 *   - server/db.ts createUser() — automatic on new IT sector registration
 *   - server/routers.ts catalog.seedFromSectorTemplate — manual button in UI
 *
 * All prices are EXCLUSIVE of VAT. All billing is monthly (even where the
 * contract term is annual — that's a commitment term, not a billing cadence).
 *
 * Naming convention is deliberately canonical (Microsoft's official product
 * names, not MSP shorthand) so AI extraction from competitor invoices — which
 * tend to use canonical names like "[NCE/1-Year/Monthly]" — matches cleanly.
 */

export type CatalogSeedItem = {
  name: string;
  description: string;
  category: string;
  unit: string;
  pricingType: "standard" | "monthly" | "optional" | "annual";
  defaultRate: string;       // sell price ex VAT, decimal stored as string
  costPrice: string | null;  // buy-in cost ex VAT; null = labour-absorbed or no direct cost
};

export const IT_SERVICES_CATALOG_SEED: readonly CatalogSeedItem[] = [
  // ───────── Microsoft 365 & Licensing (10) ─────────
  {
    name: "Microsoft 365 Business Basic — Monthly",
    description: "Microsoft 365 Business Basic [NCE / 1-Month term, no annual commitment] || Web and mobile Office apps (Word, Excel, PowerPoint) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || No desktop Office apps — web/mobile only",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.52",
    costPrice: "4.69",
  },
  {
    name: "Microsoft 365 Business Basic — Annual",
    description: "Microsoft 365 Business Basic [NCE / 1-Year term, billed monthly — best value] || Web and mobile Office apps (Word, Excel, PowerPoint) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || No desktop Office apps — web/mobile only",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.83",
    costPrice: "4.11",
  },
  {
    name: "Microsoft 365 Business Standard — Monthly",
    description: "Microsoft 365 Business Standard [NCE / 1-Month term, no annual commitment] || Full desktop Office apps (Word, Excel, PowerPoint, Outlook) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || Installs on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "11.52",
    costPrice: "9.79",
  },
  {
    name: "Microsoft 365 Business Standard — Annual",
    description: "Microsoft 365 Business Standard [NCE / 1-Year term, billed monthly — best value] || Full desktop Office apps (Word, Excel, PowerPoint, Outlook) || Exchange Online mailbox (50GB) || Teams, OneDrive (1TB), SharePoint || Installs on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "10.08",
    costPrice: "8.57",
  },
  {
    name: "Microsoft 365 Business Premium — Monthly",
    description: "Microsoft 365 Business Premium [NCE / 1-Month term, no annual commitment] || Everything in Business Standard || Intune mobile device management || Azure AD Premium P1 (conditional access, SSO) || Defender for Business (endpoint protection) || Information Protection and DLP",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "20.28",
    costPrice: "17.24",
  },
  {
    name: "Microsoft 365 Business Premium — Annual",
    description: "Microsoft 365 Business Premium [NCE / 1-Year term, billed monthly — best value] || Everything in Business Standard || Intune mobile device management || Azure AD Premium P1 (conditional access, SSO) || Defender for Business (endpoint protection) || Information Protection and DLP",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "17.75",
    costPrice: "15.09",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 1 — Monthly",
    description: "Exchange Online Plan 1 [NCE / 1-Month term, billed monthly] || 50GB mailbox per user || Anti-spam and anti-malware filtering || Calendar, contacts, shared mailboxes || Web-based Outlook access",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "3.72",
    costPrice: "3.16",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 2 — Monthly",
    description: "Exchange Online Plan 2 [NCE / 1-Month term, billed monthly] || 100GB mailbox per user || Data Loss Prevention (DLP) policies || Hosted voicemail || Unlimited archive mailbox || In-place eDiscovery and hold",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "7.44",
    costPrice: "6.32",
  },
  {
    name: "Microsoft Visio Plan 2 — Monthly",
    description: "Microsoft Visio Plan 2 [NCE / 1-Month term, no annual commitment] || Desktop Visio application || Web and mobile Visio apps || All standard and advanced shape libraries || Real-time collaboration on diagrams",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "13.80",
    costPrice: "11.73",
  },
  {
    name: "Microsoft Visio Plan 2 — Annual",
    description: "Microsoft Visio Plan 2 [NCE / 1-Year term, billed monthly — best value] || Desktop Visio application || Web and mobile Visio apps || All standard and advanced shape libraries || Real-time collaboration on diagrams",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "12.08",
    costPrice: "10.27",
  },

  // ───────── Security & Backup (5) ─────────
  {
    name: "ESET Endpoint Protection",
    description: "Business-grade endpoint security per device || Real-time anti-malware and anti-phishing || Exploit blocker and ransomware shield || Web filtering and device control || Centralised cloud management console",
    category: "Security & Backup",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "4.00",
    costPrice: "0.67",
  },
  {
    name: "SaaS Protect Backup (Microsoft 365 Backup)",
    description: "Cloud-to-cloud backup for Microsoft 365 data || 3× daily automated backups of Exchange, OneDrive, SharePoint, Teams || Unlimited retention with point-in-time restore || Granular restore at item, folder, or mailbox level || Ransomware and accidental-deletion protection",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.00",
    costPrice: "1.40",
  },
  {
    name: "Advanced Email Protection (E-Mail Protect)",
    description: "Advanced email threat protection per mailbox || Anti-phishing and impersonation detection || URL rewriting and time-of-click analysis || Attachment sandboxing || Business email compromise (BEC) protection",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "2.00",
    costPrice: "1.15",
  },
  {
    name: "Email Signature Management (Exclaimer)",
    description: "Centralised email signature management per mailbox || Consistent branded signatures across all devices || Campaign banners and marketing content in signatures || Signatures applied server-side (mobile and desktop included) || Central admin console for updates",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "1.25",
    costPrice: "1.00",
  },
  {
    name: "Cloud Backup Device",
    description: "Managed cloud-backed backup appliance per protected device || Local backup with off-site cloud replication || Automated backup verification and integrity checks || Rapid bare-metal restore || Ransomware detection and rollback",
    category: "Security & Backup",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "68.00",
    costPrice: "30.00",
  },

  // ───────── IT Support Contracts (2) ─────────
  {
    name: "Silver IT Support — Unlimited Remote",
    description: "Managed IT support contract per named user || Unlimited remote helpdesk during business hours (Mon–Fri 9–5) || Ticket-based support with 4-hour response SLA || Remote desktop assistance and troubleshooting || Software and application support || Monthly usage reporting",
    category: "IT Support Contracts",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: null,
  },
  {
    name: "Gold IT Support — Unlimited Remote + 6 hrs Onsite/Month",
    description: "Premium managed IT support contract per named user || Unlimited remote helpdesk during business hours (Mon–Fri 9–5) || 6 hours of onsite engineering per month (pooled across all users) || 4-hour response SLA || Priority ticket handling || Monthly onsite site visits and proactive maintenance || Monthly service report",
    category: "IT Support Contracts",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "28.00",
    costPrice: null,
  },

  // ───────── Website Services (2) ─────────
  {
    name: "Basic Website Hosting",
    description: "Shared website hosting with domain included || 99.9% uptime SLA || SSL certificate included || Domain name registration included (.co.uk or .com) || Email forwarding || Monthly bandwidth and storage allowance suitable for business brochure sites",
    category: "Website Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "12.99",
    costPrice: "5.00",
  },
  {
    name: "Website Hosting Plus — Hosting + 2 hrs CMS Updates/Month",
    description: "Premium website hosting with bundled content management || Everything in Basic Website Hosting (domain, SSL, uptime SLA) || 2 hours of content updates or minor amendments per month || CMS training and admin support || Priority technical support on hosting issues || Ideal for businesses that need regular content changes without a dedicated webmaster",
    category: "Website Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "39.99",
    costPrice: null,
  },

  // ───────── Productivity Tools (1) ─────────
  {
    name: "Keeper Password Manager",
    description: "Enterprise password manager per user || Secure encrypted password vault || Shared team vaults with role-based access || Two-factor authentication (2FA) || Secure file storage and encrypted messaging || Dark web monitoring and breach alerts || Audit logging and compliance reporting",
    category: "Productivity Tools",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "2.00",
  },

  // ───────── Engineer Labour (2) ─────────
  {
    name: "Engineer — Onsite",
    description: "Onsite IT engineering per hour || Hardware installation and cabling || Network commissioning and configuration || User training and handover || Site surveys and audits || Emergency and scheduled callouts",
    category: "Engineer Labour",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "99.00",
    costPrice: null,
  },
  {
    name: "Engineer — Remote / Project Work",
    description: "Remote engineering per hour || Remote configuration and deployments || Scripted rollouts and automation || Project delivery and planning || After-hours maintenance windows || Infrastructure design work",
    category: "Engineer Labour",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "79.00",
    costPrice: null,
  },
] as const;
