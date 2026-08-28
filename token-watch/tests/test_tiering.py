"""
token-watch — TIERING: the one-day hot window and the cold hand-off.

★ WHY THIS SUITE EXISTS (Kyle asked, 2026-08-28): the scope requires that raw
  fed-in data stays hot for ONE DAY and then moves to tiered storage. It was
  built — but the receiver's raw PROVENANCE store, added the same day, was not
  in it. A new bulky writer whose retention nobody extended is how a disk fills
  quietly, and on this box the disk is shared with the live trading app.

⛔ THE COLLISION CASE IS THE ONE THAT MATTERS. Both stores name files by date,
   so without a per-source prefix both would land on the SAME cold filename and
   the second would overwrite the first — tiering that destroys the file it
   just archived, which no total-count check could see.
"""

import gzip
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

ROOT = tempfile.mkdtemp(prefix="token-watch-tier-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import provenance  # noqa: E402
import store  # noqa: E402
import tier  # noqa: E402
from config import BULKY_HOT_DAYS, COLD_DIR  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
NOW = datetime(2026, 8, 28, 12, 0, 0, tzinfo=UTC)


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
    os.makedirs(provenance.RAW_DIR, exist_ok=True)


def age(path, days):
    """Backdate a file so the hot window can be exercised without waiting."""
    t = (NOW - timedelta(days=days)).timestamp()
    os.utime(path, (t, t))


def cold_files():
    return sorted(os.listdir(COLD_DIR)) if os.path.isdir(COLD_DIR) else []


print("\n=== 1. THE PROVENANCE STORE IS TIERED AT ALL (it was not, until today)")
reset()
p = os.path.join(provenance.RAW_DIR, "2026-08-25.jsonl")
open(p, "w", encoding="utf-8").write('{"body": "x"}\n')
age(p, 3)
out = tier.tier_payloads(NOW)
check("the raw provenance file is moved to cold", out["by_source"]["provenance-raw"] == 1, out)
check("★ and the hot copy is GONE — the point of a one-day hot window",
      not os.path.exists(p))
check("the cold copy exists", any("provenance-raw" in f for f in cold_files()), cold_files())

print("\n=== 2. THE COLD COPY IS READABLE — an archive that lost the data is worse than none")
body = gzip.open(os.path.join(COLD_DIR, cold_files()[0]), "rb").read().decode()
check("POSITIVE CONTROL — the archived bytes come back out", '"body": "x"' in body, body[:40])

print("\n=== 3. THE ONE-DAY HOT WINDOW ACTUALLY BINDS")
reset()
fresh = os.path.join(provenance.RAW_DIR, "2026-08-28.jsonl")
open(fresh, "w", encoding="utf-8").write('{"body": "today"}\n')
age(fresh, 0.5)                       # half a day old — INSIDE the window
out = tier.tier_payloads(NOW)
check("a file inside the hot window is LEFT ALONE", out["moved"] == 0, out)
check("and it is still hot", os.path.exists(fresh))
# NEGATIVE CONTROL: the same file, one day older, must move.
age(fresh, BULKY_HOT_DAYS + 1)
out = tier.tier_payloads(NOW)
check("NEGATIVE CONTROL — past the window the SAME file moves", out["moved"] == 1, out)

print("\n=== 4. ⛔ THE COLLISION — same date, two stores, must NOT overwrite")
# ★ TESTED AGAINST AN INJECTED SECOND SOURCE, because only one real bulky store
#   remains after PAYLOAD_DIR was deleted. The guarantee is about what happens
#   when a source is ADDED — and the module's own history says additions happen
#   and get missed — so it must stay tested even while unexercised in
#   production. Deleting this block with the store would have removed the only
#   thing standing between the next addition and a silent overwrite.
reset()
second = os.path.join(ROOT, "second-bulky")
os.makedirs(second, exist_ok=True)
same = "2026-08-25.jsonl"
a = os.path.join(second, same)
b = os.path.join(provenance.RAW_DIR, same)
open(a, "w", encoding="utf-8").write('{"which": "second"}\n')
open(b, "w", encoding="utf-8").write('{"which": "provenance"}\n')
age(a, 3)
age(b, 3)
saved = tier.TIERED_SOURCES
tier.TIERED_SOURCES = saved + ((second, "second"),)
try:
    out = tier.tier_payloads(NOW)
finally:
    tier.TIERED_SOURCES = saved
check("both files are moved", out["moved"] == 2, out)
check("★ TWO cold files exist, not one — no silent overwrite",
      len(cold_files()) == 2, cold_files())
# ...and both must still hold their OWN content.
found = set()
for f in cold_files():
    found.add(json.loads(gzip.open(os.path.join(COLD_DIR, f), "rb").read().decode())["which"])
check("★ and each retains its own content", found == {"second", "provenance"}, found)

print("\n=== 4b. 🗑 THE DELETED STORE IS GONE, AND STAYS GONE")
check("⛔ PAYLOAD_DIR no longer exists in config",
      not hasattr(__import__("config"), "PAYLOAD_DIR"))
check("and nothing tiers a 'payload' source any more",
      "payload" not in [p for _, p in tier.TIERED_SOURCES],
      [p for _, p in tier.TIERED_SOURCES])

print("\n=== 5. THE CENSUS IS UNREACHABLE FROM HERE — the protected set holds")
reset()
birth = store.birth_path(NOW)
os.makedirs(os.path.dirname(birth), exist_ok=True)
open(birth, "w", encoding="utf-8").write('{"mint": "MUST_SURVIVE"}\n')
age(birth, 400)                       # older than every window
tier.run(NOW)
check("⛔ a birth file older than every window SURVIVES", os.path.exists(birth))
check("POSITIVE CONTROL — _safe really does refuse that path",
      tier._safe(birth) is False)
check("POSITIVE CONTROL — and it ADMITS a tierable path",
      tier._safe(os.path.join(provenance.RAW_DIR, "x.jsonl")) is True)

print("\n=== 6. PER-SOURCE COUNTS — a zero must not hide a source never walked")
reset()
out = tier.tier_payloads(NOW)
check("every configured source is reported, even at zero",
      set(out["by_source"]) == {"provenance-raw"}, out["by_source"])

print("\n%d passed, %d failed" % (PASS, FAIL))
shutil.rmtree(ROOT, ignore_errors=True)
sys.exit(1 if FAIL else 0)
