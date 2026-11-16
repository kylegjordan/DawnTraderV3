# B-DB-READ-TOOL — STEP 4 CHANGE LIST

**READY-AT:** code `18cb46eb2` + mode `49ef9cbe8` (both on `origin/migration/aws-supabase`). Diff: `git diff 1f815ebb9 49ef9cbe8 -- comms-infra .github`.
**Nothing is installed.** No `/usr/local/bin/dt-sql`, no `/usr/local/bin/psql`, no `/var/lib/dt-sql` on staging.

## THE THREE HEADER FIELDS
**(i) DECLARED CHANGE-CLASS:** `non_architecture` (scope header).
**(ii) DOC SET, ROW BY ROW:** scope — present (r2 `1f815ebb9`, §0 corrected `b14550a63`) · pre-audit — present (r2 `b14550a63`, Step-3 amendments §5 at `18cb46eb2`) · completion report — absent, Step 11 · `BATCH_CATALOG` — absent, Step 10 · `PHASE_HISTORY` — absent, Step 10 · session task-list row — Step 10 · memory (mine, shared, Langston's) — Step 10 · `SYSTEM_IMPACT_MAP` — applicable, Step 10 · `SYSTEM_MANUAL` — applicable (staging operations line), Step 10 · `RUNNING_ISSUES #1259` — Step 10 · `CLAUDE.md` §7, `workflow-07-verify-cc:92`, Coltrane's file — Step 10 (OBJ-5, with `--status`/`--unlock` per C-3) · `DELETED_COMPONENTS_LOG` — Step 7 (`w166b-pgq.py`, `pgq_pooler.py`) · `DEPLOY_WINDOWS` — N/A, no observation window.
**(iii) STEP-2 REFERENCE:** `Scope Files/B_DB_READ_TOOL_PRE_AUDIT.md` r2 at `b14550a63`, your PROCEED (queue `1571882389309886465`), amendments in its §5.

## 1. YOUR STEP-2 ITEMS — WHERE EACH LANDED
| item | landed |
|---|---|
| HARD GATE — drift enrolment | `dt-install-drift` staging manifest: `comms-infra/staging/dt-sql` → `/usr/local/bin/dt-sql` 0755 root, `comms-infra/staging/psql-wrapper` → `/usr/local/bin/psql` 0755 root, dir `/var/lib/dt-sql` 0750 deploy; `pending_days` 1 each. `drift_tests.py` 87/0 with the rows. |
| (1) `w166b-pgq.py` provenance | pre-audit §5: created 11-13 19:55:58Z by me for 166b; its docstring quoted; 0 callers (your trace + root's crontab, as root: 0) |
| (2) delete at Step 7 | both helpers deleted at Step 7 once `dt-sql` returns a live row |
| (3) `pgq_pooler.py` | created 04:30:03Z inside the ban window = the session-pooler test on `#1259`; author INFERRED (me); disposition (5) at Step 7 |
| (4) `LOCK_EX \| LOCK_NB`, own code | contention → exit **5 BUSY**, distinct from 4 LOCKED |
| (5) widen §4 | every node client + `postgres_exporter`; `prefer` → plain `ssl: true` too; elastic-pool wording |
| §13 offer — wrapper honours LOCKED | folded into P2: exit 4 while `/var/lib/dt-sql/LOCKED` exists, `DT_SQL_IGNORE_LOCK=1` for one deliberate check |
| fixture | `fakepsql.py` not reused (the setter's two statements against JSON); new `fakepsql_outcomes.py`; the A1 listener moved in as `fakepg_server.py` |

## 2. NEW AT STEP 3 — MEASURED: SQL MUST GO IN THROUGH `-f`
One correct login per case on staging (`sslmode=require`, read-only): under **`-c`** a syntax error, a refused write and a statement timeout all exit **1** — psql's code for its own fatal errors; under **`-f`** with `ON_ERROR_STOP=1` the same syntax error exits **3**. With `-c`, classifying 1 as ambiguous would have locked dt-sql on every typo. So `-c` SQL is fed through stdin (`-f -`):
```
    if opts["sql"] is not None:
        sql = stdin_data = opts["sql"] if opts["sql"].rstrip().endswith(";") else opts["sql"] + ";"
    ...
        argv += ["-f", opts["file"]] if opts["file"] is not None else ["-f", "-"]
```

## 3. THE LOAD-BEARING CODE (`comms-infra/staging/dt-sql`)
**One attempt** (`connection()`, :115):
```
    conninfo = ("host=%s hostaddr=%s port=%d dbname=%s user=%s sslmode=require connect_timeout=15 application_name=dt-sql" ...)
    return conninfo, urllib.parse.unquote(u.password or "")
```
**Fail-closed lockout** (`main()`, :243 on):
```
    with open(LOCK_FILE, "a") as lf:
        try:
            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)        # one at a time, NEVER queued
        except BlockingIOError: ... return 5
        if os.path.exists(LOCKED_FILE): ... return 4                       # no attempt
        if os.path.exists(INTENT_FILE): lock_state("ambiguous", ...); return 4   # a previous call left no result
        conninfo, password = connection()
        write_json(INTENT_FILE, {...})                            # BEFORE the attempt (fsync + replace)
        env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}
        env.update(PGPASSWORD=password, PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=60s")
        rc, out, err = run_psql(argv, env, stdin_data)           # own session; timeout -> killpg(SIGKILL)
        kind = classify(rc, err)   # 0 ok · 3 sql_error · 2+credential text · 2+"Connection refused" · else ambiguous
        ok/sql_error -> remove INTENT, exit 0/1 · refused -> remove INTENT, exit 3
        credential  -> LOCKED{arm: credential} + critical alert, exit 4
        ambiguous   -> LOCKED{arm: ambiguous}, exit 4
```
**The wrapper** (`comms-infra/staging/psql-wrapper`, whole file 19 lines):
```
if [ -e /var/lib/dt-sql/LOCKED ] && [ "${DT_SQL_IGNORE_LOCK:-}" != "1" ]; then ... exit 4; fi
: "${PGSSLMODE:=require}" "${PGCONNECT_TIMEOUT:=15}"
export PGSSLMODE PGCONNECT_TIMEOUT
exec /usr/bin/psql "$@"
```
The alert uses `dt-install-drift`'s `ALERT_NPM` form (`timeout -k 10 120`, `env -i`, as deploy), dedupe key `dt-sql-credential-locked`.

## 4. TESTS
`tests/dt_sql_tests.py` — **34/0 on staging** (31/0 on Helsinki, which has no `psql`: section 9 skips there and says so). Each case runs a copy differing only in the CONSTANTS block (asserted). Covered: decode (`%40 %2F %3A %25`), no password in argv, PG* stripped, the connection string, read-only PGOPTIONS, `-f -`, the SQL refusal, every outcome, SIGKILL mid-call → next call locks `ambiguous` with no attempt, BUSY → 5, timeout → group killed (grandchild marker never written) → `ambiguous`, `--status`, `--unlock` (non-canonical actor refused, logged), the wrapper (default, caller's value kept, LOCKED refusal, override), and against `fakepg_server.py` with real `psql`: **dt-sql 1 connection and locks `credential`; raw `psql` 2 (CONTROL); the wrapper 1.**
`tests/dt_sql_mutations.py` — **20/20 killed on staging** (refuses unless the unmutated suite passes; crash ≠ kill; NOT-APPLIED fails). Both run in CI (Test Suite).

## 5. JUDGEMENT CALLS — PLEASE ATTACK
1. **A post-login connection drop (psql rc 2 without credential/refused text) locks `ambiguous`.** Fail-closed per your C-1, but it means a network blip mid-query needs a manual unlock. Acceptable?
2. **The wrapper's `[ -e /var/lib/dt-sql/LOCKED ]`** — only root and deploy can see into the 0750 dir, so another account's psql passes the check. Only root and deploy run psql on staging today.
3. **`--unlock` takes the canonical actors plus `cc-pm` and `coltrane`** (`ACTORS`), not read from `server/services/system-alerts.ts`'s `ALERT_ACTORS` — a second list. Should it read that file instead?
4. **The INTENT/LOCKED files are written by deploy** (as root it re-runs as deploy), so a root-only edit cannot leave them root-owned.

## 6. INSTALL (Step 6, after your PROCEED and CI)
As root on staging, from the blobs at the reviewed sha (the dt-api form): `install -d -o deploy -g deploy -m 0750 /var/lib/dt-sql`; `install -o root -g root -m 0755` each file from `git cat-file blob <sha>:<path>`; reinstall `/usr/local/sbin/dt-install-drift` from the same sha (it carries the new manifest rows); append `<sha> <repo path>` override lines to `/var/lib/dt-install-drift/installed.sha`; run `dt-install-drift` → OK for all three. Then Step 7: one live read through `dt-sql`, one through the wrapper (`psql "$DATABASE_URL"`-shaped), `pg_stat_activity` shows `application_name=dt-sql` with `ssl = t`; then delete the two helpers.
