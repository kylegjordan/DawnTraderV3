"""
token-watch — B-TOKEN-WATCH-FOLLOWUP-MEMORY P8 (OBJ-3): the backlog census (every due entry in (cursor, census hour]
written to its own artifact before anything moves) and the cursor move that refuses without that census's sha256.

Run:  python tests/test_p8_census.py        (exit 0 = every check passed)
"""

import gzip
import hashlib
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

ROOT = tempfile.mkdtemp(prefix="token-watch-p8-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(PKG, "tools"))

import store  # noqa: E402
from config import COLD_DIR, DUE_DIR  # noqa: E402
import backlog_census as bc  # noqa: E402
import move_followup_cursor as mc  # noqa: E402

UTC = timezone.utc
NOW = datetime(2026, 11, 15, 12, 30, tzinfo=UTC)
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
    store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11", "last_bucket": "2026-09-30T13"})


def bucket(hour, entries):
    os.makedirs(DUE_DIR, exist_ok=True)
    with open(os.path.join(DUE_DIR, hour + ".jsonl"), "w", encoding="utf-8", newline="") as fh:
        for e in entries:
            fh.write((e if isinstance(e, str) else json.dumps(e)) + NL)


def entry(mint, age, created="2026-09-29T14:00:00+00:00"):
    return {"mint": mint, "age": age, "due_at": "2026-09-30T14:00:00+00:00", "created_at": created}


def sha(path):
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        h.update(fh.read())
    return h.hexdigest()


def seed():
    reset()
    bucket("2026-09-30T13", [entry("AT_CURSOR", "1h")])                  # the cursor's own bucket: already read
    bucket("2026-09-30T14", [entry("A", "1h"), entry("B", "24h"), "{broken"])
    bucket("2026-09-30T15", [entry("C", "24h", created=None)])
    # 2026-09-30T16 has no file
    bucket("2026-09-30T17", [entry("AFTER", "6h")])                      # after the census hour: not read


print(NL + "=== C1. THE CENSUS WRITES EVERY ENTRY IN (cursor, census hour], COUNTS THE UNREADABLE, AND HASHES ITSELF")
seed()
summ = os.path.join(ROOT, "summary.json")
rc = bc.main(["--census-hour", "2026-09-30T16", "--summary", summ], now=NOW)
s = json.load(open(summ, encoding="utf-8")) if os.path.exists(summ) else {}
art = os.path.join(COLD_DIR, bc.artifact_name("2026-09-30T13", "2026-09-30T16"))
rows = [json.loads(x) for x in gzip.open(art, "rt", encoding="utf-8")] if os.path.exists(art) else []
check("C1 exit 0 and the artifact is in cold/ under the (cursor, census hour) name", rc == 0 and os.path.exists(art), rc)
check("C1 and cold/ holds EXACTLY that artifact - no temp left behind (Langston N1)",
      sorted(os.listdir(COLD_DIR)) == [os.path.basename(art)], os.listdir(COLD_DIR))
check("C1 exactly the 3 readable entries of T14 and T15 - not the cursor's own bucket, not T17",
      sorted(r["mint"] for r in rows) == ["A", "B", "C"], [r["mint"] for r in rows])
expect = sorted([
    {"bucket": "2026-09-30T14", "mint": "A", "age": "1h", "due_at": "2026-09-30T14:00:00+00:00",
     "created_at": "2026-09-29T14:00:00+00:00", "age_now_s": (NOW - datetime(2026, 9, 29, 14, tzinfo=UTC)).total_seconds()},
    {"bucket": "2026-09-30T14", "mint": "B", "age": "24h", "due_at": "2026-09-30T14:00:00+00:00",
     "created_at": "2026-09-29T14:00:00+00:00", "age_now_s": (NOW - datetime(2026, 9, 29, 14, tzinfo=UTC)).total_seconds()},
    {"bucket": "2026-09-30T15", "mint": "C", "age": "24h", "due_at": "2026-09-30T14:00:00+00:00",
     "created_at": None, "age_now_s": None},
], key=lambda r: r["mint"])
check("C1 the three rows IN FULL - bucket label, due_at, created_at and age_now_s exactly as recorded (Langston C-1)",
      sorted(rows, key=lambda r: r["mint"]) == expect, rows)
check("C1 age_now_s is from created_at to the census time; None when created_at is absent",
      next(r for r in rows if r["mint"] == "A")["age_now_s"] == (NOW - datetime(2026, 9, 29, 14, tzinfo=UTC)).total_seconds()
      and next(r for r in rows if r["mint"] == "C")["age_now_s"] is None, rows)
check("C1 the summary: 2 buckets read, 1 absent, 3 rows by age, 1 unreadable line",
      s.get("buckets_read") == 2 and s.get("buckets_absent") == 1 and s.get("rows") == 3
      and s.get("rows_by_age") == {"1h": 1, "24h": 2} and s.get("unreadable_lines") == 1, s)
check("C1 the summary's sha256 and bytes are the artifact's", s.get("artifact_sha256") == sha(art)
      and s.get("artifact_bytes") == os.path.getsize(art), s)
check("C1 the cursor did NOT move (census only)", store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13")

print(NL + "=== C2. THE CENSUS REFUSES: an existing artifact, a census hour not after the cursor or after now, a held lock")
rc_exists = bc.main(["--census-hour", "2026-09-30T16"], now=NOW)
check("C2 an existing artifact is never overwritten (exit 2), and it is unchanged", rc_exists == 2
      and sha(art) == s.get("artifact_sha256"))
seed()
check("C2 a census hour at the cursor refuses", bc.main(["--census-hour", "2026-09-30T13"], now=NOW) == 2)
check("C2 a census hour after the current hour refuses", bc.main(["--census-hour", "2026-11-15T13"], now=NOW) == 2)
check("C2 a malformed census hour refuses", bc.main(["--census-hour", "2026-09-30 16"], now=NOW) == 2)
with store.periodic_lock("follow_up") as held:
    rc_locked = bc.main(["--census-hour", "2026-09-30T16"], now=NOW)
check("C2 refused while another job holds the lock", rc_locked == 2 and not os.listdir(COLD_DIR) if os.path.isdir(COLD_DIR)
      else rc_locked == 2, rc_locked)

print(NL + "=== M1. THE CURSOR MOVES ONLY WITH THE CENSUS'S SHA256, AND ONLY last_bucket CHANGES")
seed()
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ], now=NOW)
s = json.load(open(summ, encoding="utf-8"))
check("M1 a wrong sha256 refuses", mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", "0" * 64,
                                           "--apply"]) == 2
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13")
check("M1 a dry run with the right sha256 writes nothing", mc.main(["--census-hour", "2026-09-30T16", "--census-sha256",
                                                                   s["artifact_sha256"]]) == 0
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13")
rc = mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s["artifact_sha256"], "--apply"])
cur = store.load_state("follow_up_cursor", {})
check("M1 --apply moves last_bucket to the census hour and leaves consumed_from", rc == 0
      and cur == {"consumed_from": "2026-08-31T11", "last_bucket": "2026-09-30T16"}, cur)
check("M1 a second move (the cursor is now AT the census hour) refuses",
      mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s["artifact_sha256"], "--apply"]) == 2)

print(NL + "=== M2. ONCE THE OFF-BOX RUN HAS MOVED THE ARTIFACT, THE MANIFEST CONFIRMS IT")
seed()
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ], now=NOW)
s = json.load(open(summ, encoding="utf-8"))
name = bc.artifact_name("2026-09-30T13", "2026-09-30T16")
os.makedirs(os.path.dirname(mc.MANIFEST_PATH), exist_ok=True)
with open(mc.MANIFEST_PATH, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"name": name, "sha256": s["artifact_sha256"], "b2_name": "token-watch/cold/" + name}) + NL)
os.remove(os.path.join(COLD_DIR, name))                                    # as cold_offbox does after its verify
rc = mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s["artifact_sha256"], "--apply"])
check("M2 confirmed from the manifest, cursor moved", rc == 0
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T16", rc)
seed()
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ], now=NOW)
s2 = json.load(open(summ, encoding="utf-8"))
os.makedirs(os.path.dirname(mc.MANIFEST_PATH), exist_ok=True)
with open(mc.MANIFEST_PATH, "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"name": name, "sha256": "f" * 64, "b2_name": "token-watch/cold/" + name}) + NL)
    fh.write(json.dumps({"name": "some-other-artifact.jsonl.gz", "sha256": s2["artifact_sha256"]}) + NL)
os.remove(os.path.join(COLD_DIR, name))
rc_bad = mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s2["artifact_sha256"], "--apply"])
check("M2 a manifest whose line for this name carries a DIFFERENT sha256 (and whose matching sha names another file) "
      "refuses, cursor unmoved (Langston R1: once off-boxed, the manifest is the sole authoriser)",
      rc_bad == 2 and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13", rc_bad)

print(NL + "=== M3. A CENSUS TAKEN AT AN OLDER CURSOR DOES NOT AUTHORISE A MOVE FROM A NEWER ONE")
seed()
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ], now=NOW)
s = json.load(open(summ, encoding="utf-8"))
store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11", "last_bucket": "2026-09-30T14"})
check("M3 the cursor moved after the census -> refused", mc.main(["--census-hour", "2026-09-30T16", "--census-sha256",
                                                                 s["artifact_sha256"], "--apply"]) == 2
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T14")

print(NL + "=== C3. THE RE-READ GUARD, THE ABSENT-CURSOR REFUSALS AND THE LOCK BEAT (Langston C-2)")
seed()
_real_census = bc.census


def lying_census(cursor, hour, now, out_path):
    s = _real_census(cursor, hour, now, out_path)
    return dict(s, payload_sha256="0" * 64)          # what was written disagrees with what is read back


bc.census = lying_census
try:
    rc_lie = bc.main(["--census-hour", "2026-09-30T16"], now=NOW)
finally:
    bc.census = _real_census
check("C3 an artifact whose re-read content disagrees with what was written is refused and NOTHING is kept",
      rc_lie == 2 and not any(n.startswith("followup-backlog-census") for n in os.listdir(COLD_DIR)),
      (rc_lie, os.listdir(COLD_DIR)))
store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11"})


def rc_of(fn, *a, **k):
    """exit code, or ('RAISED', type) - a crash is NOT a refusal and must read as a FAIL line"""
    try:
        return fn(*a, **k)
    except Exception as exc:
        return ("RAISED", type(exc).__name__)


r_c = rc_of(bc.main, ["--census-hour", "2026-09-30T16"], now=NOW)
check("C3 the census REFUSES (exit 2, not a crash) a cursor with no last_bucket", r_c == 2, r_c)
r_m = rc_of(mc.main, ["--census-hour", "2026-09-30T16", "--census-sha256", "0" * 64, "--apply"])
check("C3 the move REFUSES (exit 2, not a crash) a cursor with no last_bucket", r_m == 2, r_m)
seed()
beats = []
_rb = bc.lock_beat
bc.lock_beat = lambda: beats.append(1) or True
try:
    bc.main(["--census-hour", "2026-09-30T16"], now=NOW)
finally:
    bc.lock_beat = _rb
check("C3 the census beats the lock once per hour in its range (3 hours: T14, T15, absent T16)", len(beats) == 3, len(beats))

print(NL + "=== M5. EACH MOVE APPENDS ITS SKIP TO A FILE NOTHING REWRITES (Langston: the cursor state is rebuilt each run)")
seed()
summ5 = os.path.join(ROOT, "s5.json")
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ5], now=NOW)
s5 = json.load(open(summ5, encoding="utf-8"))
mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s5["artifact_sha256"], "--apply"])
moves = [json.loads(x) for x in open(mc.MOVES_PATH, encoding="utf-8")] if os.path.exists(mc.MOVES_PATH) else []
check("M5 one line: the range skipped and the census that covers it", len(moves) == 1
      and moves[0]["skipped_after"] == "2026-09-30T13" and moves[0]["skipped_through"] == "2026-09-30T16"
      and moves[0]["census_sha256"] == s5["artifact_sha256"] and moves[0]["consumed_from"] == "2026-08-31T11", moves)
check("M5 a REFUSED run appends nothing", mc.main(["--census-hour", "2026-09-30T17", "--census-sha256", "0" * 64]) == 2
      and len([1 for _ in open(mc.MOVES_PATH, encoding="utf-8")]) == 1)
seed()                                                     # reset() clears state/, the moves record with it
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ5], now=NOW)
s5b = json.load(open(summ5, encoding="utf-8"))
rc_dry = mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s5b["artifact_sha256"]])
check("M5 a real DRY RUN (right sha, no --apply) appends nothing and moves nothing (Langston N2)", rc_dry == 0
      and not os.path.exists(mc.MOVES_PATH) and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13",
      rc_dry)

print(NL + "=== M6. THE SKIP RECORD IS WRITTEN BEFORE THE CURSOR MOVES: a failing append leaves the cursor where it was")
seed()
bc.main(["--census-hour", "2026-09-30T16", "--summary", summ5], now=NOW)
s6 = json.load(open(summ5, encoding="utf-8"))
_moves = mc.MOVES_PATH
mc.MOVES_PATH = os.path.join(ROOT, "no-such-dir", "x", "followup-cursor-moves.jsonl")
os.makedirs(os.path.dirname(os.path.dirname(mc.MOVES_PATH)), exist_ok=True)
open(os.path.dirname(mc.MOVES_PATH), "w").close()        # a FILE where the directory should be: the append fails
try:
    try:
        mc.main(["--census-hour", "2026-09-30T16", "--census-sha256", s6["artifact_sha256"], "--apply"])
        raised = False
    except Exception:
        raised = True
finally:
    mc.MOVES_PATH = _moves
check("M6 the failed append raised and the cursor did NOT move", raised
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T13",
      (raised, store.load_state("follow_up_cursor", {})))

print(NL + "=== M4. THE CURSOR NEVER MOVES BACKWARD, EVEN WITH A MATCHING ARTIFACT FOR AN EARLIER HOUR")
reset()
store.save_state("follow_up_cursor", {"consumed_from": "2026-08-31T11", "last_bucket": "2026-09-30T16"})
os.makedirs(COLD_DIR, exist_ok=True)
back = os.path.join(COLD_DIR, bc.artifact_name("2026-09-30T16", "2026-09-30T15"))   # a name the census never writes
with gzip.open(back, "wt", encoding="utf-8") as fh:
    fh.write("{}" + NL)
check("M4 a census hour before the cursor refuses, whatever the artifact says",
      mc.main(["--census-hour", "2026-09-30T15", "--census-sha256", sha(back), "--apply"]) == 2
      and store.load_state("follow_up_cursor", {})["last_bucket"] == "2026-09-30T16")

shutil.rmtree(ROOT, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
