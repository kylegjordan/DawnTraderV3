#!/usr/bin/env python3
"""P2b-1 mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY). Run from token-watch/ on a scratch COPY of the tree (it edits
store.py / summary.py / follow_up.py in place and restores them in `finally`):
    python3 tests/mutate_p2b_fixes.py
exit 0 = every mutant killed by a FAIL line with a non-zero exit of tests/test_p2b_memory_fixes.py. A mutant whose
anchor does not match exactly once is NOT-APPLIED and counts as a failure; a crash with no FAIL line counts as survived."""
import subprocess, sys

NL = chr(10)
MUTANTS = [
    ("F-b bisect lower bound wrong", "store.py",
     "            if buf[mid * _STRIDE:(mid + 1) * _STRIDE] < k:", "            if buf[mid * _STRIDE:(mid + 1) * _STRIDE] <= k:"),
    ("F-b duplicates not removed", "store.py", "            if k != last:", "            if True:"),
    ("F-b a non-stride mint is dropped", "store.py",
     "                if isinstance(m, str) and m:" + NL + "                    ds._extra.add(m)",
     "                if isinstance(m, str) and m:" + NL + "                    pass"),
    ("F-b an in-run death is not added in place", "store.py",
     "        if mint not in self:" + NL + "            self._extra.add(mint)",
     "        if mint not in self:" + NL + "            pass"),
    ("R4 a bad tombstone line raises", "store.py",
     "            except ValueError:" + NL + "                bad += 1" + NL + "                continue",
     "            except ValueError:" + NL + "                raise"),
    ("R3 an unreadable tombstone reads as nothing dead", "summary.py",
     "        dead = None" + NL + "        dead_note = \"survivor table withheld",
     "        dead = dead_set.__class__() if False else set()" + NL + "        dead_note = \"survivor table withheld"),
    ("R4 the unresolved count has no reader", "summary.py",
     "    return _enrich(out), _unresolved" + NL + NL, "    return _enrich(out), 0" + NL + NL),
    ("R5 within a file the FIRST match wins", "store.py",
     "                        hit[m] = r                     # a later line replaces an earlier one: positional newest",
     "                        hit.setdefault(m, r)"),
    ("R5 the file boundary is dropped (an older file can overwrite)", "store.py",
     "        want.difference_update(hit)", "        pass"),
    ("R5 a file with a bad line contributes its partial rows", "store.py",
     "        except (OSError, ValueError):" + NL + "            continue" + NL + "        found.update(hit)",
     "        except (OSError, ValueError):" + NL + "            pass" + NL + "        found.update(hit)"),
    ("item: the fold calls .get on a non-object line", "budget.py",
     "            if not isinstance(rec, dict):" + NL + "                bad_lines += 1",
     "            if False:" + NL + "                bad_lines += 1"),
    ("item: liveness parses a non-object line with .get", "liveness.py",
     "    if not isinstance(rec, dict):          # valid JSON that is not a row",
     "    if False:          # valid JSON that is not a row"),
    ("fold-in 1: _read_new returns a non-object line", "summary.py",
     "        if not isinstance(r, dict):" + NL + "            _READ_NEW_SKIPPED[\"lines\"] += 1" + NL + "            continue" + NL + "        rows.append(r)",
     "        rows.append(r)"),
    ("fold-in 2: the bad-line count is last-build, not monotone", "store.py",
     "    _DEAD_STATUS[\"bad_lines\"] = max(_DEAD_STATUS[\"bad_lines\"], bad)",
     "    _DEAD_STATUS[\"bad_lines\"] = bad"),
    ("R4 a bad tombstone line is not a run error", "follow_up.py",
     "            stats[\"errors\"] += 1" + NL + "        for entry in _entries_across(buckets):",
     "            pass" + NL + "        for entry in _entries_across(buckets):"),
]

orig = {f: open(f, encoding="utf-8").read() for f in ("store.py", "summary.py", "follow_up.py", "budget.py",
                                                    "liveness.py")}
bad = 0
try:
    for name, f, a, b in MUTANTS:
        if orig[f].count(a) != 1:
            print("NOT-APPLIED %s (anchor count %d)" % (name, orig[f].count(a)))
            bad += 1
            continue
        open(f, "w", encoding="utf-8").write(orig[f].replace(a, b))
        p = subprocess.run([sys.executable, "tests/test_p2b_memory_fixes.py"], capture_output=True, text=True, timeout=900)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-55s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        open(f, "w", encoding="utf-8").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8").write(t)
sys.exit(1 if bad else 0)
