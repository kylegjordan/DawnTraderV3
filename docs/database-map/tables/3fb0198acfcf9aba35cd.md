# auth.oauth_consents

Type: `r`. Not a partition child.

RLS enabled: no; forced: no.

## Columns

| # | name | type | nullable | default | identity | generated |
|---:|---|---|---|---|---|---|
| 1 | `id` | `uuid` | no |  |  |  |
| 2 | `user_id` | `uuid` | no |  |  |  |
| 3 | `client_id` | `uuid` | no |  |  |  |
| 4 | `scopes` | `text` | no |  |  |  |
| 5 | `granted_at` | `timestamp with time zone` | no | `now()` |  |  |
| 6 | `revoked_at` | `timestamp with time zone` | yes |  |  |  |

## Constraints

- `oauth_consents_client_id_fkey`: FOREIGN KEY (client_id) REFERENCES auth.oauth_clients(id) ON DELETE CASCADE
- `oauth_consents_pkey`: PRIMARY KEY (id)
- `oauth_consents_revoked_after_granted`: CHECK (revoked_at IS NULL OR revoked_at >= granted_at)
- `oauth_consents_scopes_length`: CHECK (char_length(scopes) <= 2048)
- `oauth_consents_scopes_not_empty`: CHECK (char_length(TRIM(BOTH FROM scopes)) > 0)
- `oauth_consents_user_client_unique`: UNIQUE (user_id, client_id)
- `oauth_consents_user_id_fkey`: FOREIGN KEY (user_id) REFERENCES auth.users(id) ON DELETE CASCADE

## Code evidence

- none found by scanner at c4b0eec545f6f7e89515bb6dc9f9e57fe604a288
