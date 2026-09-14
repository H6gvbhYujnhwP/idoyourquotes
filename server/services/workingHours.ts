/**
 * Working hours — single source of truth.
 *
 * Delivery 2.10 (14 Sep 2026). The organisation's working hours live in
 * Settings → Working Hours (organizations.default_working_hours_start /
 * _end / default_working_days). Before this delivery they reached
 * exactly one surface: the quote draft prompt, which wrote them into the
 * quote's site data, which the Standard Quote PDF then printed. Every
 * other surface either invented hours or had them typed in by hand:
 *
 *   - the branded proposal engine was never given them at all, so the
 *     SLA chapter guessed ("Mon-Fri 9am-5pm" on a service contracted
 *     8:30am-5:30pm);
 *   - the contract clauses had the hours written into the seed text,
 *     with Gold saying 9am-5pm and Silver 8:30am-5:30pm — so the terms
 *     could contradict the narrative inside one signed document;
 *   - the Word export never mentioned them.
 *
 * Everything now formats through here.
 *
 * NO FALLBACK, deliberately. The old default was 08:00-16:30, a
 * leftover from the product's trades origin. Printing a plausible but
 * wrong figure on a contract is worse than printing nothing, so an
 * organisation that hasn't set its hours gets null and each surface
 * omits the sentence.
 */

/** Shape we read. Accepts the Organization row or anything like it. */
interface WorkingHoursSource {
  defaultWorkingHoursStart?: string | null;
  defaultWorkingHoursEnd?: string | null;
  defaultWorkingDays?: string | null;
}

export interface WorkingHours {
  /** "08:30" — as stored, 24-hour. */
  start: string;
  /** "17:30" — as stored, 24-hour. */
  end: string;
  /** "Monday to Friday" — free text, as the user typed it. */
  days: string;
}

/**
 * "08:30" → "8:30am", "17:30" → "5:30pm", "12:00" → "12pm",
 * "09:00" → "9am". Minutes are dropped when they're zero, which is how
 * people write opening hours. Anything unparseable comes back
 * unchanged rather than throwing — a render must never die on a
 * malformed settings value.
 */
export function formatTime12h(value: string): string {
  const m = /^\s*(\d{1,2}):(\d{2})\s*$/.exec(value ?? "");
  if (!m) return (value ?? "").trim();
  const h24 = parseInt(m[1], 10);
  const mins = parseInt(m[2], 10);
  if (!Number.isFinite(h24) || h24 > 23 || !Number.isFinite(mins) || mins > 59) {
    return value.trim();
  }
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return mins === 0 ? `${h12}${suffix}` : `${h12}:${String(mins).padStart(2, "0")}${suffix}`;
}

/**
 * The organisation's hours, or null when either end is unset. Both ends
 * are required: "8:30am to (blank)" is worse than silence.
 */
export function getWorkingHours(
  org: WorkingHoursSource | null | undefined,
): WorkingHours | null {
  if (!org) return null;
  const start = (org.defaultWorkingHoursStart ?? "").trim();
  const end = (org.defaultWorkingHoursEnd ?? "").trim();
  if (!start || !end) return null;
  return {
    start,
    end,
    days: (org.defaultWorkingDays ?? "").trim() || "Monday to Friday",
  };
}

/**
 * One sentence fragment for prose and contract clauses:
 * "Monday to Friday, 8:30am-5:30pm". Null when hours aren't set.
 */
export function formatWorkingHours(
  org: WorkingHoursSource | null | undefined,
): string | null {
  const wh = getWorkingHours(org);
  if (!wh) return null;
  return `${wh.days}, ${formatTime12h(wh.start)}-${formatTime12h(wh.end)}`;
}

/**
 * Label form for a two-column detail row on a document:
 * "8:30am-5:30pm (Monday to Friday)".
 */
export function formatWorkingHoursLabel(
  org: WorkingHoursSource | null | undefined,
): string | null {
  const wh = getWorkingHours(org);
  if (!wh) return null;
  return `${formatTime12h(wh.start)}-${formatTime12h(wh.end)} (${wh.days})`;
}
