import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: { results: unknown[]; calls: unknown[] } = { results: [], calls: [] };

vi.mock('../../db.js', () => ({
  db: {
    execute: async (query: unknown) => {
      state.calls.push(query);
      const result = state.results.shift();
      if (result instanceof Error) throw result;
      return { rows: result ?? [] };
    },
    transaction: async (fn: (tx: { execute: (query: unknown) => Promise<unknown> }) => Promise<unknown>) => fn({
      execute: async (query: unknown) => {
        state.calls.push(query);
        const result = state.results.shift();
        if (result instanceof Error) throw result;
        return { rows: result ?? [] };
      },
    }),
  },
}));

import {
  aggregateAvailableXstockOHLC,
  assertEligibleXstockAggregate,
  persistSettledXstockWindowManifest,
  previewAvailableXstockOHLC,
} from '../../asset_classes/xstock_spot/availability-aggregator.js';

const sourceIds = [
  '11111111-1111-4111-8111-111111111111',
  '22222222-2222-4222-8222-222222222222',
];

const aggregateRow = (eligibility_state = 'eligible_certified') => ({
  symbol: 'CORZ/USD',
  bucket_ts: '2026-10-14T15:00:00.000Z',
  bar_open: '10.00000000',
  bar_high: '12.00000000',
  bar_low: '9.00000000',
  bar_close: '11.00000000',
  bar_volume: '123.00000000',
  source_bar_count: '2',
  source_revision_ids: sourceIds,
  source_max_visible_by: eligibility_state === 'eligible_certified' ? '2026-10-14T15:02:00.123456Z' : null,
  source_max_visible_seq: eligibility_state === 'eligible_certified' ? '8' : null,
  source_revision_set_hash_seed: sourceIds.join(','),
  eligibility_state,
});

const observation = [{
  read_observed_at: '2026-10-14T15:03:00.234567Z',
  read_observed_seq: '12',
  certificate_primary_identity: 'test@primary',
}];

beforeEach(() => {
  state.results = [];
  state.calls = [];
});

describe('B-XSTOCK-BAR-AVAILABILITY aggregate contract', () => {
  it('returns one whole eligible revision object and its later read observation', async () => {
    state.results.push(
      [aggregateRow()],
      observation,
      [{
        client_key: 'CORZ/USD|15|2026-10-14T15:00:00.000Z',
        aggregate_revision_id: '33333333-3333-4333-8333-333333333333',
      }],
    );

    const result = await aggregateAvailableXstockOHLC(['CORZ/USD'], 15, 6);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(state.calls).toHaveLength(3); // source read, later observation, immutable revision readback
    expect(bar.sourceRevisionIds).toEqual(sourceIds);
    expect(bar.aggregateRevisionId).toBe('33333333-3333-4333-8333-333333333333');
    expect(bar.readObservedSeq).toBe(12);
    expect(bar.sourceMaxVisibleBy).toBe('2026-10-14T15:02:00.123456Z');
    expect(bar.readObservedAt).toBe('2026-10-14T15:03:00.234567Z');
    expect(() => assertEligibleXstockAggregate(bar)).not.toThrow();
  });

  it('does not mint an aggregate identity for the uncertified winning generation', async () => {
    state.results.push(
      [aggregateRow('retained_revision_ineligible_prior_unknown')],
      observation,
    );

    const result = await aggregateAvailableXstockOHLC(['CORZ/USD'], 60, 24);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(state.calls).toHaveLength(2); // no aggregate-record statement
    expect(bar.eligibilityState).toBe('retained_revision_ineligible_prior_unknown');
    expect(bar.aggregateRevisionId).toBeNull();
    expect(() => assertEligibleXstockAggregate(bar)).toThrow(/ineligible xStock aggregate/);
  });

  it('refuses a partial aggregate-revision readback', async () => {
    state.results.push([aggregateRow()], observation, []);
    await expect(
      aggregateAvailableXstockOHLC(['CORZ/USD'], 15, 6),
    ).rejects.toThrow(/aggregate revision exact-set mismatch/);
  });

  it('hard-fails unsupported intervals before touching the database', async () => {
    await expect(
      aggregateAvailableXstockOHLC(['CORZ/USD'], 240 as any, 24),
    ).rejects.toThrow(/only revision-aware 15m and 60m reads are permitted/);
    expect(state.calls).toHaveLength(0);
  });

  it('previews the same eligibility in a read-only transaction without minting identity', async () => {
    state.results.push([], [aggregateRow()]); // SET TRANSACTION READ ONLY, source read
    const result = await previewAvailableXstockOHLC(['CORZ/USD'], 15, 6);
    const [bar] = result.get('CORZ/USD') ?? [];
    expect(state.calls).toHaveLength(2);
    expect(JSON.stringify(state.calls[0])).toContain('SET TRANSACTION READ ONLY');
    expect(bar.eligibilityState).toBe('eligible_certified');
    expect(bar.aggregateRevisionId).toBeNull();
    expect(bar.readObservedAt).toBeNull();
  });

  it('content-addresses an eligible settled window by ordered aggregate identities', async () => {
    state.results.push(
      [aggregateRow()],
      observation,
      [{
        client_key: 'CORZ/USD|15|2026-10-14T15:00:00.000Z',
        aggregate_revision_id: '33333333-3333-4333-8333-333333333333',
      }],
    );
    const result = await aggregateAvailableXstockOHLC(['CORZ/USD'], 15, 6);
    const bars = result.get('CORZ/USD') ?? [];
    state.results.push([{ manifest_id: '44444444-4444-4444-8444-444444444444' }]);

    const manifest = await persistSettledXstockWindowManifest(bars);
    expect(manifest.manifestId).toBe('44444444-4444-4444-8444-444444444444');
    expect(manifest.aggregateRevisionIds).toEqual(['33333333-3333-4333-8333-333333333333']);
    expect(manifest.certificatePrimaryIdentity).toBe('test@primary');
    expect(manifest.windowHash).toMatch(/^[0-9a-f]{64}$/);
  });

  it('refuses to manifest aggregate revisions observed on different primaries', async () => {
    state.results.push(
      [aggregateRow()],
      observation,
      [{
        client_key: 'CORZ/USD|15|2026-10-14T15:00:00.000Z',
        aggregate_revision_id: '33333333-3333-4333-8333-333333333333',
      }],
    );
    const result = await aggregateAvailableXstockOHLC(['CORZ/USD'], 15, 6);
    const [bar] = result.get('CORZ/USD') ?? [];
    const laterBar = {
      ...bar,
      timestamp: bar.timestamp + 15 * 60_000,
      aggregateRevisionId: '55555555-5555-4555-8555-555555555555',
      certificatePrimaryIdentity: 'test@different-primary',
    };

    await expect(
      persistSettledXstockWindowManifest([bar, laterBar]),
    ).rejects.toThrow(/mixes primary identities/);
    expect(state.calls).toHaveLength(3); // no manifest-record statement
  });
});
