/**
 * B79.0n.HYGIENE — registry trim assertions for the 5 retired symbols.
 *
 * On 2026-05-20 we removed BITF/HOLX/PARA/SAGE/WBA from XSTOCK_SPOT_REGISTRY
 * after RUNNING_ISSUES #120 surfaced 2 months of zero data for these symbols.
 * The retirement is conservative — Kraken-side investigation method does not
 * exist yet (xStocks aren't indexed by their public AssetPairs API), so #120
 * remains DEFERRED for full closure. This batch removes the dead-weight from
 * the live registry; the 5 symbols are documented in KNOWN_NONEXISTENT_NAMES.
 *
 * Pair tests:
 *   - server/tests/unit/b-phase-a2-xstock-eval-cycle-dbs.test.ts (size assert
 *     updated 265 → 260 in the same batch).
 *   - server/tests/unit/b79-0n-hygiene-null-reason-import-hygiene.test.ts
 *     (import-hygiene regression for the other HYGIENE deliverable).
 */

import { describe, it, expect } from '@jest/globals';
import { XSTOCK_SPOT_REGISTRY, XSTOCK_SPOT_SYMBOLS } from '../../../shared/asset-classes';

const RETIRED_SYMBOLS = [
  'BITF/USD',
  'HOLX/USD',
  'PARA/USD',
  'SAGE/USD',
  'WBA/USD',
] as const;

describe('B79.0n.HYGIENE — 5-symbol registry trim', () => {
  it('the 5 retired symbols are NOT in XSTOCK_SPOT_REGISTRY', () => {
    for (const sym of RETIRED_SYMBOLS) {
      expect(XSTOCK_SPOT_REGISTRY.has(sym)).toBe(false);
    }
  });

  it('the 5 retired symbols are NOT in the derived XSTOCK_SPOT_SYMBOLS set', () => {
    for (const sym of RETIRED_SYMBOLS) {
      expect(XSTOCK_SPOT_SYMBOLS.has(sym)).toBe(false);
    }
  });

  it('XSTOCK_SPOT_REGISTRY.size === 260 (was 265 pre-trim)', () => {
    expect(XSTOCK_SPOT_REGISTRY.size).toBe(260);
  });

  it('XSTOCK_SPOT_SYMBOLS.size === 260 (derived set stays in sync with registry)', () => {
    expect(XSTOCK_SPOT_SYMBOLS.size).toBe(260);
  });

  describe('sector-coverage post-trim — none drops below B-PHASE-A2 floor of 7', () => {
    // Pre-trim → post-trim counts per affected sector:
    //   XLV: 42 → 40 (HOLX, SAGE retired)
    //   XLK: 39 → 38 (BITF retired)
    //   XLC: 22 → 21 (PARA retired)
    //   XLP: 15 → 14 (WBA retired)
    // The B-PHASE-A2 sector-coverage floor is 7 distinct sectors. The per-sector
    // assertion below is paranoia-strong: catches the case where someone later
    // removes the OTHER XLV symbol unaware that HYGIENE depended on it staying.
    const sectorCounts = new Map<string, number>();
    for (const entry of XSTOCK_SPOT_REGISTRY.values()) {
      sectorCounts.set(entry.sector, (sectorCounts.get(entry.sector) ?? 0) + 1);
    }

    it('XLV has at least 7 symbols remaining (was 42, post-trim 40)', () => {
      expect(sectorCounts.get('XLV') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it('XLK has at least 7 symbols remaining (was 39, post-trim 38)', () => {
      expect(sectorCounts.get('XLK') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it('XLC has at least 7 symbols remaining (was 22, post-trim 21)', () => {
      expect(sectorCounts.get('XLC') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it('XLP has at least 7 symbols remaining (was 15, post-trim 14)', () => {
      expect(sectorCounts.get('XLP') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it('total distinct sectors >= 7 (B-PHASE-A2 floor)', () => {
      expect(sectorCounts.size).toBeGreaterThanOrEqual(7);
    });
  });
});
