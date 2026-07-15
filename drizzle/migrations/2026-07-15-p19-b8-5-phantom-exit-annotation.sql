-- P19-B8.5 (soak fix C, prong 3 — Langston refinement 3) — annotate the five
-- phantom-priced XRP/GBP closed trades so learning reads can exclude them.
--
-- These five stop_hit closes (2026-07-15 06:18–06:56Z) were TRIGGERED and their
-- gross_pnl / target_exit_price / exit_slippage decomposition PRICED off the Binance
-- ghost-market fallback (delisted XRPGBP, static 0.5257 vs real ~0.827 — see
-- RUNNING_ISSUES #509 context + the C fix). The actual FILLS walked the real book, so
-- net_pnl is honest — but the decomposition is contaminated and the stops themselves
-- were phantom (the market never approached the real stop). KEEP-AS-DATA (#405
-- pattern): annotate, never delete; Phase-25 / any learning read filters on
-- metadata->>'phantomExit'. Idempotent (re-run adds nothing new).
UPDATE closed_trades
SET metadata = COALESCE(metadata, '{}'::jsonb) || jsonb_build_object(
  'phantomExit', true,
  'phantomExitNote', 'exit triggered+decomposed off the Binance ghost-market fallback (delisted XRPGBP, static 0.5257); net_pnl honest, gross/target_exit/exit_slippage contaminated, stop trigger phantom — EXCLUDE from learning reads'
)
WHERE symbol = 'XRP/GBP'
  AND close_reason = 'stop_hit'
  AND closed_at >= '2026-07-15T06:15:00Z' AND closed_at < '2026-07-15T07:00:00Z'
  AND (metadata->>'phantomExit') IS NULL;
