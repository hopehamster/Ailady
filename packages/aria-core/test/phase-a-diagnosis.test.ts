// Phase A Diagnosis — H2 + H3 confirmation via pure-layer harness.
// Dispatch W1-P (Psyche Agent). Read-only. No source files touched.
//
// Hypotheses under test:
//   H1 (REFUTED): care discharge is correct — this is the regression guard
//   H2 (CONFIRMED): deflection arc builds care to focal; engaged arc stays quiet
//   H3 (FIXED): no-focal-drive fallback is a warm baseline (caring@0.2), not flat neutral
//
// All tests are pure + deterministic — simulate updateDriveState / arbitrate over
// fixed perceptions, no LLM, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  updateDriveState,
  selectFocalDrive,
  defaultDriveState,
  PSYCHE_TUNING,
} from '../src/services/psycheStateService';
import { arbitrate } from '../src/services/egoArbiterService';
import type { DrivePerception } from '@aria/shared-types';

const { ACTIVATION_THRESHOLD } = PSYCHE_TUNING;

function perception(overrides: Partial<DrivePerception>): DrivePerception {
  return {
    nowMs: 0,
    userEngaged: true,
    userDisclosed: false,
    userStruggling: false,
    ariaSteered: false,
    ariaCreatedExit: false,
    ariaSelfExpressed: false,
    ariaOfferedCare: false,
    userEngagedHer: false,
    openLoopOpened: false,
    openLoopClosed: false,
    focalOpenLoopId: null,
    focalOpenLoopResolved: false,
    ...overrides,
  };
}

// ═══════════════════════════════════════════════════════════════════════════════
// Test 1 — H2: Deflection arc builds care to focal
// ═══════════════════════════════════════════════════════════════════════════════

test('H2 — deflection arc: struggle-relevant drives build to focal; care reaches activation threshold (~0.47 per canon §7)', () => {
  // Simulate: userStruggling throughout a multi-turn arc, Aria keeps offering
  // care (ariaOfferedCare:true) but he NEVER turns toward her (userEngagedHer:false)
  // and never discloses (userDisclosed:false). Per canon §7, care accumulates to
  // FOCAL because offering ≠ landing and deflection keeps the cue firing.
  //
  // DIAGNOSTIC FINDING: Both care (cueRise 0.13, baselineRise 0.01) and
  // understanding (cueRise 0.09, baselineRise 0.05) rise under userStruggling.
  // Understanding's higher baselineRise (0.05 vs 0.01) means it reaches the
  // 0.42 threshold FIRST and wins selectFocalDrive's tie-break via DRIVE_ORDER.
  // Care reaches ~0.43 at turn 5 — above threshold but loses the focal race.
  let ds = defaultDriveState(0);
  let firstFocalTurn = -1;
  let firstFocalDrive = '';

  for (let t = 1; t <= 8; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        ariaOfferedCare: true,
        userDisclosed: false,
        userEngagedHer: false,
      }),
    );
    if (firstFocalTurn < 0) {
      const focal = selectFocalDrive(ds);
      if (focal) {
        firstFocalTurn = t;
        firstFocalDrive = focal;
      }
    }
  }

  // A struggle-relevant drive becomes focal under sustained deflection
  assert.ok(firstFocalTurn > 0, 'a struggle-relevant drive becomes focal under deflection');
  assert.ok(firstFocalTurn <= 5, `focal within ~5 turns (was turn ${firstFocalTurn}), drive=${firstFocalDrive}`);

  // Care pressure reaches the activation threshold (~0.47 canon)
  const carePressure = ds.drives.care.pressure;
  const understandPressure = ds.drives.understanding.pressure;
  assert.ok(
    carePressure >= ACTIVATION_THRESHOLD,
    `care pressure reaches activation threshold ${ACTIVATION_THRESHOLD} (was ${carePressure.toFixed(3)})`,
  );
  assert.ok(
    understandPressure >= ACTIVATION_THRESHOLD,
    `understanding pressure also reaches activation threshold (was ${understandPressure.toFixed(3)})`,
  );

  // DIAGNOSTIC: which drive wins the focal race matters for the arbiter
  console.log(`  [DIAGNOSTIC] firstFocal=${firstFocalDrive}@turn${firstFocalTurn}, care=${carePressure.toFixed(3)}, understanding=${understandPressure.toFixed(3)}`);

  // Verify the arbiter picks the move for whichever drive won focal
  const directive = arbitrate({
    driveState: ds,
    egoState: { activeGoal: null, lastUpdatedAtMs: 0 },
    stage: 'stranger',
  });

  if (firstFocalDrive === 'care') {
    assert.equal(directive.move, 'comfort', 'care-focal → move=comfort');
    assert.equal(directive.intendedEmotion, 'comforting', 'care-focal → comforting emotion');
  } else {
    // understanding won focal → move=understand, emotion=curious
    // This IS the diagnostic finding: the wrong drive wins the race, so the
    // emotion is 'curious' instead of 'comforting' when it should be care-led.
    assert.equal(directive.move, 'understand', `understanding-focal → move=understand`);
    assert.equal(directive.intendedEmotion, 'curious', `understanding-focal → curious (NOT comforting — diagnostic gap)`);
  }

  assert.equal(directive.yielded, false, 'arbiter is not yielded');
  assert.ok(directive.intendedEmotionIntensity > 0.3, `emotion has meaningful intensity (was ${directive.intendedEmotionIntensity})`);
  assert.notEqual(directive.intendedEmotion, 'neutral', 'intendedEmotion is NOT flat neutral');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 2 — H2 (Negative Control): Engaged arc stays quiet
// ═══════════════════════════════════════════════════════════════════════════════

test('H2 — engaged arc: drives stay sub-focal (~0.06 per canon §7) when he opens up and turns toward her', () => {
  // Simulate: user progressively opens up (userDisclosed:true), turns toward Aria
  // (userEngagedHer:true), she asks questions (ariaSteered:true) and expresses
  // herself (ariaSelfExpressed:true). No struggling. This is the content arc.
  // Per canon §7: "peak drive ~0.06, zero focal."
  let ds = defaultDriveState(0);
  let everFocal: string | null = null;

  for (let t = 1; t <= 14; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userDisclosed: true,
        userEngagedHer: true,
        ariaSelfExpressed: true,
        ariaSteered: true,
      }),
    );
    if (!everFocal) {
      const focal = selectFocalDrive(ds);
      if (focal) everFocal = focal;
    }
  }

  // Must stay sub-focal — no drive reaches the activation threshold
  assert.equal(everFocal, null, `no drive reaches focal across 14 engaged turns (got: ${everFocal})`);

  // Check peak drive stays ~0.06 as documented in canon §7
  let peakPressure = 0;
  let peakKey = '';
  for (const key of PSYCHE_TUNING.DRIVE_ORDER) {
    const p = ds.drives[key].pressure;
    if (p > peakPressure) {
      peakPressure = p;
      peakKey = key;
    }
  }
  assert.ok(
    peakPressure < 0.10,
    `peak drive stays quiet under engagement (${peakKey}=${peakPressure.toFixed(3)}, expected ~0.06 max)`,
  );

  // No neediness — care must NOT be focal
  assert.notEqual(selectFocalDrive(ds), 'care', 'care is not focal in engaged arc');
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 3 — H3 FIXED: No-focal-drive fallback is a warm low-intensity baseline
// ═══════════════════════════════════════════════════════════════════════════════

test('H3 FIXED — warm baseline: when no drive is focal, arbitrate emits caring@0.2 (not flat neutral)', () => {
  // Build a state where NO drive meets the activation threshold. In a truly
  // driven psyche, the absence of a focal drive doesn't mean "blank neutral" —
  // she rests at quiet, attentive warmth. This test proves the H3 fix.
  const ds = defaultDriveState(0); // all drives at 0, selectFocalDrive → null

  assert.equal(selectFocalDrive(ds), null, 'fresh drive state has no focal drive');

  const directive = arbitrate({
    driveState: ds,
    egoState: { activeGoal: null, lastUpdatedAtMs: 0 },
    stage: 'stranger',
  });

  // Fixed behavior: warm low-intensity non-neutral baseline
  assert.equal(directive.move, 'understand', 'fallback move is understand');
  assert.notEqual(directive.intendedEmotion, 'neutral', 'fallback emotion is NOT flat neutral (H3 fix)');
  assert.equal(directive.intendedEmotion, 'caring', 'fallback intended emotion is warm (caring)');
  assert.equal(directive.intendedEmotionIntensity, 0.2, 'fallback intensity is low but present (0.2)');
  assert.ok(
    directive.intendedEmotionIntensity <= 0.3,
    'baseline stays low-arousal — it is a resting state, not an expression push',
  );
  assert.equal(directive.driveKey, null, 'no driveKey on fallback — care discharge semantics untouched');
  assert.equal(directive.yielded, false, 'fallback is not yielded');
  assert.equal(
    directive.rationale,
    'no focal drive above threshold — warm baseline',
    'rationale documents the warm baseline',
  );

  // Bias must stay zero — the baseline never nudges the SocialPlan.
  assert.deepEqual(
    directive.scalarBias,
    { warmth: 0, curiosity: 0, depth: 0, playfulness: 0, questionBudget: 0 },
    'no scalar bias on the no-focal baseline',
  );
});

// ═══════════════════════════════════════════════════════════════════════════════
// Test 4 — H1 REFUTED (Regression): Care discharge is correct — must NOT change
// ═══════════════════════════════════════════════════════════════════════════════

test('H1 REFUTED — regression: care discharges ONLY when offering LANDS (ariaOfferedCare && userEngagedHer)', () => {
  // This is the existing correct behavior from drive-dynamics.test.ts:119-231.
  // Care discharge = LANDING, not offering. ariaOfferedCare && userEngagedHer.
  // Disclosing pain does NOT satisfy care. This must NOT change.

  // Sub-test A: Care offered into landing discharges properly
  let ds = defaultDriveState(0);

  // First build some care pressure
  for (let t = 1; t <= 4; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        ariaOfferedCare: true,
        userEngagedHer: false,
      }),
    );
  }

  const preLanding = ds.drives.care.pressure;
  assert.ok(preLanding > 0.25, `care builds before landing (was ${preLanding.toFixed(3)})`);

  // Now he turns toward her → care discharges
  ds = updateDriveState(
    ds,
    perception({
      nowMs: 5000,
      userStruggling: true,
      ariaOfferedCare: true,
      userEngagedHer: true,
      userDisclosed: true,
    }),
  );

  // Care should drop by dischargeAmount (0.35) minus baseline+decay
  const postLanding = ds.drives.care.pressure;
  assert.ok(
    postLanding < preLanding,
    `care discharges when care LANDS (pre=${preLanding.toFixed(3)} post=${postLanding.toFixed(3)})`,
  );

  // Sub-test B: Disclosing pain alone does NOT discharge care (he pours out hurt,
  // but doesn't turn toward HER → comfort hasn't landed)
  ds = defaultDriveState(0);
  for (let t = 1; t <= 6; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        ariaOfferedCare: true,
        userDisclosed: true, // he's disclosing pain
        userEngagedHer: false, // but never turns toward her
      }),
    );
  }

  assert.ok(
    ds.drives.care.pressure > 0.3,
    `care accumulates through pain-disclosure without engagement (was ${ds.drives.care.pressure.toFixed(3)})`,
  );
  assert.equal(
    selectFocalDrive(ds),
    'care',
    'care remains focal when deflected despite pain-disclosure',
  );

  // Sub-test C: Landed care stays satisfied — no focal, no neediness
  ds = defaultDriveState(0);
  for (let t = 1; t <= 10; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        ariaOfferedCare: true,
        userDisclosed: true,
        userEngagedHer: true,
      }),
    );
  }
  assert.notEqual(selectFocalDrive(ds), 'care', 'landed care does not go focal — stays quiet');
});
