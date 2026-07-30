-- B-TRADE-RECORD-RETENTION leg 1 — EXTEND the vts_open_trades closed-row GC window
-- from 90 to 365 days, to move the first-irreversible-deletion date off ~2026-08-09
-- while the archive-side fix (leg 2) and the pre-June backfill (leg 3) are designed
-- on their merits rather than under a clock.
--
-- WHY A MIGRATION AND NOT A LIVE UPDATE — CORRECTED at Langston's Step-4 (2026-07-30).
-- ⚠️ An earlier draft of this comment claimed the value is "also carried by
-- 2026-04-22-initial-schema.sql" and that a hand-run UPDATE would be "silently reverted
-- to 90 by the next fresh-DB bootstrap." THAT MECHANISM DOES NOT EXIST and the claim was
-- invented. Measured: that dump is SCHEMA-ONLY — 20,788 lines, ZERO `COPY` blocks, ZERO
-- occurrences of `closed_gc_retention_days`. And the original seed
-- (2026-05-10-b79-0g-tx-data-lifecycle-seed.sql) carries `-- db-migrate:skip`, which
-- scripts/db-migrate.ts ledger-records WITHOUT running the SQL. So NOTHING on a fresh-DB
-- path writes 90.
--
-- ★ THE REAL REASON IS STRONGER THAN THE ONE I INVENTED: on a fresh database the row does
-- not exist AT ALL. sweepClosedOpenTrades then hits [CONFIG_MISSING] and skips forever, so
-- a staging-only UPDATE would leave every fresh bootstrap PERMANENTLY SWEEP-DEAD while
-- staging alone had the value. THIS MIGRATION IS THE ONLY THING THAT RESTORES THE ROW on a
-- fresh DB — that is why it must be a migration, and it is also why it uses DO UPDATE
-- rather than the seed's DO NOTHING (against an existing row, DO NOTHING would no-op and
-- change nothing).
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
-- ★ MAGNITUDE, CORRECTED at Step-4: at 90 days this is a GRADUAL BLEED, NOT A CLIFF —
-- 804 rows gone by 2026-08-17 and 3,326 by 2026-08-30, out of 41,459 closed. The
-- ~2026-08-09 first-deletion date is right (oldest closed_at = 2026-05-11 00:06:25), but
-- nothing large disappears on that date. Stated so nobody reads this migration as an
-- emergency response; the reason to do it now is that it is free, not that it is urgent.
--
-- ★★ THE TWO ALERTS THAT ENFORCE THIS FILE — named here because a mechanism the artifact
-- does not point at still reads as a comment (Langston, Step-4 note 2):
--   dedupe_key `vts-gc-retention-365-expiry-revisit`   fires 2026-09-01T09:00Z — the
--     forcing function for the expiry below. Decide keep-365-as-stated-policy vs
--     return-to-a-shorter-window; do NOT leave it unexamined.
--   dedupe_key `vts-gc-retention-365-runtime-proof`    fires 2026-07-31T12:00Z — confirms
--     a boot actually READ 365 rather than merely storing it.
-- ⚠️ METHOD NOTE FOR THE RUNTIME-PROOF CHECK (Langston, Step-4 note 1 — a real gap in the
-- check as I first wrote it): staging log retention is ASYMMETRIC — stdout rotates roughly
-- every 2 days (6-8 rotations/day against a 14-FILE cap), stderr ~14 days. The observation
-- window is only ~36h, which is inside one rotation of the `GC_SWEEP` line disappearing.
-- ⇒ SO "no GC_SWEEP line found" is NOT evidence of "no boot." ESTABLISH THE BOOT FIRST from
-- `pm2` uptime / restart_time, and only THEN interpret an absent log line. Otherwise the two
-- outcomes are indistinguishable — the same absent-as-valid trap this whole batch keeps hitting.
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
