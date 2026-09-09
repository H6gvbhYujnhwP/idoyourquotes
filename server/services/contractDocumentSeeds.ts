/**
 * contractDocumentSeeds.ts
 *
 * Contract-button delivery, stage 1 — the starting content for an
 * organisation's Gold and Silver contract documents.
 *
 * PROVENANCE: every clause below is transcribed from Sweetbyte's two
 * live signed contracts (Howgates Estate Agents, 1 October 2026, Gold;
 * Sorrells Custom Wine Cellars, 22 August 2026, Silver). The wording is
 * theirs, not invented, with three deliberate exceptions flagged inline
 * as CHANGED.
 *
 * ⚠️  LEGAL REVIEW REQUIRED. Clause 6 has been rewritten to cover MDR,
 * ITDR and SentinelOne EDR and to set out a liability position on
 * security incidents. It is drafted to be defensible rather than
 * absolute: a blanket "the provider is never at fault" exclusion would
 * very likely fail the reasonableness test under the Unfair Contract
 * Terms Act 1977 and could be struck out in full, taking the useful
 * protection with it. Specific, reasoned carve-outs stand a far better
 * chance of surviving. This is not legal advice and must be reviewed by
 * a solicitor before it reaches a client.
 *
 * PLACEHOLDERS. The renderer substitutes these at generation time from
 * the quote and the organisation record. Anything not in this list is
 * printed literally:
 *
 *   {{providerName}}        Sweetbyte Ltd
 *   {{customerName}}        the client on the quote
 *   {{commencementDate}}    typed by the user on the contract dialog
 *   {{firstInvoiceMonth}}   derived from commencementDate
 *   {{monthlyFeeExVat}}     the quote's monthly recurring total
 *   {{monthlyFeeIncVat}}    the same figure with VAT applied
 *   {{vatRate}}             the quote's VAT rate
 *
 * SEEDING BEHAVIOUR: these are a starting point, copied into the
 * organisation's own rows on first use. Once seeded, the org's copy is
 * authoritative and is never overwritten by a later change here — an
 * edit Wez makes in Settings must not be silently reverted by a deploy.
 */

export interface ContractClause {
  number: number;
  heading: string;
  body: string;
}

export interface ContractDocumentSeed {
  tier: "gold" | "silver";
  displayName: string;
  clauses: ContractClause[];
  acceptanceBody: string;
  nextStepsBody: string;
  thankYouBody: string;
  pricingCaveatBody: string;
}

// ─── Clauses shared verbatim across both packages ────────────────────
//
// Clauses 1, 2, 4, 5, 6, 8, 9 and 12 are word-identical between the two
// live contracts. Only the support clause (3), the termination clause
// (7), out-of-scope (10) and support hours (11) differ, because those
// carry the package-specific SLA, hours and onsite allowance.
//
// They are still written out in full per package below rather than
// shared by reference. That is deliberate: Wez must be able to edit the
// Gold clause 9 without it silently changing on Silver.

const CLAUSE_6_SECURITY_SERVICES: ContractClause = {
  number: 6,
  heading: "MDR Advanced, ITDR and SentinelOne EDR Security Services",
  body: [
    // CHANGED — replaces the shorter "Security Services" clause in both
    // live contracts. Extended at Wez's request to cover MDR and ITDR
    // explicitly and to set out the liability position.
    "The MDR Advanced, Identity Threat Detection & Response (ITDR) and SentinelOne EDR services, where included in the Pricing Summary, are provided for the covered endpoints and identities stated there. They are delivered by {{providerName}} together with its specialist security partners and comprise continuous monitoring, detection, investigation and managed response.",
    "These services are designed to reduce the likelihood and impact of a security incident and to shorten the time taken to detect and contain one. They do not, and cannot, guarantee prevention. No security product or managed service available on the market prevents every cyberattack, phishing attempt, malware infection, ransomware event, credential compromise, account takeover or data breach.",
    "{{providerName}} is therefore not liable for loss or damage arising from a security incident affecting {{customerName}}, except where that loss is caused by {{providerName}}'s own negligence or its failure to perform the services with reasonable care and skill. In particular, {{providerName}} is not responsible for incidents arising from: vulnerabilities in third-party software, platforms or services; the Customer's own acts or omissions, including disclosure of credentials, disabling or circumventing of security controls, or failure to act on {{providerName}}'s recommendations; devices, identities or systems not listed in the Pricing Summary as covered; or the delay or failure of a third-party security partner or platform.",
    "The Customer remains responsible for maintaining multi-factor authentication where available, for promptly reporting suspected incidents, and for acting on containment instructions issued by {{providerName}} or its security partners.",
    "Where ESET Endpoint Protection or Advanced Email Protection are supplied instead of, or alongside, the services above, the same position applies: they materially reduce risk but cannot guarantee that every malicious message, malware event, account compromise or cyberattack will be prevented.",
    "Covered quantities may be increased or decreased subject to applicable billing and supplier terms, with pricing adjusted accordingly. Nothing in this clause excludes or limits liability where it would be unlawful to do so.",
  ].join("\n\n"),
};

// ─── Gold ────────────────────────────────────────────────────────────

export const GOLD_CONTRACT_SEED: ContractDocumentSeed = {
  tier: "gold",
  displayName: 'IT Support/Services Contract Agreement "Gold" package',
  clauses: [
    {
      number: 1,
      heading: "Definitions",
      body: "Provider = {{providerName}}; Customer = {{customerName}}.",
    },
    {
      number: 2,
      heading: "IT Inventory",
      body: "{{providerName}} will provide the IT Support and managed services described in the Service Delivery and Pricing Summary sections of this Agreement on a rolling monthly basis, subject to the notice periods and supplier commitment terms stated in this Agreement. The IT inventory and licence quantities may be increased or decreased to reflect the Customer's requirements, subject to applicable annual or supplier commitments. Invoices will be issued on the 1st of each month for that month's services.",
    },
    {
      number: 3,
      heading: "Gold IT Support",
      body: "{{providerName}} will provide unlimited remote IT Helpdesk Support for the agreed users and supported services described in this Agreement. During contracted support hours, {{providerName}} will provide a 4-hour response SLA for support incidents and will begin work on diagnosis and resolution as soon as practicable. There is no fixed time-to-resolution guarantee, as resolution may depend on third-party suppliers, hardware availability, external services or the nature of the fault. Support not used in a calendar month is not refundable or transferable. Gold IT Support includes six hours of pooled onsite engineering per month; onsite work beyond the included allowance may be chargeable. Contracted support hours are Monday-Friday 9am-5pm excluding UK Bank Holidays. The IT Support service is provided on a rolling monthly basis with 90 days' cancellation notice and is reviewed every 12 months.",
    },
    {
      number: 4,
      heading: "Additional Equipment and Services",
      body: "Any additional devices, licences, subscriptions, projects or services outside the agreed Service Delivery and Pricing Summary may be subject to additional charges. Any changes will be agreed with the Customer before chargeable work is undertaken, except where emergency action is reasonably required to protect systems or data.",
    },
    {
      number: 5,
      heading: "Cloud Backup Service",
      body: "{{providerName}} will monitor and manage the Microsoft 365 and SharePoint backup services supplied under this Agreement and will investigate faults where reasonably possible. The service includes data restoration assistance. Backup capacity, retention and functionality are subject to the limits of the specific services listed in the Service Delivery and Pricing Summary. The Customer remains responsible for identifying any data or systems that require protection and for notifying {{providerName}} of material changes. {{providerName}} will use reasonable care in managing the backup service but cannot guarantee against every form of data loss or corruption.",
    },
    CLAUSE_6_SECURITY_SERVICES,
    {
      number: 7,
      heading: "Contract Length, Changes, Cancellation and Early Termination",
      body: "The IT Support service is a rolling monthly service cancellable with 90 days' notice. Other managed services are billed monthly but may be subject to supplier notice periods or minimum commitments. Microsoft 365 annual-commitment licences remain subject to their underlying annual commitment even where billed monthly. Changes to user, mailbox, device or service quantities will be reflected in future invoices where applicable. No refunds are due for unused portions of a calendar month. {{providerName}} may suspend or terminate services for material breach, persistent non-payment, unlawful use, security risk, or where continued provision is no longer reasonably practicable. This Agreement is reviewable every 12 months.",
    },
    {
      number: 8,
      heading: "Remote Monitoring and Support Software",
      body: "In order to proactively monitor, manage and remotely assist the Customer's IT infrastructure, {{providerName}} may install approved remote monitoring, management and support software on covered PCs and laptops. Remote-control access will be used for legitimate support purposes and handled in accordance with {{providerName}}'s security and privacy procedures. {{providerName}} may replace or update its support tooling during the term of this Agreement where required to maintain service quality, security or compatibility.",
    },
    {
      number: 9,
      heading: "Service Disruption and Loss of Data",
      body: "{{providerName}} will use reasonable care and skill in providing the services but will not be liable for failures or losses caused by events outside its reasonable control, including third-party outages, hardware failure, criminal damage or theft, fire, natural hazards, liquid damage, malware, ransomware, cyberattacks, data corruption, power outages or telecommunications failures. Nothing in this Agreement excludes or limits liability where it would be unlawful to do so.",
    },
    {
      number: 10,
      heading: "IT Support — Out of Scope",
      body: "Unless specifically listed in the Service Delivery or Pricing Summary, the following are outside the recurring monthly support fee: new software licences or subscriptions; new equipment and hardware replacement parts; out-of-hours or weekend work; data cabling; project-based work; major migrations or infrastructure redesign; mobile-device support other than agreed email connectivity assistance; website design or maintenance; domain hosting; CCTV infrastructure; computer programming; and administrative or clerical work. The six-hour monthly onsite engineering allowance specifically included in the Pricing Summary is covered; additional onsite work may be chargeable and will be agreed where applicable.",
    },
    {
      number: 11,
      heading: "Contracted IT Support Hours",
      body: "Standard support hours are Monday-Friday 9am-5pm, excluding UK public holidays. Support requested outside these hours is not included unless separately agreed and may be chargeable.",
    },
    {
      number: 12,
      heading: "Payment",
      body: "Invoices are issued on the 1st day of each calendar month for that month's services and are payable within 14 days unless otherwise agreed. Payment will normally be collected by Direct Debit where a mandate has been provided. Non-payment after the due date may result in suspension of services following reasonable notice. {{providerName}} reserves the right to charge statutory interest and recovery costs in accordance with applicable UK law.",
    },
  ],
  acceptanceBody: [
    "This IT Services Agreement will commence on {{commencementDate}}. The first invoice will be issued for {{firstInvoiceMonth}} services and ongoing invoices will be issued on the 1st of each calendar month thereafter. The current monthly fee for the IT support and managed services outlined in this agreement is {{monthlyFeeExVat}} + VAT ({{monthlyFeeIncVat}} including VAT at {{vatRate}}%). This fee may change where the agreed user, mailbox or device quantities, supplier charges or contracted services are increased or decreased in accordance with this agreement.",
    "Payment will be collected by the agreed payment method. Where Direct Debit is used, {{providerName}} will provide the appropriate mandate.",
  ].join("\n\n"),
  nextStepsBody:
    "Once the contract is signed and the Direct Debit mandate is completed, {{providerName}} will begin onboarding and provide {{customerName}} with the IT Handover Information document to gather the technical information required. The managed service will formally commence on {{commencementDate}}.",
  thankYouBody:
    "Thank you and congratulations on your new IT Services and Support Team. We look forward to working with {{customerName}} and building a strong working relationship.",
  pricingCaveatBody:
    "The pricing below forms part of this agreement and reflects the current agreed service scope and quantities.",
};

// ─── Silver ──────────────────────────────────────────────────────────

export const SILVER_CONTRACT_SEED: ContractDocumentSeed = {
  tier: "silver",
  displayName: 'IT Support/Services Contract Agreement "Silver" package',
  clauses: [
    {
      number: 1,
      heading: "Definitions",
      body: "Provider = {{providerName}}; Customer = {{customerName}}.",
    },
    {
      number: 2,
      heading: "IT Inventory",
      body: "{{providerName}} will provide the IT Support and managed services described in the Service Delivery and Pricing Summary sections of this Agreement on a rolling monthly basis, subject to the notice periods and any supplier commitment terms stated in this Agreement. The IT inventory and licence quantities may be increased or decreased to reflect the Customer's requirements, subject to applicable annual or supplier commitments. Invoices will be issued on the 1st of each month for that month's services.",
    },
    {
      number: 3,
      heading: "Silver IT Support",
      body: "{{providerName}} will provide unlimited remote IT Helpdesk Support for the agreed IT inventory and services described in this Agreement. During contracted support hours, {{providerName}} will provide a 2-hour response SLA for priority support incidents and will begin work on diagnosis and resolution as soon as practicable. There is no fixed time-to-resolution guarantee, as resolution may depend on third-party suppliers, hardware availability, external services or the nature of the fault. Support not used in a calendar month is not refundable or transferable. The Silver IT Support service includes the monthly onsite engineering allowance stated in the Pricing Summary; onsite work beyond the included allowance may be chargeable. Contracted support hours are Monday-Friday 8:30am-5:30pm excluding UK Bank Holidays. The IT Support service is provided on a rolling monthly basis with 90 days' cancellation notice and is reviewed every 12 months.",
    },
    {
      number: 4,
      heading: "Additional Equipment and Services",
      body: "Any additional IT-related devices, licences, subscriptions, projects or services outside the agreed Service Delivery and Pricing Summary may be subject to additional charges. Any changes will be agreed with the Customer before chargeable work is undertaken, except where emergency action is reasonably required to protect systems or data.",
    },
    {
      number: 5,
      heading: "Cloud Backup Service",
      body: "{{providerName}} will monitor and manage the backup services supplied under this Agreement and will investigate and repair faults where reasonably possible. The service includes data restoration assistance. Restoring data may result in temporary service or data availability disruption. Backup capacity, retention and functionality are subject to the limits of the specific backup services listed in the Service Delivery and Pricing Summary. The Customer remains responsible for identifying any data or systems that require protection and for notifying {{providerName}} of material changes. {{providerName}} will use reasonable care in managing the backup service but cannot guarantee against every form of data loss or corruption.",
    },
    CLAUSE_6_SECURITY_SERVICES,
    {
      number: 7,
      heading: "Contract Length, Changes, Cancellation and Early Termination",
      body: "The IT Support service is a rolling monthly service cancellable with 90 days' notice. Other managed services are billed monthly but may be subject to supplier notice periods or minimum commitments. Microsoft 365 annual-commitment licences remain subject to their underlying annual commitment even where billed monthly, and connectivity services may have separate minimum terms or notice periods. Changes to IT inventory, licences or services will be reflected in future invoices where applicable. No refunds are due for unused portions of a calendar month. {{providerName}} may suspend or terminate services for material breach, persistent non-payment, unlawful use, security risk, or where continued provision is no longer reasonably practicable. This Agreement is reviewable every 12 months.",
    },
    {
      number: 8,
      heading: "Remote Monitoring and Support Software",
      body: "In order to proactively monitor, manage and remotely assist the Customer's IT infrastructure, {{providerName}} may install approved remote monitoring, management and support software on covered PCs, laptops and servers. Remote-control access will be used for legitimate support purposes and handled in accordance with {{providerName}}'s security and privacy procedures. {{providerName}} may replace or update its support tooling during the term of this Agreement where required to maintain service quality, security or compatibility.",
    },
    {
      number: 9,
      heading: "Service Disruption and Loss of Data",
      body: "{{providerName}} will use reasonable care and skill in providing the services but will not be liable for failures or losses caused by events outside its reasonable control, including third-party service outages, hardware failure, criminal damage or theft, fire, natural hazards, liquid damage, malware, ransomware, cyberattacks, data corruption, power outages or telecommunications failures. Nothing in this Agreement excludes or limits liability where it would be unlawful to do so.",
    },
    {
      number: 10,
      heading: "IT Support — Out of Scope",
      body: "Unless specifically listed in the Service Delivery or Pricing Summary, the following are outside the recurring monthly support fee: new software licences or subscriptions; new equipment and hardware replacement parts; out-of-hours or weekend work; data cabling; project-based work; major migrations or infrastructure redesign; mobile-device support other than agreed email connectivity assistance; website design or maintenance; domain hosting; CCTV infrastructure; computer programming; and administrative or clerical work. The monthly onsite engineering allowance specifically included in the Pricing Summary is covered; additional onsite work beyond that allowance may be chargeable and will be agreed where applicable.",
    },
    {
      number: 11,
      heading: "Contracted IT Support Hours",
      body: "Standard support hours are Monday-Friday 8:30am-5:30pm, excluding UK public holidays. Support requested outside these hours is not included unless separately agreed and may be chargeable.",
    },
    {
      number: 12,
      heading: "Payment",
      body: "Invoices are issued on the 1st day of each calendar month for that month's services and are payable within 14 days unless otherwise agreed. Non-payment after the due date may result in suspension of services following reasonable notice. Where sums remain overdue, {{providerName}} reserves the right to charge statutory interest and recovery costs in accordance with applicable UK law and, for persistent non-payment or material breach, to terminate affected services.",
    },
  ],
  acceptanceBody: [
    "This IT Services Agreement will commence on {{commencementDate}}. The first invoice will be issued for {{firstInvoiceMonth}} services and ongoing invoices will be issued on the 1st of each calendar month thereafter. The current monthly fee for the IT support and managed services outlined in this agreement is {{monthlyFeeExVat}} + VAT ({{monthlyFeeIncVat}} including VAT at {{vatRate}}%). This fee may change where the agreed IT inventory, licence quantities, supplier charges or contracted services are increased or decreased in accordance with this agreement.",
    "Payment will be collected by the agreed payment method. Where Direct Debit is used, {{providerName}} will provide the appropriate mandate.",
  ].join("\n\n"),
  // CHANGED — the live Sorrells contract still carried the proposal's
  // "we would welcome the opportunity to walk through this" wording,
  // which reads oddly on a signed document and invites the client to
  // renegotiate scope they have just agreed. Rewritten to match the
  // Howgates contract, which got this right.
  nextStepsBody:
    "Once the contract is signed and the Direct Debit mandate is completed, {{providerName}} will begin onboarding and provide {{customerName}} with the IT Handover Information document to gather the technical information required. The managed service will formally commence on {{commencementDate}}.",
  thankYouBody:
    "Thank you and congratulations on your new IT Services and Support Team. We look forward to working with {{customerName}} and building a strong working relationship.",
  pricingCaveatBody:
    "The pricing below forms part of this agreement and reflects the current agreed service scope and quantities.",
};

export const CONTRACT_DOCUMENT_SEEDS: ContractDocumentSeed[] = [
  GOLD_CONTRACT_SEED,
  SILVER_CONTRACT_SEED,
];

/**
 * Proposal → contract wording substitutions.
 *
 * Derived by diffing Sweetbyte's Sorrells proposal (10 August 2026)
 * against the Sorrells contract (22 August 2026). Applied to every
 * generated chapter body when a contract is rendered.
 *
 * ORDER MATTERS. Longer, more specific phrases run first so that
 * "this proposal addresses" is consumed before the bare "proposal"
 * rule can reach it. The bare rules at the end are deliberately narrow
 * — a blanket proposal→agreement swap would corrupt phrases like
 * "proposal for future improvements", which appears in the Sorrells
 * Phase 1 text and must survive untouched.
 */
export const CONTRACT_WORDING_SUBSTITUTIONS: Array<{
  find: RegExp;
  replace: string;
}> = [
  { find: /\bthis proposal addresses\b/gi, replace: "this agreement addresses" },
  { find: /\bincluded in this proposal\b/gi, replace: "included in this agreement" },
  { find: /\bconfirmed in this proposal\b/gi, replace: "confirmed in this agreement" },
  { find: /\bcommitments in this proposal\b/gi, replace: "commitments in this agreement" },
  { find: /\bEverything in this proposal\b/g, replace: "Everything in this agreement" },
  { find: /\bset out in this proposal\b/gi, replace: "set out in this agreement" },
  { find: /\bdescribed in this proposal\b/gi, replace: "described in this agreement" },
  { find: /\bas agreed in your quote\b/gi, replace: "as agreed in this contract" },
  { find: /\bin this proposal\b/gi, replace: "in this agreement" },
  { find: /\bthis proposal\b/gi, replace: "this agreement" },
];

/**
 * Apply the substitutions above to a chapter body.
 *
 * WHY NOT A PLAIN .replace LOOP: the rules are case-insensitive so they
 * catch both "This proposal addresses" (sentence start) and "this
 * proposal addresses" (mid-sentence), but a plain replacement writes
 * the lowercase form back in both cases, silently decapitalising the
 * first word of a paragraph. Caught in testing on the Sorrells
 * Executive Summary, whose second paragraph opens with exactly that
 * phrase.
 *
 * The fix: if the matched text started with an uppercase letter, the
 * replacement does too.
 */
export function applyContractWording(body: string): string {
  let out = body;
  for (const { find, replace } of CONTRACT_WORDING_SUBSTITUTIONS) {
    out = out.replace(find, (matched) => {
      const startedUpper = matched.charAt(0) === matched.charAt(0).toUpperCase()
        && matched.charAt(0) !== matched.charAt(0).toLowerCase();
      return startedUpper
        ? replace.charAt(0).toUpperCase() + replace.slice(1)
        : replace;
    });
  }
  return out;
}
