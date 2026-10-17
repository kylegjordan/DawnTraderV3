// B-CLASS-LEG-FILL-MODE (#1170) — production-seam target-rest expiry proofs.
//
// These tests drive the REAL `checkOpenPositions` and the REAL `closePosition` through a mutable
// in-memory stand-in for the active-position row. That distinction is load-bearing: expiry first
// writes the cleared rest back to the row, then `closePosition` re-fetches that row before writing
// the closed trade. The assertions therefore cover both provenance handoffs Coltrane requested:
//   1. the expiry DB update preserves the governing target policy; and
//   2. the same policy is also carried explicitly into the close call and reaches the closed row.
//
// Mutation controls (run while writing this file, production source restored afterwards):
//   - replacing the expiry update's preserved policy with null makes both tests red;
//   - removing the explicit close payload's target policy makes both tests red.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

type Position = Record<string, any>;

const h = vi.hoisted(() => ({
  position: null as Position | null,
  nextExit: null as null | { type: string; price: number; reason: string },
  frame: { bid: 111, ask: 112, last: 111.5 },
  updateActiveOpenPosition: vi.fn(),
  updateClosedTrade: vi.fn(),
  deleteActiveOpenPosition: vi.fn(),
  createActiveTradeLog: vi.fn(async () => ({})),
  addAlert: vi.fn(async (_a: unknown) => undefined),
}));

vi.mock('../../storage', async (orig) => {
  const real = await orig<Record<string, any>>();
  return {
    ...real,
    storage: new Proxy(real.storage ?? {}, {
      get(target, prop) {
        if (prop === 'getActiveOpenPositions') return vi.fn(async () => h.position ? [h.position] : []);
        if (prop === 'getActiveOpenPosition') return vi.fn(async (_mode: string, id: string) => h.position?.id === id ? h.position : null);
        if (prop === 'updateActiveOpenPosition') return h.updateActiveOpenPosition;
        if (prop === 'getClosedTradesBySymbol') return vi.fn(async () => [{ id: 'trade-policy', openedAt: new Date(), closedAt: null, metadata: {} }]);
        if (prop === 'updateClosedTrade') return h.updateClosedTrade;
        if (prop === 'deleteActiveOpenPosition') return h.deleteActiveOpenPosition;
        if (prop === 'createActiveTradeLog') return h.createActiveTradeLog;
        return (target as any)[prop];
      },
    }),
  };
});

vi.mock('../../services/system-alerts.js', async (orig) => ({ ...(await orig<Record<string, unknown>>()), addAlert: h.addAlert }));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getLatestEquityTick: () => {
    const now = Date.now();
    return {
      price: (h.frame.bid + h.frame.ask) / 2,
      tsMs: now,
      kind: 'mid',
      observed: true,
      raw: { ...h.frame, bidQty: 10, askQty: 10, atMs: now },
    };
  },
}));
vi.mock('../../asset_classes/xstock_spot/book-state-tracker.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  assessBookStateNow: () => ({ ok: false, reason: 'disabled' }),
}));
vi.mock('../../asset_classes/xstock_spot/mark-staleness-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  readXstockMarkStalenessConfig: () => ({ budgetK: 0.5, nullStopBudgetPct: 0.005, floorMs: 10_000, capMs: 90_000, sigmaFullCreditMs: 60_000 }),
  readXstockColdMarkMaxMs: () => 15_000,
  readXstockSigmaCacheConfig: () => ({ windowMs: 3_600_000, refreshAfterMs: 60_000, maxAgeMs: 600_000, minObservations: 30, classwidePercentile: 0.9, queryTimeoutMs: 5_000 }),
}));
vi.mock('../../asset_classes/xstock_spot/sigma-rate-cache.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getCachedSigma: () => ({ sigmaRatePerSec: 1e-5, ageMs: 0, source: 'test' }),
  ensureSigmaFresh: () => ({ enqueued: 0, classwide: false }),
}));
vi.mock('../../services/execution/depth-source.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  getDepthSnapshot: async () => ({
    bids: [{ price: h.frame.bid, qty: 10 }],
    asks: [{ price: h.frame.ask, qty: 10 }],
    ageMs: 0,
    source: 'test',
    verdict: { bid: 'ok', ask: 'ok' },
  }),
  getTickerWitness: async () => ({ bid: h.frame.bid, ask: h.frame.ask, capturedAtMs: Date.now() }),
}));
vi.mock('../../services/execution/depth-gate-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveFillDepthGateConfig: async () => ({ warmthMaxAgeMs: 15_000, sufficiencyMultiple: 2, minLevels: 1, beyondDepthPenaltyBps: 50 }),
}));
vi.mock('../../services/execution/close-fill-contract-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveCloseFillContractConfig: async () => ({ upTol: 0.01, coldRefusalCap: 3 }),
}));
vi.mock('../../services/trailing-exit-controller.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveTECConfig: () => ({ breakEvenTriggerR: 1, targetLockR: 1.5, trailDistanceAtrMultiplier: 1 }),
  getTrailingState: () => null,
  clearTrailingState: () => undefined,
}));
vi.mock('../../services/data-aggregator.js', () => ({ dataAggregator: { capture: vi.fn(async () => undefined) } }));
vi.mock('../../services/data-archive/exit-decision-archiver.js', () => ({ archiveExitDecision: vi.fn() }));
vi.mock('../../services/vts-live-comparison-audit.js', () => ({ recordPaperTrade: vi.fn() }));
vi.mock('../../services/aj19b-lifecycle-diagnostic', () => ({ aj19bDiagnostic: { logClose: vi.fn(async () => undefined) } }));
vi.mock('../../services/i1-trade-lifecycle-diagnostics.js', () => ({ i1TradeLifecycleDiagnostics: { logClose: vi.fn(), logForceClose: vi.fn() } }));
vi.mock('../../services/c5-financial-diagnostics.js', () => ({ c5FinancialDiagnostics: { logPnlReconciliation: vi.fn(), logBalanceReconciliation: vi.fn(async () => undefined) } }));
import { ActiveExecutionEngine } from '../../services/active-execution-engine.js';
import { PaperOrderPlacer } from '../../services/execution/order-placer.js';
import { VenueQuietState } from '../../services/venue-quiet-alerting.js';
import { priceCache } from '../../services/price-cache';
import { livePricingAdapter } from '../../services/live-pricing-adapter';

const proto = ActiveExecutionEngine.prototype as unknown as Record<string, any>;

function makePosition(policy: 'maker_only' | 'maker_preferred'): Position {
  return {
    id: `pos-${policy}`,
    symbol: 'MDB/USD',
    assetClass: 'xstock_spot',
    strategyName: 'test_strategy',
    side: 'buy',
    state: 'open',
    quantity: '1',
    avgPrice: '100',
    intendedEntryPrice: '100',
    entryFee: '0',
    entrySlippage: '0',
    stopLoss: '90',
    takeProfit: '110',
    openedAt: new Date(Date.now() - 3_600_000),
    exitLimitPrice: '110',
    exitRestPlacedAt: new Date(Date.now() - 120_000),
    exitDeadline: new Date(Date.now() - 60_000),
    targetExitFillPolicy: policy,
    tradeMode: 'TARGET',
    metadata: {},
  };
}

function makeEngine() {
  const eng: Record<string, any> = Object.create(proto);
  Object.assign(eng, {
    mode: 'paper',
    feePercentFor: () => 0.1,
    orderPlacer: new PaperOrderPlacer(() => 0.1),
    lastEvaluateAt: 0,
    lastExitChecks: [],
    lastCycleAt: 0,
    lastPriceTickTime: new Map(),
    priceTickLogs: [],
    MAX_PRICE_TICK_LOGS: 100,
    _bookStateSkipStreak: new Map(),
    _priceSkipStreak: new Map(),
    _priceSkipReasons: new Map(),
    _noTriggerStreak: new Map(),
    _closeRefusalStreak: new Map(),
    _exitEvalInvoked: 0,
    _noTriggerRefusals: 0,
    _exitEvalNoHit: 0,
    _exitEvalHit: 0,
    _exitEvalNoMark: 0,
    _venueMarkNonFinite: 0,
    _exitEvalByClass: { crypto: { invoked: 0, refused: 0 }, xstock: { invoked: 0, refused: 0 }, other: { invoked: 0, refused: 0 } },
    _xsBidDivergence: new Map(),
    _xsSizeCounts: { x1Short: 0, x1Unknown: 0, x2Short: 0, x2Unknown: 0, trigShort: 0, trigUnknown: 0, invalidQty: 0, closeCrossedWalks: 0 }, _xsInvalidQtyPaged: new Set(), // row 2 increment B
    _xsSizeWindow: { startMs: Date.now(), n: 0, unknown: 0 }, // row 2 increment B (the size tripwire)
    _xsFramesEmitted: 0,
    _xsFrameClassMismatch: 0,
    _entryFillLooks: 0,
    _entryFillRefusedFirstLook: 0,
    _entryFillRefusedSteady: 0,
    _entryFillLooked: new Set(),
    _priceSkipEscalated: new Set(),
    _venueQuiet: new VenueQuietState(),
    _lastVenueQuietSweepAt: Date.now(),
    _exitRefusalTally: new Map(),
    _riMissSig: new Map(),
    _riMissAcc: new Map(),
    _engineConstructedAt: 0,
    _venuePauseExitTicks: 0,
    _venuePauseWouldFire: 0,
    _venuePauseBidWouldFire: 0,
    _venuePauseEntriesRefused: 0,
    _venuePausePending: new Map(),
    _coldMarkTicks: 0,
    _coldMarkPending: new Map(),
    _recordPriceSkip: vi.fn(async () => undefined),
    _recordBookStateEvent: vi.fn(async () => undefined),
    _runVenueQuietSweep: vi.fn(async () => undefined),
    _runReserveRowTripwire: vi.fn(async () => undefined),
    checkExitConditions: vi.fn(async () => h.nextExit),
  });
  const realClose = proto.closePosition;
  eng.closePosition = vi.fn((...args: unknown[]) => realClose.call(eng, ...args));
  return eng;
}

const expiryWrite = () => h.updateActiveOpenPosition.mock.calls
  .map((c) => c[2] as Record<string, unknown>)
  .find((p) => p.exitLimitPrice === null);

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(new Date('2026-10-14T15:00:00Z'));
  h.position = null;
  h.nextExit = null;
  h.frame = { bid: 111, ask: 112, last: 111.5 };
  h.updateActiveOpenPosition.mockImplementation(async (_mode: string, id: string, patch: Record<string, unknown>) => {
    if (h.position?.id === id) Object.assign(h.position, patch);
    return h.position;
  });
  h.updateClosedTrade.mockImplementation(async (_mode: string, _id: string, patch: Record<string, unknown>) => ({ ...patch }));
  h.deleteActiveOpenPosition.mockImplementation(async (_mode: string, id: string) => {
    if (h.position?.id === id) h.position = null;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(priceCache, 'setReasonMembers').mockImplementation(() => {});
  vi.spyOn(livePricingAdapter, 'updateCache').mockImplementation(() => undefined as any);
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
  for (const fn of Object.values(h)) if (typeof fn === 'function' && 'mockReset' in fn) (fn as any).mockReset();
});

describe('B-CLASS-LEG-FILL-MODE — target policy through the real engine seam', () => {
  it('maker_only expiry preserves policy, stays open, and a later stop closes with maker_only', async () => {
    h.position = makePosition('maker_only');
    h.nextExit = { type: 'target_hit', price: 111.5, reason: 'target' };
    const eng = makeEngine();

    await proto.checkOpenPositions.call(eng);

    expect(expiryWrite()).toMatchObject({
      exitLimitPrice: null,
      exitRestPlacedAt: null,
      exitDeadline: null,
      targetExitFillPolicy: 'maker_only',
    });
    expect(h.position).not.toBeNull();
    expect(eng.closePosition).not.toHaveBeenCalled();

    h.nextExit = { type: 'stop_hit', price: 89, reason: 'stop' };
    h.frame = { bid: 89, ask: 90, last: 89.5 };
    await proto.checkOpenPositions.call(eng);

    expect(eng.closePosition).toHaveBeenCalledTimes(1);
    expect(eng.closePosition.mock.calls[0][4]).toMatchObject({ targetExitFillPolicy: 'maker_only' });
    expect(h.updateClosedTrade).toHaveBeenCalledTimes(1);
    expect(h.updateClosedTrade.mock.calls[0][2]).toMatchObject({ targetExitFillPolicy: 'maker_only', closeReason: 'stop_hit' });
  });

  it('maker_preferred expiry preserves policy and converts the current target to a same-tick taker close', async () => {
    h.position = makePosition('maker_preferred');
    h.nextExit = { type: 'target_hit', price: 111.5, reason: 'target' };
    const eng = makeEngine();

    await proto.checkOpenPositions.call(eng);

    expect(expiryWrite()).toMatchObject({
      exitLimitPrice: null,
      exitRestPlacedAt: null,
      exitDeadline: null,
      targetExitFillPolicy: 'maker_preferred',
    });
    expect(eng.closePosition).toHaveBeenCalledTimes(1);
    expect(eng.closePosition.mock.calls[0][4]).toMatchObject({
      targetExitFillPolicy: 'maker_preferred',
      exitRest: { restedAtPrice: 110, outcome: 'convert' },
    });
    expect(h.updateClosedTrade).toHaveBeenCalledTimes(1);
    expect(h.updateClosedTrade.mock.calls[0][2]).toMatchObject({
      targetExitFillPolicy: 'maker_preferred',
      exitRestOutcome: 'convert',
      closeReason: 'target_hit',
    });
  });
});
