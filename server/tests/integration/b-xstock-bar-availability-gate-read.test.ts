/**
 * B-XSTOCK-BAR-AVAILABILITY Step 9 C6 (design r8, Langston-ruled 2026-11-20) - real PostgreSQL
 * proof that the CHUNKED gate read equals the gate's original SINGLE-SHOT read.
 *
 * The oracle queries below are the pre-C6 production SQL (population, unlinked, sessions), minus
 * the lag percentiles and two session text columns no check reads. The fixture covers what Langston named:
 *  - two whole UTC days and a PARTIAL trailing day ending at observedAt (C6-4);
 *  - a linked event arriving OUTSIDE its chunk's arrived_at bound, found by the exactness
 *    pass (C6-5);
 *  - an unlinked event;
 *  - a DUPLICATE EVENT ROW across two partitions (same revision_id, different arrived_at),
 *    not a repeated id in a completion array (C6-1).
 * The window is a random Monday-anchored week in the far future so reruns on a kept test
 * database do not collide with earlier fixtures (admission/completion rows are append-only).
 */
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import pg from 'pg';
import { createHash, randomUUID } from 'node:crypto';
import {
  readIdentity,
  readPopulationChunked,
  readSessionsChunked,
  readUnlinkedChunked,
  reconstructDistinctCounts,
  startBudget,
} from '../../scripts/b-xstock-bar-availability-gate-read.js';

const RAW_DB_URL = process.env.DATABASE_URL ?? '';
const isTestDb = /^postgres(ql)?:\/\/[^@]*@(localhost|127\.0\.0\.1|postgres)(:\d+)?\/test(\?|$)/.test(RAW_DB_URL);
const IS_CI = !!process.env.CI;
const TAG = 'B-XSTOCK-BAR-AVAILABILITY-GATE-READ';
const { Client } = pg;
const DAY = 86_400_000;
const HOUR = 3_600_000;
const BUILD = 'c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6c6';
const CONTRACT = 'xstock-bar-availability/v1';

// A random Monday 00:00Z in 2032-2039 (2032-01-05 is a Monday).
const BASE = new Date(Date.UTC(2032, 0, 5) + Math.floor(Math.random() * 400) * 7 * DAY);
const WINDOW_START = BASE;
const OBSERVED_AT = new Date(BASE.getTime() + 2 * DAY + 6 * HOUR); // partial third day
const SEQ_BASE = 9_000_000_000_000 + Math.floor(Math.random() * 1_000_000) * 1_000;
let seq = 0;
let dbReachable = true;
const writer = new Client({ connectionString: RAW_DB_URL, application_name: 'bavail-gate-read-writer' });

const hex64 = (s: string) => createHash('sha256').update(s).digest('hex');
const at = (offsetMs: number) => new Date(BASE.getTime() + offsetMs);

async function ensurePartition(day: Date): Promise<void> {
  const d = day.toISOString().slice(0, 10);
  const next = new Date(day.getTime() + DAY).toISOString().slice(0, 10);
  await writer.query(
    `CREATE TABLE IF NOT EXISTS ${'xstock_bar_revision_event_' + d.replaceAll('-', '_')}
       PARTITION OF xstock_bar_revision_event FOR VALUES FROM ('${d}') TO ('${next}')`,
  );
}

async function insertEvent(revisionId: string, symbol: string, arrivedAt: Date, createdAt: Date): Promise<void> {
  seq += 1;
  await writer.query(
    `INSERT INTO xstock_bar_revision_event (
       revision_id, arrived_at, symbol, interval_begin, asset_class, exchange,
       open, high, low, close, volume, payload_hash, writer_boot_id, contract_version,
       projection_applied, projection_generation, payload_repeated_from_winner,
       visible_by, visible_seq, certificate_primary_identity, certificate_clock_healthy, created_at
     ) VALUES ($1,$2,$3,$4,'xstock_spot','kraken-equities',10,11,9,10,100,$5,$6,$7,
               true,1,false,$8,$9,'primary',true,$10)`,
    [revisionId, arrivedAt, symbol, new Date(Math.floor(arrivedAt.getTime() / 60_000) * 60_000),
      hex64(revisionId), randomUUID(), CONTRACT, new Date(createdAt.getTime() + 500), SEQ_BASE + seq, createdAt],
  );
}

async function insertFlush(admittedAt: Date, revisionIds: string[]): Promise<void> {
  const flushId = randomUUID();
  const bootId = randomUUID();
  const hash = hex64(flushId);
  const k = revisionIds.length;
  await writer.query(
    `INSERT INTO xstock_bar_projection_flush_admission (
       flush_id, writer_boot_id, writer_build_sha, contract_version, accepted_input_frames,
       buffer_superseded, expected_projection_attempts, population_hash, admitted_at
     ) VALUES ($1,$2,$3,$4,$5,0,$5,$6,$7)`,
    [flushId, bootId, BUILD, CONTRACT, k, hash, admittedAt],
  );
  await writer.query(
    `INSERT INTO xstock_bar_projection_flush_completion (
       flush_id, writer_boot_id, writer_build_sha, contract_version, accepted_input_frames,
       buffer_superseded, projection_attempts, repeated_payload_attempts, applied_winners,
       rejected_older_arrivals, revision_ids, population_hash, completed_at
     ) VALUES ($1,$2,$3,$4,$5,0,$5,0,$5,0,$6::uuid[],$7,$8)`,
    [flushId, bootId, BUILD, CONTRACT, k, revisionIds, hash, new Date(admittedAt.getTime() + 1_000)],
  );
}

// ── The pre-C6 single-shot production SQL (the oracle), minus the lag percentiles and two session text columns ──
const ORACLE_POPULATION_SQL = `WITH admitted AS (
         SELECT flush_id
         FROM xstock_bar_projection_flush_admission
         WHERE admitted_at >= $1 AND admitted_at < $2
       ), linked AS (
         SELECT a.flush_id, saved.revision_id
         FROM admitted a
         JOIN xstock_bar_projection_flush_completion c USING (flush_id)
         CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
       )
       SELECT count(*)::bigint AS expected_revision_links,
              count(e.revision_id)::bigint AS revision_events,
              count(*) FILTER (WHERE e.revision_id IS NULL)::bigint AS missing_linked_revision_events,
              count(DISTINCT e.symbol)::bigint AS symbols,
              count(DISTINCT e.revision_id)::bigint AS distinct_revision_ids,
              count(DISTINCT e.visible_seq)::bigint AS distinct_visible_seqs,
              count(*) FILTER (WHERE e.projection_applied)::bigint AS applied_winners,
              count(*) FILTER (WHERE NOT e.projection_applied)::bigint AS rejected_older_arrivals,
              count(*) FILTER (WHERE e.payload_repeated_from_winner)::bigint AS repeated_payload_attempts,
              count(*) FILTER (WHERE e.revision_id IS NOT NULL AND e.visible_by IS NULL)::bigint AS pending_certificates,
              count(*) FILTER (WHERE e.visible_by IS NOT NULL
                                AND e.certificate_clock_healthy IS DISTINCT FROM true)::bigint
                AS unhealthy_certificates,
              count(*) FILTER (WHERE e.visible_by < e.created_at)::bigint AS negative_certificate_lags
         FROM linked l
         LEFT JOIN xstock_bar_revision_event e ON e.revision_id = l.revision_id`;

const ORACLE_UNLINKED_SQL = `WITH completed_ids AS MATERIALIZED (
         SELECT saved.revision_id
         FROM xstock_bar_projection_flush_completion c
         CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
         WHERE c.completed_at < $2
       )
       SELECT count(*) FILTER (WHERE linked.revision_id IS NULL)::bigint
                AS unlinked_revision_events
       FROM xstock_bar_revision_event e
       LEFT JOIN completed_ids linked USING (revision_id)
       WHERE e.created_at >= $1 AND e.created_at < $2`;

const ORACLE_SESSIONS_SQL = `WITH graded_events AS MATERIALIZED (
         SELECT a.admitted_at AS evidence_at, e.symbol
         FROM xstock_bar_projection_flush_admission a
         JOIN xstock_bar_projection_flush_completion c USING (flush_id)
         CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
         JOIN xstock_bar_revision_event e ON e.revision_id = saved.revision_id
         WHERE a.admitted_at >= $1 AND a.admitted_at < $2
       ), et_days AS (
         SELECT d::date AS et_date
         FROM generate_series(
           (($1::timestamptz AT TIME ZONE 'America/New_York')::date - 1)::timestamp,
           (($2::timestamptz AT TIME ZONE 'America/New_York')::date + 1)::timestamp,
           interval '1 day'
         ) AS g(d)
       ), bounds AS (
         SELECT et_date,
                -- Step 9 R2': a Sunday session opens at the reopen's live minute, 20:15 ET (stated
                -- independently here, as a literal, so the oracle does not reuse the production constant).
                (et_date + CASE WHEN extract(isodow FROM et_date) = 7 THEN time '20:15' ELSE time '20:00' END)
                  AT TIME ZONE 'America/New_York' AS session_start,
                (et_date + 1 + time '20:00') AT TIME ZONE 'America/New_York' AS session_end
         FROM et_days
         WHERE extract(isodow FROM et_date) IN (7,1,2,3,4)
       )
       SELECT b.et_date::text,
              s.revision_events,
              s.symbols,
              s.first_event_at::text,
              s.last_event_at::text,
              s.max_event_gap_seconds
       FROM bounds b
       CROSS JOIN LATERAL (
         SELECT count(*)::bigint AS revision_events,
                count(DISTINCT symbol)::bigint AS symbols,
                min(evidence_at) AS first_event_at,
                max(evidence_at) AS last_event_at,
                max(extract(epoch FROM (evidence_at - previous_evidence_at))) AS max_event_gap_seconds
         FROM (
           SELECT evidence_at, symbol,
                  lag(evidence_at) OVER (ORDER BY evidence_at) AS previous_evidence_at
           FROM graded_events
           WHERE evidence_at >= b.session_start AND evidence_at < b.session_end
         ) events
       ) s
       WHERE b.session_start >= $1 AND b.session_end <= $2
       ORDER BY b.session_start`;

async function readBoth(): Promise<{
  oracle: Record<string, unknown>;
  oracleUnlinked: Record<string, unknown>;
  oracleSessions: Record<string, unknown>[];
  chunked: Awaited<ReturnType<typeof readPopulationChunked>>;
  unlinked: Awaited<ReturnType<typeof readUnlinkedChunked>>;
  sessions: Awaited<ReturnType<typeof readSessionsChunked>>;
  distinct: ReturnType<typeof reconstructDistinctCounts>;
}> {
  const reader = new Client({ connectionString: RAW_DB_URL, application_name: 'bavail-gate-read-reader' });
  await reader.connect();
  try {
    await reader.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
    const budget = startBudget();
    const oracle = (await reader.query(ORACLE_POPULATION_SQL, [WINDOW_START, OBSERVED_AT])).rows[0];
    const oracleUnlinked = (await reader.query(ORACLE_UNLINKED_SQL, [WINDOW_START, OBSERVED_AT])).rows[0];
    const oracleSessions = (await reader.query(ORACLE_SESSIONS_SQL, [WINDOW_START, OBSERVED_AT])).rows;
    const chunked = await readPopulationChunked(reader, budget, WINDOW_START, OBSERVED_AT);
    const unlinked = await readUnlinkedChunked(reader, budget, WINDOW_START, OBSERVED_AT);
    const identity = await readIdentity(reader, budget, WINDOW_START, OBSERVED_AT);
    const sessions = await readSessionsChunked(reader, budget, WINDOW_START, OBSERVED_AT, chunked.outOfBoundIds);
    await reader.query('COMMIT');
    return { oracle, oracleUnlinked, oracleSessions, chunked, unlinked, sessions,
      distinct: reconstructDistinctCounts(chunked, identity) };
  } finally {
    await reader.end();
  }
}

const ids = Array.from({ length: 8 }, () => randomUUID());

beforeAll(async () => {
  try {
    await writer.connect();
    await writer.query('SELECT 1');
  } catch (error) {
    if (IS_CI) throw new Error(`[${TAG}] PostgreSQL unreachable in CI: ${error instanceof Error ? error.message : error}`);
    dbReachable = false;
    return;
  }
  if (!isTestDb) return;
  for (let d = -1; d <= 3; d++) await ensurePartition(at(d * DAY));
  // Day 1 (whole): one flush, two events inside the bound.
  await insertFlush(at(10 * HOUR), [ids[0], ids[1]]);
  await insertEvent(ids[0], 'GRA/USD', at(10 * HOUR), at(10 * HOUR));
  await insertEvent(ids[1], 'GRB/USD', at(10 * HOUR + 1_000), at(10 * HOUR + 1_000));
  // Day 2 (whole): one flush late in the day; ids[3] ARRIVES 2 h after the day ends, outside
  // the chunk's [-1 h, +1 h] arrived_at bound, so only the exactness pass can find it.
  await insertFlush(at(DAY + 23 * HOUR + 30 * 60_000), [ids[2], ids[3]]);
  await insertEvent(ids[2], 'GRA/USD', at(DAY + 23 * HOUR + 30 * 60_000), at(DAY + 23 * HOUR + 30 * 60_000));
  await insertEvent(ids[3], 'GRC/USD', at(2 * DAY + 2 * HOUR), at(DAY + 23 * HOUR + 31 * 60_000));
  // Day 2: an UNLINKED event (no completion names it).
  await insertEvent(ids[6], 'GRD/USD', at(DAY + 5 * HOUR), at(DAY + 5 * HOUR));
  // Day 3 (partial, ends at OBSERVED_AT = +6 h): one flush at +5 h.
  await insertFlush(at(2 * DAY + 5 * HOUR), [ids[4]]);
  await insertEvent(ids[4], 'GRB/USD', at(2 * DAY + 5 * HOUR), at(2 * DAY + 5 * HOUR));
});

afterAll(async () => {
  if (dbReachable && isTestDb) {
    await writer.query('BEGIN');
    await writer.query(`SELECT set_config('dawntrader.archive_mode', 'on', true)`);
    await writer.query('DELETE FROM xstock_bar_revision_event WHERE revision_id = ANY($1::uuid[])', [ids]);
    await writer.query('COMMIT');
  }
  if (dbReachable) await writer.end();
});

describe(TAG, () => {
  it('runs only against the isolated test database', () => {
    if (IS_CI) expect(isTestDb).toBe(true);
  });

  it('the chunked read equals the single-shot read, including the out-of-bound arrival and the partial trailing day', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const r = await readBoth();
    expect(r.chunked.expectedRevisionLinks).toBe(Number(r.oracle.expected_revision_links));
    expect(r.chunked.revisionEvents).toBe(Number(r.oracle.revision_events));
    expect(r.chunked.missingLinkedRevisionEvents).toBe(Number(r.oracle.missing_linked_revision_events));
    expect(r.chunked.symbols.size).toBe(Number(r.oracle.symbols));
    expect(r.chunked.appliedWinners).toBe(Number(r.oracle.applied_winners));
    expect(r.chunked.rejectedOlderArrivals).toBe(Number(r.oracle.rejected_older_arrivals));
    expect(r.chunked.repeatedPayloadAttempts).toBe(Number(r.oracle.repeated_payload_attempts));
    expect(r.chunked.pendingCertificates).toBe(Number(r.oracle.pending_certificates));
    expect(r.chunked.unhealthyCertificates).toBe(Number(r.oracle.unhealthy_certificates));
    expect(r.chunked.negativeCertificateLags).toBe(Number(r.oracle.negative_certificate_lags));
    expect(r.distinct.distinctRevisionIds).toBe(Number(r.oracle.distinct_revision_ids));
    expect(r.distinct.distinctVisibleSeqs).toBe(Number(r.oracle.distinct_visible_seqs));
    expect(r.unlinked.unlinkedRevisionEvents).toBe(Number(r.oracleUnlinked.unlinked_revision_events));
    // The fixture's own facts, so an empty read cannot pass by matching an empty oracle.
    expect(r.chunked.expectedRevisionLinks).toBeGreaterThanOrEqual(5);
    expect(r.chunked.boundMisses).toBeGreaterThanOrEqual(1);
    expect(r.chunked.outOfBoundIds).toContain(ids[3]);
    expect(r.unlinked.unlinkedRevisionEvents).toBeGreaterThanOrEqual(1);
    expect(r.chunked.perDay.at(-1)?.partial).toBe(true);
    expect(r.chunked.perDay.at(-1)?.chunkEnd).toBe(OBSERVED_AT.toISOString());
    // Sessions: every session the oracle reports, the chunked read reports identically.
    expect(r.sessions.map((s) => s.et_date)).toEqual(r.oracleSessions.map((s) => String(s.et_date)));
    r.oracleSessions.forEach((o, i) => {
      expect(r.sessions[i].revision_events).toBe(Number(o.revision_events));
      expect(r.sessions[i].symbols).toBe(Number(o.symbols));
      expect(r.sessions[i].max_event_gap_seconds).toBe(o.max_event_gap_seconds === null ? null : Number(o.max_event_gap_seconds));
    });
  });

  it('a Sunday session opens at 20:15 ET (the reopen goes live then); a Monday session at 20:00 ET (Step 9 R2 prime)', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    const r = await readBoth();
    const et = (iso: string) => {
      const parts = new Intl.DateTimeFormat('en-US', {
        timeZone: 'America/New_York', weekday: 'short', hour: '2-digit', minute: '2-digit', hourCycle: 'h23',
      }).formatToParts(new Date(iso));
      const get = (t: string) => parts.find((p) => p.type === t)?.value;
      return `${get('weekday')} ${get('hour')}:${get('minute')}`;
    };
    // The window is Monday 00:00Z to Wednesday 06:00Z: exactly the Sunday and Monday sessions fit, in EST or EDT.
    expect(r.sessions.map((s) => et(s.session_start))).toEqual(['Sun 20:15', 'Mon 20:00']);
    expect(r.sessions.map((s) => et(s.session_end))).toEqual(['Mon 20:00', 'Tue 20:00']);
  });

  it('an id linked by TWO completions fails identity in both reads (IDENTITY_LINK_SQL; production has none, Langston 11-20)', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    // A second flush on day 1 names ids[0] again: one event row, two links.
    await insertFlush(at(11 * HOUR), [ids[0]]);
    const r = await readBoth();
    expect(Number(r.oracle.distinct_revision_ids)).toBeLessThan(Number(r.oracle.revision_events));
    expect(r.distinct.distinctRevisionIds).toBeLessThan(r.chunked.revisionEvents);
    expect(r.distinct.distinctVisibleSeqs === r.chunked.revisionEvents)
      .toBe(Number(r.oracle.distinct_visible_seqs) === Number(r.oracle.revision_events));
  });

  it('a duplicate EVENT ROW across two partitions fails identity exactly where the single-shot does', async (ctx) => {
    if (!dbReachable || !isTestDb) ctx.skip();
    // Same revision_id as ids[0] (day 1), a second row arriving on day 2 - schema-legal under
    // PRIMARY KEY (revision_id, arrived_at), and outside day 1's chunk bound.
    await insertEvent(ids[0], 'GRA/USD', at(DAY + 12 * HOUR), at(10 * HOUR));
    const r = await readBoth();
    const oracleEvents = Number(r.oracle.revision_events);
    // immutableIdentities: the single-shot fails it (the duplicate row joins twice) and so must the chunked read.
    expect(Number(r.oracle.distinct_revision_ids)).toBeLessThan(oracleEvents);
    expect(r.distinct.distinctRevisionIds).toBeLessThan(r.chunked.revisionEvents);
    // The visible_seq leg must reach the SAME boolean as the single-shot. Here the duplicate row carries its own
    // sequence number, so the single-shot's distinct seqs equal its events and that leg passes in both.
    expect(r.distinct.distinctVisibleSeqs === r.chunked.revisionEvents)
      .toBe(Number(r.oracle.distinct_visible_seqs) === oracleEvents);
    expect(r.chunked.revisionEvents).toBeGreaterThan(0);
  });
});
