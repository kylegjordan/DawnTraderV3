"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P2b-1: the dead set held compactly (F-b), one dead set shared with the
summary (F-a), the summary never reading an unreadable tombstone file as "nothing is dead" (R3), bad tombstone lines
counted and made a run error (R4), and the observations read streamed with its old semantics kept exactly (F-c, R5).

Run:  python tests/test_p2b_memory_fixes.py        (exit 0 = every check passed)

⛔ Fixture mints are ordinary short ASCII strings ('M00042', 'DEAD1') on purpose: they take the 44-byte stride, so the
   BISECT path is what these checks exercise (Langston R1: a decoded form would have sent every one of them to the
   overflow set and left the bisect untested). D1 asserts the overflow set is EMPTY for them.
"""

import json
import os
import random
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p2b-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import store  # noqa: E402
import summary  # noqa: E402
import follow_up  # noqa: E402
from config import OBSERVATIONS_DIR  # noqa: E402

UTC = timezone.utc
NOW = datetime(2026, 11, 30, 12, 0, 0, tzinfo=UTC)
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def reset():
    for name in os.listdir(ROOT):
        p = os.path.join(ROOT, name)
        if os.path.isdir(p):
            shutil.rmtree(p, ignore_errors=True)
        else:
            os.remove(p)
    store.ensure_dirs()
    store._DEAD_CACHE["mtime"] = None
    store._DEAD_CACHE["set"] = store.DeadSet()
    store._DEAD_STATUS["bad_lines"] = 0


def write_tombstones(lines):
    os.makedirs(os.path.dirname(store.tombstone_path()), exist_ok=True)
    with open(store.tombstone_path(), "w", encoding="utf-8") as fh:
        for x in lines:
            fh.write((x if isinstance(x, str) else json.dumps(x)) + "\n")


def birth(mint, created):
    return store.record_birth(
        mint=mint, created_at=created, first_seen_at=created,
        venue="PUMP_FUN", initial_size=1.5, initial_liquidity=None,
        creator="C1", size_source="feePayer_sole_transfer", socials={},
        followed=True, follow_reason="trait_carrier")


print("\n=== D1. THE BISECT PATH: short ASCII mints live in the sorted buffer, not the overflow set")
reset()
mints = ["M%05d" % i for i in range(0, 4000, 2)]          # even numbers only
write_tombstones([{"mint": m} for m in mints] + [{"mint": mints[7]}])   # one duplicate
ds = store.dead_set()
check("D1 every recorded mint is IN", all(m in ds for m in mints))
check("D1 no unrecorded mint is in (the odd numbers, and one past each end)",
      not any(("M%05d" % i) in ds for i in range(1, 4001, 2)) and "M" not in ds and "Z99999" not in ds)
check("D1 the overflow set is EMPTY - the bisect path decided every answer", len(ds._extra) == 0, len(ds._extra))
check("D1 one contiguous buffer, de-duplicated: n x 44 bytes", ds.buffer_bytes() == len(mints) * 44 and len(ds) == len(mints),
      (ds.buffer_bytes(), len(ds)))
check("D1 None and a non-string are simply not members", None not in ds and 42 not in ds)

print("\n=== D2. MINTS THAT CANNOT TAKE THE STRIDE go to the overflow set and are NEVER dropped")
reset()
long_m, uni_m, nul_m = "L" * 45, "MÏNT", "A\x00B"
write_tombstones([{"mint": long_m}, {"mint": uni_m}, {"mint": nul_m}, {"mint": "OK1"}])
ds = store.dead_set()
check("D2 a 45-char, a non-ASCII and a NUL-bearing mint are all members", all(m in ds for m in (long_m, uni_m, nul_m)))
check("D2 they are in the overflow set, the ordinary one in the buffer", len(ds._extra) == 3 and ds.buffer_bytes() == 44,
      (len(ds._extra), ds.buffer_bytes()))
check("D2 a 44-char mint takes the stride exactly", store._dead_key("X" * 44) == b"X" * 44)

print("\n=== D3. THE CONTRACT: a reference taken BEFORE a death sees it (store.py's cache comment)")
reset()
write_tombstones([{"mint": "DEAD1"}])
before = store.dead_set()
store.record_death("DEAD2", NOW, "faded", "1h", {})
check("D3 the earlier reference sees the in-run death", "DEAD2" in before)
check("D3 and it is the SAME object dead_set() now returns", store.dead_set() is before)
check("POSITIVE CONTROL D3: the pre-existing death is there too", "DEAD1" in before)

print("\n=== D4. AN EXTERNAL WRITE (mtime change) is picked up by a rebuild")
import time as _time  # noqa: E402
_time.sleep(0.02)
with open(store.tombstone_path(), "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"mint": "EXTERNAL1"}) + "\n")
os.utime(store.tombstone_path(), None)
check("D4 the external death is seen", "EXTERNAL1" in store.dead_set())
check("D4 and the in-run death survives the rebuild (it is on the file)", "DEAD2" in store.dead_set())

print("\n=== D5. A BAD TOMBSTONE LINE IS COUNTED, NEVER RAISED (R4)")
reset()
write_tombstones([{"mint": "GOOD1"}, "{not json", "123", json.dumps({"x": 1}), json.dumps({"mint": ""}), {"mint": "GOOD2"}])
try:
    ds = store.dead_set()
    raised = None
except Exception as exc:
    ds, raised = None, type(exc).__name__
check("D5 no exception", raised is None, raised)
check("D5 the good mints are members", ds is not None and "GOOD1" in ds and "GOOD2" in ds)
check("D5 four bad lines counted (unparseable, not an object, no mint, empty mint)",
      store.dead_set_status()["bad_lines"] == 4, store.dead_set_status())

print("\n=== D6. AN UNREADABLE TOMBSTONE FILE RAISES - it is never an empty set")
reset()
os.makedirs(store.tombstone_path())          # exists, has an mtime, cannot be opened as a file
try:
    store.dead_set()
    got = "no exception"
except OSError as exc:
    got = "OSError"
check("D6 dead_set raises OSError", got == "OSError", got)

print("\n=== S1. THE SUMMARY WITHHOLDS THE SURVIVOR TABLE WHEN THE TOMBSTONES CANNOT BE READ (R3)")
reset()
birth("CORPSE", NOW - timedelta(days=80))
birth("ALIVE1", NOW - timedelta(days=79))
store.record_death("CORPSE", NOW - timedelta(days=70), "faded", "7d", {})
p = summary.build(NOW)
mints = [r["mint"] for r in p["oldest_survivors"]]
check("POSITIVE CONTROL S1: readable tombstones - the corpse is excluded, the living one listed",
      "CORPSE" not in mints and "ALIVE1" in mints, mints)
check("S1 no note when the read was clean", p.get("oldest_survivors_note") is None, p.get("oldest_survivors_note"))
# ⚠️ A tombstone file that is unreadable OUTRIGHT already fails build loudly earlier, in _fold's own incremental
#    read (summary.py _read_new) - the follow-up catches it as "summary build failed". So the withheld path is the
#    case where _fold read the file and the dead-set read then failed (a transient): simulated at the call itself.
real_dead_set = summary.dead_set


def dead_set_unreadable():
    raise PermissionError("simulated")


summary.dead_set = dead_set_unreadable
try:
    p = summary.build(NOW)
finally:
    summary.dead_set = real_dead_set
check("S1 unreadable: the table is WITHHELD (empty) - the corpse is not listed as a survivor",
      p["oldest_survivors"] == [], p["oldest_survivors"])
check("S1 and the reason is published beside it", "withheld" in (p.get("oldest_survivors_note") or ""),
      p.get("oldest_survivors_note"))

print("\n=== S2. BAD TOMBSTONE LINES ARE NAMED ON THE TABLE")
reset()
birth("ALIVE2", NOW - timedelta(days=60))
write_tombstones([{"mint": "OTHER"}, "{broken"])
p = summary.build(NOW)
check("S2 the note names the unreadable line count", "1 tombstone line" in (p.get("oldest_survivors_note") or ""),
      p.get("oldest_survivors_note"))

print("\n=== S3. ROWS EXCLUDED AS UNRESOLVED QUOTE CURRENCIES ARE COUNTED ON THE PAYLOAD (R4: _unresolved had no reader)")
reset()
birth("REAL1", NOW - timedelta(days=50))
real_census = summary.store_census


def census_with_unresolved(day, *a, **k):
    rows = real_census(day, *a, **k)
    return rows + [{"mint": "USDC-LIKE", "mint_unresolved": True, "created_at": rows[0]["created_at"] if rows else None}]


summary.store_census = census_with_unresolved
try:
    p = summary.build(NOW)
finally:
    summary.store_census = real_census
check("S3 the excluded count reaches the payload", p.get("oldest_survivors_unresolved_excluded") == 1,
      p.get("oldest_survivors_unresolved_excluded"))
check("S3 and the excluded row is not listed", "USDC-LIKE" not in [r["mint"] for r in p["oldest_survivors"]])

print("\n=== S4. A NON-OBJECT TOMBSTONE LINE DOES NOT KILL THE BUILD (fold-in 1) and is counted")
reset()
birth("ALIVE4", NOW - timedelta(days=40))
write_tombstones([{"mint": "DEADX", "age_at_death": "1h", "death_class": "faded"}, "123", "[1]", "{broken"])
try:
    p = summary.build(NOW)
    err = None
except Exception as exc:
    p, err = {}, type(exc).__name__
check("S4 summary.build survives non-object and unparseable tombstone lines", err is None, err)
check("S4 the fold counts the three it skipped", p.get("fold_skipped_lines") == 3, p.get("fold_skipped_lines"))
check("S4 and the good death is still counted", (p.get("died") or {}).get("total") == 1, (p.get("died") or {}).get("total"))

print("\n=== D7. THE BAD-LINE COUNT IS MONOTONE ACROSS REBUILDS (fold-in 2)")
reset()
write_tombstones([{"mint": "K1"}, "{bad"])
store.dead_set()
first = store.dead_set_status()["bad_lines"]
_time.sleep(0.02)
write_tombstones([{"mint": "K1"}, {"mint": "K2"}])          # a clean rewrite triggers a rebuild
os.utime(store.tombstone_path(), None)
store.dead_set()
check("D7 a later clean rebuild does not erase the bad line already seen", first == 1
      and store.dead_set_status()["bad_lines"] == 1, (first, store.dead_set_status()))

print("\n=== O1. THE STREAMED OBSERVATIONS READ IS EXACTLY THE OLD ONE (R5), on 300 random fixtures")


def old_latest(mints, max_files=3):              # the code it replaced, verbatim in behaviour
    want, found = set(mints), {}
    files = sorted(os.listdir(OBSERVATIONS_DIR), reverse=True) if os.path.isdir(OBSERVATIONS_DIR) else []
    for name in files[:max_files]:
        if not want:
            break
        try:
            with open(os.path.join(OBSERVATIONS_DIR, name), encoding="utf-8") as fh:
                rows = [json.loads(x) for x in fh if x.strip()]
        except (OSError, ValueError):
            continue
        for r in reversed(rows):
            m = r.get("mint")
            if m in want and r.get("observed"):
                found[m] = r
                want.discard(m)
    return found


rng = random.Random(1197)
mismatch = 0
for trial in range(300):
    reset()
    os.makedirs(OBSERVATIONS_DIR, exist_ok=True)
    pool = ["P%d" % i for i in range(8)]
    for d in range(rng.randint(1, 5)):
        lines = []
        for k in range(rng.randint(0, 12)):
            lines.append(json.dumps({"mint": rng.choice(pool), "observed": rng.random() < 0.8, "seq": "%d-%d" % (d, k)}))
        if rng.random() < 0.15:
            lines.insert(rng.randint(0, len(lines)), "{bad line")
        with open(os.path.join(OBSERVATIONS_DIR, "2026-11-%02d.jsonl" % (10 + d)), "w", encoding="utf-8") as fh:
            fh.write("\n".join(lines) + ("\n" if lines else ""))
    ask = set(rng.sample(pool, rng.randint(1, len(pool))))
    mf = rng.randint(1, 4)
    if store.latest_observations_uncorrected(ask, mf) != old_latest(ask, mf):
        mismatch += 1
check("O1 identical results on all 300 fixtures (newest file first, positional newest, bad file skipped)",
      mismatch == 0, "%d mismatches" % mismatch)
# a fixed case that pins each rule on its own
reset()
os.makedirs(OBSERVATIONS_DIR, exist_ok=True)
with open(os.path.join(OBSERVATIONS_DIR, "2026-11-02.jsonl"), "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"mint": "A", "observed": True, "v": "new-first"}) + "\n")
    fh.write(json.dumps({"mint": "A", "observed": True, "v": "new-last"}) + "\n")
    fh.write(json.dumps({"mint": "B", "observed": False, "v": "not-observed"}) + "\n")
with open(os.path.join(OBSERVATIONS_DIR, "2026-11-01.jsonl"), "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"mint": "A", "observed": True, "v": "old"}) + "\n")
    fh.write(json.dumps({"mint": "B", "observed": True, "v": "old-b"}) + "\n")
got = store.latest_observations_uncorrected({"A", "B"}, 3)
check("O1 within a file the LAST matching row wins (positional)", got.get("A", {}).get("v") == "new-last", got.get("A"))
check("O1 an older file never overwrites a newer file's row", got.get("A", {}).get("v") != "old")
check("O1 an unobserved row is skipped and the older file supplies B", got.get("B", {}).get("v") == "old-b", got.get("B"))

print("\n=== F1. THE FOLLOW-UP RUN COUNTS A BAD TOMBSTONE LINE AS AN ERROR (R4)")
reset()
write_tombstones([{"mint": "DEAD9"}, "{garbage"])
stats = follow_up.run_hour(NOW)
check("F1 the bad line reaches stats", stats.get("tombstone_bad_lines") == 1, stats.get("tombstone_bad_lines"))
check("F1 and the run is not clean (errors > 0 -> exit 1)", stats.get("errors", 0) >= 1, stats.get("errors"))
reset()
write_tombstones([{"mint": "DEAD9"}])
stats = follow_up.run_hour(NOW)
check("POSITIVE CONTROL F1: a clean tombstone file adds no error", stats.get("tombstone_bad_lines") == 0
      and stats.get("errors", 0) == 0, (stats.get("tombstone_bad_lines"), stats.get("errors")))

print("\n=== J1. A NON-OBJECT JOURNAL LINE IS COUNTED, NEVER RAISED (budget fold, liveness)")
import budget  # noqa: E402
import liveness  # noqa: E402
reset()
jp = budget.journal_path(NOW)
os.makedirs(os.path.dirname(jp), exist_ok=True)
with open(jp, "w", encoding="utf-8") as fh:
    fh.write("123\n[]\nnull\n")
try:
    r = budget.fold_pending(NOW)
    err = None
except Exception as exc:
    r, err = {}, type(exc).__name__
check("J1 budget.fold_pending does not raise on non-object lines", err is None, err)
check("J1 and counts all three as bad lines", r.get("bad_lines") == 3, r)
try:
    lv = (liveness._parse_ts("123"), liveness._parse_ts("[1, 2]"))
    lerr = None
except Exception as exc:
    lv, lerr = None, type(exc).__name__
check("J1 liveness._parse_ts on a non-object line is None, not a raise", lerr is None and lv == (None, None),
      lerr or lv)
check("POSITIVE CONTROL J1: a real census row still parses",
      liveness._parse_ts(json.dumps({"first_seen_at": NOW.isoformat()})) is not None)

shutil.rmtree(ROOT, ignore_errors=True)
print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
