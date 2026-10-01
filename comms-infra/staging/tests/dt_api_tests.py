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
    "/api/strategic/recommendations", "/api/diagnostics/tec/costs", "/api/diagnostics/tec/costs/:symbol",
    "/api/test/kraken-balance", "/api/test/finnhub-feed", "/api/learning/fallback-test"}
check("the shipped job denylist is exactly the census (26)", set(JOBS) == EXPECTED_JOBS and len(JOBS) == 26,
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
refused(R, ["GET", "/api/settings?a=b'c"], MAL + "the query must match ^[A-Za-z0-9_.=&,:/-]*$", "rule 1 bad query")
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
c, o, e = R.run("GET", "/api/market/ticker?symbol=BTC/USD")
check("r3: a query may carry '/' (?symbol=BTC/USD)", c == 0 and json.loads(o)["path"] == "/api/market/ticker?symbol=BTC/USD", e)
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
check("a route's own 401 with a good token: exit 1, no re-mint, the plain result line", c == 1 and len(R.app.logins()) == 1
      and "dt-api: HTTP 401 GET /api/some/route" in e and "NOTE" not in e and "FAILED" not in e, e)
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
check("... and the token it cannot use any more is dropped from the cache", not os.path.exists(R.st("token.json")))
c, o, e = R.run("GET", "/api/settings")
check("... the next call makes NO login while the page stands (sticky)", c == 5 and "PAGE STANDING" in e and len(R.app.logins()) == n0, e)
if os.path.exists(R.st("page.json")):
    os.unlink(R.st("page.json"))
R.app.user_missing = False
rows = R.ledger()                                  # 15 minutes later: the cap's window has passed
with open(R.st("login-ledger.jsonl"), "w") as fh:
    for x in rows:
        x["ts"] -= 1000
        fh.write(json.dumps(x) + chr(10))
c, o, e = R.run("GET", "/api/settings")
check("... once a person clears the page, one fresh login and served", c == 0 and len(R.app.logins()) == n0 + 1, e)
R.close()

# mint: reuse is checked through a DB-backed route, never the signature-only /auth/verify
R = Rig()
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
R.app.user_missing = True
n0 = len(R.app.logins())
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
check("mint does NOT hand out a token the app refuses after its user lookup (verify alone says 200)",
      c == 5 and "crew-user-missing" in e and o == "" and len(R.app.logins()) == n0, "%s %s %r" % (c, e, o[:40]))
R.close()

# the dead-token path: the request WAS sent once; a failed re-mint must say so and return its body
R = Rig()
R.run("GET", "/api/settings")
R.app.revoke_all()
R.app.login_status = 500
c, o, e = R.run("GET", "/api/other/route")
check("a failed re-mint says the request WAS sent, hands back the first 401 body, and exits 1 (answered)",
      c == 1 and "WAS sent once" in e and "Invalid or expired token" in o, "%s %r %s" % (c, o[:60], e))
R.close()

# a token that breaks the HTTP header must never be printed
R = Rig()
R.run("GET", "/api/settings")
tok = jload(R.st("token.json"))
bad = tok["accessToken"] + "\nSECRETPART"
tok["accessToken"] = bad
json.dump(tok, open(R.st("token.json"), "w"))
c, o, e = R.run("GET", "/api/settings")
check("an invalid header value exits 3 and prints no token", c == 3 and "SECRETPART" not in e + o and tok["accessToken"][:20] not in e + o, e)
check("... caught at the request itself (the named layer), not only by the catch-all", "a request header or the path was invalid" in e, e)
R.close()

# r2: a token-refused page (a DB blip, which may heal) is NOT sticky; the FIRST cause is kept
R = Rig()
R.run("GET", "/api/settings")
R.app.db_ok = False
c, o, e = R.run("GET", "/api/settings")
R.app.db_ok = True
R.app.revoke_all()
c2, o2, e2 = R.run("GET", "/api/settings")
check("r2: after a token-refused page the next login is NOT blocked", c == 5 and c2 == 0 and len(R.app.logins()) == 2, e2)
R.app.user_missing = True
R.run("GET", "/api/settings")
pg = jload(R.st("page.json"))
check("r3: a later STICKY cause outranks a standing non-sticky page: it becomes the kind, the old one moves to later",
      pg.get("kind") == "crew-user-missing" and any("token-refused" in x for x in pg.get("later", []))
      and pg.get("sticky") is True, str(pg))
R.close()
R = Rig()                                           # a cached token, so a call can page under a standing page
R.run("GET", "/api/settings")
json.dump({"ts": "t0", "kind": "crew-password-wrong", "detail": "d", "sticky": True}, open(R.st("page.json"), "w"))
R.app.db_ok = False
c, o, e = R.run("GET", "/api/other")
pg = jload(R.st("page.json"))
check("r2: under a standing STICKY page a later non-sticky cause is appended and the first kind kept",
      c == 5 and "token-refused" in e and pg.get("kind") == "crew-password-wrong" and pg.get("ts") == "t0"
      and pg.get("later", [""])[-1].endswith("token-refused"), "%s %s" % (e, pg))
R.close()

# r2: a 200 login that is not usable pages instead of looping
R = Rig()
def issue_noexp(role):
    tok = '%s.%s.sigX' % (fakeapp._b64({'alg': 'HS256'}), fakeapp._b64({'id': 'u1', 'role': role}))
    R.app.tokens[tok] = {'exp': time.time() + 99999, 'revoked': False}
    return tok
R.app.issue = issue_noexp
c, o, e = R.run("GET", "/api/settings")
check("r2: a login answering 200 without a readable expiry PAGEs login-malformed", c == 5 and "login-malformed" in e, e)
R.close()

# refusals are logged (the audit trail)
R = Rig()
R.run("GET", "/api/user/profile")
log = [json.loads(l) for l in open(R.st("calls.log"))]
check("a refusal is in the call log with exit 2", log and log[-1]["verb"] == "refused" and log[-1]["exit"] == 2, str(log[-1:]))
R.close()

# C4: an empty bucket after a successful login is honoured before the next login is sent
R = Rig()
R.app.limit = 1
c, o, e = R.run("GET", "/api/settings")
neg = jload(R.st("negcache.json"))
check("RateLimit-Remaining 0 after a login -> no login until the reset", c == 0 and neg.get("status") == 200
      and neg.get("until", 0) > time.time() + 800, str(neg))
R.close()

# ═══════════════════════════ login failures, negative cache, cap ═══════════════════════════
R = Rig()
R.app.password = "something-else"
c, o, e = R.run("GET", "/api/settings")
check("login 401: PAGE crew-password-wrong + negative cache", c == 5 and "crew-password-wrong" in e, e)
c, o, e = R.run("GET", "/api/settings")
check("... and the next call refuses WITHOUT contacting the app (the page stands)", c == 5 and "PAGE STANDING" in e and len(R.app.logins()) == 1, e)
neg = jload(R.st("negcache.json"))
neg["until"] = time.time() - 1
json.dump(neg, open(R.st("negcache.json"), "w"))
c, o, e = R.run("GET", "/api/settings")
check("... and still none after the negative cache expires: the known-bad password is not retried",
      c == 5 and len(R.app.logins()) == 1, e)
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
c, o, e = R.run("GET", "/api/settings")            # 60 s later, still 500 (an app restart): the second login
check("r2: two 5xx logins a minute apart (a restart) do NOT page", c == 3 and "PAGE" not in e and len(R.app.logins()) == 2, e)
rows = R.ledger()                                  # ... 15 minutes later, still failing
with open(R.st("login-ledger.jsonl"), "w") as fh:
    for x in rows:
        x["ts"] -= 1000
        fh.write(json.dumps(x) + chr(10))
neg = jload(R.st("negcache.json"))
neg["until"] = time.time() - 1
json.dump(neg, open(R.st("negcache.json"), "w"))
c, o, e = R.run("GET", "/api/settings")
check("two 5xx logins over 10 minutes apart, no success between, PAGE login-failing", c == 5 and "login-failing" in e and len(R.app.logins()) == 3, e)
neg = jload(R.st("negcache.json"))
neg["until"] = time.time() - 1
json.dump(neg, open(R.st("negcache.json"), "w"))
c, o, e = R.run("GET", "/api/settings")            # after the backoff: login-failing is NOT sticky (Gate 1-1)
check("Gate 1-1: login-failing is NOT sticky — after the backoff the next call logs in again (and pages again)",
      c == 5 and "login-failing" in e and len(R.app.logins()) == 4 and "PAGE STANDING" not in e, e)
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

# ═══════════════════════════ round 3 ═══════════════════════════
# S1 as r3 built it ("two 5xx logins over an hour apart do NOT page") was a REGRESSION — Langston,
# Gate 1-1 BLOCKER-1: nothing logged in between, so the heal was never observed (#453). It now pages.
R = Rig()
R.app.login_status = 500
R.run("GET", "/api/settings")
rows = R.ledger()
with open(R.st("login-ledger.jsonl"), "w") as fh:
    for x in rows:
        x["ts"] -= 5000                              # the first failure is ~83 minutes old
        fh.write(json.dumps(x) + chr(10))
os.unlink(R.st("negcache.json"))
c, o, e = R.run("GET", "/api/settings")
check("Gate 1-1: two 5xx logins 83 min apart, nothing between, DO page login-failing (r3's ceiling reversed)",
      c == 5 and "login-failing" in e and len(R.app.logins()) == 2, e)
R.close()

# S1: a login answer that is none of 200/401/404/429/5xx pages at once, sticky, and is not retried
for status in (400, 403, 302):
    R = Rig()
    R.app.login_status = status
    c, o, e = R.run("GET", "/api/settings")
    pg = jload(R.st("page.json"))
    check("r3 S1: login %d -> PAGE login-unexpected, sticky" % status,
          c == 5 and "login-unexpected" in e and pg.get("kind") == "login-unexpected" and pg.get("sticky") is True, e)
    os.unlink(R.st("negcache.json")) if os.path.exists(R.st("negcache.json")) else None
    c, o, e = R.run("GET", "/api/settings")
    check("r3 S1: ... and no second login while it stands (%d)" % status,
          c == 5 and "PAGE STANDING" in e and len(R.app.logins()) == 1, e)
    R.close()

# S2: a hand-written page carries no flag; its KIND alone must make it sticky
R = Rig()
json.dump({"ts": "2026-09-30T00:00:00Z", "kind": "crew-password-wrong", "detail": "by hand"},
          open(R.st("page.json"), "w"))
c, o, e = R.run("GET", "/api/settings")
check("r3 S2: a hand-written sticky-kind page (no flag) blocks the login", c == 5 and "PAGE STANDING" in e
      and "crew-password-wrong" in e and not R.app.logins(), e)
open(R.st("page.json"), "w").write("{not json")
c, o, e = R.run("GET", "/api/settings")
check("r3: an UNREADABLE page file blocks the login (fail closed)", c == 5 and "PAGE STANDING" in e and not R.app.logins(), e)
R.close()

# minor: a negative-cache write that fails must not stop the page after it
R = Rig()
os.makedirs(R.st("negcache.json"))
R.app.password = "something-else"
c, o, e = R.run("GET", "/api/settings")
check("r3: an unwritable negative cache still PAGES crew-password-wrong (not an internal error)",
      c == 5 and "crew-password-wrong" in e and "internal" not in e, e)
R.close()

# minor: a non-object login body pages, never a traceback
R = Rig()
R.app.login_body = [1, 2]
c, o, e = R.run("GET", "/api/settings")
check("r3: a 200 login whose body is a JSON list PAGEs login-malformed", c == 5 and "login-malformed" in e, e)
R.close()

# minor: the probe asks ONLY whether authenticateToken passed — a settings HANDLER 500 is not a dead token
R = Rig()
R.run("GET", "/api/settings")
R.app.route_401.add("/api/some/route")
R.app.route_500.add("/api/settings")
c, o, e = R.run("GET", "/api/some/route")
check("r3: route 401 + the probe's handler 500 -> the token is good: exit 1, no re-mint",
      c == 1 and len(R.app.logins()) == 1 and "FAILED" not in e, e)
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
check("r3: a settings handler 500 does not block the daily mint (the token is reused)",
      c == 0 and json.loads(o)["reused"] is True and len(R.app.logins()) == 1, e)
R.app.route_500.clear()
R.app.no_role = True                                # every authenticated route now answers 403 (routes.ts:226)
n0 = len(R.app.logins())
c, o, e = R.run("GET", "/api/some/route")
pg = jload(R.st("page.json"))
check("Gate 1-1: a DIRECT call's 403 from a role-less row PAGEs crew-role-missing (sticky), body on stdout, no login",
      c == 5 and "crew-role-missing" in e and "WAS sent once" in e and "no role assigned" in o
      and pg.get("kind") == "crew-role-missing" and pg.get("sticky") is True and len(R.app.logins()) == n0,
      "%s %r %s %s" % (c, o[:60], e, pg))
if os.path.exists(R.st("page.json")):            # absent when the check above failed: fail cleanly, never crash
    os.unlink(R.st("page.json"))
c, o, e = R.run("mint", env={"SUDO_USER": "dtmint"})
pg = jload(R.st("page.json"))
check("Gate 1-1: the mint's probe 403 (a row with no role) PAGEs crew-role-missing, hands out nothing",
      c == 5 and o == "" and pg.get("kind") == "crew-role-missing" and "403" in pg.get("detail", ""), "%s %s" % (e, pg))
R.app.revoke_all()                                  # force the next call to need a login
c, o, e = R.run("GET", "/api/settings")
check("Gate 1-1: while crew-role-missing stands NO login is made (sticky)",
      c == 5 and "PAGE STANDING" in e and len(R.app.logins()) == n0, e)
R.close()

# Gate 1-1: a route's OWN 403 (the row HAS a role) is the app's answer — exit 1, no page
R = Rig()
R.run("GET", "/api/settings")
R.app.route_403.add("/api/guarded/route")
c, o, e = R.run("GET", "/api/guarded/route")
check("Gate 1-1: a route's own 403 with a role-bearing row: exit 1, no page", c == 1 and "HTTP 403" in e
      and not os.path.exists(R.st("page.json")), e)
R.close()


# Gate 1-1 r4 BLOCKER-1 (Langston's repro, lifted): the lock is taken AFTER the request was sent and
# answered 403 but BEFORE the role probe asks for it. The answer must come back once, exit 1, with no
# "Nothing was sent" as the last word and no page — never the lock's own exit 3 with an empty stdout.
class SlowSet(set):
    """`path in route_403` sleeps for the target path only, so the lock can be taken mid-flight."""

    def __init__(self, target, delay):
        set.__init__(self)
        self.target, self.delay = target, delay

    def __contains__(self, p):
        if p == self.target:
            time.sleep(self.delay)
            return True
        return False


import threading  # noqa: E402

# (one case: the probe never runs, so the row's role cannot matter)
R = Rig()
R.run("GET", "/api/settings")
R.app.route_403 = SlowSet("/api/guarded/route", 3.0)
lfd = os.open(R.st("lock"), os.O_RDWR | os.O_CREAT, 0o600)
taken = threading.Event()

def _grab():
    time.sleep(1.5)                                 # the request is in flight, the app is sleeping
    fcntl.flock(lfd, fcntl.LOCK_EX)
    taken.set()

th = threading.Thread(target=_grab)
th.start()
c, o, e = R.run("GET", "/api/guarded/route")
th.join()
if taken.is_set():
    fcntl.flock(lfd, fcntl.LOCK_UN)
os.close(lfd)
check("Gate 1-1 r4 BLOCKER-1: lock held between a sent 403 and its role probe: exit 1, the body "
      "once, a NOTE that it WAS sent, no page",
      taken.is_set() and c == 1 and o.count("this route's own rule refuses") == 1
      and "WAS sent once" in e and "did not run" in e
      and not os.path.exists(R.st("page.json")), "%s %r %s" % (c, o, e))
R.close()

# minor: a reader that goes away does not turn an answered request into exit 3
R = Rig()
R.run("GET", "/api/settings")
p = subprocess.Popen([sys.executable, R.bin, "GET", "/api/settings"], stdin=subprocess.DEVNULL,
                     stdout=subprocess.PIPE, stderr=subprocess.PIPE, env={"PATH": "/usr/bin:/bin"})
p.stdout.close()                                    # `| head -0`: nobody will read the body
err = p.stderr.read().decode()
rc = p.wait(timeout=30)
check("r3: a closed stdout keeps the app's exit code (0), not 3", rc == 0 and "HTTP 200" in err, "%s %s" % (rc, err))
R.close()

# minor: a page drops the cached token ONLY if it is still the dead one (in-process: the module)
from importlib.machinery import SourceFileLoader  # noqa: E402
import importlib.util  # noqa: E402
R = Rig()
spec = importlib.util.spec_from_loader("dtapi_mod", SourceFileLoader("dtapi_mod", R.bin))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
json.dump({"accessToken": "NEW-TOKEN", "exp": time.time() + 9e5}, open(R.st("token.json"), "w"))
_stderr, sys.stderr = sys.stderr, open(os.devnull, "w")
try:
    M.page("crew-user-missing", "test", drop_token="DEAD-TOKEN")
except SystemExit:
    pass
kept = os.path.exists(R.st("token.json"))
try:
    M.page("crew-user-missing", "test", drop_token="NEW-TOKEN")
except SystemExit:
    pass
sys.stderr = _stderr
check("r3: a page keeps a token another caller minted meanwhile, and drops the dead one",
      kept and not os.path.exists(R.st("token.json")))
R.close()

# Gate 1-1 r5 BLOCKER-2 (Langston): the direct-403 branch writes its crew-role-missing page UNDER
# the lock. In-process, so the write itself can be watched: page_write is wrapped to ask, at the
# moment of writing, whether the credential lock is held (flock is per open file — a second open
# of the lock file conflicts with dt-api's own, in the same process).
R = Rig()
R.run("GET", "/api/settings")                       # a cached token, so the call goes straight out
R.app.no_role = True                                # the call AND the probe answer the no-role 403
spec = importlib.util.spec_from_loader("dtapi_mod2", SourceFileLoader("dtapi_mod2", R.bin))
M = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M)
held_at_write = []
_orig_pw = M.page_write


def _watch_pw(*a, **k):
    fd = os.open(M.LOCK_FILE, os.O_RDWR)
    try:
        fcntl.flock(fd, fcntl.LOCK_EX | fcntl.LOCK_NB)
        fcntl.flock(fd, fcntl.LOCK_UN)
        held_at_write.append(False)
    except OSError:
        held_at_write.append(True)
    finally:
        os.close(fd)
    return _orig_pw(*a, **k)


M.page_write = _watch_pw
import io  # noqa: E402
_out, _err = sys.stdout, sys.stderr
sys.stdout, sys.stderr = io.TextIOWrapper(io.BytesIO()), open(os.devnull, "w")
code = None
try:
    M.do_call(M.parse(["GET", "/api/guarded/route"]))
except SystemExit as e:
    code = e.code
finally:
    sys.stdout.flush()
    body = sys.stdout.buffer.getvalue()
    sys.stdout, sys.stderr = _out, _err
check("Gate 1-1 r5 BLOCKER-2: the direct-403 page is written WHILE the lock is held, exit 5, body once",
      held_at_write == [True] and code == 5 and body.count(b"no role assigned") == 1,
      "%s %s %r" % (held_at_write, code, body[:80]))
R.close()

# ═══════════════════════════ Gate 1-1 (Langston, 2026-10-01) ═══════════════════════════
def ledger_rows(rig, rows):
    with open(rig.st("login-ledger.jsonl"), "w") as fh:
        for x in rows:
            fh.write(json.dumps(dict({"who": "mint", "phase": "result", "bucket": "loopback"}, **x)) + chr(10))


# BLOCKER-1: the daily mint's two failures are 24 h apart — that IS "the login is failing"
R = Rig()
now = time.time()
ledger_rows(R, [{"ts": now - 86400, "status": 503}])
R.app.login_status = 500
c, o, e = R.run("GET", "/api/settings")
pg = jload(R.st("page.json"))
check("Gate 1-1 BLOCKER-1: two failed logins 24 h apart, nothing between, PAGE login-failing",
      c == 5 and "login-failing" in e, e)
check("Gate 1-1 r4 FINDING-2: the login-failing page says ATTEMPTS spanning M min, not continuous failure",
      "2 loopback login attempts spanning 1440 min" in pg.get("detail", "")
      and "not continuous monitoring" in pg.get("detail", ""), pg)
R.close()

# ... but a success between them ends the run: no page
R = Rig()
now = time.time()
ledger_rows(R, [{"ts": now - 90000, "status": 503}, {"ts": now - 86400, "status": 200}])
R.app.login_status = 500
c, o, e = R.run("GET", "/api/settings")
check("Gate 1-1: a success between two failures ends the run: no page, exit 3",
      c == 3 and "PAGE" not in e and not os.path.exists(R.st("page.json")), e)
R.close()

# FINDING-2: a page.json that cannot be read is NEVER written over; the new cause goes beside it
R = Rig()
R.run("GET", "/api/settings")                       # a cached token, so the call reaches the 401 path
garbage = b'{"kind": "crew-password-wrong", "detail": "trunc'
open(R.st("page.json"), "wb").write(garbage)
R.app.db_ok = False
c, o, e = R.run("GET", "/api/other")
side = [f for f in os.listdir(os.path.join(R.tmp, "state")) if f.startswith("page.json.unreadable.")]
sp = jload(os.path.join(R.tmp, "state", side[0])) if side else {}
check("Gate 1-1 FINDING-2: an unreadable page.json is left byte-for-byte, the new cause is in a side file named on stderr",
      c == 5 and open(R.st("page.json"), "rb").read() == garbage and len(side) == 1
      and sp.get("kind") == "token-refused" and "NOT written over" in e and side[0] in e,
      "%s %s %s %s" % (c, side, sp, e))
R.close()

# ... and the placeholder's internal flag never reaches a page file (the setter writes page_merge's
#     output directly — a persisted flag would make a readable page.json read as unreadable forever)
R = Rig()
spec = importlib.util.spec_from_loader("dtapi_mod2", SourceFileLoader("dtapi_mod2", R.bin))
M2 = importlib.util.module_from_spec(spec)
spec.loader.exec_module(M2)
open(R.st("page.json"), "wb").write(b"not json")
merged = M2.page_merge(M2.page_standing(), "setter-restored", "d", True)
check("Gate 1-1: page_merge never emits the placeholder's _unreadable flag", "_unreadable" not in merged
      and merged.get("sticky") is True, str(merged))
R.close()

print("dt-api suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
