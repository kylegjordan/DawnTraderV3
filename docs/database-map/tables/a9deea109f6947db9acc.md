# auth.users

Type: `r`. Not a partition child.

RLS enabled: yes; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `instance_id` | `uuid` | yes |  |  |  |
| 2 | `id` | `uuid` | no |  |  |  |
| 3 | `aud` | `character varying(255)` | yes |  |  |  |
| 4 | `role` | `character varying(255)` | yes |  |  |  |
| 5 | `email` | `character varying(255)` | yes |  |  |  |
| 6 | `encrypted_password` | `character varying(255)` | yes |  |  |  |
| 7 | `email_confirmed_at` | `timestamp with time zone` | yes |  |  |  |
| 8 | `invited_at` | `timestamp with time zone` | yes |  |  |  |
| 9 | `confirmation_token` | `character varying(255)` | yes |  |  |  |
| 10 | `confirmation_sent_at` | `timestamp with time zone` | yes |  |  |  |
| 11 | `recovery_token` | `character varying(255)` | yes |  |  |  |
| 12 | `recovery_sent_at` | `timestamp with time zone` | yes |  |  |  |
| 13 | `email_change_token_new` | `character varying(255)` | yes |  |  |  |
| 14 | `email_change` | `character varying(255)` | yes |  |  |  |
| 15 | `email_change_sent_at` | `timestamp with time zone` | yes |  |  |  |
| 16 | `last_sign_in_at` | `timestamp with time zone` | yes |  |  |  |
| 17 | `raw_app_meta_data` | `jsonb` | yes |  |  |  |
| 18 | `raw_user_meta_data` | `jsonb` | yes |  |  |  |
| 19 | `is_super_admin` | `boolean` | yes |  |  |  |
| 20 | `created_at` | `timestamp with time zone` | yes |  |  |  |
| 21 | `updated_at` | `timestamp with time zone` | yes |  |  |  |
| 22 | `phone` | `text` | yes | `NULL::character varying` |  |  |
| 23 | `phone_confirmed_at` | `timestamp with time zone` | yes |  |  |  |
| 24 | `phone_change` | `text` | yes | `''::character varying` |  |  |
| 25 | `phone_change_token` | `character varying(255)` | yes | `''::character varying` |  |  |
| 26 | `phone_change_sent_at` | `timestamp with time zone` | yes |  |  |  |
| 27 | `confirmed_at` | `timestamp with time zone` | yes | `LEAST(email_confirmed_at, phone_confirmed_at)` |  | s |
| 28 | `email_change_token_current` | `character varying(255)` | yes | `''::character varying` |  |  |
| 29 | `email_change_confirm_status` | `smallint` | yes | `0` |  |  |
| 30 | `banned_until` | `timestamp with time zone` | yes |  |  |  |
| 31 | `reauthentication_token` | `character varying(255)` | yes | `''::character varying` |  |  |
| 32 | `reauthentication_sent_at` | `timestamp with time zone` | yes |  |  |  |
| 33 | `is_sso_user` | `boolean` | no | `false` |  |  |
| 34 | `deleted_at` | `timestamp with time zone` | yes |  |  |  |
| 35 | `is_anonymous` | `boolean` | no | `false` |  |  |

## Constraints

- `users_email_change_confirm_status_check`: CHECK (email_change_confirm_status >= 0 AND email_change_confirm_status <= 2)
- `users_phone_key`: UNIQUE (phone)
- `users_pkey`: PRIMARY KEY (id)

## Code evidence

- update: `scripts/db-map/tests/core.test.mjs:103` (raw_sql, test_only)
