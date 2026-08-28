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

import budget
import providers
from store import (
    _append as store_append,
    dead_set,
    due_path,
    due_now,
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
             "requeued_not_yet_due": 0}

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
        for entry in due_now(now):
            stats["due"] += 1
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
                    record_death(mint, now, cls, age, {k: state.get(k) for k in
                                                       ("volume_h24", "liquidity_usd", "pairs", "evidence")})
                    stats["dead"] += 1
                else:
                    # Ambiguous: it stays in the schedule. A token wrongly
                    # tombstoned is never re-checked, which is unrecoverable —
                    # so ambiguity costs one more observation, not a record.
                    stats["unclassified"] += 1
                    unclassified_by_age[age] = unclassified_by_age.get(age, 0) + 1
            prev[mint] = {"pairs": state.get("pairs"), "alive": state.get("alive")}

        # ⛔ PRUNE `last_seen` AGAINST THE TOMBSTONES — Langston, Step-4 item 5,
        # and he is right that this is the defect I had just fixed one file
        # over and left standing here. Unpruned it holds every followed mint
        # ever observed (~417,600 by day 90 on our own expected rates), loaded
        # and re-serialised WHOLE every hour — while `dead_set` correctly stops
        # re-checking those same mints. The dead can never appear again, so
        # keeping their last-seen state buys nothing and costs the whole file.
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
