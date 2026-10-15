import { beforeEach, describe, expect, it, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const state: {
  results: unknown[];
  phases: string[];
  holdOrdinal: number | null;
  hold: Promise<void> | null;
  alertCalls: unknown[];
  queries: unknown[];
} = { results: [], phases: [], holdOrdinal: null, hold: null, alertCalls: [], queries: [] };

vi.mock('../../db.js', () => ({
  db: {
    transaction: async (fn: (tx: { execute: () => Promise<unknown> }) => Promise<unknown>) => {
      const ordinal = state.phases.filter((phase) => phase.startsWith('begin')).length + 1;
      state.phases.push(`begin-${ordinal}`);
      const value = await fn({
        execute: async (query?: unknown) => {
          state.queries.push(query);
          state.phases.push(`execute-${ordinal}`);
          if (ordinal === state.holdOrdinal && state.hold) await state.hold;
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
  isXstockAdmissionFailure,
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
  state.holdOrdinal = null;
  state.hold = null;
  state.alertCalls = [];
  state.queries = [];
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
    state.holdOrdinal = 2;
    state.hold = new Promise<void>((resolve) => { release = resolve; });
    state.results.push([]); // durable admission transaction
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
    await vi.waitFor(() => expect(state.phases).toEqual([
      'begin-1', 'execute-1', 'commit-1',
      'begin-2', 'execute-2',
    ]));
    expect(state.phases).not.toContain('begin-3');
    release();
    const result = await pending;
    expect(state.phases).toEqual([
      'begin-1', 'execute-1', 'commit-1',
      'begin-2', 'execute-2', 'commit-2',
      'begin-3', 'execute-3', 'commit-3',
    ]);
    expect(result.certification).toBe('certified');
    expect(result.certificates[0].visibleSeq).toBe(9);
  });

  it('leaves committed events pending repair instead of replaying the arrival on certificate failure', async () => {
    state.results.push([]); // durable admission transaction
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

  it('leaves durable admission evidence when projection fails permanently', async () => {
    state.results.push([]); // admission commits
    state.results.push(new Error('column does not exist')); // projection does not commit

    await expect(writeXstockProjectionAttempts([bar()], {
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
      flushId: '33333333-3333-4333-8333-333333333333',
    })).rejects.toThrow(/column does not exist/);
    expect(state.phases).toEqual([
      'begin-1', 'execute-1', 'commit-1',
      'begin-2', 'execute-2',
    ]);
    expect(new PgDialect().sqlToQuery(state.queries[0] as any).sql)
      .toContain('admit_xstock_bar_projection_flush');
  });

  it('marks a failed or ambiguously acknowledged admission as non-droppable', async () => {
    state.results.push(new Error('column does not exist'));

    const error = await writeXstockProjectionAttempts([bar()], {
      acceptedInputFrames: 1,
      bufferSuperseded: 0,
      flushId: '44444444-4444-4444-8444-444444444444',
    }).catch((caught) => caught);

    expect(isXstockAdmissionFailure(error)).toBe(true);
    expect(error.message).toContain('admission unconfirmed');
    expect(state.phases).toEqual(['begin-1', 'execute-1']);
  });

  it('rejects a flush population that cannot reconcile to its projection attempts', async () => {
    await expect(writeXstockProjectionAttempts([bar()], {
      acceptedInputFrames: 3,
      bufferSuperseded: 1,
    })).rejects.toThrow(/invalid flush population/);
    expect(state.phases).toEqual([]);
  });
});
