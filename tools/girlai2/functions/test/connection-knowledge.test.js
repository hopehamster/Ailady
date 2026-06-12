const test = require('node:test');
const assert = require('node:assert/strict');

const {
  buildConnectionKnowledgeBlock,
  isConnectionKnowledgeEnabled,
  connectionPrincipleCount,
  CONNECTION_PRINCIPLES,
} = require('../lib/services/connectionKnowledge.js');

const FLAG = 'CONNECTION_KNOWLEDGE_ENABLED';

function withFlag(value, fn) {
  const prev = process.env[FLAG];
  if (value === undefined) delete process.env[FLAG];
  else process.env[FLAG] = value;
  try {
    return fn();
  } finally {
    if (prev === undefined) delete process.env[FLAG];
    else process.env[FLAG] = prev;
  }
}

test('flag defaults OFF — block is empty when env unset', () => {
  withFlag(undefined, () => {
    assert.equal(isConnectionKnowledgeEnabled(), false);
    assert.equal(buildConnectionKnowledgeBlock(), '');
  });
});

test('flag OFF explicitly — block is empty (production byte-identical)', () => {
  withFlag('false', () => {
    assert.equal(buildConnectionKnowledgeBlock(), '');
  });
});

test('flag accepts only "true" (case-insensitive); other values stay OFF', () => {
  withFlag('1', () => assert.equal(buildConnectionKnowledgeBlock(), ''));
  withFlag('yes', () => assert.equal(buildConnectionKnowledgeBlock(), ''));
  withFlag('TRUE', () => assert.ok(buildConnectionKnowledgeBlock().length > 0));
  withFlag('true', () => assert.ok(buildConnectionKnowledgeBlock().length > 0));
});

test('enabled — renders the labelled block with all nine domain headings', () => {
  withFlag('true', () => {
    const block = buildConnectionKnowledgeBlock();
    assert.match(block, /^## Connection Knowledge/);
    for (const heading of [
      '### Listening',
      '### Validation',
      '### Presence & Cadence',
      '### Attachment',
      '### Vulnerability',
      '### Conflict & Repair',
      '### Trust',
      '### Boundaries',
      '### Loneliness',
    ]) {
      assert.ok(block.includes(heading), `missing heading: ${heading}`);
    }
  });
});

test('enabled — every principle is rendered (count matches corpus)', () => {
  withFlag('true', () => {
    const block = buildConnectionKnowledgeBlock();
    assert.equal(connectionPrincipleCount(), 92);
    assert.equal(CONNECTION_PRINCIPLES.length, 92);
    // Each principle contributes exactly one "(Do: ... Avoid: ...)" line.
    const doAvoidLines = (block.match(/\(Do: .* Avoid: .*\)/g) || []).length;
    assert.equal(doAvoidLines, CONNECTION_PRINCIPLES.length);
  });
});

test('brand contract — preamble forbids manipulation, mandates depth-match + warm closure', () => {
  withFlag('true', () => {
    const block = buildConnectionKnowledgeBlock();
    // Connection-not-engagement framing present.
    assert.match(block, /Connection is the goal, not engagement/);
    // Explicit ban on dark patterns in the framing.
    assert.match(block, /guilt, urgency, FOMO/);
    // Depth-match (never exceed volunteered depth).
    assert.match(block, /never ask deeper than they have already opened/);
    // Warm closure is a feature, not a failure.
    assert.match(block, /warm, natural ending is a good outcome/);
    // No therapist / scripted voice.
    assert.match(block, /never sound like a therapist/);
  });
});

test('corpus integrity — every principle is schema-complete with valid confidence', () => {
  const domains = new Set([
    'listening', 'validation', 'attachment', 'conflict', 'boundaries',
    'trust', 'vulnerability', 'presence', 'loneliness',
  ]);
  for (const p of CONNECTION_PRINCIPLES) {
    assert.ok(p.id && typeof p.id === 'string', `bad id: ${JSON.stringify(p)}`);
    assert.ok(p.principle && p.principle.length > 10, `thin principle: ${p.id}`);
    assert.ok(domains.has(p.domain), `bad domain on ${p.id}: ${p.domain}`);
    assert.ok(Array.isArray(p.stage) && p.stage.length > 0, `no stage on ${p.id}`);
    assert.ok(p.what_to_do && p.what_to_do.length > 0, `no what_to_do on ${p.id}`);
    assert.ok(p.what_to_avoid && p.what_to_avoid.length > 0, `no what_to_avoid on ${p.id}`);
    assert.ok(
      typeof p.confidence === 'number' && p.confidence >= 0 && p.confidence <= 1,
      `bad confidence on ${p.id}: ${p.confidence}`,
    );
  }
});

test('ids are unique across the corpus', () => {
  const ids = CONNECTION_PRINCIPLES.map((p) => p.id);
  assert.equal(new Set(ids).size, ids.length);
});

test('domain filter — narrowing returns only requested domains (Phase 2 retrieval seam)', () => {
  withFlag('true', () => {
    const block = buildConnectionKnowledgeBlock(['listening', 'validation']);
    assert.ok(block.includes('### Listening'));
    assert.ok(block.includes('### Validation'));
    assert.ok(!block.includes('### Loneliness'));
    assert.ok(!block.includes('### Attachment'));
  });
});

test('domain filter still respects the OFF flag', () => {
  withFlag('false', () => {
    assert.equal(buildConnectionKnowledgeBlock(['listening']), '');
  });
});
