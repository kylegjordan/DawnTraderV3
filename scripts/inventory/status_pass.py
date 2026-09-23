"""Mechanical status pass over the GOVERNED plan, read at a git ref (default origin/migration/aws-supabase).

Two axes, both over the WHOLE row text (no character window):
  1. NAME axis  — a plan row carrying CLOSED / ABSORBED / WITHDRAWN that names an open draft item by row id or batch name.
  2. ISSUE axis — a plan row carrying CLOSED / ABSORBED / WITHDRAWN that cites an open draft item's #NNN.
Every hit is printed for a READER to judge; a hit is a lead, not a verdict (e.g. '#419' can be a pm2 restart number).
Usage: python status_pass.py [ref]
"""
import io, json, re, os, sys, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("DT_REPO", r"C:\DawnTraderV3-new")
REF = sys.argv[1] if len(sys.argv) > 1 else "origin/migration/aws-supabase"
PATH = "1-system-manual/PHASE_19_PLAN.md"
subprocess.check_call(["git", "-C", REPO, "fetch", "-q", "origin"])
sha = subprocess.check_output(["git", "-C", REPO, "rev-parse", REF], text=True).strip()
text = subprocess.check_output(["git", "-C", REPO, "show", f"{sha}:{PATH}"], text=True, encoding="utf-8")
L = text.split("\n")
items = json.load(io.open(os.path.join(HERE, "items_v3.json"), encoding="utf-8"))
dec = json.load(io.open(os.path.join(HERE, "decisions.json"), encoding="utf-8"))
items += json.load(io.open(os.path.join(HERE, "manual_extra.json"), encoding="utf-8"))
def fb(i):
    d = dec.get(i["key"])
    if d: return d[0]
    return "UNCONFIRMED" if i["bucket"] == "PRUNE" else i["bucket"]
kw = re.compile(r"CLOSED|ABSORBED|WITHDRAWN|DEPLOYED|DONE|SHIPPED|RESOLVED|SUPERSEDED|DELIVERED|LANDED")
trows = []
for n, l in enumerate(L, 1):
    s = l.lstrip("> ").strip()
    if not s.startswith("|"): continue
    c = [x.strip() for x in s.strip("|").split("|")]
    if len(c) < 3 or set(c[0]) <= set("-: "): continue
    if kw.search(s): trows.append((n, c, " | ".join(c[1:])))
open_b = {"MUST", "HELPFUL", "AFTER", "OBSERVATION", "DECIDE", "KYLE-PARKED", "UNCONFIRMED"}
open_items = [i for i in items if fb(i) in open_b]
print(f"status vocabulary: {kw.pattern}")
print(f"read {PATH} at {sha[:9]} ({REF}); table rows carrying CLOSED/ABSORBED/WITHDRAWN: {len(trows)}; open draft items: {len(open_items)}")
NEAR = 120  # a status word within this many chars of the item's mention is read as possibly ABOUT it
def near(body, pos):
    return any(abs(m.start() - pos) <= NEAR for m in kw.finditer(body))
def ctx(body, m):
    k = m.start() if m else 0
    return body[max(0, k - 50):k + 120].replace("\n", " ")
name_hits, issue_hits = [], []
for n, c, body in trows:
    rid = re.sub(r"[*`~]", "", c[0]).strip()
    names = set(re.findall(r"(B-[A-Z0-9][A-Z0-9-]+|P19-B[0-9][0-9.a-z]*|F-G-[0-9])", body))
    for i in open_items:
        if (i.get("row") and i["row"] == rid) or (i.get("name") or i["key"]) in names or i["key"] in names:
            nm = (i.get("name") or i["key"]); p = body.find(nm)
            is_near = (i.get("row") and i["row"] == rid) or (p >= 0 and near(body, p))
            name_hits.append((("NEAR" if is_near else "far"), fb(i), i["key"], rid, n, ctx(body, kw.search(body[max(0,p-NEAR):]) and list(kw.finditer(body))[0])))
        for num in set(i.get("issues") or []) | ({i["key"][1:]} if i["key"].startswith("#") else set()):
            m = re.search(r"(?<![0-9A-Za-z])#" + re.escape(num) + r"(?![0-9])", body)
            if m and not (i.get("row") and i["row"] == rid):
                issue_hits.append((("NEAR" if near(body, m.start()) else "far"), fb(i), i["key"], rid, n, ctx(body, m)))
print(f"\nNAME axis — open items mapped to such a row: {len(set(name_hits))}")
for h in sorted(set(name_hits)): print(f"  {h[0]:12} {h[1]:34} row={h[2]:10} L{h[3]}: ...{h[4]}...")
print(f"\nISSUE axis — open #NNN items cited by such a row: {len(set(issue_hits))}")
for h in sorted(set(issue_hits)): print(f"  {h[0]:12} {h[1]:8} row={h[2]:10} L{h[3]}: ...{h[4]}...")
