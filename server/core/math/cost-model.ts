/**
 * ══════════════════════════════════════════════════════════════════════════════
 * Directive 11.3A/B — Canonical Cost Model
 * ══════════════════════════════════════════════════════════════════════════════
 * 
 * Unified round-trip cost computation for all trade-related calculations.
 * This is the single source of truth for cost modeling across:
 * - Signal Orchestrator
 * - RTB Refresh Service
 * - Dynamic Sizing Engine (DSE)
 * - Signal Quality Evaluator (SQE)
 * - Trade Execution Controller (TEC)
 * - Virtual Trading Simulator (VTS)
 * 
 * Cost Components:
 * - Exchange fee (maker/taker): Applied on both entry and exit
 * - Slippage: Execution drift, applied on both entry and exit
 * - Spread: Bid/ask liquidity cost, applied once at entry
 * 
 * Formula: totalCost = (fee × 2) + (slippage × 2) + spread
 * 
 * Directive 11.3B Updates:
 * - Delegates to centralized cost-cache.ts
 * - Uses exchange-defaults.ts for constants
 * - Default taker fee raised to 0.26%
 * 
 * DO NOT MODIFY without architectural review.
 * ══════════════════════════════════════════════════════════════════════════════
 */

import {
  DEFAULT_SLIPPAGE,
  DEFAULT_SPREAD,
  MAX_COST_BOUND,
} from '../../config/exchange-defaults.js';
// B-4.5: fees are DB-governed (module_constants `fee_model`, warmed by
// b72-warmup, fail-hard). The static DEFAULT_TAKER_FEE/DEFAULT_MAKER_FEE
// constants are RETIRED from live paths.
import { getCachedNumberRequired } from '../../services/module-constants-service.js';

import {
  getOrSetCostMetrics,
  setCostMetrics,
  clearCostCache,
  getCacheStats,
  type CostMetrics,
} from '../cache/cost-cache.js';

// B79: per-asset-class friction modules. cost-model resolves friction by
// assetClass (back-compat default = 'crypto_spot'). Crypto_spot path values
// equal exchange-defaults.ts (no-touch fence). Xstock_spot has its own
// fee/spread/slippage profile per scope §2.3 obj 11.
import { CRYPTO_SPOT_FRICTION } from '../../asset_classes/crypto_spot/friction.js';
import { XSTOCK_SPOT_FRICTION } from '../../asset_classes/xstock_spot/friction.js';
import type { AssetClassFrictionModel } from '../../asset_classes/types.js';
// B79.0n.MCE: AssetClass type for the REQUIRED-assetClass refactor. The prior
// `assetClass: string = 'crypto_spot'` silent defaults + warn-once unknown
// fallback are removed — no silent degradation (CLAUDE.md §11 + §15).
import type { AssetClass } from '../../../shared/asset-classes.js';
// B-5 AMR (Obj-12 / Pull-in A): xstock per-symbol MEASURED spread from the
// scanner-fed friction-sample store (static module spread = fallback only).
import { getMeasuredSpreadDecimal } from '../../asset_classes/xstock_spot/friction-sample-store.js';

/**
 * B79.0n.MCE: resolve the per-asset-class friction model. `assetClass` is
 * REQUIRED — the prior crypto_spot silent default + warn-once unknown-class
 * fallback are removed. An asset class with no friction model wired fails
 * HARD (exhaustive switch). The throw is a deliberate forcing function: when
 * perpetual-futures or any other asset class begins routing through the cost
 * model, the error names exactly the work required before a consumer can
 * reach this branch.
 */
export function getFrictionForAssetClass(assetClass: AssetClass): AssetClassFrictionModel {
  switch (assetClass) {
    // B-4.5: THE single fee merge site. Fee rates come from the DB
    // (module_constants `fee_model`, per asset_class, warmed at boot,
    // fail-hard on missing rows); spread/slippage/bound remain the static
    // module values. The merge CONSTRUCTS A NEW OBJECT — the static module
    // objects are never mutated (their fee fields are NaN tombstones; a
    // mutation would poison that pattern and create cross-call state).
    case 'crypto_spot':
      return { ...CRYPTO_SPOT_FRICTION, ...resolveFeeRates(assetClass) };
    case 'xstock_spot':
      return { ...XSTOCK_SPOT_FRICTION, ...resolveFeeRates(assetClass) };
    case 'crypto_perp':
    case 'xstock_perp':
    case 'equity_spot':
    case 'equity_futures':
    case 'commodity_futures':
    case 'fx_spot':
      throw new Error(
        `[B79.0n.MCE][cost-model] assetClass='${assetClass}' has no friction model wired. ` +
        `Onboarding this asset class requires a friction module at ` +
        `server/asset_classes/${assetClass}/friction.ts + a case in getFrictionForAssetClass. ` +
        `File a RUNNING_ISSUES entry and scope the work before any consumer reaches this branch.`,
      );
    default: {
      // Exhaustiveness check — if a new value is added to AssetClass, this
      // assignment fails to compile until the switch handles it.
      const _exhaustive: never = assetClass;
      throw new Error(`[B79.0n.MCE][cost-model] unreachable assetClass=${String(_exhaustive)}`);
    }
  }
}

/**
 * B-4.5: resolve the DB-governed fee pair for an asset class from the warmed
 * module_constants cache. Throws on cold cache or missing row (the b72-warmup
 * boot assertion makes that a deploy-time failure, not a mid-scan one).
 * Maker is resolved + carried so the future Phase-19 maker-entry flip is a
 * value change, not a redesign — it has zero live consumers today (the
 * engine takes liquidity; the model prices taker both legs — pre-audit §0).
 */
function resolveFeeRates(assetClass: AssetClass): { feeRateTaker: number; feeRateMaker: number } {
  const key = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  return {
    feeRateTaker: getCachedNumberRequired('fee_model', 'spot_taker_fee', key),
    feeRateMaker: getCachedNumberRequired('fee_model', 'spot_maker_fee', key),
  };
}

/**
 * B79.0n.MCE: per-asset-class default cost components (fee/slippage/spread).
 * Used as the fallback when no per-symbol cached metrics are available.
 * Per-pair overrides (if any) supersede the defaults. `assetClass` REQUIRED.
 */
export function getDefaultCostComponentsForAssetClass(
  assetClass: AssetClass,
  symbol?: string,
): CostComponents {
  const friction = getFrictionForAssetClass(assetClass);
  const overrides = (symbol && friction.perPairOverrides && friction.perPairOverrides[symbol]) || {};
  return {
    fee: overrides.feeRateTaker ?? friction.feeRateTaker,
    slippage: overrides.slippageRateDefault ?? friction.slippageRateDefault,
    spread: overrides.spreadRateDefault ?? friction.spreadRateDefault,
  };
}

export interface CostComponents {
  fee: number;
  slippage: number;
  spread: number;
  /**
   * B-5 (Obj-12): provenance of the spread value - 'measured' = live
   * scanner-cycle bid/ask measurement (xstock friction-sample store);
   * 'static_fallback' = the per-class module default (store warming, symbol
   * absent, or measurement stale). Rides every JSON-persisted payload so the
   * Phase-25 study can sub-partition mixed-source admit windows. Crypto
   * leaves it unset v1: the symbol cost-cache conflates scanner writes with
   * getOrSet default seeding, so a truthful per-entry stamp needs the B81
   * cache asset-class dimension first.
   */
  spreadSource?: 'measured' | 'static_fallback';
}

export interface CachedCostMetrics extends CostComponents {
  symbol: string;
  timestamp: number;
  totalRoundTripCost: number;
}

export function computeTotalRoundTripCost(fee: number, slippage: number, spread: number): number {
  return (fee * 2) + (slippage * 2) + spread;
}

export function getCachedCostMetrics(symbol: string, assetClass: AssetClass): CostComponents {
  // B79.0n.MCE: `assetClass` is REQUIRED — the prior crypto_spot silent default
  // is removed. Every caller passes an explicit asset class.
  //
  // B79: cost-cache currently keyed by symbol only (no asset_class dimension).
  // Existing seed values for that cache are crypto_spot defaults from
  // exchange-defaults.ts, so this stays exact for crypto_spot back-compat.
  // For xstock_spot (or any future asset class), we synthesize the default
  // via the per-asset-class friction module if no cache entry exists yet.
  // When cost-cache gains an asset_class dimension (B81 filter-as-first-class),
  // this dispatch collapses back into a single cache lookup.
  if (assetClass === 'crypto_spot') {
    // P19-B7.2a (#330): the cache serves MEASURED microstructure only (spread/
    // slippage); the FEE is composed here at READ time from the B-4.5 single
    // merge site — one road to the fee fact. A poisoned/stale cache entry can
    // no longer affect the fee, a fee_model change is visible on the next read
    // (no cache TTL on the fee), and the governed fee never meets the
    // MAX_COST_BOUND clamp (measurements-only) by construction.
    const measured = getOrSetCostMetrics(symbol);
    return {
      fee: getFrictionForAssetClass('crypto_spot').feeRateTaker,
      slippage: measured.slippage,
      spread: measured.spread,
    };
  }
  // B-5 AMR (Obj-12 / Pull-in A): xstock_spot reads the per-symbol MEASURED
  // spread when the friction-sample store has a fresh valid sample - the
  // static module spread becomes the explicit fallback. This is a LIVE
  // behavioral write independent of the AMR flag state (it changes the admit
  // population), which is why the deploy bumps the xstock_spot vts
  // calibration epoch (scope Obj-12 ruling; crypto untouched).
  if (assetClass === 'xstock_spot') {
    const defaults = getDefaultCostComponentsForAssetClass(assetClass, symbol);
    const measured = getMeasuredSpreadDecimal(symbol);
    if (measured !== null) {
      return { ...defaults, spread: measured, spreadSource: 'measured' };
    }
    return { ...defaults, spreadSource: 'static_fallback' };
  }
  return getDefaultCostComponentsForAssetClass(assetClass, symbol);
}

// B-4.5: `updateCachedCostMetrics` RETIRED (Langston pre-audit R2). It was an
// exported fee-WRITING path through the cost-cache clamp with ZERO callers —
// a buried route by which a DB-governed fee could be silently clamped. The
// live spread writers (market-scanner / fx5-scanner) call setCostMetrics on
// the cache directly; fees never flow through the cache (cost-cache seeds are
// DB-resolved as of this batch).

export function getCostMetricsCache(): Map<string, CachedCostMetrics> {
  const stats = getCacheStats();
  const result = new Map<string, CachedCostMetrics>();
  return result;
}

/**
 * P19-B7.2a (#330): the fee-bearing cache-stats shape the production stat
 * readers consume (TEC-costs diagnostics, cost-telemetry persistence, the
 * routes cost-diagnostics endpoint, the cost-drift monitor). `avgFee` is
 * composed from the B-4.5 single merge site — with the fee no longer stored
 * per cache entry, the "average fee over cached symbols" IS the class fee
 * (the symbol cache is structurally crypto-lane-only; cost-cache.ts header).
 * Consequence: the drift monitor's fee-delta now fires ONLY on a real
 * fee_model change, never a clamp/TTL artifact.
 * ⚠️ B81 coupling: this single-class assumption holds only while the cache is
 * single-lane — the B81 asset-class re-key must revisit it (RUNNING_ISSUES #330→B81 pointer).
 */
export function getCostCacheStatsWithFee(): {
  symbolCount: number;
  avgFee: number;
  avgSlippage: number;
  avgSpread: number;
} {
  const stats = getCacheStats();
  return { ...stats, avgFee: getFrictionForAssetClass('crypto_spot').feeRateTaker };
}

export function clearCostMetricsCache(): void {
  clearCostCache();
}

export interface ExecutionGeometry {
  executionEntry: number;
  executionStop: number;
  executionTarget: number;
  grossPnlPct: number;
  netExpectedEdge: number;
  netRewardToRisk: number;
}

export function computeNetGeometry(
  baseEntry: number,
  baseStop: number,
  baseTarget: number,
  costs: CostComponents
): ExecutionGeometry {
  const totalCost = computeTotalRoundTripCost(costs.fee, costs.slippage, costs.spread);
  
  const executionEntry = baseEntry * (1 + costs.slippage + costs.spread / 2);
  const executionStop = baseStop;
  const executionTarget = baseTarget;
  
  const grossPnlPct = (executionTarget - executionEntry) / executionEntry;
  const netExpectedEdge = grossPnlPct - totalCost;
  
  const riskPct = (executionEntry - executionStop) / executionEntry;
  const rewardPct = (executionTarget - executionEntry) / executionEntry;
  
  const netRewardPct = rewardPct - totalCost;
  const netRewardToRisk = riskPct > 0 ? netRewardPct / riskPct : 0;
  
  return {
    executionEntry,
    executionStop,
    executionTarget,
    grossPnlPct,
    netExpectedEdge,
    netRewardToRisk,
  };
}

export function computeNetBreakeven(entryPrice: number, costs: CostComponents): number {
  const totalCost = computeTotalRoundTripCost(costs.fee, costs.slippage, costs.spread);
  return entryPrice * (1 + totalCost);
}

/**
 * Compute the floor price to lock in when a ladder rung target is hit.
 *
 * B65.4.1 hotfix (2026-04-26, Kyle directive): the original formula returned
 * `targetPrice * (1 - totalCost / 2)` — a "breakeven-after-costs" floor that sat
 * BELOW the just-hit target. On reversal, this allowed exits BELOW the original
 * target price, costing us the gain we'd already achieved on the way up.
 *
 * Live evidence (5 closed laddered trades through 2026-04-26 morning):
 *   - 2Z/USD: target 0.09633, floor 0.09030 (6.26% below target). Trade reversed
 *     off target, exited at -0.12% net — a target-hit became a small loser.
 *   - ENSO/USD: target 1.28909, floor 1.27864. Trade ratcheted, reversed, exited
 *     at +23.53% vs counterfactual at-target +36.65% — left $6.26 on the table.
 *   Across 5 trades, the ladder LOST ~$11 vs the just-take-target counterfactual.
 *
 * New formula: floor = targetPrice * (1 + slippage * bufferMultiplier).
 *
 * The floor sits ABOVE the target by exactly enough to absorb the typical
 * stop-trigger slippage on a reversal, ensuring the actual fill on a stop-out
 * is at-or-above the target level. Multi-rung ratcheting still works as before
 * (the floor moves up with each rung), so the design's payoff scenario is
 * preserved while the failure mode (single-rung-then-reverse losing more than
 * target gave) is fixed.
 *
 * The buffer multiplier is resolved per-trade via module_constants
 * (`rung_floor_slippage_buffer_multiplier`, seed 1.0) so it can be tuned per
 * (asset_class, exchange, regime, strategy) without redeploy.
 *
 * @param targetPrice - the just-hit rung target price
 * @param costs - per-pair cost components (fee, slippage, spread)
 * @param slippageBufferMultiplier - multiplier on costs.slippage for the buffer.
 *        Default 1.0 = exactly the per-pair slippage estimate. >1.0 widens the
 *        buffer at cost of trigger sensitivity. <1.0 tightens (more triggers
 *        but tighter to target).
 */
export function computeNetTargetFloor(
  targetPrice: number,
  costs: CostComponents,
  slippageBufferMultiplier: number = 1.0,
): number {
  const buffer = costs.slippage * slippageBufferMultiplier;
  return targetPrice * (1 + buffer);
}

// B-4.5: DEFAULT_FEE re-export RETIRED (fees are DB-governed; use
// getFrictionForAssetClass / getCachedCostMetrics).
export { DEFAULT_SLIPPAGE, DEFAULT_SPREAD, MAX_COST_BOUND };
