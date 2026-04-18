export const TRADE_SECTOR_OPTIONS = [
  { value: "electrical", label: "Electrical Installation" },
  { value: "construction_steel", label: "Structural Steel / Engineering" },
  { value: "metalwork_bespoke", label: "Architectural & Bespoke Metalwork" },
  { value: "it_services", label: "IT Services / Managed Service Provider (MSP)" },
  { value: "website_marketing", label: "Website & Digital Marketing" },
  { value: "telecoms_cabling", label: "Telecoms / Network Cabling (Data)" },
  { value: "solar_ev", label: "Solar PV / Battery / EV Charging" },
  { value: "building_maintenance", label: "Building Maintenance / Facilities Management (FM)" },
  { value: "commercial_cleaning", label: "Commercial Cleaning" },
  { value: "general_construction", label: "General Construction / Building" },
  { value: "bathrooms_kitchens", label: "Bathrooms & Kitchens" },
  { value: "windows_doors", label: "Windows / Doors / Conservatories" },
  { value: "pest_control", label: "Pest Control" },
  { value: "scaffolding", label: "Scaffolding / Access Equipment" },
  { value: "mechanical_fabrication", label: "Mechanical Engineering / Fabrication" },
  { value: "fire_protection", label: "Fire Stopping / Passive Fire Protection" },
  { value: "lifts_access", label: "Lifts / Access Systems" },
  { value: "insulation_retrofit", label: "Air Tightness / Insulation / Retrofit" },
  { value: "plumbing", label: "Plumbing & Drainage" },
  { value: "hvac", label: "HVAC (Heating, Ventilation, Air Conditioning)" },
  { value: "roofing", label: "Roofing & Cladding" },
  { value: "joinery", label: "Joinery & Carpentry" },
  { value: "painting", label: "Painting & Decorating" },
  { value: "groundworks", label: "Groundworks / Civil Engineering" },
  { value: "fire_security", label: "Fire & Security Systems" },
  { value: "custom", label: "Other / Custom" },
];

/**
 * Visible sector options for the Register and Settings dropdowns — the four
 * GTM sectors plus Other/Custom. Introduced 18 Apr 2026 as part of the GTM
 * narrowing: the app is only being offered to IT Services, Website & Digital
 * Marketing, Commercial Cleaning, and Pest Control for initial launch.
 *
 * All 26 sector keys in TRADE_SECTOR_OPTIONS above remain valid at the engine
 * level — selectEngine() routes them correctly regardless of dropdown
 * visibility. Hidden sectors are simply not selectable in the UI.
 *
 * Kept in the same order as the full list (IT first as primary GTM sector,
 * Custom last as escape hatch).
 */
export const VISIBLE_TRADE_SECTOR_OPTIONS = [
  { value: "it_services", label: "IT Services / Managed Service Provider (MSP)" },
  { value: "website_marketing", label: "Website & Digital Marketing" },
  { value: "commercial_cleaning", label: "Commercial Cleaning" },
  { value: "pest_control", label: "Pest Control" },
  { value: "custom", label: "Other / Custom" },
];

/**
 * Returns the visible sector dropdown options with one key guarantee:
 * if `currentValue` is a valid sector key that's NOT in the visible GTM
 * list (e.g. an existing user whose defaultTradeSector is "electrical" or
 * "plumbing"), that sector is prepended to the list with a "(current)"
 * annotation so the user can see their existing selection and isn't
 * forced to either switch sectors or submit an empty form.
 *
 * This matters because the <Select> component binds value → SelectItem by
 * exact match. If the bound value has no matching item, the trigger shows
 * the placeholder, the user assumes their setting is unset, and saving
 * would silently overwrite their existing sector. Preserving the current
 * value protects legacy users from that accidental overwrite.
 *
 * New users (Register flow) should not pass currentValue — they get the
 * straight 5-option GTM list.
 *
 * If currentValue is nullish, empty, or already visible, returns the
 * straight visible list. If it's an unrecognised key (shouldn't happen,
 * but defensive), also returns the straight visible list.
 */
export function getVisibleTradeSectorOptions(
  currentValue?: string | null,
): Array<{ value: string; label: string }> {
  if (!currentValue) return VISIBLE_TRADE_SECTOR_OPTIONS;
  const alreadyVisible = VISIBLE_TRADE_SECTOR_OPTIONS.some(
    (opt) => opt.value === currentValue,
  );
  if (alreadyVisible) return VISIBLE_TRADE_SECTOR_OPTIONS;
  const match = TRADE_SECTOR_OPTIONS.find((opt) => opt.value === currentValue);
  if (!match) return VISIBLE_TRADE_SECTOR_OPTIONS;
  return [
    { value: match.value, label: `${match.label} (current)` },
    ...VISIBLE_TRADE_SECTOR_OPTIONS,
  ];
}
