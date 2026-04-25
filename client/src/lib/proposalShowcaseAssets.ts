/**
 * Phase 4A — Proposal showcase assets.
 *
 * Pre-rendered previews of the three winning Contract/Tender proposal
 * templates, filled with fictional but realistic example data. Served as
 * static files from /public/proposal-showcase — no Vite bundling, no cache
 * hashing, so they can be referenced directly in landing/pricing pages,
 * the Solo upgrade modal, and OG meta tags.
 *
 * Renders come in three sizes:
 *  - hero   (1800×2250 .webp) — full-width landing/pricing page use
 *  - thumb  (800×1000  .webp) — modal / format-picker card use
 *  - social (1200×630  .jpg)  — OG image / social share use (JPEG for
 *                              maximum platform compatibility)
 *
 * Fictional companies used in the example data:
 *  - IT-Modern:            Meridian Solutions Ltd  →  Ashworth & Partners
 *  - Cleaning-Operational: Sparkshire Facilities Ltd → Oakwell Business Park
 *  - Marketing-Bold:       Pivot Digital           →  Harwood Retail Group
 *
 * Source HTML (for re-rendering if example data changes) lives alongside
 * the assets at /public/proposal-showcase/source/*.html.
 */

export type ProposalShowcaseSector = "it" | "cleaning" | "marketing";
export type ProposalShowcaseSize = "hero" | "thumb" | "social";

export interface ProposalShowcaseVariant {
  /** Machine key — stable identifier, safe for analytics / persistence */
  key: ProposalShowcaseSector;
  /** Human-readable sector label */
  sectorLabel: string;
  /** Personality name Manus assigned to this template */
  personality: string;
  /** One-line description for card/modal copy */
  tagline: string;
  /** Asset URLs (served from /public — no import, no hashing) */
  assets: {
    hero: string;
    thumb: string;
    social: string;
  };
}

const BASE = "/proposal-showcase";

export const PROPOSAL_SHOWCASES: Record<ProposalShowcaseSector, ProposalShowcaseVariant> = {
  it: {
    key: "it",
    sectorLabel: "IT Services",
    personality: "Modern",
    tagline: "Managed IT & cyber security contract — KPI-led, boardroom-ready.",
    assets: {
      hero: `${BASE}/it-modern-hero.webp`,
      thumb: `${BASE}/it-modern-thumb.webp`,
      social: `${BASE}/it-modern-social.jpg`,
    },
  },
  cleaning: {
    key: "cleaning",
    sectorLabel: "Commercial Cleaning",
    personality: "Operational",
    tagline: "FM-grade cleaning specification with accreditations and scope summary.",
    assets: {
      hero: `${BASE}/cleaning-operational-hero.webp`,
      thumb: `${BASE}/cleaning-operational-thumb.webp`,
      social: `${BASE}/cleaning-operational-social.jpg`,
    },
  },
  marketing: {
    key: "marketing",
    sectorLabel: "Website & Digital Marketing",
    personality: "Bold",
    tagline: "Twelve-month retainer proposal with KPI targets and clear accountability.",
    assets: {
      hero: `${BASE}/marketing-bold-hero.webp`,
      thumb: `${BASE}/marketing-bold-thumb.webp`,
      social: `${BASE}/marketing-bold-social.jpg`,
    },
  },
};

/** Ordered list — useful for showcase strips / carousels. */
export const PROPOSAL_SHOWCASE_ORDER: readonly ProposalShowcaseSector[] = [
  "it",
  "cleaning",
  "marketing",
] as const;

/**
 * Resolve a single asset URL. Prefer this over indexing PROPOSAL_SHOWCASES
 * directly — it keeps usage type-narrowed.
 */
export function getProposalShowcaseAsset(
  sector: ProposalShowcaseSector,
  size: ProposalShowcaseSize,
): string {
  return PROPOSAL_SHOWCASES[sector].assets[size];
}

/**
 * Phase 4A Delivery 8 — sector→showcase mapping.
 *
 * Maps a user's defaultTradeSector key (as stored on the users table) to
 * the showcase variant that ships as their default design template. Used
 * by the Solo upgrade modal to pick which showcase card to flag as "yours"
 * and reorder the showcase strip so their sector appears first.
 *
 * Returns null for sectors that don't yet have a default showcase
 * (currently `pest_control`, `custom`, and any legacy non-GTM sector).
 * Callers should treat null as "no default — show all three as
 * alternative designs in the existing order".
 *
 * The four GTM sectors are:
 *  - it_services         → Modern
 *  - commercial_cleaning → Operational
 *  - website_marketing   → Bold
 *  - pest_control        → null (no showcase asset yet)
 */
export function getDefaultShowcaseForSector(
  sector: string | null | undefined,
): ProposalShowcaseSector | null {
  switch (sector) {
    case "it_services":
      return "it";
    case "commercial_cleaning":
      return "cleaning";
    case "website_marketing":
      return "marketing";
    default:
      return null;
  }
}

/**
 * Phase 4A Delivery 8 — return the showcase order with the user's
 * default first, others after in their existing relative order. If the
 * user has no mapped default (Pest Control, Custom, or unmapped),
 * returns the existing canonical order unchanged.
 *
 * This is the order the Solo upgrade modal walks when rendering the
 * three thumbnail cards.
 */
export function getOrderedShowcasesForSector(
  sector: string | null | undefined,
): readonly ProposalShowcaseSector[] {
  const defaultKey = getDefaultShowcaseForSector(sector);
  if (!defaultKey) return PROPOSAL_SHOWCASE_ORDER;
  const others = PROPOSAL_SHOWCASE_ORDER.filter((k) => k !== defaultKey);
  return [defaultKey, ...others];
}

// ──────────────────────────────────────────────────────────────────────
// Phase 4A Delivery 17 — Design templates (sector-agnostic).
//
// The three Manus templates above are described by SECTOR keys
// ('it' | 'cleaning' | 'marketing') because they were originally framed
// as sector-default proposals for the Solo upgrade modal (Delivery 8).
// Wez's Delivery 17 reframe: users pick a DESIGN MOOD, not a sector
// flavour. Two professional services firms in different industries
// might both want "Modern"; a startup and a hairdresser might both
// want "Bold". Sector is no longer the right organising concept.
//
// The asset files (and Manus's three example HTML sources at
// /public/proposal-showcase/source) are reused — only the framing and
// the user-facing labels change. The type lives alongside the legacy
// sector exports rather than replacing them so the Delivery 8 Solo
// upgrade modal continues to work unchanged.
// ──────────────────────────────────────────────────────────────────────

export type DesignTemplate = "modern" | "structured" | "bold";

export interface DesignTemplateInfo {
  key: DesignTemplate;
  label: string;
  /** One-line mood description for the picker. */
  description: string;
  /** Thumbnail asset URL — reuses the same Manus webps. */
  thumb: string;
  /** Hero asset URL — for fuller previews. */
  hero: string;
  /**
   * True when the renderer for this template is shipped. Modern is in
   * Delivery 18; Structured + Bold land in subsequent deliveries. The
   * picker UIs (Settings + BrandChoiceModal) disable un-built options
   * with a "Coming soon" badge so the visible roadmap matches reality.
   */
  available: boolean;
}

export const DESIGN_TEMPLATES: Record<DesignTemplate, DesignTemplateInfo> = {
  modern: {
    key: "modern",
    label: "Modern",
    description:
      "Refined and considered. Linear / Notion / Stripe sophistication. Best when you want to read as serious and professional.",
    thumb: "/proposal-showcase/it-modern-thumb.webp",
    hero: "/proposal-showcase/it-modern-hero.webp",
    available: true,
  },
  structured: {
    key: "structured",
    label: "Structured",
    description:
      "Methodical and operational. Checklist boxes, scope summaries, accreditation badges. Best when methodology matters.",
    thumb: "/proposal-showcase/cleaning-operational-thumb.webp",
    hero: "/proposal-showcase/cleaning-operational-hero.webp",
    available: false,
  },
  bold: {
    key: "bold",
    label: "Bold",
    description:
      "High-impact and editorial. Brutalist typography, vivid accent colour, statement scale. Best when you want to stand out.",
    thumb: "/proposal-showcase/marketing-bold-thumb.webp",
    hero: "/proposal-showcase/marketing-bold-hero.webp",
    available: false,
  },
};

export const DESIGN_TEMPLATE_ORDER: readonly DesignTemplate[] = [
  "modern",
  "structured",
  "bold",
] as const;

/** True when the supplied value is a known DesignTemplate key. */
export function isDesignTemplate(v: unknown): v is DesignTemplate {
  return v === "modern" || v === "structured" || v === "bold";
}

/**
 * Resolve a stored value (possibly null / unrecognised) to a safe
 * DesignTemplate. Anything we don't recognise falls back to 'modern',
 * which is the only template with a built renderer in Delivery 18.
 */
export function resolveDesignTemplate(v: unknown): DesignTemplate {
  return isDesignTemplate(v) ? v : "modern";
}
