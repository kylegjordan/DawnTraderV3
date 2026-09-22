"""Table-aware extraction of PHASE_19_PLAN: attribute every row to the table header it sits under,
so a history table, a decision log and a gates table are never read as a work queue."""
import io, re, json
from collections import Counter

s = io.open(r"C:\DawnTraderV3-new\1-system-manual\PHASE_19_PLAN.md", encoding="utf-8").read().split("\n")
SEP = re.compile(r"^\|[\s:\-|]+\|$")

tables = []  # (header_line_no, header_text, [row line numbers])
cur = None
for i, raw in enumerate(s):
    t = raw.lstrip("> ").strip()
    nxt = s[i + 1].lstrip("> ").strip() if i + 1 < len(s) else ""
    if t.startswith("|") and SEP.match(nxt):
        cur = [i + 1, " | ".join(c.strip() for c in t.strip("|").split("|")), []]
        tables.append(cur)
        continue
    if cur and t.startswith("|") and not SEP.match(t):
        cur[2].append(i + 1)
    elif cur and not t.startswith("|") and t != "":
        cur = None  # a non-table, non-blank line ends the table

for h, txt, rows in tables:
    print(f"L{h:<5} rows={len(rows):<4} {txt[:120]}")

# where do the 3n / 3b / 2.4x rows actually live?
loc = Counter()
for h, txt, rows in tables:
    for r in rows:
        m = re.match(r"^\|\s*\*{0,2}([0-9][0-9A-Za-z.\-]*)", s[r - 1].lstrip("> ").strip())
        if m: loc[(h, m.group(1).split(".")[0][:3])] += 1
print()
print("row-id prefixes per table:", dict(loc.most_common(25)))
json.dump([[h, txt, rows] for h, txt, rows in tables],
          io.open(r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad\plan_tables.json", "w", encoding="utf-8"))
