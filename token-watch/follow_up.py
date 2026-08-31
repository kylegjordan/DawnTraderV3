"""
token-watch — the follow-up scheduler. (OBJ-4, OBJ-5)

Runs hourly. Reads THIS hour's due bucket, observes each token still alive,
records the observation, and on death records the class and stops.

★ IT OPENS EXACTLY ONE SMALL FILE. The due queue is bucketed by hour at write
  time, so there is no index scan over ~1.86M census rows — which is what
  protects the 2-core box the co-tenancy clause is about.

⛔ ONE OF TWO SHIPPED PERIODIC JOBS over one store (the other is tiering; two
  more are designed and not built), so it takes the exclusive lock and SKIPS if
  another job holds it. Skipping is correct: the grid is fixed ages
  from creation, so a checkpoint missed by an hour is a late observation, while
  two jobs interleaving would be a corrupt one.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timedelta, timezone

import liveness
import promote
import summary
import budget
import providers
from store import (
    _append as store_append,
    dead_set,
    due_path,
    due_now,
    due_indexed as store_due_indexed,
    ensure_dirs,
    load_state,
    periodic_lock,
    record_death,
    record_observation,
    save_state,
)

UTC = timezone.utc
LOG = logging.getLogger("token-watch.follow_up")


def classify_death(state: dict, previous: dict | None) -> str | None:
    """★ DEATH IS RECORDED, NOT INFERRED, and the class is defined EX ANTE.

    'faded'           — volume decays to nil while a pool still exists.
    'liquidity_pulled' — liquidity removed; the pool is gone or emptied.

    Both end at zero, so a win/lose column would treat them identically — but
    they may differ ON DAY ONE, and that difference is a primary object of the
    study rather than a footnote.

    ⚠️ Returns None when the evidence does not distinguish them. NOT guessing
       is the point: a misclassified death is worse than an unclassified one,
       because it enters the analysis wearing a class it never earned.
    """
    if state.get("alive"):
        return None
    if state.get("evidence") == "no_pairs_returned":
        # ⚠️ NO PAIR IS AMBIGUOUS: it is what a pulled pool looks like AND what
        # an indexing gap looks like. If we ever saw a pool for this token,
        # its disappearance is evidence; if we never did, it is not.
        return "liquidity_pulled" if previous and previous.get("pairs") else None
    liq = state.get("liquidity_usd")
    if liq is not None and float(liq) <= 0:
        return "liquidity_pulled"
    if (state.get("volume_h24") or 0) <= 0:
        return "faded"
    return None


# ⛔ CATCH-UP BOUND. A long outage must not make one run try to observe days of
#    backlog: that would blow the lock's staleness window and get the lock
#    stolen mid-run. Anything older is left in place and COUNTED, so the gap is
#    a reported number rather than a silence.
CATCHUP_MAX_BUCKETS = 48


def _last_consumed(now):
    """The last hour-bucket this job finished, or None on a first run.

    ⛔ None IS NOT `now - 1h`. Collapsing them is what made the two cases
       indistinguishable below.
    """
    st = load_state("follow_up_cursor", {})
    v = st.get("last_bucket")
    if not v:
        return None
    try:
        return datetime.strptime(v, "%Y-%m-%dT%H").replace(tzinfo=UTC)
    except ValueError:
        return None


def _buckets_to_read(now):
    """Every unread bucket from the cursor up to and including this hour.

    ⛔ THREE DISTINCT CASES, and the first version collapsed two of them.
       It ended `return out or [cur]`, so "no unread buckets" fell through to
       "read this hour again" — and re-reading a consumed bucket RE-OBSERVES
       entries already observed, RE-APPENDS every not-yet-due entry to the
       next bucket (the original is deliberately left in place), and SPENDS
       THE LIQUIDITY CARVE TWICE.
    ★ Langston: *"I could not get the lock" and "I did the work" must never be
      the same code path* — this was that, one file over, in the fix I wrote
      for it.

      first run (no cursor) -> [this hour] only. NOT all of history.
      cursor behind         -> every unread bucket, bounded.
      cursor current        -> [] . Reading nothing is the correct answer.
    """
    cur = now.replace(minute=0, second=0, microsecond=0)
    last = _last_consumed(now)
    if last is None:
        return [cur]
    start = last + timedelta(hours=1)
    out = []
    while start <= cur and len(out) < CATCHUP_MAX_BUCKETS:
        out.append(start)
        start += timedelta(hours=1)
    return out


def _buckets_too_old(now):
    """How many buckets the bound left behind. Reported, never silent."""
    last = _last_consumed(now)
    if last is None:
        return 0
    start = last + timedelta(hours=1)
    cur = now.replace(minute=0, second=0, microsecond=0)
    total = 0
    while start <= cur:
        total += 1
        start += timedelta(hours=1)
    return max(0, total - CATCHUP_MAX_BUCKETS)


def _open_hour(now):
    """The hour still being written to. It is never safe to consume."""
    return now.replace(minute=0, second=0, microsecond=0)


def _marks():
    st = load_state("follow_up_cursor", {})
    m = st.get("marks")
    return m if isinstance(m, dict) else {}


def _resume_line(bucket):
    """How far into THIS bucket a previous run got.

    ⛔ THE MARK MUST SURVIVE THE ROLLOVER, AND MY FIRST VERSION DID NOT.
       It keyed the resume point on "the hour that is open NOW", so the moment
       hour 12 stopped being open its mark was discarded and the next run
       re-read bucket 12 from line 0 -- RE-OBSERVING every entry already done
       and spending the liquidity carve twice. That is the double-spend the
       old consume-the-bucket behaviour avoided, reintroduced by the fix for
       the dropped checkpoints. Caught by the test, not by review.
    ⇒ marks are keyed BY BUCKET, so a partially-read hour resumes correctly
      whether it is still open or has since elapsed.
    """
    try:
        return int(_marks().get(bucket.strftime("%Y-%m-%dT%H")) or 0)
    except (TypeError, ValueError):
        return 0

def _entries_across(buckets, now):
    """Yield (bucket, line_index, entry), resuming inside any partly-read hour.

    ⛔ THE OPEN HOUR IS READ BUT NEVER CONSUMED. An elapsed hour is finished by
       definition -- nothing can be appended to an hour that has passed. The
       open one keeps filling while we read it, so declaring it done is how
       1,130 checkpoints were dropped on 2026-08-31 with no record at all.
    """
    for b in buckets:
        for idx, e in store_due_indexed(b, _resume_line(b)):
            yield b, idx, e

def _advance_cursor(buckets, now, marks):
    """Advance ONLY over hours that have fully elapsed, keeping resume marks.

    ⛔ THE OLD VERSION ADVANCED TO `max(buckets)`, WHICH INCLUDED THE CURRENT
       HOUR -- so an hour was declared finished while it was still filling.
    ⚠️ The advance-even-on-a-quiet-hour behaviour is KEPT for ELAPSED hours: a
       run that read nothing must still move past hours that are genuinely
       empty, or every later run re-walks them forever.
    ★ MARKS ARE PRUNED to the buckets at or after the cursor. An unpruned map
      would grow one key per hour forever inside a state file that is loaded
      and re-serialised whole every run -- the same unbounded-state defect
      already fixed once in this file for `last_seen`.
    """
    open_h = _open_hour(now)
    elapsed = [b for b in (buckets or []) if b < open_h]
    last = max(elapsed) if elapsed else (open_h - timedelta(hours=1))
    prev = _last_consumed(now)
    if prev is not None and prev > last:
        last = prev                    # never move the cursor BACKWARDS
    keep = {}
    for k, v in dict(marks).items():
        try:
            when = datetime.strptime(k, "%Y-%m-%dT%H").replace(tzinfo=UTC)
        except ValueError:
            continue
        if when >= last:               # anything older can never be re-read
            keep[k] = int(v)
    save_state("follow_up_cursor",
               {"last_bucket": last.strftime("%Y-%m-%dT%H"), "marks": keep})

def _append_next_bucket(entry: dict, now: datetime) -> None:
    """Move a not-yet-due entry into the next hour's bucket.

    An append, like everything else in this store — the original entry stays
    where it was, so the schedule remains auditable after the fact.
    """
    store_append(due_path(now + timedelta(hours=1)), entry)


def run_hour(now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    ensure_dirs()
    # ⛔ EVERY KEY PRESENT ON EVERY PATH. A fresh reader pointed out that
    #    `skipped` existed only on the skip branch — reintroducing exactly the
    #    absent-as-valid shape record_observation forbids for `observed`: a
    #    reader would need a default to interpret its absence.
    stats = {"due": 0, "observed": 0, "dead": 0, "shed": 0, "unclassified": 0,
             "errors": 0, "skipped": False, "folded_spend_rows": 0,
             "last_seen_pruned": 0, "unclassified_by_age": {},
             "requeued_not_yet_due": 0, "buckets_read": 0,
             "buckets_skipped_too_old": 0}

    # ⛔ THE DEAD-MAN'S SWITCH RUNS BEFORE THE LOCK, AND DELIBERATELY OUTSIDE
    #    IT. A watchdog that a stuck lock can silence is not a watchdog — the
    #    skip branch below returns early, so putting this inside would mean a
    #    permanently-held lock disables the very check whose job is to notice
    #    that nothing is happening. That is the failure this batch keeps
    #    paying for, one layer up.
    # ⚠️ THE TRADE, STATED: it reads the append-only census (safe to read
    #    concurrently) and writes only its own state and gap files. Two
    #    overlapping passes could at worst duplicate a gap record — VISIBLE,
    #    and cheaply de-duplicated at analysis time on (started_at, ended_at).
    #    A silenced watchdog is not visible at all. The asymmetry decides it.
    try:
        stats["liveness"] = liveness.check(now)
    except Exception as exc:                       # never let it fail the hour
        LOG.error("liveness check failed: %s", exc)
        stats["liveness"] = {"error": str(exc)}

    with periodic_lock("follow_up") as held:
        if not held:
            # ⛔ NOT the same code path as "did the work". A skipped cycle must
            # be visible, or a permanently-stuck lock reads as a quiet market.
            LOG.warning("another periodic job holds the lock — cycle SKIPPED, not performed")
            stats["skipped"] = True
            # ⚠️ AND NO BURN CHECK RUNS ON THIS PATH — the return is before it.
            #    That is stated rather than hidden: a skipped hour is an hour
            #    with no budget projection, which matters if skips persist.
            return stats

        # ★ FOLD THE RECEIVER'S JOURNAL FIRST, inside the lock. This is the
        # only place birth spend enters the ledger, so the burn monitor below
        # is reading a total that includes the 776,000-credit leg. Before
        # BLOCKER-1 was fixed it was reading liquidity only, which capped the
        # visible total at the 200k carve and made both burn thresholds
        # unreachable.
        folded = budget.fold_pending(now)
        stats["folded_spend_rows"] = folded["folded"]

        prev = load_state("last_seen", {})
        unclassified_by_age = {}

        # ⛔ CATCH UP ON UNREAD BUCKETS — BLOCKER-3 was only half-fixed, and a
        #    fresh reader executed the other half. The write side now records
        #    past grid points as misses; the READ side still consumed exactly
        #    one bucket, so a missed run (a held lock, a service failure, an
        #    outage) orphaned that whole hour: no miss row, no counter, no log,
        #    exit 0 — indistinguishable from an hour with nothing due.
        # ★ AND THE UNIT FILE MADE IT READ AS COVERED FROM BOTH SIDES: the
        #   timer's Persistent=true fires once on resume, and "once" against a
        #   one-bucket reader is not catch-up. I cited that fact while fixing
        #   only the writer.
        # ⚠️ BOUNDED at CATCHUP_MAX_BUCKETS: an unbounded catch-up after a long
        #   outage would try to observe days of backlog in one run and blow the
        #   lock's staleness window. Anything older is left in place and
        #   COUNTED, so the gap is visible rather than silently skipped.
        buckets = _buckets_to_read(now)
        stats["buckets_read"] = len(buckets)
        stats["buckets_skipped_too_old"] = _buckets_too_old(now)
        marks = dict(_marks())
        for _b, _idx, entry in _entries_across(buckets, now):
            stats["due"] += 1
            # ⛔ HIGH-WATER MARK FOR THE OPEN HOUR, ADVANCED PER ENTRY REACHED --
            #    never per entry SUCCEEDED. A shed and an error are both entries
            #    this run consumed; leaving them behind the mark would make the
            #    next run re-observe them and spend the liquidity carve twice,
            #    which is the double-spend the old comment warned about.
            _k = _b.strftime("%Y-%m-%dT%H")
            marks[_k] = max(int(marks.get(_k) or 0), _idx + 1)
            mint, age = entry["mint"], entry["age"]

            # ⛔ NEVER OBSERVE EARLY. The job reads a whole hour-bucket at the
            #    top of the hour, but entries inside it are due at different
            #    minutes — so without this check a token born at :55 has its
            #    "1h" checkpoint read at :02 the next hour, i.e. AT SEVEN
            #    MINUTES OF AGE. Measured across the hour: 60, 52, 32, 7 and 3
            #    minutes for tokens born at :02, :10, :30, :55 and :59.
            # ★ THAT IS WORSE THAN LATE, AND NOT SYMMETRICALLY SO. With 68.67%
            #   dying on day one, a token read at 3 minutes looks alive, the
            #   entry is consumed, and the real 1h checkpoint never happens —
            #   the observation is not just noisy, it is spent.
            # ⇒ re-queue to the next bucket. Observations become
            #   LATE-BUT-NEVER-EARLY, and the true age is always recoverable
            #   from created_at and observed_at.
            due_at = entry.get("due_at")
            if due_at and due_at > now.isoformat():
                _append_next_bucket(entry, now)
                stats["requeued_not_yet_due"] += 1
                continue
            try:
                state = providers.token_state(mint)
            except providers.Shed as s:
                # The shed order firing is an EVENT, recorded as an
                # observation that did not happen. A silent skip and a
                # completed call must never look the same in the record.
                stats["shed"] += 1
                record_observation(mint, age, now, {"shed": str(s), "observed": False})
                continue
            except Exception:
                stats["errors"] += 1
                LOG.exception("observation failed for %s at %s", mint, age)
                continue

            fields = dict(state)
            fields["observed"] = True

            # Liquidity is read on-chain ONLY where the free leg cannot supply
            # it — a bonding-curve pool reports no liquidity figure. This is
            # the first leg to shed, and it sheds without touching births.
            if state.get("alive") and state.get("liquidity_usd") is None:
                try:
                    fields["chain_liquidity"] = providers.pool_liquidity(mint)
                except providers.Shed:
                    stats["shed"] += 1
                    fields["chain_liquidity"] = {"shed": True}
                except Exception as e:
                    # ⛔ A FAILED READ MUST NOT LOOK LIKE A READ THAT WAS NEVER
                    #    DUE. Previously this branch wrote nothing, so the key
                    #    was simply absent — identical on disk to the case
                    #    where the guard above decided no read was needed. A
                    #    bad key or an RPC change would then be invisible in
                    #    the observation stream, which is the discrimination
                    #    the Shed marker exists to preserve, one branch over.
                    LOG.exception("liquidity read failed for %s", mint)
                    fields["chain_liquidity"] = {"error": type(e).__name__}

            record_observation(mint, age, now, fields)
            stats["observed"] += 1

            if not state.get("alive"):
                cls = classify_death(state, prev.get(mint))
                if cls:
                    record_death(mint, now, cls, age,
                                 {k: state.get(k) for k in
                                  ("volume_h24", "liquidity_usd", "pairs", "evidence")},
                                 created_at=entry.get("created_at"))
                    stats["dead"] += 1
                else:
                    # Ambiguous: it stays in the schedule. A token wrongly
                    # tombstoned is never re-checked, which is unrecoverable —
                    # so ambiguity costs one more observation, not a record.
                    stats["unclassified"] += 1
                    unclassified_by_age[age] = unclassified_by_age.get(age, 0) + 1
            prev[mint] = {"pairs": state.get("pairs"), "alive": state.get("alive")}

        # ⛔ ADVANCE OVER ELAPSED HOURS ONLY -- THIS COMMENT USED TO SAY THE
        #    OPPOSITE, AND THE CODE USED TO DO IT. 'Advance to THIS hour
        #    regardless' is what dropped 1,130 of bucket 18's 2,375
        #    checkpoints on 2026-08-31: the hour was declared consumed while
        #    it was still being appended to, and those entries left NO RECORD
        #    AT ALL -- not even a shed row, which is what makes a dropped
        #    checkpoint strictly worse than a shed one.
        # ★ The half that was RIGHT is kept: a quiet ELAPSED hour is still a
        #   consumed hour, or every later run re-walks it forever. Only the
        #   OPEN hour is exempt, and it carries a line high-water mark so the
        #   next run resumes instead of re-observing.
        _advance_cursor(buckets, now, marks)
        dead = dead_set()
        before = len(prev)
        prev = {m: v for m, v in prev.items() if m not in dead}
        stats["last_seen_pruned"] = before - len(prev)
        stats["unclassified_by_age"] = unclassified_by_age
        save_state("last_seen", prev)
        # A quantified residual beats a stated one: the one-directional
        # under-count of `liquidity_pulled` is now countable per age label
        # rather than described in a document.
        if unclassified_by_age:
            un = load_state("unclassified", {})
            for age, c in unclassified_by_age.items():
                un[age] = un.get(age, 0) + c
            save_state("unclassified", un)

        # ⛔ THE SOCIALS SWEEP (#973). The webhook's creation event carries no
        #    social fields, so the trait definition's first limb was dead and
        #    the study had silently degraded to size-only. This reads the
        #    channels off the follow-up response we already fetch — free — and
        #    promotes anything that qualifies. Inside the lock: it appends to
        #    the store and rewrites its own cursor state.
        try:
            stats["promote"] = promote.run(now)
        except Exception as exc:
            LOG.error("socials sweep failed: %s", exc)
            stats["promote"] = {"error": str(exc)}

        # ⛔ THE PUBLISHED SUMMARY — INSIDE the lock, unlike the dead-man's
        #    switch above. It uses save_state, which is read-modify-write, and
        #    store.py's own rule is that every such caller holds the lock. The
        #    switch is outside because a stuck lock must never silence a
        #    watchdog; a summary is not a watchdog, and a skipped refresh is
        #    visible on the page as a stale `generated_at`.
        try:
            stats["summary"] = {k: v for k, v in summary.build(now).items()
                                if k in ("generated_at",)}
        except Exception as exc:
            LOG.error("summary build failed: %s", exc)
            stats["summary"] = {"error": str(exc)}

    LOG.info("follow-up %s", stats)
    burn = budget.burn_report(now)
    if burn["level"]:
        LOG.warning("BURN %s — projected %s of %s (binding leg: %s), shedding=%s",
                    burn["level"], burn["projected"], budget.MONTHLY_CREDIT_CAP,
                    burn["binding_leg"], burn["shedding"])
    return stats


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO,
                        format="%(asctime)s %(levelname)s %(name)s %(message)s")
    result = run_hour()
    # ⛔ A SKIPPED CYCLE MUST NOT EXIT 0. Under a oneshot unit, systemd records
    #    a skipped hour and a completed hour IDENTICALLY on a zero exit — so a
    #    lock wedged by a hung tiering run would show a clean success every
    #    hour while no spend was folded and no burn check ran. The log line was
    #    right and did not reach the exit code, which is what a supervisor
    #    actually reads. Found by a fresh reader.
    if result.get("skipped"):
        sys.exit(75)          # EX_TEMPFAIL — retry-able, not a crash
    sys.exit(1 if result.get("errors") else 0)
