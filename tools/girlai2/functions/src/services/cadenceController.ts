/**
 * Cadence controller — Phase 4 Step 4.2.
 *
 * Gates Aria's PROACTIVE (Aria-initiated) messages so reaching out stays warm
 * presence, never pressure. Pure decision function: given the proactive-message
 * history + current local time + recent initiation pattern, decide whether
 * Aria may reach out now. Enforces the connection-not-addiction contract — the
 * complement to the manipulation guard (4.1), which scans message CONTENT; this
 * gates message TIMING/FREQUENCY.
 *
 * Rules (per aria-roadmap-to-completion.md Step 4.2):
 *   - Max 2 proactive messages per rolling 24h
 *   - Min 6 hours between proactive messages
 *   - 48h cooldown after the user ignored a proactive message
 *   - 24h cooldown after the user closed the app without responding
 *   - Never proactively message after 10pm local time
 *   - If Aria initiated the last 3 conversations, stop initiating
 *
 * Flag-gated: CADENCE_CONTROLLER_ENABLED (default OFF). When OFF, callers should
 * skip the gate entirely (behavior unchanged). The decision function itself is
 * pure and always evaluable for testing.
 */

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

export const CADENCE_LIMITS = {
  maxPerDay: 2,
  minGapMs: 6 * HOUR_MS,
  ignoredCooldownMs: 48 * HOUR_MS,
  appCloseCooldownMs: 24 * HOUR_MS,
  /** Block proactive messages at or after this local hour (24h clock). */
  quietHourStartLocal: 22,
  /** Consecutive Aria-initiated conversations that trigger a stop. */
  maxConsecutiveAriaInitiations: 3,
} as const;

export interface CadenceState {
  /** Epoch ms "now". */
  now: number;
  /** Local = UTC + this offset, in minutes (e.g. -480 for PT). */
  timezoneOffsetMinutes: number;
  /** Epoch ms of past proactive (Aria-initiated) messages, any order. */
  proactiveSentAt: number[];
  /** Epoch ms a prior proactive message went ignored (no user response), or null. */
  lastProactiveIgnoredAt: number | null;
  /** Epoch ms the user last closed the app without responding to a proactive, or null. */
  lastAppCloseWithoutReplyAt: number | null;
  /** Who initiated recent conversations, oldest -> newest. */
  recentInitiators: Array<'aria' | 'user'>;
}

export type CadenceBlockReason =
  | 'ok'
  | 'quiet_hours'
  | 'min_gap'
  | 'daily_cap'
  | 'ignored_cooldown'
  | 'app_close_cooldown'
  | 'too_many_consecutive_initiations';

export interface CadenceDecision {
  allowed: boolean;
  reason: CadenceBlockReason;
  /** Human-readable detail for logs. */
  detail: string;
}

/** Default-OFF flag. Callers skip the gate entirely when OFF. */
export function isCadenceControllerEnabled(): boolean {
  return (process.env.CADENCE_CONTROLLER_ENABLED ?? 'false').toLowerCase() === 'true';
}

/** Local hour (0-23) from epoch ms + timezone offset minutes. */
export function localHour(now: number, timezoneOffsetMinutes: number): number {
  const local = new Date(now + timezoneOffsetMinutes * 60 * 1000);
  return local.getUTCHours();
}

/**
 * Decide whether Aria may send a proactive message right now. Pure — no I/O.
 * Returns the first failing rule (deny-on-first), or allowed when all pass.
 */
export function evaluateCadence(state: CadenceState): CadenceDecision {
  const { now } = state;

  // 1. Quiet hours — never after 10pm local.
  const hour = localHour(now, state.timezoneOffsetMinutes);
  if (hour >= CADENCE_LIMITS.quietHourStartLocal) {
    return {
      allowed: false,
      reason: 'quiet_hours',
      detail: `local hour ${hour} >= ${CADENCE_LIMITS.quietHourStartLocal}`,
    };
  }

  const sent = [...state.proactiveSentAt].sort((a, b) => a - b);
  const lastProactiveAt = sent.length > 0 ? sent[sent.length - 1] : null;

  // 2. Min gap between proactive messages.
  if (lastProactiveAt !== null && now - lastProactiveAt < CADENCE_LIMITS.minGapMs) {
    return {
      allowed: false,
      reason: 'min_gap',
      detail: `last proactive ${Math.round((now - lastProactiveAt) / HOUR_MS)}h ago < 6h`,
    };
  }

  // 3. Daily cap — rolling 24h window.
  const inLastDay = sent.filter((t) => now - t < DAY_MS).length;
  if (inLastDay >= CADENCE_LIMITS.maxPerDay) {
    return {
      allowed: false,
      reason: 'daily_cap',
      detail: `${inLastDay} proactive in last 24h >= ${CADENCE_LIMITS.maxPerDay}`,
    };
  }

  // 4. 48h cooldown after an ignored proactive message.
  if (
    state.lastProactiveIgnoredAt !== null &&
    now - state.lastProactiveIgnoredAt < CADENCE_LIMITS.ignoredCooldownMs
  ) {
    return {
      allowed: false,
      reason: 'ignored_cooldown',
      detail: `ignored ${Math.round((now - state.lastProactiveIgnoredAt) / HOUR_MS)}h ago < 48h`,
    };
  }

  // 5. 24h cooldown after the user closed the app without responding.
  if (
    state.lastAppCloseWithoutReplyAt !== null &&
    now - state.lastAppCloseWithoutReplyAt < CADENCE_LIMITS.appCloseCooldownMs
  ) {
    return {
      allowed: false,
      reason: 'app_close_cooldown',
      detail: `app-close-no-reply ${Math.round((now - state.lastAppCloseWithoutReplyAt) / HOUR_MS)}h ago < 24h`,
    };
  }

  // 6. Stop if Aria initiated the last N conversations.
  const tail = state.recentInitiators.slice(-CADENCE_LIMITS.maxConsecutiveAriaInitiations);
  if (
    tail.length >= CADENCE_LIMITS.maxConsecutiveAriaInitiations &&
    tail.every((who) => who === 'aria')
  ) {
    return {
      allowed: false,
      reason: 'too_many_consecutive_initiations',
      detail: `Aria initiated the last ${CADENCE_LIMITS.maxConsecutiveAriaInitiations} conversations`,
    };
  }

  return { allowed: true, reason: 'ok', detail: 'all cadence rules pass' };
}
