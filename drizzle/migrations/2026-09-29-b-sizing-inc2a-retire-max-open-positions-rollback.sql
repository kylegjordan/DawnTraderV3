-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql
-- B-SIZING-DEC-RESTORE increment 2a (obj-4, #698). NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Restores exactly what the forward migration removed, from values read on staging 2026-09-29:
--   * the two columns with their old definitions, and each row's old value
--     (guardrails_v2: live 12, paper 15; goals_presets: conservative 3, baseline 5, optimistic 8,
--     maximum 12, custom 5 — the same per name in both modes);
--   * guardrails_v2_max_open_positions_check;
--   * the module_constants row (guardrail_defaults, max_open_trades_default) = 5;
--   * the four views, from pg_get_viewdef as read before the drop.
--
-- ⚠️ A code rollback must go with it: the increment-2a code no longer reads or writes the column, and
-- the pre-2a code requires it (the engine's slot count reads guardrails_v2.max_open_positions).
-- ⚠️ If goals_presets gained rows after the forward migration, they receive 5 (the old seed default
-- for 'baseline' / 'custom'); check before relying on them.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

ALTER TABLE guardrails_v2 ADD COLUMN max_open_positions integer NOT NULL DEFAULT 5;
UPDATE guardrails_v2 SET max_open_positions = 12 WHERE mode = 'live';
UPDATE guardrails_v2 SET max_open_positions = 15 WHERE mode = 'paper';
ALTER TABLE guardrails_v2
  ADD CONSTRAINT guardrails_v2_max_open_positions_check
  CHECK (max_open_positions >= 1 AND max_open_positions <= 20);

-- goals_presets had NO default: add with a temporary one so NOT NULL holds, set the old values, drop it.
ALTER TABLE goals_presets ADD COLUMN max_open_positions integer NOT NULL DEFAULT 5;
UPDATE goals_presets SET max_open_positions = CASE name
    WHEN 'conservative' THEN 3
    WHEN 'baseline'     THEN 5
    WHEN 'optimistic'   THEN 8
    WHEN 'maximum'      THEN 12
    WHEN 'custom'       THEN 5
    ELSE max_open_positions
  END;
ALTER TABLE goals_presets ALTER COLUMN max_open_positions DROP DEFAULT;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES ('guardrail_defaults', '*', '*', '*', '*', 'max_open_trades_default', '5', 'b-sizing-inc2a-rollback');

CREATE VIEW v_goals_active AS
 SELECT id,
    mode,
    name AS preset_name,
    target_daily_avg_earning_pct,
    trades_per_day_est,
    portfolio_risk_per_trade_pct,
    daily_loss_kill_switch_pct,
    symbol_cooldown_minutes,
    max_open_positions,
    is_active,
    last_adjusted_at,
    learning_active,
    created_at,
    updated_at
   FROM goals_presets;

CREATE VIEW v_guardrails_active AS
 SELECT id,
    mode,
    portfolio_risk_per_trade_pct,
    symbol_cooldown_minutes,
    max_open_positions,
    daily_loss_kill_switch_pct,
    is_manual_override,
    tuned_by_latti,
    locked_by_user,
    kill_switch_tripped,
    kill_switch_reason,
    kill_switch_tripped_at,
    last_updated
   FROM guardrails_v2;

CREATE VIEW v_guardrails_compliance AS
 SELECT mode,
    portfolio_risk_per_trade_pct,
    daily_loss_kill_switch_pct,
    max_open_positions,
    symbol_cooldown_minutes,
        CASE
            WHEN portfolio_risk_per_trade_pct <= (daily_loss_kill_switch_pct / 10::numeric) THEN 'PASS'::text
            WHEN portfolio_risk_per_trade_pct <= (daily_loss_kill_switch_pct / 5::numeric) THEN 'WARN'::text
            ELSE 'FAIL'::text
        END AS coherency_status,
    is_manual_override,
    tuned_by_latti,
    locked_by_user,
    last_updated
   FROM guardrails_v2;

CREATE VIEW v_guardrails_transitional AS
 SELECT g.mode,
    g.portfolio_risk_per_trade_pct AS risk_pct,
    g.daily_loss_kill_switch_pct AS kill_switch_pct,
    g.symbol_cooldown_minutes AS cooldown,
    g.max_open_positions AS positions,
    g.is_manual_override,
    g.tuned_by_latti,
    g.last_updated,
    legacy.max_daily_loss,
    legacy.max_drawdown,
    legacy.max_position_size,
    legacy.risk_per_trade AS legacy_risk_pct,
    legacy.cooldown_minutes AS legacy_cooldown,
    legacy.max_open_positions AS legacy_positions,
    legacy.ai_can_adjust AS legacy_ai_adjust,
        CASE
            WHEN g.portfolio_risk_per_trade_pct <= (g.daily_loss_kill_switch_pct / 10::numeric) THEN 'PASS'::text
            ELSE 'FAIL'::text
        END AS coherency_rule_001,
        CASE
            WHEN (g.max_open_positions::numeric * g.portfolio_risk_per_trade_pct) <= 100::numeric THEN 'PASS'::text
            ELSE 'WARN'::text
        END AS coherency_rule_002,
        CASE
            WHEN NOT (g.is_manual_override AND g.tuned_by_latti) THEN 'PASS'::text
            ELSE 'FAIL'::text
        END AS coherency_rule_005
   FROM guardrails_v2 g
     LEFT JOIN guardrails legacy ON legacy.mode = g.mode;

-- The forward file's `_migrations` row goes with it (column `name`, scripts/db-migrate.ts), so a later redeploy of the
-- batch applies the forward file again instead of skipping it over a restored schema (Step-4 fresh-reader round, 2026-09-29).
DELETE FROM _migrations WHERE name = '2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql';

COMMIT;
