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

import heapq
import json
import sys
import logging
import os
from datetime import datetime, timedelta, timezone

from config import (BIRTHS_DIR, DISPLAY_AGES, GRID, GRID_LABELS,
                    OBSERVATIONS_DIR, ROOT)
from store import (iter_census as store_iter_census, identity_for as _identity_for, last_refusal, load_state,
                   lock_beat, periodic_lock, save_state,
                   tombstone_path, _correction_index, dead_set, dead_set_status,
                   latest_observations_uncorrected)
import obs_fold
import store

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


# lines _read_new skipped this build: unparseable, or valid JSON that is not an object. Reset at the top of build and
# published on the payload (Langston, P2b fold-in 1: a `123` tombstone line used to raise AttributeError in _fold's
# `r.get`, before save_state, so the cursor never advanced and the build failed every hour).
_READ_NEW_SKIPPED = {"lines": 0}


class _read_new:
    """Complete lines from `offset`, STREAMED: iterate for the JSON-object rows; `.end` is the new cursor.

    Torn-tail-safe and truncation-detecting, as before: a final line with no newline is a row still being written
    and is not consumed; a file smaller than the cursor restarts at 0 (logged). Only JSON OBJECTS are rows; anything
    else is skipped and counted (_READ_NEW_SKIPPED).
    ⛔ STREAMED (B-TOKEN-WATCH-FOLLOWUP-MEMORY P7, found measuring Langston's part-1a condition 1): this read the
       whole remainder into one string, then a line list, then a row list. Incremental runs read a few MB, but a
       build from an EMPTY state (a lost or reset state file) read the 258 MB tombstone file whole -- measured on
       staging 2026-11-15: births + tombstone fold from empty = 1,915 MiB peak RSS, against the summary unit's
       planned 384M cap. One line in memory at a time now.
    ★ NOT BYTE-FOR-BYTE THE SAME -- DIFFERENT IN THREE PLACES, EACH A FIX (Langston fuzzed both, P7 part 1a re-roll):
      (1) the old text-mode read translated CRLF, so its cursor undershot one byte per line and the next build
      re-read and DOUBLE-COUNTED the tail; the binary read is exact; (2) the old splitlines() split a raw U+2028 /
      U+0085 inside a row into two unparseable fragments and LOST the row, the new reader parses it; (3) an invalid
      UTF-8 byte made the old fh.read() raise and kill the whole build, the new one counts one skipped line.
      Identical everywhere else (18,150 fuzz cases).
    ★ AND A SECOND FIX: the old whole-remainder read beat the periodic lock zero times across a 258 MB read, so a
      from-empty build could let the lock go stale and be stolen mid-build; this beats per line (time-gated in store).
    """

    def __init__(self, path: str, offset: int):
        self.path = path
        self.end = offset

    def __iter__(self):
        if not os.path.exists(self.path):
            return
        size = os.path.getsize(self.path)
        if size < self.end:
            LOG.error("summary: %s shrank (%d -> %d) — cursor restarted", self.path, self.end, size)
            self.end = 0
        if size == self.end:
            return
        with open(self.path, "rb") as fh:
            fh.seek(self.end)
            for raw in fh:
                if not raw.endswith(b"\n"):
                    return                      # a row still being written -- not consumed
                self.end += len(raw)
                lock_beat()                     # a from-empty build is long; store gates it on elapsed time
                if not raw.strip():
                    continue
                try:
                    r = json.loads(raw)
                except ValueError:
                    _READ_NEW_SKIPPED["lines"] += 1
                    continue
                if not isinstance(r, dict):
                    _READ_NEW_SKIPPED["lines"] += 1
                    continue
                yield r


def _birth_files() -> list:
    if not os.path.isdir(BIRTHS_DIR):
        return []
    return sorted(f for f in os.listdir(BIRTHS_DIR) if f.endswith(".jsonl"))


BIRTHS_FOLD_VERSION = 2          # 2: born_by_hour, births_first_at, births_through (P7)
BIRTHS_REBUILDS_KEPT = 10        # the recount record keeps the last ten
# every key the births fold accumulates -- all of them are dropped on a rebuild, so none is double-counted
BIRTHS_FIELDS = ("born_by_day", "followed_by_day", "born_by_hour", "cursors", "births_first_at", "births_through")


def _fold(st: dict, now: datetime) -> dict:
    """Advance the incremental counters over any new births and deaths.

    ⛔ INCREMENTAL BY NECESSITY, not by preference. Births are never deleted
       (they are in the tiering job's protected set), so at 90 days the census
       is ~1.86M rows and several hundred megabytes. Re-reading that hourly on
       the box that runs live trading is exactly the cost the co-tenancy clause
       exists to prevent. A byte cursor makes each pass O(new rows).
    ⛔ AND THEREFORE A NEW DERIVED FIELD NEEDS A BACKFILL, OR IT ONLY EVER SEES ROWS FROM ITS FIRST RUN ON (found at the
       P12 install, 2026-11-15): P7 added `born_by_hour`, `births_first_at` and `births_through`, but the live state's
       cursors already stood at the end of every births file, so the first build under the new code counted only the
       rows since the previous build -- `births_first_at` read 11:12 TODAY, every checkpoint `not_yet_due`, the job
       `nothing_due`. Every test and measurement had started from an EMPTY state, the one shape that worked.
    ⇒ BIRTHS_FOLD_VERSION: a state written by an older births fold has its births side rebuilt from byte 0 once;
      the tombstone side is untouched. MEASURED on the live store at the 2026-11-15 install: the whole summary build
      WITH the rebuild took 22.7 s and peaked at 186.6 MiB (summary's own logged line) against the 384M cap. (No
      marginal figure is claimed: the only other measured builds differ in more than the rebuild -- the 177.9 MiB one
      also seeded the watch set -- Langston, Step 9 fold (2).) ⛔ When you bump it, ADD THE NEW FIELD TO
      BIRTHS_FIELDS TOO: a births-derived accumulator left out of that tuple is carried over and double-counted on
      the rebuild (Langston, Step 9: two of the six had no test that would notice). births_first_at and
      births_through are a min and a max over an append-only, never-deleted corpus, so carrying them would be
      harmless -- they are in the tuple for tidiness, and the tuple is the fence only for the additive counters.
    """
    if st.get("births_fold_version") != BIRTHS_FOLD_VERSION:
        before = sum((st.get("born_by_day") or {}).values())
        prev_version = st.get("births_fold_version")
        for k in BIRTHS_FIELDS:
            st.pop(k, None)
        st["births_fold_version"] = BIRTHS_FOLD_VERSION
        # a durable record of every recount (Langston, Step 9): when, the launch total it replaced, the version it came
        # from. A bounded LIST, so the next bump does not erase the record of this one. ⚠️ born_before 0 means a
        # fresh store, not a recount -- presence alone does not tell them apart (from_version is None for both
        # pre-P7 and fresh states).
        st["births_rebuilds"] = (list(st.get("births_rebuilds") or []) + [
            {"at": now.isoformat(), "born_before": before, "from_version": prev_version}])[-BIRTHS_REBUILDS_KEPT:]
        LOG.warning("births fold rebuilt from byte 0 (state from an older births fold; %d launches counted before)", before)
    born = st.setdefault("born_by_day", {})
    # P7 D2: births per hour, kept for 90 d + 7 d so "was anything due at this checkpoint in this cycle?" can be
    # answered for the 90d point too; plus the first and newest launch STAMPS (`births_first_at`, `births_through`).
    # ⚠️ `births_through` is the newest launch recorded, NOT the fold's progress (Langston, part 1a Q2): the fold
    #    reads every complete line of every births file each build, so it is never behind the files.
    born_h = st.setdefault("born_by_hour", {})
    keep_from = (now - obs_fold.BIRTHS_HOURLY_KEEP).strftime("%Y-%m-%dT%H")
    followed = st.setdefault("followed_by_day", {})
    d_age = st.setdefault("deaths_by_age", {})
    d_class = st.setdefault("deaths_by_class", {})
    d_birth = st.setdefault("deaths_by_birth_day", {})
    cursors = st.setdefault("cursors", {})

    for name in _birth_files():
        path = os.path.join(BIRTHS_DIR, name)
        rows = _read_new(path, cursors.get(name, 0))
        for r in rows:
            day = _day(r.get("created_at")) or _day(r.get("first_seen_at"))
            if not day:
                continue
            born[day] = born.get(day, 0) + 1
            stamp = r.get("created_at") or r.get("first_seen_at") or ""
            hour = stamp[:13]
            if len(hour) == 13 and hour >= keep_from:
                born_h[hour] = born_h.get(hour, 0) + 1
            if stamp:
                if not st.get("births_first_at") or stamp < st["births_first_at"]:
                    st["births_first_at"] = stamp
                if not st.get("births_through") or stamp > st["births_through"]:
                    st["births_through"] = stamp
            # EVERY RECORDED LAUNCH IS FOLLOWED (Amendment 8). This used to
            #    read `if r.get("followed")`, and that flag is STALE on every
            #    row written before the amendment -- those launches were
            #    backfilled onto the grid but their birth row still says False.
            #    Counting the flag reported 10,748 tracked while 35,377
            #    launches were actually being followed.
            # THE FLAG IS NOT REWRITTEN. The census is append-only, so the
            #    historical value stays exactly as recorded; what changes is
            #    that the SUMMARY no longer treats a superseded field as the
            #    measurement. `follow_reason` still carries the arm.
            followed[day] = followed.get(day, 0) + 1
        cursors[name] = rows.end

    tomb = tombstone_path()
    rows = _read_new(tomb, st.get("tomb_cursor", 0))
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
    st["tomb_cursor"] = rows.end
    for h in [h for h in born_h if h < keep_from]:
        del born_h[h]
    return st


def _latest_observations(mints: set, max_files: int = 3) -> dict:
    """mint -> its most recent observation row, for the display table only.

    ⛔ BOUNDED BY DESIGN, AND THE BOUND IS STATED ON THE PAGE. Observations
       accumulate for 90 days; scanning all of them hourly on the box that runs
       live trading is the cost the co-tenancy clause exists to prevent. So
       this reads the newest few day-files and stops as soon as every mint it
       was asked for is found.
    ⚠️ A TOKEN NOT OBSERVED WITHIN THAT WINDOW SHOWS BLANKS RATHER THAN STALE
       NUMBERS. A blank says "not looked at recently"; a stale number says
       "this is how it is", and only one of those is true.
    ⭐ The read itself is store.latest_observations_uncorrected (P2b F-c): streamed, never a whole file as a list.
    """
    return latest_observations_uncorrected(mints, max_files)


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
    # One index for the whole walk -- re-reading it per day-file would turn a
    # two-file walk into N reads of the corrections store for no benefit.
    _corrections = _correction_index()
    _unresolved = 0   # counted, never silently dropped
    out = []
    for name in _birth_files():
        # ⛔ STOP THE INSTANT THE LIMIT IS MET (P2b-2 C-1(b)): the old loop returned
        #    before the next file was opened, and a two-file walk must not become a
        #    read of every birth file.
        need = limit - len(out)
        if need <= 0:
            break
        # ⛔ THE CORRECTED READ PATH, NOT A RAW open(). 19 census rows carry a
        #    QUOTE CURRENCY where the launched mint belongs, written before the
        #    conservation rule landed. THIS TABLE IS MINT-KEYED AND USER-FACING, so
        #    an uncorrected read would print USDC or wrapped SOL as a launch.
        # ★ `store.census` is the DEFAULT path and corrects; reading raw requires
        #   `read_census_uncorrected`, a greppable string rather than an omission.
        #   The naming IS the mechanism -- documentation would not survive the next
        #   reader, which is the two-objects-joined-by-convention trap.
        # ⚠️ The row-COUNTING fold above is deliberately left uncorrected: it counts
        #    rows per day and a collapsed row is still one launch, counted once.
        #    Counts were never the broken thing; identity was.
        # ⛔ THE TRY WRAPS THE CONSUMPTION, NOT A CALL (P2b-2 C-2). The census is
        #    read lazily, so an unparseable line raises inside the selection; the
        #    file then contributes NOTHING -- no rows and no unresolved count, exactly
        #    as when the whole day file was read up front -- and the walk moves on.
        file_unresolved = []
        try:
            best = _oldest_in_file(name, _corrections, dead, need, file_unresolved)
        except (OSError, ValueError):
            continue
        if len(best) == need:
            # this file meets the limit: the old loop counted only the unresolved rows
            # it passed before returning, i.e. those sorting below the last row taken
            last = best[-1][0]
            _unresolved += sum(1 for k in file_unresolved if k < last)
        else:
            _unresolved += len(file_unresolved)
        for _key, r in best:
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
    # no day-file row is referenced here: only the <= limit rows taken (P2b-1 R2)
    return _enrich(out), _unresolved


def _survivor_key(item):
    return item[0]


def _oldest_in_file(name: str, corrections, dead, need: int, unresolved_keys: list) -> list:
    """The `need` oldest listable rows of ONE day file, as [(key, row)], oldest first,
    holding at most `need` rows at a time (B-TOKEN-WATCH-FOLLOWUP-MEMORY P2b-2 F-d2).

    ★ THE SAME ORDER AS THE OLD WHOLE-FILE SORT, EXACTLY (Langston, P2b-2 C-1(a)):
      the key is (created_at or "", position), where position is the row's index in
      the RAW stream, assigned BEFORE the unresolved and dead filters. The old
      `rows.sort(key=created_at)` was stable, so ties kept file order; the position
      reproduces that, and `heapq.nsmallest` is documented equal to
      `sorted(iterable, key=key)[:n]`.
    ★ THE SAME COUNTER STAMPS THE UNRESOLVED ROWS, appended to `unresolved_keys`
      (19 in the whole store), so the caller's "below the last row taken" compares one
      coordinate system.
    ⛔ A ROW WE KNOW IS A QUOTE CURRENCY BUT COULD NOT REPAIR IS NOT A LAUNCH, AND
       MUST NOT BE LISTED AS ONE. Its key is in the corrections store, so this is
       derived from the data rather than from a hard-coded currency list -- the
       denylist the conservation rule was chosen over.
    """
    def candidates():
        for pos, r in enumerate(store_iter_census(name, corrections)):
            # P4 (Langston CHANGES-1): summary.build runs inside the follow-up's lock AFTER the sweep,
            # when the lock is oldest; the day-file walk is its long loop. Time-gated in store.
            lock_beat()
            key = (r.get("created_at") or "", pos)
            if r.get("mint_unresolved"):
                unresolved_keys.append(key)
                continue
            if r.get("mint") in dead:
                continue
            yield key, r
    return heapq.nsmallest(need, candidates(), key=_survivor_key)


def _enrich(rows: list) -> list:
    """Attach what the provider already tells us, for the display table.

    Kyle, 2026-09-01: name, symbol, market value now vs at launch, buyers vs
    sellers, the social channels, the chart link -- and the launch size in
    DOLLARS as well as SOL, because "3 SOL" is a unit with no anchor.

    ⛔ SIZE-IN-DOLLARS IS CONVERTED AT THE OBSERVATION'S OWN SOL PRICE, not a
       global median. Applying one rate to both ends of a "now vs at launch"
       comparison folds SOL's own move into a number meant to isolate the
       TOKEN's -- fine across a day, wrong across ninety.
    ⚠️ `initial_size` REMAINS AN INFERENCE, not a measurement: it is the
       largest transfer by the fee payer, and the ground-truth check against
       known launches is still outstanding (A3.1 condition 3). The row carries
       `size_is_inferred` so the page can say so rather than presenting it in a
       column of measured values.
    """
    obs = _latest_observations({r["mint"] for r in rows})
    # ⛔ NAME AND SYMBOL COME FROM THE IDENTITY STORE, NOT THE OBSERVATION.
    #    The oldest survivors are exactly the tokens whose next check is
    #    furthest away, so reading identity off "the latest observation" showed
    #    a blank for 89 of 100 -- the table was structurally guaranteed to be
    #    the stalest view we could build. Identity does not change, so it does
    #    not need re-observing; the volatile fields still come from the
    #    observation and still blank out when it is old, which is correct.
    ids = _identity_for({r["mint"] for r in rows})
    for r in rows:
        o = obs.get(r["mint"]) or {}
        sol = o.get("sol_usd")
        size = r.get("initial_size")
        _id = ids.get(r["mint"]) or {}
        r["name"] = o.get("name") or _id.get("name")
        r["symbol"] = o.get("symbol") or _id.get("symbol")
        r["market_cap_usd"] = o.get("market_cap_usd")
        r["buys_h24"] = o.get("buys_h24")
        r["sells_h24"] = o.get("sells_h24")
        r["chart_url"] = o.get("chart_url")
        r["socials"] = o.get("socials")
        r["sol_usd"] = sol
        r["initial_size_usd"] = (round(size * sol, 2)
                                 if isinstance(size, (int, float)) and sol else None)
        r["size_is_inferred"] = True
        # BLANK MEANS "NOT OBSERVED RECENTLY", NOT "ZERO". The lookup reads a
        #    bounded window of observation files, so a token nobody has checked
        #    lately shows empty cells -- which is the honest rendering of "we
        #    do not know right now".
        r["observed_at"] = o.get("observed_at")
    return rows


def _seed_watch(dead) -> dict:
    """mint -> {created_at, obs: {}} for the oldest obs_fold.WATCH_N not-dead launches, by the SAME key and the
    same corrected read as the survivor table, so the table's oldest 100 are the set's first 100."""
    corrections = _correction_index()
    members = {}
    for name in _birth_files():
        need = obs_fold.WATCH_N - len(members)
        if need <= 0:
            break
        try:
            best = _oldest_in_file(name, corrections, dead, need, [])
        except (OSError, ValueError):
            continue
        for _key, r in best:
            if r.get("mint"):
                members[r["mint"]] = {"created_at": r.get("created_at"), "obs": {}}
    return members


def _follow_up_lag_s(now: datetime):
    """Seconds from the end of the follow-up's last consumed hour to now (C-2), or None when unreadable.

    ⚠️ A LAGGING CURSOR HIDES AN UNCOVERED DAY AS "NOT YET READ" -- which is why it is published beside the
    coverage counts rather than inferred from them.
    BASELINE (07eba4b2; Langston C-1 `1574013031460110468`): the follow-up builds the summary at publish time and
    its last consumed hour is the run-START hour, so a healthy reading is
        run_length + run_start_minute - 60 min
    i.e. a band of roughly 0-80 min (Langston measured 3-79 min over run lengths 63/71/80 min x start minutes
    0-59 with the real `_buckets_to_read` / `_advance_cursor`). It is NOT "about one run": a reading of a few
    minutes is healthy. Stamped at run start it read slightly NEGATIVE (published 2026-11-22 09:59Z: -214 s).
    It leaves the band only when the follow-up SKIPS an hour or the timer builds the summary alone -- the signal
    this gauge exists for; well above ~2 h means the cursor is falling behind.
    """
    last = load_state("follow_up_cursor", {}).get("last_bucket")
    try:
        end = datetime.strptime(last, "%Y-%m-%dT%H").replace(tzinfo=UTC) + timedelta(hours=1)
    except (TypeError, ValueError):
        return None
    return int((now - end).total_seconds())


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
    _READ_NEW_SKIPPED["lines"] = 0
    store.CENSUS_SKIPPED.clear()
    st = _fold(load_state(STATE, {}), now)

    # ⭐ ONE DEAD SET (P2b F-a). build used to re-read the whole tombstone file into its own set here, beside
    #    store's cached one - a second full copy, +99..111 MiB measured (P2a), in the follow-up unit that runs it.
    # ⛔ AN UNREADABLE TOMBSTONE FILE IS NOT "NOTHING IS DEAD" (Langston R3, absent-as-valid #546). The old loop caught
    #    OSError and carried on with an empty set, which listed corpses as the oldest survivors. Now the table is
    #    WITHHELD (empty) and the reason is published beside it.
    try:
        dead = dead_set()
        dead_note = None
        bad = dead_set_status()["bad_lines"]
        if bad:
            dead_note = ("%d tombstone line(s) could not be read; a token whose death is on one of them may be "
                         "listed as a survivor" % bad)
    except OSError as exc:
        dead = None
        dead_note = "survivor table withheld: the tombstone file could not be read (%s)" % type(exc).__name__

    # ⭐ P7 D4: THE WATCH SET -- the oldest WATCH_N not-dead launches, each carrying what the follow-up has seen of
    #    it, so a listed survivor's status is KNOWN without re-reading every observation file each hour. A (re)seed
    #    discards the observation fold so the one streaming pass below re-reads from byte 0 and fills the members'
    #    history (observation files are never tiered, so that re-read is exact). Without a readable dead set the
    #    set is neither seeded nor pruned: the survivor table is withheld anyway.
    watch = st.get("watch")
    if dead is not None:
        why = obs_fold.watch_needs_seed(watch, dead, OLDEST_N, sum(st["born_by_day"].values()))
        if why:
            seeded_at = now.isoformat() if why == "seeded" else watch.get("seeded_at")
            members = _seed_watch(dead)
            watch = {"version": obs_fold.WATCH_VERSION, "members": members,
                     "capped": len(members) >= obs_fold.WATCH_N,
                     "births_folded_at_seed": sum(st["born_by_day"].values()),
                     "seeded_at": seeded_at, "rebuilt_at": now.isoformat() if why == "rebuilt" else None}
            st["obs"] = None
            LOG.warning("watch set %s: %d members", why, len(watch["members"]))
        else:
            obs_fold.prune_dead(watch, dead)
        st["watch"] = watch
    # ⚠️ An unreadable dead set still folds WITH the existing members (Langston, part 2 item 2): cursors advance
    #    unconditionally, so folding without them would move past rows nobody re-reads.
    obs = obs_fold.fold_observations(st, now, watch["members"] if obs_fold.watch_usable(watch) else None)
    cadence = obs_fold.read_cadence()
    window = load_state(obs_fold.WINDOW_STATE, {}) or None
    states = obs_fold.label_states(obs, st.get("born_by_hour", {}), st.get("births_first_at"),
                                   st.get("births_through"), window, cadence, now)
    if states.get("job"):
        states["job"]["switch"] = obs_fold.timer_switch()

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

    if dead is None:
        survivors, unresolved = [], 0
    else:
        survivors, unresolved = _oldest_survivors(dead, OLDEST_N, now)
    # P7 D4: every listed row says what we actually know; nothing is filtered or refilled on it
    # ⛔ NO GUESSED CYCLE (Langston, part 2, C-A): with an unreadable cadence the checkpoint table says `unknown`,
    #    and so does every survivor row -- the old `or K_FLOOR * 3900` was a second copy of the unit's value, armed
    #    exactly when the first could not be read.
    settle = None if cadence is None else {L: rec["window_s"] for L, rec in states["labels"].items()}
    members = watch["members"] if obs_fold.watch_usable(watch) else {}
    for r in survivors:
        r.update(obs_fold.survivor_status(r.get("created_at"), members.get(r.get("mint")), settle, now))
    status_counts = {}
    for r in survivors:
        status_counts[r["status"]] = status_counts.get(r["status"], 0) + 1
    unverified_ages = [r["age_days"] for r in survivors
                       if r["status"] == "unverified" and r.get("age_days") is not None]

    payload = {
        "generated_at": now.isoformat(),
        "launches": {
            "total": launches_total,
            "by_day": dict(sorted(born.items())),
            # every recount of the launch census, where its effect is visible (Langston, Step 9 fold (3))
            "rebuilds": list(st.get("births_rebuilds") or []),
            "note": "Every launch the feed reported. This is the census "
                    "denominator, not the tracked population.",
        },
        "tracked": {
            "total": followed_total,
            "share_of_launches": (round(followed_total / launches_total, 4)
                                  if launches_total else None),
            "note": "EVERY launch is now followed on the full grid (Amendment "
                    "8, 2026-09-01). This used to be trait carriers plus a "
                    "random control, and the survival figures were over that "
                    "sample; they are now over the whole population. Launches "
                    "recorded BEFORE the amendment were backfilled, so their "
                    "1h and 6h checkpoints are missing where those moments had "
                    "already passed — do not pool the earliest two ages across "
                    "2026-09-01.",
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
        "oldest_survivors": survivors,
        # the table's own caveats: why it may be withheld or incomplete, and how many census rows were NOT listed
        # because they record a quote currency that could not be repaired (counted, never silently dropped - R4)
        "oldest_survivors_note": dead_note,
        "oldest_survivors_status": {
            "counts": dict(sorted(status_counts.items())),
            "oldest_unverified_age_days": max(unverified_ages) if unverified_ages else None,
            "watch_set_size": len(members),
            "watch_set_seeded_at": watch.get("seeded_at") if isinstance(watch, dict) else None,
            "watch_set_rebuilt_at": watch.get("rebuilt_at") if isinstance(watch, dict) else None,
            "watch_set_note": "The current membership dates from rebuilt_at when it is set, else from seeded_at; "
                              "seeded_at moves only when the set was lost or never existed.",
            "note": "verified_alive = seen alive at its most recent due checkpoint; unverified = seen at some "
                    "checkpoint but not at its most recent due one; never_observed = never seen at all.",
        },
        # ⭐ P7 D2: per checkpoint, is anyone looking -- and the one job-level verdict
        "observation_states": dict(
            states,
            cadence=cadence,
            cadence_changed=bool(window and cadence and (window.get("cadence") or {}).get("cycle_s")
                                 != cadence["cycle_s"]),
            window_derived_at=(window or {}).get("derived_at"),
            window_floor_bound={L: (v or {}).get("floor_bound")
                                for L, v in ((window or {}).get("labels") or {}).items()},
        ),
        "oldest_survivors_unresolved_excluded": unresolved,
        # census / tombstone lines this build's fold could not use (unparseable or not an object) - counted, never
        # raised, never silently dropped
        "fold_skipped_lines": _READ_NEW_SKIPPED["lines"],
        # census lines this build's survivor walk / watch-set seed skipped because they were valid JSON but not an
        # object (#1258): counted and published, never silently dropped. Only the files those walks read.
        "census_skipped_non_object_lines": sum(store.CENSUS_SKIPPED.values()),
        "census_skipped_by_file": dict(sorted(store.CENSUS_SKIPPED.items())),
        # ⭐ WHAT THE FOLLOW-UP ACTUALLY LOOKED AT (P7, OBJ-5). Every figure above is derived from births and
        #    tombstones, and a death is recorded only when the follow-up looks -- so a stopped follow-up reads as
        #    "nobody died". This block is the evidence of looking, per checkpoint.
        "coverage": dict(
            obs_fold.coverage(obs, born, now),
            observed_through=obs["observed_through"],
            follow_up_lag_s=_follow_up_lag_s(now),
            birth_day_split=dict(obs["split"]),
            shapes_by_label=obs_fold.shape_totals(obs),
            covering_by_day=obs_fold.covering_by_day(obs),
            last_observed_at=dict(sorted(obs["last_observed_at"].items())),
            skipped_lines=obs["skipped_lines"],
            rebuilt_at=obs["rebuilt_at"],
            note="A birth day is uncovered if any checkpoint already due for the whole day has no observation "
                 "row. Covering rows are COUNTS: before 2026-11 the birth day is estimated from the observation "
                 "time, which can spill a row across midnight, so a count can exceed that day's launches.",
        ),
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


# A skipped summary run pages (exit 75) only when the PUBLISHED file is older than this: 2 h of staleness. The
# follow-up publishes inside its own lock at the END of each run, stamped with the publish time (07eba4b2: it was
# stamped with the run's START, an hour early). Runs took 63-80 min back to back in the follow-up's journal on
# 2026-11-22 (3 runs), so a skip at :12 then sees a file at most one run old -- a 40-57 min margin to 2 h. That is
# TODAY's margin, not a design margin: this batch's change list also records ~95-min runs and one 3 h 01 m 28 s run.
# NOT widened: a wider threshold would hide a genuinely lost publish for longer. RESIDUAL, stated and already
# realised once: a page is ambiguous between a missed publish and a single run longer than 2 h --
# `store.last_refusal()` names the lock holder, which tells them apart.
# SECOND READER of `generated_at` (Langston C-2): `server/routes/token-watch.ts` STALE_AFTER_MS (2 h) drives the
# page's "stale" banner. Stamped at run start, the age just before a publish was previous run + current run
# (>= 125 min at the run lengths measured), so the banner false-fired on a healthy cycle; stamped at publish it
# peaks at one run. It reads the published file, so it changes with the token-watch install, not an app deploy.
# A skip behind any other holder (tier, a one-time tool) with no recent publish is a lost hour and must not read
# as a publish at the supervisor (Langston, P6 Step 4 CHANGES-1). Unconditional 75 would page every hour the
# sweep holds the lock past :12.
SKIP_STALE_AFTER = timedelta(hours=2)


def skip_exit_code(now: datetime | None = None) -> tuple:
    """(exit code, reason) for a run that SKIPPED: 0 if the published summary is fresh, 75 if it is stale,
    missing or unreadable (absent is never read as fresh)."""
    now = now or _now()
    try:
        with open(SUMMARY_PATH, encoding="utf-8") as fh:
            published = datetime.fromisoformat(json.load(fh)["generated_at"])
        age = now - published           # inside the try: a naive stamp raises TypeError here (Langston nit)
    except (OSError, ValueError, KeyError, TypeError) as exc:
        return 75, "skipped and the published summary could not be read (%s)" % type(exc).__name__
    if age > SKIP_STALE_AFTER:
        return 75, "skipped and the published summary is %s old (past %s)" % (age, SKIP_STALE_AFTER)
    return 0, "skipped; the published summary is %s old" % age


def main(now: datetime | None = None) -> dict | None:
    """The `token-watch-summary` timer's entry point: build ONLY under the store's
    periodic lock, and skip when another job holds it.

    ⛔ ONE WRITER FOR state/summary.json AND public/summary.json (B-TOKEN-WATCH-
       FOLLOWUP-MEMORY P6(d), pre-audit A5). The follow-up calls `build()` inside
       its own lock and `build()` both advances the fold's cursors and publishes;
       this timer called it with no lock, so two builds could fold the same new
       census lines twice. A skip here costs nothing: the follow-up run holding
       the lock publishes the same file itself.
    Returns the payload, or None when skipped (and says so).
    """
    with periodic_lock("summary") as held:
        if not held:
            LOG.warning("another periodic job holds the lock — summary build SKIPPED (held by: %s)",
                        last_refusal())
            return None
        return build(now)


# A run whose own peak RSS passes this share of its cgroup's memory.max exits 3 after publishing, so OnFailure pages
# BEFORE the cap binds (Langston, P3 Step 4: systemd's MemoryPeak is unusable here, so without this the first signal
# of the cap binding is the kill). The cap itself is read from the cgroup, never restated here.
MEM_WARN_SHARE = 0.7


def memory_headroom() -> tuple:
    """(peak RSS bytes, the cgroup's memory.max bytes or None when unlimited/unreadable)."""
    try:
        import resource                     # Linux only; the unit runs on the staging box
    except ImportError:
        return 0, None
    peak = resource.getrusage(resource.RUSAGE_SELF).ru_maxrss * 1024
    cap = None
    try:
        with open("/proc/self/cgroup", encoding="utf-8") as fh:
            rel = next(line.split("::", 1)[1].strip() for line in fh if line.startswith("0::"))
        with open("/sys/fs/cgroup%s/memory.max" % rel, encoding="utf-8") as fh:
            v = fh.read().strip()
        cap = int(v) if v.isdigit() else None
    except (OSError, StopIteration, ValueError):
        cap = None
    return peak, cap


def memory_exit_code(peak: int, cap: int | None) -> int:
    """Log this run's peak against its cap; 3 when past MEM_WARN_SHARE of it (the page), else 0."""
    LOG.info("summary peak RSS %d B (%.1f MiB); cgroup memory.max %s", peak, peak / 1048576.0, cap)
    if cap and peak > MEM_WARN_SHARE * cap:
        LOG.error("summary peak RSS %.1f MiB is past %d%% of its %.1f MiB cap - raise or remove the cap before it binds",
                  peak / 1048576.0, int(MEM_WARN_SHARE * 100), cap / 1048576.0)
        return 3
    return 0


def final_exit_code(payload: dict, mem: int) -> int:
    """The summary unit's exit code: the memory gauge's code if set, else the job-fault code.

    ⛔ BOTH ARE COMPUTED, THEN COMBINED (Langston, P7 part 2 C-B): `mem or job_fault_exit_code(...)` never called the
       second when the first was set, so its error line -- the only thing that tells 3 / 4 / 5 apart, since the unit
       has OnFailure= and no SuccessExitStatus= -- was never written. A named function so the combine is testable
       (Langston's condition on the part-2 PROCEED: `__main__` never runs under a test).
    """
    job = (payload.get("observation_states") or {}).get("job")
    fault = obs_fold.job_fault_exit_code(job, (job or {}).get("switch", "unknown"))
    return mem or fault


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    p = main()
    if p is None:
        # ⛔ A SKIP MUST NOT READ AS A PUBLISH AT THE SUPERVISOR (Langston, P6 Step 4 CHANGES-1;
        #    follow_up.py's own __main__ states the rule): exit 75 when the published file is stale.
        code, why = skip_exit_code()
        (LOG.error if code else LOG.info)(why)
        sys.exit(code)
    print(json.dumps({k: v for k, v in p.items() if k != "oldest_survivors"},
                     indent=2, sort_keys=True))
    # P7, Langston condition 1: a follow-up meant to run that has observed nothing for a whole window pages here,
    # on the summary unit's own hourly run -- a carrier that does not depend on the follow-up running at all.
    sys.exit(final_exit_code(p, memory_exit_code(*memory_headroom())))
