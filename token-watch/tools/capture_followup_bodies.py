"""
token-watch — capture one real DexScreener body per mint in a window of due buckets, INTO A SCRATCH TREE.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, the measurement's input; #1132.)

    TOKEN_WATCH_ROOT=/var/lib/token-watch-scratch \
      python3 tools/capture_followup_bodies.py --first 2026-09-30T14 --last 2026-10-02T13 \
        --log /var/lib/token-watch-scratch/capture-log.jsonl [--resume]

WHAT IT DOES. For every DISTINCT mint in the due buckets [first, last] (first appearance order), it calls
`providers.token_state(mint)` once — the production code path, unchanged — so each body lands, by the production
writer `provenance.record_follow_up`, in the scratch tree's `provenance/follow-up/`. The replay harness
(`tools/measure_followup_memory.py`) later serves those bodies back to `follow_up.run_hour`.

⛔ IT REFUSES THE PRODUCTION STORE. `config.ROOT` comes from `TOKEN_WATCH_ROOT` (`config.py:220`); if it resolves to
   `/var/lib/token-watch`, or the variable is unset, the tool exits 2 before any import that could write. A capture
   into the live store would add ~2 GB of bodies to a store already over its warn line.
⛔ THE LEDGER IS A FRESH ONE FOR THE CURRENT MONTH (plan P1 C-5): the scratch `state/budget.json` is replaced with
   `budget._blank(<this month>)` before the first call, so `budget.allowed("follow_up")` is true and the run is not
   shed by a copied ledger. `CREDITS["follow_up"]` is 0, so the run spends no credits either way.
⛔ THE CHECKPOINT IS KEYED TO MINTS ATTEMPTED, NOT TO BODIES (Langston C-5 (i), r1c). A shed or failing gate writes
   no body (`providers.py:193-194` raises before `record_follow_up`), so a body-keyed checkpoint would never arrive.
   After the first 1,000 mints attempted it asserts bodies > 0 and stops (exit 4) if none, and it prints the body
   size mean, p99 and max BEFORE the rest of the run is committed.
⛔ A DISK FLOOR HELD THROUGHOUT (C-5 (ii)): every 1,000 mints it re-reads free space on `/` and aborts (exit 5),
   recording the abort, when free space is under 10 GiB or under (projected remaining bodies + 10 GiB), whichever is
   larger. Two points are not a rate, so the floor is re-checked, not predicted.
⛔ EVERY BUCKET IS ACCOUNTED FOR. `store._read` yields nothing for a missing file (`store.py:122-126`), so a missing
   bucket would silently shrink the population. The start record lists each bucket's entry count and whether the
   file exists; a missing bucket is refused (exit 3) unless `--allow-missing` names it.

Every record is one JSON line in `--log`: `start`, one `checkpoint` per 1,000 mints, then `end` or `abort`.
--resume skips mints that already have a body in the scratch tree (a restart after a kill re-calls only the rest).
Exit codes: 0 done · 2 refused before any call · 3 a bucket is missing · 4 no body after 1,000 attempts · 5 disk floor.
"""

from __future__ import annotations

import argparse
import json
import math
import os
import shutil
import sys
from datetime import datetime, timedelta, timezone

PRODUCTION_ROOT = "/var/lib/token-watch"
CHECKPOINT = 1000
FLOOR_BYTES = 10 * 2**30
UTC = timezone.utc


def _refuse_production() -> str:
    """Return the scratch root, or exit 2. Runs BEFORE config is imported, so nothing can have written yet."""
    root = os.environ.get("TOKEN_WATCH_ROOT")
    if not root:
        print("REFUSED: TOKEN_WATCH_ROOT is unset, which means the production store", file=sys.stderr)
        sys.exit(2)
    if os.path.realpath(root) == os.path.realpath(PRODUCTION_ROOT):
        print("REFUSED: TOKEN_WATCH_ROOT is the production store %s" % PRODUCTION_ROOT, file=sys.stderr)
        sys.exit(2)
    if not os.path.isdir(os.path.join(root, "due")):
        print("REFUSED: %s has no due/ — not a scratch copy of the store" % root, file=sys.stderr)
        sys.exit(2)
    return root


def _hours(first: str, last: str) -> list[datetime]:
    a = datetime.strptime(first, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    b = datetime.strptime(last, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    if b < a:
        raise SystemExit("--last is before --first")
    out = []
    while a <= b:
        out.append(a)
        a += timedelta(hours=1)
    return out


class BodyTail:
    """Reads the scratch tree's follow-up provenance files incrementally (one pass in total, never a re-read)."""

    def __init__(self, folder: str):
        self.folder = folder
        self.offsets: dict[str, int] = {}
        self.sizes: list[int] = []
        self.mints: set[str] = set()

    def poll(self) -> None:
        if not os.path.isdir(self.folder):
            return
        for name in sorted(os.listdir(self.folder)):
            if not name.endswith(".jsonl"):
                continue
            path = os.path.join(self.folder, name)
            with open(path, "r", encoding="utf-8") as fh:
                fh.seek(self.offsets.get(path, 0))
                while True:
                    pos = fh.tell()
                    line = fh.readline()
                    if not line or not line.endswith("\n"):
                        self.offsets[path] = pos   # a half-written last line is read whole on the next poll
                        break
                    rec = json.loads(line)
                    self.sizes.append(int(rec["bytes"]))
                    self.mints.add(rec["mint"])


def _stats(sizes: list[int]) -> dict:
    if not sizes:
        return {"n": 0}
    s = sorted(sizes)
    return {"n": len(s), "mean": round(sum(s) / len(s), 1), "p99": s[min(len(s) - 1, math.ceil(0.99 * len(s)) - 1)],
            "max": s[-1], "total": sum(s)}


def main(argv=None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--first", required=True)
    ap.add_argument("--last", required=True)
    ap.add_argument("--log", required=True)
    ap.add_argument("--resume", action="store_true")
    ap.add_argument("--allow-missing", action="append", default=[], help="a bucket hour (YYYY-MM-DDTHH) known absent")
    a = ap.parse_args(argv)

    root = _refuse_production()
    sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
    import budget                                    # noqa: E402  (after the production refusal, on purpose)
    import providers                                 # noqa: E402
    import provenance                                # noqa: E402
    from store import due_now, due_path, save_state  # noqa: E402

    def log(rec: dict) -> None:
        rec["at"] = datetime.now(UTC).isoformat()
        with open(a.log, "a", encoding="utf-8") as fh:
            fh.write(json.dumps(rec, sort_keys=True) + "\n")
        print(json.dumps(rec, sort_keys=True), flush=True)

    hours = _hours(a.first, a.last)
    buckets, mints, seen = [], [], set()
    for h in hours:
        path = due_path(h)
        exists = os.path.exists(path)
        n = 0
        for e in due_now(h):
            n += 1
            m = e.get("mint")
            if m and m not in seen:
                seen.add(m)
                mints.append(m)
        buckets.append({"hour": h.strftime("%Y-%m-%dT%H"), "exists": exists, "entries": n})
    missing = [b["hour"] for b in buckets if not b["exists"] and b["hour"] not in a.allow_missing]
    if missing:
        log({"kind": "abort", "reason": "bucket missing", "missing": missing})
        return 3

    tail = BodyTail(provenance.FOLLOW_UP_DIR)
    tail.poll()
    base = len(tail.sizes)    # bodies already in the scratch tree; every count below is THIS run's only, so a copied
                              # or resumed body can never satisfy the bodies > 0 refuse condition
    todo = [m for m in mints if not (a.resume and m in tail.mints)]
    now = datetime.now(UTC)
    save_state(budget.STATE, budget._blank(budget._month_key(now)))   # the fresh ledger (C-5)
    log({"kind": "start", "root": root, "buckets": buckets, "entries": sum(b["entries"] for b in buckets),
         "distinct_mints": len(mints), "already_captured": len(mints) - len(todo), "to_call": len(todo),
         "ledger": "fresh %s" % budget._month_key(now), "allowed_follow_up": budget.allowed("follow_up")})

    attempted = shed = errors = 0
    error_types: dict[str, int] = {}
    for m in todo:
        try:
            providers.token_state(m)
        except providers.Shed:
            shed += 1
        except Exception as exc:                     # noqa: BLE001 — recorded by type, never swallowed silently
            errors += 1
            k = type(exc).__name__ + (":%s" % exc.code if hasattr(exc, "code") else "")
            error_types[k] = error_types.get(k, 0) + 1
        attempted += 1
        if attempted % CHECKPOINT == 0 or attempted == len(todo):
            tail.poll()
            st = _stats(tail.sizes[base:])
            free = shutil.disk_usage("/").free
            remaining = len(todo) - attempted
            per_mint = (st.get("total", 0) / attempted) if attempted else 0
            projected = int(per_mint * remaining)
            floor = max(FLOOR_BYTES, projected + FLOOR_BYTES)
            rec = {"kind": "checkpoint", "attempted": attempted, "bodies": st["n"], "shed": shed, "errors": errors,
                   "error_types": error_types, "body_bytes": st, "free_bytes": free,
                   "projected_remaining_bytes": projected, "floor_bytes": floor}
            log(rec)
            if attempted == CHECKPOINT and st["n"] == 0:
                log({"kind": "abort", "reason": "no body after %d mints attempted" % CHECKPOINT})
                return 4
            if free < floor:
                log({"kind": "abort", "reason": "disk floor", "free_bytes": free, "floor_bytes": floor})
                return 5
    tail.poll()
    log({"kind": "end", "attempted": attempted, "bodies_this_run": len(tail.sizes) - base,
         "distinct_mints_with_body": len(tail.mints & set(mints)), "of_distinct_mints": len(mints),
         "shed": shed, "errors": errors, "error_types": error_types, "body_bytes": _stats(tail.sizes[base:])})
    return 0


if __name__ == "__main__":
    sys.exit(main())
