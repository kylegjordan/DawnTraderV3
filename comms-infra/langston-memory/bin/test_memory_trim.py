#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 Q3: the trim (`langston-memory-write --trim`) and its recall shard, driven through the REAL
writer as a subprocess against a throwaway home. Run as ROOT beside the writer and reader (see test_ledger_split.py)."""
import hashlib, importlib.machinery, importlib.util, json, os, shutil, subprocess, sys, tempfile

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
    check("NO index line is added for an evicted section (Langston 2026-10-17: the STATE line in the archive is the record)",
          sum(1 for l in mem.split(NL) if l.startswith("- `B-CLOSED-")), 0)
    ks = mem.split(NL)
    kh = next((i for i, l in enumerate(ks) if l.startswith("## ★ Kept lines from closed batches")), None)
    check("the keep: line survives, hoisted into the protected kept-lines section",
          (kh is not None, kh is not None and "keep: a pointer line that must survive in the index" in ks[kh:]), (True, True))
    check("each archived section carries an eviction stamp", arch.count("<!-- evicted "), 2)
    # line conservation, recomputed here (not trusting the tool's own check)
    from collections import Counter
    nb = lambda t: Counter(l for l in t.split(NL) if l.strip())
    added = Counter(l for l in mem.split(NL) if l.startswith("## ★ Kept lines from closed batches"))
    added["keep: a pointer line that must survive in the index"] += 1
    arch_lines = Counter(l for l in arch.split(NL) if l.strip() and not l.startswith("<!-- evicted ")
                         and not l.startswith("# Langston") and not l.startswith("Not auto-loaded"))
    check("line conservation: old part == new part - hoisted lines + archived lines",
          nb(before) == (nb(rd(h.part).decode("utf-8")) - added) + arch_lines, True)
    state = json.loads(rd(h.state))
    check("compose-state matches MEMORY.md", state["last_written_sha"], sha(rd(h.mem)))
    snap = h.snap()
    rc, out = h.trim()
    check("a second trim finds nothing to evict (exit 0) and writes nothing", (rc, "nothing to evict" in out, h.snap() == snap),
          (0, True, True))
    idx = os.path.join(h.top, ".memory-archive", "index.jsonl")
    rows = [json.loads(l) for l in open(idx, encoding="utf-8") if l.strip()]
    noop = [r for r in rows if r.get("mode") == "trim-noop"]
    last_noop = noop[-1] if noop else {}       # an absent row must report FAIL, not abort the suite (Langston r1 C-3)
    check("  ...but records ONE trim-noop row, with the census and no sha-chain fields (Langston gate A)",
          (len(noop), last_noop.get("outcome"), last_noop.get("sections_open"), "old_sha" in last_noop,
           "part_old_sha" in last_noop, "mem_archived" in last_noop), (1, "noop", 1, False, False, False))
    check("  ...the first such row says earlier nights have no row by design", "BY DESIGN" in last_noop.get("note", ""), True)
    rc, out = h.trim("--dry-run")
    check("  ...a no-op DRY RUN writes no row", len([l for l in open(idx, encoding="utf-8") if l.strip()]), len(rows))
    rc, out = h.trim()
    rows2 = [json.loads(l) for l in open(idx, encoding="utf-8") if l.strip()]
    noop2 = [r for r in rows2 if r.get("mode") == "trim-noop"]
    check("  ...a second no-op night adds a second row, without the first-row note",
          (len(noop2), "note" in (noop2[-1] if noop2 else {"note": "absent row"})), (2, False))
    w = importlib.util.spec_from_loader("lmw_t", importlib.machinery.SourceFileLoader("lmw_t", WRITER))
    wm = importlib.util.module_from_spec(w)
    w.loader.exec_module(wm)
    wm.ARCHIVE_INDEX = idx
    writes2 = [r for r in rows2 if r.get("mode") != "trim-noop"]
    assert writes2, "precondition: the fixture's compose writes an index row"       # Langston r2: stated, not patched
    last_write = writes2[-1]
    check("  ...the CAS reader's last row SKIPS trim-noop rows (never a link in the sha chain)",
          wm.last_index_row(), last_write)
    print("1b. C-1: one unparseable line does not hide the rest; an index of ONLY bad lines is UNKNOWN")
    with open(idx, encoding="utf-8") as fh:
        good = fh.read()
    msg_good = wm.cas_mismatch_message("0" * 64)
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write("{not json" + NL + good)
    check("  a broken line prepended: the last write is still found", wm.last_index_row(), last_write)
    msg = wm.cas_mismatch_message("0" * 64)
    check("  ...the verdict is UNCHANGED by it and HEDGED (C-7): same text, plus the unreadable count",
          (msg.startswith(msg_good), "1 line(s) of this tool's archive index could not be read" in msg,
           "no recorded write" in msg), (True, True, False))
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write("{not json" + NL + "[1, 2]" + NL)
    msg = wm.cas_mismatch_message("0" * 64)
    check("  an index with NO readable line -> cause UNKNOWN, never 'no recorded write'",
          ("UNKNOWN" in msg, "no recorded write" in msg), (True, False))
    check("  ...C-6: the message says what was measured (2 unreadable), not that NO line can be read",
          ("2 line(s)" in msg, "NO line of it" in msg), (True, False))
    noop_lines = NL.join(json.dumps(r) for r in rows2 if r.get("mode") == "trim-noop") + NL
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write("{cut mid-line" + NL + noop_lines)
    msg = wm.cas_mismatch_message("0" * 64)
    check("  C-4: noop rows beside a cut line (no write row parsed) -> UNKNOWN, never 'no recorded write'",
          ("UNKNOWN" in msg, "no recorded write" in msg), (True, False))
    check("  ...C-6: and it does not claim NO line can be read (the noop rows did parse)",
          ("No line recording a write" in msg, "NO line of it" in msg), (True, False))
    hand = {"ts": "2026-10-17T00:00:00Z", "mode": "whole-file", "outcome": "written", "new_sha": "a" * 64}
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(hand) + NL)
    msg_clean = wm.cas_mismatch_message("b" * 64)
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write(json.dumps(hand) + NL + '{"ts": "2026-10-17T01:00:00Z", "mode": "whole-fi' + NL)
    msg_torn = wm.cas_mismatch_message("b" * 64)
    check("  C-7 control: a readable write and no bad line -> 'Someone edited it by hand'",
          "Someone edited it by hand" in msg_clean, True)
    check("  C-7: the same write + a TORN LAST line -> NOT asserted as a hand edit, the later write named as possible",
          ("Someone edited it by hand" in msg_torn, "NOT proof of a hand edit" in msg_torn), (False, True))
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write(noop_lines)
    msg = wm.cas_mismatch_message("0" * 64)
    check("  ...control: noop rows only, every line parsed -> 'no recorded write' (true there)",
          "no recorded write" in msg, True)
    with open(idx, "w", encoding="utf-8") as fh:
        fh.write(good)
    print("1d. THE RATCHET AT WRITE TIME: while the loaded set is in BREACH, a growing write is refused (Langston 2026-10-17)")
    rs = os.path.join(h.top, ".ratchet-state.json")
    with open(rs, "w", encoding="utf-8") as fh:
        json.dump({"ceiling_bytes": 100, "last_total_bytes": 999, "last_status": "BREACH", "last_run_ts": "t"}, fh)
    part0 = rd(h.part).decode("utf-8")
    snap0 = h.snap()
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "grow"], part0 + "- one more line" + NL)
    check("  a growing write in BREACH refuses (exit 7) and writes nothing", (rc, "in breach" in out, h.snap() == snap0),
          (7, True, True))
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "grow", "--allow-growth", "a test override"], part0 + "- one more line" + NL)
    rows_g = [json.loads(l) for l in open(os.path.join(h.top, ".memory-archive", "index.jsonl"), encoding="utf-8") if l.strip()]
    ov = rows_g[-1].get("growth_override") or {}
    check("  ...with --allow-growth it proceeds and the index row records who, how many bytes, and why",
          (rc, ov.get("by"), ov.get("delta_bytes", 0) > 0, ov.get("reason"), ov.get("ratchet_status")),
          (0, "t", True, "a test override", "BREACH"))
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "shrink"], part0)
    rows_g = [json.loads(l) for l in open(os.path.join(h.top, ".memory-archive", "index.jsonl"), encoding="utf-8") if l.strip()]
    check("  ...a SHRINKING write in BREACH proceeds with no override (non-increase gate, not a ceiling lockout)",
          (rc, rows_g[-1].get("growth_override")), (0, None))
    with open(rs, "w", encoding="utf-8") as fh:
        json.dump({"ceiling_bytes": 10 ** 9, "last_total_bytes": 1, "last_status": "OK", "last_run_ts": "t"}, fh)
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "grow ok"], part0 + "- one more line" + NL)
    check("  ...not in breach, growth proceeds with no override", rc, 0)
    rc, out = h.call(["--expect-sha", sha(rd(h.part)), "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "restore"], part0)
    os.remove(rs)
    wm.LANGSTON_HOME = wm.LIVE_HOME = h.top
    wm.RATCHET_STATE = os.path.join(h.top, "no-such-state.json")
    try:
        wm.growth_gate(b"a", b"ab", {"--by": "t"})
        got = "passed"
    except wm.Refused as e:
        got = (e.args[0] if e.args else None, "UNREADABLE" in str(e))
    check("  ...on the LIVE home an unreadable ratchet state refuses growth (never a silent pass)", got[1] if isinstance(got, tuple) else got, True)
    check("  ...and a shrink still passes there", wm.growth_gate(b"ab", b"a", {"--by": "t"}), None)
    print("1c. C-2: a prior write whose REASON is 'trim-noop' does not suppress the first row's note")
    h2 = Home()
    rc, out = h2.call(["--compose", "--by", "t", "--reason", "trim-noop"])
    idx2 = os.path.join(h2.top, ".memory-archive", "index.jsonl")
    check("  precondition: a written row carries the string trim-noop in its reason (else this proves nothing)",
          any('"trim-noop"' in l and '"mode": "trim-noop"' not in l for l in open(idx2, encoding="utf-8")), True)
    rc, out = h2.trim()           # evicts the closed sections
    rc, out = h2.trim()           # the first genuine no-op night
    idx2 = os.path.join(h2.top, ".memory-archive", "index.jsonl")
    n2 = [json.loads(l) for l in open(idx2, encoding="utf-8") if l.strip()]
    n2 = [r for r in n2 if r.get("mode") == "trim-noop"]
    check("  ...the first genuine trim-noop row still carries its note", (len(n2), "BY DESIGN" in (n2[-1] if n2 else {}).get("note", "")),
          (1, True))
    h2.done()
    print("2. the archive is searchable by recall")
    r = h.reader()
    recs = []
    r.parse_memory_archive(h.arch, recs)
    check("the reader indexes one record per archived section", len(recs), 2)
    check("  ...dated by the eviction stamp and carrying the batch id",
          (all(x["ts"].startswith("20") for x in recs), any("B-CLOSED-TWO" in x["ref"] for x in recs)), (True, True))
    check("  ...and the section text is searchable", any("zebra-42" in x["text"] for x in recs), True)
    check("  ...labelled as an EVICTION time, not a per-record timestamp", all(x["tq"] == "eviction-time(trim)" for x in recs), True)
    print("3. a new closed section on a later run appends to the archive, and still adds no index line")
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
    check("  ...no index lines at all, ONE kept-lines heading", (sum(1 for l in mem.split(NL) if l.startswith("- `B-")),
          mem.count("## ★ Kept lines from closed batches")), (0, 1))
    h.done()
    print("3b. a pre-cutover section is named when evicted (recall cannot date it)")
    h = Home(BASE.replace("## B-CLOSED-ONE — a closed batch", "## B-CLOSED-ONE — a closed batch from 2026-05-01"))
    rc, out = h.trim()
    rows = [json.loads(l) for l in open(os.path.join(h.top, ".memory-archive", "index.jsonl"), encoding="utf-8")
            if l.strip()]
    trim_rows = [r for r in rows if r.get("mode") == "trim" and r.get("outcome") == "written"]
    assert trim_rows, "precondition: the pre-cutover trim writes a trim row"
    check("the trim names the pre-cutover section, and only it", (rc, "PRE-CUTOVER ERA in the heading of B-CLOSED-ONE"
          in out, "B-CLOSED-TWO -" in out.split("PRE-CUTOVER")[-1]), (0, True, False))
    check("  ...and records it on the index row", trim_rows[-1].get("pre_cutover_heading"), ["B-CLOSED-ONE"])
    h.done()
    h = Home()
    rc, out = h.trim()
    check("no pre-cutover heading -> no warning (negative control)", (rc, "PRE-CUTOVER" in out), (0, False))
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
