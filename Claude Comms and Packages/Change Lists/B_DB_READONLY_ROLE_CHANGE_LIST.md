# B-DB-READONLY-ROLE — Step 4 change list (row 5a1, KD-100)

> Owner: Infra Claude (CC-INFRA). **Code ref: `f9087a56c0b43f33466baba0d4945e25e8cfac93`** on `origin/migration/aws-supabase`
> (one commit, 19 files, +2144/-207). Read every `path:line` below at that ref.

## Dispatch header (the three fields)

| # | field | value |
|---|---|---|
| i | **declared change-class** | `non_architecture` (scope header, `Scope Files/B_DB_READONLY_ROLE_SCOPE.md:3`) |
| ii | **doc set, row by row** | see the table below |
| iii | **Step-2 reference** | `Scope Files/B_DB_READONLY_ROLE_PRE_AUDIT.md` at `1e774ac1f`; Langston PROCEED msg `1574043921418420305` (conditions C1-C4, F-2 correction, F-6, record fixes) |

| document (non_architecture) | state at this step |
|---|---|
| the batch `SCOPE` | **present** — `Claude Comms and Packages/Scope Files/B_DB_READONLY_ROLE_SCOPE.md` (r2 approved) |
| the batch `PRE_AUDIT` | **present** — `Claude Comms and Packages/Scope Files/B_DB_READONLY_ROLE_PRE_AUDIT.md` |
| `COMPLETION_REPORT` | absent — Step 11 |
| `BATCH_CATALOG.md` | absent — Step 10 |
| `PHASE_HISTORY.md` | absent — Step 10 |
| `SYSTEM_MANUAL.md` | judged — **applicable at Step 10** (plan P11: the TLS gap and the RLS empty-read hazard) |
| `SYSTEM_IMPACT_MAP.md` | judged — **applicable at Step 10** (plan P11: dt-sql row, the `dtsql` account, `dt_reader`) |
| `CHANGES_AND_FIXES.md` | judged — applicable at Step 10 (one entry) |
| `RUNNING_ISSUES.md` | judged — `#1259` update at Step 10 |
| `POST_AUDIT_ROADMAP.md` | judged N/A — no roadmap item moves |
| `DELETED_COMPONENTS_LOG.md` | judged N/A — dt-sql's `.env` reading is replaced in place, no component removed (its `connection()` path is gone; noted in the commit body) |
| `ADJUSTMENT_FRAMEWORK.md` | judged N/A — no trading parameter |
| `PHASE_19_PLAN.md` | N/A — no row there |
| `SPRINT_TO_LIVE_PLAN.md` | REQUIRED at close — row 5a1 |
| MEMORY files / task list | REQUIRED at Step 10 |
| **new runbook** | **present** — `1-system-manual/DT_SQL_RUNBOOK.md` (plan P9; home chosen: a new runbook, see judgement call 10) |

## 1. What changed, in one paragraph

`dt-sql` no longer reads the app's `.env` and no longer logs in as the app's write user. It keeps everything that
makes it safe to call — the one-attempt lock, the INTENT record, LOCKED, the read-only SQL guard — and hands the
single login to a new helper, `dt-sql-login`, run as a new system account `dtsql` through a two-call sudoers rule.
The helper reads `/etc/dt-sql/reader.env` (0600 `dtsql`), logs in ONCE as the new database role `dt_reader`
(no superuser/create/replication/RLS-bypass; `pg_read_all_data` + `pg_monitor`; read-only by default) over
`verify-full` TLS to a pinned address, and sends a 3-line TLS self-check before the caller's SQL. A failed check
is exit 6 + a critical alert and **does not lock**. `dt-sql-role-setup` (root only) creates, rotates, recovers
and verifies the role, sending the database only a SCRAM verifier.

## 2. Condition → where it is met (all at `f9087a56c`)

| condition | met at | proved by |
|---|---|---|
| **C1** delivery chosen and measured; a transport failure must not lock | `comms-infra/staging/dt-sql-login:190` (`proc.communicate(input=TRANSPORT + sql)`, `-f -` at `:184`); `comms-infra/staging/dt-sql:98-103` (`TRANSPORT_FAIL`, with the 13:39Z staging measurement in the comment); `dt-sql:394-402` (exit 6, INTENT removed, no `lock_state`) | test "the session failed its own TLS check: exit 6, NOT locked" (`tests/dt_sql_tests.py:303`); mutants **"a failed TLS check is read as a SQL error"**, **"…raises no alert"**, and the new **"C1: a failed TLS check LOCKS"** (`tests/dt_sql_mutations.py:57-62`) — all killed |
| **C2** the one-attempt fence moved with the code | helper has its own substitutable block `dt-sql-login:49-56` (`CA_FILE`, `PSQL`, `RESOLVE`); `tests/dt_sql_tests.py:99` `build_login()`; test 9 "ONE attempt, VERIFIED" at `:189` runs against the helper invoked directly, no sudo; section 9 (`:469` on, real `/usr/bin/psql` against a fake TLS Postgres server; the helper built with it at `:495`) | mutants 1-4/25 re-pointed, not dropped: `tests/dt_sql_mutations.py:94-102` (`sslmode=require`, CA not named, address not pinned, no connect timeout, password in conninfo, caller PG* passes, read-only not set) |
| **C3** sudoers expresses exactly two calls; helper refuses other argv | `comms-infra/staging/sudoers-dtsql:19` (`dt-sql-login ""`, `dt-sql-login --csv`); `dt-sql-login:148` (`args not in ([], ["--csv"])` → 64) | mutant "login: any argument accepted" (`:76`) killed; **`sudo -l -U deploy` before/after is a Step-6 record item** (§5) |
| **C4** log not world-readable at dir 0755 | `dt-sql:117` (log opened `0o640`); drift row `/var/lib/dt-sql 0755 deploy` at `dt-install-drift:141` | the accounts newly bound through `psql-wrapper` are named at Step 6 (§5) |
| **F-2 correction** 26 RLS tables, not one | `1-system-manual/DT_SQL_RUNBOOK.md:94-95` (16 `auth` + 10 `storage`; empty is not absence) | carried into SysManual at Step 10 |
| **F-6** role default on; `--verify` overrides explicitly | `dt-sql-role-setup:253` (`ALTER ROLE … SET default_transaction_read_only = on`); `:355` (`-c default_transaction_read_only=off`); `:363` expects `roledefault` | mutant "role-setup: verify keeps the read-only default on" killed |
| **P9** runbook | `1-system-manual/DT_SQL_RUNBOOK.md` (new) | — |

**Record fixes from the PROCEED:**
- The wrapper's lock check is now at **`psql-wrapper:15`** — it was line 14; this commit added one comment line above it (`:10-12`, the 0755 consequence).
- `ON_ERROR_STOP=1` is now in the **helper's** argv (`dt-sql-login:181`, and `:183` for `--csv`), no longer dt-sql's.
- §3's `UNAUDITED: none known` was not true at Step 2: **C1 and C2 were unaudited behaviours.** Both are now
  measured/tested as above; the pre-audit file is left as dispatched (frozen at `1e774ac1f`), and this line is the record.
- The doubled `dt-sql-transport` marker (inner `RAISE` caught and re-raised): **left as is — cosmetic.** `TRANSPORT_FAIL` anchors on the first occurrence; the alert carries the first line only.

## 3. Load-bearing hunks

**dt-sql — the login is a sudo call; the transport branch never locks** (`dt-sql:394-402`):
```python
        elif rc == 3 and TRANSPORT_FAIL.search(err):
            os.remove(INTENT_FILE)                   # logged in, failed its own TLS check: not a login failure
            log("transport", psql_rc=rc)
            m = TRANSPORT_FAIL.search(err)
            alert("transport", err[m.start():].split(b"\n")[0].decode("utf-8", "replace"))
            print("dt-sql: TRANSPORT — the session failed its TLS check and the SQL did not run. Not locked; an alert "
                  "is raised.", file=sys.stderr)
            return 6
        else:
            kind = classify(rc, err)
```
`classify()` (`dt-sql:223-236`) is unchanged in shape: 0 ok · 3 sql_error · 2+credential text → credential lock ·
2+refused text → exit 3 no lock · anything else → ambiguous lock. A no-ready-line non-zero exit (`:388-393`) means
the helper refused before connecting: INTENT removed, exit 2, **no lock**.

**dt-sql-login — the single attempt** (`dt-sql-login:175-191`):
```python
    conninfo = ("host=%s hostaddr=%s port=%d dbname=%s user=%s sslmode=verify-full sslrootcert=%s connect_timeout=15 "
                "application_name=dt-sql" % (...))
    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
    env.update(PGPASSWORD=cfg["DT_READER_PASSWORD"], PGCLIENTENCODING="UTF8",
               PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=%s" % STATEMENT_TIMEOUT)
    argv = [PSQL, conninfo, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|"]
    ...
    argv += ["-f", "-"]                                              # the checked bytes, on stdin
    sys.stderr.buffer.write(READY)                                   # from here on, an attempt is being made
    ...
    proc.communicate(input=TRANSPORT + sql)
```
Guards before any connection (`:148-173`): argv, LOCKED (65), INTENT present, dt-sql's flock held (opened
`O_RDONLY`, never created), empty SQL, backslash, read-only switch, `reader.env` parse (fixed key set, each value
`fullmatch`ed, no repeats, none missing, port ≤ 65535), resolver failure, CA readable (72), psql executable (73).
Password only in the child's environment, never argv.

**dt-sql-role-setup — write before the database takes it, promote only after** (`:248-284`; `os.link` `:265`, `os.replace` `:272`, rc 4 `:276`):
```python
    if mode == "--create":
        sql = ("BEGIN;\n"
               "CREATE ROLE %s LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD '%s';\n"
               "GRANT pg_read_all_data, pg_monitor TO %s;\n"
               "ALTER ROLE %s SET default_transaction_read_only = on;\n"
               "COMMIT;\n" % (ROLE, verifier, ROLE, ROLE))
    ...
    if rc == 0:
        if mode in ("--create", "--recover"):
            os.link(NEW_ENV, dl.READER_ENV)          # never clobbers: fails if reader.env appeared meanwhile → 66
            os.unlink(NEW_ENV)
        else:
            os.replace(NEW_ENV, dl.READER_ENV)
    if rc == 4:   # LOCKED: reader.env.new is KEPT — it may be the only copy of what the database now holds
        return 4
    os.unlink(NEW_ENV)                                   # the database did not take it
```
`PASSWORD '%s'` carries the SCRAM verifier (`scram_verifier()`), never the plaintext; mutant "the plaintext password
is sent" is killed. The setup's app login goes through dt-sql's own one-attempt lock (mutant "bypasses dt-sql's
one-attempt lock" killed).

**sudoers** (`comms-infra/staging/sudoers-dtsql:19`), installed as `/etc/sudoers.d/dtsql` (no dot — sudo skips dotted names):
```
deploy ALL=(dtsql) NOPASSWD: /usr/local/bin/dt-sql-login "", /usr/local/bin/dt-sql-login --csv
```

**Drift** (`dt-install-drift:113-116` files, `:141-148` dirs and the private row, `:627-647` the account): rows for `dt-sql-login` 0755, `dt-sql-role-setup` 0700 in `/usr/local/sbin`,
the CA 0644, `/etc/sudoers.d/dtsql` 0440, `/etc/dt-sql` 0750 `root:dtsql`, private row `reader.env` 0600 `dtsql`,
`/var/lib/dt-sql` 0755 `deploy`; `dtsql` must have a nologin shell (`:630`) and a locked password field (`:645`).

**Also in the commit:** `server/db-pool-alerts.ts` text only (P7, rides the next app deploy); `reviewer_staging_access.py` asserts `current_user = dt_reader` (P8); `.github/workflows/ci.yml` runs the three dt-sql suites + mutants; `README.md` install map.

## 4. Test evidence

- dt-sql mutation harness, all three suites per mutant, run on Helsinki at the pre-C1-mutant tree: **81 of 81 killed**; the C1 mutant run alone: killed (FAIL "exit 6, NOT locked"). CI runs the full set at the ref.
- drift mutation harness (`tests/drift_mutations.py`), run on Helsinki 2026-11-22 at this tree: **`mutations: 60 applied and killed, 0 problems`**, harness exit 0 — including the nine `5a1:` mutants on the `dtsql` checks. (The earlier run's one NOT APPLIED was a doubled anchor in the dtapi mutant, fixed with a unique anchor.)
- Section 9 (real `psql` against a fake TLS server) skips on Helsinki, which has no real psql/openssl (`dt_sql_tests.py:471-472`), and runs in CI and on staging.
- CI: run on the branch head carrying this commit — recorded below.

## 5. Step-6 order (plan P10, with the C3/C4 record items)

1. `sudo -l -U deploy` → quoted into the record (**before**).
2. Create `dtsql` (system, nologin, no password).
3. Install helper, setup, CA, `/etc/dt-sql` 0750 `root:dtsql`, `/var/lib/dt-sql` 0755; `chmod 0640 log.jsonl`.
4. `visudo -cf sudoers-dtsql` → install `/etc/sudoers.d/dtsql` 0440 → `sudo -l -U deploy` (**after**, quoted).
5. openssl controls (verify-full against the CA copy succeeds; against a wrong CA fails).
6. `dt-sql-role-setup --create` → `--verify` (exit 0).
7. Install the new `dt-sql`; one live read showing `current_user = dt_reader`.
8. Rename-file drill (move `reader.env` aside → dt-sql refuses before connecting, no lock) → restore.
9. `--rotate` dry run → `--verify`.
10. `dt-install-drift` clean.
11. **One line naming the accounts newly bound through `psql-wrapper`** by the 0755 change (from `getent passwd` with a login shell, at install time).
- **Rollback:** reinstall the previous `dt-sql` blob (reads `.env` again) and its drift row; `DROP ROLE dt_reader` only on a Langston/Kyle ruling.
- **Window:** not before the xStock increment-C window closes (Mon 11-23 21:00Z) unless coordinated — no app restart is involved, but the install touches the only hand-run DB read.

## 6. Judgement calls — attack these

1. **LOCKED holds the raw stderr unredacted.** It is root/deploy-readable (0640 in a 0755 dir) and never contains the password (it is not in argv or the SQL); redaction would hide the server's own refusal text that §2 of the runbook tells the unlocker to read.
2. **Terse helper refusals** (`dt-sql-login: <reason>`, exit 64-73) — no hint text. dt-sql prints the operator-facing line.
3. **`reader.env.new` kept on rc 4** — may be the only copy of the password the database holds; recovery (§4 of the runbook) makes it moot.
4. **The ascii-header defect** in the earlier tool header was fixed in passing (non-ascii in a sudoers-adjacent file); no behaviour change.
5. **dtsql drift checks go beyond P5** (nologin shell, empty password) — mirrors the dtapi checks.
6. **`/var/lib/dt-sql` 0755** rather than a shared group — the helper needs only to stat LOCKED/INTENT and open the lock read-only; a group would add a second identity to keep in sync.
7. **README install-map fold** — the install map lives in `comms-infra/staging/README.md`, not the runbook.
8. **`--recover` and its race tests** were added beyond P3 (create/rotate/verify): without it the only way back from a lost or refused `reader.env` is guessing which password the database holds — the ban.
9. **Sudoers filename and the `""`** — P4 wrote `sudoers.d/dt-sql` without `""`; both corrected (dotless name; explicit no-arg form per C3).
10. **The runbook is a new file** (`DT_SQL_RUNBOOK.md`) rather than a section of `REPO_TOPOLOGY_AND_SYNC_RUNBOOK.md` — it is procedures run under pressure, and the topology runbook is about git flow.
11. **The new C1 mutant** is explicit rather than relying on the "read as a SQL error" mutant, which only kills by a different path.

## 7. The gate

**ONE gate: rule on the diff at `f9087a56c` against the Step-2 PROCEED conditions (C1-C4, F-2, F-6, record fixes) — PROCEED to Step 5/6, or name what must change.**
