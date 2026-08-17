/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70 — Monthly Partition Creator
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs on the 28th of each month at ~02:30 UTC via system cron (offset from
 * B74's 02:00 cron). Pre-creates the partition for next-month + 12 (a
 * 12-month forward rolling window) so the archive tables always have a
 * partition ready for incoming rows.
 *
 * Self-healing: if today's month's partition is somehow missing, it's also
 * created with a loud warning log.
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   30 2 28 * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b70-create-monthly-partitions.ts >> /var/log/dawntrader/b70-partitions.log 2>&1
 *
 * Reference: BATCH_70_SCOPE.md §A.7
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';
// P19-B-PERPFEED OBJ-7(b-ii): daily-cutover awareness — without this, the first
// 28th-of-month run after a table's daily cutover recreates its monthly partition
// on top of the daily children, throws on RANGE OVERLAP, and (no per-table catch)
// abandons the forward window for every table in the list. NOTE the to_regclass
// probe below does NOT protect against this: post-cutover the monthly NAME is
// genuinely absent (the cutover migration dropped it), so a name probe — and
// IF NOT EXISTS — both pass and the CREATE still throws. A name probe is not a
// range guard (Langston, P19-B-PERPFEED Step-2).
import { isDailyPartitionedForMonth } from '../services/data-archive/daily-partition-cutover.js';
const { Client } = pg;

const PARTITIONED_TABLES = [
  'pair_scan_archive',
  'signal_eval_archive',
  'exit_decision_archive',
  'macro_feed_archive',
  'signal_eval_provenance', // B-NEW-53
  'switch_on_shadow_evidence', // B-EVIDENCE-SINK (list: 6 tables)
] as const;

const FORWARD_MONTHS = 12;

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

async function ensurePartition(
  client: pg.Client,
  table: string,
  year: number,
  month: number,
): Promise<boolean> {
  const name = partitionName(table, year, month);
  const { start, end } = monthBounds(year, month);
  const r = await client.query(`SELECT to_regclass($1) AS exists`, [name]);
  if (r.rows[0].exists !== null) return false;
  await client.query(
    `CREATE TABLE "${name}" PARTITION OF "${table}" FOR VALUES FROM ('${start}') TO ('${end}')`,
  );
  console.log(`[B70][partitions] CREATED ${name}`);
  return true;
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[B70][partitions] DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const today = new Date();
    let totalCreated = 0;
    let dailyExcluded = 0;
    // Self-heal: ensure current month exists
    {
      const y = today.getUTCFullYear();
      const m = today.getUTCMonth() + 1;
      const monthStartUtc = new Date(Date.UTC(y, m - 1, 1));
      for (const tbl of PARTITIONED_TABLES) {
        // OBJ-7(b-ii): a daily-partitioned table is owned by the DAILY creator
        // from its cutover month forward — a monthly child here would overlap
        // the daily children's ranges (same guard as b74-create-monthly-partitions.ts:91-95).
        if (isDailyPartitionedForMonth(tbl, monthStartUtc)) { dailyExcluded++; continue; }
        const created = await ensurePartition(client, tbl, y, m);
        if (created) {
          console.warn(
            `[B70][partitions] SELF-HEAL: created missing current-month partition ${partitionName(tbl, y, m)}`,
          );
          totalCreated++;
        }
      }
    }
    // Forward window
    for (let i = 1; i <= FORWARD_MONTHS; i++) {
      const d = new Date(
        Date.UTC(today.getUTCFullYear(), today.getUTCMonth() + i, 1),
      );
      const y = d.getUTCFullYear();
      const m = d.getUTCMonth() + 1;
      for (const tbl of PARTITIONED_TABLES) {
        if (isDailyPartitionedForMonth(tbl, d)) { dailyExcluded++; continue; }
        const created = await ensurePartition(client, tbl, y, m);
        if (created) totalCreated++;
      }
    }
    if (dailyExcluded > 0) {
      console.log(`[B70][partitions] skipped ${dailyExcluded} table-month(s) owned by the daily creator (post-cutover)`);
    }
    console.log(`[B70][partitions] done; created ${totalCreated} partition(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[B70][partitions] failed:', err);
  process.exit(1);
});
