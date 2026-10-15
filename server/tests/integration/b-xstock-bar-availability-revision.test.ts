/**
 * B-XSTOCK-BAR-AVAILABILITY P2/P3 — real PostgreSQL proof of the immutable
 * event/generation chain and later primary certificate.
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { sql } from 'drizzle-orm';
import pg from 'pg';
import { randomUUID } from 'node:crypto';
import { db } from '../../db.js';
import { upsertOhlcRows } from '../../services/passive-archive/ohlc-batch-writer.js';
import {
  XSTOCK_BAR_WRITER_BOOT_ID,
  XSTOCK_BAR_WRITER_BUILD_SHA,
  writeXstockProjectionAttempts,
  xstockProjectionPayloadJson,
} from '../../services/passive-archive/xstock-bar-availability.js';
import {
  aggregateAvailableXstockOHLC,
  persistSettledXstockWindowManifest,
} from '../../asset_classes/xstock_spot/availability-aggregator.js';
import { XSTOCK_WRITER_BOOT_CHAIN_SQL } from '../../scripts/b-xstock-bar-availability-capacity-gate.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-XSTOCK-BAR-AVAILABILITY-REVISION';
const SYMBOL = 'BAVAILTEST/USD';
const LEGACY_SYMBOL = 'BAVAILLEGACY/USD';
const ACTIVATE_SYMBOL = 'BAVAILACTIVATE/USD';
const POST_ACTIVE_LEGACY_SYMBOL = 'BAVAILLEGACY2/USD';
const FLUSH_SYMBOL = 'BAVAILFLUSH/USD';
const now = Date.now();
const minute = new Date(Math.floor((now - 60_000) / 60_000) * 60_000);
const A1 = new Date(now - 30_000);
const A2 = new Date(now - 20_000);
const A3 = new Date(now - 10_000);
let dbReachable = true;
let activationRevisionId = '';
const { Client } = pg;

const bar = (close: string, arrivedAt: Date) => ({
  symbol: SYMBOL,
  assetClass: 'xstock_spot',
  exchange: 'kraken-equities',
  intervalBegin: minute,
  arrivedAt,
  open: '9', high: '11', low: '8', close, volume: '100',
  vwap: '9.5', tradeCount: 7, metadata: { schema_version: 1, test: TAG },
}) as any;

async function rows<T>(query: unknown): Promise<T[]> {
  const result = await query as any;
  return (result?.rows ?? result) as T[];
}

async function waitForDatabaseLock(applicationName: string): Promise<void> {
  const deadline = Date.now() + 5_000;
  while (Date.now() < deadline) {
    const activity = await rows<{ wait_event_type: string | null }>(db.execute(sql`
      SELECT wait_event_type
      FROM pg_stat_activity
      WHERE application_name = ${applicationName}
    `));
    if (activity.some((row) => row.wait_event_type === 'Lock')) return;
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  throw new Error(`[${TAG}] ${applicationName} never entered a database lock wait`);
}

async function cleanup(): Promise<void> {
  await db.transaction(async (tx) => {
    await tx.execute(sql`SELECT set_config('dawntrader.archive_mode', 'on', true)`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_15m_snapshot WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_60m_snapshot WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_bar_window_manifest WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_bar_aggregate_revision WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_bar_revision_event WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_bar_revision_event WHERE symbol = ${ACTIVATE_SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_1m WHERE symbol = ${SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_1m WHERE symbol = ${LEGACY_SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_1m WHERE symbol = ${ACTIVATE_SYMBOL}`);
    await tx.execute(sql`DELETE FROM xstock_spot_ohlc_1m WHERE symbol = ${POST_ACTIVE_LEGACY_SYMBOL}`);
  });
}

beforeAll(async () => {
  try {
    await db.execute(sql`SELECT 1`);
  } catch (error) {
    if (IS_CI) {
      throw new Error(`[${TAG}] PostgreSQL unreachable in CI: ${error instanceof Error ? error.message : error}`);
    }
    dbReachable = false;
    return;
  }
  if (isTestDb) await cleanup();
});

afterAll(async () => {
  if (dbReachable && isTestDb) await cleanup();
});

describe(TAG, () => {
  it('runs only against the isolated test database', () => {
    if (IS_CI) expect(isTestDb).toBe(true);
  });

  it('allows the migration overlap, then permanently rejects legacy projection writes', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const legacyClient = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-legacy-holder',
    });
    const activationClient = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-activation-waiter',
    });
    await legacyClient.connect();
    await activationClient.connect();
    try {
      const [initialState] = await rows<{ contract_active: boolean }>(db.execute(sql`
        SELECT contract_active FROM xstock_bar_clock_guard WHERE singleton = true
      `));
      expect(initialState.contract_active).toBe(false);
      await legacyClient.query('BEGIN');
      await legacyClient.query(`
        INSERT INTO xstock_spot_ohlc_1m (
          symbol, asset_class, exchange, interval_begin, open, high, low, close,
          volume, metadata, captured_at, arrived_at
        ) VALUES ($1, 'xstock_spot', 'kraken-equities', $2::timestamptz,
          1, 1, 1, 1, 1, '{"schema_version":1}'::jsonb, NOW(), $3::timestamptz)
      `, [LEGACY_SYMBOL, minute.toISOString(), A1.toISOString()]);

      const activationPayload = JSON.stringify([{
        symbol: ACTIVATE_SYMBOL,
        assetClass: 'xstock_spot',
        exchange: 'kraken-equities',
        intervalBegin: minute.toISOString(),
        arrivedAt: A2.toISOString(),
        open: '2', high: '2', low: '2', close: '2', volume: '2',
        vwap: null, tradeCount: null, metadata: { schema_version: 1 },
        payloadHash: 'a'.repeat(64),
      }]);
      const activation = activationClient.query(`
        SELECT * FROM apply_xstock_bar_revision_events(
          $1::jsonb, gen_random_uuid(), 'xstock-bar-availability/v1'
        )
      `, [activationPayload]);

      await waitForDatabaseLock('bavail-activation-waiter');
      await legacyClient.query('COMMIT');
      const activationResult = await activation;
      expect(activationResult.rows).toHaveLength(1); // positive control: activation completed
      activationRevisionId = activationResult.rows[0].revision_id;
    } finally {
      await legacyClient.query('ROLLBACK').catch(() => undefined);
      await activationClient.query('ROLLBACK').catch(() => undefined);
      await legacyClient.end();
      await activationClient.end();
    }

    const [legacy] = await rows<{ winning_revision_id: string | null }>(db.execute(sql`
      SELECT winning_revision_id
      FROM xstock_spot_ohlc_1m
      WHERE symbol = ${LEGACY_SYMBOL}
    `));
    expect(legacy).toBeDefined(); // positive control: the migration-overlap write landed
    expect(legacy.winning_revision_id).toBeNull();

    const [activationState] = await rows<{ contract_active: boolean }>(db.execute(sql`
      SELECT contract_active FROM xstock_bar_clock_guard WHERE singleton = true
    `));
    expect(activationState.contract_active).toBe(true);
    await expect(db.execute(sql`
      UPDATE xstock_bar_clock_guard SET contract_active = false WHERE singleton = true
    `)).rejects.toThrow(/activation is one-way/);

    await expect(db.execute(sql`
      UPDATE xstock_spot_ohlc_1m
      SET close = 2, arrived_at = ${A2.toISOString()}::timestamptz
      WHERE symbol = ${LEGACY_SYMBOL}
    `)).rejects.toThrow(/did not rotate immutable winner revision/);
    await expect(db.execute(sql`
      INSERT INTO xstock_spot_ohlc_1m (
        symbol, asset_class, exchange, interval_begin, open, high, low, close,
        volume, metadata, captured_at, arrived_at
      ) VALUES (
        ${POST_ACTIVE_LEGACY_SYMBOL}, 'xstock_spot', 'kraken-equities', ${minute.toISOString()}::timestamptz,
        1, 1, 1, 1, 1, '{"schema_version":1}'::jsonb, NOW(), ${A2.toISOString()}::timestamptz
      )
    `)).rejects.toThrow(/missing immutable winner revision/);
  });

  it('takes certificate wall time only after acquiring the clock-guard lock', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    expect(activationRevisionId).toMatch(/^[0-9a-f-]{36}$/); // positive control: pending event exists

    const holder = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-certificate-holder',
    });
    const waiter = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-certificate-waiter',
    });
    await holder.connect();
    await waiter.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`
        SELECT last_observed_at
        FROM xstock_bar_clock_guard
        WHERE singleton = true
        FOR UPDATE
      `);
      const certificate = waiter.query(`
        SELECT * FROM certify_xstock_bar_revision_events(
          ARRAY[$1::uuid], 'xstock-bar-availability/v1'
        )
      `, [activationRevisionId]);
      await waitForDatabaseLock('bavail-certificate-waiter');
      const updated = await holder.query<{ last_observed_at: Date }>(`
        UPDATE xstock_bar_clock_guard
        SET last_observed_at = clock_timestamp()
        WHERE singleton = true
        RETURNING last_observed_at
      `);
      await holder.query('COMMIT');
      const certified = await certificate;
      expect(certified.rows).toHaveLength(1);
      expect(new Date(certified.rows[0].visible_by).getTime()).toBeGreaterThanOrEqual(
        new Date(updated.rows[0].last_observed_at).getTime(),
      );
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await waiter.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await waiter.end();
    }
  });

  it('takes read wall time only after acquiring the clock-guard lock', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const holder = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-clock-holder',
    });
    const waiter = new Client({
      connectionString: RAW_DB_URL,
      application_name: 'bavail-clock-waiter',
    });
    await holder.connect();
    await waiter.connect();
    try {
      await holder.query('BEGIN');
      await holder.query(`
        SELECT last_observed_at
        FROM xstock_bar_clock_guard
        WHERE singleton = true
        FOR UPDATE
      `);
      const observation = waiter.query(`
        SELECT * FROM observe_xstock_bar_read('xstock-bar-availability/v1')
      `);
      await waitForDatabaseLock('bavail-clock-waiter');
      const updated = await holder.query<{ last_observed_at: Date }>(`
        UPDATE xstock_bar_clock_guard
        SET last_observed_at = clock_timestamp()
        WHERE singleton = true
        RETURNING last_observed_at
      `);
      await holder.query('COMMIT');
      const observed = await observation;
      expect(observed.rows).toHaveLength(1); // positive control: the blocked observer resumed
      expect(new Date(observed.rows[0].read_observed_at).getTime()).toBeGreaterThanOrEqual(
        new Date(updated.rows[0].last_observed_at).getTime(),
      );
    } finally {
      await holder.query('ROLLBACK').catch(() => undefined);
      await waiter.query('ROLLBACK').catch(() => undefined);
      await holder.end();
      await waiter.end();
    }
  });

  it('commits one completion with the exact revision set and replays it idempotently', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const flushId = randomUUID();
    const flushBar = {
      ...bar('12', new Date()),
      symbol: FLUSH_SYMBOL,
      intervalBegin: new Date(Math.floor(Date.now() / 60_000) * 60_000),
    };
    const population = {
      flushId,
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
    };

    const first = await writeXstockProjectionAttempts([flushBar], population);
    const replay = await writeXstockProjectionAttempts([flushBar], population);
    expect(first.attempts).toHaveLength(1); // positive control: projection completed
    expect(first.certification).toBe('certified');
    expect(replay.certification).toBe('certified');
    expect(replay.attempts.map((attempt) => attempt.revisionId))
      .toEqual(first.attempts.map((attempt) => attempt.revisionId));
    expect(replay.certificates.map((certificate) => certificate.revisionId))
      .toEqual(first.certificates.map((certificate) => certificate.revisionId));

    const [evidence] = await rows<{
      admissions: string;
      completions: string;
      revision_ids: string[];
      linked_events: string;
    }>(db.execute(sql`
      SELECT
        (SELECT count(*)::text FROM xstock_bar_projection_flush_admission
          WHERE flush_id = ${flushId}::uuid) AS admissions,
        (SELECT count(*)::text FROM xstock_bar_projection_flush_completion
          WHERE flush_id = ${flushId}::uuid) AS completions,
        (SELECT revision_ids FROM xstock_bar_projection_flush_completion
          WHERE flush_id = ${flushId}::uuid) AS revision_ids,
        (SELECT count(e.revision_id)::text
           FROM xstock_bar_projection_flush_completion c
           CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
           JOIN xstock_bar_revision_event e ON e.revision_id = saved.revision_id
          WHERE c.flush_id = ${flushId}::uuid) AS linked_events
    `));
    expect(evidence).toMatchObject({ admissions: '1', completions: '1', linked_events: '1' });
    expect(evidence.revision_ids).toEqual([first.attempts[0].revisionId]);
  });

  it('rejects same-count changed payloads before and after completion', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const original = {
      ...bar('12', new Date()),
      symbol: FLUSH_SYMBOL,
      intervalBegin: new Date(Math.floor(Date.now() / 60_000) * 60_000),
    };
    const changed = { ...original, close: '13' };

    const beforeCompletionId = randomUUID();
    await db.execute(sql`
      SELECT admit_xstock_bar_projection_flush(
        ${beforeCompletionId}::uuid,
        ${XSTOCK_BAR_WRITER_BOOT_ID}::uuid,
        ${XSTOCK_BAR_WRITER_BUILD_SHA},
        'xstock-bar-availability/v1',
        1,
        0,
        1,
        ${xstockProjectionPayloadJson([original])}::jsonb
      )
    `);
    await expect(writeXstockProjectionAttempts([changed], {
      flushId: beforeCompletionId,
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
    })).rejects.toThrow(/admission replay does not match original population/);

    const afterCompletionId = randomUUID();
    await writeXstockProjectionAttempts([original], {
      flushId: afterCompletionId,
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
    });
    await expect(writeXstockProjectionAttempts([changed], {
      flushId: afterCompletionId,
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
    })).rejects.toThrow(/admission replay does not match original population/);
  });

  it('retains an orphan admission when projection cannot complete and keeps evidence append-only', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const flushId = randomUUID();
    const writerBootId = randomUUID();
    await db.execute(sql`
      SELECT admit_xstock_bar_projection_flush(
        ${flushId}::uuid,
        ${writerBootId}::uuid,
        'non-production',
        'xstock-bar-availability/v1',
        1,
        0,
        1,
        ${xstockProjectionPayloadJson([{
          ...bar('15', new Date()),
          symbol: FLUSH_SYMBOL,
        }])}::jsonb
      )
    `);
    await expect(db.execute(sql`
      SELECT * FROM apply_xstock_bar_revision_flush(
        '[]'::jsonb,
        ${writerBootId}::uuid,
        'non-production',
        'xstock-bar-availability/v1',
        ${flushId}::uuid
      )
    `)).rejects.toThrow(/does not match durable admission/);

    const [orphan] = await rows<{ admissions: string; completions: string }>(db.execute(sql`
      SELECT count(a.flush_id)::text AS admissions,
             count(c.flush_id)::text AS completions
      FROM xstock_bar_projection_flush_admission a
      LEFT JOIN xstock_bar_projection_flush_completion c USING (flush_id)
      WHERE a.flush_id = ${flushId}::uuid
    `));
    expect(orphan).toEqual({ admissions: '1', completions: '0' });
    await expect(db.execute(sql`
      UPDATE xstock_bar_projection_flush_admission
      SET accepted_input_frames = 2
      WHERE flush_id = ${flushId}::uuid
    `)).rejects.toThrow(/append-only/);
  });

  it('persists one append-only handoff and prevents a forked successor chain', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const firstBoot = randomUUID();
    const secondBoot = randomUUID();
    const forkedBoot = randomUUID();
    const firstBuild = 'a'.repeat(40);
    const secondBuild = 'b'.repeat(40);
    await db.execute(sql`
      INSERT INTO xstock_bar_writer_boot_start (
        boot_id, predecessor_boot_id, writer_build_sha, contract_version
      ) VALUES (
        ${firstBoot}::uuid, NULL, ${firstBuild}, 'xstock-bar-availability/v1'
      )
    `);
    await db.execute(sql`
      INSERT INTO xstock_bar_writer_handoff (
        boot_id, writer_build_sha, contract_version,
        accepted_input_frames, buffer_superseded, projection_attempts,
        repeated_payload_attempts, applied_winners, rejected_older_arrivals,
        admission_flushes, completion_flushes
      ) VALUES (
        ${firstBoot}::uuid, ${firstBuild}, 'xstock-bar-availability/v1',
        0, 0, 0, 0, 0, 0, 0, 0
      )
    `);
    await db.execute(sql`
      INSERT INTO xstock_bar_writer_boot_start (
        boot_id, predecessor_boot_id, writer_build_sha, contract_version
      ) VALUES (
        ${secondBoot}::uuid, ${firstBoot}::uuid, ${secondBuild},
        'xstock-bar-availability/v1'
      )
    `);

    const [chain] = await rows<{
      starts: string;
      handoffs: string;
      second_predecessor: string;
    }>(db.execute(sql`
      SELECT
        (SELECT count(*)::text FROM xstock_bar_writer_boot_start
          WHERE boot_id IN (${firstBoot}::uuid, ${secondBoot}::uuid)) AS starts,
        (SELECT count(*)::text FROM xstock_bar_writer_handoff
          WHERE boot_id = ${firstBoot}::uuid) AS handoffs,
        (SELECT predecessor_boot_id::text FROM xstock_bar_writer_boot_start
          WHERE boot_id = ${secondBoot}::uuid) AS second_predecessor
    `));
    expect(chain).toEqual({
      starts: '2',
      handoffs: '1',
      second_predecessor: firstBoot,
    });

    await expect(db.execute(sql`
      INSERT INTO xstock_bar_writer_boot_start (
        boot_id, predecessor_boot_id, writer_build_sha, contract_version
      ) VALUES (
        ${forkedBoot}::uuid, ${firstBoot}::uuid, ${secondBuild},
        'xstock-bar-availability/v1'
      )
    `)).rejects.toThrow();
    await expect(db.execute(sql`
      UPDATE xstock_bar_writer_handoff
      SET admission_flushes = 1, completion_flushes = 1
      WHERE boot_id = ${firstBoot}::uuid
    `)).rejects.toThrow(/append-only/);
  });

  it('includes the boundary-active boot even when only its successor admits window data', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const client = new Client({ connectionString: RAW_DB_URL });
    const boundaryBoot = randomUUID();
    const contributingBoot = randomUUID();
    const flushId = randomUUID();
    const revisionId = randomUUID();
    const populationHash = '0'.repeat(64);
    const boundary = new Date('2099-01-02T00:00:00.000Z');
    const observedAt = new Date('2099-01-02T00:05:00.000Z');
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO xstock_bar_writer_boot_start (
          boot_id, predecessor_boot_id, writer_build_sha, contract_version, started_at
        ) VALUES
          ($1::uuid, NULL, $3, 'xstock-bar-availability/v1', $5::timestamptz - interval '1 minute'),
          ($2::uuid, $1::uuid, $4, 'xstock-bar-availability/v1', $5::timestamptz + interval '30 seconds')
      `, [boundaryBoot, contributingBoot, 'a'.repeat(40), 'b'.repeat(40), boundary.toISOString()]);
      await client.query(`
        INSERT INTO xstock_bar_projection_flush_admission (
          flush_id, writer_boot_id, writer_build_sha, contract_version,
          accepted_input_frames, buffer_superseded, expected_projection_attempts,
          population_hash, admitted_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, 'xstock-bar-availability/v1',
          1, 0, 1, $4, $5::timestamptz + interval '45 seconds'
        )
      `, [flushId, contributingBoot, 'b'.repeat(40), populationHash, boundary.toISOString()]);
      await client.query(`
        INSERT INTO xstock_bar_projection_flush_completion (
          flush_id, writer_boot_id, writer_build_sha, contract_version,
          accepted_input_frames, buffer_superseded, projection_attempts,
          repeated_payload_attempts, applied_winners, rejected_older_arrivals,
          revision_ids, population_hash, completed_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, 'xstock-bar-availability/v1',
          1, 0, 1, 0, 1, 0, ARRAY[$4::uuid], $5,
          $6::timestamptz + interval '46 seconds'
        )
      `, [flushId, contributingBoot, 'b'.repeat(40), revisionId, populationHash, boundary.toISOString()]);

      const result = await client.query(
        XSTOCK_WRITER_BOOT_CHAIN_SQL,
        [boundary, observedAt],
      );
      const chain = result.rows[0];
      expect(chain.boundary_boot_rows).toBe('1');
      expect(chain.boot_start_rows).toBe('2');
      expect(chain.required_handoffs).toBe('1');
      expect(chain.clean_handoffs).toBe('0');
      expect(chain.latest_boot_open).toBe('1');
      expect(chain.boot_build_shas).toEqual(['a'.repeat(40), 'b'.repeat(40)]);
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });

  it('rejects a contributing writer outside the boundary-anchored chain', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    const client = new Client({ connectionString: RAW_DB_URL });
    const outsideBoot = randomUUID();
    const boundaryBoot = randomUUID();
    const flushId = randomUUID();
    const revisionId = randomUUID();
    const populationHash = '1'.repeat(64);
    const boundary = new Date('2099-01-03T00:00:00.000Z');
    const observedAt = new Date('2099-01-03T00:05:00.000Z');
    await client.connect();
    try {
      await client.query('BEGIN');
      await client.query(`
        INSERT INTO xstock_bar_writer_boot_start (
          boot_id, predecessor_boot_id, writer_build_sha, contract_version, started_at
        ) VALUES
          ($1::uuid, NULL, $3, 'xstock-bar-availability/v1', $5::timestamptz - interval '2 minutes'),
          ($2::uuid, $1::uuid, $4, 'xstock-bar-availability/v1', $5::timestamptz - interval '1 minute')
      `, [outsideBoot, boundaryBoot, 'a'.repeat(40), 'b'.repeat(40), boundary.toISOString()]);
      await client.query(`
        INSERT INTO xstock_bar_projection_flush_admission (
          flush_id, writer_boot_id, writer_build_sha, contract_version,
          accepted_input_frames, buffer_superseded, expected_projection_attempts,
          population_hash, admitted_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, 'xstock-bar-availability/v1',
          1, 0, 1, $4, $5::timestamptz + interval '45 seconds'
        )
      `, [flushId, outsideBoot, 'a'.repeat(40), populationHash, boundary.toISOString()]);
      await client.query(`
        INSERT INTO xstock_bar_projection_flush_completion (
          flush_id, writer_boot_id, writer_build_sha, contract_version,
          accepted_input_frames, buffer_superseded, projection_attempts,
          repeated_payload_attempts, applied_winners, rejected_older_arrivals,
          revision_ids, population_hash, completed_at
        ) VALUES (
          $1::uuid, $2::uuid, $3, 'xstock-bar-availability/v1',
          1, 0, 1, 0, 1, 0, ARRAY[$4::uuid], $5,
          $6::timestamptz + interval '46 seconds'
        )
      `, [flushId, outsideBoot, 'a'.repeat(40), revisionId, populationHash, boundary.toISOString()]);

      const result = await client.query(
        XSTOCK_WRITER_BOOT_CHAIN_SQL,
        [boundary, observedAt],
      );
      const chain = result.rows[0];
      expect(chain.boundary_boot_rows).toBe('1');
      expect(chain.boot_start_rows).toBe('1');
      expect(chain.required_handoffs).toBe('0');
      expect(chain.clean_handoffs).toBe('0');
      expect(chain.contributing_boots_without_start).toBe('0');
      expect(chain.contributing_boots_outside_chain).toBe('1');
      expect(chain.latest_boot_open).toBe('1');
    } finally {
      await client.query('ROLLBACK').catch(() => {});
      await client.end();
    }
  });

  it('X@A1 -> identical X@A3 -> changed Y@A2 preserves the exact winner chain', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();

    // Advance the certificate/read sequence well beyond any retired independent
    // read-sequence value. A later read must still order after its source cert.
    await db.execute(sql`SELECT nextval('xstock_bar_visible_seq') FROM generate_series(1, 25)`);

    await upsertOhlcRows('xstock_spot', [bar('10', A1)]);
    await upsertOhlcRows('xstock_spot', [bar('10', A3)]);
    await upsertOhlcRows('xstock_spot', [bar('99', A2)]);

    const events = await rows<{
      revision_id: string;
      arrived_at: Date;
      close: string;
      projection_applied: boolean;
      projection_generation: string | null;
      supersedes_revision_id: string | null;
      observed_winner_revision_id: string | null;
      payload_hash: string;
      payload_repeated_from_winner: boolean;
      visible_by: Date | null;
      visible_seq: string | null;
      certificate_primary_identity: string | null;
    }>(db.execute(sql`
      SELECT revision_id, arrived_at, close::text, projection_applied,
             projection_generation::text, supersedes_revision_id,
             observed_winner_revision_id, payload_hash,
             payload_repeated_from_winner, visible_by, visible_seq::text,
             certificate_primary_identity
      FROM xstock_bar_revision_event
      WHERE symbol = ${SYMBOL}
      ORDER BY arrived_at ASC
    `));
    expect(events).toHaveLength(3); // positive control: the instrument sees all attempts

    const [first, rejected, identicalLater] = events;
    expect(new Set(events.map((event) => event.revision_id)).size).toBe(3);
    expect(first.projection_applied).toBe(true);
    expect(first.projection_generation).toBe('1');
    expect(first.payload_repeated_from_winner).toBe(false);

    expect(identicalLater.projection_applied).toBe(true);
    expect(identicalLater.projection_generation).toBe('2');
    expect(identicalLater.supersedes_revision_id).toBe(first.revision_id);
    expect(identicalLater.payload_hash).toBe(first.payload_hash);
    expect(identicalLater.payload_repeated_from_winner).toBe(true);

    expect(rejected.close).toBe('99.00000000');
    expect(rejected.projection_applied).toBe(false);
    expect(rejected.projection_generation).toBeNull();
    expect(rejected.observed_winner_revision_id).toBe(identicalLater.revision_id);

    for (const event of events) {
      expect(event.visible_by).not.toBeNull();
      expect(Number(event.visible_seq)).toBeGreaterThan(0);
    }
    const certificatePrimaryIdentities = new Set(
      events.map((event) => event.certificate_primary_identity),
    );
    expect(certificatePrimaryIdentities.size).toBe(1);
    expect([...certificatePrimaryIdentities][0]).toMatch(/\/system:\d+$/);

    const [projection] = await rows<{
      close: string;
      arrived_at: Date;
      projection_generation: string;
      winning_revision_id: string;
    }>(db.execute(sql`
      SELECT close::text, arrived_at, projection_generation::text, winning_revision_id
      FROM xstock_spot_ohlc_1m
      WHERE symbol = ${SYMBOL} AND interval_begin = ${minute.toISOString()}::timestamptz
    `));
    expect(projection.close).toBe('10.00000000');
    expect(new Date(projection.arrived_at).getTime()).toBe(A3.getTime());
    expect(projection.projection_generation).toBe('2');
    expect(projection.winning_revision_id).toBe(identicalLater.revision_id);

    const aggregateResult = await aggregateAvailableXstockOHLC([SYMBOL], 15, 6);
    const [aggregate] = aggregateResult.get(SYMBOL) ?? [];
    expect(aggregate.eligibilityState).toBe('eligible_certified');
    expect(aggregate.aggregateRevisionId).not.toBeNull();
    expect(aggregate.sourceRevisionIds).toEqual([identicalLater.revision_id]);
    expect(aggregate.sourceMaxVisibleSeq).toBeGreaterThan(0);
    expect(aggregate.readObservedSeq).toBeGreaterThan(0);
    expect(aggregate.readObservedSeq).toBeGreaterThan(aggregate.sourceMaxVisibleSeq!);
    expect(Date.parse(aggregate.readObservedAt!)).toBeGreaterThanOrEqual(
      Date.parse(aggregate.sourceMaxVisibleBy!),
    );
    expect(aggregate.certificatePrimaryIdentity).toBe([...certificatePrimaryIdentities][0]);

    const [persistedAggregate] = await rows<{
      aggregate_revision_id: string;
      source_revision_ids: string[];
      canonical_payload: Record<string, unknown>;
      certificate_primary_identity: string;
    }>(db.execute(sql`
      SELECT aggregate_revision_id, source_revision_ids, canonical_payload,
             certificate_primary_identity
      FROM xstock_bar_aggregate_revision
      WHERE aggregate_revision_id = ${aggregate.aggregateRevisionId}::uuid
        AND bucket_ts = ${new Date(aggregate.timestamp).toISOString()}::timestamptz
    `));
    expect(persistedAggregate.aggregate_revision_id).toBe(aggregate.aggregateRevisionId);
    expect(persistedAggregate.source_revision_ids).toEqual([identicalLater.revision_id]);
    expect(persistedAggregate.certificate_primary_identity).toBe(
      aggregate.certificatePrimaryIdentity,
    );
    expect(persistedAggregate.canonical_payload).toMatchObject({
      symbol: SYMBOL,
      intervalMinutes: 15,
      sourceRevisionIds: [identicalLater.revision_id],
    });

    await db.execute(sql`
      INSERT INTO xstock_spot_ohlc_15m_snapshot (
        symbol, bucket_ts, open, high, low, close, volume, source_bar_count,
        aggregate_revision_id, aggregate_hash, source_revision_set_hash,
        source_max_visible_by, source_max_visible_seq, read_observed_at,
        read_observed_seq, certificate_primary_identity,
        availability_contract_version, eligibility_state
      ) VALUES (
        ${SYMBOL}, ${new Date(aggregate.timestamp).toISOString()}::timestamptz,
        ${aggregate.open}, ${aggregate.high}, ${aggregate.low}, ${aggregate.close},
        ${aggregate.volume}, ${aggregate.sourceBarCount},
        ${aggregate.aggregateRevisionId}::uuid, ${aggregate.aggregateHash},
        ${aggregate.sourceRevisionSetHash}, ${aggregate.sourceMaxVisibleBy}::timestamptz,
        ${aggregate.sourceMaxVisibleSeq}, ${aggregate.readObservedAt}::timestamptz,
        ${aggregate.readObservedSeq}, ${aggregate.certificatePrimaryIdentity},
        ${aggregate.contractVersion}, ${aggregate.eligibilityState}
      )
    `);
    const [snapshot] = await rows<{ aggregate_revision_id: string; close: string }>(db.execute(sql`
      SELECT aggregate_revision_id, close::text
      FROM xstock_spot_ohlc_15m_snapshot
      WHERE symbol = ${SYMBOL} AND bucket_ts = ${new Date(aggregate.timestamp).toISOString()}::timestamptz
    `));
    expect(snapshot.aggregate_revision_id).toBe(aggregate.aggregateRevisionId);
    expect(snapshot.close).toBe('10.00000000');
    await expect(db.execute(sql`
      UPDATE xstock_spot_ohlc_15m_snapshot
      SET close = 999
      WHERE symbol = ${SYMBOL} AND bucket_ts = ${new Date(aggregate.timestamp).toISOString()}::timestamptz
    `)).rejects.toThrow(/without rotating aggregate revision/);

    const manifest = await persistSettledXstockWindowManifest([aggregate]);
    expect(manifest.aggregateRevisionIds).toEqual([aggregate.aggregateRevisionId]);
    const [persistedManifest] = await rows<{
      manifest_id: string;
      window_hash: string;
      aggregate_revision_ids: string[];
      certificate_primary_identity: string;
    }>(db.execute(sql`
      SELECT manifest_id, window_hash, aggregate_revision_ids,
             certificate_primary_identity
      FROM xstock_bar_window_manifest
      WHERE manifest_id = ${manifest.manifestId}::uuid
    `));
    expect(persistedManifest.window_hash).toBe(manifest.windowHash);
    expect(persistedManifest.aggregate_revision_ids).toEqual([aggregate.aggregateRevisionId]);
    expect(persistedManifest.certificate_primary_identity).toBe(
      aggregate.certificatePrimaryIdentity,
    );
  });
});
