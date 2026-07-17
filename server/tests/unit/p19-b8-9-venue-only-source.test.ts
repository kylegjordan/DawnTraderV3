/**
 * P19-B8.9 — venue-only AT-SOURCE (the cuts + the class-gate + the peek).
 *
 * Pins: (1) isRestFallbackSource — the ONE shared membership that replaced five
 * drifted inline lists; the unrepresentable members (binance_rest, coingecko) are
 * gone with the fetchers. (2) The xstock REST class-gate: a stale xstock-class
 * symbol NEVER produces an outbound fetch — the adapter answers venue-quiet
 * (last_known_good from held cache, or null when empty-handed). (3) peekCachedPrice
 * is a TTL-free read-only peek (the OBJ-5 display substrate) — never a fetch.
 */
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import {
  livePricingAdapter,
  isRestFallbackSource,
  REST_FALLBACK_SOURCES,
  isPriceVenueQuiet,
  VENUE_QUIET_MS,
} from '../../services/live-pricing-adapter';
import { _replaceXstockUniverse, type XstockSpotEntry } from '../../../shared/asset-classes';
import { UNIVERSE_BOOTSTRAP_SET } from '../../asset_classes/xstock_spot/universe-bootstrap';

// The xstock universe is DB-populated at boot (B79.0n) — empty in unit tests, so a
// plain-form pair like AAPL/USD would resolve crypto_spot and bypass the class-gate.
// Seed the production Layer-4 bootstrap set, the same post-boot state the gate sees
// (the b79-0f collision suite established this fixture pattern).
beforeAll(() => {
  const fixture = new Map<string, XstockSpotEntry>();
  for (const { symbol, entry } of UNIVERSE_BOOTSTRAP_SET) {
    fixture.set(symbol, entry);
  }
  _replaceXstockUniverse(fixture);
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe('P19-B8.9: isRestFallbackSource — one membership, five call sites', () => {
  it('admits exactly the representable REST-fallback display sources', () => {
    expect([...REST_FALLBACK_SOURCES]).toEqual(['rest_fallback', 'kraken_rest', 'last_known_good']);
    for (const s of REST_FALLBACK_SOURCES) {
      expect(isRestFallbackSource(s)).toBe(true);
    }
  });
  it('rejects live-venue and retired third-party tags', () => {
    for (const s of ['kraken_ws', 'kraken_equities_ws', 'binance_rest', 'coingecko', 'binance', 'entry_seed', 'mock', '']) {
      expect(isRestFallbackSource(s)).toBe(false);
    }
  });
});

describe('P19-B8.9 (OBJ-5): isPriceVenueQuiet — ONE notion, both display surfaces (Langston item 2)', () => {
  it('quiet when the source is not a Kraken venue feed, regardless of age', () => {
    for (const s of ['last_known_good', 'entry_seed', 'entry_fallback', 'no_reliable_price', 'mock']) {
      expect(isPriceVenueQuiet(s, 0)).toBe(true);
      expect(isPriceVenueQuiet(s, null)).toBe(true);
    }
  });
  it('quiet when a venue source is older than the threshold; fresh venue is NOT quiet', () => {
    for (const s of ['kraken_ws', 'kraken_equities_ws', 'kraken_rest']) {
      expect(isPriceVenueQuiet(s, VENUE_QUIET_MS + 1)).toBe(true);   // stale venue = quiet
      expect(isPriceVenueQuiet(s, VENUE_QUIET_MS - 1)).toBe(false);  // fresh venue = live
      expect(isPriceVenueQuiet(s, 0)).toBe(false);
      expect(isPriceVenueQuiet(s, null)).toBe(false); // age-unknown fresh venue reads live
    }
  });
});

describe('P19-B8.9 (OBJ-2): xstock class-gate — a quiet venue is answered, never re-asked', () => {
  it('a stale xstock cache entry yields last_known_good with ZERO outbound fetches', async () => {
    vi.useFakeTimers();
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    // Seed via the venue write path (plain pair-universe form — the stored-position shape).
    livePricingAdapter.updateCache('AAPL/USD', 214.25, 'kraken_equities_ws');
    vi.advanceTimersByTime(30_000); // well past the 5s display staleness threshold
    const q = await livePricingAdapter.getPriceWithFallback('AAPL/USD', 5000);
    expect(fetchSpy).not.toHaveBeenCalled(); // the structurally-wasted REST ask is GONE
    expect(q).not.toBeNull();
    expect(q!.price).toBe(214.25);
    expect(q!.source).toBe('last_known_good'); // a memory wearing its honest tag
  });

  it('an unknown xstock symbol with no cache yields null — empty-handed honesty, no fetch', async () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    const q = await livePricingAdapter.getPriceWithFallback('HOOD/USD', 5000);
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(q).toBeNull();
  });
});

describe('P19-B8.9 (OBJ-5): peekCachedPrice — read-only display substrate', () => {
  it('returns the held entry with source + age, and never fetches', () => {
    const fetchSpy = vi.spyOn(globalThis, 'fetch');
    livePricingAdapter.updateCache('TESTPEEK/USD', 42.5, 'kraken_ws');
    const peek = livePricingAdapter.peekCachedPrice('TESTPEEK/USD');
    expect(fetchSpy).not.toHaveBeenCalled();
    expect(peek).not.toBeNull();
    expect(peek!.price).toBe(42.5);
    expect(peek!.source).toBe('kraken_ws');
    expect(peek!.ageMs).toBeGreaterThanOrEqual(0);
  });
  it('returns null for a symbol we hold nothing for', () => {
    expect(livePricingAdapter.peekCachedPrice('NOSUCHPAIR/USD')).toBeNull();
  });
});
