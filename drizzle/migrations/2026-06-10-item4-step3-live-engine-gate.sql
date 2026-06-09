-- ITEM-4 Phase B step 3 (2026-06-10) — the LIVE-engine Phase-21 gate
-- Live mode ALWAYS places real orders (Kyle Gate-2 correction #1) and its real
-- engine build is Phase 21. Until then the /trading/start route REFUSES
-- mode='live' with 409 LIVE_ENGINE_PHASE21_GATED (no state flip — a half-on
-- live flag with no engine would be a lying state; Langston step-3 ACK).
-- FAIL-CLOSED: a missing row or failed read is treated as FALSE.
-- NUMERIC GATE SEMANTICS (the B72 numeric resolver skips jsonb booleans):
-- 0 = disabled, 1 = enabled. Phase-21 go-live sets the value to 1 (paper-trailed in
-- POST_AUDIT_ROADMAP).
--
-- Rollback: DELETE FROM module_constants WHERE module_name='live_engine_gate';

INSERT INTO module_constants (
  module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by
) VALUES
  ('live_engine_gate', '*', '*', '*', '*', 'live_engine_enabled', '0'::jsonb, 'item4-step3')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO NOTHING;
