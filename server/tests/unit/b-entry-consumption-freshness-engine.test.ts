/**
 * B-ENTRY-CONSUMPTION-FRESHNESS — production-seam coverage.
 *
 * These tests drive the real ActiveExecutionEngine.executeSimulatedTrade method on a
 * prototype-backed engine. Only external seams are replaced: risk/config readers,
 * venue validation, persistence, diagnostics, and the order-placement port. The
 * branch selection, final consumption decision, side-effect ordering, and persisted
 * payloads are production code.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  nowMonoMs: 1_000,
  gate: null as any,
  checkGuardrailRisk: vi.fn(async () => ({ ok: true })),
  evaluateTradeExpectancy: vi.fn(() => ({
    isTradeable: true,
    netEV: 0.1,
    ev: 0.1,
    score: 90,
    rejectionReason: null,
  })),
  recordDepthGateBlock: vi.fn(),
  recordOpenFailed: vi.fn(),
  recordEvInputSample: vi.fn(),
  recordOpen: vi.fn(),
  recordValidateSkipped: vi.fn(),
  recordEvRejectShadow: vi.fn(),
  openOrder: vi.fn(),
  getActiveOpenPositions: vi.fn(async () => [] as unknown[]),
  createClosedTrade: vi.fn(async () => ({ id: 'trade-1' })),
  createActiveOpenPosition: vi.fn(async () => ({ position: { id: 'position-1' }, created: true })),
  createActiveTradeLog: vi.fn(async () => ({})),
  consumeSignalBySymbol: vi.fn(async () => null),
  deleteClosedTrade: vi.fn(async () => undefined),
  archiveSignalEval: vi.fn(),
  evaluateDivergenceAtOpen: vi.fn(async () => undefined),
  addOrder: vi.fn(),
  i8cSubscribeNewTrade: vi.fn(),
  seedLastKnownGoodPrice: vi.fn(),
  logOpen: vi.fn(async () => undefined),
  lifecycleOpen: vi.fn(),
  logExecutionAttempt: vi.fn(async () => undefined),
}));

vi.mock('../../services/trade-safety.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  checkGuardrailRisk: h.checkGuardrailRisk,
}));

vi.mock('../../core/calculations/expectancy.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  evaluateTradeExpectancy: h.evaluateTradeExpectancy,
  getPerClassTargetGate: () => ({ minRR: 1 }),
}));

vi.mock('../../services/execution/depth-source.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  recordDepthGateBlock: h.recordDepthGateBlock,
}));

vi.mock('../../services/rtb-metrics-service.js', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    rtbMetricsService: new Proxy(real.rtbMetricsService, {
      get(target, prop) {
        if (prop === 'recordOpenFailed') return h.recordOpenFailed;
        if (prop === 'recordEvInputSample') return h.recordEvInputSample;
        if (prop === 'recordOpen') return h.recordOpen;
        if (prop === 'recordValidateSkipped') return h.recordValidateSkipped;
        if (prop === 'recordEvRejectShadow') return h.recordEvRejectShadow;
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

vi.mock('../../storage', async (orig) => {
  const real = await orig<Record<string, any>>();
  const seams: Record<string, unknown> = {
    getActiveOpenPositions: h.getActiveOpenPositions,
    createClosedTrade: h.createClosedTrade,
    createActiveOpenPosition: h.createActiveOpenPosition,
    createActiveTradeLog: h.createActiveTradeLog,
    consumeSignalBySymbol: h.consumeSignalBySymbol,
    deleteClosedTrade: h.deleteClosedTrade,
  };
  return {
    ...real,
    storage: new Proxy(real.storage ?? {}, {
      get(target, prop) {
        if (typeof prop === 'string' && Object.prototype.hasOwnProperty.call(seams, prop)) return seams[prop];
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

vi.mock('../../markets/venue-grid-resolver.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveVenueSizeLimits: () => ({ lotDecimals: null, ordermin: null, costmin: null }),
}));

vi.mock('../../core/calculations/venue-price-grid.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  roundQuantityForVenue: (quantity: number) => ({ quantity }),
}));

vi.mock('../../services/execution/venue-validate.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  validatePaperOrderWithVenue: async () => ({ outcome: 'accepted', detail: 'test' }),
}));

vi.mock('../../core/math/cost-model.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getFrictionForAssetClass: () => ({ feeRateMaker: 0.001, feeRateTaker: 0.002 }),
}));

vi.mock('../../services/maker-taker-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveMakerMaxPendingMs: () => 60_000,
}));

vi.mock('../../services/guardrail-settings.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getPortfolioBalanceV2: async () => 10_000,
}));

vi.mock('../../services/market-context-engine.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getMarketContextEngine: () => ({
    getCachedContext: () => null,
    getCurrentMacroContext: () => null,
    getCurrentPhaseWeights: () => null,
  }),
}));

vi.mock('../../services/portfolio-anchor-service.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getRatioStampInputs: async () => null,
}));

vi.mock('../../services/friction-divergence-evaluator.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  evaluateDivergenceAtOpen: h.evaluateDivergenceAtOpen,
}));

vi.mock('../../services/data-archive/signal-eval-archiver.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  archiveSignalEval: h.archiveSignalEval,
}));

vi.mock('../../services/data-archive/decision-provenance.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  gateConstantsVersionFor: () => 'test-gate-version',
}));

vi.mock('../../services/aj19-max-position-diagnostic.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  aj19Diagnostic: {
    logSignalGenerated: vi.fn(),
    isDryRunNoGuardrails: () => false,
    logWouldBeTrade: vi.fn(),
  },
}));

vi.mock('../../services/aj19b-lifecycle-diagnostic.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  aj19bDiagnostic: { logOpen: h.logOpen },
}));

vi.mock('../../services/b4-diagnostics.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  b4Diagnostics: { logFunnelEvent: vi.fn() },
}));

vi.mock('../../services/context-bridge.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  contextBridge: { broadcast: vi.fn() },
}));

vi.mock('../../services/active-filter-pool.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  activeFilterPool: { getSymbolVolumeInfo: () => ({ volume24h: 0, volumeBucket: 'Very Low' }) },
}));

vi.mock('../../services/market-volume-cache.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  marketVolumeCache: {
    classifyVolume: () => 'High',
    getVolume: async () => ({ volume24h: 1_000_000, volumeBucket: 'High' }),
  },
}));

vi.mock('../../services/live-pricing-adapter.js', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    livePricingAdapter: new Proxy(real.livePricingAdapter, {
      get(target, prop) {
        if (prop === 'seedLastKnownGoodPrice') return h.seedLastKnownGoodPrice;
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    krakenWebSocketAdapter: new Proxy(real.krakenWebSocketAdapter, {
      get(target, prop) {
        if (prop === 'getBookForFill') return vi.fn();
        if (prop === 'i8cSubscribeNewTrade') return h.i8cSubscribeNewTrade;
        const value = Reflect.get(target, prop);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});

vi.mock('../../services/i1-rtb-diagnostics-service.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  i1RtbDiagnostics: { recordOpen: h.logOpen },
}));

vi.mock('../../services/i1-trade-lifecycle-diagnostics.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  i1TradeLifecycleDiagnostics: { logOpen: h.lifecycleOpen },
}));

import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';

type Stub = Record<string, any>;
const proto = ActiveExecutionEngine.prototype as unknown as Stub;

const asks = [{ price: 100, qty: 10 }];
const bids = [{ price: 99, qty: 10 }];

function gate(ageMs = 4_000, warmthMaxAgeMs = 5_000, askLevels = asks) {
  return {
    pass: true,
    reason: 'ok',
    warmthMaxAgeMs,
    snapshot: {
      asks: askLevels,
      bids,
      ageMs,
      ageReadStartedMonoMs: 1_000,
      ageReadValid: true,
      source: 'crypto_ws_book',
    },
  };
}

function signal(chosenEntryMode: 'taker' | 'maker' = 'taker') {
  return {
    symbol: 'BTC/USD',
    strategy: 'test_strategy',
    confidence: 0.8,
    entryPrice: 100,
    stopPrice: 90,
    targetPrice: 120,
    quantity: 1,
    estimatedValue: 100,
    chosenEntryMode,
    chosenNetEv: 0.1,
    takerNetEv: 0.1,
    metadata: { assetClass: 'crypto_spot', volume24h: 1_000_000 },
  };
}

function makeEngine(): Stub {
  const eng: Stub = Object.create(proto);
  Object.assign(eng, {
    mode: 'paper',
    orderPlacer: { openOrder: h.openOrder, closeOrder: vi.fn() },
    krakenService: { addOrder: h.addOrder },
    _evaluateOpenDepthGate: vi.fn(async () => h.gate),
    logExecutionAttempt: h.logExecutionAttempt,
  });
  expect(eng.executeSimulatedTrade).toBe(proto.executeSimulatedTrade);
  return eng;
}

async function execute(eng: Stub, sig: ReturnType<typeof signal>) {
  return proto.executeSimulatedTrade.call(eng, sig, { portfolioValue: '10000' });
}

beforeEach(() => {
  vi.clearAllMocks();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockImplementation(() => h.nowMonoMs);
  h.gate = gate();
  h.nowMonoMs = 1_000;
  h.checkGuardrailRisk.mockResolvedValue({ ok: true });
  h.evaluateTradeExpectancy.mockReturnValue({
    isTradeable: true,
    netEV: 0.1,
    ev: 0.1,
    score: 90,
    rejectionReason: null,
  });
  h.openOrder.mockResolvedValue({
    status: 'filled',
    fillPrice: 100,
    fillQty: 1,
    feeQuote: 0.2,
    slippageQuote: 0,
  });
  h.getActiveOpenPositions.mockResolvedValue([]);
  h.createClosedTrade.mockResolvedValue({ id: 'trade-1' });
  h.createActiveOpenPosition.mockResolvedValue({ position: { id: 'position-1' }, created: true });
});

afterEach(() => vi.restoreAllMocks());

describe('B-ENTRY-CONSUMPTION-FRESHNESS — ActiveExecutionEngine production seam', () => {
  it.each([
    ['direct taker', 'taker' as const, [{ price: 101, qty: 10 }]],
    ['maker-to-taker', 'maker' as const, asks],
  ])('refuses an expired %s once, before placement or persistence', async (_name, mode, armAsks) => {
    h.gate = gate(4_500, 5_000, armAsks);
    h.nowMonoMs = 1_501;

    const result = await execute(makeEngine(), signal(mode));

    expect(result).toMatchObject({ opened: false, stage: 'CONSUMPTION_FRESHNESS' });
    expect(h.openOrder).not.toHaveBeenCalled();
    expect(h.recordDepthGateBlock).toHaveBeenCalledTimes(1);
    expect(h.recordDepthGateBlock).toHaveBeenCalledWith('crypto_spot', 'stale_at_consumption age=5001ms>5000ms');
    expect(h.recordOpenFailed).toHaveBeenCalledTimes(1);
    expect(h.recordOpenFailed).toHaveBeenCalledWith(
      'BTC/USD', 'test_strategy', 'CONSUMPTION_FRESHNESS', 'stale_at_consumption age=5001ms>5000ms',
    );
    expect(h.createClosedTrade).not.toHaveBeenCalled();
    expect(h.createActiveOpenPosition).not.toHaveBeenCalled();
  });

  it('passes the same asks identity to placement and persists ordered gate/consumption ages', async () => {
    const capturedAsks = [{ price: 100, qty: 10 }, { price: 101, qty: 20 }];
    h.gate = gate(4_000, 5_000, capturedAsks);
    h.nowMonoMs = 1_250;

    const result = await execute(makeEngine(), signal('taker'));

    expect(result).toEqual({ opened: true, tradeId: 'trade-1' });
    expect(h.openOrder).toHaveBeenCalledTimes(1);
    expect(h.openOrder.mock.calls[0][0].bookAsks).toBe(capturedAsks);
    expect(h.createClosedTrade).toHaveBeenCalledTimes(1);
    const tradePayload = h.createClosedTrade.mock.calls[0][1];
    expect(tradePayload.entryBookAgeMs).toBe(4_000);
    expect(tradePayload.entryBookConsumptionAgeMs).toBe(4_250);
    expect(tradePayload.entryBookConsumptionAgeMs).toBeGreaterThanOrEqual(tradePayload.entryBookAgeMs);
    expect(h.createActiveOpenPosition).toHaveBeenCalledTimes(1);
  });

  it('keeps a pending maker outside placement and stamps no consumption age', async () => {
    h.gate = gate(4_000, 5_000, [{ price: 101, qty: 10 }]);
    h.nowMonoMs = 1_250;

    const result = await execute(makeEngine(), signal('maker'));

    expect(result).toEqual({ opened: true, tradeId: 'trade-1' });
    expect(h.openOrder).not.toHaveBeenCalled();
    expect(h.createClosedTrade).toHaveBeenCalledTimes(1);
    expect(h.createClosedTrade.mock.calls[0][1].entryBookConsumptionAgeMs).toBeNull();
    expect(h.createActiveOpenPosition).toHaveBeenCalledTimes(1);
    expect(h.createActiveOpenPosition.mock.calls[0][1]).toMatchObject({
      state: 'pending',
      makerLimitPrice: '100',
    });
  });
});
