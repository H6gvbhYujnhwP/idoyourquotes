/**
 * IT Services / MSP — Starter Catalog Seed
 *
 * 81 items covering the common product stack for a UK MSP starting out:
 * Microsoft 365 licensing, security & backup, IT support contracts,
 * website services, productivity tools, engineer labour rates, plus the
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
 * Category set (10):
 *   1.  Microsoft 365 & Licensing
 *   2.  Security & Backup
 *   3.  IT Support Contracts
 *   4.  Website Services
 *   5.  Productivity Tools
 *   6.  Engineer Labour
 *   7.  Connectivity              (NEW — 24 items)
 *   8.  Wi-Fi & LAN               (NEW — 5 items)
 *   9.  SIP & Voice Lines         (NEW — 6 items)
 *   10. VoIP Telephony            (NEW — 10 items)
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

  // ───────── Website Services (6) ─────────
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
  {
    name: "Website Development - 7 Pages",
    description: "Custom website development with 7 pages || Responsive design for mobile and desktop || Content management system setup || SEO optimisation and Google Analytics integration || Domain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "795.00",
    costPrice: null,
  },
  {
    name: "Website with Database App",
    description: "Custom website with integrated database application || Up to 10 pages || Bespoke database schema (forms, records, reporting) || Admin dashboard for record management || Responsive design for mobile and desktop || Domain and hosting setup included || Excludes ongoing hosting and CMS updates",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "2495.00",
    costPrice: "900.00",
  },
  {
    name: "E-commerce Website",
    description: "Full e-commerce website with product catalog and checkout || Up to 50 product listings (additional in blocks) || Stripe payment integration || Order management and customer accounts || Stock and inventory tracking || Shipping and tax configuration || Responsive design for mobile and desktop || Domain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "3495.00",
    costPrice: "1200.00",
  },
  {
    name: "Website with Customer Portal",
    description: "Website with secure customer login portal || Up to 10 public pages plus authenticated customer area || Customer self-service: profile management, document downloads, support tickets, account history || Role-based access control || Password reset and email verification flows || Responsive design for mobile and desktop || Domain and hosting setup included",
    category: "Website Services",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "3995.00",
    costPrice: "1400.00",
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

  // ───────── Connectivity (24) ─────────
  // Ultrafast Broadband — FTTC, SOGEA, FTTP via DWS / NTA wholesale.
  // Monthly rentals priced per line; one-off provision charges cover line
  // install, NTU/router commissioning, and supplier activation fees.
  {
    name: "FTTC Broadband 40/10 Mbps — Monthly",
    description: "FTTC business broadband line rental via DWS/NTA wholesale || Up to 40Mbps download / 10Mbps upload || PSTN-backed copper-to-cabinet || Business-grade SLA and 24×7 support || Static IP available as an add-on || No lock-in contract option",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "24.99",
    costPrice: "15.00",
  },
  {
    name: "FTTC Broadband 80/20 Mbps — Monthly",
    description: "FTTC business broadband line rental via DWS/NTA wholesale || Up to 80Mbps download / 20Mbps upload || PSTN-backed copper-to-cabinet || Business-grade SLA and 24×7 support || Static IP available as an add-on || No lock-in contract option",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "29.99",
    costPrice: "18.00",
  },
  {
    name: "SOGEA Broadband 80/20 Mbps — Monthly",
    description: "SOGEA business broadband line rental via DWS/NTA wholesale || Single-Order Generic Ethernet Access — no PSTN voice line required || Up to 80Mbps download / 20Mbps upload || Business-grade SLA and 24×7 support || Ideal for VoIP-only sites with no analogue phone",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "32.99",
    costPrice: "19.50",
  },
  {
    name: "FTTP Broadband 100/20 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale || Up to 100Mbps download / 20Mbps upload || Fibre-to-the-premises — no copper segment || Business-grade SLA and 24×7 support || Static IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "39.99",
    costPrice: "24.00",
  },
  {
    name: "FTTP Broadband 300/50 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale || Up to 300Mbps download / 50Mbps upload || Fibre-to-the-premises — no copper segment || Business-grade SLA and 24×7 support || Static IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "49.99",
    costPrice: "30.00",
  },
  {
    name: "FTTP Broadband 500/75 Mbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale || Up to 500Mbps download / 75Mbps upload || Fibre-to-the-premises — no copper segment || Business-grade SLA and 24×7 support || Static IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "59.99",
    costPrice: "36.00",
  },
  {
    name: "FTTP Broadband 1Gbps — Monthly",
    description: "FTTP full-fibre business broadband via DWS/NTA wholesale || Up to 1Gbps download / 115Mbps upload || Fibre-to-the-premises — no copper segment || Business-grade SLA and 24×7 support || Static IP available as an add-on",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "79.99",
    costPrice: "48.00",
  },
  {
    name: "Broadband Static IP — Single IPv4",
    description: "Single static public IPv4 address || Provisioned against an active FTTC, SOGEA or FTTP line || Required for inbound VPN, hosted services or fixed-IP firewalling || Routed via the existing supplier — no router change required",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "2.00",
  },
  {
    name: "Broadband Static IP — /29 Block (5 usable)",
    description: "/29 block of static public IPv4 addresses (5 usable) || Provisioned against an active FTTC, SOGEA or FTTP line || For sites with multiple inbound services, DMZ hosting or per-service firewall rules || Routed via the existing supplier — no router change required",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "15.00",
    costPrice: "6.00",
  },
  {
    name: "Broadband Provision — FTTC / SOGEA",
    description: "One-off provision of an FTTC or SOGEA business broadband line || Includes wholesale line install and activation fee || New business-grade router and firewall supplied and configured || Onsite engineer commissioning and handover || Typical install window 10–15 working days",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "149.00",
    costPrice: "80.00",
  },
  {
    name: "Broadband Provision — FTTP",
    description: "One-off provision of an FTTP full-fibre business broadband line || Includes wholesale fibre install and activation fee || New business-grade router and firewall supplied and configured || Onsite engineer commissioning and handover || Typical install window 15–30 working days subject to fibre availability",
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
    description: "Dedicated uncontended fibre Ethernet circuit || 100Mbps symmetric (upload = download) || 99.9% uptime SLA with financial credits || 4-hour engineer response on-site || No contention, no fair-use policy || NTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "249.00",
    costPrice: "160.00",
  },
  {
    name: "Leased Line 200Mbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit || 200Mbps symmetric (upload = download) || 99.9% uptime SLA with financial credits || 4-hour engineer response on-site || No contention, no fair-use policy || NTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "329.00",
    costPrice: "210.00",
  },
  {
    name: "Leased Line 500Mbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit || 500Mbps symmetric (upload = download) || 99.9% uptime SLA with financial credits || 4-hour engineer response on-site || No contention, no fair-use policy || NTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "449.00",
    costPrice: "290.00",
  },
  {
    name: "Leased Line 1Gbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit || 1Gbps symmetric (upload = download) || 99.9% uptime SLA with financial credits || 4-hour engineer response on-site || No contention, no fair-use policy || NTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "599.00",
    costPrice: "390.00",
  },
  {
    name: "Leased Line 10Gbps Symmetric — Monthly",
    description: "Dedicated uncontended fibre Ethernet circuit || 10Gbps symmetric (upload = download) || 99.9% uptime SLA with financial credits || 4-hour engineer response on-site || Enterprise-grade for data centres, headquarters and high-bandwidth workflows || NTU and edge router included",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "1899.00",
    costPrice: "1250.00",
  },
  {
    name: "Leased Line Provision (Standard 90-day)",
    description: "One-off provision of a dedicated leased line circuit || Standard 90-day install window (subject to wayleaves and civils) || Wholesale install and activation fee included || NTU (Network Termination Unit) and edge router supplied and configured || Onsite engineer commissioning, BGP/static routing setup, handover documentation",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "1500.00",
    costPrice: "950.00",
  },
  {
    name: "SD-WAN Edge Device — Monthly",
    description: "Managed SD-WAN edge appliance per site || Cloud-managed via centralised dashboard || Application-aware traffic shaping and QoS || Automatic failover between WAN links (e.g. leased line + 4G backup) || Site-to-site VPN mesh with zero-touch onboarding",
    category: "Connectivity",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "45.00",
    costPrice: "22.00",
  },
  {
    name: "SD-WAN Management Per Site — Monthly",
    description: "SD-WAN cloud management licence per site || Centralised orchestration and policy management || Application-level visibility and reporting || Real-time link quality monitoring (latency, jitter, packet loss) || Multi-site traffic prioritisation rules",
    category: "Connectivity",
    unit: "Site",
    pricingType: "monthly",
    defaultRate: "75.00",
    costPrice: "30.00",
  },

  // 4G / 5G Backup — automatic failover for always-on sites
  {
    name: "4G/5G Failover Router with SIM — Monthly",
    description: "Managed 4G/5G failover router with multi-carrier SIM || Sub-60-second automatic failover when the primary line drops || Multi-carrier SIM auto-selects the strongest signal (EE, O2, Vodafone, Three) || Hardware included and centrally managed || Real-time monitoring and alerting on failover events || Pairs with any primary connection",
    category: "Connectivity",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "49.00",
    costPrice: "25.00",
  },
  {
    name: "4G/5G Backup Provision",
    description: "One-off provision of a 4G/5G failover solution || Hardware supplied, configured and shipped || Onsite or remote commissioning and failover testing || SIM activation and carrier selection || Integration with existing primary router or firewall",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "199.00",
    costPrice: "110.00",
  },

  // Satellite Internet — remote sites, rural locations, anywhere terrestrial fails
  {
    name: "Satellite Internet — Standard — Monthly",
    description: "High-speed satellite internet for remote or rural sites || Up to 200Mbps download || Sub-50ms latency on modern LEO networks || Ideal for sites where terrestrial fibre or 4G coverage is unavailable || 24×7 monitoring and support",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "89.00",
    costPrice: "55.00",
  },
  {
    name: "Satellite Internet — Priority Business — Monthly",
    description: "Priority-tier satellite internet for business-critical remote sites || Prioritised throughput during peak hours || Higher data allowance for sustained workloads || Sub-50ms latency on modern LEO networks || 24×7 monitoring and priority support",
    category: "Connectivity",
    unit: "Line",
    pricingType: "monthly",
    defaultRate: "179.00",
    costPrice: "115.00",
  },
  {
    name: "Satellite Internet Provision",
    description: "One-off provision of a satellite internet connection || Satellite dish, mounting hardware and router supplied || Onsite engineer install, alignment and commissioning || Suitable for rural offices, construction sites, marine and remote-location deployment || Service activation included",
    category: "Connectivity",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "599.00",
    costPrice: "380.00",
  },

  // ───────── Wi-Fi & LAN (5) ─────────
  {
    name: "Wi-Fi Access Point — Cisco Meraki (Cloud Managed)",
    description: "Enterprise-grade cloud-managed wireless access point (Cisco Meraki) || Hardware supplied, ex licensing || Wi-Fi 6 / 802.11ax dual-band || Cloud dashboard for centralised configuration and monitoring || Seamless roaming across multi-AP deployments || PoE-powered, ceiling or wall mount",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "349.00",
    costPrice: "220.00",
  },
  {
    name: "Wi-Fi Access Point — Ubiquiti UniFi",
    description: "Enterprise-grade Ubiquiti UniFi wireless access point || Wi-Fi 6 / 802.11ax dual-band || Centralised management via UniFi controller (cloud or on-prem) || Guest network isolation and bandwidth limits || Seamless roaming across multi-AP deployments || PoE-powered, ceiling or wall mount",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "179.00",
    costPrice: "110.00",
  },
  {
    name: "Wi-Fi Cloud Licence Per AP — Monthly",
    description: "Cloud management licence per wireless access point || Centralised cloud dashboard for configuration, monitoring and alerts || Per-AP per-month licence (Meraki or equivalent) || Required for cloud-managed Wi-Fi deployments || Includes firmware updates and 24×7 support",
    category: "Wi-Fi & LAN",
    unit: "Device",
    pricingType: "monthly",
    defaultRate: "6.00",
    costPrice: "2.50",
  },
  {
    name: "Wi-Fi Site Survey",
    description: "Pre-installation wireless site survey || Floor-plan walkthrough with spectrum analyser and RF planning tool || AP placement recommendations to ensure full coverage || Channel and interference analysis on 2.4GHz and 5GHz bands || Heatmap deliverable and proposal for AP count and positioning || Required for multi-AP, multi-floor or warehouse deployments",
    category: "Wi-Fi & LAN",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "450.00",
    costPrice: null,
  },
  {
    name: "Wi-Fi Network Installation",
    description: "Wireless network installation per hour of engineering || Cable run, mount and termination per AP || AP commissioning and onboarding to cloud controller || SSID and VLAN configuration || Guest network setup and testing || Coverage validation against the site survey",
    category: "Wi-Fi & LAN",
    unit: "Hour",
    pricingType: "standard",
    defaultRate: "99.00",
    costPrice: null,
  },

  // ───────── SIP & Voice Lines (6) ─────────
  {
    name: "SIP Trunk Channel (Gamma) — Monthly",
    description: "SIP trunk channel via Gamma network || One concurrent call per channel || Pairs with any PBX or IP-PBX (3CX, Avaya, Mitel, hosted) || ISDN replacement — modern, scalable, cost-effective || UK landline minutes typically bundled by carrier — verify with quote",
    category: "SIP & Voice Lines",
    unit: "Channel",
    pricingType: "monthly",
    defaultRate: "6.50",
    costPrice: "3.50",
  },
  {
    name: "SIP Trunk DDI — Single Number",
    description: "Single Direct Dial-In number on a SIP trunk || Geographic, non-geographic or memorable number options || Routed to any extension or hunt group on the customer's PBX || Includes ongoing carriage of the number || Number porting from another carrier available — see Number Porting item",
    category: "SIP & Voice Lines",
    unit: "Number",
    pricingType: "monthly",
    defaultRate: "1.00",
    costPrice: "0.30",
  },
  {
    name: "SIP Trunk DDI — Block of 10",
    description: "Block of 10 sequential Direct Dial-In numbers on a SIP trunk || Suitable for small businesses needing individual extensions per user || Geographic numbers tied to a town/city area code || Routed to any extension or hunt group on the customer's PBX",
    category: "SIP & Voice Lines",
    unit: "Block",
    pricingType: "monthly",
    defaultRate: "5.00",
    costPrice: "1.50",
  },
  {
    name: "SIP Trunk DDI — Block of 100",
    description: "Block of 100 sequential Direct Dial-In numbers on a SIP trunk || Suitable for larger organisations or contact centres || Geographic numbers tied to a town/city area code || Routed to extensions, hunt groups, IVR or queues on the customer's PBX",
    category: "SIP & Voice Lines",
    unit: "Block",
    pricingType: "monthly",
    defaultRate: "20.00",
    costPrice: "8.00",
  },
  {
    name: "Number Porting (Per Number)",
    description: "One-off port of an existing telephone number from another carrier || Number ownership transferred to the new SIP trunk || Includes carrier liaison and porting paperwork || No loss of number — customer keeps their existing identity || Typical port window 5–10 working days for geographic numbers",
    category: "SIP & Voice Lines",
    unit: "Number",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: "5.00",
  },
  {
    name: "SIP Trunk Provision & Setup",
    description: "One-off provision and setup of a SIP trunk || Carrier account provisioning (Gamma) || PBX configuration and SIP credentials || Test calls inbound and outbound || Failover routing setup if multiple lines || Handover documentation",
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
    description: "Hosted VoIP telephony — Essentials tier || Per-user softphone for desktop and mobile || Voicemail to email || Basic IVR / auto-attendant || UK landline minutes included || Web-based admin portal for call routing changes",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "9.99",
    costPrice: "5.50",
  },
  {
    name: "VoIP Standard — Per User Monthly",
    description: "Hosted VoIP telephony — Standard tier || Everything in Essentials || UK mobile minutes included || Call recording with cloud retention || Microsoft Teams integration (click-to-dial, presence sync) || Hunt groups and ring groups || Voicemail transcription",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "14.99",
    costPrice: "8.50",
  },
  {
    name: "VoIP Premium — Per User Monthly",
    description: "Hosted VoIP telephony — Premium tier || Everything in Standard || International minutes included (Zone 1 — most EU, US, Canada) || CRM integration (Salesforce, HubSpot, Microsoft Dynamics) || Advanced reporting and analytics dashboard || Real-time wallboards for contact centres || Priority support SLA",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "monthly",
    defaultRate: "19.99",
    costPrice: "11.50",
  },
  {
    name: "VoIP Handset — Entry (Yealink T31G)",
    description: "Yealink T31G entry-level VoIP handset || 2.3-inch graphical display || 2 SIP accounts || Gigabit Ethernet pass-through (PoE or PSU) || HD voice (G.722) || Suitable for general office use",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "79.00",
    costPrice: "45.00",
  },
  {
    name: "VoIP Handset — Mid (Yealink T54W)",
    description: "Yealink T54W mid-range VoIP handset || 4.3-inch colour display || Built-in Wi-Fi and Bluetooth || 16 SIP accounts || Gigabit Ethernet, PoE-powered || HD voice (Opus / G.722) || USB headset support || Suitable for power users, reception and customer-facing roles",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "189.00",
    costPrice: "115.00",
  },
  {
    name: "VoIP Handset — Executive (Yealink T57W Touch)",
    description: "Yealink T57W executive VoIP handset || 7-inch capacitive touchscreen || Built-in Wi-Fi and Bluetooth || 16 SIP accounts || Gigabit Ethernet, PoE-powered || HD voice (Opus / G.722) || Bluetooth headset and mobile pairing || Suitable for executives, managers and high-call-volume users",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "279.00",
    costPrice: "170.00",
  },
  {
    name: "VoIP DECT Cordless Handset (Yealink W73P)",
    description: "Yealink W73P DECT cordless VoIP system || W73H handset paired with W70B base station || Up to 10 handsets per base || HD voice (G.722) || Up to 30 hours talk time || Suitable for warehouses, shop floors and mobile staff",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "199.00",
    costPrice: "125.00",
  },
  {
    name: "VoIP Conference Phone (Yealink CP925)",
    description: "Yealink CP925 conference phone || Built-in Wi-Fi and Bluetooth || 6-microphone array with 360° voice pickup, 6-metre range || 5-inch touchscreen || HD voice and noise cancellation || PoE-powered || Suitable for meeting rooms and boardrooms",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "349.00",
    costPrice: "220.00",
  },
  {
    name: "VoIP System Provision & Setup",
    description: "One-off provision and setup of a hosted VoIP system || Tenant build on the hosted PBX platform || Call flow design (IVR, hunt groups, time-of-day routing) || Voicemail and auto-attendant configuration || User and handset onboarding || Training session for admin and end users || Handover documentation",
    category: "VoIP Telephony",
    unit: "Each",
    pricingType: "standard",
    defaultRate: "299.00",
    costPrice: "100.00",
  },
  {
    name: "VoIP User Onboarding (Per User)",
    description: "Per-user onboarding for a new VoIP seat || User account provisioning on the hosted PBX || Handset registration and physical setup at desk || Softphone install on desktop and mobile || Voicemail PIN setup and greeting recording || 15-minute end-user walkthrough",
    category: "VoIP Telephony",
    unit: "User",
    pricingType: "standard",
    defaultRate: "15.00",
    costPrice: null,
  },
] as const;
