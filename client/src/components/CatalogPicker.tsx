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
  pricingType?: string | null;
}

interface CatalogPickerProps {
  catalogItems: CatalogItemRef[];
  onSelect: (item: CatalogItemRef) => void;
  label?: string;
}

export default function CatalogPicker({
  catalogItems,
  onSelect,
  label = "Catalog",
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

  if (!catalogItems || catalogItems.length === 0) {
    return (
      <span
        className="text-[10px]"
        style={{ color: brand.navyMuted, opacity: 0.6 }}
        title="Add items to your catalog in Settings → Catalog"
      >
        No catalog
      </span>
    );
  }

  return (
    <span className="relative inline-block" data-catalog-picker-root>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md border transition-colors hover:brightness-95"
        style={{
          backgroundColor: "#f0fdfa",
          color: "#0d9488",
          borderColor: "#99f6e4",
        }}
        title="Replace this row with an item from your catalog"
      >
        <svg
          width="11"
          height="11"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M4 19.5v-15A2.5 2.5 0 0 1 6.5 2H20v20H6.5a2.5 2.5 0 0 1 0-5H20" />
        </svg>
        <span>{label}</span>
        <svg
          width="10"
          height="10"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          style={{ transform: open ? "rotate(180deg)" : "none", transition: "transform 120ms" }}
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>
      {open && (
        <div
          className="absolute left-0 z-50 mt-1 bg-white rounded-lg shadow-xl"
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
