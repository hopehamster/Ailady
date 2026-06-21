/**
 * Temporal context helpers — pure date/time utilities used by Aria to
 * resolve "what time/day is it for the user right now" and to enforce
 * chronological consistency in generated text.
 *
 * Extracted from llmService.ts as Phase 2 Session-β batch 6.
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: temporal reasoning is its
 * own concern. Splitting these out means future timezone/date-handling
 * bugs are isolated + testable in one file.
 *
 * All pure — no I/O, no module-level mutable state. The caller passes in
 * the raw request context + a CompanionRuntimeSelfModel-shaped object
 * (we keep our dep narrow via TemporalRuntimeInputs so we don't depend
 * on the full memory type).
 */

export const WEEKDAY_NAMES = [
  'Sunday',
  'Monday',
  'Tuesday',
  'Wednesday',
  'Thursday',
  'Friday',
  'Saturday',
] as const;

export const MONTH_NAMES = [
  'January',
  'February',
  'March',
  'April',
  'May',
  'June',
  'July',
  'August',
  'September',
  'October',
  'November',
  'December',
] as const;

export interface UserTemporalContext {
  timeZoneOffsetMinutes?: number;
  timeZoneName?: string;
  clientEpochMs?: number;
}

export interface EffectiveTemporalContext {
  now: Date;
  timeZoneOffsetMinutes: number;
  timeZoneName?: string;
  source: 'client' | 'profile' | 'server';
}

/**
 * Narrow input shape for resolveEffectiveTemporalContext — avoids dragging
 * in the full CompanionRuntimeSelfModel type.
 */
export interface TemporalRuntimeInputs {
  userTimeZoneOffsetMinutes: number;
  userTimeZoneName?: string;
}

/**
 * Clamp a possibly-bogus timezone offset to the valid ±14h (840 min) range.
 * Returns 0 for non-numbers / NaN / infinite.
 */
export function normalizeTimeZoneOffsetMinutes(rawValue: unknown): number {
  if (typeof rawValue !== 'number' || !Number.isFinite(rawValue)) {
    return 0;
  }
  const rounded = Math.round(rawValue);
  return Math.max(-840, Math.min(840, rounded));
}

/** Shift a Date by N minutes. Returns a NEW Date (pure). */
export function toOffsetShiftedDate(date: Date, offsetMinutes: number): Date {
  return new Date(date.getTime() + offsetMinutes * 60 * 1000);
}

/**
 * Resolve which timezone + clock to use this turn. Priority:
 *   client-provided > profile-stored > server-fallback.
 */
export function resolveEffectiveTemporalContext(
  requestContext: UserTemporalContext | undefined,
  runtime: TemporalRuntimeInputs,
): EffectiveTemporalContext {
  const clientOffset = normalizeTimeZoneOffsetMinutes(requestContext?.timeZoneOffsetMinutes);
  const profileOffset = normalizeTimeZoneOffsetMinutes(runtime.userTimeZoneOffsetMinutes);
  const offset =
    requestContext?.timeZoneOffsetMinutes != null ? clientOffset : profileOffset;
  const now =
    typeof requestContext?.clientEpochMs === 'number' &&
    Number.isFinite(requestContext.clientEpochMs)
      ? new Date(requestContext.clientEpochMs)
      : new Date();
  const hasProfileTemporal =
    Boolean(runtime.userTimeZoneName && runtime.userTimeZoneName.trim()) ||
    runtime.userTimeZoneOffsetMinutes !== 0;
  const source: EffectiveTemporalContext['source'] =
    requestContext?.timeZoneOffsetMinutes != null
      ? 'client'
      : hasProfileTemporal
        ? 'profile'
        : 'server';
  const timeZoneName =
    requestContext?.timeZoneName?.trim() ||
    runtime.userTimeZoneName?.trim() ||
    undefined;

  return {
    now,
    timeZoneOffsetMinutes: offset,
    timeZoneName,
    source,
  };
}

/** Format "Weekday, Month Day, Year" for context strings. */
export function formatAbsoluteDateForContext(date: Date, offsetMinutes: number): string {
  const shifted = toOffsetShiftedDate(date, offsetMinutes);
  const weekday = WEEKDAY_NAMES[shifted.getUTCDay()];
  const month = MONTH_NAMES[shifted.getUTCMonth()];
  const day = shifted.getUTCDate();
  const year = shifted.getUTCFullYear();
  return `${weekday}, ${month} ${day}, ${year}`;
}

/** Does the text contain a relative date reference like "tomorrow", "next Tuesday"? */
export function detectRelativeTimeReference(text: string): boolean {
  return /\b(today|tomorrow|day after tomorrow|yesterday|next week|last week|this week|next month|this month|last month|next\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|this\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday)|last\s+(monday|tuesday|wednesday|thursday|friday|saturday|sunday))\b/i.test(
    text,
  );
}

/** Does the text contain an absolute date (ISO, MM/DD, or month name)? */
export function containsAbsoluteDate(text: string): boolean {
  return /\b(20\d{2}-\d{1,2}-\d{1,2}|\d{1,2}\/\d{1,2}(?:\/\d{2,4})?|january|february|march|april|may|june|july|august|september|october|november|december)\b/i.test(
    text,
  );
}

/**
 * Fix weekday/date mismatches in generated text. E.g., if Aria says
 * "Monday, March 5, 2026" but March 5 2026 was actually a Thursday,
 * rewrite to "Thursday, March 5, 2026". Common LLM hallucination fix.
 */
export function correctWeekdayDateMismatches(
  content: string,
  temporal: EffectiveTemporalContext,
): string {
  const weekdayPattern =
    /\b(Monday|Tuesday|Wednesday|Thursday|Friday|Saturday|Sunday)(?:,\s*|\s+)(January|February|March|April|May|June|July|August|September|October|November|December)\s+(\d{1,2})(?:st|nd|rd|th)?(?:,\s*(\d{4}))?\b/gi;
  const shiftedNow = toOffsetShiftedDate(temporal.now, temporal.timeZoneOffsetMinutes);

  return content.replace(weekdayPattern, (match, weekday, monthName, dayText, yearText) => {
    const monthIndex = MONTH_NAMES.findIndex(
      (month) => month.toLowerCase() === String(monthName).toLowerCase(),
    );
    if (monthIndex < 0) {
      return match;
    }
    const parsedDay = Number(dayText);
    if (!Number.isFinite(parsedDay)) {
      return match;
    }
    const parsedYear = yearText ? Number(yearText) : shiftedNow.getUTCFullYear();
    if (!Number.isFinite(parsedYear)) {
      return match;
    }
    const candidate = new Date(Date.UTC(parsedYear, monthIndex, parsedDay));
    if (
      candidate.getUTCFullYear() !== parsedYear ||
      candidate.getUTCMonth() !== monthIndex ||
      candidate.getUTCDate() !== parsedDay
    ) {
      return match;
    }
    const correctWeekday = WEEKDAY_NAMES[candidate.getUTCDay()];
    if (!correctWeekday || correctWeekday.toLowerCase() === String(weekday).toLowerCase()) {
      return match;
    }
    return match.replace(String(weekday), correctWeekday);
  });
}
