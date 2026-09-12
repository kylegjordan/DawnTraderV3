"""B-LANGSTON-CONTEXT P-2 unit 1 (compose) proof, run as root on Helsinki from /root/lc3-test/p2.
Uses a scratch LANGSTON_HOME so the live file is never touched. The reader is the real root-owned
/opt/langston-memory/bin/langston_memory.py (guard c admits it: root-owned).
EXPECTED (stated before the run):
  C1 migration first-compose (00-legacy == MEMORY.md)     -> exit 0; strip_stamp(MEMORY.md) == original bytes;
                                                             stamp is ONE line; state last_written_sha == sha(MEMORY.md),
                                                             pending_sha null; recall delta 0
  C2 first-compose, parts do NOT reproduce the live file  -> exit 4 'do NOT reproduce'; MEMORY.md byte-identical
  C3 out-of-band edit of MEMORY.md after C1               -> exit 4 'out-of-band', names MEMORY.md + shas; unchanged
  C4 rename->state crash then recompose is NOT false-alarm-> crash switch exit 99, MEMORY.md new, state pending set;
                                                             next compose recognises pending -> exit 0
  C5 zero parts                                            -> exit 2 'holds no parts'
  C6 a part not ending in exactly one newline             -> exit 2 naming the file, 'exactly one newline'
  C7 a part with an obligations frontmatter block         -> exit 0; the frontmatter is NOT in composed body
  C8 --compose must not BLOCK on an open stdin (the live ssh hang) -> exits promptly, composes
  M1 mutant: pending_sha dropped from the admissible set  -> C4's recompose then FALSE-ALARMS (exit 4)
"""
import hashlib, json, os, shutil, subprocess, sys

D = "/root/lc3-test/p2"
W = D + "/langston-memory-write"
READER = "/opt/langston-memory/bin/langston_memory.py"
NL = chr(10)
results = []


def sha(b):
    return hashlib.sha256(b).hexdigest()


def v(name, ok, obs):
    results.append((name, ok))
    print("%s %s %s" % ("MATCH " if ok else "DIFFER", name, obs))


def interp(path):
    with open(path, encoding="utf-8") as fh:
        first = fh.readline()
    return first[2:].split() if first.startswith("#!") else [sys.executable]


# a fixture MEMORY.md with a REVIEWER LEDGER so retraction_count returns a positive number (delta measurable)
BASE = NL.join([
    "# MEMORY " + chr(0x2014) + " fixture", "",
    "## " + chr(0x2605) * 2 + " REVIEWER LEDGER " + chr(0x2014) + " MY OWN RETRACTIONS", "",
    "### Retractions (things I asserted and then withdrew)",
    "- **first retraction**, a fixture entry long enough to look like one.",
    "- **second retraction**, with a continuation below.",
    "  " + chr(0xB7) + " a continuation led by a middle dot",
    "", "### Rulings of mine that GENERALISE (reusable)",
    "- a generalised ruling, not a retraction", "",
    "## " + chr(0x2605) + " STANDING NOTES", "- a note", ""])
BASE_B = BASE.encode("utf-8")
assert BASE_B.endswith(b"\n") and not BASE_B.endswith(b"\n\n")


def fresh_home(with_legacy=True, legacy_bytes=None, memory_bytes=None):
    home = D + "/home"
    shutil.rmtree(home, ignore_errors=True)
    os.makedirs(home + "/memory-parts")
    os.makedirs(home + "/.memory-archive")
    with open(home + "/MEMORY.md", "wb") as fh:
        fh.write(memory_bytes if memory_bytes is not None else BASE_B)
    if with_legacy:
        with open(home + "/memory-parts/00-legacy.md", "wb") as fh:
            fh.write(legacy_bytes if legacy_bytes is not None else BASE_B)
    return home


def compose(home, extra_env=None, script=W):
    env = dict(os.environ, LANGSTON_HOME=home, LANGSTON_MEMORY_READER=READER)
    env.pop("LMW_TEST_CRASH_BEFORE_STATE", None)
    if extra_env:
        env.update(extra_env)
    p = subprocess.run(interp(script) + [script, "--compose", "--by", "lc-p2", "--reason", "p2 test"],
                       input=b"", capture_output=True, env=env, timeout=120)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def read(home):
    with open(home + "/MEMORY.md", "rb") as fh:
        return fh.read()


def state(home):
    with open(home + "/.memory-archive/compose-state.json", "rb") as fh:
        return json.loads(fh.read())


def strip_last_stamp(b):
    lines = b.split(b"\n")
    if len(lines) >= 2 and lines[-1] == b"" and lines[-2].startswith(b"<!-- composed "):
        return b"\n".join(lines[:-2]) + b"\n"
    return b


print(__doc__)

# C1
h = fresh_home()
rc, out = compose(h)
mem = read(h)
stamp_lines = [l for l in mem.split(b"\n") if l.startswith(b"<!-- composed ")]
ok = (rc == 0 and strip_last_stamp(mem) == BASE_B and len(stamp_lines) == 1
      and state(h)["last_written_sha"] == sha(mem) and state(h)["pending_sha"] is None)
v("C1", ok, "exit %d, strip==orig %s, stamps %d, state_ok %s | %s" %
  (rc, strip_last_stamp(mem) == BASE_B, len(stamp_lines),
   state(h)["last_written_sha"] == sha(mem) and state(h)["pending_sha"] is None, out.strip()[:80]))

# C2 first-compose, parts do not reproduce
h = fresh_home(legacy_bytes=BASE_B + b"extra line\n")
before = read(h)
rc, out = compose(h)
v("C2", rc == 4 and "do NOT reproduce" in out and read(h) == before,
  "exit %d, unchanged %s: %s" % (rc, read(h) == before, out.strip()[:120]))

# C3 out-of-band
h = fresh_home()
compose(h)
composed_after_c1 = read(h)
with open(h + "/MEMORY.md", "wb") as fh:
    fh.write(composed_after_c1 + b"a hand edit\n")
tampered = read(h)
rc, out = compose(h)
v("C3", rc == 4 and "out-of-band" in out and read(h) == tampered,
  "exit %d, names-oob %s, unchanged %s: %s" % (rc, "out-of-band" in out, read(h) == tampered, out.strip()[:100]))

# C4 crash between rename and state-write, then recompose is not a false alarm
h = fresh_home()
compose(h)                                             # establishes state
# add a second part so the next compose changes the body (new content), reproducing a real recompose
with open(h + "/memory-parts/10-note.md", "wb") as fh:
    fh.write(("## " + chr(0x2605) + " EXTRA PART" + NL + "- an added note" + NL).encode("utf-8"))
rc_crash, out_crash = compose(h, extra_env={"LMW_TEST_CRASH_BEFORE_STATE": "1"})
mem_after_crash = read(h)
st = state(h)
crash_ok = (rc_crash == 99 and st.get("pending_sha") == sha(mem_after_crash)
            and st.get("last_written_sha") != sha(mem_after_crash))
rc2, out2 = compose(h)                                 # should recognise pending, not false-alarm
v("C4", crash_ok and rc2 == 0 and state(h)["pending_sha"] is None,
  "crash exit %d pending-set %s; recompose exit %d: %s" % (rc_crash, crash_ok, rc2, out2.strip()[:70]))

# C5 zero parts
h = fresh_home(with_legacy=False)
rc, out = compose(h)
v("C5", rc == 2 and "holds no parts" in out, "exit %d: %s" % (rc, out.strip()[:90]))

# C6 a part not ending in exactly one newline
h = fresh_home()
with open(h + "/memory-parts/20-bad.md", "wb") as fh:
    fh.write(b"## bad part with no trailing newline")
rc, out = compose(h)
v("C6", rc == 2 and "exactly one newline" in out and "20-bad.md" in out, "exit %d: %s" % (rc, out.strip()[:110]))

# C7 frontmatter strip: the migration part 00-legacy.md carries a frontmatter block whose BODY equals the live file,
# so the first-compose predicate (body == cur) still holds and the frontmatter must be stripped from the composed output
h = fresh_home(with_legacy=False)
fm = "<!-- part" + NL + "obligations:" + NL + "- keep-me" + NL + "-->" + NL
with open(h + "/memory-parts/00-legacy.md", "wb") as fh:
    fh.write(fm.encode("utf-8") + BASE_B)
rc, out = compose(h)
mem = read(h)
v("C7", rc == 0 and b"obligations:" not in mem and b"first retraction" in mem and strip_last_stamp(mem) == BASE_B,
  "exit %d, frontmatter-hidden %s, body==orig %s: %s" % (rc, b"obligations:" not in mem, strip_last_stamp(mem) == BASE_B, out.strip()[:60]))

# C8 --compose must NOT block on an open stdin. THE LIVE HANG: invoked over ssh with no redirection, the channel
# never sends EOF, so a stdin-reading compose blocks forever. Leave stdin an open pipe (never closed/written) and
# require the process to exit promptly on its own.
h = fresh_home()
_env = dict(os.environ, LANGSTON_HOME=h, LANGSTON_MEMORY_READER=READER)
_env.pop("LMW_TEST_CRASH_BEFORE_STATE", None)
_proc = subprocess.Popen(interp(W) + [W, "--compose", "--by", "t", "--reason", "t"],
                         stdin=subprocess.PIPE, stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=_env)
try:
    _proc.wait(timeout=20)
    _hung = False
except subprocess.TimeoutExpired:
    _proc.kill(); _proc.wait(); _hung = True
v("C8", (not _hung) and _proc.returncode == 0 and strip_last_stamp(read(h)) == BASE_B,
  "hung %s, exit %s, composed %s" % (_hung, _proc.returncode, strip_last_stamp(read(h)) == BASE_B))

# M1 mutant: drop pending_sha from do_compose's admissible set -> C4 recompose false-alarms.
# The `admissible = ...` line appears in both do_compose and do_direct_write, so anchor the mutation on the line
# UNIQUE to do_compose (`if cur_sha not in admissible:`) and mutate the admissible line immediately above it.
with open(W, encoding="utf-8") as fh:
    lines = fh.read().split("\n")
idx = [i for i, l in enumerate(lines) if l.strip() == "if cur_sha not in admissible:"]
assert len(idx) == 1, ("anchor count", len(idx))
adm = idx[0] - 1
assert 'admissible = {state.get("last_written_sha"), state.get("pending_sha")}' in lines[adm], lines[adm]
lines[adm] = lines[adm].replace('{state.get("last_written_sha"), state.get("pending_sha")}', '{state.get("last_written_sha")}')
MW = D + "/mutant-write"
with open(MW, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
os.chmod(MW, 0o755)
h = fresh_home()
compose(h, script=MW)
with open(h + "/memory-parts/10-note.md", "wb") as fh:
    fh.write(("## " + chr(0x2605) + " EXTRA" + NL + "- note" + NL).encode("utf-8"))
compose(h, extra_env={"LMW_TEST_CRASH_BEFORE_STATE": "1"}, script=MW)
rc_m, out_m = compose(h, script=MW)
v("M1", rc_m == 4 and "out-of-band" in out_m,
  "mutant recompose after crash exit %d (expect false-alarm 4): %s" % (rc_m, out_m.strip()[:80]))

bad = [n for n, ok in results if not ok]
print("RESULT: %d of %d matched%s" % (len(results) - len(bad), len(results), "" if not bad else "; DIFFER: " + ", ".join(bad)))
sys.exit(1 if bad else 0)
