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

test('WEEKDAY_NAMES + MONTH_NAMES are 7 and 12', () => {
  assert.equal(WEEKDAY_NAMES.length, 7);
  assert.equal(MONTH_NAMES.length, 12);
});

// ── normalizeTimeZoneOffsetMinutes ─────────────────────────────────
test('normalize: in-range pass through', () => {
  assert.equal(normalizeTimeZoneOffsetMinutes(-300), -300); // PDT
  assert.equal(normalizeTimeZoneOffsetMinutes(330), 330);   // IST
});
test('normalize: clamps to ±840', () => {
  assert.equal(normalizeTimeZoneOffsetMinutes(2000), 840);
  assert.equal(normalizeTimeZoneOffsetMinutes(-2000), -840);
});
test('normalize: falls back to 0 on non-numbers', () => {
  assert.equal(normalizeTimeZoneOffsetMinutes('x'), 0);
  assert.equal(normalizeTimeZoneOffsetMinutes(NaN), 0);
  assert.equal(normalizeTimeZoneOffsetMinutes(Infinity), 0);
  assert.equal(normalizeTimeZoneOffsetMinutes(undefined), 0);
});

// ── toOffsetShiftedDate ────────────────────────────────────────────
test('toOffsetShiftedDate: shifts by minutes', () => {
  const base = new Date('2026-05-25T12:00:00Z');
  const shifted = toOffsetShiftedDate(base, 60);
  assert.equal(shifted.getTime() - base.getTime(), 60 * 60 * 1000);
});

// ── resolveEffectiveTemporalContext ────────────────────────────────
test('resolve: client-provided wins over profile', () => {
  const r = resolveEffectiveTemporalContext(
    { timeZoneOffsetMinutes: -300, timeZoneName: 'America/Denver' },
    { userTimeZoneOffsetMinutes: -480, userTimeZoneName: 'America/Los_Angeles' },
  );
  assert.equal(r.timeZoneOffsetMinutes, -300);
  assert.equal(r.source, 'client');
});
test('resolve: profile used when client absent', () => {
  const r = resolveEffectiveTemporalContext(
    {},
    { userTimeZoneOffsetMinutes: -480, userTimeZoneName: 'America/Los_Angeles' },
  );
  assert.equal(r.timeZoneOffsetMinutes, -480);
  assert.equal(r.source, 'profile');
});
test('resolve: server fallback when both absent', () => {
  const r = resolveEffectiveTemporalContext(undefined, {
    userTimeZoneOffsetMinutes: 0,
  });
  assert.equal(r.timeZoneOffsetMinutes, 0);
  assert.equal(r.source, 'server');
});

// ── formatAbsoluteDateForContext ───────────────────────────────────
test('formatAbsoluteDateForContext: UTC May 25 2026 (Monday)', () => {
  const d = new Date('2026-05-25T12:00:00Z');
  const formatted = formatAbsoluteDateForContext(d, 0);
  assert.ok(formatted.startsWith('Monday'));
  assert.ok(formatted.includes('May 25, 2026'));
});

// ── detectRelativeTimeReference ────────────────────────────────────
test('detectRelativeTimeReference: positive cases fire', () => {
  assert.equal(detectRelativeTimeReference('tomorrow at 3pm'), true);
  assert.equal(detectRelativeTimeReference('next Tuesday'), true);
  assert.equal(detectRelativeTimeReference('this week'), true);
  assert.equal(detectRelativeTimeReference('last month'), true);
});
test('detectRelativeTimeReference: neutral text does not fire', () => {
  assert.equal(detectRelativeTimeReference('hello there'), false);
});

// ── containsAbsoluteDate ───────────────────────────────────────────
test('containsAbsoluteDate: ISO + slash + month-name formats fire', () => {
  assert.equal(containsAbsoluteDate('on 2026-05-25 we met'), true);
  assert.equal(containsAbsoluteDate('5/25 was the day'), true);
  assert.equal(containsAbsoluteDate('back in march'), true);
});
test('containsAbsoluteDate: no date does not fire', () => {
  assert.equal(containsAbsoluteDate('plain message'), false);
});

// ── correctWeekdayDateMismatches ───────────────────────────────────
test('correctWeekdayDateMismatches: wrong weekday gets fixed', () => {
  // May 25, 2026 is actually a Monday. If the LLM said "Friday, May 25, 2026"
  // the helper should swap "Friday" for "Monday".
  const temporal = {
    now: new Date('2026-05-25T12:00:00Z'),
    timeZoneOffsetMinutes: 0,
    source: 'server',
  };
  const result = correctWeekdayDateMismatches(
    'I think Friday, May 25, 2026 works for you.',
    temporal,
  );
  assert.ok(result.includes('Monday'));
  assert.ok(!result.includes('Friday'));
});
test('correctWeekdayDateMismatches: matching weekday is preserved', () => {
  const temporal = {
    now: new Date('2026-05-25T12:00:00Z'),
    timeZoneOffsetMinutes: 0,
    source: 'server',
  };
  const result = correctWeekdayDateMismatches(
    'On Monday, May 25, 2026 we will meet.',
    temporal,
  );
  assert.ok(result.includes('Monday'));
});
