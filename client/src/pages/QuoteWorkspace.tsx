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
} from "lucide-react";
import { useLocation, useParams } from "wouter";
import { useState, useEffect } from "react";
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
  content: string | null;
  createdAt: Date;
}

const statusConfig: Record<QuoteStatus, { label: string; className: string }> = {
  draft: { label: "Draft", className: "status-draft" },
  sent: { label: "Sent", className: "status-sent" },
  accepted: { label: "Accepted", className: "status-accepted" },
  declined: { label: "Declined", className: "status-declined" },
};

export default function QuoteWorkspace() {
  const params = useParams<{ id: string }>();
  const quoteId = parseInt(params.id || "0");
  const [, setLocation] = useLocation();
  const [activeTab, setActiveTab] = useState("inputs");
  const [isSaving, setIsSaving] = useState(false);

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
          <Button variant="outline" onClick={() => toast.info("PDF generation coming soon")}>
            <Download className="mr-2 h-4 w-4" />
            PDF
          </Button>
          {status === "draft" && (
            <Button onClick={() => toast.info("Send quote feature coming soon")}>
              <Send className="mr-2 h-4 w-4" />
              Send Quote
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
              {/* Upload buttons */}
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("File upload coming soon")}>
                  <FileText className="h-6 w-6" />
                  <span className="text-xs">PDF Document</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("File upload coming soon")}>
                  <FileImage className="h-6 w-6" />
                  <span className="text-xs">Image/Drawing</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Audio upload coming soon")}>
                  <Mic className="h-6 w-6" />
                  <span className="text-xs">Audio Recording</span>
                </Button>
                <Button variant="outline" className="h-20 flex-col gap-2" onClick={() => toast.info("Email import coming soon")}>
                  <Mail className="h-6 w-6" />
                  <span className="text-xs">Email/Text</span>
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
                  <Label>Added Inputs</Label>
                  <div className="space-y-2">
                    {inputs.map((input: QuoteInput) => (
                      <div
                        key={input.id}
                        className="flex items-start justify-between p-3 rounded-lg border bg-muted/30"
                      >
                        <div className="flex items-start gap-3 min-w-0">
                          {input.inputType === "text" && <FileText className="h-5 w-5 text-muted-foreground shrink-0 mt-0.5" />}
                          {input.inputType === "pdf" && <FileText className="h-5 w-5 text-red-500 shrink-0 mt-0.5" />}
                          {input.inputType === "image" && <FileImage className="h-5 w-5 text-blue-500 shrink-0 mt-0.5" />}
                          {input.inputType === "audio" && <Mic className="h-5 w-5 text-green-500 shrink-0 mt-0.5" />}
                          {input.inputType === "email" && <Mail className="h-5 w-5 text-purple-500 shrink-0 mt-0.5" />}
                          <div className="min-w-0">
                            <p className="text-sm font-medium">
                              {input.filename || input.inputType.charAt(0).toUpperCase() + input.inputType.slice(1) + " Input"}
                            </p>
                            {input.content && (
                              <p className="text-sm text-muted-foreground line-clamp-2 mt-1">
                                {input.content}
                              </p>
                            )}
                            <p className="text-xs text-muted-foreground mt-1">
                              Added {new Date(input.createdAt).toLocaleDateString("en-GB")}
                            </p>
                          </div>
                        </div>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-8 w-8 text-muted-foreground hover:text-destructive"
                          onClick={() => deleteInput.mutate({ id: input.id, quoteId })}
                        >
                          <X className="h-4 w-4" />
                        </Button>
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
                {upsertTenderContext.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
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
                Your private thinking space. Costs, time estimates, and risk notes. Never visible to clients.
              </p>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="space-y-3">
                <Label>Internal Notes & Calculations</Label>
                <Textarea
                  placeholder="Document your cost calculations, time estimates, material costs, labour rates..."
                  value={internalNotes}
                  onChange={(e) => setInternalNotes(e.target.value)}
                  rows={6}
                />
              </div>

              <div className="space-y-3">
                <Label className="flex items-center gap-2">
                  <AlertTriangle className="h-4 w-4 text-warning" />
                  Risk Notes
                </Label>
                <Textarea
                  placeholder="Document any risks, uncertainties, or assumptions that affect your pricing..."
                  value={riskNotes}
                  onChange={(e) => setRiskNotes(e.target.value)}
                  rows={4}
                />
              </div>

              <div className="bg-muted/50 rounded-lg p-4 border">
                <div className="flex items-start gap-3">
                  <Calculator className="h-5 w-5 text-primary shrink-0 mt-0.5" />
                  <div>
                    <p className="font-medium">Cost Breakdown & Time Estimates</p>
                    <p className="text-sm text-muted-foreground mt-1">
                      Structured cost breakdown and time estimate tables will be available in a future update.
                    </p>
                  </div>
                </div>
              </div>

              <Button onClick={handleSaveInternalEstimate} disabled={upsertInternalEstimate.isPending}>
                {upsertInternalEstimate.isPending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
                Save Internal Estimate
              </Button>
            </CardContent>
          </Card>
        </TabsContent>

        {/* QUOTE TAB */}
        <TabsContent value="quote" className="space-y-6">
          <div className="grid lg:grid-cols-3 gap-6">
            {/* Quote Details */}
            <Card className="lg:col-span-2">
              <CardHeader>
                <CardTitle>Quote Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="grid sm:grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="title">Quote Title</Label>
                    <Input
                      id="title"
                      placeholder="e.g., Kitchen Renovation"
                      value={title}
                      onChange={(e) => setTitle(e.target.value)}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="reference">Reference</Label>
                    <Input
                      id="reference"
                      value={quote.reference || ""}
                      disabled
                      className="bg-muted"
                    />
                  </div>
                </div>

                <div className="space-y-2">
                  <Label htmlFor="description">Description</Label>
                  <Textarea
                    id="description"
                    placeholder="Brief description of the work..."
                    value={description}
                    onChange={(e) => setDescription(e.target.value)}
                    rows={3}
                  />
                </div>
              </CardContent>
            </Card>

            {/* Client Details */}
            <Card>
              <CardHeader>
                <CardTitle>Client Details</CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="clientName">Name</Label>
                  <Input
                    id="clientName"
                    placeholder="Client name"
                    value={clientName}
                    onChange={(e) => setClientName(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientEmail">Email</Label>
                  <Input
                    id="clientEmail"
                    type="email"
                    placeholder="client@example.com"
                    value={clientEmail}
                    onChange={(e) => setClientEmail(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientPhone">Phone</Label>
                  <Input
                    id="clientPhone"
                    placeholder="+44 123 456 7890"
                    value={clientPhone}
                    onChange={(e) => setClientPhone(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="clientAddress">Address</Label>
                  <Textarea
                    id="clientAddress"
                    placeholder="Client address..."
                    value={clientAddress}
                    onChange={(e) => setClientAddress(e.target.value)}
                    rows={2}
                  />
                </div>
              </CardContent>
            </Card>
          </div>

          {/* Line Items */}
          <Card>
            <CardHeader>
              <CardTitle>Line Items</CardTitle>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* Add new item */}
              <div className="grid grid-cols-12 gap-2 items-end">
                <div className="col-span-12 sm:col-span-5 space-y-1">
                  <Label className="text-xs">Description</Label>
                  <Input
                    placeholder="Item description"
                    value={newItemDescription}
                    onChange={(e) => setNewItemDescription(e.target.value)}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1">
                  <Label className="text-xs">Qty</Label>
                  <Input
                    type="number"
                    placeholder="1"
                    value={newItemQuantity}
                    onChange={(e) => setNewItemQuantity(e.target.value)}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1">
                  <Label className="text-xs">Unit</Label>
                  <Input
                    placeholder="each"
                    value={newItemUnit}
                    onChange={(e) => setNewItemUnit(e.target.value)}
                  />
                </div>
                <div className="col-span-4 sm:col-span-2 space-y-1">
                  <Label className="text-xs">Rate (£)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={newItemRate}
                    onChange={(e) => setNewItemRate(e.target.value)}
                  />
                </div>
                <div className="col-span-12 sm:col-span-1">
                  <Button
                    onClick={handleAddLineItem}
                    disabled={createLineItem.isPending}
                    className="w-full"
                  >
                    <Plus className="h-4 w-4" />
                  </Button>
                </div>
              </div>

              {/* Existing items */}
              {lineItems && lineItems.length > 0 ? (
                <div className="border rounded-lg overflow-hidden">
                  <table className="w-full table-zebra">
                    <thead className="bg-muted">
                      <tr>
                        <th className="text-left p-3 font-medium">Description</th>
                        <th className="text-right p-3 font-medium w-20">Qty</th>
                        <th className="text-left p-3 font-medium w-20">Unit</th>
                        <th className="text-right p-3 font-medium w-24">Rate</th>
                        <th className="text-right p-3 font-medium w-24">Total</th>
                        <th className="w-10"></th>
                      </tr>
                    </thead>
                    <tbody>
                      {lineItems.map((item: LineItem) => (
                        <tr key={item.id}>
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
              ) : (
                <div className="text-center py-8 text-muted-foreground border rounded-lg">
                  No line items yet. Add your first item above.
                </div>
              )}

              {/* Totals */}
              <div className="flex justify-end">
                <div className="w-full max-w-xs space-y-2">
                  <div className="flex justify-between text-sm">
                    <span>Subtotal</span>
                    <span>£{parseFloat(quote.subtotal || "0").toFixed(2)}</span>
                  </div>
                  <div className="flex justify-between text-sm items-center gap-2">
                    <span>VAT</span>
                    <div className="flex items-center gap-1">
                      <Input
                        type="number"
                        step="0.1"
                        className="w-16 h-8 text-right"
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
                placeholder="Enter your terms and conditions..."
                value={terms}
                onChange={(e) => setTerms(e.target.value)}
                rows={4}
              />
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
