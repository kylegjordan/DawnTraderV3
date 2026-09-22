"""Read every OPEN-labelled RUNNING_ISSUES entry IN FULL, not by its heading.
 - THREE entry formats live in this ledger:  "### #N ..."   "- **#N ..."   "**#N ..."
   (a heading-only read missed 282 issues, #392 among them)
 - resolution is often recorded in the BODY while the heading still says OPEN
 - HOME: only an EXPLICIT "HOME" line joins (Langston 2026-09-22). "plan row 3h, which already owns
   the question" is a MENTION, and treating it as a home joined #953 to the wrong row.
"""
import io, re, json, os
from collections import Counter

R = r"C:\DawnTraderV3-new\1-system-manual\RUNNING_ISSUES.md"
OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
lines = io.open(R, encoding="utf-8").read().split("\n")

HEAD = re.compile(r"^(?:#{2,4}\s+|-\s+\*\*|\*\*)\**#(\d{2,4})\b[*\s]*(.*)$")
RESOLVED = re.compile(r"(✅\s*\**\s*(RESOLVED|CLOSED|FIXED|DONE|SHIPPED|DISCHARGED)|\bRESOLVED\s+20\d\d-\d\d-\d\d|\bCLOSED\s+20\d\d-\d\d-\d\d|CLOSED BY|RESOLVED BY)")
WITHDRAWN = re.compile(r"WITHDRAWN|NOT A (DEFECT|BUG|FINDING)|disposition 5", re.I)
PARKED = re.compile(r"PARKED|deliberately no calendar", re.I)
FOLDED = re.compile(r"FOLD(ED)?\s+(INTO|IN)\b|folded into|absorbed into|ABSORBED", re.I)
SUPERSEDED = re.compile(r"SUPERSEDED BY|superseded", re.I)
HOME_LINE = re.compile(r"\bHOME\b[^\n]{0,260}")
HOME_ROW = re.compile(r"\brow\s+[*`\s]*([0-9][0-9A-Za-z.\-]*[0-9A-Za-z])")
HOME_NAME = re.compile(r"`((?:B|F|P\d+|T)-[A-Z0-9][A-Z0-9._\-]+)`")

starts = [(i, m) for i, l in enumerate(lines) for m in [HEAD.match(l)] if m]
res = []
for k, (i, m) in enumerate(starts):
    end = starts[k + 1][0] if k + 1 < len(starts) else len(lines)
    head = m.group(2)
    if not re.match(r"(OPEN|DEFERRED|IN PROGRESS|BLOCKED)\b", head):
        continue
    body = "\n".join(lines[i:end])
    home = None
    hl = HOME_LINE.search(body)
    if hl:
        seg = hl.group(0)
        rmm = HOME_ROW.search(seg)
        bmm = HOME_NAME.search(seg)
        home = rmm.group(1) if rmm else (bmm.group(1) if bmm else None)
    state = ("resolved-in-body" if RESOLVED.search(body) else "withdrawn" if WITHDRAWN.search(body)
             else "parked" if PARKED.search(body) else "folded" if FOLDED.search(body)
             else "superseded" if SUPERSEDED.search(body) else "open")
    res.append({
        "num": m.group(1), "src": f"RUNNING_ISSUES.md:{i+1}",
        "head": re.sub(r"[*`⭐⛔⚠️✅★⇒]+", "", head)[:200],
        "owner": (re.findall(r"\b(CC-A|CC-B|CC-C|CC-INFRA|Kyle)\b", head) or [""])[0],
        "home": home, "state": state,
        "split": bool(re.search(r"\bsplit\b|two halves", body, re.I)),
    })

json.dump(res, io.open(os.path.join(OUT, "issues_deep.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("OPEN-labelled entries read in full:", len(res))
print("state per the BODY:", dict(Counter(r["state"] for r in res)))
print("with an EXPLICIT home:", sum(1 for r in res if r["home"]))
print("genuinely open AND no explicit home:", sum(1 for r in res if r["state"] == "open" and not r["home"]))
