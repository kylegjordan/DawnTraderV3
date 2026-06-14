-- P19-B4a (C3) — xStock active-fill SAFETY knobs (module_constants).
--
-- DB-governed thresholds for the active xStock fill-safety gate + the equity-feed
-- silent-stall watchdog. Per-asset-class (xstock_spot); exchange/strategy/regime
-- are wildcards. Resolved by server/asset_classes/xstock_spot/fill-safety-config.ts
-- (fail-CLOSED if absent — Langston C3 review condition 3 + CLAUDE.md rule 15).
--
-- Values derived from the Fri 2026-06-12 measurement (7.9M ticks, 485 symbols):
--   active_fill_max_age_ms        = 15000  -- max(15s floor, RTH p99 8.75s * 1.5)
--   liquid_fill_window_open_min_et =  570  -- 09:30 ET (US regular session open)
--   liquid_fill_window_close_min_et=  960  -- 16:00 ET (US regular session close)
--   stall_reconnect_ms_rth         = 75000 -- above RTH p99.9 inter-tick 28.7s w/ margin
--   stall_reconnect_ms_offrth      =750000 -- above off-RTH p99 inter-tick 192s w/ margin
--
-- Liquid-fill window is a FILL-QUALITY LIQUIDITY gate, NOT a market-hours claim:
-- xStocks trade 24/5 (CLAUDE.md rule 17), the scanner + VTS run around the clock;
-- only the moment of placing an active fill is gated to the window where the
-- underlying equity reference shows real price discovery (12-22% of snapshots move
-- a price in RTH vs 2-7% pre/after-hours). Kyle can widen via these rows.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('xstock_fill_safety', 'active_fill_max_age_ms',          '15000'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'p19-b4a-c3'),
  ('xstock_fill_safety', 'liquid_fill_window_open_min_et',  '570'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'p19-b4a-c3'),
  ('xstock_fill_safety', 'liquid_fill_window_close_min_et', '960'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'p19-b4a-c3'),
  ('xstock_fill_safety', 'stall_reconnect_ms_rth',          '75000'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'p19-b4a-c3'),
  ('xstock_fill_safety', 'stall_reconnect_ms_offrth',       '750000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b4a-c3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;
