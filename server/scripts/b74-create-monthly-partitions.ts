/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 — Monthly Partition Creator
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Run on the 28th of each month at ~02:00 UTC via system cron. Pre-creates
 * the partition for next-month + 12 (a 12-month forward rolling window) so
 * the archive tables always have a partition ready for incoming bars.
 *
 * Self-healing: if today's month's partition is somehow missing (the original
 * migration was rolled back, or a previous cron run failed), it's also created.
 * Loud warning logged for any inline self-heal so the operator notices.
 *
 * Per Langston cc-inbox #867 Q4 + #869 Q4: 12 months forward + cron + startup
 * self-heal. This script is the cron arm; the bootstrap could also call it
 * but currently doesn't (added if needed).
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   0 2 28 * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-create-monthly-partitions.ts >> /var/log/dawntrader/b74-partitions.log 2>&1
 *
 * Reference: BATCH_74_SCOPE.md v1.1 + BATCH_74_PRE_AUDIT.md v1.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import { isDailyPartitionedForMonth } from '../services/data-archive/daily-partition-cutover.js';

const SIX_TABLES = [
  'xstock_spot_ohlc_1m',
  'xstock_perp_ohlc_1m',
  'crypto_spot_ohlc_1m',
  'xstock_spot_ticker_snap',
  'xstock_perp_ticker_snap',
  'crypto_spot_ticker_snap',
] as const;

function partitionName(table: string, year: number, month: number): string {
  return `${table}_${year}_${String(month).padStart(2, '0')}`;
}

function monthBounds(year: number, month: number): { start: string; end: string } {
  const start = `${year}-${String(month).padStart(2, '0')}-01`;
  const nextMonth = month === 12 ? 1 : month + 1;
  const nextYear = month === 12 ? year + 1 : year;
  const end = `${nextYear}-${String(nextMonth).padStart(2, '0')}-01`;
  return { start, end };
}

async function ensurePartition(table: string, year: number, month: number): Promise<{ created: boolean; name: string }> {
  const name = partitionName(table, year, month);
  const { start, end } = monthBounds(year, month);

  const existsResult = await db.execute(sql`
    SELECT 1 FROM pg_class WHERE relname = ${name} LIMIT 1
  `);
  const exists = (Array.isArray(existsResult) ? existsResult.length : (existsResult as any).rows?.length) > 0;

  if (exists) return { created: false, name };

  await db.execute(sql.raw(
    `CREATE TABLE IF NOT EXISTS ${name} PARTITION OF ${table} FOR VALUES FROM ('${start}') TO ('${end}')`
  ));
  return { created: true, name };
}

async function main(): Promise<void> {
  const now = new Date();
  console.log(`[B74][partitions] running at ${now.toISOString()}`);

  // Ensure partitions for: current month (self-heal), next 12 months (forward window)
  let createdCount = 0;
  let selfHealedCount = 0;
  let dailyExcludedCount = 0;

  for (const table of SIX_TABLES) {
    for (let i = 0; i <= 12; i++) {
      const target = new Date(now.getFullYear(), now.getMonth() + i, 1);
      // B-STORAGE-HARDEN Wave D (OBJ-3): a daily-partitioned table (e.g.
      // xstock_spot_ticker_snap) is owned by the DAILY creator from its cutover
      // month forward. Creating a monthly partition here would overlap the daily
      // children and break inserts (Langston Wave-D req #2). Skip those months;
      // months BEFORE the cutover still get a monthly partition (transition-fwd).
      const monthStartUtc = new Date(Date.UTC(target.getFullYear(), target.getMonth(), 1));
      if (isDailyPartitionedForMonth(table, monthStartUtc)) {
        dailyExcludedCount++;
        continue;
      }
      const { created, name } = await ensurePartition(table, target.getFullYear(), target.getMonth() + 1);
      if (created) {
        createdCount++;
        if (i === 0) {
          // Current month was missing — that's a self-heal
          selfHealedCount++;
          console.warn(`[B74][partitions][SELF-HEAL] created missing CURRENT-month partition: ${name}`);
        } else {
          console.log(`[B74][partitions] created forward partition: ${name}`);
        }
      }
    }
  }

  console.log(
    `[B74][partitions] done. ${createdCount} new partitions created ` +
      `(${selfHealedCount} self-healed, ${dailyExcludedCount} daily-partitioned months excluded).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch(err => {
    console.error('[B74][partitions] FATAL:', err);
    process.exit(1);
  });
