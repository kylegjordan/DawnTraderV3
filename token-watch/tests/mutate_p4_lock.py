#!/usr/bin/env python3
"""P4 mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY, OBJ-4b(a)). Run from token-watch/ on a scratch COPY of the tree:
    python3 tests/mutate_p4_lock.py
exit 0 = every mutant killed (tests/test_p4_lock.py exits non-zero WITH a FAIL line). NOT-APPLIED counts as a failure."""
import subprocess, sys

NL = chr(10)
T = "tests/test_p4_lock.py"
MUTANTS = [
    ("release is unconditional again", [("store.py", "        if held.ours():" + NL + "            try:" + NL + "                os.unlink(LOCK_PATH)",
                                         "        if True:" + NL + "            try:" + NL + "                os.unlink(LOCK_PATH)")]),
    ("beat ignores the token", [("store.py", "    def beat(self) -> bool:" + NL + "        if not self.ours():",
                                 "    def beat(self) -> bool:" + NL + "        if False:")]),
    ("a fresh lock is stolen", [("store.py", "            if age > LOCK_STALE_AFTER:" + NL + "                # Abandoned",
                                 "            if True:" + NL + "                # Abandoned")]),
    ("the steal is silent", [("store.py", "                LOG.error(\"STOLE a stale periodic lock", "                LOG.debug(\"STOLE a stale periodic lock")]),
    ("lock_beat does not reach the holder", [("store.py", "    return h.beat() if h is not None else False", "    return False")]),
    ("no beat per bucket", [("follow_up.py", "        lock_beat()                     # P4: a beat per bucket", "        pass                     # P4: a beat per bucket")]),
    ("no beat every 500 entries", [("follow_up.py", "            if stats[\"due\"] % 500 == 0:" + NL + "                lock_beat()",
                                    "            if stats[\"due\"] % 500 == 0:" + NL + "                pass")]),
    ("promote does not beat", [("promote.py", "            if seen_rows % 500 == 0:" + NL + "                lock_beat()",
                                "            if seen_rows % 500 == 0:" + NL + "                pass")]),
    ("tier does not beat", [("tier.py", "      lock_beat()                       # P4: a beat per source", "      pass                       # P4: a beat per source")]),
]
files = sorted({f for _n, edits in MUTANTS for f, _a, _b in edits})
orig = {f: open(f, encoding="utf-8").read() for f in files}
bad = 0
try:
    for name, edits in MUTANTS:
        texts = dict(orig)
        ok = True
        for f, a, b in edits:
            if texts[f].count(a) != 1:
                print("NOT-APPLIED %s (anchor count %d in %s)" % (name, texts[f].count(a), f))
                ok = False
                break
            texts[f] = texts[f].replace(a, b)
        if not ok:
            bad += 1
            continue
        for f in files:
            if texts[f] != orig[f]:
                open(f, "w", encoding="utf-8", newline="").write(texts[f])
        p = subprocess.run([sys.executable, T], capture_output=True, text=True, timeout=900)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if "FAIL" in l]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-40s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        for f in files:
            open(f, "w", encoding="utf-8", newline="").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8", newline="").write(t)
sys.exit(1 if bad else 0)
