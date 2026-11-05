"""
token-watch — tiering and the cold hand-off. (OBJ-6)

★ BUILT ON DAY ONE, and that is a scope requirement rather than tidiness.
  `RUNNING_ISSUES` #670 is the same defect in the crew-status tooling: a warm
  tier with no cold hand-off, growing unbounded. Deferring the hand-off is how
  that happened — the collector works fine right up until it doesn't, and by
  then there is a lot of data to move under pressure.

⛔ THE ONLY DELETER IN THIS PACKAGE, and it removes a hot copy ONLY after a
  verified compressed copy exists in cold. TWO bulky stores tier, both raw
  provider data: the webhook bodies the receiver accepts, and the observation
  responses behind every checkpoint. (`PAYLOAD_DIR` was removed 2026-08-28: it
  had never had a writer. See the note on TIERED_SOURCES.) Adding a bulky
  writer without adding it there is how a disk fills quietly, and that has
  already happened once in this package.
  ⛔⛔ BIRTH RECORDS ARE DELETED BY NOTHING, EVER. There is no code path here
     that can touch them, and the test asserts it. A sampled or truncated
     birth census destroys the base rate of every rate in the study, and §5
     measures reconstruction as unaffordable at every tier — reconstructable
     but unaffordable is operationally not reconstructable.

THE SPLIT, and why the two halves have different retentions (BLOCKER-4 of the
r1→r2 review, where my original justification was FALSE):
  • the WORKING INDEX stays hot for the FULL 90 days, because the follow-up
    scheduler is a named reader with a 90-day lookback — firing a 90-day
    checkpoint means reading a birth from 90 days ago. I had written "nothing
    queries this for 90 days", and the scheduler queries it hourly. The
    governing invariant is hot retention >= the deepest reader window.
  • the BULKY RAW STORE tiers at 1 day, because nothing reads it in the normal
    course — it is an audit record, consulted only to reconcile a suspected
    poisoning, which is exactly the job a compressed cold copy still does.
"""

from __future__ import annotations

import gzip
import logging
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone

from config import BULKY_HOT_DAYS, COLD_DIR, DUE_SPENT_HOT_DAYS
from provenance import FOLLOW_UP_DIR as PROVENANCE_FOLLOW_UP_DIR
from provenance import RAW_DIR as PROVENANCE_RAW_DIR
from store import DUE_DIR, ensure_dirs, load_state, periodic_lock

UTC = timezone.utc
LOG = logging.getLogger("token-watch.tier")

# ⛔ THE PROTECTED SET. Nothing in this module may write to, move, or unlink a
# path under these. Named as a constant so the prohibition is checkable rather
# than remembered — and the test greps for exactly that.
NEVER_TOUCH = ("births", "observations", "dead")


def _safe(path: str) -> bool:
    parts = os.path.normpath(path).replace("\\", "/").split("/")
    return not any(p in NEVER_TOUCH for p in parts)


# The store may not be written to for a little while (a quiet hour, a stalled
# sweep). Archiving a file that is merely IDLE would be wrong; archiving one
# still being appended to would be worse. This guards the second.
STILL_WARM_SECONDS = 3600


def _age_days(path: str, now: datetime) -> float:
    """How old the DATA is, taken from the filename date -- not from mtime.

    ⛔⛔ MTIME WAS THE WRONG CLOCK AND IT COST A DAY OF HOT STORAGE. These are
       APPEND-ONLY DAILY FILES: `2026-08-31.jsonl` is written to all through
       the 31st, so its mtime is 23:59 that night and its "age" only passes
       one day at 23:59 on the 1st -- meaning it is archived on the 2nd.
       TWO days hot, where the approved scope (§4) says ONE:
         "birth payload + follow-up series (bulky) | hot 1 day | daily
          .jsonl.gz -> warm -> cold"
       Measured 2026-09-01: three nightly runs, 0 bytes moved, and the 08-31
       file sat at 0.23 days old at 05:38 on 09-01 -- ineligible, by a clock
       that measures when we last touched the file rather than what the file
       IS. The date in the name is the data's own date and cannot drift.

    ⚠️ THE MTIME GUARD IS KEPT, NARROWED TO ITS REAL JOB: never archive a file
       still being appended to. That is a safety property; it was never an
       age measurement, and using it as one is what caused the extra day.
    """
    name = os.path.basename(path)
    stamp = name.split(".")[0]
    try:
        day = datetime.strptime(stamp, "%Y-%m-%d").replace(tzinfo=UTC)
    except ValueError:
        # Not a dated file -- fall back to mtime rather than guessing an age.
        return (now - datetime.fromtimestamp(os.path.getmtime(path), UTC)).total_seconds() / 86400.0
    if (now - datetime.fromtimestamp(os.path.getmtime(path), UTC)).total_seconds() < STILL_WARM_SECONDS:
        return 0.0                      # actively being written -- never move it
    return (now.replace(hour=0, minute=0, second=0, microsecond=0) - day).total_seconds() / 86400.0


# ⛔ EVERY BULKY STORE THAT TIERS, AND ITS COLD-NAME PREFIX.
#
# ⚠️ ADDING A BULKY WRITER WITHOUT ADDING IT HERE IS HOW A DISK FILLS QUIETLY,
#    AND IT HAS ALREADY HAPPENED ONCE: the receiver's raw provenance store —
#    the BULKIEST thing in the package, projected 2-14 GB over 90 days, which
#    SPANS the 8 GiB cap — shipped with no tiering at all, because tiering was
#    written before the store existed. Kyle's question found it. On this box
#    the disk is shared with the live trading app, so a store with no retention
#    is not an untidiness.
#
# ★ THE PREFIX IS LOAD-BEARING AGAIN, AND THAT VINDICATES KEEPING IT. When
#   PAYLOAD_DIR was deleted only one source remained and the prefix could have
#   been dropped as dead weight; it was kept because stores here name files by
#   DATE, so any second source collides. A second source arrived the SAME DAY.
#   Without the prefix, `provenance/raw/2026-08-28.jsonl` and
#   `provenance/follow-up/2026-08-28.jsonl` would both become
#   `cold/2026-08-28.jsonl.gz` and the second would silently overwrite the
#   first — tiering that destroys the file it just archived.
#
# ⛔ TIERED, NEVER DELETED. Cold is compressed and kept: this store is the
#    PRIMARY control on the accept path (a static, replayable header secret
#    proves nothing about a body), so losing it loses the only thing that makes
#    a poisoning partitionable. Compress-verify-remove preserves it; the
#    protected set above is what stops anything here reaching the census.
#
# 🗑 `PAYLOAD_DIR` WAS REMOVED FROM THIS LIST ON 2026-08-28 — see
#    `DELETED_COMPONENTS_LOG.md`. It had ZERO writers in its entire history:
#    no `payload_path()` builder ever existed, so nothing could construct a
#    path into it. It was an empty directory that `ensure_dirs()` created and
#    this job walked daily, finding nothing. The scope role it was declared for
#    (bulky birth payload, 1-day retention) is genuinely performed by the
#    provenance store above, at the same retention.
TIERED_SOURCES = (
    (PROVENANCE_RAW_DIR, "provenance-raw"),
    (PROVENANCE_FOLLOW_UP_DIR, "provenance-follow-up"),
)


def tier_payloads(now: datetime | None = None) -> dict:
    """Compress bulky stores past the hot window into cold storage, then remove
    the hot copy. Compress-then-verify-then-remove, in that order: a hand-off
    that deletes before confirming the cold copy is readable is a data-loss path
    wearing a retention policy's clothes.
    """
    now = now or datetime.now(UTC)
    ensure_dirs()
    for _d, _ in TIERED_SOURCES:          # every source, not just the first
        os.makedirs(_d, exist_ok=True)
    moved, freed, refused = 0, 0, 0
    by_source = {}

    for src_dir, prefix in TIERED_SOURCES:
      listing = sorted(os.listdir(src_dir)) if os.path.isdir(src_dir) else []
      by_source[prefix] = 0
      for name in listing:
        src = os.path.join(src_dir, name)
        if not os.path.isfile(src):
            continue
        if not _safe(src):
            refused += 1
            LOG.error("REFUSED to tier a protected path: %s", src)
            continue
        # ⛔ STRICTLY LESS-THAN, AND THE BOUNDARY IS THE WHOLE POINT. `<=` keeps a
        #    file for a SECOND day: yesterday's file is exactly 1 day old, and
        #    `1 <= 1` skips it. The approved scope is TODAY hot, YESTERDAY
        #    archived -- Kyle, 2026-09-01: "a full day comes in, the next day we
        #    keep that, the day before is archived." So age 1 must MOVE.
        if _age_days(src, now) < BULKY_HOT_DAYS:
            continue

        dst = os.path.join(COLD_DIR, "%s-%s.gz" % (prefix, name))
        size = os.path.getsize(src)
        with open(src, "rb") as fin, gzip.open(dst, "wb") as fout:
            shutil.copyfileobj(fin, fout)

        # VERIFY THE COLD COPY BEFORE REMOVING THE HOT ONE. An empty or
        # truncated archive that reads as "moved" is the absent-as-valid
        # failure applied to storage.
        with gzip.open(dst, "rb") as fh:
            if len(fh.read(1)) != 1 and size > 0:
                LOG.error("cold copy unreadable, HOT COPY KEPT: %s", dst)
                continue

        os.unlink(src)
        moved += 1
        freed += size
        by_source[prefix] += 1

    # ★ PER-SOURCE COUNTS, not just a total. A total of zero cannot distinguish
    #   "nothing was old enough" from "a source was silently never walked" —
    #   which is precisely the defect this function shipped with.
    return {"moved": moved, "freed_bytes": freed, "refused": refused,
            "by_source": by_source}


HOUR_FMT = "%Y-%m-%dT%H"
CURSOR_STATE = "follow_up_cursor"

# The classes a due bucket can be in. Exactly one per bucket; the census tool
# (tools/due_census.py) reports the same classes from the same function.
DUE_CLASSES = ("removable", "kept_spent_window", "kept_after_cursor",
               "kept_before_consumed_from", "kept_unparsed")


def _hour(v: str) -> datetime:
    return datetime.strptime(v, HOUR_FMT).replace(tzinfo=UTC)


def classify_due_buckets(now: datetime, cursor: dict) -> dict:
    """Sort every `due/` bucket into one of DUE_CLASSES. Reads nothing but names and sizes.

    A bucket is REMOVABLE only if the follow-up has read it AND it is old:
        consumed_from <= hour <= last_bucket   (the cursor has passed it), and
        hour < now - DUE_SPENT_HOT_DAYS        (past the audit margin).
    ⛔ `consumed_from` IS THE OTHER HALF OF "THE CURSOR HAS PASSED IT". The
       cursor alone does not say so: a first run (no cursor) reads only its own
       hour and stamps it (`follow_up._buckets_to_read`), so after a LOST cursor
       one run would put every never-read bucket behind `last_bucket`.
       `consumed_from` is where the cursor's lineage began; nothing before it
       was ever read, so nothing before it is removable.
    ⛔ THE LOWER BOUND IS LOAD-BEARING ON THE SCHEDULER'S SAME-HOUR PUSH (Langston part-1 record line):
       every new due write lands strictly after `last_bucket` only because `store.schedule_grid` records a past
       grid point as a miss row and pushes a same-hour point to the NEXT bucket, and the requeue writes now+1h.
       If the write side ever wrote the current hour again, this prune would delete entries written after the
       read, and nothing here would show it.
    Returns {"ok", "reason", "classes": {class: {"count", "bytes"}}, "paths": {class: [path]}, ...}.
    With no cursor, or no `consumed_from`, ok is False and every bucket is
    counted as kept — the caller removes nothing.
    """
    out = {c: {"count": 0, "bytes": 0} for c in DUE_CLASSES}
    paths = {c: [] for c in DUE_CLASSES}
    last_v, from_v = cursor.get("last_bucket"), cursor.get("consumed_from")
    ok, reason = True, ""
    # Each field parsed on its own (Langston part-1 item 2): a damaged consumed_from with an intact last_bucket
    # must say so, not read as "no follow-up cursor".
    last = first = None
    bad = []
    try:
        last = _hour(last_v) if last_v else None
    except ValueError:
        bad.append("last_bucket %r is not an hour" % (last_v,))
    try:
        first = _hour(from_v) if from_v else None
    except ValueError:
        bad.append("consumed_from %r is not an hour" % (from_v,))
    if bad:
        ok, reason = False, "damaged cursor: " + "; ".join(bad)
    elif last is None or first is None:
        ok, reason = False, ("no follow-up cursor" if last is None
                             else "the cursor has no consumed_from")
    elif first > last:
        ok, reason = False, "consumed_from %s is after last_bucket %s" % (from_v, last_v)
    spent_before = now - timedelta(days=DUE_SPENT_HOT_DAYS)
    names = sorted(os.listdir(DUE_DIR)) if os.path.isdir(DUE_DIR) else []
    for name in names:
        path = os.path.join(DUE_DIR, name)
        if not os.path.isfile(path) or not _safe(path):
            continue
        size = os.path.getsize(path)
        try:
            h = _hour(name.replace(".jsonl", ""))
        except ValueError:
            cls = "kept_unparsed"
        else:
            if not ok:
                cls = ("kept_after_cursor" if last is not None and h > last
                       else "kept_before_consumed_from")
            elif h < first:
                cls = "kept_before_consumed_from"
            elif h > last:
                cls = "kept_after_cursor"
            elif h < spent_before:
                cls = "removable"
            else:
                cls = "kept_spent_window"
        out[cls]["count"] += 1
        out[cls]["bytes"] += size
        paths[cls].append(path)
    return {"ok": ok, "reason": reason, "classes": out, "paths": paths,
            "consumed_from": from_v, "last_bucket": last_v,
            "spent_before": spent_before.strftime(HOUR_FMT)}


def prune_due_buckets(now: datetime | None = None) -> dict:
    """Remove `due/` buckets the follow-up has already read, once they are old.

    ⛔ THE PREVIOUS RULE WAS "an hour older than 91 days", ON THE PREMISE
       "once an hour has passed and its entries are observed, nothing reads
       the bucket again". REFUTED 2026-11-05 (B-TOKEN-WATCH-STORAGE amendment
       1): the follow-up has been off since 2026-09-30, so every bucket since
       its cursor is unread and still owed a read — and an hour-only rule
       would have deleted them unread once they were 91 days old. The rule is
       now the cursor's: see `classify_due_buckets`. With no cursor, or no
       `consumed_from`, NOTHING is removed and the reason is logged.
    Must run under `periodic_lock` (it does, inside `run`), the same lock the
    follow-up holds while it advances the cursor — so the cursor cannot move
    between this read and the removals.
    These buckets are scheduling artefacts: NOT observations, NOT births.
    """
    now = now or datetime.now(UTC)
    cur = load_state(CURSOR_STATE, {})
    c = classify_due_buckets(now, cur)
    removed = removed_bytes = 0
    if not c["ok"]:
        LOG.warning("due prune: NOTHING REMOVED — %s", c["reason"])
    for path in c["paths"]["removable"] if c["ok"] else []:
        size = os.path.getsize(path)
        os.unlink(path)
        removed += 1
        removed_bytes += size
    counts = c["classes"]
    LOG.info("due prune: removed %d (%d B); kept spent-window %d (%d B), after cursor %d (%d B), "
             "before consumed_from %d (%d B), unparsed %d; cursor %s..%s, spent before %s",
             removed, removed_bytes,
             counts["kept_spent_window"]["count"], counts["kept_spent_window"]["bytes"],
             counts["kept_after_cursor"]["count"], counts["kept_after_cursor"]["bytes"],
             counts["kept_before_consumed_from"]["count"], counts["kept_before_consumed_from"]["bytes"],
             counts["kept_unparsed"]["count"], c["consumed_from"], c["last_bucket"], c["spent_before"])
    return {"due_buckets_removed": removed, "due_bytes_removed": removed_bytes,
            "due_prune_ok": c["ok"], "due_prune_reason": c["reason"],
            "due_classes": counts}


def run(now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    with periodic_lock("tier") as held:
        if not held:
            LOG.warning("another periodic job holds the lock — tiering SKIPPED")
            return {"skipped": True}
        out = tier_payloads(now)
        out.update(prune_due_buckets(now))
    LOG.info("tier %s", out)
    return out


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    r = run()
    sys.exit(1 if r.get("refused") else 0)
