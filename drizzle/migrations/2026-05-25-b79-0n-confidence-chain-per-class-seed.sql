-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.CONFIDENCE-CHAIN — Per-class seed for 9 modulator modules
-- ════════════════════════════════════════════════════════════════════════════
--
-- Sub-batch 7 of 18 in the B79.0n umbrella v4 arc.
--
-- Seeds xstock_spot rows for the confidence-modulator chain so MCE per-class
-- refresh can resolve every modulator config per asset class. Without these
-- rows, the per-class accessors in market-context-engine.ts will throw hard
-- with [B79.0n.CONFIDENCE-CHAIN][missing-class] errors on first xstock signal
-- evaluation.
--
-- Per Langston Step 2 ACK with 4 non-blocking clarifications:
--   - D-1 (macro xstock NO-OP): modifier_min = modifier_max = 1.0 +
--     new constant `b67_1_asset_class_no_op_active` (xstock=true, crypto=false)
--   - D-2 (pair correlation): xstock reference = 'SPY/USD' (confirmed via
--     xstock_spot_universe probe 2026-05-25 — NOT 'SPYx/USD'); new constant
--     `b68_3_compute_correlation_enabled` (xstock=false, crypto=true)
--   - D-3 (phase weights): new JSONB blob `b67_2_strategy_phase_weights`
--     row for xstock_spot with 27 cells (9 enabled strategies × 3 phases)
--     all at neutral 1.0
--   - D-4 (outcome-feedback): no DB change (key-shape migration is code-side
--     in Chunk 5); legacy-as-crypto migration handled at boot
--   - D-5 (per-class enumeration): no DB change; canonical ASSET_CLASSES const
--     drives MCE refresh enumeration
--
-- xstock-enabled strategies (per strategy_gates.xstock_spot.*.enabled=true
-- DB probe 2026-05-25 — exactly 9 strategies):
--   1. breakout, 2. inside_bar_reversal, 3. mean_reversion, 4. morning_star,
--   5. pivot_shift, 6. range_trade, 7. sma_trend_ride, 8. vwap_bounce,
--   9. vwap_pullback
--
-- Atomic BEGIN/COMMIT. Idempotent via ON CONFLICT DO NOTHING. Re-running this
-- migration is safe.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ─── Group 1: macro_modifier xstock_spot — D-1 PER-CLASS NO-OP ───────────────
-- Clone crypto values EXCEPT modifier_min = modifier_max = 1.0 (clamp identity).
-- New constant b67_1_asset_class_no_op_active = true forces function-level
-- short-circuit at runtime.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_btc_dominance_weight',          '0.40'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_btc_dominance_zscore_lookback_days', '30'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_external_feed_cache_seconds',   '60'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_external_feed_stale_seconds',   '300'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_funding_btc_weight',            '0.60'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_funding_eth_weight',            '0.40'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_funding_weight',                '0.35'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_funding_zscore_lookback_days',  '30'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_mcap_momentum_weight',          '0.25'::jsonb, 'b79.0n.confidence-chain-seed'),
  -- CRITICAL: modifier_min = modifier_max = 1.0 clamps the output to identity (1.0) regardless of inputs
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_modifier_max',                  '1.0'::jsonb,  'b79.0n.confidence-chain-seed_xstock_NO_OP'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_modifier_min',                  '1.0'::jsonb,  'b79.0n.confidence-chain-seed_xstock_NO_OP'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_zscore_min_sample_count',       '48'::jsonb, 'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- NEW constant: asset_class_no_op_active flag — function reads this and short-circuits
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('macro_modifier', '*', '*',           '*', '*', 'b67_1_asset_class_no_op_active', 'false'::jsonb, 'b79.0n.confidence-chain-seed_crypto_active'),
  ('macro_modifier', '*', 'xstock_spot', '*', '*', 'b67_1_asset_class_no_op_active', 'true'::jsonb,  'b79.0n.confidence-chain-seed_xstock_NO_OP')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 2: regime_phase xstock_spot — D-3 per-class JSONB blob ────────────
-- 9 xstock-enabled strategies × 3 phases = 27 cells at neutral 1.0.
-- Initial calibration data: NONE (clone-from-crypto rejected per Langston
-- nuance B; xstock-specific strategy keys + neutral 1.0 + fail-hard on
-- missing-key forces seed-completeness discipline).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_phase', '*', 'xstock_spot', '*', '*', 'b67_2_early_phase_max_hours', '2.0'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('regime_phase', '*', 'xstock_spot', '*', '*', 'b67_2_prime_phase_max_hours', '12.0'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('regime_phase', '*', 'xstock_spot', '*', '*', 'b67_2_strategy_phase_weights',
    '{
      "breakout_EARLY": 1.0, "breakout_PRIME": 1.0, "breakout_LATE": 1.0,
      "inside_bar_reversal_EARLY": 1.0, "inside_bar_reversal_PRIME": 1.0, "inside_bar_reversal_LATE": 1.0,
      "mean_reversion_EARLY": 1.0, "mean_reversion_PRIME": 1.0, "mean_reversion_LATE": 1.0,
      "morning_star_EARLY": 1.0, "morning_star_PRIME": 1.0, "morning_star_LATE": 1.0,
      "pivot_shift_EARLY": 1.0, "pivot_shift_PRIME": 1.0, "pivot_shift_LATE": 1.0,
      "range_trade_EARLY": 1.0, "range_trade_PRIME": 1.0, "range_trade_LATE": 1.0,
      "sma_trend_ride_EARLY": 1.0, "sma_trend_ride_PRIME": 1.0, "sma_trend_ride_LATE": 1.0,
      "vwap_bounce_EARLY": 1.0, "vwap_bounce_PRIME": 1.0, "vwap_bounce_LATE": 1.0,
      "vwap_pullback_EARLY": 1.0, "vwap_pullback_PRIME": 1.0, "vwap_pullback_LATE": 1.0
    }'::jsonb, 'b79.0n.confidence-chain-seed_xstock_neutral_initial')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 3: regime_classifier xstock_spot — COMPLETE B79.0n.MCE partial seed ─
-- B79.0n.MCE already seeded 2 rows (b67_3_5_tfs_momentum_scale=0.010 + b67_3_5_tfs_volatility_scale=0.0125).
-- Add the missing 4 crypto-clone rows so TFS-desat math is fully resolvable per-class.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_classifier', '*', 'xstock_spot', '*', '*', 'b67_3_5_tfs_dbs_scale',           '0.7'::jsonb,   'b79.0n.confidence-chain-seed'),
  ('regime_classifier', '*', 'xstock_spot', '*', '*', 'b67_3_5_tfs_desat_max',           '0.90'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('regime_classifier', '*', 'xstock_spot', '*', '*', 'b67_3_5_tfs_desat_min',           '0.50'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('regime_classifier', '*', 'xstock_spot', '*', '*', 'b67_5_post_composition_floor',    '0.45'::jsonb,  'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 4: outcome_feedback xstock_spot — clone crypto (config-only) ──────
-- Per-class behavioral isolation handled at the store key shape (Chunk 5),
-- NOT at the config level. Config values identical across classes.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_alpha',         '0.10'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_expiry_hours',  '168'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_factor_max',    '1.05'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_factor_min',    '0.85'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_min_samples',   '5'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('outcome_feedback', '*', 'xstock_spot', '*', '*', 'b67_4_sensitivity',   '4.0'::jsonb,  'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 5: regime_age xstock_spot — clone crypto + RTH-adjusted target ────
-- target_age_hours: crypto=6.0 (24/7 trading); xstock=2.0 (6.5h RTH window — first
-- third matches "fresh entry"). Calibration follow-up may tune.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('regime_age', '*', 'xstock_spot', '*', '*', 'b68_4_max',                  '1.05'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('regime_age', '*', 'xstock_spot', '*', '*', 'b68_4_min',                  '0.92'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('regime_age', '*', 'xstock_spot', '*', '*', 'b68_4_sensitivity',          '0.10'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('regime_age', '*', 'xstock_spot', '*', '*', 'b68_4_target_age_hours',     '2.0'::jsonb,  'b79.0n.confidence-chain-seed_rth_adjusted'),
  ('regime_age', '*', 'xstock_spot', '*', '*', 'momentum_floor_path_a',      '0.0015'::jsonb, 'b79.0n.confidence-chain-seed_xstock_half_crypto')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 6: path_b_sustainability xstock_spot — COMPLETE B79.0n.MCE partial ─
-- B79.0n.MCE seeded b68_5_path_b_momentum_min=0.0005 (half crypto's 0.001).
-- Add missing b68_5_dbs_slope_min (cloned from crypto=0.0).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('path_b_sustainability', '*', 'xstock_spot', '*', '*', 'b68_5_dbs_slope_min', '0.0'::jsonb, 'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 7: volume_regime xstock_spot — clone crypto ──────────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_accumulation_threshold',     '0.40'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_distribution_threshold',     '-0.40'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_factor_max',                 '1.05'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_factor_min',                 '0.92'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_liquidation_spike_multiplier', '5.0'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_lookback_bars',              '30'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_min_samples',                '30'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('volume_regime', '*', 'xstock_spot', '*', '*', 'b68_2_sensitivity',                '0.05'::jsonb,  'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 8: pair_correlation — D-2 per-class reference + compute_enabled ───
-- xstock: SPY/USD reference (confirmed via xstock_spot_universe probe 2026-05-25);
-- compute_correlation_enabled = false until SPY-relative calibration follow-up.
-- crypto: existing XXBTZUSD reference unchanged; compute_correlation_enabled = true (new constant).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_btc_reference_symbol',      '"SPY/USD"'::jsonb, 'b79.0n.confidence-chain-seed_xstock_spy_ref'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_drifting_threshold',         '0.70'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_factor_max',                 '1.05'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_factor_min',                 '0.95'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_idiosyncratic_threshold',    '0.30'::jsonb,    'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_lookback_bars',              '30'::jsonb,      'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_min_samples',                '30'::jsonb,      'b79.0n.confidence-chain-seed'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_sensitivity',                '0.05'::jsonb,    'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- NEW constant: compute_correlation_enabled flag — function short-circuits to 1.0 + metadata when false
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('pair_correlation', '*', '*',           '*', '*', 'b68_3_compute_correlation_enabled', 'true'::jsonb,  'b79.0n.confidence-chain-seed_crypto_active'),
  ('pair_correlation', '*', 'xstock_spot', '*', '*', 'b68_3_compute_correlation_enabled', 'false'::jsonb, 'b79.0n.confidence-chain-seed_xstock_off_v1')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Group 9: multi_tf_agreement xstock_spot — clone crypto ─────────────────
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_compatible_score',          '0.5'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_confirmed_score',           '1.0'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_conflicted_score',          '0.0'::jsonb,  'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_factor_max',                '1.05'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_factor_min',                '0.92'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_higher_tf_interval_minutes', '240'::jsonb, 'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_min_higher_tf_samples',     '30'::jsonb,   'b79.0n.confidence-chain-seed'),
  ('multi_tf_agreement', '*', 'xstock_spot', '*', '*', 'b68_1_sensitivity',               '0.05'::jsonb, 'b79.0n.confidence-chain-seed')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- ─── Verification query (read-only, will appear in psql output) ──────────────
SELECT module_name, asset_class, COUNT(*) AS rows
FROM module_constants
WHERE module_name IN (
  'macro_modifier', 'regime_phase', 'regime_classifier', 'outcome_feedback',
  'regime_age', 'path_b_sustainability', 'volume_regime', 'pair_correlation',
  'multi_tf_agreement'
)
GROUP BY module_name, asset_class
ORDER BY module_name, asset_class;

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Post-migration expected row counts:
--   macro_modifier:        * = 12,  xstock_spot = 12,   + 2 new global flag rows
--   regime_phase:          * = 3,   xstock_spot = 3
--   regime_classifier:     * = 6,   xstock_spot = 6
--   outcome_feedback:      * = 6,   xstock_spot = 6
--   regime_age:            * = 5,   xstock_spot = 5
--   path_b_sustainability: * = 2,   xstock_spot = 2
--   volume_regime:         * = 8,   xstock_spot = 8
--   pair_correlation:      * = 8,   xstock_spot = 8,    + 2 new global flag rows
--   multi_tf_agreement:    * = 8,   xstock_spot = 8
--
-- New constants introduced (apply to crypto + xstock both):
--   - macro_modifier.b67_1_asset_class_no_op_active  (crypto=false, xstock=true)
--   - pair_correlation.b68_3_compute_correlation_enabled  (crypto=true, xstock=false)
--
-- ROLLBACK plan: see 2026-05-25-b79-0n-confidence-chain-per-class-seed-rollback.sql
-- ════════════════════════════════════════════════════════════════════════════
