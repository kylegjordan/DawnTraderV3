-- db-migrate:skip
-- B-NEW-43 Phase 2 chunk 4.7 (2026-05-23): bulk skip-marker added. This
-- migration's effects are already captured in 2026-04-22-initial-schema.sql
-- (pg_dump of staging state on 2026-05-23). On a fresh empty Postgres,
-- initial-schema applies the FINAL state; re-running this delta would
-- duplicate-create or otherwise conflict (idempotent ALTER-IF-NOT-EXISTS
-- migrations would no-op but still run unnecessarily; non-idempotent ones
-- would error). Skip-marker ledger-records as applied without running the
-- SQL. See scripts/db-migrate.ts SKIP_MARKER + 1-system-manual/staging-
-- coordination/2026-04-22-initial-schema-mark-applied.sql for the full
-- staging-vs-CI bootstrap divergence model.
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
