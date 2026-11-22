#!/usr/bin/env python3
"""dt-sql mutants (B-DB-READ-TOOL; B-DB-READONLY-ROLE): each safety rule of dt-sql, the psql wrapper and the login
step dt-sql-login and the role tool dt-sql-role-setup, broken on purpose, must make the suites fail WITH a FAIL line.
All three suites run for every mutant: dt_sql_tests.py (dt-sql + wrapper), dt_sql_login_tests.py (the helper) and
dt_sql_role_setup_tests.py (the role tool); rc is OR-ed and FAIL lines are joined.
Refuses to report unless the unmutated suites pass; a crash (non-zero with no FAIL line) counts as a problem, never
as a kill; a mutation whose anchor is not found exactly once is NOT-APPLIED and fails the run. Works on scratch copies
of comms-infra/staging; never edits the checkout.
Run:  python3 comms-infra/staging/tests/dt_sql_mutations.py     (exit 0 = every mutant killed)
"""
import os
import shutil
import subprocess
import sys
import tempfile
from concurrent.futures import ThreadPoolExecutor

HERE = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.dirname(HERE)
NL = chr(10)
MUTANTS = [
    # ── dt-sql: the gate, the lock, the record, and how it reads the login step's result ──
    ("read-only SQL not refused", "dt-sql", "    if READONLY_SWITCH.search(sql):", "    if False:"),
    ("INTENT not written before the attempt", "dt-sql",
     '        write_json(INTENT_FILE, {"at": now(), "caller": caller(), "pid": os.getpid()})   # BEFORE the attempt' + NL, ""),
    ("a left-over INTENT is ignored", "dt-sql", "        if os.path.exists(INTENT_FILE):" + NL + "            prior",
     "        if False:" + NL + "            prior"),
    ("LOCKED is not checked", "dt-sql", "        if os.path.exists(LOCKED_FILE):" + NL + "            print(\"dt-sql: LOCKED",
     "        if False:" + NL + "            print(\"dt-sql: LOCKED"),
    ("the lock BLOCKS (queues) instead of refusing", "dt-sql",
     "            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)        # one at a time", "            fcntl.flock(lf, fcntl.LOCK_EX)        # one at a time"),
    ("a wrong password is not classed as credential", "dt-sql", '    if rc == 2 and CREDENTIAL.search(text):', '    if False:'),
    ("no alert on a credential lock", "dt-sql", '            alert("credential", detail[0])' + NL, ""),
    ("an unclassifiable failure does not lock", "dt-sql", '            lock_state("ambiguous", "psql ended without a classifiable result',
     '            pass  # lock_state("ambiguous", "psql ended without a classifiable result'),
    ("an ambiguous lock is silent", "dt-sql", '            alert("ambiguous", "rc %s: %s" % (rc, detail[0]))', '            pass'),
    ("D-1: -c and -f together are accepted", "dt-sql", '    if opts["sql"] is not None and opts["file"] is not None:', '    if False:'),
    ("BEGIN READ WRITE slips the guard", "dt-sql", r'|\bread\s+write\b"', r'|transaction\s+read\s+write"'),
    ("an unexpected error around the attempt exits 1", "dt-sql", "        code = 2" + NL + "    # ⛔ ONE", "        code = 1" + NL + "    # ⛔ ONE"),
    ("an int SystemExit(1) passes through as 1", "dt-sql", "        if isinstance(exc.code, int) and exc.code != 1:",
     "        if isinstance(exc.code, int):"),
    ("a pre-attempt SystemExit exits 1", "dt-sql", "            print(str(exc.code), file=sys.stderr)" + NL + "            code = 2",
     "            print(str(exc.code), file=sys.stderr)" + NL + "            code = 1"),
    ("piped SQL beside -c is silently dropped", "dt-sql", '    if (opts["sql"] is not None or opts["file"] is not None) and piped_input_waiting():',
     '    if False:'),
    ("an empty -c becomes ';'", "dt-sql", '        if not opts["sql"].strip():' + NL + '            print("dt-sql: no SQL given"',
     '        if False:' + NL + '            print("dt-sql: no SQL given"'),
    ("the stdin peek blocks (a read, not a peek)", "dt-sql", "        ready, _, _ = select.select([sys.stdin], [], [], 0)" + NL,
     "        ready = [sys.stdin.read()]" + NL),
    ("a refused connection locks instead of exiting 3", "dt-sql", '    if rc == 2 and REFUSED.search(text) and not CREDENTIAL.search(text):', '    if False:'),
    ("the timeout signals only the child, not its group", "dt-sql", "                os.killpg(proc.pid, signal.SIGTERM)", "                proc.terminate()"),
    ("the timeout's SIGKILL reaches only the child", "dt-sql", "                    os.killpg(proc.pid, signal.SIGKILL)", "                    proc.kill()"),
    ("the login step not in its own session", "dt-sql", "                          start_new_session=True, env=env) as proc:",
     "                          start_new_session=False, env=env) as proc:"),
    ("the ready line is passed on to the caller", "dt-sql", "        ready, err = split_ready(err)", "        ready, _ = split_ready(err)"),
    ("a refusal before any attempt is treated as an attempt", "dt-sql", "        elif not ready and rc != 0:", "        elif False:"),
    ("a failed TLS check is read as a SQL error", "dt-sql", "        elif rc == 3 and TRANSPORT_FAIL.search(err):", "        elif False:"),
    ("a failed TLS check raises no alert", "dt-sql",
     r'            alert("transport", err[m.start():].split(b"\n")[0].decode("utf-8", "replace"))', "            pass"),
    ("C1: a failed TLS check LOCKS (it must not: no password was judged)", "dt-sql",
     '"is raised.", file=sys.stderr)' + NL + "            return 6",
     '"is raised.", file=sys.stderr)' + NL + '            lock_state("ambiguous", "transport", "")' + NL + "            return 6"),
    ("--csv is not passed to the login step", "dt-sql", 'locked_attempt(LOGIN + (["--csv"] if opts["csv"] else []), stdin_data)',
     "locked_attempt(LOGIN, stdin_data)"),
    ("a refused attempt is not audited", "dt-sql", '        log("refused_readonly_sql", sql_head=sql.strip()[:160])', '        pass'),
    ("no exit row (the tool's real exit is not logged)", "dt-sql",
     '    log("exit", exit=code, mode=("status" if "--status" in args else "unlock" if "--unlock" in args else "query"))', '    pass'),
    ("the alert row calls npm's code rc again", "dt-sql", '        log("alert", alert_rc=r.returncode)', '        log("alert", rc=r.returncode)'),
    ("the log calls psql's code rc again", "dt-sql", "            log(kind, psql_rc=rc)", "            log(kind, rc=rc)"),
    ("--unlock takes any actor", "dt-sql", "    if by not in ACTORS:", "    if False:"),
    # ── the psql wrapper ──
    ("D-2: the wrapper ignores an unfinished attempt", "psql-wrapper", ' || [ -e /var/lib/dt-sql/INTENT ]', ''),
    ("the wrapper keeps libpq's default sslmode", "psql-wrapper", ': "${PGSSLMODE:=require}"', ': "${PGSSLMODE:=}"'),
    ("the wrapper ignores dt-sql's LOCKED", "psql-wrapper", '[ -e /var/lib/dt-sql/LOCKED ] ||', 'false ||'),
    # ── dt-sql-login: the one login step ──
    ("login: any argument accepted", "dt-sql-login", '    if args not in ([], ["--csv"]):', "    if False:"),
    ("login: LOCKED not checked", "dt-sql-login", "    if os.path.exists(LOCKED_FILE):", "    if False:"),
    ("login: runs without an INTENT record", "dt-sql-login", "    if not os.path.exists(INTENT_FILE):", "    if False:"),
    ("login: runs without dt-sql's lock held", "dt-sql-login", "    if not lock_is_held():", "    if False:"),
    ("login: creates the lock file it checks", "dt-sql-login", "fd = os.open(LOCK_FILE, os.O_RDONLY)",
     "fd = os.open(LOCK_FILE, os.O_RDONLY | os.O_CREAT)"),
    ("login: empty SQL accepted", "dt-sql-login", "    if not sql.strip():", "    if False:"),
    ("login: a backslash reaches psql", "dt-sql-login", r'    if b"\\" in sql:', "    if False:"),
    ("login: read-only SQL accepted", "dt-sql-login", "    if READONLY_SWITCH.search(sql):", "    if False:"),
    ("login: a reader.env value is not checked", "dt-sql-login", "        if not FIELDS[key].fullmatch(value):", "        if False:"),
    ("login: a reader.env key may repeat", "dt-sql-login", "        if key in seen:", "        if False:"),
    ("login: a reader.env key may be missing", "dt-sql-login", "    if missing:", "    if False:"),
    ("login: a port above 65535 accepted", "dt-sql-login", '    if int(seen["DT_READER_PORT"]) > 65535:', "    if False:"),
    ("login: a resolver OSError is not a refusal", "dt-sql-login", "    except (OSError, IndexError) as exc:", "    except (IndexError,) as exc:"),
    ("login: an empty resolver answer is not a refusal", "dt-sql-login", "    except (OSError, IndexError) as exc:", "    except (OSError,) as exc:"),
    ("login: the default resolver pins the wrong field", "dt-sql-login", "[0][4][0])", "[0][4][1])"),
    ("login: the CA file not checked", "dt-sql-login", "    if not os.access(CA_FILE, os.R_OK):", "    if False:"),
    ("login: psql not checked executable", "dt-sql-login", "    if not os.access(PSQL, os.X_OK):", "    if False:"),
    ("login: sslmode=require (no certificate check)", "dt-sql-login", "sslmode=verify-full sslrootcert", "sslmode=require sslrootcert"),
    ("login: the CA copy is not named", "dt-sql-login", "sslrootcert=%s connect_timeout", "sslrootcert_unused=%s connect_timeout"),
    ("login: the address is not pinned", "dt-sql-login", "host=%s hostaddr=%s port=%d", "host=%s hostaddr_unused=%s port=%d"),
    ("login: no connect timeout", "dt-sql-login", 'sslrootcert=%s connect_timeout=15 "', 'sslrootcert=%s "'),
    ("login: the password goes into the connection string", "dt-sql-login",
     '    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}',
     '    conninfo += " password=" + cfg["DT_READER_PASSWORD"]' + NL + '    env = {k: v for k, v in os.environ.items() if not k.startswith("PG")}'),
    ("login: the caller's PG* variables pass through", "dt-sql-login", 'if not k.startswith("PG")}', "}"),
    ("login: read-only not set", "dt-sql-login", 'PGOPTIONS="-c default_transaction_read_only=on -c statement_timeout=%s"',
     'PGOPTIONS="-c statement_timeout=%s"'),
    ("login: no ready line", "dt-sql-login", "sys.stderr.buffer.write(READY)", 'sys.stderr.buffer.write(b"")'),
    ("login: the TLS check is not sent first", "dt-sql-login", "proc.communicate(input=TRANSPORT + sql)", "proc.communicate(input=sql)"),
    ("login: a signal death is not 128+N", "dt-sql-login", "128 - proc.returncode", "proc.returncode"),
    ("login: a SIGTERM does not stop psql", "dt-sql-login", "        CHILD.terminate()", "        pass"),
    ("login: a SIGTERM before psql does not exit", "dt-sql-login", "        raise SystemExit(128 + signum)", "        pass"),
    # dt-sql-role-setup (B-DB-READONLY-ROLE): the tool that makes the reader role, re-keys it and proves it
    ("dt-sql: a direct psql run is not treated as a real attempt", "dt-sql", "ready = ready or direct", "ready = ready"),
    ("role-setup: the login bypasses dt-sql's one-attempt lock", "dt-sql-role-setup",
     "        rc = ds.locked_attempt(argv, dl.TRANSPORT.decode() + sql, env=env, emit=emit, direct=True, redact=redact)",
     "        rc0, o, e = ds.run_login(argv, dl.TRANSPORT.decode() + sql, env); emit(o, e); rc = rc0"),
    ("role-setup: the TLS check is not sent first", "dt-sql-role-setup",
     "ds.locked_attempt(argv, dl.TRANSPORT.decode() + sql,", "ds.locked_attempt(argv, sql,"),
    ("role-setup: the server certificate is not verified", "dt-sql-role-setup",
     "sslmode=verify-full sslrootcert", "sslmode=require sslrootcert"),
    ("role-setup: the new password goes straight to reader.env", "dt-sql-role-setup",
     "fd = os.open(NEW_ENV, os.O_WRONLY", "fd = os.open(dl.READER_ENV, os.O_WRONLY"),
    ("role-setup: verify falls back to the app login", "dt-sql-role-setup", "        raise Refusal(71, str(exc))",
     '        h, p, d, u, pw = app_login(); cfg = {"DT_READER_HOST": h, "DT_READER_PORT": str(p), '
     '"DT_READER_DBNAME": d, "DT_READER_USER": ROLE, "DT_READER_PASSWORD": pw}'),
    ("role-setup: the plaintext password is sent", "dt-sql-role-setup",
     "% (ROLE, verifier, ROLE, ROLE))", "% (ROLE, password, ROLE, ROLE))"),
    ("role-setup: the password is written AFTER the database takes it", "dt-sql-role-setup",
     NL.join(['    write_new(host, port, dbname, password, mode)',
             '    rc, out, err = attempt(psql_argv(host, addr, port, dbname, user), sql,',
             '                           child_env(app_password, "-c statement_timeout=60s"), redact=(verifier, password))']),
     NL.join(['    rc, out, err = attempt(psql_argv(host, addr, port, dbname, user), sql,',
             '                           child_env(app_password, "-c statement_timeout=60s"), redact=(verifier, password))',
             '    write_new(host, port, dbname, password, mode)'])),
    ("role-setup: a lock deletes reader.env.new", "dt-sql-role-setup", "    if rc == 4:", "    if False:"),
    ("role-setup: --recover runs over an existing reader.env", "dt-sql-role-setup",
     '    if mode == "--recover" and exists:', "    if False:"),
    ("role-setup: --recover makes the role again", "dt-sql-role-setup",
     '    if mode == "--create":', '    if mode in ("--create", "--recover"):'),
    ("role-setup: --recover overwrites a reader.env that appeared", "dt-sql-role-setup",
     '        if mode in ("--create", "--recover"):', '        if mode == "--create":'),
    ("role-setup: the promote replaces instead of linking", "dt-sql-role-setup",
     "                os.link(NEW_ENV, dl.READER_ENV)", "                os.replace(NEW_ENV, dl.READER_ENV)"),
    ("role-setup: no redaction", "dt-sql-role-setup",
     '        out, err = out.replace(secret, "<redacted>"), err.replace(secret, "<redacted>")', "        pass"),
    ("role-setup: verify keeps the read-only default on", "dt-sql-role-setup",
     "-c default_transaction_read_only=off ", ""),
    ("role-setup: an unasked probe passes", "dt-sql-role-setup", "    if extra:", "    if False:"),
    ("role-setup: runs while dt-sql is LOCKED", "dt-sql-role-setup",
     "    if os.path.exists(ds.LOCKED_FILE) or os.path.exists(ds.INTENT_FILE):", "    if False:"),
    ("role-setup: verify accepts a readable reader.env", "dt-sql-role-setup",
     "    if stat.S_IMODE(st.st_mode) != 0o600:", "    if False:"),
    # ── B-DB-READONLY-ROLE Step-4 r2 (Langston C4 + the redact pass-through) ──
    ("C4: write_json trusts the open mode (no fchmod)", "dt-sql", "    os.fchmod(fd, 0o640)" + NL, ""),
    ("C4: LOCKED/INTENT written 0644", "dt-sql", "os.O_TRUNC, 0o640)" + NL + "    os.fchmod(fd, 0o640)",
     "os.O_TRUNC, 0o644)" + NL + "    os.fchmod(fd, 0o644)"),
    ("C4: log.jsonl created 0644", "dt-sql", "os.O_CREAT, 0o640), \"a\")", "os.O_CREAT, 0o644), \"a\")"),
    ("redact: locked_attempt ignores redact", "dt-sql",
     "        for secret in redact:" + NL + "            detail = [d.replace(secret, \"<redacted>\") for d in detail]" + NL, ""),
    ("redact: role-setup does not pass its secrets", "dt-sql-role-setup", "direct=True, redact=redact)", "direct=True)"),
]


SUITES = ("dt_sql_tests.py", "dt_sql_login_tests.py", "dt_sql_role_setup_tests.py")


def run_suite(root):
    rc, fails = 0, []
    for suite in SUITES:
        p = subprocess.run([sys.executable, os.path.join(root, "tests", suite)], capture_output=True, text=True,
                           timeout=600)
        rc = rc or p.returncode
        fails += [l.strip() for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
    return rc, fails


# Mutants run CONCURRENTLY, each in its OWN copy of comms-infra/staging. The suite makes its own state dir, so the
# copies share files with nothing. ONE EXCEPTION, a shared resource: section 9's TCP port. dt_sql_tests.py binds port 0
# only to DISCOVER a free port, CLOSES it, and fakepg_server.py binds that concrete port a process later — so two
# copies can race for it (EADDRINUSE; the child's traceback goes to stderr, which run_suite does not collect).
# Langston measured 0 collisions in 140 picks (B-DB-READONLY-ROLE carrier review). A second shared resource added
# here needs the same check. Run one at a time the mutants took ~7 min of CI's 22-min Test Suite, which every push
# landing inside it cancelled. MUTANT_WORKERS overrides the pool size (1 = the old serial behaviour).
WORKERS = max(1, int(os.environ.get("MUTANT_WORKERS") or (os.cpu_count() or 2)))
scratch = tempfile.mkdtemp(prefix="dt-sql-mut-")


def run_mutant(idx):
    """One mutant in its own scratch copy. Returns (line, bad)."""
    name, fname, a, b = MUTANTS[idx]
    orig = open(os.path.join(STAGING, fname), encoding="utf-8").read()
    if orig.count(a) != 1:
        return "NOT-APPLIED %s (anchor count %d)" % (name, orig.count(a)), True
    root = os.path.join(scratch, "m%03d" % idx, "staging")
    try:
        shutil.copytree(STAGING, root, ignore=shutil.ignore_patterns("__pycache__"))
        open(os.path.join(root, fname), "w", encoding="utf-8", newline="").write(orig.replace(a, b))
        rc, fails = run_suite(root)
    finally:
        shutil.rmtree(os.path.dirname(root), ignore_errors=True)
    killed = rc != 0 and bool(fails)
    return ("KILLED  " if killed else ("CRASHED " if rc != 0 else "SURVIVED")) + " %-60s %s" % (name, fails[:1]), not killed


bad = 0
try:
    base = os.path.join(scratch, "base", "staging")
    shutil.copytree(STAGING, base, ignore=shutil.ignore_patterns("__pycache__"))
    rc, fails = run_suite(base)
    if rc != 0:
        print("REFUSED: the unmutated suites do not pass (rc %d) %s" % (rc, fails[:2]))
        sys.exit(2)
    with ThreadPoolExecutor(max_workers=WORKERS) as pool:
        results = list(pool.map(run_mutant, range(len(MUTANTS))))    # map keeps MUTANTS order in the report
    for line, is_bad in results:
        print(line)
        bad += is_bad
finally:
    shutil.rmtree(scratch, ignore_errors=True)
print("%d of %d killed (%d workers)" % (len(MUTANTS) - bad, len(MUTANTS), WORKERS))
sys.exit(1 if bad else 0)
