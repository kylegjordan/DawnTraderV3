-- P19-B-PERPFEED close-out sweep: drop the fully-orphaned feature_snapshots table.
-- Provenance: its ONLY writers were FeatureEnrichmentService.saveEnrichedFeatures (dead method,
-- deleted fb4acdf8a) and DataNormalizationService (dead file, deleted 37a294867); its three
-- storage readers had zero callers tree-wide (census in DELETED_COMPONENTS_LOG 2026-08-18,
-- Langston-verified at 37a294867). Measured EMPTY at drop time (0 rows, 16 kB) — the abort
-- guard below makes that a checked precondition, not an assumption (move-not-delete is moot
-- on zero rows, but a nonempty table must NOT be silently destroyed).
DO $$
DECLARE n bigint;
BEGIN
  IF to_regclass('feature_snapshots') IS NULL THEN
    RAISE NOTICE 'feature_snapshots already absent — nothing to drop';
    RETURN;
  END IF;
  EXECUTE 'SELECT count(*) FROM feature_snapshots' INTO n;
  IF n > 0 THEN
    RAISE EXCEPTION 'feature_snapshots holds % rows — refusing to drop a nonempty table (export it first)', n;
  END IF;
  EXECUTE 'DROP TABLE feature_snapshots';
  RAISE NOTICE 'feature_snapshots dropped (was empty)';
END $$;
