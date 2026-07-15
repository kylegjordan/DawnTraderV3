-- P19-B8.5 (soak fix C) — exit-integrity knobs + the evidence-keyed anneal re-timing.
-- Langston-signed design (Discord, 2026-07-15): the fallback-price sanity gate, the
-- #509 post-stop re-entry cooldown, and anneal_step_trades keyed to INFORMATIVE closes.
--
-- exit_integrity.max_fallback_deviation_pct: a NON-Kraken price source deviating more
-- than this fraction from the position's last mark in one tick is not actionable — the
-- exit monitor invokes the Kraken REST arbiter or skips the tick. 0.10 (10%) is
-- deliberately loose: genuine one-tick crypto moves run low single digits; the incident
-- this guards against was a 36% ghost-market jump.
-- exit_integrity.post_stop_reentry_cooldown_minutes: per-(symbol,strategy) queue-time
-- block after a stop_hit close (#509 — a stop-out is evidence AGAINST the thesis).
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  ('exit_integrity', '*', 'crypto_spot', '*', '*', 'max_fallback_deviation_pct',        '0.10', 'p19-b8-5-exit-integrity'),
  ('exit_integrity', '*', 'xstock_spot', '*', '*', 'max_fallback_deviation_pct',        '0.10', 'p19-b8-5-exit-integrity'),
  ('exit_integrity', '*', 'crypto_spot', '*', '*', 'post_stop_reentry_cooldown_minutes', '60',  'p19-b8-5-exit-integrity'),
  ('exit_integrity', '*', 'xstock_spot', '*', '*', 'post_stop_reentry_cooldown_minutes', '60',  'p19-b8-5-exit-integrity')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Anneal re-timing (Langston-signed derivation, 2026-07-15): step 50 -> 60, now counted
-- on INFORMATIVE closes only (never_filled excluded in code, the two-denominator split).
-- 4 steps x 60 = 240 informative closes to full anneal — sized to the ~250-attempt
-- Wilson-CI sufficiency for pFill; the CALENDAR is an output of measured fill reality
-- (~9.6 days at the pessimistic 50% fill share at budget 50/day; faster if fills come
-- easier, which is correct — the evidence arrived sooner). Not a date target.
UPDATE module_constants
SET value = '60', updated_by = 'p19-b8-5-exit-integrity'
WHERE module_name = 'exploration_lane' AND constant_name = 'anneal_step_trades'
  AND asset_class IN ('crypto_spot', 'xstock_spot');
