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
from datetime import datetime, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import ROOT  # noqa: E402
import tier  # noqa: E402
from store import load_state  # noqa: E402

UTC = timezone.utc
OUT = os.path.join(ROOT, "due-census.json")


def census(now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    c = tier.classify_due_buckets(now, load_state(tier.CURSOR_STATE, {}))
    total_count = sum(v["count"] for v in c["classes"].values())
    total_bytes = sum(v["bytes"] for v in c["classes"].values())
    return {"measured_at": now.isoformat(), "ok": c["ok"], "reason": c["reason"],
            "consumed_from": c["consumed_from"], "last_bucket": c["last_bucket"],
            "spent_before": c["spent_before"], "classes": c["classes"],
            "total": {"count": total_count, "bytes": total_bytes}}


def main() -> int:
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
