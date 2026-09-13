/**
 * kalman-attenuation-experiment.ts — r2. DOES THE SMOOTHER ATTENUATE A FRESHNESS GAP, AND DOES IT
 * PASS A CONSTANT OFFSET THROUGH? MEASURED AGAINST THE REAL FILTER IN PRODUCTION'S INIT REGIME.
 *
 * ═══ r1 WAS BROKEN IN THREE WAYS AND ITS RESULT IS WITHDRAWN (Langston, at `030b4f0a7`) ═══
 * r1 reported "(i) IS REFUTED, 87.3% survives". WITHDRAWN — the claim is UNMEASURED, and so is its
 * negation. The three defects, re-derived here before fixing:
 *
 *  ⛔ B1 — THE "CONSTANT BIAS CONTROL" WAS THE ASK ARM, BY ARITHMETIC.
 *     `capture-tick-series.mjs` records `mid = (bid+ask)/2`. r1 fed the "bias" filter
 *     `mid + (ask−bid)/2` off the SAME row = `(bid+ask+ask−bid)/2` = **exactly `ask`**. The bias arm
 *     and the ask arm received identical series: NO CONSTANT OFFSET WAS EVER TESTED.
 *     ★ r1's own "stated limits" explained 68.5% vs 100% as *"the mid-vs-ask arm is not a constant
 *       bias"* — falsified by r1's own code. The gap was never about the data: `show()` computed
 *       RATIO-OF-MEDIANS while the bias line computed MEDIAN-OF-PER-INSTANT-RATIOS — a 1.46×
 *       statistic effect inside one dataset. ⇒ r2 publishes BOTH statistics for every arm.
 *
 *  ⛔ B2 — ARM (i) WAS DOMINATED BY INITIAL CONDITIONS, AND THAT WAS THE 34.8→87.3 SWING.
 *     `adaptive-kalman.ts:181-187`: the first observation SEEDS `x = price` and returns it raw. r1
 *     built fresh filters per replicate and ran ~9.4 instants each, so the arms started ONE INPUT
 *     GAP APART and spent the window dragging their seeds at small early gains. **Phase set the seed
 *     gap**, so r1's replicates averaged over a nuisance parameter rather than adding signal.
 *     ⇒ r2 uses a COMMON BURN-IN: both arms warm identically and diverge only after; the
 *       excluded-instant count is published.
 *
 *  ⛔ B3 — r1 NEVER RAN PRODUCTION'S INITIALISATION.
 *     The production writer is `getSmoothedPrice` (`signal-orchestrator.ts:2449`, SIM S26), which
 *     passes `warmHistory` ⇒ `warmFromHistory` absorbs closes and pins the first live gain. r1 called
 *     a bare constructor: right class, WRONG GAIN REGIME. ⇒ r2 warms through `warmFromHistory`.
 *
 * ⛔⛔ THE STANDING RULE THIS FILE EXISTS TO OBEY: a result that CONFIRMS the claim its author
 *     already made is the one to RE-RUN, not the one to publish. r1's first grid did exactly that.
 *
 * USAGE: npx tsx scripts/analysis/kalman-attenuation-experiment.ts <ticks.json> [lagMs] [cadenceMs]
 *        BURN_IN=5 PHASES=12
 */

import * as fs from 'node:fs';
import { AdaptiveKalmanFilter } from '../../server/utils/adaptive-kalman.js';

type Row = [number, number, number, number, number | null];

const FILE    = process.argv[2] ?? 'ticks.json';
const LAG_MS  = Number(process.argv[3] ?? 37500);
const CADENCE = Number(process.argv[4] ?? 60000);
const BURN_IN = Number(process.env.BURN_IN ?? 5);
const PHASES  = Number(process.env.PHASES ?? 12);

const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as { durationMs: number; symbols: Record<string, Row[]> };

function at(rows: Row[], t: number, pick: (r: Row) => number | null): number | null {
  if (t < rows[0][0]) return null;
  let lo = 0, hi = rows.length - 1, best = -1;
  while (lo <= hi) { const m = (lo + hi) >> 1; if (rows[m][0] <= t) { best = m; lo = m + 1; } else hi = m - 1; }
  return best < 0 ? null : pick(rows[best]);
}
function erVol(vals: number[]) {
  if (vals.length < 3) return { ER: 0.5, VolNoise: 0.5 };
  const net = Math.abs(vals[vals.length - 1] - vals[0]);
  let path = 0; for (let i = 1; i < vals.length; i++) path += Math.abs(vals[i] - vals[i - 1]);
  const ER = path > 0 ? Math.min(1, net / path) : 0.5;
  return { ER, VolNoise: Math.min(1, Math.max(0, 1 - ER)) };
}
const bps = (a: number, b: number) => Math.abs(a - b) / b * 10_000;
const qt = (a: number[], p: number) => { if (!a.length) return NaN; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

interface Arm { inp: number[]; out: number[]; ratios: number[] }
const mkArm = (): Arm => ({ inp: [], out: [], ratios: [] });

function runSymbol(rows: Row[], phaseMs: number, acc: Record<string, Arm>, biasFrac: number[], counts: { evals: number; excluded: number }) {
  const t0 = rows[0][0], tEnd = rows[rows.length - 1][0];
  const grid: number[] = [];
  for (let t = t0 + LAG_MS + phaseMs; t <= tEnd; t += CADENCE) grid.push(t);
  if (grid.length < BURN_IN + 3) return;

  // ── PRODUCTION INIT: warm every arm from the SAME history, as `getSmoothedPrice` does (B3).
  const warm: number[] = [];
  for (const t of grid.slice(0, BURN_IN)) { const m = at(rows, t, r => r[3]); if (m !== null) warm.push(m); }
  if (warm.length < 3) return;
  const { ER: wER, VolNoise: wVN } = erVol(warm);
  const mk = () => { const f = new AdaptiveKalmanFilter(); f.warmFromHistory(warm, wER, wVN); return f; };
  const fFresh = mk(), fStale = mk(), fMid = mk(), fAsk = mk(), fBias = mk();

  // ⛔ THE REAL CONSTANT-OFFSET ARM (B1's fix): a scalar FROZEN at the first live instant and never
  //    recomputed. r1's version recomputed it per tick off the same row, which collapsed to `ask`.
  const bid0 = at(rows, grid[BURN_IN], r => r[1]), ask0 = at(rows, grid[BURN_IN], r => r[2]);
  if (bid0 === null || ask0 === null) return;
  const FIXED_OFFSET = (ask0 - bid0) / 2;
  if (!(FIXED_OFFSET > 0)) return;

  counts.excluded += BURN_IN;
  const hist = [...warm];

  for (const t of grid.slice(BURN_IN)) {
    const midNow = at(rows, t, r => r[3]);
    const midLag = at(rows, t - LAG_MS, r => r[3]);
    const askNow = at(rows, t, r => r[2]);
    if (midNow === null || midLag === null || askNow === null) continue;
    hist.push(midNow); if (hist.length > 20) hist.shift();
    const { ER, VolNoise } = erVol(hist);

    const oFresh = fFresh.update(midNow, ER, VolNoise);
    const oStale = fStale.update(midLag, ER, VolNoise);
    const oMid   = fMid.update(midNow, ER, VolNoise);
    const oAsk   = fAsk.update(askNow, ER, VolNoise);
    const oBias  = fBias.update(midNow + FIXED_OFFSET, ER, VolNoise);

    counts.evals++;
    const push = (k: string, i: number, o: number) => { acc[k].inp.push(i); acc[k].out.push(o); if (i > 0) acc[k].ratios.push(o / i); };
    push('freshness', bps(midNow, midLag), bps(oFresh, oStale));
    push('mid_vs_ask', bps(askNow, midNow), bps(oAsk, oMid));
    push('constant_offset', bps(midNow + FIXED_OFFSET, midNow), bps(oBias, oMid));
    biasFrac.push((oBias - oMid) / FIXED_OFFSET);
  }
}

function report(name: string, a: Arm) {
  const i50 = qt(a.inp, 0.5), o50 = qt(a.out, 0.5);
  const rm = i50 > 0 ? 100 * o50 / i50 : NaN;
  const mr = 100 * qt(a.ratios, 0.5);
  const iqr = `${(100 * qt(a.ratios, 0.25)).toFixed(1)}-${(100 * qt(a.ratios, 0.75)).toFixed(1)}`;
  console.log('  ' + name.padEnd(17) + 'n=' + String(a.inp.length).padStart(5)
    + '  in p50 ' + i50.toFixed(2).padStart(6) + '  out p50 ' + o50.toFixed(2).padStart(6)
    + '  | ratio-of-medians ' + (isNaN(rm) ? 'n/a' : rm.toFixed(1) + '%').padStart(7)
    + '  median-of-ratios ' + (isNaN(mr) ? 'n/a' : mr.toFixed(1) + '%').padStart(7)
    + '  IQR ' + iqr + '%');
}

const symbols = Object.keys(raw.symbols).filter(s => raw.symbols[s].length >= 50);
console.log('file=' + FILE + '  lag=' + LAG_MS + 'ms  cadence=' + CADENCE + 'ms  burnIn=' + BURN_IN + '  phases=' + PHASES);
console.log('symbols=' + symbols.length + '  durationMs=' + raw.durationMs + '   (all figures in bps)');

function runSet(setName: string, syms: string[]) {
  const acc: Record<string, Arm> = { freshness: mkArm(), mid_vs_ask: mkArm(), constant_offset: mkArm() };
  const biasFrac: number[] = [];
  const counts = { evals: 0, excluded: 0 };
  for (const s of syms) for (let p = 0; p < PHASES; p++) runSymbol(raw.symbols[s], (p * CADENCE) / PHASES, acc, biasFrac, counts);
  console.log('\n=== ' + setName + ' ===  evals=' + counts.evals + '  burn-in instants EXCLUDED=' + counts.excluded);
  for (const k of Object.keys(acc)) report(k, acc[k]);
  console.log('  constant-offset fraction surviving: n=' + biasFrac.length
    + '  p50=' + qt(biasFrac, 0.5).toFixed(3)
    + '  IQR ' + qt(biasFrac, 0.25).toFixed(3) + '-' + qt(biasFrac, 0.75).toFixed(3) + '   (1.000 = untouched)');
}

runSet('ALL SYMBOLS', symbols);
for (const s of symbols) runSet('ONLY ' + s, [s]);
const noFiat = symbols.filter(s => !['EUR/USD', 'USDC/USD', 'USDT/USD', 'USDC/USDT'].includes(s));
if (noFiat.length && noFiat.length !== symbols.length) runSet('LEAVE-OUT fiat/stable', noFiat);

console.log('\n⛔ READ THE TWO STATISTICS TOGETHER. r1 published only ratio-of-medians, and it read 1.46x');
console.log('   from the median-of-ratios on the SAME data. Neither is wrong; quoting one alone is.');
