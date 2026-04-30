/**
 * BrandedProposalWorkspace.tsx
 *
 * Phase 4B Delivery C. New screen reached when a Pro / Team user picks
 * Tile 3 ("Branded with your artwork and company story") on the Generate
 * PDF picker — provided they already have a brochure uploaded. Tier
 * gating happens upstream in QuoteWorkspace + server-side on every
 * brandedProposal.* endpoint; this screen trusts that gate and focuses
 * on the workflow.
 *
 * Workflow on this screen:
 *   1. On mount, fire brandedProposal.generateDraft to get the 18
 *      chapter slots (mix of "embed brochure page" and "AI-generated
 *      chapter text"). Show a full-screen rolling-copy spinner while
 *      this 30-90s call runs.
 *   2. Render the workspace: top bar + chapter sidebar + chapter
 *      preview pane + footer strip showing the brochure metadata.
 *   3. Per-chapter inline editing for "generate" slots — toggle a
 *      textarea, edits live in client state.
 *   4. Per-chapter regenerate hits brandedProposal.regenerateChapter
 *      (5-10s) and replaces just that slot in client state.
 *   5. Render PDF blocks the screen with a rolling-copy spinner for
 *      30-60s, decodes the returned base64 to a Blob, triggers a
 *      browser download, and unblocks. The user stays on the workspace
 *      after — they can edit and re-render.
 *
 * State note: the slots and per-chapter edits are held in React state,
 * not persisted to the server. A page refresh will reset to the last
 * generateDraft output. Persistence is parked for a later delivery.
 *
 * Brochure-deleted edge case: if the user deletes their brochure in
 * another tab between landing on this screen and generateDraft running,
 * the server returns "No brochure uploaded" — we surface that with a
 * link to Settings → Company Brochure rather than a generic toast.
 *
 * Routing: registered at /branded-proposal/:quoteId in App.tsx, wrapped
 * in DashboardLayout the same way QuoteRouter is.
 */

import { useEffect, useMemo, useRef, useState } from "react";
import { useLocation, useParams } from "wouter";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Download,
  Edit3,
  ExternalLink,
  FileText,
  Image as ImageIcon,
  Info,
  Loader2,
  RefreshCw,
  Save,
  X,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";

// ─── Types ───────────────────────────────────────────────────────────
//
// Mirror of the server's ChapterSlot discriminated union. We don't
// import from the server because the client doesn't compile server
// modules — duplicating the shape locally is the existing cross-process
// pattern (see how QuoteWorkspace handles trpc result types).

type EmbedSlot = {
  slotIndex: number;
  slotName: string;
  source: "embed";
  brochurePageNumber: number;
  reason: string;
};

type GenerateSlot = {
  slotIndex: number;
  slotName: string;
  source: "generate";
  title: string;
  body: string;
};

type ChapterSlot = EmbedSlot | GenerateSlot;

// Slot 15 is the Pricing Summary chapter — flagged in the sidebar with
// an EDITABLE badge so the user can see at a glance which chapter
// carries the pricing narrative. The actual line-item totals on the
// quote come from the existing pricing engine and are unaffected by
// edits to this chapter's body.
const PRICING_SLOT_INDEX = 15;

// Rolling copy shown during the initial draft generation.
const DRAFT_PROGRESS_COPY = [
  "Reading the tender…",
  "Pulling facts from your brochure…",
  "Picking the pages we'll embed…",
  "Writing your chapters…",
  "Assembling the draft…",
  "Almost done…",
];

// Rolling copy shown during the final PDF render.
const RENDER_PROGRESS_COPY = [
  "Building your proposal…",
  "Embedding your brochure pages…",
  "Stitching everything together…",
  "Almost done…",
];

// ─── Helpers ─────────────────────────────────────────────────────────

function formatDate(d: string | Date | null | undefined): string {
  if (!d) return "";
  const dt = typeof d === "string" ? new Date(d) : d;
  return dt.toLocaleDateString("en-GB", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

function downloadBase64Pdf(base64: string, filename: string) {
  const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
  const blob = new Blob([bytes], { type: "application/pdf" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 0);
}

// Friendly description of which brochure tag is being embedded for a
// given slot — feeds the embed-card preview in the main pane.
function describeEmbedTag(slotName: string): string {
  const lower = slotName.toLowerCase();
  if (lower.includes("about")) return "About Us";
  if (lower.includes("different") || lower.includes("why")) return "USPs / Why Choose Us";
  if (lower.includes("track")) return "Track Record / Case Studies";
  if (lower.includes("personnel") || lower.includes("team")) return "Team / Key People";
  if (lower.includes("service")) return "Services";
  return "Brochure page";
}

// ─── Component ───────────────────────────────────────────────────────

export default function BrandedProposalWorkspace() {
  const params = useParams<{ quoteId: string }>();
  const quoteId = parseInt(params.quoteId || "0", 10);
  const [, setLocation] = useLocation();

  // ── Queries ──────────────────────────────────────────────────────
  // Quote — for the title in the top bar and the back-to-workspace
  // link. We don't need line items here; getFull's caching means a
  // round-trip to the regular workspace will already be warm from
  // earlier in the session in most cases.
  const { data: fullQuote, isLoading: quoteLoading } =
    trpc.quotes.getFull.useQuery(
      { id: quoteId },
      { enabled: quoteId > 0, retry: 1 },
    );
  const quote = (fullQuote as any)?.quote as
    | {
        id: number;
        reference?: string | null;
        clientName?: string | null;
        title?: string | null;
      }
    | undefined;

  // Brochure — for the footer strip + the brochure-missing edge case.
  const { data: brochureData, isLoading: brochureLoading } =
    trpc.brochure.get.useQuery(undefined, {
      refetchOnWindowFocus: false,
    });

  // ── Mutations ────────────────────────────────────────────────────
  const generateDraft = trpc.brandedProposal.generateDraft.useMutation();
  const regenerateChapter =
    trpc.brandedProposal.regenerateChapter.useMutation();
  const renderPdf = trpc.brandedProposal.renderPdf.useMutation();

  // ── Workspace state ──────────────────────────────────────────────
  const [slots, setSlots] = useState<ChapterSlot[] | null>(null);
  const [draftError, setDraftError] = useState<string | null>(null);
  const [draftErrorIsBrochure, setDraftErrorIsBrochure] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState<number>(1);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editBuffer, setEditBuffer] = useState<{ title: string; body: string }>(
    { title: "", body: "" },
  );
  const [regeneratingIndex, setRegeneratingIndex] = useState<number | null>(
    null,
  );
  const [isRendering, setIsRendering] = useState(false);
  const [renderRollingIdx, setRenderRollingIdx] = useState(0);
  const [draftRollingIdx, setDraftRollingIdx] = useState(0);
  // Phase 4B Delivery E.4 — per-render page orientation. Default
  // portrait — most proposals stay portrait by convention. Landscape
  // is the opt-in choice for suppliers whose brochure is landscape
  // and whose narrative pages should match.
  const [renderOrientation, setRenderOrientation] = useState<
    "portrait" | "landscape"
  >("portrait");

  // Mount-once flag — prevents React 18 strict-mode double-invocation
  // (and any unintended re-mount) from firing the expensive draft call
  // twice. We only auto-fire generateDraft when slots is null AND
  // we haven't already kicked off a request for this quote.
  const draftKickedOffRef = useRef(false);

  // ── Effects ──────────────────────────────────────────────────────

  // Fire the initial draft once we have a valid quoteId. The brochure
  // query result isn't strictly needed to start (the server has its
  // own brochure check), but we wait for it so we can surface the
  // brochure-deleted error path locally without a round-trip.
  useEffect(() => {
    if (quoteId <= 0) return;
    if (draftKickedOffRef.current) return;
    if (slots !== null) return;
    if (quoteLoading || brochureLoading) return;

    // If the brochure query came back null, we know we won't succeed —
    // skip the round trip and surface the missing-brochure state.
    if (!brochureData) {
      setDraftError(
        "No brochure on file — re-upload your brochure to use Branded Proposals.",
      );
      setDraftErrorIsBrochure(true);
      draftKickedOffRef.current = true;
      return;
    }

    draftKickedOffRef.current = true;

    (async () => {
      try {
        const result = await generateDraft.mutateAsync({ quoteId });
        const incoming = (result as { slots: ChapterSlot[] }).slots;
        setSlots(incoming);
        // Default selection — the cover (slot 1) is always present and
        // a useful first chapter to show.
        if (incoming.length > 0) setSelectedIndex(incoming[0].slotIndex);
      } catch (err: any) {
        const message = err?.message || "Couldn't generate the draft.";
        setDraftError(message);
        // Heuristic: if the server complained about the brochure
        // specifically, surface the Settings link rather than a generic
        // retry. This catches the race-with-delete edge case.
        if (/brochure/i.test(message)) {
          setDraftErrorIsBrochure(true);
        }
      }
    })();
    // We intentionally exclude generateDraft from deps — its identity
    // changes on every render, which would re-trigger the gate. The
    // ref + slots-null check is the real idempotency guard.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [quoteId, quoteLoading, brochureLoading, brochureData, slots]);

  // Cycle the rolling-copy index while waiting on the initial draft.
  useEffect(() => {
    if (slots !== null || draftError) return;
    if (!draftKickedOffRef.current) return;
    const id = setInterval(() => {
      setDraftRollingIdx((i) => (i + 1) % DRAFT_PROGRESS_COPY.length);
    }, 4000);
    return () => clearInterval(id);
  }, [slots, draftError]);

  // Cycle the rolling-copy index while rendering the final PDF.
  useEffect(() => {
    if (!isRendering) return;
    const id = setInterval(() => {
      setRenderRollingIdx((i) => (i + 1) % RENDER_PROGRESS_COPY.length);
    }, 4000);
    return () => clearInterval(id);
  }, [isRendering]);

  // Warn-on-leave — if the user has any chapter open in edit mode (a
  // draft they haven't committed yet), prompt before they navigate
  // away. Saved-but-not-rendered edits stay in the React state and
  // would also be lost on a refresh, but the explicit unsaved-edit
  // case is the one most likely to surprise.
  useEffect(() => {
    if (editingIndex === null) return;
    const handler = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      e.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [editingIndex]);

  // ── Derived ──────────────────────────────────────────────────────

  const selectedSlot = useMemo<ChapterSlot | null>(() => {
    if (!slots) return null;
    return slots.find((s) => s.slotIndex === selectedIndex) ?? slots[0] ?? null;
  }, [slots, selectedIndex]);

  // ── Handlers ─────────────────────────────────────────────────────

  function handlePickChapter(idx: number) {
    if (editingIndex !== null && editingIndex !== idx) {
      // The user has unsaved edits on a different chapter — confirm
      // before discarding. Not a hard block; just a friendly nudge.
      const ok = window.confirm(
        "You have unsaved edits on the current chapter. Discard them?",
      );
      if (!ok) return;
      setEditingIndex(null);
    }
    setSelectedIndex(idx);
  }

  function handleStartEdit(slot: GenerateSlot) {
    setEditingIndex(slot.slotIndex);
    setEditBuffer({ title: slot.title, body: slot.body });
  }

  function handleCancelEdit() {
    setEditingIndex(null);
    setEditBuffer({ title: "", body: "" });
  }

  function handleSaveEdit() {
    if (editingIndex === null || !slots) return;
    setSlots(
      slots.map((s) => {
        if (s.slotIndex !== editingIndex) return s;
        if (s.source !== "generate") return s;
        return {
          ...s,
          title: editBuffer.title,
          body: editBuffer.body,
        };
      }),
    );
    setEditingIndex(null);
    setEditBuffer({ title: "", body: "" });
    toast.success("Chapter saved");
  }

  async function handleRegenerate(slot: ChapterSlot) {
    if (slot.source !== "generate") return; // embed slots can't regen
    if (!slots) return;
    if (regeneratingIndex !== null) return; // serialise

    // If the user is mid-edit on this chapter, drop the buffer first
    // — re-running AI would clobber their edit anyway, and we don't
    // want to silently overwrite without confirmation.
    if (editingIndex === slot.slotIndex) {
      const ok = window.confirm(
        "Regenerating will replace your unsaved edits. Continue?",
      );
      if (!ok) return;
      setEditingIndex(null);
      setEditBuffer({ title: "", body: "" });
    }

    setRegeneratingIndex(slot.slotIndex);
    try {
      const result = await regenerateChapter.mutateAsync({
        quoteId,
        slotIndex: slot.slotIndex,
        currentSlots: slots,
      });
      const updated = (result as { slot: ChapterSlot }).slot;
      setSlots(slots.map((s) => (s.slotIndex === slot.slotIndex ? updated : s)));
      toast.success(`Regenerated "${slot.slotName}"`);
    } catch (err: any) {
      toast.error(err?.message || "Regenerate failed");
    } finally {
      setRegeneratingIndex(null);
    }
  }

  async function handleRenderPdf() {
    if (!slots) return;
    if (isRendering) return;
    if (editingIndex !== null) {
      const ok = window.confirm(
        "You have unsaved edits on a chapter. Render anyway and discard them?",
      );
      if (!ok) return;
      setEditingIndex(null);
      setEditBuffer({ title: "", body: "" });
    }
    setIsRendering(true);
    setRenderRollingIdx(0);
    try {
      const result = await renderPdf.mutateAsync({
        quoteId,
        slots,
        orientation: renderOrientation,
      });
      const { base64, filename } = result as {
        base64: string;
        filename: string;
      };
      downloadBase64Pdf(base64, filename);
      toast.success("Proposal downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Render failed");
    } finally {
      setIsRendering(false);
    }
  }

  function handleBackToQuote() {
    if (editingIndex !== null) {
      const ok = window.confirm(
        "You have unsaved edits on a chapter. Leave anyway?",
      );
      if (!ok) return;
    }
    setLocation(`/quotes/${quoteId}`);
  }

  // ── Render — error / loading states ──────────────────────────────

  if (quoteId <= 0) {
    return (
      <div className="flex items-center justify-center h-64 text-destructive">
        Invalid quote reference.
      </div>
    );
  }

  if (quoteLoading) {
    return (
      <div className="flex items-center justify-center h-64 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading quote…
      </div>
    );
  }

  if (!quote) {
    return (
      <div className="flex flex-col items-center justify-center h-64 gap-3">
        <p className="text-destructive">Quote not found.</p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="w-4 h-4 mr-1.5" />
          Back to dashboard
        </Button>
      </div>
    );
  }

  // Brochure-missing or generation-failed top-level error.
  if (draftError) {
    return (
      <div className="max-w-2xl mx-auto py-12 px-6">
        <div
          className="rounded-xl p-6"
          style={{
            border: `1px solid ${brand.border}`,
            backgroundColor: brand.white,
            boxShadow: brand.shadow,
          }}
        >
          <div className="flex items-start gap-3">
            <Info className="w-5 h-5 mt-0.5" style={{ color: brand.navyMuted }} />
            <div className="flex-1">
              <h2
                className="text-lg font-bold mb-1"
                style={{ color: brand.navy }}
              >
                Can't generate this proposal
              </h2>
              <p
                className="text-sm leading-relaxed mb-4"
                style={{ color: brand.navyMuted }}
              >
                {draftError}
              </p>
              <div className="flex flex-wrap gap-2">
                {draftErrorIsBrochure ? (
                  <Button
                    onClick={() => setLocation("/settings?tab=brochure")}
                  >
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    Go to Company Brochure
                  </Button>
                ) : (
                  <Button
                    onClick={() => {
                      // Reset and let the auto-fire effect take another swing.
                      setDraftError(null);
                      setDraftErrorIsBrochure(false);
                      draftKickedOffRef.current = false;
                    }}
                  >
                    <RefreshCw className="w-4 h-4 mr-1.5" />
                    Try again
                  </Button>
                )}
                <Button variant="outline" onClick={handleBackToQuote}>
                  <ArrowLeft className="w-4 h-4 mr-1.5" />
                  Back to quote
                </Button>
              </div>
            </div>
          </div>
        </div>
      </div>
    );
  }

  // Initial draft generating — full-screen spinner with rolling copy.
  if (slots === null) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[60vh] gap-3 px-6 text-center">
        <Loader2
          className="w-8 h-8 animate-spin"
          style={{ color: brand.teal }}
        />
        <p className="text-base font-semibold" style={{ color: brand.navy }}>
          {DRAFT_PROGRESS_COPY[draftRollingIdx]}
        </p>
        <p className="text-sm" style={{ color: brand.navyMuted }}>
          Building your branded proposal — usually 30–60 seconds. Don't
          close this tab.
        </p>
      </div>
    );
  }

  // ── Render — full workspace ──────────────────────────────────────

  const refLabel =
    quote.reference || (quote.id ? `Q-${quote.id}` : "Proposal");
  const headerTitle = quote.title || quote.clientName || "Untitled quote";

  return (
    <div className="relative">
      {/* Top bar */}
      <div
        className="flex items-center justify-between gap-4 px-4 sm:px-6 py-3 sticky top-0 z-10"
        style={{
          backgroundColor: brand.white,
          borderBottom: `1px solid ${brand.border}`,
        }}
      >
        <div className="flex items-center gap-3 min-w-0 flex-1">
          <button
            type="button"
            onClick={handleBackToQuote}
            className="p-1.5 rounded-md transition-colors hover:bg-slate-100 flex-shrink-0"
            style={{ color: brand.navyMuted }}
            aria-label="Back to quote workspace"
          >
            <ArrowLeft className="w-4 h-4" />
          </button>
          <div className="min-w-0">
            <div
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: brand.navyMuted }}
            >
              Branded Proposal · Draft
            </div>
            <div
              className="text-sm font-semibold truncate"
              style={{ color: brand.navy }}
            >
              {refLabel} · {headerTitle}
            </div>
          </div>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          <span
            className="hidden sm:inline-flex items-center gap-1 text-[11px] px-2 py-1 rounded"
            style={{
              backgroundColor: brand.tealBg,
              color: brand.teal,
              border: `1px solid ${brand.tealBorder}`,
            }}
          >
            <Info className="w-3 h-3" />
            Edits live in this session
          </span>
          {/* Phase 4B Delivery E.4 — per-render page orientation
              selector. Sits to the immediate left of the Render PDF
              button so the choice and the action read together. Most
              users never touch it (portrait default is fine for
              tender / contract documents). Landscape suits suppliers
              whose brochure is landscape and whose narrative pages
              should match. */}
          <label
            className="hidden md:flex items-center gap-1.5 text-xs"
          >
            <span className="text-muted-foreground">Layout</span>
            <select
              value={renderOrientation}
              onChange={(e) =>
                setRenderOrientation(
                  e.target.value as "portrait" | "landscape",
                )
              }
              disabled={isRendering}
              className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none focus:ring-1 focus:ring-ring disabled:opacity-50 disabled:cursor-not-allowed"
              style={{
                borderColor: brand.border,
              }}
            >
              <option value="portrait">Portrait</option>
              <option value="landscape">Landscape</option>
            </select>
          </label>
          <Button
            onClick={handleRenderPdf}
            disabled={isRendering}
            className="font-semibold"
            style={{
              backgroundColor: brand.teal,
              color: brand.white,
            }}
          >
            {isRendering ? (
              <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
            ) : (
              <Download className="w-4 h-4 mr-1.5" />
            )}
            Render PDF
            <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </div>
      </div>

      {/* Body — sidebar + main pane */}
      <div className="flex flex-col md:flex-row gap-4 p-4 sm:p-6">
        {/* Sidebar */}
        <aside
          className="w-full md:w-[220px] md:flex-shrink-0 rounded-xl"
          style={{
            backgroundColor: brand.white,
            border: `1px solid ${brand.border}`,
            boxShadow: brand.shadow,
          }}
        >
          <div className="p-3 border-b" style={{ borderColor: brand.border }}>
            <p
              className="text-[10px] font-bold tracking-widest uppercase"
              style={{ color: brand.navyMuted }}
            >
              Chapters
            </p>
          </div>
          <ul className="p-1 max-h-[70vh] md:max-h-[calc(100vh-200px)] overflow-y-auto">
            {slots.map((s) => {
              const isSelected = s.slotIndex === selectedIndex;
              const isPricing = s.slotIndex === PRICING_SLOT_INDEX;
              const isRegen = regeneratingIndex === s.slotIndex;
              return (
                <li key={s.slotIndex}>
                  <button
                    type="button"
                    onClick={() => handlePickChapter(s.slotIndex)}
                    className="w-full flex items-start gap-2 text-left px-2.5 py-2 rounded-md transition-colors"
                    style={{
                      backgroundColor: isSelected ? brand.tealBg : "transparent",
                      color: isSelected ? brand.teal : brand.navy,
                      border: `1px solid ${
                        isSelected ? brand.tealBorder : "transparent"
                      }`,
                    }}
                  >
                    <span
                      className="text-[11px] font-bold mt-0.5 flex-shrink-0 tabular-nums"
                      style={{
                        color: isSelected ? brand.teal : brand.navyMuted,
                      }}
                    >
                      {pad2(s.slotIndex)}
                    </span>
                    <span className="flex-1 min-w-0">
                      <span className="block text-[13px] font-medium leading-tight">
                        {s.slotName}
                      </span>
                      <span className="flex items-center gap-1 mt-1 flex-wrap">
                        {s.source === "embed" && (
                          <span
                            className="inline-flex items-center text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: brand.slate,
                              color: brand.navyMuted,
                            }}
                            title="This chapter is filled by a page from your brochure"
                          >
                            Brochure
                          </span>
                        )}
                        {isPricing && (
                          <span
                            className="inline-flex items-center text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "#dcfce7",
                              color: "#166534",
                            }}
                            title="Editable narrative — line-item totals come from your pricing engine"
                          >
                            Editable
                          </span>
                        )}
                        {isRegen && (
                          <Loader2
                            className="w-3 h-3 animate-spin"
                            style={{ color: brand.teal }}
                          />
                        )}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </aside>

        {/* Main pane */}
        <main className="flex-1 min-w-0">
          {selectedSlot && (
            <ChapterPane
              slot={selectedSlot}
              isPricing={selectedSlot.slotIndex === PRICING_SLOT_INDEX}
              isEditing={editingIndex === selectedSlot.slotIndex}
              isRegenerating={regeneratingIndex === selectedSlot.slotIndex}
              editBuffer={editBuffer}
              setEditBuffer={setEditBuffer}
              onStartEdit={handleStartEdit}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
              onRegenerate={handleRegenerate}
            />
          )}
        </main>
      </div>

      {/* Footer strip */}
      {brochureData && (
        <div
          className="px-4 sm:px-6 py-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs"
          style={{
            borderTop: `1px solid ${brand.border}`,
            color: brand.navyMuted,
            backgroundColor: brand.slate,
          }}
        >
          <FileText className="w-3.5 h-3.5 flex-shrink-0" />
          <span>
            Brochure: <strong style={{ color: brand.navy }}>{brochureData.filename}</strong>
            {brochureData.pageCount ? ` · ${brochureData.pageCount} pages` : ""}
            {brochureData.extractedAt
              ? ` · uploaded ${formatDate(brochureData.extractedAt)}`
              : ""}
          </span>
          <button
            type="button"
            onClick={() => setLocation("/settings?tab=brochure")}
            className="inline-flex items-center gap-1 font-semibold hover:underline"
            style={{ color: brand.teal }}
          >
            Manage brochure
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Render-PDF blocking overlay */}
      {isRendering && (
        <div
          className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-3 px-6 text-center"
          style={{ backgroundColor: "rgba(255,255,255,0.92)" }}
          role="alertdialog"
          aria-modal="true"
        >
          <Loader2
            className="w-9 h-9 animate-spin"
            style={{ color: brand.teal }}
          />
          <p className="text-base font-semibold" style={{ color: brand.navy }}>
            {RENDER_PROGRESS_COPY[renderRollingIdx]}
          </p>
          <p className="text-sm" style={{ color: brand.navyMuted }}>
            Usually 30–60 seconds. Don't close this tab.
          </p>
        </div>
      )}
    </div>
  );
}

// ─── Chapter pane ────────────────────────────────────────────────────

interface ChapterPaneProps {
  slot: ChapterSlot;
  isPricing: boolean;
  isEditing: boolean;
  isRegenerating: boolean;
  editBuffer: { title: string; body: string };
  setEditBuffer: (b: { title: string; body: string }) => void;
  onStartEdit: (slot: GenerateSlot) => void;
  onCancelEdit: () => void;
  onSaveEdit: () => void;
  onRegenerate: (slot: ChapterSlot) => void;
}

function ChapterPane({
  slot,
  isPricing,
  isEditing,
  isRegenerating,
  editBuffer,
  setEditBuffer,
  onStartEdit,
  onCancelEdit,
  onSaveEdit,
  onRegenerate,
}: ChapterPaneProps) {
  return (
    <div
      className="rounded-xl"
      style={{
        backgroundColor: brand.white,
        border: `1px solid ${brand.border}`,
        boxShadow: brand.shadow,
      }}
    >
      {/* Pane header */}
      <div
        className="flex items-start justify-between gap-4 p-5"
        style={{ borderBottom: `1px solid ${brand.border}` }}
      >
        <div className="min-w-0">
          <p
            className="text-[10px] font-bold tracking-widest uppercase mb-1"
            style={{ color: brand.navyMuted }}
          >
            Chapter {pad2(slot.slotIndex)}
          </p>
          <h2
            className="text-lg font-bold leading-snug"
            style={{ color: brand.navy }}
          >
            {slot.source === "generate" ? slot.title : slot.slotName}
          </h2>
        </div>
        <div className="flex items-center gap-2 flex-shrink-0">
          {slot.source === "generate" && !isEditing && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onStartEdit(slot)}
              disabled={isRegenerating}
            >
              <Edit3 className="w-3.5 h-3.5 mr-1.5" />
              Edit text
            </Button>
          )}
          {slot.source === "generate" && (
            <Button
              size="sm"
              variant="outline"
              onClick={() => onRegenerate(slot)}
              disabled={isRegenerating}
            >
              {isRegenerating ? (
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
              ) : (
                <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
              )}
              Regenerate
            </Button>
          )}
        </div>
      </div>

      {/* Pane body */}
      <div className="p-5">
        {slot.source === "embed" ? (
          <EmbedSlotPreview slot={slot} />
        ) : isEditing ? (
          <GenerateSlotEdit
            buffer={editBuffer}
            setBuffer={setEditBuffer}
            onCancel={onCancelEdit}
            onSave={onSaveEdit}
            isPricing={isPricing}
          />
        ) : (
          <GenerateSlotView slot={slot} isPricing={isPricing} />
        )}
      </div>
    </div>
  );
}

// ─── Embed slot — read-only preview card ─────────────────────────────

function EmbedSlotPreview({ slot }: { slot: EmbedSlot }) {
  const tagLabel = describeEmbedTag(slot.slotName);
  return (
    <div>
      <div
        className="rounded-lg p-5 flex items-start gap-4"
        style={{
          backgroundColor: brand.tealBg,
          border: `1px dashed ${brand.tealBorder}`,
        }}
      >
        <div
          className="w-10 h-10 rounded-lg flex items-center justify-center flex-shrink-0"
          style={{ backgroundColor: brand.white }}
        >
          <ImageIcon className="w-5 h-5" style={{ color: brand.teal }} />
        </div>
        <div className="flex-1 min-w-0">
          <p
            className="text-sm font-semibold mb-1"
            style={{ color: brand.navy }}
          >
            Filled by your brochure's {tagLabel} page
          </p>
          <p className="text-xs leading-relaxed" style={{ color: brand.navyMuted }}>
            We'll embed page {slot.brochurePageNumber} of your brochure
            verbatim here when the PDF is rendered — every pixel of the
            original layout preserved. Brochure pages can't be edited
            from this screen; replace your brochure in Settings to
            change them.
          </p>
          {slot.reason && (
            <p
              className="text-xs italic mt-2"
              style={{ color: brand.navyMuted }}
            >
              Why this page: {slot.reason}
            </p>
          )}
        </div>
      </div>
    </div>
  );
}

// ─── Generate slot — read-only view ──────────────────────────────────

function GenerateSlotView({
  slot,
  isPricing,
}: {
  slot: GenerateSlot;
  isPricing: boolean;
}) {
  return (
    <div>
      {isPricing && (
        <div
          className="rounded-md p-3 mb-4 flex items-start gap-2 text-xs"
          style={{
            backgroundColor: "#dcfce7",
            color: "#166534",
            border: "1px solid #bbf7d0",
          }}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Pricing summary — from your existing engine.</strong>{" "}
            The narrative below is editable. Line-item totals on this
            quote are unaffected by edits here — they come from the
            pricing engine you already use on the regular workspace.
          </span>
        </div>
      )}
      <div
        className="rounded-lg p-5 whitespace-pre-wrap text-sm leading-relaxed"
        style={{
          backgroundColor: brand.slate,
          color: brand.navy,
          border: `1px solid ${brand.borderLight}`,
        }}
      >
        {slot.body}
      </div>
    </div>
  );
}

// ─── Generate slot — inline edit ─────────────────────────────────────

function GenerateSlotEdit({
  buffer,
  setBuffer,
  onCancel,
  onSave,
  isPricing,
}: {
  buffer: { title: string; body: string };
  setBuffer: (b: { title: string; body: string }) => void;
  onCancel: () => void;
  onSave: () => void;
  isPricing: boolean;
}) {
  return (
    <div className="space-y-3">
      {isPricing && (
        <div
          className="rounded-md p-3 flex items-start gap-2 text-xs"
          style={{
            backgroundColor: "#dcfce7",
            color: "#166534",
            border: "1px solid #bbf7d0",
          }}
        >
          <Info className="w-3.5 h-3.5 mt-0.5 flex-shrink-0" />
          <span>
            <strong>Pricing summary.</strong> Edit this narrative freely —
            line-item totals on the quote are independent and won't change.
          </span>
        </div>
      )}
      <div>
        <label
          className="block text-[10px] font-bold tracking-widest uppercase mb-1.5"
          style={{ color: brand.navyMuted }}
        >
          Chapter title
        </label>
        <input
          type="text"
          value={buffer.title}
          onChange={(e) => setBuffer({ ...buffer, title: e.target.value })}
          className="w-full px-3 py-2 text-sm rounded-md"
          style={{
            border: `1px solid ${brand.border}`,
            color: brand.navy,
          }}
        />
      </div>
      <div>
        <label
          className="block text-[10px] font-bold tracking-widest uppercase mb-1.5"
          style={{ color: brand.navyMuted }}
        >
          Chapter body
        </label>
        <Textarea
          value={buffer.body}
          onChange={(e) => setBuffer({ ...buffer, body: e.target.value })}
          rows={16}
          className="text-sm leading-relaxed"
          style={{ minHeight: "320px" }}
        />
      </div>
      <div className="flex justify-end gap-2 pt-1">
        <Button size="sm" variant="ghost" onClick={onCancel}>
          <X className="w-3.5 h-3.5 mr-1.5" />
          Cancel
        </Button>
        <Button size="sm" onClick={onSave}>
          <Save className="w-3.5 h-3.5 mr-1.5" />
          Save edit
        </Button>
      </div>
    </div>
  );
}
