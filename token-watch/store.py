"""
token-watch — the store.

APPEND-ONLY FILES. No database, no server, one writer per stream. That is the
resource bound stated in the scope §0 (co-tenancy), not an aesthetic choice:
this process shares a 2-core box with the Discord bridges and the reviewer.

★ THE CENSUS QUESTIONS, ANSWERED IN CODE RATHER THAN IN A DOCUMENT (§9.5(a),
  answered at DESIGN time because that is the only time it is cheap):

    who WRITES/CREATES here?  -> exactly one: record_birth(), from the receiver
    who READS here?           -> three: the follow-up scheduler, the coverage
                                 audit, the summary publisher
    who MUTATES here?         -> exactly one: record_observation() APPENDS.
                                 Birth records are never modified.
    ★ who DELETES here?       -> exactly one: tier.py, and ONLY bulky payload
                                 past its hot window.
                                 ⛔ BIRTH RECORDS ARE DELETED BY NOTHING, EVER.
    who SCHEDULES here?       -> four: follow-up, coverage audit, summary
                                 publisher, tiering. FOUR schedulers over one
                                 store on two cores REQUIRE mutual exclusion,
                                 so all four take periodic_lock().

⚠️ The one-writer rule is enforced by SHAPE, not by discipline: the receiver is
   the only module that calls record_birth(), and every periodic job is
   serialised behind a single lock. Two jobs cannot interleave a read-modify
   cycle because no job does one — every write is an append.
"""

from __future__ import annotations

import json
import os
import time
from contextlib import contextmanager
from datetime import datetime, timedelta, timezone

from config import (
    BIRTHS_DIR,
    COLD_DIR,
    DUE_DIR,
    GRID,
    GRID_LABELS,
    LOCK_PATH,
    OBSERVATIONS_DIR,
    PAYLOAD_DIR,
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
        PAYLOAD_DIR,
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
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(record, separators=(",", ":"), sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


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
# one component. We have four.
# ─────────────────────────────────────────────────────────────────────────────
@contextmanager
def periodic_lock(holder: str, wait: bool = False):
    """Exclusive lock for the four periodic jobs.

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
    socials: dict,
    followed: bool,
    follow_reason: str,
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
        "created_at": created_at.astimezone(UTC).isoformat(),
        "first_seen_at": first_seen_at.astimezone(UTC).isoformat(),
        "discovery_lag_s": (first_seen_at - created_at).total_seconds(),
        "venue": venue,
        "initial_size": initial_size,
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
    for delta, label in zip(GRID, GRID_LABELS):
        due = created_at.astimezone(UTC) + delta
        _append(due_path(due), {"mint": mint, "age": label, "due_at": due.isoformat()})


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


def record_death(mint: str, when: datetime, death_class: str, age_label: str, evidence: dict) -> None:
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
            "evidence": evidence,
        },
    )


_DEAD_CACHE = {"mtime": None, "set": set()}


def dead_set() -> set:
    """Dead mints, cached on the tombstone file's mtime.

    The cache is invalidated by mtime rather than by a timer, so a death
    recorded by this same process is visible to the next lookup within it.
    """
    path = tombstone_path()
    if not os.path.exists(path):
        return set()
    mtime = os.path.getmtime(path)
    if _DEAD_CACHE["mtime"] != mtime:
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
    rec = {"mint": mint, "age": age_label, "observed_at": when.astimezone(UTC).isoformat()}
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
    os.makedirs(os.path.dirname(path), exist_ok=True)
    tmp = path + ".tmp"
    with open(tmp, "w", encoding="utf-8") as fh:
        json.dump(value, fh, sort_keys=True)
        fh.flush()
        os.fsync(fh.fileno())
    os.replace(tmp, path)
