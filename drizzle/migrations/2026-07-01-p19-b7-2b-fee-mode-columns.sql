-- P19-B7.2b (OBJ-B) — carry the maker/taker entry-fee mode onto the trade records.
--
-- B7.2b completes the shared maker/taker decision (the VTS now calls the same
-- decideMakerTaker the active path uses) and surfaces, per trade, WHICH fee mode the
-- ENTRY opened on (maker vs taker) + the actual per-side entry fee rate used. The
-- chosen mode is already on rtb_signals (B7.2); this carries it onto the open-position
-- and closed-trade records so the UI can show it on the open-trades + closed-trades
-- tables for BOTH active-paper and the VTS.
--
-- THREE DB tables (the VTS-closed store is `vts_trades_*.json` files — handled in code,
-- no migration): active-paper open = paper_sim_open_positions, active-paper closed =
-- paper_sim_trades, VTS open = vts_open_trades (raw-SQL-managed, not a drizzle table).
--
-- NULL-not-guessed (rule-10 / Langston Step-2): a pre-B7.2b row has NO recorded entry
-- mode, so the column stays NULL — never coerced to a default 'taker', which would
-- fabricate a fee figure that never happened. The UI renders NULL as an em-dash.
-- ENTRY-leg only (the exit pays taker both classes today).

BEGIN;

ALTER TABLE paper_sim_open_positions
  ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8),
  ADD COLUMN IF NOT EXISTS entry_fee_rate    numeric(10,6);

ALTER TABLE paper_sim_trades
  ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8),
  ADD COLUMN IF NOT EXISTS entry_fee_rate    numeric(10,6);

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS chosen_entry_mode varchar(8),
  ADD COLUMN IF NOT EXISTS entry_fee_rate    numeric(10,6);

-- P19-B7.2b (Kyle model 2026-07-01) — DROP the B7.2 in-queue make-then-take ladder
-- columns. They were the WRONG stage: a signal in the RTBQ carries a maker/taker
-- DECISION only; the maker resting order lives post-promotion (on Kraken) = Phase-21.
-- Never populated in prod (active trading OFF → the maker-POST branch never ran), so a
-- clean drop. The convert-safety / maker_pending code is removed (see
-- DELETED_COMPONENTS_LOG). The decision snapshot columns (chosen_entry_mode /
-- chosen_net_ev / taker_net_ev / maker_net_ev_adjusted, added by the B7.2 migration)
-- STAY — they carry the live decision the ranker + [11.8B] gate read.
ALTER TABLE rtb_signals
  DROP COLUMN IF EXISTS maker_pending,
  DROP COLUMN IF EXISTS maker_posted_at,
  DROP COLUMN IF EXISTS maker_limit_price,
  DROP COLUMN IF EXISTS maker_budget_expires_at;

COMMIT;
