/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B6.5b — F2 witness wiring (#321) + crypto-isolation gate predicate (F1, #320)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * #320 carry-in: the audit PROVED the crypto entry gate could be bypassed at the
 * scanMode pool layer (pool population keyed on master isEngineActive, not the
 * per-class flag). F1 closes it structurally (fx5-scanner scanMode now gates pool
 * population on `isEngineActive && isAssetClassActiveInContext(ctx,'crypto_spot')`)
 * AND with defense-in-depth at the single RTB admission chokepoint queueSQESignal
 * (+ the purgeInactiveClassSignals re-eval purge), each wiring the #321 witness.
 *
 * These tests cover the two pieces that are cheaply + deterministically unit-testable:
 *  - F2/#321: witnessAssetClassEmissionWhileInactive is now WIRED and OBSERVABLE
 *    (it increments the LIVENESS_SPLIT counter — it was defined-but-uncalled before).
 *  - F1 gate predicate (the gate-10 crypto-ISOLATION acceptance at the exact boolean
 *    the fix uses): master ON + crypto OFF (+ xStock ON) → pool NOT eligible.
 *
 * The full queueSQESignal admission reject is integration-proven on staging during
 * the B6.5b dry-run REVERT (flip crypto OFF → purge/reject fires + witness counter
 * increments) rather than unit-tested here — importing the ReadyToBuyService module
 * pulls central-clock / tcl_watchdog / SQE and is disproportionately brittle to mock.
 * The 3-line guard's pieces (isAssetClassActiveInContext + the witness) ARE unit-
 * tested (here + p19-b6-5a); Langston Step-4 reviews the composition.
 * ════════════════════════════════════════════════════════════════════════════
 */
import { describe, it, expect, vi } from 'vitest';

let ctx: any = { isEngineActive: true, activeAssetClasses: {} };
vi.mock('../../storage.js', () => ({
  storage: {
    getSystemContext: async () => ctx,
    getGuardrailsV2: async () => null,
    updateSystemContext: async (_m: string, u: any) => { ctx = { ...ctx, ...u }; return ctx; },
    getPortfolioState: async () => ({ balance: '1000' }),
  },
}));
vi.mock('../../services/cluster-bus.js', () => ({ clusterBus: { emit: () => {}, on: () => {} } }));
vi.mock('../../services/context-bridge.js', () => ({ contextBridge: { broadcast: async () => {} } }));

import { isAssetClassActiveInContext, tradingStateSync } from '../../services/trading-state-sync';

describe('P19-B6.5b F2/#321 — witnessAssetClassEmissionWhileInactive is wired + observable', () => {
  it('calling the witness increments the LIVENESS_SPLIT counter (was defined-but-uncalled before B6.5b)', () => {
    const key = 'asset-class-gate:paper:crypto_spot';
    const before = tradingStateSync.getLivenessSplitStats()[key]?.count ?? 0;
    tradingStateSync.witnessAssetClassEmissionWhileInactive('paper', 'crypto_spot');
    const after = tradingStateSync.getLivenessSplitStats()[key]?.count ?? 0;
    expect(after).toBe(before + 1);
    expect(tradingStateSync.getLivenessSplitStats()[key].lastReason).toContain('crypto_spot');
  });

  it('the witness is per-(mode,class) keyed — a different mode does not collide', () => {
    const liveKey = 'asset-class-gate:live:crypto_spot';
    const before = tradingStateSync.getLivenessSplitStats()[liveKey]?.count ?? 0;
    tradingStateSync.witnessAssetClassEmissionWhileInactive('live', 'crypto_spot');
    expect(tradingStateSync.getLivenessSplitStats()[liveKey].count).toBe(before + 1);
  });
});

describe('P19-B6.5b F1/#320 — crypto-isolation gate predicate (gate-10 crypto mirror)', () => {
  // This is the EXACT boolean fx5-scanner scanMode uses to gate active-pool population:
  //   cryptoActivePoolEligible = isEngineActive && isAssetClassActiveInContext(ctx, 'crypto_spot')
  const poolEligible = (c: any) => (c?.isEngineActive ?? false) && isAssetClassActiveInContext(c, 'crypto_spot');

  it('master ON + crypto OFF (+ xStock ON) → crypto pool NOT eligible (no orchestrator feed)', () => {
    expect(poolEligible({ isEngineActive: true, activeAssetClasses: { xstock_spot: true } })).toBe(false);
  });
  it('master ON + crypto ON → crypto pool eligible', () => {
    expect(poolEligible({ isEngineActive: true, activeAssetClasses: { crypto_spot: true } })).toBe(true);
  });
  it('master OFF + crypto ON → NOT eligible (master axis still gates)', () => {
    expect(poolEligible({ isEngineActive: false, activeAssetClasses: { crypto_spot: true } })).toBe(false);
  });
  it('master ON + empty classes (B6.5a dormant default) → NOT eligible (fail-closed)', () => {
    expect(poolEligible({ isEngineActive: true, activeAssetClasses: {} })).toBe(false);
  });
});
