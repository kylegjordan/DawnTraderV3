"""THE OBSERVATION FOLD — what the follow-up has actually looked at (B-TOKEN-WATCH-FOLLOWUP-MEMORY P7, OBJ-5).

The summary's survival and death figures are derived from births and tombstones alone. A death is
recorded only when the follow-up LOOKS, so a follow-up that stopped looking (it was OOM-killed from
2026-09-27 and wrote nothing after 09-30) leaves every figure reading as "nobody died" -- the page
said so for seven weeks. This fold reads the observation stream itself so the summary can say, per
checkpoint, whether anyone was looking.

⛔ STREAMED, FROM A BYTE CURSOR PER DAY FILE (design D3). An observation day file runs to ~390 MB;
   the summary unit is capped (P3), so a whole-remainder read is not an option. Rows are parsed one
   at a time; only counters are kept.
⛔ EVERY SHAPE IS COUNTED, NONE IS DROPPED (Langston C-3). `observed: true` covers its checkpoint;
   `shed`, `error`, `abandoned` and `scheduled_in_the_past` are non-observations on the record; a row
   matching none of them is `unknown_shape` -- counted, so a new writer cannot vanish into a default.
⛔ THE BIRTH DAY IS EXACT WHERE THE ROW CARRIES IT (Langston C-1): `created_at` (stamped by the
   follow-up since P7), else `due_at - grid` (exact: `scheduled_in_the_past` rows carry it), else
   `observed_at - grid` -- APPROXIMATE by the observation's lateness, and every historical row is
   this case. The split is counted and published, never hidden.
★ OBSERVATION FILES ARE NEVER TIERED (`tier.NEVER_TOUCH`), so a rebuild from byte 0 is exact. A file
  that SHRANK is not appended-to history any more; the fold then discards its observation state and
  rebuilds rather than double-counting or silently skipping.
"""
from __future__ import annotations

import json
import logging
import os
import re
import subprocess
from datetime import datetime, timedelta, timezone

from config import GRID, GRID_LABELS, OBSERVATIONS_DIR
from store import lock_beat

UTC = timezone.utc
LOG = logging.getLogger("token-watch.obs_fold")
OFFSET = dict(zip(GRID_LABELS, GRID))
OBS_FOLD_VERSION = 2
SHAPES = ("covered", "shed", "error", "abandoned", "scheduled_in_the_past", "unknown_shape")
HOURLY_KEEP = timedelta(days=7)        # trailing hourly counts, per label (D2 reads them)


def _obs_files() -> list:
    if not os.path.isdir(OBSERVATIONS_DIR):
        return []
    return sorted(f for f in os.listdir(OBSERVATIONS_DIR) if f.endswith(".jsonl"))


def shape_of(r: dict) -> str:
    if r.get("observed") is True:
        return "covered"
    if "shed" in r:
        return "shed"
    reason = r.get("reason")
    if reason in ("error", "abandoned", "scheduled_in_the_past"):
        return reason
    return "unknown_shape"


def _parse(iso) -> datetime | None:
    if not isinstance(iso, str):
        return None
    try:
        t = datetime.fromisoformat(iso)
    except ValueError:
        return None
    return t if t.tzinfo else t.replace(tzinfo=UTC)


def birth_of(r: dict, label: str):
    """(birth day 'YYYY-MM-DD', exact) for one observation row, or (None, False)."""
    t = _parse(r.get("created_at"))
    if t is not None:
        return t.astimezone(UTC).strftime("%Y-%m-%d"), True
    off = OFFSET.get(label)
    if off is None:
        return None, False
    t = _parse(r.get("due_at"))
    if t is not None:
        return (t - off).astimezone(UTC).strftime("%Y-%m-%d"), True
    t = _parse(r.get("observed_at"))
    if t is not None:
        return (t - off).astimezone(UTC).strftime("%Y-%m-%d"), False
    return None, False


def iter_complete(path: str, offset: int):
    """Yield (row or None, end_offset) for every COMPLETE line after `offset`.

    None marks a line that is not a JSON object (unparseable, or valid JSON that is not an object);
    blank lines are consumed silently. A final line with no newline is a row still being written and
    is not consumed. One line in memory at a time.
    """
    with open(path, "rb") as fh:
        fh.seek(offset)
        pos = offset
        for raw in fh:
            if not raw.endswith(b"\n"):
                return
            pos += len(raw)
            if not raw.strip():
                continue
            try:
                r = json.loads(raw)
            except ValueError:
                yield None, pos
                continue
            yield (r if isinstance(r, dict) else None), pos


def _empty() -> dict:
    return {"version": OBS_FOLD_VERSION, "cursors": {}, "by_day": {}, "split": {"exact": 0, "approximated": 0},
            "last_observed_at": {}, "observed_through": None, "hourly": {}, "hourly_any": {}, "skipped_lines": 0,
            "rebuilt_at": None}


def _bump(d: dict, *keys) -> None:
    for k in keys[:-1]:
        d = d.setdefault(k, {})
    d[keys[-1]] = d.get(keys[-1], 0) + 1


def fold_observations(st: dict, now: datetime, watch: dict | None = None) -> dict:
    """Advance st['obs'] over every complete observation line not yet folded. Returns st['obs'].

    `watch` (D4): mint -> member dict; each COVERED row of a member updates member['obs'][label] to the newest
    {'at', 'alive'}. Membership is decided by the caller from the births fold, never here -- this pass can only
    ADD observations to members, so a member it never touches stays with no observations by construction.
    """
    o = st.get("obs")
    if not isinstance(o, dict) or o.get("version") != OBS_FOLD_VERSION:
        o = _empty()
        o["rebuilt_at"] = now.isoformat()
    files = _obs_files()
    # A file that shrank is no longer the history we folded: rebuild from byte 0, never double-count.
    for name in files:
        try:
            size = os.path.getsize(os.path.join(OBSERVATIONS_DIR, name))
        except OSError:
            continue
        if size < o["cursors"].get(name, 0):
            LOG.error("observation file %s shrank (%d -> %d): the observation fold is rebuilt from byte 0",
                      name, o["cursors"][name], size)
            o = _empty()
            o["rebuilt_at"] = now.isoformat()
            break
    keep_from = (now - HOURLY_KEEP).strftime("%Y-%m-%dT%H")
    for name in files:
        path = os.path.join(OBSERVATIONS_DIR, name)
        cur = o["cursors"].get(name, 0)
        try:
            for r, end in iter_complete(path, cur):
                lock_beat()
                cur = end
                if r is None:
                    o["skipped_lines"] += 1
                    continue
                label = r.get("age")
                if label not in OFFSET:
                    label = "unknown_label"
                shape = shape_of(r)
                day, exact = birth_of(r, label)
                _bump(o["by_day"], label, day or "unknown_day", shape)
                o["split"]["exact" if exact else "approximated"] += 1
                seen = r.get("observed_at")
                if not isinstance(seen, str):
                    continue
                if o["observed_through"] is None or seen > o["observed_through"]:
                    o["observed_through"] = seen
                t = _parse(seen)
                hour = t.astimezone(UTC).strftime("%Y-%m-%dT%H") if t is not None else None
                # ⛔ JOB LIVENESS COUNTS THE FOLLOW-UP'S OWN ROWS ONLY (Langston D2 CHANGE-3). A
                #    scheduled_in_the_past row is written by the RECEIVER (schedule_grid), so counting it would
                #    have read 2026-08-31T19 -- a follow-up hour that wrote nothing -- as a beating job.
                if hour is not None and hour >= keep_from and shape != "scheduled_in_the_past":
                    o["hourly_any"][hour] = o["hourly_any"].get(hour, 0) + 1
                if shape != "covered":
                    continue
                if seen > o["last_observed_at"].get(label, ""):
                    o["last_observed_at"][label] = seen
                if hour is not None and hour >= keep_from:
                    _bump(o["hourly"], label, hour)
                if watch is not None:
                    m = watch.get(r.get("mint"))
                    if m is not None:
                        prev = m.setdefault("obs", {}).get(label)
                        if prev is None or seen > prev["at"]:
                            m["obs"][label] = {"at": seen, "alive": r.get("alive") is True}
        except OSError as exc:
            LOG.error("observation file %s could not be read (%s); its cursor stays at %d", name, exc, cur)
        o["cursors"][name] = cur
    for hours in list(o["hourly"].values()) + [o["hourly_any"]]:
        for h in [h for h in hours if h < keep_from]:
            del hours[h]
    st["obs"] = o
    return o


def coverage(obs: dict, born_by_day: dict, now: datetime) -> dict:
    """D1 (Langston PROCEED): a birth day with births is UNCOVERED if ANY label already due for its whole
    day has zero covering rows. Returns per-label uncovered days and the overall count; counts, not shares
    (C-4 -- the approximate count can exceed births, so no percentage until the birth is exact)."""
    by_label = {}
    uncovered = set()
    due_n, empty_n = {}, {}            # per day: labels due for the whole day, and how many of them are empty
    for label in GRID_LABELS:
        days = []
        rows = obs["by_day"].get(label, {})
        for day, n in born_by_day.items():
            if not n:
                continue
            try:
                end = datetime.fromisoformat(day).replace(tzinfo=UTC) + timedelta(days=1)
            except ValueError:
                continue
            if end + OFFSET[label] > now:
                continue
            due_n[day] = due_n.get(day, 0) + 1
            if not rows.get(day, {}).get("covered"):
                days.append(day)
                uncovered.add(day)
                empty_n[day] = empty_n.get(day, 0) + 1
        days.sort()
        by_label[label] = {"uncovered_days": len(days), "first": days[0] if days else None,
                           "last": days[-1] if days else None}
    # ⭐ TWO FACTS, NOT ONE (Langston, r2 note): `uncovered_days` counts a day missing ANY due checkpoint, so a
    #    day with 23,341 covering 7d rows counts the same as a day nobody looked at; `blind_days` counts only the
    #    days where EVERY checkpoint due on them is empty. The page leads with the second.
    blind = sorted(d for d, n in due_n.items() if empty_n.get(d, 0) == n)
    return {"uncovered_days": len(uncovered), "blind_days": len(blind),
            "blind_first": blind[0] if blind else None, "blind_last": blind[-1] if blind else None,
            "by_label": by_label, "no_births_days": _gap_days(born_by_day)}


def _gap_days(born_by_day: dict) -> list:
    """Days between the first and last birth day with no births at all -- neither covered nor uncovered."""
    days = sorted(d for d, n in born_by_day.items() if n)
    if not days:
        return []
    try:
        d, last = datetime.fromisoformat(days[0]).date(), datetime.fromisoformat(days[-1]).date()
    except ValueError:
        return []
    have, out = set(days), []
    while d <= last:
        if d.isoformat() not in have:
            out.append(d.isoformat())
        d += timedelta(days=1)
    return out


def shape_totals(obs: dict) -> dict:
    """label -> shape -> rows (C-3, published); per (day, label) stays in the state file."""
    out = {}
    for label, days in obs["by_day"].items():
        t = out.setdefault(label, {})
        for shapes in days.values():
            for shape, n in shapes.items():
                t[shape] = t.get(shape, 0) + n
    return out


def covering_by_day(obs: dict) -> dict:
    """day -> label -> covering rows (C-4: a COUNT beside born_by_day, never a share)."""
    out = {}
    for label, days in obs["by_day"].items():
        for day, shapes in days.items():
            if shapes.get("covered"):
                out.setdefault(day, {})[label] = shapes["covered"]
    return dict(sorted(out.items()))


# ─────────────────────────────────────────────────────────────────────────────
# D2 — IS ANYONE LOOKING, PER CHECKPOINT (Langston r2 ruling + CHANGE-1..3, folds a and b)
# ─────────────────────────────────────────────────────────────────────────────
TIMER_UNIT = "token-watch-followup.timer"
WINDOW_STATE = "obs_window"                 # state/obs_window.json, written by tools/derive_obs_window.py
K_FLOOR = 3
# births per hour are kept long enough to answer "was anything due at the 90d checkpoint in this cycle"
BIRTHS_HOURLY_KEEP = max(GRID) + HOURLY_KEEP


_HOURLY_SPEC = re.compile(r"^(hourly|\*-\*-\* \*:[0-5][0-9]:00( UTC)?)$")
_SPAN_UNITS = {"us": 1e-6, "ms": 1e-3, "s": 1, "sec": 1, "min": 60, "m": 60, "h": 3600, "hr": 3600}


def _timespan_s(v: str) -> int | None:
    """A systemd time span ('5min', '300', '1min 30s', '0') in whole seconds, or None when not understood."""
    v = v.strip()
    if not v:
        return None
    if v.isdigit():
        return int(v)
    total = 0.0
    for num, unit in re.findall(r"(\d+)\s*([a-z]+)", v):
        if unit not in _SPAN_UNITS:
            return None
        total += int(num) * _SPAN_UNITS[unit]
    if not re.fullmatch(r"(\s*\d+\s*[a-z]+)+\s*", v):
        return None
    return int(total)


def parse_cadence(text: str) -> dict | None:
    """The cadence from `systemctl show` output (TimersCalendar / RandomizedDelayUSec / LoadState) or from a unit
    file (OnCalendar / RandomizedDelaySec). None when not understood -- ONE answer for that, everywhere: every
    checkpoint `unknown`, every survivor `unknown`, and the summary unit pages (Langston, P7 part 2, C-A).

    ★ `hourly` and systemd's own normalised form of it (`*-*-* *:MM:00`, what `systemctl show` reports and what
      the sibling summary timer is written as) are the same schedule; the first version understood only the
      word, so a semantically identical edit of the unit turned the instrument off.
    """
    cal, delay, loaded = [], 0, True
    for line in text.splitlines():
        line = line.strip()
        if line.startswith("LoadState="):
            loaded = line.split("=", 1)[1].strip() == "loaded"
        elif line.startswith("TimersCalendar="):
            cal += re.findall(r"OnCalendar=([^;}]+?)\s*;", line)
        elif line.startswith("OnCalendar="):
            cal.append(line.split("=", 1)[1].strip())
        elif line.startswith("RandomizedDelayUSec=") or line.startswith("RandomizedDelaySec="):
            d = _timespan_s(line.split("=", 1)[1])
            if d is None:
                return None
            delay = d
    if not loaded or len(cal) != 1 or not _HOURLY_SPEC.match(cal[0].strip()):
        return None
    return {"on_calendar": cal[0].strip(), "randomized_delay_s": delay, "cycle_s": 3600 + delay}


def read_cadence() -> dict | None:
    """The follow-up timer's cadence as systemd itself reports it, read EVERY build (fold b) -- not a parse of
    the unit file, which would be a second copy of a repo file (Langston, P7 part 2, C-A). None when unreadable."""
    try:
        p = subprocess.run(["systemctl", "show", TIMER_UNIT, "-p", "TimersCalendar", "-p", "RandomizedDelayUSec",
                            "-p", "LoadState"], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return None
    if p.returncode != 0:
        return None
    return parse_cadence(p.stdout or "")


def _hour(t: datetime) -> str:
    return t.astimezone(UTC).strftime("%Y-%m-%dT%H")


def _hours_back(now: datetime, seconds: int) -> list:
    """Hour buckets whose start lies in [now - seconds, now], oldest first."""
    lo = now - timedelta(seconds=seconds)
    h = lo.replace(minute=0, second=0, microsecond=0)
    if h < lo:
        h += timedelta(hours=1)
    out = []
    while h <= now:
        out.append(h)
        h += timedelta(hours=1)
    return out


def _covered_any(obs: dict, hk: str) -> int:
    """Observations of ANY checkpoint that landed in hour `hk` -- the job's liveness: it LOOKED at something."""
    return sum(hours.get(hk, 0) for hours in obs["hourly"].values())


def _due(born_by_hour: dict, h: datetime, label: str) -> int:
    return born_by_hour.get(_hour(h - OFFSET[label]), 0)


def label_states(obs: dict, born_by_hour: dict, births_first_at: str | None, births_through: str | None,
                 window: dict | None, cadence: dict | None, now: datetime) -> dict:
    """Per checkpoint: instrumented | stale | job_not_beating | never_instrumented | not_yet_due | unknown.

    ⛔ THE GRANULARITY IS THE HOUR (Langston nit): a checkpoint is `not_yet_due` until the first launch plus its
       age -- 90d flips at ~2026-11-29T11Z, the first 08-31 launch plus 90 days. D1's coverage uses the
       whole-DAY rule, so the 08-31 cohort counts there only from 2026-11-30T00Z. Two clocks, stated, so the
       gap is not read as a bug.
    ⛔ `unknown`, NEVER `instrumented`, WHEN THE BIRTHS FOLD HAS NOT REACHED A BIRTH HOUR THE TEST NEEDS (fold a):
       "nothing was due" would otherwise be concluded from a directory whose own progress lags.
    ⛔ ONE JOB-LEVEL VERDICT (CHANGE-3), with THREE states, not two: while launches were due, a window with NO
       follow-up row at all is `not_running`; a window with follow-up rows but not one observation of any
       checkpoint is `shedding` (09-27T17 -> 09-30T13: 69 hours of shed-only rows); anything observed is
       `observing`. Each checkpoint a job-level fault silenced says `job_not_running` / `job_shedding`, never N
       separate `stale` faults. ⚠️ A shed row proves the process ran and is NOT evidence that anyone looked --
       counted as liveness it stretched every derived window to ~3 days (K up to 71); see derive_obs_window.
    """
    labels_w = (window or {}).get("labels", {})
    first = _parse(births_first_at)
    through = _parse(births_through)
    hourly_any = obs.get("hourly_any", {})
    out = {"job": None, "labels": {}}
    if cadence is None:
        for L in GRID_LABELS:
            out["labels"][L] = {"state": "unknown", "reason": "the follow-up timer's cadence could not be read"}
        out["job"] = {"state": "unknown", "reason": "cadence unreadable"}
        return out
    windows = {L: int((labels_w.get(L) or {}).get("window_s") or K_FLOOR * cadence["cycle_s"]) for L in GRID_LABELS}
    win_job = max(windows.values())
    job_hours = _hours_back(now, win_job)
    first_h = first.replace(minute=0, second=0, microsecond=0) if first is not None else None
    any_rows = sum(hourly_any.get(_hour(h), 0) for h in job_hours)
    covered_any = sum(_covered_any(obs, _hour(h)) for h in job_hours)
    any_due = sum(_due(born_by_hour, h, L) for h in job_hours for L in GRID_LABELS
                  if first_h is not None and h - OFFSET[L] >= first_h)
    if covered_any > 0 or any_due == 0:
        job_state = "observing"
    else:
        job_state = "shedding" if any_rows > 0 else "not_running"
    out["job"] = {"state": job_state, "window_s": win_job, "follow_up_rows_in_window": any_rows,
                  "observations_in_window": covered_any, "due_in_window": any_due,
                  # Langston condition 1 (P7 design ruling): the bound is stated. A job fault becomes this state
                  # only after a WHOLE window with no observation, and the summary unit then exits
                  # JOB_FAULT_EXIT on its next hourly run, which pages through OnFailure.
                  "pages_after_s": win_job}
    week = _hours_back(now, int(HOURLY_KEEP.total_seconds()))
    for L in GRID_LABELS:
        w = labels_w.get(L) or {}
        k = int(w.get("k_cycles") or K_FLOOR)
        window_s = windows[L]
        rec = {"k_cycles": k, "window_s": window_s, "last_observed_at": obs["last_observed_at"].get(L),
               # Langston condition 2: K's basis travels WITH K, where the page reads it. A floor-bound K is the
               # 3-cycle minimum, not a calibrated value, and must never be cited as one.
               "k_basis": {"derived": bool(w), "floor_bound": w.get("floor_bound", True),
                           "observed_longest_run": w.get("observed_longest_run"),
                           "cycles_counted": w.get("beating_due_cycles"),
                           "counted": "cycles in which the job observed something and this checkpoint was due"}}
        if first is None or first + OFFSET[L] > now:
            rec["state"] = "not_yet_due"
            rec["first_due_at"] = (first + OFFSET[L]).isoformat() if first is not None else None
            out["labels"][L] = rec
            continue
        if not obs["last_observed_at"].get(L):
            rec["state"] = "never_instrumented"
            out["labels"][L] = rec
            continue
        hours = _hours_back(now, window_s)
        if through is None or _hour(hours[-1] - OFFSET[L]) > _hour(through):
            rec["state"] = "unknown"
            rec["reason"] = "the births fold has not reached the birth hours this window needs"
            out["labels"][L] = rec
            continue
        covered = sum(obs["hourly"].get(L, {}).get(_hour(h), 0) for h in hours)
        due = sum(_due(born_by_hour, h, L) for h in hours)
        rec.update(covered_in_window=covered, due_in_window=due)
        if covered > 0 or due == 0:
            rec["state"] = "instrumented"
        else:
            rec["state"] = "stale" if job_state == "observing" else "job_" + job_state
        # CHANGE-1: the trigger is anchored on the derivation's own input -- a due-but-empty RUN of cycles in
        # which the job DID beat (a job miss is CHANGE-3's verdict, not a label fault)
        run = cur = 0
        for h in week:
            hk = _hour(h)
            if _due(born_by_hour, h, L) > 0 and not obs["hourly"].get(L, {}).get(hk) and _covered_any(obs, hk):
                cur += 1
                run = max(run, cur)
            else:
                cur = 0
        rec["longest_recent_due_but_empty_run"] = run
        rec["rederive_due"] = run >= k - 1
        # a SECOND signal, never the trigger: realised median covered rows per due, beating cycle vs the derived
        derived = (w.get("rate_per_cycle") or {}).get("median")
        xs = sorted(obs["hourly"].get(L, {}).get(_hour(h), 0) for h in week
                    if _due(born_by_hour, h, L) > 0 and _covered_any(obs, _hour(h)))
        if derived and xs:
            med = xs[len(xs) // 2]
            rec["rate_drift_secondary"] = bool(med > 2 * derived or med < derived / 2)
        out["labels"][L] = rec
    return out


JOB_FAULT_EXIT = 4
CADENCE_UNKNOWN_EXIT = 5


def timer_switch() -> str:
    """'enabled' | 'disabled' | 'unknown' -- the follow-up timer's systemd switch, the ONE authoritative record of
    whether the job is meant to run. Unknown is treated as on (a fault pages), never as off."""
    try:
        p = subprocess.run(["systemctl", "is-enabled", TIMER_UNIT], capture_output=True, text=True, timeout=10)
    except (OSError, subprocess.SubprocessError):
        return "unknown"
    out = (p.stdout or "").strip()
    return out if out in ("enabled", "disabled") else "unknown"


def job_fault_exit_code(job: dict | None, switch: str) -> int:
    """JOB_FAULT_EXIT when the follow-up is meant to run (switch not 'disabled') and has gone a whole window
    without observing anything -- `not_running` or `shedding` (Langston condition 1: a visible state WITH a bound,
    on its own carrier, never a quiet reason). A switched-off job is a decision, not a fault: it is published
    as such and does not page."""
    if job and job.get("state") == "unknown":
        # ⛔ AN INSTRUMENT THAT CANNOT READ ITS OWN CLOCK PAGES (Langston, P7 part 2, C-A): the first version
        #    returned 0 here, so one unreadable cadence silently disarmed the only thing that pages when the
        #    follow-up has stopped -- the opposite of timer_switch's "unknown is treated as on". Its own code,
        #    so the page says which fault it is.
        LOG.error("the follow-up's cadence could not be read: no checkpoint can be judged (%s)", job.get("reason"))
        return CADENCE_UNKNOWN_EXIT
    if not job or job.get("state") not in ("not_running", "shedding"):
        return 0
    if switch == "disabled":
        LOG.warning("the follow-up timer is switched off: job state %s is published, not paged", job["state"])
        return 0
    LOG.error("the follow-up has observed nothing for a whole window (%s s): job %s, timer %s", job.get("window_s"),
              job["state"], switch)
    return JOB_FAULT_EXIT


# ─────────────────────────────────────────────────────────────────────────────
# D4 — THE OLDEST SURVIVORS, EACH WITH WHAT WE ACTUALLY KNOW (Langston r2: PROCEED, two conditions)
# ─────────────────────────────────────────────────────────────────────────────
WATCH_N = 5000
WATCH_VERSION = 1


def watch_usable(watch) -> bool:
    return isinstance(watch, dict) and watch.get("version") == WATCH_VERSION and isinstance(watch.get("members"), dict)


def watch_needs_seed(watch: dict | None, dead, oldest_n: int, births_folded: int = 0) -> str | None:
    """'seeded' (no usable watch set), 'rebuilt' (fewer than 2 x oldest_n not-dead members left AND a re-seed can
    change the membership), or None.

    ⛔ A RE-SEED THAT CANNOT ADD ANYONE IS NOT DONE. If the seed took every not-dead launch there was (`capped`
       false) and no launch has been folded since (`births_folded_at_seed`, a COUNT -- Langston: a max created_at
       misses a late-discovered launch older than the max), re-seeding returns the same set --
       and every re-seed discards the observation fold, so on a small population the old test re-read every
       observation file on every build.

    ★ THE INVARIANT THAT MAKES THE SET SUFFICIENT (Langston): it is seeded with the OLDEST WATCH_N not-dead
      mints, so every mint outside it is younger than every member; while at least oldest_n members survive,
      the true oldest oldest_n are necessarily inside. The 2 x oldest_n floor keeps that true. Do not seed it
      any other way.
    """
    if not watch_usable(watch):
        return "seeded"
    alive = sum(1 for m in watch["members"] if m not in dead)
    if alive >= 2 * oldest_n:
        return None
    grown = births_folded > int(watch.get("births_folded_at_seed") or 0)
    return "rebuilt" if (watch.get("capped") or grown) else None


def prune_dead(watch: dict, dead) -> int:
    gone = [m for m in watch["members"] if m in dead]
    for m in gone:
        del watch["members"][m]
    return len(gone)


def survivor_status(created_at: str | None, member: dict | None, settle_s: dict | None, now: datetime) -> dict:
    """verified_alive | unverified | never_observed | not_yet_due | unknown, for one listed survivor.

    ⛔ THE CLOCK IS THE BIRTH ROW'S created_at, EXACT (Langston condition 2) -- never observed_at minus the
       grid, which would flip a mint near a boundary on observation lateness alone. A checkpoint counts as DUE
       once its time plus that checkpoint's window (`settle_s[label]`) has passed: inside the window the job
       may simply not have read it yet.
    ⛔ `never_observed` IS AN ABSENCE AND IS ONLY CLAIMED FOR A WATCH-SET MEMBER (condition 1): membership comes
       from the births fold, observations are joined on, so a member with no join is never-observed by
       construction. A listed mint OUTSIDE the set is `unknown`, never `never_observed`.
    """
    if settle_s is None:
        # one answer for an unreadable cadence (C-A): the checkpoint table says `unknown`, so does every row
        return {"status": "unknown", "reason": "the follow-up's cadence could not be read"}
    t = _parse(created_at)
    if t is None:
        return {"status": "unknown", "reason": "the birth row has no created_at"}
    if member is None:
        return {"status": "unknown", "reason": "not in the watch set"}
    seen = member.get("obs") or {}
    if not seen:
        return {"status": "never_observed"}
    order = [L for L in GRID_LABELS if L in seen]
    last = order[-1]
    rec = {"last_verified_age": last, "last_verified_at": seen[last]["at"]}
    due = [L for L in GRID_LABELS if t + OFFSET[L] + timedelta(seconds=settle_s.get(L, 0)) <= now]
    if not due:
        rec["status"] = "not_yet_due"
        return rec
    o = seen.get(due[-1])
    rec["latest_due_age"] = due[-1]
    rec["status"] = "verified_alive" if (o is not None and o.get("alive")) else "unverified"
    return rec
