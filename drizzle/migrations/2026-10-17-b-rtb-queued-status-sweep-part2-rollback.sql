-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g) rollback for part 2: restores the three columns, nullable and empty (they held
-- no data when dropped: 0 non-null of 21 on 2026-10-17). The forward file uses IF EXISTS, so it can be re-applied after this.

BEGIN;

ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS promoted_at timestamp with time zone;
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS promoted_trade_id varchar;
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS expired_at timestamp with time zone;

COMMIT;
