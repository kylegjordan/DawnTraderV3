"""Behaviour probe for B-LANGSTON-RELIEF OBJ-2 (the alert lane), run on Helsinki as root with the bridge venv:
   /opt/discord-bridges/venv/bin/python3 langston_alert_lane_probe.py
from a directory holding the bridge files (PROBE_BRIDGE_DIR overrides). Nothing is posted and no model is
invoked: rest_send, mirror_event and invoke_lane are replaced with recorders. It reads the real CFG."""
import asyncio, datetime as dt, importlib.util, os, queue, sys, threading, time, types

HERE = os.environ.get("PROBE_BRIDGE_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gateway_watchdog as gw
gw.install_watchdog = lambda *a, **k: None
spec = importlib.util.spec_from_file_location("bridge", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
al, lq, CFG = b.al, b.lq, b.CFG

fails = 0
def check(name, cond):
    global fails
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails += 1

posts, mirrors, invokes = [], [], []
SEND = {"fail": False}
APPEND = {"fail": False}
b.dc.rest_send = lambda tok, ch, text, logf, mention_user_id=None: (
    None if SEND["fail"] else (posts.append((text, mention_user_id)), 777)[1])
b.mirror_event = lambda kind, **f: mirrors.append((kind, f))
import json as _json, tempfile as _tempfile
_TMP = _tempfile.mkdtemp(prefix="lane-probe-")
al.SPOOL_DIR = os.path.join(_TMP, "spool")              # never the live spool
b.dc.INBOX_LOG = os.path.join(_TMP, "inbox.jsonl")      # never the live inbox
def fake_append(entry):
    if APPEND["fail"]:
        raise OSError("disk full")
    mirrors.append((entry["kind"], entry))
    with open(b.dc.INBOX_LOG, "a", encoding="utf-8") as fh:
        fh.write(_json.dumps(entry) + chr(10))
b.dc.append_inbox = fake_append
def spooled():
    return sorted(os.listdir(al.SPOOL_DIR)) if os.path.isdir(al.SPOOL_DIR) else []
LANE_ANSWER = {"text": None, "why": None}
def fake_lane(prompt):
    invokes.append(prompt)
    return LANE_ANSWER["text"], LANE_ANSWER["why"]
b.invoke_lane = fake_lane

A = "91e923a4-55f0-49e6-8f2d-558af8f68192"
B = "0292fa4c-02f9-4ba6-a8a8-2cabaf936880"
def alert_task(aid, n):
    body = "SYSTEM ALERT %d\n_Category:_ breakage  ·  _Alert ID:_ `%s`" % (n, aid) if aid else "SYSTEM ALERT %d, no id" % n
    return {"channel_id": CFG["channel_id"], "message_id": 5000 + n, "author_id": 1, "author_name": "Alerts",
            "author_display": "Alerts", "is_alert": True, "is_dm": False, "kind": "alert", "content": body}

def reset():
    posts.clear(); mirrors.clear(); invokes.clear()

# (1) the lane routes both: one post, markers mirrored as langston_outbound, nothing to Langston
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text='Two alerts.\n[[ALERT id=%s owner=CC-B action="a"]]\n[[ALERT id=%s owner=CC-C action="b"]]' % (A, B), why=None)
b.run_alert_batch([alert_task(A, 1), alert_task(B, 2)], tq)
check("routed batch: one invocation", len(invokes) == 1)
check("routed batch: one post, led 'Alert lane —', no Kyle mention", len(posts) == 1 and posts[0][0].startswith("Alert lane —") and posts[0][1] is None)
check("routed batch: the post is mirrored as langston_outbound (the wake filter's input)",
      any(k == "langston_outbound" and "[[ALERT id=%s" % A in f["text"] for k, f in mirrors))
check("routed batch: nothing goes to Langston", tq.qsize() == 0)

# (2) a Kyle-owned row mentions Kyle
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text='[[ALERT id=%s owner=Kyle action="decide"]]' % A, why=None)
b.run_alert_batch([alert_task(A, 1)], tq)
check("Kyle-owned: the post mentions Kyle", posts and posts[0][1] == CFG["kyle_id"])

# (3) the lane fails: every alert in the batch goes to Langston, as people-class, marked escalated
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text=None, why="exit 1: boom")
b.run_alert_batch([alert_task(A, 1), alert_task(B, 2)], tq)
check("lane failure: nothing posted", posts == [])
check("lane failure: both escalated to Langston", tq.qsize() == 2 and tq.depth_by_class() == (2, 0, 0))
t = tq.get()
check("lane failure: the escalated task keeps is_alert (triage prompt) and says why",
      t["is_alert"] and t["escalated"] and "alert lane failed" in t["content"])

# (4) an alert with no id never reaches the lane and goes to Langston; the lane's own escalation is honoured
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text='[[ALERT id=%s owner=CC-B action="a"]]\n[[ESCALATE id=%s reason="critical"]]' % (A, A), why=None)
b.run_alert_batch([alert_task(A, 1), alert_task(None, 2)], tq)
contents = [tq.get()["content"] for _ in range(tq.qsize())]
check("no-id alert escalated without a lane call for it", any("could not read an alert id" in c for c in contents))
check("lane ESCALATE honoured", any("critical" in c for c in contents) and len(contents) == 2)
check("only the id'd alert was sent to the lane", len(invokes) == 1 and A in invokes[0] and "no id" not in invokes[0])

# (5) with the lane on, on_message sends alerts to alert_q and people to task_q
reset()
tq, aq = lq.TaskPriorityQueue(), queue.Queue()
c = b.build_client(tq, None, aq)
c._connection.user = types.SimpleNamespace(id=999999)
now = dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=5)
def m(author_id, content, webhook_id=None, mid=[9000]):
    mid[0] += 1
    return types.SimpleNamespace(id=mid[0], author=types.SimpleNamespace(id=author_id, display_name="x", name="x", bot=False),
        guild=object(), channel=types.SimpleNamespace(id=CFG["channel_id"]), created_at=now, webhook_id=webhook_id,
        content=content, attachments=[], embeds=[], reference=None)
async def feed():
    await c.on_message(m(1, "alert body", webhook_id=CFG["alerts_webhook_id"]))
    await c.on_message(m(CFG["kyle_id"], "Langston, a question"))
asyncio.run(feed())
check("lane on: the alert went to the lane queue", aq.qsize() == 1)
check("lane on: Kyle's message went to Langston's queue", tq.qsize() == 1 and tq.depth_by_class() == (1, 0, 0))

# (6) the worker batches a burst into ONE invocation
reset()
al.BATCH_SETTLE_S, al.BATCH_MAX = 1.0, 15
LANE_ANSWER.update(text="\n".join('[[ALERT id=%s owner=CC-B action="a"]]' % x for x in (A, B)), why=None)
aq, tq = queue.Queue(), lq.TaskPriorityQueue()
threading.Thread(target=b.alert_worker, args=(aq, tq), daemon=True).start()
aq.put(alert_task(A, 1)); time.sleep(0.2); aq.put(alert_task(B, 2))
time.sleep(2.0)
check("burst: two alerts, one lane invocation", len(invokes) == 1 and A in invokes[0] and B in invokes[0])

# (7) Coltrane send-back 1: a hallucinated out-of-batch marker is never published
C = "f41812ab-c0fe-4406-8d38-d549470a8f89"
NL = chr(10)
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text=NL.join(["ok", '[[ALERT id=%s owner=CC-B action="a"]]' % A,
                                 '[[ALERT id=%s owner=Kyle action="hijack"]]' % C]), why=None)
b.run_alert_batch([alert_task(A, 1)], tq)
outs = [f["text"] for k, f in mirrors if k == "langston_outbound"]
check("out-of-batch marker absent from the post and the record",
      bool(posts) and C not in posts[0][0] and bool(outs) and C not in outs[0])
check("the valid marker is published in canonical form", '[[ALERT id=%s owner=CC-B action="a"]]' % A in posts[0][0])

# (8) conflicting markers for one id: no marker for it is published; it goes to Langston
reset(); tq = lq.TaskPriorityQueue()
LANE_ANSWER.update(text=NL.join(['[[ALERT id=%s owner=CC-B action="a"]]' % A,
                                 '[[ALERT id=%s owner=CC-C action="b"]]' % A]), why=None)
b.run_alert_batch([alert_task(A, 1)], tq)
check("conflicting markers: no [[ALERT for that id in the post", bool(posts) and ("[[ALERT id=%s" % A) not in posts[0][0])
check("conflicting markers: escalated to Langston", tq.qsize() == 1)

# (9) Coltrane send-back 2: a failed Discord post hands the whole batch to Langston, nothing recorded
reset(); tq = lq.TaskPriorityQueue(); SEND["fail"] = True
LANE_ANSWER.update(text=NL.join(['[[ALERT id=%s owner=Kyle action="a"]]' % A,
                                 '[[ALERT id=%s owner=CC-B action="b"]]' % B]), why=None)
b.run_alert_batch([alert_task(A, 1), alert_task(B, 2)], tq)
SEND["fail"] = False
check("post failure: both alerts escalated to Langston", tq.qsize() == 2 and tq.depth_by_class() == (2, 0, 0))
check("post failure: no langston_outbound recorded", not any(k == "langston_outbound" for k, _ in mirrors))

# (10) a failed inbox record also hands the whole batch to Langston
reset(); tq = lq.TaskPriorityQueue(); APPEND["fail"] = True
b.run_alert_batch([alert_task(A, 1), alert_task(B, 2)], tq)
APPEND["fail"] = False
check("record failure: both alerts escalated to Langston", tq.qsize() == 2)
_reasons = [tq.get_nowait()["content"] for _ in range(tq.qsize())]
check("record failure: the reason names the inbox record",
      len(_reasons) == 2 and all("inbox record failed" in r for r in _reasons))

# (11) Coltrane send-back r2: an alert queued before a restart is routed exactly once after it
for f in spooled():
    os.remove(os.path.join(al.SPOOL_DIR, f))
reset()
tq1, aq1 = lq.TaskPriorityQueue(), queue.Queue()
c1 = b.build_client(tq1, None, aq1)
c1._connection.user = types.SimpleNamespace(id=999999)
info_alert = m(1, "info breakage alert\n_Category:_ breakage  ·  _Alert ID:_ `%s`" % A, webhook_id=CFG["alerts_webhook_id"])
asyncio.run(c1.on_message(info_alert))
check("restart: the alert is on disk before the lane touches it", spooled() == ["%d.json" % info_alert.id] and aq1.qsize() == 1)
# --- the process dies here: aq1 and tq1 are gone ---
aq2, tq2 = queue.Queue(), lq.TaskPriorityQueue()
b.restore_alert_spool(aq2, tq2)
check("restart: the alert is back in the lane queue exactly once", aq2.qsize() == 1 and tq2.qsize() == 0)
LANE_ANSWER.update(text='[[ALERT id=%s owner=CC-B action="a"]]' % A, why=None)
b.run_alert_batch([aq2.get_nowait()], tq2)
check("restart: routed once, recorded, spool cleared", len(posts) == 1 and spooled() == [] and tq2.qsize() == 0)
aq3, tq3 = queue.Queue(), lq.TaskPriorityQueue()
b.restore_alert_spool(aq3, tq3)
check("restart: a second restart does not route it again", aq3.qsize() == 0 and tq3.qsize() == 0 and len(posts) == 1)

# (12) died after recording routing but before clearing the spool: cleared on restore, not re-triaged
reset()
t12 = alert_task(B, 12)
al.spool_write(al.SPOOL_DIR, t12, "posting", aid=B)
fake_append({"kind": "langston_outbound", "lane": "alert", "text": '[[ALERT id=%s owner=CC-C action="x"]]' % B,
             "reply_to": t12["message_id"], "channel_id": CFG["channel_id"], "message_id": 1})
aq4, tq4 = queue.Queue(), lq.TaskPriorityQueue()
b.restore_alert_spool(aq4, tq4)
check("posting + recorded: cleared, not triaged again", aq4.qsize() == 0 and tq4.qsize() == 0 and spooled() == [])

# (13) Coltrane r3: an escalated alert is cleared ONLY when Langston's answer is posted AND recorded. The REAL
#      process_task runs; only the model call and the outside world are stubbed.
b.invoke_claude = lambda prompt, sid, state=None, **k: "Triage: real answer."
STATE13 = {"session_id": "probe"}
def escalated_once(tag):
    reset()
    for f in spooled():
        os.remove(os.path.join(al.SPOOL_DIR, f))
    t = alert_task(A, 13)
    al.spool_write(al.SPOOL_DIR, t, "escalated", reason="critical")
    aq, tq = queue.Queue(), lq.TaskPriorityQueue()
    b.restore_alert_spool(aq, tq)
    return tq.get_nowait(), t
def run_task(task):
    """Through the REAL task_worker loop (so a dequeue-time cleanup would show), then wait for it to finish."""
    q = lq.TaskPriorityQueue()
    q.put(task)
    threading.Thread(target=b.task_worker, args=(q, STATE13), daemon=True).start()
    q.join()
    time.sleep(0.2)
def restored_once():
    aq, tq = queue.Queue(), lq.TaskPriorityQueue()
    b.restore_alert_spool(aq, tq)
    return tq.qsize() + aq.qsize()

task, t13 = escalated_once("raise")
_orig_invoke = b.invoke_claude
b.invoke_claude = lambda *a, **k: (_ for _ in ()).throw(RuntimeError("model crashed"))
run_task(task)
b.invoke_claude = _orig_invoke
check("escalated + process_task raises: work kept on disk", spooled() == ["%d.json" % t13["message_id"]])
check("escalated + process_task raises: restored exactly once", restored_once() == 1)

task, t13 = escalated_once("post")
SEND["fail"] = True; run_task(task); SEND["fail"] = False
check("escalated + Langston's post fails: work kept", spooled() == ["%d.json" % t13["message_id"]])
check("escalated + Langston's post fails: restored exactly once", restored_once() == 1)

task, t13 = escalated_once("record")
APPEND["fail"] = True; run_task(task); APPEND["fail"] = False
check("escalated + his reply's record fails: work kept", spooled() == ["%d.json" % t13["message_id"]])
check("escalated + his reply's record fails: restored exactly once", restored_once() == 1)

task, t13 = escalated_once("ok")
run_task(task)
check("escalated + answer posted and recorded: spool cleared", spooled() == [] and len(posts) == 1)
check("escalated + answered: a restart restores nothing", restored_once() == 0)

# (14) Coltrane r3 crash window: routing recorded but the owed escalation not yet made -> goes to Langston
reset()
for f in spooled():
    os.remove(os.path.join(al.SPOOL_DIR, f))
t14 = alert_task(B, 14)
al.spool_write(al.SPOOL_DIR, t14, "posting", aid=B, escalate="critical severity")
fake_append({"kind": "langston_outbound", "lane": "alert", "text": '[[ALERT id=%s owner=CC-B action="x"]]' % B,
             "reply_to": t14["message_id"], "channel_id": CFG["channel_id"], "message_id": 2})
aq6, tq6 = queue.Queue(), lq.TaskPriorityQueue()
b.restore_alert_spool(aq6, tq6)
check("posting + recorded + owed escalation: handed to Langston, not cleared",
      tq6.qsize() == 1 and "critical severity" in tq6.get_nowait()["content"] and spooled() == ["%d.json" % t14["message_id"]])

# (15) Coltrane r3: a failed spool write is announced loudly (Kyle mentioned, alert named), and still triaged
reset()
_orig_sw = al.spool_write
al.spool_write = lambda *a, **k: (_ for _ in ()).throw(OSError("read-only file system"))
tq7, aq7 = lq.TaskPriorityQueue(), queue.Queue()
c7 = b.build_client(tq7, None, aq7)
c7._connection.user = types.SimpleNamespace(id=999999)
asyncio.run(c7.on_message(m(1, "alert\n_Alert ID:_ `%s`" % A, webhook_id=CFG["alerts_webhook_id"])))
al.spool_write = _orig_sw
check("spool write failure: announced to Kyle, naming the alert", bool(posts) and posts[-1][1] == CFG["kyle_id"] and A in posts[-1][0])
check("spool write failure: still queued for the lane", aq7.qsize() == 1)

print("probe failures:", fails)
sys.exit(1 if fails else 0)
