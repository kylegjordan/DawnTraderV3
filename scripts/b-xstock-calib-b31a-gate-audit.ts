#!/usr/bin/env tsx
/**
 * B3.1a — xStock Strategy-Gate Correctness Audit Engine (CHUNK 1: core + L1 pure-filter)
 * ─────────────────────────────────────────────────────────────────────────────────────
 *
 * Answers, per gate: is it blocking the RIGHT signals? Not "does it block a lot."
 * Method (Kyle-approved, Langston-hardened — B_3_1_SCOPE.md §2 + §8):
 *
 *   - Candidates from the LIVE telemetry (`signal_eval_archive`) — the actual
 *     accept/reject decisions the system made (forming-bar based, as it really ran).
 *   - REACHED-GATE bucketing (Langston #3): for gate G, compare candidates that
 *     REACHED G — passed-G (admitted) vs rejected-AT-G — NOT vs final admits.
 *   - NO LOOK-AHEAD (Langston #2): bar-0 from `xstock_spot_ohlc_1m` at the decision
 *     minute; ENTRY = open of bar +1 (strictly after the decision); EXIT = close at +H min.
 *   - EXCESS return (Langston #1, THE critical fix): xStocks share underlying-equity/
 *     market beta, so raw forward return measures the tide, not gate skill. Discrimination
 *     uses forward return MINUS the cross-sectional universe base rate over the SAME
 *     [entry, entry+H] window. Base rate reported alongside.
 *   - SESSION-CLIPPED (Langston #5): a horizon is only scored if the exit 1m bar exists
 *     at exactly entry+H — naturally drops windows spanning session close / weekend / holiday.
 *   - METRIC (Q2): AUC (Mann-Whitney) PRIMARY (no win-threshold, tail-robust) + mean & median
 *     excess + n per bucket. AUC>0.5 ⇒ passed-G out-performs rejected-at-G ⇒ gate discriminates.
 *   - VERDICT = ROLLING-WINDOW CONSISTENCY (Langston #6): per-day AUC; a gate is only
 *     "suspect" on CONSISTENT failure across days, not one window.
 *   - ADMIT cross-check (Langston #7): admitted candidates joined to `exit_decision_archive`
 *     (realized r_multiple / pnl_pct) where the VTS trade actually ran.
 *
 * CHUNK 1 SCOPE: the two PURE-FILTER strategies whose L1 is valid (Langston #4):
 *   sma_trend_ride + mean_reversion, gate = `indicator_filter` (their dominant block).
 *   Entry-conditional strategies (vwap_*, breakout, patterns) need L2 — later chunk.
 *
 * DISPOSITION: offline diagnostic, READ-ONLY. No deploy. Run on staging (has DATABASE_URL):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b-xstock-calib-b31a-gate-audit.ts'"
 * ─────────────────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;

const WINDOW_DAYS = 7;
const HORIZONS_MIN = [60, 240]; // 1h, 4h (more added in later chunks)
const MIN_BUCKET_N = 30;        // skip a (window×horizon) cell with too few in either bucket
const MIN = 60_000;             // ms per minute

// CHUNK 1: pure-filter gates only (L1-valid). { strategy → gate-reason }.
const PURE_FILTER_GATES: Array<{ strategy: string; gate: string }> = [
  { strategy: 'sma_trend_ride', gate: 'indicator_filter' },
  { strategy: 'mean_reversion', gate: 'indicator_filter' },
];

interface Candidate { symbol: string; tsMs: number; passed: boolean; }

// ── 1m bar store: symbol → Map<minuteEpoch, {open, close}> ───────────────────
type BarMap = Map<number, { o: number; c: number }>;
const bars = new Map<string, BarMap>();

function barAt(symbol: string, minuteMs: number): { o: number; c: number } | undefined {
  return bars.get(symbol)?.get(minuteMs);
}

// forward return for one symbol from a decision minute: ENTRY=open(min+1), EXIT=close(min+1+H)
function fwdReturn(symbol: string, decisionMinMs: number, horizonMin: number): number | null {
  const entry = barAt(symbol, decisionMinMs + MIN);
  const exit = barAt(symbol, decisionMinMs + MIN + horizonMin * MIN);
  if (!entry || !exit || entry.o <= 0) return null; // session-clip: both bars must exist
  return (exit.c - entry.o) / entry.o;
}

// ── Universe base rate cache: key `${decisionMinMs}:${H}` → mean fwd return across all symbols
const universeCache = new Map<string, number | null>();
let allSymbols: string[] = [];
function universeBaseRate(decisionMinMs: number, horizonMin: number): number | null {
  const key = `${decisionMinMs}:${horizonMin}`;
  const cached = universeCache.get(key);
  if (cached !== undefined) return cached;
  let sum = 0, n = 0;
  for (const s of allSymbols) {
    const r = fwdReturn(s, decisionMinMs, horizonMin);
    if (r !== null && Number.isFinite(r)) { sum += r; n++; }
  }
  const base = n >= 5 ? sum / n : null; // need ≥5 symbols for a meaningful cross-section
  universeCache.set(key, base);
  return base;
}

// ── Stats: Mann-Whitney AUC (prob a random passed > random rejected) ─────────
function aucMannWhitney(passed: number[], rejected: number[]): number {
  // AUC via rank-sum: AUC = (R1 - n1(n1+1)/2) / (n1*n2), R1 = sum of ranks of `passed`
  const n1 = passed.length, n2 = rejected.length;
  if (n1 === 0 || n2 === 0) return NaN;
  const tagged = passed.map((v) => ({ v, g: 1 })).concat(rejected.map((v) => ({ v, g: 0 })));
  tagged.sort((a, b) => a.v - b.v);
  // average ranks for ties
  const ranks = new Array(tagged.length);
  let i = 0;
  while (i < tagged.length) {
    let j = i;
    while (j + 1 < tagged.length && tagged[j + 1].v === tagged[i].v) j++;
    const avg = (i + j) / 2 + 1; // ranks are 1-based
    for (let k = i; k <= j; k++) ranks[k] = avg;
    i = j + 1;
  }
  let R1 = 0;
  for (let k = 0; k < tagged.length; k++) if (tagged[k].g === 1) R1 += ranks[k];
  return (R1 - (n1 * (n1 + 1)) / 2) / (n1 * n2);
}
function median(a: number[]): number {
  if (a.length === 0) return NaN;
  const s = [...a].sort((x, y) => x - y); const m = Math.floor(s.length / 2);
  return s.length % 2 ? s[m] : (s[m - 1] + s[m]) / 2;
}
function mean(a: number[]): number { return a.length ? a.reduce((x, y) => x + y, 0) / a.length : NaN; }

function dayKey(tsMs: number): string { return new Date(tsMs).toISOString().slice(0, 10); }

// ── Main ─────────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  // Window bounds from the latest 1m bar (reproducible).
  const maxRes = await client.query<{ max: string }>(`SELECT max(interval_begin) AS max FROM xstock_spot_ohlc_1m`);
  const maxMs = new Date(maxRes.rows[0].max).getTime();
  const startMs = maxMs - WINDOW_DAYS * 86_400_000;
  console.log(`[B31A] window ${new Date(startMs).toISOString()} → ${new Date(maxMs).toISOString()}`);

  // Load all 1m bars in window (symbol, minute, open, close). Bound memory: only needed cols.
  console.log('[B31A] loading 1m bars…');
  const barRes = await client.query<{ symbol: string; interval_begin: string; open: string; close: string }>(
    `SELECT symbol, interval_begin, open, close FROM xstock_spot_ohlc_1m
      WHERE interval_begin >= $1 AND interval_begin <= $2`,
    [new Date(startMs).toISOString(), new Date(maxMs).toISOString()],
  );
  for (const r of barRes.rows) {
    const m = Math.floor(new Date(r.interval_begin).getTime() / MIN) * MIN;
    let bm = bars.get(r.symbol); if (!bm) { bm = new Map(); bars.set(r.symbol, bm); }
    bm.set(m, { o: Number(r.open), c: Number(r.close) });
  }
  allSymbols = [...bars.keys()];
  console.log(`[B31A] ${barRes.rows.length.toLocaleString()} 1m bars, ${allSymbols.length} symbols`);

  // Realized VTS outcomes (admit cross-check): trade key → r_multiple.
  const exitRes = await client.query<{ symbol: string; strategy: string; r_multiple: string | null; pnl_pct: string | null }>(
    `SELECT symbol, strategy, r_multiple, pnl_pct FROM exit_decision_archive
      WHERE asset_class='xstock_spot' AND captured_at >= $1`,
    [new Date(startMs).toISOString()],
  );
  const realizedByStrat = new Map<string, { rmults: number[]; pnls: number[] }>();
  for (const r of exitRes.rows) {
    const k = r.strategy;
    let e = realizedByStrat.get(k); if (!e) { e = { rmults: [], pnls: [] }; realizedByStrat.set(k, e); }
    if (r.r_multiple != null && Number.isFinite(Number(r.r_multiple))) e.rmults.push(Number(r.r_multiple));
    if (r.pnl_pct != null && Number.isFinite(Number(r.pnl_pct))) e.pnls.push(Number(r.pnl_pct));
  }

  for (const { strategy, gate } of PURE_FILTER_GATES) {
    console.log(`\n══════════════════════════════════════════════════════════`);
    console.log(`GATE CORRECTNESS — ${strategy} / ${gate}  (L1 pure-filter)`);
    console.log(`══════════════════════════════════════════════════════════`);

    // Reached-G population: passed = admitted; rejected = terminal reason == gate.
    const candRes = await client.query<{ symbol: string; captured_at: string; reject_stage: string; reason: string | null }>(
      `SELECT symbol, captured_at, reject_stage, COALESCE(gate_decision->>'reason', features->>'detailReason') AS reason
         FROM signal_eval_archive
        WHERE asset_class='xstock_spot' AND strategy=$1 AND captured_at >= $2
          AND (reject_stage='admitted' OR (reject_stage='strategy_internal' AND COALESCE(gate_decision->>'reason', features->>'detailReason')=$3))`,
      [strategy, new Date(startMs).toISOString(), gate],
    );
    const cands: Candidate[] = candRes.rows.map((r) => ({
      symbol: r.symbol, tsMs: Math.floor(new Date(r.captured_at).getTime() / MIN) * MIN,
      passed: r.reject_stage === 'admitted',
    }));
    const nPass = cands.filter((c) => c.passed).length, nRej = cands.length - nPass;
    console.log(`reached-gate candidates: ${cands.length} (passed=${nPass}, rejected-at-${gate}=${nRej})`);

    for (const H of HORIZONS_MIN) {
      // overall buckets of EXCESS return
      const exPass: number[] = [], exRej: number[] = [];
      // per-day for rolling-consistency
      const perDay = new Map<string, { p: number[]; r: number[] }>();
      for (const c of cands) {
        const raw = fwdReturn(c.symbol, c.tsMs, H);
        if (raw === null) continue;
        const base = universeBaseRate(c.tsMs, H);
        if (base === null) continue;
        const ex = raw - base;
        (c.passed ? exPass : exRej).push(ex);
        const dk = dayKey(c.tsMs);
        let d = perDay.get(dk); if (!d) { d = { p: [], r: [] }; perDay.set(dk, d); }
        (c.passed ? d.p : d.r).push(ex);
      }
      const auc = aucMannWhitney(exPass, exRej);
      console.log(`\n  H=${H}min | scored passed=${exPass.length} rejected=${exRej.length}`);
      console.log(`    excess mean: passed=${(mean(exPass) * 100).toFixed(3)}%  rejected=${(mean(exRej) * 100).toFixed(3)}%`);
      console.log(`    excess med : passed=${(median(exPass) * 100).toFixed(3)}%  rejected=${(median(exRej) * 100).toFixed(3)}%`);
      console.log(`    AUC(passed>rejected)=${auc.toFixed(4)}  (0.5=no skill; >0.5=gate keeps the better setups)`);
      // rolling-daily consistency
      const dayAucs: string[] = [];
      for (const dk of [...perDay.keys()].sort()) {
        const d = perDay.get(dk)!;
        if (d.p.length < MIN_BUCKET_N || d.r.length < MIN_BUCKET_N) { dayAucs.push(`${dk}:n/a`); continue; }
        dayAucs.push(`${dk}:${aucMannWhitney(d.p, d.r).toFixed(3)}`);
      }
      console.log(`    per-day AUC: ${dayAucs.join('  ')}`);
    }

    // Admit-side realized cross-check
    const rz = realizedByStrat.get(strategy);
    if (rz && rz.rmults.length) {
      console.log(`\n  realized VTS exits (admit cross-check): n=${rz.rmults.length} | r_multiple mean=${mean(rz.rmults).toFixed(3)} med=${median(rz.rmults).toFixed(3)} | pnl% mean=${mean(rz.pnls).toFixed(3)}`);
    } else {
      console.log(`\n  realized VTS exits: none recorded for ${strategy} in window (admit cross-check unavailable).`);
    }
  }

  await client.end();
  console.log('\n[B31A] CHUNK 1 complete. Interpretation: AUC≈0.5 across days ⇒ the indicator_filter does NOT separate winners from losers (suspect — calibrate). AUC consistently >0.55 ⇒ it discriminates (correct — leave). AUC consistently <0.45 ⇒ it is INVERTED (rejecting the better setups). Verdict requires day-to-day consistency, not one number.');
}

main().catch((err) => { console.error('[B31A] Fatal:', err); process.exit(1); });
