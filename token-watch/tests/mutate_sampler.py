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
       [('                data = data[os.write(self.fd, data):]',
         '                self.__dict__.setdefault("buf", []).append(data); data = b""'),
        ('            if _final:' + NL + '                os.close(self.fd)',
         '            if _final:' + NL + '                os.write(self.fd, b"".join(self.__dict__.get("buf", [])))' + NL + '                os.close(self.fd)')]),
      ("loop marker dropped",
     [('                if count % 1000 == 0:' + NL + '                    sampler.mark("loop", entries=count)', '                pass')]),
    ("dead-set marker dropped",
     [('        mwrap(summary, "tombstone_path", after=False)', '        pass')]),
    ("C-2 the sample thread never starts",
     [('        self.thread.start()', '        pass')]),
    ("C-1 the pruned dict is not re-pointed (pre-prune dict pinned)",
     [('            if name == "last_seen":' + NL + '                held["prev"] = value', '            pass')]),
    ("C-3 an existing sample file is appended to",
     [('        if os.path.lexists(a.sample):', '        if False:')]),
    ("FOLD-2 a timed-out join reads as stopped",
     [('        joined = self.thread.ident is None or not self.thread.is_alive()', '        joined = True')]),
    ("FOLD-2 writes after close are not dropped",
     [('            if self.closed:', '            if False:')]),
    ("FINDING-2 end does not close the file in the same lock hold",
     [('                self.closed = True                      # so no sampler write can land after it (Langston FINDING-2)',
       '                pass')]),
    ("A-3 len_prev probe dropped",
     [('        sampler.probes["len_prev"] = ', '        _unused = ')]),
]
bad = 0
try:
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
finally:
  open(TOOL, "w", encoding="utf-8").write(orig)
sys.exit(1 if bad else 0)
