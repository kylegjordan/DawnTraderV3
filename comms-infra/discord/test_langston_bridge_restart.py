"""Offline tests for langston-bridge-restart's decisions (B-LANGSTON-RELIEF; Langston r1 on f092c45eb).
Each case states its EXPECTED outcome before it runs (his rider on #744). Run from comms-infra/discord:
    python3 test_langston_bridge_restart.py
It imports the bridge's own langston_queue.read_recover_floor, so the floor is judged by the real reader."""
import datetime as dt, importlib.machinery, importlib.util, os, sys, tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
_ld = importlib.machinery.SourceFileLoader("lbr", os.path.join(HERE, "langston-bridge-restart"))
spec = importlib.util.spec_from_loader("lbr", _ld)
lbr = importlib.util.module_from_spec(spec)
_ld.exec_module(lbr)
import langston_queue as lq

UTC = dt.timezone.utc
fails = 0


def case(name, expected, got):
    global fails
    ok = expected == got
    print(("ok   " if ok else "FAIL ") + name + "\n       expected: %r\n       got:      %r" % (expected, got))
    if not ok:
        fails += 1


def snowflake_at(t, seq=0):
    return ((int(t.timestamp() * 1000) - lbr.DISCORD_EPOCH_MS) << 22) | seq


INTENT = "2026-10-17 04:43:36 recovery: will re-read people's messages since 2026-10-17T03:44:40+00:00 once the gateway is ready"
REREAD = ("2026-10-17 04:43:39 recovery: re-read channel since 2026-10-17T03:44:40+00:00 - 69 message(s) re-fed through "
          "the handler, 1 skipped as already started AND answered")
FAILED = ("2026-10-17 05:19:29 recovery: FAILED (RuntimeError: history broke) - the floor file is KEPT and recovery "
          "retries at the next gateway ready; nothing waiting has been dropped yet")
IGNORED = "2026-10-17 06:00:00 recovery: floor file ignored (older than 24 h); nothing from before this start will be recovered"

print("1. BLOCKER-1: the summary line decides, never the first `recovery:` line")
case("healthy journal [intent, re-read] -> exit 0 on the RE-READ line", (0, REREAD), (lambda v: (v[0][0], v[1]))(lbr.first_verdict([INTENT, REREAD])))
case("failed journal [intent, FAILED] -> exit 5, not 0", (5, FAILED), (lambda v: (v[0][0], v[1]))(lbr.first_verdict([INTENT, FAILED])))
case("refused journal [ignored] -> exit 7, not 0", (7, IGNORED), (lambda v: (v[0][0], v[1]))(lbr.first_verdict([IGNORED])))
case("the intent line alone is NOT a verdict (keep waiting)", None, lbr.classify(INTENT))
case("an unrelated line is not a verdict", None, lbr.classify("2026-10-17 04:43:41 invoking claude (prompt=3028 chars)"))

print("2. BLOCKER-2: the floor written just before the restart is accepted by the bridge's own reader")
now = dt.datetime(2026, 10, 17, 6, 0, 0, tzinfo=UTC)
start = now - dt.timedelta(hours=1)
fresh = snowflake_at(now - dt.timedelta(minutes=30))
jt = lbr.START_LINE + " session_id=x\n2026-10-17 05:30:00 text enqueued: msg %d from NEW Claude#0000: Langston, x\n" % fresh
floor, pending, outside, clamped = lbr.plan_floor(start, jt, set(), now)
case("a recent backlog: floor = process start - 1 s, not clamped", (start - dt.timedelta(seconds=1), [fresh], [], False),
     (floor, pending, outside, clamped))
with tempfile.TemporaryDirectory() as d:
    f = os.path.join(d, "recover-since")
    open(f, "w").write(floor.strftime("%Y-%m-%dT%H:%M:%SZ"))
    case("  ...and the bridge accepts it when read 5 s later", "ok", lq.read_recover_floor(f, now=now + dt.timedelta(seconds=5))[1])

old = snowflake_at(now - dt.timedelta(hours=25))
jt2 = jt + "2026-10-16 05:00:00 voice enqueued: msg %d from Kyle\n" % old
floor2, pending2, outside2, clamped2 = lbr.plan_floor(start, jt2, set(), now)
case("a backlog older than 24 h: CLAMPED, the old id named as outside (and a VOICE enqueue counts)",
     (True, [old]), (clamped2, outside2))
with tempfile.TemporaryDirectory() as d:
    f = os.path.join(d, "recover-since")
    open(f, "w").write(floor2.strftime("%Y-%m-%dT%H:%M:%SZ"))
    case("  ...the clamped floor, written just before the restart, is still accepted 5 s later",
         "ok", lq.read_recover_floor(f, now=now + dt.timedelta(seconds=5))[1])
    case("  ...the r1 behaviour, the same floor read 1800 s later, is REFUSED (why it is re-derived)",
         "older than 24 h", lq.read_recover_floor(f, now=now + dt.timedelta(seconds=1800))[1])

case("an answered message does not widen the floor", (start - dt.timedelta(seconds=1), []),
     (lambda r: (r[0], r[1]))(lbr.plan_floor(start, jt, {fresh}, now)))

print("3. refusals")
try:
    lbr.plan_floor(start, "2026-10-17 05:30:00 text enqueued: msg 1 from x\n", set(), now)
    got = "no refusal"
except lbr.Refusal as e:
    got = e.code
case("a journal that no longer holds the start line -> refuse (exit 2)", 2, got)
case("systemd start time in UTC parses", dt.datetime(2026, 10, 17, 4, 43, 35, tzinfo=UTC),
     lbr.parse_systemd_ts("Sat 2026-10-17 04:43:35 UTC"))
try:
    lbr.parse_systemd_ts("Sat 2026-10-17 08:43:35 GST")
    got = "no refusal"
except lbr.Refusal as e:
    got = e.code
case("a non-UTC zone token -> refuse (exit 2), never assume", 2, got)

print("4. BLOCKER-3: the refusal keys on a waiting message outside the floor, never on the clamp")
old_start = now - dt.timedelta(hours=30)
f3, p3, o3, c3 = lbr.plan_floor(old_start, lbr.START_LINE + "\n", set(), now)
case("a daemon up 30 h with nothing waiting: clamped, nothing outside", (True, []), (c3, o3))
case("  ...decision: RESTART (no flag needed)", "restart", lbr.restart_decision(o3, False))
case("a waiting message outside the floor: REFUSE without the flag", "refuse", lbr.restart_decision([old], False))
case("  ...and restart with --accept-clamp", "restart", lbr.restart_decision([old], True))

print("5. BLOCKER-4: the installed reply predicate is self-checked before it is trusted")
good = (lambda path, tail_bytes=0: (set(), {101}))
bad = (lambda path, tail_bytes=0: (set(), {101, 102}))
with tempfile.TemporaryDirectory() as d:
    case("a predicate that counts only the delivered reply passes", True, lbr.predicate_ok(good, d))
    case("one that also counts the never-posted reply FAILS", False, lbr.predicate_ok(bad, d))
with tempfile.TemporaryDirectory() as d:
    import shutil
    shutil.copy(os.path.join(HERE, "alert_lane.py"), d)
    try:
        lbr.load_predicate(d)
        got = "loaded"
    except lbr.Refusal as e:
        got = e.code
    case("this branch's alert_lane.py (delivered-only rule) loads", "loaded", got)
    s_ = open(os.path.join(d, "alert_lane.py"), encoding="utf-8").read()
    s_ = s_.replace('elif e.get("reply_to") is not None and e.get("message_id") is not None:',
                    'elif e.get("reply_to") is not None:')
    open(os.path.join(d, "alert_lane.py"), "w", encoding="utf-8").write(s_)
    try:
        lbr.load_predicate(d)
        got = "loaded"
    except lbr.Refusal as e:
        got = e.code
    case("the OLDER rule (no message_id gate, as installed 2026-10-17) is REFUSED with exit 10", 10, got)

print("6. follow() driven against a REAL child process (the 07:28Z live crash: only pure functions were tested)")
import time as _t
t0 = _t.time()
got = lbr.follow(lambda l: True if "responded to msg" in l else None, 10,
                 cmd=["sh", "-c", "sleep 0.5; echo noise; sleep 0.5; echo '2026-10-17 x responded to msg 55'; sleep 30"])
case("a matching line arriving after a quiet gap is returned (no crash on an empty pipe)",
     (True, "2026-10-17 x responded to msg 55"), got)
case("  ...promptly, not at the timeout", True, _t.time() - t0 < 5)
t0 = _t.time()
got = lbr.follow(lambda l: True if "never" in l else None, 2, cmd=["sh", "-c", "echo a; sleep 30"])
case("no match within the timeout -> (None, None), on time", ((None, None), True), (got, _t.time() - t0 < 4))
got = lbr.follow(lambda l: True if "never" in l else None, 10, cmd=["sh", "-c", "echo a; echo b"])
case("the stream ending -> (None, None), not a hang", (None, None), got)
_lf = tempfile.NamedTemporaryFile("w", delete=False, suffix=".log", encoding="utf-8")
_lf.write(INTENT + chr(10) + FAILED + chr(10))   # a file, not echo: INTENT holds an apostrophe a shell would eat
_lf.close()
got = lbr.follow(lbr.classify, 10, cmd=["sh", "-c", 'cat "$0"; sleep 30', _lf.name])
os.unlink(_lf.name)
case("the real classify through follow: intent line skipped, FAILED -> 5", 5, got[0][0] if got[0] else None)

print("helper failures:", fails)
sys.exit(1 if fails else 0)
