-- ════════════════════════════════════════════════════════════════════════════
-- B79.TEC — Rollback for Migration 1 (per-asset-class break_even_enabled rows)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Removes the 4 rows seeded by 2026-05-08-b79-tec-per-class-be-rows.sql.
-- Signature-guarded: only deletes rows authored by 'B79.TEC' AND with
-- value=false (so any operator-modified row survives the rollback).
--
-- After rollback, primeTECConfig() will HARD-FAIL on the next boot for the
-- 4 active classes because the explicit per-class rows are gone. To revert
-- the code change as well, also revert commit ${B79.TEC.commit-sha}.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM module_constants
 WHERE module_name = 'trailing_exit'
   AND constant_name = 'break_even_enabled'
   AND asset_class IN ('crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp')
   AND value = 'false'::jsonb
   AND updated_by = 'B79.TEC';

COMMIT;
