import { useAuth } from "@/_core/hooks/useAuth";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { trpc } from "@/lib/trpc";
import {
  Plus,
  FileText,
  Clock,
  CheckCircle2,
  Send,
  XCircle,
  MoreHorizontal,
  Search,
  Layers,
} from "lucide-react";
import { useLocation } from "wouter";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useState } from "react";
import { toast } from "sonner";

type QuoteStatus = "draft" | "sent" | "accepted" | "declined";

interface QuoteData {
  id: number;
  title: string | null;
  reference: string | null;
  clientName: string | null;
  status: string;
  total: string | null;
  createdAt: Date;
  quoteMode?: string | null;
}

const statusConfig: Record<QuoteStatus, { label: string; icon: typeof FileText; className: string }> = {
  draft: { label: "Draft", icon: Clock, className: "status-draft" },
  sent: { label: "Sent", icon: Send, className: "status-sent" },
  accepted: { label: "Accepted", icon: CheckCircle2, className: "status-accepted" },
  declined: { label: "Declined", icon: XCircle, className: "status-declined" },
};

export default function Dashboard() {
  const { user } = useAuth();
  const [, setLocation] = useLocation();
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<QuoteStatus | "all">("all");

  const [deleteConfirmId, setDeleteConfirmId] = useState<number | null>(null);
  const [deleteConfirmTitle, setDeleteConfirmTitle] = useState<string>("");

  // New quote creation dialog state
  const [showCreateDialog, setShowCreateDialog] = useState(false);
  const [quoteMode, setQuoteMode] = useState<"simple" | "comprehensive">("simple");
  const [tradePreset, setTradePreset] = useState<string>("");

  const { data: quotes, isLoading, refetch } = trpc.quotes.list.useQuery();
  const { data: tradePresets } = trpc.quotes.getTradePresets.useQuery();

  const createQuote = trpc.quotes.create.useMutation({
    onSuccess: (data) => {
      setShowCreateDialog(false);
      setQuoteMode("simple");
      setTradePreset("");
      setLocation(`/quotes/${data.id}`);
    },
    onError: (error) => {
      toast.error("Failed to create quote: " + error.message);
    },
  });

  const deleteQuote = trpc.quotes.delete.useMutation({
    onSuccess: (data) => {
      toast.success(`Quote deleted${data.deletedFilesCount > 0 ? ` (${data.deletedFilesCount} files removed)` : ""}`);
      refetch();
      setDeleteConfirmId(null);
    },
    onError: (error) => {
      toast.error("Failed to delete quote: " + error.message);
    },
  });

  const duplicateQuote = trpc.quotes.duplicate.useMutation({
    onSuccess: (data) => {
      toast.success("Quote duplicated successfully");
      setLocation(`/quotes/${data.id}`);
    },
    onError: (error) => {
      toast.error("Failed to duplicate quote: " + error.message);
    },
  });

  const handleDuplicateClick = (e: React.MouseEvent, quoteId: number) => {
    e.stopPropagation();
    duplicateQuote.mutate({ id: quoteId });
  };

  const handleCreateQuote = () => {
    setShowCreateDialog(true);
  };

  const handleConfirmCreate = () => {
    if (quoteMode === "comprehensive" && !tradePreset) {
      toast.error("Please select a trade/industry type for comprehensive quotes");
      return;
    }
    createQuote.mutate({
      quoteMode,
      tradePreset: quoteMode === "comprehensive" ? tradePreset : undefined,
    });
  };

  const handleDeleteClick = (e: React.MouseEvent, quote: QuoteData) => {
    e.stopPropagation();
    setDeleteConfirmId(quote.id);
    setDeleteConfirmTitle(quote.title || quote.reference || `Quote #${quote.id}`);
  };

  const handleConfirmDelete = () => {
    if (deleteConfirmId) {
      deleteQuote.mutate({ id: deleteConfirmId });
    }
  };

  const filteredQuotes = quotes?.filter((quote: QuoteData) => {
    const matchesSearch =
      !searchQuery ||
      quote.title?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.clientName?.toLowerCase().includes(searchQuery.toLowerCase()) ||
      quote.reference?.toLowerCase().includes(searchQuery.toLowerCase());

    const matchesStatus = statusFilter === "all" || quote.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  const stats = {
    total: quotes?.length || 0,
    draft: quotes?.filter((q: QuoteData) => q.status === "draft").length || 0,
    sent: quotes?.filter((q: QuoteData) => q.status === "sent").length || 0,
    accepted: quotes?.filter((q: QuoteData) => q.status === "accepted").length || 0,
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Quotes</h1>
          <p className="text-muted-foreground">
            Welcome back, {user?.name || "there"}. Manage your quotes here.
          </p>
        </div>
        <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
          <Plus className="mr-2 h-4 w-4" />
          New Quote
        </Button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("all")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Total Quotes</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.total}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("draft")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Drafts</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.draft}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("sent")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Sent</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.sent}</div>
          </CardContent>
        </Card>
        <Card className="cursor-pointer hover:border-primary/50 transition-colors" onClick={() => setStatusFilter("accepted")}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">Accepted</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{stats.accepted}</div>
          </CardContent>
        </Card>
      </div>

      {/* Filters */}
      <div className="flex flex-col sm:flex-row gap-4">
        <div className="relative flex-1 max-w-sm">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
          <Input
            placeholder="Search quotes..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="pl-9"
          />
        </div>
        <div className="flex gap-2 flex-wrap">
          {(["all", "draft", "sent", "accepted", "declined"] as const).map((status) => (
            <Button
              key={status}
              variant={statusFilter === status ? "default" : "outline"}
              size="sm"
              onClick={() => setStatusFilter(status)}
            >
              {status === "all" ? "All" : statusConfig[status].label}
            </Button>
          ))}
        </div>
      </div>

      {/* Quote List */}
      <Card>
        <CardContent className="p-0">
          {isLoading ? (
            <div className="p-8 text-center text-muted-foreground">Loading quotes...</div>
          ) : !filteredQuotes?.length ? (
            <div className="p-8 text-center">
              <FileText className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
              <h3 className="text-lg font-medium mb-2">No quotes yet</h3>
              <p className="text-muted-foreground mb-4">
                Create your first quote to get started.
              </p>
              <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
                <Plus className="mr-2 h-4 w-4" />
                Create Quote
              </Button>
            </div>
          ) : (
            <div className="divide-y">
              {filteredQuotes.map((quote: QuoteData, index: number) => {
                const status = quote.status as QuoteStatus;
                const config = statusConfig[status];
                const StatusIcon = config.icon;

                return (
                  <div
                    key={quote.id}
                    className={`flex items-center justify-between p-4 hover:bg-muted/50 cursor-pointer transition-colors ${
                      index % 2 === 1 ? "bg-muted/30" : ""
                    }`}
                    onClick={() => setLocation(`/quotes/${quote.id}`)}
                  >
                    <div className="flex items-center gap-4 min-w-0">
                      <div className="h-10 w-10 rounded-lg bg-primary/10 flex items-center justify-center shrink-0">
                        {(quote as any).quoteMode === "comprehensive" ? (
                          <Layers className="h-5 w-5 text-primary" />
                        ) : (
                          <FileText className="h-5 w-5 text-primary" />
                        )}
                      </div>
                      <div className="min-w-0">
                        <div className="font-medium truncate flex items-center gap-2">
                          {quote.title || quote.reference || `Quote #${quote.id}`}
                          {(quote as any).quoteMode === "comprehensive" && (
                            <Badge variant="outline" className="text-xs shrink-0">Comprehensive</Badge>
                          )}
                        </div>
                        <div className="text-sm text-muted-foreground truncate">
                          {quote.clientName || "No client specified"}
                        </div>
                      </div>
                    </div>
                    <div className="flex items-center gap-4">
                      <div className="text-right hidden sm:block">
                        <div className="font-medium">
                          £{parseFloat(quote.total || "0").toLocaleString("en-GB", { minimumFractionDigits: 2 })}
                        </div>
                        <div className="text-xs text-muted-foreground">
                          {new Date(quote.createdAt).toLocaleDateString("en-GB")}
                        </div>
                      </div>
                      <Badge className={config.className}>
                        <StatusIcon className="h-3 w-3 mr-1" />
                        {config.label}
                      </Badge>
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild onClick={(e) => e.stopPropagation()}>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={(e) => { e.stopPropagation(); setLocation(`/quotes/${quote.id}`); }}>
                            Open
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            onClick={(e) => handleDuplicateClick(e, quote.id)}
                            disabled={duplicateQuote.isPending}
                          >
                            {duplicateQuote.isPending ? "Duplicating..." : "Duplicate"}
                          </DropdownMenuItem>
                          <DropdownMenuItem 
                            className="text-destructive"
                            onClick={(e) => handleDeleteClick(e, quote)}
                          >
                            Delete
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </CardContent>
      </Card>

      {/* New Quote Creation Dialog */}
      <Dialog open={showCreateDialog} onOpenChange={(open) => { if (!open) { setShowCreateDialog(false); setQuoteMode("simple"); setTradePreset(""); } }}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>Create New Quote</DialogTitle>
            <DialogDescription>
              Choose the type of quote you want to create.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-6 py-4">
            <div className="space-y-3">
              <Label className="text-sm font-medium">Quote Type</Label>
              <RadioGroup value={quoteMode} onValueChange={(v) => { setQuoteMode(v as "simple" | "comprehensive"); if (v === "simple") setTradePreset(""); }}>
                <div className="flex items-start space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="simple" id="simple" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="simple" className="font-medium cursor-pointer">
                      Simple Quote
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Standard single-page quote with line items, terms, and PDF output. Best for straightforward pricing.
                    </p>
                  </div>
                </div>
                <div className="flex items-start space-x-3 p-3 rounded-lg border cursor-pointer hover:bg-muted/50 transition-colors">
                  <RadioGroupItem value="comprehensive" id="comprehensive" className="mt-0.5" />
                  <div className="flex-1">
                    <Label htmlFor="comprehensive" className="font-medium cursor-pointer">
                      Comprehensive Quote
                    </Label>
                    <p className="text-sm text-muted-foreground mt-1">
                      Multi-section tender package with timeline, site requirements, quality compliance, and document organisation. Best for complex projects.
                    </p>
                  </div>
                </div>
              </RadioGroup>
            </div>

            {quoteMode === "comprehensive" && (
              <div className="space-y-3">
                <Label className="text-sm font-medium">Trade / Industry Type</Label>
                <Select value={tradePreset} onValueChange={setTradePreset}>
                  <SelectTrigger>
                    <SelectValue placeholder="Select your trade..." />
                  </SelectTrigger>
                  <SelectContent className="max-h-80">
                    {tradePresets && (() => {
                      const grouped = tradePresets.reduce<Record<string, typeof tradePresets>>((acc, preset) => {
                        const cat = (preset as any).category || "Other";
                        if (!acc[cat]) acc[cat] = [];
                        acc[cat].push(preset);
                        return acc;
                      }, {});
                      return Object.entries(grouped).map(([category, presets]) => (
                        <div key={category}>
                          <div className="px-2 py-1.5 text-xs font-semibold text-muted-foreground uppercase tracking-wider">{category}</div>
                          {presets.map((preset) => (
                            <SelectItem key={preset.key} value={preset.key}>
                              <div>
                                <div className="font-medium">{preset.name}</div>
                                <div className="text-xs text-muted-foreground">{preset.description}</div>
                              </div>
                            </SelectItem>
                          ))}
                        </div>
                      ));
                    })()}
                  </SelectContent>
                </Select>
                <p className="text-xs text-muted-foreground">
                  This pre-configures sections, AI prompts, and document categories for your trade. You can customise everything after creation.
                </p>
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => { setShowCreateDialog(false); setQuoteMode("simple"); setTradePreset(""); }}>
              Cancel
            </Button>
            <Button 
              onClick={handleConfirmCreate} 
              disabled={createQuote.isPending || (quoteMode === "comprehensive" && !tradePreset)}
            >
              {createQuote.isPending ? "Creating..." : "Create Quote"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete Confirmation Dialog */}
      <AlertDialog open={deleteConfirmId !== null} onOpenChange={(open) => !open && setDeleteConfirmId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete Quote</AlertDialogTitle>
            <AlertDialogDescription>
              Are you sure you want to delete "{deleteConfirmTitle}"? This will permanently remove the quote and all associated files. This action cannot be undone.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteQuote.isPending}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmDelete}
              disabled={deleteQuote.isPending}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleteQuote.isPending ? "Deleting..." : "Delete"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
