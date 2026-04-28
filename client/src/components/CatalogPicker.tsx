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
import { useState, useEffect, useMemo, useRef } from "react";
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

// Phase 4A Delivery 41 — viewport-aware dropdown placement constants.
// The picker prefers to drop downward (matches the affordance the
// caret triangle implies). When the trigger is too close to the
// viewport bottom, the dropdown flips upward to stay fully visible.
// Margins keep it off the absolute edge of the viewport so shadow + 1px
// border have breathing room.
const DROPDOWN_DESIRED_HEIGHT = 360;
const DROPDOWN_MIN_HEIGHT = 180;
const DROPDOWN_VIEWPORT_MARGIN = 8;

interface Placement {
  // Open downward (top: 100%) or upward (bottom: 100%)?
  direction: "down" | "up";
  // Cap the dropdown's max height to the room actually available so the
  // entire list (including the search input row at the top + scroll
  // area below) fits without spilling off the viewport.
  maxHeight: number;
}

export default function CatalogPicker({
  catalogItems,
  onSelect,
  label = "Catalog",
}: CatalogPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  // Default placement assumes plenty of room below; recomputed on every
  // open in computePlacement() so the very first render uses the
  // correct values and there's no flicker.
  const [placement, setPlacement] = useState<Placement>({
    direction: "down",
    maxHeight: DROPDOWN_DESIRED_HEIGHT,
  });
  const triggerRef = useRef<HTMLButtonElement | null>(null);

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

  // Phase 4A Delivery 41 — measure trigger position vs viewport before
  // opening so the dropdown lands where it'll actually be visible.
  // Called from the trigger's onClick the moment we're about to flip
  // open=true, so the very first render uses the correct placement
  // and there's no flash of mispositioned dropdown.
  //
  // Decision rule:
  //   1. Compute room above and below the trigger.
  //   2. If room below ≥ desired (360px), drop down (the natural fit).
  //   3. Else if room above > room below, flip up — and cap maxHeight
  //      to whatever room is actually available above.
  //   4. Else stay down but cap maxHeight to room below. We still want
  //      ≥ DROPDOWN_MIN_HEIGHT so the search input + at least a couple
  //      of items are reachable; smaller than that and we accept some
  //      clipping (tiny viewport — user can scroll the page in that
  //      degenerate case).
  const computePlacement = (): Placement => {
    const trigger = triggerRef.current;
    if (!trigger) {
      return { direction: "down", maxHeight: DROPDOWN_DESIRED_HEIGHT };
    }
    const rect = trigger.getBoundingClientRect();
    const viewportH = window.innerHeight;
    const roomBelow = viewportH - rect.bottom - DROPDOWN_VIEWPORT_MARGIN;
    const roomAbove = rect.top - DROPDOWN_VIEWPORT_MARGIN;

    if (roomBelow >= DROPDOWN_DESIRED_HEIGHT) {
      return { direction: "down", maxHeight: DROPDOWN_DESIRED_HEIGHT };
    }
    if (roomAbove > roomBelow && roomAbove >= DROPDOWN_MIN_HEIGHT) {
      return {
        direction: "up",
        maxHeight: Math.min(DROPDOWN_DESIRED_HEIGHT, Math.floor(roomAbove)),
      };
    }
    return {
      direction: "down",
      maxHeight: Math.max(
        DROPDOWN_MIN_HEIGHT,
        Math.min(DROPDOWN_DESIRED_HEIGHT, Math.floor(roomBelow)),
      ),
    };
  };

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
        ref={triggerRef}
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen((wasOpen) => {
            // Compute placement at the moment we're about to OPEN so
            // the first render uses the right position and there's no
            // flash. Closing path doesn't need a measurement.
            if (!wasOpen) {
              setPlacement(computePlacement());
            }
            return !wasOpen;
          });
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
          className={
            placement.direction === "up"
              ? "absolute left-0 z-50 mb-1 bottom-full bg-white rounded-lg shadow-xl"
              : "absolute left-0 z-50 mt-1 bg-white rounded-lg shadow-xl"
          }
          style={{
            width: 320,
            maxHeight: placement.maxHeight,
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
          <div
            className="overflow-y-auto"
            style={{
              // The search input row above is ~40px tall. Subtracting
              // it from the dropdown's overall max keeps the scrollable
              // list area sized to whatever room is actually available
              // (matters when computePlacement capped maxHeight on a
              // short viewport — without this the list would still ask
              // for 300px and overflow).
              maxHeight: Math.max(60, placement.maxHeight - 40),
            }}
          >
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
