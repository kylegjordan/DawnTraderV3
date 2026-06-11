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
  // ITEM-4 step 2 (2026-06-10): per-source calibration epochs (D9 anti-mixing stamp).
  'calibration_epoch',
  // ITEM-4 step 3 (2026-06-10): the live-engine Phase-21 gate (read fail-closed at the route).
  'live_engine_gate',
  // B-4.5 (2026-06-11): DB-governed per-class fees (Kraken cross-platform Tier 1).
  // Merged over the static friction modules at getFrictionForAssetClass — the
  // hot scan path reads this cache synchronously every cycle. MUST be warm.
  'fee_model',
  // B-5 AMR (2026-06-11): the AMR body's DB-governed surface. amr_friction_sample
  // is read synchronously in the xstock scan cycle (chunk 0a) — MUST be warm;
  // the rest are read each MCE cycle by the weather aggregator + gates.
  'amr_runtime',          // 3-state flag per class (disabled|shadow|active)
  'amr_response_dials',   // per-(mode,class) dials + slot caps + allowances
  'amr_weather_rules',    // per-class thresholds/dwell/weights (provenance in migration)
  'amr_friction_sample',  // xstock measured-spread store knobs (sync in scan cycle)
  'amr_input_health',     // Obj-15b sentinel rails (R1-R5)
  'amr_external_equity',  // Obj-14b equity feed knobs (CBOE/FRED/ECB sources)
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

  // ITEM-4 step 2 (Langston Step-4 required addition): the calibration_epoch
  // module needs more than the generic zero-row gate — a PARTIAL seed (e.g. 2
  // of 3 sources) would pass non-zero yet still throw mid-trade-close at the
  // first read of the missing source, inside try/catch-wrapped close paths
  // (= silent learning outage). Assert ALL THREE per-source rows at boot so
  // "migration didn't apply" is a deterministic deploy-time failure.
  {
    const { getCachedNumbersForModule } = await import('../services/module-constants-service.js');
    const epochs = getCachedNumbersForModule('calibration_epoch', {
      exchange: '*', assetClass: '*', strategy: '*', regime: '*',
    });
    for (const source of ['vts', 'paper_sim', 'live'] as const) {
      if (!Number.isFinite(epochs[source]) || epochs[source] < 1) {
        throw new Error(
          `[ITEM4][warmup] calibration_epoch row for source='${source}' missing or invalid — ` +
          `migration drizzle/migrations/2026-06-10-item4-step2-calibration-epoch.sql ` +
          `has not been (fully) applied. Apply migration before starting server.`,
        );
      }
    }
    console.log(`[ITEM4][warmup] calibration_epoch verified: vts=${epochs.vts} paper_sim=${epochs.paper_sim} live=${epochs.live}`);
  }

  // B-4.5 (scope objective 1): fee_model needs more than the generic zero-row
  // gate — a PARTIAL seed (one class present, the other missing) passes
  // non-zero yet hard-fails mid-scan at the first friction merge for the
  // missing class. Assert BOTH constants for BOTH spot classes at boot so
  // "migration didn't apply" is a deterministic deploy-time failure.
  {
    const { getCachedNumberRequired } = await import('../services/module-constants-service.js');
    const fees: Record<string, number> = {};
    for (const assetClass of ['crypto_spot', 'xstock_spot'] as const) {
      for (const constant of ['spot_taker_fee', 'spot_maker_fee'] as const) {
        let v: number;
        try {
          v = getCachedNumberRequired('fee_model', constant, {
            exchange: '*', assetClass, strategy: '*', regime: '*',
          });
        } catch (err) {
          throw new Error(
            `[B45][warmup] fee_model.${constant} for asset_class='${assetClass}' missing or non-numeric — ` +
            `migration drizzle/migrations/2026-06-11-b45-fee-model-tier1.sql ` +
            `has not been (fully) applied. Apply migration before starting server. (${(err as Error).message})`,
          );
        }
        // Sanity rails: a fee outside (0, 5%] is a fat-fingered DB value, not a tier.
        if (!(v > 0 && v <= 0.05)) {
          throw new Error(
            `[B45][warmup] fee_model.${constant} for '${assetClass}' = ${v} is outside the sane (0, 0.05] decimal range — refusing to start.`,
          );
        }
        fees[`${assetClass}.${constant}`] = v;
      }
    }
    console.log(
      `[B45][warmup] fee_model verified: crypto taker=${fees['crypto_spot.spot_taker_fee']} maker=${fees['crypto_spot.spot_maker_fee']} | ` +
      `xstock taker=${fees['xstock_spot.spot_taker_fee']} maker=${fees['xstock_spot.spot_maker_fee']}`,
    );
  }

  started = true;
}
