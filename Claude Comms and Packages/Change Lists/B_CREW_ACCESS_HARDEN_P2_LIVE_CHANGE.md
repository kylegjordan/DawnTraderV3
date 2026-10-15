# B-CREW-ACCESS-HARDEN — P2 live administrator-flag change

**Workflow:** Step 9 iteration · live gate P2 · exact-ref review required before execution

**Purpose:** clear only the shared crew row's administrator flag after the passive Dashboard
prerequisite passed Steps 7 and 8. This is the access-hardening objective; it is not Dashboard
redesign work and requires no application deploy or restart.

## Current object

A read-only staging query immediately before authoring returned exactly these three named rows:

| immutable id | username | role | administrator |
|---|---|---|---|
| `56523b4f-d5b4-412a-bd5c-d12ddc09d50f` | `kylegjordan` | `owner` | `true` |
| `05066a82-5317-4490-8867-805acc4c609e` | `testuser` | `owner` | `true` |
| `6c591801-3072-431d-b192-30aaf426f15e` | `testuser123` | `editor` | `true` |

The `users.id` column is character varying. No credential value was read or printed.

The exact forward and rollback files were then run unchanged against a session-local temporary
`users` table shaped with the three expected rows: forward changed only the target to false,
rollback restored only that target to true, and both emitted the six expected before/after rows.
A mutation starting with the target already false made the forward file exit nonzero at its
named-population precondition. No production row was touched by these tests.

## Exact reviewed execution

- Forward object: `B_CREW_ACCESS_HARDEN_P2_FORWARD.sql`.
- Rollback object: `B_CREW_ACCESS_HARDEN_P2_ROLLBACK.sql`.
- The forward transaction locks user-row writes for its bounded execution, requires the exact
  three-row pre-state, changes only immutable id `6c591801-3072-431d-b192-30aaf426f15e`,
  requires exactly one changed row, proves the target post-state and proves both non-target
  rows remain unchanged before committing.
- Any SQL assertion aborts the connection with an uncommitted transaction, which PostgreSQL
  rolls back. The separate rollback accepts only the expected false post-state on the same
  immutable id and unchanged username/role before restoring `true`.
- Execution streams the SQL bytes from the exact reviewed Git object into staging `psql` as
  `deploy`; the database address stays in staging's environment and is never printed.

## Post-change gates

1. Re-read the three-row population: only `testuser123.is_admin` is false.
2. With the server-held crew token, `GET /api/settings` returns 200 and
   `GET /api/admin/users` returns 403. The test reads the token in memory as `dtapi` and prints
   status codes only; it never passes the token in arguments or output.
3. The same settings request with no token returns 401.
4. The existing `dt-api` read succeeds and its account/user/mode/kill-switch denylist remains
   refusing.
5. Root runs the canonical stored-session check for Langston and Coltrane; each remains usable.
   Coltrane then independently renders one normal page and proves his stored session gets 403
   from the admin-user route. A fresh context remains unauthenticated.
6. Kyle's already-signed-in owner session remains the positive administrator control without
   any session typing or seeing his password.
7. Scheduler logs contain a recent successful-cycle control and no post-change “No admin user”
   failure. Two administrator rows remain, so this verifies the first-admin consumers rather
   than inferring them from row count.
8. All ten identities retain their sanctioned access through the three planes already recorded
   in the approved pre-audit. The eight laptop sessions share the server-held crew plane;
   Langston and Coltrane keep separate browser and server keys. Settings → Users and the
   on-demand scan remain intentionally unavailable to the two agent browsers.

## Stop and rollback

Do not commit the forward transaction if any database pre/postcondition fails. After commit,
run the reviewed rollback immediately if settings/passive reads fail, Kyle's positive admin
control is lost, either stored agent session fails, or the scheduler loses its positive control.
Do not roll back merely because the intended crew admin request returns 403.

REVIEWER: claim-only · identify any alternate database population that the forward or rollback
would accept, any verification that could pass without proving the claimed authorization
boundary, and whether the execution is sufficiently bound to the exact reviewed bytes ·
pending · re-derived y
