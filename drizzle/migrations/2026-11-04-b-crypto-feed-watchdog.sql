-- B-CRYPTO-FEED-WATCHDOG (#1232, sprint row 33a) — the recorder silence check, the recorder live-share grade,
-- the vouched witness, and the witness's age on the record.
-- Scope:     Claude Comms and Packages/Scope Files/B_CRYPTO_FEED_WATCHDOG_SCOPE.md (r2, Langston PROCEED)
-- Pre-audit: Claude Comms and Packages/Scope Files/B_CRYPTO_FEED_WATCHDOG_PRE_AUDIT.md (Langston PROCEED, C1-C3)
--
-- (1) Two nullable closed_trades columns: WHEN the close's ticker witness was captured, and how that was known.
-- (2) `passive_archive` rows the recorder connection watch REQUIRES (recorder-connection.ts). A missing row makes the
--     check INERT and raises `passive-archive-config-missing` — never a silent default (rule 15).
-- (3) `feed_health` rows for the crypto recorder's per-connection live-share grade (feed-integrity-monitor.ts).
-- (4) `close_fill_contract.witness_max_age_ms` for crypto_spot — now a REQUIRED key for that class: without it the
--     contract resolves null and not-warm crypto closes are refused (fail-closed), so this row ships with the code.
--
-- DERIVATIONS (staging, read-only, 2026-11-04; pre-audit A1, A4, A5, A6):
--  * crypto_spot_silence_ms 120000 — healthy shard0 on 2026-10-20 (196 symbols, 161,755 recorder rows): largest gap
--    between consecutive rows across the whole shard 19.2 s, p99.9 4.4 s; healthy shard1 since: daily max 6.3-21.5 s.
--    Smallest plausible shard ~150 symbols (SHARD_SIZE 300 ⇒ two shards only above 300) ⇒ expected max ~25 s;
--    120 s is >= 4.8x. Rows are throttled to 1/s per symbol, so frames arrive at least this often.
--  * futures_silence_ms 120000 — crypto-perp (139 symbols) daily max gap 5.5-42 s and xStock-perp (10 symbols)
--    5.9-40 s on 10-27 → 11-03, apart from the shared pauses of 10-29/10-30 (A2) ⇒ >= 2.9x.
--  * recorder_watch_consecutive_forced_alert 3, recorder_watch_forced_per_hour_alert 12 — natural venue cuts run
--    5-13 a DAY per connection (A1); a FORCED reconnect means 120 s of data silence, so 3 in a row that bring no data
--    back, or more than 12 forced in one hour, is far outside normal.
--  * recorder_watch_clear_after_data_ms 600000 — the alert clears after 10 min of continuous data on the new socket.
--  * recorder_subscribe_reply_timeout_ms 15000 — wire capture 2026-11-04: every subscribe reply arrived within 26 ms
--    of the request; 15 s is generous for ~210 symbols x 2 channels.
--  * feed_health.recorder_live_window_ms 7200000, recorder_live_share_floor 0.60 — share of the subscribed symbols with
--    a ticker update in the trailing window: 2 h healthy 0.80-0.99 (Tuesday 10-20, hourly), 0.785+ (Sunday 11-01,
--    Langston); half-dead 0.38-0.44 (10-22 → 11-03). The SAME window is the warmth gate (Langston C2): the grade is
--    NOT GRADED for the first 2 h after every process start.
--  * close_fill_contract.witness_max_age_ms 21600000 (crypto_spot) — 6 h = 2 x the healthy per-symbol max gap within
--    shard0 (2.97 h, 10-20). A BACKSTOP beside the recorder-liveness test, not the test: a quiet coin's newest row is
--    legitimately hours old. Re-read after the deploy (Step 7: fewer spurious reconnects ⇒ fewer subscribe snapshots
--    ⇒ the legitimate gap may lengthen).

BEGIN;

ALTER TABLE closed_trades
  ADD COLUMN IF NOT EXISTS exit_ticker_captured_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS exit_ticker_age_basis TEXT;

COMMENT ON COLUMN closed_trades.exit_ticker_captured_at IS
  'WHEN the ticker witness in exit_ticker_bid/ask was captured (the recorder row''s captured_at). Age = closed_at - exit_ticker_captured_at. NULL when no witness was stored, or when exit_ticker_age_basis = underivable. B-CRYPTO-FEED-WATCHDOG #1232: on 2026-10-21 -> 11-04 thirteen crypto closes carried a witness 2-13 days old with no way to tell.';
COMMENT ON COLUMN closed_trades.exit_ticker_age_basis IS
  'How exit_ticker_captured_at was known: at_close (stamped by closePosition from getTickerWitness().capturedAtMs) | backfill_matched (derived by matching the stored bid/ask to the recorder row, exact numeric equality, captured_at <= closed_at) | underivable (no matching row could be found). NULL when no witness was stored. B-CRYPTO-FEED-WATCHDOG #1232.';

INSERT INTO module_constants
  (module_name, constant_name, value, asset_class, exchange, regime, strategy, updated_at, updated_by)
VALUES
  ('passive_archive', 'crypto_spot_silence_ms',                  '120000'::jsonb,   '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('passive_archive', 'futures_silence_ms',                      '120000'::jsonb,   '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('passive_archive', 'recorder_watch_consecutive_forced_alert', '3'::jsonb,        '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('passive_archive', 'recorder_watch_forced_per_hour_alert',    '12'::jsonb,       '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('passive_archive', 'recorder_watch_clear_after_data_ms',      '600000'::jsonb,   '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('passive_archive', 'recorder_subscribe_reply_timeout_ms',     '15000'::jsonb,    '*', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('feed_health',     'recorder_live_window_ms',                 '7200000'::jsonb,  'crypto_spot', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('feed_health',     'recorder_live_share_floor',               '0.60'::jsonb,     'crypto_spot', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog'),
  ('close_fill_contract', 'witness_max_age_ms',                  '21600000'::jsonb, 'crypto_spot', '*', '*', '*', NOW(), 'b-crypto-feed-watchdog')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

DO $$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM module_constants WHERE updated_by = 'b-crypto-feed-watchdog';
  IF n <> 9 THEN
    RAISE EXCEPTION 'B-CRYPTO-FEED-WATCHDOG seed incomplete: expected 9 rows, found %', n;
  END IF;
END $$;

COMMIT;
