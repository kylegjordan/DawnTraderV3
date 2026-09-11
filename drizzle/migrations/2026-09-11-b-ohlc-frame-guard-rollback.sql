-- Rollback for 2026-09-11-b-ohlc-frame-guard.sql — operator-only, NOT registered in MANIFEST.
-- Removes only the row that migration seeded (matched on updated_by, so a hand-retuned row survives).
-- With the row gone the guard's alert reads its cold default (10); nothing else changes.

DELETE FROM module_constants
WHERE module_name = 'passive_archive'
  AND exchange = '*' AND asset_class = '*' AND strategy = '*' AND regime = '*'
  AND constant_name = 'ohlc_frame_skip_alert_streak'
  AND updated_by = 'b-ohlc-frame-guard';
