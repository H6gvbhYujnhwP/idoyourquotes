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

const LIGHTING_SYMBOLS = new Set(['J', 'JE', 'N', 'AD', 'ADE', 'K', 'M', 'B', 'C', 'D', 'EX', 'F', 'P', 'EM1']);
const FIRE_ALARM_SYMBOLS = new Set(['SO', 'CO', 'CO2', 'HF', 'HR', 'HC', 'SB', 'FARP', 'VESDA']);
const CONTROL_SYMBOLS = new Set(['P1', 'P2', 'P3', 'P4', 'LCM']);
const SIGNAGE_SYMBOLS = new Set(['EXIT1', 'EXIT2', 'EM1']);

function getCategory(code: string): ClassifiedSymbol['category'] {
  if (LIGHTING_SYMBOLS.has(code)) return 'lighting';
  if (FIRE_ALARM_SYMBOLS.has(code)) return 'fireAlarm';
  if (CONTROL_SYMBOLS.has(code)) return 'controls';
  if (SIGNAGE_SYMBOLS.has(code)) return 'signage';
  return 'unknown';
}

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

export const SYMBOL_DESCRIPTIONS: Record<string, string> = {
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
  'HF':    'Fixed Heat Detector',
  'HR':    'Heat Rising Detector',
  'HC':    'Combined Heat & Carbon Monoxide',
  'P1':    'PIR Presence Detector',
  'P2':    'PIR Presence Detector',
  'P3':    'PIR Presence Detector',
  'P4':    'Surface Mounted PIR',
  'LCM':   'Lighting Control Module',
  'EXIT1': 'Emergency Exit Sign',
  'FARP':  'Fire Alarm Repeater Panel',
  'VESDA': 'VESDA System Panel',
};

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
export async function extractPdfLineColours(pdfBuffer: Buffer): Promise<Array<{ x: number; y: number; colour: string }>> {
  let pdfjsLib: any;
  try {
    pdfjsLib = await import('pdfjs-dist/legacy/build/pdf.mjs');
  } catch {
    try {
      pdfjsLib = await import('pdfjs-dist');
    } catch {
      console.log('[PDF Colours] pdfjs-dist not available');
      return [];
    }
  }

  try {
    const data = new Uint8Array(pdfBuffer);
    const getDocument = pdfjsLib.getDocument || pdfjsLib.default?.getDocument;
    if (!getDocument) return [];

    const OPS = pdfjsLib.OPS || pdfjsLib.default?.OPS;
    if (!OPS) {
      console.log('[PDF Colours] OPS constants not available');
      return [];
    }

    const doc = await getDocument({ data }).promise;
    const page = await doc.getPage(1);
    const viewport = page.getViewport({ scale: 1.0 });
    const pageHeight = viewport.height;
    const ops = await page.getOperatorList();

    // Build reverse lookup: OPS value -> name
    const opsNameMap: Record<number, string> = {};
    for (const [name, val] of Object.entries(OPS)) {
      if (typeof val === 'number') opsNameMap[val] = name;
    }

    const results: Array<{ x: number; y: number; colour: string }> = [];
    let sR = 0, sG = 0, sB = 0; // current stroke colour (0-1 range)
    let pathPoints: Array<{ x: number; y: number }> = [];
    const colourOpsUsed = new Set<string>();

    for (let i = 0; i < ops.fnArray.length; i++) {
      const fn = ops.fnArray[i];
      const args = ops.argsArray[i];
      const opName = opsNameMap[fn] || '';

      // --- Stroke colour setters ---
      if (opName === 'setStrokeRGBColor' && args?.length >= 3) {
        sR = args[0]; sG = args[1]; sB = args[2];
        colourOpsUsed.add(opName);
      } else if (opName === 'setStrokeGray' && args?.length >= 1) {
        sR = sG = sB = args[0];
        colourOpsUsed.add(opName);
      } else if (opName === 'setStrokeColorN' && args?.length >= 3) {
        // Could be RGB or CMYK
        if (args.length === 4) {
          // CMYK → RGB
          const c = args[0], m = args[1], y = args[2], k = args[3];
          sR = (1 - c) * (1 - k); sG = (1 - m) * (1 - k); sB = (1 - y) * (1 - k);
        } else {
          sR = args[0]; sG = args[1]; sB = args[2];
        }
        colourOpsUsed.add(opName);
      } else if (opName === 'setStrokeColor') {
        if (args?.length >= 3) { sR = args[0]; sG = args[1]; sB = args[2]; }
        else if (args?.length === 1) { sR = sG = sB = args[0]; }
        colourOpsUsed.add(opName);
      } else if (opName === 'setStrokeCMYKColor' && args?.length >= 4) {
        const c = args[0], m = args[1], y = args[2], k = args[3];
        sR = (1 - c) * (1 - k); sG = (1 - m) * (1 - k); sB = (1 - y) * (1 - k);
        colourOpsUsed.add(opName);
      }

      // --- Path construction ---
      if (opName === 'constructPath' && args?.[0] && args?.[1]) {
        const subOps = args[0];
        const subArgs = args[1];
        let ai = 0;
        pathPoints = [];
        for (let j = 0; j < subOps.length; j++) {
          const sn = opsNameMap[subOps[j]] || '';
          if (sn === 'moveTo' && ai + 1 < subArgs.length) {
            pathPoints.push({ x: subArgs[ai], y: subArgs[ai + 1] }); ai += 2;
          } else if (sn === 'lineTo' && ai + 1 < subArgs.length) {
            pathPoints.push({ x: subArgs[ai], y: subArgs[ai + 1] }); ai += 2;
          } else if (sn === 'curveTo' && ai + 5 < subArgs.length) {
            pathPoints.push({ x: subArgs[ai + 4], y: subArgs[ai + 5] }); ai += 6;
          } else if ((sn === 'curveTo2' || sn === 'curveTo3') && ai + 3 < subArgs.length) {
            pathPoints.push({ x: subArgs[ai + 2], y: subArgs[ai + 3] }); ai += 4;
          } else if (sn === 'rectangle') { ai += 4; }
          else if (sn === 'closePath') { /* no args */ }
          else { ai = Math.min(ai + 2, subArgs.length); }
        }
      }
      if (opName === 'moveTo' && args?.length >= 2) { pathPoints = [{ x: args[0], y: args[1] }]; }
      if (opName === 'lineTo' && args?.length >= 2) { pathPoints.push({ x: args[0], y: args[1] }); }

      // --- Stroke: record coloured line ---
      if (opName === 'stroke' || opName === 'closeStroke' || opName === 'paintStroke') {
        if (pathPoints.length >= 2) {
          const r = Math.round(sR * 255), g = Math.round(sG * 255), b = Math.round(sB * 255);
          const brightness = (r + g + b) / 3;
          const maxC = Math.max(r, g, b), minC = Math.min(r, g, b);
          const sat = maxC > 0 ? (maxC - minC) / maxC : 0;

          // Only keep clearly coloured lines (not black, grey, or white)
          if (brightness > 20 && brightness < 240 && sat > 0.15) {
            const hex = `#${r.toString(16).padStart(2, '0')}${g.toString(16).padStart(2, '0')}${b.toString(16).padStart(2, '0')}`;
            const midX = pathPoints.reduce((s, p) => s + p.x, 0) / pathPoints.length;
            const midY = pathPoints.reduce((s, p) => s + p.y, 0) / pathPoints.length;
            results.push({ x: midX, y: pageHeight - midY, colour: hex });
          }
        }
        pathPoints = [];
      }
    }

    console.log(`[PDF Colours] Extracted ${results.length} coloured segments. Ops used: ${Array.from(colourOpsUsed).join(', ') || 'none'}`);
    const uniq: Record<string, number> = {};
    for (const r of results) uniq[r.colour] = (uniq[r.colour] || 0) + 1;
    for (const [c, n] of Object.entries(uniq).sort((a, b) => b[1] - a[1]).slice(0, 8)) {
      console.log(`[PDF Colours]   ${c} x${n}`);
    }

    return results;
  } catch (err: any) {
    console.log(`[PDF Colours] Extraction failed (non-fatal): ${err.message}`);
    return [];
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
): Promise<TakeoffResult> {
  console.log(`[Electrical Takeoff] Starting extraction for: ${drawingRef}`);
  
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
  
  // Step 3: Determine drawing area bounds (exclude title block, legend, notes)
  const drawingArea = {
    xMin: pageWidth * 0.02,
    xMax: pageWidth * 0.75,
    yMin: pageHeight * 0.02,
    yMax: pageHeight * 0.95,
  };
  
  const inArea = (x: number, y: number) =>
    x >= drawingArea.xMin && x <= drawingArea.xMax &&
    y >= drawingArea.yMin && y <= drawingArea.yMax;
  
  // Step 4: Match compound symbols
  const detectedSymbols: ClassifiedSymbol[] = [];
  let symId = 0;
  
  // 4a: Match JE pairs (J + E characters near each other)
  const { jePairs, usedJIndices, usedEIndices } = matchJEPairs(chars);
  for (const pos of jePairs) {
    if (!inArea(pos.x, pos.y)) continue;
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: 'JE',
      category: 'lighting',
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
      category: 'signage',
      x: pos.x, y: pos.y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }
  
  // 4c: Remaining J characters (not part of JE pairs) = standalone J fittings
  for (let i = 0; i < chars.length; i++) {
    if (usedJIndices.has(i)) continue;
    if (chars[i].text !== 'J') continue;
    if (!inArea(chars[i].x, chars[i].y)) continue;
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: 'J',
      category: 'lighting',
      x: chars[i].x, y: chars[i].y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }
  
  // Step 5: Match word-level symbols (SO, P4, N, AD, ADE, LCM, FARP, VESDA, etc.)
  const wordSymbolSets = ['SO', 'P4', 'P2', 'P1', 'P3', 'LCM', 'AD', 'ADE', 'EX',
    'FARP', 'VESDA', 'CO', 'CO2', 'HF', 'HR', 'HC', 'SB', 'N', 'K', 'M', 'B', 'C', 'D', 'F'];
  
  // Use tight-tolerance word extraction for these
  for (const w of words) {
    const text = w.text.trim();
    if (!wordSymbolSets.includes(text)) continue;
    if (!inArea(w.x, w.y)) continue;
    
    detectedSymbols.push({
      id: `sym-${++symId}`,
      symbolCode: text,
      category: getCategory(text),
      x: w.x, y: w.y,
      confidence: 'high',
      isStatusMarker: false,
    });
  }
  
  // Step 6: N ambiguity analysis
  const nSymbols = detectedSymbols.filter(s => s.symbolCode === 'N');
  const nonNSymbols = detectedSymbols.filter(s => s.symbolCode !== 'N');
  let nMarkerCount = 0;
  
  for (const n of nSymbols) {
    let nearOther = false;
    for (const other of nonNSymbols) {
      const dist = Math.sqrt((n.x - other.x) ** 2 + (n.y - other.y) ** 2);
      if (dist < 25) {
        n.isStatusMarker = true;
        n.nearbySymbol = other.symbolCode;
        nMarkerCount++;
        nearOther = true;
        break;
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
  
  if (nMarkerCount > 0) {
    const nFittingCount = counts['N'] || 0;
    questions.push({
      id: 'n-status-marker',
      question: `We found ${nMarkerCount} 'N' labels next to other symbols (J, JE, SO, P4 etc.)`,
      context: `These appear to be 'New' status markers, not separate N (Surface LED) fittings. We've excluded them from the count. ${nFittingCount} standalone N symbols are counted as Surface LED Lights.`,
      options: [
        { label: 'Correct — exclude them', value: 'exclude' },
        { label: 'Count them as N fittings', value: 'include' },
        { label: "I'm not sure", value: 'unsure' },
      ],
      defaultValue: 'exclude',
      symbolsAffected: nMarkerCount,
    });
  }
  
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
  
  console.log(`[Electrical Takeoff] Complete: ${Object.entries(counts).map(([k,v]) => `${k}=${v}`).join(', ')}`);
  
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
  
  // Simple word-frequency count from raw text
  const tokens = rawText.split(/\s+/);
  const counts: Record<string, number> = {};
  const allSymbols = [...LIGHTING_SYMBOLS, ...FIRE_ALARM_SYMBOLS, ...CONTROL_SYMBOLS, ...SIGNAGE_SYMBOLS];
  
  for (const token of tokens) {
    const clean = token.trim();
    if (allSymbols.includes(clean)) {
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
  answers: Record<string, string>
): TakeoffResult {
  const updated = { ...result, symbols: result.symbols.map(s => ({ ...s })) };
  
  if (answers['n-status-marker'] === 'include') {
    for (const sym of updated.symbols) {
      if (sym.isStatusMarker && sym.symbolCode === 'N') {
        sym.isStatusMarker = false;
      }
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

export function formatTakeoffForQuoteContext(result: TakeoffResult): string {
  const lines: string[] = [
    `ELECTRICAL TAKEOFF — ${result.drawingRef}`,
    `Status: ${result.symbols.length > 0 ? 'Extracted with coordinates' : 'Text-only count'}`,
    '',
    'SYMBOL COUNTS:',
  ];
  
  for (const [code, count] of Object.entries(result.counts).sort(([a], [b]) => a.localeCompare(b))) {
    const desc = SYMBOL_DESCRIPTIONS[code] || code;
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
