// B-PRICE-SIDE-BY-JOB r5 — P-7c (decision D3): every recorded price producer maps to exactly one declared basis,
// and nothing that was not observed from the venue is ever labelled as a live basis.
//
// Totality is enforced by the COMPILER (`Record<PriceProducer, …>`): a new producer without a basis fails tsc.
// These tests pin the CONTENT of the mapping — the part a compiler cannot check — and carry their own positive
// control: the guard is run against a deliberately corrupted copy and must reject it.
// STEP 4 r2 (Langston, chunk 1 (a)): `isLiveObservationBasis` returned true for `venue_close`, against the module's own
// definition. It is replaced by `isLiveTouchBasis` over a total, explicit table; tests 5 and 7 fail against r1.
import { describe, it, expect } from 'vitest';
import {
  BASIS_BY_PRODUCER,
  LIVE_TOUCH_BY_BASIS,
  basisOfProducer,
  isLiveTouchBasis,
  type PriceBasisOrNone,
} from '../../services/market-data/price-basis.js';

// Producers that do NOT observe the venue at use time. Named here, independently of the module, so a mapping
// that quietly turns one of them into a live basis is caught.
const NOT_OBSERVED = [
  'kraken_rest_rate_limited_reserve',
  'xstock_rest_gate_reserve',
  'last_known_good_all_apis_failed',
  'last_known_good_fetch_exception',
  'last_known_good_reserve',
  'entry_seed',
  'mock',
  'position_entry_price_reused',
  'no_price_produced',
];

// The live-touch answer for every basis, written out independently of the module.
const LIVE_TOUCH_EXPECTED: Record<string, boolean> = {
  book_top: true,
  ticker_bbo: true,
  ticker_default: true,
  rest_ticker: true,
  book_depth: false,
  archive_ticker_snap: false,
  venue_close: false,
  not_an_observation: false,
};

function assertReservesAreNotObservations(map: Record<string, PriceBasisOrNone>): void {
  for (const p of NOT_OBSERVED) {
    if (!(p in map)) throw new Error(`producer ${p} missing from the basis map`);
    if (map[p] !== 'not_an_observation') throw new Error(`producer ${p} is labelled as a live basis: ${map[p]}`);
  }
}

describe('P-7c — price basis derived from the recorded producer', () => {
  it('1. no re-serve, seed, mock, reuse or null producer is labelled as a live basis', () => {
    expect(() => assertReservesAreNotObservations(BASIS_BY_PRODUCER as Record<string, PriceBasisOrNone>)).not.toThrow();
  });

  it('2. POSITIVE CONTROL — the guard rejects a corrupted map (a re-serve relabelled as a REST read)', () => {
    const corrupted = { ...(BASIS_BY_PRODUCER as Record<string, PriceBasisOrNone>), kraken_rest_rate_limited_reserve: 'rest_ticker' as const };
    expect(() => assertReservesAreNotObservations(corrupted)).toThrow(/labelled as a live basis/);
  });

  it('3. the order-book top, the ticker legs and the REST legs carry their own sources', () => {
    expect(basisOfProducer('kraken_ws_book_mid')).toBe('book_top');
    expect(basisOfProducer('kraken_ws_ticker_mid')).toBe('ticker_bbo');
    expect(basisOfProducer('kraken_equities_ws_mid')).toBe('ticker_default');
    expect(basisOfProducer('kraken_rest_poller')).toBe('rest_ticker');
    expect(basisOfProducer('kraken_rest_engine_fallback_mid')).toBe('rest_ticker');
  });

  it('4. fill-estimate walks are depth sources, never a touch price', () => {
    expect(basisOfProducer('crypto_ws_book_walk')).toBe('book_depth');
    expect(basisOfProducer('xstock_ticker_snap_walk')).toBe('archive_ticker_snap');
    expect(basisOfProducer('crypto_ws_book_walk')).not.toBe('book_top');
  });

  it('5. every mapped value is a declared basis, and the live-touch answer is explicit for every basis', () => {
    expect(Object.keys(LIVE_TOUCH_BY_BASIS).sort()).toEqual(Object.keys(LIVE_TOUCH_EXPECTED).sort());
    for (const [basis, live] of Object.entries(LIVE_TOUCH_EXPECTED)) {
      expect(isLiveTouchBasis(basis as PriceBasisOrNone), basis).toBe(live);
    }
    for (const [p, b] of Object.entries(BASIS_BY_PRODUCER)) {
      expect(b in LIVE_TOUCH_EXPECTED, `${p} -> ${b}`).toBe(true);
    }
  });

  it('6. the maps are frozen — no caller can relabel a producer or a basis at runtime', () => {
    expect(Object.isFrozen(BASIS_BY_PRODUCER)).toBe(true);
    expect(Object.isFrozen(LIVE_TOUCH_BY_BASIS)).toBe(true);
  });

  it('7. ★ Langston chunk 1 (a): a bar close is printed, not fresh — venue_close is NOT a live touch basis', () => {
    expect(isLiveTouchBasis('venue_close')).toBe(false);
  });
});
