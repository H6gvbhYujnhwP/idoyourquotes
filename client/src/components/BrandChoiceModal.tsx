/**
 * BrandChoiceModal.tsx
 *
 * Phase 4A — Delivery 7. Brochure-upload UI removed in Delivery 13.
 * Phase 4A — Delivery 17 added the design-template picker (Modern /
 * Structured / Bold) above the existing branded vs template-defaults
 * choice.
 * Phase 4A — Delivery 22 (this delivery): the branded vs
 * template-defaults choice is removed. The template's built-in palette
 * was an escape hatch from the original D7 "what if the user has no
 * logo yet?" problem, but the inline-setup form has handled that case
 * since shipping. With the inline-setup safety net in place, the
 * "template defaults" card was just a way to skip applying your own
 * branding — which is never what a real user wants on a proposal
 * that goes to a client.
 *
 * The new layout:
 *
 *   1. Header — "How should it look?" + subtitle.
 *   2. Branding strip — slim, full-width, informational. Logo +
 *      Primary swatch + Secondary swatch + "Update in settings →"
 *      link. Two faces:
 *        - tokens-ready: shows what we'll apply (no choice to make)
 *        - tokens-missing: turns into the inline setup form
 *          (logo drag-drop + website URL) so the user can fix the
 *          missing evidence without leaving the modal
 *   3. Template gallery — 3 tiles using the existing showcase
 *      thumbnails (it-modern-thumb.webp etc.). Tap to pick. Replaces
 *      the D17 button-strip picker; the thumbnails make the choice
 *      visual rather than abstract.
 *   4. Footer CTA — "Generate proposal" (one button, full width).
 *
 * Both the parent contract (onGenerate(mode, template)) and the
 * server endpoint (generateBrandedProposal.brandMode) still accept
 * "branded" | "template" — only the client-side path is narrowed.
 * The mode emitted from this modal is always "branded".
 */

import { useEffect, useMemo, useState, useRef } from "react";
import { useLocation } from "wouter";
import {
  X,
  ArrowLeft,
  ArrowRight,
  Upload,
  Globe,
  Loader2,
  CheckCircle2,
  ExternalLink,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";
import {
  DESIGN_TEMPLATES,
  DESIGN_TEMPLATE_ORDER,
  resolveDesignTemplate,
  type DesignTemplate,
} from "@/lib/proposalShowcaseAssets";

// Kept for back-compat with the parent (QuoteWorkspace) and the server
// endpoint, both of which still accept both values. The modal only
// ever emits "branded" now.
export type BrandMode = "branded" | "template";

interface BrandChoiceModalProps {
  open: boolean;
  /** Close without action (overlay click, Esc, [×]). */
  onDismiss: () => void;
  /** Return to the format picker (← Back). */
  onBack: () => void;
  /**
   * Fired once the user has committed to a brand mode and any inline
   * setup has been saved. The parent runs the generation mutation.
   * Phase 4A Delivery 22 — `mode` is always "branded" in current UI,
   * but the parameter is preserved in the signature so the parent
   * doesn't need to change.
   */
  onGenerate: (mode: BrandMode, template: DesignTemplate) => void;
  /** True while the parent mutation is in flight. Disables the CTA. */
  isGenerating?: boolean;
}

// ── Hex helpers — only used for the swatch preview. ────────────────

function isValidHex(v: unknown): boolean {
  return typeof v === "string" && /^#([0-9a-fA-F]{3}|[0-9a-fA-F]{6})$/.test(v);
}

// ── Derived brand-ready state ──────────────────────────────────────

interface BrandTokensSnapshot {
  logoUrl: string | null;
  primary: string | null;
  secondary: string | null;
  extractionStatus: string;
  /** True when we have enough to render a credible "branded" output. */
  ready: boolean;
  /** True when extraction is still running — UI stays silent but flags it. */
  extracting: boolean;
}

function readBrandTokens(org: any): BrandTokensSnapshot {
  const logoUrl = (org?.companyLogo as string | null) || null;
  const extractedP = isValidHex(org?.brandExtractedPrimaryColor)
    ? org.brandExtractedPrimaryColor
    : null;
  const extractedS = isValidHex(org?.brandExtractedSecondaryColor)
    ? org.brandExtractedSecondaryColor
    : null;
  const logoP = isValidHex(org?.brandPrimaryColor) ? org.brandPrimaryColor : null;
  const logoS = isValidHex(org?.brandSecondaryColor) ? org.brandSecondaryColor : null;
  const primary = extractedP || logoP;
  const secondary = extractedS || logoS;
  const extractionStatus = (org?.brandExtractionStatus as string) || "idle";
  // "Ready" means: has a logo AND at least a primary colour. Secondary is
  // a nice-to-have — the renderer tolerates it missing.
  const ready = !!(logoUrl && primary);
  const extracting = extractionStatus === "pending";
  return { logoUrl, primary, secondary, extractionStatus, ready, extracting };
}

// ── Modal ──────────────────────────────────────────────────────────

export default function BrandChoiceModal({
  open,
  onDismiss,
  onBack,
  onGenerate,
  isGenerating = false,
}: BrandChoiceModalProps) {
  // Read current org state — used to decide which face of the branding
  // strip to show (info vs inline-setup).
  const { data: orgProfile } = trpc.auth.orgProfile.useQuery(undefined, {
    enabled: open,
  });
  const utils = trpc.useUtils();
  const [, setLocation] = useLocation();

  const tokens = useMemo(() => readBrandTokens(orgProfile), [orgProfile]);

  // Phase 4A Delivery 17 — local design-template state, seeded from
  // the org's persisted default. Lets the user override for this one
  // quote without changing their org default. The selection is passed
  // up to the parent on generate; persistence to the quote happens
  // server-side inside generateBrandedProposal.
  const orgDefaultTemplate: DesignTemplate = useMemo(
    () => resolveDesignTemplate((orgProfile as any)?.proposalTemplate),
    [orgProfile],
  );
  const [selectedTemplate, setSelectedTemplate] = useState<DesignTemplate>("modern");
  const [templateSeeded, setTemplateSeeded] = useState(false);
  useEffect(() => {
    if (!templateSeeded && orgProfile) {
      setSelectedTemplate(orgDefaultTemplate);
      setTemplateSeeded(true);
    }
  }, [orgProfile, orgDefaultTemplate, templateSeeded]);
  // Reset on close so re-opening for a different quote re-reads the
  // current org default (handles the case where the user changed it
  // in Settings between modal opens).
  useEffect(() => {
    if (!open) setTemplateSeeded(false);
  }, [open]);

  // ── Inline setup state ─────────────────────────────────────────

  const [websiteUrl, setWebsiteUrl] = useState("");
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [isDragging, setIsDragging] = useState(false);

  // Seed the website field from the org whenever it loads / refreshes —
  // but don't clobber user edits in flight.
  const [websiteSeeded, setWebsiteSeeded] = useState(false);
  useEffect(() => {
    if (!websiteSeeded && orgProfile) {
      setWebsiteUrl(((orgProfile as any).companyWebsite as string) || "");
      setWebsiteSeeded(true);
    }
  }, [orgProfile, websiteSeeded]);

  // Reset per-open transient state.
  useEffect(() => {
    if (!open) {
      setWebsiteSeeded(false);
      setIsDragging(false);
    }
  }, [open]);

  // ── Mutations ──────────────────────────────────────────────────

  const uploadLogo = trpc.auth.uploadLogo.useMutation({
    onSuccess: () => {
      utils.auth.orgProfile.invalidate();
      toast.success("Logo uploaded");
    },
    onError: (err) => {
      toast.error(err.message || "Failed to upload logo");
    },
  });

  const updateBrandSettings = trpc.auth.updateBrandSettings.useMutation({
    onSuccess: () => {
      utils.auth.orgProfile.invalidate();
    },
    onError: (err) => {
      toast.error(err.message || "Failed to save brand settings");
    },
  });

  // Esc closes.
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !isGenerating) onDismiss();
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [open, onDismiss, isGenerating]);

  if (!open) return null;

  // ── Handlers ───────────────────────────────────────────────────

  const handleLogoFile = (file: File) => {
    const allowed = ["image/jpeg", "image/png", "image/gif", "image/webp"];
    if (!allowed.includes(file.type)) {
      toast.error("Logo must be a JPG, PNG, GIF, or WebP");
      return;
    }
    if (file.size > 2 * 1024 * 1024) {
      toast.error("Logo must be less than 2MB");
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = (reader.result as string).split(",")[1];
      uploadLogo.mutate({
        filename: file.name,
        contentType: file.type,
        base64Data: base64,
      });
    };
    reader.readAsDataURL(file);
  };

  const handleLogoPicker = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (e.target) e.target.value = "";
    if (!file) return;
    handleLogoFile(file);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file) handleLogoFile(file);
  };

  const handleOpenBrandSettings = () => {
    // Close the modal first so the user lands on Settings without an
    // overlay still mounted on top. The parent's onDismiss handles
    // any state cleanup it needs to do.
    onDismiss();
    setLocation("/settings?tab=branding");
  };

  const handleGenerate = async () => {
    // When tokens are missing and the user has typed a website URL
    // they want to save first, fire the save in the background — same
    // logic as the pre-D22 inline-setup card. The renderer doesn't
    // need the website for THIS render but subsequent renders benefit.
    if (!tokens.ready) {
      const currentWebsite = ((orgProfile as any)?.companyWebsite as string) || "";
      if (websiteUrl && websiteUrl !== currentWebsite) {
        try {
          await updateBrandSettings.mutateAsync({ companyWebsite: websiteUrl });
        } catch {
          // Error toast already fired in onError — but we continue to
          // generation anyway. The website is supplementary evidence;
          // a failed save shouldn't block the user from getting their
          // doc.
        }
      }
    }
    onGenerate("branded", selectedTemplate);
  };

  // ── Derived flags ──────────────────────────────────────────────

  const settingsBusy = uploadLogo.isPending || updateBrandSettings.isPending;
  // CTA is disabled while generating, while saving inline-setup
  // pieces, and when the inline-setup branch is showing but no logo
  // has been uploaded yet (you can't generate a "branded" output
  // without at least a logo).
  const ctaDisabled =
    isGenerating
    || settingsBusy
    || (!tokens.ready && !tokens.logoUrl);

  // Selected design template's `available` flag — defensive guard
  // against the (currently impossible, but possible-in-future) case
  // where the seeded org-default template doesn't have a built
  // renderer.
  const selectedTemplateAvailable =
    DESIGN_TEMPLATES[selectedTemplate]?.available !== false;
  const ctaFinalDisabled = ctaDisabled || !selectedTemplateAvailable;

  // ── Branding strip ─────────────────────────────────────────────

  const brandingStripReady = (
    <div
      className="rounded-xl px-4 py-3 flex items-center gap-4 flex-wrap"
      style={{
        backgroundColor: brand.slate,
        border: `1px solid ${brand.border}`,
      }}
    >
      <span
        className="text-[10px] font-bold uppercase tracking-wider"
        style={{ color: brand.navyMuted }}
      >
        Your branding
      </span>

      {/* Logo */}
      <div
        className="w-12 h-9 rounded bg-white flex items-center justify-center overflow-hidden flex-shrink-0"
        style={{ border: `1px solid ${brand.border}` }}
      >
        {tokens.logoUrl ? (
          <img
            src={tokens.logoUrl}
            alt="Your logo"
            className="max-w-full max-h-full object-contain"
          />
        ) : (
          <ImageFallback />
        )}
      </div>

      {/* Swatches */}
      {tokens.primary && (
        <SwatchInline hex={tokens.primary} label="Primary" />
      )}
      {tokens.secondary && (
        <SwatchInline hex={tokens.secondary} label="Secondary" />
      )}

      {tokens.extracting && (
        <span
          className="text-[10px] flex items-center gap-1"
          style={{ color: brand.navyMuted }}
        >
          <Loader2 className="w-2.5 h-2.5 animate-spin" />
          Refining…
        </span>
      )}

      <button
        type="button"
        onClick={handleOpenBrandSettings}
        disabled={isGenerating}
        className="ml-auto text-xs font-medium flex items-center gap-1 hover:underline underline-offset-2 disabled:opacity-50"
        style={{ color: brand.teal }}
      >
        Update in settings
        <ExternalLink className="w-3 h-3" />
      </button>
    </div>
  );

  const brandingStripSetup = (
    <div
      className="rounded-xl p-4"
      style={{
        backgroundColor: brand.slate,
        border: `1px solid ${brand.border}`,
      }}
    >
      <div className="flex items-baseline justify-between mb-3 flex-wrap gap-2">
        <div
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: brand.navyMuted }}
        >
          Set up your branding
        </div>
        <button
          type="button"
          onClick={handleOpenBrandSettings}
          disabled={isGenerating}
          className="text-xs font-medium flex items-center gap-1 hover:underline underline-offset-2 disabled:opacity-50"
          style={{ color: brand.teal }}
        >
          Open settings
          <ExternalLink className="w-3 h-3" />
        </button>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_1fr] gap-3">
        {/* Logo drop zone */}
        <div
          onDrop={handleDrop}
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onClick={() => fileInputRef.current?.click()}
          className="rounded-lg p-3 text-center cursor-pointer transition-colors"
          style={{
            backgroundColor: isDragging ? brand.tealBg : brand.white,
            border: `1.5px dashed ${
              isDragging ? brand.teal : brand.border
            }`,
          }}
        >
          {tokens.logoUrl ? (
            <div className="flex items-center gap-3 justify-center">
              <img
                src={tokens.logoUrl}
                alt="Logo"
                className="max-h-10 max-w-[90px] object-contain bg-white rounded p-1"
              />
              <div
                className="text-[11px] font-medium"
                style={{ color: brand.teal }}
              >
                Logo uploaded — click to replace
              </div>
            </div>
          ) : uploadLogo.isPending ? (
            <div
              className="flex items-center justify-center gap-2 py-2"
              style={{ color: brand.navyMuted }}
            >
              <Loader2 className="w-4 h-4 animate-spin" />
              <span className="text-xs">Uploading…</span>
            </div>
          ) : (
            <div className="py-2">
              <Upload
                className="w-5 h-5 mx-auto mb-1"
                style={{ color: brand.navyMuted }}
              />
              <div
                className="text-xs font-medium"
                style={{ color: brand.navy }}
              >
                Drop logo or click to browse
              </div>
              <div
                className="text-[10px] mt-0.5"
                style={{ color: brand.navyMuted }}
              >
                PNG, JPG, GIF, WebP. Max 2MB.
              </div>
            </div>
          )}
          <input
            ref={fileInputRef}
            type="file"
            accept="image/jpeg,image/png,image/gif,image/webp"
            onChange={handleLogoPicker}
            className="hidden"
          />
        </div>

        {/* Website input */}
        <div>
          <Label
            htmlFor="brand-website"
            className="text-[11px] font-semibold uppercase tracking-wide mb-1 flex items-center gap-1"
            style={{ color: brand.navyMuted }}
          >
            <Globe className="w-3 h-3" />
            Website URL
          </Label>
          <Input
            id="brand-website"
            type="url"
            value={websiteUrl}
            onChange={(e) => setWebsiteUrl(e.target.value)}
            placeholder="yourcompany.co.uk"
            className="text-sm h-9"
            disabled={isGenerating}
          />
          <p
            className="text-[10px] mt-1.5"
            style={{ color: brand.navyMuted }}
          >
            Optional — improves brand-colour extraction on later
            generations.
          </p>
        </div>
      </div>
    </div>
  );

  // ── Render ─────────────────────────────────────────────────────

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4 overflow-y-auto"
      style={{ backgroundColor: "rgba(15, 23, 42, 0.55)" }}
      onClick={() => {
        if (!isGenerating) onDismiss();
      }}
      role="dialog"
      aria-modal="true"
      aria-labelledby="brand-choice-title"
    >
      <div
        className="bg-white rounded-2xl shadow-2xl w-[860px] max-w-[94vw] my-6 relative"
        style={{ border: `1px solid ${brand.border}` }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Close */}
        <button
          type="button"
          onClick={onDismiss}
          disabled={isGenerating}
          aria-label="Close"
          className="absolute top-4 right-4 p-1.5 rounded-lg transition-colors hover:bg-slate-100 disabled:opacity-50"
          style={{ color: brand.navyMuted }}
        >
          <X className="w-4 h-4" />
        </button>

        {/* Back link */}
        <button
          type="button"
          onClick={onBack}
          disabled={isGenerating}
          className="absolute top-4 left-4 text-xs font-medium flex items-center gap-1 hover:underline underline-offset-2 disabled:opacity-50"
          style={{ color: brand.navyMuted }}
        >
          <ArrowLeft className="w-3.5 h-3.5" />
          Back
        </button>

        {/* Header */}
        <div className="px-8 pt-10 pb-4">
          <h2
            id="brand-choice-title"
            className="text-xl font-bold leading-snug"
            style={{ color: brand.navy }}
          >
            How should it look?
          </h2>
          <p
            className="text-sm mt-2 leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            Pick a design template — your branding will be applied
            automatically.
          </p>
        </div>

        {/* Branding strip — info or inline setup */}
        <div className="px-8 pb-4">
          {tokens.ready ? brandingStripReady : brandingStripSetup}
        </div>

        {/* Template gallery — picker + preview rolled into one */}
        <div className="px-8 pb-2">
          <div className="flex items-baseline justify-between mb-2 flex-wrap gap-2">
            <Label className="text-xs font-semibold" style={{ color: brand.navyMuted }}>
              Choose a design template
              {selectedTemplate !== orgDefaultTemplate && (
                <span className="font-normal ml-1.5 text-[10px]" style={{ color: brand.navyMuted }}>
                  (overriding your default for this quote)
                </span>
              )}
            </Label>
          </div>
          <div className="grid grid-cols-3 gap-3">
            {DESIGN_TEMPLATE_ORDER.map((key) => {
              const t = DESIGN_TEMPLATES[key];
              const isSelected = selectedTemplate === key;
              const disabled = !t.available || isGenerating;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => {
                    if (!t.available) return;
                    setSelectedTemplate(key as DesignTemplate);
                  }}
                  disabled={disabled}
                  className={`relative text-left rounded-xl overflow-hidden transition-all ${
                    !t.available
                      ? "opacity-50 cursor-not-allowed"
                      : "cursor-pointer"
                  }`}
                  style={{
                    border: `2px solid ${
                      isSelected ? brand.tealBorder : brand.border
                    }`,
                    backgroundColor: brand.white,
                    boxShadow: isSelected ? brand.shadow : "none",
                  }}
                  aria-pressed={isSelected}
                >
                  {/* Thumb */}
                  <div
                    className="aspect-[3/4] w-full overflow-hidden"
                    style={{ backgroundColor: brand.slate }}
                  >
                    <img
                      src={t.thumb}
                      alt={`${t.label} template preview`}
                      className="w-full h-full object-cover object-top"
                      loading="lazy"
                    />
                  </div>

                  {/* Label row */}
                  <div className="px-3 py-2 flex items-center justify-between gap-2">
                    <div
                      className="text-sm font-bold"
                      style={{
                        color: isSelected ? brand.teal : brand.navy,
                      }}
                    >
                      {t.label}
                    </div>
                    {!t.available ? (
                      <span className="text-[8px] font-bold uppercase tracking-wider px-1.5 py-0.5 rounded bg-amber-100 text-amber-800">
                        Soon
                      </span>
                    ) : isSelected ? (
                      <CheckCircle2
                        className="h-4 w-4 shrink-0"
                        style={{ color: brand.tealBorder }}
                      />
                    ) : null}
                  </div>
                </button>
              );
            })}
          </div>
          <p
            className="text-[11px] mt-2.5 leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            {DESIGN_TEMPLATES[selectedTemplate]?.description}
          </p>
        </div>

        {/* CTA */}
        <div className="px-8 pb-8 pt-4">
          <Button
            onClick={() => void handleGenerate()}
            disabled={ctaFinalDisabled}
            className="w-full text-sm text-white"
            style={{
              background: ctaFinalDisabled
                ? brand.navyMuted
                : "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            {isGenerating ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Generating…
              </>
            ) : !tokens.ready && !tokens.logoUrl ? (
              "Add a logo to continue"
            ) : (
              <>
                Generate proposal
                <ArrowRight className="w-4 h-4 ml-2" />
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
}

// ── Small helpers ──────────────────────────────────────────────────

function SwatchInline({ hex, label }: { hex: string; label: string }) {
  return (
    <div className="flex items-center gap-1.5">
      <div
        className="w-4 h-4 rounded"
        style={{
          backgroundColor: hex,
          border: `1px solid ${brand.border}`,
        }}
        title={hex}
      />
      <div className="text-[11px] leading-tight" style={{ color: brand.navy }}>
        <span style={{ color: brand.navyMuted }}>{label}</span>
        <span className="ml-1.5" style={{ fontWeight: 600 }}>{hex}</span>
      </div>
    </div>
  );
}

function ImageFallback() {
  return (
    <div
      className="text-[8px] font-bold tracking-wide"
      style={{ color: brand.navyMuted }}
    >
      LOGO
    </div>
  );
}
