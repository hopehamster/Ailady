/**
 * Depth escalation gate — Phase 5 Step 5.1.
 *
 * Enforces "Aria never asks deeper than the user has volunteered." She matches
 * vulnerability depth but never exceeds it; deep questions require the user to
 * have opened that door first. She may offer her own vulnerability as an
 * INVITATION (a small margin beyond volunteered depth), but never demands
 * reciprocity by probing past where the user has gone.
 *
 * Mechanism: an overlay on the conversation-policy plan, applied BEFORE the
 * plan is used to allocate question budget / response length. It caps the
 * plan's intended `depth` to the user's volunteered depth + an invitation
 * margin, and downgrades a deep response / open (probing) question when capping
 * hard. It only ever caps — never escalates.
 *
 * Wired as an overlay in llmService (not in conversationPolicyService, which is
 * do-not-edit). Flag-gated: DEPTH_ESCALATION_GATE_ENABLED (default OFF). When
 * OFF the plan is untouched.
 */

import type {
  ConversationPolicyPlanSource,
} from './conversationPolicyService';

/** Aria may offer vulnerability slightly beyond what the user volunteered. */
export const INVITATION_MARGIN = 0.15;
/** Below this allowed depth, a 'deep' response is downgraded to 'medium'. */
export const DEEP_RESPONSE_DEPTH_FLOOR = 0.7;
/** Below this allowed depth, an 'open' (probing) question becomes 'choice'. */
export const OPEN_QUESTION_DEPTH_FLOOR = 0.5;

/** Surface baseline depth when the user has volunteered nothing personal. */
const SURFACE_BASELINE = 0.25;
const DISCLOSURE_DEPTH = 0.7;
const SENSITIVE_DEPTH = 0.8;

export interface VolunteeredDepthSignals {
  /** User volunteered emotional content (mirrors signals.emotionalDisclosure). */
  emotionalDisclosure: boolean;
  /** User raised a sensitive topic themselves (mirrors signals.consentSensitive). */
  consentSensitive?: boolean;
  /** Message complexity (mirrors signals.userMessageComplexity); 'deep' nudges up. */
  userMessageComplexity?: 'short' | 'medium' | 'deep';
}

export interface DepthGateResult {
  plan: ConversationPolicyPlanSource;
  /** True if the plan's depth (or response/question shape) was capped. */
  gated: boolean;
  volunteeredDepth: number;
  allowedDepth: number;
  /** The plan.depth before capping (only meaningful when gated). */
  cappedFrom: number;
}

const clamp01 = (n: number): number => Math.max(0, Math.min(1, n));

/** Default-OFF flag. The plan is untouched when OFF. */
export function isDepthEscalationGateEnabled(): boolean {
  return (process.env.DEPTH_ESCALATION_GATE_ENABLED ?? 'false').toLowerCase() === 'true';
}

/**
 * Estimate how much depth the user has volunteered (0..1). Surface chat baselines
 * low; volunteered emotional disclosure or a self-raised sensitive topic raises
 * it. Complexity is a minor nudge.
 */
export function classifyVolunteeredDepth(signals: VolunteeredDepthSignals): number {
  let depth = SURFACE_BASELINE;
  if (signals.emotionalDisclosure) {
    depth = Math.max(depth, DISCLOSURE_DEPTH);
  }
  if (signals.consentSensitive) {
    depth = Math.max(depth, SENSITIVE_DEPTH);
  }
  if (signals.userMessageComplexity === 'deep') {
    depth += 0.1;
  }
  return clamp01(depth);
}

/**
 * Cap the plan's intended depth to the user's volunteered depth + the invitation
 * margin. Never escalates. Downgrades a 'deep' response / 'open' question when
 * the allowed depth is below the respective floor.
 */
export function applyDepthGate(
  plan: ConversationPolicyPlanSource,
  args: { volunteeredDepth: number; invitationMargin?: number },
): DepthGateResult {
  const margin = args.invitationMargin ?? INVITATION_MARGIN;
  const allowedDepth = clamp01(args.volunteeredDepth + margin);

  if (plan.depth <= allowedDepth) {
    return {
      plan,
      gated: false,
      volunteeredDepth: args.volunteeredDepth,
      allowedDepth,
      cappedFrom: plan.depth,
    };
  }

  const adjusted: ConversationPolicyPlanSource = { ...plan, depth: allowedDepth };

  if (adjusted.responseLength === 'deep' && allowedDepth < DEEP_RESPONSE_DEPTH_FLOOR) {
    adjusted.responseLength = 'medium';
  }
  if (adjusted.questionStyle === 'open' && allowedDepth < OPEN_QUESTION_DEPTH_FLOOR) {
    // Keep a question if the plan wanted one, but make it lighter / non-probing.
    adjusted.questionStyle = 'choice';
  }

  return {
    plan: adjusted,
    gated: true,
    volunteeredDepth: args.volunteeredDepth,
    allowedDepth,
    cappedFrom: plan.depth,
  };
}
