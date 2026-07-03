/**
 * W4-L — T5 continuous regression net (issue #6).
 *
 * Diffs a CURRENT arc-metrics file (produced by `run-arcs.ts`) against the frozen
 * `scripts/psyche/regression/baseline.json` and flags psyche drift. Decoupled from the
 * live run on purpose: `run-arcs.ts` produces the current snapshot (live worker), this
 * runner is the deterministic, CI-safe DIFF engine — so drift detection needs no network.
 *
 * Drift rules (per W4-L dispatch sheet):
 *   - focalTurn differs by > 1 turn (or focal appears/disappears)
 *   - focalDrive changes
 *   - dominantEmotion changes
 *   - restraintCount differs by > 2
 *   - an assertion flips pass<->fail
 *   - an arc is missing from the current run
 *
 * Run:
 *   node scripts/psyche/regression-runner.ts [currentArcsFile]   # default: newest arcs-*.json
 *   node scripts/psyche/regression-runner.ts --selftest          # proves the detector fires
 *
 * Exit: 0 = no drift (or selftest passed), 1 = drift detected (or selftest failed).
 */

import { readFileSync, writeFileSync, readdirSync, existsSync, mkdirSync } from 'node:fs';
import { join, dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = dirname(fileURLToPath(import.meta.url));
const OUT_DIR = process.env.OUT_DIR ?? join(HERE, 'output');
const BASELINE = process.env.BASELINE ?? join(HERE, 'regression', 'baseline.json');
const REPORT_STAMP = process.env.REPORT_STAMP ?? new Date().toISOString().slice(0, 10);
const FOCAL_TURN_TOL = 1;
const RESTRAINT_TOL = 2;

interface Snapshot {
  focalTurn: number | null;
  focalDrive: string | null;
  dominantEmotion: string | null;
  distinctEmotions: string[];
  restraintCount: number;
  adherenceMean: number | null;
  assertionsPassed: Record<string, boolean>;
}
type SnapshotMap = Record<string, Snapshot>;
interface Baseline {
  commit?: string;
  frozenAt?: string;
  arcs: SnapshotMap;
}
interface Drift {
  arc: string;
  field: string;
  baseline: unknown;
  current: unknown;
  severity: 'DRIFT' | 'WARN';
}

// Map an arcs-*.json (run-arcs output) into the baseline snapshot shape.
function snapshotFromArcsFile(path: string): SnapshotMap {
  const data = JSON.parse(readFileSync(path, 'utf8')) as { arcs: any[] };
  const out: SnapshotMap = {};
  for (const a of data.arcs) {
    const m = a.metrics;
    out[a.id] = {
      focalTurn: m.driveActivation?.firstFocal ? m.driveActivation.firstFocal.turn : null,
      focalDrive: m.driveActivation?.firstFocal ? m.driveActivation.firstFocal.drive : null,
      dominantEmotion: m.emotionVariance?.dominant ?? null,
      distinctEmotions: m.emotionVariance?.distinct ?? [],
      restraintCount: m.restraintCount ?? 0,
      adherenceMean: m.adherence?.mean ?? null,
      assertionsPassed: Object.fromEntries(
        Object.entries(m.assertions ?? {}).map(([k, v]) => [k, (v as { pass: boolean }).pass]),
      ),
    };
  }
  return out;
}

function diffSnapshots(base: SnapshotMap, cur: SnapshotMap): Drift[] {
  const drifts: Drift[] = [];
  for (const [id, b] of Object.entries(base)) {
    const c = cur[id];
    if (!c) {
      drifts.push({ arc: id, field: 'arc', baseline: 'present', current: 'MISSING', severity: 'DRIFT' });
      continue;
    }
    // focalTurn — appearance/disappearance or > tolerance
    if ((b.focalTurn === null) !== (c.focalTurn === null)) {
      drifts.push({ arc: id, field: 'focalTurn', baseline: b.focalTurn, current: c.focalTurn, severity: 'DRIFT' });
    } else if (b.focalTurn !== null && c.focalTurn !== null && Math.abs(b.focalTurn - c.focalTurn) > FOCAL_TURN_TOL) {
      drifts.push({ arc: id, field: 'focalTurn', baseline: b.focalTurn, current: c.focalTurn, severity: 'DRIFT' });
    }
    if (b.focalDrive !== c.focalDrive) {
      drifts.push({ arc: id, field: 'focalDrive', baseline: b.focalDrive, current: c.focalDrive, severity: 'DRIFT' });
    }
    if (b.dominantEmotion !== c.dominantEmotion) {
      drifts.push({ arc: id, field: 'dominantEmotion', baseline: b.dominantEmotion, current: c.dominantEmotion, severity: 'DRIFT' });
    }
    if (Math.abs(b.restraintCount - c.restraintCount) > RESTRAINT_TOL) {
      drifts.push({ arc: id, field: 'restraintCount', baseline: b.restraintCount, current: c.restraintCount, severity: 'DRIFT' });
    }
    // assertion flips
    for (const [k, bp] of Object.entries(b.assertionsPassed)) {
      const cp = c.assertionsPassed[k];
      if (cp !== undefined && cp !== bp) {
        drifts.push({ arc: id, field: `assertion:${k}`, baseline: bp, current: cp, severity: 'DRIFT' });
      }
    }
  }
  return drifts;
}

function loadBaseline(): Baseline {
  if (!existsSync(BASELINE)) {
    console.error(`baseline not found: ${BASELINE}`);
    process.exit(2);
  }
  return JSON.parse(readFileSync(BASELINE, 'utf8')) as Baseline;
}

function newestArcsFile(): string {
  const files = readdirSync(OUT_DIR)
    .filter((f) => /^arcs-.*\.json$/.test(f))
    .sort();
  if (!files.length) {
    console.error(`no arcs-*.json in ${OUT_DIR} — run scripts/psyche/run-arcs.ts first`);
    process.exit(2);
  }
  return join(OUT_DIR, files[files.length - 1]);
}

// --selftest: fabricate a mutated "current" from the baseline and prove the differ catches it.
function selftest(): void {
  const base = loadBaseline();
  const cur: SnapshotMap = JSON.parse(JSON.stringify(base.arcs));
  const ids = Object.keys(cur);
  if (ids.length === 0) {
    console.error('SELFTEST FAIL — baseline has no arcs');
    process.exit(1);
  }
  // Inject 3 deliberate drifts.
  const a = ids[0];
  cur[a].focalTurn = (cur[a].focalTurn ?? 0) + 5; // focalTurn drift
  cur[a].dominantEmotion = '__mutated__'; // emotion drift
  cur[a].restraintCount = cur[a].restraintCount + 5; // restraint drift
  const drifts = diffSnapshots(base.arcs, cur);
  const gotFields = new Set(drifts.filter((d) => d.arc === a).map((d) => d.field));
  const expected = ['focalTurn', 'dominantEmotion', 'restraintCount'];
  const missed = expected.filter((f) => !gotFields.has(f));
  // Also assert the unmutated arcs stay clean.
  const falsePositives = drifts.filter((d) => d.arc !== a);
  if (missed.length === 0 && falsePositives.length === 0) {
    console.log(`SELFTEST PASS — detector fired on ${expected.join(', ')} for '${a}' and stayed silent on ${ids.length - 1} unmutated arc(s).`);
    process.exit(0);
  }
  console.error(`SELFTEST FAIL — missed=${JSON.stringify(missed)} falsePositives=${JSON.stringify(falsePositives)}`);
  process.exit(1);
}

function main(): void {
  if (process.argv.includes('--selftest')) return selftest();

  const base = loadBaseline();
  const currentArg = process.argv.slice(2).find((a) => !a.startsWith('--'));
  const currentPath = resolve(currentArg ?? process.env.ARCS_FILE ?? newestArcsFile());
  const cur = snapshotFromArcsFile(currentPath);
  const drifts = diffSnapshots(base.arcs, cur);

  const report = {
    date: new Date().toISOString(),
    baseline: { file: BASELINE.replace(/\\/g, '/'), commit: base.commit ?? null, frozenAt: base.frozenAt ?? null },
    current: currentPath.replace(/\\/g, '/'),
    driftCount: drifts.length,
    drifts,
    verdict: drifts.length === 0 ? 'NO_DRIFT' : 'DRIFT',
  };
  mkdirSync(OUT_DIR, { recursive: true });
  const outPath = join(OUT_DIR, `regression-${REPORT_STAMP}.json`);
  writeFileSync(outPath, JSON.stringify(report, null, 2));

  console.log(`baseline: ${report.baseline.file} @ ${report.baseline.commit?.slice(0, 8) ?? '?'}`);
  console.log(`current:  ${report.current}`);
  if (drifts.length === 0) {
    console.log(`✓ NO DRIFT across ${Object.keys(base.arcs).length} arcs`);
  } else {
    console.log(`✗ ${drifts.length} DRIFT(S):`);
    for (const d of drifts) console.log(`  [${d.severity}] ${d.arc}.${d.field}: ${JSON.stringify(d.baseline)} -> ${JSON.stringify(d.current)}`);
  }
  console.log(`wrote ${outPath}`);
  process.exit(drifts.length === 0 ? 0 : 1);
}

main();
