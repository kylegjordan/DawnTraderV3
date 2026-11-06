#!/usr/bin/env python3
"""Mutation runner for dt_dispatch_census (B-TRANSCRIPT-ARCHIVE P8). CONTROL FIRST in the same scratch layout; a crash
is printed apart AND fails the run."""
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = open(os.path.join(HERE, "dt_dispatch_census.py"), encoding="utf-8").read()
ADDR = os.path.join(os.path.dirname(os.path.dirname(HERE)), "discord", "address_list.py")


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("decline matched as a prefix", replace("            if r in DECLINE:", "            if any(r and r.startswith(x[:20]) for x in DECLINE):")),
    ("a reply with no message id ends the dispatch", replace(
        '            if d.get("reply_to") is not None and d.get("message_id") is not None:', '            if d.get("reply_to") is not None:')),
    ("a media reply does not end it", replace('        elif kind in ("langston_outbound", "langston_outbound_media"):', '        elif kind == "langston_outbound":')),
    ("an open reason ends the dispatch", replace("            elif r in OPEN_REASONS:\n                silents.append((str(d.get(\"reply_to\")), r))",
                                                 "            elif r in OPEN_REASONS:\n                replies.setdefault(str(d.get(\"reply_to\")), True)")),
    ("an unknown silent reason ignored", replace('                gf.append("unknown silent reason %r" % (r,))', "                pass")),
    ("an unknown kind ignored", replace('                gf.append("unknown kind %r" % kind)', "                pass")),
    ("an unmapped sender_username skipped", replace('                gf.append("unmapped sender %r" % (su,))', "                pass")),
    ("an unmapped cc_outbound sender skipped", replace('                gf.append("unmapped cc_outbound sender %r" % (s,))', "                pass")),
    ("dispatches not deduplicated", replace("                dispatches.setdefault(str(mid), ms)          # deduplicated on message_id (C-2)",
                                            "                dispatches[str(mid) + \"#%d\" % len(dispatches)] = ms")),
    ("another session's dispatch counted", replace("            if SENDER_USERNAME[su] == alias:", "            if True:")),
    ("the window not applied", replace("        return ms is not None and ms >= since_ms and (until_ms is None or ms < until_ms)",
                                       "        return True")),
    ("the registry control off", replace('    if "LANGSTON" not in registry:', "    if False:")),
    ("pieces matched byte-for-byte, not normalised", replace("    t = norm(text)", "    t = str(text or \"\")")),
    ("NOT RECEIVED never listed", replace("        out[\"not_received\"].append(i)", "        pass")),
    ("Coltrane's NOT CHECKED line dropped", replace(
        "    if NOT_CHECKED_LINE not in out[\"not_checked\"]:\n        out[\"not_checked\"].append(NOT_CHECKED_LINE)      # said every run",
        "    if False:\n        out[\"not_checked\"].append(NOT_CHECKED_LINE)      # said every run")),
    ("a Coltrane row counted as unmapped", replace("            if s == CC_SENDER_NOT_CHECKED:", "            if False:")),
    ("an unreadable log prints an empty green", replace(
        '        print(json.dumps({"guard_failed": ["census could not run (%s: %s)" % (type(e).__name__, e)]}))\n        return 3',
        '        print(json.dumps({"open": [], "guard_failed": []}))\n        return 0')),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="dt-cmut-")
    try:
        lap = os.path.join(d, "laptop", "transcript-archive")
        os.makedirs(lap)
        os.makedirs(os.path.join(d, "discord"))
        shutil.copy(ADDR, os.path.join(d, "discord"))
        open(os.path.join(lap, "dt_dispatch_census.py"), "w", encoding="utf-8").write(src)
        shutil.copy(os.path.join(HERE, "test_dt_dispatch_census.py"), lap)
        p = subprocess.run([sys.executable, "-I", os.path.join(lap, "test_dt_dispatch_census.py")], capture_output=True, cwd=lap,
                           timeout=300)
        tail = [l for l in p.stdout.decode("utf-8", "replace").splitlines() if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or line0 != "0 failed":
    print("HARNESS BROKEN: the unmutated census does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
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
