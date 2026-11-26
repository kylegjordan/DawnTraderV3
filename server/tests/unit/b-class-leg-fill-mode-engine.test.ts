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
import type { EquityTickRaw } from '../../services/passive-archive/equity-spot-archiver.js';

type Position = Record<string, any>;

const h = vi.hoisted(() => ({
  position: null as Position | null,
  nextExit: null as null | { type: string; price: number; reason: string },
  frame: { bid: 111, ask: 112, last: 111.5 },
  rawFrame: null as EquityTickRaw | null,
  generation: 1,
  nowMonoMs: 20_000,
  mark: null as number | null,
  judgedFrame: null as EquityTickRaw | null,
  spreadGuard: true,
  archiveBid: null as number | null,
  archiveRead: vi.fn(),
  preFillRead: vi.fn(async () => undefined),
  tecCause: null as 'trailing_stop_hit' | 'moonbag_timeout' | null,
  updateActiveOpenPosition: vi.fn(),
  closePaperXstockTrade: vi.fn(),
  deleteActiveOpenPosition: vi.fn(),
  createActiveTradeLog: vi.fn(async () => ({})),
  capture: vi.fn(async (_kind: string, _payload: unknown) => undefined),
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
        if (prop === 'getPaperXstockTrade') return vi.fn(async (key: { id: string }) =>
          key.id === h.position?.metadata?.tradeId ? { ...key, openedAt: new Date(), closedAt: null, metadata: {} } : undefined);
        if (prop === 'closePaperXstockTrade') return h.closePaperXstockTrade;
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
      price: h.mark ?? (h.frame.bid + h.frame.ask) / 2,
      tsMs: now,
      kind: 'mid',
      observed: true,
      raw: h.rawFrame ?? { ...h.frame, bidQty: 10, askQty: 10, atMs: now },
    };
  },
  isCurrentEquityTickerFrame: (frame: { generation: number }) => frame.generation === h.generation,
}));
vi.mock('../../asset_classes/xstock_spot/book-state-tracker.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  assessBookStateNow: () => h.judgedFrame ? {
    ok: true,
    raw: h.judgedFrame,
    cfg: { spreadBlownEnabled: h.spreadGuard, trailingSpreadWindowSnaps: 10, kRel: 3, riAbsSpreadCeilingPct: 1 },
    comparatorValidated: true,
    result: { state: 'two_sided', reasons: [], inputs: {} },
  } : { ok: false, reason: 'disabled' },
  advanceBookStateComparator: vi.fn(),
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
  getDepthSnapshot: async () => {
    h.archiveRead();
    return {
      bids: [{ price: h.archiveBid ?? h.frame.bid, qty: 10 }],
      asks: [{ price: h.archiveBid === null ? h.frame.ask : h.archiveBid + 1, qty: 10 }],
      ageMs: 0,
      source: 'test',
      verdict: { bid: 'ok', ask: 'ok', crossed: false },
    };
  },
  getTickerWitness: async () => ({ bid: h.archiveBid ?? h.frame.bid, ask: h.frame.ask, capturedAtMs: Date.now() }),
}));
vi.mock('../../services/execution/depth-gate-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveFillDepthGateConfig: async () => ({ warmthMaxAgeMs: 15_000, sufficiencyMultiple: 2, minLevels: 1, beyondDepthPenaltyBps: 50 }),
}));
vi.mock('../../services/execution/close-fill-contract-config.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveCloseFillContractConfig: async () => {
    await h.preFillRead();
    return { upTol: 0.01, coldRefusalCap: 3 };
  },
}));
vi.mock('../../services/trailing-exit-controller.js', async (orig) => ({
  ...(await orig<Record<string, unknown>>()),
  resolveTECConfig: () => ({ breakEvenTriggerR: 1, targetLockR: 1.5, trailDistanceAtrMultiplier: 1 }),
  getTrailingState: () => null,
  clearTrailingState: () => undefined,
}));
vi.mock('../../services/tec-evaluator.js', async (original) => {
  const real = await original<typeof import('../../services/tec-evaluator.js')>();
  return {
    ...real,
    evaluateTECExit: async (input: Parameters<typeof real.evaluateTECExit>[0]) => h.tecCause
      ? { shouldExit: true, exitReason: h.tecCause }
      : real.evaluateTECExit(input),
  };
});
vi.mock('../../services/data-aggregator.js', () => ({ dataAggregator: { capture: h.capture } }));
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
    mode: 'paper',
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
    metadata: { tradeId: 'trade-policy' },
  };
}

function makeEngine(offline = false) {
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
    _venuePauseEntriesRefused: 0,
    _coldMarkTicks: 0,
    _coldMarkPending: new Map(),
    _spreadBlownSkipAcc: new Map(),
    _recordPriceSkip: vi.fn(async () => undefined),
    _recordBookStateEvent: vi.fn(async () => undefined),
    _runVenueQuietSweep: vi.fn(async () => undefined),
    _runReserveRowTripwire: vi.fn(async () => undefined),
    _runNoTriggerRailSweep: vi.fn(async () => undefined),
    ...(offline ? {
      xstockExitReplayPolicy: { maxAgeMs: 15_000, refusalLogCap: 60 },
      xstockReplayRefusals: new Map(),
    } : { checkExitConditions: vi.fn(async () => h.nextExit) }),
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
  h.rawFrame = null;
  h.generation = 1;
  h.nowMonoMs = 20_000;
  h.mark = null;
  h.judgedFrame = null;
  h.spreadGuard = true;
  h.archiveBid = null;
  h.tecCause = null;
  h.preFillRead.mockResolvedValue(undefined);
  h.createActiveTradeLog.mockResolvedValue({});
  h.updateActiveOpenPosition.mockImplementation(async (_mode: string, id: string, patch: Record<string, unknown>) => {
    if (h.position?.id === id) Object.assign(h.position, patch);
    return h.position;
  });
  h.closePaperXstockTrade.mockImplementation(async (trade: { id: string }, position: Position, patch: Record<string, unknown>) => {
    if (h.position?.id !== position.id || h.position?.metadata?.tradeId !== trade.id) return { committed: false };
    h.position = null;
    return { committed: true, trade: { ...trade, ...patch } };
  });
  h.deleteActiveOpenPosition.mockImplementation(async (_mode: string, id: string) => {
    if (h.position?.id === id) h.position = null;
  });
  vi.spyOn(console, 'log').mockImplementation(() => {});
  vi.spyOn(console, 'warn').mockImplementation(() => {});
  vi.spyOn(console, 'error').mockImplementation(() => {});
  vi.spyOn(console, 'info').mockImplementation(() => {});
  vi.spyOn(performance, 'now').mockImplementation(() => h.nowMonoMs);
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
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(1);
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({ targetExitFillPolicy: 'maker_only', closeReason: 'stop_hit' });
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
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(1);
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({
      targetExitFillPolicy: 'maker_preferred',
      exitRestOutcome: 'convert',
      closeReason: 'target_hit',
    });
  });
});

function quote(id: number, changes: Partial<EquityTickRaw> = {}): EquityTickRaw {
  return Object.freeze({
    bid: 89, ask: 90, last: 89.5, bidQty: 1, askQty: 5, atMs: Date.now(),
    frame: Object.freeze({
      id, symbol: 'MDB/USD', kind: 'update' as const, generation: 1, receivedMonotonicMs: 19_999,
      numericPrices: true, numericBidQty: true,
    }),
    ...changes,
  });
}

function stopReplay() {
  h.position = makePosition('maker_preferred');
  h.position.exitLimitPrice = null;
  h.mark = 89.5;
  h.archiveBid = 86;
  h.rawFrame = quote(1);
  return makeEngine(true);
}

describe('#961 offline paper xStock quote from the monitor through the real close writer', () => {
  it('books the judged bid and full size once despite a later frame with the same wall-clock time', async () => {
    const eng = stopReplay();
    h.preFillRead.mockImplementationOnce(async () => { h.rawFrame = quote(2, { bid: 85 }); });
    await eng.checkOpenPositions();

    expect(h.archiveRead).not.toHaveBeenCalled();
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(1);
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({
      exitPrice: '89', exitDecisionPrice: '89.5', exitFillDepthAgeMs: null, closeReason: 'stop_hit',
      metadata: {
        exitFillSplit: { branch: 'walk', walkedQty: 1, extrapolatedQty: 0 },
        paperXstockExitFill: {
          cause: 'stop_hit', frame: { id: 1 }, trigger: { basis: 'mark', reason: 'guard_off', price: 89.5 },
          fillBasis: 'raw_bid', filledQty: 1, ageAtFillMs: 1,
        },
      },
    });
    expect(h.capture.mock.calls.filter(([kind]) => kind === 'TRADE_OUTCOME')).toHaveLength(1);
    expect(h.position).toBeNull();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    await eng.checkOpenPositions();
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(1);
  });

  it('keeps the old archive price as a positive control when no offline policy is installed', async () => {
    h.position = makePosition('maker_preferred');
    h.position.exitLimitPrice = null;
    h.nextExit = { type: 'stop_hit', price: 89.5, reason: 'stop' };
    h.archiveBid = 86;
    await makeEngine().checkOpenPositions();
    expect(h.archiveRead).toHaveBeenCalled();
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({ exitPrice: '86' });
    expect(h.closePaperXstockTrade.mock.calls[0][2].metadata).not.toHaveProperty('paperXstockExitFill');
  });

  it('uses the guarded frame that supplied the trigger when the earlier mark frame differs', async () => {
    const eng = stopReplay();
    h.rawFrame = quote(1, { bid: 91, ask: 93 });
    h.mark = 92;
    h.judgedFrame = quote(2);
    await eng.checkOpenPositions();
    expect(h.archiveRead).not.toHaveBeenCalled();
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({
      exitPrice: '89', exitDecisionPrice: '92',
      metadata: { paperXstockExitFill: { frame: { id: 2 }, trigger: { basis: 'bid', price: 89 } } },
    });
  });

  it('keeps the guarded frame for a maker-preferred conversion under spread guard override', async () => {
    h.position = makePosition('maker_preferred');
    h.mark = 110.5;
    h.rawFrame = quote(1, { bid: 111, ask: 112 });
    h.judgedFrame = quote(2, { bid: 109, ask: 112 });
    h.spreadGuard = false;
    await makeEngine(true).checkOpenPositions();
    expect(h.archiveRead).not.toHaveBeenCalled();
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({
      exitPrice: '109', exitRestOutcome: 'convert',
      metadata: { paperXstockExitFill: { frame: { id: 2 }, trigger: { basis: 'mark', reason: 'spread_blown_off' } } },
    });
  });

  it.each([
    ['size_short', { bidQty: 1 - 1e-13 }],
    ['size_unknown', { bidQty: null }],
    ['malformed_book', { bid: 90.25, ask: 90 }],
    ['malformed_book', { bid: 1e-10, ask: 90 }],
    ['malformed_book', { ask: Infinity }],
    ['position_mismatch', { frame: { ...quote(1).frame!, symbol: 'OTHER/USD' } }],
    ['replay', { frame: { ...quote(1).frame!, kind: 'snapshot' } }],
    ['size_unknown', { frame: { ...quote(1).frame!, numericBidQty: false } }],
    ['malformed_book', { frame: { ...quote(1).frame!, numericPrices: false } }],
    ['no_frame', { frame: undefined }],
  ] as const)('leaves the position open on %s with a warm archive available', async (reason, changes) => {
    const eng = stopReplay();
    h.rawFrame = quote(1, changes);
    await eng.checkOpenPositions();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`reason=${reason} `));
    expect(h.archiveRead).not.toHaveBeenCalled();
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.position).not.toBeNull();
  });

  it.each(['stale', 'retired_connection'] as const)('rechecks %s after the awaited fill configuration', async (reason) => {
    const eng = stopReplay();
    h.preFillRead.mockImplementationOnce(async () => {
      if (reason === 'stale') h.nowMonoMs += 15_000;
      else h.generation++;
    });
    await eng.checkOpenPositions();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining(`reason=${reason} `));
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
    expect(h.capture).not.toHaveBeenCalled();
    expect(h.position).not.toBeNull();
  });

  it('holds a failed commit and does not repeat a committed outcome after a log failure', async () => {
    const eng = stopReplay();
    h.closePaperXstockTrade.mockRejectedValueOnce(new Error('test transaction rolled back'));
    await eng.checkOpenPositions();
    expect(h.position).not.toBeNull();
    expect(h.capture).not.toHaveBeenCalled();

    h.rawFrame = quote(2);
    h.createActiveTradeLog.mockRejectedValueOnce(new Error('test close log unavailable'));
    await eng.checkOpenPositions();
    expect(h.position).toBeNull();
    expect(h.capture.mock.calls.filter(([kind]) => kind === 'TRADE_OUTCOME')).toHaveLength(1);
    expect(console.error).toHaveBeenCalledWith(expect.stringContaining('Error checking position MDB/USD:'), expect.any(Error));
    await eng.checkOpenPositions();
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(2);
    expect(h.capture.mock.calls.filter(([kind]) => kind === 'TRADE_OUTCOME')).toHaveLength(1);
    expect(h.deleteActiveOpenPosition).not.toHaveBeenCalled();
  });

  it('keeps elapsed-only max-hold closes on the existing route', async () => {
    const eng = stopReplay();
    h.position!.metadata.maxHoldingMs = 60_000;
    eng.isMaxHoldEnabled = () => true;
    h.mark = 95.5;
    h.rawFrame = quote(1, { bid: 95, ask: 96, bidQty: null });
    await eng.checkOpenPositions();
    expect(h.archiveRead).toHaveBeenCalled();
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({ closeReason: 'max_holding_period', exitPrice: '86' });
    expect(h.closePaperXstockTrade.mock.calls[0][2].metadata).not.toHaveProperty('paperXstockExitFill');
  });

  it.each(['trailing_stop_hit', 'moonbag_timeout'] as const)('grades the actual TEC cause %s before the shared close category', async (cause) => {
    const eng = stopReplay();
    h.tecCause = cause;
    h.rawFrame = quote(1, { bidQty: null });
    await eng.checkOpenPositions();
    if (cause === 'trailing_stop_hit') {
      expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('reason=size_unknown '));
      expect(h.archiveRead).not.toHaveBeenCalled();
      expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
      expect(h.position).not.toBeNull();
    } else {
      expect(h.archiveRead).toHaveBeenCalled();
      expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({ closeReason: 'trailing_stop_hit', exitPrice: '86' });
      expect(h.closePaperXstockTrade.mock.calls[0][2].metadata).not.toHaveProperty('paperXstockExitFill');
    }
  });

  it('reports the 60th refusal once, drops the old trigger and closes only on a later breach', async () => {
    const eng = stopReplay();
    h.rawFrame = quote(1, { bidQty: 0.25 });
    for (let i = 0; i < 61; i++) await eng.checkOpenPositions();
    const holdLogs = vi.mocked(console.warn).mock.calls.filter(([line]) => String(line).includes('RAW_EXIT_HELD'));
    expect(holdLogs).toHaveLength(2);
    expect(holdLogs[1][0]).toContain('attempts=60 ');
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
    h.mark = 95.5;
    h.rawFrame = quote(2, { bid: 95, ask: 96 });
    await eng.checkOpenPositions();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('outcome=trigger_cleared attempts=61 '));
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
    h.mark = 88.5;
    h.rawFrame = quote(3, { bid: 88, ask: 89 });
    await eng.checkOpenPositions();
    expect(h.closePaperXstockTrade).toHaveBeenCalledTimes(1);
    expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({ exitPrice: '88' });
  });

  it('does not carry a refused trigger or hold count into a new engine', async () => {
    const original = stopReplay();
    h.rawFrame = quote(1, { bidQty: 0.25 });
    await original.checkOpenPositions();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('reason=size_short attempts=1 '));

    const restarted = makeEngine(true);
    h.generation++;
    await restarted.checkOpenPositions();
    expect(console.warn).toHaveBeenCalledWith(expect.stringContaining('reason=retired_connection attempts=1 '));
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();

    h.mark = 95.5;
    const recovered = quote(2, { bid: 95, ask: 96 });
    h.rawFrame = { ...recovered, frame: { ...recovered.frame!, generation: h.generation } };
    await restarted.checkOpenPositions();
    expect(console.info).toHaveBeenCalledWith(expect.stringContaining('outcome=trigger_cleared attempts=1 '));
    expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
    expect(h.position).not.toBeNull();
  });

  it.each(['maker_preferred', 'maker_only'] as const)('honors %s on an expired target when the mark alone crossed it', async (policy) => {
    h.position = makePosition(policy);
    h.mark = 110.5;
    h.rawFrame = quote(1, { bid: 109, ask: 112 });
    h.archiveBid = 105;
    await makeEngine(true).checkOpenPositions();
    expect(expiryWrite()).toMatchObject({ exitLimitPrice: null, targetExitFillPolicy: policy });
    expect(h.archiveRead).not.toHaveBeenCalled();
    if (policy === 'maker_only') {
      expect(h.closePaperXstockTrade).not.toHaveBeenCalled();
      expect(h.position).not.toBeNull();
    } else {
      expect(h.closePaperXstockTrade.mock.calls[0][2]).toMatchObject({
        exitPrice: '109', exitRestOutcome: 'convert', closeReason: 'target_hit',
        metadata: { paperXstockExitFill: { cause: 'target_hit', trigger: { basis: 'mark', price: 110.5 } } },
      });
    }
  });
});
