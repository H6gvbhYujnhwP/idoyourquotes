import { useAuth } from "@/_core/hooks/useAuth";
import TakeoffPanel from "@/components/TakeoffPanel";
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
import { brand, fileTypeConfig, symbolColors as brandSymbolColors } from "@/lib/brandTheme";
import FileIcon from "@/components/FileIcon";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { Separator } from "@/components/ui/separator";
import TimelineTab from "@/components/comprehensive/TimelineTab";
import SiteQualityTab from "@/components/comprehensive/SiteQualityTab";
import DocumentsTab from "@/components/comprehensive/DocumentsTab";

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
  const [processingInstructions, setProcessingInstructions] = useState(""); // For telling AI what to look for when analysing uploads
  const [isGeneratingDraft, setIsGeneratingDraft] = useState(false);
  const [processingInputId, setProcessingInputId] = useState<number | null>(null);
  const [reanalyzeTriggers, setReanalyzeTriggers] = useState<Record<number, number>>({}); // per-input trigger counters
  const [selectedInputId, setSelectedInputId] = useState<number | null>(null);

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

  // Fetch all takeoffs for this quote to check approval status
  const { data: allTakeoffs } = trpc.electricalTakeoff.list.useQuery(
    { quoteId },
    { enabled: quoteId > 0 }
  );

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

  const handleGenerateDraft = () => {
    // Check if PDF inputs have approved takeoffs
    if (inputs && inputs.length > 0 && allTakeoffs) {
      const pdfInputs = inputs.filter((i: QuoteInput) => i.inputType === 'pdf' && i.processingStatus === 'completed');
      if (pdfInputs.length > 0) {
        const unapproved: string[] = [];
        for (const input of pdfInputs) {
          const takeoff = allTakeoffs.find((t: any) => Number(t.inputId) === input.id);
          if (!takeoff || takeoff.status !== 'verified') {
            unapproved.push(input.filename || `Input #${input.id}`);
          }
        }
        if (unapproved.length > 0) {
          const allUnapproved = unapproved.length === pdfInputs.length;
          toast.error(
            allUnapproved
              ? `All ${unapproved.length} drawing${unapproved.length > 1 ? 's have' : ' has'} not been approved. Go to the Inputs tab and click "Approve for Quote" on each drawing before generating.`
              : `${unapproved.length} of ${pdfInputs.length} drawing${unapproved.length > 1 ? 's have' : ' has'} not been approved: ${unapproved.join(', ')}. Approve all drawings before generating.`,
            { duration: 6000 }
          );
          return;
        }
      }
    }

    // Check if line items already exist - show confirmation dialog
    if (lineItems && lineItems.length > 0) {
      if (!window.confirm("This will replace all existing line items. Continue?")) {
        return;
      }
    }
    generateDraft.mutate({
      quoteId,
      userPrompt: userPrompt || undefined,
    });
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
      if ((fullQuote.quote as any).processingInstructions) {
        setProcessingInstructions((fullQuote.quote as any).processingInstructions);
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
        processingInstructions: processingInstructions || null,
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
              <h1 className="text-2xl font-bold tracking-tight">
                {quote.title || quote.reference || `Quote #${quote.id}`}
              </h1>
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
                onClick={() => setActiveTab("instructions")}
                className={cn(
                  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm rounded-md transition-all",
                  activeTab === "instructions"
                    ? "bg-purple-600 text-white font-medium shadow-md"
                    : "text-purple-700 hover:bg-purple-100 border border-purple-200"
                )}
              >
                <Mail className="h-3.5 w-3.5" />
                Instructions
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

        {/* INPUTS TAB — Style C: Bold Headers + Clean Body */}
        <TabsContent value="inputs" className="space-y-5">

          {/* Storage warning */}
          {storageStatus && !storageStatus.configured && (
            <div className="flex items-center gap-3 p-3 rounded-xl border" style={{ backgroundColor: '#fffbeb', borderColor: '#fde68a' }}>
              <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
              <p className="text-xs font-medium text-amber-800">File storage not configured. Contact support to enable uploads.</p>
            </div>
          )}

          {/* Section header with teal accent bar */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-1 h-8 rounded-full" style={{ backgroundColor: brand.teal }} />
              <div>
                <h2 className="text-lg font-extrabold tracking-tight" style={{ color: brand.navy }}>Documents</h2>
                <p className="text-[10px] font-medium" style={{ color: brand.navyMuted }}>
                  {inputs?.length || 0} files{inputs && inputs.length > 0 ? ` • ${inputs.filter((i: QuoteInput) => i.processingStatus === "completed").length} analysed` : ''}
                </p>
              </div>
            </div>
          </div>

          {/* Upload + Instructions combined panel — Style D gradient */}
          <div className="rounded-xl overflow-hidden" style={{ border: `1.5px solid ${brand.border}` }}>
            <div className="flex items-center gap-3 px-4 py-2.5" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
              <button
                className="flex items-center gap-2 px-4 py-2 text-white text-xs font-bold rounded-lg shadow-sm transition-colors whitespace-nowrap"
                style={{ backgroundColor: brand.teal }}
                onClick={() => multiFileInputRef.current?.click()}
                disabled={!storageStatus?.configured}
              >
                <Upload className="w-4 h-4" />
                Upload Files
              </button>
              <div
                className={cn(
                  "flex-1 flex items-center gap-2 px-3 py-2 border border-dashed rounded-lg text-xs transition-all cursor-pointer",
                  isDragging ? "border-white/40 bg-white/10" : "border-white/20 hover:border-white/40"
                )}
                style={{ color: 'rgba(255,255,255,0.5)' }}
                onDragOver={handleDragOver}
                onDragLeave={handleDragLeave}
                onDrop={handleDrop}
                onClick={() => multiFileInputRef.current?.click()}
              >
                <span className="font-medium">{isDragging ? "Drop files here" : "Drop files here"}</span>
                <span className="text-[10px]" style={{ color: 'rgba(255,255,255,0.3)' }}>PDF, Word, Excel, Images, Audio — max 3</span>
              </div>
            </div>
            <div className="px-4 py-3" style={{ backgroundColor: '#f8fafc' }}>
              <div className="flex items-center justify-between mb-1.5">
                <div className="flex items-center gap-2">
                  <span className="text-sm" style={{ color: brand.teal }}>✦</span>
                  <span className="text-[11px] font-bold" style={{ color: brand.navy }}>Processing Instructions</span>
                  {processingInstructions && <span className="text-[9px] font-medium px-1.5 py-0.5 rounded-full" style={{ backgroundColor: `${brand.teal}15`, color: brand.teal }}>Active</span>}
                </div>
                {processingInstructions && (
                  <button
                    className="text-[10px] font-bold px-2.5 py-1 rounded-md text-white transition-colors"
                    style={{ backgroundColor: brand.teal }}
                    onClick={async () => {
                      await updateQuote.mutateAsync({ id: quoteId, processingInstructions: processingInstructions || null });
                      const completedInputs = inputs?.filter((i: QuoteInput) => i.processingStatus === "completed") || [];
                      const newTriggers: Record<number, number> = { ...reanalyzeTriggers };
                      completedInputs.forEach((input: QuoteInput) => { newTriggers[input.id] = (newTriggers[input.id] || 0) + 1; });
                      setReanalyzeTriggers(newTriggers);
                      toast.success(`Instructions saved. Re-analysing ${completedInputs.length} input${completedInputs.length > 1 ? 's' : ''}`);
                    }}
                  >
                    Apply All
                  </button>
                )}
              </div>
              <div className="flex rounded-lg overflow-hidden" style={{ border: `1.5px solid ${processingInstructions ? brand.tealBorder : brand.border}` }}>
                <div className="w-1 flex-shrink-0" style={{ backgroundColor: brand.teal }} />
                <textarea
                  value={processingInstructions}
                  onChange={(e: React.ChangeEvent<HTMLTextAreaElement>) => setProcessingInstructions(e.target.value)}
                  onBlur={() => {
                    updateQuote.mutate({ id: quoteId, processingInstructions: processingInstructions || null });
                  }}
                  className="w-full px-3 py-2 text-sm border-0 focus:ring-0 resize-none"
                  style={{ color: brand.navy, backgroundColor: brand.white }}
                  rows={2}
                  placeholder={"Tell the AI what to include or exclude when analysing drawings...\ne.g. Lighting only — exclude fire alarm, power, access control and CCTV"}
                />
              </div>
            </div>
          </div>

          {/* Upload queue — progress bars */}
          {uploadQueue.length > 0 && (
            <div className="space-y-1.5">
              {uploadQueue.map((item) => (
                <div key={item.id} className="flex items-center gap-3 px-4 py-2 rounded-xl" style={{ backgroundColor: brand.white, border: `1px solid ${brand.borderLight}` }}>
                  <FileIcon type={item.file.type.includes('pdf') ? 'pdf' : item.file.type.includes('audio') ? 'audio' : item.file.type.includes('image') ? 'image' : 'document'} size="sm" />
                  <div className="flex-1 min-w-0">
                    <p className="text-xs font-bold truncate" style={{ color: brand.navy }}>{item.file.name}</p>
                    {item.isRateLimitError && (
                      <p className="text-[10px] text-amber-600 font-medium mt-0.5">Rate limited — wait {item.retryAfter ? `~${Math.ceil(item.retryAfter)}s` : '30-60s'} then retry</p>
                    )}
                    <div className="mt-1 w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${brand.teal}15` }}>
                      <div className="h-full rounded-full transition-all duration-500" style={{
                        width: `${item.status === 'completed' ? 100 : item.status === 'error' ? 100 : item.progress || 30}%`,
                        backgroundColor: item.status === 'error' ? '#ef4444' : brand.teal,
                      }} />
                    </div>
                  </div>
                  <span className="text-[10px] font-bold flex-shrink-0" style={{ color: item.status === 'error' ? '#ef4444' : item.status === 'completed' ? brand.teal : brand.navyMuted }}>
                    {item.status === 'completed' ? '100%' : item.status === 'error' ? 'Failed' : `${item.progress || 30}%`}
                  </span>
                  {item.status === 'completed' && (
                    <div className="w-5 h-5 rounded-full flex items-center justify-center flex-shrink-0" style={{ backgroundColor: `${brand.teal}15` }}>
                      <Check className="w-3 h-3" style={{ color: brand.teal }} />
                    </div>
                  )}
                  {item.status === 'error' && (
                    <button className="text-[10px] font-bold px-2 py-1 rounded-md text-amber-700 bg-amber-50" onClick={() => handleRetryUpload(item.id)}>Retry</button>
                  )}
                </div>
              ))}
            </div>
          )}

          {/* File icon grid */}
          {inputs && inputs.length > 0 && (
            <div className="grid grid-cols-5 gap-3">
              {inputs.map((input: QuoteInput) => {
                const isSelected = selectedInputId === input.id;
                const inputType = input.inputType || 'document';
                return (
                  <div
                    key={input.id}
                    onClick={() => setSelectedInputId(isSelected ? null : input.id)}
                    className="relative p-4 rounded-2xl cursor-pointer transition-all text-center"
                    style={{
                      backgroundColor: brand.white,
                      border: `2px solid ${isSelected ? brand.teal : brand.borderLight}`,
                      boxShadow: isSelected ? brand.shadowActive : brand.shadow,
                    }}
                  >
                    <div className="absolute top-2.5 right-2.5">
                      {input.processingStatus === "completed" && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center" style={{ backgroundColor: `${brand.teal}12` }}>
                          <Check className="w-3 h-3" style={{ color: brand.teal }} />
                        </div>
                      )}
                      {input.processingStatus === "processing" && (
                        <div className="w-5 h-5 rounded-full flex items-center justify-center animate-pulse" style={{ backgroundColor: `${brand.teal}12` }}>
                          <span className="w-2 h-2 rounded-full" style={{ backgroundColor: brand.teal }} />
                        </div>
                      )}
                      {input.processingStatus === "failed" && (
                        <div className="w-5 h-5 rounded-full bg-red-50 flex items-center justify-center">
                          <X className="w-3 h-3 text-red-400" />
                        </div>
                      )}
                    </div>
                    <div className="flex justify-center mb-2.5 mt-1">
                      <FileIcon type={inputType} size="lg" />
                    </div>
                    <p className="text-[11px] font-bold truncate px-0.5" style={{ color: brand.navy }}>
                      {input.filename || `${inputType.charAt(0).toUpperCase() + inputType.slice(1)} Input`}
                    </p>
                    <p className="text-[9px] font-medium mt-0.5" style={{ color: brand.navyMuted }}>
                      {input.mimeType ? input.mimeType.split('/')[1]?.toUpperCase() : inputType.toUpperCase()}
                    </p>
                    {input.processingStatus === "processing" && (
                      <div className="mt-2 px-1.5">
                        <div className="w-full h-1.5 rounded-full overflow-hidden" style={{ backgroundColor: `${brand.teal}15` }}>
                          <div className="h-full rounded-full animate-pulse" style={{ width: '60%', backgroundColor: brand.teal }} />
                        </div>
                      </div>
                    )}
                    {input.processingStatus === "failed" && (
                      <div className="mt-2"><span className="text-[9px] font-bold text-red-500">Analysis failed</span></div>
                    )}
                  </div>
                );
              })}
            </div>
          )}

          {/* Detail panel — Design A: File info in gradient header */}
          {selectedInputId && inputs && (() => {
            const selected = inputs.find((i: QuoteInput) => i.id === selectedInputId);
            if (!selected) return null;
            return (
              <div className="rounded-2xl overflow-hidden" style={{ border: `1.5px solid ${brand.border}` }}>
                {/* Dark gradient header with file info */}
                <div className="px-4 py-3" style={{ background: `linear-gradient(135deg, ${brand.navy} 0%, #1e3a5f 100%)` }}>
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <FileIcon type={selected.inputType || 'document'} size="sm" />
                      <div>
                        <h4 className="text-sm font-extrabold text-white">{selected.filename || 'Input'}</h4>
                        <p className="text-[10px] font-medium text-white/50 mt-0.5">
                          {selected.mimeType || selected.inputType} • {selected.createdAt ? new Date(selected.createdAt).toLocaleDateString('en-GB', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                          {selected.processingStatus === "completed" && <span className="text-teal-300 font-bold"> • Analysed</span>}
                          {selected.processingStatus === "processing" && <span className="text-blue-300 font-bold"> • Processing</span>}
                          {selected.processingStatus === "failed" && <span className="text-red-300 font-bold"> • Failed</span>}
                        </p>
                      </div>
                    </div>
                    <div className="flex items-center gap-2">
                      {selected.processingStatus === "completed" && (
                        <button
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-teal-300 bg-white/10 hover:bg-white/15 border border-white/15 transition-colors"
                          onClick={async () => {
                            await updateQuote.mutateAsync({ id: quoteId, processingInstructions: processingInstructions || null });
                            setReanalyzeTriggers(prev => ({ ...prev, [selected.id]: (prev[selected.id] || 0) + 1 }));
                            toast.success(`Re-analysing ${selected.filename || 'input'}...`);
                          }}
                        >Re-analyse</button>
                      )}
                      {selected.fileUrl && (
                        <button
                          className="text-[11px] font-bold px-3 py-1.5 rounded-lg text-white/70 bg-white/5 hover:bg-white/10 border border-white/10 transition-colors"
                          onClick={() => window.open(selected.fileUrl!, "_blank")}
                        >Open File</button>
                      )}
                      {selected.processingStatus === "failed" && (
                        <button
                          className="text-[11px] font-bold text-white px-4 py-1.5 rounded-lg bg-red-500/80 hover:bg-red-500 transition-colors"
                          onClick={() => handleProcessInput(selected)}
                        >Retry</button>
                      )}
                      <button
                        className="p-1.5 rounded-lg text-white/40 hover:text-red-300 hover:bg-white/10 transition-colors"
                        onClick={() => { deleteInput.mutate({ id: selected.id, quoteId }); setSelectedInputId(null); }}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </div>
                </div>

                {/* Content preview */}
                {selected.content && (
                  <div className="px-4 py-2.5" style={{ backgroundColor: '#f8fafc', borderBottom: `1px solid ${brand.borderLight}` }}>
                    <p className="text-xs line-clamp-2" style={{ color: brand.navyMuted }}>{selected.content}</p>
                  </div>
                )}

                {/* Takeoff panel (for PDFs) — renders flush, no padding wrapper */}
                {selected.inputType === "pdf" && selected.processingStatus === "completed" && (
                  <TakeoffPanel inputId={selected.id} quoteId={quoteId} filename={selected.filename || "Drawing"} fileUrl={selected.fileUrl || undefined} processingInstructions={processingInstructions} reanalyzeTrigger={reanalyzeTriggers[selected.id] || 0} />
                )}

                {/* Non-PDF completed */}
                {selected.inputType !== "pdf" && selected.processingStatus === "completed" && (
                  <div className="px-4 py-3" style={{ backgroundColor: brand.white }}>
                    <p className="text-xs font-medium" style={{ color: brand.navyMuted }}>Text extracted — ready for quote generation.</p>
                  </div>
                )}

                {/* Failed state */}
                {selected.processingStatus === "failed" && (
                  <div className="px-4 py-3 flex items-center gap-2" style={{ backgroundColor: '#fef2f2' }}>
                    <AlertTriangle className="w-4 h-4 text-red-500 flex-shrink-0" />
                    <span className="text-xs font-semibold text-red-700">Analysis failed — try re-uploading or splitting the file.</span>
                  </div>
                )}
              </div>
            );
          })()}

          {/* Empty state */}
          {(!inputs || inputs.length === 0) && uploadQueue.length === 0 && (
            <div
              className="text-center py-12 rounded-2xl border-2 border-dashed cursor-pointer transition-all hover:border-teal-400"
              style={{ borderColor: brand.border, backgroundColor: '#f8fafc' }}
              onDragOver={handleDragOver} onDragLeave={handleDragLeave} onDrop={handleDrop}
              onClick={() => multiFileInputRef.current?.click()}
            >
              <Upload className="h-10 w-10 mx-auto mb-3" style={{ color: brand.navyMuted }} />
              <p className="text-sm font-bold" style={{ color: brand.navy }}>No documents yet</p>
              <p className="text-xs mt-1" style={{ color: brand.navyMuted }}>Drop files here or click to upload tender documents, drawings, and specifications</p>
            </div>
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

        {/* INSTRUCTIONS TAB — Quote generation instructions (tender emails, briefs etc.) */}
        <TabsContent value="instructions" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Mail className="h-5 w-5 text-purple-600" />
                Instructions / Notes for AI
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Paste client emails, project briefs, tender invitations, or specifications here. This content will be used when generating the quote draft.
              </p>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-3 p-4 bg-gradient-to-r from-purple-50 to-indigo-50 rounded-lg border border-purple-200">
                <Textarea
                  placeholder={"Paste client emails, project briefs, or instructions here...\n\nExample:\n'Hi, I need a quote for painting 3 bedrooms and the hallway. The rooms are roughly 12x12 each. We'd like it done in 2 weeks if possible. Thanks, John'"}
                  value={userPrompt}
                  onChange={(e) => setUserPrompt(e.target.value)}
                  rows={12}
                  className="bg-white"
                />
                {userPrompt && (
                  <p className="text-xs text-purple-600 flex items-center gap-1">
                    <CheckCircle className="h-3 w-3" />
                    {userPrompt.length} characters — will be included when generating your quote
                  </p>
                )}
              </div>
              <div className="bg-purple-50 border border-purple-200 rounded-lg p-3">
                <p className="text-sm text-purple-800">
                  <strong>Tip:</strong> The more detail you provide here, the better the AI can tailor the quote. Include scope of works, exclusions, special requirements, deadlines, and any specific instructions from the client or main contractor.
                </p>
              </div>
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
