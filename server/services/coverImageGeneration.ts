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
  const sectorContext = getSectorContext(input.sector);

  const colourGuidance = input.primary
    ? `Build the image around ${input.primary} as the dominant tone${
        input.secondary ? ` with subtle ${input.secondary} accents` : ""
      }. Mid-to-dark tonal range — darker overall is better since the image will be overlaid with a ${input.primary}-tinted 78% opacity layer.`
    : `Use a sophisticated mid-to-dark monochrome palette. Darker overall is better since the image will be overlaid with a brand-tinted 78% opacity layer.`;

  const toneNote = input.tone
    ? `Brand voice (use to inform mood, not literal content): ${input.tone}`
    : "";

  return `Generate a sophisticated abstract background image for a corporate proposal cover.

REQUIREMENTS:
- Aspect: 3:4 portrait
- Style: minimalist, premium corporate aesthetic — the kind of image you'd see on the cover of a high-end consulting firm proposal (think McKinsey, Deloitte, BCG). Quiet, confident, considered.
- Subject: ABSTRACT only — geometric forms, atmospheric gradients, light particles, soft volumetric textures. Absolutely no people, no objects, no text, no logos, no recognisable brand marks.
- Colour treatment: ${colourGuidance}
- Composition: this image is a BACKDROP, not a focal piece. The lower-left to centre area should be relatively quiet because text overlays will sit there. Visual interest can be in the upper-right or upper edges. Avoid sharp focal points anywhere in the lower half.
- Mood: confident, premium, considered. The image should make a £20k+ contract feel earned.

CONTEXT (use for tonal flavour, not literal depiction):
Company: ${input.companyName}
Industry feel: ${sectorContext}
${toneNote}

GOOD REFERENCE STYLES:
- Soft volumetric light through abstract architectural forms
- Layered geometric depth with subtle gradient transitions
- Atmospheric haze with hints of structure and direction
- Minimal flowing curves with subtle metallic sheen
- Long-exposure light trails on a dark canvas

DO NOT:
- Include any text, words, letters, numbers, logos, or symbols
- Include people, faces, hands, or body parts
- Include literal industry depictions (no servers for IT, no mops for cleaning, etc.)
- Use bright primary colours that would clash with a dark brand overlay
- Create a dense, busy composition — this needs to recede behind text`;
}

function getSectorContext(sector: string | null): string {
  switch (sector) {
    case "it_services":
      return "IT services / managed service provider. Suggest connectivity, infrastructure, and quiet reliability through abstract geometric or networked forms. Calm precision, not chaos.";
    case "commercial_cleaning":
      return "Commercial cleaning / facilities management. Suggest clarity, freshness, and order through clean abstract textures and soft luminous spaces.";
    case "website_marketing":
      return "Website and digital marketing. Suggest momentum, energy, and creativity through dynamic gradient flows and rhythmic geometric patterns.";
    case "pest_control":
      return "Pest control. Suggest protection, careful diligence, and natural balance through subtle organic abstract forms.";
    default:
      return "Premium professional services. Convey assurance through geometric abstraction and atmospheric depth.";
  }
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
