#!/usr/bin/env python3
"""Mutation runner for dt_handoff (B-TRANSCRIPT-ARCHIVE P8). CONTROL FIRST in the same scratch layout; a crash is
printed apart AND fails the run."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_handoff.py"), encoding="utf-8").read()


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("a blank required field accepted", replace("        if not f.get(n):", "        if False:")),
    ("a handoff omitting an open dispatch accepted", replace("    if missing:\n        raise Refused(", "    if False:\n        raise Refused(")),
    ("C-1: an empty or incomplete census reply taken as zero open", replace(
        "    if returncode != 0 or not any(str(x).startswith(CENSUS_RAN) for x in c.get(\"not_checked\", [])):", "    if False:")),
    ("C-1: a non-JSON reply taken as zero open", replace(
        '        return {"guard_failed": ["the census did not answer (exit %s, no JSON)" % returncode]}', "        return {}")),
    ("P10: QUEUED leaves the banner CLEAN", replace(
        "                drift.append(\"dispatch\")\n                lines.append(\"QUEUED — accepted, not started yet: %s\" % i)",
        "                lines.append(\"QUEUED — accepted, not started yet: %s\" % i)")),
    ("C-2: NOT HANDLED leaves the banner CLEAN", replace(
        "                drift.append(\"dispatch\")\n                lines.append(\"NOT HANDLED — no inbound row for %s\" % i)",
        "                lines.append(\"NOT HANDLED — no inbound row for %s\" % i)")),
    ("the alert parser accepts a read with no COUNT line", replace('    if returncode != 0 or "COUNT" not in out:', "    if returncode != 0:")),
    ("the writer stamps without fetching", replace("    if fetch:   # stamp the CURRENT remote", "    if False:   # stamp the CURRENT remote")),
    ("the guard never fetches", replace("        if fetch:\n            git(repo, \"fetch\"", "        if False:\n            git(repo, \"fetch\"")),
    ("ref drift not reported", replace("        if o != mach.get(\"origin\"):", "        if False:")),
    ("head drift not reported", replace("        if h != mach.get(\"head\"):", "        if False:")),
    ("dirty drift not reported", replace("        if pc != mach.get(\"porcelain\", \"\"):", "        if False:")),
    ("an omitted open dispatch not reported", replace("                if i not in listed:", "                if False:")),
    ("a reply on a listed dispatch not reported", replace(
        "            for i in sorted(set(mach.get(\"open_dispatches\", [])) - set(now_open)):", "            for i in []:")),
    ("an untrusted census taken as clean", replace("        if c.get(\"guard_failed\"):\n            failed.append(\"open-dispatch\")",
                                                   "        if False:\n            failed.append(\"open-dispatch\")")),
    ("a new due alert not reported", replace("        for a in sorted(set(now_a) - set(mach.get(\"due_alerts\", []))):", "        for a in []:")),
    ("an unreadable leg not counted as failed", replace("    except Exception:      # noqa: BLE001\n        failed.append(\"ref\")",
                                                        "    except Exception:      # noqa: BLE001\n        pass")),
    ("GUARD FAILED outranked by CLEAN", replace("    if failed:\n        banner = \"GUARD FAILED", "    if False:\n        banner = \"GUARD FAILED")),
    ("AGED printed even with drift", replace("    elif drift:\n        banner = \"STALE (drift)", "    elif drift and age <= AGE_S:\n        banner = \"STALE (drift)")),
    ("AGED never printed", replace("    elif age > AGE_S:", "    elif False:")),
    ("MISSING not marked BLOCKED", replace('            banner = "STALE/BLOCKED (drift) — %s"', '            banner = "STALE (drift) — %s"')),
    ("the pack path trusted", replace("        if not pm or not os.path.exists(os.path.join(repo, pm.group(1))):", "        if False:")),
    ("the archive link trusted", replace("    if lm and not os.path.exists(os.path.join(root, lm.group(1))):", "    if False:")),
    ("a missing machine block read as clean", replace(
        '        return "GUARD FAILED — handoff machine block not checked (missing or unreadable in %s)" % os.path.basename(path), [], text',
        '        return "HANDOFF GUARD: CLEAN", [], text')),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-hmut-")
    try:
        open(os.path.join(d, "dt_handoff.py"), "w", encoding="utf-8").write(src)
        for f in ("test_dt_handoff.py", "dt_dispatch_census.py"):   # the real-transport test reads the census source
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_handoff.py")], capture_output=True, cwd=d, timeout=600)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated guard does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
    sys.exit(2)
caught = crashed = 0
for name, mut in MUTATIONS:
    try:
        m = mut(SRC)
    except AssertionError as e:
        print("ERROR    %s: %s" % (name, e)); continue
    rc, line = suite(m)
    verdict = "SURVIVED" if rc == 0 else ("crashed" if line is None else "caught")
    crashed += verdict == "crashed"
    caught += rc != 0
    print("%-8s %s" % (verdict, name))
print("\n%d/%d caught (%d of them by a crash rather than an assertion)" % (caught, len(MUTATIONS), crashed))
sys.exit(0 if caught == len(MUTATIONS) and crashed == 0 else 1)
