/**
 * Takeoff Markup Generator
 * Generates SVG overlay for browser-side rendering over the PDF viewer.
 * Also provides data for server-side static image generation.
 */

import type { TakeoffResult } from './electricalTakeoff';
import { SYMBOL_STYLES, SYMBOL_DESCRIPTIONS } from './electricalTakeoff';

/**
 * Generate an SVG overlay that sits on top of the PDF in the browser.
 * Each marker is clickable for approve/reject interaction.
 */
export function generateSvgOverlay(result: TakeoffResult): string {
  const { pageWidth, pageHeight, symbols, counts } = result;
  
  if (!pageWidth || !pageHeight) return '';
  
  const activeSymbols = symbols.filter(s => !s.isStatusMarker);
  const markers: string[] = [];
  
  for (const sym of activeSymbols) {
    const style = SYMBOL_STYLES[sym.symbolCode] || { colour: '#888888', shape: 'circle', radius: 20 };
    const cx = sym.x;
    const cy = sym.y;
    const r = style.radius / 4; // Scale for PDF coordinate space
    
    let shapeEl = '';
    if (style.shape === 'circle') {
      shapeEl = `<circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="${r}" fill="none" stroke="${style.colour}" stroke-width="1.5" opacity="0.85"/>
        <circle cx="${cx.toFixed(1)}" cy="${cy.toFixed(1)}" r="1.5" fill="${style.colour}"/>`;
    } else if (style.shape === 'square') {
      shapeEl = `<rect x="${(cx - r).toFixed(1)}" y="${(cy - r).toFixed(1)}" width="${(r * 2).toFixed(1)}" height="${(r * 2).toFixed(1)}" fill="none" stroke="${style.colour}" stroke-width="1.5" opacity="0.85"/>`;
    } else if (style.shape === 'diamond') {
      const pts = `${cx.toFixed(1)},${(cy - r).toFixed(1)} ${(cx + r).toFixed(1)},${cy.toFixed(1)} ${cx.toFixed(1)},${(cy + r).toFixed(1)} ${(cx - r).toFixed(1)},${cy.toFixed(1)}`;
      shapeEl = `<polygon points="${pts}" fill="none" stroke="${style.colour}" stroke-width="1.5" opacity="0.85"/>`;
    }
    
    markers.push(`<g class="takeoff-marker" data-id="${sym.id}" data-code="${sym.symbolCode}" data-cat="${sym.category}" style="cursor:pointer">
      ${shapeEl}
      <title>${sym.symbolCode} — ${SYMBOL_DESCRIPTIONS[sym.symbolCode] || sym.symbolCode}</title>
    </g>`);
  }
  
  // Legend box
  const legendX = pageWidth - 350;
  const legendY = 15;
  const entries = Object.entries(counts).sort(([a], [b]) => a.localeCompare(b));
  const legendHeight = 50 + entries.length * 20 + 25;
  
  const legendItems = entries.map(([code, count], i) => {
    const style = SYMBOL_STYLES[code] || { colour: '#888888' };
    const y = legendY + 40 + i * 20;
    return `<rect x="${legendX + 8}" y="${y}" width="12" height="12" fill="none" stroke="${style.colour}" stroke-width="2" rx="1"/>
      <text x="${legendX + 28}" y="${y + 10}" font-size="10" font-family="Arial,sans-serif" fill="#333">${code}: ${count} — ${SYMBOL_DESCRIPTIONS[code] || ''}</text>`;
  }).join('\n    ');
  
  const total = Object.values(counts).reduce((a, b) => a + b, 0);
  
  const legend = `<g class="takeoff-legend">
    <rect x="${legendX}" y="${legendY}" width="340" height="${legendHeight}" fill="white" fill-opacity="0.93" stroke="#333" stroke-width="0.8" rx="3"/>
    <text x="${legendX + 8}" y="${legendY + 16}" font-size="12" font-weight="bold" font-family="Arial,sans-serif" fill="#333">AI Electrical Takeoff</text>
    <text x="${legendX + 8}" y="${legendY + 30}" font-size="8" font-family="Arial,sans-serif" fill="#666">${result.drawingRef}</text>
    ${legendItems}
    <line x1="${legendX + 5}" y1="${legendY + legendHeight - 18}" x2="${legendX + 335}" y2="${legendY + legendHeight - 18}" stroke="#ddd" stroke-width="0.5"/>
    <text x="${legendX + 8}" y="${legendY + legendHeight - 5}" font-size="9" font-family="Arial,sans-serif" fill="#333">Total: ${total} items</text>
  </g>`;
  
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${pageWidth} ${pageHeight}" width="100%" height="100%" style="position:absolute;top:0;left:0;pointer-events:none;">
  <style>.takeoff-marker{pointer-events:all}.takeoff-marker:hover circle,.takeoff-marker:hover rect,.takeoff-marker:hover polygon{stroke-width:3;filter:drop-shadow(0 0 3px rgba(0,0,0,.3))}</style>
  ${markers.join('\n  ')}
  ${legend}
</svg>`;
}

/**
 * Generate markup data for static image rendering.
 * Used when generating a downloadable marked-up PDF/PNG.
 */
export function generateMarkupData(result: TakeoffResult) {
  const activeSymbols = result.symbols.filter(s => !s.isStatusMarker);
  
  return {
    markers: activeSymbols.map(sym => ({
      x: sym.x,
      y: sym.y,
      symbolCode: sym.symbolCode,
      colour: (SYMBOL_STYLES[sym.symbolCode] || { colour: '#888888' }).colour,
      shape: (SYMBOL_STYLES[sym.symbolCode] || { shape: 'circle' }).shape,
      radius: (SYMBOL_STYLES[sym.symbolCode] || { radius: 20 }).radius,
    })),
    legend: Object.entries(result.counts)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([code, count]) => ({
        symbolCode: code,
        colour: (SYMBOL_STYLES[code] || { colour: '#888888' }).colour,
        count,
        description: SYMBOL_DESCRIPTIONS[code] || code,
      })),
  };
}
