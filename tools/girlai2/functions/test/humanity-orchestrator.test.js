/**
 * Tests for humanityOrchestrator — the extracted coordinator for Aria
 * humanity items #6/#7/#8/#9/#10.
 *
 * These tests stand alone from llmService.ts. The characterization suite at
 * functions/test/llmservice-humanity-wirein.characterization.test.js pins
 * the in-place behavior at commit d5d46e9; the extraction must preserve
 * every pinned behavior. This file unit-tests the EXTRACTED orchestrator
 * directly so any drift surfaces here too.
 *
 * Covers (one section per public hook):
 *   1. loadHumanityTurnContext
 *      - default no-op fixture when userId missing
 *      - parallel load via Promise.all when userId present
 *      - continuity load gated on isContinuityFeatureEnabled()
 *      - inertia load gated on HUMANITY_TONE_INERTIA_ENABLED env
 *      - errors swallowed + warn-logged; returns default fixture
 *      - turn-shape vars (turnSessionTurnCount, hoursSinceLastChatForTurn,
 *        turnIsFirstOfSession) returned unchanged
 *   2. applyHumanityBiases
 *      - canonical order rhythm → continuity → inertia
 *      - rhythm bias respects sessionStage option
 *      - continuity bias only on first turn AND flag-on; clamps [0,1]
 *      - inertia blend bypassed on repair / disclosure / consent / crisis
 *      - inertia weight defaults to 0.35 + clamped to [0,1]
 *      - inertia env flag re-checked at apply site (defense in depth)
 *      - pure function — does not mutate input plan
 *   3. applyPostLlmInjectors
 *      - skipped entirely when outputScanBlocked
 *      - narrows currentEmotion via EMOTION_KEYS.includes()
 *      - threads brand-contract bypass signals to pattern detector
 *      - runs even when uid missing (pattern detector is no-op then)
 *   4. persistTurnAnalysis
 *      - skipped entirely when uid falsy OR outputScanBlocked
 *      - rhythm.observe gated on HUMANITY_RHYTHM_BIAS_ENABLED
 *      - recordAriaResponse gated on HUMANITY_PATTERN_DETECTOR_ENABLED
 *      - continuity.save gated on flag AND analysis AND shouldWriteSnapshot
 *      - policyTrajectory.appendDecision gated on HUMANITY_TONE_INERTIA_ENABLED
 *      - persists the 4D plan vector (warmth/curiosity/depth/playfulness)
 *      - all writes are fire-and-forget (returns void; catches swallow errors)
 */

const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// ──────────────────────────────────────────────────────────────────────────
// Stub firebase deps before any require() of humanity modules.
// ──────────────────────────────────────────────────────────────────────────

const origResolve = Module._resolveFilename;
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubFirestorePath = path.join(__dirname, '_firebase-admin-firestore-stub.js');
const stubAdminPath = path.join(__dirname, '_firebase-admin-stub.js');
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin/firestore') return stubFirestorePath;
  if (req === 'firebase-admin') return stubAdminPath;
  return origResolve.call(this, req, ...rest);
};

// ──────────────────────────────────────────────────────────────────────────
// Module requires
// ──────────────────────────────────────────────────────────────────────────

const {
  loadHumanityTurnContext,
  applyHumanityBiases,
  applyPostLlmInjectors,
  persistTurnAnalysis,
} = require('../lib/services/humanityOrchestrator.js');

const {
  setEmotionalContinuityTrackerForTesting,
} = require('../lib/services/emotionalContinuity.js');
const {
  setRhythmTrackerForTesting,
} = require('../lib/services/conversationRhythmTracker.js');
const {
  setPolicyTrajectoryTrackerForTesting,
} = require('../lib/services/policyTrajectoryTracker.js');
const {
  setResponsePatternHistoryTrackerForTesting,
} = require('../lib/services/responsePatternDetector.js');

// ──────────────────────────────────────────────────────────────────────────
// Env helpers
// ──────────────────────────────────────────────────────────────────────────

const ENV_KEYS = [
  'HUMANITY_EMOTIONAL_CONTINUITY_ENABLED',
  'HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH',
  'HUMANITY_TONE_INERTIA_ENABLED',
  'HUMANITY_TONE_INERTIA_WEIGHT',
  'HUMANITY_RHYTHM_BIAS_ENABLED',
  'HUMANITY_PATTERN_DETECTOR_ENABLED',
  'HUMANITY_PATTERN_SUPPRESSION_ENABLED',
  'HUMANITY_SELF_INTERRUPTION_RATE',
];

function clearEnv() {
  for (const k of ENV_KEYS) delete process.env[k];
}

function withEnv(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

async function withEnvAsync(vars, fn) {
  const saved = {};
  for (const k of Object.keys(vars)) {
    saved[k] = process.env[k];
    if (vars[k] === undefined) delete process.env[k];
    else process.env[k] = vars[k];
  }
  try {
    return await fn();
  } finally {
    for (const k of Object.keys(saved)) {
      if (saved[k] === undefined) delete process.env[k];
      else process.env[k] = saved[k];
    }
  }
}

// ──────────────────────────────────────────────────────────────────────────
// Stub tracker factories — each builds a fresh recorder per test so the
// caller can assert load() / save() / observe() invocations directly.
// ──────────────────────────────────────────────────────────────────────────

function stubContinuityTracker(opts) {
  const calls = { load: 0, save: 0, invalidate: 0, savedArgs: [] };
  const loadReturn = (opts && opts.loadReturn) || {
    recent: [],
    lastWrittenTurn: -1,
  };
  const loadThrows = opts && opts.loadThrows;
  const tracker = {
    async load(uid) {
      calls.load++;
      if (loadThrows) throw new Error('load failed');
      return loadReturn;
    },
    async save(uid, snap) {
      calls.save++;
      calls.savedArgs.push({ uid, snap });
    },
    invalidate(uid) {
      calls.invalidate++;
    },
  };
  setEmotionalContinuityTrackerForTesting(tracker);
  return calls;
}

function stubRhythmTracker(opts) {
  const calls = { getHint: 0, observe: 0, invalidate: 0, observed: [] };
  const hint = (opts && opts.hint) || {
    preferred: null,
    confidence: 0,
    sampleSize: 0,
    reason: 'disabled',
  };
  const tracker = {
    async getHint(uid) {
      calls.getHint++;
      return hint;
    },
    async observe(o) {
      calls.observe++;
      calls.observed.push(o);
    },
    invalidate(uid) {
      calls.invalidate++;
    },
  };
  setRhythmTrackerForTesting(tracker);
  return calls;
}

function stubPolicyTracker(opts) {
  const calls = {
    loadWindow: 0,
    getInertiaBias: 0,
    appendDecision: 0,
    invalidate: 0,
    appended: [],
  };
  const inertia = opts && 'inertia' in opts ? opts.inertia : null;
  const tracker = {
    async loadWindow(uid) {
      calls.loadWindow++;
      return [];
    },
    async getInertiaBias(uid) {
      calls.getInertiaBias++;
      return inertia;
    },
    async appendDecision(uid, plan) {
      calls.appendDecision++;
      calls.appended.push({ uid, plan });
    },
    invalidate(uid) {
      calls.invalidate++;
    },
  };
  setPolicyTrajectoryTrackerForTesting(tracker);
  return calls;
}

function stubPatternHistoryTracker(opts) {
  const calls = { load: 0, save: 0, invalidate: 0, saved: [] };
  const entries = (opts && opts.entries) || [];
  const tracker = {
    async load(uid) {
      calls.load++;
      return { entries };
    },
    async save(uid, state) {
      calls.save++;
      calls.saved.push({ uid, state });
    },
    invalidate(uid) {
      calls.invalidate++;
    },
  };
  setResponsePatternHistoryTrackerForTesting(tracker);
  return calls;
}

function resetAllStubs() {
  setEmotionalContinuityTrackerForTesting(null);
  setRhythmTrackerForTesting(null);
  setPolicyTrajectoryTrackerForTesting(null);
  setResponsePatternHistoryTrackerForTesting(null);
}

test.afterEach(() => {
  resetAllStubs();
  clearEnv();
});

// Helper for awaiting fire-and-forget settlement.
async function flushMicrotasks(times = 4) {
  for (let i = 0; i < times; i++) {
    await Promise.resolve();
    await new Promise((r) => setImmediate(r));
  }
}

function basePlan(overrides) {
  return {
    strategy: 'rapport',
    warmth: 0.5,
    curiosity: 0.5,
    depth: 0.5,
    playfulness: 0.5,
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'medium',
    ...(overrides || {}),
  };
}

function baseSignals(overrides) {
  return {
    repairSignal: false,
    emotionalDisclosure: false,
    consentSensitive: false,
    userMessageComplexity: 'medium',
    ...(overrides || {}),
  };
}

function baseTurnContext(overrides) {
  return {
    continuityState: { recent: [], lastWrittenTurn: -1 },
    rhythmHint: {
      preferred: null,
      confidence: 0,
      sampleSize: 0,
      reason: 'disabled',
    },
    inertiaBias: null,
    turnSessionTurnCount: 0,
    hoursSinceLastChatForTurn: null,
    turnIsFirstOfSession: true,
    ...(overrides || {}),
  };
}

// ──────────────────────────────────────────────────────────────────────────
// 1. loadHumanityTurnContext
// ──────────────────────────────────────────────────────────────────────────

test('loadHumanityTurnContext: returns defaults when userId falsy', async () => {
  // No stubs → if the orchestrator tries to call them it would 500. The
  // contract says: skip the entire load block when uid is missing.
  const ctx = await loadHumanityTurnContext({
    userId: null,
    turnSessionTurnCount: 5,
    hoursSinceLastChatForTurn: 2.5,
    turnIsFirstOfSession: true,
  });
  assert.deepEqual(ctx.continuityState, { recent: [], lastWrittenTurn: -1 });
  assert.equal(ctx.rhythmHint.preferred, null);
  assert.equal(ctx.rhythmHint.reason, 'disabled');
  assert.equal(ctx.inertiaBias, null);
  assert.equal(ctx.turnSessionTurnCount, 5);
  assert.equal(ctx.hoursSinceLastChatForTurn, 2.5);
  assert.equal(ctx.turnIsFirstOfSession, true);
});

test('loadHumanityTurnContext: returns defaults when userId is empty string', async () => {
  const ctx = await loadHumanityTurnContext({
    userId: '',
    turnSessionTurnCount: 0,
    hoursSinceLastChatForTurn: null,
    turnIsFirstOfSession: true,
  });
  assert.equal(ctx.inertiaBias, null);
  assert.deepEqual(ctx.continuityState, { recent: [], lastWrittenTurn: -1 });
});

test('loadHumanityTurnContext: parallel loads all 3 trackers via Promise.all when flags on', async () => {
  const cont = stubContinuityTracker({
    loadReturn: { recent: [{ dominantEmotion: 'happy' }], lastWrittenTurn: 4 },
  });
  const rhy = stubRhythmTracker({
    hint: { preferred: 'short', confidence: 0.8, sampleSize: 5, reason: 'short-streak' },
  });
  const pol = stubPolicyTracker({
    inertia: { warmth: 0.6, curiosity: 0.4, depth: 0.5, playfulness: 0.45 },
  });
  const ctx = await withEnvAsync(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
    },
    () =>
      loadHumanityTurnContext({
        userId: 'u1',
        turnSessionTurnCount: 3,
        hoursSinceLastChatForTurn: 0.2,
        turnIsFirstOfSession: false,
      }),
  );
  assert.equal(cont.load, 1, 'continuity load fired once');
  assert.equal(rhy.getHint, 1, 'rhythm getHint fired once');
  assert.equal(pol.getInertiaBias, 1, 'inertia getInertiaBias fired once');
  assert.equal(ctx.continuityState.lastWrittenTurn, 4);
  assert.equal(ctx.rhythmHint.preferred, 'short');
  assert.deepEqual(ctx.inertiaBias, {
    warmth: 0.6,
    curiosity: 0.4,
    depth: 0.5,
    playfulness: 0.45,
  });
});

test('loadHumanityTurnContext: continuity load skipped when feature flag off', async () => {
  const cont = stubContinuityTracker();
  const rhy = stubRhythmTracker();
  stubPolicyTracker();
  await withEnvAsync(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: undefined,
      HUMANITY_TONE_INERTIA_ENABLED: undefined,
    },
    () =>
      loadHumanityTurnContext({
        userId: 'u1',
        turnSessionTurnCount: 1,
        hoursSinceLastChatForTurn: 0.1,
        turnIsFirstOfSession: false,
      }),
  );
  assert.equal(cont.load, 0, 'continuity load did NOT fire when flag off');
  assert.equal(rhy.getHint, 1, 'rhythm.getHint always fires (has internal early-exit)');
});

test('loadHumanityTurnContext: inertia load skipped when env flag off', async () => {
  stubContinuityTracker();
  stubRhythmTracker();
  const pol = stubPolicyTracker();
  await withEnvAsync({ HUMANITY_TONE_INERTIA_ENABLED: undefined }, () =>
    loadHumanityTurnContext({
      userId: 'u1',
      turnSessionTurnCount: 1,
      hoursSinceLastChatForTurn: 0.1,
      turnIsFirstOfSession: false,
    }),
  );
  assert.equal(pol.getInertiaBias, 0, 'inertia load skipped when env off');
});

test('loadHumanityTurnContext: inertia load skipped when env flag literally "0"', async () => {
  stubContinuityTracker();
  stubRhythmTracker();
  const pol = stubPolicyTracker();
  await withEnvAsync({ HUMANITY_TONE_INERTIA_ENABLED: '0' }, () =>
    loadHumanityTurnContext({
      userId: 'u1',
      turnSessionTurnCount: 1,
      hoursSinceLastChatForTurn: 0.1,
      turnIsFirstOfSession: false,
    }),
  );
  assert.equal(pol.getInertiaBias, 0, 'inertia load skipped when env "0"');
});

test('loadHumanityTurnContext: load errors swallowed; returns defaults', async () => {
  stubContinuityTracker({ loadThrows: true });
  stubRhythmTracker();
  stubPolicyTracker();
  const ctx = await withEnvAsync(
    { HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' },
    () =>
      loadHumanityTurnContext({
        userId: 'u1',
        turnSessionTurnCount: 0,
        hoursSinceLastChatForTurn: null,
        turnIsFirstOfSession: true,
      }),
  );
  // Promise.all rejection → catch path → defaults
  assert.deepEqual(ctx.continuityState, { recent: [], lastWrittenTurn: -1 });
  assert.equal(ctx.rhythmHint.preferred, null);
  assert.equal(ctx.inertiaBias, null);
  assert.equal(ctx.turnSessionTurnCount, 0);
});

test('loadHumanityTurnContext: returns input turn-shape vars unchanged', async () => {
  stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  const ctx = await loadHumanityTurnContext({
    userId: 'u1',
    turnSessionTurnCount: 12,
    hoursSinceLastChatForTurn: 18.5,
    turnIsFirstOfSession: true,
  });
  assert.equal(ctx.turnSessionTurnCount, 12);
  assert.equal(ctx.hoursSinceLastChatForTurn, 18.5);
  assert.equal(ctx.turnIsFirstOfSession, true);
});

// ──────────────────────────────────────────────────────────────────────────
// 2. applyHumanityBiases
// ──────────────────────────────────────────────────────────────────────────

test('applyHumanityBiases: no-op when all flags off + neutral context', () => {
  const plan = basePlan();
  const out = applyHumanityBiases({
    socialPlan: plan,
    signals: baseSignals(),
    turnContext: baseTurnContext(),
    userMessage: 'hi',
  });
  assert.deepEqual(out, plan);
});

test('applyHumanityBiases: pure — does not mutate input plan', () => {
  const plan = basePlan({ warmth: 0.3, depth: 0.3, playfulness: 0.3 });
  const frozen = JSON.parse(JSON.stringify(plan));
  const ctx = baseTurnContext({
    continuityState: {
      recent: [
        {
          dominantEmotion: 'sad',
          valence: -0.7,
          arousal: 0.35,
          confidence: 0.8,
          turnCount: 3,
          capturedAtMs: Date.now(),
        },
      ],
      lastWrittenTurn: -1,
    },
  });
  withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_RHYTHM_BIAS_ENABLED: 'true',
    },
    () => {
      applyHumanityBiases({
        socialPlan: plan,
        signals: baseSignals(),
        turnContext: ctx,
        userMessage: 'hi',
      });
    },
  );
  assert.deepEqual(plan, frozen, 'input plan must not be mutated');
});

test('applyHumanityBiases: rhythm bias shifts responseLength one rung', () => {
  // user-tendency = short → 'deep' shifts to 'medium' (one rung).
  const plan = basePlan({ responseLength: 'deep' });
  const ctx = baseTurnContext({
    rhythmHint: {
      preferred: 'short',
      confidence: 0.9,
      sampleSize: 5,
      reason: 'short-streak',
    },
  });
  const out = withEnv({ HUMANITY_RHYTHM_BIAS_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: plan,
      signals: baseSignals(),
      turnContext: ctx,
      userMessage: 'hi',
    }),
  );
  assert.equal(out.responseLength, 'medium', 'rhythm shifted by one rung');
});

test('applyHumanityBiases: rhythm bias respects sessionStage skip', () => {
  const plan = basePlan({ responseLength: 'deep' });
  const ctx = baseTurnContext({
    rhythmHint: {
      preferred: 'short',
      confidence: 0.9,
      sampleSize: 5,
      reason: 'short-streak',
    },
  });
  const out = withEnv({ HUMANITY_RHYTHM_BIAS_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: plan,
      signals: baseSignals(),
      turnContext: ctx,
      sessionStage: 'relief',
      userMessage: 'hi',
    }),
  );
  assert.equal(out.responseLength, 'deep', 'rhythm skipped on relief stage');
});

test('applyHumanityBiases: continuity bias fires ONLY on first turn AND flag on', () => {
  // Continuity flag OFF → no bias even on first turn.
  let out = applyHumanityBiases({
    socialPlan: basePlan({ warmth: 0.5 }),
    signals: baseSignals(),
    turnContext: baseTurnContext({
      turnIsFirstOfSession: true,
      continuityState: {
        recent: [
          {
            dominantEmotion: 'sad',
            valence: -0.7,
            arousal: 0.35,
            confidence: 0.9,
            turnCount: 4,
            capturedAtMs: Date.now(),
          },
        ],
        lastWrittenTurn: -1,
      },
    }),
    userMessage: 'hi',
  });
  assert.equal(out.warmth, 0.5, 'no continuity bias when flag off');

  // Continuity flag ON but NOT first turn → no bias.
  out = withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0.5 }),
      signals: baseSignals(),
      turnContext: baseTurnContext({
        turnIsFirstOfSession: false,
        continuityState: {
          recent: [
            {
              dominantEmotion: 'sad',
              valence: -0.7,
              arousal: 0.35,
              confidence: 0.9,
              turnCount: 4,
              capturedAtMs: Date.now(),
            },
          ],
          lastWrittenTurn: -1,
        },
      }),
      userMessage: 'hi',
    }),
  );
  assert.equal(out.warmth, 0.5, 'no continuity bias when not first turn');
});

test('applyHumanityBiases: continuity bias clamps warmth/depth/playfulness to [0,1]', () => {
  // Plan at the top of the range with a positive snapshot — clamp must
  // prevent values > 1.
  const out = withEnv(
    {
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_BIAS_STRENGTH: '1',
    },
    () =>
      applyHumanityBiases({
        socialPlan: basePlan({ warmth: 1, depth: 1, playfulness: 1 }),
        signals: baseSignals(),
        turnContext: baseTurnContext({
          turnIsFirstOfSession: true,
          hoursSinceLastChatForTurn: 1,
          continuityState: {
            recent: [
              {
                dominantEmotion: 'loving',
                valence: 0.85,
                arousal: 0.55,
                confidence: 1,
                turnCount: 4,
                capturedAtMs: Date.now(),
              },
            ],
            lastWrittenTurn: -1,
          },
        }),
        userMessage: 'hi',
      }),
  );
  assert.ok(out.warmth >= 0 && out.warmth <= 1, 'warmth clamped to [0,1]');
  assert.ok(out.depth >= 0 && out.depth <= 1, 'depth clamped to [0,1]');
  assert.ok(
    out.playfulness >= 0 && out.playfulness <= 1,
    'playfulness clamped to [0,1]',
  );
});

test('applyHumanityBiases: inertia blend bypassed on repair signal', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals({ repairSignal: true }),
      turnContext: baseTurnContext({ inertiaBias: inertia }),
      userMessage: 'hi',
    }),
  );
  assert.equal(out.warmth, 0, 'inertia bypassed on repairSignal');
});

test('applyHumanityBiases: inertia blend bypassed on emotionalDisclosure', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals({ emotionalDisclosure: true }),
      turnContext: baseTurnContext({ inertiaBias: inertia }),
      userMessage: 'hi',
    }),
  );
  assert.equal(out.warmth, 0, 'inertia bypassed on emotionalDisclosure');
});

test('applyHumanityBiases: inertia blend bypassed on consentSensitive', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals({ consentSensitive: true }),
      turnContext: baseTurnContext({ inertiaBias: inertia }),
      userMessage: 'hi',
    }),
  );
  assert.equal(out.warmth, 0, 'inertia bypassed on consentSensitive');
});

test('applyHumanityBiases: inertia blend bypassed on crisis-sensitive userMessage', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals(),
      turnContext: baseTurnContext({ inertiaBias: inertia }),
      userMessage: 'I am having a panic attack',
    }),
  );
  assert.equal(out.warmth, 0, 'inertia bypassed on crisis userMessage');
});

test('applyHumanityBiases: inertia blend applies when no bypass + flag on', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv(
    {
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_WEIGHT: '0.5',
    },
    () =>
      applyHumanityBiases({
        socialPlan: basePlan({ warmth: 0, curiosity: 0, depth: 0, playfulness: 0 }),
        signals: baseSignals(),
        turnContext: baseTurnContext({ inertiaBias: inertia }),
        userMessage: 'hello',
      }),
  );
  // weight 0.5 blends 0 with 1 → 0.5
  assert.equal(out.warmth, 0.5, 'inertia blends at weight 0.5');
  assert.equal(out.depth, 0.5);
  assert.equal(out.playfulness, 0.5);
});

test('applyHumanityBiases: inertia weight defaults to 0.35 when env unset', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv(
    {
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_WEIGHT: undefined,
    },
    () =>
      applyHumanityBiases({
        socialPlan: basePlan({ warmth: 0, curiosity: 0, depth: 0, playfulness: 0 }),
        signals: baseSignals(),
        turnContext: baseTurnContext({ inertiaBias: inertia }),
        userMessage: 'hello',
      }),
  );
  // weight 0.35 → 0 + 0.35 * 1 = 0.35
  assert.equal(out.warmth, 0.35, 'inertia default weight 0.35');
});

test('applyHumanityBiases: inertia weight clamped to [0,1]', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  const out = withEnv(
    {
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_WEIGHT: '5',
    },
    () =>
      applyHumanityBiases({
        socialPlan: basePlan({ warmth: 0, curiosity: 0, depth: 0, playfulness: 0 }),
        signals: baseSignals(),
        turnContext: baseTurnContext({ inertiaBias: inertia }),
        userMessage: 'hello',
      }),
  );
  // weight 5 → clamped to 1 → fully take inertia
  assert.equal(out.warmth, 1, 'inertia weight clamped to 1');
});

test('applyHumanityBiases: inertia env flag re-checked at apply site (defense in depth)', () => {
  const inertia = { warmth: 1, curiosity: 1, depth: 1, playfulness: 1 };
  // Load happens with flag ON (we'd have inertiaBias loaded); at apply
  // time flag is OFF — must not blend.
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: undefined }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals(),
      turnContext: baseTurnContext({ inertiaBias: inertia }),
      userMessage: 'hello',
    }),
  );
  assert.equal(out.warmth, 0, 'no blend when flag off at apply site');
});

test('applyHumanityBiases: inertia skipped when inertiaBias is null', () => {
  const out = withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () =>
    applyHumanityBiases({
      socialPlan: basePlan({ warmth: 0 }),
      signals: baseSignals(),
      turnContext: baseTurnContext({ inertiaBias: null }),
      userMessage: 'hello',
    }),
  );
  assert.equal(out.warmth, 0);
});

// ──────────────────────────────────────────────────────────────────────────
// 3. applyPostLlmInjectors
// ──────────────────────────────────────────────────────────────────────────

test('applyPostLlmInjectors: returns aiContent unchanged when outputScanBlocked', async () => {
  // Even with feature flags ON, scan-blocked turns must not be mutated.
  const original = 'This is a stall variant.';
  const out = await withEnvAsync(
    {
      HUMANITY_SELF_INTERRUPTION_RATE: '1',
      HUMANITY_PATTERN_DETECTOR_ENABLED: 'true',
    },
    () =>
      applyPostLlmInjectors({
        aiContent: original,
        currentEmotion: 'happy',
        signals: baseSignals(),
        uid: 'u1',
        outputScanBlocked: true,
      }),
  );
  assert.equal(out, original, 'no injection when outputScanBlocked');
});

test('applyPostLlmInjectors: returns input unchanged when all injectors off', async () => {
  const original = 'Hello there friend, how are you today?';
  const out = await applyPostLlmInjectors({
    aiContent: original,
    currentEmotion: 'happy',
    signals: baseSignals(),
    uid: 'u1',
    outputScanBlocked: false,
  });
  assert.equal(out, original);
});

test('applyPostLlmInjectors: invalid currentEmotion narrowed to undefined (string filter)', async () => {
  // 'notarealemotion' is not in EMOTION_KEYS → narrowed to undefined. The
  // contract is that the call proceeds without throwing.
  const out = await applyPostLlmInjectors({
    aiContent: 'Hello there friend.',
    currentEmotion: 'notarealemotion',
    signals: baseSignals(),
    uid: 'u1',
    outputScanBlocked: false,
  });
  assert.equal(typeof out, 'string');
});

test('applyPostLlmInjectors: null currentEmotion handled gracefully', async () => {
  const out = await applyPostLlmInjectors({
    aiContent: 'Hello there friend.',
    currentEmotion: null,
    signals: baseSignals(),
    uid: 'u1',
    outputScanBlocked: false,
  });
  assert.equal(typeof out, 'string');
});

test('applyPostLlmInjectors: threads brand-contract bypass signals to pattern detector', async () => {
  // We stub the pattern history tracker to capture what entries it loads —
  // bypass logic short-circuits BEFORE the load, so any of repairSignal /
  // emotionalDisclosure / consentSensitive should mean ZERO tracker calls.
  const patternCalls = stubPatternHistoryTracker({ entries: [] });
  await withEnvAsync({ HUMANITY_PATTERN_DETECTOR_ENABLED: 'true' }, () =>
    applyPostLlmInjectors({
      aiContent: 'Hey there. How are you holding up?',
      currentEmotion: 'happy', // not a fragile key
      signals: baseSignals({ emotionalDisclosure: true }), // BYPASS
      uid: 'u1',
      outputScanBlocked: false,
    }),
  );
  assert.equal(
    patternCalls.load,
    0,
    'pattern detector load() should NOT fire on emotionalDisclosure (bypass)',
  );
});

test('applyPostLlmInjectors: bypass via sad/concerned/comforting emotion', async () => {
  const patternCalls = stubPatternHistoryTracker({ entries: [] });
  await withEnvAsync({ HUMANITY_PATTERN_DETECTOR_ENABLED: 'true' }, () =>
    applyPostLlmInjectors({
      aiContent: 'I hear you. How are you holding up?',
      currentEmotion: 'sad',
      signals: baseSignals(),
      uid: 'u1',
      outputScanBlocked: false,
    }),
  );
  assert.equal(patternCalls.load, 0, 'sad emotion → brand-contract bypass');
});

test('applyPostLlmInjectors: pattern detector no-ops when uid missing', async () => {
  const patternCalls = stubPatternHistoryTracker({ entries: [] });
  await withEnvAsync({ HUMANITY_PATTERN_DETECTOR_ENABLED: 'true' }, () =>
    applyPostLlmInjectors({
      aiContent: 'Hello there.',
      currentEmotion: 'happy',
      signals: baseSignals(),
      uid: null,
      outputScanBlocked: false,
    }),
  );
  assert.equal(patternCalls.load, 0, 'pattern detector skipped without uid');
});

// ──────────────────────────────────────────────────────────────────────────
// 4. persistTurnAnalysis
// ──────────────────────────────────────────────────────────────────────────

test('persistTurnAnalysis: all writes skipped when uid falsy', async () => {
  const rhy = stubRhythmTracker();
  const pol = stubPolicyTracker();
  const cont = stubContinuityTracker();
  withEnv(
    {
      HUMANITY_RHYTHM_BIAS_ENABLED: 'true',
      HUMANITY_PATTERN_DETECTOR_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
    },
    () => {
      persistTurnAnalysis({
        uid: null,
        outputScanBlocked: false,
        userMessage: 'hi',
        aiContent: 'hey there',
        plan: basePlan(),
        signals: baseSignals(),
        analysis: { emotion: 'happy' },
        turnSessionTurnCount: 5,
      });
    },
  );
  await flushMicrotasks();
  assert.equal(rhy.observe, 0);
  assert.equal(pol.appendDecision, 0);
  assert.equal(cont.save, 0);
});

test('persistTurnAnalysis: all writes skipped when outputScanBlocked', async () => {
  const rhy = stubRhythmTracker();
  const pol = stubPolicyTracker();
  const cont = stubContinuityTracker();
  withEnv(
    {
      HUMANITY_RHYTHM_BIAS_ENABLED: 'true',
      HUMANITY_PATTERN_DETECTOR_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
    },
    () => {
      persistTurnAnalysis({
        uid: 'u1',
        outputScanBlocked: true,
        userMessage: 'hi',
        aiContent: 'hey there',
        plan: basePlan(),
        signals: baseSignals(),
        analysis: { emotion: 'happy' },
        turnSessionTurnCount: 5,
      });
    },
  );
  await flushMicrotasks();
  assert.equal(rhy.observe, 0);
  assert.equal(pol.appendDecision, 0);
  assert.equal(cont.save, 0);
});

test('persistTurnAnalysis: rhythm.observe gated on HUMANITY_RHYTHM_BIAS_ENABLED', async () => {
  // Flag OFF: no write
  let rhy = stubRhythmTracker();
  stubPolicyTracker();
  stubContinuityTracker();
  persistTurnAnalysis({
    uid: 'u1',
    outputScanBlocked: false,
    userMessage: 'hi',
    aiContent: 'hey there friend',
    plan: basePlan(),
    signals: baseSignals(),
    analysis: { emotion: 'happy' },
    turnSessionTurnCount: 5,
  });
  await flushMicrotasks();
  assert.equal(rhy.observe, 0, 'no write when flag off');

  // Flag ON: write
  resetAllStubs();
  rhy = stubRhythmTracker();
  stubPolicyTracker();
  stubContinuityTracker();
  withEnv({ HUMANITY_RHYTHM_BIAS_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi friend',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 5,
    });
  });
  await flushMicrotasks();
  assert.equal(rhy.observe, 1, 'observe fired when flag on');
  assert.equal(rhy.observed[0].uid, 'u1');
  assert.ok(rhy.observed[0].userWords > 0);
  assert.ok(rhy.observed[0].assistantWords > 0);
});

test('persistTurnAnalysis: recordAriaResponse gated on HUMANITY_PATTERN_DETECTOR_ENABLED', async () => {
  // Flag ON: write fires (no stub failure expected; tracker singleton handles
  // an empty record gracefully). We assert no throw + uid path works.
  const cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  const histCalls = stubPatternHistoryTracker({ entries: [] });
  withEnv({ HUMANITY_PATTERN_DETECTOR_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 5,
    });
  });
  await flushMicrotasks();
  // recordAriaResponse → tracker.load() then tracker.save() under the hood.
  assert.ok(
    histCalls.save >= 1,
    'pattern detector save fired when flag on',
  );
  // Continuity write should NOT have fired (its own flag is off in this test).
  assert.equal(cont.save, 0);
});

test('persistTurnAnalysis: recordAriaResponse skipped when flag off', async () => {
  stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  const histCalls = stubPatternHistoryTracker({ entries: [] });
  persistTurnAnalysis({
    uid: 'u1',
    outputScanBlocked: false,
    userMessage: 'hi',
    aiContent: 'hey there friend',
    plan: basePlan(),
    signals: baseSignals(),
    analysis: { emotion: 'happy' },
    turnSessionTurnCount: 5,
  });
  await flushMicrotasks();
  assert.equal(histCalls.save, 0);
});

test('persistTurnAnalysis: continuity.save gated on flag AND analysis AND emotion-valid AND debounce', async () => {
  // Flag ON + analysis with VALID emotion + first chance to write
  // (lastWrittenTurn=-1) → save fires.
  let cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  assert.equal(cont.save, 1, 'save fires when all gates pass');

  // Flag ON but analysis = null → no save.
  resetAllStubs();
  cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: null,
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  assert.equal(cont.save, 0, 'no save when analysis is null');

  // Flag ON, analysis present, but emotion not in EMOTION_KEYS → no save.
  resetAllStubs();
  cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: { emotion: 'NOT_A_REAL_EMOTION' },
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  assert.equal(cont.save, 0, 'no save when emotion is invalid');
});

test('persistTurnAnalysis: continuity snapshot captures emotion + user signals', async () => {
  const cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey there friend',
      plan: basePlan(),
      signals: baseSignals({
        emotionalDisclosure: true,
        userMessageComplexity: 'deep',
      }),
      analysis: { emotion: 'caring' },
      turnSessionTurnCount: 7,
    });
  });
  await flushMicrotasks();
  assert.equal(cont.save, 1);
  const snap = cont.savedArgs[0].snap;
  assert.equal(snap.dominantEmotion, 'caring');
  assert.equal(snap.turnCount, 7);
  // confidenceFromUserSignal: base=0.6 (disclosure=true) + 0.2 (deep) = 0.8
  assert.equal(snap.confidence, 0.8);
});

test('persistTurnAnalysis: policyTrajectory.appendDecision gated on HUMANITY_TONE_INERTIA_ENABLED', async () => {
  // Flag OFF
  let pol = stubPolicyTracker();
  stubRhythmTracker();
  stubContinuityTracker();
  persistTurnAnalysis({
    uid: 'u1',
    outputScanBlocked: false,
    userMessage: 'hi',
    aiContent: 'hey',
    plan: basePlan(),
    signals: baseSignals(),
    analysis: { emotion: 'happy' },
    turnSessionTurnCount: 3,
  });
  await flushMicrotasks();
  assert.equal(pol.appendDecision, 0, 'no append when flag off');

  // Flag ON → append fires with 4D vector
  resetAllStubs();
  pol = stubPolicyTracker();
  stubRhythmTracker();
  stubContinuityTracker();
  withEnv({ HUMANITY_TONE_INERTIA_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey',
      plan: basePlan({
        warmth: 0.7,
        curiosity: 0.3,
        depth: 0.6,
        playfulness: 0.4,
      }),
      signals: baseSignals(),
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  assert.equal(pol.appendDecision, 1, 'append fires when flag on');
  assert.deepEqual(pol.appended[0].plan, {
    warmth: 0.7,
    curiosity: 0.3,
    depth: 0.6,
    playfulness: 0.4,
  });
  assert.equal(pol.appended[0].uid, 'u1');
});

test('persistTurnAnalysis: returns void synchronously (fire-and-forget)', () => {
  stubRhythmTracker();
  stubPolicyTracker();
  stubContinuityTracker();
  const result = withEnv(
    {
      HUMANITY_RHYTHM_BIAS_ENABLED: 'true',
      HUMANITY_PATTERN_DETECTOR_ENABLED: 'true',
      HUMANITY_TONE_INERTIA_ENABLED: 'true',
      HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true',
    },
    () =>
      persistTurnAnalysis({
        uid: 'u1',
        outputScanBlocked: false,
        userMessage: 'hi',
        aiContent: 'hey',
        plan: basePlan(),
        signals: baseSignals(),
        analysis: { emotion: 'happy' },
        turnSessionTurnCount: 3,
      }),
  );
  assert.equal(result, undefined, 'persistTurnAnalysis returns void');
});

test('persistTurnAnalysis: tracker.observe rejection does not throw out of caller', async () => {
  // Replace rhythm tracker with one whose observe() rejects.
  const tracker = {
    async getHint() {
      return { preferred: null, confidence: 0, sampleSize: 0, reason: 'disabled' };
    },
    async observe() {
      throw new Error('boom');
    },
    invalidate() {},
  };
  setRhythmTrackerForTesting(tracker);
  stubPolicyTracker();
  stubContinuityTracker();
  withEnv({ HUMANITY_RHYTHM_BIAS_ENABLED: 'true' }, () => {
    // Must not throw out.
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey',
      plan: basePlan(),
      signals: baseSignals(),
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  // If we got here without an unhandled rejection escaping, the .catch
  // swallow path worked.
  assert.ok(true);
});

test('persistTurnAnalysis: userMessageComplexity defaults to medium when omitted', async () => {
  const cont = stubContinuityTracker();
  stubRhythmTracker();
  stubPolicyTracker();
  withEnv({ HUMANITY_EMOTIONAL_CONTINUITY_ENABLED: 'true' }, () => {
    persistTurnAnalysis({
      uid: 'u1',
      outputScanBlocked: false,
      userMessage: 'hi',
      aiContent: 'hey',
      plan: basePlan(),
      // signals without userMessageComplexity
      signals: {
        repairSignal: false,
        emotionalDisclosure: false,
        consentSensitive: false,
      },
      analysis: { emotion: 'happy' },
      turnSessionTurnCount: 3,
    });
  });
  await flushMicrotasks();
  assert.equal(cont.save, 1);
  // confidenceFromUserSignal: base=0.2 (disclosure=false) + 0.1 (medium) = 0.3
  assert.ok(
    Math.abs(cont.savedArgs[0].snap.confidence - 0.3) < 1e-9,
    `expected ~0.3, got ${cont.savedArgs[0].snap.confidence}`,
  );
});
