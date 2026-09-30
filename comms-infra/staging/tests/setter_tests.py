#!/usr/bin/env python3
"""Setter suite — B-CREDENTIALS-PRIVATE-REPO OBJ-1. Run AS ROOT on a Linux box with python3-bcrypt:
    python3 setter_tests.py

It runs COPIES of the committed setter and dt-api whose only differences are their CONSTANTS
blocks (asserted), against fakeapp.py (logins checked with real bcrypt against a JSON "database")
and fakepsql.py (the setter's two statements against the same file). Cases: the pre-audit's
kill tests after (1), (1b), (2), (4) with their expected end states; the password-only mutation;
forced failures at (3) and (6); a restore that itself fails; the budget; PGPASSFILE refusals;
the lock held across the commit; and the value's shape. Judge by exit code.
"""
import json
import os
import re
import subprocess
import sys
import tempfile
import time

import bcrypt

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fakeapp  # noqa: E402

DT_SRC = os.path.join(HERE, "..", "dt-api")
SET_SRC = os.environ.get("SETTER_SRC") or os.path.join(HERE, "..", "dt-api-set-crew-password")
FAKEPSQL = os.path.join(HERE, "fakepsql.py")
PASS = FAIL = 0
V1 = "OldValue_1abcdefghij"
NL = chr(10)


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


def substitute(src_path, consts, out_path):
    src = open(src_path, encoding="utf-8").read()
    a = src.index("# ── CONSTANTS")
    b = src.index("# ── END CONSTANTS ──")
    shipped = set(re.findall(r"^([A-Z_]+) =", src[a:b], re.M))
    check("%s: the test block sets exactly the shipped constants" % os.path.basename(src_path),
          shipped == set(consts), "%s vs %s" % (sorted(shipped), sorted(consts)))
    block = "# ── CONSTANTS (test copy) ──\n" + "".join("%s = %s\n" % kv for kv in consts.items())
    out = src[:a] + block + src[b:]
    open(out_path, "w", encoding="utf-8").write(out)
    return out_path


class Rig:
    def __init__(self, live_env=None, kill=None, verify=None, db_extra=None, account="root"):
        self.account = account
        self.tmp = tempfile.mkdtemp(prefix="setter-t-")
        os.makedirs(self.p("state"), mode=0o700)
        os.makedirs(self.p("etc"), mode=0o750)
        self.db = self.p("db.json")
        json.dump({"users": {"testuser123": {"password": bcrypt.hashpw(V1.encode(), bcrypt.gensalt(10)).decode(),
                                             "role": "owner"}}, **(db_extra or {})}, open(self.db, "w"))
        self.app = fakeapp.App(db_path=self.db)
        self.srv, port = fakeapp.serve(self.app)
        self.dt = substitute(DT_SRC, {
            "APP_HOST": '"127.0.0.1"', "APP_PORT": str(port), "ENV_FILE": repr(self.p("etc/staging-api.env")),
            "STATE_DIR": repr(self.p("state")), "EXPECT_USER": '"root"', "MINT_CALLER": '"dtmint"',
            "LOCK_TIMEOUT_S": "1", "HTTP_TIMEOUT_S": "10", "LOGIN_TIMEOUT_S": "10"}, self.p("dt-api"))
        self.kill = kill
        self.verify = verify or [sys.executable, self.dt, "GET", "/api/settings"]
        self.write_setter()
        if live_env:
            self.write_env(live_env)

    def write_setter(self, src=None):
        self.setter = substitute(src or SET_SRC, {
            "DT_API_PATH": repr(self.dt), "PSQL": repr(FAKEPSQL), "DT_API_VERIFY": repr(self.verify),
            "SETTER_DIR": repr(self.p("setter")), "SETTER_LOCK": repr(self.p("setter.lock")),
            "DTAPI_ACCOUNT": repr(self.account), "EXPECT_ROOT": "True", "KILL_AFTER": repr(self.kill)},
            self.p("setter-under-test"))

    def p(self, *a):
        return os.path.join(self.tmp, *a)

    def write_env(self, value):
        with open(self.p("etc/staging-api.env"), "w") as fh:
            fh.write("DT_API_USER=testuser123\nDT_API_PASS=%s\n" % value)
        os.chmod(self.p("etc/staging-api.env"), 0o600)

    def env_value(self, name="etc/staging-api.env"):
        try:
            for ln in open(self.p(name)):
                if ln.startswith("DT_API_PASS="):
                    return ln.strip().split("=", 1)[1]
        except FileNotFoundError:
            return None

    def dbrow(self):
        return json.load(open(self.db))["users"]["testuser123"]

    def pgpass(self, mode=0o600, path=None):
        path = path or self.p("pgpass")
        with open(path, "w") as fh:
            fh.write("%s:5432:postgres:postgres:secret\n" % self.db)
        os.chmod(path, mode)
        return path

    def run(self, pgpass=None, env=None):
        e = {"PATH": "/usr/bin:/bin"}
        if pgpass is not False:
            e["PGPASSFILE"] = pgpass or self.pgpass()
        e.update(env or {})
        try:
            r = subprocess.run([sys.executable, self.setter], env=e, capture_output=True, text=True, timeout=120)
        except subprocess.TimeoutExpired:
            return 124, "", "TIMEOUT"
        return r.returncode, r.stdout, r.stderr

    def ledger(self):
        try:
            return [json.loads(l) for l in open(self.p("state", "login-ledger.jsonl"))]
        except FileNotFoundError:
            return []

    def age_ledger(self, secs=1000):
        rows = self.ledger()
        with open(self.p("state", "login-ledger.jsonl"), "w") as fh:
            for r in rows:
                r["ts"] -= secs
                fh.write(json.dumps(r) + "\n")

    def marker(self):
        try:
            return json.load(open(self.p("setter", "marker.json")))
        except FileNotFoundError:
            return None

    def close(self):
        self.srv.shutdown()


def matches(value, h):
    return bool(value) and bcrypt.checkpw(value.encode(), h.encode())


def clean(r):
    return (r.marker() is None and not os.path.exists(r.p("setter", "old-env"))
            and not os.path.exists(r.p("etc", ".staging-api.env.new")))


# ── 1. the happy path, first run (no env yet) ──
r = Rig()
c, o, e = r.run()
row, v = r.dbrow(), r.env_value()
check("happy: exit 0", c == 0, o + e)
check("happy: role is editor, the new hash verifies the env's value", row["role"] == "editor" and matches(v, row["password"]))
check("happy: the old value no longer logs in", not matches(V1, row["password"]))
check("happy: the value's shape (41 chars, one '_', an upper, a digit)",
      bool(v) and re.fullmatch(r"[A-Za-z0-9_]{41}", v) and v.count("_") == 1 and re.search("[A-Z]", v) and re.search(r"\d", v), str(v and len(v)))
st = os.stat(r.p("etc/staging-api.env"))
check("happy: the env is 0600 owned by DTAPI_ACCOUNT", st.st_mode & 0o777 == 0o600 and st.st_uid == 0)
check("happy: marker, old-env copy and temp env are gone", clean(r))
check("happy: the run-only PGPASSFILE was removed", not os.path.exists(r.p("pgpass")))
led = [x for x in r.ledger() if x.get("phase") == "sent"]
check("happy: exactly one setter login (3) and one dt-api login (6), both on the loopback bucket",
      [x["who"] for x in led] == ["setter", "dt-api"] and all(x["bucket"] == "loopback" for x in led), str(led))
argv = open(r.db + ".argv").read()
check("happy: no hash ever rode psql's argv", "$2" not in argv and "secret" not in argv)
check("happy: the value never reached stdout or stderr", v not in o and v not in e)
check("happy: the report names (1)..(7)", all(("(%s)" % s) in o for s in ("1", "1b", "2", "3", "4", "5", "6", "7")), o)
check("happy: the token dt-api cached at (6) carries role editor", json.load(open(r.p("state", "token.json")))["role"] == "editor")
r.close()

# ── 2. a second rotation: the live env holds V1, and dt-api ALREADY holds a valid cached token ──
r = Rig(live_env=V1)
q = subprocess.run([sys.executable, r.dt, "GET", "/api/settings"], env={"PATH": "/usr/bin:/bin"}, capture_output=True)
old_tok = json.load(open(r.p("state", "token.json")))
r.age_ledger()                  # that login is > 900 s old as far as the budget is concerned
c, o, e = r.run()
v2 = r.env_value()
check("rotation: exit 0, the env changed, the db matches it", q.returncode == 0 and c == 0 and v2 != V1
      and matches(v2, r.dbrow()["password"]), o + e)
new_tok = json.load(open(r.p("state", "token.json")))
led = [x["who"] for x in r.ledger() if x.get("phase") == "sent"]
check("rotation: (5) purged the still-valid old token, so (6) proved the NEW value with a fresh login",
      new_tok["accessToken"] != old_tok["accessToken"] and new_tok["role"] == "editor" and led[-2:] == ["setter", "dt-api"], str(led))
r.close()

# ── 2b. (3)'s role check is a second, independent layer ──
r = Rig(live_env=V1)
r.app.force_role = "owner"
c, o, e = r.run()
check("(3) a login reporting role owner FAILS and restores", c == 1 and "user.role" in o and r.dbrow()["role"] == "owner"
      and r.env_value() == V1 and clean(r), o + e)
r.close()

# ── 3. the budget ──
r = Rig()
os.makedirs(r.p("state"), exist_ok=True)
with open(r.p("state", "login-ledger.jsonl"), "w") as fh:
    fh.write(json.dumps({"ts": time.time() - 100, "who": "dt-api", "phase": "sent", "bucket": "loopback"}) + "\n")
before = r.dbrow()
c, o, e = r.run()
check("budget: a loopback login 100 s ago REFUSES, nothing touched", c == 2 and "REFUSED: the ledger records" in e and r.dbrow() == before, e)
check("budget: the PGPASSFILE is removed even on a refusal", not os.path.exists(r.p("pgpass")))
r.close()

# ── 4. the mutation: a setter that writes only the password must FAIL ──
src = open(SET_SRC, encoding="utf-8").read()
old = "SET password = '%(h)s', role = '%(r)s', updated_at"
check("mutation text found exactly once", src.count(old) == 1)
mut = os.path.join(tempfile.mkdtemp(), "mutant")
open(mut, "w", encoding="utf-8").write(src.replace(old, "SET password = '%(h)s', updated_at"))
r = Rig()
r.write_setter(mut)
c, o, e = r.run()
row = r.dbrow()
check("mutation: password-only write FAILS and is rolled back", c == 1 and "ROLLED BACK" in o and row["role"] == "owner"
      and matches(V1, row["password"]) and r.env_value() is None and clean(r), o + e)
r.close()

# ── 5. a forced failure at (6) restores hash, role AND env ──
r = Rig(live_env=V1, verify=["/bin/false"])
c, o, e = r.run()
row = r.dbrow()
check("fail at (6): exit 1, hash + role + env restored", c == 1 and row["role"] == "owner" and matches(V1, row["password"])
      and r.env_value() == V1 and clean(r), o + e)
check("fail at (6): dt-api's cache purged", not os.path.exists(r.p("state", "token.json")))
r.close()

# ── 6. a failure at (3) restores hash + role; the env was never touched ──
r = Rig(live_env=V1)
r.app.login_status = 500
c, o, e = r.run()
row = r.dbrow()
check("fail at (3): exit 1, hash + role restored, env untouched", c == 1 and "(3)" in o and row["role"] == "owner"
      and matches(V1, row["password"]) and r.env_value() == V1 and clean(r), o + e)
r.close()

# ── 7-10. kill tests with the pre-audit's expected end states ──
for step, live, want_new in (("1", V1, False), ("1b", V1, False), ("2", V1, True), ("2", None, True), ("4", V1, True)):
    r = Rig(live_env=live, kill=step)
    c, o, e = r.run()
    check("kill after (%s): the run died by SIGKILL" % step, c == -9, "%s %s" % (c, e))
    committed_hash = r.dbrow()["password"]
    temp_v = r.env_value("etc/.staging-api.env.new")
    r.kill = None
    r.write_setter()
    if step == "4":
        r.age_ledger()          # (3) logged in; the budget would (correctly) refuse for 900 s
    c, o, e = r.run()
    row, v = r.dbrow(), r.env_value()
    if want_new:
        ok = c == 0 and row["role"] == "editor" and v not in (None, V1) and matches(v, row["password"]) and clean(r)
    else:
        ok = c == 0 and row["role"] == "owner" and v == V1 and matches(V1, row["password"]) and clean(r) and "OLD value stands" in o
    check("kill after (%s)%s: (0) reconciles to the %s value" % (step, "" if live else " (first run)", "NEW" if want_new else "OLD"), ok, o + e)
    r.close()

# ── 11. reconcile gets a 500: not an answer — touch nothing ──
r = Rig(live_env=V1, kill="2")
r.run()
r.kill = None
r.write_setter()
r.app.login_status = 500
m0 = r.marker()
c, o, e = r.run()
check("reconcile + login 500: exit 3, marker kept, nothing touched", c == 3 and r.marker() == m0 and r.env_value() == V1, o + e)
r.close()

# ── 11b. reconcile: ONLY the live env's login gets a 500 — still not an answer, even though the
#         temp env would now log in (the spec: a 500 on either login touches nothing) ──
r = Rig(live_env=V1, kill="2")
r.run()
r.kill = None
r.write_setter()
r.app.login_status, r.app.login_status_times = 500, 1
m0 = r.marker()
c, o, e = r.run()
check("reconcile: a 500 on the live login alone -> exit 3, touch nothing (no temp login, no rename)",
      c == 3 and r.marker() == m0 and r.env_value() == V1, o + e)
r.close()

# ── 12. neither logs in, but the row never changed: nothing to restore ──
r = Rig()
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": False, "phase": "committing"},
          open(r.p("setter", "marker.json"), "w"))
with open(r.p("etc", ".staging-api.env.new"), "w") as fh:
    fh.write("DT_API_USER=testuser123\nDT_API_PASS=NeverCommitted_9\n")
c, o, e = r.run()
check("reconcile: commit never landed -> cleanup, OLD stands, no page", c == 0 and "The OLD value stands" in o and "PAGE" not in e and clean(r), o + e)
r.close()

# ── 13. neither logs in AND the row was changed by someone else: restore + page ──
r = Rig()
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": False, "phase": "committing"},
          open(r.p("setter", "marker.json"), "w"))
db = json.load(open(r.db))
db["users"]["testuser123"]["password"] = bcrypt.hashpw(b"SomeoneElse_1", bcrypt.gensalt(10)).decode()
json.dump(db, open(r.db, "w"))
c, o, e = r.run()
check("reconcile: an outside change -> restored to the marker and PAGE", c == 1 and "PAGE" in e
      and r.dbrow()["password"] == row0["password"] and clean(r), o + e)
check("... and the page is DURABLE (page.json), not only terminal text", os.path.exists(r.p("state", "page.json")))
r.close()

# ── 13b. a restore killed between its DB and env halves (r1 BLOCKER): row is back to OLD, env holds NEW ──
r = Rig(live_env="NewValue_9zzzzzzzzzzz")
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()                                 # the row holds V1's hash: the DB half WAS restored
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": True, "phase": "renamed"},
          open(r.p("setter", "marker.json"), "w"))
with open(r.p("setter", "old-env"), "w") as fh:
    fh.write("DT_API_USER=testuser123" + NL + "DT_API_PASS=" + V1 + NL)
c, o, e = r.run()
check("reconcile: DB restored but env still NEW -> the env is restored from the copy, OLD stands, nothing lost",
      c == 0 and r.env_value() == V1 and matches(V1, r.dbrow()["password"]) and clean(r), o + e)
r.close()

# ── 13c. a second invocation while a run holds the setter lock must NOT delete that run's PGPASSFILE ──
import fcntl  # noqa: E402
r = Rig()
lk = os.open(r.p("setter.lock"), os.O_RDWR | os.O_CREAT, 0o600)
fcntl.flock(lk, fcntl.LOCK_EX)
pg = r.pgpass()
c, o, e = r.run(pgpass=pg)
check("a refused second run leaves the running run's PGPASSFILE in place", c == 2 and "another setter run" in e and os.path.exists(pg), e)
fcntl.flock(lk, fcntl.LOCK_UN)
os.close(lk)
r.close()

# ── 13d. a psql from an earlier run still connected: touch nothing ──
r = Rig(db_extra={"orphans": 1})
c, o, e = r.run()
check("an earlier run's psql still connected -> exit 2 (refused, nothing touched)", c == 2 and "still connected" in e
      and r.dbrow()["role"] == "owner" and r.marker() is None, e)
r.close()

# ── 13e. a marker that cannot be read is recovery data: refuse, do not overwrite it ──
r = Rig()
os.makedirs(r.p("setter"), mode=0o700)
open(r.p("setter", "marker.json"), "w").write("{not json")
c, o, e = r.run()
check("an unreadable marker -> exit 4, kept, nothing touched", c == 4 and open(r.p("setter", "marker.json")).read() == "{not json"
      and r.dbrow()["role"] == "owner", e)
r.close()

# ── 13f. a standing dt-api page (the reason someone runs the setter) must not block (6) ──
r = Rig(live_env=V1)
json.dump({"ts": "t", "kind": "crew-password-wrong", "detail": "d"}, open(r.p("state", "page.json"), "w"))
c, o, e = r.run()
check("a standing page is cleared at (5), so (6) can log in; the run succeeds", c == 0 and not os.path.exists(r.p("state", "page.json")), o + e)
r.close()

# ── 14. a restore that itself fails keeps the marker (exit 4) ──
r = Rig(live_env=V1, db_extra={"fail_writes_from": 2})
r.app.login_status = 500
c, o, e = r.run()
check("restore fails: exit 4, the marker is KEPT", c == 4 and r.marker() is not None and "RESTORE FAILED" in e, o + e)
r.close()

# ── 15. PGPASSFILE refusals ──
r = Rig()
c, o, e = r.run(pgpass=False)
check("no PGPASSFILE: exit 2", c == 2 and "set PGPASSFILE" in e, e)
pg644 = r.pgpass(mode=0o644)
c, o, e = r.run(pgpass=pg644)
check("PGPASSFILE 0644: exit 2", c == 2 and "mode 0600" in e, e)
check("r3: a REFUSED PGPASSFILE is left in place and the text says so", os.path.exists(pg644) and "NOT removed" in e, e)
c, o, e = r.run(env={"PGPASSFILE": "/./home/deploy/x"})
check("r3: '/./home/...' is caught on the resolved path", c == 2 and "resolves under /home" in e, e)
c, o, e = r.run(env={"PGPASSFILE": "pgpass"})
check("r3: a relative PGPASSFILE is refused", c == 2 and "absolute path" in e, e)
c, o, e = r.run(env={"PGPASSFILE": "/home/deploy/x"})
check("PGPASSFILE under /home: exit 2", c == 2 and "under /home" in e, e)
check("refusals touched nothing", r.dbrow()["role"] == "owner" and r.env_value() is None)
r.close()

# ── 16. dt-api's lock is held across the commit (C7 from the caller's side) ──
r = Rig(db_extra={"sleep_on_write": 4})
p = subprocess.Popen([sys.executable, r.setter], env={"PATH": "/usr/bin:/bin", "PGPASSFILE": r.pgpass()},
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(1.5)
r.write_env(V1)                 # a caller with SOME env, so a refusal can only be the lock
q = subprocess.run([sys.executable, r.dt, "GET", "/api/settings"], env={"PATH": "/usr/bin:/bin"},
                   capture_output=True, text=True, timeout=30)
p.communicate(timeout=120)
check("a dt-api call during the commit waits, then refuses on the lock", q.returncode == 3 and "credential lock" in q.stderr, q.stderr)
r.close()

# ── 17. the generator, 2000 draws ──
import importlib.util  # noqa: E402
from importlib.machinery import SourceFileLoader  # noqa: E402
r = Rig()
spec = importlib.util.spec_from_loader("setter_mod", SourceFileLoader("setter_mod", r.setter))
S = importlib.util.module_from_spec(spec)
spec.loader.exec_module(S)
vals = [S.gen_value() for _ in range(2000)]
check("gen_value: 2000 draws, all valid, all distinct", len(set(vals)) == 2000 and all(
    re.fullmatch(r"[A-Za-z0-9_]{41}", x) and x.count("_") == 1 and re.search("[A-Z]", x) and re.search(r"\d", x) for x in vals))
check("gen_value: validatePasswordStrength's special set holds '_'", "_" in "!@#$%^&*()_+=-{};:'\",.<>?")
r.close()

# ── 17b. r2: an interrupt BEFORE the commit point restores; one AFTER it lets the run finish ──
import signal as _sig  # noqa: E402
r = Rig(live_env=V1, db_extra={"sleep_on_write": 3})
pg = r.pgpass()
pr = subprocess.Popen([sys.executable, r.setter], env={"PATH": "/usr/bin:/bin", "PGPASSFILE": pg},
                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
time.sleep(1.5)                                    # inside (2)'s psql, which runs in its own session
pr.send_signal(_sig.SIGTERM)
o, e = pr.communicate(timeout=120)
row = r.dbrow()
check("r3: SIGTERM during the commit -> acted on at the next checkpoint, restored, exit 3 (the contract's interrupt)",
      pr.returncode == 3 and "acted on before (3)" in o and row["role"] == "owner" and matches(V1, row["password"])
      and r.env_value() == V1 and clean(r), o + e)
r.close()
r = Rig(live_env=V1, verify=["/bin/sh", "-c", "sleep 3; exec \"$0\" \"$@\"", sys.executable, "PLACEHOLDER", "GET", "/api/settings"])
r.verify[4] = r.dt
r.write_setter()
pr = subprocess.Popen([sys.executable, r.setter], env={"PATH": "/usr/bin:/bin", "PGPASSFILE": r.pgpass()},
                      stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)
for _ in range(100):                               # wait until the run is inside (6)
    if os.path.exists(r.p("setter", "run.log")) and "(5) purged" in open(r.p("setter", "run.log")).read():
        break
    time.sleep(0.1)
pr.send_signal(_sig.SIGTERM)
o, e = pr.communicate(timeout=120)
v = r.env_value()
check("r2: SIGTERM after the commit point -> the run FINISHES (exit 0), new value in place",
      pr.returncode == 0 and "(7) removed the marker" in o and v != V1 and matches(v, r.dbrow()["password"]) and clean(r), o + e)
r.close()

# ── 17c. r2: a restored pre-run env that does NOT log in is paged, not reported as success ──
r = Rig(live_env="WrongOld_1zzzzzzzzzzz")
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": True, "phase": "renamed"},
          open(r.p("setter", "marker.json"), "w"))
with open(r.p("setter", "old-env"), "w") as fh:
    fh.write("DT_API_USER=testuser123" + NL + "DT_API_PASS=AlsoWrong_2zzzzzzzzzz" + NL)
c, o, e = r.run()
check("r2: the restored env refuses to log in -> exit 1 and a DURABLE page", c == 1 and "does NOT log in" in e
      and os.path.exists(r.p("state", "page.json")), o + e)
r.close()

# ── 17d. r2: a 'temp-written' marker whose row HAS changed is not trusted ──
r = Rig(live_env=V1, kill="2")
r.run()
m = json.load(open(r.p("setter", "marker.json")))
m["phase"] = "temp-written"                        # as if the phase write had not reached disk
json.dump(m, open(r.p("setter", "marker.json"), "w"))
r.kill = None
r.write_setter()
c, o, e = r.run()
v = r.env_value()
check("r3 S2: an early phase over a changed row is NOT reconciled: exit 4, marker kept, nothing restored, PAGE",
      c == 4 and "someone else" in e and r.marker() is not None and v == V1 and not matches(V1, r.dbrow()["password"])
      and os.path.exists(r.p("state", "page.json"))
      and json.load(open(r.p("state", "page.json"))).get("kind") == "setter-row-changed", o + e)
r.close()

# ── r3 S2: the plain case — someone else changed the row while the marker said 'temp-written' ──
r = Rig(live_env=V1, kill="1b")
r.run()
db = json.load(open(r.db))
theirs = bcrypt.hashpw(b"KylesOwn_1zzz", bcrypt.gensalt(10)).decode()
db["users"]["testuser123"]["password"] = theirs
json.dump(db, open(r.db, "w"))
r.kill = None
r.write_setter()
n_sent = len([x for x in r.ledger() if x.get("phase") == "sent"])
c, o, e = r.run()
pg = json.load(open(r.p("state", "page.json"))) if os.path.exists(r.p("state", "page.json")) else {}
check("r3 S2: someone else's change during a 'temp-written' run is KEPT (not restored over), exit 4, PAGE setter-row-changed, no login",
      c == 4 and r.dbrow()["password"] == theirs and r.marker() is not None and pg.get("kind") == "setter-row-changed"
      and len([x for x in r.ledger() if x.get("phase") == "sent"]) == n_sent, o + e + str(pg))
r.close()

# ── r3 S1: an env naming ANOTHER user proves nothing ──
r = Rig(live_env=V1, kill="2")
r.run()
with open(r.p("etc/staging-api.env"), "w") as fh:
    fh.write("DT_API_USER=kylegjordan" + NL + "DT_API_PASS=" + V1 + NL)
temp_before = r.env_value("etc/.staging-api.env.new")
r.kill = None
r.write_setter()
c, o, e = r.run()
check("r3 S1: reconcile with a live env naming another user -> exit 4, the temp env (the only copy of the new value) KEPT",
      c == 4 and "names a user other than" in e and r.marker() is not None and temp_before
      and r.env_value("etc/.staging-api.env.new") == temp_before and matches(temp_before, r.dbrow()["password"]), o + e)
r.close()
r = Rig()
with open(r.p("etc/staging-api.env"), "w") as fh:
    fh.write("DT_API_USER=kylegjordan" + NL + "DT_API_PASS=x" + NL)
c, o, e = r.run()
check("r3 S1: a fresh run over a live env naming another user -> exit 2, nothing touched",
      c == 2 and "other than testuser123" in e and r.dbrow()["role"] == "owner" and r.marker() is None, e)
r.close()

# ── r3 S3: the restored env's check login gets no answer: exit 3, NO page ──
r = Rig(live_env="NewValue_9zzzzzzzzzzz")
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": True, "phase": "renamed"},
          open(r.p("setter", "marker.json"), "w"))
with open(r.p("setter", "old-env"), "w") as fh:
    fh.write("DT_API_USER=testuser123" + NL + "DT_API_PASS=" + V1 + NL)
r.app.login_status, r.app.login_status_skip = 500, 1     # the live login answers (401); the check login gets a 500
c, o, e = r.run()
check("r3 S3: a 500 on the restored env's check login -> exit 3 and NO page (not an answer about the value)",
      c == 3 and "no usable answer" in e and not os.path.exists(r.p("state", "page.json")) and r.env_value() == V1, o + e)
r.close()

# ── r3 S5: a restored env that logs in clears a standing page ──
r = Rig(live_env="NewValue_9zzzzzzzzzzz")
os.makedirs(r.p("setter"), mode=0o700)
row0 = r.dbrow()
json.dump({"started": "x", "old_hash": row0["password"], "old_role": "owner", "had_env": True, "phase": "renamed"},
          open(r.p("setter", "marker.json"), "w"))
with open(r.p("setter", "old-env"), "w") as fh:
    fh.write("DT_API_USER=testuser123" + NL + "DT_API_PASS=" + V1 + NL)
json.dump({"ts": "t", "kind": "crew-password-wrong", "detail": "d", "sticky": True}, open(r.p("state", "page.json"), "w"))
c, o, e = r.run()
check("r3 S5: the restored env logs in -> exit 0 AND the standing page is cleared (dt-api is not left blocked)",
      c == 0 and not os.path.exists(r.p("state", "page.json")) and r.env_value() == V1, o + e)
r.close()

# ── r3 S4: a (6) failure puts the page (5) cleared back up, with the failure added ──
r = Rig(live_env=V1, verify=["/bin/false"])
json.dump({"ts": "t", "kind": "crew-password-wrong", "detail": "d", "sticky": True}, open(r.p("state", "page.json"), "w"))
c, o, e = r.run()
pg = json.load(open(r.p("state", "page.json"))) if os.path.exists(r.p("state", "page.json")) else {}
check("r3 S4: fail at (6) with a standing page -> restored, the page is BACK (first cause kept) with setter-restored added",
      c == 1 and pg.get("kind") == "crew-password-wrong" and any("setter-restored" in x for x in pg.get("later", [])), o + e + str(pg))
r.close()
r = Rig(live_env=V1, verify=["/bin/false"])
c, o, e = r.run()
pg = json.load(open(r.p("state", "page.json"))) if os.path.exists(r.p("state", "page.json")) else {}
check("r3 S4: fail at (6) with no page -> a DURABLE setter-restored page", c == 1 and pg.get("kind") == "setter-restored", o + e + str(pg))
r.close()

# ── r3: the env copy is checked BEFORE the database is restored ──
r = Rig(live_env=V1)
r.verify = ["/bin/sh", "-c", "rm -f '%s'; exit 1" % r.p("setter", "old-env")]
r.write_setter()
c, o, e = r.run()
check("r3: a missing old-env copy fails the restore BEFORE the database is touched: exit 4, marker kept, row still NEW",
      c == 4 and "missing" in e and r.marker() is not None and r.dbrow()["role"] == "editor", o + e)
r.close()

# ── r3: a 200 login dt-api would page as malformed is not "ok" for a reconcile ──
r = Rig(live_env=V1, kill="2")
r.run()
r.kill = None
r.write_setter()
m0 = r.marker()
r.app.login_body = [1, 2]
c, o, e = r.run()
check("r3: reconcile + a malformed 200 login -> exit 3, touch nothing", c == 3 and r.marker() == m0 and r.env_value() == V1, o + e)
r.close()

# ── r3: a setup error has the setter's own exit (3), not Python's 1 ──
r = Rig(account="no-such-account-xyz")
c, o, e = r.run()
check("r3: a missing dtapi account -> exit 3 'could not prepare', nothing touched",
      c == 3 and "could not prepare" in e and r.dbrow()["role"] == "owner", e)
r.close()

# ── 18. the run log survives the terminal ──
r = Rig()
r.run()
log = open(r.p("setter", "run.log")).read() if os.path.exists(r.p("setter", "run.log")) else ""
check("every step is in the run log too (an ssh that drops loses nothing)", "(7) removed the marker" in log, log[-200:])
r.close()

print("setter suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
