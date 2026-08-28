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
T0 = datetime(2026, 8, 28, 12, 0, 0, tzinfo=UTC)


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
check("POSITIVE CONTROL: an unsampled non-carrier is NOT followed",
      (not followed2) and reason2 == "not_sampled", reason2)


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
from config import BIRTHS_DIR, COLD_DIR, PAYLOAD_DIR  # noqa: E402

check("births path is REFUSED by the safety predicate",
      not tier._safe(os.path.join(BIRTHS_DIR, "2026-08-28.jsonl")))
check("observations path is REFUSED", not tier._safe(f"{ROOT}/observations/x.jsonl"))
check("tombstones path is REFUSED", not tier._safe(f"{ROOT}/dead/dead.jsonl"))
check("POSITIVE CONTROL: a payload path IS allowed",
      tier._safe(os.path.join(PAYLOAD_DIR, "raw.jsonl")),
      "if everything were refused the predicate would be a constant")

# An aged payload moves to cold and the hot copy goes; a fresh one stays.
old_p = os.path.join(PAYLOAD_DIR, "old.jsonl")
new_p = os.path.join(PAYLOAD_DIR, "new.jsonl")
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
check("cold copy exists", os.path.exists(os.path.join(COLD_DIR, "old.jsonl.gz")))
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

# The one network module is the only one importing urllib — that is what makes
# the budget gate a chokepoint rather than a convention.
net = []
for fn in sorted(os.listdir(here)):
    if fn.endswith(".py") and "urllib" in open(os.path.join(here, fn), encoding="utf-8").read():
        net.append(fn)
check("★ exactly ONE module reaches the network", net == ["providers.py"], net)


print("\n" + "=" * 60)
print(f"FAILED: {len(FAILURES)} -> {FAILURES}" if FAILURES else "ALL CHECKS PASSED")
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
