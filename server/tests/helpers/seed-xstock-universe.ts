/**
 * Test harness helper: seed XSTOCK_SPOT_SYMBOLS for unit tests.
 *
 * Background: B79.0n.UNIVERSE-DISCOVERY (commit 230348507, 2026-05-21) made
 * XSTOCK_SPOT_SYMBOLS boot-populated via xstockUniverseService.initializeFromDB().
 * Before that commit the universe was a hard-coded 260-row Map literal that was
 * present at module-load time. Unit tests don't run the boot path, so post-
 * 230348507 XSTOCK_SPOT_SYMBOLS is empty when the test process starts —
 * detectors / filters / asset-class branchers that read it early-return for
 * xStocks, masking the actual behavior under test.
 *
 * This helper seeds the in-memory universe from UNIVERSE_BOOTSTRAP_SET (the
 * 20-symbol survival set used as Layer-4 fallback in production) by calling
 * the same `_replaceXstockUniverse()` that the universe-service uses post-boot.
 *
 * Use in any unit test that depends on a non-empty xStock universe:
 *
 *     import { seedXstockUniverse } from '../helpers/seed-xstock-universe.js';
 *     beforeEach(() => { seedXstockUniverse(); });
 *
 * This is the B-NEW-43 Phase 2 fix for the b-new-42b cross-batch regression
 * documented in `B_NEW_43_CI_RECOVERY_PRE_AUDIT.md` §13.3.
 */

import { _replaceXstockUniverse, type XstockSpotEntry } from '../../../shared/asset-classes.js';
import { UNIVERSE_BOOTSTRAP_SET } from '../../asset_classes/xstock_spot/universe-bootstrap.js';

/**
 * Seed XSTOCK_SPOT_SYMBOLS + XSTOCK_SPOT_REGISTRY with the 20-symbol bootstrap
 * fixture. Safe to call multiple times — `_replaceXstockUniverse` clears
 * previous contents before populating.
 */
export function seedXstockUniverse(): void {
  const fixture = new Map<string, XstockSpotEntry>();
  for (const { symbol, entry } of UNIVERSE_BOOTSTRAP_SET) {
    fixture.set(symbol, entry);
  }
  _replaceXstockUniverse(fixture);
}
