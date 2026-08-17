/**
 * ═════════════════════════════════════════════════════════════════════════════
 * P19-B-PERPFEED — the §4 gate test: the OHLC tier path, proven POSITIVELY
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Langston's ruled gate exit (Step-2 pass, 2026-08-17): a SYNTHETIC
 * uncovered-date OHLC partition through the full export→warm→verify→drop
 * path — real bytes, no 2027 wait — WITH a negative leg (his condition 5):
 * demonstrate the pre-fix `'ts'` mapping FAILS on the same object, so the
 * test discriminates rather than merely passing.
 *
 * NAMED TABLE: `xstock_perp_ohlc_1m` (the OHLC family member whose sweep
 * entry #685 fixed; its real partitions begin 2026_04, so an ancient daily
 * range cannot overlap).
 *
 * THE NATURAL EXPERIMENT (proposed to Langston before any seed): the synthetic
 * partition's date (2025-01-15) is outside EVERY retention window, so the
 * NIGHTLY sweep — not a manual run — processes it:
 *   - Seeded BEFORE a night on which staging still runs the PRE-FIX sweep
 *     (`timestampColumn: 'ts'`): that night's run attempts the export and
 *     FAILS on the missing column — the NEGATIVE leg, live and timestamped,
 *     per-table-isolated (only the OHLC entry's item fails; the B70 legs are
 *     untouched — wall-clock cost is one failed query).
 *   - The first night AFTER this batch deploys the fixed sweep
 *     (`interval_begin`): export → warm object → verify → DROP → 0 residual —
 *     the POSITIVE leg on the identical object.
 *
 * Modes:
 *   --seed     create the synthetic daily partition + 2 rows; run the local
 *              column-discrimination probes ('ts' errors, interval_begin = 2);
 *              print the before bytes. REFUSES if the partition already exists.
 *   --verify   read the state: partition present/absent, manifest row for the
 *              label, bytes, verified_at, hot drop. Exit 0 only when the
 *              positive leg is COMPLETE (partition gone + manifest verified).
 *   --clean    remove the synthetic partition + its manifest rows (abort path
 *              only — after a successful positive leg there is nothing to clean).
 *
 * Rule 29: every read below names its object; the discrimination probes are
 * the positive controls for both legs' instruments.
 * ═════════════════════════════════════════════════════════════════════════════
 */

import 'dotenv/config';
import pg from 'pg';
const { Client } = pg;

const PARENT = 'xstock_perp_ohlc_1m';
const DAY = '2025-01-15';
const NEXT = '2025-01-16';
const CHILD = `${PARENT}_2025_01_15`;
const LABEL = '2025-01-15'; // day-slice partition label convention

async function main(): Promise<void> {
  const mode = process.argv.includes('--seed') ? 'seed'
    : process.argv.includes('--verify') ? 'verify'
    : process.argv.includes('--clean') ? 'clean'
    : null;
  if (!mode) {
    console.error('usage: perpfeed-gate-test.ts --seed | --verify | --clean');
    process.exit(2);
  }
  const url = process.env.DATABASE_URL;
  if (!url) { console.error('[gate-test] DATABASE_URL not set'); process.exit(1); }
  const client = new Client({ connectionString: url });
  await client.connect();
  try {
    if (mode === 'seed') {
      const exists = await client.query(`SELECT to_regclass($1) AS r`, [CHILD]);
      if (exists.rows[0].r !== null) {
        console.error(`[gate-test] ${CHILD} already exists — refusing to double-seed (use --verify to read state, --clean to remove)`);
        process.exit(1);
      }
      await client.query(
        `CREATE TABLE ${CHILD} PARTITION OF ${PARENT} FOR VALUES FROM ('${DAY}') TO ('${NEXT}')`,
      );
      await client.query(
        `INSERT INTO ${PARENT} (symbol, asset_class, exchange, interval_begin, open, high, low, close, volume)
         VALUES ('PF_GATETESTXUSD', 'xstock_perp', 'kraken-futures', '${DAY}T12:00:00Z', 1, 1, 1, 1, 0),
                ('PF_GATETESTXUSD', 'xstock_perp', 'kraken-futures', '${DAY}T12:01:00Z', 1, 1, 1, 1, 0)`,
      );
      // NEGATIVE-leg discrimination probe: the pre-fix column REFERENCE fails on
      // this exact object (the same failure shape the pre-fix sweep spec hits at
      // its first interpolated query).
      let negativeProved = false;
      try {
        await client.query(`SELECT count(*) FROM ${CHILD} WHERE ts < now()`);
      } catch (err) {
        negativeProved = /column "ts" does not exist/i.test(err instanceof Error ? err.message : String(err));
      }
      // POSITIVE-instrument control: the fixed column reads the 2 rows.
      const pos = await client.query(`SELECT count(*)::int AS n FROM ${CHILD} WHERE interval_begin < now()`);
      const bytes = await client.query(`SELECT pg_total_relation_size($1::regclass) AS b`, [CHILD]);
      console.log(JSON.stringify({
        seeded: CHILD,
        rows: 2,
        bytes_hot_before: Number(bytes.rows[0].b),
        negative_leg_column_probe: negativeProved ? 'ts REFERENCE FAILS (as the pre-fix sweep spec would)' : 'UNEXPECTED: ts did not fail — investigate before relying on the negative leg',
        positive_instrument_control: pos.rows[0].n === 2 ? 'interval_begin reads 2/2 rows' : `UNEXPECTED row count ${pos.rows[0].n}`,
      }, null, 1));
      if (!negativeProved || pos.rows[0].n !== 2) process.exit(1);
    }

    if (mode === 'verify') {
      const part = await client.query(`SELECT to_regclass($1) AS r`, [CHILD]);
      const manifest = await client.query(
        `SELECT state, storage_uri, checksum, verified_at, hot_partition_dropped_at,
                original_partition_size_bytes
           FROM data_archive_manifest
          WHERE source_table = $1 AND partition_label = $2 AND tier = 'warm'`,
        [PARENT, LABEL],
      );
      const partitionGone = part.rows[0].r === null;
      const m = manifest.rows[0] ?? null;
      const verified = m != null && m.verified_at != null && m.hot_partition_dropped_at != null;
      console.log(JSON.stringify({
        partition_present: !partitionGone,
        manifest_row: m,
        positive_leg_complete: partitionGone && verified,
      }, null, 1));
      process.exit(partitionGone && verified ? 0 : 1);
    }

    if (mode === 'clean') {
      await client.query(`DROP TABLE IF EXISTS ${CHILD}`);
      const del = await client.query(
        `DELETE FROM data_archive_manifest WHERE source_table = $1 AND partition_label = $2`,
        [PARENT, LABEL],
      );
      console.log(`[gate-test] cleaned: partition dropped-if-present, ${del.rowCount} manifest row(s) removed`);
    }
  } finally {
    await client.end();
  }
}

main().catch((err) => {
  console.error('[gate-test] failed:', err);
  process.exit(1);
});
