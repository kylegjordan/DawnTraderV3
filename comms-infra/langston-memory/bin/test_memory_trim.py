#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 Q3: the trim (`langston-memory-write --trim`) and its recall shard, driven through the REAL
writer as a subprocess against a throwaway home. Run as ROOT beside the writer and reader (see test_ledger_split.py)."""
import hashlib, importlib.util, json, os, shutil, subprocess, sys, tempfile

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
WRITER = os.path.join(HERE, "langston-memory-write")
READER = os.path.join(HERE, "langston_memory.py")
NL = chr(10)
ANCHOR = "### Rulings of mine that GENERALISE"

BASE = NL.join([
    "# Langston MEMORY — fixture", "",
    "## ★ HEADER NOTES", "- a protected note", "",
    "## ★★ REVIEWER LEDGER — MY OWN RETRACTIONS, RULINGS AND ERRORS", "",
    "### Retractions (things I asserted and then withdrew — do NOT re-assert)",
    "- **a retraction**, long enough to look like one in the fixture.",
    "", ANCHOR + " (reusable)", "- a ruling", "",
    "### CC-A errors I logged", "- an error note", "",
    "## B-CLOSED-ONE — a closed batch", "", "**B-CLOSED-ONE body** with detail.",
    "keep: a pointer line that must survive in the index", "",
    "STATE: closed · batch: B-CLOSED-ONE · superseded-by: Batch Completion/B_CLOSED_ONE_COMPLETION_REPORT.md", "",
    "## B-OPEN-ONE — still open", "", "- open work", "", "STATE: open · batch: B-OPEN-ONE", "",
    "## B-CLOSED-TWO — another closed batch", "", "- its record, unique text zebra-42", "",
    "STATE: closed · batch: B-CLOSED-TWO · superseded-by: Batch Completion/B_CLOSED_TWO_COMPLETION_REPORT.md", "",
    "## RULINGS OF YOURS EXECUTED 2026-09-02", "- a protected ruling", ""])

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
    def __init__(self, text=BASE):
        self.top = tempfile.mkdtemp(prefix="lmw-trim-", dir=HERE)
        self.mem = os.path.join(self.top, "MEMORY.md")
        self.arch = os.path.join(self.top, "MEMORY-ARCHIVE.md")
        self.part = os.path.join(self.top, "memory-parts", "00-legacy.md")
        self.state = os.path.join(self.top, ".memory-archive", "compose-state.json")
        self.env = dict(os.environ, LANGSTON_HOME=self.top, LANGSTON_MEMORY_READER=READER)
        with open(self.mem, "w", encoding="utf-8", newline="") as fh:
            fh.write(text)
        os.makedirs(os.path.dirname(self.part))
        shutil.copyfile(self.mem, self.part)
        rc, out = self.call(["--compose", "--by", "t", "--reason", "fixture"])
        assert rc == 0, out

    def call(self, args, stdin="", extra=None):
        e = dict(self.env, **(extra or {}))
        p = subprocess.run([sys.executable, WRITER] + args, input=stdin.encode("utf-8"), capture_output=True, env=e,
                           timeout=120)
        return p.returncode, (p.stdout + p.stderr).decode("utf-8", "replace")

    def trim(self, *extra_args):
        return self.call(["--trim"] + list(extra_args) + ["--by", "t", "--reason", "test"])

    def snap(self):
        return {p: (rd(p) if os.path.exists(p) else None) for p in (self.mem, self.part, self.state, self.arch)}

    def reader(self):
        os.environ["LANGSTON_HOME"] = self.top
        spec = importlib.util.spec_from_file_location("lm_%d" % id(self), READER)
        m = importlib.util.module_from_spec(spec)
        spec.loader.exec_module(m)
        return m

    def done(self):
        shutil.rmtree(self.top)


def main():
    if os.geteuid() != 0:
        print("run as root")
        sys.exit(2)
    print("1. a trim evicts exactly the closed sections")
    h = Home()
    before = rd(h.part).decode("utf-8")
    snap = h.snap()
    # the timer and an ssh hand-run give NO stdin EOF; a trim that reads stdin hangs (found live). Drive it with an
    # open, never-written stdin and a timeout: a hang is a FAIL, not a stuck suite.
    p = subprocess.Popen([sys.executable, WRITER, "--trim", "--dry-run", "--by", "t", "--reason", "t"], env=h.env,
                         stdin=subprocess.PIPE, stdout=subprocess.PIPE, stderr=subprocess.STDOUT)
    try:
        p.wait(timeout=30)
        hung = False
    except subprocess.TimeoutExpired:
        p.kill()
        hung = True
    p.stdin.close()
    check("--trim does not read stdin (no hang with an open, silent stdin)", hung, False)
    rc, out = h.trim("--dry-run")
    check("--dry-run exits 0 and names both closed ids", (rc, "B-CLOSED-ONE" in out and "B-CLOSED-TWO" in out), (0, True))
    check("  ...and writes nothing", h.snap() == snap, True)
    rc, out = h.trim()
    check("trim exits 0", rc, 0)
    mem = rd(h.mem).decode("utf-8")
    arch = rd(h.arch).decode("utf-8")
    check("no STATE: closed left in MEMORY.md", "STATE: closed" in mem, False)
    check("the open section stays", "## B-OPEN-ONE" in mem and "STATE: open · batch: B-OPEN-ONE" in mem, True)
    check("protected sections stay", "## ★ HEADER NOTES" in mem and "## RULINGS OF YOURS EXECUTED" in mem, True)
    check("the ledger stays (retraction still in MEMORY.md)", "- **a retraction**" in mem, True)
    check("both closed sections are in MEMORY-ARCHIVE.md verbatim", all(
        l in arch for l in ("## B-CLOSED-ONE — a closed batch", "**B-CLOSED-ONE body** with detail.",
                            "- its record, unique text zebra-42")), True)
    check("their bodies left MEMORY.md", ("**B-CLOSED-ONE body**" in mem, "zebra-42" in mem), (False, False))
    check("one index line per evicted section, worded evicted", sum(1 for l in mem.split(NL) if l.startswith("- `B-CLOSED-") and " — evicted " in l), 2)
    check("the keep: line survives in the index", "keep: a pointer line that must survive in the index" in mem, True)
    check("each archived section carries an eviction stamp", arch.count("<!-- evicted "), 2)
    # line conservation, recomputed here (not trusting the tool's own check)
    from collections import Counter
    nb = lambda t: Counter(l for l in t.split(NL) if l.strip())
    added = Counter(l for l in mem.split(NL) if l.startswith("## Archived batch sections") or l.startswith("- `B-CLOSED-"))
    added["keep: a pointer line that must survive in the index"] += 1
    arch_lines = Counter(l for l in arch.split(NL) if l.strip() and not l.startswith("<!-- evicted ")
                         and not l.startswith("# Langston") and not l.startswith("Not auto-loaded"))
    check("line conservation: old part == new part - index lines + archived lines",
          nb(before) == (nb(rd(h.part).decode("utf-8")) - added) + arch_lines, True)
    state = json.loads(rd(h.state))
    check("compose-state matches MEMORY.md", state["last_written_sha"], sha(rd(h.mem)))
    snap = h.snap()
    rc, out = h.trim()
    check("a second trim finds nothing to evict (exit 0) and writes nothing", (rc, "nothing to evict" in out, h.snap() == snap),
          (0, True, True))
    print("2. the archive is searchable by recall")
    r = h.reader()
    recs = []
    r.parse_memory_archive(h.arch, recs)
    check("the reader indexes one record per archived section", len(recs), 2)
    check("  ...dated by the eviction stamp and carrying the batch id",
          (all(x["ts"].startswith("20") for x in recs), any("B-CLOSED-TWO" in x["ref"] for x in recs)), (True, True))
    check("  ...and the section text is searchable", any("zebra-42" in x["text"] for x in recs), True)
    check("  ...labelled as an EVICTION time, not a per-record timestamp", all(x["tq"] == "eviction-time(trim)" for x in recs), True)
    print("3. a new closed section on a later run appends to the archive and the index")
    part = rd(h.part).decode("utf-8").replace("STATE: open · batch: B-OPEN-ONE",
                                               "STATE: closed · batch: B-OPEN-ONE · superseded-by: Batch Completion/X.md")
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "close it"], part)
    check("marking the open section closed through the writer exits 0", rc, 0)
    arch_before = rd(h.arch)
    rc, out = h.trim()
    check("the next trim evicts it (exit 0)", (rc, "B-OPEN-ONE" in out), (0, True))
    check("  ...the old archive is a byte PREFIX of the new one (append-only)", rd(h.arch).startswith(arch_before), True)
    mem = rd(h.mem).decode("utf-8")
    check("  ...ONE index heading, three index lines", (mem.count("## Archived batch sections"),
          sum(1 for l in mem.split(NL) if l.startswith("- `B-"))), (1, 3))
    h.done()
    print("4. refusals write nothing")
    h = Home(BASE.replace("STATE: open · batch: B-OPEN-ONE", "- (no state line)"))
    snap = h.snap()
    rc, out = h.trim()
    check("a section with no STATE line refuses the WHOLE trim (exit 2)", (rc, "1 batch section(s) carry no STATE" in out),
          (2, True))
    check("  ...and nothing was written, the closed ones included", h.snap() == snap, True)
    h.done()
    h = Home(BASE.replace("- a protected note", "- a protected note" + NL + "STATE: open · batch: X"))
    snap = h.snap()
    rc, out = h.trim()
    check("a STATE line inside a protected section refuses (exit 2)", rc, 2)
    check("  ...nothing written", h.snap() == snap, True)
    h.done()
    h = Home(BASE.replace("STATE: closed · batch: B-CLOSED-TWO · superseded-by: Batch Completion/B_CLOSED_TWO_COMPLETION_REPORT.md",
                          "STATE: closed · batch: B-CLOSED-TWO"))
    rc, out = h.trim()
    check("a closed section without superseded-by refuses (exit 2)", rc, 2)
    h.done()
    h = Home(BASE.replace("STATE: open · batch: B-OPEN-ONE", "STATE: open · batch: B-OPEN-ONE" + NL + "- a line after it"))
    rc, out = h.trim()
    check("a STATE line that is not the section's LAST line counts as unmarked (exit 2)", rc, 2)
    h.done()
    h = Home()
    rc, out = h.call(["--trim", "--expect-sha", "a" * 64, "--by", "t", "--reason", "t"])
    check("--trim with --expect-sha refuses (exit 2)", rc, 2)
    rc, out = h.call(["--dry-run", "--by", "t", "--reason", "t"])
    check("--dry-run without --trim refuses (exit 2)", rc, 2)
    h.done()
    print("ALL PASS" if ok else "FAILURES")
    sys.exit(0 if ok else 1)


if __name__ == "__main__":
    main()
