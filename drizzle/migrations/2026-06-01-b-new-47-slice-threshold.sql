-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-47 — Adaptive per-day slicing threshold for the B75 retention sweep
-- ═════════════════════════════════════════════════════════════════════════════
--
-- RUNNING_ISSUES #161. The b75 retention sweep buffered whole monthly partitions
-- into memory before upload (OOM on the 3.7 GB-RAM box for the 31 GB May ticker
-- partition) AND a single object can exceed the Supabase 5 GB project upload cap.
-- B-NEW-47 fixes both with adaptive per-day slicing + streamed I/O.
--
-- This migration DB-seeds the whole-vs-sliced decision threshold (Langston
-- Step-2 Q-A: DB-governed + fail-hard-if-empty, consistent with the rest of
-- data_lifecycle config and Kyle's "no hard-coded fallbacks for DB-governed
-- settings" rule). The sweep reads it via reqNum() and FAILS HARD if absent.
--
-- Value: 3 GiB of HOT (pg_total_relation_size) bytes. A partition at/above this
-- routes to per-day slicing; below it stays one object/month. 3 GiB hot at a
-- conservative 3:1 compression keeps every whole-path object well under the
-- 5 GB Supabase cap even at poor compression.
-- ═════════════════════════════════════════════════════════════════════════════

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('data_lifecycle', '*', '*', '*', '*', 'slice_threshold_hot_bytes', '3221225472'::jsonb, 'b-new-47')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

-- Verify:
--   SELECT value FROM module_constants
--   WHERE module_name='data_lifecycle' AND constant_name='slice_threshold_hot_bytes';
--   -- Expected: 3221225472
