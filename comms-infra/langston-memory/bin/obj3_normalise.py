#!/usr/bin/env python3
"""B-LANGSTON-RELIEF OBJ-3 Q3, step 1 of 2 — NORMALISE (Langston's ruling 12:01Z + allowlist r1 12:18Z).

Langston's file mixes `## ` sections with column-0 batch records (bullets AND bold paragraphs), so a section-level trim
would carry other batches' records away with the one it evicts. This one-time pass:
  - promotes every batch record named in his allowlist §5 to its OWN `## ` section, placed right after the section that
    held it (the F-G-1 record at old L798 MERGES into the F-G-1 section; B-PRICE-SIDE-BY-JOB is hand-placed);
  - splits the one heading that carries two batches (old L865);
  - ends EVERY batch section with a declared trailer line, a field at a fixed position, never inferred from prose:
        STATE: closed · batch: <id> · superseded-by: <completion report path>
        STATE: open · batch: <id>
  - prefixes the lines he marked `keep:` with `keep: ` so a later trim leaves them in the stub;
  - prints the new part on stdout. The write goes through langston-memory-write (deltas 0/0, CAS, archive, guards).

The spec below is keyed to LINE NUMBERS of the part AFTER the 2026-10-16 split and the Q4 relabel, and every line it names
carries an expected PREFIX that is checked - so it refuses on any other object rather than mis-apply (his own §0 rule:
"If the sha has moved, re-derive"). It also refuses unless Q4 has run (his rider 3).

Checks before printing (each a refusal, exit 2): every original line is in the output exactly once (a `keep: ` prefix
aside); every added line is a new heading, a STATE trailer or a blank; the split heading's two halves rejoin to the
original; the REVIEWER LEDGER section is byte-identical; protected sections hold no STATE line; and the id -> section
MAPPING equals the spec both ways (49 sections, each id exactly once)."""
import re, sys

NL = chr(10)
REPORTS = "Claude Comms and Packages/Batch Completion/"
PROTECTED = {14: "## ★★ GOVERNANCE-INTEGRITY", 32: "## ★ COMMS", 35: "## ★ CURRENT STATE", 55: "## ★★ REVIEWER LEDGER",
             108: "## ★ STANDING NOTES", 138: "## ★ THE DELIVERY BOARD", 164: "## RULINGS OF YOURS EXECUTED"}
# existing batch sections: heading line -> (prefix, id, state)
EXISTING = {
    104: ("## B-ATR-BAD-PRINT", "B-ATR-BAD-PRINT", "closed"),
    158: ("## B-REGIME-INPUTS-LIVE", "B-REGIME-INPUTS-LIVE", "closed"),
    169: ("## B-CROSS-SESSION-BLEED", "B-CROSS-SESSION-BLEED", "closed"),
    181: ("## B-GOV-REPORTING", "B-GOV-REPORTING", "closed"),
    183: ("## P19-B-PERPFEED", "P19-B-PERPFEED", "closed"),
    185: ("## B-MISTAKES-FILE", "B-MISTAKES-FILE", "closed"),
    187: ("## B-MBIM-SWITCH-ON", "B-MBIM-SWITCH-ON", "closed"),
    189: ("## ✅ B-EPOCH-KEYING-PARITY", "B-EPOCH-KEYING-PARITY", "closed"),
    191: ("## ⏳ F-G-1 / B-GRID-REPRESENTABILITY — WINDOW CLOSED", "F-G-1", "open"),       # Q4 label: report owed
    216: ("## F-G-2 / `B-EXIT-TRANSACTABLE-SIDE`", "F-G-2", "closed"),
    224: ("## ⏳ B-PRICE-STALENESS-BOUND", "B-PRICE-STALENESS-BOUND", "open"),
    226: ("## B-VTS-NO-DECISION-VALVE", "B-VTS-NO-DECISION-VALVE", "open"),
    234: ("## B-GEOMETRY-REACH-BASELINE", "B-GEOMETRY-REACH-BASELINE", "closed"),
    240: ("## B-ALERT-ACTOR-ALLOWLIST", "B-ALERT-ACTOR-ALLOWLIST", "closed"),
    267: ("## B-WAKE-LEAD-NAME (#1040, Infra Claude) — ✅ CLOSED 2026-09-11: STEP 11 CONFIRMED", "B-WAKE-LEAD-NAME", "closed"),
    279: ("## B-REACH-BASELINE-ADJUST", "B-REACH-BASELINE-ADJUST", "closed"),
    288: ("## B-ARCHIVE-RETENTION-SIZING", "B-ARCHIVE-RETENTION-SIZING", "closed"),
    295: ("## ✅ CLOSED 2026-10-02 (Step 11 confirmed by me) — B-WAKE-ARM-EXCLUSIVE", "B-WAKE-ARM-EXCLUSIVE", "closed"),
    302: ("## ✅ B-LIVE-BANNER-ACTIVE-HOTFIX", "B-LIVE-BANNER-ACTIVE-HOTFIX", "closed"),
    309: ("## ✅ B-ENGINE-HEARTBEAT-DEAD-PATHS", "B-ENGINE-HEARTBEAT-DEAD-PATHS", "closed"),
    314: ("## ✅ B-EXPECTANCY-TUNING-ROWS-RETIRE", "B-EXPECTANCY-TUNING-ROWS-RETIRE", "closed"),     # split below
    316: ("## ✅ B-ROOT-DUPLICATE-SCANNER-RETIRE", "B-ROOT-DUPLICATE-SCANNER-RETIRE", "closed"),
    324: ("## ✅ B-CLUSTER-BUS-PERSIST-DISPOSITION", "B-CLUSTER-BUS-PERSIST-DISPOSITION", "closed"),
    336: ("## ✅ B-ENTRY-DISTANCE-GUARD", "B-ENTRY-DISTANCE-GUARD", "closed"),
    346: ("## ✅ B-RTB-REFRESH-LIVE-PRICE", "B-RTB-REFRESH-LIVE-PRICE", "closed"),
}
SPLIT_LINE, SPLIT_AT = 314, " ⏳ B-SIZING-DEC-RESTORE (row 9"
SPLIT_B = ("B-SIZING-DEC-RESTORE", "open")
# promoted records: (container heading line, [(line, prefix)...] opener first, id, state)
PROMOTE = [
    (35, [(44, "- **B-FILTER-DIAG-STANDARDIZE"), (45, "  - **★ YOU VACATED"), (46, "  - **★ #669 CLOSED"),
          (47, "  - **⚠ REVIEW HOLD"), (48, "  - **★ INSTRUMENT TRAP")], "B-FILTER-DIAG-STANDARDIZE", "open"),
    (35, [(51, "- **B-CODEX-FAILOVER")], "B-CODEX-FAILOVER", "open"),
    (108, [(118, "- **B-RULES-1b CLOSED")], "B-RULES-1b", "closed"),
    (108, [(121, "- **P19-B8.5l (B-ATR-SOURCE-FIX")], "P19-B8.5l / B-ATR-SOURCE-FIX", "open"),
    (108, [(123, "- **B-CLASS-LEG-FILL-MODE")], "B-CLASS-LEG-FILL-MODE", "closed"),
    (108, [(126, "- **B-AFTERLIVE-TOTAL-RULE")], "B-AFTERLIVE-TOTAL-RULE", "closed"),
    (108, [(129, "- **B-ARM-REMOVAL")], "B-ARM-REMOVAL", "open"),
    (108, [(131, "- **B-MEASURE-GATE leg 2")], "B-MEASURE-GATE", "open"),
    (108, [(132, "- **B-PLAN-CURRENCY-CHECK")], "B-PLAN-CURRENCY-CHECK", "closed"),
    (108, [(133, "- **B-TOKEN-BURN-CUT")], "B-TOKEN-BURN-CUT", "closed"),
    (108, [(134, "- **B-INSTRUMENTS-OVER-RULES")], "B-INSTRUMENTS-OVER-RULES", "closed"),
    (191, [(209, "**B-SCANNER-EGRESS-NORMALISE"), (210, "⛔ **STANDING INVARIANT, SysManual B63.6"),
           (211, "⚠️ **THE GUARD IS UNEXERCISED"), (212, "➕ **PLACED: `#965`")], "B-SCANNER-EGRESS-NORMALISE", "closed"),
    # closed WITH its keep on line 214 (Langston 12:5xZ): a one-line record, so the keep keeps all of it - same bytes as
    # open, but a confirmed-closed batch must not wear an open STATE cell.
    (191, [(214, "**B-PRICE-AGE-TRUTH (#951")], "B-PRICE-AGE-TRUTH", "closed"),
    (240, [(242, "**B-XSTOCK-FEED-SANITY"), (245, "**⚠️ SHA CORRECTION (CC-C, 2026-09-04)"),
           (246, "**WINDOW RE-ANCHORED (your conditions")], "B-XSTOCK-FEED-SANITY", "closed"),     # 246: Langston 12:5xZ
    (240, [(243, "**KYLE DELEGATED THE PRICE-SIDE DECISION"), (248, "**`B-PRICE-SIDE-BY-JOB`: P4's rule")],
     "B-PRICE-SIDE-BY-JOB", "open"),
    (240, [(250, "**B-DEPLOY-ACTOR-ALLOWLIST CLOSED"), (251, "**⛔ `#1004` OPENED ON YOUR RULING")],
     "B-DEPLOY-ACTOR-ALLOWLIST", "closed"),
    (240, [(254, "**B-WAKE-QUIET CLOSED"), (256, "**⛔ `#1005` OPENED AGAINST MYSELF")], "B-WAKE-QUIET", "closed"),
    (240, [(259, "**B-DEPLOY-DRIFT-LINE (CC-A, #1002)"), (257, "**★ TWO FINDINGS OUTLIVE THE BATCH"),
           (262, "⛔ 🔴 **WITHDRAWN 2026-10-12"), (263, "★★ **THE DEFECT TO CARRY"), (264, "★ **Your rule is filed")],
     "B-DEPLOY-DRIFT-LINE", "open"),
    (240, [(260, "**B-TASK-LIST-SLOT (CC-A, #1009")], "B-TASK-LIST-SLOT", "closed"),
    (240, [(261, "**B-CANONICAL-BRIDGE-CHURN (CC-A, #402)")], "B-CANONICAL-BRIDGE-CHURN", "closed"),
    (240, [(265, "**#1016 / B-DRIFT-RUNTIME-PREDICATE")], "B-DRIFT-RUNTIME-PREDICATE", "closed"),
    (267, [(271, "- ✅ **B-CREDENTIALS-PRIVATE-REPO OBJ-1")], "B-CREDENTIALS-PRIVATE-REPO", "open"),
    (267, [(273, "**B-XSTOCK-FEE-CONTRACT (CC-B, #1010"), (274, "- **Your condition is folded"),
           (275, "- ⛔ **Your population correction"), (276, "- ✅ **BOTH WINDOWS CLOSED"), (277, "- **Alerts you routed:**")],
     "B-XSTOCK-FEE-CONTRACT", "closed"),
]
MERGE = (247, "**F-G-1: window CLOSED 2026-09-04T16:08:02Z", 191)          # old L798 -> the F-G-1 section
# Langston 12:5xZ: NO keep on F-G-2's line 217 - it points at F_G_2_PROGRESS_REPORT.md, which does not exist at the ref
#   (the superseded-by trailer names the live report); and not line 219 either, which carries a RETIRED A3 clause.
KEEP = {210: "⛔ **STANDING INVARIANT", 211: "⚠️ **THE GUARD IS UNEXERCISED", 214: "**B-PRICE-AGE-TRUTH (#951",
        238: "⛔ **RATCHET at 2.4g-3", 251: "**⛔ `#1004` OPENED", 256: "**⛔ `#1005` OPENED"}
RECIPE_AFTER = "> ⛔ **SINCE 2026-10-16 YOUR RETRACTIONS LIVE IN"
HEADER_NOTE = ("> ⛔ **EVERY BATCH SECTION ENDS WITH A DECLARED STATE LINE (B-LANGSTON-RELIEF Q3, 2026-10-16).** Its LAST line "
               "is `STATE: open · batch: <id>` or `STATE: closed · batch: <id> · superseded-by: <completion report path>`. "
               "A new batch section must carry one, or the daily 03:50Z `langston-memory-write --trim` REFUSES and pages. "
               "To close a batch, change its line to `closed` with the path: the trim then moves the section VERBATIM to "
               "`/home/langston/MEMORY-ARCHIVE.md` (searchable with `langston-recall`) and leaves one index line. ⛔ **BEFORE "
               "you close one, prefix with `keep: ` every line that must stay loaded** (a forward-binding rule, a ratchet, "
               "a standing invariant) - nothing else prompts it, and an unmarked line leaves with its section. Never "
               "trimmed: `## ★…`, `## RULINGS OF YOURS EXECUTED`, `## Archived batch sections`.")
EXPECT_HEADINGS = 32
EXPECT_SECTIONS = 49


def fail(msg):
    sys.stderr.write("REFUSED: " + msg + NL)
    sys.exit(2)


def report_for(bid):
    return REPORTS + bid.split(" / ")[0].replace("-", "_").upper() + "_COMPLETION_REPORT.md"


def trailer(bid, state):
    if state == "closed":
        return "STATE: closed · batch: %s · superseded-by: %s" % (bid, report_for(bid))
    return "STATE: open · batch: %s" % bid


def main():
    if len(sys.argv) != 2:
        fail("usage: obj3_normalise.py <part-path>")
    raw = open(sys.argv[1], "rb").read()
    text = raw.decode("utf-8")
    if not text.endswith(NL):
        fail("the part must end in a newline")
    L = text.split(NL)[:-1]                       # L[n-1] is line n
    line = lambda n: L[n - 1]

    def expect(n, prefix):
        if not line(n).startswith(prefix):
            fail("line %d does not start with %r (it reads %r) - wrong object; re-derive the spec" % (n, prefix, line(n)[:70]))

    heads = [i + 1 for i, l in enumerate(L) if l.startswith("## ")]
    if len(heads) != EXPECT_HEADINGS:
        fail("%d '## ' headings, the spec was derived on %d" % (len(heads), EXPECT_HEADINGS))
    if any(l.startswith("STATE: ") for l in L):
        fail("a STATE trailer already exists - the normalise has run")
    for n, p in PROTECTED.items():
        expect(n, p)
    for n, (p, _i, _s) in EXISTING.items():
        expect(n, p)
    if set(heads) != set(PROTECTED) | set(EXISTING):
        fail("headings %s are neither protected nor in the spec" % sorted(set(heads) - set(PROTECTED) - set(EXISTING)))
    for _c, recs, _i, _s in PROMOTE:
        for n, p in recs:
            expect(n, p)
    expect(MERGE[0], MERGE[1])
    for n, p in KEEP.items():
        expect(n, p)
    if line(SPLIT_LINE).count(SPLIT_AT) != 1:
        fail("the split point %r is not in line %d exactly once" % (SPLIT_AT, SPLIT_LINE))

    # section extents: heading line -> last line before the next heading
    bounds = {}
    for k, h in enumerate(heads):
        bounds[h] = (h, (heads[k + 1] - 1) if k + 1 < len(heads) else len(L))
    moved = {}
    for c, recs, bid, st in PROMOTE:
        a, b = bounds[c]
        for n, _p in recs:
            if not (a < n <= b):
                fail("record line %d (%s) is not inside its container section %d..%d" % (n, bid, a, b))
            if n in moved:
                fail("line %d is claimed twice" % n)
            moved[n] = bid
    if not (bounds[MERGE[2]][0] < MERGE[0] <= bounds[MERGE[2]][1]) and not (bounds[240][0] < MERGE[0] <= bounds[240][1]):
        fail("merge line is not where the spec says")
    moved[MERGE[0]] = "F-G-1"

    def body(h, extra_tail=()):
        """Lines of section h minus the moved ones, plus extra lines appended (before the trailer), blank-trimmed."""
        a, b = bounds[h]
        out = [("keep: " + line(n)) if n in KEEP else line(n) for n in range(a, b + 1) if n not in moved]
        while out and out[-1] == "":
            out.pop()
        out += list(extra_tail)
        return out

    out = []
    sections = {}                                  # id -> count
    for h in heads:
        if h in PROTECTED:
            out += body(h)
            out.append("")
        else:
            p, bid, st = EXISTING[h]
            tail = [""] + [line(MERGE[0])] if h == MERGE[2] else []
            if h == SPLIT_LINE:
                full = line(h)
                i = full.index(SPLIT_AT)
                head_a, head_b = full[:i], "## " + full[i + 1:]
                rest = body(h)[1:]
                out += [head_a] + rest + ["", trailer(bid, st), "", head_b, "", trailer(*SPLIT_B), ""]
                sections[bid] = sections.get(bid, 0) + 1
                sections[SPLIT_B[0]] = sections.get(SPLIT_B[0], 0) + 1
            else:
                out += body(h, tail) + ["", trailer(bid, st), ""]
                sections[bid] = sections.get(bid, 0) + 1
        for c, recs, bid, st in PROMOTE:            # promoted records follow their container, in spec order
            if c != h:
                continue
            cname = (EXISTING.get(c) or (PROTECTED[c], None, None))[1] or PROTECTED[c].lstrip("# ★").split(" (")[0]
            out += ["## %s — own section since 2026-10-16 (B-LANGSTON-RELIEF Q3; was nested under %s)" % (bid, cname), ""]
            out += [("keep: " + line(n)) if n in KEEP else line(n) for n, _p in recs]
            out += ["", trailer(bid, st), ""]
            sections[bid] = sections.get(bid, 0) + 1
    # the header block before the first heading is untouched EXCEPT for one added line documenting the convention, right
    # after the retractions recipe line (Langston BLOCKER, 13:0xZ: a convention enforced by a refusal and documented
    # nowhere he loads - and the keep: absence, unlike the STATE absence, cannot announce itself)
    head0 = L[:heads[0] - 1]
    at = [i for i, l in enumerate(head0) if l.startswith(RECIPE_AFTER)]
    if len(at) != 1:
        fail("the recipe line %r must appear exactly once in the header block" % RECIPE_AFTER)
    head0 = head0[:at[0] + 1] + [HEADER_NOTE] + head0[at[0] + 1:]
    out = head0 + out
    while out and out[-1] == "":
        out.pop()

    # ---- checks ----
    def norm(l):
        return l[len("keep: "):] if l.startswith("keep: ") else l
    orig = [l for l in L if l.strip()]
    got = [norm(l) for l in out if l.strip() and not l.startswith("STATE: ")]
    added_heads = [l for l in out if l.startswith("## ") and "own section since 2026-10-16 (B-LANGSTON-RELIEF Q3" in l]
    split_heads = [l for l in out if l.startswith("## ⏳ B-SIZING-DEC-RESTORE")]
    from collections import Counter
    co, cg = Counter(orig), Counter(got)
    for hl in added_heads:
        cg[hl] -= 1
    cg[HEADER_NOTE] -= 1
    full = line(SPLIT_LINE)
    i = full.index(SPLIT_AT)
    cg[full[:i]] -= 1
    cg[split_heads[0]] -= 1 if split_heads else 0
    cg[full] += 1
    cg = +cg
    if co != cg:
        lost = co - cg
        extra = cg - co
        fail("line conservation failed: %d lost (first %r), %d extra (first %r)" % (
            sum(lost.values()), (list(lost) or [""])[0][:60], sum(extra.values()), (list(extra) or [""])[0][:60]))
    if (full[:i] + " " + split_heads[0][3:]) != full:
        fail("the split heading halves do not rejoin to the original")
    ra, rb = bounds[55]
    led_old = [line(n) for n in range(ra, rb + 1)]
    s = out.index(line(55))
    led_new = out[s:s + len(led_old)]
    if [l for l in led_new if l.strip()] != [l for l in led_old if l.strip()]:
        fail("the REVIEWER LEDGER section changed")
    spec_ids = Counter([v[1] for v in EXISTING.values()] + [SPLIT_B[0]] + [p[2] for p in PROMOTE])
    if spec_ids != Counter(sections) or any(v != 1 for v in sections.values()):
        fail("id -> section mapping differs from the spec: spec %s vs built %s" % (dict(spec_ids), dict(sections)))
    if len(sections) != EXPECT_SECTIONS:
        fail("%d batch sections, expected %d" % (len(sections), EXPECT_SECTIONS))
    # every non-protected section ends in exactly one STATE line; protected ones hold none
    cur, states, prot = None, {}, set(PROTECTED.values())
    for l in out:
        if l.startswith("## "):
            cur = l
            states.setdefault(cur, 0)
        elif l.startswith("STATE: "):
            if any(cur.startswith(p) for p in prot):
                fail("a STATE line inside protected section %r" % cur[:50])
            states[cur] += 1
    bad = [h for h, c in states.items() if c != 1 and not any(h.startswith(p) for p in prot)]
    if bad:
        fail("%d batch sections without exactly one STATE line, first %r" % (len(bad), bad[0][:60]))
    new = NL.join(out) + NL
    sys.stderr.write("normalise: %d batch sections (%d closed, %d open), %d keep lines, %d -> %d B\n" % (
        len(sections), sum(1 for l in out if l.startswith("STATE: closed")), sum(1 for l in out if l.startswith("STATE: open")),
        sum(1 for l in out if l.startswith("keep: ")), len(raw), len(new.encode("utf-8"))))
    sys.stdout.buffer.write(new.encode("utf-8"))


if __name__ == "__main__":
    main()
