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

  // P19-B1 Bucket E (2026-06-13): the parked size-range skip + the fully-skipped
  // sector-coverage describe (XLV/XLK/XLC/XLP/total floors) were DELETED.
  // Replacement coverage verified before deletion:
  //   - b79-0n-universe-service.test.ts Layer 2 (initializeFromDB population,
  //     sector handling, delisted skip) + Layer 4 bootstrap (>=5 distinct sectors)
  //   - operational sector-distribution watch in the daily UNIVERSE-DISCOVERY
  //     cron health check (discovery_runs + per-sector counts).
  // The static-literal post-trim expectations could never hold again — the
  // registry is DB-backed and dynamic since 2026-05-21.

  it('XSTOCK_SPOT_SYMBOLS.size in sync with registry (vacuously: both empty at test boot)', () => {
    expect(XSTOCK_SPOT_SYMBOLS.size).toBe(XSTOCK_SPOT_REGISTRY.size);
  });
});
