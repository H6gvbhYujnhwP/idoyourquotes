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

// Standard CAD colour conventions by tray system type
// These match common electrical drawing colour standards
// and provide reliable chip colours when PDF vector extraction can't read layer colours
export const TRAY_TYPE_COLOURS: Record<string, string> = {
  'LV':       '#4146fd',  // Blue — Low Voltage
  'ELV':      '#f8d731',  // Yellow — Extra Low Voltage
  'FA':       '#cc1f26',  // Red — Fire Alarm
  'SUBMAIN':  '#22c55e',  // Green — Submain
  'LTG & PWR':'#3b82f6',  // Light Blue — Lighting & Power
  'DATA':     '#8b5cf6',  // Purple — Data
  'COMMS':    '#06b6d4',  // Cyan — Communications
  'SECURITY': '#f59e0b',  // Amber — Security
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
  wholesalerLengthMetres: number; // Length of each tray stick from supplier (default 3m)
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
  // Segment data for the interactive measurement reviewer (Phase 1).
  // rawSegments: all geometry-bearing segments from Python extraction.
  // segmentAssignments: AI auto-pass assignment of each segment index → group key or "excluded".
  // Both are empty when Python extraction returned 0 segments.
  rawSegments: Array<{ x: number; y: number; colour: string; x1: number; y1: number; x2: number; y2: number; lengthPdfUnits: number }>;
  segmentAssignments: Record<number, string>;
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
export function getMetresPerPdfUnit(scale: string | null, paperSize: string | null, pageWidth: number): number {
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
  x: number;  // midpoint x (preserved for backward compat)
  y: number;  // midpoint y
  colour: string; // hex colour e.g. "#3b82f6"
  // Geometry fields — populated when extractPdfLineColours returns full segment data
  x1?: number; y1?: number; x2?: number; y2?: number;
  lengthPdfUnits?: number;
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

/**
 * Measure tray run lengths from extracted vector geometry.
 *
 * This replaces the annotation-spacing estimate when vector data is available.
 * It is colour-aware but NOT colour-deterministic — it does NOT assume a colour means
 * a particular tray type. Instead it:
 *   1. Finds which colour dominates near each tray annotation group
 *   2. Sums all segments of that colour
 *   3. When two groups share a colour (e.g. 100mm LV + 50mm LV both use same blue layer),
 *      splits segments by proximity to the nearest annotation
 *
 * @param trayAnnotationGroups  Map<"size-TYPE", Array<{x, y, endX}>>
 * @param vectorSegments        All coloured segments from extractPdfLineColours
 * @param metresPerUnit         Metres per PDF unit (from scale detection)
 * @returns Map<"size-TYPE", lengthMetres>
 */
function measureTrayRunsFromVectors(
  trayAnnotationGroups: Map<string, Array<{ x: number; y: number; endX: number }>>,
  vectorSegments: ColouredLine[],
  metresPerUnit: number,
): { lengths: Map<string, number>; assignments: Record<number, string> } {
  const lengths = new Map<string, number>();
  // assignments: key = index in vectorSegments (the rawSegments array stored in DB)
  // value = group key e.g. "100-LV" or "excluded" (no group match found)
  const assignments: Record<number, string> = {};

  // Only segments that have geometry (lengthPdfUnits present and > 0).
  // Track original indices so assignments map back to rawSegmentsJson positions.
  const geoSegments = vectorSegments
    .map((s, i) => ({ ...s, originalIndex: i }))
    .filter(s => s.lengthPdfUnits != null && s.lengthPdfUnits > 0);

  if (geoSegments.length === 0) return { lengths, assignments };

  // Step 1: For each annotation group, find its dominant colour via proximity
  const groupColours = new Map<string, string | null>();
  for (const [key, annotations] of trayAnnotationGroups) {
    groupColours.set(key, findGroupColour(annotations, geoSegments));
  }

  // Step 2: Build colour → [group keys] mapping
  const colourToGroups = new Map<string, string[]>();
  for (const [key, colour] of groupColours) {
    if (!colour) continue;
    if (!colourToGroups.has(colour)) colourToGroups.set(colour, []);
    colourToGroups.get(colour)!.push(key);
  }

  // Step 3: For each segment, assign to a group and accumulate length.
  // Also record the assignment by original index for the measurement reviewer.
  const rawLengths = new Map<string, number>();
  for (const [key] of trayAnnotationGroups) rawLengths.set(key, 0);

  for (const seg of geoSegments) {
    const wantingGroups = colourToGroups.get(seg.colour);
    if (!wantingGroups || wantingGroups.length === 0) {
      // No group matched this colour — mark excluded so reviewer can see it
      assignments[seg.originalIndex] = 'excluded';
      continue;
    }

    let assignedKey: string;

    if (wantingGroups.length === 1) {
      // Unique colour → straightforward assignment
      assignedKey = wantingGroups[0];
    } else {
      // Shared colour (e.g. two sizes of LV tray on same layer)
      // Assign to the group whose annotations are closest to this segment's midpoint
      assignedKey = wantingGroups[0];
      let bestDist = Infinity;
      for (const key of wantingGroups) {
        const annotations = trayAnnotationGroups.get(key)!;
        for (const ann of annotations) {
          const dx = seg.x - ann.x;
          const dy = seg.y - ann.y;
          const dist = Math.sqrt(dx * dx + dy * dy);
          if (dist < bestDist) { bestDist = dist; assignedKey = key; }
        }
      }
    }

    assignments[seg.originalIndex] = assignedKey;
    rawLengths.set(assignedKey, (rawLengths.get(assignedKey) || 0) + (seg.lengthPdfUnits || 0));
  }

  // Step 4: Convert to metres, only include groups that got actual segments
  for (const [key, totalPdfUnits] of rawLengths) {
    if (totalPdfUnits > 0) {
      lengths.set(key, totalPdfUnits * metresPerUnit);
    }
  }

  // Log results for debugging
  for (const [key, metres] of lengths) {
    const colour = groupColours.get(key);
    console.log(`[Vector Measure] ${key}: ${metres.toFixed(1)}m (colour: ${colour || 'none'})`);
  }

  return { lengths, assignments };
}

/**
 * Detect fittings (bends, T-pieces, cross-pieces) from real vector segment geometry.
 *
 * Called after all trayRuns are built with their segments[]. Replaces the
 * annotation-direction-change heuristic when C1 vector data is available.
 *
 * Algorithm:
 *   1. Collect every segment endpoint (start + end) with a unit direction vector
 *      pointing AWAY from the junction along the segment.
 *   2. Cluster endpoints within 0.5m real-world distance of each other.
 *   3. Per cluster:
 *      - 2 endpoints, same run, dot product > -0.5 → 90° bend
 *        (dot ≈ -1 = straight through; dot ≈ 0 = 90° turn)
 *      - 3 endpoints → T-piece, attributed to run with most endpoints
 *        (tie-break: larger tray size wins — matches Mitch's convention)
 *      - 4+ endpoints → cross-piece, attributed to largest tray run
 *
 * Mutates trayRuns in-place. Only affects runs that have real vector segments.
 * Runs using annotation-spacing fallback (no segments) are left unchanged.
 */
function detectFittingsFromGeometry(trayRuns: TrayRun[], metresPerUnit: number): void {
  interface EndpointRecord {
    x: number;
    y: number;
    runIndex: number;
    dirX: number; // unit vector pointing AWAY from junction along segment
    dirY: number;
  }

  const endpoints: EndpointRecord[] = [];

  for (let ri = 0; ri < trayRuns.length; ri++) {
    const run = trayRuns[ri];
    if (!run.segments || run.segments.length === 0) continue;

    for (const seg of run.segments) {
      const len = Math.sqrt((seg.x2 - seg.x1) ** 2 + (seg.y2 - seg.y1) ** 2);
      if (len < 0.001) continue;

      // Start endpoint: away direction = towards segment end
      endpoints.push({
        x: seg.x1, y: seg.y1, runIndex: ri,
        dirX: (seg.x2 - seg.x1) / len,
        dirY: (seg.y2 - seg.y1) / len,
      });

      // End endpoint: away direction = towards segment start
      endpoints.push({
        x: seg.x2, y: seg.y2, runIndex: ri,
        dirX: (seg.x1 - seg.x2) / len,
        dirY: (seg.y1 - seg.y2) / len,
      });
    }
  }

  if (endpoints.length === 0) return;

  // Junction proximity threshold: 0.5m in real-world distance, converted to PDF units.
  // Segment endpoints within this distance of each other represent the same physical junction.
  const junctionThreshold = metresPerUnit > 0 ? 0.5 / metresPerUnit : 15;
  const junctionThresholdSq = junctionThreshold * junctionThreshold;

  // Reset fitting counts for runs that have real vector segments.
  // Annotation-based estimates (segments.length === 0) are left unchanged.
  for (const run of trayRuns) {
    if (run.segments.length > 0) {
      run.tPieces = 0;
      run.crossPieces = 0;
      run.bends90 = 0;
    }
  }

  // Cluster endpoints by proximity — O(n²), bounded by number of segments
  const used = new Set<number>();
  const junctions: EndpointRecord[][] = [];

  for (let i = 0; i < endpoints.length; i++) {
    if (used.has(i)) continue;
    const cluster: EndpointRecord[] = [endpoints[i]];
    used.add(i);

    for (let j = i + 1; j < endpoints.length; j++) {
      if (used.has(j)) continue;
      const dx = endpoints[j].x - endpoints[i].x;
      const dy = endpoints[j].y - endpoints[i].y;
      if (dx * dx + dy * dy < junctionThresholdSq) {
        cluster.push(endpoints[j]);
        used.add(j);
      }
    }

    if (cluster.length >= 2) {
      junctions.push(cluster);
    }
  }

  console.log(`[Fitting Detection] ${endpoints.length} endpoints → ${junctions.length} junctions to classify`);

  for (const junction of junctions) {
    const n = junction.length;

    if (n === 2) {
      // Two endpoints meeting: bend (same run, turns > ~60°) or straight coupler join
      const [a, b] = junction;
      if (a.runIndex === b.runIndex) {
        // dot(away-A, away-B):
        //   ≈ -1 → straight through (back-to-back directions = no turn)
        //   ≈  0 → 90° bend
        //   ≈ +1 → U-turn (unusual)
        // Threshold -0.5: count as bend when paths diverge by more than ~60°
        const dot = a.dirX * b.dirX + a.dirY * b.dirY;
        if (dot > -0.5) {
          trayRuns[a.runIndex].bends90++;
        }
        // dot ≤ -0.5: essentially straight join — coupler, already handled separately
      }
      // Two endpoints from different runs: boundary crossing, not a fitting
    }

    if (n === 3) {
      // T-piece: three segment ends meeting at one point.
      // Attribute to the run with the most endpoints here (it's the main run).
      // Tie-break: larger tray size wins — physically it carries the fitting.
      const runCounts: Record<number, number> = {};
      for (const ep of junction) {
        runCounts[ep.runIndex] = (runCounts[ep.runIndex] || 0) + 1;
      }
      let targetRunIdx = junction[0].runIndex;
      let maxCount = 0;
      for (const [ridxStr, count] of Object.entries(runCounts)) {
        const ridx = parseInt(ridxStr, 10);
        if (
          count > maxCount ||
          (count === maxCount &&
            trayRuns[ridx].sizeMillimetres > trayRuns[targetRunIdx].sizeMillimetres)
        ) {
          maxCount = count;
          targetRunIdx = ridx;
        }
      }
      trayRuns[targetRunIdx].tPieces++;
    }

    if (n >= 4) {
      // Cross-piece: four or more segment ends at one point.
      // Assign to the largest tray run (they supply the fitting at the crossing).
      const runIndices = [...new Set(junction.map(ep => ep.runIndex))];
      const targetRunIdx = runIndices.reduce(
        (best, ri) =>
          trayRuns[ri].sizeMillimetres > trayRuns[best].sizeMillimetres ? ri : best,
        runIndices[0],
      );
      trayRuns[targetRunIdx].crossPieces++;
    }
  }

  // Log detected fittings per run
  for (const run of trayRuns) {
    if (run.segments.length > 0 && (run.tPieces + run.crossPieces + run.bends90) > 0) {
      console.log(
        `[Fitting Detection] ${run.sizeMillimetres}mm ${run.trayType}: ` +
        `${run.bends90} bends, ${run.tPieces} T-pieces, ${run.crossPieces} cross-pieces`,
      );
    }
  }
}

/**
 * Perform containment takeoff on a PDF drawing
 * This uses the same PDF extraction as electrical takeoff
 * but focuses on tray annotations and measurements
 */
export async function performContainmentTakeoff(
  pdfBuffer: Buffer,
  drawingRef: string = "Unknown",
  extractWithPdfJs: (buffer: Buffer) => Promise<{ chars: any[]; words: ExtractedWord[]; pageWidth: number; pageHeight: number }>,
  extractLineColours?: (buffer: Buffer) => Promise<Array<{ x: number; y: number; colour: string; x1?: number; y1?: number; x2?: number; y2?: number; lengthPdfUnits?: number }>>,
  wholesalerLengthMetres: number = WHOLESALER_LENGTH_METRES,
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
      rawSegments: [],
      segmentAssignments: {},
    };
  }

  // Step 1b: Extract coloured lines from PDF vector data (for chip colours)
  let colouredLines: ColouredLine[] = [];
  console.log(`[Containment Takeoff] extractLineColours parameter: ${typeof extractLineColours}`);
  if (extractLineColours) {
    try {
      const rawLines = await extractLineColours(pdfBuffer);
      // Preserve all geometry fields — x1/y1/x2/y2/lengthPdfUnits are required by
      // measureTrayRunsFromVectors. Previously this map stripped them, causing the
      // vector measurement branch to be silently skipped on every drawing.
      colouredLines = rawLines.map(l => ({
        x: l.x, y: l.y, colour: l.colour,
        x1: l.x1, y1: l.y1, x2: l.x2, y2: l.y2,
        lengthPdfUnits: l.lengthPdfUnits,
      }));
      console.log(`[Containment Takeoff] Received ${colouredLines.length} coloured line segments from PDF`);
    } catch (err: any) {
      console.log(`[Containment Takeoff] Colour extraction failed (non-fatal): ${err.message}`);
    }
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
      rawSegments: [],
      segmentAssignments: {},
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

  // Step 7: Estimate lengths — use vector geometry if available, fall back to annotation spacing
  const trayRuns: TrayRun[] = [];
  let runId = 0;
  // Tracks whether any run successfully used vector geometry.
  // When true: detectFittingsFromGeometry() is called after the loop.
  let anyRunUsedVectorMeasurement = false;

  // Attempt vector measurement when we have geometry-rich segments
  let vectorMeasurements: Map<string, number> | null = null;
  let segmentAssignments: Record<number, string> = {};
  if (hasColouredLines && colouredLines.some(l => l.lengthPdfUnits != null && l.lengthPdfUnits > 0)) {
    console.log(`[Containment Takeoff] Attempting vector length measurement from ${colouredLines.filter(l => l.lengthPdfUnits).length} geometry segments`);
    const vectorResult = measureTrayRunsFromVectors(trayGroups, colouredLines, metresPerUnit);
    vectorMeasurements = vectorResult.lengths;
    segmentAssignments = vectorResult.assignments;
    console.log(`[Containment Takeoff] Vector measurement returned lengths for ${vectorMeasurements.size} groups`);
  }

  for (const [key, annotations] of trayGroups) {
    const [sizeStr, type] = key.split("-");
    const size = parseInt(sizeStr, 10);
    const height = annotations.find(a => a.height !== null)?.height || 0;

    // Sort by position (left to right, top to bottom)
    annotations.sort((a, b) => a.y - b.y || a.x - b.x);

    let totalLengthMetres = 0;
    const segments: TraySegment[] = [];
    let usedVectorMeasurement = false;

    // --- Try vector measurement first ---
    if (vectorMeasurements) {
      const vectorLength = vectorMeasurements.get(key);
      if (vectorLength && vectorLength > 0) {
        totalLengthMetres = Math.round(vectorLength * 10) / 10;
        usedVectorMeasurement = true;
        anyRunUsedVectorMeasurement = true;
        console.log(`[Containment Takeoff] ${key}: using vector length ${totalLengthMetres}m`);

        // Use the actual Python vector segments assigned to this run.
        // segmentAssignments maps colouredLine index → group key — built by
        // measureTrayRunsFromVectors above. This gives the viewer accurate line
        // positions that match the real drawing, not guesses from label spacing.
        for (const [idxStr, groupKey] of Object.entries(segmentAssignments)) {
          if (groupKey !== key) continue;
          const idx = parseInt(idxStr, 10);
          const seg = colouredLines[idx];
          if (!seg || seg.x1 == null || seg.y1 == null || seg.x2 == null || seg.y2 == null) continue;
          segments.push({
            x1: seg.x1,
            y1: seg.y1,
            x2: seg.x2,
            y2: seg.y2,
            lengthMetres: Math.round((seg.lengthPdfUnits || 0) * metresPerUnit * 10) / 10,
          });
        }
        // If Python extraction returned no geometry for this run, fall back to
        // annotation waypoints so the overlay still shows something.
        if (segments.length === 0) {
          for (let i = 0; i < annotations.length - 1; i++) {
            const a = annotations[i];
            const b = annotations[i + 1];
            const dx = Math.abs(b.x - a.x);
            const dy = Math.abs(b.y - a.y);
            if (dx > 20 || dy > 20) {
              const distPdfUnits = Math.sqrt(dx * dx + dy * dy);
              segments.push({
                x1: a.x, y1: a.y,
                x2: b.x, y2: b.y,
                lengthMetres: Math.round(distPdfUnits * metresPerUnit * 10) / 10,
              });
            }
          }
        }
      }
    }

    // --- Fall back to annotation-spacing estimate if no vector data ---
    if (!usedVectorMeasurement) {
      for (let i = 0; i < annotations.length - 1; i++) {
        const a = annotations[i];
        const b = annotations[i + 1];

        const dx = Math.abs(b.x - a.x);
        const dy = Math.abs(b.y - a.y);
        const distPdfUnits = Math.sqrt(dx * dx + dy * dy);
        const distMetres = distPdfUnits * metresPerUnit;

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
      console.log(`[Containment Takeoff] ${key}: using annotation-spacing fallback: ${totalLengthMetres}m`);
    }
    const wholesalerLengths = Math.ceil(totalLengthMetres / wholesalerLengthMetres);

    // Count fittings.
    // When vector measurement was used: initialise to 0 — detectFittingsFromGeometry()
    // will populate these accurately from real junction analysis after the loop.
    // When using annotation-spacing fallback: estimate from direction changes in label positions.
    let tPieces = 0;
    let crossPieces = 0;
    let bends90 = 0;

    if (!usedVectorMeasurement) {
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
      // Assign colour: use detected PDF line colour if available,
      // then try type-based colour (matches common CAD conventions),
      // finally fall back to size-based colours
      colour: hasColouredLines
        ? (findGroupColour(annotations, colouredLines) || TRAY_TYPE_COLOURS[type] || TRAY_SIZE_COLOURS[size]?.stroke || '#888888')
        : (TRAY_TYPE_COLOURS[type] || TRAY_SIZE_COLOURS[size]?.stroke || '#888888'),
    });
  }

  // Step 7b: Geometry-based fitting detection.
  // When vector segments are available (C1), detect bends, T-pieces and cross-pieces
  // from real line endpoint coincidence rather than annotation position heuristics.
  // Only runs when at least one tray run used vector measurement.
  if (anyRunUsedVectorMeasurement) {
    detectFittingsFromGeometry(trayRuns, metresPerUnit);
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
      question: `Found ${trayTypesFound.join(", ")} tray types on this drawing. Which are in your scope?`,
      context: `This drawing contains: ${trayTypesFound.map(t => `${t} (${trayAnnotations.filter(a => a.type === t).length} annotations)`).join(", ")}. Select only the tray types you are responsible for. Common examples: LV only for lighting packages, LV + FA for combined lighting and fire alarm scopes. Do not assume — confirm based on your tender scope.`,
      options: [
        { label: "All types", value: "all" },
        ...trayTypesFound.map(t => ({ label: `${t} only`, value: t })),
      ],
      defaultValue: "all",
    });
  }

  // Q: Tray stick length from supplier
  // Asked always — 3m is standard but user must confirm. Stored in userInputs.wholesalerLengthMetres.
  questions.push({
    id: "wholesaler-length",
    question: `What length are your tray sticks from the supplier? (Standard is ${wholesalerLengthMetres}m)`,
    context: "Cable tray is typically sold in 3m lengths in the UK. Some larger trays (225mm+) may be available in 6m lengths. Confirm the length your supplier delivers — this is used to calculate how many sticks to order.",
    options: [
      { label: "3m (standard)", value: "3" },
      { label: "6m", value: "6" },
      { label: "1.5m", value: "1.5" },
    ],
    defaultValue: String(wholesalerLengthMetres),
  });

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
  if (vectorMeasurements && vectorMeasurements.size > 0) {
    drawingNotes.push(`Measurement method: Vector geometry (${colouredLines.filter(l => l.lengthPdfUnits).length} segments measured)`);
    const totalFittings = trayRuns.reduce((s, r) => s + r.bends90 + r.tPieces + r.crossPieces, 0);
    drawingNotes.push(`Fitting detection: Junction geometry analysis (${totalFittings} fittings detected from segment endpoints)`);
  } else {
    drawingNotes.push(`Measurement method: Annotation spacing estimate (vector data unavailable)`);
    drawingNotes.push(`Fitting detection: Annotation direction change estimate`);
  }
  drawingNotes.push(`Found ${trayAnnotations.length} NEW tray annotations across ${trayRuns.length} tray runs`);
  if (existingAnnotations.length > 0) {
    drawingNotes.push(`Excluded ${existingAnnotations.length} EXISTING tray annotations`);
  }
  if (combinedAnnotationPhrases.length > 0) {
    drawingNotes.push(`Expanded ${combinedAnnotationPhrases.length} combined annotations into separate entries`);
  }
  drawingNotes.push(`Found ${dropAnnotations.length} drop annotations (${dropAnnotations.length * DEFAULT_DROP_METRES}m cable allowance)`);
  for (const run of trayRuns) {
    drawingNotes.push(`${run.sizeMillimetres}mm ${run.trayType}: ${run.lengthMetres}m (${run.wholesalerLengths} x ${wholesalerLengthMetres}m lengths) @ ${run.heightMetres}m`);
  }

  console.log(`[Containment Takeoff] Complete: ${trayRuns.length} runs, ${Object.keys(fittingSummary).length} sizes`);

  // Build rawSegments: only geometry-bearing segments (those Python returned with x1/y1/x2/y2).
  // These are stored in DB for the interactive measurement reviewer.
  const rawSegments = colouredLines
    .filter(l => l.x1 != null && l.y1 != null && l.x2 != null && l.y2 != null && l.lengthPdfUnits != null && l.lengthPdfUnits > 0)
    .map(l => ({
      x: l.x, y: l.y, colour: l.colour,
      x1: l.x1!, y1: l.y1!, x2: l.x2!, y2: l.y2!,
      lengthPdfUnits: l.lengthPdfUnits!,
    }));

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
    rawSegments,
    segmentAssignments,
  };
}

// ---- Cable Calculation ----

/**
 * Calculate cable requirements from tray runs + user inputs
 * Now includes drop cable allowance from detected drop annotations
 */
/**
 * Recalculate tray run lengths from user-edited segment assignments.
 * Called by the updateSegmentAssignments mutation after the user corrects
 * the interactive measurement reviewer. Pure arithmetic — no AI call.
 *
 * @param rawSegments       All raw segments stored in rawSegmentsJson
 * @param assignments       User-edited Record<segmentIndex, groupKey | "excluded">
 * @param metresPerUnit     From getMetresPerPdfUnit — stored on the takeoff record
 * @param wholesalerLen     Stick length in metres (default 3m)
 * @returns Map<groupKey, lengthMetres>
 */
export function recalculateLengthsFromAssignments(
  rawSegments: Array<{ lengthPdfUnits: number }>,
  assignments: Record<number, string>,
  metresPerUnit: number,
  wholesalerLen: number = WHOLESALER_LENGTH_METRES,
): Map<string, number> {
  const rawLengths = new Map<string, number>();
  for (const [idxStr, groupKey] of Object.entries(assignments)) {
    if (groupKey === 'excluded') continue;
    const idx = parseInt(idxStr, 10);
    const seg = rawSegments[idx];
    if (!seg) continue;
    rawLengths.set(groupKey, (rawLengths.get(groupKey) || 0) + seg.lengthPdfUnits);
  }
  const result = new Map<string, number>();
  for (const [key, pdfUnits] of rawLengths) {
    result.set(key, Math.round(pdfUnits * metresPerUnit * 10) / 10);
  }
  return result;
}

export function calculateCableSummary(
  trayRuns: TrayRun[],
  userInputs: UserInputs,
): CableSummary {
  // Filter runs by tray type if specified
  const filteredRuns = userInputs.trayFilter === "all"
    ? trayRuns
    : trayRuns.filter(r => r.trayType === userInputs.trayFilter);

  // Recalculate wholesalerLengths using the confirmed stick length from userInputs.
  // The value stored on each TrayRun was calculated at analysis time using the default (3m).
  // If the user has since changed the stick length, we must recalculate here.
  const stickLength = userInputs.wholesalerLengthMetres || WHOLESALER_LENGTH_METRES;

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

  // Apply tray type filter — only include tray types in scope.
  const filteredRuns = (userInputs && userInputs.trayFilter && userInputs.trayFilter !== "all")
    ? trayRuns.filter(r => r.trayType === userInputs.trayFilter)
    : trayRuns;

  // Rebuild fittingSummary from filtered runs only (avoids mixing ELV/FA fittings into LV)
  const filteredFittingSummary: Record<string, FittingSummaryBySize> = {};
  for (const run of filteredRuns) {
    const sizeKey = `${run.sizeMillimetres}mm`;
    if (!filteredFittingSummary[sizeKey]) {
      filteredFittingSummary[sizeKey] = { tPieces: 0, crossPieces: 0, bends90: 0, drops: 0, couplers: 0 };
    }
    filteredFittingSummary[sizeKey].tPieces += run.tPieces;
    filteredFittingSummary[sizeKey].crossPieces += run.crossPieces;
    filteredFittingSummary[sizeKey].bends90 += run.bends90;
    filteredFittingSummary[sizeKey].drops += run.drops;
    filteredFittingSummary[sizeKey].couplers += Math.max(0, run.wholesalerLengths - 1);
  }

  // Stick length — use confirmed value from userInputs, fall back to standard 3m
  const stickLen = userInputs?.wholesalerLengthMetres || WHOLESALER_LENGTH_METRES;

  // Tray runs
  lines.push("\n### Cable Tray Runs");
  if (filteredRuns.length === 0) {
    lines.push(`- No tray runs found for filter: ${userInputs?.trayFilter || 'all'}`);
  }
  for (const run of filteredRuns) {
    const lengths = Math.ceil(run.lengthMetres / stickLen);
    lines.push(`- ${run.sizeMillimetres}mm ${run.trayType} tray: ${run.lengthMetres}m (${lengths} x ${stickLen}m lengths) at ${run.heightMetres}m height`);
  }

  // Fittings (rebuilt from filtered runs)
  lines.push("\n### Tray Fittings");
  for (const [size, fittings] of Object.entries(filteredFittingSummary)) {
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
    lines.push(`- Stick length: ${stickLen}m`);
    lines.push(`- Circuits: ${userInputs.numberOfCircuits}`);
  }

  return lines.join("\n");
}

