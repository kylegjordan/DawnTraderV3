#!/usr/bin/env python3
"""
B-KRAKEN-FEE-WATCH (#1011) — extract Kraken's published fee ladders from the live page.

WHY THIS IS A FILE AND NOT AN INLINE PROBE. Six inline attempts at this extraction each failed a
different way: forward-window scans that crossed table boundaries, a backward scan that returned
zero, an attachment rule that collapsed four ladders into two, a backslash mangled by the shell
on its way into a heredoc, and a payload finder that looked for <script type="application/json">
when the data is not there. Every one of those is a property of scanning a 1.4 MB string with
offsets and quoting, not of the data. This locates the payload and parses it as JSON.

WHERE THE DATA ACTUALLY IS (measured 2026-09-12): a plain <script> assigns
`window.__INITIAL_PROPS__={...}` — a Sanity-style document tree. Fee tables are objects with
`_type: "paragraphArticleBodyTable"` carrying `field_rows`; each row has `field_cells` and a
`row_description` such as "Row :: Tier 1" or "Row :: Tier" for the header.

THE ANCHOR (Langston, Step-1 BLOCKER-1): a ladder is identified by its ENCLOSING TABLE OBJECT and
its COLUMN NAMES — never by a percentage regex, a fixed column index, or proximity to a string.
The page carries several Tier-1..Pro-5 ladders that DISAGREE, so "the spot table" cannot be found
by searching for a rate.

THE CONTROL: at least one ladder must read Tier 1 == (0.40, 0.80) — obtained independently from a
direct read of the page and from Kyle's authenticated in-account dialog. If none does, the
extractor is wrong and this REPORTS NOTHING rather than a number.
"""

import argparse
import json
import re
import sys
import urllib.request

URL = "https://www.kraken.com/features/fee-schedule"
UA = "Mozilla/5.0 (compatible; DawnTrader-fee-watch/0.1)"
ASSIGN = "window.__INITIAL_PROPS__="

# 1-system-manual/external-references/KRAKEN_FEE_SCHEDULE_REFERENCE.md section 1 — transcribed
# from Kyle's signed-in Kraken Pro Fees dialog, 2026-09-06, 17 rungs.
REFERENCE_LADDER = {
    1: (0.40, 0.80), 2: (0.30, 0.60), 3: (0.22, 0.38), 4: (0.20, 0.35), 5: (0.15, 0.30),
    6: (0.12, 0.25), 7: (0.10, 0.22), 8: (0.08, 0.20), 9: (0.06, 0.18), 10: (0.04, 0.15),
    11: (0.02, 0.12), 12: (0.00, 0.10), 13: (0.00, 0.09), 14: (0.00, 0.08), 15: (0.00, 0.07),
    16: (0.00, 0.06), 17: (0.00, 0.05),
}

TAG_RE = re.compile(r"<[^>]+>")
WS_RE = re.compile(r"\s+")
NUM_RE = re.compile(r"-?\d+(?:\.\d+)?$")
ROW_RE = re.compile(r"^(Tier|Pro) (\d+)$")


def fetch(url):
    req = urllib.request.Request(url, headers={"User-Agent": UA})
    with urllib.request.urlopen(req, timeout=30) as resp:
        return resp.read().decode("utf-8", "replace")


def text_of(value):
    """Cell text with markup and entities removed. Returns a string; never coerces to a number."""
    s = TAG_RE.sub("", str(value if value is not None else ""))
    s = (s.replace("&nbsp;", " ").replace("&lt;", "<").replace("&gt;", ">")
          .replace("&amp;", "&").replace(" ", " "))
    return WS_RE.sub(" ", s).strip()


def rate_of(value):
    """A percentage cell as a float, or None. Fails to None rather than guessing."""
    s = text_of(value).replace("%", "").replace(" ", "")
    return float(s) if NUM_RE.match(s) else None


def extract_payload(html):
    """Slice window.__INITIAL_PROPS__={...} by balanced scan, honouring strings and escapes."""
    a = html.find(ASSIGN)
    if a == -1:
        return None, "assignment %r not found" % ASSIGN
    start = html.find("{", a)
    if start == -1:
        return None, "no opening brace after the assignment"
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
                blob = html[start:i + 1]
                try:
                    return json.loads(blob), "parsed %d bytes" % len(blob)
                except Exception as exc:
                    return None, "balanced slice of %d bytes failed to parse: %s" % (len(blob), exc)
    return None, "unbalanced object from offset %d" % start


def collect_tables(node, out):
    """Every paragraphArticleBodyTable in the tree, as a list of (row_label, [cell text])."""
    if isinstance(node, dict):
        if node.get("_type") == "paragraphArticleBodyTable" and isinstance(node.get("field_rows"), list):
            rows = []
            for r in node["field_rows"]:
                if not isinstance(r, dict):
                    continue
                label = text_of(r.get("row_description", "")).replace("Row :: ", "").strip()
                cells = [text_of(c.get("field_content")) for c in r.get("field_cells", []) if isinstance(c, dict)]
                rows.append((label, cells))
            if rows:
                out.append(rows)
        for v in node.values():
            collect_tables(v, out)
    elif isinstance(node, list):
        for v in node:
            collect_tables(v, out)


def ladder_from(rows):
    """
    One table -> {header, columns, rungs}. The header row is labelled exactly 'Tier'; column
    indices come from the header's OWN cell names, so a table that moves its columns still reads
    correctly (the margin table carries the spot pair at columns 7/8).
    """
    header = next((cells for label, cells in rows if label == "Tier"), None)
    if header is None:
        return None
    cols = {}
    for idx, name in enumerate(header):
        n = name.lower()
        if "maker" in n:
            cols.setdefault("maker_futures" if "futures" in n else "maker_spot", idx)
        if "taker" in n:
            cols.setdefault("taker_futures" if "futures" in n else "taker_spot", idx)
    if "maker_spot" not in cols or "taker_spot" not in cols:
        return None
    mi, ti = cols["maker_spot"], cols["taker_spot"]
    rungs = {}
    for label, cells in rows:
        m = ROW_RE.match(label)
        if not m:
            continue
        n = int(m.group(2))
        rung = n if m.group(1) == "Tier" else 12 + n
        if mi < len(cells) and ti < len(cells):
            maker, taker = rate_of(cells[mi]), rate_of(cells[ti])
            if maker is not None and taker is not None:
                rungs.setdefault(rung, (maker, taker))
    return {"header": header, "columns": cols, "rungs": rungs}


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument("--url", default=URL)
    ap.add_argument("--file", help="parse a saved body instead of fetching (mutation tests)")
    args = ap.parse_args()

    html = open(args.file, encoding="utf-8", errors="replace").read() if args.file else fetch(args.url)
    print("source bytes: %d" % len(html))

    payload, note = extract_payload(html)
    print("payload: %s" % note)
    if payload is None:
        print("MEASUREMENT FAILED: no payload")
        return 2

    raw = []
    collect_tables(payload, raw)
    print("paragraphArticleBodyTable objects: %d" % len(raw))

    ladders = []
    for rows in raw:
        lad = ladder_from(rows)
        if lad and lad["rungs"]:
            ladders.append(lad)
    print("ladders with a spot maker/taker column pair: %d" % len(ladders))

    for i, lad in enumerate(ladders, 1):
        r = lad["rungs"]
        match = [k for k in REFERENCE_LADDER if r.get(k) == REFERENCE_LADDER[k]]
        diff = [k for k in REFERENCE_LADDER if k in r and r[k] != REFERENCE_LADDER[k]]
        print("")
        print("LADDER %d | rungs %d | Tier 1 = %s" % (i, len(r), r.get(1)))
        print("   header : %s" % lad["header"][:8])
        print("   columns: %s" % lad["columns"])
        print("   vs reference section 1: MATCH %d/17 | diverges at %s" % (len(match), sorted(diff)))

    ok = [i for i, lad in enumerate(ladders, 1) if lad["rungs"].get(1) == (0.40, 0.80)]
    print("")
    print("=== CONTROL: a ladder must read Tier 1 == (0.40, 0.80) ===")
    if not ok:
        print("   CONTROL FAILED — the extractor is wrong. Reporting nothing.")
        return 2
    print("   ladders satisfying the control: %s" % ok)
    return 0


if __name__ == "__main__":
    sys.exit(main())
