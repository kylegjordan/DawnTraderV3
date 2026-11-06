#!/usr/bin/env python3
"""Mutation runner for dt_archive (B-TRANSCRIPT-ARCHIVE P5). Each mutation breaks ONE guarantee in a TEMP copy of the
writer, runs test_dt_archive.py against it, and must make it FAIL - by EXIT CODE and with its own "<n> failed" line.
CONTROL FIRST: the unmutated writer in the same scratch layout must print "0 failed", or the run stops (HARNESS
BROKEN). A mutant detected only by a crash is printed apart AND fails the run (Langston P3(c) r2 nit)."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_archive.py"), encoding="utf-8").read()
COPIED = ("test_dt_archive.py", "dt_transcript.py")


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("MF1: state keyed on the path as spelled", replace('    return os.path.join(root, ".state", alias, k + ".json")',
                                                       '    return os.path.join(root, ".state", alias, hashlib.sha256(rf[2].encode("utf-8")).hexdigest()[:12] + "_" + k + ".json")')),
    ("MF1: identity not normalised", replace("    return os.path.normcase(os.path.realpath(os.path.abspath(path)))", "    return path")),
    ("MF2: a dry run cuts the uncommitted tail", replace("            if not dry:\n                with open(p, \"r+b\") as fh:", "            if True:\n                with open(p, \"r+b\") as fh:")),
    ("MF2: a dry run does not report what it would cut", replace('"held": len(keep), "would_cut": would_cut}', '"held": len(keep)}')),
    ("MF3: a flag with no value accepted", replace('            if v is None or v.startswith("--"):', '            if False:')),
    ("MF4: UTC read as local time", replace("        return calendar.timegm(time.strptime(str(ts)[:19], \"%Y-%m-%dT%H:%M:%S\"))",
                                            "        return time.mktime(time.strptime(str(ts)[:19], \"%Y-%m-%dT%H:%M:%S\"))")),
    ("MF4: an unreadable stamp releases at once", replace("    except (ValueError, TypeError):\n        return None", "    except (ValueError, TypeError):\n        return 0.0")),
    ("undated header cut from the filename", replace("                chunk += header(rf, day_of.get(rel, \"undated\"))",
                                                     "                chunk += header(rf, rel.split(os.sep)[-1][:10])")),
    ("a dry run takes the lock", replace("    if not dry:          # a dry run writes NOTHING", "    if True:          # a dry run writes NOTHING")),
    ("a dead nested link written as if it resolved", replace("        if (alias, m.group(1), m.group(2)) in nested:", "        if True:")),
    ("every nested link called missing", replace('    nested = frozenset((rf[0], rf[4][:8], rf[5]) for rf in rfs if rf[1] == "sub")', "    nested = frozenset()")),
    ("C-5 injectivity not checked", replace("    check_injective(rfs)                    # BEFORE any write (C-5)\n", "")),
    ("recovery does not cut back", replace("            if not dry:\n                with open(p, \"r+b\") as fh:\n                    fh.truncate(n)", "            pass")),
    ("no intent commit before writing", replace("        write_state(sp, st)\n        for rel, items in sorted(by_file.items()):",
                                                "        for rel, items in sorted(by_file.items()):")),
    ("a shorter archive file repaired silently", replace(
        '            raise Refused("%s is %d bytes, shorter than its committed %d - something else changed it; not repairing" % (p, size, n))',
        '            continue')),
    ("ids from earlier runs not skipped", replace("            if uid in done or (uid, line) in seen_run:", "            if (uid, line) in seen_run:")),
    ("a uuid repeated in one run written twice", replace("            if uid in done or (uid, line) in seen_run:", "            if uid in done:")),
    ("a half-written line consumed", replace("    end = data.rfind(b\"\\n\")", "    data = data + b\"\\n\"\n    end = len(data) - 1")),
    ("the lock not honoured", replace('    except FileExistsError:\n        raise Refused(', '    except FileExistsError:\n        return\n        raise Refused(')),
    ("a held notice written at once", replace("            if quiet or (a is not None and b is not None and a - b >= HOLD_S):", "            if True:")),
    ("a held notice never released", replace("            if quiet or (a is not None and b is not None and a - b >= HOLD_S):", "            if False:")),
    ("a later delivery does not cancel", replace("            if left.get(h[\"key\"], 0) > 0:", "            if False:")),
    ("the state line repeated every run", replace("            if st[\"layer_c\"].get(rel) != state_line:", "            if True:")),
    ("the state line written only once ever", replace("            if st[\"layer_c\"].get(rel) != state_line:", "            if rel not in st[\"layer_c\"]:")),
    ("CRLF written", replace('                fh.write(chunk.encode("utf-8"))', '                fh.write(chunk.replace("\\n", "\\r\\n").encode("utf-8"))')),
    ("dry run writes", replace("        if dry:\n            return", "        if False:\n            return")),
    ("folders outside the five read", replace("        if not os.path.isdir(base):\n            continue",
                                              "        if not os.path.isdir(base):\n            continue\n    for slug in sorted(os.listdir(projects)):\n        alias, base = SLUG_ALIAS.get(slug, 'X'), os.path.join(projects, slug)\n        if not os.path.isdir(base):\n            continue")),
    ("the raw text kept in the state", replace(
        '                held.append({"id": uid, "ts": ts, "key": ledger["queued_key"][uid], "line": line, "order": list(order)})',
        '                held.append({"id": uid, "ts": ts, "key": ledger["queued_key"][uid], "line": line, "order": list(order), "raw": lines})')),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-amut-")
    try:
        open(os.path.join(d, "dt_archive.py"), "w", encoding="utf-8").write(src)
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_archive.py")], capture_output=True, cwd=d,
                           timeout=600)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated writer does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
