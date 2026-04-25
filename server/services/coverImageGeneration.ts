/**
 * Cover Image Generation Pipeline — Phase 4A Delivery 12.
 *
 * Generates a unique abstract cover hero image per organisation using
 * Gemini 2.5 Flash Image ("Nano Banana"), stores the PNG in R2, and
 * writes the proxy URL back to organizations.cover_image_url for the
 * branded proposal renderer to consume.
 *
 * The generated image is used as a BACKDROP on the cover page —
 * brandedProposalRenderer.ts overlays a brand-primary-tinted ~78%
 * opacity layer on top, so the image's job is to provide depth,
 * texture, and brand-aligned atmosphere rather than to be a focal
 * point. Prompts reflect that.
 *
 * Design rules — mirrors brandExtraction.ts intentionally so the two
 * pipelines feel like one system:
 * - Fire-and-forget from chainpoint; never awaited by callers.
 * - 24-hour cooldown between successful generations per org. Image
 *   gen is paid-per-call; we do not regenerate on every save.
 * - In-flight guard via cover_image_status='pending'.
 * - Skip when brand evidence is too thin (no logo AND no website AND
 *   no logo-pixel colour signal) — there's nothing for the prompt to
 *   anchor to.
 * - Graceful failure: status='failed' with an error stored. The
 *   renderer always falls through to the flat-colour cover when no
 *   image is present, so a failed generation never breaks a proposal.
 *
 * Cost: ~$0.04 per generation via Google AI Studio (gemini-2.5-flash-image
 * is billed at ~1290 output tokens per image at $30 / 1M tokens). One-off
 * per org per evidence change. At 1000 active Pro orgs that's ~£40 of
 * Google bills if every org regenerates monthly. Acceptable.
 */

import { getOrganizationById, updateOrganization } from "../db";
import { uploadToR2, isR2Configured } from "../r2Storage";

// ── Tuning ──────────────────────────────────────────────────────────────
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// 3:4 portrait — closest standard ratio to A4 (which is 1:1.414 ≈ 5:7).
// The cover renderer's flex layout means exact ratio isn't critical —
// background-size: cover handles overflow either way.
const ASPECT_RATIO = "3:4";

// ─────────────────────────────────────────────────────────────────────────
// Public entry point — call after a successful brand extraction. Never
// awaited. Schedules on next tick so the caller's mutation can return.
// ─────────────────────────────────────────────────────────────────────────
export function triggerCoverImageGeneration(orgId: number): void {
  setImmediate(() => {
    runGeneration(orgId).catch(err => {
      // Last-resort safety net — runGeneration's own try/catch records
      // errors to the DB; this only fires for unexpected throws.
      console.error(`[coverImageGeneration] unhandled error for org ${orgId}:`, err);
    });
  });
}

async function runGeneration(orgId: number): Promise<void> {
  const org = await getOrganizationById(orgId);
  if (!org) {
    console.warn(`[coverImageGeneration] org ${orgId} not found`);
    return;
  }

  // ── Gate checks ──────────────────────────────────────────────────────
  const status = (org as any).coverImageStatus as string | undefined;
  if (status === "pending") {
    console.log(`[coverImageGeneration] org ${orgId} already pending — skipping`);
    return;
  }

  const lastAt = (org as any).coverImageGeneratedAt as Date | string | null | undefined;
  if (lastAt) {
    const lastMs = lastAt instanceof Date ? lastAt.getTime() : new Date(lastAt).getTime();
    if (Number.isFinite(lastMs) && Date.now() - lastMs < COOLDOWN_MS) {
      console.log(`[coverImageGeneration] org ${orgId} within 24h cooldown — skipping`);
      return;
    }
  }

  // Evidence floor — if we have nothing meaningful to anchor a prompt
  // on, skip rather than burn a generation on a generic cover.
  const logo = (org as any).companyLogo as string | null;
  const website = (org as any).companyWebsite as string | null;
  const brandPrimary = (org as any).brandPrimaryColor as string | null;
  const brandExtractedPrimary = (org as any).brandExtractedPrimaryColor as string | null;
  const hasEvidence = !!(logo || website || brandPrimary || brandExtractedPrimary);
  if (!hasEvidence) {
    console.log(`[coverImageGeneration] org ${orgId} has no brand evidence — skipping`);
    return;
  }

  // Service availability
  if (!process.env.GEMINI_API_KEY) {
    await updateOrganization(orgId, {
      coverImageStatus: "failed",
      coverImageError: "Gemini API key not configured on this server.",
    } as any);
    return;
  }
  if (!isR2Configured()) {
    await updateOrganization(orgId, {
      coverImageStatus: "failed",
      coverImageError: "File storage is not configured on this server.",
    } as any);
    return;
  }

  // ── Mark pending ─────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    coverImageStatus: "pending",
    coverImageError: null,
  } as any);

  // ── Build prompt ─────────────────────────────────────────────────────
  const prompt = buildPrompt({
    companyName: (org as any).companyName || (org as any).name || "the company",
    sector: (org as any).defaultTradeSector as string | null,
    primary: brandExtractedPrimary || brandPrimary || null,
    secondary:
      ((org as any).brandExtractedSecondaryColor as string | null)
      || ((org as any).brandSecondaryColor as string | null)
      || null,
    tone: (org as any).brandExtractedTone as string | null,
    fontFeel: (org as any).brandExtractedFontFeel as string | null,
  });

  // ── Call Gemini ──────────────────────────────────────────────────────
  let imageBuffer: Buffer;
  try {
    imageBuffer = await callGemini(prompt);
  } catch (err: any) {
    console.error(`[coverImageGeneration] Gemini call failed for org ${orgId}:`, err?.message);
    await updateOrganization(orgId, {
      coverImageStatus: "failed",
      coverImageError: friendlyError(err),
      coverImagePrompt: prompt,
    } as any);
    return;
  }

  // ── Upload to R2 ─────────────────────────────────────────────────────
  let url: string;
  try {
    const filename = `cover-${Date.now()}.png`;
    const result = await uploadToR2(imageBuffer, filename, "image/png", `org-${orgId}/cover`);
    url = result.url;
  } catch (err: any) {
    console.error(`[coverImageGeneration] R2 upload failed for org ${orgId}:`, err?.message);
    await updateOrganization(orgId, {
      coverImageStatus: "failed",
      coverImageError: `Storage upload failed: ${err?.message || "unknown error"}`,
      coverImagePrompt: prompt,
    } as any);
    return;
  }

  // ── Persist ──────────────────────────────────────────────────────────
  await updateOrganization(orgId, {
    coverImageUrl: url,
    coverImageStatus: "ready",
    coverImageError: null,
    coverImagePrompt: prompt,
    coverImageGeneratedAt: new Date(),
  } as any);

  console.log(
    `[coverImageGeneration] org ${orgId} ready — url=${url}, prompt-length=${prompt.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt construction. The image is a BACKDROP — the cover overlays a
// brand-primary-tinted 78% opacity layer on top, so the prompt
// emphasises depth, texture, and tonal restraint over focal subjects.
// ─────────────────────────────────────────────────────────────────────────
function buildPrompt(input: {
  companyName: string;
  sector: string | null;
  primary: string | null;
  secondary: string | null;
  tone: string | null;
  fontFeel: string | null;
}): string {
  // Phase 4A Delivery 15 — geometric decoration prompt.
  //
  // The previous prompt aimed for "atmospheric backdrop" and Gemini
  // produced exactly that — soft volumetric photographic-feel images
  // that disappeared under a 78% brand-tint overlay. The renderer's
  // overlay is gone in D15, and so is the photographic ask. Now we
  // ask for flat vector geometric decoration the renderer can place
  // directly on the cover and as section bands across the document.
  //
  // The constraint stack matters more than the creative direction:
  //   - Two-tone only (primary + a lighter variant of primary). Removes
  //     the model's tendency to introduce contrasting accents that
  //     don't belong to the brand.
  //   - Sparse composition, 8–12 shapes max. Memphis influence at
  //     low density, not high.
  //   - Left half quiet — the renderer's text zone sits there. If the
  //     model honours this we don't need an overlay for legibility.
  //   - Flat vector style. No photography, no atmospheric haze, no
  //     metallic sheen, no 3D effects. The image needs to read as
  //     "graphic design" not "stock photography".

  const primary = input.primary || "#1e293b";

  const colourGuidance = `
COLOUR PALETTE — STRICTLY TWO TONES:
- Background: ${primary} (the dominant brand colour, fills the canvas)
- Shapes: a noticeably lighter tonal variation of ${primary} — same hue family, increased lightness by roughly 25-40%. Soft, calm, not bright. Think the relationship between a deep teal and a pale teal, or a deep navy and a sky blue.
- ABSOLUTELY NO other colours. No white, no black, no contrasting accents, no rainbow colours. Two tones only.`;

  return `Generate an elegant abstract decorative graphic for a corporate proposal.

REQUIREMENTS:
- Aspect: 3:4 portrait
- Style: minimalist geometric decoration. Memphis-design influence (playful shape arrangement) tempered by Linear/Pitch SaaS sophistication (premium restraint). The result should feel like a confident page from a designer's brand identity manual — quietly elegant, considered, premium. NOT photographic, NOT atmospheric, NOT 3D — flat vector-style fills with hard clean edges throughout.
${colourGuidance}

SHAPE VOCABULARY — use a thoughtful mix of these:
- Circles of varying sizes (some large, occupying ~15-20% of the canvas; some small, ~3-5%; perfect geometric circles, no soft edges)
- One or two flowing wavy lines of consistent stroke weight (sweeping organic curves, hand-drawn feel but clean)
- Arcs and partial circles (semi-circles, three-quarter circles peeking from edges)
- Small scattered dots (groupings of 5-10 tiny dots as accent texture)

COMPOSITION RULES — these are non-negotiable:
- Total shapes: between 8 and 12. NOT MORE. Sparse and intentional, never crowded.
- The LEFT HALF of the canvas must be relatively empty. A single large faint shape can sit there but no detailed clusters. The renderer places title text in this zone.
- Visual interest concentrated in the UPPER-RIGHT and LOWER-RIGHT quadrants.
- One sweeping wavy line MAY cross the canvas as a unifying gesture. If used, only one.
- Shapes can overlap subtly but not stack densely — each shape should remain readable as its own element.

MOOD: confident, premium, elegant, considered. Think a McKinsey proposal cover designed by someone who studied Bauhaus and modern Scandinavian design.

DO NOT:
- Include any text, letters, numbers, logos, or symbols
- Include people, faces, hands, body parts, or any literal objects
- Include literal industry depictions (no servers, no buildings, no tools, no anything literal)
- Use any third colour, gradient, photographic texture, or 3D effect
- Use atmospheric haze, soft glows, light particles, or metallic sheen
- Place focal shapes in the lower-left or centre-left — those zones are reserved for text overlay
- Create a dense, busy, or chaotic composition — restraint is the brief`;
}

// ─────────────────────────────────────────────────────────────────────────
// Gemini REST call. Uses the Google AI Studio endpoint with x-goog-api-key
// auth — no SDK package needed (avoids pnpm-lock.yaml regeneration churn).
// Returns a Buffer of the generated PNG.
// ─────────────────────────────────────────────────────────────────────────
async function callGemini(prompt: string): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), GEMINI_TIMEOUT_MS);

  let res: Response;
  try {
    res = await fetch(GEMINI_ENDPOINT, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        "x-goog-api-key": apiKey,
      },
      signal: controller.signal,
      body: JSON.stringify({
        contents: [{
          role: "user",
          parts: [{ text: prompt }],
        }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          imageConfig: { aspectRatio: ASPECT_RATIO },
        },
      }),
    });
  } finally {
    clearTimeout(timer);
  }

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Gemini API returned HTTP ${res.status}: ${errText.slice(0, 300)}`);
  }

  const json: any = await res.json();

  // Walk the response structure to find inlineData. The exact path is
  // candidates[0].content.parts[].inlineData.data, but parts can include
  // mixed text/image so we filter to the image part.
  const candidate = json?.candidates?.[0];
  if (!candidate) throw new Error("Gemini response had no candidates.");
  const parts = candidate?.content?.parts as Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> | undefined;
  if (!parts) throw new Error("Gemini response candidate had no content parts.");

  const imagePart = parts.find(p => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    // Surface the text response if the model returned text instead of an
    // image — usually means the prompt was filtered or refused.
    const textPart = parts.find(p => typeof p.text === "string")?.text;
    throw new Error(
      textPart
        ? `Gemini returned text instead of an image: ${textPart.slice(0, 200)}`
        : "Gemini response had no image data.",
    );
  }

  return Buffer.from(imagePart.inlineData.data, "base64");
}

// ─────────────────────────────────────────────────────────────────────────
// Helpers
// ─────────────────────────────────────────────────────────────────────────
function friendlyError(err: any): string {
  const msg = (err?.message || "").toString();
  if (msg.includes("API key") || msg.includes("API_KEY")) {
    return "Gemini API key is invalid or missing.";
  }
  if (msg.includes("429") || msg.toLowerCase().includes("rate")) {
    return "Gemini rate limit reached. Try again in a minute.";
  }
  if (msg.includes("timeout") || msg.toLowerCase().includes("aborted")) {
    return "Gemini request timed out.";
  }
  if (msg.includes("safety") || msg.includes("blocked") || msg.includes("filtered")) {
    return "Image generation was filtered by safety policy. Try regenerating after updating brand evidence.";
  }
  return msg.length > 200 ? msg.slice(0, 200) + "…" : msg || "Cover image generation failed.";
}
