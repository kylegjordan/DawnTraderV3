"""
token-watch — the boundary between the collector and ops/. (B-TOKEN-WATCH-STORAGE P8)

`test_pipeline.py` holds the COLLECTOR (the top-level modules) to exactly one
outbound module, providers.py, because that is where the provider budget gate
and the pacer are. The ops/ jobs (the off-box upload to Backblaze B2, the
store-size watch, the unit-failure alert) reach the network or run commands for
reasons that have nothing to do with the provider budget, so they live outside
that rule. This suite is what keeps that from being an escape hatch:

  1. no ops/ module imports a provider- or budget-facing collector module;
  2. no collector module imports anything from ops/;
  3. the only network host written in ops/ is Backblaze's.
Each check is shown able to fail on a planted positive before its pass counts.

Run:  python3 token-watch/tests/test_ops_boundary.py   (exit 0 = all pass)
"""

import os
import re
import sys

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
OPS = os.path.join(PKG, "ops")
# An ALLOWLIST (Langston, Step 4 record (d)): the collector modules ops/ may import. Anything else from the
# collector is refused by default, so a new collector module is outside ops/ until it is argued in here.
ALLOWED_FOR_OPS = frozenset({"config", "tier", "liveness"})
OPS_MODULES = sorted(f[:-3] for f in os.listdir(OPS) if f.endswith(".py"))
COLLECTOR = frozenset(f[:-3] for f in os.listdir(PKG) if f.endswith(".py"))
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


def imports(text):
    out = set()
    for line in text.splitlines():
        m = re.match(r"\s*(?:from\s+([\w.]+)\s+import|import\s+([\w.]+))", line)
        if m:
            out.add((m.group(1) or m.group(2)).split(".")[0])
    return out


def ops_violations(texts, collector=COLLECTOR):
    return sorted("%s imports %s" % (n, i) for n, t in texts.items()
                  for i in (imports(t) & collector) - ALLOWED_FOR_OPS)


def collector_violations(texts):
    return sorted("%s imports %s" % (n, i) for n, t in texts.items() for i in imports(t) & (set(OPS_MODULES) | {"ops"}))


HOST_RE = re.compile(r"https?://([a-z0-9.-]+)", re.I)


def foreign_hosts(texts):
    return sorted({h for t in texts.values() for h in HOST_RE.findall(t)} - {"api.backblazeb2.com"})


ops_texts = {f: open(os.path.join(OPS, f), encoding="utf-8").read() for f in os.listdir(OPS) if f.endswith(".py")}
coll_texts = {f: open(os.path.join(PKG, f), encoding="utf-8").read() for f in os.listdir(PKG) if f.endswith(".py")}

print("expect: ops/ holds the four jobs")
check("ops/ modules", OPS_MODULES == ["alert_mint", "cold_offbox", "store_watch", "unit_failed"], repr(OPS_MODULES))

print("control: a planted `import providers` in an ops module IS detected")
check("control 1", ops_violations({"x.py": "import providers\n"}) == ["x.py imports providers"])
check("control 1b: a collector module NOT on any list (summary) is refused too",
      ops_violations({"x.py": "from summary import build\n"}) == ["x.py imports summary"])
check("control 1c: an allowed one (config) passes", ops_violations({"x.py": "from config import ROOT\n"}) == [])
print("expect: ops/ imports nothing from the collector except config, tier and liveness")
check("1 ops/ stays off the provider path", ops_violations(ops_texts) == [], repr(ops_violations(ops_texts)))

print("control: a planted `from cold_offbox import run` in a collector module IS detected")
check("control 2", collector_violations({"y.py": "from cold_offbox import run\n"}) == ["y.py imports cold_offbox"])
print("expect: no collector module imports ops/")
check("2 the collector never imports ops/", collector_violations(coll_texts) == [], repr(collector_violations(coll_texts)))

print("control: a planted foreign URL IS detected")
check("control 3", foreign_hosts({"z.py": 'URL = "https://example.com/x"'}) == ["example.com"])
print("expect: the only host written in ops/ is api.backblazeb2.com")
check("3 ops/ names only Backblaze", foreign_hosts(ops_texts) == [], repr(foreign_hosts(ops_texts)))

print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
