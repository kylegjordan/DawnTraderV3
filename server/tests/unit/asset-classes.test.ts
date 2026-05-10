/**
 * ═════════════════════════════════════════════════════════════════════════════
 * B69 — Asset Class registry + resolver unit tests
 * ═════════════════════════════════════════════════════════════════════════════
 *
 * Covers:
 * - 8-entry registry completeness
 * - getActiveAssetClasses returns 4 (currently active)
 * - isValidAssetClass type guard
 * - resolveAssetClass for each active class:
 *   - REST format (XXBTZUSD, SOLUSD, PF_AAPLXUSD)
 *   - Canonical/slash format (BTC/USD, AAPLx/USD display form)
 *   - Exchange context for xstock_spot (kraken-equities feed sends plain BASE/QUOTE)
 * - Hard-fail on unknown pattern
 * - safeResolveAssetClass returns null + logs warn
 *
 * Reference: BATCH_69_SCOPE.md + BATCH_69_PRE_AUDIT.md
 * ═════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';
import {
  ASSET_CLASSES,
  ASSET_CLASS_REGISTRY,
  resolveAssetClass,
  safeResolveAssetClass,
  getActiveAssetClasses,
  isValidAssetClass,
} from '../../../shared/asset-classes';

describe('B69 asset class registry', () => {
  it('exposes 8 IDs (4 active + 4 reserved-future)', () => {
    expect(Object.keys(ASSET_CLASSES)).toHaveLength(8);
    expect(Object.keys(ASSET_CLASS_REGISTRY)).toHaveLength(8);
  });

  it('every ID has complete metadata', () => {
    for (const id of Object.values(ASSET_CLASSES)) {
      const meta = ASSET_CLASS_REGISTRY[id];
      expect(meta).toBeDefined();
      expect(meta.id).toBe(id);
      expect(meta.displayName.length).toBeGreaterThan(0);
      expect(meta.defaultExchange.length).toBeGreaterThan(0);
      expect(meta.description.length).toBeGreaterThan(0);
      expect(typeof meta.active).toBe('boolean');
    }
  });

  it('getActiveAssetClasses returns exactly 4 entries', () => {
    const active = getActiveAssetClasses();
    expect(active).toHaveLength(4);
    expect(active).toContain('crypto_spot');
    expect(active).toContain('crypto_perp');
    expect(active).toContain('xstock_spot');
    expect(active).toContain('xstock_perp');
  });

  it('reserved-future entries are inactive', () => {
    expect(ASSET_CLASS_REGISTRY.equity_spot.active).toBe(false);
    expect(ASSET_CLASS_REGISTRY.equity_futures.active).toBe(false);
    expect(ASSET_CLASS_REGISTRY.commodity_futures.active).toBe(false);
    expect(ASSET_CLASS_REGISTRY.fx_spot.active).toBe(false);
  });

  it('isValidAssetClass type guard works', () => {
    expect(isValidAssetClass('crypto_spot')).toBe(true);
    expect(isValidAssetClass('xstock_perp')).toBe(true);
    expect(isValidAssetClass('not_a_class')).toBe(false);
    expect(isValidAssetClass('')).toBe(false);
  });

  it('archive table mappings align with B74 + B79.0e rename', () => {
    expect(ASSET_CLASS_REGISTRY.crypto_spot.archiveOhlcTable).toBe('crypto_spot_ohlc_1m');
    expect(ASSET_CLASS_REGISTRY.xstock_spot.archiveOhlcTable).toBe('xstock_spot_ohlc_1m');
    expect(ASSET_CLASS_REGISTRY.xstock_perp.archiveOhlcTable).toBe('xstock_perp_ohlc_1m');
  });
});

describe('B69 resolveAssetClass — crypto_spot (kraken exchange)', () => {
  it('resolves canonical BTC/USD', () => {
    expect(resolveAssetClass('BTC/USD', 'kraken')).toBe('crypto_spot');
  });

  it('resolves canonical ETH/EUR', () => {
    expect(resolveAssetClass('ETH/EUR', 'kraken')).toBe('crypto_spot');
  });

  it('resolves Kraken REST raw XXBTZUSD', () => {
    expect(resolveAssetClass('XXBTZUSD', 'kraken')).toBe('crypto_spot');
  });

  it('resolves Kraken REST raw XETHZEUR', () => {
    expect(resolveAssetClass('XETHZEUR', 'kraken')).toBe('crypto_spot');
  });

  it('resolves newer Kraken REST raw SOLUSD', () => {
    expect(resolveAssetClass('SOLUSD', 'kraken')).toBe('crypto_spot');
  });

  it('resolves canonical with USDT quote', () => {
    expect(resolveAssetClass('SOL/USDT', 'kraken')).toBe('crypto_spot');
  });
});

describe('B69 resolveAssetClass — xstock_spot', () => {
  it('resolves plain AAPL/USD via kraken-equities exchange (WS feed format)', () => {
    // The ws-equities.kraken.com feed sends plain BASE/QUOTE without the `x` suffix.
    // Distinguished from crypto entirely by the exchange context.
    expect(resolveAssetClass('AAPL/USD', 'kraken-equities')).toBe('xstock_spot');
  });

  it('resolves plain TSLA/USD via kraken-equities exchange', () => {
    expect(resolveAssetClass('TSLA/USD', 'kraken-equities')).toBe('xstock_spot');
  });

  it('resolves any symbol via kraken-equities exchange (exchange wins)', () => {
    expect(resolveAssetClass('GOOGL/USD', 'kraken-equities')).toBe('xstock_spot');
    expect(resolveAssetClass('XYZ/USD', 'kraken-equities')).toBe('xstock_spot');
  });

  it('resolves Kraken Pro display form AAPLx/USD via kraken exchange', () => {
    // Optional path: when the caller has the display form (rare; mostly internal).
    expect(resolveAssetClass('AAPLx/USD', 'kraken')).toBe('xstock_spot');
  });
});

describe('B69 resolveAssetClass — crypto_perp (kraken-futures, non-PF_*XUSD)', () => {
  it('returns crypto_perp for native crypto perp symbol PI_XBTUSD', () => {
    // Native crypto perps on Kraken Futures use PI_/FI_ prefixes (or other
    // non-PF_*X patterns). The resolver assigns them crypto_perp by default.
    expect(resolveAssetClass('PI_XBTUSD', 'kraken-futures')).toBe('crypto_perp');
  });

  it('returns crypto_perp for PF_XBTUSD (no X marker before quote)', () => {
    // PF_XBTUSD does NOT match the xstock_perp pattern (no X separator before
    // USD), so it falls through to crypto_perp.
    expect(resolveAssetClass('PF_XBTUSD', 'kraken-futures')).toBe('crypto_perp');
  });
});

describe('B69 resolveAssetClass — xstock_perp', () => {
  it('resolves PF_AAPLXUSD', () => {
    expect(resolveAssetClass('PF_AAPLXUSD', 'kraken-futures')).toBe('xstock_perp');
  });

  it('resolves PF_TSLAXUSD', () => {
    expect(resolveAssetClass('PF_TSLAXUSD', 'kraken-futures')).toBe('xstock_perp');
  });

  it('resolves PF_GOOGLXUSD', () => {
    expect(resolveAssetClass('PF_GOOGLXUSD', 'kraken-futures')).toBe('xstock_perp');
  });

  it('resolves PF_AAPLXEUR', () => {
    expect(resolveAssetClass('PF_AAPLXEUR', 'kraken-futures')).toBe('xstock_perp');
  });
});

describe('B69 resolveAssetClass — error paths', () => {
  it('throws on empty symbol', () => {
    expect(() => resolveAssetClass('', 'kraken')).toThrow(/empty symbol/);
  });

  it('throws on unknown exchange', () => {
    expect(() => resolveAssetClass('BTC/USD', 'binance')).toThrow(/unknown exchange/);
  });

  it('throws on garbled kraken spot symbol', () => {
    expect(() => resolveAssetClass('!!notvalid!!', 'kraken')).toThrow(/did not match/);
  });
});

describe('B69 safeResolveAssetClass', () => {
  it('returns valid class on success', () => {
    expect(safeResolveAssetClass('BTC/USD', 'kraken')).toBe('crypto_spot');
    expect(safeResolveAssetClass('AAPL/USD', 'kraken-equities')).toBe('xstock_spot');
    expect(safeResolveAssetClass('PF_AAPLXUSD', 'kraken-futures')).toBe('xstock_perp');
    expect(safeResolveAssetClass('PI_XBTUSD', 'kraken-futures')).toBe('crypto_perp');
  });

  it('returns null on garbled symbol + logs warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = safeResolveAssetClass('!!nonsense!!', 'kraken');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    expect(warnSpy.mock.calls[0][0]).toMatch(/\[B69\]/);
    warnSpy.mockRestore();
  });

  it('returns null on unknown exchange + logs warn', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = safeResolveAssetClass('BTC/USD', 'binance');
    expect(result).toBeNull();
    expect(warnSpy).toHaveBeenCalledOnce();
    warnSpy.mockRestore();
  });

  it('returns null on empty symbol', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
    const result = safeResolveAssetClass('', 'kraken');
    expect(result).toBeNull();
    warnSpy.mockRestore();
  });
});
