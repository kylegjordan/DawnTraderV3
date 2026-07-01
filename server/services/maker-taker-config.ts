/**
 * P19-B7.2 — Maker/taker haircut config resolver (DB-governed, fail-hard).
 *
 * Resolves the per-asset-class maker/taker entry-decision knobs from the warmed
 * `maker_taker` module_constants module and hands them to the PURE
 * decideMakerTaker() function (caller-injection pattern — the math module stays
 * DB-free). START TIGHT seeds live in the B7.2 migration; a missing row throws
 * (no silent fallback — Kyle NO-PATCHES / no-hardcoded-DB-defaults). The module
 * is warmed at boot by b72-warmup, so a cold/missing row is a deploy-time
 * failure, not a mid-scan one.
 */

import { getCachedNumberRequired } from './module-constants-service.js';
import type { AssetClass } from '../../shared/asset-classes.js';
import type { MakerTakerHaircutConfig } from '../core/math/maker-taker-decision.js';

function classKey(assetClass: AssetClass) {
  return { exchange: '*', assetClass, strategy: '*', regime: '*' };
}

/**
 * Resolve the per-class haircut config. Fail-hard on any missing knob.
 */
export function resolveMakerTakerHaircut(
  assetClass: AssetClass,
): MakerTakerHaircutConfig {
  const key = classKey(assetClass);
  const g = (constant: string) => getCachedNumberRequired('maker_taker', constant, key);
  return {
    makerFillProbability:          g('maker_fill_probability'),
    adverseSelectionBase:          g('adverse_selection_base'),
    adverseSelectionStrengthMult:  g('adverse_selection_strength_mult'),
    nonFillCostBase:               g('non_fill_cost_base'),
    nonFillContinuationPenalty:    g('non_fill_continuation_penalty'),
    nonFillReversalDiscount:       g('non_fill_reversal_discount'),
    hardFloorContinuationStrength: g('hard_floor_continuation_strength'),
  };
}

/**
 * Resolve the per-class make-then-take ladder time budget (ms). The maker order
 * rests up to this long before convert-safety fires (OBJ-4, in the RTB refresh).
 * Tied to the conservative pFill — a short budget bounds non-fill exposure.
 */
export function resolveMakerTimeBudgetMs(assetClass: AssetClass): number {
  return getCachedNumberRequired('maker_taker', 'maker_time_budget_ms', classKey(assetClass));
}
