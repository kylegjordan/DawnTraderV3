#!/usr/bin/env python3
"""B-WAKE-OPENING-LIST (#1241) P6: Coltrane's address gate and its refusal to start. Run: python3 test_coltrane_address.py
(any OS; stdlib + the repo; `git` for the pre-batch control). Expected outcomes are in each case name; a failure prints
`FAIL: <name>` and the run exits 1.
  A. engage_reason, non-Kyle: Coltrane in the OPENING LIST wakes it; a later-only mention does not. Kyle: anywhere.
     CONTROL: the pre-batch bot (git, R1_REF) does NOT wake on the KD-12 shape - the defect this batch fixes.
  B. main() refuses to start (exit 2, a REFUSING line naming the cause) on an absent, drifted, broken or
     probe-failing module; positive control: the same harness with the real module passes the check."""
import hashlib, importlib.util, os, re, runpy, shutil, subprocess, sys, tempfile, types
from pathlib import Path

sys.stdout.reconfigure(encoding="utf-8", errors="replace")
HERE = Path(__file__).resolve().parent
ROOT = HERE.parent.parent
MODULE = HERE.parent / "discord" / "address_list.py"
R1_REF = "5e577e84192c7f1693b6c6393a595dc7ac9865dc"   # the last commit before this batch
R1_GIT = os.environ.get("ADDRESS_LIST_R1_GIT", str(ROOT))   # mutate_address_list.py runs a copy that is not a git repo
SCRATCH = tempfile.mkdtemp(prefix="coltrane-addr-")
sys.modules.setdefault("discord", types.SimpleNamespace(Client=object, DMChannel=type("DMChannel", (), {})))

P = F = 0


def ok(name, cond, detail=""):
    global P, F
    if cond:
        P += 1
    else:
        F += 1
        print("  FAIL: " + name + (("   [" + str(detail)[:300] + "]") if detail else ""))


def load(path, name):
    spec = importlib.util.spec_from_file_location(name, path)
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


os.environ["COLTRANE_ADDRESS_LIST"] = str(MODULE)
bot = load(HERE / "coltrane-bot.py", "coltrane_bot_address_test")
ok("harness: the bot loaded the repo address_list.py", bot.ADDRESS_LIST is not None, bot.ADDRESS_LIST_ERROR)
bot.KYLE_ID = "42"

print("A. engage_reason")
for text, author, is_dm, want, name in [
    ("Langston, and Coltrane — r2 is up", 5, False, "named", "KD-12 shape 'Langston, and Coltrane' now wakes Coltrane"),
    ("Coltrane, Langston — x", 5, False, "named", "'Coltrane, Langston' wakes Coltrane"),
    ("Coltrane and Langston: x", 5, False, "named", "'Coltrane and Langston:' wakes Coltrane"),
    ("**Codex**, OLD Claude — x", 5, False, "named", "the 'codex' form, with markup, in a list wakes Coltrane"),
    ("Langston — and Coltrane may comment", 5, False, None, "a later-only mention does NOT wake Coltrane"),
    ("SWITCH TO CODEX", 5, False, None, "'SWITCH TO CODEX' from a session does NOT wake Coltrane"),
    ("<@1> Coltrane — x", 5, False, None, "a mention placed first empties the list"),
    ("heads up @crew, the plan moved", 5, False, "crew", "@crew anywhere still reaches Coltrane (unchanged)"),
    ("SWITCH TO CODEX", 42, False, "named", "Kyle: 'SWITCH TO CODEX' still wakes Coltrane (anywhere, unchanged)"),
    ("please ask Coltrane about it", 42, False, "named", "Kyle naming Coltrane later still wakes it (unchanged)"),
    ("anything at all", 5, True, "direct", "a DM still wakes it (unchanged)"),
]:
    why = bot.engage_reason(text, author, "someone", is_dm)
    got = None if why is None else why.split()[0].replace("crew-wide", "crew")
    ok(name, got == want, "got %r" % why)

_src = (HERE / "coltrane-bot.py").read_text(encoding="utf-8")
ok("the reply prompt no longer says Langston's name must be the FIRST WORD (A7)", "FIRST WORD" not in _src)
ok("NAME_START_RE is gone - the parser replaced it", "NAME_START_RE" not in _src)

_old = subprocess.run(["git", "-C", R1_GIT, "show", "%s:comms-infra/codex/coltrane-bot.py" % R1_REF],
                      capture_output=True)
ok("control harness: the pre-batch bot was read from git at R1_REF", _old.returncode == 0,
   _old.stderr.decode("utf-8", "replace")[-200:])
if _old.returncode == 0:
    p = os.path.join(SCRATCH, "coltrane_bot_r1.py")
    open(p, "wb").write(_old.stdout)
    old = load(p, "coltrane_bot_r1")
    old.KYLE_ID = "42"
    ok("CONTROL pre-batch: the KD-12 shape did NOT wake Coltrane (the defect)",
       old.engage_reason("Langston, and Coltrane — r2 is up", 5, "someone", False) is None)
    ok("CONTROL pre-batch: a Coltrane-first post did wake it (so the control can say yes)",
       old.engage_reason("Coltrane — x", 5, "someone", False) is not None)

print("B. main() refuses to start")
_RUNNER = ("import sys, types, runpy\n"
           "sys.modules['discord'] = types.SimpleNamespace(Client=object, DMChannel=type('DMChannel', (), {}))\n"
           "runpy.run_path(sys.argv[1], run_name='__main__')\n")
GOOD = MODULE.read_bytes()


def run_main(bot_path, module_path):
    env = dict(os.environ, COLTRANE_ADDRESS_LIST=str(module_path))
    return subprocess.run([sys.executable, "-c", _RUNNER, str(bot_path)], capture_output=True, text=True,
                          encoding="utf-8", errors="replace", timeout=120, env=env)


def pinned_copy(d, data):
    """A bot copy whose pin equals `data`'s sha - a committed-but-broken module - so the load itself is exercised."""
    src = (HERE / "coltrane-bot.py").read_bytes()
    new, n = re.subn(rb'^ADDRESS_LIST_SHA256 = "[0-9a-f]{64}"',
                     b'ADDRESS_LIST_SHA256 = "' + hashlib.sha256(data).hexdigest().encode() + b'"', src, flags=re.M)
    assert n == 1
    p = os.path.join(d, "coltrane-bot.py")
    open(p, "wb").write(new)
    return p


r = run_main(HERE / "coltrane-bot.py", MODULE)
ok("control: with the real module main() passes the check (it stops later, at the token)",
   "REFUSING" not in r.stderr, r.stderr[-300:])
d = tempfile.mkdtemp(dir=SCRATCH)
r = run_main(HERE / "coltrane-bot.py", os.path.join(d, "address_list.py"))
ok("main() refuses on an ABSENT module (exit 2, cause named)",
   r.returncode == 2 and "REFUSING TO START" in r.stderr and "FileNotFoundError" in r.stderr, r.stderr[-300:])
open(os.path.join(d, "address_list.py"), "wb").write(GOOD + b"# drifted\n")
r = run_main(HERE / "coltrane-bot.py", os.path.join(d, "address_list.py"))
ok("main() refuses on a DRIFTED module (exit 2, both shas named)",
   r.returncode == 2 and "REFUSING TO START" in r.stderr and hashlib.sha256(GOOD).hexdigest() in r.stderr,
   r.stderr[-300:])
broken = b"import re\nraise re.error('planted at import')\n"
d2 = tempfile.mkdtemp(dir=SCRATCH)
open(os.path.join(d2, "address_list.py"), "wb").write(broken)
r = run_main(pinned_copy(d2, broken), os.path.join(d2, "address_list.py"))
ok("main() refuses on a BROKEN module that matches its pin (exit 2, cause named)",
   r.returncode == 2 and "REFUSING TO START" in r.stderr and "planted at import" in r.stderr, r.stderr[-300:])
lower = GOOD.replace(b"names.append(best[0])", b"names.append(best[0].lower())")
d3 = tempfile.mkdtemp(dir=SCRATCH)
open(os.path.join(d3, "address_list.py"), "wb").write(lower)
r = run_main(pinned_copy(d3, lower), os.path.join(d3, "address_list.py"))
ok("main() refuses on a module whose keys fail the probe (exit 2)",
   r.returncode == 2 and "REFUSING TO START" in r.stderr and "probe" in r.stderr, r.stderr[-300:])

print("%d passed, %d failed" % (P, F))
shutil.rmtree(SCRATCH, ignore_errors=True)
sys.exit(1 if F else 0)
