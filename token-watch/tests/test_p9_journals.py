"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P9 (OBJ-7): every closed month's spend journal is drained from its own cursor
(spend archived, never charged to the current month; inclusion folded), and a fully-folded closed journal moves to the
cold tier through compress -> whole-copy verify -> remove; a short one, or one whose cold name exists, is refused.

Run:  python tests/test_p9_journals.py        (exit 0 = every check passed)
"""

import gzip
import json
import os
import shutil
import sys
import tempfile
from datetime import datetime, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-p9-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import budget  # noqa: E402
import store  # noqa: E402
import tier  # noqa: E402
from config import COLD_DIR, CREDITS, STATE_DIR  # noqa: E402

UTC = timezone.utc
NOW = datetime(2026, 11, 15, 2, 0, tzinfo=UTC)
PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def reset():
    shutil.rmtree(ROOT, ignore_errors=True)
    os.makedirs(ROOT)
    store.ensure_dirs()
    os.makedirs(STATE_DIR, exist_ok=True)


def jpath(key):
    return os.path.join(STATE_DIR, "spend-journal-%s.jsonl" % key)


def write_journal(key, rows):
    with open(jpath(key), "w", encoding="utf-8", newline="") as fh:
        for r in rows:
            fh.write(json.dumps(r, sort_keys=True) + NL)
    return os.path.getsize(jpath(key))


def birth_row(day, reason="not_sampled"):
    return {"ts": day + "T00:00:00+00:00", "kind": "birth", "n": 1, "day": day, "reason": reason}


print(NL + "=== J1. THE CLOSED MONTHS ARE READ FROM THE DIRECTORY, OLDEST FIRST, CURRENT MONTH EXCLUDED")
reset()
for k in ("2026-08", "2026-09", "2026-10", "2026-11"):
    write_journal(k, [birth_row(k + "-01")])
open(os.path.join(STATE_DIR, "spend-journal-junk.jsonl"), "w").write("")
check("J1 2026-08..10 listed, 2026-11 (current) and junk not", budget.closed_journal_months(NOW) == [
    "2026-08", "2026-09", "2026-10"], budget.closed_journal_months(NOW))

print(NL + "=== J2. EVERY CLOSED MONTH DRAINS FROM ITS OWN CURSOR; SPEND ARCHIVED, INCLUSION FOLDED, NOTHING CHARGED FORWARD")
reset()
size8 = write_journal("2026-08", [birth_row("2026-08-30")] * 3)
sept = [birth_row("2026-09-29")] * 4
size9a = write_journal("2026-09", sept)                              # folded up to here in September
size9 = write_journal("2026-09", sept + [birth_row("2026-09-30", "trait_carrier")] * 2)   # the unfolded tail
size10 = write_journal("2026-10", [birth_row("2026-10-%02d" % d) for d in range(1, 6)])
store.save_state("journal_cursors", {"2026-08": size8, "2026-09": size9a})
out = budget._drain_closed_months(NOW)
cur = store.load_state("journal_cursors", {})
arch = store.load_state("closed_months", {})
inc = store.load_state("inclusion", {})
check("J2 drained: September's 2-row tail and all 5 October rows; August (fully folded) nothing",
      out == {"drained": 7, "by_month": {"2026-09": 2, "2026-10": 5}}, out)
check("J2 every closed cursor now equals its file size", cur == {"2026-08": size8, "2026-09": size9, "2026-10": size10}, cur)
check("J2 the spend is ARCHIVED per closed month", arch.get("2026-09", {}).get("birth") == 2 * CREDITS["birth"]
      and arch.get("2026-10", {}).get("birth") == 5 * CREDITS["birth"], arch)
check("J2 inclusion tallies folded into their days", inc.get("2026-09-30", {}).get("trait_carrier") == 2
      and all(inc.get("2026-10-%02d" % d, {}).get("launches") == 1 for d in range(1, 6)), inc)
check("J2 nothing charged to the CURRENT month's ledger", budget.spent_total(NOW) == 0, budget.spent_total(NOW))
out2 = budget._drain_closed_months(NOW)
check("J2 idempotent: a second drain reads nothing", out2["drained"] == 0, out2)

print(NL + "=== J3. fold_pending DRAINS EVERY CLOSED MONTH FIRST (not only last month)")
reset()
write_journal("2026-09", [birth_row("2026-09-10")] * 2)
write_journal("2026-10", [birth_row("2026-10-10")] * 3)
budget.fold_pending(NOW)
cur = store.load_state("journal_cursors", {})
check("J3 both September and October drained by the current month's fold",
      cur.get("2026-09") == os.path.getsize(jpath("2026-09")) and cur.get("2026-10") == os.path.getsize(jpath("2026-10")), cur)


def cold(key):
    return os.path.join(COLD_DIR, "spend-journal-%s.jsonl.gz" % key)


print(NL + "=== T1. A FULLY FOLDED CLOSED JOURNAL MOVES TO COLD, BYTE-IDENTICAL; A SHORT ONE IS REFUSED AND KEPT")
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 50)
raw9 = open(jpath("2026-09"), "rb").read()
s10 = write_journal("2026-10", [birth_row("2026-10-10")] * 50)
s11 = write_journal("2026-11", [birth_row("2026-11-10")] * 5)
store.save_state("journal_cursors", {"2026-09": s9, "2026-10": s10 - 10, "2026-11": s11})
r = tier.tier_closed_journals(NOW)
check("T1 September moved, October (folded to 10 bytes short) refused", r["journals_moved"] == ["2026-09"]
      and r["journals_refused"] == ["2026-10"] and r["journals_freed_bytes"] == s9, r)
check("T1 the cold copy decompresses to exactly the hot bytes", os.path.exists(cold("2026-09"))
      and gzip.open(cold("2026-09"), "rb").read() == raw9)
check("T1 the hot September journal is gone; October and the current month are untouched",
      not os.path.exists(jpath("2026-09")) and os.path.exists(jpath("2026-10")) and os.path.exists(jpath("2026-11"))
      and not os.path.exists(cold("2026-10")) and not os.path.exists(cold("2026-11")))
check("T1 no temp file left behind", not any(n.endswith(".tmp") for n in os.listdir(COLD_DIR)), os.listdir(COLD_DIR))

print(NL + "=== T2. AN EXISTING COLD FILE IS NEVER OVERWRITTEN")
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 3)
store.save_state("journal_cursors", {"2026-09": s9})
os.makedirs(COLD_DIR, exist_ok=True)
with gzip.open(cold("2026-09"), "wb") as fh:
    fh.write(b"the already-uploaded copy")
r = tier.tier_closed_journals(NOW)
check("T2 refused, the old cold file intact, the hot journal kept", r["journals_refused"] == ["2026-09"]
      and gzip.open(cold("2026-09"), "rb").read() == b"the already-uploaded copy" and os.path.exists(jpath("2026-09")), r)

print(NL + "=== T3. A COLD COPY THAT DOES NOT READ BACK IDENTICAL KEEPS THE HOT COPY")
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 20)
store.save_state("journal_cursors", {"2026-09": s9})
_real_gzip_open = tier.gzip.open


class ShortRead:
    def __init__(self, fh):
        self.fh, self.done = fh, False

    def __enter__(self):
        return self

    def __exit__(self, *a):
        self.fh.close()

    def read(self, n=-1):
        if self.done:
            return b""
        self.done = True
        return self.fh.read(10)                  # the read-back sees only 10 bytes


def short_gzip_open(path, mode="rb", *a, **k):
    fh = _real_gzip_open(path, mode, *a, **k)
    return ShortRead(fh) if "r" in mode else fh


tier.gzip.open = short_gzip_open
try:
    r = tier.tier_closed_journals(NOW)
finally:
    tier.gzip.open = _real_gzip_open
check("T3 refused, the hot journal kept, no cold file and no temp left", r["journals_refused"] == ["2026-09"]
      and os.path.exists(jpath("2026-09")) and not os.path.exists(cold("2026-09"))
      and not any(n.endswith(".tmp") for n in os.listdir(COLD_DIR)), r)

print(NL + "=== T4. tier.run CARRIES THE JOURNAL STEP, INSIDE THE LOCK")
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 3)
store.save_state("journal_cursors", {"2026-09": s9})
r = tier.run(NOW)
check("T4 tier.run moved the folded closed journal", r.get("journals_moved") == ["2026-09"], r)

import subprocess  # noqa: E402
from datetime import timedelta  # noqa: E402


def tier_main_rc():
    """tier.py's __main__ as the timer runs it (no lock held), against this test's store."""
    r = subprocess.run([sys.executable, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))),
                                                      "tier.py")], capture_output=True, text=True,
                       env=dict(os.environ, TOKEN_WATCH_ROOT=ROOT), timeout=120)
    return r.returncode, r.stderr


print(NL + "=== R1. A FAILED MOVE REACHES THE CARRIER: an existing cold file, or a copy that does not read back, exits 1"
      " (Langston, P9 Step 4 BLOCKER)")
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 3)
store.save_state("journal_cursors", {"2026-09": s9})
os.makedirs(COLD_DIR, exist_ok=True)
with gzip.open(cold("2026-09"), "wb") as fh:
    fh.write(b"an earlier copy")
rc, err = tier_main_rc()
check("R1 an existing cold file -> tier exits 1 and names it", rc == 1 and "already exists" in err, (rc, err[-300:]))
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 3)
store.save_state("journal_cursors", {"2026-09": s9})
r = tier.tier_closed_journals(NOW)
check("R1 POSITIVE CONTROL: a clean move is not failed", r["journals_failed"] == [] and r["journals_moved"] == ["2026-09"], r)
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 20)
store.save_state("journal_cursors", {"2026-09": s9})
tier.gzip.open = short_gzip_open
try:
    r = tier.run(NOW)
finally:
    tier.gzip.open = _real_gzip_open
check("R1 a copy that does not read back -> counted in run's refused (what __main__ exits 1 on)",
      r.get("journals_failed") == ["2026-09"] and r.get("refused", 0) >= 1, r)

print(NL + "=== R2. A SHORT JOURNAL WAITS QUIETLY, THEN FAILS AFTER JOURNAL_SHORT_STALE_AFTER; a torn last line is the case")
reset()
write_journal("2026-09", [birth_row("2026-09-10")] * 2)
with open(jpath("2026-09"), "a", encoding="utf-8", newline="") as fh:
    fh.write('{"kind": "birth", "n": 1, "day": "2026-09-30"')        # a torn last line: no newline, never completed
budget._drain_closed_months(NOW)
cur = store.load_state("journal_cursors", {}).get("2026-09")
size = os.path.getsize(jpath("2026-09"))
check("R2 the drain stops short of a torn last line (the waiting state is real)", cur is not None and cur < size,
      (cur, size))
rc1, err1 = tier_main_rc()
check("R2 first seen short: quiet (exit 0), refused, not failed", rc1 == 0
      and "short since" in err1, (rc1, err1[-300:]))
# the run itself must WRITE the first-seen record: it is what starts the 3-day clock (Langston, P9 re-roll: with
# `setdefault` -> `get` the clock never starts and a short journal warns quietly forever)
_first = store.load_state(tier.JOURNAL_SHORT_STATE, {}).get("2026-09")
try:
    _age = abs((datetime.now(UTC) - datetime.fromisoformat(_first)).total_seconds())
except (TypeError, ValueError):
    _age = None
check("R2 the first-seen-short record is written BY THE RUN, within a minute of now", _age is not None and _age < 60,
      (_first, _age))
store.save_state(tier.JOURNAL_SHORT_STATE, {"2026-09": (datetime.now(UTC) - timedelta(days=4)).isoformat()})
rc2, err2 = tier_main_rc()
check("R2 still short 4 days later: exit 1, named as a torn line or a stopped drain", rc2 == 1
      and "torn last line" in err2, (rc2, err2[-300:]))
reset()
s9 = write_journal("2026-09", [birth_row("2026-09-10")] * 2)
store.save_state("journal_cursors", {"2026-09": s9})
store.save_state(tier.JOURNAL_SHORT_STATE, {"2026-09": (NOW - timedelta(days=1)).isoformat()})
tier.tier_closed_journals(NOW)
check("R2 once the journal is folded and moved, its short-since record is forgotten",
      store.load_state(tier.JOURNAL_SHORT_STATE, {}) == {}, store.load_state(tier.JOURNAL_SHORT_STATE, {}))

print(NL + "=== R3. THE WRITER AND THE FINDER SHARE ONE NAME; the dead _previous_month is gone")
check("R3 journal_path is built from store's constants", os.path.basename(budget.journal_path(NOW)) == "%s%s%s" % (
    store.JOURNAL_PREFIX, "2026-11", store.JOURNAL_SUFFIX), budget.journal_path(NOW))
check("R3 budget._previous_month no longer exists", not hasattr(budget, "_previous_month"))

print(NL + "=== D1. THE ONE-TIME TOOL: dry run writes nothing; --apply drains under the lock")
reset()
write_journal("2026-10", [birth_row("2026-10-10")] * 4)
sys.path.insert(0, os.path.join(os.path.dirname(os.path.dirname(os.path.abspath(__file__))), "tools"))
import drain_closed_journals as tool  # noqa: E402
rc_dry = tool.main([])
check("D1 dry run: exit 0 and no cursor written", rc_dry == 0 and store.load_state("journal_cursors", {}) == {})
rc = tool.main(["--apply"])
check("D1 --apply: October drained to its size", rc == 0 and store.load_state("journal_cursors", {}).get("2026-10")
      == os.path.getsize(jpath("2026-10")))
with store.periodic_lock("follow_up") as held:
    rc_locked = tool.main(["--apply"])
check("D1 refused (exit 2) while another job holds the lock", rc_locked == 2, rc_locked)

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
