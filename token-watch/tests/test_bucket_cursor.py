"""
token-watch — THE OPEN HOUR IS READ BUT NEVER CONSUMED.

⛔⛔ THE DEFECT, MEASURED LIVE 2026-08-31: the sweep read the CURRENT hour's
   bucket and then marked that hour consumed -- while the hour was still open
   and entries were still being appended to it. Bucket 18 held 2,375
   checkpoints; 1,245 were attempted and **1,130 were never read at all**.
   The cursor said `last_bucket: 2026-08-31T18`, so the next run started at
   19 and those entries became unreachable.

★ AND A DROPPED CHECKPOINT IS STRICTLY WORSE THAN A SHED ONE. A shed leaves a
  row, which is exactly why survival is published as an UPPER BOUND. A dropped
  entry leaves nothing and is indistinguishable from a token nobody needed to
  check -- it does not widen the bound, it silently narrows the population.

⇒ THE FIX HAS TWO HALVES AND BOTH ARE NEEDED:
  (1) the cursor advances only over hours that have FULLY ELAPSED, and
  (2) the open hour carries a LINE HIGH-WATER MARK, so re-reading it resumes
      rather than re-observing -- because re-observing spends the liquidity
      carve twice, which is the double-spend the old code avoided by
      consuming the bucket outright.
  Block 3 is the one that fails if either half is missing.
"""

import os
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-cursor-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
os.environ["TOKEN_WATCH_REQ_PER_MIN"] = "0"        # no real pacing in a suite
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import follow_up  # noqa: E402
import providers  # noqa: E402
import store  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
# 12:30 -- deliberately MID-hour, because the whole defect is about an hour
# that is still open. A test pinned to :00 would never exercise it.
NOW = datetime(2026, 8, 31, 12, 30, 0, tzinfo=UTC)
OPEN_H = NOW.replace(minute=0, second=0, microsecond=0)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  PASS  " + label)
    else:
        FAIL += 1
        print("  FAIL  " + label + ("  -- " + detail if detail else ""))


def stub_alive():
    providers.token_state = lambda mint: {
        "alive": True, "price_usd": 1.0, "volume_h24": 1.0,
        "buys_h24": 1, "sells_h24": 1, "liquidity_usd": 100.0,
        "pair_created_at": None, "dex_id": "pumpfun", "pairs": 1,
        "socials": {"telegram": False, "twitter": False, "website": False},
    }


def queue(mint, hour, due_at):
    """Append one entry straight into an hour bucket, as scheduling does."""
    store._append(store.due_path(hour),
                  {"mint": mint, "age": "1h", "due_at": due_at.isoformat()})


def observed_mints():
    import glob, json
    out = []
    for f in glob.glob(ROOT + "/observations/*.jsonl"):
        with open(f, encoding="utf-8") as fh:
            for l in fh:
                if l.strip():
                    r = json.loads(l)
                    if r.get("observed"):
                        out.append(r["mint"])
    return out


stub_alive()
DUE = OPEN_H - timedelta(minutes=5)          # already due, so it is observable

print("\nBLOCK 1 -- A RUN OVER THE OPEN HOUR DOES NOT CONSUME IT")
queue("MintA", OPEN_H, DUE)
queue("MintB", OPEN_H, DUE)
follow_up.run_hour(NOW)
st = store.load_state("follow_up_cursor", {})
check("both entries present in the open hour were observed",
      sorted(set(observed_mints())) == ["MintA", "MintB"], str(observed_mints()))
check("the cursor did NOT mark the open hour consumed",
      st.get("last_bucket") != OPEN_H.strftime("%Y-%m-%dT%H"),
      "last_bucket=%s open=%s" % (st.get("last_bucket"), OPEN_H.strftime("%Y-%m-%dT%H")))
check("it recorded how far into the open hour it got",
      (st.get("marks") or {}).get(OPEN_H.strftime("%Y-%m-%dT%H")) == 2, str(st))

print("\nBLOCK 2 -- THE ELAPSED HOUR IS CONSUMED, OR EVERY RUN RE-WALKS IT")
# ⛔ The half of the old behaviour that was RIGHT. Without it a quiet hour is
#    re-read forever and the catch-up bound is spent on nothing.
later = NOW + timedelta(hours=1)             # now hour 12 has fully elapsed
follow_up.run_hour(later)
st2 = store.load_state("follow_up_cursor", {})
check("the cursor now covers the hour that has elapsed",
      st2.get("last_bucket") == OPEN_H.strftime("%Y-%m-%dT%H"), str(st2))
# ⛔ THE MARK FOR THE HOUR THAT JUST ELAPSED MUST SURVIVE, or the next run
#    re-reads that bucket from line 0 and re-observes everything in it.
check("...and the mark for the hour that just elapsed SURVIVED the rollover",
      (st2.get("marks") or {}).get(OPEN_H.strftime("%Y-%m-%dT%H")) == 2, str(st2))

print("\nBLOCK 3 -- LATE ARRIVALS ARE PICKED UP, AND NOTHING IS OBSERVED TWICE")
# ⛔⛔ THE DISCRIMINATING BLOCK -- THIS IS THE LIVE DEFECT, REPRODUCED.
#     Entries are appended to an hour AFTER a run has already read it. That is
#     not an edge case: tokens are born continuously and their 1h checkpoint
#     lands in the hour that is currently open, so it happens every hour.
ROOT2_H = later.replace(minute=0, second=0, microsecond=0)
NOW2 = later
queue("MintC", ROOT2_H, ROOT2_H - timedelta(minutes=5))
follow_up.run_hour(NOW2 + timedelta(minutes=10))
first = observed_mints()
check("the entry present at the first read was observed",
      first.count("MintC") == 1, str(first))

# now the late arrival, into the SAME still-open hour
queue("MintD", ROOT2_H, ROOT2_H - timedelta(minutes=5))
follow_up.run_hour(NOW2 + timedelta(minutes=20))
second = observed_mints()
check("★ THE LATE ARRIVAL WAS PICKED UP (the 1,130 case)",
      "MintD" in second, str(second))
check("★ AND THE EARLIER ENTRY WAS NOT OBSERVED TWICE",
      second.count("MintC") == 1,
      "MintC observed %d times" % second.count("MintC"))
check("...nor were the first hour's entries re-observed",
      second.count("MintA") == 1 and second.count("MintB") == 1,
      "A=%d B=%d" % (second.count("MintA"), second.count("MintB")))

print("\nBLOCK 4 -- THE CURSOR NEVER MOVES BACKWARDS")
# A late/replayed run must not un-consume hours already finished, or the
# catch-up walks them again and re-spends every entry in them.
before = store.load_state("follow_up_cursor", {}).get("last_bucket")
follow_up.run_hour(NOW)                            # an OLD `now`, deliberately
after = store.load_state("follow_up_cursor", {}).get("last_bucket")
check("a run with an older clock does not rewind the cursor",
      after >= before, "before=%s after=%s" % (before, after))

print("\n%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
