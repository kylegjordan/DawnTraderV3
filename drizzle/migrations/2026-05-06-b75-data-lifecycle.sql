-- ═════════════════════════════════════════════════════════════════════════════
-- B75 — Data Lifecycle / Tiered Storage
-- ═════════════════════════════════════════════════════════════════════════════
--
-- Tiered hot/warm/cold storage architecture per Kyle directive 2026-05-06:
-- "we don't ever drop data, especially not now when we're not sure what data
--  is going to be valuable and when."
--
-- HOT  = Supabase disk           (~$0.125 / GB-month, ms latency)
-- WARM = Supabase Storage JSONL.gz (~$0.021 / GB-month, seconds latency)
-- COLD = Backblaze B2 JSONL.gz   (~$0.006 / GB-month, indefinite retention)
--
-- See: BATCH_75_SCOPE.md (rev 3) + BATCH_75_PRE_AUDIT.md
--
-- Schema additions:
--   1. data_archive_manifest table (rehydration seam, single source of truth)
--   2. module_constants seeds:
--      a. data_lifecycle module — per-table hot/warm retention + bucket config
--      b. database_monitor module — plan_cap_mb + threshold percentages
-- ═════════════════════════════════════════════════════════════════════════════

BEGIN;

-- ───────────────────────────────────────────────────────────────────────────
-- 1. data_archive_manifest — the rehydration seam
-- ───────────────────────────────────────────────────────────────────────────

CREATE TABLE IF NOT EXISTS data_archive_manifest (
  id                              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  source_table                    TEXT NOT NULL,
  partition_label                 TEXT NOT NULL,           -- e.g. '2026-05'
  tier                            TEXT NOT NULL,           -- 'warm' | 'cold'
  state                           TEXT NOT NULL DEFAULT 'pending',
                                                            -- 'pending' | 'uploaded' | 'verified'
                                                            -- | 'active' | 'migrating' | 'migrated'
  storage_uri                     TEXT NOT NULL,           -- e.g. 'supabase://dt-archive/warm/equity_spot_ticker_snap/2026-05.jsonl.gz'
  min_ts                          TIMESTAMPTZ NOT NULL,    -- actual min(timestamp) in archive
  max_ts                          TIMESTAMPTZ NOT NULL,    -- actual max(timestamp)
  date_range_start                TIMESTAMPTZ NOT NULL,    -- partition declared start
  date_range_end                  TIMESTAMPTZ NOT NULL,    -- partition declared end
  row_count                       BIGINT NOT NULL,
  bytes_compressed                BIGINT NOT NULL,
  original_partition_size_bytes   BIGINT,                  -- compression-ratio drift signal
  archive_schema_version          INT NOT NULL DEFAULT 1,
  format                          TEXT NOT NULL DEFAULT 'jsonl.gz',  -- 'jsonl.gz' | 'parquet'
  compression                     TEXT NOT NULL DEFAULT 'gzip',
  checksum_algo                   TEXT NOT NULL DEFAULT 'sha256',
  checksum                        TEXT NOT NULL,
  created_at                      TIMESTAMPTZ NOT NULL DEFAULT now(),
  verified_at                     TIMESTAMPTZ,
  hot_partition_dropped_at        TIMESTAMPTZ,
  tier_changed_at                 TIMESTAMPTZ,
  CONSTRAINT data_archive_manifest_state_chk
    CHECK (state IN ('pending', 'uploaded', 'verified', 'active', 'migrating', 'migrated')),
  CONSTRAINT data_archive_manifest_tier_chk
    CHECK (tier IN ('warm', 'cold')),
  CONSTRAINT data_archive_manifest_format_chk
    CHECK (format IN ('jsonl.gz', 'parquet')),
  -- Allow warm + cold rows to coexist for the same source partition during rotation
  UNIQUE (source_table, partition_label, tier)
);

CREATE INDEX IF NOT EXISTS data_archive_manifest_source_range
  ON data_archive_manifest (source_table, min_ts, max_ts);
CREATE INDEX IF NOT EXISTS data_archive_manifest_state
  ON data_archive_manifest (state)
  WHERE state != 'active';
CREATE INDEX IF NOT EXISTS data_archive_manifest_pending
  ON data_archive_manifest (source_table, partition_label)
  WHERE state IN ('pending', 'uploaded', 'verified');

COMMENT ON TABLE  data_archive_manifest IS
  'B75: single source of truth for archived partitions across warm + cold tiers. Future analytics rehydration schedulers query this table to locate data without knowing storage layout.';
COMMENT ON COLUMN data_archive_manifest.state IS
  'State machine: pending -> uploaded -> verified -> active (hot dropped) -> migrating -> migrated. Crash recovery resumes from last good state.';
COMMENT ON COLUMN data_archive_manifest.tier IS
  'warm = Supabase Storage. cold = Backblaze B2 (or S3 Glacier). Same source_partition can have BOTH rows during warm->cold rotation.';

-- ───────────────────────────────────────────────────────────────────────────
-- 2. data_lifecycle module — per-table hot/warm retention + bucket config
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  -- Hot retention (HOT -> WARM transition)
  ('data_lifecycle', '*', '*', '*', '*', 'equity_spot_ticker_snap.hot_retention_days',  '30'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'equity_perp_ticker_snap.hot_retention_days',  '30'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'crypto_spot_ticker_snap.hot_retention_days',  '30'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'equity_spot_ohlc_1m.hot_retention_days',     '365'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'equity_perp_ohlc_1m.hot_retention_days',     '365'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'crypto_spot_ohlc_1m.hot_retention_days',     '365'::jsonb,  'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'context_bridge_log.hot_retention_days',       '14'::jsonb,  'b75-data-lifecycle'),
  -- Warm retention (WARM -> COLD transition; default for all tables)
  ('data_lifecycle', '*', '*', '*', '*', 'default_warm_retention_days',                '365'::jsonb,  'b75-data-lifecycle'),
  -- Bucket config — warm tier (Supabase Storage)
  ('data_lifecycle', '*', '*', '*', '*', 'warm_bucket',                          '"dt-archive"'::jsonb, 'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'warm_prefix',                          '"warm"'::jsonb,       'b75-data-lifecycle'),
  -- Bucket config — cold tier (Backblaze B2 default; pending account provisioning)
  ('data_lifecycle', '*', '*', '*', '*', 'cold_provider',                        '"b2"'::jsonb,         'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_bucket',                          '"dt-archive-cold"'::jsonb, 'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_prefix',                          '""'::jsonb,           'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'cold_rotator_dry_run',                 'true'::jsonb,          'b75-data-lifecycle'),
                                                                                                          -- ^ defaults to dry-run until B2 creds land in staging .env
  -- Sweep tunables
  ('data_lifecycle', '*', '*', '*', '*', 'sweep_batch_size',                     '10000'::jsonb,         'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'sweep_pause_ms',                       '100'::jsonb,           'b75-data-lifecycle'),
  ('data_lifecycle', '*', '*', '*', '*', 'export_compression_level',             '6'::jsonb,             'b75-data-lifecycle'),
                                                                                                          -- ^ gzip 1-9; 6 = balanced default
  ('data_lifecycle', '*', '*', '*', '*', 'archive_format',                       '"jsonl.gz"'::jsonb,    'b75-data-lifecycle')
                                                                                                          -- ^ matches B70 pattern; Parquet deferred per pre-audit F2
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

-- ───────────────────────────────────────────────────────────────────────────
-- 3. database_monitor module — plan_cap_mb + threshold percentages
-- ───────────────────────────────────────────────────────────────────────────

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('database_monitor', '*', '*', '*', '*', 'plan_cap_mb',              '204800'::jsonb, 'b75-data-lifecycle'),
                                                                                          -- ^ 200 GB Supabase Pro auto-expand cap; stable across disk auto-expansions
  ('database_monitor', '*', '*', '*', '*', 'warning_threshold_pct',    '0.65'::jsonb,   'b75-data-lifecycle'),
  ('database_monitor', '*', '*', '*', '*', 'critical_threshold_pct',   '0.80'::jsonb,   'b75-data-lifecycle')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();

-- ───────────────────────────────────────────────────────────────────────────
-- 4. Mark legacy b70_postgres_retention_days for future migration to data_lifecycle
--    (purely a comment update; sweep code unchanged per scope §E)
-- ───────────────────────────────────────────────────────────────────────────

COMMENT ON TABLE module_constants IS
  'Module-level constants registry. Live as of B75: data_archive (B70 archive sweep retention), data_lifecycle (B75 tiered storage retention + bucket config), database_monitor (B75 alarm thresholds against Supabase Pro plan cap). NOTE: data_archive.b70_postgres_retention_days is to-be-deprecated by B75.x in favor of per-table data_lifecycle.<table>.hot_retention_days.';

COMMIT;

-- ═════════════════════════════════════════════════════════════════════════════
-- Post-migration verification (runs separately, see deploy step):
--
-- SELECT COUNT(*) FROM data_archive_manifest;
-- -- Expected: 0 (empty table at install)
--
-- SELECT module_name, COUNT(*) FROM module_constants
-- WHERE module_name IN ('data_lifecycle', 'database_monitor')
-- GROUP BY module_name;
-- -- Expected: data_lifecycle=18, database_monitor=3
--
-- SELECT constant_name FROM module_constants
-- WHERE module_name='data_lifecycle' AND constant_name LIKE '%hot_retention_days'
-- ORDER BY constant_name;
-- -- Expected: 7 rows (3 ticker + 3 ohlc + 1 ctx-bridge)
-- ═════════════════════════════════════════════════════════════════════════════
