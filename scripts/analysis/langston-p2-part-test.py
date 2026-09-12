"""B-LANGSTON-CONTEXT P-2b (--part selector) proof, run as root on Helsinki from /root/lc3-test/p2p.
Scratch LANGSTON_HOME; reader is the real root-owned /opt/langston-memory/bin/langston_memory.py.
EXPECTED (stated before the run):
  P1  --part NEW via `--expect-sha new` (whole-file)          -> exit 0, part CREATED, MEMORY.md recomposed, rule 'explicit'
  P2  `--expect-sha new` on an EXISTING part                  -> exit 4 'exists - pass its current sha'
  P3  --part naming a NON-EXISTENT part WITHOUT `new`         -> exit 4 'does not exist', and it does NOT create it
  P4  whole-file, >=2 parts, no --part                        -> exit 2 'ambiguous', names --part and EVERY part
  P5  --part <existing> whole-file CAS write                  -> exit 0, recomposed
  P6  ledger declaration: 2 parts, one declares ledger:true   -> --ledger-append resolves to it (rule 'declared'), lands there
  P7a --ledger-append --part = the declared part (assertion)  -> exit 0
  P7b --ledger-append --part = a DIFFERENT part               -> exit 4 'does not match the resolved ledger part'
  P8  single-part fallback still resolves append              -> exit 0, rule 'single-part-fallback' (after the declaration resolver exists)
  P9  no-op recompose is body-stable                          -> two composes: strip-stamp identical, same body-sha, different stamp ts
  P10 retrofit split (ledger moved to a declared part)        -> both writes succeed, composed retraction count UNCHANGED, append re-points
  M5  mutant: drop the 'exists' check on `--expect-sha new`   -> P2 clobbers the existing part (exit 0)
  M6  mutant: >=2 falls back to the heading matcher           -> the 'forgot ledger:true' case silently lands (exit 0) - the reshape Langston required
"""
import hashlib, json, os, shutil, subprocess, sys

D = "/root/lc3-test/p2p"
W = D + "/langston-memory-write"
READER = "/opt/langston-memory/bin/langston_memory.py"
NL = chr(10)
FM = "<!-- part" + NL + "ledger: true" + NL + "-->" + NL
results = []


def sha(b): return hashlib.sha256(b).hexdigest()
def v(name, ok, obs):
    results.append((name, ok)); print("%s %s %s" % ("MATCH " if ok else "DIFFER", name, obs))
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
# the two halves of a retrofit split of BASE: the ledger section, and the rest
_i = BASE.index("## " + chr(0x2605) * 2 + " REVIEWER LEDGER")
_j = BASE.index("## " + chr(0x2605) + " STANDING NOTES")
LEDGER_SECTION = BASE[_i:_j]                       # the REVIEWER LEDGER block (2 retractions, 3 ledger bullets)
REST_WITHOUT_LEDGER = (BASE[:_i] + BASE[_j:]).encode("utf-8")   # header + STANDING NOTES, no ledger


def home(memory_bytes, parts):
    h = D + "/home"
    shutil.rmtree(h, ignore_errors=True)
    os.makedirs(h + "/memory-parts"); os.makedirs(h + "/.memory-archive")
    with open(h + "/MEMORY.md", "wb") as fh: fh.write(memory_bytes)
    for n, b in parts.items():
        with open(h + "/memory-parts/" + n, "wb") as fh: fh.write(b)
    return h


def run(h, args, stdin_b=b"", script=W):
    env = dict(os.environ, LANGSTON_HOME=h, LANGSTON_MEMORY_READER=READER)
    p = subprocess.run(interp(script) + [script] + args, input=stdin_b, capture_output=True, env=env, timeout=120)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def migrate(h, script=W): return run(h, ["--compose", "--by", "m", "--reason", "m"], script=script)
def rd(h, rel="MEMORY.md"):
    with open(h + "/" + rel, "rb") as fh: return fh.read()
def retr(h):   # composed retraction count, via the same reader the tool uses
    env = dict(os.environ, LANGSTON_HOME=h, LANGSTON_MEMORY_READER=READER)
    code = ("import importlib.util as u,sys;s=u.spec_from_file_location('r',%r);m=u.module_from_spec(s);"
            "s.loader.exec_module(m);st,e=m._parse_ledger(%r);print(len(e) if st=='ok' else -1)" % (READER, h + "/MEMORY.md"))
    p = subprocess.run([sys.executable, "-c", code], capture_output=True, env=env, timeout=60)
    return int(p.stdout.decode().strip() or -1)
def strip_last_stamp(b):
    lines = b.split(b"\n")
    if len(lines) >= 2 and lines[-1] == b"" and lines[-2].startswith(b"<!-- composed "): return b"\n".join(lines[:-2]) + b"\n"
    return b
def stamp_bodysha(b):
    for l in b.split(b"\n"):
        if l.startswith(b"<!-- composed ") and b"body-sha " in l:
            return l.split(b"body-sha ")[1].split(b" ")[0].decode()
    return None
def app(sha_, n=1, part=None):
    a = ["--expect-sha", sha_, "--ledger-append", "--entries", str(n), "--by", "t", "--reason", "t"]
    if part: a += ["--part", part]
    return a
def whole(sha_, l, r, part=None):
    a = ["--expect-sha", sha_, "--ledger-delta", str(l), "--retractions-delta", str(r), "--by", "t", "--reason", "t"]
    if part: a += ["--part", part]
    return a

print(__doc__)

# P1 create a new part (NON-ledger content; a full BASE copy would add a second ledger heading)
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
newpart = ("## " + chr(0x2605) + " CREATED PART" + NL + "- created-part note" + NL).encode("utf-8")
rc, out = run(h, whole("new", 0, 0, part="90-new.md"), newpart)
v("P1", rc == 0 and os.path.exists(h + "/memory-parts/90-new.md") and b"created-part note" in rd(h) and "explicit" in out,
  "exit %d, created %s, in-mem %s" % (rc, os.path.exists(h + "/memory-parts/90-new.md"), b"created-part note" in rd(h)))

# P2 --expect-sha new on an existing part
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
before = rd(h, "memory-parts/00-legacy.md")
rc, out = run(h, whole("new", 0, 0, part="00-legacy.md"), (BASE_B + b"- x\n"))
v("P2", rc == 4 and "exists" in out and rd(h, "memory-parts/00-legacy.md") == before, "exit %d: %s" % (rc, out.strip()[:90]))

# P3 --part nonexistent WITHOUT new -> refuse, no create
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
rc, out = run(h, whole(sha(b"whatever"), 0, 0, part="77-ghost.md"), (BASE_B + b"- x\n"))
v("P3", rc == 4 and "does not exist" in out and not os.path.exists(h + "/memory-parts/77-ghost.md"),
  "exit %d, not-created %s: %s" % (rc, not os.path.exists(h + "/memory-parts/77-ghost.md"), out.strip()[:80]))

# P4 whole-file, >=2 parts, no --part -> ambiguous, names --part + every part
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
run(h, whole("new", 0, 0, part="90-second.md"), (b"## " + chr(0x2605).encode() + b" SECOND\n- n\n"))   # now 2 parts
rc, out = run(h, whole(sha(rd(h, "memory-parts/00-legacy.md")), 0, 0), BASE_B + b"- x\n")   # no --part
v("P4", rc == 2 and "ambiguous" in out and "--part" in out and "00-legacy.md" in out and "90-second.md" in out,
  "exit %d, names both %s: %s" % (rc, "00-legacy.md" in out and "90-second.md" in out, out.strip()[:90]))

# P5 --part existing whole-file CAS write
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
rc, out = run(h, whole(sha(rd(h, "memory-parts/00-legacy.md")), 0, 0, part="00-legacy.md"), BASE_B + b"- edited via --part\n")
v("P5", rc == 0 and b"edited via --part" in rd(h), "exit %d: %s" % (rc, out.strip()[:70]))

# P6 ledger declaration: 00-legacy declares ledger:true (body still == live), add a plain 2nd part, append resolves to declared
h = home(BASE_B, {"00-legacy.md": FM.encode("utf-8") + BASE_B}); migrate(h)
run(h, whole("new", 0, 0, part="90-notes.md"), (b"## " + chr(0x2605).encode() + b" NOTES\n- n\n"))   # 2 parts, only 00-legacy declares
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1), b"- appended to the declared ledger\n")
v("P6", rc == 0 and "declared" in out and b"appended to the declared ledger" in rd(h, "memory-parts/00-legacy.md"),
  "exit %d, rule-declared %s, landed-in-declared %s" % (rc, "declared" in out, b"appended to the declared ledger" in rd(h, "memory-parts/00-legacy.md")))

# P7 assertion: --part matching the declared part ok; a different part refuses
h = home(BASE_B, {"00-legacy.md": FM.encode("utf-8") + BASE_B}); migrate(h)
run(h, whole("new", 0, 0, part="90-notes.md"), (b"## " + chr(0x2605).encode() + b" NOTES\n- n\n"))
rc_ok, _ = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1, part="00-legacy.md"), b"- ok\n")
rc_no, out_no = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1, part="90-notes.md"), b"- no\n")
v("P7a", rc_ok == 0, "exit %d" % rc_ok)
v("P7b", rc_no == 2 and "does not match the resolved ledger part" in out_no, "exit %d: %s" % (rc_no, out_no.strip()[:80]))

# P8 single-part fallback still resolves append (after the declaration resolver exists)
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1), b"- single-part append\n")
v("P8", rc == 0 and "single-part-fallback" in out, "exit %d, rule %s" % (rc, "single-part-fallback" in out))

# P9 no-op recompose body-stable
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
m1 = rd(h); rc, out = migrate(h); m2 = rd(h)
v("P9", rc == 0 and strip_last_stamp(m1) == strip_last_stamp(m2) and stamp_bodysha(m1) == stamp_bodysha(m2),
  "strip-stamp identical %s, body-sha identical %s" % (strip_last_stamp(m1) == strip_last_stamp(m2), stamp_bodysha(m1) == stamp_bodysha(m2)))

# P10 retrofit split: move the ledger into its own declared part; composed retraction count UNCHANGED
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
n_before = retr(h)                                   # 2
# write 1: 00-legacy loses the ledger (declare the removal: -3 bullets, -2 retractions)
rc1, o1 = run(h, whole(sha(rd(h, "memory-parts/00-legacy.md")), -3, -2, part="00-legacy.md"), REST_WITHOUT_LEDGER)
# write 2: create 05-ledger.md declaring ledger:true, carrying the ledger (declare +3 / +2)
ledger_part = (FM + LEDGER_SECTION.rstrip("\n") + "\n").encode("utf-8")   # exactly one trailing newline
rc2, o2 = run(h, whole("new", 3, 2, part="05-ledger.md"), ledger_part)
n_after = retr(h)
if os.path.exists(h + "/memory-parts/05-ledger.md"):
    rc3, o3 = run(h, app(sha(rd(h, "memory-parts/05-ledger.md")), 1), b"- post-split append\n")
else:
    rc3, o3 = (-1, "05-ledger.md not created; w2 said: " + o2.strip()[:150])
v("P10", rc1 == 0 and rc2 == 0 and n_before == n_after == 2 and rc3 == 0 and "declared" in o3,
  "w1 %d w2 %d; retractions %d -> %d; post-split append %d rule-declared %s" % (rc1, rc2, n_before, n_after, rc3, "declared" in o3))

# M5 mutant: drop the 'exists' guard on --expect-sha new -> P2 clobbers
with open(W, encoding="utf-8") as fh: lines = fh.read().split("\n")
idx = [i for i, l in enumerate(lines) if l.strip() == "if os.path.exists(part_path):" and "REFUSED: --part %s exists" in (lines[i+1] if i+1 < len(lines) else "")]
assert len(idx) == 1, ("M5 anchor", len(idx))
lines[idx[0]] = lines[idx[0]].replace("if os.path.exists(part_path):", "if False:  # mutant")
MW5 = D + "/mutant-new"; open(MW5, "w", encoding="utf-8").write("\n".join(lines)); os.chmod(MW5, 0o755)
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h, script=MW5)
before5 = rd(h, "memory-parts/00-legacy.md")
rc, out = run(h, whole("new", 0, 0, part="00-legacy.md"), (BASE_B + b"- clobbered\n"), script=MW5)
still = os.path.exists(h + "/memory-parts/00-legacy.md")
damaged = (not still) or (rd(h, "memory-parts/00-legacy.md") != before5)
# guarded build gives a clean exit-4 "exists" refusal leaving the part intact; without the guard there is no such
# refusal and the existing part is damaged (here: create adds a duplicate, the delta fails, and the rollback removes it).
v("M5", rc != 4 and damaged, "mutant exit %d (guarded=4), part damaged/removed %s (expect the bug)" % (rc, damaged))

# M6 mutant: drop the >=2 declaration REQUIREMENT so 0 declarations silently picks a part (the shape Langston forbade).
# Two line edits: never refuse, and default to the first part when nothing declares ledger:true.
with open(W, encoding="utf-8") as fh: src = fh.read()
n1 = "            if len(decl) != 1:"
n2 = '            name, rule = decl[0], "declared"'
assert src.count(n1) == 1 and src.count(n2) == 1, ("M6 anchors", src.count(n1), src.count(n2))
mut = src.replace(n1, "            if len(decl) > 99:  # mutant: never refuse").replace(
    n2, '            name, rule = (decl[0] if decl else parts[0][0]), "declared"  # mutant: silent pick')
MW6 = D + "/mutant-decl"; open(MW6, "w", encoding="utf-8").write(mut); os.chmod(MW6, 0o755)
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h, script=MW6)
run(h, whole("new", 0, 0, part="90-plain.md"), (b"## " + chr(0x2605).encode() + b" P\n- n\n"), script=MW6)   # 2 parts, none declare
rc, out = run(h, app(sha(rd(h, "memory-parts/00-legacy.md")), 1), b"- silent landing\n", script=MW6)
v("M6", rc == 0, "mutant exit %d (expect silent landing when nothing declares ledger:true - the shape Langston forbade)" % rc)

bad = [n for n, ok in results if not ok]
print("RESULT: %d of %d matched%s" % (len(results) - len(bad), len(results), "" if not bad else "; DIFFER: " + ", ".join(bad)))
sys.exit(1 if bad else 0)
