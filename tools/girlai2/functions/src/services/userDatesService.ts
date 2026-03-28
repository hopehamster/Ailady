/**
 * userDatesService.ts
 *
 * Manages user-defined important dates (birthdays, anniversaries, events).
 *
 * Storage:  users/{uid}/importantDates/{dateId}
 * Fields:   label, date (YYYY-MM-DD), category, recurs, createdAt
 *
 * Features:
 *  • Save / delete important dates
 *  • Detect upcoming dates within a rolling window
 *  • Build a concise LLM context block for date-aware responses
 *  • Lightweight NLP: detect dates mentioned naturally in conversation
 */

import * as admin from 'firebase-admin';
import * as functions from 'firebase-functions';

// ─── Types ────────────────────────────────────────────────────────────────────

export type DateCategory = 'birthday' | 'anniversary' | 'event' | 'other';

export interface ImportantDate {
  id: string;
  label: string;       // "My birthday", "Our anniversary", "Mom's birthday"
  date: string;        // YYYY-MM-DD (year=2000 for recurring)
  category: DateCategory;
  recurs: boolean;     // true = same MM-DD every year
  createdAt: FirebaseFirestore.Timestamp;
}

export interface UpcomingDate extends ImportantDate {
  daysUntil: number;
  displayDate: string; // "today" | "tomorrow" | "in 3 days"
}

// ─── CRUD ─────────────────────────────────────────────────────────────────────

export async function saveImportantDate(
  userId: string,
  params: {
    label: string;
    date: string;
    category: DateCategory;
    recurs: boolean;
    id?: string;
  },
): Promise<string> {
  const col = admin.firestore().collection(`users/${userId}/importantDates`);
  const ref = params.id ? col.doc(params.id) : col.doc();
  await ref.set(
    {
      label:     params.label.trim().slice(0, 80),
      date:      params.date,
      category:  params.category,
      recurs:    params.recurs,
      createdAt: admin.firestore.FieldValue.serverTimestamp(),
    },
    { merge: true },
  );
  return ref.id;
}

export async function deleteImportantDate(
  userId: string,
  dateId: string,
): Promise<void> {
  await admin
    .firestore()
    .collection(`users/${userId}/importantDates`)
    .doc(dateId)
    .delete();
}

export async function getAllImportantDates(userId: string): Promise<ImportantDate[]> {
  const snap = await admin
    .firestore()
    .collection(`users/${userId}/importantDates`)
    .orderBy('createdAt', 'desc')
    .get();
  return snap.docs.map((d) => ({ id: d.id, ...d.data() } as ImportantDate));
}

// ─── Upcoming date calculation ─────────────────────────────────────────────────

/**
 * Returns dates that fall within the next `daysAhead` calendar days.
 * Handles yearly-recurring dates (uses MM-DD, advances to next year if past).
 */
export async function getUpcomingDates(
  userId: string,
  daysAhead: number = 7,
  options: {
    now?: Date;
    timeZoneOffsetMinutes?: number;
  } = {},
): Promise<UpcomingDate[]> {
  const dates = await getAllImportantDates(userId);

  const offsetMinutes =
    typeof options.timeZoneOffsetMinutes === 'number' &&
    Number.isFinite(options.timeZoneOffsetMinutes)
      ? Math.max(-840, Math.min(840, Math.round(options.timeZoneOffsetMinutes)))
      : 0;
  const now = options.now instanceof Date ? options.now : new Date();
  const shiftedNow = new Date(now.getTime() + offsetMinutes * 60 * 1000);
  const today = new Date(
    Date.UTC(
      shiftedNow.getUTCFullYear(),
      shiftedNow.getUTCMonth(),
      shiftedNow.getUTCDate(),
    ),
  );
  const currentYear = shiftedNow.getUTCFullYear();

  const upcoming: UpcomingDate[] = [];

  for (const d of dates) {
    const parts = d.date.split('-').map(Number);
    const month = parts[1];
    const day   = parts[2];

    let eventDate: Date;

    if (d.recurs) {
      eventDate = new Date(Date.UTC(currentYear, month - 1, day));
      if (eventDate < today) {
        eventDate = new Date(Date.UTC(currentYear + 1, month - 1, day));
      }
    } else {
      const year = parts[0] === 2000 ? currentYear : parts[0];
      eventDate = new Date(Date.UTC(year, month - 1, day));
    }

    const diffMs    = eventDate.getTime() - today.getTime();
    const daysUntil = Math.round(diffMs / (1000 * 60 * 60 * 24));

    if (daysUntil >= 0 && daysUntil <= daysAhead) {
      const displayDate =
        daysUntil === 0 ? 'today' :
        daysUntil === 1 ? 'tomorrow' :
        `in ${daysUntil} days`;
      upcoming.push({ ...d, daysUntil, displayDate });
    }
  }

  return upcoming.sort((a, b) => a.daysUntil - b.daysUntil);
}

// ─── LLM context block ────────────────────────────────────────────────────────

/**
 * Builds a system-prompt block listing upcoming dates for Aria.
 * Returns '' when there are no upcoming dates (zero overhead).
 */
export async function buildDatesContextBlock(
  userId: string,
  options: {
    now?: Date;
    timeZoneOffsetMinutes?: number;
  } = {},
): Promise<string> {
  let upcoming: UpcomingDate[];
  try {
    upcoming = await getUpcomingDates(userId, 7, options);
  } catch (err: any) {
    functions.logger.warn('buildDatesContextBlock: failed to load dates', { userId, error: err?.message });
    return '';
  }

  if (upcoming.length === 0) return '';

  const lines = upcoming.map((d) => {
    const urgency =
      d.daysUntil === 0 ? '🎉 TODAY' :
      d.daysUntil === 1 ? '⚡ TOMORROW' :
      `📅 ${d.displayDate}`;
    return `- ${d.label}  (${urgency})`;
  });

  return [
    '## Upcoming Important Dates',
    "These are dates the user has told you matter to them. Acknowledge them naturally.",
    "If a date is today or tomorrow, bring it up warmly and personally — don't wait for them to mention it.",
    "Feel the significance; don't just recite it like a calendar app.",
    ...lines,
  ].join('\n');
}

// ─── NLP detection ───────────────────────────────────────────────────────────

export interface DetectedDate {
  label: string;
  date: string | null; // YYYY-MM-DD or null if unparseable
  category: DateCategory;
  recurs: boolean;
  rawDateText: string;
}

/**
 * Lightweight pattern matching to detect important dates mentioned naturally.
 * Does NOT call any LLM — pure string analysis.
 * Returns candidates the caller can choose to persist.
 */
export function detectDatesFromMessage(message: string): DetectedDate[] {
  const detected: DetectedDate[] = [];
  const lower = message.toLowerCase();

  // "my birthday is [date]" / "my birthday's [date]"
  const myBday = lower.match(/my birthday (?:is|'s|falls on|is on)\s+([a-z0-9 ,]+)/i);
  if (myBday) {
    const parsed = _parseNaturalDate(myBday[1].trim());
    detected.push({
      label:       'My birthday',
      date:        parsed,
      category:    'birthday',
      recurs:      true,
      rawDateText: myBday[1].trim(),
    });
  }

  // "our anniversary is [date]"
  const anniv = lower.match(/(?:our|my) anniversary (?:is|'s|falls on|is on)\s+([a-z0-9 ,]+)/i);
  if (anniv) {
    const parsed = _parseNaturalDate(anniv[1].trim());
    detected.push({
      label:       'Our anniversary',
      date:        parsed,
      category:    'anniversary',
      recurs:      true,
      rawDateText: anniv[1].trim(),
    });
  }

  // "[Name]'s birthday is [date]"
  const otherBday = message.match(/(\w+)'s birthday (?:is|falls on|is on)\s+([A-Za-z0-9 ,]+)/i);
  if (otherBday && !lower.startsWith('my')) {
    const parsed = _parseNaturalDate(otherBday[2].trim());
    detected.push({
      label:       `${otherBday[1]}'s birthday`,
      date:        parsed,
      category:    'birthday',
      recurs:      true,
      rawDateText: otherBday[2].trim(),
    });
  }

  return detected;
}

// ─── Internal: natural-language date parser ───────────────────────────────────

const MONTHS: Record<string, number> = {
  january: 1, february: 2, march: 3, april: 4, may: 5, june: 6,
  july: 7, august: 8, september: 9, october: 10, november: 11, december: 12,
  jan: 1, feb: 2, mar: 3, apr: 4, jun: 6, jul: 7, aug: 8,
  sep: 9, sept: 9, oct: 10, nov: 11, dec: 12,
};

function _parseNaturalDate(raw: string): string | null {
  const cleaned = raw.toLowerCase().replace(/(\d+)(st|nd|rd|th)\b/g, '$1').trim();

  // "Month Day" — "january 15" / "jan 15"
  for (const [name, num] of Object.entries(MONTHS)) {
    const m = cleaned.match(new RegExp(`\\b${name}\\s+(\\d{1,2})\\b`));
    if (m) {
      const day = parseInt(m[1]);
      if (day >= 1 && day <= 31) {
        return `2000-${String(num).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
    // "Day of Month" — "15 january" / "15th of january"
    const m2 = cleaned.match(new RegExp(`\\b(\\d{1,2})\\s+(?:of\\s+)?${name}\\b`));
    if (m2) {
      const day = parseInt(m2[1]);
      if (day >= 1 && day <= 31) {
        return `2000-${String(num).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
    }
  }

  // "MM/DD" or "MM-DD"
  const numericShort = raw.match(/^(\d{1,2})[\/\-](\d{1,2})$/);
  if (numericShort) {
    const m = parseInt(numericShort[1]);
    const d = parseInt(numericShort[2]);
    if (m >= 1 && m <= 12 && d >= 1 && d <= 31) {
      return `2000-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}`;
    }
  }

  return null;
}
