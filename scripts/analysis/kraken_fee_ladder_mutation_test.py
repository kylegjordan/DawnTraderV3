#!/usr/bin/env python3
"""
B-KRAKEN-FEE-WATCH (#1011) — the mutation harness for kraken_fee_ladder_extract.py.

WHY IT EXISTS, AND WHY IT IS A FILE. The `#744` rider is explicit: a guard written against an
EXTERNAL contract must be exercised against a REAL failure response, and the branch exercised is
the FAILURE branch. The extractor's drift path (`return 3`) was added and then asserted without
ever being run.

The first attempt to exercise it inline through SSH produced a null result that LOOKED like a
pass: the escaping collapsed, both "mutated" bodies were byte-identical copies of the clean one,
and all three runs exited 0. Had the harness not printed whether the mutation actually applied,
three identical exit-0s would have read as "baseline plus two mutations, all correct" — the exact
inverse of the truth. ⇒ THIS HARNESS ABORTS IF A MUTATION DID NOT CHANGE THE BYTES. A control
that cannot fail is not a control.

It mutates the PARSED payload rather than the raw string, so no escaping is involved: find the
cell, change the number, re-serialise, and write a body the extractor will parse normally.

Usage:
    python3 kraken_fee_ladder_mutation_test.py              # fetch, then run all cases
    python3 kraken_fee_ladder_mutation_test.py --file p.html
Exit 0 = every case produced its expected status. Exit 1 = a case did not.
Exit 4 = HARNESS FAULT (a mutation changed nothing) — deliberately NOT 2, which is the subject's
own MEASUREMENT FAILED, so "the harness broke" never reads as "the extractor refused".

⚠️ COVERAGE, RE-STATED AT r9. This header carried r5's claim ("these four cases exercise ONE of
OBJ-5's seven fail-loud inputs") until r9 — at the top of a file that by then held thirteen cases.
A STALE HEADER COMMENT IS A FIRST-CLASS FALSE SOURCE, and this one UNDERSTATED the coverage, which
is very likely why it survived four rounds of being read (Langston r9, rider 1).

CURRENT: the case count and every verdict are PRINTED BY THE RUN - read them there. This line
deliberately states NO count, because rider 1 was a stale count in this very docstring and I put a
wrong one (17, against a measured 19) in its replacement before catching it. A number written into
a header is a number that goes stale; the table below the run cannot.
All 7 of OBJ-5's fail-loud inputs are exercised on the TIERED side. ⛔ BUT OBJ-5's seven are THEMSELVES TIERED-SHAPED — "a row label
outside Tier 1-12 / Pro 1-5" has no banded analogue in that list, and the banded side has NO count
invariant to fall back on. That asymmetry is what let a renamed band label exit 3 as false DRIFT
through six rounds. The banded analogues now have their own cases (14, 15) and their own
assertion (EXPECTED_BAND_LABELS), and the honest statement is that the SEVEN were never the whole
population — not that the count is now complete.
"""

import argparse
import copy
import json
import re
import subprocess
import sys
import tempfile
import os

# Finding 7 (r7): a cp1252 console raised UnicodeEncodeError mid-report and killed the run with a
# traceback AFTER the control had passed -- exit 1, which is in none of the three declared
# statuses. Force the stream instead of policing glyphs: a sweep misses the next one added.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


HERE = os.path.dirname(os.path.abspath(__file__))
EXTRACTOR = os.path.join(HERE, "kraken_fee_ladder_extract.py")
ASSIGN = "window.__INITIAL_PROPS__="

EXIT_NO_CHANGE = 0
EXIT_MEASUREMENT_FAILED = 2
EXIT_DRIFT = 3
# Langston r5 condition 1: a harness fault must NOT reuse the subject's MEASUREMENT FAILED code,
# or "the harness broke" and "the extractor correctly refused" read identically to a caller.
EXIT_HARNESS_FAULT = 4


def slice_payload(html):
    a = html.find(ASSIGN)
    if a == -1:
        raise SystemExit("harness: assignment not found")
    start = html.find("{", a)
    depth, in_str, esc = 0, False, False
    for i in range(start, len(html)):
        ch = html[i]
        if in_str:
            if esc:
                esc = False
            elif ch == "\\":
                esc = True
            elif ch == '"':
                in_str = False
            continue
        if ch == '"':
            in_str = True
        elif ch == "{":
            depth += 1
        elif ch == "}":
            depth -= 1
            if depth == 0:
                return start, i + 1, json.loads(html[start:i + 1])
    raise SystemExit("harness: unbalanced payload")


def walk_rows(node, fn):
    """Apply fn(title, row_dict) to every table row, carrying the accordion title."""
    def rec(n, title):
        if isinstance(n, dict):
            if n.get("_type") == "paragraphAccordionItem":
                t = n.get("field_title")
                if isinstance(t, str) and t.strip():
                    title = re.sub(r"<[^>]+>", "", t).strip()
            if n.get("_type") == "paragraphArticleBodyTable" and isinstance(n.get("field_rows"), list):
                for r in n["field_rows"]:
                    if isinstance(r, dict):
                        fn(title, r)
            for v in n.values():
                rec(v, title)
        elif isinstance(n, list):
            for v in n:
                rec(v, title)
    rec(node, "(none)")


def mutate(payload, accordion, row_label, cell_index, new_text):
    """
    Change one cell. Returns True only if a cell's VALUE actually changed.

    ⛔ Langston r5 condition 1: this used to count an ASSIGNMENT, not a CHANGE — if `new_text`
    ever equalled the incumbent, it returned True and the harness proceeded against an unmutated
    body. That is the very failure this harness exists to prevent, one level down: a control that
    cannot fail in the way it claims. It now compares old to new and counts only real changes.
    """
    changed = {"n": 0, "noop": 0}

    def fn(title, row):
        if title != accordion:
            return
        label = re.sub(r"<[^>]+>", "", str(row.get("row_description", ""))).replace("Row :: ", "").strip()
        if label != row_label:
            return
        cells = row.get("field_cells") or []
        if cell_index < len(cells) and isinstance(cells[cell_index], dict):
            old = cells[cell_index].get("field_content")
            if old == new_text:
                changed["noop"] += 1      # found the cell, but the edit would be a no-op
                return
            cells[cell_index]["field_content"] = new_text
            changed["n"] += 1

    walk_rows(payload, fn)
    if changed["noop"] and not changed["n"]:
        print("   (cell found, but new_text equals the incumbent — that is a NO-OP, not a mutation)")
    return changed["n"] > 0


def inject_duplicate_accordion(payload, title):
    """
    BLOCKER-3 (Langston r6): append a SECOND accordion bearing `title` whose data rows do not
    parse as rungs. It survives into `raw` (so identity must see two) but is filtered out of
    `ladders` (so the old post-filter check still sees one). Returns True if one was injected.
    """
    done = {"n": 0}

    def rec(node):
        if isinstance(node, list):
            dup = None
            for item in node:
                if (isinstance(item, dict) and item.get("_type") == "paragraphAccordionItem"
                        and re.sub(r"<[^>]+>", "", str(item.get("field_title") or "")).strip() == title):
                    dup = copy.deepcopy(item)
            if dup is not None and not done["n"]:
                def blunt(n):
                    # Rename the HEADER row only. `ladder_from` looks up the row labelled
                    # exactly `Tier` and returns None when it is absent, so no data label is
                    # ever examined and BLOCKER-4's raise cannot preempt identity. Blunting the
                    # DATA labels (the first version) made this case exit 2 by the wrong route.
                    if isinstance(n, dict):
                        rd = n.get("row_description")
                        if isinstance(rd, str):
                            lbl = re.sub(r"<[^>]+>", "", rd).replace("Row :: ", "").strip()
                            if lbl == "Tier":
                                n["row_description"] = "Row :: Rank"
                        for v in n.values():
                            blunt(v)
                    elif isinstance(n, list):
                        for v in n:
                            blunt(v)
                blunt(dup)
                node.append(dup)
                done["n"] += 1
                return
            for item in node:
                rec(item)
        elif isinstance(node, dict):
            for v in node.values():
                rec(v)

    rec(payload)
    return done["n"] > 0


def says(out, needle):
    """A text assertion recorded as its own row: 1 = the output said it, 0 = it did not."""
    return 1 if needle in out else 0


def drop_row(payload, accordion, row_label):
    """Remove one row outright. A DELETED rung is the only way left to reach the `!= 17` count:
    BLOCKER-4 now raises on a relabelled one before the count is ever taken."""
    done = {"n": 0}

    def rec(node):
        if isinstance(node, dict):
            if (node.get("_type") == "paragraphArticleBodyTable"
                    and isinstance(node.get("field_rows"), list)):
                keep = []
                for r in node["field_rows"]:
                    lbl = ""
                    if isinstance(r, dict):
                        lbl = re.sub(r"<[^>]+>", "", str(r.get("row_description", ""))
                                     ).replace("Row :: ", "").strip()
                    if lbl == row_label and done["n"] == 0:
                        done["n"] += 1
                        continue
                    keep.append(r)
                node["field_rows"] = keep
            for v in node.values():
                rec(v)
        elif isinstance(node, list):
            for v in node:
                rec(v)

    def scoped(n, title):
        if isinstance(n, dict):
            if n.get("_type") == "paragraphAccordionItem":
                t = re.sub(r"<[^>]+>", "", str(n.get("field_title") or "")).strip()
                if t == accordion:
                    rec(n)
                    return
            for v in n.values():
                scoped(v, title)
        elif isinstance(n, list):
            for v in n:
                scoped(v, title)

    scoped(payload, None)
    return done["n"] > 0


def rename_accordion(payload, from_title, to_title):
    """Rename an accordion so its title resolves to ZERO tables (OBJ-5 input #2, other half)."""
    done = {"n": 0}

    def rec(n):
        if isinstance(n, dict):
            if n.get("_type") == "paragraphAccordionItem":
                t = re.sub(r"<[^>]+>", "", str(n.get("field_title") or "")).strip()
                if t == from_title:
                    n["field_title"] = to_title
                    done["n"] += 1
            for v in n.values():
                rec(v)
        elif isinstance(n, list):
            for v in n:
                rec(v)

    rec(payload)
    return done["n"] > 0


def truncate_row_cells(payload, accordion, row_label, keep):
    """Shorten one row's cell list, so the column indices no longer exist in it."""
    changed = {"n": 0}

    def fn(title, row):
        if title != accordion:
            return
        label = re.sub(r"<[^>]+>", "", str(row.get("row_description", ""))).replace("Row :: ", "").strip()
        if label != row_label:
            return
        cells = row.get("field_cells") or []
        if len(cells) <= keep:
            return
        row["field_cells"] = cells[:keep]
        changed["n"] += 1

    walk_rows(payload, fn)
    return changed["n"] > 0


def blank_row_label(payload, accordion, row_label):
    """Blank one row's label. BLOCKER-7a: an EMPTY label used to be treated as a sentinel."""
    changed = {"n": 0}

    def fn(title, row):
        if title != accordion:
            return
        rd = str(row.get("row_description", ""))
        label = re.sub(r"<[^>]+>", "", rd).replace("Row :: ", "").strip()
        if label != row_label:
            return
        row["row_description"] = "Row :: "
        changed["n"] += 1

    walk_rows(payload, fn)
    return changed["n"] > 0


def relabel_row(payload, accordion, from_label, to_label):
    """
    Rewrite one row's `row_description`. The duplicate-key and out-of-bounds cases are about the
    LABEL, not the value, so `mutate` (which edits a cell) cannot reach them.

    Returns True only if a label actually changed - same discipline as `mutate`, because a
    harness that reports success on a no-op is the failure this whole file exists to prevent.
    """
    changed = {"n": 0}

    def fn(title, row):
        if title != accordion:
            return
        rd = str(row.get("row_description", ""))
        label = re.sub(r"<[^>]+>", "", rd).replace("Row :: ", "").strip()
        if label != from_label:
            return
        new_rd = rd.replace(from_label, to_label)
        if new_rd == rd:
            return
        row["row_description"] = new_rd
        changed["n"] += 1

    walk_rows(payload, fn)
    return changed["n"] > 0


def write_body(html, start, end, payload, path):
    with open(path, "w", encoding="utf-8") as fh:
        fh.write(html[:start] + json.dumps(payload) + html[end:])


def run_extractor(path):
    """Langston r5 condition 1: keep stderr — a FAIL used to print no diagnostic at all."""
    proc = subprocess.run([sys.executable, EXTRACTOR, "--file", path],
                          capture_output=True, text=True)
    return proc.returncode, (proc.stdout or "") + (proc.stderr or "")


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--file", help="a saved body; omitted means fetch")
    args = ap.parse_args()

    if args.file:
        html = open(args.file, encoding="utf-8", errors="replace").read()
    else:
        sys.path.insert(0, HERE)
        from kraken_fee_ladder_extract import fetch, URL
        html = fetch(URL)
    print("source bytes: %d" % len(html))

    tmp = tempfile.mkdtemp(prefix="kfw-mut-")
    results = []

    # CASE 0 — baseline. The unmutated body must report no change.
    base = os.path.join(tmp, "clean.html")
    with open(base, "w", encoding="utf-8") as fh:
        fh.write(html)
    code, _ = run_extractor(base)
    results.append(("baseline, unmutated", EXIT_NO_CHANGE, code))

    start, end, _ = slice_payload(html)

    # CASE 1 — a TIERED rung in the pinned ladder moves.
    _, _, p1 = slice_payload(html)
    applied = mutate(p1, "Spot Crypto", "Tier 3", 4, "<p>0.23 %</p>")
    if not applied:
        print("HARNESS FAULT: case 1 mutation did not change any cell — aborting, "
              "because an unmutated body exiting 0 would read as a pass")
        return EXIT_HARNESS_FAULT
    f1 = os.path.join(tmp, "mut_tier.html")
    write_body(html, start, end, p1, f1)
    code, out = run_extractor(f1)
    # finding 1 (Langston r6): assert the OUTPUT, not just the status — OBJ-1's verify says
    # "the altered rung and only that rung", which exit-status-only never exercised.
    results.append(("tiered rung moved (Spot Crypto Tier 3)", EXIT_DRIFT, code))
    results.append(("  ^ output names rung 3", 1, says(out, "at [3]")))

    # CASE 2 — the xStock BANDED base rate moves.
    _, _, p2 = slice_payload(html)
    applied = mutate(p2, "Pro xStocks", "$0 +", 1, "-0.03%")
    if not applied:
        print("HARNESS FAULT: case 2 mutation did not change any cell — aborting")
        return EXIT_HARNESS_FAULT
    f2 = os.path.join(tmp, "mut_band.html")
    write_body(html, start, end, p2, f2)
    code, _ = run_extractor(f2)
    results.append(("xStock band moved (Pro xStocks $0 +)", EXIT_DRIFT, code))

    # CASE 3 — a column name that resolves to neither spot nor futures (FINDING-A: this branch
    # is unreachable on the live page, so it needs a fixture or it is a no-op in the evidence).
    _, _, p3 = slice_payload(html)
    applied = mutate(p3, "Spot Crypto", "Tier", 4, "<p>Maker (%)</p>")
    if not applied:
        print("HARNESS FAULT: case 3 mutation did not change any cell — aborting")
        return EXIT_HARNESS_FAULT
    f3 = os.path.join(tmp, "mut_col.html")
    write_body(html, start, end, p3, f3)
    code, _ = run_extractor(f3)
    results.append(("column names a leg but neither spot nor futures", EXIT_MEASUREMENT_FAILED, code))

    # CASE 4 — EVERY control-satisfying ladder moves at Tier 1. Langston ran exactly this at r6
    # and got exit 3 with "DRIFT ... at [1]": a TOTAL EXTRACTION FAILURE reported as a venue
    # finding, because the control re-read REFERENCE_LADDER[1] and ran after the reporting.
    # It must now stop at the control, print CONTROL FAILED, and say nothing about drift.
    _, _, p4 = slice_payload(html)
    hit = 0
    for acc, idx in (("Cross-platform Fee Tiers", 4), ("Spot Crypto", 4), ("Futures", 6)):
        if mutate(p4, acc, "Tier 1", idx, "<p>0.41 %</p>"):
            hit += 1
    if hit != 3:
        print("HARNESS FAULT: case 4 moved %d of 3 control ladders — aborting" % hit)
        return EXIT_HARNESS_FAULT
    f4 = os.path.join(tmp, "mut_control.html")
    write_body(html, start, end, p4, f4)
    code, out = run_extractor(f4)
    results.append(("BLOCKER-1: all control ladders moved", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says CONTROL FAILED", 1, says(out, "CONTROL FAILED")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 5 — an unparseable rate in the xStock band. A U+2212 minus is the honest trigger, but
    # the likelier one is mundane: band keys already carry footnote markers ('$100,000,000 + **'),
    # so the day '$0 +' gains one, the exact-string lookup returns None. Either way it must FAIL
    # LOUD, never be skipped into a false DRIFT.
    _, _, p5 = slice_payload(html)
    if not mutate(p5, "Pro xStocks", "$0 +", 1, "−0.02%"):
        print("HARNESS FAULT: case 5 mutation did not change any cell — aborting")
        return EXIT_HARNESS_FAULT
    f5 = os.path.join(tmp, "mut_unparseable.html")
    write_body(html, start, end, p5, f5)
    code, out = run_extractor(f5)
    results.append(("BLOCKER-2: unparseable band rate", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says MEASUREMENT FAILED", 1, says(out, "MEASUREMENT FAILED")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 6 — a SECOND table bearing the pinned title, whose rows do not parse as rungs. Langston
    # injected this at r6 and the run still printed "identity: resolved to exactly one table" and
    # exited 0, because identity counted SURVIVING ladders rather than titles in the payload.
    _, _, p6 = slice_payload(html)
    if not inject_duplicate_accordion(p6, "Spot Crypto"):
        print("HARNESS FAULT: case 6 injected no accordion — aborting")
        return EXIT_HARNESS_FAULT
    f6 = os.path.join(tmp, "mut_twin.html")
    write_body(html, start, end, p6, f6)
    code, out = run_extractor(f6)
    results.append(("BLOCKER-3: twin table bears the pin title", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says GOVERNING-TABLE-IN-DOUBT", 1, says(out, "GOVERNING-TABLE-IN-DOUBT")))
    results.append(("  ^ does NOT claim exactly one table", 1,
                    0 if "resolved to exactly one table" in out else 1))

    # CASE 7 - DUPLICATE RUNG KEY. The scope says the `!= 17` check is structurally blind to this
    # class, which makes this harness its SOLE detector, and an undetected detector defect is
    # silent forever. Relabelling Tier 2 -> Tier 1 keeps the row count at 17 and collides the key.
    _, _, p7 = slice_payload(html)
    if not relabel_row(p7, "Spot Crypto", "Tier 2", "Tier 1"):
        print("HARNESS FAULT: case 7 relabel changed nothing - aborting")
        return EXIT_HARNESS_FAULT
    f7 = os.path.join(tmp, "mut_duprung.html")
    write_body(html, start, end, p7, f7)
    code, out = run_extractor(f7)
    results.append(("SOLE-DETECTOR: duplicate rung key", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ names the duplicate", 1, says(out, "duplicate rung key")))

    # CASE 8 - DUPLICATE BAND LABEL, the same class on the banded side.
    _, _, p8 = slice_payload(html)
    if not relabel_row(p8, "Pro xStocks", "$100,000,000 + **", "$0 +"):
        print("HARNESS FAULT: case 8 relabel changed nothing - aborting")
        return EXIT_HARNESS_FAULT
    f8 = os.path.join(tmp, "mut_dupband.html")
    write_body(html, start, end, p8, f8)
    code, out = run_extractor(f8)
    results.append(("SOLE-DETECTOR: duplicate band label", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ names the duplicate", 1, says(out, "duplicate band")))

    # CASE 9 - BLOCKER-4, on a NON-PINNED ladder. `ROW_RE` is bounded at Tier 12, so `Tier 13`
    # is not a rung. It used to be silently dropped; on a non-pinned ladder there is no count
    # invariant, so the match fell to 16/17 and the profile assertion returned 3 - a parse
    # omission reported as measured venue drift.
    _, _, p9 = slice_payload(html)
    if not relabel_row(p9, "Cross-platform Fee Tiers", "Tier 12", "Tier 13"):
        print("HARNESS FAULT: case 9 relabel changed nothing - aborting")
        return EXIT_HARNESS_FAULT
    f9 = os.path.join(tmp, "mut_rowlabel.html")
    write_body(html, start, end, p9, f9)
    code, out = run_extractor(f9)
    results.append(("BLOCKER-4: row label out of bounds, non-pinned", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ names the label", 1, says(out, "unrecognised row label")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 10 - BLOCKER-5. A renamed banded column used to return None, deleting the whole
    # schedule from the report with NO status change. The schedule must not be able to vanish.
    _, _, p10 = slice_payload(html)
    if not mutate(p10, "USDG Pairs", "add here", 1, "Mkr"):
        print("HARNESS FAULT: case 10 mutation did not change any cell - aborting")
        return EXIT_HARNESS_FAULT
    f10 = os.path.join(tmp, "mut_bandcol.html")
    write_body(html, start, end, p10, f10)
    code, out = run_extractor(f10)
    results.append(("BLOCKER-5: renamed banded column", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says MEASUREMENT FAILED", 1, says(out, "MEASUREMENT FAILED")))
    results.append(("  ^ schedule did NOT silently vanish", 1, 0 if "DRIFT" in out else 1))

    # CASE 11 - rename the VOLUME column. The table stops looking like a rate schedule and drops
    # out of the parse entirely, so the raise in CASE 10 cannot fire. This proves the second
    # layer: the EXPECTED_BANDED census assertion catches the disappearance as a missing title.
    # Written because the first BLOCKER-5 fix raised on `Margin` and broke the live page - the
    # discriminator and the census have to cover each other, and that is a claim worth testing.
    _, _, p11 = slice_payload(html)
    if not mutate(p11, "USDe Pairs", "add here", 0, "Band"):
        print("HARNESS FAULT: case 11 mutation did not change any cell - aborting")
        return EXIT_HARNESS_FAULT
    f11 = os.path.join(tmp, "mut_volcol.html")
    write_body(html, start, end, p11, f11)
    code, out = run_extractor(f11)
    results.append(("BLOCKER-5 layer 2: volume column renamed", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ census names the missing schedule", 1, says(out, "banded census changed")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 12 - a DELETED rung row. This is the only remaining route to the `!= 17` rung-count
    # input: BLOCKER-4 raises on a RELABELLED row before any count is taken, so without a
    # deletion that input would have no exercising case and would ship on assertion alone.
    _, _, p12 = slice_payload(html)
    if not drop_row(p12, "Spot Crypto", "Tier 7"):
        print("HARNESS FAULT: case 12 dropped no row - aborting")
        return EXIT_HARNESS_FAULT
    f12 = os.path.join(tmp, "mut_droprung.html")
    write_body(html, start, end, p12, f12)
    code, out = run_extractor(f12)
    results.append(("rung count != 17 (deleted rung)", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 13 - the pinned title resolving to ZERO. NOTE HONESTLY WHICH GUARD FIRES: renaming the
    # accordion also changes the ladder census, and that assertion runs first and is strictly
    # more informative. So this exercises the zero-resolution condition end-to-end, via the
    # census rather than via GOVERNING-TABLE-IN-DOUBT. Recorded rather than tuned, because
    # reordering guards to make a case hit a preferred message is how a test starts lying.
    _, _, p13 = slice_payload(html)
    if not rename_accordion(p13, "Spot Crypto", "Spot Crypto Legacy"):
        print("HARNESS FAULT: case 13 renamed no accordion - aborting")
        return EXIT_HARNESS_FAULT
    f13 = os.path.join(tmp, "mut_title0.html")
    write_body(html, start, end, p13, f13)
    code, out = run_extractor(f13)
    results.append(("pinned title resolves to ZERO", EXIT_MEASUREMENT_FAILED, code))
    # r10: the eight-title identity loop now fires FIRST here and is strictly MORE precise
    # than the census message this used to assert. The GUARD improved, so the assertion
    # follows the guard - the opposite direction from tuning a guard to match a test.
    results.append(("  ^ names the identity failure", 1, says(out, "GOVERNING-TABLE-IN-DOUBT")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 14 - BLOCKER-6 on the SECOND PIN. A footnote marker on `$0 +` used to make
    # `.get()` return None, which compared unequal to the contract and printed
    # "DRIFT: the xStock base band no longer matches the deployed contract" - with the words
    # MEASUREMENT FAILED nowhere in the output. This is not a hypothetical: the page already
    # labels the same logical band `$100,000,000 +` and `$100,000,000 + **` on one fetch.
    _, _, p14 = slice_payload(html)
    if not relabel_row(p14, "Pro xStocks", "$0 +", "$0 + *"):
        print("HARNESS FAULT: case 14 relabel changed nothing - aborting")
        return EXIT_HARNESS_FAULT
    f14 = os.path.join(tmp, "mut_baseband_x.html")
    write_body(html, start, end, p14, f14)
    code, out = run_extractor(f14)
    results.append(("BLOCKER-6: base band renamed (second pin)", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says MEASUREMENT FAILED", 1, says(out, "MEASUREMENT FAILED")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 15 - the same guard on a NON-PINNED schedule, which took the other of the two routes
    # Langston measured ("reads None" in the banded profile comparison).
    _, _, p15 = slice_payload(html)
    if not relabel_row(p15, "USDG Pairs", "$0 +", "$0 + *"):
        print("HARNESS FAULT: case 15 relabel changed nothing - aborting")
        return EXIT_HARNESS_FAULT
    f15 = os.path.join(tmp, "mut_baseband_g.html")
    write_body(html, start, end, p15, f15)
    code, out = run_extractor(f15)
    results.append(("BLOCKER-6: base band renamed (non-pinned)", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ names the label change", 1, says(out, "band labels changed")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 16 - BLOCKER-7a. My own measurement said `Tier` is the ONLY sentinel; the code I wrote
    # from it treated EMPTY as one too. Blanking a label used to exit 3 reading 16/17.
    _, _, p16 = slice_payload(html)
    if not blank_row_label(p16, "Cross-platform Fee Tiers", "Tier 12"):
        print("HARNESS FAULT: case 16 blanked no label - aborting")
        return EXIT_HARNESS_FAULT
    f16 = os.path.join(tmp, "mut_blanklabel.html")
    write_body(html, start, end, p16, f16)
    code, out = run_extractor(f16)
    results.append(("BLOCKER-7a: row label blanked", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 17 - BLOCKER-7b. A short row was skipped, landing on the same false DRIFT.
    _, _, p17 = slice_payload(html)
    if not truncate_row_cells(p17, "Cross-platform Fee Tiers", "Tier 9", 2):
        print("HARNESS FAULT: case 17 truncated no row - aborting")
        return EXIT_HARNESS_FAULT
    f17 = os.path.join(tmp, "mut_shortrow.html")
    write_body(html, start, end, p17, f17)
    code, out = run_extractor(f17)
    results.append(("BLOCKER-7b: short row", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 18 - a duplicate NON-PINNED TIERED title. CASE 6's fixture is the PINNED case and does
    # not reach the new loop, which is exactly why Langston asked for a non-pinned one: the pins
    # already had a raw-count arm, the other six titles had none.
    _, _, p18 = slice_payload(html)
    if not inject_duplicate_accordion(p18, "Cross-platform Fee Tiers"):
        print("HARNESS FAULT: case 18 injected no accordion - aborting")
        return EXIT_HARNESS_FAULT
    f18 = os.path.join(tmp, "mut_dup_tiered.html")
    write_body(html, start, end, p18, f18)
    code, out = run_extractor(f18)
    results.append(("duplicate NON-PINNED tiered title", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says GOVERNING-TABLE-IN-DOUBT", 1, says(out, "GOVERNING-TABLE-IN-DOUBT")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    # CASE 19 - a duplicate NON-PINNED BANDED title. This one is the sharper half: the twin
    # PARSES cleanly (no `Tier` header to blunt), so both land in `banded` and `seen_banded`
    # silently keeps the last. Set-equality passes. Without the loop the run exits 0 having
    # measured one of two tables and named neither.
    _, _, p19 = slice_payload(html)
    if not inject_duplicate_accordion(p19, "USDG Pairs"):
        print("HARNESS FAULT: case 19 injected no accordion - aborting")
        return EXIT_HARNESS_FAULT
    f19 = os.path.join(tmp, "mut_dup_banded.html")
    write_body(html, start, end, p19, f19)
    code, out = run_extractor(f19)
    results.append(("duplicate NON-PINNED banded title", EXIT_MEASUREMENT_FAILED, code))
    results.append(("  ^ says GOVERNING-TABLE-IN-DOUBT", 1, says(out, "GOVERNING-TABLE-IN-DOUBT")))
    results.append(("  ^ and does NOT report drift", 1, 0 if "DRIFT" in out else 1))

    print("")
    print("%-52s %-10s %-8s %s" % ("case", "expected", "actual", "verdict"))
    ok = True
    for label, want, got in results:
        good = want == got
        ok = ok and good
        print("%-52s %-10d %-8d %s" % (label[:52], want, got, "PASS" if good else "FAIL"))

    print("")
    print("ALL CASES PASS" if ok else "AT LEAST ONE CASE FAILED")
    return 0 if ok else 1


if __name__ == "__main__":
    sys.exit(main())
