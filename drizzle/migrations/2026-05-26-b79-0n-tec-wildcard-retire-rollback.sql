-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.TEC Migration 2 — ROLLBACK (re-introduces wildcard rows)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Re-inserts the 11 wildcard rows that 2026-05-26-b79-0n-tec-wildcard-retire.sql
-- removed. Values reflect the LAST KNOWN wildcard state (probed live 2026-05-25
-- evening pre-batch). The `moonbag_qualifying_strategies = []` represents Kyle's
-- 2026-05-05 directive state; restoring that value preserves variant-K alignment.
--
-- Manual-only; not auto-run by deploy. Use ONLY if the per-class resolver
-- chain proves broken post-deploy and the wildcard safety-net needs restoration.

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('trailing_exit', '*', '*', '*', '*', 'break_even_enabled',                    'false'::jsonb,                                                          'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'break_even_trigger_r',                  '1.0'::jsonb,                                                            'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'target_lock_r',                         '1.5'::jsonb,                                                            'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'trail_distance_atr_multiplier',         '1.0'::jsonb,                                                            'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'rung_floor_slippage_buffer_multiplier', '1.0'::jsonb,                                                            'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'persistence_debounce_ms',               '5000'::jsonb,                                                           'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_strategies',         '[]'::jsonb,                                                             'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_qualifying_source_pools',       '{"vwap_pullback":["quant-strong_trend"]}'::jsonb,                       'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_max_duration_ms',               '14400000'::jsonb,                                                       'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_cap_mode',                      '"reserved_slots"'::jsonb,                                               'B79.0n.TEC-rollback'),
  ('trailing_exit', '*', '*', '*', '*', 'moonbag_reserved_slots',                '1'::jsonb,                                                              'B79.0n.TEC-rollback')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
