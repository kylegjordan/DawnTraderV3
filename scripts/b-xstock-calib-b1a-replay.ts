#!/usr/bin/env tsx
/**
 * B-XSTOCK-CALIB Sub-batch 1 (B.1a) — Archive Replay Harness
 * ─────────────────────────────────────────────────────────────────────────
 *
 * Re-runs the production `calculatePairRegime()` classifier against the
 * archived xStock OHLC + DBS data for the 2026-05-06 → 2026-05-15 window
 * and emits a per-bar CSV with regime label + confidence + raw inputs.
 *
 * Provides empirical evidence for:
 *   - B.1a — are the 14 _XSTOCK regime threshold constants producing
 *            sensible regime distribution across xStock symbols?
 *   - B.1b — are the halved TFS confidence-formula scales
 *            (tfsMomentumScale=0.010, tfsVolatilityScale=0.0125) producing
 *            a usable confidence distribution per regime branch, or is
 *            momentumFactor saturating too aggressively given xStock's
 *            p95 mom = 6% wall above the 1% saturation point?
 *
 * Per Langston Step 2 Q5 additions:
 *   - Per-BRANCH conditional confidence output (TFS-only, IE-only, etc.)
 *     not population-aggregated.
 *
 * Usage (on staging — has DATABASE_URL via .env):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     set -a && source .env && set +a && \
 *     npx tsx scripts/b-xstock-calib-b1a-replay.ts'"
 *
 * Output:
 *   - scripts/b-xstock-calib-b1a-replay-output.csv (per-bar rows)
 *   - stdout summary table (regime share + per-branch confidence quartiles)
 *
 * **Disposition:** REUSABLE diagnostic — kept in tree for future B.1
 * recalibration cycles when fresh DBS backfill data is available, and for
 * the broader B-XSTOCK-CALIB umbrella's other sub-batches that need
 * archive-replay evidence against the production classifier (B.2, B.3,
 * B.6 can extend the same harness pattern). Safe to re-invoke at any
 * time — read-only against the archive tables.
 * ─────────────────────────────────────────────────────────────────────────
 */

import pg from 'pg';
const { Client } = pg;
import { createWriteStream } from 'node:fs';
import { calculatePairRegime } from '../server/core/metrics/market-regime.js';
import type { OHLCData, RegimeConfig } from '../server/types/market-regime.types.js';
import type { AssetClass } from '../shared/asset-classes.js';

// ── Replay window ───────────────────────────────────────────────────────────
const REPLAY_START = '2026-05-06 18:00:00+00';
const REPLAY_END = '2026-05-15 23:00:00+00';

// `calculatePairRegime` needs:
//   - `computeMomentum`: 30-bar lookback (HF7 extended from 14)
//   - `computeADX`: period=14 + 1 prior bar = 15 bars min
//   - `computeVolatility`: at least 2 bars
// 30-bar minimum yields wider replay corpus given limited per-symbol OHLC history.
const OHLC_LOOKBACK_BARS = 30;

const OUT_PATH = './scripts/b-xstock-calib-b1a-replay-output.csv';

// ── Build RegimeConfig from module_constants ───────────────────────────────
async function buildXstockRegimeConfig(client: Client): Promise<RegimeConfig> {
  const r = await client.query<{ module_name: string; constant_name: string; value: unknown }>(
    `SELECT module_name, constant_name, value
       FROM module_constants
      WHERE asset_class = 'xstock_spot'
        AND (module_name = 'regime_classifier' OR module_name = 'path_b_sustainability')`,
  );

  const byKey = new Map<string, number>();
  for (const row of r.rows) {
    // value is jsonb; pg returns it parsed already
    const v = typeof row.value === 'number' ? row.value : Number(row.value);
    byKey.set(`${row.module_name}.${row.constant_name}`, v);
  }

  const need = (k: string): number => {
    const v = byKey.get(k);
    if (v === undefined || Number.isNaN(v)) {
      throw new Error(`[REGIME_CONFIG] Missing required xstock_spot key: ${k}`);
    }
    return v;
  };

  return {
    tfsDesatMin: need('regime_classifier.b67_3_5_tfs_desat_min'),
    tfsDesatMax: need('regime_classifier.b67_3_5_tfs_desat_max'),
    tfsMomentumScale: need('regime_classifier.b67_3_5_tfs_momentum_scale'),
    tfsVolatilityScale: need('regime_classifier.b67_3_5_tfs_volatility_scale'),
    tfsDbsScale: need('regime_classifier.b67_3_5_tfs_dbs_scale'),
    b68_5PathBMomentumMin: need('path_b_sustainability.b68_5_path_b_momentum_min'),
    b68_5DbsSlopeMin: 0.0,
    b67_5PostCompositionFloor: need('regime_classifier.b67_5_post_composition_floor'),
  };
}

// ── Fetch distinct symbols in replay window ────────────────────────────────
async function fetchAllSymbols(client: Client): Promise<string[]> {
  const r = await client.query<{ symbol: string }>(
    `SELECT DISTINCT symbol
       FROM xstock_spot_ohlc_60m_snapshot
      WHERE bucket_ts >= $1 AND bucket_ts < $2
      ORDER BY symbol`,
    [REPLAY_START, REPLAY_END],
  );
  return r.rows.map((x) => x.symbol);
}

// ── Replay a single symbol ─────────────────────────────────────────────────
interface ReplayRow {
  symbol: string;
  bucket_ts: string;
  regime: string;
  confidence: number;
  vol: number;
  mom: number;
  adx: number;
  dbs: number;
}

async function replayOneSymbol(
  client: Client,
  symbol: string,
  regimeConfig: RegimeConfig,
  out: NodeJS.WritableStream,
  agg: AggregatedStats,
): Promise<number> {
  // Fetch OHLC bars with 60-bar prefix before replay window for lookback
  const ohlcRes = await client.query<{
    bucket_ts: string;
    open: string;
    high: string;
    low: string;
    close: string;
    volume: string;
  }>(
    `SELECT bucket_ts, open, high, low, close, volume
       FROM xstock_spot_ohlc_60m_snapshot
      WHERE symbol = $1
        AND bucket_ts >= ($2::timestamptz - INTERVAL '60 hours')
        AND bucket_ts < $3
      ORDER BY bucket_ts ASC`,
    [symbol, REPLAY_START, REPLAY_END],
  );

  if (ohlcRes.rows.length < OHLC_LOOKBACK_BARS + 1) {
    return 0; // not enough lookback to classify even one bar
  }

  // Fetch DBS rows for the replay window
  const dbsRes = await client.query<{ ts: string; final_score: number }>(
    `SELECT ts, final_score
       FROM xstock_dbs_backfill
      WHERE symbol = $1 AND ts >= $2 AND ts < $3
      ORDER BY ts ASC`,
    [symbol, REPLAY_START, REPLAY_END],
  );

  // Index DBS by ms-epoch (both tables 60-min aligned; ms-int compare is deterministic)
  const dbsByMs = new Map<number, number>();
  for (const r of dbsRes.rows) {
    dbsByMs.set(new Date(r.ts).getTime(), Number(r.final_score));
  }

  // Build OHLCData array (numeric coercion from pg numerics)
  const ohlcArr: Array<OHLCData & { _bucketTs: string }> = ohlcRes.rows.map((r) => ({
    timestamp: new Date(r.bucket_ts).getTime(),
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    _bucketTs: new Date(r.bucket_ts).toISOString(),
  }));

  let writtenForSymbol = 0;
  const replayStartTs = new Date(REPLAY_START).getTime();

  for (let i = OHLC_LOOKBACK_BARS; i < ohlcArr.length; i++) {
    const bar = ohlcArr[i];
    if (bar.timestamp < replayStartTs) continue;

    const dbs = dbsByMs.get(bar.timestamp);
    if (dbs === undefined) continue; // no matched DBS; skip

    const window = ohlcArr.slice(i - OHLC_LOOKBACK_BARS, i + 1).map((b) => ({
      timestamp: b.timestamp,
      open: b.open,
      high: b.high,
      low: b.low,
      close: b.close,
      volume: b.volume,
    }));

    const result = calculatePairRegime(
      window,
      dbs,
      0.0, // dbsSlope: advisory replay, no slope
      1.0, // macroModifier: identity (no live macro modulation in replay)
      regimeConfig,
      'xstock_spot' as AssetClass,
    );

    out.write(
      [
        symbol,
        bar._bucketTs,
        result.regime,
        result.confidence.toFixed(4),
        result.volatility.toFixed(6),
        result.momentum.toFixed(6),
        result.adx.toFixed(2),
        dbs.toFixed(4),
      ].join(',') + '\n',
    );

    // Aggregate per-branch confidence
    const branch = result.regime;
    if (!agg.perRegime[branch]) {
      agg.perRegime[branch] = { count: 0, confSum: 0, confs: [] };
    }
    const b = agg.perRegime[branch];
    b.count++;
    b.confSum += result.confidence;
    b.confs.push(result.confidence);
    agg.totalRows++;

    writtenForSymbol++;
  }

  return writtenForSymbol;
}

// ── Aggregation helpers ────────────────────────────────────────────────────
interface RegimeStats {
  count: number;
  confSum: number;
  confs: number[];
}
interface AggregatedStats {
  totalRows: number;
  perRegime: Record<string, RegimeStats>;
}

function quantile(sortedArr: number[], q: number): number {
  if (sortedArr.length === 0) return NaN;
  const pos = (sortedArr.length - 1) * q;
  const base = Math.floor(pos);
  const rest = pos - base;
  if (base + 1 < sortedArr.length) {
    return sortedArr[base] + rest * (sortedArr[base + 1] - sortedArr[base]);
  }
  return sortedArr[base];
}

function printSummary(agg: AggregatedStats): void {
  console.log('\n══════════════════════════════════════════════════════════');
  console.log('B.1a REPLAY SUMMARY — xStock regime classifier output');
  console.log('══════════════════════════════════════════════════════════');
  console.log(`Total bars classified: ${agg.totalRows.toLocaleString()}`);
  console.log('');
  console.log('Per-regime distribution + per-branch confidence quartiles:');
  console.log('Regime                        | n     | share  | conf p5  | p25    | p50    | p75    | p95    | mean');
  console.log('------------------------------|-------|--------|----------|--------|--------|--------|--------|------');
  for (const regime of Object.keys(agg.perRegime).sort()) {
    const s = agg.perRegime[regime];
    s.confs.sort((a, b) => a - b);
    const share = ((s.count / agg.totalRows) * 100).toFixed(1) + '%';
    const p5 = quantile(s.confs, 0.05).toFixed(4);
    const p25 = quantile(s.confs, 0.25).toFixed(4);
    const p50 = quantile(s.confs, 0.5).toFixed(4);
    const p75 = quantile(s.confs, 0.75).toFixed(4);
    const p95 = quantile(s.confs, 0.95).toFixed(4);
    const mean = (s.confSum / s.count).toFixed(4);
    console.log(
      `${regime.padEnd(30)} | ${String(s.count).padStart(5)} | ${share.padStart(6)} |  ${p5}  | ${p25} | ${p50} | ${p75} | ${p95} | ${mean}`,
    );
  }
  console.log('');
}

// ── Main ───────────────────────────────────────────────────────────────────
async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL env var required');
    process.exit(1);
  }

  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();

  console.log('[B1A] Connected. Building xstock_spot RegimeConfig from module_constants...');
  const regimeConfig = await buildXstockRegimeConfig(client);
  console.log(`[B1A] RegimeConfig: ${JSON.stringify(regimeConfig)}`);

  const symbols = await fetchAllSymbols(client);
  console.log(`[B1A] ${symbols.length} symbols in replay window ${REPLAY_START} → ${REPLAY_END}`);

  const out = createWriteStream(OUT_PATH);
  out.write('symbol,bucket_ts,regime,confidence,vol,mom,adx,dbs\n');

  const agg: AggregatedStats = { totalRows: 0, perRegime: {} };
  let processed = 0;
  let totalWritten = 0;
  for (const symbol of symbols) {
    try {
      const n = await replayOneSymbol(client, symbol, regimeConfig, out, agg);
      totalWritten += n;
    } catch (err) {
      console.warn(`[B1A][ERR] ${symbol}: ${err instanceof Error ? err.message : String(err)}`);
    }
    processed++;
    if (processed % 25 === 0) {
      console.log(`[B1A] ${processed}/${symbols.length} symbols processed, ${totalWritten.toLocaleString()} rows written`);
    }
  }

  out.end();
  await client.end();

  console.log(`\n[B1A] Replay complete. ${totalWritten.toLocaleString()} rows written to ${OUT_PATH}`);
  printSummary(agg);
}

main().catch((err) => {
  console.error('[B1A] Fatal:', err);
  process.exit(1);
});
