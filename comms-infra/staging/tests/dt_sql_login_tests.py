#!/usr/bin/env python3
"""dt-sql-login, dt-sql's ONE login step — B-DB-READONLY-ROLE (KD-100, row 5a1). POSIX only (flock, signals, sh).

Runs a COPY of the committed helper that differs ONLY in its CONSTANTS block (asserted), directly with python (no
sudo: the test has one account). The test itself plays dt-sql's part: it holds the flock on state/lock and writes the
INTENT record, as dt-sql does before every attempt. The copy runs a stand-in psql (fakepsql_outcomes.py) that plays one
outcome and logs exactly what it was given.
Proves: every refusal happens BEFORE any connection (no ready line, psql never run) and never echoes a reader.env value;
the one psql call has the exact connection string, arguments and environment the design names; the caller's SQL reaches
psql on stdin AFTER the 3-line TLS check; psql's exit code passes through (128+N on a signal); a SIGTERM stops psql.
How dt-sql uses all of this is proved in dt_sql_tests.py.
Run:  python3 comms-infra/staging/tests/dt_sql_login_tests.py        (exit 0 = every check passed)
"""
import fcntl
import importlib.machinery
import importlib.util
import json
import os
import shutil
import signal
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(os.path.dirname(HERE), "dt-sql-login")
FAKE = os.path.join(HERE, "fakepsql_outcomes.py")
PASS = FAIL = 0
PASSWORD = "Rd7_kQ2-xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"   # 40 characters from the reader.env alphabet [A-Za-z0-9_-]
READY = "dt-sql-login: ready\n"


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   " + label)
    else:
        FAIL += 1
        print("  FAIL %s :: %s" % (label, detail))


if os.name != "posix":
    print("dt_sql_login_tests: POSIX only (flock, signals); skipped on %s" % os.name)
    sys.exit(0)

work = tempfile.mkdtemp(prefix="dt-sql-login-tests-")
state = os.path.join(work, "state")
reader_env = os.path.join(work, "reader.env")
ca_file = os.path.join(work, "ca.crt")
mode_file = os.path.join(work, "mode")
psql_log = os.path.join(work, "psql.jsonl")
lock_path = os.path.join(state, "lock")

START, END = "# ── CONSTANTS (the test harness substitutes ONLY this block) ──", "# ── END CONSTANTS ──"
text = open(SRC, encoding="utf-8").read()
head, rest = text.split(START)
_, tail = rest.split(END)

FAKE_SHIM = os.path.join(work, "fakepsql")                 # a checkout's file mode is not to be trusted (see dt_sql_tests)
with open(FAKE_SHIM, "w") as fh:
    fh.write('#!/bin/sh' + chr(10) + 'exec %s %s "$@"' % (sys.executable, FAKE) + chr(10))
os.chmod(FAKE_SHIM, 0o755)


def build(psql=FAKE_SHIM, ca=None, resolve="lambda h, p: '127.0.0.1'", name="dt-sql-login"):
    block = "\n".join([
        "READER_ENV = %r" % reader_env, "STATE_DIR = %r" % state, "CA_FILE = %r" % (ca or ca_file), "PSQL = %r" % psql,
        "STATEMENT_TIMEOUT = '60s'", "RESOLVE = %s" % resolve])
    path = os.path.join(work, name)
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + START + "\n" + block + "\n" + END + tail)
    copy = open(path, encoding="utf-8").read()
    assert copy.split(START)[0] == head and copy.split(END)[1] == tail, "the copy differs outside CONSTANTS"
    return path


def load(path, name):
    ldr = importlib.machinery.SourceFileLoader(name, path)
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, ldr))
    ldr.exec_module(mod)
    return mod


helper = build()
TRANSPORT = load(helper, "dt_sql_login_copy").TRANSPORT.decode()
LOCK_FD = None


def write_env(lines):
    with open(reader_env, "wb") as fh:
        fh.write(("\n".join(lines) + "\n").encode("utf-8") if isinstance(lines, list) else lines)


GOOD_ENV = ["# test reader.env", "DT_READER_HOST=db.example.supabase.co", "DT_READER_PORT=5432", "DT_READER_DBNAME=postgres",
            "DT_READER_USER=dt_reader", "DT_READER_PASSWORD=" + PASSWORD]


def env_with(key, value):
    """GOOD_ENV with one key's value replaced (value None = the key removed)."""
    out = [l for l in GOOD_ENV if not l.startswith(key + "=")]
    return out if value is None else out + ["%s=%s" % (key, value)]


def release():
    global LOCK_FD
    if LOCK_FD is not None:
        os.close(LOCK_FD)
        LOCK_FD = None


def reset(mode="ok", lock=True, intent=True, locked=False):
    """dt-sql's side of the contract: the flock HELD by this process and the INTENT written, as before every attempt."""
    release()
    shutil.rmtree(state, ignore_errors=True)
    os.makedirs(state)
    if os.path.exists(psql_log):
        os.remove(psql_log)
    with open(mode_file, "w") as fh:
        fh.write(mode)
    if os.path.exists(reader_env):                         # an earlier case may have left it mode 0000
        os.remove(reader_env)
    write_env(GOOD_ENV)
    with open(ca_file, "w") as fh:
        fh.write("not a real CA; the stand-in psql never reads it\n")
    if lock:
        global LOCK_FD
        LOCK_FD = os.open(lock_path, os.O_RDWR | os.O_CREAT, 0o644)
        fcntl.flock(LOCK_FD, fcntl.LOCK_EX | fcntl.LOCK_NB)
    if intent:
        with open(os.path.join(state, "INTENT"), "w") as fh:
            fh.write('{"at": "test"}')
    if locked:
        with open(os.path.join(state, "LOCKED"), "w") as fh:
            fh.write('{"arm": "credential"}')


def run(*args, sql=b"select 1;", copy=None):
    env = dict(os.environ, FAKE_PSQL_MODE=mode_file, FAKE_PSQL_LOG=psql_log, PGSSLMODE="prefer", PGPASSWORD="leak")
    r = subprocess.run([sys.executable, copy or helper] + list(args), env=env, input=sql, capture_output=True, timeout=60)
    r.err = r.stderr.decode("utf-8", "replace")
    return r


def calls():
    return [json.loads(l) for l in open(psql_log)] if os.path.exists(psql_log) else []


def refused(label, r, code, also=True, secret=None):
    check("%s: refused %d before any connection (no ready line, psql never run, the marker on stderr)" % (label, code),
          r.returncode == code and "dt-sql-login: refused (" in r.err and READY not in r.err and calls() == [] and also,
          (r.returncode, r.err[-300:], calls()))
    for s in [PASSWORD] + ([secret] if secret else []):
        check("%s: no reader.env value is echoed" % label, s not in r.err and s.encode() not in r.stdout, r.err[-300:])


print("== 1. refusals before any connection")
reset()
refused("an unknown argument", run("--x"), 64)
reset()
refused("--csv given twice", run("--csv", "--csv"), 64)
reset(locked=True)
refused("dt-sql is LOCKED", run(), 65)
reset(intent=False)
refused("no INTENT record", run(), 66)
reset(lock=False)
open(lock_path, "w").close()
refused("the lock file exists but nobody holds the lock", run(), 67)
reset(lock=False)
refused("the lock file does not exist", run(), 67, also=not os.path.exists(lock_path))
check("... and the helper did NOT create it (it opens read-only, never O_CREAT)", not os.path.exists(lock_path))
for label, sql in (("empty SQL", b"  \n "), ("a backslash (psql's \\! would run a shell as dtsql)", b"select 1; \\! id"),
                   ("SQL naming default_transaction_read_only", b"set default_transaction_read_only = off; select 1"),
                   ("SQL naming transaction_read_only", b"set transaction_read_only = off"),
                   ("BEGIN READ WRITE", b"BEGIN READ WRITE; delete from x"),
                   ("read/write split by a newline", b"start transaction read\n  write")):
    reset()
    refused(label, run(sql=sql), 68)
reset()
os.remove(reader_env)
refused("reader.env missing", run(), 69)
if os.geteuid() != 0:
    reset()
    os.chmod(reader_env, 0)
    refused("reader.env unreadable", run(), 69)
else:
    print("  skip: reader.env unreadable (running as root, which reads a 0000 file)")
for label, lines, secret in (
        ("an unknown key", GOOD_ENV + ["DT_READER_EXTRA=1"], None),
        ("a line that is not KEY=value", GOOD_ENV + ["garbage"], None),
        ("a key given twice", GOOD_ENV + ["DT_READER_PORT=5433"], None),
        ("a key missing", env_with("DT_READER_DBNAME", None), None),
        ("a password too short (31)", env_with("DT_READER_PASSWORD", PASSWORD[:31]), PASSWORD[:31]),
        ("a password holding a space", env_with("DT_READER_PASSWORD", "Rd7_kQ2 xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"),
         "Rd7_kQ2 xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"),
        ("a password holding a quote", env_with("DT_READER_PASSWORD", "Rd7_kQ2'xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"),
         "Rd7_kQ2'xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"),
        ("a port above 65535", env_with("DT_READER_PORT", "70000"), None),
        ("port 0", env_with("DT_READER_PORT", "0"), None),
        ("a host holding a space", env_with("DT_READER_HOST", "db.example.com sslmode=disable"), None),
        ("a user that starts with a digit", env_with("DT_READER_USER", "1reader"), None)):
    reset()
    write_env(lines)
    refused("reader.env malformed — %s" % label, run(), 70, secret=secret)
reset()
write_env(("\n".join(GOOD_ENV) + "\n# café\n").encode("utf-8"))
refused("reader.env malformed — not ASCII", run(), 70)
for label, resolve in (("the resolver raises OSError", "lambda h, p: (_ for _ in ()).throw(OSError('x'))"),
                       ("the resolver returns nothing (IndexError)", "lambda h, p: [][0]")):
    reset()
    refused(label, run(copy=build(resolve=resolve, name="dt-sql-login-r")), 71)
reset()
write_env(env_with("DT_READER_HOST", "no-such-host.invalid"))
refused("the DEFAULT resolver: a name that cannot resolve (.invalid)", run(copy=build(resolve="None", name="dt-sql-login-d")), 71)
reset()
refused("the CA file missing", run(copy=build(ca=os.path.join(work, "no-such-ca.crt"), name="dt-sql-login-c")), 72)
reset()
noexec = os.path.join(work, "psql-noexec")
with open(noexec, "w") as fh:
    fh.write("#!/bin/sh\nexit 0\n")
os.chmod(noexec, 0o644)
refused("psql not executable", run(copy=build(psql=noexec, name="dt-sql-login-x")), 73)

print("== 2. the ONE psql call: connection string, arguments, environment, input")
reset("ok")
r = run()
c = calls()
CONNINFO = ("host=db.example.supabase.co hostaddr=127.0.0.1 port=5432 dbname=postgres user=dt_reader sslmode=verify-full "
            "sslrootcert=%s connect_timeout=15 application_name=dt-sql" % ca_file)
check("a clean read exits 0 and psql's row reaches stdout", r.returncode == 0 and r.stdout.decode().strip() == "1",
      (r.returncode, r.stdout, r.err))
check("exactly ONE psql call", len(c) == 1, c)
check("the connection string is EXACTLY the designed one (verify-full against the CA copy, the resolved address pinned, "
      "the host kept for the name check, connect_timeout=15)", c and c[0]["argv"][0] == CONNINFO, c and c[0]["argv"][0])
check("the arguments are exactly: no psqlrc, stop on the first error, unaligned rows split by |, the script on stdin",
      c and c[0]["argv"] == [CONNINFO, "-X", "-v", "ON_ERROR_STOP=1", "-At", "-F", "|", "-f", "-"], c and c[0]["argv"])
check("the reader password reaches psql ONLY through PGPASSWORD (the caller's 'leak' is replaced)",
      c and c[0]["PGPASSWORD"] == PASSWORD and not any(PASSWORD in a for a in c[0]["argv"]), c)
check("the caller's other PG* variables are stripped (PGSSLMODE=prefer does not reach psql)", c and c[0]["PGSSLMODE"] is None, c)
check("PGOPTIONS is exactly: read-only by default, and the statement timeout",
      c and c[0]["PGOPTIONS"] == "-c default_transaction_read_only=on -c statement_timeout=60s", c and c[0]["PGOPTIONS"])
check("psql's stdin is the 3-line TLS check, then the caller's SQL byte for byte (so the SQL starts on line 4)",
      c and c[0]["stdin"] == TRANSPORT + "select 1;" and c[0]["stdin"].split("\n")[3] == "select 1;", c and c[0]["stdin"])
lines = TRANSPORT.split("\n")
check("the TLS check: output hidden, then ONE DO block on line 2 that raises 'dt-sql-transport: not TLS' unless this "
      "backend's pg_stat_ssl row says ssl, and turns any error in the check into a dt-sql-transport error, then output back",
      len(lines) == 4 and lines[0] == "\\o /dev/null" and lines[2] == "\\o" and lines[3] == ""
      and lines[1].startswith("DO $$") and "FROM pg_stat_ssl WHERE pid = pg_backend_pid()" in lines[1]
      and "IF ok IS NOT TRUE THEN RAISE EXCEPTION 'dt-sql-transport: not TLS'" in lines[1]
      and "EXCEPTION WHEN OTHERS THEN RAISE EXCEPTION 'dt-sql-transport: check failed (%)'" in lines[1], lines)
check("stderr begins with the ready line, exactly once", r.err.startswith(READY) and r.err.count(READY) == 1, r.err)
check("the password is in neither stdout nor stderr", PASSWORD not in r.err and PASSWORD.encode() not in r.stdout)
reset("ok")
r = run("--csv")
c = calls()
check("--csv: the same call with --csv in place of -At -F |",
      r.returncode == 0 and c and c[0]["argv"] == [CONNINFO, "-X", "-v", "ON_ERROR_STOP=1", "--csv", "-f", "-"],
      c and c[0]["argv"])
reset("ok")
write_env(env_with("DT_READER_HOST", "localhost"))
r = run(copy=build(resolve="None", name="dt-sql-login-d"))
c = calls()
check("the DEFAULT resolver pins a real address for a resolvable name (hostaddr is localhost's address, host stays)",
      r.returncode == 0 and c and ("hostaddr=127.0.0.1 " in c[0]["argv"][0] or "hostaddr=::1 " in c[0]["argv"][0])
      and "host=localhost " in c[0]["argv"][0], c and c[0]["argv"][0])

print("== 3. psql's exit code passes through, and the ready line comes first")
for mode, code in (("sql_error", 3), ("credential", 2), ("refused", 2), ("fatal", 1), ("transport", 3), ("killed", 137)):
    reset(mode)
    r = run()
    check("psql outcome %s: the helper exits %d (after its ready line)" % (mode, code),
          r.returncode == code and r.err.startswith(READY) and len(calls()) == 1, (r.returncode, r.err[-300:]))
reset("credential")
r = run()
check("the ready line PRECEDES psql's own error text", r.err.find(READY) == 0
      and r.err.find("password authentication failed") > len(READY), r.err)
reset("transport")
r = run()
check("psql's transport line reaches the caller unchanged", "psql:<stdin>:2: ERROR:  dt-sql-transport: not TLS" in r.err, r.err)

print("== 4. a SIGTERM (dt-sql's timeout, relayed by sudo) stops psql and reports 128+15")
reset("hang")
env = dict(os.environ, FAKE_PSQL_MODE=mode_file, FAKE_PSQL_LOG=psql_log)
p = subprocess.Popen([sys.executable, helper], env=env, stdin=subprocess.PIPE, stdout=subprocess.PIPE,
                     stderr=subprocess.PIPE, start_new_session=True)
p.stdin.write(b"select 1;")
p.stdin.close()
deadline = time.time() + 10
while not calls() and time.time() < deadline:
    time.sleep(0.05)
psql_pid = calls()[0]["pid"] if calls() else None
time.sleep(0.2)
os.kill(p.pid, signal.SIGTERM)
try:
    rc = p.wait(timeout=10)
except subprocess.TimeoutExpired:
    rc = "HUNG"
    os.killpg(p.pid, signal.SIGKILL)
    p.wait()
check("SIGTERM to the helper mid-attempt: it exits 143 promptly (psql terminated, not waited out)", rc == 143, rc)
gone = True
if psql_pid:
    try:
        os.kill(psql_pid, 0)
        gone = False
    except ProcessLookupError:
        pass
check("... and psql is gone", psql_pid is not None and gone, psql_pid)
mod = load(helper, "dt_sql_login_sig")
try:
    mod.on_signal(signal.SIGTERM, None)
    code = "returned"
except SystemExit as exc:
    code = exc.code
check("a SIGTERM before psql exists simply exits 128+15", code == 143, code)

release()
shutil.rmtree(work, ignore_errors=True)
print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
