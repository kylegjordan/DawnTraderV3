-- B67.5-prep rollback — Remove post-composition floor module_constant
--
-- Run only if reverting B67.5-prep code changes. After rollback, the
-- three clamp sites should also revert to hardcoded 0.4.

BEGIN;

DELETE FROM module_constants
WHERE module_name = 'regime_classifier'
  AND constant_name = 'b67_5_post_composition_floor';

COMMIT;
