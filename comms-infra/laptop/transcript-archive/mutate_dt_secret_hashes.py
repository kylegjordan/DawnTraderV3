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
        '[dict(_hashed(name, value, source, key), reachable=False, reason="under 12 characters")]')),
    ("separator value hashed whole anyway", replace(
        '[{"name": name, "reachable": False, "reason": reason, "source": source}]',
        '[dict(_hashed(name, value, source, key), reachable=False, reason=reason)]')),
    ("separator values: parts not hashed", replace("    parts = PART.findall(value)", "    parts = []")),
    ("separator values: parts given a lower floor", replace("PART = re.compile(REACHABLE.pattern[:-2])",
                                                           "PART = re.compile(REACHABLE.pattern[:-6] + '{4,}')")),
    ("separator values: part named as the whole", replace('_hashed("%s#%d" % (name, i), p, source, key)',
                                                         '_hashed(name, p, source, key)')),
    # F1 — the key
    ("F1: plain SHA-256 instead of the HMAC", replace(
        '"hmac": hmac.new(key, v.encode("utf-8"), hashlib.sha256).hexdigest()',
        '"hmac": hashlib.sha256(v.encode("utf-8")).hexdigest()')),
    ("F1: key_id omitted", replace('            "key_id": key_id(key), "source": source}', '            "source": source}')),
    ("F1: no key falls back to a fixed one", replace(
        '    if key is None:\n        sys.stderr.write("REFUSED: no usable key', '    if key is None:\n        key = bytes(32)\n    if False:\n        sys.stderr.write("REFUSED: no usable key')),
    ("F1: a short key accepted", replace("    return k if len(k) >= 32 else None", "    return k if k else None")),
    ("F1: RUN_KEY_HEX ignored", replace("            key = bytes.fromhex(RUN_KEY_HEX) if RUN_KEY_HEX else None",
                                        "            key = None")),
    # F2 — the inline-comment cut is said
    ("F2: no note on the cut reading", replace('                    e["note"] = "inline comment stripped; the uncut reading is also listed"',
                                               '                    pass')),
    ("F2: the uncut reading not listed", replace(
        '                got += [dict(e, note="read WITHOUT the inline-comment strip (systemd files have none)")',
        '                got += [] and [dict(e, note="read WITHOUT the inline-comment strip (systemd files have none)")')),
    ("F2: the cut never reported", replace("            if cut != v:\n                unstripped = v", "            if False:\n                unstripped = v")),
    # r2 findings
    ("r2 f2: a comment-only value is a value again", replace(
        '            cut = "" if v.startswith("#") else v.split(" #", 1)[0].strip()',
        '            cut = v.split(" #", 1)[0].strip()')),
    ("r2 f3: the uncut reading re-lists the cut value", replace(
        '                        if "hmac" not in e or (e["length"], e["hmac"]) not in seen]',
        '                        if True]')),
    ("r2 (a): an unknown argument is echoed", replace(
        '"REFUSED: unknown argument at position %d (%d characters)\\n" % (argv.index(a) + 1, len(a))',
        '"REFUSED: unknown argument %r at position %d (%d characters)\\n" % (a, argv.index(a) + 1, len(a))')),
    # F3 — empty is not found
    ("F3: empty value counted as found", replace('            if v == "":', '            if False:')),
    ("--json missing key skipped", replace(
        '                sys.stderr.write("REFUSED: %s has no key %s\\n" % (path, keypath))\n                return 4',
        '                break')),
    ("--json non-string accepted", replace("        if not isinstance(v, str):", "        if False:")),
    ("--json malformed spec accepted", replace("        if not sep or not n or not colon or not path or not keypath:",
                                               "        if False:")),
    ("--json unreadable file skipped", replace(
        '            sys.stderr.write("REFUSED: cannot read %s as JSON (%s)\\n" % (path, type(e).__name__))\n            return 4',
        '            continue')),
    ("--names filter off", replace("            if n not in names:\n                continue", "            if False:\n                continue")),
    ("missing names not refused", replace("    if missing:", "    if False:")),
    ("unreadable env file skipped, not refused", replace(
        '            sys.stderr.write("REFUSED: cannot read %s (%s)\\n" % (path, type(e).__name__))\n'
        '            return 4\n        for n, v, unstripped in parse_env(text):',
        '            continue\n        for n, v, unstripped in parse_env(text):')),
    ("unreadable key file skipped, not refused", replace(
        '            sys.stderr.write("REFUSED: cannot read %s (%s)\\n" % (path, type(e).__name__))\n'
        '            return 4\n        if v.endswith',
        '            continue\n        if v.endswith')),
    ("quotes kept", replace('            v = v[1:-1]', '            v = v')),
    ("inline comment kept", replace('            cut = "" if v.startswith("#") else v.split(" #", 1)[0].strip()',
                                      '            cut = "" if v.startswith("#") else v.strip()')),
    ("export prefix not understood", replace(r'(?:export\s+)?', '')),
    ("key-file newline kept", replace('        if v.endswith("\\n"):', '        if False:')),
    ("malformed --file accepted", replace("        if not sep or not n or not path:", "        if False:")),
    ("--env without --names allowed", replace("    if envs and not names:", "    if False:")),
    ("unknown argument ignored", replace(
        '                sys.stderr.write("REFUSED: unknown argument at position %d (%d characters)' + chr(92) + 'n" % (argv.index(a) + 1, len(a)))' + chr(10) + '                return 2',
        '                continue')),
    ("value echoed in the summary", replace(
        '    reach = sum(1 for e in out if "hmac" in e)',
        '    reach = sum(1 for e in out if "hmac" in e)\n    sys.stderr.write(repr(text) + "\\n") if envs else None')),
    ("key echoed in the summary", replace(
        '    reach = sum(1 for e in out if "hmac" in e)',
        '    reach = sum(1 for e in out if "hmac" in e)\n    sys.stderr.write(key.hex() + "\\n")')),
]

COPIED = ("test_dt_secret_hashes.py", "dt_transcript.py")   # everything the suite imports besides the module under test


def suite(src):
    """Run the suite against `src` in a scratch copy of EXACTLY the layout every mutant gets. Returns (rc, failed-line)."""
    d = tempfile.mkdtemp(prefix="dt-hmut-")
    try:
        open(os.path.join(d, "dt_secret_hashes.py"), "w", encoding="utf-8").write(src)
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_secret_hashes.py")], capture_output=True, cwd=d)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


# CONTROL: the UNMUTATED producer must pass in the same layout, or every mutant "is caught" by a broken harness
# (the redactor's runner counted 37 import crashes as 37 catches, 2026-11-06).
rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated producer does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
    sys.exit(2)
caught = crashed = 0
for name, mut in MUTATIONS:
    try:
        m = mut(SRC)
    except AssertionError as e:
        print("ERROR  %s: %s" % (name, e)); continue
    if m == SRC:
        print("ERROR  %s: the mutation changed nothing" % name); continue
    rc, line = suite(m)
    if rc == 0:
        verdict = "SURVIVED"
    elif line is None:
        verdict, crashed = "crashed", crashed + 1     # detected, but by a crash, not by an assertion: said apart
    else:
        verdict = "caught"
    caught += rc != 0
    print("%-8s %s" % (verdict, name))
print("\n%d/%d caught (%d of them by a crash rather than an assertion)" % (caught, len(MUTATIONS), crashed))
# A CRASH IS NOT A CATCH for the gate (Langston r2 nit): it is printed apart, and it fails the run.
sys.exit(0 if caught == len(MUTATIONS) and crashed == 0 else 1)
