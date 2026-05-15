// server/services/colourUtils.ts
//
// Phase 1 — pure colour math helpers for the v2.1 template library
// integration. Used by templateRenderer when injecting a user's brand
// colours into a template's :root variables.
//
// Why this exists:
// 1. Manus's v2.1 integration note: CSS custom property chains do NOT
//    recompute when overridden via inline style in Chromium/Puppeteer.
//    So we cannot just inject `--brand-primary` and rely on the template's
//    `color-mix()` to derive `--brand-primary-text-safe` at render time.
//    We must pre-compute all six variables on our side and inject them
//    as concrete hex values.
//
// 2. The orgs table currently has brandPrimaryColor and brandSecondaryColor
//    but not brandAccentColor. We derive an accent when one isn't set.
//
// 3. Manus's templates use a pale-luminance fallback flag
//    (`data-brand-luminance="light"` on <html>) so cover-page text inverts
//    correctly for pale brand palettes. We compute that flag here too.
//
// This module is dependency-free and side-effect-free. Pure functions
// over hex strings. Easy to unit test.

// ── Types ───────────────────────────────────────────────────────────

/** RGB triple, each channel in 0-255. */
type RGB = { r: number; g: number; b: number };

/**
 * The full set of brand-related CSS variables a template needs at
 * render time. Templates use 3 "raw" brand variables for fills, plus
 * 3 "text-safe" variants for text on white. All values are 6-digit
 * lowercase hex strings (e.g. "#1a365d") so they drop straight into
 * inline CSS without further escaping.
 */
export interface BrandRenderVars {
  brandPrimary: string;
  brandSecondary: string;
  brandAccent: string;
  brandPrimaryTextSafe: string;
  brandSecondaryTextSafe: string;
  brandAccentTextSafe: string;
  /** Whether the primary brand colour is light enough that the template
   *  should flip its cover-page text from white to dark. The renderer
   *  injects this as `data-brand-luminance="light"` on the <html> tag. */
  isLightBrand: boolean;
}

/** Org-stored brand inputs. Any field can be null when the user hasn't
 *  configured that colour yet — colourUtils handles all the fallbacks. */
export interface BrandInput {
  primary?: string | null;
  secondary?: string | null;
  accent?: string | null;
}

// ── Defaults ────────────────────────────────────────────────────────

/** Neutral charcoal — used when the user has no brand colours configured.
 *  Matches the default Manus baked into the v2.1 templates' :root. */
const DEFAULT_PRIMARY = "#1f2937";
const DEFAULT_SECONDARY = "#374151";
const DEFAULT_ACCENT = "#4b6cb7";

/** Dark ink anchor used to compute text-safe variants. Matches Manus's
 *  v2.1 integration note: `text-safe = color-mix(brand 45%, #111827 55%)`. */
const DARK_INK_ANCHOR = "#111827";
const TEXT_SAFE_BRAND_WEIGHT = 0.45;
const TEXT_SAFE_INK_WEIGHT = 0.55;

/** Luminance threshold above which a brand is considered "light" and the
 *  data-brand-luminance="light" flag should fire. Chosen so:
 *    - Navy   #1a365d  → L≈0.04  → dark   ✓
 *    - Forest #2f855a  → L≈0.19  → dark   ✓
 *    - Terracotta #c05621 → L≈0.20 → dark ✓
 *    - Mint   #a7f3d0  → L≈0.83  → light  ✓
 *  Real-world pale brands (pastel yellow, dusty pink, baby blue) all
 *  land above 0.5 and trip the flag correctly. */
const LIGHT_BRAND_LUMINANCE_THRESHOLD = 0.5;

// ── Public API ──────────────────────────────────────────────────────

/**
 * Resolve a user's brand inputs (any of which may be missing) into the
 * full set of six CSS variables a template needs, plus the luminance
 * flag. This is the single function the renderer calls.
 */
export function resolveBrandRenderVars(input: BrandInput): BrandRenderVars {
  const primary = normaliseHex(input.primary) ?? DEFAULT_PRIMARY;
  const secondary = normaliseHex(input.secondary) ?? DEFAULT_SECONDARY;
  const accent = normaliseHex(input.accent) ?? deriveAccentFromPrimary(primary);

  return {
    brandPrimary: primary,
    brandSecondary: secondary,
    brandAccent: accent,
    brandPrimaryTextSafe: computeTextSafeColour(primary),
    brandSecondaryTextSafe: computeTextSafeColour(secondary),
    brandAccentTextSafe: computeTextSafeColour(accent),
    isLightBrand: computeLuminance(primary) > LIGHT_BRAND_LUMINANCE_THRESHOLD,
  };
}

/**
 * Compute the text-safe variant of a brand colour. Mirrors Manus's CSS
 * implementation: `color-mix(in srgb, brand 45%, #111827 55%)`. For dark
 * brands the result is close to the original; for pale brands it pulls
 * darker so contrast against white reaches WCAG AA on body text.
 */
export function computeTextSafeColour(hex: string): string {
  const brand = parseHex(hex);
  const ink = parseHex(DARK_INK_ANCHOR);
  return mixRgb(brand, ink, TEXT_SAFE_BRAND_WEIGHT, TEXT_SAFE_INK_WEIGHT);
}

/**
 * WCAG relative luminance of a colour. Returns 0 (pure black) to 1
 * (pure white). Used to decide when to fire the light-brand flag.
 */
export function computeLuminance(hex: string): number {
  const { r, g, b } = parseHex(hex);
  const lr = channelLuminance(r);
  const lg = channelLuminance(g);
  const lb = channelLuminance(b);
  return 0.2126 * lr + 0.7152 * lg + 0.0722 * lb;
}

/**
 * Derive a sensible accent colour when the user has only set their
 * primary. Strategy: take the primary, lift it toward white so it
 * sits a step brighter and a step more chromatic. Avoids clashing
 * the way a fixed accent would for non-blue brands.
 */
export function deriveAccentFromPrimary(primaryHex: string): string {
  const primary = parseHex(primaryHex);
  const white = parseHex("#ffffff");
  // 65% primary + 35% white gives a lighter, friendlier version of the
  // user's brand. Visibly related to the primary so it harmonises, but
  // distinct enough to function as an accent.
  return mixRgb(primary, white, 0.65, 0.35);
}

/**
 * Normalise a hex string. Accepts "#RGB", "#RRGGBB", "RGB", "RRGGBB"
 * (with or without leading #, 3-digit or 6-digit). Returns a 6-digit
 * lowercase form with leading # — or null if input is unrecognisable
 * (caller falls back to defaults).
 */
export function normaliseHex(input: string | null | undefined): string | null {
  if (!input) return null;
  const trimmed = input.trim().replace(/^#/, "");
  if (/^[0-9a-fA-F]{3}$/.test(trimmed)) {
    const expanded = trimmed
      .split("")
      .map((ch) => ch + ch)
      .join("");
    return "#" + expanded.toLowerCase();
  }
  if (/^[0-9a-fA-F]{6}$/.test(trimmed)) {
    return "#" + trimmed.toLowerCase();
  }
  return null;
}

// ── Internals ───────────────────────────────────────────────────────

function parseHex(hex: string): RGB {
  // Caller is expected to have normalised already, but be defensive.
  const norm = normaliseHex(hex) ?? "#000000";
  const stripped = norm.replace(/^#/, "");
  return {
    r: parseInt(stripped.slice(0, 2), 16),
    g: parseInt(stripped.slice(2, 4), 16),
    b: parseInt(stripped.slice(4, 6), 16),
  };
}

function toHex(rgb: RGB): string {
  const clamp = (n: number): number => Math.max(0, Math.min(255, Math.round(n)));
  const pad = (n: number): string => clamp(n).toString(16).padStart(2, "0");
  return "#" + pad(rgb.r) + pad(rgb.g) + pad(rgb.b);
}

/** Linear-blend two RGB colours by the given weights. Weights need not
 *  sum to 1 — we normalise. Operates in sRGB space, which matches how
 *  CSS color-mix(in srgb, ...) behaves. */
function mixRgb(a: RGB, b: RGB, weightA: number, weightB: number): string {
  const total = weightA + weightB;
  const wA = weightA / total;
  const wB = weightB / total;
  return toHex({
    r: a.r * wA + b.r * wB,
    g: a.g * wA + b.g * wB,
    b: a.b * wA + b.b * wB,
  });
}

/** Per-channel linearisation for WCAG luminance. */
function channelLuminance(channel0to255: number): number {
  const c = channel0to255 / 255;
  return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4);
}

// Reference defaults exported so callers can render the picker's "no
// brand colours configured yet" preview state without inventing values.
export const BRAND_DEFAULTS = Object.freeze({
  primary: DEFAULT_PRIMARY,
  secondary: DEFAULT_SECONDARY,
  accent: DEFAULT_ACCENT,
});
