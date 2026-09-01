"""
token-watch — tests for the sampling, death classification, tiering and shed
plumbing. Every block carries a positive control.

No network. Where a provider call is exercised it is exercised through the
budget gate, which refuses BEFORE any socket is opened — so this suite proves
the gate is in front of the network rather than beside it.
"""

import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-pipe-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
import providers  # noqa: E402
import receiver  # noqa: E402
import store  # noqa: E402
import tier  # noqa: E402
from config import CONTROL_INCLUSION_P, LIQUIDITY_AUDIT_CARVE  # noqa: E402
from follow_up import classify_death  # noqa: E402

UTC = timezone.utc
FAILURES = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f" :: {detail}"))
    if not cond:
        FAILURES.append(name)


def section(t):
    print(f"\n=== {t} ===")


store.ensure_dirs()
# ⛔ ANCHORED TO THE CURRENT MONTH, NOT A FIXED DATE. The credit budget is
#    accounted PER CALENDAR MONTH, and block 4 injects spend at T0 then calls
#    `pool_liquidity()` with NO `now` -- so it queries the REAL clock. With a
#    hard-coded August T0 the two fell into different months the moment
#    September began, spend read as 0, and the gate correctly allowed a call
#    the test expected it to refuse. GREEN ALL AUGUST, RED AT MIDNIGHT.
# ★ Not a code regression -- a test pinned to a date, in a suite whose
#   subject is a MONTHLY budget. The bomb had a monthly timer on it.
_now = datetime.now(UTC)
T0 = _now.replace(day=min(_now.day, 28), hour=12, minute=0, second=0, microsecond=0)


# ─────────────────────────────────────────────────────────────────────────────
section("1. TRAIT DEFINITION — fixed before data, and it does not narrow")
# ─────────────────────────────────────────────────────────────────────────────
check("a social channel makes a carrier",
      receiver.is_trait_carrier({"telegram": True}, 0.5))
check("size above the platform default makes a carrier",
      receiver.is_trait_carrier({}, 2.0))
check("POSITIVE CONTROL: neither makes a NON-carrier",
      not receiver.is_trait_carrier({"telegram": False}, 0.5),
      "if this passed too, the predicate would be a constant")
check("a non-numeric size does not crash or silently qualify",
      not receiver.is_trait_carrier({}, "not-a-number"))


# ─────────────────────────────────────────────────────────────────────────────
section("2. CONTROL ARM — deterministic, auditable, and at the stated rate")
# ─────────────────────────────────────────────────────────────────────────────
check("membership is REPRODUCIBLE across calls",
      receiver.in_control_sample("MINT_X") == receiver.in_control_sample("MINT_X"),
      "an RNG would make the control arm unauditable after the fact")

mints = [f"MINT_{i}" for i in range(20000)]
selected = sum(1 for m in mints if receiver.in_control_sample(m))
rate = selected / len(mints)
check("realised rate is within 25% of the design probability",
      abs(rate - CONTROL_INCLUSION_P) < CONTROL_INCLUSION_P * 0.25,
      f"realised={rate:.5f} design={CONTROL_INCLUSION_P:.5f}")
check("POSITIVE CONTROL: selection is not everyone and not nobody",
      0 < selected < len(mints), f"selected={selected}")

# A carrier is followed for being a carrier, not by the sample draw.
followed, reason = receiver.follow_decision("MINT_Y", {"website": True}, 0.1)
check("carriers are followed with reason 'trait_carrier'",
      followed and reason == "trait_carrier", reason)
non = [m for m in mints[:300] if not receiver.in_control_sample(m)][0]
followed2, reason2 = receiver.follow_decision(non, {}, 0.1)
# The control draw NO LONGER happens at birth (Kyle, 2026-08-31): at birth only
# SIZE is knowable, so a non-carrier is DEFERRED, not assigned to an arm. The
# arm is decided once, at the first sweep, when the socials answer exists.
# EVERY LAUNCH IS FOLLOWED (Amendment 8, Kyle 2026-09-01). This asserted the
# opposite while the arm decided who was observed. The flag is now True for
# everything and the REASON carries the arm -- so what is worth asserting is
# that the two are still DISTINGUISHABLE, which is the next check.
check("a non-carrier IS followed at birth -- coverage is not conditional",
      followed2 is True, (followed2, reason2))
check("* and it is DEFERRED, not assigned - not-decided-yet and decided-not-to "
      "are different facts",
      reason2 == "deferred", reason2)


# ─────────────────────────────────────────────────────────────────────────────
section("3. DEATH CLASSIFICATION — and it REFUSES to guess")
# ─────────────────────────────────────────────────────────────────────────────
check("alive returns no class", classify_death({"alive": True}, None) is None)
check("zero liquidity classes as liquidity_pulled",
      classify_death({"alive": False, "liquidity_usd": 0}, None) == "liquidity_pulled")
check("zero volume with a pool classes as faded",
      classify_death({"alive": False, "volume_h24": 0, "liquidity_usd": 5.0}, None) == "faded")

check("★ no pairs + NEVER seen a pool = UNCLASSIFIED, not a guess",
      classify_death({"alive": False, "evidence": "no_pairs_returned"}, None) is None,
      "no-pairs is what a pulled pool AND an indexing gap both look like")
check("POSITIVE CONTROL: no pairs + a pool seen BEFORE = liquidity_pulled",
      classify_death({"alive": False, "evidence": "no_pairs_returned"}, {"pairs": 1})
      == "liquidity_pulled",
      "the prior sighting is what turns an ambiguity into evidence")


# ─────────────────────────────────────────────────────────────────────────────
section("4. THE BUDGET GATE SITS IN FRONT OF THE NETWORK, not beside it")
# ─────────────────────────────────────────────────────────────────────────────
budget.inject_spend("liquidity", LIQUIDITY_AUDIT_CARVE, T0)
raised = False
try:
    providers.pool_liquidity("MINT_Z")   # would need a key and a socket
except providers.Shed:
    raised = True
except Exception as e:  # anything else means it got PAST the gate
    check("liquidity call refused BEFORE any network or key access", False, repr(e))
check("liquidity call refused BEFORE any network or key access", raised,
      "if the gate were beside the network this would have raised a key or socket error")


# ─────────────────────────────────────────────────────────────────────────────
section("5. TIERING — the only deleter, and births are unreachable from it")
# ─────────────────────────────────────────────────────────────────────────────
from config import BIRTHS_DIR, COLD_DIR  # noqa: E402
from provenance import RAW_DIR as BULKY_DIR  # noqa: E402

check("births path is REFUSED by the safety predicate",
      not tier._safe(os.path.join(BIRTHS_DIR, "2026-08-28.jsonl")))
check("observations path is REFUSED", not tier._safe(f"{ROOT}/observations/x.jsonl"))
check("tombstones path is REFUSED", not tier._safe(f"{ROOT}/dead/dead.jsonl"))
check("POSITIVE CONTROL: a payload path IS allowed",
      tier._safe(os.path.join(BULKY_DIR, "raw.jsonl")),
      "if everything were refused the predicate would be a constant")

# An aged payload moves to cold and the hot copy goes; a fresh one stays.
os.makedirs(BULKY_DIR, exist_ok=True)
old_p = os.path.join(BULKY_DIR, "old.jsonl")
new_p = os.path.join(BULKY_DIR, "new.jsonl")
for p in (old_p, new_p):
    with open(p, "w", encoding="utf-8") as fh:
        fh.write('{"raw":"payload"}\n')
old_ts = (T0 - timedelta(days=5)).timestamp()
os.utime(old_p, (old_ts, old_ts))

birth_file = os.path.join(BIRTHS_DIR, "2026-08-28.jsonl")
with open(birth_file, "w", encoding="utf-8") as fh:
    fh.write('{"mint":"KEEP_ME"}\n')
os.utime(birth_file, (old_ts, old_ts))  # older than any window — still untouchable

res = tier.tier_payloads(datetime.now(UTC))
check("aged payload moved to cold", res["moved"] == 1, res)
# ★ THE COLD NAME CARRIES ITS SOURCE PREFIX (2026-08-28). Both bulky stores
#   name files by date, so an unprefixed cold name lets the second store
#   silently overwrite the first — asserted directly in test_tiering block 4.
check("cold copy exists, under its source prefix",
      os.path.exists(os.path.join(COLD_DIR, "provenance-raw-old.jsonl.gz")),
      sorted(os.listdir(COLD_DIR)))
check("hot copy removed", not os.path.exists(old_p))
check("POSITIVE CONTROL: the FRESH payload was left alone", os.path.exists(new_p),
      "if it had gone too, the age test would be doing nothing")
check("★★ THE BIRTH FILE IS UNTOUCHED, though it is older than every window",
      os.path.exists(birth_file) and open(birth_file, encoding="utf-8").read().strip()
      == '{"mint":"KEEP_ME"}',
      "births are deleted by nothing, ever")


# ─────────────────────────────────────────────────────────────────────────────
section("6. THE FENCE — every module, checked mechanically")
# ─────────────────────────────────────────────────────────────────────────────
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
banned = ("drizzle", "server.services", "signal_orchestrator", "shared.schema", "@shared")
offending, scanned = [], 0
for fn in sorted(os.listdir(here)):
    if not fn.endswith(".py"):
        continue
    scanned += 1
    for line in open(os.path.join(here, fn), encoding="utf-8").read().splitlines():
        ls = line.strip()
        if ls.startswith(("import ", "from ")) and any(b in ls for b in banned):
            offending.append(f"{fn}: {ls}")
check("no module imports the trading application", not offending, offending)
check("POSITIVE CONTROL: the scan actually read every module",
      scanned >= 6, f"scanned={scanned}")

# ⛔ THIS CHECK USED TO MATCH THE SUBSTRING "urllib" ANYWHERE IN THE FILE TEXT.
#    A fresh reader pointed out that tests a SPELLING, not a capability: it
#    would have passed a module using http.client, socket, ssl, asyncio or a
#    subprocess running curl, and would have FAILED a module that merely
#    mentions urllib in a comment. Its silence was evidence about one word.
#    Now it looks for any socket-bearing stdlib entry point.
#
# ⚠️ AND THE CLAIM IS RESTATED HONESTLY: `receiver.py` binds a LISTENING
#    socket, so "exactly one module reaches the network" was false as worded.
#    The property that matters — and the one the budget gate depends on — is
#    that exactly one module makes OUTBOUND calls.
OUTBOUND = ("urllib", "http.client", "requests", "httpx", "socket.create_connection",
            "smtplib", "ftplib", "aiohttp", "subprocess", "os.system", "popen")
outbound_modules, inbound_modules = [], []
for fn in sorted(os.listdir(here)):
    if not fn.endswith(".py"):
        continue
    body = open(os.path.join(here, fn), encoding="utf-8").read()
    code = "\n".join(l for l in body.splitlines()
                     if l.strip().startswith(("import ", "from ")) or "(" in l)
    if any(tok in code for tok in OUTBOUND):
        outbound_modules.append(fn)
    if "http.server" in code or "socket.bind" in code:
        inbound_modules.append(fn)

check("★ exactly ONE module makes OUTBOUND calls",
      outbound_modules == ["providers.py"], outbound_modules)

# ⛔⛔ AND THE SUBJECT ABOVE IS THE MODULE. THE DEFECT WAS A FUNCTION.
#    Langston, 2026-08-31 (BLOCKER-1): the pacer went into `_get`, and
#    `pool_liquidity` built its own Request and called `urlopen` directly --
#    a SECOND egress site INSIDE the one trusted module. The check above
#    passed green the whole time, because its subject is which module reaches
#    the network and the live question is HOW MANY PLACES IN IT DO.
#    "exactly one module" was true and "the pacer covers every call" was
#    false, simultaneously, and only the second one matters.
# ★ DERIVED, NEVER A NAME LIST. A list of approved call sites passes green
#   while the defect is live -- the same reason the module list did. The
#   count is computed from the file, so a new egress fails this by existing.
def _egress_sites(text, name):
    """THE DETECTOR, FACTORED OUT SO THE CONTROL CAN DRIVE THE SAME CODE.

    A control has to run the thing under test against a known positive. With
    the scan inline, the only control available was arithmetic on its output,
    which is why the previous one could not fail.
    """
    out = []
    for n, line in enumerate(text.splitlines(), 1):
        s = line.strip()
        if s.startswith("#"):
            continue
        if "urlopen(" in s or "http.client" in s or "requests.get(" in s:
            out.append("%s:%d" % (name, n))
    return out


_egress = []
for fn in sorted(os.listdir(here)):
    if fn.endswith(".py"):
        _egress += _egress_sites(
            open(os.path.join(here, fn), encoding="utf-8").read(), fn)

check("★ exactly ONE egress CALL SITE in the package",
      len(_egress) == 1, str(_egress))
check("...and it is in providers.py, where the pacer is",
      bool(_egress) and _egress[0].startswith("providers.py:"), str(_egress))

# POSITIVE CONTROL -- IT DRIVES THE DETECTOR, NOT A LIST.
# The previous version compared list lengths --
#     len(_egress + ["x"]) == len(_egress) + 1
# -- which is true for EVERY possible value and so could not fail. Langston
# caught it one ruling after I fixed the identical shape elsewhere, and it is
# my own stated rule: a verification that cannot fail is not a verification.
# This one hands the detector synthetic source and demands it find the site,
# so if the matcher breaks the count above reports 0 forever and THIS fails.
_synthetic = ("import urllib.request" + chr(10) + "def f(r):" + chr(10) +
              "    return urllib.request.urlopen(r)" + chr(10))
check("...and the detector actually FINDS a known egress site",
      _egress_sites(_synthetic, "synthetic.py") == ["synthetic.py:3"],
      str(_egress_sites(_synthetic, "synthetic.py")))

# ...and does NOT fire on a commented-out call, or every comment is a site
# and the fence above becomes noise rather than a bound.
_commented = "# urllib.request.urlopen(r)" + chr(10)
check("...and does NOT fire on a commented-out call",
      _egress_sites(_commented, "synthetic.py") == [],
      str(_egress_sites(_commented, "synthetic.py")))
check("the inbound listener is named, not hidden",
      inbound_modules == ["receiver.py"], inbound_modules)
check("POSITIVE CONTROL: the scan CAN detect an outbound primitive",
      any(tok in open(os.path.join(here, "providers.py"), encoding="utf-8").read()
          for tok in OUTBOUND),
      "if it detected nothing anywhere, the empty list above would prove nothing")


print("\n" + "=" * 60)
print(f"FAILED: {len(FAILURES)} -> {FAILURES}" if FAILURES else "ALL CHECKS PASSED")
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
