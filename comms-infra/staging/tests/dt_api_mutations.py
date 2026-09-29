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
    ("no settings probe", '    if st == 200:\n        return "route"', '    if False:\n        return "route"'),
    ("mint without the dtmint gate", 'if os.environ.get("SUDO_USER") != MINT_CALLER:', 'if False:'),
    ("mint reuse ignores age", "t - rec.get(\"issued_at\", 0) < MINT_REUSE_S", "True"),
    ("mint hands out a short token", "exp - _now() < MIN_EXP_LEFT_S:", "exp - _now() < 0:"),
    ("login 401 does not page", 'if st == 401:\n            page("crew-password-wrong"', 'if False:\n            page("crew-password-wrong"'),
    ("an X-Forwarded-For sent", 'hdrs = {"Accept": "application/json", "Connection": "close"}',
     'hdrs = {"Accept": "application/json", "Connection": "close", "X-Forwarded-For": "10.0.0.9"}'),
    ("no lock timeout refusal", "if _now() >= deadline:", "if False:"),
    ("runs as any account", "if me != EXPECT_USER:", "if False:"),
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
