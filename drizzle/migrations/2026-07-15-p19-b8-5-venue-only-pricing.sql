-- P19-B8.5 (venue-only actionable pricing — Kyle structural cut B, Langston-endorsed).
-- The exit monitor's actionable chain is now kraken_ws -> kraken_rest -> skip-this-tick;
-- non-venue sources are structurally unreachable, so the C prong-2 deviation knob is
-- RETIRED with the gate it parameterized (rule 18 — no lingering dead knobs). The
-- module keeps the #509 cooldown and gains the skip-escalation threshold (Langston
-- condition 1): N consecutive no-venue-price exit ticks on an open position raises a
-- system alert. 40 ticks ~= one minute at the monitor cadence.
DELETE FROM module_constants
WHERE module_name = 'exit_integrity' AND constant_name = 'max_fallback_deviation_pct';

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('exit_integrity', '*', 'crypto_spot', '*', '*', 'max_consecutive_price_skips', '40', 'p19-b8-5-venue-only'),
  ('exit_integrity', '*', 'xstock_spot', '*', '*', 'max_consecutive_price_skips', '40', 'p19-b8-5-venue-only')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
