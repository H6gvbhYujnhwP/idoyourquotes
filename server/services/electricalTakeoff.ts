/**
 * Electrical Takeoff Service
 * 
 * Extracts electrical symbols with X/Y coordinates from CAD-generated PDF drawings.
 * Uses pdf-parse (already installed) for text extraction, then character-level analysis
 * with pdfjs-dist for precise coordinate mapping.
 * 
 * NO AI API CALLS - this is pure deterministic extraction from the PDF text layer.
 * 
 * Flow:
 * 1. Extract all text elements with positions from PDF
 * 2. Match compound symbols (JE, ADE, EXIT1) via character proximity
 * 3. Detect ambiguities (e.g., "N" as status marker vs fitting type)
 * 4. Generate questions for user verification
 * 5. Return counts + coordinates for markup overlay
 */

import { createRequire } from 'module';
const require = createRequire(import.meta.url);

// ---- Types ----

export interface ExtractedChar {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ExtractedWord {
  text: string;
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface ClassifiedSymbol {
  id: string;
  symbolCode: string;
  category: 'lighting' | 'fireAlarm' | 'controls' | 'signage' | 'power' | 'unknown';
  x: number;
  y: number;
  confidence: 'high' | 'medium' | 'low';
  isStatusMarker: boolean;
  nearbySymbol?: string;
}

export interface TakeoffQuestion {
  id: string;
  question: string;
  context: string;
  options: Array<{ label: string; value: string }>;
  defaultValue?: string;
  symbolsAffected: number;
}

export interface TakeoffResult {
  drawingRef: string;
  pageWidth: number;
  pageHeight: number;
  symbols: ClassifiedSymbol[];
  counts: Record<string, number>;
  questions: TakeoffQuestion[];
  notes: string[];
  dbCircuits: string[];
  hasTextLayer: boolean;
  totalTextElements: number;
}

// ---- Symbol Definitions ----
//
// IMPORTANT: These are DEFAULT descriptions for well-known codes only.
// They are NOT used as gatekeepers. Any symbol found on a drawing is captured
// regardless of whether it appears here. Unknown codes become TakeoffQuestions.
// Legend uploads populate symbolMap which takes precedence over these defaults.

export const DEFAULT_SYMBOL_DESCRIPTIONS: Record<string, string> = {
  'J':     'Linear LED Light',
  'JE':    'Linear LED Emergency',
  'N':     'Surface LED Light',
  'AD':    '600x600 Recessed Modular',
  'ADE':   '600x600 Recessed Emergency',
  'EX':    'External Luminaire',
  'K':     'Surface LED Light',
  'M':     'Linear LED Light',
  'B':     'Batten Holder',
  'C':     'Downlight',
  'D':     'Downlight',
  'F':     'Downlight',
  'P':     'Pendant Light',
  'SO':    'Optical Smoke Detector',
  'CO':    'Carbon Monoxide Detector',
  'CO2':   'Carbon Dioxide Detector',
  'HF':    'Fixed Heat Detector',
  'HR':    'Heat Rising Detector',
  'HC':    'Combined Heat & Carbon Monoxide',
  'SB':    'Sounder Beacon',
  'P1':    'PIR Presence Detector',
  'P2':    'PIR Presence Detector',
  'P3':    'PIR Presence Detector',
  'P4':    'Surface Mounted PIR',
  'LCM':   'Lighting Control Module',
  'EXIT1': 'Emergency Exit Sign',
  'EXIT2': 'Emergency Exit Sign (alternative)',
  'EM1':   'Emergency Luminaire',
  'FARP':  'Fire Alarm Repeater Panel',
  'VESDA': 'VESDA System Panel',
};

// Category lookup — only used for colouring markers, not for gatekeeping
function getCategory(code: string, symbolMap: Record<string, string> = {}): ClassifiedSymbol['category'] {
  const allDescriptions = { ...DEFAULT_SYMBOL_DESCRIPTIONS, ...symbolMap };
  const desc = (allDescriptions[code] || '').toLowerCase();
  if (desc.includes('light') || desc.includes('led') || desc.includes('luminaire') ||
      desc.includes('downlight') || desc.includes('batten') || desc.includes('pendant') ||
      desc.includes('exit') || desc.includes('emergency')) return 'lighting';
  if (desc.includes('smoke') || desc.includes('heat') || desc.includes('fire') ||
      desc.includes('carbon') || desc.includes('sounder') || desc.includes('vesda') ||
      desc.includes('alarm')) return 'fireAlarm';
  if (desc.includes('pir') || desc.includes('presence') || desc.includes('control') ||
      desc.includes('sensor') || desc.includes('lcm')) return 'controls';
  if (desc.includes('sign') || desc.includes('signage') || desc.includes('exit sign')) return 'signage';
  if (desc.includes('power') || desc.includes('socket') || desc.includes('spu') ||
      desc.includes('switched') || desc.includes('outlet')) return 'power';
  return 'unknown';
}

// Words that appear on drawings as non-symbol text — filtered out before unknown symbol detection
// Keep this list conservative: only words that are definitely NOT electrical device codes
const DRAWING_NOISE_WORDS = new Set([
  // Common English words found in drawing annotations
  'NEW', 'EX', 'TO', 'AT', 'IN', 'ON', 'BY', 'OF', 'IS', 'BE', 'OR', 'NO',
  'AND', 'FOR', 'THE', 'ALL', 'REF', 'TYP', 'SEE', 'NTS', 'NOT', 'USE',
  // Drawing meta
  'DRAWING', 'TITLE', 'SCALE', 'DATE', 'REV', 'DWG', 'SHT', 'SHEET',
  'PROJECT', 'CLIENT', 'STATUS', 'ISSUED', 'CHECKED', 'APPROVED',
  'NORTH', 'SOUTH', 'EAST', 'WEST', 'FLOOR', 'LEVEL', 'AREA',
  // Units / measurements
  'MM', 'M', 'KW', 'VA', 'Hz', 'AMP', 'AMPS', 'V', 'KVA',
  // Circuit refs — captured separately
  'DB', 'MCB', 'RCBO', 'RCD',
  // Status words
  'VOID', 'TBC', 'TBD', 'NIC', 'BIC', 'FFL', 'AFL',
]);

// ---- Marker Styles (used by frontend for rendering) ----

export const SYMBOL_STYLES: Record<string, { colour: string; shape: string; radius: number }> = {
  'J':     { colour: '#00AA00', shape: 'circle', radius: 28 },
  'JE':    { colour: '#FF8200', shape: 'circle', radius: 32 },
  'N':     { colour: '#0050FF', shape: 'circle', radius: 22 },
  'AD':    { colour: '#0088CC', shape: 'square', radius: 26 },
  'ADE':   { colour: '#CC6600', shape: 'square', radius: 28 },
  'EX':    { colour: '#00BBBB', shape: 'circle', radius: 24 },
  'SO':    { colour: '#DD0000', shape: 'diamond', radius: 26 },
  'CO':    { colour: '#CC0044', shape: 'diamond', radius: 24 },
  'HF':    { colour: '#AA0066', shape: 'diamond', radius: 24 },
  'P1':    { colour: '#9600D2', shape: 'square', radius: 22 },
  'P2':    { colour: '#9600D2', shape: 'square', radius: 22 },
  'P3':    { colour: '#9600D2', shape: 'square', radius: 22 },
  'P4':    { colour: '#9600D2', shape: 'square', radius: 24 },
  'LCM':   { colour: '#B4B400', shape: 'square', radius: 20 },
  'EXIT1': { colour: '#00AAAA', shape: 'square', radius: 30 },
  'FARP':  { colour: '#DD0000', shape: 'square', radius: 28 },
  'VESDA': { colour: '#DD0000', shape: 'square', radius: 28 },
};

// Backwards-compat export — routers.ts spreads this onto takeoff responses.
// Now delegates to DEFAULT_SYMBOL_DESCRIPTIONS so it stays in sync.
export const SYMBOL_DESCRIPTIONS: Record<string, string> = DEFAULT_SYMBOL_DESCRIPTIONS;

// ---- PDF Text Extraction ----

/**
 * Extract text with positions using pdfjs-dist.
 * This gives us character-level coordinate data needed for compound symbol matching.
 */
export async function extractWithPdfJs(pdfBuffer: Buffer): Promise<{
  chars: ExtractedChar[];
  words: ExtractedWord[];
  pageWidth: number;
  pageHeight: number;
}> {
  // Dynamic import for pdfjs-dist — try multiple import paths for compatibility
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      pdfjsLib = await import('pdfjs-dist');
    } catch (e2: any) {
      console.error(`[Electrical Takeoff] Failed to import pdfjs-dist:`, e2.message);
      throw new Error(`pdfjs-dist not available: ${e2.message}`);
    }
  }
  
  const data = new Uint8Array(pdfBuffer);
  const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
  if (!getDocument) {
    throw new Error('pdfjs-dist getDocument function not found');
  }
  const doc = await getDocument({ data }).promise;
  const page = await doc.getPage(1);
  const viewport = page.getViewport({ scale: 1.0 });
  const textContent = await page.getTextContent();
  
  const chars: ExtractedChar[] = [];
  const words: ExtractedWord[] = [];
  
  for (const item of textContent.items) {
    if (!('str' in item) || !item.str.trim()) continue;
    
    const tx = item.transform[4];
    const ty = viewport.height - item.transform[5]; // Convert to top-down
    const fontSize = Math.abs(item.transform[0]);
    const text = item.str.trim();
    
    // Store as a word
    words.push({
      text,
      x: tx,
      y: ty,
      width: item.width || 0,
      height: fontSize,
    });
    
    // Also store individual characters with estimated positions
    if (text.length === 1) {
      chars.push({ text, x: tx, y: ty, width: item.width || fontSize, height: fontSize });
    } else if (text.length <= 6) {
      // Short text — store as word but also split into chars for compound matching
      const charWidth = (item.width || fontSize * text.length) / text.length;
      for (let i = 0; i < text.length; i++) {
        chars.push({
          text: text[i],
          x: tx + i * charWidth,
          y: ty,
          width: charWidth,
          height: fontSize,
        });
      }
    }
  }
  
  return { chars, words, pageWidth: viewport.width, pageHeight: viewport.height };
}

/**
 * Extract coloured line segments from PDF vector data.
 * Uses the same pdfjs-dist import path as extractWithPdfJs (proven to work on server).
 * Returns an array of { x, y, colour } for coloured (non-black, non-grey) stroked paths.
 * Completely non-fatal — returns empty array on any error.
 */
export type ColouredSegment = {
  x: number; y: number; colour: string;  // midpoint (preserved for backward compat)
  x1: number; y1: number; x2: number; y2: number;  // actual start/end in page coords (y-flipped)
  lengthPdfUnits: number; // Euclidean length in PDF user units
};

export async function extractPdfLineColours(pdfBuffer: Buffer): Promise<ColouredSegment[]> {
  // -----------------------------------------------------------------------
  // Electrical sector only — used exclusively by performContainmentTakeoff.
  // No other sector, QDS flow, billing path, or data flow calls this function.
  //
  // Uses a Python subprocess (pdfminer.six) instead of pdfjs-dist's operator
  // list API. pdfjs resolves AutoCAD layer colours (setGState) internally for
  // rendering but does NOT re-emit those resolved colours into the operator
  // stream, so our colour tracking variables stayed at (0,0,0) black on every
  // AutoCAD drawing. pdfminer.six is a content stream analyser — not a
  // renderer — and exposes stroking_color / non_stroking_color already resolved
  // from the graphics state dictionary, which is exactly what we need.
  //
  // Fail-safe: any error (script missing, pdfminer not installed, parse error)
  // returns [] and performContainmentTakeoff falls back to annotation-spacing.
  // -----------------------------------------------------------------------
  const { execFile } = await import('child_process');
  const { writeFile, unlink } = await import('fs/promises');
  const { join } = await import('path');
  const { tmpdir } = await import('os');
  const { fileURLToPath } = await import('url');

  const tmpPath = join(tmpdir(), `iyq_colours_${Date.now()}_${Math.random().toString(36).slice(2)}.pdf`);

  // Resolve path to the Python script relative to this file's location.
  // In production (Render), __dirname equivalent via import.meta.url:
  //   server/services/electricalTakeoff.ts  →  server/scripts/extractColours.py
  let scriptPath: string;
  try {
    const thisDir = fileURLToPath(new URL('.', import.meta.url));
    scriptPath = join(thisDir, '..', 'scripts', 'extractColours.py');
  } catch {
    // Fallback for environments where import.meta.url is unavailable
    scriptPath = join(process.cwd(), 'server', 'scripts', 'extractColours.py');
  }

  console.log(`[PDF Colours] Python extraction starting — buffer: ${pdfBuffer?.length || 0} bytes`);

  try {
    // Write buffer to temp file — Python reads from disk, not stdin
    await writeFile(tmpPath, pdfBuffer);

    const raw = await new Promise<string>((resolve, reject) => {
      execFile('python3', [scriptPath, tmpPath], { maxBuffer: 64 * 1024 * 1024 }, (err, stdout, stderr) => {
        if (stderr && stderr.trim()) {
          console.log(`[PDF Colours] Python stderr: ${stderr.trim()}`);
        }
        if (err) {
          reject(err);
          return;
        }
        resolve(stdout);
      });
    });

    const parsed: Array<{
      x1: number; y1: number; x2: number; y2: number;
      lengthPdfUnits: number; colour: string; x: number; y: number;
    }> = JSON.parse(raw);

    if (!Array.isArray(parsed)) {
      console.log('[PDF Colours] Python returned non-array — falling back');
      return [];
    }

    // pdfminer uses bottom-left origin (y increases upward).
    // We need to y-flip to match the pdfjs coordinate system used everywhere else:
    //   y_flipped = pageHeight - y_pdfminer
    // To do the flip we need pageHeight. Extract it from the bounding box of all
    // returned segments (max y value before flip = page height in pdfminer space).
    // If no segments returned, flip is moot — return empty array.
    if (parsed.length === 0) {
      console.log('[PDF Colours] Python returned 0 segments');
      return [];
    }

    // Find the pdfminer page height from the highest y coordinate seen.
    // This is used solely for the y-flip — no effect on length calculations.
    let maxY = 0;
    for (const seg of parsed) {
      if (seg.y1 > maxY) maxY = seg.y1;
      if (seg.y2 > maxY) maxY = seg.y2;
    }
    // Use the pdfminer page bbox height if we can get it more accurately,
    // otherwise use the max y seen. A0 at 72dpi is ~3370 units — maxY will
    // be very close to the real page height for well-drawn geometry.
    const pageHeight = maxY;

    const results: ColouredSegment[] = parsed.map(seg => ({
      x1: seg.x1,
      y1: pageHeight - seg.y1,  // y-flip: pdfminer bottom-left → pdfjs top-left
      x2: seg.x2,
      y2: pageHeight - seg.y2,
      lengthPdfUnits: seg.lengthPdfUnits,
      colour: seg.colour,
      x: seg.x,
      y: pageHeight - seg.y,    // midpoint y also flipped
    }));

    // Log colour distribution (top 8) for Render diagnostics
    const uniq: Record<string, number> = {};
    for (const r of results) uniq[r.colour] = (uniq[r.colour] || 0) + 1;
    console.log(`[PDF Colours] Python extraction: ${results.length} segments`);
    for (const [c, n] of Object.entries(uniq).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`[PDF Colours]   ${c} x${n}`);
    }

    return results;

  } catch (err: any) {
    console.log(`[PDF Colours] Extraction failed (non-fatal): ${err.message}`);
    return [];
  } finally {
    // Always clean up the temp file — even if parsing threw
    try { await unlink(tmpPath); } catch { /* already gone */ }
  }
}

/**
 * Fallback extraction using pdf-parse (simpler, no coordinates but gets text).
 * Used to detect if the PDF has a text layer at all.
 */
async function extractWithPdfParse(pdfBuffer: Buffer): Promise<{ text: string; pages: number }> {
  const pdfParse = require('pdf-parse');
  try {
    const parsed = await pdfParse(pdfBuffer);
    return { text: parsed.text || '', pages: parsed.numpages || 1 };
  } catch {
    return { text: '', pages: 1 };
  }
}

// ---- Compound Symbol Matching ----

/**
 * Match JE symbols by finding J characters near E characters.
 * CAD software often places J and E as separate text elements within the symbol.
 */
function matchJEPairs(
  chars: ExtractedChar[],
  maxDistance: number = 20
): { jePairs: Array<{ x: number; y: number }>; usedJIndices: Set<number>; usedEIndices: Set<number> } {
  const jIndices = chars.map((c, i) => ({ c, i })).filter(({ c }) => c.text === 'J');
  const eIndices = chars.map((c, i) => ({ c, i })).filter(({ c }) => c.text === 'E');
  
  const usedJ = new Set<number>();
  const usedE = new Set<number>();
  const pairs: Array<{ x: number; y: number }> = [];
  
  for (const { c: j, i: ji } of jIndices) {
    let bestEIdx = -1;
    let bestDist = Infinity;
    
    for (const { c: e, i: ei } of eIndices) {
      if (usedE.has(ei)) continue;
      const dist = Math.sqrt((j.x - e.x) ** 2 + (j.y - e.y) ** 2);
      if (dist < maxDistance && dist < bestDist) {
        bestDist = dist;
        bestEIdx = ei;
      }
    }
    
    if (bestEIdx >= 0) {
      const e = chars[bestEIdx];
      pairs.push({ x: (j.x + e.x) / 2, y: (j.y + e.y) / 2 });
      usedJ.add(ji);
      usedE.add(bestEIdx);
    }
  }
  
  return { jePairs: pairs, usedJIndices: usedJ, usedEIndices: usedE };
}

/**
 * Match EXIT1 by finding E-X-I-T-1 character sequences.
 */
function matchEXIT1(chars: ExtractedChar[]): Array<{ x: number; y: number }> {
  const results: Array<{ x: number; y: number }> = [];
  const used = new Set<number>();
  
  for (let i = 0; i < chars.length; i++) {
    if (chars[i].text !== 'E' || used.has(i)) continue;
    
    const target = ['X', 'I', 'T', '1'];
    const chain = [i];
    let allFound = true;
    
    for (const nextChar of target) {
      let found = false;
      for (let k = 0; k < chars.length; k++) {
        if (used.has(k) || chain.includes(k)) continue;
        if (chars[k].text !== nextChar) continue;
        const dist = Math.sqrt(
          (chars[i].x - chars[k].x) ** 2 + (chars[i].y - chars[k].y) ** 2
        );
        if (dist < 30) { // EXIT1 chars can be more spread out
          chain.push(k);
          found = true;
          break;
        }
      }
      if (!found) { allFound = false; break; }
    }
    
    if (allFound && chain.length === 5) {
      // Deduplicate — check not too close to existing EXIT1
      const cx = chain.reduce((s, idx) => s + chars[idx].x, 0) / chain.length;
      const cy = chain.reduce((s, idx) => s + chars[idx].y, 0) / chain.length;
      
      const isDup = results.some(r => 
        Math.sqrt((r.x - cx) ** 2 + (r.y - cy) ** 2) < 10
      );
      
      if (!isDup) {
        results.push({ x: cx, y: cy });
        chain.forEach(idx => used.add(idx));
      }
    }
  }
  
  return results;
}

// ---- Main Takeoff Function ----

export async function performElectricalTakeoff(
  pdfBuffer: Buffer,
  drawingRef: string = 'Unknown',
  symbolMap: Record<string, string> = {},  // Legend-parsed symbols: { CODE: "Description" }
): Promise<TakeoffResult> {
  console.log(`[Electrical Takeoff] Starting extraction for: ${drawingRef}, symbolMap keys: ${Object.keys(symbolMap).length}`);
  
  // Step 1: Extract with pdfjs-dist directly (skip pdf-parse which has ESM issues)
  let chars: ExtractedChar[];
  let words: ExtractedWord[];
  let pageWidth: number;
  let pageHeight: number;
  
  try {
    const extracted = await extractWithPdfJs(pdfBuffer);
    chars = extracted.chars;
    words = extracted.words;
    pageWidth = extracted.pageWidth;
    pageHeight = extracted.pageHeight;
    console.log(`[Electrical Takeoff] Extracted ${chars.length} chars, ${words.length} words from ${pageWidth}x${pageHeight} page`);
  } catch (err: any) {
    console.error(`[Electrical Takeoff] pdfjs extraction failed:`, err.message);
    return {
      drawingRef,
      pageWidth: 0,
      pageHeight: 0,
      symbols: [],
      counts: {},
      questions: [{
        id: 'no-text',
        question: 'PDF extraction failed.',
        context: `Error: ${err.message}. The drawing may be scanned or in an unsupported format.`,
        options: [
          { label: 'Skip this drawing', value: 'skip' },
          { label: 'Try standard analysis', value: 'standard' },
        ],
        symbolsAffected: 0,
      }],
      notes: [],
      dbCircuits: [],
      hasTextLayer: false,
      totalTextElements: 0,
    };
  }
  
  // Check if we got any text content
  if (words.length === 0) {
    console.log(`[Electrical Takeoff] No text elements found in PDF`);
    return {
      drawingRef,
      pageWidth,
      pageHeight,
      symbols: [],
      counts: {},
      questions: [{
        id: 'no-text',
        question: 'This PDF has no extractable text layer.',
        context: 'The drawing may be scanned or flattened. Please request a vector PDF from the consultant.',
        options: [
          { label: 'Skip this drawing', value: 'skip' },
          { label: 'Try standard analysis', value: 'standard' },
        ],
        symbolsAffected: 0,
      }],
      notes: [],
      dbCircuits: [],
      hasTextLayer: false,
      totalTextElements: 0,
    };
  }
  
  // Build merged description map: legend symbols take precedence over defaults
  const allDescriptions: Record<string, string> = { ...DEFAULT_SYMBOL_DESCRIPTIONS, ...symbolMap };

  // Step 3: Determine drawing area bounds
  // Attempt to auto-detect embedded legend block (dense CODE — Description pattern in corner)
  // If found, exclude it from counting area and extract its symbol mappings
  const embeddedLegendSymbols: Record<string, string> = {};
  let legendExcludeRegion: { xMin: number; xMax: number; yMin: number; yMax: number } | null = null;

  // Scan for dense "CODE DESCRIPTION" or "CODE - DESCRIPTION" patterns in bottom-right quadrant
  const legendCandidateWords = words.filter(w =>
    w.x > pageWidth * 0.6 && w.y > pageHeight * 0.6
  );
  // A legend block will have short uppercase codes (1-6 chars) followed by longer description words
  // Count qualifying pairs in this region
  let legendPairCount = 0;
  for (let i = 0; i < legendCandidateWords.length - 1; i++) {
    const w = legendCandidateWords[i];
    if (/^[A-Z0-9]{1,6}$/.test(w.text) && !DRAWING_NOISE_WORDS.has(w.text)) {
      const next = legendCandidateWords[i + 1];
      if (next && next.text.length > 3 && Math.abs(next.y - w.y) < 20) {
        legendPairCount++;
        embeddedLegendSymbols[w.text] = next.text;
      }
    }
  }
  if (legendPairCount >= 4) {
    // Enough pairs to be confident this is a legend block — exclude the region from counting
    const lxMin = Math.min(...legendCandidateWords.map(w => w.x));
    const lyMin = Math.min(...legendCandidateWords.map(w => w.y));
    legendExcludeRegion = { xMin: lxMin - 5, xMax: pageWidth, yMin: lyMin - 5, yMax: pageHeight };
    // Merge embedded legend into allDescriptions
    Object.assign(allDescriptions, embeddedLegendSymbols);
    console.log(`[Electrical Takeoff] Embedded legend detected (${legendPairCount} pairs), excluding region from counts. Added ${Object.keys(embeddedLegendSymbols).length} symbols.`);
  }

  const drawingArea = {
    xMin: pageWidth * 0.02,
    xMax: pageWidth * 0.98,   // Open — don't assume right 25% is title block
    yMin: pageHeight * 0.02,
    yMax: pageHeight * 0.95,
  };

  const inArea = (x: number, y: number) => {
    if (x < drawingArea.xMin || x > drawingArea.xMax) return false;
    if (y < drawingArea.yMin || y > drawingArea.yMax) return false;
    // Exclude embedded legend region if detected
    if (legendExcludeRegion &&
        x >= legendExcludeRegion.xMin && y >= legendExcludeRegion.yMin) return false;
    return true;
  };

  // Step 4: Match compound symbols (JE, EXIT1) — always detected regardless of symbolMap
  const detectedSymbols: ClassifiedSymbol[] = [];
  let symId = 0;

  // 4a: Match JE pairs (J + E characters near each other)
  const { jePairs, usedJIndices, usedEIndices } = matchJEPairs(chars);
  for (const pos of jePairs) {
    if (!inArea(pos.x, pos.y)) continue;
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: 'JE',
      category: getCategory('JE', allDescriptions),
      x: pos.x, y: pos.y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }

  // 4b: Match EXIT1 sequences
  const exit1Positions = matchEXIT1(chars);
  for (const pos of exit1Positions) {
    if (!inArea(pos.x, pos.y)) continue;
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: 'EXIT1',
      category: getCategory('EXIT1', allDescriptions),
      x: pos.x, y: pos.y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }

  // 4c: Remaining J characters (not part of JE pairs)
  for (let i = 0; i < chars.length; i++) {
    if (usedJIndices.has(i)) continue;
    if (chars[i].text !== 'J') continue;
    if (!inArea(chars[i].x, chars[i].y)) continue;
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: 'J',
      category: getCategory('J', allDescriptions),
      x: chars[i].x, y: chars[i].y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }

  // Step 5: OPEN word-level symbol detection
  // Match ANY short uppercase word (1-6 chars) that:
  //   a) appears in allDescriptions (known or legend-mapped), OR
  //   b) looks like a symbol code (short, uppercase, alphanumeric, not noise)
  // Unknown codes in group (b) are captured for questions, not silently dropped.
  const knownCodes = new Set(Object.keys(allDescriptions));

  // Codes already captured via compound matching (avoid double-counting)
  const compoundCodes = new Set(['J', 'JE', 'EXIT1']);

  // Codes found in this drawing but not in any description source
  const unknownCodeCounts: Record<string, number> = {};
  // Example positions for unknown codes (for questions context)
  const unknownCodePositions: Record<string, Array<{x: number; y: number}>> = {};

  for (const w of words) {
    const text = w.text.trim();

    // Must be short, uppercase-ish, alphanumeric — symbol code shape
    if (text.length < 1 || text.length > 8) continue;
    if (!/^[A-Z][A-Z0-9]*$/.test(text)) continue;
    if (!inArea(w.x, w.y)) continue;
    if (compoundCodes.has(text)) continue;         // already handled above
    if (DRAWING_NOISE_WORDS.has(text)) continue;  // known non-symbol word

    // DB circuit references handled separately
    if (text.startsWith('DB') && text.length > 2) continue;

    if (knownCodes.has(text)) {
      // Known symbol — count it
      detectedSymbols.push({
        id: `sym-${++symId}`,
        symbolCode: text,
        category: getCategory(text, allDescriptions),
        x: w.x, y: w.y,
        confidence: 'high',
        isStatusMarker: false,
      });
    } else {
      // Unknown code — capture for question, don't drop
      unknownCodeCounts[text] = (unknownCodeCounts[text] || 0) + 1;
      if (!unknownCodePositions[text]) unknownCodePositions[text] = [];
      if (unknownCodePositions[text].length < 3) {
        unknownCodePositions[text].push({ x: w.x, y: w.y });
      }
    }
  }

  // Step 6: Proximity-based status marker detection
  // A single-char code found very close (<25px) to another symbol is likely a status marker
  // (e.g. "N" next to "J" = "New J fitting", not a separate N luminaire)
  // This is now generalised — not hardcoded to just "N"
  const singleCharCodes = detectedSymbols.filter(s => s.symbolCode.length === 1);
  const multiCharCodes = detectedSymbols.filter(s => s.symbolCode.length > 1);
  let statusMarkerCount = 0;
  const statusMarkersByCode: Record<string, number> = {};

  for (const single of singleCharCodes) {
    let nearOther = false;
    for (const other of multiCharCodes) {
      if (other.id === single.id) continue;
      const dist = Math.sqrt((single.x - other.x) ** 2 + (single.y - other.y) ** 2);
      if (dist < 25) {
        single.isStatusMarker = true;
        single.nearbySymbol = other.symbolCode;
        statusMarkerCount++;
        statusMarkersByCode[single.symbolCode] = (statusMarkersByCode[single.symbolCode] || 0) + 1;
        nearOther = true;
        break;
      }
    }
    // Also check: single-char code near another single-char code of different type
    if (!nearOther) {
      for (const other of singleCharCodes) {
        if (other.id === single.id || other.symbolCode === single.symbolCode) continue;
        const dist = Math.sqrt((single.x - other.x) ** 2 + (single.y - other.y) ** 2);
        if (dist < 18) {
          // Very close to a different single-char symbol — likely a status modifier
          // Only flag if this code also appears commonly as a status word (N, E, X, A, R)
          const commonStatusChars = new Set(['N', 'E', 'X', 'A', 'R', 'S', 'D']);
          if (commonStatusChars.has(single.symbolCode)) {
            single.isStatusMarker = true;
            single.nearbySymbol = other.symbolCode;
            statusMarkerCount++;
            statusMarkersByCode[single.symbolCode] = (statusMarkersByCode[single.symbolCode] || 0) + 1;
            break;
          }
        }
      }
    }
  }
  
  // Step 7: Extract DB circuit references
  const dbCircuits: string[] = [];
  for (const w of words) {
    if (w.text.startsWith('DB/')) {
      if (!dbCircuits.includes(w.text)) dbCircuits.push(w.text);
    }
  }

  // Step 8: Extract drawing notes
  const notes: string[] = [];
  for (const w of words) {
    if (w.text.length > 40 && !w.text.includes('CES Group') &&
        !w.text.includes('ISO 19650') && !w.text.includes('Coppergate')) {
      notes.push(w.text);
    }
  }
  const scopeNotes = notes.filter(n =>
    n.toLowerCase().includes('additional') ||
    n.toLowerCase().includes('shall be changed') ||
    n.toLowerCase().includes('abeyance') ||
    n.toLowerCase().includes('excluded') ||
    n.toLowerCase().includes('void')
  );

  // Step 9: Build counts (excluding status markers)
  const counts: Record<string, number> = {};
  for (const sym of detectedSymbols) {
    if (sym.isStatusMarker) continue;
    counts[sym.symbolCode] = (counts[sym.symbolCode] || 0) + 1;
  }

  // Step 10: Generate questions
  const questions: TakeoffQuestion[] = [];

  // 10a: Status marker ambiguity questions (generalised — not hardcoded to N)
  for (const [code, markerCount] of Object.entries(statusMarkersByCode)) {
    const fittingCount = counts[code] || 0;
    const desc = allDescriptions[code] || code;
    questions.push({
      id: `status-marker-${code}`,
      question: `We found ${markerCount} '${code}' label${markerCount > 1 ? 's' : ''} placed next to other symbols`,
      context: `These look like status markers (e.g. "New ${code}" meaning a new ${desc} fitting), not separate devices. We've excluded them from the count. ${fittingCount > 0 ? `${fittingCount} standalone ${code} symbols are counted as ${desc}.` : `No standalone ${code} symbols were found.`}`,
      options: [
        { label: `Correct — they are status markers, exclude them`, value: 'exclude' },
        { label: `No — count them as ${desc}`, value: 'include' },
        { label: `I'm not sure`, value: 'unsure' },
      ],
      defaultValue: 'exclude',
      symbolsAffected: markerCount,
    });
  }

  // 10b: Unknown symbol questions — codes found on drawing not in any description source
  // Only ask about codes that appear more than once (single occurrence is likely noise)
  const significantUnknowns = Object.entries(unknownCodeCounts)
    .filter(([, count]) => count >= 2)
    .sort(([, a], [, b]) => b - a); // most frequent first

  for (const [code, count] of significantUnknowns) {
    questions.push({
      id: `unknown-symbol-${code}`,
      question: `Unknown symbol '${code}' found ${count} time${count > 1 ? 's' : ''} on this drawing`,
      context: `This code wasn't in the uploaded legend or our default symbol library. What does '${code}' represent? Once defined, it will be counted and included in the quote.`,
      options: [
        { label: `It's a device — I'll describe it below`, value: 'define' },
        { label: `It's a reference label — exclude from count`, value: 'exclude' },
        { label: `I don't know — skip for now`, value: 'skip' },
      ],
      defaultValue: 'skip',
      symbolsAffected: count,
    });
  }

  // 10c: Embedded legend notification
  if (legendExcludeRegion && Object.keys(embeddedLegendSymbols).length > 0) {
    questions.push({
      id: 'embedded-legend-detected',
      question: `Embedded legend block detected and excluded from symbol counts`,
      context: `We found a legend/key in the bottom-right of this drawing (${Object.keys(embeddedLegendSymbols).length} symbol definitions). Those reference symbols have been excluded from the installation count. Symbols defined: ${Object.keys(embeddedLegendSymbols).join(', ')}.`,
      options: [
        { label: `Correct — the legend is in that area`, value: 'confirmed' },
        { label: `Wrong — that area contains real installations`, value: 'include-area' },
      ],
      defaultValue: 'confirmed',
      symbolsAffected: 0,
    });
  }

  // 10d: Scope notes question
  if (scopeNotes.length > 0) {
    questions.push({
      id: 'scope-notes',
      question: 'Drawing contains notes about scope changes',
      context: scopeNotes.join(' | '),
      options: [
        { label: 'Noted — proceed', value: 'proceed' },
        { label: 'Need to review', value: 'review' },
      ],
      defaultValue: 'proceed',
      symbolsAffected: 0,
    });
  }

  const symbolSummary = Object.entries(counts).map(([k,v]) => `${k}=${v}`).join(', ');
  const unknownSummary = significantUnknowns.length > 0
    ? ` | Unknowns: ${significantUnknowns.map(([k,v]) => `${k}x${v}`).join(', ')}`
    : '';
  console.log(`[Electrical Takeoff] Complete: ${symbolSummary}${unknownSummary}`);
  
  return {
    drawingRef,
    pageWidth,
    pageHeight,
    symbols: detectedSymbols,
    counts,
    questions,
    notes: scopeNotes,
    dbCircuits: dbCircuits.sort(),
    hasTextLayer: true,
    totalTextElements: words.length,
  };
}

// ---- Fallback: Text-only count (no coordinates) ----

function buildFallbackResult(rawText: string, drawingRef: string): TakeoffResult {
  console.log(`[Electrical Takeoff] Using fallback text-only count`);

  // Simple word-frequency count — match any known default code
  const tokens = rawText.split(/\s+/);
  const counts: Record<string, number> = {};
  const knownCodes = new Set(Object.keys(DEFAULT_SYMBOL_DESCRIPTIONS));

  for (const token of tokens) {
    const clean = token.trim();
    if (knownCodes.has(clean)) {
      counts[clean] = (counts[clean] || 0) + 1;
    }
  }
  
  return {
    drawingRef,
    pageWidth: 0,
    pageHeight: 0,
    symbols: [], // No coordinates available in fallback
    counts,
    questions: [{
      id: 'fallback-warning',
      question: 'Coordinate extraction was unavailable — counts only, no markup overlay.',
      context: 'The PDF structure prevented detailed extraction. Counts are approximate and based on text content only. Please verify carefully.',
      options: [
        { label: 'Understood — continue', value: 'continue' },
        { label: 'Skip this drawing', value: 'skip' },
      ],
      symbolsAffected: Object.values(counts).reduce((a, b) => a + b, 0),
    }],
    notes: [],
    dbCircuits: [],
    hasTextLayer: true,
    totalTextElements: tokens.length,
  };
}

// ---- Apply User Answers ----

export function applyUserAnswers(
  result: TakeoffResult,
  answers: Record<string, string>,
  symbolMap: Record<string, string> = {},
): TakeoffResult {
  const updated = { ...result, symbols: result.symbols.map(s => ({ ...s })) };
  const allDescriptions = { ...DEFAULT_SYMBOL_DESCRIPTIONS, ...symbolMap };

  // Handle status marker answers: status-marker-{CODE}
  for (const [key, value] of Object.entries(answers)) {
    if (key.startsWith('status-marker-')) {
      const code = key.replace('status-marker-', '');
      if (value === 'include') {
        // Engineer says these ARE real devices, not status markers — restore them
        for (const sym of updated.symbols) {
          if (sym.isStatusMarker && sym.symbolCode === code) {
            sym.isStatusMarker = false;
          }
        }
      }
      // 'exclude' or 'unsure' = leave as status markers (already excluded from counts)
    }

    // Legacy: handle old 'n-status-marker' key from any existing saved answers
    if (key === 'n-status-marker' && value === 'include') {
      for (const sym of updated.symbols) {
        if (sym.isStatusMarker && sym.symbolCode === 'N') {
          sym.isStatusMarker = false;
        }
      }
    }

    // Handle unknown symbol answers: unknown-symbol-{CODE}
    if (key.startsWith('unknown-symbol-')) {
      const code = key.replace('unknown-symbol-', '');
      // The description is stored in answers as `define:Some Description text`
      if (value.startsWith('define:')) {
        const desc = value.replace('define:', '').trim();
        if (desc) {
          // Add these symbols to the count — they were previously in unknownCodeCounts
          // We need to add them as symbols from the unknownSymbols array if present
          const unknowns = (result as any).unknownSymbols as Array<{code: string; x: number; y: number}> | undefined;
          if (unknowns) {
            let symId = updated.symbols.length;
            for (const u of unknowns) {
              if (u.code === code) {
                updated.symbols.push({
                  id: `defined-${++symId}`,
                  symbolCode: code,
                  category: 'unknown',
                  x: u.x,
                  y: u.y,
                  confidence: 'medium',
                  isStatusMarker: false,
                });
              }
            }
          }
        }
      }
      // 'exclude' or 'skip' = leave out of counts (default behaviour)
    }

    // Handle embedded legend confirmation
    if (key === 'embedded-legend-detected' && value === 'include-area') {
      // Engineer says that area had real installations — we can't retroactively re-count
      // so we surface a note but can't auto-fix (would need a re-run)
      // The question exists to surface this edge case; re-run takeoff handles it
    }
  }

  // Recalculate counts
  const counts: Record<string, number> = {};
  for (const sym of updated.symbols) {
    if (sym.isStatusMarker) continue;
    counts[sym.symbolCode] = (counts[sym.symbolCode] || 0) + 1;
  }
  updated.counts = counts;

  return updated;
}

// ---- Format for Quote Context ----

export function formatTakeoffForQuoteContext(
  result: TakeoffResult,
  symbolMap: Record<string, string> = {},
): string {
  const allDescriptions = { ...DEFAULT_SYMBOL_DESCRIPTIONS, ...symbolMap };
  const lines: string[] = [
    `ELECTRICAL TAKEOFF — ${result.drawingRef}`,
    `Status: ${result.symbols.length > 0 ? 'Extracted with coordinates' : 'Text-only count'}`,
    '',
    'SYMBOL COUNTS:',
  ];

  for (const [code, count] of Object.entries(result.counts).sort(([a], [b]) => a.localeCompare(b))) {
    const desc = allDescriptions[code] || `Unknown device (${code})`;
    lines.push(`  ${code} (${desc}): ${count}`);
  }

  if (result.dbCircuits.length > 0) {
    lines.push('', `DISTRIBUTION CIRCUITS: ${result.dbCircuits.join(', ')}`);
  }

  if (result.notes.length > 0) {
    lines.push('', 'DRAWING NOTES:', ...result.notes.map(n => `  - ${n}`));
  }

  lines.push('', 'USE THESE EXACT QUANTITIES. DO NOT ESTIMATE OR CHANGE THEM.');

  return lines.join('\n');
}
