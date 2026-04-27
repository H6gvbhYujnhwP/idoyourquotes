/**
 * server/services/tradePresetInference.ts
 *
 * Phase 4A Delivery 30 — sector inference for the four GTM trade
 * presets.
 *
 * Pure synchronous helper called from inside the generateDraft
 * mutation (after AI parse, before commit). Looks at the same
 * evidence the AI already saw plus the AI's own line items, title,
 * and description, and returns a guess at which of the four GTM
 * sectors the quote belongs to:
 *
 *   - it_services
 *   - commercial_cleaning
 *   - website_marketing
 *   - pest_control
 *
 * The guess is written to quotes.tradePreset by the caller, and ONLY
 * when the column is currently NULL — we never overwrite a user-set
 * value, an earlier inference, or a legacy non-GTM sector left over
 * from before the GTM narrowing.
 *
 * Why this exists
 * ---------------
 * The Phase 4 unified flow creates quotes with no upfront sector
 * chooser, so every freshly-created quote starts with
 * tradePreset = NULL. A NULL tradePreset silently disables the IT-
 * services invoice addendum, the migration appendix (D28 gate), the
 * D29 review-modal migration sections, and any other sector-aware
 * downstream feature. Inferring the sector from the same evidence
 * the AI saw closes that gap without bringing back the upfront
 * chooser the unified flow deliberately dropped.
 *
 * Algorithm
 * ---------
 *   1. Build a lowercase haystack from evidence + line item
 *      descriptions + title + description.
 *   2. Count unique keyword hits per sector.
 *   3. Require at least MIN_HITS_FOR_GUESS hits in the leading
 *      sector before returning any guess (suppresses noise from
 *      one-off mentions like a single "wordpress" in an IT brief).
 *   4. If the leading sector's hit count exceeds the runner-up by
 *      MIN_LEAD_GAP or more, return that sector. Otherwise return
 *      null (ambiguous — let the user pick).
 *
 * Notes on overlap
 * ----------------
 *   IT and Website / Marketing share keywords ("hosting", "WordPress",
 *   "SSL"). The IT keyword set is much larger and covers M365,
 *   networking, server, helpdesk, RMM, etc. — so a real IT support
 *   tender will outscore a real website project on count even when
 *   both vocabularies are present. A pure website redesign that only
 *   mentions hosting once won't trigger IT because IT needs broader
 *   evidence (server, network, M365, etc.) to win.
 *
 * Pure function. No I/O, no async, no side effects, no logging from
 * inside this file — the caller is responsible for any logging it
 * wants. Same idiom as services/migrationTypeInference.ts.
 */

export type GtmSector =
  | "it_services"
  | "commercial_cleaning"
  | "website_marketing"
  | "pest_control";

export type Confidence = "high" | "medium" | "low";

export interface InferenceInput {
  /** Concatenated raw evidence the AI saw (voice / PDFs / text). */
  evidence: string;
  /** AI-generated line item descriptions from the just-completed draft. */
  lineItemDescriptions: string[];
  /** AI-generated quote title, if any. */
  title: string | null;
  /** AI-generated quote description, if any. */
  description: string | null;
}

export interface InferenceResult {
  /**
   * Inferred sector, or null when the evidence does not support a
   * confident guess (no signal, weak signal, or ambiguity between
   * two sectors).
   */
  guess: GtmSector | null;
  /**
   * Confidence ladder. 'low' is also returned alongside null when the
   * caller wants to know whether anything matched at all — never
   * affects whether the value is written, just useful for logging.
   */
  confidence: Confidence;
}

// ── Tuning constants ─────────────────────────────────────────────────

/**
 * Minimum unique keyword hits for the leading sector before any guess
 * is returned. 3 is loose enough to fire on a normal-sized brief and
 * tight enough to avoid one-keyword false positives.
 */
const MIN_HITS_FOR_GUESS = 3;

/**
 * Minimum lead the top sector must hold over the runner-up. If two
 * sectors are tied or within (LEAD_GAP - 1) of each other, return null
 * — the quote is genuinely mixed and the user should disambiguate.
 */
const MIN_LEAD_GAP = 2;

// ── Keyword sets ─────────────────────────────────────────────────────
//
// All keywords MUST be lowercase. Each set is keyed-uniquely and
// counted by `countMatches` — the more distinct keywords land, the
// stronger the signal. Multi-word phrases are preferred where they
// disambiguate (e.g. "office cleaning" rather than "office", which
// would also hit IT and Marketing briefs).

const IT_SERVICES_KEYWORDS: readonly string[] = [
  // Service framing
  "it support",
  "it services",
  "managed services",
  "managed it",
  "msp",
  "helpdesk",
  "help desk",
  "service desk",
  "ticketing",
  "ticket system",
  "remote support",
  "telephone support",
  "onsite support",
  "on-site support",
  // Microsoft platform
  "microsoft 365",
  "m365",
  "office 365",
  "o365",
  "sharepoint",
  "exchange online",
  "exchange server",
  "outlook",
  "microsoft teams",
  "ms teams",
  "onedrive",
  "azure ad",
  "azure active directory",
  "entra id",
  // Google platform (also hits website agencies sometimes — kept here
  // because the workspace business product is firmly an IT motion)
  "google workspace",
  "g suite",
  // Infrastructure
  "active directory",
  "domain controller",
  "windows server",
  "linux server",
  "file server",
  "vpn",
  "firewall",
  "router",
  "switch",
  "wifi",
  "wi-fi",
  "lan",
  "wlan",
  "vlan",
  // Endpoints / devices
  "laptop",
  "desktop",
  "endpoint",
  "endpoints",
  "workstation",
  "pcs and laptops",
  "device management",
  "mdm",
  "intune",
  // Backup / recovery
  "backup",
  "backup monitoring",
  "disaster recovery",
  "drp",
  "business continuity",
  "rmm",
  "remote monitoring",
  "patch management",
  "patching",
  // Security
  "antivirus",
  "edr",
  "mfa",
  "multi-factor",
  "cyber security",
  "cybersecurity",
  "cyber essentials",
  // Generic IT
  "it asset",
  "asset management",
  "lifecycle tracking",
  "sla",
  "uptime",
  "incident",
  "infrastructure",
  "cloud migration",
  "tenant",
  "licensing",
  // Tender / charity-IT specific phrasings (bias toward this sector
  // when a brief talks about "IT partner" / "IT strategy")
  "it partner",
  "it strategy",
  "it advisory",
  "it procurement",
  "it environment",
];

const COMMERCIAL_CLEANING_KEYWORDS: readonly string[] = [
  "cleaning",
  "cleaner",
  "cleaners",
  "cleaning services",
  "office cleaning",
  "commercial cleaning",
  "contract cleaning",
  "daily cleaning",
  "weekly cleaning",
  "fortnightly cleaning",
  "janitorial",
  "janitor",
  "sanitisation",
  "sanitization",
  "sanitiser",
  "disinfection",
  "deep clean",
  "end of tenancy",
  "carpet cleaning",
  "window cleaning",
  "floor cleaning",
  "floor polishing",
  "floor stripping",
  "buffing",
  "vacuuming",
  "dusting",
  "mopping",
  "polish",
  "polishing",
  "washroom",
  "restroom",
  "toilet cleaning",
  "kitchen cleaning",
  "consumables",
  "hand soap",
  "hand towels",
  "loo roll",
  "toilet roll",
  "feminine hygiene",
  "waste removal",
  "bins",
  "bin emptying",
  "coshh",
  "cleaning schedule",
  "cleaning rota",
  "cleaning specification",
];

const WEBSITE_MARKETING_KEYWORDS: readonly string[] = [
  "website design",
  "web design",
  "website redesign",
  "website rebuild",
  "web development",
  "web developer",
  "website project",
  "landing page",
  "landing pages",
  "homepage",
  "wordpress site",
  "wordpress redesign",
  "shopify",
  "woocommerce",
  "webflow",
  "squarespace",
  "wix",
  "html",
  "css",
  "javascript site",
  "seo",
  "search engine optimisation",
  "search engine optimization",
  "google ads",
  "ppc",
  "pay per click",
  "pay-per-click",
  "facebook ads",
  "instagram ads",
  "linkedin ads",
  "social media",
  "social media marketing",
  "social media management",
  "content marketing",
  "copywriting",
  "blog posts",
  "branding",
  "brand identity",
  "logo design",
  "graphic design",
  "google analytics",
  "ga4",
  "conversion rate",
  "conversion rate optimisation",
  "cro",
  "email marketing",
  "mailchimp",
  "klaviyo",
  "newsletter",
  "marketing strategy",
  "digital marketing",
  "marketing retainer",
  "marketing audit",
  "seo audit",
  "keyword research",
  "backlink",
  "link building",
];

const PEST_CONTROL_KEYWORDS: readonly string[] = [
  "pest control",
  "pest management",
  "pest inspection",
  "pest treatment",
  "pests",
  "infestation",
  "rodent",
  "rodents",
  "rat",
  "rats",
  "mouse",
  "mice",
  "rodent control",
  "rodent baiting",
  "rodent trapping",
  "insect",
  "insects",
  "ant",
  "ants",
  "wasp",
  "wasps",
  "wasp nest",
  "hornet",
  "fly",
  "flies",
  "fly killer",
  "flying insect",
  "cockroach",
  "cockroaches",
  "bed bug",
  "bedbug",
  "bed bugs",
  "bedbugs",
  "flea",
  "fleas",
  "moth",
  "moths",
  "silverfish",
  "termite",
  "termites",
  "fumigation",
  "rodenticide",
  "insecticide",
  "trapping",
  "baiting",
  "bait station",
  "bait stations",
  "proofing",
  "exclusion work",
  "bpca",
  "rspa",
  "british pest control",
  "ehoh",
  "environmental health",
];

// ── Helpers ──────────────────────────────────────────────────────────

function buildHaystack(input: InferenceInput): string {
  const parts: string[] = [];
  if (input.evidence) parts.push(input.evidence);
  for (const desc of input.lineItemDescriptions) {
    if (desc) parts.push(desc);
  }
  if (input.title) parts.push(input.title);
  if (input.description) parts.push(input.description);
  return parts.join("\n").toLowerCase();
}

function countMatches(haystack: string, keywords: readonly string[]): number {
  let count = 0;
  for (const kw of keywords) {
    if (haystack.includes(kw)) count++;
  }
  return count;
}

// ── Main entry point ─────────────────────────────────────────────────

/**
 * Infer the GTM sector, if any, that the evidence describes.
 *
 * Returns `{ guess: null, confidence: 'low' }` when:
 *   • the evidence is empty,
 *   • the leading sector has fewer than MIN_HITS_FOR_GUESS hits, or
 *   • two sectors are within (MIN_LEAD_GAP - 1) hits of each other.
 *
 * Returns a guess + confidence otherwise. Confidence ladder:
 *   • high   — leader has ≥ 8 hits AND lead gap ≥ 4.
 *   • medium — leader has ≥ 5 hits, or lead gap ≥ 3.
 *   • low    — minimum threshold met, modest lead.
 */
export function inferTradePreset(input: InferenceInput): InferenceResult {
  const haystack = buildHaystack(input);
  if (!haystack.trim()) {
    return { guess: null, confidence: "low" };
  }

  const scores: Record<GtmSector, number> = {
    it_services: countMatches(haystack, IT_SERVICES_KEYWORDS),
    commercial_cleaning: countMatches(haystack, COMMERCIAL_CLEANING_KEYWORDS),
    website_marketing: countMatches(haystack, WEBSITE_MARKETING_KEYWORDS),
    pest_control: countMatches(haystack, PEST_CONTROL_KEYWORDS),
  };

  // Sort sectors by score desc.
  const sorted = (Object.entries(scores) as [GtmSector, number][])
    .sort((a, b) => b[1] - a[1]);

  const [leader, leaderHits] = sorted[0];
  const [, runnerUpHits] = sorted[1];

  // Threshold gate.
  if (leaderHits < MIN_HITS_FOR_GUESS) {
    return { guess: null, confidence: "low" };
  }

  // Lead-gap gate.
  if (leaderHits - runnerUpHits < MIN_LEAD_GAP) {
    return { guess: null, confidence: "low" };
  }

  const lead = leaderHits - runnerUpHits;
  let confidence: Confidence;
  if (leaderHits >= 8 && lead >= 4) {
    confidence = "high";
  } else if (leaderHits >= 5 || lead >= 3) {
    confidence = "medium";
  } else {
    confidence = "low";
  }

  return { guess: leader, confidence };
}
