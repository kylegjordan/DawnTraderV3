-- ROLLBACK for 2026-11-05-b-entry-gate-inc-b.sql (B-ENTRY-GATE #1224 increment B, P7). Run by hand only.
BEGIN;
DELETE FROM module_constants WHERE module_name = 'entry_gate' AND constant_name = 'promotion_price_max_age_ms' AND updated_by = 'b-entry-gate-inc-b';
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS consecutive_unpriced_passes;
ALTER TABLE rtb_signals DROP COLUMN IF EXISTS last_priced_at;
COMMIT;
