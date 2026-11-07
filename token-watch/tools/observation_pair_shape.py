"""
token-watch — the pair-count shape of the observation rows for given days. READ-ONLY.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, §6 AMENDMENT 1 — the 09-26/09-27 reference shape, committed so the reviewer can
re-derive it: deploy cannot read `observations/` (mask ---), so the command and its stdout are the record.)

    python3 tools/observation_pair_shape.py /var/lib/token-watch/observations 2026-09-26 2026-09-27 2026-09-28

Per day: total rows; rows with `observed: true`; alive among them; the `pairs` histogram (0..5, 6+, other); the
share-weighted mean pair count of the 3+ class (6+ counted as 6, a floor). Rows that fail to parse are COUNTED, never
skipped silently. A day file that does not exist is reported as missing, not as zero.
POSITIVE CONTROL, by construction of the call above: 09-28 is a day whose rows are all `shed: follow_up` (A3), so the
same instrument must report 0 observed there beside 180,630 on 09-26 — it can return a zero and a non-zero.
"""

from __future__ import annotations

import collections
import json
import os
import sys


def shape(path: str) -> dict:
    if not os.path.exists(path):
        return {"missing": True}
    rows = observed = alive = bad = 0
    hist: collections.Counter = collections.Counter()
    with open(path, encoding="utf-8") as fh:
        for line in fh:
            if not line.strip():
                continue
            try:
                r = json.loads(line)
            except ValueError:
                bad += 1
                continue
            rows += 1
            if r.get("observed") is not True:
                continue
            observed += 1
            alive += bool(r.get("alive"))
            k = r.get("pairs")
            hist[str(k) if isinstance(k, int) and 0 <= k <= 5 else ("6+" if isinstance(k, int) and k > 5 else "other")] += 1
    three_plus = {k: v for k, v in hist.items() if k in ("3", "4", "5", "6+")}
    n3 = sum(three_plus.values())
    mean3 = (sum((6 if k == "6+" else int(k)) * v for k, v in three_plus.items()) / n3) if n3 else None
    return {"rows": rows, "observed": observed, "alive": alive, "unparsed": bad,
            "pairs": dict(sorted(hist.items())),
            "share": {k: round(v / observed, 6) for k, v in sorted(hist.items())} if observed else {},
            "alive_share": round(alive / observed, 6) if observed else None,
            "class_3plus": {"n": n3, "mean_pairs_6plus_as_6": round(mean3, 4) if mean3 else None}}


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print("usage: observation_pair_shape.py <observations dir> <YYYY-MM-DD>...", file=sys.stderr)
        sys.exit(2)
    folder = sys.argv[1]
    for day in sys.argv[2:]:
        print(json.dumps({"day": day, **shape(os.path.join(folder, day + ".jsonl"))}, sort_keys=True))
