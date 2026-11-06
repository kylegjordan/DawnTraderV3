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
    ("BLOCKER-1: resolve before arming (the r1 order)", replace(
        "    pending = armed + [new_key]\n    write_state(root, pending)\n    for k in armed:                        # RESOLVE LAST",
        "    pending = armed + [new_key]\n    write_state(root, pending)\n    for k in []:                        # RESOLVE LAST")),
    ("BLOCKER-1: one key for every never-ran check (the new one swallowed by dedupe)", replace(
        'new_key = DEADMAN_PREFIX + time.strftime("%Y%m%dT%H%M%SZ", time.gmtime(now))', 'new_key = DEADMAN_PREFIX + "x"')),
    ("BLOCKER-1: an alert-leg failure exits 0", replace("(code if code != 0 else (10 if why else 0))", "code")),
    ("a failed add still resolves the older checks", replace(
        "    except Exception as e:  # noqa: BLE001 - the older check still stands, which is the correct alarm\n        return",
        "    except Exception as e:  # noqa: BLE001 - the older check still stands, which is the correct alarm\n        _ =")),
    ("a failed night resolves the never-ran check", replace(
        "            return \"failure alert not raised: %s: %s\" % (type(e).__name__, str(e)[:300])\n        return None",
        "            return \"failure alert not raised: %s: %s\" % (type(e).__name__, str(e)[:300])\n        code = 0")),
    ("a success never resolves the failure alert", replace(
        '        remote(["resolve-key", FAIL_KEY, "--by", ACTOR, "--evidence", evidence(n, stamp, code)])', "        pass")),
    ("a resolved key kept in the state (resolved again forever)", replace("            pending.remove(k)\n", "")),
    ("the never-ran check scheduled for NOW (fires every night)", replace("utc(now + DEADMAN_H * 3600)", "utc(now)")),
    ("evidence without the host (reads as a repo path)", replace('"laptop:~/.claude/transcript-archive/RUNS.log:%d', '"transcript-archive/RUNS.log:%d')),
    ("free-text resolve evidence (REFUSED by the staging gate)", replace(
        'return "laptop:~/.claude/transcript-archive/RUNS.log:%d (nightly %s, exit %s)" % (n, stamp, code)',
        'return "nightly run %d at %s, exit %s" % (n, stamp, code)')),
    ("CONDITION-1: the r1 order - count the line, run the alert leg, THEN write it", replace(
        "        n = log_line(root, \"nightly\", code, line)\n        why = alert_leg(code, line, clock(), n, root, remote)",
        "        n = (sum(1 for _ in open(os.path.join(root, \"RUNS.log\"), \"rb\")) + 1) if os.path.exists(os.path.join(root, \"RUNS.log\")) else 1\n        why = alert_leg(code, line, clock(), n, root, remote)\n        log_line(root, \"nightly\", code, line)")),
    ("log_line returns the wrong number", replace("            n = sum(1 for _ in fh) + 1", "            n = sum(1 for _ in fh)")),
    ("an alert-leg failure not written to RUNS.log", replace('            log_line(root, "nightly-alert", code, "ALERT LEG FAILED: %s" % why)', "            pass")),
    ("a corrupt state read as empty", replace('        raise ValueError("unreadable .alert-state.json")', "        return []")),
    ("a corrupt state overwritten, not kept aside", replace(
        '            os.replace(os.path.join(root, ".alert-state.json"), kept)   # kept for the human, never overwritten', "            pass")),
    ("the failure's own line left out of the alert", replace("% (stamp, line))[:1500]", "% (stamp, \"\"))[:1500]")),
    ("the lock never released", replace("    finally:\n        if held:\n            drop_lock(root)", "    finally:\n        pass")),
    ("a held lock broken instead of waited on", replace("    except FileExistsError:\n        return False", "    except FileExistsError:\n        os.remove(os.path.join(root, \".run.lock\"))\n        return take_lock(root)")),
    ("nightly never gives up on a held lock", replace("        if waited >= wait_s:\n            break", "        if False:\n            break")),
    ("precompact runs over a held lock", replace("    if not take_lock(root):\n        log_line(root, \"precompact\", \"-\", \"SKIPPED — a run is already", "    if not take_lock(root) and False:\n        log_line(root, \"precompact\", \"-\", \"SKIPPED — a run is already")),
    ("no PreCompact floor", replace("    if last is not None and clock() - last < PRECOMPACT_FLOOR_S:", "    if False:")),
    ("a failed run counts as a success for the floor", replace('f[1] in ("nightly", "precompact") and f[2] == "0"', 'f[1] in ("nightly", "precompact")')),
    ("the hook spawns a fixed path, not its own file", replace('args = [sys.executable, "-I", os.path.abspath(__file__), "precompact-run"]',
                                                                 'args = [sys.executable, "-I", "dt_archive_trigger.py", "precompact-run"]')),
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
