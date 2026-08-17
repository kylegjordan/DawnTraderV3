/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Passive Archive Bootstrap
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Spawns the 3 archiver services (equity_spot, equity_perp, crypto_spot) at
 * app startup. Each is fire-and-forget — failure of any individual archiver
 * is logged but does NOT throw to the main app.
 *
 * Per Langston cc-inbox #869 Q5: this bootstrap is invoked LAST in the
 * server/index.ts startup sequence — passive archive is non-critical, so a
 * passive-archive failure must not prevent VTS / signal-orchestrator / FX5
 * from starting.
 *
 * Module-constants kill-switches (per scope §1 Objective 7):
 *   - b74_equity_capture_enabled
 *   - b74_perp_capture_enabled
 *   - b74_crypto_capture_enabled
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { startBatchWriter } from '../services/passive-archive/ohlc-batch-writer.js';
import { startTickerWriter, setTickerThrottle, setTickerThrottleForClass } from '../services/passive-archive/ticker-batch-writer.js';
import { startEquitySpotArchiver } from '../services/passive-archive/equity-spot-archiver.js';
import { startEquityPerpArchiver } from '../services/passive-archive/equity-perp-archiver.js';
import { startCryptoSpotArchiver } from '../services/passive-archive/crypto-spot-archiver.js';
import { startCryptoPerpArchiver } from '../services/passive-archive/crypto-perp-archiver.js';
import { getConstant } from '../services/module-constants-service.js';
import { cutoverForTable } from '../services/data-archive/daily-partition-cutover.js';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';

// P19-B-PERPFEED OBJ-2-ii (renamed from SIX_TABLES — a constant named "six"
// holding eight entries is the next reader's trap): the archive tables whose
// partition coverage this bootstrap self-heals + gauges. The crypto_perp pair
// joins born daily-partitioned (see DAILY_PARTITION_CUTOVERS).
const ARCHIVE_TABLES = [
  'xstock_spot_ohlc_1m',
  'xstock_perp_ohlc_1m',
  'crypto_spot_ohlc_1m',
  'crypto_perp_ohlc_1m',
  'xstock_spot_ticker_snap',
  'xstock_perp_ticker_snap',
  'crypto_spot_ticker_snap',
  'crypto_perp_ticker_snap',
];

/**
 * B74.x — Startup partition-headroom check (Langston cc-inbox #870 Q2).
 *
 * Queries pg_catalog for the latest partition's end date on each of the 6
 * archive tables. If any table's farthest-forward partition ends less than 2
 * months from now, emit a loud WARN log so the operator notices before
 * inserts start hitting the "no partition of relation found for row" error.
 *
 * This catches the case where the monthly partition-creation cron silently
 * failed. Bootstrap doesn't fix the gap (that's the cron's job, run on the
 * 28th); just surfaces it.
 */
async function checkPartitionHeadroom(): Promise<void> {
  const now = new Date();
  const twoMonthsFromNow = new Date(now);
  twoMonthsFromNow.setMonth(twoMonthsFromNow.getMonth() + 2);

  // Current-month partition bounds — needed inline so we can self-heal if missing.
  const curMonthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const curMonthEnd = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 1));
  const curMonthSuffix = `${curMonthStart.getUTCFullYear()}_${String(curMonthStart.getUTCMonth() + 1).padStart(2, '0')}`;
  const curStartIso = curMonthStart.toISOString().slice(0, 10);
  const curEndIso = curMonthEnd.toISOString().slice(0, 10);

  for (const tableName of ARCHIVE_TABLES) {
    try {
      // P19-B-PERPFEED OBJ-2-ii (BLOCKER-2): this gauge must know which tables the
      // DAILY creator owns. Before this fix the Step-1 self-heal unconditionally
      // created a MONTHLY partition — for a daily-partitioned table that CREATE
      // overlaps the daily children's ranges and throws (a name probe / IF NOT
      // EXISTS is not a range guard: the monthly NAME is genuinely absent), the
      // per-table catch swallowed it, and Step 2 NEVER RAN for that table — the
      // gauge was silently dead for xstock_spot_ticker_snap every boot since
      // 2026-08-01. And even without the throw, daily names sort above monthly
      // in ORDER BY relname DESC, so the old fixed 2-month threshold read a
      // permanent false WARN against the daily creator's designed 14-day lookahead.
      const cutover = cutoverForTable(tableName);
      const curMonthIsDaily = cutover !== null && curMonthStart >= cutover;

      // Step 1: Self-heal TODAY'S coverage if missing. Monthly-era tables get the
      // current-month partition (the B74 v1 off-by-one: migration pre-created
      // 2026-05 → 2027-04 but deployed 04-30, so all inserts failed until UTC
      // midnight). Daily-owned tables get TODAY'S daily child (same convention
      // as b74-create-daily-partitions.ts — bare-date bounds, IF NOT EXISTS).
      if (curMonthIsDaily) {
        const d = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));
        const next = new Date(d); next.setUTCDate(next.getUTCDate() + 1);
        const dayIso = d.toISOString().slice(0, 10);
        const nextIso = next.toISOString().slice(0, 10);
        const dayName = `${tableName}_${dayIso.replace(/-/g, '_')}`;
        const exists = await db.execute(sql`
          SELECT 1 FROM pg_class WHERE relname = ${dayName} LIMIT 1
        `);
        const existsResult = (Array.isArray(exists) ? exists : (exists as any).rows ?? []);
        if (existsResult.length === 0) {
          await db.execute(sql.raw(
            `CREATE TABLE IF NOT EXISTS ${dayName} PARTITION OF ${tableName} FOR VALUES FROM ('${dayIso}') TO ('${nextIso}')`
          ));
          console.warn(`[B74][partitions][SELF-HEAL] created missing CURRENT-DAY partition ${dayName} (${dayIso} → ${nextIso})`);
        }
      } else {
        const curName = `${tableName}_${curMonthSuffix}`;
        const exists = await db.execute(sql`
          SELECT 1 FROM pg_class WHERE relname = ${curName} LIMIT 1
        `);
        const existsResult = (Array.isArray(exists) ? exists : (exists as any).rows ?? []);
        if (existsResult.length === 0) {
          await db.execute(sql.raw(
            `CREATE TABLE IF NOT EXISTS ${curName} PARTITION OF ${tableName} FOR VALUES FROM ('${curStartIso}') TO ('${curEndIso}')`
          ));
          console.warn(`[B74][partitions][SELF-HEAL] created missing CURRENT-month partition ${curName} (${curStartIso} → ${curEndIso})`);
        }
      }

      // Step 2: Headroom check. Threshold is regime-aware: monthly tables keep
      // the 2-month rule (the monthly cron's 12-month lookahead); daily tables
      // warn under 7 days (the daily cron's lookahead is 14 — a week short
      // means it has been stalled ~a week).
      const rows = await db.execute(sql`
        SELECT pg_get_expr(c.relpartbound, c.oid) AS partition_bound
        FROM pg_inherits i
        JOIN pg_class c ON c.oid = i.inhrelid
        JOIN pg_class p ON p.oid = i.inhparent
        WHERE p.relname = ${tableName}
        ORDER BY c.relname DESC
        LIMIT 1
      `);
      const result = (Array.isArray(rows) ? rows : (rows as any).rows ?? []) as Array<{ partition_bound: string }>;
      if (result.length === 0) {
        console.warn(`[B74][partitions][WARN] no partitions found for ${tableName} — partition cron may have never run`);
        continue;
      }
      const match = result[0].partition_bound.match(/TO \('([^']+)'\)/);
      if (!match) {
        console.warn(`[B74][partitions][WARN] unexpected partition bound for ${tableName}: ${result[0].partition_bound}`);
        continue;
      }
      const latestEnd = new Date(match[1]);
      if (curMonthIsDaily) {
        const sevenDaysOut = new Date(now.getTime() + 7 * 24 * 60 * 60 * 1000);
        if (latestEnd < sevenDaysOut) {
          console.warn(
            `[B74][partitions][WARN] ${tableName} (daily) latest partition ends ${latestEnd.toISOString()} ` +
            `— less than 7 days ahead. Check the daily cron (server/scripts/b74-create-daily-partitions.ts).`
          );
        } else {
          console.log(`[B74][partitions] ${tableName} OK (daily) — latest partition ends ${latestEnd.toISOString()}`);
        }
      } else if (latestEnd < twoMonthsFromNow) {
        console.warn(
          `[B74][partitions][WARN] ${tableName} latest partition ends ${latestEnd.toISOString()} ` +
          `— less than 2 months ahead. Run server/scripts/b74-create-monthly-partitions.ts to extend.`
        );
      } else {
        console.log(`[B74][partitions] ${tableName} OK — latest partition ends ${latestEnd.toISOString()}`);
      }
    } catch (err) {
      console.warn(
        `[B74][partitions][WARN] headroom check failed for ${tableName}:`,
        err instanceof Error ? err.message : err,
      );
    }
  }
}

export async function passiveArchiveBootstrap(): Promise<void> {
  console.log('[B74][bootstrap] starting passive archive pipeline...');

  // Read kill-switch + tuning constants
  const equityEnabled = (await getConstant<boolean>('passive_archive', 'b74_equity_capture_enabled', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })) ?? true;
  const perpEnabled = (await getConstant<boolean>('passive_archive', 'b74_perp_capture_enabled', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })) ?? true;
  const cryptoEnabled = (await getConstant<boolean>('passive_archive', 'b74_crypto_capture_enabled', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })) ?? true;
  // P19-B-PERPFEED: the crypto-perp leg DEFAULTS OFF (fail-closed), unlike the
  // B74 legs' default-on — the scope §4 gate forbids this writer starting until
  // the retention work has landed its measured byte drop; deploying the code
  // must not itself start the leg. Switch-on = flipping this constant to true.
  const cryptoPerpEnabled = (await getConstant<boolean>('passive_archive', 'crypto_perp_capture_enabled', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })) ?? false;
  const tickerThrottleMs = (await getConstant<number>('passive_archive', 'b74_ticker_snapshot_min_interval_ms', { exchange: '*', assetClass: '*', strategy: '*', regime: '*' })) ?? 1000;

  setTickerThrottle(tickerThrottleMs);

  // OBJ-8 (#440 takeover): per-class throttle override for the crypto-perp leg.
  // Scoped read (assetClass: 'crypto_perp'); absent → no override → the class
  // resolves to the global value (the byte-identical default path).
  const cryptoPerpThrottleMs = await getConstant<number>('passive_archive', 'ticker_snapshot_min_interval_ms', { exchange: '*', assetClass: 'crypto_perp', strategy: '*', regime: '*' });
  if (cryptoPerpThrottleMs != null && cryptoPerpThrottleMs > 0) {
    setTickerThrottleForClass('crypto_perp', cryptoPerpThrottleMs);
    console.log(`[B74][bootstrap] crypto_perp ticker throttle override: ${cryptoPerpThrottleMs}ms (global ${tickerThrottleMs}ms)`);
  }

  // Partition headroom check (Langston cc-inbox #870 Q2): WARN if the
  // monthly partition cron silently failed and we're approaching the
  // last pre-created partition's end. Non-fatal — the partition cron's
  // self-heal handles the gap on its next run.
  await checkPartitionHeadroom().catch(err => {
    console.warn('[B74][bootstrap] partition headroom check failed:', err instanceof Error ? err.message : err);
  });

  startBatchWriter();
  startTickerWriter();

  // Spawn archivers in parallel, each independent. Catch + log per-archiver
  // so one universe's failure can't block another.
  const tasks: Array<Promise<void>> = [];

  if (equityEnabled) {
    tasks.push(
      startEquitySpotArchiver().catch(err => {
        console.error('[B74][bootstrap] equity-spot archiver failed to start:', err instanceof Error ? err.message : err);
      })
    );
  } else {
    console.log('[B74][bootstrap] equity-spot capture DISABLED via module_constants');
  }

  if (perpEnabled) {
    tasks.push(
      startEquityPerpArchiver().catch(err => {
        console.error('[B74][bootstrap] equity-perp archiver failed to start:', err instanceof Error ? err.message : err);
      })
    );
  } else {
    console.log('[B74][bootstrap] equity-perp capture DISABLED via module_constants');
  }

  if (cryptoEnabled) {
    tasks.push(
      startCryptoSpotArchiver().catch(err => {
        console.error('[B74][bootstrap] crypto-spot archiver failed to start:', err instanceof Error ? err.message : err);
      })
    );
  } else {
    console.log('[B74][bootstrap] crypto-spot capture DISABLED via module_constants');
  }

  if (cryptoPerpEnabled) {
    tasks.push(
      startCryptoPerpArchiver().catch(err => {
        console.error('[B74][bootstrap] crypto-perp archiver failed to start:', err instanceof Error ? err.message : err);
      })
    );
  } else {
    // Expected state until the §4 gate discharges (fail-closed default).
    console.log('[B74][bootstrap] crypto-perp capture DISABLED (default-off until crypto_perp_capture_enabled=true — P19-B-PERPFEED §4 gate)');
  }

  await Promise.all(tasks);
  console.log('[B74][bootstrap] passive archive pipeline started');
}
