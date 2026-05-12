-- ════════════════════════════════════════════════════════════════════════════
-- B-NEW (xStocks Filter Pipeline Diagnostics tracker, 2026-05-12)
-- Wire max_bid_ask_spread = 3% for xstock VTS global + pattern filter rows.
-- ════════════════════════════════════════════════════════════════════════════
--
-- Langston cc-inbox review 2026-05-12: 3% (≈6% round-trip friction) is the
-- "no strategy works" ceiling per Kyle's "obvious junk" criterion for global
-- filters. Tighter caps belong inside strategy logic, not at this layer.
--
-- Bid/ask data verified live in xstock_spot_ticker_snap (6801 rows / 5min,
-- avg spread 0.43%, max 51%). Was previously deferred under the false
-- assumption that bid/ask weren't in our archive.
--
-- Code change shipped alongside this migration: scanner.ts now sources
-- bid+ask from ticker_snap, computes spread%, passes through eval-cycle.ts
-- into both global-filter.ts and pattern-filter.ts. Both enforce the gate.
-- ════════════════════════════════════════════════════════════════════════════

BEGIN;

UPDATE screener_filters
SET max_bid_ask_spread = 3.00,
    last_updated_by = 'b-new-bidask-3pct-2026-05-12'
WHERE asset_class = 'xstock_spot'
  AND filter_path IN ('active_quant', 'vts_pattern');

COMMIT;
