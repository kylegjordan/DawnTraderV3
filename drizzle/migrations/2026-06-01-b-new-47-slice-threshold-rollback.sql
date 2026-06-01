-- ═════════════════════════════════════════════════════════════════════════════
-- B-NEW-47 ROLLBACK — remove the adaptive per-day slicing threshold constant
-- ═════════════════════════════════════════════════════════════════════════════
-- NOTE: rolling this back makes the b75-retention-sweep fail-hard at config load
-- (reqNum('slice_threshold_hot_bytes')). Only run if also reverting the sweep
-- code to the pre-B-NEW-47 buffered version.
-- ═════════════════════════════════════════════════════════════════════════════

DELETE FROM module_constants
WHERE module_name = 'data_lifecycle'
  AND constant_name = 'slice_threshold_hot_bytes';
