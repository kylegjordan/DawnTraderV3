"""First-pass buckets — ONLY what a rule can settle with certainty. Everything else is left 'REVIEW'
for item-by-item reading. Standing test (Langston 2026-09-22, adopted): the run order is already
19 -> 25 -> 16+20 -> 21, so items in 19/25/16/20 DEFAULT to before-live; the burden is on DEFERRING one."""
import io, json, os, re
from collections import Counter

OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
items = json.load(io.open(os.path.join(OUT, "items_v2.json"), encoding="utf-8"))

HARD_BLOCKERS = {  # roadmap §3.5 / Phase 21 — "HARD GO-LIVE BLOCKER" and "MUST land before live" by their own words
    "issues": {"953", "734", "401"},
    "names": {"B-LEGACY-LIVE-EXIT-PATH", "B-MODE-DELETE-SCOPE"},
    "rows": {"21.1.a", "21-3a", "21-3b", "21-3c", "21-3d", "19-17b"},
}
POST_LIVE_ROWS = re.compile(r"^(17|18|22)\b|^21\.(4|5|6)\b")
PRUNE_STATES = {"resolved-in-body", "withdrawn", "folded", "superseded"}
DONE_CELL = re.compile(r"✅|\bCLOSED\b|\bDONE\b|SHIPPED|ABSORBED|WITHDRAWN|SUPERSEDED|DONE/MOVED", re.I)
LIVE_CELL = re.compile(r"not started|PLACED|IN FLIGHT|OBSERVATION|queued|held|OPEN", re.I)

for it in items:
    b, why = "REVIEW", ""
    st = it.get("status_text", "")
    bs = set(it.get("body_states", []))
    row = it.get("row", "")
    if (row in HARD_BLOCKERS["rows"] or it["name"] in HARD_BLOCKERS["names"]
            or bs & {"open"} and set(it["issues"]) & HARD_BLOCKERS["issues"]):
        b, why = "MUST", "Phase-21 hard-blocker list (roadmap §3.5, in its own words)"
    elif bs and bs <= PRUNE_STATES and "open" not in bs and it["phases"] == ["issue"]:
        b, why = "PRUNE", "issue body records it " + "/".join(sorted(bs))
    elif "parked" in bs:
        b, why = "KYLE-PARKED", "parked by Kyle, deliberately undated"
    elif DONE_CELL.search(st) and not LIVE_CELL.search(st):
        b, why = "PRUNE", "own status cell reads done/closed/absorbed"
    elif it["phase"] in ("17", "18", "22") or POST_LIVE_ROWS.match(row):
        b, why = "AFTER", "already placed post-live in the roadmap"
    it["bucket"], it["why"] = b, why

json.dump(items, io.open(os.path.join(OUT, "items_v3.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
c = Counter(i["bucket"] for i in items)
print("first-pass buckets:", dict(c))
print("REVIEW by phase:", dict(Counter(i["phase"] for i in items if i["bucket"] == "REVIEW")))
print("MUST items:"); [print("   ", i["key"], "|", i["row"], "|", i["issues"][:3]) for i in items if i["bucket"] == "MUST"]
