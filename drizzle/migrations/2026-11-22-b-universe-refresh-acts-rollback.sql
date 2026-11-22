-- B-UNIVERSE-REFRESH-ACTS (#1018) rollback for 2026-11-22-b-universe-refresh-acts.sql.
--
-- Drops the run table and removes ONLY the knob rows this migration wrote (updated_by = 'b-universe-refresh-acts'),
-- so a pre-existing row with the same key is left alone. Run by hand, never by the migration runner (rollback files
-- are not in MANIFEST.txt). Roll the code back first: the refresh and the archiver read these knobs with no fallback,
-- so code that still reads them will throw once the rows are gone.

BEGIN;

DROP TABLE IF EXISTS crypto_universe_refresh_runs;

DELETE FROM module_constants
 WHERE updated_by = 'b-universe-refresh-acts'
   AND asset_class = '*' AND exchange = '*' AND regime = '*' AND strategy = '*'
   AND ((module_name = 'crypto_spot' AND constant_name IN ('universe_refresh_max_drop_share', 'universe_refresh_confirm_max_diff_share'))
     OR (module_name = 'passive_archive' AND constant_name = 'b74_crypto_ws_shard_size'));

COMMIT;
