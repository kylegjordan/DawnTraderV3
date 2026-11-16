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

    def usage(self):
        self.usage_calls += 1
        return {"creditsRemaining": self.remaining, "creditCycle": {"start": self.cycle[0], "end": self.cycle[1]},
                "credits": {"webhooks": self.webhooks, "rpc": self.rpc}}

    def put(self, wid, body):
        self.puts.append(body)
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
check("vendor charged 2x the census births: divergence page", any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
check("RPC spend above a zero allowance: overrun page and a replan",
      any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"]) and store.load_state(birthcap.STATE, {}).get("replan"), r["pages"])

store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), replan=False))
add_births([h0 + timedelta(hours=2, minutes=5, seconds=i) for i in range(300)])
v.webhooks = 1900 + 600                                        # 2x again, and NO rpc this hour: only the divergence can replan
r = tick(v, h0 + timedelta(hours=3))
check("a webhook divergence alone sets replan (the webhook leg is the births budget)",
      not any(p["dedupe_key"].startswith("birthcap-rpc-overrun") for p in r["pages"])
      and store.load_state(birthcap.STATE, {}).get("replan") is True, r["pages"])
h0 = h0 + timedelta(hours=1)
store.save_state(birthcap.STATE, dict(store.load_state(birthcap.STATE, {}), replan=False))
v.webhooks = 2500                                              # the vendor counter freezes while the census records 300
add_births([h0 + timedelta(hours=2, minutes=5, seconds=i) for i in range(300)])
r = tick(v, h0 + timedelta(hours=3))
check("a frozen vendor counter (vendor +0, census +300) pages a divergence", any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
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
check("the next whole hour is compared again", any(p["dedupe_key"].startswith("birthcap-divergence") for p in r["pages"]), r["pages"])
unit = open(os.path.join(os.path.dirname(os.path.abspath(__file__)), "..", "systemd", "token-watch-birthcap.service")).read()
tasks = int(re.search(r"^TasksMax=(\d+)", unit, re.M).group(1))
check("the unit's TasksMax leaves room for the node mint (measured minimum 48; 32 aborted rc 134)", tasks >= 48, tasks)

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

print()
shutil.rmtree(ROOT, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
