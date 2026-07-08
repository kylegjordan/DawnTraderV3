/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B74 / B-STORAGE-HARDEN Wave D — Daily Partition Creator (OBJ-3)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs DAILY at ~01:00 UTC via system cron. For each daily-partitioned table
 * (currently just `xstock_spot_ticker_snap`), pre-creates `…_YYYY_MM_DD` RANGE
 * partitions for a forward window [today .. today + LOOKAHEAD_DAYS], never before
 * that table's cutover. A 14-day look-ahead (Langston Wave-D req #3 — bumped
 * 7→14) means even a two-week cron stall can't leave a day unpartitioned, and an
 * empty daily partition is ~free. Self-heals the current day with a loud warning.
 *
 * The MONTHLY creator EXCLUDES these tables at/after the cutover (see
 * `daily-partition-cutover.ts`), so the monthly and daily jobs never create
 * overlapping RANGE children — an overlap makes inserts fail.
 *
 * Partition bounds use the SAME bare-date convention as the monthly creator
 * (`FROM ('YYYY-MM-DD') TO ('next-day')`) so the July-monthly ↔ August-daily
 * seam is continuous regardless of the DB session timezone (both bounds are
 * interpreted identically). The first daily partitions are also created by the
 * cutover migration, so day-1 is covered even before this cron first catches up;
 * CREATE … IF NOT EXISTS + a pg_class existence probe make that idempotent.
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   0 1 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b74-create-daily-partitions.ts >> /var/log/dawntrader/b74-daily-partitions.log 2>&1
 * ═════════════════════════════════════════════════════════════════════════════
 */

// MUST precede the ../db.js import: db.ts throws at module-load if DATABASE_URL
// is unset, and the deploy cron's `su - deploy -c` login shell does NOT export
// it — so the script loads its own env from .env first (matches b75-cold-rotator
// / b75-retention-sweep). Without this the cron dies on "DATABASE_URL must be set".
import 'dotenv/config';
import { db } from '../db.js';
import { sql } from 'drizzle-orm';
import {
  DAILY_PARTITION_CUTOVERS,
  cutoverForTable,
} from '../services/data-archive/daily-partition-cutover.js';

const LOOKAHEAD_DAYS = 14;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function dailyPartitionName(table: string, d: Date): string {
  return `${table}_${d.getUTCFullYear()}_${pad(d.getUTCMonth() + 1)}_${pad(d.getUTCDate())}`;
}

/** Bare-date bounds 'YYYY-MM-DD' → next day (matches the monthly creator). */
function dayBounds(d: Date): { start: string; end: string } {
  const next = new Date(d.getTime() + 86_400_000);
  const fmt = (x: Date) => `${x.getUTCFullYear()}-${pad(x.getUTCMonth() + 1)}-${pad(x.getUTCDate())}`;
  return { start: fmt(d), end: fmt(next) };
}

async function ensureDailyPartition(table: string, d: Date): Promise<{ created: boolean; name: string }> {
  const name = dailyPartitionName(table, d);
  const { start, end } = dayBounds(d);

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
  console.log(`[B74][daily-partitions] running at ${now.toISOString()}`);

  const todayUtc = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  let createdCount = 0;
  let selfHealedCount = 0;
  let skippedPreCutover = 0;

  for (const { table } of DAILY_PARTITION_CUTOVERS) {
    const cutover = cutoverForTable(table)!;
    for (let i = 0; i <= LOOKAHEAD_DAYS; i++) {
      const d = new Date(todayUtc.getTime() + i * 86_400_000);
      if (d.getTime() < cutover.getTime()) {
        // The daily scheme is not yet in effect for this day — the month is
        // still monthly-partitioned (owned by the monthly creator). Skip.
        skippedPreCutover++;
        continue;
      }
      const { created, name } = await ensureDailyPartition(table, d);
      if (created) {
        createdCount++;
        if (i === 0) {
          // Current day was missing — that's a self-heal (the daily cron should
          // have created it the prior run; loud so the operator notices a miss).
          selfHealedCount++;
          console.warn(`[B74][daily-partitions][SELF-HEAL] created missing CURRENT-day partition: ${name}`);
        } else {
          console.log(`[B74][daily-partitions] created forward partition: ${name}`);
        }
      }
    }
  }

  console.log(
    `[B74][daily-partitions] done. ${createdCount} new partitions created ` +
      `(${selfHealedCount} self-healed, ${skippedPreCutover} pre-cutover days skipped).`,
  );
}

main()
  .then(() => process.exit(0))
  .catch((err) => {
    console.error('[B74][daily-partitions] FATAL:', err);
    process.exit(1);
  });
