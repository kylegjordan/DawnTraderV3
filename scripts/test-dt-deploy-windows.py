#!/usr/bin/env python3
"""B-DEPLOY-WINDOW-GUARD P12 (iii) / pre-audit D-4 - the register check, run on dt-deploy's REAL bytes in a sandbox.

Usage (Linux, as any user; no staging path is touched):
    python3 scripts/test-dt-deploy-windows.py [--dt-deploy /usr/local/bin/dt-deploy] [--obs-windows <path>]
              [--expect-sha256 <hex>]

WHY A SANDBOX: cases (a) and (b) need an absent or broken register at the branch head, and fail-closed would then
refuse every session's deploy for the length of the test (pre-audit D-4, Langston-accepted). So this copies the given
dt-deploy, ASSERTS ITS sha256 AT RUN TIME (Langston's D-4 rider: not at copy time), swaps ONLY the marked CONSTANTS
block (paths, branch) for a throwaway tree, and runs it against a local bare "origin" whose branch head carries the
register in each state. A fake npm and pm2 sit first on PATH, so nothing real is built, migrated or restarted.

EXPECTED OUTCOMES ARE IN THE CASE TABLE, WRITTEN BEFORE THE RUN. A refusal case must ALSO leave the app clone's HEAD
where it was (proof it exited before `git reset --hard`) and write no notice line unless the case says so.
Exit 0 = every case as stated.
"""
import argparse
import hashlib
import json
import os
import shutil
import subprocess
import sys
import tempfile

HERE = os.path.dirname(os.path.abspath(__file__))
ap = argparse.ArgumentParser()
ap.add_argument("--dt-deploy", default=os.path.join(HERE, "dt-deploy.sh"))
ap.add_argument("--obs-windows", default=os.path.join(HERE, "obs-windows.py"))
ap.add_argument("--expect-sha256")
A = ap.parse_args()

data = open(A.dt_deploy, "rb").read()
digest = hashlib.sha256(data).hexdigest()
print("dt-deploy under test: %s sha256=%s (read now, at run time)" % (A.dt_deploy, digest))
if A.expect_sha256 and A.expect_sha256 != digest:
    sys.exit("ABORT: sha256 %s is not the expected %s - this is not the copy you meant to test" % (digest, A.expect_sha256))
src = data.decode("utf-8")
a, b = src.index("# ── CONSTANTS"), src.index("# ── END CONSTANTS ──")
T = tempfile.mkdtemp(prefix="dtd-win-")
PASS = FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s\n      %s" % (name, str(detail)[-700:]))


def sh(*args, cwd=None):
    return subprocess.run(list(args), cwd=cwd, check=True, capture_output=True, text=True).stdout.strip()


GIT = ["git", "-c", "user.email=t@t", "-c", "user.name=t"]
work, bare, app = T + "/work", T + "/origin.git", T + "/app"
os.makedirs(work + "/1-system-manual")
sh("git", "init", "-q", "-b", "migration/aws-supabase", work)
H = '{"schema":"deploy-windows/1"}'


def win(batch, owner):
    return json.dumps({"type": "open", "batch": batch, "owner": owner, "opened_at": "2026-01-01T00:00:00Z",
                       "end": "2099-01-01T00:00:00Z", "review_by": "2099-01-02T00:00:00Z", "disturbs": "the read",
                       "detail": "a report"})


def commit(register_text, msg):
    p = work + "/1-system-manual/DEPLOY_WINDOWS.jsonl"
    if register_text is None:
        if os.path.exists(p):
            os.unlink(p)
    else:
        open(p, "w").write(register_text)
    open(work + "/f.txt", "a").write(msg + "\n")
    sh("git", "add", "-A", cwd=work)
    sh(*GIT, "commit", "-qm", msg, cwd=work)
    return sh("git", "rev-parse", "HEAD", cwd=work)


BASE = commit(H + "\n", "base: an empty register")
sh("git", "clone", "-q", "--bare", work, bare)
sh("git", "clone", "-q", "-b", "migration/aws-supabase", bare, app)
fake = T + "/bin"
os.makedirs(fake)
open(fake + "/npm", "w").write("#!/bin/sh\necho \"npm $*\" >> %s/npm.log\nexit ${FAKE_NPM_RC:-1}\n" % T)
open(fake + "/pm2", "w").write("#!/bin/sh\nexit 1\n")
for f in ("npm", "pm2"):
    os.chmod(fake + "/" + f, 0o755)
obs = T + "/dt-obs-windows"
shutil.copyfile(A.obs_windows, obs)
os.chmod(obs, 0o755)
consts = {"APP_DIR": app, "LOCK_DIR": T + "/lock", "RECORD": T + "/record", "BRANCH": "origin/migration/aws-supabase",
          "REGISTER_PATH": "1-system-manual/DEPLOY_WINDOWS.jsonl", "OBS_WINDOWS": obs, "NOTICE": T + "/notice"}
shipped = [ln.split("=", 1)[0] for ln in src[a:b].splitlines() if "=" in ln and not ln.startswith("#")]
check("the harness sets exactly the shipped constants", set(shipped) == set(consts), shipped)
tested = T + "/dt-deploy"
open(tested, "w").write(src[:a] + "".join('%s="%s"\n' % kv for kv in consts.items()) + src[b:])
os.chmod(tested, 0o755)


def head():
    return sh("git", "rev-parse", "HEAD", cwd=app)


def notice_lines():
    try:
        return open(T + "/notice").read().splitlines()
    except FileNotFoundError:
        return []


def deploy(sha, *extra, npm_rc="1"):
    env = dict(os.environ, PATH=fake + ":" + os.environ["PATH"], FAKE_NPM_RC=npm_rc)
    r = subprocess.run(["bash", tested, sha, "--by", "cc-infra"] + list(extra), capture_output=True, text=True, env=env,
                       timeout=120)
    return r.returncode, r.stdout + r.stderr


def push(register_text, msg):
    sha = commit(register_text, msg)
    sh("git", "push", "-q", bare, "migration/aws-supabase", cwd=work)
    return sha


def case(label, register_text, extra, want_rc, want_text, head_moves=False, notices=0, npm_rc="1", dirty=False,
         absent=None):
    sh("git", "reset", "-q", "--hard", BASE, cwd=app)
    for f in ("notice",):
        if os.path.exists(T + "/" + f):
            os.unlink(T + "/" + f)
    sha = push(register_text, label)
    if dirty:
        open(app + "/f.txt", "a").write("dirty\n")
    before = head()
    rc, out = deploy(sha, *extra, npm_rc=npm_rc)
    if dirty:
        sh("git", "checkout", "-q", "--", "f.txt", cwd=app)
    moved = head() != before
    ok = rc == want_rc and want_text in out and moved == head_moves and len(notice_lines()) == notices \
        and (absent is None or absent not in out)
    check("%s: exit %d, '%s', HEAD %s, %d notice line(s)" % (label, want_rc, want_text,
          "moves" if head_moves else "unchanged", notices), ok,
          "rc=%s moved=%s notices=%s\n%s" % (rc, moved, notice_lines(), out))
    return out


# (a) register absent at the head
case("(a) register absent", None, [], 4, "does not exist at origin/migration/aws-supabase")
# (b) register malformed
case("(b) register malformed (no header)", win("B-X", "cc-b") + "\n", [], 4, "REGISTER REFUSED")
# (c) one open window, not named
case("(c) one open window, not named", H + "\n" + win("B-X", "cc-b") + "\n", [], 5, "B-X is in an open observation window")
# (d) two open, one named
case("(d) two open, only one named", H + "\n" + win("B-X", "cc-b") + "\n" + win("B-Y", "cc-a") + "\n",
     ["--in-window", "B-X"], 5, "B-Y is in an open observation window")
# (e) C-1: the WORKTREE copy says no windows, the HEAD copy has one - HEAD wins
sh("git", "reset", "-q", "--hard", BASE, cwd=app)
open(app + "/1-system-manual/DEPLOY_WINDOWS.jsonl", "w").write(H + "\n")      # the stale, previously-deployed copy
out = case("(e) worktree copy differs from HEAD's; HEAD's open window wins", H + "\n" + win("B-Z", "cc-c") + "\n", [], 5,
           "B-Z is in an open observation window")
check("(e) ... and the refusal names the register it read (C-2)", "register_sha=" in out and "register_blob=" in out, out)
# a name that is not an open window, and the --in-window refusal arms
case("an --in-window name that is not open, not echoed", H + "\n" + win("B-X", "cc-b") + "\n",
     ["--in-window", "B-X,TOPSECRET"], 5, "not echoed")
rc, out = deploy(BASE, "--in-window=B-X")
check("the '=' form of --in-window is refused", rc == 1 and "SPACE-separated" in out, out)
# PASS through the check, then the dirty-tree refusal (exit 3): proves the check passed AND (C-13) no notice before it
case("no windows + a dirty tree: past the check, refused at the dirty tree, NO notice", H + "\n", [], 3,
     "worktree is DIRTY", dirty=True)
case("named window + a dirty tree: past the check, NO notice (C-13: after :219)", H + "\n" + win("B-X", "cc-b") + "\n",
     ["--in-window", "B-X"], 3, "worktree is DIRTY", dirty=True)
# C-12: the alert mint fails -> notice-only, the deploy goes on (and fails later at the fake build, after the reset)
out = case("named window, clean tree, mint fails: notice-only, the deploy proceeds", H + "\n" + win("B-X", "cc-b") + "\n",
           ["--in-window", "B-X"], 1, "IN-WINDOW ALERT NOT RAISED", head_moves=True, notices=1)
check("... the notice line says notice-only and names the window", notice_lines()
      and "window_notice=notice-only" in notice_lines()[0] and "in_window=B-X/cc-b/open" in notice_lines()[0], notice_lines())
# the mint succeeds -> alerted, with the per-attempt key
case("named window, mint succeeds: alerted", H + "\n" + win("B-X", "cc-b") + "\n", ["--in-window", "B-X"], 1,
     "alert: alerted", head_moves=True, notices=1, npm_rc="0")
log = open(T + "/npm.log").read() if os.path.exists(T + "/npm.log") else ""   # absent = no mint ran: a FAIL below, never a crash
check("the mint used category governance and the per-attempt key", "--category governance" in log
      and "--dedupe-key deploy-in-window:B-X:" in log, log[-600:])
# C-12: the NOTICE cannot be written -> exit 6, tree untouched
sh("git", "reset", "-q", "--hard", BASE, cwd=app)
if os.path.exists(T + "/notice"):
    os.unlink(T + "/notice")
os.makedirs(T + "/notice")                                # a directory where the file must go: the append fails
sha = push(H + "\n" + win("B-X", "cc-b") + "\n", "notice unwritable")
before = head()
if os.path.exists(T + "/npm.log"):
    os.unlink(T + "/npm.log")
rc, out = deploy(sha, "--in-window", "B-X", npm_rc="0")
check("the notice cannot be appended -> exit 6, HEAD unchanged, the lock released",
      rc == 6 and head() == before and not os.path.exists(T + "/lock") and "cannot write the in-window notice" in out and "no alert was raised" in out,
      "rc=%s\n%s" % (rc, out))
check("C-18: ... and NO alert was minted on the exit-6 path (npm.log empty)",
      not os.path.exists(T + "/npm.log") or open(T + "/npm.log").read() == "",
      open(T + "/npm.log").read() if os.path.exists(T + "/npm.log") else "")
os.rmdir(T + "/notice")
# a stale window does not block, and is still landed in
stale = json.dumps({"type": "open", "batch": "B-OLD", "owner": "cc-b", "opened_at": "2020-01-01T00:00:00Z",
                    "end": "2020-01-02T00:00:00Z", "review_by": "2020-01-03T00:00:00Z", "disturbs": "x", "detail": "y"})
case("a STALE window does not block, prints STALE WINDOW, and is noticed", H + "\n" + stale + "\n", [], 1,
     "STALE WINDOW B-OLD", head_moves=True, notices=1, npm_rc="0")
# C-19: an OPEN window whose free text contains the word 'stale' is not labelled stale
ev = json.dumps({"type": "open", "batch": "B-OPEN", "owner": "cc-b", "opened_at": "2026-01-01T00:00:00Z",
                 "until_event": "the stale price fix lands", "expected_by": "2099-01-01T00:00:00Z",
                 "review_by": "2099-01-02T00:00:00Z", "disturbs": "x", "detail": "y"})
case("C-19: 'stale' in an open window's text does not print STALE WINDOW", H + "\n" + ev + "\n", ["--in-window", "B-OPEN"],
     3, "worktree is DIRTY", dirty=True, absent="STALE WINDOW")
# C-20: holds - a landing sha in the deploy, one on a side branch, and one git cannot resolve
sh("git", "checkout", "-q", "-b", "side", BASE, cwd=work)
SIDE = commit(H + "\n", "a side-branch commit")
sh("git", "push", "-q", bare, "side", cwd=work)
sh("git", "checkout", "-q", "migration/aws-supabase", cwd=work)
GHOST = "9" * 40
hold = json.dumps({"type": "hold", "hold": "H-1", "row": "GE-row", "opened_at": "2026-01-01T00:00:00Z",
                   "pending": [{"batch": "B-IN", "landing_sha": BASE}, {"batch": "B-SIDE", "landing_sha": SIDE},
                               {"batch": "B-GHOST", "landing_sha": GHOST}]})
out = case("C-20: a register with a hold passes the check (holds never refuse)", H + "\n" + hold + "\n", [], 3,
           "worktree is DIRTY", dirty=True)
check("C-20: the landing sha inside the deploy -> becomes LIVE", "hold H-1: B-IN becomes LIVE" in out, out)
check("C-20: the side-branch landing sha -> stays NOT live", "hold H-1: B-SIDE stays NOT live" in out, out)
check("C-20: an unresolvable landing sha -> CANNOT BE DETERMINED, never 'not live'",
      "hold H-1: B-GHOST liveness CANNOT BE DETERMINED" in out and "B-GHOST stays NOT live" not in out, out)
# the helper absent -> exit 4
os.rename(obs, obs + ".gone")
case("the parser not installed -> exit 4", H + "\n", [], 4, "is not installed")
os.rename(obs + ".gone", obs)
shutil.rmtree(T)
print("dt-deploy windows sandbox: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
