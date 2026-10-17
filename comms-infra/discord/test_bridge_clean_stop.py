"""B-LANGSTON-RELIEF, 2026-10-17: the bridge's agent sessions run in their own process group, and both a timeout and a
stop end the WHOLE group. Run on Helsinki with the bridge venv, from a dir holding the bridge and its modules:
    /opt/discord-bridges/venv/bin/python3 test_bridge_clean_stop.py
Drives the REAL run_agent and stop_cleanly against a stand-in agent whose child IGNORES SIGTERM - the shape that made
the 08:18:16Z planned restart time out after 90 s and page a false "crash-looped". Every expected outcome is printed
before its result. Writes only to a scratch dir."""
import functools, os, signal, subprocess, sys, tempfile, textwrap, time
print = functools.partial(print, flush=True)

HERE = os.path.dirname(os.path.abspath(__file__))
fails = 0


def case(name, expected, got):
    global fails
    ok = expected == got
    print(("ok   " if ok else "FAIL ") + name + "\n       expected: %r\n       got:      %r" % (expected, got))
    if not ok:
        fails += 1


def alive(pid):
    try:
        os.kill(pid, 0)
    except ProcessLookupError:
        return False
    # a zombie still answers kill(0); read its state
    try:
        with open("/proc/%d/stat" % pid) as fh:
            return fh.read().split(")")[-1].split()[0] != "Z"
    except OSError:
        return False


SCRATCH = tempfile.mkdtemp(prefix="clean-stop-")
# a stand-in agent: it starts a grandchild that ignores SIGTERM (like the bun plugin server), records its pid, waits
AGENT = ["sh", "-c", "sh -c 'trap \"\" TERM; sleep 300' & echo $! > \"$0\"; wait", os.path.join(SCRATCH, "gc.pid")]

HARNESS = textwrap.dedent('''
    import importlib.util, os, sys, threading, time
    sys.path.insert(0, %(here)r)
    import gateway_watchdog as gw
    gw.install_watchdog = lambda *a, **k: None
    spec = importlib.util.spec_from_file_location("bridge", os.path.join(%(here)r, "discord-langston-bridge.py"))
    b = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(b)
    b.LOG_FILE = os.path.join(%(scratch)r, "bridge.log")
    import signal
    signal.signal(signal.SIGTERM, b.stop_cleanly)
    threading.Thread(target=lambda: b.run_agent(%(agent)r, dict(os.environ), %(scratch)r, 600), daemon=True).start()
    time.sleep(600)
''')

print("1. a STOP (SIGTERM) ends the whole agent group and exits 0, in seconds")
pidf = os.path.join(SCRATCH, "gc.pid")
h = subprocess.Popen([sys.executable, "-c", HARNESS % {"here": HERE, "scratch": SCRATCH, "agent": AGENT}])
for _ in range(100):
    if os.path.exists(pidf) and open(pidf).read().strip():
        break
    time.sleep(0.1)
gc = int(open(pidf).read().strip())
case("precondition: the SIGTERM-ignoring grandchild is running", True, alive(gc))
t0 = time.time()
h.send_signal(signal.SIGTERM)
rc = h.wait(timeout=30)
took = time.time() - t0
case("the bridge process exits 0 on SIGTERM", 0, rc)
case("  ...within 5 s (it was 90 s and a recorded failure)", True, took < 5)
time.sleep(0.3)
case("  ...and the grandchild that ignores SIGTERM is GONE", False, alive(gc))
log = open(os.path.join(SCRATCH, "bridge.log"), encoding="utf-8").read()
case("  ...and it logged how many sessions it ended", True, "ending 1 running agent session(s)" in log)

print("2. a TIMEOUT also ends the whole group (subprocess.run killed only the child)")
os.remove(pidf)
sys.path.insert(0, HERE)
import importlib.util
import gateway_watchdog as gw
gw.install_watchdog = lambda *a, **k: None
spec = importlib.util.spec_from_file_location("bridge", os.path.join(HERE, "discord-langston-bridge.py"))
b = importlib.util.module_from_spec(spec)
spec.loader.exec_module(b)
b.LOG_FILE = os.path.join(SCRATCH, "bridge2.log")
t0 = time.time()
res = {}


def _timeout_run():
    try:
        b.run_agent(AGENT, dict(os.environ), SCRATCH, 1)
        res["got"] = "returned"
    except subprocess.TimeoutExpired:
        res["got"] = "TimeoutExpired"


import threading
th = threading.Thread(target=_timeout_run, daemon=True)
th.start()
th.join(15)
# the OLD shape (kill only the child, then read its pipes) HANGS here: the grandchild holds stdout open - measured
got = res.get("got", "HUNG - the timeout path never returned (a grandchild still holds the pipe)")
case("run_agent raises TimeoutExpired at its timeout", "TimeoutExpired", got)
case("  ...promptly", True, time.time() - t0 < 5)
gc2 = int(open(pidf).read().strip())
time.sleep(0.3)
case("  ...and the SIGTERM-ignoring grandchild is GONE", False, alive(gc2))
case("  ...and nothing is left registered", 0, len(b._AGENTS))

print("3. a normal run returns like subprocess.run did")
r = b.run_agent(["sh", "-c", "echo out; echo err >&2; exit 3"], dict(os.environ), SCRATCH, 10)
case("returncode, stdout and stderr come back", (3, "out\n", "err\n"), (r.returncode, r.stdout, r.stderr))
case("  ...and it deregisters", 0, len(b._AGENTS))

print("clean-stop failures:", fails)
sys.exit(1 if fails else 0)
