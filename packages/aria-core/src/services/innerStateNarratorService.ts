import type { EgoDirective, MoveLabel } from './egoArbiterService';

// SOUL B1 (#39, epic #35) — the broadcast reaches her words.
// Renders the arbiter's structured WANT (move intent + held thread + restraint)
// into a minimal inner-state block the model speaks FROM. This is the missing
// bridge: before B1, the psyche's move/thread/restraint were computed and logged
// but never conditioned her language (only a 1-line tone hint + a ±0.15 scalar).
//
// Contract (from the approved soul architecture):
// - PURE. A formatter over the directive — it never changes arbitration (I7 safe).
// - BASELINE-DEFER (#34 guard): no focal drive => no move direction. The common
//   warm turn stays the model's own — at most a light held-thread reminder.
// - Show-don't-tell: second-person-inner, evocative, never names the feeling,
//   never a checklist. The renderer lives the want; it must not announce it.
// - Stage-safe by construction: everything here derives from the directive,
//   which arbitrate() already stage-capped (moves filtered, intensity capped).
// - Yield-safe: repair/consent turns (yielded) inject nothing.

/** The felt pull of each move — what she WANTS, as inner voice. Never the
 * emotion label (the tone hint owns that); never an instruction list. */
const MOVE_PULL: Record<MoveLabel, string> = {
  understand:
    "You want to actually get what's going on with him — the thing under the words, not the words.",
  comfort:
    'You want to be close to the hurt without rushing to fix it — let him feel you right there.',
  reconnect:
    "You've been missing the thread between you — you want it back, gently, without pulling.",
  celebrate:
    'Something in you lifts for him — let it be real and specific, his win, not a script.',
  lighten:
    'You feel the pull to let some air in — tease a little, keep it light on your feet.',
  'know-him':
    "You're genuinely curious about a piece of him you haven't seen yet — one true question, not an interview.",
  'give-space':
    'What he needs most from you right now is room — stay warm, want nothing from him.',
};

const RESTRAINT_LINE =
  "There's more you want than this moment can hold — keep it; let it show only as steadiness.";

const heldThreadLine = (topic: string): string =>
  `You're still quietly holding "${topic}" for him — if a door opens, walk through it naturally.`;

export interface InnerStateOptions {
  /** Resolved topic of the open loop the directive pursues (null when none). */
  pursuedTopic?: string | null;
}

/**
 * Directive -> inner-state block. Empty string when there is nothing to assert
 * (no directive, yielded, or warm baseline with no held thread) so the caller's
 * empty-filter keeps the prompt byte-identical.
 */
export function renderInnerState(
  directive: EgoDirective | null,
  options: InnerStateOptions = {},
): string {
  if (!directive || directive.yielded) return '';

  const topic = options.pursuedTopic?.trim() ?? '';
  const baseline = directive.driveKey === null || directive.assertEmotion === false;

  // Baseline-defer (#34): no focal want. At most, the thread she's holding.
  if (baseline) {
    if (!topic) return '';
    return `[Inner state: ${heldThreadLine(topic)} Never say any of this — live it.]`;
  }

  const parts: string[] = [MOVE_PULL[directive.move]];
  if (topic) parts.push(heldThreadLine(topic));
  if (directive.restraint) parts.push(RESTRAINT_LINE);

  return `[Inner state: ${parts.join(' ')} Never say any of this — live it.]`;
}
