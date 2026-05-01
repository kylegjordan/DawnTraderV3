-- B67.4 rollback — Remove cheap-tier bundle constants (11 across 3 modules)
--
-- Run only if reverting B67.4 code changes. Constants are harmless if left in
-- place after a code revert (they become unused), but removing them keeps
-- module_constants tidy.

BEGIN;

DELETE FROM module_constants
WHERE module_name IN ('outcome_feedback', 'regime_age', 'path_b_sustainability')
  AND constant_name IN (
    'b67_4_alpha',
    'b67_4_sensitivity',
    'b67_4_min_samples',
    'b67_4_factor_min',
    'b67_4_factor_max',
    'b67_4_expiry_hours',
    'b68_4_target_age_hours',
    'b68_4_sensitivity',
    'b68_4_min',
    'b68_4_max',
    'b68_5_dbs_slope_min'
  );

COMMIT;
