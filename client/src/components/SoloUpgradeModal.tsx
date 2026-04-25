/**
 * SoloUpgradeModal.tsx
 *
 * Phase 4A — Delivery 5 (initial), Delivery 8 (sector-aware reframing).
 *
 * Shown when a Solo or Trial tier user clicks "Generate PDF" on the
 * quote workspace. Presents the proposal showcase thumbnails as a
 * preview of what upgrading to Pro unlocks.
 *
 * Delivery 8 — these are reframed as DESIGN templates rather than
 * SECTOR templates. The user's sector still determines which template
 * is their default (Modern for IT, Operational for Cleaning, Bold for
 * Marketing) and that card surfaces a "Default for [sector]" pip;
 * the other two cards drop their sector label entirely and are
 * presented as design alternatives by their personality name. This
 * removes the confusion of, say, an IT MSP being shown a
 * "COMMERCIAL CLEANING" template card. Pest Control and unmapped
 * sectors fall through with no default pip and the existing order.
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
import { useAuth } from "@/_core/hooks/useAuth";
import {
  PROPOSAL_SHOWCASES,
  getDefaultShowcaseForSector,
  getOrderedShowcasesForSector,
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

  // Read the user's sector to pick which card is "yours" and reorder
  // the strip. Loosely typed because defaultTradeSector lives outside
  // the strict User shape — same pattern as Dashboard / Catalog.
  const { user } = useAuth();
  const userSector =
    ((user as unknown as { defaultTradeSector?: string | null })
      ?.defaultTradeSector as string | null | undefined) ?? null;
  const defaultShowcaseKey = getDefaultShowcaseForSector(userSector);
  const orderedShowcases = getOrderedShowcasesForSector(userSector);
  // Sector label for the pip — pulled from the showcase variant rather
  // than re-deriving from TRADE_SECTOR_OPTIONS so the pip text stays
  // consistent with what the rest of the showcase system says.
  const defaultSectorLabel = defaultShowcaseKey
    ? PROPOSAL_SHOWCASES[defaultShowcaseKey].sectorLabel
    : null;

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
            Pro unlocks personality-led proposal templates with your logo,
            your colours, and your tone — baked in automatically from the
            brand evidence you've already set up.
          </p>
        </div>

        {/* Showcase thumbnails — Delivery 8: ordered so the user's
            default sits first, with a "Default for [sector]" pip on
            that card only. Other cards lose their sector label and
            present as design alternatives by personality name. */}
        <div
          className="px-8 py-6"
          style={{ backgroundColor: brand.slate }}
        >
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            {orderedShowcases.map((sectorKey) => {
              const variant = PROPOSAL_SHOWCASES[sectorKey];
              const isDefault = sectorKey === defaultShowcaseKey;
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
                      alt={`${variant.personality} proposal template`}
                      className="w-full h-full object-cover object-top"
                      loading="eager"
                      draggable={false}
                    />
                  </div>
                  <figcaption className="mt-2.5">
                    {/* Pip slot — only the user's default card surfaces
                        a "Default for [sector]" pip. The other cards
                        drop the sector label entirely so an IT user
                        isn't shown a card labelled "COMMERCIAL CLEANING".
                        Slight asymmetry in figcaption height is by
                        design and reinforces "this one's yours". */}
                    {isDefault && defaultSectorLabel && (
                      <div
                        className="inline-block px-1.5 py-0.5 rounded text-[10px] font-semibold tracking-wide uppercase"
                        style={{
                          backgroundColor: brand.tealBg,
                          color: brand.teal,
                          border: `1px solid ${brand.tealBorder}`,
                        }}
                      >
                        Default for {defaultSectorLabel}
                      </div>
                    )}
                    <div
                      className="text-xs mt-1 leading-snug font-medium"
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
