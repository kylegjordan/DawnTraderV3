"""Unified pre-live item list, v2 — Langston's join rules (2026-09-22):
  * only a row's OWN declared identifier joins; a batch name mentioned in an issue BODY is a cross-reference;
  * an issue joins a plan row only through the issue's DECLARED home (HOME:/plan row/roadmap), or the plan
    row's own declared primary issue;
  * equivalences he has RULED are merged explicitly; renumbered issues are aliased before any join;
  * split issues are marked, never silently assigned to one bucket.
Each item carries ~400 chars of its own text so it can be judged, and its source pointer."""
import io, re, json, os
from collections import defaultdict, Counter

R = r"C:\DawnTraderV3-new\1-system-manual"
OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
def rd(n): return io.open(os.path.join(R, n), encoding="utf-8").read()
def clean(t, n=420): return re.sub(r"\s+", " ", re.sub(r"[*`⭐⛔⚠️✅★⇒~>|]+", " ", t)).strip()[:n]

NAME = re.compile(r"`((?:B|P\d+|T|F)-[A-Z0-9][A-Z0-9._\-]+)`")
EQUIV = {  # Langston-ruled equivalences
    "B-GRID-REPRESENTABILITY": "F-G-1", "B-EXIT-TRANSACTABLE-SIDE": "F-G-2",
    "B-ATR-SOURCE-FIX": "P19-B8.5l",
}
ISSUE_EQUIV = {"560": "377", "581": "P19-B8.5l"}
ALIAS = {"594": None, "983": "984"}  # #648 was renumbered FROM #594 (a different, closed issue); #984 from #983

items = []
# ── PLAN: queue tables only (L31 "queue", L542 "queue-2.4") ───────────────────
PT = json.load(io.open(os.path.join(OUT, "plan_tables.json"), encoding="utf-8"))
L19 = rd("PHASE_19_PLAN.md").split("\n")
for h, txt, rows in PT:
    if h not in (31, 542):
        continue
    for ln in rows:
        c = [x.strip() for x in L19[ln - 1].lstrip("> ").strip().strip("|").split("|")]
        if len(c) < 2: continue
        rid = re.sub(r"[*`]", "", c[0]).strip()
        body = " | ".join(c[1:])
        lead = re.sub(r"^[\s*⭐⛔⚠️✅★]+", "", c[1])
        nm = [NAME.match(lead).group(1)] if NAME.match(lead) else []   # its OWN identifier, never one it mentions
        name = EQUIV.get(nm[0], nm[0]) if nm else ""
        prim = re.search(r"\(`?#(\d{3,4})`?", c[1])
        stcell = c[-1] if h == 31 else (c[3] if len(c) > 3 else "")
        items.append({"key": name or f"row:{rid}", "name": name, "row": rid, "phase": "19",
                      "primary_issue": prim.group(1) if prim else "",
                      "status_text": clean(stcell, 160), "text": clean(c[1]), "src": f"PHASE_19_PLAN.md:{ln}",
                      "owner": (re.findall(r"\b(CC-A|CC-B|CC-C|CC-INFRA|Kyle)\b", body) or [""])[-1]})

# ── ROADMAP: the Phase-25 table + phase headings 16/19/20/21/22/17/18 ─────────
RM = rd("POST_AUDIT_ROADMAP.md").split("\n")
for ln, line in enumerate(RM, 1):
    t = line.strip()
    m = re.match(r"^\|\s*\**((?:25|21|20|19|16)-[0-9A-Za-z.\-]+)\**\s*\|(.*)", t)
    if m:
        items.append({"key": f"rm:{m.group(1)}", "name": (NAME.findall(t) or [""])[0], "row": m.group(1), "phase": m.group(1)[:2],
                      "primary_issue": (re.findall(r"#(\d{3,4})", m.group(2)) or [""])[0],
                      "status_text": "", "text": clean(m.group(2)), "src": f"POST_AUDIT_ROADMAP.md:{ln}", "owner": ""})
        continue
    m = re.match(r"^#{3,4}\s+(~~)?\s*((1[6-9]|2[0-2])(\.[0-9A-Za-z]+)+)\s*(.*)$", t)
    if m:
        body = " ".join(RM[ln:ln + 6])
        struck = bool(m.group(1)) or "~~" in t[:40] or re.search(r"✅\s*(DONE|SHIPPED|COMPLETE)|MOVED TO", t)
        items.append({"key": f"rm:{m.group(2)}", "name": (NAME.findall(t) or [""])[0], "row": m.group(2),
                      "phase": m.group(3), "primary_issue": (re.findall(r"#(\d{3,4})", t) or [""])[0],
                      "status_text": "DONE/MOVED (struck or marked in heading)" if struck else "",
                      "text": clean(m.group(5) + " — " + body), "src": f"POST_AUDIT_ROADMAP.md:{ln}", "owner": ""})

for ln, line in enumerate(RM, 1):
    m = re.match(r"^\s*-\s+\*\*(?:★+\s*)?([0-9]{2}[-.][0-9A-Za-z.]+)\b(.*)$", line)
    if m:
        items.append({"key": f"rm:{m.group(1)}", "name": "", "row": m.group(1), "phase": m.group(1)[:2],
                      "primary_issue": (re.findall(r"#(\d{3,4})", line) or [""])[0], "status_text": "",
                      "text": clean(m.group(2)), "src": f"POST_AUDIT_ROADMAP.md:{ln}", "owner": ""})

# ── ISSUES: every open-labelled entry, state from its BODY ────────────────────
ISS = json.load(io.open(os.path.join(OUT, "issues_deep.json"), encoding="utf-8"))
for r in ISS:
    n = r["num"]
    if n in ALIAS and ALIAS[n] is None:
        continue
    n = ISSUE_EQUIV.get(n, ALIAS.get(n, n))
    items.append({"key": f"#{n}", "name": "", "row": "", "phase": "issue", "primary_issue": n,
                  "declared_home": r["home"] or "", "body_state": r["state"], "split": r["split"],
                  "status_text": r["state"], "text": clean(r["head"]), "src": r["src"], "owner": r["owner"]})

# ── TASK LISTS: numbered/bullet items naming a batch ──────────────────────────
for tl, own in [("CC_A_SESSION_TASK_LIST.md", "CC-A"), ("CC_B_SESSION_TASK_LIST.md", "CC-B"),
                ("CC_C_SESSION_TASK_LIST.md", "CC-C"), ("CC_INFRA_SESSION_TASK_LIST.md", "CC-INFRA")]:
    for ln, line in enumerate(rd(tl).split("\n"), 1):
        t = line.strip()
        if not re.match(r"^(\d+[a-z]?\.|[-*])\s", t): continue
        nm = NAME.findall(t)
        if not nm: continue
        name = EQUIV.get(nm[0], nm[0])
        items.append({"key": name, "name": name, "row": "", "phase": "tasklist", "primary_issue": "",
                      "status_text": clean(t, 160), "text": clean(t), "src": f"{tl}:{ln}", "owner": own})

# ── JOIN ──────────────────────────────────────────────────────────────────────
row_to_key = {}
for it in items:
    if it["phase"] in ("19", "25") and it["row"]:
        row_to_key[it["row"]] = it["key"]
issue_to_key = {}
for it in items:
    if it["phase"] in ("19", "25") and it["primary_issue"]:
        issue_to_key.setdefault(it["primary_issue"], it["key"])
for it in items:
    if it["phase"] != "issue": continue
    h = it.get("declared_home") or ""
    if h in row_to_key:
        it["key"] = row_to_key[h]
    elif re.match(r"^(B|F|P\d+|T)-", h):
        it["key"] = EQUIV.get(h, h)
    elif it["primary_issue"] in issue_to_key:
        it["key"] = issue_to_key[it["primary_issue"]]

groups = defaultdict(list)
for it in items: groups[it["key"]].append(it)

merged = []
for key, rows in groups.items():
    ph = sorted({r["phase"] for r in rows})
    anchor = next((r for r in rows if r["phase"] in ("19", "25", "16", "20", "21", "22", "17", "18")), rows[0])
    merged.append({
        "key": key, "name": next((r["name"] for r in rows if r["name"]), ""),
        "row": next((r["row"] for r in rows if r["row"]), ""),
        "phase": anchor["phase"] if anchor["phase"] not in ("issue", "tasklist") else ph[0],
        "phases": ph, "owner": next((r["owner"] for r in rows if r["owner"] and r["phase"] in ("19", "tasklist")), anchor["owner"]),
        "issues": sorted({r["primary_issue"] for r in rows if r["primary_issue"]}),
        "body_states": sorted({r.get("body_state") for r in rows if r.get("body_state")}),
        "split": any(r.get("split") for r in rows),
        "status_text": anchor["status_text"], "text": anchor["text"],
        "sources": [r["src"] for r in rows],
    })

json.dump(merged, io.open(os.path.join(OUT, "items_v2.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)
print("rows:", len(items), "-> items:", len(merged))
print("by anchor phase:", dict(Counter(m["phase"] for m in merged)))
iss_only = [m for m in merged if m["phases"] == ["issue"]]
print("issue-only items:", len(iss_only), "| of which body-state open:", sum(1 for m in iss_only if m["body_states"] == ["open"]))
print("tasklist-only items:", sum(1 for m in merged if m["phases"] == ["tasklist"]))
