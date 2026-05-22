const test = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const Module = require('node:module');

const stubFunctionsPath = path.join(__dirname, '_firebase-functions-stub.js');
const stubAdminPath = path.join(__dirname, '_firebase-admin-stub.js');

const origResolve = Module._resolveFilename;
Module._resolveFilename = function (req, ...rest) {
  if (req === 'firebase-functions') return stubFunctionsPath;
  if (req === 'firebase-admin') return stubAdminPath;
  return origResolve.call(this, req, ...rest);
};

const adminStub = require(stubAdminPath);

function freshGate() {
  // Force module re-evaluation so the 5-min cache resets between tests.
  delete require.cache[require.resolve('../lib/appCheckGate.js')];
  return require('../lib/appCheckGate.js');
}

function ctx({ app = null, auth = null } = {}) {
  return { app, auth };
}

test('attested call (app present) is no-op in every mode', async () => {
  for (const mode of ['shadow', 'enforce', 'off']) {
    adminStub.__setAppCheckMode(mode);
    const { ensureAppCheck } = freshGate();
    await assert.doesNotReject(
      ensureAppCheck(ctx({ app: { appId: 'x' } }), 'someAction'),
      `attested call should never throw in mode=${mode}`
    );
  }
});

test('shadow mode: missing token logs but does not throw', async () => {
  adminStub.__setAppCheckMode('shadow');
  const { ensureAppCheck } = freshGate();
  await assert.doesNotReject(ensureAppCheck(ctx(), 'testAction'));
});

test('enforce mode: missing token throws failed-precondition', async () => {
  adminStub.__setAppCheckMode('enforce');
  const { ensureAppCheck } = freshGate();
  await assert.rejects(
    () => ensureAppCheck(ctx(), 'testAction'),
    (err) => err.code === 'failed-precondition'
  );
});

test('off mode: missing token is a no-op (kill switch)', async () => {
  adminStub.__setAppCheckMode('off');
  const { ensureAppCheck } = freshGate();
  await assert.doesNotReject(ensureAppCheck(ctx(), 'testAction'));
});
