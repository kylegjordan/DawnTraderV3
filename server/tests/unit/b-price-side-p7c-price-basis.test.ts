// B-PRICE-SIDE-BY-JOB r5 — P-7c (decision D3): every recorded price producer maps to exactly one declared basis,
// and nothing that was not observed from the venue is ever labelled as a live basis.
//
// Totality is enforced by the COMPILER (`Record<PriceProducer, …>`): a new producer without a basis fails tsc.
// These tests pin the CONTENT of the mapping — the part a compiler cannot check — and carry their own positive
// control: the guard is run against a deliberately corrupted copy and must reject it.
import { describe, it, expect } from 'vitest';
import {
  BASIS_BY_PRODUCER,
  basisOfProducer,
  isLiveObservationBasis,
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

  it('5. every mapped value is a declared basis, and the live/not-live split is consistent', () => {
    const declared = new Set(['book_top', 'book_depth', 'ticker_bbo', 'ticker_default', 'rest_ticker', 'archive_ticker_snap', 'venue_close', 'not_an_observation']);
    for (const [p, b] of Object.entries(BASIS_BY_PRODUCER)) {
      expect(declared.has(b), `${p} -> ${b}`).toBe(true);
      expect(isLiveObservationBasis(b)).toBe(b !== 'not_an_observation');
    }
  });

  it('6. the map is frozen — no caller can relabel a producer at runtime', () => {
    expect(Object.isFrozen(BASIS_BY_PRODUCER)).toBe(true);
  });
});
