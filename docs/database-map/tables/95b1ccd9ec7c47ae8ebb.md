# public.xstock_bar_writer_handoff

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `boot_id` | `uuid` | no |  |  |  |
| 2 | `writer_build_sha` | `text` | no |  |  |  |
| 3 | `contract_version` | `text` | no |  |  |  |
| 4 | `accepted_input_frames` | `bigint` | no |  |  |  |
| 5 | `buffer_superseded` | `bigint` | no |  |  |  |
| 6 | `projection_attempts` | `bigint` | no |  |  |  |
| 7 | `repeated_payload_attempts` | `bigint` | no |  |  |  |
| 8 | `applied_winners` | `bigint` | no |  |  |  |
| 9 | `rejected_older_arrivals` | `bigint` | no |  |  |  |
| 10 | `admission_flushes` | `bigint` | no |  |  |  |
| 11 | `completion_flushes` | `bigint` | no |  |  |  |
| 12 | `handed_off_at` | `timestamp with time zone` | no | `clock_timestamp()` |  |  |

## Constraints

- `xstock_bar_writer_handoff_accepted_input_frames_check`: CHECK (accepted_input_frames >= 0)
- `xstock_bar_writer_handoff_admission_flushes_check`: CHECK (admission_flushes >= 0)
- `xstock_bar_writer_handoff_boot_id_fkey`: FOREIGN KEY (boot_id) REFERENCES xstock_bar_writer_boot_start(boot_id)
- `xstock_bar_writer_handoff_check`: CHECK (buffer_superseded >= 0 AND buffer_superseded <= accepted_input_frames)
- `xstock_bar_writer_handoff_check1`: CHECK (repeated_payload_attempts >= 0 AND repeated_payload_attempts <= projection_attempts)
- `xstock_bar_writer_handoff_check2`: CHECK (applied_winners >= 0 AND applied_winners <= projection_attempts)
- `xstock_bar_writer_handoff_check3`: CHECK (rejected_older_arrivals >= 0 AND rejected_older_arrivals <= projection_attempts)
- `xstock_bar_writer_handoff_check4`: CHECK ((accepted_input_frames - buffer_superseded) = projection_attempts)
- `xstock_bar_writer_handoff_check5`: CHECK ((applied_winners + rejected_older_arrivals) = projection_attempts)
- `xstock_bar_writer_handoff_check6`: CHECK (admission_flushes = completion_flushes)
- `xstock_bar_writer_handoff_completion_flushes_check`: CHECK (completion_flushes >= 0)
- `xstock_bar_writer_handoff_pkey`: PRIMARY KEY (boot_id)
- `xstock_bar_writer_handoff_projection_attempts_check`: CHECK (projection_attempts >= 0)
- `xstock_bar_writer_handoff_writer_build_sha_check`: CHECK (writer_build_sha ~ '^[0-9a-f]{40}$'::text)

## Code evidence

- read: `server/scripts/b-xstock-bar-availability-capacity-gate.ts:75` (raw_sql, runtime)
- read: `server/scripts/b-xstock-bar-availability-capacity-gate.ts:143` (raw_sql, runtime)
- insert: `server/services/passive-archive/xstock-bar-availability.ts:315` (raw_sql, runtime)
- read: `server/services/passive-archive/xstock-bar-availability.ts:340` (raw_sql, runtime)
- insert: `server/tests/integration/b-xstock-bar-availability-revision.test.ts:439` (raw_sql, test_only)
- read: `server/tests/integration/b-xstock-bar-availability-revision.test.ts:466` (raw_sql, test_only)
- update: `server/tests/integration/b-xstock-bar-availability-revision.test.ts:486` (raw_sql, test_only)
