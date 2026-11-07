#!/usr/bin/env python3
"""Mutation runner for dt_index + dt_recall (B-TRANSCRIPT-ARCHIVE P6). Each mutation breaks ONE rule in a TEMP copy of
one module, runs test_dt_index_recall.py against it, and must make it FAIL - by EXIT CODE with its own "<n> failed"
line. CONTROL FIRST in the same scratch layout; a crash is printed apart AND fails the run."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
MODS = ("dt_index.py", "dt_recall.py")
SRC = {m: open(os.path.join(HERE, m), encoding="utf-8").read() for m in MODS}
COPIED = ("test_dt_index_recall.py", "dt_archive.py", "dt_transcript.py")


def mut(mod, a, b):
    def f():
        s = SRC[mod]
        assert s.count(a) == 1, "anchor not unique in %s: %r (%d)" % (mod, a[:60], s.count(a))
        return {mod: s.replace(a, b)}
    return f


MUTATIONS = [
    ("index: the topic goes into the shared copy", mut("dt_index.py", "    lean += index_lines(convs, False)", "    lean += index_lines(convs, True)")),
    ("index: the cap is not enforced", mut("dt_index.py", "    if size > MEMORY_CAP:", "    if False:")),
    ("index: a wake notice can be the topic", mut("dt_index.py", 'USER = re.compile(r"^\\*\\*\\[(\\d\\d:\\d\\d:\\d\\d)\\] User:\\*\\* (.*)$")',
                                                  'USER = re.compile(r"^\\*\\*\\[(\\d\\d:\\d\\d:\\d\\d)\\] (?:User|Wake)[^*]*\\*\\* (.*)$")')),
    ("index: nested transcripts not counted", mut("dt_index.py", '                    convs[(alias, parent8)]["nested"] = n', "                    pass")),
    ("index: batches alphabetical, not most mentioned", mut("dt_index.py",
        '    b = ", ".join(x for x, _n in c["batches"].most_common(TOP_BATCHES))',
        '    b = ", ".join(sorted(c["batches"])[:TOP_BATCHES])')),
    ("index: an action's line number off by one", mut("dt_index.py",
        '                    actions.append((alias, day, a.group(1), sid8, "%s:%d" % (rel, i), a.group(2), a.group(3)))',
        '                    actions.append((alias, day, a.group(1), sid8, "%s:%d" % (rel, i + 1), a.group(2), a.group(3)))')),
    ("index: the session id stays 8 characters", mut("dt_index.py", '                if h and len(h.group(3)) > len(c["sid"]):', "                if False:")),
    ("index: nested actions left out", mut("dt_index.py",
        '                            actions.append((alias, "", a.group(1), parent8, "%s:%d" % (rel, i), a.group(2), a.group(3)))',
        "                            pass")),
    ("recall: no footer when nothing is found", mut("dt_recall.py", '    print("%d hit(s)%s" % (len(hits), FOOTER))',
                                                    '    print("%d hit(s)%s" % (len(hits), FOOTER if hits else ""))')),
    ("recall: ANY word instead of every word", mut("dt_recall.py", "            if all(w in l.lower() for w in ws):",
                                                   "            if any(w in l.lower() for w in ws):")),
    ("recall: --alias ignored", mut("dt_recall.py", "        if a.startswith(\".\") or not os.path.isdir(adir) or (alias and a != alias):",
                                    "        if a.startswith(\".\") or not os.path.isdir(adir):")),
    ("recall: --since ignored", mut("dt_recall.py", "            if m and (not since or m.group(1) >= since):", "            if m:")),
    ("recall: --batch ignored", mut("dt_recall.py", "    if batch:\n        keep = set()", "    if False:\n        keep = set()")),
    ("recall: --actions searches the text instead", mut("dt_recall.py", "    if actions:\n        tsv", "    if False:\n        tsv")),
    ("recall: exit 0 with no hits", mut("dt_recall.py", "    return 0 if hits else 1", "    return 0")),
    ("recall: unknown arguments accepted", mut("dt_recall.py",
        '            sys.stderr.write("REFUSED: unknown argument at position %d\\n" % argv.index(a))\n            return 2',
        "            continue")),
    ("recall: CRLF on stdout", mut("dt_recall.py", '        sys.stdout.reconfigure(encoding="utf-8", newline="\\n")',
                                   '        sys.stdout.reconfigure(encoding="utf-8")')),
    ("index: the coverage bound left out of the shared copy", mut("dt_index.py",
        '            "file is mirrored into git (Kyle, KD-49).", "",\n            COVERAGE, ""]',
        '            "file is mirrored into git (Kyle, KD-49).", ""]')),
    ("index: a folder on no list NAMED in the git-mirrored copy", mut("dt_index.py",
        '        lean += ["%d folder(s) on no list hold conversations; their names are in the laptop\'s own index only." % len(unlisted), ""]',
        '        lean += ["%d folder(s) on no list: %s" % (len(unlisted), ", ".join(unlisted)), ""]')),
    ("index: a folder on no list left out of the laptop index", mut("dt_index.py",
        '    if unlisted:' + chr(10) + '        full += ["Folders on no list', '    if False:' + chr(10) + '        full += ["Folders on no list')),
    # Langston P6 review, must-fixes 1-4
    ("recall: a flag's missing value accepted", mut("dt_recall.py",
        '            if v is None or v.startswith("--") or not v.strip():', '            if v is None:')),
    ("recall: an empty query reaches the search", mut("dt_recall.py", "    if not words.strip():", "    if False:")),
    ("recall: --since keeps nested transcripts in the text arm", mut("dt_recall.py",
        "                        if since:" + chr(10) + "                            if skipped is not None:",
        "                        if False:" + chr(10) + "                            if skipped is not None:")),
    ("recall: --since keeps undated action rows", mut("dt_recall.py", "            if since and not f[1]:", "            if False:")),
    ("recall: --since does not say what it left out", mut("dt_recall.py", '    if opts.get("--since"):' + chr(10) + "        print(",
                                                          "    if False:" + chr(10) + "        print(")),
    ("recall: a stray file in sub/ walked as a folder", mut("dt_recall.py", "                if not os.path.isdir(pdir):", "                if False:")),
    ("recall: a failed search wears the no-hits code", mut("dt_recall.py", "        return 3", "        return 1")),
]


def suite(override):
    d = tempfile.mkdtemp(prefix="dt-imut-")
    try:
        for m in MODS:
            open(os.path.join(d, m), "w", encoding="utf-8").write(override.get(m, SRC[m]))
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_index_recall.py")], capture_output=True, cwd=d,
                           timeout=600)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite({})
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated modules do not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
    sys.exit(2)
caught = crashed = 0
for name, mk in MUTATIONS:
    try:
        override = mk()
    except AssertionError as e:
        print("ERROR    %s: %s" % (name, e)); continue
    rc, line = suite(override)
    verdict = "SURVIVED" if rc == 0 else ("crashed" if line is None else "caught")
    crashed += verdict == "crashed"
    caught += rc != 0
    print("%-8s %s" % (verdict, name))
print("\n%d/%d caught (%d of them by a crash rather than an assertion)" % (caught, len(MUTATIONS), crashed))
sys.exit(0 if caught == len(MUTATIONS) and crashed == 0 else 1)
