"""Cluster the raw inventory into candidate work items.
Link rules, deliberately conservative (over-merging hides work; under-merging only costs a dedupe pass):
  1. rows naming the SAME batch identifier are one item;
  2. a RUNNING_ISSUES entry joins the item whose plan/roadmap row cites that issue FIRST (its primary issue);
  3. nothing else merges — an incidental citation of an issue number never joins two items.
"""
import io, json, re, os
from collections import defaultdict, Counter

OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
items = json.load(io.open(os.path.join(OUT, "inventory_raw.json"), encoding="utf-8"))

parent = list(range(len(items)))
def find(x):
    while parent[x] != x:
        parent[x] = parent[parent[x]]; x = parent[x]
    return x
def union(a, b):
    ra, rb = find(a), find(b)
    if ra != rb: parent[rb] = ra

by_name = defaultdict(list)
for i, it in enumerate(items):
    if it["name"]: by_name[it["name"]].append(i)
for idxs in by_name.values():
    for j in idxs[1:]: union(idxs[0], j)

# primary issue of a plan/roadmap row = first issue cited in its gist/name cell
primary = {}
for i, it in enumerate(items):
    if it["phase"] in ("issue", "tasklist"): continue
    m = re.search(r"#(\d{3,4})", it["gist"])
    if m: primary.setdefault(m.group(1), i)
for i, it in enumerate(items):
    if it["phase"] == "issue":
        n = it["id"].lstrip("#")
        if n in primary: union(primary[n], i)

clusters = defaultdict(list)
for i in range(len(items)): clusters[find(i)].append(i)

rank = {"in-flight": 0, "observation": 1, "open": 2, "blocked": 2, "deferred": 3, "unclear": 4, "done?": 5}
out = []
for root, idxs in clusters.items():
    rows = [items[i] for i in idxs]
    name = next((r["name"] for r in rows if r["name"]), "")
    ids = sorted({r["id"] for r in rows if r["id"] and not r["id"].startswith("#")})
    issues = sorted({r["id"] for r in rows if r["id"].startswith("#")})
    owners = [r["owner"] for r in rows if r["owner"]]
    owner = Counter(owners).most_common(1)[0][0] if owners else ""
    statuses = [r["status"] for r in rows]
    best = min(statuses, key=lambda s: rank.get(s, 9))
    all_done = all(s == "done?" for s in statuses)
    phases = sorted({r["phase"] for r in rows})
    gist = next((r["gist"] for r in rows if r["phase"] not in ("issue", "tasklist")), rows[0]["gist"])
    out.append({"name": name, "plan_ids": ids, "issues": issues, "owner": owner,
                "status": "done?" if all_done else best, "phases": phases,
                "sources": [r["src"] for r in rows], "gist": gist.strip()})

json.dump(out, io.open(os.path.join(OUT, "inventory_clustered.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("raw rows:", len(items), "-> candidate items:", len(out))
print("by status:", dict(Counter(o["status"] for o in out)))
print("items with NO owner:", sum(1 for o in out if not o["owner"]))
print("items that exist ONLY as an open issue (no plan row, no task line):",
      sum(1 for o in out if o["phases"] == ["issue"]))
print("items that exist ONLY in a task list:", sum(1 for o in out if o["phases"] == ["tasklist"]))
