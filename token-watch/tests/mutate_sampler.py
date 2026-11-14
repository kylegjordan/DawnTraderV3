#!/usr/bin/env python3
"""P2a sampler mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY). Run from token-watch/ on a scratch COPY of the tree (it edits
tools/measure_followup_memory.py in place and restores it): python3 tests/mutate_sampler.py - exit 0 = every mutant
killed by a FAIL line with a non-zero exit (a crash with no FAIL line counts as survived)."""
import shutil, subprocess, sys
TOOL = "tools/measure_followup_memory.py"
src = open(TOOL, encoding="utf-8").read()
orig = src
NL = chr(10)
MUTS = [
    ("held until close (no per-line write)",
     [('            os.write(self.fd, (json.dumps(rec, sort_keys=True, default=str) + "\\n").encode("utf-8"))',
       '            self.__dict__.setdefault("buf", []).append((json.dumps(rec, sort_keys=True, default=str) + "\\n").encode("utf-8"))'),
      ('        os.close(self.fd)',
       '        os.write(self.fd, b"".join(self.__dict__.get("buf", [])))' + NL + '        os.close(self.fd)')]),
    ("loop marker dropped",
     [('                if n % 1000 == 0:' + NL + '                    sampler.mark("loop", entries=n)', '                pass')]),
    ("dead-set marker dropped",
     [('        mwrap(summary, "tombstone_path", after=False)', '        pass')]),
    ("A-3 len_prev probe dropped",
     [('        sampler.probes["len_prev"] = ', '        _unused = ')]),
]
bad = 0
for name, pairs in MUTS:
    m = orig
    for a, b in pairs:
        if m.count(a) != 1:
            print("NOT-APPLIED", name, a[:60]); bad += 1; break
        m = m.replace(a, b)
    else:
        open(TOOL, "w", encoding="utf-8").write(m)
        p = subprocess.run([sys.executable, "tests/test_measure_followup_memory.py"], capture_output=True, text=True,
                           timeout=1200)
        fails = [l[:110] for l in p.stdout.splitlines() if l.startswith("FAIL")]
        crashed = "Traceback" in p.stdout + p.stderr and not fails
        print(("KILLED  " if p.returncode and fails else "SURVIVED"), name, "rc=%d" % p.returncode, fails[:2],
              "CRASH" if crashed else "")
        bad += not (p.returncode and fails)
open(TOOL, "w", encoding="utf-8").write(orig)
sys.exit(1 if bad else 0)
