"""
token-watch — MUTATION RESISTANCE.

⛔ WHY THIS FILE EXISTS, and it is the sharpest finding of the whole review:
   a fresh reader took four defects that this package's comments describe as
   FIXED, reverted each one, and **all 116 checks still passed.** The fixes
   were real; the tests were not testing them. A comment saying "fixed" with
   no test that dies when you un-fix it is documentation, not coverage.

★ EACH CHECK BELOW IS WRITTEN TO FAIL IF THE NAMED FIX IS REMOVED. That is a
  different question from "does the code work" — it is "would we notice."
"""

import os
import shutil
import subprocess
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-mut-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)

import budget  # noqa: E402
import config  # noqa: E402
import follow_up  # noqa: E402
import receiver  # noqa: E402
import store  # noqa: E402

UTC = timezone.utc
FAILURES = []


def check(name, cond, detail=""):
    print(f"  {'PASS' if cond else 'FAIL'}  {name}" + ("" if cond else f" :: {detail}"))
    if not cond:
        FAILURES.append(name)


def section(t):
    print(f"\n=== {t} ===")


store.ensure_dirs()
# ⚠️ MUST BE IN THE PAST. The receiver now refuses a future creation
# timestamp, and my first version of this file used a 2027 date — the guard
# correctly rejected all ten events and the section failed. The test was
# wrong, not the code, which is the right way round.
T = datetime.now(UTC) - timedelta(minutes=30)


# ─────────────────────────────────────────────────────────────────────────────
section("M1. the delivery note must not be counted as a spend row")
# Reverting this to record_pending("birth", 0, …) previously survived every
# suite, because the assertions used `>=` on counts that were off by exactly
# one. EXACT EQUALITY is what makes the mutation die.
# ─────────────────────────────────────────────────────────────────────────────
events = [{"type": "CREATE", "source": "PUMP_FUN", "timestamp": int(T.timestamp()),
           "feePayer": f"C{i}", "tokenTransfers": [{"mint": f"MUT{i:04d}"}],
           "nativeTransfers": [{"fromUserAccount": f"C{i}", "amount": 2_000_000_000}],
           "telegram": "t"} for i in range(10)]
n = receiver.ingest(events)
res = budget.fold_pending(T)
check("POSITIVE CONTROL: ten launches ingested", n == 10, n)
check("★ folded rows EXACTLY equals launches — the delivery note is not spend",
      res["folded"] == 10, f"folded={res['folded']} (11 means the note counted)")
check("★ no non-spend record enters the burn monitor's event stream",
      all(e["kind"] != "delivery" for e in
          store.load_state("budget", {}).get("events", [])),
      store.load_state("budget", {}).get("events", [])[:3])


# ─────────────────────────────────────────────────────────────────────────────
section("M2. a skipped cycle must not exit 0 — the EXIT CODE, not the dict")
# The previous test asserted the dict field. The comment's whole point was
# that "the log line was right and did not reach the exit code, which is what
# a supervisor actually reads" — so the test has to read the exit code too.
# ─────────────────────────────────────────────────────────────────────────────
lock_root = tempfile.mkdtemp(prefix="token-watch-lock-")
env = dict(os.environ, TOKEN_WATCH_ROOT=lock_root, PYTHONPATH=PKG)
os.makedirs(os.path.join(lock_root, "state"), exist_ok=True)
with open(os.path.join(lock_root, "state", "periodic.lock"), "w") as fh:
    fh.write("intruder 1 held\n")

proc = subprocess.run([sys.executable, os.path.join(PKG, "follow_up.py")],
                      env=env, capture_output=True, text=True, timeout=120)
check("★ a held lock makes the PROCESS exit non-zero", proc.returncode != 0,
      f"exit={proc.returncode} — 0 makes a wedged job look like a clean hour")
check("and it is a retry-able code, not a crash", proc.returncode == 75, proc.returncode)

os.unlink(os.path.join(lock_root, "state", "periodic.lock"))
proc2 = subprocess.run([sys.executable, os.path.join(PKG, "follow_up.py")],
                       env=env, capture_output=True, text=True, timeout=120)
check("POSITIVE CONTROL: without the lock the process exits 0",
      proc2.returncode == 0, proc2.returncode)
shutil.rmtree(lock_root, ignore_errors=True)


# ─────────────────────────────────────────────────────────────────────────────
section("M3. `observed` must be defaulted by the store, not by call sites")
# Both call sites pass it explicitly, so removing the default was invisible.
# This calls record_observation the way a THIRD caller would.
# ─────────────────────────────────────────────────────────────────────────────
store.record_observation("MUT_OBS", "1h", T, {"price_usd": "0.5"})
rows = [r for r in store._read(store.observation_path(T)) if r["mint"] == "MUT_OBS"]
check("★ a caller that omits `observed` still gets it on the row",
      rows and "observed" in rows[0], rows[:1])
check("and it defaults to True for a real observation",
      rows and rows[0]["observed"] is True, rows[:1])
store.record_observation("MUT_OBS2", "1h", T, {"observed": False, "reason": "shed"})
rows2 = [r for r in store._read(store.observation_path(T)) if r["mint"] == "MUT_OBS2"]
check("POSITIVE CONTROL: a caller CAN still override it",
      rows2 and rows2[0]["observed"] is False, rows2[:1])


# ─────────────────────────────────────────────────────────────────────────────
section("M4. the reserve clause must bind when the follow-up leg costs credits")
# Against today's constants the carve always trips first, so the headroom
# clause is unreachable and deleting it changed nothing. It exists for the
# re-homing case — so the test creates that case instead of asserting into a
# state where the clause cannot speak.
# ─────────────────────────────────────────────────────────────────────────────
original = config.CREDITS["follow_up"]
try:
    config.CREDITS["follow_up"] = 1        # the documented re-homing case
    budget.CREDITS["follow_up"] = 1
    mut_root = tempfile.mkdtemp(prefix="token-watch-m4-")
    os.environ["TOKEN_WATCH_ROOT"] = mut_root
    # Spend on the FOLLOW-UP leg only, up to the reserve boundary. The carve is
    # untouched, so only the headroom clause can refuse.
    budget.inject_spend("follow_up", config.MONTHLY_CREDIT_CAP - config.BIRTHS_RESERVED, T)
    check("POSITIVE CONTROL: the liquidity carve is NOT exhausted",
          budget.spent_by("liquidity", T) < config.LIQUIDITY_AUDIT_CARVE,
          budget.spent_by("liquidity", T))
    check("★ liquidity is refused BY THE RESERVE CLAUSE, with the carve unspent",
          not budget.allowed("liquidity", T),
          "if this passes, the headroom clause is doing nothing")
    check("★ births are STILL allowed at the reserve boundary",
          budget.allowed("birth", T))
    shutil.rmtree(mut_root, ignore_errors=True)
finally:
    config.CREDITS["follow_up"] = original
    budget.CREDITS["follow_up"] = original
    os.environ["TOKEN_WATCH_ROOT"] = ROOT


# ─────────────────────────────────────────────────────────────────────────────
section("M5. the burn monitor's two legs must be able to disagree")
# `binding_leg` was a constant: peak is the max over the buckets trailing
# averages, so peak >= trailing identically. Over 2,000 randomised series it
# took exactly one value.
# ─────────────────────────────────────────────────────────────────────────────
burn_root = tempfile.mkdtemp(prefix="token-watch-burn-")
os.environ["TOKEN_WATCH_ROOT"] = burn_root
TB = datetime(2027, 3, 15, 12, 0, tzinfo=UTC)


def legs(spike):
    p = store.state_path("budget")
    if os.path.exists(p):
        os.remove(p)
    for h in range(24):
        budget.charge("birth", 100, TB - timedelta(hours=24 - h))
    if spike:
        budget.charge("birth", spike, TB - timedelta(minutes=5))
    return budget.burn_report(TB)


flat = legs(0)
spiked = legs(20_000)
check("★ a FLAT series binds on the trailing leg", flat["binding_leg"] == "trailing",
      f"{flat['binding_leg']} — a constant here means the two legs are one")
check("★ a VIOLENT spike binds on the peak leg", spiked["binding_leg"] == "peak",
      spiked["binding_leg"])
check("POSITIVE CONTROL: the two runs really did differ",
      flat["rate_peak_per_hour"] != spiked["rate_peak_per_hour"])
check("a flat series does not raise an alarm", flat["level"] is None, flat["level"])

# ⛔ THE SECOND REGIME, which Langston required asserting rather than leaving
#    for the next reader to re-derive as "binding_leg is a constant" and
#    re-open a closed finding. Inside the last SPIKE_HORIZON of a month both
#    legs project over the same span, so `binding_leg` degenerates to "peak"
#    — ~22.6% of the time. The ALARM stays correct there; only the diagnostic
#    field stops discriminating.
TB_LATE = datetime(2027, 3, 30, 12, 0, tzinfo=UTC)   # <7 days left in March


def legs_late(spike):
    p2 = store.state_path("budget")
    if os.path.exists(p2):
        os.remove(p2)
    for h in range(24):
        budget.charge("birth", 100, TB_LATE - timedelta(hours=24 - h))
    if spike:
        budget.charge("birth", spike, TB_LATE - timedelta(minutes=5))
    return budget.burn_report(TB_LATE)


late_flat = legs_late(0)
check("★ inside the last week the legs share a span — degeneracy STATED, not hidden",
      late_flat["binding_leg"] == "peak", late_flat["binding_leg"])
check("★ and the ALARM is still correct there — a flat series raises nothing",
      late_flat["level"] is None, late_flat)
check("POSITIVE CONTROL: the two regimes really do differ",
      flat["binding_leg"] != late_flat["binding_leg"],
      f"mid-month={flat['binding_leg']} late={late_flat['binding_leg']}")
shutil.rmtree(burn_root, ignore_errors=True)
os.environ["TOKEN_WATCH_ROOT"] = ROOT


# ─────────────────────────────────────────────────────────────────────────────
section("M6. the catch-up limb must DIE when removed (Langston BLOCKER-2)")
# Reverting `_buckets_to_read` to `return [cur]` previously passed every check
# — test_mutations' own thesis, applied to test_mutations.
# ─────────────────────────────────────────────────────────────────────────────
cat_root = tempfile.mkdtemp(prefix="token-watch-cat-")
os.environ["TOKEN_WATCH_ROOT"] = cat_root
store.ensure_dirs()
N = datetime(2027, 5, 20, 15, 30, tzinfo=UTC)

first = [b.strftime("%H") for b in follow_up._buckets_to_read(N)]
check("POSITIVE CONTROL: a first run reads exactly this hour", first == ["15"], first)

store.save_state("follow_up_cursor", {"last_bucket": "2027-05-20T12"})
caught = [b.strftime("%H") for b in follow_up._buckets_to_read(N)]
check("★ a cursor three hours behind reads THREE buckets, not one",
      caught == ["13", "14", "15"], caught)

store.save_state("follow_up_cursor", {"last_bucket": "2027-05-20T15"})
check("★ a consumed hour reads NOTHING — not the same hour again",
      follow_up._buckets_to_read(N) == [],
      "re-reading a consumed bucket re-observes, re-appends, and spends the carve twice")
shutil.rmtree(cat_root, ignore_errors=True)
os.environ["TOKEN_WATCH_ROOT"] = ROOT


# ─────────────────────────────────────────────────────────────────────────────
section("M7. an extraction break must be COUNTABLE (Langston BLOCKER-3)")
# size_source was persisted with no reader, so a break would switch the size
# limb of the trait definition off in silence.
# ─────────────────────────────────────────────────────────────────────────────
# ⛔ ASSERT ON THE DELTA, NOT AN ABSOLUTE. `config.ROOT` is bound at import,
#    so setting the environment variable here does NOT give this section a
#    fresh tree — a fresh reader caught exactly that annotation-as-fiction in
#    an earlier suite. Earlier sections have already written to this day.
TB2 = datetime.now(UTC) - timedelta(minutes=20)
broken = [{"type": "CREATE", "source": "PUMP_FUN", "timestamp": int(TB2.timestamp()),
           "feePayer": f"X{i}", "tokenTransfers": [{"mint": f"BRK{i:04d}"}],
           # the provider renamed the field: nothing matches the creator
           "nativeTransfers": [{"sender": f"X{i}", "amount": 2_000_000_000}]}
          for i in range(6)]
receiver.ingest(broken)
budget.fold_pending(TB2)
day = TB2.strftime("%Y-%m-%d")
inc = store.load_state("inclusion", {}).get(day, {})
check("★ an extraction break is COUNTED, not silent",
      inc.get("size_unresolved", 0) >= 6, inc)
_resolved_before = inc.get("size_resolved", 0)

receiver.ingest([{"type": "CREATE", "source": "PUMP_FUN",
                  "timestamp": int(TB2.timestamp()), "feePayer": "OK1",
                  "tokenTransfers": [{"mint": "OKMINT"}],
                  "nativeTransfers": [{"fromUserAccount": "OK1",
                                       "amount": 2_000_000_000}]}])
budget.fold_pending(TB2)
inc2 = store.load_state("inclusion", {}).get(day, {})
check("POSITIVE CONTROL: a healthy extraction increments the RESOLVED tally",
      inc2.get("size_resolved", 0) == _resolved_before + 1,
      f"before={_resolved_before} after={inc2.get('size_resolved')}")
check("and the unresolved tally did NOT move for a healthy extraction",
      inc2.get("size_unresolved") == inc.get("size_unresolved"), (inc, inc2))


print("\n" + "=" * 60)
print(f"FAILED: {len(FAILURES)} -> {FAILURES}" if FAILURES else "ALL CHECKS PASSED")
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
