"""B-WAKE-ARM-EXCLUSIVE (#1140): behavioural tests of the one-watcher-per-session lease, against TEMPORARY lease roots
and state files (never the live ones). Every case states what it expects BEFORE it runs; run it against the installed
pre-lease filter as the control and the lease cases FAIL there.

usage: python scripts/analysis/test-wake-lease.py [FILTER.py] [FOLLOW.py]
Windows only (the lease is a declared no-op off Windows).
"""
import json, os, subprocess, sys, tempfile, time

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(os.path.dirname(HERE))
FILTER = sys.argv[1] if len(sys.argv) > 1 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-filter.py")
FOLLOW = sys.argv[2] if len(sys.argv) > 2 else os.path.join(ROOT, "comms-infra", "laptop", "cc-wake-follow.py")
BASH = r"C:\Program Files\Git\bin\bash.exe"
PY = sys.executable
fails = 0
DUMMIES = []


def say(ok, text):
    global fails
    if not ok:
        fails += 1
    print(f"  {'PASS' if ok else '** FAIL **':10} {text}", flush=True)


def dummy():
    """A live process standing in for a loop shell."""
    p = subprocess.Popen([PY, "-c", "import time; time.sleep(900)"])
    DUMMIES.append(p)
    return p


def root():
    d = tempfile.mkdtemp(prefix="wakelease-")
    return d, os.path.join(d, "CC-A.json")


def pos(lr, st, loop=None, timeout=90):
    a = [PY, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr]
    if loop is not None:
        a += ["--loop", str(loop)]
    return subprocess.run(a, capture_output=True, text=True, timeout=timeout)


def lease(lr):
    try:
        return json.load(open(os.path.join(lr, "CC-A.lease"), encoding="utf-8"))
    except (OSError, ValueError):
        return None


def count(lr):
    r = subprocess.run([PY, FILTER, "CC-A", "--count", "--lease-root", lr], capture_output=True, text=True, timeout=90)
    return r.stdout.strip()


def arm_loop(lr, st, src_dir):
    """The real arm shape, with the local follower against temp sources. Returns (Popen, output path, loop-pid file)."""
    inbox, wake = os.path.join(src_dir, "cc-discord-inbox.jsonl"), os.path.join(src_dir, "cc-wake.log")
    for f in (inbox, wake):
        open(f, "a").close()
    out, lp = os.path.join(src_dir, "task.out"), os.path.join(src_dir, "loop.pid")
    u = lambda p: p.replace("\\", "/")
    script = (f'L=$(cat /proc/$$/winpid); echo "$L" > "{u(lp)}"; while :; do '
              f'P=$(python3 "{u(FILTER)}" CC-A --positions --state "{u(st)}" --lease-root "{u(lr)}" --loop $L) || break; '
              f'python3 "{u(FOLLOW)}" $P | python3 -u "{u(FILTER)}" CC-A --once --state "{u(st)}" --lease-root "{u(lr)}" --loop $L; '
              '[ "${PIPESTATUS[1]}" = 0 ] && break; sleep 2; done')
    env = dict(os.environ, CC_WAKE_SOURCES=f"{u(inbox)} {u(wake)}", CC_WAKE_KEEPALIVE_S="2", PYTHONIOENCODING="utf-8")
    p = subprocess.Popen([BASH, "-c", script], stdout=open(out, "w"), stderr=subprocess.STDOUT, env=env)
    return p, out, lp, wake


def wait_for(cond, secs=30):
    t0 = time.time()
    while time.time() - t0 < secs:
        if cond():
            return True
        time.sleep(0.5)
    return False


if os.name != "nt":
    print("SKIP: the lease is Windows-only (declared limit)"); sys.exit(0)

print(f"FILTER {FILTER}")
# OBJ-1 — expected: the first arm takes the lease (exit 0, positions on stdout, lease names it); a second arm while the
# first loop lives is refused: exit 5, stdout EMPTY, stderr begins WATCHER-STAND-DOWN.
lr, st = root(); L1, L2 = dummy(), dummy()
a = pos(lr, st, L1.pid)
b = pos(lr, st, L2.pid)
say(a.returncode == 0 and a.stdout.strip() and (lease(lr) or {}).get("loop") == L1.pid,
    f"OBJ-1 first arm takes the lease (rc={a.returncode}, lease={lease(lr)})")
say(b.returncode == 5 and b.stdout == "" and b.stderr.startswith("WATCHER-STAND-DOWN"),
    f"OBJ-1 a second arm is refused, stdout empty (rc={b.returncode}, stdout={b.stdout!r}, stderr={b.stderr[:60]!r})")
# OBJ-2 — expected: with NO reader running (the loop asleep between passes), the holder's own next pass is accepted.
c = pos(lr, st, L1.pid)
say(c.returncode == 0 and c.stdout.strip(), f"OBJ-2 the holder's reconnect pass is accepted (rc={c.returncode})")
# OBJ-3a — expected: holder loop dead and no reader -> a newcomer takes the lease.
L1.kill(); L1.wait()
d = pos(lr, st, L2.pid)
say(d.returncode == 0 and (lease(lr) or {}).get("loop") == L2.pid, f"OBJ-3a dead holder, no reader -> taken over (rc={d.returncode})")
# OBJ-6 — expected: a live pid with the WRONG creation time is a reused pid -> treated dead -> taken over;
# a holder the probe cannot open (System, pid 4: access denied) reads ALIVE -> refused.
lr, st = root(); L3 = dummy()
json.dump({"loop": L3.pid, "loop_created": 123, "taken_at": "x"}, open(os.path.join(lr, "CC-A.lease"), "w"))
L4 = dummy(); e = pos(lr, st, L4.pid)
say(e.returncode == 0 and (lease(lr) or {}).get("loop") == L4.pid, f"OBJ-6 a reused pid is not the holder (rc={e.returncode})")
lr, st = root()
json.dump({"loop": 4, "loop_created": None, "taken_at": "x"}, open(os.path.join(lr, "CC-A.lease"), "w"))
f_ = pos(lr, st, L4.pid)
say(f_.returncode == 5 and f_.stderr.startswith("WATCHER-STAND-DOWN"), f"OBJ-6 an unreadable holder (access denied) reads ALIVE (rc={f_.returncode})")
# OBJ-5 — expected: a refused --positions writes nothing, even when the state is old enough to be reset.
lr, st = root(); L5, L6 = dummy(), dummy()
pos(lr, st, L5.pid)
json.dump({"pos": {"x": [1, 2]}, "saved_epoch": time.time() - 13 * 3600}, open(st, "w"))
m0, b0 = os.path.getmtime(st), open(st, "rb").read()
time.sleep(1.1)
g = pos(lr, st, L6.pid)
say(g.returncode == 5 and os.path.getmtime(st) == m0 and open(st, "rb").read() == b0,
    f"OBJ-5 a refused arm does not touch the state file (rc={g.returncode})")
# OBJ-6b — expected: two newcomers racing an absent lease -> in every round exactly one wins and the lease names it.
ok, rounds = True, 8
for _ in range(rounds):
    lr, st = root(); La, Lb = dummy(), dummy()
    pa = subprocess.Popen([PY, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr, "--loop", str(La.pid)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    pb = subprocess.Popen([PY, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr, "--loop", str(Lb.pid)], stdout=subprocess.PIPE, stderr=subprocess.PIPE)
    ra, rb = pa.wait(120), pb.wait(120)
    win = [x for x, r in ((La.pid, ra), (Lb.pid, rb)) if r == 0]
    if not (sorted([ra, rb]) == [0, 5] and (lease(lr) or {}).get("loop") == win[0]):
        ok = False
say(ok, f"OBJ-6b racing newcomers: exactly one winner by the exclusive create, {rounds} rounds")
# OLD ARM (P6) — expected: under a live lease an arm with no --loop is refused with WATCHER-OLD-ARM (stdout empty), and
# its --once exits 5 at once without reading input.
lr, st = root(); L7 = dummy(); pos(lr, st, L7.pid)
h = pos(lr, st, None)
say(h.returncode == 5 and h.stdout == "" and h.stderr.startswith("WATCHER-OLD-ARM"), f"P6 an old arm is refused (rc={h.returncode})")
t0 = time.time()
o = subprocess.run([PY, FILTER, "CC-A", "--once", "--state", st, "--lease-root", lr], input=b"", capture_output=True, timeout=60)
say(o.returncode == 5, f"P6 an old --once yields to a live holder (rc={o.returncode}, {time.time()-t0:.1f}s)")
# P3/D6 — expected: a --once whose loop is not the lease's exits 5 BEFORE any mutation (an hour-old temp file survives).
old = os.path.join(lr, "CC-A.json.tmp.999"); open(old, "w").write("x"); os.utime(old, (time.time() - 7200,) * 2)
L8 = dummy()
q = subprocess.run([PY, FILTER, "CC-A", "--once", "--state", st, "--lease-root", lr, "--loop", str(L8.pid)], input=b"", capture_output=True, timeout=60)
say(q.returncode == 5 and os.path.exists(old), f"P3 a non-holder --once exits 5 before any mutation (rc={q.returncode}, tmp kept={os.path.exists(old)})")
# STEP-4 C1 — expected: a census that cannot run (no such program) refuses WATCHER-CENSUS, stdout empty, exit 5 — never a
# crash that reads as a normal wake; and --count says "unknown", never a measured 0.
lr, st = root(); L11 = dummy()
bad = dict(os.environ, CC_WAKE_PS="no-such-powershell-xyz")
c1 = subprocess.run([PY, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr, "--loop", str(L11.pid)],
                    capture_output=True, text=True, timeout=90, env=bad)
say(c1.returncode == 5 and c1.stdout == "" and c1.stderr.startswith("WATCHER-CENSUS") and "Traceback" not in c1.stderr,
    f"C1 an unrunnable census refuses by name (rc={c1.returncode}, {c1.stderr[:50]!r})")
c1b = subprocess.run([PY, FILTER, "CC-A", "--count", "--lease-root", lr], capture_output=True, text=True, timeout=90, env=bad)
say(c1b.returncode == 1 and c1b.stdout.startswith("unknown"), f"C1 --count reports unknown, not 0 (rc={c1b.returncode}, {c1b.stdout.strip()[:30]!r})")
# STEP-4 r2 C1-a — expected: a census program that exits 0 and prints NOTHING (no completion marker) refuses
# WATCHER-CENSUS: a silent success is not a measured zero.
stub = "cmd.exe"   # with empty input it prints its banner and exits 0: a success with no completion marker
c1a = subprocess.run([PY, FILTER, "CC-A", "--positions", "--state", st, "--lease-root", lr, "--loop", str(L11.pid)],
                     capture_output=True, text=True, timeout=90, env=dict(os.environ, CC_WAKE_PS=stub))
say(c1a.returncode == 5 and c1a.stdout == "" and c1a.stderr.startswith("WATCHER-CENSUS") and "no completion marker" in c1a.stderr,
    f"C1-a a silent exit-0 census refuses, it is not a zero (rc={c1a.returncode}, {c1a.stderr[:90]!r})")
# STEP-4 C2 — expected: TWO stray readers -> WATCHER-ORPHAN names both pids and the count 2 (one refusal, not two).
lr, st = root()
strays = [subprocess.Popen([PY, FILTER, "CC-A", "--once", "--state", st, "--lease-root", lr], stdin=subprocess.PIPE,
                           stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL) for _ in range(2)]
DUMMIES.extend(strays)
wait_for(lambda: count(lr) == "2", 40)
L12 = dummy(); c2 = pos(lr, st, L12.pid)
say(c2.returncode == 5 and c2.stderr.startswith("WATCHER-ORPHAN: 2 reader") and all(str(p.pid) in c2.stderr for p in strays),
    f"C2 every orphan is named, with the count (rc={c2.returncode}, {c2.stderr[:80]!r})")
# OBJ-3b + OBJ-4 with the REAL arm shape (Langston C7): a live arm loop holds the lease and runs a reader.
src = tempfile.mkdtemp(prefix="wakelease-src-"); lr, st = root()
P1, out1, lp1, wake1 = arm_loop(lr, st, src)
live = wait_for(lambda: count(lr) == "1", 40)
say(live, f"arm loop is running one reader in its domain (count={count(lr)})")
L9 = dummy()
r9 = pos(lr, st, L9.pid)
say(r9.returncode == 5 and r9.stderr.startswith("WATCHER-STAND-DOWN"), f"OBJ-4 a newcomer is refused while the loop lives (rc={r9.returncode})")
with open(wake1, "a", encoding="utf-8", newline="\n") as fw:
    fw.write("Claude Old: lease survivor test\n")
done = wait_for(lambda: P1.poll() is not None, 40)
txt = open(out1, encoding="utf-8", errors="replace").read()
say(done and txt.count("lease survivor test") == 1, f"OBJ-4 the survivor still delivers the wake, once (ended={done}, hits={txt.count('lease survivor test')})")
# OBJ-3b — a REAL orphan: kill only the loop shell; its reader survives; a newcomer is refused WATCHER-ORPHAN.
src2 = tempfile.mkdtemp(prefix="wakelease-src-"); lr2, st2 = root()
P2, out2, lp2, wake2 = arm_loop(lr2, st2, src2)
wait_for(lambda: count(lr2) == "1", 40)
loop_pid = open(lp2).read().strip()
subprocess.run(["taskkill", "/F", "/PID", loop_pid], capture_output=True)
time.sleep(2)
orphan = count(lr2)
L10 = dummy()
r10 = pos(lr2, st2, L10.pid)
say(orphan == "1" and r10.returncode == 5 and r10.stderr.startswith("WATCHER-ORPHAN"),
    f"OBJ-3b a real orphan (loop shell {loop_pid} killed, readers={orphan}) is refused (rc={r10.returncode}, {r10.stderr[:70]!r})")
# cleanup: the orphan reader and its follower
subprocess.run(["powershell", "-NoProfile", "-Command",
                f"Get-CimInstance Win32_Process | Where-Object {{ ($_.CommandLine -match '{os.path.basename(lr2)}' -or $_.CommandLine -match '{os.path.basename(src2)}') -and $_.CommandLine -notmatch 'Get-CimInstance' }} | ForEach-Object {{ Stop-Process -Id $_.ProcessId -Force }}"],  # by folder NAME: either slash form
               capture_output=True)
for p in DUMMIES:
    p.kill()
print()
print("ALL PASS" if fails == 0 else f"{fails} FAILED")
sys.exit(0 if fails == 0 else 1)
