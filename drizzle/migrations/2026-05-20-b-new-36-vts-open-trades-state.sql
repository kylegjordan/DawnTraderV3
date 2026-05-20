-- B-NEW-36 sub-batch (b) — vts_open_trades.state column with CHECK constraint.
--
-- Adds a 3-value lifecycle marker to support the off-hours session-lifecycle
-- controller's weekend-suspend / weekend-restart hooks for xstock_spot trades:
--   - 'open'              — normal active trade (default)
--   - 'weekend_suspended' — paused during Fri 8PM ET → Sun 8PM ET weekend close
--                           (xstock_spot ONLY; CHECK enforces)
--   - 'closed'            — trade has been closed (mirrors closed=true)
--
-- The existing `closed BOOLEAN` from B79.0g-tx is preserved for backward
-- compatibility. The CHECK constraint locks closed↔state consistency AND
-- state↔asset_class consistency per scope §2 R1+R1.1 (Langston rev3 +
-- rev4 ACK). DB-side enforcement of the asset_class scoping prevents the
-- silent-stuckness failure mode where a buggy code path marks a crypto
-- trade weekend_suspended → it falls out of the sim cycle filter → stays
-- stuck forever.
--
-- Migration ordering invariant (pre-audit §4.4): MUST be applied BEFORE
-- the new vts-runner code starts reading the column. Standard staging
-- deploy must explicitly run `npm run db:migrate` between `npm run build`
-- and `pm2 restart dawntrader`. B-NEW-36 sub-batch (a) ledger reconciliation
-- (shipped 2026-05-20) unblocks the runner so this migration applies
-- cleanly through `db:migrate`.
--
-- Reference: Claude Comms and Packages/Scope Files/B_NEW_36_SCOPE.md §2;
--            Claude Comms and Packages/Scope Files/B_NEW_36_PRE_AUDIT.md §3.11 + §4.1

BEGIN;

-- Add the state column with NOT NULL DEFAULT 'open' so every existing row
-- starts at 'open'. The same-migration UPDATE below corrects historical
-- closed=true rows to state='closed' atomically before the CHECK lands.
ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS state VARCHAR(32) NOT NULL DEFAULT 'open';

-- Backfill: any row that's already closed should have state='closed' to
-- satisfy the CHECK constraint added below. Runs in the same transaction
-- as the ADD COLUMN so there's never a moment where the constraint exists
-- but the data is inconsistent.
UPDATE vts_open_trades
   SET state = 'closed'
 WHERE closed = true
   AND state <> 'closed';

-- CHECK locks two invariants:
--   1. closed↔state: open trades may be 'open' or 'weekend_suspended';
--      closed trades MUST be 'closed'.
--   2. state↔asset_class: 'weekend_suspended' is only valid for xstock_spot
--      trades. Crypto trades can never enter that state (no weekend close).
ALTER TABLE vts_open_trades
  ADD CONSTRAINT vts_open_trades_state_consistency
  CHECK (
    (
      (closed = false AND state IN ('open', 'weekend_suspended'))
      OR
      (closed = true AND state = 'closed')
    )
    AND
    (state <> 'weekend_suspended' OR asset_class = 'xstock_spot')
  );

COMMENT ON COLUMN vts_open_trades.state IS
  'B-NEW-36 (2026-05-20): lifecycle marker. Values: open | weekend_suspended | closed. '
  'CHECK constraint vts_open_trades_state_consistency enforces closed↔state AND '
  'state↔asset_class (weekend_suspended xstock_spot-only). New code reads `state`; '
  '`closed` boolean preserved for backward compat (kept in sync via markOpenTradeClosed).';

COMMIT;
