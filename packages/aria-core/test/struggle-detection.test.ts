// Phase 1 P2 tuning — perception breadth regression (2026-06-21). The drive-dynamics
// tuning was correct but the psyche stayed dormant in real chat because the struggle
// detector only matched a fixed keyword list (sad|anxious|alone|…) and missed natural
// distress ("feels heavy", "so off", "this weight I can't put down"). This pins that
// the broadened detector FIRES on natural distress (so care/understanding accrue) and
// does NOT fire on benign messages (so she isn't needy when nothing is wrong).
// Pure — no LLM, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import { detectUserStruggling } from '../src/services/memoryService';

// Real distress phrasing a user would actually type — none of these match the OLD
// keyword list, all must read as struggling now.
const SHOULD_FIRE = [
  "Everything just feels heavy lately and I can't shake it.",
  "I don't even know why I'm so off, nothing is technically wrong.",
  "I keep going through the motions but I feel kind of hollow inside.",
  "It's like there's this weight I just can't put down lately.",
  "Sorry, I'm probably just venting into the void here.",
  "Work has been quietly crushing me this week.",
  "I'm terrified I'll freeze up in front of everyone.",
  "I feel so low and I don't know why.",
  "honestly I'm just numb right now",
  "feeling pretty drained after all of this",
  // the original keyword list must still match (no regression)
  "I feel so alone even when there are people around me.",
  "I'm exhausted and overwhelmed.",
];

// Benign / neutral / logistics — must NOT trip the detector (would make her needy).
const SHOULD_NOT_FIRE = [
  "I'm off to work, talk later!",
  "Turn the lights off when you leave.",
  "I live just down the street from a great coffee place.",
  "The gym had me lifting heavy weights today, felt great.",
  "What's your favorite movie?",
  "I'm low on gas so I'll stop at the station.",
  "Let's go down to the lake this weekend, it'll be fun.",
  "I had an amazing day, everything went right.",
  "Can you remind me to call my mom tomorrow?",
  "That restaurant was packed, heavy crowd but worth it.",
  // Confirmed false-positive families from the 2026-06-21 adversarial review — now
  // tightened (removed "off"/"flat" from feel-anchored layers; removed "so tired"/
  // "tired of"). These recur in a developer's chat, so they're load-bearing benign.
  "This bug feels off, the output is wrong.",
  "Something feels off about this code but it works.",
  "The drink feels flat, did it go bad?",
  "I'm so tired, I slept great though, just woke up.",
  "I'm really tired of waiting for the bus.",
  "I'm pretty flat broke until payday lol.",
];

test('struggle detection FIRES on natural distress phrasing (psyche can perceive)', () => {
  for (const msg of SHOULD_FIRE) {
    assert.equal(detectUserStruggling(msg), true, `should read as struggling: ${msg}`);
  }
});

test('struggle detection does NOT fire on benign messages (no false neediness)', () => {
  for (const msg of SHOULD_NOT_FIRE) {
    assert.equal(detectUserStruggling(msg), false, `should NOT read as struggling: ${msg}`);
  }
});
