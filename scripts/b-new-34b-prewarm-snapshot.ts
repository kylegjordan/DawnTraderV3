#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-34b — xStock OHLC snapshot pre-warm (60-min + 15-min)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * One-off (re-runnable) job that aggregates OHLC buckets from
 * xstock_spot_ohlc_1m per symbol with a wide lookback window (default 14
 * days) and UPSERTs the most-recent N buckets per symbol into the snapshot
 * tables. As of B.4 foundation (2026-06-04) it warms BOTH substrates per run:
 *   • 60-min: most-recent 60 buckets  → xstock_spot_ohlc_60m_snapshot
 *   • 15-min: most-recent 240 buckets → xstock_spot_ohlc_15m_snapshot
 * (see SNAPSHOT_INTERVALS). Pre-switch the scanner reads 60m, so warming 15m is
 * inert; post-switch the scanner reads 15m, so warming 15m is essential —
 * without it the 15m snapshot is cold at Sunday reopen and the deepest 15m
 * consumer (DBS, 192 bars = 48h) starts degraded. The 60m warm is retained as
 * the archive/parity substrate. xStock-scoped; crypto untouched.
 *
 * B-NEW-36 (2026-05-20): refactored to expose `runPrewarm(options)` as a
 * named export so the off-hours session-lifecycle controller can invoke
 * the pre-warm logic in-process from its Fri-8PM-ET / Sun-8PM-ET timer
 * hooks (per scope §2 Q6 + pre-audit §3.8). CLI wrapper preserved at the
 * bottom so `npm run b-new-34b:prewarm` still works.
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
 * In-process (B-NEW-36 lifecycle controller):
 *   import { runPrewarm } from '../../scripts/b-new-34b-prewarm-snapshot.js';
 *   const result = await runPrewarm({ lookbackDays: 14 });
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

// Bucket cap per symbol — matches MAX_BARS_60M in ohlc-aggregator.ts.
// Keeps the 60-min snapshot table bounded to ~265 × 60 = 15,900 rows max.
const MAX_BARS_60M = 60;

// B.4 foundation (2026-06-04): 15-minute snapshot cap — matches MAX_BARS_15M in
// ohlc-aggregator.ts (the 15m cache read cap). Sized to the DEEPEST 15m consumer
// = DBS lookback 192 bars + margin. Keeps the 15-min snapshot bounded to
// ~265 × 240 = 63,600 rows max. 240 × 15min = 60h of history per symbol.
const MAX_BARS_15M = 240;

/**
 * B.4 foundation (2026-06-04): the prewarm now warms BOTH snapshot substrates
 * so the Sunday-reopen / shutdown hooks fully populate whichever table the live
 * read path consumes. Pre-switch the scanner reads 60m (warming 15m is inert);
 * post-switch the scanner reads 15m (warming 15m is essential — without it the
 * 15m snapshot is cold at reopen and the deepest 15m consumer, DBS at 192 bars
 * = 48h, would start degraded). The 60m warm is retained (the 60m snapshot is
 * kept as the archive/parity substrate). xStock-scoped; crypto unaffected.
 * `table` values are internal constants (NOT user input) — safe to interpolate.
 */
interface SnapshotInterval {
  label: string;
  bucketSeconds: number;
  maxBars: number;
  table: string;
}
const SNAPSHOT_INTERVALS: SnapshotInterval[] = [
  { label: '60m', bucketSeconds: 3600, maxBars: MAX_BARS_60M, table: 'xstock_spot_ohlc_60m_snapshot' },
  { label: '15m', bucketSeconds: 900, maxBars: MAX_BARS_15M, table: 'xstock_spot_ohlc_15m_snapshot' },
];

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
 * Aggregate a single symbol's buckets at the given interval (bucketSeconds)
 * using the same DISTINCT ON dedup + epoch-floor bucketing as the live
 * aggregator's hot path. Returns the most-recent `maxBars` buckets, ASC by
 * bucket_ts. Called once per SNAPSHOT_INTERVALS entry (60m then 15m).
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
  bucketSeconds: number,
  maxBars: number,
): Promise<BucketRow[]> {
  // bucketSeconds (3600 for 60m, 900 for 15m) is an internal numeric constant
  // from SNAPSHOT_INTERVALS — NOT user input — interpolated as a literal so the
  // epoch-floor divisor matches the aggregator hot path for the chosen interval.
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
        to_timestamp(floor(extract(epoch from interval_begin) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket_ts,
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
    [symbol, lookbackDays, maxBars],
  );
  // Reverse to ASC order for downstream consistency with the aggregator's contract.
  return result.rows.reverse();
}

async function upsertSnapshot(
  pool: pg.Pool,
  symbol: string,
  rows: BucketRow[],
  tableName: string,
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
    INSERT INTO ${tableName}
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

/**
 * B-NEW-36 (2026-05-20): named export so the off-hours session-lifecycle
 * controller can invoke pre-warm in-process from its scheduled hooks.
 *
 * @param options.lookbackDays   How far back to scan source partitions (default 14).
 * @param options.symbols        Restrict to these symbols; defaults to full registry.
 * @param options.dryRun         Aggregate but skip the UPSERT writes.
 * @param options.connectionString Override DATABASE_URL (mostly for tests).
 *
 * Returns a result summary. Throws ONLY on construction-time misconfiguration
 * (invalid lookbackDays, empty symbol set, missing DATABASE_URL). Per-symbol
 * errors are caught and counted in `symbolErrors`; the function completes the
 * batch regardless so the controller's circuit-breaker (scope §2 Q6) can decide
 * whether to surface a partial failure.
 */
export interface RunPrewarmOptions {
  lookbackDays?: number;
  symbols?: string[];
  dryRun?: boolean;
  connectionString?: string;
}

export interface RunPrewarmResult {
  totalSeconds: number;
  symbolsProcessed: number;
  symbolsWithData: number;
  symbolsEmpty: number;
  symbolErrors: number;
  totalBuckets: number;
  totalUpserts: number;
  /** B.4 foundation: rows upserted per snapshot interval label ('60m','15m'). */
  upsertsByInterval?: Record<string, number>;
  dryRun: boolean;
}

export async function runPrewarm(options: RunPrewarmOptions = {}): Promise<RunPrewarmResult> {
  const lookbackDays = options.lookbackDays ?? 14;
  const dryRun = options.dryRun ?? false;
  const connectionString = options.connectionString ?? process.env.DATABASE_URL;

  if (!Number.isFinite(lookbackDays) || lookbackDays <= 0) {
    throw new Error(`[B-NEW-34b] runPrewarm: invalid lookbackDays=${lookbackDays}`);
  }

  const targetSymbols = options.symbols && options.symbols.length > 0
    ? options.symbols
    : Array.from(XSTOCK_SPOT_REGISTRY.keys());

  if (targetSymbols.length === 0) {
    throw new Error('[B-NEW-34b] runPrewarm: empty target symbol set');
  }

  if (!connectionString) {
    throw new Error('[B-NEW-34b] runPrewarm: DATABASE_URL not set');
  }

  console.log(
    `[B-NEW-34b] Pre-warm starting: ${targetSymbols.length} symbols, ` +
    `${lookbackDays} days lookback, dry-run=${dryRun}`,
  );
  const startMs = Date.now();

  // Fresh pool per invocation. Scope §2 Q6: this runs at most twice/week
  // from the lifecycle controller + ad-hoc CLI; no need to share a pool.
  const pool = new Pool({
    connectionString,
    // Single-connection serial loop — no concurrent symbols to avoid pressure
    // on the source table while it's being written by the B74 archiver.
    max: 1,
    // Per-symbol query timeout: 180s. Empirically observed (2026-05-18 night)
    // that a particular symbol's DISTINCT ON aggregation can hang indefinitely
    // without this cap.
    query_timeout: 180_000,
    // Connection-level safety: if the socket goes silent, fail rather than
    // wait forever. Matches the resilience posture from server/db.ts B-NEW-40.
    keepAlive: true,
    keepAliveInitialDelayMillis: 10_000,
  });

  let totalBuckets = 0;
  let totalUpserts = 0;
  let symbolsWithData = 0;
  let symbolsEmpty = 0;
  let symbolErrors = 0;

  // B.4 foundation (2026-06-04): per-interval upsert tally for the summary log.
  const upsertsByInterval: Record<string, number> = {};
  for (const iv of SNAPSHOT_INTERVALS) upsertsByInterval[iv.label] = 0;

  try {
    for (let i = 0; i < targetSymbols.length; i++) {
      const symbol = targetSymbols[i];
      // Warm EVERY snapshot substrate for this symbol while its 1m partition is
      // hot. Per-interval try/catch so a 15m failure never blocks the 60m warm
      // (or vice-versa). A symbol counts as "with data" if ANY interval yields
      // buckets; "empty" only when no interval does.
      let symbolHadData = false;
      for (const iv of SNAPSHOT_INTERVALS) {
        try {
          const rows = await aggregateOneSymbol(pool, symbol, lookbackDays, iv.bucketSeconds, iv.maxBars);
          if (rows.length === 0) continue;
          symbolHadData = true;
          totalBuckets += rows.length;
          if (!dryRun) {
            const upserted = await upsertSnapshot(pool, symbol, rows, iv.table);
            totalUpserts += upserted;
            upsertsByInterval[iv.label] += upserted;
          } else {
            totalUpserts += rows.length;
            upsertsByInterval[iv.label] += rows.length;
          }
        } catch (err) {
          symbolErrors++;
          console.warn(
            `[B-NEW-34b] ${symbol} ${iv.label} pre-warm error: ${err instanceof Error ? err.message : err}`,
          );
        }
      }
      if (symbolHadData) symbolsWithData++; else symbolsEmpty++;
      if ((i + 1) % 25 === 0) {
        const elapsedSec = ((Date.now() - startMs) / 1000).toFixed(1);
        console.log(
          `[B-NEW-34b] progress: ${i + 1}/${targetSymbols.length} processed, ` +
          `${totalBuckets} buckets, ${totalUpserts} upserted (${elapsedSec}s elapsed)`,
        );
      }
    }
  } finally {
    await pool.end();
  }

  const totalSeconds = (Date.now() - startMs) / 1000;
  console.log(`[B-NEW-34b] Pre-warm complete in ${totalSeconds.toFixed(1)}s:`);
  console.log(`  Symbols processed:      ${targetSymbols.length} total (${symbolErrors} errors)`);
  console.log(`  Symbols with data:      ${symbolsWithData}`);
  console.log(`  Symbols empty:          ${symbolsEmpty} (no 1-min source bars in window)`);
  console.log(`  Buckets aggregated:     ${totalBuckets}`);
  console.log(`  Rows upserted:          ${totalUpserts}`);
  console.log(
    `  Rows upserted/interval: ` +
    SNAPSHOT_INTERVALS.map((iv) => `${iv.label}=${upsertsByInterval[iv.label]}`).join(' '),
  );
  console.log(`  Mode:                   ${dryRun ? 'DRY-RUN (no INSERTs)' : 'LIVE'}`);

  return {
    totalSeconds,
    symbolsProcessed: targetSymbols.length,
    symbolsWithData,
    symbolsEmpty,
    symbolErrors,
    totalBuckets,
    totalUpserts,
    upsertsByInterval,
    dryRun,
  };
}

// ── CLI wrapper ───────────────────────────────────────────────────────────────
// Preserved so `npm run b-new-34b:prewarm` continues to work.
// Detection: only call main() when this file is invoked as the entrypoint,
// not when it's imported as a module (the lifecycle controller imports it).
const isDirectInvocation =
  typeof process !== 'undefined' &&
  process.argv[1] &&
  import.meta.url === `file://${process.argv[1].replace(/\\/g, '/')}`;

async function main() {
  const args = process.argv.slice(2);
  const lookbackDaysArg = getFlag(args, 'days');
  const lookbackDays = Number(lookbackDaysArg ?? '14');
  const symbolsArg = getFlag(args, 'symbols');
  const dryRun = hasFlag(args, 'dry-run');

  const symbols = symbolsArg
    ? symbolsArg.split(',').map((s) => s.trim()).filter(Boolean)
    : undefined;

  try {
    const result = await runPrewarm({ lookbackDays, symbols, dryRun });
    if (result.symbolErrors > 0) {
      process.exit(2);
    }
  } catch (err) {
    console.error('[B-NEW-34b] fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (isDirectInvocation) {
  main();
}
