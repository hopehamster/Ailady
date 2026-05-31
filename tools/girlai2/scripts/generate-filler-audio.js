#!/usr/bin/env node
/* eslint-disable no-console */
/*
 * generate-filler-audio.js
 * ─────────────────────────────────────────────────────────────────────────────
 * One-shot generator for the 25 Aria "interjection" filler clips (L3 of
 * melodic-fluttering-flame.md). Reads assets/audio/fillers/filler_definitions.json
 * and writes one <clip_id>.mp3 next to it, generated via the ElevenLabs
 * text-to-speech API.
 *
 * WHY:
 *   The Aria companion app currently has 5-12s of silence between user input
 *   and Aria's voice. These prefetched clips fire at <300ms while the real
 *   LLM+TTS pipeline runs in the background.
 *
 * USAGE:
 *   # dry-run (no API calls)
 *   node scripts/generate-filler-audio.js --voice-id <id> --dry-run
 *
 *   # full generate (writes 25 .mp3 files)
 *   node scripts/generate-filler-audio.js --voice-id 21m00Tcm4TlvDq8ikWAM
 *
 *   # regenerate only a subset
 *   node scripts/generate-filler-audio.js --voice-id <id> --only mhm_01,yeah_01
 *
 *   # tune voice settings by ear
 *   node scripts/generate-filler-audio.js --voice-id <id> \
 *       --stability 0.6 --style 0.15 --similarity-boost 0.85
 *
 * VOICE ID:
 *   Pick from your own ElevenLabs voice library (Voices tab in the dashboard,
 *   or GET https://api.elevenlabs.io/v1/voices). Required.
 *
 * COST (approximate):
 *   ~$0.01 in ElevenLabs credits for all 25 clips on the Creator tier
 *   (avg ~10 chars per clip × 25 ≈ 250 characters).
 *
 * KEY HANDLING:
 *   ELEVENLABS_API_KEY is loaded from functions/.env.girlai2 (which is
 *   gitignored). NEVER commit or hardcode the key.
 *
 * PORTABILITY:
 *   Pure Node.js 18+ (uses built-in fetch). No npm deps required.
 * ─────────────────────────────────────────────────────────────────────────────
 */

'use strict';

const fs = require('fs');
const path = require('path');

const SCRIPT_DIR = __dirname;
const PROJECT_ROOT = path.resolve(SCRIPT_DIR, '..');
const FILLER_DIR = path.join(PROJECT_ROOT, 'assets', 'audio', 'fillers');
const DEFINITIONS_PATH = path.join(FILLER_DIR, 'filler_definitions.json');
const ENV_PATH = path.join(PROJECT_ROOT, 'functions', '.env.girlai2');

// ─── arg parsing ─────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const out = {
    voiceId: null,
    stability: 0.55,
    similarityBoost: 0.82,
    style: 0.20,
    useSpeakerBoost: true,
    format: 'mp3_44100_64',
    dryRun: false,
    only: null,
  };
  const args = argv.slice(2);
  for (let i = 0; i < args.length; i++) {
    const a = args[i];
    const next = () => args[++i];
    switch (a) {
      case '--voice-id': out.voiceId = next(); break;
      case '--stability': out.stability = parseFloat(next()); break;
      case '--similarity-boost': out.similarityBoost = parseFloat(next()); break;
      case '--style': out.style = parseFloat(next()); break;
      case '--use-speaker-boost': out.useSpeakerBoost = next() !== 'false'; break;
      case '--format': out.format = next(); break;
      case '--dry-run': out.dryRun = true; break;
      case '--only': out.only = next().split(',').map(s => s.trim()).filter(Boolean); break;
      case '--help':
      case '-h':
        console.log('See header comment in this script for usage.');
        process.exit(0);
        break;
      default:
        console.error(`Unknown argument: ${a}`);
        process.exit(2);
    }
  }
  return out;
}

// ─── .env loader (no dotenv dep) ─────────────────────────────────────────────
function loadEnvFile(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`.env file not found: ${filePath}`);
  }
  const text = fs.readFileSync(filePath, 'utf8');
  const env = {};
  for (const rawLine of text.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith('#')) continue;
    const eq = line.indexOf('=');
    if (eq === -1) continue;
    const key = line.slice(0, eq).trim();
    let val = line.slice(eq + 1).trim();
    // strip surrounding quotes
    if ((val.startsWith('"') && val.endsWith('"')) ||
        (val.startsWith("'") && val.endsWith("'"))) {
      val = val.slice(1, -1);
    }
    env[key] = val;
  }
  return env;
}

// ─── ElevenLabs call ─────────────────────────────────────────────────────────
async function synthesizeOne({ apiKey, voiceId, clip, settings, format }) {
  const url = `https://api.elevenlabs.io/v1/text-to-speech/${encodeURIComponent(voiceId)}?output_format=${encodeURIComponent(format)}`;
  const body = {
    text: clip.text,
    model_id: 'eleven_multilingual_v2',
    voice_settings: {
      stability: settings.stability,
      similarity_boost: settings.similarityBoost,
      style: settings.style,
      use_speaker_boost: settings.useSpeakerBoost,
    },
  };
  const res = await fetch(url, {
    method: 'POST',
    headers: {
      'xi-api-key': apiKey,
      'Content-Type': 'application/json',
      'Accept': 'audio/mpeg',
    },
    body: JSON.stringify(body),
  });
  if (!res.ok) {
    let detail = '';
    try { detail = await res.text(); } catch (_) { /* ignore */ }
    throw new Error(`HTTP ${res.status} ${res.statusText} - ${detail.slice(0, 300)}`);
  }
  const buf = Buffer.from(await res.arrayBuffer());
  return buf;
}

// ─── main ────────────────────────────────────────────────────────────────────
async function main() {
  const opts = parseArgs(process.argv);

  if (!opts.voiceId) {
    console.error('ERROR: --voice-id <id> is required.');
    console.error('Pick a voice from your ElevenLabs library (https://elevenlabs.io/app/voice-library or your Voices tab).');
    process.exit(2);
  }

  if (!fs.existsSync(DEFINITIONS_PATH)) {
    console.error(`ERROR: definitions file not found at ${DEFINITIONS_PATH}`);
    process.exit(1);
  }

  const definitions = JSON.parse(fs.readFileSync(DEFINITIONS_PATH, 'utf8'));
  if (!definitions || !Array.isArray(definitions.clips)) {
    console.error('ERROR: definitions JSON missing "clips" array.');
    process.exit(1);
  }

  let clips = definitions.clips;
  if (opts.only && opts.only.length) {
    const wanted = new Set(opts.only);
    clips = clips.filter(c => wanted.has(c.id));
    const missing = [...wanted].filter(id => !clips.some(c => c.id === id));
    if (missing.length) {
      console.error(`WARNING: --only ids not found in definitions: ${missing.join(', ')}`);
    }
    if (clips.length === 0) {
      console.error('ERROR: no clips matched --only filter; nothing to do.');
      process.exit(1);
    }
  }

  // Resolve API key only when we actually need it (not in dry-run).
  let apiKey = '';
  if (!opts.dryRun) {
    const env = loadEnvFile(ENV_PATH);
    apiKey = env.ELEVENLABS_API_KEY || process.env.ELEVENLABS_API_KEY || '';
    if (!apiKey) {
      console.error(`ERROR: ELEVENLABS_API_KEY not found in ${ENV_PATH} or process env.`);
      process.exit(1);
    }
  }

  console.log(`Filler audio generator`);
  console.log(`  voice_id           : ${opts.voiceId}`);
  console.log(`  model_id           : eleven_multilingual_v2`);
  console.log(`  output_format      : ${opts.format}`);
  console.log(`  stability          : ${opts.stability}`);
  console.log(`  similarity_boost   : ${opts.similarityBoost}`);
  console.log(`  style              : ${opts.style}`);
  console.log(`  use_speaker_boost  : ${opts.useSpeakerBoost}`);
  console.log(`  output dir         : ${FILLER_DIR}`);
  console.log(`  clips              : ${clips.length}${opts.only ? ` (filtered via --only)` : ''}`);
  console.log(`  dry-run            : ${opts.dryRun}`);
  console.log('');

  if (!opts.dryRun && !fs.existsSync(FILLER_DIR)) {
    fs.mkdirSync(FILLER_DIR, { recursive: true });
  }

  const failures = [];
  const total = clips.length;
  for (let i = 0; i < total; i++) {
    const clip = clips[i];
    const outPath = path.join(FILLER_DIR, `${clip.id}.mp3`);
    const prefix = `[${i + 1}/${total}] ${clip.id} "${clip.text}"`;

    if (opts.dryRun) {
      console.log(`${prefix} -> ${path.relative(PROJECT_ROOT, outPath)} (dry-run, skipped)`);
      continue;
    }

    try {
      const buf = await synthesizeOne({
        apiKey,
        voiceId: opts.voiceId,
        clip,
        settings: {
          stability: opts.stability,
          similarityBoost: opts.similarityBoost,
          style: opts.style,
          useSpeakerBoost: opts.useSpeakerBoost,
        },
        format: opts.format,
      });
      fs.writeFileSync(outPath, buf);
      const kb = (buf.length / 1024).toFixed(1);
      console.log(`${prefix} -> ${kb}kB OK`);
    } catch (err) {
      console.error(`${prefix} -> FAIL: ${err.message}`);
      failures.push({ id: clip.id, error: err.message });
    }
  }

  console.log('');
  if (opts.dryRun) {
    console.log(`Dry-run complete. Would have generated ${total} clip(s) into ${FILLER_DIR}.`);
    return;
  }

  const ok = total - failures.length;
  console.log(`Done. ${ok}/${total} clips generated into ${FILLER_DIR}.`);
  if (failures.length) {
    console.log(`Failed (${failures.length}):`);
    for (const f of failures) console.log(`  - ${f.id}: ${f.error}`);
    console.log('');
    console.log(`Retry just the failures with:`);
    console.log(`  node scripts/generate-filler-audio.js --voice-id ${opts.voiceId} --only ${failures.map(f => f.id).join(',')}`);
    process.exit(1);
  }
}

main().catch(err => {
  console.error('FATAL:', err && err.stack || err);
  process.exit(1);
});
