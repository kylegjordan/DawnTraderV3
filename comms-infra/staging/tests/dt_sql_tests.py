#!/usr/bin/env python3
"""dt-sql and the psql wrapper — B-DB-READ-TOOL (KD-96, #1259). POSIX only (flock, process groups, sh).

Each case runs a COPY of the committed file that differs ONLY in its CONSTANTS block (asserted), with a stand-in psql
(fakepsql_outcomes.py) that plays one outcome and logs what it was given. Where real psql and openssl exist, the
one-attempt guarantee is also proved against a local fake Postgres server (fakepg_server.py) that counts connections:
dt-sql 1, raw psql on the same URL 2 (the positive control that the counter sees libpq's non-SSL retry).
Run:  python3 comms-infra/staging/tests/dt_sql_tests.py        (exit 0 = every check passed)
"""
import json
import os
import shutil
import signal
import socket
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.dirname(HERE)
SRC = os.path.join(STAGING, "dt-sql")
WRAPPER = os.path.join(STAGING, "psql-wrapper")
FAKE = os.path.join(HERE, "fakepsql_outcomes.py")
FAKEPG = os.path.join(HERE, "fakepg_server.py")
PASS = FAIL = 0
PASSWORD = "p@ss/w:rd%x"                                    # every character that must be percent-encoded


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
env_file = os.path.join(work, ".env")
mode_file = os.path.join(work, "mode")
psql_log = os.path.join(work, "psql.jsonl")
alert_log = os.path.join(work, "alerts.jsonl")
alert_rec = os.path.join(work, "alert_recorder.py")
with open(alert_rec, "w") as fh:
    fh.write("import json,sys\nopen(%r,'a').write(json.dumps(sys.argv[1:])+'\\n')\n" % alert_log)
enc = "".join("%%%02X" % ord(c) if c in "@/:%" else c for c in PASSWORD)


def write_env(host="db.example.supabase.co", port=5432):
    with open(env_file, "w") as fh:
        fh.write('NODE_ENV=production\nDATABASE_URL="postgresql://postgres:%s@%s:%d/postgres"\nOTHER=1\n' % (enc, host, port))


src = open(SRC, encoding="utf-8").read()
START, END = "# ── CONSTANTS (the test harness substitutes ONLY this block) ──", "# ── END CONSTANTS ──"
head, rest = src.split(START)
_, tail = rest.split(END)


def build(psql=FAKE, timeout=300, resolve="lambda h, p: '127.0.0.1'"):
    block = "\n".join([
        "ENV_FILE = %r" % env_file, "STATE_DIR = %r" % state, "PSQL = %r" % psql, "RUN_AS = ''",
        "RUNUSER = '/bin/false'", "CALL_TIMEOUT_S = %d" % timeout, "STATEMENT_TIMEOUT = '60s'", "APP_DIR = %r" % work,
        "ALERT_NPM = [%r, %r]" % (sys.executable, alert_rec), "RESOLVE = %s" % resolve])
    path = os.path.join(work, "dt-sql")
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(head + START + "\n" + block + "\n" + END + tail)
    copy = open(path, encoding="utf-8").read()
    assert copy.split(START)[0] == head and copy.split(END)[1] == tail, "the copy differs outside CONSTANTS"
    return path


def reset(mode="ok"):
    shutil.rmtree(state, ignore_errors=True)
    os.makedirs(state)
    for p in (psql_log, alert_log):
        if os.path.exists(p):
            os.remove(p)
    with open(mode_file, "w") as fh:
        fh.write(mode)
    write_env()


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


# The stand-in psql is launched through a shim this suite writes and marks executable itself: a checkout's file mode
# is not to be trusted (CI's Linux checkout stores the .py 0644, and exec'ing it failed every call — 2026-11-16).
FAKE_SHIM = os.path.join(work, "fakepsql")
with open(FAKE_SHIM, "w") as fh:
    fh.write('#!/bin/sh' + chr(10) + 'exec %s %s "$@"' % (sys.executable, FAKE) + chr(10))
os.chmod(FAKE_SHIM, 0o755)
tool = build(psql=FAKE_SHIM)
print("== 1. the credential, the connection string, and what reaches psql")
reset("ok")
r = run(tool, "-c", "select 1")
c = calls()
check("a clean read exits 0 and prints the row", r.returncode == 0 and r.stdout.strip() == "1", (r.returncode, r.stdout, r.stderr))
check("the password is URL-DECODED (%40 %2F %3A %25) and reaches psql only through PGPASSWORD",
      c and c[0]["PGPASSWORD"] == PASSWORD, c)
check("the password is in NO argument", c and not any(PASSWORD in a or enc in a for a in c[0]["argv"]), c and c[0]["argv"])
conninfo = c[0]["argv"][0] if c else ""
check("ONE attempt: sslmode=require, hostaddr pinned, connect_timeout set",
      "sslmode=require" in conninfo and "hostaddr=127.0.0.1" in conninfo and "connect_timeout=15" in conninfo, conninfo)
check("the caller's PGSSLMODE/PGPASSWORD do not leak into the child (PG* stripped)", c and c[0]["PGSSLMODE"] is None, c)
check("read-only by default: PGOPTIONS sets default_transaction_read_only=on and a statement timeout",
      c and "default_transaction_read_only=on" in c[0]["PGOPTIONS"] and "statement_timeout=" in c[0]["PGOPTIONS"], c)
check("-c SQL goes in through stdin with -f - (psql exits 1 for a SQL error under -c, 3 under -f)",
      c and "-c" not in c[0]["argv"] and c[0]["argv"][-2:] == ["-f", "-"] and c[0]["stdin"].strip() == "select 1;", c)
check("a clean read leaves no INTENT and no LOCKED", not intent() and locked() is None)

print("== 2. read-only SQL refusal (before connecting)")
reset("ok")
r = run(tool, "-c", "set default_transaction_read_only = off; delete from x")
check("SQL naming the read-only setting is refused, exit 2, psql never called", r.returncode == 2 and calls() == [], (r.returncode, calls()))

print("== 3. every outcome of the one attempt (fail closed)")
reset("sql_error")
r = run(tool, "-c", "select from")
check("logged in, SQL failed: exit 1, NOT locked, intent cleared", r.returncode == 1 and locked() is None and not intent(),
      (r.returncode, locked(), intent()))
reset("credential")
r = run(tool, "-c", "select 1")
lk = locked()
check("a wrong password: exit 4, LOCKED arm 'credential'", r.returncode == 4 and lk and lk["arm"] == "credential", (r.returncode, lk))
check("... and a critical alert is raised", os.path.exists(alert_log) and "critical" in open(alert_log).read()
      and "dt-sql-credential-locked" in open(alert_log).read())
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
check("an unclassifiable failure (rc 1): exit 4, LOCKED arm 'ambiguous', no alert",
      r.returncode == 4 and lk and lk["arm"] == "ambiguous" and not os.path.exists(alert_log), (r.returncode, lk))

print("== 4. a call that dies mid-attempt leaves its INTENT, and the next call locks")
reset("hang")
p = run(tool, "-c", "select 1", background=True)
deadline = time.time() + 10
while not intent() and time.time() < deadline:
    time.sleep(0.05)
check("the INTENT is written BEFORE the attempt", intent())
while not calls() and time.time() < deadline:
    time.sleep(0.05)
os.killpg(p.pid, signal.SIGKILL)                              # dt-sql and its psql, dead without a word
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

print("== 6. the timeout kills the whole process group, then locks 'ambiguous'")
tool_t = build(psql=FAKE_SHIM, timeout=1)
reset("hang")
marker = os.path.join(work, "grandchild")
t0 = time.time()
r = run(tool_t, "-c", "select 1", extra_env={"FAKE_PSQL_MARKER": marker})
took = time.time() - t0
time.sleep(4)
lk = locked()
check("a hung call is cut at CALL_TIMEOUT_S and locks 'ambiguous'", r.returncode == 4 and lk and lk["arm"] == "ambiguous"
      and took < 6, (r.returncode, lk, took))
check("its grandchild is killed too (the whole group, not the child alone)", not os.path.exists(marker))
tool = build(psql=FAKE_SHIM)

print("== 7. --unlock")
reset("credential")
run(tool, "-c", "select 1")
r = run(tool, "--unlock", "--by", "someone")
check("--unlock refuses an actor that is not canonical (exit 2), and stays LOCKED", r.returncode == 2 and locked() is not None)
r = run(tool, "--unlock", "--by", "cc-infra")
check("--unlock --by cc-infra clears LOCKED", r.returncode == 0 and locked() is None and not intent(), r.stderr)
setmode("ok")
r = run(tool, "-c", "select 1")
check("after unlocking, a read works again", r.returncode == 0, r.returncode)
log = [json.loads(l) for l in open(os.path.join(state, "log.jsonl"))]
check("the unlock is logged with who did it", any(e["event"] == "unlocked" and e.get("by") == "cc-infra" for e in log))

print("== 8. the psql wrapper")
wdir = os.path.join(work, "wrap")
os.makedirs(wdir)
wsrc = open(WRAPPER, encoding="utf-8").read()
wcopy = wsrc.replace("/var/lib/dt-sql/LOCKED", os.path.join(state, "LOCKED")).replace(
    "exec /usr/bin/psql", "exec %s %s" % (sys.executable, FAKE))
check("the wrapper copy differs only in the two substituted paths",
      wsrc.count("/var/lib/dt-sql/LOCKED") == 1 and wsrc.count("exec /usr/bin/psql") == 1)
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

print("== 9. ONE attempt, proved against a fake Postgres server (real psql + openssl)")
real_psql, openssl = shutil.which("psql"), shutil.which("openssl")
if not (real_psql and openssl and os.path.exists("/usr/bin/psql")):
    print("  skip: no real psql/openssl on this host (runs on staging and Helsinki)")
else:
    subprocess.run([openssl, "req", "-x509", "-newkey", "rsa:2048", "-nodes", "-keyout", os.path.join(work, "k.pem"),
                    "-out", os.path.join(work, "c.pem"), "-days", "1", "-subj", "/CN=localhost"], capture_output=True)
    s = socket.socket()
    s.bind(("127.0.0.1", 0))
    port = s.getsockname()[1]
    s.close()
    count = os.path.join(work, "count.txt")
    srv = subprocess.Popen([sys.executable, FAKEPG, str(port), os.path.join(work, "c.pem"), os.path.join(work, "k.pem"),
                            count])
    time.sleep(1)
    try:
        reset("ok")
        write_env(host="127.0.0.1", port=port)
        open(count, "w").close()
        r = subprocess.run([sys.executable, build(psql="/usr/bin/psql"), "-c", "select 1"], capture_output=True,
                           text=True, timeout=60)
        n_tool = len(open(count).read().split())
        lk = locked()
        check("dt-sql with a wrong password: exactly ONE connection reaches the server, and it locks 'credential'",
              n_tool == 1 and r.returncode == 4 and lk and lk["arm"] == "credential", (n_tool, r.returncode, lk, r.stderr[-200:]))
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
            fh.write(wsrc.replace("/var/lib/dt-sql/LOCKED", os.path.join(state, "LOCKED")))
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
