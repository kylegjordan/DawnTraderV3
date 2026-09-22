"""Render the categorised pre-live inventory draft from items_v3.json + decisions.json + manual items."""
import io, json, os, collections, re

OUT = r"C:\Users\kyleg\AppData\Local\Temp\claude\C--DawnTraderV3-new\0fe1c46a-a390-40b1-92b3-b160c6024f60\scratchpad"
DEST = r"C:\DawnTraderV3-new\Claude Comms and Packages\Scope Files\PRE_LIVE_INVENTORY_DRAFT.md"
items = json.load(io.open(os.path.join(OUT, "items_v3.json"), encoding="utf-8"))
dec = json.load(io.open(os.path.join(OUT, "decisions.json"), encoding="utf-8"))

# Items that no file extraction reached: Langston's archive, and queued rows in the plan's history table.
MANUAL = [
    dict(key="BE-MOONBAG", name="Break-even stop + moonbag trailing exits", row="", phase="19", owner="(none)",
         bucket="DECIDE", flag="", src="Langston archive; roadmap §3.1 (Kyle 2026-06-11)",
         why="Config-locked OFF on all four classes by two independent switches; 542 active closes, 0 ever latched. Kyle's 2026-06-11 directive wants a per-mode, per-class set — it has no plan row and no owner. Decide: launch live with them OFF (plain stop and target), or build and switch them on first."),
    dict(key="B-VOLATILITY-CACHE-RETIRE", name="B-VOLATILITY-CACHE-RETIRE", row="2.10 / status board", phase="19", owner="CC-B",
         bucket="HELPFUL", flag="", src="PHASE_19_PLAN:231 (queued; my extractor read that table as history)",
         why="Retire the dead volatility cache and its 0.015 fallback (rule 18). Two riders from Langston: the live fail-loud path has never been exercised, and a `?? 0.5` default in the RTB service is an untested hypothesis."),
    dict(key="P19-B6.10", name="P19-B6.10 — retire the old per-mode guardrails table", row="plan history table", phase="19", owner="?",
         bucket="HELPFUL", flag="verify", src="PHASE_19_PLAN:227 (queued)",
         why="The old guardrails table and its deprecated endpoint are superseded by the new one; before live there should be exactly one source of guardrail values."),
    dict(key="P19-B6.5g", name="P19-B6.5g", row="plan history table", phase="19", owner="?",
         bucket="MERGE:#233", flag="verify", src="PHASE_19_PLAN:222 (queued)", why="its core is #233"),
    dict(key="P19-B15", name="P19-B15 — live and paper share one pipeline", row="plan history table", phase="19", owner="?",
         bucket="MERGE:#322", flag="", src="PHASE_19_PLAN:240 (queued, last)", why="same work as #322"),
    dict(key="B-CROSS-SESSION-BLEED-SM-CONFLICT", name="System Manual row conflict left by B-CROSS-SESSION-BLEED", row="", phase="19", owner="CC-B",
         bucket="AFTER", flag="", src="Langston archive",
         why="A required governance row cannot take N/A, and re-declaring the class lower would downgrade reviewed work. Governance only."),
    dict(key="PLAN-ID-COLLISIONS", name="Two plan-identity collisions", row="", phase="19", owner="CC-A",
         bucket="HELPFUL", flag="", src="Langston 2026-09-22; found again building this draft",
         why="Row 3b.f-d names two different batches, and P19-B12 is both the §19.6 dashboard container and the dt-deploy executable issue. Fix during the reorganisation step, or items get lost."),
]

NAMES = {"rm:21-3a": "21-3a Live Guardrails tab", "rm:21-3b": "21-3b go-live WebSocket-uptime threshold",
         "rm:21-3c": "21-3c engine-start health gate refuses live", "rm:21-3d": "21-3d B-MODE-DELETE-SCOPE",
         "rm:19-17b": "19-17b live_engine_enabled switch-on"}
keys = {i["key"]: i for i in items}
def final(i):
    d = dec.get(i["key"])
    if d: return d[0], d[1], d[2]
    return i["bucket"], i.get("why", ""), ("verify" if i["bucket"] == "PRUNE" else "")

rows = []
for i in items:
    b, why, flag = final(i)
    nm = i.get("name") or i["key"]
    if nm == i["key"] and i["key"].startswith("rm:"):
        t = re.sub(r"^\([^)]*\):?\s*", "", i["text"]).strip()
        nm = i["key"][3:] + " " + re.split(r" — |\. |: ", t)[0][:70]
    nm = NAMES.get(i["key"], nm)
    rows.append(dict(key=i["key"], name=nm, row=i.get("row") or "", phase=i["phase"],
                     owner=i.get("owner") or "", bucket=b, why=why, flag=flag, auto=i["key"] not in dec,
                     issues=i.get("issues") or []))
for m in MANUAL:
    rows.append(dict(key=m["key"], name=m["name"], row=m["row"], phase=m["phase"], owner=m["owner"], bucket=m["bucket"],
                     why=m["why"], flag=m["flag"], auto=False, issues=[], src=m["src"]))

def c(x): return str(x).replace("|", "/").replace("\n", " ").strip()
def ident(r):
    s = f"**{c(r['name'])}**"
    if r["row"] and r["row"] not in r["name"]: s += f" `{c(r['row'])}`"
    if r["issues"] and r["key"].startswith("#") is False: s += " " + " ".join(f"#{n}" for n in r["issues"][:3])
    return s
def fl(r): return " ⚠️ *verify*" if r["flag"] == "verify" else ""

MUST_GROUPS = [
    ("A. Roadmap hard blockers — already written as blockers, in those words (roadmap §3.5)",
     ["rm:21.1.a", "rm:21-3a", "rm:21-3b", "rm:21-3c", "rm:21-3d", "rm:19-17b"]),
    ("B. Building live mode itself", ["rm:21.1", "rm:21.2", "rm:21.3", "#322", "#517", "rm:19-10"]),
    ("C. Risk controls on real capital", ["B-KILLSWITCH-DENOMINATOR", "B-TOTAL-DRAWDOWN-WARNING", "#519", "B-SIZING-DEC-RESTORE",
        "rm:25-8", "rm:25-11", "rm:25-16", "B-VENUE-RESTING-EXITS", "rm:19-9", "B-NONFIAT-QUOTE-DENOMINATION", "rm:20.4.6"]),
    ("D. Price truth — how old, which side, is the feed alive", ["B-PRICE-AGE-TRUTH", "B-PRICE-AGE-REFUSAL", "B-TWO-CACHE-INTENT",
        "B-PRICE-STALENESS-BOUND", "row:6", "B-OPENTRADE-REFRESH-LANE", "B-XSTOCK-SESSION-FRESHNESS", "B-EQUITY-RECONNECT-STALL-TIMER",
        "B-XSTOCK-LIVE-FEED", "B-WS-SUBSCRIBE-CLASS-FILTER", "B-OHLC-FRAME-GUARD", "B-PRICE-SIDE-BY-JOB", "B-REST-SIDES-TO-CACHE",
        "B-BOOK-SUBSCRIPTION-REACH", "B-TICKER-BBO-TRIGGER"]),
    ("E. Entry and exit correctness", ["B-EXIT-TRIGGER-FILL-PARITY", "F-G-2", "B-EXIT-TICKER-LEG-ADAPTER-SIDES", "B-XSTOCK-BID-TRIGGER-RELAND",
        "B-BOOK-STATE-RING-INDEPENDENT-BOUND", "B-BOOK-STATE-RESTART-DURABLE", "B-ENTRY-LEVEL-RECHECK", "B-GRID-LIVE-PATH-PARITY",
        "B-INTENT-ENTRY-PARITY", "row:3h.b", "B-TARGET-FABRICATION", "#204", "#233", "row:8", "B-CLOSE-WRITER-COSTS"]),
    ("F. Knowing which instrument and which mode a record belongs to", ["B-SYMBOL-CLASS-IDENTITY", "B-UNIVERSE-REFRESH-ACTS",
        "B-RTB-SIGNAL-IDENTITY", "B-MODE-PREDICATE-SWEEP"]),
    ("G. The evidence Kyle's comfortable-in-paper judgement rests on", ["rm:19-11", "#235", "rm:25-19", "B-RTB-REFRESH-CONSOLIDATE"]),
    ("H. Security and operations", ["B-SEC-HARDEN", "#935", "#296", "#681", "B-ENGINE-STOP-DURATION-COLUMN"]),
]
byk = {r["key"]: r for r in rows}
must = [r for r in rows if r["bucket"] == "MUST"]
grouped = {k for _, ks in MUST_GROUPS for k in ks}
stray = [r["key"] for r in must if r["key"] not in grouped]
assert not stray, f"MUST items not placed in a group: {stray}"
for _, ks in MUST_GROUPS:
    for k in ks: assert byk[k]["bucket"] == "MUST", (k, byk[k]["bucket"])

cnt = collections.Counter(r["bucket"].split(":")[0] for r in rows)
L = []
A = L.append
A("# PRE-LIVE INVENTORY — CATEGORISED DRAFT (for Langston's review, then Kyle)")
A("")
A("**Kyle, 2026-09-23:** everything left in Phase 19 and planned for 25, 16, 20 and 21, deduped, then bucketed MUST before live / EXTREMELY HELPFUL before live / AFTER live. Kyle picks the pre-live set; then the roadmap and all four task lists are reorganised and every item assigned a session, including a trial of Coltrane as an implementor.")
A("")
A("**Home:** `PHASE_19_PLAN` row 3n.x (owner CC-B). **Working file (raw extraction):** `PRE_LIVE_INVENTORY_WORKING.md`.")
A("")
A("## HOW TO READ THIS")
A("- **The run order already puts everything before live (Kyle 2026-06-08: 19 → 25 → 16+20 → 21, strictly sequential).** So `AFTER` here is a **proposed deferral** that Kyle has to approve, not a default. The burden is on the deferral (Langston's framing, adopted).")
A("- **`MUST` is anchored to roadmap §3.5's own hard-blocker list (group A), then extended to what must be true for (1) Kyle to judge paper honestly and (2) real capital not to be at risk on day one.** Every MUST beyond group A is my judgement and says why in one line.")
A("- **`HELPFUL` = extremely helpful before live.** Mostly calibration and selection quality (paper still loses; these are how it stops), plus visibility.")
A("- **`DECIDE` = not work until Kyle rules.** **`OBSERVATION` = already deployed; its window closes it.** **`MERGE` = the same work as another item.** **`PRUNE` = done, superseded, withdrawn, or an umbrella heading.**")
A("- **⚠️ verify** = my read of the record; the owning session must confirm before the item moves.")
A("- **Not yet in:** replies from OLD, ANALYST and Infra Claude (lane review, items never written down, and what Coltrane can actually touch), and Langston's full archive sweep. First tranche of his archive is in.")
A("")
A("| bucket | items |")
A("|---|---:|")
for b in ["MUST", "DECIDE", "OBSERVATION", "HELPFUL", "AFTER", "KYLE-PARKED", "MERGE", "PRUNE"]:
    A(f"| {b} | {cnt.get(b, 0)} |")
A(f"| **total** | **{len(rows)}** |")
A("")
A(f"## MUST BEFORE LIVE — {len(must)} items, as a Phase-21 entry gate (PHASE_19_PLAN §6 form)")
A("")
A("> ⚠️ Roadmap §3.5's preamble still lists #213 as pending; it was resolved 2026-06-13 (`59d501fc4`). Not carried.")
A("")
n = 0
for title, ks in MUST_GROUPS:
    A(f"### {title}")
    A("")
    A("| # | gate | owner | why it must be true before live | status |")
    A("|---:|---|---|---|---|")
    for k in ks:
        r = byk[k]; n += 1
        A(f"| {n} | {ident(r)} | {c(r['owner']) or '—'} | {c(r['why'])}{fl(r)} | ⏳ |")
    A("")
def simple(title, bucket, note=""):
    rs = [r for r in rows if r["bucket"] == bucket]
    A(f"## {title} — {len(rs)}")
    A("")
    if note: A(note); A("")
    ph = collections.defaultdict(list)
    for r in rs: ph[r["phase"]].append(r)
    order = ["19", "25", "16", "20", "21", "tasklist", "issue"]
    lab = {"19": "Phase 19", "25": "Phase 25", "16": "Phase 16", "20": "Phase 20", "21": "Phase 21", "tasklist": "Task list only", "issue": "Open issue with no plan row"}
    for p in order + [p for p in ph if p not in order]:
        if not ph.get(p): continue
        A(f"**{lab.get(p, 'Phase ' + p)}**")
        A("")
        for r in ph[p]:
            A(f"- {ident(r)} ({c(r['owner']) or 'unowned'}) — {c(r['why'])}{fl(r)}")
        A("")
simple("DECIDE — Kyle rules before these become work", "DECIDE")
simple("OBSERVATION — deployed, running out their windows", "OBSERVATION")
simple("EXTREMELY HELPFUL BEFORE LIVE", "HELPFUL")
simple("AFTER LIVE — proposed deferrals (Kyle approves each)", "AFTER", "Phases 17, 18, 22 and the post-live 21.4/21.5 sections are already placed after live by the roadmap and are listed here without comment.")
simple("PARKED BY KYLE — deliberately undated; not re-scored", "KYLE-PARKED")
mg = [r for r in rows if r["bucket"].startswith("MERGE:")]
A(f"## MERGED INTO ANOTHER ITEM — {len(mg)}")
A("")
A("| item | merged into | why |")
A("|---|---|---|")
for r in mg:
    A(f"| {ident(r)} | `{r['bucket'][6:]}` | {c(r['why'])}{fl(r)} |")
A("")
pr = [r for r in rows if r["bucket"] == "PRUNE"]
pj = [r for r in pr if not r["auto"]]; pa = [r for r in pr if r["auto"]]
A(f"## PRUNED — {len(pr)}")
A("")
A(f"### Judged — {len(pj)}")
A("")
for r in pj: A(f"- {ident(r)} — {c(r['why'])}{fl(r)}")
A("")
A(f"### By the issue's own wording — {len(pa)} ⚠️ owners confirm")
A("")
A("> These were pruned because the issue body says withdrawn / resolved / folded / superseded. **That rule is known to leak:** three of Langston's items (#596, #914, #994) were pruned by it and are live, and have been reinstated above. Each owner should scan their own.")
A("")
A("| item | owner | rule |")
A("|---|---|---|")
for r in pa: A(f"| {ident(r)} | {c(r['owner']) or '—'} | {c(r['why'])} |")
A("")
A("## ADDED BY HAND — no file extraction reached these")
A("")
for m in MANUAL: A(f"- **{m['name']}** — {m['src']}")
A("")
io.open(DEST, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("wrote", DEST, len(L), "lines;", dict(cnt), "must", len(must))
