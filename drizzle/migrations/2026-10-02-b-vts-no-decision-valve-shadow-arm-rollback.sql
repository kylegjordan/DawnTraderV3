-- Rollback for 2026-10-02-b-vts-no-decision-valve-shadow-arm.sql (B-VTS-NO-DECISION-VALVE, 3n.q3, P5).
-- ⚠️ Revert the CODE first: `updateShadowPairingOutcome` writes `exit_booking_arm` on every shadow close, so dropping the
-- column under the running code fails every shadow close write (caught and logged as SHADOW_OUTCOME_FAIL - the row stays
-- open in the sink while the trade leaves the in-memory map).
-- Dropping the column loses only the recorded arms; no price or outcome lives in it.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE rtb_shadow_pairings DROP COLUMN IF EXISTS exit_booking_arm;
-- Clear the forward file's ledger row so a later redeploy re-applies it.
DELETE FROM _migrations WHERE name = '2026-10-02-b-vts-no-decision-valve-shadow-arm.sql';
COMMIT;
