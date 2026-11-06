#!/usr/bin/env python3
"""B-LANGSTON-TWO-WORKERS (#1248): the lane key and the two-worker task queue.
Run: python3 comms-infra/discord/test_langston_lanes.py   (exit 0 = all pass)"""
import os
import queue
import sys
import threading
import time

sys.path.insert(0, os.path.dirname(os.path.abspath(__file__)))
import langston_queue as q  # noqa: E402

P = F = 0


def ok(name, cond):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print(f"  FAIL: {name}")


def text(content, mid="m"):
    return {"message_id": mid, "content": content, "kind": "text", "is_alert": False}


def fake_alert_key(content):
    """Shape of alert_lane.alert_key: (template, symbol) from the first bold title, else None."""
    import re
    m = re.search(r"\*\*(.+?)\*\*", content)
    if not m:
        return None
    t = m.group(1)
    s = re.search(r"[A-Z]{2,6}/USD", t)
    return (re.sub(r"[A-Z]{2,6}/USD", "<SYM>", t), s.group(0) if s else None)


# ---- the key: exact, normalised, fail-closed ----
ok("one id -> its lane", q.lane_key(text("Langston, B-LANGSTON-TWO-WORKERS Step 2, ONE gate")) == "batch:B-LANGSTON-TWO-WORKERS")
ok("underscore and case fold to one lane",
   q.lane_key(text("Langston — b_langston_two_workers r2")) == q.lane_key(text("Langston, B-LANGSTON-TWO-WORKERS")))
ok("P-form id", q.lane_key(text("Langston, P19-B6.5a Step 4")) == "batch:P19-B6.5A")
ok("no id -> shared", q.lane_key(text("Langston, quick question about the board")) == q.SHARED_LANE)
ok("two ids -> shared (never first-wins)",
   q.lane_key(text("Langston, B-WAKE-OPENING-LIST and B-TOKEN-WATCH-STORAGE both")) == q.SHARED_LANE)
ok("same id twice -> its lane", q.lane_key(text("Langston, B-GOV r2 (B-GOV)")) == "batch:B-GOV")
ok("prefix collision: RELIEF vs RELIEF-2 are different lanes",
   q.lane_key(text("Langston, B-LANGSTON-RELIEF r1")) != q.lane_key(text("Langston, B-LANGSTON-RELIEF-2 r1")))
ok("prefix collision: the shorter id is not found inside the longer",
   q.batch_ids_in_opening("Langston, B-LANGSTON-RELIEF-2 step 1") == {"B-LANGSTON-RELIEF-2"})
ok("a quoted first line is not the opening",
   q.lane_key(text("> NEW Claude: B-ENTRY-GATE is done\nLangston, B-WAKE-OPENING-LIST Step 11")) == "batch:B-WAKE-OPENING-LIST")
ok("an id only after the opening line -> shared",
   q.lane_key(text("Langston, one question\nabout B-ENTRY-GATE")) == q.SHARED_LANE)
ok("an id with a trailing dash is not a whole token -> shared", q.lane_key(text("Langston, B-FOO- then more")) == q.SHARED_LANE)
ok("a sha / hex is not an id", q.lane_key(text("Langston, ref b4eed11b0 please")) == q.SHARED_LANE)
ok("sub-batch is not an id", q.batch_ids_in_opening("Langston, the sub-batch question") == set())

# ---- escalations: the (template, symbol) tuple, never the template alone (AM-3) ----
e1 = {"message_id": "1", "escalated": True, "content": "**Fill blocked — stale price ABNB/USD**"}
e2 = {"message_id": "2", "escalated": True, "content": "**Fill blocked — stale price ABNB/USD**"}
e3 = {"message_id": "3", "escalated": True, "content": "**Fill blocked — stale price NVDA/USD**"}
e4 = {"message_id": "4", "escalated": True, "content": "no bold title here"}
ok("same template + same symbol -> one lane", q.lane_key(e1, fake_alert_key) == q.lane_key(e2, fake_alert_key))
ok("same template + different symbol -> different lanes", q.lane_key(e1, fake_alert_key) != q.lane_key(e3, fake_alert_key))
ok("no alert key -> keyed by message id", q.lane_key(e4, fake_alert_key) == "alert-id:4")
ok("escalation lanes are not the shared lane", q.lane_key(e1, fake_alert_key) != q.SHARED_LANE)

# ---- the queue: lanes, priority, flags ----
Q = q.LaneTaskQueue(alert_key=fake_alert_key)
Q.put(text("Langston, B-AAA r1", "a1"))
Q.put(text("Langston, B-AAA r2", "a2"))
Q.put(text("Langston, B-BBB r1", "b1"))
t1 = Q.take("w1", 1)
t2 = Q.take("w2", 1)
ok("two different batches run at once", {t1["message_id"], t2["message_id"]} == {"a1", "b1"})
try:
    Q.take("w3", 0.2)
    ok("same batch's second round waits while the first runs", False)
except queue.Empty:
    ok("same batch's second round waits while the first runs", True)
Q.release(t1)
ok("after release the second round runs, in arrival order", Q.take("w1", 1)["message_id"] == "a2")

Q2 = q.LaneTaskQueue()
Q2.put(text("Langston, no id one", "s1"))
Q2.put(text("Langston, no id two", "s2"))
s1 = Q2.take("w1", 1)
try:
    Q2.take("w2", 0.2)
    ok("two no-id tasks run in order, never together", False)
except queue.Empty:
    ok("two no-id tasks run in order, never together", s1["message_id"] == "s1")

Q3 = q.LaneTaskQueue()
Q3.put({"message_id": "adv", "content": "Langston, B-CCC", "self_advance": True})
Q3.put(text("Langston, B-DDD", "person"))
ok("a person's task is taken before an earlier self-advance", Q3.take("w1", 1)["message_id"] == "person")

Q4 = q.LaneTaskQueue()
Q4.put(text("Langston, B-EEE", "x1"))
Q4.put(text("Langston, B-FFF", "x2"))
one_worker = {"on": True}
def may(worker):
    return not (one_worker["on"] and worker == "w2")
Q4.take("w1", 1, may_take=may)
try:
    Q4.take("w2", 0.3, may_take=may, recheck=0.05)
    ok("one-worker flag: worker 2 takes nothing", False)
except queue.Empty:
    ok("one-worker flag: worker 2 takes nothing", True)
one_worker["on"] = False
ok("flag cleared: worker 2 takes the next task", Q4.take("w2", 1, may_take=may, recheck=0.05)["message_id"] == "x2")

# a blocked worker wakes when a lane frees (release notifies)
Q5 = q.LaneTaskQueue()
Q5.put(text("Langston, B-GGG r1", "g1"))
Q5.put(text("Langston, B-GGG r2", "g2"))
g1 = Q5.take("w1", 1)
got = {}
def waiter():
    got["t"] = Q5.take("w2", 3, recheck=10)
th = threading.Thread(target=waiter)
th.start()
time.sleep(0.2)
Q5.release(g1)
th.join(3)
ok("release wakes a worker waiting on that lane", got.get("t", {}).get("message_id") == "g2")

# the D-5 accepted limit, made visible: a no-id task and a keyed task on the same batch CAN overlap
Q6 = q.LaneTaskQueue()
Q6.put(text("Langston, B-HHH r1", "h1"))
Q6.put(text("Langston, a follow-up on that batch with no id", "h2"))
a, b = Q6.take("w1", 1), Q6.take("w2", 1)
ok("D-5: no-id and keyed task on one batch overlap (accepted, logged by lane)",
   {a["_lane"], b["_lane"]} == {"batch:B-HHH", q.SHARED_LANE} and Q6.running_lanes() == {"batch:B-HHH": "w1", q.SHARED_LANE: "w2"})

ok("depth_by_class still works", Q.depth_by_class() == (0, 0, 0))

print(f"\nlane tests: {P} passed, {F} failed")
sys.exit(0 if F == 0 else 1)
