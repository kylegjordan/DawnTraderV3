/**
 * B-XSTOCK-BAR-AVAILABILITY Step 9 C6 (design r8, Langston-ruled 2026-11-20) - the gate's
 * heavy reads, split so the capacity/quality gate COMPLETES.
 *
 * WHY: the single-shot population and session queries joined every linked revision id to
 * `xstock_bar_revision_event` with no partition key in the join, so each id was probed in
 * EVERY daily partition (12 at read time). One admission day did not finish inside 60 s; the
 * whole window died on `57014` (2026-11-04). Bounded to the matching partitions one day is
 * 920,873 linked rows in 16.46 s (measured 2026-11-20).
 *
 * HOW, and what keeps it exact:
 *  - Everything still runs inside the caller's ONE `REPEATABLE READ READ ONLY` snapshot.
 *  - The graded population is unchanged: whole UTC days from the window start keyed on
 *    `admitted_at`, then a trailing partial chunk ending at the captured `observedAt`.
 *  - Event lookups are bounded to `arrived_at` in [chunk - 1 h, chunk end + 1 h) so run-time
 *    partition pruning applies. Any linked id NOT found inside the bound gets ONE batched
 *    unbounded lookup (`= ANY($1::uuid[])`), so missing/found counts stay exact. Above
 *    EXACTNESS_MAX_IDS ids in one chunk the run is INCONCLUSIVE instead of grinding (the cap prices
 *    the lookup's cost; it does not decide what the unfound ids are).
 *  - Unlinked events: completions bounded to the chunk, then every candidate re-checked against
 *    the gate's original population, `completed_at < observedAt` with NO lower bound.
 *  - Identity (cross-partition duplicates): ONE whole-table statement per key over the EVENT
 *    rows (the gate's own object), then restricted to ids linked in the window; plus one
 *    statement for an id linked by two completions, which the single-shot also failed.
 *  - Budget: every statement gets `SET LOCAL statement_timeout` = min(its cap, the remaining
 *    run budget), re-issued before it (SET LOCAL lasts for the transaction, not the statement),
 *    so Postgres cancels rather than the script abandoning a live backend. A cancel or a lock
 *    timeout becomes an InconclusiveRead, never a partial PASS: the caller builds the gate's
 *    inputs only when every leg returned.
 */
import type pg from 'pg';

export const GATE_READ_BUDGET = {
  /** The whole run, measured from the reader's start (Langston C6-3: <= 20 min). */
  totalMs: 20 * 60_000,
  /** One day chunk of a heavy leg: 4.6x the largest measured chunk (25.4 s). */
  chunkCapMs: 120_000,
  /** The revision_id identity scan: >= 3x its measured 36.07 s (2026-11-20). */
  identityRevisionCapMs: 300_000,
  /** The visible_seq identity scan: measured 35.19 s whole-table. */
  identityVisibleSeqCapMs: 120_000,
  /** Any other single statement. */
  otherCapMs: 120_000,
  /** Gate-side lock wait; a lock wait past this is INCONCLUSIVE, not a hang. */
  lockTimeoutMs: 5_000,
  /** Below this remaining budget a statement is not started. */
  minimumStatementMs: 1_000,
} as const;

/** Bound slack around a chunk for the event lookup (`arrived_at`). */
export const EVENT_BOUND_SLACK_MS = 3_600_000;
/** Completion bound after a chunk for the unlinked leg's first pass. */
export const COMPLETION_BOUND_AFTER_MS = 7_200_000;
/**
 * Above this many ids needing the unbounded lookup in one chunk, the run is INCONCLUSIVE rather than
 * grinding. It caps the lookup's COST (Langston C6 Step-4 condition 5): below it, unfound ids are
 * looked up and classified exactly (found out of bound, or genuinely missing - a real gate failure).
 * Measured bound misses: 0 of 926,329 / 920,873 / 1,401 on three real days (2026-11-20).
 */
export const EXACTNESS_MAX_IDS = 10_000;

export class InconclusiveRead extends Error {
  constructor(readonly leg: string, readonly reason: string) {
    super(`inconclusive at ${leg}: ${reason}`);
    this.name = 'InconclusiveRead';
  }
}

export interface ReadBudget {
  readonly deadlineMs: number;
  readonly now: () => number;
}

export function startBudget(totalMs: number = GATE_READ_BUDGET.totalMs, now: () => number = Date.now): ReadBudget {
  return { deadlineMs: now() + totalMs, now };
}

export interface GateChunk { start: Date; end: Date; partial: boolean }

/**
 * Whole UTC days from `windowStart`, then the trailing partial chunk ending exactly at
 * `observedAt`. A window start that is not a midnight yields a leading partial chunk to the
 * next midnight. Every bound derives from the two captured values; nothing is dropped.
 */
export function planGradedChunks(windowStart: Date, observedAt: Date): GateChunk[] {
  if (!(observedAt.getTime() > windowStart.getTime())) return [];
  const chunks: GateChunk[] = [];
  let cursor = new Date(windowStart);
  while (cursor.getTime() < observedAt.getTime()) {
    const nextMidnight = new Date(cursor);
    nextMidnight.setUTCHours(0, 0, 0, 0);
    nextMidnight.setUTCDate(nextMidnight.getUTCDate() + 1);
    const end = nextMidnight.getTime() <= observedAt.getTime() ? nextMidnight : new Date(observedAt);
    const partial = !(cursor.getUTCHours() === 0 && cursor.getUTCMinutes() === 0
      && cursor.getUTCSeconds() === 0 && cursor.getUTCMilliseconds() === 0
      && end.getTime() - cursor.getTime() === 86_400_000);
    chunks.push({ start: new Date(cursor), end, partial });
    cursor = end;
  }
  return chunks;
}

/** A Postgres cancel (statement timeout) or lock timeout is an inconclusive read; anything else is fatal. */
export function asInconclusive(error: unknown, leg: string): InconclusiveRead | null {
  const code = (error as { code?: unknown } | null)?.code;
  if (code === '57014') return new InconclusiveRead(leg, 'statement timeout (57014)');
  if (code === '55P03') return new InconclusiveRead(leg, 'lock timeout (55P03)');
  return null;
}

type Queryable = Pick<pg.ClientBase, 'query'>;

/** Run one statement under min(cap, remaining budget), server-side. */
export async function budgetedQuery(
  client: Queryable,
  budget: ReadBudget,
  capMs: number,
  leg: string,
  text: string,
  params: unknown[] = [],
): Promise<pg.QueryResult> {
  const remaining = budget.deadlineMs - budget.now();
  if (remaining < GATE_READ_BUDGET.minimumStatementMs) {
    throw new InconclusiveRead(leg, `run budget exhausted (${Math.max(0, remaining)} ms left)`);
  }
  const timeoutMs = Math.max(1, Math.min(capMs, Math.floor(remaining)));
  try {
    // SET LOCAL lasts for the transaction, so it is re-issued before every statement.
    await client.query(`SET LOCAL statement_timeout = ${timeoutMs}`);
    return await client.query(text, params);
  } catch (error) {
    const inconclusive = asInconclusive(error, leg);
    if (inconclusive) throw inconclusive;
    throw error;
  }
}

function n(value: unknown): number {
  const parsed = Number(value ?? 0);
  if (!Number.isFinite(parsed)) throw new Error(`non-numeric database value: ${String(value)}`);
  return parsed;
}

function idList(value: unknown): string[] {
  return Array.isArray(value) ? value.map(String) : [];
}

function iso(date: Date): string {
  return date.toISOString();
}

// ── The population leg ─────────────────────────────────────────────────────────────────────────

const POPULATION_EVENT_AGGREGATES = `
  count(e.revision_id)::bigint AS revision_events,
  count(*) FILTER (WHERE e.revision_id IS NOT NULL AND e.visible_seq IS NULL)::bigint AS null_visible_seq_rows,
  COALESCE(array_agg(DISTINCT e.symbol) FILTER (WHERE e.symbol IS NOT NULL), '{}') AS symbol_set,
  count(*) FILTER (WHERE e.projection_applied)::bigint AS applied_winners,
  count(*) FILTER (WHERE NOT e.projection_applied)::bigint AS rejected_older_arrivals,
  count(*) FILTER (WHERE e.payload_repeated_from_winner)::bigint AS repeated_payload_attempts,
  count(*) FILTER (WHERE e.revision_id IS NOT NULL AND e.visible_by IS NULL)::bigint AS pending_certificates,
  count(*) FILTER (WHERE e.visible_by IS NOT NULL
                    AND e.certificate_clock_healthy IS DISTINCT FROM true)::bigint AS unhealthy_certificates,
  count(*) FILTER (WHERE e.visible_by < e.created_at)::bigint AS negative_certificate_lags,
  min(extract(epoch FROM (e.visible_by-e.created_at))*1000)
    FILTER (WHERE e.visible_by IS NOT NULL) AS lag_min_ms,
  percentile_cont(0.5) WITHIN GROUP (ORDER BY extract(epoch FROM (e.visible_by-e.created_at))*1000)
    FILTER (WHERE e.visible_by IS NOT NULL) AS lag_p50_ms,
  percentile_cont(0.95) WITHIN GROUP (ORDER BY extract(epoch FROM (e.visible_by-e.created_at))*1000)
    FILTER (WHERE e.visible_by IS NOT NULL) AS lag_p95_ms,
  max(extract(epoch FROM (e.visible_by-e.created_at))*1000)
    FILTER (WHERE e.visible_by IS NOT NULL) AS lag_max_ms`;

/** Bounded pass for one chunk: links admitted in [$1,$2), events arrived in [$3,$4). */
export const POPULATION_CHUNK_SQL = `WITH admitted AS (
     SELECT flush_id FROM xstock_bar_projection_flush_admission
     WHERE admitted_at >= $1 AND admitted_at < $2
   ), linked AS (
     SELECT saved.revision_id
     FROM admitted a
     JOIN xstock_bar_projection_flush_completion c USING (flush_id)
     CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
   ), ev AS (
     SELECT revision_id, symbol, visible_seq, projection_applied, payload_repeated_from_winner,
            visible_by, certificate_clock_healthy, created_at
     FROM xstock_bar_revision_event
     WHERE arrived_at >= $3 AND arrived_at < $4
   )
   SELECT count(*)::bigint AS expected_revision_links,
          COALESCE(array_agg(l.revision_id) FILTER (WHERE e.revision_id IS NULL), '{}') AS unfound_ids,
          ${POPULATION_EVENT_AGGREGATES}
   FROM linked l
   LEFT JOIN ev e ON e.revision_id = l.revision_id`;

/** Exactness pass: the ids (with multiplicity) not found inside the bound, looked up unbounded. */
export const POPULATION_EXACTNESS_SQL = `WITH linked AS (
     SELECT revision_id FROM unnest($1::uuid[]) AS ids(revision_id)
   )
   SELECT count(*) FILTER (WHERE e.revision_id IS NULL)::bigint AS missing_linked_revision_events,
          COALESCE(array_agg(DISTINCT e.revision_id) FILTER (WHERE e.revision_id IS NOT NULL), '{}') AS found_ids,
          ${POPULATION_EVENT_AGGREGATES}
   FROM linked l
   LEFT JOIN xstock_bar_revision_event e ON e.revision_id = l.revision_id`;

export interface PopulationDay {
  chunkStart: string;
  chunkEnd: string;
  partial: boolean;
  expectedRevisionLinks: number;
  boundMisses: number;
  /** Wall time of this chunk's statements, so the budget runway is readable from one run. */
  elapsedMs: number;
  lagMinMs: number | null;
  lagP50Ms: number | null;
  lagP95Ms: number | null;
  lagMaxMs: number | null;
}

export interface PopulationRead {
  expectedRevisionLinks: number;
  revisionEvents: number;
  missingLinkedRevisionEvents: number;
  nullVisibleSeqRows: number;
  symbols: Set<string>;
  appliedWinners: number;
  rejectedOlderArrivals: number;
  repeatedPayloadAttempts: number;
  pendingCertificates: number;
  unhealthyCertificates: number;
  negativeCertificateLags: number;
  /** Linked ids found only by the unbounded lookup, for the session leg's exact join. */
  outOfBoundIds: string[];
  boundMisses: number;
  /** Window-wide certificate lag min/max: mergeable across chunks (percentiles are not, so they stay per day). */
  lagMinMs: number | null;
  lagMaxMs: number | null;
  perDay: PopulationDay[];
}

function nullableNumber(value: unknown): number | null {
  return value === null || value === undefined ? null : n(value);
}

function addEventAggregates(into: PopulationRead, row: Record<string, unknown>): void {
  into.revisionEvents += n(row.revision_events);
  into.nullVisibleSeqRows += n(row.null_visible_seq_rows);
  for (const symbol of idList(row.symbol_set)) into.symbols.add(symbol);
  into.appliedWinners += n(row.applied_winners);
  into.rejectedOlderArrivals += n(row.rejected_older_arrivals);
  into.repeatedPayloadAttempts += n(row.repeated_payload_attempts);
  into.pendingCertificates += n(row.pending_certificates);
  into.unhealthyCertificates += n(row.unhealthy_certificates);
  into.negativeCertificateLags += n(row.negative_certificate_lags);
}

export async function readPopulationChunked(
  client: Queryable,
  budget: ReadBudget,
  windowStart: Date,
  observedAt: Date,
): Promise<PopulationRead> {
  const read: PopulationRead = {
    expectedRevisionLinks: 0, revisionEvents: 0, missingLinkedRevisionEvents: 0, nullVisibleSeqRows: 0,
    symbols: new Set(), appliedWinners: 0, rejectedOlderArrivals: 0, repeatedPayloadAttempts: 0,
    pendingCertificates: 0, unhealthyCertificates: 0, negativeCertificateLags: 0,
    outOfBoundIds: [], boundMisses: 0, lagMinMs: null, lagMaxMs: null, perDay: [],
  };
  const outOfBound = new Set<string>();
  for (const chunk of planGradedChunks(windowStart, observedAt)) {
    const leg = `population ${iso(chunk.start)}`;
    const chunkStartedMs = budget.now();
    const row = (await budgetedQuery(client, budget, GATE_READ_BUDGET.chunkCapMs, leg, POPULATION_CHUNK_SQL, [
      chunk.start, chunk.end,
      new Date(chunk.start.getTime() - EVENT_BOUND_SLACK_MS),
      new Date(chunk.end.getTime() + EVENT_BOUND_SLACK_MS),
    ])).rows[0] as Record<string, unknown>;
    const links = n(row.expected_revision_links);
    const unfound = idList(row.unfound_ids);
    read.expectedRevisionLinks += links;
    addEventAggregates(read, row);
    if (unfound.length > 0) {
      if (unfound.length > EXACTNESS_MAX_IDS) {
        throw new InconclusiveRead(`${leg} exactness`,
          `${unfound.length} of ${links} links not found inside the bound (out-of-bound or absent - not `
          + `determined); the unbounded lookup is capped at ${EXACTNESS_MAX_IDS} ids per chunk`);
      }
      const exact = (await budgetedQuery(client, budget, GATE_READ_BUDGET.chunkCapMs, `${leg} exactness`,
        POPULATION_EXACTNESS_SQL, [unfound])).rows[0] as Record<string, unknown>;
      read.missingLinkedRevisionEvents += n(exact.missing_linked_revision_events);
      addEventAggregates(read, exact);
      for (const id of idList(exact.found_ids)) outOfBound.add(id);
    }
    read.boundMisses += unfound.length;
    const chunkMin = nullableNumber(row.lag_min_ms);
    const chunkMax = nullableNumber(row.lag_max_ms);
    if (chunkMin !== null) read.lagMinMs = read.lagMinMs === null ? chunkMin : Math.min(read.lagMinMs, chunkMin);
    if (chunkMax !== null) read.lagMaxMs = read.lagMaxMs === null ? chunkMax : Math.max(read.lagMaxMs, chunkMax);
    read.perDay.push({
      chunkStart: iso(chunk.start), chunkEnd: iso(chunk.end), partial: chunk.partial,
      expectedRevisionLinks: links, boundMisses: unfound.length, elapsedMs: budget.now() - chunkStartedMs,
      lagMinMs: nullableNumber(row.lag_min_ms), lagP50Ms: nullableNumber(row.lag_p50_ms),
      lagP95Ms: nullableNumber(row.lag_p95_ms), lagMaxMs: nullableNumber(row.lag_max_ms),
    });
  }
  read.outOfBoundIds = [...outOfBound].sort();
  return read;
}

// ── The unlinked leg ───────────────────────────────────────────────────────────────────────────

/** Events created in [$1,$2) with no link among completions completed in [$3,$4). */
export const UNLINKED_CHUNK_SQL = `WITH completed_ids AS MATERIALIZED (
     SELECT saved.revision_id
     FROM xstock_bar_projection_flush_completion c
     CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
     WHERE c.completed_at >= $3 AND c.completed_at < $4
   )
   SELECT count(*)::bigint AS events_in_chunk,
          COALESCE(array_agg(e.revision_id) FILTER (WHERE linked.revision_id IS NULL), '{}') AS candidate_ids
   FROM xstock_bar_revision_event e
   LEFT JOIN completed_ids linked USING (revision_id)
   WHERE e.created_at >= $1 AND e.created_at < $2`;

/** Re-check against the gate's ORIGINAL population: completed_at < observedAt, no lower bound. */
export const UNLINKED_RECHECK_SQL = `WITH candidates AS (
     SELECT revision_id FROM unnest($1::uuid[]) AS ids(revision_id)
   ), linked AS (
     SELECT DISTINCT saved.revision_id
     FROM xstock_bar_projection_flush_completion c
     CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
     WHERE c.completed_at < $2 AND saved.revision_id = ANY($1::uuid[])
   )
   SELECT count(*) FILTER (WHERE linked.revision_id IS NULL)::bigint AS unlinked_revision_events
   FROM candidates c
   LEFT JOIN linked USING (revision_id)`;

export interface UnlinkedRead { unlinkedRevisionEvents: number; eventsScanned: number; recheckedCandidates: number }

export async function readUnlinkedChunked(
  client: Queryable,
  budget: ReadBudget,
  windowStart: Date,
  observedAt: Date,
): Promise<UnlinkedRead> {
  const read: UnlinkedRead = { unlinkedRevisionEvents: 0, eventsScanned: 0, recheckedCandidates: 0 };
  for (const chunk of planGradedChunks(windowStart, observedAt)) {
    const leg = `unlinked ${iso(chunk.start)}`;
    const completionEnd = new Date(Math.min(chunk.end.getTime() + COMPLETION_BOUND_AFTER_MS, observedAt.getTime()));
    const row = (await budgetedQuery(client, budget, GATE_READ_BUDGET.chunkCapMs, leg, UNLINKED_CHUNK_SQL, [
      chunk.start, chunk.end, new Date(chunk.start.getTime() - EVENT_BOUND_SLACK_MS), completionEnd,
    ])).rows[0] as Record<string, unknown>;
    const events = n(row.events_in_chunk);
    const candidates = idList(row.candidate_ids);
    read.eventsScanned += events;
    if (candidates.length > 0) {
      if (candidates.length > EXACTNESS_MAX_IDS) {
        throw new InconclusiveRead(`${leg} recheck`,
          `${candidates.length} of ${events} events not linked by a completion inside the bound (linked `
          + `earlier or genuinely unlinked - not determined); the re-check is capped at ${EXACTNESS_MAX_IDS} ids per chunk`);
      }
      const recheck = (await budgetedQuery(client, budget, GATE_READ_BUDGET.chunkCapMs, `${leg} recheck`,
        UNLINKED_RECHECK_SQL, [candidates, observedAt])).rows[0] as Record<string, unknown>;
      read.unlinkedRevisionEvents += n(recheck.unlinked_revision_events);
      read.recheckedCandidates += candidates.length;
    }
  }
  return read;
}

// ── The identity leg (cross-partition duplicates on the EVENT rows) ───────────────────────────

/** Every revision_id with more than one event row anywhere in the table. */
export const IDENTITY_REVISION_SQL = `SELECT COALESCE(array_agg(revision_id), '{}') AS duplicate_ids,
          COALESCE(array_agg(rows - 1), '{}') AS extra_rows
   FROM (
     SELECT revision_id, count(*)::bigint AS rows
     FROM xstock_bar_revision_event
     GROUP BY revision_id
     HAVING count(*) > 1
   ) d`;

/** Every visible_seq carried by more than one event row anywhere in the table. */
export const IDENTITY_VISIBLE_SEQ_SQL = `SELECT COALESCE(array_agg(visible_seq), '{}') AS duplicate_seqs
   FROM (
     SELECT visible_seq
     FROM xstock_bar_revision_event
     WHERE visible_seq IS NOT NULL
     GROUP BY visible_seq
     HAVING count(*) > 1
   ) d`;

const WINDOW_LINKED_IDS_CTE = `window_linked AS (
     SELECT DISTINCT saved.revision_id
     FROM xstock_bar_projection_flush_admission a
     JOIN xstock_bar_projection_flush_completion c USING (flush_id)
     CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
     WHERE a.admitted_at >= $1 AND a.admitted_at < $2
   )`;

/** Of the duplicated ids, the extra rows belonging to ids linked in the window. */
export const IDENTITY_REVISION_LINKED_SQL = `WITH ${WINDOW_LINKED_IDS_CTE}, dup AS (
     SELECT * FROM unnest($3::uuid[], $4::bigint[]) AS d(revision_id, extra_rows)
   )
   SELECT count(*)::bigint AS linked_duplicate_ids,
          COALESCE(sum(dup.extra_rows), 0)::bigint AS linked_duplicate_extra_rows
   FROM dup JOIN window_linked USING (revision_id)`;

/** Of the duplicated seqs, the extra rows among events linked in the window. */
export const IDENTITY_VISIBLE_SEQ_LINKED_SQL = `WITH ${WINDOW_LINKED_IDS_CTE}, rows_by_seq AS (
     SELECT e.visible_seq, count(*)::bigint AS rows
     FROM xstock_bar_revision_event e
     JOIN window_linked USING (revision_id)
     WHERE e.visible_seq = ANY($3::bigint[])
     GROUP BY e.visible_seq
     HAVING count(*) > 1
   )
   SELECT count(*)::bigint AS linked_duplicate_seqs,
          COALESCE(sum(rows - 1), 0)::bigint AS linked_duplicate_extra_rows
   FROM rows_by_seq`;

/**
 * An id linked TWICE (two completions name it) joins its one event row twice in the single-shot,
 * so the single-shot's distinct count falls below its event count and the identity checks fail.
 * The event-row scans above cannot see that, so the window's links are checked for duplicates too
 * (measured 4.50 s for 8 days' completions, 2026-11-20).
 */
export const IDENTITY_LINK_SQL = `SELECT (count(*) - count(DISTINCT saved.revision_id))::bigint AS duplicate_link_extra
   FROM xstock_bar_projection_flush_admission a
   JOIN xstock_bar_projection_flush_completion c USING (flush_id)
   CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
   WHERE a.admitted_at >= $1 AND a.admitted_at < $2`;

export interface IdentityRead {
  duplicateLinkExtra: number;
  revisionDuplicateIdsTableWide: number;
  linkedRevisionDuplicateIds: number;
  linkedRevisionDuplicateExtraRows: number;
  visibleSeqDuplicatesTableWide: number;
  linkedVisibleSeqDuplicates: number;
  linkedVisibleSeqDuplicateExtraRows: number;
}

export async function readIdentity(
  client: Queryable,
  budget: ReadBudget,
  windowStart: Date,
  observedAt: Date,
): Promise<IdentityRead> {
  const revisions = (await budgetedQuery(client, budget, GATE_READ_BUDGET.identityRevisionCapMs,
    'identity revision_id', IDENTITY_REVISION_SQL)).rows[0] as Record<string, unknown>;
  const duplicateIds = idList(revisions.duplicate_ids);
  const extraRows = (Array.isArray(revisions.extra_rows) ? revisions.extra_rows : []).map((v) => n(v));
  const seqs = (await budgetedQuery(client, budget, GATE_READ_BUDGET.identityVisibleSeqCapMs,
    'identity visible_seq', IDENTITY_VISIBLE_SEQ_SQL)).rows[0] as Record<string, unknown>;
  const duplicateSeqs = (Array.isArray(seqs.duplicate_seqs) ? seqs.duplicate_seqs : []).map(String);

  const links = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'identity links',
    IDENTITY_LINK_SQL, [windowStart, observedAt])).rows[0] as Record<string, unknown>;

  const read: IdentityRead = {
    duplicateLinkExtra: n(links.duplicate_link_extra),
    revisionDuplicateIdsTableWide: duplicateIds.length, linkedRevisionDuplicateIds: 0,
    linkedRevisionDuplicateExtraRows: 0, visibleSeqDuplicatesTableWide: duplicateSeqs.length,
    linkedVisibleSeqDuplicates: 0, linkedVisibleSeqDuplicateExtraRows: 0,
  };
  if (duplicateIds.length > 0) {
    const linked = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'identity revision_id linked',
      IDENTITY_REVISION_LINKED_SQL, [windowStart, observedAt, duplicateIds, extraRows])).rows[0] as Record<string, unknown>;
    read.linkedRevisionDuplicateIds = n(linked.linked_duplicate_ids);
    read.linkedRevisionDuplicateExtraRows = n(linked.linked_duplicate_extra_rows);
  }
  if (duplicateSeqs.length > 0) {
    const linked = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'identity visible_seq linked',
      IDENTITY_VISIBLE_SEQ_LINKED_SQL, [windowStart, observedAt, duplicateSeqs])).rows[0] as Record<string, unknown>;
    read.linkedVisibleSeqDuplicates = n(linked.linked_duplicate_seqs);
    read.linkedVisibleSeqDuplicateExtraRows = n(linked.linked_duplicate_extra_rows);
  }
  return read;
}

/**
 * The gate compares `distinctRevisionIds` and `distinctVisibleSeqs` against `revisionEvents`
 * (one count per joined event row). With no duplicate (event row or link) and no null seq these
 * equal `revisionEvents` exactly as the single-shot's did; any duplicate or null seq makes them
 * smaller, so the identity checks fail whenever the single-shot's would. The reconstructed
 * numbers are exact in the no-duplicate case; with duplicates only their direction is guaranteed.
 */
export function reconstructDistinctCounts(population: PopulationRead, identity: IdentityRead): {
  distinctRevisionIds: number;
  distinctVisibleSeqs: number;
} {
  return {
    distinctRevisionIds: population.revisionEvents - identity.linkedRevisionDuplicateExtraRows
      - identity.duplicateLinkExtra,
    distinctVisibleSeqs: population.revisionEvents - population.nullVisibleSeqRows
      - identity.linkedVisibleSeqDuplicateExtraRows - identity.duplicateLinkExtra,
  };
}

// ── The venue-session leg ──────────────────────────────────────────────────────────────────────

/** Session bounds (20:00 ET to 20:00 ET, Sunday through Thursday starts) fully inside [$1,$2). */
export const SESSION_BOUNDS_SQL = `WITH et_days AS (
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
   SELECT et_date::text, session_start, session_end
   FROM bounds
   WHERE session_start >= $1 AND session_end <= $2
   ORDER BY session_start`;

/** One session: links admitted in [$1,$2); events bounded to [$3,$4) plus the out-of-bound ids $5. */
export const SESSION_CHUNK_SQL = `WITH linked AS (
     SELECT a.admitted_at AS evidence_at, saved.revision_id
     FROM xstock_bar_projection_flush_admission a
     JOIN xstock_bar_projection_flush_completion c USING (flush_id)
     CROSS JOIN LATERAL unnest(c.revision_ids) saved(revision_id)
     WHERE a.admitted_at >= $1 AND a.admitted_at < $2
   ), ev AS (
     SELECT revision_id, symbol FROM xstock_bar_revision_event
     WHERE arrived_at >= $3 AND arrived_at < $4
     UNION ALL
     SELECT revision_id, symbol FROM xstock_bar_revision_event
     WHERE revision_id = ANY($5::uuid[]) AND NOT (arrived_at >= $3 AND arrived_at < $4)
   ), graded_events AS MATERIALIZED (
     SELECT l.evidence_at, e.symbol
     FROM linked l JOIN ev e ON e.revision_id = l.revision_id
   )
   SELECT count(*)::bigint AS revision_events,
          count(DISTINCT symbol)::bigint AS symbols,
          min(evidence_at)::text AS first_event_at,
          max(evidence_at)::text AS last_event_at,
          max(extract(epoch FROM (evidence_at - previous_evidence_at))) AS max_event_gap_seconds
   FROM (
     SELECT evidence_at, symbol, lag(evidence_at) OVER (ORDER BY evidence_at) AS previous_evidence_at
     FROM graded_events
   ) events`;

export interface SessionRow {
  et_date: string;
  session_start: string;
  session_end: string;
  revision_events: number;
  symbols: number;
  first_event_at: string | null;
  last_event_at: string | null;
  max_event_gap_seconds: number | null;
}

export async function readSessionsChunked(
  client: Queryable,
  budget: ReadBudget,
  windowStart: Date,
  observedAt: Date,
  outOfBoundIds: string[],
): Promise<SessionRow[]> {
  const bounds = (await budgetedQuery(client, budget, GATE_READ_BUDGET.otherCapMs, 'session bounds',
    SESSION_BOUNDS_SQL, [windowStart, observedAt])).rows as Array<Record<string, unknown>>;
  const rows: SessionRow[] = [];
  for (const bound of bounds) {
    const start = new Date(bound.session_start as string | Date);
    const end = new Date(bound.session_end as string | Date);
    const row = (await budgetedQuery(client, budget, GATE_READ_BUDGET.chunkCapMs, `session ${String(bound.et_date)}`,
      SESSION_CHUNK_SQL, [
        start, end,
        new Date(start.getTime() - EVENT_BOUND_SLACK_MS), new Date(end.getTime() + EVENT_BOUND_SLACK_MS),
        outOfBoundIds,
      ])).rows[0] as Record<string, unknown>;
    rows.push({
      et_date: String(bound.et_date),
      session_start: start.toISOString(),
      session_end: end.toISOString(),
      revision_events: n(row.revision_events),
      symbols: n(row.symbols),
      first_event_at: row.first_event_at === null ? null : String(row.first_event_at),
      last_event_at: row.last_event_at === null ? null : String(row.last_event_at),
      max_event_gap_seconds: row.max_event_gap_seconds === null ? null : n(row.max_event_gap_seconds),
    });
  }
  return rows;
}
