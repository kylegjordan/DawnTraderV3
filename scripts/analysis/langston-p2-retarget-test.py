"""B-LANGSTON-CONTEXT P-2 unit 2 (direct-write retarget + three-way rollback) proof, run as root on Helsinki from
/root/lc3-test/p2r. Scratch LANGSTON_HOME; the reader is the real root-owned /opt/langston-memory/bin/langston_memory.py.
EXPECTED (stated before the run):
  U2 ledger-append to the part (--expect-sha = the PART's sha)   -> exit 0; MEMORY.md recomposed, retraction +1;
                                                                    strip_stamp(MEMORY.md) == new part body; state advanced
  U3 --expect-sha = MEMORY.md's sha (the composed file), not part -> exit 4, names the PART, 'the PART's sha, not MEMORY.md'
  U4 whole-file write to the part (declare 0/0)                  -> exit 0; MEMORY.md recomposed from the new part
  U5a --ledger-append with TWO ledger-carrying parts            -> exit 2 '2 parts carrying the ledger'
  U5b --ledger-append with ZERO ledger-carrying parts          -> exit 2 'NO part carrying'
  U6 a stray second bullet (moves +2, declared +1)             -> exit 5; part, MEMORY.md and compose-state ALL byte-identical again
  U7 the same with LMW_TEST_CORRUPT_RESTORE                     -> exit 6 'NOT byte-identical'
  U8 out-of-band edit of MEMORY.md then a part write           -> exit 4 'out-of-band'
  U9 pre-migration legacy path (no compose-state)              -> a whole-file write to MEMORY.md still works, exit 0
  M2 mutant: the rollback does NOT restore the part            -> U6 becomes exit 6 (part_ok False), not 5
  B1 out-of-band PART edit (count-neutral) then a direct write -> exit 4 'changed since the last compose', MEMORY.md
                                                                  unchanged; --compose then ACCEPTS and reports it
  B2 parts present but compose-state lost, then a direct write -> exit 2 'half-installed', MEMORY.md untouched
  F1 whole-file content carrying a stamp line                  -> exit 2 'pass the part'
  M3 mutant: BLOCKER-1 parts guard removed                     -> B1 launders the smuggled edit (exit 0)
  M4 mutant: BLOCKER-2 predicate reverted to state-only        -> B2 falls open onto MEMORY.md, stamp gone (exit 0)
"""
import hashlib, json, os, shutil, subprocess, sys

D = "/root/lc3-test/p2r"
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
NO_LEDGER_B = (NL.join(["# MEMORY plain", "", "## Notes", "- just a note", ""])).encode("utf-8")


def home(memory_bytes, parts):
    h = D + "/home"
    shutil.rmtree(h, ignore_errors=True)
    os.makedirs(h + "/memory-parts")
    os.makedirs(h + "/.memory-archive")
    with open(h + "/MEMORY.md", "wb") as fh:
        fh.write(memory_bytes)
    for name, b in parts.items():
        with open(h + "/memory-parts/" + name, "wb") as fh:
            fh.write(b)
    return h


def run(h, args, stdin_b=b"", extra_env=None, script=W):
    env = dict(os.environ, LANGSTON_HOME=h, LANGSTON_MEMORY_READER=READER)
    env.pop("LMW_TEST_CORRUPT_RESTORE", None)
    if extra_env:
        env.update(extra_env)
    p = subprocess.run(interp(script) + [script] + args, input=stdin_b, capture_output=True, env=env, timeout=120)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def migrate(h, script=W):
    return run(h, ["--compose", "--by", "m", "--reason", "migrate"], script=script)


def rd(h, rel="MEMORY.md"):
    with open(h + "/" + rel, "rb") as fh:
        return fh.read()


def state(h):
    with open(h + "/.memory-archive/compose-state.json", "rb") as fh:
        return json.loads(fh.read())


def strip_last_stamp(b):
    lines = b.split(b"\n")
    if len(lines) >= 2 and lines[-1] == b"" and lines[-2].startswith(b"<!-- composed "):
        return b"\n".join(lines[:-2]) + b"\n"
    return b


def app(sha_, n=1):
    return ["--expect-sha", sha_, "--ledger-append", "--entries", str(n), "--by", "t", "--reason", "t"]


def whole(sha_, l, r):
    return ["--expect-sha", sha_, "--ledger-delta", str(l), "--retractions-delta", str(r), "--by", "t", "--reason", "t"]


print(__doc__)

# U2 ledger-append to the part
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
ps = sha(rd(h, "memory-parts/00-legacy.md"))
rc, out = run(h, app(ps), (b"- an appended retraction entry" + b"\n"))
mem = rd(h)
part_body_now = rd(h, "memory-parts/00-legacy.md")
v("U2", rc == 0 and b"an appended retraction entry" in mem and strip_last_stamp(mem) == part_body_now
  and state(h)["last_written_sha"] == sha(mem),
  "exit %d, entry-in-mem %s, strip==part %s: %s" % (rc, b"an appended retraction entry" in mem,
                                                    strip_last_stamp(mem) == part_body_now, out.strip()[:70]))

# U3 CAS with MEMORY.md's sha instead of the part's
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
rc, out = run(h, app(sha(rd(h))), (b"- x\n"))     # sha of MEMORY.md, wrong
v("U3", rc == 4 and "the PART's sha, not MEMORY.md" in out and "00-legacy.md" in out,
  "exit %d: %s" % (rc, out.strip()[:120]))

# U4 whole-file write to the part
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
ps = sha(rd(h, "memory-parts/00-legacy.md"))
newmem = BASE_B + b"- an extra standing note\n"
rc, out = run(h, whole(ps, 0, 0), newmem)
v("U4", rc == 0 and b"an extra standing note" in rd(h) and rd(h, "memory-parts/00-legacy.md") == newmem,
  "exit %d, new-in-mem %s: %s" % (rc, b"an extra standing note" in rd(h), out.strip()[:70]))

# U5a >=2 parts, ZERO declaring ledger:true -> refuse naming EVERY part (declaration-based resolver, Langston 22:19Z)
FM = "<!-- part" + NL + "ledger: true" + NL + "-->" + NL
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
with open(h + "/memory-parts/50-second.md", "wb") as fh:
    fh.write((NL.join(["## " + chr(0x2605) + " SECOND", "- a note", ""])).encode("utf-8"))
migrate(h)   # recompose with two parts, neither declaring ledger:true
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md"))), b"- x\n")
v("U5a", rc == 2 and "needs exactly ONE part declaring" in out and "00-legacy.md" in out and "50-second.md" in out,
  "exit %d, names both parts %s: %s" % (rc, "00-legacy.md" in out and "50-second.md" in out, out.strip()[:90]))

# U5b >=2 parts, TWO declaring ledger:true -> refuse
h = home(BASE_B, {"00-legacy.md": FM.encode("utf-8") + BASE_B})   # 00-legacy declares ledger (body still == live)
migrate(h)
with open(h + "/memory-parts/50-also-ledger.md", "wb") as fh:
    fh.write((FM + "## " + chr(0x2605) + " ALSO" + NL + "### Retractions" + NL + "- x" + NL).encode("utf-8"))
migrate(h)
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md"))), b"- x\n")
v("U5b", rc == 2 and "found 2" in out, "exit %d: %s" % (rc, out.strip()[:90]))

# U6 three-way rollback on a bad delta
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
part_before = rd(h, "memory-parts/00-legacy.md")
mem_before = rd(h)
st_before = state(h)
rc, out = run(h, app(sha(part_before), 1), (b"- one entry\n- a stray second column-0 bullet\n"))
part_ok = rd(h, "memory-parts/00-legacy.md") == part_before
mem_ok = rd(h) == mem_before
state_ok = state(h) == st_before
v("U6", rc == 5 and part_ok and mem_ok and state_ok,
  "exit %d, part_ok %s mem_ok %s state_ok %s: %s" % (rc, part_ok, mem_ok, state_ok, out.strip()[:80]))

# U7 inexact rollback -> exit 6
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1),
              (b"- one entry\n- a stray second column-0 bullet\n"), extra_env={"LMW_TEST_CORRUPT_RESTORE": "1"})
v("U7", rc == 6 and "NOT byte-identical" in out, "exit %d: %s" % (rc, out.strip()[:100]))

# U8 out-of-band
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
with open(h + "/MEMORY.md", "wb") as fh:
    fh.write(rd(h) + b"a hand edit\n")
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md"))), b"- x\n")
v("U8", rc == 4 and "out-of-band" in out, "exit %d: %s" % (rc, out.strip()[:90]))

# U9 pre-migration legacy path still works (no compose-state)
h = home(BASE_B, {})     # no parts, no state
os.rmdir(h + "/memory-parts")
rc, out = run(h, whole(sha(rd(h)), 0, 0), BASE_B + b"- legacy path note\n")
v("U9", rc == 0 and b"legacy path note" in rd(h), "exit %d, legacy-write %s: %s" % (rc, b"legacy path note" in rd(h), out.strip()[:70]))

# M2 mutant: rollback does not restore the part -> U6 becomes exit 6 (part_ok False)
with open(W, encoding="utf-8") as fh:
    lines = fh.read().split("\n")
idx = [i for i, l in enumerate(lines) if l.strip() == "replace_file(part_path, part_old, pst)"]
assert len(idx) == 1, ("rollback-restore-part anchor", len(idx))
lines[idx[0]] = lines[idx[0]].replace("replace_file(part_path, part_old, pst)", "pass  # mutant: part not restored")
MW = D + "/mutant-write"
with open(MW, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
os.chmod(MW, 0o755)
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h, script=MW)
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1),
              (b"- one entry\n- a stray second column-0 bullet\n"), script=MW)
v("M2", rc == 6 and "NOT byte-identical" in out and "part_ok=False" in out,
  "mutant exit %d (expect 6, part not restored): %s" % (rc, out.strip()[:90]))

# B1 out-of-band PART edit (count-neutral, ends in one newline): a direct write must REFUSE, --compose must ACCEPT+report
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
with open(h + "/memory-parts/00-legacy.md", "wb") as fh:
    fh.write(BASE_B + b"- smuggled standing note\n")     # count-neutral, one trailing newline
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1), b"- a real entry\n")
mem_unchanged = strip_last_stamp(rd(h)) == BASE_B
rc_c, out_c = migrate(h)      # compose is the reconciliation verb
v("B1", rc == 4 and "changed since the last compose" in out and mem_unchanged
  and rc_c == 0 and "parts changed since last compose" in out_c,
  "direct exit %d (mem unchanged %s), compose exit %d reports %s" %
  (rc, mem_unchanged, rc_c, "parts changed since last compose" in out_c))

# B2 dispatch: parts present but compose-state lost -> REFUSE, never fall open onto MEMORY.md
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
os.remove(h + "/.memory-archive/compose-state.json")
mem_before = rd(h)
rc, out = run(h, whole(sha(rd(h, "memory-parts/00-legacy.md")), 0, 0), BASE_B + b"- x\n")
v("B2", rc == 2 and "half-installed" in out and rd(h) == mem_before,
  "exit %d, MEMORY.md untouched %s: %s" % (rc, rd(h) == mem_before, out.strip()[:90]))

# F1 whole-file write carrying a stamp line (the composed file pasted where the part belongs) -> refuse
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h)
rc, out = run(h, whole(sha(rd(h, "memory-parts/00-legacy.md")), 0, 0), rd(h))   # rd(h) has a stamp line
v("F1", rc == 2 and "pass the part" in out, "exit %d: %s" % (rc, out.strip()[:90]))

# M3 mutant: remove the BLOCKER-1 parts guard in do_direct_write -> B1 launders (exit 0)
with open(W, encoding="utf-8") as fh:
    lines = fh.read().split("\n")
idx = [i for i, l in enumerate(lines) if l.strip() == 'if state.get("parts_sha") and state["parts_sha"] != cur_parts_sha:']
assert len(idx) == 1, ("blocker-1 anchor", len(idx))
lines[idx[0]] = lines[idx[0]].replace('if state.get("parts_sha") and state["parts_sha"] != cur_parts_sha:', "if False:  # mutant")
MW3 = D + "/mutant-b1"
with open(MW3, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
os.chmod(MW3, 0o755)
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h, script=MW3)
with open(h + "/memory-parts/00-legacy.md", "wb") as fh:
    fh.write(BASE_B + b"- smuggled standing note\n")
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1), b"- a real entry\n", script=MW3)
v("M3", rc == 0 and b"smuggled standing note" in rd(h),
  "mutant exit %d, smuggled-laundered %s (expect leak)" % (rc, b"smuggled standing note" in rd(h)))

# M4 mutant: revert BLOCKER-2 predicate to state-only -> B2 falls open (exit 0 onto MEMORY.md)
with open(W, encoding="utf-8") as fh:
    lines = fh.read().split("\n")
idx = [i for i, l in enumerate(lines) if l.strip() == "if parts_present or state_live:"]
assert len(idx) == 1, ("blocker-2 anchor", len(idx))
lines[idx[0]] = lines[idx[0]].replace("if parts_present or state_live:", "if state_live:  # mutant")
MW4 = D + "/mutant-b2"
with open(MW4, "w", encoding="utf-8") as fh:
    fh.write("\n".join(lines))
os.chmod(MW4, 0o755)
h = home(BASE_B, {"00-legacy.md": BASE_B})
migrate(h, script=MW4)
os.remove(h + "/.memory-archive/compose-state.json")
rc, out = run(h, whole(sha(rd(h)), 0, 0), BASE_B + b"- fell open\n", script=MW4)
v("M4", rc == 0 and b"fell open" in rd(h) and b"<!-- composed" not in rd(h),
  "mutant exit %d, fell-open-onto-MEMORY %s, stamp-gone %s (expect silent un-install)"
  % (rc, b"fell open" in rd(h), b"<!-- composed" not in rd(h)))

bad = [n for n, ok in results if not ok]
print("RESULT: %d of %d matched%s" % (len(results) - len(bad), len(results), "" if not bad else "; DIFFER: " + ", ".join(bad)))
sys.exit(1 if bad else 0)
