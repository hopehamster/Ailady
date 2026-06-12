// T1.9 — auth-required regression for every callable in index.ts.
//
// Rationale: most callables already throw HttpsError('unauthenticated') when
// !context.auth — but a future change could add a new export and forget the
// check. This test guards against that by scanning source.
//
// Allowed exception: handleRevenueCatWebhook is an onRequest webhook that
// uses a shared-secret check (REVENUECAT_WEBHOOK_SECRET) instead of
// context.auth. Documented and tested separately.

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const SRC = path.join(__dirname, '..', 'src', 'index.ts');
const SOURCE = fs.readFileSync(SRC, 'utf8');

// Exports allowed to skip context.auth (must be justified individually).
const WEBHOOK_ALLOWLIST = new Set(['handleRevenueCatWebhook']);

// Parse roughly: find every `export const NAME = functions` block, capture
// its body up to the next export or EOF, then check that body for either an
// auth check or membership in the allowlist.
function extractCallables() {
  const re = /export const (\w+) = functions/g;
  const positions = [];
  let m;
  while ((m = re.exec(SOURCE)) !== null) {
    positions.push({ name: m[1], start: m.index });
  }
  return positions.map((p, i) => {
    const end = i + 1 < positions.length ? positions[i + 1].start : SOURCE.length;
    return { name: p.name, body: SOURCE.slice(p.start, end) };
  });
}

const callables = extractCallables();

test('index.ts has at least 20 callable/request exports (sanity)', () => {
  assert.ok(callables.length >= 20, `expected at least 20 exports, found ${callables.length}`);
});

test('every callable export checks context.auth or is on the webhook allowlist', () => {
  const failures = [];
  for (const { name, body } of callables) {
    if (WEBHOOK_ALLOWLIST.has(name)) continue;

    const usesOnCall = /\.https\.onCall\s*\(/.test(body);
    const usesOnRequest = /\.https\.onRequest\s*\(/.test(body);
    if (!usesOnCall && !usesOnRequest) continue; // not an HTTPS-triggered export

    // Allowlist webhooks need a separate justification; everything else MUST
    // either reference context.auth or throw HttpsError('unauthenticated')
    // (callable pattern), OR verify a Firebase ID token and reject with 401
    // (onRequest pattern, e.g. the SSE streaming endpoint).
    const hasAuthRef = /context\.auth/.test(body);
    const hasUnauthErr = /HttpsError\(\s*['"]unauthenticated['"]/.test(body);
    const hasIdTokenAuth = /verifyIdToken\s*\(/.test(body) && /401/.test(body);

    if (!hasAuthRef && !hasUnauthErr && !hasIdTokenAuth) {
      failures.push(name);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `Callables missing context.auth check: ${failures.join(', ')}. ` +
      'Add an auth gate or add to WEBHOOK_ALLOWLIST with justification.'
  );
});

test('RevenueCat webhook hard-fails on empty secret (no silent bypass)', () => {
  const body =
    SOURCE.split('export const handleRevenueCatWebhook')[1]?.split('export const')[0] ?? '';
  assert.ok(body.length > 0, 'handleRevenueCatWebhook not found');

  // Must contain an explicit "!webhookSecret → reject" block.
  assert.ok(
    /if\s*\(\s*!webhookSecret\s*\)[\s\S]*?(503|res\.status\(\s*503)/.test(body),
    'Webhook must explicitly reject (503) when REVENUECAT_WEBHOOK_SECRET is unset'
  );
});
