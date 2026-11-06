#!/usr/bin/env python3
"""B-LANGSTON-TWO-WORKERS (#1248) P4: two reviews saving Langston's memory at once.
  - a whole-part write that loses the race is REFUSED and SHOWN what landed; with --retry-part it keeps both changes
    when they touch different lines, and refuses (writing nothing) when they touch the same lines;
  - a ledger append that loses the race ABSORBS the earlier append in one re-read and SAYS so (AM-2), but only when
    nothing but appends landed.
Driven through the REAL writer as a subprocess against a throwaway home, reusing test_ledger_split.py's Home.
Run as ROOT on the agent box from a root-owned directory holding langston-memory-write, langston_memory.py,
langston_memory_allowlist.py, test_ledger_split.py and this file:  python3 test_memory_retry.py   (exit 0 = all pass)
Expected counts are hand-written, not computed by the code under test."""
import importlib.util
import os
import sys

sys.dont_write_bytecode = True
HERE = os.path.dirname(os.path.abspath(__file__))
sys.path.insert(0, HERE)
import test_ledger_split as T  # noqa: E402

NL = T.NL
check, sha, rd = T.check, T.sha, T.rd


def writer_module():
    import importlib.machinery
    path = os.path.join(HERE, "langston-memory-write")   # no .py suffix, so name the loader explicitly
    spec = importlib.util.spec_from_file_location("lmw", path, loader=importlib.machinery.SourceFileLoader("lmw", path))
    m = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(m)
    return m


def whole(h, expect, body, retry=False):
    args = ["--expect-sha", expect, "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t", "--reason", "t"]
    return h.call(args + (["--retry-part"] if retry else []), body)


def main():
    if os.geteuid() != 0:
        print("run as root (see the docstring)")
        sys.exit(2)
    W = writer_module()

    print("1. merge3, the pure three-way merge")
    base = "a\nb\nc\nd\ne\n"
    m, c = W.merge3(base, "A\nb\nc\nd\ne\n", "a\nb\nc\nd\nE\n")
    check("different lines: both changes kept", (m, c), ("A\nb\nc\nd\nE\n", None))
    m, c = W.merge3(base, "a\nB\nc\nd\ne\n", "a\nX\nc\nd\ne\n")
    check("same line changed both ways: conflict, no text", (m, c is not None), (None, True))
    m, c = W.merge3(base, "a\nb\nc\nd\ne\nyours\n", "a\nb\nc\nd\ne\ntheirs\n")
    check("both append at the same point: conflict (order would be a guess)", (m, c is not None), (None, True))
    m, c = W.merge3(base, "a\nb\nc\nd\ne\nyours\n", "theirs\na\nb\nc\nd\ne\n")
    check("one appends, one prepends: both kept", (m, c), ("theirs\na\nb\nc\nd\ne\nyours\n", None))
    m, c = W.merge3(base, base, "a\nb\nc\nd\ne\nt\n")
    check("no change of yours: theirs is the result", (m, c), ("a\nb\nc\nd\ne\nt\n", None))
    check("archived_version refuses a non-sha name", W.archived_version("../etc/passwd"), None)

    print("2. --retry-part through the service's allowlist and the writer's own argument check")
    import langston_memory_allowlist as al
    shape, argv = al.validate(["--expect-sha", "a" * 64, "--ledger-delta", "0", "--retractions-delta", "0",
                               "--reason", "r", "--retry-part"], b"x", os.path.join(HERE, "nowhere"))
    check("the allowlist admits --retry-part on a whole-part write", (shape, "--retry-part" in argv), ("whole", True))
    try:
        al.validate(["--expect-sha", "a" * 64, "--ledger-append", "--entries", "1", "--reason", "r", "--retry-part"],
                    b"x", os.path.join(HERE, "nowhere"))
        check("the allowlist refuses --retry-part on an append", "admitted", "Refusal")
    except al.Refusal:
        check("the allowlist refuses --retry-part on an append", "Refusal", "Refusal")
    try:
        W.parse_args(["--expect-sha", "new", "--ledger-delta", "0", "--retractions-delta", "0", "--by", "t",
                      "--reason", "t", "--part", "x.md", "--retry-part"])
        check("the writer refuses --retry-part on a create", "parsed", "Refused 2")
    except W.Refused as e:
        check("the writer refuses --retry-part on a create", "Refused %d" % e.code, "Refused 2")

    print("3. a whole-part write that loses the race")
    h = T.Home()
    s0 = sha(rd(h.part))
    part0 = rd(h.part).decode("utf-8")
    a_body = part0.replace("- a header note", "- a header note, edited by writer A")
    rc, out = whole(h, s0, a_body)
    check("writer A, reading the current part, writes (exit 0)", rc, 0)
    b_body = part0.replace("- a note outside the ledger", "- a note outside the ledger, edited by writer B")
    snap = h.snap()
    rc, out = whole(h, s0, b_body)
    check("writer B with the STALE sha is refused (exit 4)", rc, 4)
    check("  ...the refusal shows what landed (writer A's line)", "edited by writer A" in out, True)
    check("  ...and names --retry-part", "--retry-part" in out, True)
    check("  ...and changed nothing", h.snap() == snap, True)
    rc, out = whole(h, s0, b_body, retry=True)
    check("writer B with --retry-part writes (exit 0)", rc, 0)
    now = rd(h.part).decode("utf-8")
    check("  ...the part holds BOTH changes", ("edited by writer A" in now, "edited by writer B" in now), (True, True))
    check("  ...and says it absorbed a write", "absorbed an intervening write" in out, True)
    s2 = sha(rd(h.part))
    c_body = now.replace("- a header note, edited by writer A", "- a header note, edited by writer C")
    rc, out = whole(h, s2, c_body)
    check("control: writer C on the current part writes (exit 0)", rc, 0)
    d_body = now.replace("- a header note, edited by writer A", "- a header note, edited by writer D")
    snap = h.snap()
    rc, out = whole(h, s2, d_body, retry=True)
    check("writer D changes the SAME line, stale: refused even with --retry-part (exit 4)", rc, 4)
    check("  ...naming the overlap", "touch the same lines" in out, True)
    check("  ...and changed nothing", h.snap() == snap, True)
    h.done()

    print("4. a ledger append that loses the race (AM-2)")
    h = T.Home()
    rc, _ = h.split()
    check("fixture: the split (exit 0)", rc, 0)
    rc, _ = h.call(["--compose", "--by", "t", "--reason", "t"])
    l0 = sha(rd(h.ledger))
    e1 = "- **fourth retraction** from writer A, long enough to be one entry of the ledger." + NL
    e2 = "- **fifth retraction** from writer B, long enough to be one entry of the ledger." + NL
    rc, out = h.call(["--expect-sha", l0, "--ledger-append", "--entries", "1", "--by", "t", "--reason", "t"], e1)
    check("writer A appends on the current sha (exit 0)", rc, 0)
    rc, out = h.call(["--expect-sha", l0, "--ledger-append", "--entries", "1", "--by", "t", "--reason", "t"], e2)
    check("writer B appends on the STALE sha: absorbed (exit 0)", rc, 0)
    led = rd(h.ledger).decode("utf-8")
    check("  ...both entries are in LEDGER.md, A before B",
          (led.find("fourth retraction") >= 0, led.find("fourth retraction") < led.find("fifth retraction")), (True, True))
    check("  ...and it SAID what it absorbed, naming writer A's entry",
          ("absorbed" in out, "fourth retraction" in out), (True, True))
    r = h.reader()
    check("  ...the reader counts 5 retractions", len(r._parse_ledger(h.ledger)[1]), 5)
    l2 = sha(rd(h.ledger))
    # a NON-append change since the read: an existing entry edited in place (as root, outside the tool, deliberately)
    edited = rd(h.ledger).replace(b"first retraction", b"first retraction (edited)")
    import subprocess
    subprocess.run(["chattr", "-i", h.ledger], capture_output=True)
    with open(h.ledger, "wb") as fh:
        fh.write(edited)
    snap = h.snap()
    e3 = "- **sixth retraction** from writer C, long enough to be one entry of the ledger." + NL
    rc, out = h.call(["--expect-sha", l2, "--ledger-append", "--entries", "1", "--by", "t", "--reason", "t"], e3)
    check("a stale append after an IN-PLACE edit is refused (exit 4)", rc, 4)
    check("  ...saying it changed other than by an append", "other than by an append" in out, True)
    check("  ...and changed nothing", h.snap() == snap, True)
    h.done()

    print("\n%s" % ("ALL PASS" if T.ok else "FAILURES ABOVE"))
    sys.exit(0 if T.ok else 1)


if __name__ == "__main__":
    main()
