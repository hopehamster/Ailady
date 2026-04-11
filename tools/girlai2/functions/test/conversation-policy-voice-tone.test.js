const test = require('node:test');
const assert = require('node:assert/strict');

const {
  applyConversationPolicyResponseGuards,
} = require('../lib/services/conversationPolicyService.js');

function makePlan(overrides = {}) {
  return {
    strategy: 'supportive_grounding',
    warmth: 0.9,
    curiosity: 0.2,
    depth: 0.2,
    playfulness: 0,
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'short',
    mirrorUserPhrase: false,
    styleMirrorLevel: 'light',
    repairMode: false,
    consentCheckRequired: false,
    gentleExitLine: true,
    hookStyle: 'none',
    momentumMode: 'recover',
    noPressureLevel: 1,
    avoidInterrogation: true,
    repetitionGuardStrength: 'normal',
    closureStyle: 'soft',
    ...overrides,
  };
}

function makeSignals(overrides = {}) {
  return {
    userWordCount: 4,
    userAskedQuestion: false,
    userUsedEmoji: false,
    lowEffort: false,
    flatAcknowledgement: false,
    lightnessRequested: false,
    positiveTone: false,
    negativeTone: true,
    recentAssistantQuestionCount: 0,
    recentUserShortTurnStreak: 0,
    repairSignal: false,
    emotionalDisclosure: false,
    ambiguousIntent: false,
    consentSensitive: false,
    engagementScore: 0.4,
    userEnergy: 'low',
    playfulSignal: false,
    userMessageComplexity: 'short',
    ...overrides,
  };
}

test('conversation policy removes overused keep/take closing family', () => {
  const result = applyConversationPolicyResponseGuards(
    'I get that. We can keep this easy and low pressure.',
    makePlan(),
    makeSignals(),
    {
      userMessage: 'yeah',
      recentMessages: [],
      memory: null,
    },
  );

  assert.doesNotMatch(result, /\bwe can keep this\b/i);
  assert.doesNotMatch(result, /\bwe can take this\b/i);
  assert.ok(result.length > 0);
});

test('short-reply choreography avoids take-this phrasing', () => {
  const result = applyConversationPolicyResponseGuards(
    'Okay.',
    makePlan(),
    makeSignals({
      flatAcknowledgement: true,
      lowEffort: true,
    }),
    {
      userMessage: 'ok',
      recentMessages: [],
      memory: null,
    },
  );

  assert.doesNotMatch(result, /\bwe can take this\b/i);
  assert.doesNotMatch(result, /\bone small step at a time\b/i);
  assert.match(result, /\b(keep it simple|no need to force anything|stay simple for now)\b/i);
});
