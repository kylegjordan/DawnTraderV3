/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B6.5a — per-asset-class active gate (Langston Option C)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * The gate is an ADDITIONAL, fail-closed, default-OFF AND-condition layered on top of the per-mode
 * `isEngineActive` master switch: a class trades iff isEngineActive(mode) AND
 * isAssetClassActive(mode, class). These tests cover (1) the typed pure helper's fail-closed
 * semantics (missing key / missing column / undefined context all → inactive), and (2) the
 * gate-10 xStock-ISOLATION acceptance test — with the master ON and crypto active but xStock
 * INACTIVE, the xStock active-dispatch must take the dormant branch and emit ZERO signals (never
 * reaching the orchestrator), while leaving crypto unaffected.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mutable system-context the mocks serve — flip `activeAssetClasses` per test.
let ctx: any = { isEngineActive: true, activeAssetClasses: {} };
const orchSpy = vi.fn(async () => null);

// Light stubs so importing the REAL trading-state-sync (for isAssetClassActiveInContext +
// tradingStateSync) is cheap and side-effect-free.
vi.mock('../../storage.js', () => ({
  storage: {
    getSystemContext: async (_mode: string) => ctx,
    getGuardrailsV2: async () => null,
    updateSystemContext: async (_mode: string, updates: any) => { ctx = { ...ctx, ...updates }; return ctx; },
    getPortfolioState: async () => ({ balance: '1000' }),
  },
}));
vi.mock('../../services/cluster-bus.js', () => ({ clusterBus: { emit: () => {}, on: () => {} } }));
vi.mock('../../services/context-bridge.js', () => ({ contextBridge: { broadcast: async () => {} } }));

// Active-dispatch leaf deps (mirrors p19-b4a-c2-xstock-dispatch.test.ts) so the connector is drivable.
vi.mock('../../services/active-engine-service.js', () => ({
  getOrchestratorByMode: () => { orchSpy(); return { dispatchExternalSignal: async () => null }; },
}));
vi.mock('../../services/guardrail-settings.js', () => ({ getPortfolioBalanceV2: async () => 1000 }));
vi.mock('../../db.js', () => ({ db: { execute: async () => ({ rows: [{ age_ms: 1000 }] }) } }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: async () => ({}) }));
// P19-B8.5 (gate-12): the activation refusal counts strategy_gates rows — mock
// non-empty by default so the round-trip tests exercise the flip, and mutable so
// the refusal test below can drive the ZERO-rows case.
let __gateRowCounts: Record<string, number> = { crypto_spot: 19, xstock_spot: 19 };
vi.mock('../../services/module-constants-service.js', () => ({
  countModuleRowsByAssetClass: async () => ({ ...__gateRowCounts }),
}));
vi.mock('../../asset_classes/xstock_spot/fill-safety-config.js', () => ({
  resolveXstockFillSafetyConfig: async () => ({ activeFillMaxAgeMs: 15000 }),
}));

import { isAssetClassActiveInContext, tradingStateSync } from '../../services/trading-state-sync';
import { dispatchXstockActiveSignal, getXstockActiveDispatchStats } from '../../asset_classes/xstock_spot/active-dispatch';

describe('P19-B6.5a isAssetClassActiveInContext (fail-closed typed gate)', () => {
  it('undefined context → inactive (fail-closed)', () => {
    expect(isAssetClassActiveInContext(undefined, 'crypto_spot')).toBe(false);
  });
  it('empty map → inactive (default-OFF)', () => {
    expect(isAssetClassActiveInContext({ activeAssetClasses: {} } as any, 'crypto_spot')).toBe(false);
  });
  it('missing column → inactive (fail-closed, pre-migration-shaped row)', () => {
    expect(isAssetClassActiveInContext({} as any, 'crypto_spot')).toBe(false);
  });
  it('class present + true → active', () => {
    expect(isAssetClassActiveInContext({ activeAssetClasses: { crypto_spot: true } } as any, 'crypto_spot')).toBe(true);
  });
  it('ISOLATION: a different class being active does NOT activate this one', () => {
    expect(isAssetClassActiveInContext({ activeAssetClasses: { crypto_spot: true } } as any, 'xstock_spot')).toBe(false);
  });
  it('explicit false → inactive', () => {
    expect(isAssetClassActiveInContext({ activeAssetClasses: { xstock_spot: false } } as any, 'xstock_spot')).toBe(false);
  });
  it('non-boolean truthy ("true" string) → inactive (strict === true, no coercion)', () => {
    expect(isAssetClassActiveInContext({ activeAssetClasses: { crypto_spot: 'true' } } as any, 'crypto_spot')).toBe(false);
  });
});

describe('P19-B6.5a accessor + setter round-trip (async, H1 write-then-state)', () => {
  beforeEach(() => { ctx = { isEngineActive: true, activeAssetClasses: {} }; });

  it('isAssetClassActive reads the DB SSOT; setAssetClassActive flips it without clobbering siblings', async () => {
    expect(await tradingStateSync.isAssetClassActive('paper', 'crypto_spot')).toBe(false);
    await tradingStateSync.setAssetClassActive('u1', 'paper', 'crypto_spot', true);
    expect(await tradingStateSync.isAssetClassActive('paper', 'crypto_spot')).toBe(true);
    // sibling untouched
    expect(await tradingStateSync.isAssetClassActive('paper', 'xstock_spot')).toBe(false);
    await tradingStateSync.setAssetClassActive('u1', 'paper', 'xstock_spot', true);
    expect(await tradingStateSync.isAssetClassActive('paper', 'crypto_spot')).toBe(true); // not clobbered
    expect(await tradingStateSync.isAssetClassActive('paper', 'xstock_spot')).toBe(true);
  });

  // P19-B8.5 (gate-12, Langston flip-blocker): ACTIVATION with ZERO strategy_gates
  // rows must REFUSE loudly (default-open would silently run the full strategy set).
  // Deactivation is always allowed.
  it('gate-12: activation REFUSES when strategy_gates is empty for the class; deactivation always allowed', async () => {
    __gateRowCounts = { xstock_spot: 19 }; // crypto_spot absent → 0 rows
    await expect(
      tradingStateSync.setAssetClassActive('u1', 'paper', 'crypto_spot', true),
    ).rejects.toThrow(/GATE-12-REFUSAL/);
    expect(await tradingStateSync.isAssetClassActive('paper', 'crypto_spot')).toBe(false); // state untouched
    await tradingStateSync.setAssetClassActive('u1', 'paper', 'crypto_spot', false); // deactivate: no refusal
    __gateRowCounts = { crypto_spot: 19, xstock_spot: 19 }; // restore for any later cases
  });
});

describe('P19-B6.5a xStock-ISOLATION acceptance (gate 10)', () => {
  const signal: any = {
    symbol: 'AAPLx/USD', strategyKey: 'momentum_breakout', predictiveConfidence: 0.8,
    atr: 1, high24h: 110, low24h: 90,
  };
  beforeEach(() => { orchSpy.mockClear(); });

  it('master ON + crypto active + xStock INACTIVE → xStock dispatch takes the class-dormant branch, ZERO emission', async () => {
    ctx = { isEngineActive: true, activeAssetClasses: { crypto_spot: true } }; // xstock_spot absent = OFF
    const before = getXstockActiveDispatchStats();
    await dispatchXstockActiveSignal(signal);
    const after = getXstockActiveDispatchStats();
    expect(after.classDormantSkips).toBe(before.classDormantSkips + 1); // skipped at the per-class gate
    expect(after.dispatched).toBe(before.dispatched);                   // emitted nothing
    expect(orchSpy).not.toHaveBeenCalled();                             // never reached the orchestrator
  });

  it('master OFF entirely → the master-dormant branch (not the class branch) handles it', async () => {
    ctx = { isEngineActive: false, activeAssetClasses: { xstock_spot: true } };
    const before = getXstockActiveDispatchStats();
    await dispatchXstockActiveSignal(signal);
    const after = getXstockActiveDispatchStats();
    expect(after.dormantSkips).toBe(before.dormantSkips + 1);            // master gate, not class gate
    expect(after.classDormantSkips).toBe(before.classDormantSkips);
    expect(orchSpy).not.toHaveBeenCalled();
  });

  it('master ON + xStock ACTIVE → passes the per-class gate (reaches the orchestrator lookup)', async () => {
    ctx = { isEngineActive: true, activeAssetClasses: { xstock_spot: true } };
    const before = getXstockActiveDispatchStats();
    await dispatchXstockActiveSignal(signal);
    const after = getXstockActiveDispatchStats();
    expect(after.classDormantSkips).toBe(before.classDormantSkips);      // NOT blocked by the class gate
    expect(orchSpy).toHaveBeenCalled();                                  // proceeded past the gate
  });
});
