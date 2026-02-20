// IdoYourQuotes Brand Theme
// Derived from logo: dark navy text + teal accent with checkmark

export const brand = {
  // Primary colours
  navy: "#1a2b4a",           // Dark navy — headings, primary text
  navyLight: "#2a3f63",      // Lighter navy — hover states
  navyMuted: "#4a5e80",      // Muted navy — secondary text, meta info
  teal: "#0d9488",           // Primary accent — buttons, active states, CTAs
  tealLight: "#14b8a6",      // Lighter teal — highlights, hover
  
  // Backgrounds
  tealBg: "#f0fdfa",         // Teal tint — selected states, instructions
  tealBorder: "#99f6e4",     // Teal border — active inputs, selected cards
  slate: "#f1f5f9",          // Page background grey
  white: "#ffffff",
  
  // Utility
  border: "#e8ecf1",         // Default border colour
  borderLight: "#eef0f4",    // Lighter border
  shadow: "0 1px 4px rgba(0,0,0,0.04)",           // Default card shadow
  shadowHover: "0 4px 16px rgba(0,0,0,0.08)",     // Hover shadow
  shadowActive: "0 4px 16px rgba(13,148,136,0.2)", // Teal glow for selected
} as const;

// Symbol legend colours — must stay distinct for differentiation
export const symbolColors: Record<string, string> = {
  "J": "#22c55e",
  "JE": "#f97316",
  "P4": "#a855f7",
  "SO": "#ef4444",
  "N": "#3b82f6",
  "EXIT1": "#0d9488",
  "EX": "#0d9488",
  "AD": "#eab308",
  "ADE": "#f59e0b",
  "K": "#06b6d4",
  "M": "#84cc16",
  "CO": "#ec4899",
  "HF": "#f43f5e",
  "HR": "#be123c",
  "P1": "#8b5cf6",
  "P2": "#7c3aed",
  "P3": "#6d28d9",
  "LCM": "#a78bfa",
  "FARP": "#dc2626",
  "VESDA": "#991b1b",
  "CCTV": "#64748b",
  "AC": "#475569",
};

// File type configuration
export const fileTypeConfig: Record<string, { icon: string; accent: string; bg: string }> = {
  pdf: { icon: "PDF", accent: "#ef4444", bg: "#fef2f2" },
  email: { icon: "EML", accent: "#8b5cf6", bg: "#f5f3ff" },
  audio: { icon: "M4A", accent: brand.teal, bg: brand.tealBg },
  image: { icon: "IMG", accent: "#3b82f6", bg: "#eff6ff" },
  document: { icon: "DOC", accent: brand.navyMuted, bg: "#f1f5f9" },
  text: { icon: "TXT", accent: "#64748b", bg: "#f8fafc" },
};
