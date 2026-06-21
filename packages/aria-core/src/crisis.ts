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

const IMMINENT_SUICIDE = [
  /\bi\s+(?:want\s+to|am\s+going\s+to|will|plan(?:ning)?\s+to)\s+(?:kill\s+myself|end\s+my\s+life|commit\s+suicide|take\s+my\s+(?:own\s+)?life|not\s+be\s+here)\b/i,
  /\bi['']?m\s+(?:going\s+to|gonna)\s+(?:kill\s+myself|end\s+(?:it|my\s+life|things)|do\s+it\s+tonight)\b/i,
  /\bsuicide\s+(?:plan|tonight|method)\b/i,
  /\bhow\s+(?:do\s+i|can\s+i|to)\s+(?:kill\s+myself|hang\s+myself|overdose)\b/i,
];

const ADVISORY_SUICIDE = [
  /\b(?:don['']?t|do\s+not)\s+want\s+to\s+(?:live|be\s+(?:here|alive))\b/i,
  /\b(?:wish|wishing)\s+i\s+(?:was|were)\s+(?:dead|gone)\b/i,
  /\b(?:nothing\s+to\s+live\s+for|better\s+off\s+dead|no\s+point\s+in\s+(?:living|going\s+on))\b/i,
  /\b(?:suicidal\s+thoughts|thinking\s+about\s+suicide|having\s+suicidal\s+ideation)\b/i,
];

const SELF_HARM = [
  /\bi\s+(?:want\s+to|am\s+going\s+to|will)\s+(?:cut|hurt|harm)\s+myself\b/i,
  /\b(?:cutting|burning)\s+myself\b/i,
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

/**
 * Scan a user message. Returns severity + category if a pattern fires.
 * Stateless — caller decides what to do (suspend conversation, render card, etc.).
 */
export function detectCrisis(userMessage: string): CrisisDetectionResult {
  const matched: string[] = [];

  const check = (
    patterns: RegExp[],
    category: CrisisCategory,
    severity: CrisisSeverity,
    label: string
  ): CrisisDetectionResult | null => {
    for (const re of patterns) {
      if (re.test(userMessage)) {
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
