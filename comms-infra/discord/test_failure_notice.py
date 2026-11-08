"""B-AGENT-INVOKE-FAILURE-NOTICE (#1198, #1206): a task that ends with NO DELIVERED REPLY is never silent.
Run on Helsinki with the bridge venv, from a directory holding the bridge and its modules:
    /opt/discord-bridges/venv/bin/python3 test_failure_notice.py        (exit 0 = all pass)
⛔ A HAND-RUN GATE (the queue's locked_update needs fcntl), like test_bridge_two_workers.py; the report that cites it
states the host and the ref. Drives the REAL process_task, task_worker, _after_no_reply, _self_advance_pick,
enqueue_person and on_message with the network stubbed: no Discord post, no agent call, every file in a scratch dir
(LOG_FILE, QUEUE_FILE, SCRATCH_ROOT, TASK_LOG, the inbox and the alert spool), so nothing live is written.
Every expected outcome is stated before its result."""
import asyncio, itertools, json, os, re, sys, tempfile, threading, time, types
from types import SimpleNamespace as NS

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
SCRATCH = tempfile.mkdtemp(prefix="failure-notice-", dir=HERE)     # never shared /tmp (#979)
P = F = 0


def case(name, want, got):
    global P, F
    if want == got:
        P += 1
        print("  ok   " + name)
    else:
        F += 1
        print("  FAIL " + name + "   want=%r got=%r" % (want, got))


class FakeClient:
    def __init__(self, **kw):
        self.user = NS(id=999)

    def event(self, fn):
        setattr(self, fn.__name__, fn)
        return fn


_discord = types.ModuleType("discord")
_discord.Intents = NS(default=lambda: NS())
_discord.Client = FakeClient
_discord.DMChannel = type("DMChannel", (), {})
sys.modules["discord"] = _discord
sys.path.insert(0, HERE)
import discord_common as dc  # noqa: E402
import gateway_watchdog as gw  # noqa: E402

KYLE, CC_BOT, WEBHOOK, CHANNEL, AGENT = 42, 7, 55, 100, 8
CFG = {"channel_id": CHANNEL, "kyle_id": KYLE, "cc_bot_id": CC_BOT, "langston_bot_id": 9, "guild_id": None,
       "webhook_url": "https://discord.example/api/webhooks/%d/tok" % WEBHOOK, "webhook_id": WEBHOOK,
       "alerts_webhook_id": None, "avatars": {}}
dc.load_env_value = lambda path, key: "stand-in"
dc.load_shared_config = lambda: dict(CFG)
WATCHDOG = {}
gw.install_watchdog = lambda *a, **k: WATCHDOG.update(k)

import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("bridge_fn_test", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)
lq, al = b.lq, b.al
b.LOG_FILE = os.path.join(SCRATCH, "bridge.log")
b.QUEUE_FILE = os.path.join(SCRATCH, "queue.json")
b.SCRATCH_ROOT = os.path.join(SCRATCH, "scratch")
b.TASK_LOG = os.path.join(SCRATCH, "tasks.jsonl")
b.DRAIN_FLAG = os.path.join(SCRATCH, "drain")
b.ONE_WORKER_FLAG = os.path.join(SCRATCH, "one-worker")
al.SPOOL_DIR = os.path.join(SCRATCH, "spool")
dc.INBOX_LOG = os.path.join(SCRATCH, "inbox.jsonl")
os.makedirs(b.SCRATCH_ROOT)
for p in (b.LOG_FILE, b.QUEUE_FILE):
    open(p, "w").close()
open(b.QUEUE_FILE, "w").write("[]")
ROWS, SENT = [], []
dc.append_inbox = lambda entry: ROWS.append(entry)
POST_OK = {"v": True}
POST_PLAN = []      # if non-empty, each send pops its own success flag (first-in, first-out)


def fake_send(token, ch, text, logf=None, mention_user_id=None):
    SENT.append({"ch": ch, "text": text, "mention": mention_user_id})
    ok_now = POST_PLAN.pop(0) if POST_PLAN else POST_OK["v"]
    return "777" if ok_now else None


dc.rest_send = fake_send
dc.send_file = lambda *a, **k: "998"
INVOKE = {"mode": "ok"}


def fake_invoke(prompt, session_id, scratch=None, meta=None):
    meta = meta if meta is not None else {}
    meta["outcome"], meta["elapsed"] = None, 1.0
    if INVOKE["mode"] == "timeout":
        meta["outcome"], meta["elapsed"] = "timeout", 900.0
        return "_Langston bridge: claude invocation timed out (15 min cap)_"
    if INVOKE["mode"] == "exit_mentions_timeout":
        meta["outcome"], meta["elapsed"] = "exit", 12.0      # C-2: stderr text that SAYS "timed out" is not a timeout
        return "_Langston bridge error: claude returned exit code 1_\n\n```\nupstream timed out\n```"
    if INVOKE["mode"] == "raise":
        raise RuntimeError("worker blew up")
    return "Here is the review."


b.invoke_claude = fake_invoke
_ids = itertools.count(1568800000000000000, 1 << 22)


def task(content="Langston — please review B-X", author=CC_BOT, display="NEW Claude", dm=False, **kw):
    t = {"channel_id": CHANNEL, "message_id": next(_ids), "author_id": author, "author_name": display + "#0000",
         "author_display": display, "is_alert": False, "is_dm": dm, "kind": "text", "content": content}
    t.update(kw)
    return t


def reset():
    ROWS.clear(), SENT.clear()
    POST_OK["v"] = True
    open(b.LOG_FILE, "w").close()
    b.BREAKER["bot_turns"] = 0


def log_text():
    return open(b.LOG_FILE, encoding="utf-8").read()


def kinds(rows, k):
    return [r for r in rows if r.get("kind") == k]


print("1. P1 + C-2: a channel request that TIMES OUT -> one name-led line, the declared row, the journal line")
reset(); INVOKE["mode"] = "timeout"; t = task()
b.process_task(t, b.BREAKER, None)
case("exactly one post", 1, len(SENT))
txt = SENT[0]["text"]
case("led by the requester's name", True, txt.startswith("NEW Claude — "))
case("carries the marker and 'nothing was reviewed' verbatim", (True, True), (b.FAILURE_NOTICE_MARKER in txt, "nothing was reviewed" in txt))
case("names the outcome and the elapsed time", (True, True), ("15-minute limit" in txt, "after 900 s" in txt))
case("under 300 characters, no code block", (True, False), (len(txt) < 300, "```" in txt))
out = kinds(ROWS, "langston_outbound")
case("one langston_outbound row: reply_to, message_id, failure_notice, outcome",
     [(t["message_id"], "777", True, "timeout")], [(r.get("reply_to"), r.get("message_id"), r.get("failure_notice"), r.get("outcome")) for r in out])
case("the silent row (its 64-row series) is still written", ["bridge_error_suppressed"], [r.get("reason") for r in kinds(ROWS, "langston_silent")])
case("the journal line langston-bridge-restart waits for (gate 2)", True,
     bool(re.search(r"responded to msg \d+", log_text())) and "(failure notice: timeout)" in log_text())
case("the task's outcome is timeout", "timeout", t.get("_outcome"))
# Gate 2 of langston-bridge-restart, bound on BOTH sides: the helper's OWN regex, read from its source, run through its
# OWN follow() against the line THIS bridge just logged (Langston r2a: before this, a failure-plus-notice exited 3).
from importlib.machinery import SourceFileLoader  # noqa: E402
_hsrc = open(os.path.join(HERE, "langston-bridge-restart"), encoding="utf-8").read()
_pm = re.search(r'follow\(lambda l: True if re\.search\(r"([^"]+)", l\) else None, a\.wait_s\)', _hsrc)
case("the helper's gate-2 pattern is found in its source", True, _pm is not None)
_line = next((l for l in log_text().splitlines() if "failure notice" in l), "")
lbr = SourceFileLoader("lbr_fn", os.path.join(HERE, "langston-bridge-restart")).load_module()
_got = lbr.follow(lambda l: True if re.search(_pm.group(1), l) else None, 10,
                  cmd=["sh", "-c", 'sleep 0.3; echo noise; printf "%s\\n" "$0"; sleep 30', _line]) if _pm else (None, None)
case("the helper's own follow(), fed the bridge's notice line, PROCEEDS (it would have exited 3)", True, _got[0])

print("1b. P4: the same rows, written to a real inbox file, are read by RECOVERY'S OWN reader as replied")
with open(dc.INBOX_LOG, "w", encoding="utf-8") as fh:
    for r in ROWS:
        fh.write(json.dumps(r, default=str) + "\n")
case("inbox_evidence: the failed request id is in the replied set", True, t["message_id"] in al.inbox_evidence(dc.INBOX_LOG)[1])

print("2. C-2: a failed EXIT whose stderr says 'timed out' records bridge_error, not timeout")
reset(); INVOKE["mode"] = "exit_mentions_timeout"; t = task()
b.process_task(t, b.BREAKER, None)
case("outcome bridge_error (structural, not sniffed)", "bridge_error", t.get("_outcome"))
case("the notice says it ended in an error, after 12 s", (True, True), ("ended in an error" in SENT[0]["text"], "after 12 s" in SENT[0]["text"]))

print("3. P2: a DM failure gets the same line, never the stderr dump")
reset(); INVOKE["mode"] = "exit_mentions_timeout"; t = task(author=KYLE, display="kylegjordan", dm=True)
b.process_task(t, b.BREAKER, None)
case("one post, led 'Kyle — ', no code block, no stderr text", (1, True, False, False),
     (len(SENT), SENT[0]["text"].startswith("Kyle — "), "```" in SENT[0]["text"], "upstream timed out" in SENT[0]["text"]))
case("no silent row for a DM (it was never suppressed in-channel)", [], kinds(ROWS, "langston_silent"))

print("4. a notice whose own post FAILS writes no outbound row and no journal line (the safe direction)")
reset(); INVOKE["mode"] = "timeout"; POST_OK["v"] = False; t = task()
b.process_task(t, b.BREAKER, None)
case("no langston_outbound row", [], kinds(ROWS, "langston_outbound"))
case("no 'responded to msg' line", None, re.search(r"responded to msg %d" % t["message_id"], log_text()))

print("5. P3 + C-3: a failed review request settles its queue item noop WITH the reason")
reset(); INVOKE["mode"] = "timeout"; open(b.QUEUE_FILE, "w").write("[]")
t = task(content="Langston — please review B-SETTLE at sha abc1234, Step-4 gate")
b.process_task(t, b.BREAKER, None)
items = json.load(open(b.QUEUE_FILE))
it = next((i for i in items if i.get("id") == str(t["message_id"])), None)
case("an item was created for the request", True, it is not None)
case("it is settled noop, with the stored reason", ("noop", "request failed, requester re-sends"),
     ((it or {}).get("state"), (it or {}).get("settle_reason")))
case("self-advance's pick does not choose it", None, lq.pick_next_ready(items))

print("6. C-1: an exception in process_task (worker_error) -> the notice, through the REAL task_worker")
reset(); INVOKE["mode"] = "raise"; open(b.QUEUE_FILE, "w").write("[]")
q = lq.LaneTaskQueue()
threading.Thread(target=b.task_worker, args=(q,), daemon=True, name="task-worker-1").start()
t = task(content="Langston — please review B-CRASH at sha def5678, Step-4 gate")
q.put(t)
q.join()
time.sleep(0.3)
case("the requester got the notice, naming an internal error", (1, True), (len(SENT), "internal error" in (SENT[0]["text"] if SENT else "")))
case("the declared row with outcome worker_error", ["worker_error"], [r.get("outcome") for r in kinds(ROWS, "langston_outbound")])
items = json.load(open(b.QUEUE_FILE))
case("its queue item is settled noop too", "noop", next((i.get("state") for i in items if i.get("id") == str(t["message_id"])), None))
task_rows = [json.loads(l) for l in open(b.TASK_LOG)] if os.path.exists(b.TASK_LOG) else []
case("the task log still records worker_error", "worker_error", next((r["outcome"] for r in task_rows if r["message_id"] == str(t["message_id"])), None))

print("7. P5 + C-4: an escalated alert's failures count on its SPOOL RECORD; at 2, ONE Kyle line, then removal")
reset(); INVOKE["mode"] = "timeout"
at = task(content="**Fill blocked — stale price X**", author=0, display="alerts", is_alert=True, escalated=True)
al.spool_write(al.SPOOL_DIR, {**at, "content": at["content"]}, "escalated", reason="lane escalated", aid="abcd1234")
b.process_task(dict(at), b.BREAKER, None)
rec = json.load(open(al.spool_path(al.SPOOL_DIR, at["message_id"])))
case("after one failure: kept, failed_attempts 1, every field carried forward (state, reason, aid)",
     (1, "escalated", "lane escalated", "abcd1234"), (rec.get("failed_attempts"), rec.get("state"), rec.get("reason"), rec.get("aid")))
case("...and nobody was posted to yet", [], SENT)
POST_OK["v"] = False
b.process_task(dict(at), b.BREAKER, None)
case("second failure, the Kyle line FAILS to post: the record is KEPT", True, os.path.exists(al.spool_path(al.SPOOL_DIR, at["message_id"])))
POST_OK["v"] = True; SENT.clear()
b.process_task(dict(at), b.BREAKER, None)
case("then: ONE Kyle line, mentioning Kyle, naming the outcome", (1, KYLE, True, True),
     (len(SENT), SENT[0]["mention"] if SENT else None, (SENT[0]["text"] if SENT else "").startswith("Kyle — "), "timeout" in (SENT[0]["text"] if SENT else "")))
case("the spool record is removed after the line posted", False, os.path.exists(al.spool_path(al.SPOOL_DIR, at["message_id"])))

print("7b. Langston 4B fix 1: a CORRUPT spool record does not swallow the alert - Kyle is told at once")
reset(); INVOKE["mode"] = "timeout"
at2 = task(content="**Fill blocked — stale price Y**", author=0, display="alerts", is_alert=True, escalated=True)
os.makedirs(al.SPOOL_DIR, exist_ok=True)
open(al.spool_path(al.SPOOL_DIR, at2["message_id"]), "w").write("{not json")
b.process_task(dict(at2), b.BREAKER, None)
case("one Kyle line, mentioning Kyle", (1, KYLE, True), (len(SENT), SENT[0]["mention"] if SENT else None,
                                                         (SENT[0]["text"] if SENT else "").startswith("Kyle — ")))
case("the handler did not fail silently (no 'no-reply handling FAILED' line)", False, "no-reply handling FAILED" in log_text())

print("8. P5: a self-advance failure is recorded on its item, and the PARK notice names it")
reset(); INVOKE["mode"] = "timeout"
item = lq.new_item("ADV1", "OLD Claude", "review B-ADV", pointer=None, gate_type=None)
item["self_advance_refires"] = lq.SAME_ID_CAP
open(b.QUEUE_FILE, "w").write(json.dumps([item]))
st = task(content="(self-advance) review B-ADV", author=0, display="self-advance", self_advance=True, addressee="OLD Claude")
st["message_id"] = "adv-ADV1"
b.process_task(st, b.BREAKER, None)
items = json.load(open(b.QUEUE_FILE))
case("the item carries last_failure = timeout", "timeout", items[0].get("last_failure"))
case("no channel notice for a self-advance failure (no requester post)", [], SENT)
nxt, notes = b._self_advance_pick(items, CHANNEL, st)
case("the PARK notice names the failure, not a missing marker", (True, False),
     (any("FAILED (timeout)" in n for n in notes), any("without a settle marker" in n for n in notes)))

print("9. P10: a person's request writes langston_enqueued at acceptance; the dedup sets stay handled-only")


class TaskQ(list):
    """Records, AT the moment of each put, whether its langston_enqueued row already existed."""
    seen_row_at_put = []

    def put(self, t):
        TaskQ.seen_row_at_put.append(any(r.get("kind") == "langston_enqueued" and r.get("message_id") == t.get("message_id")
                                         for r in ROWS))
        self.append(t)


TASKS = TaskQ()
reset()
CLIENT = b.build_client(TASKS)
case("the watchdog's dedup kinds are still exactly {'langston_inbound'}", {"langston_inbound"}, WATCHDOG.get("dedup_kinds"))
src = open(os.path.join(HERE, "discord-langston-bridge.py"), encoding="utf-8").read()
case("recovery's started-set reader still reads kinds={'langston_inbound'} only", True,
     'started = gw.inbox_message_ids(dc.INBOX_LOG, kinds={"langston_inbound"})' in src)
case("...and 'langston_enqueued' appears in no kinds= set anywhere", [], re.findall(r'kinds=\{[^}]*langston_enqueued', src))
_mid = itertools.count(1568900000000000000, 1 << 22)


def post(content, author_id=CC_BOT, name="NEW Claude"):
    m = NS(id=next(_mid), author=NS(id=author_id, display_name=name, name=name), guild=object(),
           channel=NS(id=CHANNEL), webhook_id=None, content=content, created_at=None, attachments=[], flags=NS(value=0))
    before = len(TASKS)
    asyncio.run(CLIENT.on_message(m))
    return m, TASKS[before:]


m, new = post("Langston — please review B-ENQ")
enq = kinds(ROWS, "langston_enqueued")
case("one task queued and ONE langston_enqueued row, keyed on the message id",
     (1, 1, m.id), (len(new), len(enq), enq[0].get("message_id") if enq else None))
case("its sender_username is the SAME value the handled (langston_inbound) row uses - the census maps on it",
     new[0].get("author_name") if new else "x", enq[0].get("sender_username") if enq else None)
case("the row already existed AT the moment of the put", [True], TaskQ.seen_row_at_put[-1:])

print("10. P11: another AGENT's failure notice is not a request (inert until #1241 A6 - driven here with a recognised id)")
b.AGENT_BOT_IDS = {CC_BOT}          # stand-in for A6: an agent id that the gate ALREADY engages, so the marker decides
_, new = post("Langston — " + b.FAILURE_NOTICE_MARKER + " your request to Coltrane failed; nothing was reviewed.")
case("with the marker: nothing enqueued", 0, len(new))
_, new = post("Langston — please review B-CONTROL")
case("positive control, same author, no marker: it DOES enqueue", 1, len(new))
case("a person quoting the marker still engages (only an agent author counts)", False,
     b.is_other_agent_failure_notice(KYLE, "Langston — " + b.FAILURE_NOTICE_MARKER))
b.AGENT_BOT_IDS = set()
case("with AGENT_BOT_IDS empty (today) the check is inert", False,
     b.is_other_agent_failure_notice(CC_BOT, "Langston — " + b.FAILURE_NOTICE_MARKER))

print("11. a SUCCESSFUL request is untouched: a normal reply, no notice, no failure field")
reset(); INVOKE["mode"] = "ok"; t = task()
b.process_task(t, b.BREAKER, None)
out = kinds(ROWS, "langston_outbound")
case("one reply, no failure_notice, no marker in the text", (1, None, False),
     (len(out), out[0].get("failure_notice") if out else "x", b.FAILURE_NOTICE_MARKER in (SENT[0]["text"] if SENT else "")))

print("12. Langston 4B fix 2: a reply that could NOT be posted in full gets its own wording, never 'nothing was reviewed'")
reset(); INVOKE["mode"] = "ok"; POST_PLAN[:] = [False, True]     # the reply's post fails, the notice's succeeds
t = task()
b.process_task(t, b.BREAKER, None)
note = SENT[-1]["text"] if SENT else ""
case("the notice says the reply could not be posted in full and anything above is incomplete", (True, True, False),
     (b.FAILURE_NOTICE_MARKER in note, "treat anything above as incomplete" in note, "nothing was reviewed" in note))
case("its row carries outcome post_failed", ["post_failed"],
     [r.get("outcome") for r in kinds(ROWS, "langston_outbound") if r.get("failure_notice")])
POST_PLAN[:] = []

print("\n%d passed, %d failed (scratch %s)" % (P, F, SCRATCH))
sys.exit(1 if F else 0)
