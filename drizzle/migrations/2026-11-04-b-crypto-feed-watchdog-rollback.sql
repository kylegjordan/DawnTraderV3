-- ROLLBACK for 2026-11-04-b-crypto-feed-watchdog.sql (not in MANIFEST).
-- Roll back the CODE first: with the code still deployed, removing the crypto witness_max_age_ms row makes the
-- close-fill contract resolve null for crypto (not-warm closes refused), and removing the passive_archive rows makes
-- the recorder silence check inert (it alerts, and the socket-close reconnect still works).
BEGIN;
DELETE FROM module_constants WHERE updated_by = 'b-crypto-feed-watchdog';
ALTER TABLE closed_trades DROP COLUMN IF EXISTS exit_ticker_age_basis;
ALTER TABLE closed_trades DROP COLUMN IF EXISTS exit_ticker_captured_at;
COMMIT;
