#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 — the one pre-split move Langston ruled (allowlist r1 §2, 2026-10-16T12:18Z):
`B-ATR-BAD-PRINT` (L118 at part sha 03275c5b…) is a BATCH RECORD inside `### Retractions`; the split must move the block
MINUS that line, and the line joins the Q3 promote set. So before `--split-ledger`, this lifts that ONE bullet out of the
Retractions block into its own `## ` section placed immediately after the REVIEWER LEDGER block (before
`## ★ STANDING NOTES`), verbatim. It only COMPUTES the new part and prints it on stdout; the write goes through
`langston-memory-write` (CAS, archive, counts, ledger guards, rollback) with --ledger-delta -1 --retractions-delta -1.

    obj3_premove.py <part-path> > new-part        then pipe new-part to the writer.

Refuses (exit 2, nothing printed) unless: exactly one column-0 line starts with PREFIX; it lies between the one
`### Retractions` heading and the GENERALISE anchor; the next line is a new column-0 bullet or blank (the entry is one
physical line, as measured); and BEFORE appears exactly once, after the anchor."""
import re, sys

NL = chr(10)
PREFIX = "- **✅ B-ATR-BAD-PRINT (`#1153`"
RETR = re.compile(r"^###\s*Retractions")
ANCHOR = "### Rulings of mine that GENERALISE"
BEFORE = "## ★ STANDING NOTES"
HEADING = ("## B-ATR-BAD-PRINT — ✅ STEP 11 CONFIRMED BY ME 2026-10-10 (a batch record, moved out of `### Retractions` "
           "2026-10-16 by B-LANGSTON-RELIEF OBJ-3 — allowlist r1 §2)")


def fail(msg):
    sys.stderr.write("REFUSED: " + msg + NL)
    sys.exit(2)


def main():
    if len(sys.argv) != 2:
        fail("usage: obj3_premove.py <part-path>")
    raw = open(sys.argv[1], "rb").read()
    text = raw.decode("utf-8")
    lines = text.split(NL)
    hits = [i for i, l in enumerate(lines) if l.startswith(PREFIX)]
    if len(hits) != 1:
        fail("%d lines start with %r - exactly one is required" % (len(hits), PREFIX))
    i = hits[0]
    heads = [n for n, l in enumerate(lines) if RETR.match(l)]
    anchors = [n for n, l in enumerate(lines) if l.startswith(ANCHOR)]
    if len(heads) != 1 or len(anchors) != 1 or not (heads[0] < i < anchors[0]):
        fail("the line (index %d) is not inside the one Retractions block (headings %s, anchors %s)" % (i, heads, anchors))
    nxt = lines[i + 1] if i + 1 < len(lines) else ""
    if not (nxt.startswith("- ") or nxt.strip() == ""):
        fail("the entry continues onto the next line (%r) - it is not one physical line as measured" % nxt[:60])
    befores = [n for n, l in enumerate(lines) if l == BEFORE]
    if len(befores) != 1 or befores[0] < anchors[0]:
        fail("%r must appear exactly once, after the anchor (found at %s)" % (BEFORE, befores))
    entry = lines[i]
    b = befores[0]
    out = lines[:i] + lines[i + 1:b] + [HEADING, "", entry, ""] + lines[b:]
    new = NL.join(out)
    if len(new.encode("utf-8")) != len(raw) + len((HEADING + NL + NL + NL).encode("utf-8")):
        fail("byte arithmetic does not close - refusing")
    sys.stdout.buffer.write(new.encode("utf-8"))


if __name__ == "__main__":
    main()
