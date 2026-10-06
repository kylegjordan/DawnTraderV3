/**
 * B-SIZING-DEC-RESTORE increment 3 — the PAPER-RESET-3000 plumbing (P1). The paper size band (P4 / obj-14) was REMOVED
 * before deploy (Kyle 2026-10-06: the goal is 20 slots, which the 5% position size gives at any balance), and with it its
 * tests; §6 proves it is gone.
 *
 * Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §16.4 (Langston's ruling at 66da5e666).
 * Proved here, each with a CONTROL on the unchanged path:
 *   3. the reset label travels the stop path: stop → flatten → forceClosePosition → the exit condition's type, which
 *      the close writes to `close_reason` — so CC-B's 3n.u exclusion is a query on 'reset';
 *   4. the read-only pre-check and the flatten share ONE price resolver, and the pre-check closes nothing.
 * The manager and the engine are exercised through their prototypes on a stand-in `this`, the same technique
 * b-feed-mismatch-fix.test.ts uses for `closePosition`.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const h = vi.hoisted(() => ({
  constants: new Map<string, number>(),
  balance: 820,
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

import { ActivePortfolioManager } from '../../services/active-portfolio-manager.js';
import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const PROV = { producer: 'crypto_ws_book_walk' as const, source: 'kraken_ws', observedAtMs: 1 };

function seedConstants() {
  h.constants.set('active_sizing.max_position_buffer_factor', 0.97);
}

beforeEach(() => {
  h.constants.clear();
  seedConstants();
  h.balance = 820;
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

describe("6 — the reset writes NO setting and carries NO amount; the size band is gone (Kyle 2026-10-06)", () => {
  const SCRIPT = readFileSync(join(__dirname, '../../scripts/paper-reset-3000.ts'), 'utf8');
  it('the balance comes from a REQUIRED --balance argument, not a constant in the file', () => {
    expect(SCRIPT).toMatch(/const BALANCE = parsePositiveArg\(process\.argv, '--balance'\);/);
    expect(SCRIPT).toMatch(/if \(BALANCE === null\) refuse\(/);
    expect(SCRIPT).toMatch(/newBalance: balance,/);
    expect(SCRIPT).not.toMatch(/TARGET_BALANCE|TARGET_P\b|TARGET_SLOTS|TARGET_KILL_PCT/);
  });
  it('the script never writes a guardrail: no PUT anywhere (the settings are the Guardrails screen\'s)', () => {
    expect(SCRIPT).not.toMatch(/api\('PUT'/);
    expect(SCRIPT).toMatch(/api\('GET', '\/guardrails-v2\?mode=paper'\)/);
  });
  it('the two settings are CHECKED, never written: required --expect-* flags, compared at step 0 and again at step 7 (Langston r6 C2)', () => {
    expect(SCRIPT).toMatch(/const EXPECT_POSITION_PCT = parsePositiveArg\(process\.argv, '--expect-position-pct'\);/);
    expect(SCRIPT).toMatch(/const EXPECT_KILL_PCT = parsePositiveArg\(process\.argv, '--expect-kill-pct'\);/);
    expect(SCRIPT).toMatch(/if \(EXPECT_POSITION_PCT === null \|\| EXPECT_KILL_PCT === null\) \{\s*refuse\(/);
    expect(SCRIPT).toMatch(/const settingsBefore = await settingsMismatch\(expectP, expectKill\);\s*if \(settingsBefore\) refuse\(settingsBefore\);/);
    expect(SCRIPT).toMatch(/const settingsAfter = await settingsMismatch\(expectP, expectKill\);/);
  });

  it('the size band is gone: no module, no reader, no hook, no boot check, no migration', () => {
    expect(existsSync(join(__dirname, '../../services/paper-size-band.ts'))).toBe(false);
    expect(existsSync(join(__dirname, '../../scripts/lib/app-log-reader.ts'))).toBe(false);
    for (const f of ['../../index.ts', '../../services/active-engine-service.ts', '../../services/active-execution-engine.ts', '../../startup/b72-warmup.ts']) {
      expect(readFileSync(join(__dirname, f), 'utf8')).not.toMatch(/paper-size-band|paper_size_band|PaperSizeBand/);
    }
    // Langston r6 C1: the SPACE form too — a comment claiming "the band alert catches it" is a stale justification for
    // leaving p unbounded. Every mention left must say the band is REMOVED.
    for (const f of ['../../services/guardrail-policy.ts', '../../services/active-position-sizing.ts', '../../../audit/coherency_rules.yaml',
      './b-sizing-p5-p6-guardrail-edits.test.ts', './b-sizing-inc2a-derived-slots.test.ts']) {
      const text = readFileSync(join(__dirname, f), 'utf8');
      for (const line of text.split('\n').filter((l) => /size band|band alert/i.test(l))) {
        expect(`${f}: ${line}`).toMatch(/REMOVED/);
      }
    }
    expect(readFileSync(join(__dirname, '../../../drizzle/migrations/MANIFEST.txt'), 'utf8')).not.toMatch(/paper-size-band/);
    // CONTROL: the daily-loss hook beside it on the close path is untouched.
    expect(readFileSync(join(__dirname, '../../services/active-execution-engine.ts'), 'utf8')).toMatch(/evaluateDailyLossBudgetOnClose\(_dlbMode\)/);
  });
});
