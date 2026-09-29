-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — B-SIZING-DEC-RESTORE increment 2a (obj-4, #698): RETIRE max_open_positions
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §14 (D4) and
-- §14.4 (Langston's ruling, graded ref a8b20eba9; folded at 232cd3e5b).
--
-- Kyle's corrected PAPER-RESET-3000 retires the open-slots guardrail. How many positions can be open
-- is now DERIVED in code from the per-position percent — floor(100 / max_position_percent_pct),
-- server/services/active-position-sizing.ts deriveSlotCount — so the stored setting goes.
--
-- What this drops, all read on staging 2026-09-29 before writing:
--   * four VIEWS that select the column: v_goals_active, v_guardrails_active,
--     v_guardrails_compliance, v_guardrails_transitional. pg_depend lists exactly these four, no
--     view depends on another, and NO code reads any of them (grep of server, client, shared,
--     scripts: 0). They block the column drop, so they go first. The rollback re-creates them.
--   * guardrails_v2_max_open_positions_check, CHECK (max_open_positions >= 1 AND <= 20) — dropped
--     WITH the column (§13.4 condition C). goals_presets carries no constraint on the column.
--   * guardrails_v2.max_open_positions (NOT NULL, default 5; live 12, paper 15) and
--     goals_presets.max_open_positions (NOT NULL, no default; ten rows).
--   * module_constants (guardrail_defaults, max_open_trades_default) = 5 — the silent fallback of the
--     deleted checkMaxOpenTrades. The module keeps its other row (default_max_total_exposure_pct);
--     the boot warmup asserts no row count for this module.
--
-- ⛔ NOT DROPPED HERE (§14.2 D5, homed to increment 2b's rule-18 census with #1090): the LEGACY
-- guardrails.max_open_positions and trading_settings.max_open_trades columns.
--
-- ⛔ DEPLOY TOGETHER WITH INCREMENT 2b (§14.4 D4 condition): with the [1, 20] CHECK gone, the only
-- bound on concurrency is max_position_percent_pct, whose increment-1 CHECK allows 0 < p <= 100 —
-- p = 0.5 would derive 200 slots. 2b's p-entry guard (FINDING-4) closes that; 2a never ships alone.
--
-- Rollback: 2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql (IN git, beside this
-- file; never listed in MANIFEST.txt).
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

DROP VIEW v_guardrails_transitional;
DROP VIEW v_guardrails_compliance;
DROP VIEW v_guardrails_active;
DROP VIEW v_goals_active;

ALTER TABLE guardrails_v2 DROP CONSTRAINT guardrails_v2_max_open_positions_check;
ALTER TABLE guardrails_v2 DROP COLUMN max_open_positions;
ALTER TABLE goals_presets DROP COLUMN max_open_positions;

DELETE FROM module_constants
 WHERE module_name = 'guardrail_defaults'
   AND constant_name = 'max_open_trades_default';

COMMIT;
