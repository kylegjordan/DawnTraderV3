"""B-LANGSTON-CONTEXT P-2 --rename-part proof + the ledger guards (Langston C-1..C-6, 2026-09-12).
Run as root on Helsinki from /root/lc3-test/p2rn. Scratch LANGSTON_HOME; reader is the real root-owned
/opt/langston-memory/bin/langston_memory.py. Two levels of proof:
  PART A - rename MECHANICS, driving the installed tool (a rename moves a part's NAME; its bytes never change,
           but its place in the composition ORDER does, so the ledger block can RELOCATE):
    R1  rename the sole part (no reorder)                        -> exit 0, old gone, new present, MEMORY.md recomposed
    R2  rename that REORDERS composition                        -> exit 0, body byte-order changes, ledger intact, retr unchanged
    R3  --to names an EXISTING part                             -> exit 4 'already exists', nothing changed
    R4  --rename-part names a NON-EXISTENT part                 -> exit 4 'no part named', nothing changed
    R5  --expect-sha mismatch on the old part                   -> exit 4 'does not match', nothing changed
    R6  four illegal --to names + a bare-name --rename-part     -> exit 2 'not a bare part filename', nothing created/escaped
    R7  --rename-part == --to                                   -> exit 2 'same name'
    R8  MEMORY.md written OUT OF BAND                            -> exit 4 'out-of-band', nothing changed
    R9  a part changed since last compose (parts-sha drift)     -> exit 4 'changed since the last compose'
  PART B - the LEDGER GUARDS. Firing via a rename REORDER (integration) proves they are wired into do_rename and
           that the three-way rollback is byte-identical; unit calls + code mutants prove EACH guard discriminates
           and the coordinate math is right (Langston: measure WHICH guard fires; delete each guard separately).
    C2  reorder puts an EXACT '### CC-A errors I logged' before the span  -> rename exit 5, three-way rollback byte-identical
    C5  reorder puts '###   Retractions'(flex ws) before the span         -> reader binds it, C-2's exact find skips it,
                                                                             so CONTAINMENT fires ALONE -> exit 5, rollback
    C1u multi anchored heading (unit)                            -> guard returns the 'ambiguous' problem
    C3u coord positive control against the LIVE composed file    -> span matches, Sum(part ranges)==len(body) in BYTES
    C6u three degraded reader statuses (unit)                    -> condition-2 problem for each of no-section/no-entries/unreadable
    M-C2   delete the span-canary loop      -> the C2 reorder now RENAMES (exit 0): the break lands
    M-CONT delete the containment check     -> the C5 reorder now RENAMES (exit 0): the break lands
    M-SP   delete block-single-part (unit)  -> a split-ledger body returns [] instead of the split problem
    M-C3   char offsets instead of byte     -> Sum != len(body) on the multi-byte live body is no longer detected
"""
import hashlib, importlib.util, json, os, shutil, subprocess, sys

D = "/root/lc3-test/p2rn"
W = D + "/langston-memory-write"
# the reader carries the UNCOMMITTED byte-offset change the guards depend on; test against that copy, not the
# installed /opt one (which has no `offset` field and ships only after Langston's review). Root-owned scratch dir,
# so the writer's root-run reader-trust guard passes.
READER = D + "/langston_memory.py"
LIVE_HOME = "/home/langston"
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


# ── fixtures. The ledger carries ALL THREE guard sub-sections and multi-byte chars (★ · —), so the byte-vs-char
#    coordinate math is genuinely exercised (M-C3). retraction count = 2.
LEDGER = NL.join([
    "## " + chr(0x2605) * 2 + " REVIEWER LEDGER " + chr(0x2014) + " MY OWN RETRACTIONS", "",
    "### Retractions (things I asserted and then withdrew)",
    "- **first retraction**, a fixture entry long enough to look like one.",
    "- **second retraction**, with a continuation below.",
    "  " + chr(0xB7) + " a continuation led by a middle dot", "",
    "### Rulings of mine that GENERALISE (reusable)",
    "- a generalised ruling, not a retraction", "",
    "### CC-A errors I logged (from reviews)",
    "- an error I logged during a review", ""])
HEADER = "# MEMORY " + chr(0x2014) + " fixture" + NL + NL
NOTES = "## " + chr(0x2605) + " STANDING NOTES" + NL + "- a note" + NL
# a single-part BASE: header + ledger + notes (one part, self-contained, ends in one newline)
BASE = HEADER + LEDGER + NL + NOTES
BASE_B = BASE.encode("utf-8")


def home(memory_bytes, parts):
    h = D + "/home"
    shutil.rmtree(h, ignore_errors=True)
    os.makedirs(h + "/memory-parts"); os.makedirs(h + "/.memory-archive")
    with open(h + "/MEMORY.md", "wb") as fh: fh.write(memory_bytes)
    for n, b in parts.items():
        with open(h + "/memory-parts/" + n, "wb") as fh: fh.write(b)
    return h


def run(h, args, script=W, stdin_b=b"", reader=READER):
    # rename/compose read no stdin; default b"" so a mutant that still reads stdin cannot hang the harness.
    env = dict(os.environ, LANGSTON_HOME=h, LANGSTON_MEMORY_READER=reader)
    p = subprocess.run(interp(script) + [script] + args, input=stdin_b, capture_output=True, env=env, timeout=120)
    return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")


def migrate(h, script=W, reader=READER): return run(h, ["--compose", "--by", "m", "--reason", "m"], script=script, reader=reader)
def wholepart(h, part, expect, l, r, content_b, script=W):
    return run(h, ["--expect-sha", expect, "--ledger-delta", str(l), "--retractions-delta", str(r),
                   "--part", part, "--by", "t", "--reason", "t"], script=script, stdin_b=content_b)
def state_bytes(h):
    with open(h + "/.memory-archive/compose-state.json", "rb") as fh: return fh.read()
def rn(h, old, new, expect, script=W):
    return run(h, ["--rename-part", old, "--to", new, "--expect-sha", expect, "--by", "t", "--reason", "t"], script=script)
def rd(h, rel="MEMORY.md"):
    with open(h + "/" + rel, "rb") as fh: return fh.read()
def exists(h, rel): return os.path.exists(h + "/" + rel)
def strip_last_stamp(b):
    lines = b.split(b"\n")
    if len(lines) >= 2 and lines[-1] == b"" and lines[-2].startswith(b"<!-- composed "):
        return b"\n".join(lines[:-2]) + b"\n"
    return b
def psha(h): return sha(rd(h, "memory-parts/00-legacy.md"))


def reader_parse(body_bytes):
    spec = importlib.util.spec_from_file_location("r", READER); m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    p = D + "/unit.md"
    with open(p, "wb") as fh: fh.write(body_bytes)
    return m._parse_ledger(p)


def load_writer(home_for_consts=None, script=W):
    # the writer has no .py extension, so spec_from_file_location returns None (no loader inferred) - hand it an
    # explicit SourceFileLoader. Constants (TARGET/PARTS_DIR) are read at import from LANGSTON_HOME, so set it first.
    import importlib.machinery
    if home_for_consts:
        os.environ["LANGSTON_HOME"] = home_for_consts
    os.environ["LANGSTON_MEMORY_READER"] = READER
    loader = importlib.machinery.SourceFileLoader("lmw_" + str(abs(id(script))), script)
    spec = importlib.util.spec_from_loader(loader.name, loader)
    m = importlib.util.module_from_spec(spec)
    loader.exec_module(m)
    return m


def mutant(anchor, replacement, out_name, expect_one=True):
    with open(W, encoding="utf-8") as fh:
        src = fh.read()
    if expect_one:
        assert src.count(anchor) == 1, (out_name + " anchor", src.count(anchor))
    path = D + "/" + out_name
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(src.replace(anchor, replacement, 1))
    os.chmod(path, 0o755)
    return path


print(__doc__)

# ─────────────────────────── PART A — rename mechanics ───────────────────────────

# R1 rename the sole part (no reorder possible with one part)
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
mem_before = rd(h); ps = psha(h)
rc, out = rn(h, "00-legacy.md", "10-core.md", ps)
ok = (rc == 0 and not exists(h, "memory-parts/00-legacy.md") and exists(h, "memory-parts/10-core.md")
      and strip_last_stamp(rd(h)) == strip_last_stamp(mem_before) and b"REVIEWER LEDGER" in rd(h))
v("R1", ok, "exit %d, old-gone %s, new-present %s, body-stable %s" % (
    rc, not exists(h, "memory-parts/00-legacy.md"), exists(h, "memory-parts/10-core.md"),
    strip_last_stamp(rd(h)) == strip_last_stamp(mem_before)))

# R2 rename that REORDERS: two parts (ledger in 10-core, a plain note in 50-notes with NO ledger strings);
#    rename 50-notes -> 05-notes so it sorts FIRST. Body byte-order changes; ledger stays intact; retr unchanged.
def two_part_home():
    core = HEADER + LEDGER      # ledger part (LEDGER already ends in one newline)
    note = "## " + chr(0x2605) + " EXTRA NOTES" + NL + "- an extra note, no ledger words here" + NL
    h = home((core + note).encode("utf-8"), {"10-core.md": core.encode("utf-8"), "50-notes.md": note.encode("utf-8")})
    migrate(h)
    return h
h = two_part_home()
body_before = strip_last_stamp(rd(h))
st_r, e_r = reader_parse(rd(h))
rc, out = rn(h, "50-notes.md", "05-notes.md", sha(rd(h, "memory-parts/50-notes.md")))
st_a, e_a = reader_parse(rd(h))
reordered = strip_last_stamp(rd(h)) != body_before
ok = (rc == 0 and exists(h, "memory-parts/05-notes.md") and not exists(h, "memory-parts/50-notes.md")
      and reordered and len(e_a) == len(e_r) == 2 and b"REVIEWER LEDGER" in rd(h))
v("R2", ok, "exit %d, reordered %s, retr %d->%d, new-present %s" % (rc, reordered, len(e_r), len(e_a), exists(h, "memory-parts/05-notes.md")))

# R3 --to already exists
h = two_part_home()
rc, out = rn(h, "50-notes.md", "10-core.md", sha(rd(h, "memory-parts/50-notes.md")))
v("R3", rc == 4 and "already exists" in out and exists(h, "memory-parts/50-notes.md") and exists(h, "memory-parts/10-core.md"),
  "exit %d, both still present %s: %s" % (rc, exists(h, "memory-parts/50-notes.md") and exists(h, "memory-parts/10-core.md"), out.strip()[:80]))

# R4 --rename-part names a non-existent part
h = two_part_home()
rc, out = rn(h, "99-ghost.md", "05-new.md", sha(b"whatever"))
v("R4", rc == 4 and "no part named" in out and not exists(h, "memory-parts/05-new.md"),
  "exit %d, not-created %s: %s" % (rc, not exists(h, "memory-parts/05-new.md"), out.strip()[:80]))

# R5 --expect-sha mismatch
h = two_part_home()
before = rd(h, "memory-parts/50-notes.md")
rc, out = rn(h, "50-notes.md", "05-notes.md", sha(b"stale"))
v("R5", rc == 4 and "does not match" in out and exists(h, "memory-parts/50-notes.md") and not exists(h, "memory-parts/05-notes.md")
  and rd(h, "memory-parts/50-notes.md") == before, "exit %d, unchanged %s: %s" % (rc, rd(h, "memory-parts/50-notes.md") == before, out.strip()[:70]))

# R6 illegal --to names (+ one illegal --rename-part) each refuse exit 2 and create/escape nothing
illegal_to = {".hidden.md": None, "sub/x.md": D + "/home/memory-parts/sub/x.md",
              "../ESCAPED.md": D + "/home/ESCAPED.md", "/tmp/lmwrig-ABS.md": "/tmp/lmwrig-ABS.md"}
r6_ok, r6_obs = True, []
for nm, escaped in illegal_to.items():
    h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
    try: os.remove(escaped)
    except (FileNotFoundError, TypeError): pass
    rc, out = rn(h, "00-legacy.md", nm, psha(h))
    made = (escaped and os.path.exists(escaped)) or exists(h, "memory-parts/" + os.path.basename(nm))
    still = exists(h, "memory-parts/00-legacy.md")
    ok = rc == 2 and "not a bare part filename" in out and not made and still
    r6_ok = r6_ok and ok; r6_obs.append("to=%s->exit%d,made=%s" % (nm, rc, bool(made)))
    try: os.remove(escaped)
    except (FileNotFoundError, TypeError): pass
# and an illegal --rename-part source
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
rc, out = rn(h, "../ESCAPED.md", "10-core.md", psha(h))
r6_ok = r6_ok and rc == 2 and "not a bare part filename" in out
r6_obs.append("from=../ESCAPED->exit%d" % rc)
v("R6", r6_ok, "; ".join(r6_obs))

# R7 same name
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
rc, out = rn(h, "00-legacy.md", "00-legacy.md", psha(h))
v("R7", rc == 2 and "same name" in out and exists(h, "memory-parts/00-legacy.md"), "exit %d: %s" % (rc, out.strip()[:70]))

# R8 MEMORY.md written out of band (a hand edit) -> refuse before touching a part
h = home(BASE_B, {"00-legacy.md": BASE_B}); migrate(h)
with open(h + "/MEMORY.md", "ab") as fh: fh.write(b"\n<!-- hand edit -->\n")
rc, out = rn(h, "00-legacy.md", "10-core.md", psha(h))
v("R8", rc == 4 and "out-of-band" in out and exists(h, "memory-parts/00-legacy.md") and not exists(h, "memory-parts/10-core.md"),
  "exit %d, part untouched %s: %s" % (rc, exists(h, "memory-parts/00-legacy.md"), out.strip()[:70]))

# R9 a part changed since last compose (parts-sha drift) -> refuse
h = two_part_home()
with open(h + "/memory-parts/50-notes.md", "ab") as fh: fh.write(b"- drifted line\n")
rc, out = rn(h, "10-core.md", "15-core.md", sha(rd(h, "memory-parts/10-core.md")))
v("R9", rc == 4 and "changed since the last compose" in out and not exists(h, "memory-parts/15-core.md"),
  "exit %d, not-renamed %s: %s" % (rc, not exists(h, "memory-parts/15-core.md"), out.strip()[:80]))

# ─────────────────────────── PART B — the ledger guards ───────────────────────────

# A two-part home whose GOOD order composes clean, but a rename that moves a decoy part BEFORE the ledger breaks it.
def decoy_home(decoy_body):
    """10-ledger.md holds the ledger; 90-decoy.md holds `decoy_body`. Good order (10 before 90) composes clean because
    the ledger's own exact sub-sections come first. Renaming 90-decoy -> 05-decoy sorts it FIRST and induces the break."""
    ledger_part = HEADER + LEDGER
    composed = ledger_part + decoy_body
    h = home(composed.encode("utf-8"), {"10-ledger.md": ledger_part.encode("utf-8"), "90-decoy.md": decoy_body.encode("utf-8")})
    code, o = migrate(h)
    return h, code, o

# C2 — decoy carries the EXACT '### CC-A errors I logged' string in its own '## ' section. Good order: the ledger's
#      copy is found first (in span). After the rename, the decoy's copy is first and BEFORE the span -> C-2 fires.
DECOY_C2 = "## " + chr(0x2605) + " DECOY" + NL + "### CC-A errors I logged" + NL + "- not a real ledger entry" + NL
h, mc, mo = decoy_home(DECOY_C2)
part_before = rd(h, "memory-parts/90-decoy.md"); mem_before = rd(h); state_before = state_bytes(h)
rc, out = rn(h, "90-decoy.md", "05-decoy.md", sha(part_before))
# three-way rollback ALL THREE legs byte-identical: old part, MEMORY.md, AND compose-state; new part gone.
rolled = (exists(h, "memory-parts/90-decoy.md") and rd(h, "memory-parts/90-decoy.md") == part_before
          and not exists(h, "memory-parts/05-decoy.md") and rd(h) == mem_before and state_bytes(h) == state_before)
# tightened (fresh-reviewer #10): assert the C-2 SUBSECTION message specifically, not the substring containment shares.
v("C2", mc == 0 and rc == 5 and "ledger integrity" in out and "ledger subsection '### CC-A errors I logged'" in out
  and "is OUTSIDE the block span" in out and rolled,
  "compose %d, rename exit %d, 3-leg rollback byte-identical %s: %s" % (mc, rc, rolled, out.strip()[:90]))

# C5 — decoy carries '###   Retractions' (THREE spaces) + a bullet. The reader binds it (\s* flexible), so after the
#      rename it parses that bullet at an offset BEFORE the span -> CONTAINMENT fires. C-2's EXACT '### Retractions'
#      find skips the 3-space variant and lands on the real one IN span -> C-2 passes. Containment fires ALONE.
# TWO bullets, so the reader's count is UNCHANGED (2->2) and delta-0 passes - leaving CONTAINMENT the only tripwire.
DECOY_C5 = ("## " + chr(0x2605) + " DECOY" + NL + "###   Retractions" + NL
            + "- a decoy bullet the reader will bind" + NL + "- a second decoy bullet, matching the real count" + NL)
h, mc, mo = decoy_home(DECOY_C5)
part_before = rd(h, "memory-parts/90-decoy.md"); mem_before = rd(h); state_before = state_bytes(h)
rc, out = rn(h, "90-decoy.md", "05-decoy.md", sha(part_before))
rolled = (exists(h, "memory-parts/90-decoy.md") and rd(h, "memory-parts/90-decoy.md") == part_before
          and not exists(h, "memory-parts/05-decoy.md") and rd(h) == mem_before and state_bytes(h) == state_before)
# containment is the ONLY tripwire: its message ('retraction entries OUTSIDE') fires, the C-2 subsection message does NOT.
cont_only = "retraction entr" in out and "OUTSIDE the block span" in out and "ledger subsection" not in out
v("C5", mc == 0 and rc == 5 and "ledger integrity" in out and cont_only and rolled,
  "compose %d, rename exit %d, containment-ALONE %s, 3-leg rollback %s: %s" % (mc, rc, cont_only, rolled, out.strip()[:90]))

# C1u — multi anchored heading, unit call on the guard
mod = load_writer(home_for_consts=D + "/home")
double_led = (HEADER + LEDGER + NL + LEDGER + NL).encode("utf-8")   # two '## …REVIEWER LEDGER' headings
st, e = reader_parse(double_led)
probs = mod.ledger_guard_problems(double_led, [double_led], e, st)
v("C1u", len(probs) == 1 and "ambiguous" in probs[0] and "headings" in probs[0], "problems=%r" % probs)

# C3u — coordinate positive control against the LIVE composed file (real parts, real reader, byte-based math).
modL = load_writer(home_for_consts=LIVE_HOME)
parts = modL.read_parts()
body, parts_sha, body_sha = modL.compose_body(parts)
span = modL.ledger_span(body)
part_bodies = [pb for _, _, pb, _ in parts]
total = sum(len(pb) for pb in part_bodies)
st, e = reader_parse(body)
probs = modL.ledger_guard_problems(body, part_bodies, e, st)
in_span = isinstance(span, tuple) and span[0] != "multi" and span[0] < span[1] <= len(body)
v("C3u", in_span and total == len(body) and probs == [] and st == "ok",
  "live span %r, Sum(ranges)=%d, len(body)=%d, entries=%d, status=%s, problems=%r" % (span, total, len(body), len(e), st, probs))

# C6u — three degraded reader statuses each raise the condition-2 problem (never a vacuous pass).
cases = {
    "no-section": (HEADER + NOTES).encode("utf-8"),                                   # no REVIEWER LEDGER heading at all
    "no-entries": (HEADER + "## " + chr(0x2605) * 2 + " REVIEWER LEDGER" + NL + NL + "### Retractions" + NL + NL + NOTES).encode("utf-8"),
}
c6_ok, c6_obs = True, []
for label, b in cases.items():
    st, e = reader_parse(b)
    probs = mod.ledger_guard_problems(b, [b], e, st)
    fired = any("could not parse the composed ledger: status=" in p for p in probs)
    c6_ok = c6_ok and st != "ok" and fired
    c6_obs.append("%s status=%s fired=%s" % (label, st, fired))
# unreadable: hand a status the guard treats as non-ok directly (the reader raises on a missing file; the tool maps
#   that to 'unreadable' in retraction_count before the guard runs, so exercise the guard's own branch)
probs = mod.ledger_guard_problems(BASE_B, [BASE_B], [], "unreadable")
c6_ok = c6_ok and any("status=unreadable" in p for p in probs)
c6_obs.append("unreadable fired=%s" % any("status=unreadable" in p for p in probs))
v("C6u", c6_ok, "; ".join(c6_obs))

# ── MUTANTS: delete each guard separately; the input that only that guard catches now passes ──

# M-C2 delete the span-canary loop -> the C2 reorder now RENAMES (exit 0), landing the break.
MC2 = mutant("for sub in LEDGER_SUBSECTIONS:", "for sub in []:  # mutant: span-canary deleted", "mutant-c2")
h, mc, mo = decoy_home(DECOY_C2)
rc, out = rn(h, "90-decoy.md", "05-decoy.md", sha(rd(h, "memory-parts/90-decoy.md")), script=MC2)
v("M-C2", mc == 0 and rc == 0 and exists(h, "memory-parts/05-decoy.md"),
  "mutant rename exit %d (guarded=5), break landed %s" % (rc, exists(h, "memory-parts/05-decoy.md")))

# M-CONT delete the containment check -> the C5 reorder now RENAMES (exit 0).
MCONT = mutant('outside = [en for en in entries if not (s <= en["offset"] < e)]',
               'outside = []  # mutant: containment deleted', "mutant-cont")
h, mc, mo = decoy_home(DECOY_C5)
rc, out = rn(h, "90-decoy.md", "05-decoy.md", sha(rd(h, "memory-parts/90-decoy.md")), script=MCONT)
v("M-CONT", mc == 0 and rc == 0 and exists(h, "memory-parts/05-decoy.md"),
  "mutant rename exit %d (guarded=5), break landed %s" % (rc, exists(h, "memory-parts/05-decoy.md")))

# M-SP delete block-single-part (unit): a body whose ledger is split across two part ranges returns [] under the mutant.
MSP = mutant("if len(holder) != 1:", "if False and len(holder) != 1:  # mutant: block-single-part deleted", "mutant-sp")
modSP = load_writer(home_for_consts=D + "/home", script=MSP)
mod0 = load_writer(home_for_consts=D + "/home")
# split the ledger across two adjacent part bodies at a byte boundary inside the block
full = HEADER + LEDGER
cut = full.encode("utf-8").index(b"### Rulings")
pb1, pb2 = full.encode("utf-8")[:cut], full.encode("utf-8")[cut:]
body = pb1 + pb2
st, e = reader_parse(body)
real = mod0.ledger_guard_problems(body, [pb1, pb2], e, st)
mut = modSP.ledger_guard_problems(body, [pb1, pb2], e, st)
v("M-SP", any("not wholly within ONE part" in p for p in real) and not any("not wholly within ONE part" in p for p in mut),
  "real caught split %s, mutant silent %s" % (any("not wholly within ONE part" in p for p in real), not any("not wholly within ONE part" in p for p in mut)))

# M-C3 char offsets instead of byte -> on the multi-byte live body the coordinate mismatch is no longer detected.
#   The real C-3 uses len(b) (bytes); the mutant measures character length. On a body with multi-byte chars the sum
#   diverges from len(body) bytes, so a genuine coordinate disagreement (a part range wrong) goes unseen.
MC3 = mutant("        ranges.append((off, off + len(b)))\n        off += len(b)",
             "        ranges.append((off, off + len(b.decode('utf-8'))))  # mutant: CHAR length\n        off += len(b.decode('utf-8'))  # mutant: CHAR length",
             "mutant-c3")
modC3 = load_writer(home_for_consts=LIVE_HOME, script=MC3)
mod0L = load_writer(home_for_consts=LIVE_HOME)
parts = mod0L.read_parts(); body, _, _ = mod0L.compose_body(parts); pbs = [pb for _, _, pb, _ in parts]
st, e = reader_parse(body)
real = mod0L.ledger_guard_problems(body, pbs, e, st)     # clean on the live file (bytes agree)
mut = modC3.ledger_guard_problems(body, pbs, e, st)      # char-count sum != byte len(body) -> false 'coordinate systems disagree'
has_mb = any(len(pb) != len(pb.decode("utf-8")) for pb in pbs)   # confirm the fixture actually has multi-byte chars
v("M-C3", has_mb and real == [] and any("coordinate systems disagree" in p for p in mut),
  "multi-byte-present %s, real-clean %s, mutant-diverges %s" % (has_mb, real == [], any("coordinate systems disagree" in p for p in mut)))

# ── ADDED after a fresh-context review (2026-09-13): close the gaps the reviewer found ──

# RDR (fresh-reviewer #1/#2) — the INSTALLED reader has no `offset` field; the writer must FAIL FAST with a clear
#   reader-version message BEFORE any write, never a false 'ledger corruption'. Control: the offset reader composes.
h = home(BASE_B, {"00-legacy.md": BASE_B})
rc_bad, out_bad = migrate(h, reader="/opt/langston-memory/bin/langston_memory.py")
# a DISCRIMINATING no-write proof (fresh-reviewer r2 #1): the fail-fast is pre-lock, so on a genuine refusal MEMORY.md
#   is byte-identical to BASE_B (NO stamp), compose-state.json was never written, and the archive holds no .md. If the
#   fail-fast were ever relocated after the write, all three flip - unlike the old strip-stamp check, which could not.
no_write = (rd(h) == BASE_B and not os.path.exists(h + "/.memory-archive/compose-state.json")
            and not any(fn.endswith(".md") for fn in os.listdir(h + "/.memory-archive")))
h2 = home(BASE_B, {"00-legacy.md": BASE_B}); rc_ok, _ = migrate(h2)   # offset reader = positive control
v("RDR", rc_bad == 6 and "does not emit a byte offset" in out_bad and "OUTSIDE the block span" not in out_bad
  and no_write and rc_ok == 0,
  "installed-reader exit %d, no-write(bytes+state+archive) %s, offset-reader exit %d: %s" % (rc_bad, no_write, rc_ok, out_bad.strip()[:70]))

# CC (fresh-reviewer #3) — integration-test do_compose's guard. A broken composed body as `cur` on FIRST compose
#   (decoy's exact '### CC-A errors I logged' sorts before the ledger span) -> compose refuses exit 5, C-2.
LP = HEADER + LEDGER
DEC = "## " + chr(0x2605) + " DECOY" + NL + "### CC-A errors I logged" + NL + "- decoy, not a real entry" + NL
h = home((DEC + LP).encode("utf-8"), {"10-decoy.md": DEC.encode("utf-8"), "20-ledger.md": LP.encode("utf-8")})
rc, out = migrate(h)
v("CC", rc == 5 and "ledger integrity" in out and "ledger subsection '### CC-A errors I logged'" in out,
  "do_compose guard exit %d: %s" % (rc, out.strip()[:90]))

# DW (fresh-reviewer #3) — integration-test do_direct_write's guard + three-way rollback. Write an exact
#   '### CC-A errors I logged' into the FIRST-sorting part; after recompose it is before the span -> C-2 -> rollback.
NOTES2 = "## " + chr(0x2605) + " NOTES" + NL + "- a plain note, no ledger words" + NL
h = home((NOTES2 + LP).encode("utf-8"), {"10-notes.md": NOTES2.encode("utf-8"), "20-ledger.md": LP.encode("utf-8")})
mc, mo = migrate(h)
part_before = rd(h, "memory-parts/10-notes.md"); mem_before = rd(h); state_before = state_bytes(h)
DEC_CONTENT = ("## " + chr(0x2605) + " NOTES" + NL + "### CC-A errors I logged" + NL + "- decoy in notes" + NL).encode("utf-8")
rc, out = wholepart(h, "10-notes.md", sha(part_before), 0, 0, DEC_CONTENT)
rolled = (rd(h, "memory-parts/10-notes.md") == part_before and rd(h) == mem_before and state_bytes(h) == state_before)
v("DW", mc == 0 and rc == 5 and "ledger integrity" in out and "ledger subsection '### CC-A errors I logged'" in out and rolled,
  "do_direct_write guard exit %d, 3-leg rollback %s: %s" % (rc, rolled, out.strip()[:90]))

# DELTA0 (fresh-reviewer #9) — make the do_rename delta-0 branch fire on its own: a ONE-bullet decoy the reorder
#   binds, dropping the reader's count 2->1, which delta-0 catches BEFORE the ledger guards.
DECOY_1 = ("## " + chr(0x2605) + " DECOY" + NL + "###   Retractions" + NL + "- one decoy bullet only" + NL)
h, mc, mo = decoy_home(DECOY_1)
part_before = rd(h, "memory-parts/90-decoy.md"); mem_before = rd(h); state_before = state_bytes(h)
rc, out = rn(h, "90-decoy.md", "05-decoy.md", sha(part_before))
rolled = (exists(h, "memory-parts/90-decoy.md") and rd(h, "memory-parts/90-decoy.md") == part_before
          and not exists(h, "memory-parts/05-decoy.md") and rd(h) == mem_before and state_bytes(h) == state_before)
v("DELTA0", mc == 0 and rc == 5 and "delta-0" in out and "retraction entries" in out and rolled,
  "do_rename delta-0 exit %d, 3-leg rollback %s: %s" % (rc, rolled, out.strip()[:90]))

# M-C1 (fresh-reviewer #5) — no mutant existed for C-1. Disable ledger_span's multi-heading detection: a two-heading
#   body then composes a span over only the FIRST block, so the ambiguity slips through (no 'ambiguous' problem).
MC1 = mutant('    if len(heads) > 1:\n        return ("multi", len(heads))',
             '    if len(heads) > 999:  # mutant: C-1 multi-heading detection disabled\n        return ("multi", len(heads))', "mutant-c1")
modC1 = load_writer(home_for_consts=D + "/home", script=MC1)
st1, e1 = reader_parse(double_led)
real = mod.ledger_guard_problems(double_led, [double_led], e1, st1)
# tightened (fresh-reviewer r2 #3): no crash-as-success branch - the mutant must return a clean list that SILENTLY
#   ACCEPTS the two-heading body (no 'ambiguous' problem). That is the real danger; a crash would be a different bug.
mut = modC1.ledger_guard_problems(double_led, [double_led], e1, st1)
mut_missed = isinstance(mut, list) and not any("ambiguous" in p for p in mut)
v("M-C1", any("ambiguous" in p for p in real) and mut_missed,
  "real-caught-ambiguous %s, mutant-silently-accepted %s (mut=%r)" % (any("ambiguous" in p for p in real), mut_missed, mut))

# M-COND2 (fresh-reviewer #5) — no mutant existed for condition-2 (never-vacuous). A no-entries ledger with all THREE
#   sub-sections present: only condition-2 fires (C-2/containment pass). Disable it -> the empty ledger passes silently.
NOENT = (HEADER + NL.join([
    "## " + chr(0x2605) * 2 + " REVIEWER LEDGER " + chr(0x2014) + " X", "",
    "### Retractions (things I asserted and then withdrew)", "",
    "### Rulings of mine that GENERALISE (reusable)", "- a ruling", "",
    "### CC-A errors I logged (from reviews)", "- an error", ""])).encode("utf-8")
MCOND = mutant('    if reader_status != "ok":', '    if False and reader_status != "ok":  # mutant: condition-2 disabled', "mutant-cond2")
modCOND = load_writer(home_for_consts=D + "/home", script=MCOND)
stn, en = reader_parse(NOENT)
real = mod.ledger_guard_problems(NOENT, [NOENT], en, stn)
mut = modCOND.ledger_guard_problems(NOENT, [NOENT], en, stn)
v("M-COND2", stn == "no-entries" and any("could not parse" in p for p in real) and not any("could not parse" in p for p in mut),
  "status=%s, real-caught %s, mutant-silent %s" % (stn, any("could not parse" in p for p in real), not any("could not parse" in p for p in mut)))

bad = [n for n, ok in results if not ok]
print("RESULT: %d of %d matched%s" % (len(results) - len(bad), len(results), "" if not bad else "; DIFFER: " + ", ".join(bad)))
sys.exit(1 if bad else 0)
