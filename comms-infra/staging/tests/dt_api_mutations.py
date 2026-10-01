#!/usr/bin/env python3
"""Mutation controls for dt_api_tests.py: each mutation breaks ONE rule of the committed dt-api;
the suite must then FAIL (non-zero exit). A mutation whose text is not found is itself a failure,
so a mutation can never silently not apply. Judge by exit code."""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.path.join(HERE, "..", "dt-api")
BASE = open(SRC, encoding="utf-8").read()

MUTATIONS = [
    ("grammar case-sensitive", 'r"^/api/[A-Za-z0-9/_.:-]+$", re.IGNORECASE)', 'r"^/api/[A-Za-z0-9/_.:-]+$")'),
    ("no trailing-slash strip", 'if len(p) > 1 and p.endswith("/"):', 'if False:'),
    ("no lowercase for matching", "p = path.lower()", "p = path"),
    ("'.' segment allowed (C10)", 'if any(s in ("", ".", "..") for s in segs):', 'if any(s in ("",) for s in segs):'),
    ("a denylist entry dropped", '    "/api/database/status",', ''),
    ("prefix match only exact", 'if c == pre or c.startswith(pre + "/"):', 'if c == pre:'),
    ("rule 2 GET-only", "if c in WHOLE_ROUTE_DENY:", "if c in WHOLE_ROUTE_DENY and method == 'GET':"),
    ("query allowed on writes", 'if method != "GET":\n            raise Refused(TXT_MALFORMED % "a query is allowed on GET only")',
     'if False:\n            raise Refused(TXT_MALFORMED % "a query is allowed on GET only")'),
    ("a write allowed", "WRITE_ALLOW = ()", 'WRITE_ALLOW = (("POST", "/api/trading/start"),)'),
    ("cap raised to 3", "DTAPI_CAP = 2", "DTAPI_CAP = 3"),
    ("500 backoff = 15 min", "BACKOFF_500_S = 60", "BACKOFF_500_S = 900"),
    ("re-mint without verify (C6)", '    if vs == 401:\n        return "dead"', '    if True:\n        return "dead"'),
    ("no settings probe", '    if auth_passed(st):\n        return "route"', '    if False:\n        return "route"'),
    ("mint without the dtmint gate", 'if os.environ.get("SUDO_USER") != MINT_CALLER:', 'if False:'),
    ("mint reuse ignores age", "t - rec.get(\"issued_at\", 0) < MINT_REUSE_S", "True"),
    ("mint hands out a short token", "exp - _now() < MIN_EXP_LEFT_S:", "exp - _now() < 0:"),
    ("login 401 does not page", 'if st == 401:\n            page("crew-password-wrong"', 'if False:\n            page("crew-password-wrong"'),
    ("an X-Forwarded-For sent", 'hdrs = {"Accept": "application/json", "Connection": "close"}',
     'hdrs = {"Accept": "application/json", "Connection": "close", "X-Forwarded-For": "10.0.0.9"}'),
    ("no lock timeout refusal", "if _now() >= deadline:", "if False:"),
    ("runs as any account", "if me != EXPECT_USER:", "if False:"),
    ("the page is not sticky", '    if pg is not None and page_sticky(pg):', "    if False:"),
    ("Gate 1-1: login-failing floor dropped (a restart pages)", "    if run_start is not None and t - run_start >= LOGIN_FAILING_GAP_S:", "    if run_start is not None and t - run_start >= 0:"),
    ("Gate 1-1: login-failing ceiling restored (the daily mint never pages)", "    if run_start is not None and t - run_start >= LOGIN_FAILING_GAP_S:",
     "    if run_start is not None and LOGIN_FAILING_GAP_S <= t - run_start <= 3600:"),
    ("Gate 1-1: a success does not end the run", "        break                                          # a success, or a different cause: the run ends", "        continue"),
    ("Gate 1-1: login-failing sticky again", '"crew-role-missing", "login-malformed",', '"crew-role-missing", "login-failing", "login-malformed",'),
    ("Gate 1-1: crew-role-missing not sticky", '"crew-user-missing", "crew-role-missing", "login-malformed",', '"crew-user-missing", "login-malformed",'),
    ("Gate 1-1: a direct 403 is never probed", "    if st == 403:                                      # Gate 1-1", "    if False:                                      # Gate 1-1"),
    ("Gate 1-1: an unreadable page is written over", '    if isinstance(standing, dict) and standing.get("_unreadable"):', "    if False:"),
    ("Gate 1-1: the placeholder flag leaks into a page file", '    old = {k: v for k, v in old.items() if k != "_unreadable"}', "    pass"),
    ("r2: every page sticky", "    sticky = kind in STICKY_KINDS", "    sticky = True"),
    ("r2: a later page overwrites the first cause", "    return dict(old, later=later, sticky=page_sticky(old) or sticky)",
     '    return {"ts": now, "kind": kind, "detail": detail, "sticky": page_sticky(old) or sticky, "later": later}'),
    ("r3: a sticky cause does not outrank", "    if sticky and not page_sticky(old):", "    if False:"),
    ("r3: stickiness from the flag only", '    return bool(pg.get("sticky")) or pg.get("kind") in STICKY_KINDS', '    return bool(pg.get("sticky"))'),
    ("r3: an unreadable page is not sticky", '    return pg if isinstance(pg, dict) else {"kind": "unreadable-page", "sticky": True, "_unreadable": True}',
     '    return pg if isinstance(pg, dict) else None'),
    ("r3: an unexpected login status is retried", "    if st is not None and st < 500:\n        # r3", "    if False:\n        # r3"),
    ("r3: a negative-cache write failure escapes", "    except OSError as e:\n        sys.stderr.write(\"dt-api: WARNING", "    except ZeroDivisionError as e:\n        sys.stderr.write(\"dt-api: WARNING"),
    ("r3: a non-object login body raises", "    j = _json(b)\n    return j if isinstance(j, dict) else {}", "    return _json(b)"),
    ("r3: a handler 5xx reads as a failed probe", "    return status is not None and status not in (401, 403)", "    return status == 200"),
    ("r3: a probe 403 is not paged as no-role", '    if st == 403:\n        page_role_missing()', '    if False:\n        page_role_missing()'),
    ("r3: a closed stdout exits 3", "    except BrokenPipeError:\n        try:\n            os.dup2", "    except ZeroDivisionError:\n        try:\n            os.dup2"),
    ("r3: a page drops whatever token is cached", 'if isinstance(cur, dict) and cur.get("accessToken") == drop_token:', "if True:"),
    ("Gate 1-1 r4: a lock held before the 403 probe escapes as 'Nothing was sent'",
     "        except SystemExit:\n            sys.stderr.write(\"dt-api: NOTE — your request WAS sent once and the app answered HTTP 403 \"",
     "        except ZeroDivisionError:\n            sys.stderr.write(\"dt-api: NOTE — your request WAS sent once and the app answered HTTP 403 \""),
    ("Gate 1-1 r4: the login-failing page reads as continuous failure",
     "with no successful login between them — attempts, not continuous monitoring; there may \"",
     "with no successful login between them — there may \""),
    ("r3: '/' refused in a query",'QUERY_RE = re.compile(r"^[A-Za-z0-9_.=&,:/-]*$")', 'QUERY_RE = re.compile(r"^[A-Za-z0-9_.=&,:-]*$")'),
    ("r2: a sent-and-answered request exits 3", "            raise SystemExit(5 if e.code == 5 else 1)", "            raise SystemExit(e.code)"),
    ("r2: a 200 without expiry is not a page", '        if not tok or not isinstance(cl.get("exp"), (int, float)):', "        if not tok:"),
    ("mint trusts the signature-only verify", '            vs, _, _ = app_request("GET", "/api/settings", token=rec["accessToken"],',
     '            vs, _, _ = app_request("GET", "/api/auth/verify", token=rec["accessToken"],'),
    ("an empty bucket is ignored", "        if rem == \"0\":\n            # C4", "        if False:\n            # C4"),
    ("repeated 5xx never pages", "    if run_start is not None and t - run_start >= LOGIN_FAILING_GAP_S:", "    if False:"),
    ("a missing row keeps its dead token", "not found' — the crew row has been deleted or replaced\", drop_token=token)",
     "not found' — the crew row has been deleted or replaced\")"),
    ("a header error prints the token", "    except ValueError:\n        # http.client", "    except ZeroDivisionError:\n        # http.client"),
]

SUITE = os.path.join(HERE, "dt_api_tests.py")
# ⛔ A MUTANT IS ONLY "KILLED" IF THE UNMUTATED SUITE PASSES. A suite that cannot run (a syntax
#    error, a missing import) fails for every mutant and reads as 20/20 killed — measured once,
#    on this file's first run. So the baseline must pass first, or nothing below means anything.
b = subprocess.run([sys.executable, SUITE], env={"PATH": "/usr/bin:/bin", "DT_API_SRC": SRC},
                   capture_output=True, text=True, timeout=900)
if b.returncode != 0 or "0 failed" not in b.stdout:
    print("BASELINE DOES NOT PASS — mutation results would be meaningless:\n" + b.stdout[-800:] + b.stderr[-800:])
    sys.exit(2)
print("baseline: " + b.stdout.strip().splitlines()[-1])

bad = 0
for name, old, new in MUTATIONS:
    n = BASE.count(old)
    if n != 1:
        print("MUTATION NOT APPLIED (%d matches): %s" % (n, name))
        bad += 1
        continue
    d = tempfile.mkdtemp(prefix="dtapi-mut-")
    p = os.path.join(d, "dt-api")
    open(p, "w", encoding="utf-8").write(BASE.replace(old, new))
    r = subprocess.run([sys.executable, SUITE],
                       env={"PATH": "/usr/bin:/bin", "DT_API_SRC": p},
                       capture_output=True, text=True, timeout=900)
    last = (r.stdout.strip().splitlines() or ["?"])[-1]
    if r.returncode == 0:
        print("SURVIVED (the suite did not notice): %s" % name)
        bad += 1
    elif not re.match(r"^dt-api suite: \d+ passed, [1-9]\d* failed$", last):
        # ⛔ a CRASH is not a kill: it proves the suite broke, not that a check caught the mutant
        print("CRASHED, not a clean kill: %s :: %s" % (name, (r.stderr.strip().splitlines() or ["?"])[-1]))
        bad += 1
    else:
        print("killed: %-34s %s" % (name, last))
print("mutations: %d applied and killed, %d problems" % (len(MUTATIONS) - bad, bad))
sys.exit(1 if bad else 0)
