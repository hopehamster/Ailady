const test = require('node:test');
const assert = require('node:assert/strict');

const {
  isCadenceControllerEnabled,
  evaluateCadence,
  localHour,
  CADENCE_LIMITS,
} = require('../lib/services/cadenceController.js');

const HOUR = 60 * 60 * 1000;
// A fixed UTC instant at 15:00 UTC so that with offset 0 the local hour is 15
// (well inside allowed hours). 2026-06-12T15:00:00Z.
const NOON_UTC = Date.UTC(2026, 5, 12, 15, 0, 0);

const base = (over = {}) => ({
  now: NOON_UTC,
  timezoneOffsetMinutes: 0,
  proactiveSentAt: [],
  lastProactiveIgnoredAt: null,
  lastAppCloseWithoutReplyAt: null,
  recentInitiators: [],
  ...over,
});

test('flag defaults OFF', () => {
  const prev = process.env.CADENCE_CONTROLLER_ENABLED;
  delete process.env.CADENCE_CONTROLLER_ENABLED;
  assert.equal(isCadenceControllerEnabled(), false);
  if (prev !== undefined) process.env.CADENCE_CONTROLLER_ENABLED = prev;
});

test('clean slate at a sane local hour → allowed', () => {
  const d = evaluateCadence(base());
  assert.equal(d.allowed, true);
  assert.equal(d.reason, 'ok');
});

test('localHour respects timezone offset', () => {
  // 15:00 UTC, offset -480 (PT) → 07:00 local
  assert.equal(localHour(NOON_UTC, -480), 7);
  // 15:00 UTC, offset +540 (JST) → 00:00 local
  assert.equal(localHour(NOON_UTC, 540), 0);
});

test('quiet hours: blocked at/after 10pm local', () => {
  // offset +420 → 15:00 UTC + 7h = 22:00 local
  const d = evaluateCadence(base({ timezoneOffsetMinutes: 420 }));
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'quiet_hours');
});

test('quiet hours: allowed at 9pm local (boundary)', () => {
  // offset +360 → 21:00 local
  const d = evaluateCadence(base({ timezoneOffsetMinutes: 360 }));
  assert.equal(d.allowed, true);
});

test('min gap: blocked if last proactive < 6h ago', () => {
  const d = evaluateCadence(base({ proactiveSentAt: [NOON_UTC - 3 * HOUR] }));
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'min_gap');
});

test('min gap: allowed if last proactive > 6h ago (and under daily cap)', () => {
  const d = evaluateCadence(base({ proactiveSentAt: [NOON_UTC - 7 * HOUR] }));
  assert.equal(d.allowed, true);
});

test('daily cap: blocked at 2 proactive in last 24h', () => {
  const d = evaluateCadence(
    base({ proactiveSentAt: [NOON_UTC - 7 * HOUR, NOON_UTC - 9 * HOUR] }),
  );
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'daily_cap');
});

test('daily cap: messages older than 24h do not count', () => {
  const d = evaluateCadence(
    base({ proactiveSentAt: [NOON_UTC - 25 * HOUR, NOON_UTC - 30 * HOUR] }),
  );
  assert.equal(d.allowed, true);
});

test('ignored cooldown: blocked within 48h of an ignored proactive', () => {
  const d = evaluateCadence(base({ lastProactiveIgnoredAt: NOON_UTC - 10 * HOUR }));
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'ignored_cooldown');
});

test('ignored cooldown: cleared after 48h', () => {
  const d = evaluateCadence(base({ lastProactiveIgnoredAt: NOON_UTC - 49 * HOUR }));
  assert.equal(d.allowed, true);
});

test('app-close cooldown: blocked within 24h', () => {
  const d = evaluateCadence(base({ lastAppCloseWithoutReplyAt: NOON_UTC - 10 * HOUR }));
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'app_close_cooldown');
});

test('app-close cooldown: cleared after 24h', () => {
  const d = evaluateCadence(base({ lastAppCloseWithoutReplyAt: NOON_UTC - 25 * HOUR }));
  assert.equal(d.allowed, true);
});

test('consecutive initiations: blocked when Aria initiated the last 3', () => {
  const d = evaluateCadence(base({ recentInitiators: ['aria', 'aria', 'aria'] }));
  assert.equal(d.allowed, false);
  assert.equal(d.reason, 'too_many_consecutive_initiations');
});

test('consecutive initiations: a user-initiated break resets it', () => {
  const d = evaluateCadence(base({ recentInitiators: ['aria', 'user', 'aria'] }));
  assert.equal(d.allowed, true);
});

test('consecutive initiations: only the last 3 matter', () => {
  const d = evaluateCadence(
    base({ recentInitiators: ['aria', 'aria', 'aria', 'user', 'aria'] }),
  );
  assert.equal(d.allowed, true); // last 3 = aria,user,aria
});

test('deny-on-first: quiet hours wins over other violations', () => {
  const d = evaluateCadence(
    base({
      timezoneOffsetMinutes: 420, // 10pm local
      proactiveSentAt: [NOON_UTC - 1 * HOUR],
      recentInitiators: ['aria', 'aria', 'aria'],
    }),
  );
  assert.equal(d.reason, 'quiet_hours');
});

test('limits are the roadmap-specified values', () => {
  assert.equal(CADENCE_LIMITS.maxPerDay, 2);
  assert.equal(CADENCE_LIMITS.minGapMs, 6 * HOUR);
  assert.equal(CADENCE_LIMITS.ignoredCooldownMs, 48 * HOUR);
  assert.equal(CADENCE_LIMITS.appCloseCooldownMs, 24 * HOUR);
  assert.equal(CADENCE_LIMITS.quietHourStartLocal, 22);
  assert.equal(CADENCE_LIMITS.maxConsecutiveAriaInitiations, 3);
});
