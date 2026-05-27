-- ════════════════════════════════════════════════════════════════════════════
-- B79.0n.RTB Phase 3 ROLLBACK — drop CHECK constraint + index
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE rtb_signals DROP CONSTRAINT IF EXISTS rtb_signals_asset_class_not_null_chk;
DROP INDEX IF EXISTS rtb_signals_mode_asset_class_status_idx;

DO $$
BEGIN
  RAISE NOTICE 'B79.0n.RTB Phase 3 ROLLBACK OK: CHECK constraint + index removed';
END $$;

COMMIT;
