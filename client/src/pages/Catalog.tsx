import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { trpc } from "@/lib/trpc";
import { useAuth } from "@/_core/hooks/useAuth";
import { Plus, Package, Search, Trash2, Sparkles } from "lucide-react";
import { useState, useRef, useEffect, useCallback } from "react";
import { toast } from "sonner";

interface CatalogItemData {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  defaultRate: string | null;
  costPrice: string | null;
  installTimeHrs: string | null;
  pricingType: string | null;
  isActive: number | null;
}

/**
 * Inline Editable Cell
 * Shows value as text. Click to edit. Saves on blur/Enter, cancels on Escape.
 */
function EditableCell({
  value,
  field,
  itemId,
  type = "text",
  placeholder = "\u2014",
  prefix,
  suffix,
  step,
  onSave,
  minWidth,
}: {
  value: string;
  field: string;
  itemId: number;
  type?: "text" | "number";
  placeholder?: string;
  prefix?: string;
  suffix?: string;
  step?: string;
  onSave: (id: number, field: string, value: string) => void;
  minWidth?: number;
}) {
  const [editing, setEditing] = useState(false);
  const [localValue, setLocalValue] = useState(value);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!editing) setLocalValue(value);
  }, [value, editing]);

  useEffect(() => {
    if (editing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [editing]);

  const save = useCallback(() => {
    setEditing(false);
    if (localValue !== value) {
      onSave(itemId, field, localValue);
    }
  }, [localValue, value, itemId, field, onSave]);

  const cancel = useCallback(() => {
    setEditing(false);
    setLocalValue(value);
  }, [value]);

  if (editing) {
    return (
      <input
        ref={inputRef}
        type={type}
        step={step}
        value={localValue}
        onChange={(e) => setLocalValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => {
          if (e.key === "Enter") save();
          if (e.key === "Escape") cancel();
        }}
        style={{
          width: "100%",
          minWidth: minWidth || 60,
          padding: "4px 6px",
          fontSize: 13,
          border: "1px solid #0d9488",
          borderRadius: 4,
          outline: "none",
          background: "#f0fdfa",
        }}
      />
    );
  }

  const displayValue = localValue || "";
  const isEmpty = !displayValue;

  return (
    <div
      onClick={() => setEditing(true)}
      style={{
        cursor: "pointer",
        padding: "4px 6px",
        borderRadius: 4,
        fontSize: 13,
        minHeight: 28,
        display: "flex",
        alignItems: "center",
        color: isEmpty ? "#94a3b8" : "#1a2b4a",
        transition: "background 0.15s",
      }}
      onMouseEnter={(e) => (e.currentTarget.style.background = "#f1f5f9")}
      onMouseLeave={(e) => (e.currentTarget.style.background = "transparent")}
      title="Click to edit"
    >
      {prefix && !isEmpty && <span style={{ color: "#64748b", marginRight: 2 }}>{prefix}</span>}
      {isEmpty ? placeholder : displayValue}
      {suffix && !isEmpty && <span style={{ color: "#64748b", marginLeft: 2 }}>{suffix}</span>}
    </div>
  );
}

/**
 * Catalog Page - inline-editable spreadsheet-style table showing all fields.
 * Uses existing catalog.update tRPC route. No server changes needed.
 */
export default function Catalog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);

  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("each");
  const [defaultRate, setDefaultRate] = useState("");
  const [costPrice, setCostPrice] = useState("");
  const [installTimeHrs, setInstallTimeHrs] = useState("");

  const { data: items, isLoading, refetch } = trpc.catalog.list.useQuery();
  const { user } = useAuth();

  // Sectors with a starter catalog seed. Keep in sync with the server-side
  // registry in server/catalogSeeds/index.ts. Hardcoded client-side rather
  // than imported because client cannot import server code.
  const SEEDABLE_SECTORS = ["it_services"];
  const userSector = (user as any)?.defaultTradeSector as string | null | undefined;
  const canSeedStarterCatalog = !!userSector && SEEDABLE_SECTORS.includes(userSector);

  const seedCatalog = trpc.catalog.seedFromSectorTemplate.useMutation({
    onSuccess: (result) => {
      toast.success(`Loaded ${result.seeded} starter items. Edit prices to match your own.`);
      refetch();
    },
    onError: (error: any) => toast.error("Failed to load starter catalog: " + error.message),
  });

  const createItem = trpc.catalog.create.useMutation({
    onSuccess: () => {
      toast.success("Item added to catalog");
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    },
    onError: (error: any) => toast.error("Failed to add item: " + error.message),
  });

  const updateItem = trpc.catalog.update.useMutation({
    onSuccess: () => { refetch(); },
    onError: (error: any) => toast.error("Failed to update: " + error.message),
  });

  const deleteItem = trpc.catalog.delete.useMutation({
    onSuccess: () => { toast.success("Item deleted"); refetch(); },
    onError: (error: any) => toast.error("Failed to delete: " + error.message),
  });

  const resetForm = () => {
    setName(""); setDescription(""); setCategory("");
    setUnit("each"); setDefaultRate(""); setCostPrice(""); setInstallTimeHrs("");
  };

  const handleAddSubmit = () => {
    if (!name.trim()) { toast.error("Please enter a name"); return; }
    createItem.mutate({
      name,
      description: description || undefined,
      category: category || undefined,
      unit: unit || undefined,
      defaultRate: defaultRate || undefined,
      costPrice: costPrice || undefined,
      installTimeHrs: installTimeHrs || undefined,
    });
  };

  // Inline save - called by EditableCell on blur/Enter
  const handleInlineSave = useCallback((id: number, field: string, value: string) => {
    const payload: any = { id };
    payload[field] = value || undefined;
    updateItem.mutate(payload);
  }, [updateItem]);

  const filteredItems = items?.filter((item: CatalogItemData) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query)
    );
  });

  const groupedItems = filteredItems?.reduce((acc: Record<string, CatalogItemData[]>, item: CatalogItemData) => {
    const cat = item.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, CatalogItemData[]>);

  const categories = groupedItems ? Object.keys(groupedItems).sort() : [];

  const columns = [
    { label: "Name", flex: 2.5, mw: 160 },
    { label: "Description", flex: 2, mw: 120 },
    { label: "Category", flex: 1.2, mw: 90 },
    { label: "Unit", flex: 0.7, mw: 60 },
    { label: "Sell ex VAT (£)", flex: 0.8, mw: 90 },
    { label: "Buy-in ex VAT (£)", flex: 0.8, mw: 100 },
    { label: "Install (hrs)", flex: 0.8, mw: 70 },
    { label: "Pricing", flex: 0.9, mw: 80 },
    { label: "", flex: 0.3, mw: 36 },
  ];

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product & Service Catalog</h1>
          <p className="text-muted-foreground">
            Manage your reusable products and services. Click any field to edit inline.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => resetForm()}>
              <Plus className="mr-2 h-4 w-4" />
              Add Item
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle>Add Catalog Item</DialogTitle>
            </DialogHeader>
            <div className="space-y-4 py-4">
              <div className="space-y-2">
                <Label htmlFor="name">Name *</Label>
                <Input id="name" placeholder="e.g., Linear LED Light" value={name} onChange={(e) => setName(e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input id="description" placeholder="Brief description..." value={description} onChange={(e) => setDescription(e.target.value)} />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input id="category" placeholder="e.g., Lighting" value={category} onChange={(e) => setCategory(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input id="unit" placeholder="e.g., each, hour" value={unit} onChange={(e) => setUnit(e.target.value)} />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultRate">Sell Price (ex VAT)</Label>
                  <Input id="defaultRate" type="number" step="0.01" placeholder="0.00" value={defaultRate} onChange={(e) => setDefaultRate(e.target.value)} />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="costPrice">Buy-in Price (ex VAT)</Label>
                  <Input id="costPrice" type="number" step="0.01" placeholder="0.00" value={costPrice} onChange={(e) => setCostPrice(e.target.value)} />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="installTimeHrs">Install Time (hours per unit)</Label>
                <Input id="installTimeHrs" type="number" step="0.25" placeholder="e.g. 1.5" value={installTimeHrs} onChange={(e) => setInstallTimeHrs(e.target.value)} />
                <p className="text-xs text-muted-foreground">Labour time per item - used to auto-calculate installation costs in quotes</p>
              </div>
              <Button onClick={handleAddSubmit} className="w-full" disabled={createItem.isPending}>
                Add to Catalog
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input placeholder="Search catalog..." value={searchQuery} onChange={(e) => setSearchQuery(e.target.value)} className="pl-9" />
      </div>

      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading catalog...</div>
      ) : !filteredItems?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No catalog items yet</h3>
            <p className="text-muted-foreground mb-4">Add products and services to quickly add them to your quotes.</p>
            {canSeedStarterCatalog && !searchQuery && (
              <div className="mb-6 max-w-md mx-auto p-4 rounded-lg border border-teal-200 bg-teal-50">
                <div className="flex items-center justify-center gap-2 mb-2">
                  <Sparkles className="h-5 w-5 text-teal-600" />
                  <span className="font-medium text-teal-900">Kick-start with an IT Services template</span>
                </div>
                <p className="text-sm text-teal-800 mb-3">
                  Load a starter catalog of 22 common MSP products — Microsoft 365 licensing, security &amp; backup, support contracts, engineer rates. All prices are fully editable.
                </p>
                <Button
                  variant="outline"
                  onClick={() => seedCatalog.mutate()}
                  disabled={seedCatalog.isPending}
                  className="border-teal-300 text-teal-900 hover:bg-teal-100"
                >
                  <Sparkles className="mr-2 h-4 w-4" />
                  {seedCatalog.isPending ? "Loading starter catalog..." : "Load Starter Catalog"}
                </Button>
              </div>
            )}
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" /> Add First Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((cat) => (
            <Card key={cat}>
              <CardHeader className="pb-2">
                <CardTitle className="text-lg">{cat}</CardTitle>
              </CardHeader>
              <CardContent className="p-0" style={{ overflowX: "auto", WebkitOverflowScrolling: "touch" } as React.CSSProperties}>
                {/* Column headers */}
                <div style={{ display: "flex", alignItems: "center", padding: "8px 16px", borderBottom: "1px solid #e8ecf1", background: "#f8fafc", minWidth: 800 }}>
                  {columns.map((col) => (
                    <div key={col.label} style={{ flex: col.flex, minWidth: col.mw, fontSize: 11, fontWeight: 600, color: "#64748b", textTransform: "uppercase" as const, letterSpacing: 0.5, padding: "0 6px" }}>
                      {col.label}
                    </div>
                  ))}
                </div>
                {/* Rows */}
                <div style={{ minWidth: 800 }}>
                  {groupedItems![cat].map((item: CatalogItemData, index: number) => (
                    <div key={item.id} style={{ display: "flex", alignItems: "center", padding: "6px 16px", borderBottom: "1px solid #f1f5f9", background: index % 2 === 1 ? "#fafbfc" : "white" }}>
                      <div style={{ flex: 2.5, minWidth: 160, padding: "0 2px" }}>
                        <EditableCell value={item.name} field="name" itemId={item.id} placeholder="Item name" onSave={handleInlineSave} minWidth={140} />
                      </div>
                      <div style={{ flex: 2, minWidth: 120, padding: "0 2px" }}>
                        <EditableCell value={item.description || ""} field="description" itemId={item.id} onSave={handleInlineSave} minWidth={100} />
                      </div>
                      <div style={{ flex: 1.2, minWidth: 90, padding: "0 2px" }}>
                        <EditableCell value={item.category || ""} field="category" itemId={item.id} onSave={handleInlineSave} minWidth={70} />
                      </div>
                      <div style={{ flex: 0.7, minWidth: 60, padding: "0 2px" }}>
                        <EditableCell value={item.unit || ""} field="unit" itemId={item.id} placeholder="each" onSave={handleInlineSave} minWidth={50} />
                      </div>
                      <div style={{ flex: 0.8, minWidth: 70, padding: "0 2px" }}>
                        <EditableCell value={item.defaultRate || ""} field="defaultRate" itemId={item.id} type="number" step="0.01" placeholder="0.00" prefix="£" onSave={handleInlineSave} minWidth={60} />
                      </div>
                      <div style={{ flex: 0.8, minWidth: 70, padding: "0 2px" }}>
                        <EditableCell value={item.costPrice || ""} field="costPrice" itemId={item.id} type="number" step="0.01" prefix="£" onSave={handleInlineSave} minWidth={60} />
                      </div>
                      <div style={{ flex: 0.8, minWidth: 70, padding: "0 2px" }}>
                        <EditableCell value={item.installTimeHrs || ""} field="installTimeHrs" itemId={item.id} type="number" step="0.25" suffix="hrs" onSave={handleInlineSave} minWidth={50} />
                      </div>
                      <div style={{ flex: 0.9, minWidth: 80, padding: "0 2px" }}>
                        <select
                          value={item.pricingType || "standard"}
                          onChange={(e) => handleInlineSave(item.id, "pricingType", e.target.value)}
                          style={{
                            width: "100%",
                            padding: "4px 6px",
                            fontSize: 12,
                            border: "1px solid #e2e8f0",
                            borderRadius: 4,
                            background: "white",
                            cursor: "pointer",
                            color: item.pricingType === "monthly" ? "#0d9488" : item.pricingType === "optional" ? "#8b5cf6" : item.pricingType === "annual" ? "#b45309" : "#1a2b4a",
                            fontWeight: 500,
                          }}
                        >
                          <option value="standard">Standard</option>
                          <option value="monthly">Monthly</option>
                          <option value="optional">Optional</option>
                          <option value="annual">Annual</option>
                        </select>
                      </div>
                      <div style={{ flex: 0.3, minWidth: 36, display: "flex", justifyContent: "center" }}>
                        <button
                          onClick={() => { if (confirm('Delete "' + item.name + '"?')) deleteItem.mutate({ id: item.id }); }}
                          style={{ padding: 4, borderRadius: 4, border: "none", background: "transparent", cursor: "pointer", display: "flex", alignItems: "center" }}
                          title="Delete item"
                        >
                          <Trash2 size={14} color="#94a3b8" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
