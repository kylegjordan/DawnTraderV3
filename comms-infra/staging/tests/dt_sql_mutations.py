#!/usr/bin/env python3
"""dt-sql mutants (B-DB-READ-TOOL): each safety rule of dt-sql and the psql wrapper, broken on purpose, must make
dt_sql_tests.py fail WITH a FAIL line. Refuses to report unless the unmutated suite passes; a crash (non-zero with no
FAIL line) counts as a problem, never as a kill; a mutation whose anchor is not found exactly once is NOT-APPLIED and
fails the run. Works on a scratch copy of comms-infra/staging; never edits the checkout.
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
    ("sslmode=prefer (libpq's non-SSL retry back on)", "dt-sql", "sslmode=require connect_timeout=15", "sslmode=prefer connect_timeout=15"),
    ("hostaddr not pinned", "dt-sql", "host=%s hostaddr=%s port=%d", "host=%s hostaddr_unused=%s port=%d"),
    ("password not decoded", "dt-sql", 'urllib.parse.unquote(u.password or "")', '(u.password or "")'),
    ("password in argv instead of PGPASSWORD", "dt-sql", '    return conninfo, urllib.parse.unquote(u.password or "")',
     '    return conninfo + " password=" + urllib.parse.unquote(u.password or ""), urllib.parse.unquote(u.password or "")'),
    ("the caller's PG* variables pass through", "dt-sql", 'if not k.startswith("PG")}', "}"),
    ("read-only not set", "dt-sql", '"-c default_transaction_read_only=on -c statement_timeout=%s"', '"-c statement_timeout=%s"'),
    ("read-only SQL not refused", "dt-sql", "    if READONLY_SWITCH.search(sql):", "    if False:"),
    ("SQL through -c again (a typo would lock)", "dt-sql", '        argv += ["-f", "-"]                                      # always',
     '        argv += ["-c", sql]                                      # always'),
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
    ("D-1: psql re-reads the -f path", "dt-sql", '        argv += ["-f", "-"]                                      # always',
     '        argv += ["-f", opts["file"]] if opts["file"] else ["-f", "-"]  # always'),
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
    ("D-2: the wrapper ignores an unfinished attempt", "psql-wrapper", ' || [ -e /var/lib/dt-sql/INTENT ]', ''),
    ("a refused connection locks instead of exiting 3", "dt-sql", '    if rc == 2 and REFUSED.search(text) and not CREDENTIAL.search(text):', '    if False:'),
    ("the timeout kills only the child", "dt-sql", "                os.killpg(proc.pid, signal.SIGKILL)", "                proc.kill()"),
    ("a refused attempt is not audited", "dt-sql", '        log("refused_readonly_sql", sql_head=sql.strip()[:160])', '        pass'),
    ("no exit row (the tool's real exit is not logged)", "dt-sql",
     '    log("exit", exit=code, mode=("status" if "--status" in args else "unlock" if "--unlock" in args else "query"))', '    pass'),
    ("the alert row calls npm's code rc again", "dt-sql", '        log("alert", alert_rc=r.returncode)', '        log("alert", rc=r.returncode)'),
    ("the log calls psql's code rc again", "dt-sql", "            log(kind, psql_rc=rc)", "            log(kind, rc=rc)"),
    ("--unlock takes any actor", "dt-sql", "    if by not in ACTORS:", "    if False:"),
    ("the wrapper keeps libpq's default sslmode", "psql-wrapper", ': "${PGSSLMODE:=require}"', ': "${PGSSLMODE:=}"'),
    ("the wrapper ignores dt-sql's LOCKED", "psql-wrapper", '[ -e /var/lib/dt-sql/LOCKED ] ||', 'false ||'),
]


def run_suite(root):
    p = subprocess.run([sys.executable, os.path.join(root, "tests", "dt_sql_tests.py")], capture_output=True, text=True,
                       timeout=600)
    return p.returncode, [l.strip() for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]


# Mutants run CONCURRENTLY, each in its OWN copy of comms-infra/staging (the suite makes its own state dir and binds
# port 0, so copies share nothing). Run one at a time they took ~7 min of CI's 22-min Test Suite, which every push
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
        print("REFUSED: the unmutated suite does not pass (rc %d) %s" % (rc, fails[:2]))
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
