"""
token-watch — THE PUBLISHED SUMMARY. The only thing the tracking page reads.

★ KYLE'S REASON FOR THE PAGE, and the audit missed it: *a collector with no
  visible surface is unfalsifiable for 90 days.* Something has to be checkable
  next week rather than at the end.

⛔⛔ THE ISOLATION IS PRESERVED BY THE SHAPE, NOT BY A PERMISSION. The trading
   app runs as `deploy` and CANNOT read `/var/lib/token-watch` — that is
   deliberate and it is verified in both directions. So the page does not read
   the study's data. THE STUDY PUBLISHES ONE DERIVED FILE and the app reads
   that. Nothing in the app can reach the census, the raw stores, or the
   secret; loosening the store's permissions would have traded the isolation
   for a display.
   ★ It also avoids the second listener that `PART G` correctly refuses: a pull
     endpoint on the study side would be a NEW public surface. A file is not.

⛔⛔ THE TRAP THIS FILE EXISTS TO AVOID, and it would have made the page
   CONFIDENTLY WRONG:

   Only FOLLOWED tokens are ever re-checked. The census records every launch
   (~20,700/day) but the case-control design follows only trait carriers plus a
   ~3% random control. A token that is never checked can never be tombstoned.

   ⇒ counting "no tombstone" as "alive" over the WHOLE census would report
     ~97% of all launches still alive at 90 days, when the published rate is
     that roughly two thirds die on day one. The number would be enormous,
     stable, and completely meaningless.

   ⇒ SO THE SURVIVAL FIGURES ARE COMPUTED OVER THE FOLLOWED POPULATION ONLY,
     and the file states that denominator in its own payload rather than
     leaving the page to remember it. The census total is reported separately
     and labelled as what it is: every launch seen, not every launch tracked.

⚠️ AND "ALIVE" HERE MEANS *NOT OBSERVED DEAD*. A followed token whose
   checkpoint was shed, or whose death evidence was ambiguous, stays in this
   count. That is not a bug — `classify_death` refuses to guess on purpose —
   but it means this is an upper bound on survival, and the payload says so.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from config import BIRTHS_DIR, DISPLAY_AGES, GRID, GRID_LABELS, ROOT
from store import load_state, save_state, tombstone_path

UTC = timezone.utc
LOG = logging.getLogger("token-watch.summary")

# World-readable, so the trading app can read THIS and nothing else.
PUBLIC_DIR = f"{ROOT}/public"
SUMMARY_PATH = f"{PUBLIC_DIR}/summary.json"

STATE = "summary"
OLDEST_N = 100

# Age labels mapped to their offsets, so a death can be attributed to the day
# its token was born even on the older records that predate `created_at`.
_OFFSET = dict(zip(GRID_LABELS, GRID))


def _now() -> datetime:
    return datetime.now(UTC)


def _day(iso: str) -> str | None:
    return iso[:10] if iso and len(iso) >= 10 else None


def _read_new(path: str, offset: int):
    """Complete lines from `offset`. Torn-tail-safe, truncation-detecting.

    The same cursor idiom as `liveness` and the spend journal: a final line
    with no newline is a row still being written, so it is not consumed.
    """
    if not os.path.exists(path):
        return [], offset
    size = os.path.getsize(path)
    if size < offset:
        LOG.error("summary: %s shrank (%d -> %d) — cursor restarted", path, offset, size)
        offset = 0
    if size == offset:
        return [], offset
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        raw = fh.read()
    if not raw:
        return [], offset
    if not raw.endswith("\n"):
        cut = raw.rfind("\n")
        if cut < 0:
            return [], offset
        raw = raw[: cut + 1]
    rows = []
    for line in raw.splitlines():
        if not line.strip():
            continue
        try:
            rows.append(json.loads(line))
        except ValueError:
            continue
    return rows, offset + len(raw.encode("utf-8"))


def _birth_files() -> list:
    if not os.path.isdir(BIRTHS_DIR):
        return []
    return sorted(f for f in os.listdir(BIRTHS_DIR) if f.endswith(".jsonl"))


def _fold(st: dict, now: datetime) -> dict:
    """Advance the incremental counters over any new births and deaths.

    ⛔ INCREMENTAL BY NECESSITY, not by preference. Births are never deleted
       (they are in the tiering job's protected set), so at 90 days the census
       is ~1.86M rows and several hundred megabytes. Re-reading that hourly on
       the box that runs live trading is exactly the cost the co-tenancy clause
       exists to prevent. A byte cursor makes each pass O(new rows).
    """
    born = st.setdefault("born_by_day", {})
    followed = st.setdefault("followed_by_day", {})
    d_age = st.setdefault("deaths_by_age", {})
    d_class = st.setdefault("deaths_by_class", {})
    d_birth = st.setdefault("deaths_by_birth_day", {})
    cursors = st.setdefault("cursors", {})

    for name in _birth_files():
        path = os.path.join(BIRTHS_DIR, name)
        rows, cursors[name] = _read_new(path, cursors.get(name, 0))
        for r in rows:
            day = _day(r.get("created_at")) or _day(r.get("first_seen_at"))
            if not day:
                continue
            born[day] = born.get(day, 0) + 1
            if r.get("followed"):
                followed[day] = followed.get(day, 0) + 1

    tomb = tombstone_path()
    rows, st["tomb_cursor"] = _read_new(tomb, st.get("tomb_cursor", 0))
    for r in rows:
        age = r.get("age_at_death") or "unknown"
        d_age[age] = d_age.get(age, 0) + 1
        cls = r.get("death_class") or "unknown"
        d_class[cls] = d_class.get(cls, 0) + 1
        # Attribute the death to the day its token was BORN. `created_at` rides
        # the record; the fallback subtracts the grid offset from the death
        # time, which is exact up to how late the observation ran.
        day = _day(r.get("created_at"))
        if not day and r.get("died_at") and age in _OFFSET:
            try:
                day = _day((datetime.fromisoformat(r["died_at"]) - _OFFSET[age]).isoformat())
            except (ValueError, TypeError):
                day = None
        if day:
            d_birth[day] = d_birth.get(day, 0) + 1
    return st


def _oldest_survivors(dead: set, limit: int, now: datetime) -> list:
    """The oldest tokens with no tombstone, oldest first.

    ★ CHEAP BECAUSE OF THE FILE LAYOUT, not because of an index: births are one
      file per day, so the oldest live in the earliest file. We walk days from
      the oldest forward and stop as soon as we have enough. In the normal case
      that is one or two files, never the whole census.
    ⚠️ FOLLOWED TOKENS ONLY — an unfollowed token is never checked, so it can
      never be tombstoned, and listing it as a "survivor" would be listing our
      own blind spot as a result.
    """
    out = []
    for name in _birth_files():
        path = os.path.join(BIRTHS_DIR, name)
        try:
            with open(path, encoding="utf-8") as fh:
                rows = [json.loads(l) for l in fh if l.strip()]
        except (OSError, ValueError):
            continue
        rows.sort(key=lambda r: r.get("created_at") or "")
        for r in rows:
            if not r.get("followed") or r.get("mint") in dead:
                continue
            created = r.get("created_at")
            age_days = None
            if created:
                try:
                    age_days = round(
                        (now - datetime.fromisoformat(created)).total_seconds() / 86400.0, 2)
                except (ValueError, TypeError):
                    age_days = None
            out.append({
                "mint": r.get("mint"),
                "created_at": created,
                "age_days": age_days,
                "initial_size": r.get("initial_size"),
                "size_source": r.get("size_source"),
                "venue": r.get("venue"),
                "follow_reason": r.get("follow_reason"),
            })
            if len(out) >= limit:
                return out
    return out


def _publish_dir() -> None:
    """Make exactly one directory reachable by the trading app, and no more.

    ⛔⛔ THIS BELONGS IN CODE, NOT IN A COMMAND SOMEONE RAN ONCE. A permission
       set by hand on the server is invisible to every reader, survives no
       rebuild, and its absence presents as an EMPTY PAGE rather than an error
       — which reads as "the study found nothing", the worst possible failure
       for a page whose whole job is to make the collector falsifiable.

    ★ THE GRANT IS THE MINIMUM THAT WORKS, and the two bits are different:
        ROOT       o+x  — TRAVERSE only. `deploy` can walk THROUGH the store to
                          a path it already knows. It still cannot LIST the
                          store (no o+r), and every data directory inside is
                          0700, so traversal reaches nothing but this file.
        PUBLIC_DIR o+rx — read and list, because that is the published surface.
    ⚠️ The unit sets UMask=0077, so both directories are created 0700 and these
       chmods are what makes the page possible at all. Removing them does not
       break the collector — it silently empties the display.
    """
    os.makedirs(PUBLIC_DIR, exist_ok=True)
    for path, mode in ((ROOT, 0o751), (PUBLIC_DIR, 0o755)):
        try:
            os.chmod(path, mode)
        except OSError as exc:                 # not ours to chmod — say so
            LOG.warning("could not set mode on %s (%s); the page may read as "
                        "empty rather than as broken", path, exc)


def build(now: datetime = None) -> dict:
    """Compute the published summary. Pure read + one atomic write."""
    now = now or _now()
    st = _fold(load_state(STATE, {}), now)

    born = st["born_by_day"]
    followed = st["followed_by_day"]
    d_birth = st["deaths_by_birth_day"]

    launches_total = sum(born.values())
    followed_total = sum(followed.values())
    deaths_total = sum(st["deaths_by_age"].values())

    # ── SURVIVAL, over the FOLLOWED population only (see the header) ─────────
    # A cohort's survivors = followed births that day, minus deaths among them.
    alive_by_age = {}
    for label in DISPLAY_AGES:
        cutoff = now - _OFFSET[label]
        n = 0
        for day, f in followed.items():
            if day <= cutoff.strftime("%Y-%m-%d"):
                n += max(0, f - d_birth.get(day, 0))
        alive_by_age[label] = n

    alive_total = max(0, followed_total - deaths_total)

    # ── WHERE THEY DIED — straight off the record, no derivation ────────────
    died_by_age = {label: st["deaths_by_age"].get(label, 0) for label in GRID_LABELS}

    dead = set()
    tomb = tombstone_path()
    if os.path.exists(tomb):
        try:
            with open(tomb, encoding="utf-8") as fh:
                for line in fh:
                    if line.strip():
                        try:
                            dead.add(json.loads(line)["mint"])
                        except (ValueError, KeyError):
                            continue
        except OSError:
            pass

    payload = {
        "generated_at": now.isoformat(),
        "launches": {
            "total": launches_total,
            "by_day": dict(sorted(born.items())),
            "note": "Every launch the feed reported. This is the census "
                    "denominator, not the tracked population.",
        },
        "tracked": {
            "total": followed_total,
            "share_of_launches": (round(followed_total / launches_total, 4)
                                  if launches_total else None),
            "note": "Trait carriers plus a fixed random control. ONLY these are "
                    "re-checked, so every survival figure below is over this "
                    "population — never over all launches.",
        },
        "alive": {
            "total": alive_total,
            "by_age": alive_by_age,
            "note": "Not observed dead. A tracked token whose checkpoint was "
                    "shed, or whose death evidence was ambiguous, is counted "
                    "here — so this is an UPPER BOUND on survival.",
        },
        "died": {
            "total": deaths_total,
            "by_age_at_death": died_by_age,
            "by_class": dict(sorted(st["deaths_by_class"].items())),
            "note": "Where they died — the checkpoint at which death was "
                    "recorded. 'faded' and 'liquidity_pulled' are recorded "
                    "separately and never collapsed into one column.",
        },
        "oldest_survivors": _oldest_survivors(dead, OLDEST_N, now),
        "display_ages": list(DISPLAY_AGES),
        # ⛔ THE ORDER OF THE CHECKPOINTS, CARRIED EXPLICITLY. The payload is
        #    written with sort_keys=True, so `by_age_at_death` comes back
        #    ALPHABETICALLY — 1h, 24h, 30d, 3d, 6h, 7d, 90d — and a page reading
        #    Object.keys() renders 30 days between 24 hours and 3 days. Caught
        #    on the live page, not in a test: the numbers were right and the
        #    sequence was nonsense, which is the same shape as #934 (a correct
        #    value under a heading that misdescribes it).
        "grid_ages": list(GRID_LABELS),
    }

    save_state(STATE, st)
    _publish_dir()
    tmp = SUMMARY_PATH + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(payload, fh, sort_keys=True, indent=1)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, SUMMARY_PATH)          # atomic: a reader never sees a partial file
    os.chmod(SUMMARY_PATH, 0o644)
    return payload


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = build()
    print(json.dumps({k: v for k, v in p.items() if k != "oldest_survivors"},
                     indent=2, sort_keys=True))
