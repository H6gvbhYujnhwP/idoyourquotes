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
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect, useRef } from "react";
import { toast } from "sonner";

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
};

export default function QuoteWorkspace() {
  const params = useParams<{ id: string }>();
  const quoteId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("inputs");
  const [isSaving, setIsSaving] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [uploadingType, setUploadingType] = useState<string | null>(null);
  const [isGeneratingPDF, setIsGeneratingPDF] = useState(false);

  // File input refs
  const pdfInputRef = useRef<HTMLInputElement>(null);
  const imageInputRef = useRef<HTMLInputElement>(null);
  const audioInputRef = useRef<HTMLInputElement>(null);

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

  const { data: fullQuote, isLoading, refetch } = trpc.quotes.getFull.useQuery(
    { id: quoteId },
    { enabled: quoteId > 0 }
  );

  const { data: storageStatus } = trpc.inputs.storageStatus.useQuery();

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

  const createInput = trpc.inputs.create.useMutation({
    onSuccess: () => {
      setNewTextInput("");
      refetch();
    },
    onError: (error) => toast.error("Failed to add input: " + error.message),
  });

  const uploadFile = trpc.inputs.uploadFile.useMutation({
    onSuccess: () => {
      toast.success("File uploaded successfully");
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
      setTaxRate(fullQuote.quote.taxRate || "0");
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
      });
    } finally {
      setIsSaving(false);
    }
  };

  const handleGeneratePDF = async () => {
    setIsGeneratingPDF(true);
    try {
      // Fetch the PDF HTML from the server
      const response = await fetch(`/api/trpc/quotes.generatePDF?input=${encodeURIComponent(JSON.stringify({ id: quoteId }))}`);
      const result = await response.json();
      
      if (result.error) {
        throw new Error(result.error.message || "Failed to generate PDF");
      }

      const html = result.result.data.html;

      // Open in new window for printing/saving as PDF
      const printWindow = window.open("", "_blank");
      if (printWindow) {
        printWindow.document.write(html);
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
    inputType: "pdf" | "image" | "audio"
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
    inputType: "pdf" | "image" | "audio"
  ) => {
    const file = event.target.files?.[0];
    if (file) {
      handleFileUpload(file, inputType);
    }
    // Reset input so same file can be selected again
    event.target.value = "";
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
      <div className="flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (!fullQuote?.quote) {
    return (
      <div className="text-center py-12">
        <h2 className="text-xl font-semibold mb-2">Quote not found</h2>
        <Button variant="outline" onClick={() => setLocation("/dashboard")}>
          <ArrowLeft className="mr-2 h-4 w-4" />
          Back to Dashboard
        </Button>
      </div>
    );
  }

  const { quote, lineItems, inputs } = fullQuote;
  const status = quote.status as QuoteStatus;

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
            </div>
            <p className="text-muted-foreground">
              {quote.clientName || "No client specified"}
            </p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleSaveQuote} disabled={isSaving}>
            {isSaving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
            Save
          </Button>
          <Button variant="outline" onClick={handleGeneratePDF} disabled={isGeneratingPDF}>
            {isGeneratingPDF ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Download className="mr-2 h-4 w-4" />}
            PDF
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
        <TabsList className="grid w-full grid-cols-4 max-w-2xl">
          <TabsTrigger value="inputs" className="flex items-center gap-2">
            <Upload className="h-4 w-4" />
            <span className="hidden sm:inline">Inputs</span>
          </TabsTrigger>
          <TabsTrigger value="interpretation" className="flex items-center gap-2">
            <Brain className="h-4 w-4" />
            <span className="hidden sm:inline">Interpretation</span>
          </TabsTrigger>
          <TabsTrigger value="estimate" className="flex items-center gap-2">
            <Calculator className="h-4 w-4" />
            <span className="hidden sm:inline">Internal</span>
          </TabsTrigger>
          <TabsTrigger value="quote" className="flex items-center gap-2">
            <FileText className="h-4 w-4" />
            <span className="hidden sm:inline">Quote</span>
          </TabsTrigger>
        </TabsList>

        {/* INPUTS TAB */}
        <TabsContent value="inputs" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Evidence & Inputs
              </CardTitle>
              <p className="text-sm text-muted-foreground">
                Upload tender documents, images, audio recordings, or add text notes.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              {/* Storage status warning */}
              {storageStatus && !storageStatus.configured && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                  <div className="flex items-start gap-3">
                    <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0 mt-0.5" />
                    <div>
                      <p className="font-medium text-amber-800">File storage not configured</p>
                      <p className="text-sm text-amber-700 mt-1">
                        File uploads are disabled. Contact support to enable file storage.
                      </p>
                    </div>
                  </div>
                </div>
              )}

              {/* Upload buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => pdfInputRef.current?.click()}
                  disabled={isUploading || !storageStatus?.configured}
                >
                  {isUploading && uploadingType === "pdf" ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileText className="h-6 w-6" />
                  )}
                  <span className="text-xs">PDF Document</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => imageInputRef.current?.click()}
                  disabled={isUploading || !storageStatus?.configured}
                >
                  {isUploading && uploadingType === "image" ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <FileImage className="h-6 w-6" />
                  )}
                  <span className="text-xs">Image/Drawing</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2"
                  onClick={() => audioInputRef.current?.click()}
                  disabled={isUploading || !storageStatus?.configured}
                >
                  {isUploading && uploadingType === "audio" ? (
                    <Loader2 className="h-6 w-6 animate-spin" />
                  ) : (
                    <Mic className="h-6 w-6" />
                  )}
                  <span className="text-xs">Audio Recording</span>
                </Button>
                <Button
                  variant="outline"
                  className="h-20 flex-col gap-2 opacity-50 cursor-not-allowed"
                  disabled
                >
                  <Mail className="h-6 w-6" />
                  <span className="text-xs">Email Import</span>
                </Button>
              </div>

              {/* Text input */}
              <div className="space-y-3">
                <Label>Add Text Note</Label>
                <Textarea
                  placeholder="Paste or type notes, requirements, or specifications..."
                  value={newTextInput}
                  onChange={(e) => setNewTextInput(e.target.value)}
                  rows={4}
                />
                <Button onClick={handleAddTextInput} disabled={createInput.isPending}>
                  <Plus className="mr-2 h-4 w-4" />
                  Add Note
                </Button>
              </div>

              {/* Existing inputs */}
              {inputs && inputs.length > 0 && (
                <div className="space-y-3">
                  <Label>Added Inputs ({inputs.length})</Label>
                  <div className="space-y-2">
                    {inputs.map((input: QuoteInput) => (
                      <div
                        key={input.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="flex items-start gap-3 min-w-0 flex-1">
                          {input.inputType === "text" && <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                          {input.inputType === "pdf" && <FileText className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
                          {input.inputType === "image" && <FileImage className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />}
                          {input.inputType === "audio" && <Mic className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />}
                          {input.inputType === "email" && <Mail className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0 flex-1">
                            <p className="text-sm font-medium">
                              {input.filename || input.inputType.charAt(0).toUpperCase() + input.inputType.slice(1) + " Input"}
                            </p>
                            {input.content && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {input.content}
                              </p>
                            )}
                            {input.mimeType && (
                              <p className="text-xs text-muted-foreground mt-1">
                                {input.mimeType}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Added {new Date(input.createdAt).toLocaleDateString("en-GB")}
                            </p>
                          </div>
                        </div>
                        <div className="flex items-center gap-1">
                          {input.fileUrl && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-primary"
                              onClick={() => window.open(input.fileUrl!, "_blank")}
                            >
                              <ExternalLink className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => deleteInput.mutate({ id: input.id, quoteId })}
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
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
                          <td className="p-3">{item.description}</td>
                          <td className="p-3 text-right">{item.quantity}</td>
                          <td className="p-3">{item.unit}</td>
                          <td className="p-3 text-right">£{parseFloat(item.rate || "0").toFixed(2)}</td>
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
              <CardTitle>Terms & Conditions</CardTitle>
            </CardHeader>
            <CardContent>
              <Textarea
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                placeholder="Payment terms, warranty, exclusions, etc..."
                rows={6}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
