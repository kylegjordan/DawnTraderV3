-- ============================================================================
-- CODEX DATA EXPORT — RAW PRIMITIVES ONLY
--
-- ⛔⛔ EVERY FEE-DERIVED, COST-DERIVED AND GATE-OUTCOME COLUMN IS OMITTED, NOT
--     LABELLED. That is a mechanism, not a preference: #1010 established that the
--     cost input to every historical decision was wrong for xStock by 8x, so any
--     derived outcome we ship is an artefact of our own defect. A caveat sheet is
--     an instruction, and B-WAKE-QUIET measured instruction-shaped safeguards at
--     three-for-three failure. An absent column cannot be audited as market
--     structure; a caveated one can.
--
-- ⛔ THE SHADOW RANKING POOL IS NOT EXPORTED AT ALL. Its only use was the
--    "does our selection add value" question, which Langston withdrew: measured on
--    this window it grades the broken selector and the verdict expires the moment
--    the operator changes. Shipping the table would invite reconstruction of a
--    question we deliberately removed from the brief.
--
-- Run on staging as the deploy user with DATABASE_URL sourced. Writes CSVs to /tmp.
-- ============================================================================

\pset pager off
SET statement_timeout = '600s';

-- ── 1. CLOSED TRADES — primitives, provenance, no economics ─────────────────
-- 706 rows. Prices, sides, quantities, times, reasons, and the full price-
-- provenance block (producer/source/observed-at/book-age), which is what the
-- price-side and freshness question needs and which nothing else carries.
\copy (SELECT id, symbol, asset_class, exchange, base_currency, mode, trade_mode, strategy_name, signal_type, pattern_type, pattern_strength, source_pool, filter_tier, side, quantity, intended_entry_price, actual_entry_price, entry_price, stop_loss, original_stop_price, take_profit, target_exit_price, actual_exit_price, exit_price, opened_at, closed_at, close_reason, confidence, regime_confidence_raw, regime_confidence_modulated, phase, phase_age_seconds, strategy_phase_weight, calibration_state, chosen_entry_mode, exit_fee_mode, exit_rest_outcome, exit_rested_at_price, exit_rest_duration_ms, ladder_rungs_hit, phantom_fill_suspect, entry_price_producer, entry_price_source, entry_decision_price, entry_observed_at_ms, entry_book_age_ms, exit_price_producer, exit_price_source, exit_decision_price, exit_observed_at_ms, exit_book_mid, exit_book_age_ms, exit_ticker_bid, exit_ticker_ask, exit_tick_cadence_ms, exit_fill_depth_age_ms, exit_book_state, exit_book_state_at_fill, exit_book_state_basis FROM closed_trades ORDER BY opened_at) TO '/tmp/cx_trades_closed.csv' CSV HEADER;

-- ── 2. THE TAPE — 1-minute bars, 7 days, every symbol, both classes ─────────
-- For the cost-hurdle question: the distribution of available move sizes is a
-- property of the market, and this is the instrument for it.
\copy (SELECT symbol, asset_class, exchange, interval_begin, open, high, low, close, volume, vwap, trade_count FROM crypto_spot_ohlc_1m_2026_09 WHERE interval_begin > now() - interval '7 days' ORDER BY symbol, interval_begin) TO '/tmp/cx_tape_1m_crypto.csv' CSV HEADER;
\copy (SELECT symbol, asset_class, exchange, interval_begin, open, high, low, close, volume, vwap, trade_count FROM xstock_spot_ohlc_1m_2026_09 WHERE interval_begin > now() - interval '7 days' ORDER BY symbol, interval_begin) TO '/tmp/cx_tape_1m_xstock.csv' CSV HEADER;

-- ── 3. QUOTES — for spread/tick structure AND the timestamp question ────────
-- ⚠️ `captured_at` IS OUR RECEIPT TIME, NOT AN EXCHANGE TIME. The venue's ticker
--    frame carries no timestamp at all (equity-spot-archiver.ts:127, #943), so
--    every age derived from this column includes network transit, queueing and our
--    own processing. This is the central open question in the brief, not a caveat.
-- ⚠️ ASYMMETRIC WINDOWS BY NECESSITY, stated rather than hidden: crypto gets 3 days
--    and xStock 1 day, because the xStock feed writes ~2.8M rows/day against
--    crypto's ~0.36M. Both are full tick resolution over every symbol - the window
--    differs, the sampling does not. DO NOT compare tick COUNTS across the two files.
\copy (SELECT symbol, asset_class, exchange, captured_at, bid, bid_qty, ask, ask_qty, last, vwap_24h, high_24h, low_24h, open_24h, prev_day_close, volume_24h, is_extended_hours FROM crypto_spot_ticker_snap_2026_09 WHERE captured_at > now() - interval '3 days' ORDER BY symbol, captured_at) TO '/tmp/cx_quotes_crypto.csv' CSV HEADER;
\copy (SELECT symbol, asset_class, exchange, captured_at, bid, bid_qty, ask, ask_qty, last, vwap_24h, high_24h, low_24h, open_24h, prev_day_close, volume_24h, is_extended_hours FROM xstock_spot_ticker_snap_2026_09 WHERE captured_at > now() - interval '1 day' ORDER BY symbol, captured_at) TO '/tmp/cx_quotes_xstock.csv' CSV HEADER;

-- ── 4. BOUNDARY INSTANTS — NOT FROM THE DATABASE ───────────────────────
-- ⚠️ There is NO deploy table. Measured: zero tables in the schema match '%deploy%'.
--    The deploy record is a FILE on the staging host, `/home/deploy/dawntrader-deploy.record`,
--    and the runner copies it verbatim rather than re-deriving it here. Recorded because an
--    exporter that silently produced no boundary file would leave the holding-period
--    stratification unsplittable and nothing would say why.

-- ── 5. THE VENUE'S CONFIRMED FEE LADDERS ────────────────────────────────────
-- ⛔ NOT from our database - our xStock rows are the #1010 defect. These are the
--    account-confirmed published rates, hand-entered from the venue's own pages.
--    The advisor applies these to the primitives above and derives its own costs.
\copy (SELECT * FROM (VALUES ('crypto_spot',1,0.0040,0.0080),('crypto_spot',2,0.0030,0.0060),('crypto_spot',3,0.0022,0.0038),('crypto_spot',4,0.0020,0.0035),('crypto_spot',5,0.0015,0.0030),('crypto_spot',6,0.0012,0.0025),('crypto_spot',7,0.0010,0.0022),('crypto_spot',8,0.0008,0.0020),('crypto_spot',9,0.0006,0.0018),('crypto_spot',10,0.0004,0.0015),('crypto_spot',11,0.0002,0.0012),('crypto_spot',12,0.0000,0.0010),('crypto_spot',13,0.0000,0.0009),('crypto_spot',14,0.0000,0.0008),('crypto_spot',15,0.0000,0.0007),('crypto_spot',16,0.0000,0.0006),('crypto_spot',17,0.0000,0.0005),('xstock_spot',1,-0.0002,0.0010),('xstock_spot',2,-0.0002,0.0008)) AS t(asset_class, rung, maker_rate, taker_rate)) TO '/tmp/cx_fee_ladder.csv' CSV HEADER;

\echo '--- row counts as exported ---'
SELECT 'trades_closed' f, count(*) FROM closed_trades;
