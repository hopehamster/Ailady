const test = require('node:test');
const assert = require('node:assert/strict');

const promptCost = require('../lib/services/promptCostService.js');

test('composeSystemPromptSections keeps the stable prefix first and skips blanks', () => {
  const prompt = promptCost.composeSystemPromptSections([
    'STABLE',
    '',
    'DYNAMIC',
    'AUGMENT',
  ]);

  assert.equal(prompt, 'STABLE\n\nDYNAMIC\n\nAUGMENT');
});

test('compactPromptAugmentsForRoute strips heavy blocks on fast turns', () => {
  const compacted = promptCost.compactPromptAugmentsForRoute(
    {
      personalityBlock: 'personality',
      loreBlock: 'lore',
      semanticRecallBlock: 'semantic',
      personaVoiceBlock: 'voice',
      innerLifeBlock: 'inner',
      relationshipBlock: 'relationship',
      emotionalMemoryBlock: 'emotion',
      moodBlock: 'mood',
    },
    { route: 'fast', preferRecentExchange: false },
  );

  assert.equal(compacted.personalityBlock, 'personality');
  assert.equal(compacted.personaVoiceBlock, 'voice');
  assert.equal(compacted.moodBlock, 'mood');
  assert.equal(compacted.innerLifeBlock, '');
  assert.equal(compacted.relationshipBlock, '');
  assert.equal(compacted.emotionalMemoryBlock, '');
  assert.equal(compacted.loreBlock, '');
  assert.equal(compacted.semanticRecallBlock, '');
});

test('compactPromptAugmentsForRoute preserves augments on quality turns', () => {
  const original = {
    personalityBlock: 'personality',
    loreBlock: 'lore',
    semanticRecallBlock: 'semantic',
    personaVoiceBlock: 'voice',
    innerLifeBlock: 'inner',
    relationshipBlock: 'relationship',
    emotionalMemoryBlock: 'emotion',
    moodBlock: 'mood',
  };

  const compacted = promptCost.compactPromptAugmentsForRoute(
    original,
    { route: 'quality', preferRecentExchange: false },
  );

  assert.deepEqual(compacted, original);
});

test('estimateInitialHistoryFetchLimit uses a compact window for short simple turns', () => {
  assert.equal(
    promptCost.estimateInitialHistoryFetchLimit('ok cool'),
    16,
  );
});

test('estimateInitialHistoryFetchLimit keeps a larger window for deep or sensitive turns', () => {
  assert.equal(
    promptCost.estimateInitialHistoryFetchLimit('I feel overwhelmed and need a deep analysis of what happened this week'),
    40,
  );
});
