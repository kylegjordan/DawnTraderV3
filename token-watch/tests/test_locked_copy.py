"""
token-watch — tools/locked_copy.py (B-TOKEN-WATCH-FOLLOWUP-MEMORY P1, Langston Step 4 r2 BLOCKER-2). Each case runs
the tool in its own process (it exits with os._exit when it loses the lock). A slow copier stands in for `cp -a` on
a 1.5 GB tree, so the lock can be changed mid-copy. Linux (nice/ionice and cp); run on the staging box.

Run:  python3 token-watch/tests/test_locked_copy.py   (exit 0 = all pass)
"""

import json
import os
import shutil
import subprocess
import sys
import tempfile
import time

HERE = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
TOOL = os.path.join(HERE, "tools", "locked_copy.py")
WORK = tempfile.mkdtemp(prefix="token-watch-lockedcopy-")
SRC = os.path.join(WORK, "store")
LOCK = os.path.join(SRC, "state", "periodic.lock")
PASS = FAIL = 0


def check(label, cond, detail=""):
    global PASS, FAIL
    if cond:
        PASS += 1
        print("PASS " + label)
    else:
        FAIL += 1
        print("FAIL " + label + ("  " + detail if detail else ""))


for d in ("births", "state"):
    os.makedirs(os.path.join(SRC, d))
open(os.path.join(SRC, "births", "2026-10-01.jsonl"), "w").write('{"mint": "A"}\n')
SLOW = os.path.join(WORK, "slowcp.py")
open(SLOW, "w").write("import shutil, sys, time\ntime.sleep(float(sys.argv[1]))\n"
                      "src, dst = sys.argv[2], sys.argv[3]\n"
                      "(shutil.copytree if __import__('os').path.isdir(src) else shutil.copy2)(src, dst)\n")


def start(dst, *rels, slow=None, beat="0.3"):
    env = dict(os.environ, TOKEN_WATCH_ROOT=SRC, LOCKED_COPY_BEAT_S=beat, PYTHONDONTWRITEBYTECODE="1")
    if slow is not None:
        env["LOCKED_COPY_TEST_CMD"] = json.dumps([sys.executable, SLOW, str(slow)])
    return subprocess.Popen([sys.executable, TOOL, dst] + list(rels), env=env,
                            stdout=subprocess.PIPE, stderr=subprocess.PIPE, text=True)


def wait_for_lock(timeout=10):
    t0 = time.time()
    while time.time() - t0 < timeout:
        if os.path.exists(LOCK):
            return True
        time.sleep(0.05)
    return False


print("L1 expect: a normal copy -> exit 0, copied, the lock removed")
dst = os.path.join(WORK, "dst1")
os.makedirs(dst)
p = start(dst, "births")
out, err = p.communicate(timeout=60)
check("L1 exit 0", p.returncode == 0, err)
check("L1 copied", os.path.exists(os.path.join(dst, "births", "2026-10-01.jsonl")))
check("L1 the lock is released", not os.path.exists(LOCK))

print("L2 expect: a copy that outlives many beats keeps the lock (beaten, still ours) -> exit 0")
dst = os.path.join(WORK, "dst2")
os.makedirs(dst)
p = start(dst, "births", slow=2.0)
check("L2 POSITIVE CONTROL: the lock is taken", wait_for_lock())
m0 = os.path.getmtime(LOCK)
time.sleep(1.0)
check("L2 the lock is beaten during the copy", os.path.exists(LOCK) and os.path.getmtime(LOCK) > m0)
out, err = p.communicate(timeout=60)
check("L2 exit 0", p.returncode == 0, err)

print("L3 expect: the lock taken over mid-copy -> exit 8, and the THIEF's lock is NOT unlinked")
dst = os.path.join(WORK, "dst3")
os.makedirs(dst)
p = start(dst, "births", slow=5.0)
check("L3 POSITIVE CONTROL: the lock is taken", wait_for_lock())
with open(LOCK, "w") as fh:
    fh.write("intruder 999 2026-11-07T00:00:00+00:00\n")
out, err = p.communicate(timeout=60)
check("L3 exit 8", p.returncode == 8, "rc=%s %s" % (p.returncode, err))
check("L3 the thief's lock survives", os.path.exists(LOCK) and open(LOCK).read().startswith("intruder 999"))
check("L3 the copy did not complete", not os.path.exists(os.path.join(dst, "births")))
if os.path.exists(LOCK):
    os.remove(LOCK)

print("L4 expect: the lock removed mid-copy -> exit 8, and no lock is recreated")
dst = os.path.join(WORK, "dst4")
os.makedirs(dst)
p = start(dst, "births", slow=5.0)
check("L4 POSITIVE CONTROL: the lock is taken", wait_for_lock())
if os.path.exists(LOCK):
    os.remove(LOCK)
out, err = p.communicate(timeout=60)
check("L4 exit 8", p.returncode == 8, "rc=%s %s" % (p.returncode, err))
check("L4 no lock recreated", not os.path.exists(LOCK))

print("L6 expect: the beat never fires (a dead beat thread), the lock replaced mid-copy -> the RELEASE edge catches it:"
      " exit 8, the thief's lock survives (Langston's probe, inverted)")
dst = os.path.join(WORK, "dst6")
os.makedirs(dst)
p = start(dst, "births", slow=2.0, beat="1000")
check("L6 POSITIVE CONTROL: the lock is taken", wait_for_lock())
with open(LOCK, "w") as fh:
    fh.write("intruder 998 2026-11-07T00:00:00+00:00\n")
out, err = p.communicate(timeout=60)
check("L6 exit 8 at release", p.returncode == 8 and "at release" in err, "rc=%s %s" % (p.returncode, err))
check("L6 the thief's lock survives", os.path.exists(LOCK) and open(LOCK).read().startswith("intruder 998"))
if os.path.exists(LOCK):
    os.remove(LOCK)

print("L5 expect: a destination inside the store -> exit 2")
p = start(os.path.join(SRC, "inside"), "births")
out, err = p.communicate(timeout=60)
check("L5 refused", p.returncode == 2 and "inside" in err, err)

shutil.rmtree(WORK, ignore_errors=True)
print("%d passed, %d failed" % (PASS, FAIL))
sys.exit(1 if FAIL else 0)
