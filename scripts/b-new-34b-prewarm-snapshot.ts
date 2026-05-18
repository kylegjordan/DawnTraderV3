#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-34b — xStock 60-min OHLC snapshot pre-warm
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * One-off (re-runnable) job that aggregates 60-min OHLC buckets from
 * xstock_spot_ohlc_1m per symbol with a wide lookback window (default 14
 * days) and UPSERTs the most-recent 60 buckets per symbol into the new
 * xstock_spot_ohlc_60m_snapshot table.
 *
 * Why per-symbol single-SQL: the live aggregator runs ONE SQL across all
 * 75 rotation-batch symbols using DISTINCT ON over a 60-120h window. At
 * widening windows that became too slow against B74's 18-56× duplicate
 * source rows (B-NEW-34a hotfix iterations all timed out at the scanner's
 * 25s budget). Here we are NOT bound by a per-cycle deadline — running 265
 * separate queries (one per symbol) means each individual query scans a
 * single symbol's partition (much smaller plan, often index-only).
 * Estimated per-symbol latency: 1-3 seconds at a 14-day window. Total
 * runtime: 5-15 minutes for the full 265-symbol universe.
 *
 * Idempotent: ON CONFLICT (symbol, bucket_ts) DO UPDATE SET ...
 *   Re-running over the same window is safe. The cache write-back path uses
 *   the same UPSERT shape — this script and that path are compatible.
 *
 * Usage:
 *   npm run b-new-34b:prewarm
 *   npm run b-new-34b:prewarm -- --days 14
 *   npm run b-new-34b:prewarm -- --days 14 --symbols AAPL/USD,MSFT/USD
 *   npm run b-new-34b:prewarm -- --days 14 --dry-run
 *
 * SSH on staging (post-deploy):
 *   ssh root@188.245.193.8 "su - deploy -c 'cd /home/deploy/dawntrader && \
 *     npm run b-new-34b:prewarm -- --days 14'"
 *
 * Reference: RUNNING_ISSUES #118 (B-NEW-34a abandonment + B-NEW-34b pivot);
 *            MULTI_ASSET_VTS_EXPANSION_PLAN.md row 2026-05-18 evening;
 *            drizzle/migrations/2026-05-18-b-new-34b-xstock-60m-snapshot.sql
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
// ESM default import for CommonJS pg module — same pattern as scripts/b-phase-a2-backfill.ts:32-33.
import pg from 'pg';
const { Pool } = pg;
import { XSTOCK_SPOT_REGISTRY } from '../shared/asset-classes.js';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.indexOf(`--${name}`) >= 0;
}

// Bucket cap per symbol — matches MAX_BARS_60M in ohlc-aggregator.ts:83.
// Keeps the snapshot table bounded to ~265 × 60 = 15,900 rows max.
const MAX_BARS_60M = 60;

interface BucketRow {
  bucket_ts: Date;
  bar_open: string;
  bar_high: string;
  bar_low: string;
  bar_close: string;
  bar_volume: string;
  source_bar_count: string;
}

/**
 * Aggregate a single symbol's 60-min buckets using the same DISTINCT ON
 * dedup + epoch-floor bucketing as the live aggregator's hot path. Returns
 * the most-recent MAX_BARS_60M buckets, ASC by bucket_ts.
 *
 * Per-symbol single-SQL avoids the scanner-budget timeout because postgres
 * can use the (symbol, interval_begin) PK index for the partition scan +
 * the DISTINCT ON dedup runs over a fraction of the rows it would see for
 * a 75-symbol batched query. Trade-off: 265 round-trips instead of one,
 * but no deadline — this script runs offline.
 */
async function aggregateOneSymbol(
  pool: pg.Pool,
  symbol: string,
  lookbackDays: number,
): Promise<BucketRow[]> {
  const result = await pool.query<BucketRow>(
    `
    WITH deduped AS (
      SELECT DISTINCT ON (symbol, interval_begin)
        symbol, interval_begin, open, high, low, close, volume
      FROM xstock_spot_ohlc_1m
      WHERE symbol = $1
        AND interval_begin > NOW() - ($2::int * INTERVAL '1 day')
      ORDER BY symbol, interval_begin, captured_at DESC, id DESC
    ),
    bucketed AS (
      SELECT
        symbol,
        to_timestamp(floor(extract(epoch from interval_begin) / 3600) * 3600) AS bucket_ts,
        interval_begin,
        open, high, low, close, volume
      FROM deduped
    ),
    aggregated AS (
      SELECT
        symbol,
        bucket_ts,
        (array_agg(open ORDER BY interval_begin ASC))[1] AS bar_open,
        MAX(high) AS bar_high,
        MIN(low)  AS bar_low,
        (array_agg(close ORDER BY interval_begin DESC))[1] AS bar_close,
        SUM(volume) AS bar_volume,
        COUNT(*) AS source_bar_count
      FROM bucketed
      GROUP BY symbol, bucket_ts
    )
    SELECT bucket_ts, bar_open, bar_high, bar_low, bar_close, bar_volume, source_bar_count
    FROM aggregated
    ORDER BY bucket_ts DESC
    LIMIT $3
    `,
    [symbol, lookbackDays, MAX_BARS_60M],
  );
  // Reverse to ASC order for downstream consistency with the aggregator's contract.
  return result.rows.reverse();
}

async function upsertSnapshot(
  pool: pg.Pool,
  symbol: string,
  rows: BucketRow[],
): Promise<number> {
  if (rows.length === 0) return 0;

  // Single multi-row INSERT — much cheaper than 60 round-trips per symbol.
  // Build the parameterized VALUES tuple list: ($1, $2, ...), ($N+1, ...).
  const values: any[] = [];
  const placeholders: string[] = [];
  let p = 1;
  for (const r of rows) {
    placeholders.push(
      `($${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++}, $${p++})`,
    );
    values.push(
      symbol,
      r.bucket_ts,
      Number(r.bar_open),
      Number(r.bar_high),
      Number(r.bar_low),
      Number(r.bar_close),
      Number(r.bar_volume),
      Number(r.source_bar_count),
    );
  }
  const result = await pool.query(
    `
    INSERT INTO xstock_spot_ohlc_60m_snapshot
      (symbol, bucket_ts, open, high, low, close, volume, source_bar_count)
    VALUES ${placeholders.join(',')}
    ON CONFLICT (symbol, bucket_ts) DO UPDATE SET
      open             = EXCLUDED.open,
      high             = EXCLUDED.high,
      low              = EXCLUDED.low,
      close            = EXCLUDED.close,
      volume           = EXCLUDED.volume,
      source_bar_count = EXCLUDED.source_bar_count,
      captured_at      = NOW()
    `,
    values,
  );
  return result.rowCount ?? 0;
}

async function main() {
  const args = process.argv.slice(2);
  const lookbackDays = Number(getFlag(args, 'days') ?? '14');
  const symbolsArg = getFlag(args, 'symbols');
  const dryRun = hasFlag(args, 'dry-run');

  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
    console.error(`Invalid --days value: ${lookbackDays}`);
    process.exit(1);
  }

  const targetSymbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim()).filter(Boolean)
    : Array.from(XSTOCK_SPOT_REGISTRY.keys());

  // Sanity check — bail if registry empty (likely import path issue).
  if (targetSymbols.length === 0) {
    console.error('[B-NEW-34b] No target symbols. Registry empty or --symbols arg malformed.');
    process.exit(1);
  }

  if (!process.env.DATABASE_URL) {
    console.error('DATABASE_URL not set');
    process.exit(1);
  }

  console.log(`[B-NEW-34b] Pre-warm starting: ${targetSymbols.length} symbols, ${lookbackDays} days lookback, dry-run=${dryRun}`);
  const startMs = Date.now();

  const pool = new Pool({
    connectionString: process.env.DATABASE_URL,
    // Single-connection serial loop — no concurrent symbols to avoid pressure
    // on the source table while it's being written by the B74 archiver.
    max: 1,
  });

  let totalBuckets = 0;
  let totalUpserts = 0;
  let symbolsWithData = 0;
  let symbolsEmpty = 0;
  let symbolErrors = 0;

  for (let i = 0; i < targetSymbols.length; i++) {
    const symbol = targetSymbols[i];
    try {
      const rows = await aggregateOneSymbol(pool, symbol, lookbackDays);
      if (rows.length === 0) {
        symbolsEmpty++;
        if ((i + 1) % 25 === 0) {
          console.log(`[B-NEW-34b] progress: ${i + 1}/${targetSymbols.length} processed, ${totalBuckets} buckets, ${totalUpserts} upserted, ${symbolsEmpty} empty`);
        }
        continue;
      }
      symbolsWithData++;
      totalBuckets += rows.length;
      if (!dryRun) {
        const upserted = await upsertSnapshot(pool, symbol, rows);
        totalUpserts += upserted;
      } else {
        totalUpserts += rows.length;
      }
      if ((i + 1) % 25 === 0) {
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(`[B-NEW-34b] progress: ${i + 1}/${targetSymbols.length} processed, ${totalBuckets} buckets, ${totalUpserts} upserted (${elapsedSec}s elapsed)`);
      }
    } catch (err) {
      symbolErrors++;
      console.warn(`[B-NEW-34b] ${symbol} pre-warm error: ${err instanceof Error ? err.message : err}`);
    }
  }

  await pool.end();

  const totalSec = ((Date.now() - startMs) / 1000).toFixed(1);
  console.log(`[B-NEW-34b] Pre-warm complete in ${totalSec}s:`);
  console.log(`  Symbols processed:      ${targetSymbols.length} total (${symbolErrors} errors)`);
  console.log(`  Symbols with data:      ${symbolsWithData}`);
  console.log(`  Symbols empty:          ${symbolsEmpty} (no 1-min source bars in window)`);
  console.log(`  Buckets aggregated:     ${totalBuckets}`);
  console.log(`  Rows upserted:          ${totalUpserts}`);
  console.log(`  Mode:                   ${dryRun ? 'DRY-RUN (no INSERTs)' : 'LIVE'}`);

  if (symbolErrors > 0) {
    process.exit(2);
  }
}

main().catch((err) => {
  console.error('[B-NEW-34b] fatal:', err);
  process.exit(1);
});
