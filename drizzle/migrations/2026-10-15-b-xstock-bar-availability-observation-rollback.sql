-- B-XSTOCK-BAR-AVAILABILITY phase-2 rollback.
-- Evidence is deliberately retained; rollback removes only unused entry points.

BEGIN;

DROP FUNCTION IF EXISTS apply_xstock_bar_revision_flush(jsonb, uuid, text, text, uuid);
DROP FUNCTION IF EXISTS admit_xstock_bar_projection_flush(
  uuid, uuid, text, text, integer, integer, integer, jsonb
);

COMMENT ON TABLE xstock_bar_projection_flush_admission IS
  'Retained B-XSTOCK-BAR-AVAILABILITY admission evidence after application rollback.';
COMMENT ON TABLE xstock_bar_projection_flush_completion IS
  'Retained B-XSTOCK-BAR-AVAILABILITY completion evidence after application rollback.';
-- B-B75-EXPORT-COMPLETENESS (#1195): if that batch is still applied, the table is named
-- data_archive_exact_evidence — run 2026-10-17-b-b75-export-completeness-rollback.sql
-- FIRST. Guarded so this file never fails on the name either way.
DO $guard$
BEGIN
  IF to_regclass('xstock_bar_archive_exact_evidence') IS NOT NULL THEN
    COMMENT ON TABLE xstock_bar_archive_exact_evidence IS
      'Retained B-XSTOCK-BAR-AVAILABILITY exact archive evidence after application rollback.';
  ELSIF to_regclass('data_archive_exact_evidence') IS NOT NULL THEN
    COMMENT ON TABLE data_archive_exact_evidence IS
      'Retained exact archive evidence (B-XSTOCK-BAR-AVAILABILITY application rolled back; B-B75-EXPORT-COMPLETENESS still applied).';
  END IF;
END $guard$;

COMMIT;
