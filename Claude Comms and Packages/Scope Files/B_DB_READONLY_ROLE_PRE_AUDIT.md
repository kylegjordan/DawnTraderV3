# B-DB-READONLY-ROLE — PRE-IMPLEMENTATION AUDIT AND IMPLEMENTATION PLAN

change-class: non_architecture

**Owner:** Infra Claude (CC-INFRA) · **Scope:** `B_DB_READONLY_ROLE_SCOPE.md` r2 (`f4ee0fa93`), APPROVED by Langston `1574025526216101932` · **Plan:** `SPRINT_TO_LIVE_PLAN.md` row 5a1 · **Issue:** `#1259` · **Agreed:** Kyle KD-100.
**Code read at:** `origin/migration/aws-supabase` @ `f7593fe4d` (dt-sql, psql-wrapper, `server/db-pool-alerts.ts`, `dt-install-drift`, `reviewer_staging_access.py`). **Database read:** staging Supabase, PostgreSQL 17.6, through `dt-sql` only, one call per question, SQL on stdin, 2026-11-22.

---

## 0. PREVIOUSLY STATED vs NOW (read this first)

| # | PREVIOUSLY STATED (scope r2) | NOW | REASON |
|---|---|---|---|
| D-1 | §2 / OBJ-8: the `db-pool-alerts.ts` detection loss goes to OLD Claude's `B-DB-APP-TLS`; *"This batch does not edit `server/`."* | **This batch edits `server/db-pool-alerts.ts`** — the comment at `:123-124` and the alert prose at `:398` (keep `:399`) — and dt-sql asserts its own encryption on every call. | `B-DB-APP-TLS` CLOSED 2026-11-21; OLD Claude recommended folding (`1574026657688453202`); **Langston ruled form (c) with four conditions** (`1574029007144620194`). |
| D-2 | §2: the loss is *"small"*. | **Still small, now bounded:** dt-sql is the only crew client inside the page's role+address filter; after this batch the page cannot see it at all, and detection moves into dt-sql (exit 6 + alert). | Same ruling; detection is restored, not just documented. |
| D-3 | (not in scope) | **`sslmode=verify-full` with a pinned CA is folded in** (dt-sql today: `sslmode=require`, `dt-sql:135`). | Langston, same message: disposition (1), fold. *"Plausible, not proven"*; if it cannot be done in-batch it becomes a proposal for Kyle's list. |
| D-4 | Scope: the batch is `non_architecture` with no code under the checker's code prefixes. | **The batch becomes checker-graded** (`server/` is in `CODE_PREFIXES`, `scripts/governance-checker/config.mjs:102`). The class stays `non_architecture` (`db-pool-alerts.ts` is not in `CORE_ENGINE_PATHS`). The 4-hour deadline alarm is already satisfied by `56abbe9f3` (plan row moved to Step 2). | A comment edit under `server/` is code to the checker; measured, not assumed. |
| D-5 | OBJ-2: *"expected: `CREATE TEMP TABLE`"* is the one write residual (NOT RE-READ). | **Measured: TEMP is a residual (PUBLIC holds TEMP and CONNECT on the database). Added: advisory locks** (`pg_advisory_lock` is PUBLIC-executable). **Zero SECURITY DEFINER functions are PUBLIC-executable.** | Q3 census below. |
| D-6 | OBJ-3: the dt-api shape, *"dt-sql run through a narrow `sudo -n -u <account>` rule"*. | **Only the LOGIN step moves to the new account** (helper `dt-sql-login`); dt-sql itself keeps running as `deploy`. | Running all of dt-sql as a new account breaks its alert path and state directory (Q5, rejected option T). |

---

## 1. The six sources — what was read

| # | source | read? | what it gave |
|---|---|---|---|
| 1 | Code at the ref | ✅ | `dt-sql` (constants `:64-77`, `connection()` `:124-135`, `classify()` `:194-207`, main body `:300-360`); `psql-wrapper` (whole file); `db-pool-alerts.ts:117-136`, `:392-402`; `dt-install-drift:108,125,133`; `reviewer_staging_access.py:32,69-70,495,505`. |
| 2 | Runtime + database | ✅ | Q1-Q4 measurements below (roles, grants, ACLs, function census, RLS, `pg_stat_statements`, settings); file modes and accounts on the staging box by `stat`/`getent`. |
| 3 | System Impact Map | ✅ | "Crew database reads" row (`SYSTEM_IMPACT_MAP.md:1393`): upstream `.env`, `/usr/bin/psql`, `/var/lib/dt-sql`, the alert CLI, the direct endpoint + ban; downstream every hand read and ~48 wrapper-routed helpers; blast radius of LOCKED = no hand reads, trading unaffected. |
| 4 | System Manual | ✅ | "Crew Database Reads — `B-DB-READ-TOOL`" (`SYSTEM_MANUAL.md:8620`): read-only is an accident guard; the credential is the app's login. dt-api precedent at `:8612`. **Silent on:** what TLS mode crew reads use and why — a gap, filled under OBJ-8. |
| 5 | Batch reports + ledger | ✅ | `B_DB_READ_TOOL_COMPLETION_REPORT.md:18` (the close condition); `#1259`; `BATCH_CATALOG` by `dt-sql` / `read-only role`. **No decision against a read-only role exists.** `B-DB-APP-TLS` closed 11-21 (the C2 owner). |
| 6 | `bridge/canonical/` | not consulted | Every component was born 2026-10-15 or later (scope §3); the corpus cannot hold their intent. |

---

## 2. Audit findings (Q1-Q9 from the scope)

### F-1 · Q1 — can the app login create the role and grant it? **Yes.**
`postgres`: `rolcreaterole t · rolsuper f · rolbypassrls t`, and holds **admin option** on `pg_read_all_data` and `pg_monitor`. No role named `dt_reader` exists. `supabase_read_only_user` exists and is **not reused** (Supabase's own). Supabase's `supautils` reserved-memberships list includes `pg_write_all_data` but **not** `pg_read_all_data` or `pg_monitor`, so the grant is not one supautils blocks. No trial create was run.

### F-2 · Q2 — what the role needs beyond `pg_read_all_data`. **`pg_monitor`.**
**Census object:** `pg_stat_statements` on staging. **Population:** 4,799 entries, **all under `postgres`** (dt-sql, the app and every helper share the login, so crew reads cannot be separated from app reads by role); `dealloc = 4,801` since its last reset 2026-03-30, so **older entries have been evicted** — the census is a lower bound, not the whole history. Crew-shaped reads seen: `pg_stat_activity`, `pg_settings`/`current_setting`, size functions, `pg_stat_ssl`, `pg_roles`, `information_schema`, `pg_locks`. Seeing other sessions' query text and the full `pg_stat_activity` needs `pg_read_all_stats`, which `pg_monitor` contains. ⇒ **`GRANT pg_read_all_data, pg_monitor`.** `pg_read_all_data` also gives USAGE on every schema.
⚠️ **False-absence hazard:** `auth.users` has row-level security ON with **0 policies**, so the new role reads **0 rows** there (the app login bypasses RLS). 0 of 641 `public` and 0 of 8 `dawntrader_v2` tables use RLS, so nothing else is affected. Documented under OBJ-8 so nobody reads "0 users" as true.

### F-3 · Q3 — what PUBLIC can still do (each a refusal or a stated residual)
| class | measured | outcome |
|---|---|---|
| INSERT / UPDATE / DELETE / TRUNCATE on app tables | no PUBLIC grants; no default ACL grants | **refused** (OBJ-2 probes) |
| CREATE in `public` | PUBLIC lacks it (PG15+ default) | **refused** |
| sequences (`nextval`) | no PUBLIC usage | **refused** |
| functions | PUBLIC-executable: auth 4, extensions 54, graphql_public 1, information_schema 11, pg_catalog 3,257, public 135, realtime 19, storage 20 — **all `prosecdef = f`**. **Positive control:** the database has 6 SECURITY DEFINER functions (pgbouncer 1, storage 3, vault 2) — **none PUBLIC-executable.** | a non-definer function runs with the caller's rights, so any write inside it is refused by the same table privileges → **refused**; OBJ-2 probes one `public` function that writes |
| `CREATE TEMP TABLE` | PUBLIC holds TEMP + CONNECT on the database | **RESIDUAL** — session-private, vanishes at disconnect, touches no app data. Refused today only by the read-only session setting. |
| advisory locks | `pg_advisory_lock` PUBLIC-executable | **RESIDUAL** — same as the app login can do today; a stuck one ends at disconnect / `statement_timeout`. |

### F-4 · Q4 — setting the password without plaintext in a log. **Send a SCRAM verifier.**
`password_encryption = scram-sha-256`; `log_statement = ddl`; `log_min_error_statement = error`; `pgaudit.log = none`. With `log_statement = ddl`, a `CREATE ROLE … PASSWORD '<plaintext>'` would land in Supabase's log. ⇒ the setup computes the verifier itself (stdlib `hashlib.pbkdf2_hmac`, 4096 iterations, random salt) in PostgreSQL's form `SCRAM-SHA-256$4096:<salt>$<StoredKey>:<ServerKey>` — the same thing `psql`'s `\password` sends.
**Residual:** the verifier lands in the ddl log. It cannot be used to log in; recovering the password from it means brute-forcing PBKDF2 over a 32-byte random secret (`secrets.token_urlsafe(32)`) — infeasible.

### F-5 · Q5 — where the credential lives and who can read it
**Measured on the box:** `.env` 0600 `deploy:deploy`; `/home/deploy` 0750; `/var/lib/dt-sql` 0750 `deploy:deploy` (lock, log 0644); `/etc/dawntrader` 0755 root; the `deploy` group holds only `deploy`; dt-api precedent `/etc/dt-api` 0750 `root:dtapi`, `staging-api.env` 0600 `dtapi`, sudoers `deploy ALL=(dtapi) NOPASSWD: /usr/local/bin/dt-api GET *, …` installed `0440 root:root`. sudo 1.9.15p5 with `Defaults env_reset` (`/etc/sudoers:9`). `kernel.yama.ptrace_scope = 1` — **this does not stop a process reading another same-uid process's `/proc/<pid>/environ`**, so any design that puts the password in a `deploy`-uid environment makes it readable by the `deploy` class.
**Callers:** sessions (as root → dt-sql re-execs to `deploy` via `runuser`, `dt-sql:283`); reviewers (ssh as `deploy`, `reviewer_staging_access.py:32`, two calls per run).

**Options:**
| option | how | verdict |
|---|---|---|
| **U (recommended)** | dt-sql keeps running as `deploy` (lock, INTENT, regex, classify, alerts, log — unchanged). **Only the login** runs as a new locked system account `dtsql`: `sudo -n -u dtsql /usr/local/bin/dt-sql-login`. The helper reads `/etc/dt-sql/reader.env` (0600 `dtsql`, dir 0750 `root:dtsql`), builds the connection, sets `PGPASSWORD` in its own environment, prepends the transport check (F-7), and execs the real psql with stdin passed through and read-only always on. | ✅ the `deploy` class can read neither the file nor the `dtsql` process environment |
| B | root reads the file, then drops to `deploy` | ❌ the password then sits in a `deploy`-uid environment, readable per `ptrace_scope` note |
| S | a root parent holds the password | ❌ root-held logic and a root sudo rule for `deploy` |
| T | the whole of dt-sql runs as `dtsql` | ❌ the alert path runs npm under `/home/deploy` and the alerts file is 0644 `deploy`; the state directory is `deploy`'s; it would need a relay sudo rule back to `deploy` |

**What U buys, stated honestly:** `deploy` can already read the app's **write** credential in `.env`, so U is **not** privilege separation from `deploy`. What it buys is that **no copy of the reader credential can exist outside the lock path**: every login with it goes through the helper, and the helper refuses unless dt-sql's lock is held and its INTENT exists — so every attempt is recorded (OBJ-9's purpose) and the two-wrong-passwords budget (`#1259`) is protected structurally, not by memory. It also means that when `B-DB-HELPER-RETIRE` (5a3) removes the app credential from hand scripts, the crew's only credential is one nobody can copy. **Residual:** a `deploy` caller can run the helper itself while holding the lock and an INTENT (it owns the directory); it then logs in with the correct password — no ban, no secret exposed, and the role still cannot write.
**Helper guards (all before any connection):** refuse if `LOCKED` exists; refuse unless `INTENT` exists; refuse unless dt-sql's `flock` is held (a non-blocking `LOCK_EX` attempt on the lock file that **succeeds** means nobody holds it → release and refuse). `/var/lib/dt-sql` becomes **0755** so `dtsql` can see in — its files hold no secret (lock, INTENT/LOCKED = time, caller, pid; log = events).
⇒ **Side effect, a strengthening:** the psql wrapper's lock check (`psql-wrapper` lines 9-11) currently fails open for any account that cannot see the 0750 directory; at 0755 it enforces for every account.
**Root callers** reach the helper through the existing `runuser` drop to `deploy` — no root sudo rule.

### F-6 · Q9 — the one-attempt instrument (OBJ-9). **A reviewed root-run setup script that reuses dt-sql's own functions.**
`dt-sql-role-setup` (repo `comms-infra/staging/`, installed `/usr/local/sbin/`, root-only) loads dt-sql's lock, INTENT, classify, lock_state and alert functions from the installed `/usr/local/bin/dt-sql` (`importlib` `SourceFileLoader`) — one implementation, not a copy. Every login it makes takes the same flock, writes the same INTENT before the attempt, classifies with the same function and locks with the same arms.
- **Ownership detail:** files it creates in `/var/lib/dt-sql` are root-owned; `deploy` can still remove them (unlink depends on the directory's write bit, which `deploy` owns), and the setup `fchown`s them to `deploy` anyway. Its alert calls go through `runuser -u deploy`, as dt-sql's do, so npm never runs as root in `deploy`'s tree.
- **Create mode** (one login each, in order): (1) app login under INTENT: `CREATE ROLE dt_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '<verifier>'`, then `GRANT pg_read_all_data, pg_monitor TO dt_reader`; (2) write `reader.env` with `O_EXCL`, 0600, owner `dtsql`; (3) first login **as `dt_reader` with read-only OFF**: the fixed OBJ-2 write-class probes, each expecting `42501`; the OBJ-5 proof; a positive `select`; the transport check. The password is generated in-process and never printed.
- **`--rotate` mode:** new password + verifier → `ALTER ROLE … PASSWORD '<verifier>'` (app login, under INTENT) → atomic file replace → one verifying login.
- **`--verify` mode:** step (3) alone — re-runnable proof, used again at Step 7 and by Langston at Step 8.
- **Not a dt-sql mode:** kept out of the production read path entirely (the scope's "no bypass on the production path").
- **For Langston's ruling (optional):** a role default `ALTER ROLE dt_reader SET default_transaction_read_only = on` (a third layer). **No `CONNECTION LIMIT`** — hitting it would classify as ambiguous and lock.

### F-7 · C2 — dt-sql asserts its own encryption (Langston form (c), four conditions)
The helper prepends, in the same session and the same stdin input:
```
\set QUIET 1
DO $dtsql$ BEGIN
  IF NOT coalesce((SELECT ssl FROM pg_stat_ssl WHERE pid = pg_backend_pid()), false) THEN
    RAISE EXCEPTION 'dt-sql-transport: session is not encrypted';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE EXCEPTION 'dt-sql-transport: %', SQLERRM;
END $dtsql$;
\set QUIET 0
```
- **Condition 1 (both sites):** `db-pool-alerts.ts:123-124` comment and `:398` alert prose rewritten to say dt-sql logs in as `dt_reader`, is outside this page's view, and asserts its own transport per call (exit 6 + alert) plus `verify-full`; `:399` kept. **Rides the next app deploy** (an app deploy restarts trading; this batch does not deploy the app for a comment).
- **Condition 2 (fail closed):** no row, `ssl` NULL (`coalesce` → false) or any probe error (`WHEN OTHERS`, re-raised with the marker) all raise. **Positive control after the role exists:** run as `dt_reader`, confirm it sees its own `pg_stat_ssl` row with `ssl = t`.
- **Condition 3:** one session, one input, no second login; no rows to stdout (`DO` returns none, `QUIET` hides the command tag — **the exact `-At` output is measured at Step 3**); `ON_ERROR_STOP=1` (already in dt-sql's argv) stops the user's SQL; the message carries a distinct marker.
- **dt-sql's handling:** psql exits 3 on the raise, which `classify()` would call `sql_error`; dt-sql checks for the marker **first** and returns **new exit 6**: no lock (the login succeeded, so no ban risk), INTENT removed, alert raised with dedupe key `dt-sql-transport`. Existing codes unchanged (0 ok, 1 sql_error, 2 switch refusal, 3 refused, 4 locked, 5 busy).
- **Constraint:** the block contains none of the words the read-only regex refuses (`dt-sql:86`) — and it is prepended **after** that check, by the helper.
- **Condition 4:** provenance already covered; nothing new built.

### F-8 · verify-full (folded, D-3)
The app already connects to the same direct endpoint with `sslmode=verify-full&sslrootcert=/etc/dawntrader/supabase-ca.crt` — positive evidence that this host verifies against this CA every day. That CA: sha256 `700723581420dd1ac98fd7e9ac529f0ef210eadcaf87fc868a3ad7d114c2f3b7`, subject `C=US, O=Supabase Inc, CN=Supabase Root 2021 CA`, expires 2031-04-26. It is **not in the repo** and is 0640 `root:deploy`, so `dtsql` cannot read it.
⇒ a **repo-tracked public copy** at `comms-infra/staging/supabase-ca.crt`, installed `/etc/dt-sql/supabase-ca.crt` 0644, drift-tracked. The helper connects with `sslmode=verify-full sslrootcert=/etc/dt-sql/supabase-ca.crt`, `host=` the name (used for verification) and `hostaddr=` still pinned (one address, one attempt).
**Zero-login controls before the first login:** `openssl s_client -starttls postgres -verify_return_error -CAfile <right CA>` → verify OK (positive); same with a wrong CA → fails (negative).
**NOT RE-READ:** whether a TLS verification failure counts toward Supabase's ban (it fails before a password is sent, so it should not); the openssl controls avoid the question for the first login. libpq's use of `host` for verification when `hostaddr` is given — NOT RE-READ against the libpq docs; the openssl positive control plus the first `--verify` login settle it.

### F-9 · Q6/Q7/Q8 — setup login, no-fallback, live proof
- **Q6:** the app login runs the setup once, through the reviewed script (Langston ruling (b)) — not a migration.
- **Q7 (no fallback):** dt-sql no longer reads `.env` at all. **Missing / unreadable / malformed `reader.env`** → the helper refuses **before** any connection with marker `dt-sql-login:` and exit 64+. To tell "the helper refused" from "psql failed", the helper writes a `dt-sql-login: ready` line to stderr immediately before `exec`: **no ready line + nonzero exit ⇒ no attempt ⇒ INTENT removed, no lock**, a new refusal kind logged and returned as exit 2. This also covers sudo itself failing (exit 1, no ready line) — today that would classify as `ambiguous` and lock falsely. Killed mid-call keeps today's semantics (INTENT stays → next call locks `ambiguous`).
- **Q8 (OBJ-5 without a production bypass):** through production dt-sql both layers are on, and PostgreSQL checks the read-only transaction **before** table privileges, so a write there returns `25006`, never `42501` — that run cannot show the role refusing. ⇒ **OBJ-5's proof is `dt-sql-role-setup --verify`**: the same role, the same credential file, the same lock and INTENT, with the session setting absent, a write to a real table returns `42501`. Stated plainly: "through dt-sql" is met as *the same login path minus the setting*, not as the production read command.

### F-10 · other readers of the old fact
`reviewer_staging_access.py`'s write probe (`create temp table`, `:505`) still gets the read-only refusal text (`:69-70`) because dt-sql keeps the setting — **unchanged**. Recommend it ALSO asserts `current_user = dt_reader` on its read (`:495`), so the reviewers' parity check notices a regression to the app login.

---

## 3. Implementation plan (every item points at its finding)

| # | item | from |
|---|---|---|
| P1 | `comms-infra/staging/dt-sql-login` (new, stdlib Python): guards (LOCKED, INTENT, flock held), reads `reader.env`, resolves one address, `verify-full` + pinned `hostaddr`, `PGPASSWORD` in its own env, read-only + `statement_timeout` in `PGOPTIONS`, prepends the transport block, writes the ready line, `exec /usr/bin/psql` with dt-sql's argv shape. Refusals: `dt-sql-login:` marker, exit 64+. | F-5, F-7, F-8, F-9 |
| P2 | `dt-sql`: drop `.env` reading and `connection()`; call `sudo -n -u dtsql /usr/local/bin/dt-sql-login [--csv]`; marker check → exit 6 + alert `dt-sql-transport`; no-ready-line → exit 2, no lock; docstring rewritten (role is the boundary, setting is the second layer). | F-5, F-7, F-9 |
| P3 | `comms-infra/staging/dt-sql-role-setup` (new): create / `--rotate` / `--verify`, reusing dt-sql's functions; SCRAM verifier; O_EXCL file write; fixed OBJ-2 probes + OBJ-5 proof + positive select + transport positive control. | F-1, F-2, F-3, F-4, F-6, F-9 |
| P4 | `comms-infra/staging/supabase-ca.crt` (public CA copy) + the sudoers file `comms-infra/staging/sudoers.d/dt-sql` (`deploy ALL=(dtsql) NOPASSWD: /usr/local/bin/dt-sql-login, /usr/local/bin/dt-sql-login --csv`), installed `0440 root:root` after `visudo -c`. | F-5, F-8 |
| P5 | `dt-install-drift`: rows for `dt-sql-login` (0755 root), `dt-sql-role-setup` (0700 root), `/etc/dt-sql` (0750 `root:dtsql`), `reader.env` (0600 `dtsql`, private row), the CA (0644), the sudoers file (0440), and `/var/lib/dt-sql` at 0755. | F-5, F-8, scope A1 |
| P6 | Tests + mutants: helper guards (no INTENT / LOCKED / flock free → refuse, no connection); no-fallback (file missing/unreadable/malformed → exit 2, no lock); marker → exit 6, no lock, alert; INTENT before attempt; refused → LOCKED `credential`; killed → `ambiguous`. Mutants: "falls back to `.env`", "reads the wrong file", "skips INTENT", "skips the flock guard", "drops the transport block", "`require` instead of `verify-full`" — each must be killed by exit code. | F-5..F-9, scope OBJ-4/OBJ-9 |
| P7 | `server/db-pool-alerts.ts` `:123-124` + `:398` text (keep `:399`); rides the next app deploy. | F-7 cond. 1 |
| P8 | `reviewer_staging_access.py`: assert `current_user = dt_reader` on the read. | F-10 |
| P9 | Runbook section (rotation, recovery when the file is lost, unlock) in `CLAUDE_CODE_PERMISSION_PROMPT_RUNBOOK.md`'s sibling for staging tools — **home chosen at Step 3: the dt-sql section of `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` or a new dt-sql runbook**; rotation dry-run on staging at Step 6. | scope OBJ-7 |
| P10 | **Step 6 order:** create `dtsql` (nologin, system) → install helper, setup, CA, sudoers (`visudo -c` first), `/etc/dt-sql`, `/var/lib/dt-sql` 0755 → openssl controls → **install the exact reviewed dt-sql and prove its hash plus a no-login import with `locked_attempt=True`** → `dt-sql-role-setup` create → one live read (`current_user = dt_reader`) → rename-file failure drill → `--rotate` dry-run → `dt-install-drift` clean. **Order correction (Coltrane, 2026-11-23T22:20:09Z):** the setup imports the installed dt-sql and calls its new `locked_attempt(..., redact=...)`, so the earlier create-before-install order was impossible. **Rollback:** reinstall the previous dt-sql blob (reads `.env` again); `DROP ROLE dt_reader` only on a Langston/Coltrane/Kyle ruling. | all |
| P11 | OBJ-8 governance: SIM row, System Manual section (incl. the TLS gap from source 4 and the `auth.users` 0-row hazard), dt-sql docstring, `CLAUDE.md` §7 dt-sql line, `workflow-07-verify-cc`, `#1259`, reviewer-access notes, Langston's and Coltrane's notes. | F-2, F-5, F-7 |

**UNAUDITED:** none known. P9's runbook home is a placement choice, not an audited behaviour.

---

## 4. Load-bearing claims — reader status
- **Measured directly:** F-3 (zero PUBLIC SECURITY DEFINER functions, with positive control); F-5's settings (`ptrace_scope = 1`, file modes, sudo version and `env_reset`).
- **NOT RE-READ (stated, and how each gets settled):**
  - F-5's mechanism — that `ptrace_scope = 1` leaves a same-uid `/proc/<pid>/environ` readable, and that a different uid is refused. Settled at Step 6: as `deploy`, try to read the environ of a running `dtsql` helper (expect refused) and of a `deploy`-uid process (expect readable — the control).
  - F-8's two libpq/ban points (named there).
  - F-9's ordering claim that PostgreSQL checks read-only before table privileges. Settled at Step 6: the `--verify` run returns `42501` with the setting absent, and production returns `25006`.
- **Reader leads folded in (each a correction, none re-derived yet):**
  - PostgreSQL's read-only check **exempts temp tables**, so the OBJ-2 TEMP probe expects **success** (the stated residual), never `25006` or `42501`. The `--verify` probe list carries that expectation.
  - The session setting and the optional role default are both only *defaults* — SQL can override them. That is why dt-sql's read-only regex stays (`dt-sql:86`), and why the role, not the setting, is the boundary.
  - libpq verifies against `host` only when `host` is non-empty. The helper always sets `host`, and refuses if `reader.env` lacks it.

REVIEWER: claim-only · "what other states of the world are consistent with" F-9's ordering, F-5's environ mechanism and F-8's host-vs-hostaddr verification · leads: the temp-table exemption, defaults being overridable, the empty-host case, dumpability — the reader reached **no source** (no web access), so all three claims stay NOT RE-READ · re-derived: n (each settles at Step 6 as listed above)

---

## 5. Plain-language summary
The audit confirms the database will let us create a login that can only read, and that nothing anyone can run with it escalates to writing — the only things left are a private scratch table that vanishes when the session ends and a harmless lock function, both of which the app's own login can do today. The password will be kept where only a dedicated account can read it, and dt-sql will hand over just the login step to that account, so no copy of the password can exist outside dt-sql's one-attempt safety lock. dt-sql will also check on every call that its connection is encrypted and verify the database's certificate, which replaces the alarm we lose when it stops using the app's login.
