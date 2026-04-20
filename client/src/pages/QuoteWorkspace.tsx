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
} from "lucide-react";
import DictationButton from "@/components/DictationButton";
import CatalogPicker, { type CatalogItemRef } from "@/components/CatalogPicker";
import MissingCostsModal from "@/components/MissingCostsModal";
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
    { enabled: quoteId > 0 },
  );
  const { data: catalogItemsRaw } = trpc.catalog.list.useQuery();

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

  // ── Derived ──
  const isComprehensive = (quote as any)?.quoteMode === "comprehensive";
  const tradePreset = ((quote as any)?.tradePreset as string | null) || null;
  const showFallback = isComprehensive && tradePreset !== "electrical";
  const isState2 = lineItems.length > 0;

  // ── Session state ──
  const [sourceInputMap, setSourceInputMap] = useState<Record<number, number[]>>(
    {},
  );
  const [activeInputId, setActiveInputId] = useState<number | null>(null);
  const [activeLineItemId, setActiveLineItemId] = useState<number | null>(null);
  const [pasteText, setPasteText] = useState("");
  const [isGenerating, setIsGenerating] = useState(false);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [showMissingCostsModal, setShowMissingCostsModal] = useState(false);
  const [uploadingFile, setUploadingFile] = useState(false);
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
  const parseDictation = trpc.ai.parseDictationSummary.useMutation();
  const generateDraft = trpc.ai.generateDraft.useMutation();
  const updateQuote = trpc.quotes.update.useMutation();
  const updateStatus = trpc.quotes.updateStatus.useMutation({
    onSuccess: () => void refetch(),
  });
  const generatePDF = trpc.quotes.generatePDF.useMutation();

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

  const handleFileChange = async (
    e: React.ChangeEvent<HTMLInputElement>,
  ) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploadingFile(true);
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
      toast.success(`${file.name} uploaded`);

      // Auto-title: if the user hasn't edited the title and it's still the
      // default "New quote" (or empty), set it to the uploaded filename
      // minus extension. This is a one-shot — further uploads don't
      // re-trigger it because the title won't match the default.
      const currentTitle = ((quote as any)?.title as string || "").trim();
      const isDefault =
        !currentTitle ||
        currentTitle === "New Quote" ||
        currentTitle === "New quote";
      if (!userEdited.current.title && isDefault) {
        const baseName = file.name.replace(/\.[^/.]+$/, "");
        try {
          await updateQuote.mutateAsync({ id: quoteId, title: baseName });
          // Local state will re-sync via the useEffect watching `quote`
          // when refetch fires.
        } catch (err) {
          console.warn("[QuoteWorkspace] auto-title failed:", err);
        }
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : "Upload failed");
    } finally {
      setUploadingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
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

    setIsGenerating(true);
    try {
      // Step 1 — parse evidence into engine output
      const parsed = await parseDictation.mutateAsync({ quoteId });
      if (!parsed || !(parsed as any).hasSummary) {
        toast.error(
          "Couldn't extract a quote from the evidence. Try adding more detail.",
        );
        setIsGenerating(false);
        return;
      }

      // Step 2 — write qdsSummaryJson (adapter: keeps Beta-1 schema intact)
      await updateQuote.mutateAsync({
        id: quoteId,
        qdsSummaryJson: JSON.stringify((parsed as any).summary),
      });

      // Step 3 — materialise line items
      const result = await generateDraft.mutateAsync({ quoteId });
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
      toast.success("Quote generated");
      await refetch();
    } catch (err) {
      toast.error(
        err instanceof Error ? err.message : "Couldn't generate the quote",
      );
    } finally {
      setIsGenerating(false);
    }
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
    const patch: Record<string, unknown> = {
      description: cat.name,
      unit: cat.unit || "each",
    };
    if (cat.defaultRate) patch.rate = cat.defaultRate;
    saveLineItem(row.id, patch, 0);
  };

  // ── Handlers — PDF ──
  const handleGeneratePDFClick = () => {
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
      {/* ── Title bar ────────────────────────────────────────────────── */}
      <div
        className="flex items-center justify-between px-6 py-3 bg-white border-b"
        style={{ borderColor: brand.border }}
      >
        <div className="flex items-center gap-3 min-w-0">
          <button
            onClick={() => setLocation("/dashboard")}
            className="inline-flex items-center gap-1.5 text-sm hover:opacity-80"
            style={{ color: brand.navyMuted }}
          >
            <ArrowLeft className="w-4 h-4" />
            Dashboard
          </button>
          <span className="text-sm" style={{ color: brand.borderLight }}>
            ·
          </span>
          <Input
            value={titleLocal}
            onChange={(e) => {
              userEdited.current.title = true;
              setTitleLocal(e.target.value);
              quoteAutoSave.save({ title: e.target.value });
            }}
            placeholder="Quote title"
            className="text-base font-semibold border-0 shadow-none focus-visible:ring-0 px-0 max-w-sm"
            style={{ color: brand.navy }}
          />
        </div>
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
      </div>

      {/* ── Two-panel body ───────────────────────────────────────────── */}
      <div className="flex flex-1 overflow-hidden">
        <div
          className="flex flex-col overflow-hidden"
          style={{
            width: "42%",
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
            onAddVoiceTranscript={handleAddVoiceTranscript}
            onAddPaste={handleAddPaste}
            pasteText={pasteText}
            setPasteText={setPasteText}
            uploadingFile={uploadingFile}
          />
          <input
            ref={fileInputRef}
            type="file"
            accept=".pdf,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp3,.wav,.m4a,.ogg,.webm,.eml,.msg"
            onChange={handleFileChange}
            className="hidden"
          />
        </div>

        <div className="flex flex-col flex-1 overflow-hidden bg-white">
          {!isState2 ? (
            <EmptyStatePanel
              onGenerate={handleGenerate}
              isGenerating={isGenerating}
              evidenceCount={inputs.length}
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
  onAddVoiceTranscript,
  onAddPaste,
  pasteText,
  setPasteText,
  uploadingFile,
}: EvidencePanelProps) {
  return (
    <div className="flex flex-col h-full overflow-hidden">
      <div className="flex-shrink-0 px-5 pt-5 pb-3">
        <h2
          className="text-[11px] font-bold uppercase tracking-wider mb-3"
          style={{ color: brand.navyMuted }}
        >
          Add evidence
        </h2>
        <div className="grid grid-cols-3 gap-2">
          <ActionTile
            icon={<Upload className="w-4 h-4" />}
            label="Upload"
            color={brand.teal}
            bg={brand.tealBg}
            onClick={onFileChoose}
            disabled={uploadingFile}
            busy={uploadingFile}
          />
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
          <Textarea
            id="paste-textarea"
            placeholder="Paste an email, brief, or note here and press ⌘/Ctrl+Enter…"
            value={pasteText}
            onChange={(e) => setPasteText(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                onAddPaste();
              }
            }}
            className="min-h-[72px] text-sm bg-white"
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
      className="group flex items-center gap-3 p-2.5 rounded-lg cursor-pointer transition-all hover:shadow-sm"
      style={{
        backgroundColor: bgColor,
        border: `1px solid ${borderColor}`,
      }}
    >
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
          {isProcessing && <Loader2 className="w-3 h-3 animate-spin" />}
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
  );
}

// ─── Empty state panel (State 1 right side) ──────────────────────────────

function EmptyStatePanel({
  onGenerate,
  isGenerating,
  evidenceCount,
}: {
  onGenerate: () => void;
  isGenerating: boolean;
  evidenceCount: number;
}) {
  const canGenerate = evidenceCount > 0 && !isGenerating;
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
          Ready when you are
        </h2>
        <p
          className="text-sm mb-6 leading-relaxed"
          style={{ color: brand.navyMuted }}
        >
          {evidenceCount === 0
            ? "Add evidence on the left — uploads, pasted text, or a quick voice note. Then generate the quote."
            : `${evidenceCount} ${evidenceCount === 1 ? "input" : "inputs"} added. Press Generate Quote and I'll turn them into line items.`}
        </p>
        <Button
          size="lg"
          onClick={onGenerate}
          disabled={!canGenerate}
          className="text-white w-full"
          style={{
            background: canGenerate
              ? "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)"
              : undefined,
          }}
        >
          {isGenerating ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Generating…
            </>
          ) : (
            <>
              <Sparkles className="w-4 h-4 mr-2" />
              Generate Quote
            </>
          )}
        </Button>
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
}: EditorPanelProps) {
  const lineItemCount = lineItems.length;

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
          <LineItemsTable
            rows={lineItems}
            catalogItems={catalogItems}
            activeLineItemId={activeLineItemId}
            highlightedLineItemIds={highlightedLineItemIds}
            onRowClick={onLineItemClick}
            onSave={onSaveLineItem}
            onDelete={onDeleteLineItem}
            onApplyCatalog={onApplyCatalog}
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

      <div
        className="flex-shrink-0 px-6 py-3 bg-white flex items-center justify-end gap-3"
        style={{ borderTop: `1px solid ${brand.border}` }}
      >
        <Button
          size="lg"
          onClick={onGeneratePDF}
          disabled={isGeneratingPDF || lineItems.length === 0}
          className="text-white"
          style={{
            background: "linear-gradient(135deg, #0d9488 0%, #0f766e 100%)",
          }}
        >
          {isGeneratingPDF ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Preparing PDF…
            </>
          ) : (
            <>
              <Download className="w-4 h-4 mr-2" />
              Generate PDF
            </>
          )}
        </Button>
      </div>
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
      <table className="w-full text-sm">
        <thead>
          <tr
            className="text-[10px] uppercase font-bold tracking-wider"
            style={{
              color: brand.navyMuted,
              backgroundColor: "#fafbfc",
            }}
          >
            <th className="text-left px-4 py-2 w-[38%]">Line item</th>
            <th className="text-right px-2 py-2 w-[10%]">Qty</th>
            <th className="text-left px-2 py-2 w-[10%]">Unit</th>
            <th className="text-right px-2 py-2 w-[12%]">Rate</th>
            <th className="text-right px-2 py-2 w-[12%]">Total</th>
            <th className="text-left px-2 py-2 w-[14%]">Type</th>
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

  return (
    <tr
      onClick={onRowClick}
      className="group cursor-pointer transition-colors hover:bg-slate-50"
      style={{
        backgroundColor: bgColor,
        borderTop: `1px solid ${brand.borderLight}`,
      }}
    >
      <td className="px-4 py-2 align-top">
        <ExpandingDescription
          value={row.description || ""}
          onChange={(v) => onSave(row.id, { description: v })}
        />
      </td>
      <td className="px-2 py-2 text-right">
        <Input
          defaultValue={row.quantity || ""}
          onChange={(e) => onSave(row.id, { quantity: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-right border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-auto py-0.5 w-full"
          style={{ color: brand.navy }}
          inputMode="decimal"
        />
      </td>
      <td className="px-2 py-2">
        <Input
          defaultValue={row.unit || ""}
          onChange={(e) => onSave(row.id, { unit: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-sm border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-auto py-0.5 w-full"
          style={{ color: brand.navy }}
          placeholder="each"
        />
      </td>
      <td className="px-2 py-2 text-right">
        <Input
          defaultValue={row.rate || ""}
          onChange={(e) => onSave(row.id, { rate: e.target.value })}
          onClick={(e) => e.stopPropagation()}
          className="text-sm text-right border-0 shadow-none focus-visible:ring-0 px-0 bg-transparent h-auto py-0.5 w-full"
          style={{ color: brand.navy }}
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
          <CatalogPicker
            catalogItems={catalogItems}
            onSelect={onApplyCatalog}
          />
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
function ExpandingDescription({
  value,
  onChange,
}: {
  value: string;
  onChange: (v: string) => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const [local, setLocal] = useState(value);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // Sync local state when external value changes (e.g. after refetch) and
  // the field isn't being edited. Same pattern as the page-level fields.
  useEffect(() => {
    if (!expanded) {
      setLocal(value);
    }
  }, [value, expanded]);

  // Auto-size the textarea to its content whenever it's expanded or
  // content changes. Cap at ~200px so a single row doesn't swallow the
  // viewport on a very long description.
  useEffect(() => {
    if (!expanded || !textareaRef.current) return;
    const el = textareaRef.current;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, 200)}px`;
  }, [expanded, local]);

  if (!expanded) {
    return (
      <div
        role="button"
        tabIndex={0}
        onClick={(e) => {
          e.stopPropagation();
          setExpanded(true);
        }}
        onKeyDown={(e) => {
          if (e.key === "Enter" || e.key === " ") {
            e.preventDefault();
            setExpanded(true);
          }
        }}
        className="text-sm cursor-text truncate py-0.5 hover:opacity-80"
        style={{ color: brand.navy }}
        title={value || "Item description"}
      >
        {value || (
          <span style={{ color: brand.navyMuted }}>Item description</span>
        )}
      </div>
    );
  }

  return (
    <Textarea
      ref={textareaRef}
      value={local}
      autoFocus
      onChange={(e) => {
        const next = e.target.value;
        setLocal(next);
        onChange(next);
      }}
      onClick={(e) => e.stopPropagation()}
      onBlur={() => setExpanded(false)}
      onKeyDown={(e) => {
        if (e.key === "Escape") {
          (e.target as HTMLTextAreaElement).blur();
        }
      }}
      className="text-sm border shadow-sm focus-visible:ring-1 focus-visible:ring-offset-0 px-2 py-1.5 resize-none leading-snug"
      style={{
        color: brand.navy,
        borderColor: brand.tealBorder,
        minHeight: 44,
      }}
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
