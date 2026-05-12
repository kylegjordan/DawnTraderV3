-- ════════════════════════════════════════════════════════════════════════════
-- B-NEW-1 (xStocks Filter Pipeline Diagnostics tracker, 2026-05-12)
-- ════════════════════════════════════════════════════════════════════════════
--
-- Tightens VTS global filter thresholds for xstock_spot so the global stage
-- actually filters instead of passing ~100%. Pre-B-NEW-1 thresholds were
-- cloned from crypto baseline (B79.0m.a/b2) and not calibrated to xstock
-- economics.
--
-- Pairs with this commit's scanner.ts change that sources real 24h share
-- volume from xstock_spot_ticker_snap and passes (shares × price) as
-- volume24hUSD to the global + pattern filters. Pre-fix the scanner
-- hardcoded volume24hUSD=0 which silently skipped the min_volume gate.
--
-- Langston review 2026-05-12 cc-inbox: APPROVED both quant + pattern values
-- as Layer-1 starters; Q1-Q4 covered. Re-tune from failure-counter telemetry
-- after 2-3 cycles for Layer-2.
--
-- xstock universe distribution (verified live via xstock_spot_ticker_snap):
--   price:  $3.95 (PLUG/BLDP)  →  $1525 (ASML)
--   24h $:  $7.8k (NBIX)       →  $1.08B (SNDK)
--
-- Long-tail illiquid names that should filter out under new thresholds:
--   NBIX/$7.8k, CBOE/$27k, ROOT/$41k, FOXA/$61k, EWA/$118k, BLDP/$478k,
--   RMD/$534k, BUD/$890k.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

-- VTS quant global filter row
UPDATE screener_filters
SET min_price = 5.00,
    max_price = 10000.00,
    min_volume = 1000000.00,
    last_updated_by = 'b-new-1-vts-quant-global-tighten-2026-05-12'
WHERE asset_class = 'xstock_spot'
  AND filter_path = 'active_quant';

-- VTS pattern filter row — more permissive than quant per Langston Q2/Q3
UPDATE screener_filters
SET min_price = 2.00,
    max_price = 10000.00,
    min_volume = 300000.00,
    last_updated_by = 'b-new-1-vts-pattern-tighten-2026-05-12'
WHERE asset_class = 'xstock_spot'
  AND filter_path = 'vts_pattern';

COMMIT;
