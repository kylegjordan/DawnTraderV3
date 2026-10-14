import { beforeEach, describe, expect, it, vi } from 'vitest';

const { execute, aggregateAvailable } = vi.hoisted(() => ({
  execute: vi.fn(),
  aggregateAvailable: vi.fn(),
}));

vi.mock('../../db.js', () => ({ db: { execute } }));
vi.mock('../../asset_classes/xstock_spot/ohlc-aggregator.js', () => ({
  aggregateXstockOHLC: vi.fn(),
}));
vi.mock('../../asset_classes/xstock_spot/availability-aggregator.js', () => ({
  aggregateAvailableXstockOHLC: aggregateAvailable,
  assertEligibleXstockAggregate: (bar: any) => {
    if (bar.eligibilityState !== 'eligible_certified' || !bar.aggregateRevisionId) {
      throw new Error('ineligible');
    }
  },
}));
vi.mock('../../services/passive-archive/xstock-bar-availability.js', () => ({
  XSTOCK_BAR_AVAILABILITY_CONTRACT: 'xstock-bar-availability/v1',
}));

import { xstockOhlcCache } from '../../services/xstock-ohlc-cache.js';

const exactSnapshotRow = {
  symbol: 'CORZ/USD',
  bucket_ts: '2026-10-14T15:00:00.000Z',
  open: '10', high: '12', low: '9', close: '11', volume: '100', source_bar_count: 1,
  aggregate_revision_id: '11111111-1111-4111-8111-111111111111',
  aggregate_hash: 'a'.repeat(64),
  source_revision_set_hash: 'b'.repeat(64),
  source_max_visible_by: '2026-10-14T15:01:00.123456Z',
  source_max_visible_seq: '3',
  read_observed_at: '2026-10-14T15:02:00.234567Z',
  read_observed_seq: '4',
  certificate_primary_identity: 'test@primary',
  availability_contract_version: 'xstock-bar-availability/v1',
  eligibility_state: 'eligible_certified',
  source_revision_ids: ['aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa'],
  persisted_symbol: 'CORZ/USD',
  persisted_interval_minutes: 15,
  persisted_open: '10.00000000',
  persisted_high: '12.00000000',
  persisted_low: '9.00000000',
  persisted_close: '11.00000000',
  persisted_volume: '100.00000000',
  persisted_source_bar_count: 1,
  persisted_aggregate_hash: 'a'.repeat(64),
  persisted_source_revision_set_hash: 'b'.repeat(64),
  persisted_source_max_visible_by: '2026-10-14T15:01:00.123456Z',
  persisted_source_max_visible_seq: '3',
  persisted_certificate_primary_identity: 'test@primary',
  persisted_contract_version: 'xstock-bar-availability/v1',
  current_primary_identity: 'test@primary',
};

const ineligibleLive = {
  symbol: 'CORZ/USD',
  intervalMinutes: 15 as const,
  timestamp: new Date(exactSnapshotRow.bucket_ts).getTime(),
  open: 10, high: 13, low: 9, close: 12, volume: 101, sourceBarCount: 1,
  aggregateRevisionId: null,
  aggregateHash: null,
  sourceRevisionSetHash: 'c'.repeat(64),
  sourceRevisionIds: ['bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb'],
  sourceMaxVisibleBy: null,
  sourceMaxVisibleSeq: null,
  readObservedAt: '2026-10-14T15:03:00.234567Z',
  readObservedSeq: 5,
  certificatePrimaryIdentity: 'test@primary',
  contractVersion: 'xstock-bar-availability/v1' as const,
  eligibilityState: 'retained_revision_ineligible_prior_unknown' as const,
  providerCurrentnessState: 'provider_currentness_unknown' as const,
};

const eligibleLive = {
  ...ineligibleLive,
  aggregateRevisionId: '22222222-2222-4222-8222-222222222222',
  aggregateHash: 'd'.repeat(64),
  sourceMaxVisibleBy: '2026-10-14T15:01:00.123456Z',
  sourceMaxVisibleSeq: 6,
  eligibilityState: 'eligible_certified' as const,
};

beforeEach(() => {
  xstockOhlcCache._resetForTests();
  execute.mockReset();
  aggregateAvailable.mockReset();
});

describe('B-XSTOCK-BAR-AVAILABILITY cache contract', () => {
  it('live collision replaces the entire snapshot revision object and TTL retains its read evidence', async () => {
    execute.mockResolvedValueOnce({ rows: [exactSnapshotRow] });
    aggregateAvailable.mockResolvedValueOnce(new Map([['CORZ/USD', [ineligibleLive]]]));

    const first = await xstockOhlcCache.getAvailabilityDataBatch(['CORZ/USD'], 15);
    const [winner] = first.get('CORZ/USD') ?? [];
    expect(winner.close).toBe(12); // positive control: live won the label collision
    expect(winner.aggregateRevisionId).toBeNull();
    expect(winner.eligibilityState).toBe('retained_revision_ineligible_prior_unknown');
    expect(winner.readObservedSeq).toBe(5);

    const second = await xstockOhlcCache.getAvailabilityDataBatch(['CORZ/USD'], 15);
    expect(second.get('CORZ/USD')?.[0]).toEqual(winner);
    expect(execute).toHaveBeenCalledTimes(1);
    expect(aggregateAvailable).toHaveBeenCalledTimes(1);
  });

  it('marks a snapshot row without complete revision linkage as legacy instead of exact', async () => {
    execute.mockResolvedValueOnce({
      rows: [{
        ...exactSnapshotRow,
        aggregate_revision_id: null,
        aggregate_hash: null,
        source_revision_set_hash: null,
        source_max_visible_by: null,
        source_max_visible_seq: null,
        read_observed_at: null,
        read_observed_seq: null,
        certificate_primary_identity: null,
        availability_contract_version: null,
        eligibility_state: null,
        source_revision_ids: null,
      }],
    });
    aggregateAvailable.mockResolvedValueOnce(new Map([['CORZ/USD', []]]));

    const result = await xstockOhlcCache.getAvailabilityDataBatch(['CORZ/USD'], 60);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(bar.close).toBe(11); // positive control: snapshot row was observed
    expect(bar.eligibilityState).toBe('metadata_unknown_legacy');
    expect(bar.aggregateRevisionId).toBeNull();
    expect(bar.contractVersion).toBeNull();
  });

  it('marks a snapshot whose values diverge from its aggregate revision as legacy', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ ...exactSnapshotRow, persisted_close: '99.00000000' }],
    });
    aggregateAvailable.mockResolvedValueOnce(new Map([['CORZ/USD', []]]));

    const result = await xstockOhlcCache.getAvailabilityDataBatch(['CORZ/USD'], 15);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(bar.close).toBe(11); // positive control: the snapshot row was returned
    expect(bar.eligibilityState).toBe('metadata_unknown_legacy');
    expect(bar.aggregateRevisionId).toBeNull();
  });

  it('marks a snapshot certified on a different primary identity as legacy', async () => {
    execute.mockResolvedValueOnce({
      rows: [{ ...exactSnapshotRow, current_primary_identity: 'other@primary' }],
    });
    aggregateAvailable.mockResolvedValueOnce(new Map([['CORZ/USD', []]]));

    const result = await xstockOhlcCache.getAvailabilityDataBatch(['CORZ/USD'], 15);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(bar.close).toBe(11); // positive control: the mismatched snapshot was read
    expect(bar.eligibilityState).toBe('metadata_unknown_legacy');
    expect(bar.aggregateRevisionId).toBeNull();
  });

  it('prewarm awaits an exact snapshot write and reports ineligible buckets separately', async () => {
    aggregateAvailable.mockResolvedValueOnce(new Map([[
      'CORZ/USD',
      [eligibleLive, { ...ineligibleLive, timestamp: ineligibleLive.timestamp + 60_000 }],
    ]]));
    execute.mockResolvedValueOnce({ rowCount: 1 });

    const result = await xstockOhlcCache.prewarmAvailabilitySnapshot('CORZ/USD', 15, 336);
    expect(result).toEqual({
      bucketsRead: 2,
      eligibleBuckets: 1,
      ineligibleBuckets: 1,
      snapshotRowsWritten: 1,
    });
    expect(aggregateAvailable).toHaveBeenCalledWith(['CORZ/USD'], 15, 336);
    expect(execute).toHaveBeenCalledTimes(1);
  });
});
