-- B72.2 — In-class quant strategy lever sweep (129 rows across 9 strategies)
--
-- Closes the gap left by B72 main: B72 migrated only the 9 file-based
-- strategies in `server/strategies/`; the 9 in-class quant strategies whose
-- detect* methods live in `server/services/strategy-engine.ts` were missed.
-- Their hardcoded literals (entry/stop/target geometry, admission gates,
-- confidence weights, etc.) become DB-tunable here.
--
-- Strategies covered: vwap_pullback, abcd_long, sma_trend_ride, breakout,
-- mean_reversion, range_trade, vwap_bounce, liquidity_trap, dhma.
--
-- Discrepancy resolution (Langston cc-inbox #914): vts-runner.ts values
-- are canonical for breakout.volume_multiplier (1.5), mean_reversion.
-- deviation_threshold_atr_mult (1.5/2.0), range_trade triplet (7/2/1).
--
-- Scope: GLOBAL per-strategy (*, *, <key>, *) for all rows.
-- Risk: 57 HIGH / 58 MED / 14 LOW.
-- Idempotent: ON CONFLICT DO NOTHING.

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- §F.1 vwap_pullback (16 rows)
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'counter_trend_long_dbs_floor',     '-0.35'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'pullback_threshold_pct_default',   '3.0'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'volume_multiplier_default',        '1.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'max_holding_period_bars_default',  '24'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'volume_confirm_min_history',       '10'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'volume_avg_lookback',              '20'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'atr_fallback_daily_range_frac',    '0.10'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'entry_atr_premium',                '0.10'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'stop_atr_mult_vwap',               '0.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'stop_atr_mult_low24h',             '0.10'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'target_atr_offset_high24h',        '0.25'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'target_r_multiple_default',        '2'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'base_confidence',                  '0.7'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'reversal_confidence_bonus',        '0.2'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'bullish_reversal_near_vwap_atr',   '2.0'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_pullback', '*', '*', 'vwap_pullback', '*', 'bullish_reversal_above_low_atr',   '0.5'::jsonb,   'b72-2-lever-sweep'),

  -- §F.2 abcd_long (12 rows)
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'min_consolidation_bars_default',  '10'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'breakout_threshold_pct_default',  '1.5'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'volume_multiplier_default',       '1.5'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'exit_type_default',               '"target"'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'target_percent_default',          '3.0'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'trailing_stop_pct_default',       '2.0'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'a_point_search_window',           '10'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'b_point_search_start',            '5'::jsonb,         'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'b_point_search_end',              '15'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'entry_atr_buffer',                '0.3'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'stop_atr_buffer',                 '0.5'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'trailing_target_r_multiple',      '2'::jsonb,         'b72-2-lever-sweep'),
  ('strategy.abcd_long', '*', '*', 'abcd_long', '*', 'base_confidence',                 '0.75'::jsonb,      'b72-2-lever-sweep'),

  -- §F.3 sma_trend_ride (12 rows)
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'counter_trend_long_dbs_floor', '-0.35'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'entry_condition_default',      '"above"'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'exit_condition_default',       '"break"'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'trailing_stop_pct_default',    '2.0'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'sma_length_default',           '20'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'min_history_bars',             '10'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'entry_premium_mult',           '1.002'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'swing_low_stop_mult',          '0.998'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'sma_stop_mult',                '0.995'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'trailing_strength_factor',     '0.03'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'break_target_r_multiple',      '2'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.sma_trend_ride', '*', '*', 'sma_trend_ride', '*', 'base_confidence',              '0.65'::jsonb,     'b72-2-lever-sweep'),

  -- §F.4 breakout (13 rows) — volume_multiplier=1.5 canonical (vts-runner)
  ('strategy.breakout', '*', '*', 'breakout', '*', 'min_consolidation_bars',     '10'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'breakout_buffer_pct',        '1'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'volume_multiplier',          '1.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'max_holding_hours',          '12'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'max_range_width_floor_pct',  '7'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'max_range_width_atr_mult',   '5.0'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'touch_tolerance_atr_divisor','4'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'touch_tolerance_fallback',   '0.003'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'min_boundary_touches',       '2'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'volume_avg_lookback',        '10'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'entry_premium_mult',         '1.002'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'stop_below_low_mult',        '0.998'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.breakout', '*', '*', 'breakout', '*', 'base_confidence',            '0.75'::jsonb,  'b72-2-lever-sweep'),

  -- §F.5 mean_reversion (13 rows) — deviation values from detector body (0.03 floor, 1.5 mult)
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'mean_type_default',           '"vwap"'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'sma_length_default',          '20'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'deviation_threshold_floor',   '0.03'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'deviation_threshold_atr_mult','1.5'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'partial_exit_percent',        '50'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'stop_loss_buffer_pct',        '1'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'min_history_bars',            '20'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'midpoint_range_min_bars',     '10'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'midpoint_range_max_pct',      '8'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'midpoint_range_min_touches',  '2'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'entry_premium_mult',          '1.001'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'target_below_mean_mult',      '0.998'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.mean_reversion', '*', '*', 'mean_reversion', '*', 'base_confidence',             '0.7'::jsonb,    'b72-2-lever-sweep'),

  -- §F.6 range_trade (15 rows) — canonical name strategy.range_trade per cc-inbox #914
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'min_range_duration_hours',  '7'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'min_boundary_touches',      '1'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'entry_zone_width_pct',      '1.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'stop_loss_beyond_pct',      '1'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'min_history_bars',          '30'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'min_range_width_floor',     '0.015'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'min_range_width_atr_mult',  '2.0'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'touch_tolerance_atr_divisor','4'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'range_detection_max_width', '20'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'entry_zone_bottom_frac',    '0.25'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'entry_zone_cap_frac',       '0.4'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'entry_atr_premium',         '0.1'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'stop_atr_below_low',        '0.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'target_atr_below_high',     '0.25'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.range_trade', '*', '*', 'range_trade', '*', 'base_confidence',           '0.72'::jsonb,  'b72-2-lever-sweep'),

  -- §F.7 vwap_bounce (11 rows)
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'vwap_proximity_pct',  '1.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'min_vwap_slope_pct',  '0.3'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'volume_multiplier',   '1.3'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'max_pullback_bars',   '5'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'partial_exit_r',      '1.5'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'min_history_bars',    '20'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'vwap_slope_lookback', '10'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'entry_premium_mult',  '1.001'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'stop_below_vwap_mult','0.997'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'target_r_multiple',   '2'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.vwap_bounce', '*', '*', 'vwap_bounce', '*', 'base_confidence',     '0.73'::jsonb,  'b72-2-lever-sweep'),

  -- §F.8 liquidity_trap (13 rows) — operationally disabled; rows seeded for re-enablement readiness
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'max_trap_extension_pct',     '1.2'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'trap_return_bars',           '2'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'min_stop_zone_size',         '"medium"'::jsonb, 'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'min_level_touches',          '2'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'volume_ratio',               '1.5'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'min_history_bars',           '30'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'range_detection_max_pct',    '5'::jsonb,        'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'range_detection_min_bars',   '10'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'stop_zone_lookback',         '20'::jsonb,       'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'entry_on_return_mult',       '0.999'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'stop_above_trap_mult',       '1.005'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'target_range_low_mult',      '1.002'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.liquidity_trap', '*', '*', 'liquidity_trap', '*', 'base_confidence',            '0.68'::jsonb,     'b72-2-lever-sweep'),

  -- §F.9 dhma (24 rows)
  ('strategy.dhma', '*', '*', 'dhma', '*', 'theta_obi',                       '0.3'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'epsilon_micro',                   '0.2'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'tau_toxicity',                    '0.7'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'max_spread_ticks',                '5'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'k_tp',                            '1.5'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'n_flow',                          '50'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'n_burst',                         '10'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'window_session',                  '20'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'obi_lookback_bars',               '5'::jsonb,      'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'microprice_tilt_norm',            '10'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'recent_vol_lookback',             '10'::jsonb,     'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'burst_return_threshold',          '0.01'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'session_slope_threshold',         '0.02'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'signed_flow_long_threshold',      '0.2'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'signed_flow_short_threshold',     '-0.2'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'entry_premium_mult',              '1.001'::jsonb,  'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'base_confidence',                 '0.6'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'confidence_weight_obi',           '0.15'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'confidence_weight_flow',          '0.1'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'confidence_penalty_toxicity',     '0.15'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'confidence_floor',                '0.3'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'confidence_ceiling',              '0.9'::jsonb,    'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'mtf_confidence_adjustment',       '0.10'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'post_mtf_confidence_ceiling',     '0.95'::jsonb,   'b72-2-lever-sweep'),
  ('strategy.dhma', '*', '*', 'dhma', '*', 'valid_confidence_threshold',      '0.5'::jsonb,    'b72-2-lever-sweep')

ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;
