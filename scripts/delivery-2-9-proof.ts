/**
 * Delivery 2.9 proof harness — NOT part of the running app.
 *
 * Renders a Sorrells-shaped quote (monthly recurring only, 20% VAT,
 * 13 line items) through the real assembler and reports:
 *   1. whether any page comes out blank (the 2.8 defect: an empty
 *      totals strip forced a page carrying one grey rule);
 *   2. whether every narrative chapter starts on its own page
 *      (2.8 let short chapters flow onto the previous chapter's page);
 *   3. that an excluded chapter never reaches the PDF.
 *
 * Run: npx tsx scripts/delivery-2-9-proof.ts
 */
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import { assembleBrandedProposal } from "../server/services/brandedProposalAssembler";
import {
  includedSlots,
  type ChapterSlot,
  type QuoteContext,
} from "../server/engines/brandedProposalEngine";

async function makeBrochure(pages: number): Promise<Uint8Array> {
  const doc = await PDFDocument.create();
  const font = await doc.embedFont(StandardFonts.HelveticaBold);
  for (let i = 0; i < pages; i++) {
    const p = doc.addPage([595, 842]);
    p.drawText(i === 0 ? "BROCHURE COVER" : `BROCHURE PAGE ${i + 1}`, {
      x: 60,
      y: 700,
      size: 24,
      font,
      color: rgb(0.1, 0.1, 0.2),
    });
  }
  return doc.save();
}

const MONTHLY: Array<[string, number, string, number, number, number | null]> = [
  ["Silver IT Support — Unlimited Remote", 22, "User", 20, 391.6, 11],
  ["Silver IT Support (Server)", 1, "Per Server", 45, 40.05, 11],
  ["Security Stack — MDR Advanced + SentinelOne EDR", 23, "User", 12, 245.64, 11],
  ["Advanced Email Protection", 30, "User", 2, 60, null],
  ["Cloud Backup Device", 1, "Device", 68, 68, null],
  ["SharePoint Company Data Daily Backup", 1, "each", 39, 39, null],
  ["SaaS Protect Backup (Microsoft 365 Backup)", 30, "User", 3, 90, null],
  ["Microsoft 365 Business Basic", 4, "User", 4.83, 19.32, null],
  ["Microsoft 365 Business Standard", 18, "User", 10.08, 181.44, null],
  ["Microsoft 365 Copilot Business (add-on)", 3, "User", 26.52, 79.56, null],
  ["Keeper Password Manager", 22, "User", 5, 97.9, 11],
  ["SOGEA Broadband 80/20 Mbps — Unit 11", 1, "Line", 29, 29, null],
  ["SOGEA Broadband 80/20 Mbps — 17 Brook Rd", 1, "Line", 29, 29, null],
];

const quoteContext: QuoteContext = {
  clientName: "Sorrells Custom Wine Cellars",
  title: "Comprehensive IT Support and Security Services",
  reference: "Q-PROOF",
  taxRate: 20,
  // PROOF_LINES repeats the monthly block so the table's final row —
  // and therefore its "Monthly total" — can be walked down the page.
  // Somewhere in that sweep the subtotal finishes close enough to the
  // bottom margin that the old totals-strip guard reserved space it
  // never used: the geometry behind the empty page 13 on the real
  // 14 Sep Sorrells contract.
  lineItems: Array.from(
    { length: Number(process.env.PROOF_LINES || MONTHLY.length) },
    (_, i) => MONTHLY[i % MONTHLY.length],
  ).map((r, i) => ({
    description: r[0],
    quantity: r[1],
    unit: r[2],
    rate: r[3],
    total: r[4],
    discountPercent: r[5],
    pricingType: "monthly" as const,
    sortOrder: i,
  })),
};

const CHAPTER_TITLES = [
  "Executive Summary",
  "Understanding Your Requirements",
  "Proposed Service Delivery",
  "Cybersecurity & Compliance",
  "Disaster Recovery & Business Continuity",
  "Service Level Agreement",
  "Implementation & Onboarding",
  "Key Personnel",
];

function body(n: number): string {
  // Deliberately SHORT — a long body would page-break anyway and prove
  // nothing. Short chapters are exactly what 2.8 used to consolidate.
  return `Short chapter ${n}. One paragraph only, so under the old flow rule it would have been drawn onto the previous chapter's page below a separator rather than opening its own.`;
}

function buildSlots(withExcluded: boolean): ChapterSlot[] {
  const slots: ChapterSlot[] = [
    {
      slotIndex: 1,
      slotName: "Cover",
      source: "embed",
      brochurePageNumber: 1,
      reason: "brochure cover",
    },
    {
      slotIndex: 2,
      slotName: "Title Page",
      source: "generate",
      title: "Title Page",
      body: "Proposal for Sorrells Custom Wine Cellars\nReliable, secure IT support built around your people.",
    },
  ];
  CHAPTER_TITLES.forEach((t, i) => {
    slots.push({
      slotIndex: 3 + i,
      slotName: t,
      source: "generate",
      title: t,
      body: body(i + 1),
      ...(withExcluded && t === "Key Personnel" ? { excluded: true } : {}),
    });
  });
  // PROOF_PAD pushes the pricing table down the page so its last group
  // finishes close to the bottom margin — the geometry that produced the
  // empty page 13 on the real 14 Sep Sorrells contract. Without the pad
  // the table ends mid-page and the defect can't express itself.
  const pad = Number(process.env.PROOF_PAD || 0);
  const intro =
    "The pricing below forms part of this agreement. " +
    Array.from(
      { length: pad },
      (_, i) =>
        `Filler sentence ${i + 1} occupying vertical space above the table.`,
    ).join(" ");
  slots.push({
    slotIndex: 16,
    slotName: "Pricing Summary",
    source: "generate",
    title: "Pricing Summary",
    body: intro,
  });
  return slots;
}

async function report(label: string, slots: ChapterSlot[]) {
  const brochure = await makeBrochure(6);
  const bytes = await assembleBrandedProposal({
    brochurePdfBytes: brochure,
    slots: includedSlots(slots),
    quoteContext,
    targetOrientation: "portrait",
    quoteReference: "Q-PROOF",
    quoteDateStr: "1 October 2026",
    includeBackCover: true,
  });
  const doc = await PDFDocument.load(bytes);
  console.log(`\n--- ${label}: ${doc.getPageCount()} pages`);
  const fs = await import("fs");
  const out = `/tmp/proof-${label.replace(/\W+/g, "-")}.pdf`;
  fs.writeFileSync(out, bytes);
  console.log(`    written to ${out}`);
}

async function main() {
  await report("all-chapters", buildSlots(false));
  await report("one-excluded", buildSlots(true));
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
