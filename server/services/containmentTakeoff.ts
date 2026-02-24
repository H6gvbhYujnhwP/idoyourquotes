/**
 * Containment Takeoff Service
 * Analyses containment/cable tray drawings to measure:
 * - Tray run lengths by size (50, 75, 100, 150, 225, 300, 450, 600mm)
 * - Tray type filtering (LV, FA, ELV, SUB)
 * - Fittings: T-pieces, cross-pieces, 90° bends, column drops
 * - Installation heights from annotations
 * - Scale detection from drawing metadata
 * 
 * Uses PDF text extraction (same as electrical takeoff) to find:
 * - Tray annotations: "NEW 100 LV TRAY @12500"
 * - Scale indicators: "1:100 @ A0"
 * - Drop annotations: "DROPS TO LOWER LEVEL"
 */

// ---- Constants ----

export const TRAY_SIZES = [50, 75, 100, 150, 225, 300, 450, 600] as const;
export type TraySize = typeof TRAY_SIZES[number];

export const TRAY_TYPES = ["LV", "FA", "ELV", "SUB"] as const;
export type TrayType = typeof TRAY_TYPES[number];

export const TRAY_DUTY_TYPES = ["light", "medium", "heavy"] as const;
export type TrayDuty = typeof TRAY_DUTY_TYPES[number];

export const WHOLESALER_LENGTH_METRES = 3;

// Colour scheme for tray sizes on marked drawings
export const TRAY_SIZE_COLOURS: Record<number, { stroke: string; fill: string; label: string }> = {
  50:  { stroke: "#22c55e", fill: "#22c55e20", label: "50mm" },
  75:  { stroke: "#06b6d4", fill: "#06b6d420", label: "75mm" },
  100: { stroke: "#3b82f6", fill: "#3b82f620", label: "100mm" },
  150: { stroke: "#8b5cf6", fill: "#8b5cf620", label: "150mm" },
  225: { stroke: "#f59e0b", fill: "#f59e0b20", label: "225mm" },
  300: { stroke: "#ef4444", fill: "#ef444420", label: "300mm" },
  450: { stroke: "#ec4899", fill: "#ec489920", label: "450mm" },
  600: { stroke: "#f97316", fill: "#f9731620", label: "600mm" },
};

// Fitting symbols for SVG overlay
export const FITTING_SYMBOLS = {
  tPiece: "T",
  crossPiece: "+",
  bend90: "L",
  drop: "↓",
  coupler: "—",
};

// ---- Types ----

export interface TraySegment {
  x1: number; y1: number;
  x2: number; y2: number;
  lengthMetres: number;
}

export interface TrayRun {
  id: string;
  sizeMillimetres: number;
  trayType: string;
  lengthMetres: number;
  heightMetres: number;
  wholesalerLengths: number;
  tPieces: number;
  crossPieces: number;
  bends90: number;
  drops: number;
  segments: TraySegment[];
}

export interface FittingSummaryBySize {
  tPieces: number;
  crossPieces: number;
  bends90: number;
  drops: number;
  couplers: number;
}

export interface UserInputs {
  trayFilter: string;
  trayDuty: string;
  extraDropPerFitting: number;
  firstPointRunLength: number;
  numberOfCircuits: number;
  additionalCablePercent: number;
}

export interface CableSummary {
  trayRouteLengthMetres: number;
  dropAllowanceMetres: number;
  firstPointMetres: number;
  additionalAllowanceMetres: number;
  totalCableMetres: number;
  cableDrums: number;
}

export interface ContainmentTakeoffResult {
  drawingRef: string;
  pageWidth: number;
  pageHeight: number;
  detectedScale: string | null;
  paperSize: string | null;
  trayRuns: TrayRun[];
  fittingSummary: Record<string, FittingSummaryBySize>;
  questions: Array<{
    id: string;
    question: string;
    context: string;
    options: Array<{ label: string; value: string }>;
    defaultValue?: string;
  }>;
  drawingNotes: string[];
  hasTextLayer: boolean;
  totalTextElements: number;
}

// ---- Extraction Helpers ----

interface ExtractedWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

/**
 * Parse tray annotation text like "NEW 100 LV TRAY @12500"
 * Returns { size, type, height } or null
 */
function parseTrayAnnotation(text: string): { size: number; type: string; height: number | null } | null {
  // Match patterns like: "100 LV TRAY", "NEW 150 LV TRAY @12500", "50 FA TRAY"
  const match = text.match(/(?:NEW\s+)?(\d+)\s+(LV|FA|ELV|SUB)\s+(?:CABLE\s+)?TRAY/i);
  if (!match) return null;

  const size = parseInt(match[1], 10);
  if (!TRAY_SIZES.includes(size as TraySize)) return null;

  const type = match[2].toUpperCase();

  // Extract height if present: @12500 = 12.5m, @2600 = 2.6m
  const heightMatch = text.match(/@(\d+)/);
  let height: number | null = null;
  if (heightMatch) {
    height = parseInt(heightMatch[1], 10) / 1000; // Convert mm to metres
  }

  return { size, type, height };
}

/**
 * Detect scale from drawing text
 * Looks for patterns like "1:100 @ A0", "SCALE 1:50"
 */
function detectScale(words: ExtractedWord[]): { scale: string | null; paperSize: string | null } {
  const allText = words.map(w => w.text).join(" ");

  // Match "1:100" or "1:50" etc.
  const scaleMatch = allText.match(/1\s*:\s*(\d+)/);
  const scale = scaleMatch ? `1:${scaleMatch[1]}` : null;

  // Match paper size: A0, A1, A2, A3
  const paperMatch = allText.match(/\b(A[0-4])\b/);
  const paperSize = paperMatch ? paperMatch[1] : null;

  return { scale, paperSize };
}

/**
 * Detect drop annotations
 * Looks for "DROPS TO LOWER LEVEL", "DROPS FROM HIGH LEVEL", etc.
 */
function detectDropAnnotations(words: ExtractedWord[]): Array<{ x: number; y: number; text: string }> {
  const drops: Array<{ x: number; y: number; text: string }> = [];
  const allText = words.map(w => ({ text: w.text, x: w.x, y: w.y }));

  for (let i = 0; i < allText.length - 2; i++) {
    const phrase = `${allText[i].text} ${allText[i + 1]?.text || ""} ${allText[i + 2]?.text || ""}`.toUpperCase();
    if (phrase.includes("DROP") && (phrase.includes("LEVEL") || phrase.includes("COLUMN"))) {
      drops.push({
        x: allText[i].x,
        y: allText[i].y,
        text: phrase.trim(),
      });
    }
  }

  return drops;
}

/**
 * Calculate scale factor: how many real-world metres per PDF unit
 * Based on standard paper sizes and scale ratio
 */
function getMetresPerPdfUnit(scale: string | null, paperSize: string | null, pageWidth: number): number {
  // Default: assume 1:100 on A0
  let scaleRatio = 100;
  if (scale) {
    const match = scale.match(/1:(\d+)/);
    if (match) scaleRatio = parseInt(match[1], 10);
  }

  // Paper sizes in mm (width for landscape)
  const paperWidthMm: Record<string, number> = {
    "A0": 1189,
    "A1": 841,
    "A2": 594,
    "A3": 420,
    "A4": 297,
  };

  const actualPaperWidth = paperWidthMm[paperSize || "A0"] || 1189;

  // PDF units → real mm → apply scale → convert to metres
  // pdfUnit * (actualPaperWidth / pageWidth) * scaleRatio / 1000
  return (actualPaperWidth / pageWidth) * scaleRatio / 1000;
}

// ---- Main Analysis Function ----

/**
 * Perform containment takeoff on a PDF drawing
 * This uses the same PDF extraction as electrical takeoff
 * but focuses on tray annotations and measurements
 */
export async function performContainmentTakeoff(
  pdfBuffer: Buffer,
  drawingRef: string = "Unknown",
  extractWithPdfJs: (buffer: Buffer) => Promise<{ chars: any[]; words: ExtractedWord[]; pageWidth: number; pageHeight: number }>,
): Promise<ContainmentTakeoffResult> {
  console.log(`[Containment Takeoff] Starting extraction for: ${drawingRef}`);

  // Step 1: Extract text from PDF
  let words: ExtractedWord[];
  let pageWidth: number;
  let pageHeight: number;

  try {
    const extracted = await extractWithPdfJs(pdfBuffer);
    words = extracted.words;
    pageWidth = extracted.pageWidth;
    pageHeight = extracted.pageHeight;
    console.log(`[Containment Takeoff] Extracted ${words.length} words from ${pageWidth}x${pageHeight} page`);
  } catch (err: any) {
    console.error(`[Containment Takeoff] PDF extraction failed:`, err.message);
    return {
      drawingRef,
      pageWidth: 0,
      pageHeight: 0,
      detectedScale: null,
      paperSize: null,
      trayRuns: [],
      fittingSummary: {},
      questions: [{
        id: "extraction-failed",
        question: "PDF extraction failed.",
        context: `Error: ${err.message}. The drawing may be scanned or in an unsupported format.`,
        options: [
          { label: "Skip this drawing", value: "skip" },
          { label: "Try again", value: "retry" },
        ],
      }],
      drawingNotes: [],
      hasTextLayer: false,
      totalTextElements: 0,
    };
  }

  if (words.length === 0) {
    return {
      drawingRef,
      pageWidth,
      pageHeight,
      detectedScale: null,
      paperSize: null,
      trayRuns: [],
      fittingSummary: {},
      questions: [{
        id: "no-text",
        question: "This PDF has no extractable text layer.",
        context: "The drawing may be scanned or flattened. Please request a vector PDF.",
        options: [
          { label: "Skip this drawing", value: "skip" },
        ],
      }],
      drawingNotes: [],
      hasTextLayer: false,
      totalTextElements: 0,
    };
  }

  // Step 2: Detect scale and paper size
  const { scale: detectedScale, paperSize } = detectScale(words);
  const metresPerUnit = getMetresPerPdfUnit(detectedScale, paperSize, pageWidth);
  console.log(`[Containment Takeoff] Scale: ${detectedScale || "unknown"}, Paper: ${paperSize || "unknown"}, m/unit: ${metresPerUnit.toFixed(6)}`);

  // Step 3: Find tray annotations
  // Build multi-word phrases from consecutive words on similar Y positions
  const phrases: Array<{ text: string; x: number; y: number; endX: number }> = [];
  const sortedWords = [...words].sort((a, b) => a.y - b.y || a.x - b.x);

  let currentPhrase = { text: "", x: 0, y: 0, endX: 0 };
  for (const word of sortedWords) {
    if (
      currentPhrase.text &&
      Math.abs(word.y - currentPhrase.y) < 5 &&
      word.x - currentPhrase.endX < 30
    ) {
      currentPhrase.text += " " + word.text;
      currentPhrase.endX = word.x + word.width;
    } else {
      if (currentPhrase.text) phrases.push({ ...currentPhrase });
      currentPhrase = { text: word.text, x: word.x, y: word.y, endX: word.x + word.width };
    }
  }
  if (currentPhrase.text) phrases.push(currentPhrase);

  // Step 4: Parse tray annotations from phrases
  interface TrayAnnotation {
    size: number;
    type: string;
    height: number | null;
    x: number;
    y: number;
    endX: number;
  }

  const trayAnnotations: TrayAnnotation[] = [];
  for (const phrase of phrases) {
    const parsed = parseTrayAnnotation(phrase.text);
    if (parsed) {
      trayAnnotations.push({
        ...parsed,
        x: phrase.x,
        y: phrase.y,
        endX: phrase.endX,
      });
    }
  }

  console.log(`[Containment Takeoff] Found ${trayAnnotations.length} tray annotations`);

  // Step 5: Detect drops
  const dropAnnotations = detectDropAnnotations(words);
  console.log(`[Containment Takeoff] Found ${dropAnnotations.length} drop annotations`);

  // Step 6: Group annotations by tray size + type and estimate run lengths
  // For now, we use annotation positions to estimate tray routes
  // Annotations along the same tray run will be at similar Y positions (horizontal runs)
  // or similar X positions (vertical runs)

  const trayGroups: Map<string, TrayAnnotation[]> = new Map();
  for (const ann of trayAnnotations) {
    const key = `${ann.size}-${ann.type}`;
    if (!trayGroups.has(key)) trayGroups.set(key, []);
    trayGroups.get(key)!.push(ann);
  }

  // Step 7: Estimate lengths from annotation spacing
  // Each annotation marks a section of tray. The distance between consecutive annotations
  // on the same line gives us the tray length for that section.
  const trayRuns: TrayRun[] = [];
  let runId = 0;

  for (const [key, annotations] of trayGroups) {
    const [sizeStr, type] = key.split("-");
    const size = parseInt(sizeStr, 10);
    const height = annotations.find(a => a.height !== null)?.height || 0;

    // Sort by position (left to right, top to bottom)
    annotations.sort((a, b) => a.y - b.y || a.x - b.x);

    // Estimate total length from the bounding area of annotations
    // This is an approximation — the AI vision analysis will refine this
    let totalLengthMetres = 0;
    const segments: TraySegment[] = [];

    for (let i = 0; i < annotations.length - 1; i++) {
      const a = annotations[i];
      const b = annotations[i + 1];

      // Calculate distance between annotation positions
      const dx = Math.abs(b.x - a.x);
      const dy = Math.abs(b.y - a.y);
      const distPdfUnits = Math.sqrt(dx * dx + dy * dy);
      const distMetres = distPdfUnits * metresPerUnit;

      // Only count if annotations are on the same approximate line (horizontal or vertical)
      if (dx > 20 || dy > 20) {
        segments.push({
          x1: a.x, y1: a.y,
          x2: b.x, y2: b.y,
          lengthMetres: Math.round(distMetres * 10) / 10,
        });
        totalLengthMetres += distMetres;
      }
    }

    // If we only have one annotation, estimate a minimum run
    if (annotations.length === 1 && totalLengthMetres === 0) {
      totalLengthMetres = 10; // Default minimum estimate
    }

    totalLengthMetres = Math.round(totalLengthMetres * 10) / 10;
    const wholesalerLengths = Math.ceil(totalLengthMetres / WHOLESALER_LENGTH_METRES);

    // Count fittings: estimate from the number of direction changes in annotations
    // T-pieces: where a perpendicular tray meets this one
    // Cross-pieces: where this tray crosses another
    // 90° bends: where the annotation path changes direction significantly
    let tPieces = 0;
    let crossPieces = 0;
    let bends90 = 0;

    for (let i = 1; i < annotations.length - 1; i++) {
      const prev = annotations[i - 1];
      const curr = annotations[i];
      const next = annotations[i + 1];

      const dx1 = curr.x - prev.x;
      const dy1 = curr.y - prev.y;
      const dx2 = next.x - curr.x;
      const dy2 = next.y - curr.y;

      // Check for direction change (potential bend)
      const angle = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1));
      if (angle > Math.PI / 4) {
        bends90++;
      }
    }

    // Count drops near this tray type
    const drops = dropAnnotations.filter(d => {
      // Check if drop annotation is near any of this tray's annotations
      return annotations.some(a =>
        Math.abs(d.x - a.x) < 100 && Math.abs(d.y - a.y) < 100
      );
    }).length;

    trayRuns.push({
      id: `tray-${++runId}`,
      sizeMillimetres: size,
      trayType: type,
      lengthMetres: totalLengthMetres,
      heightMetres: height,
      wholesalerLengths,
      tPieces,
      crossPieces,
      bends90,
      drops,
      segments,
    });
  }

  // Step 8: Build fitting summary (aggregated by size, cross-pieces use larger size)
  const fittingSummary: Record<string, FittingSummaryBySize> = {};
  for (const run of trayRuns) {
    const sizeKey = `${run.sizeMillimetres}mm`;
    if (!fittingSummary[sizeKey]) {
      fittingSummary[sizeKey] = { tPieces: 0, crossPieces: 0, bends90: 0, drops: 0, couplers: 0 };
    }
    fittingSummary[sizeKey].tPieces += run.tPieces;
    fittingSummary[sizeKey].crossPieces += run.crossPieces;
    fittingSummary[sizeKey].bends90 += run.bends90;
    fittingSummary[sizeKey].drops += run.drops;
    fittingSummary[sizeKey].couplers += Math.max(0, run.wholesalerLengths - 1);
  }

  // Step 9: Build questions for user
  const questions: ContainmentTakeoffResult["questions"] = [];

  // Ask which tray types to include
  const trayTypesFound = [...new Set(trayAnnotations.map(a => a.type))];
  if (trayTypesFound.length > 1) {
    questions.push({
      id: "tray-filter",
      question: `We found ${trayTypesFound.join(", ")} tray types. Which should be included in the takeoff?`,
      context: `This drawing contains ${trayTypesFound.map(t => `${t} (${trayAnnotations.filter(a => a.type === t).length} annotations)`).join(", ")}. For lighting-only quotes, typically only LV tray is needed.`,
      options: [
        { label: "LV only", value: "LV" },
        { label: "All types", value: "all" },
        ...trayTypesFound.map(t => ({ label: `${t} only`, value: t })),
      ],
      defaultValue: "LV",
    });
  }

  // Ask about tray duty
  questions.push({
    id: "tray-duty",
    question: "What duty rating is the cable tray?",
    context: "This affects the Spon's labour rate for installation. Medium duty is most common for commercial installations.",
    options: [
      { label: "Light duty", value: "light" },
      { label: "Medium duty", value: "medium" },
      { label: "Heavy duty", value: "heavy" },
    ],
    defaultValue: "medium",
  });

  // Collect drawing notes
  const drawingNotes: string[] = [];
  if (detectedScale) drawingNotes.push(`Scale detected: ${detectedScale}`);
  if (paperSize) drawingNotes.push(`Paper size: ${paperSize}`);
  drawingNotes.push(`Found ${trayAnnotations.length} tray annotations across ${trayRuns.length} tray runs`);
  drawingNotes.push(`Found ${dropAnnotations.length} column drop annotations`);
  for (const run of trayRuns) {
    drawingNotes.push(`${run.sizeMillimetres}mm ${run.trayType}: ${run.lengthMetres}m (${run.wholesalerLengths} × 3m lengths)`);
  }

  console.log(`[Containment Takeoff] Complete: ${trayRuns.length} runs, ${Object.keys(fittingSummary).length} sizes`);

  return {
    drawingRef,
    pageWidth,
    pageHeight,
    detectedScale,
    paperSize,
    trayRuns,
    fittingSummary,
    questions,
    drawingNotes,
    hasTextLayer: true,
    totalTextElements: words.length,
  };
}

// ---- Cable Calculation ----

/**
 * Calculate cable requirements from tray runs + user inputs
 */
export function calculateCableSummary(
  trayRuns: TrayRun[],
  userInputs: UserInputs,
): CableSummary {
  // Filter runs by tray type if specified
  const filteredRuns = userInputs.trayFilter === "all"
    ? trayRuns
    : trayRuns.filter(r => r.trayType === userInputs.trayFilter);

  const trayRouteLengthMetres = filteredRuns.reduce((sum, r) => sum + r.lengthMetres, 0);

  // Total fittings (for drop calculation)
  const totalDrops = filteredRuns.reduce((sum, r) => sum + r.drops, 0);
  const dropAllowanceMetres = totalDrops * userInputs.extraDropPerFitting;

  // First point: one cable run per circuit from DB to tray
  const firstPointMetres = userInputs.numberOfCircuits * userInputs.firstPointRunLength;

  // Subtotal before additional allowance
  const subtotal = trayRouteLengthMetres + dropAllowanceMetres + firstPointMetres;
  const additionalAllowanceMetres = subtotal * (userInputs.additionalCablePercent / 100);

  const totalCableMetres = Math.round((subtotal + additionalAllowanceMetres) * 10) / 10;
  const cableDrums = Math.ceil(totalCableMetres / 100); // 100m drums

  return {
    trayRouteLengthMetres: Math.round(trayRouteLengthMetres * 10) / 10,
    dropAllowanceMetres: Math.round(dropAllowanceMetres * 10) / 10,
    firstPointMetres: Math.round(firstPointMetres * 10) / 10,
    additionalAllowanceMetres: Math.round(additionalAllowanceMetres * 10) / 10,
    totalCableMetres,
    cableDrums,
  };
}

// ---- SVG Overlay Generation ----

/**
 * Generate SVG overlay for the containment drawing
 * Shows tray runs colour-coded by size with length annotations
 */
export function generateContainmentSvgOverlay(
  trayRuns: TrayRun[],
  pageWidth: number,
  pageHeight: number,
): string {
  const parts: string[] = [];

  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" style="position:absolute;top:0;left:0;width:100%;height:100%;pointer-events:none;">`);

  // Draw tray segments
  for (const run of trayRuns) {
    const colour = TRAY_SIZE_COLOURS[run.sizeMillimetres] || { stroke: "#888", fill: "#88888820" };

    for (const seg of run.segments) {
      // Line for the tray run
      parts.push(`<line x1="${seg.x1}" y1="${seg.y1}" x2="${seg.x2}" y2="${seg.y2}" stroke="${colour.stroke}" stroke-width="4" stroke-opacity="0.7" stroke-linecap="round" />`);

      // Length label at midpoint
      const midX = (seg.x1 + seg.x2) / 2;
      const midY = (seg.y1 + seg.y2) / 2;
      parts.push(`<rect x="${midX - 20}" y="${midY - 8}" width="40" height="16" rx="3" fill="white" fill-opacity="0.9" stroke="${colour.stroke}" stroke-width="0.5" />`);
      parts.push(`<text x="${midX}" y="${midY + 4}" text-anchor="middle" font-size="9" font-weight="bold" fill="${colour.stroke}">${seg.lengthMetres}m</text>`);
    }
  }

  // Legend
  const legendX = 20;
  let legendY = 20;
  parts.push(`<rect x="${legendX}" y="${legendY}" width="160" height="${trayRuns.length * 22 + 30}" rx="6" fill="white" fill-opacity="0.95" stroke="#ccc" stroke-width="1" />`);
  parts.push(`<text x="${legendX + 10}" y="${legendY + 18}" font-size="11" font-weight="bold" fill="#1a2b4a">Containment Takeoff</text>`);
  legendY += 28;

  const sizesSeen = new Set<number>();
  for (const run of trayRuns) {
    if (sizesSeen.has(run.sizeMillimetres)) continue;
    sizesSeen.add(run.sizeMillimetres);
    const colour = TRAY_SIZE_COLOURS[run.sizeMillimetres] || { stroke: "#888", label: `${run.sizeMillimetres}mm` };
    parts.push(`<rect x="${legendX + 10}" y="${legendY}" width="12" height="12" rx="2" fill="${colour.stroke}" />`);
    parts.push(`<text x="${legendX + 28}" y="${legendY + 10}" font-size="10" fill="#1a2b4a">${colour.label} ${run.trayType} — ${run.lengthMetres}m (${run.wholesalerLengths} lengths)</text>`);
    legendY += 22;
  }

  parts.push("</svg>");

  return parts.join("\n");
}

// ---- Drawing Type Detection ----

/**
 * Detect whether a PDF is a containment drawing vs a lighting drawing
 * Returns true if the drawing appears to be a containment/cable tray layout
 */
export function isContainmentDrawing(textContent: string): boolean {
  const upper = textContent.toUpperCase();

  // Strong indicators of containment drawing
  const containmentKeywords = [
    "CONTAINMENT", "CABLE TRAY", "LV TRAY", "FA TRAY", "ELV TRAY",
    "CABLE LADDER", "CABLE BASKET", "TRUNKING",
  ];

  // Count matches
  let score = 0;
  for (const kw of containmentKeywords) {
    const matches = (upper.match(new RegExp(kw, "g")) || []).length;
    score += matches;
  }

  // Title-based detection
  if (upper.includes("CONTAINMENT") && upper.includes("LAYOUT")) score += 5;
  if (upper.includes("CABLE TRAY") && upper.includes("LAYOUT")) score += 5;

  // If we find tray annotations, it's very likely containment
  const trayAnnotations = (upper.match(/\d+\s+(LV|FA|ELV|SUB)\s+(?:CABLE\s+)?TRAY/g) || []).length;
  score += trayAnnotations * 2;

  console.log(`[Containment Detection] Score: ${score} for ${textContent.substring(0, 100)}...`);

  return score >= 3;
}

/**
 * Format containment takeoff data for inclusion in quote generation context
 */
export function formatContainmentForQuoteContext(
  trayRuns: TrayRun[],
  fittingSummary: Record<string, FittingSummaryBySize>,
  cableSummary: CableSummary | null,
  userInputs: UserInputs | null,
): string {
  const lines: string[] = [];
  lines.push("## Containment Takeoff");

  // Tray runs
  lines.push("\n### Cable Tray Runs");
  for (const run of trayRuns) {
    lines.push(`- ${run.sizeMillimetres}mm ${run.trayType} tray: ${run.lengthMetres}m (${run.wholesalerLengths} × 3m lengths) at ${run.heightMetres}m height`);
  }

  // Fittings
  lines.push("\n### Tray Fittings");
  for (const [size, fittings] of Object.entries(fittingSummary)) {
    const parts: string[] = [];
    if (fittings.tPieces > 0) parts.push(`${fittings.tPieces} T-pieces`);
    if (fittings.crossPieces > 0) parts.push(`${fittings.crossPieces} cross-pieces`);
    if (fittings.bends90 > 0) parts.push(`${fittings.bends90} × 90° bends`);
    if (fittings.drops > 0) parts.push(`${fittings.drops} drops`);
    if (fittings.couplers > 0) parts.push(`${fittings.couplers} couplers`);
    if (parts.length > 0) {
      lines.push(`- ${size}: ${parts.join(", ")}`);
    }
  }

  // Cable summary
  if (cableSummary) {
    lines.push("\n### Cable Estimate");
    lines.push(`- Tray route cable: ${cableSummary.trayRouteLengthMetres}m`);
    lines.push(`- Drop allowance: ${cableSummary.dropAllowanceMetres}m`);
    lines.push(`- First point runs: ${cableSummary.firstPointMetres}m`);
    lines.push(`- Additional allowance: ${cableSummary.additionalAllowanceMetres}m`);
    lines.push(`- **Total cable: ${cableSummary.totalCableMetres}m** (${cableSummary.cableDrums} × 100m drums)`);
  }

  if (userInputs) {
    lines.push(`\n### Installation Notes`);
    lines.push(`- Tray duty: ${userInputs.trayDuty}`);
    lines.push(`- Circuits: ${userInputs.numberOfCircuits}`);
  }

  return lines.join("\n");
}
