-- ROLLBACK for 2026-07-24-p19-b8-5j-max-hold-switch.sql (operator-only; NOT in MANIFEST).
-- Removes the three max-hold master-switch rows. After this, the code readers resolve the
-- absent keys to OFF (fail-safe) — so removing the rows does NOT re-enable the force-close;
-- it leaves it disabled. To truly revert to the pre-B8.5j behaviour (enforcement always on),
-- the code gate must also be reverted. This rollback only undoes the seed.
DELETE FROM module_constants
WHERE module_name = 'max_hold_switch'
  AND constant_name IN ('enabled_paper','enabled_live','enabled_vts');
