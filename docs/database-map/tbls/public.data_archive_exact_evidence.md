# public.data_archive_exact_evidence

## Description

Append-only exact source/export/download equality evidence for EVERY archive lane (B-B75-EXPORT-COMPLETENESS #1195; created as xstock_bar_archive_exact_evidence by B-XSTOCK-BAR-AVAILABILITY). One row per exported object, keyed by manifest_id; it is never updated or deleted (guard triggers), and producing_build_sha is first-write-wins.

## Columns

| Name | Type | Default | Nullable | Children | Parents | Comment |
| ---- | ---- | ------- | -------- | -------- | ------- | ------- |
| manifest_id | uuid |  | false |  | [public.data_archive_manifest](public.data_archive_manifest.md) |  |
| source_table | text |  | false |  |  |  |
| partition_label | text |  | false |  |  |  |
| tier | text |  | false |  |  |  |
| source_row_count | bigint |  | false |  |  |  |
| exported_row_count | bigint |  | false |  |  |  |
| downloaded_row_count | bigint |  | false |  |  |  |
| cursor_contract | text |  | false |  |  |  |
| producing_build_sha | text |  | false |  |  |  |
| object_checksum | text |  | false |  |  |  |
| verified_at | timestamp with time zone | clock_timestamp() | false |  |  |  |
| selector_contract | text |  | true |  |  | B-XSTOCK-SNAPSHOT-RETENTION: ranked selector identity. NULL for generic archive lanes. |
| selector_version | integer |  | true |  |  |  |
| frozen_cutoff_at | timestamp with time zone |  | true |  |  |  |
| ranking_observed_at | timestamp with time zone |  | true |  |  |  |
| keep_floor_rows | integer |  | true |  |  |  |
| day_start | timestamp with time zone |  | true |  |  |  |
| day_end | timestamp with time zone |  | true |  |  |  |
| ordered_key_sha256 | text |  | true |  |  | B-XSTOCK-SNAPSHOT-RETENTION: SHA-256 of the ordered length-framed (symbol,bucket_ts UTC-microsecond text) key stream. |
| full_row_sha256 | text |  | true |  |  | B-XSTOCK-SNAPSHOT-RETENTION: SHA-256 of the exact uncompressed canonical JSONL bytes. |

## Viewpoints

| Name | Definition |
| ---- | ---------- |
| [public schema](viewpoint-schema-public.md) | All mapped relations in public. |

## Constraints

| Name | Type | Definition |
| ---- | ---- | ---------- |
| data_archive_exact_evidence_cursor_contract_check | CHECK | CHECK (cursor_contract = ANY (ARRAY['jsonb-text-v1:arrived_at-timestamptz+revision_id-uuid'::text, 'text-ts-tiegroup-v1'::text, 'disk-file-lines-v1'::text, 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text])) |
| data_archive_exact_evidence_downloaded_row_count_check | CHECK | CHECK (downloaded_row_count >= 0) |
| data_archive_exact_evidence_exported_row_count_check | CHECK | CHECK (exported_row_count >= 0) |
| data_archive_exact_evidence_label_tier_key | UNIQUE | UNIQUE (source_table, partition_label, tier) |
| data_archive_exact_evidence_manifest_id_fkey | FOREIGN KEY | FOREIGN KEY (manifest_id) REFERENCES data_archive_manifest(id) |
| data_archive_exact_evidence_object_checksum_check | CHECK | CHECK (object_checksum <> ''::text) |
| data_archive_exact_evidence_pkey | PRIMARY KEY | PRIMARY KEY (manifest_id) |
| data_archive_exact_evidence_producing_build_sha_check | CHECK | CHECK (producing_build_sha ~ '^[0-9a-f]{40}$'::text) |
| data_archive_exact_evidence_snapshot_selector_check | CHECK | CHECK (cursor_contract <> 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text AND selector_contract IS NULL AND selector_version IS NULL AND frozen_cutoff_at IS NULL AND ranking_observed_at IS NULL AND keep_floor_rows IS NULL AND day_start IS NULL AND day_end IS NULL AND ordered_key_sha256 IS NULL AND full_row_sha256 IS NULL OR cursor_contract = 'xstock-snapshot-jsonb-v1:symbol+bucket_ts'::text AND (source_table = ANY (ARRAY['xstock_spot_ohlc_15m_snapshot'::text, 'xstock_spot_ohlc_60m_snapshot'::text])) AND selector_contract = 'xstock-snapshot-ranked-day/v1'::text AND selector_version = 1 AND frozen_cutoff_at = date_trunc('day'::text, frozen_cutoff_at) AND ranking_observed_at IS NOT NULL AND keep_floor_rows > 0 AND day_start = date_trunc('day'::text, day_start) AND day_end = (day_start + '1 day'::interval) AND day_end <= frozen_cutoff_at AND ordered_key_sha256 ~ '^[0-9a-f]{64}$'::text AND full_row_sha256 ~ '^[0-9a-f]{64}$'::text) |
| data_archive_exact_evidence_source_eq_downloaded_check | CHECK | CHECK (source_row_count = downloaded_row_count) |
| data_archive_exact_evidence_source_eq_exported_check | CHECK | CHECK (source_row_count = exported_row_count) |
| data_archive_exact_evidence_source_row_count_check | CHECK | CHECK (source_row_count >= 0) |
| data_archive_exact_evidence_tier_check | CHECK | CHECK (tier = ANY (ARRAY['warm'::text, 'cold'::text])) |

## Indexes

| Name | Definition |
| ---- | ---------- |
| data_archive_exact_evidence_label_tier_key | CREATE UNIQUE INDEX data_archive_exact_evidence_label_tier_key ON public.data_archive_exact_evidence USING btree (source_table, partition_label, tier) |
| data_archive_exact_evidence_pkey | CREATE UNIQUE INDEX data_archive_exact_evidence_pkey ON public.data_archive_exact_evidence USING btree (manifest_id) |

## Relations

![er](public.data_archive_exact_evidence.svg)

---

> Generated by [tbls](https://github.com/k1LoW/tbls)
