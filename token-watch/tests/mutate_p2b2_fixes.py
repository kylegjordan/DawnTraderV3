#!/usr/bin/env python3
"""P2b-2 mutants (B-TOKEN-WATCH-FOLLOWUP-MEMORY). Run from token-watch/ on a scratch COPY of the tree (it edits the source
files in place and restores them in `finally`):
    python3 tests/mutate_p2b2_fixes.py
exit 0 = every mutant killed: its test file exits non-zero WITH a FAIL line. A mutant whose anchor does not match exactly
once is NOT-APPLIED and counts as a failure; a crash with no FAIL line counts as survived (judged by exit code AND a
FAIL line, never by grepping alone)."""
import subprocess, sys

NL = chr(10)
T2 = "tests/test_p2b2_memory_fixes.py"
TM = "tests/test_measure_followup_memory.py"
# (name, test file, [(file, anchor, replacement), ...])
MUTANTS = [
    ("F-d1 the lookup ignores the wanted set", T2,
     [("store.py", "        if m in want:" + NL + "            out[m] = {", "        if m:" + NL + "            out[m] = {")]),
    ("F-d1 the FIRST write wins", T2,
     [("store.py", "        if m in want:" + NL + "            out[m] = {\"name\": r.get(\"name\"), \"symbol\": r.get(\"symbol\")}",
       "        if m in want:" + NL + "            out.setdefault(m, {\"name\": r.get(\"name\"), \"symbol\": r.get(\"symbol\")})")]),
    ("F-d1 _enrich asks for more than its rows", T2,
     [("summary.py", "    ids = _identity_for({r[\"mint\"] for r in rows})",
       "    ids = _identity_for({r[\"mint\"] for r in rows} | {\"EXTRA\"})")]),
    ("C-1 ties reversed (position negated)", T2,
     [("summary.py", "            key = (r.get(\"created_at\") or \"\", pos)", "            key = (r.get(\"created_at\") or \"\", -pos)")]),
    ("C-1 the key has no position (unresolved compared on created_at alone)", T2,
     [("summary.py", "            key = (r.get(\"created_at\") or \"\", pos)", "            key = (r.get(\"created_at\") or \"\",)")]),
    ("C-1 the unresolved count ignores the last-row bound", T2,
     [("summary.py", "            _unresolved += sum(1 for k in file_unresolved if k < last)",
       "            _unresolved += len(file_unresolved)")]),
    ("C-1(b) no stop when the limit is met", T2,
     [("summary.py", "        need = limit - len(out)" + NL + "        if need <= 0:" + NL + "            break" + NL,
       "        need = limit - len(out)" + NL)]),
    ("C-2 a bad line escapes the walk", T2,
     [("summary.py", "        except (OSError, ValueError):" + NL + "            continue" + NL + "        if len(best) == need:",
       "        except (OSError,):" + NL + "            continue" + NL + "        if len(best) == need:")]),
    ("C-2 a failed file's partial unresolved count is merged", T2,
     [("summary.py", "        except (OSError, ValueError):" + NL + "            continue" + NL + "        if len(best) == need:",
       "        except (OSError, ValueError):" + NL + "            _unresolved += len(file_unresolved)" + NL +
       "            continue" + NL + "        if len(best) == need:")]),
    ("F-e prev is not released", T2,
     [("follow_up.py", "        del prev" + NL, "        pass" + NL)]),
    ("F-f a trailing blank line is not added to the previous row", T2,
     [("promote.py", "                        if held is not None:" + NL + "                            held[1] += nbytes",
       "                        if held is not None:" + NL + "                            pass")]),
    ("F-f a row still being written is consumed", T2,
     [("promote.py", "                if not phys.endswith(\"\\n\"):" + NL + "                    break",
       "                if False:" + NL + "                    break")]),
    ("F-f no splitlines inside a physical line", T2,
     [("promote.py", "                for line in phys.splitlines(keepends=True):", "                for line in [phys]:")]),
    ("F-f the cursor drops the base", T2,
     [("promote.py", "        cursors[name] = new.base + consumed", "        cursors[name] = consumed")]),
    ("item 1: a non-object line is yielded as a row", T2,
     [("promote.py", "                        if not isinstance(row, dict):", "                        if row is None:")]),
    ("item 1: the skip count is not published", T2,
     [("promote.py", "            stats[\"skipped_lines\"] += new.skipped", "            pass")]),
    ("harness: every open is marked (appends too)", TM,
     [("tools/measure_followup_memory.py", "            if any(c in mode for c in \"awx+\"):", "            if False:")]),
    ("harness: the loaded prev stays held past the save", TM,
     [("tools/measure_followup_memory.py", "                held.pop(\"prev\", None)" + NL, "")]),
    ("harness: marks do not carry ru_maxrss", TM,
     [("tools/measure_followup_memory.py", "\"allocated_blocks\": sys.getallocatedblocks(), \"ru_maxrss_kib\": _maxrss_kib()}",
       "\"allocated_blocks\": sys.getallocatedblocks()}")]),
    ("harness: PSI is not parsed", TM,
     [("tools/measure_followup_memory.py", "                if k == \"total\" and kind in (\"some\", \"full\") and v.isdigit():",
       "                if False:")]),
]

files = sorted({f for _n, _t, edits in MUTANTS for f, _a, _b in edits})
orig = {f: open(f, encoding="utf-8").read() for f in files}
bad = 0
try:
    for name, test, edits in MUTANTS:
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
        p = subprocess.run([sys.executable, test], capture_output=True, text=True, timeout=1800)
        fails = [l.strip()[:110] for l in p.stdout.splitlines() if l.strip().startswith("FAIL")]
        killed = p.returncode != 0 and bool(fails)
        print(("KILLED  " if killed else "SURVIVED") + " %-62s rc=%d %s" % (name, p.returncode, fails[:1]))
        bad += not killed
        for f in files:
            open(f, "w", encoding="utf-8", newline="").write(orig[f])
finally:
    for f, t in orig.items():
        open(f, "w", encoding="utf-8", newline="").write(t)
sys.exit(1 if bad else 0)
