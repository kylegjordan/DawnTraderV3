-- ROLLBACK for 2026-06-16-p19-b6-daily-loss-warning-tiers.sql
-- Drops the two warning-tier columns and reverts the paper opening-default bump.
-- NOTE (rollback file — intentionally NOT registered in MANIFEST.txt; git history is the archive).

-- Revert the paper kill bump only where it is still the value this migration set (15.00) — never
-- clobber a value the user deliberately changed after the migration.
UPDATE guardrails_v2
  SET daily_loss_kill_switch_pct = 7.00
  WHERE mode = 'paper' AND daily_loss_kill_switch_pct = 15.00;

ALTER TABLE guardrails_v2
  DROP COLUMN IF EXISTS daily_loss_warning1_pct,
  DROP COLUMN IF EXISTS daily_loss_warning2_pct;
