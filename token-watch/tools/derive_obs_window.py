"""
token-watch — derive each checkpoint's "is anyone looking" window, ONCE, from the observation history.
(B-TOKEN-WATCH-FOLLOWUP-MEMORY P7 D2, Langston r2 ruling with CHANGE-1..3.)

Writes state/obs_window.json, which summary.build reads every hour (obs_fold.label_states):

  window_L = K_L job cycles, K_L = max(3, observed_longest_run_L + 2)

where a cycle is the follow-up timer's period (read from the unit: OnCalendar=hourly + RandomizedDelaySec) and
observed_longest_run_L is the longest run of consecutive hours in which launches were due at checkpoint L, the
follow-up OBSERVED something (at least one `observed: true` row, any checkpoint), and none of it was L. An hour in
which it observed nothing is a JOB fault, not a checkpoint fault, and is not counted here (CHANGE-3) -- split in
the output into `job_miss_hours` (no follow-up row at all) and `job_shed_only_hours` (rows, every one a shed or an
error).
⚠️ MEASURED 2026-11-15: counting ANY follow-up row as liveness (CHANGE-3 as first worded) made the 69 shed-only
   hours of 09-27T17 -> 09-30T13 into 69-hour due-but-empty runs for every checkpoint -> K = 51..71, windows of
   ~2.3-3.2 days. A shed row proves the process ran; it is not evidence that anyone looked.

⛔ K = 3 IS A FLOOR, AND THE FILE SAYS SO (CHANGE-2): per checkpoint it records the observed run AND whether the
   floor bound. On the 2026-11-15 corpus every checkpoint is floor-bound: the census moved nothing, and nobody
   should later cite "K = 3" as measured.
⛔ WRITTEN ONCE. Re-derivation is a human act with a recorded reason (--replace "<why>"): the hourly build only
   ever FLAGS that one is due (`rederive_due`, when a recent due-but-empty run reaches K - 1).

Run as tokenwatch:  python3 tools/derive_obs_window.py [--apply [--replace "<why>"]] [--timer PATH]
Exit: 0 written (or dry run) · 2 refused.
"""

from __future__ import annotations

import argparse
import json
import os
import sys
from datetime import datetime, timedelta, timezone

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

from config import BIRTHS_DIR, GRID, GRID_LABELS, OBSERVATIONS_DIR  # noqa: E402
from store import load_state, lock_beat, periodic_lock, save_state  # noqa: E402
import obs_fold  # noqa: E402

UTC = timezone.utc
OFFSET = dict(zip(GRID_LABELS, GRID))


def _hour_of(iso) -> str | None:
    t = obs_fold._parse(iso)
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H") if t is not None else None


def scan():
    """(births per hour, follow-up rows per hour, covered rows per (label, hour), rows read)."""
    births, any_rows, covered, rows = {}, {}, {}, 0
    for name in sorted(os.listdir(BIRTHS_DIR)) if os.path.isdir(BIRTHS_DIR) else []:
        if not name.endswith(".jsonl"):
            continue
        for r, _end in obs_fold.iter_complete(os.path.join(BIRTHS_DIR, name), 0):
            lock_beat()
            if r is None:
                continue
            h = _hour_of(r.get("created_at") or r.get("first_seen_at"))
            if h:
                births[h] = births.get(h, 0) + 1
    for name in obs_fold._obs_files():
        for r, _end in obs_fold.iter_complete(os.path.join(OBSERVATIONS_DIR, name), 0):
            lock_beat()
            if r is None:
                continue
            rows += 1
            shape = obs_fold.shape_of(r)
            h = _hour_of(r.get("observed_at"))
            if h is None or shape == "scheduled_in_the_past":
                continue
            any_rows[h] = any_rows.get(h, 0) + 1
            if shape == "covered" and r.get("age") in OFFSET:
                d = covered.setdefault(r["age"], {})
                d[h] = d.get(h, 0) + 1
    return births, any_rows, covered, rows


def derive(births: dict, any_rows: dict, covered: dict, cadence: dict, now: datetime) -> dict:
    looked = {}
    for hs in covered.values():
        for hk, n in hs.items():
            looked[hk] = looked.get(hk, 0) + n
    span = sorted(set(looked) | set(any_rows))
    out = {"derived_at": now.isoformat(), "cadence": cadence, "labels": {},
           "derived_from": {"first_follow_up_hour": span[0] if span else None,
                            "last_follow_up_hour": span[-1] if span else None,
                            "last_observing_hour": max(looked) if looked else None}}
    if not span:
        hours = []
    else:
        h = datetime.strptime(span[0], "%Y-%m-%dT%H").replace(tzinfo=UTC)
        end = datetime.strptime(span[-1], "%Y-%m-%dT%H").replace(tzinfo=UTC)
        hours = []
        while h <= end:
            hours.append(h)
            h += timedelta(hours=1)
    faults = [h.strftime("%Y-%m-%dT%H") for h in hours if not looked.get(h.strftime("%Y-%m-%dT%H"))
              and any(births.get((h - OFFSET[L]).strftime("%Y-%m-%dT%H")) for L in GRID_LABELS)]
    out["derived_from"]["job_miss_hours"] = [h for h in faults if not any_rows.get(h)]
    out["derived_from"]["job_shed_only_hours"] = len([h for h in faults if any_rows.get(h)])
    for L in GRID_LABELS:
        run = cur = 0
        xs = []
        for h in hours:
            hk = h.strftime("%Y-%m-%dT%H")
            due = births.get((h - OFFSET[L]).strftime("%Y-%m-%dT%H"), 0)
            if not due or not looked.get(hk):
                cur = 0
                continue
            c = covered.get(L, {}).get(hk, 0)
            xs.append(c)
            if c == 0:
                cur += 1
                run = max(run, cur)
            else:
                cur = 0
        observed = bool(covered.get(L))
        k = max(obs_fold.K_FLOOR, run + 2) if observed else obs_fold.K_FLOOR
        xs.sort()
        out["labels"][L] = {
            "observed_longest_run": run if observed else None,
            "beating_due_cycles": len(xs),
            "k_cycles": k,
            "floor_bound": (not observed) or run + 2 <= obs_fold.K_FLOOR,
            "window_s": k * cadence["cycle_s"],
            "rate_per_cycle": ({"median": xs[len(xs) // 2], "p01": xs[len(xs) // 100]} if observed and xs else None),
            "note": None if observed else "never observed in the corpus: the floor applies and the window is unmeasured",
        }
    return out


def main(argv=None, now: datetime | None = None) -> int:
    ap = argparse.ArgumentParser()
    ap.add_argument("--apply", action="store_true")
    ap.add_argument("--replace", default=None, help="the reason, recorded in the file, for replacing an existing one")
    ap.add_argument("--timer", default=None)
    a = ap.parse_args(argv)
    now = now or datetime.now(UTC)
    cadence = obs_fold.read_cadence(a.timer)
    if cadence is None:
        print("REFUSED: the follow-up timer's cadence could not be read", file=sys.stderr)
        return 2
    with periodic_lock("derive_obs_window") as held:
        if not held:
            print("REFUSED: another periodic job holds the lock", file=sys.stderr)
            return 2
        existing = load_state(obs_fold.WINDOW_STATE, {})
        if a.apply and existing and not a.replace:
            print("REFUSED: state/%s.json exists (derived %s); re-derivation needs --replace \"<why>\""
                  % (obs_fold.WINDOW_STATE, existing.get("derived_at")), file=sys.stderr)
            return 2
        births, any_rows, covered, rows = scan()
        out = derive(births, any_rows, covered, cadence, now)
        out["derived_from"]["observation_rows"] = rows
        if a.replace:
            out["replaces"] = {"derived_at": existing.get("derived_at"), "reason": a.replace}
        print(json.dumps(out, indent=2, sort_keys=True))
        if a.apply:
            save_state(obs_fold.WINDOW_STATE, out)
            print("WRITTEN state/%s.json" % obs_fold.WINDOW_STATE)
    return 0


if __name__ == "__main__":
    sys.exit(main())
