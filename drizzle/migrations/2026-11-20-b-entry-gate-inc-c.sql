-- B-ENTRY-GATE (#1224) increment C — the BIRTH enforcement switch for EntryWindow, per asset class (Langston ruling (b), 2026-11-20).
-- Week read: Claude Comms and Packages/Langston Design Asks/B_ENTRY_GATE_P7_XSTOCK_WEEK_READ.md §9 (committed 9a3b34192)
-- Code:      signal_quality_evaluator.ts resolveBirthEntryWindowMode; read at the birth SQE call in signal-orchestrator.ts.
--
-- entry_gate.entry_window_birth_live, a boolean per class. ONLY boolean true enforces EntryWindow at birth; false, no row, a
-- non-boolean value or a cold cache all leave it in SHADOW (records, never refuses), logged once per class per process.
--   xstock_spot = true  — the C-2 gate is met: 3 would-refuse of 921 births (0.33 %), 3 of 93 judged (3.2 %), one full week.
--                         A birth refused here never reaches the RTB queue. Pre-registered: ~3 refusals a week, ~3.2 % of
--                         judged; INVESTIGATE if more than 25 % of judged births refuse in the first full xStock session.
--   crypto_spot = false — its judged arm was never reached (crypto is maker-only, and EntryWindow judges only a taker), so its
--                         C-2 gate is UNEXERCISED, not passed; it stays shadow until its own session read.
-- ROLLBACK: 2026-11-20-b-entry-gate-inc-c-rollback.sql (by hand) — deletes both rows: both classes return to SHADOW.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('entry_gate', 'entry_window_birth_live', 'true'::jsonb,  'xstock_spot', '*', '*', '*', NOW(), 'b-entry-gate-inc-c'),
  ('entry_gate', 'entry_window_birth_live', 'false'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-entry-gate-inc-c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'entry_gate' AND constant_name = 'entry_window_birth_live'
     AND exchange = '*' AND strategy = '*' AND regime = '*'
     AND ((asset_class = 'xstock_spot' AND value = 'true'::jsonb) OR (asset_class = 'crypto_spot' AND value = 'false'::jsonb));
  IF n <> 2 THEN
    RAISE EXCEPTION 'B-ENTRY-GATE inc C seed: expected xstock_spot=true and crypto_spot=false, found % matching rows', n;
  END IF;
END $$;

COMMIT;
