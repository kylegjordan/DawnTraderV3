/**
 * B79.0n.MCE — cost-model fail-hard for unwired asset classes (2026-05-21)
 *
 * `getFrictionForAssetClass` (server/core/math/cost-model.ts) had its prior
 * crypto_spot silent default + warn-once unknown-class fallback REMOVED. An
 * asset class with no friction module wired now fails HARD via an exhaustive
 * switch. The throw is a deliberate forcing function: when perpetual-futures
 * (or any other asset class) begins routing through the cost model, the error
 * names exactly the work required before a consumer can reach that branch.
 *
 * This test locks that fail-hard behavior for the two perp classes
 * (crypto_perp + xstock_perp) — both currently registered in the asset-class
 * taxonomy but with no friction module. The error message must reference the
 * batch tag and point at RUNNING_ISSUES so the next engineer knows the path.
 *
 * Per Kyle directive §11 (no silent defaults) + §15 (NO PATCHES).
 */

import { describe, it, expect, beforeAll } from 'vitest';
// B-4.5: getFrictionForAssetClass merges DB-governed fees (fail-hard on cold
// cache). Seed the sync cache in-memory — same shape server boot's
// prefetchModule('fee_model') produces — so this suite stays database-free.
// B-XSTOCK-FEE-CONTRACT (#1010): the fee values are a PROBE here (this suite locks the perp
// fail-hard), so they come from the one fixture rather than a per-suite copy.
import { seedFeeModelForTests } from '../helpers/fee-model-fixture.js';

beforeAll(() => {
  seedFeeModelForTests();
});
import { getFrictionForAssetClass } from '../../core/math/cost-model';

describe('[B79.0n.MCE] cost-model fails hard for unwired asset classes', () => {
  it('getFrictionForAssetClass("crypto_perp") throws — no friction module wired', () => {
    expect(() => getFrictionForAssetClass('crypto_perp')).toThrow(/B79\.0n\.MCE/);
  });

  it('getFrictionForAssetClass("xstock_perp") throws — no friction module wired', () => {
    expect(() => getFrictionForAssetClass('xstock_perp')).toThrow(/B79\.0n\.MCE/);
  });

  it('the throw message points the next engineer at a RUNNING_ISSUES entry', () => {
    // The message must instruct filing a RUNNING_ISSUES entry before any
    // consumer reaches the branch — surfaces the work instead of silently
    // degrading to crypto friction values.
    expect(() => getFrictionForAssetClass('crypto_perp')).toThrow(/RUNNING_ISSUES/);
    expect(() => getFrictionForAssetClass('xstock_perp')).toThrow(/RUNNING_ISSUES/);
  });

  it('the wired asset classes (crypto_spot, xstock_spot) resolve without throwing', () => {
    // Sanity counterpart — the fail-hard switch must still admit the two
    // classes that DO have friction modules.
    expect(() => getFrictionForAssetClass('crypto_spot')).not.toThrow();
    expect(() => getFrictionForAssetClass('xstock_spot')).not.toThrow();
  });
});
