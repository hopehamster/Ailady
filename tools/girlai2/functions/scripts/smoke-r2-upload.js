/**
 * Smoke test for Track A R2 upload path.
 *
 * Reproduces exactly what voiceStorage.uploadToR2 does:
 *   - reads R2_* env vars
 *   - builds the AwsClient (aws4fetch)
 *   - PUTs a tiny test object to aria-voice-audio
 *   - then GETs it via R2_PUBLIC_HOST to verify the custom domain binding
 *
 * Run: node scripts/smoke-r2-upload.js
 *
 * Cleans up after itself (deletes the test object).
 */

const fs = require('fs');
const path = require('path');
const { AwsClient } = require('aws4fetch');

function loadDotEnv(file) {
  const text = fs.readFileSync(file, 'utf8');
  const env = {};
  for (const line of text.split(/\r?\n/)) {
    const m = line.match(/^([A-Z][A-Z0-9_]+)=(.*)$/);
    if (m) env[m[1]] = m[2];
  }
  return env;
}

(async () => {
  const env = loadDotEnv(path.resolve(__dirname, '..', '.env.girlai2'));
  const cfg = {
    accountId: env.R2_ACCOUNT_ID,
    accessKeyId: env.R2_ACCESS_KEY_ID,
    secretAccessKey: env.R2_SECRET_ACCESS_KEY,
    bucket: env.R2_BUCKET_NAME,
    publicHost: env.R2_PUBLIC_HOST,
  };
  for (const [k, v] of Object.entries(cfg)) {
    if (!v) {
      console.error(`MISSING env: R2_${k.toUpperCase()}`);
      process.exit(2);
    }
  }
  console.log('R2 config loaded:', {
    accountId: cfg.accountId.substring(0, 6) + '...',
    bucket: cfg.bucket,
    publicHost: cfg.publicHost,
    accessKeyId: cfg.accessKeyId.substring(0, 6) + '...',
  });

  const client = new AwsClient({
    accessKeyId: cfg.accessKeyId,
    secretAccessKey: cfg.secretAccessKey,
    service: 's3',
    region: 'auto',
  });
  const objectName = `smoke/test-${Date.now()}.txt`;
  const body = Buffer.from(`R2 smoke test @ ${new Date().toISOString()}\n`);
  const s3Endpoint = `https://${cfg.accountId}.r2.cloudflarestorage.com/${cfg.bucket}/${objectName}`;
  const publicEndpoint = `${cfg.publicHost.replace(/\/+$/, '')}/${objectName}`;

  console.log('\n=== PUT via S3 endpoint ===');
  console.log(s3Endpoint);
  const putStart = Date.now();
  const putResp = await client.fetch(s3Endpoint, {
    method: 'PUT',
    body: new Uint8Array(body),
    headers: { 'Content-Type': 'text/plain' },
  });
  const putMs = Date.now() - putStart;
  console.log(`PUT status: ${putResp.status} ${putResp.statusText} (${putMs}ms)`);
  if (!putResp.ok) {
    const errBody = await putResp.text();
    console.error('PUT body:', errBody);
    process.exit(3);
  }

  console.log('\n=== GET via public custom domain ===');
  console.log(publicEndpoint);
  // Give SSL/edge a moment if the domain was just bound.
  await new Promise((r) => setTimeout(r, 2000));
  const getStart = Date.now();
  const getResp = await fetch(publicEndpoint);
  const getMs = Date.now() - getStart;
  console.log(`GET status: ${getResp.status} ${getResp.statusText} (${getMs}ms)`);
  if (!getResp.ok) {
    const errBody = await getResp.text();
    console.error('GET body:', errBody.substring(0, 200));
    console.error('NOTE: custom domain DNS + SSL provisioning takes 1-5 min after binding.');
    console.error('Try re-running this script in 2-3 minutes if GET 404s.');
    process.exit(4);
  }
  const got = await getResp.text();
  if (got !== body.toString()) {
    console.error('GET body did not match PUT body');
    console.error('expected:', JSON.stringify(body.toString()));
    console.error('got:     ', JSON.stringify(got));
    process.exit(5);
  }

  console.log('\n=== cleanup: DELETE test object ===');
  const delResp = await client.fetch(s3Endpoint, { method: 'DELETE' });
  console.log(`DELETE status: ${delResp.status} ${delResp.statusText}`);

  console.log('\n✅ R2 PUT + custom domain GET + DELETE all succeeded.');
  console.log(`   PUT ${putMs}ms / GET ${getMs}ms`);
})().catch((err) => {
  console.error('SMOKE TEST FAILED:', err.message);
  console.error(err.stack);
  process.exit(1);
});
