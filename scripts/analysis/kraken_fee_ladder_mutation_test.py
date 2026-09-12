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

⚠️ COVERAGE, STATED (Langston r5 condition 2): these four cases exercise ONE of OBJ-5's seven
fail-loud inputs. The `#744` rider is NOT discharged by "all cases pass" — the uncovered branch
that matters most is DUPLICATE RUNG KEY / DUPLICATE BAND LABEL, because the scope itself says the
rung-count check is structurally blind to that class, making this harness its sole detector.
"""

import argparse
import json
import re
import subprocess
import sys
import tempfile
import os

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
    code, _ = run_extractor(f1)
    results.append(("tiered rung moved (Spot Crypto Tier 3)", EXIT_DRIFT, code))

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
