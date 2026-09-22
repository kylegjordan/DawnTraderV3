"""Raw inventory of every planned / discussed item across the plan, the roadmap, the four
session task lists and the open issue ledger. Mechanical extraction only — no judgement about
priority. Output: a JSON list + a markdown table, each row carrying its SOURCE pointer so every
entry can be checked against the object it came from."""
import io, re, json, os

R = r"C:\DawnTraderV3-new\1-system-manual"
OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"

def read(name):
    return io.open(os.path.join(R, name), encoding="utf-8").read()

DONE_PAT = re.compile(r"✅\s*\**\s*(DONE|CLOSED|SHIPPED|COMPLETE)|\bCLOSED\s+20\d\d-\d\d-\d\d|~~[^~]{0,80}~~\s*\|", re.I)
OPEN_HINT = re.compile(r"not started|PLACED|held|queued|OPEN|IN FLIGHT|OBSERVATION|deferred|blocked|pending|TODO|next", re.I)
NAME_PAT = re.compile(r"`((?:B|P\d+|T|F)-[A-Z0-9][A-Z0-9._\-]+)`")
ISSUE_PAT = re.compile(r"`?#(\d{3,4})`?")
OWNER_PAT = re.compile(r"\b(CC-A|CC-B|CC-C|CC-INFRA|Infra Claude|Langston|Kyle|Coltrane)\b")

def cells(line):
    t = line.lstrip("> ").strip()
    if not t.startswith("|"):
        return None
    parts = [c.strip() for c in t.strip("|").split("|")]
    return parts

def status_of(text):
    if DONE_PAT.search(text[:400]) and not re.search(r"not started|PLACED 20\d\d-\d\d-\d\d — not", text[:600]):
        return "done?"
    if re.search(r"DEPLOYED|OBSERVATION", text, re.I):
        return "observation"
    if re.search(r"IN FLIGHT", text, re.I):
        return "in-flight"
    if re.search(r"not started|PLACED|held|queued|deferred|blocked", text, re.I):
        return "open"
    return "unclear"

items = []

# ── 1. PHASE_19_PLAN — TABLE-AWARE: only the work tables, never the decision log ─────────────
PT = json.load(io.open(os.path.join(OUT, "plan_tables.json"), encoding="utf-8"))
WORK_TABLES = {31: "queue", 542: "queue-2.4", 188: "history-seq", 478: "gates", 499: "issue-dispositions"}
lines19 = read("PHASE_19_PLAN.md").split("\n")
for h, txt, rows in PT:
    kind = WORK_TABLES.get(h)
    if not kind:
        continue                      # the decision log (L354) is NOT a work list
    for ln in rows:
        c = cells(lines19[ln - 1])
        if not c or len(c) < 2:
            continue
        rid = re.sub(r"[*`]", "", c[0]).strip()
        body = " | ".join(c[1:])
        st_cell = c[-1] if kind in ("queue", "history-seq", "gates") else (c[3] if len(c) > 3 else body)
        if kind == "queue-2.4" and len(c) >= 4:
            st_cell = c[3]
        st = status_of(st_cell + " " + body[:300])
        if re.search(r"✅|CLOSED|DONE|SHIPPED|COMPLETE|ABSORBED|SUPERSEDED|WITHDRAWN", st_cell) and not re.search(r"not started|OPEN|PLACED|IN FLIGHT|OBSERVATION", st_cell):
            st = "done?"
        names = NAME_PAT.findall(body)
        owner = OWNER_PAT.findall(body)
        items.append({
            "src": f"PHASE_19_PLAN.md:{ln}", "id": rid,
            "name": names[0] if names else "",
            "issues": sorted(set(ISSUE_PAT.findall(body)))[:6],
            "owner": owner[-1] if owner else "",
            "status": st,
            "gist": re.sub(r"[*`⭐⛔⚠️✅★⇒]+", "", c[1])[:220],
            "phase": "19", "table": kind,
        })

# ── 2. POST_AUDIT_ROADMAP rows for phases 16 / 20 / 21 / 25 (+ any 19-x) ─────
s = read("POST_AUDIT_ROADMAP.md")
for ln, line in enumerate(s.split("\n"), 1):
    c = cells(line)
    if not c or len(c) < 2:
        continue
    rid = re.sub(r"[*`]", "", c[0]).strip()
    m = re.match(r"^(16|19|20|21|25)[-.][0-9A-Za-z.\-]+$", rid)
    if not m:
        continue
    body = " | ".join(c[1:])
    items.append({
        "src": f"POST_AUDIT_ROADMAP.md:{ln}", "id": rid,
        "name": (NAME_PAT.findall(body) or [""])[0],
        "issues": sorted(set(ISSUE_PAT.findall(body)))[:6],
        "owner": (OWNER_PAT.findall(body) or [""])[-1],
        "status": status_of(body),
        "gist": re.sub(r"[*`⭐⛔⚠️✅★⇒]+", "", c[1])[:220],
        "phase": m.group(1),
    })

# ── 2b. POST_AUDIT_ROADMAP section HEADINGS (phases 16/17/18/19/20/21/22 are tabled as headings) ─
s2 = read("POST_AUDIT_ROADMAP.md")
for ln, line in enumerate(s2.split("\n"), 1):
    m = re.match(r"^#{2,4}\s+(~~)?\s*((1[6-9]|2[0-5])(\.[0-9A-Za-z]+)+)\s*(.*)$", line)
    if not m:
        continue
    rid = m.group(2)
    struck = bool(m.group(1)) or "~~" in line[:60]
    body = m.group(5)
    st = "done?" if (struck or re.search(r"✅\s*(DONE|SHIPPED|COMPLETE)|MOVED TO", line)) else status_of(body)
    items.append({
        "src": f"POST_AUDIT_ROADMAP.md:{ln}", "id": rid,
        "name": (NAME_PAT.findall(line) or [""])[0],
        "issues": sorted(set(ISSUE_PAT.findall(line)))[:6],
        "owner": (OWNER_PAT.findall(line) or [""])[-1],
        "status": st,
        "gist": re.sub(r"[*`⭐⛔⚠️✅★⇒~]+", "", body)[:220],
        "phase": rid.split(".")[0],
    })

# ── 3. The four session task lists — bullet / numbered items ────────────────
for tl, owner in [("CC_A_SESSION_TASK_LIST.md", "CC-A"), ("CC_B_SESSION_TASK_LIST.md", "CC-B"),
                  ("CC_C_SESSION_TASK_LIST.md", "CC-C"), ("CC_INFRA_SESSION_TASK_LIST.md", "CC-INFRA")]:
    s = read(tl)
    for ln, line in enumerate(s.split("\n"), 1):
        t = line.strip()
        if not re.match(r"^(\d+[a-z]?\.|[-*]|\|)\s", t):
            continue
        names = NAME_PAT.findall(t)
        if not names and not ISSUE_PAT.search(t):
            continue
        items.append({
            "src": f"{tl}:{ln}", "id": "",
            "name": names[0] if names else "",
            "issues": sorted(set(ISSUE_PAT.findall(t)))[:6],
            "owner": owner,
            "status": status_of(t),
            "gist": re.sub(r"[*`⭐⛔⚠️✅★⇒]+", "", t)[:220],
            "phase": "tasklist",
        })

# ── 4. RUNNING_ISSUES — OPEN entries only ────────────────────────────────────
s = read("RUNNING_ISSUES.md")
for ln, line in enumerate(s.split("\n"), 1):
    m = re.match(r"^#{2,4}\s+#(\d{2,4})\s+(OPEN|DEFERRED|IN PROGRESS|BLOCKED)\b(.*)", line)
    if not m:
        continue
    items.append({
        "src": f"RUNNING_ISSUES.md:{ln}", "id": f"#{m.group(1)}",
        "name": (NAME_PAT.findall(line) or [""])[0],
        "issues": [m.group(1)],
        "owner": (OWNER_PAT.findall(line) or [""])[0],
        "status": m.group(2).lower(),
        "gist": re.sub(r"[*`⭐⛔⚠️✅★⇒]+", "", m.group(3))[:220],
        "phase": "issue",
    })

json.dump(items, io.open(os.path.join(OUT, "inventory_raw.json"), "w", encoding="utf-8"), ensure_ascii=False, indent=1)

from collections import Counter
print("TOTAL raw rows:", len(items))
print("by source phase:", dict(Counter(i["phase"] for i in items)))
print("by status:", dict(Counter(i["status"] for i in items)))
print("rows carrying a batch name:", sum(1 for i in items if i["name"]))
print("distinct batch names:", len({i["name"] for i in items if i["name"]}))
