export interface PromptAugmentShape {
  personalityBlock: string;
  loreBlock: string;
  semanticRecallBlock: string;
  personaVoiceBlock: string;
  innerLifeBlock: string;
  relationshipBlock: string;
  emotionalMemoryBlock: string;
  moodBlock: string;
}

export interface PromptCompactionOptions {
  route: 'fast' | 'quality';
  preferRecentExchange: boolean;
}

const FAST_HISTORY_FETCH_LIMIT = 16;
const DEFAULT_HISTORY_FETCH_LIMIT = 40;

const SIMPLE_TURN_PATTERNS = [
  /^(ok(?:ay)?|cool|nice|sure|yep|yeah|nah|nope|lol|lmao|haha|thanks|thank you|got it|sounds good)[.!?]*$/i,
  /^(hi|hey|hello)[.!?]*$/i,
];

const SENSITIVE_TURN_PATTERN =
  /\b(overwhelmed|anxious|scared|afraid|panic|abuse|unsafe|crisis|suicide|self harm|self-harm|depressed|grief|grieving|trauma)\b/i;

const DEEP_TURN_PATTERN =
  /\b(deep analysis|analyze deeply|step by step|detailed breakdown|comprehensive|reason it out|long answer)\b/i;

export function composeSystemPromptSections(sections: string[]): string {
  return sections
    .map((section) => section.trim())
    .filter((section) => section.length > 0)
    .join('\n\n');
}

export function compactPromptAugmentsForRoute<T extends PromptAugmentShape>(
  augments: T,
  options: PromptCompactionOptions,
): T {
  if (options.route !== 'fast') {
    return augments;
  }

  return {
    ...augments,
    loreBlock: '',
    semanticRecallBlock: '',
    innerLifeBlock: '',
    relationshipBlock: options.preferRecentExchange ? '' : '',
    emotionalMemoryBlock: '',
  };
}

export function estimateInitialHistoryFetchLimit(userMessage: string): number {
  const normalized = userMessage.trim();
  if (!normalized) {
    return FAST_HISTORY_FETCH_LIMIT;
  }

  if (
    normalized.length <= 24 &&
    SIMPLE_TURN_PATTERNS.some((pattern) => pattern.test(normalized))
  ) {
    return FAST_HISTORY_FETCH_LIMIT;
  }

  if (
    normalized.length > 220 ||
    SENSITIVE_TURN_PATTERN.test(normalized) ||
    DEEP_TURN_PATTERN.test(normalized)
  ) {
    return DEFAULT_HISTORY_FETCH_LIMIT;
  }

  return FAST_HISTORY_FETCH_LIMIT;
}
