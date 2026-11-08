-- ROLLBACK for 2026-11-08-b-price-side-8c-level-build-knobs.sql — ONLY together with a code rollback to a sha before the
-- 8c switch-on. The code that reads these rows FAILS HARD without them (level-build-config.ts, asserted at boot), so
-- running this alone stops the process at warmup. The MANIFEST entry is forward-only and is not removed.
-- ⛔ ORDER IS LOAD-BEARING (Langston 2026-11-08, 3(a)): REVERT THE CODE FIRST, THEN RUN THIS. The 8c seam reads all four rows
-- for EVERY crypto signal birth, switch on or off; deleting them under a live process refuses every crypto birth as
-- level_knobs_unreadable within one 60 s cache re-warm — a silent total crypto entry blackout — and the next boot fails.
BEGIN;
DELETE FROM module_constants
 WHERE module_name = 'level_basis' AND asset_class = 'crypto_spot' AND exchange = '*' AND strategy = '*' AND regime = '*'
   AND constant_name IN ('level_build_max_age_ms', 'level_build_max_spread_fraction', 'level_build_drift_ref_60s', 'crypto_birth_sided_enabled');
COMMIT;
