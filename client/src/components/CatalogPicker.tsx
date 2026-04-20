/**
 * CatalogPicker.tsx
 *
 * "Change…" dropdown that lets the user replace a line item's item name,
 * rate, cost, install time, unit, and category with values from their
 * catalog. Extracted from the retiring QuoteDraftSummary.tsx.
 *
 * Parent is responsible for wiring the onSelect handler into whichever
 * tRPC mutation updates the line item (typically lineItems.update,
 * debounced via useAutoSave).
 */
import { useState, useEffect, useMemo } from "react";
import { brand } from "@/lib/brandTheme";

export interface CatalogItemRef {
  name: string;
  defaultRate: string | null;
  costPrice: string | null;
  installTimeHrs: string | null;
  unit: string | null;
  category: string | null;
  description?: string | null;
}

interface CatalogPickerProps {
  catalogItems: CatalogItemRef[];
  onSelect: (item: CatalogItemRef) => void;
  label?: string;
}

export default function CatalogPicker({
  catalogItems,
  onSelect,
  label = "Change…",
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");

  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    if (!q) return catalogItems;
    return catalogItems.filter((c) => {
      const name = (c.name || "").toLowerCase();
      const desc = (c.description || "").toLowerCase();
      const cat = (c.category || "").toLowerCase();
      return name.includes(q) || desc.includes(q) || cat.includes(q);
    });
  }, [catalogItems, query]);

  useEffect(() => {
    if (!open) return;
    const onDocClick = (e: MouseEvent) => {
      const target = e.target as Element | null;
      if (target && !target.closest("[data-catalog-picker-root]")) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", onDocClick);
    return () => document.removeEventListener("mousedown", onDocClick);
  }, [open]);

  if (!catalogItems || catalogItems.length === 0) return null;

  return (
    <span className="relative inline-block" data-catalog-picker-root>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="text-[9px] font-bold px-1.5 py-0.5 rounded border transition-colors hover:opacity-80"
        style={{
          backgroundColor: "#f0fdfa",
          color: "#0d9488",
          borderColor: "#99f6e4",
        }}
        title="Replace this row with an item from your catalog"
      >
        {label}
      </button>
      {open && (
        <div
          className="absolute right-0 z-50 mt-1 bg-white rounded-lg shadow-xl"
          style={{
            width: 320,
            maxHeight: 360,
            border: `1px solid ${brand.border}`,
            overflow: "hidden",
          }}
        >
          <input
            type="text"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search catalog…"
            autoFocus
            className="w-full text-sm px-2.5 py-2 outline-none"
            style={{
              borderBottom: `1px solid ${brand.borderLight}`,
              color: brand.navy,
            }}
          />
          <div className="overflow-y-auto" style={{ maxHeight: 300 }}>
            {filtered.length === 0 ? (
              <div
                className="px-3 py-4 text-xs text-center"
                style={{ color: brand.navyMuted }}
              >
                No catalog items match
              </div>
            ) : (
              filtered.map((cat, idx) => {
                const rate = cat.defaultRate ? `£${cat.defaultRate}` : "—";
                const unit = cat.unit || "each";
                return (
                  <button
                    key={idx}
                    type="button"
                    onClick={() => {
                      onSelect(cat);
                      setOpen(false);
                      setQuery("");
                    }}
                    className="w-full text-left px-2.5 py-1.5 transition-colors hover:bg-teal-50"
                    style={{ borderBottom: `1px solid ${brand.borderLight}` }}
                  >
                    <div
                      className="text-xs font-bold"
                      style={{ color: brand.navy }}
                    >
                      {cat.name}
                    </div>
                    <div
                      className="text-[10px] flex items-center gap-1.5"
                      style={{ color: brand.navyMuted }}
                    >
                      <span>
                        {rate} / {unit}
                      </span>
                      {cat.category && <span>• {cat.category}</span>}
                    </div>
                  </button>
                );
              })
            )}
          </div>
        </div>
      )}
    </span>
  );
}
