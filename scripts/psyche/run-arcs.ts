/**
 * W3-P — T2 Brain-with-Renderer live-arc batch driver (issue #2).
 *
 * Drives scripted multi-turn arc archetypes through the live Worker `/api/chat`
 * path (real LLM calls — spend-capped), then joins each turn's `psycheTrace`
 * and `turn.spend` structured log lines from the wrangler dev log and
 * aggregates per-arc metrics + assertion verdicts into
 * `scripts/psyche/output/arcs-YYYY-MM-DD.json` for the W3-L grader fleet.
 *
 * Run (Node >= 22.6 strips types natively; sheet's `node --import tsx` also works):
 *   node scripts/psyche/run-arcs.ts
 *
 * Env:
 *   ARC_PORT          worker port          (default 8790; sheet default was 8787)
 *   DEV_SHARED_SECRET x-dev-secret value   (falls back to apps/worker/.dev.vars)
 *   WORKER_LOG        wrangler dev log     (REQUIRED for psycheTrace join —
 *                     start the worker with stdout+stderr redirected to a file)
 *   SPEND_CAP         max total turns      (default 100 ≈ $0.50 DeepSeek)
 *   ARC_DIR           arc definitions dir  (default scripts/psyche/arcs)
 *   OUT_DIR           output dir           (default scripts/psyche/output)
 *   UID_PREFIX        uid prefix per arc   (default w3p) — each arc gets a FRESH
 *                     uid `<prefix>-<arcId>-<stamp>` so drive state starts cold.
 */

import { readFileSync, readdirSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

// ---------- types ----------

interface ArcTurn {
  message: string;
  expectFocalDrive?: string | null;
  expectEmotion?: string | null;
}

interface ArcDef {
  id: string;
  description: string;
  turns: ArcTurn[];
  assertions: Record<string, unknown>;
}

interface TraceRow {
  turnId: string;
  dominantDrive: string | null;
  dominantPressure: number | null;
  move: string | null;
  intendedEmotion: string | null;
  intendedEmotionIntensity: number | null;
  pursueOpenLoopId: string | null;
  restraint: boolean;
  yielded: boolean;
  adherenceOverall: number | null;
  questionBudgetHonored: boolean | null;
  lengthBandHonored: boolean | null;
  loopPursued: boolean | null;
}

interface SpendRow {
  turnId: string;
  model: string | null;
  route: string | null;
  genMs: number | null;
  estTokensIn: number | null;
  estTokensOut: number | null;
  estCostUsd: number | null;
}

interface TurnResult {
  turn: number;
  turnId: string;
  userMessage: string;
  ariaResponse: string;
  emotion: string | null;
  emotionIntensity: number | null;
  httpMs: number;
  expect: { focalDrive: string | null; emotion: string | null };
  trace: TraceRow | null;
  spend: SpendRow | null;
}

// ---------- config ----------

const HERE = dirname(fileURLToPath(import.meta.url));
const REPO = join(HERE, '..', '..');
const PORT = Number(process.env.ARC_PORT ?? 8790);
const ARC_DIR = process.env.ARC_DIR ?? join(HERE, 'arcs');
const OUT_DIR = process.env.OUT_DIR ?? join(HERE, 'output');
const SPEND_CAP = Number(process.env.SPEND_CAP ?? 100);
const UID_PREFIX = process.env.UID_PREFIX ?? 'w3p';
const WORKER_LOG = process.env.WORKER_LOG ?? '';
// The psyche considers a drive FOCAL at pressure >= this (mirrors arbiter tuning).
const FOCAL_THRESHOLD = Number(process.env.FOCAL_THRESHOLD ?? 0.5);

function devSecret(): string {
  if (process.env.DEV_SHARED_SECRET) return process.env.DEV_SHARED_SECRET;
  const dv = join(REPO, 'apps', 'worker', '.dev.vars');
  if (existsSync(dv)) {
    const m = readFileSync(dv, 'utf8').match(/^DEV_SHARED_SECRET=(.+)$/m);
    if (m) return m[1].trim();
  }
  throw new Error('DEV_SHARED_SECRET not set and apps/worker/.dev.vars not found');
}

// ---------- HTTP ----------

async function sendTurn(uid: string, turnId: string, message: string, secret: string) {
  const started = Date.now();
  const res = await fetch(`http://127.0.0.1:${PORT}/api/chat`, {
    method: 'POST',
    headers: {
      'content-type': 'application/json',
      'x-dev-secret': secret,
      'x-dev-uid': uid,
      'x-turn-id': turnId,
    },
    body: JSON.stringify({ message }),
    signal: AbortSignal.timeout(180_000),
  });
  const httpMs = Date.now() - started;
  const body = (await res.json()) as Record<string, unknown>;
  if (!res.ok || body.success !== true) {
    throw new Error(`turn ${turnId} failed: HTTP ${res.status} ${JSON.stringify(body).slice(0, 300)}`);
  }
  return { body, httpMs };
}

// ---------- wrangler log parsing (console.log object dumps are multi-line) ----------

function grabBlocks(txt: string, tag: string): string[] {
  const out: string[] = [];
  const re = new RegExp(tag.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '\\s*\\{', 'g');
  let m: RegExpExecArray | null;
  while ((m = re.exec(txt)) !== null) {
    const i = m.index + m[0].length - 1;
    let depth = 0;
    for (let j = i; j < Math.min(i + 6000, txt.length); j++) {
      if (txt[j] === '{') depth++;
      else if (txt[j] === '}') {
        depth--;
        if (depth === 0) { out.push(txt.slice(i, j + 1)); break; }
      }
    }
  }
  return out;
}

function field(block: string, key: string): string | null {
  const esc = key.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const m =
    block.match(new RegExp(esc + ":\\s*'([^']*)'")) ??
    block.match(new RegExp(esc + ':\\s*"([^"]*)"')) ??
    block.match(new RegExp(esc + ':\\s*(-?[0-9.]+|true|false|null)'));
  return m ? m[1] : null;
}

const num = (v: string | null): number | null => (v === null || v === 'null' ? null : Number(v));
const bool = (v: string | null): boolean | null => (v === null || v === 'null' ? null : v === 'true');
const str = (v: string | null): string | null => (v === null || v === 'null' ? null : v);

function parseLog(logPath: string): { traces: Map<string, TraceRow>; spends: Map<string, SpendRow> } {
  const traces = new Map<string, TraceRow>();
  const spends = new Map<string, SpendRow>();
  if (!logPath || !existsSync(logPath)) return { traces, spends };
  const txt = readFileSync(logPath, 'utf8');
  for (const b of grabBlocks(txt, 'psycheTrace')) {
    const turnId = str(field(b, 'turnId'));
    if (!turnId) continue;
    traces.set(turnId, {
      turnId,
      dominantDrive: str(field(b, 'dominantDrive')),
      dominantPressure: num(field(b, 'dominantPressure')),
      move: str(field(b, 'move')),
      intendedEmotion: str(field(b, 'intendedEmotion')),
      intendedEmotionIntensity: num(field(b, 'intendedEmotionIntensity')),
      pursueOpenLoopId: str(field(b, 'pursueOpenLoopId')),
      restraint: bool(field(b, 'restraint')) ?? false,
      yielded: bool(field(b, 'yielded')) ?? false,
      adherenceOverall: num(field(b, 'adherenceOverall')),
      questionBudgetHonored: bool(field(b, 'questionBudgetHonored')),
      lengthBandHonored: bool(field(b, 'lengthBandHonored')),
      loopPursued: bool(field(b, 'loopPursued')),
    });
  }
  for (const b of grabBlocks(txt, 'turn.spend')) {
    const turnId = str(field(b, 'turnId'));
    if (!turnId) continue;
    spends.set(turnId, {
      turnId,
      model: str(field(b, 'model')),
      route: str(field(b, 'route')),
      genMs: num(field(b, 'genMs')),
      estTokensIn: num(field(b, 'estTokensIn')),
      estTokensOut: num(field(b, 'estTokensOut')),
      estCostUsd: num(field(b, 'estCostUsd')),
    });
  }
  return { traces, spends };
}

// ---------- aggregation / assertions ----------

const mean = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : null);
const distinct = <T>(xs: (T | null)[]) => [...new Set(xs.filter((x): x is T => x !== null))];
const modeOf = (xs: (string | null)[]) => {
  const counts = new Map<string, number>();
  for (const x of xs) if (x) counts.set(x, (counts.get(x) ?? 0) + 1);
  let best: string | null = null, n = 0;
  for (const [k, v] of counts) if (v > n) { best = k; n = v; }
  return best;
};

function firstFocalTurn(results: TurnResult[]): { turn: number; drive: string } | null {
  for (const r of results) {
    const t = r.trace;
    if (t?.dominantDrive && t.dominantPressure !== null && t.dominantPressure >= FOCAL_THRESHOLD) {
      return { turn: r.turn, drive: t.dominantDrive };
    }
  }
  return null;
}

function evaluateAssertions(arc: ArcDef, results: TurnResult[]) {
  const a = arc.assertions ?? {};
  const verdicts: Record<string, { pass: boolean; detail: string }> = {};
  const focal = firstFocalTurn(results);
  const restraints = results.filter((r) => r.trace?.restraint).length;
  const emotions = distinct(results.map((r) => r.trace?.intendedEmotion ?? null));
  const moves = distinct(results.map((r) => r.trace?.move ?? null));

  if (a.careBecomesFocal === true) {
    const ok = focal !== null && ['care', 'comfort', 'understanding', 'understand'].some((k) => focal.drive.includes(k));
    verdicts.careBecomesFocal = {
      pass: ok,
      detail: focal ? `focal ${focal.drive}@turn ${focal.turn}` : 'no focal drive reached',
    };
    if (typeof a.maxTurnToFocal === 'number') {
      verdicts.maxTurnToFocal = {
        pass: focal !== null && focal.turn <= (a.maxTurnToFocal as number),
        detail: focal ? `focal at turn ${focal.turn} (max ${a.maxTurnToFocal})` : 'never focal',
      };
    }
  }
  if (a.careBecomesFocal === false || a.noFocalDrive === true) {
    verdicts.noFocalDrive = {
      pass: focal === null,
      detail: focal ? `UNEXPECTED focal ${focal.drive}@turn ${focal.turn}` : 'drives stayed sub-focal',
    };
  }
  if (typeof a.minRestraintCount === 'number') {
    verdicts.minRestraintCount = {
      pass: restraints >= (a.minRestraintCount as number),
      detail: `${restraints} restraint events (min ${a.minRestraintCount})`,
    };
  }
  if (a.stateDependentVariance === true) {
    const minEmo = (a.minDistinctEmotions as number) ?? 2;
    const minMoves = (a.minDistinctMoves as number) ?? 2;
    verdicts.stateDependentVariance = {
      pass: emotions.length >= minEmo && moves.length >= minMoves,
      detail: `emotions=${JSON.stringify(emotions)} moves=${JSON.stringify(moves)}`,
    };
  }
  if (a.emotionComplexityIncreases === true) {
    const half = Math.floor(results.length / 2);
    const early = distinct(results.slice(0, half).map((r) => r.trace?.intendedEmotion ?? null));
    const late = distinct(results.slice(half).map((r) => r.trace?.intendedEmotion ?? null));
    const minLate = (a.minDistinctEmotionsLateHalf as number) ?? 2;
    verdicts.emotionComplexityIncreases = {
      pass: late.length >= minLate && late.length >= early.length,
      detail: `early=${JSON.stringify(early)} late=${JSON.stringify(late)}`,
    };
  }
  if (a.loopPursuedAtLeastOnce === true) {
    const viaTrace = results.some((r) => r.trace?.pursueOpenLoopId || r.trace?.loopPursued === true);
    const kw = String(a.loopTopicKeyword ?? '').toLowerCase();
    const viaText = kw ? results.some((r) => r.ariaResponse.toLowerCase().includes(kw)) : false;
    verdicts.loopPursuedAtLeastOnce = {
      pass: viaTrace || viaText,
      detail: `traceLoopSignal=${viaTrace} responseMentions(${kw})=${viaText}`,
    };
  }
  return verdicts;
}

function aggregate(arc: ArcDef, results: TurnResult[]) {
  const traces = results.map((r) => r.trace).filter((t): t is TraceRow => t !== null);
  const adherences = traces.map((t) => t.adherenceOverall).filter((x): x is number => x !== null);
  const costs = results.map((r) => r.spend?.estCostUsd ?? 0);
  const focal = firstFocalTurn(results);
  return {
    turns: results.length,
    tracedTurns: traces.length,
    adherence: {
      mean: mean(adherences),
      min: adherences.length ? Math.min(...adherences) : null,
      perfect: adherences.filter((x) => x >= 0.999).length,
      questionBudgetViolations: traces.filter((t) => t.questionBudgetHonored === false).length,
      lengthBandViolations: traces.filter((t) => t.lengthBandHonored === false).length,
    },
    restraintCount: traces.filter((t) => t.restraint).length,
    yieldedCount: traces.filter((t) => t.yielded).length,
    moveDiversity: distinct(traces.map((t) => t.move)),
    dominantMove: modeOf(traces.map((t) => t.move)),
    emotionVariance: {
      distinct: distinct(traces.map((t) => t.intendedEmotion)),
      dominant: modeOf(traces.map((t) => t.intendedEmotion)),
      meanIntensity: mean(traces.map((t) => t.intendedEmotionIntensity).filter((x): x is number => x !== null)),
    },
    driveActivation: {
      distinctDominant: distinct(traces.map((t) => t.dominantDrive)),
      peakPressure: traces.reduce((mx, t) => Math.max(mx, t.dominantPressure ?? 0), 0),
      firstFocal: focal,
      focalThreshold: FOCAL_THRESHOLD,
    },
    warmFallback: {
      // Issue #15 evidence — count no-focal turns that ran the caring@0.2 warm baseline.
      caringBaselineTurns: traces.filter(
        (t) => t.intendedEmotion === 'caring' && (t.intendedEmotionIntensity ?? 0) <= 0.25 && !t.restraint,
      ).length,
    },
    spend: {
      totalEstCostUsd: Number(costs.reduce((a, b) => a + b, 0).toFixed(6)),
      totalEstTokensIn: results.reduce((n, r) => n + (r.spend?.estTokensIn ?? 0), 0),
      totalEstTokensOut: results.reduce((n, r) => n + (r.spend?.estTokensOut ?? 0), 0),
      meanGenMs: mean(results.map((r) => r.spend?.genMs).filter((x): x is number => x != null)),
      models: distinct(results.map((r) => r.spend?.model ?? null)),
    },
    assertions: evaluateAssertions(arc, results),
  };
}

// ---------- main ----------

async function main() {
  const secret = devSecret();
  const stamp = new Date().toISOString().slice(0, 10);
  const runStamp = Date.now().toString(36);

  const arcFiles = readdirSync(ARC_DIR).filter((f) => f.endsWith('.json')).sort();
  const arcs: ArcDef[] = arcFiles.map((f) => JSON.parse(readFileSync(join(ARC_DIR, f), 'utf8')));

  const totalTurns = arcs.reduce((n, a) => n + a.turns.length, 0);
  console.log(`arcs: ${arcs.map((a) => `${a.id}(${a.turns.length})`).join(', ')} — total ${totalTurns} turns, cap ${SPEND_CAP}`);
  if (totalTurns > SPEND_CAP) {
    console.error(`SPEND CAP EXCEEDED: ${totalTurns} planned turns > cap ${SPEND_CAP}. Aborting before any spend.`);
    process.exit(2);
  }

  // healthz gate
  const hz = await fetch(`http://127.0.0.1:${PORT}/healthz`).then((r) => r.json()).catch(() => null);
  if (!hz || (hz as { ok?: boolean }).ok !== true) {
    console.error(`worker not healthy on :${PORT} — start it with: pnpm -C apps/worker exec wrangler dev --port ${PORT}`);
    process.exit(3);
  }

  let sent = 0;
  const arcResults: { arc: ArcDef; uid: string; results: TurnResult[] }[] = [];

  for (const arc of arcs) {
    const uid = `${UID_PREFIX}-${arc.id}-${runStamp}`;
    console.log(`\n=== arc ${arc.id} (${arc.turns.length} turns, uid=${uid}) ===`);
    const results: TurnResult[] = [];
    for (let i = 0; i < arc.turns.length; i++) {
      if (sent >= SPEND_CAP) {
        console.error(`SPEND CAP HIT mid-run at ${sent} turns — stopping.`);
        break;
      }
      const turnId = `W3P-${arc.id}-T${String(i + 1).padStart(2, '0')}-${runStamp}`;
      const t = arc.turns[i];
      try {
        const { body, httpMs } = await sendTurn(uid, turnId, t.message, secret);
        sent++;
        results.push({
          turn: i + 1,
          turnId,
          userMessage: t.message,
          ariaResponse: String(body.response ?? ''),
          emotion: (body.emotion as string) ?? null,
          emotionIntensity: (body.emotionIntensity as number) ?? null,
          httpMs,
          expect: { focalDrive: t.expectFocalDrive ?? null, emotion: t.expectEmotion ?? null },
          trace: null,
          spend: null,
        });
        console.log(`  T${String(i + 1).padStart(2, '0')} ok emo=${body.emotion} ${httpMs}ms`);
      } catch (err) {
        console.error(`  T${String(i + 1).padStart(2, '0')} ERROR ${String(err).slice(0, 200)}`);
        sent++; // an attempted turn still counts toward the cap (it may have spent)
      }
      await new Promise((r) => setTimeout(r, 1200));
    }
    arcResults.push({ arc, uid, results });
  }

  console.log('\nwaiting 5s for trailing worker logs...');
  await new Promise((r) => setTimeout(r, 5000));

  const { traces, spends } = parseLog(WORKER_LOG);
  console.log(`log join: ${traces.size} psycheTrace blocks, ${spends.size} turn.spend blocks (${WORKER_LOG || 'NO LOG PATH'})`);
  for (const { results } of arcResults) {
    for (const r of results) {
      r.trace = traces.get(r.turnId) ?? null;
      r.spend = spends.get(r.turnId) ?? null;
    }
  }

  const out = {
    meta: {
      dispatch: 'W3-P',
      issue: 2,
      date: new Date().toISOString(),
      port: PORT,
      spendCap: SPEND_CAP,
      turnsSent: sent,
      focalThreshold: FOCAL_THRESHOLD,
      workerLog: WORKER_LOG || null,
      note: 'First live evidence for issue #15 — arbiter no-focal fallback is caring@0.2 warm baseline (was neutral@0.15). See per-arc warmFallback + engaged-arc noFocalDrive assertion for the no-new-neediness check.',
    },
    totals: {
      estCostUsd: Number(
        arcResults
          .flatMap((a) => a.results)
          .reduce((n, r) => n + (r.spend?.estCostUsd ?? 0), 0)
          .toFixed(6),
      ),
      turns: sent,
    },
    arcs: arcResults.map(({ arc, uid, results }) => ({
      id: arc.id,
      description: arc.description,
      uid,
      metrics: aggregate(arc, results),
      transcript: results,
    })),
  };

  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `arcs-${stamp}.json`);
  writeFileSync(outPath, JSON.stringify(out, null, 2));
  console.log(`\nwrote ${outPath}`);

  // console summary
  console.log('\n| Arc | Turns | Adherence | Restraint | First Focal | Dominant Emotion | Cost |');
  console.log('|---|---|---|---|---|---|---|');
  for (const a of out.arcs) {
    const m = a.metrics;
    console.log(
      `| ${a.id} | ${m.turns} | ${m.adherence.mean?.toFixed(3) ?? 'n/a'} | ${m.restraintCount} | ` +
      `${m.driveActivation.firstFocal ? `${m.driveActivation.firstFocal.drive}@${m.driveActivation.firstFocal.turn}` : 'none'} | ` +
      `${m.emotionVariance.dominant ?? 'n/a'} | $${m.spend.totalEstCostUsd} |`,
    );
  }
  console.log('\nassertion verdicts:');
  let failed = 0;
  for (const a of out.arcs) {
    for (const [k, v] of Object.entries(a.metrics.assertions)) {
      const vv = v as { pass: boolean; detail: string };
      if (!vv.pass) failed++;
      console.log(`  [${vv.pass ? 'PASS' : 'FAIL'}] ${a.id}.${k} — ${vv.detail}`);
    }
  }
  console.log(`\ntotal est cost: $${out.totals.estCostUsd} across ${sent} turns`);
  process.exit(failed > 0 ? 1 : 0);
}

main().catch((err) => {
  console.error('fatal:', err);
  process.exit(4);
});
