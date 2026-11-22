#!/usr/bin/env python3
"""dt-sql, its login step dt-sql-login, and the psql wrapper — B-DB-READ-TOOL (KD-96, #1259) and B-DB-READONLY-ROLE
(KD-100, row 5a1). POSIX only (flock, process groups, sh).

Each case runs COPIES of the committed dt-sql and dt-sql-login that differ ONLY in their CONSTANTS blocks (asserted).
dt-sql's LOGIN runs the dt-sql-login copy directly (no sudo: the test has one account), and that copy runs a stand-in
psql (fakepsql_outcomes.py) that plays one outcome and logs what it was given. Where real psql and openssl exist, the
one-attempt guarantee is also proved against a local fake Postgres server (fakepg_server.py) that counts connections:
dt-sql 1 with verify-full passing (a credential lock proves the TLS check got as far as the password), 0 with the
wrong CA (the control that verify-full really verifies), raw psql on the same server 2 (the control that the counter
sees libpq's non-SSL retry), the wrapper 1. The helper's own refusals are proved in dt_sql_login_tests.py.
Run:  python3 comms-infra/staging/tests/dt_sql_tests.py        (exit 0 = every check passed)
"""
import importlib.machinery
import importlib.util
import json
import os
import shutil
import signal
import socket
import stat
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.dirname(HERE)
SRC = os.path.join(STAGING, "dt-sql")
LOGIN_SRC = os.path.join(STAGING, "dt-sql-login")
WRAPPER = os.path.join(STAGING, "psql-wrapper")
FAKE = os.path.join(HERE, "fakepsql_outcomes.py")
FAKEPG = os.path.join(HERE, "fakepg_server.py")
PASS = FAIL = 0
PASSWORD = "Rd7_kQ2-xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"   # 40 characters from the reader.env alphabet [A-Za-z0-9_-]


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   " + label)
    else:
        FAIL += 1
        print("  FAIL %s :: %s" % (label, detail))


if os.name != "posix":
    print("dt_sql_tests: POSIX only (flock, process groups); skipped on %s" % os.name)
    sys.exit(0)

work = tempfile.mkdtemp(prefix="dt-sql-tests-")
state = os.path.join(work, "state")
reader_env = os.path.join(work, "reader.env")
ca_file = os.path.join(work, "ca.crt")
mode_file = os.path.join(work, "mode")
psql_log = os.path.join(work, "psql.jsonl")
alert_log = os.path.join(work, "alerts.jsonl")
alert_rec = os.path.join(work, "alert_recorder.py")
with open(alert_rec, "w") as fh:
    fh.write("import json,sys\nopen(%r,'a').write(json.dumps(sys.argv[1:])+'\\n')\n" % alert_log)


def write_reader_env(host="db.example.supabase.co", port=5432, password=PASSWORD):
    with open(reader_env, "w") as fh:
        fh.write("# test reader.env\nDT_READER_HOST=%s\nDT_READER_PORT=%d\nDT_READER_DBNAME=postgres\n"
                 "DT_READER_USER=dt_reader\nDT_READER_PASSWORD=%s\n" % (host, port, password))


START, END = "# ── CONSTANTS (the test harness substitutes ONLY this block) ──", "# ── END CONSTANTS ──"


def split_src(path):
    text = open(path, encoding="utf-8").read()
    h, rest = text.split(START)
    _, t = rest.split(END)
    return h, t


head, tail = split_src(SRC)
lhead, ltail = split_src(LOGIN_SRC)


def write_copy(path, h, block, t):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(h + START + "\n" + block + "\n" + END + t)
    copy = open(path, encoding="utf-8").read()
    assert copy.split(START)[0] == h and copy.split(END)[1] == t, "the copy of %s differs outside CONSTANTS" % path
    return path


# The stand-in psql is launched through a shim this suite writes and marks executable itself: a checkout's file mode
# is not to be trusted (CI's Linux checkout stores the .py 0644, and exec'ing it failed every call — 2026-11-16).
FAKE_SHIM = os.path.join(work, "fakepsql")
with open(FAKE_SHIM, "w") as fh:
    fh.write('#!/bin/sh' + chr(10) + 'exec %s %s "$@"' % (sys.executable, FAKE) + chr(10))
os.chmod(FAKE_SHIM, 0o755)


def build_login(psql=FAKE_SHIM, ca=None, resolve="lambda h, p: '127.0.0.1'", name="dt-sql-login"):
    block = "\n".join([
        "READER_ENV = %r" % reader_env, "STATE_DIR = %r" % state, "CA_FILE = %r" % (ca or ca_file), "PSQL = %r" % psql,
        "STATEMENT_TIMEOUT = '60s'", "RESOLVE = %s" % resolve])
    return write_copy(os.path.join(work, name), lhead, block, ltail)


login_copy = build_login()


def build(timeout=300, login_argv=None, grace=1, login=None):
    block = "\n".join([
        "STATE_DIR = %r" % state, "LOGIN = %r" % (login_argv or [sys.executable, login or login_copy]), "RUN_AS = ''",
        "RUNUSER = '/bin/false'", "CALL_TIMEOUT_S = %d" % timeout, "TERM_GRACE_S = %d" % grace, "APP_DIR = %r" % work,
        "ALERT_NPM = [%r, %r]" % (sys.executable, alert_rec)])
    return write_copy(os.path.join(work, "dt-sql"), head, block, tail)


def load(path, name):
    ldr = importlib.machinery.SourceFileLoader(name, path)
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, ldr))
    ldr.exec_module(mod)
    return mod


TRANSPORT = load(login_copy, "dt_sql_login_copy").TRANSPORT.decode()


os.umask(0o002)                                               # deploy's measured umask: the state-file modes must not depend on it


def reset(mode="ok"):
    shutil.rmtree(state, ignore_errors=True)
    os.makedirs(state)
    for p in (psql_log, alert_log):
        if os.path.exists(p):
            os.remove(p)
    with open(mode_file, "w") as fh:
        fh.write(mode)
    write_reader_env()
    with open(ca_file, "w") as fh:
        fh.write("not a real CA; the stand-in psql never reads it\n")


def setmode(mode):
    with open(mode_file, "w") as fh:
        fh.write(mode)


def run(tool, *args, stdin=None, extra_env=None, background=False):
    env = dict(os.environ, FAKE_PSQL_MODE=mode_file, FAKE_PSQL_LOG=psql_log, PGSSLMODE="prefer", PGPASSWORD="leak")
    env.update(extra_env or {})
    if background:
        return subprocess.Popen([sys.executable, tool] + list(args), env=env, stdin=subprocess.DEVNULL,
                                stdout=subprocess.PIPE, stderr=subprocess.PIPE, start_new_session=True)
    return subprocess.run([sys.executable, tool] + list(args), env=env, input=stdin, capture_output=True, text=True,
                          timeout=60)


def calls():
    if not os.path.exists(psql_log):
        return []
    return [json.loads(l) for l in open(psql_log)]


def locked():
    p = os.path.join(state, "LOCKED")
    return json.load(open(p)) if os.path.exists(p) else None


def intent():
    return os.path.exists(os.path.join(state, "INTENT"))


def logrows():
    p = os.path.join(state, "log.jsonl")
    return [json.loads(l) for l in open(p)] if os.path.exists(p) else []


def alerts():
    return open(alert_log).read() if os.path.exists(alert_log) else ""


tool = build()
print("== 1. the reader credential, the connection string, and what reaches psql")
reset("ok")
r = run(tool, "-c", "select 1")
c = calls()
check("a clean read exits 0 and prints the row", r.returncode == 0 and r.stdout.strip() == "1", (r.returncode, r.stdout, r.stderr))
check("the reader password (from reader.env, nowhere else) reaches psql only through PGPASSWORD",
      c and c[0]["PGPASSWORD"] == PASSWORD, c)
check("the password is in NO argument", c and not any(PASSWORD in a for a in c[0]["argv"]), c and c[0]["argv"])
conninfo = c[0]["argv"][0] if c else ""
check("ONE attempt, VERIFIED: sslmode=verify-full against the CA copy, hostaddr pinned, host kept for the name check, "
      "connect_timeout set", "sslmode=verify-full" in conninfo and ("sslrootcert=%s " % ca_file) in conninfo
      and "hostaddr=127.0.0.1" in conninfo and "host=db.example.supabase.co" in conninfo
      and "connect_timeout=15" in conninfo and "user=dt_reader" in conninfo, conninfo)
check("the caller's PGSSLMODE/PGPASSWORD do not leak into psql (PG* stripped by the login step)",
      c and c[0]["PGSSLMODE"] is None, c)
check("read-only by default: PGOPTIONS sets default_transaction_read_only=on and a statement timeout",
      c and "default_transaction_read_only=on" in c[0]["PGOPTIONS"] and "statement_timeout=" in c[0]["PGOPTIONS"], c)
check("the SQL goes in through stdin with -f -, AFTER the 3-line TLS check (so it starts on stdin line 4)",
      c and "-c" not in c[0]["argv"] and c[0]["argv"][-2:] == ["-f", "-"] and c[0]["stdin"] == TRANSPORT + "select 1;"
      and TRANSPORT.count("\n") == 3, c)
check("the login step's ready line is stripped from what the caller sees", "dt-sql-login: ready" not in r.stderr, r.stderr)
check("a clean read leaves no INTENT and no LOCKED, and logs ok with psql's code", not intent() and locked() is None
      and any(e["event"] == "ok" and e.get("psql_rc") == 0 for e in logrows()), logrows())
reset("ok")
r = run(tool, "--csv", "-c", "select 1")
c = calls()
check("--csv reaches psql as --csv (and not the unaligned -At form)", r.returncode == 0 and c and "--csv" in c[0]["argv"]
      and "-At" not in c[0]["argv"], c)

print("== 2. read-only SQL refusal (before connecting), and ONE input mode")
reset("ok")
r = run(tool, "-c", "set default_transaction_read_only = off; delete from x")
check("SQL naming the read-only setting is refused, exit 2, psql never called", r.returncode == 2 and calls() == [], (r.returncode, calls()))
lr = logrows()
check("a refused attempt is AUDITED by dt-sql itself: a refused_readonly_sql row with the SQL's head, and an exit row "
      "with exit 2 (F-1)", any(e["event"] == "refused_readonly_sql" and "default_transaction_read_only" in e.get("sql_head", "")
                               for e in lr) and any(e["event"] == "exit" and e.get("exit") == 2 for e in lr), lr)
for stmt in ("BEGIN READ WRITE; delete from x", "START TRANSACTION READ WRITE", "BEGIN TRANSACTION READ WRITE"):
    reset("ok")
    r = run(tool, "-c", stmt)
    check("refused by dt-sql before the login step: %r" % stmt, r.returncode == 2 and calls() == []
          and any(e["event"] == "refused_readonly_sql" for e in logrows()), (r.returncode, calls(), logrows()))
reset("ok")
r = run(tool, "-c", "select 1; \\! id")
check("a backslash (psql's \\! runs a shell as dtsql) is refused by the login step BEFORE connecting: exit 2, psql "
      "never called, nothing locked, INTENT cleared", r.returncode == 2 and calls() == [] and locked() is None
      and not intent() and "dt-sql-login: refused" in r.stderr, (r.returncode, calls(), r.stderr))
check("... and logged as login_refused with the helper's code (68)",
      any(e["event"] == "login_refused" and e.get("login_rc") == 68 for e in logrows()), logrows())
evil = os.path.join(work, "evil.sql")
with open(evil, "w") as fh:
    fh.write("BEGIN READ WRITE; delete from x;")
reset("ok")
r = run(tool, "-c", "select 1", "-f", evil)
check("D-1: -c and -f together are REFUSED (exit 2), psql never called", r.returncode == 2 and calls() == [], (r.returncode, calls()))
reset("ok")
r = run(tool, "-f", evil)
check("a -f file that switches read-only off is refused by dt-sql (exit 2)", r.returncode == 2 and calls() == []
      and any(e["event"] == "refused_readonly_sql" for e in logrows()), (r.returncode, calls()))
good = os.path.join(work, "good.sql")
with open(good, "w") as fh:
    fh.write("select 1;")
reset("ok")
r = run(tool, "-f", good)
c = calls()
check("D-1: a -f file's CHECKED BYTES go to psql on stdin (-f -), never the path", r.returncode == 0 and c
      and c[0]["argv"][-2:] == ["-f", "-"] and c[0]["stdin"] == TRANSPORT + "select 1;" and good not in c[0]["argv"], c)
reset("ok")
r = run(tool, "-c", "select 1", stdin="delete from x;")
check("SQL piped in AND given with -c is refused (exit 2), never silently dropped", r.returncode == 2 and calls() == [],
      (r.returncode, calls()))
reset("ok")
r = run(tool, "-c", "   ")
check("an empty -c is refused (exit 2), not turned into ';'", r.returncode == 2 and calls() == [], (r.returncode, calls()))
reset("ok")
rd, wr = os.pipe()                                           # stdin OPEN and EMPTY, as over `ssh box 'dt-sql -c ...'`
p = subprocess.Popen([sys.executable, tool, "-c", "select 1"], stdin=rd, stdout=subprocess.PIPE, stderr=subprocess.PIPE,
                     env=dict(os.environ, FAKE_PSQL_MODE=mode_file, FAKE_PSQL_LOG=psql_log))
os.close(rd)
try:
    rc = p.wait(timeout=20)
except subprocess.TimeoutExpired:
    p.kill()
    rc = "HUNG"
os.close(wr)
check("-c with stdin left OPEN and EMPTY (ssh without -n) does not hang: it runs (exit 0)", rc == 0, rc)

print("== 3. every outcome of the one attempt (fail closed)")
reset("sql_error")
r = run(tool, "-c", "select from")
check("logged in, SQL failed: exit 1, NOT locked, intent cleared", r.returncode == 1 and locked() is None and not intent(),
      (r.returncode, locked(), intent()))
lr = logrows()
check("the log keeps psql's code as psql_rc (3) and the tool's REAL exit as exit (1) — never one read as the other (F-2)",
      any(e["event"] == "sql_error" and e.get("psql_rc") == 3 and "rc" not in e for e in lr)
      and any(e["event"] == "exit" and e.get("exit") == 1 for e in lr), lr)
reset("credential")
_t = os.path.join(state, "LOCKED.tmp")                       # a left-over .tmp at 0666: fchmod, not O_CREAT, must set 0640
open(_t, "w").close()
os.chmod(_t, 0o666)
os.remove(os.path.join(state, "log.jsonl")) if os.path.exists(os.path.join(state, "log.jsonl")) else None
r = run(tool, "-c", "select 1")
lk = locked()
check("a wrong password: exit 4, LOCKED arm 'credential'", r.returncode == 4 and lk and lk["arm"] == "credential", (r.returncode, lk))
check("LOCKED is written 0640 under deploy's 0002 umask, even over a left-over 0666 .tmp (Langston Step-4 C4: the dir is 0755)",
      lk is not None and stat.S_IMODE(os.stat(os.path.join(state, "LOCKED")).st_mode) == 0o640,
      oct(stat.S_IMODE(os.stat(os.path.join(state, "LOCKED")).st_mode)) if lk else None)
check("log.jsonl is created 0640 under deploy's 0002 umask (Langston C4)",
      stat.S_IMODE(os.stat(os.path.join(state, "log.jsonl")).st_mode) == 0o640, oct(os.stat(os.path.join(state, "log.jsonl")).st_mode))
check("... and a critical alert is raised", "critical" in alerts() and "dt-sql-credential-locked" in alerts(), alerts()[:300])
lr = logrows()
check("the alert row carries npm's code as alert_rc, never as rc", any(e["event"] == "alert" and "alert_rc" in e and "rc" not in e
      for e in lr), lr)
n = len(calls())
r = run(tool, "-c", "select 1")
check("the NEXT call refuses (exit 4) with NO second attempt", r.returncode == 4 and len(calls()) == n, (r.returncode, len(calls())))
r = run(tool, "--status")
check("--status prints the arm (credential)", r.returncode == 4 and '"arm": "credential"' in r.stdout, r.stdout)
reset("refused")
r = run(tool, "-c", "select 1")
check("Connection refused (a ban): exit 3, NOT locked, intent cleared, 'do not retry'",
      r.returncode == 3 and locked() is None and not intent() and "do not retry" in r.stderr.lower(), (r.returncode, r.stderr))
reset("fatal")
r = run(tool, "-c", "select 1")
lk = locked()
al = alerts()
check("an unclassifiable failure (rc 1): exit 4, LOCKED arm 'ambiguous', and a WARNING alert (never silent, §5.1)",
      r.returncode == 4 and lk and lk["arm"] == "ambiguous" and "dt-sql-ambiguous-locked" in al and "warning" in al
      and "critical" not in al, (r.returncode, lk, al[:200]))
reset("transport")
r = run(tool, "-c", "select 1")
al = alerts()
check("the session failed its own TLS check: exit 6, NOT locked, INTENT cleared (no password was judged, no ban risk)",
      r.returncode == 6 and locked() is None and not intent(), (r.returncode, locked(), intent(), r.stderr))
check("... a CRITICAL transport alert carrying psql's line, and psql's line reaches the caller",
      "dt-sql-transport" in al and "critical" in al and "dt-sql-transport: not TLS" in al
      and "dt-sql-transport: not TLS" in r.stderr, (al[:300], r.stderr))
check("... logged as transport with psql's code (3), and the exit row says 6",
      any(e["event"] == "transport" and e.get("psql_rc") == 3 for e in logrows())
      and any(e["event"] == "exit" and e.get("exit") == 6 for e in logrows()), logrows())
reset("ok")
os.remove(reader_env)
r = run(tool, "-c", "select 1")
check("no reader.env: the login step refuses BEFORE any attempt — exit 2, psql never called, not locked, INTENT cleared",
      r.returncode == 2 and calls() == [] and locked() is None and not intent(), (r.returncode, calls(), r.stderr))
check("... logged as login_refused with the helper's code (69)",
      any(e["event"] == "login_refused" and e.get("login_rc") == 69 for e in logrows()), logrows())

print("== 4. a call that dies mid-attempt leaves its INTENT, and the next call locks")
reset("hang")
p = run(tool, "-c", "select 1", background=True)
deadline = time.time() + 10
while not intent() and time.time() < deadline:
    time.sleep(0.05)
check("the INTENT is written BEFORE the attempt", intent())
check("INTENT is written 0640 under deploy's 0002 umask (Langston Step-4 C4)",
      intent() and stat.S_IMODE(os.stat(os.path.join(state, "INTENT")).st_mode) == 0o640,
      oct(os.stat(os.path.join(state, "INTENT")).st_mode) if intent() else None)
while not calls() and time.time() < deadline:
    time.sleep(0.05)
c0 = calls()[0] if calls() else {}
check("the login step runs in its OWN process group (so a timeout can kill it whole)",
      c0 and c0["pgid"] != os.getpgid(p.pid), (c0, p.pid))
os.killpg(p.pid, signal.SIGKILL)                              # dt-sql dead without a word ...
if c0:
    try:
        os.killpg(c0["pgid"], signal.SIGKILL)                 # ... and its login step and psql with it
    except ProcessLookupError:
        pass
p.wait()
setmode("ok")
n = len(calls())
r = run(tool, "-c", "select 1")
lk = locked()
check("the next call reads the left-over INTENT as LOCKED 'ambiguous' and makes NO attempt",
      r.returncode == 4 and lk and lk["arm"] == "ambiguous" and len(calls()) == n, (r.returncode, lk, len(calls())))

print("== 5. one call at a time, never queued")
reset("slow")
p = run(tool, "-c", "select 1", background=True)
deadline = time.time() + 10
while not calls() and time.time() < deadline:
    time.sleep(0.05)
r = run(tool, "-c", "select 1")
check("a second call while one runs: exit 5 BUSY (not 4), no attempt", r.returncode == 5 and len(calls()) == 1,
      (r.returncode, len(calls())))
p.wait()
check("the first call still completes (exit 0)", p.returncode == 0, p.returncode)

print("== 6. the timeout stops the whole login group, then locks 'ambiguous'")
tool_t = build(timeout=1, grace=1)
reset("hang")
marker = os.path.join(work, "grandchild")
t0 = time.time()
r = run(tool_t, "-c", "select 1", extra_env={"FAKE_PSQL_MARKER": marker})
took = time.time() - t0
time.sleep(4)
lk = locked()
check("a hung call is cut at CALL_TIMEOUT_S and locks 'ambiguous'", r.returncode == 4 and lk and lk["arm"] == "ambiguous"
      and took < 6, (r.returncode, lk, took))
check("SIGTERM reaches the whole group: psql's grandchild dies too (not the login step alone)", not os.path.exists(marker))
stubborn = os.path.join(work, "stubborn.py")
marker2 = os.path.join(work, "grandchild2")
with open(stubborn, "w") as fh:                                # a login step that IGNORES SIGTERM, with a grandchild
    fh.write("import signal, subprocess, sys, time\n"
             "signal.signal(signal.SIGTERM, signal.SIG_IGN)\n"
             "subprocess.Popen([sys.executable, '-c', \"import signal, time; signal.signal(signal.SIGTERM, "
             "signal.SIG_IGN); time.sleep(4); open(%r, 'w').write('alive')\"])\n"
             "time.sleep(100)\n" % marker2)
reset("ok")
t0 = time.time()
r = run(build(timeout=1, grace=1, login_argv=[sys.executable, stubborn]), "-c", "select 1")
took = time.time() - t0
time.sleep(5)
lk = locked()
check("a login step that ignores SIGTERM is SIGKILLed after TERM_GRACE_S, and the call locks 'ambiguous'",
      r.returncode == 4 and lk and lk["arm"] == "ambiguous" and took < 6, (r.returncode, lk, took))
check("... the SIGKILL takes the whole group: the SIGTERM-proof grandchild dies too", not os.path.exists(marker2))
tool = build()

print("== 7. --unlock, and failures before any attempt")
reset("credential")
run(tool, "-c", "select 1")
r = run(tool, "--unlock", "--by", "someone")
check("--unlock refuses an actor that is not canonical (exit 2), and stays LOCKED", r.returncode == 2 and locked() is not None)
r = run(tool, "--unlock", "--by", "cc-infra")
check("--unlock --by cc-infra clears LOCKED", r.returncode == 0 and locked() is None and not intent(), r.stderr)
setmode("ok")
r = run(tool, "-c", "select 1")
check("after unlocking, a read works again", r.returncode == 0, r.returncode)
check("the unlock is logged with who CLAIMED to do it (by_claimed: --by is unauthenticated)",
      any(e["event"] == "unlocked" and e.get("by_claimed") == "cc-infra" for e in logrows()))
reset("ok")
with open(reader_env, "w") as fh:
    fh.write("DT_READER_HOST=db.example.supabase.co\n")         # malformed: four keys missing
r = run(tool, "-c", "select 1")
check("a malformed reader.env: exit 2 (never 1), psql never called, not locked, INTENT cleared", r.returncode == 2
      and calls() == [] and locked() is None and not intent(), (r.returncode, r.stderr[-200:]))
reset("ok")
r = run(build(login_argv=["/bin/false"]), "-c", "select 1")
check("a login step that fails WITHOUT its ready line (as sudo refusing would): exit 2, INTENT cleared, not locked",
      r.returncode == 2 and not intent() and locked() is None and "no attempt was made" in r.stderr, (r.returncode, r.stderr))
reset("ok")
r = run(build(login_argv=[os.path.join(work, "no-such-sudo")]), "-c", "select 1")
check("a login step that cannot even start: exit 2 (not 1), and its INTENT stays so the next call locks 'ambiguous'",
      r.returncode == 2 and intent(), (r.returncode, intent(), r.stderr[-200:]))
_mod = load(build(), "dt_sql_copy")


def _raise_exit1(args):
    raise SystemExit(1)


_mod.main = _raise_exit1
check("a SystemExit(1) from anywhere is reported as 2, never 1 (1 means only 'logged in, the SQL failed')",
      _mod.entry([]) == 2)
tool = build()

print("== 8. the psql wrapper")
wdir = os.path.join(work, "wrap")
os.makedirs(wdir)
wsrc = open(WRAPPER, encoding="utf-8").read()
wcopy = wsrc.replace("/var/lib/dt-sql/", state + "/").replace("exec /usr/bin/psql", "exec %s %s" % (sys.executable, FAKE))
check("the wrapper copy differs only in the state directory and the psql path",
      wsrc.count("[ -e /var/lib/dt-sql/LOCKED ]") == 1 and wsrc.count("[ -e /var/lib/dt-sql/INTENT ]") == 1
      and wsrc.count("exec /usr/bin/psql") == 1)
wpath = os.path.join(wdir, "psql")
with open(wpath, "w") as fh:
    fh.write(wcopy)
os.chmod(wpath, 0o755)
reset("ok")


def wrun(env_extra):
    env = {"PATH": "/usr/bin:/bin", "FAKE_PSQL_MODE": mode_file, "FAKE_PSQL_LOG": psql_log}
    env.update(env_extra)
    return subprocess.run([wpath, "postgresql://postgres@db/postgres", "-c", "select 1"], env=env, capture_output=True,
                          text=True, timeout=30)


r = wrun({})
check("the wrapper defaults PGSSLMODE=require when unset", r.returncode == 0 and calls()[-1]["PGSSLMODE"] == "require", calls())
r = wrun({"PGSSLMODE": "disable"})
check("... and leaves a caller's own PGSSLMODE alone", calls()[-1]["PGSSLMODE"] == "disable", calls()[-1])
write = os.path.join(state, "LOCKED")
with open(write, "w") as fh:
    fh.write('{"arm": "credential"}')
n = len(calls())
r = wrun({})
check("while dt-sql is LOCKED the wrapper refuses (exit 4) and psql is not run", r.returncode == 4 and len(calls()) == n,
      (r.returncode, r.stderr))
r = wrun({"DT_SQL_IGNORE_LOCK": "1"})
check("DT_SQL_IGNORE_LOCK=1 lets a deliberate single check through", r.returncode == 0 and len(calls()) == n + 1)
os.remove(write)
with open(os.path.join(state, "INTENT"), "w") as fh:
    fh.write('{"at": "x"}')
n = len(calls())
r = wrun({})
check("D-2: an unfinished attempt (INTENT, no LOCKED) also makes the wrapper refuse, psql not run",
      r.returncode == 4 and len(calls()) == n, (r.returncode, r.stderr))

print("== 9. ONE verified attempt, proved against a fake Postgres server (real psql + openssl)")
real_psql, openssl = shutil.which("psql"), shutil.which("openssl")
if not (real_psql and openssl and os.path.exists("/usr/bin/psql")):
    print("  skip: no real psql/openssl on this host (runs on staging and in CI; Helsinki has neither)")
else:
    def mkcert(name):
        return subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout",
                               os.path.join(work, name + "-k.pem"), "-out", os.path.join(work, name + "-c.pem"), "-days",
                               "1", "-subj", "/CN=localhost", "-addext", "subjectAltName=DNS:localhost"],
                              capture_output=True, text=True)
    mk, mk2 = mkcert("srv"), mkcert("other")
    check("test certificates made (server's, and an unrelated one for the wrong-CA control)",
          mk.returncode == 0 and mk2.returncode == 0, (mk.stderr[-200:], mk2.stderr[-200:]))
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    count = os.path.join(work, "count.txt")
    srv = subprocess.Popen([sys.executable, FAKEPG, str(port), os.path.join(work, "srv-c.pem"),
                            os.path.join(work, "srv-k.pem"), count])
    time.sleep(1)

    def attempt(ca, name):
        reset("ok")
        write_reader_env(host="localhost", port=port)
        open(count, "w").close()
        login = build_login(psql="/usr/bin/psql", ca=ca, name=name)
        r = run(build(login=login), "-c", "select 1")
        return r, open(count).read().split(), locked()

    try:
        r, seen, lk = attempt(os.path.join(work, "srv-c.pem"), "dt-sql-login-real")
        check("dt-sql with a wrong password and the RIGHT CA: exactly ONE connection, over TLS, and it locks "
              "'credential' (verify-full passed: the server got as far as judging the password)",
              seen == ["ssl"] and r.returncode == 4 and lk and lk["arm"] == "credential", (seen, r.returncode, lk, r.stderr[-300:]))
        r, seen, lk = attempt(os.path.join(work, "other-c.pem"), "dt-sql-login-wrongca")
        check("CONTROL: the WRONG CA — the server never receives a startup message (no password sent), and dt-sql locks "
              "'ambiguous' (it cannot classify an unverified server)",
              seen == [] and r.returncode == 4 and lk and lk["arm"] == "ambiguous", (seen, r.returncode, lk, r.stderr[-300:]))
        open(count, "w").close()
        subprocess.run(["/usr/bin/psql", "postgresql://postgres@127.0.0.1:%d/postgres" % port, "-c", "select 1"],
                       env={"PATH": "/usr/bin:/bin", "PGPASSWORD": "wrong"}, capture_output=True, timeout=60)
        n_raw = len(open(count).read().split())
        check("CONTROL: raw psql on the same server, default sslmode: TWO connections (the counter sees the retry)",
              n_raw == 2, n_raw)
        shutil.rmtree(state)
        os.makedirs(state)
        open(count, "w").close()
        live_wrapper = os.path.join(wdir, "psql-live")
        with open(live_wrapper, "w") as fh:                   # the committed wrapper, LOCKED path moved to the test state
            fh.write(wsrc.replace("/var/lib/dt-sql/", state + "/"))
        os.chmod(live_wrapper, 0o755)
        subprocess.run([live_wrapper, "postgresql://postgres@127.0.0.1:%d/postgres" % port, "-c", "select 1"],
                       env={"PATH": "/usr/bin:/bin", "PGPASSWORD": "wrong"}, capture_output=True, timeout=60)
        n_wrap = len(open(count).read().split())
        check("the psql wrapper on the same URL: ONE connection", n_wrap == 1, n_wrap)
    finally:
        srv.kill()

shutil.rmtree(work, ignore_errors=True)
print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
