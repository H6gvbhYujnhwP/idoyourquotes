/**
 * IT Services / MSP — Starter Catalog Seed
 *
 * 88 items covering the common product stack for a UK MSP starting out:
 * Microsoft 365 licensing, Google Workspace licensing, security & backup,
 * cyber security certification & monitoring, IT support contracts, website
 * services, productivity tools, engineer labour rates, plus the
 * connectivity / voice product family (broadband, leased lines, 4G/5G
 * failover, satellite, Wi-Fi, SIP trunking, hosted VoIP).
 *
 * Prices are illustrative starting points (Wez's own numbers) — every
 * MSP that signs up will edit these to match their own buy-in costs,
 * supplier relationships, and resale margins.
 *
 * Fired by:
 *   - server/db.ts createUser() — automatic on new IT sector registration
 *   - server/routers.ts catalog.seedFromSectorTemplate — manual button in UI
 *
 * All prices are EXCLUSIVE of VAT. All recurring billing is monthly (even
 * where the contract term is annual — that's a commitment term, not a
 * billing cadence). One-off "Provision" items (line install, hardware
 * setup, new router/firewall) use pricingType "standard".
 *
 * Naming convention is deliberately canonical (Microsoft's official product
 * names, not MSP shorthand) so AI extraction from competitor invoices — which
 * tend to use canonical names like "[NCE/1-Year/Monthly]" — matches cleanly.
 *
 * Category set (12):
 *   1.  Microsoft 365 & Licensing
 *   2.  Google Workspace & Licensing  (NEW — 8 items)
 *   3.  Security & Backup
 *   4.  Cyber Security                (NEW — 9 items)
 *   5.  IT Support Contracts
 *   6.  Website Services
 *   7.  Productivity Tools
 *   8.  Engineer Labour
 *   9.  Connectivity
 *   10. Wi-Fi & LAN
 *   11. SIP & Voice Lines
 *   12. VoIP Telephony
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
    description: "Microsoft 365 Business Basic [NCE / 1-Month term, no annual commitment]\nWeb and mobile Office apps (Word, Excel, PowerPoint)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nNo desktop Office apps — web/mobile only",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.52",
    costPrice: "4.69",
  },
  {
    name: "Microsoft 365 Business Basic — Annual",
    description: "Microsoft 365 Business Basic [NCE / 1-Year term, billed monthly — best value]\nWeb and mobile Office apps (Word, Excel, PowerPoint)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nNo desktop Office apps — web/mobile only",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.83",
    costPrice: "4.11",
  },
  {
    name: "Microsoft 365 Business Standard — Monthly",
    description: "Microsoft 365 Business Standard [NCE / 1-Month term, no annual commitment]\nFull desktop Office apps (Word, Excel, PowerPoint, Outlook)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nInstalls on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "11.52",
    costPrice: "9.79",
  },
  {
    name: "Microsoft 365 Business Standard — Annual",
    description: "Microsoft 365 Business Standard [NCE / 1-Year term, billed monthly — best value]\nFull desktop Office apps (Word, Excel, PowerPoint, Outlook)\nExchange Online mailbox (50GB)\nTeams, OneDrive (1TB), SharePoint\nInstalls on up to 5 PCs/Macs and 5 mobile devices per user",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "10.08",
    costPrice: "8.57",
  },
  {
    name: "Microsoft 365 Business Premium — Monthly",
    description: "Microsoft 365 Business Premium [NCE / 1-Month term, no annual commitment]\nEverything in Business Standard\nIntune mobile device management\nAzure AD Premium P1 (conditional access, SSO)\nDefender for Business (endpoint protection)\nInformation Protection and DLP",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "20.28",
    costPrice: "17.24",
  },
  {
    name: "Microsoft 365 Business Premium — Annual",
    description: "Microsoft 365 Business Premium [NCE / 1-Year term, billed monthly — best value]\nEverything in Business Standard\nIntune mobile device management\nAzure AD Premium P1 (conditional access, SSO)\nDefender for Business (endpoint protection)\nInformation Protection and DLP",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "17.75",
    costPrice: "15.09",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 1 — Monthly",
    description: "Exchange Online Plan 1 [NCE / 1-Month term, billed monthly]\n50GB mailbox per user\nAnti-spam and anti-malware filtering\nCalendar, contacts, shared mailboxes\nWeb-based Outlook access",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "3.72",
    costPrice: "3.16",
  },
  {
    name: "Microsoft 365 Exchange Online Plan 2 — Monthly",
    description: "Exchange Online Plan 2 [NCE / 1-Month term, billed monthly]\n100GB mailbox per user\nData Loss Prevention (DLP) policies\nHosted voicemail\nUnlimited archive mailbox\nIn-place eDiscovery and hold",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "7.44",
    costPrice: "6.32",
  },
  {
    name: "Microsoft Visio Plan 2 — Monthly",
    description: "Microsoft Visio Plan 2 [NCE / 1-Month term, no annual commitment]\nDesktop Visio application\nWeb and mobile Visio apps\nAll standard and advanced shape libraries\nReal-time collaboration on diagrams",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "13.80",
    costPrice: "11.73",
  },
  {
    name: "Microsoft Visio Plan 2 — Annual",
    description: "Microsoft Visio Plan 2 [NCE / 1-Year term, billed monthly — best value]\nDesktop Visio application\nWeb and mobile Visio apps\nAll standard and advanced shape libraries\nReal-time collaboration on diagrams",
    category: "Microsoft 365 & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "12.08",
    costPrice: "10.27",
  },

  // ───────── Google Workspace & Licensing (8) ─────────
  // Google's productivity suite — Gmail, Drive, Docs, Meet, Calendar.
  // Same Monthly / Annual split as Microsoft 365 — annual term billed
  // monthly is the best-value option for committed buyers; monthly term
  // carries a small premium for flexibility. Pricing reflects 2026 list
  // rates with typical reseller margin.
  {
    name: "Google Workspace Business Starter — Monthly",
    description: "Google Workspace Business Starter [Flex / 1-Month term, no annual commitment]\nCustom email at your domain (e.g. you@yourcompany.co.uk)\n30GB pooled cloud storage per user\nGmail, Drive, Docs, Sheets, Slides, Meet, Calendar, Chat\nUp to 100-participant video meetings\nStandard support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "6.50",
    costPrice: "5.20",
  },
  {
    name: "Google Workspace Business Starter — Annual",
    description: "Google Workspace Business Starter [Annual / 1-Year term, billed monthly — best value]\nCustom email at your domain (e.g. you@yourcompany.co.uk)\n30GB pooled cloud storage per user\nGmail, Drive, Docs, Sheets, Slides, Meet, Calendar, Chat\nUp to 100-participant video meetings\nStandard support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.75",
    costPrice: "4.60",
  },
  {
    name: "Google Workspace Business Standard — Monthly",
    description: "Google Workspace Business Standard [Flex / 1-Month term, no annual commitment]\nCustom email at your domain\n2TB pooled cloud storage per user\nAll Business Starter apps plus Meet recording and noise cancellation\nUp to 150-participant video meetings\nShared team drives\nStandard support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "13.10",
    costPrice: "10.50",
  },
  {
    name: "Google Workspace Business Standard — Annual",
    description: "Google Workspace Business Standard [Annual / 1-Year term, billed monthly — best value]\nCustom email at your domain\n2TB pooled cloud storage per user\nAll Business Starter apps plus Meet recording and noise cancellation\nUp to 150-participant video meetings\nShared team drives\nStandard support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "11.50",
    costPrice: "9.20",
  },
  {
    name: "Google Workspace Business Plus — Monthly",
    description: "Google Workspace Business Plus [Flex / 1-Month term, no annual commitment]\nCustom email at your domain\n5TB pooled cloud storage per user\nAll Business Standard apps plus attendance tracking, Meet recording and noise cancellation\nUp to 500-participant video meetings\neDiscovery, retention and audit (Vault)\nEnhanced security and management controls",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "21.20",
    costPrice: "17.00",
  },
  {
    name: "Google Workspace Business Plus — Annual",
    description: "Google Workspace Business Plus [Annual / 1-Year term, billed monthly — best value]\nCustom email at your domain\n5TB pooled cloud storage per user\nAll Business Standard apps plus attendance tracking, Meet recording and noise cancellation\nUp to 500-participant video meetings\neDiscovery, retention and audit (Vault)\nEnhanced security and management controls",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "18.60",
    costPrice: "14.90",
  },
  {
    name: "Google Workspace Enterprise Standard — Monthly",
    description: "Google Workspace Enterprise Standard [Flex / 1-Month term]\nCustom email at your domain\nAs much pooled storage as needed (per request)\nAll Business Plus apps plus advanced security, DLP, and S/MIME encryption\nUp to 500-participant video meetings with attendance tracking\nEnhanced endpoint management and context-aware access\nPremium support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "19.20",
    costPrice: "15.40",
  },
  {
    name: "Google Workspace Enterprise Plus — Monthly",
    description: "Google Workspace Enterprise Plus [Flex / 1-Month term]\nCustom email at your domain\nAs much pooled storage as needed (per request)\nAll Enterprise Standard apps plus Premium Meet (up to 1,000 participants, in-domain live streaming)\nConnected Sheets for BigQuery analysis\nAdvanced endpoint management and context-aware access\nPremium support",
    category: "Google Workspace & Licensing",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "27.00",
    costPrice: "21.60",
  },

  // ───────── Security & Backup (5) ─────────
  {
    name: "ESET Endpoint Protection",
    description: "Business-grade endpoint security per device\nReal-time anti-malware and anti-phishing\nExploit blocker and ransomware shield\nWeb filtering and device control\nCentralised cloud management console",
    category: "Security & Backup",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "4.00",
    costPrice: "0.67",
  },
  {
    name: "SaaS Protect Backup (Microsoft 365 Backup)",
    description: "Cloud-to-cloud backup for Microsoft 365 data\n3× daily automated backups of Exchange, OneDrive, SharePoint, Teams\nUnlimited retention with point-in-time restore\nGranular restore at item, folder, or mailbox level\nRansomware and accidental-deletion protection",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "4.00",
    costPrice: "1.40",
  },
  {
    name: "Advanced Email Protection (E-Mail Protect)",
    description: "Advanced email threat protection per mailbox\nAnti-phishing and impersonation detection\nURL rewriting and time-of-click analysis\nAttachment sandboxing\nBusiness email compromise (BEC) protection",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "2.00",
    costPrice: "1.15",
  },
  {
    name: "Email Signature Management (Exclaimer)",
    description: "Centralised email signature management per mailbox\nConsistent branded signatures across all devices\nCampaign banners and marketing content in signatures\nSignatures applied server-side (mobile and desktop included)\nCentral admin console for updates",
    category: "Security & Backup",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "1.25",
    costPrice: "1.00",
  },
  {
    name: "Cloud Backup Device",
    description: "Managed cloud-backed backup appliance per protected device\nLocal backup with off-site cloud replication\nAutomated backup verification and integrity checks\nRapid bare-metal restore\nRansomware detection and rollback",
    category: "Security & Backup",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "68.00",
    costPrice: "30.00",
  },

  // ───────── Cyber Security (9) ─────────
  // UK-government-backed Cyber Essentials & Plus certifications administered
  // by IASME, plus the wider supporting offerings — vulnerability scanning,
  // dark web monitoring, security awareness training, hardware MFA tokens,
  // and external penetration testing. Certs use pricingType "annual" to
  // signal the 12-month renewal cadence; supporting services use
  // monthly/standard as appropriate.
  {
    name: "Cyber Essentials Certification",
    description: "UK Government-backed Cyber Essentials self-assessed certification (IASME-administered)\nAnnual certification valid 12 months\nIncludes IASME certification fee\nPre-submission review of the SAQ (Self-Assessment Questionnaire)\nGuidance on the five technical controls (firewalls, secure configuration, user access control, malware protection, patch management)\nRequired for many UK public-sector and supplier-chain tenders",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "annual",
    defaultRate: "450.00",
    costPrice: "300.00",
  },
  {
    name: "Cyber Essentials Plus Certification",
    description: "UK Government-backed Cyber Essentials Plus certification (IASME-administered)\nAnnual certification valid 12 months\nIncludes IASME certification fee and certifying-body audit day\nHands-on technical audit by qualified assessor (internal vulnerability scan, sampled device inspection, simulated phishing)\nCovers the same five technical controls as Cyber Essentials, evidenced by audit rather than self-assessment\nRequired for higher-assurance public-sector and supplier-chain tenders",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "annual",
    defaultRate: "1995.00",
    costPrice: "1250.00",
  },
  {
    name: "Cyber Essentials Readiness Support",
    description: "Hands-on engineering time to prepare a client for Cyber Essentials or Plus\nGap analysis against the five technical controls\nFirewall, patching, user access and malware protection remediation\nAsset register and policy template support\nMock SAQ walkthrough before submission\nCharged per hour, typical engagements 4–12 hours",
    category: "Cyber Security",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "95.00",
    costPrice: null,
  },
  {
    name: "Cyber Essentials Plus Audit Day",
    description: "Required onsite or remote audit day by a qualified certifying-body assessor\nInternal authenticated vulnerability scan of sampled devices\nInspection of user devices, mobile devices and cloud services\nSimulated phishing test of a sample of users\nAudit report and findings handover\nCharged per audit day — typical small/medium org requires one day",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "950.00",
    costPrice: "650.00",
  },
  {
    name: "Vulnerability Scanning — Per Device Monthly",
    description: "Managed vulnerability scanning per protected device\nMonthly external (perimeter) and authenticated internal scans\nCVE-rated findings prioritised by severity\nRemediation guidance for each finding\nTrending dashboard and monthly report\nSupports Cyber Essentials Plus and ongoing assurance",
    category: "Cyber Security",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "4.50",
    costPrice: "1.80",
  },
  {
    name: "Dark Web Monitoring — Per Domain",
    description: "Continuous dark-web monitoring per company domain\nAlerts when employee credentials, email addresses or sensitive data appear on breach forums, paste sites and dark-web marketplaces\nHistorical and ongoing scans\nMonthly summary report\nPairs well with a password manager rollout for fast credential-reset response",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "monthly",
    defaultRate: "29.00",
    costPrice: "8.00",
  },
  {
    name: "Security Awareness Training — Per User Monthly",
    description: "Managed security awareness training per user (KnowBe4-class platform)\nMonthly phishing simulations with risk-scored results\nOn-demand training modules covering phishing, password hygiene, social engineering, GDPR and ransomware\nAutomated remedial training assigned on simulation failure\nQuarterly board-ready reporting\nSupports compliance posture for Cyber Essentials Plus, ISO 27001 and Cyber Insurance",
    category: "Cyber Security",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "3.50",
    costPrice: "1.20",
  },
  {
    name: "MFA / 2FA Token (Hardware)",
    description: "Hardware multi-factor authentication token per user (YubiKey or equivalent)\nFIDO2 / WebAuthn / U2F support\nPairs with Microsoft 365, Google Workspace, Azure AD, password managers and most modern SSO platforms\nPhishing-resistant — protects against credential theft even when the password is compromised\nOne-off purchase, no per-user licence fee",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "39.00",
    costPrice: "22.00",
  },
  {
    name: "Penetration Test — Standard External",
    description: "One-off external penetration test against the customer's perimeter\nReconnaissance, port scanning, service enumeration and exploit attempts from an external attacker perspective\nCVE-rated findings with proof-of-exploit and reproduction steps\nExecutive summary plus technical report\nRemediation guidance and optional retest after fixes\nConducted by a CREST or equivalent-qualified tester",
    category: "Cyber Security",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "2495.00",
    costPrice: "1500.00",
  },

  // ───────── IT Support Contracts (2) ─────────
  {
    name: "Silver IT Support — Unlimited Remote",
    description: "Managed IT support contract per named user\nUnlimited remote helpdesk during business hours (Mon–Fri 9–5)\nTicket-based support with 4-hour response SLA\nRemote desktop assistance and troubleshooting\nSoftware and application support\nMonthly usage reporting",
    category: "IT Support Contracts",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "18.00",
    costPrice: null,
  },
  {
    name: "Gold IT Support — Unlimited Remote + 6 hrs Onsite/Month",
    description: "Premium managed IT support contract per named user\nUnlimited remote helpdesk during business hours (Mon–Fri 9–5)\n6 hours of onsite engineering per month (pooled across all users)\n4-hour response SLA\nPriority ticket handling\nMonthly onsite site visits and proactive maintenance\nMonthly service report",
    category: "IT Support Contracts",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "28.00",
    costPrice: null,
  },

  // ───────── Website Services (6) ─────────
  {
    name: "Basic Website Hosting",
    description: "Shared website hosting with domain included\n99.9% uptime SLA\nSSL certificate included\nDomain name registration included (.co.uk or .com)\nEmail forwarding\nMonthly bandwidth and storage allowance suitable for business brochure sites",
    category: "Website Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "12.99",
    costPrice: "5.00",
  },
  {
    name: "Website Hosting Plus — Hosting + 2 hrs CMS Updates/Month",
    description: "Premium website hosting with bundled content management\nEverything in Basic Website Hosting (domain, SSL, uptime SLA)\n2 hours of content updates or minor amendments per month\nCMS training and admin support\nPriority technical support on hosting issues\nIdeal for businesses that need regular content changes without a dedicated webmaster",
    category: "Website Services",
    unit: "Month",
    pricingType: "monthly",
    defaultRate: "39.99",
    costPrice: null,
  },
  {
    name: "Website Development - 7 Pages",
    description: "Custom website development with 7 pages\nResponsive design for mobile and desktop\nContent management system setup\nSEO optimisation and Google Analytics integration\nDomain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "795.00",
    costPrice: null,
  },
  {
    name: "Website with Database App",
    description: "Custom website with integrated database application\nUp to 10 pages\nBespoke database schema (forms, records, reporting)\nAdmin dashboard for record management\nResponsive design for mobile and desktop\nDomain and hosting setup included\nExcludes ongoing hosting and CMS updates",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "2495.00",
    costPrice: "900.00",
  },
  {
    name: "E-commerce Website",
    description: "Full e-commerce website with product catalog and checkout\nUp to 50 product listings (additional in blocks)\nStripe payment integration\nOrder management and customer accounts\nStock and inventory tracking\nShipping and tax configuration\nResponsive design for mobile and desktop\nDomain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "3495.00",
    costPrice: "1200.00",
  },
  {
    name: "Website with Customer Portal",
    description: "Website with secure customer login portal\nUp to 10 public pages plus authenticated customer area\nCustomer self-service: profile management, document downloads, support tickets, account history\nRole-based access control\nPassword reset and email verification flows\nResponsive design for mobile and desktop\nDomain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "3995.00",
    costPrice: "1400.00",
  },

  // ───────── Productivity Tools (1) ─────────
  {
    name: "Keeper Password Manager",
    description: "Enterprise password manager per user\nSecure encrypted password vault\nShared team vaults with role-based access\nTwo-factor authentication (2FA)\nSecure file storage and encrypted messaging\nDark web monitoring and breach alerts\nAudit logging and compliance reporting",
    category: "Productivity Tools",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "2.00",
  },

  // ───────── Engineer Labour (2) ─────────
  {
    name: "Engineer — Onsite",
    description: "Onsite IT engineering per hour\nHardware installation and cabling\nNetwork commissioning and configuration\nUser training and handover\nSite surveys and audits\nEmergency and scheduled callouts",
    category: "Engineer Labour",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "99.00",
    costPrice: null,
  },
  {
    name: "Engineer — Remote / Project Work",
    description: "Remote engineering per hour\nRemote configuration and deployments\nScripted rollouts and automation\nProject delivery and planning\nAfter-hours maintenance windows\nInfrastructure design work",
    category: "Engineer Labour",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "79.00",
    costPrice: null,
  },

  // ───────── Connectivity (24) ─────────
  // Ultrafast Broadband — FTTC, SOGEA, FTTP via DWS / NTA wholesale.
  // Monthly rentals priced per line; one-off provision charges cover line
  // install, NTU/router commissioning, and supplier activation fees.
  {
    name: "FTTC Broadband 40/10 Mbps — Monthly",
    description: "FTTC business broadband line rental via DWS/NTA wholesale\nUp to 40Mbps download / 10Mbps upload\nPSTN-backed copper-to-cabinet\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on\nNo lock-in contract option",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "24.99",
    costPrice: "15.00",
  },
  {
    name: "FTTC Broadband 80/20 Mbps — Monthly",
    description: "FTTC business broadband line rental via DWS/NTA wholesale\nUp to 80Mbps download / 20Mbps upload\nPSTN-backed copper-to-cabinet\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on\nNo lock-in contract option",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "29.99",
    costPrice: "18.00",
  },
  {
    name: "SOGEA Broadband 80/20 Mbps — Monthly",
    description: "SOGEA business broadband line rental via DWS/NTA wholesale\nSingle-Order Generic Ethernet Access — no PSTN voice line required\nUp to 80Mbps download / 20Mbps upload\nBusiness-grade SLA and 24×7 support\nIdeal for VoIP-only sites with no analogue phone",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "32.99",
    costPrice: "19.50",
  },
  {
    name: "FTTP Broadband 100/20 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale\nUp to 100Mbps download / 20Mbps upload\nFibre-to-the-premises — no copper segment\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "39.99",
    costPrice: "24.00",
  },
  {
    name: "FTTP Broadband 300/50 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale\nUp to 300Mbps download / 50Mbps upload\nFibre-to-the-premises — no copper segment\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "49.99",
    costPrice: "30.00",
  },
  {
    name: "FTTP Broadband 500/75 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale\nUp to 500Mbps download / 75Mbps upload\nFibre-to-the-premises — no copper segment\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "59.99",
    costPrice: "36.00",
  },
  {
    name: "FTTP Broadband 1Gbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale\nUp to 1Gbps download / 115Mbps upload\nFibre-to-the-premises — no copper segment\nBusiness-grade SLA and 24×7 support\nStatic IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "79.99",
    costPrice: "48.00",
  },
  {
    name: "Broadband Static IP — Single IPv4",
    description: "Single static public IPv4 address\nProvisioned against an active FTTC, SOGEA or FTTP line\nRequired for inbound VPN, hosted services or fixed-IP firewalling\nRouted via the existing supplier — no router change required",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "2.00",
  },
  {
    name: "Broadband Static IP — /29 Block (5 usable)",
    description: "/29 block of static public IPv4 addresses (5 usable)\nProvisioned against an active FTTC, SOGEA or FTTP line\nFor sites with multiple inbound services, DMZ hosting or per-service firewall rules\nRouted via the existing supplier — no router change required",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "15.00",
    costPrice: "6.00",
  },
  {
    name: "Broadband Provision — FTTC / SOGEA",
    description: "One-off provision of an FTTC or SOGEA business broadband line\nIncludes wholesale line install and activation fee\nNew business-grade router and firewall supplied and configured\nOnsite engineer commissioning and handover\nTypical install window 10–15 working days",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "149.00",
    costPrice: "80.00",
  },
  {
    name: "Broadband Provision — FTTP",
    description: "One-off provision of an FTTP full-fibre business broadband line\nIncludes wholesale fibre install and activation fee\nNew business-grade router and firewall supplied and configured\nOnsite engineer commissioning and handover\nTypical install window 15–30 working days subject to fibre availability",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "249.00",
    costPrice: "150.00",
  },

  // Leased Lines & SD-WAN — dedicated uncontended fibre with SLA, plus
  // SD-WAN overlay for multi-site traffic management.
  {
    name: "Leased Line 100Mbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit\n100Mbps symmetric (upload = download)\n99.9% uptime SLA with financial credits\n4-hour engineer response on-site\nNo contention, no fair-use policy\nNTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "249.00",
    costPrice: "160.00",
  },
  {
    name: "Leased Line 200Mbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit\n200Mbps symmetric (upload = download)\n99.9% uptime SLA with financial credits\n4-hour engineer response on-site\nNo contention, no fair-use policy\nNTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "329.00",
    costPrice: "210.00",
  },
  {
    name: "Leased Line 500Mbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit\n500Mbps symmetric (upload = download)\n99.9% uptime SLA with financial credits\n4-hour engineer response on-site\nNo contention, no fair-use policy\nNTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "449.00",
    costPrice: "290.00",
  },
  {
    name: "Leased Line 1Gbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit\n1Gbps symmetric (upload = download)\n99.9% uptime SLA with financial credits\n4-hour engineer response on-site\nNo contention, no fair-use policy\nNTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "599.00",
    costPrice: "390.00",
  },
  {
    name: "Leased Line 10Gbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit\n10Gbps symmetric (upload = download)\n99.9% uptime SLA with financial credits\n4-hour engineer response on-site\nEnterprise-grade for data centres, headquarters and high-bandwidth workflows\nNTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "1899.00",
    costPrice: "1250.00",
  },
  {
    name: "Leased Line Provision (Standard 90-day)",
    description: "One-off provision of a dedicated leased line circuit\nStandard 90-day install window (subject to wayleaves and civils)\nWholesale install and activation fee included\nNTU (Network Termination Unit) and edge router supplied and configured\nOnsite engineer commissioning, BGP/static routing setup, handover documentation",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "1500.00",
    costPrice: "950.00",
  },
  {
    name: "SD-WAN Edge Device — Monthly",
    description: "Managed SD-WAN edge appliance per site\nCloud-managed via centralised dashboard\nApplication-aware traffic shaping and QoS\nAutomatic failover between WAN links (e.g. leased line + 4G backup)\nSite-to-site VPN mesh with zero-touch onboarding",
    category: "Connectivity",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "45.00",
    costPrice: "22.00",
  },
  {
    name: "SD-WAN Management Per Site — Monthly",
    description: "SD-WAN cloud management licence per site\nCentralised orchestration and policy management\nApplication-level visibility and reporting\nReal-time link quality monitoring (latency, jitter, packet loss)\nMulti-site traffic prioritisation rules",
    category: "Connectivity",
    unit: "Site",
    pricingType: "monthly",
    defaultRate: "75.00",
    costPrice: "30.00",
  },

  // 4G / 5G Backup — automatic failover for always-on sites
  {
    name: "4G/5G Failover Router with SIM — Monthly",
    description: "Managed 4G/5G failover router with multi-carrier SIM\nSub-60-second automatic failover when the primary line drops\nMulti-carrier SIM auto-selects the strongest signal (EE, O2, Vodafone, Three)\nHardware included and centrally managed\nReal-time monitoring and alerting on failover events\nPairs with any primary connection",
    category: "Connectivity",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "49.00",
    costPrice: "25.00",
  },
  {
    name: "4G/5G Backup Provision",
    description: "One-off provision of a 4G/5G failover solution\nHardware supplied, configured and shipped\nOnsite or remote commissioning and failover testing\nSIM activation and carrier selection\nIntegration with existing primary router or firewall",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "199.00",
    costPrice: "110.00",
  },

  // Satellite Internet — remote sites, rural locations, anywhere terrestrial fails
  {
    name: "Satellite Internet — Standard — Monthly",
    description: "High-speed satellite internet for remote or rural sites\nUp to 200Mbps download\nSub-50ms latency on modern LEO networks\nIdeal for sites where terrestrial fibre or 4G coverage is unavailable\n24×7 monitoring and support",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "89.00",
    costPrice: "55.00",
  },
  {
    name: "Satellite Internet — Priority Business — Monthly",
    description: "Priority-tier satellite internet for business-critical remote sites\nPrioritised throughput during peak hours\nHigher data allowance for sustained workloads\nSub-50ms latency on modern LEO networks\n24×7 monitoring and priority support",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "179.00",
    costPrice: "115.00",
  },
  {
    name: "Satellite Internet Provision",
    description: "One-off provision of a satellite internet connection\nSatellite dish, mounting hardware and router supplied\nOnsite engineer install, alignment and commissioning\nSuitable for rural offices, construction sites, marine and remote-location deployment\nService activation included",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "599.00",
    costPrice: "380.00",
  },

  // ───────── Wi-Fi & LAN (5) ─────────
  {
    name: "Wi-Fi Access Point — Cisco Meraki (Cloud Managed)",
    description: "Enterprise-grade cloud-managed wireless access point (Cisco Meraki)\nHardware supplied, ex licensing\nWi-Fi 6 / 802.11ax dual-band\nCloud dashboard for centralised configuration and monitoring\nSeamless roaming across multi-AP deployments\nPoE-powered, ceiling or wall mount",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "349.00",
    costPrice: "220.00",
  },
  {
    name: "Wi-Fi Access Point — Ubiquiti UniFi",
    description: "Enterprise-grade Ubiquiti UniFi wireless access point\nWi-Fi 6 / 802.11ax dual-band\nCentralised management via UniFi controller (cloud or on-prem)\nGuest network isolation and bandwidth limits\nSeamless roaming across multi-AP deployments\nPoE-powered, ceiling or wall mount",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "179.00",
    costPrice: "110.00",
  },
  {
    name: "Wi-Fi Cloud Licence Per AP — Monthly",
    description: "Cloud management licence per wireless access point\nCentralised cloud dashboard for configuration, monitoring and alerts\nPer-AP per-month licence (Meraki or equivalent)\nRequired for cloud-managed Wi-Fi deployments\nIncludes firmware updates and 24×7 support",
    category: "Wi-Fi & LAN",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "6.00",
    costPrice: "2.50",
  },
  {
    name: "Wi-Fi Site Survey",
    description: "Pre-installation wireless site survey\nFloor-plan walkthrough with spectrum analyser and RF planning tool\nAP placement recommendations to ensure full coverage\nChannel and interference analysis on 2.4GHz and 5GHz bands\nHeatmap deliverable and proposal for AP count and positioning\nRequired for multi-AP, multi-floor or warehouse deployments",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "450.00",
    costPrice: null,
  },
  {
    name: "Wi-Fi Network Installation",
    description: "Wireless network installation per hour of engineering\nCable run, mount and termination per AP\nAP commissioning and onboarding to cloud controller\nSSID and VLAN configuration\nGuest network setup and testing\nCoverage validation against the site survey",
    category: "Wi-Fi & LAN",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "99.00",
    costPrice: null,
  },

  // ───────── SIP & Voice Lines (6) ─────────
  {
    name: "SIP Trunk Channel (Gamma) — Monthly",
    description: "SIP trunk channel via Gamma network\nOne concurrent call per channel\nPairs with any PBX or IP-PBX (3CX, Avaya, Mitel, hosted)\nISDN replacement — modern, scalable, cost-effective\nUK landline minutes typically bundled by carrier — verify with quote",
    category: "SIP & Voice Lines",
    unit: "Channel",
    pricingType: "monthly",
    defaultRate: "6.50",
    costPrice: "3.50",
  },
  {
    name: "SIP Trunk DDI — Single Number",
    description: "Single Direct Dial-In number on a SIP trunk\nGeographic, non-geographic or memorable number options\nRouted to any extension or hunt group on the customer's PBX\nIncludes ongoing carriage of the number\nNumber porting from another carrier available — see Number Porting item",
    category: "SIP & Voice Lines",
    unit: "Number",
    pricingType: "monthly",
    defaultRate: "1.00",
    costPrice: "0.30",
  },
  {
    name: "SIP Trunk DDI — Block of 10",
    description: "Block of 10 sequential Direct Dial-In numbers on a SIP trunk\nSuitable for small businesses needing individual extensions per user\nGeographic numbers tied to a town/city area code\nRouted to any extension or hunt group on the customer's PBX",
    category: "SIP & Voice Lines",
    unit: "Block",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "1.50",
  },
  {
    name: "SIP Trunk DDI — Block of 100",
    description: "Block of 100 sequential Direct Dial-In numbers on a SIP trunk\nSuitable for larger organisations or contact centres\nGeographic numbers tied to a town/city area code\nRouted to extensions, hunt groups, IVR or queues on the customer's PBX",
    category: "SIP & Voice Lines",
    unit: "Block",
    pricingType: "monthly",
    defaultRate: "20.00",
    costPrice: "8.00",
  },
  {
    name: "Number Porting (Per Number)",
    description: "One-off port of an existing telephone number from another carrier\nNumber ownership transferred to the new SIP trunk\nIncludes carrier liaison and porting paperwork\nNo loss of number — customer keeps their existing identity\nTypical port window 5–10 working days for geographic numbers",
    category: "SIP & Voice Lines",
    unit: "Number",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: "5.00",
  },
  {
    name: "SIP Trunk Provision & Setup",
    description: "One-off provision and setup of a SIP trunk\nCarrier account provisioning (Gamma)\nPBX configuration and SIP credentials\nTest calls inbound and outbound\nFailover routing setup if multiple lines\nHandover documentation",
    category: "SIP & Voice Lines",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "150.00",
    costPrice: "50.00",
  },

  // ───────── VoIP Telephony (10) ─────────
  // Hosted PBX user packages — three tiers — plus handsets and setup.
  {
    name: "VoIP Essentials — Per User Monthly",
    description: "Hosted VoIP telephony — Essentials tier\nPer-user softphone for desktop and mobile\nVoicemail to email\nBasic IVR / auto-attendant\nUK landline minutes included\nWeb-based admin portal for call routing changes",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "9.99",
    costPrice: "5.50",
  },
  {
    name: "VoIP Standard — Per User Monthly",
    description: "Hosted VoIP telephony — Standard tier\nEverything in Essentials\nUK mobile minutes included\nCall recording with cloud retention\nMicrosoft Teams integration (click-to-dial, presence sync)\nHunt groups and ring groups\nVoicemail transcription",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "14.99",
    costPrice: "8.50",
  },
  {
    name: "VoIP Premium — Per User Monthly",
    description: "Hosted VoIP telephony — Premium tier\nEverything in Standard\nInternational minutes included (Zone 1 — most EU, US, Canada)\nCRM integration (Salesforce, HubSpot, Microsoft Dynamics)\nAdvanced reporting and analytics dashboard\nReal-time wallboards for contact centres\nPriority support SLA",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "19.99",
    costPrice: "11.50",
  },
  {
    name: "VoIP Handset — Entry (Yealink T31G)",
    description: "Yealink T31G entry-level VoIP handset\n2.3-inch graphical display\n2 SIP accounts\nGigabit Ethernet pass-through (PoE or PSU)\nHD voice (G.722)\nSuitable for general office use",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "79.00",
    costPrice: "45.00",
  },
  {
    name: "VoIP Handset — Mid (Yealink T54W)",
    description: "Yealink T54W mid-range VoIP handset\n4.3-inch colour display\nBuilt-in Wi-Fi and Bluetooth\n16 SIP accounts\nGigabit Ethernet, PoE-powered\nHD voice (Opus / G.722)\nUSB headset support\nSuitable for power users, reception and customer-facing roles",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "189.00",
    costPrice: "115.00",
  },
  {
    name: "VoIP Handset — Executive (Yealink T57W Touch)",
    description: "Yealink T57W executive VoIP handset\n7-inch capacitive touchscreen\nBuilt-in Wi-Fi and Bluetooth\n16 SIP accounts\nGigabit Ethernet, PoE-powered\nHD voice (Opus / G.722)\nBluetooth headset and mobile pairing\nSuitable for executives, managers and high-call-volume users",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "279.00",
    costPrice: "170.00",
  },
  {
    name: "VoIP DECT Cordless Handset (Yealink W73P)",
    description: "Yealink W73P DECT cordless VoIP system\nW73H handset paired with W70B base station\nUp to 10 handsets per base\nHD voice (G.722)\nUp to 30 hours talk time\nSuitable for warehouses, shop floors and mobile staff",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "199.00",
    costPrice: "125.00",
  },
  {
    name: "VoIP Conference Phone (Yealink CP925)",
    description: "Yealink CP925 conference phone\nBuilt-in Wi-Fi and Bluetooth\n6-microphone array with 360° voice pickup, 6-metre range\n5-inch touchscreen\nHD voice and noise cancellation\nPoE-powered\nSuitable for meeting rooms and boardrooms",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "349.00",
    costPrice: "220.00",
  },
  {
    name: "VoIP System Provision & Setup",
    description: "One-off provision and setup of a hosted VoIP system\nTenant build on the hosted PBX platform\nCall flow design (IVR, hunt groups, time-of-day routing)\nVoicemail and auto-attendant configuration\nUser and handset onboarding\nTraining session for admin and end users\nHandover documentation",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "299.00",
    costPrice: "100.00",
  },
  {
    name: "VoIP User Onboarding (Per User)",
    description: "Per-user onboarding for a new VoIP seat\nUser account provisioning on the hosted PBX\nHandset registration and physical setup at desk\nSoftphone install on desktop and mobile\nVoicemail PIN setup and greeting recording\n15-minute end-user walkthrough",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: null,
  },
] as const;
