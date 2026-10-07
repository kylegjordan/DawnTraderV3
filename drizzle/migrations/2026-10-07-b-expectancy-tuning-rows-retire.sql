-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-10-07 — B-EXPECTANCY-TUNING-ROWS-RETIRE (sprint row 4a2, #1156): RETIRE the three expectancy_tuning rows
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_EXPECTANCY_TUNING_ROWS_RETIRE_PRE_AUDIT.md (Langston Step 2, 2026-10-07).
--
-- What this deletes, read on staging 2026-10-06 before writing: module_constants, module 'expectancy_tuning', scope
-- (*,*,*,*) — winrate_floor_low 0.4, winrate_threshold_medium 0.5, winrate_threshold_high 0.6, all updated_by
-- 'b72-step3-commit-b' 2026-05-05 15:24:26Z, never tuned. Their only reader, getAdjustedMinROI, was deleted with zero
-- callers by B-VTS-TELEMETRY-AGGREGATES (row 4a, d4c688b88), which also took the module out of the boot warm-up's
-- PREFETCH_MODULES. Nothing reads them now.
--
-- FORWARD IS SAFE FOR TWO INDEPENDENT REASONS: (i) ancestry — any sha carrying this file carries d4c688b88, so this
-- DELETE can never meet pre-4a code; (ii) sequence — dt-deploy runs build → db:migrate → pm2 restart
-- (SYSTEM_MANUAL.md:13234), so the new build is already on disk before this runs.
--
-- ⛔ ROLLBACK ORDER — the one live hazard is BACKWARDS. b72-warmup.ts throws at boot on a prefetched module with zero
-- rows, and code before d4c688b88 prefetches 'expectancy_tuning'. To roll code back past d4c688b88: run
-- 2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql FIRST, then deploy the older sha. The other order refuses boot.
--
-- Rollback: 2026-10-07-b-expectancy-tuning-rows-retire-rollback.sql (IN git, beside this file; never listed in
-- MANIFEST.txt — db-migrate's validateManifest refuses a listed rollback).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

DELETE FROM module_constants
 WHERE module_name = 'expectancy_tuning'
   AND constant_name IN ('winrate_floor_low', 'winrate_threshold_medium', 'winrate_threshold_high');

COMMIT;
