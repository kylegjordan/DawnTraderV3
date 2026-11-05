#!/usr/bin/env python3
"""B-WAKE-OPENING-LIST (#1241) P6: the REAL Langston-bridge gate, the REAL sender, and the degraded sender.
Run: python3 comms-infra/discord/test_address_gates.py   (any OS; stdlib + the repo; needs `git` for the r1 control)

It imports the real discord-langston-bridge.py with three stand-ins: a `discord` module (a Client that records its
event handlers), `fcntl` where the OS has none (langston_queue imports it), and the token/config readers. Then it
drives the bridge's own on_message - reassembly and address gate - with the chunks the real _send_chunks produced.
Expected outcomes are stated in each case name; a failure prints `FAIL: <name>` and the run exits 1.

  A. bridge gate: a CC post whose opening list names Langston is enqueued; a later-only mention is not; Kyle anywhere.
  B. bridge refuses to start (exit 2) on an absent, drifted, broken or probe-failing module; positive control.
  C. sender: a 3+ chunk post opening "Coltrane, and Langston" is split at whitespace, marked, and arrives at the
     bridge WHOLE (COMPLETE n/n), with --notify too, the mention after the list. CONTROL: the r1 sender (this file
     before the batch, read from git at R1_REF) fails both - that is what makes the two cases mean something.
  D. degraded sender: module absent / drifted / broken / probe-failing - it still posts, splits and marks, drops the
     mention, and logs ONE line naming the cause."""
import asyncio, hashlib, itertools, os, re, shutil, subprocess, sys, tempfile, types
from types import SimpleNamespace as NS

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
# The last commit before this batch: its discord_common.py is the r1 sender (Langston BLOCKER-1's subject).
R1_REF = "5e577e84192c7f1693b6c6393a595dc7ac9865dc"
R1_GIT = os.environ.get("ADDRESS_LIST_R1_GIT", ROOT)   # mutate_address_list.py runs a copy that is not a git repo
SCRATCH = tempfile.mkdtemp(prefix="addr-gates-")

P = F = 0


def ok(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name + (("   [" + str(detail)[:300] + "]") if detail else ""))


# ── stand-ins, installed BEFORE the bridge is imported ─────────────────────────────────────────────────────────
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
if "fcntl" not in sys.modules:
    try:
        import fcntl  # noqa: F401  (Linux: the real one)
    except ImportError:
        sys.modules["fcntl"] = types.ModuleType("fcntl")

sys.path.insert(0, HERE)
import discord_common as dc  # noqa: E402
import gateway_watchdog as gw  # noqa: E402

KYLE, CC_BOT, WEBHOOK, CHANNEL, COLTRANE_BOT = 42, 7, 55, 100, 8
CFG = {"channel_id": CHANNEL, "kyle_id": KYLE, "cc_bot_id": CC_BOT, "langston_bot_id": 9, "guild_id": None,
       "webhook_url": "https://discord.example/api/webhooks/%d/tok" % WEBHOOK, "webhook_id": WEBHOOK,
       "alerts_webhook_id": None, "avatars": {}}
dc.load_env_value = lambda path, key: "stand-in"
dc.load_shared_config = lambda: dict(CFG)
gw.install_watchdog = lambda *a, **k: None
dc.INTER_CHUNK_DELAY_S = 0

import importlib.util  # noqa: E402
_spec = importlib.util.spec_from_file_location("bridge_gate_test", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(b)
b.LOG_FILE = os.path.join(SCRATCH, "bridge.log")
open(b.LOG_FILE, "w").close()


class TaskQ(list):
    def put(self, t):
        self.append(t)


TASKS = TaskQ()
CLIENT = b.build_client(TASKS)
_ids = itertools.count(1000)


def post(content, author_id=CC_BOT, webhook_id=None, name="NEW Claude"):
    """Deliver one message to the real on_message; return the tasks it enqueued."""
    m = NS(id=next(_ids), author=NS(id=author_id, display_name=name, name=name), guild=object(),
           channel=NS(id=CHANNEL), webhook_id=webhook_id, content=content, created_at=None, attachments=[],
           flags=NS(value=0))
    before = len(TASKS)
    asyncio.run(CLIENT.on_message(m))
    return TASKS[before:]


# ── A. the bridge gate ─────────────────────────────────────────────────────────────────────────────────────────
print("A. Langston's bridge gate")
for content, author, wh, want, name in [
    ("Langston, and Coltrane — r2 is up", CC_BOT, None, 1, "KD-12 shape 'Langston, and Coltrane' still wakes Langston"),
    ("Coltrane, Langston — x", None, WEBHOOK, 1, "'Coltrane, Langston' now wakes Langston (it did not before)"),
    ("OLD Claude, Langston — x", None, WEBHOOK, 1, "a session name then Langston wakes him"),
    ("**Langston** — x", CC_BOT, None, 1, "markup before the name still wakes him"),
    ("Coltrane — and Langston may comment", None, WEBHOOK, 0, "a later-only mention does NOT wake him"),
    ("NEW Claude — see what Langston said", CC_BOT, None, 0, "a later-only mention from the CC bot does NOT wake him"),
    ("<@42> Langston — x", None, WEBHOOK, 0, "a mention placed first empties the list (the sender must not do it)"),
    ("can you look, Langston?", KYLE, None, 1, "Kyle naming him ANYWHERE still wakes him (unchanged)"),
    ("nothing for anyone", KYLE, None, 0, "Kyle naming nobody does not wake him (unchanged)"),
    ("Langston — from Coltrane", COLTRANE_BOT, None, 0, "Coltrane's own bot is still not an accepted author (A6, unchanged)"),
]:
    got = post(content, author_id=author if author is not None else 5000, webhook_id=wh)
    ok(name, len(got) == want and all(t["kind"] == "text" for t in got), "enqueued %d" % len(got))

# ── B. the bridge refuses to start ─────────────────────────────────────────────────────────────────────────────
print("B. Langston's bridge refuses to start without a usable address_list.py")
_RUNNER = ("import sys, types, runpy\n"
           "sys.modules['discord'] = types.ModuleType('discord')\n"
           "try:\n    import fcntl\nexcept ImportError:\n    sys.modules['fcntl'] = types.ModuleType('fcntl')\n"
           "runpy.run_path(sys.argv[1], run_name='refuse_probe')\n")
_BRIDGE_FILES = ["discord-langston-bridge.py", "discord_common.py", "gateway_watchdog.py", "langston_queue.py",
                 "alert_lane.py"]


def _pin(dc_path, sha):
    src = open(dc_path, "rb").read()
    new, n = re.subn(rb'^ADDRESS_LIST_SHA256 = "[0-9a-f]{64}"', b'ADDRESS_LIST_SHA256 = "' + sha.encode() + b'"',
                     src, flags=re.M)
    assert n == 1, "pin line not found in the copy"
    open(dc_path, "wb").write(new)


def module_variant(dest_dir, kind):
    """Plant one address_list.py variant beside a copied discord_common.py. Returns the cause word its log must name.
    'broken' and 'probe' are PINNED to their own sha in the copy - a committed-but-broken module - so they reach the
    load and the probe rather than stopping at the sha check."""
    dst = os.path.join(dest_dir, "address_list.py")
    good = open(os.path.join(HERE, "address_list.py"), "rb").read()
    if kind == "absent":
        return "FileNotFoundError"
    if kind == "drift":
        open(dst, "wb").write(good + b"# drifted\n")
        return "expected " + hashlib.sha256(good).hexdigest()
    if kind == "broken":
        data = b"import re\nraise re.error('planted at import')\n"
    else:  # probe: a parser that answers in another key convention
        data = good.replace(b"names.append(best[0])", b"names.append(best[0].lower())")
        assert data != good
    open(dst, "wb").write(data)
    _pin(os.path.join(dest_dir, "discord_common.py"), hashlib.sha256(data).hexdigest())
    return "planted at import" if kind == "broken" else "probe"


for kind in ("intact", "absent", "drift", "broken", "probe"):
    d = tempfile.mkdtemp(prefix="refuse-%s-" % kind, dir=SCRATCH)
    for fn in _BRIDGE_FILES:
        shutil.copy(os.path.join(HERE, fn), d)
    if kind == "intact":
        shutil.copy(os.path.join(HERE, "address_list.py"), d)
        word = None
    else:
        word = module_variant(d, kind)
    r = subprocess.run([sys.executable, "-c", _RUNNER, os.path.join(d, "discord-langston-bridge.py")],
                       capture_output=True, text=True, encoding="utf-8", errors="replace", timeout=120)
    if kind == "intact":
        # POSITIVE CONTROL: the same harness with the real module passes the check (it then dies reading tokens on a
        # box without them, or imports cleanly on one with them) - so a refusal below is caused by the module.
        ok("control: an intact module passes the refusal check", "REFUSING" not in r.stderr, r.stderr[-300:])
    else:
        ok("bridge refuses to start (exit 2) on a %s module, naming the cause" % kind,
           r.returncode == 2 and "REFUSING TO START" in r.stderr and word in r.stderr,
           "rc=%d stderr=%s" % (r.returncode, r.stderr[-300:]))

# ── C. the sender, end to end through the bridge's reassembly ─────────────────────────────────────────────────
print("C. the sender: split, marked, mention after the list, reassembled whole")
MARK = re.compile("⟨grp=([0-9a-f]{8}) (\\d+)/(\\d+)⟩")
LONG = ("Coltrane, and Langston — the r2 is up for both of you. "
        + " ".join("see server/services/file_%d.ts:%d and sha %040x" % (i, i * 7, i) for i in range(150)))


def capture(module, content, mention=None):
    sent = []

    def fake_post(url, headers, payload, log_file):
        sent.append(payload["content"])
        return True, {"id": str(len(sent))}

    module._post_json = fake_post
    module.INTER_CHUNK_DELAY_S = 0
    module.webhook_send(CFG["webhook_url"], "NEW Claude", content, os.path.join(SCRATCH, "sender.log"),
                        mention_user_id=mention)
    return sent


def deliver(chunks):
    """Each chunk to the real bridge as a CC-webhook post; returns (tasks, bridge log text for this delivery)."""
    start = os.path.getsize(b.LOG_FILE)
    got = []
    for c in chunks:
        got += post(c, author_id=5000, webhook_id=WEBHOOK)
    with open(b.LOG_FILE, encoding="utf-8", errors="replace") as fh:
        fh.seek(start)
        return got, fh.read()


def whole(tasks, original):
    """One task whose words are exactly the post's words (seam whitespace may normalise; nothing may be missing)."""
    if len(tasks) != 1:
        return False
    words = [w for w in tasks[0]["content"].split() if not w.startswith("<@")]
    return words == original.split()


for mention in (None, KYLE):
    tag = "with --notify" if mention else "without --notify"
    sent = capture(dc, LONG, mention)
    marks = [MARK.search(c) for c in sent]
    ok("sender %s: 3+ chunks, every one marked, one group, n/n" % tag,
       len(sent) >= 3 and all(marks) and len({m.group(1) for m in marks}) == 1
       and [int(m.group(2)) for m in marks] == list(range(1, len(sent) + 1)), "chunks=%d" % len(sent))
    ok("sender %s: no chunk exceeds 2000 characters" % tag, all(len(c) <= 2000 for c in sent))
    if mention:
        ok("sender with --notify: the mention sits AFTER the opening list",
           sent[0].startswith("Coltrane, and Langston <@%d> —" % KYLE) and sum(c.count("<@") for c in sent) == 1,
           sent[0][:60])
    tasks, blog = deliver(sent)
    ok("bridge %s: reassembled COMPLETE n/n into ONE invoke holding the whole post" % tag,
       ("COMPLETE %d/%d" % (len(sent), len(sent))) in blog and whole(tasks, LONG), "tasks=%d" % len(tasks))

# CONTROL: the r1 sender (unchanged discord_common, the plan before BLOCKER-1) against the new bridge gate.
_r1 = subprocess.run(["git", "-C", R1_GIT, "show", "%s:comms-infra/discord/discord_common.py" % R1_REF],
                     capture_output=True)
ok("control harness: the r1 sender was read from git at R1_REF", _r1.returncode == 0,
   _r1.stderr.decode("utf-8", "replace")[-200:])
if _r1.returncode == 0:
    _r1_path = os.path.join(SCRATCH, "discord_common_r1.py")
    open(_r1_path, "wb").write(_r1.stdout)
    _s = importlib.util.spec_from_file_location("discord_common_r1", _r1_path)
    dc_r1 = importlib.util.module_from_spec(_s)
    _s.loader.exec_module(dc_r1)
    ok("control harness: the r1 sender is the pre-batch one (it has ADDRESS_START_RE)", hasattr(dc_r1, "ADDRESS_START_RE"))
    t1, _ = deliver(capture(dc_r1, LONG))
    ok("CONTROL r1 without --notify: Langston gets a TRUNCATED post (first chunk only), not the whole",
       len(t1) == 1 and not whole(t1, LONG), "tasks=%d" % len(t1))
    t2, _ = deliver(capture(dc_r1, LONG, KYLE))
    ok("CONTROL r1 with --notify: the prepended mention drops the WHOLE post", len(t2) == 0, "tasks=%d" % len(t2))

# Single-chunk mention placement: after the list when there is one, at the start when there is none.
for content, want, name in [
    ("OLD Claude, Infra Claude — probe", "OLD Claude, Infra Claude <@42> — probe", "a session list keeps its wake"),
    ("Langston — short", "Langston <@42> — short", "Langston-first is unchanged"),
    ("Kyle — the batch closed", "Kyle <@42> — the batch closed", "Kyle opens the list: the mention follows him"),
    ("x — the batch closed", "<@42> x — the batch closed", "no list: the mention leads, as before"),
]:
    got = capture(dc, content, KYLE)
    ok("--notify placement: " + name, got == [want], got)

# ── C2. the INCOMPLETE flush (Langston C-3) ───────────────────────────────────────────────────────────────────
print("C2. a timed-out group is invoked only if its part 1 addresses Langston")


def flush_case(parts, total):
    """Post the given parts of one marked group, then force the timeout sweep with an unaddressed tick."""
    grp = "%08x" % next(_ids)
    got = []
    for k, text in parts:
        got += post(text + "\n⟨grp=%s %d/%d⟩" % (grp, k, total), author_id=5000, webhook_id=WEBHOOK)
    saved = b.GROUP_TIMEOUT_S
    b.GROUP_TIMEOUT_S = -1
    try:
        got += post("NEW Claude — tick", author_id=5000, webhook_id=WEBHOOK)
    finally:
        b.GROUP_TIMEOUT_S = saved
    return got


got = flush_case([(1, "NEW Claude — a long CC-to-CC note, part one"), (3, "part three")], 3)
ok("C-3: a timed-out group whose part 1 does NOT address Langston is dropped, no invoke", got == [], got)
got = flush_case([(1, "Langston — a long dispatch, part one"), (3, "part three")], 3)
ok("POSITIVE CONTROL: a timed-out group whose part 1 addresses Langston is still invoked, marked INCOMPLETE",
   len(got) == 1 and "INCOMPLETE CHUNK GROUP" in got[0]["content"], got)
got = flush_case([(2, "part two"), (3, "part three")], 3)
ok("C-3: with part 1 missing nothing can decide, so the partial still goes, marked INCOMPLETE (fail loud)",
   len(got) == 1 and "INCOMPLETE CHUNK GROUP" in got[0]["content"], got)

# ── D. the degraded sender ─────────────────────────────────────────────────────────────────────────────────────
print("D. the degraded sender (post anyway, as addressed, a notice + the mention at the END, one log line)")
FILLER = "Kyle — a long notice. " + " ".join("line %d of a long body with path/to/x_%d.py:%d" % (i, i, i) for i in range(200))
for kind in ("absent", "drift", "broken", "probe"):
    d = tempfile.mkdtemp(prefix="degrade-%s-" % kind, dir=SCRATCH)
    shutil.copy(os.path.join(HERE, "discord_common.py"), d)
    word = module_variant(d, kind)
    _s = importlib.util.spec_from_file_location("dc_degraded_" + kind, os.path.join(d, "discord_common.py"))
    m = importlib.util.module_from_spec(_s)
    try:
        _s.loader.exec_module(m)
        imported = True
    except Exception as e:
        imported = False
        print("    import raised %s: %s" % (type(e).__name__, e))
    ok("degraded (%s): importing discord_common does not raise" % kind, imported)
    if not imported:
        continue
    ok("degraded (%s): the module is marked unusable, with its cause" % kind,
       m.ADDRESS_LIST is None and word in (m.ADDRESS_LIST_ERROR or ""), m.ADDRESS_LIST_ERROR)
    logf = os.path.join(d, "send.log")
    sent = []
    m._post_json = lambda url, headers, payload, log_file: (sent.append(payload["content"]), (True, {"id": "1"}))[1]
    m.INTER_CHUNK_DELAY_S = 0
    m.webhook_send(CFG["webhook_url"], "NEW Claude", FILLER, logf, mention_user_id=KYLE)
    marks = [MARK.search(c) for c in sent]
    ok("degraded (%s): a long post is still posted, split and marked" % kind,
       len(sent) >= 2 and all(marks) and all(len(c) <= 2000 for c in sent), "chunks=%d" % len(sent))
    ok("degraded (%s): the notice and the mention are in the LAST chunk only, once each" % kind,
       sum(c.count("<@%d>" % KYLE) for c in sent) == 1 and "<@%d>" % KYLE in sent[-1]
       and sum(c.count(m.DEGRADED_NOTICE) for c in sent) == 1 and m.DEGRADED_NOTICE in sent[-1], sent[-1][-300:])
    ok("degraded (%s): the opening list is untouched (chunk 0 still opens 'Kyle —')" % kind,
       sent[0].startswith("Kyle — a long notice."), sent[0][:40])
    lines = [ln for ln in open(logf, encoding="utf-8", errors="replace").read().splitlines() if "DEGRADED" in ln]
    ok("degraded (%s): exactly one log line, naming the cause" % kind, len(lines) == 1 and word in lines[0], lines)
    sent.clear()
    m.webhook_send(CFG["webhook_url"], "NEW Claude", "Kyle — short", logf, mention_user_id=KYLE)
    ok("degraded (%s): ★ a SHORT post carries the notice and the phone push (Langston C-2)" % kind,
       sent == ["Kyle — short\n\n" + m.DEGRADED_NOTICE + " <@%d>" % KYLE], sent)
    sent.clear()
    m.webhook_send(CFG["webhook_url"], "NEW Claude", LONG, logf)
    t3, _ = deliver(sent)
    ok("degraded (%s): a long Langston dispatch still reaches him as ONE invoke, notice at the end" % kind,
       len(t3) == 1 and t3[0]["content"].startswith("Coltrane, and Langston")
       and t3[0]["content"].rstrip().endswith(m.DEGRADED_NOTICE), [t["content"][-120:] for t in t3])

# ── E. the install path (Langston C-1) ────────────────────────────────────────────────────────────────────────
print("E. deploy.sh installs the module the bridges refuse to start without")
_dep = open(os.path.join(HERE, "deploy.sh"), encoding="utf-8").read()
ok("POSITIVE CONTROL: the manifest row for discord_common.py is found", "bridges|comms-infra/discord/discord_common.py|" in _dep)
ok("★ the bridges group installs address_list.py beside discord_common.py",
   "bridges|comms-infra/discord/address_list.py|$BRIDGE_DIR/address_list.py|" in _dep)

print("%d passed, %d failed" % (P, F))
shutil.rmtree(SCRATCH, ignore_errors=True)
sys.exit(1 if F else 0)
