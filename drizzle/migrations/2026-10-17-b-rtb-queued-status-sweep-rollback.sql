-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g) rollback for part 1 (the default). Part 2 (the column drops) carries its own
-- rollback when it ships.

BEGIN;

ALTER TABLE rtb_signals ALTER COLUMN status SET DEFAULT 'queued';

COMMIT;
