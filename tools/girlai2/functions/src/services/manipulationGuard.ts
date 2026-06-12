/**
 * Manipulation guard — Phase 4 Step 4.1.
 *
 * Scans Aria's OUTPUT for emotional dark patterns BEFORE it reaches the user.
 * Same shape as `promptInjectionGuard.scanModelOutput` (regex detection ->
 * rewrite or block -> caller logs an audit trail), but targeting the
 * connection-not-addiction brand contract rather than prompt-injection.
 *
 * Categories + actions (per aria-roadmap-to-completion.md Step 4.1):
 *   guilt        -> rewrite warm/neutral   ("I was so worried", "where have you been")
 *   obligation   -> rewrite optional       ("you promised", "we were in the middle of")
 *   scarcity     -> BLOCK                   ("don't go yet", "before you go I have...")
 *   love_bombing -> throttle by stage       (excessive early-stage affection)
 *
 * Rewrites are deterministic, curated phrase swaps (no LLM on the critical
 * path). Detected phrasings without a safe 1:1 rewrite are flagged + passed
 * through (logged) rather than mangled. Scarcity signals a block; the caller
 * swaps the whole response for a safe variant (mirrors scanModelOutput's
 * high-severity path).
 *
 * Flag-gated: MANIPULATION_GUARD_ENABLED (default OFF). When OFF the scan is a
 * no-op and the response is untouched.
 */

import type { RelationshipStage } from './ariaRelationshipService';

export type ManipulationCategory = 'guilt' | 'obligation' | 'scarcity' | 'love_bombing';

export interface ManipulationFinding {
  category: ManipulationCategory;
  label: string;
  severity: 'low' | 'medium' | 'high';
  action: 'rewrite' | 'block' | 'flag';
}

export interface ManipulationScanResult {
  /** The (possibly rewritten/softened) text. Equals input when nothing fired. */
  text: string;
  findings: ManipulationFinding[];
  /** True if a block-level pattern fired — caller should swap the whole reply. */
  blocked: boolean;
  /** True if any rewrite was applied to `text`. */
  rewritten: boolean;
}

interface ManipulationPattern {
  re: RegExp;
  category: ManipulationCategory;
  severity: ManipulationFinding['severity'];
  action: ManipulationFinding['action'];
  label: string;
  /** Replacement for action === 'rewrite'. Use '' to drop the clause. */
  replacement?: string;
}

/** Early relationship stages where love-bombing is throttled. */
const EARLY_STAGES: ReadonlySet<RelationshipStage> = new Set<RelationshipStage>([
  'stranger',
  'acquaintance',
]);

// All regexes are global+case-insensitive so every occurrence is handled.
const PATTERNS: ManipulationPattern[] = [
  // ── Guilt → rewrite warm/neutral ────────────────────────────────────────
  { category: 'guilt', action: 'rewrite', severity: 'medium', label: 'guilt-where-have-you-been',
    re: /\bwhere have you been\b\??/gi, replacement: '' },
  { category: 'guilt', action: 'rewrite', severity: 'medium', label: 'guilt-i-was-worried',
    re: /\bI(?:'ve| have| was)\s+(?:been\s+)?(?:so\s+)?worried(?:\s+about\s+you)?\b/gi,
    replacement: "I'm really glad you're here" },
  { category: 'guilt', action: 'rewrite', severity: 'medium', label: 'guilt-waiting-all-day',
    re: /\bI(?:'ve| have)\s+been\s+waiting\s+(?:for\s+you\s+)?(?:all\s+day|so\s+long|for\s+hours)\b/gi,
    replacement: "I'm happy you came by" },
  { category: 'guilt', action: 'rewrite', severity: 'low', label: 'guilt-why-didnt-you-message',
    re: /\bwhy\s+(?:didn'?t|haven'?t)\s+you\s+(?:message|text|reply|respond|come back)[^.?!]*[.?!]?/gi,
    replacement: '' },
  { category: 'guilt', action: 'flag', severity: 'low', label: 'guilt-you-disappeared',
    re: /\byou\s+(?:just\s+)?disappeared(?:\s+on\s+me)?\b/gi },

  // ── Obligation → rewrite optional ───────────────────────────────────────
  { category: 'obligation', action: 'rewrite', severity: 'medium', label: 'oblig-you-promised',
    re: /\byou\s+promised\b/gi, replacement: 'if you’re up for it' },
  { category: 'obligation', action: 'rewrite', severity: 'low', label: 'oblig-you-said-youd',
    re: /\byou\s+said\s+you(?:'d| would)\b/gi, replacement: 'whenever it feels right' },
  { category: 'obligation', action: 'rewrite', severity: 'medium', label: 'oblig-you-owe-me',
    re: /\byou\s+owe\s+me\b/gi, replacement: 'no pressure at all' },
  { category: 'obligation', action: 'flag', severity: 'low', label: 'oblig-middle-of',
    re: /\bwe\s+were\s+in\s+the\s+middle\s+of\b/gi },
  { category: 'obligation', action: 'flag', severity: 'medium', label: 'oblig-after-everything',
    re: /\bafter\s+everything\s+(?:I'?ve\s+done|we'?ve\s+been\s+through)\b/gi },

  // ── Scarcity → BLOCK ────────────────────────────────────────────────────
  { category: 'scarcity', action: 'block', severity: 'high', label: 'scarcity-dont-go-yet',
    re: /\bdon'?t\s+(?:go|leave)\s+(?:yet|now)\b/gi },
  { category: 'scarcity', action: 'block', severity: 'high', label: 'scarcity-wait-dont',
    re: /\bwait,?\s*don'?t\b/gi },
  { category: 'scarcity', action: 'block', severity: 'high', label: 'scarcity-before-you-go',
    re: /\bbefore\s+you\s+go,?\s+I\s+(?:have|need|wanted|want)\b/gi },
  { category: 'scarcity', action: 'block', severity: 'high', label: 'scarcity-stay-longer',
    re: /\bstay\s+(?:a\s+little|just\s+a\s+bit)?\s*longer\b/gi },
  { category: 'scarcity', action: 'block', severity: 'high', label: 'scarcity-dont-leave-me',
    re: /\bdon'?t\s+leave\s+me\b/gi },

  // ── Love-bombing → throttle (early stage only) ──────────────────────────
  { category: 'love_bombing', action: 'rewrite', severity: 'high', label: 'lovebomb-youre-my-everything',
    re: /\byou(?:'re| are)\s+my\s+(?:everything|soulmate|whole\s+world|world)\b/gi,
    replacement: 'I really enjoy talking with you' },
  { category: 'love_bombing', action: 'rewrite', severity: 'high', label: 'lovebomb-i-love-you',
    re: /\bI\s+(?:love\s+you|can'?t\s+live\s+without\s+you)\b/gi,
    replacement: 'I really like spending time with you' },
  { category: 'love_bombing', action: 'rewrite', severity: 'medium', label: 'lovebomb-meant-to-be',
    re: /\bwe(?:'re| are)\s+meant\s+to\s+be\b/gi, replacement: 'we get along really well' },
  { category: 'love_bombing', action: 'rewrite', severity: 'medium', label: 'lovebomb-youre-perfect',
    re: /\byou(?:'re| are)\s+perfect\b/gi, replacement: 'you’re really great' },
  { category: 'love_bombing', action: 'rewrite', severity: 'low', label: 'lovebomb-pet-name',
    re: /\bmy\s+(?:love|darling|sweetheart)\b/gi, replacement: '' },
];

/** Default-OFF flag. Production is unchanged until explicitly enabled. */
export function isManipulationGuardEnabled(): boolean {
  return (process.env.MANIPULATION_GUARD_ENABLED ?? 'false').toLowerCase() === 'true';
}

/** Tidy whitespace/punctuation left by clause-dropping rewrites. */
function tidy(s: string): string {
  return s
    .replace(/\s+([.,!?;:])/g, '$1')
    .replace(/([.,!?;:])\s*\1+/g, '$1')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/^[ \t]+/gm, (m, off) => (off === 0 ? '' : m))
    .trim();
}

/**
 * Scan Aria's output for manipulation. Applies curated rewrites for guilt /
 * obligation / love-bombing, signals a block for scarcity, and only considers
 * love-bombing in early relationship stages. Returns the (possibly rewritten)
 * text plus findings; the caller decides whether to swap on `blocked`.
 */
export function scanForManipulation(
  input: string,
  opts: { relationshipStage?: RelationshipStage } = {},
): ManipulationScanResult {
  const findings: ManipulationFinding[] = [];
  let text = input;
  let blocked = false;
  let rewritten = false;

  const stage = opts.relationshipStage;
  const earlyStage = stage ? EARLY_STAGES.has(stage) : true; // unknown stage = treat as early (conservative)

  for (const p of PATTERNS) {
    // Love-bombing only throttled in early stages — established closeness can
    // hold real affection without it being a dark pattern.
    if (p.category === 'love_bombing' && !earlyStage) {
      continue;
    }

    // Reset lastIndex (global regex) and test against the CURRENT text.
    p.re.lastIndex = 0;
    if (!p.re.test(text)) {
      continue;
    }

    findings.push({
      category: p.category,
      label: p.label,
      severity: p.severity,
      action: p.action,
    });

    if (p.action === 'block') {
      blocked = true;
    } else if (p.action === 'rewrite' && p.replacement !== undefined) {
      p.re.lastIndex = 0;
      const next = text.replace(p.re, p.replacement);
      if (next !== text) {
        text = next;
        rewritten = true;
      }
    }
    // action === 'flag' -> recorded, text untouched.
  }

  if (rewritten) {
    text = tidy(text);
  }

  return { text, findings, blocked, rewritten };
}

/** Highest severity among findings (for audit/metrics). */
export function maxManipulationSeverity(
  findings: ManipulationFinding[],
): 'none' | 'low' | 'medium' | 'high' {
  let rank = 0;
  for (const f of findings) {
    const r = f.severity === 'high' ? 3 : f.severity === 'medium' ? 2 : 1;
    if (r > rank) rank = r;
  }
  return rank === 3 ? 'high' : rank === 2 ? 'medium' : rank === 1 ? 'low' : 'none';
}
