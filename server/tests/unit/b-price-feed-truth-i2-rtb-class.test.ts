/**
 * B-PRICE-FEED-TRUTH increment I2 P2 (#1173) — the RTB refresh subscribes and REST-fetches ONLY its crypto_spot members,
 * taking the class from its per-class buckets (filled from the signal's persisted `asset_class`), while the READ list it
 * passes to `getBatch` stays all-class (Langston Step-2 r2 BLOCKER: xStock members' feed-written rows keep counting
 * toward `validPrices`, so the zero-crypto passes still run `refreshAndRank`).
 * `CAT/USD` is used for the xStock member on purpose: it is a collision ticker (also a Kraken crypto pair), so a class
 * test by symbol would get it wrong.
 * MUTATIONS: subscribe every member (→ 1); pass no / all-class `restEligible` (→ 1); drop xStocks from the read list (→ 2).
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const subscribe = vi.fn();
const getBatch = vi.fn(async (_b: string, _s: string[], _o: any) => new Map<string, any>());
const refreshAndRank = vi.fn(async () => undefined);
let queued: Array<{ symbol: string; strategy: string }> = [];

vi.mock('../../db.js', () => ({ db: { select: () => ({ from: () => ({ where: async () => [] }) }) } }));
vi.mock('../../storage', () => ({ storage: { getRtbSignals: vi.fn(async () => []), getActiveTrades: vi.fn(async () => []) } }));
vi.mock('../../services/price-cache', () => ({
  priceCache: {
    subscribe: (...a: any[]) => (subscribe as any)(...a),
    getBatch: (...a: any[]) => (getBatch as any)(...a),
    countSymbolsWithMessageSince: () => 0,
    countSymbolsWithWsMessageSince: () => 0,
  },
}));
vi.mock('../../core/rtb/ready_to_buy_service', () => ({
  readyToBuyService: {
    getQueuedSignals: vi.fn(async () => queued),
    refreshAndRank: (...a: any[]) => (refreshAndRank as any)(...a),
  },
}));
vi.mock('../../core/calculations/level-basis.js', () => ({ recordSideAgeAttempt: vi.fn() }));
vi.mock('../../core/observability/active-funnel-tracker.js', () => ({ recordActiveRtbRefresh: vi.fn() }));
vi.mock('../../services/central-clock.js', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));
vi.mock('../../services/central-clock', () => ({
  centralClock: { subscribe: vi.fn(), unsubscribe: vi.fn(), start: vi.fn(), getTickNumber: () => 0, getIsRunning: () => false },
  ClockTick: undefined,
}));
vi.mock('../../services/data-aggregator.js', () => ({ dataAggregator: { capture: vi.fn(async () => undefined) } }));
vi.mock('../../services/pool-broadcast', () => ({ poolBus: { on: vi.fn(), emit: vi.fn() } }));

import { rtbRefreshService } from '../../services/rtb-refresh-service';

const svc: any = rtbRefreshService;

beforeEach(() => {
  subscribe.mockClear();
  getBatch.mockClear();
  refreshAndRank.mockClear();
  vi.spyOn(console, 'log').mockImplementation(() => {});
  queued = [
    { symbol: 'BTC/USD', strategy: 'sma_trend_ride' },
    { symbol: 'CAT/USD', strategy: 'vwap_pullback' },
  ];
  for (const per of svc.signalBuckets.values()) per.get(0)?.clear();
  svc.signalBuckets.get('crypto_spot').get(0).add('paper:BTC/USD:sma_trend_ride');
  svc.signalBuckets.get('xstock_spot').get(0).add('paper:CAT/USD:vwap_pullback');
});

describe('I2 P2 — the RTB refresh splits by the class it filed each signal under', () => {
  it('1. only the crypto member is subscribed and REST-eligible', async () => {
    await svc.refreshModeSignals('paper', 0);
    expect(subscribe.mock.calls.map(c => c[0])).toEqual(['BTC/USD']);
    const [, , opts] = getBatch.mock.calls[0];
    expect(Array.from(opts.restEligible)).toEqual(['BTC/USD']);
  });

  it('2. the READ list keeps every member, and a fresh xStock row alone still runs refreshAndRank', async () => {
    getBatch.mockImplementationOnce(async () => new Map([['CAT/USD', { price: 31.5 }]]));
    await svc.refreshModeSignals('paper', 0);
    expect(getBatch.mock.calls[0][1]).toEqual(['BTC/USD', 'CAT/USD']);
    expect(refreshAndRank).toHaveBeenCalledTimes(1);
  });
});
