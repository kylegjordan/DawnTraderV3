import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import crypto from 'node:crypto';
import fs from 'node:fs';
import pg from 'pg';
import path from 'node:path';
import {
  appendSnapshotKey,
  snapshotLockedDeleteParams,
  snapshotLockedDeleteSql,
  snapshotPopulationParams,
  snapshotPopulationSql,
  snapshotProvenKeyAbsenceSql,
  type XstockSnapshotProof,
  type XstockSnapshotSelector,
} from '../../services/data-archive/xstock-snapshot-retention.js';
import { exportPartition } from '../../services/data-archive/partition-exporter.js';

// B-XSTOCK-SNAPSHOT-RETENTION P9: execute the shipped generated SQL on real
// PostgreSQL. CI supplies the migrated service database; without one this suite
// skips locally, but an unreachable CI database is a hard failure.

const url = process.env.DATABASE_URL ?? '';
async function reachable(): Promise<boolean> {
  const client = new pg.Client({ connectionString: url, connectionTimeoutMillis: 2000 });
  try { await client.connect(); await client.end(); return true; } catch { return false; }
}
const DB = await reachable();
if (process.env.CI && !DB) {
  throw new Error('B-XSTOCK-SNAPSHOT-RETENTION integration: the CI database at DATABASE_URL is unreachable');
}

const schema = `b_xssr_${process.pid}_${crypto.randomBytes(4).toString('hex')}`;
const selector: XstockSnapshotSelector = {
  table: 'xstock_spot_ohlc_15m_snapshot',
  keepFloorRows: 240,
  cutoffAt: new Date('2025-02-01T00:00:00Z'),
  rankingObservedAt: new Date('2025-02-02T12:00:00Z'),
  dayStart: new Date('2025-01-01T00:00:00Z'),
  dayEnd: new Date('2025-01-02T00:00:00Z'),
};

describe.skipIf(!DB)('B-XSTOCK-SNAPSHOT-RETENTION real PostgreSQL proof/delete gate', () => {
  const client = new pg.Client({ connectionString: url });
  let connected = false;

  beforeAll(async () => {
    await client.connect();
    connected = true;
    await client.query(`CREATE SCHEMA ${schema}`);
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query(`
      CREATE TABLE xstock_spot_ohlc_15m_snapshot (
        symbol text NOT NULL,
        bucket_ts timestamptz NOT NULL,
        open numeric NOT NULL,
        high numeric NOT NULL,
        low numeric NOT NULL,
        close numeric NOT NULL,
        volume numeric NOT NULL,
        source_bar_count integer NOT NULL,
        captured_at timestamptz NOT NULL,
        aggregate_revision_id uuid,
        aggregate_hash text,
        source_revision_set_hash text,
        source_max_visible_by timestamptz,
        source_max_visible_seq bigint,
        read_observed_at timestamptz,
        read_observed_seq bigint,
        certificate_primary_identity text,
        availability_contract_version text,
        eligibility_state text,
        PRIMARY KEY (symbol, bucket_ts)
      )
    `);
    await client.query(`
      CREATE TABLE data_archive_manifest (
        id text PRIMARY KEY,
        state text NOT NULL,
        completeness_basis text NOT NULL,
        hot_partition_dropped_at timestamptz
      )
    `);
  });

  beforeEach(async () => {
    await client.query('ROLLBACK').catch(() => {});
    await client.query(`SET search_path TO ${schema}, public`);
    await client.query('TRUNCATE xstock_spot_ohlc_15m_snapshot, data_archive_manifest');
    await client.query('DROP TABLE IF EXISTS b75_snapshot_proven_keys');
    await client.query('DROP TABLE IF EXISTS data_archive_exact_evidence');
    await client.query('CREATE TABLE data_archive_exact_evidence (id integer PRIMARY KEY)');
    await client.query(`
      CREATE TRIGGER trg_guard_data_archive_exact_evidence_mutation
      BEFORE UPDATE OR DELETE ON data_archive_exact_evidence
      FOR EACH ROW EXECUTE FUNCTION public.guard_xstock_bar_projection_evidence_mutation()
    `);
    await client.query(`
      CREATE TRIGGER trg_guard_data_archive_exact_evidence_truncate
      BEFORE TRUNCATE ON data_archive_exact_evidence
      FOR EACH STATEMENT EXECUTE FUNCTION public.guard_xstock_bar_projection_evidence_mutation()
    `);
    await client.query(`
      INSERT INTO xstock_spot_ohlc_15m_snapshot (
        symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at
      )
      SELECT 'B-XSSR/USD',
             '2025-01-01T00:00:00Z'::timestamptz + i * interval '15 minutes',
             100 + i, 101 + i, 99 + i, 100.5 + i, 1000 + i, 1,
             '2025-02-02T00:00:00Z'::timestamptz
        FROM generate_series(0, 241) AS i
    `);
  });

  afterAll(async () => {
    if (!connected) return;
    await client.query('RESET search_path').catch(() => {});
    await client.query(`DROP SCHEMA IF EXISTS ${schema} CASCADE`).catch(() => {});
    await client.end();
  });

  async function freezeProof(): Promise<XstockSnapshotProof> {
    const result = await client.query(
      `${snapshotPopulationSql(selector)} ORDER BY symbol, bucket_ts`,
      snapshotPopulationParams(selector),
    );
    const keyHash = crypto.createHash('sha256');
    const rowHash = crypto.createHash('sha256');
    for (const row of result.rows) {
      appendSnapshotKey(keyHash, row.symbol, row.bucket_ts_text);
      rowHash.update(Buffer.from(`${row.canonical_json}\n`, 'utf8'));
    }
    return {
      sourceRowCount: result.rowCount ?? result.rows.length,
      orderedKeySha256: keyHash.digest('hex'),
      fullRowSha256: rowHash.digest('hex'),
    };
  }

  async function loadProvenKeys(): Promise<void> {
    await client.query(`
      CREATE TEMP TABLE b75_snapshot_proven_keys (
        symbol text NOT NULL,
        bucket_ts timestamptz NOT NULL,
        PRIMARY KEY (symbol, bucket_ts)
      ) ON COMMIT PRESERVE ROWS
    `);
    await client.query(`
      INSERT INTO b75_snapshot_proven_keys (symbol, bucket_ts)
      SELECT symbol, bucket_ts
        FROM xstock_spot_ohlc_15m_snapshot
       WHERE bucket_ts < '2025-01-01T00:30:00Z'
    `);
  }

  async function runLockedGate(proof: XstockSnapshotProof, manifestId = 'manifest-1') {
    await client.query(
      'INSERT INTO data_archive_manifest (id, state, completeness_basis) VALUES ($1, $2, $3)',
      [manifestId, 'verified', 'source-count-matched'],
    );
    await client.query('BEGIN');
    try {
      await client.query("SET LOCAL lock_timeout = '1s'");
      await client.query("SET LOCAL statement_timeout = '5s'");
      await client.query('LOCK TABLE xstock_spot_ohlc_15m_snapshot IN SHARE MODE');
      const result = await client.query(
        snapshotLockedDeleteSql(selector),
        snapshotLockedDeleteParams(selector, proof, manifestId),
      );
      await client.query('COMMIT');
      return result.rows[0];
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      throw error;
    }
  }

  it('executes the exact count/key/content proof and atomically deletes only proven keys', async () => {
    const proof = await freezeProof();
    expect(proof.sourceRowCount).toBe(2);
    await loadProvenKeys();
    const result = await runLockedGate(proof);
    expect(result).toMatchObject({
      proof_matches: true,
      current_row_count: '2',
      deleted_row_count: '2',
      manifest_rows_marked: '1',
    });
    expect((await client.query('SELECT count(*)::int AS n FROM xstock_spot_ohlc_15m_snapshot')).rows[0].n).toBe(240);
    expect((await client.query('SELECT state FROM data_archive_manifest WHERE id = $1', ['manifest-1'])).rows[0].state)
      .toBe('active');
    expect((await client.query(snapshotProvenKeyAbsenceSql(selector.table))).rows[0].remaining_rows).toBe('0');
  });

  it('binds ranking observation to the export snapshot when a writer lands after discovery', async () => {
    const discovery = await client.query(
      `SELECT clock_timestamp() AS observed_at, count(*)::int AS n
         FROM (${snapshotPopulationSql(selector)}) population`,
      snapshotPopulationParams(selector),
    );
    expect(discovery.rows[0].n).toBe(2);

    const writer = new pg.Client({ connectionString: url });
    await writer.connect();
    try {
      await writer.query(`SET search_path TO ${schema}, public`);
      await writer.query(`
        INSERT INTO xstock_spot_ohlc_15m_snapshot
          (symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at)
        VALUES ('B-XSSR/USD', '2025-01-01T00:02:00Z', 1, 1, 1, 1, 1, 1, '2025-02-02T00:00:00Z')
      `);
    } finally {
      await writer.end();
    }

    const exported = await exportPartition(client, {
      sourceTable: selector.table,
      partitionLabel: `writer-after-discovery-${process.pid}`,
      rangeStart: selector.dayStart,
      rangeEnd: selector.dayEnd,
      timestampColumn: 'bucket_ts',
      snapshotSelector: selector,
    });
    try {
      expect(exported.snapshotProof?.sourceRowCount).toBe(3);
      expect(exported.snapshotObservedAt).toBeInstanceOf(Date);
      expect(exported.snapshotObservedAt!.getTime())
        .toBeGreaterThanOrEqual(new Date(discovery.rows[0].observed_at).getTime());
      expect(exported.snapshotObservedAt!.getTime()).not.toBe(selector.rankingObservedAt.getTime());
    } finally {
      fs.rmSync(exported.localPath, { force: true });
    }
  });

  it('refuses same-count key replacement, content replacement and recent floor displacement before deletion', async () => {
    const mutations = [
      async () => {
        await client.query("DELETE FROM xstock_spot_ohlc_15m_snapshot WHERE bucket_ts = '2025-01-01T00:00:00Z'");
        await client.query(`
          INSERT INTO xstock_spot_ohlc_15m_snapshot
            (symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at)
          VALUES ('B-XSSR/USD', '2025-01-01T00:02:00Z', 1, 1, 1, 1, 1, 1, '2025-02-02T00:00:00Z')
        `);
      },
      async () => {
        await client.query("UPDATE xstock_spot_ohlc_15m_snapshot SET close = close + 1 WHERE bucket_ts = '2025-01-01T00:00:00Z'");
      },
      async () => {
        await client.query(`
          INSERT INTO xstock_spot_ohlc_15m_snapshot
            (symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at)
          VALUES ('B-XSSR/USD', '2025-01-03T12:30:00Z', 1, 1, 1, 1, 1, 1, '2025-02-02T00:00:00Z')
        `);
      },
    ];

    for (let index = 0; index < mutations.length; index++) {
      if (index > 0) {
        await client.query('TRUNCATE xstock_spot_ohlc_15m_snapshot, data_archive_manifest');
        await client.query(`
          INSERT INTO xstock_spot_ohlc_15m_snapshot
            (symbol, bucket_ts, open, high, low, close, volume, source_bar_count, captured_at)
          SELECT 'B-XSSR/USD', '2025-01-01T00:00:00Z'::timestamptz + i * interval '15 minutes',
                 100 + i, 101 + i, 99 + i, 100.5 + i, 1000 + i, 1, '2025-02-02T00:00:00Z'::timestamptz
            FROM generate_series(0, 241) AS i
        `);
        await client.query('TRUNCATE b75_snapshot_proven_keys');
        await client.query(`
          INSERT INTO b75_snapshot_proven_keys (symbol, bucket_ts)
          SELECT symbol, bucket_ts FROM xstock_spot_ohlc_15m_snapshot
           WHERE bucket_ts < '2025-01-01T00:30:00Z'
        `);
      } else {
        await loadProvenKeys();
      }
      const proof = await freezeProof();
      await mutations[index]();
      const result = await runLockedGate(proof, `manifest-${index}`);
      expect(result.proof_matches, `mutation ${index}`).toBe(false);
      expect(result.deleted_row_count, `mutation ${index}`).toBe('0');
      expect(result.manifest_rows_marked, `mutation ${index}`).toBe('0');
      expect((await client.query('SELECT state FROM data_archive_manifest')).rows[0].state).toBe('verified');
    }
  });

  it('cannot run the proven-key gate from a different database session', async () => {
    const proof = await freezeProof();
    await loadProvenKeys();
    await client.query(
      'INSERT INTO data_archive_manifest (id, state, completeness_basis) VALUES ($1, $2, $3)',
      ['manifest-wrong-client', 'verified', 'source-count-matched'],
    );
    const other = new pg.Client({ connectionString: url });
    await other.connect();
    try {
      await other.query(`SET search_path TO ${schema}, public`);
      await expect(other.query(
        snapshotLockedDeleteSql(selector),
        snapshotLockedDeleteParams(selector, proof, 'manifest-wrong-client'),
      )).rejects.toThrow(/b75_snapshot_proven_keys/);
    } finally {
      await other.end();
    }
    expect((await client.query('SELECT count(*)::int AS n FROM xstock_spot_ohlc_15m_snapshot')).rows[0].n).toBe(242);
  });

  it('executes the shipped append-only evidence guard against deletion and truncation', async () => {
    const guard = await client.query(
      "SELECT to_regprocedure('public.guard_xstock_bar_projection_evidence_mutation()')::text AS fn",
    );
    expect(guard.rows[0].fn).toBe('guard_xstock_bar_projection_evidence_mutation()');
    await client.query('INSERT INTO data_archive_exact_evidence (id) VALUES (1)');
    await expect(client.query('DELETE FROM data_archive_exact_evidence WHERE id = 1'))
      .rejects.toThrow(/append-only/);
    await client.query('ROLLBACK').catch(() => {});
    await expect(client.query('TRUNCATE data_archive_exact_evidence')).rejects.toThrow(/append-only/);
    await client.query('ROLLBACK').catch(() => {});
    expect((await client.query('SELECT count(*)::int AS n FROM data_archive_exact_evidence')).rows[0].n).toBe(1);
  });

  it('preserves seeded disk-file cursor evidence through the forward migration and rollback', async () => {
    await client.query('DROP TABLE data_archive_exact_evidence CASCADE');
    await client.query(`DROP TABLE IF EXISTS ${schema}.module_constants CASCADE`);
    await client.query(`
      CREATE TABLE ${schema}.module_constants (
        module_name text NOT NULL, exchange text NOT NULL, asset_class text NOT NULL,
        strategy text NOT NULL, regime text NOT NULL, constant_name text NOT NULL,
        value jsonb NOT NULL, updated_by text NOT NULL, updated_at timestamptz NOT NULL,
        UNIQUE (module_name, exchange, asset_class, strategy, regime, constant_name)
      )
    `);
    await client.query(`
      CREATE TABLE data_archive_exact_evidence (
        source_table text NOT NULL,
        partition_label text NOT NULL,
        cursor_contract text NOT NULL,
        CONSTRAINT data_archive_exact_evidence_cursor_contract_check
          CHECK (cursor_contract IN (
            'jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid',
            'text-ts-tiegroup-v1',
            'disk-file-lines-v1'
          ))
      )
    `);
    await client.query(
      `INSERT INTO data_archive_exact_evidence VALUES ('disk_file.exports', 'seed.ndjson', 'disk-file-lines-v1')`,
    );

    const migrationSql = fs.readFileSync(
      path.resolve(process.cwd(), 'drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql'),
      'utf8',
    ).replace(/^\s*BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');
    const rollbackSql = fs.readFileSync(
      path.resolve(process.cwd(), 'drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql'),
      'utf8',
    ).replace(/^\s*BEGIN;\s*/, '').replace(/\s*COMMIT;\s*$/, '');

    await client.query(migrationSql);
    expect((await client.query(
      "SELECT count(*)::int AS n FROM data_archive_exact_evidence WHERE cursor_contract = 'disk-file-lines-v1'",
    )).rows[0].n).toBe(1);
    await client.query(rollbackSql);
    await client.query(
      `INSERT INTO data_archive_exact_evidence VALUES ('disk_file.exports', 'second.ndjson', 'disk-file-lines-v1')`,
    );
    expect((await client.query(
      "SELECT count(*)::int AS n FROM data_archive_exact_evidence WHERE cursor_contract = 'disk-file-lines-v1'",
    )).rows[0].n).toBe(2);
    const selectorColumns = await client.query(`
      SELECT count(*)::int AS n
        FROM information_schema.columns
       WHERE table_schema = current_schema()
         AND table_name = 'data_archive_exact_evidence'
         AND column_name IN (
           'selector_contract',
           'selector_version',
           'frozen_cutoff_at',
           'ranking_observed_at',
           'keep_floor_rows',
           'day_start',
           'day_end',
           'ordered_key_sha256',
           'full_row_sha256'
         )
    `);
    expect(selectorColumns.rows[0].n).toBe(0);
  });
});
