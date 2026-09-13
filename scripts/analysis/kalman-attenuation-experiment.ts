/**
 * kalman-attenuation-experiment.ts — DOES THE SMOOTHER DESTROY THE FRESHNESS ADVANTAGE, AND DOES IT
 * PASS A SIDE BIAS THROUGH? MEASURED AGAINST THE REAL FILTER, NOT ARGUED FROM HOW FILTERS BEHAVE.
 *
 * ═══ THE TWO CLAIMS ON TRIAL ═══
 * Both are mine, both were labelled UNPROVEN when I put them into the maker-fill debate, and the
 * decision Kyle is about to make rests on them:
 *   (i)  HIGH-FREQUENCY PRECISION IS DISCARDED BY DESIGN. Book-vs-ticker at age 0 is 2.02 bps and a
 *        30 s-old quote is 5.69 bps (n=225,104). If the smoother removes most of that, then
 *        subscribing the book earlier — the 100x data rewire — buys a fraction of an already small
 *        number, and `3n` is the better purchase.
 *   (ii) A SYSTEMATIC SIDE OFFSET PASSES THROUGH UNDIMINISHED. A Kalman filter attenuates zero-mean
 *        noise; a constant bias is not noise. If true, the midpoint/wrong-side error survives the
 *        smoother intact and IS worth fixing.
 * ⇒ (i) and (ii) together are the whole argument for "fix the side, not the feed". Neither may stand
 *   on plausibility: this file runs the ACTUAL `AdaptiveKalmanFilter` the orchestrator calls.
 *
 * ═══ METHOD ═══
 * Input is a REAL captured series (`capture-tick-series.mjs`): per symbol, rows of
 * [tMs, bid, ask, mid, lastTrade] on one clock, so the arms differ ONLY in which quantity they carry.
 * Evaluation instants are sampled at the cadence the orchestrator actually runs at — the filter
 * advances once per NEW observation, and the docblock at `adaptive-kalman.ts:60` records observations
 * arriving a median 60 s apart on staging. Each arm feeds its own fresh filter instance.
 *
 * ⛔ THE CONTROL THAT MAKES (ii) READABLE: arm `mid+bias` is the mid series shifted by a CONSTANT
 *    half-spread. If the smoother removed bias, that arm's output would converge back toward `mid`.
 *    Whatever fraction of the shift survives IS the pass-through, measured rather than asserted.
 * ⛔ AND THE ONE FOR (i): arms `fresh` and `stale` carry the SAME quantity, sampled at the same
 *    instants, differing only in that `stale` reads the value as of LAG_MS earlier. The output gap
 *    divided by the input gap is the attenuation.
 *
 * USAGE: npx tsx scripts/analysis/kalman-attenuation-experiment.ts <ticks.json> [lagMs] [cadenceMs]
 */

import * as fs from 'node:fs';
import { AdaptiveKalmanFilter } from '../../server/utils/adaptive-kalman.js';

type Row = [number, number, number, number, number | null];

const FILE      = process.argv[2] ?? 'ticks.json';
const LAG_MS    = Number(process.argv[3] ?? 37500);  // midpoint of the measured 30-45 s p50 band
const CADENCE   = Number(process.argv[4] ?? 60000);  // the measured median observation spacing

const raw = JSON.parse(fs.readFileSync(FILE, 'utf-8')) as {
  durationMs: number; symbols: Record<string, Row[]>;
};

/** Value of a series at or before time t — how a cache read of age `lag` actually behaves. */
function at(rows: Row[], t: number, pick: (r: Row) => number | null): number | null {
  if (t < rows[0][0]) return null;
  let lo = 0, hi = rows.length - 1, best = -1;
  while (lo <= hi) {
    const m = (lo + hi) >> 1;
    if (rows[m][0] <= t) { best = m; lo = m + 1; } else hi = m - 1;
  }
  return best < 0 ? null : pick(rows[best]);
}

/** ER / VolNoise from the recent series, the same quantities the orchestrator hands the filter. */
function erVol(vals: number[]): { ER: number; VolNoise: number } {
  if (vals.length < 3) return { ER: 0.5, VolNoise: 0.5 };
  const net = Math.abs(vals[vals.length - 1] - vals[0]);
  let path = 0;
  for (let i = 1; i < vals.length; i++) path += Math.abs(vals[i] - vals[i - 1]);
  const ER = path > 0 ? Math.min(1, net / path) : 0.5;
  return { ER, VolNoise: Math.min(1, Math.max(0, 1 - ER)) };
}

const bps = (a: number, b: number) => Math.abs(a - b) / b * 10_000;
const q = (a: number[], p: number) => { if (!a.length) return 0; const s = [...a].sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(p * s.length))]; };

console.log('file=' + FILE + '  lagMs=' + LAG_MS + '  cadenceMs=' + CADENCE);
console.log('symbols=' + Object.keys(raw.symbols).length + '  durationMs=' + raw.durationMs);

const inFreshVsStale: number[] = [], outFreshVsStale: number[] = [];
const inMidVsAsk: number[] = [],     outMidVsAsk: number[] = [];
const biasPassThrough: number[] = [];
let evals = 0;

/**
 * ⛔ PHASE REPLICATES, BECAUSE ONE GRID IS ONE SAMPLE PATH AND 60 INSTANTS IS NOT A POPULATION.
 * The evaluation grid advances at CADENCE (the filter's real advance rate, which must not change —
 * it IS the physics). But WHERE the grid starts is arbitrary, and a grid offset by a few seconds is
 * a genuinely different sample path over the same market. Replicating across offsets multiplies the
 * sample without touching the filter's dynamics. Each replicate gets FRESH filter instances.
 */
const PHASES = 12;
for (const [sym, rows] of Object.entries(raw.symbols)) {
  if (rows.length < 50) continue;
  for (let ph = 0; ph < PHASES; ph++) {
    runOne(rows, (ph * CADENCE) / PHASES);
  }
}

function runOne(rows: Row[], phaseMs: number) {

  // One filter per arm, per symbol — arms must not share state.
  const fFresh = new AdaptiveKalmanFilter();
  const fStale = new AdaptiveKalmanFilter();
  const fMid   = new AdaptiveKalmanFilter();
  const fAsk   = new AdaptiveKalmanFilter();
  const fBias  = new AdaptiveKalmanFilter();

  const hist: number[] = [];
  const t0 = rows[0][0], tEnd = rows[rows.length - 1][0];

  for (let t = t0 + LAG_MS + phaseMs; t <= tEnd; t += CADENCE) {
    const midNow  = at(rows, t, r => r[3]);
    const midLag  = at(rows, t - LAG_MS, r => r[3]);
    const askNow  = at(rows, t, r => r[2]);
    const bidNow  = at(rows, t, r => r[1]);
    if (midNow === null || midLag === null || askNow === null || bidNow === null) continue;

    hist.push(midNow);
    if (hist.length > 20) hist.shift();
    const { ER, VolNoise } = erVol(hist);

    // (i) same quantity, two freshness levels.
    const oFresh = fFresh.update(midNow, ER, VolNoise);
    const oStale = fStale.update(midLag, ER, VolNoise);
    // (ii) mid vs the transactable ask, and mid shifted by a CONSTANT half-spread as the control.
    const halfSpread = (askNow - bidNow) / 2;
    const oMid  = fMid.update(midNow, ER, VolNoise);
    const oAsk  = fAsk.update(askNow, ER, VolNoise);
    const oBias = fBias.update(midNow + halfSpread, ER, VolNoise);

    evals++;
    inFreshVsStale.push(bps(midNow, midLag));
    outFreshVsStale.push(bps(oFresh, oStale));
    inMidVsAsk.push(bps(askNow, midNow));
    outMidVsAsk.push(bps(oAsk, oMid));
    if (halfSpread > 0) biasPassThrough.push((oBias - oMid) / halfSpread);
  }
}


const show = (label: string, inp: number[], out: number[]) => {
  const i50 = q(inp, 0.5), o50 = q(out, 0.5), i90 = q(inp, 0.9), o90 = q(out, 0.9);
  console.log('  ' + label.padEnd(26)
    + 'INPUT p50 ' + i50.toFixed(2).padStart(7) + ' p90 ' + i90.toFixed(2).padStart(7)
    + '   OUTPUT p50 ' + o50.toFixed(2).padStart(7) + ' p90 ' + o90.toFixed(2).padStart(7)
    + '   SURVIVES p50 ' + (i50 > 0 ? (100 * o50 / i50).toFixed(1) + '%' : 'n/a'));
};

console.log('\nevaluation instants = ' + evals + '   (all figures in basis points)');
console.log('\n(i) FRESHNESS — same quantity, ' + (LAG_MS / 1000) + 's apart:');
show('fresh vs stale', inFreshVsStale, outFreshVsStale);
console.log('\n(ii) SIDE — midpoint vs the transactable ask:');
show('mid vs ask', inMidVsAsk, outMidVsAsk);

const bp = biasPassThrough;
console.log('\n(ii-control) CONSTANT HALF-SPREAD BIAS, fraction surviving the filter:');
console.log('   n=' + bp.length + '  p10=' + q(bp, 0.1).toFixed(3)
  + '  p50=' + q(bp, 0.5).toFixed(3) + '  p90=' + q(bp, 0.9).toFixed(3)
  + '   (1.000 = passes through untouched; 0.000 = fully removed)');

console.log('\n⇒ (i) is supported only if the freshness gap SHRINKS through the filter.');
console.log('⇒ (ii) is supported only if the bias fraction stays near 1.0.');
console.log('⛔ If either comes out otherwise, the "fix the side, not the feed" recommendation loses its mechanism.');
