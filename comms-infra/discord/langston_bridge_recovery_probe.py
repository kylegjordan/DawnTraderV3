"""Behaviour probe for B-LANGSTON-RELIEF OBJ-1, run on Helsinki as root with the bridge venv:
   /opt/discord-bridges/venv/bin/python3 langston_bridge_recovery_probe.py
from a directory holding the bridge, langston_queue.py, discord_common.py and gateway_watchdog.py
(PROBE_BRIDGE_DIR overrides). It reads the real CFG (/etc/dawntrader/discord-comms.env).
No gateway connection is made and nothing is posted: the watchdog install is stubbed and the
real handler is driven with fake message objects."""
import asyncio, datetime as dt, importlib.util, os, sys, tempfile, types

HERE = os.environ.get("PROBE_BRIDGE_DIR") or os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import gateway_watchdog as gw
gw.install_watchdog = lambda *a, **k: None          # no gateway liveness loop, no backfill
spec = importlib.util.spec_from_file_location("bridge", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
lq = b.lq
CFG = b.CFG
REAL_INBOX_IDS, REAL_INBOX_EVIDENCE = gw.inbox_message_ids, b.al.inbox_evidence   # the readers, before any stub
# ⛔ NOTHING THE PROBE DOES MAY LAND IN A LIVE FILE (Langston, gate B 2026-10-17: probe runs had written 161 lines
# with fake ids 1000-1999 into /var/log/discord-langston-bridge.log, a population trap for anyone grepping it).
# Every path the bridge writes is pointed into a scratch dir BEFORE any scenario, and the end of the run checks the
# live log and inbox did not grow.
_SCRATCH = tempfile.mkdtemp(prefix="probe-bridge-")
LIVE = [b.LOG_FILE, b.dc.INBOX_LOG]
_live_size = {p: (os.path.getsize(p) if os.path.exists(p) else None) for p in LIVE}
b.LOG_FILE = os.path.join(_SCRATCH, "bridge.log")
b.dc.INBOX_LOG = os.path.join(_SCRATCH, "inbox.jsonl")
b.QUEUE_FILE = os.path.join(_SCRATCH, "queue.json")

fails = 0
def check(name, cond):
    global fails
    print(("ok   " if cond else "FAIL ") + name)
    if not cond:
        fails += 1

PRE = dt.datetime(2026, 10, 16, 8, 0, 0, tzinfo=dt.timezone.utc)
FLOOR = dt.datetime(2026, 10, 16, 7, 10, 43, tzinfo=dt.timezone.utc)
_ids = iter(range(1000, 2000))

def msg(author_id, content, webhook_id=None, created=PRE, name="someone"):
    return types.SimpleNamespace(
        id=next(_ids), author=types.SimpleNamespace(id=author_id, display_name=name, name=name, bot=False),
        guild=object(), channel=types.SimpleNamespace(id=CFG["channel_id"]), created_at=created,
        webhook_id=webhook_id, content=content, attachments=[], embeds=[], reference=None)

KYLE, CCBOT = CFG["kyle_id"], CFG["cc_bot_id"]
ALERTS_WH = CFG.get("alerts_webhook_id")
check("config has an alerts webhook id (else the alert cases prove nothing)", ALERTS_WH is not None)

def fresh_client(floor):
    q = lq.TaskPriorityQueue()
    c = b.build_client(q, floor)
    c._connection.user = types.SimpleNamespace(id=999999)     # the loop guard compares against client.user.id
    return q, c

async def scenario():
    q, c = fresh_client(FLOOR)
    await c.on_message(msg(KYLE, "Langston, old post from Kyle"))
    check("pre-start message WITHOUT recovery is still skipped (the chunk-fix guard holds)", q.qsize() == 0)
    await c.on_message(msg(KYLE, "Langston, old post from Kyle"), _recover=True)
    check("pre-start Kyle post naming Langston IS recovered", q.qsize() == 1)
    await c.on_message(msg(KYLE, "a note for the sessions, no name"), _recover=True)
    check("pre-start Kyle post NOT naming Langston is not enqueued", q.qsize() == 1)
    await c.on_message(msg(123, "[alert] VTS exit decisions unavailable", webhook_id=ALERTS_WH), _recover=True)
    check("pre-start SYSTEM ALERT is NOT recovered", q.qsize() == 1)
    await c.on_message(msg(CCBOT, "Langston, one gate please", name="OLD Claude"), _recover=True)
    check("pre-start session post that leads with Langston IS recovered", q.qsize() == 2)
    await c.on_message(msg(123, "[alert] new one", webhook_id=ALERTS_WH,
                           created=dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=5)))
    check("a NEW alert after start is still enqueued", q.depth_by_class() == (2, 0, 1))
    order = [q.get()["content"][:20] for _ in range(3)]
    check("people first, alert last", order[-1].startswith("[alert] new one"))

    # The recovery pass itself: started ids skipped, file consumed, runs once.
    with tempfile.TemporaryDirectory() as d:
        lq.RECOVER_FLOOR_FILE = os.path.join(d, "recover-since")
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q2, c2 = fresh_client(FLOOR)
        started = msg(KYLE, "Langston, already being handled")
        waiting = msg(KYLE, "Langston, still waiting")
        alert = msg(123, "[alert] stale", webhook_id=ALERTS_WH)
        seen_after = []
        class Ch:
            def history(self, after=None, oldest_first=None, limit=None):
                seen_after.append((after, oldest_first, limit))
                async def gen():
                    for m in (started, waiting, alert):
                        yield m
                return gen()
        c2.get_channel = lambda _cid: Ch()
        b.gw.inbox_message_ids = lambda *_a, **_k: {started.id}
        b.al.inbox_evidence = lambda *_a, **_k: (set(), {started.id})      # started AND answered
        await c2.on_ready()
        check("recovery asked for history after the floor, oldest first, unlimited",
              seen_after == [(FLOOR, True, None)])
        contents = [q2.get()["content"] for _ in range(q2.qsize())]
        check("recovery enqueued exactly the waiting post (not the started one, not the alert)",
              contents == ["Langston, still waiting"])
        check("recovery consumed the floor file", not os.path.exists(lq.RECOVER_FLOOR_FILE))
        await c2.on_ready()
        check("a reconnect does not run recovery again", q2.qsize() == 0 and len(seen_after) == 1)

    # 2026-10-17 03:19:28Z, measured: a restart between "claude returned" and the post lost a COMPLETED review,
    # because a STARTED message was treated as done. Started-but-unanswered must be re-fed.
    with tempfile.TemporaryDirectory() as d:
        lq.RECOVER_FLOOR_FILE = os.path.join(d, "recover-since")
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q3, c3 = fresh_client(FLOOR)
        answered = msg(KYLE, "Langston, started and answered")
        lost = msg(KYLE, "Langston, started but the reply never posted")
        class Ch4:
            def history(self, **_k):
                async def gen():
                    for m in (answered, lost):
                        yield m
                return gen()
        c3.get_channel = lambda _cid: Ch4()
        b.gw.inbox_message_ids = lambda *_a, **_k: {answered.id, lost.id}
        b.al.inbox_evidence = lambda *_a, **_k: (set(), {answered.id})
        await c3.on_ready()
        got = [q3.get()["content"] for _ in range(q3.qsize())]
        check("started-but-UNANSWERED is re-fed; started-and-answered is not",
              got == ["Langston, started but the reply never posted"])

def grp_msg(gid, k, n, text, created=PRE):
    return msg(CCBOT, ("Langston, " if k == 1 else "") + text + " ⟨grp=%s %d/%d⟩" % (gid, k, n),
               created=created, name="OLD Claude")


async def failure_scenarios():
    """Coltrane send-back (2026-10-16): a failed pass must keep its floor and retry; a started chunk group
    must be skipped whole. Each case is red on e47e52eff and green after the fix."""
    with tempfile.TemporaryDirectory() as d:
        lq.RECOVER_FLOOR_FILE = os.path.join(d, "recover-since")
        b.gw.inbox_message_ids = lambda *_a, **_k: set()
        b.al.inbox_evidence = lambda *_a, **_k: (set(), set())
        b.dc.rest_send = lambda *a, **k: None                 # no post leaves the probe

        # (1) channel missing, then present on the next gateway ready
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q, c = fresh_client(FLOOR)
        waiting = msg(KYLE, "Langston, waiting through a failed pass")
        c.get_channel = lambda _cid: None
        async def no_fetch(_cid):
            raise RuntimeError("fetch failed")
        c.fetch_channel = no_fetch
        await c.on_ready()
        check("missing channel: the floor file is KEPT", os.path.exists(lq.RECOVER_FLOOR_FILE))
        check("missing channel: nothing enqueued yet", q.qsize() == 0)
        class Ch1:
            def history(self, **_k):
                async def gen():
                    yield waiting
                return gen()
        c.get_channel = lambda _cid: Ch1()
        await c.on_ready()
        check("missing channel: the retry on the next ready recovers the message", q.qsize() == 1)
        check("missing channel: floor removed only after the successful pass", not os.path.exists(lq.RECOVER_FLOOR_FILE))

        # (2) history raises part-way, then succeeds; nothing is enqueued twice
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q, c = fresh_client(FLOOR)
        m1, m2 = msg(KYLE, "Langston, first"), msg(KYLE, "Langston, second")
        state = {"fail": True}
        class Ch2:
            def history(self, **_k):
                async def gen():
                    yield m1
                    if state["fail"]:
                        raise RuntimeError("history broke")
                    yield m2
                return gen()
        c.get_channel = lambda _cid: Ch2()
        await c.on_ready()
        check("history failure: the floor file is KEPT", os.path.exists(lq.RECOVER_FLOOR_FILE))
        state["fail"] = False
        await c.on_ready()
        got = [q.get()["content"] for _ in range(q.qsize())]
        check("history failure: the retry recovers both, each exactly once", got == ["Langston, first", "Langston, second"])

        # (3) an already-started three-piece group is skipped whole; a later message triggers no INCOMPLETE flush
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q, c = fresh_client(FLOOR)
        p1, p2, p3 = (grp_msg("abcdef12", k, 3, "piece %d" % k) for k in (1, 2, 3))
        u1, u2, u3 = (grp_msg("0011aa22", k, 3, "fresh %d" % k) for k in (1, 2, 3))
        b.gw.inbox_message_ids = lambda *_a, **_k: {p3.id}      # the COMPLETE path records the last piece (Langston)
        b.al.inbox_evidence = lambda *_a, **_k: (set(), {p3.id})
        class Ch3:
            def history(self, **_k):
                async def gen():
                    for m in (p1, p2, p3, u1, u2, u3):
                        yield m
                return gen()
        c.get_channel = lambda _cid: Ch3()
        await c.on_ready()
        got = [q.get()["content"] for _ in range(q.qsize())]
        check("started group: none of its pieces is re-fed", not any("piece" in g for g in got))
        check("unstarted group: reassembled into ONE task", len(got) == 1 and all(("fresh %d" % k) in got[0] for k in (1, 2, 3)))
        for e in b._chunk_groups.values():
            e["t0"] -= 3600                                  # make any leftover buffer look long silent
        later = msg(CCBOT, "Langston, a later post", created=dt.datetime.now(dt.timezone.utc) + dt.timedelta(seconds=5),
                    name="OLD Claude")
        await c.on_message(later)
        got = [q.get()["content"] for _ in range(q.qsize())]
        check("no INCOMPLETE duplicate flushes after the timeout", got == ["Langston, a later post"])

async def delivery_scenario():
    """Langston, bridge-recovery gate at 5018aca33: a reply that did NOT reach Discord must not mark its message
    answered. Drives the REAL process_task (invoke_claude and rest_send stubbed, every file in a temp dir) and then
    the REAL recovery readers over the inbox it wrote - no stub between the reply and the recovery decision."""
    with tempfile.TemporaryDirectory() as d:
        b.gw.inbox_message_ids, b.al.inbox_evidence = REAL_INBOX_IDS, REAL_INBOX_EVIDENCE
        b.dc.INBOX_LOG = os.path.join(d, "inbox.jsonl")
        b.LOG_FILE, b.QUEUE_FILE = os.path.join(d, "bridge.log"), os.path.join(d, "queue.json")
        b.SELF_ADVANCE_ENABLED = False
        b.invoke_claude = lambda *a, **k: "Kyle — here is the review."
        q, c = fresh_client(FLOOR)
        posted, failed = msg(KYLE, "Langston, this reply will post"), msg(KYLE, "Langston, this reply will fail")
        for m, sent in ((posted, "7777"), (failed, None)):
            await c.on_message(m, _recover=True)
            b.dc.rest_send = lambda *a, _s=sent, **k: _s
            b.process_task(q.get(), {}, {"bot_turns": 0})
        import json as _j
        rows = [_j.loads(l) for l in open(b.dc.INBOX_LOG, encoding="utf-8")]
        outs = [r for r in rows if r.get("kind") == "langston_outbound"]
        check("a delivered reply writes langston_outbound with its message id",
              [(r.get("reply_to"), r.get("message_id")) for r in outs] == [(posted.id, "7777")])
        check("a failed post writes NO langston_outbound, and a post_failed silent row instead",
              any(r.get("kind") == "langston_silent" and r.get("reply_to") == failed.id and r.get("reason") == "post_failed"
                  for r in rows))
        # the two historical shapes already in the live log: an outbound row with message_id null, and one with none
        with open(b.dc.INBOX_LOG, "a", encoding="utf-8") as fh:
            fh.write(_j.dumps({"kind": "langston_inbound", "message_id": 5551}) + "\n")
            fh.write(_j.dumps({"kind": "langston_outbound", "reply_to": 5551, "message_id": None}) + "\n")
        started = b.gw.inbox_message_ids(b.dc.INBOX_LOG, kinds={"langston_inbound"})
        _r, replied = b.al.inbox_evidence(b.dc.INBOX_LOG, tail_bytes=1 << 30)
        done = started & replied
        check("recovery (real readers) counts ONLY the delivered reply as answered",
              posted.id in done and failed.id not in done and 5551 not in done)
        # and the recovery pass itself, over that inbox, re-feeds exactly the two undelivered ones
        lq.RECOVER_FLOOR_FILE = os.path.join(d, "recover-since")
        open(lq.RECOVER_FLOOR_FILE, "w").write("2026-10-16T07:10:43Z")
        q2, c2 = fresh_client(FLOOR)
        hist = (msg(KYLE, "Langston, this reply will post"), msg(KYLE, "Langston, this reply will fail"),
                msg(KYLE, "Langston, the historical null row"))
        hist[0].id, hist[1].id, hist[2].id = posted.id, failed.id, 5551
        class ChD:
            def history(self, **_k):
                async def gen():
                    for m in hist:
                        yield m
                return gen()
        c2.get_channel = lambda _cid: ChD()
        await c2.on_ready()
        got = [q2.get()["content"] for _ in range(q2.qsize())]
        check("recovery pass re-feeds the failed post and the null-id row, not the delivered one",
              got == ["Langston, this reply will fail", "Langston, the historical null row"])

asyncio.run(scenario())
asyncio.run(failure_scenarios())
asyncio.run(delivery_scenario())
# the live bridge may append to its own log/inbox while the probe runs, so "did not grow" is checked against lines
# the PROBE would write: none of its fake ids may appear in what was appended
for p, n0 in _live_size.items():
    if n0 is None or not os.path.exists(p):
        continue
    with open(p, "rb") as fh:
        fh.seek(n0)
        tail = fh.read().decode("utf-8", "replace")
    check("nothing the probe wrote reached the live file %s" % p,
          not any(("msg %d " % i) in tail or ('"message_id": %d,' % i) in tail for i in range(1000, 2000)))
print("probe failures:", fails)
sys.exit(1 if fails else 0)
