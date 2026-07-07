-- ═════════════════════════════════════════════════════════════════════════════
-- B-STORAGE-HARDEN Wave C (OBJ-2) — B70 analytics tables: per-table hot retention
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Kyle "we don't ever drop data" directive (2026-05-06). The 5 B70 analytics
-- tables were DROP-only at 90d via the now-DELETED b70-retention-sweep.ts
-- (RUNNING_ISSUES #430 V1). This wave routes them through the proven B75
-- export→warm→cold move-not-delete path instead. b75-retention-sweep.ts now
-- reads a per-table hot_retention_days for each (reqNum — FAILS HARD if missing).
--
-- ★ DEPLOY ORDER (Langston Step-2 hard-fail gate): this migration MUST be
--   applied BEFORE the code deploy that references these keys. A mis-ordered
--   deploy crashes the nightly sweep for ALL archive tables (B74 + B70) —
--   fail-closed (loud), never a silent drop. Verify all 5 present before restart.
--
-- 90d = the retired B70 DROP boundary (same hot footprint; the partition now
-- lands in warm instead of vanishing — hot-disk reduction is Wave D). These keys
-- supersede the code's RETENTION use of data_archive.b70_postgres_retention_days
-- (that constant drove the now-DELETED b70-retention-sweep DROP). The constant +
-- its reader archive-config.retentionDays are KEPT — still surfaced live in the
-- Drift Dashboard config panel (drift-dashboard-aggregator.ts) — but are now
-- INFORMATIONAL-only, no longer a retention driver (see the archive-config.ts
-- comment at the read site). #430.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'signal_eval_archive.hot_retention_days',    '90'::jsonb, 'b-storage-harden-wave-c'),
  ('data_lifecycle', '*', '*', '*', '*', 'pair_scan_archive.hot_retention_days',      '90'::jsonb, 'b-storage-harden-wave-c'),
  ('data_lifecycle', '*', '*', '*', '*', 'exit_decision_archive.hot_retention_days',  '90'::jsonb, 'b-storage-harden-wave-c'),
  ('data_lifecycle', '*', '*', '*', '*', 'macro_feed_archive.hot_retention_days',     '90'::jsonb, 'b-storage-harden-wave-c'),
  ('data_lifecycle', '*', '*', '*', '*', 'signal_eval_provenance.hot_retention_days', '90'::jsonb, 'b-storage-harden-wave-c')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Post-migration verification (deploy step — MUST pass before code restart):
--   SELECT constant_name, value FROM module_constants
--   WHERE module_name='data_lifecycle' AND constant_name LIKE '%archive.hot_retention_days'
--      OR constant_name = 'signal_eval_provenance.hot_retention_days'
--   ORDER BY constant_name;
--   -- Expected: 5 rows, all value=90
-- ═════════════════════════════════════════════════════════════════════════════
