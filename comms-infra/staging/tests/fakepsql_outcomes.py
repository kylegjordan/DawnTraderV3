#!/usr/bin/env python3
"""A stand-in for psql that plays ONE chosen outcome, for dt-sql's tests (B-DB-READ-TOOL).

Not tests/fakepsql.py: that one emulates the crew-password setter's two statements against a JSON database; dt-sql's
tests need chosen exit codes, error lines, a hang and a slow success. The mode is read from the file named by
FAKE_PSQL_MODE (dt-sql strips PG* variables from the child's environment but keeps the rest). Every call appends
{"argv", "PGPASSWORD", "PGOPTIONS", "PGSSLMODE", "stdin"} to FAKE_PSQL_LOG, so a suite can prove what was (and was not)
passed. Exit codes follow real psql (measured on staging): a SQL error is 3 under -f with ON_ERROR_STOP, but 1 under -c.
"""
import json
import os
import subprocess
import sys
import time

mode = open(os.environ["FAKE_PSQL_MODE"]).read().strip()
stdin = "" if sys.stdin is None or sys.stdin.isatty() else sys.stdin.read()
with open(os.environ["FAKE_PSQL_LOG"], "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:], "PGPASSWORD": os.environ.get("PGPASSWORD"),
                         "PGOPTIONS": os.environ.get("PGOPTIONS"), "PGSSLMODE": os.environ.get("PGSSLMODE"),
                         "stdin": stdin}) + "\n")
if mode == "ok":
    print("1")
    sys.exit(0)
if mode == "sql_error":
    sys.stderr.write('ERROR:  syntax error at or near "from"\n')
    sys.exit(1 if "-c" in sys.argv else 3)
if mode == "credential":
    sys.stderr.write('psql: error: connection to server at "db.x" (::1), port 5432 failed: FATAL:  password '
                     'authentication failed for user "postgres"\n')
    sys.exit(2)
if mode == "refused":
    sys.stderr.write('psql: error: connection to server at "db.x" (::1), port 5432 failed: Connection refused\n'
                     '\tIs the server running on that host and accepting TCP/IP connections?\n')
    sys.exit(2)
if mode == "fatal":
    sys.stderr.write("psql: out of memory\n")
    sys.exit(1)
if mode == "slow":
    time.sleep(3)
    print("1")
    sys.exit(0)
if mode == "hang":
    marker = os.environ.get("FAKE_PSQL_MARKER")
    if marker:                                    # a grandchild that would outlive a child-only kill
        subprocess.Popen([sys.executable, "-c", "import time; time.sleep(3); open(%r, 'w').write('alive')" % marker])
    time.sleep(100)
sys.stderr.write("fakepsql_outcomes: unknown mode %r\n" % mode)
sys.exit(99)
