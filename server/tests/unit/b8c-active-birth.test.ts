import { beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  sideBook: vi.fn(),
  ticker: vi.fn(),
  knobs: vi.fn(),
  grid: vi.fn(),
  rebase: vi.fn(),
}));

vi.mock('../../exchanges/kraken/kraken-websocket-adapter.js', async original => {
  const actual = await original<typeof import('../../exchanges/kraken/kraken-websocket-adapter.js')>();
  return {
    ...actual,
    krakenWebSocketAdapter: new Proxy(actual.krakenWebSocketAdapter, {
      get(target, key) {
        if (key === 'getBookForFill') return h.sideBook;
        if (key === 'isBookTrusted') return () => true;
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});
vi.mock('../../services/price-cache.js', async original => {
  const actual = await original<typeof import('../../services/price-cache.js')>();
  return {
    ...actual,
    priceCache: new Proxy(actual.priceCache, {
      get(target, key) {
        if (key === 'getCachedPrice') return h.ticker;
        const value = Reflect.get(target, key);
        return typeof value === 'function' ? value.bind(target) : value;
      },
    }),
  };
});
vi.mock('../../core/trading/level-build-config.js', async original => ({
  ...await original<typeof import('../../core/trading/level-build-config.js')>(),
  readCryptoLevelBuildKnobs: h.knobs,
}));
vi.mock('../../core/trading/crypto-birth-levels.js', async original => {
  const actual = await original<typeof import('../../core/trading/crypto-birth-levels.js')>();
  return { ...actual, baseCryptoLevelsAtBirth: h.rebase.mockImplementation(actual.baseCryptoLevelsAtBirth) };
});
vi.mock('../../markets/venue-grid-resolver.js', async original => ({
  ...await original<typeof import('../../markets/venue-grid-resolver.js')>(),
  resolveVenueGrid: () => ({ tick: 0.01 }),
}));
vi.mock('../../core/calculations/venue-price-grid.js', async original => ({
  ...await original<typeof import('../../core/calculations/venue-price-grid.js')>(),
  roundTripleToGrid: h.grid,
}));

import { SignalOrchestrator } from '../../services/signal-orchestrator.js';

const gridBoundary = new Error('venue grid reached');
const run = (metadata: object) => {
  const orchestrator = Object.create(SignalOrchestrator.prototype);
  return orchestrator.buildSizedSignalForStrategy(
    { symbol: 'BTC/USD', entryPrice: 100, stopPrice: 98, targetPrice: 104, metadata },
    'vwap_pullback',
    { mode: 'paper', assetClass: 'crypto_spot' },
  );
};

describe('8c OFF removal — signal orchestrator production birth seam', () => {
  const spec = { stop: { form: 'distance' }, target: { form: 'distance' } };
  beforeEach(() => {
    vi.clearAllMocks();
    h.knobs.mockReturnValue({ maxAgeMs: 60_000, maxSpreadFraction: 0.5, driftRef60s: 0.00429 });
    h.sideBook.mockImplementation(() => ({
      bids: [{ price: 99.9 }], asks: [{ price: 100.1 }], ageMs: 5_000, updatedAtMs: Date.now() - 5_000,
    }));
    h.grid.mockImplementation(() => { throw gridBoundary; });
  });

  it.each([undefined, 'mid'])('sends the sided triple to the grid when the prior stamp is %s', async levelGeometry => {
    await expect(run({ levelSpec: spec, levelGeometry })).rejects.toBe(gridBoundary);
    expect(h.rebase).toHaveBeenCalledTimes(1);
    expect(h.grid.mock.calls[0].slice(0, 3)).toEqual([100.1, expect.closeTo(97.9, 10), expect.closeTo(103.9, 10)]);
    expect(h.rebase.mock.results[0].value).toMatchObject({
      ok: true, entryPriceMaker: 99.9,
      stamp: { levelGeometry: 'sided', levelBasisAtBirth: { bid: 99.9, ask: 100.1, producer: 'kraken_ws_book' } },
    });
  });

  it('refuses before the grid when neither side source has a quote', async () => {
    h.sideBook.mockReturnValue(undefined);
    await expect(run({ levelSpec: spec })).resolves.toBeNull();
    expect(h.rebase.mock.results[0].value).toEqual({ ok: false, reason: 'no_transactable_basis' });
    expect(h.grid).not.toHaveBeenCalled();
  });
});
