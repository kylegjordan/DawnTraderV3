#!/usr/bin/env python3
"""dt-sql-role-setup — B-DB-READONLY-ROLE (KD-100, row 5a1). POSIX only (flock, process groups, sh).

Each case runs a COPY of the committed dt-sql-role-setup that differs ONLY in its CONSTANTS block (asserted), loading
copies of the committed dt-sql and dt-sql-login (also CONSTANTS-only), so the one-attempt lock, INTENT, the lock arms,
the alerts and reader.env's parser are dt-sql's own code, not stand-ins. psql is fakepsql_outcomes.py, which plays one
outcome and logs what it was given — including whether reader.env.new existed WHILE it ran (FAKE_WATCH), which is the
property --create/--rotate rest on: the new password is on disk before the database can take it.
The stand-in database has no state: what these tests prove is what the tool SENDS, what it WRITES, and what it does
with each outcome. That the real database answers the --verify probes as expected is proved on staging, not here.
Run:  python3 comms-infra/staging/tests/dt_sql_role_setup_tests.py        (exit 0 = every check passed)
"""
import base64
import fcntl
import hashlib
import hmac
import importlib.machinery
import importlib.util
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import urllib.parse

HERE = os.path.dirname(os.path.abspath(__file__))
STAGING = os.path.dirname(HERE)
SRC = os.path.join(STAGING, "dt-sql-role-setup")
DTSQL_SRC = os.path.join(STAGING, "dt-sql")
LOGIN_SRC = os.path.join(STAGING, "dt-sql-login")
FAKE = os.path.join(HERE, "fakepsql_outcomes.py")
PASS = FAIL = 0
PASSWORD = "Rd7_kQ2-xV9pL4mN8sT1wY6zB3cF5hJ0aE2gU7iO"   # a reader password already on disk (verify / rotate cases)
APPPW = "AppPw7@Kx2#zq/Lm9"                          # the app's password: characters that need percent-encoding
HOST = "db.example.supabase.co"


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   " + label)
    else:
        FAIL += 1
        print("  FAIL %s :: %s" % (label, detail))


if os.name != "posix":
    print("dt_sql_role_setup_tests: POSIX only (flock, process groups); skipped on %s" % os.name)
    sys.exit(0)

work = tempfile.mkdtemp(prefix="dt-sql-role-setup-tests-")
state = os.path.join(work, "state")
reader_env = os.path.join(work, "reader.env")
new_env = reader_env + ".new"
ca_file = os.path.join(work, "ca.crt")
app_env = os.path.join(work, "app.env")
mode_file = os.path.join(work, "mode")
psql_log = os.path.join(work, "psql.jsonl")
alert_log = os.path.join(work, "alerts.jsonl")
alert_rec = os.path.join(work, "alert_recorder.py")
with open(alert_rec, "w") as fh:
    fh.write("import json,sys\nopen(%r,'a').write(json.dumps(sys.argv[1:])+'\\n')\n" % alert_log)

START, END = "# ── CONSTANTS (the test harness substitutes ONLY this block) ──", "# ── END CONSTANTS ──"


def split_src(path):
    text = open(path, encoding="utf-8").read()
    h, rest = text.split(START)
    _, t = rest.split(END)
    return h, t


def write_copy(path, h, block, t):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(h + START + "\n" + block + "\n" + END + t)
    copy = open(path, encoding="utf-8").read()
    assert copy.split(START)[0] == h and copy.split(END)[1] == t, "the copy of %s differs outside CONSTANTS" % path
    return path


# The stand-in psql runs through a shim this suite writes and marks executable itself (a checkout's mode is not trusted).
FAKE_SHIM = os.path.join(work, "fakepsql")
with open(FAKE_SHIM, "w") as fh:
    fh.write('#!/bin/sh' + chr(10) + 'exec %s %s "$@"' % (sys.executable, FAKE) + chr(10))
os.chmod(FAKE_SHIM, 0o755)
NOEXEC = os.path.join(work, "psql-noexec")
shutil.copy(FAKE_SHIM, NOEXEC)
os.chmod(NOEXEC, 0o644)

lhead, ltail = split_src(LOGIN_SRC)
login_copy = write_copy(os.path.join(work, "dt-sql-login"), lhead, "\n".join([
    "READER_ENV = %r" % reader_env, "STATE_DIR = %r" % state, "CA_FILE = %r" % ca_file, "PSQL = %r" % FAKE_SHIM,
    "STATEMENT_TIMEOUT = '60s'", "RESOLVE = lambda h, p: '127.0.0.1'"]), ltail)
dhead, dtail = split_src(DTSQL_SRC)
dtsql_copy = write_copy(os.path.join(work, "dt-sql"), dhead, "\n".join([
    "STATE_DIR = %r" % state, "LOGIN = %r" % [sys.executable, login_copy], "RUN_AS = ''", "RUNUSER = '/bin/false'",
    "CALL_TIMEOUT_S = 60", "TERM_GRACE_S = 1", "APP_DIR = %r" % work,
    "ALERT_NPM = [%r, %r]" % (sys.executable, alert_rec)]), dtail)
head, tail = split_src(SRC)


def build(name="dt-sql-role-setup", psql=FAKE_SHIM, require_root=False, resolve="lambda h, p: '127.0.0.1'", pre=()):
    """Each variant gets its OWN path, so a variant built for one case never replaces the copy the next case runs."""
    block = "\n".join(list(pre) + [
        "DT_SQL = %r" % dtsql_copy, "DT_SQL_LOGIN = %r" % login_copy, "APP_ENV = %r" % app_env, "PSQL = %r" % psql,
        "ROLE = 'dt_reader'", "FILE_OWNER = None", "STATE_OWNER = None", "ALERT_AS = []",
        "REQUIRE_ROOT = %r" % require_root, "RESOLVE = %s" % resolve])
    return write_copy(os.path.join(work, name), head, block, tail)


def load(path, name):
    ldr = importlib.machinery.SourceFileLoader(name, path)
    mod = importlib.util.module_from_spec(importlib.util.spec_from_loader(name, ldr))
    ldr.exec_module(mod)
    return mod


TRANSPORT = load(login_copy, "dt_sql_login_copy").TRANSPORT.decode()


def write_app_env(text=None):
    with open(app_env, "w") as fh:
        fh.write(text if text is not None else
                 "NODE_ENV=production\nDATABASE_URL=postgresql://postgres:%s@%s:5432/postgres\nOTHER=1\n"
                 % (urllib.parse.quote(APPPW, safe=""), HOST))


def write_reader_env(user="dt_reader", password=PASSWORD, mode=0o600, text=None):
    with open(reader_env, "w") as fh:
        fh.write(text if text is not None else
                 "# test reader.env\nDT_READER_HOST=%s\nDT_READER_PORT=5432\nDT_READER_DBNAME=postgres\n"
                 "DT_READER_USER=%s\nDT_READER_PASSWORD=%s\n" % (HOST, user, password))
    os.chmod(reader_env, mode)


def reset(mode="ok", reader=False):
    shutil.rmtree(state, ignore_errors=True)
    os.makedirs(state)
    for p in (psql_log, alert_log, reader_env, new_env):
        if os.path.exists(p):
            os.remove(p)
    with open(mode_file, "w") as fh:
        fh.write(mode)
    with open(ca_file, "w") as fh:
        fh.write("not a real CA; the stand-in psql never reads it\n")
    write_app_env()
    if reader:
        write_reader_env()


def run(tool, *args):
    env = dict(os.environ, FAKE_PSQL_MODE=mode_file, FAKE_PSQL_LOG=psql_log, FAKE_WATCH=new_env, FAKE_RACE=reader_env,
               PGSSLMODE="prefer", PGPASSWORD="leak", PGOPTIONS="-c leak=1")
    return subprocess.run([sys.executable, tool] + list(args), env=env, capture_output=True, text=True, timeout=120)


def calls():
    return [json.loads(l) for l in open(psql_log)] if os.path.exists(psql_log) else []


def locked():
    p = os.path.join(state, "LOCKED")
    return json.load(open(p)) if os.path.exists(p) else None


def intent():
    return os.path.exists(os.path.join(state, "INTENT"))


def alerts():
    return [json.loads(l) for l in open(alert_log)] if os.path.exists(alert_log) else []


def read_fields(path):
    out = {}
    for line in open(path):
        if "=" in line and not line.startswith("#"):
            k, _, v = line.rstrip("\n").partition("=")
            out[k] = v
    return out


def raw(path):
    return open(path).read() if os.path.exists(path) else ""


def mode_of(path):
    return os.stat(path).st_mode & 0o777


VERIFIER = re.compile(r"PASSWORD '(SCRAM-SHA-256\$(\d+):([^$]+)\$([^:]+):([^']+))'")


def verifier_matches(stdin, password):
    """Recompute StoredKey and ServerKey from the plaintext and the salt the tool sent (RFC 5802/7677)."""
    m = VERIFIER.search(stdin)
    if not m:
        return False, "no verifier in the SQL"
    iters, salt = int(m.group(2)), base64.b64decode(m.group(3))
    salted = hashlib.pbkdf2_hmac("sha256", password.encode(), salt, iters)
    stored = hashlib.sha256(hmac.new(salted, b"Client Key", hashlib.sha256).digest()).digest()
    server = hmac.new(salted, b"Server Key", hashlib.sha256).digest()
    ok = (iters == 4096 and len(salt) == 16 and base64.b64decode(m.group(4)) == stored
          and base64.b64decode(m.group(5)) == server)
    return ok, m.group(1)[:40]


tool = build()

# ── --create, the database takes it ──
print("create: success")
reset("ok")
r = run(tool, "--create")
c = calls()
check("create: exit 0", r.returncode == 0, (r.returncode, r.stderr[-300:]))
check("create: ONE psql call", len(c) == 1, len(c))
check("create: reader.env written, mode 0600", os.path.exists(reader_env) and mode_of(reader_env) == 0o600,
      os.path.exists(reader_env) and oct(mode_of(reader_env)))
check("create: reader.env.new gone", not os.path.exists(new_env))
f = read_fields(reader_env) if os.path.exists(reader_env) else {}
newpw = f.get("DT_READER_PASSWORD", "")
check("create: reader.env names dt_reader on the app's host, port and database",
      (f.get("DT_READER_USER"), f.get("DT_READER_HOST"), f.get("DT_READER_PORT"), f.get("DT_READER_DBNAME"))
      == ("dt_reader", HOST, "5432", "postgres"), f.keys())
check("create: a 43-character generated password", len(newpw) == 43 and re.fullmatch(r"[A-Za-z0-9_-]+", newpw or "x!"),
      len(newpw))
if c:
    a = c[0]
    conn = a["argv"][0]
    check("create: psql logs in as the APP with the decoded app password", a["PGPASSWORD"] == APPPW, a["PGPASSWORD"])
    check("create: PGOPTIONS is only the statement timeout (the inherited one stripped)",
          a["PGOPTIONS"] == "-c statement_timeout=60s", a["PGOPTIONS"])
    check("create: the inherited PGSSLMODE is stripped", a["PGSSLMODE"] is None, a["PGSSLMODE"])
    check("create: conninfo is verify-full against the CA, pinned address, app user",
          all(s in conn for s in ("sslmode=verify-full ", "sslrootcert=%s " % ca_file, "hostaddr=127.0.0.1 ",
                                  "host=%s " % HOST, "user=postgres ", "connect_timeout=15 ")), conn)
    check("create: terse verbosity, script on stdin", "VERBOSITY=terse" in a["argv"] and a["argv"][-2:] == ["-f", "-"],
          a["argv"])
    check("create: no password anywhere in argv", not any(APPPW in x or newpw in x for x in a["argv"]), a["argv"])
    check("create: the script starts with the in-session TLS check", a["stdin"].startswith(TRANSPORT), a["stdin"][:80])
    check("create: CREATE ROLE, the two grants and the read-only default",
          all(s in a["stdin"] for s in ("CREATE ROLE dt_reader LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION "
                                        "NOBYPASSRLS PASSWORD 'SCRAM-SHA-256$",
                                        "GRANT pg_read_all_data, pg_monitor TO dt_reader;",
                                        "ALTER ROLE dt_reader SET default_transaction_read_only = on;", "COMMIT;")),
          a["stdin"])
    check("create: the plaintext password is NOT in the SQL", newpw not in a["stdin"])
    ok, why = verifier_matches(a["stdin"], newpw)
    check("create: the verifier sent is the SCRAM-SHA-256 of the password written to reader.env", ok, why)
    check("create: reader.env.new EXISTED while psql ran", a["watch"] is True, a["watch"])
log = raw(os.path.join(state, "log.jsonl"))
check("create: no secret in dt-sql's log, stdout or stderr",
      not any(s and s in t for s in (APPPW, newpw, "SCRAM-SHA-256$") for t in (log, r.stdout, r.stderr)))
check("create: not locked, INTENT cleared", locked() is None and not intent(), (locked(), intent()))

# ── --rotate ──
print("rotate: success")
reset("ok", reader=True)
r = run(tool, "--rotate")
c = calls()
f = read_fields(reader_env)
check("rotate: exit 0", r.returncode == 0, (r.returncode, r.stderr[-300:]))
check("rotate: a NEW password replaced the old", f.get("DT_READER_PASSWORD") not in (None, PASSWORD), f.keys())
check("rotate: mode 0600, reader.env.new gone", mode_of(reader_env) == 0o600 and not os.path.exists(new_env))
if c:
    check("rotate: ALTER ROLE ... PASSWORD with a verifier",
          "ALTER ROLE dt_reader PASSWORD 'SCRAM-SHA-256$" in c[0]["stdin"] and "CREATE ROLE" not in c[0]["stdin"],
          c[0]["stdin"])
    ok, why = verifier_matches(c[0]["stdin"], f.get("DT_READER_PASSWORD", ""))
    check("rotate: the verifier matches the new reader.env password", ok, why)
    check("rotate: reader.env.new EXISTED while psql ran", c[0]["watch"] is True, c[0]["watch"])

# ── --recover (the role exists, reader.env was lost) ──
print("recover: success")
reset("ok")
r = run(tool, "--recover")
c = calls()
f = read_fields(reader_env)
check("recover: exit 0", r.returncode == 0, (r.returncode, r.stderr[-300:]))
check("recover: reader.env written afresh with a new password", f.get("DT_READER_PASSWORD") not in (None, PASSWORD)
      and f.get("DT_READER_USER") == "dt_reader", f.keys())
check("recover: mode 0600, reader.env.new gone", mode_of(reader_env) == 0o600 and not os.path.exists(new_env))
check("recover: exactly one login", len(c) == 1, len(c))
if c:
    check("recover: ALTER ROLE ... PASSWORD with a verifier, never CREATE ROLE",
          "ALTER ROLE dt_reader PASSWORD 'SCRAM-SHA-256$" in c[0]["stdin"] and "CREATE ROLE" not in c[0]["stdin"],
          c[0]["stdin"])
    check("recover: the plaintext password is NOT in the SQL", f.get("DT_READER_PASSWORD", "x") not in c[0]["stdin"])
    ok, why = verifier_matches(c[0]["stdin"], f.get("DT_READER_PASSWORD", ""))
    check("recover: the verifier matches the new reader.env password", ok, why)
    check("recover: reader.env.new EXISTED while psql ran", c[0]["watch"] is True, c[0]["watch"])
check("recover: the header names the mode", "dt-sql-role-setup --recover" in open(reader_env).read())

# ── a reader.env that appears while the database takes the password: create/recover never overwrite it ──
for m in ("--create", "--recover"):
    print("race: %s" % m)
    reset("ok_race")
    r = run(tool, m)
    check("race %s: exit 66" % m, r.returncode == 66, (r.returncode, r.stderr[-300:]))
    check("race %s: the reader.env that appeared is untouched" % m,
          os.path.exists(reader_env) and open(reader_env).read() == "RACER\n")
    check("race %s: reader.env.new KEPT (the database took that password)" % m, os.path.exists(new_env))

# ── refusals before any login ──
print("refusals before any login")


def refused(label, code, *args, tool_=None, setup=None, reader=False):
    reset("ok", reader=reader)
    if setup:
        setup()
    r = run(tool_ or tool, *args)
    check(label + ": exit %d, no psql call" % code, r.returncode == code and calls() == [],
          (r.returncode, len(calls()), r.stderr[-200:]))
    return r


refused("create with reader.env present", 66, "--create", reader=True)
refused("rotate with reader.env missing", 66, "--rotate")
refused("recover with reader.env present", 66, "--recover", reader=True)
refused("recover with reader.env.new left over", 66, "--recover", setup=lambda: open(new_env, "w").close())
refused("create with reader.env.new left over", 66, "--create", setup=lambda: open(new_env, "w").close())
refused("create while LOCKED", 66, "--create",
        setup=lambda: open(os.path.join(state, "LOCKED"), "w").write('{"arm": "credential"}'))
refused("create with a left-over INTENT", 66, "--create",
        setup=lambda: open(os.path.join(state, "INTENT"), "w").write("{}"))
refused("create with the CA unreadable", 69, "--create", setup=lambda: os.remove(ca_file))
refused("create with psql not executable", 70, "--create", tool_=build("rs-noexec", psql=NOEXEC))
refused("create with no .env", 67, "--create", setup=lambda: os.remove(app_env))
refused("create with DATABASE_URL twice", 67, "--create",
        setup=lambda: write_app_env("DATABASE_URL=postgresql://a:b@h/postgres\nDATABASE_URL=postgresql://a:b@h/x\n"))
refused("create with a mysql URL", 67, "--create", setup=lambda: write_app_env("DATABASE_URL=mysql://a:b@h/postgres\n"))
refused("create with no password in the URL", 67, "--create",
        setup=lambda: write_app_env("DATABASE_URL=postgresql://postgres@%s:5432/postgres\n" % HOST))
refused("create when the host does not resolve", 68, "--create",
        tool_=build("rs-unresolvable", resolve="_unresolvable", pre=["def _unresolvable(h, p):", "    raise OSError('no such host')"]))
for bad in ([], ["--create", "--verify"], ["--drop"]):
    refused("arguments %r" % bad, 64, *bad)
if os.geteuid() != 0:
    refused("not root, with REQUIRE_ROOT", 65, "--create", tool_=build("rs-root", require_root=True))
else:
    print("  (the not-root refusal is not testable as root; CI runs it)")

print("create: a quoted, percent-encoded DATABASE_URL")
reset("ok")
write_app_env("DATABASE_URL=\"postgresql://postgres:%s@%s:5432/postgres\"\n" % (urllib.parse.quote(APPPW, safe=""), HOST))
r = run(tool, "--create")
check("quoted URL: exit 0 and the decoded password reaches psql",
      r.returncode == 0 and calls() and calls()[0]["PGPASSWORD"] == APPPW, (r.returncode, r.stderr[-200:]))

# ── what each database outcome does ──
print("create: each outcome")
reset("credential")
r = run(tool, "--create")
lk = locked()
check("credential refusal: exit 4", r.returncode == 4, (r.returncode, r.stderr[-300:]))
check("credential refusal: reader.env.new KEPT (the database may hold that password)", os.path.exists(new_env))
check("credential refusal: no reader.env", not os.path.exists(reader_env))
check("credential refusal: LOCKED arm credential", lk is not None and lk.get("arm") == "credential", lk)
al = alerts()
check("credential refusal: the credential alert raised",
      any("dt-sql-credential-locked" in x for x in al), al)
check("credential refusal: no app password in the alert or the lock", APPPW not in json.dumps(al) + json.dumps(lk))
os.remove(new_env)
r = run(tool, "--create")
check("credential refusal: a second --create is refused (66) with still ONE call",
      r.returncode == 66 and len(calls()) == 1, (r.returncode, len(calls())))

reset("sql_error")
r = run(tool, "--create")
check("SQL error: exit 1, reader.env.new removed, no reader.env",
      r.returncode == 1 and not os.path.exists(new_env) and not os.path.exists(reader_env),
      (r.returncode, os.path.exists(new_env)))
check("SQL error: not locked", locked() is None and not intent(), locked())

reset("refused")
r = run(tool, "--create")
check("connection refused: exit 3, reader.env.new removed", r.returncode == 3 and not os.path.exists(new_env),
      (r.returncode, os.path.exists(new_env)))

reset("transport")
r = run(tool, "--create")
check("not-TLS session: exit 6, transport alert, not locked, reader.env.new removed",
      r.returncode == 6 and any("dt-sql-transport" in x for x in alerts()) and locked() is None
      and not os.path.exists(new_env), (r.returncode, alerts(), locked()))

reset("fatal")
r = run(tool, "--create")
lk = locked()
check("an unclear psql failure: exit 4, LOCKED ambiguous, reader.env.new kept",
      r.returncode == 4 and lk is not None and lk.get("arm") == "ambiguous" and os.path.exists(new_env),
      (r.returncode, lk))

reset("echo")
r = run(tool, "--create")
check("an error that repeats the script: exit 1, the verifier redacted, no secret on stderr",
      r.returncode == 1 and "<redacted>" in r.stderr and "SCRAM-SHA-256$" not in r.stderr and APPPW not in r.stderr,
      (r.returncode, r.stderr[-300:]))

reset("fatal_echo")
r = run(tool, "--create")
lk = locked()
al = json.dumps(alerts())
check("an unclear failure that repeats the script: LOCKED ambiguous, and the verifier is struck from the LOCKED detail"
      " AND the alert BEFORE they are written (Langston Step-4 fold: redaction used to run after the lock)",
      r.returncode == 4 and lk is not None and lk.get("arm") == "ambiguous" and "<redacted>" in lk.get("detail", "")
      and "SCRAM-SHA-256$" not in json.dumps(lk) and "SCRAM-SHA-256$" not in al and "<redacted>" in al
      and APPPW not in json.dumps(lk) + al, (r.returncode, lk, al[-300:]))

print("create: dt-sql busy")
reset("ok")
with open(os.path.join(state, "lock"), "a") as lf:
    fcntl.flock(lf, fcntl.LOCK_EX)
    r = run(tool, "--create")
check("busy: exit 5, no call, reader.env.new removed",
      r.returncode == 5 and calls() == [] and not os.path.exists(new_env), (r.returncode, len(calls())))

# ── --verify ──
print("verify")
reset("probe", reader=True)
r = run(tool, "--verify")
c = calls()
check("verify: a correct reader passes (exit 0)", r.returncode == 0 and "VERIFY PASS" in r.stdout,
      (r.returncode, r.stdout[-400:], r.stderr[-200:]))
if c:
    a = c[0]
    check("verify: logs in as dt_reader with reader.env's password", a["PGPASSWORD"] == PASSWORD
          and "user=dt_reader " in a["argv"][0] and "sslmode=verify-full " in a["argv"][0], a["argv"][0])
    check("verify: the session turns the read-only default off, so the probes test the ROLE",
          "-c default_transaction_read_only=off" in a["PGOPTIONS"] and "-c lock_timeout=5s" in a["PGOPTIONS"],
          a["PGOPTIONS"])
    check("verify: the script starts with the in-session TLS check and ends with ROLLBACK",
          a["stdin"].startswith(TRANSPORT) and a["stdin"].rstrip().endswith("ROLLBACK;"), a["stdin"][-60:])
    check("verify: the password is not in argv", not any(PASSWORD in x for x in a["argv"]))
check("verify: no secret in stdout, stderr or dt-sql's log",
      not any(PASSWORD in t for t in (r.stdout, r.stderr, raw(os.path.join(state, "log.jsonl")))))

reset("probe_bad", reader=True)
r = run(tool, "--verify")
check("verify: a write the role was NOT stopped from making fails (72), naming insert",
      r.returncode == 72 and "probe insert" in r.stdout, (r.returncode, r.stdout[-300:]))
reset("probe_extra", reader=True)
r = run(tool, "--verify")
check("verify: a probe nobody asked for fails (72)", r.returncode == 72 and "unexpected probes" in r.stdout,
      (r.returncode, r.stdout[-300:]))
reset("ok", reader=True)
r = run(tool, "--verify")
check("verify: answers that are not the expected rows fail (72)", r.returncode == 72, (r.returncode, r.stdout[-300:]))

refused("verify with no reader.env", 71, "--verify")
refused("verify with a malformed reader.env", 71, "--verify",
        setup=lambda: write_reader_env(text="DT_READER_HOST=%s\nnonsense\n" % HOST))
refused("verify with reader.env naming another login", 71, "--verify",
        setup=lambda: write_reader_env(user="postgres"))
refused("verify with reader.env.new left over", 66, "--verify", reader=True, setup=lambda: open(new_env, "w").close())
reset("probe", reader=True)
os.chmod(reader_env, 0o644)
r = run(tool, "--verify")
check("verify with reader.env at 0644: exit 71, no call (a correct reader would otherwise pass)",
      r.returncode == 71 and calls() == [], (r.returncode, len(calls())))

shutil.rmtree(work, ignore_errors=True)
print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
