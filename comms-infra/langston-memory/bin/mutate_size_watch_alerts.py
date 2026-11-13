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
