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
import {
  Plus,
  Package,
  Search,
  MoreHorizontal,
  Pencil,
  Trash2,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { useState } from "react";
import { toast } from "sonner";

interface CatalogItemData {
  id: number;
  name: string;
  description: string | null;
  category: string | null;
  unit: string | null;
  defaultRate: string | null;
  costPrice: string | null;
  isActive: number | null;
}

export default function Catalog() {
  const [searchQuery, setSearchQuery] = useState("");
  const [isAddDialogOpen, setIsAddDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<CatalogItemData | null>(null);

  // Form state
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [category, setCategory] = useState("");
  const [unit, setUnit] = useState("each");
  const [defaultRate, setDefaultRate] = useState("");
  const [costPrice, setCostPrice] = useState("");

  const { data: items, isLoading, refetch } = trpc.catalog.list.useQuery();

  const createItem = trpc.catalog.create.useMutation({
    onSuccess: () => {
      toast.success("Item added to catalog");
      resetForm();
      setIsAddDialogOpen(false);
      refetch();
    },
    onError: (error) => toast.error("Failed to add item: " + error.message),
  });

  const updateItem = trpc.catalog.update.useMutation({
    onSuccess: () => {
      toast.success("Item updated");
      resetForm();
      setEditingItem(null);
      refetch();
    },
    onError: (error) => toast.error("Failed to update: " + error.message),
  });

  const deleteItem = trpc.catalog.delete.useMutation({
    onSuccess: () => {
      toast.success("Item deleted");
      refetch();
    },
    onError: (error) => toast.error("Failed to delete: " + error.message),
  });

  const resetForm = () => {
    setName("");
    setDescription("");
    setCategory("");
    setUnit("each");
    setDefaultRate("");
    setCostPrice("");
  };

  const handleEdit = (item: CatalogItemData) => {
    setEditingItem(item);
    setName(item.name);
    setDescription(item.description || "");
    setCategory(item.category || "");
    setUnit(item.unit || "each");
    setDefaultRate(item.defaultRate || "");
    setCostPrice(item.costPrice || "");
  };

  const handleSubmit = () => {
    if (!name.trim()) {
      toast.error("Please enter a name");
      return;
    }

    if (editingItem) {
      updateItem.mutate({
        id: editingItem.id,
        name,
        description: description || undefined,
        category: category || undefined,
        unit: unit || undefined,
        defaultRate: defaultRate || undefined,
        costPrice: costPrice || undefined,
      });
    } else {
      createItem.mutate({
        name,
        description: description || undefined,
        category: category || undefined,
        unit: unit || undefined,
        defaultRate: defaultRate || undefined,
        costPrice: costPrice || undefined,
      });
    }
  };

  const filteredItems = items?.filter((item: CatalogItemData) => {
    if (!searchQuery) return true;
    const query = searchQuery.toLowerCase();
    return (
      item.name.toLowerCase().includes(query) ||
      item.description?.toLowerCase().includes(query) ||
      item.category?.toLowerCase().includes(query)
    );
  });

  // Group items by category
  const groupedItems = filteredItems?.reduce((acc: Record<string, CatalogItemData[]>, item: CatalogItemData) => {
    const cat = item.category || "Uncategorized";
    if (!acc[cat]) acc[cat] = [];
    acc[cat].push(item);
    return acc;
  }, {} as Record<string, CatalogItemData[]>);

  const categories = groupedItems ? Object.keys(groupedItems).sort() : [];

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">Product & Service Catalog</h1>
          <p className="text-muted-foreground">
            Manage your reusable products and services for quick quote creation.
          </p>
        </div>
        <Dialog open={isAddDialogOpen} onOpenChange={setIsAddDialogOpen}>
          <DialogTrigger asChild>
            <Button onClick={() => { resetForm(); setEditingItem(null); }}>
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
                <Input
                  id="name"
                  placeholder="e.g., Electrical Installation"
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Input
                  id="description"
                  placeholder="Brief description..."
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="category">Category</Label>
                  <Input
                    id="category"
                    placeholder="e.g., Labour"
                    value={category}
                    onChange={(e) => setCategory(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="unit">Unit</Label>
                  <Input
                    id="unit"
                    placeholder="e.g., hour, each, m²"
                    value={unit}
                    onChange={(e) => setUnit(e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="defaultRate">Sell Price (£)</Label>
                  <Input
                    id="defaultRate"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={defaultRate}
                    onChange={(e) => setDefaultRate(e.target.value)}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="costPrice">Buy-in Price (£)</Label>
                  <Input
                    id="costPrice"
                    type="number"
                    step="0.01"
                    placeholder="0.00"
                    value={costPrice}
                    onChange={(e) => setCostPrice(e.target.value)}
                  />
                </div>
              </div>
              <Button onClick={handleSubmit} className="w-full" disabled={createItem.isPending}>
                Add to Catalog
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Search */}
      <div className="relative max-w-sm">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          placeholder="Search catalog..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="pl-9"
        />
      </div>

      {/* Edit Dialog */}
      <Dialog open={!!editingItem} onOpenChange={(open) => !open && setEditingItem(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Catalog Item</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label htmlFor="edit-name">Name *</Label>
              <Input
                id="edit-name"
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="edit-description">Description</Label>
              <Input
                id="edit-description"
                value={description}
                onChange={(e) => setDescription(e.target.value)}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-category">Category</Label>
                <Input
                  id="edit-category"
                  value={category}
                  onChange={(e) => setCategory(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-unit">Unit</Label>
                <Input
                  id="edit-unit"
                  value={unit}
                  onChange={(e) => setUnit(e.target.value)}
                />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="edit-defaultRate">Sell Price (£)</Label>
                <Input
                  id="edit-defaultRate"
                  type="number"
                  step="0.01"
                  value={defaultRate}
                  onChange={(e) => setDefaultRate(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="edit-costPrice">Buy-in Price (£)</Label>
                <Input
                  id="edit-costPrice"
                  type="number"
                  step="0.01"
                  value={costPrice}
                  onChange={(e) => setCostPrice(e.target.value)}
                />
              </div>
            </div>
            <Button onClick={handleSubmit} className="w-full" disabled={updateItem.isPending}>
              Save Changes
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Catalog Items */}
      {isLoading ? (
        <div className="text-center py-8 text-muted-foreground">Loading catalog...</div>
      ) : !filteredItems?.length ? (
        <Card>
          <CardContent className="py-12 text-center">
            <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
            <h3 className="text-lg font-medium mb-2">No catalog items yet</h3>
            <p className="text-muted-foreground mb-4">
              Add products and services to quickly add them to your quotes.
            </p>
            <Button onClick={() => setIsAddDialogOpen(true)}>
              <Plus className="mr-2 h-4 w-4" />
              Add First Item
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-6">
          {categories.map((category) => (
            <Card key={category}>
              <CardHeader className="pb-3">
                <CardTitle className="text-lg">{category}</CardTitle>
              </CardHeader>
              <CardContent className="p-0">
                <div className="divide-y">
                  {groupedItems![category].map((item: CatalogItemData, index: number) => (
                    <div
                      key={item.id}
                      className={`flex items-center justify-between p-4 ${
                        index % 2 === 1 ? "bg-muted/30" : ""
                      }`}
                    >
                      <div className="min-w-0">
                        <div className="font-medium">{item.name}</div>
                        {item.description && (
                          <div className="text-sm text-muted-foreground truncate">
                            {item.description}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-4">
                        <div className="text-right">
                          <div className="font-medium">
                            £{parseFloat(item.defaultRate || "0").toFixed(2)}
                          </div>
                          <div className="text-xs text-muted-foreground">
                            per {item.unit || "each"}
                          </div>
                        </div>
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end">
                            <DropdownMenuItem onClick={() => handleEdit(item)}>
                              <Pencil className="mr-2 h-4 w-4" />
                              Edit
                            </DropdownMenuItem>
                            <DropdownMenuItem
                              className="text-destructive"
                              onClick={() => deleteItem.mutate({ id: item.id })}
                            >
                              <Trash2 className="mr-2 h-4 w-4" />
                              Delete
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
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
