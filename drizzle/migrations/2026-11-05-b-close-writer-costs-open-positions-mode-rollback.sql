-- ═════════════════════════════════════════════════════════════════════════════
-- ROLLBACK for 2026-11-05-b-close-writer-costs-open-positions-mode.sql (B-CLOSE-WRITER-COSTS P-5).
--
-- ORDER (pre-audit rider (iii)): roll back the CODE FIRST, then run this. Reversed, the running code still names
-- `mode` on every insert and every insert fails once the column is gone.
--
-- REFUSES (raises) if any position is not paper: dropping the column would erase which mode owns it. And if two
-- positions share (symbol, side) — possible once the key is (symbol, mode) — re-adding unique_symbol_side fails by
-- itself and the whole transaction rolls back.
-- Removing the ledger row is part of the rollback, so a later re-apply runs: DELETE FROM _migrations below.
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

SET LOCAL lock_timeout = '5s';

DO $guard$
BEGIN
  IF EXISTS (SELECT 1 FROM active_open_positions WHERE mode <> 'paper') THEN
    RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS rollback refused: a non-paper open position exists; dropping mode would erase its owner';
  END IF;
END $guard$;

ALTER TABLE active_open_positions DROP CONSTRAINT unique_symbol_mode;
ALTER TABLE active_open_positions ADD CONSTRAINT unique_symbol_side UNIQUE (symbol, side);
ALTER TABLE active_open_positions DROP COLUMN mode;

DELETE FROM _migrations WHERE name = '2026-11-05-b-close-writer-costs-open-positions-mode.sql';

DO $check$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM _migrations WHERE name = '2026-11-05-b-close-writer-costs-open-positions-mode.sql';
  IF n <> 0 THEN RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-5 rollback: the forward migration is still recorded in _migrations'; END IF;
  SELECT count(*) INTO n FROM information_schema.columns WHERE table_name = 'active_open_positions' AND column_name = 'mode';
  IF n <> 0 THEN RAISE EXCEPTION 'B-CLOSE-WRITER-COSTS P-5 rollback: the mode column is still present'; END IF;
END $check$;

COMMIT;
