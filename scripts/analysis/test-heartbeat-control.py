# -*- coding: utf-8 -*-
"""Tests for the heartbeat's daily-control decision (B-WAKE-HEARTBEAT-CONTROL-DATE, #1162, row 1q).

Runs the REPO copy of control_state.py in-process against temp directories and a local copy of a wake
log; it never reads or writes the live state folder or the live log. P9 alone reaches a real host: it
points the remote read at a port that refuses, to exercise the failure branch against a real failure.
P4 reads _HEARTBEAT_OK / _HEARTBEAT_BAD / is_allclear_heartbeat out of the REPO cc-wake-filter.py by
parsing it (the filter has no import guard), so the wake-route test can never drift from the filter.
ABORTS LOUDLY if no case ran - a suite that processes nothing must never print PASS.
"""
import ast, contextlib, importlib.util, io, itertools, json, os, re, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
CS_PATH = os.path.join(ROOT, "comms-infra", "laptop", "scheduled-tasks", "wake-watcher-heartbeat", "control_state.py")
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
ALIASES = ("CC-A", "CC-B", "CC-C", "CC-INFRA")

spec = importlib.util.spec_from_file_location("control_state", CS_PATH)
cs = importlib.util.module_from_spec(spec); spec.loader.exec_module(cs)

PASS, FAIL = [], []
ALL_LINES = []          # every (control line, NOTIFY yes?) the suite produced - P4 checks them ALL (gate-B condition 1)
def case(name, ok, detail=""):
    (PASS if ok else FAIL).append(name)
    print(("PASS " if ok else "FAIL ") + name + ("" if ok else f"\n     {detail}"))


class Fx:
    """A fixture: a temp state folder and a temp wake log."""
    def __init__(self):
        self.d = tempfile.mkdtemp(prefix="hbctl-")
        self.state = os.path.join(self.d, "state"); os.makedirs(self.state)
        self.log = os.path.join(self.d, "cc-wake.log")
        open(self.log, "wb").close()

    def ino(self):
        return os.stat(self.log).st_ino

    def size(self):
        return os.path.getsize(self.log)

    def add(self, line):
        off = self.size()
        with open(self.log, "ab") as f:
            f.write((line + "\n").encode())
        return off

    def control(self, alias, token):
        return self.add(f"WATCHER-CONTROL {alias} {token}")

    def answer(self, alias, token):
        with open(os.path.join(self.state, alias + ".json.control"), "w") as f:
            f.write(f"{token} 2026-10-16T07:14:28Z")

    def pos(self, alias, off, ino=None):
        with open(os.path.join(self.state, alias + ".json"), "w") as f:
            json.dump({"pos": {self.log: [self.ino() if ino is None else ino, off]}, "alias": alias}, f)

    def nopos(self, alias):
        with open(os.path.join(self.state, alias + ".json"), "w") as f:
            json.dump({"pos": {}, "alias": alias}, f)

    def lease(self, alias, taken_at):
        with open(os.path.join(self.state, alias + ".lease"), "w") as f:
            json.dump({"loop": 1, "loop_created": 1, "taken_at": taken_at}, f)

    def record(self, rec):
        with open(os.path.join(self.state, "heartbeat-control.json"), "w") as f:
            json.dump(rec, f)

    def ok_record(self):
        self.record({"log_ino": self.ino(), "issuer_fail": 0, "aliases": {}})

    def lines(self):
        return open(self.log, encoding="utf-8").read().splitlines()

    def run(self, liveness=None, today="20261016", now="2026-10-16T12:00:00Z", extra=()):
        lv = liveness or {x: "alive" for x in ALIASES}
        argv = ["--state-dir", self.state, "--log", self.log, "--log-key", self.log, "--today", today,
                "--now", now, "--emit-states", "--liveness"] + [f"{k}={v}" for k, v in lv.items()] + list(extra)
        out, err = io.StringIO(), io.StringIO()
        with contextlib.redirect_stdout(out), contextlib.redirect_stderr(err):
            rc = cs.main(argv)
        o = out.getvalue().splitlines()
        assert len(o) == 2, f"control_state printed {len(o)} lines, not 2: {o}"   # the pool may never shrink silently
        ALL_LINES.append((o[0], o[1] == "NOTIFY yes"))
        per = None
        for l in err.getvalue().splitlines():
            try:
                per = json.loads(l)
            except Exception:
                pass
        return rc, o, per


def all_ready(fx, token="20261016", answered=True):
    """Every alias has today's control, at its offset, read past (or not), with a lease."""
    offs = {x: fx.control(x, token) for x in ALIASES}
    for x in ALIASES:
        if answered:
            fx.answer(x, token)
        fx.pos(x, fx.size())
        fx.lease(x, "2026-10-16T08:00:00Z")
    return offs


# ── OBJ-1 the discriminating fixture: the issuer's UTC day is yesterday by the laptop's local clock ─────────
fx = Fx(); fx.ok_record()
all_ready(fx, token="20261015")
rc, o, per = fx.run(today="20261015", now="2026-10-15T22:30:00Z")
case("OBJ-1 yesterday-local token, answered -> answered (the old local-date test read NOT answered)",
     o[1] == "NOTIFY no" and o[0].count("answered") == 4 and "NOT answered" not in o[0] and len(fx.lines()) == 4, o)

# ── issue rule: N != D and all four alive -> issue per alias; the fresh line reads awaiting ──────────────
fx = Fx(); fx.ok_record()
all_ready(fx, token="20261015")
rc, o, per = fx.run()
new = [l for l in fx.lines() if l.endswith("20261016")]
case("issue: every alias whose N != D gets today's line, and reads awaiting", len(new) == 4 and "issued CC-A/CC-B/CC-C/CC-INFRA" in o[0]
     and o[0].count("awaiting") == 4 and o[1] == "NOTIFY no", o)

# per-alias issue: a half-written day self-corrects without duplicating the others (Step-2 BLOCKER-3)
fx = Fx(); fx.ok_record()
for x in ALIASES:
    fx.control(x, "20261015")
fx.control("CC-A", "20261016"); fx.control("CC-B", "20261016")
for x in ALIASES:
    fx.pos(x, fx.size()); fx.lease(x, "2026-10-16T08:00:00Z")
fx.answer("CC-A", "20261016"); fx.answer("CC-B", "20261016")
rc, o, per = fx.run()
today_lines = [l for l in fx.lines() if l.endswith("20261016")]
case("per-alias issue: only CC-C and CC-INFRA are written", len(today_lines) == 4 and "issued CC-C/CC-INFRA" in o[0], o)

# GATED: one .alive missing -> no issue, reported, not paged
fx = Fx(); fx.ok_record()
all_ready(fx, token="20261015")
before = len(fx.lines())
rc, o, per = fx.run(liveness={"CC-A": "alive", "CC-B": "not armed", "CC-C": "alive", "CC-INFRA": "alive"})
case("ISSUER GATED BY CC-B: nothing written, reported, NOTIFY no", len(fx.lines()) == before and "ISSUER GATED BY CC-B" in o[0]
     and o[1] == "NOTIFY no", o)

# ── 4 / 4b: awaiting, then NOT delivering when the position is frozen for two runs ──────────────────────
fx = Fx(); fx.ok_record()
for x in ALIASES:
    fx.control(x, "20261016")
for x in ALIASES:
    fx.answer(x, "20261016"); fx.pos(x, fx.size()); fx.lease(x, "2026-10-16T08:00:00Z")
fx.answer("CC-C", "20261015"); fx.pos("CC-C", 0)                 # CC-C is short of its line
rc1, o1, _ = fx.run()
rc2, o2, _ = fx.run(now="2026-10-16T13:00:00Z")
case("4: short of the line, first run -> awaiting, no page", "CC-C awaiting" in o1[0] and o1[1] == "NOTIFY no", o1)
case("4b: position frozen across two runs -> NOT delivering, paged, verdict NOT answered",
     o2[0].startswith("control: NOT answered") and "CC-C NOT delivering" in o2[0] and o2[1] == "NOTIFY yes", o2)

# ── 5 / 6: skipped by a start from the end -> one re-issue; then the discriminator ──────────────────────
def skipped():
    fx = Fx(); fx.ok_record()
    for x in ALIASES:
        fx.control(x, "20261016")
    for x in ALIASES:
        fx.answer(x, "20261016"); fx.pos(x, fx.size()); fx.lease(x, "2026-10-16T08:00:00Z")
    fx.answer("CC-A", "20261013")                                 # CC-A read past it without answering (or skipped it)
    fx.lease("CC-A", "2026-10-16T09:00:00Z")                      # armed AFTER the line, from the end
    return fx

fx = skipped()
rc, o, _ = fx.run()
case("6: P > O, A != N, no re-issue yet -> re-issued, one line, no page",
     "CC-A re-issued" in o[0] and o[1] == "NOTIFY no" and fx.lines()[-1] == "WATCHER-CONTROL CC-A 20261016", o)
fx.pos("CC-A", fx.size())                                         # the SAME arm consumed the re-issue and still did not answer
rc, o, _ = fx.run(now="2026-10-16T13:00:00Z")
case("5: the re-issue landed while this arm was live and went unanswered -> NOT answered, paged",
     o[0].startswith("control: NOT answered") and "CC-A NOT answered" in o[0] and o[1] == "NOTIFY yes", o)

fx = skipped()
fx.run()
fx.lease("CC-A", "2026-10-16T12:30:00Z"); fx.pos("CC-A", fx.size())   # a NEW arm after the re-issue, from the end again
rc, o, _ = fx.run(now="2026-10-16T13:00:00Z")
case("BLOCKER-3: a new arm after the re-issue is re-issued again, not paged", "CC-A re-issued" in o[0] and o[1] == "NOTIFY no", o)
fx.lease("CC-A", "2026-10-16T13:30:00Z"); fx.pos("CC-A", fx.size())
rc, o, _ = fx.run(now="2026-10-16T14:00:00Z")
case("R1: the third distinct arm against one token -> NOT answered, paged", "CC-A NOT answered" in o[0] and o[1] == "NOTIFY yes", o)

# ── 1 / 1a / 1b / 2 ──────────────────────────────────────────────────────────────────────────────────────
fx = skipped(); before = len(fx.lines())
rc, o, _ = fx.run(liveness={"CC-A": "DEAD", "CC-B": "alive", "CC-C": "alive", "CC-INFRA": "alive"})
case("1: DEAD -> DEAD, never re-issued, never a control page", "CC-A DEAD" in o[0] and len(fx.lines()) == before and o[1] == "NOTIFY no", o)
fx = skipped()
rc, o, _ = fx.run(liveness={"CC-A": "STUCK", "CC-B": "alive", "CC-C": "alive", "CC-INFRA": "alive"})
case("1a: STUCK short of its answer -> STUCK (control pending), no page", "CC-A STUCK (control pending)" in o[0] and o[1] == "NOTIFY no", o)
fx = skipped(); fx.answer("CC-A", "20261016")
rc, o, _ = fx.run(liveness={"CC-A": "STUCK", "CC-B": "alive", "CC-C": "alive", "CC-INFRA": "alive"})
case("1a: STUCK that answered -> answered (the .control write is independent of the position save)", "CC-A answered" in o[0], o)
fx = skipped()
rc, o, _ = fx.run(liveness={"CC-A": "CENSUS-FAILED", "CC-B": "alive", "CC-C": "alive", "CC-INFRA": "alive"})
case("1b: CENSUS-FAILED -> not judged, no page", "CC-A CENSUS-FAILED (control not judged)" in o[0] and o[1] == "NOTIFY no", o)

# ── the record: new / RESET / NOT PERSISTING all page; held states draw no decision ────────────────────
fx = Fx(); all_ready(fx)
rc, o, _ = fx.run()
case("record absent -> CHECK FAILED — control record new, paged (Step-1 condition 1)",
     o[0].startswith("control: CHECK FAILED") and "control record new" in o[0] and o[1] == "NOTIFY yes", o)
rc, o, _ = fx.run(now="2026-10-16T13:00:00Z")
case("the next run reads the record it wrote: no page", o[1] == "NOTIFY no", o)

fx = Fx(); all_ready(fx)
with open(os.path.join(fx.state, "heartbeat-control.json"), "w") as f:
    f.write("{not json")
rc, o, _ = fx.run()
moved = [n for n in os.listdir(fx.state) if n.startswith("heartbeat-control.json.bad-")]
case("record unparseable -> RESET, moved aside, paged", "control record RESET" in o[0] and moved and o[1] == "NOTIFY yes", (o, moved))

fx = skipped(); fx.record({"aliases": {}})                         # parseable, but this is a fresh record each run? no: ok
os.remove(os.path.join(fx.state, "heartbeat-control.json"))       # absent -> new -> held
before = len(fx.lines())
rc, o, _ = fx.run()
case("held: on a new record, no re-issue is drawn (P > O prints held)", "CC-A held (record reset)" in o[0] and len(fx.lines()) == before, o)

fx = Fx(); fx.ok_record(); all_ready(fx)
real = cs.write_and_read_back
cs.write_and_read_back = lambda p, r: False
try:
    rc, o, _ = fx.run()
finally:
    cs.write_and_read_back = real
case("NOT PERSISTING: a write that does not read back pages", "control record NOT PERSISTING" in o[0] and o[1] == "NOTIFY yes", o)

# read-back really reads: write junk behind the writer's back and the comparison must fail
fx = Fx(); p = os.path.join(fx.state, "heartbeat-control.json")
real_dump = json.dump
def bad_dump(obj, f, **kw):
    real_dump({"aliases": {"tampered": True}}, f, **kw)
cs.json.dump = bad_dump
try:
    ok = cs.write_and_read_back(p, {"aliases": {}})
finally:
    cs.json.dump = real_dump
case("read-back compares content: a tampered write returns False", ok is False, ok)

# ── ISSUER NOT RUN: the write fails; first run reported, second paged ──────────────────────────────────
fx = Fx(); fx.ok_record(); all_ready(fx, token="20261015")
real_append = cs.Remote.append
def failing_append(self, alias, token):
    raise cs.RemoteFailed("ssh exit 1")
cs.Remote.append = failing_append
try:
    _, o1, _ = fx.run()
    _, o2, _ = fx.run(now="2026-10-16T13:00:00Z")
finally:
    cs.Remote.append = real_append
case("ISSUER NOT RUN: first run reported, not paged", "ISSUER NOT RUN" in o1[0] and o1[1] == "NOTIFY no", o1)
case("ISSUER NOT RUN: second consecutive run paged", o2[0].startswith("control: CHECK FAILED") and "ISSUER NOT RUN" in o2[0]
     and o2[1] == "NOTIFY yes", o2)

# ── rotation: the log's own inode changed since the last run -> re-issue, never page on old offsets ────
fx = skipped()
fx.run()                                                          # CC-A re-issued once, record holds it
rec = json.load(open(os.path.join(fx.state, "heartbeat-control.json")))
rec["log_ino"] = rec["log_ino"] + 99999                           # the recorded inode is no longer the log's
fx.record(rec)
for x in ALIASES:
    fx.pos(x, 5, ino=rec["log_ino"])                              # positions saved against the old file
for x in ALIASES:
    fx.answer(x, "20261013")
rc, o, _ = fx.run(now="2026-10-16T13:00:00Z")
case("rotation: log rotated, re-issued to all, no page", "log rotated" in o[0] and o[0].count("re-issued (log rotated)") == 4
     and o[1] == "NOTIFY no", o)

# ── 7 UNDETERMINED: P absent, or a foreign inode outside a rotation -> paged with the raw inputs ───────
fx = Fx(); fx.ok_record(); all_ready(fx); fx.answer("CC-B", "20261013"); fx.nopos("CC-B")
rc, o, _ = fx.run()
case("7: P absent -> UNDETERMINED, paged, raw inputs printed", "UNDETERMINED CC-B" in o[0] and "P=None" in o[0] and o[1] == "NOTIFY yes", o)
fx = Fx(); fx.ok_record(); all_ready(fx); fx.answer("CC-B", "20261013"); fx.pos("CC-B", 3, ino=fx.ino() + 7)
rc, o, _ = fx.run()
case("7: a foreign inode, no recorded rotation -> UNDETERMINED, paged", "UNDETERMINED CC-B" in o[0] and o[1] == "NOTIFY yes", o)

# ── P8 the run lock ─────────────────────────────────────────────────────────────────────────────────────
fx = Fx(); fx.ok_record(); all_ready(fx)
lock = os.path.join(fx.state, "heartbeat-control.lock")
with open(lock, "w") as f:
    f.write("2026-10-16T11:50:00Z")
before = (len(fx.lines()), open(os.path.join(fx.state, "heartbeat-control.json")).read())
rc, o, _ = fx.run()
after = (len(fx.lines()), open(os.path.join(fx.state, "heartbeat-control.json")).read())
case("P8: a held lock -> held, NOTIFY no, nothing touched", o == ["control: held — another heartbeat run is in progress", "NOTIFY no"]
     and before == after and os.path.exists(lock), o)
with open(lock, "w") as f:
    f.write("2026-10-16T11:29:00Z")                               # 31 min old at 12:00
rc, o, _ = fx.run()
case("P8: a 31-min-old lock is taken over and reported, then released", "stale heartbeat lock taken over" in o[0]
     and not os.path.exists(lock) and any(n.startswith("heartbeat-control.lock.stale.") for n in os.listdir(fx.state)), o)
fx2 = Fx(); fx2.ok_record(); all_ready(fx2)
real_decide = cs.decide
cs.decide = lambda a, now: (_ for _ in ()).throw(RuntimeError("boom"))
try:
    rc, o, _ = fx2.run()
finally:
    cs.decide = real_decide
case("P8: an exception still releases the lock and pages", not os.path.exists(os.path.join(fx2.state, "heartbeat-control.lock"))
     and o[0].startswith("control: CHECK FAILED") and o[1] == "NOTIFY yes", o)

# ── gate B condition 1: a rotated run with the position already on the NEW inode never pages on old re-issues ──
fx = skipped()
fx.run()                                                          # CC-A re-issued; the record holds an entry with at > T
rec = json.load(open(os.path.join(fx.state, "heartbeat-control.json")))
rec["log_ino"] = rec["log_ino"] + 99999                           # the log rotated since the last run...
fx.record(rec)
fx.pos("CC-A", fx.size())                                         # ...and CC-A's position is already on the new inode, past O
rc, o, _ = fx.run(now="2026-10-16T13:00:00Z")
case("gate B C1: rotated AND pino == ino AND P > O -> re-issued, never paged on void evidence",
     "CC-A re-issued" in o[0] and "CC-A NOT answered" not in o[0] and o[1] == "NOTIFY no", o)

# gate B r2 blocker: the clear must PERSIST even when the re-issue append fails on the rotated run
fx = skipped()
fx.run()                                                          # run 1: CC-A re-issued; the record holds at > T
rec = json.load(open(os.path.join(fx.state, "heartbeat-control.json")))
rec["log_ino"] = rec["log_ino"] + 99999
fx.record(rec)
fx.pos("CC-A", fx.size())
real_append = cs.Remote.append
def fail_append3(self, alias, token):
    raise cs.RemoteFailed("ssh exit 255")
cs.Remote.append = fail_append3
try:
    rc, o2, _ = fx.run(now="2026-10-16T13:00:00Z")                # run 2: rotated, append fails
finally:
    cs.Remote.append = real_append
rec2 = json.load(open(os.path.join(fx.state, "heartbeat-control.json")))
case("gate B r2: rotated + failed re-issue -> paged as re-issue failed, AND the void history is cleared in the record",
     "re-issue failed CC-A" in o2[0] and o2[1] == "NOTIFY yes" and rec2["aliases"]["CC-A"]["reissues"] == [], (o2, rec2["aliases"]["CC-A"]))
rc, o3, _ = fx.run(now="2026-10-16T14:00:00Z")                    # run 3: no rotation now; must NOT page on the void stamp
case("gate B r2: the run after never pages on the voided stamp (re-issued instead)",
     "CC-A NOT answered" not in o3[0] and "CC-A re-issued" in o3[0], o3)

# ── gate B condition 2: the prologue fails loud, never silent ────────────────────────────────────────────
def run_raw(argv):
    out = io.StringIO()
    with contextlib.redirect_stdout(out), contextlib.redirect_stderr(io.StringIO()):
        rc = cs.main(argv)
    o = out.getvalue().splitlines()
    assert len(o) == 2, f"control_state printed {len(o)} lines, not 2: {o}"
    ALL_LINES.append((o[0], o[1] == "NOTIFY yes"))
    return rc, o
fx = Fx(); fx.ok_record(); all_ready(fx)
for label, argv in [
    ("malformed --liveness", ["--state-dir", fx.state, "--log", fx.log, "--liveness", "CC-A-alive"]),
    ("unparseable --now", ["--state-dir", fx.state, "--log", fx.log, "--now", "yesterday", "--liveness", "CC-A=alive"]),
    ("missing state folder", ["--state-dir", os.path.join(fx.d, "nope"), "--log", fx.log, "--liveness", "CC-A=alive"]),
    ("missing --liveness", ["--state-dir", fx.state, "--log", fx.log]),
]:
    rc, o = run_raw(argv)
    case(f"gate B C2: {label} -> control: CHECK FAILED, NOTIFY yes, exit 0",
         rc == 0 and len(o) == 2 and o[0].startswith("control: CHECK FAILED — UNDETERMINED (script start failed") and o[1] == "NOTIFY yes", o)

# ── a token read back out of the log is validated before it goes into a shell command ───────────────────
fx = Fx(); fx.ok_record()
for x in ALIASES:
    fx.control(x, "20261016")
fx.control("CC-A", "2026'1016")
for x in ALIASES:
    fx.answer(x, "20261016"); fx.pos(x, fx.size()); fx.lease(x, "2026-10-16T09:00:00Z")
before = len(fx.lines())
# Reachable only while the issue is GATED (otherwise N is re-written as the issuer's safe date D first): CC-B not armed.
rc, o, _ = fx.run(liveness={"CC-A": "alive", "CC-B": "not armed", "CC-C": "alive", "CC-INFRA": "alive"})
case("token validation: a quote in N is never echoed back -> UNDETERMINED, paged, nothing appended",
     "unsafe token" in o[0] and len(fx.lines()) == before and o[1] == "NOTIFY yes", o)

# ── re-issue failed: the append of a re-issue fails -> CHECK FAILED, paged (Langston gate A r2, condition A3) ─
fx = skipped()
real_append = cs.Remote.append
def failing_append2(self, alias, token):
    raise cs.RemoteFailed("ssh exit 1")
cs.Remote.append = failing_append2
try:
    rc, o, _ = fx.run()
finally:
    cs.Remote.append = real_append
case("re-issue failed: a failed re-issue append -> CHECK FAILED — re-issue failed CC-A, paged",
     o[0].startswith("control: CHECK FAILED") and "re-issue failed CC-A" in o[0] and o[1] == "NOTIFY yes", o)

# ── TOTALITY: every 2b state x position case x record state prints exactly one state per alias ─────────
LV = ["alive", "DEAD", "STUCK", "CENSUS-FAILED", "not armed"]
POS = ["answered", "P<=O moved", "P<=O unchanged", "P>O", "P absent", "foreign inode"]
REC = ["ok", "new", "reset"]
bad = []
n = 0
for lv, pc, rs in itertools.product(LV, POS, REC):
    fx = Fx()
    offs = {x: fx.control(x, "20261016") for x in ALIASES}
    for x in ALIASES:
        fx.answer(x, "20261016"); fx.pos(x, fx.size()); fx.lease(x, "2026-10-16T08:00:00Z")
    x = "CC-C"
    fx.lease(x, "2026-10-16T09:00:00Z")
    if pc != "answered":
        fx.answer(x, "20261013")
    if pc == "P<=O moved":
        fx.pos(x, 0)
    elif pc == "P<=O unchanged":
        fx.pos(x, 0)
    elif pc == "P absent":
        fx.nopos(x)
    elif pc == "foreign inode":
        fx.pos(x, 3, ino=fx.ino() + 7)
    if rs == "ok":
        prevP = [fx.ino(), 0] if pc == "P<=O unchanged" else [fx.ino(), 1]
        fx.record({"log_ino": fx.ino(), "issuer_fail": 0, "aliases": {x: {"token": "20261016", "prev_P": prevP, "reissues": []}}})
    elif rs == "reset":
        with open(os.path.join(fx.state, "heartbeat-control.json"), "w") as f:
            f.write("garbage")
    rc, o, per = fx.run(liveness={**{y: "alive" for y in ALIASES}, x: lv})
    n += 1
    good = (rc == 0 and len(o) == 2 and o[0].startswith("control:") and o[1] in ("NOTIFY yes", "NOTIFY no")
            and per is not None and all(per.get(y) == 1 for y in ALIASES))
    if not good:
        bad.append((lv, pc, rs, o, per))
case(f"TOTALITY: {n} cells (5 liveness x 6 positions x 3 records), each prints exactly one state per alias",
     n == 90 and not bad, bad[:3])

# ── P4 the wake route, both directions, against the REPO filter's own regexes ──────────────────────────
src = open(FILTER, encoding="utf-8").read()
tree = ast.parse(src)
keep = [ast.Import(names=[ast.alias(name="re")])]
for node in tree.body:
    if isinstance(node, ast.Assign) and any(getattr(t, "id", "") in ("_HEARTBEAT_OK", "_HEARTBEAT_BAD") for t in node.targets):
        keep.append(node)
    if isinstance(node, ast.FunctionDef) and node.name == "is_allclear_heartbeat":
        keep.append(node)
ns = {}
exec(compile(ast.fix_missing_locations(ast.Module(body=keep, type_ignores=[])), FILTER, "exec"), ns)
case("P4 extraction: _HEARTBEAT_OK, _HEARTBEAT_BAD and is_allclear_heartbeat all found in the filter",
     all(k in ns for k in ("_HEARTBEAT_OK", "_HEARTBEAT_BAD", "is_allclear_heartbeat")), sorted(k for k in ns if not k.startswith("__")))
allclear = ns["is_allclear_heartbeat"]
HEALTHY = ("OLD Claude / NEW Claude / ANALYST Claude / Infra Claude — hourly heartbeat: bridges active: y | "
           "inbox-log last-write: 40s ago (recent) | active-unacked alerts: none | watchers: all alive | {ctl}.")
SAMPLES = []
def collect(o):
    SAMPLES.append((o[0], o[1] == "NOTIFY yes"))
for fn in [lambda: (lambda f: (f.ok_record(), all_ready(f), f.run()[1]))(Fx())[2],          # answered
           lambda: (lambda f: (all_ready(f), f.run()[1]))(Fx())[1],                         # record new
           lambda: (lambda f: (f.ok_record(), all_ready(f, "20261015"), f.run()[1]))(Fx())[2]]: # issued, awaiting
    collect(fn())
fx = skipped(); collect(fx.run()[1]); fx.pos("CC-A", fx.size()); collect(fx.run(now="2026-10-16T13:00:00Z")[1])
fx = Fx(); fx.ok_record(); all_ready(fx); fx.answer("CC-B", "20261013"); fx.nopos("CC-B"); collect(fx.run()[1])
POOL = SAMPLES + ALL_LINES
paging = [s for s in POOL if s[1]]; quiet = [s for s in POOL if not s[1]]
wrong = [(c, p) for c, p in POOL if allclear("Heartbeat", HEALTHY.format(ctl=c)) == p]
case(f"P4: {len(paging)} paging and {len(quiet)} quiet control lines; NOTIFY yes <=> delivered, NOTIFY no <=> suppressed",
     paging and quiet and not wrong, wrong)
case("P4 control: the filter really suppresses a healthy all-clear and delivers a DEAD watcher",
     allclear("Heartbeat", HEALTHY.format(ctl="control: CC-A answered")) is True
     and allclear("Heartbeat", HEALTHY.format(ctl="control: CC-A answered").replace("watchers: all alive", "watchers: DEAD: CC-A")) is False)

# ── P9 the remote failure branch, against a REAL refusing host (pre-stated: ssh exit 255, NOTIFY yes) ──
d = tempfile.mkdtemp(prefix="hbctl-ssh-")
out = io.StringIO()
with contextlib.redirect_stdout(out):
    rc = cs.main(["--state-dir", d, "--ssh-target", "root@204.168.141.77", "--ssh-port", "1",
                  "--liveness"] + [f"{x}=alive" for x in ALIASES])
o = out.getvalue().splitlines()
ALL_LINES.append((o[0], o[-1] == "NOTIFY yes"))
paging_kinds = {k for k in ("NOT answered", "NOT delivering", "control record new", "control record RESET",
                            "control record NOT PERSISTING", "ISSUER NOT RUN", "UNDETERMINED", "remote read failed",
                            "re-issue failed")
                if any(k in c for c, p in ALL_LINES if p)}
case(f"P4 coverage: every paging state was produced and routed ({len(paging_kinds)}/9 kinds)", len(paging_kinds) == 9, paging_kinds)
wrong2 = [(c, p) for c, p in ALL_LINES if allclear("Heartbeat", HEALTHY.format(ctl=c)) == p]
case("P4 (all lines, incl. P9): NOTIFY yes <=> delivered, NOTIFY no <=> suppressed", not wrong2, wrong2)
case("P9: a refused connection -> CHECK FAILED — remote read failed (ssh exit 255), NOTIFY yes, exit 0, lock released",
     rc == 0 and o == ["control: CHECK FAILED — remote read failed (ssh exit 255)", "NOTIFY yes"]
     and not os.path.exists(os.path.join(d, "heartbeat-control.lock")), o)

if not PASS and not FAIL:
    print("ABORT: no case ran"); sys.exit(2)
print(f"\n{len(PASS)} passed, {len(FAIL)} failed")
sys.exit(1 if FAIL else 0)
