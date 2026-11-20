"""
token-watch — B-TOKEN-WATCH-BIRTH-CAP (KD-90): the birth cap controller and the dead-man's planned-silence reader.

Every controller case goes through the PRODUCTION entry point `birthcap.tick`, with only the three vendor calls
(usage, PUT, GET) replaced by fakes; the census, the switch log, the ledger journal and the state are real files on a
scratch store. The liveness cases go through `liveness.check`, the dead-man's own entry point.

Run:  python tests/test_birthcap.py        (exit 0 = every check passed)
"""

import json
import re
import os
import shutil
import sys
import tempfile
from datetime import datetime, timedelta, timezone

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

ROOT = tempfile.mkdtemp(prefix="token-watch-birthcap-", dir=os.path.expanduser("~"))
os.environ["TOKEN_WATCH_ROOT"] = ROOT
sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))

import config  # noqa: E402
import store  # noqa: E402
import liveness  # noqa: E402
import birthcap  # noqa: E402

UTC = timezone.utc
NL = chr(10)
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


def reset():
    for d in ("state", "births", "provenance"):
        shutil.rmtree(os.path.join(ROOT, d), ignore_errors=True)
        os.makedirs(os.path.join(ROOT, d), exist_ok=True)
    open(config.BIRTHCAP_SWITCHES, "w").close()


def enable(on=True):
    if on:
        open(birthcap.ENABLE_FLAG, "w").close()
    elif os.path.exists(birthcap.ENABLE_FLAG):
        os.remove(birthcap.ENABLE_FLAG)


def add_births(times):
    by_day = {}
    for t in times:
        by_day.setdefault(t.strftime("%Y-%m-%d"), []).append(t)
    for day, ts in by_day.items():
        with open(os.path.join(config.BIRTHS_DIR, day + ".jsonl"), "a", encoding="utf-8") as fh:
            for t in ts:
                fh.write(json.dumps({"mint": "m%s" % t.timestamp(), "first_seen_at": t.isoformat()}) + NL)


def switches():
    with open(config.BIRTHCAP_SWITCHES, encoding="utf-8") as fh:
        return [json.loads(l) for l in fh if l.strip()]


class Vendor:
    """Fakes for the three vendor calls. `active` is the webhook's stored state."""
    def __init__(self, active=True, remaining=1_000_000, cycle=("2026-11-27", "2026-12-27"), echo_ok=True):
        self.active, self.remaining, self.cycle, self.echo_ok = active, remaining, cycle, echo_ok
        self.puts, self.gets, self.usage_calls = [], 0, 0
        self.webhooks, self.rpc = 0, 0
        self.put_credits = 0                           # credits each PUT adds to the webhook meter

    def usage(self):
        self.usage_calls += 1
        return {"creditsRemaining": self.remaining, "creditCycle": {"start": self.cycle[0], "end": self.cycle[1]},
                "credits": {"webhooks": self.webhooks, "rpc": self.rpc}}

    def put(self, wid, body):
        self.puts.append(body)
        self.webhooks += self.put_credits
        if self.echo_ok:
            self.active = body["active"]
        return {"active": self.active, "authHeader": "set", "webhookURL": body["webhookURL"],
                "disabledAt": None if self.active else "x"}

    def get(self, wid):
        self.gets += 1
        return {"active": self.active}


def tick(v, now):
    return birthcap.tick(now=now, usage_fn=v.usage, put=v.put, get=v.get)


print("== 1. plan_cycle: the arithmetic, both cycle shapes, and the refusals")
T0 = datetime(2026, 11, 27, 0, 0, 30, tzinfo=UTC)
full = birthcap.plan_cycle(T0, {"creditsRemaining": 1_000_000, "creditCycle": {"start": "2026-11-27", "end": "2026-12-27"}},
                           39_611, 0.0)
check("full cycle: 12 windows", full.get("windows") == 12, full)
check("full cycle: allowance clamped to the births reserve's daily ceiling (29,600)",
      full.get("births_allowance_per_day") == config.BIRTHCAP_MAX_BIRTHS_PER_DAY, full)
check("full cycle: on-window > LIVENESS_GAP_SECONDS", full.get("on_s", 0) > config.LIVENESS_GAP_SECONDS, full)
TT = datetime(2026, 11, 17, 12, 0, tzinfo=UTC)
tail = birthcap.plan_cycle(TT, {"creditsRemaining": 100_000, "creditCycle": {"start": "2026-10-27", "end": "2026-11-27"}},
                           39_611, 0.0)
check("tail: the floor of 4 windows", tail.get("windows") == 4, tail)
check("tail: duty ~0.22", 0.2 < tail.get("duty", 0) < 0.25, tail)
tiny = birthcap.plan_cycle(TT, {"creditsRemaining": 9_000, "creditCycle": {"start": "2026-10-27", "end": "2026-11-27"}},
                           39_611, 0.0)
check("tiny allowance: REFUSED (a failed switch-ON would be invisible)", bool(tiny.get("refused")), tiny)
# an allowance that yields a POSITIVE but too-short on-window at every window count down to 1 (2 windows: ~109 s;
# 1 window: ~654 s) must still be refused, not accepted because the window is merely positive
thin = birthcap.plan_cycle(TT, {"creditsRemaining": 12_672, "creditCycle": {"start": "2026-10-27", "end": "2026-11-27"}},
                           39_611, 0.0)
check("a positive on-window at or under LIVENESS_GAP_SECONDS is REFUSED, not accepted", bool(thin.get("refused")), thin)
check("a refused plan wants the feed ON", birthcap.desired(TT, tiny) == "on")
rich = birthcap.plan_cycle(TT, {"creditsRemaining": 1_000_000, "creditCycle": {"start": "2026-10-27", "end": "2026-11-27"}},
                           1_000, 0.0)
check("allowance above the launch rate: always ON", rich.get("always_on") is True, rich)

print("== 2. desired: time-scheduled, the measured on-time fraction is the duty, the phase rotates daily")
on = sum(1 for m in range(0, 1440) if birthcap.desired(T0 + timedelta(minutes=m), full) == "on")
check("over one day the on-minutes match the duty (+-1%)", abs(on / 1440 - full["duty"]) < 0.01, (on, full["duty"]))
day0 = [birthcap.desired(T0 + timedelta(minutes=m), full) for m in range(0, 120)]
day1 = [birthcap.desired(T0 + timedelta(days=1, minutes=m), full) for m in range(0, 120)]
check("the phase differs between consecutive days", day0 != day1)

print("== 3. tick: disabled, first tick, a switch OFF and ON, the echo")
reset()
v = Vendor()
r = tick(v, T0)
check("disabled, fresh state: ONE ON-PUT confirms the feed (no GET, no usage read)",
      r["action"] == "disabled-restored-on" and len(v.puts) == 1 and v.puts[0]["active"] is True and v.gets == 0
      and v.usage_calls == 0, r)
r = tick(v, T0 + timedelta(minutes=1))
check("disabled with ON confirmed: no vendor call at all", r["action"] == "disabled" and len(v.puts) == 1 and v.gets == 0, r)
reset()
v = Vendor()
enable()
store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), plan=full))
off_time = next(T0 + timedelta(minutes=m) for m in range(1, 1440) if birthcap.desired(T0 + timedelta(minutes=m), full) == "off")
r = tick(v, off_time)
check("first enabled tick learns the applied state with ONE GET, logged and charged", v.gets == 1 and switches()[0]["kind"] == "get", switches())
check("then switches OFF with a full-body PUT", v.puts and v.puts[-1]["active"] is False and v.puts[-1]["webhookURL"], v.puts)
check("the PUT body carries NO authHeader (the controller never holds the secret)", "authHeader" not in v.puts[-1])
check("the switch record is ok and charged", switches()[-1]["ok"] is True and switches()[-1]["credits"] == 100, switches()[-1])
st = store.load_state(birthcap.STATE, {})
check("applied state is off", st.get("applied") == "off", st)
on_time = next(off_time + timedelta(minutes=m) for m in range(1, 1440) if birthcap.desired(off_time + timedelta(minutes=m), full) == "on")
r = tick(v, on_time)
check("switches back ON at the next on-window", v.active is True and switches()[-1]["requested"] == "on", switches()[-1])
journal = open(os.path.join(config.STATE_DIR, "spend-journal-%s.jsonl" % on_time.strftime("%Y-%m"))).read()
check("every vendor call is charged to the ledger journal as `switch`", journal.count('"kind": "switch"') == 3, journal)

print("== 4. an echo that does not confirm the switch pages and forgets the applied state")
reset(); enable(); v = Vendor(echo_ok=False)
store.save_state(birthcap.STATE, {"applied": "on", "plan": full})
r = tick(v, off_time)
check("a mismatched echo pages", any(p["dedupe_key"].startswith("birthcap-switch-failed") for p in r["pages"]), r["pages"])
check("and the applied state is unknown (re-learned next tick)", store.load_state(birthcap.STATE, {}).get("applied") is None)

print("== 5. fail closed to ON: unreadable record, missing handshake, the breaker")
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": full})
os.remove(config.BIRTHCAP_SWITCHES)
r = tick(v, off_time)
check("switch log absent: no OFF switch, critical page", not v.puts and any(p["dedupe_key"] == "birthcap-record-unreadable" for p in r["pages"]), r)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "off", "plan": full, "off_at": off_time.isoformat()})
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write("{not json" + NL)
r = tick(v, off_time + timedelta(minutes=1))
check("switch log unparseable while OFF: forced back ON", v.puts and v.puts[-1]["active"] is True, v.puts)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": full})
saved = liveness.PLANNED_OFF_READER
liveness.PLANNED_OFF_READER = False
r = tick(v, off_time)
liveness.PLANNED_OFF_READER = saved
check("no planned-off reader in liveness: no OFF switch, page", not v.puts and any(p["dedupe_key"] == "birthcap-handshake" for p in r["pages"]), r)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": full})
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    for i in range(config.birthcap_switch_ceiling(12)):
        fh.write(json.dumps({"kind": "put", "requested_at": off_time.replace(hour=0, minute=1).isoformat(), "ok": True}) + NL)
r = tick(v, off_time)
check("breaker at the ceiling: no OFF switch, page", not v.puts and any(p["dedupe_key"].startswith("birthcap-breaker") for p in r["pages"]), r)

reset(); enable(); v = Vendor(active=False, echo_ok=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
on_t2 = next(T0 + timedelta(minutes=m) for m in range(0, 1440) if birthcap.desired(T0 + timedelta(minutes=m), full) == "on")
for i in range(80):                                           # an ON-PUT that never takes, once a minute
    tick(v, on_t2 + timedelta(seconds=30 * i))
hard = config.birthcap_switch_ceiling(12) + birthcap.HARD_MARGIN
calls = sum(1 for r in switches() if r.get("kind") in ("put", "get"))
check("a switch that keeps failing stops at the HARD daily ceiling (no runaway at 100 credits a minute)",
      calls <= hard and len(v.puts) + v.gets <= hard, (calls, len(v.puts), v.gets, hard))

reset(); enable(); v = Vendor(active=False, echo_ok=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
open(config.BIRTHCAP_SWITCHES, "a").write("not json" + chr(10))  # stays unparseable after appends: only the state counter caps
for i in range(80):
    tick(v, on_t2 + timedelta(seconds=30 * i))
check("with the switch log unreadable, the state counter still holds the hard ceiling",
      len(v.puts) + v.gets <= hard, (len(v.puts), v.gets, hard))

for name, pl in (("full", full), ("tail", tail)):            # r2-5: the breaker's headroom across the UTC-day phase jump
    w = int(pl["windows"]); start = birthcap._ts(pl["cycle_start"]); worst = 0
    prev = birthcap.desired(start - timedelta(minutes=1), pl)
    for d in range(10):
        n = 0
        for m in range(1440):
            cur = birthcap.desired(start + timedelta(days=d, minutes=m), pl)
            n += cur != prev
            prev = cur
        worst = max(worst, n)
    check("%s plan: scheduled switches per UTC day, phase jump at midnight included, stay under the breaker" % name,
          worst <= 2 * w + 1 < config.birthcap_switch_ceiling(w), (worst, w, config.birthcap_switch_ceiling(w)))

print("== 6. a switch-OFF that succeeded at the API but births keep arriving")
reset(); enable(); v = Vendor(active=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full, "off_at": off_time.isoformat(), "off_rate_per_min": 24})
add_births([off_time + timedelta(seconds=30 + i) for i in range(5)])                    # inside the grace: ignored
add_births([off_time + timedelta(minutes=3, seconds=i) for i in range(10)])              # 10 rows in one minute after
r = tick(v, off_time + timedelta(minutes=5))
check("rows over max(4, 0.25 x 24) in a minute after the grace page", any(p["dedupe_key"].startswith("birthcap-off-failed") for p in r["pages"]), r["pages"])
reset(); enable(); v = Vendor(active=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full, "off_at": off_time.isoformat(), "off_rate_per_min": 24})
add_births([off_time + timedelta(seconds=10 + i * 3) for i in range(15)])                # a dense in-flight tail (<60 s)
r = tick(v, off_time + timedelta(minutes=5))
check("an in-flight tail inside the grace does not page", not any(p["dedupe_key"].startswith("birthcap-off-failed") for p in r["pages"]), r["pages"])

print("== 7. disabling restores the feed")
reset(); enable(False); v = Vendor(active=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
r = tick(v, off_time)
check("flag removed while OFF: the feed is switched back ON", v.puts and v.puts[-1]["active"] is True and r["action"] == "disabled-restored-on", r)
_jp = os.path.join(config.STATE_DIR, "spend-journal-%s.jsonl" % off_time.strftime("%Y-%m"))
_journal = open(_jp).read() if os.path.exists(_jp) else ""
st = store.load_state(birthcap.STATE, {})
check("... and the billed restore is charged like any vendor call: one `switch` in the ledger journal AND the window "
      "counter moves by its credits (§9e Part B: a window open across a disable must still pair it)",
      _journal.count('"kind": "switch"') == 1 and st.get("switch_charged") == config.SWITCH_CREDITS,
      (_journal, st.get("switch_charged")))
reset(); enable(False); v = Vendor(active=False)
store.save_state(birthcap.STATE, {"applied": None, "plan": full})      # what every failure leaves (gate A C-1)
r = tick(v, off_time)
check("flag removed with the applied state UNKNOWN: the feed is switched back ON",
      len(v.puts) == 1 and v.active is True and r["action"] == "disabled-restored-on", r)
reset(); enable(False); v = Vendor(active=False, echo_ok=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
keys = set()
for i in range(60):
    r = tick(v, off_time + timedelta(minutes=i))
    keys |= {p["dedupe_key"] for p in r["pages"]}
hard_d = config.birthcap_switch_ceiling(12) + birthcap.HARD_MARGIN
check("disabled and the restore keeps failing: it RETRIES each tick, up to the hard ceiling, then stops",
      len(v.puts) == hard_d and r["action"] == "disabled-restore-capped", (len(v.puts), hard_d, r["action"]))
check("one page key per UTC day per cause while the restore fails (failed PUT, then the hard ceiling)",
      keys == {"birthcap-disabled-not-restored-%s" % off_time.strftime("%Y-%m-%d"),
               "birthcap-disabled-restore-capped-%s" % off_time.strftime("%Y-%m-%d")}, keys)
reset(); enable(False); v = Vendor(active=False, echo_ok=False)
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
open(config.BIRTHCAP_SWITCHES, "a").write("not json" + chr(10))  # log unparseable: only the state counter caps
for i in range(60):
    tick(v, off_time + timedelta(minutes=i))
check("disabled, log unparseable: the state counter still caps the restore attempts", len(v.puts) == hard_d, len(v.puts))

print("== 8. the backstop: a day that reaches its allowance stops and is recorded as truncated")
reset(); enable(); v = Vendor()
small = dict(full, births_allowance_per_day=5)
store.save_state(birthcap.STATE, {"applied": "on", "plan": small})
on_t = next(T0 + timedelta(minutes=m) for m in range(0, 1440) if birthcap.desired(T0 + timedelta(minutes=m), small) == "on")
add_births([on_t - timedelta(seconds=10 + i) for i in range(6)])
r = tick(v, on_t)
check("allowance reached inside an on-window: switched OFF", v.puts and v.puts[-1]["active"] is False, v.puts)
check("a truncated-day record is written", os.path.exists(config.BIRTHCAP_TRUNCATED) and on_t.strftime("%Y-%m-%d") in open(config.BIRTHCAP_TRUNCATED).read())

print("== 9. liveness: planned silence is a planned_off record, unplanned silence is still a gap")
reset()
t_off = datetime(2026, 11, 28, 1, 0, tzinfo=UTC)
t_on = t_off + timedelta(minutes=40)
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
    fh.write(json.dumps({"kind": "put", "requested": "on", "requested_at": t_on.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0}})
add_births([t_off - timedelta(seconds=5), t_on + timedelta(seconds=55)])
s = liveness.check(t_on + timedelta(minutes=2))
gaps = open(liveness.GAPS_PATH).read() if os.path.exists(liveness.GAPS_PATH) else ""
check("a 40-minute planned off window writes NO gap", gaps == "", gaps)
check("and writes a planned_off record with no loss estimate", os.path.exists(config.BIRTHCAP_PLANNED_OFF)
      and "estimated_rows_missed" not in open(config.BIRTHCAP_PLANNED_OFF).read())
check("no open gap", liveness.open_gap() is None)
reset()
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
    fh.write(json.dumps({"kind": "put", "requested": "on", "requested_at": t_on.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0}})
add_births([t_off - timedelta(seconds=5), t_on + timedelta(minutes=30)])               # the switch-ON failed: 30 min dark
s = liveness.check(t_on + timedelta(minutes=31))
check("silence past the on-switch beyond the gap threshold is still a gap", os.path.exists(liveness.GAPS_PATH)
      and "feed_gap" in open(liveness.GAPS_PATH).read())
reset()
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0},
                                  "last_row_at": (t_off - timedelta(seconds=5)).isoformat()})
s = liveness.check(t_off + timedelta(hours=30))
check("an OFF with no ON is bounded: 30 h of silence opens a gap", liveness.open_gap() is not None, s)
reset()
os.remove(config.BIRTHCAP_SWITCHES)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0},
                                  "last_row_at": (t_off - timedelta(seconds=5)).isoformat()})
s = liveness.check(t_off + timedelta(minutes=20))
check("an unreadable switch log gives no planned windows: silence opens a gap", liveness.open_gap() is not None, s)
# B-1: a gap opened while the switch log was unreadable must not "recover" when the log later covers it
s = liveness.check(t_off + timedelta(minutes=20))
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
s = liveness.check(t_off + timedelta(minutes=25))
gaps = open(liveness.GAPS_PATH).read() if os.path.exists(liveness.GAPS_PATH) else ""
check("an open gap later covered by a planned window is NOT closed as a recovery (no row arrived)",
      "prospective_closed" not in gaps and liveness.open_gap() is None
      and "reclassified_open_gap" in open(config.BIRTHCAP_PLANNED_OFF).read(), (gaps, liveness.open_gap()))
# B-2: births keep arriving 29 min after an echoed OFF (it did not take), then the feed really dies
reset()
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0}})
add_births([t_off + timedelta(minutes=m) for m in range(-5, 30)])
s = liveness.check(t_off + timedelta(minutes=29, seconds=30))
s = liveness.check(t_off + timedelta(minutes=50))
check("a failed OFF (rows 29 min after it) followed by real silence opens a gap within the threshold, not at ~24 h",
      liveness.open_gap() is not None, s)
reset()
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0}})
add_births([t_off - timedelta(seconds=5)] + [t_off + timedelta(seconds=x) for x in (10, 30, 49, 90)])
s = liveness.check(t_off + timedelta(minutes=50))
check("an in-flight tail up to 90 s after the OFF leaves the planned window whole (no gap)", liveness.open_gap() is None, s)
# a controller that died with the feed OFF: its last_tick ends the planned window
reset()
with open(config.BIRTHCAP_SWITCHES, "w") as fh:
    fh.write(json.dumps({"kind": "put", "requested": "off", "requested_at": t_off.isoformat(), "ok": True}) + NL)
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0},
                                  "last_row_at": (t_off - timedelta(seconds=5)).isoformat()})
store.save_state(config.BIRTHCAP_STATE_NAME, {"last_tick": (t_off + timedelta(minutes=1)).isoformat()})
s = liveness.check(t_off + timedelta(minutes=30))
check("a controller silent since off+1 min: 30 min of silence is a gap, not a planned window", liveness.open_gap() is not None, s)
store.save_state(config.BIRTHCAP_STATE_NAME, {"last_tick": (t_off + timedelta(minutes=29)).isoformat()})
store.save_state(liveness.STATE, {"cursor": {"path": liveness._birth_path(t_off), "offset": 0},
                                  "last_row_at": (t_off - timedelta(seconds=5)).isoformat()})
s = liveness.check(t_off + timedelta(minutes=30))
check("a controller still ticking: the same silence stays planned", liveness.open_gap() is None, s)

print("== 10. the hourly cross-check against the vendor's own counter")
reset(); enable(); v = Vendor()
h0 = datetime(2026, 11, 28, 3, 0, 20, tzinfo=UTC)
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 1000, 500
tick(v, h0)                                                    # first snapshot of hour 03
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])   # 300 births in hour 03
v.webhooks, v.rpc = 1000 + 300, 500                            # the vendor agrees, no RPC
r = tick(v, h0 + timedelta(hours=1))
check("vendor = census births: no divergence page", not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
add_births([h0 + timedelta(hours=1, minutes=5, seconds=i) for i in range(300)])
v.webhooks, v.rpc = 1300 + 600, 500 + 400                      # vendor charged 600 for 300 births, and 400 RPC
r = tick(v, h0 + timedelta(hours=2))
check("vendor charged 2x the census births in ONE hour: NO hourly divergence page (the page moved to the ON-window compare)",
      not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get("2026-11-28T04", {})
check("... but the hour row records it: verdict divergent, share 0.5, paged True (that hour ALSO paged an RPC overrun)",
      hrow.get("verdict") == "divergent" and hrow.get("share") == 0.5 and hrow.get("paged") is True, hrow)
check("RPC spend above a zero allowance: overrun page and a replan",
      any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"]) and store.load_state(birthcap.STATE, {}).get("replan"), r["pages"])
check("two replan triggers in one hour are JOINED, the second does not overwrite the first (divergence + rpc overrun)",
      set(str(store.load_state(birthcap.STATE, {}).get("replan")).split("+"))
      == {"divergence-hour:2026-11-28T04", "rpc-overrun:2026-11-28T04"}, store.load_state(birthcap.STATE, {}).get("replan"))

store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), replan=False))
add_births([h0 + timedelta(hours=2, minutes=5, seconds=i) for i in range(300)])
v.webhooks = 1900 + 600                                        # 2x again, and NO rpc this hour: only the divergence can replan
r = tick(v, h0 + timedelta(hours=3))
check("a webhook divergence alone sets replan, IMMEDIATELY and with its reason (the webhook leg is the births budget)",
      not any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"])
      and store.load_state(birthcap.STATE, {}).get("replan") == "divergence-hour:2026-11-28T05", r["pages"])
check("... and that divergence-only hour's row is paged False (no page was sent for it)",
      store.load_state(birthcap.STATE, {}).get("hours", {}).get("2026-11-28T05", {}).get("paged") is False,
      store.load_state(birthcap.STATE, {}).get("hours", {}).get("2026-11-28T05"))
r = tick(v, h0 + timedelta(hours=3, minutes=1))
rp = store.load_state(birthcap.STATE, {}).get("replans", [])
hb = store.load_state(birthcap.STATE, {}).get("hours", {})
check("the replan is RECORDED with its reason and the allowance before and after (Langston condition 1)",
      rp and rp[-1]["reason"] == "divergence-hour:2026-11-28T05" and "allowance_before" in rp[-1] and "allowance_after" in rp[-1], rp[-1:])
h0 = h0 + timedelta(hours=1)
store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), replan=False))
add_births([h0 + timedelta(hours=2, minutes=5, seconds=i) for i in range(300)])
with open(config.BIRTHCAP_SWITCHES, "a") as fh:                # a switch GET in that hour: the vendor bills it 100
    fh.write(json.dumps({"kind": "get", "requested_at": (h0 + timedelta(hours=2, minutes=30)).isoformat(),
                         "credits": config.SWITCH_CREDITS, "echo_active": True}) + NL)
v.webhooks = 2500 + config.SWITCH_CREDITS                      # the meter moved by the switch alone: births are not counted
r = tick(v, h0 + timedelta(hours=3))
check("a frozen vendor counter (vendor +100 = the switch alone, census +300 births) pages under its OWN key, not as a divergence",
      any(p["dedupe_key"].startswith("birthcap-vendor-meter-frozen-") for p in r["pages"])
      and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
check("... and asks for a replan with its reason", store.load_state(birthcap.STATE, {}).get("replan") == "frozen-meter:2026-11-28T06",
      store.load_state(birthcap.STATE, {}).get("replan"))
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 1000, 0
tick(v, h0)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(100)])  # 100 births: under the 200 the gate needs
with open(config.BIRTHCAP_SWITCHES, "a") as fh:
    fh.write(json.dumps({"kind": "get", "requested_at": (h0 + timedelta(minutes=30)).isoformat(),
                         "credits": config.SWITCH_CREDITS, "echo_active": True}) + NL)
v.webhooks = 1000 + config.SWITCH_CREDITS
r = tick(v, h0 + timedelta(hours=1))
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(h0.strftime("%Y-%m-%dT%H"), {})
check("the frozen gate counts BIRTHS, not births + switches: 100 births + a 100-credit switch is not a frozen meter",
      hrow.get("verdict") != "frozen"
      and not any(p["dedupe_key"].startswith("birthcap-vendor-meter-frozen") for p in r["pages"]), (hrow, r["pages"]))
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 1000, 0
tick(v, h0)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])
v.webhooks = 1000 + 150                                        # the vendor bills HALF the census: under-billing is tested too
tick(v, h0 + timedelta(hours=1))
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(h0.strftime("%Y-%m-%dT%H"), {})
check("an hour the vendor UNDER-bills (150 for 300) is divergent too (the gate's base is the larger side)",
      hrow.get("verdict") == "divergent" and hrow.get("share") == 0.5, hrow)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 1000, 500
tick(v, h0)
v.webhooks, v.rpc = 1000, 501                                 # one rpc credit with a zero allowance
r = tick(v, h0 + timedelta(hours=1))
check("ANY rpc spend against a zero allowance pages (no absolute +50 slack)", any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"]), r["pages"])

reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
h1 = datetime(2026, 11, 28, 10, 37, 20, tzinfo=UTC)          # the first snapshot lands mid-hour (switch-on, restart)
v.webhooks, v.rpc = 5000, 500
tick(v, h1)
add_births([h1.replace(minute=5) + timedelta(seconds=i) for i in range(700)])   # births from the WHOLE hour 10
v.webhooks = 5148                                              # the vendor delta covers only 10:37 -> 11:00
r = tick(v, h1.replace(hour=11, minute=0, second=20))
check("a mid-hour first snapshot is NOT compared (no false divergence, no false replan)",
      not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"])
      and not store.load_state(birthcap.STATE, {}).get("replan"), r["pages"])
add_births([h1.replace(hour=11, minute=5) + timedelta(seconds=i) for i in range(300)])
v.webhooks = 5148 + 600                                        # the next, WHOLE hour is compared again (2x: pages)
r = tick(v, h1.replace(hour=12, minute=0, second=20))
check("the next whole hour is compared again (its row carries a verdict)",
      store.load_state(birthcap.STATE, {}).get("hours", {}).get("2026-11-28T11", {}).get("verdict") == "divergent",
      store.load_state(birthcap.STATE, {}).get("hours", {}))
# the vendor's counter is per billing cycle and resets (the 27th): a negative hour is a reset, never a divergence
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 818_000, 25_000
tick(v, h0)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])
v.cycle = ("2026-12-27", "2027-01-27")                       # the cycle turned inside the hour
v.webhooks, v.rpc = 120, 0
r = tick(v, h0 + timedelta(hours=1))
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(h0.strftime("%Y-%m-%dT%H"), {})
check("a cycle reset inside an hour (vendor 818,000 -> 120, cycle changed) is verdict reset: no replan, no page",
      hrow.get("verdict") == "reset" and not store.load_state(birthcap.STATE, {}).get("replan")
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen", "birthcap-vendor-meter-backwards"))
                  for p in r["pages"]), (hrow, r["pages"]))
check("... and the row records WHICH test fired: cycle (Langston §9e (a))", hrow.get("reset_test") == "cycle", hrow)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 818_000, 25_000
tick(v, h0)
_st = store.load_state(birthcap.STATE, {})
_st["usage_snap"].pop("cycle", None)                           # a snapshot taken before the cycle was recorded
store.save_state(birthcap.STATE, _st)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])
v.webhooks, v.rpc = 120, 0
r = tick(v, h0 + timedelta(hours=1))
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(h0.strftime("%Y-%m-%dT%H"), {})
check("a snapshot with no cycle and a negative delta is a reset by the FALLBACK, and says so: reset_test negative-delta",
      hrow.get("verdict") == "reset" and hrow.get("reset_test") == "negative-delta"
      and not store.load_state(birthcap.STATE, {}).get("replan"), hrow)
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 818_000, 25_000
tick(v, h0)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])
v.webhooks, v.rpc = 120, 25_000                                # the SAME cycle: the counter went backwards inside it
r = tick(v, h0 + timedelta(hours=1))
hk = h0.strftime("%Y-%m-%dT%H")
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(hk, {})
check("a negative delta inside the SAME cycle is NOT a reset: verdict backwards, paged, reset_test None",
      hrow.get("verdict") == "backwards" and hrow.get("paged") is True and hrow.get("reset_test") is None, hrow)
check("... it pages under its OWN key, not as a divergence or a frozen meter",
      any(p["dedupe_key"] == "birthcap-vendor-meter-backwards-%s" % hk for p in r["pages"])
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen")) for p in r["pages"]),
      r["pages"])
check("... and asks for a replan with its reason", store.load_state(birthcap.STATE, {}).get("replan") == "backwards-meter:%s" % hk,
      store.load_state(birthcap.STATE, {}).get("replan"))
# the exact test is the cycle identity the usage read carries: a reset after a quiet cycle can read as a POSITIVE delta
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(full, always_on=True)})
v.webhooks, v.rpc = 200, 10
tick(v, h0)
add_births([h0 + timedelta(minutes=5, seconds=i) for i in range(300)])
v.cycle = ("2026-12-27", "2027-01-27")                       # the cycle turned; the new cycle's counts are HIGHER
v.webhooks, v.rpc = 900, 600
r = tick(v, h0 + timedelta(hours=1))
hrow = store.load_state(birthcap.STATE, {}).get("hours", {}).get(h0.strftime("%Y-%m-%dT%H"), {})
check("a cycle change with a POSITIVE delta (200 -> 900 across the 27th) is verdict reset (reset_test cycle): no replan, no page",
      hrow.get("verdict") == "reset" and hrow.get("reset_test") == "cycle" and not store.load_state(birthcap.STATE, {}).get("replan")
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen")) for p in r["pages"]),
      (hrow, r["pages"]))
check("... and the rpc counter rising across the reset (10 -> 600, zero allowance) is not an overrun",
      not any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"]), r["pages"])
unit = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "systemd", "token-watch-birthcap.service")).read()
tasks = int(re.search(r"^TasksMax=(\d+)", unit, re.M).group(1))
check("the unit's TasksMax leaves room for the node mint (measured minimum 48; 32 aborted rc 134)", tasks >= 48, tasks)

print("== 10b. the ON-window compare (Langston, 2026-11-20): the divergence page, the frozen meter, the cumulative leg")
W_ON = next(T0 + timedelta(minutes=m) for m in range(1, 1440)
            if birthcap.desired(T0 + timedelta(minutes=m), full) == "on"
            and birthcap.desired(T0 + timedelta(minutes=m - 1), full) == "off")
W_OFF = next(W_ON + timedelta(minutes=m) for m in range(1, 1440) if birthcap.desired(W_ON + timedelta(minutes=m), full) == "off")


def window_run(vendor_extra=0, births_n=300, tail=(), late=(), close_after=timedelta(minutes=3), pre=None, new_cycle=None):
    """One planned ON window through the production tick: ON switch, births inside it, OFF switch, then the close.
    The meter moves by births + the two switches' credits (+ vendor_extra). Returns the last tick's result and state."""
    reset(); enable(); v = Vendor(active=False); v.put_credits = config.SWITCH_CREDITS; v.webhooks = 50_000
    store.save_state(birthcap.STATE, dict({"applied": "off", "plan": full}, **(pre or {})))
    tick(v, W_ON)
    add_births([W_ON + timedelta(seconds=30 + i * 10) for i in range(births_n)])
    v.webhooks += births_n + vendor_extra
    if new_cycle:
        v.cycle = new_cycle                                    # the billing cycle turned inside the window, WITH the counter
    tick(v, W_OFF)
    add_births([W_OFF + t for t in tail] + [W_OFF + t for t in late])
    v.webhooks += len(tail) + len(late)
    r = tick(v, W_OFF + timedelta(seconds=60))
    st1 = store.load_state(birthcap.STATE, {})
    r2 = tick(v, W_OFF + close_after)
    return r, st1, r2, store.load_state(birthcap.STATE, {}), v


r, st1, r2, st2, v = window_run()
check("the ON switch opened a window at a snapshot taken BEFORE its own 100 credits", (st1.get("window") or {}).get("web") == 50_000,
      st1.get("window"))
check("the window is NOT compared before the OFF + 120 s proof time", not st1.get("windows_checked"), st1.get("windows_checked"))
row = (st2.get("windows_checked") or [{}])[-1]
check("a clean window closes after a quiet minute: vendor = births + both switches, verdict ok, no page",
      row.get("verdict") == "ok" and row.get("vendor_webhooks") == 500 and row.get("births") == 300
      and row.get("switch_credits") == 200 and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r2["pages"]), row)
check("the closed window is gone from state (the next ON opens a fresh one)", "window" not in st2, st2.get("window"))
# the install transition: a window opened by the previous install has no `sw`. Its close must not throw (on the ON path
# that would stop the feed coming back), and its switch credits cannot be paired: recorded UNPAIRED, out of the 72 h sum.
reset(); enable(); v = Vendor(active=False); v.put_credits = config.SWITCH_CREDITS; v.webhooks = 50_000
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
tick(v, W_ON)
_st = store.load_state(birthcap.STATE, {}); _st["window"].pop("sw", None); store.save_state(birthcap.STATE, _st)
add_births([W_ON + timedelta(seconds=30 + i * 10) for i in range(300)])
v.webhooks += 300
r_a = tick(v, W_OFF)
r_b = tick(v, W_OFF + timedelta(minutes=3))
st_u = store.load_state(birthcap.STATE, {})
row = (st_u.get("windows_checked") or [{}])[-1]
check("a window opened before the counter existed closes UNPAIRED: no page, switch credits unknown (None), kept out of the "
      "cumulative leg and counted aside", row.get("verdict") == "unpaired" and row.get("switch_credits") is None
      and not row.get("paged") and not any(p["dedupe_key"].startswith("birthcap-") and "window" in p["dedupe_key"]
                                             for p in r_a["pages"] + r_b["pages"])
      and (st_u.get("cumulative") or {}).get("windows") == 0 and (st_u.get("cumulative") or {}).get("unpaired_windows") == 1,
      (row, st_u.get("cumulative")))
r, st1, r2, st2, v = window_run(tail=[timedelta(seconds=20), timedelta(seconds=45)])
row = (st2.get("windows_checked") or [{}])[-1]
check("an in-flight tail inside the grace is counted on both sides: clean", row.get("verdict") == "ok" and row.get("births") == 302, row)
r, st1, r2, st2, v = window_run(vendor_extra=300)
pg = r["pages"] + r2["pages"]
check("vendor charged 2x the births across a WHOLE window: a divergence page for that window (here compared when the replan's"
      " schedule switched straight back ON, end 'reopened')",
      any(p["dedupe_key"].startswith("birthcap-divergence-" + W_ON.strftime("%Y%m%dT%H%M%S")) for p in pg)
      and any(w.get("verdict") == "divergent" and w.get("opened_at") == W_ON.isoformat() for w in st2.get("windows_checked", [])),
      (pg, st2.get("windows_checked")))
reset(); enable(); v = Vendor(active=False); v.put_credits = config.SWITCH_CREDITS; v.webhooks = 50_000
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
tick(v, W_ON)
add_births([W_ON + timedelta(seconds=30 + i * 10) for i in range(300)])
tick(v, W_OFF)
r2 = tick(v, W_OFF + timedelta(minutes=3))
check("a meter that moved only by the two switches' 200 credits across a window (300 births) pages FROZEN under its own key",
      any(p["dedupe_key"].startswith("birthcap-vendor-meter-frozen-window-") for p in r2["pages"])
      and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r2["pages"]), r2["pages"])
r, st1, r2, st2, v = window_run(births_n=150, vendor_extra=-150)
row = (st2.get("windows_checked") or [{}])[-1]
check("the window frozen gate counts BIRTHS: 150 births and a meter moved by the switches alone is not a frozen meter",
      row.get("verdict") != "frozen"
      and not any(p["dedupe_key"].startswith("birthcap-vendor-meter-frozen") for p in r["pages"] + r2["pages"]), row)
# an under-estimated tail: a birth after the grace delays the close to the next quiet minute, and is counted
r, st1, r2, st2, v = window_run(late=[timedelta(seconds=150)], close_after=timedelta(seconds=170))
check("a birth after the grace (off+150 s) is not a quiet minute: the window waits", not st2.get("windows_checked"),
      st2.get("windows_checked"))
r3 = tick(v, W_OFF + timedelta(minutes=5))
row = (store.load_state(birthcap.STATE, {}).get("windows_checked") or [{}])[-1]
check("... and closes on the next quiet minute with the late birth counted on both sides (clean)",
      row.get("verdict") == "ok" and row.get("births") == 301 and row.get("end") == "off", row)
# a failed OFF (births every minute) still closes, at the quiet-max age, marked not-quiet
reset(); enable(); v = Vendor(active=False); v.put_credits = config.SWITCH_CREDITS; v.webhooks = 50_000
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
tick(v, W_ON)
add_births([W_ON + timedelta(seconds=30 + i * 10) for i in range(300)])
v.webhooks += 300
tick(v, W_OFF)
add_births([W_OFF + timedelta(seconds=90 + 60 * i) for i in range(20)])
v.webhooks += 20
for m in (3, 10, 14):
    tick(v, W_OFF + timedelta(minutes=m))
check("births every minute after the OFF: no compare before the quiet-max age",
      not store.load_state(birthcap.STATE, {}).get("windows_checked"))
tick(v, W_OFF + timedelta(seconds=config.BIRTHCAP_WINDOW_QUIET_MAX_S + 30))
row = (store.load_state(birthcap.STATE, {}).get("windows_checked") or [{}])[-1]
check("... then it is compared anyway, marked off-not-quiet", row.get("end") == "off-not-quiet", row)
# the live 11-18 hour-edge split, inside one window: the hourly rows disagree, the window does not
reset(); enable(); v = Vendor(active=False); v.put_credits = config.SWITCH_CREDITS; v.webhooks = 50_000
store.save_state(birthcap.STATE, {"applied": "off", "plan": full})
tick(v, W_ON)
edge = (W_ON + timedelta(hours=1)).replace(minute=0, second=0)
add_births([edge - timedelta(minutes=30) + timedelta(seconds=i * 3) for i in range(532)])   # census: all before the edge (to :56:36)
v.webhooks += 396                                                                          # the vendor bills 396 of them before it
tick(v, edge + timedelta(seconds=20))
v.webhooks += 136                                                                          # ... and the rest just after
# the divergent hour replans at once (tested above); hold the schedule so this case tests only the window compare
store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), replan=False))
tick(v, W_OFF)
r2 = tick(v, W_OFF + timedelta(minutes=3))
row = (store.load_state(birthcap.STATE, {}).get("windows_checked") or [{}])[-1]
wrow = [w for w in store.load_state(birthcap.STATE, {}).get("windows_checked", []) if w.get("opened_at") == W_ON.isoformat()]
check("the live hour-edge split (396 / 532, then +136) pairs clean over the whole window: verdict ok, no divergence page",
      wrow and wrow[-1].get("verdict") == "ok" and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r2["pages"]), wrow)
# a window with no OFF boundary (always_on) is cut at two plan blocks, never a wall-clock constant
check("the no-OFF bound is two plan blocks: W=12 -> 4 h, an always-on plan -> two W_MIN blocks (12 h)",
      birthcap._window_bound_s(full) == 2 * full["block_s"] == 14400.0
      and birthcap._window_bound_s(dict(full, always_on=True, block_s=None)) == 2 * 86400.0 / config.BIRTHCAP_W_MIN)
reset(); enable(); v = Vendor(active=True); v.webhooks = 50_000
always = dict(full, always_on=True, births_allowance_per_day=10 ** 6)
always.pop("block_s", None)
store.save_state(birthcap.STATE, {"applied": "on", "plan": always})
ta = datetime(2026, 11, 28, 1, 0, 30, tzinfo=UTC)
tick(v, ta)
check("ON with no window (install, restore) adopts one at a snapshot", (store.load_state(birthcap.STATE, {}).get("window") or {}).get("reason") == "adopt")
add_births([ta + timedelta(minutes=10 + i) for i in range(400)])
v.webhooks += 400
tick(v, ta + timedelta(hours=11, minutes=50))
check("... it is not cut before two blocks", not store.load_state(birthcap.STATE, {}).get("windows_checked"))
tick(v, ta + timedelta(hours=12, minutes=1))
stc = store.load_state(birthcap.STATE, {})
row = (stc.get("windows_checked") or [{}])[-1]
check("... and at two blocks it is cut, compared clean, and a new window continues from the same snapshot",
      row.get("end") == "cut" and row.get("verdict") == "ok" and (stc.get("window") or {}).get("reason") == "cut"
      and (stc.get("window") or {}).get("web") == 50_400, (row, stc.get("window")))
check("... and the continuing window carries the billing cycle it was opened in",
      (stc.get("window") or {}).get("cycle") == "2026-11-27", stc.get("window"))


# Langston §9e Part A: "a switch whose requested_at equals the compare instant is excluded by opened <= ts < now while the
# vendor delta has already absorbed it ... worth one Part-B test". A GET is billed like a PUT, so this fake's GET moves the
# meter; the window must pair each switch charge with the meter delta it landed in, by code order, never by timestamp.
class GetBills(Vendor):
    def get(self, wid):
        self.webhooks += config.SWITCH_CREDITS
        return Vendor.get(self, wid)


reset(); enable(); v = GetBills(active=True); v.webhooks = 50_000
store.save_state(birthcap.STATE, {"plan": always})            # applied lost: this tick GETs it, then adopts a window
tick(v, ta)
w0 = store.load_state(birthcap.STATE, {}).get("window") or {}
check("applied lost: one GET, billed, then a window adopted at a snapshot taken AFTER the GET's charge",
      v.gets == 1 and w0.get("reason") == "adopt" and w0.get("web") == 50_000 + config.SWITCH_CREDITS, (v.gets, w0))
add_births([ta + timedelta(minutes=10 + i) for i in range(400)])
v.webhooks += 400
r = tick(v, ta + timedelta(hours=12, minutes=1))
stc = store.load_state(birthcap.STATE, {})
row = (stc.get("windows_checked") or [{}])[-1]
check("... the GET charged BEFORE the adopt snapshot is not counted inside the window: 400 births, 0 switch credits, ok",
      row.get("vendor_webhooks") == 400 and row.get("births") == 400 and row.get("switch_credits") == 0
      and row.get("verdict") == "ok" and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), row)
# the cut tick itself re-learns a lost applied state: its GET lands in the meter delta at the compare instant
st_ = store.load_state(birthcap.STATE, {}); st_.pop("applied", None); store.save_state(birthcap.STATE, st_)
add_births([ta + timedelta(hours=12, minutes=10 + i) for i in range(400)])
v.webhooks += 400
r = tick(v, ta + timedelta(hours=24, minutes=2))
stc = store.load_state(birthcap.STATE, {})
row = (stc.get("windows_checked") or [{}])[-1]
check("a GET in the cut's own tick IS in the vendor delta and IS counted: 500 = 400 births + 100, verdict ok",
      v.gets == 2 and row.get("vendor_webhooks") == 400 + config.SWITCH_CREDITS and row.get("switch_credits") == config.SWITCH_CREDITS
      and row.get("verdict") == "ok" and not any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), row)
add_births([ta + timedelta(hours=24, minutes=10 + i) for i in range(400)])
v.webhooks += 400
r = tick(v, ta + timedelta(hours=36, minutes=3))
row = (store.load_state(birthcap.STATE, {}).get("windows_checked") or [{}])[-1]
check("... and the window the cut reopened does not count that GET a second time: 400 births, 0 switch credits, ok",
      row.get("vendor_webhooks") == 400 and row.get("switch_credits") == 0 and row.get("verdict") == "ok", row)
# the cumulative leg: one-sided, the money direction
over = [{"opened_at": (W_ON - timedelta(hours=h + 1)).isoformat(), "closed_at": (W_ON - timedelta(hours=h)).isoformat(),
         "vendor_webhooks": 1_100, "births": 900, "switch_credits": 100, "verdict": "ok", "share": 0.09, "paged": False}
        for h in range(1, 6)]
r, st1, r2, st2, v = window_run(pre={"windows_checked": over})
check("the vendor billing 9 % ABOVE the census, window by window under the 10 % line, pages CRITICAL on the cumulative leg",
      any(p["dedupe_key"].startswith("birthcap-cumulative-overbill-") and p["severity"] == "critical" for p in r2["pages"]),
      (r2["pages"], st2.get("cumulative")))
under = [dict(o, vendor_webhooks=900) for o in over]
r, st1, r2, st2, v = window_run(pre={"windows_checked": under})
check("... and billing BELOW the census does not (one-sided)",
      not any(p["dedupe_key"].startswith("birthcap-cumulative-overbill-") for p in r2["pages"]), st2.get("cumulative"))
old = [dict(o, closed_at=(W_ON - timedelta(hours=80)).isoformat()) for o in over]
r, st1, r2, st2, v = window_run(pre={"windows_checked": old})
check("rows older than 72 h leave the cumulative leg", st2.get("cumulative", {}).get("windows") == 1, st2.get("cumulative"))

# the counter resets at the billing-cycle boundary: a window spanning it is recorded, never paged, never summed
NEXT = ("2026-12-27", "2027-01-27")
r, st1, r2, st2, v = window_run(vendor_extra=-50_000, new_cycle=NEXT)
row = (st2.get("windows_checked") or [{}])[-1]
pg = r["pages"] + r2["pages"]
check("a window spanning a cycle reset is verdict reset (reset_test cycle): no divergence, frozen or backwards page, no replan",
      row.get("verdict") == "reset" and row.get("reset_test") == "cycle"
      and not str(st2.get("replan") or "").startswith("divergence-window")
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen", "birthcap-vendor-meter-backwards"))
                  for p in pg), (row, pg))
r, st1, r2, st2, v = window_run(vendor_extra=-50_000, new_cycle=NEXT, pre={"windows_checked": over})
check("... and it is kept OUT of the cumulative leg: the 9 % overbilling still pages CRITICAL, the reset counted aside",
      any(p["dedupe_key"].startswith("birthcap-cumulative-overbill-") for p in r2["pages"])
      and st2.get("cumulative", {}).get("windows") == 5 and st2.get("cumulative", {}).get("reset_windows") == 1
      and st2.get("cumulative", {}).get("meter_fault_windows") == 0, (r2["pages"], st2.get("cumulative")))
r, st1, r2, st2, v = window_run(vendor_extra=-50_000)
row = (st2.get("windows_checked") or [{}])[-1]
pg = r["pages"] + r2["pages"]
check("a window whose meter went BACKWARDS inside one cycle is verdict backwards, paged, under its own key (Langston §9e (a))",
      row.get("verdict") == "backwards" and row.get("paged") is True and row.get("reset_test") is None
      and any(p["dedupe_key"].startswith("birthcap-vendor-meter-backwards-window-") for p in pg)
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen")) for p in pg), (row, pg))
check("... and the window arm does not replan on it (the hourly arm owns that, as for frozen)",
      "window" not in str(st2.get("replan") or ""), st2.get("replan"))
r, st1, r2, st2, v = window_run(vendor_extra=-50_000, pre={"windows_checked": over})
check("a backwards window is EXCLUDED like a reset and counted aside: the 9 % overbilling still pages CRITICAL (RIDER-1)"
      " (compared at the hourly arm's backwards replan, end 'reopened')",
      any(p["dedupe_key"].startswith("birthcap-cumulative-overbill-") and p["severity"] == "critical" for p in r["pages"] + r2["pages"])
      and st2.get("cumulative", {}).get("windows") == 5 and st2.get("cumulative", {}).get("reset_windows") == 0
      and st2.get("cumulative", {}).get("meter_fault_windows") == 1, (r2["pages"], st2.get("cumulative")))
frozen_row = dict(over[0], opened_at=(W_ON - timedelta(hours=8)).isoformat(), closed_at=(W_ON - timedelta(hours=7)).isoformat(),
                  vendor_webhooks=100, births=900, verdict="frozen", share=0.0, paged=True)
r, st1, r2, st2, v = window_run(pre={"windows_checked": over + [frozen_row]})
check("a frozen window is EXCLUDED too: its census-only births would hide the 9 % overbilling, which still pages CRITICAL",
      any(p["dedupe_key"].startswith("birthcap-cumulative-overbill-") and p["severity"] == "critical" for p in r2["pages"])
      and st2.get("cumulative", {}).get("windows") == 6 and st2.get("cumulative", {}).get("meter_fault_windows") == 1,
      (r2["pages"], st2.get("cumulative")))
r, st1, r2, st2, v = window_run(vendor_extra=400, new_cycle=("2026-12-27", "2027-01-27"))
row = (st2.get("windows_checked") or [{}])[-1]
pg = r["pages"] + r2["pages"]
check("a window whose cycle changed is verdict reset even when its delta is POSITIVE (+400 over the census would page)",
      row.get("verdict") == "reset"
      and not any(p["dedupe_key"].startswith(("birthcap-divergence", "birthcap-vendor-meter-frozen")) for p in pg), (row, pg))
r, st1, r2, st2, v = window_run(vendor_extra=400, new_cycle=("2026-12-27", "2027-01-27"), pre={"windows_checked": over})
check("... and that window is kept out of the cumulative leg too",
      st2.get("cumulative", {}).get("windows") == 5 and st2.get("cumulative", {}).get("reset_windows") == 1,
      st2.get("cumulative"))

# NAMED CHECK, NOT A CODE CHANGE (Langston §9e Part A, obligation 1): a window under BIRTHCAP_DIVERGENCE_MIN whose meter
# did not move is verdict 'small', NOT 'frozen' (the frozen arm is gated on births >= the minimum), so it STAYS in the
# cumulative leg and its census-only births DILUTE the 72 h overbilling test. Pinned here so the behaviour is a decision
# on the record: 5 small dead windows (150 births each, meter 0) pull the 9 % overbilling under the 3 % line.
dead_small = [dict(over[0], opened_at=(W_ON - timedelta(hours=h + 10)).isoformat(), closed_at=(W_ON - timedelta(hours=h + 9)).isoformat(),
                   vendor_webhooks=0, births=150, switch_credits=0, verdict='small', share=0.0, paged=False) for h in range(5)]
# an ON window always holds two switches (base >= 200), so on the live path 'small' arises in a window with NO switch
# inside it: an adopted or cut window. Drive one through the production tick: adopt, 150 births, meter dead, cut.
reset(); enable(); v = Vendor(active=True); v.webhooks = 50_000
store.save_state(birthcap.STATE, {'applied': 'on', 'plan': always, 'windows_checked': over})
tick(v, ta)
add_births([ta + timedelta(minutes=10 + i) for i in range(150)])
r = tick(v, ta + timedelta(hours=12, minutes=1))
st2 = store.load_state(birthcap.STATE, {})
row = (st2.get('windows_checked') or [{}])[-1]
check("a small window with a DEAD meter (150 births, vendor +0, no switch) is verdict small: no frozen, divergence or backwards page",
      row.get('verdict') == 'small' and row.get('vendor_webhooks') == 0 and row.get('births') == 150 and row.get('switch_credits') == 0
      and not any(p['dedupe_key'].startswith(('birthcap-vendor-meter-frozen', 'birthcap-divergence', 'birthcap-vendor-meter-backwards'))
                  for p in r['pages']), (row, r['pages']))
check("... and it STAYS in the cumulative leg (summed, not counted aside as a meter fault)",
      st2.get('cumulative', {}).get('windows') == 6 and st2.get('cumulative', {}).get('meter_fault_windows') == 0, st2.get('cumulative'))
r, st1, r2, st2, v = window_run(pre={'windows_checked': over + dead_small})
check("... so five of them DILUTE the cumulative leg: the 9 % overbilling that pages alone no longer pages (the named residual)",
      not any(p['dedupe_key'].startswith('birthcap-cumulative-overbill-') for p in r2['pages'])
      and st2.get('cumulative', {}).get('windows') == 11, (r2['pages'], st2.get('cumulative')))

print("== 10c. the replan join, --replan, --status (Langston §9e (c) and RIDER-2)")
_s = {}
birthcap._flag_replan(_s, "a")
birthcap._flag_replan(_s, "b")
birthcap._flag_replan(_s, "a")
check("_flag_replan joins a second reason with + and does not repeat one already pending", _s.get("replan") == "a+b", _s)
_s = {"replan": True}
birthcap._flag_replan(_s, "x")
check("a legacy pending True reads as manual when joined", _s.get("replan") == "manual+x", _s)
_s = {"replan": False}
birthcap._flag_replan(_s, "x")
check("a cleared replan (False) is replaced, not joined", _s.get("replan") == "x", _s)
reset()
store.save_state(birthcap.STATE, {"applied": "on", "plan": full})
rc = birthcap.main(["birthcap", "--replan"])
check("--replan records its reason as manual (not True, not cycle)", rc == 0 and store.load_state(birthcap.STATE, {}).get("replan") == "manual",
      store.load_state(birthcap.STATE, {}).get("replan"))
import contextlib as _ctx
import io as _io
_hours = {"2026-11-28T%02d" % h: {"verdict": "ok", "n": h} for h in range(15)}
store.save_state(birthcap.STATE, {"applied": "on", "plan": full, "cumulative": {"windows": 3}, "replan": "manual",
                                  "hours": _hours, "replans": [{"reason": "r%d" % i} for i in range(15)],
                                  "windows_checked": [{"verdict": "ok", "i": i} for i in range(15)]})
_out = _io.StringIO()
with _ctx.redirect_stdout(_out):
    rc = birthcap.main(["birthcap", "--status"])
try:
    _js = json.loads(_out.getvalue())
except ValueError:
    _js = {}
check("--status prints plan + cumulative + pending replan + the last replans, hour rows and windows",
      rc == 0 and set(_js) == {"plan", "cumulative", "pending_replan", "replans", "hours", "windows"}
      and _js.get("plan") == full and _js.get("cumulative") == {"windows": 3} and _js.get("pending_replan") == "manual", _js)
check("... each history is the LAST %d rows (hours by key order, newest kept)" % birthcap.STATUS_TAIL,
      len(_js.get("hours", {})) == birthcap.STATUS_TAIL and "2026-11-28T14" in _js.get("hours", {})
      and "2026-11-28T02" not in _js.get("hours", {})
      and [x["reason"] for x in _js.get("replans", [])][-1] == "r14" and len(_js.get("replans", [])) == birthcap.STATUS_TAIL
      and len(_js.get("windows", [])) == birthcap.STATUS_TAIL, _js.get("hours"))
def _status_run(out, err):
    """--status with its output captured; an EXCEPTION is a result, not a crash, so a broken refusal reads as a FAIL."""
    with _ctx.redirect_stdout(out), _ctx.redirect_stderr(err):
        try:
            return birthcap.main(["birthcap", "--status"])
        except Exception as exc:                                  # noqa: BLE001 - the raise IS the finding
            return "raised %s: %s" % (type(exc).__name__, exc)


_err = _io.StringIO()
with open(store.state_path(birthcap.STATE), "w", encoding="utf-8") as fh:
    fh.write("{not json")
rc = _status_run(_io.StringIO(), _err)
check("--status REFUSES (rc 1, a stderr line) on a state file it cannot parse, never prints a plan",
      rc == 1 and "cannot read" in _err.getvalue(), (rc, _err.getvalue()))
os.remove(store.state_path(birthcap.STATE))
_out, _err = _io.StringIO(), _io.StringIO()
rc = _status_run(_out, _err)
check("--status REFUSES on a state file it cannot open, never prints null as if no plan existed (the false-absence fix)",
      rc == 1 and "cannot read" in _err.getvalue() and "null" not in _out.getvalue(), (rc, _out.getvalue(), _err.getvalue()))

print("== 11. the cap does not disable itself (Langston gate C blocker)")
reset()
day0 = datetime(2026, 11, 20, 0, 0, tzinfo=UTC)
recs = []
for d in range(7, 0, -1):                                      # 7 capped days, oldest first as the log is: ON 18 h, OFF 6 h
    ds = day0 - timedelta(days=d)
    recs.append({"kind": "put", "requested": "off", "requested_at": (ds + timedelta(hours=6)).isoformat(), "ok": True})
    recs.append({"kind": "put", "requested": "on", "requested_at": (ds + timedelta(hours=12)).isoformat(), "ok": True})
    add_births([ds + timedelta(seconds=i * 50) for i in range(300)])       # 300 recorded rows a day
check("on_fraction reads the measured ON share of a day", abs(birthcap.on_fraction(recs, day0 - timedelta(days=1)) - 0.75) < 1e-9,
      birthcap.on_fraction(recs, day0 - timedelta(days=1)))
check("the launch rate is de-censored: 300 rows at 0.75 ON = 400 launches/day",
      abs(birthcap.trailing_launch_rate(day0, recs) - 400.0) < 1e-6, birthcap.trailing_launch_rate(day0, recs))
check("without the switch log the rate falls back to the raw rows (300)", abs(birthcap.trailing_launch_rate(day0, None) - 300.0) < 1e-6)
reset(); enable(); v = Vendor()
st_always = dict(full, always_on=True, births_allowance_per_day=5)
store.save_state(birthcap.STATE, {"applied": "on", "plan": st_always})
t_mid = datetime(2026, 11, 28, 12, 0, 30, tzinfo=UTC)
add_births([t_mid - timedelta(seconds=10 + i) for i in range(6)])
r = tick(v, t_mid)
check("an ALWAYS-ON plan still stops at its daily allowance (the backstop applies in every plan state)",
      v.puts and v.puts[-1]["active"] is False, (v.puts, r))
reset(); enable(); v = Vendor()
store.save_state(birthcap.STATE, {"applied": "on", "plan": dict(tiny)})
r = tick(v, TT + timedelta(minutes=1))                         # inside tiny's own cycle (no replan)
check("a REFUSED plan with a negative allowance switches the feed OFF (credits gone), not ON with no ceiling",
      tiny.get("births_allowance_per_day", 0) < 0 and v.puts and v.puts[-1]["active"] is False, (tiny.get("births_allowance_per_day"), v.puts))
def _plan(rem):
    return birthcap.plan_cycle(TT, {"creditsRemaining": rem, "creditCycle": {"start": "2026-10-27", "end": "2026-11-27"}},
                               39_611, 0.0)
at_floor, below = _plan(60_000), _plan(25_000)
check("the floor holds (rule says 2, the plan runs 4): floor_binds True, below_floor False",
      at_floor.get("windows") == 4 and at_floor.get("floor_binds") is True and at_floor.get("below_floor") is False, at_floor)
check("a plan that walks below the floor for the 900 s assert says so: below_floor True, floor_binds False",
      below.get("windows", 9) < 4 and below.get("below_floor") is True and below.get("floor_binds") is False, below)

print("== 12. a failed mint does not lose its pages (Langston §13 (i))")
os.environ["INVOCATION_ID"] = "test-unit-run"                 # as systemd sets it; a hand run is tested below
reset()
tm = datetime(2026, 11, 28, 4, 0, 30, tzinfo=UTC)
page = {"dedupe_key": "birthcap-divergence-2026-11-28T03", "severity": "warning", "title": "t", "body": "b"}
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [page]})
sent = []
def failing(**k):
    sent.append(("fail", k["dedupe_key"])); return False
def working(**k):
    sent.append(("ok", k["dedupe_key"])); return True
rc = birthcap.mint(now=tm, mint_fn=failing)
carry = store.load_state(birthcap.CARRY, {}).get("pages", [])
check("a failed mint returns non-zero and CARRIES the page", rc == 1 and [p["dedupe_key"] for p in carry] == [page["dedupe_key"]], (rc, carry))
store.save_state(birthcap.RESULT, {"checked_at": (tm + timedelta(minutes=1)).isoformat(), "pages": []})
rc = birthcap.mint(now=tm + timedelta(minutes=1), mint_fn=working)
check("the next mint (a tick with no new pages) re-offers and delivers the carried page, then clears the carry",
      rc == 0 and ("ok", page["dedupe_key"]) in sent and store.load_state(birthcap.CARRY, {}).get("pages") == [], (rc, sent))
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [page]})
birthcap.mint(now=tm, mint_fn=failing)
store.save_state(birthcap.RESULT, {"checked_at": (tm + timedelta(hours=25)).isoformat(), "pages": []})
rc = birthcap.mint(now=tm + timedelta(hours=25), mint_fn=failing)
check("a page undeliverable for over 24 h is dropped from the carry (bounded), not kept forever",
      store.load_state(birthcap.CARRY, {}).get("pages") == [], store.load_state(birthcap.CARRY, {}))
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="k%d" % i) for i in range(80)]})
birthcap.mint(now=tm, mint_fn=lambda **k: False)
check("the carry is bounded in count (CARRY_MAX)", len(store.load_state(birthcap.CARRY, {}).get("pages", [])) == birthcap.CARRY_MAX)
reset()
old = [dict(page, dedupe_key="old%d" % i, carried_at=(tm - timedelta(hours=6)).isoformat()) for i in range(birthcap.CARRY_MAX)]
store.save_state(birthcap.CARRY, {"pages": old})
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="new%d" % i) for i in range(3)]})
birthcap.mint(now=tm, mint_fn=lambda **k: False)
keys = [p["dedupe_key"] for p in store.load_state(birthcap.CARRY, {}).get("pages", [])]
check("the count bound keeps the NEWEST pages (all 3 new kept; the oldest carried ones go)",
      all("new%d" % i in keys for i in range(3)) and len(keys) == birthcap.CARRY_MAX, keys[:5])
reset()
store.save_state(birthcap.CARRY, {"pages": [dict(page, carried_at=(tm - timedelta(hours=23)).isoformat())]})
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [page]})
birthcap.mint(now=tm, mint_fn=lambda **k: False)
c = store.load_state(birthcap.CARRY, {}).get("pages", [])
check("a key carried and raised again keeps its EARLIEST carried_at (the 24 h bound can bind)",
      len(c) == 1 and c[0]["carried_at"] == (tm - timedelta(hours=23)).isoformat(), c)
reset()
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="s%d" % i) for i in range(5)]})
ticks = iter([0, 0, 40, 80, 120, 160, 200, 240])
tried = []


def slow(**k):
    tried.append(k["dedupe_key"])
    return True


rc = birthcap.mint(now=tm, mint_fn=slow, clock=lambda: next(ticks))
c = [p["dedupe_key"] for p in store.load_state(birthcap.CARRY, {}).get("pages", [])]
check("past MINT_BUDGET_S no further call STARTS; the untried pages are carried, not dropped",
      tried == ["s0", "s1"] and c == ["s2", "s3", "s4"] and rc == 1, (tried, c, rc))
import subprocess as _sp
import time as _time
r = birthcap._bounded_run([sys.executable, "-c", "print('hi')"], capture_output=True, text=True, timeout=120)
check("_bounded_run keeps subprocess.run's contract (rc, captured text)", r.returncode == 0 and r.stdout.strip() == "hi", r)
if os.name == "posix":
    marker = os.path.join(ROOT, "grandchild-marker")
    child = ("import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',"
             "\"import time; time.sleep(2); open(%r,'w').write('alive')\"]); time.sleep(30)" % marker)
    saved = birthcap.MINT_CALL_TIMEOUT_S
    birthcap.MINT_CALL_TIMEOUT_S = 1                          # alert_mint asks for 120: the cut must win
    t0 = _time.monotonic()
    try:
        birthcap._bounded_run([sys.executable, "-c", child], capture_output=True, text=True, timeout=120)
        timed_out = False
    except _sp.TimeoutExpired:
        timed_out = True
    finally:
        birthcap.MINT_CALL_TIMEOUT_S = saved
    took = _time.monotonic() - t0
    _time.sleep(3)
    check("a call is cut at MINT_CALL_TIMEOUT_S though alert_mint asks for 120", timed_out and took < 5, (timed_out, took))
    check("the timeout kills the whole process GROUP: the grandchild never writes (rider 2)",
          not os.path.exists(marker), "the grandchild survived")
    # a descendant that LEAVES the group (setsid) survives the group kill and keeps the inherited stdout open: the
    # call must still return at the cut, not after that descendant's lifetime (Langston Step-9 BLOCKER `:565`)
    escaper = ("import subprocess,sys,time; subprocess.Popen([sys.executable,'-c',"
               "\"import os,time; os.setsid(); time.sleep(4)\"]); time.sleep(30)")
    birthcap.MINT_CALL_TIMEOUT_S = 1
    t0 = _time.monotonic()
    try:
        birthcap._bounded_run([sys.executable, "-c", escaper], capture_output=True, text=True, timeout=120)
        cut = False
    except _sp.TimeoutExpired:
        cut = True
    finally:
        birthcap.MINT_CALL_TIMEOUT_S = saved
    took = _time.monotonic() - t0
    check("a descendant that escaped the group (setsid) and holds stdout does NOT hold the call past the cut",
          cut and took < 2.5, (cut, took))
else:
    print("  skip the process-group kill check (POSIX only; CI runs it)")
unit_text = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "systemd", "token-watch-birthcap.service")).read()
tss = int(re.search(r"^TimeoutStartSec=(\d+)", unit_text, re.M).group(1))
check("UNIT_START_TIMEOUT_S equals the unit's own TimeoutStartSec (read from the file, not carried)",
      birthcap.UNIT_START_TIMEOUT_S == tss, (birthcap.UNIT_START_TIMEOUT_S, tss))
check("a mint that starts at once can use its full budget and still fit the start job",
      birthcap.MINT_BUDGET_S + birthcap.MINT_CALL_TIMEOUT_S + birthcap.MINT_MARGIN_S <= tss)
reset()
late = tm + timedelta(seconds=85)                          # the tick took 85 s: 120 - 85 - 30 - 10 < 0
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="L%d" % i) for i in range(3)]})
tried = []
rc = birthcap.mint(now=late, mint_fn=slow, clock=lambda: 0)
c = [p["dedupe_key"] for p in store.load_state(birthcap.CARRY, {}).get("pages", [])]
check("a tick that already used 85 s of the 120 s start job leaves no mint budget: nothing starts, all carried",
      tried == [] and c == ["L0", "L1", "L2"] and rc == 1, (tried, c))
reset()
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="E%d" % i) for i in range(3)]})
tried = []
rc = birthcap.mint(now=tm + timedelta(seconds=1), mint_fn=slow, clock=lambda: 0)
check("a prompt tick (1 s) leaves the full budget: every page is tried", tried == ["E0", "E1", "E2"] and rc == 0, tried)
import logging as _logging
_seen = []
class _H(_logging.Handler):
    def emit(self, rec):
        _seen.append((rec.levelno, rec.getMessage()))
_h = _H()
birthcap.LOG.addHandler(_h)
reset()
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="D%d" % i) for i in range(2)]})
tried = []
birthcap.mint(now=late, mint_fn=slow, clock=lambda: 0)
birthcap.LOG.removeHandler(_h)
check("a deferral is LOGGED at error with the result age and the budget (unit_failed freezes the first body)",
      any(l >= _logging.ERROR and "DEFERRED" in m and "85 s old" in m for l, m in _seen), _seen)
reset()
store.save_state(birthcap.RESULT, {"checked_at": tm.isoformat(), "pages": [dict(page, dedupe_key="H%d" % i) for i in range(2)]})
tried = []
del os.environ["INVOCATION_ID"]                                # a HAND run of --mint
rc = birthcap.mint(now=late, mint_fn=slow, clock=lambda: 0)
os.environ["INVOCATION_ID"] = "test-unit-run"
check("a hand-run --mint is not inside the unit's start job: the same 85 s-old result is still minted",
      tried == ["H0", "H1"] and rc == 0, tried)

os.environ.pop("INVOCATION_ID", None)
print()
shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
