/**
 * B-XSTOCK-BAR-AVAILABILITY P14 phase-2 capacity/quality gate.
 *
 * Read-only and rerunnable. Every database observation is taken under one
 * REPEATABLE READ READ ONLY snapshot. Usage:
 *
 *   npx tsx server/scripts/b-xstock-bar-availability-capacity-gate.ts \
 *     --window-start 2026-10-16T00:05:00Z --graded-ref <deployed-sha> \
 *     --reviewed-ref <every-contributing-deployed-sha>
 *
 * The command prints one JSON evidence object. It never changes database or
 * application state and cannot authorize the later consumer switch by itself;
 * Coltrane must independently verify the resulting evidence.
 */
import pg from 'pg';
import { pathToFileURL } from 'node:url';
import { readFile } from 'node:fs/promises';
import { execFileSync } from 'node:child_process';
import { XSTOCK_EXACT_ARCHIVE_CURSOR_CONTRACT } from '../services/data-archive/exact-archive-evidence.js';

const { Client } = pg;
const GIB = 1024 ** 3;
const MIB = 1024 ** 2;
const EIGHT_DAYS_MS = 8 * 86_400_000;
const EXPECTED_PLAN_CAP_MB = 204_800;
const EXPECTED_CRITICAL_THRESHOLD = 0.80;
const EXPECTED_VENUE_SESSION_MAX_GAP_SECONDS = 60;
const EXPECTED_GRADED_WINDOW_START = '2026-10-16T00:05:00.000Z';
const EXPECTED_AVAILABILITY_CONTRACT = 'xstock-bar-availability/v1';

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
  const client = new Client({ connectionString: process.env.DATABASE_URL });
  await client.connect();
  await client.query('BEGIN ISOLATION LEVEL REPEATABLE READ READ ONLY');
  try {
    const meta = (await client.query(
      `SELECT transaction_timestamp()::text AS observed_at,
              pg_database_size(current_database())::bigint AS database_bytes,
              current_database() AS database_name,
              (SELECT value FROM module_constants
                WHERE module_name='database_monitor' AND constant_name='plan_cap_mb'
                LIMIT 1) AS plan_cap_mb,
              (SELECT value FROM module_constants
                WHERE module_name='database_monitor' AND constant_name='critical_threshold_pct'
                LIMIT 1) AS critical_threshold_pct,
              (SELECT value FROM module_constants
                WHERE module_name='data_lifecycle'
                  AND constant_name='xstock_bar_revision_event.hot_retention_days'
                LIMIT 1) AS revision_hot_retention_days,
              (SELECT value FROM module_constants
                WHERE module_name='xstock_bar_availability'
                  AND constant_name='venue_session_max_gap_seconds'
                LIMIT 1) AS venue_session_max_gap_seconds,
              (SELECT value #>> '{}' FROM module_constants
                WHERE module_name='xstock_bar_availability'
                  AND constant_name='graded_window_start'
                LIMIT 1) AS graded_window_start`,
    )).rows[0] as JsonRow;
    const observedAt = new Date(String(meta.observed_at));
    const venueSessionMaxGapSeconds = num(meta.venue_session_max_gap_seconds);
    const governedWindowStart = new Date(String(meta.graded_window_start));
    if (!Number.isFinite(governedWindowStart.getTime())) {
      throw new Error('governed xStock graded_window_start is absent or invalid');
    }
    const gradedWindowStartMatches = args.windowStart.getTime() === governedWindowStart.getTime()
      && governedWindowStart.toISOString() === EXPECTED_GRADED_WINDOW_START;
    const windowStart = governedWindowStart;

    const population = (await client.query(
      `WITH admitted AS (
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
              count(*) FILTER (WHERE e.visible_by < e.created_at)::bigint AS negative_certificate_lags,
              min(extract(epoch FROM (e.visible_by-e.created_at))*1000)
                FILTER (WHERE e.visible_by IS NOT NULL) AS lag_min_ms,
              percentile_cont(0.5) WITHIN GROUP (
                ORDER BY extract(epoch FROM (e.visible_by-e.created_at))*1000
              ) FILTER (WHERE e.visible_by IS NOT NULL) AS lag_p50_ms,
              percentile_cont(0.95) WITHIN GROUP (
                ORDER BY extract(epoch FROM (e.visible_by-e.created_at))*1000
              ) FILTER (WHERE e.visible_by IS NOT NULL) AS lag_p95_ms,
              max(extract(epoch FROM (e.visible_by-e.created_at))*1000)
                FILTER (WHERE e.visible_by IS NOT NULL) AS lag_max_ms
         FROM linked l
         LEFT JOIN xstock_bar_revision_event e ON e.revision_id = l.revision_id`,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    const unlinked = (await client.query(
      `WITH completed_ids AS MATERIALIZED (
         SELECT saved.revision_id
         FROM xstock_bar_projection_flush_completion c
         CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
         WHERE c.completed_at < $2
       )
       SELECT count(*) FILTER (WHERE linked.revision_id IS NULL)::bigint
                AS unlinked_revision_events
       FROM xstock_bar_revision_event e
       LEFT JOIN completed_ids linked USING (revision_id)
       WHERE e.created_at >= $1 AND e.created_at < $2`,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    const telemetry = (await client.query(
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

    const bootChain = (await client.query(
      XSTOCK_WRITER_BOOT_CHAIN_SQL,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    // A venue session is the SSOT's 24-hour xStock feed day, 20:00 ET to
    // 20:00 ET, starting Sunday through Thursday. Session membership comes
    // from admitted/completed flushes, not an event-created-at range scan.
    // PostgreSQL applies DST.
    const sessions = (await client.query(
      `WITH graded_events AS MATERIALIZED (
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
                (et_date + time '20:00') AT TIME ZONE 'America/New_York' AS session_start,
                (et_date + 1 + time '20:00') AT TIME ZONE 'America/New_York' AS session_end
         FROM et_days
         WHERE extract(isodow FROM et_date) IN (7,1,2,3,4)
       )
       SELECT b.et_date::text,
              b.session_start::text,
              b.session_end::text,
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
       ORDER BY b.session_start`,
      [windowStart, observedAt],
    )).rows as JsonRow[];

    const cryptoControl = (await client.query(
      `SELECT count(*)::bigint AS retained_rows,
              count(DISTINCT symbol)::bigint AS symbols
         FROM crypto_spot_ohlc_1m
        WHERE arrived_at >= $1 AND arrived_at < $2`,
      [windowStart, observedAt],
    )).rows[0] as JsonRow;

    const partitionRows = (await client.query(
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

    const storeSizes = (await client.query(XSTOCK_AVAILABILITY_STORE_SIZE_SQL)).rows[0] as JsonRow;

    const archiveRows = (await client.query(
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
      revisionHotRetentionDays: num(meta.revision_hot_retention_days),
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
        revisionHotRetentionDays: num(meta.revision_hot_retention_days),
        venueSessionMaxGapSeconds,
        gradedWindowStart: windowStart.toISOString(),
      },
      population,
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
      verdict,
    }, null, 2)}\n`);
  } catch (error) {
    await client.query('ROLLBACK').catch(() => {});
    throw error;
  } finally {
    await client.end();
  }
}

const invokedPath = process.argv[1] ? pathToFileURL(process.argv[1]).href : '';
if (import.meta.url === invokedPath) {
  main().catch((error) => {
    console.error('[B-XSTOCK-BAR-AVAILABILITY][capacity-gate] fatal:', error);
    process.exitCode = 1;
  });
}
