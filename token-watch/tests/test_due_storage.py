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
LAYOUT = [(B_BEFORE, 11), (B_OLD_SPENT, 22), (B_EDGE_SPENT, 33), (B_RECENT, 44), (B_AFTER, 55)]

print("=== 1. the four classes, by count and bytes ===")
reset_due(LAYOUT)
open(os.path.join(store.DUE_DIR, "not-an-hour.jsonl"), "wb").write(b"z" * 7)
c = tier.classify_due_buckets(NOW, {"consumed_from": H(FROM), "last_bucket": H(LAST)})
cls = c["classes"]
check("ok with a full cursor", c["ok"] is True, c["reason"])
check("removable = the two read-and-old buckets", cls["removable"] == {"count": 2, "bytes": 55}, cls["removable"])
check("kept inside the spent window", cls["kept_spent_window"] == {"count": 1, "bytes": 44}, cls["kept_spent_window"])
check("★ kept after the cursor (unread)", cls["kept_after_cursor"] == {"count": 1, "bytes": 55}, cls["kept_after_cursor"])
check("★ kept before consumed_from (never read)", cls["kept_before_consumed_from"] == {"count": 1, "bytes": 11},
      cls["kept_before_consumed_from"])
check("an unparsable name is kept and counted", cls["kept_unparsed"] == {"count": 1, "bytes": 7}, cls["kept_unparsed"])

print("=== 2. the prune removes exactly the removable class ===")
store.save_state("follow_up_cursor", {"consumed_from": H(FROM), "last_bucket": H(LAST)})
r = tier.prune_due_buckets(NOW)
check("POSITIVE CONTROL: it removed something", r["due_buckets_removed"] == 2, r)
check("bytes removed are reported", r["due_bytes_removed"] == 55, r)
check("★ every unread bucket survived", set(present()) >= {H(B_BEFORE), H(B_AFTER)}, present())
check("the bucket inside the margin survived", H(B_RECENT) in present(), present())
check("the two spent-and-old buckets are gone", not ({H(B_OLD_SPENT), H(B_EDGE_SPENT)} & set(present())), present())

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
check("★ after cursor loss + one run, NOTHING old is removed", r["due_buckets_removed"] == 0 and len(present()) == 5,
      (r, present()))

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
check("census classes equal the prune's", cen["classes"]["removable"]["count"] == 2
      and cen["classes"]["kept_after_cursor"]["count"] == 1, cen["classes"])
check("census totals cover every bucket", cen["total"]["count"] == 5, cen["total"])
check("★ the census removed nothing", present() == before)

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
check("the installer carries CORE and TOOLS", 'CORE="follow_up.py"' in inst
      and 'TOOLS="tools/backfill_consumed_from.py tools/due_census.py"' in inst)

shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
