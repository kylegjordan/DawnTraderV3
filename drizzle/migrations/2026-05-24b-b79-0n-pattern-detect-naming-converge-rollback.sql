-- ROLLBACK for 2026-05-24b-b79-0n-pattern-detect-naming-converge.sql
--
-- Reverses the rename + delete the 2 new seed rows.
-- Idempotent — safe to run even if forward migration only partially applied.

BEGIN;

-- Reverse (1) — rename pattern_final_score_min -> final_score_floor (xstock only)
UPDATE module_constants
   SET constant_name = 'final_score_floor',
       updated_by    = 'B79.0n.PATTERN-DETECT_rollback',
       updated_at    = NOW()
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name = 'pattern_final_score_min';

-- Reverse (2) — rename pattern_max_position_pct -> max_position_pct (xstock only)
UPDATE module_constants
   SET constant_name = 'max_position_pct',
       updated_by    = 'B79.0n.PATTERN-DETECT_rollback',
       updated_at    = NOW()
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name = 'pattern_max_position_pct';

-- Reverse (3) — delete the 2 seeded RSI bounds (xstock only)
DELETE FROM module_constants
 WHERE module_name   = 'pattern_pool_gates'
   AND exchange      = '*'
   AND asset_class   = 'xstock_spot'
   AND strategy      = '*'
   AND regime        = '*'
   AND constant_name IN ('pattern_rsi_min', 'pattern_rsi_max');

COMMIT;
