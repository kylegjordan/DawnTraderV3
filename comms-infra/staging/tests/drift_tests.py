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
    consts = {"HOSTNAME": repr(host), "ROOT": repr(T), "RUNUSER": repr([fr]), "SYSTEMCTL": repr(fs)}
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
                    "agent-unit-failure@dt-install-drift.service": {"fragment": SS + "agent-unit-failure@.service"}},
          "timers": {"agent-staging-session.timer": {"is-enabled": "enabled", "is-active": "active"},
                     "dt-install-drift.timer": {"is-enabled": "enabled", "is-active": "active"}}}
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
# so the primary check passes, while %staff resolves to the same gid and would apply
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

print("drift suite: %d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
