-- Rollback for 2026-11-06-b-xstock-bar-availability-window-rerun.sql: restores the first window's
-- start. Roll the code constant back in the same change, or the gate fails its equality fence.
UPDATE module_constants
   SET value = to_jsonb('2026-10-16T00:05:00Z'::text),
       updated_by = 'b-xstock-bar-availability-r2-rerun-rollback',
       updated_at = now()
 WHERE module_name = 'xstock_bar_availability'
   AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
   AND constant_name = 'graded_window_start';
