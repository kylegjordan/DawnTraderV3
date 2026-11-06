#!/usr/bin/env python3
"""Mutation runner for dt_archive_trigger (B-TRANSCRIPT-ARCHIVE P7, the triggers and the alert leg). CONTROL FIRST; a crash is printed apart AND fails."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_archive_trigger.py"), encoding="utf-8").read()
COPIED = ("test_dt_archive_trigger.py", "dt_archive_run.py", "dt_archive.py", "dt_index.py", "dt_transcript.py", "dt_secret_hashes.py")


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("a success schedules no never-ran check", replace("        if code == 0:\n            remote([\"add\"", "        if False:\n            remote([\"add\"")),
    ("the never-ran check scheduled for NOW (fires every night)", replace("utc(now + DEADMAN_H * 3600)", "utc(now)")),
    ("the failure alert not cleared first (deduped away behind the scheduled check)", replace(
        "        remote([\"resolve-key\", KEY,", "        (lambda *a: None)([\"resolve-key\", KEY,")),
    ("free-text resolve evidence (REFUSED by the staging gate)", replace(
        "\"%s (nightly %s, exit %s)\" % (ref, stamp, code)", "\"nightly %s, exit %s\" % (stamp, code)")),
    ("the evidence cites the wrong RUNS.log line", replace("            n = sum(1 for _ in fh) + 1", "            n = sum(1 for _ in fh)")),
    ("the failure's own line left out of the alert", replace("Nothing new was archived. \"\n                               \"Owner: Infra Claude.\" % (stamp, line)",
                                                            "Nothing new was archived. \"\n                               \"Owner: Infra Claude.\" % (stamp, \"\")")),
    ("an alert-leg failure swallowed silently", replace("        return \"%s: %s\" % (type(e).__name__, str(e)[:300])\n    return None", "        return None\n    return None")),
    ("the lock released before the log is written (the cited line can move)", replace(
        "    try:          # the lock is held through the log write", "    if held:\n        drop_lock(root)\n    try:          # the lock is held through the log write")),
    ("the lock never released", replace("    finally:\n        if held:\n            drop_lock(root)", "    finally:\n        pass")),
    ("a held lock broken instead of waited on", replace("    except FileExistsError:\n        return False", "    except FileExistsError:\n        os.remove(os.path.join(root, \".run.lock\"))\n        return take_lock(root)")),
    ("nightly never gives up on a held lock", replace("        if waited >= wait_s:\n            break", "        if False:\n            break")),
    ("a held lock's failure not alerted", replace("        why = alert_leg(code, line, clock(), ref, remote)", "        why = alert_leg(code, line, clock(), ref, remote) if held else None")),
    ("precompact runs over a held lock", replace("    if not take_lock(root):\n        log_line(root, \"precompact\"", "    if not take_lock(root) and False:\n        log_line(root, \"precompact\"")),
    ("the hook's spawn failure not written down", replace("            log_line(root, \"precompact-hook\", \"-\", \"COULD NOT START THE RUN", "            (lambda *a: None)(root, \"precompact-hook\", \"-\", \"COULD NOT START THE RUN")),
    ("the hook does not record its inputs", replace("\"fired; input keys: %s\" % \",\".join(keys)", "\"fired\"")),
    ("a run that raises escapes the trigger", replace("    except Exception as e:  # noqa: BLE001 - every attempt ends on a result, never a traceback", "    except KeyboardInterrupt as e:  # noqa: BLE001 - every attempt ends on a result, never a traceback")),
    ("a failed remote call read as success", replace("    if p.returncode != 0:\n        raise RuntimeError(\"system-alerts", "    if False:\n        raise RuntimeError(\"system-alerts")),
    ("arguments not quoted for the remote shells", replace("\" \".join(shlex.quote(a) for a in args)", "\" \".join(args)")),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-tmut-")
    try:
        open(os.path.join(d, "dt_archive_trigger.py"), "w", encoding="utf-8").write(src)
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        try:
            p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_archive_trigger.py")], capture_output=True, cwd=d, timeout=180)
        except subprocess.TimeoutExpired:      # a HANG is a detection the suite did not make by assertion: counted as a crash
            return 1, None
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated run does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
