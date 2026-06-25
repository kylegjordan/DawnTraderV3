-- P19-B6.6 (#236) — xStock price-discovery-LIVENESS fill-gate knobs (module_constants).
--
-- The 2nd half of the fill-time "is the book real?" guard (1st half = the B4b.1
-- book-depth-sufficiency gate, #295). Both fire at the engine open seam, fail-closed;
-- depth runs FIRST (cheap top-of-book row), liveness only on depth-pass.
--
-- Resolved by server/asset_classes/xstock_spot/price-liveness.ts → resolvePriceLivenessConfig
-- (fail-CLOSED if absent/mistyped — CLAUDE.md rule 11/15: a missing safety knob blocks the
-- fill loudly, never silently defaults). Per-asset-class; exchange/strategy/regime = wildcard.
-- xstock_spot ONLY — crypto trades 24/7 globally (no holiday/halt analog); a liveness gate on
-- a quiet altcoin would false-block. DORMANT until P19-B7b turns xStock active-paper on (§9.1).
--
-- SEED VALUES + CALIBRATION (P19_B6_6_PRE_AUDIT.md §0E — measured from 3 weekday sessions of
-- archived xstock_spot_ticker_snap; a `last` CHANGE = a real trade print):
--
--   window_ms        = 2,700,000  -- 45 min, PINNED. Passes every genuinely-active admitted
--                                    name with >=2x margin (worst-day in-RTH inter-trade p99
--                                    <=20m) while EXCLUDING the deep-but-slow ETF/foreign-equity
--                                    tokens (EWN/EWP/TOTL, p99 42-68m) whose ~50-min cadence
--                                    makes any fill a stale-reference fill. Justified by type-II
--                                    frozen-but-quoted-book detection speed (a longer window is
--                                    strictly worse there and does NOT rescue the slow tail —
--                                    EWN's 68m quiet-day p99 clears 60m anyway), NOT "p99 margin".
--                                    Tier-extensible (a more-specific module_constants row) if
--                                    post-B7b live data shows a genuinely-active name slower than
--                                    45m (RUNNING_ISSUES #391).
--   min_moves        = 1          -- >=1 `last` change in the window = "price-discovering".
--   min_snaps        = 5          -- need >=5 snapshots in the window to trust a "flat" verdict;
--                                    fewer → sparse_snapshots (insufficient evidence → block).
--   query_timeout_ms = 2000       -- hard timeout on the windowed scan; timeout → FAIL-CLOSED
--                                    (block), never pass. The scan is index-bounded
--                                    (xstock_spot_ticker_snap_<part>_symbol_captured_at_idx).
--   enabled          = true       -- gate ON. (Kill-switch: false → gate passes through.)

BEGIN;

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('price_discovery_liveness', 'window_ms',        '2700000'::jsonb, 'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-6'),
  ('price_discovery_liveness', 'min_moves',        '1'::jsonb,       'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-6'),
  ('price_discovery_liveness', 'min_snaps',        '5'::jsonb,       'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-6'),
  ('price_discovery_liveness', 'query_timeout_ms', '2000'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-6'),
  ('price_discovery_liveness', 'enabled',          'true'::jsonb,    'xstock_spot', '*', '*', '*', NOW(), 'p19-b6-6')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- Verify all 5 rows resolve (fail the migration loudly if the seed is incomplete).
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM module_constants
   WHERE module_name = 'price_discovery_liveness' AND asset_class = 'xstock_spot';
  IF n < 5 THEN
    RAISE EXCEPTION 'P19-B6.6 seed incomplete: expected 5 price_discovery_liveness/xstock_spot rows, found %', n;
  END IF;
END $$;

COMMIT;
