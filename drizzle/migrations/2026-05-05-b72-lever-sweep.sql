-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
-- B72 Step 3 — Commit B — Comprehensive Lever Sweep
--
-- Seeds module_constants with ALL remaining promotable levers identified in
-- LEVER_INVENTORY.md (~176 unique PROMOTE rows after dedup, complementing
-- the 4-row DBS routing-guards group migration in 2026-05-05-b72-dbs-
-- routing-guards.sql).
--
-- Risk-tier-ordered for review readability (LOW first, MED middle, HIGH
-- last). Single transaction either way — atomicity guaranteed by Postgres.
--
-- Source-side replacements (separate code commit) wire each lever to a
-- getCachedNumberRequired() / getCachedNumbersForModule() call against the
-- module_name + constant_name + scope seeded here. PREFETCH_MODULES list
-- in server/startup/b72-warmup.ts must include every module_name below
-- before the consuming code runs.
--
-- Idempotent via ON CONFLICT DO NOTHING. Re-running is safe.

BEGIN;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 1 — LOW-risk math kernels and tuning constants
-- ═══════════════════════════════════════════════════════════════════════════

-- Module: expectancy_kernel — net-EV pWin bounds
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('expectancy_kernel', '*', '*', '*', '*', 'pwin_floor',   '0.40'::jsonb, 'b72-step3-commit-b'),
  ('expectancy_kernel', '*', '*', '*', '*', 'pwin_ceiling', '0.60'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: expectancy_tuning — adaptive ROI boost win-rate triggers
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_floor_low',       '0.4'::jsonb, 'b72-step3-commit-b'),
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_threshold_medium','0.5'::jsonb, 'b72-step3-commit-b'),
  ('expectancy_tuning', '*', '*', '*', '*', 'winrate_threshold_high',  '0.6'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: goals_weighting — AI weight cap (Directive 11.4H)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('goals_weighting', '*', '*', '*', '*', 'ai_weight_cap', '0.40'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: dbs_calculation — global DBS minimum sample count
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('dbs_calculation', '*', '*', '*', '*', 'min_sample_count', '20'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: vts_scoring — VTS-specific score decay
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('vts_scoring', '*', '*', '*', '*', 'vts_decay_lambda', '0.001'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: queue_admission — RTB queue admission floor
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('queue_admission', '*', '*', '*', '*', 'min_queue_confidence', '0.55'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: cost_model (global components + kraken-scoped fees)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('cost_model', '*',      '*', '*', '*', 'default_avg_return', '0.005'::jsonb, 'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_taker_fee',  '0.0026'::jsonb,'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_slippage',   '0.0005'::jsonb,'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'default_spread',     '0.0010'::jsonb,'b72-step3-commit-b'),
  ('cost_model', 'kraken', '*', '*', '*', 'max_cost_bound',     '0.01'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: cost_geometry — RTB recalc thresholds
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('cost_geometry', '*', '*', '*', '*', 'volatility_shift_threshold', '0.05'::jsonb,    'b72-step3-commit-b'),
  ('cost_geometry', '*', '*', '*', '*', 'spread_shift_threshold',     '0.05'::jsonb,    'b72-step3-commit-b'),
  ('cost_geometry', '*', '*', '*', '*', 'geometry_max_age_ms',        '180000'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: rtb_ranking — FinalScore decay + cap
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('rtb_ranking', '*', '*', '*', '*', 'finalscore_decay_lambda', '0.03'::jsonb, 'b72-step3-commit-b'),
  ('rtb_ranking', '*', '*', '*', '*', 'decay_penalty_cap',       '0.10'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: rtb_config — TCL warmup + geometry recalc shift thresholds
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('rtb_config', '*', '*', '*', '*', 'tcl_warmup_threshold_signals',                   '15'::jsonb,    'b72-step3-commit-b'),
  ('rtb_config', '*', '*', '*', '*', 'geometry_recalc_volatility_shift_threshold',     '0.05'::jsonb,  'b72-step3-commit-b'),
  ('rtb_config', '*', '*', '*', '*', 'geometry_recalc_spread_shift_threshold',         '0.05'::jsonb,  'b72-step3-commit-b'),
  ('rtb_config', '*', '*', '*', '*', 'geometry_max_age_ms',                            '180000'::jsonb,'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: signal_orchestrator — eval intervals
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('signal_orchestrator', '*', '*', '*', '*', 'evaluation_interval_ms',     '30000'::jsonb, 'b72-step3-commit-b'),
  ('signal_orchestrator', '*', '*', '*', '*', 'weights_cache_refresh_ms',   '60000'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: vts_runner — VTS execution caps + cooldowns
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('vts_runner', '*', '*', '*', '*', 'max_concurrent_per_symbol_strategy', '1'::jsonb,       'b72-step3-commit-b'),  -- HIGH risk: B19G stabilized
  ('vts_runner', '*', '*', '*', '*', 'max_open_vts_trades',                '500'::jsonb,     'b72-step3-commit-b'),
  ('vts_runner', '*', '*', '*', '*', 'reentry_cooldown_ms',                '300000'::jsonb,  'b72-step3-commit-b'),
  ('vts_runner', '*', '*', '*', '*', 'setup_hash_tolerance',               '0.001'::jsonb,   'b72-step3-commit-b'),
  ('vts_runner', '*', '*', '*', '*', 'setup_hash_expiry_ms',               '1800000'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: vts_service — calibration trigger interval
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('vts_service', '*', '*', '*', '*', 'calibration_trigger_interval_trades', '10'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: paper_execution — monitoring + RTB promotion intervals
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('paper_execution', '*', '*', '*', '*', 'monitoring_interval_ms',          '1500'::jsonb,  'b72-step3-commit-b'),
  ('paper_execution', '*', '*', '*', '*', 'rtb_promotion_loop_interval_ms',  '30000'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: paper_sizing — position cap buffer
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('paper_sizing', '*', '*', '*', '*', 'max_position_buffer_factor', '0.97'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: adaptive_weights — default decay rate
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('adaptive_weights', '*', '*', '*', '*', 'default_decay_rate', '0.05'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: regime_age — Path A momentum threshold
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_age', '*', '*', '*', '*', 'momentum_floor_path_a', '0.003'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: directional_integrity — DI to pWin scaling factor
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('directional_integrity', '*', '*', '*', '*', 'di_pwin_factor', '200'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: correlation_matrix — risk index decay + threshold
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('correlation_matrix', '*', '*', '*', '*', 'correlation_decay_rate', '0.05'::jsonb, 'b72-step3-commit-b'),
  ('correlation_matrix', '*', '*', '*', '*', 'correlation_threshold',  '0.8'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: learning_governance — TRANSITION-regime min batch size
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('learning_governance', '*', '*', '*', 'TRANSITION', 'min_batch_size', '5'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 2 — MEDIUM-risk position sizing + risk concentration
-- ═══════════════════════════════════════════════════════════════════════════

-- Module: position_sizing — Dynamic Sizing Engine 11 levers
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('position_sizing', '*', '*', '*', '*', 'min_size_multiplier',      '0.3'::jsonb,   'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'max_size_multiplier',      '1.2'::jsonb,   'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'base_edge',                '0.05'::jsonb,  'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'edge_sensitivity',         '4'::jsonb,     'b72-step3-commit-b'),  -- HIGH risk: 4x compounding
  ('position_sizing', '*', '*', '*', '*', 'vol_threshold',            '0.02'::jsonb,  'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'vol_penalty_floor',        '0.7'::jsonb,   'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'cost_threshold',           '0.001'::jsonb, 'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'cost_penalty_floor',       '0.6'::jsonb,   'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'confidence_base',          '0.5'::jsonb,   'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'default_risk_pct',         '2'::jsonb,     'b72-step3-commit-b'),
  ('position_sizing', '*', '*', '*', '*', 'cost_pressure_dampening',  '0.2'::jsonb,   'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: concentration_risk — Directive 9.4 covariance guards
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('concentration_risk', '*', '*', '*', '*', 'correlation_threshold',    '0.75'::jsonb, 'b72-step3-commit-b'),
  ('concentration_risk', '*', '*', '*', '*', 'max_concentration_score',  '2.5'::jsonb,  'b72-step3-commit-b'),
  ('concentration_risk', '*', '*', '*', '*', 'min_scaling_factor',       '0.25'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: guardrail_defaults — fallbacks when guardrails_v2 row missing
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('guardrail_defaults', '*', '*', '*', '*', 'default_max_total_exposure_pct', '0.25'::jsonb, 'b72-step3-commit-b'),
  ('guardrail_defaults', '*', '*', '*', '*', 'max_open_trades_default',        '5'::jsonb,    'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 3 — MEDIUM-risk per-regime ROI gating + governance modes
-- ═══════════════════════════════════════════════════════════════════════════

-- Module: roi_gating — per-regime profitability thresholds
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('roi_gating', '*', '*', '*', 'TREND_FRIENDLY_STABLE',     'min_roi', '0.0125'::jsonb, 'b72-step3-commit-b'),
  ('roi_gating', '*', '*', '*', 'HIGH_VOLATILITY_UNSTABLE',  'min_roi', '0.0250'::jsonb, 'b72-step3-commit-b'),
  ('roi_gating', '*', '*', '*', 'RANGE_BOUND_STABLE',        'min_roi', '0.0175'::jsonb, 'b72-step3-commit-b'),
  ('roi_gating', '*', '*', '*', 'IMPULSE_EXPANSION',         'min_roi', '0.0300'::jsonb, 'b72-step3-commit-b'),
  ('roi_gating', '*', '*', '*', 'STRUCTURAL_TRANSITION',     'min_roi', '0.0200'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: expectancy_gates — adaptive ROI flex bounds + friction safety
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('expectancy_gates', '*', '*', '*', '*', 'roi_flex_multiplier',    '0.6'::jsonb,  'b72-step3-commit-b'),
  ('expectancy_gates', '*', '*', '*', '*', 'roi_absolute_min',       '0.010'::jsonb,'b72-step3-commit-b'),
  ('expectancy_gates', '*', '*', '*', '*', 'roi_absolute_max',       '0.040'::jsonb,'b72-step3-commit-b'),
  ('expectancy_gates', '*', '*', '*', '*', 'friction_safety_buffer', '1.1'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: governance_modes — per-mode confidence floors
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('governance_modes', '*', '*', '*', '*', 'conservative_mode_confidence_floor', '0.60'::jsonb, 'b72-step3-commit-b'),
  ('governance_modes', '*', '*', '*', '*', 'moderate_mode_confidence_floor',     '0.70'::jsonb, 'b72-step3-commit-b'),
  ('governance_modes', '*', '*', '*', '*', 'aggressive_mode_confidence_floor',   '0.80'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 4 — Pattern pool + drift detector + goal alignment + exec validator
-- ═══════════════════════════════════════════════════════════════════════════

-- Module: pattern_pool_gates — pattern-pool entry gates (asset-class scoped)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('pattern_pool_gates', '*', 'crypto_spot', '*', '*', 'pattern_rsi_min',          '15'::jsonb,   'b72-step3-commit-b'),
  ('pattern_pool_gates', '*', 'crypto_spot', '*', '*', 'pattern_rsi_max',          '85'::jsonb,   'b72-step3-commit-b'),
  ('pattern_pool_gates', '*', 'crypto_spot', '*', '*', 'pattern_final_score_min',  '0.45'::jsonb, 'b72-step3-commit-b'),
  ('pattern_pool_gates', '*', 'crypto_spot', '*', '*', 'pattern_max_position_pct', '0.15'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: drift_detector — drift score boundaries
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('drift_detector', '*', '*', '*', '*', 'drift_aligned_boundary',  '0.5'::jsonb, 'b72-step3-commit-b'),
  ('drift_detector', '*', '*', '*', '*', 'drift_minor_boundary',    '0.8'::jsonb, 'b72-step3-commit-b'),
  ('drift_detector', '*', '*', '*', '*', 'drift_moderate_boundary', '1.5'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: goal_alignment — pre-execution validator scoring (HIGH-risk atomic)
-- Four weights compose the alignmentScore in calculateGoalAlignmentScore().
-- Migrate as block; integration coverage advised before tuning individual weights.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('goal_alignment', '*', '*', '*', '*', 'goal_alignment_min_percent',           '75'::jsonb,  'b72-step3-commit-b'),
  ('goal_alignment', '*', '*', '*', '*', 'high_risk_reward_threshold',           '2.0'::jsonb, 'b72-step3-commit-b'),
  ('goal_alignment', '*', '*', '*', '*', 'alignment_score_weight_hi_rr_profit',  '0.4'::jsonb, 'b72-step3-commit-b'),  -- HIGH risk: atomic block
  ('goal_alignment', '*', '*', '*', '*', 'alignment_score_weight_lo_rr_profit',  '0.2'::jsonb, 'b72-step3-commit-b'),
  ('goal_alignment', '*', '*', '*', '*', 'alignment_score_weight_consistency_a', '0.3'::jsonb, 'b72-step3-commit-b'),
  ('goal_alignment', '*', '*', '*', '*', 'alignment_score_weight_consistency_b', '0.3'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Module: strategy_profiles — per-strategy risk/consistency weighting
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy_profiles', '*', '*', 'morning_star',       '*', 'risk_profile_risk',        '0.6'::jsonb, 'b72-step3-commit-b'),
  ('strategy_profiles', '*', '*', 'morning_star',       '*', 'risk_profile_consistency', '0.6'::jsonb, 'b72-step3-commit-b'),
  ('strategy_profiles', '*', '*', 'inside_bar_reversal','*', 'risk_profile_risk',        '0.5'::jsonb, 'b72-step3-commit-b'),
  ('strategy_profiles', '*', '*', 'inside_bar_reversal','*', 'risk_profile_consistency', '0.7'::jsonb, 'b72-step3-commit-b'),
  ('strategy_profiles', '*', '*', 'strong_bull_trend',  '*', 'risk_profile_risk',        '0.7'::jsonb, 'b72-step3-commit-b'),
  ('strategy_profiles', '*', '*', 'strong_bull_trend',  '*', 'risk_profile_consistency', '0.5'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 5 — Trailing exit (TEC) — partially in DB already; finalize set
-- ═══════════════════════════════════════════════════════════════════════════

-- Module: trailing_exit — TEC config (asset-class scoped)
-- Some keys already present from B65 — ON CONFLICT DO NOTHING preserves them.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'break_even_trigger_r',                 '1.0'::jsonb,    'b72-step3-commit-b'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'target_lock_r',                        '1.5'::jsonb,    'b72-step3-commit-b'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'trail_distance_atr_multiplier',        '1.0'::jsonb,    'b72-step3-commit-b'),
  ('trailing_exit', '*', '*',           '*', '*', 'moonbag_max_duration_ms',              '14400000'::jsonb,'b72-step3-commit-b'),
  ('trailing_exit', '*', 'crypto_spot', '*', '*', 'rung_floor_slippage_buffer_multiplier','1.0'::jsonb,    'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 6 — Per-strategy modules (93 levers across 9 strategy files)
-- One module per strategy, all of that strategy's promotable levers under it.
-- Read in bulk via getCachedNumbersForModule('strategy.<key>', key).
-- ═══════════════════════════════════════════════════════════════════════════

-- strategy.strong_bull_trend (10 levers; DBS_MIN already migrated in dbs-routing-guards)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'donchian_lookback_bars',          '6'::jsonb,    'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'breakout_buffer_atr_mult',        '0.15'::jsonb, 'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'anti_exhaustion_atr_mult',        '1.5'::jsonb,  'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'stop_loss_atr_multiplier',        '3.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'target_exit_atr_multiplier',      '6.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'base_confidence_score',           '0.70'::jsonb, 'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'max_confidence_ceiling',          '0.95'::jsonb, 'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'min_confidence_floor',            '0.60'::jsonb, 'b72-step3-commit-b'),
  ('strategy.strong_bull_trend', '*', '*', 'strong_bull_trend', '*', 'dbs_magnitude_confidence_weight', '0.25'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.adaptive_flow (13 levers; STOP_BUFFER kept hardcoded as structural)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'momentum_inversion_lookback_bars',         '20'::jsonb,   'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'min_momentum_inversions',                  '3'::jsonb,    'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'volatility_percentile_window_bars',        '50'::jsonb,   'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'min_volatility_percentile',                '60'::jsonb,   'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'volume_threshold_multiplier',              '1.3'::jsonb,  'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'max_adx_trending_threshold',               '30'::jsonb,   'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'stop_loss_atr_multiplier',                 '1.5'::jsonb,  'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'target_exit_atr_multiplier',               '3.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'pattern_strength_confidence_weight',       '0.35'::jsonb, 'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'inversion_count_confidence_rate',          '0.05'::jsonb, 'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'inversion_confidence_bonus_max',           '0.20'::jsonb, 'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'volatility_percentile_confidence_weight',  '0.25'::jsonb, 'b72-step3-commit-b'),
  ('strategy.adaptive_flow', '*', '*', 'adaptive_flow', '*', 'high_volume_confidence_bonus',             '0.08'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.volatility_edge (12 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'a_point_volume_threshold_multiplier',      '1.3'::jsonb, 'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'min_volatility_percentile',                '70'::jsonb,  'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'breakout_volume_threshold_multiplier',     '1.3'::jsonb, 'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'measured_move_retracement_ratio',          '0.85'::jsonb,'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'target_exit_atr_multiplier',               '2.5'::jsonb, 'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'base_confidence_score',                    '0.40'::jsonb,'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'volatility_percentile_confidence_weight',  '0.20'::jsonb,'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'fibonacci_quality_confidence_weight',      '0.20'::jsonb,'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'a_point_volume_confidence_rate',           '0.05'::jsonb,'b72-step3-commit-b'),
  ('strategy.volatility_edge', '*', '*', 'volatility_edge', '*', 'volume_confidence_bonus_max',              '0.15'::jsonb,'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.defensive_hedge (13 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'correlation_lookback_bars',               '30'::jsonb,   'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'volatility_lookback_bars',                '20'::jsonb,   'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'max_btc_correlation_threshold',           '0.45'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'min_idiosyncratic_volatility_offset',     '0.10'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'volume_threshold_multiplier',             '1.3'::jsonb,  'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'target_exit_atr_multiplier',              '1.8'::jsonb,  'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'pattern_strength_confidence_weight',      '0.45'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'correlation_offset_confidence_weight',    '0.25'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'volatility_offset_confidence_rate',       '0.15'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'volume_confidence_bonus_max',             '0.15'::jsonb, 'b72-step3-commit-b'),
  ('strategy.defensive_hedge', '*', '*', 'defensive_hedge', '*', 'strong_engulfing_pattern_bonus',          '0.08'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.inside_bar_reversal (18 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'max_compression_ratio',                  '0.85'::jsonb, 'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'volume_threshold_multiplier',            '1.3'::jsonb,  'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'target_exit_atr_multiplier',             '2.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'compression_quality_confidence_weight',  '0.35'::jsonb, 'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'pattern_strength_confidence_weight',     '0.45'::jsonb, 'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'volume_confidence_rate',                 '0.10'::jsonb, 'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'volume_confidence_bonus_max',            '0.20'::jsonb, 'b72-step3-commit-b'),
  ('strategy.inside_bar_reversal', '*', '*', 'inside_bar_reversal', '*', 'sell_rsi_min_threshold',                 '45'::jsonb,   'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.morning_star (12 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'min_pattern_strength',                  '0.55'::jsonb, 'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'volume_threshold_multiplier',           '1.2'::jsonb,  'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'target_exit_atr_multiplier',            '2.5'::jsonb,  'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'pattern_strength_confidence_weight',    '0.80'::jsonb, 'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'high_volume_confidence_bonus',          '0.08'::jsonb, 'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'gap_presence_confidence_bonus',         '0.07'::jsonb, 'b72-step3-commit-b'),
  ('strategy.morning_star', '*', '*', 'morning_star', '*', 'recovery_ratio_confidence_bonus_max',   '0.05'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.pivot_shift (11 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'rsi_neutral_zone_low',               '35'::jsonb,   'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'rsi_neutral_zone_high',              '65'::jsonb,   'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'min_adx_slope_per_period',           '0.5'::jsonb,  'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'volume_threshold_multiplier',        '1.3'::jsonb,  'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'stop_loss_atr_multiplier',           '1.5'::jsonb,  'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'target_exit_atr_multiplier',         '3.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'pattern_strength_confidence_weight', '0.40'::jsonb, 'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'rsi_neutrality_confidence_weight',   '0.25'::jsonb, 'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'adx_slope_confidence_rate',          '0.05'::jsonb, 'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'adx_slope_confidence_bonus_max',     '0.20'::jsonb, 'b72-step3-commit-b'),
  ('strategy.pivot_shift', '*', '*', 'pivot_shift', '*', 'high_volume_confidence_bonus',       '0.08'::jsonb, 'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.reverse_impulse (10 levers; DBS guards in dbs-routing-guards module)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'min_pattern_strength',                  '0.58'::jsonb,  'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'momentum_threshold_negative',           '-0.01'::jsonb, 'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'momentum_lookback_bars',                '5'::jsonb,     'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'volume_threshold_multiplier',           '1.2'::jsonb,   'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'max_rsi_oversold_threshold',            '40'::jsonb,    'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'target_exit_atr_multiplier',            '2.0'::jsonb,   'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'pattern_strength_confidence_weight',    '0.40'::jsonb,  'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'momentum_exhaustion_confidence_rate',   '10.0'::jsonb,  'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'momentum_confidence_bonus_max',         '0.20'::jsonb,  'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'rsi_oversold_confidence_weight',        '0.25'::jsonb,  'b72-step3-commit-b'),
  ('strategy.reverse_impulse', '*', '*', 'reverse_impulse', '*', 'extreme_volume_confidence_bonus',       '0.10'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- strategy.support_bounce (13 levers)
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'support_level_lookback_bars',            '50'::jsonb,    'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'support_cluster_tolerance_base',         '0.007'::jsonb, 'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'min_support_touches_required',           '2'::jsonb,     'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'max_support_distance_from_price',        '0.03'::jsonb,  'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'min_support_proximity_required',         '0.035'::jsonb, 'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'volume_threshold_multiplier',            '1.2'::jsonb,   'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'target_exit_atr_multiplier',             '2.0'::jsonb,   'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'pattern_strength_confidence_weight',     '0.40'::jsonb,  'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'support_quality_confidence_weight',      '0.30'::jsonb,  'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'proximity_confidence_weight',            '0.15'::jsonb,  'b72-step3-commit-b'),
  ('strategy.support_bounce', '*', '*', 'support_bounce', '*', 'high_volume_confidence_bonus',           '0.08'::jsonb,  'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 7 — HIGH-risk: SQE primary admission gates
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Precedence at runtime (Langston cc-inbox #906):
--   screener_filters row  →  module_constants fallback (these rows)  →  source last-resort
--
-- These rows seed the FALLBACK layer. Production reads still consult
-- screener_filters first via getSQEThresholdsFromConfig(). Migration here
-- ensures the fallback path resolves cleanly when screener_filters is empty.

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('sqe_config', '*', '*', '*', '*', 'min_final_score',    '0.35'::jsonb, 'b72-step3-commit-b'),  -- HIGH risk: primary gate
  ('sqe_config', '*', '*', '*', '*', 'min_regime_weight',  '0.30'::jsonb, 'b72-step3-commit-b')   -- HIGH risk: primary gate
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ═══════════════════════════════════════════════════════════════════════════
-- SECTION 8 — HIGH-risk: market_regime DEFAULT_REGIME_CONFIG
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Some fields already DB-loaded (b68_5_path_b_momentum_min, b67_5_post_
-- composition_floor — present from B70.3 / B70.3b). This section seeds the
-- REMAINING hardcoded fields. ON CONFLICT DO NOTHING preserves existing rows.
-- See LEVER_INVENTORY.md §11.1 for the migration-state enumeration that
-- drives these specific entries.

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('market_regime', '*', '*', '*', '*', 'tfs_desat_min',           '0.50'::jsonb,  'b72-step3-commit-b'),
  ('market_regime', '*', '*', '*', '*', 'tfs_desat_max',           '0.90'::jsonb,  'b72-step3-commit-b'),
  ('market_regime', '*', '*', '*', '*', 'tfs_momentum_scale',      '0.020'::jsonb, 'b72-step3-commit-b'),
  ('market_regime', '*', '*', '*', '*', 'tfs_volatility_scale',    '0.025'::jsonb, 'b72-step3-commit-b'),
  ('market_regime', '*', '*', '*', '*', 'tfs_dbs_scale',           '0.7'::jsonb,   'b72-step3-commit-b')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

-- ═══════════════════════════════════════════════════════════════════════════
-- Verification (run after migration to confirm seeded counts):
--
--   SELECT module_name, COUNT(*) AS rows
--   FROM module_constants
--   WHERE updated_by = 'b72-step3-commit-b'
--   GROUP BY module_name
--   ORDER BY module_name;
-- ═══════════════════════════════════════════════════════════════════════════
