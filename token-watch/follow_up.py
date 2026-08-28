"""
token-watch — the follow-up scheduler. (OBJ-4, OBJ-5)

Runs hourly. Reads THIS hour's due bucket, observes each token still alive,
records the observation, and on death records the class and stops.

★ IT OPENS EXACTLY ONE SMALL FILE. The due queue is bucketed by hour at write
  time, so there is no index scan over ~1.86M census rows — which is what
  protects the 2-core box the co-tenancy clause is about.

⛔ ONE OF FOUR SCHEDULERS OVER ONE STORE, so it takes the exclusive lock and
  SKIPS if another job holds it. Skipping is correct: the grid is fixed ages
  from creation, so a checkpoint missed by an hour is a late observation, while
  two jobs interleaving would be a corrupt one.
"""

from __future__ import annotations

import logging
import sys
from datetime import datetime, timezone

import budget
import providers
from store import (
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


def run_hour(now: datetime | None = None) -> dict:
    now = now or datetime.now(UTC)
    ensure_dirs()
    stats = {"due": 0, "observed": 0, "dead": 0, "shed": 0, "unclassified": 0, "errors": 0}

    with periodic_lock("follow_up") as held:
        if not held:
            # ⛔ NOT the same code path as "did the work". A skipped cycle must
            # be visible, or a permanently-stuck lock reads as a quiet market.
            LOG.warning("another periodic job holds the lock — cycle SKIPPED, not performed")
            stats["skipped"] = True
            return stats

        prev = load_state("last_seen", {})
        for entry in due_now(now):
            stats["due"] += 1
            mint, age = entry["mint"], entry["age"]
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
                except Exception:
                    LOG.exception("liquidity read failed for %s", mint)

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
            prev[mint] = {"pairs": state.get("pairs"), "alive": state.get("alive")}

        save_state("last_seen", prev)

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
    sys.exit(0 if not result.get("errors") else 1)
