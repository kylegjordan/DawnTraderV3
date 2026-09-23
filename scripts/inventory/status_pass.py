"""Mechanical status pass over the GOVERNED plan, read at a git ref (fetched first; default origin/migration/aws-supabase).

Two axes, both over the WHOLE row text (no character window):
  1. NAME axis  — a plan row carrying a status word that names an open draft item by row id or batch name.
  2. ISSUE axis — a plan row carrying a status word that cites any of an open item's issue numbers.
Status vocabulary is case-INSENSITIVE with word boundaries (so `closed_trades` does not match; `fail-closed` does —
a reader discards it). Each hit carries the text around the status word NEAREST the mention.
NEAR = that word sits within NEAR chars of the mention (read every one); far = cross-reference (listed; for MUST and
HELPFUL items the far hits are read too — a missed close there costs attention, elsewhere it costs nothing).
Every hit is a LEAD for a reader, never a verdict.   Usage: python status_pass.py [ref]
"""
import io, json, re, os, sys, subprocess
HERE = os.path.dirname(os.path.abspath(__file__))
REPO = os.environ.get("DT_REPO", r"C:\DawnTraderV3-new")
REF = sys.argv[1] if len(sys.argv) > 1 else "origin/migration/aws-supabase"
PATH = "1-system-manual/PHASE_19_PLAN.md"
subprocess.check_call(["git", "-C", REPO, "fetch", "-q", "origin"])
sha = subprocess.check_output(["git", "-C", REPO, "rev-parse", REF], text=True).strip()
L = subprocess.check_output(["git", "-C", REPO, "show", f"{sha}:{PATH}"], text=True, encoding="utf-8").split("\n")
items = json.load(io.open(os.path.join(HERE, "items_v3.json"), encoding="utf-8"))
items += json.load(io.open(os.path.join(HERE, "manual_extra.json"), encoding="utf-8"))
dec = json.load(io.open(os.path.join(HERE, "decisions.json"), encoding="utf-8"))
def fb(i):
    d = dec.get(i["key"])
    if d: return d[0]
    # keyed on the DECISION, never on provenance (Langston r7 F-2): a PRUNE with no decisions.json entry is unconfirmed
    return "UNCONFIRMED" if i["bucket"] == "PRUNE" else i["bucket"]
kw = re.compile(r"\b(closed|absorbed|withdrawn|deployed|done|shipped|resolved|superseded|delivered|landed)\b", re.I)
NEAR = 120
trows = []
for n, l in enumerate(L, 1):
    s = l.lstrip("> ").strip()
    if not s.startswith("|"): continue
    c = [x.strip() for x in s.strip("|").split("|")]
    if len(c) < 2 or set(c[0]) <= set("-: "): continue
    body = " | ".join(c[1:])
    if kw.search(body): trows.append((n, re.sub(r"[*`~]", "", c[0]).strip(), body))
import collections
rid_count = collections.Counter(rid for _, rid, _ in trows)
# a row id is only an identity if it is UNIQUE among status-bearing plan rows (ids 1-12, 2.4g, 3b.c, 3b.f-d repeat) — Langston r7 F-1
open_b = {"MUST", "HELPFUL", "AFTER", "OBSERVATION", "DECIDE", "KYLE-PARKED", "UNCONFIRMED"}
open_items = [i for i in items if fb(i) in open_b]
print(f"status vocabulary: {kw.pattern} (case-insensitive, word-bounded — the old boundary-free form read 'UNDEPLOYED' as a close)")
print(f"read {PATH} at {sha[:9]} ({REF}); table rows carrying a status word: {len(trows)}; open draft items: {len(open_items)}")
def nearest(body, pos):
    m = min(kw.finditer(body), key=lambda m: abs(m.start() - pos))
    return abs(m.start() - pos), body[max(0, m.start() - 70):m.start() + 110].replace("\n", " ")
hits = []
for n, rid, body in trows:
    names = set(re.findall(r"(B-[A-Z0-9][A-Z0-9-]+|P19-B[0-9][0-9.a-z]*|F-G-[0-9])", body))
    for i in open_items:
        b = fb(i)
        own = bool(i.get("row")) and i["row"] == rid and rid_count[rid] == 1
        nm = i.get("name") or i["key"]
        if own or nm in names or i["key"] in names:
            p = 0 if own else max(body.find(nm), body.find(i["key"]), 0)
            dist, ctx = nearest(body, p)
            hits.append(("NAME", "NEAR" if own or dist <= NEAR else "far", b, i["key"], rid, n, ctx))
        for num in set(i.get("issues") or []) | ({i["key"][1:]} if i["key"].startswith("#") else set()):
            m = re.search(r"(?<![0-9A-Za-z])#" + re.escape(num) + r"(?![0-9])", body)
            if m and not own:
                dist, ctx = nearest(body, m.start())
                hits.append(("ISSUE", "NEAR" if dist <= NEAR else "far", b, i["key"], rid, n, ctx))
hits = sorted(set(hits))
for ax in ("NAME", "ISSUE"):
    hs = [h for h in hits if h[0] == ax]
    nr = [h for h in hs if h[1] == "NEAR"]
    fr_read = [h for h in hs if h[1] == "far" and h[2] in ("MUST", "HELPFUL")]
    fr_rest = [h for h in hs if h[1] == "far" and h[2] not in ("MUST", "HELPFUL")]
    print(f"\n{ax} axis — {len(hs)} hits: {len(nr)} NEAR · {len(fr_read)} far on MUST/HELPFUL (read) · {len(fr_rest)} far elsewhere (listed, not read)")
    for tag, group in (("NEAR", nr), ("far-read", fr_read)):
        for h in group: print(f"  {tag:8} {h[2]:11} key={h[3]:34} row={h[4]:12} L{h[5]}: ...{h[6]}...")
    for h in fr_rest: print(f"  far      {h[2]:11} key={h[3]:34} row={h[4]:12} L{h[5]}")
