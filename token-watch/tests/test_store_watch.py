"""
token-watch — the store-size watch and the unit-failure alert. (B-TOKEN-WATCH-STORAGE P8)

Each block states its expectation first. The alert command is never run: a fake
`mint` records what would have been minted, and the argument list itself is
checked against the five flags `cmdAdd` requires.

Run:  python3 token-watch/tests/test_store_watch.py   (exit 0 = all pass)
"""

import os
import shutil
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-storewatch-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "ops"))

import alert_mint  # noqa: E402
import liveness  # noqa: E402
import store_watch  # noqa: E402
import unit_failed  # noqa: E402

PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


for d, n in (("births", 3000), ("due", 5000), ("cold", 2000)):
    os.makedirs(os.path.join(ROOT, d))
    open(os.path.join(ROOT, d, "x.jsonl"), "wb").write(b"x" * n)
TOTAL = 10000


def census():
    out = {}
    for base, dirs, files in os.walk(ROOT):
        for name in dirs + files:
            p = os.path.join(base, name)
            st = os.stat(p)
            out[p] = (st.st_size, st.st_mtime_ns)
    return out


def caps(warn, cap):
    liveness.STORE_CAP_WARN_BYTES = store_watch.STORE_CAP_WARN_BYTES = warn
    liveness.STORE_CAP_BYTES = store_watch.STORE_CAP_BYTES = cap


minted = []


def fake_mint(**kw):
    minted.append(kw)
    return True


# liveness.check() must never be reached: it would write state/ as root.
def _forbidden(*a, **k):
    raise AssertionError("store_watch called liveness.check()")


liveness.check = _forbidden

print("S1 expect: under the warn line -> exit 0, nothing minted")
caps(20000, 30000)
minted.clear()
check("S1 exit 0", store_watch.run(mint=fake_mint) == 0)
check("S1 nothing minted", minted == [], repr(minted))

print("S2 expect: between warn and cap -> one WARNING row keyed token-watch-store-warn, body says STANDING CONDITION")
caps(5000, 30000)
minted.clear()
before = census()
check("S2 exit 0", store_watch.run(mint=fake_mint) == 0)
check("S2 one mint", len(minted) == 1, repr(minted))
m = minted[0] if minted else {}
check("S2 severity warning", m.get("severity") == "warning")
check("S2 key token-watch-store-warn", m.get("dedupe_key") == "token-watch-store-warn")
check("S2 body names the standing condition", "STANDING CONDITION" in m.get("body", ""))
check("S2 body carries the split", "due:" in m.get("body", "") and "births:" in m.get("body", ""))
check("S2 the run wrote nothing in the store", census() == before)

print("S3 expect: over the cap -> one CRITICAL row keyed token-watch-store-over_cap (a separate key from warn)")
caps(1000, 5000)
minted.clear()
check("S3 exit 0", store_watch.run(mint=fake_mint) == 0)
check("S3 severity critical", minted and minted[0]["severity"] == "critical")
check("S3 key token-watch-store-over_cap", minted and minted[0]["dedupe_key"] == "token-watch-store-over_cap")

print("S4 expect: a failed mint -> exit 1 (an unfiled alert never looks filed)")
check("S4 exit 1", store_watch.run(mint=lambda **kw: False) == 1)

print("S5 expect: the argument list is the drift-script form: runuser deploy, npm, add, the five required flags, "
      "category health_check, no shell")
argv = alert_mint.mint_argv(severity="warning", dedupe_key="k", title="t", body="b")
check("S5 runs as deploy", argv[:4] == ["runuser", "-u", "deploy", "--"])
check("S5 is `system-alerts -- add`", "system-alerts" in argv and argv[argv.index("system-alerts") + 2] == "add")
for flag in ("--triggers-at", "--category", "--severity", "--title", "--body", "--dedupe-key"):
    check("S5 carries %s" % flag, flag in argv)
check("S5 category is health_check", argv[argv.index("--category") + 1] == "health_check")
check("S5 no shell in the list", not any(a in ("sh", "bash", "-c") for a in argv))
bad = False
try:
    alert_mint.mint_argv(severity="loud", dedupe_key="k", title="t", body="b")
except ValueError:
    bad = True
check("S5 an unknown severity is refused before running", bad)


class R:
    def __init__(self, rc):
        self.returncode, self.stdout, self.stderr = rc, "", "boom"


check("S6 a non-zero alert command is MINT_FAILED (False)",
      alert_mint.mint(severity="info", dedupe_key="k", title="t", body="b", run=lambda *a, **k: R(1)) is False)
check("S6 control: a zero exit is True",
      alert_mint.mint(severity="info", dedupe_key="k", title="t", body="b", run=lambda *a, **k: R(0)) is True)

print("U1 expect: a token-watch unit name mints one warning keyed per unit, with the journal lines in the body")
minted.clear()
rc = unit_failed.run("token-watch-cold-offbox.service", mint=fake_mint, journal=lambda u: "ERROR FILE KEPT: a.gz")
check("U1 exit 0", rc == 0)
check("U1 key per unit", minted and minted[0]["dedupe_key"] == "token-watch-unit-failed-token-watch-cold-offbox.service")
check("U1 body carries the journal", minted and "FILE KEPT: a.gz" in minted[0]["body"])
print("U2 expect: an unexpected unit name is refused (exit 2), nothing minted")
minted.clear()
check("U2 exit 2", unit_failed.run("sshd.service; rm -rf /", mint=fake_mint) == 2)
check("U2 nothing minted", minted == [])

shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
