/**
 * B-DISK-HEADROOM Step 2 — READ-ONLY. Which partitions would the B75 sweep take on a given night, and how big are they?
 *
 *   npx tsx scripts/analysis/b_disk_headroom_eligibility.ts --at 2026-11-08T02:15:00Z \
 *       [--set crypto_spot_ohlc_1m=145,xstock_spot_ohlc_1m=145] [--slicing <path to sweep-slicing.ts>]
 *
 * It evaluates the SWEEP'S OWN eligibility code, not a model of it: `classifyPartition` and `isPartitionEligible`
 * are imported from `sweep-slicing.ts` (by default the copy beside this repo; pass --slicing to point at the deployed
 * clone's copy). `listOldPartitions` (b75-retention-sweep.ts:272) is not exported; its whole body is the pg_inherits
 * query below + those two calls, reproduced line for line. The cutoff is the sweep's own: `now − N × 86,400,000 ms`,
 * month start in UTC (b75-retention-sweep.ts:1325-1327).
 *
 * Reads: pg_inherits/pg_class (children + bounds), pg_total_relation_size, module_constants (data_lifecycle). Every
 * statement runs inside one READ ONLY transaction. It writes nothing anywhere; --set changes only what it evaluates.
 */
import 'dotenv/config';
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import {
  DATA_LIFECYCLE_SCOPE_SQL,
  parseLifecycleNumber,
} from '../../server/services/data-archive/hot-horizon.js';

const B74_PARENTS = [
  'xstock_spot_ticker_snap', 'xstock_perp_ticker_snap', 'crypto_spot_ticker_snap', 'crypto_perp_ticker_snap',
  'xstock_spot_ohlc_1m', 'xstock_perp_ohlc_1m', 'crypto_spot_ohlc_1m', 'crypto_perp_ohlc_1m',
  'xstock_bar_revision_event', 'signal_eval_archive', 'pair_scan_archive', 'exit_decision_archive',
  'macro_feed_archive', 'signal_eval_provenance', 'switch_on_shadow_evidence',
];

function arg(name: string): string | undefined {
  const i = process.argv.indexOf(name);
  if (i < 0) return undefined;
  const v = process.argv[i + 1];
  if (v === undefined || v.startsWith('--')) throw new Error(`${name} needs a value`);
  return v;
}

async function main(): Promise<void> {
  const at = arg('--at');
  if (!at || Number.isNaN(Date.parse(at))) throw new Error('--at <ISO UTC instant> is required');
  const now = Date.parse(at);
  const overrides = new Map<string, number>();
  for (const kv of (arg('--set') ?? '').split(',').filter(Boolean)) {
    const [t, n] = kv.split('=');
    const v = Number(n);
    if (!t || !Number.isFinite(v) || v <= 0) throw new Error(`bad --set entry ${kv}`);
    overrides.set(t, v);
  }
  const slicingPath = arg('--slicing') ?? new URL('../../server/services/data-archive/sweep-slicing.ts', import.meta.url).pathname;
  const slicing = await import(pathToFileURL(slicingPath.replace(/^\/([A-Za-z]:)/, '$1')).href);
  const { classifyPartition, isPartitionEligible } = slicing;
  if (typeof classifyPartition !== 'function' || typeof isPartitionEligible !== 'function') {
    throw new Error(`sweep-slicing at ${slicingPath} does not export classifyPartition/isPartitionEligible`);
  }

  const client = new pg.Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  try {
    await client.query('BEGIN TRANSACTION READ ONLY');
    const cfg = await client.query(
      `SELECT constant_name, value FROM module_constants WHERE ${DATA_LIFECYCLE_SCOPE_SQL}`,
    );
    const consts = new Map<string, unknown>(cfg.rows.map((r) => [r.constant_name, r.value]));
    const sliceThreshold = parseLifecycleNumber(consts.get('slice_threshold_hot_bytes'));
    if (sliceThreshold === null) throw new Error('data_lifecycle.slice_threshold_hot_bytes is absent or invalid');
    console.log(`at ${new Date(now).toISOString()} · slice_threshold_hot_bytes ${sliceThreshold} · slicing ${slicingPath}`);
    let total = 0;
    for (const parent of B74_PARENTS) {
      const configured = parseLifecycleNumber(consts.get(`${parent}.hot_retention_days`));
      const n = overrides.get(parent) ?? configured;
      if (n === null) { console.log(`${parent}: NO valid retention constant`); continue; }
      const cutoff = new Date(now - n * 86_400_000);
      const cutoffMonth = new Date(Date.UTC(cutoff.getUTCFullYear(), cutoff.getUTCMonth(), 1));
      const r = await client.query(
        `SELECT child.relname AS child_name, pg_total_relation_size(child.oid) AS bytes
           FROM pg_inherits
           JOIN pg_class child  ON child.oid  = pg_inherits.inhrelid
           JOIN pg_class parent ON parent.oid = pg_inherits.inhparent
          WHERE parent.relname = $1`,
        [parent],
      );
      const eligible = [];
      for (const row of r.rows) {
        const parsed = classifyPartition(row.child_name);
        if (!parsed) continue;
        if (!isPartitionEligible(parsed, cutoff, cutoffMonth)) continue;
        eligible.push({ child: row.child_name, bytes: Number(row.bytes), kind: parsed.kind });
      }
      eligible.sort((a, b) => a.child.localeCompare(b.child));
      const sum = eligible.reduce((s, e) => s + e.bytes, 0);
      total += sum;
      console.log(`${parent}: retentionDays=${n}${overrides.has(parent) ? ' (OVERRIDE)' : ''} cutoff=${cutoff.toISOString()} ` +
        `cutoffMonth=${cutoffMonth.toISOString().slice(0, 10)} eligible=${eligible.length} bytes=${sum}`);
      for (const e of eligible) {
        console.log(`    ${e.child}  ${e.kind}  ${e.bytes} B  ${e.bytes > sliceThreshold ? 'SLICED lane' : 'whole lane'}`);
      }
    }
    console.log(`TOTAL eligible bytes ${total}`);
    await client.query('ROLLBACK');
  } finally {
    await client.end();
  }
}

main().catch((e) => { console.error(`FAILED: ${e instanceof Error ? e.message : e}`); process.exit(1); });
