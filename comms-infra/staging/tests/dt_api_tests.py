#!/usr/bin/env python3
"""dt-api suite — B-CREDENTIALS-PRIVATE-REPO OBJ-1. Run on a Linux box: python3 dt_api_tests.py

It runs a COPY of the committed dt-api whose ONLY difference is the CONSTANTS block (asserted
first — so what is tested is what ships), against the stand-in app in fakeapp.py.
Every case asserts the exit code, the exact text, what reached stdout, and — for a refusal —
that NOTHING reached the app. Judge the suite by its exit code.
"""
import json
import os
import pwd
import re
import subprocess
import sys
import tempfile
import time
import fcntl

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import fakeapp  # noqa: E402

SRC = os.environ.get("DT_API_SRC") or os.path.join(HERE, "..", "dt-api")   # the mutation runner overrides it
PASS = FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


def constants_block(text):
    a = text.index("# ── CONSTANTS")
    b = text.index("# ── END CONSTANTS ──")
    return a, b


def make_copy(tmp, port, extra=None):
    src = open(SRC, encoding="utf-8").read()
    a, b = constants_block(src)
    me = pwd.getpwuid(os.geteuid()).pw_name
    consts = {"APP_HOST": '"127.0.0.1"', "APP_PORT": str(port),
              "ENV_FILE": repr(os.path.join(tmp, "env")), "STATE_DIR": repr(os.path.join(tmp, "state")),
              "EXPECT_USER": repr(me), "MINT_CALLER": '"dtmint"', "LOCK_TIMEOUT_S": "1",
              "HTTP_TIMEOUT_S": "10", "LOGIN_TIMEOUT_S": "10"}
    consts.update(extra or {})
    block = "# ── CONSTANTS (test copy) ──\n" + "".join("%s = %s\n" % kv for kv in consts.items())
    out = src[:a] + block + src[b:]
    # the ONLY difference is the block: strip both blocks and compare
    sa, sb = constants_block(out)
    check("copy differs only in the constants block", src[:a] == out[:sa] and src[b:] == out[sb:])
    shipped_names = set(re.findall(r"^([A-Z_]+) =", src[a:b], re.M))
    check("the test block sets exactly the shipped constants", shipped_names == set(consts),
          "%s vs %s" % (sorted(shipped_names), sorted(consts)))
    p = os.path.join(tmp, "dt-api-under-test")
    open(p, "w", encoding="utf-8").write(out)
    return p


class Rig:
    def __init__(self, extra=None, app=None):
        self.tmp = tempfile.mkdtemp(prefix="dtapi-t-")
        os.makedirs(os.path.join(self.tmp, "state"), mode=0o700)
        self.app = app or fakeapp.App()
        self.srv, port = fakeapp.serve(self.app)
        self.bin = make_copy(self.tmp, port, extra)
        with open(os.path.join(self.tmp, "env"), "w") as fh:
            fh.write("DT_API_USER=testuser123\nDT_API_PASS=Crew_Pass1\n")
        os.chmod(os.path.join(self.tmp, "env"), 0o600)

    def st(self, name):
        return os.path.join(self.tmp, "state", name)

    def run(self, *args, env=None, stdin=b""):
        e = {"PATH": "/usr/bin:/bin"}
        e.update(env or {})
        try:
            r = subprocess.run([sys.executable, self.bin] + list(args), input=stdin, env=e,
                               capture_output=True, timeout=30)
        except subprocess.TimeoutExpired:
            return 124, "", "TIMEOUT: dt-api did not finish in 30 s"
        return r.returncode, r.stdout.decode(), r.stderr.decode()

    def ledger(self):
        try:
            return [json.loads(l) for l in open(self.st("login-ledger.jsonl"))]
        except FileNotFoundError:
            return []

    def sent(self):
        return [e for e in self.ledger() if e.get("phase") == "sent"]

    def close(self):
        self.srv.shutdown()


def jload(path):
    try:
        return json.load(open(path))
    except (FileNotFoundError, ValueError):
        return {}


def refused(rig, args, text, name):
    n0 = len(rig.app.requests)
    c, o, e = rig.run(*args)
    check(name, c == 2 and e.strip() == text and o == "" and len(rig.app.requests) == n0,
          "exit=%s err=%r out=%r reqs=%d" % (c, e.strip(), o[:60], len(rig.app.requests) - n0))


# ═══════════════════════════ the rules (pre-audit §2.2.2 r4) ═══════════════════════════
R = Rig()
MAL = "REFUSED: dt-api malformed request: "
WHOLE = "REFUSED: dt-api does not call account, credential or mode-switch routes"
ACCT = "REFUSED: dt-api does not read account or credential routes"
JOB = "REFUSED: dt-api does not trigger jobs through GET: %s"
NEEDW = "REFUSED: dt-api writes need --write"
NOTAL = "REFUSED: dt-api write not allowlisted: %s %s"
WHOLES = ["/api/trading/set-mode", "/api/kill-switch/reset", "/api/guardrails-v2/kill-switch/reset"]
PREFIXES = ["/api/admin", "/api/auth", "/api/user", "/api/admin/users", "/api/user/profile",
            "/api/auth/login"]
SRC_TEXT = open(SRC, encoding="utf-8").read()
JOBS = re.findall(r'^\s+"(/api/[^"]+)",', SRC_TEXT[SRC_TEXT.index("READ_DENY_JOBS = ("):
                                                    SRC_TEXT.index("WRITE_ALLOW =")], re.M)
# ⛔ PINNED, NOT DERIVED: the census result is written here independently, so deleting an entry
#    from dt-api FAILS this suite instead of silently removing that entry's own test.
EXPECTED_JOBS = {
    "/api/audit/run", "/api/signal-audit/run", "/api/system/formula-audit",
    "/api/system/formula-audit/run", "/api/system/feed-health/run", "/api/reb-2-12/run",
    "/api/reb-2-12/run-all", "/api/reb-2-14/run", "/api/reb-2-15/run", "/api/reb-2-14-15/run-all",
    "/api/execution/timing/export", "/api/diagnostics/kraken-documentation", "/api/vts/export",
    "/api/vts/audit", "/api/vts/skipped-signals/export", "/api/database/status",
    "/api/filters/diagnostics", "/api/active-engine/diagnostics/scan",
    "/api/active-engine/filtered-pairs", "/api/learning/profile/:id/evaluate",
    "/api/strategic/recommendations", "/api/diagnostics/tec/costs", "/api/diagnostics/tec/costs/:symbol"}
check("the shipped job denylist is exactly the census (23)", set(JOBS) == EXPECTED_JOBS and len(JOBS) == 23,
      str(sorted(set(JOBS) ^ EXPECTED_JOBS)))
JOBS = sorted(EXPECTED_JOBS)


def concrete(p):
    return "/".join("x1" if s.startswith(":") else s for s in p.split("/"))


# rule 1 — malformed: each whole route and each prefix with '#', '%2e', '//', a space
for p in WHOLES + PREFIXES:
    for bad, why in ((p + "#x", "contains '#'"), (p + "%2e", "contains '%'"),
                     (p.replace("/api/", "/api//"), "contains '//'"), (p + " x", None)):
        c, o, e = R.run("GET", bad)
        ok = c == 2 and e.startswith(MAL) and o == "" and (why is None or why in e)
        check("rule 1 malformed GET %r" % bad, ok, e)
refused(R, ["--write", "POST", "/api/config?x=1"], MAL + "a query is allowed on GET only", "rule 1 query on a write")
refused(R, ["--write", "GET", "/api/settings"], MAL + "--write must be followed by POST, PUT, PATCH or DELETE", "rule 1 --write GET")
refused(R, ["GET", "/api/settings", "extra"], MAL + "an argument after the path", "rule 1 extra arg")
refused(R, ["GET", "--mode", "demo", "/api/settings"], MAL + "--mode takes paper or live", "rule 1 bad mode")
refused(R, ["HEAD", "/api/settings"], MAL + "unknown method (GET, POST, PUT, PATCH, DELETE only)", "rule 1 HEAD")
refused(R, ["GET", "/api/settings?a=b'c"], MAL + "the query must match ^[A-Za-z0-9_.=&,:-]*$", "rule 1 bad query")
refused(R, ["GET", "/apix/settings"], MAL + "the path must match ^/api/[A-Za-z0-9/_.:-]+$", "rule 1 not /api/")
refused(R, [], MAL + "no arguments (usage: dt-api GET <path>)", "rule 1 no args")
refused(R, ["GET", "/api/settings/é"], MAL + "contains a space, a control character or non-ASCII", "rule 1 non-ASCII")
refused(R, ["GET", "/api/settings\t"], MAL + "contains a space, a control character or non-ASCII", "rule 1 tab")

# rule 2 — whole-route, every method, plain / trailing '/' / upper case, and GET ?x=1
for p in WHOLES:
    for form in (p, p + "/", p.upper(), p.title()):
        refused(R, ["GET", form], WHOLE, "rule 2 GET %s" % form)
        refused(R, ["--write", "POST", form], WHOLE, "rule 2 POST %s" % form)
        refused(R, ["--write", "PUT", form], WHOLE, "rule 2 PUT %s" % form)
    refused(R, ["GET", p + "?x=1"], WHOLE, "rule 2 GET %s?x=1" % p)
    refused(R, ["POST", p], WHOLE, "rule 2 before rule 4 (no --write) %s" % p)

# rule 3 — the read denylist, each class its own text
for p in PREFIXES:
    for form in (p, p + "/", p.upper(), p + "?x=1"):
        refused(R, ["GET", form], ACCT, "rule 3a %s" % form)
for p in JOBS:
    cp = concrete(p)
    for form in (cp, cp + "/", cp.upper(), cp + "?x=1"):
        path_part = form.split("?")[0]
        refused(R, ["GET", form], JOB % path_part, "rule 3b %s" % form)

# rule 4 / rule 5
refused(R, ["POST", "/api/safety/kill-switch"], NEEDW, "rule 4 POST without --write")
for m, p in (("POST", "/api/safety/kill-switch"), ("POST", "/api/trading/start"),
             ("PUT", "/api/config"), ("PUT", "/api/guardrails-v2")):
    refused(R, ["--write", m, p], NOTAL % (m, p), "rule 5 %s %s" % (m, p))
check("the shipped whole-route denials are exactly the three",
      'WHOLE_ROUTE_DENY = (' + chr(10) + '    "/api/trading/set-mode",' + chr(10) +
      '    "/api/kill-switch/reset",' + chr(10) + '    "/api/guardrails-v2/kill-switch/reset",' +
      chr(10) + ')' in SRC_TEXT)
check("the shipped read prefixes are exactly the three",
      'READ_DENY_PREFIXES = ("/api/admin", "/api/auth", "/api/user")' in SRC_TEXT)
check("rule 5: the shipped write allowlist is EMPTY", re.search(r"^WRITE_ALLOW = \(\)$", SRC_TEXT, re.M) is not None)

# C10 — every variant Express would route to a denied handler hits the rule text; every other
#       variant is malformed. (Express 4.21.2: case-insensitive, non-strict — measured on staging.)
for p in WHOLES:
    for form, want in ((p + "/.", "mal"), (p + "/x/..", "mal"), (p.replace("-", "%2d"), "mal"),
                       (p.replace("/api/", "/api/./"), "mal"), (p + "//", "mal"),
                       (p.replace("/api/", "/Api/"), WHOLE), (p + "/", WHOLE)):
        c, o, e = R.run("GET", form)
        ok = c == 2 and (e.startswith(MAL) if want == "mal" else e.strip() == want)
        check("C10 %s" % form, ok, e)

# positive controls
c, o, e = R.run("GET", "/api/settings")
check("control GET /api/settings -> 0, body on stdout", c == 0 and json.loads(o)["ok"] and "HTTP 200" in e, e)
c, o, e = R.run("GET", "/api/settings?x=1")
check("control GET /api/settings?x=1 -> 0", c == 0 and json.loads(o)["path"] == "/api/settings?x=1", o)
c, o, e = R.run("GET", "--mode", "live", "/api/guardrails-v2?mode=live")
check("--mode live sends x-app-mode", c == 0 and json.loads(o)["mode"] == "live", o)
c, o, e = R.run("GET", "/API/Market/Ticker/BTC:USD")
check("the ORIGINAL text is sent (case kept)", c == 0 and json.loads(o)["path"] == "/API/Market/Ticker/BTC:USD", o)
check("no request ever carried X-Forwarded-For (C3)",
      all("X-Forwarded-For" not in h for _, _, h in R.app.requests))
check("exactly one login for all of the above (a warm cache)", len(R.app.logins()) == 1, str(len(R.app.logins())))

# (d) 20 calls, warm cache, no 429 and no extra login
n0 = len(R.app.logins())
codes = [R.run("GET", "/api/settings")[0] for _ in range(20)]
check("OBJ-1(d) 20 warm calls: all 0, no login", codes == [0] * 20 and len(R.app.logins()) == n0, str(codes))
R.close()

# ═══════════════════════════ identity and mint gate ═══════════════════════════
R = Rig(extra={"EXPECT_USER": '"somebody-else"'})
c, o, e = R.run("GET", "/api/settings")
check("refuses to run as the wrong account", c == 2 and "run dt-api as somebody-else" in e and not R.app.requests, e)
R.close()

R = Rig()
refused(R, ["mint"], "REFUSED: dt-api mint is only reachable through the dtmint forced-command key", "mint without SUDO_USER")
c, o, e = R.run("mint", env={"SUDO_USER": "root"})
check("mint with SUDO_USER=root refused", c == 2 and "forced-command" in e and not R.app.requests, e)
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
j = json.loads(o) if c == 0 else {}
check("mint as dtmint: fresh token, exp >= 6 days", c == 0 and j.get("reused") is False and j.get("accessToken"), e)
c, o2, e = R.run("mint", env={"SUDO_USER": "dtmint"})
j2 = json.loads(o2) if c == 0 else {}
check("second mint within 20 h is REUSED, no new login", c == 0 and j2.get("reused") is True and
      j2["accessToken"] == j["accessToken"] and len(R.app.logins()) == 1, "%s %s" % (o2, len(R.app.logins())))
tok = jload(R.st("token.json"))
tok["issued_at"] -= 21 * 3600
json.dump(tok, open(R.st("token.json"), "w"))
c, o3, e = R.run("mint", env={"SUDO_USER": "dtmint"})
check("a mint older than 20 h is replaced", c == 0 and json.loads(o3)["reused"] is False and len(R.app.logins()) == 2, e)
R.app.revoke_all()
json.dump({**jload(R.st("token.json")), "issued_at": time.time()}, open(R.st("token.json"), "w"))
# the cap: 2 dt-api logins per 900 s — this third one must refuse
c, o4, e = R.run("mint", env={"SUDO_USER": "dtmint"})
check("a revoked cached token is not handed out; the cap (2/900 s) stops a third login",
      c == 3 and "already logged in 2 times" in e and len(R.app.logins()) == 2, "%s %s" % (c, e))
R.close()

R = Rig()
R.app.token_life = 5 * 86400
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
check("a token with under 6 days left is NOT handed out (OBJ-1(e))", c == 3 and "under the 6-day floor" in e, e)
R.close()

# ═══════════════════════════ the 401 path (C6) ═══════════════════════════
R = Rig()
R.run("GET", "/api/settings")
R.app.route_401.add("/api/some/route")
c, o, e = R.run("GET", "/api/some/route")
check("a route's own 401 with a good token: exit 1, no re-mint", c == 1 and len(R.app.logins()) == 1 and "HTTP 401" in e, e)
R.app.revoke_all()
c, o, e = R.run("GET", "/api/settings")
check("a dead token: ONE re-mint, then served", c == 0 and len(R.app.logins()) == 2, "%s %s" % (c, e))
R.app.db_ok = False
n0 = len(R.app.logins())
c, o, e = R.run("GET", "/api/settings")
check("C6 signature-valid token refused (DB/lookup): PAGE, exit 5, no login",
      c == 5 and "PAGE (dt-api, token-refused)" in e and "Infra Claude" in e and len(R.app.logins()) == n0, e)
pg = json.load(open(R.st("page.json"))) if os.path.exists(R.st("page.json")) else {}
check("the page is recorded for the hourly check", pg.get("kind") == "token-refused", str(pg))
# drill (pre-audit §2.2.7): a DB outage over 10 calls spends at most 2 limiter slots
for _ in range(10):
    R.run("GET", "/api/settings")
check("drill: 10 calls through a DB outage spend 0 new login slots", len(R.app.logins()) == n0, str(len(R.app.logins()) - n0))
R.app.db_ok = True
R.app.user_missing = True
c, o, e = R.run("GET", "/api/settings")
check("C6 'User account not found': PAGE crew-user-missing, no login", c == 5 and "crew-user-missing" in e and len(R.app.logins()) == n0, e)
R.close()

# ═══════════════════════════ login failures, negative cache, cap ═══════════════════════════
R = Rig()
R.app.password = "something-else"
c, o, e = R.run("GET", "/api/settings")
check("login 401: PAGE crew-password-wrong + negative cache", c == 5 and "crew-password-wrong" in e, e)
c, o, e = R.run("GET", "/api/settings")
check("... and the next call refuses WITHOUT contacting the app", c == 3 and "will not log in again until" in e and len(R.app.logins()) == 1, e)
R.close()

R = Rig()
R.app.user = "nobody"
c, o, e = R.run("GET", "/api/settings")
check("login 404: PAGE crew-user-missing", c == 5 and "crew-user-missing" in e, e)
R.close()

R = Rig()
R.app.login_status = 500
c, o, e = R.run("GET", "/api/settings")
neg = jload(R.st("negcache.json"))
check("login 500: back off 60 s (not 15 min), exit 3", c == 3 and 55 <= neg["until"] - time.time() <= 61, "%s %s" % (c, neg))
c, o, e = R.run("GET", "/api/settings")
check("... within the backoff: no login", c == 3 and len(R.app.logins()) == 1, e)
neg["until"] = time.time() - 1
json.dump(neg, open(R.st("negcache.json"), "w"))
R.run("GET", "/api/settings")                      # 90 s later, still 500: the second login
neg = jload(R.st("negcache.json"))
neg["until"] = time.time() - 1
json.dump(neg, open(R.st("negcache.json"), "w"))
c, o, e = R.run("GET", "/api/settings")            # another 90 s: the cap stops the third
check("the cap: 2 logins per 900 s whatever the reason", c == 3 and "already logged in 2 times" in e and len(R.app.logins()) == 2, e)
R.app.login_status = None
R.close()

R = Rig()
R.app.limit = 0
c, o, e = R.run("GET", "/api/settings")
neg = jload(R.st("negcache.json"))
check("login 429: negative cache until RateLimit-Reset, no page", c == 3 and neg["status"] == 429 and "PAGE" not in e, e)
R.close()

# ═══════════════════════════ the lock (C7) ═══════════════════════════
R = Rig()
fd = os.open(R.st("lock"), os.O_RDWR | os.O_CREAT, 0o600)
fcntl.flock(fd, fcntl.LOCK_EX)
t0 = time.time()
c, o, e = R.run("GET", "/api/settings")
check("C7 lock held: waits LOCK_TIMEOUT_S then refuses with its own text, sends nothing",
      c == 3 and "waited 1 s for its credential lock" in e and not R.app.requests and 0.9 <= time.time() - t0 < 10, e)
fcntl.flock(fd, fcntl.LOCK_UN)
os.close(fd)
c, o, e = R.run("GET", "/api/settings")
check("... and works once the lock is free", c == 0, e)
R.close()

# ═══════════════════════════ files ═══════════════════════════
R = Rig()
R.run("GET", "/api/settings")
for f in ("token.json", "login-ledger.jsonl", "lock", "calls.log"):
    m = os.stat(R.st(f)).st_mode & 0o777
    check("state file %s is 0600" % f, m == 0o600, oct(m))
log = [json.loads(l) for l in open(R.st("calls.log"))]
check("the call log records caller, verb, canonical path and exit — no token",
      log[-1]["path"] == "/api/settings" and log[-1]["exit"] == 0 and "Bearer" not in open(R.st("calls.log")).read())
os.unlink(os.path.join(R.tmp, "env"))
os.unlink(R.st("token.json"))
c, o, e = R.run("GET", "/api/settings")
check("no env file: exit 3, says the setter has not run", c == 3 and "has not been set" in e, e)
R.close()

print("dt-api suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
