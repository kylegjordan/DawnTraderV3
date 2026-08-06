-- B-TRADE-TIER-REGISTER (#599, 2026-08-06): the trade tables enter the move-not-delete path.
-- (1) closed_trades' FIRST retention policy: 365d hot window, archived-then-removed, never bare-deleted.
-- (2) The exploration-anneal archived tallies, SEEDED 0 per class (pre-audit 4c(1) cond 2:
--     a missing key must be a FAULT, never a silent ?? 0 — the seed is what makes the fault
--     unambiguous; the sweep and the reader both refuse on absence).
-- (3) The archive predicate's index: mirror-complement of the existing B79.0g-tx
--     WHERE closed=false partial (which serves the exact opposite predicate).
-- vts_open_trades' retention key already exists (leg 1, 2026-07-30) and is UNCHANGED —
-- the cron lane reads it as the hot window (the #1359 constant-stays ruling).

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('data_lifecycle', 'closed_trades.hot_retention_days', '365'::jsonb, '*', '*', '*', '*', NOW(), 'b-trade-tier-register'),
  ('exploration_lane', 'closed_count_archived.crypto_spot', '0'::jsonb, '*', '*', '*', '*', NOW(), 'b-trade-tier-register'),
  ('exploration_lane', 'closed_count_archived.xstock_spot', '0'::jsonb, '*', '*', '*', '*', NOW(), 'b-trade-tier-register')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO NOTHING; -- idempotent; a re-run must NEVER reset an accrued tally to 0

CREATE INDEX IF NOT EXISTS vts_open_trades_closed_at_closed_idx
  ON vts_open_trades (closed_at)
  WHERE closed = true;
