#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 increment 1 (Langston's rulings Q1/Q2/Q5, 2026-10-16): the ledger split, the LEDGER.md
append and the split-mode guards, driven through the REAL writer as a subprocess against a throwaway home.

Run as ROOT on the agent box (the writer refuses any other uid but langston, and a root run executes the reader, so
this directory and the reader beside it must be root-owned): mkdir -m 700 /root/lmw-split-test, copy
langston-memory-write, langston_memory.py and this file into it, then `python3 test_ledger_split.py`.
Every refusal asserts the files BYTE-IDENTICAL afterwards; the expected counts are hand-counted, not computed by the
code under test."""
import hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile

sys.dont_write_bytecode = True   # no __pycache__ beside a reader a root run will trust-check

HERE = os.path.dirname(os.path.abspath(__file__))
WRITER = os.path.join(HERE, "langston-memory-write")
READER = os.path.join(HERE, "langston_memory.py")
NL = chr(10)
ANCHOR = "### Rulings of mine that GENERALISE"
RECIPE = "> ⛔⛔ **HOW YOU WRITE THIS FILE — THROUGH `langston-memory-write`, a fixture recipe line."

FIXTURE = NL.join([
    "# Langston MEMORY — fixture", "",
    RECIPE, "",
    "## ★ HEADER NOTES", "- a header note", "",
    "## ★★ REVIEWER LEDGER — MY OWN RETRACTIONS, RULINGS AND ERRORS", "",
    "### Retractions (things I asserted and then withdrew — do NOT re-assert)",
    "- **first retraction** about #101, a fixture entry long enough to look like one.",
    "- **second retraction** about sha 1234567abc, with a continuation line below.",
    "  · a continuation led by a middle dot",
    "- **third retraction** (ünïcödé — multi-byte, so a char/byte mix-up would show).",
    "", ANCHOR + " (reusable)",
    "- a generalised ruling, which the reader must NOT count as a retraction", "",
    "### CC-A errors I logged",
    "- an error note", "",
    "## ★ STANDING NOTES", "- a note outside the ledger", ""])
STUB = NL.join([
    "### Retraction ledger — MOVED to `/home/langston/LEDGER.md` (§19: run `langston-recall <term>` first)",
    "- classes: wrong-object · stale-figure · absence-claimed", ""])

ok = True


def check(name, got, want):
    global ok
    good = got == want
    ok = ok and good
    print("  %-4s %-84s expected %-10s got %s" % ("PASS" if good else "FAIL", name, str(want)[:10], str(got)[:120]))


def sha(b):
    return hashlib.sha256(b).hexdigest()


def rd(p):
    with open(p, "rb") as fh:
        return fh.read()


class Home:
    def __init__(self, text=FIXTURE, compose=True):
        self.top = tempfile.mkdtemp(prefix="lmw-split-", dir=HERE)
        self.mem = os.path.join(self.top, "MEMORY.md")
        self.ledger = os.path.join(self.top, "LEDGER.md")
        self.parts = os.path.join(self.top, "memory-parts")
        self.part = os.path.join(self.parts, "00-legacy.md")
        self.state = os.path.join(self.top, ".memory-archive", "compose-state.json")
        self.env = dict(os.environ, LANGSTON_HOME=self.top, LANGSTON_MEMORY_READER=READER)
        self.env.pop("LMW_TEST_SPLIT_FAIL", None)
        with open(self.mem, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        os.makedirs(self.parts)
        shutil.copyfile(self.mem, self.part)
        if not compose:          # a hand-forged home: the composer would refuse a part with no ledger section
            os.makedirs(os.path.dirname(self.state))
            with open(os.path.join(self.top, ".memory-archive", "index.jsonl"), "w", encoding="utf-8") as fh:
                fh.write(json.dumps({"mode": "compose", "outcome": "composed"}) + NL)
            return
        rc, out = self.call(["--compose", "--by", "t", "--reason", "fixture"])
        assert rc == 0, out

    def call(self, args, stdin="", extra=None):
        e = dict(self.env, **(extra or {}))
        p = subprocess.run([sys.executable, WRITER] + args, input=stdin.encode("utf-8"), capture_output=True,
                           env=e, timeout=120)
        return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")

    def reader(self):
        # a FRESH import per call: LEDGER_SOURCES is computed from LANGSTON_HOME at import time
        os.environ["LANGSTON_HOME"] = self.top
        spec = importlib.util.spec_from_file_location("lm_%d" % id(self), READER)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m

    def snap(self):
        return {p: (rd(p) if os.path.exists(p) else None) for p in (self.mem, self.part, self.state, self.ledger)}

    def split(self, stub=STUB, extra=None, expect=None):
        return self.call(["--split-ledger", "--expect-sha", expect or sha(rd(self.part)), "--by", "t",
                          "--reason", "test"], stub, extra)

    def index_rows(self):
        p = os.path.join(self.top, ".memory-archive", "index.jsonl")
        return [json.loads(l) for l in open(p, encoding="utf-8").read().split(NL) if l.strip()]

    def done(self):
        shutil.rmtree(self.top)


def main():
    if os.geteuid() != 0:
        print("run as root (see the docstring)")
        sys.exit(2)

    print("1. the split itself")
    h = Home()
    r0 = h.reader()
    s0, e0 = r0._parse_ledger(h.mem)
    check("control: the fixture's MEMORY.md parses 3 retractions before the split", (s0, len(e0)), ("ok", 3))
    check("control: before the split recall reads MEMORY.md (no LEDGER.md yet) and is ok", r0.ledger_state()[0], "ok")
    mem_before = rd(h.mem)
    rc, out = h.split()
    check("split exits 0", rc, 0)
    r1 = h.reader()
    sl, el = r1._parse_ledger(h.ledger)
    check("LEDGER.md parses the same 3 retractions", (sl, len(el) if el else 0), ("ok", 3))
    check("fingerprint SETS equal both ways (old MEMORY.md vs LEDGER.md)", r1._fingerprint(el) == r0._fingerprint(e0), True)
    check("MEMORY.md now has NO Retractions section", r1._parse_ledger(h.mem)[0], "no-section")
    st, src = r1.ledger_state()[:2]
    check("recall's ledger_state is ok and reads LEDGER.md", (st, src), ("ok", h.ledger))
    mem = rd(h.mem).decode("utf-8")
    check("the stub is in MEMORY.md", STUB.strip(NL) in mem, True)
    check("the GENERALISE rulings stay in MEMORY.md", ANCHOR in mem, True)
    check("the CC-A errors subsection stays in MEMORY.md", "### CC-A errors I logged" in mem, True)
    lines = mem.split(NL)
    i = next(n for n, l in enumerate(lines) if l.startswith("> ⛔⛔ **HOW YOU WRITE THIS FILE"))
    check("the new recipe line sits immediately after the recipe header (same write)",
          lines[i + 1].startswith("> ⛔ **SINCE 2026-10-16 YOUR RETRACTIONS LIVE IN"), True)
    # NOT "MEMORY.md shrank": this fixture's 3 entries are smaller than the stub + recipe line, so a size check would
    # fail on a correct split here and pass on a wrong one against the live 825 KB file. Check the entries MOVED.
    lt = rd(h.ledger).decode("utf-8")
    check("every retraction left MEMORY.md and is in LEDGER.md",
          [(en["text"] in mem, en["text"] in lt) for en in e0], [(False, True)] * 3)
    state = json.loads(rd(h.state))
    check("compose-state last_written_sha == the live MEMORY.md", state["last_written_sha"], sha(rd(h.mem)))
    check("compose-state pending_sha cleared", state["pending_sha"], None)
    check("the part reproduces MEMORY.md's body (part-of-record holds the stub too)",
          rd(h.mem).startswith(rd(h.part)), True)
    rows = [r for r in h.index_rows() if r.get("mode") == "split-ledger"]
    check("index: split-ledger attempted then written", [r["outcome"] for r in rows], ["attempted", "written"])
    arch = os.path.join(h.top, ".memory-archive")
    check("the pre-split MEMORY.md is archived", os.path.exists(os.path.join(arch, sha(mem_before) + ".md")), True)
    check("the pre-split part is archived", os.path.exists(os.path.join(arch, rows[0]["part_old_sha"] + ".md")), True)

    print("2. after the split")
    before = h.snap()
    rc, out = h.split()
    check("a second split refuses (exit 2)", rc, 2)
    check("  ...and changed nothing", h.snap() == before, True)

    rc, out = h.call(["--compose", "--by", "t", "--reason", "t"])
    check("--compose after the split passes the split-mode guards (exit 0)", rc, 0)

    entry = "- **fourth retraction** appended after the split, long enough to be one." + NL
    mem_b = rd(h.mem)
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-append", "--entries", "1", "--by", "t",
                      "--reason", "t"], entry)
    check("append with the PART's sha now refuses (exit 4) - LEDGER.md's sha is required", rc, 4)
    rc, out = h.call(["--expect-sha", sha(rd(h.ledger)), "--ledger-append", "--entries", "1", "--by", "t",
                      "--reason", "t"], entry)
    check("append with LEDGER.md's sha exits 0", rc, 0)
    r2 = h.reader()
    s2, e2 = r2._parse_ledger(h.ledger)
    check("LEDGER.md now has 4 retractions", len(e2), 4)
    check("the old 3 are contained in the new set", r1._fingerprint(el) <= r2._fingerprint(e2), True)
    check("MEMORY.md untouched by a ledger append", sha(rd(h.mem)), sha(mem_b))
    check("recall still ok after the append", r2.ledger_state()[0], "ok")
    snap = h.snap()
    rc, out = h.call(["--expect-sha", sha(rd(h.ledger)), "--ledger-append", "--entries", "2", "--by", "t",
                      "--reason", "t"], entry.replace("fourth", "fifth"))
    check("append declaring 2 but carrying 1 refuses (exit 5) and restores", rc, 5)
    check("  ...LEDGER.md byte-identical afterwards", h.snap() == snap, True)

    part = rd(h.part).decode("utf-8")
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "t"], part.replace("- a note outside the ledger", "- an edited standing note"))
    check("a whole-file part write after the split passes the guards (exit 0)", rc, 0)
    snap = h.snap()
    bad = rd(h.part).decode("utf-8").replace(STUB.split(NL)[0], "### Retractions (re-added by an old recipe)")
    # declared HONESTLY (the stub's one bullet now parses as 1 retraction), so the COUNT check passes and only the
    # split-mode guard can refuse it - otherwise this case would pass on the count check and prove nothing.
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "1", "--by", "t",
                      "--reason", "t"], bad)
    check("a write that RE-ADDS a Retractions heading to MEMORY.md is refused (exit 5)", rc, 5)
    check("  ...the guard named LEDGER.md", "LEDGER.md" in out, True)
    check("  ...and everything restored byte-identical", h.snap() == snap, True)

    os.rename(h.ledger, h.ledger + ".aside")
    snap = h.snap()
    rc, out = h.call(["--expect-sha", "0" * 64, "--ledger-append", "--entries", "1", "--by", "t", "--reason", "t"], entry)
    check("with LEDGER.md gone, an append refuses (exit 2)", rc, 2)
    check("  ...and does NOT recreate LEDGER.md", os.path.exists(h.ledger), False)
    check("  ...nothing else changed", h.snap() == snap, True)
    lst = h.reader().ledger_state()
    check("with LEDGER.md gone, recall refuses as priority-source-ABSENT (not zero matches)",
          lst[0], "ledger-priority-source-absent")
    live_sha = sha(rd(h.ledger + ".aside"))
    check("  ...the refusal says the split IS recorded and names the newest LEDGER.md archive",
          ("split IS recorded" in lst[4], (".memory-archive/%s.md" % live_sha) in lst[4]), (True, True))
    check("  ...and that archive file exists and holds the live LEDGER.md bytes",
          rd(os.path.join(h.top, ".memory-archive", live_sha + ".md")) == rd(h.ledger + ".aside"), True)
    ap = os.path.join(h.top, ".memory-archive", live_sha + ".md")
    os.rename(ap, ap + ".aside")
    lst = h.reader().ledger_state()
    check("  ...with that archive ALSO gone, it names no restore and says UNKNOWN",
          ("NOT present" in lst[4], "UNKNOWN" in lst[4], "restore that file" in lst[4]), (True, True, False))
    os.rename(ap + ".aside", ap)
    ip = os.path.join(h.top, ".memory-archive", "index.jsonl")
    with open(ip, encoding="utf-8") as fh:
        good_idx = fh.read()
    with open(ip, "w", encoding="utf-8") as fh:
        fh.write("{cut mid-line" + NL + good_idx)
    lst = h.reader().ledger_state()
    check("  ...one unparseable index line does NOT hide the split row (still names the archive)",
          ("split IS recorded" in lst[4], (".memory-archive/%s.md" % live_sha) in lst[4], "could not be read" in lst[4]),
          (True, True, False))
    with open(ip, "w", encoding="utf-8") as fh:
        fh.write(good_idx)
    os.rename(h.ledger + ".aside", h.ledger)
    h.done()

    print("2b. an absent LEDGER.md with NO split recorded (Langston's forged state) names the other cause")
    h = Home(FIXTURE.replace("### Retractions (things I asserted and then withdrew — do NOT re-assert)",
                             "### Withdrawn (heading lost by hand)"), compose=False)
    lst = h.reader().ledger_state()
    check("recall refuses priority-source-absent", lst[0], "ledger-priority-source-absent")
    check("  ...says NO split is recorded and names --compose, NOT 'restore LEDGER.md'",
          ("NO split is recorded" in lst[4], "--compose" in lst[4], "restore that file" in lst[4]), (True, True, False))
    ip = os.path.join(h.top, ".memory-archive", "index.jsonl")
    with open(ip, encoding="utf-8") as fh:
        good_idx = fh.read()
    with open(ip, "w", encoding="utf-8") as fh:
        fh.write("{cut mid-line" + NL + good_idx)
    lst = h.reader().ledger_state()
    check("  ...with an unreadable line and no split row, it does NOT assert 'no split' - the cause is UNKNOWN",
          ("NO split is recorded in %s, so" % ip in lst[4], "UNKNOWN" in lst[4], "may BE the split" in lst[4]),
          (False, True, True))
    os.remove(ip)
    lst = h.reader().ledger_state()
    check("  ...with the archive index unreadable it says the cause is UNKNOWN and names both",
          ("UNKNOWN" in lst[4], "split out" in lst[4], "without a split" in lst[4]), (True, True, True))
    h.done()

    print("3. split refusals leave everything byte-identical")
    for name, stub, extra, want in (
            ("a stub over 4096 B", "- " + "x" * 4100 + NL, None, 2),
            ("a stub carrying '### Retractions'", "### Retractions moved" + NL, None, 2),
            ("a stub carrying a column-0 '## '", "## a heading" + NL, None, 2),
            ("an empty stub", "", None, 2),
            ("an injected post-write failure", STUB, {"LMW_TEST_SPLIT_FAIL": "1"}, 5),
            ("an injected crash after the writes", STUB, {"LMW_TEST_SPLIT_FAIL": "raise"}, 5)):
        h = Home()
        snap = h.snap()
        rc, out = h.split(stub, extra)
        check("%s refuses (exit %d)" % (name, want), rc, want)
        check("  ...MEMORY.md, part and compose-state byte-identical, LEDGER.md absent", h.snap() == snap, True)
        if extra:
            check("  ...recall reads MEMORY.md's retractions again (fail toward the breach)",
                  h.reader().ledger_state()[0], "ok")
            check("  ...index records the restore", h.index_rows()[-1]["outcome"], "restored")
        h.done()
    h = Home()
    snap = h.snap()
    rc, out = h.split(expect="f" * 64)
    check("a wrong --expect-sha refuses (exit 4)", rc, 4)
    check("  ...byte-identical", h.snap() == snap, True)
    rc, out = h.split("x" * 4095 + NL)
    check("a stub of exactly 4096 B is accepted (exit 0)", (rc, len(("x" * 4095 + NL).encode())), (0, 4096))
    h.done()
    h = Home(FIXTURE.replace("  · a continuation led by a middle dot", "#### an inner heading"))
    snap = h.snap()
    rc, out = h.split()
    check("a '##'-family heading inside the block refuses (exit 2)", rc, 2)
    check("  ...byte-identical", h.snap() == snap, True)
    h.done()
    h = Home()
    rc, out = h.call(["--split-ledger", "--ledger-append", "--expect-sha", "a" * 64, "--by", "t", "--reason", "t"], STUB)
    check("--split-ledger beside --ledger-append refuses (exit 2)", rc, 2)
    h.done()

    print("4. before the split nothing changes")
    h = Home()
    entry = "- **pre-split retraction** appended into the part, long enough to be one." + NL
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-append", "--entries", "1", "--by", "t",
                      "--reason", "t"], entry)
    check("a pre-split append still lands in the part (exit 0)", rc, 0)
    check("  ...4 retractions in MEMORY.md, no LEDGER.md",
          (len(h.reader()._parse_ledger(h.mem)[1]), os.path.exists(h.ledger)), (4, False))
    h.done()

    print("ALL PASS" if ok else "FAILURES")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
