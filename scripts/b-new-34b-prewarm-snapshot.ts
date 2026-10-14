#!/usr/bin/env tsx
/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B-NEW-34b — xStock OHLC snapshot pre-warm (60-min + 15-min)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * One-off (re-runnable) job that aggregates certified xStock revision winners
 * per symbol with a wide lookback window (default 14 days) and UPSERTs the
 * most-recent N exact aggregate revisions into both snapshot tables:
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
 * Why per-symbol: a 14-day exact-revision read across the full universe would
 * hold one large transaction and result set. Serial per-symbol reads bound the
 * work and failure scope while preserving the existing no-deadline prewarm.
 *
 * Idempotent: the aggregate and snapshot paths are content-addressed. A dry
 * run executes the same winner/certificate read in a read-only transaction and
 * does not create aggregate identities or update snapshots.
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
import { XSTOCK_SPOT_REGISTRY } from '../shared/asset-classes.js';

function getFlag(args: string[], name: string): string | undefined {
  const i = args.indexOf(`--${name}`);
  return i >= 0 && i + 1 < args.length ? args[i + 1] : undefined;
}

function hasFlag(args: string[], name: string): boolean {
  return args.indexOf(`--${name}`) >= 0;
}

// Per-symbol read/write cap — matches MAX_BARS_60M in ohlc-aggregator.ts.
// This does not delete historical snapshot rows; #1194 owns retention.
const MAX_BARS_60M = 60;

// B.4 foundation (2026-06-04): 15-minute snapshot cap — matches MAX_BARS_15M in
// ohlc-aggregator.ts (the 15m cache read cap). Sized to the DEEPEST 15m consumer
// = DBS lookback 192 bars + margin. This caps each prewarm selection, not the
// table's retained history; #1194 owns deletion. 240 × 15min = 60h per symbol.
const MAX_BARS_15M = 240;

/**
 * B.4 foundation (2026-06-04): the prewarm now warms BOTH snapshot substrates
 * so the Sunday-reopen / shutdown hooks fully populate whichever table the live
 * read path consumes. Pre-switch the scanner reads 60m (warming 15m is inert);
 * post-switch the scanner reads 15m (warming 15m is essential — without it the
 * 15m snapshot is cold at reopen and the deepest 15m consumer, DBS at 192 bars
 * = 48h, would start degraded). The 60m warm is retained (the 60m snapshot is
 * kept as the archive/parity substrate). xStock-scoped; crypto unaffected.
 */
interface SnapshotInterval {
  label: string;
  intervalMinutes: 15 | 60;
  maxBars: number;
}
const SNAPSHOT_INTERVALS: SnapshotInterval[] = [
  { label: '60m', intervalMinutes: 60, maxBars: MAX_BARS_60M },
  { label: '15m', intervalMinutes: 15, maxBars: MAX_BARS_15M },
];

/**
 * B-NEW-36 (2026-05-20): named export so the off-hours session-lifecycle
 * controller can invoke pre-warm in-process from its scheduled hooks.
 *
 * @param options.lookbackDays   How far back to scan source partitions (default 14).
 * @param options.symbols        Restrict to these symbols; defaults to full registry.
 * @param options.dryRun         Aggregate but skip the UPSERT writes.
 * @param options.connectionString Optional assertion of the application DATABASE_URL.
 *
 * Returns a result summary. Construction/configuration failures throw.
 * Per-symbol errors are caught and counted in `symbolErrors`; the function
 * completes the batch so the lifecycle controller can handle partial failure.
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
  ineligibleBuckets: number;
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
  if (options.connectionString && process.env.DATABASE_URL
      && options.connectionString !== process.env.DATABASE_URL) {
    throw new Error(
      '[B-XSTOCK-BAR-AVAILABILITY] runPrewarm connectionString must match the application database',
    );
  }
  if (!process.env.DATABASE_URL) process.env.DATABASE_URL = connectionString;

  console.log(
    `[B-NEW-34b] Pre-warm starting: ${targetSymbols.length} symbols, ` +
    `${lookbackDays} days lookback, dry-run=${dryRun}`,
  );
  const startMs = Date.now();

  // Dynamic imports keep dotenv initialization ahead of server/db.ts for the
  // standalone CLI while reusing the already-initialized pool in lifecycle.
  const [{ previewAvailableXstockOHLC }, { xstockOhlcCache }] = await Promise.all([
    import('../server/asset_classes/xstock_spot/availability-aggregator.js'),
    import('../server/services/xstock-ohlc-cache.js'),
  ]);

  let totalBuckets = 0;
  let totalUpserts = 0;
  let symbolsWithData = 0;
  let symbolsEmpty = 0;
  let symbolErrors = 0;
  let ineligibleBuckets = 0;

  // B.4 foundation (2026-06-04): per-interval upsert tally for the summary log.
  const upsertsByInterval: Record<string, number> = {};
  for (const iv of SNAPSHOT_INTERVALS) upsertsByInterval[iv.label] = 0;

  for (let i = 0; i < targetSymbols.length; i++) {
    const symbol = targetSymbols[i];
    // Warm EVERY snapshot substrate for this symbol while its 1m partition is
    // hot. Per-interval try/catch so a 15m failure never blocks the 60m warm
    // (or vice-versa). A symbol counts as "with data" if ANY interval yields
    // buckets; "empty" only when no interval does.
    let symbolHadData = false;
    for (const iv of SNAPSHOT_INTERVALS) {
      try {
        const lookbackHours = lookbackDays * 24;
        if (dryRun) {
          const preview = await previewAvailableXstockOHLC(
            [symbol],
            iv.intervalMinutes,
            lookbackHours,
          );
          const bars = (preview.get(symbol) ?? []).slice(-iv.maxBars);
          if (bars.length === 0) continue;
          const eligible = bars.filter((bar) => bar.eligibilityState === 'eligible_certified').length;
          symbolHadData = true;
          totalBuckets += bars.length;
          totalUpserts += eligible;
          ineligibleBuckets += bars.length - eligible;
          upsertsByInterval[iv.label] += eligible;
          continue;
        }
        const prewarm = await xstockOhlcCache.prewarmAvailabilitySnapshot(
          symbol,
          iv.intervalMinutes,
          lookbackHours,
        );
        if (prewarm.bucketsRead === 0) continue;
        symbolHadData = true;
        totalBuckets += prewarm.bucketsRead;
        totalUpserts += prewarm.snapshotRowsWritten;
        ineligibleBuckets += prewarm.ineligibleBuckets;
        upsertsByInterval[iv.label] += prewarm.snapshotRowsWritten;
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
        `${totalBuckets} buckets, ${totalUpserts} eligible/written (${elapsedSec}s elapsed)`,
      );
    }
  }

  const totalSeconds = (Date.now() - startMs) / 1000;
  console.log(`[B-NEW-34b] Pre-warm complete in ${totalSeconds.toFixed(1)}s:`);
  console.log(`  Symbols processed:      ${targetSymbols.length} total (${symbolErrors} errors)`);
  console.log(`  Symbols with data:      ${symbolsWithData}`);
  console.log(`  Symbols empty:          ${symbolsEmpty} (no 1-min source bars in window)`);
  console.log(`  Buckets aggregated:     ${totalBuckets}`);
  console.log(`  Buckets ineligible:     ${ineligibleBuckets}`);
  console.log(`  ${dryRun ? 'Rows eligible' : 'Rows upserted'}:          ${totalUpserts}`);
  console.log(
    `  ${dryRun ? 'Rows eligible' : 'Rows upserted'}/interval: ` +
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
    ineligibleBuckets,
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
  // B.4 (2026-06-04): the xStock universe is DB-dynamic (B79.0n.UNIVERSE-DISCOVERY,
  // 2026-05-21) — XSTOCK_SPOT_REGISTRY is populated by xstockUniverseService at app
  // boot, which a STANDALONE CLI run does NOT trigger (it returned an empty set).
  // The in-process runPrewarm caller (lifecycle controller) already has it loaded;
  // load it here so the CLI path resolves the symbol set too.
  const { xstockUniverseService } = await import('../server/asset_classes/xstock_spot/universe-service.js');
  await xstockUniverseService.initializeFromDB();
  console.log(`[B-NEW-34b] xStock universe loaded: ${XSTOCK_SPOT_REGISTRY.size} symbols`);

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
    process.exit(0);
  } catch (err) {
    console.error('[B-NEW-34b] fatal:', err instanceof Error ? err.message : err);
    process.exit(1);
  }
}

if (isDirectInvocation) {
  main();
}
