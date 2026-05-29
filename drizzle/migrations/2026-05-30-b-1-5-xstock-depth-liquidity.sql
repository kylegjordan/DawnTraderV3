-- ════════════════════════════════════════════════════════════════════════════
-- B.1.5 — xStock depth-based liquidity filter migration
-- ════════════════════════════════════════════════════════════════════════════
--
-- Adds `min_depth_usd` column to `screener_filters` + seeds xstock_spot rows
-- with starter depth thresholds. Also sets xstock_spot `min_volume = 0` to
-- neutralize the now-inert broken-volume gate (the ws-equities ticker `volume`
-- field carries the UNDERLYING equity's share volume, ~700× the token's actual
-- volume, so the existing min_volume gate was effectively never rejecting an
-- xStock pair anyway — see pre-audit §1 + §2 Row-1).
--
-- The real xStock liquidity screen lives at MIN(askDepthUsd, bidDepthUsd)
-- against `min_depth_usd`, computed from the rolling-median 20-min window in
-- xstock_spot/scanner.ts. Both filter lanes (quant + pattern) consume it.
--
-- Threshold starter values calibrated against measured overnight depth (B.1.5
-- pre-audit R-fold-1 staging de-risk 2026-05-29):
--   median top-of-book bid-USD: ~$33K
--   p10 top-of-book bid-USD:    ~$11K
--   observed range:             ~$1.5K - $250K+
--
-- Choice of seeded thresholds:
--   vts_quant / vts_pattern     → min_depth_usd = 2000  (looser; admit thin
--                                                        names so VTS gathers
--                                                        learning data on them)
--   active_quant / active_pattern → min_depth_usd = 5000  (stricter; refuse
--                                                          genuinely-empty
--                                                          books only; sizing
--                                                          headroom plenty at
--                                                          ~$150-250 per-trade
--                                                          on a ~$830-$1,330
--                                                          portfolio)
--
-- Sizing-based depth caps (the "real" stuck-trade protection at materially
-- larger trade sizes) are intentionally NOT here — deferred to Phase 25 item
-- 25-11 per Kyle directive 2026-05-29 (at $150-250 per trade vs $11K-$250K
-- depth, a participation cap cannot physically bind → dead code today).
--
-- Crypto rows left NULL (untouched): B.1.5 isolation pillar. Crypto's volume-
-- based LQ is not broken — Kraken reports the token's real volume for crypto.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- 1. Add min_depth_usd column. NULL by default; xstock_spot rows seeded below.
ALTER TABLE screener_filters
  ADD COLUMN IF NOT EXISTS min_depth_usd NUMERIC(20, 2);

COMMENT ON COLUMN screener_filters.min_depth_usd IS
  'B.1.5: minimum two-way top-of-book depth (USD) required for filter admission. Gate fires on MIN(askDepthUsd, bidDepthUsd) computed from the scanner''s rolling-median ~20-min window. NULL → gate skipped (graceful default). Seeded for xstock_spot only; crypto_spot uses volume-based LQ.';

-- 2. Seed xstock_spot min_depth_usd starter values per filter_path.
--    Same value applies to both paper and live mode for now (consistent with
--    the existing pattern where xstock filter values are paper-mirror-of-live).
UPDATE screener_filters
   SET min_depth_usd = 2000
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('vts_quant', 'vts_pattern');

UPDATE screener_filters
   SET min_depth_usd = 5000
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('active_quant', 'active_pattern');

-- 3. Neutralize the now-inert min_volume gate for xstock_spot. The
--    `volume24hUSD` value flowing into the gate is the underlying equity's
--    share volume (the broken signal B.1.5 fixes); leaving min_volume at any
--    positive number would still allow the gate logic to (rarely) misfire on
--    edge inputs. Setting to 0 makes the gate inert by its own skip-on-0
--    clause (xstock_spot/global-filter.ts:117, pattern-filter.ts:199).
UPDATE screener_filters
   SET min_volume = 0
 WHERE asset_class = 'xstock_spot';

COMMIT;

-- ════════════════════════════════════════════════════════════════════════════
-- Post-migration verification (run separately on staging Step-7):
--
-- SELECT mode, filter_path, min_volume, min_depth_usd
--   FROM screener_filters
--  WHERE asset_class = 'xstock_spot'
--  ORDER BY mode, filter_path;
--
-- Expected: all xstock_spot rows show min_volume=0 and min_depth_usd in
--           (2000, 5000) per the seeding above; crypto_spot rows untouched
--           (min_depth_usd stays NULL, min_volume unchanged).
--
-- SELECT count(*) FROM screener_filters
--   WHERE asset_class = 'xstock_spot' AND min_depth_usd IS NULL;
-- Expected: 0.
-- ════════════════════════════════════════════════════════════════════════════
