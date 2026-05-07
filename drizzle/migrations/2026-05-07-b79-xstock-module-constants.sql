-- B79 Migration — additional module_constants seeds for xstock_spot.
--
-- Companion to 2026-05-07-b79-xstock-sqe-seeds.sql (4 SQE rows; subagent shipped).
-- This migration adds:
--   - macro_modifier baseline (1.0 = neutral; placeholder pending B79.3 equity macro inputs)
--   - orb_enabled (false; Q-D-gated activation per scope §-2 row 1 + glossary §-3)
--
-- All seeds are asset_class='xstock_spot'. Crypto path on no-touch fence.
-- Idempotent UPSERT pattern (matches subagent migration).

BEGIN;

INSERT INTO module_constants
  (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- Macro modifier — equity-equivalent macro inputs (VIX/S&P/sector) DEFERRED to B79.3
  -- per scope §-2 row 7. Day 1 placeholder is neutral 1.0, tagged pending_layer_3
  -- in description-via-updated_by so it surfaces in audit.
  ('mce_config', '*', 'xstock_spot', '*', '*', 'macro_modifier', '1.0'::jsonb, 'B79_pending_layer_3'),

  -- ORB strategy gate — file shipped Q-D-gated. Activation flips this to true
  -- after the AAPLx-vs-AAPL Q-D probe outcome supports it (correlation tier 2/3
  -- per scope §-3 glossary). DB-tunable, no redeploy.
  ('strategy_gates', '*', 'xstock_spot', 'orb', '*', 'enabled', 'false'::jsonb, 'B79_q_d_gated'),

  -- Pattern-pool guardrails inherited from crypto until Layer 3 evidence drives
  -- equity-specific tuning (per Langston rev 7 acceptance). Placeholder rows so
  -- the asset-class-scoped lookup path returns explicit values rather than
  -- silently inheriting crypto rows by accident.
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'final_score_floor', '0.45'::jsonb, 'B79_inherit_crypto'),
  ('pattern_pool_gates', '*', 'xstock_spot', '*', '*', 'max_position_pct',  '0.50'::jsonb, 'B79_inherit_crypto')

ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
  DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

COMMIT;
