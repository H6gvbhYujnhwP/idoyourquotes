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
  FileSignature,
  AlertTriangle,
  Trash2,
  Calendar,
  Undo2,
} from "lucide-react";
import { toast } from "sonner";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { brand } from "@/lib/brandTheme";
import { trpc } from "@/lib/trpc";
import XeroPushDialog from "@/components/XeroPushDialog";
// Delivery 2.14 Chunk 2 — chapter identity, shared with the server.
// Replaces this file's hand-copied PRICING_SLOT_INDEX, which had
// already drifted once (see the note further down).
import { isPricingChapter, type ChapterRole } from "@shared/proposalChapters";

// ─── Types ───────────────────────────────────────────────────────────
//
// Mirror of the server's ChapterSlot discriminated union. We don't
// import from the server because the client doesn't compile server
// modules — duplicating the shape locally is the existing cross-process
// pattern (see how QuoteWorkspace handles trpc result types).

// Delivery 2.14 Chunk 2 — `chapterId` and `role` are the chapter's
// identity, mirroring the server's ChapterSlot. Both optional: a
// proposal saved before this delivery carries neither, and is read
// through the legacy fallback in isPricingChapter(). They are declared
// here so the round trip through save keeps them — the server's zod
// schema would otherwise be the only thing preserving them, and a type
// that quietly omits a field is how the last mirror drifted.

type EmbedSlot = {
  slotIndex: number;
  chapterId?: string;
  role?: ChapterRole;
  slotName: string;
  source: "embed";
  brochurePageNumber: number;
  reason: string;
  // Delivery 2.9 — see the note on ChapterSlot below.
  excluded?: boolean;
};

type GenerateSlot = {
  slotIndex: number;
  chapterId?: string;
  role?: ChapterRole;
  slotName: string;
  source: "generate";
  title: string;
  body: string;
  excluded?: boolean;
};

// Delivery 2.9 — `excluded` takes a chapter out of the rendered PDF
// WITHOUT destroying it. Delivery 2.8 removed the chapter from the array
// outright, which was unrecoverable: the only way back was starting the
// proposal again and paying for another draft. Excluded chapters stay in
// the list, stay in the saved state, and are filtered out at render
// time. Absent = included, so every proposal saved before 2.9 reads
// correctly.
type ChapterSlot = EmbedSlot | GenerateSlot;

// Slot 16 is the Pricing Summary chapter — flagged in the sidebar with
// an EDITABLE badge so the user can see at a glance which chapter
// carries the pricing narrative. The actual line-item totals on the
// quote come from the existing pricing engine and are unaffected by
// edits to this chapter's body.
//
// Delivery 2.9 — WAS 15, WHICH WAS WRONG. Phase 4B Delivery E.4.3 split
// the old Cover slot into Cover + Title Page and renumbered everything
// after it by one; the server's PRICING_SLOT_INDEX moved to 16 but this
// client-side mirror was never updated. Consequences on the live site:
// the EDITABLE badge sat on "Key Personnel" (the real slot 15), and the
// 2.8 delete control — which exempts the pricing chapter — appeared on
// Pricing Summary and was hidden on Key Personnel. The pricing chapter
// was deletable. Found while proving 2.9's render changes: the proof
// quote's pricing table never drew, because the assembler dispatches on
// the server's 16 and the proof had followed this file's 15.
//
// Delivery 2.14 Chunk 2 — THE MIRROR IS GONE. The drift above was not
// bad luck, it was the predictable result of the same magic number
// living in four files with nothing tying them together. The pricing
// chapter is now identified by a role that travels with the chapter
// itself, and isPricingChapter() is shared by the client, the engine,
// the assembler and the router. There is nothing left here to drift,
// and a sector chapter set with a different number of chapters (Chunk
// 5) can no longer put the pricing table in the wrong place.

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
  // Phase 4B Delivery E.4.3 — Cover slot is now an embed-source slot
  // pointing at brochure page 1 verbatim. Distinct label so the
  // workspace doesn't say "Brochure page" generically.
  if (lower === "cover") return "Cover";
  if (lower.includes("about")) return "About Us";
  if (lower.includes("different") || lower.includes("why")) return "USPs / Why Choose Us";
  if (lower.includes("track")) return "Track Record / Case Studies";
  if (lower.includes("personnel") || lower.includes("team")) return "Team / Key People";
  if (lower.includes("service")) return "Services";
  return "Brochure page";
}

// ─── Component ───────────────────────────────────────────────────────

/** Contracts-per-business delivery — label for a contract document:
 *  Sweetbyte's shipped tiers keep "Gold" / "Silver"; anything else uses
 *  the name its owner gave it. Mirrors docLabel in ContractDocumentsTab. */
const CONTRACT_TIER_LABELS: Record<string, string> = {
  gold: "Gold",
  silver: "Silver",
};
function contractDocLabel(doc: { tier: string; displayName?: string | null } | undefined): string {
  if (!doc) return "";
  return CONTRACT_TIER_LABELS[doc.tier] ?? (doc.displayName?.trim() || doc.tier);
}

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
  // Delivery 2.6b — the Documents panel. Previously a rendered PDF only
  // existed in browser memory, so pressing Back lost it and the user had
  // to re-render (re-spending AI credits) just to look at it again.
  const documents = trpc.brandedProposal.listDocuments.useQuery(
    { quoteId },
    { enabled: Number.isFinite(quoteId) },
  );
  const getDocumentUrl = trpc.brandedProposal.getDocumentUrl.useMutation();
  // Delivery 2.8 — chapter edits, removals, orientation and cover date
  // are saved against the quote. Previously they lived in browser memory
  // only, so a refresh discarded everything and the user had to redo it
  // before every render.
  const savedSlots = trpc.brandedProposal.loadSlots.useQuery(
    { quoteId },
    { enabled: Number.isFinite(quoteId) },
  );
  const saveSlots = trpc.brandedProposal.saveSlots.useMutation();
  // Contract-button delivery — the same document rendered as a
  // contract. Deliberately a separate endpoint rather than a flag on
  // renderPdf, so an accidental click can never turn a proposal
  // download into a contract download.
  const renderContract = trpc.brandedProposal.renderContract.useMutation();
  const contractDocs = trpc.contractDocument.list.useQuery();
  const [contractOpen, setContractOpen] = useState(false);
  const [contractTier, setContractTier] = useState<string>("");
  const [commencementDate, setCommencementDate] = useState("");
  const [isRenderingContract, setIsRenderingContract] = useState(false);
  // Delivery 2.12 — tick box on the contract dialog, and the preview it
  // opens. The preview writes nothing; the push happens inside it.
  const [alsoPushXero, setAlsoPushXero] = useState(false);
  const [xeroPreviewOpen, setXeroPreviewOpen] = useState(false);
  const xeroStatus = trpc.xero.status.useQuery();

  // ── Workspace state ──────────────────────────────────────────────
  const [slots, setSlots] = useState<ChapterSlot[] | null>(null);
  // Delivery 2.8 — the cover date printed on the title page. Empty means
  // "today", which is what every render did before this.
  const [coverDate, setCoverDate] = useState<string>("");
  /**
   * Delivery 2.14 Chunk 4 — which chapter set this proposal's chapters
   * came from. Restored from the saved state, set by a fresh draft, and
   * sent back on every save and every regenerate.
   *
   * Null means a proposal saved before stamping existed, which the
   * server reads as the frozen legacy IT set. It is deliberately NOT
   * defaulted to the current set here: doing so would stamp an old
   * proposal with a set it was never built from the first time the user
   * touched it, and from Chunk 5 that would mean regenerating a chapter
   * against the wrong guidance.
   */
  const [chapterSetId, setChapterSetId] = useState<string | null>(null);
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

    // Delivery 2.8 — restore the saved workspace state before falling
    // back to generating a fresh draft. Generation costs AI credits, so
    // reopening a proposal must not silently re-spend them and discard
    // the user's edits.
    if (savedSlots.isLoading) return;
    const restored = (savedSlots.data as any)?.saved;
    if (restored?.slots?.length) {
      draftKickedOffRef.current = true;
      setSlots(restored.slots as ChapterSlot[]);
      setSelectedIndex((restored.slots as ChapterSlot[])[0].slotIndex);
      if (restored.orientation) setRenderOrientation(restored.orientation);
      if (restored.coverDate) setCoverDate(restored.coverDate);
      // Delivery 2.14 Chunk 4 — absent on anything saved before this
      // delivery, and left absent on purpose. See the note on the state.
      setChapterSetId(restored.chapterSetId ?? null);
      return;
    }

    draftKickedOffRef.current = true;

    (async () => {
      try {
        const result = await generateDraft.mutateAsync({ quoteId });
        const incoming = (result as { slots: ChapterSlot[] }).slots;
        // Delivery 2.14 Chunk 4 — the generator says which set it used.
        setChapterSetId(
          (result as { chapterSetId?: string }).chapterSetId ?? null,
        );
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
  }, [
    quoteId,
    quoteLoading,
    brochureLoading,
    brochureData,
    slots,
    // Delivery 2.9 — the saved-state query MUST be in here. The body
    // bails out while it is still loading; without these two deps
    // nothing woke the effect back up when it resolved, so whenever it
    // settled after the brochure query the saved proposal was never
    // restored.
    savedSlots.isLoading,
    savedSlots.data,
  ]);

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
    const next = slots.map((s) => {
      if (s.slotIndex !== editingIndex) return s;
      if (s.source !== "generate") return s;
      return {
        ...s,
        title: editBuffer.title,
        body: editBuffer.body,
      };
    });
    setSlots(next);
    // Delivery 2.9 — persist. This was the ONE editing path that never
    // called persistSlots: regenerate, removal, the date control and
    // both render buttons all saved, so an edit followed by a refresh
    // (rather than a render) was silently thrown away and the workspace
    // generated a fresh draft, spending credits and returning different
    // wording.
    persistSlots(next);
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
        // Delivery 2.14 Chunk 4 — look the chapter up in the set this
        // proposal was actually built from, not in whatever set its
        // sector uses now.
        chapterSetId: chapterSetId || undefined,
        currentSlots: slots,
      });
      const updated = (result as { slot: ChapterSlot }).slot;
      {
        const next = slots.map((s) =>
          s.slotIndex === slot.slotIndex ? updated : s,
        );
        setSlots(next);
        persistSlots(next); // Delivery 2.8 — edits survive a refresh.
      }
      toast.success(`Regenerated "${slot.slotName}"`);
    } catch (err: any) {
      toast.error(err?.message || "Regenerate failed");
    } finally {
      setRegeneratingIndex(null);
    }
  }

  /**
   * Delivery 2.8 — persist the workspace state. Best-effort and quiet:
   * a save failure must never interrupt editing or block a render, and
   * the state is still in memory either way.
   */
  function persistSlots(
    nextSlots: ChapterSlot[],
    nextOrientation = renderOrientation,
    nextCoverDate = coverDate,
    nextChapterSetId = chapterSetId,
  ) {
    if (!Number.isFinite(quoteId) || nextSlots.length === 0) return;
    saveSlots
      .mutateAsync({
        quoteId,
        slots: nextSlots as any,
        orientation: nextOrientation,
        coverDate: nextCoverDate || undefined,
        // Delivery 2.14 Chunk 4 — the stamp survives the round trip.
        // Undefined rather than null when unknown, so a legacy proposal
        // stays unstamped rather than acquiring a set it never used.
        chapterSetId: nextChapterSetId || undefined,
      })
      .catch(() => {});
  }

  /**
   * Delivery 2.9 — take a chapter out of the document, or put it back.
   *
   * The generated set is deliberately broad (18 slots) so it covers many
   * kinds of engagement; a given quote usually wants fewer. Q-207
   * carried "Cloud Migration Approach" and "Website Hosting & Support"
   * for a deal containing neither.
   *
   * 2.8 deleted the chapter from the array, which was a one-way door:
   * the text was gone and the only route back was regenerating the whole
   * draft. Now the chapter is marked excluded — greyed in the list,
   * skipped at render time, restorable with one click, and remembered
   * across refreshes like every other edit.
   */
  function handleToggleChapter(slotIndex: number) {
    if (!slots) return;
    const target = slots.find((s) => s.slotIndex === slotIndex);
    if (!target) return;
    if (isPricingChapter(target)) {
      toast.error("The pricing chapter can't be taken out");
      return;
    }
    const nowExcluded = !target.excluded;
    // Only confirm on the way out. Putting a chapter back is harmless.
    if (
      nowExcluded &&
      !window.confirm(
        `Leave "${target.slotName}" out of this document? You can put it back at any time.`,
      )
    ) {
      return;
    }
    const next = slots.map((s) =>
      s.slotIndex === slotIndex ? { ...s, excluded: nowExcluded } : s,
    );
    setSlots(next);
    persistSlots(next);
    toast.success(
      nowExcluded
        ? `"${target.slotName}" left out — click the arrow to put it back`
        : `"${target.slotName}" put back`,
    );
  }

  /**
   * Delivery 2.9 — what actually goes in the PDF. Excluded chapters are
   * stripped here, on the way to the server; the server strips them
   * again before assembling, so a stale tab can't slip one through.
   */
  function slotsForRender(): ChapterSlot[] {
    return (slots ?? []).filter((s) => !s.excluded);
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
      persistSlots(slots);
      const result = await renderPdf.mutateAsync({
        quoteId,
        // Delivery 2.9 — the full list is saved, the trimmed list is
        // rendered.
        slots: slotsForRender(),
        orientation: renderOrientation,
        coverDate: coverDate || undefined,
      });
      const { base64, filename } = result as {
        base64: string;
        filename: string;
      };
      downloadBase64Pdf(base64, filename);
      // The server stored this render; refresh the panel so it shows.
      documents.refetch();
      toast.success("Proposal downloaded");
    } catch (err: any) {
      toast.error(err?.message || "Render failed");
    } finally {
      setIsRendering(false);
    }
  }

  /**
   * Open the contract dialog.
   *
   * Pre-selects the package that appears most often in the quote's
   * line items, but never decides for the user. A quote can legitimately
   * mix tiers — Sweetbyte's own Sorrells proposal put Silver on the
   * workstations and Gold on the servers — so guessing from the line
   * items alone would get it wrong.
   */
  function handleOpenContract() {
    if (editingIndex !== null) {
      const ok = window.confirm(
        "You have unsaved edits on a chapter. Continue and discard them?",
      );
      if (!ok) return;
      setEditingIndex(null);
      setEditBuffer({ title: "", body: "" });
    }
    const docs = contractDocs.data?.documents ?? [];
    if (docs.length === 0) {
      toast.error(
        "Add a contract first — open Settings → Contracts.",
      );
      return;
    }
    // Contracts-per-business delivery — also re-selects when the stored
    // choice no longer exists (the contract was deleted in Settings).
    if (!contractTier || !docs.some((d: any) => d.tier === contractTier)) {
      setContractTier(docs[0].tier);
    }
    setContractOpen(true);
  }

  async function handleRenderContract() {
    if (!slots) return;
    if (isRenderingContract) return;
    if (!commencementDate.trim()) {
      toast.error("Enter the start date first");
      return;
    }
    setIsRenderingContract(true);
    try {
      const result = await renderContract.mutateAsync({
        quoteId,
        slots: slotsForRender(),
        orientation: renderOrientation,
        coverDate: coverDate || undefined,
        tier: contractTier,
        commencementDate: commencementDate.trim(),
      });
      const { base64, filename } = result as {
        base64: string;
        filename: string;
      };
      downloadBase64Pdf(base64, filename);
      documents.refetch();
      toast.success("Contract downloaded");
      setContractOpen(false);
      // Delivery 2.12 — the Xero preview opens only AFTER the contract
      // has rendered successfully. Pushing invoices for a document that
      // failed to produce would be the wrong order entirely.
      if (alsoPushXero) setXeroPreviewOpen(true);
    } catch (err: any) {
      toast.error(err?.message || "Contract render failed");
    } finally {
      setIsRenderingContract(false);
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
                    onClick={() => setLocation("/settings?tab=branding")}
                  >
                    <BookOpen className="w-4 h-4 mr-1.5" />
                    Go to Branding settings
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
            Edits saved automatically
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
          {/* Delivery 2.8 — the date printed on the title page. Blank
              means today, which is what every render did before. Needed
              because a contract agreed on 22 August was restamped with
              the render date every time it was produced.
              Delivery 2.13 — labelled "Document date". As plain "Date"
              it read as a duplicate of the contract dialog's Start
              date, which is a different fact entirely: this one is when
              the document is dated, that one is when the service
              begins. */}
          <label className="flex items-center gap-1.5 text-xs">
            <Calendar className="w-3.5 h-3.5" style={{ color: brand.navyMuted }} />
            <span className="text-muted-foreground">Document date</span>
            <input
              type="date"
              value={coverDate}
              onChange={(e) => {
                setCoverDate(e.target.value);
                if (slots) persistSlots(slots, renderOrientation, e.target.value);
              }}
              disabled={isRendering}
              title="Date printed on the title page — leave blank for today. Not the service start date, which is asked for when you create the contract."
              className="rounded-md border bg-background px-2 py-1 text-xs focus:outline-none"
              style={{ borderColor: brand.border }}
            />
          </label>
          {/* Contract-button delivery — sits beside Render PDF because
              it produces the same document in its signed form. Outline
              rather than filled: rendering the proposal stays the
              primary action, since the contract only comes after the
              client has said yes. */}
          <Button
            variant="outline"
            onClick={handleOpenContract}
            disabled={isRendering || isRenderingContract}
            className="font-semibold"
          >
            <FileSignature className="w-4 h-4 mr-1.5" />
            Turn into contract
          </Button>
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

      {/* Delivery 2.6b — Documents: the latest proposal and contract are
          kept against the quote, so leaving the page and coming back
          doesn't mean paying to render again. "Quote edited since" is
          derived server-side from the quote's and line items' updated
          timestamps; nothing ever re-renders on its own. */}
      {(documents.data?.documents?.length ?? 0) > 0 && (
        <div className="mt-6 rounded-xl border bg-white p-4">
          <p className="text-sm font-semibold mb-3">Documents</p>
          <div className="space-y-2">
            {documents.data!.documents.map((doc: any) => (
              <div
                key={doc.kind}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2"
              >
                <FileText className="w-4 h-4 shrink-0 text-muted-foreground" />
                <span className="text-sm font-medium">
                  {doc.kind === "contract"
                    ? `Contract${doc.tier ? ` — ${contractDocLabel({ tier: doc.tier })}` : ""}`
                    : "Branded proposal"}
                </span>
                <span className="text-xs text-muted-foreground">
                  {new Date(doc.generatedAt).toLocaleString("en-GB", {
                    day: "numeric",
                    month: "short",
                    hour: "2-digit",
                    minute: "2-digit",
                  })}
                </span>
                {doc.stale && (
                  <span className="inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-xs font-medium text-amber-700 bg-amber-50">
                    <AlertTriangle className="w-3 h-3" />
                    Quote edited since
                  </span>
                )}
                <div className="ml-auto flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    disabled={getDocumentUrl.isPending}
                    onClick={async () => {
                      try {
                        const { url } = await getDocumentUrl.mutateAsync({
                          quoteId,
                          kind: doc.kind,
                        });
                        window.open(url, "_blank", "noopener");
                      } catch (e: any) {
                        toast.error(e?.message || "Could not open that document");
                      }
                    }}
                  >
                    <ExternalLink className="w-3.5 h-3.5 mr-1.5" />
                    View
                  </Button>
                  <Button
                    size="sm"
                    variant={doc.stale ? "default" : "outline"}
                    disabled={isRendering || isRenderingContract}
                    onClick={
                      doc.kind === "contract" ? handleOpenContract : handleRenderPdf
                    }
                  >
                    <RefreshCw className="w-3.5 h-3.5 mr-1.5" />
                    Regenerate
                  </Button>
                </div>
              </div>
            ))}
          </div>
          <p className="mt-2 text-xs text-muted-foreground">
            Only the most recent of each is kept. The Word export always
            reflects the current quote, so it isn&rsquo;t stored here.
          </p>
        </div>
      )}

      {/* Contract dialog — contract-button delivery.
          Two questions only: which package, and when does it start.
          Everything else on the contract comes from the quote and from
          Settings, which is the point: the terms stop being retyped. */}
      {contractOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center p-4"
          style={{ background: "rgba(15,23,42,0.45)" }}
          onClick={() => !isRenderingContract && setContractOpen(false)}
        >
          <div
            className="w-full max-w-md rounded-xl bg-white p-6 space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div>
              <h2
                className="text-lg font-bold"
                style={{ color: brand.navy }}
              >
                Turn this into a contract
              </h2>
              <p className="text-sm text-muted-foreground mt-1">
                Same document, same pricing. The wording changes to
                agreement, and your terms and signature pages are added.
              </p>
            </div>

            {/* Contracts-per-business delivery — one contract: no picker,
                just its name. Several: a picker labelled with the
                business's own names (Sweetbyte's shipped tiers keep their
                short Gold / Silver labels). */}
            {(contractDocs.data?.documents ?? []).length === 1 ? (
              <div className="space-y-1">
                <label className="text-sm font-medium">Contract</label>
                <p className="text-sm">
                  {contractDocLabel((contractDocs.data?.documents ?? [])[0])}
                </p>
              </div>
            ) : (
            <div className="space-y-2">
              <label className="text-sm font-medium">Contract</label>
              <div className="flex flex-wrap gap-2">
                {(contractDocs.data?.documents ?? []).map((doc: any) => (
                  <button
                    key={doc.tier}
                    type="button"
                    onClick={() => setContractTier(doc.tier)}
                    className="flex-1 px-4 py-2 text-sm font-medium rounded-md border transition-colors"
                    style={
                      contractTier === doc.tier
                        ? {
                            background: brand.navy,
                            color: "white",
                            borderColor: brand.navy,
                          }
                        : { background: "white", borderColor: brand.border }
                    }
                  >
                    {contractDocLabel(doc)}
                  </button>
                ))}
              </div>
              <p className="text-xs text-muted-foreground">
                A quote can mix packages, so this is always your choice.
              </p>
            </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">Start date</label>
              <input
                type="text"
                value={commencementDate}
                placeholder="e.g. 1 October 2026"
                onChange={(e) => setCommencementDate(e.target.value)}
                className="w-full rounded-md border px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-ring"
                style={{ borderColor: brand.border }}
              />
              <p className="text-xs text-muted-foreground">
                Printed exactly as you type it, on the acceptance page.
              </p>
            </div>

            {/* Delivery 2.12 — Xero. Only offered when Xero is actually
                connected; otherwise the tick box would promise something
                that cannot happen. */}
            {(xeroStatus.data as any)?.connected && (
              <label className="flex items-start gap-2 text-sm rounded-md border p-3 cursor-pointer">
                <input
                  type="checkbox"
                  checked={alsoPushXero}
                  onChange={(e) => setAlsoPushXero(e.target.checked)}
                  className="mt-0.5"
                />
                <span>
                  Also set this up in{" "}
                  <strong>
                    {(xeroStatus.data as any)?.tenantName || "Xero"}
                  </strong>
                  <span className="block text-xs text-muted-foreground">
                    You'll see exactly what will be created before anything
                    happens.
                  </span>
                </span>
              </label>
            )}

            {!contractDocs.data?.signatory?.signatureImage && (
              <div
                className="rounded-md border p-3 text-xs"
                style={{ background: "#fffbeb", borderColor: "#fcd34d" }}
              >
                No signature on file — the contract will print a blank
                line to sign by hand. Add one in Settings &rarr; Contracts.
              </div>
            )}

            <div className="flex gap-2 justify-end pt-1">
              <Button
                variant="outline"
                onClick={() => setContractOpen(false)}
                disabled={isRenderingContract}
              >
                Cancel
              </Button>
              <Button
                onClick={handleRenderContract}
                disabled={isRenderingContract || !contractTier}
                style={{ backgroundColor: brand.teal, color: brand.white }}
              >
                {isRenderingContract ? (
                  <Loader2 className="w-4 h-4 mr-1.5 animate-spin" />
                ) : (
                  <Download className="w-4 h-4 mr-1.5" />
                )}
                Generate contract
              </Button>
            </div>
          </div>
        </div>
      )}

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
              const isPricing = isPricingChapter(s);
              const isRegen = regeneratingIndex === s.slotIndex;
              // Delivery 2.9 — an excluded chapter stays in the list so
              // it can be read and put back; it just doesn't print.
              const isExcluded = !!s.excluded;
              return (
                <li key={s.slotIndex} className="group relative">
                  {/* Delivery 2.9 — take a chapter out of the document,
                      or put it back. Pricing is exempt (the document must
                      price something). The control appears on hover /
                      focus so the list stays clean, but stays visible
                      while the chapter is excluded — otherwise the way
                      back is hidden. */}
                  {!isPricing && (
                    <button
                      type="button"
                      aria-label={
                        isExcluded
                          ? `Put ${s.slotName} back in`
                          : `Leave ${s.slotName} out`
                      }
                      title={
                        isExcluded
                          ? "Put this chapter back in the document"
                          : "Leave this chapter out of the document"
                      }
                      onClick={(e) => {
                        e.stopPropagation();
                        handleToggleChapter(s.slotIndex);
                      }}
                      className={`absolute right-1 top-1 z-10 rounded p-1 focus:opacity-100 ${
                        isExcluded
                          ? "opacity-100 hover:bg-teal-50"
                          : "opacity-0 group-hover:opacity-100 hover:bg-red-50"
                      }`}
                    >
                      {isExcluded ? (
                        <Undo2
                          className="w-3.5 h-3.5"
                          style={{ color: brand.teal }}
                        />
                      ) : (
                        <Trash2 className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
                      )}
                    </button>
                  )}
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
                      opacity: isExcluded ? 0.45 : 1,
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
                      <span
                        className={`block text-[13px] font-medium leading-tight ${
                          isExcluded ? "line-through" : ""
                        }`}
                      >
                        {s.slotName}
                      </span>
                      <span className="flex items-center gap-1 mt-1 flex-wrap">
                        {isExcluded && (
                          <span
                            className="inline-flex items-center text-[9px] font-bold tracking-wide uppercase px-1.5 py-0.5 rounded"
                            style={{
                              backgroundColor: "#fef3c7",
                              color: "#92400e",
                            }}
                            title="Kept here, but not printed in the PDF"
                          >
                            Left out
                          </span>
                        )}
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
          {/* Delivery 2.9 — an excluded chapter is still fully readable
              and editable here; it simply won't print until it's put
              back. Saying so beats leaving the user wondering why the
              PDF is missing a chapter they can plainly see. */}
          {selectedSlot && selectedSlot.excluded && (
            <div
              className="mb-4 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-lg border px-3 py-2 text-sm"
              style={{ background: "#fffbeb", borderColor: "#fcd34d" }}
            >
              <AlertTriangle
                className="w-4 h-4 shrink-0"
                style={{ color: "#b45309" }}
              />
              <span>
                This chapter is left out of the PDF. Nothing has been
                deleted.
              </span>
              <Button
                size="sm"
                variant="outline"
                className="ml-auto"
                onClick={() => handleToggleChapter(selectedSlot.slotIndex)}
              >
                <Undo2 className="w-3.5 h-3.5 mr-1.5" />
                Put it back
              </Button>
            </div>
          )}
          {selectedSlot && (
            <ChapterPane
              slot={selectedSlot}
              isPricing={isPricingChapter(selectedSlot)}
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
            onClick={() => setLocation("/settings?tab=branding")}
            className="inline-flex items-center gap-1 font-semibold hover:underline"
            style={{ color: brand.teal }}
          >
            Manage brochure
            <ExternalLink className="w-3 h-3" />
          </button>
        </div>
      )}

      {/* Delivery 2.12 — Xero preview. Carries the same start date the
          contract was rendered with, so the repeating invoices and the
          signed document agree. */}
      {xeroPreviewOpen && (
        <XeroPushDialog
          quoteId={quoteId}
          commencementDate={commencementDate.trim()}
          onClose={() => setXeroPreviewOpen(false)}
        />
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
