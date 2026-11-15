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
