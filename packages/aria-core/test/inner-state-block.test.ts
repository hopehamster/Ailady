// SOUL B1 (#39, epic #35) — broadcast → words. Proves:
//   1. renderInnerState is pure and honors the contract: null/yield → '',
//      baseline-defer (#34 guard) → no move direction (at most the held thread),
//      focal → move pull (+ thread + restraint), never naming the feeling.
//   2. buildResponseAssembly stays BYTE-IDENTICAL when the block is absent
//      (flag-OFF path) — the same no-op guarantee psyche-safety proves for
//      applyEgoBias — and injects the block verbatim when present.
// Pure + deterministic — no model calls, no I/O. Permanent CI guard.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { renderInnerState } from '../src/services/innerStateNarratorService';
import type { EgoDirective } from '../src/services/egoArbiterService';
import {
  buildResponseAssembly,
  type BuildResponseAssemblyArgs,
} from '../src/services/responseAssemblyService';
import type {
  ConversationPolicyPlanSource,
  ConversationPolicySignalSource,
  ConversationPolicyPromptContext,
} from '@aria/shared-types';

// ── fixtures ────────────────────────────────────────────────────────────────

const focalDirective = (over: Partial<EgoDirective> = {}): EgoDirective => ({
  move: 'comfort',
  driveKey: 'care',
  pursueOpenLoopId: null,
  intendedEmotion: 'comforting',
  intendedEmotionIntensity: 0.5,
  assertEmotion: true,
  scalarBias: { warmth: 0.1, curiosity: 0, depth: 0.05, playfulness: 0, questionBudget: 0 },
  restraint: false,
  yielded: false,
  rationale: 'test',
  ...over,
});

const baselineDirective = (): EgoDirective =>
  focalDirective({ driveKey: null, assertEmotion: false, move: 'understand' });

// ── 1. narrator contract ────────────────────────────────────────────────────

test('narrator: no directive and yielded turns render nothing', () => {
  assert.equal(renderInnerState(null), '');
  assert.equal(renderInnerState(focalDirective({ yielded: true })), '');
});

test('narrator: warm baseline defers — no move direction (#34 guard)', () => {
  assert.equal(renderInnerState(baselineDirective()), '');
});

test('narrator: baseline with a held thread carries ONLY the thread', () => {
  const out = renderInnerState(baselineDirective(), { pursuedTopic: 'the Thursday interview' });
  assert.ok(out.includes('the Thursday interview'), 'thread topic must land');
  assert.ok(!out.toLowerCase().includes('hurt'), 'no move-pull language on baseline');
  assert.ok(out.startsWith('[Inner state:'), 'wrapped as a prompt block');
});

test('narrator: focal turn renders the move pull, never the emotion label', () => {
  const d = focalDirective();
  const out = renderInnerState(d);
  assert.ok(out.includes('close to the hurt'), 'comfort pull present');
  assert.ok(
    !out.toLowerCase().includes(d.intendedEmotion.toLowerCase()),
    'never names the feeling (tone hint owns that)',
  );
  assert.ok(out.includes('Never say any of this'), 'show-don\'t-tell clause present');
});

test('narrator: restraint and held thread compose with the pull', () => {
  const out = renderInnerState(focalDirective({ restraint: true }), {
    pursuedTopic: 'his mom\'s visit',
  });
  assert.ok(out.includes('close to the hurt'), 'pull');
  assert.ok(out.includes('his mom\'s visit'), 'thread');
  assert.ok(out.includes('more you want than this moment can hold'), 'restraint narration');
});

test('narrator: every move renders a distinct non-empty pull', () => {
  const moves = ['understand', 'comfort', 'reconnect', 'celebrate', 'lighten', 'know-him', 'give-space'] as const;
  const outs = moves.map((m) => renderInnerState(focalDirective({ move: m })));
  for (const o of outs) assert.ok(o.length > 20);
  assert.equal(new Set(outs).size, moves.length, 'no two moves share a pull');
});

// ── 2. assembly byte-identity (flag-OFF no-op) ──────────────────────────────

const assemblyArgs = (innerStateBlock?: string): BuildResponseAssemblyArgs => {
  const policyPlan: ConversationPolicyPlanSource = {
    strategy: 'empathic_reflection',
    warmth: 0.6,
    curiosity: 0.4,
    depth: 0.4,
    playfulness: 0.3,
    askQuestion: false,
    questionBudget: 0,
    questionStyle: 'none',
    responseLength: 'short',
    mirrorUserPhrase: false,
    styleMirrorLevel: 'light',
    repairMode: false,
    consentCheckRequired: false,
    gentleExitLine: false,
    hookStyle: 'none',
    momentumMode: 'steady',
    noPressureLevel: 0,
    avoidInterrogation: false,
  } as ConversationPolicyPlanSource;
  const policySignals = {
    userWordCount: 4,
    userAskedQuestion: false,
    userUsedEmoji: false,
    lowEffort: false,
    flatAcknowledgement: false,
    lightnessRequested: false,
    positiveTone: true,
    negativeTone: false,
    recentAssistantQuestionCount: 0,
    recentUserShortTurnStreak: 0,
    repairSignal: false,
    emotionalDisclosure: false,
    ambiguousIntent: false,
    consentSensitive: false,
    engagementScore: 0.6,
    userEnergy: 'medium',
    playfulSignal: false,
    userMessageComplexity: 'short',
  } as ConversationPolicySignalSource;
  const policyContext: ConversationPolicyPromptContext = {
    memory: null,
    hourOfDay: 12,
    sessionTurnCount: 1,
    stage: 'stranger',
  } as ConversationPolicyPromptContext;
  return {
    systemPrompt: 'You are Aria.',
    promptAugments: {
      personalityBlock: '',
      loreBlock: '',
      semanticRecallBlock: '',
      personaVoiceBlock: '',
      innerLifeBlock: '',
      relationshipBlock: '',
      emotionalMemoryBlock: '',
      moodBlock: '',
    },
    route: 'quality',
    preferRecentExchange: false,
    recentExchangePriorityBlock: '',
    userMessage: 'hey you',
    recentMessages: [],
    policyPlan,
    policySignals,
    policyContext,
    innerStateBlock,
  };
};

test('assembly: absent block (undefined and empty) is byte-identical to the legacy prompt', () => {
  const legacy = buildResponseAssembly(assemblyArgs());
  const withUndefined = buildResponseAssembly(assemblyArgs(undefined));
  const withEmpty = buildResponseAssembly(assemblyArgs(''));
  assert.equal(withUndefined.effectiveSystemPrompt, legacy.effectiveSystemPrompt);
  assert.equal(withEmpty.effectiveSystemPrompt, legacy.effectiveSystemPrompt);
});

test('assembly: a present block lands verbatim in the prompt', () => {
  const block = renderInnerState(focalDirective());
  const withBlock = buildResponseAssembly(assemblyArgs(block));
  const legacy = buildResponseAssembly(assemblyArgs());
  assert.ok(withBlock.effectiveSystemPrompt.includes(block), 'block injected verbatim');
  assert.notEqual(withBlock.effectiveSystemPrompt, legacy.effectiveSystemPrompt);
});
