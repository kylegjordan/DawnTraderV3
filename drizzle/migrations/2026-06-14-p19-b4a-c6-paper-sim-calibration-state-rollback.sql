-- ROLLBACK for 2026-06-14-p19-b4a-c6-paper-sim-calibration-state.sql. NOT in MANIFEST.
BEGIN;
ALTER TABLE paper_sim_trades DROP COLUMN IF EXISTS calibration_state;
ALTER TABLE paper_sim_open_positions DROP COLUMN IF EXISTS calibration_state;
COMMIT;
