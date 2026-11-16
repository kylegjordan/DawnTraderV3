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
    ("SQL through -c again (a typo would lock)", "dt-sql", '["-f", opts["file"]] if opts["file"] is not None else ["-f", "-"]',
     '["-f", opts["file"]] if opts["file"] is not None else ["-c", sql]'),
    ("INTENT not written before the attempt", "dt-sql",
     '        write_json(INTENT_FILE, {"at": now(), "caller": caller(), "pid": os.getpid()})   # BEFORE the attempt' + NL, ""),
    ("a left-over INTENT is ignored", "dt-sql", "        if os.path.exists(INTENT_FILE):" + NL + "            prior",
     "        if False:" + NL + "            prior"),
    ("LOCKED is not checked", "dt-sql", "        if os.path.exists(LOCKED_FILE):" + NL + "            print(\"dt-sql: LOCKED",
     "        if False:" + NL + "            print(\"dt-sql: LOCKED"),
    ("the lock BLOCKS (queues) instead of refusing", "dt-sql",
     "            fcntl.flock(lf, fcntl.LOCK_EX | fcntl.LOCK_NB)        # one at a time", "            fcntl.flock(lf, fcntl.LOCK_EX)        # one at a time"),
    ("a wrong password is not classed as credential", "dt-sql", '    if rc == 2 and CREDENTIAL.search(text):', '    if False:'),
    ("no alert on a credential lock", "dt-sql", "            alert(detail[0])" + NL, ""),
    ("an unclassifiable failure does not lock", "dt-sql", '            lock_state("ambiguous", "psql ended without a classifiable result',
     '            pass  # lock_state("ambiguous", "psql ended without a classifiable result'),
    ("a refused connection locks instead of exiting 3", "dt-sql", '    if rc == 2 and REFUSED.search(text) and not CREDENTIAL.search(text):', '    if False:'),
    ("the timeout kills only the child", "dt-sql", "                os.killpg(proc.pid, signal.SIGKILL)", "                proc.kill()"),
    ("--unlock takes any actor", "dt-sql", "    if by not in ACTORS:", "    if False:"),
    ("the wrapper keeps libpq's default sslmode", "psql-wrapper", ': "${PGSSLMODE:=require}"', ': "${PGSSLMODE:=}"'),
    ("the wrapper ignores dt-sql's LOCKED", "psql-wrapper", 'if [ -e /var/lib/dt-sql/LOCKED ] && [ "${DT_SQL_IGNORE_LOCK:-}" != "1" ]; then',
     'if false && [ -e /var/lib/dt-sql/LOCKED ]; then'),
]


def run_suite(root):
    p = subprocess.run([sys.executable, os.path.join(root, "tests", "dt_sql_tests.py")], capture_output=True, text=True,
                       timeout=600)
    return p.returncode, [l.strip() for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]


scratch = tempfile.mkdtemp(prefix="dt-sql-mut-")
root = os.path.join(scratch, "staging")
shutil.copytree(STAGING, root, ignore=shutil.ignore_patterns("__pycache__"))
bad = 0
try:
    rc, fails = run_suite(root)
    if rc != 0:
        print("REFUSED: the unmutated suite does not pass (rc %d) %s" % (rc, fails[:2]))
        sys.exit(2)
    for name, fname, a, b in MUTANTS:
        path = os.path.join(root, fname)
        orig = open(path, encoding="utf-8").read()
        if orig.count(a) != 1:
            print("NOT-APPLIED %s (anchor count %d)" % (name, orig.count(a)))
            bad += 1
            continue
        open(path, "w", encoding="utf-8", newline="").write(orig.replace(a, b))
        try:
            rc, fails = run_suite(root)
        finally:
            open(path, "w", encoding="utf-8", newline="").write(orig)
        killed = rc != 0 and bool(fails)
        print(("KILLED  " if killed else ("CRASHED " if rc != 0 else "SURVIVED")) + " %-60s %s" % (name, fails[:1]))
        bad += not killed
finally:
    shutil.rmtree(scratch, ignore_errors=True)
print("%d of %d killed" % (len(MUTANTS) - bad, len(MUTANTS)))
sys.exit(1 if bad else 0)
