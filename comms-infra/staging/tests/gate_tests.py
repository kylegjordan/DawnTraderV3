#!/usr/bin/env python3
"""dt-deploy-notice-gate suite (Langston gate B attack 1). Run: python3 comms-infra/staging/tests/gate_tests.py
In-process: the gate's CONSTANTS are pointed at a temp dir and NPM at a recorder that writes its argv. EXPECTED OUTCOMES
ARE IN EACH CHECK, written before the run. A refusal must exit 2 AND run nothing. Exit 0 = all pass."""
import base64
import importlib.util
import io
import json
import os
import sys
import tempfile
from contextlib import redirect_stderr, redirect_stdout
from importlib.machinery import SourceFileLoader

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("GATE_SRC") or os.path.join(HERE, "..", "dt-deploy-notice-gate")
spec = importlib.util.spec_from_loader("gate", SourceFileLoader("gate", SRC))
G = importlib.util.module_from_spec(spec)
spec.loader.exec_module(G)
T = tempfile.mkdtemp(prefix="gate-t-")
REC = os.path.join(T, "npm-argv.jsonl")
G.APP, G.NOTICE, G.RECORD = T, os.path.join(T, "notice"), os.path.join(T, "record")
G.NPM = [sys.executable, "-c", "import json,sys; open(%r,'a').write(json.dumps(sys.argv[1:])+'\\n')" % REC]
open(G.RECORD, "w").write("sha=%s\ndeployed_at=2027-01-15T08:00:00Z\n" % ("a" * 40))
PASS = FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, str(detail)[:300]))


def tok(obj):
    return base64.urlsafe_b64encode(json.dumps(obj).encode()).decode()


def run(raw):
    if os.path.exists(REC):
        os.unlink(REC)
    o, e = io.StringIO(), io.StringIO()
    with redirect_stdout(o), redirect_stderr(e):
        rc = G.main(raw)
    calls = [json.loads(x) for x in open(REC)] if os.path.exists(REC) else []
    return rc, o.getvalue(), e.getvalue(), calls


KEY = "deploy-in-window:B-X:%s:20270115T080000Z" % ("b" * 40)
rc, o, e, c = run(tok({"op": "read"}))
check("read with no notice file: the separator and the record, exit 0", rc == 0 and o.startswith(G.SEP) and "deployed_at=" in o, o)
open(G.NOTICE, "w").write("attempt_at=x attempt_key=y sha=z\n")
rc, o, e, c = run(tok({"op": "read"}))
check("read with a notice file: the notice first, then the separator", rc == 0 and o.startswith("attempt_at=x") and G.SEP in o, o)
os.rename(G.RECORD, G.RECORD + ".away")
rc, o, e, c = run(tok({"op": "read"}))
check("B-6: read with NO record -> exit 0 and an explicit #RECORD-ABSENT, never a traceback",
      rc == 0 and "#RECORD-ABSENT" in o and G.SEP in o, (rc, o, e))
os.rename(G.RECORD + ".away", G.RECORD)
rc, o, e, c = run(tok({"op": "resolve", "key": KEY, "evidence": "completed; posts 1,2"}))
check("resolve of this watcher's own key -> resolve-key as deploy-notice-watcher",
      rc == 0 and c == [["resolve-key", KEY, "--by", "deploy-notice-watcher", "--evidence", "completed; posts 1,2"]], c)
rc, o, e, c = run(tok({"op": "resolve", "key": G.HEARTBEAT_KEY, "evidence": "ran"}))
check("resolve of the heartbeat key is allowed", rc == 0 and c and c[0][1] == G.HEARTBEAT_KEY, c)
for label, req in [
        ("a foreign key", {"op": "resolve", "key": "gov-docgap:B-X:report", "evidence": "x"}),
        ("a key with a short sha", {"op": "resolve", "key": "deploy-in-window:B-X:abc:20270115T080000Z", "evidence": "x"}),
        ("multi-line evidence", {"op": "resolve", "key": KEY, "evidence": "a\nb"}),
        ("empty evidence", {"op": "resolve", "key": KEY, "evidence": " "}),
        ("evidence over 400 chars", {"op": "resolve", "key": KEY, "evidence": "x" * 401}),
        ("an extra field", {"op": "resolve", "key": KEY, "evidence": "x", "by": "kyle"}),
        ("a heartbeat with a bad due", {"op": "heartbeat", "due": "tomorrow"}),
        ("an unknown op", {"op": "ack", "key": KEY}),
        ("read with an extra field", {"op": "read", "path": "/etc/shadow"})]:
    rc, o, e, c = run(tok(req))
    check("REFUSED, nothing run: %s" % label, rc == 2 and c == [] and "REFUSED" in e, (rc, c, e))
rc, o, e, c = run("cat /etc/shadow")
check("REFUSED, nothing run: a raw shell command", rc == 2 and c == [] and "not echoed" in e and "shadow" not in e, (rc, e))
rc, o, e, c = run(tok({"op": "heartbeat", "due": "2027-01-16T10:00:00Z"}))
check("heartbeat -> add with the fixed key, category breakage, its fixed title",
      rc == 0 and c and c[0][:3] == ["add", "--triggers-at", "2027-01-16T10:00:00Z"] and G.HEARTBEAT_KEY in c[0]
      and "breakage" in c[0] and G.HB_TITLE in c[0], c)
print("gate suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
