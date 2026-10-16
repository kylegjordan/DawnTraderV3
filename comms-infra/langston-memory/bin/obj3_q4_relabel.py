#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 Q4 (Langston's ruling, 2026-10-16T12:01Z): two `## ` sections wear a STALE OPEN LABEL that their
own bodies contradict. Correcting the labels is owed work, not pruning. This rewrites exactly those two heading lines and
prints the new part on stdout; the write goes through `langston-memory-write` with --ledger-delta 0 --retractions-delta 0.

    obj3_q4_relabel.py <part-path> > new-part

Each OLD heading must appear exactly once, as a whole line, or nothing is printed (exit 2). Nothing else changes; the
byte arithmetic is checked."""
import sys

NL = chr(10)
FIXES = [
    # F-G-1: the heading says Step-8 is the next gate; its own body (the "WINDOW RE-ANCHORED" block) records the window
    # CLOSED 2026-09-04T16:08:02Z, crypto_spot PASS n=24, xstock_spot UNDERPOWERED n=19, completion report OWED.
    ("## ⏳ F-G-1 / B-GRID-REPRESENTABILITY — YOU APPROVED IT at `f280e9c6b`; residuals landed at `ca9090724`. "
     "**DEPLOYED** 2026-08-28T16:08:02Z, CI 4/4. **Step-8 (your second pass) is the next gate.**",
     "## ⏳ F-G-1 / B-GRID-REPRESENTABILITY — WINDOW CLOSED 2026-09-04T16:08:02Z (`crypto_spot` PASS n=24; `xstock_spot` "
     "UNDERPOWERED n=19); **only the completion report is OWED (CC-C)**. Approved at `f280e9c6b`, residuals `ca9090724`, "
     "deployed 2026-08-28T16:08:02Z. *(Label corrected 2026-10-16, B-LANGSTON-RELIEF Q4: it read \"Step-8 is the next "
     "gate\".)*"),
    # B-WAKE-LEAD-NAME: you CONFIRMED the completion report at 17:38Z on 2026-09-11; the "closes on Kyle's acknowledgement"
    # clause contradicts Kyle's own 2026-09-02 rule that a batch close needs no acknowledgement from him.
    ("## B-WAKE-LEAD-NAME (#1040, Infra Claude) — ⏳ CLOSING 2026-09-11. You APPROVED Step 4 at `c05e9d1fa`, CONFIRMED "
     "Step 8, approved FINDING-A (`32780211d`); FINDING-D folded at `0df01c687`. Record: `B_WAKE_LEAD_NAME_COMPLETION_REPORT.md`.",
     "## B-WAKE-LEAD-NAME (#1040, Infra Claude) — ✅ CLOSED 2026-09-11: STEP 11 CONFIRMED BY ME 17:38Z (no Kyle "
     "acknowledgement is needed — his 2026-09-02 rule). You APPROVED Step 4 at `c05e9d1fa`, CONFIRMED Step 8, approved "
     "FINDING-A (`32780211d`); FINDING-D folded at `0df01c687`. Record: `B_WAKE_LEAD_NAME_COMPLETION_REPORT.md`. *(Label "
     "corrected 2026-10-16, B-LANGSTON-RELIEF Q4: it read \"⏳ CLOSING\".)*"),
]


def fail(msg):
    sys.stderr.write("REFUSED: " + msg + NL)
    sys.exit(2)


def main():
    if len(sys.argv) != 2:
        fail("usage: obj3_q4_relabel.py <part-path>")
    raw = open(sys.argv[1], "rb").read()
    lines = raw.decode("utf-8").split(NL)
    delta = 0
    for old, new in FIXES:
        hits = [i for i, l in enumerate(lines) if l == old]
        if len(hits) != 1:
            fail("%d whole-line matches for %r - exactly one is required" % (len(hits), old[:60]))
        lines[hits[0]] = new
        delta += len(new.encode("utf-8")) - len(old.encode("utf-8"))
    out = NL.join(lines).encode("utf-8")
    if len(out) != len(raw) + delta:
        fail("byte arithmetic does not close - refusing")
    sys.stdout.buffer.write(out)


if __name__ == "__main__":
    main()
