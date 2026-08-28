"""
token-watch — regression tests for the ROUND-2 reader findings.

★ EVERY CHECK HERE CORRESPONDS TO A DEFECT A FRESH READER *EXECUTED* rather
  than reasoned about. They are separated from the other suites deliberately:
  each one is a case my own tests were shaped not to reach, and keeping them
  together makes the class visible — month boundaries, truncation, corruption,
  hour edges, and ordering assumptions.

⛔ THE PATTERN WORTH SEEING: five of the six below are cases where a WRONG
  VALUE or a SILENT STOP was indistinguishable from correct operation. None of
  them would have raised, logged, or failed a test.
"""

import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-r2-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
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
AUG = datetime(2026, 8, 28, 12, 0, 0, tzinfo=UTC)
SEP = datetime(2026, 9, 1, 0, 30, 0, tzinfo=UTC)


# ─────────────────────────────────────────────────────────────────────────────
section("1. ⛔ MONTH ROLLOVER MUST NOT RE-FOLD THE PREVIOUS MONTH")
# The ledger resets on a month boundary and the reset included the journal
# offset. With one perpetual journal that replayed the whole previous month
# into the new one: month two opens near the cap, month three above it, after
# which both discretionary legs shed permanently and burn reads critical
# forever — silently, with plausible numbers.
# ─────────────────────────────────────────────────────────────────────────────
for _ in range(5):
    budget.record_pending("birth", 1, AUG, day="2026-08-28", followed=True, reason="trait_carrier")
budget.fold_pending(AUG)
check("POSITIVE CONTROL: August folded its own rows", budget.spent_by("birth", AUG) == 5,
      budget.spent_by("birth", AUG))

budget.fold_pending(SEP)
check("★ September opens at ZERO — August is not replayed",
      budget.spent_by("birth", SEP) == 0, budget.spent_by("birth", SEP))
check("the journals are separate files",
      budget.journal_path(AUG) != budget.journal_path(SEP))
check("POSITIVE CONTROL: September folds ITS OWN rows",
      (budget.record_pending("birth", 1, SEP, day="2026-09-01", followed=True,
                             reason="trait_carrier"),
       budget.fold_pending(SEP),
       budget.spent_by("birth", SEP))[2] == 1, budget.spent_by("birth", SEP))


# ─────────────────────────────────────────────────────────────────────────────
section("2. ⛔ A TRUNCATED JOURNAL MUST NOT SILENTLY LOSE ALL LATER SPEND")
# The offset only ever moves forward, so an offset past EOF made every later
# fold read nothing — for ever, with no error. That is BLOCKER-1 returning by
# another route.
# ─────────────────────────────────────────────────────────────────────────────
T = datetime(2026, 10, 5, 9, 0, 0, tzinfo=UTC)
for _ in range(4):
    budget.record_pending("birth", 1, T, day="2026-10-05", followed=True, reason="trait_carrier")
budget.fold_pending(T)
check("POSITIVE CONTROL: four rows folded", budget.spent_by("birth", T) == 4)

open(budget.journal_path(T), "w").close()          # external truncation
budget.record_pending("birth", 1, T, day="2026-10-05", followed=True, reason="trait_carrier")
res = budget.fold_pending(T)
check("★ truncation is DETECTED and reported, not absorbed",
      res.get("anomaly") is not None, res)
check("★ spend after the truncation still reaches the ledger",
      budget.spent_by("birth", T) >= 5, budget.spent_by("birth", T))


# ─────────────────────────────────────────────────────────────────────────────
section("3. ⛔ A CORRUPT INTERIOR LINE MUST NOT STALL THE FOLD FOREVER")
# Stopping on any unparseable line cannot distinguish a torn tail (stop —
# correct) from interior corruption (stop — fatal: every later fold returns
# zero at the same offset and birth spend never reaches the ledger again).
# ─────────────────────────────────────────────────────────────────────────────
T3 = datetime(2026, 11, 3, 9, 0, 0, tzinfo=UTC)
p = budget.journal_path(T3)
os.makedirs(os.path.dirname(p), exist_ok=True)
with open(p, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"ts": T3.isoformat(), "kind": "birth", "n": 1}) + "\n")
    fh.write("{ this line is corrupt and COMPLETE\n")
    fh.write(json.dumps({"ts": T3.isoformat(), "kind": "birth", "n": 1}) + "\n")
r3 = budget.fold_pending(T3)
check("★ the fold steps OVER interior corruption and reports it",
      r3["bad_lines"] == 1, r3)
check("★ rows AFTER the corrupt line still reach the ledger",
      budget.spent_by("birth", T3) == 2, budget.spent_by("birth", T3))

# POSITIVE CONTROL: a torn TAIL (no trailing newline) must still stop, because
# the next append completes it and skipping would drop real spend.
T4 = datetime(2026, 12, 2, 9, 0, 0, tzinfo=UTC)
p4 = budget.journal_path(T4)
with open(p4, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"ts": T4.isoformat(), "kind": "birth", "n": 1}) + "\n")
    fh.write('{"ts": "partial", "kin')          # torn, no newline
r4 = budget.fold_pending(T4)
check("POSITIVE CONTROL: a torn TAIL stops the fold and is NOT counted bad",
      r4["bad_lines"] == 0 and budget.spent_by("birth", T4) == 1, r4)


# ─────────────────────────────────────────────────────────────────────────────
section("4. ⛔ THE SAME-HOUR ORPHAN — a due point inside the current hour")
# The first fix compared hour-bucket strings, so a point already past but
# inside the current hour went into the current bucket — which the hourly job
# has already read. Written, never read.
# ─────────────────────────────────────────────────────────────────────────────
late_now = datetime.now(UTC)
created_40m_ago = late_now - timedelta(minutes=40)
store.schedule_grid("MINT_SAMEHOUR", created_40m_ago)

this_hour = [e for e in store._read(store.due_path(late_now))
             if e["mint"] == "MINT_SAMEHOUR"]
next_hour = [e for e in store._read(store.due_path(late_now + timedelta(hours=1)))
             if e["mint"] == "MINT_SAMEHOUR"]
check("★ nothing is left in the CURRENT bucket, which is already read",
      len(this_hour) == 0, f"{len(this_hour)} orphaned entries")
check("★ the 1h point moved to the NEXT bucket instead of being lost",
      len(next_hour) >= 1, f"next-hour entries: {len(next_hour)}")
check("POSITIVE CONTROL: far-future points are untouched",
      len([e for e in store._read(store.due_path(created_40m_ago + timedelta(days=90)))
           if e["mint"] == "MINT_SAMEHOUR"]) == 1)


# ─────────────────────────────────────────────────────────────────────────────
section("5. ⛔ SIZE — the LARGEST creator transfer, and the label is PERSISTED")
# ─────────────────────────────────────────────────────────────────────────────
ev = {"type": "CREATE", "source": "PUMP_FUN", "timestamp": int(late_now.timestamp()),
      "feePayer": "CREATOR_A", "tokenTransfers": [{"mint": "MINT_BIG"}],
      "nativeTransfers": [
          {"fromUserAccount": "CREATOR_A", "amount": 5_000},          # a fee, FIRST
          {"fromUserAccount": "CREATOR_A", "amount": 3_000_000_000},  # the real buy
      ]}
parsed = receiver.parse_creation(ev)
check("★ the LARGEST creator transfer wins, not the first",
      abs(parsed["initial_size"] - 3.0) < 1e-9,
      f"got {parsed['initial_size']} — 5e-06 means it took the fee")
check("the label records that a choice was made",
      "largest_of" in parsed["size_source"], parsed["size_source"])

receiver.ingest([ev])
rows = [r for r in store._read(store.birth_path(datetime.now(UTC)))
        if r["mint"] == "MINT_BIG"]
check("★ size_source IS PERSISTED on the stored record, not just computed",
      rows and "size_source" in rows[0], rows[:1])
check("POSITIVE CONTROL: the persisted size matches the parsed one",
      rows and abs(rows[0]["initial_size"] - 3.0) < 1e-9, rows[:1])


# ─────────────────────────────────────────────────────────────────────────────
section("6. ⛔ TIMESTAMPS — refuse rather than fabricate a creation time")
# A millisecond timestamp used to raise and be swallowed, dropping the launch.
# A zero timestamp used to become now(), recording the left-truncation OBJ-2
# exists to measure as ABSENT.
# ─────────────────────────────────────────────────────────────────────────────
ms = dict(ev, timestamp=int(late_now.timestamp() * 1000), tokenTransfers=[{"mint": "MINT_MS"}])
pm = receiver.parse_creation(ms)
check("★ a MILLISECOND timestamp is understood, not dropped",
      pm is not None and abs((pm["created_at"] - late_now).total_seconds()) < 2,
      pm and pm["created_at"])

zero = dict(ev, timestamp=0, tokenTransfers=[{"mint": "MINT_ZERO"}])
check("★ a ZERO timestamp is REFUSED, never replaced with now()",
      receiver.parse_creation(zero) is None)
check("a missing timestamp is refused", receiver.parse_creation(
    {"type": "CREATE", "tokenTransfers": [{"mint": "M"}]}) is None)
check("POSITIVE CONTROL: a normal seconds timestamp still parses",
      receiver.parse_creation(ev) is not None)


# ─────────────────────────────────────────────────────────────────────────────
section("7. ⛔ THE HOURLY JOB ITSELF — nothing in the package ever drove it")
# A fresh reader found that NO test called `follow_up.run_hour`. So the fold
# was exercised by tests calling it DIRECTLY, while the connection inside the
# job was not — which is BLOCKER-1's exact shape, one function further down.
# The provider is stubbed because the seam under test is run_hour → fold →
# record, not the network.
# ─────────────────────────────────────────────────────────────────────────────
import follow_up  # noqa: E402
import providers  # noqa: E402

# ★ DRIVEN THROUGH THE RECEIVER, not by writing a due row. The whole point of
#   this section is that the previous suite reached `fold_pending` by calling
#   it, so a test that hand-writes the bucket would repeat that mistake in the
#   other direction. Ingest a launch now; its 1h checkpoint lands in the next
#   hour's bucket; run the job then.
RUN = datetime.now(UTC)
receiver.ingest([{
    "type": "CREATE", "source": "PUMP_FUN", "timestamp": int(RUN.timestamp()),
    "feePayer": "CREATOR_RUN", "tokenTransfers": [{"mint": "MINT_RUN"}],
    "nativeTransfers": [{"fromUserAccount": "CREATOR_RUN", "amount": 2_000_000_000}],
    "telegram": "t.me/x",
}])
# ⛔ FIND the bucket the 1h checkpoint actually landed in, rather than
#    computing it as RUN+1h5m. That arithmetic silently crossed an hour
#    boundary whenever the wall clock's minute was late, and the section then
#    failed for a reason that had nothing to do with the code — the
#    clock-dependence a fresh reader flagged in the other suites.
_due_1h = RUN + timedelta(hours=1)
_bucket = _due_1h.replace(minute=0, second=0, microsecond=0)
if not any(e["mint"] == "MINT_RUN" and e["age"] == "1h"
           for e in store._read(store.due_path(_bucket))):
    _bucket = _bucket + timedelta(hours=1)      # same-hour rule pushed it on
LATER = _bucket + timedelta(minutes=59)

calls = {"n": 0}


def fake_state(mint):
    calls["n"] += 1
    return {"alive": True, "pairs": 1, "volume_h24": 10.0,
            "liquidity_usd": 500.0, "price_usd": "0.1"}


providers.token_state = fake_state

before = budget.spent_by("birth", LATER)
result = follow_up.run_hour(LATER)

check("POSITIVE CONTROL: run_hour actually observed the due token",
      calls["n"] >= 1 and result["observed"] >= 1, result)
check("run_hour reports it did NOT skip", result["skipped"] is False, result)
check("★ run_hour FOLDS journalled spend into the ledger — the seam itself",
      budget.spent_by("birth", LATER) > before,
      f"before={before} after={budget.spent_by('birth', LATER)}")
check("the fold count is reported by the job", result["folded_spend_rows"] >= 1, result)
check("every stats key is present on the SUCCESS path",
      all(k in result for k in ("skipped", "folded_spend_rows",
                                "last_seen_pruned", "unclassified_by_age")), result)

with store.periodic_lock("intruder") as got:
    check("POSITIVE CONTROL: the intruder holds the lock", got)
    skipped = follow_up.run_hour(LATER)
check("★ a held lock makes run_hour SKIP rather than proceed",
      skipped["skipped"] is True, skipped)
check("a skipped cycle folds nothing", skipped["folded_spend_rows"] == 0, skipped)
check("every stats key is present on the SKIP path too",
      all(k in skipped for k in ("skipped", "folded_spend_rows",
                                 "last_seen_pruned", "unclassified_by_age")), skipped)


# ─────────────────────────────────────────────────────────────────────────────
section("8. ⛔ NEVER OBSERVE EARLY — the bucket is read whole, entries are not")
# The job reads an hour-bucket at the top of the hour while entries inside it
# fall due at different minutes. Measured before the fix: a token born at :55
# had its "1h" checkpoint read at :02 the next hour — SEVEN MINUTES of age; at
# :59 it was three. Worse than late and not symmetrically so: the entry is
# consumed, so the real checkpoint never happens.
# ─────────────────────────────────────────────────────────────────────────────
EARLY = datetime.now(UTC).replace(minute=2, second=0, microsecond=0)
not_yet = {"mint": "MINT_EARLY", "age": "1h",
           "due_at": (EARLY + timedelta(minutes=40)).isoformat()}
store._append(store.due_path(EARLY), not_yet)

calls_before = calls["n"]
# ⛔ CLEAR THE CURSOR FIRST. Section 7 ran the job at a LATER hour, so the
#    cursor now sits ahead of EARLY and a correctly-behaving job reads nothing
#    — the BLOCKER-2 fix working, not a failure. A test that shares state with
#    an earlier section has to say so.
store.save_state("follow_up_cursor", {})
early_result = follow_up.run_hour(EARLY)
check("★ a not-yet-due entry is NOT observed",
      calls["n"] == calls_before, f"provider called {calls['n'] - calls_before} times")
check("★ it is re-queued rather than dropped",
      early_result["requeued_not_yet_due"] >= 1, early_result)
requeued = [e for e in store._read(store.due_path(EARLY + timedelta(hours=1)))
            if e["mint"] == "MINT_EARLY"]
check("the entry is in the NEXT bucket, so the checkpoint still happens",
      len(requeued) == 1, f"{len(requeued)} entries")

# POSITIVE CONTROL: an entry that IS due gets observed on the same path, so
# the check above is the due-time test working rather than the job being inert.
due_now_entry = {"mint": "MINT_DUE", "age": "1h",
                 "due_at": (EARLY - timedelta(minutes=5)).isoformat()}
store._append(store.due_path(EARLY), due_now_entry)
before_due = calls["n"]
# ⛔ CLEAR THE CURSOR. The first run above consumed this hour, and a consumed
#    hour now correctly reads NOTHING — that is the BLOCKER-2 fix working, not
#    a failure. Without this the control would assert into an empty read.
store.save_state("follow_up_cursor", {})
follow_up.run_hour(EARLY)
check("POSITIVE CONTROL: an entry past its due time IS observed",
      calls["n"] > before_due, f"provider calls: {calls['n'] - before_due}")


print("\n" + "=" * 60)
print(f"FAILED: {len(FAILURES)} -> {FAILURES}" if FAILURES else "ALL CHECKS PASSED")
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAILURES else 0)
