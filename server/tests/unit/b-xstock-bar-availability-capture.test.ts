import { beforeEach, describe, expect, it, vi } from 'vitest';

const state: {
  results: unknown[];
  phases: string[];
  holdFirst: Promise<void> | null;
  alertCalls: unknown[];
} = { results: [], phases: [], holdFirst: null, alertCalls: [] };

vi.mock('../../db.js', () => ({
  db: {
    transaction: async (fn: (tx: { execute: () => Promise<unknown> }) => Promise<unknown>) => {
      const ordinal = state.phases.filter((phase) => phase.startsWith('begin')).length + 1;
      state.phases.push(`begin-${ordinal}`);
      const value = await fn({
        execute: async () => {
          state.phases.push(`execute-${ordinal}`);
          if (ordinal === 1 && state.holdFirst) await state.holdFirst;
          const result = state.results.shift();
          if (result instanceof Error) throw result;
          return { rows: result };
        },
      });
      state.phases.push(`commit-${ordinal}`);
      return value;
    },
  },
}));

vi.mock('../../services/system-alerts.js', () => ({
  addAlert: async (value: unknown) => { state.alertCalls.push(value); },
}));

import {
  assertExactRevisionIdSet,
  writeXstockProjectionAttempts,
  xstockBarPayloadHash,
} from '../../services/passive-archive/xstock-bar-availability.js';

const intervalBegin = new Date('2026-10-14T15:00:00.000Z');
const arrivedAt = new Date('2026-10-14T15:15:00.000Z');
const bar = (close = '10', arrival = arrivedAt) => ({
  symbol: 'CORZ/USD',
  assetClass: 'xstock_spot',
  exchange: 'kraken-equities',
  intervalBegin,
  arrivedAt: arrival,
  open: '9', high: '11', low: '8', close, volume: '100',
  vwap: '9.5', tradeCount: 7, metadata: { schema_version: 1 },
}) as any;

beforeEach(() => {
  state.results = [];
  state.phases = [];
  state.holdFirst = null;
  state.alertCalls = [];
});

describe('xStock availability capture boundary', () => {
  it('content hash excludes arrival identity while retaining exact bar content', () => {
    const later = new Date(arrivedAt.getTime() + 1_000);
    expect(xstockBarPayloadHash(bar('10', later))).toBe(xstockBarPayloadHash(bar('10', arrivedAt)));
    expect(xstockBarPayloadHash(bar('11', later))).not.toBe(xstockBarPayloadHash(bar('10', arrivedAt)));
  });

  it('refuses partial, wrong, duplicate, and reused certificate ID sets', () => {
    expect(() => assertExactRevisionIdSet(['a', 'b'], ['b', 'a'])).not.toThrow();
    expect(() => assertExactRevisionIdSet(['a', 'b'], ['a'])).toThrow(/exact-ID mismatch/);
    expect(() => assertExactRevisionIdSet(['a', 'b'], ['a', 'c'])).toThrow(/exact-ID mismatch/);
    expect(() => assertExactRevisionIdSet(['a', 'b'], ['a', 'a'])).toThrow(/exact-ID mismatch/);
    expect(() => assertExactRevisionIdSet(['a', 'a'], ['a'])).toThrow(/exact-ID mismatch/);
  });

  it('starts certification only after the immutable projection transaction resolves', async () => {
    let release!: () => void;
    state.holdFirst = new Promise<void>((resolve) => { release = resolve; });
    state.results.push([
      {
        revision_id: '11111111-1111-4111-8111-111111111111',
        arrived_at: arrivedAt,
        projection_applied: true,
        projection_generation: '1',
        supersedes_revision_id: null,
        observed_winner_revision_id: null,
        payload_hash: xstockBarPayloadHash(bar()),
        payload_repeated_from_winner: false,
      },
    ]);
    state.results.push([
      {
        revision_id: '11111111-1111-4111-8111-111111111111',
        visible_by: new Date(arrivedAt.getTime() + 1),
        visible_seq: '9',
        certificate_primary_identity: 'test@primary',
      },
    ]);

    const pending = writeXstockProjectionAttempts([bar()]);
    await vi.waitFor(() => expect(state.phases).toEqual(['begin-1', 'execute-1']));
    expect(state.phases).not.toContain('begin-2');
    release();
    const result = await pending;
    expect(state.phases).toEqual([
      'begin-1', 'execute-1', 'commit-1',
      'begin-2', 'execute-2', 'commit-2',
    ]);
    expect(result.certification).toBe('certified');
    expect(result.certificates[0].visibleSeq).toBe(9);
  });

  it('leaves committed events pending repair instead of replaying the arrival on certificate failure', async () => {
    state.results.push([
      {
        revision_id: '22222222-2222-4222-8222-222222222222',
        arrived_at: arrivedAt,
        projection_applied: true,
        projection_generation: '2',
        supersedes_revision_id: '11111111-1111-4111-8111-111111111111',
        observed_winner_revision_id: '11111111-1111-4111-8111-111111111111',
        payload_hash: xstockBarPayloadHash(bar()),
        payload_repeated_from_winner: true,
      },
    ]);
    state.results.push(new Error('clock regression'));

    const result = await writeXstockProjectionAttempts([bar()]);
    expect(result.certification).toBe('pending_repair');
    expect(result.attempts).toHaveLength(1);
    expect(result.certificates).toHaveLength(0);
    expect(state.phases.filter((phase) => phase === 'begin-1')).toHaveLength(1);
    expect(state.alertCalls).toHaveLength(1);
  });
});
