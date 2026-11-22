#!/usr/bin/env python3
"""A stand-in for psql that plays ONE chosen outcome, for dt-sql's tests (B-DB-READ-TOOL).

Not tests/fakepsql.py: that one emulates the crew-password setter's two statements against a JSON database; dt-sql's
tests need chosen exit codes, error lines, a hang and a slow success. The mode is read from the file named by
FAKE_PSQL_MODE (dt-sql strips PG* variables from the child's environment but keeps the rest). Every call appends
{"argv", "PGPASSWORD", "PGOPTIONS", "PGSSLMODE", "stdin", "watch"} to FAKE_PSQL_LOG, so a suite can prove what was (and was not)
passed. Exit codes follow real psql (measured on staging): a SQL error is 3 under -f with ON_ERROR_STOP, but 1 under -c.
"""
import json
import os
import signal
import subprocess
import sys
import time

mode = open(os.environ["FAKE_PSQL_MODE"]).read().strip()
stdin = "" if sys.stdin is None or sys.stdin.isatty() else sys.stdin.read()
with open(os.environ["FAKE_PSQL_LOG"], "a") as fh:
    fh.write(json.dumps({"argv": sys.argv[1:], "PGPASSWORD": os.environ.get("PGPASSWORD"),
                         "PGOPTIONS": os.environ.get("PGOPTIONS"), "PGSSLMODE": os.environ.get("PGSSLMODE"),
                         "stdin": stdin, "pid": os.getpid(), "pgid": os.getpgid(0),
                         # does a named file exist WHILE psql runs? (role-setup must write reader.env.new BEFORE it)
                         "watch": os.path.exists(os.environ["FAKE_WATCH"]) if os.environ.get("FAKE_WATCH") else None})
             + "\n")
if mode == "ok":
    print("1")
    sys.exit(0)
if mode == "ok_race":                            # success, but reader.env appeared meanwhile (FAKE_RACE)
    with open(os.environ["FAKE_RACE"], "w") as fh:
        fh.write("RACER" + chr(10))
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
if mode == "transport":                          # the helper's in-session TLS check raised (stdin line 2)
    sys.stderr.write("psql:<stdin>:2: ERROR:  dt-sql-transport: not TLS\n"
                     "CONTEXT:  PL/pgSQL function inline_code_block line 1 at RAISE\n")
    sys.exit(3)
if mode == "echo":                               # a script error whose text repeats the script: redaction must hold
    sys.stderr.write(stdin)
    sys.exit(3)
if mode == "fatal_echo":                         # an UNCLEAR failure (it locks) whose one stderr line repeats the script:
    sys.stderr.write(" ".join(l for l in stdin.split(chr(10)) if "PASSWORD" in l) + chr(10))   # LOCKED detail + alert: redacted
    sys.exit(1)
if mode == "fatal":
    sys.stderr.write("psql: out of memory\n")
    sys.exit(1)
if mode in ("probe", "probe_bad", "probe_extra"):  # dt-sql-role-setup --verify: the answers a correct dt_reader gives
    rows = ["who|dt_reader", "ro|off", "ssl|t", "roledefault|default_transaction_read_only=on", "attrs|f|f|f|f|f",
            "members|pg_monitor,pg_read_all_data", "read|dt_reader|postgres|t"]
    states = [("insert", "42501"), ("update", "42501"), ("delete", "42501"), ("truncate", "42501"),
              ("create", "42501"), ("nextval", "42501"), ("function", "42501"), ("temp", "P0001"),
              ("ro_layer", "25006")]
    if mode == "probe_bad":                       # one write the role was NOT stopped from making
        states[0] = ("insert", "P0001")
    if mode == "probe_extra":
        states.append(("surprise", "42501"))
    print("BEGIN")
    print("\n".join(rows))
    for n, (name, st) in enumerate(states):
        print("DO")
        sys.stderr.write("psql:<stdin>:%d: NOTICE:  probe|%s|%s\n" % (12 + n, name, st))
    print("ROLLBACK")
    sys.exit(0)
if mode == "slow":
    time.sleep(3)
    print("1")
    sys.exit(0)
if mode == "killed":                              # psql dies on a signal: the helper must report 128+9
    os.kill(os.getpid(), signal.SIGKILL)
if mode == "hang":
    marker = os.environ.get("FAKE_PSQL_MARKER")
    if marker:                                    # a grandchild that would outlive a child-only kill
        # ⛔ its stdio is DEVNULL ON PURPOSE: holding dt-sql's pipes would stall communicate() past TERM_GRACE_S and
        # let the group SIGKILL clean it up, so a child-only SIGTERM would pass unseen (the mutant that survived).
        subprocess.Popen([sys.executable, "-c", "import time; time.sleep(3); open(%r, 'w').write('alive')" % marker],
                         stdin=subprocess.DEVNULL, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL)
    time.sleep(100)
sys.stderr.write("fakepsql_outcomes: unknown mode %r\n" % mode)
sys.exit(99)
