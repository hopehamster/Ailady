const test = require('node:test');
const assert = require('node:assert/strict');

const { buildAnthropicSystemParam } = require('../lib/services/anthropicCache.js');
const { CACHE_BOUNDARY_MARKER } = require('../lib/services/promptComposer.js');

test('no boundary → returns the plain string unchanged', () => {
  const s = 'You are Aria. Be warm.';
  assert.equal(buildAnthropicSystemParam(s), s);
});

test('boundary → splits into cached stable prefix + uncached volatile tail', () => {
  const prompt = `STABLE PREFIX\n\n${CACHE_BOUNDARY_MARKER}\n\nVOLATILE TAIL`;
  const out = buildAnthropicSystemParam(prompt);
  assert.ok(Array.isArray(out));
  assert.equal(out.length, 2);
  // stable block is cache_control: ephemeral
  assert.equal(out[0].type, 'text');
  assert.equal(out[0].text, 'STABLE PREFIX');
  assert.deepEqual(out[0].cache_control, { type: 'ephemeral' });
  // volatile block is uncached
  assert.equal(out[1].type, 'text');
  assert.equal(out[1].text, 'VOLATILE TAIL');
  assert.equal(out[1].cache_control, undefined);
});

test('only the stable prefix is cached (single breakpoint)', () => {
  const prompt = `A${CACHE_BOUNDARY_MARKER}B`;
  const out = buildAnthropicSystemParam(prompt);
  const cached = out.filter((b) => b.cache_control);
  assert.equal(cached.length, 1);
  assert.equal(cached[0].text, 'A');
});

test('empty volatile tail → only the cached stable block', () => {
  const prompt = `STABLE ONLY${CACHE_BOUNDARY_MARKER}   `;
  const out = buildAnthropicSystemParam(prompt);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'STABLE ONLY');
  assert.deepEqual(out[0].cache_control, { type: 'ephemeral' });
});

test('empty stable prefix → only the uncached volatile block', () => {
  const prompt = `   ${CACHE_BOUNDARY_MARKER}VOLATILE ONLY`;
  const out = buildAnthropicSystemParam(prompt);
  assert.equal(out.length, 1);
  assert.equal(out[0].text, 'VOLATILE ONLY');
  assert.equal(out[0].cache_control, undefined);
});

test('boundary with no content either side → falls back to string', () => {
  const prompt = `  ${CACHE_BOUNDARY_MARKER}  `;
  assert.equal(buildAnthropicSystemParam(prompt), prompt);
});
