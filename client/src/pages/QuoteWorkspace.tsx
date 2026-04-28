/**
 * QuoteWorkspace.tsx — unified quote workspace (Beta-1)
 *
 * Single-screen, two-click, auto-saved flow replacing the old three-state
 * pipeline (upload → QDS → edit → Generate Quote → lineItems → PDF).
 *
 * Routing context: QuoteRouter decides between this workspace and
 * ElectricalWorkspace based on tradePreset === "electrical". This
 * workspace handles all other sectors (IT, marketing, cleaning, pest
 * control) in simple mode only.
 *
 * Two states:
 *   State 1 (lineItems.length === 0): Evidence gathering. User adds
 *     evidence (uploads, pasted text, dictation) on the left; right
 *     panel shows a centred "Generate Quote" button.
 *   State 2 (lineItems.length > 0): Quote editing. Left panel unchanged;
 *     right panel shows quote header, editable job description, line
 *     items table, and "Generate PDF" footer.
 *
 * Auto-save: every field edit flows through a short debounce. The header
 * "All changes saved" indicator reflects pending/in-flight work.
 *
 * Highlighting (evidence ↔ line item): backed by sourceInputMap returned
 * from generateDraft. Held in React state only for this session; Beta-2
 * will persist to quote_line_items.source_input_ids.
 *
 * Fallback: if quoteMode === "comprehensive" and tradePreset !==
 * "electrical", renders a "coming in a future update" card. The old
 * comprehensive tabs for non-electrical sectors are deprecated pending
 * the tender-quote feature (future PR).
 *
 * Components ported from the retiring QuoteDraftSummary.tsx:
 *   - SourceBadge (src/components/SourceBadge.tsx)
 *   - CatalogPicker (src/components/CatalogPicker.tsx)
 *
 * Beta-1 simplification on pricingType: the current enum is
 * ("standard" | "monthly" | "annual" | "optional") — we expose all four
 * as a single "Type" dropdown. Beta-2 splits "optional" into its own
 * boolean column and renames "standard" → "one_off"; the UI will then
 * grow a separate Optional checkbox alongside a three-value Type.
 */

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import { useLocation, useParams } from "wouter";
import { toast } from "sonner";
import { trpc } from "@/lib/trpc";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  ArrowLeft,
  Upload,
  FileText,
  Mic,
  Sparkles,
  Loader2,
  Trash2,
  Plus,
  Download,
  AlertCircle,
  Clock,
  Info,
  RefreshCw,
  Lock,
} from "lucide-react";
import DictationButton from "@/components/DictationButton";
import CatalogPicker, { type CatalogItemRef } from "@/components/CatalogPicker";
import MissingCostsModal from "@/components/MissingCostsModal";
import AddToCatalogueDialog, {
  type AddToCatalogueSeed,
} from "@/components/AddToCatalogueDialog";
import ReviewBeforeGenerateModal from "@/components/ReviewBeforeGenerateModal";
import SoloUpgradeModal from "@/components/SoloUpgradeModal";
import ExportFormatPickerModal from "@/components/ExportFormatPickerModal";
import BrandChoiceModal, { type BrandMode } from "@/components/BrandChoiceModal";
import { type DesignTemplate } from "@/lib/proposalShowcaseAssets";
import { useAutoSave } from "@/hooks/useAutoSave";
import { brand } from "@/lib/brandTheme";

// ─── Types ────────────────────────────────────────────────────────────────

interface LineItem {
  id: number;
  description: string | null;
  quantity: string | null;
  unit: string | null;
  rate: string | null;
  total: string | null;
  pricingType: string | null;
  sortOrder: number;
  // Chunk 3 Delivery B — provenance from the AI draft builder. isEstimated
  // is the trigger for the amber chip + "Add to catalogue" button on a
  // row. itemName / costPrice are used to pre-fill the dialog. All three
  // ride through getFull already (see server/db.ts line items schema).
  isEstimated?: boolean | null;
  itemName?: string | null;
  costPrice?: string | null;
}

interface QuoteInput {
  id: number;
  inputType: string;
  filename: string | null;
  fileUrl: string | null;
  content: string | null;
  mimeType: string | null;
  processingStatus: string | null;
  processingError: string | null;
  createdAt: Date | string;
}

// ─── Helpers ──────────────────────────────────────────────────────────────

function fmtGBP(n: number): string {
  if (!Number.isFinite(n)) return "£0.00";
  return `£${n.toFixed(2).replace(/\B(?=(\d{3})+(?!\d))/g, ",")}`;
}

function parseNum(s: string | null | undefined): number {
  if (s == null) return 0;
  const n = parseFloat(s);
  return Number.isFinite(n) ? n : 0;
}

type DisplayType = "one_off" | "monthly" | "annual" | "optional";
function uiTypeFromPricing(pt: string | null | undefined): DisplayType {
  if (pt === "monthly") return "monthly";
  if (pt === "annual") return "annual";
  if (pt === "optional") return "optional";
  return "one_off";
}
function pricingFromUiType(
  t: DisplayType,
): "standard" | "monthly" | "annual" | "optional" {
  // Beta-1 adapter: UI "one_off" → current enum "standard". Beta-2 renames.
  if (t === "monthly") return "monthly";
  if (t === "annual") return "annual";
  if (t === "optional") return "optional";
  return "standard";
}

function inputVisual(
  inp: QuoteInput,
): { bg: string; color: string; label: string } {
  const isVoiceNote = inp.inputType === "audio" && inp.content && !inp.fileUrl;
  if (isVoiceNote) return { bg: "#fef3c7", color: "#b45309", label: "VOICE" };
  if (inp.inputType === "pdf") return { bg: "#f0fdfa", color: "#0d9488", label: "PDF" };
  if (inp.inputType === "image") return { bg: "#eff6ff", color: "#3b82f6", label: "IMG" };
  if (inp.inputType === "audio") return { bg: "#fef3c7", color: "#b45309", label: "AUDIO" };
  if (inp.inputType === "email") return { bg: "#f5f3ff", color: "#8b5cf6", label: "EML" };
  return { bg: "#eff6ff", color: "#3b82f6", label: "TXT" };
}

function inputTitle(inp: QuoteInput): string {
  if (inp.filename) return inp.filename;
  if (inp.inputType === "audio" && inp.content && !inp.fileUrl) return "Voice note";
  if (inp.inputType === "text") return "Text note";
  return "Evidence";
}

function inputSubtitle(inp: QuoteInput): string {
  if (inp.processingStatus === "processing") return "Analysing…";
  if (inp.processingStatus === "failed" || inp.processingStatus === "error") {
    return "Analysis failed";
  }
  if (inp.inputType === "audio" && inp.content && !inp.fileUrl) return "Dictated";
  if (inp.inputType === "pdf") return "PDF document";
  if (inp.inputType === "image") return "Image";
  if (inp.inputType === "audio") return "Audio recording";
  if (inp.inputType === "text") return "Pasted text";
  return inp.inputType;
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const result = reader.result as string;
      // result is "data:<mime>;base64,<data>" — strip the prefix
      const comma = result.indexOf(",");
      resolve(comma >= 0 ? result.slice(comma + 1) : result);
    };
    reader.onerror = () => reject(reader.error || new Error("Read failed"));
    reader.readAsDataURL(file);
  });
}

function detectInputType(
  file: File,
): "pdf" | "image" | "audio" | "document" | "email" {
  const mt = file.type || "";
  if (mt === "application/pdf" || file.name.toLowerCase().endsWith(".pdf")) {
    return "pdf";
  }
  if (mt.startsWith("image/")) return "image";
  if (mt.startsWith("audio/")) return "audio";
  if (
    mt === "message/rfc822" ||
    file.name.toLowerCase().endsWith(".eml") ||
    file.name.toLowerCase().endsWith(".msg")
  ) {
    return "email";
  }
  return "document";
}

// ─── Main component ───────────────────────────────────────────────────────

export default function QuoteWorkspace() {
  const params = useParams<{ id: string }>();
  const quoteId = parseInt(params.id || "0", 10);
  const [, setLocation] = useLocation();

  // ── Queries ──
  const {
    data: fullQuote,
    isLoading,
    refetch,
  } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    {
      enabled: quoteId > 0,
      // Smart background polling: while any uploaded piece of evidence is
      // still being analysed server-side (processingStatus === "processing")
      // re-fetch every 3 seconds so the UI picks up the completion event
      // without the user needing to refresh the page. As soon as every
      // input has settled (completed / failed), the callback returns false
      // and polling stops automatically — idle pages do not hit the server.
      refetchInterval: (query) => {
        const data = query.state.data as { inputs?: Array<{ processingStatus?: string | null }> } | undefined;
        const inputs = data?.inputs ?? [];
        const anyProcessing = inputs.some(
          (i) => i?.processingStatus === "processing",
        );
        return anyProcessing ? 3000 : false;
      },
    },
  );
  const { data: catalogItemsRaw } = trpc.catalog.list.useQuery();
  // Chunk 3 Delivery B — refresh the catalogue list (used by the Change▾
  // picker on every row) the moment a new item saves, so it's pickable
  // without a page reload.
  const trpcUtils = trpc.useUtils();

  const quote = (fullQuote?.quote ?? null) as Record<string, unknown> | null;
  const inputs = useMemo<QuoteInput[]>(
    () => ((fullQuote?.inputs || []) as unknown) as QuoteInput[],
    [fullQuote?.inputs],
  );
  const lineItems = useMemo<LineItem[]>(
    () => ((fullQuote?.lineItems || []) as unknown) as LineItem[],
    [fullQuote?.lineItems],
  );
  const catalogItems = useMemo<CatalogItemRef[]>(
    () => ((catalogItemsRaw || []) as unknown) as CatalogItemRef[],
    [catalogItemsRaw],
  );

  // Phase 4A Delivery 5 — subscription tier read, drives the Solo upgrade
  // modal intercept on the Generate PDF button. Silently permissive if the
  // query is still loading or errors: the upgrade modal is a soft sell, not
  // a security gate, and we never want it to block the PDF button.
  const { data: subscriptionStatus } = trpc.subscription.status.useQuery(
    undefined,
    {
      staleTime: 60_000,
      // Never retry aggressively — if Stripe/DB is flaky, we just act like
      // the user is on Pro+ and let the PDF flow run as normal.
      retry: false,
    },
  );
  const currentTier = (subscriptionStatus as any)?.tier as
    | "trial"
    | "solo"
    | "pro"
    | "team"
    | undefined;
  const isSoftGatedTier = currentTier === "solo" || currentTier === "trial";

  // ── Derived ──
  const isComprehensive = (quote as any)?.quoteMode === "comprehensive";
  const tradePreset = ((quote as any)?.tradePreset as string | null) || null;
  const showFallback = isComprehensive && tradePreset !== "electrical";
  const isState2 = lineItems.length > 0;
  // Chunk 3 Delivery F — one-shot re-generate gate. Counter is persisted
  // on the quote (0 = never generated, 1 = generated once, 2 = re-generated
  // and locked). UI reads this to decide the button label and whether a
  // confirmation dialog is needed before running generation.
  const generationCount = Number(
    (quote as any)?.generationCount ?? 0,
  );

  // ── Session state ──
  const [sourceInputMap, setSourceInputMap] = useState<Record<number, number[]>>(
    {},
  );
  const [activeInputId, setActiveInputId] = useState<number | null>(null);
  const [activeLineItemId, setActiveLineItemId] = useState<number | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  // Stage within the Generate Quote flow — drives the "Creating your quote…"
  // panel's rotating status text so the wait feels transparent instead of opaque.
  const [generateStage, setGenerateStage] = useState<
    "reading" | "building" | "finalising" | null
  >(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  // Phase 4A Delivery 38 — separate flag from PDF so both buttons
  // can disable independently while either generation is in flight.
  const [isGeneratingDOCX, setIsGeneratingDOCX] = useState(false);
  const [showMissingCostsModal, setShowMissingCostsModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
  // Chunk 3 Delivery F — controls the "Last chance to re-generate" dialog
  // shown whenever the user is about to burn their one-shot re-generation.
  const [showRegenerateConfirm, setShowRegenerateConfirm] = useState(false);
  // Chunk 3 Delivery B — dialog state for "Add to catalogue" on AI-estimated
  // rows. Holds the row the user clicked; when non-null, the dialog is open
  // and pre-filled from that row.
  const [addCatalogueSeed, setAddCatalogueSeed] =
    useState<AddToCatalogueSeed | null>(null);
  // Chunk 3 Delivery H — controls the "Review before PDF" modal that
  // gates the Generate PDF action. When true, the modal shows the AI's
  // Terms / Exclusions / Assumptions for the user to eyeball and edit.
  // On confirm inside the modal, we fall through to the original PDF
  // generation path (missing-costs guard first, then doGeneratePDF).
  const [showPrePDFModal, setShowPrePDFModal] = useState(false);
  // Phase 4A Delivery 5 — Solo upgrade modal. Fires BEFORE the review
  // modal when the user is on a soft-gated tier (solo / trial). From the
  // upgrade modal the user can choose to route to /pricing, or fall
  // through to the existing PDF flow via "Download basic PDF".
  const [showSoloUpgradeModal, setShowSoloUpgradeModal] = useState(false);
  // Phase 4A Delivery 6 — Export format picker modal. Fires on Generate
  // PDF for Pro / Team tiers, giving the user a choice of output format
  // (Quick quote / Contract-Tender / Project-Migration). Only Quick
  // quote is wired today — the other two cards are greyed "Coming soon"
  // until Delivery 7 (branded renderer) and later work land.
  const [showFormatPickerModal, setShowFormatPickerModal] = useState(false);
  // Phase 4A Delivery 7 — Brand Choice modal. Opens after the user picks
  // the Contract/Tender card in the format picker. Lets them choose
  // between "use your branding" (AI-extracted brand tokens) and "use
  // template defaults" (built-in navy/violet palette).
  const [showBrandChoiceModal, setShowBrandChoiceModal] = useState(false);
  // Phase 4A Delivery 24 — Branded review gate. After the user commits
  // their branding + template choice in BrandChoiceModal, we intercept
  // the generate call, stash the chosen options, and open the
  // ReviewBeforeGenerateModal in "branded" mode. The actual mutation
  // fires from handleBrandedReviewConfirmed once the review modal is
  // confirmed (and any per-section saves have resolved).
  const [showBrandedReviewModal, setShowBrandedReviewModal] = useState(false);
  const [pendingBrandChoice, setPendingBrandChoice] = useState<
    { mode: BrandMode; template: DesignTemplate } | null
  >(null);
  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // ── Controlled field state ──
  //
  // These five fields can be written by EITHER the user (typing) OR the
  // server (auto-title from upload, AI-extracted clientName/contactName/
  // clientEmail from generateDraft, AI-generated description). We need
  // the inputs to pick up server-side updates without overwriting the
  // user's in-progress typing.
  //
  // Pattern: track per-field `userEdited` flags in a ref. On quote
  // refetch, only snap a field's local state to the server value if the
  // user hasn't edited it since the component mounted. Once the user
  // types in a field, it's "theirs" for the rest of the session —
  // subsequent refetches don't clobber their work.
  const [titleLocal, setTitleLocal] = useState("");
  const [clientNameLocal, setClientNameLocal] = useState("");
  const [clientEmailLocal, setClientEmailLocal] = useState("");
  const [contactNameLocal, setContactNameLocal] = useState("");
  const [descriptionLocal, setDescriptionLocal] = useState("");
  const userEdited = useRef({
    title: false,
    clientName: false,
    clientEmail: false,
    contactName: false,
    description: false,
  });

  useEffect(() => {
    if (!quote) return;
    const q = quote as any;
    if (!userEdited.current.title) {
      setTitleLocal((q.title as string) || "");
    }
    if (!userEdited.current.clientName) {
      setClientNameLocal((q.clientName as string) || "");
    }
    if (!userEdited.current.clientEmail) {
      setClientEmailLocal((q.clientEmail as string) || "");
    }
    if (!userEdited.current.contactName) {
      setContactNameLocal((q.contactName as string) || "");
    }
    if (!userEdited.current.description) {
      setDescriptionLocal((q.description as string) || "");
    }
  }, [quote]);

  // ── Mutations — evidence ──
  const createInput = trpc.inputs.create.useMutation({
    onSuccess: () => void refetch(),
  });
  const uploadFile = trpc.inputs.uploadFile.useMutation({
    onSuccess: () => void refetch(),
  });
  const deleteInput = trpc.inputs.delete.useMutation({
    onSuccess: () => void refetch(),
  });

  // ── Mutations — quote flow ──
  // Beta-2 Chunk 2b-i: parseDictationSummary is no longer called from the
  // client — generateDraft runs the engine inline server-side in one round-trip.
  const generateDraft = trpc.ai.generateDraft.useMutation();
  const updateQuote = trpc.quotes.update.useMutation();
  const updateStatus = trpc.quotes.updateStatus.useMutation({
    onSuccess: () => void refetch(),
  });
  const generatePDF = trpc.quotes.generatePDF.useMutation();
  // Phase 4A Delivery 38 — Word doc export mutation. Mirrors the
  // generatePDF hook one-to-one; the actual download is triggered
  // client-side by decoding the returned base64 to a Blob.
  const generateDOCX = trpc.quotes.generateDOCX.useMutation();
  // Phase 4A Delivery 7 — branded Contract/Tender proposal. Separate
  // endpoint, does not touch generatePDF. Same return shape { html }.
  const generateBrandedProposal = trpc.quotes.generateBrandedProposal.useMutation();
  // Phase 4A Delivery 24 — org profile is read here so the
  // ReviewBeforeGenerateModal can show what the renderer would produce
  // (cascade-resolved values) when per-quote fields are blank. Cached
  // by tRPC so other components reading the same query share it.
  const { data: orgProfile } = trpc.auth.orgProfile.useQuery();

  // ── Mutations — line items ──
  const createLineItem = trpc.lineItems.create.useMutation({
    onSuccess: () => void refetch(),
  });
  const updateLineItem = trpc.lineItems.update.useMutation();
  const deleteLineItem = trpc.lineItems.delete.useMutation({
    onSuccess: () => void refetch(),
  });

  // Refetch once after any line-item update settles (for totals)
  const refetchAfterUpdate = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefetch = useCallback(() => {
    if (refetchAfterUpdate.current) clearTimeout(refetchAfterUpdate.current);
    refetchAfterUpdate.current = setTimeout(() => void refetch(), 600);
  }, [refetch]);
  useEffect(() => {
    return () => {
      if (refetchAfterUpdate.current) clearTimeout(refetchAfterUpdate.current);
    };
  }, []);

  // ── Auto-save for the quote-level fields ──
  const quoteSaveFn = useCallback(
    async (patch: {
      clientName?: string;
      clientEmail?: string;
      contactName?: string;
      description?: string;
      title?: string;
    }) => {
      await updateQuote.mutateAsync({ id: quoteId, ...patch });
    },
    [quoteId, updateQuote],
  );
  const quoteAutoSave = useAutoSave<{
    clientName?: string;
    clientEmail?: string;
    contactName?: string;
    description?: string;
    title?: string;
  }>(quoteSaveFn, 500);

  // Aggregate "any pending autosave work" indicator
  const anySaving =
    quoteAutoSave.isPending ||
    updateLineItem.isPending ||
    deleteLineItem.isPending;

  // ── Totals ──
  const totals = useMemo(() => {
    let oneOff = 0;
    let monthly = 0;
    let annual = 0;
    let optional = 0;
    for (const li of lineItems) {
      const total =
        parseNum(li.total) || parseNum(li.quantity) * parseNum(li.rate);
      const pt = li.pricingType || "standard";
      if (pt === "monthly") monthly += total;
      else if (pt === "annual") annual += total;
      else if (pt === "optional") optional += total;
      else oneOff += total;
    }
    return { oneOff, monthly, annual, optional };
  }, [lineItems]);

  // ── Highlighting derived sets ──
  const highlightedLineItemIds = useMemo<Set<number>>(() => {
    if (activeInputId == null) return new Set<number>();
    const s = new Set<number>();
    for (const [lidStr, ids] of Object.entries(sourceInputMap)) {
      if (ids.includes(activeInputId)) s.add(parseInt(lidStr, 10));
    }
    return s;
  }, [activeInputId, sourceInputMap]);

  const highlightedInputIds = useMemo<Set<number>>(() => {
    if (activeLineItemId == null) return new Set<number>();
    const ids = sourceInputMap[activeLineItemId];
    return new Set(ids || []);
  }, [activeLineItemId, sourceInputMap]);

  // ── Handlers — evidence ──
  const handleFileChoose = () => fileInputRef.current?.click();

  // Accepted file extensions — must stay in sync with the hidden input's
  // `accept` attribute below. Drag-and-drop bypasses that attribute, so we
  // validate client-side before upload.
  const ACCEPTED_EXTS = [
    ".pdf", ".jpg", ".jpeg", ".png", ".gif", ".webp", ".bmp",
    ".mp3", ".wav", ".m4a", ".ogg", ".webm",
    ".eml", ".msg",
  ];
  const isAcceptedFile = (file: File): boolean => {
    const lower = file.name.toLowerCase();
    return ACCEPTED_EXTS.some((ext) => lower.endsWith(ext));
  };

  // Guard against concurrent batch uploads (click-to-browse + drag drop
  // racing each other). A ref avoids React state stale-closure issues.
  const uploadInFlightRef = useRef(false);

  const handleFiles = async (files: File[]) => {
    if (files.length === 0) return;
    if (uploadInFlightRef.current) {
      toast.error("Another upload is still in progress — try again in a moment");
      return;
    }

    // Split accepted / rejected by extension
    const accepted: File[] = [];
    const rejected: string[] = [];
    for (const f of files) {
      if (isAcceptedFile(f)) accepted.push(f);
      else rejected.push(f.name);
    }
    if (rejected.length > 0) {
      toast.error(
        rejected.length === 1
          ? `Unsupported file: ${rejected[0]}`
          : `Unsupported files skipped: ${rejected.join(", ")}`,
      );
    }
    if (accepted.length === 0) {
      if (fileInputRef.current) fileInputRef.current.value = "";
      return;
    }

    uploadInFlightRef.current = true;
    setUploadingFile(true);

    // Upload pool — process up to UPLOAD_CONCURRENCY files at a time rather
    // than strictly one-at-a-time. Four files on typical broadband used to
    // mean ~4× the big-bar animation time; the pool cuts that to roughly
    // one-file-worth for small batches. The cap prevents a 20-file drop
    // from hammering R2 / the server with 20 simultaneous uploads.
    const UPLOAD_CONCURRENCY = 3;
    const results: Array<{ index: number; success: boolean }> = [];
    const uploadSingle = async (file: File, index: number): Promise<void> => {
      try {
        const base64 = await fileToBase64(file);
        const inputType = detectInputType(file);
        await uploadFile.mutateAsync({
          quoteId,
          filename: file.name,
          contentType: file.type || "application/octet-stream",
          base64Data: base64,
          inputType,
        });
        results.push({ index, success: true });
      } catch (err) {
        const msg = err instanceof Error ? err.message : "upload failed";
        toast.error(`${file.name}: ${msg}`);
        results.push({ index, success: false });
      }
    };

    let firstSuccessfulFilename: string | null = null;
    let successCount = 0;
    try {
      // Shared queue of files. Workers pull the next file off the front
      // until the queue is empty. Order-independent — results carry the
      // original index so we can derive the "first successful" filename
      // by original drop order, not completion order (matters for the
      // auto-title below).
      const queue = accepted.map((file, idx) => ({ file, idx }));
      const worker = async (): Promise<void> => {
        while (queue.length > 0) {
          const next = queue.shift();
          if (!next) return;
          await uploadSingle(next.file, next.idx);
        }
      };
      const workerCount = Math.min(UPLOAD_CONCURRENCY, accepted.length);
      const workers: Promise<void>[] = [];
      for (let i = 0; i < workerCount; i++) {
        workers.push(worker());
      }
      await Promise.all(workers);

      // First successful filename in ORIGINAL drop order (not completion order).
      const firstSuccess = results
        .filter((r) => r.success)
        .sort((a, b) => a.index - b.index)[0];
      firstSuccessfulFilename = firstSuccess
        ? accepted[firstSuccess.index].name
        : null;
      successCount = results.filter((r) => r.success).length;

      if (successCount === 1 && accepted.length === 1) {
        toast.success(`${accepted[0].name} uploaded`);
      } else if (successCount > 0) {
        toast.success(`${successCount} file${successCount === 1 ? "" : "s"} uploaded`);
      }

      // Auto-title: if the user hasn't edited the title and it's still the
      // default "New quote" (or empty), set it to the first successfully
      // uploaded file's name minus extension. One-shot — further uploads
      // won't re-trigger because the title won't match the default.
      if (firstSuccessfulFilename) {
        const currentTitle = ((quote as any)?.title as string || "").trim();
        const isDefault =
          !currentTitle ||
          currentTitle === "New Quote" ||
          currentTitle === "New quote";
        if (!userEdited.current.title && isDefault) {
          const baseName = firstSuccessfulFilename.replace(/\.[^/.]+$/, "");
          try {
            await updateQuote.mutateAsync({ id: quoteId, title: baseName });
          } catch (err) {
            console.warn("[QuoteWorkspace] auto-title failed:", err);
          }
        }
      }
    } finally {
      setUploadingFile(false);
      uploadInFlightRef.current = false;
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files ? Array.from(e.target.files) : [];
    void handleFiles(files);
  };

  const handleAddPaste = async () => {
    const text = pasteText.trim();
    if (!text) return;
    try {
      await createInput.mutateAsync({
        quoteId,
        inputType: "text",
        content: text,
      });
      setPasteText("");
      toast.success("Text added");
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Failed to add text");
    }
  };

  const handleAddVoiceTranscript = async (text: string) => {
    const trimmed = text.trim();
    if (!trimmed) return;
    try {
      await createInput.mutateAsync({
        quoteId,
        inputType: "audio",
        content: trimmed,
        filename: `Voice note ${new Date().toLocaleTimeString()}`,
      });
      toast.success("Voice note added");
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Failed to add voice note",
      );
    }
  };

  const handleDeleteInput = async (inputId: number) => {
    try {
      await deleteInput.mutateAsync({ id: inputId, quoteId });
      if (activeInputId === inputId) setActiveInputId(null);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  // ── Handler — Generate Quote ──
  const handleGenerate = async () => {
    if (inputs.length === 0) {
      toast.error("Add some evidence first");
      return;
    }
    const stillProcessing = inputs.some(
      (i) => i.processingStatus === "processing",
    );
    if (stillProcessing) {
      toast.error("Wait for evidence to finish analysing");
      return;
    }

    // Beta-2 Chunk 2b-i: one round-trip. The server now runs the engine
    // inline and materialises line items in a single mutation. The three
    // wait-screen stages ("reading" → "building" → "finalising") advance
    // on timers during the call so the UX matches what users are used to;
    // "finalising" still flips on real completion just before refetch.
    setIsGenerating(true);
    setGenerateStage("reading");
    const stageTimers: ReturnType<typeof setTimeout>[] = [];
    stageTimers.push(
      setTimeout(() => setGenerateStage("building"), 1500),
    );
    try {
      const result = await generateDraft.mutateAsync({ quoteId });
      // Clear any still-pending stage timers before flipping to finalising.
      stageTimers.forEach((t) => clearTimeout(t));
      stageTimers.length = 0;

      const map = (result as any)?.sourceInputMap;
      // Diagnostic: log the map so we can see if the engine emitted
      // sourceInputIds on materials. If the map is {} on a real-looking
      // quote, the AI didn't follow the [INPUT_ID: N] prefix instruction.
      // If the map is populated but highlighting doesn't fire on click,
      // there's a frontend state bug. Remove once Beta-1 highlighting is
      // confirmed working across all evidence types.
      console.log(
        "[QuoteWorkspace] generateDraft returned sourceInputMap:",
        map,
        "for",
        Object.keys(map || {}).length,
        "line items",
      );
      if (map && typeof map === "object") {
        setSourceInputMap(map as Record<number, number[]>);
      }

      setGenerateStage("finalising");
      toast.success("Quote generated");
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't generate the quote",
      );
    } finally {
      stageTimers.forEach((t) => clearTimeout(t));
      setIsGenerating(false);
      setGenerateStage(null);
    }
  };

  // ── Handler — Request Re-generate (opens confirm dialog) ──
  // Chunk 3 Delivery F. Called when the user clicks the Re-generate button.
  // Runs the same pre-flight checks handleGenerate does, then opens the
  // confirmation dialog instead of generating directly. The dialog's
  // confirm button calls handleGenerate.
  const handleRequestRegenerate = () => {
    if (inputs.length === 0) {
      toast.error("Add some evidence first");
      return;
    }
    const stillProcessing = inputs.some(
      (i) => i.processingStatus === "processing",
    );
    if (stillProcessing) {
      toast.error("Wait for evidence to finish analysing");
      return;
    }
    setShowRegenerateConfirm(true);
  };

  // ── Handler — Request Add to catalogue ──
  // Chunk 3 Delivery B. Opens the pre-fill dialog for the clicked row.
  // Pulls the row's name (itemName if set, else first line of description
  // for legacy rows), plus all the pricing fields the catalogue schema
  // cares about. The dialog keeps its own local form state so a failed
  // save (cap reached, duplicate name) never clears typed input.
  const handleRequestAddToCatalogue = useCallback((row: LineItem) => {
    const fallbackName = (row.description || "")
      .split("\n")[0]
      .trim()
      .slice(0, 120);
    const resolvedName = (row.itemName || "").trim() || fallbackName;
    setAddCatalogueSeed({
      name: resolvedName,
      description: row.description,
      unit: row.unit,
      rate: row.rate,
      costPrice: row.costPrice ?? null,
      pricingType: row.pricingType,
    });
  }, []);

  const handleConfirmRegenerate = () => {
    setShowRegenerateConfirm(false);
    void handleGenerate();
  };

  // ── Handlers — line item edits (debounced auto-save) ──
  const rowTimers = useRef<Map<number, ReturnType<typeof setTimeout>>>(
    new Map(),
  );
  const rowPending = useRef<Map<number, Record<string, unknown>>>(new Map());

  const saveLineItem = useCallback(
    (id: number, patch: Record<string, unknown>, delayMs = 500) => {
      const existing = rowPending.current.get(id) || {};
      rowPending.current.set(id, { ...existing, ...patch });

      const prev = rowTimers.current.get(id);
      if (prev) clearTimeout(prev);

      const timer = setTimeout(async () => {
        const queued = rowPending.current.get(id);
        rowPending.current.delete(id);
        rowTimers.current.delete(id);
        if (!queued) return;
        try {
          await updateLineItem.mutateAsync({
            id,
            quoteId,
            ...(queued as any),
          });
          scheduleRefetch();
        } catch (err) {
          toast.error(err instanceof Error ? err.message : "Save failed");
        }
      }, delayMs);
      rowTimers.current.set(id, timer);
    },
    [quoteId, updateLineItem, scheduleRefetch],
  );

  useEffect(() => {
    const timersAtMount = rowTimers.current;
    return () => {
      timersAtMount.forEach((t) => clearTimeout(t));
      timersAtMount.clear();
    };
  }, []);

  const handleDeleteLineItem = async (id: number) => {
    try {
      await deleteLineItem.mutateAsync({ id, quoteId });
      if (activeLineItemId === id) setActiveLineItemId(null);
      setSourceInputMap((prev) => {
        if (!(id in prev)) return prev;
        const next = { ...prev };
        delete next[id];
        return next;
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Delete failed");
    }
  };

  const handleAddLineItem = async () => {
    try {
      await createLineItem.mutateAsync({
        quoteId,
        description: "New item",
        quantity: "1",
        unit: "each",
        rate: "0",
      });
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Couldn't add item");
    }
  };

  const applyCatalogItemToRow = (row: LineItem, cat: CatalogItemRef) => {
    // Full field mapping from catalog to line item. QTY is explicitly left
    // alone — the user has already committed to a quantity, only the item
    // identity changes. Total is recomputed by the row's memo from the new
    // rate × existing quantity.
    //
    // Description uses the same "Name — Description" convention as the AI
    // engine (generalEngine.ts line item building) so quotes look consistent
    // whether lines came from AI or from catalog.
    const combinedDescription = cat.description
      ? `${cat.name} — ${cat.description}`
      : cat.name;

    const patch: Record<string, unknown> = {
      description: combinedDescription,
      unit: cat.unit || "each",
    };
    if (cat.defaultRate !== null && cat.defaultRate !== undefined) {
      patch.rate = cat.defaultRate;
    }
    if (cat.costPrice !== null && cat.costPrice !== undefined) {
      patch.costPrice = cat.costPrice;
    }
    if (cat.category) {
      patch.category = cat.category;
    }
    if (cat.pricingType) {
      patch.pricingType = cat.pricingType;
    }
    saveLineItem(row.id, patch, 0);
  };

  // ── Handlers — PDF ──
  // Chunk 3 Delivery H — the Generate PDF button no longer generates
  // immediately. It first opens the review modal; only after the user
  // confirms in the modal do we run the missing-costs guard and then
  // actually generate. The missing-costs guard is intentionally AFTER
  // the review so the user can't accidentally edit their terms, hit
  // Generate, then get stopped by a £0 row and lose their mental
  // context of where they were.
  //
  // Phase 4A Delivery 5 — additional gate: if the user is on a soft-
  // gated tier (solo / trial), open the Solo upgrade modal first. That
  // modal's "Download basic PDF" action then falls through to the
  // review modal so Solo users keep their current PDF output.
  //
  // Phase 4A Delivery 6 — Pro / Team users see the format picker first.
  // The Quick quote card in that picker then falls through to the
  // review modal, preserving the original flow exactly. Contract-
  // Tender and Project-Migration cards are greyed "Coming soon".
  const handleGeneratePDFClick = () => {
    if (isSoftGatedTier) {
      setShowSoloUpgradeModal(true);
      return;
    }
    setShowFormatPickerModal(true);
  };

  // Phase 4A Delivery 38 — Word doc export handler. Tier-gated like
  // PDF (Solo / Trial users see the upgrade modal first), but does
  // NOT route through the format-picker or review-before-PDF modals
  // — Word is a quick-export format, not a polished sign-and-send
  // output, so we go straight to the mutation.
  //
  // The browser download is built by decoding the base64 to a Blob,
  // creating an object URL, simulating a click on a hidden anchor,
  // then revoking the URL on next tick. Standard pattern.
  const handleGenerateDOCXClick = async () => {
    if (isSoftGatedTier) {
      setShowSoloUpgradeModal(true);
      return;
    }
    setIsGeneratingDOCX(true);
    try {
      const result = await generateDOCX.mutateAsync({ id: quoteId });
      const base64 = (result as any).base64 as string;
      const filename = (result as any).filename as string;
      // base64 → bytes → Blob. We don't use fetch's data: URL because
      // larger docs (multi-page proposals) push that path past
      // browser URL length limits.
      const bytes = Uint8Array.from(atob(base64), (c) => c.charCodeAt(0));
      const blob = new Blob([bytes], {
        type: "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      });
      const url = URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      setTimeout(() => URL.revokeObjectURL(url), 0);
    } catch (err) {
      console.error("[handleGenerateDOCXClick] Error:", err);
      // Quiet failure — the mutation itself surfaces a server error
      // toast via tRPC's default error handler.
    } finally {
      setIsGeneratingDOCX(false);
    }
  };

  // Phase 4A Delivery 5 — Solo upgrade modal handlers.
  const handleSoloUpgradeCTA = () => {
    setShowSoloUpgradeModal(false);
    setLocation("/pricing");
  };
  const handleSoloUpgradeContinueBasic = () => {
    setShowSoloUpgradeModal(false);
    // Fall through to the existing PDF flow — same path Pro+ users take.
    setShowPrePDFModal(true);
  };

  // Phase 4A Delivery 6 — format picker handler. Quick quote is the
  // only active card; it falls straight through to the review-before-
  // PDF modal, preserving the original PDF flow exactly.
  const handlePickerSelectQuickQuote = () => {
    setShowFormatPickerModal(false);
    setShowPrePDFModal(true);
  };

  // Phase 4A Delivery 7 — Contract/Tender card handler. Closes the
  // picker and opens the Brand Choice modal. The branded renderer does
  // NOT run the review-before-PDF (T/E/A) flow — the branded render is
  // meant to be the "polished sign-and-send" output, and any tender
  // context is already baked into the saved quote.
  const handlePickerSelectContractTender = () => {
    setShowFormatPickerModal(false);
    setShowBrandChoiceModal(true);
  };

  // Phase 4A Delivery 7 — "← Back" on the Brand Choice modal returns
  // the user to the format picker (stage 1).
  const handleBrandChoiceBack = () => {
    setShowBrandChoiceModal(false);
    setShowFormatPickerModal(true);
  };

  // Phase 4A Delivery 24 — when the user clicks "Generate proposal" in
  // BrandChoiceModal, we don't fire the mutation immediately. We stash
  // the chosen brand mode + template, close the brand modal, and open
  // the ReviewBeforeGenerateModal in "branded" mode. The actual
  // mutation fires from handleBrandedReviewConfirmed once the review
  // gate is confirmed. Mirrors the Quick Quote flow where
  // PreGeneratePDFModal sat between the Generate-PDF button and the
  // actual generator.
  const handleBrandChoiceCommitted = (
    mode: BrandMode,
    template: DesignTemplate,
  ) => {
    setPendingBrandChoice({ mode, template });
    setShowBrandChoiceModal(false);
    setShowBrandedReviewModal(true);
  };

  const handleBrandedReviewConfirmed = () => {
    setShowBrandedReviewModal(false);
    if (!pendingBrandChoice) return;
    const { mode, template } = pendingBrandChoice;
    setPendingBrandChoice(null);
    void doGenerateBranded(mode, template);
  };

  // Phase 4A Delivery 7 — fire the branded proposal mutation and open
  // the resulting HTML in a print window, same mechanism as the Quick
  // quote path.
  // Phase 4A Delivery 17 — accepts the design template chosen in the
  // BrandChoiceModal and passes it through to the server, which
  // resolves the effective template (override → quote → org → 'modern')
  // and persists per-quote overrides for re-generations.
  // Phase 4A Delivery 24 — invocation moved behind the
  // ReviewBeforeGenerateModal gate; called from
  // handleBrandedReviewConfirmed rather than directly from
  // BrandChoiceModal.
  const doGenerateBranded = async (mode: BrandMode, template: DesignTemplate) => {
    try {
      const result = await generateBrandedProposal.mutateAsync({
        quoteId,
        brandMode: mode,
        proposalTemplate: template,
      });
      if (!(result as any)?.html) {
        throw new Error("No HTML content received from server");
      }
      const printWindow = window.open("", "_blank");
      if (!printWindow) {
        toast.error("Please allow popups to generate the proposal");
        return;
      }
      printWindow.document.write((result as any).html);
      printWindow.document.close();
      printWindow.onload = () => {
        setTimeout(() => printWindow.print(), 250);
      };
      // Close the Brand Choice modal once the print window has fired.
      setShowBrandChoiceModal(false);
      // Optimistically flip status to pdf_generated. A failed flip does
      // not block the download — the status-transition validator may
      // refuse certain current-state transitions and that's OK.
      const currentStatus = (quote as any)?.status as string | undefined;
      if (currentStatus && currentStatus !== "pdf_generated") {
        try {
          await updateStatus.mutateAsync({
            id: quoteId,
            status: "pdf_generated",
          });
        } catch (err) {
          console.warn(
            "[QuoteWorkspace] pdf_generated status flip failed:",
            err,
          );
        }
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Branded proposal generation failed",
      );
    }
  };

  // Called from inside the review modal once saves have completed.
  // Closes the modal and falls through to the original PDF flow.
  const handlePrePDFConfirmed = () => {
    setShowPrePDFModal(false);
    const missingCount = lineItems.filter(
      (li) => parseNum(li.rate) === 0,
    ).length;
    if (missingCount > 0) {
      setShowMissingCostsModal(true);
    } else {
      void doGeneratePDF();
    }
  };

  const doGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    setShowMissingCostsModal(false);
    try {
      const result = await generatePDF.mutateAsync({ id: quoteId });
      if (!(result as any)?.html) {
        throw new Error("No HTML content received from server");
      }
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write((result as any).html);
        printWindow.document.close();
        printWindow.onload = () => {
          setTimeout(() => printWindow.print(), 250);
        };
        // Flip status → pdf_generated. A failed flip must not block the
        // download — the status-transition validator may refuse certain
        // current-state transitions and that's OK.
        const currentStatus = (quote as any)?.status as string | undefined;
        if (currentStatus && currentStatus !== "pdf_generated") {
          try {
            await updateStatus.mutateAsync({
              id: quoteId,
              status: "pdf_generated",
            });
          } catch (err) {
            console.warn(
              "[QuoteWorkspace] pdf_generated status flip failed:",
              err,
            );
          }
        }
      } else {
        toast.error("Please allow popups to generate the PDF");
      }
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "PDF generation failed",
      );
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  // ── Highlight handlers ──
  const handleInputClick = (inputId: number) => {
    if (activeInputId === inputId) {
      setActiveInputId(null);
    } else {
      setActiveInputId(inputId);
      setActiveLineItemId(null);
    }
  };
  const handleLineItemClick = (lineItemId: number) => {
    if (activeLineItemId === lineItemId) {
      setActiveLineItemId(null);
    } else {
      setActiveLineItemId(lineItemId);
      setActiveInputId(null);
    }
  };

  // ─── Render guards ─────────────────────────────────────────────────────

  if (isLoading) {
    return (
      <div className="flex items-center justify-center h-96 text-muted-foreground">
        <Loader2 className="h-5 w-5 animate-spin mr-2" />
        Loading quote…
      </div>
    );
  }

  if (!fullQuote || !quote) {
    return (
      <div className="flex items-center justify-center h-96 text-destructive gap-2">
        <AlertCircle className="h-5 w-5" />
        Quote not found
      </div>
    );
  }

  if (showFallback) {
    return <ComprehensiveFallback onBack={() => setLocation("/dashboard")} />;
  }

  // ─── Main layout ───────────────────────────────────────────────────────

  // Title + clientName now come from controlled state (titleLocal / clientNameLocal),
  // which is seeded from the server and synced on refetch.

  return (
    <div
      className="flex flex-col h-[calc(100vh-8rem)]"
      style={{ backgroundColor: brand.slate }}
    >
      {/* ── Title bar ──────────────────────────────────────────────────
          Chunk 3 Delivery G — the editable quote-title field moved into
          the light green client card below. The title bar is now just a
          back-button on the left and the save-state indicator on the
          right so the user has a quiet, stable chrome above the
          workspace content. */}
      {/* Phase 4A Delivery 38 — top bar gained two action buttons:
          Generate PDF (moved up from the footer where it was clipping
          the line-items table on smaller windows) and Generate Word.
          Both are wired to the existing Pro/Team-gated handlers; tier
          gating routes via SoloUpgradeModal exactly like before. */}
      <div
        className="flex items-center justify-between px-6 py-3 bg-white border-b"
        style={{ borderColor: brand.border }}
      >
        <button
          onClick={() => setLocation("/dashboard")}
          className="inline-flex items-center gap-1.5 text-sm hover:opacity-80"
          style={{ color: brand.navyMuted }}
        >
          <ArrowLeft className="w-4 h-4" />
          Dashboard
        </button>
        <div className="flex items-center gap-3">
          <div
            className="flex items-center gap-3 text-xs"
            style={{ color: brand.navyMuted }}
          >
            {anySaving ? (
              <span className="inline-flex items-center gap-1.5">
                <Clock className="w-3 h-3 animate-pulse" />
                Saving…
              </span>
            ) : (
              <span className="inline-flex items-center gap-1.5">
                <span
                  className="inline-block w-1.5 h-1.5 rounded-full"
                  style={{ backgroundColor: brand.teal }}
                />
                All changes saved
              </span>
            )}
          </div>
          {/* D38 — Generate Word doc. Renders next to Generate PDF.
              Disabled while either generation is in flight or before
              any line items exist (parity with the old footer rule). */}
          <Button
            size="sm"
            variant="outline"
            onClick={handleGenerateDOCXClick}
            disabled={isGeneratingDOCX || isGeneratingPDF || lineItems.length === 0}
            style={{
              borderColor: brand.teal,
              color: brand.teal,
            }}
          >
            {isGeneratingDOCX ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Preparing…
              </>
            ) : (
              <>
                <FileText className="w-3.5 h-3.5 mr-1.5" />
                Generate Word
              </>
            )}
          </Button>
          {/* D38 — Generate PDF moved here from the per-quote footer.
              Same handler (handleGeneratePDFClick) so tier gating, the
              format picker, and the review modal all behave exactly
              as before. */}
          <Button
            size="sm"
            onClick={handleGeneratePDFClick}
            disabled={isGeneratingPDF || isGeneratingDOCX || lineItems.length === 0}
            className="text-white"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            {isGeneratingPDF ? (
              <>
                <Loader2 className="w-3.5 h-3.5 mr-1.5 animate-spin" />
                Preparing PDF…
              </>
            ) : (
              <>
                <Download className="w-3.5 h-3.5 mr-1.5" />
                Generate PDF
              </>
            )}
          </Button>
        </div>
      </div>

      {/* ── Two-panel body ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: "30%",
            backgroundColor: "#f7fbfc",
            borderRight: `1px solid ${brand.border}`,
          }}
        >
          <EvidencePanel
            inputs={inputs}
            activeInputId={activeInputId}
            highlightedInputIds={highlightedInputIds}
            onSelect={handleInputClick}
            onDelete={handleDeleteInput}
            onFileChoose={handleFileChoose}
            onFilesDropped={handleFiles}
            onAddVoiceTranscript={handleAddVoiceTranscript}
            onAddPaste={handleAddPaste}
            pasteText={pasteText}
            setPasteText={setPasteText}
            uploadingFile={uploadingFile}
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp3,.wav,.m4a,.ogg,.webm,.eml,.msg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          {!isState2 ? (
            <EmptyStatePanel
              onGenerate={handleGenerate}
              onRequestRegenerate={handleRequestRegenerate}
              isGenerating={isGenerating}
              generateStage={generateStage}
              evidenceCount={inputs.length}
              generationCount={generationCount}
            />
          ) : (
            <EditorPanel
              lineItems={lineItems}
              catalogItems={catalogItems}
              totals={totals}
              activeLineItemId={activeLineItemId}
              highlightedLineItemIds={highlightedLineItemIds}
              onLineItemClick={handleLineItemClick}
              clientNameValue={clientNameLocal}
              clientEmailValue={clientEmailLocal}
              contactNameValue={contactNameLocal}
              descriptionValue={descriptionLocal}
              onUpdateClientName={(v) => {
                userEdited.current.clientName = true;
                setClientNameLocal(v);
                quoteAutoSave.save({ clientName: v });
              }}
              onUpdateClientEmail={(v) => {
                userEdited.current.clientEmail = true;
                setClientEmailLocal(v);
                quoteAutoSave.save({ clientEmail: v });
              }}
              onUpdateContactName={(v) => {
                userEdited.current.contactName = true;
                setContactNameLocal(v);
                quoteAutoSave.save({ contactName: v });
              }}
              onUpdateDescription={(v) => {
                userEdited.current.description = true;
                setDescriptionLocal(v);
                quoteAutoSave.save({ description: v });
              }}
              onSaveLineItem={saveLineItem}
              onDeleteLineItem={handleDeleteLineItem}
              onAddLineItem={handleAddLineItem}
              onApplyCatalog={applyCatalogItemToRow}
              onGeneratePDF={handleGeneratePDFClick}
              isGeneratingPDF={isGeneratingPDF}
              addingLineItem={createLineItem.isPending}
              onRequestRegenerate={handleRequestRegenerate}
              generationCount={generationCount}
              isGenerating={isGenerating}
              titleValue={titleLocal}
              onUpdateTitle={(v) => {
                userEdited.current.title = true;
                setTitleLocal(v);
                quoteAutoSave.save({ title: v });
              }}
              onRequestAddToCatalogue={handleRequestAddToCatalogue}
            />
          )}
        </div>
      </div>

      <MissingCostsModal
        open={showMissingCostsModal}
        missingCount={
          lineItems.filter((li) => parseNum(li.rate) === 0).length
        }
        onCancel={() => setShowMissingCostsModal(false)}
        onContinue={() => void doGeneratePDF()}
      />

      {/* Chunk 3 Delivery F — confirmation dialog for the one-shot re-generate.
          Shown whenever the user clicks Re-generate, before any work happens.
          Copy is deliberately blunt about the consequences (wipe + locked). */}
      <AlertDialog
        open={showRegenerateConfirm}
        onOpenChange={setShowRegenerateConfirm}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Last chance to re-generate</AlertDialogTitle>
            <AlertDialogDescription>
              This will wipe every line item on this quote — including any
              you've edited, added, or priced manually — and rebuild it from
              the evidence currently attached. You cannot undo this, and you
              cannot re-generate this quote again. It's a one-shot to keep
              things fair across all tiers. If you need another fresh
              rebuild after this, duplicate the quote.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmRegenerate}
              style={{
                background:
                  "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
              }}
            >
              Yes, re-generate
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Chunk 3 Delivery B — pre-fill "Add to catalogue" dialog opened from
          the button on any AI-estimated row. Closes either via Cancel or
          after a successful save; on success we invalidate catalog.list so
          the Change▾ picker on every row sees the new entry immediately. */}
      <AddToCatalogueDialog
        open={addCatalogueSeed !== null}
        onOpenChange={(next) => {
          if (!next) setAddCatalogueSeed(null);
        }}
        seed={addCatalogueSeed}
        onSaved={() => {
          void trpcUtils.catalog.list.invalidate();
        }}
      />

      {/* Chunk 3 Delivery H — review-before-PDF modal. Sits between the
          Generate PDF button and the actual PDF generator, giving the
          user a last look at the Terms / Exclusions / Assumptions the
          AI produced. Passes the current saved values from fullQuote so
          the modal always reflects what's on disk (not stale local
          drafts), which matters if the user has had the workspace open
          for a while and regenerated / edited the quote in between.
          Phase 4A Delivery 24 — extended into a mode-aware
          ReviewBeforeGenerateModal. Quick Quote mode renders the same
          three sections (Terms / Exclusions / Assumptions) plus the
          new save-as-default checkboxes on Terms and Exclusions. */}
      <ReviewBeforeGenerateModal
        open={showPrePDFModal}
        onOpenChange={setShowPrePDFModal}
        quoteId={quoteId}
        mode="quick"
        initialTerms={(quote as any)?.terms ?? null}
        initialAssumptions={
          (fullQuote as any)?.tenderContext?.assumptions ?? null
        }
        initialExclusions={
          (fullQuote as any)?.tenderContext?.exclusions ?? null
        }
        orgDefaults={{
          defaultTerms: (orgProfile as any)?.defaultTerms ?? null,
          defaultExclusions: (orgProfile as any)?.defaultExclusions ?? null,
        }}
        onConfirm={handlePrePDFConfirmed}
      />

      {/* Phase 4A Delivery 24 — Branded review gate. Same component as
          the Quick Quote review above, but in "branded" mode it shows
          all eight sections that go on a Contract/Tender PDF (notes,
          terms, exclusions, assumptions, validUntil, paymentTerms,
          signatoryName, signatoryPosition). Save-as-default ticks
          write to organizations.brandedX so they don't bleed into
          Quick Quote defaults. */}
      <ReviewBeforeGenerateModal
        open={showBrandedReviewModal}
        onOpenChange={(open) => {
          setShowBrandedReviewModal(open);
          if (!open) setPendingBrandChoice(null);
        }}
        quoteId={quoteId}
        mode="branded"
        initialTerms={(quote as any)?.terms ?? null}
        initialAssumptions={
          (fullQuote as any)?.tenderContext?.assumptions ?? null
        }
        initialExclusions={
          (fullQuote as any)?.tenderContext?.exclusions ?? null
        }
        initialNotes={(fullQuote as any)?.tenderContext?.notes ?? null}
        initialValidUntil={(quote as any)?.validUntil ?? null}
        initialPaymentTerms={(quote as any)?.paymentTerms ?? null}
        initialSignatoryName={(quote as any)?.signatoryName ?? null}
        initialSignatoryPosition={
          (quote as any)?.signatoryPosition ?? null
        }
        // Phase 4A Delivery 29 — gate inputs and per-quote migration
        // overrides. The 6 migration sections only render in the modal
        // when tradePreset === 'it_services' AND migrationTypeSuggested
        // is one of the four valid types — same gate as the renderer.
        // For all other quotes the modal is identical to pre-D29.
        tradePreset={(quote as any)?.tradePreset ?? null}
        migrationTypeSuggested={
          (quote as any)?.migrationTypeSuggested ?? null
        }
        initialMigrationMethodology={
          (quote as any)?.migrationMethodology ?? null
        }
        initialMigrationPhases={(quote as any)?.migrationPhases ?? null}
        initialMigrationAssumptions={
          (quote as any)?.migrationAssumptions ?? null
        }
        initialMigrationRisks={(quote as any)?.migrationRisks ?? null}
        initialMigrationRollback={
          (quote as any)?.migrationRollback ?? null
        }
        initialMigrationOutOfScope={
          (quote as any)?.migrationOutOfScope ?? null
        }
        initialHypercareDays={(quote as any)?.hypercareDays ?? null}
        orgDefaults={{
          defaultTerms: (orgProfile as any)?.defaultTerms ?? null,
          defaultExclusions: (orgProfile as any)?.defaultExclusions ?? null,
          defaultPaymentTerms:
            (orgProfile as any)?.defaultPaymentTerms ?? null,
          defaultSignatoryName:
            (orgProfile as any)?.defaultSignatoryName ?? null,
          defaultSignatoryPosition:
            (orgProfile as any)?.defaultSignatoryPosition ?? null,
          brandedTerms: (orgProfile as any)?.brandedTerms ?? null,
          brandedExclusions: (orgProfile as any)?.brandedExclusions ?? null,
          brandedPaymentTerms:
            (orgProfile as any)?.brandedPaymentTerms ?? null,
          brandedSignatoryName:
            (orgProfile as any)?.brandedSignatoryName ?? null,
          brandedSignatoryPosition:
            (orgProfile as any)?.brandedSignatoryPosition ?? null,
          // Phase 4A Delivery 29 — per-profile migration defaults.
          // Modal reads these as tier 2 of the cascade. D30 will add
          // Settings UI to edit them; D29 is read-only for these.
          defaultHypercareDays:
            (orgProfile as any)?.defaultHypercareDays ?? null,
          defaultServerMethodology:
            (orgProfile as any)?.defaultServerMethodology ?? null,
          defaultServerPhases:
            (orgProfile as any)?.defaultServerPhases ?? null,
          defaultServerAssumptions:
            (orgProfile as any)?.defaultServerAssumptions ?? null,
          defaultServerRisks:
            (orgProfile as any)?.defaultServerRisks ?? null,
          defaultServerRollback:
            (orgProfile as any)?.defaultServerRollback ?? null,
          defaultServerOutOfScope:
            (orgProfile as any)?.defaultServerOutOfScope ?? null,
          defaultM365Methodology:
            (orgProfile as any)?.defaultM365Methodology ?? null,
          defaultM365Phases:
            (orgProfile as any)?.defaultM365Phases ?? null,
          defaultM365Assumptions:
            (orgProfile as any)?.defaultM365Assumptions ?? null,
          defaultM365Risks:
            (orgProfile as any)?.defaultM365Risks ?? null,
          defaultM365Rollback:
            (orgProfile as any)?.defaultM365Rollback ?? null,
          defaultM365OutOfScope:
            (orgProfile as any)?.defaultM365OutOfScope ?? null,
          defaultWorkspaceMethodology:
            (orgProfile as any)?.defaultWorkspaceMethodology ?? null,
          defaultWorkspacePhases:
            (orgProfile as any)?.defaultWorkspacePhases ?? null,
          defaultWorkspaceAssumptions:
            (orgProfile as any)?.defaultWorkspaceAssumptions ?? null,
          defaultWorkspaceRisks:
            (orgProfile as any)?.defaultWorkspaceRisks ?? null,
          defaultWorkspaceRollback:
            (orgProfile as any)?.defaultWorkspaceRollback ?? null,
          defaultWorkspaceOutOfScope:
            (orgProfile as any)?.defaultWorkspaceOutOfScope ?? null,
          defaultTenantMethodology:
            (orgProfile as any)?.defaultTenantMethodology ?? null,
          defaultTenantPhases:
            (orgProfile as any)?.defaultTenantPhases ?? null,
          defaultTenantAssumptions:
            (orgProfile as any)?.defaultTenantAssumptions ?? null,
          defaultTenantRisks:
            (orgProfile as any)?.defaultTenantRisks ?? null,
          defaultTenantRollback:
            (orgProfile as any)?.defaultTenantRollback ?? null,
          defaultTenantOutOfScope:
            (orgProfile as any)?.defaultTenantOutOfScope ?? null,
        }}
        onConfirm={handleBrandedReviewConfirmed}
      />

      {/* Phase 4A Delivery 5 — Solo upgrade modal. Fires when a soft-
          gated tier (solo / trial) user clicks Generate PDF. Its
          "Download basic PDF" action falls through to the review
          modal above, preserving Solo users' existing PDF access. */}
      <SoloUpgradeModal
        open={showSoloUpgradeModal}
        onDismiss={() => setShowSoloUpgradeModal(false)}
        onUpgrade={handleSoloUpgradeCTA}
        onContinueWithBasic={handleSoloUpgradeContinueBasic}
      />

      {/* Phase 4A Delivery 6 — Export format picker modal. Fires on
          Generate PDF for Pro / Team tiers. Only the Quick quote card
          is wired today; that card falls through to the review modal
          above, preserving the original PDF flow. The Contract-Tender
          and Project-Migration cards are greyed "Coming soon" until
          Delivery 7 lands the branded renderer. */}
      <ExportFormatPickerModal
        open={showFormatPickerModal}
        onDismiss={() => setShowFormatPickerModal(false)}
        onSelectQuickQuote={handlePickerSelectQuickQuote}
        onSelectContractTender={handlePickerSelectContractTender}
        sectorHint={tradePreset}
      />

      {/* Phase 4A Delivery 7 — Brand Choice modal. Opens after the user
          picks the Contract/Tender card in the picker above. Lets them
          choose between "use your branding" (with inline setup if the
          org has no brand tokens yet) and "use template defaults".
          Phase 4A Delivery 24 — onGenerate now routes through the
          ReviewBeforeGenerateModal gate (handleBrandChoiceCommitted)
          rather than firing the mutation directly. */}
      <BrandChoiceModal
        open={showBrandChoiceModal}
        onDismiss={() => setShowBrandChoiceModal(false)}
        onBack={handleBrandChoiceBack}
        onGenerate={handleBrandChoiceCommitted}
        isGenerating={generateBrandedProposal.isPending}
      />
    </div>
  );
}

// ─── Evidence panel ───────────────────────────────────────────────────────

interface EvidencePanelProps {
  inputs: QuoteInput[];
  activeInputId: number | null;
  highlightedInputIds: Set<number>;
  onSelect: (id: number) => void;
  onDelete: (id: number) => void;
  onFileChoose: () => void;
  onFilesDropped: (files: File[]) => void;
  onAddVoiceTranscript: (text: string) => void;
  onAddPaste: () => void;
  pasteText: string;
  setPasteText: (s: string) => void;
  uploadingFile: boolean;
}

function EvidencePanel({
  inputs,
  activeInputId,
  highlightedInputIds,
  onSelect,
  onDelete,
  onFileChoose,
  onFilesDropped,
  onAddVoiceTranscript,
  onAddPaste,
  pasteText,
  setPasteText,
  uploadingFile,
}: EvidencePanelProps) {
  return (
    <div
      className="flex flex-col h-full overflow-hidden"
      // Panel-level suppression: if the user misses the drop zone and drops
      // on any other part of the sidebar, prevent the browser's default
      // "navigate to file" behaviour. Drops inside the DropZone stop
      // propagation themselves, so these only fire for stray drops.
      onDragOver={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
      onDrop={(e) => {
        if (e.dataTransfer.types.includes("Files")) e.preventDefault();
      }}
    >
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-wider mb-3"
          style={{ color: brand.navyMuted }}
        >
          Add evidence
        </h2>

        <DropZone
          onFilesSelected={onFilesDropped}
          onClick={onFileChoose}
          busy={uploadingFile}
        />

        <div className="grid grid-cols-2 gap-2 mt-3">
          <ActionTile
            icon={<FileText className="w-4 h-4" />}
            label="Paste"
            color="#3b82f6"
            bg="#eff6ff"
            onClick={() => {
              document.getElementById("paste-textarea")?.focus();
            }}
          />
          <DictateTile onTranscript={onAddVoiceTranscript} />
        </div>

        <div className="mt-3">
          {/* Chunk 3 — capped paste textarea. Previously max-h was 240px,
              which could push the "Add as evidence" button below the
              viewport on shorter screens (especially when the trial
              banner is showing). Capped at 96px (~4 lines) so long
              pastes scroll inside the box itself and the button stays
              reachable. Keyboard shortcut removed — Wez asked for an
              explicit button only. */}
          <Textarea
            id="paste-textarea"
            placeholder="Paste an email, brief, or note here…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            className="min-h-[72px] max-h-[96px] overflow-y-auto text-sm bg-white"
            style={{ borderColor: brand.border }}
          />
          {pasteText.trim().length > 0 && (
            <div className="mt-1.5 flex justify-end">
              <Button
                size="sm"
                onClick={onAddPaste}
                className="text-xs text-white h-7"
                style={{
                  background:
                    "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
                }}
              >
                <Plus className="w-3 h-3 mr-1" />
                Add as evidence
              </Button>
            </div>
          )}
        </div>
      </div>

      <div className="flex-shrink-0 px-5 pb-2 mt-2 flex items-center justify-between">
        <h2
          className="text-[11px] font-bold uppercase tracking-wider"
          style={{ color: brand.navyMuted }}
        >
          Added inputs
        </h2>
        <span
          className="text-[10px] font-bold px-1.5 py-0.5 rounded-full"
          style={{
            backgroundColor: brand.tealBg,
            color: brand.teal,
          }}
        >
          {inputs.length}
        </span>
      </div>

      <div className="flex-1 overflow-y-auto px-5 pb-5 space-y-2">
        {inputs.some((i) => i.processingStatus === "processing") && (
          <div
            className="flex items-start gap-2 px-3 py-2.5 rounded-lg"
            style={{
              backgroundColor: brand.tealBg,
              border: `1px solid ${brand.tealBorder}`,
            }}
          >
            <Loader2
              className="w-3.5 h-3.5 animate-spin flex-shrink-0 mt-0.5"
              style={{ color: brand.teal }}
            />
            <div
              className="text-[11px] leading-snug"
              style={{ color: brand.navy }}
            >
              Analysing your files — this may take a minute or two.
            </div>
          </div>
        )}
        {inputs.length === 0 ? (
          <div
            className="text-xs text-center py-8 rounded-lg border border-dashed"
            style={{ color: brand.navyMuted, borderColor: brand.border }}
          >
            Nothing added yet. Upload a file, paste text, or dictate.
          </div>
        ) : (
          inputs.map((inp) => (
            <InputCard
              key={inp.id}
              input={inp}
              isActive={activeInputId === inp.id}
              isHighlighted={highlightedInputIds.has(inp.id)}
              onClick={() => onSelect(inp.id)}
              onDelete={() => onDelete(inp.id)}
            />
          ))
        )}
      </div>
    </div>
  );
}

// ─── Drop zone (drag + click to upload) ──────────────────────────────────

function DropZone({
  onFilesSelected,
  onClick,
  busy,
}: {
  onFilesSelected: (files: File[]) => void;
  onClick: () => void;
  busy: boolean;
}) {
  const [dragOver, setDragOver] = useState(false);

  const handleDragEnter = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
    setDragOver(true);
  };
  const handleDragOver = (e: React.DragEvent) => {
    if (!e.dataTransfer.types.includes("Files")) return;
    e.preventDefault();
    e.stopPropagation();
  };
  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    // Ignore leave events triggered by crossing onto a child element.
    if (
      e.currentTarget.contains(e.relatedTarget as Node | null)
    ) {
      return;
    }
    setDragOver(false);
  };
  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setDragOver(false);
    const files = Array.from(e.dataTransfer.files || []);
    if (files.length > 0) onFilesSelected(files);
  };

  const borderColor = dragOver ? brand.teal : brand.border;
  const bgColor = dragOver ? brand.tealBg : "#f8fafc";
  const label = busy
    ? "Uploading…"
    : dragOver
      ? "Drop to upload"
      : "Drag files here";

  return (
    <div
      role="button"
      tabIndex={0}
      aria-disabled={busy}
      onClick={busy ? undefined : onClick}
      onKeyDown={(e) => {
        if (busy) return;
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      onDragEnter={handleDragEnter}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      className="rounded-xl px-4 py-5 flex flex-col items-center gap-1.5 transition-colors"
      style={{
        border: `2px dashed ${borderColor}`,
        backgroundColor: bgColor,
        cursor: busy ? "default" : "pointer",
        opacity: busy ? 0.7 : 1,
      }}
    >
      {busy ? (
        <Loader2
          className="w-6 h-6 animate-spin"
          style={{ color: brand.teal }}
        />
      ) : (
        <Upload className="w-6 h-6" style={{ color: brand.teal }} />
      )}
      <div
        className="text-sm font-semibold"
        style={{ color: brand.navy }}
      >
        {label}
      </div>
      <div
        className="text-[11px] text-center leading-tight"
        style={{ color: brand.navyMuted }}
      >
        or click to browse — PDF, image, audio, email
      </div>
    </div>
  );
}

// ─── Action tile ──────────────────────────────────────────────────────────

interface ActionTileProps {
  icon: React.ReactNode;
  label: string;
  color: string;
  bg: string;
  onClick: () => void;
  disabled?: boolean;
  busy?: boolean;
}

function ActionTile({
  icon,
  label,
  color,
  bg,
  onClick,
  disabled,
  busy,
}: ActionTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className="flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 px-2 bg-white transition-all hover:shadow-sm disabled:opacity-60"
      style={{ border: `1px solid ${brand.border}` }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center"
        style={{ backgroundColor: bg, color }}
      >
        {busy ? <Loader2 className="w-4 h-4 animate-spin" /> : icon}
      </div>
      <span
        className="text-[11px] font-semibold"
        style={{ color: brand.navy }}
      >
        {label}
      </span>
    </button>
  );
}

// ─── Dictate tile ─────────────────────────────────────────────────────────

function DictateTile({
  onTranscript,
}: {
  onTranscript: (text: string) => void;
}) {
  const [recording, setRecording] = useState(false);

  return (
    <div
      className="relative flex flex-col items-center justify-center gap-1.5 rounded-lg py-3 px-2 bg-white"
      style={{ border: `1px solid ${brand.border}` }}
    >
      <div
        className="w-7 h-7 rounded-md flex items-center justify-center"
        style={{ backgroundColor: "#fef3c7", color: "#b45309" }}
      >
        <Mic className="w-4 h-4" />
      </div>
      <span
        className="text-[11px] font-semibold"
        style={{ color: brand.navy }}
      >
        {recording ? "Listening…" : "Dictate"}
      </span>
      <DictationButton
        variant="inline"
        autoStart={false}
        onTranscript={onTranscript}
        onListeningChange={setRecording}
        className="absolute inset-0 opacity-0"
      />
    </div>
  );
}

// ─── Input card ───────────────────────────────────────────────────────────

function InputCard({
  input,
  isActive,
  isHighlighted,
  onClick,
  onDelete,
}: {
  input: QuoteInput;
  isActive: boolean;
  isHighlighted: boolean;
  onClick: () => void;
  onDelete: () => void;
}) {
  const visual = inputVisual(input);
  const title = inputTitle(input);
  const subtitle = inputSubtitle(input);
  const isProcessing = input.processingStatus === "processing";
  const isFailed =
    input.processingStatus === "failed" ||
    input.processingStatus === "error";

  const borderColor = isActive
    ? brand.teal
    : isHighlighted
      ? brand.tealBorder
      : brand.border;
  const bgColor = isActive
    ? brand.tealBg
    : isHighlighted
      ? "#f0fdfa"
      : "white";

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onClick}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onClick();
        }
      }}
      className="group rounded-lg cursor-pointer transition-all hover:shadow-sm overflow-hidden"
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
      <div className="flex items-center gap-3 p-2.5">
        <div
          className="flex-shrink-0 w-10 h-10 rounded-lg flex items-center justify-center text-[10px] font-bold"
          style={{ backgroundColor: visual.bg, color: visual.color }}
        >
          {visual.label}
        </div>
        <div className="flex-1 min-w-0">
          <div
            className="text-sm font-semibold truncate"
            style={{ color: brand.navy }}
          >
            {title}
          </div>
          <div
            className="text-[11px] flex items-center gap-1.5"
            style={{ color: brand.navyMuted }}
          >
            {isFailed && (
              <AlertCircle className="w-3 h-3" style={{ color: "#dc2626" }} />
            )}
            <span>{subtitle}</span>
          </div>
        </div>
        <button
          type="button"
          onClick={(e) => {
            e.stopPropagation();
            onDelete();
          }}
          className="opacity-0 group-hover:opacity-100 transition-opacity p-1.5 rounded hover:bg-red-50"
          title="Remove"
        >
          <Trash2 className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
        </button>
      </div>
      {isProcessing && (
        <div style={{ padding: "0 10px 10px" }}>
          <div className="iyq-progress-track" style={{ height: 8 }}>
            <div className="iyq-progress-sweep" />
          </div>
        </div>
      )}
      {isFailed && (
        <div style={{ padding: "0 10px 10px" }}>
          <div
            style={{
              height: 8,
              background: "#dc2626",
              borderRadius: 4,
            }}
          />
        </div>
      )}
    </div>
  );
}

// ─── Empty state panel (State 1 right side) ──────────────────────────────

function EmptyStatePanel({
  onGenerate,
  onRequestRegenerate,
  isGenerating,
  generateStage,
  evidenceCount,
  generationCount,
}: {
  onGenerate: () => void;
  onRequestRegenerate: () => void;
  isGenerating: boolean;
  generateStage: "reading" | "building" | "finalising" | null;
  evidenceCount: number;
  generationCount: number;
}) {
  const canGenerate = evidenceCount > 0 && !isGenerating;
  // Chunk 3 Delivery F — three gating states driven by generationCount:
  //   • 0 → first generation. Plain "Generate Quote" button, no dialog.
  //   • 1 → this call would be the one-shot re-generate. "Re-generate" label,
  //         amber hint, clicking opens confirmation dialog.
  //   • 2 → locked. No button; a quiet message explains the duplicate route.
  const isLocked = generationCount >= 2;
  const isRegenerate = generationCount === 1;

  // Design 2 — hero animated generating panel. Stage text advances on timers
  // during the single generateDraft call: reading → building → finalising.
  if (isGenerating) {
    const stageLabel =
      generateStage === "reading"
        ? "Reading your evidence…"
        : generateStage === "building"
          ? "Building line items…"
          : generateStage === "finalising"
            ? "Finalising quote…"
            : "Getting started…";
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="max-w-sm w-full text-center flex flex-col items-center gap-4">
          <div
            className="w-16 h-16 rounded-2xl flex items-center justify-center animate-pulse"
            style={{
              background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
            }}
          >
            <Sparkles className="w-8 h-8 text-white" />
          </div>
          <h2
            className="text-xl font-bold"
            style={{ color: brand.navy }}
          >
            Creating your quote…
          </h2>
          <p
            className="text-sm"
            style={{ color: brand.navyMuted, minHeight: 20 }}
          >
            {stageLabel}
          </p>
          <div className="w-full mt-2">
            <div className="iyq-progress-track" style={{ height: 8 }}>
              <div className="iyq-progress-sweep" />
            </div>
          </div>
          <p
            className="text-xs"
            style={{ color: brand.navyMuted, opacity: 0.75 }}
          >
            Usually takes about 30 seconds
          </p>
        </div>
      </div>
    );
  }

  // Locked state — quote has been generated and re-generated already. No
  // button; the user's route forward is to duplicate the quote.
  if (isLocked) {
    return (
      <div className="flex-1 flex items-center justify-center p-10">
        <div className="max-w-sm w-full text-center">
          <div
            className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
            style={{ backgroundColor: "#f3f4f6" }}
          >
            <Lock
              className="w-8 h-8"
              style={{ color: brand.navyMuted }}
            />
          </div>
          <h2
            className="text-xl font-bold mb-2"
            style={{ color: brand.navy }}
          >
            Quote locked
          </h2>
          <p
            className="text-sm leading-relaxed"
            style={{ color: brand.navyMuted }}
          >
            This quote has already used its one re-generation. To rebuild
            from different evidence, duplicate the quote from your
            dashboard and start fresh there.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex-1 flex items-center justify-center p-10">
      <div className="max-w-sm w-full text-center">
        <div
          className="mx-auto w-16 h-16 rounded-2xl flex items-center justify-center mb-5"
          style={{
            background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
          }}
        >
          <Sparkles className="w-8 h-8 text-white" />
        </div>
        <h2
          className="text-xl font-bold mb-2"
          style={{ color: brand.navy }}
        >
          {isRegenerate ? "One re-generation left" : "Ready when you are"}
        </h2>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: brand.navyMuted }}
        >
          {evidenceCount === 0
            ? "Add evidence on the left — uploads, pasted text, or a quick voice note. Then generate the quote."
            : isRegenerate
              ? `${evidenceCount} ${evidenceCount === 1 ? "input" : "inputs"} attached. You can re-generate this quote one more time — after that it's locked.`
              : `${evidenceCount} ${evidenceCount === 1 ? "input" : "inputs"} added. Press Generate Quote and I'll turn them into line items.`}
        </p>
        <Button
          size="lg"
          onClick={isRegenerate ? onRequestRegenerate : onGenerate}
          disabled={!canGenerate}
          className="text-white w-full"
          style={{
            background: canGenerate
              ? "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
              : undefined,
          }}
        >
          {isRegenerate ? (
            <>
              <RefreshCw className="w-4 h-4 mr-2" />
              Re-generate
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Quote
            </>
          )}
        </Button>
        {isRegenerate && (
          <p
            className="text-xs mt-3 leading-snug"
            style={{ color: "#b45309" }}
          >
            Last chance — this will wipe the existing line items and lock
            the quote afterwards.
          </p>
        )}
      </div>
    </div>
  );
}

// ─── Editor panel (State 2 right side) ───────────────────────────────────

interface EditorPanelProps {
  lineItems: LineItem[];
  catalogItems: CatalogItemRef[];
  totals: { oneOff: number; monthly: number; annual: number; optional: number };
  activeLineItemId: number | null;
  highlightedLineItemIds: Set<number>;
  onLineItemClick: (id: number) => void;
  clientNameValue: string;
  clientEmailValue: string;
  contactNameValue: string;
  descriptionValue: string;
  onUpdateClientName: (v: string) => void;
  onUpdateClientEmail: (v: string) => void;
  onUpdateContactName: (v: string) => void;
  onUpdateDescription: (v: string) => void;
  onSaveLineItem: (
    id: number,
    patch: Record<string, unknown>,
    delayMs?: number,
  ) => void;
  onDeleteLineItem: (id: number) => void;
  onAddLineItem: () => void;
  onApplyCatalog: (row: LineItem, cat: CatalogItemRef) => void;
  onGeneratePDF: () => void;
  isGeneratingPDF: boolean;
  addingLineItem: boolean;
  // Chunk 3 Delivery F — one-shot re-generate gating.
  onRequestRegenerate: () => void;
  generationCount: number;
  isGenerating: boolean;
  // Chunk 3 Delivery G — quote title moved from the old title bar into
  // the light green client card so the workspace chrome stays quiet.
  titleValue: string;
  onUpdateTitle: (v: string) => void;
  // Chunk 3 Delivery B — opens the "Add to catalogue" dialog pre-filled
  // from the clicked row. Only invoked for AI-estimated rows.
  onRequestAddToCatalogue: (row: LineItem) => void;
}

function EditorPanel({
  lineItems,
  catalogItems,
  totals,
  activeLineItemId,
  highlightedLineItemIds,
  onLineItemClick,
  clientNameValue,
  clientEmailValue,
  contactNameValue,
  descriptionValue,
  onUpdateClientName,
  onUpdateClientEmail,
  onUpdateContactName,
  onUpdateDescription,
  onSaveLineItem,
  onDeleteLineItem,
  onAddLineItem,
  onApplyCatalog,
  onGeneratePDF,
  isGeneratingPDF,
  addingLineItem,
  onRequestRegenerate,
  generationCount,
  isGenerating,
  titleValue,
  onUpdateTitle,
  onRequestAddToCatalogue,
}: EditorPanelProps) {
  const lineItemCount = lineItems.length;
  // Chunk 3 Delivery F — show the Re-generate affordance only while the
  // user still has their one-shot. Once generationCount hits 2, the button
  // and hint disappear entirely (quote is locked to manual edits).
  const canRegenerate = generationCount < 2 && !isGenerating;
  // Chunk 3 Delivery B — feeds the amber banner above the table. The
  // draft builder sets isEstimated=true when it had to assume a rate;
  // users get a clear count so they know how many rows still need a
  // real number.
  const estimatedCount = useMemo(
    () => lineItems.filter((li) => li.isEstimated === true).length,
    [lineItems],
  );

  const totalsSummary = useMemo(() => {
    const parts: string[] = [];
    if (totals.oneOff > 0) parts.push(`${fmtGBP(totals.oneOff)}`);
    if (totals.monthly > 0) parts.push(`${fmtGBP(totals.monthly)}/mo`);
    if (totals.annual > 0) parts.push(`${fmtGBP(totals.annual)}/yr`);
    return parts.length > 0 ? `${parts.join(" + ")} · Ex VAT` : "No totals yet";
  }, [totals]);

  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-1 overflow-y-auto px-6 py-5 space-y-4">
        <div
          className="rounded-xl p-4"
          style={{ backgroundColor: brand.tealBg }}
        >
          {/* Chunk 3 Delivery G — quote title, moved from the old title bar.
              Small labelled field so it doesn't compete with the client
              name for visual weight but stays easy to edit. */}
          <label
            className="text-[10px] font-bold uppercase tracking-wider block"
            style={{ color: brand.navyMuted }}
          >
            Quote title
          </label>
          <Input
            value={titleValue}
            onChange={(e) => onUpdateTitle(e.target.value)}
            placeholder="e.g. IT support renewal"
            className="text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-7 mb-2"
            style={{ color: brand.navy }}
          />
          <Input
            value={clientNameValue}
            onChange={(e) => onUpdateClientName(e.target.value)}
            placeholder="Client name"
            className="text-lg font-bold border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent"
            style={{ color: brand.navy }}
          />
          <div className="grid grid-cols-2 gap-3 mt-1.5">
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-wider block"
                style={{ color: brand.navyMuted }}
              >
                Contact name
              </label>
              <Input
                value={contactNameValue}
                onChange={(e) => onUpdateContactName(e.target.value)}
                placeholder="e.g. Jane Smith"
                className="text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-7"
                style={{ color: brand.navy }}
              />
            </div>
            <div>
              <label
                className="text-[10px] font-bold uppercase tracking-wider block"
                style={{ color: brand.navyMuted }}
              >
                Email
              </label>
              <Input
                type="email"
                value={clientEmailValue}
                onChange={(e) => onUpdateClientEmail(e.target.value)}
                placeholder="jane@example.com"
                className="text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-7"
                style={{ color: brand.navy }}
              />
            </div>
          </div>
          <div
            className="text-xs mt-2"
            style={{ color: brand.navyMuted }}
          >
            {lineItemCount} {lineItemCount === 1 ? "line item" : "line items"}
          </div>
          <div
            className="text-sm font-bold mt-1"
            style={{ color: brand.navy }}
          >
            {totalsSummary}
          </div>
          {totals.optional > 0 && (
            <div
              className="text-[11px] mt-0.5"
              style={{ color: brand.navyMuted }}
            >
              + {fmtGBP(totals.optional)} optional
            </div>
          )}
        </div>

        <div
          className="rounded-xl p-4 bg-white"
          style={{ border: `1px solid ${brand.border}` }}
        >
          <label
            className="text-[11px] font-bold uppercase tracking-wider block mb-2"
            style={{ color: brand.navyMuted }}
          >
            Job description
          </label>
          <Textarea
            value={descriptionValue}
            onChange={(e) => onUpdateDescription(e.target.value)}
            placeholder="Brief summary of the work — this appears on the PDF"
            className="min-h-[80px] text-sm border-0 shadow-none focus-visible:ring-0 px-0 resize-none"
            style={{ color: brand.navy }}
          />
        </div>

        <div
          className="rounded-xl bg-white overflow-hidden"
          style={{ border: `1px solid ${brand.border}` }}
        >
          <div
            className="px-4 py-2.5 flex items-center justify-between"
            style={{ borderBottom: `1px solid ${brand.border}` }}
          >
            <h3
              className="text-[11px] font-bold uppercase tracking-wider"
              style={{ color: brand.navyMuted }}
            >
              Line items
            </h3>
            <div className="flex items-center gap-2">
              {/* Chunk 3 Delivery F — Re-generate button. Shown whenever the
                  user still has their one-shot (generationCount < 2). Opens
                  the confirmation dialog rather than generating directly. */}
              {canRegenerate && (
                <Button
                  size="sm"
                  variant="outline"
                  onClick={onRequestRegenerate}
                  className="h-7 text-xs"
                  style={{
                    color: "#b45309",
                    borderColor: "#fcd34d",
                    backgroundColor: "#fffbeb",
                  }}
                >
                  <RefreshCw className="w-3 h-3 mr-1" />
                  Re-generate
                </Button>
              )}
              <Button
                size="sm"
                variant="outline"
                onClick={onAddLineItem}
                disabled={addingLineItem}
                className="h-7 text-xs"
              >
                <Plus className="w-3 h-3 mr-1" />
                Add row
              </Button>
            </div>
          </div>
          {/* Chunk 3 Delivery F — amber hint strip below the header when a
              re-generation is still available. Deliberately plain language
              so the user knows this is their last shot before the dialog. */}
          {canRegenerate && (
            <div
              className="px-4 py-2 text-[11px] leading-snug flex items-start gap-1.5"
              style={{
                backgroundColor: "#fffbeb",
                color: "#b45309",
                borderBottom: `1px solid ${brand.border}`,
              }}
            >
              <AlertCircle
                className="w-3 h-3 mt-[2px] flex-shrink-0"
              />
              <span>
                You have one re-generation left. It will wipe every line
                item — including manual edits — and the quote will be
                locked afterwards.
              </span>
            </div>
          )}
          {/* Chunk 3 Delivery B — amber strip above the line-items table
              that counts how many rows the AI had to estimate. Hidden when
              there are no estimates so the workspace stays quiet once
              the user has moved every row off estimate (by editing rates
              into catalogue values or replacing the row via Change▾). */}
          {estimatedCount > 0 && (
            <div
              className="px-4 py-2 text-[11px] leading-snug flex items-start gap-1.5"
              style={{
                backgroundColor: "#fffbeb",
                color: "#b45309",
                borderBottom: `1px solid ${brand.border}`,
              }}
              role="status"
            >
              <AlertCircle className="w-3 h-3 mt-[2px] flex-shrink-0" />
              <span>
                {estimatedCount === 1
                  ? "1 estimated item"
                  : `${estimatedCount} estimated items`}{" "}
                — review the rates, and add any you'll re-use to your
                catalogue.
              </span>
            </div>
          )}
          <LineItemsTable
            rows={lineItems}
            catalogItems={catalogItems}
            activeLineItemId={activeLineItemId}
            highlightedLineItemIds={highlightedLineItemIds}
            onRowClick={onLineItemClick}
            onSave={onSaveLineItem}
            onDelete={onDeleteLineItem}
            onApplyCatalog={onApplyCatalog}
            onRequestAddToCatalogue={onRequestAddToCatalogue}
          />
        </div>

      <div
        className="text-[11px] italic px-1 flex items-center gap-1.5"
        style={{ color: brand.navyMuted }}
      >
        <Info className="w-3 h-3" />
        Click an evidence card or a line item to see what was derived from
        what.
      </div>
      </div>

      {/* Phase 4A Delivery 38 — bottom Generate PDF button removed;
          Generate PDF + Generate Word now live in the top bar
          alongside the Dashboard / Saved-state row, freeing the
          two-panel body to scroll without a fixed footer clipping
          the line-items table on smaller windows. */}
    </div>
  );
}

// ─── Line items table ────────────────────────────────────────────────────

interface LineItemsTableProps {
  rows: LineItem[];
  catalogItems: CatalogItemRef[];
  activeLineItemId: number | null;
  highlightedLineItemIds: Set<number>;
  onRowClick: (id: number) => void;
  onSave: (
    id: number,
    patch: Record<string, unknown>,
    delayMs?: number,
  ) => void;
  onDelete: (id: number) => void;
  onApplyCatalog: (row: LineItem, cat: CatalogItemRef) => void;
  // Chunk 3 Delivery B — handed straight through to LineItemRow, which
  // only surfaces the Add-to-catalogue button on rows where isEstimated.
  onRequestAddToCatalogue: (row: LineItem) => void;
}

function LineItemsTable({
  rows,
  catalogItems,
  activeLineItemId,
  highlightedLineItemIds,
  onRowClick,
  onSave,
  onDelete,
  onApplyCatalog,
  onRequestAddToCatalogue,
}: LineItemsTableProps) {
  if (rows.length === 0) {
    return (
      <div
        className="text-xs text-center py-8"
        style={{ color: brand.navyMuted }}
      >
        No line items yet.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm table-fixed">
        <thead>
          <tr
            className="text-[10px] uppercase font-bold tracking-wider"
            style={{
              color: brand.navyMuted,
              backgroundColor: "#fafbfc",
            }}
          >
            <th className="text-left px-2 py-2 w-[10%]">Catalog</th>
            <th className="text-left px-4 py-2 w-[30%]">Line item</th>
            <th className="text-right px-2 py-2 w-[10%]">Qty</th>
            <th className="text-left px-2 py-2 w-[10%]">Unit</th>
            <th className="text-right px-2 py-2 w-[12%]">Rate</th>
            <th className="text-right px-2 py-2 w-[12%]">Total</th>
            <th className="text-left px-2 py-2 w-[12%]">Type</th>
            <th className="w-[4%]" />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <LineItemRow
              key={row.id}
              row={row}
              catalogItems={catalogItems}
              isActive={activeLineItemId === row.id}
              isHighlighted={highlightedLineItemIds.has(row.id)}
              onRowClick={() => onRowClick(row.id)}
              onSave={onSave}
              onDelete={() => onDelete(row.id)}
              onApplyCatalog={(cat) => onApplyCatalog(row, cat)}
              onRequestAddToCatalogue={() => onRequestAddToCatalogue(row)}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

// ─── Line items row ──────────────────────────────────────────────────────

function LineItemRow({
  row,
  catalogItems,
  isActive,
  isHighlighted,
  onRowClick,
  onSave,
  onDelete,
  onApplyCatalog,
  onRequestAddToCatalogue,
}: {
  row: LineItem;
  catalogItems: CatalogItemRef[];
  isActive: boolean;
  isHighlighted: boolean;
  onRowClick: () => void;
  onSave: (
    id: number,
    patch: Record<string, unknown>,
    delayMs?: number,
  ) => void;
  onDelete: () => void;
  onApplyCatalog: (cat: CatalogItemRef) => void;
  // Chunk 3 Delivery B — only wired up for AI-estimated rows.
  onRequestAddToCatalogue: () => void;
}) {
  const rowTotal = useMemo(() => {
    const q = parseNum(row.quantity);
    const r = parseNum(row.rate);
    const stored = parseNum(row.total);
    return stored || q * r;
  }, [row.quantity, row.rate, row.total]);

  const bgColor = isActive
    ? brand.tealBg
    : isHighlighted
      ? "#f0fdfa"
      : "white";

  const uiType = uiTypeFromPricing(row.pricingType);
  // Chunk 3 Delivery B — the AI draft builder sets isEstimated=true when
  // it had to pick a rate without hard evidence. Drives the amber chip
  // and the always-visible "Add to catalogue" button underneath the
  // description cell.
  const isEstimated = row.isEstimated === true;

  return (
    <tr
      onClick={onRowClick}
      className="group cursor-pointer transition-colors hover:bg-slate-50"
      style={{
        backgroundColor: bgColor,
        borderTop: `1px solid ${brand.borderLight}`,
      }}
    >
      <td
        className="px-2 py-2 align-top"
        onClick={(e) => e.stopPropagation()}
      >
        <CatalogPicker
          catalogItems={catalogItems}
          onSelect={onApplyCatalog}
        />
      </td>
      <td className="px-4 py-2 align-top">
        <WrappingDescription
          value={row.description || ""}
          onChange={(v) => onSave(row.id, { description: v })}
        />
        {/* Chunk 3 Delivery B — estimate chip + always-visible
            "Add to catalogue" button. Only rendered when the AI draft
            builder flagged this row as estimated. stopPropagation on the
            button so clicking it doesn't also trigger the row's
            click-to-activate handler. */}
        {isEstimated && (
          <div className="flex items-center gap-2 mt-1.5 flex-wrap">
            <span
              className="inline-flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wider rounded px-1.5 py-0.5"
              style={{
                backgroundColor: "#fffbeb",
                color: "#b45309",
                border: "1px solid #fcd34d",
              }}
              title="Rate estimated by AI — review or replace with a catalogue item."
            >
              <AlertCircle className="w-2.5 h-2.5" />
              Estimate
            </span>
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                onRequestAddToCatalogue();
              }}
              className="inline-flex items-center gap-1 text-[10px] font-medium rounded px-1.5 py-0.5 transition-colors hover:bg-teal-50"
              style={{
                color: brand.teal,
                border: `1px solid ${brand.tealBorder}`,
                backgroundColor: "white",
              }}
            >
              <Plus className="w-2.5 h-2.5" />
              Add to catalogue
            </button>
          </div>
        )}
      </td>
      <td className="px-2 py-2 text-right">
        <RowCellInput
          value={row.quantity || ""}
          onSave={(v) => onSave(row.id, { quantity: v })}
          align="right"
          inputMode="decimal"
        />
      </td>
      <td className="px-2 py-2">
        <RowCellInput
          value={row.unit || ""}
          onSave={(v) => onSave(row.id, { unit: v })}
          placeholder="each"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <RowCellInput
          value={row.rate || ""}
          onSave={(v) => onSave(row.id, { rate: v })}
          align="right"
          inputMode="decimal"
          placeholder="0.00"
        />
      </td>
      <td
        className="px-2 py-2 text-right text-sm font-semibold"
        style={{ color: brand.navy }}
      >
        {fmtGBP(rowTotal)}
      </td>
      <td className="px-2 py-2">
        <div onClick={(e) => e.stopPropagation()}>
          <Select
            value={uiType}
            onValueChange={(v) =>
              onSave(
                row.id,
                { pricingType: pricingFromUiType(v as DisplayType) },
                0,
              )
            }
          >
            <SelectTrigger
              className="h-7 text-xs border-0 shadow-none focus:ring-0 bg-transparent px-0"
              style={{ color: brand.navy }}
            >
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="one_off">One-off cost</SelectItem>
              <SelectItem value="monthly">Monthly cost</SelectItem>
              <SelectItem value="annual">Annual cost</SelectItem>
              <SelectItem value="optional">Optional</SelectItem>
            </SelectContent>
          </Select>
        </div>
      </td>
      <td className="px-2 py-2">
        <div
          className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity"
          onClick={(e) => e.stopPropagation()}
        >
          <button
            type="button"
            onClick={onDelete}
            className="p-1 rounded hover:bg-red-50"
            title="Remove row"
          >
            <Trash2 className="w-3.5 h-3.5" style={{ color: "#dc2626" }} />
          </button>
        </div>
      </td>
    </tr>
  );
}

// ─── Expanding description cell ──────────────────────────────────────────
//
// Line-item descriptions are often long ("Project Engineer — Project engineer
// labour 23 Jan 2025 on-site install of…") and a single-line Input truncates
// them without a way to see the full text in context. This component shows
// the first line by default, keeps the cell visually compact, and expands
// to a multi-line Textarea the moment the user focuses or clicks the cell.
// On blur it collapses back unless the content is empty.
//
// The Textarea's value IS the source of truth — changes save via onChange
// (debounced upstream).
// ─── Row cell input ──────────────────────────────────────────────────────
//
// Focus-aware controlled input. Syncs its shown value from the parent prop
// whenever the field is NOT currently focused — so programmatic updates
// (e.g. applying a catalog item to the row) refresh the UI, while in-flight
// typing isn't clobbered by a round-trip from the server.
function RowCellInput({
  value,
  onSave,
  align,
  inputMode,
  placeholder,
}: {
  value: string;
  onSave: (v: string) => void;
  align?: "right";
  inputMode?: "decimal" | "text";
  placeholder?: string;
}) {
  const [local, setLocal] = useState(value);
  const ref = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    if (document.activeElement !== ref.current) {
      setLocal(value);
    }
  }, [value]);

  return (
    <Input
      ref={ref}
      value={local}
      onChange={(e) => {
        setLocal(e.target.value);
        onSave(e.target.value);
      }}
      onClick={(e) => e.stopPropagation()}
      className={`text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-auto py-0.5 w-full${
        align === "right" ? " text-right" : ""
      }`}
      style={{ color: brand.navy }}
      inputMode={inputMode}
      placeholder={placeholder}
    />
  );
}

function WrappingDescription({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [local, setLocal] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync from parent when value changes (e.g. after refetch or AI regenerate),
  // unless the textarea is currently focused — avoids clobbering mid-type.
  useEffect(() => {
    if (document.activeElement !== textareaRef.current) {
      setLocal(value);
    }
  }, [value]);

  // Auto-size to content height on every local change, so the row grows
  // tall enough to show the whole description without horizontal scroll.
  useEffect(() => {
    if (!textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${el.scrollHeight}px`;
  }, [local]);

  return (
    <Textarea
      ref={textareaRef}
      value={local}
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        onChange(next);
      }}
      onClick={(e) => e.stopPropagation()}
      rows={1}
      className="text-sm border-0 shadow-none focus-visible:ring-0 px-0 py-1 resize-none leading-snug bg-transparent w-full block break-words overflow-hidden"
      style={{ color: brand.navy }}
      placeholder="Item description"
    />
  );
}

// ─── Comprehensive-mode fallback ─────────────────────────────────────────

function ComprehensiveFallback({ onBack }: { onBack: () => void }) {
  return (
    <div className="flex items-center justify-center p-10">
      <div
        className="max-w-md w-full rounded-xl p-6 bg-white text-center"
        style={{ border: `1px solid ${brand.border}` }}
      >
        <div
          className="mx-auto w-12 h-12 rounded-xl flex items-center justify-center mb-4"
          style={{ backgroundColor: "#fef3c7" }}
        >
          <Info className="w-6 h-6" style={{ color: "#b45309" }} />
        </div>
        <h2
          className="text-lg font-bold mb-2"
          style={{ color: brand.navy }}
        >
          Tender-pack mode isn't available for this sector yet
        </h2>
        <p
          className="text-sm mb-5 leading-relaxed"
          style={{ color: brand.navyMuted }}
        >
          Styled tender packs for non-electrical sectors are coming in a
          future update. For now, please use simple mode — it still
          produces a professional quote with your branding.
        </p>
        <Button variant="outline" onClick={onBack} className="w-full">
          <ArrowLeft className="w-4 h-4 mr-2" />
          Back to dashboard
        </Button>
      </div>
    </div>
  );
}
