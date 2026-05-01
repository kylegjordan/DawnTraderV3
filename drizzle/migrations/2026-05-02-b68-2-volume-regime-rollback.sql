-- B68.2 rollback — Remove volume_regime module constants (8 keys)
--
-- Run only if reverting B68.2 code changes. Constants are harmless if left
-- in place after a code revert (they become unused), but removing them keeps
-- module_constants tidy.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'volume_regime'
  AND constant_name IN (
    'b68_2_lookback_bars',
    'b68_2_accumulation_threshold',
    'b68_2_distribution_threshold',
    'b68_2_factor_min',
    'b68_2_factor_max',
    'b68_2_sensitivity',
    'b68_2_min_samples',
    'b68_2_liquidation_spike_multiplier'
  );

COMMIT;
