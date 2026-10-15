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

The `users.id` column is character varying. A fresh staging connection returned database
`postgres`, database user `postgres`, current schema `public`, and `to_regclass('public.users')`
resolved to `users`. No credential value was read or printed.

The initial forward and rollback files were run against a session-local temporary table. That
test exposed an unsafe ambiguity: unqualified relation names allowed the temporary table to
shadow the application table. The reviewed correction now uses `public.users` at every site,
asserts the staging database/user/relation identity, and treats the prior temporary-table pass
as a rejecting mutation rather than positive proof. No production row was touched by that test.

## Exact reviewed execution

- Forward object: `B_CREW_ACCESS_HARDEN_P2_FORWARD.sql`.
- Rollback object: `B_CREW_ACCESS_HARDEN_P2_ROLLBACK.sql`.
- Status-only API verifier: `B_CREW_ACCESS_HARDEN_P2_VERIFY.py`.
- The forward transaction locks user-row writes for its bounded execution, requires the exact
  three named-row pre-state and the complete three-row administrator population, changes only
  immutable id `6c591801-3072-431d-b192-30aaf426f15e`, requires exactly one changed row,
  proves the target post-state, proves both non-target rows remain unchanged, and requires the
  complete post-state administrator population to be exactly Kyle and `testuser` before commit.
- Any SQL assertion aborts the connection with an uncommitted transaction, which PostgreSQL
  rolls back. The separate rollback accepts only the expected false post-state on the same
  immutable id and unchanged username/role before restoring `true`.
- Execution uses shell pipe-failure handling and streams the SQL bytes from the full reviewed
  Git SHA plus path into staging `psql` as `deploy`; both the Git read and `psql` must exit zero.
  The database address stays in staging's environment and is never printed.

## Post-change gates

1. Re-read the three-row population: only `testuser123.is_admin` is false.
2. The exact verifier runs as `dtapi`, reads the server-held bearer only in memory, and first
   requires `GET /api/auth/verify` to return immutable id
   `6c591801-3072-431d-b192-30aaf426f15e` and username `testuser123`. With that same bearer,
   settings must return 200 and admin users must return 403 with the exact `Access denied` /
   `Admin privileges required` body. The verifier prints only the expected identity and status
   codes; it never passes the token in arguments or output.
3. The same settings request with no token returns 401.
4. The existing `dt-api` read succeeds and its account/user/mode/kill-switch denylist remains
   refusing.
5. Root runs the canonical stored-session check for Langston and Coltrane; each remains usable.
   Coltrane then independently renders one normal page and proves his stored session gets 403
   from the admin-user route. A fresh context remains unauthenticated.
6. In Kyle's already-signed-in owner session, the same admin-user request returns 200 and the
   Registered Users list renders. No session types or sees his password; being merely signed in
   is not accepted as this positive control.
7. Scheduler logs contain a recent successful-cycle control and no post-change “No admin user”
   failure. A full `is_admin=true` read must return exactly the two expected immutable ids, so
   this verifies the complete administrator population before checking first-admin consumers.
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
APPROVED TO EXECUTE by Coltrane at exact ref
`58714b305ba0e5813d2226beebf8911a636d8d50` · re-derived y

## Live execution evidence — 2026-10-15

The forward transaction was streamed from the exact approved Git object and committed. Its
before/after output showed only immutable id `6c591801-3072-431d-b192-30aaf426f15e` changing
from administrator `true` to `false`; both owner rows remained `true`. A fresh complete
administrator read returned exactly the Kyle and `testuser` immutable ids.

The exact approved API verifier passed with `testuser123` identity, role `editor`, auth verify
200, settings 200, exact administrator denial 403, and no-token settings 401. The sanctioned
`dt-api` settings read returned 200 and all 11 account/user/mode/kill-switch denylist controls
refused with exit 2. Root-run stored-session checks returned `SESSION OK` separately for
Langston and Coltrane.

Coltrane independently verified the post-change browser boundary: `/settings` rendered “General
Settings” in his stored session; `/api/admin/users` returned the exact 403 admin-denial body; a
fresh context redirected `/settings` to `/login`; and unauthenticated settings and admin-user
requests returned the exact 401 no-credentials body. He did not inspect the Dashboard.

Two post-change hourly self-checks started at 07:46:21 and 07:47:51 UTC after intervening
application restarts and completed one second later with health/cognitive results. Across the
same post-change log population there were two starts, two completions, zero “No admin user”
lines and zero self-check failures. This closes the scheduled-consumer control with completed
cycles as its positive control.

One final control remains open before P2 closes: Kyle's already-signed-in owner session must
render Registered Users with admin users HTTP 200.
