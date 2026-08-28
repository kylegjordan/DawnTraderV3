"""
token-watch — credit budget, shed order, burn monitor. (OBJ-9)

★ WHY OBJ-9 EXISTS AT ALL: it protects OBJ-1. Two legs draw on one 1M/month
  allowance — births (irreplaceable) and liquidity reads (valuable but
  discretionary). Without an enforced order, the DISCRETIONARY leg can
  silently exhaust the budget and starve the IRREPLACEABLE one. That was
  BLOCKER-1 of the r1→r2 review, and it is a real failure mode rather than a
  hypothetical: the loss is silent and permanent.

⛔ THE SHED ORDER IS ENFORCED HERE, IN CODE. Births are never shed.
⛔ AND IT IS A HARD CLOSE CONDITION THAT THIS IS OBSERVED FIRING under a
  deliberate over-budget injection — Langston: "an unverified guard on an
  irreversible silent loss is not a guard." "It ran 72 hours and never fired"
  is absence of opportunity, not evidence of capability. See
  tests/test_shed_order.py, which drives the budget past the threshold on
  purpose.
"""

from __future__ import annotations

from datetime import datetime, timedelta, timezone

from config import (
    BIRTHS_RESERVED,
    BURN_CRITICAL_FRACTION,
    BURN_PEAK_WINDOW,
    BURN_TRAILING_WINDOW,
    BURN_WARN_FRACTION,
    CREDITS,
    LIQUIDITY_AUDIT_CARVE,
    MONTHLY_CREDIT_CAP,
    NEVER_SHED,
    SHED_ORDER,
)
from store import load_state, save_state

UTC = timezone.utc
STATE = "budget"


def _month_key(when: datetime) -> str:
    return when.astimezone(UTC).strftime("%Y-%m")


def _blank(month: str) -> dict:
    return {"month": month, "spent": {"birth": 0, "follow_up": 0, "liquidity": 0}, "events": []}


def _load(now: datetime) -> dict:
    month = _month_key(now)
    st = load_state(STATE, _blank(month))
    if st.get("month") != month:
        # New month: the allowance resets. Start clean rather than carrying a
        # stale denominator — a spend figure against the wrong month is the
        # wrong-object failure with a plausible number attached.
        st = _blank(month)
    return st


def charge(kind: str, n: int, now: datetime | None = None) -> None:
    """Record n calls of a kind. Called AFTER the work, never before —
    charging first and failing second would over-report spend and shed early.
    """
    assert kind in CREDITS, kind
    now = now or datetime.now(UTC)
    st = _load(now)
    st["spent"][kind] = st["spent"].get(kind, 0) + n * CREDITS[kind]
    st["events"].append({"ts": now.isoformat(), "kind": kind, "n": n})
    # Keep only what the burn monitor's widest window needs, plus margin.
    cutoff = (now - BURN_TRAILING_WINDOW * 2).isoformat()
    st["events"] = [e for e in st["events"] if e["ts"] >= cutoff]
    save_state(STATE, st)


def spent_total(now: datetime | None = None) -> int:
    st = _load(now or datetime.now(UTC))
    return sum(st["spent"].values())


def spent_by(kind: str, now: datetime | None = None) -> int:
    return _load(now or datetime.now(UTC))["spent"].get(kind, 0)


def allowed(kind: str, now: datetime | None = None) -> bool:
    """★ THE SHED DECISION. The whole guard is these few lines, and it is
    deliberately small enough to read in one go.

    BIRTHS: always allowed, unconditionally, no threshold anywhere in the
    path. There is no state of the budget in which a birth is refused —
    because a missing birth record destroys the denominator of every rate in
    the study, and §5 measures reconstruction as unaffordable at every tier.

    LIQUIDITY: sheds FIRST, once total spend would breach the births reserve.
    FOLLOW_UP: sheds SECOND. It costs 0 credits (it runs on the free
    aggregator), so in practice it sheds only if that leg is ever re-homed
    onto the paid provider — the ordering is encoded now so a later change
    cannot quietly invert it.
    """
    now = now or datetime.now(UTC)
    if kind in NEVER_SHED:
        return True

    total = spent_total(now)
    headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED  # what non-birth legs may use
    if kind == "liquidity":
        # The carve is the tighter of the two bounds: the explicit ≤200k carve,
        # and whatever remains before the births reserve is touched.
        return spent_by("liquidity", now) < LIQUIDITY_AUDIT_CARVE and total < headroom + BIRTHS_RESERVED
    if kind == "follow_up":
        return total < MONTHLY_CREDIT_CAP
    return True


def shed_now(now: datetime | None = None) -> list:
    """Which legs are currently shedding, in order. Used by the runner to log
    the transition, so a shed is an observable EVENT rather than a silence.
    """
    now = now or datetime.now(UTC)
    return [k for k in SHED_ORDER if not allowed(k, now)]


# ─────────────────────────────────────────────────────────────────────────────
# BURN MONITOR
# ★ TWO PROJECTIONS, ALERT ON WHICHEVER EXHAUSTS SOONER.
#   Langston, unprompted, and he is right that this is the trap: "a monitor
#   projecting off a trailing mean is blind in the same direction as the
#   budget, and will under-project during exactly the launch-rate spike that
#   causes the exhaustion." The peak leg exists specifically to see the spike
#   the mean averages away.
# ─────────────────────────────────────────────────────────────────────────────
def _rate_per_hour(events, since: datetime, until: datetime) -> float:
    """Spend per hour over a HALF-OPEN window [since, until).

    ⚠️ The half-open bound is not a detail. The first version used `<=` at both
    ends, so an event landing exactly on a bucket boundary was counted in TWO
    adjacent buckets — which doubled the apparent peak on a perfectly flat
    series and made the peak leg bind when there was no spike at all. It fails
    safe (it alerts early), which is exactly why it would have survived: an
    over-eager burn alarm looks like caution rather than like a bug, right up
    until nobody believes it. Caught by the flat-series positive control.
    """
    hours = max((until - since).total_seconds() / 3600.0, 1e-9)
    lo, hi = since.isoformat(), until.isoformat()
    spend = sum(e["n"] * CREDITS[e["kind"]] for e in events if lo <= e["ts"] < hi)
    return spend / hours


def burn_report(now: datetime | None = None) -> dict:
    """Project month-end spend from BOTH a trailing rate and the peak hour.

    Returns the projection that exhausts SOONER, plus both legs so the reader
    can see which one fired. Reporting only the binding leg would hide whether
    we are in a sustained overspend or a spike.
    """
    now = now or datetime.now(UTC)
    st = _load(now)
    events = st["events"]
    total = sum(st["spent"].values())

    trailing = _rate_per_hour(events, now - BURN_TRAILING_WINDOW, now)

    # Peak hour within the trailing window — the highest single-hour spend.
    peak = 0.0
    step = BURN_PEAK_WINDOW
    cursor = now - BURN_TRAILING_WINDOW
    while cursor < now:
        peak = max(peak, _rate_per_hour(events, cursor, cursor + step))
        cursor += step

    # Hours remaining in the calendar month.
    if now.month == 12:
        nxt = now.replace(year=now.year + 1, month=1, day=1, hour=0, minute=0, second=0, microsecond=0)
    else:
        nxt = now.replace(month=now.month + 1, day=1, hour=0, minute=0, second=0, microsecond=0)
    hours_left = max((nxt - now).total_seconds() / 3600.0, 0.0)

    proj_trailing = total + trailing * hours_left
    proj_peak = total + peak * hours_left
    projected = max(proj_trailing, proj_peak)  # whichever exhausts sooner

    level = None
    if projected >= MONTHLY_CREDIT_CAP * BURN_CRITICAL_FRACTION:
        level = "critical"
    elif projected >= MONTHLY_CREDIT_CAP * BURN_WARN_FRACTION:
        level = "warning"

    return {
        "now": now.isoformat(),
        "spent_total": total,
        "spent_by": dict(st["spent"]),
        "rate_trailing_per_hour": round(trailing, 2),
        "rate_peak_per_hour": round(peak, 2),
        "hours_left_in_month": round(hours_left, 1),
        "projected_trailing": round(proj_trailing),
        "projected_peak": round(proj_peak),
        "projected": round(projected),
        "binding_leg": "peak" if proj_peak >= proj_trailing else "trailing",
        "level": level,
        "shedding": shed_now(now),
    }


def inject_spend(kind: str, credits: int, now: datetime | None = None) -> None:
    """⛔ TEST-ONLY: drive the budget artificially, to make the shed order FIRE.

    This exists because the batch's hard close condition requires OBSERVING
    the shed, and a guard that has never had the opportunity to fire is
    untested. It writes the same state the real path writes, so the test
    exercises the real decision function rather than a mock of it.
    """
    now = now or datetime.now(UTC)
    st = _load(now)
    st["spent"][kind] = st["spent"].get(kind, 0) + credits
    st["events"].append({"ts": now.isoformat(), "kind": kind, "n": credits // max(CREDITS[kind], 1)})
    save_state(STATE, st)
