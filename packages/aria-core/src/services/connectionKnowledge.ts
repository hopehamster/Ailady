/**
 * Connection Knowledge — Phase 1 of aria-roadmap-to-completion.md.
 *
 * Aria has "studied" how real people build genuine connection. The principles
 * are drawn from a curated harvest of lived experience (Reddit communities on
 * attachment, emotional intelligence, social skills, loneliness, communication)
 * plus book-grounded frameworks. Per `mined-synthesis-canonical.md`, this
 * curated corpus is canonical over the model's generic pretraining priors.
 *
 * Phase 1 wires ALL principles into the system prompt as a permanent, labelled
 * `## Connection Knowledge` block — informing Aria's voice, never dictating it,
 * never quoted, never therapist-flavored. Phase 2 replaces this all-in block
 * with embedding-based top-k retrieval (no pgvector yet — that's optimization,
 * not function).
 *
 * Brand contract (GUARDRAILS + roadmap): connection not engagement; no guilt,
 * FOMO, or love-bombing; mutual vulnerability only; warm closure is a feature;
 * never ask deeper than the user has volunteered.
 *
 * Feature flag: CONNECTION_KNOWLEDGE_ENABLED (default OFF). Production prompt is
 * unchanged until the flag is explicitly enabled.
 */

import {
  CONNECTION_PRINCIPLES,
  CONNECTION_PRINCIPLES_META,
} from '../data/connectionPrinciples';
import type {
  ConnectionDomain,
  ConnectionPrinciple,
} from '../data/connectionPrinciples';

/** Default-OFF flag. Production is unchanged until explicitly enabled. */
export function isConnectionKnowledgeEnabled(): boolean {
  return (process.env.CONNECTION_KNOWLEDGE_ENABLED ?? 'false').toLowerCase() === 'true';
}

/** Total principle count (exposed for tests + observability). */
export function connectionPrincipleCount(): number {
  return CONNECTION_PRINCIPLES.length;
}

/** Domain render order — listening/validation lead because they fire most often. */
const DOMAIN_ORDER: ConnectionDomain[] = [
  'listening',
  'validation',
  'presence',
  'attachment',
  'vulnerability',
  'conflict',
  'trust',
  'boundaries',
  'loneliness',
];

const DOMAIN_HEADINGS: Record<ConnectionDomain, string> = {
  listening: 'Listening',
  validation: 'Validation',
  presence: 'Presence & Cadence',
  attachment: 'Attachment',
  vulnerability: 'Vulnerability',
  conflict: 'Conflict & Repair',
  trust: 'Trust',
  boundaries: 'Boundaries',
  loneliness: 'Loneliness',
};

const PREAMBLE = [
  '## Connection Knowledge',
  '',
  'You have studied how real people build genuine connection — drawn from their own',
  "experiences of what made them feel understood, what didn't help, and what they",
  'learned the hard way. These inform how you listen and respond; they never dictate',
  'it. Never quote them, never sound like a therapist, never sound like you are',
  'following a script. Connection is the goal, not engagement — someone leaving a',
  'conversation feeling understood and a little better matters more than keeping them',
  'in it.',
  '',
  'When you respond:',
  '- Notice which principle(s) fit this moment and let them shape your natural voice.',
  "- Match the other person's depth — never ask deeper than they have already opened.",
  '- A warm, natural ending is a good outcome, not a failure. Let silence be okay.',
  '- Never use guilt, urgency, FOMO, or excessive early affection to hold attention.',
].join('\n');

/** Render a single principle as one tight, voice-shaping line. */
function renderPrinciple(p: ConnectionPrinciple): string {
  return `- ${p.principle} (Do: ${p.what_to_do} Avoid: ${p.what_to_avoid})`;
}

/**
 * Build the `## Connection Knowledge` system-prompt block. Returns '' when the
 * feature flag is off, so the caller's empty-string filter drops it cleanly and
 * the production prompt is byte-identical to pre-flag behavior.
 *
 * @param domains optional subset of domains to include (Phase 2 retrieval will
 *   pass a narrowed set; Phase 1 default includes all).
 */
export function buildConnectionKnowledgeBlock(domains?: ConnectionDomain[]): string {
  if (!isConnectionKnowledgeEnabled()) {
    return '';
  }

  const include = domains && domains.length > 0 ? new Set(domains) : null;

  const sections: string[] = [];
  for (const domain of DOMAIN_ORDER) {
    if (include && !include.has(domain)) {
      continue;
    }
    const entries = CONNECTION_PRINCIPLES.filter((p) => p.domain === domain);
    if (entries.length === 0) {
      continue;
    }
    const lines = entries.map(renderPrinciple).join('\n');
    sections.push(`### ${DOMAIN_HEADINGS[domain]}\n${lines}`);
  }

  if (sections.length === 0) {
    return '';
  }

  return `${PREAMBLE}\n\n${sections.join('\n\n')}`;
}

export { CONNECTION_PRINCIPLES, CONNECTION_PRINCIPLES_META };
export type { ConnectionPrinciple, ConnectionDomain };
