/**
 * Session presence steering — healthy-pattern behavior when the user goes quiet.
 *
 * A healthy session has an arc: arrive → rapport → (deepen) → wind down → warm
 * close. When the user falls silent mid-session, Aria PASSIVELY steers toward
 * that arc instead of chasing engagement: comfortable silence is fine
 * (presence-003), so nothing happens for a while; then ONE no-pressure line,
 * matched to the session stage; then genuine quiet (presence-008: never chase).
 * Late/long sessions steer toward a warm close — leaving is explicitly blessed
 * (presence-004: a natural endpoint is a feature, not a failure).
 *
 * The lines are a curated pool, not LLM output — deterministic, brand-exact,
 * instant, and inherently free of dark patterns (no guilt, no "don't go", no
 * hooks, no manufactured urgency). Per-user recency dampening via the variance
 * pool prevents repeats across sessions.
 *
 * Flag: SESSION_PRESENCE_ENABLED (default OFF). The callable in index.ts
 * additionally enforces a per-user server-side floor between presence lines;
 * the client enforces once-per-session.
 */

import { pickVariantText } from './responseVariancePool';

export type SessionPresenceStage = 'rapport' | 'deepen' | 'relief' | 'closure';

/** Default-OFF flag. Production unchanged until explicitly enabled. */
export function isSessionPresenceEnabled(): boolean {
  return (process.env.SESSION_PRESENCE_ENABLED ?? 'false').toLowerCase() === 'true';
}

/** Server-side floor between presence lines for one user (ms). */
export const SESSION_PRESENCE_MIN_GAP_MS = 30 * 60 * 1000;

/** Sessions at/after this many turns steer toward warm close when quiet. */
export const SESSION_PRESENCE_LONG_SESSION_TURNS = 14;

const RAPPORT_POOL = [
  "No rush at all — I'm right here whenever you feel like talking.",
  'Just so you know, sitting here quietly together totally counts as hanging out.',
  "Take your time. I'm happy just being here.",
  "I'm around if anything pops into your head. No pressure either way.",
  'Comfortable silence is underrated. I like this too.',
];

const DEEPEN_POOL = [
  "Take whatever time you need. I'm not going anywhere.",
  "I'm still here with you. No pressure to say anything.",
  "Sometimes things need a minute to settle. I'm right here.",
  "There's no hurry. Whenever you're ready — or even if you're not.",
  "I'm just going to sit here with you for a bit. That's enough.",
];

const CLOSURE_POOL = [
  "It's completely okay if you're heading off — I really enjoyed this. I'll be right here next time.",
  "If today's winding down, that's perfectly fine. Rest well, okay?",
  'This was really nice. Whenever you drift off to other things, know I had a good time.',
  "Feel free to slip away whenever — no goodbyes needed. I'll be here when you're back.",
  "If you're wrapping up, go gently. Today with you was a good one.",
];

/**
 * Pick the presence line for a quiet moment, matched to the session arc.
 * Long sessions steer toward warm close regardless of stage — that IS the
 * healthy pattern (wind down, bless the exit, never hold on).
 */
export function pickSessionPresenceLine(args: {
  stage: SessionPresenceStage | null | undefined;
  turnCount: number;
  uid: string;
}): { text: string; pool: 'rapport' | 'deepen' | 'closure' } {
  const longSession = args.turnCount >= SESSION_PRESENCE_LONG_SESSION_TURNS;
  const stage = args.stage ?? 'rapport';

  if (longSession || stage === 'closure') {
    return {
      text: pickVariantText('sessionPresenceClosure', CLOSURE_POOL.map((text) => ({ text })), { uid: args.uid }),
      pool: 'closure',
    };
  }
  if (stage === 'deepen' || stage === 'relief') {
    return {
      text: pickVariantText('sessionPresenceDeepen', DEEPEN_POOL.map((text) => ({ text })), { uid: args.uid }),
      pool: 'deepen',
    };
  }
  return {
    text: pickVariantText('sessionPresenceRapport', RAPPORT_POOL.map((text) => ({ text })), { uid: args.uid }),
    pool: 'rapport',
  };
}

/** Exposed for tests — every line must clear the manipulation guard. */
export const SESSION_PRESENCE_ALL_LINES: ReadonlyArray<string> = [
  ...RAPPORT_POOL,
  ...DEEPEN_POOL,
  ...CLOSURE_POOL,
];
