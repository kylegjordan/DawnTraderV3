"""B-WAKE-ARM-EXCLUSIVE (#1140) Step 7, Langston C1: what does a session running the OLD arm text experience if OBJ-9 is flipped?
Runs the OLD arm (no --loop, no `|| break`, retry on non-zero) against temp lease roots + the local follower, for the
installed (interim) filter AND a flipped copy, with and without a live holder. Observes for OBS seconds:
did the task end (= a notification reaches the session)? did a reader run (count)? what did the output say?
Expected BEFORE running (pre-registered):
  interim / no holder   -> a reader runs (unleased), task stays alive waiting for a wake       (works, as today)
  interim / live holder -> OLD-ARM refusal at --positions; --once yields; retry every few s, task never ends (P6 interim)
  flipped / no holder   -> OLD-ARM refusal at --positions; BUT no `|| break`, so the follower still runs with empty P and
                           --once (no --loop, no holder) is accepted -> a reader runs anyway: the flip does not bite
  flipped / live holder -> same as interim / live holder
"""
import json, os, re, shutil, subprocess, sys, tempfile, time

REPO = os.path.dirname(os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
FILTER = os.path.join(REPO, "comms-infra", "laptop", "cc-wake-filter.py")
FOLLOW = os.path.join(REPO, "comms-infra", "laptop", "cc-wake-follow.py")
BASH = r"C:\Program Files\Git\bin\bash.exe"
PY = sys.executable
OBS = 25
u = lambda p: p.replace("\\", "/")

src = open(FILTER, encoding="utf-8").read()
old = ("    if _LOOP is None:\n"
       "        return                              # an old arm with no holder and no reader: unleased, as before (P6 interim)\n")
assert src.count(old) == 1, "flip anchor not found exactly once"
flipped_src = src.replace(old, '    if _LOOP is None:\n        _refuse("WATCHER-OLD-ARM", "this arm passes no --loop; re-arm with the current command (shared MEMORY 4.5)")\n')
tmpd = tempfile.mkdtemp(prefix="c1flip-")
FLIPPED = os.path.join(tmpd, "cc-wake-filter.py")
open(FLIPPED, "w", encoding="utf-8").write(flipped_src)
assert "LEASE_V1" in flipped_src


def run(filt, holder):
    d = tempfile.mkdtemp(prefix="c1case-")
    lr, st = d, os.path.join(d, "CC-A.json")
    inbox, wake = os.path.join(d, "cc-discord-inbox.jsonl"), os.path.join(d, "cc-wake.log")
    for f in (inbox, wake):
        open(f, "a").close()
    dummy = None
    if holder:
        dummy = subprocess.Popen([PY, "-c", "import time; time.sleep(900)"])
        # take a real lease for the dummy loop through the filter itself
        r = subprocess.run([PY, filt, "CC-A", "--positions", "--state", st, "--lease-root", lr, "--loop", str(dummy.pid)],
                           capture_output=True, text=True, timeout=90)
        assert r.returncode == 0, r.stderr
    out = os.path.join(d, "task.out")
    script = (f'while :; do P=$(python3 "{u(filt)}" CC-A --positions --state "{u(st)}" --lease-root "{u(lr)}"); '
              f'python3 "{u(FOLLOW)}" $P | python3 -u "{u(filt)}" CC-A --once --state "{u(st)}" --lease-root "{u(lr)}"; '
              '[ "${PIPESTATUS[1]}" = 0 ] && break; sleep 3; done')
    env = dict(os.environ, CC_WAKE_SOURCES=f"{u(inbox)} {u(wake)}", CC_WAKE_KEEPALIVE_S="2", PYTHONIOENCODING="utf-8")
    p = subprocess.Popen([BASH, "-c", script], stdout=open(out, "w"), stderr=subprocess.STDOUT, env=env)
    time.sleep(OBS)
    ended = p.poll() is not None
    c = subprocess.run([PY, filt, "CC-A", "--count", "--lease-root", lr], capture_output=True, text=True, timeout=90).stdout.strip()
    subprocess.run(["taskkill", "/F", "/T", "/PID", str(p.pid)], capture_output=True)
    if dummy:
        dummy.kill()
    # kill any reader left in this case's domain (matched by folder name)
    subprocess.run(["powershell", "-NoProfile", "-Command",
                    f"Get-CimInstance Win32_Process | Where-Object {{ $_.CommandLine -match '{os.path.basename(d)}' }} | "
                    "ForEach-Object { Stop-Process -Id $_.ProcessId -Force }"], capture_output=True)
    text = open(out, encoding="utf-8", errors="replace").read().strip().splitlines()
    words = sorted({ln.split(":")[0] for ln in text if ln.startswith("WATCHER-")})
    n_ref = sum(1 for ln in text if ln.startswith("WATCHER-"))
    return ended, c, words, n_ref, text[:3]


for name, filt in (("interim", FILTER), ("flipped", FLIPPED)):
    for holder in (False, True):
        ended, c, words, n_ref, head = run(filt, holder)
        print(f"{name:8} holder={'live' if holder else 'none':4}  task_ended={ended}  readers(count)={c}  "
              f"refusal_words={words} x{n_ref} in {OBS}s")
        for ln in head:
            print(f"      | {ln[:150]}")
shutil.rmtree(tmpd, ignore_errors=True)
