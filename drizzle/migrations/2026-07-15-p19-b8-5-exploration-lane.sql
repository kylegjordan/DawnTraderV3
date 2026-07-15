-- P19-B8.5 EXPLORATION LANE knobs (3-way consensus + Kyle GO 2026-07-15: budget
-- 25-30/day best-ranked-first, xStock same treatment). Paper-only by STRUCTURE
-- (the live path has no call site reading these — Langston condition-2); the knobs
-- carry no mode dimension because the lane module itself is only reachable from
-- the paper orchestrator branch. FAIL-CLOSED: the lane treats missing/unparseable
-- knobs as DISABLED. `enabled` is the lane KILL-SWITCH per class.
-- base_floor_pct: netEV as a FRACTION of entry price must exceed this (−2% start).
-- Anneal (deterministic, in code): floor_eff = min(0, base + step_pct·⌊closed_exploration/step_trades⌋).
INSERT INTO module_constants (module_name, constant_name, value, exchange, asset_class, strategy, regime, updated_by)
VALUES
  ('exploration_lane','enabled','true'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','daily_budget','28'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','base_floor_pct','-0.02'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','anneal_step_trades','50'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','anneal_step_pct','0.005'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','policy_version','1'::jsonb,'*','crypto_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','enabled','true'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','daily_budget','28'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','base_floor_pct','-0.02'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','anneal_step_trades','50'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','anneal_step_pct','0.005'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration'),
  ('exploration_lane','policy_version','1'::jsonb,'*','xstock_spot','*','*','p19-b8-5-exploration')
ON CONFLICT DO NOTHING;
