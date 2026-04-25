/**
 * CSS Colour Extraction — Phase 4A Delivery 14.
 *
 * Deterministic colour extraction from a website's HTML. Replaces the
 * GPT-4o-on-raw-HTML approach used in earlier Phase 4A work, which
 * returned NULL on most real-world sites because the noise:signal
 * ratio of WordPress / Webflow / Squarespace markup drowns the brand
 * signal under the prompt's "push toward null rather than fabricate"
 * rule.
 *
 * Sources, in priority order:
 *
 *   Tier 1 — <meta name="theme-color">
 *     The W3C-blessed signal for "this is our brand colour". When
 *     present, almost always correct. Heavily boosted in scoring.
 *
 *   Tier 2 — inline <style> blocks
 *     Parsed via postcss for AST safety. We look for:
 *       a) :root custom properties named --brand-*, --primary-*, etc.
 *          These are the strongest signal — the brand explicitly named
 *          this colour as their own.
 *       b) any background-color / background / color declaration.
 *          Frequency-scored.
 *
 *   Tier 3 — linked stylesheets
 *     Up to 2 linked <link rel="stylesheet"> files, fetched with a
 *     size cap. Parsed the same way as Tier 2 with a lower base score.
 *
 *   Tier 4 — inline style="..." attributes on hero/header elements
 *     Sites that use Webflow / page builders often inline brand
 *     colours on the hero section. Useful catch-all.
 *
 * Scoring is frequency-weighted with tier-specific boosts. After
 * scoring, neutral colours (near-white, near-black, low-saturation
 * greys) are filtered out and the top two colours are returned.
 *
 * No AI, no API call, no per-request cost. Works in ~50ms on a typical
 * homepage.
 */

import * as cheerio from "cheerio";
import postcss from "postcss";

// ── Tuning ──────────────────────────────────────────────────────────────

const STYLESHEET_FETCH_TIMEOUT_MS = 5_000;
const STYLESHEET_MAX_BYTES = 200_000;
const MAX_STYLESHEETS = 2;

// Score boosts per source. The numbers don't need to be precise — only
// the relative ordering matters for ranking.
const SCORE_THEME_COLOR_META = 10_000;
const SCORE_BRAND_CUSTOM_PROP = 5_000;
const SCORE_INLINE_HERO = 500;
const SCORE_INLINE_STYLE_BLOCK = 50;
const SCORE_LINKED_STYLESHEET = 20;

// Custom property names that strongly indicate "this is the brand colour".
// Matched case-insensitively.
const BRAND_PROP_PATTERNS = [
  /^--brand(-|$)/i,
  /^--primary(-|$|color)/i,
  /^--secondary(-|$|color)/i,
  /^--accent(-|$|color)/i,
  /^--theme(-|$|color)/i,
  /^--main(-|$|color)/i,
];

const WEBSITE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

// ─────────────────────────────────────────────────────────────────────────
// Public entry point
// ─────────────────────────────────────────────────────────────────────────

export interface CssColourResult {
  primary: string | null;
  secondary: string | null;
  /** Diagnostic — which sources contributed colours. */
  sources: string[];
}

export async function extractColoursFromWebsite(
  html: string,
  baseUrl: string,
): Promise<CssColourResult> {
  if (!html || html.length < 50) {
    return { primary: null, secondary: null, sources: [] };
  }

  const sources: string[] = [];
  const scores = new Map<string, number>();

  let $: cheerio.CheerioAPI;
  try {
    $ = cheerio.load(html);
  } catch {
    return { primary: null, secondary: null, sources: [] };
  }

  // ── Tier 1 — meta theme-color ────────────────────────────────────────
  const themeColor = normaliseHex($('meta[name="theme-color"]').attr("content"));
  if (themeColor) {
    addScore(scores, themeColor, SCORE_THEME_COLOR_META);
    sources.push("meta-theme-color");
  }

  // ── Tier 2 — inline <style> blocks ───────────────────────────────────
  const inlineCss = $("style")
    .map((_, el) => $(el).html() || "")
    .get()
    .join("\n");
  if (inlineCss) {
    const before = scores.size;
    parseCssIntoScores(inlineCss, scores, SCORE_INLINE_STYLE_BLOCK);
    if (scores.size > before) sources.push("inline-style");
  }

  // ── Tier 3 — linked stylesheets (best-effort) ────────────────────────
  const stylesheetUrls: string[] = [];
  $('link[rel~="stylesheet"]').each((_, el) => {
    const href = $(el).attr("href");
    if (href) stylesheetUrls.push(href);
  });
  const fetched = await fetchStylesheets(
    stylesheetUrls.slice(0, MAX_STYLESHEETS),
    baseUrl,
  );
  if (fetched.length > 0) {
    const before = scores.size;
    for (const css of fetched) {
      parseCssIntoScores(css, scores, SCORE_LINKED_STYLESHEET);
    }
    if (scores.size > before) sources.push("linked-stylesheet");
  }

  // ── Tier 4 — inline style on hero-ish elements ──────────────────────
  const heroSelectors = [
    "header",
    'section:not([class*="footer"]):not([class*="bottom"])',
    '[class*="hero" i]',
    '[class*="banner" i]',
    '[class*="masthead" i]',
    '[class*="jumbotron" i]',
  ];
  let heroHits = 0;
  $(heroSelectors.join(", "))
    .slice(0, 6) // cap — we only care about prominent hero-like sections
    .each((_, el) => {
      const style = $(el).attr("style");
      if (!style) return;
      const colours = extractColoursFromCssValue(style);
      for (const c of colours) {
        addScore(scores, c, SCORE_INLINE_HERO);
        heroHits++;
      }
    });
  if (heroHits > 0) sources.push("hero-inline");

  // ── Rank ─────────────────────────────────────────────────────────────
  const ranked = Array.from(scores.entries())
    .filter(([hex]) => isInterestingColour(hex))
    .sort((a, b) => b[1] - a[1]);

  if (ranked.length === 0) {
    return { primary: null, secondary: null, sources };
  }

  const primary = ranked[0][0];
  // Secondary must be visually distinct from primary so the renderer's
  // accent/zebra rows don't blend in. If the second-place colour is too
  // close to primary, keep going down the list.
  const secondary =
    ranked.find(
      ([hex], i) => i > 0 && colourDistance(hex, primary) > 0.18,
    )?.[0] || null;

  return { primary, secondary, sources };
}

// ─────────────────────────────────────────────────────────────────────────
// CSS parsing — feeds the score map
// ─────────────────────────────────────────────────────────────────────────

function parseCssIntoScores(
  css: string,
  scores: Map<string, number>,
  baseScore: number,
): void {
  let root;
  try {
    root = postcss.parse(css);
  } catch {
    // Malformed CSS — fall back to regex over the raw text. Better than
    // skipping entirely.
    extractColoursFromCssValue(css).forEach(c =>
      addScore(scores, c, baseScore),
    );
    return;
  }

  root.walkDecls(decl => {
    // Custom property — boost if its name suggests "brand".
    if (decl.prop.startsWith("--")) {
      const isBrand = BRAND_PROP_PATTERNS.some(re => re.test(decl.prop));
      const score = isBrand ? SCORE_BRAND_CUSTOM_PROP : baseScore * 2;
      extractColoursFromCssValue(decl.value).forEach(c =>
        addScore(scores, c, score),
      );
      return;
    }

    // Standard colour-bearing properties.
    const colourProps = [
      "background",
      "background-color",
      "color",
      "border-color",
      "fill",
      "stroke",
    ];
    if (colourProps.includes(decl.prop.toLowerCase())) {
      extractColoursFromCssValue(decl.value).forEach(c =>
        addScore(scores, c, baseScore),
      );
    }
  });
}

/**
 * Pulls every recognisable colour out of a CSS value string. Handles
 * #rgb, #rrggbb, rgb(...), rgba(...). Named colours are ignored — they
 * are rare in modern brand stylesheets and would just add noise.
 */
function extractColoursFromCssValue(value: string): string[] {
  const out: string[] = [];

  // Hex — #rgb / #rrggbb / #rrggbbaa (drop alpha)
  const hexRe = /#([0-9a-fA-F]{3,8})\b/g;
  let m;
  while ((m = hexRe.exec(value)) !== null) {
    const hex = normaliseHex(`#${m[1]}`);
    if (hex) out.push(hex);
  }

  // rgb(...) / rgba(...) — handle both modern and legacy comma forms
  const rgbRe =
    /rgba?\(\s*(\d{1,3})[\s,]+(\d{1,3})[\s,]+(\d{1,3})(?:\s*[,/]\s*[\d.%]+)?\s*\)/gi;
  while ((m = rgbRe.exec(value)) !== null) {
    const r = clamp255(parseInt(m[1], 10));
    const g = clamp255(parseInt(m[2], 10));
    const b = clamp255(parseInt(m[3], 10));
    out.push(rgbToHex(r, g, b));
  }

  return out;
}

// ─────────────────────────────────────────────────────────────────────────
// External stylesheet fetch — best-effort, never throws
// ─────────────────────────────────────────────────────────────────────────

async function fetchStylesheets(
  hrefs: string[],
  baseUrl: string,
): Promise<string[]> {
  if (hrefs.length === 0) return [];
  const out: string[] = [];

  for (const href of hrefs) {
    const resolved = resolveUrl(href, baseUrl);
    if (!resolved) continue;
    try {
      const css = await fetchOne(resolved);
      if (css) out.push(css);
    } catch {
      // Swallow — one bad stylesheet shouldn't fail the whole extraction.
    }
  }

  return out;
}

async function fetchOne(url: string): Promise<string | null> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), STYLESHEET_FETCH_TIMEOUT_MS);
  try {
    const res = await fetch(url, {
      method: "GET",
      headers: {
        "User-Agent": WEBSITE_USER_AGENT,
        "Accept": "text/css,*/*;q=0.5",
      },
      signal: controller.signal,
      redirect: "follow",
    });
    if (!res.ok) return null;
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("css") && !ct.includes("text/plain")) {
      // Some servers serve CSS as application/octet-stream; accept if the
      // content-type is missing or non-committal. Reject things that are
      // clearly other types (html, json, image).
      if (
        ct.includes("html") ||
        ct.includes("json") ||
        ct.includes("image") ||
        ct.includes("javascript")
      ) {
        return null;
      }
    }
    const text = await res.text();
    if (!text || text.length === 0) return null;
    return text.length > STYLESHEET_MAX_BYTES
      ? text.slice(0, STYLESHEET_MAX_BYTES)
      : text;
  } finally {
    clearTimeout(timer);
  }
}

function resolveUrl(href: string, baseUrl: string): string | null {
  try {
    return new URL(href, baseUrl).toString();
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────────────
// Colour helpers — neutrality filtering, distance, normalisation
// ─────────────────────────────────────────────────────────────────────────

/**
 * Filters out colours that wouldn't be useful as a brand primary.
 * Excludes near-white, near-black, and low-saturation greys.
 */
function isInterestingColour(hex: string): boolean {
  const rgb = hexToRgb(hex);
  if (!rgb) return false;
  const { l, s } = rgbToHsl(rgb.r, rgb.g, rgb.b);
  if (l > 0.92) return false; // near-white
  if (l < 0.06) return false; // near-black
  if (s < 0.1 && l > 0.2 && l < 0.85) return false; // grey midtones
  return true;
}

/**
 * Perceptual distance in HSL space — used to ensure the secondary
 * colour is visually distinct from the primary. 0 = identical.
 */
function colourDistance(a: string, b: string): number {
  const ra = hexToRgb(a);
  const rb = hexToRgb(b);
  if (!ra || !rb) return 1;
  const ha = rgbToHsl(ra.r, ra.g, ra.b);
  const hb = rgbToHsl(rb.r, rb.g, rb.b);
  // Hue distance is angular; weighted heavier than L/S.
  const dh = Math.min(Math.abs(ha.h - hb.h), 1 - Math.abs(ha.h - hb.h));
  const ds = Math.abs(ha.s - hb.s);
  const dl = Math.abs(ha.l - hb.l);
  return dh * 1.5 + ds * 0.5 + dl * 0.5;
}

function addScore(map: Map<string, number>, hex: string, n: number): void {
  map.set(hex, (map.get(hex) || 0) + n);
}

function clamp255(n: number): number {
  if (!Number.isFinite(n)) return 0;
  return Math.max(0, Math.min(255, Math.round(n)));
}

function rgbToHex(r: number, g: number, b: number): string {
  const h = (n: number) => n.toString(16).padStart(2, "0");
  return `#${h(r)}${h(g)}${h(b)}`.toLowerCase();
}

function hexToRgb(hex: string): { r: number; g: number; b: number } | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(hex);
  if (!m) return null;
  const n = parseInt(m[1], 16);
  return { r: (n >> 16) & 0xff, g: (n >> 8) & 0xff, b: n & 0xff };
}

function rgbToHsl(
  r: number,
  g: number,
  b: number,
): { h: number; s: number; l: number } {
  r /= 255;
  g /= 255;
  b /= 255;
  const max = Math.max(r, g, b);
  const min = Math.min(r, g, b);
  const l = (max + min) / 2;
  let h = 0;
  let s = 0;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r:
        h = (g - b) / d + (g < b ? 6 : 0);
        break;
      case g:
        h = (b - r) / d + 2;
        break;
      case b:
        h = (r - g) / d + 4;
        break;
    }
    h /= 6;
  }
  return { h, s, l };
}

/**
 * Normalises an arbitrary colour string to lowercase #rrggbb. Returns
 * null if the input is not a recognisable hex.
 */
export function normaliseHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const t = input.trim().toLowerCase();
  // #rgb → #rrggbb
  let m = /^#?([0-9a-f])([0-9a-f])([0-9a-f])$/i.exec(t);
  if (m) {
    return `#${m[1]}${m[1]}${m[2]}${m[2]}${m[3]}${m[3]}`;
  }
  // #rrggbb / #rrggbbaa (drop alpha)
  m = /^#?([0-9a-f]{6})(?:[0-9a-f]{2})?$/i.exec(t);
  if (m) return `#${m[1]}`;
  return null;
}
