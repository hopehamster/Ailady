/**
 * Signal detectors — pure-function regex classifiers for conversation
 * signals. Extracted from llmService.ts + conversationPolicyService.ts as
 * Phase 2 Session-β Step 1. Both files had IDENTICAL implementations of
 * detectRepairSignal, detectEmotionalDisclosure, detectAmbiguousIntent,
 * detectConsentSensitiveTopic, and EMOTIONAL_DISCLOSURE_PATTERNS — a
 * textbook case of the scattered-prompt-construction failure mode that
 * `round_11.md` Pattern E + `oreilly_beyond_vibe.md` Finding #5 warn
 * about (AI-generated modules each grow their own copy).
 *
 * Single source of truth here; both services import.
 *
 * Per `clean_mobile_architecture.md` Ch.6 SCP: each is a single Executor
 * with one concern (does message X exhibit signal Y).
 *
 * NOTE: these are routing/policy signals, NOT safety gates. The crisis
 * HARD GATE in `crisisDetectionService.ts` is the authoritative safety
 * surface and runs BEFORE the LLM.
 */

export const EMOTIONAL_DISCLOSURE_PATTERNS = [
  /\b(i feel|i'm feeling|i am feeling|i felt|i'm proud|i am proud|i miss|i'm lonely|i am lonely)\b/i,
  /\b(anxious|overwhelmed|hurt|guilty|embarrassed|vulnerable|hopeful|sad|grief)\b/i,
];

/** User signals dissatisfaction with the last response — wants Aria to repair. */
export function detectRepairSignal(userMessage: string): boolean {
  return /\b(not what i said|you missed|you didn'?t answer|that'?s not right|wrong|not listening|misunderstood|didn'?t get it|not what i mean|unheard|acknowledge|talk over|frustrated by this conversation|frustrated|try again|be gentler|be softer|keep it gentler|keep it softer|rephrase that|start over|mixing up two different things|mixing things up|crossing wires)\b/i.test(
    userMessage,
  );
}

/** User mentions a topic that warrants sensitive handling (not necessarily crisis). */
export function detectConsentSensitiveTopic(userMessage: string): boolean {
  return /\b(trauma|abuse|self-harm|suicide|panic attack|assault|grief|deeply personal)\b/i.test(
    userMessage,
  );
}

/** User is sharing emotional state — Aria should respond with attunement. */
export function detectEmotionalDisclosure(userMessage: string): boolean {
  return EMOTIONAL_DISCLOSURE_PATTERNS.some((pattern) => pattern.test(userMessage));
}

/** User's intent isn't clear from the message; ask for clarification or hedge. */
export function detectAmbiguousIntent(userMessage: string): boolean {
  return /\b(you know what i mean|something feels off|not sure where to start|what now|any idea|this thing)\b/i.test(
    userMessage,
  );
}

/** User's reply is essentially a one-word acknowledgement — low signal. */
export function detectFlatAcknowledgement(userMessage: string): boolean {
  return /^(yeah|yea|yep|ok|okay|sure|maybe|idk|i do not know|i don't know|dont know|not sure|mm|hmm|k)[.! ]*$/i.test(
    userMessage.trim(),
  );
}

/** User explicitly asks for a lighter / less serious register. */
export function detectLightnessRequest(userMessage: string): boolean {
  return /\b(keep (?:this|it) light|keep (?:this|it) simple|keep (?:this|it) easy|go easy|nothing heavy|not too deep|light and fun|stay light|low pressure)\b/i.test(
    userMessage,
  );
}

/** User has affirmatively consented to discussing a sensitive topic. */
export function detectConsentGiven(userMessage: string): boolean {
  return /\b(yes|okay|i want to talk about it|i'm ready|go ahead)\b/i.test(userMessage);
}

/** User signals the disclosure should stay private. */
export function detectSecretDisclosure(userMessage: string): boolean {
  return /\b(secret|private|confidential|don't tell|keep this between us|just between us)\b/i.test(
    userMessage,
  );
}
