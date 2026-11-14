#!/usr/bin/env python3
"""Mutation runner for test_size_watch_alerts.py (B-SIZE-WATCH-BREACH-ALARM). Hand-run on Helsinki:
    python3 -I mutate_size_watch_alerts.py         (exit 0 = every mutant caught by an assertion)
CONTROL FIRST: the unmutated copies must pass. Each mutant is applied to a private COPY (never a file in place), its
anchor must match EXACTLY ONCE (a mutant that cannot be applied is counted apart, never as caught), and a mutant is
CAUGHT only when the suite exits non-zero WITH a FAIL line - a crash is not an assertion. Judged by exit code, never by
grepping alone (my standing lesson: a crashing suite prints no FAIL lines and reads as 'survived' otherwise).
Line endings are normalised to LF before applying, so an anchor written here matches a CRLF checkout too."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = {
    "langston-size-watch": os.environ.get("SIZE_WATCH_PATH") or os.path.join(HERE, "langston-size-watch"),
    "coltrane-size-watch": os.environ.get("COLTRANE_WATCH_PATH")
    or os.path.join(HERE, "..", "..", "codex", "coltrane-size-watch"),
    "langston-memory-write": os.environ.get("MEMORY_WRITE_PATH") or os.path.join(HERE, "langston-memory-write"),
}
TEST = os.path.join(HERE, "test_size_watch_alerts.py")
L, C = "langston-size-watch", "coltrane-size-watch"

MUTANTS = [
    ("the breach add is dropped", L,
     '        new_id, failure = _alert_add(key, "warning", title, body)\n        if not new_id:\n'
     '            return failure          # the stored id (if any) is kept; the next run tries again',
     '        new_id, failure = None, "mutant: no add"\n        if not new_id:\n'
     '            return failure          # the stored id (if any) is kept; the next run tries again'),
    ("C-1: breach resolves on the over-test", L,
     '            st, "breach", status == "BREACH", status in ("UNDER", "AT-CEILING"),',
     '            st, "breach", status == "BREACH", over <= 0,'),
    ("C-2: missing-file shares the breach key", L,
     '"missing": ("missing_alert_id", "langston-size-watch-missing-file"),',
     '"missing": ("missing_alert_id", "langston-size-watch-breach"),'),
    ("C-3: the immediate save is dropped", L,
     '        st[field] = new_id\n        save_state(st)              # C-3: persisted before anything else can fail',
     '        st[field] = new_id'),
    ("ruling (b): the drill writes the real key", L,
     'DRILL_KEY = "langston-size-watch-breach-drill"', 'DRILL_KEY = "langston-size-watch-breach"'),
    ("BLOCKER-2: the add is skipped while an id is stored (the r1 latch)", L,
     '    if active:\n        new_id, failure = _alert_add(key, "warning", title, body)\n        if not new_id:\n'
     '            return failure          # the stored id',
     '    if active and not prev:\n        new_id, failure = _alert_add(key, "warning", title, body)\n'
     '        if not new_id:\n            return failure          # the stored id'),
    ("tamper resolves while lsattr could not answer", L,
     'not rules["tamper"] and tamper_established(rules),', 'not rules["tamper"],'),
    ("an episode closes on a missing-file run", L,
     'elif status in ("UNDER", "AT-CEILING") and open_ep is not None:',
     'elif status != "BREACH" and open_ep is not None:'),
    ("the cap drops silently", L,
     '        return ("dropped the %d oldest breach episode(s) at the cap of %d; the run log keeps every run"\n'
     '                % (dropped, EPISODE_CAP))', '        return None'),
    ('Step-4 BLOCKER: a transport failure counts as discharged again', L,
     '    if _not_found(rc, err, alert_id):\n        return True, "%s no longer exists - discharged" % alert_id',
     '    if "not found" in (out + err).lower() or "no such" in (out + err).lower():\n        return True, "%s no longer exists - discharged" % alert_id'),
    ('Step-4: lsattr is no longer guarded on its own', L,
     '        except Exception as e:\n            flags, why = None, "%s: %s" % (type(e).__name__, str(e)[:80])',
     '        except ZeroDivisionError as e:\n            flags, why = None, "%s: %s" % (type(e).__name__, str(e)[:80])'),
    ('Step-4: a missing rules file reads as a link attack again', L,
     '    except FileNotFoundError:\n        out["tamper"].append("%s does not exist" % target)\n',
     ''),
    ("R-3: the guard-tool row auto-resolves on a quiet day", L,
     '            st, "guard_tool", bool(guard["unenumerated"]), False,',
     '            st, "guard_tool", bool(guard["unenumerated"]), not guard["unenumerated"],'),
    ("R-3: the guard log offset is never stored", L,
     '            st["guard_log_offset"] = guard["offset_to"]',
     '            pass'),
    ("R-3a: the cli row auto-resolves on a match", L,
     '            st, "guard_cli", guard["mismatch"], False,',
     '            st, "guard_cli", guard["mismatch"], guard["cli_established"] and not guard["mismatch"],'),
    ("R-3b: could-not-establish refusals are not partitioned out", L,
     '    return "unestablished"',
     '    return "over"'),
    ("R-3 C-1: the offset advances even when the add failed", L,
     '        if guard["log_ok"] and recorded:',
     '        if guard["log_ok"]:'),
    ("R-3 C-2: the CLI comparison is always 'established'", L,
     '    g["cli_established"] = bool(g["enumerated"] and g["running"])',
     '    g["cli_established"] = True'),
    ("R-3 C-2: a missing package.json is not reported blind", L,
     '        g["blind"].append("%s unreadable (%s)" % (CLI_PACKAGE, type(e).__name__))',
     '        pass'),
    ("R-3 C-2: an unparseable guard constant is not reported blind", L,
     '        if not mm:\n            g["blind"].append(',
     '        if False:\n            g["blind"].append('),
    ("R-3 C-2: an unreadable log counts as read", L,
     '        g["blind"].append("%s unreadable (%s)" % (GUARD_LOG, type(e).__name__))',
     '        g["log_ok"] = True'),
    ("R-3 fold-in 1: the offset runs to the end of a half-written row", L,
     '        data = data[:cut + 1] if cut >= 0 else b""',
     '        data = data'),
    ("R-3 fold-in 1: an unparseable line is skipped silently", L,
     '        if bad:\n            g["blind"].append(',
     '        if False:\n            g["blind"].append('),
    ("R-3 fold-in 1a: a failed blind add does not hold the offset", L,
     '                                    ("bad_lines", "guard_blind")))',
     '                                    ))'),
    ("R-3 fold-in 1b: a non-row JSON line is not counted bad", L,
     '            if not isinstance(r, dict):',
     '            if False:'),
    ("1c: an unreadable state re-seeds (the old load_state)", L,
     '    except Exception as e:\n        raise StateUnreadable(',
     '    except Exception as e:\n        return None\n        raise StateUnreadable('),
    ("1c: a non-object state passes as a state", L,
     '    if not isinstance(st, dict):\n        raise StateUnreadable(',
     '    if False:\n        raise StateUnreadable('),
    ("1c: a non-object package.json is read with .get", L,
     '        g["running"] = pkg.get("version") if isinstance(pkg, dict) else None',
     '        g["running"] = pkg.get("version")'),
    ("1c: a non-object rules record is read with .get", L,
     '    if not isinstance(rec, dict):',
     '    if False:'),
    ("R-3 note 3: the body omits the re-read byte", L,
     '" (re-read it from byte " +\n            str(guard["offset_from"]) + ": this row\'s body is frozen at first mint, later refusals are not in it). A tool aimed',
     '" (" +\n            "" + "). A tool aimed'),
    ("R-3: the CLI comparison is skipped", L,
     '    g["mismatch"] = g["cli_established"] and g["enumerated"] != g["running"]',
     '    g["mismatch"] = False'),
    ("R-3: a shorter log is not read from 0", L,
     '        if size < off:\n            off = 0',
     '        if False:\n            off = 0'),
    ("Coltrane: the add is skipped while an id is stored", C,
     '    if active:\n        new_id, failure = _alert_add(key, "warning", title, body)\n        if not new_id:\n'
     '            return failure\n',
     '    if active and not prev:\n        new_id, failure = _alert_add(key, "warning", title, body)\n'
     '        if not new_id:\n            return failure\n'),
    ("Coltrane: the heartbeat re-arms after a failed resolve", C,
     '        if not ok:\n            notes.append("re-arm SKIPPED - dedupe would collapse onto the unresolved row")\n'
     '            return "; ".join(notes)',
     '        if not ok:\n            notes.append("re-arm SKIPPED - dedupe would collapse onto the unresolved row")'),
    ("Coltrane: the self-test writes to the alert store", C,
     '        store = False           # the self-test never writes to the shared alert store',
     '        store = True'),
]


def read(p):
    return open(p, "rb").read().decode("utf-8").replace("\r\n", "\n")


def stage(d, mutate=None):
    paths = {}
    for name, src in SRC.items():
        text = read(src)
        if mutate and mutate[0] == name:
            text = text.replace(mutate[1], mutate[2])
        paths[name] = os.path.join(d, name)
        open(paths[name], "w", encoding="utf-8", newline="\n").write(text)
    return paths


def run(paths):
    env = dict(os.environ, SIZE_WATCH_PATH=paths[L], COLTRANE_WATCH_PATH=paths[C],
               MEMORY_WRITE_PATH=paths["langston-memory-write"])
    p = subprocess.run([sys.executable, "-I", TEST], capture_output=True, text=True, env=env, timeout=600)
    return p.returncode, p.stdout + p.stderr


def main():
    base = tempfile.mkdtemp(prefix="size-watch-mut-", dir=os.path.expanduser("~"))
    try:
        rc, out = run(stage(os.path.join(base, "control") if os.makedirs(os.path.join(base, "control")) is None
                            else None))
        if rc != 0:
            print("CONTROL FAILED - the unmutated copies do not pass; no mutant result means anything")
            print(out[-1500:])
            return 2
        print("control: the unmutated copies pass")
        caught = bad = 0
        for i, (label, name, a, b) in enumerate(MUTANTS):
            n = read(SRC[name]).count(a)
            if n != 1:
                print("ANCHOR   %s  (found %d times - not applied)" % (label, n))
                bad += 1
                continue
            d = os.path.join(base, "m%02d" % i)
            os.makedirs(d)
            paths = stage(d, (name, a, b))
            if read(paths[name]).count(b) < 1 or read(paths[name]).count(a) == read(SRC[name]).count(a) and a not in b:
                print("NOTAPPLIED %s" % label)
                bad += 1
                continue
            rc, out = run(paths)
            fails = [x for x in out.splitlines() if x.startswith("FAIL")]
            if rc != 0 and fails:
                caught += 1
                print("caught   %s   <- %s" % (label, fails[0][:110]))
            elif rc != 0:
                bad += 1
                print("CRASH    %s   %s" % (label, (out.strip().splitlines() or ["?"])[-1][:140]))
            else:
                print("SURVIVED %s" % label)
        print("\n%d/%d caught by an assertion (%d crashed or could not be applied)" % (caught, len(MUTANTS), bad))
        return 0 if caught == len(MUTANTS) else 1
    finally:
        shutil.rmtree(base, ignore_errors=True)


if __name__ == "__main__":
    sys.exit(main())
