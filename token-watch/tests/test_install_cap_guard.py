"""
token-watch — the installer's cap guard (B-TOKEN-WATCH-FOLLOWUP-MEMORY P3 Step 4 C-4, Langston): "a resource cap may not
be installed ahead of the code it was measured on". The guard block is EXTRACTED from deploy/install_storage.sh and run
by bash against a throwaway git repository with a previous and a new commit, so the test exercises the shipped lines,
not a copy of them.

Run:  python tests/test_install_cap_guard.py        (exit 0 = every check passed; needs bash and git)
"""

import os
import shutil
import subprocess
import sys
import tempfile

try:
    sys.stdout.reconfigure(encoding="utf-8")
except Exception:
    pass

PKG = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
INSTALLER = os.path.join(PKG, "deploy", "install_storage.sh")
PASS = FAIL = 0
NL = chr(10)


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("  ok   %s" % label)
    else:
        FAIL += 1
        print("  FAIL %s%s" % (label, (" :: %s" % (detail,)) if detail else ""))


src = open(INSTALLER, encoding="utf-8").read()
start = src.index("# ⛔ A RESOURCE CAP MAY NOT BE INSTALLED AHEAD OF THE CODE IT WAS MEASURED ON")
end = src.index(NL + "done", start) + len(NL + "done")
GUARD = src[start:end]
check("G0 the guard sits AFTER the previous install's sha is read (PREV) and before the files are installed",
      src.index("PREV=$(") < start < src.index("for f in $PINNED; do [ -f"), (src.index("PREV=$("), start))
check("G0 no stderr is suppressed on a git object read in the guard", "2>/dev/null" not in GUARD)

work = tempfile.mkdtemp(prefix="tw-capguard-")
repo = os.path.join(work, "repo")
os.makedirs(os.path.join(repo, "token-watch", "systemd"))


def git(*a):
    return subprocess.run(["git", "-C", repo] + list(a), capture_output=True, text=True, check=True).stdout.strip()


def unit(name, script, cap):
    with open(os.path.join(repo, "token-watch", "systemd", name), "w", encoding="utf-8", newline="") as fh:
        fh.write("[Service]" + NL + "ExecStart=/usr/bin/python3 /opt/token-watch/%s" % script + NL +
                 ("MemoryMax=%s" % cap + NL if cap else ""))


git("init", "-q")
git("config", "user.email", "t@t")
git("config", "user.name", "t")
unit("a.service", "summary.py", None)               # PREV: no cap
unit("r.service", "receiver.py", "512M")            # PREV: a cap on a script this installer never places
git("add", "-A")
git("commit", "-qm", "prev")
PREV = git("rev-parse", "HEAD")


def run_guard(units, all_files, raw=None):
    """Stage `units` {name: (script, cap)} as the new commit's unit files (or `raw` {name: text}) and run the guard."""
    stage = os.path.join(work, "stage")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(os.path.join(stage, "units"))
    for n, (script, cap) in units.items():
        with open(os.path.join(stage, "units", n), "w", encoding="utf-8", newline="") as fh:
            fh.write("[Service]" + NL + "ExecStart=/usr/bin/python3 /opt/token-watch/%s" % script + NL +
                     ("MemoryMax=%s" % cap + NL if cap else ""))
    for n, text in (raw or {}).items():
        with open(os.path.join(stage, "units", n), "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        units = dict(units, **{n: None})
    script = (
        "set -eu" + NL +
        "fail() { echo \"FAIL: $*\" >&2; exit 1; }" + NL +
        "g() { git -C \"$REPO\" \"$@\"; }" + NL +
        "REPO=%r; PREV=%s; stage=%r" % (repo, PREV, stage) + NL +
        "UNIT_FILES=%r; ALL=%r" % (" ".join(units), " ".join(all_files)) + NL +
        GUARD + NL + "echo GUARD-PASSED" + NL)
    return subprocess.run(["bash", "-c", script], capture_output=True, text=True)


r = run_guard({"a.service": ("summary.py", "384M"), "r.service": ("receiver.py", "512M")}, ["follow_up.py"])
check("C1 a NEW cap on a script this run does not place REFUSES", r.returncode != 0 and "summary.py is not installed"
      in r.stderr, (r.returncode, r.stderr[-300:]))
r = run_guard({"a.service": ("summary.py", "384M"), "r.service": ("receiver.py", "512M")}, ["follow_up.py", "summary.py"])
check("C2 POSITIVE CONTROL: the same cap with its script in this run passes", r.returncode == 0
      and "GUARD-PASSED" in r.stdout, (r.returncode, r.stderr[-300:]))
r = run_guard({"a.service": ("summary.py", None), "r.service": ("receiver.py", "512M")}, ["follow_up.py"])
check("C3 an UNCHANGED cap on a script this installer never places (the receiver) is left alone", r.returncode == 0,
      (r.returncode, r.stderr[-300:]))
r = run_guard({"a.service": ("summary.py", None), "r.service": ("receiver.py", "1G")}, ["follow_up.py"])
check("C4 a CHANGED cap on an unplaced script refuses", r.returncode != 0 and "receiver.py" in r.stderr,
      (r.returncode, r.stderr[-300:]))
r = run_guard({"a.service": ("summary.py", None), "r.service": ("receiver.py", "512M"),
               "n.service": ("new_job.py", "128M")}, ["follow_up.py"])
check("C5 a unit NEW at this sha (no blob at PREV) with a cap on an unplaced script refuses", r.returncode != 0
      and "new_job.py" in r.stderr, (r.returncode, r.stderr[-300:]))

print(NL + "=== LANGSTON'S THREE HOLES (P12 rider, folded early): an argument shadowing the executable, a second ExecStart,"
      " an indented cap")
base = {"r.service": ("receiver.py", "512M")}
r = run_guard(base, ["follow_up.py", "summary.py"], raw={"x.service": "[Service]" + NL +
              "ExecStart=/usr/bin/python3 /opt/token-watch/tools/evil.py /opt/token-watch/summary.py" + NL + "MemoryMax=64M" + NL})
check("H1 an argument naming a placed script does not cover an unplaced executable", r.returncode != 0
      and "tools/evil.py" in r.stderr, (r.returncode, r.stderr[-300:]))
r = run_guard(base, ["follow_up.py", "summary.py"], raw={"x.service": "[Service]" + NL +
              "ExecStart=/usr/bin/python3 /opt/token-watch/summary.py" + NL +
              "ExecStart=/usr/bin/python3 /opt/token-watch/tools/evil.py" + NL + "MemoryMax=64M" + NL})
check("H2 a second ExecStart naming an unplaced script refuses", r.returncode != 0 and "tools/evil.py" in r.stderr,
      (r.returncode, r.stderr[-300:]))
r = run_guard(base, ["follow_up.py"], raw={"x.service": "[Service]" + NL +
              "ExecStart=/usr/bin/python3 /opt/token-watch/summary.py" + NL + "   MemoryMax=64M" + NL})
check("H3 an INDENTED cap is seen (systemd honours it) and refuses on an unplaced script", r.returncode != 0
      and "summary.py" in r.stderr, (r.returncode, r.stderr[-300:]))
r = run_guard(base, ["follow_up.py", "ops/unit_failed.py"], raw={"t@.service": "[Service]" + NL +
              "ExecStart=/usr/bin/python3 /opt/token-watch/ops/unit_failed.py %i" + NL + "MemoryMax=64M" + NL})
check("H4 POSITIVE CONTROL: a template unit whose script is placed passes", r.returncode == 0, (r.returncode, r.stderr[-300:]))

print(NL + "=== THE SHIPPED UNIT FILES PASS THE GUARD AS THEY STAND")
units_dir = os.path.join(PKG, "systemd")
summary_unit = open(os.path.join(units_dir, "token-watch-summary.service"), encoding="utf-8").read()
import re as _re  # noqa: E402
_lists = {}
for _name in ("OPS", "PINNED", "CORE", "TOOLS"):
    _m = _re.search(r'^%s="([^"]*)"' % _name, src, _re.M)
    _lists[_name] = _m.group(1).split() if _m else []
_all = _lists["OPS"] + _lists["PINNED"] + _lists["CORE"] + _lists["TOOLS"]
check("S1 P12: the shipped summary unit DOES carry MemoryMax=384M again (restored with the code it was measured on)",
      any(line.strip() == "MemoryMax=384M" for line in summary_unit.splitlines()))
r = run_guard({"r.service": ("receiver.py", "512M")}, _all, raw={"a.service": summary_unit})
check("S1 the SHIPPED summary unit passes the guard with the installer's own lists (summary.py is in CORE)",
      r.returncode == 0 and "GUARD-PASSED" in r.stdout and "summary.py" in _lists["CORE"], (r.returncode, r.stderr[-300:]))
r = run_guard({"r.service": ("receiver.py", "512M")}, [f for f in _all if f != "summary.py"], raw={"a.service": summary_unit})
check("S1 CONTROL: the same unit with summary.py dropped from the run REFUSES", r.returncode != 0
      and "summary.py is not installed" in r.stderr, (r.returncode, r.stderr[-300:]))

shutil.rmtree(work, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
