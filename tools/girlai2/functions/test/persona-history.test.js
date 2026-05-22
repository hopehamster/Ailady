const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

// Stub firebase-admin + firebase-functions before loading the module.
const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubAdminPath = path.join(__dirname, '_firebase-admin-stub.js');
const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin') return stubAdminPath;
  return origResolve.call(this, req, ...rest);
};

// Build minimal admin stub on disk so the require resolves.
const fs = require('node:fs');
if (!fs.existsSync(stubAdminPath)) {
  fs.writeFileSync(stubAdminPath, `
    let lastWrite = null;
    module.exports = {
      firestore: () => ({
        collection: (c) => ({
          doc: (d) => ({
            collection: (sub) => ({
              add: async (data) => {
                lastWrite = { collection: c, scope: d, subcollection: sub, data };
                return { id: 'evt_test' };
              },
            }),
          }),
        }),
      }),
    };
    module.exports.firestore.FieldValue = {
      serverTimestamp: () => '<<server-ts>>',
    };
    module.exports.__getLastWrite = () => lastWrite;
  `);
}

const personaHistory = require('../lib/personaHistory.js');
const adminStub = require(stubAdminPath);

test('writePersonaEvent stores event in persona_history/{scope}/events', async () => {
  await personaHistory.writePersonaEvent({
    scope: 'aria-v1',
    kind: 'persona.created',
    actor: 'admin',
    after: { displayName: 'Aria', tone: 'warm' },
    reason: 'initial seed',
  });
  const last = adminStub.__findLastWriteTo
    ? adminStub.__findLastWriteTo('persona_history')
    : adminStub.__getLastWrite();
  assert.equal(last.collection, 'persona_history');
  assert.equal(last.scope, 'aria-v1');
  assert.equal(last.subcollection, 'events');
  assert.equal(last.data.kind, 'persona.created');
  assert.equal(last.data.actor, 'admin');
});

test('diffFields returns the set of changed top-level fields', () => {
  const before = { a: 1, b: 'hello', c: [1, 2] };
  const after = { a: 1, b: 'world', c: [1, 2], d: true };
  const changed = personaHistory.diffFields(before, after);
  assert.deepEqual(changed.sort(), ['b', 'd'].sort());
});

test('diffFields treats null before as full add', () => {
  const changed = personaHistory.diffFields(null, { a: 1, b: 2 });
  assert.deepEqual(changed.sort(), ['a', 'b']);
});

test('diffFields returns [] when both null', () => {
  assert.deepEqual(personaHistory.diffFields(null, null), []);
});
