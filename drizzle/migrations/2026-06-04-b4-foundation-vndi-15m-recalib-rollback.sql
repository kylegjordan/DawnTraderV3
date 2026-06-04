-- ROLLBACK for 2026-06-04-b4-foundation-vndi-15m-recalib.sql
-- Reverts the xStock IMF screen (VN/DI) 15-minute recalibration back to the
-- B79.0m.a Layer-1 (crypto-cloned) 60-minute starter values. xStock-scoped;
-- crypto untouched. Value-guarded (only reverts rows still at the recalibrated
-- value), so re-running is a no-op. Manual-apply only (not in MANIFEST).

BEGIN;

UPDATE screener_filters
   SET di_max = 30, last_updated_by = 'b4-foundation-vndi-15m-recalib-rollback'
 WHERE asset_class = 'xstock_spot'
   AND filter_path = 'active_oscillator'
   AND di_max = 40.3;

UPDATE screener_filters
   SET di_max = 35, last_updated_by = 'b4-foundation-vndi-15m-recalib-rollback'
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('active_reversal', 'vts_oscillator')
   AND di_max = 42.8;

UPDATE screener_filters
   SET di_max = 40, last_updated_by = 'b4-foundation-vndi-15m-recalib-rollback'
 WHERE asset_class = 'xstock_spot'
   AND filter_path = 'vts_reversal'
   AND di_max = 45.2;

UPDATE screener_filters
   SET vn_max = 0.85, last_updated_by = 'b4-foundation-vndi-15m-recalib-rollback'
 WHERE asset_class = 'xstock_spot'
   AND filter_path IN ('active_breakout', 'active_oscillator', 'active_reversal', 'active_trend')
   AND vn_max = 0.826;

COMMIT;
