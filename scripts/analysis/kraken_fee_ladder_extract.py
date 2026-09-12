#!/usr/bin/env python3
"""
B-KRAKEN-FEE-WATCH (#1011) — extract Kraken's published fee ladders from the live page.

WHY THIS IS A FILE. Six inline attempts failed four different ways (forward windows crossing
table boundaries, a backward scan returning zero, an attachment rule that collapsed four ladders
into two, a shell-mangled backslash, a payload finder looking at the wrong script type). All were
properties of scanning a 1.4 MB string with offsets and quoting. This parses JSON as JSON.

WHERE THE DATA IS (measured): a plain <script> assigns `window.__INITIAL_PROPS__={...}`, a
Sanity-style tree. Fee tables are `_type: "paragraphArticleBodyTable"` with `field_rows`; each row
carries `field_cells` and a `row_description` ("Row :: Tier 1", or "Row :: Tier" for the header).
Each table sits under a `paragraphAccordionItem` whose `field_title` NAMES it — and that title is
the ONLY thing distinguishing three ladders with byte-identical header rows.

THE FOUR LADDERS, measured 2026-09-12 (Langston re-derived all of it independently):
  Cross-platform Fee Tiers  Tier 1 0.40/0.80   17/17 vs reference §1
  Spot Crypto               Tier 1 0.40/0.80   17/17   <-- PINNED: the product the ladder governs
  Spot Maker Rebate         Tier 1 0.38/0.80   0/17, maker delta {-0.02} on every rung
  Futures                   Tier 1 futures 0.02/0.05, SPOT 0.40/0.80 (8 cols; spot at 6/7)
`Margin` holds a 113-row Currency/Opening fee/Rollover fee table and NO ladder.

THE PAGE PUBLISHES TWO TABLE SHAPES, AND READING ONLY THE FIRST IS WHAT HID THE xSTOCK RATES:
  TIERED  header row labelled `Tier`, rows `Tier 1..12` / `Pro 1..5`, columns name their leg
          (`Spot Maker (%)`). The four ladders above.
  BANDED  header row labelled `add here`, columns `30- Day Volume (USD) | Maker | Taker`, rows
          labelled by the band itself (`$0 +`, `$100,000,000 + **`). FOUR of these:
            Pro xStocks                     $0+  maker -0.02%  taker 0.10%   <-- OUR xSTOCK CONTRACT
            Stablecoin, Pegged Token & FX   $0+  maker  0.20%  taker 0.20%
            USDG Pairs                      $0+  maker  0.00%  taker 0.01%
            USDe Pairs                      $0+  maker  0.00%  taker 0.00%
            (Spot Maker Rebate's own eligible-pair list is NOT on this page)
⛔ `fee_model` holds ONE rate per asset class and cannot express any of these.

⛔ THE ANCHOR: enclosing accordion title (pinned), then column NAME -> index within that table,
then row LABEL -> rung. Never a percentage regex, never a fixed index, never proximity.
⛔ THE CONTROL: a ladder must read Tier 1 == (0.40, 0.80). On failure this reports NOTHING.
"""

import argparse
import json
import re
import sys
import urllib.request

# Finding 7 (r7): a cp1252 console raised UnicodeEncodeError mid-report and killed the run with a
# traceback AFTER the control had passed -- exit 1, which is in none of the three declared
# statuses. Force the stream instead of policing glyphs: a sweep misses the next one added.
for _s in (sys.stdout, sys.stderr):
    try:
        _s.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass


URL = "https://www.kraken.com/features/fee-schedule"
UA = "Mozilla/5.0 (compatible; DawnTrader-fee-watch/0.1)"
ASSIGN = "window.__INITIAL_PROPS__="
PINNED_HEADING = "Spot Crypto"

# ⛔ BLOCKER-1 (Langston r6): the control must NOT re-read the thing it is meant to be
# independent of. REFERENCE_LADDER[1] is what the drift check compares against, so using it as
# the control made `CONTROL FAILED` unreachable: any body that got past `if bad: return 3` had
# already proved rung 1 matched. This constant is written out separately and deliberately.
CONTROL_RUNG1 = (0.40, 0.80)   # the account's rung-1 pair, independently transcribed (§0.b)
CONTROL_MIN_LADDERS = 1

# ⚠️ A SECOND COPY of KRAKEN_FEE_SCHEDULE_REFERENCE.md §1 (Langston, r3 defect (c)). Verified
# equal to §1 on all 17 rungs at 2026-09-12. OBJ-3 grades the PAGE against this dict, so a
# corrected §1 with a stale dict would report no drift — OBJ-3's verify carries a fixture that
# edits §1 and must fail. Parsing §1 directly is the standing fix.
REFERENCE_LADDER = {
    1: (0.40, 0.80), 2: (0.30, 0.60), 3: (0.22, 0.38), 4: (0.20, 0.35), 5: (0.15, 0.30),
    6: (0.12, 0.25), 7: (0.10, 0.22), 8: (0.08, 0.20), 9: (0.06, 0.18), 10: (0.04, 0.15),
    11: (0.02, 0.12), 12: (0.00, 0.10), 13: (0.00, 0.09), 14: (0.00, 0.08), 15: (0.00, 0.07),
    16: (0.00, 0.06), 17: (0.00, 0.05),
}

# Finding 2 (Langston r6): OBJ-8's vector was printed and never asserted, under a heading that
# said "asserted". MEASURED on a clean run 2026-09-12 -- this is the whole ladder census, so a
# ladder appearing, vanishing or changing profile is caught, which is what makes a WRONG PIN
# loud instead of silent forever.
# (match, maker_deltas, taker_deltas). MEASURED 2026-09-12.
# Langston r7 (a): deltas were maker-only, so a TAKER-only revision to a 0/17 ladder such as
# `Spot Maker Rebate` was unasserted - it already matches 0/17 on makers, so nothing moved.
EXPECTED_MATCH = {
    "Cross-platform Fee Tiers": ("17/17", [0.0], [0.0]),
    "Spot Crypto":              ("17/17", [0.0], [0.0]),
    "Spot Maker Rebate":        ("0/17",  [-0.02], [0.0]),
    "Futures":                  ("17/17", [0.0], [0.0]),
}

# BLOCKER-5 (Langston r7): the banded half of the census was PRINTED and never asserted -
# finding 2 was fixed on the tiered half only. This is the surface where the unknowns keep
# turning up: the second `Pro xStocks` band found on 2026-09-12, and the FX schedule reading
# 0.20/0.20 against the 0.80 we model. MEASURED 2026-09-12.
EXPECTED_BANDED = {
    "Stablecoin, Pegged Token & FX Pairs": (0.20, 0.20),
    "USDG Pairs":                          (0.00, 0.01),
    "USDe Pairs":                          (0.00, 0.00),
    "Pro xStocks":                         (-0.02, 0.10),
}
XPIN_TITLE = "Pro xStocks"   # the second pin; hoisted so the banded assertion can defer to it
BASE_BAND = "$0 +"

# BLOCKER-6 (Langston r9): the band-LABEL SET per schedule. The tiered side has a count invariant
# (18 rows = header + 17 rungs); the banded side has NONE - which is how a 6-of-7 coverage count
# could be honest and still miss a renamed label entirely.
# ASSERTED AS SETS, NOT COUNTS, deliberately: a count reproduces exactly the blindness the `!= 17`
# check has to a duplicate, which is the defect two rounds of this batch were spent removing.
# MEASURED at the ref 2026-09-12 - and note `Stablecoin` carries `$100,000,000 +` while `USDG
# Pairs` and `Pro xStocks` carry `$100,000,000 + **`: the same logical band, labelled two ways, on
# one page, today. That is the live evidence that a footnote marker on `$0 +` is a when, not an if.
EXPECTED_BAND_LABELS = {
    "Stablecoin, Pegged Token & FX Pairs": {
        "$0 +", "$50,000 +", "$100,000 +", "$250,000 +", "$500,000 +",
        "$1,000,000 +", "$10,000,000 +", "$100,000,000 +",
    },
    "USDG Pairs":  {"$0 +", "$100,000,000 + **"},
    "USDe Pairs":  {"$0 +"},
    "Pro xStocks": {"$0 +", "$100,000,000 + **"},
}

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?$")
# BOUNDED (Langston r3 defect (a)): the page labels rungs Tier 1-12 then Pro 1-5. `Tier 99` is
# not a rung, and leaning on a count of 17 cannot see a duplicate that keeps the count right.
ROW_RE = re.compile(r"^(?:Tier ([1-9]|1[0-2])|Pro ([1-5]))$")
# Discriminates a banded RATE schedule from any other `add here` table (see banded_from).
VOLUME_AXIS_RE = re.compile(r"volume", re.I)


class Fail(Exception):
    """MEASUREMENT FAILED — raised, never swallowed, never coerced to a number."""


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def text_of(value):
    s = TAG_RE.sub("", str(value if value is not None else ""))
    for a, b in (("&nbsp;", " "), ("&lt;", "<"), ("&gt;", ">"), ("&amp;", "&"), (" ", " ")):
        s = s.replace(a, b)
    return WS_RE.sub(" ", s).strip()


def rate_of(value):
    s = text_of(value).replace("%", "").replace(" ", "")
    return float(s) if NUM_RE.match(s) else None


def extract_payload(html):
    a = html.find(ASSIGN)
    if a == -1:
        raise Fail("assignment %r not found" % ASSIGN)
    start = html.find("{", a)
    if start == -1:
        raise Fail("no opening brace after the assignment")
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
                try:
                    return json.loads(html[start:i + 1])
                except Exception as exc:
                    raise Fail("balanced slice failed to parse: %s" % exc)
    raise Fail("unbalanced object from offset %d" % start)


def collect_tables(node, out, title="(none)"):
    """Walk with an ANCESTOR TRAIL so each table carries its accordion title."""
    if isinstance(node, dict):
        if node.get("_type") == "paragraphAccordionItem":
            title = text_of(node.get("field_title")) or title
        if node.get("_type") == "paragraphArticleBodyTable" and isinstance(node.get("field_rows"), list):
            rows = []
            for r in node["field_rows"]:
                if not isinstance(r, dict):
                    continue
                label = text_of(r.get("row_description", "")).replace("Row :: ", "").strip()
                cells = [text_of(c.get("field_content")) for c in r.get("field_cells", []) if isinstance(c, dict)]
                rows.append((label, cells))
            if rows:
                out.append((title, rows))
        for v in node.values():
            collect_tables(v, out, title)
    elif isinstance(node, list):
        for v in node:
            collect_tables(v, out, title)


def resolve_columns(header):
    """
    STRICT (Langston r3 defect (b)): a column is spot or futures because it SAYS so. There is no
    default-to-spot arm, so OBJ-5's "a column name that does not resolve" can actually fire.
    """
    cols = {}
    for idx, name in enumerate(header):
        n = name.lower()
        if "maker" not in n and "taker" not in n:
            continue
        leg = "maker" if "maker" in n else "taker"
        if "futures" in n:
            cols.setdefault("%s_futures" % leg, idx)
        elif "spot" in n:
            cols.setdefault("%s_spot" % leg, idx)
        else:
            raise Fail("column %r names a %s leg but neither spot nor futures" % (name, leg))
    return cols


def banded_from(title, rows):
    """
    BANDED tables (Langston r4 BLOCKER): header labelled `add here`, columns
    `30- Day Volume (USD) | Maker | Taker`, rows labelled by the volume band. `Pro xStocks` is
    one of these — which is why an extractor that only understood `Tier` headers reported that
    no machine source for the xStock rates existed.
    """
    header = next((cells for label, cells in rows if label == "add here"), None)
    if header is None:
        return None
    idx = {}
    for i, name in enumerate(header):
        n = name.lower()
        if n == "maker":
            idx["maker"] = i
        elif n == "taker":
            idx["taker"] = i
    # BLOCKER-5 (Langston r7): this returned None, so a RENAMED COLUMN deleted an entire
    # schedule from the report with NO STATUS CHANGE.
    # BUT THE FIRST VERSION OF THIS FIX BROKE THE CLEAN PAGE, and the harness caught it: `Margin`
    # also carries an `add here` header (113 rows of Currency/Opening fee/Rollover fee), so
    # raising on every unresolved maker/taker made the LIVE run exit 2. A guard that fires on a
    # legitimate non-member is as wrong as one that cannot fire.
    # MEASURED 2026-09-12 - what makes a table a banded RATE schedule is its VOLUME-BAND AXIS:
    #   Stablecoin / USDG / USDe / Pro xStocks -> cell 0 == `30- Day Volume (USD)`
    #   Margin                                 -> cell 0 == `Currency`
    if not header or not VOLUME_AXIS_RE.search(text_of(header[0])):
        return None          # not a rate schedule at all (Margin) - correctly skipped
    # Past here the table IS a rate schedule, so an unresolvable leg column is a MEASUREMENT
    # FAILURE. If the VOLUME column itself is renamed the table drops out of the parse instead -
    # and the EXPECTED_BANDED census assertion catches that as a missing title (CASE 11).
    if "maker" not in idx or "taker" not in idx:
        raise Fail("banded rate schedule %r has a volume axis but no resolvable maker/taker "
                   "column (header reads %r)" % (title, header))
    bands = {}
    for label, cells in rows:
        if label == "add here":
            continue
        # BLOCKER-7 (Langston r9), banded side. MEASURED at the ref: Stablecoin 9 rows / 8 bands,
        # USDG 3/2, USDe 2/1, Pro xStocks 3/2 - EVERY non-header row IS a band, so an empty label
        # is a parse failure, never a spacer.
        if not label:
            raise Fail("empty band label in %r - every non-header row on this page is a band"
                       % title)
        mi, ti = idx["maker"], idx["taker"]
        if mi >= len(cells) or ti >= len(cells):
            raise Fail("short row %r in banded %r: %d cells, need indices %d and %d"
                       % (label, title, len(cells), mi, ti))
        maker, taker = rate_of(cells[mi]), rate_of(cells[ti])
        if maker is None or taker is None:
            raise Fail("unparseable rate in banded %r row %r: maker=%r taker=%r"
                       % (title, label, cells[mi], cells[ti]))
        if label in bands:
            raise Fail("duplicate band %r in %r" % (label, title))
        bands[label] = (maker, taker)
    return {"title": title, "kind": "banded", "header": header, "bands": bands}


def titles_in(raw, wanted):
    """
    ⛔ BLOCKER-3 (Langston r6): identity must count tables BEARING THE TITLE in the raw payload,
    never rows that survived parsing. He injected a second `Spot Crypto` whose cells do not parse
    and the run still said "resolved to exactly one table" and exited 0 — the enumerator was blind
    to a member class (#753). Counting `raw` makes an unparseable twin visible.
    """
    return [t for t, _rows in raw if t == wanted]


def ladder_from(title, rows):
    header = next((cells for label, cells in rows if label == "Tier"), None)
    if header is None:
        return None
    # FIND-A (Langston r4): resolve_columns must be reachable. It is called here only for TIERED
    # tables by construction.
    # CORRECTED (Langston r7 BLOCKER-5): this comment used to assert that "the banded reader
    # above has its own strict resolution". IT DID NOT - it was exact-match-or-return-None, so a
    # renamed column silently deleted a schedule. Third comment-certifying-an-absent-guard in
    # this batch's lineage (#1000, and r6's own "(asserted for ALL ladders)" heading). The
    # banded reader raises now, so the claim is true - but it was written before it was.
    cols = resolve_columns(header)
    if "maker_spot" not in cols or "taker_spot" not in cols:
        return None
    mi, ti = cols["maker_spot"], cols["taker_spot"]
    rungs = {}
    for label, cells in rows:
        m = ROW_RE.match(label)
        if not m:
            # BLOCKER-4 (Langston r7): this was a silent `continue`, and it is BLOCKER-2 one
            # reader over. `ROW_RE` is bounded, so `Tier 13` was DROPPED rather than raised. On
            # the pin that surfaces as `!= 17` - right status, wrong operand. On any NON-PINNED
            # ladder there is no count invariant: the match falls to 16/17, the deltas skip the
            # absent rung, and the profile assertion fires => exit 3. A parse omission reported
            # as measured venue drift. MEASURED: every ladder table is 18 rows - the `Tier`
            # header plus exactly 17 rungs - so `Tier` is the ONLY sentinel.
            # BLOCKER-7 (Langston r9): this read `if label and label != "Tier"`, i.e. "`Tier`
            # OR EMPTY is a sentinel" - while MY OWN MEASUREMENT, written three lines up, says
            # `Tier` is the ONLY sentinel (0 empty-labelled rows across all 9 tables). The code
            # contradicted the measurement it was written from. Blanking a label exited 3 with
            # 16/17; it now raises. `enumerator-blind-spot`, my own filed pattern.
            if label != "Tier":
                raise Fail("unrecognised row label %r in %r - neither the `Tier` header nor a "
                           "rung in Tier 1-12 / Pro 1-5" % (label, title))
            continue
        rung = int(m.group(1)) if m.group(1) else 12 + int(m.group(2))
        if rung in rungs:
            raise Fail("duplicate rung key %d in %r" % (rung, title))   # defect (a)
        # BLOCKER-7 (Langston r9): a SHORT ROW was silently skipped here, landing on the same
        # false DRIFT as every other silent drop. Measured by him: truncate a row's cells -> 3.
        if mi >= len(cells) or ti >= len(cells):
            raise Fail("short row in %r rung %d: %d cells, need indices %d and %d"
                       % (title, rung, len(cells), mi, ti))
        maker, taker = rate_of(cells[mi]), rate_of(cells[ti])
        # ⛔ BLOCKER-2 (Langston r6): an unparseable cell used to be SKIPPED. OBJ-5 names it a
        # fail-loud input; skipping routed it to the wrong outcome — on the banded side, which
        # has no count invariant, a dropped row surfaced as measured DRIFT.
        if maker is None or taker is None:
            raise Fail("unparseable rate in %r rung %d: maker=%r taker=%r"
                       % (title, rung, cells[mi], cells[ti]))
        rungs[rung] = (maker, taker)
    return {"title": title, "header": header, "columns": cols, "rungs": rungs}


def match_vector(ladders):
    """FINDING-1 (Langston): assert ALL FOUR ladders, not only the pinned one. With three tables
    indistinguishable by header and two by value, a wrong pin is otherwise silent forever."""
    out = {}
    for lad in ladders:
        r = lad["rungs"]
        hits = sum(1 for k in REFERENCE_LADDER if r.get(k) == REFERENCE_LADDER[k])
        mk = sorted({round(r[k][0] - REFERENCE_LADDER[k][0], 4) for k in REFERENCE_LADDER if k in r})
        tk = sorted({round(r[k][1] - REFERENCE_LADDER[k][1], 4) for k in REFERENCE_LADDER if k in r})
        out[lad["title"]] = {"match": "%d/%d" % (hits, len(REFERENCE_LADDER)),
                             "maker_deltas": mk, "taker_deltas": tk}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=URL)
    ap.add_argument("--file", help="parse a saved body instead of fetching (mutation tests)")
    # ⛔ finding 5 (Langston r6): the pin is the value three revisions established must never be
    # a runtime selection. It is settable ONLY in --file fixture mode, never against the live page.
    ap.add_argument("--pin", default=PINNED_HEADING,
                    help="fixture mode only; refused without --file")
    args = ap.parse_args()

    try:
        if args.pin != PINNED_HEADING and not args.file:
            raise Fail("--pin is fixture-only; it may not override the pin against the live page")
        html = open(args.file, encoding="utf-8", errors="replace").read() if args.file else fetch(args.url)
        print("source bytes: %d" % len(html))
        payload = extract_payload(html)

        raw = []
        collect_tables(payload, raw)
        print("tables: %d" % len(raw))

        ladders = [l for l in (ladder_from(t, r) for t, r in raw) if l and l["rungs"]]
        banded = [b for b in (banded_from(t, r) for t, r in raw) if b and b["bands"]]

        # ⛔⛔ THE CONTROL RUNS FIRST, BEFORE ANY REPORTING (Langston r6 BLOCKER-1).
        # Previously it ran last and re-read REFERENCE_LADDER[1], so it could not fail: any body
        # reaching it had already passed the drift check. Moving Tier 1 in ALL FOUR ladders used to
        # print `DRIFT ... at [1]` and exit 3 — a TOTAL EXTRACTION FAILURE reported as a venue
        # finding. It now gates the run, against an independent constant.
        control_ok = [l["title"] for l in ladders if l["rungs"].get(1) == CONTROL_RUNG1]
        if len(control_ok) < CONTROL_MIN_LADDERS:
            print("CONTROL FAILED: no ladder reads rung 1 == %s — the extraction is wrong, "
                  "not the venue. Reporting nothing." % (CONTROL_RUNG1,))
            return 2
        print("control: rung 1 == %s satisfied by %s" % (CONTROL_RUNG1, control_ok))

        # ⛔ LANGSTON'S STEP-1 CLEARING CONDITION (r9). Every reported table is keyed by TITLE in
        # a dict - `match_vector` and `seen_banded` both - so a duplicate title collapsed with
        # LAST WRITE WINS while set-equality still passed, and the report was confidently wrong
        # about WHICH of the two it had measured. `titles_in` was wired to only the two pins.
        # This loop subsumes both pins' raw-count arm and closes the CLASS: a clean run can now
        # tell you a duplicate is ABSENT, which is what makes the scope's eight facts verifiable
        # by the instrument that asserted them.
        for t in sorted(set(EXPECTED_MATCH) | set(EXPECTED_BANDED)):
            bearers = titles_in(raw, t)
            if len(bearers) != 1:
                print("   GOVERNING-TABLE-IN-DOUBT: %d tables bear %r in the payload, expected "
                      "exactly 1 - STOPPING, no re-selection" % (len(bearers), t))
                return 2
        print("title identity: all %d expected titles resolve to exactly one table each"
              % len(set(EXPECTED_MATCH) | set(EXPECTED_BANDED)))
        print("tiered ladders: %d | banded schedules: %d" % (len(ladders), len(banded)))
        print("   \u26a0 census caveat (Langston r4): this counts paragraphArticleBodyTable nodes ONLY.")
        print("   Stocks / xStocks / Perps / Pro Stocks carry none, so it is one node type, not")
        print("   the page's rate surfaces.")
        for b in banded:
            # (c) Langston r7: UNTRUNCATED. The %-34s/[:28] truncation is what produced the
            # `FX Pair` misreading - the title is exactly 34 chars - and stdout is now
            # load-bearing for the harness assertions, so a clipped field can hide a mismatch.
            print("   BANDED %-38s %s" % (b["title"], b["bands"].get("$0 +")))

        for lad in ladders:
            r = lad["rungs"]
            hits = sum(1 for k in REFERENCE_LADDER if r.get(k) == REFERENCE_LADDER[k])
            print("   %-30s rungs %2d  Tier1 %-14s %d/17" % (lad["title"], len(r), r.get(1), hits))

        # BLOCKER-5 (Langston r7): ASSERT the banded census too. Census change -> 2
        # (structure); a moved $0 + band -> 3 (venue).
        print("")
        print("=== OBJ-8 banded census (ASSERTED, was print-only) ===")
        # BLOCKER-6 (Langston r9): assert the band-LABEL SET before reading any band. A
        # renamed `$0 +` used to fall through `.get()` as None and exit 3 - a missing label
        # reported as measured venue drift, which is BLOCKER-2's shape a third time.
        for b in banded:
            want = EXPECTED_BAND_LABELS.get(b["title"])
            if want is None:
                continue
            got = set(b["bands"])
            if got != want:
                print("   MEASUREMENT FAILED: band labels changed in %r -- missing %s | "
                      "unexpected %s" % (b["title"], sorted(want - got), sorted(got - want)))
                return 2

        seen_banded = {}
        for b in banded:
            # Belt and braces for any schedule NOT in EXPECTED_BAND_LABELS: an absent base band
            # must never reach a comparison as None.
            if BASE_BAND not in b["bands"]:
                raise Fail("banded %r has no %r row (labels read %s)"
                           % (b["title"], BASE_BAND, sorted(b["bands"])))
            seen_banded[b["title"]] = b["bands"][BASE_BAND]
        for t in sorted(seen_banded):
            print("   %-38s $0 + = %s" % (t, seen_banded[t]))
        if set(seen_banded) != set(EXPECTED_BANDED):
            print("   MEASUREMENT FAILED: banded census changed -- missing %s | unexpected %s"
                  % (sorted(set(EXPECTED_BANDED) - set(seen_banded)),
                     sorted(set(seen_banded) - set(EXPECTED_BANDED))))
            return 2
        # XPIN_TITLE is excluded for the SAME reason the pinned ladder is excluded below: the
        # second-pin block reports it with its operand and units. Asserting it here would preempt
        # the more precise message - the regression the harness caught at r7.
        compared = [t for t in EXPECTED_BANDED if t != XPIN_TITLE]
        bmoved = [t for t in compared if seen_banded[t] != EXPECTED_BANDED[t]]
        if bmoved:
            for t in bmoved:
                print("   DRIFT: banded %r expected %s, reads %s"
                      % (t, EXPECTED_BANDED[t], seen_banded[t]))
            return 3
        # Rider 2 (Langston r9): count the reassurance over the COMPARED set. The old line
        # said "all 4 ... match" on a run where Pro xStocks' band read None - excluded from the
        # comparison and still counted in the total. A reassurance wider than what was checked.
        print("   all %d COMPARED banded schedules match their expected $0 + band "
              "(%r is asserted by the second pin below, not here)"
              % (len(compared), XPIN_TITLE))

        print("")
        print("=== OBJ-8 match vector (ASSERTED for ALL ladders, not merely printed) ===")
        mv = match_vector(ladders)
        for title, v in mv.items():
            print("   %-30s %s  maker %s  taker %s"
                  % (title, v["match"], v["maker_deltas"], v["taker_deltas"]))

        # THE ASSERTION ITSELF. A title set that changed is STRUCTURE (2); a profile that moved
        # while the census is intact is the VENUE (3). Without this the vector was decoration.
        if set(mv) != set(EXPECTED_MATCH):
            print("   MEASUREMENT FAILED: ladder census changed -- missing %s | unexpected %s"
                  % (sorted(set(EXPECTED_MATCH) - set(mv)), sorted(set(mv) - set(EXPECTED_MATCH))))
            return 2
        # The PINNED ladder is deliberately excluded: its rung-level check below names the
        # altered rung and only that rung (OBJ-1), and this coarser message preempted it --
        # measured, by the very harness case that asserts the output rather than the status.
        moved = [t for t in EXPECTED_MATCH
                 if t != args.pin
                 and (mv[t]["match"], mv[t]["maker_deltas"], mv[t]["taker_deltas"])
                 != EXPECTED_MATCH[t]]
        if moved:
            for t in moved:
                print("   DRIFT: %r expected %s, reads (%r, %s, %s)"
                      % (t, EXPECTED_MATCH[t], mv[t]["match"],
                         mv[t]["maker_deltas"], mv[t]["taker_deltas"]))
            return 3
        print("   all %d ladders match their expected profile" % len(mv))

        # THE PIN: identity is verified by the heading resolving to EXACTLY ONE table.
        # The 17-rung check is NECESSARY, NOT SUFFICIENT — three ladders satisfy it.
        bearing = titles_in(raw, args.pin)          # BLOCKER-3: count RAW tables, not survivors
        pinned = [l for l in ladders if l["title"] == args.pin]
        print("")
        print("=== PIN: %r ===" % args.pin)
        if len(bearing) != 1:
            print("   GOVERNING-TABLE-IN-DOUBT: %d tables bear the pinned title in the payload "
                  "(%d parsed) — STOPPING, no re-selection" % (len(bearing), len(pinned)))
            return 2
        if len(pinned) != 1:
            print("   GOVERNING-TABLE-IN-DOUBT: heading resolved to %d tables — STOPPING, no re-selection" % len(pinned))
            return 2
        r = pinned[0]["rungs"]
        if len(r) != 17:
            print("   MEASUREMENT FAILED: pinned ladder has %d rungs, expected 17" % len(r))
            return 2
        bad = [k for k in REFERENCE_LADDER if r.get(k) != REFERENCE_LADDER[k]]
        print("   identity: resolved to exactly one table (necessary AND sufficient for identity)")
        print("   values  : %d/17 vs reference §1%s" % (17 - len(bad), "" if not bad else " — diverges at %s" % bad))
        # FIND-B (Langston r4): a divergent pin used to print and fall through to `return 0`, so
        # MEASURED DRIFT and NO-CHANGE shared an exit status that OBJ-5 reads outcomes from.
        # Three outcomes, three statuses: 0 no-change · 2 MEASUREMENT FAILED · 3 measured drift.
        if bad:
            print("   DRIFT: the pinned ladder no longer matches reference §1 at %s" % bad)
            return 3

        # THE SECOND PIN (Langston r4 BLOCKER): xStock is a table on this same fetch, not a
        # calendar reminder. Its contract is what #1010 deployed.
        # ⚠️ THIRD HARDCODED COPY OF A GOVERNED VALUE (Langston r5 condition 3). §9 confesses
        # REFERENCE_LADDER as the second and never listed this one. §1 says the page-versus-
        # DATABASE leg is the one that earns its keep, and at this ref NEITHER pin reads
        # module_constants. ⛔ STEP-4 OBLIGATION: the shipped watcher reads the DB row as its
        # operand and no literal fee value survives in it.
        # ⚠️ finding 4 (Langston r6): there is no constant named `fee_model` — the DB row is the
        # PK triple (module_name='fee_model', asset_class='xstock_spot', constant_name in
        # {spot_maker_fee, spot_taker_fee}), and the DB stores FRACTIONS (-0.0002 / 0.0010) while
        # the page prints PERCENT (-0.02% / 0.10%). Factor 100, previously unstated. An absent or
        # unconvertible row must exit 2, never 3.
        XPIN, XCONTRACT = XPIN_TITLE, (-0.02, 0.10)   # percent, matching the page
        x_bearing = titles_in(raw, XPIN)            # BLOCKER-3, same shape on the second pin
        xs = [b for b in banded if b["title"] == XPIN]
        if len(x_bearing) != 1:
            print("   GOVERNING-TABLE-IN-DOUBT: %d tables bear %r in the payload (%d parsed) "
                  "- STOPPING" % (len(x_bearing), XPIN, len(xs)))
            return 2
        print("")
        print("=== SECOND PIN: %r ===" % XPIN)
        if len(xs) != 1:
            print("   GOVERNING-TABLE-IN-DOUBT: %r resolved to %d tables - STOPPING" % (XPIN, len(xs)))
            return 2
        # BLOCKER-6, third site (:483 at the reviewed ref). A renamed label here produced
        # `$0 + band: None` and the words `DRIFT: the xStock base band no longer matches the
        # deployed contract` - with `MEASUREMENT FAILED` nowhere in the output.
        if BASE_BAND not in xs[0]["bands"]:
            raise Fail("second pin %r has no %r row (labels read %s)"
                       % (XPIN, BASE_BAND, sorted(xs[0]["bands"])))
        base = xs[0]["bands"][BASE_BAND]
        print("   $0 + band: %s | deployed fee_model contract: %s" % (base, XCONTRACT))
        if base != XCONTRACT:
            print("   DRIFT: the xStock base band no longer matches the deployed contract")
            return 3

        return 0

    except Fail as exc:
        print("MEASUREMENT FAILED: %s" % exc)
        return 2


if __name__ == "__main__":
    sys.exit(main())
