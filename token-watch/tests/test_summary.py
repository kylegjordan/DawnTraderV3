"""
token-watch — THE PUBLISHED SUMMARY.

⛔⛔ BLOCK 2 IS THE REASON THIS SUITE EXISTS. Only FOLLOWED tokens are ever
   re-checked, so an unfollowed token can never be tombstoned. Counting "no
   tombstone" as "alive" over the whole census would report ~97% of launches
   still alive at 90 days — an enormous, stable, meaningless number that would
   look authoritative on a page. Every survival figure must run over the
   TRACKED population, and the test proves it by making the two answers differ.
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

ROOT = tempfile.mkdtemp(prefix="token-watch-sum-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import summary  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
NOW = datetime(2026, 11, 30, 12, 0, 0, tzinfo=UTC)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % detail) if detail else ""))


def reset():
    for name in os.listdir(ROOT):
        shutil.rmtree(os.path.join(ROOT, name), ignore_errors=True)
    store.ensure_dirs()


def birth(mint, created, followed):
    """Through the PRODUCTION writer — never by appending JSONL here."""
    return store.record_birth(
        mint=mint, created_at=created, first_seen_at=created,
        venue="PUMP_FUN", initial_size=1.5, initial_liquidity=None,
        creator="C1", size_source="feePayer_sole_transfer", socials={},
        followed=followed, follow_reason="trait_carrier" if followed else "not_sampled")


print("\n=== 1. THE CENSUS TOTAL COUNTS EVERY LAUNCH")
reset()
for i in range(10):
    birth("TRACKED%d" % i, NOW - timedelta(days=40), True)
for i in range(90):
    birth("UNTRACKED%d" % i, NOW - timedelta(days=40), False)
p = summary.build(NOW)
check("every launch is in the census total", p["launches"]["total"] == 100, p["launches"]["total"])
check("but only the followed ones are 'tracked'", p["tracked"]["total"] == 10, p["tracked"]["total"])
check("and the tracked share is stated, not left to the reader",
      p["tracked"]["share_of_launches"] == 0.1, p["tracked"]["share_of_launches"])

print("\n=== 2. ⛔ THE TRAP — survival must NOT be computed over the census")
# 90 of the 100 are never checked and so can never be tombstoned. If survival
# ran over the census, killing every tracked token would still report 90 alive.
for i in range(10):
    store.record_death("TRACKED%d" % i, NOW - timedelta(days=1), "faded", "30d",
                       {"volume_h24": 0},
                       created_at=(NOW - timedelta(days=40)).isoformat())
p = summary.build(NOW)
check("★ every TRACKED token died, so alive is ZERO", p["alive"]["total"] == 0,
      p["alive"]["total"])
check("★ and NOT 90 — the untracked are not counted as survivors",
      p["alive"]["total"] != 90)
# ⛔ AND THE AGING COLUMNS TOO — THE TOTAL ALONE DOES NOT PROTECT THEM.
#    Caught by mutation: switching the aging loop from the tracked set to the
#    census left every check above passing, because `alive.total` is computed
#    from a different expression. The columns are what the page actually shows,
#    so they need their own assertion or the trap reopens one field over.
by = p["alive"]["by_age"]
check("★ the AGING COLUMNS are zero too, not 90",
      all(by[a] == 0 for a in p["display_ages"]), by)
check("the deaths are all recorded", p["died"]["total"] == 10, p["died"]["total"])
check("the census total is UNCHANGED — it is a different denominator",
      p["launches"]["total"] == 100)
check("and the payload SAYS which population survival runs over",
      "never over all launches" in p["tracked"]["note"])

print("\n=== 3. WHERE THEY DIED — straight off the record")
reset()
for i, age in enumerate(("1h", "24h", "3d", "30d")):
    birth("M%d" % i, NOW - timedelta(days=40), True)
    store.record_death("M%d" % i, NOW - timedelta(days=1),
                       "liquidity_pulled" if i % 2 else "faded", age, {},
                       created_at=(NOW - timedelta(days=40)).isoformat())
p = summary.build(NOW)
check("each death lands in its own checkpoint bucket",
      [p["died"]["by_age_at_death"][a] for a in ("1h", "24h", "3d", "30d")] == [1, 1, 1, 1],
      p["died"]["by_age_at_death"])
check("every grid age is present even at zero — no absent-as-valid",
      set(p["died"]["by_age_at_death"]) == set(summary.GRID_LABELS))
check("★ faded and liquidity_pulled are never collapsed",
      p["died"]["by_class"] == {"faded": 2, "liquidity_pulled": 2}, p["died"]["by_class"])

print(chr(10) + "=== 3b. THE CHECKPOINT ORDER SURVIVES THE JSON — caught on the live page")
# ⛔ THE PAYLOAD IS WRITTEN WITH sort_keys=True, so `by_age_at_death` comes back
#    ALPHABETICALLY: 1h, 24h, 30d, 3d, 6h, 7d, 90d. A page reading Object.keys()
#    then renders 30 days BETWEEN 24 hours and 3 days. The numbers were right and
#    the sequence was nonsense — invisible to every check here until I looked at
#    the rendered page. The order is now carried explicitly.
on_disk = json.load(open(summary.SUMMARY_PATH, encoding="utf-8"))
check("★ the payload carries the checkpoint order explicitly",
      on_disk.get("grid_ages") == list(summary.GRID_LABELS), on_disk.get("grid_ages"))
check("POSITIVE CONTROL — the bucket keys ALONE are out of order, which is why "
      "the explicit list is needed",
      list(on_disk["died"]["by_age_at_death"]) != list(summary.GRID_LABELS),
      list(on_disk["died"]["by_age_at_death"]))

print("\n=== 4. THE SURVIVOR AGING BUCKETS")
reset()
birth("OLD", NOW - timedelta(days=95), True)      # older than every bucket
birth("MID", NOW - timedelta(days=10), True)      # past 3d and 7d only
birth("NEW", NOW - timedelta(hours=2), True)      # past nothing
p = summary.build(NOW)
by = p["alive"]["by_age"]
check("survived 3d counts the two old enough", by["3d"] == 2, by)
check("survived 7d counts the same two", by["7d"] == 2, by)
check("survived 30d counts only the oldest", by["30d"] == 1, by)
check("survived 90d counts only the oldest", by["90d"] == 1, by)
check("only the displayed ages appear", set(by) == set(p["display_ages"]), by)

print("\n=== 5. THE OLDEST-100 TABLE")
reset()
for i in range(120):
    birth("S%03d" % i, NOW - timedelta(days=80, hours=120 - i), True)
p = summary.build(NOW)
rows = p["oldest_survivors"]
check("capped at 100", len(rows) == 100, len(rows))
check("★ oldest FIRST", rows[0]["mint"] == "S000" and rows[1]["mint"] == "S001",
      [r["mint"] for r in rows[:2]])
check("each row carries its age in days", rows[0]["age_days"] > 80, rows[0]["age_days"])
check("and what it was born with", rows[0]["initial_size"] == 1.5)

# NEGATIVE CONTROL: a dead token must drop out of the table.
store.record_death("S000", NOW, "faded", "30d", {},
                   created_at=(NOW - timedelta(days=85)).isoformat())
p = summary.build(NOW)
check("NEGATIVE CONTROL — a dead token leaves the survivor table",
      p["oldest_survivors"][0]["mint"] == "S001",
      p["oldest_survivors"][0]["mint"])

print("\n=== 6. AN UNTRACKED TOKEN IS NEVER LISTED AS A SURVIVOR")
reset()
birth("GHOST", NOW - timedelta(days=80), False)   # never checked, never checkable
birth("REAL", NOW - timedelta(days=79), True)
p = summary.build(NOW)
mints = [r["mint"] for r in p["oldest_survivors"]]
check("⛔ the unfollowed token is NOT a survivor — it is our blind spot",
      "GHOST" not in mints, mints)
check("POSITIVE CONTROL — the followed one IS listed", "REAL" in mints, mints)

print("\n=== 7. THE FILE IS PUBLISHED, ATOMICALLY AND WORLD-READABLE")
check("the summary file exists", os.path.exists(summary.SUMMARY_PATH))
check("no temp file is left behind", not os.path.exists(summary.SUMMARY_PATH + ".tmp"))
on_disk = json.load(open(summary.SUMMARY_PATH, encoding="utf-8"))
check("★ what is on disk matches what was returned",
      on_disk["launches"]["total"] == p["launches"]["total"])
check("it is readable by others (the trading app runs as a different user)",
      (os.stat(summary.SUMMARY_PATH).st_mode & 0o004) != 0)
# ⛔ A READABLE FILE INSIDE AN UNTRAVERSABLE DIRECTORY IS AN UNREADABLE FILE.
#    Measured on staging: the file was 0644 and `deploy` still could not open
#    it, because the store above it is 0750. The whole chain has to be checked,
#    not the leaf — and the failure presents as an EMPTY PAGE, not an error.
# ⚠️ AND THE MODE CHECKS ARE SKIPPED ON WINDOWS RATHER THAN QUIETLY PASSING.
#    NTFS reports 0o777 for every directory, so these assertions would be TRUE
#    regardless of what the code did — a check that cannot come out differently
#    is not a check. Stated as SKIPPED so the count never claims coverage it
#    does not have; the binding verification is the live one on staging, which
#    tries the read AS the trading app's user rather than inspecting a mode.
if os.name == "posix":
    check("★ the published DIRECTORY is traversable and listable",
          (os.stat(summary.PUBLIC_DIR).st_mode & 0o005) == 0o005,
          oct(os.stat(summary.PUBLIC_DIR).st_mode))
    check("★ the store above it is TRAVERSABLE but NOT listable",
          (os.stat(summary.ROOT).st_mode & 0o001) == 0o001
          and (os.stat(summary.ROOT).st_mode & 0o004) == 0,
          oct(os.stat(summary.ROOT).st_mode))
else:
    print("  SKIP the two directory-mode checks — NTFS reports 0o777 for every "
          "directory, so they would pass without testing anything.")
    print("       Verified on staging instead, by attempting the read as the "
          "trading app's own user.")

print("\n=== 8. THE FOLD IS INCREMENTAL — a second pass must not double-count")
# The census is never deleted, so a full re-read would be hundreds of MB hourly
# on the box running live trading. The cursor is what makes it O(new rows).
before = summary.build(NOW)["launches"]["total"]
after = summary.build(NOW)["launches"]["total"]
check("★ running twice does not double the counts", before == after, (before, after))
birth("EXTRA", NOW - timedelta(days=1), True)
check("POSITIVE CONTROL — but a NEW birth still lands",
      summary.build(NOW)["launches"]["total"] == before + 1)

print("\n%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
