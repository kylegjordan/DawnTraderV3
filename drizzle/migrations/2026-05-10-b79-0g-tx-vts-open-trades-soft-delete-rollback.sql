-- B79.0g-tx rollback: remove the soft-delete columns + partial index.

DROP INDEX IF EXISTS vts_open_trades_open_filter_idx;
ALTER TABLE vts_open_trades DROP COLUMN IF EXISTS closed_at;
ALTER TABLE vts_open_trades DROP COLUMN IF EXISTS closed;
