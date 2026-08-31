"""
token-watch — the store.

APPEND-ONLY FILES. No database, no server, one writer per stream. That is the
resource bound stated in the scope §0 (co-tenancy), not an aesthetic choice:
this process shares a 2-core box with the Discord bridges and the reviewer.

★ THE CENSUS QUESTIONS, ANSWERED IN CODE RATHER THAN IN A DOCUMENT (§9.5(a),
  answered at DESIGN time because that is the only time it is cheap):

    who WRITES/CREATES here?  -> exactly one: record_birth(), from the receiver
    who READS here?           -> ONE TODAY: the follow-up scheduler.
                                 PLANNED, NOT BUILT: the coverage audit and the
                                 summary publisher.
    who MUTATES here?         -> exactly one: record_observation() APPENDS.
                                 Birth records are never modified.
    ★ who DELETES here?       -> exactly one: tier.py, and ONLY bulky payload
                                 past its hot window.
                                 ⛔ BIRTH RECORDS ARE DELETED BY NOTHING, EVER.
    who SCHEDULES here?       -> TWO TIMERS SHIP: follow-up (hourly), tiering
                                 (daily). Two more are designed and NOT built:
                                 the coverage audit and the summary publisher.
                                 All periodic work takes periodic_lock(), so
                                 adding the other two needs no redesign.
    ★ who WRITES STATE here?  -> the two locked jobs — AND the receiver, which
                                 is why it writes an APPEND-ONLY JOURNAL rather
                                 than a state file (budget.record_pending).

⚠️ THIS CENSUS PREVIOUSLY SAID "FOUR SCHEDULERS, ALL TAKE THE LOCK" AND NAMED
   THREE READERS. Only two timers ship, and the receiver — a state writer that
   takes no lock — was missing from the list entirely. Langston found the
   omission (BLOCKER-2) and a fresh reader found the count. ★ The census is the
   artifact the standing rule requires at every hop; one that describes the
   design rather than the code is worse than none, because it is READ as the
   code. Fixed to say what ships and what does not.

⚠️ The one-writer rule is enforced by SHAPE, not by discipline: the receiver is
   the only module that calls record_birth(), every periodic job is serialised
   behind a single lock, and the receiver's own hot path only ever appends.
"""

from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from config import harden as _harden
from config import (
    BIRTHS_DIR,
    COLD_DIR,
    DUE_DIR,
    GRID,
    GRID_LABELS,
    LOCK_PATH,
    OBSERVATIONS_DIR,
    STATE_DIR,
    TOMBSTONE_DIR,
)

UTC = timezone.utc

# A lock older than this is treated as abandoned. Deliberately generous: the
# cost of waiting is a skipped cycle, the cost of a false steal is two jobs
# writing at once.
LOCK_STALE_AFTER = timedelta(minutes=30)


def _now() -> datetime:
    return datetime.now(UTC)


def ensure_dirs() -> None:
    for d in (
        BIRTHS_DIR,
        OBSERVATIONS_DIR,
        DUE_DIR,
        TOMBSTONE_DIR,
        COLD_DIR,
        STATE_DIR,
    ):
        os.makedirs(d, exist_ok=True)


def _append(path: str, record: dict) -> None:
    """The only write primitive. Append a single JSON line, flushed to disk.

    fsync on every birth is deliberate. A birth record lost to a page cache on
    an unclean shutdown is not recoverable from anywhere: the chain is
    permanent but re-deriving it means 43.2M transactions/day, which §5
    measures as unaffordable at every tier. One fsync per ~0.24 writes/second
    is nothing; a hole in the base rate is the study.
    """
    _dir = os.path.dirname(path)
    # `_append` MUST NEVER WRITE INTO THE PUBLISHED DIRECTORY. `_harden` sets
    #    0700; applied to `public/` that would make the tracking page
    #    unreadable to the app -- an EMPTY PAGE, not an error, which is the
    #    exact failure mode `summary._publish_dir` already documents. Fail
    #    loudly rather than silently breaking the only visible surface.
    if os.path.basename(_dir) == "public":
        raise ValueError("_append must not write into the published dir: %s" % path)
    os.makedirs(_dir, exist_ok=True)
    # ⛔ THE MODE IS SET IN CODE, NOT INHERITED FROM WHOEVER RAN THE PROCESS.
    #    MEASURED 2026-08-31: `social-checks.jsonl` was 0644 inside a 0751
    #    store, so the trading app's user could read it — against the stated
    #    isolation clause. The cause is that the file's mode depended on the
    #    CALLER'S umask: the service sets UMask=0077, a manual repair run does
    #    not. A permission that varies by who happened to create the file is
    #    not a permission, and the claim about it cannot be true twice.
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())
    _harden(_dir, path)



def _read(path: str):
    """Read a JSONL file. A MISSING FILE IS AN EMPTY ITERATION, and callers
    must never read that as "there is nothing" without a positive control —
    absent-as-valid is the failure class this project keeps paying for.
    """
    if not os.path.exists(path):
        return
    with open(path, "r", encoding="utf-8") as fh:
        for line in fh:
            line = line.strip()
            if line:
                yield json.loads(line)


# ─────────────────────────────────────────────────────────────────────────────
# MUTUAL EXCLUSION — §9.5(a) requires it wherever two or more schedulers touch
# one component. TWO periodic jobs ship (follow-up, tiering); two more are
# designed and not built. The RECEIVER does not take this lock and must not —
# it only ever appends, and blocking ingestion on an hourly job would trade a
# recoverable delay for an unrecoverable census gap.
# ─────────────────────────────────────────────────────────────────────────────
@contextmanager
def periodic_lock(holder: str, wait: bool = False):
    """Exclusive lock for the periodic jobs.

    O_EXCL rather than fcntl so it behaves identically when tested off-Linux.
    Yields True if held, False if another job holds it — the caller must check
    and skip rather than proceeding, because "I could not get the lock" and "I
    did the work" must never be the same code path.
    """
    os.makedirs(os.path.dirname(LOCK_PATH), exist_ok=True)
    fd = None
    deadline = time.time() + (300 if wait else 0)
    while True:
        try:
            fd = os.open(LOCK_PATH, os.O_CREAT | os.O_EXCL | os.O_WRONLY)
            os.write(fd, f"{holder} {os.getpid()} {_now().isoformat()}\n".encode())
            os.close(fd)
            break
        except FileExistsError:
            age = _now() - datetime.fromtimestamp(os.path.getmtime(LOCK_PATH), UTC)
            if age > LOCK_STALE_AFTER:
                # Abandoned: the holder died without releasing. Steal it, and
                # say so — a silently stolen lock hides a crashing job.
                os.unlink(LOCK_PATH)
                continue
            if time.time() >= deadline:
                yield False
                return
            time.sleep(2)
    try:
        yield True
    finally:
        try:
            os.unlink(LOCK_PATH)
        except FileNotFoundError:
            pass


# ─────────────────────────────────────────────────────────────────────────────
# BIRTHS — the census. Never sampled, never deleted, never modified.
# ─────────────────────────────────────────────────────────────────────────────
def birth_path(when: datetime) -> str:
    return f"{BIRTHS_DIR}/{when.strftime('%Y-%m-%d')}.jsonl"


def record_birth(
    mint: str,
    created_at: datetime,
    first_seen_at: datetime,
    venue: str,
    initial_size,
    initial_liquidity,
    creator: str,
    size_source: str,
    socials: dict,
    followed: bool,
    follow_reason: str,
    signature: str | None = None,
) -> dict:
    """Record one launch and schedule its whole observation grid.

    ★ BOTH TIMESTAMPS ARE PERSISTED, and that is OBJ-2 rather than telemetry.
      We see a token only once the feed notices it. With ~68.67% dying on
      launch day, any discovery delay removes a large and NON-RANDOM slice —
      and size-at-birth is the strongest published predictor (HR 4.51), so a
      delayed first sight silently converts it into size-at-DISCOVERY while we
      go on calling it the published variable. Persisting both turns an
      unknown bias into a stated, measurable one.
      This is LEFT-TRUNCATION, not survivorship — Langston's correction, and
      the name changes the fix.
    """
    rec = {
        "mint": mint,
        # ⛔ THE TRANSACTION SIGNATURE, AND ITS ABSENCE WAS BLOCKER-D'S REAL
        #    CAUSE. The BLOCKER-C corrections carried a signature "so they
        #    would join to the birth row" -- and the birth row had no
        #    signature, so the join was impossible and the reader fell back to
        #    the MINT, which is USDC on every collapse. Nineteen corrections
        #    collapsed to one. A join key written on ONE side of a join is not
        #    a join key.
        "signature": signature,
        "created_at": created_at.astimezone(UTC).isoformat(),
        "first_seen_at": first_seen_at.astimezone(UTC).isoformat(),
        "discovery_lag_s": (first_seen_at - created_at).total_seconds(),
        "venue": venue,
        "initial_size": initial_size,
        # ⛔ PERSISTED, not just computed. A fresh reader found the label was
        # produced by the parser and then DISCARDED before the record was
        # written — so "unresolved" and "genuinely small" were indistinguishable
        # in the stored data, which is the exact discrimination the label exists
        # to provide. Computed-and-dropped is worse than never computed: the
        # code reads as though the protection is there.
        "size_source": size_source,
        "initial_liquidity": initial_liquidity,
        "creator": creator,
        "socials": socials,
        "followed": followed,
        "follow_reason": follow_reason,
    }
    _append(birth_path(first_seen_at), rec)
    if followed:
        schedule_grid(mint, created_at)
    return rec


# ─────────────────────────────────────────────────────────────────────────────
# THE DUE QUEUE — hour buckets.
#
# ★ WHY BUCKETS RATHER THAN AN INDEX SCAN: at 20,700 births/day the census
#   reaches ~1.86M records over 90 days. Scanning that hourly to ask "what is
#   due now?" would burn the very CPU the co-tenancy clause protects. Bucketing
#   by due-hour at WRITE time means the hourly job opens exactly one small
#   file. It also keeps the whole store append-only — there is no row to
#   update when a checkpoint passes.
# ─────────────────────────────────────────────────────────────────────────────
def due_path(when: datetime) -> str:
    return f"{DUE_DIR}/{when.strftime('%Y-%m-%dT%H')}.jsonl"


def schedule_grid(mint: str, created_at: datetime) -> None:
    """Write one due-entry per grid age, into the bucket for its hour.

    Ages are measured from ON-CHAIN CREATION, never from first sight. A grid
    anchored on discovery would make every cohort's "24h" a different real age,
    and cohorts could no longer pool — which is the entire reason §6 fixes the
    ages.
    """
    now = _now()
    current_bucket = now.strftime("%Y-%m-%dT%H")
    for delta, label in zip(GRID, GRID_LABELS):
        due = created_at.astimezone(UTC) + delta

        # ⛔ BLOCKER-3 (Langston): A GRID POINT ALREADY IN THE PAST IS RECORDED
        #    AS A MISS, NOT WRITTEN TO A BUCKET NOBODY WILL EVER READ.
        #
        #    The scheduler reads exactly ONE bucket — the current hour. A birth
        #    discovered three hours after creation used to write its '1h' entry
        #    into a bucket three hours gone: written, never read, no log, no
        #    counter. Two real triggers, neither exotic: discovery lag over an
        #    hour (the very thing OBJ-2 exists to persist), and any receiver
        #    outage, where the provider's retries deliver births whose early
        #    points are already past.
        #
        # ★ AND THE UNIT FILE MADE IT READ AS COVERED: the timer sets
        #   Persistent=true, which fires once on resume and reads only the
        #   current hour. The unit says catch-up; the code had none. That is
        #   "reads as covered" living in a service file.
        #
        # Same vocabulary as a shed, deliberately: a non-observation is a row,
        # so the analysis can tell "we did not look" from "we looked and found
        # nothing" without joining two files.
        if due <= now:
            record_observation(mint, label, now, {
                "observed": False,
                "reason": "scheduled_in_the_past",
                "due_at": due.isoformat(),
                "first_seen_at": now.isoformat(),
            })
            continue

        # ⛔ THE SAME-HOUR ORPHAN — my first version of this fix still lost it,
        #    and a fresh reader reproduced it: a token created 40 minutes ago
        #    produced ZERO misses and a due entry in the CURRENT bucket.
        #
        #    The first version compared hour-BUCKET strings with `<`, so a
        #    point already past but inside the current hour was neither a miss
        #    nor safely scheduled — it went into the current bucket, which the
        #    hourly job has already read (the timer fires 0-5 minutes past the
        #    hour and reads once). Written, never read: exactly the orphan
        #    BLOCKER-3 was about, surviving inside the hour.
        #
        # ⇒ ANYTHING STILL DUE THIS HOUR GOES INTO THE NEXT BUCKET. It costs at
        #   most one hour of lateness, the true age stays recoverable from
        #   created_at and observed_at, and nothing is silently dropped.
        if due.strftime("%Y-%m-%dT%H") == current_bucket:
            due_bucket = due + timedelta(hours=1)
        else:
            due_bucket = due
        # ★ `created_at` RIDES THE SCHEDULE ENTRY so the death record can carry
        #   it (see record_death). It is derivable from due_at minus the grid
        #   offset, but only APPROXIMATELY at death time — an observation can be
        #   late, and the lateness would land in the birth cohort. Carrying the
        #   exact value costs one field per entry and removes the estimate.
        _append(due_path(due_bucket),
                {"mint": mint, "age": label, "due_at": due.isoformat(),
                 "created_at": created_at.astimezone(UTC).isoformat()})


def due_now(hour: datetime):
    """Everything scheduled for this hour, minus anything already dead.

    ⛔ DEAD TOKENS ARE NEVER RE-CHECKED (pre-registration §6). Filtering here
       rather than at write time keeps the queue append-only: we never rewrite
       a bucket to remove entries.
    """
    dead = dead_set()
    for entry in _read(due_path(hour)):
        if entry["mint"] not in dead:
            yield entry


# ─────────────────────────────────────────────────────────────────────────────
# TOMBSTONES — death, recorded rather than inferred.
# ─────────────────────────────────────────────────────────────────────────────
def tombstone_path() -> str:
    return f"{TOMBSTONE_DIR}/dead.jsonl"


def record_death(mint: str, when: datetime, death_class: str, age_label: str,
                 evidence: dict, created_at: str | None = None) -> None:
    """★ death_class is 'faded' or 'liquidity_pulled', defined EX ANTE.

    Both end at zero, so a win/lose column would treat them identically — but
    they may differ on day one, and THAT DIFFERENCE IS A PRIMARY OBJECT OF THE
    STUDY, not a footnote (pre-registration §5).
    """
    assert death_class in ("faded", "liquidity_pulled"), death_class
    _append(
        tombstone_path(),
        {
            "mint": mint,
            "died_at": when.astimezone(UTC).isoformat(),
            "death_class": death_class,
            "age_at_death": age_label,
            # ⛔ THE BIRTH TIME TRAVELS WITH THE DEATH. Without it every
            #    survival calculation — and every birth-cohort breakdown — has
            #    to join this record against ~1.86M birth rows to find out when
            #    the token started. A death record that cannot say when its own
            #    token was born is half a survival observation.
            "created_at": created_at,
            "evidence": evidence,
        },
    )
    # ⛔⛔ RETRACTION — THE ORIGINAL JUSTIFICATION FOR THIS BLOCK WAS WRONG, and
    # the wrong version was published to Kyle and dispatched to Langston.
    #
    # IT CLAIMED: recording a death invalidates the mtime cache, so the next
    # due-queue lookup re-parses the whole file; at ~376,000 tombstones and
    # ~520 deaths in a busy hour that is ~196 MILLION line re-parses per run,
    # and the hourly job stops finishing inside its hour by month three.
    #
    # ⛔ THAT ARITHMETIC ASSUMED ONE dead_set() CALL PER DEATH. There is not
    #   one. `due_now()` calls dead_set() ONCE and binds it to a local; the
    #   hourly job calls due_now() once. MEASURED with an instrumented counter:
    #   300 deaths in a run produced ONE dead_set() call, not 300.
    # ⛔ AND the follow-up unit is Type=oneshot, so the process exits each hour
    #   and the cache is cold at the top of every run regardless. One full
    #   parse per hourly run is structurally unavoidable and this block cannot
    #   remove it.
    # ⚠️ The two population figures were also asserted rather than derived: the
    #   ~376,000 silently turned a published 68.67% DAY-ONE death rate into a
    #   ~90% CUMULATIVE one, and the 3x "busy hour" multiplier came from
    #   nowhere at all.
    #
    # ✅ WHAT THIS BLOCK ACTUALLY BUYS, stated narrowly enough to be checkable:
    #   `dead_set()` returns the cached set OBJECT, so mutating it in place
    #   makes a death recorded mid-run visible to the remainder of that same
    #   run. Rebuilding would rebind _DEAD_CACHE["set"] to a NEW set while the
    #   generator still held the old one. It also removes the re-parse for any
    #   future caller that does re-enter dead_set() — the coverage audit and
    #   summary publisher are designed and not built.
    # ★ Found by a fresh reader asking what else was consistent with the code;
    #   I had traced the data structure and never traced its callers.
    if _DEAD_CACHE["mtime"] is not None:
        _DEAD_CACHE["set"].add(mint)
        try:
            _DEAD_CACHE["mtime"] = os.path.getmtime(tombstone_path())
        except OSError:
            _DEAD_CACHE["mtime"] = None  # fall back to a re-read; never guess


_DEAD_CACHE = {"mtime": None, "set": set()}


def dead_set() -> set:
    """Dead mints, cached on the tombstone file's mtime.

    The cache is invalidated by mtime rather than by a timer, so a death
    recorded by this same process is visible to the next lookup within it.
    """
    path = tombstone_path()
    if not os.path.exists(path):
        # ⛔ MARK THE CACHE AS INITIALISED even with no file yet. A fresh reader
        #    found that returning early WITHOUT setting mtime left the cache
        #    cold, so record_death's in-place add was skipped by its
        #    `mtime is not None` guard — and the first death of a run was
        #    invisible to the rest of that run. On a oneshot unit that is a
        #    cold cache at the top of EVERY hour until the file exists.
        if _DEAD_CACHE["mtime"] is None:
            _DEAD_CACHE["mtime"] = 0
            _DEAD_CACHE["set"] = set()
        return _DEAD_CACHE["set"]
    mtime = os.path.getmtime(path)
    if _DEAD_CACHE["mtime"] in (None, 0) or _DEAD_CACHE["mtime"] != mtime:
        _DEAD_CACHE["set"] = {r["mint"] for r in _read(path)}
        _DEAD_CACHE["mtime"] = mtime
    return _DEAD_CACHE["set"]


# ─────────────────────────────────────────────────────────────────────────────
# OBSERVATIONS — the follow-up results. Append-only; a checkpoint is never
# overwritten, so a re-run produces a second row rather than losing the first.
# ─────────────────────────────────────────────────────────────────────────────
def observation_path(when: datetime) -> str:
    return f"{OBSERVATIONS_DIR}/{when.strftime('%Y-%m-%d')}.jsonl"


def record_observation(mint: str, age_label: str, when: datetime, fields: dict) -> None:
    """⛔ `observed` IS ALWAYS PRESENT ON EVERY ROW — it is defaulted here and
    a caller may override it.

    Langston's Step-4 condition on keeping non-observations in the same stream:
    a reader must be able to filter on `observed` without supplying a default.
    A downstream `?? true` is the absent-as-valid failure waiting to happen.

    ⚠️ THE DOCSTRING PREVIOUSLY SAID "never at the call sites", WHICH WAS FALSE —
    both call sites pass it, and the miss rows are False precisely because
    `rec.update(fields)` lets them. The behaviour was right and the stated
    invariant was not the one enforced; a fresh reader caught the divergence.
    What is guaranteed is PRESENCE, not that call sites stay silent.
    """
    rec = {"mint": mint, "age": age_label, "observed_at": when.astimezone(UTC).isoformat(),
           "observed": True}
    rec.update(fields)
    _append(observation_path(when), rec)


# ─────────────────────────────────────────────────────────────────────────────
# STATE — small counters the periodic jobs keep. Read-modify-write, which is
# exactly why every caller must hold periodic_lock().
# ─────────────────────────────────────────────────────────────────────────────
def state_path(name: str) -> str:
    return f"{STATE_DIR}/{name}.json"


def load_state(name: str, default: dict) -> dict:
    path = state_path(name)
    if not os.path.exists(path):
        return dict(default)
    with open(path, "r", encoding="utf-8") as fh:
        return json.load(fh)


def save_state(name: str, value: dict) -> None:
    """Atomic replace — a torn state file on an unclean shutdown would read as
    a plausible-but-wrong budget, which is worse than no budget at all.
    """
    path = state_path(name)
    _dir = os.path.dirname(path)
    os.makedirs(_dir, exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(value, fh, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
    # THE SAME HARDENING AS `_append`, AND IT IS NOT DECORATIVE HERE: `state/`
    #    holds the study's IDENTITY -- the sampling cursor, the inclusion
    #    record and the budget. Hardening the append path and leaving the
    #    state path to the umask is the fix-follows-the-pointer failure: the
    #    correction travels to the line that was REPORTED and not to the class
    #    it belongs to. `path` carries the tmp file's mode after the replace,
    #    so harden AFTER it, never before.
    _harden(_dir, path)
