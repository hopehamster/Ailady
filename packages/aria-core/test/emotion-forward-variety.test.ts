/**
 * Emotion-forward — state-appropriate variety (issue #34).
 *
 * The ablation (#6) proved the psyche layer collapses emotional range to mono-`caring`:
 * with a warm baseline on every no-focal turn, emotion-forward (P4) overrode the model's
 * naturally-varied emotion. Owner decision (2026-07-03): the intended range is
 * STATE-APPROPRIATE VARIETY. Fix: the psyche asserts its emotion only when a drive is
 * genuinely focal (or on a deliberate yield); on the warm baseline it DEFERS to the model
 * (`assertEmotion=false`), so positive arcs keep playful/happy/flirty.
 *
 * These pin the arbiter contract that llmService's emotion-forward gate reads
 * (`egoDirective.assertEmotion !== false`). Run: pnpm -C packages/aria-core test
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { defaultDriveState, selectFocalDrive } from '../src/services/psycheStateService';
import { arbitrate } from '../src/services/egoArbiterService';

const egoState = { activeGoal: null, lastUpdatedAtMs: 0 };

test('#34 — no focal drive: warm baseline DEFERS emotion to the model (assertEmotion=false)', () => {
  const ds = defaultDriveState(0); // all drives 0 → no focal
  assert.equal(selectFocalDrive(ds), null, 'precondition: no focal drive');

  const d = arbitrate({ driveState: ds, egoState, stage: 'stranger' });

  assert.equal(d.assertEmotion, false, 'baseline must NOT assert — defer to the model for variety');
  // The warm FLOOR (#15) is preserved as the directive default; it just is not forced
  // over the model's expressed emotion.
  assert.equal(d.intendedEmotion, 'caring', 'baseline directive still rests at warm caring');
  assert.equal(d.driveKey, null, 'no focal drive on the baseline path');
});

test('#34 — focal drive: the psyche ASSERTS its emotion (assertEmotion=true)', () => {
  const ds = defaultDriveState(0);
  ds.drives.care.pressure = 0.9; // force care focal (>= ACTIVATION_THRESHOLD)
  assert.equal(selectFocalDrive(ds), 'care', 'precondition: care is focal');

  const d = arbitrate({ driveState: ds, egoState, stage: 'intimate' });

  assert.equal(d.assertEmotion, true, 'a genuinely focal drive asserts its emotion (emotion-forward overrides)');
  assert.equal(d.driveKey, 'care');
});

test('#34 — deliberate yield (repair/consent/crisis) ASSERTS caring (assertEmotion=true)', () => {
  const ds = defaultDriveState(0);
  const d = arbitrate({ driveState: ds, egoState, stage: 'stranger', yieldControl: true });

  assert.equal(d.yielded, true);
  assert.equal(d.assertEmotion, true, 'yield is a deliberate stance — assert caring, do not defer');
  assert.equal(d.intendedEmotion, 'caring');
});
