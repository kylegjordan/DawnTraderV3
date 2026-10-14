/**
 * B-XSTOCK-BAR-AVAILABILITY P5-P7.
 *
 * Availability-aware 15m/60m aggregation is intentionally separate from the
 * shared crypto OHLCData shape and from the legacy xStock reader.  The legacy
 * reader remains available for capture/dual-read, but it cannot manufacture
 * exact provenance from a mutable compact row.
 */
import { createHash } from 'node:crypto';
import { sql } from 'drizzle-orm';
import { db } from '../../db.js';
import { XSTOCK_BAR_AVAILABILITY_CONTRACT } from '../../services/passive-archive/xstock-bar-availability.js';

export type XstockAvailabilityInterval = 15 | 60;

export type XstockBarEligibilityState =
  | 'eligible_certified'
  | 'persisted_but_provider_currentness_unknown'
  | 'retained_revision_ineligible_prior_unknown'
  | 'metadata_unknown_legacy'
  | 'clock_fault'
  | 'unavailable_fail_closed';

export interface XstockAvailabilityAggregate {
  symbol: string;
  intervalMinutes: XstockAvailabilityInterval;
  timestamp: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  sourceBarCount: number;
  aggregateRevisionId: string | null;
  aggregateHash: string | null;
  sourceRevisionSetHash: string;
  sourceRevisionIds: string[];
  /** Exact UTC database timestamp text (six fractional digits); never round through JS Date. */
  sourceMaxVisibleBy: string | null;
  sourceMaxVisibleSeq: number | null;
  /** Exact UTC database timestamp text (six fractional digits); never round through JS Date. */
  readObservedAt: string | null;
  readObservedSeq: number | null;
  certificatePrimaryIdentity: string | null;
  contractVersion: typeof XSTOCK_BAR_AVAILABILITY_CONTRACT | null;
  eligibilityState: XstockBarEligibilityState;
  providerCurrentnessState: 'provider_currentness_unknown';
}

export interface XstockWindowManifest {
  manifestId: string;
  windowHash: string;
  symbol: string;
  intervalMinutes: XstockAvailabilityInterval;
  aggregateRevisionIds: string[];
  firstBucketTs: Date;
  lastBucketTs: Date;
  sourceMaxVisibleBy: string;
  sourceMaxVisibleSeq: number;
  certificatePrimaryIdentity: string;
  contractVersion: typeof XSTOCK_BAR_AVAILABILITY_CONTRACT;
}

interface AggregateQueryRow {
  symbol: string;
  bucket_ts: Date | string;
  bar_open: string;
  bar_high: string;
  bar_low: string;
  bar_close: string;
  bar_volume: string;
  source_bar_count: number | string;
  source_revision_ids: string[];
  source_max_visible_by: string | null;
  source_max_visible_seq: number | string | null;
  source_revision_set_hash_seed: string;
  eligibility_state: XstockBarEligibilityState;
}

interface ReadObservationRow {
  read_observed_at: string;
  read_observed_seq: number | string;
  certificate_primary_identity: string;
}

interface AggregateRevisionRow {
  client_key: string;
  aggregate_revision_id: string;
}

interface EligibleDraft {
  row: AggregateQueryRow;
  clientKey: string;
  aggregateHash: string;
  sourceRevisionSetHash: string;
  canonicalPayload: Record<string, unknown>;
}

function resultRows<T>(result: unknown): T[] {
  if (Array.isArray(result)) return result as T[];
  const rows = (result as { rows?: unknown } | null)?.rows;
  if (!Array.isArray(rows)) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] unexpected aggregate database result shape');
  }
  return rows as T[];
}

function sha256(value: string): string {
  return createHash('sha256').update(value).digest('hex');
}

function iso(value: Date | string): string {
  const parsed = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(parsed.getTime())) {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] invalid database timestamp ${String(value)}`);
  }
  return parsed.toISOString();
}

function validateInterval(intervalMinutes: number): asserts intervalMinutes is XstockAvailabilityInterval {
  if (intervalMinutes !== 15 && intervalMinutes !== 60) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] interval ${intervalMinutes} is unsupported; `
      + 'only revision-aware 15m and 60m reads are permitted',
    );
  }
}

/**
 * Read the greatest applied projection generation for every source minute,
 * classify that exact winner, aggregate only that winner set, persist/reuse an
 * immutable aggregate revision for eligible bars, and attach the later primary
 * read observation. A certified lower generation is never resurrected when the
 * actual winner is uncertified or later than the requested cutoff.
 */
async function aggregateAvailableXstockOHLCInternal(
  symbols: string[],
  intervalMinutes: XstockAvailabilityInterval,
  lookbackHours: number,
  requestedCutoff?: Date,
  readOnlyPreview = false,
): Promise<Map<string, XstockAvailabilityAggregate[]>> {
  validateInterval(intervalMinutes);
  if (!Number.isFinite(lookbackHours) || lookbackHours <= 0) {
    throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] invalid aggregate lookback ${lookbackHours}`);
  }
  if (requestedCutoff && !Number.isFinite(requestedCutoff.getTime())) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] invalid requested cutoff');
  }

  const out = new Map<string, XstockAvailabilityAggregate[]>();
  for (const symbol of symbols) out.set(symbol, []);
  if (symbols.length === 0) return out;

  const symbolListSql = symbols.map((symbol) => `'${symbol.replace(/'/g, "''")}'`).join(',');
  const bucketSeconds = intervalMinutes * 60;
  const cutoffIso = requestedCutoff?.toISOString() ?? null;

  return db.transaction(async (tx) => {
    if (readOnlyPreview) {
      await tx.execute(sql`SET TRANSACTION READ ONLY`);
    }
    const queryResult = await tx.execute(sql`
      WITH primary_context AS (
        SELECT current_database() || '@' || COALESCE(inet_server_addr()::text, 'local') || ':'
          || COALESCE(inet_server_port()::text, 'local') || '/system:'
          || (SELECT system_identifier::text FROM pg_control_system())
          AS primary_identity,
          COALESCE(${cutoffIso}::timestamptz, clock_timestamp()) AS effective_cutoff
      ),
      sources AS (
        SELECT
          p.symbol,
          p.interval_begin,
          COALESCE(e.open, p.open) AS open,
          COALESCE(e.high, p.high) AS high,
          COALESCE(e.low, p.low) AS low,
          COALESCE(e.close, p.close) AS close,
          COALESCE(e.volume, p.volume) AS volume,
          p.winning_revision_id,
          p.projection_generation AS compact_generation,
          e.revision_id,
          e.projection_generation,
          e.visible_by,
          e.visible_seq,
          e.certificate_primary_identity,
          e.certificate_clock_healthy,
          e.contract_version,
          e.projection_applied,
          c.effective_cutoff,
          c.primary_identity,
          e.open = p.open AND e.high = p.high AND e.low = p.low
            AND e.close = p.close AND e.volume = p.volume
            AND e.projection_generation = p.projection_generation AS projection_link_healthy
        FROM xstock_spot_ohlc_1m p
        CROSS JOIN primary_context c
        LEFT JOIN xstock_bar_revision_event e
          ON e.revision_id = p.winning_revision_id
         AND e.arrived_at = p.arrived_at
        WHERE p.symbol IN (${sql.raw(symbolListSql)})
          AND p.interval_begin > c.effective_cutoff
            - (${lookbackHours}::double precision * INTERVAL '1 hour')
          AND p.interval_begin <= c.effective_cutoff
      ),
      bucketed AS (
        SELECT s.*,
          to_timestamp(floor(extract(epoch from s.interval_begin) / ${bucketSeconds}) * ${bucketSeconds}) AS bucket_ts
        FROM sources s
      )
      SELECT
        symbol,
        bucket_ts,
        (array_agg(open ORDER BY interval_begin ASC))[1] AS bar_open,
        MAX(high) AS bar_high,
        MIN(low) AS bar_low,
        (array_agg(close ORDER BY interval_begin DESC))[1] AS bar_close,
        SUM(volume) AS bar_volume,
        COUNT(*) AS source_bar_count,
        COALESCE(
          array_agg(revision_id ORDER BY interval_begin ASC) FILTER (WHERE revision_id IS NOT NULL),
          ARRAY[]::uuid[]
        ) AS source_revision_ids,
        to_char(
          MAX(visible_by) AT TIME ZONE 'UTC',
          'YYYY-MM-DD"T"HH24:MI:SS.US"Z"'
        ) AS source_max_visible_by,
        MAX(visible_seq) AS source_max_visible_seq,
        COALESCE(string_agg(revision_id::text, ',' ORDER BY interval_begin ASC), '')
          AS source_revision_set_hash_seed,
        CASE
          WHEN bool_or(winning_revision_id IS NULL) THEN 'metadata_unknown_legacy'
          WHEN bool_or(revision_id IS NULL OR projection_applied IS DISTINCT FROM true
            OR projection_link_healthy IS DISTINCT FROM true)
            THEN 'unavailable_fail_closed'
          WHEN bool_or(visible_by IS NULL OR visible_seq IS NULL) THEN 'retained_revision_ineligible_prior_unknown'
          WHEN bool_or(certificate_clock_healthy IS DISTINCT FROM true) THEN 'clock_fault'
          WHEN bool_or(contract_version IS DISTINCT FROM ${XSTOCK_BAR_AVAILABILITY_CONTRACT}
            OR certificate_primary_identity IS DISTINCT FROM primary_identity)
            THEN 'unavailable_fail_closed'
          WHEN bool_or(visible_by > effective_cutoff) THEN 'retained_revision_ineligible_prior_unknown'
          ELSE 'eligible_certified'
        END AS eligibility_state
      FROM bucketed
      GROUP BY symbol, bucket_ts
      ORDER BY symbol, bucket_ts ASC
    `);
    const rows = resultRows<AggregateQueryRow>(queryResult);

    if (readOnlyPreview) {
      for (const row of rows) {
        out.get(row.symbol)?.push({
          symbol: row.symbol,
          intervalMinutes,
          timestamp: new Date(row.bucket_ts).getTime(),
          open: Number(row.bar_open),
          high: Number(row.bar_high),
          low: Number(row.bar_low),
          close: Number(row.bar_close),
          volume: Number(row.bar_volume),
          sourceBarCount: Number(row.source_bar_count),
          aggregateRevisionId: null,
          aggregateHash: null,
          sourceRevisionSetHash: sha256(row.source_revision_set_hash_seed),
          sourceRevisionIds: row.source_revision_ids,
          sourceMaxVisibleBy: row.source_max_visible_by,
          sourceMaxVisibleSeq: row.source_max_visible_seq == null ? null : Number(row.source_max_visible_seq),
          readObservedAt: null,
          readObservedSeq: null,
          certificatePrimaryIdentity: null,
          contractVersion: null,
          eligibilityState: row.eligibility_state,
          providerCurrentnessState: 'provider_currentness_unknown',
        });
      }
      return out;
    }

    // This statement occurs after the source-set read in the same transaction.
    // Its database wall time is therefore a conservative upper bound on when
    // that exact set was readable; the sequence supplies causal order.
    const observationResult = await tx.execute(sql`
      SELECT
        to_char(read_observed_at AT TIME ZONE 'UTC', 'YYYY-MM-DD"T"HH24:MI:SS.US"Z"')
          AS read_observed_at,
        read_observed_seq,
        certificate_primary_identity
      FROM observe_xstock_bar_read(${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text)
    `);
    const observations = resultRows<ReadObservationRow>(observationResult);
    if (observations.length !== 1) {
      throw new Error(
        `[B-XSTOCK-BAR-AVAILABILITY] expected one read observation, received ${observations.length}`,
      );
    }
    const observation = observations[0];

    const eligibleDrafts: EligibleDraft[] = [];
    for (const row of rows) {
      if (row.eligibility_state !== 'eligible_certified') continue;
      const sourceRevisionSetHash = sha256(row.source_revision_set_hash_seed);
      const canonicalPayload = {
        symbol: row.symbol,
        intervalMinutes,
        bucketTs: iso(row.bucket_ts),
        open: String(row.bar_open),
        high: String(row.bar_high),
        low: String(row.bar_low),
        close: String(row.bar_close),
        volume: String(row.bar_volume),
        sourceBarCount: Number(row.source_bar_count),
        sourceRevisionIds: row.source_revision_ids,
        sourceRevisionSetHash,
        sourceMaxVisibleBy: row.source_max_visible_by as string,
        sourceMaxVisibleSeq: Number(row.source_max_visible_seq),
        certificatePrimaryIdentity: observation.certificate_primary_identity,
        contractVersion: XSTOCK_BAR_AVAILABILITY_CONTRACT,
      };
      const aggregateHash = sha256(JSON.stringify(canonicalPayload));
      eligibleDrafts.push({
        row,
        clientKey: `${row.symbol}|${intervalMinutes}|${iso(row.bucket_ts)}`,
        aggregateHash,
        sourceRevisionSetHash,
        canonicalPayload,
      });
    }

    const revisionIds = new Map<string, string>();
    if (eligibleDrafts.length > 0) {
      const payload = eligibleDrafts.map((draft) => ({
        clientKey: draft.clientKey,
        aggregateHash: draft.aggregateHash,
        sourceRevisionSetHash: draft.sourceRevisionSetHash,
        sourceRevisionIds: draft.row.source_revision_ids,
        sourceMaxVisibleBy: draft.row.source_max_visible_by as string,
        sourceMaxVisibleSeq: Number(draft.row.source_max_visible_seq),
        certificatePrimaryIdentity: observation.certificate_primary_identity,
        sourceBarCount: Number(draft.row.source_bar_count),
        bucketTs: iso(draft.row.bucket_ts),
        symbol: draft.row.symbol,
        intervalMinutes,
        open: String(draft.row.bar_open),
        high: String(draft.row.bar_high),
        low: String(draft.row.bar_low),
        close: String(draft.row.bar_close),
        volume: String(draft.row.bar_volume),
        canonicalPayload: draft.canonicalPayload,
      }));
      const recordResult = await tx.execute(sql`
        SELECT * FROM record_xstock_bar_aggregate_revisions(
          ${JSON.stringify(payload)}::jsonb,
          ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
        )
      `);
      const recorded = resultRows<AggregateRevisionRow>(recordResult);
      if (recorded.length !== eligibleDrafts.length) {
        throw new Error(
          `[B-XSTOCK-BAR-AVAILABILITY] aggregate revision exact-set mismatch `
          + `(expected=${eligibleDrafts.length}, returned=${recorded.length})`,
        );
      }
      for (const record of recorded) {
        if (revisionIds.has(record.client_key)) {
          throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] duplicate aggregate client key ${record.client_key}`);
        }
        revisionIds.set(record.client_key, record.aggregate_revision_id);
      }
      for (const draft of eligibleDrafts) {
        if (!revisionIds.has(draft.clientKey)) {
          throw new Error(`[B-XSTOCK-BAR-AVAILABILITY] missing aggregate revision ${draft.clientKey}`);
        }
      }
    }

    const eligibleByKey = new Map(eligibleDrafts.map((draft) => [draft.clientKey, draft]));
    for (const row of rows) {
      const clientKey = `${row.symbol}|${intervalMinutes}|${iso(row.bucket_ts)}`;
      const draft = eligibleByKey.get(clientKey);
      const bar: XstockAvailabilityAggregate = {
        symbol: row.symbol,
        intervalMinutes,
        timestamp: new Date(row.bucket_ts).getTime(),
        open: Number(row.bar_open),
        high: Number(row.bar_high),
        low: Number(row.bar_low),
        close: Number(row.bar_close),
        volume: Number(row.bar_volume),
        sourceBarCount: Number(row.source_bar_count),
        aggregateRevisionId: draft ? revisionIds.get(clientKey) ?? null : null,
        aggregateHash: draft?.aggregateHash ?? null,
        sourceRevisionSetHash: draft?.sourceRevisionSetHash ?? sha256(row.source_revision_set_hash_seed),
        sourceRevisionIds: row.source_revision_ids,
        sourceMaxVisibleBy: row.source_max_visible_by,
        sourceMaxVisibleSeq: row.source_max_visible_seq == null ? null : Number(row.source_max_visible_seq),
        readObservedAt: observation.read_observed_at,
        readObservedSeq: Number(observation.read_observed_seq),
        certificatePrimaryIdentity: observation.certificate_primary_identity,
        contractVersion: XSTOCK_BAR_AVAILABILITY_CONTRACT,
        eligibilityState: row.eligibility_state,
        providerCurrentnessState: 'provider_currentness_unknown',
      };
      out.get(row.symbol)?.push(bar);
    }

    return out;
  });
}

export async function aggregateAvailableXstockOHLC(
  symbols: string[],
  intervalMinutes: XstockAvailabilityInterval,
  lookbackHours: number,
  requestedCutoff?: Date,
): Promise<Map<string, XstockAvailabilityAggregate[]>> {
  return aggregateAvailableXstockOHLCInternal(
    symbols,
    intervalMinutes,
    lookbackHours,
    requestedCutoff,
    false,
  );
}

/**
 * Read-only prewarm preview. It uses the same winner/certificate query but
 * deliberately returns no aggregate or read-observation identity, because a
 * dry run must not mutate the database merely to manufacture those IDs.
 */
export async function previewAvailableXstockOHLC(
  symbols: string[],
  intervalMinutes: XstockAvailabilityInterval,
  lookbackHours: number,
  requestedCutoff?: Date,
): Promise<Map<string, XstockAvailabilityAggregate[]>> {
  return aggregateAvailableXstockOHLCInternal(
    symbols,
    intervalMinutes,
    lookbackHours,
    requestedCutoff,
    true,
  );
}

export type EligibleXstockAvailabilityAggregate = XstockAvailabilityAggregate & {
  aggregateRevisionId: string;
  aggregateHash: string;
  sourceMaxVisibleBy: string;
  sourceMaxVisibleSeq: number;
  readObservedAt: string;
  readObservedSeq: number;
  certificatePrimaryIdentity: string;
  contractVersion: typeof XSTOCK_BAR_AVAILABILITY_CONTRACT;
};

export function assertEligibleXstockAggregate(
  bar: XstockAvailabilityAggregate,
): asserts bar is EligibleXstockAvailabilityAggregate {
  if (bar.eligibilityState !== 'eligible_certified'
      || !bar.aggregateRevisionId
      || !bar.aggregateHash
      || !bar.sourceMaxVisibleBy
      || bar.sourceMaxVisibleSeq == null
      || !bar.readObservedAt
      || bar.readObservedSeq == null
      || !bar.certificatePrimaryIdentity
      || bar.contractVersion !== XSTOCK_BAR_AVAILABILITY_CONTRACT
      || bar.sourceRevisionIds.length === 0
      || bar.sourceRevisionIds.length !== bar.sourceBarCount
      || !/^[0-9a-f]{64}$/.test(bar.sourceRevisionSetHash)
      || bar.sourceBarCount <= 0
      || !Number.isFinite(Date.parse(bar.sourceMaxVisibleBy ?? ''))
      || !Number.isFinite(Date.parse(bar.readObservedAt ?? ''))
      || Date.parse(bar.readObservedAt ?? '') < Date.parse(bar.sourceMaxVisibleBy ?? '')
      || ![
        bar.timestamp,
        bar.open,
        bar.high,
        bar.low,
        bar.close,
        bar.volume,
      ].every(Number.isFinite)) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] ineligible xStock aggregate `
      + `${bar.symbol}@${new Date(bar.timestamp).toISOString()} state=${bar.eligibilityState}`,
    );
  }
}

/**
 * Persist/reuse one content-addressed settled window. Callers choose the
 * settled slice; this function proves it is ordered, homogeneous, eligible,
 * and complete before a manifest identity can be returned.
 */
export async function persistSettledXstockWindowManifest(
  bars: XstockAvailabilityAggregate[],
): Promise<XstockWindowManifest> {
  if (bars.length === 0) {
    throw new Error('[B-XSTOCK-BAR-AVAILABILITY] cannot manifest an empty xStock window');
  }
  const ordered = [...bars].sort((a, b) => a.timestamp - b.timestamp);
  assertEligibleXstockAggregate(ordered[0]);
  const symbol = ordered[0].symbol;
  const intervalMinutes = ordered[0].intervalMinutes;
  const certificatePrimaryIdentity = ordered[0].certificatePrimaryIdentity;
  const seenTimestamps = new Set<number>();
  const eligibleBars: EligibleXstockAvailabilityAggregate[] = [];
  for (const bar of ordered) {
    assertEligibleXstockAggregate(bar);
    if (bar.symbol !== symbol || bar.intervalMinutes !== intervalMinutes) {
      throw new Error('[B-XSTOCK-BAR-AVAILABILITY] manifest window mixes symbols or intervals');
    }
    if (bar.certificatePrimaryIdentity !== certificatePrimaryIdentity) {
      throw new Error('[B-XSTOCK-BAR-AVAILABILITY] manifest window mixes primary identities');
    }
    if (seenTimestamps.has(bar.timestamp)) {
      throw new Error('[B-XSTOCK-BAR-AVAILABILITY] manifest window contains duplicate buckets');
    }
    seenTimestamps.add(bar.timestamp);
    eligibleBars.push(bar);
  }

  const aggregateRevisionIds = eligibleBars.map((bar) => bar.aggregateRevisionId);
  const sourceMaxVisibleBy = eligibleBars.reduce(
    (latest, bar) => bar.sourceMaxVisibleBy > latest ? bar.sourceMaxVisibleBy : latest,
    eligibleBars[0].sourceMaxVisibleBy,
  );
  const sourceMaxVisibleSeq = Math.max(
    ...eligibleBars.map((bar) => bar.sourceMaxVisibleSeq),
  );
  const canonicalPayload = {
    symbol,
    intervalMinutes,
    aggregateRevisionIds,
    firstBucketTs: new Date(ordered[0].timestamp).toISOString(),
    lastBucketTs: new Date(ordered[ordered.length - 1].timestamp).toISOString(),
    sourceMaxVisibleBy,
    sourceMaxVisibleSeq,
    certificatePrimaryIdentity,
    contractVersion: XSTOCK_BAR_AVAILABILITY_CONTRACT,
  };
  const windowHash = sha256(JSON.stringify(canonicalPayload));
  const payload = { ...canonicalPayload, windowHash, canonicalPayload };
  const recordResult = await db.execute(sql`
    SELECT record_xstock_bar_window_manifest(
      ${JSON.stringify(payload)}::jsonb,
      ${XSTOCK_BAR_AVAILABILITY_CONTRACT}::text
    ) AS manifest_id
  `);
  const recorded = resultRows<{ manifest_id: string }>(recordResult);
  if (recorded.length !== 1 || !recorded[0].manifest_id) {
    throw new Error(
      `[B-XSTOCK-BAR-AVAILABILITY] expected one manifest identity, received ${recorded.length}`,
    );
  }

  return {
    manifestId: recorded[0].manifest_id,
    windowHash,
    symbol,
    intervalMinutes,
    aggregateRevisionIds,
    firstBucketTs: new Date(ordered[0].timestamp),
    lastBucketTs: new Date(ordered[ordered.length - 1].timestamp),
    sourceMaxVisibleBy,
    sourceMaxVisibleSeq,
    certificatePrimaryIdentity,
    contractVersion: XSTOCK_BAR_AVAILABILITY_CONTRACT,
  };
}
