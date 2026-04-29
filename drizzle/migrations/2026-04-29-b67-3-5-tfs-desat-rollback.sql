-- B67.3.5 rollback — Remove TFS desaturation scales
--
-- Run only if reverting B67.3.5 code changes. The constants are harmless if
-- left in place after a code revert (they become unused), but removing them
-- keeps module_constants tidy.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'regime_classifier'
  AND constant_name IN (
    'b67_3_5_tfs_desat_min',
    'b67_3_5_tfs_desat_max',
    'b67_3_5_tfs_momentum_scale',
    'b67_3_5_tfs_volatility_scale',
    'b67_3_5_tfs_dbs_scale'
  );

COMMIT;
