// server/services/templateRenderer.ts
//
// Phase 1 — the single render service that turns a v2.1 template plus a
// user's brand colours, slot content and logo into a PDF buffer.
//
// Phase 2 update: SlotContent values now accept either a string (replace
// all matching elements with the same content) or an array of strings
// (indexed replacement — useful for templates that have two pricing
// tables, two image bands, etc.).
//
// Pipeline:
//   1. Validate the templateId via templateLibrary.
//   2. Compute the six brand CSS variables (3 raw + 3 text-safe) plus
//      the luminance flag on our side. Per Manus's v2.1 integration note,
//      CSS color-mix chains do NOT recompute when overridden via inline
//      style in Chromium/Puppeteer, so we pre-compute and inject concrete
//      hex values.
//   3. Launch a headless Chromium via puppeteer-core + @sparticuz/chromium
//      (the slim ~50MB serverless build — keeps the Render service size
//      manageable while still giving us full CSS/font fidelity).
//   4. Load the template HTML via file:// so its relative assets/ paths
//      resolve naturally to the on-disk JPEGs, PNGs and woff2 fonts.
//   5. Inject the brand variables and the data-brand-luminance attribute
//      via page.evaluate() — runs against the real DOM, no string-parsing.
//   6. Replace [data-slot] inner content with caller-provided values.
//   7. Swap the logo placeholder for an <img> when a logoUrl is provided.
//   8. Wait for fonts + images to settle, then emit the PDF.
//
// Returns a PDF Buffer ready for the caller (Phase 2 endpoint) to stream
// to the user, store in R2, or both.

import * as path from "path";
import { pathToFileURL } from "url";
import puppeteer, { type Browser } from "puppeteer-core";
import chromium from "@sparticuz/chromium";

import { getTemplate, type TemplateDef } from "./templateLibrary";
import { resolveBrandRenderVars, type BrandInput, type BrandRenderVars } from "./colourUtils";

// ── Types ───────────────────────────────────────────────────────────

/**
 * Caller-supplied slot content. Keys are data-slot attribute values
 * (e.g. "about-text", "company-name", "summary-text"); values are
 * either:
 *
 *   - a string → all matching elements get that content
 *   - a string[] → indexed: element 0 gets value[0], element 1 gets
 *     value[1], etc. Elements beyond the array length get an empty
 *     string (so stale sample content doesn't survive).
 *
 * Slots not in this map are left as the template's sample content.
 */
export type SlotContent = Record<string, string | string[]>;

export interface RenderTemplateOptions {
  /** Template id in "sector/style" form, e.g. "it-services/01-split-screen". */
  templateId: string;
  /** User's brand colours from the organizations table. */
  brand: BrandInput;
  /** Content to inject into [data-slot] elements. */
  slotContent?: SlotContent;
  /** Absolute URL or file:// path to the user's logo image. When set,
   *  the logo placeholder is replaced with an <img> tag. */
  logoUrl?: string | null;
  /** Override PDF format. Defaults to A4 portrait. */
  format?: "A4";
  /** Override puppeteer launch timeout in milliseconds. Default 30s. */
  launchTimeoutMs?: number;
}

export interface RenderTemplateResult {
  /** The rendered PDF as a Buffer. */
  pdf: Buffer;
  /** Resolved template definition — useful for callers that want to
   *  log or persist which template was rendered. */
  template: TemplateDef;
  /** The brand variables actually used. Exposed for debugging. */
  brand: BrandRenderVars;
  /** Total render time in milliseconds. */
  durationMs: number;
}

// ── Public API ──────────────────────────────────────────────────────

export async function renderTemplate(
  options: RenderTemplateOptions,
): Promise<RenderTemplateResult> {
  const startedAt = Date.now();

  const template = getTemplate(options.templateId);
  if (!template) {
    throw new Error(`Unknown templateId: ${options.templateId}`);
  }

  const brand = resolveBrandRenderVars(options.brand);

  const browser = await launchBrowser(options.launchTimeoutMs ?? 30_000);
  try {
    const page = await browser.newPage();

    const fileUrl = pathToFileURL(template.htmlPath).toString();
    await page.goto(fileUrl, { waitUntil: "networkidle0", timeout: 60_000 });

    // Shim __name in the page context — esbuild wraps named functions
    // with a __name(fn, "name") helper that isn't defined in the
    // browser context. The anonymous arrow below isn't wrapped so it
    // serialises cleanly and provides the no-op shim that subsequent
    // wrapped functions need.
    await page.evaluate(() => {
      const g = globalThis as Record<string, unknown>;
      if (typeof g.__name === "undefined") {
        g.__name = (fn: unknown): unknown => fn;
      }
    });

    await page.evaluate(applyTemplateMutations, {
      brand,
      slotContent: options.slotContent ?? {},
      logoUrl: options.logoUrl ?? null,
    });

    if (options.logoUrl) {
      await page.evaluate(() => {
        const imgs = Array.from(document.querySelectorAll('img[data-injected-logo="true"]'));
        return Promise.all(
          imgs.map((img) => {
            const el = img as HTMLImageElement;
            if (el.complete) return Promise.resolve();
            return new Promise<void>((resolve) => {
              el.addEventListener("load", () => resolve(), { once: true });
              el.addEventListener("error", () => resolve(), { once: true });
            });
          }),
        );
      });
    }

    const pdf = (await page.pdf({
      format: options.format ?? "A4",
      printBackground: true,
      preferCSSPageSize: true,
      margin: { top: 0, right: 0, bottom: 0, left: 0 },
    })) as Buffer;

    return {
      pdf,
      template,
      brand,
      durationMs: Date.now() - startedAt,
    };
  } finally {
    await browser.close();
  }
}

// ── Internals ───────────────────────────────────────────────────────

async function launchBrowser(timeoutMs: number): Promise<Browser> {
  const executablePath = await chromium.executablePath();
  return puppeteer.launch({
    args: chromium.args,
    executablePath,
    headless: true,
    timeout: timeoutMs,
  });
}

/**
 * Runs inside the browser context. Serialised across the bridge — must
 * be self-contained, no outer-scope references.
 */
function applyTemplateMutations(payload: {
  brand: BrandRenderVars;
  slotContent: SlotContent;
  logoUrl: string | null;
}): void {
  const { brand, slotContent, logoUrl } = payload;

  // 1. Brand CSS variables.
  const styleTag = document.createElement("style");
  styleTag.setAttribute("data-injected-brand", "true");
  styleTag.textContent = `:root {
    --brand-primary: ${brand.brandPrimary};
    --brand-secondary: ${brand.brandSecondary};
    --brand-accent: ${brand.brandAccent};
    --brand-primary-text-safe: ${brand.brandPrimaryTextSafe};
    --brand-secondary-text-safe: ${brand.brandSecondaryTextSafe};
    --brand-accent-text-safe: ${brand.brandAccentTextSafe};
  }`;
  document.head.appendChild(styleTag);

  // 2. Luminance flag.
  if (brand.isLightBrand) {
    document.documentElement.setAttribute("data-brand-luminance", "light");
  }

  // 3. Slot replacement. String → all matches get the same content.
  //    Array → indexed; out-of-range matches get cleared.
  for (const [slotKey, slotValue] of Object.entries(slotContent)) {
    const targets = document.querySelectorAll<HTMLElement>(`[data-slot="${slotKey}"]`);
    if (Array.isArray(slotValue)) {
      targets.forEach((el, i) => {
        el.innerHTML = i < slotValue.length ? slotValue[i] : "";
      });
    } else {
      targets.forEach((el) => {
        el.innerHTML = slotValue;
      });
    }
  }

  // 4. Logo placeholder.
  if (logoUrl) {
    const escapedUrl = logoUrl
      .replace(/&/g, "&amp;")
      .replace(/"/g, "&quot;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");
    const logoSlots = document.querySelectorAll<HTMLElement>('[data-slot="logo"]');
    logoSlots.forEach((slot) => {
      slot.innerHTML = `<img src="${escapedUrl}" alt="" data-injected-logo="true" style="max-width: 100%; max-height: 100%; display: block; object-fit: contain;" />`;
    });
  }
}
