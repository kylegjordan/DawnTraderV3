-- P19-B6: Daily Loss-Budget Kill Switch — per-mode warning tiers + paper opening default
-- Adds two warning-tier guardrails to guardrails_v2 (one row per mode: paper, live).
-- Stored as % OF the kill threshold (NOT absolute loss %). Coherency RULE_011: 0 < warn1 < warn2 < 100.
-- Restores (re-homes) the Phase-8 daily-loss auto-trip warning machinery that was deleted in 594aad717.
-- Idempotent: IF NOT EXISTS guards; safe to re-run.

ALTER TABLE guardrails_v2
  ADD COLUMN IF NOT EXISTS daily_loss_warning1_pct numeric(5,2) NOT NULL DEFAULT 50.00,
  ADD COLUMN IF NOT EXISTS daily_loss_warning2_pct numeric(5,2) NOT NULL DEFAULT 75.00;

-- Kyle opening default (2026-06-16): paper has no real risk at stake, so set its kill threshold
-- higher so the B7b learning run is not halted by ordinary variance. Live stays conservative (7.00).
-- Only bump paper where it is still the old shared default (7.00) — never clobber a deliberate value.
UPDATE guardrails_v2
  SET daily_loss_kill_switch_pct = 15.00
  WHERE mode = 'paper' AND daily_loss_kill_switch_pct = 7.00;
