/**
 * Chapter set registry — Delivery 2.14, Chunk 5.
 *
 * The three sector sets, composed from the shared spine plus their own
 * middle. The IT set is NOT here: it stays in brandedProposalEngine.ts
 * where it has always lived, lifted across verbatim in Chunk 3 (owner's
 * decision, so that anything looking different in an IT proposal is a
 * fault rather than an intended change). It will move here when it is
 * tidied.
 *
 * Ids carry a version. A revised set is a NEW id, never an edit to an
 * existing one, because proposals already sent to clients resolve their
 * chapters against the id stamped into their saved state — see
 * Chunk 4 and shared/proposalChapters.ts.
 */

import { composeChapterSet, type SlotDef } from "./spine";
import { COMMERCIAL_CLEANING_MIDDLE } from "./commercialCleaning";
import { PEST_CONTROL_MIDDLE } from "./pestControl";
import { WEBSITE_MARKETING_MIDDLE } from "./websiteMarketing";

export const COMMERCIAL_CLEANING_SET: SlotDef[] = composeChapterSet(
  COMMERCIAL_CLEANING_MIDDLE,
);
export const PEST_CONTROL_SET: SlotDef[] = composeChapterSet(PEST_CONTROL_MIDDLE);
export const WEBSITE_MARKETING_SET: SlotDef[] = composeChapterSet(
  WEBSITE_MARKETING_MIDDLE,
);

/** Keyed by chapter set id, for registration in the engine. */
export const SECTOR_CHAPTER_SETS: Record<string, SlotDef[]> = {
  "commercial-cleaning-v1": COMMERCIAL_CLEANING_SET,
  "pest-control-v1": PEST_CONTROL_SET,
  "website-marketing-v1": WEBSITE_MARKETING_SET,
};
