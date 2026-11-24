# public.data_archive_exact_evidence

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `manifest_id` | `uuid` | no |  |  |  |
| 2 | `source_table` | `text` | no |  |  |  |
| 3 | `partition_label` | `text` | no |  |  |  |
| 4 | `tier` | `text` | no |  |  |  |
| 5 | `source_row_count` | `bigint` | no |  |  |  |
| 6 | `exported_row_count` | `bigint` | no |  |  |  |
| 7 | `downloaded_row_count` | `bigint` | no |  |  |  |
| 8 | `cursor_contract` | `text` | no |  |  |  |
| 9 | `producing_build_sha` | `text` | no |  |  |  |
| 10 | `object_checksum` | `text` | no |  |  |  |
| 11 | `verified_at` | `timestamp with time zone` | no | `clock_timestamp()` |  |  |
| 12 | `selector_contract` | `text` | yes |  |  |  |
| 13 | `selector_version` | `integer` | yes |  |  |  |
| 14 | `frozen_cutoff_at` | `timestamp with time zone` | yes |  |  |  |
| 15 | `ranking_observed_at` | `timestamp with time zone` | yes |  |  |  |
| 16 | `keep_floor_rows` | `integer` | yes |  |  |  |
| 17 | `day_start` | `timestamp with time zone` | yes |  |  |  |
| 18 | `day_end` | `timestamp with time zone` | yes |  |  |  |
| 19 | `ordered_key_sha256` | `text` | yes |  |  |  |
| 20 | `full_row_sha256` | `text` | yes |  |  |  |

## Constraints

- `data_archive_exact_evidence_cursor_contract_check`: CHECK (cursor_contract = ANY (ARRAY['jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid'::text, 'text-ts-tiegroup-v1'::text, 'disk-file-lines-v1'::text, 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text]))
- `data_archive_exact_evidence_downloaded_row_count_check`: CHECK (downloaded_row_count >= 0)
- `data_archive_exact_evidence_exported_row_count_check`: CHECK (exported_row_count >= 0)
- `data_archive_exact_evidence_label_tier_key`: UNIQUE (source_table, partition_label, tier)
- `data_archive_exact_evidence_manifest_id_fkey`: FOREIGN KEY (manifest_id) REFERENCES data_archive_manifest(id)
- `data_archive_exact_evidence_object_checksum_check`: CHECK (object_checksum <> ''::text)
- `data_archive_exact_evidence_pkey`: PRIMARY KEY (manifest_id)
- `data_archive_exact_evidence_producing_build_sha_check`: CHECK (producing_build_sha ~ '^[0-9a-f]{40}$'::text)
- `data_archive_exact_evidence_snapshot_selector_check`: CHECK (cursor_contract <> 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text AND selector_contract IS NULL AND selector_version IS NULL AND frozen_cutoff_at IS NULL AND ranking_observed_at IS NULL AND keep_floor_rows IS NULL AND day_start IS NULL AND day_end IS NULL AND ordered_key_sha256 IS NULL AND full_row_sha256 IS NULL OR cursor_contract = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text AND (source_table = ANY (ARRAY['xstock_spot_ohlc_15m_snapshot'::text, 'xstock_spot_ohlc_60m_snapshot'::text])) AND selector_contract = 'xstock-snapshot-ranked-day/v1'::text AND selector_version = 1 AND frozen_cutoff_at = date_trunc('day'::text, frozen_cutoff_at) AND ranking_observed_at IS NOT NULL AND keep_floor_rows > 0 AND day_start = date_trunc('day'::text, day_start) AND day_end = (day_start + '1 day'::interval) AND day_end <= frozen_cutoff_at AND ordered_key_sha256 ~ '^[0-9a-f]{64}$'::text AND full_row_sha256 ~ '^[0-9a-f]{64}$'::text)
- `data_archive_exact_evidence_source_eq_downloaded_check`: CHECK (source_row_count = downloaded_row_count)
- `data_archive_exact_evidence_source_eq_exported_check`: CHECK (source_row_count = exported_row_count)
- `data_archive_exact_evidence_source_row_count_check`: CHECK (source_row_count >= 0)
- `data_archive_exact_evidence_tier_check`: CHECK (tier = ANY (ARRAY['warm'::text, 'cold'::text]))

## Code evidence

- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:10` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:13` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:19` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:21` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:22` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:25` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:27` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:30` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:31` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:32` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:33` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:34` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:35` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:36` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:37` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:38` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:40` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:48` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness-rollback.sql:55` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:34` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:35` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:38` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:40` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:47` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:51` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:53` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:56` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:60` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:60` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:60` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:60` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:63` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:66` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:68` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-10-17-b-b75-export-completeness.sql:80` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-04-b-disk-file-tiering-rollback.sql:4` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-disk-file-tiering-rollback.sql:14` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-disk-file-tiering-rollback.sql:15` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-disk-file-tiering.sql:5` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-04-b-disk-file-tiering.sql:7` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:18` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:31` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:32` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:39` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:43` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention-rollback.sql:49` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:39` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:53` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:57` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:62` (raw_sql, migration_ddl)
- ddl: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:65` (raw_sql, migration_ddl)
- read: `drizzle/migrations/2026-11-11-b-xstock-snapshot-retention.sql:95` (raw_sql, migration_ddl)
- read: `server/scripts/b-xstock-bar-availability-capacity-gate.ts:589` (raw_sql, runtime)
- insert: `server/scripts/b75-cold-rotator.ts:302` (raw_sql, runtime)
- read: `server/scripts/b75-cold-rotator.ts:314` (raw_sql, runtime)
- read: `server/scripts/b75-cold-rotator.ts:322` (raw_sql, runtime)
- read: `server/scripts/b75-cold-rotator.ts:323` (raw_sql, runtime)
- read: `server/scripts/b75-rehydrate.ts:164` (raw_sql, runtime)
- read: `server/scripts/b75-rehydrate.ts:199` (raw_sql, runtime)
- read: `server/scripts/b75-retention-sweep.ts:903` (raw_sql, runtime)
- insert: `server/services/data-archive/exact-archive-evidence.ts:107` (raw_sql, runtime)
- read: `server/services/data-archive/exact-archive-evidence.ts:144` (raw_sql, runtime)
- read: `server/services/data-archive/exact-archive-evidence.ts:203` (raw_sql, runtime)
- read: `server/services/data-archive/exact-archive-evidence.ts:219` (raw_sql, runtime)
- ddl: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:91` (raw_sql, test_only)
- insert: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:311` (raw_sql, test_only)
- delete: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:312` (raw_sql, test_only)
- ddl: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:315` (raw_sql, test_only)
- read: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:317` (raw_sql, test_only)
- ddl: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:321` (raw_sql, test_only)
- ddl: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:332` (raw_sql, test_only)
- insert: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:345` (raw_sql, test_only)
- read: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:359` (raw_sql, test_only)
- insert: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:363` (raw_sql, test_only)
- read: `server/tests/integration/b-xstock-snapshot-retention-db.test.ts:366` (raw_sql, test_only)
- read: `server/tests/unit/b-b75-export-completeness.test.ts:196` (raw_sql, test_only)
- insert: `server/tests/unit/b-b75-export-completeness.test.ts:248` (raw_sql, test_only)
- insert: `server/tests/unit/b-xstock-bar-availability-archive.test.ts:173` (raw_sql, test_only)
- read: `server/tests/unit/b-xstock-bar-availability-archive.test.ts:174` (raw_sql, test_only)
- insert: `server/tests/unit/b-xstock-snapshot-retention.test.ts:1032` (raw_sql, test_only)
