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
  Crown,
  ArrowRight,
  AlertTriangle,
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
import { useState, useEffect } from "react";
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

  // Upgrade modal state — shown when quota blocks quote creation
  const [showUpgradeModal, setShowUpgradeModal] = useState(false);
  const [upgradeReason, setUpgradeReason] = useState("");

  const { data: quotes, isLoading, refetch } = trpc.quotes.list.useQuery();
  const { data: tradePresets } = trpc.quotes.getTradePresets.useQuery();

  // Auto-populate trade preset from user's default when opening comprehensive mode
  useEffect(() => {
    if (showCreateDialog && quoteMode === "comprehensive" && !tradePreset && (user as any)?.defaultTradeSector) {
      setTradePreset((user as any).defaultTradeSector);
    }
  }, [showCreateDialog, quoteMode, user]);

  const createQuote = trpc.quotes.create.useMutation({
    onSuccess: (data) => {
      setShowCreateDialog(false);
      setQuoteMode("simple");
      setTradePreset("");
      setLocation(`/quotes/${data.id}`);
    },
    onError: (error) => {
      // If the error is a quota/subscription block, show upgrade modal instead of toast
      const msg = error.message || "";
      if (msg.includes("monthly limit") || msg.includes("trial has expired") || msg.includes("cancelled") || msg.includes("past due") || msg.includes("unpaid")) {
        setShowCreateDialog(false);
        setUpgradeReason(msg);
        setShowUpgradeModal(true);
      } else {
        toast.error("Failed to create quote: " + error.message);
      }
    },
  });

  // Subscription usage
  const { data: subStatus } = trpc.subscription.status.useQuery();

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
    // If quota is blocked, show upgrade modal immediately instead of opening create dialog
    if (subStatus?.canCreateQuote === false) {
      setUpgradeReason(subStatus.quoteBlockReason || "You've reached your plan's limit. Upgrade to create more quotes.");
      setShowUpgradeModal(true);
      return;
    }
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
        <div className="flex items-center gap-3">
          {subStatus?.quoteUsage && subStatus.quoteUsage.max > 0 && (
            <span className="text-xs text-muted-foreground">
              {subStatus.quoteUsage.current} of {subStatus.quoteUsage.max} quotes used
            </span>
          )}
          <Button onClick={handleCreateQuote} disabled={createQuote.isPending}>
            <Plus className="mr-2 h-4 w-4" />
            New Quote
          </Button>
        </div>
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
                  {(user as any)?.defaultTradeSector
                    ? "Using your default sector. You can override this or change your default in Settings."
                    : "This pre-configures sections, AI prompts, and document categories for your trade. You can customise everything after creation."}
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

      {/* ── Upgrade Modal — shown when quota blocks quote creation ── */}
      <Dialog open={showUpgradeModal} onOpenChange={setShowUpgradeModal}>
        <DialogContent className="sm:max-w-[440px]">
          <DialogHeader>
            <div className="flex items-center gap-3 mb-1">
              <div className="flex items-center justify-center w-10 h-10 rounded-full" style={{ backgroundColor: '#f0fdfa' }}>
                <Crown className="h-5 w-5" style={{ color: '#0d9488' }} />
              </div>
              <div>
                <DialogTitle className="text-lg">Upgrade Your Plan</DialogTitle>
              </div>
            </div>
            <DialogDescription className="pt-2 text-sm leading-relaxed">
              {upgradeReason || "You've reached your current plan's limits."}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-3 py-2">
            {/* Current usage */}
            {subStatus && subStatus.maxQuotesPerMonth !== -1 && (
              <div className="p-3 rounded-lg bg-gray-50 border">
                <div className="flex justify-between text-sm mb-2">
                  <span className="text-muted-foreground">Quotes used this month</span>
                  <span className="font-semibold">{subStatus.currentQuoteCount} / {subStatus.maxQuotesPerMonth}</span>
                </div>
                <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                  <div
                    className="h-full rounded-full"
                    style={{
                      width: '100%',
                      backgroundColor: '#ef4444',
                    }}
                  />
                </div>
              </div>
            )}

            {/* Trial expired info */}
            {subStatus?.isTrialExpired && (
              <div className="flex items-start gap-2 p-3 rounded-lg bg-amber-50 border border-amber-200">
                <AlertTriangle className="h-4 w-4 text-amber-600 mt-0.5 flex-shrink-0" />
                <p className="text-xs text-amber-700">
                  Your 14-day free trial has ended. Choose a plan below to continue creating professional quotes.
                </p>
              </div>
            )}

            {/* Quick plan comparison */}
            <div className="space-y-2">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Available plans</p>
              <div
                className="flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer hover:border-teal-400 transition-colors"
                style={{ borderColor: '#99f6e4' }}
                onClick={() => { setShowUpgradeModal(false); setLocation('/pricing'); }}
              >
                <div>
                  <p className="font-semibold text-sm">Solo</p>
                  <p className="text-xs text-muted-foreground">10 quotes/month · 1 user · 50 catalog items</p>
                </div>
                <p className="font-bold text-sm" style={{ color: '#0d9488' }}>£59<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              </div>
              <div
                className="flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer hover:border-blue-400 transition-colors"
                style={{ borderColor: '#bfdbfe' }}
                onClick={() => { setShowUpgradeModal(false); setLocation('/pricing'); }}
              >
                <div>
                  <p className="font-semibold text-sm">Pro <span className="text-xs font-normal px-1.5 py-0.5 rounded-full bg-blue-100 text-blue-700 ml-1">Popular</span></p>
                  <p className="text-xs text-muted-foreground">15 quotes/month · 2 users · Unlimited catalog</p>
                </div>
                <p className="font-bold text-sm text-blue-600">£99<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              </div>
              <div
                className="flex items-center justify-between p-3 rounded-lg border-2 cursor-pointer hover:border-green-400 transition-colors"
                style={{ borderColor: '#bbf7d0' }}
                onClick={() => { setShowUpgradeModal(false); setLocation('/pricing'); }}
              >
                <div>
                  <p className="font-semibold text-sm">Team</p>
                  <p className="text-xs text-muted-foreground">Unlimited quotes · 10 users · Everything in Pro</p>
                </div>
                <p className="font-bold text-sm text-green-700">£249<span className="text-xs font-normal text-muted-foreground">/mo</span></p>
              </div>
            </div>
          </div>

          <DialogFooter className="flex-col sm:flex-row gap-2">
            <Button
              variant="outline"
              onClick={() => setShowUpgradeModal(false)}
              className="w-full sm:w-auto"
            >
              Maybe later
            </Button>
            <Button
              onClick={() => { setShowUpgradeModal(false); setLocation('/pricing'); }}
              className="w-full sm:w-auto"
              style={{ backgroundColor: '#0d9488' }}
            >
              View Plans & Upgrade
              <ArrowRight className="h-4 w-4 ml-1" />
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
