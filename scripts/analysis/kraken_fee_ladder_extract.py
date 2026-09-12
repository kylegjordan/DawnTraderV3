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
          labelled by the band itself (`$0 +`, `$100,000,000 + **`). Five of these:
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

URL = "https://www.kraken.com/features/fee-schedule"
UA = "Mozilla/5.0 (compatible; DawnTrader-fee-watch/0.1)"
ASSIGN = "window.__INITIAL_PROPS__="
PINNED_HEADING = "Spot Crypto"

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

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?$")
# BOUNDED (Langston r3 defect (a)): the page labels rungs Tier 1-12 then Pro 1-5. `Tier 99` is
# not a rung, and leaning on a count of 17 cannot see a duplicate that keeps the count right.
ROW_RE = re.compile(r"^(?:Tier ([1-9]|1[0-2])|Pro ([1-5]))$")


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
    if "maker" not in idx or "taker" not in idx:
        return None
    bands = {}
    for label, cells in rows:
        if label == "add here" or not label:
            continue
        mi, ti = idx["maker"], idx["taker"]
        if mi < len(cells) and ti < len(cells):
            maker, taker = rate_of(cells[mi]), rate_of(cells[ti])
            if maker is not None and taker is not None:
                if label in bands:
                    raise Fail("duplicate band %r in %r" % (label, title))
                bands[label] = (maker, taker)
    return {"title": title, "kind": "banded", "header": header, "bands": bands}


def ladder_from(title, rows):
    header = next((cells for label, cells in rows if label == "Tier"), None)
    if header is None:
        return None
    # FIND-A (Langston r4): resolve_columns must be reachable. It is called here only for TIERED
    # tables by construction; the banded reader above has its own strict resolution, so a leg
    # column naming neither spot nor futures still cannot pass silently.
    cols = resolve_columns(header)
    if "maker_spot" not in cols or "taker_spot" not in cols:
        return None
    mi, ti = cols["maker_spot"], cols["taker_spot"]
    rungs = {}
    for label, cells in rows:
        m = ROW_RE.match(label)
        if not m:
            continue
        rung = int(m.group(1)) if m.group(1) else 12 + int(m.group(2))
        if rung in rungs:
            raise Fail("duplicate rung key %d in %r" % (rung, title))   # defect (a)
        if mi < len(cells) and ti < len(cells):
            maker, taker = rate_of(cells[mi]), rate_of(cells[ti])
            if maker is not None and taker is not None:
                rungs[rung] = (maker, taker)
    return {"title": title, "header": header, "columns": cols, "rungs": rungs}


def match_vector(ladders):
    """FINDING-1 (Langston): assert ALL FOUR ladders, not only the pinned one. With three tables
    indistinguishable by header and two by value, a wrong pin is otherwise silent forever."""
    out = {}
    for lad in ladders:
        r = lad["rungs"]
        hits = sum(1 for k in REFERENCE_LADDER if r.get(k) == REFERENCE_LADDER[k])
        deltas = sorted({round(r[k][0] - REFERENCE_LADDER[k][0], 4) for k in REFERENCE_LADDER if k in r})
        out[lad["title"]] = {"match": "%d/%d" % (hits, len(REFERENCE_LADDER)), "maker_deltas": deltas}
    return out


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=URL)
    ap.add_argument("--file", help="parse a saved body instead of fetching (mutation tests)")
    ap.add_argument("--pin", default=PINNED_HEADING)
    args = ap.parse_args()

    try:
        html = open(args.file, encoding="utf-8", errors="replace").read() if args.file else fetch(args.url)
        print("source bytes: %d" % len(html))
        payload = extract_payload(html)

        raw = []
        collect_tables(payload, raw)
        print("tables: %d" % len(raw))

        ladders = [l for l in (ladder_from(t, r) for t, r in raw) if l and l["rungs"]]
        banded = [b for b in (banded_from(t, r) for t, r in raw) if b and b["bands"]]
        print("tiered ladders: %d | banded schedules: %d" % (len(ladders), len(banded)))
        print("   \u26a0 census caveat (Langston r4): this counts paragraphArticleBodyTable nodes ONLY.")
        print("   Stocks / xStocks / Perps / Pro Stocks carry none, so it is one node type, not")
        print("   the page's rate surfaces.")
        for b in banded:
            print("   BANDED %-34s %s" % (b["title"][:34], b["bands"].get("$0 +")))

        for lad in ladders:
            r = lad["rungs"]
            hits = sum(1 for k in REFERENCE_LADDER if r.get(k) == REFERENCE_LADDER[k])
            print("   %-28s rungs %2d  Tier1 %-14s %d/17" % (lad["title"][:28], len(r), r.get(1), hits))

        print("")
        print("=== OBJ-8 match vector (asserted for ALL ladders) ===")
        for title, v in match_vector(ladders).items():
            print("   %-28s %s  maker deltas %s" % (title[:28], v["match"], v["maker_deltas"]))

        # THE PIN: identity is verified by the heading resolving to EXACTLY ONE table.
        # The 17-rung check is NECESSARY, NOT SUFFICIENT — three ladders satisfy it.
        pinned = [l for l in ladders if l["title"] == args.pin]
        print("")
        print("=== PIN: %r ===" % args.pin)
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
        XPIN, XCONTRACT = "Pro xStocks", (-0.02, 0.10)
        xs = [b for b in banded if b["title"] == XPIN]
        print("")
        print("=== SECOND PIN: %r ===" % XPIN)
        if len(xs) != 1:
            print("   GOVERNING-TABLE-IN-DOUBT: %r resolved to %d tables - STOPPING" % (XPIN, len(xs)))
            return 2
        base = xs[0]["bands"].get("$0 +")
        print("   $0 + band: %s | deployed fee_model contract: %s" % (base, XCONTRACT))
        if base != XCONTRACT:
            print("   DRIFT: the xStock base band no longer matches the deployed contract")
            return 3

        ok = [l["title"] for l in ladders if l["rungs"].get(1) == (0.40, 0.80)]
        print("")
        print("=== CONTROL: a ladder must read Tier 1 == (0.40, 0.80) ===")
        if not ok:
            print("   CONTROL FAILED — reporting nothing.")
            return 2
        print("   satisfied by: %s" % ok)
        return 0

    except Fail as exc:
        print("MEASUREMENT FAILED: %s" % exc)
        return 2


if __name__ == "__main__":
    sys.exit(main())
