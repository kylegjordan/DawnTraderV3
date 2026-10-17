#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3, one-time (Langston's ruling 2026-10-17 on the 79 KB MEMORY.md). Root, on Helsinki.

    python3 obj3_index_retire.py            # DRY RUN: writes the proposed part + a unified diff to a root-only dir
    python3 obj3_index_retire.py --apply    # writes it through langston-memory-write (as langston), nothing else

What it does to /home/langston/memory-parts/00-legacy.md, and nothing more:
  1. the "## Archived batch sections" section: its "- `<id>` ..." index lines are DELETED (not moved). Each one's
     batch must be present in MEMORY-ARCHIVE.md as a `STATE: closed · batch: <id>` line - the region recall indexes -
     or nothing is written. The heading stays, with ONE pointer line under it.
  2. its `keep:` lines (deliberately retained standing content) move, verbatim and in order, into a new protected
     section `## ★ Kept lines from closed batches ...` placed directly after it - the same heading the trim now
     hoists into.
  3. the header's "Hard cap ~24KB" phrase is replaced by a pointer to the binding rule: the loaded-set SUM
     (PHASE_19_PLAN row 2.8b), read live from `langston-size-watch --status`.
  4. the preamble's own statement of the trim rule ("... and leaves one index line.") is corrected to what the trim now
     does - the other copy of the same rule (Langston, approving the diff: fix both copies in one write).
⛔ ORDER: install the writer whose trim adds no index line BEFORE --apply, and before the next 03:50Z trim - an older
   trim re-mints index lines under the pointer and splices hoisted keep: lines above the kept-lines heading.
It refuses if the index section holds anything but its heading, index lines, keep: lines and blanks; and it checks
that every other line of the part is untouched (multiset of lines, before vs after, minus exactly the changes above).
"""
import difflib, hashlib, os, re, subprocess, sys, tempfile
from collections import Counter

PART = "/home/langston/memory-parts/00-legacy.md"
ARCHIVE = "/home/langston/MEMORY-ARCHIVE.md"
WRITER = "/usr/local/bin/langston-memory-write"
NL = chr(10)
INDEX_PREFIX = "## Archived batch sections"
KEEP_HEADING = "## ★ Kept lines from closed batches (each `keep:` line was hoisted by the trim when its batch closed)"
POINTER = ("Closed batch sections are archived verbatim in `/home/langston/MEMORY-ARCHIVE.md`; `langston-recall "
           "<batch-id>` retrieves one. BATCH_CATALOG and the completion reports are the census - no index is kept here "
           "(Langston, 2026-10-17: a third copy is the #641 two-sources failure; the trim adds no index line).")
OLD_CAP = "**Hard cap ~24KB — BYTES-FIRST, NO LINE TARGET (Langston-approved 2026-07-28).**"
NEW_CAP = ("**Size: the binding limit is the loaded-set SUM, which may only go down (`PHASE_19_PLAN` row 2.8b) - read the "
           "live ceiling and total from `langston-size-watch --status`; there is NO per-file cap (the ~24KB one was "
           "struck 2026-10-17, Langston).**")
OLD_RULE = "and leaves one index line."
NEW_RULE = ("hoists its `keep: ` lines into `## ★ Kept lines from closed batches` and leaves NO index line (Langston, "
            "2026-10-17).")
ID_RE = re.compile(r"^- `([^`]+)`")


def die(msg):
    print("REFUSED: " + msg)
    sys.exit(2)


def plan(old_text, archive_text):
    lines = old_text.split(NL)
    if lines[-1] == "":
        lines = lines[:-1]
    heads = [i for i, l in enumerate(lines) if l.startswith("## ")]
    at = [i for i in heads if lines[i].startswith(INDEX_PREFIX)]
    if len(at) != 1:
        die("expected exactly one column-0 %r heading, found %d" % (INDEX_PREFIX, len(at)))
    if any(lines[i].startswith(KEEP_HEADING[:40]) for i in heads):
        die("a kept-lines section already exists - nothing to migrate")
    h = at[0]
    end = next((i for i in heads if i > h), len(lines))
    body = lines[h + 1:end]
    index_lines = [l for l in body if ID_RE.match(l)]
    keep_lines = [l for l in body if l.startswith("keep: ")]
    other = [l for l in body if l.strip() and not ID_RE.match(l) and not l.startswith("keep: ")]
    if other:
        die("the index section holds %d unexpected line(s), first: %r" % (len(other), other[0][:100]))
    closed = set(re.findall(r"(?m)^STATE: closed · batch: (.+?)(?: · superseded-by: .+)?$", archive_text))
    missing = [ID_RE.match(l).group(1) for l in index_lines if ID_RE.match(l).group(1) not in closed]
    if missing:
        die("%d index line(s) name a batch with no `STATE: closed` line in the archive, first: %r" % (len(missing), missing[0]))
    cap_hits = [i for i, l in enumerate(lines) if OLD_CAP in l]
    if len(cap_hits) != 1 or cap_hits[0] >= heads[0]:
        die("expected the header cap phrase exactly once, in the preamble; found at %r" % cap_hits)
    rule_hits = [i for i, l in enumerate(lines) if OLD_RULE in l]
    if len(rule_hits) != 1 or rule_hits[0] >= heads[0] or rule_hits[0] == cap_hits[0]:
        die("expected the trim-rule phrase exactly once, in the preamble, on its own line; found at %r" % rule_hits)
    new = list(lines)
    new[cap_hits[0]] = new[cap_hits[0]].replace(OLD_CAP, NEW_CAP)
    new[rule_hits[0]] = new[rule_hits[0]].replace(OLD_RULE, NEW_RULE)
    new_section = [lines[h], "", POINTER, ""] + [KEEP_HEADING, ""] + keep_lines + [""]
    new = new[:h] + new_section + new[end:]
    while new and new[-1] == "":
        new.pop()
    new_text = NL.join(new) + NL
    # every other line untouched: old - (index lines, old cap line) == new - (pointer, keep heading, new cap line)
    nb = lambda ls: Counter(l for l in ls if l.strip())
    lhs = nb(lines) - nb(index_lines) - Counter([lines[cap_hits[0]], lines[rule_hits[0]]])
    rhs = nb(new) - Counter([POINTER, KEEP_HEADING, new[cap_hits[0]], new[rule_hits[0]]])
    if lhs != rhs:
        die("line conservation does not close: %d lost, %d extra" % (sum((lhs - rhs).values()), sum((rhs - lhs).values())))
    return new_text, index_lines, keep_lines


def main():
    if os.geteuid() != 0:
        die("run as root")
    old_b = open(PART, "rb").read()
    old_text = old_b.decode("utf-8")
    new_text, idx, keeps = plan(old_text, open(ARCHIVE, encoding="utf-8").read())
    new_b = new_text.encode("utf-8")
    print("part %s: %d B -> %d B (%+d); %d index lines deleted (all %d batches confirmed STATE: closed in the "
          "archive), %d keep: lines moved, header cap phrase and trim-rule phrase replaced"
          % (PART, len(old_b), len(new_b), len(new_b) - len(old_b), len(idx), len(idx), len(keeps)))
    d = tempfile.mkdtemp(prefix="obj3-index-retire-", dir="/root")
    open(os.path.join(d, "00-legacy.proposed.md"), "wb").write(new_b)
    diff = "".join(difflib.unified_diff(old_text.splitlines(True), new_text.splitlines(True),
                                        "00-legacy.md (live)", "00-legacy.md (proposed)"))
    open(os.path.join(d, "00-legacy.diff"), "w", encoding="utf-8").write(diff)
    print("proposed part and diff: %s (root-only)" % d)
    print("part sha256 now: %s" % hashlib.sha256(old_b).hexdigest())
    if "--apply" not in sys.argv:
        print("DRY RUN - nothing written")
        return 0
    r = subprocess.run(["sudo", "-u", "langston", "env", "HOME=/home/langston", WRITER,
                        "--expect-sha", hashlib.sha256(old_b).hexdigest(), "--ledger-delta", "0",
                        "--retractions-delta", "0", "--by", "cc-infra",
                        "--reason", "B-LANGSTON-RELIEF OBJ-3: retire the archived-section index lines, hoist keep: lines, "
                                    "strike the per-file cap (Langston ruling 2026-10-17)"],
                       input=new_b, capture_output=True, cwd="/home/langston")
    print((r.stdout + r.stderr).decode("utf-8", "replace").strip())
    return r.returncode


if __name__ == "__main__":
    sys.exit(main())
