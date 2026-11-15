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


def run_guard(units, all_files):
    """Stage `units` {name: (script, cap)} as the new commit's unit files and run the guard."""
    stage = os.path.join(work, "stage")
    shutil.rmtree(stage, ignore_errors=True)
    os.makedirs(os.path.join(stage, "units"))
    for n, (script, cap) in units.items():
        with open(os.path.join(stage, "units", n), "w", encoding="utf-8", newline="") as fh:
            fh.write("[Service]" + NL + "ExecStart=/usr/bin/python3 /opt/token-watch/%s" % script + NL +
                     ("MemoryMax=%s" % cap + NL if cap else ""))
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

print(NL + "=== THE SHIPPED UNIT FILES PASS THE GUARD AS THEY STAND")
units_dir = os.path.join(PKG, "systemd")
summary_unit = open(os.path.join(units_dir, "token-watch-summary.service"), encoding="utf-8").read()
check("S1 the summary unit carries NO active MemoryMax until P12 places summary.py",
      not any(line.startswith("MemoryMax=") for line in summary_unit.splitlines()))

shutil.rmtree(work, ignore_errors=True)
print(NL + "%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
