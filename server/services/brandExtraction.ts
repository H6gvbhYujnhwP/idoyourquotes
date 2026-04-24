/**
 * Brand Extraction Pipeline — Phase 4A Delivery 2
 *
 * Takes an organization's "brand evidence" (logo URL + company website URL +
 * up to 3 PDF brochures) and turns it into structured brand tokens
 * (primary/secondary colours, font feel, tone) that the branded proposal
 * renderer can consume.
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
 *   writes to the brand_extracted_* columns added in migration 0017.
 */

import { openai, isOpenAIConfigured } from "../_core/openai";
import { getUserPrimaryOrg, updateOrganization, getOrganizationById } from "../db";
import { getFileBuffer } from "../r2Storage";
import { createRequire } from "module";

// pdf-parse v2 is ESM-with-CJS entry — mirror the pattern in _core/claude.ts.
const require = createRequire(import.meta.url);
const { PDFParse } = require("pdf-parse") as {
  PDFParse: new (opts: { data: Buffer | Uint8Array }) => any;
};

// ── Tuning ──────────────────────────────────────────────────────────────
const COOLDOWN_MS = 60_000;
const WEBSITE_FETCH_TIMEOUT_MS = 8_000;
const WEBSITE_MAX_BYTES = 300_000; // truncate HTML after this to keep prompt size sane
const BROCHURE_PAGES_PER_FILE = 3;
const BROCHURE_MAX_CHARS_PER_FILE = 6_000;
const OPENAI_MODEL = "gpt-4o";
// Browser-ish UA — many marketing sites 403 plain scripted fetches.
const WEBSITE_USER_AGENT =
  "Mozilla/5.0 (Macintosh; Intel Mac OS X 14_0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36";

type BrandBrochure = {
  key: string;
  url: string;
  filename: string;
  uploadedAt: string;
};

type ExtractionResult = {
  primaryColor: string | null;
  secondaryColor: string | null;
  fontFeel: string | null;
  tone: string | null;
};

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
  const brochures = (((org as any).brandBrochures as BrandBrochure[] | null) || []);
  const hasEvidence = !!(logo || website || brochures.length > 0);

  if (!hasEvidence) {
    // No evidence — reset cleanly. Don't mark failed.
    await updateOrganization(orgId, {
      brandExtractionStatus: "idle",
      brandExtractionError: null,
    } as any);
    return;
  }

  if (!isOpenAIConfigured()) {
    await updateOrganization(orgId, {
      brandExtractionStatus: "failed",
      brandExtractionError: "AI extraction is not configured on this server.",
    } as any);
    return;
  }

  // ── Mark pending ─────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    brandExtractionStatus: "pending",
    brandExtractionError: null,
  } as any);

  // ── Gather evidence ──────────────────────────────────────────────────
  let websiteSnippet = "";
  let websiteNote = "";
  if (website) {
    const fetched = await fetchWebsite(website);
    websiteSnippet = fetched.body;
    websiteNote = fetched.note;
  }

  const brochureExcerpts: Array<{ filename: string; text: string }> = [];
  for (const b of brochures) {
    try {
      const text = await extractBrochureText(b);
      if (text) brochureExcerpts.push({ filename: b.filename, text });
    } catch (err: any) {
      console.warn(
        `[brandExtraction] brochure ${b.filename} text extraction failed:`,
        err?.message,
      );
    }
  }

  // ── Ask GPT-4o for structured tokens ─────────────────────────────────
  let result: ExtractionResult;
  try {
    result = await callOpenAI({
      hasLogo: !!logo,
      websiteUrl: website,
      websiteSnippet,
      websiteNote,
      brochureExcerpts,
    });
  } catch (err: any) {
    console.error(`[brandExtraction] OpenAI call failed for org ${orgId}:`, err?.message);
    await updateOrganization(orgId, {
      brandExtractionStatus: "failed",
      brandExtractionError: friendlyError(err),
    } as any);
    return;
  }

  // ── Persist ──────────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    brandExtractedPrimaryColor: result.primaryColor,
    brandExtractedSecondaryColor: result.secondaryColor,
    brandExtractedFontFeel: result.fontFeel,
    brandExtractedTone: result.tone,
    brandExtractionStatus: "ready",
    brandExtractionError: null,
    brandExtractedAt: new Date(),
  } as any);

  console.log(
    `[brandExtraction] org ${orgId} ready — primary=${result.primaryColor}, feel=${result.fontFeel}`,
  );
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
// Brochure text extraction — first N pages via pdf-parse v2.
// ─────────────────────────────────────────────────────────────────────────
async function extractBrochureText(b: BrandBrochure): Promise<string> {
  // Brochures live in R2 under the key format used by uploadBrandBrochure.
  // The stored `url` is the /api/file/<key> proxy URL, so we pull by key.
  const buffer = await getFileBuffer(b.key);
  const parser = new PDFParse({ data: buffer });
  try {
    const parsed = await parser.getText();
    const rawText: string = parsed?.text || "";
    // Strip the page-separator noise pdf-parse v2 injects.
    const stripped = rawText
      .replace(/--\s*\d+\s+of\s+\d+\s*--/g, " ")
      .replace(/\s+/g, " ")
      .trim();
    if (!stripped) return "";

    // Rough "first N pages" cut: pdf-parse returns whole-document text in
    // one blob post-strip, so fall back to a char budget that's roughly
    // equivalent to 3 dense pages.
    const cap = Math.min(stripped.length, BROCHURE_MAX_CHARS_PER_FILE);
    // Include the page count hint so the AI understands we've sampled.
    const totalPages = parsed?.total || 1;
    const sampledNote =
      totalPages > BROCHURE_PAGES_PER_FILE
        ? ` [sampled text from a ${totalPages}-page document]`
        : "";
    return stripped.slice(0, cap) + sampledNote;
  } finally {
    try {
      await parser.destroy();
    } catch {
      /* noop */
    }
  }
}

// ─────────────────────────────────────────────────────────────────────────
// GPT-4o structured prompt. Asks for JSON only; we parse defensively.
// ─────────────────────────────────────────────────────────────────────────
async function callOpenAI(input: {
  hasLogo: boolean;
  websiteUrl: string | null;
  websiteSnippet: string;
  websiteNote: string;
  brochureExcerpts: Array<{ filename: string; text: string }>;
}): Promise<ExtractionResult> {
  const evidenceParts: string[] = [];

  if (input.hasLogo) {
    evidenceParts.push(
      "The company has uploaded a logo (not shown in this prompt). Infer colour palette from the website and brochures below, and assume the logo is consistent.",
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

  input.brochureExcerpts.forEach((b, i) => {
    evidenceParts.push(
      `--- BROCHURE ${i + 1}: ${b.filename} ---\n${b.text}\n--- END BROCHURE ${i + 1} ---`,
    );
  });

  const evidenceBlock =
    evidenceParts.length > 0
      ? evidenceParts.join("\n\n")
      : "No evidence provided.";

  const systemPrompt = `You are a brand analyst. Given raw evidence about a small UK business — a logo, a company website's HTML, and up to three marketing brochures — extract structured brand tokens suitable for styling branded proposal documents.

You must return a single JSON object with exactly these keys:
{
  "primaryColor": "#rrggbb",       // main brand colour, lowercase hex; null if you cannot infer with any confidence
  "secondaryColor": "#rrggbb",     // supporting colour; null if you cannot infer
  "fontFeel": "serif" | "sans" | "display" | "mixed",  // typographic personality suggested by the brand; null if unclear
  "tone": "short paragraph"        // 1–3 sentences describing the brand voice in plain English (e.g. "Warm and personal, with understated confidence. Prioritises clarity over jargon.")
}

Rules:
- Output only the JSON object, no commentary, no Markdown fences.
- Hex colours must be 7 characters with a leading # (e.g. "#1a3a5c"). Do not output named colours.
- Prefer colours that are actually present on the website over inferences from text.
- If you have only the URL and no fetched content, still do your best to infer from the URL's likely sector and tone, but lower confidence should push fields toward null rather than fabricated values.
- Tone should be specific and useful for a proposal writer — avoid generic adjectives like "professional" on its own.`;

  const userPrompt = `Extract the brand tokens for this company:\n\n${evidenceBlock}`;

  const response = await openai.chat.completions.create({
    model: OPENAI_MODEL,
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userPrompt },
    ],
    response_format: { type: "json_object" },
    temperature: 0.2,
    max_tokens: 400,
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
    primaryColor: normaliseHex(parsed?.primaryColor),
    secondaryColor: normaliseHex(parsed?.secondaryColor),
    fontFeel: normaliseFontFeel(parsed?.fontFeel),
    tone: normaliseTone(parsed?.tone),
  };
}

// ── Defensive parsing helpers ────────────────────────────────────────────
function normaliseHex(v: unknown): string | null {
  if (typeof v !== "string") return null;
  const trimmed = v.trim().toLowerCase();
  if (!/^#[0-9a-f]{6}$/.test(trimmed)) return null;
  return trimmed;
}

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

function friendlyError(err: any): string {
  const msg = (err?.message || "").toString();
  if (msg.includes("rate limit") || msg.includes("429")) {
    return "AI rate limit reached. Try again in a minute.";
  }
  if (msg.includes("invalid") && msg.includes("api key")) {
    return "AI API key is invalid or missing.";
  }
  if (msg.includes("timeout") || msg.includes("timed out")) {
    return "Extraction timed out. Try again.";
  }
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg || "Extraction failed.";
}

/**
 * Helper so mutation handlers can look up the org directly when they only
 * have the user id. Kept here to avoid cluttering the db helpers file.
 */
export async function triggerBrandExtractionForUser(userId: number): Promise<void> {
  const org = await getUserPrimaryOrg(userId);
  if (org) triggerBrandExtraction(org.id);
}
