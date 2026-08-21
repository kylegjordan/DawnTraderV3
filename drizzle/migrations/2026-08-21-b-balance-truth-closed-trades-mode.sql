-- B-BALANCE-TRUTH Step F (#618) — give `closed_trades` the paper/live discriminator
-- every other trading table already has.
--
-- KYLE'S DECISION, 2026-08-01, verbatim: "add the column, backfill it, and make the
-- argument actually do its job." This is that decision. It is NOT a new finding —
-- #618 leg 3 has carried it since 2026-07-31.
--
-- WHY IT IS NEEDED. Seven storage readers accept a `mode` argument and NONE of them
-- applies a mode predicate, because `closed_trades` had no column to filter on:
--   getClosedTrades · getClosedTradesCount · getRealizedPnlTotal · getRealizedPnlSince
--   getDailyRealizedPnlSince · getRecentClosedPnls · getPortfolioMetricComponents
-- Safe ONLY because live mode has never been enabled. The moment live opens one
-- trade, every paper figure silently includes live trades and every live figure
-- includes paper ones — including the daily-loss kill-switch numerator.
--
-- ★ THIS RESTORES A HOUSE CONVENTION; IT DOES NOT INVENT ONE. Measured 2026-08-21:
-- 44 of the 159 tables in shared/schema.ts already carry `mode: tradingModeEnum("mode")`
-- — guardrails, guardrails_v2, screener_filters, strategy_settings, trading_signals,
-- portfolio_state, portfolio_anchor_events, telemetry_*, adaptive_learning, and the
-- legacy `trades` table among them. EXACTLY THREE lack it: closed_trades,
-- active_open_positions and active_trade_logs — the active-trading tables, which were
-- built in a later era and never picked up the convention. So the mode separation was
-- done comprehensively across the system; these three are the gap, not the rule.
-- (active_open_positions + active_trade_logs are Step G, with the delete-path fix that
--  depends on them — a delete cannot filter by a column that does not exist.)
--
-- ★ THE BACKFILL CONSTANT IS PROVEN, NOT ASSUMED, and the argument matters because a
-- backfill onto an unverified constant writes a permanent error. The airtight reason is
-- NOT "every engine session was paper" — two of the three writers are manual-close paths
-- that run outside any engine session, and orphan rows exist (#508), so session history
-- does not close over the population. It is simply: LIVE MODE HAS NEVER BEEN ENABLED,
-- so no live writer has ever existed to write any row. Every row is paper by necessity.
--
-- ★ NOT NULL WITH NO DEFAULT (Langston-endorsed). A DEFAULT 'paper' would be trivially
-- safe today and lay a Phase-21 trap: a live writer that forgot the column would
-- silently record a live trade as paper — fail-open, the shape this project keeps paying
-- for. With exactly ONE physical INSERT site (storage.ts, inside createClosedTrade) that
-- ALREADY RECEIVES the mode and discards it, "every writer must state its mode" costs one
-- line — so the safe-by-construction option is also the cheaper one, and a missed writer
-- becomes a loud insert failure instead of a silent mislabel.
--
-- Uses the EXISTING `trading_mode` enum — the same type the other 44 tables use.

ALTER TABLE closed_trades ADD COLUMN mode trading_mode;

UPDATE closed_trades SET mode = 'paper' WHERE mode IS NULL;

ALTER TABLE closed_trades ALTER COLUMN mode SET NOT NULL;
