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
 * - Combined annotations: "NEW 100 ELV, 100 LV AND 50 FA TRAY @12500" → 3 entries
 * - Scale indicators: "1:100 @ A0"
 * - Drop annotations: "DROPS TO LOWER LEVEL", "DROP TO CABINET", etc.
 * 
 * Filters:
 * - Only includes annotations containing "NEW" (or no EX/EXISTING prefix)
 * - Flags "EX" / "EXISTING" annotations as ambiguity questions
 * - Adds 2m cable per drop annotation (user-configurable)
 */

// ---- Constants ----

export const TRAY_SIZES = [50, 75, 100, 150, 225, 300, 450, 600] as const;
export type TraySize = typeof TRAY_SIZES[number];

export const TRAY_TYPES = ["LV", "FA", "ELV", "SUB"] as const;
export type TrayType = typeof TRAY_TYPES[number];

export const TRAY_DUTY_TYPES = ["light", "medium", "heavy"] as const;
export type TrayDuty = typeof TRAY_DUTY_TYPES[number];

export const WHOLESALER_LENGTH_METRES = 3;
export const DEFAULT_DROP_METRES = 2; // Default cable drop per drop annotation

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
  colour?: string; // Hex colour extracted from PDF line nearest to this tray annotation
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

/** Parsed result from a single tray entry within an annotation */
interface ParsedTrayEntry {
  size: number;
  type: string;
  height: number | null;
  isNew: boolean;       // true = NEW or no prefix, false = EX/EXISTING
  isExisting: boolean;  // true = explicitly marked EX/EXISTING
  rawText: string;      // original annotation text for questions
}

/**
 * Parse tray annotation text — handles COMBINED annotations.
 * 
 * Single:    "NEW 100 LV TRAY @12500" → [{size:100, type:LV, height:12.5}]
 * Combined:  "NEW 100 ELV, 100 LV AND 50 FA TRAY @12500" → 3 entries
 * Existing:  "EX 150 LV TRAY @6000" → [{..., isExisting:true}]
 * Ladder:    "SUB LADDER = 300MM @2.6M" → [{size:300, type:SUB, height:2.6}]
 * Purlin:    "LV TRAY = 150MM RAN IN PURLINS @6M EX" → [{..., isExisting:true}]
 * 
 * Returns array of parsed entries (empty if no match).
 */
function parseTrayAnnotations(text: string): ParsedTrayEntry[] {
  const upper = text.toUpperCase().trim();
  const results: ParsedTrayEntry[] = [];

  // Detect if annotation is explicitly marked as existing
  const hasExPrefix = /\bEX\b/.test(upper) || /\bEXISTING\b/.test(upper);
  const hasNewPrefix = /\bNEW\b/.test(upper);

  // Determine new/existing status:
  // - "NEW ..." → isNew=true
  // - "EX ..." or "EXISTING ..." → isExisting=true
  // - No prefix → assume new (isNew=true) but don't flag as explicitly new
  const isExisting = hasExPrefix && !hasNewPrefix;
  const isNew = !isExisting;

  // Extract height from @12500 or @2.6M or @6M patterns
  let height: number | null = null;
  const heightMatchMm = upper.match(/@(\d{3,6})\b/); // @12500 = mm
  const heightMatchM = upper.match(/@(\d+(?:\.\d+)?)\s*M\b/); // @2.6M = metres
  if (heightMatchMm) {
    height = parseInt(heightMatchMm[1], 10) / 1000;
  } else if (heightMatchM) {
    height = parseFloat(heightMatchM[1]);
  }

  // --- Pattern 1: Combined annotations ---
  // "NEW 100 ELV, 100 LV AND 50 FA TRAY @12500"
  // "100 ELV, 100 LV AND 50 FA TRAY"
  // Split on commas and "AND" to find individual entries
  const combinedPattern = /(\d+)\s+(LV|FA|ELV|SUB)/gi;
  const matches = [...upper.matchAll(combinedPattern)];

  if (matches.length > 0 && (upper.includes("TRAY") || upper.includes("LADDER") || upper.includes("BASKET"))) {
    for (const m of matches) {
      const size = parseInt(m[1], 10);
      if (!TRAY_SIZES.includes(size as TraySize)) continue;
      const type = m[2].toUpperCase();

      results.push({
        size,
        type,
        height,
        isNew,
        isExisting,
        rawText: text,
      });
    }
  }

  // --- Pattern 2: "LV TRAY = 150MM" or "SUB LADDER = 300MM" ---
  if (results.length === 0) {
    const equalsPattern = upper.match(/(LV|FA|ELV|SUB)\s+(?:CABLE\s+)?(?:TRAY|LADDER|BASKET)\s*=\s*(\d+)\s*MM/i);
    if (equalsPattern) {
      const type = equalsPattern[1].toUpperCase();
      const size = parseInt(equalsPattern[2], 10);
      if (TRAY_SIZES.includes(size as TraySize)) {
        results.push({ size, type, height, isNew, isExisting, rawText: text });
      }
    }
  }

  // --- Pattern 3: Standalone "SUB LADDER = 300MM @2.6M" ---
  if (results.length === 0) {
    const ladderPattern = upper.match(/(?:SUB\s+)?LADDER\s*=\s*(\d+)\s*MM/i);
    if (ladderPattern) {
      const size = parseInt(ladderPattern[1], 10);
      if (TRAY_SIZES.includes(size as TraySize)) {
        results.push({ size, type: "SUB", height, isNew, isExisting, rawText: text });
      }
    }
  }

  return results;
}

/**
 * Legacy single-result wrapper (kept for backward compat if needed)
 */
function parseTrayAnnotation(text: string): { size: number; type: string; height: number | null } | null {
  const entries = parseTrayAnnotations(text);
  if (entries.length === 0) return null;
  const first = entries.find(e => e.isNew) || entries[0];
  return { size: first.size, type: first.type, height: first.height };
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

/** A detected drop annotation with type classification */
interface DropAnnotation {
  x: number;
  y: number;
  text: string;
  dropType: "column" | "cabinet" | "cctv" | "access_control" | "general";
  defaultMetres: number;
}

/**
 * Detect drop annotations — improved parser
 * Catches many more patterns:
 * - "DROPS FROM HIGH LEVEL TO LOW LEVEL"
 * - "DROP TO CABINET"
 * - "CCTV DROP"
 * - "ACCESS CONTROL DROP"
 * - "DROPS TO LOWER LEVEL"
 * - Single-word "DROP" or "DROPS" near tray context
 */
function detectDropAnnotations(words: ExtractedWord[]): DropAnnotation[] {
  const drops: DropAnnotation[] = [];
  const seenPositions = new Set<string>(); // Prevent duplicates

  // Build phrases from consecutive words (same as tray parsing)
  const sortedWords = [...words].sort((a, b) => a.y - b.y || a.x - b.x);
  const phrases: Array<{ text: string; x: number; y: number }> = [];

  let currentPhrase = { text: "", x: 0, y: 0, endX: 0 };
  for (const word of sortedWords) {
    if (
      currentPhrase.text &&
      Math.abs(word.y - currentPhrase.y) < 5 &&
      word.x - currentPhrase.endX < 30
    ) {
      currentPhrase.text += " " + word.text;
      currentPhrase.endX = word.x + (word.width || 10);
    } else {
      if (currentPhrase.text) phrases.push({ text: currentPhrase.text, x: currentPhrase.x, y: currentPhrase.y });
      currentPhrase = { text: word.text, x: word.x, y: word.y, endX: word.x + (word.width || 10) };
    }
  }
  if (currentPhrase.text) phrases.push({ text: currentPhrase.text, x: currentPhrase.x, y: currentPhrase.y });

  for (const phrase of phrases) {
    const upper = phrase.text.toUpperCase();

    // Must contain "DROP" or "DROPS"
    if (!upper.includes("DROP")) continue;

    // Classify the drop type
    const posKey = `${Math.round(phrase.x)},${Math.round(phrase.y)}`;
    if (seenPositions.has(posKey)) continue;
    seenPositions.add(posKey);

    let dropType: DropAnnotation["dropType"] = "general";
    if (upper.includes("COLUMN")) dropType = "column";
    else if (upper.includes("CABINET") || upper.includes("DB") || upper.includes("BOARD")) dropType = "cabinet";
    else if (upper.includes("CCTV") || upper.includes("CAMERA")) dropType = "cctv";
    else if (upper.includes("ACCESS") || upper.includes("INTERCOM") || upper.includes("READER")) dropType = "access_control";
    else if (upper.includes("LEVEL") || upper.includes("HIGH") || upper.includes("LOW")) dropType = "column";

    drops.push({
      x: phrase.x,
      y: phrase.y,
      text: phrase.text.trim(),
      dropType,
      defaultMetres: DEFAULT_DROP_METRES,
    });
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

// ---- PDF Vector Colour Extraction ----

interface ColouredLine {
  x: number;  // midpoint x
  y: number;  // midpoint y
  colour: string; // hex colour e.g. "#3b82f6"
}

/**
 * Extract coloured lines from PDF vector data using pdfjs-dist operator list.
 * Returns an array of coloured line midpoints with their stroke colour.
 * Ignores black/near-black lines (likely building structure) and very light lines.
 */
async function extractLineColoursFromPdf(pdfBuffer: Buffer, pageHeight: number): Promise<ColouredLine[]> {
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      pdfjsLib = await import('pdfjs-dist');
    } catch {
      console.log('[Containment Colours] pdfjs-dist not available, skipping colour extraction');
      return [];
    }
  }

  try {
    const data = new Uint8Array(pdfBuffer);
    const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
    if (!getDocument) return [];

    const doc = await getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const ops = await page.getOperatorList();
    const OPS = pdfjsLib.OPS || pdfjsLib.default?.OPS;
    if (!OPS) {
      console.log('[Containment Colours] OPS constants not available');
      return [];
    }

    const colouredLines: ColouredLine[] = [];
    let currentStrokeR = 0, currentStrokeG = 0, currentStrokeB = 0;
    let pathPoints: Array<{ x: number; y: number }> = [];

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];

      // setStrokeRGBColor
      if (fn === OPS.setStrokeRGBColor) {
        currentStrokeR = args[0];
        currentStrokeG = args[1];
        currentStrokeB = args[2];
      }

      // setStrokeColorN (for CMYK/deviceN - approximate)
      if (fn === OPS.setStrokeColorN && args.length >= 3) {
        currentStrokeR = args[0];
        currentStrokeG = args[1];
        currentStrokeB = args[2];
      }

      // moveTo
      if (fn === OPS.moveTo) {
        pathPoints = [{ x: args[0], y: args[1] }];
      }

      // lineTo
      if (fn === OPS.lineTo) {
        pathPoints.push({ x: args[0], y: args[1] });
      }

      // constructPath (batched path commands)
      if (fn === OPS.constructPath) {
        const subOps = args[0]; // array of sub-operations
        const subArgs = args[1]; // array of coordinates
        let argIdx = 0;
        for (const subOp of subOps) {
          if (subOp === OPS.moveTo) {
            pathPoints = [{ x: subArgs[argIdx], y: subArgs[argIdx + 1] }];
            argIdx += 2;
          } else if (subOp === OPS.lineTo) {
            pathPoints.push({ x: subArgs[argIdx], y: subArgs[argIdx + 1] });
            argIdx += 2;
          } else if (subOp === OPS.curveTo || subOp === OPS.curveTo2 || subOp === OPS.curveTo3) {
            // Bezier curves - take endpoint
            const numArgs = subOp === OPS.curveTo ? 6 : 4;
            if (argIdx + numArgs <= subArgs.length) {
              pathPoints.push({ x: subArgs[argIdx + numArgs - 2], y: subArgs[argIdx + numArgs - 1] });
            }
            argIdx += numArgs;
          } else if (subOp === OPS.rectangle) {
            argIdx += 4; // skip rectangles
          } else if (subOp === OPS.closePath) {
            // no args
          } else {
            // Unknown sub-op, try to skip safely
            argIdx += 2;
          }
        }
      }

      // stroke — record the line with its colour
      if (fn === OPS.stroke || fn === OPS.closeStroke || fn === OPS.strokePath) {
        const r = Math.round(currentStrokeR * 255);
        const g = Math.round(currentStrokeG * 255);
        const b = Math.round(currentStrokeB * 255);

        // Skip black/near-black (building lines) and white/near-white
        const brightness = (r + g + b) / 3;
        if (brightness > 20 && brightness < 240 && pathPoints.length >= 2) {
          // Only record if the colour is distinct (not grey)
          const maxChannel = Math.max(r, g, b);
          const minChannel = Math.min(r, g, b);
          const saturation = maxChannel > 0 ? (maxChannel - minChannel) / maxChannel : 0;

          if (saturation > 0.15) { // Must have some colour saturation
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;

            // Calculate midpoint of path (average of all points)
            const midX = pathPoints.reduce((s, p) => s + p.x, 0) / pathPoints.length;
            const midY = pathPoints.reduce((s, p) => s + p.y, 0) / pathPoints.length;

            // Convert Y from PDF bottom-up to top-down
            colouredLines.push({
              x: midX,
              y: pageHeight - midY,
              colour: hex,
            });
          }
        }
        pathPoints = [];
      }
    }

    console.log(`[Containment Colours] Extracted ${colouredLines.length} coloured line segments`);

    return colouredLines;
  } catch (err: any) {
    console.log(`[Containment Colours] Extraction failed (non-fatal): ${err.message}`);
    return [];
  }
}

/**
 * Find the dominant colour near a given (x, y) position from extracted coloured lines.
 * Uses a search radius and picks the most common colour.
 */
function findNearbyColour(
  x: number,
  y: number,
  colouredLines: ColouredLine[],
  searchRadius: number = 80,
): string | null {
  const nearby = colouredLines.filter(line => {
    const dx = line.x - x;
    const dy = line.y - y;
    return Math.sqrt(dx * dx + dy * dy) < searchRadius;
  });

  if (nearby.length === 0) return null;

  // Count occurrences of each colour
  const colourCounts: Record<string, number> = {};
  for (const line of nearby) {
    colourCounts[line.colour] = (colourCounts[line.colour] || 0) + 1;
  }

  // Return the most common colour
  let bestColour = '';
  let bestCount = 0;
  for (const [colour, count] of Object.entries(colourCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestColour = colour;
    }
  }

  return bestColour || null;
}

/**
 * For a group of tray annotations of the same size+type, find the consensus colour
 * by checking all annotation positions and picking the most common nearby colour.
 */
function findGroupColour(
  annotations: Array<{ x: number; y: number; endX: number }>,
  colouredLines: ColouredLine[],
): string | null {
  const colourCounts: Record<string, number> = {};

  for (const ann of annotations) {
    // Check a few points along the annotation (start, mid, end)
    const points = [
      { x: ann.x, y: ann.y },
      { x: (ann.x + ann.endX) / 2, y: ann.y },
      { x: ann.endX, y: ann.y },
    ];

    for (const pt of points) {
      const colour = findNearbyColour(pt.x, pt.y, colouredLines);
      if (colour) {
        colourCounts[colour] = (colourCounts[colour] || 0) + 1;
      }
    }
  }

  if (Object.keys(colourCounts).length === 0) return null;

  let bestColour = '';
  let bestCount = 0;
  for (const [colour, count] of Object.entries(colourCounts)) {
    if (count > bestCount) {
      bestCount = count;
      bestColour = colour;
    }
  }

  return bestColour || null;
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

  // Step 1b: Extract coloured lines from PDF vector data (for chip colours)
  let colouredLines: ColouredLine[] = [];
  try {
    colouredLines = await extractLineColoursFromPdf(pdfBuffer, pageHeight);
  } catch (err: any) {
    console.log(`[Containment Takeoff] Colour extraction failed (non-fatal): ${err.message}`);
  }
  const hasColouredLines = colouredLines.length > 0;

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

  // Step 4: Parse tray annotations from phrases — handles combined + NEW/EX filtering
  interface TrayAnnotation {
    size: number;
    type: string;
    height: number | null;
    isNew: boolean;
    isExisting: boolean;
    rawText: string;
    x: number;
    y: number;
    endX: number;
  }

  const allTrayAnnotations: TrayAnnotation[] = [];
  const existingAnnotations: TrayAnnotation[] = []; // Tracked for ambiguity questions
  const combinedAnnotationPhrases: string[] = [];   // Tracked for ambiguity questions

  for (const phrase of phrases) {
    const entries = parseTrayAnnotations(phrase.text);
    if (entries.length === 0) continue;

    // Track combined annotations (more than 1 entry from single phrase)
    if (entries.length > 1) {
      combinedAnnotationPhrases.push(phrase.text.trim());
    }

    for (const entry of entries) {
      const annotation: TrayAnnotation = {
        size: entry.size,
        type: entry.type,
        height: entry.height,
        isNew: entry.isNew,
        isExisting: entry.isExisting,
        rawText: entry.rawText,
        x: phrase.x,
        y: phrase.y,
        endX: phrase.endX,
      };

      if (entry.isExisting) {
        existingAnnotations.push(annotation);
      } else {
        allTrayAnnotations.push(annotation);
      }
    }
  }

  // Only use NEW annotations for the takeoff
  const trayAnnotations = allTrayAnnotations;

  console.log(`[Containment Takeoff] Found ${trayAnnotations.length} NEW tray annotations, ${existingAnnotations.length} EXISTING (excluded)`);
  if (combinedAnnotationPhrases.length > 0) {
    console.log(`[Containment Takeoff] ${combinedAnnotationPhrases.length} combined annotations expanded into multiple entries`);
  }

  // Step 5: Detect drops (improved)
  const dropAnnotations = detectDropAnnotations(words);
  console.log(`[Containment Takeoff] Found ${dropAnnotations.length} drop annotations`);
  for (const d of dropAnnotations) {
    console.log(`  Drop: "${d.text}" type=${d.dropType} at (${Math.round(d.x)}, ${Math.round(d.y)})`);
  }

  // Step 6: Group annotations by tray size + type and estimate run lengths
  const trayGroups: Map<string, TrayAnnotation[]> = new Map();
  for (const ann of trayAnnotations) {
    const key = `${ann.size}-${ann.type}`;
    if (!trayGroups.has(key)) trayGroups.set(key, []);
    trayGroups.get(key)!.push(ann);
  }

  // Step 7: Estimate lengths from annotation spacing
  const trayRuns: TrayRun[] = [];
  let runId = 0;

  for (const [key, annotations] of trayGroups) {
    const [sizeStr, type] = key.split("-");
    const size = parseInt(sizeStr, 10);
    const height = annotations.find(a => a.height !== null)?.height || 0;

    // Sort by position (left to right, top to bottom)
    annotations.sort((a, b) => a.y - b.y || a.x - b.x);

    // Estimate total length from the bounding area of annotations
    // This is an approximation — vector extraction (Option B) will refine this
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

    // Count fittings: estimate from direction changes in annotations
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

      const angle = Math.abs(Math.atan2(dy2, dx2) - Math.atan2(dy1, dx1));
      if (angle > Math.PI / 4) {
        bends90++;
      }
    }

    // Count drops near this tray type
    const drops = dropAnnotations.filter(d => {
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
      // Assign colour: use detected PDF line colour if available, otherwise use TRAY_SIZE_COLOURS fallback
      colour: hasColouredLines
        ? (findGroupColour(annotations, colouredLines) || TRAY_SIZE_COLOURS[size]?.stroke || '#888888')
        : (TRAY_SIZE_COLOURS[size]?.stroke || '#888888'),
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

  // Q: Existing tray annotations found — ask if they should be excluded
  if (existingAnnotations.length > 0) {
    const exSummary = existingAnnotations
      .map(a => `${a.size}mm ${a.type}`)
      .filter((v, i, arr) => arr.indexOf(v) === i) // unique
      .join(", ");
    questions.push({
      id: "existing-tray",
      question: `Found ${existingAnnotations.length} EXISTING tray annotation(s): ${exSummary}. These have been excluded from the takeoff. Is that correct?`,
      context: `Annotations marked "EX" or "EXISTING" are assumed to be pre-installed tray that doesn't need quoting. The excluded annotations are:\n${existingAnnotations.map(a => `"${a.rawText.substring(0, 80)}"`).join("\n")}`,
      options: [
        { label: "Yes, exclude existing", value: "exclude" },
        { label: "No, include them (they are new)", value: "include" },
      ],
      defaultValue: "exclude",
    });
  }

  // Q: Combined annotations detected — confirm expansion
  if (combinedAnnotationPhrases.length > 0) {
    questions.push({
      id: "combined-annotations",
      question: `Found ${combinedAnnotationPhrases.length} combined annotation(s) — expanded into multiple tray entries. Confirm this is correct?`,
      context: `Combined annotations create multiple tray entries from a single label:\n${combinedAnnotationPhrases.map(p => `"${p.substring(0, 100)}"`).join("\n")}`,
      options: [
        { label: "Yes, all entries are correct", value: "confirm" },
        { label: "No, needs manual review", value: "review" },
      ],
      defaultValue: "confirm",
    });
  }

  // Q: Drop allowances
  if (dropAnnotations.length > 0) {
    const totalDropMetres = dropAnnotations.length * DEFAULT_DROP_METRES;
    const dropTypeBreakdown = dropAnnotations.reduce((acc, d) => {
      acc[d.dropType] = (acc[d.dropType] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
    const breakdownStr = Object.entries(dropTypeBreakdown)
      .map(([type, count]) => `${count} x ${type}`)
      .join(", ");

    questions.push({
      id: "drop-allowance",
      question: `Found ${dropAnnotations.length} drop annotation(s) (${breakdownStr}). Allow ${DEFAULT_DROP_METRES}m cable per drop (${totalDropMetres}m total)?`,
      context: `Each drop annotation adds cable for the vertical run from tray to the equipment below. The default is ${DEFAULT_DROP_METRES}m per drop. Drop locations:\n${dropAnnotations.map(d => `"${d.text.substring(0, 60)}" (${d.dropType})`).join("\n")}`,
      options: [
        { label: `Yes, ${DEFAULT_DROP_METRES}m per drop`, value: String(DEFAULT_DROP_METRES) },
        { label: "3m per drop", value: "3" },
        { label: "1.5m per drop", value: "1.5" },
        { label: "No drop allowance", value: "0" },
      ],
      defaultValue: String(DEFAULT_DROP_METRES),
    });
  }

  // Q: Which tray types to include
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

  // Q: Tray duty
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
  drawingNotes.push(`Found ${trayAnnotations.length} NEW tray annotations across ${trayRuns.length} tray runs`);
  if (existingAnnotations.length > 0) {
    drawingNotes.push(`Excluded ${existingAnnotations.length} EXISTING tray annotations`);
  }
  if (combinedAnnotationPhrases.length > 0) {
    drawingNotes.push(`Expanded ${combinedAnnotationPhrases.length} combined annotations into separate entries`);
  }
  drawingNotes.push(`Found ${dropAnnotations.length} drop annotations (${dropAnnotations.length * DEFAULT_DROP_METRES}m cable allowance)`);
  for (const run of trayRuns) {
    drawingNotes.push(`${run.sizeMillimetres}mm ${run.trayType}: ${run.lengthMetres}m (${run.wholesalerLengths} x 3m lengths) @ ${run.heightMetres}m`);
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
 * Now includes drop cable allowance from detected drop annotations
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

  // Total drops — each drop adds cable for the vertical run
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
    lines.push(`- ${run.sizeMillimetres}mm ${run.trayType} tray: ${run.lengthMetres}m (${run.wholesalerLengths} x 3m lengths) at ${run.heightMetres}m height`);
  }

  // Fittings
  lines.push("\n### Tray Fittings");
  for (const [size, fittings] of Object.entries(fittingSummary)) {
    const parts: string[] = [];
    if (fittings.tPieces > 0) parts.push(`${fittings.tPieces} T-pieces`);
    if (fittings.crossPieces > 0) parts.push(`${fittings.crossPieces} cross-pieces`);
    if (fittings.bends90 > 0) parts.push(`${fittings.bends90} x 90 degree bends`);
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
    lines.push(`- **Total cable: ${cableSummary.totalCableMetres}m** (${cableSummary.cableDrums} x 100m drums)`);
  }

  if (userInputs) {
    lines.push(`\n### Installation Notes`);
    lines.push(`- Tray duty: ${userInputs.trayDuty}`);
    lines.push(`- Circuits: ${userInputs.numberOfCircuits}`);
  }

  return lines.join("\n");
}
