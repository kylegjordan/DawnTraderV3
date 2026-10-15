-- B-XSTOCK-BAR-AVAILABILITY phase-2 rollback.
-- Evidence is deliberately retained; rollback removes only unused entry points.

BEGIN;

DROP FUNCTION IF EXISTS apply_xstock_bar_revision_flush(jsonb, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS admit_xstock_bar_projection_flush(
  uuid, uuid, text, text, integer, integer, integer
);

COMMENT ON TABLE xstock_bar_projection_flush_admission IS
  'Retained B-XSTOCK-BAR-AVAILABILITY admission evidence after application rollback.';
COMMENT ON TABLE xstock_bar_projection_flush_completion IS
  'Retained B-XSTOCK-BAR-AVAILABILITY completion evidence after application rollback.';

COMMIT;
