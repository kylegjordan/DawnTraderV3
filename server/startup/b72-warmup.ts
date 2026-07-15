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
// reorg-B2: iterate the canonical regime SSOT (no hardcoded regime strings — regime_mapping_integrity;
// the boot assertion auto-extends if a regime is ever added — Langston Step-4 note 1).
import { CANONICAL_REGIMES } from '../config/canonical-regime-strategy-map.js';

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
  'active_sizing',         // active-position-sizing.ts max position buffer factor
  'vts_service',          // vts-service.ts calibration trigger interval
  'cost_model',           // cost-metrics.ts default avg return
  'learning_governance',  // learning-cooldown.ts min batch size (regime=TRANSITION)
  // Slice 2c — pattern pool, drift, paper exec, orchestrator timing:
  'pattern_pool_gates',   // pattern-filter-profile.ts RSI bounds + guardrails
  'drift_detector',       // drift-descriptions.ts boundaries
  'active_execution',      // active-execution-engine.ts intervals
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
  'ranking_context_bonus',// Obj-10 (#217) shadow terms + bull-compat mapping
  // P19-B7.2 (2026-07-01): per-asset-class maker/taker entry-decision haircut
  // knobs (adverse-selection base/slope, non-fill cost + urgency deltas, pFill,
  // hard-floor, ladder time budget) — read synchronously by the shared
  // decideMakerTaker caller in the signal-gen hot path. MUST be warm; fail-hard
  // on missing rows (START TIGHT seeds live in the B7.2 migration).
  'maker_taker',
  // P19-B8.2: friction-divergence auto re-anchor knobs (max_divergence_bps,
  // min_notional_delta_max, min_reanchor_interval_ms, impact_k, ratio band) —
  // read synchronously at the trade-open seam. Seeds live in the B8.2 migration
  // (CONSERVATIVE PLACEHOLDERS pending Phase-25 calibration); fail-hard on
  // missing rows per rule 15.
  'friction_divergence',
  // P19-B8.5a (OBJ-1): the flat measured pWin base rate that replaces finalScore as
  // decideMakerTaker's signalStrength (de-contamination — finalScore is anti-predictive,
  // r=−0.140). Per-class rows (crypto 0.295 / xstock 0.317) + wildcard 0.307, pinned to
  // OLD Claude's 12,140-trade post-B62 probe (P25_SCORING_STACK_PRESTUDY §4; Wilson CIs
  // in the seed migration). PLACEHOLDER until the Phase-25 calibrated pWin (#399a) — a
  // DB knob so recalibration is a SQL UPDATE, never a code edit (rule 15). Read
  // synchronously in the signal-gen + RTB-refresh + VTS hot paths. MUST be warm.
  'scoring_base',
  // P19-B8.5 (EXPLORATION LANE): paper-only lane knobs (enabled kill-switch,
  // daily_budget, base_floor_pct, anneal_step_trades/pct, policy_version) — read
  // synchronously by checkExplorationAdmit on every NetEV-only SQE failure in the
  // signal-gen hot path. MUST be warm: getCachedConstant THROWS on a cold module,
  // which fail-closes the lane on EVERY consult (the exact silent-lane defect
  // found live 2026-07-15 — 282 EXPLORATION_ERR 'module not warm' stderr lines,
  // zero admits). Seeds live in the B8.5 exploration-lane migration (both classes).
  'exploration_lane',
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

  // B-5 AMR (Obj-2 boot assertion): explicit per-class rows must exist for
  // every ACTIVE class x mode across the AMR-governed modules — a partial
  // seed passes the generic zero-row gate yet hard-fails mid-cycle inside
  // try/catch-wrapped paths (= silent posture outage). Wildcards are
  // inactive-class fallbacks ONLY (B79.TEC explicit-row pattern).
  {
    const { getCachedNumberRequired } = await import('../services/module-constants-service.js');
    const ACTIVE_CLASSES = ['crypto_spot', 'xstock_spot'] as const;
    const MODES = ['normal', 'aggressive', 'defensive', 'survival'] as const;
    for (const assetClass of ACTIVE_CLASSES) {
      const key = { exchange: '*', assetClass, strategy: '*', regime: '*' };
      for (const mode of MODES) {
        for (const dial of ['position_size_multiplier', 'stop_loss_distance_multiplier', 'take_profit_distance_multiplier', 'entry_cooldown_multiplier', 'slot_cap'] as const) {
          getCachedNumberRequired('amr_response_dials', mode + '_' + dial, key);
        }
        getCachedNumberRequired('governance_modes', mode + '_mode_confidence_floor', key);
      }
      for (const rule of ['friction_score_choppy', 'friction_score_stormy', 'dbs_abs_choppy', 'dbs_abs_stormy', 'ev_gap_window_n', 'dwell_min_epochs', 'relax_confirm_epochs', 'favorable_min_score'] as const) {
        getCachedNumberRequired('amr_weather_rules', rule, key);
      }
    }
    // xstock-only store knobs (chunk 0a sync reads in the scan cycle):
    const xk = { exchange: '*', assetClass: 'xstock_spot', strategy: '*', regime: '*' };
    for (const c of ['freshness_window_seconds', 'min_fresh_names', 'warmup_cycles'] as const) {
      getCachedNumberRequired('amr_friction_sample', c, xk);
    }
    console.log('[B-5][warmup] AMR per-class rows verified (dials/floors/rules x 2 classes x 4 modes + friction-sample knobs)');

    // Obj-10 SPY pin 1: lookback must fit INSIDE the stored 15m-bar window
    // (xstock_spot_ohlc_15m_snapshot holds ~729 bars; a lookback beyond the
    // window would silently truncate the trend baseline).
    const spyLookback = getCachedNumberRequired('ranking_context_bonus', 'spy_trend_lookback_bars', xk);
    if (!(spyLookback >= 2 && spyLookback <= 600)) {
      throw new Error(`[B-5][warmup] spy_trend_lookback_bars=${spyLookback} outside [2, 600] (stored window ~729 bars) — refusing to start.`);
    }
  }

  // reorg-B2 (Piece A/B, 2026-06-20): per-class ROI gate + target-floor/min-RR must be seeded
  // for BOTH active spot classes. A partial seed passes the generic zero-row gate yet hard-fails
  // mid-signal at the first per-class resolve (silent gate-off / wrong-bound) — so assert at boot.
  // Cold-start warmup that THROWS, NEVER a silent global fallback (Langston Step-2 / §11 / #10).
  {
    const { getCachedNumberRequired } = await import('../services/module-constants-service.js');
    for (const assetClass of ['crypto_spot', 'xstock_spot'] as const) {
      const k = { exchange: '*', assetClass, strategy: '*', regime: '*' };
      for (const c of ['roi_flex_multiplier', 'roi_absolute_min', 'roi_absolute_max', 'target_floor_pct', 'min_rr', 'reach_atr_max'] as const) {
        try {
          getCachedNumberRequired('expectancy_gates', c, k);
        } catch (err) {
          throw new Error(
            `[reorg-B2][warmup] expectancy_gates.${c} for asset_class='${assetClass}' missing — ` +
            `migration drizzle/migrations/2026-06-20-reorg-b2-per-class-roi-target.sql has not been applied. ` +
            `Apply migration before starting server. (${(err as Error).message})`,
          );
        }
      }
      for (const regime of CANONICAL_REGIMES) {
        try {
          getCachedNumberRequired('roi_gating', 'min_roi', { exchange: '*', assetClass, strategy: '*', regime });
        } catch (err) {
          throw new Error(
            `[reorg-B2][warmup] roi_gating.min_roi for asset_class='${assetClass}' regime='${regime}' missing — ` +
            `reorg-B2 migration not (fully) applied. (${(err as Error).message})`,
          );
        }
      }
    }
    console.log('[reorg-B2][warmup] per-class ROI gate + target-floor/min-RR verified (expectancy_gates + roi_gating × 2 classes)');
  }

  started = true;
}
