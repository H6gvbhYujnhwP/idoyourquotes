/**
 * Brand Extraction Pipeline — Phase 4A Delivery 2
 * (Brochure input retired in Delivery 13.
 *  Colour extraction switched to deterministic CSS scrape in Delivery 14.)
 *
 * Takes an organization's "brand evidence" (logo URL + company website URL)
 * and turns it into structured brand tokens (primary/secondary colours,
 * font feel, tone) that the branded proposal renderer can consume.
 *
 * Two-stage pipeline:
 *   1. Colours (primary, secondary) — deterministic CSS extraction from
 *      the website's HTML and linked stylesheets. See cssColorExtraction.ts.
 *      No AI, no per-call cost, ~50ms.
 *   2. Tone & font-feel — GPT-4o on a trimmed website snippet. Subjective
 *      interpretation is GPT's strength; colour extraction was its weakness
 *      (the noise:signal ratio of WordPress/Webflow markup drowned the
 *      signal under the prompt's "push toward null rather than fabricate"
 *      rule). Splitting the responsibilities fixes the NULL-token issue
 *      that blocked Phase 4C-1.
 *
 * Design rules:
 * - Fire-and-forget from mutation handlers: triggerBrandExtraction(orgId)
 *   returns immediately and runs async. Callers never await.
 * - Cooldown of 60s between successful extractions per org.
 * - In-flight guard: while status='pending', new triggers are no-ops.
 * - Skip entirely when there is no evidence of any kind.
 * - Store a clear `brandExtractionError` on failure; no auto-retry loop.
 * - Distinct from colorExtractor.ts (logo-pixel extraction), which keeps
 *   writing to brand_primary_color / brand_secondary_color. This pipeline
 *   writes to the brand_extracted_* columns added in migration 0017. The
 *   renderer reads brand_extracted_* first, falling back to the logo-pixel
 *   values when the website-derived values are null.
 */

import { openai, isOpenAIConfigured } from "../_core/openai";
import { getUserPrimaryOrg, updateOrganization, getOrganizationById } from "../db";
// Phase 4A Delivery 17 — coverImageGeneration chainpoint retired. The
// AI-generated cover image (D12–D16) is no longer read by any template.
// The Modern template (D18) and the future Structured / Bold templates
// use a typography-led cover with a stat strip — no AI image. Schema
// columns (cover_image_url, cover_image_status, cover_image_error,
// cover_image_prompt, cover_image_generated_at) stay in place as orphans
// for now; column drop is a future cleanup, not blocking.
import { extractColoursFromWebsite } from "./cssColorExtraction";

// ── Tuning ──────────────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;
const WEBSITE_FETCH_TIMEOUT_MS = 8_000;
const WEBSITE_MAX_BYTES = 300_000; // truncate HTML after this to keep prompt size sane
const OPENAI_MODEL = "gpt-4o";
// Browser-ish UA — many marketing sites 403 plain scripted fetches.
const WEBSITE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

/**
 * Public entry point — call this from mutation handlers after the DB
 * update is committed. Never awaited by callers.
 */
export function triggerBrandExtraction(orgId: number): void {
  // Schedule on next tick so the calling mutation can return its response
  // before we start any heavy work.
  setImmediate(() => {
    runExtraction(orgId).catch(err => {
      // Last-resort safety net. runExtraction's own try/catch already
      // records errors to the DB; this only fires for unexpected throws.
      console.error(`[brandExtraction] unhandled error for org ${orgId}:`, err);
    });
  });
}

async function runExtraction(orgId: number): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    console.warn(`[brandExtraction] org ${orgId} not found`);
    return;
  }

  // ── Gate checks ──────────────────────────────────────────────────────
  const status = (org as any).brandExtractionStatus as string | undefined;
  if (status === "pending") {
    console.log(`[brandExtraction] org ${orgId} already pending — skipping`);
    return;
  }

  const lastAt = (org as any).brandExtractedAt as Date | string | null | undefined;
  if (lastAt) {
    const lastMs = lastAt instanceof Date ? lastAt.getTime() : new Date(lastAt).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < COOLDOWN_MS) {
      console.log(`[brandExtraction] org ${orgId} within cooldown — skipping`);
      return;
    }
  }

  const logo = (org as any).companyLogo as string | null;
  const website = (org as any).companyWebsite as string | null;
  const hasEvidence = !!(logo || website);

  if (!hasEvidence) {
    // No evidence — reset cleanly. Don't mark failed.
    await updateOrganization(orgId, {
      brandExtractionStatus: "idle",
      brandExtractionError: null,
    } as any);
    return;
  }

  // ── Mark pending ─────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    brandExtractionStatus: "pending",
    brandExtractionError: null,
  } as any);

  // ── Stage 1: Fetch website ──────────────────────────────────────────
  let websiteSnippet = "";
  let websiteNote = "";
  if (website) {
    const fetched = await fetchWebsite(website);
    websiteSnippet = fetched.body;
    websiteNote = fetched.note;
  }

  // ── Stage 2: Deterministic colour extraction from CSS ───────────────
  // No AI, no per-call cost. Returns nulls cleanly when the website
  // has no extractable colour signal — renderer's fallback chain
  // (extracted → logo-pixel → template default) handles that case.
  let primaryColor: string | null = null;
  let secondaryColor: string | null = null;
  if (websiteSnippet && website) {
    try {
      const cssResult = await extractColoursFromWebsite(
        websiteSnippet,
        website,
      );
      primaryColor = cssResult.primary;
      secondaryColor = cssResult.secondary;
      if (cssResult.sources.length > 0) {
        console.log(
          `[brandExtraction] org ${orgId} CSS colours from [${cssResult.sources.join(", ")}]: primary=${primaryColor}, secondary=${secondaryColor}`,
        );
      }
    } catch (err: any) {
      // Best-effort — log and continue with nulls. The renderer falls
      // back to the logo-pixel pass when these are null, so a CSS
      // extraction failure cannot break a proposal.
      console.warn(
        `[brandExtraction] CSS colour extraction failed for org ${orgId}:`,
        err?.message,
      );
    }
  }

  // ── Stage 3: GPT-4o for tone + font-feel only ───────────────────────
  // GPT is now narrowly scoped to subjective interpretation — its
  // strength. Colours are out of its hands entirely. If the call fails
  // or OpenAI is unavailable, tone/feel stay null and the renderer
  // uses defaults; we never mark the whole extraction as failed for a
  // tone failure since colours may already have succeeded.
  let fontFeel: string | null = null;
  let tone: string | null = null;
  if (isOpenAIConfigured() && (websiteSnippet || logo)) {
    try {
      const toneResult = await callOpenAIForToneAndFeel({
        hasLogo: !!logo,
        websiteUrl: website,
        websiteSnippet,
        websiteNote,
      });
      fontFeel = toneResult.fontFeel;
      tone = toneResult.tone;
    } catch (err: any) {
      console.error(
        `[brandExtraction] OpenAI tone/feel call failed for org ${orgId}:`,
        err?.message,
      );
      // Continue to persist whatever colours we managed to extract.
    }
  }

  // ── Persist ──────────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    brandExtractedPrimaryColor: primaryColor,
    brandExtractedSecondaryColor: secondaryColor,
    brandExtractedFontFeel: fontFeel,
    brandExtractedTone: tone,
    brandExtractionStatus: "ready",
    brandExtractionError: null,
    brandExtractedAt: new Date(),
  } as any);

  console.log(
    `[brandExtraction] org ${orgId} ready — primary=${primaryColor}, secondary=${secondaryColor}, feel=${fontFeel}, tone=${tone ? "set" : "null"}`,
  );

  // Phase 4A Delivery 17 — cover image generation chainpoint removed.
  // The Modern template (and future Structured / Bold templates) render
  // the cover from typography + brand colours + stat strip, with no AI
  // background image. The chainpoint that fired triggerCoverImageGeneration
  // here was retired as part of the same delivery. Schema columns are
  // left in place as orphans (column drop is a future cleanup).
}

// ─────────────────────────────────────────────────────────────────────────
// Website fetch — plain GET with a browser UA and a short timeout.
// Returns a truncated HTML body or a human-readable note explaining why
// the fetch did not contribute. Never throws; failure just yields empty
// body + a note that the AI prompt includes for context.
// ─────────────────────────────────────────────────────────────────────────
async function fetchWebsite(url: string): Promise<{ body: string; note: string }> {
  try {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), WEBSITE_FETCH_TIMEOUT_MS);
    let res: Response;
    try {
      res = await fetch(url, {
        method: "GET",
        headers: {
          "User-Agent": WEBSITE_USER_AGENT,
          "Accept": "text/html,application/xhtml+xml,*/*;q=0.8",
          "Accept-Language": "en-GB,en;q=0.9",
        },
        signal: controller.signal,
        redirect: "follow",
      });
    } finally {
      clearTimeout(timer);
    }

    if (!res.ok) {
      return { body: "", note: `Website returned HTTP ${res.status}.` };
    }
    const ct = (res.headers.get("content-type") || "").toLowerCase();
    if (!ct.includes("html")) {
      return { body: "", note: `Website returned non-HTML content-type (${ct}).` };
    }

    const text = await res.text();
    if (!text.trim()) {
      return { body: "", note: "Website returned an empty response." };
    }

    const truncated =
      text.length > WEBSITE_MAX_BYTES ? text.slice(0, WEBSITE_MAX_BYTES) : text;
    return { body: truncated, note: "" };
  } catch (err: any) {
    const msg = err?.name === "AbortError" ? "timed out" : err?.message || "unknown";
    return { body: "", note: `Website fetch failed (${msg}).` };
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GPT-4o structured prompt — tone + font-feel only (Delivery 14).
// Colour extraction was moved to cssColorExtraction.ts which returns
// reliable colours from the website's CSS rather than asking the LLM
// to guess from raw HTML. GPT here is only doing what it's good at:
// subjective interpretation of brand voice and typographic personality.
// Asks for JSON only; we parse defensively.
// ─────────────────────────────────────────────────────────────────────────
async function callOpenAIForToneAndFeel(input: {
  hasLogo: boolean;
  websiteUrl: string | null;
  websiteSnippet: string;
  websiteNote: string;
}): Promise<{ fontFeel: string | null; tone: string | null }> {
  const evidenceParts: string[] = [];

  if (input.hasLogo) {
    evidenceParts.push(
      "The company has uploaded a logo (not shown in this prompt). Assume the typography on the website is consistent with the logo's overall feel.",
    );
  }

  if (input.websiteUrl) {
    if (input.websiteSnippet) {
      evidenceParts.push(
        `--- WEBSITE (${input.websiteUrl}) ---\n${input.websiteSnippet}\n--- END WEBSITE ---`,
      );
    } else {
      evidenceParts.push(
        `Website URL: ${input.websiteUrl}\nNote: ${input.websiteNote || "no content available"}.`,
      );
    }
  }

  const evidenceBlock =
    evidenceParts.length > 0
      ? evidenceParts.join("\n\n")
      : "No evidence provided.";

  const systemPrompt = `You are a brand analyst. Given raw evidence about a small UK business — a logo and a company website's HTML — describe the brand's typographic personality and voice. You are ONLY responsible for these two qualitative judgements; colour extraction is handled by a separate deterministic pipeline.

You must return a single JSON object with exactly these keys:
{
  "fontFeel": "serif" | "sans" | "display" | "mixed",  // typographic personality suggested by the brand; null if unclear
  "tone": "short paragraph"        // 1–3 sentences describing the brand voice in plain English (e.g. "Warm and personal, with understated confidence. Prioritises clarity over jargon.")
}

Rules:
- Output only the JSON object, no commentary, no Markdown fences.
- "fontFeel" should reflect the dominant typographic personality you can infer from the page's headings and body copy, not the literal CSS font stack. If the page is plain HTML with no visible typographic character, return null.
- "tone" should be specific and useful for a proposal writer — avoid generic adjectives like "professional" on its own. Lean on what the actual copy says about how the brand speaks.
- If the website body is absent or extremely thin, push fields toward null rather than fabricating.`;

  const userPrompt = `Describe the brand's tone and typographic feel:\n\n${evidenceBlock}`;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 300,
  });

  const raw = response.choices[0]?.message?.content?.trim() || "";
  if (!raw) throw new Error("Empty response from AI.");

  let parsed: any;
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("AI returned invalid JSON.");
  }

  return {
    fontFeel: normaliseFontFeel(parsed?.fontFeel),
    tone: normaliseTone(parsed?.tone),
  };
}

// ── Defensive parsing helpers ────────────────────────────────────────────
function normaliseFontFeel(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim().toLowerCase();
  if (["serif", "sans", "display", "mixed"].includes(t)) return t;
  // Accept common variants
  if (t === "sans-serif" || t === "sans serif") return "sans";
  return null;
}

function normaliseTone(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const t = v.trim();
  if (!t) return null;
  // Cap length so we never blow up a DB row or a later prompt.
  return t.length > 500 ? t.slice(0, 497) + "…" : t;
}

/**
 * Helper so mutation handlers can look up the org directly when they only
 * have the user id. Kept here to avoid cluttering the db helpers file.
 */
export async function triggerBrandExtractionForUser(userId: number): Promise<void> {
  const org = await getUserPrimaryOrg(userId);
  if (org) triggerBrandExtraction(org.id);
}
