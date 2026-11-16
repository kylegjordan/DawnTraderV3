"""token-watch — THE BIRTH CAP (B-TOKEN-WATCH-BIRTH-CAP, KD-90).

Kyle (2026-11-16): "Let's self cap the number of launches we check track per day. We track everything already in
our track list and then all of the new coins up to the daily track limit."

★ WHAT THIS DOES. Once a minute it decides whether the Helius birth subscription should be ON or OFF right now,
  from a timetable fixed once per credit cycle, and switches it with a full-body PUT of `active` if the applied
  state differs. Everything already tracked is untouched: the follow-up, the socials sweep and the census of
  births already recorded do not pass through here.

⛔ THE CAP STOPS HELIUS SENDING; IT NEVER DISCARDS AN ARRIVAL. A birth is charged when Helius sends it, so a filter
   on our side saves nothing and loses the row. `birth` stays in NEVER_SHED.
⛔ SCHEDULED BY TIME, NOT BY COUNT (Langston ruling 1b). A per-window quota would make inclusion depend on the local
   launch rate, which correlates with the outcome the study predicts (hype waves produce graduates). Fixed
   on-durations make inclusion a known constant; the measured on-time in `switches.jsonl` is the weight.
⛔ THE CREDIT ALLOWANCE IS A BACKSTOP, FIXED ONCE PER CYCLE — never a daily credits-left ÷ days-left recompute,
   which would couple each day's inclusion probability to the days before it. A day the backstop binds is a
   `truncated_day`, its own stratum.
⛔ FAIL CLOSED TO *ON*. Overspend is recoverable; a dark census is not. Every refusal path (no plan, unreadable
   switch log, missing liveness handshake, breaker) leaves the feed ON and pages.

Run as: birthcap.py --tick (the timer, as tokenwatch) · --mint (ExecStartPost, as root: mints the pages the tick
left) · --status · --replan.  Switching only happens while `state/birthcap.enabled` exists (the switch-on step).
"""
from __future__ import annotations

import json
import logging
import math
import os
import sys
from datetime import datetime, timedelta, timezone

import budget
import liveness
import providers
from config import (
    BIRTHCAP_SNAP_OPEN_S,
    BIRTHCAP_STATE_NAME,
    BIRTHCAP_DIVERGENCE_MIN, BIRTHCAP_DIVERGENCE_SHARE, BIRTHCAP_FAILED_OFF_MIN_ROWS,
    BIRTHCAP_FAILED_OFF_RATE_SHARE, BIRTHCAP_OFF_GRACE_S, BIRTHCAP_PHASE_STEP, BIRTHCAP_PLANNED_OFF,
    BIRTHCAP_RESERVE_RATE_ERROR, BIRTHCAP_SWITCHES, BIRTHCAP_TRUNCATED, BIRTHCAP_W_MAX, BIRTHCAP_W_MIN,
    BIRTHCAP_MAX_BIRTHS_PER_DAY, BIRTHCAP_WEBHOOK_BODY, BIRTHCAP_WEBHOOK_ID, BIRTHS_DIR, EXPECTED_LAUNCHES_PER_DAY, LIVENESS_GAP_SECONDS,
    STATE_DIR, SWITCH_CREDITS, SWITCH_SHARE_MAX, birthcap_switch_ceiling,
)
from store import load_state, save_state

UTC = timezone.utc
LOG = logging.getLogger("token-watch.birthcap")
STATE = BIRTHCAP_STATE_NAME
RESULT = "birthcap_result"
# pages a failed mint could not deliver, re-offered by every later mint (Langston §13 (i)): bounded in count and age
CARRY = "birthcap_carry"
CARRY_MAX = 50
CARRY_MAX_AGE = timedelta(hours=24)
ENABLE_FLAG = f"{STATE_DIR}/birthcap.enabled"
RESULT_MAX_AGE = timedelta(minutes=5)
TRAILING_DAYS = 7
# The breaker blocks OFF switches at the ceiling; switching back ON may use HARD_MARGIN more calls, and then every
# vendor call stops for the day (a GET or an ON-PUT that keeps failing would otherwise cost 100 credits a minute).
HARD_MARGIN = 4


class RecordUnreadable(RuntimeError):
    """The switch log is absent or unparseable — the breaker and the weights would read low (Langston r2-5)."""


def _now() -> datetime:
    return datetime.now(UTC)


def _ts(s: str) -> datetime:
    return datetime.fromisoformat(s.replace("Z", "+00:00"))


# ── the switch log: append-only, fsync'd; the study's weight record and the breaker's instrument ─────────────
def read_switches(path: str = BIRTHCAP_SWITCHES) -> list[dict]:
    if not os.path.exists(path):
        raise RecordUnreadable(f"{path} is absent")
    out = []
    with open(path, encoding="utf-8") as fh:
        for n, line in enumerate(fh, 1):
            if not line.strip():
                continue
            try:
                out.append(json.loads(line))
            except ValueError as exc:
                raise RecordUnreadable(f"{path} line {n} is unparseable: {exc}") from exc
    return out


def _append(path: str, rec: dict) -> None:
    os.makedirs(os.path.dirname(path), exist_ok=True)
    with open(path, "a", encoding="utf-8") as fh:
        fh.write(json.dumps(rec, sort_keys=True) + "\n")
        fh.flush()
        os.fsync(fh.fileno())


def switches_on_day(records: list[dict], day: str) -> int:
    """Calls charged to the vendor on this UTC day (PUTs and the rare GET) — the breaker's count."""
    return sum(1 for r in records if r.get("kind") in ("put", "get") and str(r.get("requested_at", ""))[:10] == day)


# ── the plan: fixed once per credit cycle ────────────────────────────────────────────────────────────────────
def windows_for(gross_per_day: float) -> int:
    """Ruling 1 (Langston), with his L-11 correction: switching <= 8% of the GROSS day allowance, floor 4, ceiling 12."""
    rule = math.floor(SWITCH_SHARE_MAX * gross_per_day / (2 * SWITCH_CREDITS))
    return max(BIRTHCAP_W_MIN, min(BIRTHCAP_W_MAX, rule))


def plan_cycle(now: datetime, usage: dict, launch_rate_per_day: float, rpc_rate_per_day: float) -> dict:
    """The timetable for the rest of this credit cycle. Pure: every input is passed in.

    Refuses (returns refused=...) rather than produce a schedule whose on-window is too short for a failed switch-ON
    to be visible as silence > LIVENESS_GAP_SECONDS (Langston C-5)."""
    cyc = usage.get("creditCycle") or {}
    start = datetime.fromisoformat(cyc["start"]).replace(tzinfo=UTC)
    end = datetime.fromisoformat(cyc["end"]).replace(tzinfo=UTC)
    remaining = float(usage["creditsRemaining"])
    days_left = max((end - now).total_seconds() / 86400.0, 1e-6)
    gross = remaining / days_left
    reserve = max(rpc_rate_per_day * days_left,
                  launch_rate_per_day * 60 / 86400.0,                 # the counter's ~60 s lumpy lag
                  BIRTHCAP_RESERVE_RATE_ERROR * launch_rate_per_day)  # one day of launch-rate error
    base = {"cycle_start": start.isoformat(), "cycle_end": end.isoformat(), "planned_at": now.isoformat(),
            "remaining_at_plan": remaining, "days_left": round(days_left, 4), "gross_per_day": round(gross, 1),
            "launch_rate_per_day": round(launch_rate_per_day, 1), "rpc_rate_per_day": rpc_rate_per_day,
            "reserve": round(reserve, 1)}
    w = windows_for(gross)
    rule_w = math.floor(SWITCH_SHARE_MAX * gross / (2 * SWITCH_CREDITS))
    while True:
        switching = 2 * w * SWITCH_CREDITS
        allow = min((remaining - reserve) / days_left - switching - rpc_rate_per_day,
                    float(BIRTHCAP_MAX_BIRTHS_PER_DAY))     # never plan beyond what the births reserve covers
        duty = allow / launch_rate_per_day if launch_rate_per_day > 0 else 0.0
        if duty >= 1.0:
            return dict(base, always_on=True, windows=0, duty=1.0, births_allowance_per_day=round(allow, 1),
                        rule_windows=rule_w)
        block = 86400.0 / w
        on_s = duty * block
        if on_s > LIVENESS_GAP_SECONDS:
            return dict(base, always_on=False, windows=w, rule_windows=rule_w,
                        floor_binds=rule_w < BIRTHCAP_W_MIN and w == BIRTHCAP_W_MIN,
                        below_floor=w < BIRTHCAP_W_MIN,         # the floor was abandoned for the 900 s assert
                        switching_per_day=switching, births_allowance_per_day=round(allow, 1),
                        duty=round(duty, 4), block_s=block, on_s=round(on_s, 1))
        if w <= 1:
            return dict(base, refused="on-window would be %.0f s <= LIVENESS_GAP_SECONDS (%d): a failed switch-ON "
                                      "would be invisible" % (on_s, LIVENESS_GAP_SECONDS),
                        births_allowance_per_day=round(allow, 1), duty=round(duty, 4))
        w -= 1


def desired(now: datetime, plan: dict) -> str:
    if plan.get("refused") or plan.get("always_on"):
        return "on"
    start = _ts(plan["cycle_start"])
    day_index = (now.date() - start.date()).days
    block = float(plan["block_s"])
    offset = (day_index * BIRTHCAP_PHASE_STEP % 1.0) * block
    sec = now.hour * 3600 + now.minute * 60 + now.second
    pos = (sec - offset) % block
    return "on" if pos < float(plan["on_s"]) else "off"


# ── the census reader: incremental, one pass of new rows per tick ────────────────────────────────────────────
def read_new_births(st: dict, now: datetime) -> list[datetime]:
    """first_seen_at of every row appended since the last tick. Day roll drains the old file first."""
    cur = st.setdefault("census", {"day": now.strftime("%Y-%m-%d"), "offset": 0})
    out = []
    while True:
        path = f"{BIRTHS_DIR}/{cur['day']}.jsonl"
        if os.path.exists(path):
            with open(path, "rb") as fh:
                fh.seek(cur["offset"])
                for raw in fh:
                    if not raw.endswith(b"\n"):
                        break                      # a partial last line: read it next tick
                    cur["offset"] += len(raw)
                    try:
                        t = json.loads(raw).get("first_seen_at")
                        if t:
                            out.append(_ts(t))
                    except ValueError:
                        continue
        if cur["day"] >= now.strftime("%Y-%m-%d"):
            break
        nxt = (datetime.strptime(cur["day"], "%Y-%m-%d") + timedelta(days=1)).strftime("%Y-%m-%d")
        cur["day"], cur["offset"] = nxt, 0
    return out


def _bucket(st: dict, stamps: list[datetime], now: datetime) -> None:
    """Per-minute and per-UTC-day counts of arrivals, keyed by first_seen_at. Kept for 2 days."""
    mins = st.setdefault("minutes", {})
    days = st.setdefault("days", {})
    for t in stamps:
        k = t.strftime("%Y-%m-%dT%H:%M")
        mins[k] = mins.get(k, 0) + 1
        d = t.strftime("%Y-%m-%d")
        days[d] = days.get(d, 0) + 1
    cutoff = (now - timedelta(days=2)).strftime("%Y-%m-%dT%H:%M")
    for k in [k for k in mins if k < cutoff]:
        del mins[k]
    for k in [k for k in days if k < cutoff[:10]]:
        del days[k]


def rate_per_min_before(st: dict, t: datetime, minutes: int = 5) -> float:
    mins = st.get("minutes", {})
    tot = sum(mins.get((t - timedelta(minutes=i)).strftime("%Y-%m-%dT%H:%M"), 0) for i in range(1, minutes + 1))
    return tot / float(minutes)


def failed_off_minutes(st: dict, off_at: datetime, now: datetime, threshold: float) -> list[str]:
    """Minutes, wholly after off + grace, whose arrivals reach the threshold — births arriving while Helius should
    be silent prove the switch-off failed (Langston C-2(ii), r2-4: rolling over the whole off window)."""
    first = off_at + timedelta(seconds=BIRTHCAP_OFF_GRACE_S)
    first = first.replace(second=0, microsecond=0) + timedelta(minutes=1)
    hits, m = [], first
    while m + timedelta(minutes=1) <= now:
        k = m.strftime("%Y-%m-%dT%H:%M")
        if st.get("minutes", {}).get(k, 0) >= threshold:
            hits.append(k)
        m += timedelta(minutes=1)
    return hits


# ── the switch: the only writer of the external subscription ────────────────────────────────────────────────
def handshake_ok() -> tuple[bool, str]:
    """An off-switch needs the installed dead-man to understand planned silence (Langston blocker 4 / C-13)."""
    if not getattr(liveness, "PLANNED_OFF_READER", False):
        return False, "liveness has no PLANNED_OFF_READER: a planned off window would page as a dead feed"
    if getattr(liveness, "SWITCHES_PATH", None) != BIRTHCAP_SWITCHES:
        return False, "liveness reads %r, the controller writes %r" % (getattr(liveness, "SWITCHES_PATH", None),
                                                                        BIRTHCAP_SWITCHES)
    return True, ""


def do_switch(target: str, now: datetime, put=providers.webhook_put) -> dict:
    """One full-body PUT. The response IS the read-back (a GET costs 100). Returns the switch record."""
    body = dict(BIRTHCAP_WEBHOOK_BODY, active=(target == "on"))
    rec = {"kind": "put", "requested": target, "requested_at": now.isoformat(), "credits": SWITCH_CREDITS}
    try:
        resp = put(BIRTHCAP_WEBHOOK_ID, body)
        rec["responded_at"] = _now().isoformat()
        rec["echo_active"] = resp.get("active")
        rec["echo_disabled_at"] = resp.get("disabledAt")
        rec["echo_auth_set"] = bool(resp.get("authHeader"))
        rec["echo_url_ok"] = resp.get("webhookURL") == BIRTHCAP_WEBHOOK_BODY["webhookURL"]
        rec["ok"] = (resp.get("active") is (target == "on")) and rec["echo_auth_set"] and rec["echo_url_ok"]
    except Exception as exc:                                  # noqa: BLE001 — a failed PUT is a recorded switch
        rec["responded_at"] = _now().isoformat()
        rec["error"] = "%s: %s" % (type(exc).__name__, str(exc)[:300])
        rec["ok"] = False
        if getattr(exc, "code", None) and 400 <= int(exc.code) < 500:
            rec["credits"] = 0                                # a refused PUT is not charged (pre-audit A3)
    return rec


def tick(now: datetime | None = None, usage_fn=providers.helius_usage, put=providers.webhook_put,
         get=providers.webhook_get) -> dict:
    now = now or _now()
    st = load_state(STATE, {})
    pages: list[dict] = []
    result = {"checked_at": now.isoformat(), "pages": pages, "action": None}

    stamps = read_new_births(st, now)
    _bucket(st, stamps, now)

    if not os.path.exists(ENABLE_FLAG):
        # ⛔ DISABLED MEANS ON, not "frozen where it was": removing the flag mid-off-window must restore the feed.
        #    Gate on anything but a CONFIRMED ON: every failure leaves `applied` None, never "off" (Langston gate A C-1),
        #    and a fresh state has no `applied` at all — one ON-PUT is the cheapest way to know. It retries each tick
        #    while disabled, under the same hard daily ceiling as the enabled path, with ONE page key per UTC day.
        if st.get("applied") != "on":
            today = now.strftime("%Y-%m-%d")
            plan = st.get("plan")
            hard = birthcap_switch_ceiling(int(plan.get("windows", 0)) if plan else 0) + HARD_MARGIN
            calls = st.setdefault("calls", {})
            try:
                logged = switches_on_day(read_switches(), today)
            except RecordUnreadable:
                logged = 0                                    # the state counter below is the floor
            used = max(logged, int(calls.get(today, 0)))
            if used >= hard:
                pages.append(_page("birthcap-disabled-restore-capped-%s" % today, "critical",
                                   "Birth cap is disabled but could not restore the feed — hard daily ceiling reached",
                                   "%d vendor calls today against a hard ceiling of %d; applied %s. Check the webhook "
                                   "in the Helius dashboard." % (used, hard, st.get("applied"))))
                result["action"] = "disabled-restore-capped"
            else:
                rec = do_switch("on", now, put=put)
                calls[today] = int(calls.get(today, 0)) + 1      # C-2: every vendor call bumps the state counter
                _append(BIRTHCAP_SWITCHES, rec)
                if rec.get("credits"):
                    budget.record_pending("switch", 1, now)
                st["applied"] = "on" if rec.get("ok") else None
                if rec.get("ok"):
                    st["applied_at"] = now.isoformat()
                    result["action"] = "disabled-restored-on"
                else:
                    pages.append(_page("birthcap-disabled-not-restored-%s" % today, "critical",
                                       "Birth cap is disabled but could not restore the feed — retrying each minute",
                                       json.dumps(rec, sort_keys=True)))
                    result["action"] = "disabled-restore-failed"
        else:
            result["action"] = "disabled"
        save_state(STATE, st)
        save_state(RESULT, result)
        return result

    # the plan: computed at switch-on and at each new cycle; a usage read is free
    plan = st.get("plan")
    if plan is None or now >= _ts(plan["cycle_end"]) or st.get("replan"):
        try:
            usage = usage_fn()
            try:
                rate_records = read_switches()
            except RecordUnreadable:
                rate_records = None                           # the backstop still bounds the spend
            launch = trailing_launch_rate(now, rate_records)
            plan = plan_cycle(now, usage, launch, st.get("rpc_rate_per_day", 0.0))
            st["plan"], st["replan"] = plan, False
            LOG.info("birthcap plan: %s", plan)
            if plan.get("refused"):
                pages.append(_page("birthcap-plan-refused", "critical",
                                   "Birth cap refused its schedule — no timetable; the daily allowance still caps the feed",
                                   plan["refused"]))
        except Exception as exc:                              # noqa: BLE001
            LOG.error("birthcap: could not plan: %s", exc)
            plan = None
    want = desired(now, plan) if plan else "on"

    # the backstop: a day that reaches its allowance stops early and is its own stratum
    today = now.strftime("%Y-%m-%d")
    # ⛔ APPLIED IN EVERY PLAN STATE, always_on and refused included (Langston gate C blocker): those are exactly the
    #    states where nothing else bounds the spend.
    if plan and plan.get("births_allowance_per_day") is not None:
        if st.get("days", {}).get(today, 0) >= float(plan["births_allowance_per_day"]):
            want = "off"
            if st.get("truncated_day") != today:
                st["truncated_day"] = today
                _append(BIRTHCAP_TRUNCATED, {"day": today, "at": now.isoformat(), "births": st.get("days", {}).get(today, 0),
                                             "allowance": plan["births_allowance_per_day"]})

    # the switch record must be readable before anything is switched (r2-5)
    try:
        records = read_switches()
    except RecordUnreadable as exc:
        pages.append(_page("birthcap-record-unreadable", "critical", "Birth cap switch log unreadable — feed forced ON",
                           str(exc)))
        records, want = None, "on"

    applied = st.get("applied")
    ceiling = birthcap_switch_ceiling(int(plan.get("windows", 0)) if plan else 0)
    hard = ceiling + HARD_MARGIN                              # beyond this, NO vendor call of any kind today
    # the log is the count; a state-held counter is its floor, so an unreadable log cannot uncap the calls
    calls = st.setdefault("calls", {})
    for d in sorted(calls)[:-3]:
        del calls[d]
    used = max(switches_on_day(records or [], today), int(calls.get(today, 0)))
    if applied is None and used >= hard:
        pages.append(_page("birthcap-hard-ceiling-%s" % today, "critical",
                           "Birth cap hit its hard daily call ceiling — no further vendor calls today",
                           "%d vendor calls today against a hard ceiling of %d; the applied state is unknown. Check the "
                           "webhook in the Helius dashboard." % (used, hard)))
    elif applied is None:
        # the applied state is lost: ONE GET learns it, and it counts against the breaker
        try:
            obj = get(BIRTHCAP_WEBHOOK_ID)
            applied = "on" if obj.get("active") else "off"
            rec = {"kind": "get", "requested_at": now.isoformat(), "credits": SWITCH_CREDITS, "echo_active": obj.get("active")}
        except Exception as exc:                              # noqa: BLE001
            rec = {"kind": "get", "requested_at": now.isoformat(), "credits": SWITCH_CREDITS, "error": str(exc)[:300]}
        if records is not None:
            _append(BIRTHCAP_SWITCHES, rec)
            records.append(rec)
        budget.record_pending("switch", 1, now)               # a GET is charged like a PUT (pre-audit A3)
        calls[today] = int(calls.get(today, 0)) + 1
        st["applied"] = applied

    if want == "off":
        ok, why = handshake_ok()
        if not ok:
            pages.append(_page("birthcap-handshake", "critical", "Birth cap refused to switch OFF — feed left ON", why))
            want = "on"

    if applied != want and applied is not None:
        used = max(switches_on_day(records or [], today), int(calls.get(today, 0)))
        if used >= ceiling and want == "off":
            pages.append(_page("birthcap-breaker-%s" % today, "critical", "Birth cap switch breaker tripped — feed left ON",
                               "%d vendor calls today against a ceiling of %d" % (used, ceiling)))
        elif used >= hard:
            # ⛔ even a switch back ON stops here: a PUT that keeps failing would otherwise spend 100 credits a minute
            pages.append(_page("birthcap-hard-ceiling-%s" % today, "critical",
                               "Birth cap hit its hard daily call ceiling — no further vendor calls today",
                               "%d vendor calls today against a hard ceiling of %d; wanted %s, applied %s. Check the "
                               "webhook in the Helius dashboard." % (used, hard, want.upper(), applied)))
        elif records is None and want == "off":
            pass                                              # already paged; never switch OFF blind
        else:
            if want == "off":
                st["off_rate_per_min"] = rate_per_min_before(st, now)
            rec = do_switch(want, now, put=put)
            calls[today] = int(calls.get(today, 0)) + 1
            _append(BIRTHCAP_SWITCHES, rec)
            if rec.get("credits"):
                budget.record_pending("switch", 1, now)
            result["action"] = "switched-%s" % want
            if rec.get("ok"):
                st["applied"], st["applied_at"] = want, now.isoformat()
                if want == "off":
                    st["off_at"] = now.isoformat()
            else:
                pages.append(_page("birthcap-switch-failed-%s" % now.strftime("%Y%m%dT%H%M"), "critical",
                                   "Birth cap switch to %s did not take" % want.upper(), json.dumps(rec, sort_keys=True)))
                st["applied"] = None                          # unknown: the next tick re-learns it (one GET)

    # a switch-OFF that "succeeded" but births keep arriving (C-2 (ii))
    if st.get("applied") == "off" and st.get("off_at"):
        off_at = _ts(st["off_at"])
        thr = max(BIRTHCAP_FAILED_OFF_MIN_ROWS, BIRTHCAP_FAILED_OFF_RATE_SHARE * float(st.get("off_rate_per_min", 0)))
        hits = failed_off_minutes(st, off_at, now, thr)
        if hits:
            pages.append(_page("birthcap-off-failed-%s" % off_at.strftime("%Y%m%dT%H%M%S"), "critical",
                               "Birth cap switch-OFF failed — births still arriving",
                               "off at %s; minutes at or over %.1f rows: %s" % (st["off_at"], thr, ", ".join(hits[:10]))))

    # the vendor's own counter, once per clock hour, against what we can account for (r2-1 (b), Langston answer 4)
    if plan is not None:
        try:
            _hourly_crosscheck(st, now, records or [], usage_fn, pages)
        except Exception as exc:                              # noqa: BLE001 — a missed cross-check is logged, not fatal
            LOG.error("birthcap: hourly cross-check failed: %s", exc)

    st["last_tick"] = now.isoformat()
    save_state(STATE, st)
    save_state(RESULT, result)
    return result


def _hourly_crosscheck(st: dict, now: datetime, records: list[dict], usage_fn, pages: list) -> None:
    """At the first tick of each clock hour: compare the vendor's `webhooks` delta over the previous hour with the
    births the census recorded in it plus the switch credits we spent in it, and the vendor's `rpc` delta with the
    allowance. Ratios only above BIRTHCAP_DIVERGENCE_MIN (an off hour's 0/0 is skipped)."""
    hour = now.strftime("%Y-%m-%dT%H")
    snap = st.get("usage_snap")
    if snap and snap.get("hour") == hour:
        return
    usage = usage_fn()
    cur = {"hour": hour, "at": now.isoformat(), "webhooks": usage["credits"]["webhooks"], "rpc": usage["credits"]["rpc"]}
    st["usage_snap"] = cur
    if not snap or snap.get("hour") != (now - timedelta(hours=1)).strftime("%Y-%m-%dT%H"):
        return                                                # need two consecutive hours to align
    # ⛔ THE PREVIOUS SNAPSHOT MUST OPEN ITS HOUR. A snapshot taken mid-hour (the first enabled tick, a restart, a
    #    missed tick) covers only part of the hour while the census and switch sums cover all of it — a false
    #    divergence AND a false replan. Measured at switch-on, 2026-11-16 11:00Z: snap at 10:37:20, vendor +148
    #    against 724 births + 200 switch credits. Skip that hour; the next one is whole.
    snap_at = _ts(snap["at"]) if snap.get("at") else None
    hour_start = (now - timedelta(hours=1)).replace(minute=0, second=0, microsecond=0)
    if snap_at is None or (snap_at - hour_start).total_seconds() > BIRTHCAP_SNAP_OPEN_S:
        return
    dv_web = cur["webhooks"] - snap["webhooks"]
    dv_rpc = cur["rpc"] - snap["rpc"]
    prev = snap["hour"]
    births = sum(v for k, v in st.get("minutes", {}).items() if k.startswith(prev))
    switch_cr = sum(int(r.get("credits", 0)) for r in records if str(r.get("requested_at", ""))[:13] == prev)
    expected = births + switch_cr
    base_n = max(dv_web, expected)                            # a frozen vendor counter is tested too (gate C item 3)
    if base_n >= BIRTHCAP_DIVERGENCE_MIN and abs(dv_web - expected) / base_n > BIRTHCAP_DIVERGENCE_SHARE:
        st["replan"] = True                                   # the webhook leg IS the births budget (gate C item 2)
        pages.append(_page("birthcap-divergence-%s" % prev, "warning", "Birth cap: vendor webhook spend disagrees with the census",
                           "hour %s: vendor webhooks +%d, census births %d + switch credits %d = %d" % (
                               prev, dv_web, births, switch_cr, expected)))
    allow_rpc_hour = float(st.get("rpc_rate_per_day", 0.0)) / 24.0
    # switch credits land in `webhooks`, not `rpc` (live pause: rpc flat at 25,168 across both PUTs, webhooks +~200
    # each); with a zero allowance ANY rpc spend is unplanned (gate C item 4)
    if dv_rpc > 0 and dv_rpc > 1.25 * allow_rpc_hour + (50 if allow_rpc_hour > 0 else 0):
        st["replan"] = True
        pages.append(_page("birthcap-rpc-overrun-%s" % prev, "warning", "Birth cap: RPC spend above its allowance — replanning",
                           "hour %s: vendor rpc +%d against an allowance of %.0f/hour (liquidity carve is 0 under "
                           "AMENDMENT 18, so any rpc spend is unplanned)" % (prev, dv_rpc, allow_rpc_hour)))
    hours = st.setdefault("hours", {})
    hours[prev] = {"vendor_webhooks": dv_web, "vendor_rpc": dv_rpc, "births": births, "switch_credits": switch_cr}
    for k in sorted(hours)[:-72]:                             # keep three days
        del hours[k]


def on_fraction(records: list[dict], day_start: datetime) -> float:
    """The measured share of one UTC day the feed was ON, from the confirmed switches (a day with none is all ON)."""
    day_end = day_start + timedelta(days=1)
    state, t, on_s = "on", day_start, 0.0
    for r in records:
        if r.get("kind") != "put" or not r.get("ok"):
            continue
        ts = _ts(r["requested_at"])
        if ts >= day_end:
            break
        if ts > t:
            on_s += (ts - t).total_seconds() if state == "on" else 0.0
            t = ts
        state = r.get("requested", state)
    on_s += (day_end - t).total_seconds() if state == "on" else 0.0
    return on_s / 86400.0


def trailing_launch_rate(now: datetime, records: list[dict] | None = None) -> float:
    """LAUNCHES per day over the last TRAILING_DAYS complete UTC days: each day's recorded rows divided by that day's
    measured ON fraction (Langston gate C blocker). Delivered rows alone are censored by the cap itself — they converge
    on the allowance, which would make the next plan always-on. A day ON under 5 % of the time is skipped; with no
    readable switch log every day counts as fully ON (an under-estimate; the daily backstop still bounds the spend)."""
    rates = []
    for i in range(1, TRAILING_DAYS + 1):
        day = (now - timedelta(days=i)).replace(hour=0, minute=0, second=0, microsecond=0)
        path = f"{BIRTHS_DIR}/{day.strftime('%Y-%m-%d')}.jsonl"
        if os.path.exists(path):
            with open(path, "rb") as fh:
                rows = sum(1 for _ in fh)
            frac = on_fraction(records, day) if records is not None else 1.0
            if frac >= 0.05:
                rates.append(rows / frac)
    return sum(rates) / len(rates) if rates else float(EXPECTED_LAUNCHES_PER_DAY)


def _page(key: str, severity: str, title: str, body: str) -> dict:
    return {"dedupe_key": key, "severity": severity, "title": title,
            "body": body + "\n\nOwner: Infra Claude (CC-INFRA). Source: token-watch/birthcap.py "
                           "(B-TOKEN-WATCH-BIRTH-CAP). Resolve with evidence, never ack."}


def mint(now: datetime | None = None, mint_fn=None) -> int:
    """ExecStartPost, as root: mint what this tick left. Refuses a result older than RESULT_MAX_AGE."""
    now = now or _now()
    if mint_fn is None:
        sys.path.insert(0, os.path.join(os.path.dirname(os.path.abspath(__file__)), "ops"))
        import alert_mint
        mint_fn = alert_mint.mint
    res = load_state(RESULT, {})
    try:
        checked = _ts(res["checked_at"])
    except (KeyError, TypeError, ValueError):
        LOG.error("birthcap mint: no tick result to read")
        return 1
    if now - checked > RESULT_MAX_AGE:
        LOG.error("birthcap mint: the tick result is from %s — not this run's", res["checked_at"])
        return 1
    # ⛔ A FAILED MINT USED TO DISCARD ITS PAGES (2026-11-16 11:00Z: the false divergence page never reached the
    #    queue). The hourly cross-check pages are made ONCE per hour, so a lost one is lost for good. Undelivered pages
    #    are carried in state and offered again by every later mint until one lands, bounded by CARRY_MAX / CARRY_MAX_AGE.
    carry = load_state(CARRY, {}).get("pages", [])
    pending, seen = [], set()
    for p in list(res.get("pages", [])) + carry:
        if p["dedupe_key"] in seen:
            continue
        seen.add(p["dedupe_key"])
        pending.append(dict(p, carried_at=p.get("carried_at") or now.isoformat()))
    failed = []
    for p in pending:
        if not mint_fn(severity=p["severity"], dedupe_key=p["dedupe_key"], title=p["title"], body=p["body"]):
            failed.append(p)
    kept = [p for p in failed if now - _ts(p["carried_at"]) <= CARRY_MAX_AGE][-CARRY_MAX:]
    if kept or carry:
        save_state(CARRY, {"pages": kept, "updated_at": now.isoformat()})
        if getattr(os, "geteuid", lambda: -1)() == 0:                                 # the mint runs as root; the file stays the tick user's
            import shutil
            shutil.chown(f"{STATE_DIR}/{CARRY}.json", "tokenwatch", "tokenwatch")
    if len(failed) > len(kept):
        LOG.error("birthcap mint: %d undelivered page(s) dropped past the carry bound", len(failed) - len(kept))
    return 1 if failed else 0


def main(argv: list[str]) -> int:
    logging.basicConfig(level=logging.INFO, format="%(asctime)s %(levelname)s %(name)s %(message)s")
    if argv[1:] == ["--tick"]:
        r = tick()
        LOG.info("birthcap tick: %s", {k: r[k] for k in ("action",)} | {"pages": len(r["pages"])})
        return 0
    if argv[1:] == ["--mint"]:
        return mint()
    if argv[1:] == ["--status"]:
        print(json.dumps(load_state(STATE, {}).get("plan"), indent=1, sort_keys=True))
        return 0
    if argv[1:] == ["--replan"]:
        st = load_state(STATE, {})
        st["replan"] = True
        save_state(STATE, st)
        return 0
    print("usage: birthcap.py --tick | --mint | --status | --replan", file=sys.stderr)
    return 2


if __name__ == "__main__":
    sys.exit(main(sys.argv))
