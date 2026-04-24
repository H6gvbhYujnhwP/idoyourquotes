/**
 * SoloUpgradeModal.tsx
 *
 * Phase 4A — Delivery 5.
 *
 * Shown when a Solo or Trial tier user clicks "Generate PDF" on the
 * quote workspace. Presents the three proposal showcase thumbnails
 * (IT-Modern, Cleaning-Operational, Marketing-Bold) as a preview of
 * what upgrading to Pro unlocks.
 *
 * Actions:
 *   - Primary: "Upgrade to Pro" → routes to /pricing
 *   - Secondary: "Download basic PDF" → closes the modal and falls
 *     through to the existing review-before-PDF flow. Solo users
 *     keep full access to the basic PDF output — this is a soft sell,
 *     not a hard gate.
 *   - Close [×] / overlay click / Esc → dismiss, no action
 *
 * Client-side only. No server interaction. No new dependencies.
 */
import { useEffect } from "react";
import { X, ArrowRight } from "lucide-react";
import { Button } from "@/components/ui/button";
import { brand } from "@/lib/brandTheme";
import {
  PROPOSAL_SHOWCASES,
  PROPOSAL_SHOWCASE_ORDER,
} from "@/lib/proposalShowcaseAssets";

interface SoloUpgradeModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×] button). */
  onDismiss: () => void;
  /** Primary CTA — route to billing / pricing. */
  onUpgrade: () => void;
  /** Secondary CTA — fall through to the basic PDF flow. */
  onContinueWithBasic: () => void;
}

export default function SoloUpgradeModal({
  open,
  onDismiss,
  onUpgrade,
  onContinueWithBasic,
}: SoloUpgradeModalProps) {
  // Esc key closes the modal. Matches the overlay-click-to-close behaviour
  // below. Only bound while open to avoid leaking listeners.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape") onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onDismiss]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={onDismiss}
      role="dialog"
      aria-modal="true"
      aria-labelledby="solo-upgrade-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[820px] max-w-[94vw] my-6 relative"
        style={{ border: `1px solid ${brand.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close button */}
        <button
          type="button"
          onClick={onDismiss}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-slate-100"
          style={{ color: brand.navyMuted }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Header */}
        <div className="px-8 pt-8 pb-5">
          <div
            className="inline-block px-2.5 py-1 rounded-md text-[11px] font-semibold tracking-wide uppercase mb-3"
            style={{
              backgroundColor: brand.tealBg,
              color: brand.teal,
              border: `1px solid ${brand.tealBorder}`,
            }}
          >
            Pro feature
          </div>
          <h2
            id="solo-upgrade-title"
            className="text-xl font-bold leading-snug"
            style={{ color: brand.navy }}
          >
            Send branded, design-led proposals — not basic PDFs
          </h2>
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            Pro unlocks personality-led proposal templates built for your
            sector. Your logo, your brand colours, your website tone — baked
            in automatically from the brand evidence you've already set up.
          </p>
        </div>

        {/* Showcase thumbnails */}
        <div
          className="px-8 py-6"
          style={{ backgroundColor: brand.slate }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {PROPOSAL_SHOWCASE_ORDER.map((sectorKey) => {
              const variant = PROPOSAL_SHOWCASES[sectorKey];
              return (
                <figure
                  key={variant.key}
                  className="flex flex-col"
                >
                  <div
                    className="rounded-lg overflow-hidden bg-white"
                    style={{
                      border: `1px solid ${brand.border}`,
                      boxShadow: brand.shadow,
                      aspectRatio: "4 / 5",
                    }}
                  >
                    <img
                      src={variant.assets.thumb}
                      alt={`${variant.sectorLabel} proposal — ${variant.personality} template`}
                      className="w-full h-full object-cover object-top"
                      loading="eager"
                      draggable={false}
                    />
                  </div>
                  <figcaption className="mt-2.5">
                    <div
                      className="text-[11px] font-semibold tracking-wide uppercase"
                      style={{ color: brand.navyMuted }}
                    >
                      {variant.sectorLabel}
                    </div>
                    <div
                      className="text-xs mt-0.5 leading-snug"
                      style={{ color: brand.navy }}
                    >
                      {variant.personality} template
                    </div>
                  </figcaption>
                </figure>
              );
            })}
          </div>
        </div>

        {/* Footer — actions */}
        <div className="px-8 py-5 flex flex-col-reverse sm:flex-row sm:items-center sm:justify-between gap-3">
          <button
            type="button"
            onClick={onContinueWithBasic}
            className="text-sm font-medium underline-offset-4 hover:underline text-left"
            style={{ color: brand.navyMuted }}
          >
            Download basic PDF instead
          </button>
          <Button
            onClick={onUpgrade}
            className="text-sm text-white px-5"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            Upgrade to Pro
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </div>
      </div>
    </div>
  );
}
