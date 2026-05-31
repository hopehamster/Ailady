/**
 * Characterization snapshot tests for temporalContext.
 *
 * Purpose: lock in CURRENT behavior of WEEKDAY_NAMES/MONTH_NAMES exports,
 * normalizeTimeZoneOffsetMinutes, toOffsetShiftedDate,
 * resolveEffectiveTemporalContext, formatAbsoluteDateForContext,
 * detectRelativeTimeReference, containsAbsoluteDate, and
 * correctWeekdayDateMismatches.
 *
 * Locks subtle behaviors: clamp to ±840, rounding via Math.round, NaN/non-
 * number returning 0, IIFE source-determination logic, weekday correction
 * preserving original case via match.replace literal substitution.
 *
 * Captured: 2026-05-31 against lib/services/temporalContext.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  WEEKDAY_NAMES,
  MONTH_NAMES,
  normalizeTimeZoneOffsetMinutes,
  toOffsetShiftedDate,
  resolveEffectiveTemporalContext,
  formatAbsoluteDateForContext,
  detectRelativeTimeReference,
  containsAbsoluteDate,
  correctWeekdayDateMismatches,
} = require('../lib/services/temporalContext.js');

// ----------------------------------------------------------------------
// WEEKDAY_NAMES / MONTH_NAMES — array shape contract
// ----------------------------------------------------------------------
test('WEEKDAY_NAMES — length + endpoints', () => {
  assert.equal(WEEKDAY_NAMES.length, 7);
  assert.equal(WEEKDAY_NAMES[0], 'Sunday');
  assert.equal(WEEKDAY_NAMES[6], 'Saturday');
});

test('MONTH_NAMES — length + endpoints', () => {
  assert.equal(MONTH_NAMES.length, 12);
  assert.equal(MONTH_NAMES[0], 'January');
  assert.equal(MONTH_NAMES[11], 'December');
});

// ----------------------------------------------------------------------
// normalizeTimeZoneOffsetMinutes — clamp + rounding + non-number fallback
// ----------------------------------------------------------------------
test('normalizeTimeZoneOffsetMinutes — characterization snapshot', () => {
  const cases = [
    { input: 0, expected: 0 },
    { input: -300, expected: -300 },
    { input: 60, expected: 60 },
    // Math.round applied to fractional offsets
    { input: 90.7, expected: 91 },
    // Clamp upper bound
    { input: 1000, expected: 840 },
    // Clamp lower bound
    { input: -1500, expected: -840 },
    // Boundary values pass through
    { input: 840, expected: 840 },
    { input: -840, expected: -840 },
    // Non-finite / non-number → 0
    { input: NaN, expected: 0 },
    { input: Infinity, expected: 0 },
    { input: -Infinity, expected: 0 },
    { input: 'foo', expected: 0 },
    { input: null, expected: 0 },
    { input: undefined, expected: 0 },
    { input: {}, expected: 0 },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      normalizeTimeZoneOffsetMinutes(input),
      expected,
      `normalizeTimeZoneOffsetMinutes(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// toOffsetShiftedDate — pure math, returns new Date
// ----------------------------------------------------------------------
test('toOffsetShiftedDate — pure shift, new instance', () => {
  const base = new Date(Date.UTC(2026, 4, 26, 12, 0, 0));
  const baseMs = base.getTime();

  const plus60 = toOffsetShiftedDate(base, 60);
  assert.equal(plus60.getTime() - baseMs, 60 * 60 * 1000);
  assert.notEqual(plus60, base, 'returns a new Date instance');

  const minus300 = toOffsetShiftedDate(base, -300);
  assert.equal(minus300.getTime() - baseMs, -300 * 60 * 1000);

  // Base date is not mutated.
  assert.equal(base.getTime(), baseMs);
});

// ----------------------------------------------------------------------
// resolveEffectiveTemporalContext — client / profile / server selection
// ----------------------------------------------------------------------
test('resolveEffectiveTemporalContext — client wins when offset provided', () => {
  const ctx = resolveEffectiveTemporalContext(
    {
      timeZoneOffsetMinutes: -300,
      timeZoneName: 'America/New_York',
      clientEpochMs: 1700000000000,
    },
    { userTimeZoneOffsetMinutes: 60, userTimeZoneName: 'Europe/Berlin' },
  );
  assert.equal(ctx.timeZoneOffsetMinutes, -300);
  assert.equal(ctx.timeZoneName, 'America/New_York');
  assert.equal(ctx.source, 'client');
  assert.equal(ctx.now.getTime(), 1700000000000);
});

test('resolveEffectiveTemporalContext — profile fallback when no client offset', () => {
  const ctx = resolveEffectiveTemporalContext(undefined, {
    userTimeZoneOffsetMinutes: 60,
    userTimeZoneName: 'Europe/Berlin',
  });
  assert.equal(ctx.timeZoneOffsetMinutes, 60);
  assert.equal(ctx.timeZoneName, 'Europe/Berlin');
  assert.equal(ctx.source, 'profile');
});

test('resolveEffectiveTemporalContext — server fallback when no client + no profile info', () => {
  const ctx = resolveEffectiveTemporalContext(undefined, {
    userTimeZoneOffsetMinutes: 0,
  });
  assert.equal(ctx.timeZoneOffsetMinutes, 0);
  assert.equal(ctx.timeZoneName, undefined);
  assert.equal(ctx.source, 'server');
});

test('resolveEffectiveTemporalContext — zero offset with tzName counts as profile', () => {
  const ctx = resolveEffectiveTemporalContext(undefined, {
    userTimeZoneOffsetMinutes: 0,
    userTimeZoneName: 'UTC',
  });
  assert.equal(ctx.timeZoneOffsetMinutes, 0);
  assert.equal(ctx.timeZoneName, 'UTC');
  assert.equal(ctx.source, 'profile');
});

test('resolveEffectiveTemporalContext — client tzName without offset still falls to server source', () => {
  // requestContext.timeZoneOffsetMinutes is undefined → not "client" source,
  // but the tzName from the request still propagates into the result.
  const ctx = resolveEffectiveTemporalContext(
    { timeZoneName: 'America/Chicago' },
    { userTimeZoneOffsetMinutes: 0 },
  );
  assert.equal(ctx.timeZoneOffsetMinutes, 0);
  assert.equal(ctx.timeZoneName, 'America/Chicago');
  assert.equal(ctx.source, 'server');
});

// ----------------------------------------------------------------------
// formatAbsoluteDateForContext — known dates with known weekdays
// ----------------------------------------------------------------------
test('formatAbsoluteDateForContext — characterization snapshot', () => {
  // 2026-05-26 is a Tuesday
  assert.equal(
    formatAbsoluteDateForContext(new Date(Date.UTC(2026, 4, 26, 12, 0, 0)), 0),
    'Tuesday, May 26, 2026',
  );
  // 2026-01-01 is a Thursday
  assert.equal(
    formatAbsoluteDateForContext(new Date(Date.UTC(2026, 0, 1, 12, 0, 0)), 0),
    'Thursday, January 1, 2026',
  );
  // 2026-12-31 is a Thursday
  assert.equal(
    formatAbsoluteDateForContext(new Date(Date.UTC(2026, 11, 31, 12, 0, 0)), 0),
    'Thursday, December 31, 2026',
  );
  // Offset shift: 01:00 UTC on May 27 with -120 min offset → 23:00 UTC May 26 → Tuesday
  assert.equal(
    formatAbsoluteDateForContext(new Date(Date.UTC(2026, 4, 27, 1, 0, 0)), -120),
    'Tuesday, May 26, 2026',
  );
  // 2000-01-01 is a Saturday
  assert.equal(
    formatAbsoluteDateForContext(new Date(Date.UTC(2000, 0, 1, 12, 0, 0)), 0),
    'Saturday, January 1, 2000',
  );
});

// ----------------------------------------------------------------------
// detectRelativeTimeReference — positive + negative regex coverage
// ----------------------------------------------------------------------
test('detectRelativeTimeReference — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: 'see you tomorrow', expected: true },
    { input: 'TOMORROW', expected: true },
    { input: 'today is good', expected: true },
    { input: 'next week', expected: true },
    { input: 'last month', expected: true },
    { input: 'next Tuesday', expected: true },
    { input: 'this Saturday', expected: true },
    { input: 'last sunday', expected: true },
    { input: 'no time references here', expected: false },
    // Word boundary — "todayish" does NOT match \btoday\b inside a larger token
    { input: 'todayish maybe', expected: false },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      detectRelativeTimeReference(input),
      expected,
      `detectRelativeTimeReference(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// containsAbsoluteDate — ISO / MM/DD / month-name coverage
// ----------------------------------------------------------------------
test('containsAbsoluteDate — characterization snapshot', () => {
  const cases = [
    { input: '', expected: false },
    { input: '2026-05-26', expected: true },
    { input: '5/26', expected: true },
    { input: '5/26/2026', expected: true },
    { input: '5/26/26', expected: true },
    { input: 'May 26', expected: true },
    { input: 'January', expected: true },
    { input: 'december 31', expected: true },
    { input: 'I will see you sometime', expected: false },
    { input: 'meeting on 12/01/2024', expected: true },
  ];
  for (const { input, expected } of cases) {
    assert.equal(
      containsAbsoluteDate(input),
      expected,
      `containsAbsoluteDate(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// correctWeekdayDateMismatches — rewrites bad weekday, preserves good ones
// ----------------------------------------------------------------------
test('correctWeekdayDateMismatches — characterization snapshot', () => {
  // 2026-05-26 is a Tuesday; "now" is set there so year defaults to 2026.
  const temporal = {
    now: new Date(Date.UTC(2026, 4, 26, 12, 0, 0)),
    timeZoneOffsetMinutes: 0,
  };

  // 2026-03-05 is actually a Thursday — wrong "Monday" gets rewritten.
  assert.equal(
    correctWeekdayDateMismatches('See you Monday, March 5, 2026 at noon.', temporal),
    'See you Thursday, March 5, 2026 at noon.',
  );

  // Correct weekday — preserved verbatim.
  assert.equal(
    correctWeekdayDateMismatches('See you Thursday, March 5, 2026 at noon.', temporal),
    'See you Thursday, March 5, 2026 at noon.',
  );

  // No year supplied → falls back to shiftedNow year (2026). "Friday May 26" wrong;
  // May 26 2026 is Tuesday → rewrite.
  assert.equal(
    correctWeekdayDateMismatches('Friday, May 26 works.', temporal),
    'Tuesday, May 26 works.',
  );

  // No year + correct weekday — preserved.
  assert.equal(
    correctWeekdayDateMismatches('Tuesday, May 26 works.', temporal),
    'Tuesday, May 26 works.',
  );

  // Invalid calendar date (Feb 30) — Date roll-over makes candidate not match
  // parsed components → returns match unchanged.
  assert.equal(
    correctWeekdayDateMismatches(
      'Monday, February 30, 2026 is wrong.',
      temporal,
    ),
    'Monday, February 30, 2026 is wrong.',
  );

  // No date in text → passthrough.
  assert.equal(
    correctWeekdayDateMismatches('just regular text', temporal),
    'just regular text',
  );

  // Lowercase weekday + ordinal day — replace substitutes the
  // CORRECTLY-CAPITALIZED weekday literally for the original lowercase token.
  assert.equal(
    correctWeekdayDateMismatches('monday, march 5th, 2026 ok', temporal),
    'Thursday, march 5th, 2026 ok',
  );
});
