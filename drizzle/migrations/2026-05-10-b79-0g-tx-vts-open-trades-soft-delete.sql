-- B79.0g-tx — closed-flag soft-delete for vts_open_trades.
-- Replaces the fire-and-log DELETE-on-close pattern with an awaited
-- UPDATE so the close-time state flip becomes atomic at the Postgres
-- row level (single UPDATE round-trip). Soft-deleted rows GC'd by a
-- boot-time sweep keyed off module_constants.data_lifecycle.
--
-- NOTE: This migration runs OUTSIDE a transaction because
-- CREATE INDEX CONCURRENTLY cannot run inside a tx block. Apply via
-- raw `psql -f` directly — do NOT wrap in BEGIN/COMMIT.

ALTER TABLE vts_open_trades
  ADD COLUMN IF NOT EXISTS closed    BOOLEAN     NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS closed_at TIMESTAMPTZ NULL;

CREATE INDEX CONCURRENTLY IF NOT EXISTS vts_open_trades_open_filter_idx
  ON vts_open_trades (id)
  WHERE closed = false;

COMMENT ON COLUMN vts_open_trades.closed IS
  'B79.0g-tx — soft-delete flag. Open trades have closed=false. Trade-close UPDATE flips to true with closed_at=NOW(). Boot-time sweep DELETEs rows past data_lifecycle.vts_open_trades.closed_gc_retention_days.';

COMMENT ON COLUMN vts_open_trades.closed_at IS
  'B79.0g-tx — wall-clock timestamp of the soft-delete UPDATE. NULL while the trade is open.';
