-- P19-B8.5 xstock marks (Langston design-APPROVED 2026-07-16, condition 1: the
-- staleness guard is BLOCKING and class-EXPLICIT — no wildcard row). The exit
-- monitor's xstock venue leg reads the equities-feed latest tick; a tick older
-- than this yields NO price (skip + escalation rail) — a stop must never fire
-- on a stale mark (nights/weekends/halts the equities feed goes quiet).
-- 90s: RTH tick cadence is seconds-scale; 90s tolerates thin names without
-- admitting closed-market staleness. Tunable per ADJUSTMENT_FRAMEWORK.
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('exit_integrity', '*', 'xstock_spot', '*', '*', 'max_equity_tick_age_ms', '90000', 'p19-b8-5-equity-tick-age')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;
