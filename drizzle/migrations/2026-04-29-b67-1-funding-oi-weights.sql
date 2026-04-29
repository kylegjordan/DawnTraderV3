-- B67.1 follow-up — Promote BTC/ETH funding-rate OI-weighting to module_constants
--
-- Per Kyle directive 2026-04-29 ("all fallbacks/hardcoded constants in the DB"):
-- the BTC/ETH funding-rate weighting (previously hardcoded 0.6/0.4 in
-- external-macro-feed.ts) is now resolved from module_constants on each feed
-- poll. Allows operators to adjust the OI weighting without code redeploy as
-- the BTC vs ETH dominance ratio shifts over time.
--
-- Defaults (0.60 / 0.40) reflect approximate current OI dominance. Tuneable.

BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_funding_btc_weight',
   '0.60'::jsonb,
   'b67.1-followup-funding-weights'),
  ('macro_modifier', '*', '*', '*', '*', 'b67_1_funding_eth_weight',
   '0.40'::jsonb,
   'b67.1-followup-funding-weights')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET
  value = EXCLUDED.value,
  updated_by = EXCLUDED.updated_by,
  updated_at = NOW();

COMMIT;
