# -*- coding: utf-8 -*-
"""Mutation runner for KYLE'S DESK in cc-wake-filter.py. Each mutation breaks ONE rule in a TEMP copy of the filter
(never the repo file) and test-wake-kyle-desk.py must FAIL against it, by EXIT CODE and with its own "<n> failed" line
(a crash is reported apart). CONTROL FIRST: the unmutated filter, in the same scratch layout, must pass - or every
mutant would be "caught" by a broken harness (that happened to the archive's runner on 2026-11-06)."""
import os, shutil, subprocess, sys, tempfile

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
SRC_PATH = os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
TEST = os.path.join(ROOT, "scripts", "analysis", "test-wake-kyle-desk.py")
SRC = open(SRC_PATH, encoding="utf-8").read()


def replace(a, b):
    def f(s):
        assert s.count(a) == 1, "anchor not unique: %r (%d)" % (a[:60], s.count(a))
        return s.replace(a, b)
    return f


MUTATIONS = [
    ("desk off for PM Claude", replace('KYLE_DESK = {"CC-PM"}', 'KYLE_DESK = set()')),
    ("desk on for every session", replace("    if ALIAS not in KYLE_DESK:\n        return False", "    if False:\n        return False")),
    ("opening-list Kyle check off", replace('        return "KYLE" in _ADDRESS_LIST.opening_addressees(full, ADDRESS_REGISTRY)',
                                            '        return False')),
    ("Kyle anywhere instead of the opening list", replace(
        '        return "KYLE" in _ADDRESS_LIST.opening_addressees(full, ADDRESS_REGISTRY)',
        '        return bool(re.search(r"kyle", full, re.I))')),
    ("marker off", replace("STILL_NEED_RE.search(full) or owner", "False or owner")),
    ("marker case-insensitive", replace('STILL_NEED_RE = re.compile(r"\\bSTILL NEED YOU\\b")',
                                        'STILL_NEED_RE = re.compile(r"\\bSTILL NEED YOU\\b", re.I)')),
    ("owner=Kyle ignored", replace(' or owner == "Kyle")', ')')),
    ("Langston desk wake removed", replace(
        '                elif desk:\n                    print(f"WAKE[LANGSTON->{ALIAS}] [for Kyle]',
        '                elif False:\n                    print(f"WAKE[LANGSTON->{ALIAS}] [for Kyle]')),
    ("owner=Kyle still suppressed", replace("                        if not OPEN_RE.match(full) and not desk:",
                                            "                        if not OPEN_RE.match(full):")),
    ("tag branch swallows the desk again", replace("                    if deliver or desk:\n                        tag = \" [for Kyle]\" if desk and not deliver else \"\"",
                                                   "                    if deliver:\n                        tag = \"\"")),
    ("crew desk wake removed", replace("                    desk = (not deliver) and for_kyles_desk(full)",
                                       "                    desk = False")),
    ("Kyle tag dropped", replace('                        tag = " [for Kyle]" if desk else ""', '                        tag = ""')),
]


def suite(src):
    d = tempfile.mkdtemp(prefix="wake-desk-mut-")
    try:
        fl = os.path.join(d, "comms-infra", "laptop")
        os.makedirs(fl)
        open(os.path.join(fl, "cc-wake-filter.py"), "w", encoding="utf-8").write(src)
        dd = os.path.join(d, "comms-infra", "discord")     # the filter loads ../discord/address_list.py
        os.makedirs(dd)
        shutil.copy(os.path.join(ROOT, "comms-infra", "discord", "address_list.py"), dd)
        p = subprocess.run([sys.executable, TEST, os.path.join(fl, "cc-wake-filter.py")], capture_output=True, timeout=1800)
        out = p.stdout.decode("utf-8", "replace").splitlines()
        tail = [l for l in out if l.endswith(" failed")]
        return p.returncode, (tail[-1] if tail else None)
    finally:
        shutil.rmtree(d, ignore_errors=True)


rc0, line0 = suite(SRC)
if rc0 != 0 or not line0 or not line0.endswith(" 0 failed"):
    print("HARNESS BROKEN: the unmutated filter does not pass in the scratch layout (rc=%s, %r)" % (rc0, line0))
    sys.exit(2)
print("control: unmutated filter passes in the scratch layout (%s)" % line0)
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
    print("%-8s %s   %s" % (verdict, name, line or ""))
print("\n%d/%d caught (%d of them by a crash rather than an assertion)" % (caught, len(MUTATIONS), crashed))
# A CRASH IS NOT A CATCH for the gate (Langston r2 nit): it is printed apart, and it fails the run.
sys.exit(0 if caught == len(MUTATIONS) and crashed == 0 else 1)
