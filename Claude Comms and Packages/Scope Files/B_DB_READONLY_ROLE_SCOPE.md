# B-DB-READONLY-ROLE — SCOPE (Step 1)

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 5a1 · **Issue:** `#1259` · **Agreed:** Kyle 2026-11-16, KD-100 (*"The 3 database security fixes I'm fine with."*) — before live, after `B-DB-READ-TOOL`.
**Class judgement:** same class as its parent `B-DB-READ-TOOL` (`B_DB_READ_TOOL_SCOPE.md:3`, `non_architecture`). It touches crew tooling and adds one database login; it changes no trading code, no schema the app reads, and no app credential. The System Impact Map and System Manual are judged APPLICABLE anyway (OBJ-8) — the read tool already has an entry in each and that entry becomes wrong the moment this ships.

---

## 0. What this batch is for, in one paragraph

Today every hand read of the staging database (`dt-sql`, and through it the reviewers' staging-parity check) logs in as the app's own `postgres` login, which can write. "Read-only" is a session setting dt-sql asks for, plus a refusal of SQL that names that setting — an accident guard, stated as such in dt-sql's own docstring (`comms-infra/staging/dt-sql:44-49`): *"A read-only database role is the boundary (proposed to Kyle, not built here)."* This batch builds that boundary: a separate login that the database itself refuses to let write, held in its own server-side file, which dt-sql uses instead of the app's login. The plan row's close condition, verbatim: **"a write through dt-sql is refused by the role, not by a session setting."**

---

## 1. Objectives and how each is verified

| # | objective | verification (proof line drafted now, filled at Step 7) |
|---|---|---|
| **OBJ-1** | A new database login exists that can read every table the crew reads and nothing more: `LOGIN`, no superuser, no create-db, no create-role, no replication, no RLS bypass; read access through the predefined role `pg_read_all_data`, plus whatever monitoring reads the crew actually runs (Step 2 measures which). Proposed name `dt_reader` (Step 2 checks it collides with nothing, and that Supabase's own `supabase_read_only_user` is NOT reused). | `pg_roles` row for the role (all attributes) and its `pg_auth_members` rows, read through dt-sql, pasted at Step 7. |
| **OBJ-2** | **The role is refused every write class by privilege, with the session read-only setting OFF** — insert, update, delete, truncate on a real app table; create table in `public`; `nextval` on an app sequence; a call to a function that writes (Step 2 enumerates the PUBLIC-executable ones). Any class the role can still do is named as a residual with its reason (expected: `CREATE TEMP TABLE`, because `TEMP` on the database is granted to PUBLIC by default — **NOT RE-READ**, Step 2 measures it). | One transcript per class: the statement, run as the role with no read-only option, returning SQLSTATE `42501` (permission denied). **Positive control:** the same harness, pointed at a statement the role IS allowed (a `select`), succeeds — proving the harness can report success. |
| **OBJ-3** | The role's credential lives in ONE server-held file on staging (proposed `/etc/dt-sql/reader.env`, `root:deploy 0640`), generated on the box, **never printed, never in git, chat, Drive, Discord, argv or any memory file.** | `stat` of the file; the setup run's own output shows no secret; a hash comparison (not a grep for the value) shows the value appears in no repo file and no log dt-sql writes. |
| **OBJ-4** | dt-sql logs in as the role. It keeps everything it has today — one attempt, `sslmode=require`, pinned address, the lock and its two arms, the read-only session setting as a SECOND layer — and **fails hard with no fallback to the app's login** when the credential file is missing, unreadable or malformed. | Tests + mutants on staging (a "falls back to `.env`" mutant and a "reads the wrong file" mutant both killed); a live dt-sql read returning `current_user = dt_reader`. |
| **OBJ-5** | **The plan's close condition, live:** a write through dt-sql is refused by the role, not by the session setting. | A live run on staging in which the session read-only option is absent and a write to a real table returns `42501` naming the role's missing privilege — the exact form (a test-only entry point vs a direct one-shot as the role) is a Step-2 decision; **no bypass may be added to the production dt-sql path.** |
| **OBJ-6** | The role is created and its password set by a governed, reviewed, one-time setup step — committed code reviewed at Step 4, run at Step 6 — not by hand-typed SQL and not by Kyle in a dashboard. The password never reaches the database as plaintext SQL text that a server log could keep (proposed: send a SCRAM verifier, the way `psql`'s own `\password` does — **NOT RE-READ**, Step 2 confirms Supabase's `password_encryption` and statement logging). | The setup code in the repo; its Step-6 run output; a dt-sql read of `pg_authid`-free evidence that the role has a SCRAM password (e.g. a successful SCRAM login, since `postgres` cannot read `pg_authid` on Supabase — **NOT RE-READ**). |
| **OBJ-7** | **Rotation and the ban risk are written down before the first login.** A wrong password for the new role still counts toward Supabase's two-wrong-passwords ban (`#1259`), so the new role's first login and every rotation use the same one-attempt + lock discipline; the rotation order (set the new password, write the file atomically, one verifying login) is documented in a runbook and dry-run on staging. | The runbook section; the Step-6 first-login record (one attempt, success); rotation dry-run record. |
| **OBJ-8** | Every reader of the old fact is updated: the System Impact Map "Crew database reads" row, the System Manual "Crew Database Reads" section, dt-sql's docstring, `CLAUDE.md` §7's dt-sql comment line, `workflow-07-verify-cc` where it describes dt-sql, `#1259`, the reviewer staging-access notes (`comms-infra/security/reviewer-staging-access/`), and the two reviewers' own notes (Langston, Coltrane) where they describe what login dt-sql uses. | Step-10 tier ledger with every row. |

**Not in this batch (named so the boundary is visible):**
- The ~50 hand-written scripts that log in with the app's `postgres` login directly — `B-DB-HELPER-RETIRE` (row 5a3), after the database map. The `psql` wrapper shadows `/usr/bin/psql` but supplies no credential; a helper that builds its own connection string from `.env` keeps writing ability until 5a3.
- The database map — `B-DB-MAP` (row 5a2), which will read **through this batch's login**, so this batch must land first.
- The app's own login and anything the trading system does — untouched.

---

## 2. Architectural read (1.a)

**System Impact Map, "Crew database reads" row (`SYSTEM_IMPACT_MAP.md:1392`), re-read 2026-11-22:** upstream = the app's `.env` `DATABASE_URL` (read at run time, decoded, never copied), `/usr/bin/psql`, `/var/lib/dt-sql`, the alert CLI; the Supabase direct endpoint and its ban. Downstream = every session's and reviewer's hand reads, and through the wrapper every `psql` helper on the box (~48). Blast radius of a stuck LOCKED: no hand reads, trading unaffected. **This batch changes the upstream credential source** (a new file instead of `.env`) and adds a new upstream object (the role). The "never copied — so a rotation reaches this at once" property (dt-sql:125) is deliberately given up for the reader credential: it is its own credential with its own rotation (OBJ-7).

**System Manual, "Crew Database Reads — `B-DB-READ-TOOL`" (`SYSTEM_MANUAL.md:8616`), re-read 2026-11-22:** describes read-only as an accident guard and the credential as the app's login. Both statements become false at Step 6 and are rewritten in OBJ-8.

**Measured 2026-11-22 through dt-sql (one call, stdin), object = the staging Supabase database, PostgreSQL 17.6:**
- the app login `postgres`: `rolsuper f · rolcreaterole t · rolbypassrls t · rolinherit t`;
- `postgres` is a member of `pg_read_all_data`, `pg_monitor`, `pg_signal_backend`, `pg_create_subscription`, `anon`, `authenticated`, `authenticator`, `service_role` — each **with admin option** — and of `supabase_privileged_role` without;
- row-level security is enabled on **0 of 641** tables in `public`;
- the endpoint dt-sql uses is the **direct** endpoint (`db.<project>.supabase.co:5432`), not the pooler — so a new role logs in under its plain name, with no pooler username suffix.
- ⇒ **Hypothesis for Step 2, NOT RE-READ:** `postgres` can `CREATE ROLE` and grant `pg_read_all_data` to it. RLS bypass is moot today (no table uses RLS) but the role is created without it anyway.

**Cross-batch interface (Tier 2, OLD Claude's):** `server/db-pool-alerts.ts` pages on unencrypted connections only for connections under the app's own role (`a.usename = current_user`, around `:117-132`). dt-sql today is inside that filter (and always encrypted). Once dt-sql logs in as `dt_reader` it leaves that page's view. dt-sql always requires TLS, so nothing is lost today — but the page's statement "only connections under the app's own database role are seen" gains a second login it does not see. **Disposition: tell OLD Claude at dispatch; whether the page should watch `dt_reader` is their call** (§9.4 disposition 2, added to their pool-guard work if they want it).

---

## 3. Provenance read (1.b)

**Corpora searched:** `BATCH_CATALOG.md` (by `dt-sql`, `read-only role`), `RUNNING_ISSUES.md` (`#1259` in full; `read-only role` / `READONLY`), `B_DB_READ_TOOL_COMPLETION_REPORT.md`, `git log` (introducing commits by `--diff-filter=A`, not path-limited history of `dt-sql`). `bridge/canonical/` **not consulted — every component here was born 2026-10-15 or later**, long after the governance change; it cannot hold their intent.

**Ledger check (§9.5(b-ii)):** no decision against a read-only role exists. The only mentions are the plan row itself, `#1259`'s follow-on slotting (`RUNNING_ISSUES.md:11782`, *"The three follo[w-ons are slotted]"*), and the completion report's open-at-close row: *"`B-DB-READONLY-ROLE` — a login that can only read, for dt-sql and every crew read … closes when: a write through dt-sql is refused by the role, not by a session setting"*.

### TIER 1 — `comms-infra/staging/dt-sql` (behaviour changes: credential source)
Introducing commit `18cb46eb289af0de9418a7cc9c57574fe59e4578`, verbatim excerpt:
> *"comms-infra/staging/dt-sql (stdlib Python): DATABASE_URL read from the app's .env at run time and unquoted; password only via PGPASSWORD; one attempt (sslmode=require, hostaddr pinned, connect_timeout 15); read-only PGOPTIONS + a refusal of SQL naming the setting (an accident guard, stated); …"*

Correction on record, `d2d0ec91a`, verbatim: *"the dt-sql login (`postgres`) is NOT a Postgres superuser on Supabase (rolsuper = f, rolbypassrls = t) but can write. dt-sql's docstring and the System Manual said "the superuser's" - corrected; read-only stays an accident guard, not a boundary."*
**Intent:** one safe login attempt per call so a wrong password can never again ban the box; read-only was always declared a guard pending a role. **Disposition (2) — relevant, needs updating to today's intent:** its own docstring names this batch as the missing piece.

### TIER 2 — one-line intent notes (read or called, behaviour unchanged unless Step 2 says otherwise)
- **`comms-infra/staging/psql-wrapper`** (born `18cb46eb2`): makes raw `psql` on the box require TLS and respect dt-sql's lock; supplies no credential. **(1) still correct.** Unchanged.
- **`comms-infra/security/reviewer-staging-access/reviewer_staging_access.py`** (born `88855908d`, subject verbatim *"B-CREW-ACCESS-HARDEN: preserve reviewer staging parity"*, no body): calls dt-sql twice — a read, then a write probe `create temp table reviewer_ro_probe(a int)` that must be refused with *"cannot execute CREATE TABLE in a read-only transaction"* (`:69-70`, `:505`). **(1) still correct** — dt-sql keeps the session setting, so that refusal text is unchanged. Step 2 decides whether it should ALSO assert `current_user = dt_reader`.
- **`server/db-pool-alerts.ts`** (OLD Claude): pages on unencrypted connections under the app's role. **(1) still correct**; interface note in §2.

---

## 4. Open questions for Step 2 (the audit answers these before any plan)

1. **Can `postgres` on Supabase create the role and grant `pg_read_all_data`?** Measure (a harmless check of privileges, not a trial create).
2. **What does the role need beyond `pg_read_all_data`?** Census the crew's real reads (dt-sql log, the reviewer probe, `pg_stat_activity` reads) — e.g. whether `pg_read_all_stats` is needed to see other sessions' query text.
3. **What can PUBLIC still do?** `TEMP` on the database, `CREATE` on `public`, `EXECUTE` on functions (any that write, including `SECURITY DEFINER` ones), sequences. Each becomes either a refusal or a stated residual in OBJ-2.
4. **How the password is set without plaintext in a log** — `password_encryption`, `log_statement` on Supabase; SCRAM verifier vs plaintext.
5. **Where the credential file lives and who reads it** — `root:deploy 0640` vs a dedicated group; whether reviewers (who reach staging as `deploy`) read it through dt-sql only.
6. **Who runs the one-time setup and with what login** — the app's login, once, as a reviewed script (recommended), vs a migration (rejected unless Step 2 finds a reason: the app's migrations run on every deploy and must not carry crew credentials).
7. **The no-fallback design** — dt-sql refuses when the file is absent; what the lock does in that case (no login was attempted, so no lock).
8. **A live proof without a production bypass** for OBJ-5.

---

## 5. Board, plan, dispatch

- Plan row 93 (`5a1`): batch id leads the batch/reference cell; status → `Step 1`.
- Delivery board: card created in `Scope`, Blocked on = Langston.
- Dispatch: Langston, ONE gate — *approve this scope, or name what must change*.
