/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0b — N4 boundary tests for `safeResolveAssetClass`
 * ════════════════════════════════════════════════════════════════════════════
 *
 * Per Langston cc-inbox #890 B.2: a single bad symbol must not crash PM2.
 * `safeResolveAssetClass` wraps `resolveAssetClass` and returns null on
 * unknown patterns instead of throwing.
 *
 * `asset-classes.test.ts` covers `resolveAssetClass` (the throwing variant)
 * extensively. This file covers the `safe` variant's null-return contract.
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';
import { safeResolveAssetClass } from '../../../shared/asset-classes.js';

describe('B79.0b — safeResolveAssetClass null-return contract', () => {
  it('valid crypto_spot canonical returns AssetClass', () => {
    expect(safeResolveAssetClass('BTC/USD', 'kraken')).toBe('crypto_spot');
  });

  it('valid xstock_spot via kraken-equities returns AssetClass', () => {
    expect(safeResolveAssetClass('AAPL/USD', 'kraken-equities')).toBe('xstock_spot');
  });

  it('valid xstock_perp PF_*XUSD via kraken-futures returns AssetClass', () => {
    expect(safeResolveAssetClass('PF_AAPLXUSD', 'kraken-futures')).toBe('xstock_perp');
  });

  it('unknown symbol pattern on kraken returns null (does not throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => safeResolveAssetClass('lower_case_thing', 'kraken')).not.toThrow();
    expect(safeResolveAssetClass('lower_case_thing', 'kraken')).toBeNull();
    warnSpy.mockRestore();
  });

  it('empty string returns null (does not throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => safeResolveAssetClass('', 'kraken')).not.toThrow();
    expect(safeResolveAssetClass('', 'kraken')).toBeNull();
    warnSpy.mockRestore();
  });

  it('symbol on unsupported exchange returns null (does not throw)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(() => safeResolveAssetClass('BTC/USD', 'unknown-exchange')).not.toThrow();
    expect(safeResolveAssetClass('BTC/USD', 'unknown-exchange')).toBeNull();
    warnSpy.mockRestore();
  });

  it('emits console.warn on unknown pattern (operator visibility)', () => {
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    safeResolveAssetClass('garbage', 'kraken');
    expect(warnSpy).toHaveBeenCalled();
    const callArg = String(warnSpy.mock.calls[0]?.[0] ?? '');
    expect(callArg).toContain('B69');
    warnSpy.mockRestore();
  });
});
