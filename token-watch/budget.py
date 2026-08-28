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
  `tests/test_collector.py` section 4, which drives the budget past the
  threshold on purpose.
  ⚠️ THAT CITATION PREVIOUSLY NAMED `tests/test_shed_order.py`, WHICH HAS
     NEVER EXISTED. A pointer to a non-existent test reads as coverage, which
     is the same absent-as-valid failure this file is full of warnings about —
     found by a fresh reader, not by me re-reading my own module.

★ HOW SPEND IS RECORDED, AND WHY IT IS NOT A DIRECT WRITE (Langston BLOCKER-1
  and BLOCKER-2 together — they have ONE fix, not two):

  BLOCKER-1 was that nothing in production ever charged a birth. The ledger
  sat at zero for the 776,000-credit leg, so BURN_WARN (800k) and
  BURN_CRITICAL (900k) were arithmetically unreachable: we would have hit the
  provider's real wall with the monitor reading 20% and level=None. The thing
  OBJ-9 exists to watch was the thing it could not see.

  BLOCKER-2 was that the obvious fix makes it worse. The receiver runs
  continuously and the periodic jobs run hourly; both would then read-modify-
  write one budget file with no mutual exclusion, and lost updates land on the
  exact counter the shed order reads.

  ⇒ THE RECEIVER NEVER WRITES BUDGET STATE. It APPENDS to a journal, and the
  locked periodic jobs fold that journal into the ledger. The hot path stays
  append-only and lock-free; every read-modify-write stays inside the lock.
  The fold is idempotent by byte offset, so a crash mid-fold double-counts
  nothing and loses nothing.
"""

from __future__ import annotations

import json
import logging
import os
from datetime import datetime, timedelta, timezone

from config import (
    BIRTHS_RESERVED,
    BURN_CRITICAL_FRACTION,
    BURN_PEAK_WINDOW,
    BURN_TRAILING_WINDOW,
    BURN_WARN_FRACTION,
    SPIKE_HORIZON,
    CREDITS,
    LIQUIDITY_AUDIT_CARVE,
    MONTHLY_CREDIT_CAP,
    NEVER_SHED,
    SHED_ORDER,
    STATE_DIR,
)
from store import load_state, save_state

UTC = timezone.utc
STATE = "budget"
LOG = logging.getLogger("token-watch.budget")


def _month_key(when: datetime) -> str:
    return when.astimezone(UTC).strftime("%Y-%m")


def _blank(month: str) -> dict:
    return {"month": month, "spent": {"birth": 0, "follow_up": 0, "liquidity": 0},
            "events": [], "journal_offset": 0}


def _load(now: datetime) -> dict:
    month = _month_key(now)
    st = load_state(STATE, _blank(month))
    if st.get("month") != month:
        # New month: the allowance resets. Start clean rather than carrying a
        # stale denominator — a spend figure against the wrong month is the
        # wrong-object failure with a plausible number attached.
        # ★ AND `journal_offset` RESETTING TO 0 IS NOW CORRECT rather than
        #   catastrophic, because the journal is per-month: offset 0 is the
        #   true start of a NEW file, not a replay of the old one. With a
        #   single journal this same line re-folded the entire previous month.
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


# ─────────────────────────────────────────────────────────────────────────────
# THE JOURNAL — the receiver's lock-free, append-only spend path.
# ─────────────────────────────────────────────────────────────────────────────
def journal_path(now: datetime | None = None) -> str:
    """⛔ ONE JOURNAL PER CALENDAR MONTH, and that is a correctness fix rather
    than housekeeping.

    THE DEFECT IT REPLACES, found by a fresh reader who EXECUTED it rather than
    reasoning about it: the ledger resets on a month boundary, and the reset
    included `journal_offset`. With a single perpetual journal file that meant the
    offset went back to 0 on the 1st and THE ENTIRE PREVIOUS MONTH WAS RE-FOLDED
    into the new month's ledger. At ~620-776k birth credits/month, month two
    opens near the cap and month three opens ABOVE it — after which
    `remaining > 0` is false forever, both discretionary legs shed permanently,
    and the burn monitor reads critical permanently. The inclusion tallies —
    the pre-registered weighting denominator — double-count the same way.

    ★ A per-month file makes the reset CORRECT BY CONSTRUCTION: a new month is
      a new file, so offset 0 is the true start rather than a replay. It also
      bounds the file's growth, which the single-file version never did.
    """
    now = now or datetime.now(UTC)
    return f"{STATE_DIR}/spend-journal-{_month_key(now)}.jsonl"


def record_pending(kind: str, n: int, now: datetime | None = None, **extra) -> None:
    """Called by the RECEIVER, on the hot path. Append only — never touches
    budget state, never takes a lock, so it cannot lose an update against the
    hourly job and cannot block ingestion waiting for one.

    `extra` carries the inclusion fields (day / followed / reason) on the SAME
    line as the spend. One journal, one fold, one lock — rather than a second
    unlocked read-modify-write, which is what `_log_inclusion` used to be and
    what BLOCKER-2 was actually about.
    """
    assert kind in CREDITS, kind
    now = now or datetime.now(UTC)
    os.makedirs(STATE_DIR, exist_ok=True)
    rec = {"ts": now.isoformat(), "kind": kind, "n": n}
    rec.update(extra)
    with open(journal_path(now), "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def _previous_month(now: datetime) -> datetime:
    first = now.astimezone(UTC).replace(day=1, hour=0, minute=0, second=0, microsecond=0)
    return first - timedelta(days=1)


def _drain_previous_month(now: datetime) -> dict:
    """Fold anything left in LAST month's journal.

    ⛔ SPEND IS ARCHIVED AND LOGGED, NEVER CHARGED TO THE NEW MONTH — it came
       out of an allowance that has already reset. Charging it forward would
       make a new month open pre-spent, which is the very defect the per-month
       journal was introduced to remove.
    ✅ INCLUSION TALLIES ARE FOLDED NORMALLY: they belong to a DAY and are the
       study's weighting denominator, not a billing quantity.
    """
    prev = _previous_month(now)
    path = journal_path(prev)
    if not os.path.exists(path):
        return {"drained": 0}

    cursor = load_state("journal_cursors", {})
    key = _month_key(prev)
    offset = cursor.get(key, 0)
    size = os.path.getsize(path)
    if offset >= size:
        return {"drained": 0}

    inclusion = load_state("inclusion", {})
    archive = load_state("closed_months", {})
    bucket = archive.setdefault(key, {"birth": 0, "follow_up": 0, "liquidity": 0})
    drained = 0
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        while True:
            raw = fh.readline()
            if not raw:
                break
            line = raw.strip()
            if not line:
                offset = fh.tell()
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                if not raw.endswith("\n"):
                    break
                offset = fh.tell()
                continue
            k = rec.get("kind")
            if k in CREDITS and CREDITS[k] > 0:
                bucket[k] = bucket.get(k, 0) + rec.get("n", 0) * CREDITS[k]
            day, reason = rec.get("day"), rec.get("reason")
            if day and reason:
                inc = inclusion.setdefault(
                    day, {"launches": 0, "trait_carrier": 0,
                          "control_sample": 0, "not_sampled": 0})
                inc["launches"] += 1
                inc[reason] = inc.get(reason, 0) + 1
            drained += 1
            offset = fh.tell()

    cursor[key] = offset
    save_state("journal_cursors", cursor)
    save_state("inclusion", inclusion)
    save_state("closed_months", archive)
    if drained:
        LOG.warning("drained %d row(s) from the closed month %s — spend archived, "
                    "NOT charged to the current month; inclusion tallies folded", drained, key)
    return {"drained": drained}


def fold_pending(now: datetime | None = None) -> dict:
    """Fold journalled spend into the ledger. ⛔ CALLERS MUST HOLD periodic_lock().

    IDEMPOTENT BY BYTE OFFSET rather than by truncation: the ledger records how
    far it has consumed, and the next fold starts there. ★ Truncating instead
    would make a crash between 'state saved' and 'journal cleared' double-count
    the whole file, and a crash the other way lose it — the offset has neither
    failure, and it keeps the journal append-only like everything else here.
    """
    now = now or datetime.now(UTC)

    # ⛔ DRAIN THE PREVIOUS MONTH'S TAIL FIRST. The per-month journal fixed the
    #    re-fold, and a fresh reader executed what it left behind: rows written
    #    between the last fold of a month and midnight are never folded by ANY
    #    later run — up to an hour of births, ~862 at design rate, EVERY month.
    # ★ THE SPEND IS NOT CHARGED TO THE NEW MONTH, because it was not spent
    #   from the new month's allowance. It is archived and LOGGED, so a silent
    #   loss becomes a recorded one.
    # ⇒ BUT THE INCLUSION TALLIES ARE FOLDED, because they are the study's
    #   denominator and belong to a DAY, not to a billing period. Losing them
    #   would corrupt the pre-registered weighting; losing the spend figure
    #   only under-reports a month that has closed.
    _drain_previous_month(now)

    st = _load(now)
    offset = st.get("journal_offset", 0)
    path = journal_path(now)
    if not os.path.exists(path):
        # ⛔ THE SAME KEYS ON EVERY PATH — the rule this package states for
        #    `stats` and for `observed`, violated in the function `follow_up`
        #    calls. A caller subscripting `anomaly` got a KeyError only on
        #    this branch, and `.get()` returned the same None a clean fold
        #    returns.
        return {"folded": 0, "offset": offset, "bad_lines": 0, "anomaly": None}

    # ⛔ TRUNCATION / REPLACEMENT DETECTION. If the recorded offset is past the
    #    end of the file, the file was truncated, rotated, restored from backup
    #    or replaced. The offset only ever moves FORWARD, so without this check
    #    every subsequent fold reads nothing and ALL LATER SPEND IS SILENTLY
    #    LOST FOREVER — reproduced by a fresh reader: after a truncation the
    #    fold returned folded=0 at the old offset and the ledger never moved
    #    again. ⚠️ Silence here is exactly BLOCKER-1 returning by another route.
    size = os.path.getsize(path)
    anomaly = None
    if offset > size:
        anomaly = f"offset {offset} past EOF {size} — journal truncated or replaced"
        # Re-fold from the start of THIS MONTH'S file. That may double-count
        # what survived the truncation, and double-counting is the recoverable
        # error here: it over-states spend, which sheds discretionary legs
        # early. Under-stating would let the discretionary legs eat the birth
        # reserve, which is the irreversible one.
        offset = 0

    folded = 0
    bad_lines = 0
    inclusion = load_state("inclusion", {})
    inclusion_dirty = False
    # ⚠️ readline() in a while loop, NOT `for line in fh`. Python's file
    # iterator uses a read-ahead buffer and DISABLES tell() inside it —
    # "OSError: telling position disabled by next() call". The offset is the
    # whole crash-safety mechanism here, so the loop has to be the form that
    # can still report a position.
    with open(path, "r", encoding="utf-8") as fh:
        fh.seek(offset)
        while True:
            raw = fh.readline()
            if not raw:
                break
            line = raw.strip()
            if not line:
                offset = fh.tell()
                continue
            try:
                rec = json.loads(line)
            except ValueError:
                # ⛔ TORN TAIL vs INTERIOR CORRUPTION — these need OPPOSITE
                #    handling, and the first version could not tell them apart.
                #
                #    A line with no terminating newline is a TORN TAIL from a
                #    crash mid-append: stop, because the next append completes
                #    it and advancing past it would drop real spend.
                #
                #    A COMPLETE line that will not parse is interior
                #    corruption, and stopping on it stalls the fold FOREVER —
                #    every later fold returns 0 at the same offset, birth spend
                #    stops reaching the ledger, and we are back in BLOCKER-1
                #    with no error anywhere. Skip it, count it, and say so.
                if not raw.endswith("\n"):
                    # Torn tail: correct to stop, but NOT correct to stop
                    # SILENTLY — a permanently malformed tail would produce
                    # folded=0 every hour, which is also exactly what a
                    # genuinely quiet hour produces.
                    LOG.warning("journal has a torn final line at offset %d — fold "
                                "stopped here; the next append should complete it", offset)
                    break
                bad_lines += 1
                LOG.error("journal line unparseable at offset %d — SKIPPED, "
                          "spend from this line is lost: %.120s", offset, line)
                offset = fh.tell()
                continue
            k = rec.get("kind")
            # ⛔ NON-SPEND KINDS DO NOT COUNT AS SPEND ROWS AND DO NOT ENTER THE
            #    BURN STREAM. My first attempt at this fixed the LABEL and
            #    neither of the two effects it claimed to remove — a fresh
            #    reader executed it: 100 launches still reported 101 folded
            #    rows and a delivery record still landed in the monitor's event
            #    list, because `delivery` is in CREDITS and the test only
            #    asserted `>= 250`. Reverting the label change survived every
            #    suite. Gate on the CREDIT being non-zero, not on membership.
            if k in CREDITS and CREDITS[k] > 0:
                st["spent"][k] = st["spent"].get(k, 0) + rec.get("n", 0) * CREDITS[k]
                st["events"].append({"ts": rec["ts"], "kind": k, "n": rec.get("n", 0)})
                folded += 1
            # Inclusion tally rides the same fold — the realised denominator
            # for inverse-probability weighting, which the pre-registration
            # requires be logged rather than reconstructed at analysis time.
            day, reason = rec.get("day"), rec.get("reason")
            if day and reason:
                # ⛔ ITS OWN STATE FILE, NOT THE BUDGET BLOB. The budget resets
                # every month; this must not. A fresh reader found the tally
                # living inside the monthly blob, which meant the realised
                # inclusion counts — the PRE-REGISTERED denominator for
                # inverse-probability weighting — were silently discarded on
                # the 1st of every month. config.py says of this exact figure
                # "the log is the truth, and where they disagree the log wins";
                # a truth that evaporates monthly is not one.
                inclusion.setdefault(
                    day, {"launches": 0, "trait_carrier": 0,
                          "control_sample": 0, "not_sampled": 0})
                inclusion[day]["launches"] += 1
                inclusion[day][reason] = inclusion[day].get(reason, 0) + 1
                inclusion_dirty = True
            offset = fh.tell()

    cutoff = (now - BURN_TRAILING_WINDOW * 2).isoformat()
    st["events"] = [e for e in st["events"] if e["ts"] >= cutoff]
    st["journal_offset"] = offset
    cursors = load_state("journal_cursors", {})
    cursors[_month_key(now)] = offset
    save_state("journal_cursors", cursors)
    if anomaly:
        st.setdefault("anomalies", []).append({"ts": now.isoformat(), "what": anomaly})
        LOG.error("BUDGET JOURNAL ANOMALY: %s", anomaly)
    if inclusion_dirty:
        save_state("inclusion", inclusion)
    save_state(STATE, st)
    return {"folded": folded, "offset": offset, "bad_lines": bad_lines, "anomaly": anomaly}


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

    # ⛔ THE RESERVE IS A CAP ON *NON-BIRTH* SPEND. That is the whole mechanism:
    # births cannot be starved by discretionary legs if the discretionary legs
    # are bounded below the point where the reserve would be touched.
    #
    # ⚠️ THE PREVIOUS VERSION DID NOT DO THIS, AND THE COMMENT SAID IT DID.
    #    It read `total < headroom + BIRTHS_RESERVED` — and
    #    `headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED`, so BIRTHS_RESERVED
    #    CANCELS and the whole clause collapses to `total < MONTHLY_CREDIT_CAP`.
    #    The reserve appeared in the expression and constrained nothing. It
    #    read as a protection because the constant was written into the line.
    #    ★ A fresh reader found this by doing the algebra; I had read that line
    #      several times and seen the constant rather than the arithmetic.
    non_birth = spent_by("liquidity", now) + spent_by("follow_up", now)
    headroom = MONTHLY_CREDIT_CAP - BIRTHS_RESERVED  # 224,000
    remaining = MONTHLY_CREDIT_CAP - spent_total(now)

    # ⚠️ TWO BOUNDS, AND THE SECOND WAS LOST IN MY FIRST FIX — the suite caught
    #    it, which is the whole reason the shed order has an injection test.
    #    (a) NON-BIRTH SPEND < HEADROOM protects the reserve from the
    #        discretionary legs. This is the bound the old expression only
    #        appeared to apply.
    #    (b) THE ACCOUNT MUST HAVE ROOM LEFT AT ALL. Scope §5.1: above +25%
    #        launch-rate variance "the shed order fires and the 200k becomes a
    #        residual BY DESIGN". Dropping (b) would have meant a births
    #        overrun never sheds anything — which is the exact scenario the
    #        reserve exists for, silently unprotected.
    # ⚠️ HONEST NOTE ON REACHABILITY, because a fresh reader caught me shipping
    #    the SAME cancellation defect one step over. Today
    #    LIQUIDITY_AUDIT_CARVE (200,000) < headroom (224,000) and
    #    CREDITS["follow_up"] == 0, so `non_birth` IS `spent_by("liquidity")`
    #    and the headroom clause on the liquidity leg CANNOT BIND FIRST — the
    #    carve always trips before it. It is not decorative: it becomes the
    #    binding constraint the moment the follow-up leg is re-homed onto the
    #    paid provider, which §5's stated fallback contemplates.
    # ⛔ SO IT IS TESTED UNDER THAT CONDITION, not under today's constants —
    #    a test that injects 224,000 cannot tell which of the two clauses
    #    refused it, and my first version of that test could not.
    if kind == "liquidity":
        return (spent_by("liquidity", now) < LIQUIDITY_AUDIT_CARVE
                and non_birth < headroom
                and remaining > 0)
    if kind == "follow_up":
        return non_birth < headroom and remaining > 0

    # ⛔ NO SILENT TAIL. A kind that is neither never-shed nor explicitly
    #    budgeted must FAIL LOUD rather than default to allowed — the previous
    #    `return True` here would have let a future spend kind through with no
    #    gate and no error, which is the "convention callers may forget" shape
    #    this module exists to remove.
    raise AssertionError(
        f"budget.allowed: unbudgeted kind {kind!r} — add it to SHED_ORDER or "
        "NEVER_SHED before spending against it"
    )


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

    # ⛔ THE PEAK LEG IS NOT EXTRAPOLATED ACROSS THE MONTH. It used to be, and
    #    a fresh reader proved that made the whole "two projections" design a
    #    single projection: `peak` is the maximum over the 24 one-hour buckets
    #    that `trailing` averages, so peak >= trailing IDENTICALLY. Over 2,000
    #    randomised series `binding_leg` took exactly ONE value — "peak" — and
    #    it read "peak" even on the suite's own FLAT control, whose comment
    #    claims the trailing leg binds there.
    # ★ AND IT WAS NOT MERELY REDUNDANT, IT WAS WRONG: extrapolating the worst
    #   single hour across the rest of the month put the monitor at
    #   warning/critical under ordinary designed load — one hour at 1.5x the
    #   mean projected 801,828 against a 800,000 warning line while the honest
    #   trailing projection was 638,264, 35% under the cap. An alarm that is
    #   always on is an alarm nobody reads, which is the failure OBJ-9 exists
    #   to avoid.
    #
    # ⇒ TWO DIFFERENT QUESTIONS, ANSWERED SEPARATELY:
    #   (1) THE BUDGET QUESTION — will this month's spend rate exhaust the
    #       allowance? Projected from the TRAILING rate, which is the only
    #       honest estimator of a month-long total.
    #   (2) THE SPIKE QUESTION — Langston's original concern, that a mean is
    #       blind in the same direction as the budget. Answered by asking
    #       whether the PEAK hour, if it PERSISTED, would exhaust the
    #       allowance inside a bounded horizon — not by pretending one hour
    #       represents the month.
    proj_trailing = total + trailing * hours_left
    spike_horizon_h = min(SPIKE_HORIZON.total_seconds() / 3600.0, hours_left)
    proj_peak = total + peak * spike_horizon_h
    projected = max(proj_trailing, proj_peak)

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
