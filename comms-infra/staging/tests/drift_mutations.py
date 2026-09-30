#!/usr/bin/env python3
"""Mutation controls for drift_tests.py and staging_session_tests.py (run as root on Helsinki).
Each mutation breaks ONE property; its suite must then fail CLEANLY (a summary line with >0 failed).
The unmutated suites must pass first. A mutation whose text is not found is itself a problem."""
import os
import re
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
TARGETS = {
    "drift": (os.path.join(HERE, "..", "dt-install-drift"), os.path.join(HERE, "drift_tests.py"), "DRIFT_SRC", "drift suite"),
    "session": (os.path.join(HERE, "..", "..", "agent-staging-session"), os.path.join(HERE, "staging_session_tests.py"),
                "ASS_SRC", "staging-session suite"),
    "alert": (os.path.join(HERE, "..", "dt-unit-failure-alert"), os.path.join(HERE, "alert_tests.py"), "ALERT_SRC", "alert suite"),
}
MUTATIONS = [
    ("drift", "compare against the branch head, not the installed sha", "        compare_files(box, sha)\n", "        compare_files(box, head or sha)\n"),
    ("drift", "PENDING never goes stale", "        if age is None or age > PENDING_DAYS:", "        if False:"),
    ("drift", "no ancestry check on the installed sha", '            if anc is None:\n                out("STATE", "the installed sha', '            if False:\n                out("STATE", "the installed sha'),
    ("drift", "no reload check", '        if props.get("NeedDaemonReload") != "no":', "        if False:"),
    ("drift", "extra drop-ins ignored", "        if have != sorted(dropins):", "        if False:"),
    ("drift", "timers not checked", '    for t in box["timers"]:', "    for t in []:"),
    ("drift", "marker age ignored", "            if age > MARKER_MAX_AGE_S:", "            if True:"),
    ("drift", "page class not written", '"PAGE-" + "".join(c for c in kind if c.isalnum() or c == "-")[:40])', '"STATE")'),
    ("drift", "symlinks followed", "    fd = os.open(path, os.O_RDONLY | os.O_NOFOLLOW)", "    fd = os.open(path, os.O_RDONLY)"),
    ("drift", "no known_hosts check", '    elif name == "staging_host_key":', '    elif name == "staging_host_key_DISABLED":'),
    ("session", "chown by path after close", "            os.fchown(fd, pw.pw_uid, pw.pw_gid)\n",
     "            pass\n"),
    ("session", "temp neither unlinked nor opened O_EXCL|O_NOFOLLOW", '            os.unlink(tmp, dir_fd=dfd)         # a leftover from an earlier crash (a link is removed, not followed)\n        except FileNotFoundError:\n            pass\n        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL | os.O_NOFOLLOW, 0o600, dir_fd=dfd)\n',
     '            pass\n        except FileNotFoundError:\n            pass\n        fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_TRUNC, 0o600, dir_fd=dfd)\n'),
    ("session", "home followed through a link", "    dfd = os.open(home, os.O_RDONLY | os.O_DIRECTORY | os.O_NOFOLLOW)",
     "    dfd = os.open(home, os.O_RDONLY | os.O_DIRECTORY)"),
    ("drift", "no FragmentPath check", '        if props.get("FragmentPath") != fragment:', "        if False:"),
    ("drift", "PENDING age from the newest commit", '        cts, _ = git(box, "log", "--reverse",', '        cts, _ = git(box, "log", "-1",'),
    ("drift", "a not-yet-fetched sha reads as tamper", '        if have is None:\n            # C8', '        if False:\n            # C8'),
    ("drift", "main sudoers not scanned", '        paths = [P("/etc/sudoers")]', "        paths = []"),
    ("drift", "dtmint '!' accepted", '        if f[0] == "dtmint" and len(f) > 1 and f[1] != "*":', '        if f[0] == "dtmint" and len(f) > 1 and f[1] not in ("*", "!"):'),
    ("alert", "the %N name never matches (the r2 blocker)", "  dt-install-drift|dt-install-drift.service)", "  dt-install-drift.service)"),
    ("alert", "one key for all classes", '    --dedupe-key "dt-unit-failure:$unit:$cls"', '    --dedupe-key "dt-unit-failure:$unit"'),
    ("session", "one agent's failure stops the other", "        except Exception as e:\n            failed.append(agent)", "        except ZeroDivisionError as e:\n            failed.append(agent)"),
    ("session", "short token accepted", "    if exp - time.time() < MIN_EXP_LEFT_S:", "    if False:"),
]

bad = 0
for t, (src, suite, var, label) in TARGETS.items():
    b = subprocess.run([sys.executable, suite], env={"PATH": "/usr/bin:/bin", var: src}, capture_output=True, text=True, timeout=900)
    last = (b.stdout.strip().splitlines() or ["?"])[-1]
    if b.returncode != 0 or not re.match(r"^%s: \d+ passed, 0 failed$" % label, last):
        print("BASELINE DOES NOT PASS (%s) — mutation results would be meaningless:\n%s%s" % (t, b.stdout[-600:], b.stderr[-600:]))
        sys.exit(2)
    print("baseline %s: %s" % (t, last))
for t, name, old, new in MUTATIONS:
    src, suite, var, label = TARGETS[t]
    base = open(src, encoding="utf-8").read()
    if base.count(old) != 1:
        print("MUTATION NOT APPLIED (%d matches): %s" % (base.count(old), name))
        bad += 1
        continue
    d = tempfile.mkdtemp(prefix="drift-mut-")
    p = os.path.join(d, os.path.basename(src))
    open(p, "w", encoding="utf-8").write(base.replace(old, new))
    r = subprocess.run([sys.executable, suite], env={"PATH": "/usr/bin:/bin", var: p}, capture_output=True, text=True, timeout=900)
    last = (r.stdout.strip().splitlines() or ["?"])[-1]
    if r.returncode == 0:
        print("SURVIVED (the suite did not notice): %s" % name)
        bad += 1
    elif not re.match(r"^%s: \d+ passed, [1-9]\d* failed$" % label, last):
        print("CRASHED, not a clean kill: %s :: %s" % (name, (r.stderr.strip().splitlines() or ["?"])[-1]))
        bad += 1
    else:
        print("killed: %-48s %s" % (name, last))
print("mutations: %d applied and killed, %d problems" % (len(MUTATIONS) - bad, bad))
sys.exit(1 if bad else 0)
