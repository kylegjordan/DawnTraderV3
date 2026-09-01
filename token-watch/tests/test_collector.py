"""
token-watch — tests.

⛔ EVERY TEST HERE CARRIES A POSITIVE CONTROL, and that is not decoration.
   A verification that cannot fail is not a verification — I have shipped one
   of those before (an assertion that contamination must be zero, in a design
   where every route to non-zero was already closed), and Langston bounced it.
   So each block below first shows the assertion CAN come out the other way,
   then shows that it does not.

Run:  TOKEN_WATCH_ROOT=<scratch> python tests/test_collector.py
"""

import os
import shutil
import sys

# Windows consoles default to cp1252 and this file's output is UTF-8.
# Same class as the 2026-06-11 wake-filter bug, where cp1252 silently
# killed non-ASCII events. Force it rather than strip the characters.
try:
    sys.stdout.reconfigure(encoding='utf-8')
except Exception:
    pass
import tempfile
from datetime import datetime, timedelta, timezone

ROOT = tempfile.mkdtemp(prefix="token-watch-test-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
import store  # noqa: E402
from config import (  # noqa: E402
    BIRTHS_RESERVED,
    GRID,
    GRID_LABELS,
    LIQUIDITY_AUDIT_CARVE,
    MONTHLY_CREDIT_CAP,
)

UTC = timezone.utc
FAILURES = []


def check(name, condition, detail=""):
    if condition:
        print(f"  PASS  {name}")
    else:
        print(f"  FAIL  {name} :: {detail}")
        FAILURES.append(name)


def section(title):
    print(f"\n=== {title} ===")


store.ensure_dirs()
# ⛔ RELATIVE TO NOW, NOT A HARD-CODED DATE. A fresh reader showed the pinned
# literal made this suite pass only within ~60 minutes of it: once the wall
# clock passed T0+1h the early grid points became misses and were not written
# to buckets, and "dead token dropped from the due queue" then passed
# VACUOUSLY on a queue that never had an entry. A test whose verdict depends
# on the hour it runs is the absent-as-valid failure in a test file.
T0 = datetime.now(UTC)


# ─────────────────────────────────────────────────────────────────────────────
section("1. BIRTH CAPTURE — both timestamps, and the whole grid scheduled")
# ─────────────────────────────────────────────────────────────────────────────
created = T0
first_seen = T0 + timedelta(seconds=42)
rec = store.record_birth(
    mint="MINT_A", created_at=created, first_seen_at=first_seen, venue="pumpfun",
    initial_size=1.5, initial_liquidity=None, creator="WALLET_1",
    size_source="feePayer_sole_transfer",
    socials={"telegram": True, "website": False, "twitter": False},
    followed=True, follow_reason="trait_carrier:telegram",
)

check("both timestamps persisted",
      rec["created_at"] != rec["first_seen_at"],
      "OBJ-2: one timestamp turns size-at-birth into size-at-discovery")
check("discovery lag computed and non-zero", rec["discovery_lag_s"] == 42.0, rec["discovery_lag_s"])

# POSITIVE CONTROL: the lag field can hold a different value, so the 42 above
# is a measurement rather than a constant.
rec2 = store.record_birth(
    mint="MINT_CTRL", created_at=T0, first_seen_at=T0 + timedelta(seconds=7),
    venue="pumpfun", initial_size=0.1, initial_liquidity=None, creator="W2",
    size_source="feePayer_sole_transfer",
    socials={}, followed=False, follow_reason="not_sampled",
)
check("POSITIVE CONTROL: lag varies with input", rec2["discovery_lag_s"] == 7.0, rec2["discovery_lag_s"])

scheduled = []
for delta, label in zip(GRID, GRID_LABELS):
    due_hour = created + delta
    scheduled += [e for e in store.due_now(due_hour) if e["mint"] == "MINT_A"]
check("all 7 grid checkpoints scheduled", len(scheduled) == 7, f"got {len(scheduled)}")

# EVERY LAUNCH IS SCHEDULED NOW, CARRIER OR NOT (Kyle, 2026-09-01).
#   This block used to assert the opposite -- that an unfollowed token
#   scheduled NOTHING -- because the arm decided who was observed. It no
#   longer does: the arm is a LABEL for analysis, and full coverage removes
#   sampling error from the comparison rather than estimating around it.
# THE CONTROL IS INVERTED, NOT DELETED. Its job was to prove that "7" came
#   from the follow decision and not from a scheduler that fires blindly.
#   The equivalent job now is to prove the grid is EXACTLY ONE per launch --
#   because scheduling moved to birth and `promote` used to schedule too, so
#   the live risk is DOUBLE-scheduling every checkpoint, not under-scheduling.
ctrl = []
for delta in GRID:
    ctrl += [e for e in store.due_now(T0 + delta) if e["mint"] == "MINT_CTRL"]
check("a NON-carrier is scheduled too -- full coverage", len(ctrl) == 7, f"got {len(ctrl)}")
_pairs = [(x["mint"], x["age"]) for x in ctrl]
check("...exactly once per grid point, never twice",
      len(set(_pairs)) == len(_pairs),
      f"{len(_pairs)} rows but {len(set(_pairs))} distinct -- a duplicate is a double-schedule")


# ─────────────────────────────────────────────────────────────────────────────
section("2. DEAD TOKENS ARE STILL OBSERVED — the rule is MEASURED, not relaxed")
# ─────────────────────────────────────────────────────────────────────────────
due_at_1h = created + GRID[0]
before = [e for e in store.due_now(due_at_1h) if e["mint"] == "MINT_A"]
check("POSITIVE CONTROL: MINT_A IS due before it dies", len(before) == 1, f"got {len(before)}")

store.record_death("MINT_A", due_at_1h, "liquidity_pulled", "1h", {"liquidity_usd": 0})
after = [e for e in store.due_now(due_at_1h) if e["mint"] == "MINT_A"]
# ⛔ THIS ASSERTED `len(after) == 0` UNTIL 2026-09-01. The pre-registration says
#    dead tokens are never re-checked, and that was implemented by making them
#    UNREACHABLE -- so if a "dead" token ever traded again we could not find
#    out. Kyle: "let us keep checking to see if any of these trade again." The
#    accuracy of the death definition was unanswerable from our own data, by
#    construction, and that is what changed.
# ★ THE DEFINITION ITSELF IS UNTOUCHED. The tombstone still stands and every
#   reported survival figure still counts this token dead -- asserted next.
#   Observing a corpse is not resurrecting it.
check("★ a dead token is STILL SERVED by the due queue", len(after) == 1,
      f"got {len(after)}")
check("...and the tombstone still stands — it is not un-killed",
      "MINT_A" in store.dead_set())

# The tombstone is a record, not a deletion: the due entries still exist on
# disk, which keeps the store append-only and the schedule auditable.
raw = list(store._read(store.due_path(due_at_1h)))
check("due entries NOT rewritten — store stays append-only",
      any(e["mint"] == "MINT_A" for e in raw),
      "filtering happens at read time, never by rewriting a bucket")


# ─────────────────────────────────────────────────────────────────────────────
section("3. DEATH CLASS IS EX ANTE, and an invalid class is refused")
# ─────────────────────────────────────────────────────────────────────────────
try:
    store.record_death("MINT_B", T0, "rugged", "1h", {})
    check("invalid death class refused", False, "it was accepted")
except AssertionError:
    check("invalid death class refused", True)
# POSITIVE CONTROL: a valid class IS accepted, so the refusal above is the
# check working rather than record_death being broken.
store.record_death("MINT_B", T0, "faded", "6h", {"volume_24h": 0})
check("POSITIVE CONTROL: valid death class accepted", "MINT_B" in store.dead_set())



# ─────────────────────────────────────────────────────────────────────────────
section("3b. TOMBSTONE CACHE — fast on our own writes, still correct on others'")
# The cache is updated IN PLACE by record_death, because letting mtime force a
# re-read costs ~196M line re-parses in a busy hour by day 90. The risk that
# optimisation introduces is the opposite one: an in-place update that stamps
# the mtime could MASK a write by another process. Both directions tested.
# ─────────────────────────────────────────────────────────────────────────────
store.record_death("MINT_FAST", T0, "faded", "1h", {})
check("own write is visible immediately", "MINT_FAST" in store.dead_set())

# An EXTERNAL writer appends straight to the file, bypassing record_death.
import json as _json, time as _time
_time.sleep(0.01)
with open(store.tombstone_path(), "a", encoding="utf-8") as _fh:
    _fh.write(_json.dumps({"mint": "MINT_EXTERNAL", "died_at": T0.isoformat(),
                           "death_class": "faded", "age_at_death": "1h",
                           "evidence": {}}) + chr(10))
check("★ an EXTERNAL write is still picked up — the cache did not mask it",
      "MINT_EXTERNAL" in store.dead_set(),
      "an in-place cache that stamps mtime can hide another writer; this is that test")
check("POSITIVE CONTROL: a mint never recorded is NOT in the set",
      "MINT_NEVER_DIED" not in store.dead_set(),
      "if everything were present the membership test would be meaningless")

# ─────────────────────────────────────────────────────────────────────────────
section("4. ⛔ THE SHED ORDER — THE HARD CLOSE CONDITION, FIRED ON PURPOSE")
# Langston: 'an unverified guard on an irreversible silent loss is not a
# guard.' "It ran 72 hours and never fired" is absence of opportunity, not
# evidence of capability. So we drive the budget past its threshold.
# ─────────────────────────────────────────────────────────────────────────────
check("POSITIVE CONTROL: liquidity IS allowed at zero spend", budget.allowed("liquidity", T0))
check("POSITIVE CONTROL: births allowed at zero spend", budget.allowed("birth", T0))

# Injection 1 — exhaust the liquidity carve exactly.
budget.inject_spend("liquidity", LIQUIDITY_AUDIT_CARVE, T0)
check("liquidity SHEDS once its carve is exhausted", not budget.allowed("liquidity", T0))
check("★ BIRTHS STILL ALLOWED while liquidity sheds", budget.allowed("birth", T0),
      "births are never shed — a sampled birth record destroys the base rate")
check("shed_now reports liquidity, in order", budget.shed_now(T0) == ["liquidity"], budget.shed_now(T0))

# Injection 2 — drive TOTAL spend past the whole monthly cap.
budget.inject_spend("birth", MONTHLY_CREDIT_CAP, T0)
check("★★ BIRTHS ALLOWED EVEN PAST THE ENTIRE MONTHLY CAP", budget.allowed("birth", T0),
      "there must be NO state of the budget in which a birth is refused")
check("follow_up sheds second, past the cap", not budget.allowed("follow_up", T0))
check("shed order is liquidity THEN follow_up",
      budget.shed_now(T0) == ["liquidity", "follow_up"], budget.shed_now(T0))


# ─────────────────────────────────────────────────────────────────────────────
section("5. BURN MONITOR — the peak leg sees what the mean averages away")
# ─────────────────────────────────────────────────────────────────────────────
os.remove(store.state_path("budget"))  # fresh budget for a clean projection
T1 = datetime(2026, 8, 15, 12, 0, 0, tzinfo=UTC)  # mid-month: real hours remain

# A flat trickle for 24h, then ONE violent hour. A trailing mean smears the
# spike across 24 hours; the peak leg must not.
for h in range(24):
    budget.charge("birth", 100, T1 - timedelta(hours=24 - h))
budget.charge("birth", 20_000, T1 - timedelta(minutes=5))

rep = budget.burn_report(T1)
check("peak rate exceeds trailing rate", rep["rate_peak_per_hour"] > rep["rate_trailing_per_hour"],
      f"peak={rep['rate_peak_per_hour']} trailing={rep['rate_trailing_per_hour']}")
check("★ the PEAK leg is the binding one during a spike", rep["binding_leg"] == "peak", rep)
check("projection uses the sooner-exhausting leg",
      rep["projected"] == max(rep["projected_trailing"], rep["projected_peak"]))

# POSITIVE CONTROL: with NO spike, the trailing leg binds — so "peak" above is
# the spike being detected, not the peak leg always winning.
os.remove(store.state_path("budget"))
for h in range(24):
    budget.charge("birth", 100, T1 - timedelta(hours=24 - h))
flat = budget.burn_report(T1)
check("POSITIVE CONTROL: without a spike, peak ≈ trailing",
      abs(flat["rate_peak_per_hour"] - flat["rate_trailing_per_hour"]) < flat["rate_trailing_per_hour"],
      f"peak={flat['rate_peak_per_hour']} trailing={flat['rate_trailing_per_hour']}")


# ─────────────────────────────────────────────────────────────────────────────
section("6. MUTUAL EXCLUSION — two shipped periodic jobs, one store, two cores")
# ─────────────────────────────────────────────────────────────────────────────
with store.periodic_lock("job_a") as got_a:
    check("POSITIVE CONTROL: first holder gets the lock", got_a)
    with store.periodic_lock("job_b") as got_b:
        check("second job is REFUSED while the first holds it", not got_b,
              "it must skip, not proceed — 'could not get the lock' and 'did the work' "
              "must never be the same code path")
with store.periodic_lock("job_c") as got_c:
    check("lock released on exit", got_c)


# ─────────────────────────────────────────────────────────────────────────────
section("7. THE FENCE — no trading-application reach, checked mechanically")
# ─────────────────────────────────────────────────────────────────────────────
here = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
banned = ("drizzle", "server/services", "signal-orchestrator", "shared/schema", "@shared")
offending = []
for fn in sorted(os.listdir(here)):
    if not fn.endswith(".py"):
        continue
    body = open(os.path.join(here, fn), encoding="utf-8").read()
    for b in banned:
        # a mention inside a comment is fine; an import is not
        for line in body.splitlines():
            ls = line.strip()
            if (ls.startswith("import ") or ls.startswith("from ")) and b in ls:
                offending.append(f"{fn}: {ls}")
check("no module imports anything from the trading application", not offending, offending)
check("POSITIVE CONTROL: the scanner does read these files",
      any(f.endswith(".py") for f in os.listdir(here)) and len(os.listdir(here)) > 2)


print("\n" + "=" * 60)
if FAILURES:
    print(f"FAILED: {len(FAILURES)} -> {FAILURES}")
else:
    print("ALL CHECKS PASSED")
print(f"scratch tree: {ROOT}")
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
