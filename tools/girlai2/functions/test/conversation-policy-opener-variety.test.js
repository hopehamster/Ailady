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
    depth: 0.4,
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
    repetitionGuardStrength: 'high',
    closureStyle: 'soft',
    ...overrides,
  };
}

function makeSignals(overrides = {}) {
  return {
    userWordCount: 9,
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
    emotionalDisclosure: true,
    ambiguousIntent: false,
    consentSensitive: false,
    engagementScore: 0.45,
    userEnergy: 'low',
    playfulSignal: false,
    userMessageComplexity: 'medium',
    ...overrides,
  };
}

test('supportive opener guard avoids yeah-i-feel-that / that-really-hits stack', () => {
  const result = applyConversationPolicyResponseGuards(
    'Yeah, I feel that. That really hits.',
    makePlan(),
    makeSignals(),
    {
      userMessage: 'i feel kind of overwhelmed lately',
      recentMessages: [
        { role: 'assistant', content: 'I hear you. That sounds heavy.' },
        { role: 'assistant', content: "I'm with you on this. There's no rush here." },
      ],
      memory: null,
    },
  );

  assert.doesNotMatch(result, /\byeah,\s*i feel that\b/i);
  assert.doesNotMatch(result, /\bthat really hits\b/i);
  assert.ok(result.length > 0);
});
