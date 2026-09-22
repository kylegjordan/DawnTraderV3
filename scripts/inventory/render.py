import io, json, os
from collections import defaultdict

OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
DEST = r"C:\DawnTraderV3-new\Claude Comms and Packages\Scope Files\PRE_LIVE_INVENTORY_WORKING.md"
items = json.load(io.open(os.path.join(OUT, "inventory_clustered.json"), encoding="utf-8"))

def cell(x):
    return str(x).replace("|", "/").replace("\n", " ").strip()

groups = defaultdict(list)
for it in items:
    if it["phases"] == ["issue"]:
        key = "ISSUE-ONLY"
    elif it["phases"] == ["tasklist"]:
        key = "TASKLIST-ONLY"
    else:
        ph = [p for p in it["phases"] if p not in ("issue", "tasklist")]
        key = "P" + ph[0] if ph else "OTHER"
    groups[key].append(it)

order = ["P19", "P25", "P16", "P20", "P21", "P22", "P17", "P18", "TASKLIST-ONLY", "ISSUE-ONLY", "OTHER"]
label = {
    "P19": "Phase 19 — plan rows (and anything clustered with them)",
    "P25": "Phase 25 — Calibration With Evidence",
    "P16": "Phase 16 — Database & Remaining Legacy Cleanup",
    "P20": "Phase 20 — Production Hardening",
    "P21": "Phase 21 — Live Mode Activation (incl. the post-live 21.4 / 21.5 / 21.6 sections)",
    "P22": "Phase 22 — Publication (post-live)",
    "P17": "Phase 17 / 17.5 — ML design, smart thermostat (post-live)",
    "P18": "Phase 18 — ML implementation (post-live)",
    "TASKLIST-ONLY": "In a session task list but on NO plan row or roadmap section",
    "ISSUE-ONLY": "An OPEN issue with NO plan row and NO task-list line",
    "OTHER": "Other",
}

L = []
L.append("# PRE-LIVE INVENTORY — WORKING FILE (raw, mechanically deduped, NOT yet categorised)")
L.append("")
L.append("**Kyle, 2026-09-23:** *\"generate a complete list of what needs to be done in Phase 19 (what is left) and what is planned for phase 25, 16, and 20 … and 21 … going through every session's task list, the phase 19 plan, the roadmap, and Langston's archives … fully understand every planned and discussed (slotted and not slotted) batch, sub-batch, hot fix, investigation … and dedupe that list. Once we have the full list, each item is to be categorized … must be done before live, would be extremely helpful to do before going live, and wait until after we have gone live.\"*")
L.append("")
L.append("## ⛔ WHAT THIS FILE IS, AND WHAT IT IS NOT")
L.append("- **It IS a mechanical extraction** from `PHASE_19_PLAN.md`, `POST_AUDIT_ROADMAP.md` (tables AND section headings — phases 16/20/21 are written as headings), the four session task lists, and every `RUNNING_ISSUES` entry marked OPEN / DEFERRED / BLOCKED. **985 raw rows → " + str(len(items)) + " candidate items.**")
L.append("- **Dedupe rule, deliberately conservative:** rows naming the same batch identifier are one item; an OPEN issue joins the plan row that cites it FIRST. **Nothing else merges** — an incidental citation of an issue number never joins two items, because over-merging HIDES work and under-merging only costs a second pass.")
L.append("- ⛔ **It is NOT yet complete.** Two sources are not in it: **Langston's archive** (only he can mine it — discussed-but-never-slotted items live there) and **each session's knowledge of items discussed and never written down.**")
L.append("- ⛔ **`status` is a HEURISTIC read of the row's own wording, not a verdict.** `done?` means the row LOOKS finished and must be confirmed by its owner before it leaves the list; `unclear` means the wording did not say.")
L.append("- ⛔ **The two bottom sections are where the real dedupe work is:** items that exist ONLY in a task list, and OPEN issues with no plan row at all. Many will be resolved-but-unmarked or already folded into a batch under another name; some will be genuinely unhomed work.")
L.append("")
L.append("| group | items |")
L.append("|---|---:|")
for k in order:
    if groups.get(k): L.append(f"| {label[k]} | {len(groups[k])} |")
L.append("")
for k in order:
    g = groups.get(k)
    if not g: continue
    L.append(f"## {label[k]} — {len(g)}")
    L.append("")
    L.append("| # | name | plan / roadmap id | issues | owner | status | gist | sources |")
    L.append("|---:|---|---|---|---|---|---|---|")
    g.sort(key=lambda x: (x["plan_ids"][0] if x["plan_ids"] else "zz", x["name"]))
    for n, it in enumerate(g, 1):
        L.append("| {} | {} | {} | {} | {} | {} | {} | {} |".format(
            n, cell(it["name"]), cell(", ".join(it["plan_ids"][:4])), cell(" ".join(it["issues"][:4])),
            cell(it["owner"]), cell(it["status"]), cell(it["gist"][:160]), cell("; ".join(it["sources"][:3]))))
    L.append("")
io.open(DEST, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("written", DEST, os.path.getsize(DEST), "bytes")
for k in order:
    if groups.get(k): print(f"  {k:14} {len(groups[k])}")
