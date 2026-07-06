#!/usr/bin/env tsx
/**
 * B-NEW-53 post-accrual PROOF-OF-CAPTURE parity re-run (alert 7362f63f).
 *
 * The W2.0b successor: instead of RECONSTRUCTING the engine's bars backward from
 * 1m data (capped at 80% Tier-1 parity — the forming bar was irreducible), this
 * feeds the PERSISTED decision provenance (B-NEW-53, live since 2026-06-07):
 *   - settled bars: the live `xstock_spot_ohlc_15m_snapshot` rows the engine
 *     cached, referenced by (settled_bucket_ts, settled_bar_count);
 *   - the FORMING bar BY VALUE from `signal_eval_provenance` (the exact
 *     in-progress bar the engine evaluated — the old 20% gap);
 *   - constants provenance via constants_hash (parity is tallied PER HASH so a
 *     constants change since capture is visible, not silently blended).
 *
 * REPORTING (Langston C1): Tier-1 parity AND provenance-coverage are reported
 * SEPARATELY — coverage is a base-driven LEFT JOIN (orphan/missing provenance
 * under burst is a coverage number, never a parity distortion).
 *
 * READ-ONLY (same safety rails as b5-w20b-entry-replay.ts): no writes, no
 * module_constants mutation, look-ahead guard on the forming bucket.
 *
 * Gate: Tier-1 (fired/no-fire binary) >= 99% on captured rows → the xStock
 * entry-trigger study (roadmap 25-12) is backward-replayable → RESUME it.
 */
import pg from 'pg';
import { getMarketContextEngine } from '../server/services/market-context-engine.js';
import { StrategyEngine } from '../server/services/strategy-engine.js';
import { getNullReason, resetNullReason } from '../server/utils/null-reason-tracker.js';
import { warmModuleConstantsForSyncCallers } from '../server/startup/b72-warmup.js';
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { DEFAULT_DBS_CONFIG, type DBSConfig } from '../server/types/directional-bias.types.js';
import { getConstant } from '../server/services/module-constants-service.js';

const { Client } = pg;
const strategyEngine = new StrategyEngine();

const STRATEGY = 'vwap_pullback';
const ASSET_CLASS = 'xstock_spot' as const;
const STRATEGY_CALL_SETTINGS = {
  smaLength: 20, riskPerTradePercent: 2.0, maxOpenPositions: 5,
  dailyLossLimitPercent: 10.0, whitelistedSymbols: [], blacklistedSymbols: [], allowedTradingPairs: [],
} as any;
const MAX_BARS_15M = 240;
const BUCKET_MS = 900_000;
const SAMPLE_CAP = Number(process.env.W20C_SAMPLE ?? 3000);
const ERA_START = process.env.W20C_ERA_START ?? '2026-06-08T00:00:00Z';   // first full capture day
// reorg-B3.3x (xStock 'tag' un-strangle) deploy: commit 53f601b93, 2026-06-24T21:50Z (+2h TZ).
const B33X_TAG_CUTOVER_MS = Date.parse(process.env.W20C_TAG_CUTOVER ?? '2026-06-24T22:10:00Z');
const NEUTRAL_DBS = { score: 0, category: 'NEUTRAL', slope: 0 };

// ── The live scanner's per-cycle DBS recipe, reconstructed per decision ──
// The live eval receives a REAL propagatedDbs computed by the xStock scanner
// from the SAME ohlc series the eval evaluates (scanner.ts:833-885) — and DBS
// drives vwap_pullback's GEOMETRY (B63 Item 11/12 strong-trend lane: 4×ATR
// stop / 3R target when |DBS| >= 0.35) plus the counter-trend guard (Item 10).
// Replaying with NEUTRAL_DBS (as the old W2.0b harness also did) silently uses
// the WRONG geometry lane → guard verdicts + stop/target diverge (measured:
// RI-a checksum non-exact + guard_fail/price_position misses). The bars are
// captured, the recipe is deterministic, the config is module_constants —
// so the live DBS is exactly reconstructible.
function computeATRFromOHLC(ohlcData: Bar[], period: number): number {
  // verbatim mirror of scanner.ts:62 (module-local there, not exported)
  if (ohlcData.length < period + 1) return 0;
  const recent = ohlcData.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = recent[i].high, low = recent[i].low, prevClose = recent[i - 1].close;
    trSum += Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
  }
  return trSum / period;
}

let xstockDbsConfig: DBSConfig;
let xstockDbsAtrPeriod: number;
async function resolveXstockDbsConfig(): Promise<void> {
  const DBS_KEY = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
  const [lookback, emaFast, emaSlow, atrPeriod] = await Promise.all([
    getConstant<number>('directional_bias', 'lookback_period', DBS_KEY),
    getConstant<number>('directional_bias', 'ema_fast', DBS_KEY),
    getConstant<number>('directional_bias', 'ema_slow', DBS_KEY),
    getConstant<number>('directional_bias', 'atr_period', DBS_KEY),
  ]);
  if ([lookback, emaFast, emaSlow, atrPeriod].some(v => typeof v !== 'number')) {
    throw new Error('[W20C] xstock_spot directional_bias constants missing — cannot reconstruct live DBS');
  }
  xstockDbsConfig = { ...DEFAULT_DBS_CONFIG, lookbackPeriod: lookback as number, emaPeriods: { fast: emaFast as number, slow: emaSlow as number } };
  xstockDbsAtrPeriod = atrPeriod as number;
}

/** scanner.ts:833-885 verbatim recipe: DBS over the full series + slope vs the series minus 3 bars. */
function reconstructDbs(bars: Bar[]): { score: number; category: string; slope: number } | undefined {
  const atr = computeATRFromOHLC(bars, xstockDbsAtrPeriod);
  if (atr <= 0) return undefined;   // scanner `continue`s → eval gets undefined → MCE synthesizes neutral
  const dbsResult = computeDirectionalBias(bars as any, atr, xstockDbsConfig);
  let slope = 0;
  const priorOHLC = bars.slice(0, -3);
  if (priorOHLC.length >= 20) {
    const priorAtr = computeATRFromOHLC(priorOHLC, xstockDbsAtrPeriod);
    if (priorAtr > 0) {
      const priorDbs = computeDirectionalBias(priorOHLC as any, priorAtr, xstockDbsConfig);
      slope = dbsResult.score - priorDbs.score;
    }
  }
  return { score: dbsResult.score, category: dbsResult.category, slope };
}

type Bar = { open: number; high: number; low: number; close: number; volume: number; timestamp: number };
type Decision = {
  symbol: string; capturedMs: number; rejectStage: string; reason: string | null;
  forming: Bar | null; settledBucketMs: number | null; settledBarCount: number | null;
  constantsHash: string | null;
  resolvedStop: number | null; resolvedTarget: number | null;   // the RI-a checksum
};

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) { console.error('DATABASE_URL required'); process.exit(1); }
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  // One-off read-only study: the coverage LEFT JOIN spans two multi-million-row
  // partitioned tables and legitimately runs past the default statement timeout.
  await client.query(`SET statement_timeout = 0`);

  console.log(`[W20C] warming module_constants for sync detect callers...`);
  await warmModuleConstantsForSyncCallers();
  await resolveXstockDbsConfig();
  console.log(`[W20C] xStock DBS config resolved (lookback=${xstockDbsConfig.lookbackPeriod}, atrPeriod=${xstockDbsAtrPeriod}).`);
  const mce = getMarketContextEngine();
  await (mce as any).refreshAllConfigs();
  console.log(`[W20C] MCE config warm.`);

  // ── C1: provenance COVERAGE, base-driven LEFT JOIN, reported separately ──
  console.log(`[W20C] measuring provenance coverage (base-driven LEFT JOIN, era >= ${ERA_START})...`);
  const covRes = await client.query<{ base: string; covered: string }>(
    `SELECT count(b.id) AS base, count(p.archive_id) AS covered
       FROM signal_eval_archive b
       LEFT JOIN signal_eval_provenance p
         ON p.archive_id = b.id AND p.captured_at = b.captured_at
      WHERE b.asset_class = $1 AND b.strategy = $2 AND b.captured_at >= $3`,
    [ASSET_CLASS, STRATEGY, ERA_START]);
  const baseN = Number(covRes.rows[0].base), coveredN = Number(covRes.rows[0].covered);
  console.log(`[W20C] COVERAGE: ${coveredN.toLocaleString()}/${baseN.toLocaleString()} base decisions carry provenance = ${(100 * coveredN / Math.max(1, baseN)).toFixed(2)}%`);

  // ── Sample captured decisions (stratified: ALL fired first, stride no-fire) ──
  const decisionRow = (r: any): Decision => ({
    symbol: r.symbol, capturedMs: new Date(r.captured_at).getTime(),
    rejectStage: r.reject_stage, reason: r.reason,
    forming: r.forming_close !== null && r.forming_bar_ts !== null ? {
      open: +r.forming_open, high: +r.forming_high, low: +r.forming_low,
      close: +r.forming_close, volume: +(r.forming_volume ?? 0), timestamp: Number(r.forming_bar_ts),
    } : null,
    settledBucketMs: r.settled_bucket_ts ? new Date(r.settled_bucket_ts).getTime() : null,
    settledBarCount: r.settled_bar_count !== null ? Number(r.settled_bar_count) : null,
    constantsHash: r.constants_hash ?? null,
    resolvedStop: r.resolved_stop_price !== null ? +r.resolved_stop_price : null,
    resolvedTarget: r.resolved_target_price !== null ? +r.resolved_target_price : null,
  });

  const half = Math.floor(SAMPLE_CAP / 2);
  const firedRes = await client.query(
    `SELECT DISTINCT ON (p.symbol, date_trunc('minute', p.captured_at))
            p.symbol, p.captured_at, b.reject_stage,
            COALESCE(b.gate_decision->>'reason', b.features->>'detailReason') AS reason,
            p.forming_open, p.forming_high, p.forming_low, p.forming_close, p.forming_volume, p.forming_bar_ts,
            p.settled_bucket_ts, p.settled_bar_count, p.constants_hash,
            p.resolved_stop_price, p.resolved_target_price
       FROM signal_eval_provenance p
       JOIN signal_eval_archive b ON b.id = p.archive_id AND b.captured_at = p.captured_at
      WHERE p.asset_class = $1 AND p.strategy = $2 AND p.captured_at >= $3
        AND b.reject_stage <> 'strategy_internal'
      ORDER BY p.symbol, date_trunc('minute', p.captured_at), p.captured_at DESC
      LIMIT $4`,
    [ASSET_CLASS, STRATEGY, ERA_START, half]);
  // systematic stride over the no-fire mass (archive_id modulo — pseudo-random, reproducible)
  const noFireRes = await client.query(
    `SELECT p.symbol, p.captured_at, b.reject_stage,
            COALESCE(b.gate_decision->>'reason', b.features->>'detailReason') AS reason,
            p.forming_open, p.forming_high, p.forming_low, p.forming_close, p.forming_volume, p.forming_bar_ts,
            p.settled_bucket_ts, p.settled_bar_count, p.constants_hash,
            p.resolved_stop_price, p.resolved_target_price
       FROM signal_eval_provenance p
       JOIN signal_eval_archive b ON b.id = p.archive_id AND b.captured_at = p.captured_at
      WHERE p.asset_class = $1 AND p.strategy = $2 AND p.captured_at >= $3
        AND b.reject_stage = 'strategy_internal'
        AND (p.archive_id % 797) = 0
      LIMIT $4`,
    [ASSET_CLASS, STRATEGY, ERA_START, SAMPLE_CAP - Math.min(half, firedRes.rows.length)]);
  const decisions: Decision[] = [...firedRes.rows.map(decisionRow), ...noFireRes.rows.map(decisionRow)];
  console.log(`[W20C] sampled ${decisions.length} captured decisions (fired=${firedRes.rows.length}, noFire=${noFireRes.rows.length}).`);

  // ── Load the live settled-bar snapshots for the sampled symbols ──
  const symbols = [...new Set(decisions.map(d => d.symbol))];
  console.log(`[W20C] loading 15m snapshot bars for ${symbols.length} symbols...`);
  const snapBySym = new Map<string, Bar[]>();
  const sRes = await client.query<{ symbol: string; bucket_ts: string; open: string; high: string; low: string; close: string; volume: string }>(
    `SELECT symbol, bucket_ts, open, high, low, close, volume
       FROM xstock_spot_ohlc_15m_snapshot WHERE symbol = ANY($1) ORDER BY symbol, bucket_ts`, [symbols]);
  for (const r of sRes.rows) {
    let a = snapBySym.get(r.symbol); if (!a) { a = []; snapBySym.set(r.symbol, a); }
    a.push({ open: +r.open, high: +r.high, low: +r.low, close: +r.close, volume: +r.volume, timestamp: new Date(r.bucket_ts).getTime() });
  }
  console.log(`[W20C] ${sRes.rows.length.toLocaleString()} snapshot bars loaded.`);

  // ── Replay each captured decision from its provenance ──
  let t1Match = 0, t1Total = 0, t2Match = 0, t2Total = 0;
  let dropped = 0, droppedNoSettledRef = 0, droppedThin = 0, lookAheadViolations = 0;
  let archiveFiredHarnessNoFire = 0, archiveNoFireHarnessFired = 0;
  const missedFiredReason = new Map<string, number>();
  const reasonConfusion = new Map<string, number>();
  const byHash = new Map<string, { match: number; total: number }>();
  let ckTotal = 0, ckExact = 0, ckClose = 0;   // RI-a stop/target checksum on both-fired rows
  const missSamples: string[] = [];
  const byWeek = new Map<string, { match: number; total: number }>();   // is the miss rate time-concentrated?
  const weekOf = (ms: number) => { const d = new Date(ms); const day = (d.getUTCDay() + 6) % 7; const mon = new Date(ms - day * 86400000); return mon.toISOString().slice(0, 10); };

  for (const d of decisions) {
    const snap = snapBySym.get(d.symbol);
    if (!snap || snap.length === 0 || d.settledBucketMs === null) { droppedNoSettledRef++; continue; }
    // Look-ahead guard on the CAPTURED inputs themselves: the settled reference
    // must be STRICTLY pre-forming. NOT contiguity — xStock is 24/5, so across
    // the weekend dark window (Fri close → Sun open) the newest settled bucket
    // legitimately sits far behind the forming bucket. NOTE: `captured_at` is
    // the archive batch-writer FLUSH time (minutes after the decision), so it
    // is NOT a valid anchor for this check — the provenance pair is.
    if (d.forming && d.settledBucketMs >= d.forming.timestamp) { lookAheadViolations++; continue; }
    // exactly the settled set the engine saw: bars <= settled_bucket_ts, last N
    let settled = snap.filter(b => b.timestamp <= d.settledBucketMs!);
    if (d.settledBarCount !== null && d.settledBarCount >= 0) settled = settled.slice(-Math.min(d.settledBarCount, MAX_BARS_15M));
    else settled = settled.slice(-MAX_BARS_15M);
    const bars = d.forming ? [...settled, d.forming].slice(-MAX_BARS_15M) : settled.slice(-MAX_BARS_15M);
    if (bars.length < 30) { droppedThin++; continue; }

    const currentPrice = d.forming ? d.forming.close : bars[bars.length - 1].close;
    const volume24h = bars.slice(-96).reduce((s, b) => s + b.volume, 0);
    // Era-correct gate disposition (see the detect call below for rationale).
    const disposition = d.capturedMs >= B33X_TAG_CUTOVER_MS ? 'tag' as const : 'enforce' as const;
    let harnessFired: boolean;
    let harnessReason: string | null = null;
    let harnessStop: number | null = null, harnessTarget: number | null = null, harnessAtr: number | null = null;
    try {
      // MCE keeps a 60s per-(symbol,assetClass) context cache — correct live
      // (real minutes between evaluations), FATAL in replay (days compressed
      // into seconds → every call after a symbol's first was served the FIRST
      // decision's frozen indicators; measured: harness ATR frozen across an
      // hour of buckets, RI-a checksum 0-exact-of-521). Clear per decision so
      // each replay computes fresh from ITS captured bars.
      (mce as any).cache?.clear?.();
      // The live scanner's DBS, reconstructed from the SAME captured bars.
      const dbs = reconstructDbs(bars) ?? NEUTRAL_DBS;
      const ctx = mce.computeContext(d.symbol, bars as any, currentPrice, volume24h, undefined, dbs, ASSET_CLASS);
      harnessAtr = (ctx.indicators.atr as number) ?? null;
      const ind = {
        vwap: ctx.indicators.vwap, sma: ctx.indicators.sma, currentPrice: ctx.indicators.currentPrice,
        volume: ctx.indicators.volume, high24h: ctx.indicators.high24h, low24h: ctx.indicators.low24h,
        atr: ctx.indicators.atr, dbsScore: dbs.score, dbsCategory: dbs.category, dbsSlope: dbs.slope,
      };
      resetNullReason();
      // Era-correct disposition: the xStock VTS lane hard-dropped quality guard
      // fails ('enforce') until reorg-B3.3x deployed 2026-06-24 ~22:00Z, then
      // TAGS them ('tag' — the un-strangle). Replaying with the wrong era's
      // disposition mislabels every guard-tagged fire as a no-fire (measured:
      // Tier-1 45% with 'guard_fail' dominating the misses).
      const sig = strategyEngine.detectVWAPPullback(ind as any, STRATEGY_CALL_SETTINGS, bars as any, ASSET_CLASS, disposition);
      harnessFired = sig != null;
      if (!harnessFired) harnessReason = getNullReason() || null;
      else { harnessStop = (sig as any).stopPrice ?? null; harnessTarget = (sig as any).targetPrice ?? null; }
    } catch { dropped++; continue; }

    const archiveFired = d.rejectStage !== 'strategy_internal';
    t1Total++;
    const hashKey = `${d.constantsHash ?? 'NULL_HASH'} [${disposition}]`;
    const h = byHash.get(hashKey) ?? { match: 0, total: 0 };
    h.total++;
    const wk = weekOf(d.capturedMs);
    const w = byWeek.get(wk) ?? { match: 0, total: 0 };
    w.total++;
    if (harnessFired === archiveFired) w.match++;
    byWeek.set(wk, w);
    if (harnessFired === archiveFired) {
      t1Match++; h.match++;
      // RI-a checksum on both-fired rows: harness geometry vs the PERSISTED levels
      if (archiveFired && harnessFired && d.resolvedStop !== null && harnessStop !== null) {
        const relS = Math.abs(harnessStop - d.resolvedStop) / Math.max(1e-9, Math.abs(d.resolvedStop));
        const relT = d.resolvedTarget !== null && harnessTarget !== null
          ? Math.abs(harnessTarget - d.resolvedTarget) / Math.max(1e-9, Math.abs(d.resolvedTarget)) : 1;
        ckTotal++;
        if (relS < 1e-6 && relT < 1e-6) ckExact++;
        else if (relS < 1e-3 && relT < 1e-3) ckClose++;
      }
    }
    else if (archiveFired && !harnessFired) {
      archiveFiredHarnessNoFire++;
      const k = harnessReason || 'NULL';
      missedFiredReason.set(k, (missedFiredReason.get(k) ?? 0) + 1);
      // spread the samples across the miss population (every 80th), not first-10
      if (archiveFiredHarnessNoFire % 80 === 1 && missSamples.length < 12) {
        missSamples.push(`${d.symbol} @${new Date(d.capturedMs).toISOString()} [${disposition}] reason=${harnessReason} `
          + `liveStop=${d.resolvedStop} liveTarget=${d.resolvedTarget} harnessAtr=${harnessAtr?.toFixed?.(6)} bars=${bars.length} px=${currentPrice}`);
      }
    } else archiveNoFireHarnessFired++;
    byHash.set(hashKey, h);

    if (!archiveFired) {
      t2Total++;
      const aReason = (d.reason ?? '').trim(), hReason = (harnessReason ?? '').trim();
      if (!harnessFired && aReason && hReason && aReason === hReason) t2Match++;
      else if (!harnessFired) {
        const k = `${aReason || 'NULL'} -> ${hReason || 'NULL'}`;
        reasonConfusion.set(k, (reasonConfusion.get(k) ?? 0) + 1);
      }
    }
  }

  const pct = (a: number, b: number) => b === 0 ? 'n/a' : `${(100 * a / b).toFixed(2)}% (${a}/${b})`;
  console.log(`\n============ B-NEW-53 PROOF-OF-CAPTURE PARITY (provenance-fed, vwap_pullback) ============`);
  console.log(`PROVENANCE COVERAGE (C1, separate): ${pct(coveredN, baseN)} of base decisions since ${ERA_START}`);
  console.log(`TIER-1 fired/no-fire binary       : ${pct(t1Match, t1Total)}   [gate >= 99%]`);
  console.log(`TIER-2 reason within no-fire      : ${pct(t2Match, t2Total)}   [diagnostic >= 95%]`);
  console.log(`dropped: err=${dropped} noSettledRef=${droppedNoSettledRef} thin=${droppedThin}`);
  console.log(`look-ahead violations             : ${lookAheadViolations}  [MUST be 0]`);
  console.log(`DIRECTIONAL misses: archiveFired&harnessNoFire=${archiveFiredHarnessNoFire}  archiveNoFire&harnessFired=${archiveNoFireHarnessFired}`);
  console.log(`RI-a CHECKSUM (both-fired rows: harness stop/target vs PERSISTED levels): exact=${ckExact} close(<0.1%)=${ckClose} of ${ckTotal}`);
  console.log(`\nPER CONSTANTS-HASH × DISPOSITION parity:`);
  [...byHash.entries()].forEach(([k, v]) => console.log(`   ${k}  ${pct(v.match, v.total)}`));
  console.log(`\nPARITY BY WEEK (is the miss rate time-concentrated?):`);
  [...byWeek.entries()].sort((a, b) => a[0] < b[0] ? -1 : 1).forEach(([k, v]) => console.log(`   wk ${k}  ${pct(v.match, v.total)}`));
  if (missSamples.length) {
    console.log(`\nSAMPLE MISSES (archive FIRED, harness no-fire):`);
    missSamples.forEach(s => console.log(`   ${s}`));
  }
  if (missedFiredReason.size) {
    console.log(`\nharness null-reason WHEN archive FIRED but harness did NOT:`);
    [...missedFiredReason.entries()].sort((a, b) => b[1] - a[1]).slice(0, 12)
      .forEach(([k, n]) => console.log(`   ${String(n).padStart(5)}  ${k}`));
  }
  if (reasonConfusion.size) {
    console.log(`\nTIER-2 top reason confusions (archive -> harness):`);
    [...reasonConfusion.entries()].sort((a, b) => b[1] - a[1]).slice(0, 10)
      .forEach(([k, n]) => console.log(`   ${String(n).padStart(5)}  ${k}`));
  }
  console.log(`==========================================================================================\n`);
  await client.end();
}

main().then(() => process.exit(0)).catch(err => { console.error(err); process.exit(1); });
