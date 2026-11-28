import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { judgeDispatchTick } from '../../asset_classes/xstock_spot/active-dispatch.js';
import { evaluateXstockPairForVTS, makeEmptyXstockCycleCounters } from '../../asset_classes/xstock_spot/eval-cycle.js';
import { selectVtsXstockEntryAsk } from '../../asset_classes/xstock_spot/vts-xs-select.js';
import type { XsQuoteRow } from '../../asset_classes/xstock_spot/vts-xs-instrument.js';

const outputs = vi.hoisted(() => ({
  archive: vi.fn(),
  book: vi.fn(),
  dispatch: vi.fn(),
  activeTick: vi.fn(),
  orchestrator: vi.fn(),
  detect: vi.fn(),
}));

vi.mock('../../db.js', () => ({ db: {} }));
vi.mock('../../asset_classes/xstock_spot/market-hours.js', () => ({ isXstockMarketOpenUTC: () => true }));
vi.mock('../../asset_classes/xstock_spot/global-filter.js', () => ({
  evaluateXstockGlobalFilter: () => ({ passed: false, counters: {} }),
}));
vi.mock('../../asset_classes/xstock_spot/pattern-filter.js', () => ({
  evaluateXstockPatternFilter: () => ({
    passed: true, counters: {}, perMetric: { failedLQ: 0, failedVN: 0, failedDI: 0, passed: 1, total: 1 },
  }),
}));
vi.mock('../../services/pattern-recognizer.js', () => ({ scanPatterns: () => [] }));
vi.mock('../../config/canonical-regime-strategy-map.js', () => ({
  getStrategiesForRegime: () => [{ strategyKey: 'morning_star', signalType: 'pattern' }],
  isStrategyEnabledForAssetClass: () => true,
  normalizePatternToCanonical: (pattern: string) => pattern,
  normalizeStrategy: (strategy: string) => strategy,
  STRATEGY_FAMILY_MAP: { morning_star: 'pattern' },
  STRATEGY_DISPLAY_NAMES: { morning_star: 'Morning Star' },
}));
vi.mock('../../services/market-context-engine.js', () => ({
  getMarketContextEngine: () => ({
    computeContext: () => ({ regime: { regime: 'TREND_FRIENDLY_STABLE' }, indicators: { atr: 1 } }),
    getCurrentMacroContext: () => undefined,
    getPairCorrelationConfigForClass: () => null,
  }),
}));
vi.mock('../../services/market-indicators.js', () => ({
  getCurrentRegime: () => null,
  getGlobalFriction: () => null,
  getLastGlobalDBSCategory: () => null,
  getLastGlobalDBSScore: () => null,
}));
vi.mock('../../asset_classes/xstock_spot/macro-snapshot.js', () => ({ buildMacroSnapshot: () => ({}) }));
vi.mock('../../core/utils/vts-real-score.js', () => ({ computeRealHybridScore: () => 0.8, computeRealDecayPenalty: () => 1 }));
vi.mock('../../core/utils/score-calculator.js', () => ({ getPredictiveConfidence: () => 0.8 }));
vi.mock('../../core/metrics/market-regime.js', () => ({ calculateRegimeScore: () => 80 }));
vi.mock('../../core/calculations/expectancy.js', () => ({ getPerClassTargetGate: () => ({ minRR: 2, reachAtrMax: 8 }) }));
vi.mock('../../markets/venue-grid-resolver.js', () => ({ resolveVenueGrid: () => ({ tick: 0.01 }) }));
vi.mock('../../core/math/cost-model.js', () => ({
  getCachedCostMetrics: () => ({ fee: 0.001, spread: 0.001, slippage: 0.001 }),
  getFrictionForAssetClass: () => ({ feeRateMaker: 0.001, feeRateTaker: 0.002 }),
}));
vi.mock('../../core/math/maker-taker-decision.js', () => ({
  decideMakerTaker: () => ({ takerNetEV: 0.4, makerNetEVAdjusted: 0.3, taker: { pWin: 0.65 } }),
  applyMakerTakerFillPolicy: () => ({ admitted: true, chosenMode: 'taker', chosenNetEV: 0.4 }),
  entryUrgencyClassForFamily: () => 'medium',
}));
vi.mock('../../services/maker-taker-config.js', () => ({
  resolveFillPolicy: () => 'maker_preferred',
  resolveMakerTakerHaircut: () => 0,
}));
vi.mock('../../services/module-constants-service.js', () => ({
  getCachedNumberRequired: (_module: string, key: string) => key === 'entry_window_worse_side_frac' ? 0.25 : 0.5,
}));
vi.mock('../../asset_classes/xstock_spot/mark-staleness-config.js', () => ({
  readXstockMarkStalenessConfig: () => ({ floorMs: 1_000, capMs: 1_000 }),
  readXstockSigmaCacheConfig: () => ({}),
}));
vi.mock('../../asset_classes/xstock_spot/sigma-rate-cache.js', () => ({ getCachedSigma: () => null }));
vi.mock('../../services/vts-runner.js', () => ({
  callStrategyDetect: outputs.detect,
  registerOpenVtsTrade: outputs.book,
  maybeOpenTwin: async () => undefined,
  isIdenticalXstockSetupSuppressed: () => false,
  computeFinalScore: () => 0.8,
  checkPreOpenGates: () => ({ allowed: true }),
  VTS_NET_EV_FLOOR: 0,
}));
vi.mock('../../services/data-archive/signal-eval-archiver.js', () => ({
  archiveSignalEval: outputs.archive,
  buildBarProvenance: () => ({}),
}));
vi.mock('../../asset_classes/xstock_spot/active-dispatch.js', async (importOriginal) => {
  const dispatchModule = await importOriginal<typeof import('../../asset_classes/xstock_spot/active-dispatch.js')>();
  outputs.dispatch.mockImplementation(dispatchModule.dispatchXstockActiveSignal);
  return { ...dispatchModule, dispatchXstockActiveSignal: outputs.dispatch };
});
vi.mock('../../services/active-engine-service.js', () => ({
  getOrchestratorByMode: () => ({ dispatchExternalSignal: outputs.orchestrator }),
}));
vi.mock('../../storage.js', () => ({
  storage: {
    getSystemContext: async () => ({ isEngineActive: true, activeAssetClasses: { xstock_spot: true } }),
    getGuardrailsV2: async () => null,
  },
}));
vi.mock('../../services/guardrail-settings.js', () => ({
  getMoneyHeld: async () => 1_000,
  MoneyHeldUnavailable: Error,
}));
vi.mock('../../services/passive-archive/equity-spot-archiver.js', () => ({ getLatestEquityTick: outputs.activeTick }));
vi.mock('../../services/system-alerts.js', () => ({ addAlert: async () => undefined }));
vi.mock('../../asset_classes/xstock_spot/fill-safety-config.js', () => ({
  resolveXstockFillSafetyConfig: async () => ({ activeFillMaxAgeMs: 1_000 }),
}));

const decisionMs = Date.parse('2026-01-05T15:00:00Z');
const bars = [{ open: 99.75, high: 100.5, low: 99.5, close: 100, timestamp: decisionMs - 60_000, volume: 100 }];
const structure = { stop: { form: 'anchor' }, target: { form: 'anchor' } };
const freshAsk: XsQuoteRow = { bid: 99.99, ask: 100.05, last: 100, atMs: decisionMs - 100, bidQty: 20, askQty: 20 };
const activeDecisionMs = decisionMs + 25;
const laterActiveTick = { price: 100.15, tsMs: activeDecisionMs - 5, kind: 'mid' as const, observed: true };

async function evaluate(quote: XsQuoteRow | null) {
  const counters = makeEmptyXstockCycleCounters();
  await evaluateXstockPairForVTS('AAPL/USD', bars, 100, 1_000_000, 'paper', counters, undefined, -1, undefined, -1, -1, quote);
  expect(counters.errors).toBe(0);
  expect(outputs.detect).toHaveBeenCalledTimes(1);
  return counters;
}

describe('Plan Price Basis offline xStock VTS booking before active dispatch', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(decisionMs);
    outputs.detect.mockReturnValue({ entryPrice: 100, stopPrice: 98, targetPrice: 106, metadata: { levelSpec: structure } });
    outputs.book.mockImplementation(async () => {
      vi.setSystemTime(activeDecisionMs);
      return 'synthetic-vts-position';
    });
    outputs.activeTick.mockReturnValue(laterActiveTick);
  });

  afterEach(() => vi.useRealTimers());

  it.each([
    { condition: 'no ask', quote: { ...freshAsk, ask: null }, guard: 'side_unusable' },
    { condition: 'old ask', quote: { ...freshAsk, atMs: decisionMs - 1_001 }, guard: 'too_old' },
  ])('stops the taker before booking or dispatch for $condition', async ({ quote, guard }) => {
    expect(selectVtsXstockEntryAsk('AAPL/USD', quote, 98, decisionMs).reason).toBe(guard);
    expect(judgeDispatchTick(laterActiveTick, activeDecisionMs, 1_000)).toEqual({ arm: 'ok', ageMs: 5 });
    const counters = await evaluate(quote);
    expect(counters.nullReasonAggregate.taker_no_entry_ask).toBe(1);
    expect(outputs.archive).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      mode: 'vts', gateDecision: { gate: 'entry_ask', accepted: false, reason: 'taker_no_entry_ask' },
    }));
    expect(outputs.book).not.toHaveBeenCalled();
    expect(outputs.dispatch).not.toHaveBeenCalled();
    expect(outputs.activeTick).not.toHaveBeenCalled();
    expect(outputs.orchestrator).not.toHaveBeenCalled();
  });

  it.each([100.05, 100.10])('books the eligible ask %f and dispatches the original anchored plan', async (ask) => {
    const counters = await evaluate({ ...freshAsk, ask });
    expect(counters.tradesOpened).toBe(1);
    expect(outputs.book).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      chosenEntryMode: 'taker', entryPrice: ask, stopLoss: 98, takeProfit: 106,
    }));
    expect(outputs.dispatch).toHaveBeenCalledExactlyOnceWith(expect.objectContaining({
      entryPrice: 100, stopPrice: 98, targetPrice: 106, levelSpec: structure,
    }));
    expect(outputs.book).toHaveBeenCalledBefore(outputs.dispatch);
    await outputs.dispatch.mock.results[0].value;
    expect(outputs.activeTick).toHaveBeenCalledExactlyOnceWith('AAPL/USD');
    expect(outputs.orchestrator).toHaveBeenCalledExactlyOnceWith(
      expect.objectContaining({
        entryPrice: 100,
        stopPrice: 98,
        targetPrice: 106,
        metadata: expect.objectContaining({ levelSpec: structure, birthFreshness: { ageMs: 5, ceilingMs: 1_000, source: 'equity_tick_memory' } }),
      }),
      'morning_star',
      expect.objectContaining({ mode: 'paper', assetClass: 'xstock_spot' }),
      expect.objectContaining({ atr: 1 }),
    );
  });

  it('dispatches a price-eligible plan when VTS registration returns no trade ID', async () => {
    outputs.book.mockImplementationOnce(async () => {
      vi.setSystemTime(activeDecisionMs);
      return null;
    });

    const counters = await evaluate(freshAsk);
    expect(outputs.book).toHaveBeenCalledTimes(1);
    expect(counters.tradesOpened).toBe(0);
    expect(outputs.dispatch).toHaveBeenCalledTimes(1);
    await outputs.dispatch.mock.results[0].value;
    expect(outputs.orchestrator).toHaveBeenCalledTimes(1);
  });
});
