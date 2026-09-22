"""Mechanical status pass: every PHASE_19_PLAN table row whose text carries a CLOSED / ABSORBED / WITHDRAWN
disposition, mapped to the draft item it names (by row id OR by batch name), for ALL phases. Prints every hit
whose draft bucket is still open, so each is judged by a reader, not skipped by a substring."""
import io, json, re, os, sys
OUT = os.path.dirname(os.path.abspath(__file__))
L = io.open(os.path.join(OUT, "p19.md"), encoding="utf-8").read().split("\n")
items = json.load(io.open(os.path.join(OUT, "items_v3.json"), encoding="utf-8"))
dec = json.load(io.open(os.path.join(OUT, "decisions.json"), encoding="utf-8"))
fb = lambda i: (dec.get(i["key"]) or [i["bucket"]])[0]
kw = re.compile(r"CLOSED|ABSORBED|WITHDRAWN")
trows = []
for n, l in enumerate(L, 1):
    s = l.lstrip("> ").strip()
    if not s.startswith("|"): continue
    c = [x.strip() for x in s.strip("|").split("|")]
    if len(c) < 3 or set(c[0]) <= set("-: "): continue
    if kw.search(s): trows.append((n, c))
print(f"table rows carrying CLOSED/ABSORBED/WITHDRAWN: {len(trows)}")
open_b = {"MUST", "HELPFUL", "AFTER", "OBSERVATION", "DECIDE", "KYLE-PARKED"}
hits = []
for n, c in trows:
    rid = re.sub(r"[*`~]", "", c[0]).strip()
    names = set(re.findall(r"`?(B-[A-Z0-9][A-Z0-9-]+|P19-B[0-9.a-z]+|F-G-[0-9])`?", c[1][:160]))
    for i in items:
        if fb(i) not in open_b: continue
        by_row = i.get("row") and i["row"] == rid
        by_name = (i.get("name") or i["key"]) in names or i["key"] in names
        if by_row or by_name:
            m = kw.search(" | ".join(c[1:]))
            ctx = " | ".join(c[1:])
            k = m.start() if m else 0
            hits.append((fb(i), i["key"], rid, n, ctx[max(0, k - 40):k + 110].replace("\n", " ")))
print(f"open draft items mapped to such a row: {len(hits)}")
for h in sorted(set(hits)):
    print(f"{h[0]:12} {h[1]:36} row={h[2]:10} L{h[3]}: ...{h[4]}...")
