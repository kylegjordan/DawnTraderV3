# auth.mfa_amr_claims

Type: `r`. Not a partition child.

RLS enabled: yes; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `session_id` | `uuid` | no |  |  |  |
| 2 | `created_at` | `timestamp with time zone` | no |  |  |  |
| 3 | `updated_at` | `timestamp with time zone` | no |  |  |  |
| 4 | `authentication_method` | `text` | no |  |  |  |
| 5 | `id` | `uuid` | no |  |  |  |

## Constraints

- `amr_id_pk`: PRIMARY KEY (id)
- `mfa_amr_claims_session_id_authentication_method_pkey`: UNIQUE (session_id, authentication_method)
- `mfa_amr_claims_session_id_fkey`: FOREIGN KEY (session_id) REFERENCES auth.sessions(id) ON DELETE CASCADE

## Code evidence

- none found by scanner at c4b0eec545f6f7e89515bb6dc9f9e57fe604a288
