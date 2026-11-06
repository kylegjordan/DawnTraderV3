#!/usr/bin/env python3
"""Mutation runner for dt_secret_hashes (B-TRANSCRIPT-ARCHIVE P3(c)). Each mutation breaks ONE rule in a TEMP copy of
the producer (never the file in the repo), runs test_dt_secret_hashes.py against it, and must make that suite FAIL —
judged by the suite's EXIT CODE, never by grepping its output. Exit 0 = every mutation caught."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_secret_hashes.py"), encoding="utf-8").read()


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:50], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("contract unanchored", replace(r'{12,}\Z")', r'{12,}")')),
    ("short value hashed anyway", replace(
        '[{"name": name, "reachable": False, "reason": "under 12 characters", "source": source}]',
        '[dict(_hashed(name, value, source), reachable=False, reason="under 12 characters")]')),
    ("separator value hashed whole anyway", replace(
        '[{"name": name, "reachable": False, "reason": reason, "source": source}]',
        '[dict(_hashed(name, value, source), reachable=False, reason=reason)]')),
    ("separator values: parts not hashed", replace("    parts = PART.findall(value)", "    parts = []")),
    ("separator values: parts given a lower floor", replace("PART = re.compile(REACHABLE.pattern[:-2])",
                                                           "PART = re.compile(REACHABLE.pattern[:-6] + '{4,}')")),
    ("separator values: part named as the whole", replace('_hashed("%s#%d" % (name, i), p, source)', '_hashed(name, p, source)')),
    ("--json missing key skipped", replace(
        '                sys.stderr.write("REFUSED: %s has no key %s\\n" % (path, keypath))\n                return 4',
        '                break')),
    ("--json non-string accepted", replace("        if not isinstance(v, str):", "        if False:")),
    ("--json malformed spec accepted", replace("        if not sep or not n or not colon or not path or not keypath:",
                                               "        if False:")),
    ("--json unreadable file skipped", replace(
        '            sys.stderr.write("REFUSED: cannot read %s as JSON (%s)\\n" % (path, type(e).__name__))\n            return 4',
        '            continue')),
    ("--names filter off", replace("            if n in names:", "            if True:")),
    ("missing names not refused", replace("    if missing:", "    if False:")),
    ("unreadable env file skipped, not refused", replace(
        '            sys.stderr.write("REFUSED: cannot read %s (%s)\\n" % (path, type(e).__name__))\n'
        '            return 4\n        for n, v in parse_env(text):',
        '            continue\n        for n, v in parse_env(text):')),
    ("unreadable key file skipped, not refused", replace(
        '            sys.stderr.write("REFUSED: cannot read %s (%s)\\n" % (path, type(e).__name__))\n'
        '            return 4\n        if v.endswith',
        '            continue\n        if v.endswith')),
    ("quotes kept", replace('            v = v[1:-1]', '            v = v')),
    ("inline comment kept", replace('            v = v.split(" #", 1)[0].strip()', '            v = v.strip()')),
    ("export prefix not understood", replace(r'(?:export\s+)?', '')),
    ("key-file newline kept", replace('        if v.endswith("\\n"):', '        if False:')),
    ("malformed --file accepted", replace("        if not sep or not n or not path:", "        if False:")),
    ("--env without --names allowed", replace("    if envs and not names:", "    if False:")),
    ("unknown argument ignored", replace(
        '                sys.stderr.write("REFUSED: unknown argument %r\\n" % a)\n                return 2',
        '                continue')),
    ("value echoed in the summary", replace(
        '    reach = sum(1 for e in out if "sha256" in e)',
        '    reach = sum(1 for e in out if "sha256" in e)\n    sys.stderr.write(repr(text) + "\\n") if envs else None')),
]

caught = 0
for name, mut in MUTATIONS:
    d = tempfile.mkdtemp(prefix="dt-hmut-")
    try:
        try:
            m = mut(SRC)
        except AssertionError as e:
            print("ERROR  %s: %s" % (name, e)); continue
        if m == SRC:
            print("ERROR  %s: the mutation changed nothing" % name); continue
        open(os.path.join(d, "dt_secret_hashes.py"), "w", encoding="utf-8").write(m)
        for f in ("test_dt_secret_hashes.py", "dt_transcript.py"):
            shutil.copy(os.path.join(HERE, f), d)
        rc = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_secret_hashes.py")],
                            capture_output=True, cwd=d).returncode
        verdict = "caught" if rc != 0 else "SURVIVED"
        caught += rc != 0
        print("%-8s %s" % (verdict, name))
    finally:
        shutil.rmtree(d, ignore_errors=True)
print("\n%d/%d caught" % (caught, len(MUTATIONS)))
sys.exit(0 if caught == len(MUTATIONS) else 1)
