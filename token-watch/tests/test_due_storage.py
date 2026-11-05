"""
token-watch — the cursor-bounded due prune and the feed watch. (B-TOKEN-WATCH-STORAGE amendment 1, P8)

⛔ WHAT THIS MUST CATCH, each with a control:
   - an UNREAD bucket removed (after the cursor, or before `consumed_from`);
   - a lost cursor followed by one run, after which the old rule's successor
     would see every never-read bucket "behind the cursor" (C-1);
   - a watch that cannot read the census reporting a quiet feed (C-3).
Exit code is the verdict (non-zero on any FAIL); tests/mutate_due_storage.py
breaks each rule and requires this file to fail with the named line.
"""

import io
import json
import os
import shutil
import sys
import tempfile
from contextlib import redirect_stdout, redirect_stderr
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-due-")
os.environ["TOKEN_WATCH_ROOT"] = ROOT
PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
sys.path.insert(0, PKG)
sys.path.insert(0, os.path.join(PKG, "ops"))
sys.path.insert(0, os.path.join(PKG, "tools"))

import config  # noqa: E402
import follow_up  # noqa: E402
import liveness  # noqa: E402
import store  # noqa: E402
import tier  # noqa: E402
import feed_watch  # noqa: E402
import backfill_consumed_from as bf  # noqa: E402
import due_census  # noqa: E402

UTC = timezone.utc
PASS = FAIL = 0
NOW = datetime(2026, 11, 5, 12, 30, tzinfo=UTC)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + repr(detail) if detail != "" else ""))


def H(dt):
    return dt.strftime("%Y-%m-%dT%H")


def reset_due(hours_with_sizes):
    shutil.rmtree(store.DUE_DIR, ignore_errors=True)
    os.makedirs(store.DUE_DIR)
    for h, n in hours_with_sizes:
        with open(os.path.join(store.DUE_DIR, H(h) + ".jsonl"), "wb") as fh:
            fh.write(b"x" * n)


def present():
    return sorted(n[:-6] for n in os.listdir(store.DUE_DIR) if n.endswith(".jsonl"))


store.ensure_dirs()

# A layout with one bucket in every class. Sizes are distinct so bytes are checkable.
FROM = NOW - timedelta(days=30)               # consumed_from
LAST = NOW - timedelta(days=2)                # last_bucket
B_BEFORE = FROM - timedelta(hours=1)          # never read: before the lineage
B_OLD_SPENT = FROM + timedelta(hours=1)       # read, 30 days old -> removable
B_EDGE_SPENT = NOW - timedelta(days=config.DUE_SPENT_HOT_DAYS, hours=1)   # read, just past the margin -> removable
B_RECENT = NOW - timedelta(days=3)            # read, inside the margin -> kept
B_AFTER = LAST + timedelta(hours=1)           # not yet read -> kept
# Both `<=` endpoints carry a bucket (Langston, Step-4 part 1 item 3): the hour AT consumed_from was read and
# is old -> removable; the hour AT last_bucket was read and is inside the margin -> kept_spent_window.
B_AT_FROM = FROM
B_AT_LAST = LAST
LAYOUT = [(B_BEFORE, 11), (B_OLD_SPENT, 22), (B_EDGE_SPENT, 33), (B_RECENT, 44), (B_AFTER, 55),
          (B_AT_FROM, 66), (B_AT_LAST, 77)]
N_LAYOUT = len(LAYOUT)

print("=== 1. the four classes, by count and bytes ===")
reset_due(LAYOUT)
open(os.path.join(store.DUE_DIR, "not-an-hour.jsonl"), "wb").write(b"z" * 7)
c = tier.classify_due_buckets(NOW, {"consumed_from": H(FROM), "last_bucket": H(LAST)})
cls = c["classes"]
check("ok with a full cursor", c["ok"] is True, c["reason"])
check("removable = the three read-and-old buckets", cls["removable"] == {"count": 3, "bytes": 121}, cls["removable"])
check("kept inside the spent window", cls["kept_spent_window"] == {"count": 2, "bytes": 121}, cls["kept_spent_window"])
check("★ the bucket AT consumed_from is removable (lower bound inclusive)",
      os.path.join(store.DUE_DIR, H(B_AT_FROM) + ".jsonl") in c["paths"]["removable"], c["paths"]["removable"])
check("★ the bucket AT last_bucket is read, not after the cursor (upper bound inclusive)",
      os.path.join(store.DUE_DIR, H(B_AT_LAST) + ".jsonl") in c["paths"]["kept_spent_window"],
      c["paths"]["kept_spent_window"])
check("★ kept after the cursor (unread)", cls["kept_after_cursor"] == {"count": 1, "bytes": 55}, cls["kept_after_cursor"])
check("★ kept before consumed_from (never read)", cls["kept_before_consumed_from"] == {"count": 1, "bytes": 11},
      cls["kept_before_consumed_from"])
check("an unparsable name is kept and counted", cls["kept_unparsed"] == {"count": 1, "bytes": 7}, cls["kept_unparsed"])

print("=== 2. the prune removes exactly the removable class ===")
store.save_state("follow_up_cursor", {"consumed_from": H(FROM), "last_bucket": H(LAST)})
r = tier.prune_due_buckets(NOW)
check("POSITIVE CONTROL: it removed something", r["due_buckets_removed"] == 3, r)
check("bytes removed are reported", r["due_bytes_removed"] == 121, r)
check("★ every unread bucket survived", set(present()) >= {H(B_BEFORE), H(B_AFTER)}, present())
check("the bucket inside the margin survived", H(B_RECENT) in present(), present())
check("the three spent-and-old buckets are gone",
      not ({H(B_OLD_SPENT), H(B_EDGE_SPENT), H(B_AT_FROM)} & set(present())), present())
check("the bucket at last_bucket survived (inside the margin)", H(B_AT_LAST) in present(), present())

print("=== 2b. THE LIVE SHAPE: a cursor weeks behind, with OLD unread buckets after it ===")
# The follow-up stopped on 2026-09-30; every bucket since is unread AND more than 7 days old. Only the
# cursor bound keeps them — the age rule alone would remove them (section 1's after-cursor bucket is
# too recent to tell the two apart, which is why this case exists).
STALL = NOW - timedelta(days=36)
OLD_UNREAD = [STALL + timedelta(hours=k) for k in (1, 24, 24 * 20)]
reset_due([(STALL - timedelta(days=5), 3), (STALL, 3)] + [(h, 9) for h in OLD_UNREAD])
store.save_state("follow_up_cursor", {"consumed_from": H(STALL - timedelta(days=10)), "last_bucket": H(STALL)})
r = tier.prune_due_buckets(NOW)
check("POSITIVE CONTROL: the read buckets before the stall are removed", r["due_buckets_removed"] == 2, r)
check("★ every OLD unread bucket after a stalled cursor survived",
      set(present()) == {H(h) for h in OLD_UNREAD}, present())

print("=== 3. no cursor, or no consumed_from: NOTHING is removed ===")
for label, cur in (("no cursor", {}), ("cursor without consumed_from", {"last_bucket": H(LAST)}),
                   ("consumed_from after last_bucket", {"consumed_from": H(LAST), "last_bucket": H(FROM)})):
    reset_due(LAYOUT)
    store.save_state("follow_up_cursor", cur)
    before = present()
    r = tier.prune_due_buckets(NOW)
    check("★ %s: nothing removed" % label, r["due_buckets_removed"] == 0 and present() == before, r)
    check("%s: the reason is reported" % label, r["due_prune_ok"] is False and r["due_prune_reason"], r)

print("=== 3b. a DAMAGED field is named as damage, each field on its own ===")
for label, cur, needle in (
        ("damaged consumed_from, intact last_bucket", {"consumed_from": "garbage", "last_bucket": H(LAST)},
         "consumed_from 'garbage' is not an hour"),
        ("damaged last_bucket, intact consumed_from", {"consumed_from": H(FROM), "last_bucket": "garbage"},
         "last_bucket 'garbage' is not an hour")):
    reset_due(LAYOUT)
    store.save_state("follow_up_cursor", cur)
    before = present()
    r = tier.prune_due_buckets(NOW)
    check("★ %s: nothing removed" % label, r["due_buckets_removed"] == 0 and present() == before, r)
    check("★ %s: the reason says damaged cursor and names the field" % label,
          str(r["due_prune_reason"]).startswith("damaged cursor") and needle in r["due_prune_reason"], r)

print("=== 4. C-1: a LOST cursor followed by ONE follow-up run ===")
# The follow-up's first run (no cursor) reads only its own hour and stamps it. Every older bucket was never
# read; with consumed_from they all sit BEFORE the lineage and stay.
reset_due(LAYOUT)
os.remove(store.state_path("follow_up_cursor"))
run_hour_buckets = follow_up._buckets_to_read(NOW)
check("POSITIVE CONTROL: a first run reads exactly this hour",
      [H(b) for b in run_hour_buckets] == [H(NOW)], [H(b) for b in run_hour_buckets])
follow_up._advance_cursor(run_hour_buckets)
cur = store.load_state("follow_up_cursor", {})
check("★ the new lineage starts at this hour", cur == {"last_bucket": H(NOW), "consumed_from": H(NOW)}, cur)
r = tier.prune_due_buckets(NOW)
check("★ after cursor loss + one run, NOTHING old is removed", r["due_buckets_removed"] == 0
      and len(present()) == N_LAYOUT,
      (r, present()))

print("=== 4b. a DAMAGED cursor (consumed_from kept, last_bucket unreadable) is a LOST cursor ===")
# A second reader's catch at Step 3: `_last_consumed` treats an unparsable last_bucket as a first run and
# reads only this hour; keeping the old consumed_from would put every hour between the real position and
# now inside the "read" range.
reset_due(LAYOUT)
store.save_state("follow_up_cursor", {"consumed_from": H(FROM), "last_bucket": "garbage"})
dmg_buckets = follow_up._buckets_to_read(NOW)
check("POSITIVE CONTROL: a damaged cursor reads only this hour", [H(b) for b in dmg_buckets] == [H(NOW)],
      [H(b) for b in dmg_buckets])
follow_up._advance_cursor(dmg_buckets)
cur = store.load_state("follow_up_cursor", {})
check("★ a damaged cursor starts a NEW lineage at this hour", cur.get("consumed_from") == H(NOW), cur)
r = tier.prune_due_buckets(NOW)
check("★ after a damaged cursor + one run, NOTHING old is removed", r["due_buckets_removed"] == 0
      and len(present()) == N_LAYOUT, (r, present()))

print("=== 5. consumed_from never moves ===")
store.save_state("follow_up_cursor", {"last_bucket": H(LAST), "consumed_from": H(FROM)})
follow_up._advance_cursor([LAST + timedelta(hours=1), LAST + timedelta(hours=2)])
cur = store.load_state("follow_up_cursor", {})
check("★ an existing consumed_from is kept as the cursor advances",
      cur == {"last_bucket": H(LAST + timedelta(hours=2)), "consumed_from": H(FROM)}, cur)
store.save_state("follow_up_cursor", {"last_bucket": H(LAST)})
follow_up._advance_cursor([LAST + timedelta(hours=1)])
cur = store.load_state("follow_up_cursor", {})
check("★ a pre-field cursor keeps consumed_from ABSENT (only the backfill sets it)", "consumed_from" not in cur, cur)
follow_up._advance_cursor([])
check("an empty run leaves the cursor alone", store.load_state("follow_up_cursor", {}) == cur)

print("=== 6. the census reports what the prune would do, and removes nothing ===")
reset_due(LAYOUT)
store.save_state("follow_up_cursor", {"consumed_from": H(FROM), "last_bucket": H(LAST)})
before = present()
cen = due_census.census(NOW)
check("census classes equal the prune's", cen["classes"]["removable"]["count"] == 3
      and cen["classes"]["kept_after_cursor"]["count"] == 1, cen["classes"])
check("census totals cover every bucket", cen["total"]["count"] == N_LAYOUT, cen["total"])
check("★ the census removed nothing", present() == before)

print("=== 6b. the lineage check: a removable bucket with no observation row is a GAP ===")
OBS = store.OBSERVATIONS_DIR
shutil.rmtree(OBS, ignore_errors=True)
os.makedirs(OBS)


def write_bucket(h, entries):
    with open(os.path.join(store.DUE_DIR, H(h) + ".jsonl"), "w", encoding="utf-8") as fh:
        for mint, age in entries:
            fh.write(json.dumps({"mint": mint, "age": age}) + "\n")


def write_obs(day_dt, rows):
    with open(os.path.join(OBS, day_dt.strftime("%Y-%m-%d") + ".jsonl"), "a", encoding="utf-8") as fh:
        for mint, age in rows:
            fh.write(json.dumps({"mint": mint, "age": age, "observed_at": day_dt.isoformat()}) + "\n")


shutil.rmtree(store.DUE_DIR, ignore_errors=True)
os.makedirs(store.DUE_DIR)
READ_H = FROM + timedelta(hours=2)             # read: its entries were observed the next day
GAP_H = FROM + timedelta(days=5)               # never read: no observation row anywhere near it
write_bucket(READ_H, [("m1", "1h"), ("m2", "1h")])
write_bucket(GAP_H, [("m3", "1h"), ("m4", "6h")])
write_obs(READ_H + timedelta(days=1), [("m1", "1h"), ("m2", "1h")])
write_obs(GAP_H + timedelta(days=4), [("m3", "1h")])           # outside the 3-day window: does not count
store.save_state("follow_up_cursor", {"consumed_from": H(FROM), "last_bucket": H(LAST)})
before = present()
lin = due_census.lineage(NOW)
check("POSITIVE CONTROL: both removable buckets were checked", lin["removable_buckets_checked"] == 2, lin)
check("★ the bucket with no observation row is a gap", [g["bucket"] for g in lin["gaps"]] == [H(GAP_H)], lin)
check("the observed bucket is not a gap", H(READ_H) not in [g["bucket"] for g in lin["gaps"]], lin)
check("★ the verdict says do not prune", lin["verdict"].startswith("GAPS"), lin)
check("★ the lineage check removed nothing", present() == before)
write_obs(GAP_H, [("m3", "1h"), ("m4", "6h")])
lin = due_census.lineage(NOW)
check("once observed, no gap", lin["gaps"] == [] and lin["verdict"] == "no gap found", lin)
# the floor, at its boundary (Langston R-3): exactly half observed is NOT a gap; one third is.
shutil.rmtree(store.DUE_DIR, ignore_errors=True)
os.makedirs(store.DUE_DIR)
HALF_H = FROM + timedelta(days=8)
THIRD_H = FROM + timedelta(days=12)
write_bucket(HALF_H, [("h1", "1h"), ("h2", "1h")])
write_bucket(THIRD_H, [("t1", "1h"), ("t2", "1h"), ("t3", "1h")])
write_obs(HALF_H, [("h1", "1h")])
write_obs(THIRD_H, [("t1", "1h")])
lin = due_census.lineage(NOW)
check("★ exactly half observed is NOT a gap (floor 0.5, strict)", H(HALF_H) not in [g["bucket"] for g in lin["gaps"]], lin)
check("★ one third observed IS a gap", [g["bucket"] for g in lin["gaps"]] == [H(THIRD_H)], lin)
# the verdict is persisted beside due-census.json (Langston R-4)
saved_argv = sys.argv
sys.argv = ["due_census.py", "--lineage"]
try:
    with redirect_stdout(io.StringIO()):
        rc = due_census.main()
finally:
    sys.argv = saved_argv
persisted = json.load(open(due_census.LINEAGE_OUT, encoding="utf-8"))
check("★ --lineage exits 1 on a gap", rc == 1, rc)
for bad in (["--lineag"], ["--lineage", "--json"]):
    sys.argv = ["due_census.py"] + bad
    _err = io.StringIO()
    try:
        with redirect_stdout(io.StringIO()), redirect_stderr(_err):
            rc_bad = due_census.main()
    finally:
        sys.argv = saved_argv
    check("★ an unknown argument %r refuses (exit 2, usage), never runs the census and exits 0" % (bad,),
          rc_bad == 2 and "usage" in _err.getvalue(), (rc_bad, _err.getvalue()))
check("★ --lineage persists its verdict", persisted["verdict"].startswith("GAPS")
      and persisted["gaps"][0]["bucket"] == H(THIRD_H), persisted)

print("=== 7. the one-time backfill ===")
OBS = store.OBSERVATIONS_DIR
shutil.rmtree(OBS, ignore_errors=True)
os.makedirs(OBS)
first = datetime(2026, 8, 31, 11, 35, 58, tzinfo=UTC)
rows = [{"observed_at": (first - timedelta(minutes=40)).isoformat(), "reason": "scheduled_in_the_past"},
        {"observed_at": first.isoformat(), "observed": True},
        {"observed_at": (first + timedelta(hours=3)).isoformat(), "observed": True}]
with open(os.path.join(OBS, "2026-08-31.jsonl"), "w", encoding="utf-8") as fh:
    for rec in rows:
        fh.write(json.dumps(rec) + "\n")
with open(os.path.join(OBS, "2026-09-01.jsonl"), "w", encoding="utf-8") as fh:
    fh.write(json.dumps({"observed_at": "2026-08-30T00:00:00+00:00"}) + "\n")   # a later FILE is never read
d = bf.derive()
check("★ the miss row is excluded: derived hour is the follow-up's", d["derived_hour"] == "2026-08-31T11", d)
check("POSITIVE CONTROL: over ALL rows the minimum IS the miss row (so the exclusion matters)",
      d["min_observed_at_all"].startswith("2026-08-31T10:55"), d)
check("counts reported", (d["rows"], d["follow_up_rows"], d["miss_rows"]) == (3, 2, 1), d)


def run_bf(args):
    out, err = io.StringIO(), io.StringIO()
    with redirect_stdout(out), redirect_stderr(err):
        rc = bf.main(["bf"] + args)
    return rc, out.getvalue() + err.getvalue()


os.remove(store.state_path("follow_up_cursor"))
rc, txt = run_bf(["--apply"])
check("★ refuses with no cursor file", rc == 2 and "no cursor file" in txt, txt[-200:])
store.save_state("follow_up_cursor", {"last_bucket": "2026-09-30T13", "consumed_from": "2026-09-01T00"})
rc, txt = run_bf(["--apply"])
check("★ refuses when consumed_from already exists", rc == 2 and "already has consumed_from" in txt, txt[-200:])
store.save_state("follow_up_cursor", {"last_bucket": "2026-08-31T10"})
rc, txt = run_bf(["--apply"])
check("★ refuses when last_bucket is before the value", rc == 2 and "is before" in txt, txt[-200:])
store.save_state("follow_up_cursor", {"last_bucket": "2026-09-30T13"})
rc, txt = run_bf([])
check("a dry run writes nothing", rc == 0 and store.load_state("follow_up_cursor", {}) == {"last_bucket": "2026-09-30T13"},
      txt[-200:])
rc, txt = run_bf(["--apply"])
check("POSITIVE CONTROL: --apply writes it, keeping last_bucket",
      rc == 0 and store.load_state("follow_up_cursor", {}) == {"last_bucket": "2026-09-30T13",
                                                               "consumed_from": "2026-08-31T11"}, txt[-200:])
saved_literal = bf.LITERAL
bf.LITERAL = "2026-08-31T12"
store.save_state("follow_up_cursor", {"last_bucket": "2026-09-30T13"})
rc, txt = run_bf(["--apply"])
check("★ refuses when the derivation disagrees with the literal", rc == 2 and "disagrees" in txt
      and "consumed_from" not in store.load_state("follow_up_cursor", {}), txt[-200:])
bf.LITERAL = saved_literal
rc, txt = run_bf(["--bogus"])
check("★ refuses an unknown argument (usage)", rc == 2 and "usage" in txt, txt[-200:])
open(store.LOCK_PATH, "w").write("someone-else 1 now\n")
try:
    store.save_state("follow_up_cursor", {"last_bucket": "2026-09-30T13"})
    rc, txt = run_bf(["--apply"])
    check("★ refuses while another periodic job holds the lock", rc == 2 and "holds the lock" in txt
          and "consumed_from" not in store.load_state("follow_up_cursor", {}), txt[-200:])
finally:
    os.remove(store.LOCK_PATH)
with open(os.path.join(OBS, "2026-08-31.jsonl"), "w", encoding="utf-8") as fh:   # the first file: miss rows only
    fh.write(json.dumps({"observed_at": first.isoformat(), "reason": "scheduled_in_the_past"}) + "\n")
rc, txt = run_bf(["--apply"])
check("★ refuses when the first file holds no follow-up observation (only miss rows)", rc == 2
      and "no follow-up observation" in txt and "consumed_from" not in store.load_state("follow_up_cursor", {}),
      txt[-200:])

print("=== 8. the feed watch's probe: an unreadable census FAILS, never reads as quiet ===")
births = config.BIRTHS_DIR
shutil.rmtree(births, ignore_errors=True)
store.save_state("liveness", {})
check("★ a missing census directory is a problem", any("cannot list" in p for p in liveness.probe_readable()),
      liveness.probe_readable())
os.makedirs(births)
check("★ an empty census directory is a problem", any("lists no census file" in p for p in liveness.probe_readable()),
      liveness.probe_readable())
os.makedirs(os.path.join(births, "2026-11-05.jsonl"))       # a newest "file" that cannot be read as one
check("★ a newest census file that cannot be read is a problem",
      any("cannot read" in p for p in liveness.probe_readable()), liveness.probe_readable())
os.rmdir(os.path.join(births, "2026-11-05.jsonl"))
row = json.dumps({"first_seen_at": (NOW - timedelta(minutes=1)).isoformat()}) + "\n"
open(os.path.join(births, "2026-11-05.jsonl"), "w", encoding="utf-8").write(row)
check("POSITIVE CONTROL: a readable census passes the probe", liveness.probe_readable() == [],
      liveness.probe_readable())
store.save_state("liveness", {"cursor": {"path": os.path.join(births, "2026-10-01.jsonl"), "offset": 5}})
check("★ a cursor pointing at a file that is gone is a problem",
      any("2026-10-01" in p for p in liveness.probe_readable()), liveness.probe_readable())
if hasattr(os, "geteuid") and os.geteuid() != 0:
    store.save_state("liveness", {})
    os.chmod(births, 0)
    try:
        check("★ a permission wall on the census is a problem (EACCES)",
              any("cannot list" in p for p in liveness.probe_readable()), liveness.probe_readable())
    finally:
        os.chmod(births, 0o700)
else:
    print("SKIP permission-wall case (needs a non-root POSIX account; the directory-as-file case covers open())")
# a stray, letter-initial .jsonl beside a real census changes NO verdict (Langston, part-2 re-review)
open(os.path.join(births, "backup.jsonl"), "w", encoding="utf-8").write("not a census file\n")
store.save_state("liveness", {})
check("★ a stray backup.jsonl beside a real census: the readable census still passes the probe",
      liveness.probe_readable() == [], liveness.probe_readable())
store.save_state("liveness", {"cursor": {"path": os.path.join(births, "2026-11-06.jsonl"), "offset": 0}})
check("★ a stray backup.jsonl: a never-created day is still NOT a problem",
      liveness.probe_readable() == [], liveness.probe_readable())
os.remove(os.path.join(births, "backup.jsonl"))
# check() itself must not raise on a cursor naming a non-census file: it falls back to now (record item 2)
store.save_state("liveness", {"cursor": {"path": os.path.join(births, "backup.jsonl"), "offset": 0}})
try:
    liveness.check(NOW)
    _raised = None
except Exception as e:  # noqa: BLE001
    _raised = e
check("★ check() does not raise on a cursor naming a non-census file", _raised is None, repr(_raised))
store.save_state("liveness", {"cursor": {"path": os.path.join(births, "2026-11-04.jsonl"), "offset": 5}})
check("★ a cursor file that is gone while NEWER files exist is a problem (deleted, not never-written)",
      any("2026-11-04" in p for p in liveness.probe_readable()), liveness.probe_readable())
store.save_state("liveness", {"cursor": {"path": os.path.join(births, "2026-11-06.jsonl"), "offset": 0}})
check("★ a cursor on a day AFTER every census file (never created: an outage) is NOT a problem",
      liveness.probe_readable() == [], liveness.probe_readable())
store.save_state("liveness", {})
store.save_state(liveness.FEED_RESULT_STATE, {})
shutil.rmtree(births)
os.makedirs(births)
rc = feed_watch.run_check(now=NOW)
check("★ run_check exits non-zero on a failed probe", rc == 2, rc)
check("★ and leaves NO result for the mint step", liveness.load_feed_result() == {}, liveness.load_feed_result())
check("and takes no liveness reading", store.load_state("liveness", {}) == {}, store.load_state("liveness", {}))

print("=== 9. open gap mints, closed gap does not, stale or missing result refuses ===")
calls = []


def fake_mint(**kw):
    calls.append(kw)
    return True


open(os.path.join(births, "2026-11-05.jsonl"), "w", encoding="utf-8").write(
    json.dumps({"first_seen_at": (NOW - timedelta(hours=2)).isoformat()}) + "\n")
store.save_state("liveness", {})
check("POSITIVE CONTROL: the check step runs", feed_watch.run_check(now=NOW - timedelta(hours=1, minutes=55)) == 0)
check("first pass sees a live feed (no open gap)", liveness.load_feed_result().get("open_gap") is None,
      liveness.load_feed_result())
check("run_check at NOW (2 h of silence) succeeds", feed_watch.run_check(now=NOW) == 0)
check("★ the result carries the open gap", bool(liveness.load_feed_result().get("open_gap")), liveness.load_feed_result())
rc = feed_watch.run_mint(now=NOW + timedelta(seconds=30), mint=fake_mint)
check("★ an open gap mints, with the fixed key", rc == 0 and len(calls) == 1
      and calls[0]["dedupe_key"] == "token-watch-feed-gap" and calls[0]["severity"] == "warning", calls)
check("the row names the gap's start", liveness.load_feed_result()["open_gap"]["started_at"] in calls[0]["title"], calls)
feed_watch.run_mint(now=NOW + timedelta(seconds=60), mint=fake_mint)
check("a standing gap re-mints under the SAME key (the server keeps one row)",
      len(calls) == 2 and calls[1]["dedupe_key"] == calls[0]["dedupe_key"], calls)
calls.clear()
check("★ a stale result is refused", feed_watch.run_mint(now=NOW + timedelta(hours=1), mint=fake_mint) == 1
      and calls == [], calls)
store.save_state(liveness.FEED_RESULT_STATE, {})
check("★ a missing result is refused", feed_watch.run_mint(now=NOW, mint=fake_mint) == 1 and calls == [], calls)
with open(os.path.join(births, "2026-11-05.jsonl"), "a", encoding="utf-8") as fh:
    fh.write(json.dumps({"first_seen_at": (NOW + timedelta(minutes=1)).isoformat()}) + "\n")
feed_watch.run_check(now=NOW + timedelta(minutes=2))
check("the feed is back: the gap is closed", liveness.load_feed_result().get("open_gap") is None,
      liveness.load_feed_result())
check("★ a closed gap mints nothing", feed_watch.run_mint(now=NOW + timedelta(minutes=3), mint=fake_mint) == 0
      and calls == [], calls)
gaps = [json.loads(x) for x in open(liveness.GAPS_PATH, encoding="utf-8")]
check("the closed gap is recorded in gaps.jsonl", any(g["detected"] == "prospective_closed" for g in gaps), gaps)
store.save_state("liveness", {})
open(os.path.join(births, "2026-11-05.jsonl"), "w", encoding="utf-8").write(
    json.dumps({"first_seen_at": (NOW - timedelta(hours=2)).isoformat()}) + "\n")
feed_watch.run_check(now=NOW - timedelta(hours=1, minutes=55))
feed_watch.run_check(now=NOW)
check("a failed mint exits non-zero (the unit fails and pages)",
      feed_watch.run_mint(now=NOW, mint=lambda **kw: False) == 1)

print("=== 9b. an outage ACROSS MIDNIGHT: no new census file, the watch keeps running and records the gap ===")
# Langston's replay at Step 4 part 2: the cursor parks on the new day's path, which an outage never creates;
# the probe then failed every run and recovery did not heal it, so gaps.jsonl held no record of the outage.
shutil.rmtree(births)
os.makedirs(births)
store.save_state("liveness", {})
store.save_state(liveness.FEED_RESULT_STATE, {})
open(liveness.GAPS_PATH, "w").close()
D0 = datetime(2026, 11, 3, tzinfo=UTC)
open(os.path.join(births, "2026-11-03.jsonl"), "w", encoding="utf-8").write(
    json.dumps({"first_seen_at": (D0 + timedelta(hours=9, minutes=59)).isoformat()}) + "\n"
    + json.dumps({"first_seen_at": (D0 + timedelta(hours=10)).isoformat()}) + "\n")
calls.clear()
for label, at in (("same day, feed dead", D0 + timedelta(hours=11)),
                  ("first run after midnight", D0 + timedelta(days=1, hours=1)),
                  ("second run after midnight (the wedge)", D0 + timedelta(days=1, hours=2)),
                  ("the next day", D0 + timedelta(days=2, hours=3))):
    rc = feed_watch.run_check(now=at)
    res = liveness.load_feed_result()
    check("★ %s: run_check succeeds" % label, rc == 0, rc)
    check("★ %s: check() ran this run" % label, res.get("checked_at") == at.isoformat(), res)
    check("%s: the gap stays open from the last row" % label,
          (res.get("open_gap") or {}).get("started_at") == (D0 + timedelta(hours=10)).isoformat(), res)
    check("%s: the mint fires" % label,
          feed_watch.run_mint(now=at + timedelta(seconds=30), mint=fake_mint) == 0 and len(calls) >= 1, calls)
check("POSITIVE CONTROL: the cursor did park on a day file that was never created",
      not os.path.exists(store.load_state("liveness", {})["cursor"]["path"]), store.load_state("liveness", {}))
BACK = D0 + timedelta(days=2, hours=10)
open(os.path.join(births, "2026-11-05.jsonl"), "w", encoding="utf-8").write(
    json.dumps({"first_seen_at": (BACK - timedelta(minutes=5)).isoformat()}) + "\n")
rc = feed_watch.run_check(now=BACK)
check("★ the feed is back: run_check succeeds", rc == 0, rc)
check("★ the feed is back: the gap is closed", liveness.load_feed_result().get("open_gap") is None,
      liveness.load_feed_result())
gaps = [json.loads(x) for x in open(liveness.GAPS_PATH, encoding="utf-8") if x.strip()]
check("★ the outage is RECORDED: a prospective_closed gap starting at the last row before it",
      any(g["detected"] == "prospective_closed" and g["started_at"] == (D0 + timedelta(hours=10)).isoformat()
          for g in gaps), gaps)

print("=== 10. the units and the installer carry the feed watch ===")
timer = open(os.path.join(PKG, "systemd", "token-watch-feed-watch.timer"), encoding="utf-8").read()
check("★ the timer interval equals config.LIVENESS_CHECK_INTERVAL_SECONDS",
      "OnUnitActiveSec=%ds" % config.LIVENESS_CHECK_INTERVAL_SECONDS in timer, timer)
svc = open(os.path.join(PKG, "systemd", "token-watch-feed-watch.service"), encoding="utf-8").read()
check("check as tokenwatch, mint as root, failure pages",
      "User=tokenwatch" in svc and "ExecStart=/usr/bin/python3 /opt/token-watch/ops/feed_watch.py --check" in svc
      and "ExecStartPost=+/usr/bin/python3 /opt/token-watch/ops/feed_watch.py --mint" in svc
      and "OnFailure=token-watch-failed@%n.service" in svc, svc)
inst = open(os.path.join(PKG, "deploy", "install_storage.sh"), encoding="utf-8").read()
check("the installer installs both units and verifies the service",
      "token-watch-feed-watch.service token-watch-feed-watch.timer" in inst
      and "token-watch-store-watch.service token-watch-feed-watch.service; do" in inst)
check("★ the installer's box-edit guard reads the PREVIOUS install's blob",
      '"$PREV:token-watch/$f"' in inst and "INSTALLED" in inst)
check("★ the installer compiles EVERY list, PINNED included (C-1)",
      'for f in $ALL; do python3 -m py_compile' in inst and "for f in $OPS $CORE $TOOLS; do python3" not in inst)
check("★ the record names the actor as declared AND as observed (C-2)",
      "actor_declared" in inst and "actor_transport" in inst and '\\"actor\\":' not in inst)
check("the installer carries CORE and TOOLS", 'CORE="follow_up.py"' in inst
      and 'TOOLS="tools/backfill_consumed_from.py tools/due_census.py"' in inst)

shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
