/**
 * ════════════════════════════════════════════════════════════════════════════
 * P19-B4a C2 — xStock active-path dispatch (stamp-at-source wire-in)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Tests the connector (`dispatchXstockActiveSignal`) that routes an xStock signal onto the
 * shared active paper pipeline. It must: (1) stay DORMANT unless active trading is
 * AUTHORITATIVELY on (system_context.isEngineActive — the flag B7b flips, NOT manager
 * presence); (2) stamp the SizingContext + metadata with xstock_spot at the pipe chokepoint
 * (stamp-at-source) — so the collision ticker SUI/USD lands xstock_spot regardless of its
 * symbol-derived class; (3) pass the 0–1 confidence straight through; (4) alias the only
 * canonical→type-union name mismatch (range_trade → range_trading); (5) fail loud-but-counted
 * (never throw into the eval loop) on out-of-range confidence or an unknown strategy.
 *
 * The orchestrator handle + storage + balance are stubbed so we capture exactly what the
 * connector hands to dispatchExternalSignal. (The RTB write honoring the stamp is covered by
 * p19-b4a-rtb-assetclass-resolve.test.ts; the build consuming sizingContext.assetClass is
 * covered by the orchestrator suite + tsc.)
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

let captured: any = null;
let engineActive = true;

vi.mock('../../services/paper-sim-service.js', () => ({
  getOrchestratorByMode: () => ({
    dispatchExternalSignal: async (rawSignal: any, strategyId: any, sizingContext: any, marketContext: any) => {
      captured = { rawSignal, strategyId, sizingContext, marketContext };
      return null;
    },
  }),
}));
vi.mock('../../storage.js', () => ({
  storage: {
    getSystemContext: async (_mode: string) => ({ isEngineActive: engineActive }),
    getGuardrailsV2: async () => null,
  },
}));
vi.mock('../../services/guardrail-settings.js', () => ({
  getPortfolioBalanceV2: async () => 1000,
}));

import {
  dispatchXstockActiveSignal,
  getXstockActiveDispatchStats,
} from '../../asset_classes/xstock_spot/active-dispatch.js';

function input(over: Record<string, any> = {}) {
  return {
    symbol: 'TSLA/USD',
    strategyKey: 'vwap_pullback',
    entryPrice: 100,
    stopPrice: 95,
    targetPrice: 110,
    predictiveConfidence: 0.8,
    signalType: 'QUANT',
    sourcePool: 'quant',
    atr: 1.2,
    high24h: 105,
    low24h: 98,
    ...over,
  };
}

describe('P19-B4a C2 — xStock active dispatch (authority gate + stamp-at-source)', () => {
  beforeEach(() => { captured = null; engineActive = true; });

  it('DORMANT when active trading is authoritatively OFF (no dispatch, counted)', async () => {
    engineActive = false;
    const before = getXstockActiveDispatchStats().dormantSkips;
    await dispatchXstockActiveSignal(input());
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().dormantSkips).toBe(before + 1);
  });

  it('when ACTIVE, stamps xstock_spot on the SizingContext + metadata and passes 0-1 confidence', async () => {
    await dispatchXstockActiveSignal(input());
    expect(captured, 'should have dispatched').toBeTruthy();
    expect(captured.sizingContext.assetClass).toBe('xstock_spot');
    expect(captured.sizingContext.mode).toBe('paper');
    expect(captured.rawSignal.metadata.assetClass).toBe('xstock_spot');
    expect(captured.rawSignal.confidence).toBe(0.8); // 0-1, no scaling
    expect(captured.marketContext.atr).toBe(1.2);
  });

  it('COLLISION: SUI/USD via the xStock pipe stamps xstock_spot (the stamp wins over the symbol)', async () => {
    await dispatchXstockActiveSignal(input({ symbol: 'SUI/USD' }));
    expect(captured.sizingContext.assetClass).toBe('xstock_spot');
    expect(captured.rawSignal.symbol).toBe('SUI/USD');
  });

  it('aliases the canonical range_trade to the type-union range_trading', async () => {
    await dispatchXstockActiveSignal(input({ strategyKey: 'range_trade' }));
    expect(captured.rawSignal.strategy).toBe('range_trading');
  });

  it('FAIL-LOUD (counted, no dispatch) on out-of-range confidence', async () => {
    const before = getXstockActiveDispatchStats().dispatchErrors;
    await dispatchXstockActiveSignal(input({ predictiveConfidence: 5 }));
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().dispatchErrors).toBe(before + 1);
  });

  it('FAIL-LOUD (counted, no dispatch) on an unknown strategy', async () => {
    const before = getXstockActiveDispatchStats().dispatchErrors;
    await dispatchXstockActiveSignal(input({ strategyKey: 'not_a_strategy' }));
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().dispatchErrors).toBe(before + 1);
  });
});
