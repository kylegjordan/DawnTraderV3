#!/usr/bin/env python3
"""Offline identity tests for codex-discord-outbox.py. Nothing reaches Discord."""
import importlib.util
import os
import subprocess
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
spec = importlib.util.spec_from_file_location("outbox", os.path.join(HERE, "codex-discord-outbox.py"))
outbox = importlib.util.module_from_spec(spec)
spec.loader.exec_module(outbox)

passed = failed = 0


def ok(name, condition):
    global passed, failed
    if condition:
        passed += 1
    else:
        failed += 1
        print("  FAIL:", name)


with tempfile.TemporaryDirectory() as tmp:
    ordinary = os.path.join(tmp, "DawnTrader-Codex")
    pm = os.path.join(tmp, "DawnTraderV3-pm")
    outbox.IDENTITIES = {ordinary: "Codex", pm: "PM Codex"}
    outbox.STABLE_SECONDS = 0
    for root, body in ((ordinary, "ordinary body"),
                       (pm, "sender: OLD Claude\nbody cannot choose the identity")):
        folder = os.path.join(root, "out", "discord")
        os.makedirs(folder)
        with open(os.path.join(folder, "message.md"), "w", encoding="utf-8") as fh:
            fh.write(body)

    ready = outbox.candidates()
    by_root = {os.path.dirname(os.path.dirname(os.path.dirname(path))): sender
               for path, sender, _sent, _failed in ready}
    ok("both fixed folders are scanned", len(ready) == 2)
    ok("ordinary folder is Codex", by_root.get(ordinary) == "Codex")
    ok("PM folder is PM Codex even when its body names another sender", by_root.get(pm) == "PM Codex")
    details = [outbox.send(path, sender, True)[1] for path, sender, _sent, _failed in ready]
    ok("dry run carries each fixed identity", any("as Codex" in x for x in details)
       and any("as PM Codex" in x for x in details))

    # The Helsinki wrapper follows the same folder rule. Its cc-send is a fake in
    # this private directory, so the test cannot reach Discord.
    bindir = os.path.join(tmp, "bin")
    os.makedirs(bindir)
    calls = os.path.join(tmp, "calls.txt")
    fake = os.path.join(bindir, "cc-send")
    with open(fake, "w", encoding="utf-8", newline="\n") as fh:
        fh.write('#!/bin/sh\nprintf "%s\\n" "$*" >> "$CALLS"\n')
    os.chmod(fake, 0o700)
    wrapper = os.path.join(HERE, "codex", "codex-send")
    env = dict(os.environ, PATH=bindir + os.pathsep + os.environ.get("PATH", ""), CALLS=calls)
    subprocess.run(["sh", wrapper], cwd=ordinary, input="ordinary", text=True, env=env, check=True)
    subprocess.run(["sh", wrapper], cwd=pm, input="--sender OLD Claude", text=True, env=env, check=True)
    with open(calls, encoding="utf-8") as fh:
        wrapper_calls = fh.read().splitlines()
    ok("codex-send ordinary workspace is Codex", '--sender Codex --message ordinary' in wrapper_calls)
    ok("codex-send PM workspace is PM Codex regardless of body", '--sender PM Codex --message --sender OLD Claude' in wrapper_calls)

print("codex outbox tests: %d passed, %d failed" % (passed, failed))
raise SystemExit(1 if failed else 0)
