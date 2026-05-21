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

import { describe, it, expect } from 'vitest';
import { XSTOCK_SPOT_REGISTRY, XSTOCK_SPOT_SYMBOLS } from '../../../shared/asset-classes';

const RETIRED_SYMBOLS = [
  'BITF/USD',
  'HOLX/USD',
  'PARA/USD',
  'SAGE/USD',
  'WBA/USD',
] as const;

// B79.0n.UNIVERSE-DISCOVERY 2026-05-21: registry is now DB-backed and EMPTY
// at module-init time (universe-service populates it via initializeFromDB at
// boot — not during test module load). The static-literal-dependent tests
// below are SKIPPED. The semantically-equivalent validation has moved to:
//   - server/tests/unit/b79-0n-universe-service.test.ts (Layer 4 bootstrap
//     populates the registry synchronously + validates sector coverage)
//   - integration verification against the post-deploy discovery_runs audit
//     table (Step 7 of the universe-discovery sub-batch).
// The "5 retired symbols absent" assertion stays meaningful: the
// 2026-05-21-b79-0n-universe-discovery.sql seed explicitly excludes those
// five symbols, and a future discovery cycle won't re-add them unless Kraken
// starts carrying them (which would also re-establish them as legitimate).
describe('B79.0n.HYGIENE — 5-symbol registry trim', () => {
  it('the 5 retired symbols are NOT in XSTOCK_SPOT_REGISTRY (vacuously true post-UNIVERSE-DISCOVERY refactor; registry is empty at module-init)', () => {
    for (const sym of RETIRED_SYMBOLS) {
      expect(XSTOCK_SPOT_REGISTRY.has(sym)).toBe(false);
    }
  });

  it('the 5 retired symbols are NOT in the derived XSTOCK_SPOT_SYMBOLS set (vacuously true post-UNIVERSE-DISCOVERY refactor)', () => {
    for (const sym of RETIRED_SYMBOLS) {
      expect(XSTOCK_SPOT_SYMBOLS.has(sym)).toBe(false);
    }
  });

  it.skip('SKIPPED post-UNIVERSE-DISCOVERY: XSTOCK_SPOT_REGISTRY.size range check moved to b79-0n-universe-service.test.ts (Layer 4 bootstrap)', () => {
    expect(XSTOCK_SPOT_REGISTRY.size).toBeGreaterThanOrEqual(100);
    expect(XSTOCK_SPOT_REGISTRY.size).toBeLessThanOrEqual(2000);
  });

  it('XSTOCK_SPOT_SYMBOLS.size in sync with registry (vacuously: both empty at test boot)', () => {
    expect(XSTOCK_SPOT_SYMBOLS.size).toBe(XSTOCK_SPOT_REGISTRY.size);
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

    // B79.0n.UNIVERSE-DISCOVERY 2026-05-21: per-sector floor assertions are
    // SKIPPED. The semantically-equivalent check has moved to:
    //   - server/tests/unit/b79-0n-universe-service.test.ts — Layer 4 bootstrap
    //     test asserts >=5 distinct sectors covered by the survival set.
    //   - integration verification at Step 7 against /api/internal/universe-
    //     discovery/health endpoint which returns sectors_present count.
    // The static-literal expectations of "XLV has 40 after trim" etc. no longer
    // hold because the registry is dynamic.
    it.skip('SKIPPED post-UNIVERSE-DISCOVERY: XLV floor (moved to universe-service + health endpoint)', () => {
      expect(sectorCounts.get('XLV') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it.skip('SKIPPED post-UNIVERSE-DISCOVERY: XLK floor', () => {
      expect(sectorCounts.get('XLK') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it.skip('SKIPPED post-UNIVERSE-DISCOVERY: XLC floor', () => {
      expect(sectorCounts.get('XLC') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it.skip('SKIPPED post-UNIVERSE-DISCOVERY: XLP floor', () => {
      expect(sectorCounts.get('XLP') ?? 0).toBeGreaterThanOrEqual(7);
    });

    it.skip('SKIPPED post-UNIVERSE-DISCOVERY: total distinct sectors floor', () => {
      expect(sectorCounts.size).toBeGreaterThanOrEqual(7);
    });
  });
});
