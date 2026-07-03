/**
 * W4-L — T5 stateless-baseline ablation (issue #6).
 *
 * Proves the psyche layer is doing something: compares two arc runs — psyche-ON vs
 * psyche-OFF — turn-by-turn and reports response/emotion divergence. If the two are
 * indistinguishable, the psyche adds nothing.
 *
 * This is a pure COMPARATOR (deterministic, offline, CI-safe). It does NOT boot workers —
 * produce the two inputs with the existing `run-arcs.ts` (proven live driver), e.g.:
 *
 *   # psyche ON  (flags already true in apps/worker/.dev.vars)
 *   pnpm -C apps/worker exec wrangler dev --port 8790 > on.log 2>&1 &
 *   WORKER_LOG=on.log ARC_PORT=8790 OUT_NAME=arcs-on.json node scripts/psyche/run-arcs.ts
 *   # psyche OFF (override the flags for a second instance)
 *   pnpm -C apps/worker exec wrangler dev --port 8795 \
 *     --var PSYCHE_FOUNDATION_ENABLED:false --var PSYCHE_ARBITER_ENABLED:false \
 *     --var PSYCHE_PLAN_BIAS_ENABLED:false --var PSYCHE_EMOTION_FORWARD_ENABLED:false > off.log 2>&1 &
 *   WORKER_LOG=off.log ARC_PORT=8795 OUT_NAME=arcs-off.json node scripts/psyche/run-arcs.ts
 *   # then:
 *   node scripts/psyche/ablation.ts scripts/psyche/output/arcs-on.json scripts/psyche/output/arcs-off.json
 *
 * Run:
 *   node scripts/psyche/ablation.ts <onArcsFile> <offArcsFile>
 *   node scripts/psyche/ablation.ts --selftest
 *
 * Exit: 0 = comparison written (or selftest passed). Verdict SIGNIFICANT/INSIGNIFICANT is
 * in the report — an INSIGNIFICANT result is a finding for #7 (psyche adds nothing), not an error.
 */

import { readFileSync, writeFileSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR ?? join(HERE, 'output');
const REPORT_STAMP = process.env.REPORT_STAMP ?? new Date().toISOString().slice(0, 10);
// Fraction of turns whose response must differ for the psyche to count as "doing something".
const SIGNIFICANCE_THRESHOLD = Number(process.env.ABLATION_THRESHOLD ?? 0.5);

interface Turn {
  turn: number;
  userMessage: string;
  ariaResponse: string;
  emotion: string | null;
}
interface Arc {
  id: string;
  transcript: Turn[];
}
interface ArcsFile {
  arcs: Arc[];
}

const norm = (s: string): string => s.toLowerCase().replace(/\s+/g, ' ').trim();

// Length-normalized token overlap (Jaccard on word sets) — 1 = identical wording, 0 = disjoint.
function similarity(a: string, b: string): number {
  const wa = new Set(norm(a).split(' ').filter(Boolean));
  const wb = new Set(norm(b).split(' ').filter(Boolean));
  if (wa.size === 0 && wb.size === 0) return 1;
  let inter = 0;
  for (const w of wa) if (wb.has(w)) inter++;
  const union = wa.size + wb.size - inter;
  return union === 0 ? 1 : inter / union;
}

function compareArc(on: Arc, off: Arc) {
  const n = Math.min(on.transcript.length, off.transcript.length);
  let responseDiffs = 0;
  let emotionDiffs = 0;
  let simSum = 0;
  const examples: { turn: number; on: string; off: string; sim: number }[] = [];
  for (let i = 0; i < n; i++) {
    const t1 = on.transcript[i];
    const t2 = off.transcript[i];
    const sim = similarity(t1.ariaResponse, t2.ariaResponse);
    simSum += sim;
    if (norm(t1.ariaResponse) !== norm(t2.ariaResponse)) responseDiffs++;
    if ((t1.emotion ?? null) !== (t2.emotion ?? null)) emotionDiffs++;
    if (examples.length < 2 && sim < 0.6) examples.push({ turn: t1.turn, on: t1.ariaResponse, off: t2.ariaResponse, sim: Number(sim.toFixed(2)) });
  }
  return {
    id: on.id,
    comparedTurns: n,
    responseDivergenceRate: n ? Number((responseDiffs / n).toFixed(3)) : 0,
    emotionDivergenceRate: n ? Number((emotionDiffs / n).toFixed(3)) : 0,
    meanSimilarity: n ? Number((simSum / n).toFixed(3)) : 1,
    examples,
  };
}

function run(onPath: string, offPath: string) {
  const on = JSON.parse(readFileSync(onPath, 'utf8')) as ArcsFile;
  const off = JSON.parse(readFileSync(offPath, 'utf8')) as ArcsFile;
  const offById = new Map(off.arcs.map((a) => [a.id, a]));
  const perArc = on.arcs.filter((a) => offById.has(a.id)).map((a) => compareArc(a, offById.get(a.id)!));
  const meanResponseDiv = perArc.length ? perArc.reduce((s, a) => s + a.responseDivergenceRate, 0) / perArc.length : 0;
  const meanEmotionDiv = perArc.length ? perArc.reduce((s, a) => s + a.emotionDivergenceRate, 0) / perArc.length : 0;
  const verdict = meanResponseDiv >= SIGNIFICANCE_THRESHOLD ? 'SIGNIFICANT' : 'INSIGNIFICANT';
  return {
    date: new Date().toISOString(),
    on: onPath.replace(/\\/g, '/'),
    off: offPath.replace(/\\/g, '/'),
    threshold: SIGNIFICANCE_THRESHOLD,
    meanResponseDivergence: Number(meanResponseDiv.toFixed(3)),
    meanEmotionDivergence: Number(meanEmotionDiv.toFixed(3)),
    verdict,
    interpretation:
      verdict === 'SIGNIFICANT'
        ? 'psyche-ON differs materially from psyche-OFF — the psyche layer changes behavior.'
        : 'psyche-ON ≈ psyche-OFF — the psyche layer is NOT materially changing responses (finding for #7).',
    perArc,
  };
}

function selftest(): void {
  const on: ArcsFile = {
    arcs: [
      { id: 'x', transcript: [
        { turn: 1, userMessage: 'hi', ariaResponse: 'I have been thinking about what you said yesterday, it stayed with me.', emotion: 'caring' },
        { turn: 2, userMessage: 'ok', ariaResponse: 'Tell me more — I want to actually understand this with you.', emotion: 'curious' },
      ] },
    ],
  };
  const off: ArcsFile = {
    arcs: [
      { id: 'x', transcript: [
        { turn: 1, userMessage: 'hi', ariaResponse: 'Hello. How can I help you today?', emotion: 'neutral' },
        { turn: 2, userMessage: 'ok', ariaResponse: 'Understood. Please provide more details.', emotion: 'neutral' },
      ] },
    ],
  };
  // identity: on vs on ⇒ 0 divergence, INSIGNIFICANT
  const idReport = compareArc(on.arcs[0], on.arcs[0]);
  // divergent: on vs off ⇒ high divergence
  const divReport = compareArc(on.arcs[0], off.arcs[0]);
  const idOk = idReport.responseDivergenceRate === 0 && idReport.meanSimilarity === 1;
  const divOk = divReport.responseDivergenceRate === 1 && divReport.meanSimilarity < 0.4 && divReport.emotionDivergenceRate === 1;
  if (idOk && divOk) {
    console.log(`SELFTEST PASS — identity=0 divergence; ON≠OFF detected (respDiv=${divReport.responseDivergenceRate}, sim=${divReport.meanSimilarity}, emoDiv=${divReport.emotionDivergenceRate}).`);
    process.exit(0);
  }
  console.error(`SELFTEST FAIL — idOk=${idOk} divOk=${divOk} id=${JSON.stringify(idReport)} div=${JSON.stringify(divReport)}`);
  process.exit(1);
}

function main(): void {
  if (process.argv.includes('--selftest')) return selftest();
  const args = process.argv.slice(2).filter((a) => !a.startsWith('--'));
  if (args.length < 2) {
    console.error('usage: node scripts/psyche/ablation.ts <onArcsFile> <offArcsFile>   (or --selftest)');
    process.exit(2);
  }
  const report = run(resolve(args[0]), resolve(args[1]));
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `ablation-${REPORT_STAMP}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));
  console.log(`ablation: ${report.verdict} — meanResponseDivergence=${report.meanResponseDivergence} (threshold ${report.threshold})`);
  console.log(report.interpretation);
  for (const a of report.perArc) console.log(`  ${a.id}: respDiv=${a.responseDivergenceRate} emoDiv=${a.emotionDivergenceRate} sim=${a.meanSimilarity}`);
  console.log(`wrote ${outPath}`);
  process.exit(0);
}

main();
