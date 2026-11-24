# B-DB-READONLY-ROLE — Step 4 change list (row 5a1, KD-100)

> Owner: Infra Claude (CC-INFRA). **r2 code ref: `377147369b96af37d5349a0d79f31c7174bb30b2`** (§0, the fold). **r1 code ref: `f9087a56c0b43f33466baba0d4945e25e8cfac93`** on `origin/migration/aws-supabase`
> (one commit, 19 files, +2144/-207). §0 lines are at the r2 ref; §1-§7 lines at the r1 ref.

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

## 0. Step 4 r2 — the fold for Langston's SENT BACK (msg `1574121127553269781`)

**r2 code ref: `377147369b96af37d5349a0d79f31c7174bb30b2`** (ONE commit, 9 files, +170/-23 — read it with `git show 377147369`; other sessions' commits sit between it and `f9087a56c`, so do NOT read a range). Everything in §1-§7 below is r1 and still
stands except where a line is struck through and corrected. The r2 hunks:

**(1) C4 — LOCKED and INTENT are 0640 whatever the umask** (`dt-sql:125-137`):
```python
def write_json(path, obj):
    tmp = path + ".tmp"
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o640)
    os.fchmod(fd, 0o640)          # a left-over .tmp of any mode cannot carry its mode into the replaced file
    with os.fdopen(fd, "w") as fh:
        json.dump(obj, fh); fh.flush(); os.fsync(fh.fileno())
    os.replace(tmp, path)
```
Before: `open(tmp, "w")`, i.e. `0664` at the live umask `0002` (your measurement). `lock` is not written here and stays
`0644` (dt-sql-login opens it `O_RDONLY` as `dtsql`; it holds nothing). `log()` (`dt-sql:114-121`) keeps `0o640` at
`O_CREAT`; its comment now says the mode applies only to a NEW file, so the live `0644` log is fixed by the Step-6
`chmod` and caught by the drift row below.

**(1b) C4 — the drift checker now covers all three files** (`dt-install-drift:150`, `:153-154`, `:855-881`, `:928`):
- private row `("/var/lib/dt-sql/log.jsonl", 0o640, "deploy", "deploy")` — always present once dt-sql has run, so
  missing is MISSING and `0644` (today's live mode) is PERM.
- a new `"transient"` list — `LOCKED` and `INTENT`, both `0640 deploy:deploy`: **absent is correct** (the normal
  state), present must match exactly, and a non-regular file at the path is PERM `not a regular file`.
- the dirs/private/transient loops moved out of `run()` into `check_modes(box)` so the tests drive them with fake
  accounts; `run()` calls it at `:928`, before `check_units`.

**(2) The redact pass-through** — `locked_attempt(..., redact=())` (`dt-sql:358`) strikes each secret out of the
detail line **before** it is written to LOCKED or sent as the alert (`dt-sql:425-426`); `dt-sql-role-setup:190` passes
its `redact` in (`:259` passes `(verifier, password)`, `:357` the reader password). dt-sql's own calls pass none — it
holds no secret on that path. Role-setup's own redaction of its printed output (`:195-196`) stays.

**Tests added:** `dt_sql_tests.py:288`, `:291`, `:339` (LOCKED 0640 even over a left-over 0666 `.tmp`, log 0640,
INTENT 0640 — each under deploy's `0002` umask); `dt_sql_role_setup_tests.py:409-411` (an ambiguous lock on a setup
path: LOCKED's detail AND the alert carry `<redacted>`, no `SCRAM-SHA-256$`); `drift_tests.py:485-545` (the shipped
rows; two controls — absent and present-at-0640 report nothing; LOCKED 0644, INTENT 0666, log 0644, log missing, a
directory at LOCKED — each reported, naming the path).
**Mutants added:** dt-sql harness — no fchmod; LOCKED/INTENT 0644; log 0644; `locked_attempt` ignores redact;
role-setup does not pass it (`dt_sql_mutations.py:151-157`). Drift harness — transient rows never checked; an absent
transient reported; a directory at a transient passes; log row 0644; LOCKED row dropped; INTENT row 0644; `run()`
no longer checks modes (`drift_mutations.py:105-119`).
**Results, Helsinki, at this tree:** suites dt_sql 63 · login 88 · role_setup 87 · drift 106, all 0 failed.
dt-sql mutation harness **87 of 87 killed** (82 at r1 + the 5 above; one r1 mutant's anchor — role-setup bypassing the lock, `dt_sql_mutations.py:112` — followed `:190`'s new `redact=redact` and was re-run alone: KILLED); drift mutation harness **"67 applied and killed, 0 problems"** (all seven C4 mutants killed).

**(3) Judgement call 12 declared** — §6 below. **(4) Record corrections** — §2 (transport marker) and §4 (CI) struck
and corrected in place.

**(5) Step 5 — section 9 HAS now run, against r1, in CI.** Run `45053213246` at `deb068acc` (which carries
`f9087a56c`): **all four jobs `success`, per job** (TypeScript Check, Test Suite, Build, Docker Build). In its Test
Suite log, section 9 executed rather than skipped: "test certificates made", "wrong password and the RIGHT CA: exactly
ONE connection, over TLS, and it locks 'credential'", "CONTROL: the WRONG CA … no password sent … locks 'ambiguous'",
"CONTROL: raw psql … TWO connections", "the psql wrapper on the same URL: ONE connection" — `dt_sql_tests.py` 65
passed, 0 failed; the dt-sql mutation harness in the same job: "82 of 82 killed (4 workers)". **The r2 push gets its
own 4/4, reported per job before Step 6.** Step-6 items 5/7 are therefore the first exercise of section 9 against
the REAL Supabase endpoint and CA — not the first exercise of section 9.

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
| **C4** log not world-readable at dir 0755 | ~~`dt-sql:117` (log opened `0o640`); drift row `/var/lib/dt-sql 0755 deploy` at `dt-install-drift:141`~~ **r2: met for all three files — §0 (1)/(1b): LOCKED + INTENT via `write_json` 0640 + fchmod; log 0640; drift rows for all three** | the accounts newly bound through `psql-wrapper` are named at Step 6 (§5) |
| **F-2 correction** 26 RLS tables, not one | `1-system-manual/DT_SQL_RUNBOOK.md:94-95` (16 `auth` + 10 `storage`; empty is not absence) | carried into SysManual at Step 10 |
| **F-6** role default on; `--verify` overrides explicitly | `dt-sql-role-setup:253` (`ALTER ROLE … SET default_transaction_read_only = on`); `:355` (`-c default_transaction_read_only=off`); `:363` expects `roledefault` | mutant "role-setup: verify keeps the read-only default on" killed |
| **P9** runbook | `1-system-manual/DT_SQL_RUNBOOK.md` (new) | — |

**Record fixes from the PROCEED:**
- The wrapper's lock check is now at **`psql-wrapper:15`** — it was line 14; this commit added one comment line above it (`:10-12`, the 0755 consequence).
- `ON_ERROR_STOP=1` is now in the **helper's** argv (`dt-sql-login:181`, and `:183` for `--csv`), no longer dt-sql's.
- §3's `UNAUDITED: none known` was not true at Step 2: **C1 and C2 were unaudited behaviours.** Both are now
  measured/tested as above; the pre-audit file is left as dispatched (frozen at `1e774ac1f`), and this line is the record.
- ~~The doubled `dt-sql-transport` marker: left as is — cosmetic.~~ **Corrected at r2 (Langston): the doubling is GONE, not left.** The inner block catches only the TLS-check query's own failure (`dt-sql-login:76`); the `not TLS` raise sits after its `END` (`:77`), so one marker reaches stderr either way.

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
- ~~CI: run on the branch head carrying this commit — recorded below.~~ **Corrected at r2 (Langston): that run was CANCELLED, not pending** — superseded by a later push before Test Suite finished. See §0 for the r2 Step-5 statement.

## 5. Step-6 order (plan P10, with the C3/C4 record items)

1. `sudo -l -U deploy` → quoted into the record (**before**).
2. Create `dtsql` (system, nologin, no password).
3. Install helper, setup, CA, `/etc/dt-sql` 0750 `root:dtsql`, `/var/lib/dt-sql` 0755; `chmod 0640 log.jsonl`.
4. `visudo -cf sudoers-dtsql` → install `/etc/sudoers.d/dtsql` 0440 → `sudo -l -U deploy` (**after**, quoted).
5. openssl controls (verify-full against the CA copy succeeds; against a wrong CA fails).
5a. **Install the exact reviewed `dt-sql` before setup**, prove its installed hash matches the reviewed blob, and repeat the no-login setup import with `locked_attempt=True`. *(Coltrane order correction, 2026-11-23T22:20:09Z: the setup calls the new dt-sql's `locked_attempt(..., redact=...)`; the previous live dt-sql has no such function, so the earlier create-before-install order could not execute.)*
6. `dt-sql-role-setup --create` → `--verify` (exit 0).
7. With the new `dt-sql` already installed at 5a, one live read showing `current_user = dt_reader`.
8. Rename-file drill (move `reader.env` aside → dt-sql refuses before connecting, no lock) → restore.
9. `--rotate` dry run → `--verify`.
9a. **Install the new checker** `comms-infra/staging/dt-install-drift` → `/usr/local/sbin/dt-install-drift` 0700 root:root, and append `<deploy-sha> comms-infra/staging/dt-install-drift` to `/var/lib/dt-install-drift/installed.sha`. *(Langston Step-4 r2 amendment, msg `1574167979351085170`: r1 and r2 both change the checker, live is from `4456f515d`, so without this the three C4 rows are inert at Step 6.)*
9b. **Install `comms-infra/staging/psql-wrapper`** → `/usr/local/bin/psql` 0755 root:root, and append `<deploy-sha> comms-infra/staging/psql-wrapper` (live is from `b9ad4f026`; r1 changed it comment-only, and the checker hashes bytes).
   Every other file installed in items 3, 4 and 7 likewise gets its own `<deploy-sha> <repo path>` line.
10. `dt-install-drift` run by hand — **expected: no PERM and no PENDING on the seven 5a1 paths** (`dt-sql`, `psql-wrapper`, `dt-sql-login`, `dt-sql-role-setup`, `supabase-ca.crt`, `sudoers-dtsql`, `dt-install-drift`), and the transient rows silent (no LOCKED/INTENT present).
11. **One line naming the accounts newly bound through `psql-wrapper`** by the 0755 change (from `getent passwd` with a login shell, at install time).
- **Record notes for Step 10/11 (Langston r2):** the login 88 / role_setup 87 counts are a ROOT run; a non-root run adds the unreadable-`reader.env` refusals (`dt_sql_login_tests.py:183`,`:188`; `dt_sql_role_setup_tests.py:343`) and gives 90 / 88 — name the caller. `drift_tests.py`/`drift_mutations.py` run in NO CI step (`grep -n drift .github/workflows/ci.yml` = 0), so the 4/4 does not cover the drift half; it stands on the Helsinki runs.
- **Rollback:** reinstall the previous `dt-sql` blob (reads `.env` again) and its drift row; `DROP ROLE dt_reader` only on a Langston/Coltrane/Kyle ruling.
- **Window:** not before the xStock increment-C window closes (Mon 11-23 21:00Z) unless coordinated — no app restart is involved, but the install touches the only hand-run DB read.

### Step 6 live record — 2026-11-23 (INFRA Codex)

- **Gate and rollback:** branch CI run `45274968676` at `e5c858dc2` was success per job (TypeScript Check, Test Suite, Build, Docker Build) before the first change. The exact reviewed seven-file bundle came from `377147369b96af37d5349a0d79f31c7174bb30b2`; no later branch commit changed any of those paths. Pre-install files, modes, the pin file and the full `sudo -l -U deploy` output are preserved at `/root/b-db-readonly-role-rollback-20261123T2215Z` (0700).
- **Before/after sudo record:** before = `(ALL) NOPASSWD: ALL` plus the two existing dt-api forms. After adds exactly `(dtsql) NOPASSWD: /usr/local/bin/dt-sql-login "", /usr/local/bin/dt-sql-login --csv`; nothing else changed. The new `dtsql` account is system/nologin with a locked password.
- **Pre-login controls:** a `deploy` process could read another `deploy` process's environment (positive control), while the same caller was refused on a `dtsql` process. The reviewed Supabase CA returned `Verify return code: 0 (ok)`; an unrelated ISRG Root X1 CA was refused. No database login occurred in either control.
- **Order finding and ruling:** the written P10 order could not execute because the setup imports installed `dt-sql` and calls the new `locked_attempt(..., redact=...)`, while live `dt-sql` at `e56fb089` had no such function. The no-login import measured `False`. Coltrane ruled PROCEED at 2026-11-23T22:20:09Z on the adjacent reorder only. Installed `dt-sql` then matched the reviewed file byte-for-byte (both SHA-256 `3fb9c00a427b439a1d928a1149c31697aa681edbc6ec0f421d154d262da1845c`) and the repeated import returned `locked_attempt=True` before `--create`.
- **Role and failure branch:** `--create` completed one transaction (`CREATE ROLE`, grants, role default); `--verify` passed: `dt_reader` logged in over TLS, the positive read succeeded, every governed write probe was refused by the role with `42501`, the read-only layer answered `25006`, and the stated TEMP residual remained allowed. Production `dt-sql` returned `dt_reader|postgres|t`. Moving `reader.env` aside produced exit 2 before login, with no LOCKED and no INTENT; restoring it immediately returned `dt_reader`. `--rotate` then completed once and the second `--verify` passed identically.
- **Modes and wrapper reach:** `reader.env` is `0600 dtsql:dtsql` behind `/etc/dt-sql` `0750 root:dtsql`; `log.jsonl` is `0640 deploy:deploy`; LOCKED and INTENT are absent. The 0750 → 0755 state-directory change newly binds the only other non-root/non-deploy accounts with non-nologin/non-false shells: `sync` (`/bin/sync`) and `dtmint` (`/bin/sh`).
- **Seven-path drift gate:** each required path reported `OK` at `377147369b96` — `dt-sql`, `psql-wrapper`, `dt-sql-login`, `dt-sql-role-setup`, `supabase-ca.crt`, `sudoers-dtsql`, `dt-install-drift`: **7/7 OK, 0 PERM, 0 PENDING**. The whole run still returned 1 on one unrelated false `STATE`: it treated the reviewed `dtmint … dt-api mint` line in `/etc/sudoers.d/dtapi` as forbidden even though that file is the line's deliberate home.
- **False-state repair:** `sudoers_others` now assigns dtmint's sole allowed home to `/etc/sudoers.d/dtapi`; every other file still fails. The suite now installs the real reviewed sudoers file as its positive control, and the mutation removes that home. Helsinki root run: drift suite **106 passed, 0 failed**. Full mutation run: **67 applied and killed**, with one pre-existing dtsql anchor not applied after the mapping was split across lines; its corrected anchor was run alone and killed (`105 passed, 1 failed`). Combined exact population: **68/68 mutations applied and killed**. These are Helsinki runs, not CI; the fix is not installed until Coltrane reviews it and the code-bearing ref is 4/4 green.
- **Diagnostic-accuracy review and repair:** Coltrane returned the first repair at `002d8bb38973e133337c09bc5982a6b2de83c671` on 2026-11-23T23:02:28Z because enforcement used the right mapped home but the stray-dtmint diagnostic still named `/etc/sudoers.d/dtmint`. The diagnostic now renders the mapped home, and a new assertion pins a stray dtmint rule to `/etc/sudoers.d/dtapi`. Helsinki baseline: **107 passed, 0 failed**. A targeted removal of dtmint's mapping applied exactly once and was killed cleanly (`105 passed, 2 failed`: the requested diagnostic assertion and the existing real-home positive control).
- **Final review and CI gate:** Coltrane ruled **PROCEED** on exact OFF-BRANCH ref `9d79dfda5103e67c29f0e979b341e60bad6a9979` at 2026-11-23T23:10:17Z. Exact-ref CI run `45286024519` completed **4/4 success**: TypeScript Check, Test Suite, Build and Docker Build. The checker was then installed from that exact ref as `0700 root:root`; live SHA-256 is `56cff1e30d1d2176a399c540581b1f28e5133475703190692c3fde8f166ca26d`, and `installed.sha` names the exact ref and repo path.
- **Live whole-checker gate:** the first post-install run correctly refused the still-off-branch install provenance while all seven required 5a1 files were already `OK`. Main integration `26078081ddd5cea8c8d86c34b8e0e21fe7a40a7a` preserves `9d79dfda5` as an ancestor; after the staging source mirror fetched that ref, the whole checker returned **PASS / exit 0**. Exact required-path population: **7/7 OK, 0 PERM, 0 PENDING** (`dt-sql`, `psql-wrapper`, `dt-sql-login`, `dt-sql-role-setup`, `supabase-ca.crt`, `sudoers-dtsql`, `dt-install-drift`); the whole run also had zero `STATE` and zero `SOURCE` findings.

### Step 7 first-pass verification — 2026-11-23 (INFRA Codex)

- **Original close-condition instrument, rerun live at 23:34Z:** `dt-sql-role-setup --verify` returned 0 and `VERIFY PASS`. The same login path with `default_transaction_read_only=off` returned SQLSTATE `42501` for INSERT, UPDATE, DELETE, TRUNCATE, CREATE in `public`, sequence `nextval`, and the PUBLIC-executable writing function. The positive read succeeded; the second-layer probe returned `25006`; the stated TEMP-table residual succeeded. This re-runs the instrument that distinguishes the role boundary from the session setting rather than substituting server health or log silence.
- **Role and read census:** the live role row is `dt_reader | superuser f | createdb f | createrole f | login t | replication f | bypassrls f | connlimit -1`; its memberships are exactly `pg_monitor,pg_read_all_data`. A production `dt-sql` call returned both `session_user=dt_reader` and `current_user=dt_reader`, database `postgres`, TLS true, and successful reads of `public.users`, `pg_stat_activity`, `pg_settings`, `pg_stat_ssl`, `pg_roles`, `information_schema.tables`, `pg_locks`, and `pg_database_size`; `auth.users` returned the documented RLS-shaped zero rather than a refusal. The role owns 0 relations and has 0 direct INSERT/UPDATE/DELETE/TRUNCATE grants. A transaction-scoped advisory-lock probe returned true and rolled back, confirming the second stated residual without leaving a lock.
- **Credential and state controls:** the fixed-string instrument first found the reader secret in its credential file (positive control), then returned absent over the staging repo and dt-sql's log; a read or search error would have been a separate failure, not absence. The credential remains `0600 dtsql:dtsql` behind `0750 root:dtsql`; the CA, sudoers rule, installed tools and state/log modes match the reviewed record. Before and after the live probes `dt-sql --status` returned unlocked; LOCKED and INTENT were absent; the kernel lock was acquirable; no helper/setup process was active; and no `.new`, `.tmp` or `.aside-*` state file remained (the same file finder first found `log.jsonl` as its positive control).
- **Whole installed-object check:** `dt-install-drift` returned PASS against main integration `26078081d`; all seven 5a1 required paths were `OK`, with no PERM, PENDING, STATE or SOURCE finding. The board card was read back as `Verification`, `Blocked on = Nothing`.
- **No UI surface:** this batch changes the crew's server-side database-read tool and database role only. It changes no DawnTrader screen or browser request, so there is no affected staging tab to navigate; the stale landing dashboard was not used as a substitute.
- **Fresh-reader leads re-derived:** the claim-only reader correctly identified that `current_user` alone could hide `SET ROLE`; the live query above now records `session_user` too. It also identified implicit libpq credential sources as a possible fallback: the exact installed helper reads and validates `reader.env` before it constructs a connection, strips every inherited `PG*` variable, supplies its own non-empty `PGPASSWORD`, uses an explicit user/host/database/address, and the `dtsql` account has home `/nonexistent`; the missing/unreadable/malformed-file suite and the live missing-file drill refuse before the helper's ready/connection marker. No lead changed the Step-7 verdict.

`REVIEWER: claim-only · objects and alternative states for the role-boundary and no-fallback/no-drift claims · leads: session_user not yet recorded; implicit libpq fallback sources and unlisted state could survive a clean wrapper reading · re-derived y (live session_user=current_user=dt_reader; exact installed helper strips PG*, supplies the validated reader password and refuses before exec when reader.env is unavailable; installed manifest/state rechecked)`

### Step 8 independent second-pass verification — 2026-11-24 (Coltrane)

- **Exact ref and ruling:** Coltrane's first live pass at 2026-11-23T23:54:34Z completed the independent checks but withheld a workflow ruling because the exact record ref was not yet in his mirror. After the upstream backup and Coltrane mirror refreshed, `85b101adecb65ec24dfdd2f493785bfe58fc4e59` resolved as the current graded ref and the committed Step-7 record opened there. Coltrane then ruled **PROCEED to Step 9** at 2026-11-24T00:02:33Z, with no failing object.
- **Re-derive leg:** the live verifier again refused all seven governed persistent-write classes with `42501`; SELECT passed as the positive control, the second read-only layer returned `25006`, and TEMP succeeded as the declared residual. The role still had exactly the two intended memberships, no elevated attributes, 0 owned relations and 0 direct write grants. The independent read census succeeded for all eight named objects; `auth.users` executed and returned its documented RLS-shaped zero.
- **Challenge leg:** Coltrane challenged hidden role substitution, because `current_user=dt_reader` alone could conceal `SET ROLE`. The same live session returned both `session_user=dt_reader` and `current_user=dt_reader`, ruling that state out. His credential challenge also found the credential file unreadable by `deploy` after a readable installed-helper positive control, with root metadata confirming the regular 0600 file, its 0750 directory, no symlink and no extended ACL grant.
- **Final live state and board:** the wrapper remained unlocked with no INTENT or LOCKED state. The installed-object population remained 7/7 OK and the whole checker remained PASS with zero PERM, PENDING, STATE or SOURCE findings. Delivery Board item `PVTI_lAHODmulEM4BfQP4zhK4KLA` read back as `Verification`, `Review = Approved`, `Blocked on = Nothing`.

### Step 9 iteration decision — 2026-11-24 (INFRA Codex)

- **No repair loop is required:** the instruments that could have shown an unmet operational objective were rerun at Steps 7 and 8. The role boundary, intended read surface, credential/no-fallback state, governed setup and rotation, one-attempt login fence, installed-object population and live close condition are green; neither pass found a red objective to fix, re-review, redeploy or re-verify.
- **Nothing is silently deferred:** OBJ-8's governance-reader updates and tier ledger are the scope's pre-registered P11 work for Step 10. They are the next step, not an unplaced implementation defect or an observation wait. The board therefore remains `Verification`, `Review = Approved`, `Blocked on = Nothing` while governance is completed.

## 6. Judgement calls — attack these

1. **LOCKED holds the raw stderr unredacted.** It is root/deploy-readable (0640 in a 0755 dir) and never contains the password (it is not in argv or the SQL); redaction would hide the server's own refusal text that §2 of the runbook tells the unlocker to read. **r2 (Langston): survives on the helper path only. On role-setup paths the secrets it holds (verifier, password) are now struck from LOCKED's detail and the alert BEFORE they are written (§0 (2)); everything else in the line is kept.** And the "0640" claim here was true of the log only at r1 — r2 makes it true of LOCKED (§0 (1)).
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
12. **(Langston's, declared at r2 — not changed.) A certificate failure locks `ambiguous`.** `verify-full` is new here: under the wrapper's `require` a certificate failure could not happen. The wrong-CA control (`dt_sql_tests.py` section 9) proves the server receives **no startup message — no password is sent** — and dt-sql locks `ambiguous`. **Blast radius:** while LOCKED, dt-sql refuses every hand read AND the psql wrapper refuses the ~50 helpers that go through it, until one `--unlock`. **Kept deliberately:** telling a TLS failure apart would mean reading psql's stderr text, and mis-reading a credential failure as a TLS failure is the one banned act. Runbook §2 already says `ambiguous` means no password was judged wrong and one `--unlock` clears it. Carried into the completion report. **Successor, only if it ever fires:** a pre-connection certificate probe that never sends a password, judged then.

## 7. The gate

~~**ONE gate: rule on the diff at `f9087a56c` against the Step-2 PROCEED conditions (C1-C4, F-2, F-6, record fixes) — PROCEED to Step 5/6, or name what must change.**~~
**r2 — ONE gate: rule on the r2 commit `377147369` (`git show`, not a range) against your SENT BACK's five folds (C4 for LOCKED/INTENT/log + drift rows; the redact pass-through; JC 12 declared; the two record corrections; the Step-5 statement in §0 (5)) — PROCEED to Step 5/6, or name what must change.**
