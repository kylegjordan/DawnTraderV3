#!/usr/bin/env python3
"""agent-staging-session suite (run as root on Helsinki). Loads the COMMITTED script as a module and
drives its mint and its state-file write against a throwaway home, with a fake ssh standing in for
the dtmint forced command. The r1 BLOCKER's control: a symlink planted where the temp file goes, or
where the state file goes, is never followed, and ownership lands on the file root wrote.
Judge by exit code."""
import calendar
import importlib.util
import json
import os
import pwd
import sys
import tempfile
import time
from importlib.machinery import SourceFileLoader

HERE = os.path.dirname(os.path.abspath(__file__))
SRC = os.environ.get("ASS_SRC") or os.path.join(HERE, "..", "..", "agent-staging-session")
PASS = FAIL = 0
NL = chr(10)


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


sys.dont_write_bytecode = True
spec = importlib.util.spec_from_loader("ass", SourceFileLoader("ass", SRC))
A = importlib.util.module_from_spec(spec)
spec.loader.exec_module(A)

T = tempfile.mkdtemp(prefix="ass-t-")
AGENT = "nobody"                                   # an account that is not root, so ownership is observable
home = os.path.join(T, "home")
os.makedirs(home)
os.chown(home, pwd.getpwnam(AGENT).pw_uid, pwd.getpwnam(AGENT).pw_gid)
A.state_file = lambda agent: os.path.join(home, ".staging-session.json")


def iso(t):
    return time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(t))


def fake_ssh(body, code=0):
    p = os.path.join(T, "fake-ssh")
    open(p, "w").write("#!/bin/sh" + NL + "cat <<'EOF'" + NL + body + NL + "EOF" + NL + "exit %d" % code + NL)
    os.chmod(p, 0o755)
    A.SSH = p


def mint_code():
    try:
        A.mint()
        return 0
    except SystemExit as e:
        return e.code


good = {"accessToken": "acc.tok.sig", "refreshToken": "r", "exp": iso(time.time() + 7 * 86400 - 60), "reused": False}
fake_ssh(json.dumps(good))
j = A.mint()
check("a good mint is accepted", j["accessToken"] == "acc.tok.sig")
fake_ssh(json.dumps(dict(good, exp=iso(time.time() + 5 * 86400))))
check("a token under 6 days is refused (OBJ-1(e))", mint_code() == 4)
fake_ssh("[1, 2]")
check("a JSON array is refused, not a traceback", mint_code() == 4)
fake_ssh(json.dumps(dict(good, exp=12345)))
check("a non-string exp is refused, not a traceback", mint_code() == 4)
fake_ssh("REFUSED: something", code=3)
check("a failed mint exits 3", mint_code() == 3)

# the state file: owner, mode, content, atomic, and the symlink race
A.write_state(AGENT, good)
p = A.state_file(AGENT)
st = os.lstat(p)
check("the state file is a regular file owned by the agent, 0600",
      os.path.isfile(p) and not os.path.islink(p) and st.st_uid == pwd.getpwnam(AGENT).pw_uid and st.st_mode & 0o777 == 0o600)
check("the state file holds the token under all three keys",
      [i["name"] for i in json.load(open(p))["origins"][0]["localStorage"]] == ["accessToken", "refreshToken", "token"])
victim = os.path.join(T, "victim")
open(victim, "w").write("root's file")
os.chmod(victim, 0o600)
os.symlink(victim, p + ".tmp")                     # the agent plants a link where the temp goes
A.write_state(AGENT, good)
vs = os.lstat(victim)
check("CONTROL (r1 BLOCKER): a link planted at the temp path is removed, never followed or chowned",
      vs.st_uid == 0 and open(victim).read() == "root's file" and not os.path.lexists(p + ".tmp"))
os.unlink(p)
os.symlink(victim, p)                              # ... or at the state file itself
A.write_state(AGENT, good)
check("a link at the state path is replaced, not written through",
      not os.path.islink(p) and open(victim).read() == "root's file" and os.lstat(victim).st_uid == 0)
old = os.path.join(T, "home-link")
os.rename(home, old)
os.symlink(old, home)                              # the home itself swapped for a link
try:
    A.write_state(AGENT, good)
    ok = False
except OSError:
    ok = True
check("a home that is a symlink is refused (O_NOFOLLOW on the directory)", ok)

# r2: a directory planted where the FIRST agent's state goes must not stop the SECOND
homes = {}
for ag in ("nobody", "daemon"):
    h = os.path.join(T, "h-" + ag)
    os.makedirs(h)
    os.chown(h, pwd.getpwnam(ag).pw_uid, pwd.getpwnam(ag).pw_gid)
    homes[ag] = h
A.state_file = lambda agent: os.path.join(homes[agent], ".staging-session.json")
A.AGENTS = ("nobody", "daemon")
os.makedirs(os.path.join(homes["nobody"], ".staging-session.json.tmp", "blocker"))
fake_ssh(json.dumps(good))
sys.argv = ["agent-staging-session"]
try:
    rc = A.main()
except SystemExit as e:
    rc = e.code
except Exception as e:                             # an escaped exception IS the failure being tested
    rc = "escaped %s" % type(e).__name__
check("r2: the first agent failing does NOT skip the second (and the run reports the failure)",
      rc == 5 and os.path.isfile(os.path.join(homes["daemon"], ".staging-session.json")), str(rc))

print("staging-session suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
