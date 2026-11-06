#!/usr/bin/env python3
"""Mutation runner for dt_transcript (B-TRANSCRIPT-ARCHIVE P3, C-3). Each mutation breaks ONE rule in a TEMP copy of
the module (never the file in the repo), runs the test suite against it, and must make the suite FAIL — judged by the
suite's EXIT CODE, never by grepping its output. Exit 0 = every mutation caught."""
import os
import re
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_transcript.py"), encoding="utf-8").read()


def drop_shape(kind):
    rx = re.compile(r'    \("%s", re\.compile\(.*?\)\),\n' % re.escape(kind), re.S)
    return lambda s: rx.sub("", s, count=1)


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:50], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [("shape removed: %s" % k, drop_shape(k)) for k in (
    "private-key-block", "anthropic-token", "openai-key", "github-token", "discord-webhook", "discord-bot-token",
    "telegram-bot-token", "jwt", "b2-application-key", "bearer-token", "url-credentials")] + [
    ("names layer off", replace("        text = NAMES.sub(", "        text = text if True else NAMES.sub(")),
    ("names after shapes (r1 order)", replace(
        "        text = NAMES.sub(self._named, text)          # names FIRST (C-4): the whole named value goes, markers stay intact\n"
        "        for kind, rx in SHAPES:\n"
        "            text = rx.sub(lambda m, k=kind: self._hit(k), text)\n",
        "        for kind, rx in SHAPES:\n"
        "            text = rx.sub(lambda m, k=kind: self._hit(k), text)\n"
        "        text = NAMES.sub(self._named, text)\n")),
    ("quoted value without its boundary check", replace("(?P=q)(?=[\\s,;})\\]]|$)", "(?P=q)")),
    ("last-resort whole-run alternative removed", replace('                   r"|(?P<raw>\\S+))"', '                   r")"')),
    ("whole-run value given a 4-char floor", replace('                   r"|(?P<raw>\\S+))"', '                   r"|(?P<raw>\\S{4,}))"')),
    ("prefix tolerance removed", replace("(?!NOPASSWD\\b)\\w*?(?:%s)", "(?:%s)")),
    ("NOPASSWD exception removed", replace("(?!NOPASSWD\\b)\\w*?(?:%s)", "\\w*?(?:%s)")),
    ("names case-sensitive again", replace("% \"|\".join(SECRET_NAMES), re.IGNORECASE)", "% \"|\".join(SECRET_NAMES))")),
    ("empty --hashes not refused", replace('    if "--hashes" in opts and not red.layer_c_names:', '    if False:')),
    ("drop counter off", replace("        dropped[key] = dropped.get(key, 0) + 1", "        pass")),
    ("value layer off", replace("        if self.by_len:\n", "        if False:\n")),
    ("P3(c): unreachable entries dropped silently", replace(
        '            if isinstance(h, dict) and h.get("reachable") is False and h.get("name"):', '            if False:')),
    ("P3(c): unreachable not named in the state line", replace("        if self.layer_c_unreachable:", "        if False:")),
    ("P3(c): no trailing-full-stop candidate", replace('cands.append(("", t[:-1], "."))', 'pass')),
    ("P3(c): no after-'=' candidate", replace('cands.append((head + eq, tail, ""))', 'pass')),
    ("P3(c): no after-'=' with full stop candidate", replace('cands.append((head + eq, tail[:-1], "."))', 'pass')),
    ("P3(c): prefix and stop dropped on a hit", replace('return pre + self._hit("value:" + n) + post', 'return self._hit("value:" + n)')),
    ("thinking kept", replace('if b.get("type") == "text" and b.get("text", "").strip():\n                    yield uid, ts, "\\n**[%s] Session:**',
                              'if b.get("type") in ("text", "thinking") and (b.get("text") or b.get("thinking", "")).strip():\n                    b = dict(b, text=b.get("text") or b.get("thinking")); yield uid, ts, "\\n**[%s] Session:**')),
    ("tool error not attached", replace('p[2] += " ERROR: "', 'p[2] += "" if True else " ERROR: "')),
    ("user turn not redacted", replace('"\\n**[%s] User:** %s\\n" % (hhmm, redact(b["text"]).strip())', '"\\n**[%s] User:** %s\\n" % (hhmm, b["text"].strip())')),
]

caught = 0
for name, mut in MUTATIONS:
    d = tempfile.mkdtemp(prefix="dt-mut-")
    try:
        try:
            m = mut(SRC)
        except AssertionError as e:
            print("ERROR  %s: %s" % (name, e)); continue
        if m == SRC:
            print("ERROR  %s: the mutation changed nothing" % name); continue
        open(os.path.join(d, "dt_transcript.py"), "w", encoding="utf-8").write(m)
        shutil.copy(os.path.join(HERE, "test_dt_transcript.py"), d)
        rc = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_transcript.py")],
                            capture_output=True, cwd=d).returncode
        verdict = "caught" if rc != 0 else "SURVIVED"
        caught += rc != 0
        print("%-8s %s" % (verdict, name))
    finally:
        shutil.rmtree(d, ignore_errors=True)
print("\n%d/%d caught" % (caught, len(MUTATIONS)))
sys.exit(0 if caught == len(MUTATIONS) else 1)
