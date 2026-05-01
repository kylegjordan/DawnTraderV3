-- B68.3 rollback — Remove pair_correlation module constants (8 keys)

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'pair_correlation'
  AND constant_name IN (
    'b68_3_lookback_bars',
    'b68_3_btc_reference_symbol',
    'b68_3_factor_min',
    'b68_3_factor_max',
    'b68_3_sensitivity',
    'b68_3_min_samples',
    'b68_3_drifting_threshold',
    'b68_3_idiosyncratic_threshold'
  );

COMMIT;
