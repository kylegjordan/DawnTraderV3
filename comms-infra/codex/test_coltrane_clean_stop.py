"""B-AGENT-INVOKE-FAILURE-NOTICE P8 + C-6: Coltrane's codex runs stop and time out CLEANLY, and only their OWN processes
die. A HAND-RUN GATE on Helsinki, as root, with the bridge venv (the real sudo, the real coltrane user):
    /opt/discord-bridges/venv/bin/python3 test_coltrane_clean_stop.py      (exit 0 = all pass)
REFUSES (exit 3) if a real codex run is active, so it never shares the coltrane user with a live review. It starts only
STUB processes (`sleep 33NN`, unique durations) and kills only what it started or what carries ITS tags - never by uid.
The census is `pgrep -u coltrane`, UNSCOPED, before and after each case (Langston's gate-A condition (ii): a census for
the TEST, never a selector for the runtime). Expected outcomes are stated before results."""
import importlib.util, os, re, signal, subprocess, sys, threading, time

HERE = os.path.dirname(os.path.abspath(__file__))
P = F = 0


def case(name, want, got):
    global P, F
    if want == got:
        P += 1
        print("  ok   " + name)
    else:
        F += 1
        print("  FAIL " + name + "   want=%r got=%r" % (want, got))


def census():
    """Every coltrane process, unscoped: {pid: cmdline}."""
    out = subprocess.run(["pgrep", "-u", "coltrane", "-a"], capture_output=True, text=True).stdout
    return {int(l.split()[0]): l.split(None, 1)[1] if " " in l else "" for l in out.splitlines() if l.strip()}


def stubs(pattern):
    return [pid for pid, cmd in census().items() if re.search(pattern, cmd)]


def kill_stubs(pattern):
    for pid in stubs(pattern):
        try:
            os.kill(pid, signal.SIGKILL)
        except OSError:
            pass
    time.sleep(0.5)


if os.geteuid() != 0:
    print("REFUSED: run as root (the gate drives sudo and reads /proc/<pid>/environ)")
    sys.exit(2)
if subprocess.run(["pgrep", "-u", "coltrane", "-f", "codex exec"], capture_output=True).stdout.strip():
    print("REFUSED: a real codex run is active - re-run when `pgrep -u coltrane -f 'codex exec'` is empty")
    sys.exit(3)
os.environ.setdefault("COLTRANE_ADDRESS_LIST", os.path.join(os.path.dirname(HERE), "discord", "address_list.py"))
spec = importlib.util.spec_from_file_location("coltrane_bot_stop_test", os.path.join(HERE, "coltrane-bot.py"))
bot = importlib.util.module_from_spec(spec)
spec.loader.exec_module(bot)
NULL = open(os.devnull)
BASE = set(census())
print("census before: %d coltrane process(es), none of them stubs" % len(BASE))
IGN = "trap '' HUP TERM; "

print("A. a timeout ends the WHOLE group, even children that ignore HUP and TERM")
t0 = time.time()
rc, out, err, info = bot.run_codex(["sh", "-c", IGN + "sleep 3301 & exec sleep 3302"], NULL, timeout=2, drain_s=2)
case("rc 124, outcome timeout, within a few seconds", (124, "timeout", True), (rc, info["outcome"], time.time() - t0 < 8))
case("no stub survives (unscoped census)", [], stubs(r"sleep 330[12]"))
case("nothing escaped, nothing needed a tagged kill", (False, []), (info["escaped_untagged"], info["killed_tagged"]))

print("B. (i) a child that calls setsid() ITSELF leaves the group and holds the pipe -> killed BY ITS TAG")
rc, out, err, info = bot.run_codex(["sh", "-c", IGN + "setsid sleep 3303 & exec sleep 3304"], NULL, timeout=2, drain_s=2)
case("returns timeout, the escapee was killed by tag, nothing untagged", (124, True, False),
     (rc, len(info["killed_tagged"]) >= 1, info["escaped_untagged"]))
case("no stub survives", [], stubs(r"sleep 330[34]"))

print("C. a holder that carries NO tag (a scrubbed environment) is PAGED, never killed")
rc, out, err, info = bot.run_codex(["sh", "-c", "env -i setsid sleep 3305 & exec sleep 3306"], NULL, timeout=2, drain_s=2)
left = stubs(r"sleep 3305")
case("escaped_untagged is reported", True, info["escaped_untagged"])
case("...and the untagged holder is STILL RUNNING (not killed by uid)", 1, len(left))
kill_stubs(r"sleep 330[56]")
case("cleanup: the gate removed its own stub", [], stubs(r"sleep 330[56]"))

print("D. two invokes at once: A times out, B's run is UNTOUCHED (C-6)")
res = {}
tb = threading.Thread(target=lambda: res.__setitem__("B", bot.run_codex(["sh", "-c", "sleep 4; echo B-OK"], NULL, timeout=30)))
tb.start()
time.sleep(0.5)
res["A"] = bot.run_codex(["sh", "-c", IGN + "setsid sleep 3307 & exec sleep 3308"], NULL, timeout=1, drain_s=1)
tb.join()
case("A: timeout", 124, res["A"][0])
case("B: completed normally with its output", (0, "B-OK"), (res["B"][0], res["B"][1]))
case("no A stub survives", [], stubs(r"sleep 330[78]"))

print("E. SIGTERM mid-invoke: stop_cleanly ends the group and exits 0 (P8)")
child = subprocess.Popen([sys.executable, "-c", (
    "import importlib.util,os,signal,sys,threading,time\n"
    "os.environ.setdefault('COLTRANE_ADDRESS_LIST', %r)\n"
    "s=importlib.util.spec_from_file_location('cb', %r); b=importlib.util.module_from_spec(s); s.loader.exec_module(b)\n"
    "signal.signal(signal.SIGTERM, b.stop_cleanly)\n"
    "threading.Thread(target=lambda: b.run_codex(['sh','-c',\"trap '' HUP TERM; sleep 3309 & exec sleep 3310\"], open(os.devnull), timeout=300), daemon=True).start()\n"
    "time.sleep(60)\n") % (os.environ["COLTRANE_ADDRESS_LIST"], os.path.join(HERE, "coltrane-bot.py"))])
time.sleep(3)
case("the stubs are running before the stop", True, len(stubs(r"sleep 33(09|10)")) >= 1)
child.send_signal(signal.SIGTERM)
try:
    code = child.wait(timeout=15)
except subprocess.TimeoutExpired:
    child.kill()
    code = "hung"
time.sleep(0.5)
case("exit code 0 (a clean stop, not a failure that pages Kyle)", 0, code)
case("no stub survives the stop", [], stubs(r"sleep 33(09|10)"))

print("F. CONTROL: today's shape - subprocess.run(sudo ..., timeout) - ORPHANS (the census can see a survivor)")
try:
    subprocess.run(["sudo", "-u", "coltrane", "sh", "-c", IGN + "sleep 3311 & exec sleep 3312"], stdin=NULL,
                   capture_output=True, text=True, timeout=2)
except subprocess.TimeoutExpired:
    pass
time.sleep(0.5)
case("the old shape leaves survivors (positive control for the census)", True, len(stubs(r"sleep 331[12]")) >= 1)
kill_stubs(r"sleep 331[12]")

print("G. MUTANT: kill by anything wider than the tag -> B (another invoke) dies; the gate must catch it")
real = bot._tagged_pids
bot._tagged_pids = lambda tag: stubs(r"sleep 33(1[3-6])")     # every stub of both invokes, i.e. not by THIS tag
res = {}
tb = threading.Thread(target=lambda: res.__setitem__("B", bot.run_codex(["sh", "-c", "sleep 3313; echo B-OK"], NULL, timeout=30)))
tb.start()
time.sleep(0.5)
res["A"] = bot.run_codex(["sh", "-c", IGN + "setsid sleep 3315 & exec sleep 3316"], NULL, timeout=1, drain_s=1)
tb.join(timeout=40)
bot._tagged_pids = real
case("under the mutant, B does NOT complete normally (the mutant is caught)", True, res.get("B", (None,))[0] != 0)
kill_stubs(r"sleep 33(1[3-6])")

after = {pid: cmd for pid, cmd in census().items() if pid not in BASE and re.search(r"sleep 33\d\d", cmd)}
case("FINAL census: no stub of this gate is left on the coltrane user", {}, after)
print("\n%d passed, %d failed" % (P, F))
sys.exit(1 if F else 0)
