-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-05-05 — B70.3 Path B momentum gate ROLLBACK
-- ═══════════════════════════════════════════════════════════════════════════
-- Removes the `b68_5_path_b_momentum_min` seed. Code rollback also required
-- (revert market-regime.ts to read `b68_5DbsSlopeMin` again).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

DELETE FROM module_constants
 WHERE module_name = 'path_b_sustainability'
   AND constant_name = 'b68_5_path_b_momentum_min';

COMMIT;
