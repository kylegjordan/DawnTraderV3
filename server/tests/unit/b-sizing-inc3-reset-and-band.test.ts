/**
 * B-SIZING-DEC-RESTORE increment 3 — the PAPER-RESET-3000 plumbing (P1) and the paper size band (P4 / obj-14).
 *
 * Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §16.4 (Langston's ruling at 66da5e666).
 * Four things are proved here, each with a CONTROL on the unchanged path:
 *   1. the band's verdict and its suggested p* (pure) — including the undone reset (tripwire A) and the upper typo;
 *   2. the band alert: one per anchor version and direction, nothing when in band or when an input is unreadable,
 *      fail-hard on a missing band row;
 *   3. the reset label travels the stop path: stop → flatten → forceClosePosition → the exit condition's type, which
 *      the close writes to `close_reason` — so CC-B's 3n.u exclusion is a query on 'reset';
 *   4. the read-only pre-check and the flatten share ONE price resolver, and the pre-check closes nothing.
 * The manager and the engine are exercised through their prototypes on a stand-in `this`, the same technique
 * b-feed-mismatch-fix.test.ts uses for `closePosition`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  constants: new Map<string, number>(),
  balance: 3000,
  guardrails: { maxTotalExposurePct: '100.00', maxPositionPercentPct: '5.00' } as Record<string, unknown> | null,
  anchorVersion: 7 as number | null,
  addAlert: vi.fn(async () => ({ id: 'alert-1' })),
  openPositions: [] as Array<{ id: string; symbol: string; assetClass?: string | null }>,
  // The stop flatten reads the book twice: once to close, once to confirm. `emptyAfterFirstRead` makes the second
  // read see the book empty — every close succeeded.
  emptyAfterFirstRead: false,
  stillOpen: null as unknown,
  // For the pending-maker drop: what the engine re-reads, and what it writes.
  positionById: null as unknown,
  updateClosedTrade: vi.fn(async () => ({})),
  deleteActiveOpenPosition: vi.fn(async () => undefined),
}));

vi.mock('../../services/module-constants-service.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getCachedNumberRequired: (module: string, constant: string) => {
    const v = h.constants.get(`${module}.${constant}`);
    if (v === undefined) throw new Error(`[test] missing module_constants row ${module}.${constant}`);
    return v;
  },
}));
vi.mock('../../services/guardrail-settings.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getPortfolioBalanceV2: async () => h.balance,
}));
vi.mock('../../services/portfolio-anchor-service.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getAnchorState: async () => (h.anchorVersion === null ? null : { balance: h.balance, anchorVersion: h.anchorVersion }),
}));
vi.mock('../../services/system-alerts.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), addAlert: h.addAlert }));
vi.mock('../../storage.js', async (orig) => {
  const real = await orig<{ storage: Record<string, unknown> }>();
  return {
    ...real,
    storage: new Proxy(real.storage, {
      get(target, prop) {
        if (prop === 'getGuardrailsV2') return async () => h.guardrails;
        if (prop === 'getActiveOpenPositions') {
          return async () => {
            const out = h.openPositions;
            if (h.emptyAfterFirstRead) h.openPositions = [];
            return out;
          };
        }
        if (prop === 'getClosedTradesCount') return async () => 0;
        if (prop === 'getRunningEngineSession') return async () => null;
        if (prop === 'getActiveOpenPosition') return async () => h.positionById ?? h.stillOpen;
        if (prop === 'updateClosedTrade') return h.updateClosedTrade;
        if (prop === 'deleteActiveOpenPosition') return h.deleteActiveOpenPosition;
        return (target as Record<string | symbol, unknown>)[prop];
      },
    }),
  };
});

import { evaluatePaperSizeBand, checkPaperSizeBand, readPaperSizeBand, bandDedupeKey } from '../../services/paper-size-band.js';
import { ActivePortfolioManager } from '../../services/active-portfolio-manager.js';
import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';

const BAND = { low: 140, high: 150, target: 145 };
const PROV = { producer: 'crypto_ws_book_walk' as const, source: 'kraken_ws', observedAtMs: 1 };

function seedBand() {
  h.constants.set('paper_size_band.low', 140);
  h.constants.set('paper_size_band.high', 150);
  h.constants.set('paper_size_band.target', 145);
  h.constants.set('active_sizing.max_position_buffer_factor', 0.97);
}

beforeEach(() => {
  h.constants.clear();
  seedBand();
  h.balance = 3000;
  h.guardrails = { maxTotalExposurePct: '100.00', maxPositionPercentPct: '5.00' };
  h.anchorVersion = 7;
  h.addAlert.mockClear();
  h.openPositions = [];
  h.emptyAfterFirstRead = false;
  h.stillOpen = null;
  h.positionById = null;
  h.updateClosedTrade.mockClear();
  h.deleteActiveOpenPosition.mockClear();
});

describe('1 — evaluatePaperSizeBand (pure)', () => {
  it('at the reset — $3,000 x 100% x 5% x 0.97 = $145.50 is IN the band', () => {
    const r = evaluatePaperSizeBand({ balance: 3000, e: 100, p: 5, buffer: 0.97 }, BAND);
    expect(r.status).toBe('in');
    expect(r.size).toBeCloseTo(145.5, 10);
    // p* puts the normal size exactly on the target: 145 / (3000 x 1 x 0.97) x 100
    expect(r.pStar).toBeCloseTo((145 / (3000 * 0.97)) * 100, 10);
  });

  it('tripwire A — an UNDONE reset (the old $824.11 anchor at p=5) reads ~$39.97 and fires LOW', () => {
    const r = evaluatePaperSizeBand({ balance: 824.11, e: 100, p: 5, buffer: 0.97 }, BAND);
    expect(r.status).toBe('low');
    expect(r.size).toBeCloseTo(39.97, 2);
  });

  it('the upper typo — 50 for 5 reads $1,455 and fires HIGH (nothing else refuses it)', () => {
    const r = evaluatePaperSizeBand({ balance: 3000, e: 100, p: 50, buffer: 0.97 }, BAND);
    expect(r.status).toBe('high');
    expect(r.size).toBeCloseTo(1455, 10);
  });

  it('the band is closed at both ends — exactly low and exactly high are IN', () => {
    // size = balance x 1 x 0.05 x 1 with buffer 1, so the balance sets the size directly (x 20)
    expect(evaluatePaperSizeBand({ balance: 2800, e: 100, p: 5, buffer: 1 }, BAND).status).toBe('in'); // $140
    expect(evaluatePaperSizeBand({ balance: 3000, e: 100, p: 5, buffer: 1 }, BAND).status).toBe('in'); // $150
    expect(evaluatePaperSizeBand({ balance: 2799.8, e: 100, p: 5, buffer: 1 }, BAND).status).toBe('low');
    expect(evaluatePaperSizeBand({ balance: 3000.2, e: 100, p: 5, buffer: 1 }, BAND).status).toBe('high');
  });

  it('TARGET IS NOT A BAND MEMBER — moving it changes p* and never the verdict (§16.4 C2)', () => {
    const r = evaluatePaperSizeBand({ balance: 3000, e: 100, p: 5, buffer: 0.97 }, { ...BAND, target: 500 });
    expect(r.status).toBe('in');
    expect(r.pStar).toBeCloseTo((500 / (3000 * 0.97)) * 100, 10);
  });

  it('any non-finite or non-positive input is UNREADABLE — never guessed into a verdict', () => {
    for (const bad of [
      { balance: NaN, e: 100, p: 5, buffer: 0.97 },
      { balance: 3000, e: 0, p: 5, buffer: 0.97 },
      { balance: 3000, e: 100, p: -5, buffer: 0.97 },
      { balance: 3000, e: 100, p: 5, buffer: Number.POSITIVE_INFINITY },
    ]) {
      expect(evaluatePaperSizeBand(bad, BAND).status).toBe('unreadable');
    }
  });
});

describe('2 — checkPaperSizeBand (the alert)', () => {
  it('CONTROL — in band raises nothing', async () => {
    const r = await checkPaperSizeBand('close');
    expect(r.status).toBe('in');
    expect(h.addAlert).not.toHaveBeenCalled();
  });

  it('below the band raises ONE alert keyed to the anchor version and direction, naming p*', async () => {
    h.balance = 824.11;
    const r = await checkPaperSizeBand('engine_start');
    expect(r.status).toBe('low');
    expect(h.addAlert).toHaveBeenCalledTimes(1);
    const arg = (h.addAlert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.dedupe_key).toBe(bandDedupeKey(7, 'low', r.pStar, BAND));
    expect(arg.dedupe_key).toMatch(/^paper-size-band:7:low:p\d+$/);
    expect(arg.category).toBe('reminder');
    expect(arg.severity).toBe('warning');
    expect(String(arg.title)).toContain(`set max position % to ${r.pStar.toFixed(2)}`);
    expect(String(arg.body)).toContain('Trigger: engine_start');
    // Langston condition 1: the suggestion is stamped with the instant and the balance it was computed at
    expect(String(arg.body)).toMatch(/^As at \d{4}-\d{2}-\d{2}T[\d:.]+Z, balance \$824\.11:/);
  });

  it('above the band keys the OTHER direction — a low alert cannot silence a high one', async () => {
    h.guardrails = { maxTotalExposurePct: '100.00', maxPositionPercentPct: '50.00' };
    await checkPaperSizeBand('close');
    const arg = (h.addAlert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.dedupe_key).toMatch(/^paper-size-band:7:high:p\d+$/);
  });

  it('a NEW anchor version gets a NEW key — the reset re-arms the alarm', async () => {
    h.balance = 824.11;
    h.anchorVersion = 8;
    await checkPaperSizeBand('close');
    const arg = (h.addAlert.mock.calls[0] as unknown as [Record<string, unknown>])[0];
    expect(arg.dedupe_key).toMatch(/^paper-size-band:8:low:p\d+$/);
  });

  // Langston condition 1: without the bucket a dedupe hit returned the FIRST alert unchanged, so its p* froze.
  // MUTATION: drop the bucket from bandDedupeKey and the two keys below become equal.
  it('the key moves when p* moves materially (his example: $3,100 vs $4,000 ⇒ 4.82% vs 3.74%)', () => {
    const pStarAt = (balance: number) => evaluatePaperSizeBand({ balance, e: 100, p: 5, buffer: 0.97 }, BAND).pStar;
    expect(bandDedupeKey(9, 'high', pStarAt(3100), BAND)).not.toBe(bandDedupeKey(9, 'high', pStarAt(4000), BAND));
  });

  it('CONTROL — a small move keeps the same key (3,093 vs 3,100: p* 4.83% vs 4.82%) — no alert storm', () => {
    const pStarAt = (balance: number) => evaluatePaperSizeBand({ balance, e: 100, p: 5, buffer: 0.97 }, BAND).pStar;
    expect(bandDedupeKey(9, 'high', pStarAt(3093), BAND)).toBe(bandDedupeKey(9, 'high', pStarAt(3100), BAND));
  });

  it('the bucket width is the band\'s own width (no new constant): a wider band gives coarser buckets', () => {
    const narrow = [4.0, 4.2, 4.4, 4.6].map((ps) => bandDedupeKey(1, 'low', ps, BAND));
    const wide = [4.0, 4.2, 4.4, 4.6].map((ps) => bandDedupeKey(1, 'low', ps, { low: 100, high: 200, target: 145 }));
    expect(new Set(narrow).size).toBeGreaterThan(new Set(wide).size);
  });

  it('an unreadable guardrail raises NOTHING (it is the guardrail readers\' alarm, not this one)', async () => {
    h.guardrails = null;
    const r = await checkPaperSizeBand('close');
    expect(r.status).toBe('unreadable');
    expect(h.addAlert).not.toHaveBeenCalled();
  });

  it('FAIL-HARD — a missing band row throws (boot turns this into a refusal to start)', async () => {
    h.constants.delete('paper_size_band.target');
    expect(() => readPaperSizeBand()).toThrow(/paper_size_band\.target/);
    await expect(checkPaperSizeBand('close')).rejects.toThrow(/paper_size_band\.target/);
  });
});

describe('3 — the reset label travels the stop path', () => {
  const engineProto = ActiveExecutionEngine.prototype as unknown as {
    forceClosePosition: (...args: unknown[]) => Promise<{ success: boolean }>;
  };

  it('forceClosePosition(…, "reset") closes under an exit condition of type "reset" — the value close_reason stores', async () => {
    const closePosition = vi.fn(async () => undefined);
    const res = await engineProto.forceClosePosition.call({ mode: 'paper', closePosition }, 'pos-1', 10, 'reset_kraken_ws', PROV, 'reset');
    expect(res.success).toBe(true);
    const [, , exitCondition, priceSource, opts] = closePosition.mock.calls[0] as unknown as [string, number, { type: string; reason: string }, string, { flatten: boolean }];
    expect(exitCondition.type).toBe('reset');
    expect(exitCondition.reason).toContain('PAPER-RESET-3000');
    expect(priceSource).toBe('reset_kraken_ws');
    expect(opts.flatten).toBe(true);
  });

  it('CONTROL — "manual_stop" is unchanged: same type and the same reason text as before', async () => {
    const closePosition = vi.fn(async () => undefined);
    await engineProto.forceClosePosition.call({ mode: 'paper', closePosition }, 'pos-1', 10, 'manual_stop_kraken_ws', PROV, 'manual_stop');
    const exitCondition = (closePosition.mock.calls[0] as unknown as [string, number, { type: string; reason: string }])[2];
    expect(exitCondition.type).toBe('manual_stop');
    expect(exitCondition.reason).toBe('Manual stop requested by user');
  });

  const mgrProto = ActivePortfolioManager.prototype as unknown as {
    forceCloseAllOpenPositionsOnStop: (closeType?: string) => Promise<{ closedCount: number }>;
    _flattenOne: unknown;
    flattenPrecheck: () => Promise<Array<{ symbol: string; hasObservedPrice: boolean; source: string | null }>>;
  };

  function fakeManager(resolver: (p: { symbol: string }) => unknown) {
    const forceClosePosition = vi.fn(async () => ({ success: true }));
    const positions = [{ id: 'p-A', symbol: 'AAA/USD', assetClass: 'crypto_spot' }, { id: 'p-B', symbol: 'BBB/USD', assetClass: 'crypto_spot' }];
    h.openPositions = positions;
    h.emptyAfterFirstRead = true;
    const fake = {
      mode: 'paper',
      userId: 'test',
      executionEngine: { forceClosePosition },
      resolveFlattenPrice: vi.fn(async (p: { symbol: string }) => resolver(p)),
      _flattenOne: mgrProto._flattenOne,
    };
    return { fake, forceClosePosition };
  }

  it('the stop flatten with "reset" passes "reset" to every close, and labels the price source reset_<source>', async () => {
    const { fake, forceClosePosition } = fakeManager(() => ({ price: 10, provenance: PROV, sourceLabel: 'kraken_ws' }));
    await mgrProto.forceCloseAllOpenPositionsOnStop.call(fake, 'reset');
    expect(forceClosePosition).toHaveBeenCalledTimes(2);
    for (const call of forceClosePosition.mock.calls as unknown as Array<[string, number, string, unknown, string]>) {
      expect(call[4]).toBe('reset');
      expect(call[2]).toBe('reset_kraken_ws');
    }
  });

  it('CONTROL — with no argument every existing stop still closes as "manual_stop", label unchanged', async () => {
    const { fake, forceClosePosition } = fakeManager(() => ({ price: 10, provenance: PROV, sourceLabel: 'kraken_ws' }));
    await mgrProto.forceCloseAllOpenPositionsOnStop.call(fake);
    for (const call of forceClosePosition.mock.calls as unknown as Array<[string, number, string, unknown, string]>) {
      expect(call[4]).toBe('manual_stop');
      expect(call[2]).toBe('manual_stop_kraken_ws');
    }
  });
});

describe('4 — one price resolver for the flatten and the pre-check; the pre-check closes nothing', () => {
  const mgrProto = ActivePortfolioManager.prototype as unknown as {
    flattenPrecheck: () => Promise<Array<Record<string, unknown>>>;
    _flattenOne: (p: unknown, tag: string, closeType: string) => Promise<{ status: string; reason?: string }>;
  };

  it('the pre-check reports each position through the resolver, and has no way to close one', async () => {
    h.openPositions = [{ id: 'p-X', symbol: 'XXX/USD' }, { id: 'p-Y', symbol: 'YYY/USD' }];
    // No executionEngine on this stand-in: any attempt to close would throw.
    const fake = {
      mode: 'paper',
      resolveFlattenPrice: vi.fn(async (p: { symbol: string }) => (p.symbol === 'XXX/USD' ? null : { price: 1, provenance: PROV, sourceLabel: 'book_best_bid' })),
    };
    const out = await mgrProto.flattenPrecheck.call(fake);
    expect(out).toEqual([
      { positionId: 'p-X', symbol: 'XXX/USD', state: 'open', closable: false, hasObservedPrice: false, source: null },
      { positionId: 'p-Y', symbol: 'YYY/USD', state: 'open', closable: true, hasObservedPrice: true, source: 'book_best_bid' },
    ]);
    expect(fake.resolveFlattenPrice).toHaveBeenCalledTimes(2);
  });

  it('#1100 — a PENDING maker is closable with no price asked for (it will be dropped, not sold)', async () => {
    h.openPositions = [{ id: 'p-P', symbol: 'PPP/USD', state: 'pending' } as any];
    const fake = { mode: 'paper', resolveFlattenPrice: vi.fn(async () => null) };
    const out = await mgrProto.flattenPrecheck.call(fake);
    expect(out).toEqual([{ positionId: 'p-P', symbol: 'PPP/USD', state: 'pending', closable: true, hasObservedPrice: null, source: 'pending_maker_drop' }]);
    expect(fake.resolveFlattenPrice).not.toHaveBeenCalled();
  });

  // MUTATION: give _flattenOne its own inline price lookup again and it stops consulting the resolver — this position
  // would then be closed (or reach the live pricing adapter) instead of being LEFT OPEN as the pre-check predicted.
  it('the flatten consults the SAME resolver: where the pre-check says "no price", the flatten leaves it open', async () => {
    const forceClosePosition = vi.fn(async () => ({ success: true }));
    const fake = {
      mode: 'paper',
      executionEngine: { forceClosePosition },
      resolveFlattenPrice: vi.fn(async () => null),
    };
    const outcome = await mgrProto._flattenOne.call(fake, { id: 'p-X', symbol: 'XXX/USD' }, 'reset', 'reset');
    expect(outcome.status).toBe('left_open');
    expect(fake.resolveFlattenPrice).toHaveBeenCalledTimes(1);
    expect(forceClosePosition).not.toHaveBeenCalled();
  });
});

describe('5 — #1100: the stop never sells a resting maker buy that never filled', () => {
  const mgrProto = ActivePortfolioManager.prototype as unknown as {
    _flattenOne: (p: unknown, tag: string, closeType: string) => Promise<{ status: string; reason?: string }>;
  };
  const engineProto = ActiveExecutionEngine.prototype as unknown as {
    dropPendingMakerOnFlatten: (id: string) => Promise<{ success: boolean; error?: string }>;
    _dropUnfilledMaker: unknown;
  };

  // MUTATION: remove the pending branch from _flattenOne and the pending maker reaches forceClosePosition — a walked
  // sell and a booked P&L for a trade that never happened, the defect #1100 records.
  it('the flatten DROPS a pending maker through the engine, and never walks a sell for it', async () => {
    const forceClosePosition = vi.fn(async () => ({ success: true }));
    const dropPendingMakerOnFlatten = vi.fn(async () => ({ success: true }));
    const fake = { mode: 'paper', executionEngine: { forceClosePosition, dropPendingMakerOnFlatten }, resolveFlattenPrice: vi.fn() };
    h.stillOpen = null; // gone after the drop
    const outcome = await mgrProto._flattenOne.call(fake, { id: 'p-P', symbol: 'PPP/USD', state: 'pending' }, 'reset', 'reset');
    expect(outcome.status).toBe('closed');
    expect(outcome.reason).toMatch(/never_filled/);
    expect(dropPendingMakerOnFlatten).toHaveBeenCalledWith('p-P');
    expect(forceClosePosition).not.toHaveBeenCalled();
    expect(fake.resolveFlattenPrice).not.toHaveBeenCalled();
  });

  it('CONTROL — an OPEN position still takes the priced flatten', async () => {
    const forceClosePosition = vi.fn(async () => ({ success: true }));
    const dropPendingMakerOnFlatten = vi.fn();
    const fake = {
      mode: 'paper',
      executionEngine: { forceClosePosition, dropPendingMakerOnFlatten },
      resolveFlattenPrice: vi.fn(async () => ({ price: 10, provenance: PROV, sourceLabel: 'kraken_ws' })),
    };
    const outcome = await mgrProto._flattenOne.call(fake, { id: 'p-O', symbol: 'OOO/USD', state: 'open' }, 'reset', 'reset');
    expect(outcome.status).toBe('closed');
    expect(forceClosePosition).toHaveBeenCalledTimes(1);
    expect(dropPendingMakerOnFlatten).not.toHaveBeenCalled();
  });

  it('the engine drop closes the trade row as never_filled — no price, no P&L — and frees the slot', async () => {
    h.positionById = { id: 'p-P', symbol: 'PPP/USD', state: 'pending', metadata: { tradeId: 't-9' } };
    const res = await engineProto.dropPendingMakerOnFlatten.call({ mode: 'paper', _dropUnfilledMaker: engineProto._dropUnfilledMaker }, 'p-P');
    expect(res.success).toBe(true);
    expect(h.updateClosedTrade).toHaveBeenCalledTimes(1);
    const [mode, tradeId, updates] = h.updateClosedTrade.mock.calls[0] as unknown as [string, string, Record<string, unknown>];
    expect([mode, tradeId]).toEqual(['paper', 't-9']);
    expect(updates.closeReason).toBe('never_filled');
    expect(Object.keys(updates).sort()).toEqual(['closeReason', 'closedAt']); // no exit price, no P&L
    expect(h.deleteActiveOpenPosition).toHaveBeenCalledWith('paper', 'p-P');
  });

  it('the engine REFUSES to drop a position that is no longer pending (it filled meanwhile — it is a trade now)', async () => {
    h.positionById = { id: 'p-P', symbol: 'PPP/USD', state: 'open', metadata: { tradeId: 't-9' } };
    const res = await engineProto.dropPendingMakerOnFlatten.call({ mode: 'paper', _dropUnfilledMaker: engineProto._dropUnfilledMaker }, 'p-P');
    expect(res.success).toBe(false);
    expect(res.error).toMatch(/not pending/);
    expect(h.updateClosedTrade).not.toHaveBeenCalled();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
  });
});
