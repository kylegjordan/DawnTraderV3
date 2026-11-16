#!/usr/bin/env python3
"""B-TOKEN-WATCH-BIRTH-CAP OBJ-2 — the PRE-REGISTERED comparator, written down (Langston gate D, C-1).

Reads the census (`births/*.jsonl`, `first_seen_at`) and `provenance/gaps.jsonl` read-only and prints ONE JSON object:
  - the reference days (AMENDMENT 18 + its rider: 2026-09-01 → 10-17 and 10-28 → 11-15, minus 09-26 and 09-27),
  - the POOLED hour-of-day counts and shares over those days (hour, n, share) × 24 — the expected shares OBJ-2 is
    judged against (before coverage weighting),
  - the per-month hour-share spread (the stationarity precondition, ≤ 1.0 percentage point),
  - every gap record whose span touches 2026-09-01 → 11-16, so the exclusions can be checked against the full list.
Run as a user that can read the store (root on staging):  python3 birthcap_reference.py [TOKEN_WATCH_ROOT]
Nothing is written to the store."""
import collections
import datetime as dt
import json
import os
import re
import sys

ROOT = sys.argv[1] if len(sys.argv) > 1 else os.environ.get("TOKEN_WATCH_ROOT", "/var/lib/token-watch")
BIRTHS = os.path.join(ROOT, "births")
GAPS = os.path.join(ROOT, "provenance", "gaps.jsonl")
PAT = re.compile(rb'"first_seen_at": ?"(\d{4}-\d\d-\d\dT\d\d)')
# The rider (Langston gate D, C-1): EVERY UTC day touched by a recorded gap is excluded — computed from gaps.jsonl,
# never a hand list (a sub-hour gap zeroes no hour, so zero-row hours alone cannot find it).
EXCLUDED: set = set()


def gap_days(gaps: list) -> set:
    out = set()
    for g in gaps:
        a = dt.datetime.fromisoformat(g["started_at"]).date()
        b = dt.datetime.fromisoformat(g["ended_at"]).date()
        while a <= b:
            out.add(a.isoformat())
            a += dt.timedelta(days=1)
    return out


def in_reference(day: str) -> bool:
    d = dt.date.fromisoformat(day)
    window = dt.date(2026, 9, 1) <= d <= dt.date(2026, 10, 17) or dt.date(2026, 10, 28) <= d <= dt.date(2026, 11, 15)
    return window and day not in EXCLUDED


def main() -> None:
    gaps = []
    if os.path.exists(GAPS):
        with open(GAPS, encoding="utf-8") as fh:
            for line in fh:
                try:
                    g = json.loads(line)
                except ValueError:
                    continue
                if str(g.get("ended_at", "")) >= "2026-09-01" and str(g.get("started_at", "")) <= "2026-11-16":
                    gaps.append({k: g.get(k) for k in ("kind", "detected", "started_at", "ended_at", "duration_s")})
    EXCLUDED.update(gap_days(gaps))
    cnt = collections.Counter()
    rows = missing = 0
    for f in sorted(os.listdir(BIRTHS)):
        if not f.endswith(".jsonl"):
            continue
        with open(os.path.join(BIRTHS, f), "rb") as fh:
            for line in fh:
                rows += 1
                m = PAT.search(line)
                if m:
                    cnt[m.group(1).decode()] += 1
                else:
                    missing += 1
    days = sorted({k[:10] for k in cnt if in_reference(k[:10])})
    hours = [0] * 24
    by_month = collections.defaultdict(lambda: [0] * 24)
    for k, v in cnt.items():
        if in_reference(k[:10]):
            h = int(k[11:13])
            hours[h] += v
            by_month[k[:7]][h] += v
    total = sum(hours)
    shares = {m: [x / sum(a) for x in a] for m, a in by_month.items()}
    spread = max(max(shares[m][h] for m in shares) - min(shares[m][h] for m in shares) for h in range(24)) * 100
    empty = [f"{d}T{h:02d}" for d in days for h in range(24) if f"{d}T{h:02d}" not in cnt]
    print(json.dumps({
        "reference": "2026-09-01..10-17 + 10-28..11-15, excluding every day touched by a recorded gap",
        "excluded_days": sorted(EXCLUDED),
        "files_scanned_rows": rows, "rows_missing_first_seen": missing,
        "reference_days": len(days), "reference_rows": total, "reference_day_hours_with_zero_rows": empty,
        "hour_shares": [{"hour": h, "n": hours[h], "share": round(hours[h] / total, 6)} for h in range(24)],
        "month_spread_pp": round(spread, 3), "months": sorted(by_month),
        "gaps_touching_2026_09_01_to_11_16": gaps,
    }, indent=1))


if __name__ == "__main__":
    main()
