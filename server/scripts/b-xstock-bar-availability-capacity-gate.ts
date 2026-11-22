/**
 * B-XSTOCK-BAR-AVAILABILITY P14 phase-2 capacity/quality gate.
 *
 * Read-only and rerunnable. Every database observation is taken under one
 * REPEATABLE READ READ ONLY snapshot. The heavy legs are read in day chunks under a server-side
 * time budget (C6, `b-xstock-bar-availability-gate-read.ts`). Usage:
 *
 *   npx tsx server/scripts/b-xstock-bar-availability-capacity-gate.ts \
 *     --window-start 2026-11-30T01:00:00Z --graded-ref <deployed-sha> \
 *     --reviewed-ref <every-contributing-deployed-sha>
 *
 * The command prints one JSON evidence object whose `verdict.state` is `pass`, `fail` or
 * `inconclusive`, and exits 0 / 2 / 3 respectively (1 = a fatal error before any verdict).
 * `inconclusive` means a statement was cancelled by the time budget or a lock timeout: the
 * gate's inputs are never built from a partial read, so it can never pass on one. Exit 1 (a
 * fatal error: bad arguments, an unreadable governed row, an unexpected database error) writes
 * no verdict JSON; a caller that grades a stored verdict must treat exit 1 as no verdict. It never
 * changes database or application state and cannot authorize the later consumer switch by
 * itself; Coltrane must independently verify the resulting evidence.
 */
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT } from '../services/data-archive/exact-archive-evidence.js';
import { DATA_LIFECYCLE_SCOPE_SQL, parseLifecycleNumber } from '../services/data-archive/hot-horizon.js';
import {
  GATE_READ_BUDGET,
  InconclusiveRead,
  budgetedQuery,
  readIdentity,
  readPopulationChunked,
  readSessionsChunked,
  readUnlinkedChunked,
  reconstructDistinctCounts,
  startBudget,
  summarizeTimings,
} from './b-xstock-bar-availability-gate-read.js';

const { Client } = pg;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const EIGHT_DAYS_MS = 8 * 86_400_000;
const EXPECTED_PLAN_CAP_MB = 204_800;
const EXPECTED_CRITICAL_THRESHOLD = 0.80;
const EXPECTED_VENUE_SESSION_MAX_GAP_SECONDS = 60;
// B-XSTOCK-BAR-AVAILABILITY R2' (2026-11-22): the second re-run window (Langston r6 ruling, 2026-11-20), moved
// one hour at the Step-4 send-back to Sunday 20:00 ET, the venue's week open, so the R7 runner reads it a day
// later and the 12-07 session counts (seven sessions, not six; pre-audit R2'). Moves TOGETHER with the governed row `graded_window_start` (migration
// 2026-11-22-b-xstock-bar-availability-window-r2prime.sql); the gate compares this literal against the row's
// Date.toISOString(), so it must stay in canonical millisecond form.
const EXPECTED_GRADED_WINDOW_START = '2026-11-30T01:00:00.000Z';
const EXPECTED_AVAILABILITY_CONTRACT = 'xstock-bar-availability/v1';
/** Exit codes: the verdict's three states, distinct from a fatal error (1). */
export const GATE_EXIT = { pass: 0, fatal: 1, fail: 2, inconclusive: 3 } as const;
/** The scope every gate module_constants lookup reads (carried item (a), C6). */
const WILDCARD_SCOPE_SQL = "asset_class='*' AND exchange='*' AND strategy='*' AND regime='*'";

// Exported so the integration fence executes the exact production query. The
// chain begins with the writer that was active at the observation boundary,
// even if that writer did not admit its first flush until after it died.
export const XSTOCK_WRITER_BOOT_CHAIN_SQL = `WITH contributing AS MATERIALIZED (
         SELECT DISTINCT a.writer_boot_id AS boot_id
         FROM xstock_bar_projection_flush_admission a
         WHERE a.admitted_at >= $1 AND a.admitted_at < $2
       ), latest_before_boundary AS MATERIALIZED (
         SELECT s.*
         FROM xstock_bar_writer_boot_start s
         WHERE s.started_at <= $1
         ORDER BY s.started_at DESC, s.boot_id DESC
         LIMIT 1
       ), boundary_boot AS MATERIALIZED (
         SELECT s.*
         FROM latest_before_boundary s
         LEFT JOIN xstock_bar_writer_handoff h USING (boot_id)
         WHERE h.handed_off_at IS NULL OR h.handed_off_at > $1
       ), chain_base AS MATERIALIZED (
         SELECT s.*
         FROM xstock_bar_writer_boot_start s
         CROSS JOIN boundary_boot b
         WHERE s.started_at >= b.started_at
           AND s.started_at < $2
       ), chain AS MATERIALIZED (
         SELECT b.*,
                lag(b.boot_id) OVER (ORDER BY b.started_at, b.boot_id) AS previous_boot_id,
                lead(b.boot_id) OVER (ORDER BY b.started_at, b.boot_id) AS next_boot_id,
                row_number() OVER (ORDER BY b.started_at DESC, b.boot_id DESC) AS newest_rank
         FROM chain_base b
       ), durable AS MATERIALIZED (
         SELECT a.writer_boot_id AS boot_id,
                count(a.flush_id)::bigint AS admission_flushes,
                count(c.flush_id)::bigint AS completion_flushes,
                COALESCE(sum(a.accepted_input_frames),0)::bigint AS accepted_input_frames,
                COALESCE(sum(a.buffer_superseded),0)::bigint AS buffer_superseded,
                COALESCE(sum(c.projection_attempts),0)::bigint AS projection_attempts,
                COALESCE(sum(c.repeated_payload_attempts),0)::bigint AS repeated_payload_attempts,
                COALESCE(sum(c.applied_winners),0)::bigint AS applied_winners,
                COALESCE(sum(c.rejected_older_arrivals),0)::bigint AS rejected_older_arrivals
         FROM xstock_bar_projection_flush_admission a
         LEFT JOIN xstock_bar_projection_flush_completion c USING (flush_id)
         GROUP BY a.writer_boot_id
       )
       SELECT
         (SELECT count(*)::bigint FROM boundary_boot) AS boundary_boot_rows,
         count(ch.boot_id)::bigint AS boot_start_rows,
         count(DISTINCT ch.boot_id)::bigint AS boot_distinct_ids,
         (SELECT count(*)::bigint
            FROM contributing c
            LEFT JOIN xstock_bar_writer_boot_start s USING (boot_id)
           WHERE s.boot_id IS NULL) AS contributing_boots_without_start,
         (SELECT count(*)::bigint
            FROM contributing c
            LEFT JOIN chain ch USING (boot_id)
           WHERE ch.boot_id IS NULL) AS contributing_boots_outside_chain,
         count(*) FILTER (WHERE ch.next_boot_id IS NOT NULL)::bigint AS required_handoffs,
         count(*) FILTER (
           WHERE ch.next_boot_id IS NOT NULL AND h.boot_id IS NOT NULL
         )::bigint AS clean_handoffs,
         count(*) FILTER (
           WHERE ch.previous_boot_id IS NOT NULL
             AND ch.predecessor_boot_id IS DISTINCT FROM ch.previous_boot_id
         )::bigint AS chain_breaks,
         count(*) FILTER (
           WHERE h.boot_id IS NOT NULL AND (
             h.writer_build_sha IS DISTINCT FROM ch.writer_build_sha
             OR h.contract_version IS DISTINCT FROM ch.contract_version
             OR h.accepted_input_frames IS DISTINCT FROM COALESCE(d.accepted_input_frames,0)
             OR h.buffer_superseded IS DISTINCT FROM COALESCE(d.buffer_superseded,0)
             OR h.projection_attempts IS DISTINCT FROM COALESCE(d.projection_attempts,0)
             OR h.repeated_payload_attempts IS DISTINCT FROM COALESCE(d.repeated_payload_attempts,0)
             OR h.applied_winners IS DISTINCT FROM COALESCE(d.applied_winners,0)
             OR h.rejected_older_arrivals IS DISTINCT FROM COALESCE(d.rejected_older_arrivals,0)
             OR h.admission_flushes IS DISTINCT FROM COALESCE(d.admission_flushes,0)
             OR h.completion_flushes IS DISTINCT FROM COALESCE(d.completion_flushes,0)
           )
         )::bigint AS handoff_mismatches,
         count(*) FILTER (WHERE ch.newest_rank = 1 AND h.boot_id IS NULL)::bigint
           AS latest_boot_open,
         max(ch.writer_build_sha) FILTER (WHERE ch.newest_rank = 1) AS latest_boot_build_sha,
         array_agg(DISTINCT ch.writer_build_sha ORDER BY ch.writer_build_sha)
           FILTER (WHERE ch.writer_build_sha IS NOT NULL) AS boot_build_shas
       FROM chain ch
       LEFT JOIN xstock_bar_writer_handoff h USING (boot_id)
       LEFT JOIN durable d USING (boot_id)`;

// B-B75-EXPORT-COMPLETENESS (#1195): `data_archive_exact_evidence` (renamed from
// `xstock_bar_archive_exact_evidence`) now holds EVERY archive lane's proof rows, not
// only xStock's, and a relation's size cannot be filtered — so this gauge now charges
// the xStock store for all lanes' evidence (about 13 rows a night, estimated 1-2 MB a
// year, against the 5 GiB floor). ANALYST Claude chose to keep it in the measured set
// rather than change the set mid-window (2026-10-17).
export const XSTOCK_AVAILABILITY_STORE_SIZE_SQL = `WITH revision_rels AS (
         SELECT relid AS oid FROM pg_partition_tree('xstock_bar_revision_event'::regclass)
       ), other_rels AS (
         SELECT relid AS oid FROM pg_partition_tree('xstock_bar_aggregate_revision'::regclass)
         UNION SELECT 'xstock_bar_window_manifest'::regclass::oid
         UNION SELECT 'xstock_bar_projection_flush_admission'::regclass::oid
         UNION SELECT 'xstock_bar_projection_flush_completion'::regclass::oid
         UNION SELECT 'data_archive_exact_evidence'::regclass::oid
         UNION SELECT 'xstock_bar_clock_guard'::regclass::oid
         UNION SELECT 'xstock_bar_writer_boot_start'::regclass::oid
         UNION SELECT 'xstock_bar_writer_handoff'::regclass::oid
       ), rels AS (
         SELECT oid FROM revision_rels UNION SELECT oid FROM other_rels
       ), indexes AS (
         SELECT DISTINCT i.indexrelid
         FROM pg_index i JOIN rels r ON r.oid = i.indrelid
       )
       SELECT COALESCE((SELECT sum(pg_relation_size(oid)) FROM rels),0)::bigint AS heap_bytes,
              COALESCE((SELECT sum(CASE WHEN c.reltoastrelid = 0 THEN 0
                                       ELSE pg_total_relation_size(c.reltoastrelid) END)
                          FROM rels r JOIN pg_class c ON c.oid=r.oid),0)::bigint AS toast_bytes,
              COALESCE((SELECT sum(pg_relation_size(indexrelid)) FROM indexes),0)::bigint AS index_bytes,
              COALESCE((SELECT sum(pg_total_relation_size(oid)) FROM revision_rels),0)::bigint
                AS revision_store_total_bytes,
              COALESCE((SELECT sum(pg_total_relation_size(oid)) FROM other_rels),0)::bigint
                AS non_revision_store_total_bytes`;

type JsonRow = Record<string, unknown>;

interface GateArgs {
  windowStart: Date;
  gradedRef: string;
  reviewedRefs: string[];
}

export interface CapacityGateInputs {
  elapsedMs: number;
  completeUtcCalendarDays: number;
  completeVenueSessions: number;
  revisionEvents: number;
  symbols: number;
  distinctRevisionIds: number;
  distinctVisibleSeqs: number;
  expectedRevisionLinks: number;
  missingLinkedRevisionEvents: number;
  unlinkedRevisionEvents: number;
  pendingCertificates: number;
  unhealthyCertificates: number;
  negativeCertificateLags: number;
  repeatedPayloadAttempts: number;
  appliedWinners: number;
  rejectedOlderArrivals: number;
  admissionFlushRows: number;
  admissionDistinctFlushIds: number;
  completionFlushRows: number;
  completionDistinctFlushIds: number;
  orphanAdmissions: number;
  admissionCompletionMismatches: number;
  observationContractMismatches: number;
  telemetryProjectionAttempts: number;
  telemetryAcceptedFrames: number;
  telemetryBufferSuperseded: number;
  telemetryRepeatedPayloadAttempts: number;
  telemetryAppliedWinners: number;
  telemetryRejectedOlderArrivals: number;
  writerBoots: number;
  boundaryWriterBoots: number;
  writerBootStarts: number;
  writerBootDistinctIds: number;
  contributingBootsWithoutStart: number;
  contributingBootsOutsideChain: number;
  requiredWriterHandoffs: number;
  cleanWriterHandoffs: number;
  writerChainBreaks: number;
  writerHandoffMismatches: number;
  latestBootOpen: boolean;
  latestBootBuildSha: string;
  contributingWriterBuildShas: string[];
  writerBootBuildShas: string[];
  archiveProducingBuildShas: string[];
  gradedRef: string;
  reviewedRefs: string[];
  maxCompleteDayWholeStoreBytes: number;
  databaseBytes: number;
  newIndexBytes: number;
  archiveProof: boolean;
  cryptoControlRows: number;
  buildIdentityMatches: boolean;
  planCapMb: number;
  criticalThreshold: number;
  venueSessionMaxGapSeconds: number;
  revisionHotRetentionDays: number;
  gradedWindowStartMatches: boolean;
}

export interface VenueSessionEvidence {
  sessionStart: string;
  sessionEnd: string;
  revisionEvents: number;
  firstEventAt: string | null;
  lastEventAt: string | null;
  maxEventGapSeconds: number | null;
}

export function isCompleteVenueSession(
  session: VenueSessionEvidence,
  maxGapSeconds: number,
): boolean {
  if (session.revisionEvents <= 0 || !session.firstEventAt || !session.lastEventAt) return false;
  const start = new Date(session.sessionStart).getTime();
  const end = new Date(session.sessionEnd).getTime();
  const first = new Date(session.firstEventAt).getTime();
  const last = new Date(session.lastEventAt).getTime();
  return [start, end, first, last, maxGapSeconds].every(Number.isFinite)
    && first >= start
    && first - start <= maxGapSeconds * 1000
    && last < end
    && end - last <= maxGapSeconds * 1000
    && (session.maxEventGapSeconds ?? 0) <= maxGapSeconds;
}

export function evaluateCapacityGate(input: CapacityGateInputs) {
  const governedCeilingBytes = Math.round(input.planCapMb * MIB * input.criticalThreshold);
  const rArchive = Math.max(5 * GIB, input.maxCompleteDayWholeStoreBytes);
  const rIndex = Math.max(8 * GIB, input.newIndexBytes);
  const admissionBytes = input.databaseBytes + rArchive + rIndex;
  const checks = {
    eightDayWindow: input.elapsedMs >= EIGHT_DAYS_MS && input.completeUtcCalendarDays >= 8,
    fiveCompleteVenueSessions: input.completeVenueSessions >= 5,
    population: input.revisionEvents >= 100_000 && input.symbols >= 400,
    immutableIdentities: input.distinctRevisionIds === input.revisionEvents,
    exactCompletionEventLinks: input.expectedRevisionLinks === input.revisionEvents
      && input.missingLinkedRevisionEvents === 0
      && input.unlinkedRevisionEvents === 0,
    completeCertificates: input.pendingCertificates === 0
      && input.unhealthyCertificates === 0
      && input.negativeCertificateLags === 0
      && input.distinctVisibleSeqs === input.revisionEvents,
    durableFlushPopulation: input.admissionFlushRows === input.admissionDistinctFlushIds
      && input.completionFlushRows === input.completionDistinctFlushIds
      && input.completionFlushRows === input.admissionFlushRows
      && input.orphanAdmissions === 0
      && input.admissionCompletionMismatches === 0
      && input.observationContractMismatches === 0
      && input.telemetryProjectionAttempts === input.revisionEvents
      && input.telemetryAcceptedFrames - input.telemetryBufferSuperseded === input.revisionEvents
      && input.telemetryRepeatedPayloadAttempts === input.repeatedPayloadAttempts
      && input.telemetryAppliedWinners === input.appliedWinners
      && input.telemetryRejectedOlderArrivals === input.rejectedOlderArrivals
      && input.telemetryAppliedWinners + input.telemetryRejectedOlderArrivals
        === input.telemetryProjectionAttempts,
    continuousWriterHandoffs: input.writerBoots >= 1
      && input.boundaryWriterBoots === 1
      && input.writerBootStarts === input.writerBootDistinctIds
      && input.contributingBootsWithoutStart === 0
      && input.contributingBootsOutsideChain === 0
      && input.cleanWriterHandoffs === input.requiredWriterHandoffs
      && input.writerChainBreaks === 0
      && input.writerHandoffMismatches === 0
      && input.latestBootOpen,
    allContributingBuildsReviewed: input.reviewedRefs.includes(input.gradedRef)
      && input.contributingWriterBuildShas.length > 0
      && input.contributingWriterBuildShas.every((sha) => input.reviewedRefs.includes(sha))
      && input.writerBootBuildShas.length > 0
      && input.writerBootBuildShas.every((sha) => input.reviewedRefs.includes(sha))
      && input.archiveProducingBuildShas.length > 0
      && input.archiveProducingBuildShas.every((sha) => input.reviewedRefs.includes(sha)),
    archiveReadbackBeforeDrop: input.archiveProof,
    readInstrumentPositiveControl: input.cryptoControlRows > 0,
    gradedBuildIdentity: input.buildIdentityMatches
      && input.latestBootBuildSha === input.gradedRef,
    governedCapacityConstants: input.planCapMb === EXPECTED_PLAN_CAP_MB
      && input.criticalThreshold === EXPECTED_CRITICAL_THRESHOLD
      && input.venueSessionMaxGapSeconds === EXPECTED_VENUE_SESSION_MAX_GAP_SECONDS
      && input.revisionHotRetentionDays === 8
      && input.gradedWindowStartMatches
      && governedCeilingBytes === 160 * GIB,
    capacityAdmission: input.databaseBytes < governedCeilingBytes
      && admissionBytes <= governedCeilingBytes,
  };
  return {
    checks,
    reserves: {
      dGateBytes: input.databaseBytes,
      measuredCompleteDayWholeStoreBytes: input.maxCompleteDayWholeStoreBytes,
      exactNewIndexBytes: input.newIndexBytes,
      rArchiveBytes: rArchive,
      rIndexBytes: rIndex,
      admissionBytes,
      ceilingBytes: governedCeilingBytes,
    },
    pass: Object.values(checks).every(Boolean),
  };
}

function refMatches(actual: string, supplied: string): boolean {
  return /^[0-9a-f]{40}$/i.test(actual) && actual.toLowerCase() === supplied.toLowerCase();
}

async function readBuildIdentity(gradedRef: string) {
  const deployedBuildSha = (await readFile('dist/BUILD_SHA', 'utf8')).trim();
  const localHeadSha = execFileSync('git', ['rev-parse', 'HEAD'], { encoding: 'utf8' }).trim();
  return {
    deployedBuildSha,
    localHeadSha,
    matches: refMatches(deployedBuildSha, gradedRef) && refMatches(localHeadSha, gradedRef)
      && deployedBuildSha === localHeadSha,
  };
}

function parseArgs(argv: string[]): GateArgs {
  let windowStart = '';
  let gradedRef = '';
  const reviewedRefs: string[] = [];
  for (let i = 0; i < argv.length; i++) {
    if (argv[i] === '--window-start') windowStart = argv[++i] ?? '';
    else if (argv[i] === '--graded-ref') gradedRef = argv[++i] ?? '';
    else if (argv[i] === '--reviewed-ref') reviewedRefs.push((argv[++i] ?? '').toLowerCase());
    else throw new Error(`unknown argument: ${argv[i]}`);
  }
  const parsed = new Date(windowStart);
  if (!windowStart || !Number.isFinite(parsed.getTime())) {
    throw new Error('--window-start must be an ISO timestamp');
  }
  if (!/^[0-9a-f]{40}$/i.test(gradedRef)) {
    throw new Error('--graded-ref must be an exact 40-character git SHA');
  }
  if (reviewedRefs.length === 0 || reviewedRefs.some((ref) => !/^[0-9a-f]{40}$/i.test(ref))) {
    throw new Error('--reviewed-ref must be repeated for every exact contributing build SHA');
  }
  return {
    windowStart: parsed,
    gradedRef: gradedRef.toLowerCase(),
    reviewedRefs: [...new Set(reviewedRefs)].sort(),
  };
}

function num(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`non-numeric database value: ${String(value)}`);
  return parsed;
}

function strings(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String).sort() : [];
}

function completeUtcDayLabels(start: Date, end: Date): string[] {
  const first = new Date(start);
  first.setUTCHours(0, 0, 0, 0);
  if (first.getTime() < start.getTime()) first.setUTCDate(first.getUTCDate() + 1);
  const labels: string[] = [];
  for (let day = first; day.getTime() + 86_400_000 <= end.getTime(); day = new Date(day.getTime() + 86_400_000)) {
    labels.push(day.toISOString().slice(0, 10));
  }
  return labels;
}

async function main(): Promise<void> {
  if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL not set');
  const args = parseArgs(process.argv.slice(2));
  const buildIdentity = await readBuildIdentity(args.gradedRef);
  const budget = startBudget();
  const startedAt = Date.now();
  // Named so pg_stat_activity names the holder of this long REPEATABLE READ snapshot (Langston C6 condition 1).
  const client = new Client({
    connectionString: process.env.DATABASE_URL,
    application_name: 'xstock-bar-availability-capacity-gate',
  });
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    await client.query(`SET LOCAL lock_timeout = ${GATE_READ_BUDGET.lockTimeoutMs}`);
    const meta = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'meta',
      `SELECT transaction_timestamp()::text AS observed_at,
              pg_database_size(current_database())::bigint AS database_bytes,
              current_database() AS database_name,
              (SELECT value FROM module_constants
                WHERE module_name='database_monitor' AND constant_name='plan_cap_mb'
                  AND ${WILDCARD_SCOPE_SQL}
                LIMIT 1) AS plan_cap_mb,
              (SELECT value FROM module_constants
                WHERE module_name='database_monitor' AND constant_name='critical_threshold_pct'
                  AND ${WILDCARD_SCOPE_SQL}
                LIMIT 1) AS critical_threshold_pct,
              (SELECT value FROM module_constants
                WHERE ${DATA_LIFECYCLE_SCOPE_SQL}
                  AND constant_name='xstock_bar_revision_event.hot_retention_days'
                LIMIT 1) AS revision_hot_retention_days,
              (SELECT value FROM module_constants
                WHERE module_name='xstock_bar_availability'
                  AND constant_name='venue_session_max_gap_seconds'
                  AND ${WILDCARD_SCOPE_SQL}
                LIMIT 1) AS venue_session_max_gap_seconds,
              (SELECT value #>> '{}' FROM module_constants
                WHERE module_name='xstock_bar_availability'
                  AND constant_name='graded_window_start'
                  AND ${WILDCARD_SCOPE_SQL}
                LIMIT 1) AS graded_window_start`,
    )).rows[0] as JsonRow;
    const observedAt = new Date(String(meta.observed_at));
    const venueSessionMaxGapSeconds = num(meta.venue_session_max_gap_seconds);
    const revisionHotRetentionDays = parseLifecycleNumber(meta.revision_hot_retention_days);
    if (revisionHotRetentionDays === null) {
      throw new Error('governed xStock revision hot retention is absent or invalid');
    }
    const governedWindowStart = new Date(String(meta.graded_window_start));
    if (!Number.isFinite(governedWindowStart.getTime())) {
      throw new Error('governed xStock graded_window_start is absent or invalid');
    }
    const gradedWindowStartMatches = args.windowStart.getTime() === governedWindowStart.getTime()
      && governedWindowStart.toISOString() === EXPECTED_GRADED_WINDOW_START;
    const windowStart = governedWindowStart;

    const populationRead = await readPopulationChunked(client, budget, windowStart, observedAt);
    const unlinkedRead = await readUnlinkedChunked(client, budget, windowStart, observedAt);
    const identity = await readIdentity(client, budget, windowStart, observedAt);
    const distinct = reconstructDistinctCounts(populationRead, identity);
    const population = {
      expected_revision_links: populationRead.expectedRevisionLinks,
      revision_events: populationRead.revisionEvents,
      missing_linked_revision_events: populationRead.missingLinkedRevisionEvents,
      symbols: populationRead.symbols.size,
      distinct_revision_ids: distinct.distinctRevisionIds,
      distinct_visible_seqs: distinct.distinctVisibleSeqs,
      applied_winners: populationRead.appliedWinners,
      rejected_older_arrivals: populationRead.rejectedOlderArrivals,
      repeated_payload_attempts: populationRead.repeatedPayloadAttempts,
      pending_certificates: populationRead.pendingCertificates,
      unhealthy_certificates: populationRead.unhealthyCertificates,
      negative_certificate_lags: populationRead.negativeCertificateLags,
      null_visible_seq_rows: populationRead.nullVisibleSeqRows,
      bound_misses_resolved_by_exactness_pass: populationRead.boundMisses,
      lag_min_ms: populationRead.lagMinMs,
      lag_max_ms: populationRead.lagMaxMs,
      // Reported per UTC day, NOT merged: a per-day percentile is not the window's.
      certificate_lag_ms_per_utc_day: populationRead.perDay,
    };
    const unlinked = {
      unlinked_revision_events: unlinkedRead.unlinkedRevisionEvents,
      events_scanned: unlinkedRead.eventsScanned,
      candidates_rechecked_against_all_completions: unlinkedRead.recheckedCandidates,
    };

    const telemetry = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'telemetry',
      `WITH admitted AS (
         SELECT * FROM xstock_bar_projection_flush_admission
         WHERE admitted_at >= $1 AND admitted_at < $2
       )
       SELECT count(*)::bigint AS admission_flush_rows,
              count(DISTINCT a.flush_id)::bigint AS admission_distinct_flush_ids,
              count(c.flush_id)::bigint AS completion_flush_rows,
              count(DISTINCT c.flush_id)::bigint AS completion_distinct_flush_ids,
              count(*) FILTER (WHERE c.flush_id IS NULL)::bigint AS orphan_admissions,
              count(*) FILTER (
                WHERE c.flush_id IS NOT NULL AND (
                  c.writer_boot_id IS DISTINCT FROM a.writer_boot_id
                  OR c.writer_build_sha IS DISTINCT FROM a.writer_build_sha
                  OR c.contract_version IS DISTINCT FROM a.contract_version
                  OR c.accepted_input_frames IS DISTINCT FROM a.accepted_input_frames
                  OR c.buffer_superseded IS DISTINCT FROM a.buffer_superseded
                  OR c.projection_attempts IS DISTINCT FROM a.expected_projection_attempts
                  OR c.population_hash IS DISTINCT FROM a.population_hash
                )
              )::bigint AS admission_completion_mismatches,
              count(*) FILTER (
                WHERE a.contract_version IS DISTINCT FROM $3
                   OR c.contract_version IS DISTINCT FROM $3
              )::bigint AS observation_contract_mismatches,
              COALESCE(sum(c.accepted_input_frames),0)::bigint AS accepted_input_frames,
              COALESCE(sum(c.buffer_superseded),0)::bigint AS buffer_superseded,
              COALESCE(sum(c.projection_attempts),0)::bigint AS projection_attempts,
              COALESCE(sum(c.repeated_payload_attempts),0)::bigint AS repeated_payload_attempts,
              COALESCE(sum(c.applied_winners),0)::bigint AS applied_winners,
              COALESCE(sum(c.rejected_older_arrivals),0)::bigint AS rejected_older_arrivals,
              count(DISTINCT c.writer_boot_id)::bigint AS writer_boots,
              array_agg(DISTINCT a.writer_build_sha ORDER BY a.writer_build_sha)
                AS writer_build_shas,
              min(a.admitted_at)::text AS first_admitted_at,
              max(a.admitted_at)::text AS last_admitted_at,
              min(c.completed_at)::text AS first_completed_at,
              max(c.completed_at)::text AS last_completed_at
         FROM admitted a
         LEFT JOIN xstock_bar_projection_flush_completion c USING (flush_id)`,
      [windowStart, observedAt, EXPECTED_AVAILABILITY_CONTRACT],
    )).rows[0] as JsonRow;

    const bootChain = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'boot chain',
      XSTOCK_WRITER_BOOT_CHAIN_SQL,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    // A venue session is the SSOT's 24-hour xStock feed day, 20:00 ET to
    // 20:00 ET, starting Sunday through Thursday. Session membership comes
    // from admitted/completed flushes, read one session at a time with the
    // event lookup bounded to the session (C6). PostgreSQL applies DST.
    const sessions = await readSessionsChunked(
      client, budget, windowStart, observedAt, populationRead.outOfBoundIds,
    ) as unknown as JsonRow[];

    const cryptoControl = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'crypto control',
      `SELECT count(*)::bigint AS retained_rows,
              count(DISTINCT symbol)::bigint AS symbols
         FROM crypto_spot_ohlc_1m
        WHERE arrived_at >= $1 AND arrived_at < $2`,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    const partitionRows = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'partitions',
      `SELECT c.relname AS partition_name,
              pg_get_expr(c.relpartbound, c.oid) AS partition_bound,
              pg_relation_size(c.oid)::bigint AS heap_bytes,
              CASE WHEN c.reltoastrelid = 0 THEN 0
                   ELSE pg_total_relation_size(c.reltoastrelid) END::bigint AS toast_bytes,
              pg_indexes_size(c.oid)::bigint AS index_bytes,
              pg_total_relation_size(c.oid)::bigint AS total_bytes
         FROM pg_partition_tree('xstock_bar_revision_event'::regclass) pt
         JOIN pg_class c ON c.oid = pt.relid
        WHERE pt.isleaf
        ORDER BY c.relname`,
    )).rows as JsonRow[];

    const storeSizes = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'store sizes',
      XSTOCK_AVAILABILITY_STORE_SIZE_SQL)).rows[0] as JsonRow;

    const archiveRows = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'archive proof',
      `SELECT m.partition_label, m.state, m.tier, m.row_count::bigint,
              m.bytes_compressed::bigint, m.checksum, m.verified_at::text,
              m.hot_partition_dropped_at::text,
              to_regclass(
                'xstock_bar_revision_event_' || replace(m.partition_label, '-', '_')
              ) IS NULL AS hot_child_absent,
              x.source_row_count::bigint, x.exported_row_count::bigint,
              x.downloaded_row_count::bigint, x.cursor_contract,
              x.producing_build_sha, x.object_checksum,
              x.verified_at::text AS exact_evidence_verified_at
         FROM data_archive_manifest m
         LEFT JOIN data_archive_exact_evidence x ON x.manifest_id = m.id
        WHERE m.source_table = 'xstock_bar_revision_event'
          AND m.tier = 'warm'
          AND m.partition_label = to_char(
            ($1::timestamptz AT TIME ZONE 'UTC')::date - 1,
            'YYYY-MM-DD'
          )
        ORDER BY m.hot_partition_dropped_at DESC NULLS LAST`,
      [windowStart],
    )).rows as JsonRow[];

    await client.query('COMMIT');

    const dayLabels = completeUtcDayLabels(windowStart, observedAt);
    const partitionByDay = new Map(
      partitionRows.map((row) => [
        String(row.partition_name).match(/(\d{4}_\d{2}_\d{2})$/)?.[1]?.replaceAll('_', '-') ?? '',
        num(row.total_bytes),
      ]),
    );
    // Exact per-day attribution is available for the revision partitions. The
    // other stores are small/unpartitioned, so add their ENTIRE current size
    // to every candidate day. This deliberately overstates, rather than hides,
    // whole-store daily growth.
    const nonRevisionStoreTotalBytes = num(storeSizes.non_revision_store_total_bytes);
    const completeDaySizes = dayLabels.map((label) => ({
      utcDate: label,
      revisionPartitionBytes: partitionByDay.get(label) ?? 0,
      conservativeNonRevisionAllocationBytes: nonRevisionStoreTotalBytes,
      wholeStoreGrowthBytes: (partitionByDay.get(label) ?? 0) + nonRevisionStoreTotalBytes,
    }));
    const maxCompleteDayWholeStoreBytes = completeDaySizes.reduce(
      (max, row) => Math.max(max, row.wholeStoreGrowthBytes),
      0,
    );
    const venueSessionEvidence = sessions.map((row) => ({
      ...row,
      continuity_pass: isCompleteVenueSession({
        sessionStart: String(row.session_start),
        sessionEnd: String(row.session_end),
        revisionEvents: num(row.revision_events),
        firstEventAt: row.first_event_at === null ? null : String(row.first_event_at),
        lastEventAt: row.last_event_at === null ? null : String(row.last_event_at),
        maxEventGapSeconds: row.max_event_gap_seconds === null
          ? null
          : num(row.max_event_gap_seconds),
      }, venueSessionMaxGapSeconds),
    }));
    const archiveProducingBuildShas = [...new Set(
      archiveRows
        .map((row) => row.producing_build_sha)
        .filter((value): value is string => typeof value === 'string'),
    )].sort();
    const archiveProof = archiveRows.length > 0 && archiveRows.every((row) =>
      row.state === 'active'
      && row.verified_at !== null
      && row.hot_partition_dropped_at !== null
      && typeof row.checksum === 'string' && row.checksum.length > 0
      && num(row.row_count) > 0
      && row.hot_child_absent === true
      && num(row.source_row_count) === num(row.row_count)
      && num(row.exported_row_count) === num(row.row_count)
      && num(row.downloaded_row_count) === num(row.row_count)
      && row.cursor_contract === XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT
      && row.object_checksum === row.checksum
      && row.exact_evidence_verified_at !== null,
    );

    const inputs: CapacityGateInputs = {
      elapsedMs: observedAt.getTime() - windowStart.getTime(),
      completeUtcCalendarDays: dayLabels.length,
      completeVenueSessions: venueSessionEvidence.filter((row) => row.continuity_pass).length,
      revisionEvents: num(population.revision_events),
      symbols: num(population.symbols),
      distinctRevisionIds: num(population.distinct_revision_ids),
      distinctVisibleSeqs: num(population.distinct_visible_seqs),
      expectedRevisionLinks: num(population.expected_revision_links),
      missingLinkedRevisionEvents: num(population.missing_linked_revision_events),
      unlinkedRevisionEvents: num(unlinked.unlinked_revision_events),
      pendingCertificates: num(population.pending_certificates),
      unhealthyCertificates: num(population.unhealthy_certificates),
      negativeCertificateLags: num(population.negative_certificate_lags),
      repeatedPayloadAttempts: num(population.repeated_payload_attempts),
      appliedWinners: num(population.applied_winners),
      rejectedOlderArrivals: num(population.rejected_older_arrivals),
      admissionFlushRows: num(telemetry.admission_flush_rows),
      admissionDistinctFlushIds: num(telemetry.admission_distinct_flush_ids),
      completionFlushRows: num(telemetry.completion_flush_rows),
      completionDistinctFlushIds: num(telemetry.completion_distinct_flush_ids),
      orphanAdmissions: num(telemetry.orphan_admissions),
      admissionCompletionMismatches: num(telemetry.admission_completion_mismatches),
      observationContractMismatches: num(telemetry.observation_contract_mismatches),
      telemetryProjectionAttempts: num(telemetry.projection_attempts),
      telemetryAcceptedFrames: num(telemetry.accepted_input_frames),
      telemetryBufferSuperseded: num(telemetry.buffer_superseded),
      telemetryRepeatedPayloadAttempts: num(telemetry.repeated_payload_attempts),
      telemetryAppliedWinners: num(telemetry.applied_winners),
      telemetryRejectedOlderArrivals: num(telemetry.rejected_older_arrivals),
      writerBoots: num(telemetry.writer_boots),
      boundaryWriterBoots: num(bootChain.boundary_boot_rows),
      writerBootStarts: num(bootChain.boot_start_rows),
      writerBootDistinctIds: num(bootChain.boot_distinct_ids),
      contributingBootsWithoutStart: num(bootChain.contributing_boots_without_start),
      contributingBootsOutsideChain: num(bootChain.contributing_boots_outside_chain),
      requiredWriterHandoffs: num(bootChain.required_handoffs),
      cleanWriterHandoffs: num(bootChain.clean_handoffs),
      writerChainBreaks: num(bootChain.chain_breaks),
      writerHandoffMismatches: num(bootChain.handoff_mismatches),
      latestBootOpen: num(bootChain.latest_boot_open) === 1,
      latestBootBuildSha: String(bootChain.latest_boot_build_sha ?? ''),
      contributingWriterBuildShas: strings(telemetry.writer_build_shas),
      writerBootBuildShas: strings(bootChain.boot_build_shas),
      archiveProducingBuildShas,
      gradedRef: args.gradedRef,
      reviewedRefs: args.reviewedRefs,
      maxCompleteDayWholeStoreBytes,
      databaseBytes: num(meta.database_bytes),
      newIndexBytes: num(storeSizes.index_bytes),
      archiveProof,
      cryptoControlRows: num(cryptoControl.retained_rows),
      buildIdentityMatches: buildIdentity.matches,
      planCapMb: num(meta.plan_cap_mb),
      criticalThreshold: num(meta.critical_threshold_pct),
      venueSessionMaxGapSeconds,
      revisionHotRetentionDays,
      gradedWindowStartMatches,
    };
    const verdict = evaluateCapacityGate(inputs);
    const bytesPerEvent = inputs.revisionEvents === 0
      ? null
      : (num(storeSizes.heap_bytes) + num(storeSizes.toast_bytes) + num(storeSizes.index_bytes))
        / inputs.revisionEvents;

    process.stdout.write(`${JSON.stringify({
      batch: 'B-XSTOCK-BAR-AVAILABILITY',
      phase: 'P14-capacity-quality-gate',
      gradedRef: args.gradedRef,
      buildIdentity,
      database: meta.database_name,
      window: {
        start: windowStart.toISOString(),
        requestedStart: args.windowStart.toISOString(),
        end: observedAt.toISOString(),
        elapsedSeconds: inputs.elapsedMs / 1000,
        completeUtcCalendarDays: dayLabels,
      },
      governedCapacity: {
        planCapMb: num(meta.plan_cap_mb),
        criticalThresholdPct: num(meta.critical_threshold_pct),
        revisionHotRetentionDays,
        venueSessionMaxGapSeconds,
        gradedWindowStart: windowStart.toISOString(),
      },
      population,
      identity,
      unlinkedRevisionEvidence: unlinked,
      flushAdmissionCompletion: telemetry,
      writerBootChain: bootChain,
      venueSessions: venueSessionEvidence,
      cryptoControl,
      storage: {
        completeDayGrowthFormula:
          'revision partition bytes for UTC day + entire current non-revision availability-store bytes',
        storeSizes,
        bytesPerEvent,
        revisionPartitions: partitionRows,
        completeDaySizes,
      },
      archiveProof: archiveRows,
      readElapsedMs: Date.now() - startedAt,
      // Langston C6 ruling condition 1 (2026-11-20): every stored verdict carries where its
      // time went - per-leg statement timings plus the run's own elapsed (NOT the window length).
      verdict: { state: verdict.pass ? 'pass' : 'fail', ...verdict, runTiming: summarizeTimings(budget) },
    }, null, 2)}\n`);
    process.exitCode = verdict.pass ? GATE_EXIT.pass : GATE_EXIT.fail;
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    if (error instanceof InconclusiveRead) {
      // C6-2: a cancelled or lock-timed-out read is a first-class verdict, written before exit,
      // so a stored verdict always exists for R7 to grade and R7b to release on.
      process.stdout.write(`${JSON.stringify({
        batch: 'B-XSTOCK-BAR-AVAILABILITY',
        phase: 'P14-capacity-quality-gate',
        gradedRef: args.gradedRef,
        observedAt: new Date().toISOString(),
        readElapsedMs: Date.now() - startedAt,
        verdict: {
          state: 'inconclusive', pass: false, leg: error.leg, reason: error.reason,
          runTiming: summarizeTimings(budget),
        },
      }, null, 2)}\n`);
      process.exitCode = GATE_EXIT.inconclusive;
      return;
    }
    throw error;
  } finally {
    await client.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error('[B-XSTOCK-BAR-AVAILABILITY][capacity-gate] fatal:', error);
    process.exitCode = GATE_EXIT.fatal;
  });
}
