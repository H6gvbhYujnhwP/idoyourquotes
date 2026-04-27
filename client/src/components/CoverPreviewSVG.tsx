/**
 * CoverPreviewSVG.tsx
 *
 * Phase 4A — Delivery 32. Inline SVG illustration of the new cover
 * layout (white 32mm strip on top, brand-primary or ink-black bleed
 * below) used as a live thumbnail in the export format picker modal.
 *
 * Why an inline SVG instead of a static .webp:
 *
 *   1. **Personalisation.** The thumbnail picks up the org's actual
 *      logo and brand-primary colour the moment they're available,
 *      so a user who's already uploaded their logo sees themselves
 *      reflected on the card. The static showcases (Manus / Meridian /
 *      Sparkshire / Pivot Digital) under client/public/proposal-showcase
 *      are still used by the marketing pages — they just no longer
 *      drive the in-app picker.
 *
 *   2. **Layout fidelity.** The SVG mirrors the same white-strip-on-top
 *      structure the actual templates render, so the user sees a
 *      faithful preview of the cover they'll get rather than a stylised
 *      illustration that drifts from production.
 *
 * Critical fallback rule (locked, Delivery 32):
 *   When the org has NOT uploaded a logo, the placeholder must read
 *   "Your Logo" — never the company name. A new user with their org
 *   name set but no logo uploaded should see a clear "upload your
 *   logo" signal, not a half-finished wordmark of their own name.
 *   This is a deliberate departure from how the actual PDF cover
 *   renders the wordmark fallback (where the company name IS used,
 *   because by the time a real PDF is generated the user is shipping
 *   it to a real client).
 *
 * Pure presentational. No tRPC, no hooks, no state. Org data is
 * resolved by the caller (ExportFormatPickerModal) and passed in as
 * plain props so this component stays composable and testable.
 */
import { useId } from "react";

export interface CoverPreviewSVGProps {
  /** Org logo URL — typically organizations.companyLogo. Null when not uploaded. */
  logoUrl: string | null;
  /** Org company name — used for the logo's alt text only. */
  companyName: string;
  /**
   * Brand-primary hex (`#rgb` or `#rrggbb`). Defaults to the
   * brand.navy token when missing or invalid, so the preview never
   * renders blank.
   */
  primaryColor: string | null | undefined;
  /**
   * Brand-secondary hex — used for the accent eyebrow text inside
   * the hero. Falls back to a soft sky blue that reads against any
   * dark primary.
   */
  secondaryColor?: string | null;
  /** Optional className passed to the outer <svg>. */
  className?: string;
}

const FALLBACK_PRIMARY = "#1a2b4a"; // brand.navy
const FALLBACK_SECONDARY = "#93c5fd"; // soft sky blue, readable on any dark primary

function isValidHex(v: unknown): v is string {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

export default function CoverPreviewSVG({
  logoUrl,
  companyName,
  primaryColor,
  secondaryColor,
  className,
}: CoverPreviewSVGProps) {
  // Stable clip-path id so multiple instances of the component on
  // the same page don't collide on `clip-path="url(#logoClip)"`.
  const clipId = useId().replace(/:/g, "");

  const primary = isValidHex(primaryColor) ? primaryColor : FALLBACK_PRIMARY;
  const secondary = isValidHex(secondaryColor)
    ? secondaryColor
    : FALLBACK_SECONDARY;

  // 4:3 viewBox keeps parity with the existing card thumbnail aspect
  // ratio (the card slot has `aspect-ratio: 4 / 3`) so the SVG fills
  // the slot edge-to-edge without letterboxing.
  //
  // Strip height is ~24% of the visible thumbnail (50px / 210px). In
  // production A4 (297mm tall) the strip is 32mm = ~10.8% of the page,
  // but the card crop only shows the top 158mm or so, so the strip
  // reads larger relative to the visible crop. Same proportion the
  // user actually sees when looking at the top of the cover.
  const STRIP_H = 50;

  const altText = companyName ? `${companyName} logo` : "Logo";

  return (
    <svg
      viewBox="0 0 280 210"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={`Proposal cover preview with ${
        logoUrl ? "your logo" : "logo placeholder"
      } and ${primary} brand colour`}
      className={className}
      style={{ display: "block", width: "100%", height: "100%" }}
    >
      {/* Page surface */}
      <rect x="0" y="0" width="280" height="210" fill="#ffffff" />

      {/* Coloured bleed below the white strip */}
      <rect
        x="0"
        y={STRIP_H}
        width="280"
        height={210 - STRIP_H}
        fill={primary}
      />

      {/* ── Logo (left) — real <image> or "Your Logo" placeholder ── */}
      {logoUrl ? (
        <>
          {/*
            Clip the logo to a vertical band so unusually tall logos
            don't blow past the strip; the height-cap keeps the logo
            inside the strip's content area regardless of its native
            aspect ratio.
          */}
          <defs>
            <clipPath id={`clip-${clipId}`}>
              <rect x="14" y="13" width="110" height="24" />
            </clipPath>
          </defs>
          <image
            href={logoUrl}
            x="14"
            y="13"
            width="110"
            height="24"
            preserveAspectRatio="xMinYMid meet"
            clipPath={`url(#clip-${clipId})`}
          >
            <title>{altText}</title>
          </image>
        </>
      ) : (
        <g>
          {/* Dashed-border placeholder so it reads as "logo will go here" */}
          <rect
            x="14"
            y="14"
            width="92"
            height="22"
            fill="none"
            stroke="#94a3b8"
            strokeWidth="0.6"
            strokeDasharray="2.5 2"
            rx="2"
          />
          <text
            x="60"
            y="29"
            fontFamily="Arial,Helvetica,sans-serif"
            fontSize="8"
            fontWeight="600"
            fill="#94a3b8"
            textAnchor="middle"
            letterSpacing="0.5"
          >
            Your Logo
          </text>
        </g>
      )}

      {/* ── Ref block (right) — generic placeholder lines, brand-primary ── */}
      <g
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="5.5"
        fill={primary}
        textAnchor="end"
      >
        <text x="266" y="17">
          Ref: Q-XXXXXXX
        </text>
        <text x="266" y="26">Date</text>
        <text x="266" y="35">Prepared for client</text>
        <text x="266" y="44" fontWeight="700" letterSpacing="0.6">
          CONFIDENTIAL
        </text>
      </g>

      {/* ── Hero — eyebrow + title placeholder bars ── */}
      <text
        x="14"
        y={STRIP_H + 22}
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="5.5"
        fontWeight="700"
        fill={secondary}
        letterSpacing="1.3"
      >
        SERVICE PROPOSAL
      </text>

      <g
        fontFamily="Arial,Helvetica,sans-serif"
        fontWeight="800"
        fill="#ffffff"
      >
        <text x="14" y={STRIP_H + 50} fontSize="14">
          Your proposal title
        </text>
        <text x="14" y={STRIP_H + 68} fontSize="14">
          shows here on the
        </text>
        <text x="14" y={STRIP_H + 86} fontSize="14">
          cover
        </text>
      </g>

      <g
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="6"
        fill="#ffffff"
        opacity="0.65"
      >
        <text x="14" y={STRIP_H + 108}>
          Scope of work, pricing, terms
        </text>
        <text x="14" y={STRIP_H + 117}>
          and acceptance in one document.
        </text>
      </g>

      <text
        x="14"
        y={STRIP_H + 138}
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="5"
        fontWeight="700"
        fill="#ffffff"
        opacity="0.55"
        letterSpacing="0.9"
      >
        PREPARED FOR
      </text>
      <text
        x="14"
        y={STRIP_H + 152}
        fontFamily="Arial,Helvetica,sans-serif"
        fontSize="11"
        fontWeight="700"
        fill="#ffffff"
      >
        Client name
      </text>
    </svg>
  );
}
