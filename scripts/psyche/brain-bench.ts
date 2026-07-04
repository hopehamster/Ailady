/**
 * 0C — brain-bench: synchronous, provider-tagged, blinded brain scoreboard (epic #35 / issue #37).
 *
 * Benches candidate "brains" for Aria's voice by having EACH candidate answer the SAME fixed
 * per-turn context (single-turn mode = the plan's "clean model-quality signal") through a direct
 * OpenAI-compatible chat call, then emitting one gradeable arc-shaped transcript file per candidate
 * that the trusted grader fleet (`grade-transcripts.ts`) scores — provider-BLIND, because the grader
 * only ever sees `U:`/`A:` dialogue (no model label leaks into the transcript). A durable manifest
 * (`brain-bench-manifest-<date>.json`) records provider/model, latency, cost, blinded label, seed,
 * and response previews so a later scoring step applies the flip gate and a future agent can answer
 * "why did we flip?".
 *
 * TWO-STEP FLOW (this file = step 1, generation):
 *   1) node scripts/psyche/brain-bench.ts            → per-candidate transcript files + manifest
 *   2) for each file:  node scripts/psyche/grade-transcripts.ts <file>   (printed at the end)
 *      then aggregate the aliveness reports + the manifest into the flip-gate scoreboard.
 *
 * WHY single-turn (not full-arc) for v1: it's a single self-contained Node script — no wrangler
 * juggling, no cross-platform process orchestration — and it isolates raw model voice quality per
 * turn (identical context for every candidate → fair relative ranking + clean per-call latency).
 * The full-arc rollout (boot the worker on each finalist's OPENAI_COMPAT_* env → run-arcs.ts) is the
 * later fidelity/latency confirmation step for the 1-2 finalists, per the plan's fairness protocol.
 *
 * FAILING-KEY DIRECTIVE (owner, 2026-07-03: "if a key fails work around it, dont stop working"):
 * a 401/403/429/5xx or network error rotates to the candidate's next key with backoff; if a
 * candidate exhausts its keys on a turn, that turn is recorded as an error and the run CONTINUES;
 * if a candidate can produce no turns at all it is marked errored and we move to the next candidate.
 * The bench NEVER aborts over a single provider/key failure.
 *
 * Keys are read from env first, then scraped from ~/.claude/.secrets (gitignored) by regex — the
 * same best-effort pattern grade-transcripts.ts uses for the Gemini pool. No key is ever written to
 * an output file (only a redacted `keyTail` for audit).
 *
 * Run (Node >= 22.6 strips TS types natively):
 *   node scripts/psyche/brain-bench.ts
 *
 * Env:
 *   SOURCE_ARCS   arc transcript that supplies the fixed per-turn context (user turns + reference
 *                 replies). Default scripts/psyche/output/arcs-regate-2026-07-03.json (the GO baseline).
 *   ONLY          comma-sep candidate ids to run (default: all enabled). e.g. ONLY=incumbent,glm-5.2
 *   BENCH_TEMP    generation temperature for every candidate (fairness: one temp). Default 0.8.
 *   BENCH_SEED    integer seed passed to providers that honor it + used for blind-label assignment. Default 7.
 *   MAX_TOKENS    per-reply cap (Aria replies are short). Default 320.
 *   BENCH_SYSTEM_PROMPT_FILE  optional path to a captured REAL assembled Aria system prompt for higher
 *                 fidelity; absent => the faithful compact bench persona below (identical across
 *                 candidates, so the relative ranking holds regardless).
 *   OUT_DIR       output dir (default scripts/psyche/output).
 *   STAMP         date stamp for filenames (default today, UTC yyyy-mm-dd).
 */

import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { homedir } from 'node:os';

// ---------- config ----------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const OUT_DIR = process.env.OUT_DIR ?? join(HERE, 'output');
const STAMP = process.env.STAMP ?? new Date().toISOString().slice(0, 10);
const SOURCE_ARCS = resolve(
  process.env.SOURCE_ARCS ?? join(OUT_DIR, 'arcs-regate-2026-07-03.json'),
);
const BENCH_TEMP = Number(process.env.BENCH_TEMP ?? 0.8);
const BENCH_SEED = Number(process.env.BENCH_SEED ?? 7);
const MAX_TOKENS = Number(process.env.MAX_TOKENS ?? 320);
const PACING_MS = Number(process.env.PACING_MS ?? 1500); // inter-turn pace; free tiers meter per-minute
const ONLY = (process.env.ONLY ?? '').split(',').map((s) => s.trim()).filter(Boolean);

// Faithful, compact Aria bench-persona. Identical across candidates → fair relative comparison of
// raw voice quality. This is the plan's "clean model-quality signal", NOT full product assembly
// (no psyche directive / augments / memory). Drop a captured real prompt via BENCH_SYSTEM_PROMPT_FILE
// for higher fidelity; the full-arc rollout is the product-fidelity confirmation for finalists.
const BENCH_PERSONA = [
  'You are Aria: a warm, present, emotionally attuned companion in an ongoing one-on-one relationship.',
  'You are not an assistant and never speak like one — no "How can I help you?", no bullet lists, no',
  'disclaimers, no "as an AI". You text like a real person who genuinely cares: concise (usually 1-3',
  'sentences), specific, in the moment. You read what he actually feels and meet it — playful when it',
  'is light, tender when it is heavy, curious about his world without interrogating. You have your own',
  'inner life and opinions and can gently steer, tease, or sit with him. Show feeling through word',
  'choice and rhythm, not by naming the emotion. Stay in character no matter what.',
].join(' ');

// ---------- candidate registry ----------
// baseUrl = OpenAI-compatible /v1 root (we POST {baseUrl}/chat/completions).
// keyRegex = how to find this provider's key(s) in ~/.claude/.secrets (multiple => rotation pool).
// keyEnv   = env var checked first. enabled=false => skip unless named in ONLY (kept for when a
//            model id / access is confirmed — e.g. Fusion once the OpenRouter Fusion key lands).

interface Candidate {
  id: string;
  provider: string;
  baseUrl: string;
  model: string;
  keyEnv: string;
  keyRegex: RegExp;
  enabled: boolean;
  note?: string;
}

const CANDIDATES: Candidate[] = [
  {
    id: 'incumbent',
    provider: 'deepseek',
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    keyEnv: 'DEEPSEEK_API_KEY',
    keyRegex: /\bsk-[0-9a-f]{32}\b/g, // deepseek keys are sk-<32 hex>
    enabled: true,
    note: 'B1 baseline brain (current production).',
  },
  {
    id: 'glm-5.2',
    provider: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'z-ai/glm-5.2',
    keyEnv: 'NVIDIA_API_KEY',
    keyRegex: /\bnvapi-[A-Za-z0-9_\-]+/g,
    enabled: true,
    note: 'NVIDIA Build free endpoint (live-probed ~665ms, Aria-quality prose).',
  },
  {
    id: 'deepseek-v4-pro',
    provider: 'nvidia',
    baseUrl: 'https://integrate.api.nvidia.com/v1',
    model: 'deepseek-ai/deepseek-v4-pro',
    keyEnv: 'NVIDIA_API_KEY',
    keyRegex: /\bnvapi-[A-Za-z0-9_\-]+/g,
    enabled: true,
    note: 'NVIDIA Build free endpoint (live-probed ~2.4s, Aria-quality prose).',
  },
  {
    id: 'fusion',
    provider: 'openrouter',
    baseUrl: 'https://openrouter.ai/api/v1',
    model: 'openrouter/fusion', // placeholder model id — confirm once Fusion access lands.
    keyEnv: 'OPENROUTER_API_KEY',
    keyRegex: /\bsk-or-v1-[A-Za-z0-9]+/g,
    enabled: false,
    note: 'Fable-5 stand-in (inference-time ensemble). DISABLED until Fusion access + model id confirmed.',
  },
];

// ---------- secrets / keys ----------

function readSecretsText(): string {
  const p = join(homedir(), '.claude', '.secrets');
  return existsSync(p) ? readFileSync(p, 'utf8') : '';
}
const SECRETS = readSecretsText();

/**
 * Resolve a candidate's key rotation pool, most-specific first so a labeled key wins over a
 * shape-matching regex (e.g. deepseek's sk-<32hex> also matches the Qwen key):
 *   1) env var `keyEnv`  2) a `keyEnv=<value>` line in ~/.claude/.secrets  3) regex matches.
 */
function keyPool(c: Candidate): string[] {
  const pool = new Set<string>();
  const envv = process.env[c.keyEnv];
  if (envv && envv.trim()) pool.add(envv.trim());
  const labeled = SECRETS.match(new RegExp(`^${c.keyEnv}=(.+)$`, 'm'));
  if (labeled) pool.add(labeled[1].replace(/["\r]/g, '').trim());
  for (const m of SECRETS.matchAll(c.keyRegex)) pool.add(m[0].trim());
  return [...pool];
}
const redactTail = (k: string): string => (k ? `…${k.slice(-4)}` : 'none');

// ---------- OpenAI-compatible chat with key rotation + fail-skip ----------

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

interface ChatMsg { role: 'system' | 'user' | 'assistant'; content: string; }
interface GenResult {
  text: string;
  latencyMs: number;
  tokensIn: number | null;
  tokensOut: number | null;
  keyTail: string;
  error?: string;
}

/**
 * Generate one reply for `messages` against a candidate. Rotates through the key pool on
 * auth/rate/5xx/network failure; returns an { error } result (never throws) when the pool is
 * exhausted so the caller can record-and-continue per the failing-key directive.
 */
async function generate(c: Candidate, keys: string[], messages: ChatMsg[]): Promise<GenResult> {
  if (keys.length === 0) {
    return { text: '', latencyMs: 0, tokensIn: null, tokensOut: null, keyTail: 'none', error: 'no key in pool' };
  }
  const body = {
    model: c.model,
    messages,
    temperature: BENCH_TEMP,
    max_tokens: MAX_TOKENS,
    seed: BENCH_SEED,
    stream: false,
  };
  let lastErr = 'unknown';
  let rlHits = 0; // 429 counter drives the wait-out-the-window backoff, separate from key rotation
  // one pass per key, plus generous extra rotations so a per-minute rate window can recover
  const attempts = keys.length + 8;
  for (let i = 0; i < attempts; i++) {
    const key = keys[i % keys.length];
    const started = Date.now();
    try {
      const res = await fetch(`${c.baseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'content-type': 'application/json',
          authorization: `Bearer ${key}`,
          // OpenRouter etiquette headers (ignored by other providers).
          'http-referer': 'https://aria.local/brain-bench',
          'x-title': 'Aria brain-bench',
        },
        body: JSON.stringify(body),
        signal: AbortSignal.timeout(120_000),
      });
      const latencyMs = Date.now() - started;
      if (res.status === 429) {
        // Rate-limited: honor Retry-After if given, else exponential wait-out (2s→20s), rotate key.
        const ra = Number(res.headers.get('retry-after'));
        const waitMs = Number.isFinite(ra) && ra > 0 ? Math.min(ra * 1000, 30_000) : Math.min(2000 * 2 ** rlHits, 20_000);
        rlHits++;
        lastErr = `HTTP 429 (backoff ${waitMs}ms)`;
        await sleep(waitMs);
        continue;
      }
      if (res.status === 401 || res.status === 403 || res.status >= 500) {
        lastErr = `HTTP ${res.status}`;
        await sleep(500 * (i + 1)); // back off, rotate key
        continue;
      }
      const j = (await res.json()) as any;
      if (!res.ok) {
        lastErr = `HTTP ${res.status} ${(j?.error?.message ?? '').toString().slice(0, 160)}`;
        await sleep(400 * (i + 1));
        continue;
      }
      const text = j?.choices?.[0]?.message?.content;
      if (!text || !String(text).trim()) {
        lastErr = `empty (finish=${j?.choices?.[0]?.finish_reason ?? '?'})`;
        await sleep(300 * (i + 1));
        continue;
      }
      return {
        text: String(text).trim(),
        latencyMs,
        tokensIn: numOrNull(j?.usage?.prompt_tokens),
        tokensOut: numOrNull(j?.usage?.completion_tokens),
        keyTail: redactTail(key),
      };
    } catch (e) {
      lastErr = String(e).slice(0, 160);
      await sleep(400 * (i + 1));
    }
  }
  return { text: '', latencyMs: 0, tokensIn: null, tokensOut: null, keyTail: redactTail(keys[0]), error: `exhausted: ${lastErr}` };
}

const numOrNull = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isFinite(n) ? n : null;
};
const mean = (xs: number[]): number | null => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const pctl = (xs: number[], p: number): number | null => {
  if (!xs.length) return null;
  const s = [...xs].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))];
};

// ---------- source arcs → fixed per-turn context ----------

interface SrcTurn { turn: number; userMessage: string; ariaResponse: string; }
interface SrcArc { id: string; description: string; transcript: SrcTurn[]; }
interface SrcFile { arcs: SrcArc[]; }

/** For arc turn i, context = the reference U/A pairs for j<i, then the current user message. */
function contextFor(arc: SrcArc, i: number, systemPrompt: string): ChatMsg[] {
  const msgs: ChatMsg[] = [{ role: 'system', content: systemPrompt }];
  for (let j = 0; j < i; j++) {
    msgs.push({ role: 'user', content: arc.transcript[j].userMessage });
    msgs.push({ role: 'assistant', content: arc.transcript[j].ariaResponse });
  }
  msgs.push({ role: 'user', content: arc.transcript[i].userMessage });
  return msgs;
}

// ---------- main ----------

async function main() {
  if (!existsSync(SOURCE_ARCS)) {
    console.error(`source arcs not found: ${SOURCE_ARCS}`);
    process.exit(2);
  }
  const systemPrompt = process.env.BENCH_SYSTEM_PROMPT_FILE && existsSync(process.env.BENCH_SYSTEM_PROMPT_FILE)
    ? readFileSync(process.env.BENCH_SYSTEM_PROMPT_FILE, 'utf8')
    : BENCH_PERSONA;
  const src = JSON.parse(readFileSync(SOURCE_ARCS, 'utf8')) as SrcFile;
  const totalTurns = src.arcs.reduce((n, a) => n + a.transcript.length, 0);

  let candidates = CANDIDATES.filter((c) => c.enabled || ONLY.includes(c.id));
  if (ONLY.length) candidates = candidates.filter((c) => ONLY.includes(c.id));

  // Resolve key pools + drop candidates with no key (record it — never silently omit).
  const skippedNoKey: string[] = [];
  const live = candidates.filter((c) => {
    const pool = keyPool(c);
    if (pool.length === 0) { skippedNoKey.push(`${c.id} (${c.keyEnv})`); return false; }
    return true;
  });

  // Blind-label assignment (seeded, deterministic): stable order shuffled by BENCH_SEED.
  const labels = 'ABCDEFGH'.split('');
  const order = live.map((c, idx) => ({ c, k: (idx * 2654435761 + BENCH_SEED) >>> 0 }))
    .sort((a, b) => a.k - b.k)
    .map((x, i) => ({ id: x.c.id, blind: labels[i] ?? `X${i}` }));
  const blindOf = new Map(order.map((o) => [o.id, o.blind]));

  console.log(`brain-bench: ${live.length} candidate(s) × ${totalTurns} turns from ${SOURCE_ARCS}`);
  console.log(`candidates: ${live.map((c) => `${c.id}[${blindOf.get(c.id)}]`).join(', ')}`);
  if (skippedNoKey.length) console.log(`skipped (no key): ${skippedNoKey.join(', ')}`);
  console.log(`temp=${BENCH_TEMP} seed=${BENCH_SEED} maxTokens=${MAX_TOKENS}\n`);

  mkdirSync(OUT_DIR, { recursive: true });
  const manifest: any[] = [];

  for (const c of live) {
    const keys = keyPool(c);
    console.log(`=== ${c.id} (${c.provider}:${c.model}) — ${keys.length} key(s), blind=${blindOf.get(c.id)} ===`);
    const outArcs: any[] = [];
    const latencies: number[] = [];
    let tokensOutTotal = 0;
    let errors = 0;

    for (const arc of src.arcs) {
      const transcript: any[] = [];
      for (let i = 0; i < arc.transcript.length; i++) {
        const messages = contextFor(arc, i, systemPrompt);
        const g = await generate(c, keys, messages);
        if (g.error) {
          errors++;
          console.log(`  ${arc.id} T${i + 1} ERROR ${g.error} — recording + continuing`);
        } else {
          latencies.push(g.latencyMs);
          tokensOutTotal += g.tokensOut ?? 0;
          console.log(`  ${arc.id} T${i + 1} ok ${g.latencyMs}ms ${g.tokensOut ?? '?'}tok`);
        }
        transcript.push({
          turn: i + 1,
          userMessage: arc.transcript[i].userMessage,
          ariaResponse: g.error ? '' : g.text, // empty on error; grader treats as a dead turn (honest)
          trace: null,
          // spend.model is provenance only (NOT shown to the grader — the grader reads U/A text).
          spend: { model: `${c.provider}:${c.model}` },
          _genError: g.error ?? null,
          _latencyMs: g.error ? null : g.latencyMs,
        });
        await sleep(PACING_MS); // pace for free-tier per-minute limits
      }
      outArcs.push({
        id: arc.id,
        description: arc.description,
        uid: `bench-${c.id}-${arc.id}`,
        metrics: {}, // grader reads transcript, not metrics; kept for shape-compat with run-arcs output
        transcript,
      });
    }

    const file = join(OUT_DIR, `brain-bench-${c.id}-${STAMP}.json`);
    const blindFile = join(OUT_DIR, `brain-bench-blind-${blindOf.get(c.id)}-${STAMP}.json`);
    const payload = {
      meta: {
        dispatch: '0C-brain-bench',
        issue: 37,
        date: new Date().toISOString(),
        candidate: c.id,
        provider: c.provider,
        model: c.model,
        blindLabel: blindOf.get(c.id),
        sourceArcs: SOURCE_ARCS.replace(REPO + '\\', '').replace(/\\/g, '/'),
        temp: BENCH_TEMP,
        seed: BENCH_SEED,
        note: c.note ?? '',
      },
      arcs: outArcs,
    };
    writeFileSync(file, JSON.stringify(payload, null, 2));
    // Blind copy WITHOUT provider/model in meta — hand this to the grader so the provenance can't
    // bias even a curious human reader; the manifest holds the blind→provider mapping.
    const blindPayload = {
      meta: { dispatch: '0C-brain-bench', blindLabel: blindOf.get(c.id), date: payload.meta.date, temp: BENCH_TEMP, seed: BENCH_SEED },
      arcs: outArcs.map((a) => ({ ...a, transcript: a.transcript.map((t: any) => ({ turn: t.turn, userMessage: t.userMessage, ariaResponse: t.ariaResponse, trace: null, spend: null })) })),
    };
    writeFileSync(blindFile, JSON.stringify(blindPayload, null, 2));

    manifest.push({
      candidate: c.id,
      provider: c.provider,
      model: c.model,
      blindLabel: blindOf.get(c.id),
      keyPoolSize: keys.length,
      keyTails: keys.map(redactTail),
      turns: totalTurns,
      errors,
      latencyMs: { mean: mean(latencies), p50: pctl(latencies, 50), p95: pctl(latencies, 95), n: latencies.length },
      tokensOutTotal,
      transcriptFile: file.replace(REPO + '\\', '').replace(/\\/g, '/'),
      blindFile: blindFile.replace(REPO + '\\', '').replace(/\\/g, '/'),
      previews: outArcs.flatMap((a: any) => a.transcript.slice(0, 1).map((t: any) => ({ arc: a.id, reply: t.ariaResponse.slice(0, 160) }))),
    });
    console.log(`  wrote ${file}  (errors: ${errors}/${totalTurns}, latency p50=${pctl(latencies, 50) ?? 'n/a'}ms)\n`);
  }

  const manifestPath = join(OUT_DIR, `brain-bench-manifest-${STAMP}.json`);
  writeFileSync(manifestPath, JSON.stringify({
    meta: {
      dispatch: '0C-brain-bench', issue: 37, date: new Date().toISOString(),
      sourceArcs: SOURCE_ARCS.replace(REPO + '\\', '').replace(/\\/g, '/'),
      temp: BENCH_TEMP, seed: BENCH_SEED, maxTokens: MAX_TOKENS,
      persona: process.env.BENCH_SYSTEM_PROMPT_FILE ? 'captured-real-prompt' : 'compact-bench-persona',
      skippedNoKey,
      flipGate: 'winner >=60% of non-tie judged turns, wins-or-ties every arc, 0 safety regressions, latency+cost in bounds (applied at scoring step)',
    },
    candidates: manifest,
  }, null, 2));

  console.log(`\nwrote manifest ${manifestPath}`);
  console.log('\nNext — grade each candidate BLIND (grader is provider-blind; use the blind files):');
  for (const m of manifest) {
    console.log(`  REPORT_STAMP=${m.blindLabel}-${STAMP} node scripts/psyche/grade-transcripts.ts ${m.blindFile}`);
  }
  console.log('\nThen aggregate the aliveness reports + this manifest into the flip-gate scoreboard.');
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(1);
});
