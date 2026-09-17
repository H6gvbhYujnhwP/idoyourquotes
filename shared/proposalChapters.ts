/**
 * Proposal chapter identity — Delivery 2.14, Chunk 2.
 *
 * WHY THIS FILE EXISTS
 *
 * A branded proposal chapter was identified by its POSITION in one
 * hard-coded list. The pricing chapter, which the assembler treats
 * specially because it draws a real table from the quote's line items
 * instead of rendering AI prose, was "the chapter at index 16". That
 * number was written out in four separate places:
 *
 *   - the engine, which declared it
 *   - the assembler and the proposal router, which imported it
 *   - the proposal workspace, which hand-copied it, with a comment
 *     recording that it had already drifted once when Delivery E.4.3
 *     inserted a chapter and shifted everything after it
 *
 * With a single chapter list that was survivable. Sector-specific
 * chapter sets (Chunk 5) make it untenable: if Commercial Cleaning has
 * eleven chapters and IT Services has eighteen, a position number means
 * nothing, and the failure mode is a pricing table rendered in the
 * middle of somebody's terms.
 *
 * So a chapter now carries identity rather than position:
 *
 *   chapterId  a stable string, unique within its set, that survives
 *              reordering and insertion ("pricing-summary")
 *   role       what the rest of the app must treat specially. Most
 *              chapters have no role and are plain prose.
 *
 * WHAT THIS DELIBERATELY DOES NOT DO
 *
 * It does not change any chapter, any order, any wording or any
 * rendered output. This chunk is a pure refactor whose whole purpose is
 * to make Chunk 5 safe, and it is verified by rendering a proposal
 * before and after and diffing the result.
 *
 * BACK COMPATIBILITY
 *
 * Proposals saved before this delivery hold chapters with a slotIndex
 * and no chapterId or role — every proposal you have already produced,
 * including the live Sorrells one. isPricingChapter() therefore falls
 * back to the legacy index when no role is present, so those documents
 * keep rendering and keep regenerating exactly as they did. The
 * fallback is scoped to the original IT chapter set and must never be
 * extended to a new set: Chunk 4 stamps the set into the saved state so
 * a new set is never read through a legacy lens.
 */

/**
 * A chapter's special handling, where it has any.
 *
 *   "pricing"  the assembler replaces the AI body with a real pricing
 *              table built from the quote's line items, and the
 *              workspace hides the regenerate and edit affordances
 *              because there is no prose to regenerate.
 *
 * Add a role only when code outside the engine has to branch on it.
 * A chapter that is merely important — the executive summary, the
 * acceptance page — does not need one.
 */
export type ChapterRole = "pricing";

/**
 * The pricing chapter's position in the ORIGINAL IT chapter set, the
 * only set that existed before chapters carried identity.
 *
 * This constant exists solely to read proposals saved before this
 * delivery. Do not use it for anything else, and never compare it
 * against a chapter from a set other than the legacy one.
 */
export const LEGACY_IT_PRICING_SLOT_INDEX = 16;

/**
 * The minimum a caller needs to expose for the helpers below. Both the
 * server's ChapterSlot union and the client's own chapter type satisfy
 * it structurally, so neither side has to import the other's types.
 */
export interface ChapterIdentity {
  slotIndex: number;
  chapterId?: string;
  role?: ChapterRole;
}

/**
 * True when this chapter is the pricing chapter.
 *
 * The test is whether the chapter carries IDENTITY, not whether it
 * carries a role. A chapter with a chapterId came from a set that
 * assigns roles, so its role — including having none — is authoritative
 * and its position is irrelevant. Only a chapter with no identity at
 * all is read by position, and then only against the original IT set.
 *
 * WHY THAT DISTINCTION MATTERS, found by this delivery's own proof:
 * an earlier version of this function fell back to the index whenever
 * the role was absent. That looked equivalent and was not. A chapter in
 * a new sector set with no role — Contract Terms, say — that happened
 * to land at position 16 would have been treated as the pricing
 * chapter, and the assembler would have replaced its body with a
 * pricing table. That is precisely the failure this chunk exists to
 * make impossible, reintroduced by the compatibility shim meant to
 * prevent it.
 */
export function isPricingChapter(chapter: ChapterIdentity | null | undefined): boolean {
  if (!chapter) return false;
  if (chapter.chapterId) return chapter.role === "pricing";
  return chapter.slotIndex === LEGACY_IT_PRICING_SLOT_INDEX;
}

/**
 * True when the chapter predates chapter identity and is being read
 * through the legacy fallback. Useful for diagnostics and for Chunk 4,
 * which stamps saved states with the set that produced them.
 */
export function isLegacyChapter(chapter: ChapterIdentity | null | undefined): boolean {
  return !!chapter && !chapter.chapterId;
}
