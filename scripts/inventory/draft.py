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
         bucket="MUST", flag="", src="PHASE_19_PLAN:227 (queued); Langston measured 2026-09-22",
         why="VERIFIED (Langston): the legacy guardrails table still carries its own LIVE row — max position $1,158.09, max daily loss $1,000 — against an $824 account, beside a different live row in the new table. Two live risk rows, two tables, different numbers. Pairs with 21-3a."),
    dict(key="B-OUTCOME-CORPUS-CAPTURE", name="B-OUTCOME-CORPUS-CAPTURE", row="2.4g (second use of the id)", phase="19", owner="?",
         bucket="MUST", flag="", src="PHASE_19_PLAN:561 — missed by the extractor because row id 2.4g is used twice (also B-WAKE-SOURCE-TRUTH); found by the issue-axis status pass",
         why="Closed trades are HARD-DELETED at 90 days and the only record of what a trade earned is an unbacked, untiered log sink — 'the 90-day delete is running NOW'. With real money, trade records cannot expire. Also home of #596 (the outcome record's representativeness, which orders Phase 25)."),
    dict(key="P19-B6.8", name="P19-B6.8 — per-mode guardrail completeness", row="plan history table", phase="19", owner="?",
         bucket="HELPFUL", flag="verify", src="PHASE_19_PLAN:226 — status IN PROGRESS since 2026-06-29",
         why="Reads IN PROGRESS for three months. Folded #323 (daily-loss controls made user-settable). Owner must say whether it closed unmarked or is still open; if open it sits beside 21-3a and P19-B6.10 on live guardrails."),
    dict(key="KRAKEN-LIVE-KEY", name="Provision the live Kraken API key", row="", phase="21", owner="Kyle",
         bucket="MUST", flag="", src="Langston review 2026-09-22 — absent from all 608 items",
         why="Nothing in the inventory provisions the live exchange credential: trade-only, withdrawals disabled, IP-allowlisted, with a stated rotation and a stated blast radius if it leaks. Live-only, cheap, catastrophic tail."),
    dict(key="LIVE-FEE-SCHEDULE", name="Confirm the live fee schedule before the first real order", row="", phase="21", owner="?",
         bucket="MUST", flag="", src="Langston review 2026-09-22",
         why="The EV gate is a fee-difference machine. The xStock fee contract created a live epoch and sits in observation; the older fee-accuracy item was pruned with a verify flag. No row says the live fees are right."),
    dict(key="25-11a", name="25-11a — refuse a position larger than the visible book", row="split from 25-11", phase="25", owner="?",
         bucket="MUST", flag="", src="Langston review 2026-09-22",
         why="Small and fail-closed: do not open a position larger than a stated fraction of visible depth, and do not model an exit at a price the book cannot fill. Whether it ever binds depends on Kyle's day-one size."),
    dict(key="DISK-HEADROOM", name="One number: months of database headroom at the measured write rate", row="", phase="20", owner="?",
         bucket="MUST", flag="", src="Langston review 2026-09-22",
         why="A full disk stops the engine with real positions open. Not retention work, one measurement: if the headroom comfortably clears the run-in, retention stays where it is (HELPFUL/AFTER)."),
    dict(key="DEAD-CODE-REACHABILITY", name="Reachability census: which dead code can a live path reach", row="", phase="19", owner="?",
         bucket="MUST", flag="", src="Langston review 2026-09-22",
         why="The roadmap's capital-letters blocker (#953) is a legacy limb reachable from a live path. Rule: dead code reachable from a live path is MUST, the rest AFTER. The census sorts #528, #518, #742, 3n.a, 3n.b and the other dead-code items."),
    dict(key="PAPER-STANDARD", name="What 'comfortable in paper' means — stated BEFORE the data", row="", phase="19", owner="Kyle",
         bucket="DECIDE", flag="", src="Langston review r2 2026-09-22",
         why="The go-live gate is Kyle's comfort with paper results, and nothing asks him to state the standard in advance — so the paper run has no completion criterion. A standard stated after the data is not a standard."),
    dict(key="DAY-ONE-NUMBERS", name="Day-one balance, per-trade size and concurrency", row="", phase="25", owner="Kyle",
         bucket="DECIDE", flag="", src="Langston review 2026-09-22",
         why="25-16 produces the evidence (a sensitivity range); the numbers are Kyle's — balance, per-trade size, concurrency, and 25-11a's fraction of visible book depth (both sizing fields are user-locked)."),
    dict(key="PROCESS-DEATH-FORM", name="How a live position is protected if our server dies", row="", phase="21", owner="Kyle",
         bucket="DECIDE", flag="", src="Langston review 2026-09-22",
         why="Resting stop orders at the exchange (strongest; changes fill behaviour and collides with the price grid, maker/taker and BE/moonbag), or a watchdog that flattens positions when our process dies (cheaper, weaker)."),
    dict(key="NONFIAT-FORK", name="Non-USD and pure-fiat pairs: fix the maths or exclude them", row="", phase="19", owner="Kyle",
         bucket="DECIDE", flag="", src="Langston review 2026-09-22",
         why="Excluding them is nearly free; fixing the denomination maths lets them trade."),
    dict(key="P19-B6.5g", name="P19-B6.5g", row="plan history table", phase="19", owner="?",
         bucket="MERGE:#233", flag="verify", src="PHASE_19_PLAN:222 (queued)", why="its core is #233"),
    dict(key="P19-B15", name="P19-B15 — live and paper share one pipeline", row="plan history table", phase="19", owner="?",
         bucket="MERGE:#322", flag="", src="PHASE_19_PLAN:240 (queued, last)", why="same work as #322"),
    dict(key="B-CROSS-SESSION-BLEED-SM-CONFLICT", name="System Manual row conflict left by B-CROSS-SESSION-BLEED", row="", phase="19", owner="CC-B",
         bucket="AFTER", flag="", src="Langston archive",
         why="A required governance row cannot take N/A, and re-declaring the class lower would downgrade reviewed work. Governance only."),
    dict(key="PLAN-ID-COLLISIONS", name="Two plan-identity collisions", row="", phase="19", owner="CC-A",
         bucket="HELPFUL", flag="", src="Langston 2026-09-22; found again building this draft",
         why="Row 3b.f-d names two different batches; row 2.4g names two (B-WAKE-SOURCE-TRUTH and B-OUTCOME-CORPUS-CAPTURE); and P19-B12 is both the §19.6 dashboard container and the dt-deploy executable issue. Fix during the reorganisation step, or items get lost."),
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
    ("A. Roadmap hard blockers (roadmap §3.5, in its own words), the live risk rows, the live key, and public-facing authorisation",
     ["rm:21.1.a", "rm:21-3a", "P19-B6.10", "rm:21-3c", "rm:21-3d", "KRAKEN-LIVE-KEY", "B-SEC-HARDEN"]),
    ("B. Building live mode itself", ["rm:21.1", "rm:21.2", "rm:21.3", "#322", "#517", "rm:19-10", "LIVE-FEE-SCHEDULE"]),
    ("C. Risk controls on real capital", ["B-KILLSWITCH-DENOMINATOR", "B-TOTAL-DRAWDOWN-WARNING", "#519", "B-SIZING-DEC-RESTORE",
        "25-11a", "rm:25-16", "B-VENUE-RESTING-EXITS", "rm:19-9", "B-NONFIAT-QUOTE-DENOMINATION"]),
    ("D. Price truth — how old, which side, is the feed alive", ["B-PRICE-SIDE-BY-JOB", "B-PRICE-STALENESS-BOUND", "row:6",
        "B-EQUITY-RECONNECT-STALL-TIMER", "B-XSTOCK-LIVE-FEED", "B-WS-SUBSCRIBE-CLASS-FILTER", "B-OHLC-FRAME-GUARD",
        "B-REST-SIDES-TO-CACHE", "B-BOOK-SUBSCRIPTION-REACH", "#506"]),
    ("D2. Keeping the record of what happened", ["B-OUTCOME-CORPUS-CAPTURE"]),
    ("E. Entry and exit correctness", ["B-EXIT-TRIGGER-FILL-PARITY", "B-EXIT-TICKER-LEG-ADAPTER-SIDES", "B-XSTOCK-BID-TRIGGER-RELAND",
        "B-BOOK-STATE-RING-INDEPENDENT-BOUND", "B-BOOK-STATE-RESTART-DURABLE", "B-ENTRY-LEVEL-RECHECK", "B-GRID-LIVE-PATH-PARITY",
        "B-INTENT-ENTRY-PARITY", "row:3h.b", "DEAD-CODE-REACHABILITY", "B-TARGET-FABRICATION", "#204", "#233", "row:8", "B-CLOSE-WRITER-COSTS"]),
    ("F. Knowing which instrument and which mode a record belongs to", ["B-SYMBOL-CLASS-IDENTITY", "B-UNIVERSE-REFRESH-ACTS",
        "B-RTB-SIGNAL-IDENTITY", "B-MODE-PREDICATE-SWEEP"]),
    ("G. The evidence Kyle's comfortable-in-paper judgement rests on", ["rm:19-11", "#235", "rm:25-19", "B-RTB-REFRESH-CONSOLIDATE",
        "B-LEARNING-SYSTEM-CENSUS"]),
    ("H. Operator reach and operations", ["#935", "B-DASHBOARD-AUTH-RACE", "#296", "#681", "#168", "#521",
        "B-ENGINE-STOP-DURATION-COLUMN", "DISK-HEADROOM"]),
]
# Kyle's decisions come FIRST. UNLOCKS is structured: decision -> (text, MUST keys that wait on it). Each listed MUST gets the edge.
UNLOCKS = {
    "PAPER-STANDARD": ("the completion criterion for the paper run (19-11) and so for all of group G", ["rm:19-11"]),
    "#323": ("how the kill switch and the daily-loss trip behave (auto-stop, alert-only, or user-set)", ["B-KILLSWITCH-DENOMINATOR", "#519"]),
    "BE-MOONBAG": ("if 'build and on': 3n.c trailing-state durability (+#677, #678) becomes MUST. Take together with the process-death decision", []),
    "rm:19-18": ("the shape of 21.1, the live engine", ["rm:21.1"]),
    "rm:21-3b": ("go-live itself (roadmap hard blocker)", []),
    "DAY-ONE-NUMBERS": ("B-SIZING-DEC-RESTORE's target and 25-11a's threshold; decided AFTER 25-16's evidence", ["B-SIZING-DEC-RESTORE", "25-11a"]),
    "PROCESS-DEATH-FORM": ("the form of B-VENUE-RESTING-EXITS; resting stops reach into grid rounding and must be decided together with BE/moonbag", ["B-VENUE-RESTING-EXITS"]),
    "NONFIAT-FORK": ("the form of B-NONFIAT-QUOTE-DENOMINATION (fix vs exclude)", ["B-NONFIAT-QUOTE-DENOMINATION"]),
    "rm:19-17b": ("nothing — it IS the go-live act, the last step", []),
    "B-VTS-NO-DECISION-VALVE": ("learning lane only — no MUST", []),
    "B-PRICE-FLOOR-REVIEW": ("no MUST", []),
    "B-TARGET-MULTIPLE-VS-HORIZON": ("no MUST (gated on 2.4g-3)", []),
}
# PRECEDENCE only (A must finish before B can). Containment (a batch listing its own sub-parts) is NOT an edge — see CONTAINS.
DEPS = {
    "B-SYMBOL-CLASS-IDENTITY": ["B-UNIVERSE-REFRESH-ACTS"],
    "B-RTB-SIGNAL-IDENTITY": ["B-SYMBOL-CLASS-IDENTITY"],
    "B-BOOK-SUBSCRIPTION-REACH": ["#506"],
    "rm:21-3a": ["P19-B6.10"],
    "rm:21.2": ["rm:21.1", "KRAKEN-LIVE-KEY"],
    "rm:21.3": ["rm:21.1"],
    "#517": ["rm:21.1"],
    "LIVE-FEE-SCHEDULE": ["KRAKEN-LIVE-KEY"],
    "B-BOOK-STATE-RESTART-DURABLE": ["B-BOOK-STATE-RING-INDEPENDENT-BOUND"],
    "B-EXIT-TRIGGER-FILL-PARITY": ["B-PRICE-SIDE-BY-JOB"],
    "#681": ["#168"],
}
# Declared NON-precedence cross-references (a reason cites another item as evidence or as a family member).
RELATES = {("B-DASHBOARD-AUTH-RACE", "#935"): "same operator-reach family", ("B-DASHBOARD-AUTH-RACE", "#517"): "same operator-reach family",
           ("B-SEC-HARDEN", "#935"): "cites #935's measurement as reachability evidence"}
CONTAINS = {"B-PRICE-SIDE-BY-JOB": ["B-REST-SIDES-TO-CACHE", "B-EXIT-TICKER-LEG-ADAPTER-SIDES", "B-XSTOCK-BID-TRIGGER-RELAND"]}
for dk, (_, ms) in UNLOCKS.items():
    for m in ms: DEPS.setdefault(m, []).append(dk)
byk = {r["key"]: r for r in rows}
must = [r for r in rows if r["bucket"] == "MUST"]
grouped = {k for _, ks in MUST_GROUPS for k in ks}
stray = [r["key"] for r in must if r["key"] not in grouped]
assert not stray, f"MUST items not placed in a group: {stray}"
for _, ks in MUST_GROUPS:
    for k in ks: assert byk[k]["bucket"] == "MUST", (k, byk[k]["bucket"])
closure_breaks = [(m, d, byk[d]["bucket"]) for m, ds in DEPS.items() for d in ds
                  if byk[m]["bucket"] == "MUST" and byk[d]["bucket"] not in ("MUST", "DECIDE")]
assert not closure_breaks, f"MUST closure broken: {closure_breaks}"
for p, ch in CONTAINS.items():
    assert byk[p]["bucket"] == "MUST", (p, byk[p]["bucket"])
    for k in ch: assert byk[k]["bucket"] in ("MUST", "MERGE:" + p), ("CONTAINS child not MUST", k, byk[k]["bucket"])
for k in UNLOCKS: assert byk[k]["bucket"] == "DECIDE", (k, byk[k]["bucket"])
undecided = [r["key"] for r in rows if r["bucket"] == "DECIDE" and r["key"] not in UNLOCKS]
assert not undecided, f"DECIDE items with no UNLOCKS entry: {undecided}"
# why-string scan: a MUST whose reason names another MUST by key, with no edge either way
must_keys = {r["key"] for r in must}
why_unlinked = []
for r in must:
    for k in must_keys:
        if k != r["key"] and re.search(r"(?<![A-Za-z0-9#:-])" + re.escape(k) + r"(?![A-Za-z0-9-])", r["why"]) and k not in DEPS.get(r["key"], []) and r["key"] not in DEPS.get(k, []) \
           and k not in CONTAINS.get(r["key"], []) and r["key"] not in CONTAINS.get(k, []):
            if (r["key"], k) not in RELATES: why_unlinked.append((r["key"], k))
unowned = [r["key"] for r in must if not r["owner"] or r["owner"] in ("?", "(none)")]
# identifiers that point at two items (Langston 1(c))
iss = collections.defaultdict(list)
for r in rows:
    for x in r["issues"]: iss[x].append(r)
collisions = {x: rs for x, rs in iss.items() if len(rs) > 1 and len({q["key"] for q in rs}) > 1}

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
A("- **Langston review r1 applied (2026-09-22):** MUST set made dependency-closed; decisions moved first; live risk rows, live key, fee schedule, disk headroom, dead-code reachability added; 25-8 dropped as wrong at the ref.")
A("- **Not yet in:** replies from OLD, ANALYST and Infra Claude (lane review, items never written down, and what Coltrane can actually touch), and Langston's full archive sweep.")
A("")
A("| bucket | items |")
A("|---|---:|")
for b in ["MUST", "DECIDE", "OBSERVATION", "HELPFUL", "AFTER", "KYLE-PARKED", "MERGE", "PRUNE"]:
    A(f"| {b} | {cnt.get(b, 0)} |")
A(f"| **total** | **{len(rows)}** |")
A("")
dec_rows = sorted([r for r in rows if r["bucket"] == "DECIDE"], key=lambda r: list(UNLOCKS).index(r["key"]))
A(f"## FIRST: KYLE'S DECISIONS — {len(dec_rows)} (several MUST items cannot start until these are made)")
A("")
A("| # | decision | what it unlocks | the fork |")
A("|---:|---|---|---|")
for j, r in enumerate(dec_rows, 1):
    A(f"| {j} | {ident(r)} | {c(UNLOCKS[r['key']][0])} | {c(r['why'])}{fl(r)} |")
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
A("**Dependency check (computed, not spot-checked):** every PRECEDENCE prerequisite of a MUST is itself a MUST or a Kyle decision — "
  + str(sum(len(v) for v in DEPS.values())) + " edges checked (containment — a batch listing its own sub-parts — is kept separate and not counted). "
  + "Every decision's unlock list is enforced as an edge. PRUNE and OBSERVATION are NOT admissible prerequisites.")
A("")
A("⚠️ **THE MUST SET IS NOT CLOSED TODAY — it is closed CONDITIONAL on three things:** the dead-code reachability census (which moves items INTO MUST), Kyle's decisions above, and the lane replies still owed by OLD, ANALYST and Infra Claude. The full Net Expectancy verdict (beyond 25-19's narrowed gate) needs #596 first and stays Phase 25.")
A("")
if why_unlinked:
    A("**Reasons that name another MUST with no edge either way (check these):** " + "; ".join(f"{x} → {y}" for x, y in why_unlinked))
    A("")
A("**Status pass (mechanical, `scripts/inventory/status_pass.py`, reads the GOVERNED plan at the stamped ref):** two axes over the WHOLE row text — rows that name an open item by row id or batch name, and rows that cite an open item's `#NNN`. Every hit was read. Name axis: 1 real close (B-DISAGREEMENT-FINDER). Issue axis: #320/#321 delivered in P19-B6.5b (closed 2026-06-17), #970 delivered by row 8.5, #671 and #596 have placed homes — and it surfaced B-OUTCOME-CORPUS-CAPTURE, missing because plan id 2.4g is used twice. The rest are homes, cross-references or a restart number. Items with no plan citation were checked against their issue entries: no resolution notes; #935 awaits CC-C.")
A("")
A("**Why-string scan (word-boundary match on every MUST key):** " + str(len(why_unlinked)) + " unlinked mentions; " + str(len(RELATES)) + " declared non-precedence cross-references (" + "; ".join(f"{a} → {b}: {w}" for (a, b), w in RELATES.items()) + ").")
A("")
A(f"**Ownership:** {len(unowned)} of {len(must)} MUST items have no owner — assigning them is the reorganisation step.")
A("")
A(f"## IDENTIFIERS THAT POINT AT TWO ITEMS — {len(collisions)} (resolve in the reorganisation step)")
A("")
A("Some are honest shared citations; some are one number minted twice (#921, #559 are two different issues each). Minting fixes stay AFTER; this document's dedupe does not.")
A("")
for x, rs in sorted(collisions.items(), key=lambda t: int(t[0])):
    A(f"- **#{x}** — " + " · ".join(f"{c(q['name'])} ({q['bucket']})" for q in rs))
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
