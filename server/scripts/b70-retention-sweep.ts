/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B70 — Retention Sweep (D.1)
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Runs daily at 02:00 UTC (off-peak from the 04:00 replay-ablation cron).
 * For each B70 archive table, drops whole monthly partitions older than the
 * retention window. For partitioned tables, partition DROP is O(1); the
 * batched-DELETE pattern from D.1 is therefore reserved for the rare case
 * where a row needs purging mid-partition (not used today).
 *
 * Retention window read from `b70_postgres_retention_days` module_constant
 * (default 90).
 *
 * Cron line (add to /etc/cron.d/dawntrader on staging server):
 *   0 2 * * * deploy cd /home/deploy/dawntrader && /usr/bin/npx tsx server/scripts/b70-retention-sweep.ts >> /var/log/dawntrader/b70-retention.log 2>&1
 *
 * Reference: BATCH_70_SCOPE.md §A.5 + BATCH_70_PRE_AUDIT.md §3 (cascade) D.1
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const PARTITIONED_TABLES = [
  'pair_scan_archive',
  'signal_eval_archive',
  'exit_decision_archive',
  'macro_feed_archive',
] as const;

interface RetentionConfig {
  retentionDays: number;
}

async function loadConfig(client: pg.Client): Promise<RetentionConfig> {
  const r = await client.query(
    `SELECT constant_name, value FROM module_constants
     WHERE module_name = 'data_archive'
       AND constant_name = 'b70_postgres_retention_days'
     LIMIT 1`,
  );
  if (r.rows.length > 0) {
    const v = r.rows[0].value;
    const days = typeof v === 'number' ? v : Number(v);
    if (Number.isFinite(days) && days > 0) {
      return { retentionDays: days };
    }
  }
  return { retentionDays: 90 };
}

async function listOldPartitions(
  client: pg.Client,
  parent: string,
  cutoff: Date,
): Promise<string[]> {
  // Match partitions whose suffix ends in YYYY_MM and represents a month
  // strictly before the cutoff month.
  const r = await client.query(
    `SELECT child.relname AS name
       FROM pg_inherits
       JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
       JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
      WHERE parent.relname = $1`,
    [parent],
  );

  const cutoffYear = cutoff.getUTCFullYear();
  const cutoffMonth = cutoff.getUTCMonth() + 1;

  const old: string[] = [];
  for (const row of r.rows) {
    const m = /(\d{4})_(\d{2})$/.exec(row.name);
    if (!m) continue;
    const y = Number(m[1]);
    const mo = Number(m[2]);
    if (y < cutoffYear || (y === cutoffYear && mo < cutoffMonth)) {
      old.push(row.name);
    }
  }
  return old;
}

async function dropPartition(client: pg.Client, name: string): Promise<void> {
  // Use IF EXISTS; if the partition is detached or already dropped, no-op.
  await client.query(`DROP TABLE IF EXISTS "${name}"`);
}

async function main(): Promise<void> {
  const url = process.env.DATABASE_URL;
  if (!url) {
    console.error('[B70][retention] DATABASE_URL not set');
    process.exit(1);
  }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    const cfg = await loadConfig(client);
    // Compute cutoff = (now - retentionDays) ROUNDED DOWN to first of month.
    // Only WHOLE months older than retention are dropped.
    const cutoffDate = new Date(Date.now() - cfg.retentionDays * 86_400_000);
    const cutoffMonthStart = new Date(
      Date.UTC(cutoffDate.getUTCFullYear(), cutoffDate.getUTCMonth(), 1),
    );
    console.log(
      `[B70][retention] cutoff=${cutoffMonthStart.toISOString().slice(0, 10)} ` +
        `(retentionDays=${cfg.retentionDays})`,
    );

    let totalDropped = 0;
    for (const tbl of PARTITIONED_TABLES) {
      const old = await listOldPartitions(client, tbl, cutoffMonthStart);
      if (old.length === 0) {
        console.log(`[B70][retention] ${tbl}: no partitions to drop`);
        continue;
      }
      for (const name of old) {
        await dropPartition(client, name);
        console.log(`[B70][retention] dropped ${name}`);
        totalDropped++;
      }
    }
    console.log(`[B70][retention] done; dropped ${totalDropped} partition(s)`);
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[B70][retention] failed:', err);
  process.exit(1);
});
