# public.data_archive_cold_upload_failure

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `uuid` | no | `gen_random_uuid()` |  |  |
| 2 | `source_table` | `text` | no |  |  |  |
| 3 | `partition_label` | `text` | no |  |  |  |
| 4 | `bucket` | `text` | no |  |  |  |
| 5 | `path` | `text` | no |  |  |  |
| 6 | `sha1` | `text` | yes |  |  |  |
| 7 | `bytes` | `bigint` | no |  |  |  |
| 8 | `attempts` | `jsonb` | no |  |  |  |
| 9 | `first_failed_at` | `timestamp with time zone` | no |  |  |  |
| 10 | `last_failed_at` | `timestamp with time zone` | no |  |  |  |
| 11 | `failure_count` | `integer` | no |  |  |  |
| 12 | `resolved_at` | `timestamp with time zone` | yes |  |  |  |

## Constraints

- `data_archive_cold_upload_failure_attempts_array_chk`: CHECK (jsonb_typeof(attempts) = 'array'::text)
- `data_archive_cold_upload_failure_failure_count_check`: CHECK (failure_count > 0)
- `data_archive_cold_upload_failure_partition_uq`: UNIQUE (source_table, partition_label)
- `data_archive_cold_upload_failure_pkey`: PRIMARY KEY (id)

## Code evidence

- read: `server/scripts/b-storage-archival-health.ts:562` (raw_sql, runtime)
- read: `server/scripts/b75-cold-rotator.ts:856` (raw_sql, runtime)
- insert: `server/scripts/b75-cold-rotator.ts:865` (raw_sql, runtime)
- update: `server/scripts/b75-cold-rotator.ts:882` (raw_sql, runtime)
