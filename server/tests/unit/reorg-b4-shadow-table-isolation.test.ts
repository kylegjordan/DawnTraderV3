/**
 * ══════════════════════════════════════════════════════════════════════════════
 * reorg-B4 — BEHAVIORAL table-isolation tests (Langston Step-4 gating asks).
 * ══════════════════════════════════════════════════════════════════════════════
 *
 * The source-grep guards in `reorg-b4-shadow-isolation.test.ts` prove the shared
 * exclusion fragment EXISTS and is REFERENCED. These two tests go one level deeper
 * (Langston's gate): they exercise the actual functions and assert OUTCOMES, so a
 * future refactor that keeps the constant but breaks the query around it is caught.
 *
 *   1. The HIGH ablation feed (`loadClosedVtsTradesFromDb`) emits a query that, when
 *      run against a DB, EXCLUDES shadow rows — proven by a mock that applies the
 *      DB's filter semantics keyed on the emitted SQL and asserting a seeded shadow
 *      closed row is ABSENT from the output (and a real row is present).
 *   2. The dedupe-key inputs (`mode`, `signalId`) survive the persist→rehydrate
 *      round-trip through `vts_open_trades.context` jsonb, so the rehydration
 *      re-seed key === the open-time key (the dedup-across-restart boundary holds).
 * ══════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// ── db mock: capture emitted SQL + params; dispatch return value by query shape. ──
type DbCall = { text: string; params: any[]; raw: any };
const dbCalls: DbCall[] = [];
let selectRowsProvider: ((text: string) => any[]) = () => [];

/**
 * Recursively flatten a drizzle SQL object to its literal text. drizzle stores:
 * StringChunk { value: string[] }, nested SQL { queryChunks: [...] }, and an
 * interpolated string as a BOXED String object (probe-confirmed). Params (boxed
 * values) are stringified too so embedded literal text + jsonb survive.
 */
function sqlToText(node: any): string {
  if (node == null) return '';
  if (typeof node === 'string') return node;
  if (node instanceof String) return String(node);                 // boxed interpolated string
  if (Array.isArray(node)) return node.map(sqlToText).join('');
  if (Array.isArray(node.value)) return node.value.join('');       // StringChunk
  if (Array.isArray(node.queryChunks)) return node.queryChunks.map(sqlToText).join(' '); // nested SQL
  if (node.value !== undefined) return String(node.value);         // Param wrapper
  return '';
}

/** Recursively collect interpolated values (boxed strings + Param values). */
function sqlParams(node: any, out: any[] = []): any[] {
  if (node == null) return out;
  if (node instanceof String) { out.push(String(node)); return out; }   // boxed interpolated string
  if (typeof node === 'string') { out.push(node); return out; }
  if (Array.isArray(node)) { node.forEach((n) => sqlParams(n, out)); return out; }
  if (Array.isArray(node.queryChunks)) { node.queryChunks.forEach((c: any) => sqlParams(c, out)); return out; }
  if (Array.isArray(node.value)) return out;                            // StringChunk = literal, not a param
  if (node.value !== undefined) { out.push(node.value); return out; }   // Param wrapper
  return out;
}

const mockExecute = vi.fn(async (q: any) => {
  const text = sqlToText(q);
  dbCalls.push({ text, params: sqlParams(q), raw: q });
  const upper = text.toUpperCase();
  if (upper.includes('SELECT') && upper.includes('FROM VTS_OPEN_TRADES')) {
    return { rows: selectRowsProvider(text) } as any;
  }
  if (upper.includes('SELECT COUNT')) return { rows: [{ count: '0' }] } as any;
  return { rows: [] } as any; // INSERT/UPDATE/DELETE
});

vi.mock('../../db.js', () => ({ db: { execute: (q: any) => mockExecute(q) } }));

import { loadClosedVtsTradesFromDb } from '../../services/factor-replay-core.js';
import { insertOpenTrade, rehydrateOpenTrades } from '../../services/vts-trade-persistence.js';
import { shadowDedupeKey } from '../../services/vts-runner.js';

const SHADOW_PREDICATE = "(context->>'shadow') IS DISTINCT FROM 'true'";

describe('reorg-B4 BEHAVIORAL — shadow rows absent from the ablation feed (Langston gate #1)', () => {
  beforeEach(() => { dbCalls.length = 0; mockExecute.mockClear(); });

  it('a seeded shadow closed row does NOT appear in loadClosedVtsTradesFromDb output', async () => {
    // The loader keys its index by `${symbol}|${strategy}` (the natural key), so the
    // real + shadow rows must differ in symbol/strategy to be distinguishable.
    const realRow = {
      id: 'real-1', symbol: 'BTC/USD', strategy: 'breakout', regime: 'IMPULSE_EXPANSION',
      pool: 'rotational', asset_class: 'crypto_spot',
      opened_at: new Date('2026-06-01T00:00:00Z'), closed_at: new Date('2026-06-01T02:00:00Z'),
      context: {},
    };
    const shadowRow = {
      ...realRow, id: 'shadow-1', symbol: 'ETH/USD', strategy: 'vwap_pullback',
      context: { shadow: true },
    };
    const REAL_KEY = 'BTC/USD|breakout';
    const SHADOW_KEY = 'ETH/USD|vwap_pullback';

    // The mock stands in for the DB: it applies the shadow filter IFF the emitted
    // query actually carries the exclusion predicate. So the test passes only
    // because the live query carries it — drop the predicate from the query and the
    // shadow leaks into the result and these assertions fail.
    selectRowsProvider = (text: string) =>
      text.includes(SHADOW_PREDICATE) ? [realRow] : [realRow, shadowRow];

    const index = await loadClosedVtsTradesFromDb(new Date('2026-05-11T00:00:00Z'));

    // Behavioral outcome: the shadow's natural key is ABSENT, the real one present.
    expect(index.has(SHADOW_KEY)).toBe(false);
    expect(index.has(REAL_KEY)).toBe(true);
    // And prove the emitted query genuinely carried the exclusion (not a vacuous pass).
    const feedQuery = dbCalls.find((c) => c.text.toUpperCase().includes('FROM VTS_OPEN_TRADES'));
    expect(feedQuery?.text).toContain(SHADOW_PREDICATE);
  });
});

describe('reorg-B4 BEHAVIORAL — dedupe key survives persist→rehydrate (Langston gate #2)', () => {
  beforeEach(() => { dbCalls.length = 0; mockExecute.mockClear(); });

  it('mode + signalId round-trip through context jsonb → rehydration key === open-time key', async () => {
    const OPEN_MODE = 'paper';
    const OPEN_SIGNAL_ID = 'sig-abc-123';
    const openKey = shadowDedupeKey(OPEN_MODE, OPEN_SIGNAL_ID, 'ETH/USD', 'vwap_pullback');

    // A shadow-shaped open-trade record exactly as registerOpenShadowTrade builds it:
    // mode/signalId/shadow are NON-core fields → splitTradeForPersist bundles them
    // into the context jsonb (verbatim, no rename).
    const shadowRecord: any = {
      id: 'shadow-rt-1', symbol: 'ETH/USD', assetClass: 'crypto_spot',
      entryPrice: 100, stopLoss: 95, takeProfit: 110,
      positionSize: 1, dollarValue: 1, quantity: 0,
      regime: 'IMPULSE_EXPANSION', signalType: 'SHADOW', strategy: 'vwap_pullback',
      pool: 'rotational', openedAt: Date.now(),
      shadow: true, mode: OPEN_MODE, signalId: OPEN_SIGNAL_ID,
    };

    // PERSIST — real insertOpenTrade runs splitTradeForPersist; capture the context jsonb param.
    await insertOpenTrade(shadowRecord);
    const insertCall = dbCalls.find((c) => c.text.toUpperCase().includes('INSERT INTO VTS_OPEN_TRADES'));
    expect(insertCall, 'insertOpenTrade should have emitted an INSERT').toBeTruthy();
    // The context jsonb is the JSON-stringified non-core bundle, passed as a param.
    const contextParam = (insertCall!.params as any[]).find(
      (p) => typeof p === 'string' && p.includes('"shadow":true'),
    );
    expect(contextParam, 'the persisted context jsonb must carry mode/signalId/shadow').toBeTruthy();
    const persistedContext = JSON.parse(contextParam as string);
    expect(persistedContext.mode).toBe(OPEN_MODE);
    expect(persistedContext.signalId).toBe(OPEN_SIGNAL_ID);

    // REHYDRATE — real rehydrateOpenTrades spreads `...r.context` back onto the record.
    selectRowsProvider = () => ([{
      id: 'shadow-rt-1', symbol: 'ETH/USD', asset_class: 'crypto_spot',
      entry_price: '100', stop_loss: '95', take_profit: '110',
      position_size: '1', dollar_value: '1', quantity: '0',
      regime: 'IMPULSE_EXPANSION', signal_type: 'SHADOW', strategy: 'vwap_pullback',
      pool: 'rotational', opened_at: new Date(), state: 'open',
      context: persistedContext,
    }]);
    const rows = await rehydrateOpenTrades();
    const rehydrated: any = rows[0];

    // The rehydration re-seed reconstructs the key from the round-tripped fields.
    const rehydrationKey = shadowDedupeKey(rehydrated.mode, rehydrated.signalId, rehydrated.symbol, rehydrated.strategy);
    expect(rehydrationKey).toBe(openKey);
    expect(rehydrationKey).toBe('paper:sig-abc-123');
  });
});
