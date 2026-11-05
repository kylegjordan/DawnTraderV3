"""
token-watch — the `due/` census: what the due prune would remove and what it keeps. (B-TOKEN-WATCH-STORAGE amendment 1, P5)

READ-ONLY. It calls `tier.classify_due_buckets` — the same function the prune
uses, so the census and the prune cannot disagree about a bucket — and removes
nothing. Run as tokenwatch, before and after the first real prune:
    python3 tools/due_census.py
Prints the classes (count and bytes) and writes them to `<store>/due-census.json`
(the store root's default ACL gives `deploy` read; `offbox/` is
tokenwatch-cold's and tokenwatch cannot write there — a deviation from P5's
wording, recorded in the change list).
"""

from __future__ import annotations

import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import ROOT  # noqa: E402
import tier  # noqa: E402
from store import load_state  # noqa: E402

UTC = timezone.utc
OUT = os.path.join(ROOT, "due-census.json")
LINEAGE_OUT = os.path.join(ROOT, "due-lineage.json")   # the verdict the first prune is gated on (Langston R-4)


def census(now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    c = tier.classify_due_buckets(now, load_state(tier.CURSOR_STATE, {}))
    total_count = sum(v["count"] for v in c["classes"].values())
    total_bytes = sum(v["bytes"] for v in c["classes"].values())
    return {"measured_at": now.isoformat(), "ok": c["ok"], "reason": c["reason"],
            "consumed_from": c["consumed_from"], "last_bucket": c["last_bucket"],
            "spent_before": c["spent_before"], "classes": c["classes"],
            "total": {"count": total_count, "bytes": total_bytes}}


def lineage(now: datetime | None = None, floor: float = 0.5) -> dict:
    """For each REMOVABLE bucket: the share of its entries (mint, age) that have ANY observation row on the bucket's
    day or the two days after. A bucket under `floor` is a GAP: evidence that the cursor's lineage may have skipped
    it, so the backfilled consumed_from is not proven for it (Langston, Step-4 part 1). Read-only; one day's
    observation set in memory at a time.
    ⚠️ NOT EVERY READ WRITES A ROW (Langston R-3): an observation, a shed and a recorded death do (`store.
       record_observation`, keyed mint+age), but a REQUEUE (the entry is copied to a later bucket and its row is
       written only when that copy is read) and an observation ERROR write none for this bucket. So a fully read
       bucket can score below 1.0. FLOOR = 0.5: a bucket in which at least half the entries left a row was read; a
       never-read bucket scores ~0, because nothing reads it to write any row (a requeue copy carries no row until
       read, and the next-age entry has a different age - Langston tried to build an aliasing path and could not).
       The residual is conservative: a read bucket with heavy requeues can be flagged as a gap, never the reverse.
       Exactly 0.5 is NOT a gap (`<` below) - pinned by test_due_storage.py section 6b."""
    import json as _json
    from collections import defaultdict
    from config import OBSERVATIONS_DIR
    now = now or datetime.now(UTC)
    c = tier.classify_due_buckets(now, load_state(tier.CURSOR_STATE, {}))
    by_day = defaultdict(list)
    for p in c["paths"]["removable"]:
        by_day[os.path.basename(p)[:10]].append(p)
    gaps, checked = [], 0
    for day in sorted(by_day):
        d0 = datetime.strptime(day, "%Y-%m-%d")
        seen = set()
        for k in range(3):
            f = os.path.join(OBSERVATIONS_DIR, (d0 + timedelta(days=k)).strftime("%Y-%m-%d") + ".jsonl")
            if not os.path.exists(f):
                continue
            with open(f, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        r = _json.loads(line)
                    except ValueError:
                        continue
                    seen.add((r.get("mint"), r.get("age")))
        for p in by_day[day]:
            n = hit = 0
            with open(p, encoding="utf-8") as fh:
                for line in fh:
                    try:
                        e = _json.loads(line)
                    except ValueError:
                        continue
                    n += 1
                    hit += (e.get("mint"), e.get("age")) in seen
            checked += 1
            if n and hit / n < floor:
                gaps.append({"bucket": os.path.basename(p)[:-6], "entries": n, "observed": hit})
    return {"measured_at": now.isoformat(), "removable_buckets_checked": checked, "floor": floor,
            "gaps": gaps, "verdict": "GAPS - do not prune" if gaps else "no gap found"}


def main() -> int:
    # Langston, part-3 re-land: any OTHER argument used to fall through to the census and exit 0 - and on the tool
    # whose verdict gates the first prune, exit 0 reads as "no gap found". Unknown arguments refuse, as the
    # backfill tool's do.
    if sys.argv[1:] not in ([], ["--lineage"]):
        print("usage: due_census.py [--lineage]", file=sys.stderr)
        return 2
    if sys.argv[1:] == ["--lineage"]:
        out = lineage()
        text = json.dumps(out, indent=2, sort_keys=True)
        print(text)
        tmp = LINEAGE_OUT + ".%d.tmp" % os.getpid()
        with open(tmp, "w", encoding="utf-8") as fh:
            fh.write(text + "\n")
        os.replace(tmp, LINEAGE_OUT)
        return 1 if out["gaps"] else 0
    out = census()
    text = json.dumps(out, indent=2, sort_keys=True)
    print(text)
    tmp = OUT + ".%d.tmp" % os.getpid()
    with open(tmp, "w", encoding="utf-8") as fh:
        fh.write(text + "\n")
    os.replace(tmp, OUT)
    return 0


if __name__ == "__main__":
    sys.exit(main())
