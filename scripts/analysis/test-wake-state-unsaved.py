"""B-WAKE-STATE-UNSAVED-LOUD (#1151): a wake watcher that cannot save, or cannot read, its position says so and still ends.
usage: python scripts/analysis/test-wake-state-unsaved.py [FILTER.py]
Run against the pre-fix blob as the control: every failure-arm case below FAILS there (stated per case).

THE DENY, per platform (Langston Step-2 C2) — write denied, READ PRESERVED, so the run reaches the save instead of dying on
the load: POSIX `chmod 0500` on the state directory (non-root only: root's DAC override denies nothing); Windows an ACL deny
of WD,AD (create file / add subdirectory) on the directory for the current user. Every failure-arm case FIRST checks that a
direct write into the directory raises OSError (Langston Step-1 C1): a deny that reports success while the write still goes
through FAILS LOUDLY; a platform or uid that cannot deny at all is a SKIP with the reason printed and counted (Step-2 C3).
"""
import json, os, subprocess, sys, tempfile, time

ROOT = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
LOG = "/var/log/cc-discord-inbox.jsonl"
fails = skips = passes = 0
UID = os.geteuid() if hasattr(os, "geteuid") else None
print(f"filter: {FILTER}\nplatform: {os.name} · effective uid: {UID}")


def can_deny():
    if os.name == "nt":
        return True, ""
    if UID == 0:
        return False, "running as root: chmod cannot deny a write (DAC override)"
    return True, ""


def deny(d):
    if os.name == "nt":
        subprocess.run(["icacls", d, "/deny", f"{os.environ['USERNAME']}:(WD,AD)"], capture_output=True, check=True)
    else:
        os.chmod(d, 0o500)


def allow(d):
    if os.name == "nt":
        subprocess.run(["icacls", d, "/remove:d", os.environ["USERNAME"]], capture_output=True, check=True)
    else:
        os.chmod(d, 0o700)


def write_refused(d):
    """The control: True only if creating a file in d raises OSError right now."""
    probe = os.path.join(d, f"probe.{os.getpid()}")
    try:
        open(probe, "w").close()
    except OSError:
        return True
    os.remove(probe)
    return False


def setup(state=None):
    d = tempfile.mkdtemp(prefix="wakeunsaved-"); lr = tempfile.mkdtemp(prefix="wakeunsaved-lease-")
    st = os.path.join(d, "CC-A.json")
    open(st, "w", encoding="utf-8").write(json.dumps(state if state is not None else {"pos": {}}))
    return d, lr, st


def run(args, d_lr_st, inp=""):
    d, lr, st = d_lr_st
    return subprocess.run([sys.executable, FILTER, "CC-A", *args, "--state", st, "--lease-root", lr],
                          input=inp.encode("utf-8"), capture_output=True, timeout=120)


def wake_input(text):
    row = json.dumps({"ts": "2026-10-07T06:00:00+00:00", "kind": "langston_outbound", "text": text})
    return "\n".join([f"==> {LOG} <==", f"#@AT {LOG} 7 0", f"#@POS {LOG} 7 0", row, f"#@POS {LOG} 7 400", "#@CAUGHTUP"]) + "\n"


def report(name, ok, detail):
    global fails, passes
    if ok: passes += 1
    else: fails += 1
    print(f"  {'PASS' if ok else '** FAIL **':10} {name} ({detail})")


def skip(name, why):
    global skips
    skips += 1
    print(f"  SKIP       {name}: {why}")


def denied_case(name, fn):
    ok, why = can_deny()
    if not ok:
        skip(name, why); return
    fn()


# OBJ-1 — a save that fails AFTER a delivery: the wake prints, the line names the dir and errno, the run exits 0, the
# position is not advanced, and a second pass prints the wake and the line again. Pre-fix: exit 1, no line.
def obj1():
    s = setup(); d = s[0]
    before = open(s[2], encoding="utf-8").read()
    deny(d)
    try:
        if not write_refused(d):
            report("OBJ-1 control", False, "the deny reported success but a write still went through"); return
        p1 = run(["--once"], s, wake_input("OLD Claude — unsaved wake one."))
        p2 = run(["--once"], s, wake_input("OLD Claude — unsaved wake one."))
    finally:
        allow(d)
    after = open(s[2], encoding="utf-8").read()
    ok = (b"unsaved wake one" in p1.stdout and b"WATCHER-STATE-UNSAVED:" in p1.stderr and d.encode() in p1.stderr
          and b"errno" in p1.stderr and p1.returncode == 0 and b"Traceback" not in p1.stderr and after == before
          and b"unsaved wake one" in p2.stdout and b"WATCHER-STATE-UNSAVED:" in p2.stderr and p2.returncode == 0)
    report("OBJ-1 a failed save after a delivery ends the run and says so, every pass", ok,
           f"rc={p1.returncode}/{p2.returncode}, line={b'WATCHER-STATE-UNSAVED:' in p1.stderr}, state_unchanged={after == before}")


# OBJ-2 — permissions restored: the delivery saves, no line, and the next pass from the saved position delivers nothing.
def obj2():
    s = setup()
    p1 = run(["--once"], s, wake_input("OLD Claude — saved wake."))
    st = json.load(open(s[2], encoding="utf-8"))
    pos = (st.get("pos") or {}).get(LOG)
    inp2 = "\n".join([f"==> {LOG} <==", f"#@AT {LOG} 7 400", "#@CAUGHTUP"]) + "\n"
    p2 = run(["--once"], s, inp2)
    ok = (p1.returncode == 0 and b"WATCHER-STATE-UNSAVED" not in p1.stderr and pos == [7, 400]
          and b"saved wake" not in p2.stdout and p2.returncode == 3)
    report("OBJ-2 writable: the position saves and is not re-delivered", ok, f"rc={p1.returncode}/{p2.returncode}, pos={pos}")


# OBJ-3a — the stale-resume notice (:836): the notice prints, the line prints at the notice AND again at the end of input
# (twice, by design), exit 0 (the notice is a delivery). Pre-fix: exit 1 right after the notice, no line.
def obj3a():
    s = setup({"pos": {}, "stale_from": "2026-10-06T10:00:00Z"}); d = s[0]
    deny(d)
    try:
        if not write_refused(d):
            report("OBJ-3a control", False, "the deny reported success but a write still went through"); return
        p = run(["--once"], s, "")
    finally:
        allow(d)
    n = p.stderr.count(b"WATCHER-STATE-UNSAVED:")
    ok = b"resumed after more than" in p.stdout and n == 2 and p.returncode == 0 and b"Traceback" not in p.stderr
    report("OBJ-3a the stale-resume notice still ends the run, the line twice", ok, f"rc={p.returncode}, lines={n}")


# OBJ-3b — end of input with nothing delivered (:1148): exit 3, the line as a DIAGNOSTIC. Pre-fix: exit 1, no line.
def obj3b():
    s = setup(); d = s[0]
    deny(d)
    try:
        if not write_refused(d):
            report("OBJ-3b control", False, "the deny reported success but a write still went through"); return
        p = run(["--once"], s, "")
    finally:
        allow(d)
    ok = p.returncode == 3 and b"WATCHER-STATE-UNSAVED:" in p.stderr and b"Traceback" not in p.stderr and not p.stdout.strip()
    report("OBJ-3b end of input, nothing delivered: exit 3 and the diagnostic line", ok, f"rc={p.returncode}")


# OBJ-4 — the residual (Langston C2): a keepalive saves and writes .alive (mtime T); the dir is then denied and a wake is
# delivered: the line prints, exit 0, and .alive is still at T — fresh, not rewritten, while no watcher will be running.
def obj4():
    s = setup(); d, lr, st = s
    pr = subprocess.Popen([sys.executable, FILTER, "CC-A", "--once", "--state", st, "--lease-root", lr],
                          stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pr.stdin.write(f"#@KEEPALIVE 2026-10-07T06:00:00Z\n".encode()); pr.stdin.flush()
    alive = st + ".alive"
    for _ in range(100):
        if os.path.exists(alive): break
        time.sleep(0.1)
    t0 = os.path.getmtime(alive) if os.path.exists(alive) else None
    time.sleep(1.1)
    deny(d)
    try:
        if not write_refused(d):
            pr.kill(); report("OBJ-4 control", False, "the deny reported success but a write still went through"); return
        out, err = pr.communicate(wake_input("OLD Claude — residual wake.").encode(), timeout=120)
    finally:
        allow(d)
    t1 = os.path.getmtime(alive) if os.path.exists(alive) else None
    ok = (t0 is not None and t1 == t0 and b"residual wake" in out and b"WATCHER-STATE-UNSAVED:" in err and pr.returncode == 0)
    report("OBJ-4 residual pinned: exit 0 with .alive still fresh and not rewritten", ok,
           f"rc={pr.returncode}, alive_t0={t0}, alive_t1={t1}")


# OBJ-8 — the stale reset in --positions (:793): the line names the dir, the errno and the stale_from time, no positions
# are printed, the filter exits 1 (the arm's `|| break` ends the task; Step 7 reads the TEXT). Then, writable: the reset
# saves and the next --once prints the stale notice. Pre-fix: a traceback, exit 1, no line.
def obj8():
    old = {"pos": {LOG: [7, 100]}, "saved_epoch": time.time() - 13 * 3600, "saved_at": "2026-10-06T17:00:00Z"}
    s = setup(old); d = s[0]
    deny(d)
    try:
        if not write_refused(d):
            report("OBJ-8 control", False, "the deny reported success but a write still went through"); return
        p = run(["--positions"], s)
    finally:
        allow(d)
    ok1 = (p.returncode == 1 and not p.stdout.strip() and b"WATCHER-STATE-UNSAVED:" in p.stderr
           and b"2026-10-06T17:00:00Z" in p.stderr and b"Traceback" not in p.stderr)
    p2 = run(["--positions"], s)
    p3 = run(["--once"], s, "")
    ok2 = p2.returncode == 0 and b":end" in p2.stdout and p3.stdout.count(b"resumed after more than") == 1
    report("OBJ-8 a failed stale reset ends the task with the line and the sweep time", ok1, f"rc={p.returncode}")
    report("OBJ-8 restored: the reset saves and the next pass prints the stale notice once", ok2, f"rc={p2.returncode}/{p3.returncode}")


# C1 — a state that exists but cannot be READ refuses (a directory at its path; portable, no deny needed). Pre-fix: a
# traceback from open(); the refusal must never be a silent empty start at the tail.
def c1():
    d = tempfile.mkdtemp(prefix="wakeunread-"); lr = tempfile.mkdtemp(prefix="wakeunread-lease-")
    st = os.path.join(d, "CC-A.json"); os.mkdir(st)
    p = subprocess.run([sys.executable, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr],
                       capture_output=True, timeout=60)
    ok = p.returncode == 1 and not p.stdout.strip() and b"WATCHER-STATE-UNREADABLE:" in p.stderr and b"Traceback" not in p.stderr
    report("C1 an unreadable state refuses with a line, never an empty start", ok, f"rc={p.returncode}")


denied_case("OBJ-1", obj1)
obj2()
denied_case("OBJ-3a", obj3a)
denied_case("OBJ-3b", obj3b)
denied_case("OBJ-4", obj4)
denied_case("OBJ-8", obj8)
c1()
print(f"\n{passes} passed, {fails} failed, {skips} skipped (uid {UID}, platform {os.name})")
print("ALL PASS" if fails == 0 else f"{fails} FAILED")
sys.exit(0 if fails == 0 else 1)
