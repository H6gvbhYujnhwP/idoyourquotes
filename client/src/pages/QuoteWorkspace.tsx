import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  ArrowLeft,
  Upload,
  Brain,
  Calculator,
  FileText,
  Plus,
  Trash2,
  Save,
  Send,
  Download,
  Loader2,
  FileImage,
  Mic,
  Mail,
  X,
  Check,
  AlertTriangle,
  ExternalLink,
  Package,
  Sparkles,
  HelpCircle,
  AlertOctagon,
  ListChecks,
  PoundSterling,
  Wrench,
  MessageSquare,
  Clock,
  HardHat,
  FolderOpen,
  Layers,
  Shield,
  ChevronRight,
  ArrowRight,
  CheckCircle,
  FileSpreadsheet,
  RefreshCw,
  AlertCircle,
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import TimelineTab from "@/components/comprehensive/TimelineTab";
import SiteQualityTab from "@/components/comprehensive/SiteQualityTab";
import DocumentsTab from "@/components/comprehensive/DocumentsTab";
import DictationButton, { type DictationCommand } from "@/components/DictationButton";
import QuoteDraftSummary, { type QuoteDraftData } from "@/components/QuoteDraftSummary";
import InputsPanel from "@/components/InputsPanel";
import FileIcon from "@/components/FileIcon";
import { brand, symbolColors } from "@/lib/brandTheme";
import TakeoffPanel from "@/components/TakeoffPanel";

type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

interface LineItem {
  id: number;
  description: string;
  quantity: string | null;
  unit: string | null;
  rate: string | null;
  total: string | null;
}

interface QuoteInput {
  id: number;
  inputType: string;
  filename: string | null;
  fileUrl: string | null;
  fileKey: string | null;
  content: string | null;
  mimeType: string | null;
  createdAt: Date;
  processedContent: string | null;
  processingStatus: string | null;
  processingError: string | null;
}

const statusConfig: Record<QuoteStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "status-draft" },
  sent: { label: "Sent", className: "status-sent" },
  accepted: { label: "Accepted", className: "status-accepted" },
  declined: { label: "Declined", className: "status-declined" },
};

// File type configurations
const fileTypeConfig = {
  pdf: {
    accept: ".pdf",
    mimeTypes: ["application/pdf"],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
  image: {
    accept: ".jpg,.jpeg,.png,.gif,.webp,.bmp",
    mimeTypes: ["image/jpeg", "image/png", "image/gif", "image/webp", "image/bmp"],
    maxSize: 10 * 1024 * 1024, // 10MB
  },
  audio: {
    accept: ".mp3,.wav,.m4a,.ogg,.webm",
    mimeTypes: ["audio/mpeg", "audio/wav", "audio/mp4", "audio/ogg", "audio/webm"],
    maxSize: 50 * 1024 * 1024, // 50MB
  },
  document: {
    accept: ".pdf,.doc,.docx,.xls,.xlsx,.csv",
    mimeTypes: [
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
      "application/vnd.ms-excel",
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
      "text/csv",
      "application/csv"
    ],
    maxSize: 20 * 1024 * 1024, // 20MB
  },
};

export default function QuoteWorkspace() {
  const params = useParams<{ id: string }>();
  const quoteId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("inputs");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);
  const [termsModified, setTermsModified] = useState(false);
  const [originalTerms, setOriginalTerms] = useState("");
  const [voiceNoteCount, setVoiceNoteCount] = useState(0);
  const [selectedInputId, setSelectedInputId] = useState<number | null>(null);
  const [isDictating, setIsDictating] = useState(false);
  const [voiceSummary, setVoiceSummary] = useState<QuoteDraftData | null>(null);
  const [isSummaryLoading, setIsSummaryLoading] = useState(false);

  // File input refs (legacy single-file refs kept for backward compat)
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);
  const documentInputRef = useRef<HTMLInputElement>(null);

  // Multi-file upload state
  const multiFileInputRef = useRef<HTMLInputElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploadQueue, setUploadQueue] = useState<Array<{
    id: string;
    file: File;
    status: "pending" | "uploading" | "processing" | "completed" | "error";
    progress: number;
    error?: string;
    isRateLimitError?: boolean;
    inputId?: number;
  }>>([]); 

  // Form state
  const [title, setTitle] = useState("");
  const [clientName, setClientName] = useState("");
  const [clientEmail, setClientEmail] = useState("");
  const [clientPhone, setClientPhone] = useState("");
  const [clientAddress, setClientAddress] = useState("");
  const [description, setDescription] = useState("");
  const [terms, setTerms] = useState("");
  const [taxRate, setTaxRate] = useState("0");

  // Internal estimate state
  const [internalNotes, setInternalNotes] = useState("");
  const [riskNotes, setRiskNotes] = useState("");

  // Tender context state
  const [tenderNotes, setTenderNotes] = useState("");

  // New line item state
  const [newItemDescription, setNewItemDescription] = useState("");
  const [newItemQuantity, setNewItemQuantity] = useState("1");
  const [newItemUnit, setNewItemUnit] = useState("each");
  const [newItemRate, setNewItemRate] = useState("");

  // New text input state
  const [newTextInput, setNewTextInput] = useState("");

  // Catalog picker state
  const [showCatalogPicker, setShowCatalogPicker] = useState(false);

  // AI Assistant state
  const [aiResponse, setAiResponse] = useState<string | null>(null);
  const [aiLoading, setAiLoading] = useState(false);
  const [customPrompt, setCustomPrompt] = useState("");

  // Generate Draft state
  const [userPrompt, setUserPrompt] = useState(""); // For pasting email/instructions
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [processingInputId, setProcessingInputId] = useState<number | null>(null);

  // Generate Email modal state
  const [showEmailModal, setShowEmailModal] = useState(false);
  const [isGeneratingEmail, setIsGeneratingEmail] = useState(false);
  const [emailSubject, setEmailSubject] = useState("");
  const [emailHtmlBody, setEmailHtmlBody] = useState("");
  const [emailTextBody, setEmailTextBody] = useState("");

  // Track if any inputs are currently processing for auto-refresh
  const [hasProcessingInputs, setHasProcessingInputs] = useState(false);

  const { data: fullQuote, isLoading, error, refetch } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    { 
      enabled: quoteId > 0,
      retry: 1,
      // Poll every 3 seconds when there are inputs being processed
      refetchInterval: hasProcessingInputs ? 3000 : false,
    }
  );

  // Update processing state whenever fullQuote changes
  useEffect(() => {
    if (fullQuote?.inputs) {
      const isProcessing = fullQuote.inputs.some(
        (input: QuoteInput) => input.processingStatus === "processing"
      );
      setHasProcessingInputs(isProcessing);
    }
  }, [fullQuote?.inputs]);

  const { data: storageStatus } = trpc.inputs.storageStatus.useQuery();

  // Fetch catalog items for quick-add
  const { data: catalogItems } = trpc.catalog.list.useQuery();

  // Fetch takeoff data for all inputs on this quote
  const { data: takeoffList, refetch: refetchTakeoffs } = trpc.electricalTakeoff.list.useQuery(
    { quoteId },
    {
      enabled: quoteId > 0,
      refetchInterval: 3000, // Poll every 3s to catch takeoff updates
      refetchOnWindowFocus: true,
    }
  );

  // Helper to find takeoff for a specific input
  const getTakeoffForInput = (inputId: number) => {
    if (!takeoffList) return null;
    return (takeoffList as any[]).find((t: any) => t.inputId === inputId) || null;
  };

  const updateQuote = trpc.quotes.update.useMutation({
    onSuccess: () => {
      toast.success("Quote saved");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to save: " + error.message);
    },
  });

  const createLineItem = trpc.lineItems.create.useMutation({
    onSuccess: () => {
      setNewItemDescription("");
      setNewItemQuantity("1");
      setNewItemUnit("each");
      setNewItemRate("");
      refetch();
    },
    onError: (error) => {
      toast.error("Failed to add item: " + error.message);
    },
  });

  const deleteLineItem = trpc.lineItems.delete.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });

  const updateLineItem = trpc.lineItems.update.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => toast.error("Failed to update: " + error.message),
  });

  const updateProfile = trpc.auth.updateProfile.useMutation({
    onSuccess: () => {
      toast.success("Default T&C saved to your profile");
      setTermsModified(false);
      setOriginalTerms(terms);
    },
    onError: (error) => toast.error("Failed to save default T&C: " + error.message),
  });

  // State for inline editing
  const [editingItemId, setEditingItemId] = useState<number | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [editValue, setEditValue] = useState<string>("");

  const handleStartEdit = (itemId: number, field: string, currentValue: string) => {
    setEditingItemId(itemId);
    setEditingField(field);
    setEditValue(currentValue || "");
  };

  const handleSaveEdit = (itemId: number, field: string) => {
    const updateData: any = {
      id: itemId,
      quoteId,
    };
    updateData[field] = editValue;
    updateLineItem.mutate(updateData);
    setEditingItemId(null);
    setEditingField(null);
    setEditValue("");
  };

  const handleCancelEdit = () => {
    setEditingItemId(null);
    setEditingField(null);
    setEditValue("");
  };

  const handleKeyDown = (e: React.KeyboardEvent, itemId: number, field: string) => {
    if (e.key === "Enter") {
      handleSaveEdit(itemId, field);
    } else if (e.key === "Escape") {
      handleCancelEdit();
    }
  };

  const createInput = trpc.inputs.create.useMutation({
    onSuccess: () => {
      setNewTextInput("");
      refetch();
    },
    onError: (error) => toast.error("Failed to add input: " + error.message),
  });

  const uploadFile = trpc.inputs.uploadFile.useMutation({
    onSuccess: () => {
      refetch();
    },
    onError: (error) => {
      toast.error("Upload failed: " + error.message);
    },
  });

  const deleteInput = trpc.inputs.delete.useMutation({
    onSuccess: () => refetch(),
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });

  const upsertTenderContext = trpc.tenderContext.upsert.useMutation({
    onSuccess: () => {
      toast.success("Interpretation saved");
      refetch();
    },
    onError: (error) => toast.error("Failed to save: " + error.message),
  });

  const upsertInternalEstimate = trpc.internalEstimate.upsert.useMutation({
    onSuccess: () => {
      toast.success("Internal estimate saved");
      refetch();
    },
    onError: (error) => toast.error("Failed to save: " + error.message),
  });

  const updateStatus = trpc.quotes.updateStatus.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote marked as ${data.status}`);
      refetch();
    },
    onError: (error) => toast.error("Failed to update status: " + error.message),
  });

  const askAI = trpc.ai.askAboutQuote.useMutation({
    onMutate: () => {
      setAiLoading(true);
      setAiResponse(null);
    },
    onSuccess: (data) => {
      setAiResponse(data.response);
      setAiLoading(false);
    },
    onError: (error) => {
      toast.error("AI request failed: " + error.message);
      setAiLoading(false);
    },
  });

  const handleAskAI = (promptType: "missed" | "risks" | "assumptions" | "pricing" | "issues" | "custom") => {
    askAI.mutate({
      quoteId,
      promptType,
      customPrompt: promptType === "custom" ? customPrompt : undefined,
    });
  };

  // AI Processing mutations
  const transcribeAudio = trpc.inputs.transcribeAudio.useMutation({
    onMutate: ({ inputId }) => {
      setProcessingInputId(inputId);
    },
    onSuccess: (data) => {
      toast.success("Audio transcribed successfully");
      setProcessingInputId(null);
      refetch();
    },
    onError: (error) => {
      toast.error("Transcription failed: " + error.message);
      setProcessingInputId(null);
    },
  });

  const extractPdfText = trpc.inputs.extractPdfText.useMutation({
    onMutate: ({ inputId }) => {
      setProcessingInputId(inputId);
    },
    onSuccess: () => {
      toast.success("PDF text extracted successfully");
      setProcessingInputId(null);
      refetch();
    },
    onError: (error) => {
      toast.error("PDF extraction failed: " + error.message);
      setProcessingInputId(null);
    },
  });

  const analyzeImage = trpc.inputs.analyzeImage.useMutation({
    onMutate: ({ inputId }) => {
      setProcessingInputId(inputId);
    },
    onSuccess: () => {
      toast.success("Image analyzed successfully");
      setProcessingInputId(null);
      refetch();
    },
    onError: (error) => {
      toast.error("Image analysis failed: " + error.message);
      setProcessingInputId(null);
    },
  });

  const generateDraft = trpc.ai.generateDraft.useMutation({
    onMutate: () => {
      setIsGeneratingDraft(true);
    },
    onSuccess: () => {
      toast.success("Quote draft generated! Review the Quote tab.");
      setIsGeneratingDraft(false);
      setActiveTab("quote");
      refetch();
    },
    onError: (error) => {
      toast.error("Draft generation failed: " + error.message);
      setIsGeneratingDraft(false);
    },
  });

  const generatePDF = trpc.quotes.generatePDF.useMutation();

  // Trade relevance pre-check (Option A guardrail)
  const tradeRelevanceCheck = trpc.ai.tradeRelevanceCheck.useMutation();

  // Dictation summary parser (Option C)
  const parseDictationSummary = trpc.ai.parseDictationSummary.useMutation();
  const saveVoiceNoteSummary = trpc.ai.saveVoiceNoteSummary.useMutation();

  const generateEmail = trpc.quotes.generateEmail.useMutation({
    onMutate: () => {
      setIsGeneratingEmail(true);
    },
    onSuccess: (data) => {
      setEmailSubject(data.subject);
      setEmailHtmlBody(data.htmlBody);
      setEmailTextBody(data.textBody);
      setIsGeneratingEmail(false);
      setShowEmailModal(true);
    },
    onError: (error) => {
      toast.error("Email generation failed: " + error.message);
      setIsGeneratingEmail(false);
    },
  });

  const handleProcessInput = (input: QuoteInput) => {
    if (input.inputType === "audio") {
      transcribeAudio.mutate({ inputId: input.id, quoteId });
    } else if (input.inputType === "pdf" || input.inputType === "document") {
      // Documents (Word, Excel) are auto-processed on upload, but PDF needs Claude
      extractPdfText.mutate({ inputId: input.id, quoteId });
    } else if (input.inputType === "image") {
      analyzeImage.mutate({ inputId: input.id, quoteId });
    }
  };

  const handleGenerateDraft = async () => {
    // Check if line items already exist - show confirmation dialog
    if (lineItems && lineItems.length > 0) {
      if (!window.confirm("This will replace all existing line items. Continue?")) {
        return;
      }
    }

    // Option A: Pre-generation trade relevance check
    if (inputs && inputs.length > 0) {
      try {
        setIsGeneratingDraft(true);
        const check = await tradeRelevanceCheck.mutateAsync({ quoteId });
        if (!check.relevant) {
          setIsGeneratingDraft(false);
          const proceed = window.confirm(
            `⚠️ This doesn't seem to relate to your trade:\n\n"${check.message}"\n\nGenerate anyway?`
          );
          if (!proceed) return;
        }
      } catch (err) {
        console.warn("[tradeRelevanceCheck] Failed, proceeding:", err);
      }
    }

    generateDraft.mutate({
      quoteId,
      userPrompt: userPrompt || undefined,
    });
  };

  // Analyse voice notes and update the quote draft summary
  const triggerVoiceAnalysis = async () => {
    try {
      setIsSummaryLoading(true);
      const result = await parseDictationSummary.mutateAsync({ quoteId });
      if (result.hasSummary && result.summary) {
        // Convert to QuoteDraftData format — mark all materials as voice-sourced
        const parsed = result.summary as any;
        setVoiceSummary({
          clientName: parsed.clientName || null,
          jobDescription: parsed.jobDescription || "",
          labour: parsed.labour || [],
          materials: (parsed.materials || []).map((m: any) => ({ ...m, source: "voice" as const })),
          markup: parsed.markup ?? null,
          sundries: parsed.sundries ?? null,
          contingency: parsed.contingency ?? null,
          notes: parsed.notes ?? null,
        });

        // Auto-name the quote: ClientName — DD/MM/YYYY (if title is empty)
        if (!title && parsed.clientName) {
          const today = new Date().toLocaleDateString("en-GB");
          const autoTitle = `${parsed.clientName} — ${today}`;
          setTitle(autoTitle);
          updateQuote.mutate({ id: quoteId, title: autoTitle, clientName: parsed.clientName });
        } else if (parsed.clientName && !clientName) {
          // At least save the client name
          setClientName(parsed.clientName);
          updateQuote.mutate({ id: quoteId, clientName: parsed.clientName });
        }
      } else {
        toast.error("Could not parse dictation");
      }
    } catch (err) {
      console.warn("[parseDictationSummary] Failed:", err);
      toast.error("Could not parse dictation");
    } finally {
      setIsSummaryLoading(false);
    }
  };

  const handleGenerateEmail = () => {
    generateEmail.mutate({ id: quoteId });
  };

  const copyToClipboard = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${label} copied to clipboard`);
    } catch (err) {
      toast.error("Failed to copy to clipboard");
    }
  };

  const copyHtmlToClipboard = async (html: string, label: string) => {
    try {
      // Try to copy as HTML for rich paste in email clients
      const blob = new Blob([html], { type: "text/html" });
      const clipboardItem = new ClipboardItem({ "text/html": blob });
      await navigator.clipboard.write([clipboardItem]);
      toast.success(`${label} copied (HTML format)`);
    } catch (err) {
      // Fallback to plain text
      try {
        await navigator.clipboard.writeText(emailTextBody);
        toast.success(`${label} copied (plain text)`);
      } catch (e) {
        toast.error("Failed to copy to clipboard");
      }
    }
  };

  // Initialize form state from loaded data
  useEffect(() => {
    if (fullQuote?.quote) {
      setTitle(fullQuote.quote.title || "");
      setClientName(fullQuote.quote.clientName || "");
      setClientEmail(fullQuote.quote.clientEmail || "");
      setClientPhone(fullQuote.quote.clientPhone || "");
      setClientAddress(fullQuote.quote.clientAddress || "");
      setDescription(fullQuote.quote.description || "");
      setTerms(fullQuote.quote.terms || "");
      setOriginalTerms(fullQuote.quote.terms || "");
      setTermsModified(false);
      setTaxRate(fullQuote.quote.taxRate || "0");
      // Restore saved instruction text
      if ((fullQuote.quote as any).userPrompt) {
        setUserPrompt((fullQuote.quote as any).userPrompt);
      }
    }
    if (fullQuote?.tenderContext) {
      setTenderNotes(fullQuote.tenderContext.notes || "");
    }
    if (fullQuote?.internalEstimate) {
      setInternalNotes(fullQuote.internalEstimate.notes || "");
      setRiskNotes(fullQuote.internalEstimate.riskNotes || "");
    }
  }, [fullQuote]);

  const handleSaveQuote = async () => {
    setIsSaving(true);
    try {
      await updateQuote.mutateAsync({
        id: quoteId,
        title,
        clientName,
        clientEmail,
        clientPhone,
        clientAddress,
        description,
        terms,
        taxRate,
        userPrompt: userPrompt || null,
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Use tRPC mutation to generate PDF HTML
      const result = await generatePDF.mutateAsync({ id: quoteId });
      
      if (!result?.html) {
        throw new Error("No HTML content received from server");
      }

      // Open in new window for printing/saving as PDF
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(result.html);
        printWindow.document.close();
        
        // Wait for content to load, then trigger print
        printWindow.onload = () => {
          setTimeout(() => {
            printWindow.print();
          }, 250);
        };
      } else {
        toast.error("Please allow popups to generate PDF");
      }
    } catch (error) {
      console.error("PDF generation error:", error);
      toast.error("Failed to generate PDF");
    } finally {
      setIsGeneratingPDF(false);
    }
  };

  const handleAddLineItem = () => {
    if (!newItemDescription.trim()) {
      toast.error("Please enter a description");
      return;
    }
    createLineItem.mutate({
      quoteId,
      description: newItemDescription,
      quantity: newItemQuantity,
      unit: newItemUnit,
      rate: newItemRate || "0",
    });
  };

  const handleAddTextInput = () => {
    if (!newTextInput.trim()) {
      toast.error("Please enter some text");
      return;
    }
    createInput.mutate({
      quoteId,
      inputType: "text",
      content: newTextInput,
    });
  };

  // Voice dictation command handler
  const handleDictationCommand = (command: DictationCommand) => {
    switch (command.type) {
      case "add": {
        const noteNum = voiceNoteCount + 1;
        setVoiceNoteCount(noteNum);
        createInput.mutate({
          quoteId,
          inputType: "audio",
          content: command.text,
          filename: `Voice Note ${noteNum} — ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
        }, {
          onSuccess: () => {
            toast.success(`Voice Note ${noteNum} saved`);
            // Auto-analyse after saving — small delay to let the input be indexed
            setTimeout(() => triggerVoiceAnalysis(), 500);
          },
        });
        break;
      }
      case "remove": {
        // Find the last voice dictation input and delete it
        if (inputs && inputs.length > 0) {
          const voiceInputs = [...inputs]
            .filter((inp: QuoteInput) => inp.inputType === "audio" && inp.content && !inp.fileUrl)
            .sort((a: QuoteInput, b: QuoteInput) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (voiceInputs.length > 0) {
            const lastVoice = voiceInputs[0];
            deleteInput.mutate({ id: lastVoice.id, quoteId });
            setVoiceNoteCount(Math.max(0, voiceNoteCount - 1));
            toast.success("Last voice note removed");
          } else {
            toast.error("No voice notes to remove");
          }
        } else {
          toast.error("No voice notes to remove");
        }
        break;
      }
      case "change": {
        // Replace the last voice dictation with new text
        if (inputs && inputs.length > 0) {
          const voiceInputs = [...inputs]
            .filter((inp: QuoteInput) => inp.inputType === "audio" && inp.content && !inp.fileUrl)
            .sort((a: QuoteInput, b: QuoteInput) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());
          
          if (voiceInputs.length > 0) {
            const lastVoice = voiceInputs[0];
            // Delete the old one and create a replacement
            deleteInput.mutate({ id: lastVoice.id, quoteId });
            createInput.mutate({
              quoteId,
              inputType: "audio",
              content: command.text,
              filename: lastVoice.filename || `Voice Note (updated) — ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
            });
            toast.success("Voice note updated");
          } else {
            // No previous note to change — save as new
            const noteNum = voiceNoteCount + 1;
            setVoiceNoteCount(noteNum);
            createInput.mutate({
              quoteId,
              inputType: "audio",
              content: command.text,
              filename: `Voice Note ${noteNum} — ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
            });
            toast.success(`Voice Note ${noteNum} saved`);
          }
        }
        break;
      }
      case "build_with_text": {
        // Save the text first, then trigger generation
        const noteNum = voiceNoteCount + 1;
        setVoiceNoteCount(noteNum);
        createInput.mutate({
          quoteId,
          inputType: "audio",
          content: command.text,
          filename: `Voice Note ${noteNum} — ${new Date().toLocaleString("en-GB", { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" })}`,
        }, {
          onSuccess: () => {
            toast.success(`Voice Note ${noteNum} saved — generating quote...`);
            // Small delay to let the input be indexed, then generate
            setTimeout(() => {
              handleGenerateDraft();
            }, 500);
          },
        });
        break;
      }
      case "build": {
        toast.success("Generating your quote...");
        handleGenerateDraft();
        break;
      }
    }
  };

  const handleFileUpload = async (
    file: File,
    inputType: "pdf" | "image" | "audio" | "document"
  ) => {
    const config = fileTypeConfig[inputType];

    // Validate file size
    if (file.size > config.maxSize) {
      toast.error(`File too large. Maximum size is ${config.maxSize / 1024 / 1024}MB`);
      return;
    }

    // Validate file type
    if (!config.mimeTypes.includes(file.type)) {
      toast.error(`Invalid file type. Accepted types: ${config.accept}`);
      return;
    }

    setIsUploading(true);
    setUploadingType(inputType);

    try {
      // Convert file to base64
      const reader = new FileReader();
      const base64Promise = new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          // Remove data URL prefix to get pure base64
          const base64 = result.split(",")[1];
          resolve(base64);
        };
        reader.onerror = reject;
      });
      reader.readAsDataURL(file);

      const base64Data = await base64Promise;

      await uploadFile.mutateAsync({
        quoteId,
        filename: file.name,
        contentType: file.type,
        base64Data,
        inputType,
      });
    } catch (error) {
      console.error("Upload error:", error);
    } finally {
      setIsUploading(false);
      setUploadingType(null);
    }
  };

  const handleFileInputChange = (
    event: React.ChangeEvent<HTMLInputElement>,
    inputType: "pdf" | "image" | "audio" | "document"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file, inputType);
    }
    // Reset input so same file can be selected again
    event.target.value = "";
  };

  // ── Multi-file upload helpers ──────────────────────────────────────
  const detectInputType = (file: File): "pdf" | "image" | "audio" | "document" => {
    if (file.type === "application/pdf") return "pdf";
    if (file.type.startsWith("image/")) return "image";
    if (file.type.startsWith("audio/")) return "audio";
    return "document";
  };

  const fileNeedsAI = (file: File) => {
    return file.type === "application/pdf" || file.type.startsWith("image/") || file.type.startsWith("audio/");
  };

  const uploadSingleFileFromQueue = async (file: File, queueId: string) => {
    const inputType = detectInputType(file);
    const config = fileTypeConfig[inputType];

    // Validate file size
    if (file.size > config.maxSize) {
      setUploadQueue(prev => prev.map(item =>
        item.id === queueId ? { ...item, status: "error" as const, error: `File too large (max ${config.maxSize / 1024 / 1024}MB)` } : item
      ));
      return;
    }

    try {
      // Mark as uploading
      setUploadQueue(prev => prev.map(item =>
        item.id === queueId ? { ...item, status: "uploading" as const, progress: 20 } : item
      ));

      // Convert to base64
      const reader = new FileReader();
      const base64Data = await new Promise<string>((resolve, reject) => {
        reader.onload = () => {
          const result = reader.result as string;
          resolve(result.split(",")[1]);
        };
        reader.onerror = reject;
        reader.readAsDataURL(file);
      });

      setUploadQueue(prev => prev.map(item =>
        item.id === queueId ? { ...item, progress: 50 } : item
      ));

      // Upload
      const result = await uploadFile.mutateAsync({
        quoteId,
        filename: file.name,
        contentType: file.type,
        base64Data,
        inputType,
      });

      // Mark as completed and store inputId for potential retry
      setUploadQueue(prev => prev.map(item =>
        item.id === queueId ? { ...item, status: "completed" as const, progress: 100, inputId: result?.id } : item
      ));
    } catch (error: any) {
      // Detect rate limit errors
      const isRateLimit =
        error.message?.includes("rate_limit") ||
        error.message?.includes("429") ||
        error.message?.includes("30,000 input tokens");

      setUploadQueue(prev => prev.map(item =>
        item.id === queueId ? {
          ...item,
          status: "error" as const,
          progress: 0,
          error: isRateLimit ? "Rate limit exceeded" : (error.message || "Upload failed"),
          isRateLimitError: isRateLimit,
        } : item
      ));

      if (isRateLimit) {
        toast.error(
          "Rate limit exceeded. File uploaded but AI processing failed. Wait 60 seconds then click Retry.",
          { duration: 10000 }
        );
      }
    }
  };

  const processUploadSequentially = async (items: Array<{ id: string; file: File }>) => {
    for (let i = 0; i < items.length; i++) {
      const item = items[i];
      await uploadSingleFileFromQueue(item.file, item.id);

      // Add delay between AI-processed files to avoid rate limits
      if (i < items.length - 1) {
        const currentNeedsAI = fileNeedsAI(item.file);
        const nextNeedsAI = fileNeedsAI(items[i + 1].file);

        if (currentNeedsAI && nextNeedsAI) {
          const delaySeconds = 15;
          toast.info(
            `Waiting ${delaySeconds}s before next file to avoid rate limits...`,
            { duration: delaySeconds * 1000 }
          );
          await new Promise(resolve => setTimeout(resolve, delaySeconds * 1000));
        }
      }
    }
    refetch();
    const completed = items.length;
    toast.success(`All ${completed} file${completed > 1 ? "s" : ""} processed successfully!`);
  };

  const enforceFileLimit = (files: File[]): File[] | null => {
    if (files.length > 3) {
      toast.error(
        `Maximum 3 files at once to avoid rate limits. You selected ${files.length}. Please select up to 3 files.`,
        { duration: 5000 }
      );
      return null;
    }
    return files;
  };

  const handleMultiFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const rawFiles = Array.from(e.target.files || []);
    if (rawFiles.length === 0) return;
    e.target.value = "";

    const files = enforceFileLimit(rawFiles);
    if (!files) return;

    // Warn about large PDF batches
    const totalSizeMB = files.reduce((sum, f) => sum + (f.size / 1024 / 1024), 0);
    const pdfCount = files.filter(f => f.type === "application/pdf").length;

    if (pdfCount >= 2 && totalSizeMB > 30) {
      const confirmed = window.confirm(
        `You're uploading ${pdfCount} large PDFs (${totalSizeMB.toFixed(1)} MB total).\n\n` +
        `Files will be processed one at a time with delays to avoid rate limits.\n` +
        `This may take 1-2 minutes. Continue?`
      );
      if (!confirmed) return;
    }

    const newItems = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: "pending" as const,
      progress: 0,
    }));

    setUploadQueue(prev => [...prev, ...newItems]);
    processUploadSequentially(newItems);
  };

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const allFiles = Array.from(e.dataTransfer.files);
    const supported = allFiles.filter(file => {
      const ext = file.name.split(".").pop()?.toLowerCase();
      return ["pdf", "doc", "docx", "xls", "xlsx", "csv", "png", "jpg", "jpeg", "gif", "webp", "bmp", "mp3", "wav", "m4a", "ogg", "webm"].includes(ext || "");
    });
    if (supported.length === 0) {
      toast.error("No supported files found. Upload PDF, Word, Excel, Image, or Audio files.");
      return;
    }
    const files = enforceFileLimit(supported);
    if (!files) return;

    const newItems = files.map(file => ({
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      file,
      status: "pending" as const,
      progress: 0,
    }));
    setUploadQueue(prev => [...prev, ...newItems]);
    processUploadSequentially(newItems);
  };

  const removeFromQueue = (queueId: string) => {
    setUploadQueue(prev => prev.filter(item => item.id !== queueId));
  };

  const clearCompletedUploads = () => {
    setUploadQueue(prev => prev.filter(item => item.status !== "completed" && item.status !== "error"));
  };

  const handleRetryUpload = async (queueId: string) => {
    const item = uploadQueue.find(i => i.id === queueId);
    if (!item) return;

    // If we have an inputId, retry just the AI processing
    if (item.inputId) {
      setUploadQueue(prev => prev.map(i =>
        i.id === queueId ? { ...i, status: "processing" as const, progress: 60, error: undefined, isRateLimitError: false } : i
      ));
      try {
        const fileType = item.file.type;
        if (fileType === "application/pdf") {
          await extractPdfText.mutateAsync({ inputId: item.inputId, quoteId });
        } else if (fileType.startsWith("image/")) {
          await analyzeImage.mutateAsync({ inputId: item.inputId, quoteId });
        } else if (fileType.startsWith("audio/")) {
          await transcribeAudio.mutateAsync({ inputId: item.inputId, quoteId });
        }
        setUploadQueue(prev => prev.map(i =>
          i.id === queueId ? { ...i, status: "completed" as const, progress: 100 } : i
        ));
        toast.success("Processing complete!");
        refetch();
      } catch (error: any) {
        const isRateLimit = error.message?.includes("rate_limit") || error.message?.includes("429");
        setUploadQueue(prev => prev.map(i =>
          i.id === queueId ? {
            ...i,
            status: "error" as const,
            error: isRateLimit ? "Rate limit exceeded" : error.message,
            isRateLimitError: isRateLimit,
          } : i
        ));
        if (isRateLimit) {
          toast.error("Still rate limited. Please wait another 60 seconds and try again.");
        }
      }
    } else {
      // Re-upload the whole file
      await uploadSingleFileFromQueue(item.file, queueId);
      refetch();
    }
  };

  const getFileIcon = (file: File) => {
    if (file.type === "application/pdf") return <FileText className="h-5 w-5 text-red-500" />;
    if (file.type.startsWith("image/")) return <FileImage className="h-5 w-5 text-blue-500" />;
    if (file.type.startsWith("audio/")) return <Mic className="h-5 w-5 text-green-500" />;
    if (file.type.includes("spreadsheet") || file.type.includes("excel") || file.type.includes("csv")) return <FileSpreadsheet className="h-5 w-5 text-green-600" />;
    if (file.type.includes("word") || file.type.includes("document")) return <FileText className="h-5 w-5 text-blue-600" />;
    return <FileText className="h-5 w-5 text-muted-foreground" />;
  };

  const handleSaveTenderContext = () => {
    upsertTenderContext.mutate({
      quoteId,
      notes: tenderNotes,
    });
  };

  const handleSaveInternalEstimate = () => {
    upsertInternalEstimate.mutate({
      quoteId,
      notes: internalNotes,
      riskNotes,
    });
  };

  if (isLoading) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <p className="text-muted-foreground">Loading quote...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <AlertTriangle className="h-12 w-12 text-destructive" />
        <h2 className="text-xl font-semibold">Error loading quote</h2>
        <p className="text-muted-foreground text-center max-w-md">
          {error.message || "An unexpected error occurred while loading the quote."}
        </p>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => refetch()}>
            Try Again
          </Button>
          <Button variant="outline" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="mr-2 h-4 w-4" />
            Back to Dashboard
          </Button>
        </div>
      </div>
    );
  }

  if (!fullQuote?.quote) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] gap-4">
        <FileText className="h-12 w-12 text-muted-foreground" />
        <h2 className="text-xl font-semibold">Quote not found</h2>
        <p className="text-muted-foreground">The quote you're looking for doesn't exist or you don't have access to it.</p>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { quote, lineItems, inputs } = fullQuote;
  const status = quote.status as QuoteStatus;
  const isComprehensive = (quote as any).quoteMode === "comprehensive";
  const comprehensiveConfig = (quote as any).comprehensiveConfig;

  return (
    <div className="space-y-6">
      {/* Hidden file inputs */}
      <input
        type="file"
        ref={pdfInputRef}
        className="hidden"
        accept={fileTypeConfig.pdf.accept}
        onChange={(e) => handleFileInputChange(e, "pdf")}
      />
      <input
        type="file"
        ref={imageInputRef}
        className="hidden"
        accept={fileTypeConfig.image.accept}
        onChange={(e) => handleFileInputChange(e, "image")}
      />
      <input
        type="file"
        ref={audioInputRef}
        className="hidden"
        accept={fileTypeConfig.audio.accept}
        onChange={(e) => handleFileInputChange(e, "audio")}
      />
      <input
        type="file"
        ref={documentInputRef}
        className="hidden"
        accept={fileTypeConfig.document.accept}
        onChange={(e) => handleFileInputChange(e, "document")}
      />
      <input
        type="file"
        ref={multiFileInputRef}
        className="hidden"
        multiple
        accept=".pdf,.doc,.docx,.xls,.xlsx,.csv,.jpg,.jpeg,.png,.gif,.webp,.bmp,.mp3,.wav,.m4a,.ogg,.webm"
        onChange={handleMultiFileSelect}
      />

      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div className="flex items-center gap-4">
          <Button variant="ghost" size="icon" onClick={() => setLocation("/dashboard")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <div className="flex items-center gap-3">
              <input
                type="text"
                value={title || ""}
                onChange={(e) => setTitle(e.target.value)}
                onBlur={() => {
                  if (title !== (quote.title || "")) {
                    updateQuote.mutate({ id: quoteId, title });
                  }
                }}
                placeholder={quote.reference || `Quote #${quote.id}`}
                className="text-2xl font-bold tracking-tight bg-transparent border-none outline-none focus:ring-0 p-0 w-auto min-w-[120px] placeholder:text-muted-foreground/40"
                style={{ color: brand.navy, maxWidth: "500px" }}
              />
              <Badge className={statusConfig[status].className}>
                {statusConfig[status].label}
              </Badge>
              {isComprehensive && (
                <Badge variant="outline" className="flex items-center gap-1">
                  <Layers className="h-3 w-3" /> Comprehensive
                </Badge>
              )}
            </div>
            <p className="text-muted-foreground">
              {quote.clientName || "No client specified"}
              {isComprehensive && (quote as any).tradePreset && (
                <span className="ml-2 text-xs bg-muted px-2 py-0.5 rounded capitalize">
                  {((quote as any).tradePreset || "").replace(/_/g, " ")}
                </span>
              )}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button 
            onClick={handleGenerateDraft} 
            disabled={isGeneratingDraft}
            className="bg-gradient-to-r from-purple-600 to-indigo-600 hover:from-purple-700 hover:to-indigo-700 text-white"
          >
            {isGeneratingDraft ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Sparkles className="mr-2 h-4 w-4" />}
            {lineItems && lineItems.length > 0 ? "Regenerate Draft" : "Generate Draft"}
          </Button>
          <Button variant="outline" onClick={handleSaveQuote} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          <Button variant="outline" onClick={handleGeneratePDF} disabled={isGeneratingPDF}>
            {isGeneratingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            PDF
          </Button>
          <Button 
            variant="outline" 
            onClick={handleGenerateEmail} 
            disabled={isGeneratingEmail || !quote.clientName}
            title={!quote.clientName ? "Add client details first" : "Generate email to send quote"}
          >
            {isGeneratingEmail ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Mail className="mr-2 h-4 w-4" />}
            Email
          </Button>
          {status === "draft" && (
            <Button 
              onClick={() => {
                if (window.confirm("Mark this quote as sent? This indicates the quote has been delivered to the client.")) {
                  updateStatus.mutate({ id: quoteId, status: "sent" });
                }
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Send className="mr-2 h-4 w-4" />}
              Mark as Sent
            </Button>
          )}
          {status === "sent" && (
            <>
              <Button 
                onClick={() => {
                  if (window.confirm("Mark this quote as accepted? This indicates the client has approved the quote.")) {
                    updateStatus.mutate({ id: quoteId, status: "accepted" });
                  }
                }}
                disabled={updateStatus.isPending}
                className="bg-green-600 hover:bg-green-700"
              >
                {updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Check className="mr-2 h-4 w-4" />}
                Mark Accepted
              </Button>
              <Button 
                variant="outline"
                onClick={() => {
                  if (window.confirm("Mark this quote as declined?")) {
                    updateStatus.mutate({ id: quoteId, status: "declined" });
                  }
                }}
                disabled={updateStatus.isPending}
              >
                <X className="mr-2 h-4 w-4" />
                Declined
              </Button>
            </>
          )}
          {(status === "accepted" || status === "declined") && (
            <Button 
              variant="outline"
              onClick={() => {
                if (window.confirm("Revert this quote back to draft status?")) {
                  updateStatus.mutate({ id: quoteId, status: "draft" });
                }
              }}
              disabled={updateStatus.isPending}
            >
              {updateStatus.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ArrowLeft className="mr-2 h-4 w-4" />}
              Revert to Draft
            </Button>
          )}
        </div>
      </div>

      {/* Main Content with Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-6">
        {/* Grouped Tab Navigation - Visual Flow */}
        <div className="flex flex-col md:flex-row items-stretch gap-0 overflow-hidden">
          {/* STEP 1: INPUT */}
          <div className="flex-1 bg-blue-50 border border-blue-200 rounded-l-xl md:rounded-l-xl rounded-r-none p-4 relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-blue-600 text-white text-xs font-bold">1</span>
              <span className="text-xs font-bold text-blue-700 uppercase tracking-wider">Input</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTab("inputs")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "inputs"
                    ? "bg-blue-600 text-white font-medium shadow-md"
                    : "text-blue-700 hover:bg-blue-100 border border-blue-200"
                )}
              >
                <Upload className="h-3.5 w-3.5" />
                Inputs
              </button>
              <button
                onClick={() => setActiveTab("interpretation")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "interpretation"
                    ? "bg-blue-600 text-white font-medium shadow-md"
                    : "text-blue-700 hover:bg-blue-100 border border-blue-200"
                )}
              >
                <Brain className="h-3.5 w-3.5" />
                Interpret
              </button>
              <button
                onClick={() => setActiveTab("ai")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "ai"
                    ? "bg-blue-600 text-white font-medium shadow-md"
                    : "text-blue-700 hover:bg-blue-100 border border-blue-200"
                )}
              >
                <Sparkles className="h-3.5 w-3.5" />
                Ask AI
              </button>
              <button
                onClick={() => {
                  setActiveTab("inputs");
                  setIsDictating(prev => !prev);
                }}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  isDictating
                    ? "bg-blue-600 text-white font-medium shadow-md"
                    : "text-blue-700 hover:bg-blue-100 border border-blue-200"
                )}
              >
                <Mic className="h-3.5 w-3.5" />
                Dictate
              </button>
            </div>
            {/* Arrow connector */}
            <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
              <div className="bg-blue-600 text-white rounded-full p-1 shadow-md">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="md:hidden flex justify-center py-1">
              <ArrowRight className="h-4 w-4 text-blue-400 rotate-90" />
            </div>
          </div>

          {/* STEP 2: OUTPUT */}
          <div className="flex-1 bg-emerald-50 border border-emerald-200 p-4 relative">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-emerald-600 text-white text-xs font-bold">2</span>
              <span className="text-xs font-bold text-emerald-700 uppercase tracking-wider">
                Output
              </span>
              {isComprehensive && (
                <span className="text-[10px] font-semibold text-emerald-600 bg-emerald-100 border border-emerald-300 px-1.5 py-0.5 rounded-full">
                  Comprehensive
                </span>
              )}
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTab("quote")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "quote"
                    ? "bg-emerald-600 text-white font-medium shadow-md"
                    : "text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                )}
              >
                <FileText className="h-3.5 w-3.5" />
                Quote
              </button>
              {isComprehensive && (
                <>
                  <button
                    onClick={() => setActiveTab("timeline")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                      activeTab === "timeline"
                        ? "bg-emerald-600 text-white font-medium shadow-md"
                        : "text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    )}
                  >
                    <Clock className="h-3.5 w-3.5" />
                    Timeline
                  </button>
                  <button
                    onClick={() => setActiveTab("sitequality")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                      activeTab === "sitequality"
                        ? "bg-emerald-600 text-white font-medium shadow-md"
                        : "text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    )}
                  >
                    <Shield className="h-3.5 w-3.5" />
                    Site/Quality
                  </button>
                  <button
                    onClick={() => setActiveTab("documents")}
                    className={cn(
                      "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                      activeTab === "documents"
                        ? "bg-emerald-600 text-white font-medium shadow-md"
                        : "text-emerald-700 hover:bg-emerald-100 border border-emerald-200"
                    )}
                  >
                    <FolderOpen className="h-3.5 w-3.5" />
                    Documents
                  </button>
                </>
              )}
            </div>
            {/* Arrow connector */}
            <div className="hidden md:flex absolute -right-3 top-1/2 -translate-y-1/2 z-10">
              <div className="bg-emerald-600 text-white rounded-full p-1 shadow-md">
                <ChevronRight className="h-4 w-4" />
              </div>
            </div>
            <div className="md:hidden flex justify-center py-1">
              <ArrowRight className="h-4 w-4 text-emerald-400 rotate-90" />
            </div>
          </div>

          {/* STEP 3: INTERNAL */}
          <div className="flex-1 bg-amber-50 border border-amber-200 rounded-r-xl md:rounded-r-xl rounded-l-none p-4">
            <div className="flex items-center gap-2 mb-3">
              <span className="inline-flex items-center justify-center h-6 w-6 rounded-full bg-amber-600 text-white text-xs font-bold">3</span>
              <span className="text-xs font-bold text-amber-700 uppercase tracking-wider">Internal</span>
            </div>
            <div className="flex flex-wrap gap-1.5">
              <button
                onClick={() => setActiveTab("estimate")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "estimate"
                    ? "bg-amber-600 text-white font-medium shadow-md"
                    : "text-amber-700 hover:bg-amber-100 border border-amber-200"
                )}
              >
                <Calculator className="h-3.5 w-3.5" />
                Internal Notes
              </button>
            </div>
          </div>
        </div>

        {/* INPUTS TAB */}
        <TabsContent value="inputs" className="space-y-5">

          {/* Page header */}
          <div className="flex items-center justify-between">
            <div>
              <h2 className="text-lg font-extrabold" style={{ color: brand.navy }}>Evidence & Inputs</h2>
              <p className="text-xs mt-0.5" style={{ color: brand.navyMuted }}>Upload documents, drawings, and specifications for your quote</p>
            </div>
            <div className="flex items-center gap-2 text-xs" style={{ color: brand.navyMuted }}>
              <span>{inputs?.length || 0} files</span>
              <span>•</span>
              <span>{inputs?.filter((i: QuoteInput) => i.processingStatus === "completed").length || 0} analysed</span>
            </div>
          </div>

          {/* Storage status warning */}
          {storageStatus && !storageStatus.configured && (
            <div className="flex items-start gap-3 p-4 rounded-xl" style={{ backgroundColor: "#fffbeb", border: "1px solid #fde68a" }}>
              <AlertTriangle className="h-5 w-5 shrink-0 mt-0.5" style={{ color: "#d97706" }} />
              <div>
                <p className="font-bold text-sm" style={{ color: "#92400e" }}>File storage not configured</p>
                <p className="text-xs mt-0.5" style={{ color: "#a16207" }}>
                  File uploads are disabled. Contact support to enable file storage.
                </p>
              </div>
            </div>
          )}

          {/* Upload bar — dark gradient with Option B instructions */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${brand.border}` }}>
            {/* Dark gradient top bar */}
            <div
              className="flex items-center gap-3 px-4 py-2.5"
              style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}
              onDragOver={handleDragOver}
              onDragLeave={handleDragLeave}
              onDrop={handleDrop}
            >
              <button
                className="flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg shadow-sm whitespace-nowrap"
                style={{ backgroundColor: brand.teal, color: '#fff' }}
                onClick={() => multiFileInputRef.current?.click()}
                disabled={!storageStatus?.configured}
              >
                <Plus className="w-4 h-4" />
                Upload Files
              </button>
              <div
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-xs cursor-pointer transition-colors",
                  isDragging
                    ? "border-white/60 bg-white/10 text-white/80"
                    : "border-white/20 text-white/50 hover:border-white/40"
                )}
                onClick={() => multiFileInputRef.current?.click()}
              >
                <Upload className="w-4 h-4" />
                <span className="font-medium">{isDragging ? "Drop files here" : "Drop files here"}</span>
                <span className="text-[10px] text-white/30">PDF, Word, Excel, Images, Audio — max 3</span>
              </div>
            </div>

            {/* Option B: Processing instructions with teal left accent */}
            <div className="px-4 py-3" style={{ backgroundColor: '#f8fafc' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: brand.teal }}>✦</span>
                  <span className="text-[11px] font-bold" style={{ color: brand.navy }}>Processing Instructions</span>
                  {userPrompt && (
                    <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${brand.teal}15`, color: brand.teal }}>
                      Active
                    </span>
                  )}
                </div>
                <div className="flex items-center gap-2">
                  <DictationButton
                    variant="inline"
                    onTranscript={(text) => {
                      setUserPrompt((prev: string) => (prev ? prev + "\n\n" : "") + text);
                      toast.success("Voice note added to instructions");
                    }}
                  />
                </div>
              </div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${brand.border}` }}>
                <div className="w-1 flex-shrink-0" style={{ backgroundColor: brand.teal }} />
                <Textarea
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  className="w-full px-3 py-2 text-sm border-0 focus:ring-0 resize-none rounded-none"
                  style={{ color: brand.navy, backgroundColor: brand.white }}
                  rows={2}
                  placeholder={"Tell the AI what to include or exclude when analysing...\ne.g. Lighting only — exclude fire alarm, power, access control"}
                />
              </div>
            </div>

            {/* Voice Dictation — shows transcript panel when dictating is active */}
            {isDictating && (
              <div className="px-4 py-3" style={{ borderTop: `1px solid ${brand.border}` }}>
                <DictationButton
                  onCommand={handleDictationCommand}
                  autoStart={isDictating}
                  onListeningChange={(listening) => {
                    if (!listening) setIsDictating(false);
                  }}
                />
              </div>
            )}
          </div>

          {/* Upload Queue */}
          {uploadQueue.length > 0 && (
            <div className="rounded-xl overflow-hidden" style={{ border: `1px solid ${brand.border}` }}>
              <div className="flex items-center justify-between px-4 py-2.5" style={{ backgroundColor: '#f8fafc' }}>
                <span className="text-xs font-bold" style={{ color: brand.navy }}>
                  {uploadQueue.filter(u => u.status === "uploading" || u.status === "pending").length > 0
                    ? `Uploading ${uploadQueue.filter(u => u.status === "completed").length} of ${uploadQueue.length} files…`
                    : `${uploadQueue.length} file${uploadQueue.length > 1 ? "s" : ""} uploaded`}
                </span>
                <button
                  onClick={clearCompletedUploads}
                  className="text-[10px] font-bold underline underline-offset-2"
                  style={{ color: brand.navyMuted }}
                >
                  Clear
                </button>
              </div>
              <div className="px-4 pb-3 space-y-1.5">
                {uploadQueue.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center gap-3 p-2.5 rounded-lg"
                    style={{
                      border: `1px solid ${item.status === "error" && item.isRateLimitError ? "#fb923c" : item.status === "error" ? "#fca5a5" : item.status === "completed" ? "#bbf7d0" : brand.border}`,
                      backgroundColor: item.status === "error" && item.isRateLimitError ? "#fff7ed" : item.status === "error" ? "#fef2f2" : item.status === "completed" ? "#f0fdf4" : brand.white,
                    }}
                  >
                    <div className="flex-shrink-0">{getFileIcon(item.file)}</div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center justify-between">
                        <p className="text-xs font-bold truncate" style={{ color: brand.navy }}>{item.file.name}</p>
                        <div className="flex items-center gap-1.5 ml-2 flex-shrink-0">
                          {item.status === "pending" && <span className="text-[10px]" style={{ color: brand.navyMuted }}>Queued</span>}
                          {item.status === "uploading" && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: brand.teal }}>
                              <Loader2 className="h-3 w-3 animate-spin" /> Uploading
                            </span>
                          )}
                          {item.status === "processing" && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: "#7c3aed" }}>
                              <Loader2 className="h-3 w-3 animate-spin" /> Processing
                            </span>
                          )}
                          {item.status === "completed" && (
                            <span className="text-[10px] flex items-center gap-1" style={{ color: "#16a34a" }}>
                              <CheckCircle className="h-3 w-3" /> Done
                            </span>
                          )}
                          {item.status === "error" && (
                            <span className="text-[10px]" style={{ color: "#dc2626" }}>Failed</span>
                          )}
                          {(item.status === "completed" || item.status === "error") && (
                            <button onClick={(e) => { e.stopPropagation(); removeFromQueue(item.id); }} style={{ color: brand.navyMuted }}>
                              <X className="h-3.5 w-3.5" />
                            </button>
                          )}
                        </div>
                      </div>
                      {(item.status === "uploading" || item.status === "pending" || item.status === "processing") && (
                        <div className="h-1.5 rounded-full overflow-hidden mt-1.5" style={{ backgroundColor: `${brand.teal}15` }}>
                          <div className="h-full rounded-full transition-all duration-300" style={{ width: `${item.progress}%`, backgroundColor: brand.teal }} />
                        </div>
                      )}

                      {/* Rate limit error */}
                      {item.status === "error" && item.isRateLimitError && (
                        <div className="mt-2 p-2 rounded text-xs space-y-1" style={{ backgroundColor: "#fff7ed", border: "1px solid #fed7aa" }}>
                          <p className="font-bold" style={{ color: "#9a3412" }}>Rate Limit Exceeded</p>
                          <p style={{ color: "#c2410c" }}>File uploaded but AI processing delayed. Wait 60s then retry.</p>
                        </div>
                      )}

                      {/* Non-rate-limit error */}
                      {item.status === "error" && !item.isRateLimitError && (
                        <p className="text-[10px] mt-1" style={{ color: "#dc2626" }}>{item.error || "Upload failed"}</p>
                      )}

                      {item.status === "error" && (
                        <Button
                          variant="ghost"
                          size="sm"
                          className="h-6 text-[10px] mt-1 px-2"
                          onClick={(e) => { e.stopPropagation(); handleRetryUpload(item.id); }}
                        >
                          <RefreshCw className="h-3 w-3 mr-1" /> Retry
                        </Button>
                      )}

                      <span className="text-[10px] block mt-0.5" style={{ color: brand.navyMuted }}>
                        {(item.file.size / 1024 / 1024).toFixed(2)} MB
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Quote Draft Summary — always visible, merges voice + takeoff data */}
          {inputs && inputs.length > 0 && (
            <QuoteDraftSummary
              voiceSummary={voiceSummary}
              takeoffs={(takeoffList || []).map((t: any) => ({
                counts: t.counts || {},
                symbolDescriptions: t.symbolDescriptions || {},
                userAnswers: t.userAnswers || {},
                status: t.status || "pending",
              }))}
              isLoading={isSummaryLoading}
              hasVoiceNotes={!!(inputs && inputs.some((inp: QuoteInput) => inp.inputType === "audio" && inp.content && !inp.fileUrl))}
              onSave={(data) => {
                // Update the voiceSummary state so the component doesn't revert
                setVoiceSummary({
                  ...data,
                  materials: data.materials.filter(m => m.source === "voice"),
                });

                // Build structured text and update Processing Instructions
                const parts: string[] = [];
                if (data.jobDescription) parts.push(`Job: ${data.jobDescription}`);
                if (data.clientName) parts.push(`Client: ${data.clientName}`);
                if (data.labour.length > 0) {
                  parts.push("Labour: " + data.labour.map(l => `${l.quantity} × ${l.role} — ${l.duration}`).join(", "));
                }
                if (data.materials.length > 0) {
                  parts.push("Materials: " + data.materials.map(m => `${m.quantity} × ${m.item}${m.unitPrice ? ` @ £${m.unitPrice}` : ""}`).join(", "));
                }
                if (data.markup !== null) parts.push(`Markup: ${data.markup}%`);
                if (data.sundries !== null) parts.push(`Sundries: £${data.sundries}`);
                if (data.contingency) parts.push(`Contingency: ${data.contingency}`);
                if (data.notes) parts.push(`Notes: ${data.notes}`);

                setUserPrompt(parts.join("\n"));

                // Auto-name if client provided and title is empty
                if (data.clientName && !title) {
                  const today = new Date().toLocaleDateString("en-GB");
                  const autoTitle = `${data.clientName} — ${today}`;
                  setTitle(autoTitle);
                  updateQuote.mutate({ id: quoteId, title: autoTitle, clientName: data.clientName });
                } else if (data.clientName) {
                  setClientName(data.clientName);
                  updateQuote.mutate({ id: quoteId, clientName: data.clientName });
                }

                // Also save voice data to DB
                saveVoiceNoteSummary.mutate({
                  quoteId,
                  summary: {
                    clientName: data.clientName,
                    jobDescription: data.jobDescription,
                    labour: data.labour.map(l => ({
                      role: l.role,
                      quantity: Number(l.quantity) || 1,
                      duration: l.duration,
                    })),
                    materials: data.materials.filter(m => m.source === "voice").map(m => ({
                      item: m.item,
                      quantity: Number(m.quantity) || 1,
                      unitPrice: m.unitPrice != null ? Number(m.unitPrice) || 0 : null,
                    })),
                    markup: data.markup != null ? Number(data.markup) || 0 : null,
                    sundries: data.sundries != null ? Number(data.sundries) || 0 : null,
                    contingency: data.contingency || null,
                    notes: data.notes || null,
                  },
                }, {
                  onSuccess: () => {
                    toast.success("Quote summary saved to instructions");
                    refetch();
                  },
                  onError: () => toast.error("Failed to save summary"),
                });
              }}
              onTriggerVoiceAnalysis={triggerVoiceAnalysis}
            />
          )}

          {/* Split View / Accordion inputs panel */}
          {inputs && inputs.length > 0 && (
            <InputsPanel
              inputs={inputs}
              selectedInputId={selectedInputId}
              onSelectInput={setSelectedInputId}
              getTakeoffForInput={getTakeoffForInput}
              onProcessInput={handleProcessInput}
              onDeleteInput={(input) => {
                deleteInput.mutate({ id: input.id, quoteId });
              }}
              onTriggerVoiceAnalysis={triggerVoiceAnalysis}
              onTakeoffChanged={refetchTakeoffs}
              processingInputId={processingInputId}
              quoteId={quoteId}
              userPrompt={userPrompt}
            />
          )}

        </TabsContent>

        {/* INTERPRETATION TAB */}
        <TabsContent value="interpretation" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Brain className="h-5 w-5" />
                Tender Interpretation
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Define what symbols and terms mean for this specific tender. Once confirmed, these become locked.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Interpretation Notes</Label>
                <Textarea
                  placeholder="Document your understanding of the tender requirements, symbols, abbreviations, and any clarifications..."
                  value={tenderNotes}
                  onChange={(e) => setTenderNotes(e.target.value)}
                  rows={8}
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Symbol & Term Mapping</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Advanced symbol mapping and AI-assisted interpretation will be available in a future update.
                      For now, document your interpretations in the notes above.
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveTenderContext} disabled={upsertTenderContext.isPending}>
                {upsertTenderContext.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Interpretation
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* INTERNAL ESTIMATE TAB */}
        <TabsContent value="estimate" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Calculator className="h-5 w-5" />
                Internal Estimate
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Private workspace for your reasoning. Nothing here is ever shown to clients.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Internal Notes</Label>
                <Textarea
                  placeholder="Your private notes, cost calculations, time estimates, and reasoning..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="space-y-3">
                <Label>Risk Notes</Label>
                <Textarea
                  placeholder="Potential risks, concerns, or issues to consider..."
                  value={riskNotes}
                  onChange={(e) => setRiskNotes(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <AlertTriangle className="h-5 w-5 text-warning shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">AI Estimator Prompt</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      The "Ask About This Quote" AI feature will be available in a future update.
                      This will help you identify missed items, risks, and assumptions.
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveInternalEstimate} disabled={upsertInternalEstimate.isPending}>
                {upsertInternalEstimate.isPending ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                Save Internal Estimate
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* AI REVIEW TAB */}
        <TabsContent value="ai" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Sparkles className="h-5 w-5" />
                AI Quote Review
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Get intelligent feedback on your quote. The AI reviews your quote details, line items, and terms to provide actionable insights.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Pre-defined prompt buttons */}
              <div className="space-y-3">
                <Label className="text-base font-medium">Ask the AI:</Label>
                <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
                  <Button
                    variant="outline"
                    className="h-auto py-4 px-4 justify-start text-left"
                    onClick={() => handleAskAI("missed")}
                    disabled={aiLoading}
                  >
                    <HelpCircle className="h-5 w-5 mr-3 flex-shrink-0 text-blue-500" />
                    <div>
                      <div className="font-medium">What might I have missed?</div>
                      <div className="text-xs text-muted-foreground">Common oversights and missing items</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 px-4 justify-start text-left"
                    onClick={() => handleAskAI("risks")}
                    disabled={aiLoading}
                  >
                    <AlertOctagon className="h-5 w-5 mr-3 flex-shrink-0 text-orange-500" />
                    <div>
                      <div className="font-medium">What risks should I consider?</div>
                      <div className="text-xs text-muted-foreground">Project and delivery risks</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 px-4 justify-start text-left"
                    onClick={() => handleAskAI("assumptions")}
                    disabled={aiLoading}
                  >
                    <ListChecks className="h-5 w-5 mr-3 flex-shrink-0 text-green-500" />
                    <div>
                      <div className="font-medium">What assumptions should I state?</div>
                      <div className="text-xs text-muted-foreground">Clarify before proceeding</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 px-4 justify-start text-left"
                    onClick={() => handleAskAI("pricing")}
                    disabled={aiLoading}
                  >
                    <PoundSterling className="h-5 w-5 mr-3 flex-shrink-0 text-emerald-500" />
                    <div>
                      <div className="font-medium">Does this look under-priced?</div>
                      <div className="text-xs text-muted-foreground">Pricing analysis and suggestions</div>
                    </div>
                  </Button>
                  
                  <Button
                    variant="outline"
                    className="h-auto py-4 px-4 justify-start text-left"
                    onClick={() => handleAskAI("issues")}
                    disabled={aiLoading}
                  >
                    <Wrench className="h-5 w-5 mr-3 flex-shrink-0 text-red-500" />
                    <div>
                      <div className="font-medium">What usually causes issues?</div>
                      <div className="text-xs text-muted-foreground">Common problems and delays</div>
                    </div>
                  </Button>
                </div>
              </div>

              {/* Custom prompt */}
              <div className="space-y-3 border-t pt-6">
                <Label className="text-base font-medium">Or ask your own question:</Label>
                <div className="flex gap-3">
                  <Textarea
                    placeholder="Type your question about this quote..."
                    value={customPrompt}
                    onChange={(e) => setCustomPrompt(e.target.value)}
                    className="min-h-[80px]"
                  />
                </div>
                <Button
                  onClick={() => handleAskAI("custom")}
                  disabled={aiLoading || !customPrompt.trim()}
                  className="w-full sm:w-auto"
                >
                  {aiLoading ? (
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  ) : (
                    <MessageSquare className="mr-2 h-4 w-4" />
                  )}
                  Ask AI
                </Button>
              </div>

              {/* AI Response */}
              {aiLoading && (
                <div className="border rounded-lg p-6 bg-muted/30">
                  <div className="flex items-center gap-3">
                    <Loader2 className="h-5 w-5 animate-spin text-primary" />
                    <span className="text-muted-foreground">AI is analyzing your quote...</span>
                  </div>
                </div>
              )}

              {aiResponse && !aiLoading && (
                <div className="border rounded-lg p-6 bg-muted/20">
                  <div className="flex items-start gap-3">
                    <Sparkles className="h-5 w-5 text-primary flex-shrink-0 mt-1" />
                    <div className="prose prose-sm max-w-none dark:prose-invert">
                      <div className="whitespace-pre-wrap">{aiResponse}</div>
                    </div>
                  </div>
                </div>
              )}

              {!aiResponse && !aiLoading && (
                <div className="border rounded-lg p-6 bg-muted/10 text-center">
                  <Sparkles className="h-8 w-8 mx-auto mb-3 text-muted-foreground" />
                  <p className="text-muted-foreground">
                    Click one of the questions above to get AI-powered insights about your quote.
                  </p>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUOTE TAB */}
        <TabsContent value="quote" className="space-y-6">
          {/* Client Details */}
          <Card>
            <CardHeader>
              <CardTitle>Client Details</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Client Name</Label>
                  <Input
                    id="clientName"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                    placeholder="Company or individual name"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                    placeholder="client@example.com"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Phone</Label>
                  <Input
                    id="clientPhone"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                    placeholder="+44 123 456 7890"
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientAddress">Address</Label>
                  <Input
                    id="clientAddress"
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    placeholder="Full address"
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Quote Details */}
          <Card>
            <CardHeader>
              <CardTitle>Quote Details</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="title">Quote Title</Label>
                <Input
                  id="title"
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                  placeholder="Brief description of the work"
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Detailed description of the scope of work..."
                  rows={4}
                />
              </div>
            </CardContent>
          </Card>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Existing line items */}
              {lineItems && lineItems.length > 0 && (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full">
                    <thead className="bg-muted/50">
                      <tr>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-right p-3 font-medium w-20">Qty</th>
                        <th className="text-left p-3 font-medium w-20">Unit</th>
                        <th className="text-right p-3 font-medium w-24">Rate</th>
                        <th className="text-right p-3 font-medium w-24">Total</th>
                        <th className="w-12"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item: LineItem, index: number) => (
                        <tr key={item.id} className={index % 2 === 0 ? "bg-background" : "bg-muted/20"}>
                          {/* Description - editable */}
                          <td className="p-3">
                            {editingItemId === item.id && editingField === "description" ? (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSaveEdit(item.id, "description")}
                                onKeyDown={(e) => handleKeyDown(e, item.id, "description")}
                                autoFocus
                                className="h-8"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded block"
                                onClick={() => handleStartEdit(item.id, "description", item.description)}
                              >
                                {item.description || "Click to edit"}
                              </span>
                            )}
                          </td>
                          {/* Quantity - editable */}
                          <td className="p-3 text-right">
                            {editingItemId === item.id && editingField === "quantity" ? (
                              <Input
                                type="number"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSaveEdit(item.id, "quantity")}
                                onKeyDown={(e) => handleKeyDown(e, item.id, "quantity")}
                                autoFocus
                                className="h-8 w-20 text-right"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded inline-block"
                                onClick={() => handleStartEdit(item.id, "quantity", item.quantity || "1")}
                              >
                                {item.quantity || "1"}
                              </span>
                            )}
                          </td>
                          {/* Unit - editable */}
                          <td className="p-3">
                            {editingItemId === item.id && editingField === "unit" ? (
                              <Input
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSaveEdit(item.id, "unit")}
                                onKeyDown={(e) => handleKeyDown(e, item.id, "unit")}
                                autoFocus
                                className="h-8 w-20"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded inline-block"
                                onClick={() => handleStartEdit(item.id, "unit", item.unit || "each")}
                              >
                                {item.unit || "each"}
                              </span>
                            )}
                          </td>
                          {/* Rate - editable */}
                          <td className="p-3 text-right">
                            {editingItemId === item.id && editingField === "rate" ? (
                              <Input
                                type="number"
                                step="0.01"
                                value={editValue}
                                onChange={(e) => setEditValue(e.target.value)}
                                onBlur={() => handleSaveEdit(item.id, "rate")}
                                onKeyDown={(e) => handleKeyDown(e, item.id, "rate")}
                                autoFocus
                                className="h-8 w-24 text-right"
                              />
                            ) : (
                              <span
                                className="cursor-pointer hover:bg-muted/50 px-2 py-1 rounded inline-block"
                                onClick={() => handleStartEdit(item.id, "rate", item.rate || "0")}
                              >
                                £{parseFloat(item.rate || "0").toFixed(2)}
                              </span>
                            )}
                          </td>
                          {/* Total - calculated, not editable */}
                          <td className="p-3 text-right font-medium">£{parseFloat(item.total || "0").toFixed(2)}</td>
                          <td className="p-3">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => deleteLineItem.mutate({ id: item.id, quoteId })}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}

              {/* Add new line item */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="grid grid-cols-12 gap-3">
                  <div className="col-span-12 md:col-span-5">
                    <Input
                      placeholder="Description"
                      value={newItemDescription}
                      onChange={(e) => setNewItemDescription(e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      type="number"
                      placeholder="Qty"
                      value={newItemQuantity}
                      onChange={(e) => setNewItemQuantity(e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      placeholder="Unit"
                      value={newItemUnit}
                      onChange={(e) => setNewItemUnit(e.target.value)}
                    />
                  </div>
                  <div className="col-span-4 md:col-span-2">
                    <Input
                      type="number"
                      step="0.01"
                      placeholder="Rate"
                      value={newItemRate}
                      onChange={(e) => setNewItemRate(e.target.value)}
                    />
                  </div>
                  <div className="col-span-12 md:col-span-1">
                    <Button
                      onClick={handleAddLineItem}
                      disabled={createLineItem.isPending}
                      className="w-full"
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              </div>

              {/* Add from Catalog */}
              <div className="relative">
                <Button
                  variant="outline"
                  onClick={() => setShowCatalogPicker(!showCatalogPicker)}
                  className="w-full justify-start"
                  disabled={!catalogItems || catalogItems.length === 0}
                >
                  <Package className="mr-2 h-4 w-4" />
                  {catalogItems && catalogItems.length > 0 
                    ? `Add from Catalog (${catalogItems.length} items)` 
                    : "No catalog items - add some in Settings"}
                </Button>
                
                {showCatalogPicker && catalogItems && catalogItems.length > 0 && (
                  <div className="absolute z-50 mt-2 w-full bg-popover border rounded-lg shadow-lg max-h-64 overflow-y-auto">
                    {catalogItems.map((item: { id: number; name: string; description: string | null; unit: string | null; defaultRate: string | null; category: string | null }, index: number) => (
                      <div
                        key={item.id}
                        className={`p-3 cursor-pointer hover:bg-accent transition-colors ${index % 2 === 1 ? 'bg-muted/30' : ''}`}
                        onClick={() => {
                          createLineItem.mutate({
                            quoteId,
                            description: item.name + (item.description ? ` - ${item.description}` : ''),
                            quantity: "1",
                            unit: item.unit || "each",
                            rate: item.defaultRate || "0",
                          });
                          setShowCatalogPicker(false);
                          toast.success(`Added "${item.name}" to quote`);
                        }}
                      >
                        <div className="flex justify-between items-start">
                          <div>
                            <div className="font-medium">{item.name}</div>
                            {item.description && (
                              <div className="text-sm text-muted-foreground truncate max-w-xs">
                                {item.description}
                              </div>
                            )}
                            {item.category && (
                              <Badge variant="secondary" className="mt-1 text-xs">
                                {item.category}
                              </Badge>
                            )}
                          </div>
                          <div className="text-right">
                            <div className="font-medium">£{parseFloat(item.defaultRate || "0").toFixed(2)}</div>
                            <div className="text-xs text-muted-foreground">per {item.unit || "each"}</div>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              {/* Totals */}
              <div className="border-t pt-4 space-y-2">
                <div className="flex justify-between text-sm">
                  <span>Subtotal</span>
                  <span>£{parseFloat(quote.subtotal || "0").toFixed(2)}</span>
                </div>
                <div className="flex justify-between items-center text-sm">
                  <div className="flex items-center gap-2">
                    <span>Tax</span>
                    <Input
                      type="number"
                      className="w-16 h-7 text-xs"
                      value={taxRate}
                      onChange={(e) => setTaxRate(e.target.value)}
                    />
                    <span>%</span>
                  </div>
                  <span>£{parseFloat(quote.taxAmount || "0").toFixed(2)}</span>
                </div>
                <div className="flex justify-between font-bold text-lg border-t pt-2">
                  <span>Total</span>
                  <span>£{parseFloat(quote.total || "0").toFixed(2)}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Terms */}
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between">
                <CardTitle>Terms & Conditions</CardTitle>
                {termsModified && terms !== user?.defaultTerms && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => updateProfile.mutate({ defaultTerms: terms })}
                    disabled={updateProfile.isPending}
                  >
                    {updateProfile.isPending ? (
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    ) : (
                      <Save className="h-4 w-4 mr-2" />
                    )}
                    Save as Default
                  </Button>
                )}
              </div>
              {!terms && user?.defaultTerms && (
                <p className="text-sm text-muted-foreground mt-1">
                  You have default T&C saved.{" "}
                  <button
                    className="text-primary hover:underline"
                    onClick={() => {
                      setTerms(user.defaultTerms || "");
                      setOriginalTerms(user.defaultTerms || "");
                    }}
                  >
                    Click to use your default
                  </button>
                </p>
              )}
            </CardHeader>
            <CardContent>
              <Textarea
                value={terms}
                onChange={(e) => {
                  setTerms(e.target.value);
                  if (e.target.value !== originalTerms) {
                    setTermsModified(true);
                  }
                }}
                placeholder="Payment terms, warranty, exclusions, etc..."
                rows={6}
              />
              {termsModified && terms !== originalTerms && (
                <p className="text-sm text-muted-foreground mt-2">
                  T&C modified. Save the quote to apply changes, or click "Save as Default" to use these terms on all future quotes.
                </p>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* COMPREHENSIVE: TIMELINE TAB */}
        {isComprehensive && (
          <TabsContent value="timeline" className="space-y-6">
            <TimelineTab quoteId={quoteId} config={comprehensiveConfig} refetch={refetch} />
          </TabsContent>
        )}

        {/* COMPREHENSIVE: SITE/QUALITY TAB */}
        {isComprehensive && (
          <TabsContent value="sitequality" className="space-y-6">
            <SiteQualityTab quoteId={quoteId} config={comprehensiveConfig} refetch={refetch} />
          </TabsContent>
        )}

        {/* COMPREHENSIVE: DOCUMENTS TAB */}
        {isComprehensive && (
          <TabsContent value="documents" className="space-y-6">
            <DocumentsTab quoteId={quoteId} config={comprehensiveConfig} inputs={inputs || []} refetch={refetch} />
          </TabsContent>
        )}
      </Tabs>

      {/* Generate Email Modal */}
      {showEmailModal && (
        <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4">
          <div className="bg-background rounded-lg shadow-xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            {/* Modal Header */}
            <div className="flex items-center justify-between p-4 border-b">
              <div>
                <h2 className="text-lg font-semibold">Generated Email</h2>
                <p className="text-sm text-muted-foreground">Copy and paste into your email client</p>
              </div>
              <Button variant="ghost" size="icon" onClick={() => setShowEmailModal(false)}>
                <X className="h-4 w-4" />
              </Button>
            </div>

            {/* Modal Content */}
            <div className="flex-1 overflow-y-auto p-4 space-y-4">
              {/* Subject Line */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Subject Line</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(emailSubject, "Subject")}
                  >
                    Copy Subject
                  </Button>
                </div>
                <div className="p-3 bg-muted rounded-md font-medium">
                  {emailSubject}
                </div>
              </div>

              {/* HTML Preview */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Email Body (Rich Format)</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyHtmlToClipboard(emailHtmlBody, "Email body")}
                  >
                    Copy HTML Body
                  </Button>
                </div>
                <div 
                  className="p-4 bg-white text-black rounded-md border max-h-80 overflow-y-auto"
                  dangerouslySetInnerHTML={{ __html: emailHtmlBody }}
                />
              </div>

              {/* Plain Text Version */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label className="font-medium">Plain Text Version</Label>
                  <Button 
                    variant="outline" 
                    size="sm"
                    onClick={() => copyToClipboard(emailTextBody, "Plain text")}
                  >
                    Copy Plain Text
                  </Button>
                </div>
                <pre className="p-4 bg-muted rounded-md text-sm whitespace-pre-wrap font-mono max-h-60 overflow-y-auto">
                  {emailTextBody}
                </pre>
              </div>
            </div>

            {/* Modal Footer */}
            <div className="flex items-center justify-between p-4 border-t bg-muted/30">
              <p className="text-sm text-muted-foreground">
                Tip: Use "Copy HTML Body" for rich formatting in Gmail, Outlook, etc.
              </p>
              <div className="flex gap-2">
                <Button variant="outline" onClick={() => setShowEmailModal(false)}>
                  Close
                </Button>
                <Button 
                  onClick={() => {
                    // Copy both subject and body
                    copyToClipboard(`Subject: ${emailSubject}\n\n${emailTextBody}`, "Full email");
                  }}
                >
                  Copy All (Plain Text)
                </Button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
