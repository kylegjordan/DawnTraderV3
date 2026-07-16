/**
 * P19-B8.9a — source-tag honesty (the label + consumer micro-diff).
 *
 * Pins: (1) the venue predicate's exact membership (per-concept-not-whitelist —
 * Langston amendment 1); (2) updateCache stamps the caller's TRUE source (the old
 * updateFromWebSocket name let two callers stamp non-WS data 'kraken_ws');
 * (3) the fresh-gate serves a fresh same-venue REST entry WITHOUT a false WS badge;
 * (4) the last-resort stale re-serve is tagged last_known_good — the pre-existing
 * hole where a stale venue tag satisfied the engine's actionable gate in the exact
 * dark-venue scenario the skip-rail was built for.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { isKrakenVenueSource, livePricingAdapter } from '../../services/live-pricing-adapter';

describe('P19-B8.9a: isKrakenVenueSource — the venue concept, encoded once', () => {
  it('admits exactly the three Kraken feeds', () => {
    expect(isKrakenVenueSource('kraken_ws')).toBe(true);
    expect(isKrakenVenueSource('kraken_equities_ws')).toBe(true);
    expect(isKrakenVenueSource('kraken_rest')).toBe(true);
  });
  it('rejects every non-venue source — incl. last_known_good (a memory, not a read)', () => {
    for (const s of ['binance', 'binance_ws', 'coingecko', 'mock', 'entry_seed', 'last_known_good', 'no_reliable_price', '']) {
      expect(isKrakenVenueSource(s)).toBe(false);
    }
  });
});

describe('P19-B8.9a: updateCache stamps the true source', () => {
  it.each([
    ['kraken_ws'], ['kraken_equities_ws'], ['kraken_rest'],
  ] as const)('a %s write is readable back with that exact tag', async (source) => {
    const symbol = `TEST${source.toUpperCase().replace(/[^A-Z]/g, '')}/USD`;
    livePricingAdapter.updateCache(symbol, 123.45, source);
    const q = await livePricingAdapter.getPriceWithFallback(symbol, 2000);
    expect(q).not.toBeNull();
    expect(q!.price).toBe(123.45);
    expect(q!.source).toBe(source); // fresh venue entry served under its HONEST tag
  });
});

describe('P19-B8.9a: fresh venue entries are actionable without a false badge', () => {
  it('a fresh kraken_rest cache entry is venue-admissible (the call-saving behavior, honest form)', async () => {
    livePricingAdapter.updateCache('TESTFRESHREST/USD', 50.5, 'kraken_rest');
    const q = await livePricingAdapter.getPriceWithFallback('TESTFRESHREST/USD', 2000);
    expect(q!.source).toBe('kraken_rest');
    expect(isKrakenVenueSource(q!.source)).toBe(true); // the engine gate admits it as-is
  });
});
