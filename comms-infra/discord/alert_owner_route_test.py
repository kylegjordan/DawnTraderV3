"""alert_owner_route_test.py - B-TOKEN-ECONOMY amendment 1, P6: the alert lane reads the crew's owner table.

Three layers, each driven at the entry point production uses:
  1. alert_owner_route  - the pure routing rules the builder and the lane share;
  2. alert_lane         - owner_routing / table_routes / apply_table / build_prompt, then the same order the bridge runs
                          (read_answer -> apply_table -> apply_precedent on the rest -> merge -> enforce_live_rows);
  3. the bridge         - run_alert_batch itself, with Discord, the mirror, the lane and the live rows stood in, so the
                          seeded legs of proof (ii) run through the code that ships: a table batch reaches its owner
                          with the rule stated, an unknown key reaches CC-INFRA stated as the fallback, and a failed
                          or unparseable read escalates the whole batch without invoking the lane (R2-4).
Linux only (the bridge imports fcntl; the spool fsyncs a directory). CI is its grader. Exit 1 on any failure.
"""
import json
import os
import sys
import tempfile
import types
from types import SimpleNamespace as NS

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import alert_owner_route as aor  # noqa: E402

P = F = 0


def ok(name, cond):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name)


def raises(fn, *a):
    try:
        fn(*a)
    except (ValueError, RuntimeError, KeyError, TypeError):
        return True
    return False


# ---- seeded inputs: a small table, register and plan ----------------------------------------------------------------
TABLE = {
    "_about": {"order": "see alert_owner_route"},
    "batches": {"B-TBL": {"owner": "CC-B", "n": 3}},
    "prefixes": {"gov-widget": {"owner": "CC-A", "n": 5}, "gov-widget-long": {"owner": "CC-C", "n": 1}},
    "titles": {"Nightly archive failed": {"owner": "CC-C", "n": 2}},
    "fallback": "CC-INFRA",
}
TABLE_TEXT = json.dumps(TABLE)
NL = chr(10)
REGISTER = NL.join([
    "# Open batch register", "",
    "## Infra Claude (CC-INFRA)", "| batch | step |", "|---|---|", "| B-REG | 7 |", "| ~~B-REGDONE~~ | closed |", "",
    "## NEW Claude (CC-B)", "| batch | step |", "|---|---|", "| B-BOTH | 3 |", "",
    "## PM Claude (CC-PM)", "| batch | step |", "|---|---|", "| B-PMB | 1 |", ""])
PLAN = NL.join([
    "| # | batch / reference | owner | note |", "|---|---|---|---|",
    "| 1 | B-PLANB | CC-A | x |",
    "| 2 | B-BOTH | CC-A | the register wins over this |",
    "| 3 | B-TWO | CC-A | y |",
    "| 4 | B-TWO | CC-C | z |",
    "| 5 | B-PROSE | a note naming CC-B in passing | w |",
    "| 7 | B-PMPLAN | CC-PM | x |",
    "| CC-C | **B-LEFT** | left-hand owner cell |", ""])

# ---- 1. alert_owner_route -------------------------------------------------------------------------------------------
reg = aor.parse_register(REGISTER)
ok("register: a row under the Infra section is CC-INFRA", reg.get("B-REG") == "CC-INFRA")
ok("register: a struck row still parses", reg.get("B-REGDONE") == "CC-INFRA")
ok("register: section owner, not first section", reg.get("B-BOTH") == "CC-B")
ok("register: empty text RAISES (never an empty map)", raises(aor.parse_register, ""))
ok("register: text with no session section RAISES", raises(aor.parse_register, "| B-X | 1 |"))

plan_owner, multi = aor.parse_plan(PLAN)
ok("plan: owner to the right of the batch cell", plan_owner.get("B-PLANB") == "CC-A")
ok("plan: owner to the LEFT of the batch cell", plan_owner.get("B-LEFT") == "CC-C")
ok("plan: a batch with two different owners is left out and listed as multi",
   "B-TWO" not in plan_owner and multi.get("B-TWO") == ["CC-A", "CC-C"])
ok("plan: a prose cell naming a session is not an owner (C-5)", "B-PROSE" not in plan_owner)
ok("plan: empty text RAISES", raises(aor.parse_plan, ""))
ok("plan: a table with no owner cells RAISES", raises(aor.parse_plan, "| 1 | B-X | note |"))

BO = aor.batch_owners(reg, plan_owner)
ok("batch owners: the register wins over the plan", BO.get("B-BOTH") == "CC-B")
ok("batch owners: a plan-only batch is kept", BO.get("B-PLANB") == "CC-A")

t = aor.load_table(TABLE_TEXT)
ok("table: loads", t["fallback"] == "CC-INFRA")
ok("table: empty text RAISES", raises(aor.load_table, ""))
ok("table: whitespace RAISES", raises(aor.load_table, "  " + NL))
ok("table: not JSON RAISES", raises(aor.load_table, "{nope"))
ok("table: a JSON list RAISES", raises(aor.load_table, "[]"))
for sect in ("batches", "prefixes", "titles"):
    bad = dict(TABLE)
    bad.pop(sect)
    ok("table: missing %s section RAISES" % sect, raises(aor.load_table, json.dumps(bad)))
ok("table: zero rows RAISES",
   raises(aor.load_table, json.dumps({"batches": {}, "prefixes": {}, "titles": {}, "fallback": "CC-INFRA"})))
ok("table: a row owned by Kyle RAISES",
   raises(aor.load_table, json.dumps(dict(TABLE, batches={"B-K": {"owner": "Kyle"}}))))
ok("table: a row owned by PM RAISES (not a building session)",
   raises(aor.load_table, json.dumps(dict(TABLE, batches={"B-K": {"owner": "CC-PM"}}))))
ok("table: a fallback of Kyle RAISES", raises(aor.load_table, json.dumps(dict(TABLE, fallback="Kyle"))))
ok("table: no fallback RAISES", raises(aor.load_table, json.dumps({k: v for k, v in TABLE.items() if k != "fallback"})))

R = lambda k, title, c="breakage": aor.table_route(k, c, title, t, BO)  # noqa: E731
ok("route: a session named at the title's start", R("anything", "CC-A: thing broke") == ("CC-A", "owner named in title"))
ok("route: a display name at the title's start", R("anything", "NEW Claude - thing") == ("CC-B", "owner named in title"))
ok("route: 'owner CC-x' anywhere in the title", R("k", "Thing is stale, owner CC-C") == ("CC-C", "owner named in title"))
ok("route: a deploy-window key -> its batch's TABLE row",
   R("deploy-window-stale:B-TBL:abc123:2026", "Window stale") == ("CC-B", "batch:B-TBL"))
ok("route: a deploy-in-window key with no table row -> the register",
   R("deploy-in-window:B-REG:abc:ts", "In window") == ("CC-INFRA", "register/plan:B-REG"))
ok("route: a gov key with a colon -> its batch (register wins over plan)",
   R("gov-staleopen:B-BOTH", "Stale open") == ("CC-B", "register/plan:B-BOTH"))
ok("route: a gov key whose batch only the plan knows",
   R("gov-staleopen:B-PLANB", "Stale open") == ("CC-A", "register/plan:B-PLANB"))
ok("route: a keyless row whose title opens with a batch-id",
   R("", "B-TBL: summary page stale") == ("CC-B", "batch:B-TBL"))
ok("route: a keyless row -> its title stem", R("", "Nightly archive failed on run 3") == ("CC-C", "title:Nightly archive failed"))
ok("route: the LONGEST prefix wins", R("gov-widget-long-x", "t") == ("CC-C", "prefix:gov-widget-long"))
ok("route: a shorter prefix", R("gov-widget-x", "t") == ("CC-A", "prefix:gov-widget"))
ok("route: a keyed row whose title opens with a batch-id", R("zz-unknown", "B-REG: thing") == ("CC-INFRA", "register/plan:B-REG"))
ok("route: a known batch named anywhere in the title",
   R("zz-unknown", "the thing for B-PLANB broke") == ("CC-A", "title names B-PLANB"))
ok("route: a two-owner plan batch is not used", R("zz-unknown", "the thing for B-TWO broke") == ("CC-INFRA", "fallback"))
ok("route: nothing matches -> the fallback, named as such", R("zz-unknown", "Something odd") == ("CC-INFRA", "fallback"))
ok("route: a keyless row with no stem -> the fallback", R("", "An unheard-of title") == ("CC-INFRA", "fallback"))

# Step-4 BLOCKER-1 (Langston 2026-11-20): the register and the plan can name CC-PM; the lane must never route to it.
ok("register: a row under the PM Claude section parses as CC-PM", reg.get("B-PMB") == "CC-PM")
ok("plan: a CC-PM owner cell parses as CC-PM", plan_owner.get("B-PMPLAN") == "CC-PM")
pm1 = R("gov-staleopen:B-PMB", "Stale open")
ok("route BLOCKER-1: a register batch owned by CC-PM ESCALATES (no owner), never routes to CC-PM",
   pm1[0] is None and aor.is_escalation(pm1) and "CC-PM" in pm1[1])
pm2 = R("zz-unknown", "the thing for B-PMPLAN broke")
ok("route BLOCKER-1: a plan batch owned by CC-PM named in the title ESCALATES",
   pm2[0] is None and aor.is_escalation(pm2) and "B-PMPLAN" in pm2[1])
pm3 = R("deploy-in-window:B-PMB:abc:ts", "In window")
ok("route BLOCKER-1: a deploy-window key for a CC-PM batch ESCALATES", pm3[0] is None and aor.is_escalation(pm3))
ok("route BLOCKER-1: a CC-PM title opener is NOT an owner (falls to the rules, not to CC-PM)",
   R("zz-unknown", "PM Claude: something") == ("CC-INFRA", "fallback"))
ok("is_escalation: a normal route is not", not aor.is_escalation(("CC-A", "register/plan:B-PLANB")))
ok("is_escalation: the fallback is not", not aor.is_escalation(("CC-INFRA", "fallback")))
ok("is_escalation: None is not", not aor.is_escalation(None))

ok("key: top-level dedupe_key", aor.dedupe_key_of({"dedupe_key": "gov-x:B-1"}) == "gov-x:B-1")
ok("key: metadata.dedupe_key when the top level is null",
   aor.dedupe_key_of({"dedupe_key": None, "metadata": {"dedupe_key": "gov-staleopen:B-TBL"}}) == "gov-staleopen:B-TBL")
ok("key: neither -> empty", aor.dedupe_key_of({"metadata": "not a dict"}) == "")
ok("key: None row -> empty", aor.dedupe_key_of(None) == "")

# ---- 2. alert_lane --------------------------------------------------------------------------------------------------
import alert_lane as al  # noqa: E402

FILES = {al.OWNER_TABLE_PATH: TABLE_TEXT, al.OWNER_REGISTER_PATH: REGISTER, al.OWNER_PLAN_PATH: PLAN}


def reader(files):
    def read(path):
        if path not in files:
            raise RuntimeError("git show %s exit 128" % path)
        return files[path]
    return read


tbl, bo = al.owner_routing(reader(FILES))
ok("owner_routing: reads all three and merges the register over the plan", bo.get("B-BOTH") == "CC-B" and tbl["fallback"] == "CC-INFRA")
for missing in FILES:
    ok("owner_routing: a failed read of %s RAISES" % missing.split("/")[-1],
       raises(al.owner_routing, reader({k: v for k, v in FILES.items() if k != missing})))
    ok("owner_routing: an EMPTY %s RAISES" % missing.split("/")[-1],
       raises(al.owner_routing, reader(dict(FILES, **{missing: ""}))))

A1, A2, A3, A4, A5, A6, A7, A8 = ["%08x-0000-4000-8000-%012x" % (n, n) for n in range(1, 9)]
ROWS = {
    A1: {"id": A1, "dedupe_key": "deploy-window-stale:B-TBL:abc:ts", "title": "Window stale", "category": "breakage"},
    A2: {"id": A2, "dedupe_key": None, "metadata": {"dedupe_key": "zz-unknown"}, "title": "Something odd"},
    A3: None,
    A4: {"id": A4, "metadata": {"dedupe_key": "gov-staleopen:B-PLANB"}, "title": "Stale open"},
}
tr = al.table_routes(ROWS, tbl, bo)
ok("table_routes: a table batch", tr.get(A1) == ("CC-B", "batch:B-TBL"))
ok("table_routes: the metadata key is read (unknown -> fallback)", tr.get(A2) == ("CC-INFRA", "fallback"))
ok("table_routes: an unreadable row gets no route", A3 not in tr)
ok("table_routes: the metadata key routes a gov key", tr.get(A4) == ("CC-A", "register/plan:B-PLANB"))

K = lambda n: ("Template %d" % n, None)  # noqa: E731
keys = {A1: K(1), A2: K(2), A3: K(3), A4: K(4), A5: K(5), A6: K(6), A7: K(7), A8: K(8)}
TS = lambda d: "2026-11-%02dT10:00:00" % d  # noqa: E731
prec = {
    K(3): [(TS(15), "CC-C")],                                  # A3: fallback rule WITH precedent -> rest
    K(4): [(TS(15), "CC-B")],                                  # A4: clean precedent, a DIFFERENT owner -> escalate
    K(5): [(TS(15), "Kyle")],                                  # A5: clean precedent to Kyle -> escalate
    K(6): [(TS(14), "CC-A"), (TS(15), "CC-B"), (TS(16), "CC-A"), (TS(17), "CC-B")],  # A6: interleave -> table settles
    K(7): [(TS(15), "CC-B")],                                  # A7: clean precedent, SAME owner -> routed
}
troutes = {A1: ("CC-B", "batch:B-TBL"), A2: ("CC-INFRA", "fallback"), A3: ("CC-INFRA", "fallback"),
           A4: ("CC-A", "register/plan:B-PLANB"), A5: ("CC-A", "prefix:gov-widget"), A6: ("CC-B", "batch:B-TBL"),
           A7: ("CC-B", "batch:B-TBL")}
lane = {A1: ("CC-A", "look"), A2: ("CC-C", "look"), A3: ("CC-C", "look"), A4: ("CC-A", "look"),
        A5: ("CC-A", "look"), A6: ("CC-A", "look"), A7: ("CC-B", "look"), A8: ("CC-A", "look")}
routed, esc, notes, rest = al.apply_table(lane, {}, keys, prec, troutes)
ok("apply_table: a table rule overrides the lane's choice, rule stated",
   routed.get(A1) == ("CC-B", "look (owner table: batch:B-TBL)"))
ok("apply_table: the override is noted, never silent", any(A1 in n and "CC-A" in n for n in notes))
ok("apply_table: fallback with no precedent -> the fallback owner, stated as fallback",
   routed.get(A2) == ("CC-INFRA", "look (owner table: fallback - no rule matched, no Langston precedent)"))
ok("apply_table: fallback WITH a precedent -> left for apply_precedent", rest.get(A3) == ("CC-C", "look"))
ok("apply_table: a clean precedent naming a DIFFERENT owner -> escalate", A4 in esc and "stale" in esc[A4])
ok("apply_table: a clean precedent naming Kyle -> escalate, saying his last routing was to Kyle",
   A5 in esc and "last routing of Template 5 was to Kyle" in esc[A5])
ok("apply_table: an interleave is SETTLED by the table owner (R2-6)",
   routed.get(A6) == ("CC-B", "look (owner table: batch:B-TBL; settles Langston's back-and-forth)"))
ok("apply_table: a clean precedent agreeing with the table -> routed", routed.get(A7) == ("CC-B", "look (owner table: batch:B-TBL)"))
ok("apply_table: no table route -> left for apply_precedent", rest.get(A8) == ("CC-A", "look"))
seen = list(routed) + list(esc) + list(rest)
ok("apply_table: every alert lands exactly once (none dropped, none doubled)",
   sorted(seen) == sorted(lane) and len(seen) == len(set(seen)))

r2, e2, _n, rest2 = al.apply_table({A1: ("Kyle", "x")}, {}, keys, prec, troutes)
ok("apply_table: the lane routing to Kyle -> escalate, even with a table owner", A1 in e2 and not r2 and not rest2)
r3, e3, _n, rest3 = al.apply_table({A2: ("Kyle", "x")}, {}, keys, prec, troutes)
ok("apply_table: the lane routing to Kyle on a fallback row -> escalate", A2 in e3 and not r3 and not rest3)
PMR = (None, aor.ESCALATE + "batch B-PMB is owned by CC-PM, not a building session")
for lane_owner in ("CC-A", "CC-INFRA", "Kyle"):
    r5, e5, _n, rest5 = al.apply_table({A1: (lane_owner, "x")}, {}, keys, prec, {A1: PMR})
    ok("apply_table BLOCKER-1: an escalation route escalates whatever the lane chose (%s)" % lane_owner,
       A1 in e5 and not r5 and not rest5 and "CC-PM" in e5[A1] and "Langston decides" in e5[A1])
r6, e6, _n, rest6 = al.apply_table({A1: ("CC-A", "x"), A2: ("CC-C", "y")}, {}, keys, prec, {A1: PMR, A2: troutes[A2]})
ok("apply_table BLOCKER-1: every alert still lands exactly once beside an escalation",
   sorted(list(r6) + list(e6) + list(rest6)) == sorted([A1, A2]) and A1 in e6)
ok("table line BLOCKER-1: an escalation route says ESCALATE, never an owner",
   "ESCALATE" in al.owner_table_line(PMR) and "CC-PM" in al.owner_table_line(PMR))
r4, e4, _n, _r = al.apply_table({A1: ("CC-B", "x")}, {"zz": "already"}, keys, prec, troutes)
ok("apply_table: an escalation from read_answer is kept", e4.get("zz") == "already")

# the bridge's order: apply_table -> apply_precedent(rest) -> merge -> enforce_live_rows
routed, esc, _tn, rest = al.apply_table(lane, {}, keys, prec, troutes)
rest, esc, _pn = al.apply_precedent(rest, esc, keys, prec)
routed.update(rest)
live = {a: {"state": "active"} for a in lane if a != A8}
routed, esc = al.enforce_live_rows(routed, esc, live)
ok("pipeline: the fallback-with-precedent alert ends at Langston's owner, tagged by apply_precedent",
   routed.get(A3, ("", ""))[0] == "CC-C" and "(Langston precedent" in routed[A3][1])
ok("pipeline: a no-route alert whose row is unreadable is escalated, not routed blind", A8 in esc and A8 not in routed)
ok("pipeline: no table-routed alert reaches Kyle", all(o != "Kyle" for o, _a in routed.values()))
ok("pipeline: every alert is accounted for", sorted(list(routed) + list(esc)) == sorted(lane))

ok("table line: a rule names the owner and the rule", 'CC-B, by rule "batch:B-TBL"' in al.owner_table_line(("CC-B", "batch:B-TBL")))
ok("table line: the fallback says to follow the precedent", "follow LANGSTON PRECEDENT" in al.owner_table_line(("CC-INFRA", "fallback")))
ok("table line: no row", "no row could be read" in al.owner_table_line(None))
ok("precedent line: an interleave WITH a table owner says the table settles it",
   "OWNER TABLE settles it - route to CC-B" in al.precedent_line(K(6), prec, "CC-B"))
ok("precedent line: an interleave WITHOUT a table owner still says escalate",
   "ESCALATE it to him" in al.precedent_line(K(6), prec, None))

prompt = al.build_prompt([(A6, "alert six"), (A2, "alert two")], keys, prec, {A6: {"state": "active"}, A2: {}}, troutes)
blk6 = prompt.split("=== ALERT 1")[1].split("=== ALERT 2")[0]
blk2 = prompt.split("=== ALERT 2")[1]
ok("prompt: each alert carries an OWNER TABLE line", blk6.count("OWNER TABLE:") >= 1 and blk2.count("OWNER TABLE:") == 1)
ok("prompt: a table rule passes its owner to the precedent line (interleave settled)", "OWNER TABLE settles it" in blk6)
ok("prompt: a fallback row passes NO owner to the precedent line", "OWNER TABLE settles it" not in blk2)
ok("prompt: no troutes -> no OWNER TABLE line (old callers unchanged)",
   "OWNER TABLE" not in al.build_prompt([(A1, "x")], keys, prec, {A1: {}}))

# ---- 3. the bridge: run_alert_batch with Discord, the mirror, the lane and the live rows stood in -------------------
SCRATCH = tempfile.mkdtemp(prefix="owner-route-", dir=HERE)   # never shared /tmp (#979)
import atexit, shutil  # noqa: E401,E402
atexit.register(shutil.rmtree, SCRATCH, True)


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
import discord_common as dc  # noqa: E402
import gateway_watchdog as gw  # noqa: E402

CFG = {"channel_id": 100, "kyle_id": 42, "cc_bot_id": 7, "langston_bot_id": 9, "guild_id": None,
       "webhook_url": "https://discord.example/api/webhooks/55/tok", "webhook_id": 55, "alerts_webhook_id": None,
       "avatars": {}}
dc.load_env_value = lambda path, key: "stand-in"
dc.load_shared_config = lambda: dict(CFG)
gw.install_watchdog = lambda *a, **k: None

import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("bridge_owner_route_test", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)
b.LOG_FILE = os.path.join(SCRATCH, "bridge.log")
b.QUEUE_FILE = os.path.join(SCRATCH, "queue.json")
b.SCRATCH_ROOT = os.path.join(SCRATCH, "scratch")
b.TASK_LOG = os.path.join(SCRATCH, "tasks.jsonl")
b.DRAIN_FLAG = os.path.join(SCRATCH, "drain")
b.ONE_WORKER_FLAG = os.path.join(SCRATCH, "one-worker")
dc.INBOX_LOG = os.path.join(SCRATCH, "inbox.jsonl")
open(dc.INBOX_LOG, "w").close()
bal = b.al
bal.SPOOL_DIR = os.path.join(SCRATCH, "spool")

ESC, POSTS, INVOKES, INBOX = [], [], [], []
b.escalate_alert = lambda task_q, task, reason: ESC.append((task["message_id"], reason))
b.mirror_event = lambda *a, **k: None
dc.rest_send = lambda token, ch, text, logf=None, **k: (POSTS.append(text) or 777)
dc.append_inbox = lambda entry: INBOX.append(entry)
LIVE = {}
b.read_live_rows = lambda ids: {i: LIVE.get(i) for i in ids}
ANSWER = {"v": ""}


def fake_invoke(prompt):
    INVOKES.append(prompt)
    return ANSWER["v"], None


b.invoke_lane = fake_invoke
PREC = {}
bal.langston_precedent = lambda *a, **k: PREC


def task(n, aid, title):
    return {"channel_id": 100, "message_id": 5000 + n, "author_id": 1, "author_name": "dispatcher",
            "content": "🚨 **SYSTEM ALERT — WARNING**" + NL + "**%s**" % title + NL + "body" + NL +
                       "_Category:_ breakage  ·  _Alert ID:_ `%s`" % aid}


REAL_PIN, REAL_READ = b.pin_mirror, b.read_mirror_file
bal.OWNER_MIRROR = os.path.join(SCRATCH, "no-mirror.git")      # never the live mirror, even by accident
PIN = "a" * 40
SHAS = []


def run(batch, files, real=False):
    del ESC[:], POSTS[:], INVOKES[:], INBOX[:], SHAS[:]
    if real:
        b.pin_mirror, b.read_mirror_file = REAL_PIN, REAL_READ
    else:
        b.pin_mirror = lambda now=None: (PIN, 5, "DT_SYNC_PASS")
        rd = reader(files)

        def read2(path, sha):
            SHAS.append(sha)
            return rd(path)
        b.read_mirror_file = read2
    b.run_alert_batch(batch, None)


B1, B2, B3 = A1, A2, A3
batch = [task(1, B1, "Window stale"), task(2, B2, "Something odd"), task(3, B3, "Third thing")]
LIVE.update({B1: ROWS[A1], B2: ROWS[A2],
             B3: {"id": B3, "metadata": {"dedupe_key": "zz-other"}, "title": "Third thing"}})
PREC.clear()
PREC[bal.alert_key(batch[2]["content"])] = [(TS(18), "CC-C")]
ANSWER["v"] = NL.join(['[[ALERT id=%s owner=CC-A action="check the window"]]' % B1,
                       '[[ALERT id=%s owner=CC-C action="look"]]' % B2,
                       '[[ALERT id=%s owner=CC-C action="look"]]' % B3])
run(batch, FILES)
post = POSTS[0] if POSTS else ""
ok("bridge: the lane is invoked once with the OWNER TABLE lines", len(INVOKES) == 1 and INVOKES[0].count("OWNER TABLE:") == 3)
ok("bridge (ii): a table batch reaches its table owner with the rule stated, over the lane's choice",
   '[[ALERT id=%s owner=CC-B action="check the window (owner table: batch:B-TBL)"]]' % B1 in post)
ok("bridge (ii): an unknown key reaches CC-INFRA, stated as the fallback",
   ('[[ALERT id=%s owner=CC-INFRA action="look (owner table: fallback - no rule matched, no Langston precedent)"]]'
    % B2) in post)
ok("bridge: a fallback row with a Langston precedent follows his precedent",
   ("[[ALERT id=%s owner=CC-C action=\"look (Langston precedent" % B3) in post)
ok("bridge: nothing escalated on the clean batch", ESC == [])
ok("bridge C-1: all three governed reads are taken at the ONE pinned sha", SHAS == [PIN, PIN, PIN])
ok("bridge: the post is mirrored to the inbox as langston_outbound",
   len(INBOX) == 1 and INBOX[0]["kind"] == "langston_outbound" and INBOX[0]["text"] == post
   and INBOX[0].get("lane") == "alert" and INBOX[0].get("message_id") == 777)
ok("bridge (ii): every routed marker survives the precedent rule (effective owner ok=True on its own post)",
   all(bal.effective_owner([(TS(19), o)])[2] for o in ("CC-B", "CC-INFRA", "CC-C")))
spooled = sorted(os.listdir(bal.SPOOL_DIR)) if os.path.isdir(bal.SPOOL_DIR) else []
ok("bridge: delivered routing clears its spool", spooled == [])

for missing in FILES:
    run(batch, {k: v for k, v in FILES.items() if k != missing})
    nm = missing.split("/")[-1]
    ok("bridge (ii) R2-4: a failed read of %s escalates the WHOLE batch" % nm,
       sorted(m for m, _r in ESC) == [5001, 5002, 5003] and all("R2-4" in r for _m, r in ESC))
    ok("bridge (ii) R2-4: a failed read of %s does not invoke the lane or post routing" % nm,
       INVOKES == [] and POSTS == [])
run(batch, dict(FILES, **{al.OWNER_TABLE_PATH: json.dumps(dict(TABLE, fallback="Kyle"))}))
ok("bridge R2-4: an untrusted table (Kyle fallback) escalates the whole batch",
   len(ESC) == 3 and all("R2-4" in r for _m, r in ESC) and INVOKES == [])
run(batch, dict(FILES, **{al.OWNER_REGISTER_PATH: "# empty register" + NL}))
ok("bridge R2-4: a register that parses to nothing escalates the whole batch", len(ESC) == 3 and INVOKES == [])

run([{"channel_id": 100, "message_id": 5009, "author_id": 1, "author_name": "d", "content": "no id here"}], FILES)
ok("bridge: an alert with no id is escalated without reading the mirror's verdict",
   ESC == [(5009, "the alert lane could not read an alert id in it")] and INVOKES == [])

# Step-4 BLOCKER-1 through the shipping entry point: a live row keyed to a CC-PM register batch is escalated.
C1 = "%08x-0000-4000-8000-%012x" % (19, 19)
LIVE[C1] = {"id": C1, "metadata": {"dedupe_key": "gov-staleopen:B-PMB"}, "title": "Stale open"}
PREC.clear()
ANSWER["v"] = '[[ALERT id=%s owner=CC-A action="look"]]' % C1
run([task(19, C1, "Stale open")], FILES)
ok("bridge BLOCKER-1: a CC-PM register batch is ESCALATED to Langston, not routed",
   [m for m, _r in ESC] == [5019] and "CC-PM" in ESC[0][1])
ok("bridge BLOCKER-1: no routing marker for it is published", not any(("id=%s owner=" % C1) in p for p in POSTS))
ok("bridge BLOCKER-1: the lane prompt told Langston it is an escalation",
   len(INVOKES) == 1 and "OWNER TABLE: ESCALATE" in INVOKES[0])

# ---- 4. the REAL pin and read against a real bare repo (C-1, C-2, C-3, C-5) ----------------------------------------
import subprocess  # noqa: E402
import time  # noqa: E402

GENV = {k: v for k, v in os.environ.items() if not k.startswith("GIT_")}
GENV["HOME"] = SCRATCH


def git(*a, cwd=None):
    r = subprocess.run(["git"] + list(a), cwd=cwd, env=GENV, capture_output=True, text=True)
    if r.returncode:
        raise RuntimeError("git %s: %s" % (" ".join(a), r.stderr))
    return r.stdout.strip()


BARE = os.path.join(SCRATCH, "mirror.git")
WORK = os.path.join(SCRATCH, "work")
git("init", "--bare", "-q", BARE)
git("init", "-q", WORK)


def commit_files(files, msg):
    for path, text in files.items():
        full = os.path.join(WORK, *path.split("/"))
        os.makedirs(os.path.dirname(full), exist_ok=True)
        with open(full, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        git("add", path, cwd=WORK)
    git("-c", "user.name=t", "-c", "user.email=t@example.invalid", "commit", "-q", "-m", msg, cwd=WORK)
    git("push", "-q", BARE, "HEAD:" + al.OWNER_REF, cwd=WORK)
    return git("rev-parse", "HEAD", cwd=WORK)


SHA1 = commit_files(FILES, "one")
bal.OWNER_MIRROR = BARE
NOW = int(time.time())


def stamps(**vals):
    for name in al.OWNER_MIRROR_STAMPS:
        p = os.path.join(BARE, name)
        if os.path.exists(p):
            os.remove(p)
    for name, v in vals.items():
        with open(os.path.join(BARE, name), "w") as fh:
            fh.write(v)


def pin_raises(now):
    try:
        REAL_PIN(now)
    except RuntimeError:
        return True
    return False


stamps(DT_SYNC_PASS="%d 2026-11-20T00:00:00Z" % NOW + NL)
sha, age, which = REAL_PIN(NOW + 1790)
ok("pin: resolves the ref to its full 40-hex commit", sha == SHA1 and age == 1790 and which == "DT_SYNC_PASS")
ok("pin C-3: 1810 s past the newest stamp RAISES (limit 1800)", pin_raises(NOW + 1810))
ok("pin: a stamp in the future RAISES (clock skew)", pin_raises(NOW - 60))
for bad in ("0%d x" % NOW, "abc x", "", " " + NL, "%d.5 x" % NOW):
    stamps(DT_SYNC_PASS=bad)
    ok("pin: an unreadable stamp %r RAISES (no other stamp)" % bad[:12], pin_raises(NOW))
stamps(DT_SYNC_PASS="%d x" % (NOW - 5000), DT_REVIEW_FETCH_OK="%d x" % NOW)
ok("pin: the NEWEST of the two stamps wins", REAL_PIN(NOW + 10)[2] == "DT_REVIEW_FETCH_OK")
stamps(DT_SYNC_PASS="%d x" % (NOW - 5000), DT_REVIEW_FETCH_OK="0%d x" % NOW)
ok("pin: an unreadable newer stamp does not rescue a stale older one", pin_raises(NOW))
stamps(DT_SYNC_PASS="%d x" % (NOW - 5000))
open(os.path.join(BARE, "FETCH_HEAD"), "w").close()                        # fresh mtime, as a failed fetch leaves it
ok("pin: a fresh FETCH_HEAD does not rescue a stale stamp", pin_raises(NOW))
stamps()
ok("pin: no stamp at all RAISES", pin_raises(NOW))

stamps(DT_SYNC_PASS="%d x" % (NOW - 5000))
run(batch, FILES, real=True)
ok("bridge C-3: a stale mirror escalates the WHOLE batch through run_alert_batch, lane not invoked",
   sorted(m for m, _r in ESC) == [5001, 5002, 5003] and all("R2-4" in r and "stale" in r for _m, r in ESC)
   and INVOKES == [])
stamps(DT_SYNC_PASS="%d x" % int(time.time()))
ANSWER["v"] = NL.join(['[[ALERT id=%s owner=CC-A action="check the window"]]' % B1,
                       '[[ALERT id=%s owner=CC-C action="look"]]' % B2,
                       '[[ALERT id=%s owner=CC-C action="look"]]' % B3])
PREC.clear()
PREC[bal.alert_key(batch[2]["content"])] = [(TS(18), "CC-C")]
run(batch, FILES, real=True)
ok("bridge: a fresh real mirror routes the batch end to end (no escalation)", ESC == [] and len(POSTS) == 1
   and ('owner=CC-B action="check the window (owner table: batch:B-TBL)"') in POSTS[0])

pinned = REAL_PIN(int(time.time()))[0]
SHA2 = commit_files({al.OWNER_TABLE_PATH: json.dumps(dict(TABLE, fallback="CC-A"))}, "two")
ok("straddle C-1: a sync landing after the pin is NOT seen by a read at the pinned sha",
   json.loads(REAL_READ(al.OWNER_TABLE_PATH, pinned))["fallback"] == "CC-INFRA" and SHA2 != pinned)
ok("straddle C-1: the new commit is there at its own sha", json.loads(REAL_READ(al.OWNER_TABLE_PATH, SHA2))["fallback"] == "CC-A")
ok("read: a non-40-hex sha RAISES (never the moving ref)",
   raises(REAL_READ, al.OWNER_TABLE_PATH, al.OWNER_REF) and raises(REAL_READ, al.OWNER_TABLE_PATH, SHA1[:12]))
ok("read: a path missing at the pin RAISES", raises(REAL_READ, "no/such/file", SHA1))

DECOY = os.path.join(SCRATCH, "decoy.git")
git("init", "--bare", "-q", DECOY)
saved = {k: os.environ.get(k) for k in ("GIT_DIR", "GIT_OBJECT_DIRECTORY")}
os.environ["GIT_DIR"] = DECOY
os.environ["GIT_OBJECT_DIRECTORY"] = os.path.join(DECOY, "objects")
try:
    ok("C-5: an inherited GIT_DIR / GIT_OBJECT_DIRECTORY cannot point the pin elsewhere",
       REAL_PIN(int(time.time()))[0] == SHA2)
    ok("C-5: nor the read", json.loads(REAL_READ(al.OWNER_TABLE_PATH, SHA1))["fallback"] == "CC-INFRA")
finally:
    for k, v in saved.items():
        if v is None:
            os.environ.pop(k, None)
        else:
            os.environ[k] = v

print("alert_owner_route_test: %d passed, %d failed" % (P, F))
sys.exit(1 if F else 0)
