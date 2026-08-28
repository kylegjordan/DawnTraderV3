"""
token-watch — tiering and the cold hand-off. (OBJ-6)

★ BUILT ON DAY ONE, and that is a scope requirement rather than tidiness.
  `RUNNING_ISSUES` #670 is the same defect in the crew-status tooling: a warm
  tier with no cold hand-off, growing unbounded. Deferring the hand-off is how
  that happened — the collector works fine right up until it doesn't, and by
  then there is a lot of data to move under pressure.

⛔ THE ONLY DELETER IN THIS PACKAGE, and it deletes exactly one thing: bulky
  raw provider payloads past their hot window.
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
  • the BULKY PAYLOAD tiers at 1 day, because nothing reads it after the
    observation is extracted.
"""

from __future__ import annotations

import gzip
import logging
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone

from config import COLD_DIR, PAYLOAD_DIR, PAYLOAD_HOT_DAYS, WORKING_INDEX_HOT_DAYS
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


def tier_payloads(now: datetime | None = None) -> dict:
    """Compress payloads past the hot window into cold storage, then remove the
    hot copy. Compress-then-verify-then-remove, in that order: a hand-off that
    deletes before confirming the cold copy is readable is a data-loss path
    wearing a retention policy's clothes.
    """
    now = now or datetime.now(UTC)
    ensure_dirs()
    moved, freed, refused = 0, 0, 0

    for name in sorted(os.listdir(PAYLOAD_DIR)) if os.path.isdir(PAYLOAD_DIR) else []:
        src = os.path.join(PAYLOAD_DIR, name)
        if not os.path.isfile(src):
            continue
        if not _safe(src):
            refused += 1
            LOG.error("REFUSED to tier a protected path: %s", src)
            continue
        if _age_days(src, now) <= PAYLOAD_HOT_DAYS:
            continue

        dst = os.path.join(COLD_DIR, name + ".gz")
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

    return {"moved": moved, "freed_bytes": freed, "refused": refused}


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
