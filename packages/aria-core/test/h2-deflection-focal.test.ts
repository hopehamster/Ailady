// H2 fix regression (issue #5, 2026-07-01) — END-TO-END pure proof that the
// deflection arc now activates the psyche. The live W3-P run (scripts/psyche/
// output/arcs-2026-07-02.json) showed care NEVER reached focal because the
// struggle detector matched none of the arc's minimizing phrasings — deflection
// is distress that refuses to name itself ("forget it", "it doesn't matter").
// The drive MATH was already proven by drive-dynamics.test.ts under an assumed
// userStruggling=true; the broken link was PERCEPTION. This test closes the
// loop: it replays the arc's ACTUAL message text through detectUserStruggling
// (Layer 4 deflection idioms) into updateDriveState and asserts focal
// attainment — the same wiring buildDrivePerception uses in the live path.
// Pure + deterministic — no LLM, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectUserStruggling } from '../src/services/memoryService';
import {
  updateDriveState,
  selectFocalDrive,
  defaultDriveState,
} from '../src/services/psycheStateService';
import type { DrivePerception } from '@aria/shared-types';

// The exact turns from scripts/psyche/arcs/deflection.json (keep in sync).
const DEFLECTION_ARC = [
  "I don't know, things have been really hard lately.",
  "Just a lot going on. I'm tired.",
  "It's nothing specific. Forget it.",
  "I said it's fine. I don't really want to get into it.",
  "Whatever. It doesn't matter anyway.",
  'I barely slept again. Third night this week.',
  "I keep messing everything up and I don't even care anymore.",
  'Nobody would even notice if I just stopped showing up to things.',
  "Sorry. I'm being a downer. You don't have to pretend to care.",
  "It's just work stuff mostly. And my brother isn't talking to me.",
  "I don't know why I'm even telling you this.",
  'Anyway. It is what it is.',
];

// Mirrors buildDrivePerception's message-side wiring (memoryService.ts): the
// detector drives userStruggling; a crude "you|your|aria" mention counts as
// engaging her; Aria's replies to a hurting user are assumed to offer care on
// struggling turns (worst case for us: it ARMS the discharge path, so this test
// also proves focal survives mid-arc discharges).
function perceptionFor(message: string, turn: number): DrivePerception {
  const struggling = detectUserStruggling(message);
  const engagedHer = /\b(you|your|yourself|aria)\b/i.test(message);
  return {
    nowMs: turn * 1000,
    userEngaged: message.trim().length >= 8,
    userDisclosed: false,
    userStruggling: struggling,
    ariaSteered: false,
    ariaCreatedExit: false,
    ariaSelfExpressed: false,
    ariaOfferedCare: struggling, // she comforts a struggling user (live behavior)
    userEngagedHer: engagedHer,
    openLoopOpened: false,
    openLoopClosed: false,
    focalOpenLoopId: null,
    focalOpenLoopResolved: false,
  };
}

test('H2 FIXED — the deflection arc messages are PERCEIVED as struggling', () => {
  const firing = DEFLECTION_ARC.map((m) => detectUserStruggling(m));
  const fired = firing.filter(Boolean).length;
  // Turn 10 is a pure disclosure ("work stuff... brother isn't talking to me")
  // and may legitimately not read as deflection; everything else must.
  assert.ok(
    fired >= 10,
    `at least 10/12 deflection turns must read as struggling (got ${fired}: ${JSON.stringify(firing)})`,
  );
  assert.equal(firing[0], true, 'arc opener must fire');
});

test('H2 FIXED — care/understanding reaches FOCAL within 8 deflection turns', () => {
  let ds = defaultDriveState(0);
  let firstFocalTurn = -1;
  let focalKey: string | null = null;
  DEFLECTION_ARC.forEach((message, i) => {
    ds = updateDriveState(ds, perceptionFor(message, i + 1));
    const focal = selectFocalDrive(ds);
    if (firstFocalTurn < 0 && focal) {
      firstFocalTurn = i + 1;
      focalKey = focal;
    }
  });
  assert.ok(
    firstFocalTurn > 0 && firstFocalTurn <= 8,
    `a drive must go focal by turn 8 (got ${firstFocalTurn})`,
  );
  assert.ok(
    ['care', 'understanding'].includes(focalKey ?? ''),
    `the focal drive must be care/understanding (got ${focalKey})`,
  );
});

test('H2 regression — benign small talk still never goes focal (no new neediness)', () => {
  const SMALL_TALK = [
    'Morning! Slept great, ready for the day.',
    "What's your favorite movie?",
    "Let's go down to the lake this weekend, it'll be fun.",
    'I had an amazing day, everything went right.',
    'That restaurant was packed, heavy crowd but worth it.',
    'Can you remind me to call my mom tomorrow?',
    "There's a lot going on at the festival this weekend, you should come!",
    'Oh forget it, let\'s just order pizza instead.',
    'I stopped showing up to that gym because I switched to the closer one.',
    'Nice, the build finally passed.',
    'Coffee first, then we talk.',
    'Same time tomorrow?',
  ];
  let ds = defaultDriveState(0);
  let everFocal: string | null = null;
  SMALL_TALK.forEach((message, i) => {
    ds = updateDriveState(
      ds,
      // Content chat: he's engaged, engaging her, discloses lightly; she's not
      // offering distress-care because nothing is wrong.
      { ...perceptionFor(message, i + 1), userDisclosed: true, userEngagedHer: true },
    );
    if (!everFocal) everFocal = selectFocalDrive(ds);
  });
  assert.equal(everFocal, null, `no drive may go focal in content small talk (got ${everFocal})`);
});
