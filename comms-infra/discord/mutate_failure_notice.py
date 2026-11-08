"""Mutation runner for test_failure_notice.py (B-AGENT-INVOKE-FAILURE-NOTICE). Hand-run on Helsinki with the bridge venv:
    /opt/discord-bridges/venv/bin/python3 mutate_failure_notice.py      (exit 0 = every mutant caught, none by a crash)
CONTROL FIRST: the unmutated copy must pass. Each mutant is applied to a scratch COPY of this directory (never the
files in place); a mutant is CAUGHT when the test exits non-zero with at least one FAIL line, and a run that crashes
without a FAIL line is counted apart, because a crash is not an assertion."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
PY = sys.executable
BRIDGE, QUEUE = "discord-langston-bridge.py", "langston_queue.py"


def rep(fname, a, b):
    return (fname, a, b)


MUTANTS = [
    ("C-1: the worker's exception arm does not call _after_no_reply",
     rep(BRIDGE, '                _after_no_reply(task, "worker_error")', "                pass")),
    ("C-2: the outcome is sniffed from the text again",
     rep(BRIDGE, '        task["_outcome"] = "timeout" if _meta["outcome"] == "timeout" else "bridge_error"',
         '        task["_outcome"] = "timeout" if "timed out" in resp_stripped.lower() else "bridge_error"')),
    ("P1: the notice row is written even when the notice post failed",
     rep(BRIDGE, '    if sent_id is None:\n        log(f"failure notice for msg {msg_id} did NOT post',
         '    if False:\n        log(f"failure notice for msg {msg_id} did NOT post')),
    ("P1: the journal line for the restart helper is dropped",
     rep(BRIDGE, '    log(f"responded to msg {msg_id} (failure notice: {outcome})")', "    pass")),
    ("P2: a DM failure posts the raw error again (no notice for a DM)",
     rep(BRIDGE, '        _after_no_reply(task, task["_outcome"], _meta.get("elapsed"))\n        return',
         '        if is_dm:\n            dc.rest_send(BOT_TOKEN, channel_id, response, LOG_FILE)\n            return\n'
         '        _after_no_reply(task, task["_outcome"], _meta.get("elapsed"))\n        return')),
    ("P3: the failed request's queue item is not settled",
     rep(BRIDGE, '    eid = task.get("_enqueued_id")\n    if not eid:', '    eid = None\n    if not eid:')),
    ("C-3: a noop's reason is not stored",
     rep(QUEUE, '        if marker.get("reason"):\n            item["settle_reason"] = marker.get("reason")', "        pass")),
    ("C-4: the spool increment drops the record's other fields",
     rep(BRIDGE, '        extra = {k: v for k, v in rec.items() if k not in ("state", "ts", "task")}', "        extra = {}")),
    ("P5: the spool record is removed even when the Kyle line failed",
     rep(BRIDGE, '        log(f"alert spool: the Kyle line for msg {mid} did NOT post - the spool record is KEPT")\n        return',
         '        log(f"alert spool: the Kyle line for msg {mid} did NOT post - the spool record is KEPT")')),
    ("P5: the self-advance failure is not recorded on its item",
     rep(BRIDGE, '                it["last_failure"] = outcome', "                pass")),
    ("P10: the enqueue row is written AFTER the put",
     rep(BRIDGE, '                 text=task.get("content") if task.get("kind") == "text" else None)\n    task_q.put(task)',
         '                 text=None) if False else None\n    task_q.put(task)\n    mirror_event("langston_enqueued", channel_id=task.get("channel_id"), '
         'message_id=task.get("message_id"), sender_username=task.get("author_name"), task_kind=task.get("kind"))')),
    ("P10: langston_enqueued joins the watchdog's dedup kinds",
     rep(BRIDGE, '        dedup_kinds={"langston_inbound"},', '        dedup_kinds={"langston_inbound", "langston_enqueued"},')),
    ("P11: the other-agent notice check is removed",
     rep(BRIDGE, "        if is_other_agent_failure_notice(message.author.id, content):", "        if False:")),
]


def run(dirpath):
    p = subprocess.run([PY, "test_failure_notice.py"], cwd=dirpath, capture_output=True, text=True, timeout=300)
    return p.returncode, p.stdout + p.stderr


def copy():
    d = tempfile.mkdtemp(prefix="mut-fn-", dir=HERE)
    for n in os.listdir(HERE):
        s = os.path.join(HERE, n)
        if os.path.isfile(s) and (n.endswith(".py") or n == "langston-bridge-restart"):   # the helper has no suffix
            shutil.copy(s, d)
    return d


ctl = copy()
rc, out = run(ctl)
shutil.rmtree(ctl, ignore_errors=True)
if rc != 0:
    print("CONTROL FAILED - the unmutated copy does not pass; no mutant result means anything\n" + out[-800:])
    sys.exit(2)
print("control: the unmutated copy passes")
caught = crashed = 0
for name, (fname, a, b) in MUTANTS:
    d = copy()
    path = os.path.join(d, fname)
    src = open(path, encoding="utf-8").read()
    if src.count(a) != 1:
        print("ANCHOR   %s  (found %d times - the mutant cannot be applied)" % (name, src.count(a)))
        crashed += 1
        shutil.rmtree(d, ignore_errors=True)
        continue
    open(path, "w", encoding="utf-8").write(src.replace(a, b))
    rc, out = run(d)
    shutil.rmtree(d, ignore_errors=True)
    if rc != 0 and "FAIL" in out:
        caught += 1
        print("caught   " + name)
    elif rc != 0:
        crashed += 1
        print("CRASH    " + name + "   " + out.strip().splitlines()[-1][:160])
    else:
        print("SURVIVED " + name)
print("\n%d/%d caught (%d by a crash or a bad anchor rather than an assertion)" % (caught, len(MUTANTS), crashed))
sys.exit(0 if caught == len(MUTANTS) else 1)
