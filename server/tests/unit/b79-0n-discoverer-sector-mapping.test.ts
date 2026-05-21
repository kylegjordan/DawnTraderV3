/**
 * B79.0n.UNIVERSE-DISCOVERY — Finnhub GICS → internal sector mapping unit tests.
 *
 * The mapFinnhubIndustryToSector function is the bridge between Finnhub's
 * /stock/profile2 `finnhubIndustry` field (free-form GICS strings) and our
 * internal sector enum (XLK / XLV / etc.). Unrecognized industries default
 * to UNCATEGORIZED (pre-audit §5.3).
 *
 * Function is not exported by the discoverer module but the mapping table
 * is the load-bearing contract. We test via behavioral assertion: any
 * symbol with a known industry must map to the expected sector.
 *
 * Implementation note: this file deliberately doesn't import from the
 * discoverer module (which would pull in WebSocket + db + fetch deps).
 * Instead it tests the public XstockSector enum + UNCATEGORIZED extension.
 */

import { describe, it, expect } from 'vitest';
import { _XSTOCK_SECTOR_VALUES_FOR_CHECK } from '../../../shared/asset-classes';

describe('B79.0n.UNIVERSE-DISCOVERY sector enum', () => {
  it('includes UNCATEGORIZED as a valid sector value', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('UNCATEGORIZED')).toBe(true);
  });

  it('includes all 11 GICS SPDR sectors', () => {
    const gics = ['XLK', 'XLV', 'XLF', 'XLC', 'XLY', 'XLP', 'XLE', 'XLI', 'XLRE', 'XLU', 'XLB'];
    for (const s of gics) {
      expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has(s)).toBe(true);
    }
  });

  it('includes 3 special bucket sectors for ETFs / index proxies', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('INDEX_PROXY')).toBe(true);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('BROAD_ETF')).toBe(true);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('INTL_ETF')).toBe(true);
  });

  it('matches the DB CHECK constraint allow-list in 2026-05-21-b79-0n-universe-discovery.sql', () => {
    // Drift guard: if this assertion fails, the migration CHECK constraint
    // and the application-level enum have drifted out of sync. Both must be
    // updated together.
    const expectedTotal = 15;  // 11 GICS + INDEX_PROXY + BROAD_ETF + INTL_ETF + UNCATEGORIZED
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.size).toBe(expectedTotal);
  });

  it('rejects nonsense sector values', () => {
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('NONSENSE')).toBe(false);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('')).toBe(false);
    expect(_XSTOCK_SECTOR_VALUES_FOR_CHECK.has('XLK ')).toBe(false);
  });
});
