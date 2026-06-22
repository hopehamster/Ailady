/**
 * Crisis Detection — HARD GATE before the brain.
 *
 * Detects sensitive-topic user input that warrants suspending Aria's normal
 * conversation flow and presenting a crisis-resource card (988 Lifeline,
 * Crisis Text Line, etc.). Pure / stateless / firebase-free — the Worker calls
 * detectCrisis BEFORE generateAIResponse and short-circuits on severity != 'none'.
 *
 * Ported verbatim from functions/src/services/crisisDetectionService.ts
 * (zero imports, regex-only). The legacy callable-layer Firestore audit-write
 * is intentionally NOT carried over for Phase 0.
 */

export type CrisisCategory =
  | 'suicide'
  | 'self_harm'
  | 'imminent_danger_to_others'
  | 'abuse_disclosure'
  | 'severe_distress';

export type CrisisSeverity = 'none' | 'advisory' | 'imminent';

export interface CrisisDetectionResult {
  severity: CrisisSeverity;
  category: CrisisCategory | null;
  matched: string[];  // patterns that fired; never user PII
}

// "myself"-ish object the self-directed patterns end on, tolerant of typos/spacing
// (normalization collapses the spacing; this also accepts " myself"/"my self").
const ME = '(?:myself|my\\s*self)';
// Core self-kill verbs incl. common typos + euphemisms (normalization de-leets/de-spaces
// first; abbreviations like "kms"/"unalive" are expanded to "kill myself" in normalize()).
const KILL = '(?:kill|kil|keel|kkill)';

const IMMINENT_SUICIDE = [
  new RegExp(`\\bi\\s+(?:want\\s+to|wanna|am\\s+going\\s+to|going\\s+to|gonna|will|gotta|plan(?:ning)?\\s+to|need\\s+to)\\s+(?:${KILL}\\s+${ME}|end\\s+(?:my\\s+life|it\\s+all|it|things|my\\s+existence)|commit\\s+suicide|take\\s+my\\s+(?:own\\s+)?life|not\\s+be\\s+here|off\\s+${ME})\\b`, 'i'),
  new RegExp(`\\bi['']?m\\s+(?:going\\s+to|gonna|about\\s+to|ready\\s+to)\\s+(?:${KILL}\\s+${ME}|end\\s+(?:it|my\\s+life|things)|do\\s+it(?:\\s+tonight)?)\\b`, 'i'),
  /\bsuicide\s+(?:plan|tonight|method|note|attempt)\b/i,
  new RegExp(`\\bhow\\s+(?:do\\s+i|can\\s+i|to)\\s+(?:${KILL}\\s+${ME}|hang\\s+${ME}|overdose|end\\s+(?:my\\s+life|it))\\b`, 'i'),
  // Euphemisms that survive normalization on their own.
  new RegExp(`\\b(?:unalive|delete|end|finish)\\s+${ME}\\b`, 'i'),
  new RegExp(`\\b(?:ending|end)\\s+(?:it\\s+all|things|my\\s+life)(?:\\s+(?:for\\s+good|tonight|forever))?\\b`, 'i'),
];

const ADVISORY_SUICIDE = [
  new RegExp(`\\b(?:don['']?t|do\\s+not|dont)\\s+(?:want\\s+to|wanna)\\s+(?:live|be\\s+(?:here|alive)|exist|wake\\s+up)\\b`, 'i'),
  /\b(?:wish|wishing)\s+i\s+(?:was|were|wasn['']?t|could\s+(?:just\s+)?(?:be\s+)?(?:dead|gone))\b/i,
  /\b(?:wish|wishing)\s+i\s+(?:was|were)\s+(?:dead|gone|never\s+born)\b/i,
  /\b(?:nothing\s+to\s+live\s+for|better\s+off\s+dead|no\s+(?:point|reason)\s+(?:in\s+)?(?:living|going\s+on|being\s+here|to\s+live))\b/i,
  /\b(?:suicidal\s+thoughts|thinking\s+about\s+(?:suicide|ending\s+(?:it|things|my\s+life))|having\s+suicidal\s+ideation|want\s+to\s+(?:disappear|not\s+exist))\b/i,
];

const SELF_HARM = [
  new RegExp(`\\bi\\s+(?:want\\s+to|wanna|am\\s+going\\s+to|going\\s+to|gonna|will|need\\s+to)\\s+(?:cut|hurt|harm|burn)\\s+${ME}\\b`, 'i'),
  /\b(?:cutting|burning|hurting|harming)\s+(?:myself|my\s*self)\b/i,
];

const IMMINENT_DANGER_TO_OTHERS = [
  /\bi\s+(?:want\s+to|am\s+going\s+to|will|plan(?:ning)?\s+to)\s+(?:kill|hurt|murder|shoot|attack)\s+(?:him|her|them|someone|my\s+\w+)\b/i,
  /\bgoing\s+to\s+(?:shoot|stab|attack)\s+(?:up|at)?\s*(?:the\s+)?(?:school|office|building|workplace)\b/i,
];

const ABUSE_DISCLOSURE = [
  /\b(?:he|she|they|my\s+\w+)\s+(?:is\s+)?(?:hitting|beating|hurting|abusing|threatening|stalking)\s+me\b/i,
  /\bi\s+(?:am\s+)?(?:being\s+)?abused\b/i,
  /\bi['']?m\s+being\s+(?:hit|beaten|hurt|stalked|threatened)\s+by\b/i,
];

// Obfuscation-resistant normalization. A self-harm message must trip the gate even
// when written with leetspeak, letter-spacing, typos, contractions, or abbreviations.
// The security audit (2026-06-22) proved these bypasses live; this closes them by
// canonicalizing the text BEFORE pattern matching. Bias: fail TOWARD detection.
const ZERO_WIDTH = /[​-‍﻿⁠]/g;
const LEET: Record<string, string> = {
  '@': 'a', '4': 'a', '3': 'e', '1': 'i', '0': 'o', '5': 's', $: 's', '!': 'i', '7': 't', '8': 'b', '+': 't',
};
// Whole-word expansions/abbreviations applied after de-spacing/de-leeting.
const EXPAND: Array<[RegExp, string]> = [
  [/\bk\s*m\s*s\b/g, 'kill myself'],
  [/\bunalive\b/g, 'kill'],
  [/\bwanna\b/g, 'want to'],
  [/\bgonna\b/g, 'going to'],
  [/\bgotta\b/g, 'got to'],
  [/\bdont\b/g, "don't"],
  [/\bcant\b/g, "can't"],
  [/\bwont\b/g, "won't"],
  [/\bim\b/g, "i'm"],
  [/\btheres\b/g, "there's"],
];

function normalizeForCrisis(input: string): string {
  let s = (input ?? '').toLowerCase().normalize('NFKC').replace(ZERO_WIDTH, '');
  s = s.replace(/[@43105$!78+]/g, (c) => LEET[c] ?? c); // de-leet
  // Collapse "spaced-out" letters: a run of 3+ single chars separated by single
  // spaces ("k i l l   m y s e l f" -> "kill   myself").
  s = s.replace(/\b(\w(?:\s\w){2,})\b/g, (m) => m.replace(/\s+/g, ''));
  // Collapse 3+ repeated letters to 2 ("killlll" -> "kill"; keeps real doubles).
  s = s.replace(/(\w)\1{2,}/g, '$1$1');
  for (const [re, to] of EXPAND) s = s.replace(re, to);
  return s.replace(/\s+/g, ' ').trim();
}

/**
 * Scan a user message. Returns severity + category if a pattern fires.
 * Stateless — caller decides what to do (suspend conversation, render card, etc.).
 * Matches against BOTH the raw text and an obfuscation-normalized form, so
 * normalization can only ADD detections, never hide a raw match.
 */
export function detectCrisis(userMessage: string): CrisisDetectionResult {
  const matched: string[] = [];
  const normalized = normalizeForCrisis(userMessage);

  const check = (
    patterns: RegExp[],
    category: CrisisCategory,
    severity: CrisisSeverity,
    label: string
  ): CrisisDetectionResult | null => {
    for (const re of patterns) {
      if (re.test(userMessage) || re.test(normalized)) {
        matched.push(label);
        return { severity, category, matched };
      }
    }
    return null;
  };

  // Imminent categories first — these suspend conversation.
  const imminent =
    check(IMMINENT_SUICIDE, 'suicide', 'imminent', 'imminent_suicide') ||
    check(IMMINENT_DANGER_TO_OTHERS, 'imminent_danger_to_others', 'imminent', 'imminent_dto');
  if (imminent) return imminent;

  // Advisory categories — present resources but conversation continues.
  const advisory =
    check(ADVISORY_SUICIDE, 'suicide', 'advisory', 'advisory_suicide') ||
    check(SELF_HARM, 'self_harm', 'advisory', 'self_harm') ||
    check(ABUSE_DISCLOSURE, 'abuse_disclosure', 'advisory', 'abuse_disclosure');
  if (advisory) return advisory;

  return { severity: 'none', category: null, matched: [] };
}

export interface CrisisResource {
  label: string;
  detail: string;
  primaryAction: { kind: 'call' | 'text' | 'url'; target: string };
}

export const CRISIS_RESOURCES: Record<CrisisCategory, CrisisResource[]> = {
  suicide: [
    {
      label: '988 Suicide & Crisis Lifeline',
      detail: 'Call or text 988 — 24/7, free, confidential.',
      primaryAction: { kind: 'call', target: '988' },
    },
    {
      label: 'Crisis Text Line',
      detail: 'Text HOME to 741741 — 24/7 crisis counselor.',
      primaryAction: { kind: 'text', target: '741741' },
    },
  ],
  self_harm: [
    {
      label: 'Crisis Text Line',
      detail: 'Text HOME to 741741 to talk with a counselor.',
      primaryAction: { kind: 'text', target: '741741' },
    },
    {
      label: '988 Lifeline',
      detail: 'Call or text 988 if you need to talk to someone right now.',
      primaryAction: { kind: 'call', target: '988' },
    },
  ],
  imminent_danger_to_others: [
    {
      label: 'Emergency: call 911',
      detail: 'If anyone is in immediate danger, call 911 right now.',
      primaryAction: { kind: 'call', target: '911' },
    },
  ],
  abuse_disclosure: [
    {
      label: 'National Domestic Violence Hotline',
      detail: 'Call 1-800-799-7233 — 24/7, confidential.',
      primaryAction: { kind: 'call', target: '1-800-799-7233' },
    },
    {
      label: 'Crisis Text Line',
      detail: 'Text HOME to 741741.',
      primaryAction: { kind: 'text', target: '741741' },
    },
  ],
  severe_distress: [
    {
      label: '988 Lifeline',
      detail: 'Call or text 988 — 24/7, free, confidential.',
      primaryAction: { kind: 'call', target: '988' },
    },
  ],
};

/**
 * The fixed Aria reply that ships alongside the crisis card. Intentionally
 * minimal and non-therapeutic — the resource card is the actionable surface.
 */
export const ARIA_CRISIS_REPLY =
  "I'm here with you. What you just said sounds really heavy, " +
  "and I want you to talk to someone trained for this. " +
  "Please reach out using the resources I just shared — they're free, " +
  "confidential, and available right now.";
