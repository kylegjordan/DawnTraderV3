-- B.4 foundation — xStock IMF screen (VN/DI) 15-minute recalibration.
--
-- Part of the xStock 60-min -> 15-min evaluation-bar switch (scope
-- B_4_FOUNDATION_SCOPE.md v2; study + finalization in
-- B_4_VNDI_RECALIB_STUDY_RESULTS.md; Langston signed off 2026-06-04).
-- Active trading OFF. xStock-scoped; crypto untouched (crypto_spot
-- screener_filters rows are not referenced here).
--
-- WHY: VN and DI are FULL-ARRAY IMF statistics. At 15m the live IMF array is
-- 240 bars (= MAX_BARS_15M) vs 60 at 60m, over the same ~60h wall-clock.
-- Study `scripts/b4-vndi-recalib-study.ts` (104,309 60m windows + 307,923 15m
-- windows, 485 symbols, clean 1m-rebuild) found:
--   • VN (vol-noise, a normalized MAD/median ratio) is NEARLY BAR-INVARIANT
--     (median ratio 0.993). Only the loosest active vn_max edge drifts a
--     meaningful amount, and it drifts LOOSER (+3.4pp).
--   • DI (directional-integrity) CONTRACTS toward 50 at 15m (the longer array
--     averages out net drift), so a fixed di_max admits a SMALLER fraction —
--     the active di_max edges silently tighten ~10x.
--
-- Method: percentile-preserving (each 60m cutoff mapped to the 15m value at its
-- 60m percentile rank), CALIBRATION-LENS rounding. Only edges that are ACTIVE
-- (bind on the distribution) AND bar-sensitive are moved; inert edges (di_min
-- below the DI floor, di_max=100 above the ceiling) are LEFT untouched at both
-- bar sizes. vn_max 0.95/0.98 are LEFT intentionally ~1.25pp TIGHTER at 15m
-- (they drift tighter, which is lens-conservative; the percentile-preserving
-- candidates 0.980/0.998 would loosen them toward the 1.0 clamp — the forbidden
-- direction). That intentional residual is recorded in CHANGES_AND_FIXES /
-- the B.4 completion notes (Langston condition, 2026-06-04).
--
-- Each UPDATE is value-guarded (only flips rows still at the old value), so
-- re-running is a no-op. live + paper rows hold identical IMF values, so the
-- updates intentionally span BOTH modes (no mode filter). DB is the SSOT for
-- these thresholds (read at runtime by the IMF evaluator).
--
-- Reference: drizzle/migrations/2026-05-11-b79-0m-a-xstock-family-imf-seeds.sql
--            (the Layer-1 crypto-cloned starter values being recalibrated here).

BEGIN;

-- ── di_max recalibration (the load-bearing fix; restores 60m admit fractions) ──
-- di_max 30 -> 40.3  (active_oscillator; 60m admit 1.42% -> would be 0.00% at 15m)
UPDATE screener_filters
   SET di_max = 40.3, last_updated_by = 'b4-foundation-vndi-15m-recalib'
 WHERE asset_class = 'xstock_spot'
   AND filter_path = 'active_oscillator'
   AND di_max = 30;

-- di_max 35 -> 42.8  (active_reversal, vts_oscillator; 60m 5.02% -> 0.13% at 15m)
UPDATE screener_filters
   SET di_max = 42.8, last_updated_by = 'b4-foundation-vndi-15m-recalib'
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('active_reversal', 'vts_oscillator')
   AND di_max = 35;

-- di_max 40 -> 45.2  (vts_reversal; 60m 13.89% -> 1.21% at 15m)
UPDATE screener_filters
   SET di_max = 45.2, last_updated_by = 'b4-foundation-vndi-15m-recalib'
 WHERE asset_class = 'xstock_spot'
   AND filter_path = 'vts_reversal'
   AND di_max = 40;

-- ── vn_max recalibration (only the one edge that drifts LOOSER) ──
-- vn_max 0.85 -> 0.826  (active_breakout/oscillator/reversal/trend; 60m admit
-- 85.81% -> would be 89.24% at 15m = +3.4pp looser; lens: never silently loosen)
UPDATE screener_filters
   SET vn_max = 0.826, last_updated_by = 'b4-foundation-vndi-15m-recalib'
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('active_breakout', 'active_oscillator', 'active_reversal', 'active_trend')
   AND vn_max = 0.85;

-- LEFT UNTOUCHED (documented decisions, not omissions):
--   • vn_max 0.95, 0.98  — drift slightly TIGHTER (lens-conservative); recorded residual.
--   • all di_min (0/3/5/10/15) — below the DI floor at both bar sizes (inert).
--   • all di_max = 100   — above the DI ceiling at both bar sizes (inert).

COMMIT;
