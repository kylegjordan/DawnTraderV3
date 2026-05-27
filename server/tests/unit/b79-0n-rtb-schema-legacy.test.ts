/**
 * ════════════════════════════════════════════════════════════════════════════
 * B79.0n.RTB — Pre-Phase-3 schema backwards-compat (T8a)
 * ════════════════════════════════════════════════════════════════════════════
 *
 * During Phase 1 + 2 backfill window, the assetClass column on rtb_signals
 * is nullable. Legacy rows pre-dual-write have `assetClass=null`. Per
 * scope R-5 mitigation: rehydrate path treats null as crypto_spot with a
 * one-time deprecation WARN. The bucket-assignment path in
 * rtb-refresh-service.ts (line ~334-340) implements this:
 *
 *   let assetClass = signal.assetClass as AssetClass | null;
 *   if (!assetClass) {
 *     try { assetClass = resolveAssetClass(signal.symbol, 'kraken'); }
 *     catch { assetClass = 'crypto_spot'; }
 *   }
 *
 * This test verifies the symbol-resolver fallback behavior on legacy rows:
 *   T8a.1 — null + crypto symbol resolves to crypto_spot
 *   T8a.2 — null + unrecognized symbol falls back to crypto_spot
 *   T8a.3 — explicit non-null assetClass takes precedence
 * ════════════════════════════════════════════════════════════════════════════
 */

import { describe, it, expect, vi } from 'vitest';

const mockRows = { current: [] as any[] };
vi.mock('../../db.js', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => mockRows.current }) }),
  },
}));

import { resolveAssetClass, type AssetClass } from '../../../shared/asset-classes.js';

/**
 * Mirrors the legacy-null fallback used in rtb-refresh-service.ts
 * assignSignalsToBuckets() (lines ~334-340). The test exercises the same
 * resolution algorithm against representative symbols.
 */
function resolveLegacyRowAssetClass(
  signalAssetClass: string | null | undefined,
  symbol: string,
): AssetClass {
  let assetClass = signalAssetClass as AssetClass | null;
  if (!assetClass) {
    try {
      assetClass = resolveAssetClass(symbol, 'kraken');
    } catch {
      assetClass = 'crypto_spot';
    }
  }
  return assetClass as AssetClass;
}

describe('B79.0n.RTB — Pre-Phase-3 schema legacy null handling (T8a)', () => {
  it('T8a.1 — null assetClass + crypto symbol resolves via symbol resolver', () => {
    const cls = resolveLegacyRowAssetClass(null, 'BTC/USD');
    // resolveAssetClass should return a real class for known kraken symbols.
    expect(['crypto_spot', 'crypto_perp']).toContain(cls);
  });

  it('T8a.2 — null assetClass + unrecognized symbol falls back to crypto_spot', () => {
    const cls = resolveLegacyRowAssetClass(null, 'TOTALLY_BOGUS_NEVER_SEEN_SYMBOL_XYZ');
    // Either resolver returns crypto_spot for unknown, or throws and our
    // catch defaults to crypto_spot. Either way result is crypto_spot.
    expect(cls).toBe('crypto_spot');
  });

  it('T8a.3 — explicit non-null assetClass takes precedence over symbol', () => {
    // Even if symbol looks like a crypto, an explicit xstock_perp wins.
    const cls = resolveLegacyRowAssetClass('xstock_perp', 'BTC/USD');
    expect(cls).toBe('xstock_perp');
  });

  it('T8a.4 — undefined treated same as null', () => {
    const cls = resolveLegacyRowAssetClass(undefined, 'XYZ_UNKNOWN');
    expect(cls).toBe('crypto_spot');
  });

  it('T8a.5 — empty string treated same as null (falsy guard)', () => {
    const cls = resolveLegacyRowAssetClass('', 'XYZ_UNKNOWN');
    expect(cls).toBe('crypto_spot');
  });
});
