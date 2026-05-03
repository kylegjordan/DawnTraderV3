-- Rollback for 2026-05-03-b68-1-multi-tf-agreement.sql
BEGIN;

DELETE FROM module_constants
WHERE module_name = 'multi_tf_agreement'
  AND constant_name IN (
    'b68_1_higher_tf_interval_minutes',
    'b68_1_min_higher_tf_samples',
    'b68_1_factor_min',
    'b68_1_factor_max',
    'b68_1_sensitivity',
    'b68_1_compatible_score',
    'b68_1_confirmed_score',
    'b68_1_conflicted_score'
  );

COMMIT;
