/**
 * Cover Image Generation Pipeline — Phase 4A Delivery 16.
 *
 * Generates a unique abstract cover hero image per organisation using
 * Gemini 2.5 Flash Image ("Nano Banana") in MULTIMODAL mode, stores
 * the PNG in R2, and writes the proxy URL back to organizations.cover_image_url
 * for the branded proposal renderer to consume.
 *
 * D16 change vs D15:
 *   D15 asked Gemini to invent an abstract geometric composition from a
 *   text prompt alone. Three sessions of prompt iteration confirmed
 *   that's a poor fit for the model — it produced clip-art circles,
 *   ignored the left-half-quiet rule, and rendered "scattered dots" as
 *   rigid grids.
 *
 *   D16 plays to Gemini's actual strength: image-to-image / multimodal
 *   compositing. We pass the company's logo as an inline image part
 *   alongside the text prompt, instructing the model to extend the
 *   logo's visual language (stroke weights, geometric character,
 *   design sensibility) into a full-canvas decorative graphic. The
 *   logo gives Gemini a concrete reference to anchor against rather
 *   than a list of adjectives to interpret.
 *
 *   When no logo is present (rare — most paid orgs upload one), the
 *   call falls back to text-only mode with a slightly different prompt
 *   that no longer references "the provided logo". Generation still
 *   proceeds — we never block a paid org's cover on logo absence.
 *
 *   Website screenshot was NOT added to the multimodal payload despite
 *   it being suggested. Reason: SiteGround / Cloudflare-fronted /
 *   Wix / Squarespace all block server-side fetches from Render's
 *   datacentre IPs. Puppeteer running on Render hits the same wall.
 *   The screenshot path requires residential-proxy infra and is its
 *   own future delivery. Logo we have for 100% of paid orgs; logo is
 *   what we use.
 *
 * Design rules — unchanged from earlier deliveries:
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
 * Cost: ~$0.04 per generation via Google AI Studio. Multimodal input
 * adds negligible token cost (a logo is ~1k input tokens). One-off
 * per org per evidence change.
 */

import sharp from "sharp";
import { getOrganizationById, updateOrganization } from "../db";
import { uploadToR2, getFileBuffer, isR2Configured } from "../r2Storage";

// ── Tuning ──────────────────────────────────────────────────────────────
const COOLDOWN_MS = 24 * 60 * 60 * 1000; // 24 hours
const GEMINI_TIMEOUT_MS = 60_000;
const GEMINI_MODEL = "gemini-2.5-flash-image";
const GEMINI_ENDPOINT = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`;
// 3:4 portrait — closest standard ratio to A4 (which is 1:1.414 ≈ 5:7).
// The cover renderer's flex layout means exact ratio isn't critical —
// background-size: cover handles overflow either way.
const ASPECT_RATIO = "3:4";
// Logo reference image — resize cap. Keeps inline payload reasonable
// (~1MB) and gives Gemini a clean reference. Smaller logos are NOT
// enlarged — withoutEnlargement preserves crispness for icon-sized PNGs.
const LOGO_MAX_DIMENSION = 1024;

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

  // ── Fetch & prepare logo reference (best-effort) ─────────────────────
  // Logo fetch failure is non-fatal — we fall back to text-only mode.
  // The renderer's downstream fallback chain (extracted colour →
  // logo-pixel colour → template default) handles aesthetic survival
  // either way; we just lose the multimodal style anchor for this run.
  let logoReference: { buffer: Buffer; mimeType: string } | null = null;
  if (logo) {
    logoReference = await fetchAndPrepareLogo(logo);
    if (!logoReference) {
      console.warn(
        `[coverImageGeneration] org ${orgId} logo fetch/prepare failed — proceeding text-only`,
      );
    }
  }

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
    hasLogoReference: !!logoReference,
  });

  // ── Call Gemini ──────────────────────────────────────────────────────
  let imageBuffer: Buffer;
  try {
    imageBuffer = await callGemini(prompt, logoReference);
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
    `[coverImageGeneration] org ${orgId} ready — url=${url}, multimodal=${!!logoReference}, prompt-length=${prompt.length}`,
  );
}

// ─────────────────────────────────────────────────────────────────────────
// Logo retrieval & preparation.
//
// The org's companyLogo column holds a /api/file/<key> proxy URL. We
// strip the prefix, fetch the bytes directly from R2 (avoiding the
// auth-cookie round-trip the proxy demands), detect the MIME from
// magic bytes, then normalise to PNG capped at 1024px on the longest
// edge via sharp. Returns null on any failure — caller falls back to
// text-only mode.
// ─────────────────────────────────────────────────────────────────────────
async function fetchAndPrepareLogo(
  companyLogo: string,
): Promise<{ buffer: Buffer; mimeType: string } | null> {
  if (!companyLogo.startsWith("/api/file/")) {
    // Not a R2 proxy URL — could be a legacy direct URL or external
    // CDN. Skip rather than try to fetch externally; we don't want
    // cross-origin fetches from this code path.
    return null;
  }

  const key = companyLogo.slice("/api/file/".length);

  let raw: Buffer;
  try {
    raw = await getFileBuffer(key);
  } catch (err: any) {
    console.warn(`[coverImageGeneration] R2 logo fetch failed for key ${key}:`, err?.message);
    return null;
  }

  if (!raw || raw.length === 0) return null;

  // Validate MIME via magic bytes — we don't trust filename hints,
  // and we won't pass a buffer of unknown format to Gemini.
  const detectedMime = detectImageMime(raw);
  if (!detectedMime) {
    console.warn(`[coverImageGeneration] Logo bytes have unrecognised image format`);
    return null;
  }

  // Normalise to PNG — Gemini accepts PNG/JPEG/WebP, but PNG preserves
  // logo crispness (often a transparent vector-style mark) and avoids
  // JPEG artefacts. Cap longest edge to keep payload < ~1MB.
  try {
    const processed = await sharp(raw)
      .resize(LOGO_MAX_DIMENSION, LOGO_MAX_DIMENSION, {
        fit: "inside",
        withoutEnlargement: true,
      })
      .png()
      .toBuffer();
    return { buffer: processed, mimeType: "image/png" };
  } catch (err: any) {
    console.warn(`[coverImageGeneration] Sharp processing failed:`, err?.message);
    return null;
  }
}

function detectImageMime(buf: Buffer): string | null {
  if (buf.length < 12) return null;
  // PNG: 89 50 4E 47
  if (buf[0] === 0x89 && buf[1] === 0x50 && buf[2] === 0x4E && buf[3] === 0x47) {
    return "image/png";
  }
  // JPEG: FF D8 FF
  if (buf[0] === 0xFF && buf[1] === 0xD8 && buf[2] === 0xFF) {
    return "image/jpeg";
  }
  // WebP: 'RIFF' (52 49 46 46) at 0..3 and 'WEBP' (57 45 42 50) at 8..11
  if (
    buf[0] === 0x52 && buf[1] === 0x49 && buf[2] === 0x46 && buf[3] === 0x46
    && buf[8] === 0x57 && buf[9] === 0x45 && buf[10] === 0x42 && buf[11] === 0x50
  ) {
    return "image/webp";
  }
  return null;
}

// ─────────────────────────────────────────────────────────────────────────
// Prompt construction — D16.
//
// When a logo reference is provided, the prompt instructs Gemini to
// extend the logo's visual language. The logo's stroke weights,
// geometric register, corner radii, and design sensibility become the
// vocabulary for the cover composition. The hex codes are still passed
// in the text — Gemini's adherence to text-prompt colours is
// inconsistent, but with the logo as visual reference the model
// typically lands on brand-correct colours regardless.
//
// Without a logo reference, the prompt drops the "extend the logo's
// visual language" instruction and asks for a clean abstract
// composition guided by the colour palette only. Lower expected
// quality but generation still proceeds.
//
// Composition discipline (left-half-quiet, sparse shape count,
// upper-right-and-lower-right anchoring) is preserved from D15 — those
// rules were sound; what was missing was a concrete style anchor.
// ─────────────────────────────────────────────────────────────────────────
function buildPrompt(input: {
  companyName: string;
  sector: string | null;
  primary: string | null;
  secondary: string | null;
  tone: string | null;
  fontFeel: string | null;
  hasLogoReference: boolean;
}): string {
  const primary = input.primary || "#1e293b";
  const secondary = input.secondary
    || `a noticeably lighter tonal variation of ${primary} (same hue family, lightness +25–40%)`;

  const styleAnchor = input.hasLogoReference
    ? `STYLE REFERENCE — IMPORTANT:
You are provided with the company's logo as a visual style reference. Your composition must extend the logo's visual language: match its stroke weights, corner radii, geometric character, level of detail, and overall design sensibility. The result should look as if the same designer who made the logo also made this cover graphic — clearly from the same brand family.

DO NOT redraw, reproduce, or include the logo itself anywhere on the canvas. Use it only as a stylistic anchor for the abstract decoration.`
    : `STYLE DIRECTION:
A confident, restrained abstract decoration in the manner of a premium B2B SaaS brand identity manual. The composition should feel intentional and considered, not generated.`;

  return `Generate an elegant abstract cover graphic for a corporate proposal.

${styleAnchor}

REQUIREMENTS:
- Aspect ratio: 3:4 portrait
- Style: flat vector graphic. Hard clean edges, solid fills. NO photography, NO 3D rendering, NO atmospheric haze, NO gradients, NO shadows, NO metallic effects, NO soft glows. The result must read as "graphic design", not "stock illustration".
- Sophistication target: Linear, Notion, Pitch, Stripe — premium B2B SaaS restraint.

COLOUR PALETTE — STRICTLY TWO TONES, USE EXACTLY THESE VALUES:
- Background base: ${primary} (the dominant brand colour, fills the majority of the canvas)
- Shape fills: ${secondary} (the secondary tone, used for the geometric elements)
- ABSOLUTELY NO other colours. No white, no black, no muddy greys, no contrasting accents, no rainbow palettes. Two tones only.

COMPOSITION RULES — non-negotiable:
- Total shapes: between 4 and 8. Sparse and intentional, never crowded.
- The LEFT HALF of the canvas must be relatively empty. This zone is reserved for title typography. A single subtle background element may sit there but absolutely no detailed clusters or focal shapes.
- Visual weight concentrated in the UPPER-RIGHT and LOWER-RIGHT quadrants.
- Shapes can overlap subtly but each must remain readable as its own element.

SHAPE VOCABULARY (mix as guided by the style reference):
- Geometric circles, arcs, and partial circles of varying sizes
- Sweeping curved lines of consistent stroke weight (use sparingly — at most one)
- Soft organic forms if the reference style trends organic
- Small accent dots in subtle clusters (no rigid grids)

DO NOT:
- Reproduce, redraw, trace, or include the logo itself
- Include any text, letters, numbers, words, or symbols
- Include people, faces, hands, body parts, or any literal objects
- Include literal industry depictions (no servers, no buildings, no tools, no anything literal)
- Use any third colour beyond the two specified above
- Use atmospheric effects, gradients, shadows, 3D rendering, or photographic textures
- Place focal shapes in the lower-left or centre-left — those zones are reserved for text overlay
- Crowd the canvas — restraint is the brief`;
}

// ─────────────────────────────────────────────────────────────────────────
// Gemini multimodal REST call. Uses the Google AI Studio endpoint with
// x-goog-api-key auth — no SDK package needed (avoids pnpm-lock.yaml
// regeneration churn).
//
// When a logoReference is supplied, the request payload includes both
// an inlineData part (the logo bytes, base64-encoded) and a text part
// (the prompt). Gemini reads the image as visual context and the text
// as instructions. Image-first ordering signals to the model that the
// logo is the reference being acted upon.
//
// Returns a Buffer of the generated PNG.
// ─────────────────────────────────────────────────────────────────────────
async function callGemini(
  prompt: string,
  logoReference: { buffer: Buffer; mimeType: string } | null,
): Promise<Buffer> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("GEMINI_API_KEY is not set.");

  const parts: Array<
    { text: string } | { inlineData: { mimeType: string; data: string } }
  > = [];

  // Image first, then instructions — clearer reference for the model.
  if (logoReference) {
    parts.push({
      inlineData: {
        mimeType: logoReference.mimeType,
        data: logoReference.buffer.toString("base64"),
      },
    });
  }
  parts.push({ text: prompt });

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
          parts,
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
  const responseParts = candidate?.content?.parts as Array<{ inlineData?: { mimeType?: string; data?: string }; text?: string }> | undefined;
  if (!responseParts) throw new Error("Gemini response candidate had no content parts.");

  const imagePart = responseParts.find(p => p.inlineData?.data);
  if (!imagePart?.inlineData?.data) {
    // Surface the text response if the model returned text instead of an
    // image — usually means the prompt was filtered or refused.
    const textPart = responseParts.find(p => typeof p.text === "string")?.text;
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
