-- Rollback for 2026-09-29-b-sizing-p5-guardrail-pct-range.sql (B-SIZING-DEC-RESTORE P5, #698).
-- Drops only the two range CHECKs; no data lives in a constraint. The app-level RULE_012 /
-- RULE_013 still refuse out-of-range values at the API after this runs.
BEGIN;
SET LOCAL lock_timeout = '5s';
ALTER TABLE guardrails_v2 DROP CONSTRAINT IF EXISTS guardrails_v2_max_position_percent_pct_range;
ALTER TABLE guardrails_v2 DROP CONSTRAINT IF EXISTS guardrails_v2_max_total_exposure_pct_range;
COMMIT;
