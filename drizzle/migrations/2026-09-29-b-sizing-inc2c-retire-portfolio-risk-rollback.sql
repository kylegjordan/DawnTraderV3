-- ═══════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql
-- B-SIZING-DEC-RESTORE increment 2c. NOT listed in MANIFEST.txt (rollbacks never are).
-- ═══════════════════════════════════════════════════════════════════════════
--
-- ⛔ ORDER: this rollback runs BEFORE 2a's rollback (2026-09-29-b-sizing-inc2a-retire-max-open-positions-rollback.sql),
-- because 2a's rollback re-creates views that select portfolio_risk_per_trade_pct (§17.4 C5).
-- ⛔ THE SQL GOES BEFORE THE CODE (corrected at the Step-4 fresh-reader round — this line said the opposite): pre-2c code
-- declares the column in Drizzle and names it in every select, so pre-2c code running against a table WITHOUT the column
-- fails its guardrail and goal-preset reads. Post-2c code does not name the column, so it runs unharmed on a table that
-- has it again (guardrails_v2 inserts take the DEFAULT 1.50; nothing inserts into goals_presets). Order: this file, then
-- 2a's rollback, then deploy the older code.
-- ⚠️ Not re-runnable: ADD COLUMN has no IF NOT EXISTS, so a second run fails loudly inside its transaction.
--
-- Restores both columns, the CHECK, the default, NOT NULL, and the VALUES THEY HELD, read from staging on 2026-09-29
-- (increment 2c Step 3):
--   guardrails_v2  paper 1.95 · live 4.00  (numeric(5,2), NOT NULL, DEFAULT 1.50, CHECK 0.10-5.00)
--   goals_presets  10 rows, by id — the whole restore (no code inserts into goals_presets; Langston's census)
-- A row that is not in the list below (created after 2026-09-29) cannot be restored and is REFUSED rather than guessed.
-- ═══════════════════════════════════════════════════════════════════════════

BEGIN;

ALTER TABLE guardrails_v2 ADD COLUMN portfolio_risk_per_trade_pct numeric(5,2);
UPDATE guardrails_v2 SET portfolio_risk_per_trade_pct = CASE mode::text WHEN 'paper' THEN 1.95 WHEN 'live' THEN 4.00 END;
ALTER TABLE guardrails_v2 ALTER COLUMN portfolio_risk_per_trade_pct SET DEFAULT 1.50;
ALTER TABLE guardrails_v2 ALTER COLUMN portfolio_risk_per_trade_pct SET NOT NULL;
ALTER TABLE guardrails_v2 ADD CONSTRAINT guardrails_v2_portfolio_risk_per_trade_pct_check
  CHECK (portfolio_risk_per_trade_pct >= 0.10 AND portfolio_risk_per_trade_pct <= 5.00);

ALTER TABLE goals_presets ADD COLUMN portfolio_risk_per_trade_pct numeric(5,2);
UPDATE goals_presets SET portfolio_risk_per_trade_pct = CASE id
  WHEN 'd71f15a6-c0a6-478a-b6ae-8598d8acfd5f' THEN 0.50  -- live conservative
  WHEN '61898d80-616f-42df-999d-b9689621e5c1' THEN 1.50  -- live baseline
  WHEN '42a9a116-8ab8-412b-bc93-56fc094f76d0' THEN 2.50  -- live optimistic
  WHEN 'f676a9bb-acb1-40b3-845b-cd5af6191270' THEN 4.00  -- live maximum
  WHEN '8be349cc-74d2-48e3-adbf-f0fd536f46db' THEN 1.50  -- live custom
  WHEN '1cdd4601-0db6-40e1-a9b9-0d7887c3b7be' THEN 0.50  -- paper conservative
  WHEN '3c4b1a38-5d53-4396-9ce2-91fefdbc3ff8' THEN 1.50  -- paper baseline
  WHEN '626cb449-3a0c-44fb-8f75-4a2ffec63c72' THEN 2.50  -- paper optimistic
  WHEN '7aa8f9fb-d87c-4031-8680-33867078b851' THEN 4.00  -- paper maximum
  WHEN 'bf5060d6-49f4-4a44-bf35-b631a827bad3' THEN 1.50  -- paper custom
END;
-- SET NOT NULL fails loudly if any row was not in the list above.
ALTER TABLE goals_presets ALTER COLUMN portfolio_risk_per_trade_pct SET NOT NULL;

-- The forward file's `_migrations` row goes with it (column `name`, scripts/db-migrate.ts), so a later redeploy of the
-- batch applies the forward file again instead of skipping it over a restored schema (Step-4 fresh-reader round, 2026-09-29).
DELETE FROM _migrations WHERE name = '2026-09-29-b-sizing-inc2c-retire-portfolio-risk.sql';

COMMIT;
