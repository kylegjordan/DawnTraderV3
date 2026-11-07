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

⛔ IT REFUSES THE PRODUCTION STORE. `config.ROOT` comes from `TOKEN_WATCH_ROOT` (`config.py:220`); if it is unset,
   resolves to `/var/lib/token-watch`, lies INSIDE it, or is the same directory reached another way (a bind mount:
   same st_dev and st_ino), the tool exits 2 before any import that could write. A capture into the live store
   would add ~2 GB of bodies to a store already over its warn line (Langston, Step 4 r1: the first version
   compared realpaths only, so a root inside production or a bind mount of it passed).
⛔ THE LEDGER IS A FRESH ONE FOR THE CURRENT MONTH (plan P1 C-5): the scratch `state/budget.json` is replaced with
   `budget._blank(<this month>)` before the first call, so `budget.allowed("follow_up")` is true and the run is not
   shed by a copied ledger. `CREDITS["follow_up"]` is 0, so the run spends no credits either way.
⛔ THE CHECKPOINT IS KEYED TO MINTS ATTEMPTED, NOT TO BODIES (Langston C-5 (i), r1c). A shed or failing gate writes
   no body (the 429 shed at `providers.py:200-201` — the one that fires, since the budget shed at `:195-196` cannot at 0 credits — raises before `record_follow_up`), so a body-keyed checkpoint would never arrive.
   At the first checkpoint it asserts bodies > 0 (exit 4), and prints the body size mean, p99 and max BEFORE the
   rest of the run is committed. ★ AND EVERY LATER INTERVAL TOO (Langston, Step 4 r1, measured): a checkpoint whose
   interval had attempts and added ZERO bodies stops the run (exit 6). The first version tested only the first
   checkpoint, so a stall that began after attempt 1,000 — a sustained 429, the likeliest real mode at 240/min
   against a 300/min host — ran to the end writing nothing and exited 0; and a run of under 1,000 mints (a
   `--resume` tail) was never asserted at all. Checkpoints fall every 1,000 attempts and at the last one.
   A later interval is a stall when it is a full 1,000-attempt interval, or when the rate so far predicts >= 3
   bodies in it (r2/r3: one reliably-404ing mint at the end must not abort a finished capture, and a low rate must
   not disarm a full window); so only a short FINAL tail can be exempt, and it is recorded on `end` as
   `no_body_in_final_interval`.
⛔ A DISK FLOOR HELD THROUGHOUT (C-5 (ii)): every checkpoint re-reads free space on `/` and aborts (exit 5),
   recording the abort, when free space is under (projected remaining bytes + 10 GiB). The projection uses the bytes
   actually WRITTEN to disk (the envelope and JSON-escaped body, ~1.1x `bytes` and ~287 B for a 41 B no-pairs body),
   not the record's `bytes` field. At the LAST checkpoint nothing remains to write, so a low reading there is
   recorded on the `end` record as `free_below_floor_at_end`, not as an abort: a finished capture never reads like a
   truncated one. Two points are not a rate, so the floor is re-checked, not predicted.
⛔ EVERY BUCKET IS ACCOUNTED FOR. `store._read` yields nothing for a missing file (`store.py:122-126`), so a missing
   bucket would silently shrink the population. The start record lists each bucket's entry count and whether the
   file exists; a missing OR EMPTY bucket is refused (exit 3) unless `--allow-missing` names it.

Every record is one JSON line in `--log`: `start`, one `checkpoint` per 1,000 mints, then `end` or `abort`.
--resume skips mints that already have a body in the scratch tree (a restart after a kill re-calls only the rest).
Exit codes: 0 done · 2 refused before any call · 3 a bucket missing or empty · 4 no body at the first checkpoint
· 5 disk floor · 6 a later interval added no body (a stall).
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
    real, prod = os.path.realpath(root), os.path.realpath(PRODUCTION_ROOT)
    try:
        inside = real == prod or os.path.commonpath([real, prod]) == prod
    except ValueError:                           # different drives (Windows tests): cannot be inside
        inside = False
    same = False
    try:
        a, b = os.stat(real), os.stat(prod)
        same = (a.st_dev, a.st_ino) == (b.st_dev, b.st_ino)
    except OSError:
        pass                                     # production absent (a test box): the path checks still apply
    if inside or same:
        print("REFUSED: TOKEN_WATCH_ROOT %s is the production store %s, inside it, or the same directory by another "
              "path" % (root, PRODUCTION_ROOT), file=sys.stderr)
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


def _disk_bytes(folder: str) -> int:
    if not os.path.isdir(folder):
        return 0
    return sum(os.path.getsize(os.path.join(folder, n)) for n in os.listdir(folder) if n.endswith(".jsonl"))


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
    empty = [b["hour"] for b in buckets if b["exists"] and b["entries"] == 0 and b["hour"] not in a.allow_missing]
    if missing or empty:
        log({"kind": "abort", "reason": "bucket missing or empty", "missing": missing, "empty": empty})
        return 3

    tail = BodyTail(provenance.FOLLOW_UP_DIR)
    tail.poll()
    base = len(tail.sizes)    # bodies already in the scratch tree; every count below is THIS run's only, so a copied
                              # or resumed body can never satisfy the bodies > 0 refuse condition
    disk_base = _disk_bytes(provenance.FOLLOW_UP_DIR)
    todo = [m for m in mints if not (a.resume and m in tail.mints)]
    now = datetime.now(UTC)
    save_state(budget.STATE, budget._blank(budget._month_key(now)))   # the fresh ledger (C-5)
    log({"kind": "start", "root": root, "buckets": buckets, "entries": sum(b["entries"] for b in buckets),
         "distinct_mints": len(mints), "already_captured": len(mints) - len(todo), "to_call": len(todo),
         "ledger": "fresh %s" % budget._month_key(now), "allowed_follow_up": budget.allowed("follow_up")})

    attempted = shed = errors = 0
    prev_bodies, prev_attempted = 0, 0
    last_free_low = False
    final_zero_tail = 0              # a final interval too short to call a stall (see below), recorded on `end`
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
            written = _disk_bytes(provenance.FOLLOW_UP_DIR) - disk_base     # bytes actually on disk, envelope included
            projected = int(written / attempted * remaining) if attempted else 0
            floor = projected + FLOOR_BYTES
            rec = {"kind": "checkpoint", "attempted": attempted, "bodies": st["n"], "shed": shed, "errors": errors,
                   "error_types": error_types, "body_bytes": st, "written_bytes_on_disk": written,
                   "free_bytes": free, "projected_remaining_bytes": projected, "floor_bytes": floor}
            log(rec)
            interval_attempts, interval_bodies = attempted - prev_attempted, st["n"] - prev_bodies
            if interval_attempts and not interval_bodies:
                first = prev_attempted == 0
                # ⛔ A ZERO OVER TOO FEW ATTEMPTS IS NOT A STALL (Langston, Step 4 r2, modelled): a final interval of
                #    one mint that 404s reliably (`providers.py:198-202` re-raises non-429 errors) would abort a
                #    finished capture and never write the `end` record that carries P1's deliverable. A later
                #    interval aborts when it is a FULL interval (r3: a low rate must not disarm a full window — 2 bodies
                #    then 1,000 dead calls is a stall) or when the rate so far predicts >= 3 bodies; otherwise, at the last
                #    checkpoint, the short zero tail is recorded on `end`. The first checkpoint is unchanged: a whole
                #    run with no body still exits 4.
                expected = (prev_bodies / prev_attempted * interval_attempts) if prev_attempted else None
                if first or interval_attempts >= CHECKPOINT or expected >= 3:
                    log({"kind": "abort", "reason": "%s: %d mints attempted, 0 bodies%s" % (
                        "no body at the first checkpoint" if first else "a later interval added no body (stall)",
                        interval_attempts, "" if first else " (%.1f expected at the rate so far)" % expected),
                        "attempted": attempted})
                    return 4 if first else 6
                if not remaining:
                    final_zero_tail = interval_attempts
            prev_bodies, prev_attempted = st["n"], attempted
            if remaining and free < floor:
                log({"kind": "abort", "reason": "disk floor", "free_bytes": free, "floor_bytes": floor})
                return 5
            last_free_low = (not remaining) and free < floor
    tail.poll()
    log({"kind": "end", "attempted": attempted, "bodies_this_run": len(tail.sizes) - base,
         "free_below_floor_at_end": last_free_low, "no_body_in_final_interval": final_zero_tail,
         "distinct_mints_with_body": len(tail.mints & set(mints)), "of_distinct_mints": len(mints),
         "shed": shed, "errors": errors, "error_types": error_types, "body_bytes": _stats(tail.sizes[base:])})
    return 0


if __name__ == "__main__":
    sys.exit(main())
