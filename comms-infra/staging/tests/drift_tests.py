#!/usr/bin/env python3
"""dt-install-drift suite (run as root on Helsinki): a COPY of the committed checker whose only
difference is its CONSTANTS block, pointed at a throwaway tree holding a real bare repo, real
installed files, a real ed25519 key, a fake runuser (runs git as the caller) and a fake systemctl
(answers from a JSON file). The CONTROL the pre-audit requires: a deliberately edited installed
copy FAILS. Judge by exit code."""
import json
import os
import re
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.abspath(__file__))
REPO_SRC = os.path.normpath(os.path.join(HERE, "..", ".."))       # comms-infra/
SRC = os.environ.get("DRIFT_SRC") or os.path.join(HERE, "..", "dt-install-drift")
PASS = FAIL = 0
NL = chr(10)


def check(name, ok, detail=""):
    global PASS, FAIL
    if ok:
        PASS += 1
    else:
        FAIL += 1
        print("FAIL: %s %s" % (name, detail))


def sh(*a, env=None):
    return subprocess.run(list(a), check=True, capture_output=True, text=True, env=env).stdout.strip()


T = tempfile.mkdtemp(prefix="drift-t-")
fr = os.path.join(T, "fake-runuser")
open(fr, "w").write("#!/bin/sh" + NL + "shift 2" + NL + 'exec "$@"' + NL)
os.chmod(fr, 0o755)
SYSJ = os.path.join(T, "systemctl.json")
fs = os.path.join(T, "fake-systemctl")
open(fs, "w").write('''#!/usr/bin/env python3
import json, sys
st = json.load(open(%r))
a = sys.argv[1:]
if a[0] == "show":
    u = st["units"].get(a[-1])
    if u is None:
        print("LoadState=not-found"); print("NeedDaemonReload=no"); print("DropInPaths="); sys.exit(0)
    print("LoadState=" + u.get("load", "loaded")); print("NeedDaemonReload=" + u.get("reload", "no"))
    print("DropInPaths=" + " ".join(u.get("dropins", []))); print("FragmentPath=" + u.get("fragment", ""))
elif a[0] in ("is-enabled", "is-active"):
    v = st["timers"].get(a[1], {}).get(a[0], "disabled" if a[0] == "is-enabled" else "inactive")
    print(v); sys.exit(0 if v in ("enabled", "active") else 1)
''' % SYSJ)
os.chmod(fs, 0o755)

src = open(SRC, encoding="utf-8").read()
a, b = src.index("# ── CONSTANTS"), src.index("# ── END CONSTANTS ──")
shipped = set(re.findall(r"^([A-Z_]+) =", src[a:b], re.M))
tested = os.path.join(T, "dt-install-drift")


def write_copy(host):
    consts = {"HOSTNAME": repr(host), "ROOT": repr(T), "RUNUSER": repr([fr]), "SYSTEMCTL": repr(fs),
              "ALERT_NPM": repr(["/bin/true"]), "SSHD": repr("/bin/false"), "SSH_KEYGEN": repr("/usr/bin/ssh-keygen")}
    open(tested, "w").write(src[:a] + "".join("%s = %s\n" % kv for kv in consts.items()) + src[b:])
    return consts


check("the test block sets exactly the shipped constants", shipped == set(write_copy("dawntrader-agent")), str(shipped))

# ── the committed side: a bare repo at <T>/srv/dawntrader-backup.git ──
work = os.path.join(T, "work")
os.makedirs(work)
sh("git", "init", "-q", work)
key = os.path.join(T, "root/.ssh/dtmint_ed25519")
os.makedirs(os.path.dirname(key))
sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key)
pub = " ".join(open(key + ".pub").read().split()[:2])
open(os.path.join(T, "root/.ssh/known_hosts"), "w").write("188.245.193.8 " + pub + NL)
FILES = {
    "comms-infra/agent-staging-session": ("/usr/local/bin/agent-staging-session", 0o750),
    "comms-infra/systemd/agent-staging-session.service": ("/etc/systemd/system/agent-staging-session.service", 0o644),
    "comms-infra/systemd/agent-staging-session.timer": ("/etc/systemd/system/agent-staging-session.timer", 0o644),
    "comms-infra/systemd/onfailure.conf": ("/etc/systemd/system/agent-staging-session.service.d/onfailure.conf", 0o644),
    "comms-infra/staging/dt-install-drift": ("/usr/local/sbin/dt-install-drift", 0o700),
    "comms-infra/staging/systemd/dt-install-drift.service": ("/etc/systemd/system/dt-install-drift.service", 0o644),
    "comms-infra/staging/systemd/dt-install-drift.timer": ("/etc/systemd/system/dt-install-drift.timer", 0o644),
    "comms-infra/systemd/agent-unit-failure@.service": ("/etc/systemd/system/agent-unit-failure@.service", 0o644),
    "comms-infra/tools/agent-unit-failure-alert": ("/usr/local/bin/agent-unit-failure-alert", 0o755),
    "comms-infra/discord/dt-deploy-notice.py": ("/usr/local/bin/dt-deploy-notice", 0o755),
    "comms-infra/systemd/dt-deploy-notice.service": ("/etc/systemd/system/dt-deploy-notice.service", 0o644),
    "comms-infra/systemd/dt-deploy-notice.timer": ("/etc/systemd/system/dt-deploy-notice.timer", 0o644),
}
for rp in list(FILES) + ["comms-infra/staging/dtmint-authorized_keys"]:
    dst = os.path.join(work, rp)
    os.makedirs(os.path.dirname(dst), exist_ok=True)
    if rp.endswith("dtmint-authorized_keys"):
        open(dst, "w").write('restrict,command="x" %s test' % pub + NL)
    else:
        shutil.copyfile(os.path.join(REPO_SRC, rp[len("comms-infra/"):]), dst)
GIT_ID = ["-c", "user.email=t@t", "-c", "user.name=t"]
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "t")
C1 = sh("git", "-C", work, "rev-parse", "HEAD")
bare = os.path.join(T, "srv/dawntrader-backup.git")
sh("git", "clone", "-q", "--bare", work, bare)
sh("git", "-C", bare, "update-ref", "refs/heads/migration/aws-supabase", C1)
os.makedirs(T + "/var/lib/dt-install-drift")
os.makedirs(T + "/run")                            # exists on every real box (tmpfs)
os.chmod(T + "/var/lib/dt-install-drift", 0o755)
os.makedirs(T + "/var/lib/dt-deploy-notice")      # B-DEPLOY-WINDOW-GUARD: systemd StateDirectory, langston-owned
os.chmod(T + "/var/lib/dt-deploy-notice", 0o755)
shutil.chown(T + "/var/lib/dt-deploy-notice", "langston", "langston")
os.makedirs(T + "/var/log/dt-deploy-notice")         # B-2: the watcher's LogsDirectory, langston-owned
os.chmod(T + "/var/log/dt-deploy-notice", 0o755)
shutil.chown(T + "/var/log/dt-deploy-notice", "langston", "langston")


def stamp(age=0):
    open(os.path.join(bare, "DT_SYNC_PASS"), "w").write("%d x" % (time.time() - age) + NL)


def installed(sha):
    f = T + "/var/lib/dt-install-drift/installed.sha"
    open(f, "w").write(sha + NL)
    os.chmod(f, 0o644)


SS = "/etc/systemd/system/"


def systemd(**over):
    st = {"units": {"agent-staging-session.service": {"fragment": SS + "agent-staging-session.service", "dropins": [SS + "agent-staging-session.service.d/onfailure.conf"]},
                    "agent-staging-session.timer": {"fragment": SS + "agent-staging-session.timer"},
                    "dt-install-drift.service": {"fragment": SS + "dt-install-drift.service", "dropins": [SS + "dt-install-drift.service.d/onfailure.conf"]},
                    "dt-install-drift.timer": {"fragment": SS + "dt-install-drift.timer"},
                    "agent-unit-failure@agent-staging-session.service": {"fragment": SS + "agent-unit-failure@.service"},
                    "agent-unit-failure@dt-install-drift.service": {"fragment": SS + "agent-unit-failure@.service"},
                    "dt-deploy-notice.service": {"fragment": SS + "dt-deploy-notice.service"},
                    "dt-deploy-notice.timer": {"fragment": SS + "dt-deploy-notice.timer"},
                    "agent-unit-failure@dt-deploy-notice.service": {"fragment": SS + "agent-unit-failure@.service"}},
          "timers": {"agent-staging-session.timer": {"is-enabled": "enabled", "is-active": "active"},
                     "dt-install-drift.timer": {"is-enabled": "enabled", "is-active": "active"},
                     "dt-deploy-notice.timer": {"is-enabled": "enabled", "is-active": "active"}}}
    for k, v in over.items():
        st[k].update(v)
    json.dump(st, open(SYSJ, "w"))


def install_all():
    for rp, (inst, mode) in FILES.items():
        dst = T + inst
        os.makedirs(os.path.dirname(dst), exist_ok=True)
        if os.path.islink(dst):
            os.unlink(dst)
        shutil.copyfile(os.path.join(work, rp), dst)
        os.chmod(dst, mode)
    d2 = T + "/etc/systemd/system/dt-install-drift.service.d/onfailure.conf"
    os.makedirs(os.path.dirname(d2), exist_ok=True)
    shutil.copyfile(os.path.join(work, "comms-infra/systemd/onfailure.conf"), d2)
    os.chmod(d2, 0o644)


def run(timeout=180):
    try:
        r = subprocess.run([sys.executable, tested], capture_output=True, text=True, timeout=timeout)
    except subprocess.TimeoutExpired:
        return 124, "TIMEOUT: dt-install-drift did not finish in %d s" % timeout
    return r.returncode, r.stdout + r.stderr


def classes():
    try:
        return [tuple(ln.split(" ", 1)) for ln in open(T + "/run/dt-install-drift.classes").read().splitlines() if ln]
    except FileNotFoundError:
        return None


stamp(); installed(C1); systemd(); install_all()
c, o = run()
check("clean install: exit 0, PASS, every file OK, the key pairs", c == 0 and "PASS" in o and o.count(NL + "OK") >= 9
      and "mint key pairs" in o, o)
check("the classes file is written (empty on a PASS)", open(T + "/run/dt-install-drift.classes").read().strip() == ""
      if os.path.exists(T + "/run/dt-install-drift.classes") else False)

p = T + "/usr/local/bin/agent-staging-session"
open(p, "a").write("# hand edit" + NL)
c, o = run()
check("CONTROL: an edited copy -> DRIFT, exit 1", c == 1 and "DRIFT    %s" % p in o and "FAIL (1 problem)" in o, o)
check("... and the class DRIFT reaches the classes file", ("DRIFT", p) in (classes() or []), str(classes()))
p2 = T + "/usr/local/bin/agent-unit-failure-alert"
open(p2, "a").write("# hand edit" + NL)
c, o = run()
check("r3 S2: two DRIFT files are two (class, subject) lines — one alert each",
      ("DRIFT", p) in classes() and ("DRIFT", p2) in classes() and len(classes()) == 2, str(classes()))
install_all()

# r3 S6: a file installed by ANOTHER flow at a later sha records its own sha, and is not drift
open(os.path.join(work, "comms-infra/tools/agent-unit-failure-alert"), "a").write("# the other flow's change" + NL)
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "other-flow")
CO = sh("git", "-C", work, "rev-parse", "HEAD")
sh("git", "-C", bare, "fetch", "-q", work, "HEAD:refs/heads/migration/aws-supabase")
shutil.copyfile(os.path.join(work, "comms-infra/tools/agent-unit-failure-alert"), p2)
os.chmod(p2, 0o755)
c, o = run()
check("r3 S6 CONTROL: the other flow's install with NO per-file line -> DRIFT against the default sha", c == 1 and "DRIFT    %s" % p2 in o, o)
open(T + "/var/lib/dt-install-drift/installed.sha", "w").write(C1 + NL + CO + " comms-infra/tools/agent-unit-failure-alert" + NL)
c, o = run()
check("r3 S6: with its per-file line (<sha> <repo path>) -> OK at its own sha, PASS", c == 0 and "OK       %s = comms-infra/tools/agent-unit-failure-alert at %s" % (p2, CO[:12]) in o, o)
open(T + "/var/lib/dt-install-drift/installed.sha", "w").write(C1 + NL + CO + " comms-infra/not-in-the-manifest" + NL)
c, o = run()
check("r3 S6: a per-file line for a path this box does not install -> INSTALL", c == 1 and "the installed sha file is not" in o, o)
installed(C1)
sh("git", "-C", bare, "update-ref", "refs/heads/migration/aws-supabase", C1)
sh("git", "-C", work, "reset", "-q", "--hard", C1)   # the later cases build on C1
install_all()

# r3 S4: a stamp with NO content (a failed fetch truncates FETCH_HEAD and refreshes its mtime) is not fresh
open(os.path.join(bare, "DT_SYNC_PASS"), "w").write("")
c, o = run()
check("r3 S4: an EMPTY stamp with a fresh mtime -> SOURCE, not fresh", c == 1 and "no freshness stamp has content" in o, o)
stamp()

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
check("a symlink in place of a file is not followed", c == 1 and "cannot be read as a regular file" in o, o)
install_all()

# PENDING: a reviewed change on the branch that is not yet installed is NOT drift ...
open(os.path.join(work, "comms-infra/agent-staging-session"), "a").write("# a reviewed change" + NL)
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "t2")
C2 = sh("git", "-C", work, "rev-parse", "HEAD")
sh("git", "-C", bare, "fetch", "-q", work, "HEAD:refs/heads/migration/aws-supabase")
c, o = run()
check("a recent un-installed change -> PENDING, still PASS (a review window is not drift)",
      c == 0 and "PENDING  comms-infra/agent-staging-session changed" in o and "DRIFT" not in o, o)
# ... but one that has waited over a week pages
old = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime(time.time() - 10 * 86400))
open(os.path.join(work, "comms-infra/systemd/agent-staging-session.timer"), "a").write("# old change" + NL)
sh("git", "-C", work, "add", "-A")
env = dict(os.environ, GIT_COMMITTER_DATE=old, GIT_AUTHOR_DATE=old)
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "t3", env=env)
sh("git", "-C", bare, "fetch", "-q", work, "HEAD:refs/heads/migration/aws-supabase")
c, o = run()
check("an un-installed change over 7 days old -> FAIL", c == 1 and "has waited over 7 days" in o, o)
open(os.path.join(work, "comms-infra/systemd/agent-staging-session.timer"), "a").write("# a fresh follow-up" + NL)
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "t4")
sh("git", "-C", bare, "fetch", "-q", work, "HEAD:refs/heads/migration/aws-supabase")
c, o = run()
check("r2: a fresh follow-up does NOT reset the clock of a week-old uninstalled change", c == 1 and "has waited over 7 days" in o, o)
sh("git", "-C", bare, "update-ref", "refs/heads/migration/aws-supabase", C1)

os.unlink(T + "/var/lib/dt-install-drift/installed.sha")
c, o = run()
check("no recorded installed sha -> FAIL, and no file is compared", c == 1 and "no installed sha" in o and "DRIFT" not in o, o)
sh("git", "-C", work, "checkout", "-q", "-b", "side", C1)
open(os.path.join(work, "x"), "w").write("x")
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "side")
SIDE = sh("git", "-C", work, "rev-parse", "HEAD")
sh("git", "-C", bare, "fetch", "-q", work, "side:refs/heads/side")
installed(SIDE)
c, o = run()
check("an installed sha in the source but NOT on the reviewed branch -> INSTALL", c == 1 and "NOT on refs/heads/migration/aws-supabase" in o, o)
installed("ab" * 20)
c, o = run()
check("r2/C8: an installed sha the source has not fetched yet -> SOURCE (mirror health), no INSTALL, no DRIFT",
      c == 1 and "not in the source yet" in o and "INSTALL" not in open(T + "/run/dt-install-drift.classes").read() and "DRIFT" not in o, o)
installed(C1)

stamp(age=5 * 3600)
c, o = run()
check("a stale source -> SOURCE, and the installed comparison still runs clean", c == 1 and "SOURCE   the committed source" in o
      and ("SOURCE", "stamp") in classes()
      and "DRIFT" not in o and o.count(NL + "OK") >= 9, o)
stamp()

systemd(units={"dt-install-drift.service": {"fragment": SS + "dt-install-drift.service", "reload": "yes", "dropins": [SS + "dt-install-drift.service.d/onfailure.conf"]}})
c, o = run()
check("a unit changed on disk but not reloaded -> UNIT", c == 1 and "has not reloaded it" in o, o)
systemd(units={"dt-install-drift.service": {"fragment": SS + "dt-install-drift.service", "dropins": [SS + "dt-install-drift.service.d/onfailure.conf",
                                                        SS + "dt-install-drift.service.d/zz.conf"]}})
c, o = run()
check("an extra drop-in -> UNIT", c == 1 and "drop-ins are" in o, o)
systemd(timers={"dt-install-drift.timer": {"is-enabled": "disabled", "is-active": "inactive"}})
c, o = run()
check("a timer not enabled/active -> UNIT", c == 1 and "dt-install-drift.timer is-enabled says 'disabled'" in o, o)
systemd(units={"dt-install-drift.timer": {"fragment": SS + "dt-install-drift.timer", "dropins": [SS + "dt-install-drift.timer.d/yearly.conf"]}})
c, o = run()
check("r2: a drop-in on the TIMER -> UNIT", c == 1 and "dt-install-drift.timer drop-ins are" in o, o)
systemd(units={"agent-unit-failure@dt-install-drift.service": {"fragment": SS + "agent-unit-failure@.service",
               "dropins": [SS + "agent-unit-failure@dt-install-drift.service.d/x.conf"]}})
c, o = run()
check("r3 S3: a drop-in on the REAL paging instance (not a probe name) -> UNIT", c == 1
      and "agent-unit-failure@dt-install-drift.service drop-ins are" in o, o)
systemd(units={"dt-install-drift.service": {"fragment": "/etc/systemd/system.control/dt-install-drift.service",
                                            "dropins": [SS + "dt-install-drift.service.d/onfailure.conf"]}})
c, o = run()
check("r2: a higher-priority copy shadowing the installed unit -> UNIT", c == 1 and "a higher-priority copy shadows it" in o, o)
systemd()
os.chmod(T + "/var/lib/dt-install-drift/installed.sha", 0o666)
c, o = run()
check("r2: installed.sha with the wrong mode -> PERM", c == 1 and "installed.sha mode/owner is 666" in o, o)
os.chmod(T + "/var/lib/dt-install-drift/installed.sha", 0o644)

os.rename(key, key + ".x")
sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-f", key)
c, o = run()
check("a mint key that is not the committed one -> STATE", c == 1 and "is NOT the one in the committed" in o, o)
os.replace(key + ".x", key)

kh = os.path.join(T, "root/.ssh/known_hosts")
os.rename(kh, kh + ".x")
open(kh, "w").write("")
c, o = run()
check("root's known_hosts without staging -> STATE", c == 1 and "no entry for staging" in o, o)
os.replace(kh + ".x", kh)

# r3 S8: a file the branch head no longer has is SOURCE ("cannot compare"), never a silent skip or PENDING
os.rename(os.path.join(work, "comms-infra/tools/agent-unit-failure-alert"), os.path.join(T, "aufa.x"))
sh("git", "-C", work, "add", "-A")
sh("git", "-C", work, *GIT_ID, "commit", "-qm", "gone")
sh("git", "-C", bare, "fetch", "-q", work, "HEAD:refs/heads/migration/aws-supabase")
c, o = run()
check("r3 S8: a git read that fails in the PENDING check -> SOURCE naming the file, no PENDING line",
      c == 1 and "cannot compare comms-infra/tools/agent-unit-failure-alert" in o and "PENDING  comms-infra/tools" not in o, o)
sh("git", "-C", bare, "update-ref", "refs/heads/migration/aws-supabase", C1)

write_copy("some-other-box")
c, o = run()
check("an unknown host is a FAIL, never a silent pass", c == 1 and "has no manifest" in o, o)

# the staging checks (accounts may not exist on this box; only the STATE lines are asserted)
write_copy("dawntrader-staging")
os.makedirs(T + "/var/lib/dt-api", exist_ok=True)
open(T + "/var/lib/dt-api/page.json", "w").write('{"ts": "t", "kind": "token-refused", "detail": "d"}')
os.makedirs(T + "/var/lib/dt-api-setter", exist_ok=True)
mk = T + "/var/lib/dt-api-setter/marker.json"
open(mk, "w").write("{}")
open(T + "/etc/shadow", "w").write("dtmint:!:1::::::" + NL + "dtapi:!$6$abc:1::::::" + NL)
open(T + "/etc/sudoers", "w").write("root ALL=(ALL) ALL" + NL + "dtmint ALL=(ALL) NOPASSWD: ALL" + NL +
                                    "@include /etc/sudoers.extra" + NL + "@includedir /etc/sudoers.d" + NL)
open(T + "/etc/sudoers.extra", "w").write("# pulled in by @include" + NL + "dtapi ALL=(root) ALL" + NL)
os.makedirs(T + "/etc/sudoers.d", exist_ok=True)
open(T + "/etc/sudoers.d/zz-everyone", "w").write("ALL ALL=(ALL) NOPASSWD: /bin/true" + NL)
open(T + "/etc/sudoers.d/dtapi", "w").write("deploy ALL=(dtapi) NOPASSWD: /usr/local/bin/dt-api GET *" + NL)
c, o = run()
check("r2: dtmint locked with '!' is flagged (the mint needs '*')", "dtmint's password field is" in o, o)
check("r2: dtapi '!$6$...' (locked with a hash) is NOT flagged", "dtapi has a usable password hash" not in o, o)
check("r2: a grant in the MAIN sudoers file is flagged", "%s/etc/sudoers also mentions" % T in o, o)
check("r3: a file pulled in by @include is followed and flagged", "%s/etc/sudoers.extra also mentions" % T in o, o)
check("r3: a rule for ALL users (in an @includedir file) is flagged", "zz-everyone has a rule for ALL users" in o, o)
check("r3: /etc/sudoers.d/dtapi itself is NOT flagged for naming dtapi", "sudoers.d/dtapi also mentions" not in o, o)
check("a YOUNG setter marker (a run in progress) is not flagged", "interrupted setter run" not in o, o)
os.utime(mk, (time.time() - 3 * 3600, time.time() - 3 * 3600))
c, o = run()
check("staging: a dt-api page and an OLD setter marker are each a STATE failure", c == 1
      and "raised a PAGE at t: token-refused" in o and "interrupted setter run" in o, o)
check("an unreadable source still runs the page and marker checks, and says so", "cannot read" in o
      and "raised a PAGE" in o, o)
cl = classes()
check("the page's own class reaches the classes file (a new class = a new alert)",
      ("PAGE-token-refused", "page") in cl and ("MARKER", "marker") in cl, str(cl))
open(T + "/etc/shadow", "w").write("dtmint:*:1::::::" + NL + "dtapi::1::::::" + NL)
c, o = run()
check("r3: an EMPTY dtapi password field (a usable empty password) is flagged", "dtapi's password field is EMPTY" in o, o)
os.unlink(T + "/var/lib/dt-api/page.json")
os.mkfifo(T + "/var/lib/dt-api/page.json")
c, o = run(timeout=60)
check("r3: a FIFO planted at page.json does not hang the run, and still FAILS as a page",
      c == 1 and "raised a PAGE" in o and "unreadable" in o, o[-300:])
os.unlink(T + "/var/lib/dt-api/page.json")

# ── Gate 1-2 (Langston): a PRIMARY group is invisible to gr_mem — in-process, fake pwd/grp, so the
#    test does not depend on this box's real accounts ──
import contextlib  # noqa: E402
import importlib.util  # noqa: E402
import io  # noqa: E402
import types  # noqa: E402
from importlib.machinery import SourceFileLoader  # noqa: E402
_spec = importlib.util.spec_from_loader("drift_g12", SourceFileLoader("drift_g12", SRC))
DM = importlib.util.module_from_spec(_spec)
_spec.loader.exec_module(DM)
_root = tempfile.mkdtemp(prefix="drift-g12-")
os.makedirs(_root + "/etc")
open(_root + "/etc/shadow", "w").write("dtapi:*:1:0:99999:7:::" + NL + "dtmint:*:1:0:99999:7:::" + NL)
DM.ROOT = _root
_users = {"dtapi": types.SimpleNamespace(pw_shell="/usr/sbin/nologin", pw_gid=2001),
          "dtmint": types.SimpleNamespace(pw_shell="/bin/sh", pw_gid=2002)}
_groups = {2001: "dtapi", 2002: "staff"}                # dtmint's primary group is NOT its own
DM.pwd = types.SimpleNamespace(getpwnam=lambda n: _users[n])
DM.grp = types.SimpleNamespace(getgrall=lambda: [], getgrgid=lambda g: types.SimpleNamespace(gr_name=_groups[g]))


def _accounts_problems():
    DM.PROBLEMS.clear()
    DM.CLASSES.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        DM.check_extra("accounts", {})
    return list(DM.PROBLEMS)


pr = _accounts_problems()
check("Gate 1-2: dtmint's PRIMARY group 'staff' (absent from every gr_mem) is flagged",
      sum("PRIMARY group is staff" in x and "dtmint" in x for x in pr) == 1, str(pr))
_groups[2002] = "dtmint"
pr = _accounts_problems()
check("... and an account whose primary group is its own is NOT flagged (control)", not any("PRIMARY" in x for x in pr), str(pr))
_users["dtapi"].pw_gid = 9999                           # Gate 1-2 r2: an ORPHAN primary gid
pr = _accounts_problems()
check("Gate 1-2 r2: an orphan primary gid (no such group) is REPORTED, not skipped",
      sum("PRIMARY group id 9999 resolves to NO group" in x and "dtapi" in x for x in pr) == 1, str(pr))
_users["dtapi"].pw_gid = 2001
# Gate 1-2 r3 (Langston): a second group NAME on dtapi's own primary gid — getgrgid() answers "dtapi",
# so the primary check passes, while %staff resolves to the same gid and would apply. ORDERING (Langston):
# this fixture puts dtapi first, so getgrgid answers "dtapi". In the reverse /etc/group order getgrgid
# answers "staff", prim_gid stays empty and the PRIMARY check reports "dtapi's PRIMARY group is staff"
# instead — still exactly one true report; the first-case test above covers that path.
_grall = [types.SimpleNamespace(gr_name="dtapi", gr_gid=2001, gr_mem=[]),
          types.SimpleNamespace(gr_name="staff", gr_gid=2001, gr_mem=[]),
          types.SimpleNamespace(gr_name="dtmint", gr_gid=2002, gr_mem=[])]
DM.grp.getgrall = lambda: _grall
pr = _accounts_problems()
check("Gate 1-2 r3: a second group name (staff) sharing dtapi's primary gid is REPORTED, once",
      sum("PRIMARY gid 2001 is ALSO named staff" in x and "dtapi" in x for x in pr) == 1
      and not any("dtmint" in x and "ALSO named" in x for x in pr), str(pr))
_grall[1] = types.SimpleNamespace(gr_name="staff", gr_gid=3000, gr_mem=[])
pr = _accounts_problems()
check("... and with staff on its own gid nothing is reported (control)", not any("ALSO named" in x for x in pr), str(pr))
DM.grp.getgrall = lambda: []
shutil.rmtree(_root)

# ── B-DEPLOY-WINDOW-GUARD (#1249): the deploy_windows check, in-process. Langston BLOCKER-2 / C-15 / C-16: a stale
#    window and a notice-only deploy are raised to THEIR OWNER and stay OFF the verdict; an unusable register, or a
#    check that cannot raise, is ON the verdict under its own subject - never check_extra's generic CHECK page. ──
OBS_SRC = os.environ.get("OBS_SRC") or os.path.join(REPO_SRC, "..", "scripts", "obs-windows.py")
_wr = tempfile.mkdtemp(prefix="drift-win-")
DM.ROOT = _wr
for d in ("/usr/local/bin", "/home/deploy/dawntrader", "/var/lib/dt-install-drift"):
    os.makedirs(_wr + d, exist_ok=True)
shutil.copyfile(OBS_SRC, _wr + "/usr/local/bin/dt-obs-windows")
os.chmod(_wr + "/usr/local/bin/dt-obs-windows", 0o755)
_REG = {"text": None, "err": "fatal: path does not exist"}
_ALERTS = []
_ALERT_RESULT = {"v": None}


def _fake_git(box, *args, binary=False):
    if args[0] == "show":
        return _REG["text"], (None if _REG["text"] is not None else _REG["err"])
    return None, "unexpected git %s" % (args,)


def _fake_raise(key, title, body, meta):
    if _ALERT_RESULT["v"] == "crash":
        raise RuntimeError("boom")
    _ALERTS.append((key, title, body))
    return _ALERT_RESULT["v"]


_OPEN_KEYS = set()
_RESOLVED = []


def _fake_open(prefix):
    return {k for k in _OPEN_KEYS if k.startswith(prefix)}


def _fake_resolve(key, evidence):
    _RESOLVED.append((key, evidence))
    return None


_real_git, _real_raise, _real_open, _real_resolve = DM.git, DM.raise_alert, DM.open_alert_keys, DM.resolve_alert_key
DM.git, DM.raise_alert, DM.open_alert_keys, DM.resolve_alert_key = _fake_git, _fake_raise, _fake_open, _fake_resolve
_BOX = {"ref": "refs/remotes/origin/migration/aws-supabase"}
_H = '{"schema":"deploy-windows/1"}'
_STALE = json.dumps({"type": "open", "batch": "B-OLD", "owner": "cc-b", "opened_at": "2020-01-01T00:00:00Z",
                     "end": "2020-01-02T00:00:00Z", "review_by": "2020-01-03T00:00:00Z", "disturbs": "x", "detail": "y"})
_OPEN = json.dumps({"type": "open", "batch": "B-NOW", "owner": "cc-a", "opened_at": "2020-01-01T00:00:00Z",
                    "end": "2099-01-02T00:00:00Z", "review_by": "2099-01-03T00:00:00Z", "disturbs": "x", "detail": "y"})


def _win(reg_text, notice=None):
    DM.PROBLEMS.clear(); DM.CLASSES.clear(); del _ALERTS[:]; del _RESOLVED[:]
    _REG["text"] = reg_text
    if notice is not None:
        open(_wr + "/home/deploy/dawntrader-deploy.notice", "w").write(notice)
    buf = io.StringIO()
    with contextlib.redirect_stdout(buf):
        try:                                   # the SAME wrapper run() puts round every check (its per-check try, "a check that crashes is a FAIL")
            DM.check_extra("deploy_windows", _BOX)
        except Exception as e:
            DM.out("STATE", "the %s check could not run: %s" % ("deploy_windows", type(e).__name__), "CHECK", "deploy_windows")
    return buf.getvalue()


o = _win(_H + NL + _STALE + NL + _OPEN + NL)
check("windows: a STALE window raises ONE alert to its owner, keyed by batch",
      [a[0] for a in _ALERTS] == ["deploy-window-stale:B-OLD"] and "cc-b" in _ALERTS[0][2], str(_ALERTS))
check("windows: ... and stays OFF the verdict (no problem, an OK line)", DM.PROBLEMS == [] and "OK       deploy_windows: 1 stale" in o,
      str(DM.PROBLEMS) + o)
o = _win(_H + NL + _OPEN + NL)
check("windows: an OPEN window raises nothing and is not a problem (control)", _ALERTS == [] and DM.PROBLEMS == [], o)
o = _win(None)
check("windows: an UNREADABLE register is ON the verdict, subject deploy-windows-register",
      ("WINDOWS", "deploy-windows-register") in DM.CLASSES and "every deploy is" in o, str(DM.CLASSES) + o)
o = _win("not a register" + NL)
check("windows: a MALFORMED register (no header) is ON the verdict, subject deploy-windows-register",
      ("WINDOWS", "deploy-windows-register") in DM.CLASSES and "REGISTER REFUSED" in o, str(DM.CLASSES) + o)
_ALERT_RESULT["v"] = "exit 1"
o = _win(_H + NL + _STALE + NL)
check("windows: an alert that cannot be raised is ON the verdict, subject deploy-windows-alert",
      ("WINDOWS", "deploy-windows-alert") in DM.CLASSES, str(DM.CLASSES) + o)
_ALERT_RESULT["v"] = "crash"
o = _win(_H + NL + _STALE + NL)
check("windows C-16: a crash inside the check is caught as deploy-windows-alert, never check_extra's CHECK class",
      ("WINDOWS", "deploy-windows-alert") in DM.CLASSES and not any(c[0] == "CHECK" for c in DM.CLASSES), str(DM.CLASSES))
_ALERT_RESULT["v"] = None
_N1 = "attempt_at=2026-11-13T21:05:00Z sha=%s by=cc-a in_window=B-NOW/cc-a/open window_notice=notice-only register_sha=%s" % ("b" * 40, "c" * 40)
_N2 = "attempt_at=2026-11-13T22:05:00Z sha=%s by=cc-a in_window=B-NOW/cc-a/open window_notice=alerted register_sha=%s" % ("d" * 40, "c" * 40)
o = _win(_H + NL, notice=_N1 + NL + _N2 + NL)
check("windows C-12: a notice-only deploy line raises ONE alert; an alerted line raises none",
      len(_ALERTS) == 1 and _ALERTS[0][0].startswith("deploy-window-notice-only:") and DM.PROBLEMS == [], str(_ALERTS))
o = _win(_H + NL, notice=_N1 + NL + _N2 + NL)
check("windows C-12: ... and the same line is NOT raised again on the next run", _ALERTS == [], str(_ALERTS))
# Langston gate B attack (2): a window that is no longer stale gets its alert RESOLVED; an unreadable register clears nothing
_OPEN_KEYS.update({"deploy-window-stale:B-OLD", "deploy-window-stale:B-GONE"})
o = _win(_H + NL + _STALE + NL)
check("windows: an open stale-alert whose window is NO LONGER stale is resolved; the still-stale one is not",
      [k for k, _ in _RESOLVED] == ["deploy-window-stale:B-GONE"] and "no longer stale" in _RESOLVED[0][1], str(_RESOLVED))
o = _win(None)
check("windows: an UNREADABLE register clears no alert (control)", _RESOLVED == [], str(_RESOLVED))
o = _win("not a register" + NL)
check("windows: a MALFORMED register clears no alert (control)", _RESOLVED == [], str(_RESOLVED))
_OPEN_KEYS.clear()
DM.git, DM.raise_alert, DM.open_alert_keys, DM.resolve_alert_key = _real_git, _real_raise, _real_open, _real_resolve
# B-4/B-7/B-8/B-9 (Langston, gate B r2-r5): the deploy-notice key - counted by FINGERPRINT with the real ssh-keygen,
# matched as the exact pinned line, over the files sshd -T names. Real ed25519 keys, generated here.
os.makedirs(_wr + "/home/deploy/.ssh", exist_ok=True)


def _mk(name):
    k = os.path.join(_wr, name)
    sh("ssh-keygen", "-q", "-t", "ed25519", "-N", "", "-C", name, "-f", k)
    return " ".join(open(k + ".pub").read().split()[:2])


_KEY, _OTHER = _mk("watcherkey"), _mk("otherkey")
DM.NOTICE_KEY_MATERIAL = _KEY
DM.NOTICE_KEY_FP = sh("ssh-keygen", "-lf", _wr + "/watcherkey.pub").split()[1]
DM.NOTICE_KEY_LINE = "%s %s %s" % (DM.NOTICE_KEY_OPTIONS, _KEY, DM.NOTICE_KEY_COMMENT)
_PAIR = [".ssh/authorized_keys", ".ssh/authorized_keys2"]
_FILES = {"v": (_PAIR, None)}
_real_files = DM.sshd_key_files
DM.sshd_key_files = lambda: _FILES["v"]
DM.NOTICE_KEY_HOME = "/home/deploy"
_GOOD = DM.NOTICE_KEY_LINE
_REV = "from=\"204.168.141.77\" " + _OTHER + " langston@helsinki"


def _keycheck(ak, ak2=None):
    open(_wr + "/home/deploy/.ssh/authorized_keys", "w").write(ak)
    if ak2 is None:
        if os.path.exists(_wr + "/home/deploy/.ssh/authorized_keys2"):
            os.unlink(_wr + "/home/deploy/.ssh/authorized_keys2")
    else:
        open(_wr + "/home/deploy/.ssh/authorized_keys2", "w").write(ak2)
    DM.PROBLEMS.clear(); DM.CLASSES.clear()
    with contextlib.redirect_stdout(io.StringIO()):
        DM.check_extra("deploy_notice_key", {})
    return ("KEYS", "deploy-notice-key") not in DM.CLASSES


for _label, _ak, _ak2, _ok in [
        ("the pinned line beside a reviewer line -> OK", _REV + NL + _GOOD + NL, None, True),
        ("command= dropped -> STATE", _GOOD.replace(',command="/usr/local/bin/dt-deploy-notice-gate"', "") + NL, None, False),
        ("from= widened -> STATE", _GOOD.replace("204.168.141.77", "0.0.0.0/0") + NL, None, False),
        ("no options at all -> STATE", _KEY + " dt-deploy-notice@helsinki" + NL, None, False),
        ("the line missing -> STATE", _REV + NL, None, False),
        ("the pinned line twice -> STATE", _GOOD + NL + _GOOD + NL, None, False),
        ("B-7: an unrestricted copy ABOVE the pinned line -> STATE", _KEY + " unrestricted@dup" + NL + _GOOD + NL, None, False),
        ("B-7: ... BELOW it -> STATE", _GOOD + NL + _KEY + " unrestricted@dup" + NL, None, False),
        ("B-7: the pinned comment on a DIFFERENT key -> STATE", _GOOD.replace(_KEY, _OTHER) + NL, None, False),
        ("B-7: an unrestricted copy in authorized_keys2 -> STATE", _GOOD + NL, _KEY + " unrestricted@ak2" + NL, False),
        ("B-8: Langston's crafted line (a decoy key-type token inside a quoted option) ABOVE the pinned line -> STATE",
         'command="x ssh-ed25519 AAAADECOY; /bin/echo CRAFTED" ' + _KEY + " evil@craft" + NL + _GOOD + NL, None, False),
        ("cert-authority anywhere -> STATE", _GOOD + NL + "cert-authority " + _OTHER + " ca@x" + NL, None, False),
        ("an unparseable junk line beside the pinned line -> OK (sshd skips it too)", "junk junk" + NL + _GOOD + NL, None, True)]:
    check("key: " + _label, _keycheck(_ak, _ak2) == _ok, str(DM.PROBLEMS))
_FILES["v"] = ([".ssh/authorized_keys"], None)
check("B-9: sshd reads a DIFFERENT file set -> STATE", not _keycheck(_GOOD + NL), str(DM.PROBLEMS))
_FILES["v"] = (None, "sshd -T exited 255")
check("B-9: sshd -T cannot be read -> STATE, never a pass", not _keycheck(_GOOD + NL), str(DM.PROBLEMS))
_FILES["v"] = (_PAIR, None)
os.unlink(_wr + "/home/deploy/.ssh/authorized_keys")
DM.PROBLEMS.clear(); DM.CLASSES.clear()
with contextlib.redirect_stdout(io.StringIO()):
    DM.check_extra("deploy_notice_key", {})
check("the file missing -> STATE (fail-closed)", ("KEYS", "deploy-notice-key") in DM.CLASSES, str(DM.PROBLEMS))
_real_kf = DM.key_fingerprints
DM.key_fingerprints = lambda p: (None, "ssh-keygen -lf exited 255")
check("ssh-keygen failing -> STATE, never a pass", not _keycheck(_GOOD + NL), str(DM.PROBLEMS))
DM.key_fingerprints = _real_kf
DM.sshd_key_files = _real_files
# open_alert_keys reads the store by id, latest row wins - against a real file
_af = tempfile.mkdtemp(prefix="drift-af-")
DM.ROOT = _af
os.makedirs(_af + "/var/log/dawntrader")
open(_af + "/var/log/dawntrader/system-alerts.jsonl", "w").write(NL.join(json.dumps(r) for r in [
    {"id": "1", "dedupe_key": "deploy-window-stale:A", "state": "active"},
    {"id": "2", "dedupe_key": "deploy-window-stale:B", "state": "active"},
    {"id": "2", "dedupe_key": "deploy-window-stale:B", "state": "resolved"},
    {"id": "3", "dedupe_key": "other:C", "state": "active"}]) + NL + "not json" + NL)
check("open_alert_keys: latest row per id; resolved and other prefixes excluded",
      DM.open_alert_keys("deploy-window-stale:") == {"deploy-window-stale:A"}, str(DM.open_alert_keys("deploy-window-stale:")))
shutil.rmtree(_af)
DM.ROOT = _wr

# C-9: the per-file pending grace. A 2-day-old change to dt-deploy pages (grace 1); the same age elsewhere does not.
_age = {"v": 2 * 86400}


def _pend_git(box, *args, binary=False):
    if args[0] == "rev-parse":
        return ("old" if args[2].startswith("S1:") else "new"), None
    if args[0] == "log":
        return str(int(time.time() - _age["v"])), None
    return None, "?"


DM.git = _pend_git
DM.PROBLEMS.clear(); DM.CLASSES.clear()
_pbox = {"files": [("scripts/dt-deploy.sh", "/x", 0, "", ""), ("comms-infra/a", "/y", 0, "", "")],
         "pending_days": {"scripts/dt-deploy.sh": 1}}
with contextlib.redirect_stdout(io.StringIO()) as _pb:
    DM.pending(_pbox, {"scripts/dt-deploy.sh": "S1", "comms-infra/a": "S1"}, "S2")
check("C-9: a 2-day-old uninstalled change to dt-deploy pages (its grace is 1 day); another file's does not",
      ("PENDING-STALE", "scripts/dt-deploy.sh") in DM.CLASSES and ("PENDING-STALE", "comms-infra/a") not in DM.CLASSES,
      str(DM.CLASSES) + _pb.getvalue())
DM.git = _real_git
shutil.rmtree(_wr)

print("drift suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
