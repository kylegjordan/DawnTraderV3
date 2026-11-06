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
    ("P3(c): no after-'=' candidate", replace('cands.append((pre, tail, ""))', 'pass')),
    ("P3(c): no after-'=' with full stop candidate", replace('cands.append((pre, tail[:-1], "."))', 'pass')),
    ("P5 link: the nested transcript not named", replace(
        '                        p[2] += " → nested transcript `sub/%s/subagents__agent-%s.md`" % (sid[:8], aid)', '                        pass')),
    ("P5 link: any agent id written into a path", replace(
        '                    if p and aid and sid and re.fullmatch(r"[A-Za-z0-9_-]+", str(aid)):', '                    if p and aid and sid:')),
    ("P5 link: the whole session id, not its 8-char prefix", replace("(sid[:8], aid)", "(sid, aid)")),
    ("r2 f1: a malformed entry dropped silently", replace('    if "--hashes" in opts and red.layer_c_malformed:', '    if False:')),
    ("r2 f1: a short mac not counted as malformed", replace(
        "            if len(mac) != 64:\n                self.layer_c_malformed += 1\n                continue",
        "            if len(mac) != 64:\n                continue")),
    ("r2 f3: one secret counted twice", replace(
        "            if mac in have:", "            if False:")),
    ("r2 f3: a part's name kept over the plain name", replace(
        '                if "#" in have[mac] and "#" not in n:', '                if False:')),
    ("r2 (b): the refusal does not name the other keys", replace(
        '", ".join("%s x%d" % kv for kv in sorted(red.layer_c_wrong_keys.items()))', '"(not named)"')),
    ("counts key not folded to the listed name", replace(
        "        listed = max((n for n in SECRET_NAMES if written.endswith(n)), key=len, default=written)",
        "        listed = written")),
    ("counts key folded to the SHORTEST listed name", replace(
        "        listed = max((n for n in SECRET_NAMES if written.endswith(n)), key=len, default=written)",
        "        listed = min((n for n in SECRET_NAMES if written.endswith(n)), key=len, default=written)")),
    ("P5: tie order key dropped (actions back to last)", replace("pending[b.get(\"id\")] = [uid, ts, line[0], (li, bi)]",
                                                                 "pending[b.get(\"id\")] = [uid, ts, line[0], (10 ** 9, 0)]")),
    ("P5: queued notices never kept", replace("            queued.append((ts, li, e[\"content\"]))\n", "")),
    ("P5: queued notice kept even when delivered", replace("        if delivered.get(k, 0) > 0:\n            delivered[k] -= 1\n            continue\n", "")),
    ("P5: delivery a set, not a multiset", replace("            delivered[k] -= 1\n", "")),
    ("P5: queued notice ignores the window", replace(
        "        if (since and ts < since) or (until and ts >= until):\n            continue\n        hhmm = ts[11:19] if len(ts) >= 19 else ts\n        qid",
        "        hhmm = ts[11:19] if len(ts) >= 19 else ts\n        qid")),
    ("P5: deliveries counted only inside the window", replace(
        "        if typ == \"user\" and not e.get(\"isCompactSummary\"):\n            for b in _blocks(",
        "        if typ == \"user\" and not e.get(\"isCompactSummary\") and not ((since and ts < since) or (until and ts >= until)):\n            for b in _blocks(")),
    ("P5: wake notices never folded", replace("    if not blocks or TASK_NOTICE.sub(\"\", text).strip():", "    if True:")),
    ("P5: a person's words folded into a wake", replace("    if not blocks or TASK_NOTICE.sub(\"\", text).strip():", "    if not blocks:")),
    ("P5: only the first of two notices kept", replace('    return "task notice:** " + " | ".join(parts)', '    return "task notice:** " + parts[0]')),
    ("P5: summary not redacted", replace("        parts.append(one_line(redact(what), 200))", "        parts.append(one_line(what, 200))")),
    ("P5: no-summary fallback dropped", replace('        what = _tag(body, "summary") or ("background task %s" % (_tag(body, "status") or "notice"))',
                                                '        what = _tag(body, "summary")')),
    ("J3: only the FIRST '=' tried", replace('                    if ch == "=":', '                    if ch == "=" and "=" not in t[:i]:')),
    ("F1: plain SHA-256 matching instead of the HMAC", replace(
        'names.get(hmac.new(key, t.encode("utf-8"), hashlib.sha256).hexdigest())',
        'names.get(hashlib.sha256(t.encode("utf-8")).hexdigest())')),
    ("F1: different-key entries loaded", replace("            if hk != kid:", "            if False:")),
    ("F1: --hashes accepted without --key-file", replace(
        '        if key is None:\n            sys.stderr.write("REFUSED: --hashes needs', '        if False:\n            sys.stderr.write("REFUSED: --hashes needs')),
    ("F1: a different-key file not refused", replace('    if "--hashes" in opts and red.layer_c_wrong_key:', '    if False:')),
    ("F1: a short key accepted", replace("    return k if len(k) >= 32 else None", "    return k if k else None")),
    ("P3(c): prefix and stop dropped on a hit", replace('return pre + self._hit("value:" + n) + post', 'return self._hit("value:" + n)')),
    ("thinking kept", replace('if b.get("type") == "text" and b.get("text", "").strip():\n                    yield uid, ts, "\\n**[%s] Session:**',
                              'if b.get("type") in ("text", "thinking") and (b.get("text") or b.get("thinking", "")).strip():\n                    b = dict(b, text=b.get("text") or b.get("thinking")); yield uid, ts, "\\n**[%s] Session:**')),
    ("tool error not attached", replace('p[2] += " ERROR: "', 'p[2] += "" if True else " ERROR: "')),
    ("user turn not redacted", replace('"\\n**[%s] User:** %s\\n" % (hhmm, redact(b["text"]).strip())', '"\\n**[%s] User:** %s\\n" % (hhmm, b["text"].strip())')),
]

COPIED = ("test_dt_transcript.py", "dt_secret_hashes.py")   # everything the suite imports besides the module under test


def suite(src):
    """Run the suite against `src` in a scratch copy of EXACTLY the layout every mutant gets. Returns (rc, failed-line)."""
    d = tempfile.mkdtemp(prefix="dt-mut-")
    try:
        open(os.path.join(d, "dt_transcript.py"), "w", encoding="utf-8").write(src)
        for f in COPIED:
            shutil.copy(os.path.join(HERE, f), d)
        p = subprocess.run([sys.executable, "-I", os.path.join(d, "test_dt_transcript.py")], capture_output=True, cwd=d)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


# CONTROL: the UNMUTATED module must pass in the same layout, or every mutant "is caught" by a broken harness.
# (Measured 2026-11-06: the suite began importing dt_secret_hashes, this runner did not copy it, and 37/37 "caught"
# was 37 import crashes.)
rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated module does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
