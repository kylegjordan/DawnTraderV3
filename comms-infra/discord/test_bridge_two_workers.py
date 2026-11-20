"""B-LANGSTON-TWO-WORKERS (#1248): the bridge's two task workers and the state they share. Run on Helsinki with the
bridge venv, from a dir holding the bridge and its modules, as root or as langston (the bridge reads its tokens at
import; /etc/langston/*.env is group-readable, so Langston can re-derive this at Step 8 - his correction, part 1):
    /opt/discord-bridges/venv/bin/python3 test_bridge_two_workers.py      (exit 0 = all pass)
⛔ A HAND-RUN GATE, like test_bridge_clean_stop.py: it cannot join CI (the bridge loads tokens and shared config at
import), so the report that cites it states the host and the ref. Drives the REAL process_task, task_worker,
_self_advance_pick, make_scratch_dir, record_task and _may_take with the network stubbed (no Discord post, no agent
call). Writes only to a scratch dir. Every expected outcome is stated before its result."""
import functools
import importlib.util
import json
import os
import re
import sys
import tempfile
import threading
import time

print = functools.partial(print, flush=True)
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gateway_watchdog as gw  # noqa: E402
gw.install_watchdog = lambda *a, **k: None
spec = importlib.util.spec_from_file_location("bridge", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
lq = b.lq

SCRATCH = tempfile.mkdtemp(prefix="two-workers-", dir=HERE)   # never shared /tmp (#979)
b.LOG_FILE = os.path.join(SCRATCH, "bridge.log")
b.QUEUE_FILE = os.path.join(SCRATCH, "queue.json")
b.SCRATCH_ROOT = os.path.join(SCRATCH, "scratch")
b.TASK_LOG = os.path.join(SCRATCH, "tasks.jsonl")
b.DRAIN_FLAG = os.path.join(SCRATCH, "drain")
b.ONE_WORKER_FLAG = os.path.join(SCRATCH, "one-worker")
os.makedirs(b.SCRATCH_ROOT)
b.dc.append_inbox = lambda entry: None
SENT = []
b.dc.rest_send = lambda token, ch, text, logf=None: SENT.append(text) or "999"
b.dc.send_file = lambda *a, **k: "998"
b.subprocess_run_real = None
INVOKES = []
_INV_LOCK = threading.Lock()
INVOKE_SLEEP = {"s": 0.0}


def fake_invoke(prompt, session_id, scratch=None, meta=None):    # meta: B-AGENT-INVOKE-FAILURE-NOTICE C-2's contract
    with _INV_LOCK:
        INVOKES.append({"prompt": prompt, "scratch": scratch, "t": time.time(), "thread": threading.current_thread().name})
    if "RAISE-IN-INVOKE" in prompt:          # Step 9: an exception exit of a real inbound
        raise RuntimeError("injected invoke failure")
    if "TIMEOUT-IN-INVOKE" in prompt:        # Step 9: a timeout exit, reported structurally as the real invoke does
        if meta is not None:
            meta["outcome"], meta["elapsed"] = "timeout", 0.01
        return ""
    slow = re.search(r"SLOW:([0-9.]+)", prompt)
    time.sleep(float(slow.group(1)) if slow else INVOKE_SLEEP["s"])
    m = re.search(r"REPLY-MARKER:(\S+)", prompt)
    return "verdict text" + (f"\n[[QUEUE id={m.group(1)} status=done]]" if m else "")


b.invoke_claude = fake_invoke
fails = 0


def case(name, expected, got):
    global fails
    ok = expected == got
    print(("ok   " if ok else "FAIL ") + name + "\n       expected: %r\n       got:      %r" % (expected, got))
    if not ok:
        fails += 1


def task(mid, content, author="12345"):
    return {"channel_id": "chan", "message_id": mid, "author_id": author, "author_name": "NEW Claude",
            "author_display": "NEW Claude", "is_dm": False, "kind": "text", "content": content, "is_alert": False}


def seed(items):
    lq.save_queue(b.QUEUE_FILE, items)


print("1. two markers applied by two workers at once both survive (A3: one locked read-modify-write)")
seed([lq.new_item("Q1", "NEW Claude", "a", gate_type="step2", now=1),
      lq.new_item("Q2", "OLD Claude", "b", gate_type="step2", now=2)])
real_apply = lq.apply_marker


def slow_apply(items, marker):          # widen the read-modify-write window so an unlocked version loses an update
    r = real_apply(items, marker)
    time.sleep(0.3)
    return r


lq.apply_marker = slow_apply
b.SELF_ADVANCE_ENABLED = False
ths = [threading.Thread(target=b.process_task, args=(task(f"9{i}", f"OLD Claude, ack REPLY-MARKER:Q{i}"), b.BREAKER, None))
       for i in (1, 2)]
[t.start() for t in ths]
[t.join(10) for t in ths]
lq.apply_marker = real_apply
states = {it["id"]: it.get("state") for it in lq.load_queue(b.QUEUE_FILE)}
case("both items marked done", {"Q1": "done", "Q2": "done"}, {k: states.get(k) for k in ("Q1", "Q2")})

print("2. two workers finishing together advance two DIFFERENT items (A4: pick-and-mark in one locked update)")
seed([lq.new_item("R1", "NEW Claude", "r1", gate_type="step2", now=1),
      lq.new_item("R2", "NEW Claude", "r2", gate_type="step2", now=2)])
picked = []


def pick():
    t, _n = lq.locked_update(b.QUEUE_FILE, lambda items: b._self_advance_pick(items, "chan", {}))
    picked.append(t and t["message_id"])


b._cap.reset()
ths = [threading.Thread(target=pick) for _ in range(2)]
[t.start() for t in ths]
[t.join(10) for t in ths]
case("two different items picked", ["adv-R1", "adv-R2"], sorted(picked))
t3, _ = lq.locked_update(b.QUEUE_FILE, lambda items: b._self_advance_pick(items, "chan", {}))
case("a third pick while both are in flight picks nothing", None, t3)

print("3. ONE circuit breaker across both workers (A1)")
b.BOT_TURN_LIMIT = 3
b.BREAKER["bot_turns"] = 0
INVOKES.clear()
SENT.clear()
seed([])
ths = [threading.Thread(target=b.process_task, args=(task(f"7{i}", "OLD Claude, chatter"), b.BREAKER, None))
       for i in range(6)]
[t.start() for t in ths]
[t.join(10) for t in ths]
case("6 automated turns against a limit of 3: exactly 3 invoked", 3, len(INVOKES))
case("the trip notice posted exactly once", 1, sum("circuit breaker tripped" in s for s in SENT))
b.BOT_TURN_LIMIT = 100000
b.BREAKER["bot_turns"] = 0

print("4. each invoke gets its own scratch directory, passed as TMPDIR and named in the prompt (OBJ-3, D-6)")
INVOKES.clear()
ths = [threading.Thread(target=b.process_task, args=(task(f"5{i}", "OLD Claude, look"), b.BREAKER, None),
                        name=f"task-worker-{i}") for i in (1, 2)]
[t.start() for t in ths]
[t.join(10) for t in ths]
dirs = sorted(i["scratch"] for i in INVOKES)
case("two different directories", 2, len(set(dirs)))
case("both under the scratch root, inv-*", True, all(os.path.dirname(d) == b.SCRATCH_ROOT and os.path.basename(d).startswith("inv-") for d in dirs))
case("mode 0700", ["0o700", "0o700"], [oct(os.stat(d).st_mode & 0o777) for d in dirs])
case("the prompt says cd <dir>", True, all(f"cd {i['scratch']}" in i["prompt"] for i in INVOKES))

print("5. the sweep removes only old inv-* directories, never other files")
old = os.path.join(b.SCRATCH_ROOT, "inv-old-task-worker-1")
os.makedirs(old)
os.utime(old, (time.time() - 8 * 86400, time.time() - 8 * 86400))
olddir = os.path.join(b.SCRATCH_ROOT, "old-project")   # a pre-existing DIRECTORY, not inv-*: must survive
os.makedirs(olddir)
os.utime(olddir, (time.time() - 30 * 86400, time.time() - 30 * 86400))
keep = os.path.join(b.SCRATCH_ROOT, "probe.sql")
open(keep, "w").write("x")
os.utime(keep, (time.time() - 30 * 86400, time.time() - 30 * 86400))
b._SWEEP["last"] = 0
b.sweep_scratch()
case("old inv-* removed", False, os.path.exists(old))
case("a pre-existing fixed-name file is untouched", True, os.path.exists(keep))
case("an old directory that is not inv-* is untouched", True, os.path.exists(olddir))
case("a fresh inv-* directory is kept", True, all(os.path.exists(d) for d in dirs))

print("6. the flags (OBJ-5)")
case("no flags: both workers may take", (True, True), (b._may_take("task-worker-1"), b._may_take("task-worker-2")))
open(b.ONE_WORKER_FLAG, "w").close()
case("one-worker: only worker 1 may take", (True, False), (b._may_take("task-worker-1"), b._may_take("task-worker-2")))
open(b.DRAIN_FLAG, "w").close()
case("drain: neither may take", (False, False), (b._may_take("task-worker-1"), b._may_take("task-worker-2")))
os.remove(b.DRAIN_FLAG)
os.remove(b.ONE_WORKER_FLAG)
_real_lstat = os.lstat
def _eacces(p, *a, **k):          # an unstat-able flag (a directory with mode 000 for a non-root reader): root cannot
    if p in (b.DRAIN_FLAG, b.ONE_WORKER_FLAG):   # produce EACCES on itself, so the stat failure is injected
        raise PermissionError(13, "Permission denied", p)
    return _real_lstat(p, *a, **k)
os.lstat = _eacces
case("an UNREADABLE drain flag counts as set: neither worker may take (Coltrane (4))",
     (False, False), (b._may_take("task-worker-1"), b._may_take("task-worker-2")))
os.lstat = _real_lstat

print("7. two real workers: different batches overlap, one batch's rounds do not; every task is logged (P1, P8)")
open(b.TASK_LOG, "w").close()
INVOKE_SLEEP["s"] = 0.6
q = lq.LaneTaskQueue()
for name in b.WORKER_NAMES:
    threading.Thread(target=b.task_worker, args=(q,), daemon=True, name=name).start()
q.put(task("6001", "OLD Claude, B-AAA-ONE r1"))
q.put(task("6002", "OLD Claude, B-AAA-ONE r2"))
q.put(task("6003", "OLD Claude, B-BBB-TWO r1"))
q.join()
time.sleep(0.2)
rows = [json.loads(l) for l in open(b.TASK_LOG)]
by = {r["message_id"]: r for r in rows}
case("three tasks logged", ["6001", "6002", "6003"], sorted(by))
ov = lambda a, c: by[a]["started"] < by[c]["ended"] and by[c]["started"] < by[a]["ended"]
case("B-AAA-ONE r1 and B-BBB-TWO r1 overlap", True, ov("6001", "6003"))
case("B-AAA-ONE r1 and r2 do not overlap", False, ov("6001", "6002"))
case("r2 started after r1 ended", True, by["6002"]["started"] >= by["6001"]["ended"])
case("lanes recorded", {"6001": "batch:B-AAA-ONE", "6003": "batch:B-BBB-TWO"},
     {k: by[k]["lane"] for k in ("6001", "6003")})
case("outcome recorded as reply", ["reply", "reply", "reply"], [by[k]["outcome"] for k in ("6001", "6002", "6003")])
case("both workers were used", 2, len({r["worker"] for r in rows}))

print("8. the breaker is ONE count through the two real workers (A1, through task_worker)")
INVOKE_SLEEP["s"] = 0.2
b.BOT_TURN_LIMIT = 3
b.BREAKER["bot_turns"] = 0
INVOKES.clear()
for i in range(6):
    q.put(task(f"80{i}", f"OLD Claude, B-BRK-LANE{i} chatter"))
q.join()
case("6 automated turns across both workers against a limit of 3: exactly 3 invoked", 3, len(INVOKES))
b.BOT_TURN_LIMIT = 100000

# ─── Step 9 fold (Langston, msg 1573419152167665767): the HOLD on a real inbound's two edges, C-2, C-3, the exits ───
HOLD = b.HOLD_KEY


class PutQ:                      # stands in for task_q where the test must SEE whether a self-advance was queued
    def __init__(self):
        self.items = []

    def put(self, t):
        self.items.append(t)


def item(iid):
    for it in lq.load_queue(b.QUEUE_FILE):
        if it.get("id") == iid:
            return it
    return None


def wait_for(pred, timeout=5.0):
    end = time.time() + timeout
    while time.time() < end:
        if pred():
            return True
        time.sleep(0.02)
    return False


def held_open():                 # the invariant's violators: still stamped AND not terminal
    return [it["id"] for it in lq.load_queue(b.QUEUE_FILE)
            if it.get(HOLD) and it.get("state") not in lq.TERMINAL_STATES]


def rows_for(mid):
    return [json.loads(l) for l in open(b.TASK_LOG) if json.loads(l).get("message_id") == mid]


def item_with_state(iid, state, summary="x"):
    it = lq.new_item(iid, "NEW Claude", summary, gate_type="step2", now=1)
    it["state"] = state
    return it


print("9. ENQUEUE EDGE: while a real inbound reviews the item it created, the other worker's self-advance skips it")
b.SELF_ADVANCE_ENABLED = True
b._cap.reset()
seed([])
INVOKES.clear()
qa, qb = PutQ(), PutQ()
ta = threading.Thread(target=b.process_task, args=(task("9001", "OLD Claude, please review the diff SLOW:1.0"), b.BREAKER, qa))
ta.start()
case("the new item exists and is HELD while its review runs", True,
     wait_for(lambda: bool(item("9001")) and bool(item("9001").get(HOLD))))
b.process_task(task("9002", "OLD Claude, chatter"), b.BREAKER, qb)
case("the other worker's finish queued NO self-advance of it", [], [t["message_id"] for t in qb.items])
ta.join(10)
case("after the review: auto-settled noop and unstamped", ("noop", False),
     (item("9001").get("state"), bool(item("9001").get(HOLD))))

print("10. C-1 READY EDGE: a [[QUEUE status=ready]] re-mark holds the item while that inbound reviews it")
b._cap.reset()
seed([item_with_state("X10", "blocked")])
qa, qb = PutQ(), PutQ()
ta = threading.Thread(target=b.process_task, args=(
    task("1001", "OLD Claude, [[QUEUE id=X10 status=ready]] please re-review REPLY-MARKER:X10 SLOW:1.0"), b.BREAKER, qa))
ta.start()
case("re-opened to ready and HELD", True,
     wait_for(lambda: item("X10").get("state") == "ready" and bool(item("X10").get(HOLD))))
b.process_task(task("1002", "OLD Claude, chatter"), b.BREAKER, qb)
case("the other worker's finish queued NO self-advance of it", [], [t["message_id"] for t in qb.items])
ta.join(10)
case("after the review: done and unstamped", ("done", False), (item("X10").get("state"), bool(item("X10").get(HOLD))))

print("11. C-2: a self-advance re-checks its item just before invoking, through the real workers")
b.SELF_ADVANCE_ENABLED = False
open(b.TASK_LOG, "w").close()


def pick_adv(iid_items):
    b._cap.reset()
    seed(iid_items)
    t, _n = lq.locked_update(b.QUEUE_FILE, lambda items: b._self_advance_pick(items, "chan", {}))
    return t


adv = pick_adv([item_with_state("D11", "ready")])
lq.locked_update(b.QUEUE_FILE, lambda items: [it.update(state="done") for it in items if it["id"] == "D11"])
INVOKES.clear()
q.put(adv)
q.join()
time.sleep(0.2)
case("11a settled between pick and invoke: NOT invoked", False, any("id=D11" in i["prompt"] for i in INVOKES))
case("11a outcome recorded", ["dropped_not_ready"], [r["outcome"] for r in rows_for("adv-D11")])
adv = pick_adv([item_with_state("E11", "ready")])
_other = time.time() + 1000
lq.locked_update(b.QUEUE_FILE, lambda items: [it.update({HOLD: _other}) for it in items if it["id"] == "E11"])
INVOKES.clear()
q.put(adv)
q.join()
time.sleep(0.2)
case("11b re-held by another task: NOT invoked", False, any("id=E11" in i["prompt"] for i in INVOKES))
case("11b outcome recorded", ["dropped_not_ready"], [r["outcome"] for r in rows_for("adv-E11")])
case("11b the other holder's stamp survives", _other, item("E11").get(HOLD))
adv = pick_adv([item_with_state("F11", "ready", summary="f REPLY-MARKER:F11")])
INVOKES.clear()
q.put(adv)
q.join()
time.sleep(0.2)
case("11c (positive control) still ready and ours: invoked once", 1, sum("id=F11" in i["prompt"] for i in INVOKES))
case("11c outcome reply", ["reply"], [r["outcome"] for r in rows_for("adv-F11")])
case("11c done and its stamp released in _settle", ("done", False), (item("F11").get("state"), bool(item("F11").get(HOLD))))

print("12. C-3: a verdict on an item that is already closed is logged and posted, never applied silently")
seed([item_with_state("G12", "done")])
SENT.clear()
b.process_task(task("1201", "OLD Claude, ack REPLY-MARKER:G12"), b.BREAKER, None)
case("a notice naming the item and the second verdict was posted", True,
     any("second verdict" in s and "G12" in s for s in SENT))
case("the bridge log carries the dup-terminal line", True, "dup-terminal marker id=G12" in open(b.LOG_FILE).read())
case("the item stays done", "done", item("G12").get("state"))

print("13. THE INVARIANT: after ANY exit of a real inbound, each item it touched is terminal OR unstamped")
open(b.TASK_LOG, "w").close()
seed([item_with_state("H13", "blocked"), item_with_state("J13", "blocked")])
q.put(task("1301", "OLD Claude, [[QUEUE id=H13 status=ready]] RAISE-IN-INVOKE"))
q.join()
time.sleep(0.2)
case("13a exception exit after the ready edge: ready AND unstamped", ("ready", False),
     (item("H13").get("state"), bool(item("H13").get(HOLD))))
case("13a outcome", ["worker_error"], [r["outcome"] for r in rows_for("1301")])
q.put(task("1302", "OLD Claude, [[QUEUE id=J13 status=ready]] TIMEOUT-IN-INVOKE"))
q.join()
time.sleep(0.2)
case("13b timeout exit after the ready edge: ready AND unstamped", ("ready", False),
     (item("J13").get("state"), bool(item("J13").get(HOLD))))
case("13b outcome", ["timeout"], [r["outcome"] for r in rows_for("1302")])
q.put(task("1303", "OLD Claude, please review this RAISE-IN-INVOKE"))
q.join()
time.sleep(0.2)
case("13c exception exit after the enqueue edge: the item is settled noop", "noop", (item("1303") or {}).get("state"))
case("13c no item anywhere is left stamped and open", [], held_open())
seed([item_with_state("K13", "ready")])
t1, t2 = {"message_id": "t1"}, {"message_id": "t2"}
lq.locked_update(b.QUEUE_FILE, lambda items: [b._hold(it, t1) for it in items if it["id"] == "K13"])
time.sleep(0.01)
lq.locked_update(b.QUEUE_FILE, lambda items: [b._hold(it, t2) for it in items if it["id"] == "K13"])
case("13d an EARLIER holder's release leaves a later holder's stamp", [], b._release_holds_locked(t1))
case("13d the later stamp is intact", t2["_holds"]["K13"], item("K13").get(HOLD))
case("13d the later holder releases its own", ["K13"], b._release_holds_locked(t2))
case("13d unstamped", False, bool(item("K13").get(HOLD)))

print(f"\n{'ALL PASS' if not fails else str(fails) + ' FAILED'} (scratch {SCRATCH})")
os._exit(1 if fails else 0)
