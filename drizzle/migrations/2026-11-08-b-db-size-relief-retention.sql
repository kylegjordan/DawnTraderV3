-- B-DB-SIZE-RELIEF OBJ-1 (Kyle KD-60, 2026-11-06) — signal_eval_archive hot window 30 -> 15 days, and EVERY
-- data_lifecycle key this batch touches reaffirmed at its stated value.
--
-- WHY 15: the consumer audit (KD-32 pack §5, re-derived in the pre-audit F6): no live decision path reads
-- signal_eval_archive; the deepest by-hand readers are scripts/b4-regime-parity.ts (LIVE_WINDOW_DAYS = 14) and
-- scripts/b5-w2a-geometry-sweep.ts (WINDOW_DAYS = 14), so 15 days is the measured floor with one day of slack.
-- WHY REAFFIRM THE OTHER SIX: none of their live values has a migration record — four were last set by hand
-- (updated_by 'cc-analyst-c5ad11d1-restore-30', 2026-08-19) and two still carry their 2026-05 seeds — so this file is
-- the first migration-of-record for all seven.
-- WHAT HAPPENS NEXT: the 02:15Z sweep (b75-retention-sweep.ts) exports, verifies in warm, and only then drops each
-- signal_eval_archive daily older than 15 days. Nothing is deleted. The first night moves ~16 dailies (~21.8 GiB,
-- pre-audit r2 C-3); the sweep has no per-run cap.
-- ROLLBACK: 2026-11-08-b-db-size-relief-retention-rollback.sql, applied BY HAND with psql (db:migrate refuses
-- rollback files), and BEFORE any code revert: a missing data_lifecycle key aborts the whole night's sweep
-- (b75-retention-sweep.ts reqNum).

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by, updated_at) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'signal_eval_archive.hot_retention_days',     '15'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'pair_scan_archive.hot_retention_days',       '30'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'signal_eval_provenance.hot_retention_days',  '30'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'exit_decision_archive.hot_retention_days',   '30'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'macro_feed_archive.hot_retention_days',      '30'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'crypto_spot_ticker_snap.hot_retention_days', '30'::jsonb, 'b-db-size-relief-obj1', NOW()),
  ('data_lifecycle', '*', '*', '*', '*', 'xstock_perp_ticker_snap.hot_retention_days', '30'::jsonb, 'b-db-size-relief-obj1', NOW())
-- The six-column primary key (module_constants_pkey), never constant_name alone (Langston, Step 2 r2).
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = EXCLUDED.updated_at;

-- Exactly these seven rows, at these values.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'data_lifecycle' AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
     AND ((constant_name = 'signal_eval_archive.hot_retention_days' AND value = '15'::jsonb)
       OR (constant_name IN ('pair_scan_archive.hot_retention_days', 'signal_eval_provenance.hot_retention_days',
                             'exit_decision_archive.hot_retention_days', 'macro_feed_archive.hot_retention_days',
                             'crypto_spot_ticker_snap.hot_retention_days', 'xstock_perp_ticker_snap.hot_retention_days')
           AND value = '30'::jsonb));
  IF n <> 7 THEN
    RAISE EXCEPTION 'B-DB-SIZE-RELIEF OBJ-1: expected exactly 7 data_lifecycle rows at their stated values, found %', n;
  END IF;
  -- Any scope (Langston): b75-retention-sweep.ts reads data_lifecycle keyed on constant_name alone, so a competing row
  -- at a narrower scope would make the window whichever row Postgres returns last. Exactly one row per key, any scope.
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'data_lifecycle'
     AND constant_name IN ('signal_eval_archive.hot_retention_days', 'pair_scan_archive.hot_retention_days',
                           'signal_eval_provenance.hot_retention_days', 'exit_decision_archive.hot_retention_days',
                           'macro_feed_archive.hot_retention_days', 'crypto_spot_ticker_snap.hot_retention_days',
                           'xstock_perp_ticker_snap.hot_retention_days');
  IF n <> 7 THEN
    RAISE EXCEPTION 'B-DB-SIZE-RELIEF OBJ-1: expected exactly 7 data_lifecycle rows for these keys at ANY scope, found % (a competing scope would split the sweep''s read)', n;
  END IF;
END $$;

COMMIT;
