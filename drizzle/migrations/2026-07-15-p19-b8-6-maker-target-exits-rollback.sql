-- Rollback for 2026-07-15-p19-b8-6-maker-target-exits.sql (columns retained — additive,
-- NULL-safe; only the knob rows are removed)
DELETE FROM module_constants WHERE constant_name = 'exit_maker_max_pending_ms' AND updated_by = 'p19-b8-6-maker-target-exits';
