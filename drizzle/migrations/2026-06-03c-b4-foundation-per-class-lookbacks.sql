-- B.4 foundation (Step-3) — per-class TIME-ANCHORED lookback seeds (xStock only).
--
-- Part of the xStock 60-min -> 15-min evaluation-bar switch (scope
-- B_4_FOUNDATION_SCOPE.md v2; pre-audit B_4_FOUNDATION_PRE_AUDIT.md). The regime
-- + DBS lookbacks were hardcoded BAR counts that silently assumed a 60-minute
-- bar. At 15-minute bars each count spans a quarter of the time, so the xStock
-- values are re-expressed here to PRESERVE the intended wall-clock window.
--
-- These are DETERMINISTIC wall-clock conversions (not study-derived), so they
-- ship in the plumbing chunk. The recalibrated regime/VN-DI THRESHOLD values
-- (study-derived) ship in a later chunk after the 15m bars + DBS recompute exist.
--
-- ── CRYPTO ISOLATION (Langston Step-4 hard-fail gate, §5) ──────────────────
-- NO crypto / global (*) rows are seeded. The crypto regime path uses the
-- shared hardcoded 30 / 14 in DEFAULT_REGIME_CONFIG / MCE.assembleRegimeConfig
-- (bit-identical to the prior literals) and crypto DBS uses DEFAULT_DBS_CONFIG
-- (48 / 12 / 26) UNCHANGED — neither reads these xstock_spot keys. So crypto is
-- untouched BY CONSTRUCTION (stronger than seed-parity): there is no new key in
-- the crypto resolution path at all. Only the xStock production path
-- (MCE.computeContext override + the xStock scanner DBS sites) reads these.
--
-- ── Values (intended wall-clock preserved) ────────────────────────────────
--   regime_classifier.momentum_lookback  30 bars@60m (30h)  -> 120 bars@15m (30h)
--   regime_classifier.adx_period         14 bars@60m (14h)  ->  56 bars@15m (14h)
--   directional_bias.lookback_period     48 bars@60m (48h)  -> 192 bars@15m (48h)
--   directional_bias.ema_fast            12 bars@60m (12h)  ->  48 bars@15m (12h)
--   directional_bias.ema_slow            26 bars@60m (26h)  -> 104 bars@15m (26h)
--
-- ⚠️ Values MUST stay NUMERIC (jsonb number, e.g. 120 not "120"): the resolver
-- keeps only numeric rows; a string would be dropped -> the consumer hard-fails
-- (getConstant undefined -> refreshRegimeConfig throws; xStock DBS builder
-- throws). That is the intended no-silent-default behavior, but seed numbers.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  -- Regime classifier lookbacks (read by MCE.refreshRegimeConfig -> computeContext override)
  ('regime_classifier', 'momentum_lookback', '120'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b4-foundation'),
  ('regime_classifier', 'adx_period',         '56'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b4-foundation'),
  -- DBS config lookbacks (read by the xStock scanner DBS sites + the 15m recompute)
  ('directional_bias', 'lookback_period',    '192'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b4-foundation'),
  ('directional_bias', 'ema_fast',            '48'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b4-foundation'),
  ('directional_bias', 'ema_slow',           '104'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'b4-foundation')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_at = NOW(), updated_by = 'b4-foundation';

COMMIT;
