/**
 * P19-B4a C3 — active-fill safety GATE + silent-stall WATCHDOG behavior.
 *
 * All deps mocked so we exercise the gate/watchdog WIRING (the real predicates +
 * config resolver are covered in p19-b4a-c3-predicates.test.ts). Verifies every
 * fail-closed block path increments its counter and never dispatches, that a
 * fresh in-window signal dispatches, and that the watchdog forces a reconnect +
 * critical alert on an open-but-silent socket while staying inert during the
 * weekend or when a reconnect is already pending.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const FULL_CONFIG = {
  activeFillMaxAgeMs: 15000,
  liquidFillWindowOpenMinEt: 570,
  liquidFillWindowCloseMinEt: 960,
  stallReconnectMsRth: 75000,
  stallReconnectMsOffrth: 750000,
};

let captured: any = null;
let engineActive = true;
let safetyConfig: any = { ...FULL_CONFIG };
let inLiquidWindow = true;
let weekendClose = false;
let tickAgeMs: number | null = 1000;
let alertSpy = vi.fn();

vi.mock('../../services/active-engine-service.js', () => ({
  getOrchestratorByMode: () => ({
    dispatchExternalSignal: async (rawSignal: any, strategyId: any, sizingContext: any, marketContext: any) => {
      captured = { rawSignal, strategyId, sizingContext, marketContext };
      return null;
    },
  }),
}));
vi.mock('../../storage.js', () => ({
  storage: {
    // P19-B6.5a: the per-class active gate runs right after the master isEngineActive check, so the
    // mocked context must opt xstock_spot ACTIVE for these C3 fill-safety assertions to be reached.
    getSystemContext: async () => ({ isEngineActive: engineActive, activeAssetClasses: { xstock_spot: true } }),
    getGuardrailsV2: async () => null,
  },
}));
vi.mock('../../services/guardrail-settings.js', () => ({ getPortfolioBalanceV2: async () => 1000 }));
vi.mock('../../db.js', () => ({ db: { execute: async () => ({ rows: [{ age_ms: tickAgeMs }] }) } }));
vi.mock('../../services/system-alerts.js', () => ({
  addAlert: (...a: any[]) => { alertSpy(...a); return Promise.resolve({}); },
}));
vi.mock('../../asset_classes/xstock_spot/fill-safety-config.js', () => ({
  resolveXstockFillSafetyConfig: async () => safetyConfig,
}));
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({
  isXstockLiquidFillWindowET: () => inLiquidWindow,
  isInXstockWeekendClose: () => weekendClose,
}));

import {
  dispatchXstockActiveSignal,
  getXstockActiveDispatchStats,
} from '../../asset_classes/xstock_spot/active-dispatch.js';
import {
  runStallWatchdogTick,
  _setArchiverStateForTest,
} from '../../services/passive-archive/equity-spot-archiver.js';

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

describe('P19-B4a C3 — active-fill safety gate', () => {
  beforeEach(() => {
    captured = null;
    engineActive = true;
    safetyConfig = { ...FULL_CONFIG };
    inLiquidWindow = true;
    tickAgeMs = 1000;
    alertSpy = vi.fn();
  });

  it('fresh tick + in liquid window → dispatches', async () => {
    await dispatchXstockActiveSignal(input());
    expect(captured, 'should have dispatched').toBeTruthy();
    expect(captured.sizingContext.assetClass).toBe('xstock_spot');
  });

  it('fill-safety config missing → blocked + configClosedSkips (fail-closed)', async () => {
    safetyConfig = null;
    const before = getXstockActiveDispatchStats().configClosedSkips;
    await dispatchXstockActiveSignal(input());
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().configClosedSkips).toBe(before + 1);
  });

  // P19-B4b.1 (#295): the active-dispatch "outside the liquid fill window → blocked"
  // test is REMOVED — the RTH clock is no longer a fill gate here (the 24/5 book-depth-
  // sufficiency gate at the engine open seam replaced it; the watchdog block below still
  // exercises `inLiquidWindow` for its RTH-vs-off-RTH stall threshold).

  it('stale latest tick (> max age) → blocked + staleSkips + dedup alert', async () => {
    tickAgeMs = 30000; // > 15000ms
    const before = getXstockActiveDispatchStats().staleSkips;
    await dispatchXstockActiveSignal(input());
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().staleSkips).toBe(before + 1);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('no tick at all (age null) → blocked + staleSkips', async () => {
    tickAgeMs = null;
    const before = getXstockActiveDispatchStats().staleSkips;
    await dispatchXstockActiveSignal(input());
    expect(captured).toBeNull();
    expect(getXstockActiveDispatchStats().staleSkips).toBe(before + 1);
  });
});

describe('P19-B4a C3 — silent-stall watchdog', () => {
  const RTH_CLOCK = new Date('2026-06-17T14:30:00Z'); // Wed 10:30 ET

  beforeEach(() => {
    safetyConfig = { ...FULL_CONFIG };
    inLiquidWindow = true;
    weekendClose = false;
    alertSpy = vi.fn();
  });

  it('open socket silent past the RTH threshold → forces reconnect (close) + critical alert', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 200_000, // 200s silent > 75s RTH threshold
      ws: { readyState: 1, close } as any, // 1 = WebSocket.OPEN
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).toHaveBeenCalledTimes(1);
    expect(alertSpy).toHaveBeenCalled();
  });

  it('reconnect already pending → does NOT close (no race with in-flight backoff)', async () => {
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: true,
      lastMsgAt: Date.now() - 200_000,
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).not.toHaveBeenCalled();
  });

  it('weekend close → inert (no reconnect even on a silent socket)', async () => {
    weekendClose = true;
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 999_000,
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-20T14:30:00Z'));
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).not.toHaveBeenCalled();
  });

  it('within off-RTH threshold → no reconnect (does not thrash on sparse off-hours gaps)', async () => {
    inLiquidWindow = false; // off-RTH → 750s threshold
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 200_000, // 200s < 750s off-RTH threshold
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(new Date('2026-06-17T06:00:00Z')); // Wed 02:00 ET, feed-live but off-RTH
    expect(close).not.toHaveBeenCalled();
  });

  it('config missing → raises config-missing alert + stays inert', async () => {
    safetyConfig = null;
    const close = vi.fn();
    _setArchiverStateForTest({
      enabled: true,
      reconnectPending: false,
      lastMsgAt: Date.now() - 999_000,
      ws: { readyState: 1, close } as any,
    });
    await runStallWatchdogTick(RTH_CLOCK);
    expect(close).not.toHaveBeenCalled();
    expect(alertSpy).toHaveBeenCalled(); // config-missing alert
  });
});
