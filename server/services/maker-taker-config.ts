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
 * Resolve the per-class expected-fill window (ms). P19-B7.2c re-purposed this as
 * the SOFT tier/T1 telemetry boundary (a maker fill inside it = "filled fast");
 * it no longer drives any order lifecycle. The HARD lifecycle timeout is
 * resolveMakerMaxPendingMs below. (NEW meaning documented in ADJUSTMENT_FRAMEWORK.)
 */
export function resolveMakerTimeBudgetMs(assetClass: AssetClass): number {
  return getCachedNumberRequired('maker_taker', 'maker_time_budget_ms', classKey(assetClass));
}

/**
 * P19-B7.2c — the per-class HARD-DROP timeout (ms) for a post-promotion PENDING
 * maker order (Kyle: ~1h crypto, timeout = DROPPED, period — no convert
 * re-evaluation). Load-time invariant (Langston Q5): the hard-drop must not fire
 * before the soft expected-fill window — incoherent config fails LOUDLY here
 * (fail-hard, not clamp: a misconfig is a deploy-time bug, not a runtime guess).
 */
export function resolveMakerMaxPendingMs(assetClass: AssetClass): number {
  const key = classKey(assetClass);
  const maxPendingMs = getCachedNumberRequired('maker_taker', 'maker_max_pending_ms', key);
  const timeBudgetMs = getCachedNumberRequired('maker_taker', 'maker_time_budget_ms', key);
  if (maxPendingMs < timeBudgetMs) {
    throw new Error(
      `[P19-B7.2c][maker_taker] incoherent config for ${assetClass}: maker_max_pending_ms (${maxPendingMs}) < maker_time_budget_ms (${timeBudgetMs}) — the hard-drop cannot fire before the expected-fill window`,
    );
  }
  return maxPendingMs;
}

/**
 * P19-B7.2c — the VTS maker/taker TWIN kill-knob (per class; 1 = twinning on,
 * 0 = off). DB-governed so twinning can be switched off without a deploy if the
 * doubled VTS open volume misbehaves (Kyle). Numeric 1/0 by design — reuses the
 * existing fail-hard number getter.
 */
export function resolveTwinEnabled(assetClass: AssetClass): boolean {
  return getCachedNumberRequired('maker_taker', 'twin_enabled', classKey(assetClass)) === 1;
}
