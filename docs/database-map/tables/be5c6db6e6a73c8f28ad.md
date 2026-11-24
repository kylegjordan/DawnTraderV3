# public.walter_chat_logs

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `character varying` | no | `gen_random_uuid()` |  |  |
| 2 | `chat_session_id` | `character varying` | no |  |  |  |
| 3 | `user_id` | `character varying` | no |  |  |  |
| 4 | `role` | `character varying(20)` | no |  |  |  |
| 5 | `content` | `text` | no |  |  |  |
| 6 | `metadata` | `jsonb` | yes |  |  |  |
| 7 | `timestamp` | `timestamp with time zone` | yes | `now()` |  |  |

## Constraints

- `walter_chat_logs_chat_session_id_walter_chats_id_fk`: FOREIGN KEY (chat_session_id) REFERENCES walter_chats(id) ON DELETE CASCADE
- `walter_chat_logs_pkey`: PRIMARY KEY (id)

## Code evidence

- ddl: `drizzle/migrations/2026-04-22-initial-schema.sql:6426` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2360` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2556` (raw_sql, migration_ddl)
- ddl: `migrations/0000_flaky_freak.sql:2557` (raw_sql, migration_ddl)
