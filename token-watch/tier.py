"""
token-watch — tiering and the cold hand-off. (OBJ-6)

★ BUILT ON DAY ONE, and that is a scope requirement rather than tidiness.
  `RUNNING_ISSUES` #670 is the same defect in the crew-status tooling: a warm
  tier with no cold hand-off, growing unbounded. Deferring the hand-off is how
  that happened — the collector works fine right up until it doesn't, and by
  then there is a lot of data to move under pressure.

⛔ THE ONLY DELETER IN THIS PACKAGE, and it removes a hot copy ONLY after a
  verified compressed copy exists in cold. ONE bulky store tiers today — the
  receiver's raw provenance store, added 2026-08-28, the day it was built.
  (`PAYLOAD_DIR` was removed the same day: it had never had a writer. See the
  note on TIERED_SOURCES.) Adding a bulky writer without adding it there is how
  a disk fills quietly, and that has already happened once.
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

from config import BULKY_HOT_DAYS, COLD_DIR, WORKING_INDEX_HOT_DAYS
from provenance import RAW_DIR as PROVENANCE_RAW_DIR
from store import DUE_DIR, ensure_dirs, periodic_lock

UTC = timezone.utc
LOG = logging.getLogger("token-watch.tier")

# ⛔ THE PROTECTED SET. Nothing in this module may write to, move, or unlink a
# path under these. Named as a constant so the prohibition is checkable rather
# than remembered — and the test greps for exactly that.
NEVER_TOUCH = ("births", "observations", "dead")


def _safe(path: str) -> bool:
    parts = os.path.normpath(path).replace("\\", "/").split("/")
    return not any(p in NEVER_TOUCH for p in parts)


def _age_days(path: str, now: datetime) -> float:
    return (now - datetime.fromtimestamp(os.path.getmtime(path), UTC)).total_seconds() / 86400.0


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
# ★ THE PREFIX IS KEPT DELIBERATELY THOUGH ONLY ONE SOURCE REMAINS, and that
#   is a decision rather than a leftover. Stores here name files by DATE, so
#   any second source would produce the same cold filename and the second write
#   would silently overwrite the first — tiering that destroys the file it just
#   archived, one layer deeper than the verify-before-remove order guards
#   against. Removing the prefix now would make the NEXT addition unsafe by
#   default, and the paragraph above is the evidence that additions happen.
#   `test_tiering` asserts the property against an injected second source, so
#   the guarantee stays tested with only one real store configured.
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
)


def tier_payloads(now: datetime | None = None) -> dict:
    """Compress bulky stores past the hot window into cold storage, then remove
    the hot copy. Compress-then-verify-then-remove, in that order: a hand-off
    that deletes before confirming the cold copy is readable is a data-loss path
    wearing a retention policy's clothes.
    """
    now = now or datetime.now(UTC)
    ensure_dirs()
    os.makedirs(PROVENANCE_RAW_DIR, exist_ok=True)
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
        if _age_days(src, now) <= BULKY_HOT_DAYS:
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


def prune_due_buckets(now: datetime | None = None) -> dict:
    """Remove due buckets whose hour is older than the deepest grid age.

    These are pure scheduling artefacts: once an hour has passed and its
    entries are observed, nothing reads the bucket again. They are NOT
    observations, and they are NOT births.
    """
    now = now or datetime.now(UTC)
    cutoff = now - timedelta(days=WORKING_INDEX_HOT_DAYS + 1)
    removed = 0
    for name in sorted(os.listdir(DUE_DIR)) if os.path.isdir(DUE_DIR) else []:
        path = os.path.join(DUE_DIR, name)
        if not _safe(path):
            continue
        try:
            when = datetime.strptime(name.replace(".jsonl", ""), "%Y-%m-%dT%H").replace(tzinfo=UTC)
        except ValueError:
            continue
        if when < cutoff:
            os.unlink(path)
            removed += 1
    return {"due_buckets_removed": removed}


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
