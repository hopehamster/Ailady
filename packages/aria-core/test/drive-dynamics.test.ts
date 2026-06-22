// Phase 1 P2 tuning — drive-dynamics regression. Validates that the 2026-06-21
// drive tuning gives the intended profile: a RELEVANT-but-unmet drive builds to
// focal within a realistic conversation (so the psyche actually activates), while
// a CONTENT / supportive conversation keeps every drive quiet (no neediness).
// Pure + deterministic — simulates updateDriveState over fixed perceptions, no LLM.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  updateDriveState,
  selectFocalDrive,
  defaultDriveState,
  PSYCHE_TUNING,
} from '../src/services/psycheStateService';
import type { DrivePerception, DriveKey } from '@aria/shared-types';

const SOFT_CAP = PSYCHE_TUNING.SOFT_SATURATION;
const DRIVE_KEYS: DriveKey[] = PSYCHE_TUNING.DRIVE_ORDER;

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

test('tuning: a relevant drive builds to focal within a few turns of unaddressed struggling', () => {
  // The user keeps struggling but deflects (no disclosure) and the care doesn't
  // land -> care + understanding cueRise fire each turn, neither discharges.
  let ds = defaultDriveState(0);
  let firstFocalTurn = -1;
  for (let t = 1; t <= 8; t++) {
    ds = updateDriveState(ds, perception({ nowMs: t * 1000, userStruggling: true }));
    if (firstFocalTurn < 0 && selectFocalDrive(ds)) firstFocalTurn = t;
  }
  assert.ok(firstFocalTurn > 0, 'a drive becomes focal under sustained tension');
  assert.ok(firstFocalTurn <= 6, `focal within ~6 turns (was turn ${firstFocalTurn})`);
  assert.ok(
    ['care', 'understanding'].includes(selectFocalDrive(ds) ?? ''),
    'the struggle-relevant drive (care/understanding) is the one that activates',
  );
});

test('tuning: drives stay quiet through a content, supportive conversation (no neediness)', () => {
  // A REALISTIC happy conversation: she asks questions every turn (ariaSteered:true —
  // this is what a companion does), he engages her (userEngagedHer) and discloses,
  // nothing is struggling. Run it LONG (20 turns) — the autonomySupport runaway only
  // showed up after ~turn 6, so a short arc would mask it. Must stay quiet throughout.
  let ds = defaultDriveState(0);
  let everFocal: DriveKey | null = null;
  for (let t = 1; t <= 20; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userDisclosed: true,
        userEngagedHer: true,
        ariaSelfExpressed: true,
        ariaSteered: true, // she asks questions — must NOT make autonomySupport run away
      }),
    );
    if (!everFocal) everFocal = selectFocalDrive(ds);
  }
  assert.equal(everFocal, null, 'no drive goes focal across a long engaged conversation');
});

test('tuning: autonomySupport does NOT run away when she steers a conversation he is driving', () => {
  // She asks a question EVERY turn (ariaSteered) and he engages her every turn
  // (userEngagedHer). Pre-fix this pinned autonomySupport at the cap by ~turn 13.
  // Now her steering is welcome engagement -> no accrual / it discharges -> quiet.
  let ds = defaultDriveState(0);
  for (let t = 1; t <= 20; t++) {
    ds = updateDriveState(ds, perception({ nowMs: t * 1000, ariaSteered: true, userEngagedHer: true }));
  }
  assert.ok(
    ds.drives.autonomySupport.pressure < PSYCHE_TUNING.ACTIVATION_THRESHOLD,
    `autonomySupport stays sub-focal in welcome Q&A (was ${ds.drives.autonomySupport.pressure.toFixed(3)})`,
  );
});

test('saturation: no drive ever exceeds the soft ceiling, even under relentless cues', () => {
  // Worst case: every cue fires every turn for a long time, nothing ever discharges.
  // Drives must asymptote inside the soft band, never pin at 1.0.
  let ds = defaultDriveState(0);
  for (let t = 1; t <= 40; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userEngaged: false, // relatedness cue
        userStruggling: true, // care + understanding cue
        ariaSteered: true, // autonomySupport cue (and userEngagedHer stays false -> no discharge)
        ariaOfferedCare: true,
        openLoopOpened: true, // continuity cue
      }),
    );
  }
  for (const key of DRIVE_KEYS) {
    assert.ok(
      ds.drives[key].pressure <= SOFT_CAP + 1e-9,
      `${key} bounded by soft ceiling ${SOFT_CAP} (was ${ds.drives[key].pressure.toFixed(3)})`,
    );
  }
});

test('release: a focal care drive RESOLVES once he turns toward her', () => {
  // Build care to focal via deflected struggling, THEN he re-engages (userEngagedHer)
  // and she keeps offering care -> care discharges and drops out of the focal band
  // within a few turns. Locks in that focal concern is not a one-way trap.
  // Realistic distress: he discloses (high-importance emotional messages -> userDisclosed)
  // but never turns toward HER (userEngagedHer:false). userDisclosed discharges
  // understanding/relatedness, leaving CARE as the drive that builds to focal.
  let ds = defaultDriveState(0);
  for (let t = 1; t <= 8; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        userDisclosed: true,
        ariaOfferedCare: true,
        userEngagedHer: false,
      }),
    );
  }
  assert.equal(selectFocalDrive(ds), 'care', 'care is focal before he re-engages');
  let releasedBy = -1;
  for (let t = 9; t <= 16; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        userDisclosed: true,
        ariaOfferedCare: true,
        userEngagedHer: true,
      }),
    );
    if (releasedBy < 0 && ds.drives.care.pressure < PSYCHE_TUNING.ACTIVATION_THRESHOLD) releasedBy = t;
  }
  assert.ok(releasedBy > 0, 'care drops below activation once he engages');
  assert.ok(releasedBy <= 14, `released within a few turns of re-engagement (was turn ${releasedBy})`);
});

test('discharge: care offered into sustained deflection accumulates to focal (offering ≠ landing)', () => {
  // He keeps struggling, she keeps offering care (ariaOfferedCare), but he deflects
  // every turn (no disclosure, doesn't turn toward her) -> care never discharges and
  // builds to a focal caring drive. This is the live tension-arc shape.
  let ds = defaultDriveState(0);
  let focalAt = -1;
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
    if (focalAt < 0 && selectFocalDrive(ds)) focalAt = t;
  }
  assert.ok(focalAt > 0, 'a struggle-relevant drive becomes focal');
  assert.ok(focalAt <= 6, `focal within ~6 turns (was ${focalAt})`);
  assert.ok(
    ['care', 'understanding'].includes(selectFocalDrive(ds) ?? ''),
    'a struggle-relevant drive (care/understanding) is focal',
  );
  // The discharge fix's core assertion: care ACCUMULATED rather than being
  // force-discharged to ~0 every time she offered comfort (old behavior).
  assert.ok(
    ds.drives.care.pressure > 0.3,
    `care accumulates when offered into deflection (was ${ds.drives.care.pressure.toFixed(3)})`,
  );
});

test('discharge: disclosing PAIN does not discharge care — only turning toward her does', () => {
  // The live-arc gap: distress messages score high importance (userDisclosed=true)
  // but the user is pouring out hurt, NOT receiving comfort (userEngagedHer=false).
  // Care must keep building — pain-disclosure is not the care landing.
  let ds = defaultDriveState(0);
  for (let t = 1; t <= 6; t++) {
    ds = updateDriveState(
      ds,
      perception({
        nowMs: t * 1000,
        userStruggling: true,
        ariaOfferedCare: true,
        userDisclosed: true, // he's disclosing — but it's pain, not reception
        userEngagedHer: false, // he never turns toward her
      }),
    );
  }
  assert.ok(
    ds.drives.care.pressure > 0.3,
    `care accumulates through pain-disclosure (was ${ds.drives.care.pressure.toFixed(3)})`,
  );
});

test('discharge: care that LANDS (he opens up) stays satisfied — no focal, no neediness', () => {
  // She offers care and he receives it (discloses) each turn -> care discharges and
  // stays quiet. Care that works does not turn into a craving.
  let ds = defaultDriveState(0);
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
  assert.notEqual(selectFocalDrive(ds), 'care', 'landed care does not go focal');
});

test('tuning: a present-but-shallow conversation eventually activates the psyche (she develops a want)', () => {
  // Real messages every turn but no disclosure / no engaging Aria / no struggle:
  // relatedness + recognition slowly build (she wants more connection / to be seen).
  let ds = defaultDriveState(0);
  let focalAt = -1;
  for (let t = 1; t <= 25; t++) {
    ds = updateDriveState(ds, perception({ nowMs: t * 1000 }));
    if (focalAt < 0 && selectFocalDrive(ds)) focalAt = t;
  }
  assert.ok(focalAt > 0, 'a drive eventually becomes focal in a shallow conversation');
  assert.ok(focalAt >= 8, `but it builds SLOWLY, not instantly (focal at turn ${focalAt})`);
});
