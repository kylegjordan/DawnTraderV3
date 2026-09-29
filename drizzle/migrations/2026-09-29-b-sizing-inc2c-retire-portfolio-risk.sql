-- ═══════════════════════════════════════════════════════════════════════════
-- 2026-09-29 — B-SIZING-DEC-RESTORE increment 2c (obj-3): Portfolio Risk per Trade RETIRED, in paper AND live
-- ═══════════════════════════════════════════════════════════════════════════
--
-- Plan: Claude Comms and Packages/Scope Files/B_SIZING_DEC_RESTORE_PRE_AUDIT.md §17 (P-10) and §17.4 (Langston's ruling,
-- conditions C1 and C5).
--
-- Kyle's directive (2026-09-29): of Portfolio Risk per Trade and Max Position Percent, the one not used is removed, in paper
-- AND live. Every trade is sized by the exposure budget and max_position_percent_pct (active-position-sizing.ts); the risk %
-- sized nothing in paper since 2026-08-07, and in live it drove an UNBOUNDED risk ÷ stop sizer that increment 2c removes.
--
--   guardrails_v2.portfolio_risk_per_trade_pct   — its CHECK (0.10-5.00) and the column
--   goals_presets.portfolio_risk_per_trade_pct   — read by no code by name (whole-row selects only), NOT NULL, no inserts
--                                                   anywhere in the tree (Langston's census) — rule 18, dropped with it
--
-- Re-runnable (IF EXISTS on every drop). ⛔ NO CASCADE, deliberately: 2a's migration (2026-09-29-b-sizing-inc2a-retire-max-open-positions.sql, earlier in
-- MANIFEST.txt) drops the four views that select this column (v_goals_active, v_guardrails_active,
-- v_guardrails_compliance, v_guardrails_transitional). If they still exist, DROP COLUMN fails LOUDLY — never silently
-- takes a view with it.
-- ⛔ The code and the Drizzle declarations change in the SAME commit (§17.4 C1): Drizzle names every declared column in
-- every select, so a declared-but-dropped column breaks `storage.ts`'s goals_presets reads.
--
-- Rollback: 2026-09-29-b-sizing-inc2c-retire-portfolio-risk-rollback.sql (IN git, beside this file; never in MANIFEST).
-- ⛔ IT MUST RUN BEFORE 2a's ROLLBACK — 2a's rollback re-creates views that select this column.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE guardrails_v2 DROP CONSTRAINT IF EXISTS guardrails_v2_portfolio_risk_per_trade_pct_check;
ALTER TABLE guardrails_v2 DROP COLUMN IF EXISTS portfolio_risk_per_trade_pct;
ALTER TABLE goals_presets DROP COLUMN IF EXISTS portfolio_risk_per_trade_pct;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM information_schema.columns
   WHERE column_name = 'portfolio_risk_per_trade_pct' AND table_name IN ('guardrails_v2', 'goals_presets');
  IF n <> 0 THEN
    RAISE EXCEPTION 'b-sizing-inc2c: portfolio_risk_per_trade_pct still present on % table(s) after the drop', n;
  END IF;
END $$;

COMMIT;
