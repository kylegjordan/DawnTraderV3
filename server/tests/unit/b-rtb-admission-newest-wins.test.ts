/**
 * B-RTB-ADMISSION-TIEBREAK-LIVE (#1190, sprint row 59f) — NEWEST WINS, IN FULL.
 *
 * One row per (mode, symbol, strategy). A re-issue of the same setup goes through `upsertRtbSignal`'s conflict
 * update and REPLACES the queued copy: its levels AND the decision that priced them. Before this batch the SET
 * list omitted nine of the insert's fields, so a re-issued row carried the new levels with the FIRST signal's Net
 * Expectancy, maker/taker choice, fill policy and DI/DBS.
 *
 * (1) behaviour: a re-issue's conflict SET carries every snapshot field of the NEW signal.
 * (2) structure, BOTH directions (Langston Step-2 condition 1): every key the admission builder writes is in the
 *     SET or on a named keep-list, and every SET key is one the builder supplies or a named SET-only key — so a
 *     column added to the insert later cannot silently miss the re-issue, and a stale mapping cannot linger.
 */
import { describe, it, expect, vi } from 'vitest';
import { readFileSync } from 'fs';
import { join, resolve } from 'path';

const captured: { set?: Record<string, unknown>; values?: Record<string, unknown> } = {};
vi.mock('../../db', () => {
  const chain = {
    values(v: Record<string, unknown>) { captured.values = v; return chain; },
    onConflictDoUpdate(o: { set: Record<string, unknown> }) { captured.set = o.set; return chain; },
    returning: async () => [{ id: 'row-1', ...(captured.values ?? {}) }],
  };
  return { db: { insert: () => chain }, pool: {} };
});

import { storage } from '../../storage';

const REPO = resolve(__dirname, '../../..');
const stripComments = (src: string) => src.replace(/^\s*\/\/.*$/gm, '').replace(/\/\*[\s\S]*?\*\//g, '');
const code = (rel: string) => stripComments(readFileSync(join(REPO, rel), 'utf-8'));

/** The keys of an object literal opened by `opener`, at exactly `indent` spaces (its own top level). */
function literalKeys(src: string, opener: string, indent: number): string[] {
  const at = src.indexOf(opener);
  expect(at).toBeGreaterThan(-1);
  const body = src.slice(at + opener.length);
  const close = body.search(new RegExp(`\\n {${indent - 2}}\\}`));
  expect(close).toBeGreaterThan(0);
  const keys = [...body.slice(0, close).matchAll(new RegExp(`\\n {${indent}}(\\w+)\\s*:`, 'g'))].map((m) => m[1]);
  expect(keys.length).toBeGreaterThan(5);
  return keys;
}

const SNAPSHOT = ['chosenEntryMode', 'entryFillPolicy', 'chosenNetEv', 'takerNetEv', 'makerNetEvAdjusted',
  'diAtQueue', 'dbsScoreAtQueue', 'currentPrice', 'volume24h'] as const;
/** In the insert, deliberately NOT rewritten on a re-issue: the conflict key, the row's name, a constant. */
const INSERT_ONLY = ['mode', 'symbol', 'strategy', 'signalId', 'blockReason'];
/** In the SET, deliberately not from the insert's value: none today (queuedAt is in both — the SET stamps now()). */
const SET_ONLY: string[] = [];

describe('B-RTB-ADMISSION-TIEBREAK-LIVE — a re-issue replaces the queued copy in full', () => {
  it('the conflict SET carries every decision-snapshot field of the NEW signal', async () => {
    const data: Record<string, unknown> = {
      mode: 'paper', signalId: 'sig-2', symbol: 'ICNT/USD', strategy: 'strong_bull_trend',
      entryPrice: '1.10', stopPrice: '1.00', targetPrice: '1.40', status: 'active', queuedAt: new Date(),
      confidence: '0.6', riskScore: '0.3', expectedReturn: '0.02', metadata: { netEvAtAdmit: 0.0042 },
      assetClass: 'crypto_spot', blockReason: 'SQE_QUALIFIED',
      chosenEntryMode: 'maker', entryFillPolicy: 'maker_preferred', chosenNetEv: '0.0042', takerNetEv: '0.0011',
      makerNetEvAdjusted: '0.0042', diAtQueue: '37.5', dbsScoreAtQueue: '0.41', currentPrice: '1.09', volume24h: '120000',
    };
    await storage.upsertRtbSignal(data as any);
    const set = captured.set!;
    for (const k of SNAPSHOT) expect(set[k], k).toBe(data[k]);
    expect(set.entryPrice).toBe('1.10');
    expect(set.metadata).toEqual({ netEvAtAdmit: 0.0042 });
    expect('signalId' in set).toBe(false);          // the row keeps its name (refresh-state + ranker key)
    expect('finalScore' in set).toBe(false);        // #558 A1 residue removed (the insert supplies none)
    expect('expiresAt' in set).toBe(false);         // R9.3-C residue removed
  });

  it('Step-4 r1 (Langston): an ABSENT nullable field is written as NULL, never dropped — drizzle skips undefined keys', async () => {
    // A crypto re-issue with no FX5 volume, a missing current price, no target and a cold DI/DBS: under the old SET the
    // incumbent's values survived because drizzle drops undefined keys from the update set (utils.js filter `!== void 0`).
    const data: Record<string, unknown> = {
      mode: 'paper', signalId: 'sig-3', symbol: 'TIA/USD', strategy: 'volatility_edge',
      entryPrice: '5.00', stopPrice: '4.80', status: 'active', queuedAt: new Date(),
      confidence: '0.6', riskScore: '0.3', expectedReturn: '0.02', metadata: { netEvAtAdmit: 0.001 },
      assetClass: 'crypto_spot', chosenEntryMode: 'taker', entryFillPolicy: 'maker_preferred', chosenNetEv: '0.001',
      targetPrice: undefined, quantity: undefined, notional: undefined, currentPrice: undefined, volume24h: undefined,
      takerNetEv: undefined, makerNetEvAdjusted: undefined, diAtQueue: undefined, dbsScoreAtQueue: undefined,
    };
    await storage.upsertRtbSignal(data as any);
    const set = captured.set!;
    for (const k of ['targetPrice', 'quantity', 'notional', 'currentPrice', 'volume24h', 'takerNetEv', 'makerNetEvAdjusted',
      'diAtQueue', 'dbsScoreAtQueue']) {
      expect(k in set, k).toBe(true);
      expect(set[k], k).toBeNull();
    }
  });

  it('structure, both directions: insert keys ⊆ SET ∪ insert-only, and SET keys ⊆ insert ∪ SET-only', () => {
    const insert = literalKeys(code('server/core/rtb/ready_to_buy_service.ts'), 'const insertData: InsertRtbSignal = {', 6);
    const storageSrc = code('server/storage.ts');
    const fn = storageSrc.indexOf('async upsertRtbSignal(');
    expect(fn).toBeGreaterThan(-1);
    const set = literalKeys(storageSrc.slice(fn), 'set: {', 10);
    const missingFromSet = insert.filter((k) => !set.includes(k) && !INSERT_ONLY.includes(k));
    const strayInSet = set.filter((k) => !insert.includes(k) && !SET_ONLY.includes(k));
    expect(missingFromSet).toEqual([]);
    expect(strayInSet).toEqual([]);
    for (const k of SNAPSHOT) expect(set, k).toContain(k);
  });

  it('the dead tiebreak and its lookup are gone from the admission writer', () => {
    const rtb = code('server/core/rtb/ready_to_buy_service.ts');
    expect(rtb).not.toMatch(/getQueuedSignal\(/);
    expect(rtb).not.toMatch(/skipSelfCheck/);
    expect(rtb).not.toMatch(/RTB_TIEBREAK/);
  });
});
