-- ROLLBACK: removes only the lane's own knob rows. The lane fail-closes (DISABLED)
-- the moment its knobs are absent — safe under live code, no ordering constraint.
DELETE FROM module_constants WHERE module_name='exploration_lane' AND updated_by='p19-b8-5-exploration';
