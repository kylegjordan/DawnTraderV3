/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0f — Asset-class resolver collision regression-locks
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Surfaced 2026-05-10 by Kyle: SUI/USD crypto trade was displaying as
 * xStock Spot in the Machine Learning UI. Root cause: 9 USD-quote ticker
 * collisions between Kraken's xStocks universe and Kraken's crypto-spot
 * universe (e.g. Sun Communities `SUI` equity vs Sui Network `SUI` crypto).
 *
 * Resolver semantics (Langston Q1 lock):
 *   - exchange='kraken-equities'                  → xstock_spot (always, no ambiguity)
 *   - exchange='kraken' + 'BASEx/QUOTE'  display  → xstock_spot (display-form survives)
 *   - exchange='kraken' + collision set (no x)    → crypto_spot (B79.0f gate; WARN logged)
 *   - exchange='kraken' + non-collision xStock    → xstock_spot (membership-set fallback)
 *   - exchange='kraken' + plain crypto canonical  → crypto_spot
 *
 * Provenance: 2026-05-10 live Kraken `/0/public/AssetPairs` query intersected
 * with XSTOCK_SPOT_SYMBOLS bases.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import {
  resolveAssetClass,
  XSTOCK_SPOT_KRAKEN_COLLISIONS,
  XSTOCK_SPOT_SYMBOLS,
  ASSET_CLASSES,
} from '../../../shared/asset-classes';

const USD_COLLISIONS = ['BDX/USD','CVX/USD','DASH/USD','EDU/USD','MET/USD','OPEN/USD','PEP/USD','SUI/USD','T/USD'];
const EUR_COLLISIONS = ['CVX/EUR','DASH/EUR','EDU/EUR','MET/EUR','OPEN/EUR','PEP/EUR','SUI/EUR','T/EUR'];

describe('B79.0f — XSTOCK_SPOT_KRAKEN_COLLISIONS membership', () => {
  it('contains exactly 17 entries (9 USD + 8 EUR pre-emptive)', () => {
    expect(XSTOCK_SPOT_KRAKEN_COLLISIONS.size).toBe(17);
  });

  it('contains all 9 documented USD-quote collisions', () => {
    for (const sym of USD_COLLISIONS) {
      expect(XSTOCK_SPOT_KRAKEN_COLLISIONS.has(sym)).toBe(true);
    }
  });

  it('contains all 8 documented EUR-quote collisions (regression-lock for /EUR extension)', () => {
    for (const sym of EUR_COLLISIONS) {
      expect(XSTOCK_SPOT_KRAKEN_COLLISIONS.has(sym)).toBe(true);
    }
  });

  it('every USD-quote collision is currently in XSTOCK_SPOT_SYMBOLS (xStock catalog parity)', () => {
    for (const sym of USD_COLLISIONS) {
      expect(XSTOCK_SPOT_SYMBOLS.has(sym)).toBe(true);
    }
  });
});

describe('B79.0f — collision tickers on `kraken` resolve to crypto_spot (the bug fix)', () => {
  let warnSpy: ReturnType<typeof vi.spyOn>;
  beforeEach(() => {
    warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
  });

  for (const sym of USD_COLLISIONS) {
    it(`${sym} on exchange=kraken → crypto_spot (NOT xstock_spot)`, () => {
      const result = resolveAssetClass(sym, 'kraken');
      expect(result).toBe(ASSET_CLASSES.CRYPTO_SPOT);
      expect(warnSpy).toHaveBeenCalledWith(
        expect.stringContaining('[B79.0f][COLLISION_RESOLVE]'),
      );
    });
  }

  for (const sym of EUR_COLLISIONS) {
    it(`${sym} on exchange=kraken → crypto_spot (regression-lock for /EUR)`, () => {
      const result = resolveAssetClass(sym, 'kraken');
      expect(result).toBe(ASSET_CLASSES.CRYPTO_SPOT);
    });
  }
});

describe('B79.0f — disambiguating x-suffix forms still resolve to xstock_spot', () => {
  it('SUIx/USD on exchange=kraken → xstock_spot (display form preserved)', () => {
    expect(resolveAssetClass('SUIx/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });

  it('PEPx/USD on exchange=kraken → xstock_spot', () => {
    expect(resolveAssetClass('PEPx/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });

  it('SUI/USD on exchange=kraken-equities → xstock_spot (exchange-driven, no ambiguity)', () => {
    expect(resolveAssetClass('SUI/USD', 'kraken-equities')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });
});

describe('B79.0f — non-collision xStock tickers preserved by membership fast-path', () => {
  it('AAPL/USD on exchange=kraken → xstock_spot (no crypto counterpart on Kraken)', () => {
    expect(resolveAssetClass('AAPL/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });

  it('TSLA/USD on exchange=kraken → xstock_spot', () => {
    expect(resolveAssetClass('TSLA/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });

  it('NVDA/USD on exchange=kraken → xstock_spot', () => {
    expect(resolveAssetClass('NVDA/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });

  it('GLD/USD on exchange=kraken → xstock_spot', () => {
    expect(resolveAssetClass('GLD/USD', 'kraken')).toBe(ASSET_CLASSES.XSTOCK_SPOT);
  });
});

describe('B79.0f — pure crypto pairs unaffected', () => {
  it('BTC/USD on exchange=kraken → crypto_spot', () => {
    expect(resolveAssetClass('BTC/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });

  it('ETH/USD on exchange=kraken → crypto_spot', () => {
    expect(resolveAssetClass('ETH/USD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });

  it('SOLUSD raw form on exchange=kraken → crypto_spot', () => {
    expect(resolveAssetClass('SOLUSD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });

  it('XXBTZUSD raw form on exchange=kraken → crypto_spot', () => {
    expect(resolveAssetClass('XXBTZUSD', 'kraken')).toBe(ASSET_CLASSES.CRYPTO_SPOT);
  });
});
