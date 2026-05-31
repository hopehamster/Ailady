/**
 * Characterization snapshot tests for userIntentClassifiers.
 *
 * Purpose: lock in CURRENT behavior of detectCapabilityIntent,
 * detectRecentExchangeIntent, detectNameIntent, detectChronologyIntent —
 * including focus-IIFE quirks (focus may be set even when
 * isCapabilityQuery is false because the IIFE runs unconditionally) and
 * regex-boundary edge cases — so any future refactor cannot silently
 * change behavior.
 *
 * Captured: 2026-05-31 against lib/services/userIntentClassifiers.js.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  detectCapabilityIntent,
  detectRecentExchangeIntent,
  detectNameIntent,
  detectChronologyIntent,
} = require('../lib/services/userIntentClassifiers.js');

// ----------------------------------------------------------------------
// detectCapabilityIntent — score-threshold + focus + flag interplay
// ----------------------------------------------------------------------
test('detectCapabilityIntent — characterization snapshot', () => {
  const cases = [
    {
      input: '',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'unknown',
      },
    },
    // directHit (+2) + selfHit (+1) = 3 → true
    {
      input: 'what can you do',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'overview',
      },
    },
    // directHit + nounHit + selfHit
    {
      input: 'what are your features',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'overview',
      },
    },
    // directHit on "your features"
    {
      input: 'your features',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'overview',
      },
    },
    // identityOnly carve-out — "who are you" alone with no noun/verb hit
    {
      input: 'who are you',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'unknown',
      },
    },
    // "who are you" + nounHit ("features") — identityOnly false → capability true
    {
      input: 'who are you and what features do you have',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'overview',
      },
    },
    // voice focus
    {
      input: 'how does your voice work',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'voice',
      },
    },
    // verbHit (can you remember) + nounHit (memory) + selfHit
    {
      input: 'can you remember things about me',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'memory',
      },
    },
    // limitHit (+2) + nounHit (limits) + selfHit → wantsLimits true, focus limits
    {
      input: 'what are your limits',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: true,
        focus: 'limits',
      },
    },
    // "what cant you do" — limit pattern fires (no apostrophe variant)
    {
      input: 'what cant you do',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: true,
        focus: 'limits',
      },
    },
    // apostrophe variant
    {
      input: "what can't you do",
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: true,
        focus: 'limits',
      },
    },
    // "what do you not do yet" — matches limit pattern
    {
      input: 'what do you not do yet',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: true,
        focus: 'limits',
      },
    },
    // comparison pattern + capability signals
    {
      input: 'how are you different versus other companions',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: true,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'overview',
      },
    },
    // demo pattern + camera focus
    {
      input: 'show me a demo of your camera',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: true,
        wantsLimits: false,
        focus: 'camera',
      },
    },
    // location focus
    {
      input: 'tell me about your location and weather features',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'location',
      },
    },
    // Surprise: avatar focus IIFE fires even when isCapabilityQuery is false
    // because focus IIFE runs unconditionally and avatar regex matches.
    // Score: nounHit 0, selfHit ("you") +1 → score 1 < 2 → not capability.
    {
      input: 'do you have an avatar',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'avatar',
      },
    },
    // Surprise: timeline focus set despite isCapabilityQuery false
    // No "you/your/aria" → selfHit false; only nounHit ("timeline") +1.
    {
      input: 'tell me about timeline',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'timeline',
      },
    },
    // Surprise: free_mode focus set even when isCapabilityQuery false
    // nounHit ("free mode") +1, no selfHit → score 1.
    {
      input: 'is there free mode',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'free_mode',
      },
    },
    // verbHit + nounHit + selfHit → proactive
    {
      input: 'do you have proactive check-ins',
      expected: {
        isCapabilityQuery: true,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'proactive',
      },
    },
    // no signals
    {
      input: 'random unrelated text about pizza',
      expected: {
        isCapabilityQuery: false,
        wantsComparison: false,
        wantsDemoPrompts: false,
        wantsLimits: false,
        focus: 'unknown',
      },
    },
  ];
  for (const { input, expected } of cases) {
    assert.deepEqual(
      detectCapabilityIntent(input),
      expected,
      `detectCapabilityIntent(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// detectRecentExchangeIntent — focus branches
// ----------------------------------------------------------------------
test('detectRecentExchangeIntent — characterization snapshot', () => {
  const cases = [
    { input: '', expected: { isRecentExchangeQuery: false, focus: 'unknown' } },
    // recent_two via "what...last/recent...two...i told you" pattern
    {
      input: 'what are the last two things i told you',
      expected: { isRecentExchangeQuery: true, focus: 'recent_two' },
    },
    // recent_two via "what did i just/recently tell/mention/say"
    {
      input: 'what did i just tell you',
      expected: { isRecentExchangeQuery: true, focus: 'recent_two' },
    },
    {
      input: 'what did i recently mention',
      expected: { isRecentExchangeQuery: true, focus: 'recent_two' },
    },
    // unresolved via "still unresolved"
    {
      input: 'is anything still unresolved',
      expected: { isRecentExchangeQuery: true, focus: 'unresolved' },
    },
    {
      input: 'what is still unresolved from what i told you earlier',
      expected: { isRecentExchangeQuery: true, focus: 'unresolved' },
    },
    // unresolved via "left unresolved"
    {
      input: 'left unresolved please',
      expected: { isRecentExchangeQuery: true, focus: 'unresolved' },
    },
    // natural_callback — "bring up ... one thing ... earlier"
    {
      input: 'bring up one thing i mentioned earlier',
      expected: { isRecentExchangeQuery: true, focus: 'natural_callback' },
    },
    // natural_callback — "mention something before"
    {
      input: 'mention something before',
      expected: { isRecentExchangeQuery: true, focus: 'natural_callback' },
    },
    // natural_callback — circle back
    {
      input: 'circle back to something i mentioned before',
      expected: { isRecentExchangeQuery: true, focus: 'natural_callback' },
    },
    // natural_callback — naturally + earlier
    {
      input: 'naturally bring up what i mentioned earlier',
      expected: { isRecentExchangeQuery: true, focus: 'natural_callback' },
    },
    // unrelated
    {
      input: 'how is the weather',
      expected: { isRecentExchangeQuery: false, focus: 'unknown' },
    },
  ];
  for (const { input, expected } of cases) {
    assert.deepEqual(
      detectRecentExchangeIntent(input),
      expected,
      `detectRecentExchangeIntent(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// detectNameIntent — user-target vs assistant-target patterns
// ----------------------------------------------------------------------
test('detectNameIntent — characterization snapshot', () => {
  const cases = [
    { input: '', expected: { isNameQuery: false, target: 'unknown' } },
    // user-target patterns
    { input: 'what is my name', expected: { isNameQuery: true, target: 'user' } },
    {
      input: 'what should you call me',
      expected: { isNameQuery: true, target: 'user' },
    },
    {
      input: 'what do you call me',
      expected: { isNameQuery: true, target: 'user' },
    },
    {
      input: 'which name should you use for me',
      expected: { isNameQuery: true, target: 'user' },
    },
    // assistant-target patterns
    {
      input: 'what is your name',
      expected: { isNameQuery: true, target: 'assistant' },
    },
    {
      input: 'what should i call you',
      expected: { isNameQuery: true, target: 'assistant' },
    },
    {
      input: 'what do i call you',
      expected: { isNameQuery: true, target: 'assistant' },
    },
    {
      input: 'how should i address you',
      expected: { isNameQuery: true, target: 'assistant' },
    },
    // unrelated
    {
      input: 'how are you doing',
      expected: { isNameQuery: false, target: 'unknown' },
    },
  ];
  for (const { input, expected } of cases) {
    assert.deepEqual(
      detectNameIntent(input),
      expected,
      `detectNameIntent(${JSON.stringify(input)})`,
    );
  }
});

// ----------------------------------------------------------------------
// detectChronologyIntent — focus branches
// ----------------------------------------------------------------------
test('detectChronologyIntent — characterization snapshot', () => {
  const cases = [
    { input: '', expected: { isChronologyQuery: false, focus: 'unknown' } },
    // exact_date branch
    {
      input: 'what date is that exactly',
      expected: { isChronologyQuery: true, focus: 'exact_date' },
    },
    {
      input: 'what exact day and date',
      expected: { isChronologyQuery: true, focus: 'exact_date' },
    },
    {
      input: 'what date do you mean',
      expected: { isChronologyQuery: true, focus: 'exact_date' },
    },
    {
      input: 'what day and date do you mean',
      expected: { isChronologyQuery: true, focus: 'exact_date' },
    },
    // upcoming_first branch
    {
      input: 'what is coming up first',
      expected: { isChronologyQuery: true, focus: 'upcoming_first' },
    },
    {
      input: 'which event comes first',
      expected: { isChronologyQuery: true, focus: 'upcoming_first' },
    },
    // past_check branch
    {
      input: 'if today is after one of those dates',
      expected: { isChronologyQuery: true, focus: 'past_check' },
    },
    {
      input: 'has that passed',
      expected: { isChronologyQuery: true, focus: 'past_check' },
    },
    // upcoming_week branch
    {
      input: 'summarize my upcoming week',
      expected: { isChronologyQuery: true, focus: 'upcoming_week' },
    },
    // calendar_order branch
    {
      input: 'tell me in calendar order',
      expected: { isChronologyQuery: true, focus: 'calendar_order' },
    },
    // unrelated
    {
      input: 'what is on my schedule',
      expected: { isChronologyQuery: false, focus: 'unknown' },
    },
  ];
  for (const { input, expected } of cases) {
    assert.deepEqual(
      detectChronologyIntent(input),
      expected,
      `detectChronologyIntent(${JSON.stringify(input)})`,
    );
  }
});
