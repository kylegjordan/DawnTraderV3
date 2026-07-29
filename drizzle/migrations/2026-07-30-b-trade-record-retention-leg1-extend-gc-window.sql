-- B-TRADE-RECORD-RETENTION leg 1 — EXTEND the vts_open_trades closed-row GC window
-- from 90 to 365 days, to move the first-irreversible-deletion date off ~2026-08-09
-- while the archive-side fix (leg 2) and the pre-June backfill (leg 3) are designed
-- on their merits rather than under a clock.
--
-- WHY A MIGRATION AND NOT A LIVE UPDATE (Langston ruling 2026-07-30, and this is the
-- whole point of the file): the retention value is ALSO carried by
-- 2026-04-22-initial-schema.sql (a pg_dump of staging state), and the original seed
-- 2026-05-10-b79-0g-tx-data-lifecycle-seed.sql uses ON CONFLICT DO NOTHING. So a
-- hand-run UPDATE on staging would be silently reverted to 90 by the next fresh-DB
-- bootstrap, with NO log line and NO error — the clock would restart and nobody
-- would know. A migration is the only form of this change that survives a reseed.
--
-- WHY 365 AND NOT AN ARBITRARY NUMBER: it matches the project's existing warm-tier
-- window, module_constants data_lifecycle.default_warm_retention_days = 365. Anchoring
-- to a constant already in use is preferable to inventing a new one.
--
-- COST, MEASURED 2026-07-30 (not assumed): vts_open_trades is 52 MB total across
-- 41,591 rows (~1,311 bytes/row) = 0.030% of a 169 GB database. Extending retention
-- is therefore free on disk at any horizon we care about. This is NOT the table
-- driving the 83%+ disk pressure; that is xstock_spot_ticker_snap + signal_eval_archive.
--
-- SAFETY: the sweep (vts-trade-persistence.ts sweepClosedOpenTrades) reads this row
-- live at every boot and is FAIL-SAFE by construction — a missing or invalid value
-- SKIPS the DELETE with a [CONFIG_MISSING] log line rather than deleting by default.
-- So the worst case for this change is that the sweep does nothing.
--
-- ⏳ EXPIRY / §13 HOME — THIS IS A TEMPORARY EXTENSION, NOT A NEW POLICY.
-- It is tied to leg 3 (the pre-June backfill) landing. When leg 3 lands, revisit
-- this window deliberately: either keep 365 as the stated policy in
-- 1-system-manual/STORAGE_POLICY.md, or return it to a shorter window once the
-- at-risk fields are preserved elsewhere. Do NOT leave it at 365 by default and
-- unexamined — an un-revisited temporary knob is how the 90 got here unnoticed.
--
-- Rollback: 2026-07-30-b-trade-record-retention-leg1-extend-gc-window-rollback.sql

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('data_lifecycle', 'vts_open_trades.closed_gc_retention_days', '365'::jsonb, '*', '*', '*', '*', NOW(), 'b-trade-record-retention-leg1')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = '365'::jsonb,
                updated_at = NOW(),
                updated_by = 'b-trade-record-retention-leg1';

COMMIT;
