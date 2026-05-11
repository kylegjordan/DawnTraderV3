/**
 * B72 Step 3 — Module-Constants Warmup Bootstrap
 *
 * Prefetches every module_constants module that has sync-read callers (hot-
 * path strategies, MCE classifiers, etc.) so the in-memory cache is populated
 * before any sync caller hits getCachedNumberRequired/getCachedConstant.
 *
 * Pattern per B72 scope §A.3: no silent fallback. If a module read fails
 * here, we throw — the server should not start with cold caches that would
 * blow up at first signal evaluation.
 *
 * Add new modules to PREFETCH_MODULES as B72 promotes more levers from
 * sync-read code paths. The async getConstant() callers do not need to be
 * listed here (they self-prime through loadModule on first read).
 */

import { prefetchModule } from '../services/module-constants-service.js';

/**
 * Modules whose constants are read from synchronous code paths (strategy
 * detect functions, hot-path classifiers, etc.). Each module here MUST be
 * warmed before the corresponding consumer runs.
 */
const PREFETCH_MODULES = [
  // Commit A: DBS routing guards (strong_bull_trend + 3 mutual-exclusion guards).
  'strategy_dbs_routing_guards',
  // Commit B Slice 1: Dynamic Sizing Engine config.
  'position_sizing',
  // Commit B Slice 2: cross-strategy modules (math kernels + RTB + sizing).
  'roi_gating',           // expectancy.ts per-regime ROI thresholds (5 regimes)
  'expectancy_tuning',    // expectancy.ts winrate boost floors (3)
  'expectancy_gates',     // adaptive-thresholds → expectancy.ts (4)
  'queue_admission',      // ready_to_buy_service min queue confidence
  'rtb_ranking',          // ready_to_buy_service finalscore decay + cap
  'rtb_config',           // ready_to_buy_service tcl_warmup_threshold (env-overridable)
  'cost_geometry',        // ready_to_buy_service geometry recalc thresholds
  // Slice 2b — math kernels + observability + governance:
  'vts_scoring',          // vts-real-score.ts decay lambda
  'goals_weighting',      // adaptive-goals-weight.ts AI weight cap
  'dbs_calculation',      // directional-bias-store.ts global DBS sample floor
  'paper_sizing',         // paper-position-sizing.ts max position buffer factor
  'vts_service',          // vts-service.ts calibration trigger interval
  'cost_model',           // cost-metrics.ts default avg return
  'learning_governance',  // learning-cooldown.ts min batch size (regime=TRANSITION)
  // Slice 2c — pattern pool, drift, paper exec, orchestrator timing:
  'pattern_pool_gates',   // pattern-filter-profile.ts RSI bounds + guardrails
  'drift_detector',       // drift-descriptions.ts boundaries
  'paper_execution',      // paper-execution-engine.ts intervals
  'signal_orchestrator',  // signal-orchestrator.ts evaluation/refresh intervals
  // Slice 2d — VTS runner caps + regime age:
  'vts_runner',           // vts-runner.ts max_concurrent / max_open / cooldown / hash tolerance + expiry
  'regime_age',           // regime-age-factor.ts Path A momentum floor
  // Slice 3 — per-strategy modules (10-19 levers each, bulk-read via getCachedNumbersForModule):
  'strategy.adaptive_flow',
  'strategy.volatility_edge',
  'strategy.defensive_hedge',
  'strategy.inside_bar_reversal',
  'strategy.morning_star',
  'strategy.pivot_shift',
  'strategy.reverse_impulse',
  'strategy.support_bounce',
  'strategy.strong_bull_trend',
  // B79.0m.a — strategy_gates moved from code constant XSTOCK_SPOT_ENABLED_STRATEGIES
  // to DB rows. isStrategyEnabledForAssetClass (sync caller from SQE) reads via
  // getCachedConstant; this module MUST be warm before SQE evaluation.
  'strategy_gates',
  // B79.0m.b — mce_config read by MCE.computeContext for non-crypto assetClass
  // (xstock_spot etc. use per-class macro_modifier row, default 1.0). Crypto
  // keeps the macroCachedContext path; this is non-crypto only.
  'mce_config',
  // Slice 4 — HIGH-risk:
  'sqe_config',           // SQE primary admission gates (precedence: screener_filters → sqe_config → static mirror)
  'expectancy_kernel',    // pWin floor/ceiling (caller-injected into pure-math kernel)
  'directional_integrity',// DI→pWin scaling factor (caller-injected)
  // B72.1 — strategy-modes naming reseed:
  'governance_modes',     // strategy-modes confidence floors (NORMAL/DEFENSIVE/SURVIVAL)
  // B72.1 — carry-over source-side wiring (rows pre-seeded under B72 main):
  'adaptive_weights',     // adaptive-manager.ts default_decay_rate (lazy getter)
  'concentration_risk',   // risk-concentration.ts Directive 9.4 covariance guards
  'guardrail_defaults',   // trade-safety.ts fallbacks (max total exposure pct, max open trades default)
  'goal_alignment',       // pre-execution-validator.ts atomic 4-weight alignment block + thresholds
  'strategy_profiles',    // pre-execution-validator.ts per-strategy risk/consistency profile
  // B72.2 — in-class quant strategies (detect* methods in strategy-engine.ts):
  'strategy.vwap_pullback',
  'strategy.abcd_long',
  'strategy.sma_trend_ride',
  'strategy.breakout',
  'strategy.mean_reversion',
  'strategy.range_trade',
  'strategy.vwap_bounce',
  'strategy.liquidity_trap',  // operationally disabled but params still tunable
  'strategy.dhma',
  // Future: more Slice 2/3/4 modules added here as source replacements ship.
];

let started = false;

export async function warmModuleConstantsForSyncCallers(): Promise<void> {
  if (started) return;
  for (const moduleName of PREFETCH_MODULES) {
    const rowCount = await prefetchModule(moduleName);
    // eslint-disable-next-line no-console
    console.log(`[B72][warmup] prefetched module_constants module='${moduleName}' rows=${rowCount}`);
    if (rowCount === 0) {
      // Hard fail per Kyle directive: no silent fallback. If the migration
      // didn't seed rows, server should not start.
      throw new Error(
        `[B72][warmup] module '${moduleName}' has zero rows — ` +
        `Drizzle migration drizzle/migrations/2026-05-05-b72-dbs-routing-guards.sql ` +
        `has not been applied to this database. Apply migration before starting server.`,
      );
    }
  }
  started = true;
}
