#!/usr/bin/env python3
"""dt-install-drift suite (run as root on Helsinki): a COPY of the committed checker whose only
difference is its CONSTANTS block, pointed at a throwaway tree holding a real bare repo, real
installed files and a real ed25519 key. The CONTROL the pre-audit requires: a deliberately edited
installed copy FAILS. Judge by exit code."""
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_SRC = os.path.normpath(os.path.join(HERE, "..", ".."))       # comms-infra/
SRC = os.path.join(HERE, "..", "dt-install-drift")
PASS = FAIL = 0


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


def sh(*a, **k):
    return subprocess.run(list(a), check=True, capture_output=True, text=True, **k)


T = tempfile.mkdtemp(prefix="drift-t-")
# a fake runuser: drop "<user> --" and run the rest as the caller
fr = os.path.join(T, "fake-runuser")
open(fr, "w").write('#!/bin/sh\nshift 2\nexec "$@"\n')
os.chmod(fr, 0o755)
src = open(SRC, encoding="utf-8").read()
a, b = src.index("# ── CONSTANTS"), src.index("# ── END CONSTANTS ──")
shipped = set(re.findall(r"^([A-Z_]+) =", src[a:b], re.M))
consts = {"HOSTNAME": '"dawntrader-agent"', "ROOT": repr(T), "RUNUSER": repr([fr])}
check("the test block sets exactly the shipped constants", shipped == set(consts), str(shipped))
tested = os.path.join(T, "dt-install-drift")
open(tested, "w").write(src[:a] + "".join("%s = %s\n" % kv for kv in consts.items()) + src[b:])

# the committed side: a bare repo at <T>/srv/dawntrader-backup.git with the helsinki files
work = os.path.join(T, "work")
os.makedirs(work)
sh("git", "init", "-q", work)
key = os.path.join(T, "root/.ssh/dtmint_ed25519")
os.makedirs(os.path.dirname(key))
sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key)
pub = " ".join(open(key + ".pub").read().split()[:2])
FILES = {
    "comms-infra/agent-staging-session": ("/usr/local/bin/agent-staging-session", 0o750),
    "comms-infra/systemd/agent-staging-session.service": ("/etc/systemd/system/agent-staging-session.service", 0o644),
    "comms-infra/systemd/agent-staging-session.timer": ("/etc/systemd/system/agent-staging-session.timer", 0o644),
    "comms-infra/systemd/onfailure.conf": ("/etc/systemd/system/agent-staging-session.service.d/onfailure.conf", 0o644),
    "comms-infra/staging/dt-install-drift": ("/usr/local/sbin/dt-install-drift", 0o700),
    "comms-infra/staging/systemd/dt-install-drift.service": ("/etc/systemd/system/dt-install-drift.service", 0o644),
    "comms-infra/staging/systemd/dt-install-drift.timer": ("/etc/systemd/system/dt-install-drift.timer", 0o644),
}
for rp in list(FILES) + ["comms-infra/staging/dtmint-authorized_keys"]:
    dst = os.path.join(work, rp)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if rp.endswith("dtmint-authorized_keys"):
        open(dst, "w").write('restrict,command="x" %s test\n' % pub)
    else:
        shutil.copyfile(os.path.join(REPO_SRC, rp[len("comms-infra/"):]), dst)
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, "-c", "user.email=t@t", "-c", "user.name=t", "commit", "-qm", "t")
bare = os.path.join(T, "srv/dawntrader-backup.git")
sh("git", "clone", "-q", "--bare", work, bare)
sh("git", "-C", bare, "update-ref", "refs/heads/migration/aws-supabase", "HEAD")
open(os.path.join(bare, "DT_SYNC_PASS"), "w").write("%d now\n" % time.time())


def install_all():
    for rp, (inst, mode) in FILES.items():
        dst = T + inst
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        shutil.copyfile(os.path.join(work, rp), dst)
        os.chmod(dst, mode)
    # the Helsinki manifest lists onfailure.conf a second time for dt-install-drift
    d2 = T + "/etc/systemd/system/dt-install-drift.service.d/onfailure.conf"
    os.makedirs(os.path.dirname(d2), exist_ok=True)
    shutil.copyfile(os.path.join(work, "comms-infra/systemd/onfailure.conf"), d2)
    os.chmod(d2, 0o644)


def run():
    r = subprocess.run([sys.executable, tested], capture_output=True, text=True, timeout=120)
    return r.returncode, r.stdout + r.stderr


install_all()
c, o = run()
check("clean install: exit 0, PASS, every file OK, the key pairs", c == 0 and "PASS" in o and o.count("\nOK") + o.startswith("OK") >= 9
      and "mint key pairs" in o, o)

# THE CONTROL: a deliberately edited installed copy fails
p = T + "/usr/local/bin/agent-staging-session"
open(p, "a").write("# hand edit\n")
c, o = run()
check("CONTROL: an edited copy -> DRIFT, exit 1", c == 1 and "DRIFT    %s" % p in o and "FAIL (1 problem)" in o, o)
install_all()

os.chmod(p, 0o755)
c, o = run()
check("a wrong mode -> PERM", c == 1 and "PERM     %s mode/owner is 755" % p in o, o)
install_all()

os.unlink(T + "/etc/systemd/system/agent-staging-session.timer")
c, o = run()
check("a missing file -> MISSING", c == 1 and "MISSING  %s/etc/systemd/system/agent-staging-session.timer" % T in o, o)
install_all()

tgt = T + "/usr/local/sbin/dt-install-drift"
os.unlink(tgt)
os.symlink(os.path.join(work, "comms-infra/staging/dt-install-drift"), tgt)
c, o = run()
check("a symlink in place of a file is not followed -> MISSING", c == 1 and "cannot be read as a regular file" in o, o)
os.unlink(tgt)
install_all()

open(os.path.join(bare, "DT_SYNC_PASS"), "w").write("%d old\n" % (time.time() - 5 * 3600))
c, o = run()
check("a stale source -> SOURCE, not DRIFT", c == 1 and "SOURCE   the committed source was last refreshed" in o and "DRIFT" not in o, o)
open(os.path.join(bare, "DT_SYNC_PASS"), "w").write("%d now\n" % time.time())

os.rename(key, key + ".x")
sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key)
c, o = run()
check("a mint key that is not the committed one -> STATE", c == 1 and "is NOT the one in the committed" in o, o)
os.replace(key + ".x", key)

consts2 = dict(consts, HOSTNAME='"some-other-box"')
open(tested, "w").write(src[:a] + "".join("%s = %s\n" % kv for kv in consts2.items()) + src[b:])
c, o = run()
check("an unknown host is a FAIL, never a silent pass", c == 1 and "has no manifest" in o, o)

# the staging checks (accounts may not exist on this box; only the STATE lines are asserted)
consts3 = dict(consts, HOSTNAME='"dawntrader-staging"')
open(tested, "w").write(src[:a] + "".join("%s = %s\n" % kv for kv in consts3.items()) + src[b:])
os.makedirs(T + "/var/lib/dt-api", exist_ok=True)
open(T + "/var/lib/dt-api/page.json", "w").write('{"ts": "t", "kind": "token-refused", "detail": "d"}')
os.makedirs(T + "/var/lib/dt-api-setter", exist_ok=True)
open(T + "/var/lib/dt-api-setter/marker.json", "w").write("{}")
c, o = run()
check("staging: a dt-api page and a setter marker are each a STATE failure", c == 1 and "raised a PAGE at t: token-refused" in o
      and "interrupted setter run" in o, o)
check("an unreadable source still runs the page and marker checks, and says files were NOT compared",
      "installed files NOT compared" in o and "raised a PAGE" in o, o)

print("drift suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
