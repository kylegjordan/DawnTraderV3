-- P19-B7.1 — pluggable-ranker config + degenerate-geometry microstructure floor.
--
-- The live ready-to-buy picker (ready_to_buy_service.getRankedSignals) now ranks the pool
-- by a SELECTABLE key (OBJ-1), defaulting to the expected R-multiple `R = netEV / risk_price`
-- (OBJ-2) — risk-normalized, net-of-cost, CROSS-ASSET comparable (the field-standard
-- Van-Tharp/Kelly objective; replaces the friction-blind, reward:risk-blind finalScore sort).
-- The friction-blind finalScore ("confidence") + the inert VTS rankingScore remain only as
-- shadow-A/B CONTROL arms. Selection is DB-governed with NO hidden default (CLAUDE.md §5 r15):
-- the reader (getCachedStringRequired) THROWS if this row is absent, so the seed is mandatory.
--
--   active_ranker            — 'r_multiple' (default) | 'confidence' | 'ranking_score'.
--   min_atr_fraction_floor   — OBJ-3 PRIMARY floor: a stop tighter than this × ATR is
--                              un-executable → the candidate is REJECTED from ranking before
--                              the kernel's :0 R-fallback can become a sort key. Cross-asset-
--                              clean (ATR scales with each asset's own volatility). Conservative
--                              degenerate-only default 0.10; Phase-25-tunable.
--   min_abs_risk_fraction    — the absolute-executability floor as a fraction of entry price
--                              (the cross-asset-clean fractional stand-in for a min-tick), used
--                              when ATR is unavailable. 0.0005 = 5 bps; a sub-5bps stop is
--                              un-executable given spread+fees.
--
-- Global config (asset_class/exchange/strategy/regime = wildcard) — the ranker selection is a
-- system-wide picker setting, not per-class. Read via getCachedStringRequired /
-- getCachedNumberRequired against the warmed rtb_ranking module cache.

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('rtb_ranking', 'active_ranker',          '"r_multiple"'::jsonb, '*', '*', '*', '*', NOW(), 'p19-b7-1'),
  ('rtb_ranking', 'min_atr_fraction_floor', '0.10'::jsonb,         '*', '*', '*', '*', NOW(), 'p19-b7-1'),
  ('rtb_ranking', 'min_abs_risk_fraction',  '0.0005'::jsonb,       '*', '*', '*', '*', NOW(), 'p19-b7-1')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Verify all 3 rows resolve (fail the migration loudly if the seed is incomplete).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'rtb_ranking'
     AND constant_name IN ('active_ranker', 'min_atr_fraction_floor', 'min_abs_risk_fraction');
  IF n < 3 THEN
    RAISE EXCEPTION 'P19-B7.1 seed incomplete: expected 3 rtb_ranking ranker rows, found %', n;
  END IF;
END $$;

COMMIT;
