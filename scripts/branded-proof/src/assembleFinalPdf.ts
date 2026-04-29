// Step 4 of the proof pipeline.
//
// Takes:
//  - The original brochure PDF bytes (for copyPages source)
//  - The just-rendered narrative PDF bytes (for copyPages source)
//  - The ordered ChapterSlot[] from generateNarrative()
//  - The pageIndexBySlot map from renderNarrativePages()
//
// Produces a single final PDF where:
//  - "embed" slots → brochure page N copied verbatim
//  - "generate" slots → the corresponding narrative page(s) copied
//
// This is where the proof either works or falls over. pdf-lib's
// copyPages preserves rendering fidelity for embedded brochure pages
// because we're not rasterising or re-encoding — the page object is
// copied at the PDF structure level.

import { PDFDocument } from "pdf-lib";
import type { ChapterSlot } from "./types";

export async function assembleFinalPdf(params: {
  brochurePdfBytes: Uint8Array;
  narrativePdfBytes: Uint8Array;
  slots: ChapterSlot[];
  pageIndexBySlot: Map<number, number[]>;
}): Promise<Uint8Array> {
  const finalDoc = await PDFDocument.create();

  const brochureDoc = await PDFDocument.load(params.brochurePdfBytes);
  const narrativeDoc = await PDFDocument.load(params.narrativePdfBytes);

  // Pre-collect indices we'll be copying from each source so we can call
  // copyPages once per source (cheaper than copying one page at a time).
  const brochurePagesNeeded = new Set<number>();
  const narrativePagesNeeded = new Set<number>();

  for (const slot of params.slots) {
    if (slot.source === "embed") {
      // brochurePageNumber is 1-indexed; pdf-lib pageIndex is 0-indexed
      brochurePagesNeeded.add(slot.brochurePageNumber - 1);
    } else {
      const indices = params.pageIndexBySlot.get(slot.slotIndex) ?? [];
      indices.forEach((idx) => narrativePagesNeeded.add(idx));
    }
  }

  // Validate brochure page indices are in range
  const brochurePageCount = brochureDoc.getPageCount();
  for (const idx of brochurePagesNeeded) {
    if (idx < 0 || idx >= brochurePageCount) {
      throw new Error(
        `Brochure page index ${idx} out of range (brochure has ${brochurePageCount} pages)`,
      );
    }
  }

  const brochureIndicesArr = [...brochurePagesNeeded].sort((a, b) => a - b);
  const narrativeIndicesArr = [...narrativePagesNeeded].sort((a, b) => a - b);

  const copiedBrochurePages =
    brochureIndicesArr.length > 0
      ? await finalDoc.copyPages(brochureDoc, brochureIndicesArr)
      : [];
  const copiedNarrativePages =
    narrativeIndicesArr.length > 0
      ? await finalDoc.copyPages(narrativeDoc, narrativeIndicesArr)
      : [];

  // Build lookup tables: source-index → copied-page object
  const brochurePageByIdx = new Map<number, any>();
  brochureIndicesArr.forEach((srcIdx, i) => {
    brochurePageByIdx.set(srcIdx, copiedBrochurePages[i]);
  });
  const narrativePageByIdx = new Map<number, any>();
  narrativeIndicesArr.forEach((srcIdx, i) => {
    narrativePageByIdx.set(srcIdx, copiedNarrativePages[i]);
  });

  // Now add pages to finalDoc in slot order
  for (const slot of params.slots) {
    if (slot.source === "embed") {
      const srcIdx = slot.brochurePageNumber - 1;
      const page = brochurePageByIdx.get(srcIdx);
      if (page) finalDoc.addPage(page);
    } else {
      const indices = params.pageIndexBySlot.get(slot.slotIndex) ?? [];
      for (const idx of indices) {
        const page = narrativePageByIdx.get(idx);
        if (page) finalDoc.addPage(page);
      }
    }
  }

  return finalDoc.save();
}
