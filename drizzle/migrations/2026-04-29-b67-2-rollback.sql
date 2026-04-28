-- B67.2 Migration Rollback
--
-- Removes the 3 module_constants seed rows in the 'regime_phase' module
-- inserted by 2026-04-29-b67-2-phase-dimension.sql.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'regime_phase'
  AND constant_name IN (
    'b67_2_early_phase_max_hours',
    'b67_2_prime_phase_max_hours',
    'b67_2_strategy_phase_weights'
  );

COMMIT;
