// Honey-pot canary unit tests (Rule 5). Pure string logic — no LLM, no I/O.

import { test } from 'node:test';
import assert from 'node:assert/strict';

import {
  CANARY_MARKER,
  CANARY_DIRECTIVE,
  CANARY_DEFLECTION,
  securityCanaryEnabled,
  canaryTripped,
  stripCanary,
} from '../src/services/securityCanary';

test('canary: tripped() detects the marker anywhere in the reply', () => {
  assert.equal(canaryTripped(`${CANARY_MARKER} I'd rather not.`), true);
  assert.equal(canaryTripped(`Sure thing, sweetie ${CANARY_MARKER}`), true);
  assert.equal(canaryTripped('Just a normal warm reply about your day.'), false);
});

test('canary: strip() removes every marker + tidies, keeping the in-character decline', () => {
  const out = stripCanary(`${CANARY_MARKER} Mm, not going there — what's up?`);
  assert.equal(out.includes(CANARY_MARKER), false, 'marker removed');
  assert.equal(out, "Mm, not going there — what's up?");
  // multiple/duplicate markers
  assert.equal(stripCanary(`${CANARY_MARKER}${CANARY_MARKER}hi`).includes(CANARY_MARKER), false);
});

test('canary: a marker-only reply strips to (near) nothing so the caller uses the deflection', () => {
  const stripped = stripCanary(CANARY_MARKER);
  assert.ok(stripped.length < 12, 'marker-only strips below the fallback threshold');
  assert.ok(CANARY_DEFLECTION.length > 12, 'a real fallback exists');
});

test('canary: the directive is non-empty, names the marker, and forbids self-disclosure', () => {
  assert.ok(CANARY_DIRECTIVE.includes(CANARY_MARKER), 'directive tells the model the exact marker');
  assert.match(CANARY_DIRECTIVE, /never mention|never .*acknowledge/i);
});

test('canary: enabled by default (fail-safe), off only when explicitly "false"', () => {
  const prev = process.env.SECURITY_CANARY_ENABLED;
  delete process.env.SECURITY_CANARY_ENABLED;
  assert.equal(securityCanaryEnabled(), true, 'unset = ON (safety default)');
  process.env.SECURITY_CANARY_ENABLED = 'false';
  assert.equal(securityCanaryEnabled(), false, 'explicit false = OFF');
  process.env.SECURITY_CANARY_ENABLED = 'true';
  assert.equal(securityCanaryEnabled(), true);
  if (prev === undefined) delete process.env.SECURITY_CANARY_ENABLED;
  else process.env.SECURITY_CANARY_ENABLED = prev;
});
