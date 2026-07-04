// Release preflight (#26) — the ENFORCEMENT for "staging/prod cannot ship dev
// values". Parses the given wrangler config and exits nonzero on any dev/
// placeholder value, so `wrangler deploy` is gated by an explicit, testable
// check instead of a comment. Zero deps (regex-level TOML checks).
//
//   node scripts/release/preflight.mjs [apps/worker/wrangler.production.toml]
//
// Checked (each is a real fail-closed hazard if it leaks to prod):
//   ENV must be "production" (or "staging")   — dev unlocks mock OTP + dev gates
//   OTP_VENDOR must not be "mock"             — auth bypass outside dev
//   D1 database_id must not be a placeholder  — deploy would bind nothing real
//   ALLOWED_ORIGINS must not contain localhost/127.0.0.1 or REPLACE_ tokens
//   No REPLACE_WITH_* tokens anywhere         — unfilled config
import { readFileSync } from 'node:fs';

const path = process.argv[2] ?? 'apps/worker/wrangler.production.toml';
const toml = readFileSync(path, 'utf8');
const failures = [];

const grab = (key) => toml.match(new RegExp(`^${key}\\s*=\\s*"([^"]*)"`, 'm'))?.[1];

const env = grab('ENV');
if (env !== 'production' && env !== 'staging') {
  failures.push(`ENV is "${env}" — must be "production" or "staging" (dev unlocks mock OTP + dev gates)`);
}
const vendor = grab('OTP_VENDOR');
if (vendor === 'mock') failures.push('OTP_VENDOR is "mock" — real vendor required outside dev');

const dbId = grab('database_id');
if (!dbId || /placeholder|REPLACE/i.test(dbId)) {
  failures.push(`database_id is "${dbId}" — run \`wrangler d1 create\` and paste the real id`);
}
const origins = grab('ALLOWED_ORIGINS') ?? '';
if (/localhost|127\.0\.0\.1/.test(origins)) failures.push(`ALLOWED_ORIGINS contains a local origin: "${origins}"`);
if (/REPLACE/i.test(origins)) failures.push('ALLOWED_ORIGINS is an unfilled placeholder');

const leftover = toml.match(/REPLACE_WITH_\w+/g) ?? [];
for (const t of new Set(leftover)) failures.push(`unfilled placeholder token: ${t}`);

if (failures.length) {
  console.error(`✗ release preflight FAILED for ${path}:`);
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log(`✓ release preflight passed for ${path} (ENV=${env}, vendor=${vendor})`);
