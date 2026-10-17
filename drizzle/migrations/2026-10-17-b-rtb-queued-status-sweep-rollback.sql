-- B-RTB-QUEUED-STATUS-SWEEP (#1204, row 59g) rollback.
--
-- Restores the 'queued' default and the three columns, nullable and empty (they held no data when dropped: 0 non-null of
-- 24 on 2026-10-17). Re-applying the forward file after this is safe (IF EXISTS on every drop).

BEGIN;

ALTER TABLE rtb_signals ALTER COLUMN status SET DEFAULT 'queued';

ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS promoted_at timestamp with time zone;
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS promoted_trade_id varchar;
ALTER TABLE rtb_signals ADD COLUMN IF NOT EXISTS expired_at timestamp with time zone;

COMMIT;
