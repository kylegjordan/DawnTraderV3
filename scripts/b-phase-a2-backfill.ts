#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-PHASE-A2 — xStock DBS Backfill Script
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Phase A.2 sub-task E. Replays archived 60-min OHLC bars from
 * `xstock_spot_ohlc_1m` (aggregated to 60-min via xstockOhlcCache), computes
 * per-bar DBS components (slope / return / ema / final score) for every
 * xStock symbol in `XSTOCK_SPOT_REGISTRY`, and inserts into the new
 * `xstock_dbs_backfill` table for Phase A.3 verification + Phase B
 * calibration replay.
 *
 * Usage:
 *   npm run b-phase-a2:backfill -- --days 14 [--symbols AAPL/USD,MSFT/USD] [--dry-run]
 *
 * When run via SSH on staging (post-Step 6 deploy):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     npm run b-phase-a2:backfill -- --days 14'"
 *
 * Idempotent: ON CONFLICT (symbol, ts) DO NOTHING — re-running across cold-start
 * windows is safe.
 *
 * Reference: B_PHASE_A1_DBS_design_ask_rev2.md §4.4 (backfill schema).
 *            B_PHASE_A2_DBS_SCOPE.md D11/D12 (table + script deliverables).
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import { Pool } from 'pg';
import { computeDirectionalBias } from '../server/core/metrics/directional-bias.js';
import { XSTOCK_SPOT_REGISTRY } from '../shared/asset-classes.js';
import type { OHLCData } from '../server/types/market-regime.types.js';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.indexOf(`--${name}`) >= 0;
}

/** Local ATR helper — mirrors scanner.ts pattern. */
function computeATRFromOHLC(ohlcData: OHLCData[], period: number = 14): number {
  if (ohlcData.length < period + 1) return 0;
  const recent = ohlcData.slice(-(period + 1));
  let trSum = 0;
  for (let i = 1; i < recent.length; i++) {
    const high = recent[i].high;
    const low = recent[i].low;
    const prevClose = recent[i - 1].close;
    const tr = Math.max(high - low, Math.abs(high - prevClose), Math.abs(low - prevClose));
    trSum += tr;
  }
  return trSum / period;
}

/**
 * Aggregate 1-min bars from xstock_spot_ohlc_1m to 60-min bars for a single symbol.
 * Mirrors the xstockOhlcCache rollup logic but operates directly against the
 * archive table (no in-memory cache; this is a one-shot backfill script).
 */
async function fetchHistoricalOhlc60m(
  pool: Pool,
  symbol: string,
  daysBack: number,
): Promise<Array<{ ts: Date; bars: OHLCData[] }>> {
  // Pull 1-min bars + roll up to 60-min in SQL via date_trunc.
  const result = await pool.query<{
    bucket: Date;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>(`
    SELECT
      date_trunc('hour', interval_begin) AS bucket,
      (array_agg(open ORDER BY interval_begin ASC))[1] AS open,
      MAX(high) AS high,
      MIN(low) AS low,
      (array_agg(close ORDER BY interval_begin DESC))[1] AS close,
      SUM(volume) AS volume
    FROM xstock_spot_ohlc_1m
    WHERE symbol = $1
      AND interval_begin >= NOW() - ($2::text || ' days')::interval
    GROUP BY bucket
    ORDER BY bucket ASC
  `, [symbol, daysBack]);

  // For each 60-min bar at time t, the DBS uses lookback of 48 bars ending at t.
  // Return an array of (ts, bars_window) tuples — one per output row.
  const bars: OHLCData[] = result.rows.map(r => ({
    open: Number(r.open),
    high: Number(r.high),
    low: Number(r.low),
    close: Number(r.close),
    volume: Number(r.volume),
    timestamp: r.bucket.getTime(),
  } as any));

  // Need at least 48 bars for DBS lookback + 14 bars for ATR
  const minRequired = 48;
  const out: Array<{ ts: Date; bars: OHLCData[] }> = [];
  for (let i = minRequired - 1; i < bars.length; i++) {
    const window = bars.slice(Math.max(0, i - 47), i + 1);
    out.push({ ts: new Date((bars[i] as any).timestamp), bars: window });
  }
  return out;
}

async function backfillSymbol(
  pool: Pool,
  symbol: string,
  sector: string,
  daysBack: number,
  dryRun: boolean,
): Promise<{ inserted: number; skipped: number }> {
  const windows = await fetchHistoricalOhlc60m(pool, symbol, daysBack);
  let inserted = 0;
  let skipped = 0;
  for (const { ts, bars } of windows) {
    const atr = computeATRFromOHLC(bars, 14);
    if (atr <= 0) { skipped++; continue; }
    const result = computeDirectionalBias(bars, atr);
    if (!dryRun) {
      const insertResult = await pool.query(`
        INSERT INTO xstock_dbs_backfill
          (symbol, sector, ts, final_score, slope_component, return_component, ema_component, sentinel_zero, atr)
        VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
        ON CONFLICT (symbol, ts) DO NOTHING
      `, [
        symbol, sector, ts,
        result.score,
        result.components.slopeComponent,
        result.components.returnComponent,
        result.components.emaComponent,
        result.sentinelZero,
        atr,
      ]);
      inserted += insertResult.rowCount ?? 0;
    } else {
      inserted++;
    }
  }
  return { inserted, skipped };
}

async function main() {
  const args = process.argv.slice(2);
  const daysBack = Number(getFlag(args, 'days') ?? '14');
  const symbolsArg = getFlag(args, 'symbols');
  const dryRun = hasFlag(args, 'dry-run');

  const targetSymbols: Array<[string, string]> = symbolsArg
    ? symbolsArg.split(',').map(s => {
        const entry = XSTOCK_SPOT_REGISTRY.get(s);
        if (!entry) throw new Error(`Symbol ${s} not in XSTOCK_SPOT_REGISTRY`);
        return [s, entry.sector] as [string, string];
      })
    : Array.from(XSTOCK_SPOT_REGISTRY.entries()).map(([sym, entry]) => [sym, entry.sector] as [string, string]);

  console.log(`[B-PHASE-A2] Backfill starting: ${targetSymbols.length} symbols, ${daysBack} days back, dry-run=${dryRun}`);

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }
  const pool = new Pool({ connectionString: process.env.DATABASE_URL });

  let totalInserted = 0;
  let totalSkipped = 0;
  let symbolsProcessed = 0;
  let symbolErrors = 0;

  for (const [symbol, sector] of targetSymbols) {
    try {
      const { inserted, skipped } = await backfillSymbol(pool, symbol, sector, daysBack, dryRun);
      totalInserted += inserted;
      totalSkipped += skipped;
      symbolsProcessed++;
      if (symbolsProcessed % 25 === 0) {
        console.log(`[B-PHASE-A2] progress: ${symbolsProcessed}/${targetSymbols.length} processed, ${totalInserted} rows inserted, ${totalSkipped} skipped`);
      }
    } catch (err) {
      symbolErrors++;
      console.warn(`[B-PHASE-A2] ${symbol} backfill error: ${err instanceof Error ? err.message : err}`);
    }
  }

  await pool.end();

  console.log(`[B-PHASE-A2] Backfill complete:`);
  console.log(`  Symbols processed: ${symbolsProcessed}/${targetSymbols.length} (${symbolErrors} errors)`);
  console.log(`  Rows inserted:     ${totalInserted}`);
  console.log(`  Rows skipped:      ${totalSkipped} (ATR<=0)`);
  console.log(`  Mode:              ${dryRun ? 'DRY-RUN (no INSERTs)' : 'LIVE'}`);

  if (symbolErrors > 0) {
    process.exit(1);
  }
}

main().catch(err => {
  console.error('[B-PHASE-A2] backfill fatal:', err);
  process.exit(1);
});
