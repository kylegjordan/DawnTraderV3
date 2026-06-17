-- P19-B6.5c ROLLBACK — re-add the cwqi column to rtb_signals.
--
-- DOCUMENTED ASYMMETRY: the original column was `numeric NOT NULL` with NO default — which was itself
-- the drift bug that rejected every insert. This rollback deliberately re-adds it as NULLABLE, NOT as
-- NOT-NULL-no-default: (a) re-adding NOT-NULL-no-default to a now-populated table is impossible, and
-- (b) restoring the broken state would re-break inserts. The rollback restores the column's PRESENCE
-- for an emergency revert only; the single-column index is recreated for symmetry.
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS cwqi numeric;
CREATE INDEX IF NOT EXISTS rtb_signals_cwqi_idx ON rtb_signals (cwqi);
