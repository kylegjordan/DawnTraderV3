"""Re-sort the pre-live inventory by Kyle's go-live criteria (2026-09-28) into ONE push list + an after-live list.
Criteria (Kyle): M mechanics sound and working as intended · C calibration (thresholds, gates, regimes, strategies,
confidence/predictive scores) · P correct prices · T paper tells the truth · D learning data captured as intended ·
R consistent profitability evidence · L live-mode readiness (Kyle: live fixes mixed into the same push).
Everything else -> X (after live)."""
import io, json, os, collections
OUT = os.path.dirname(os.path.abspath(__file__))
DEST = r"C:\DawnTraderV3-new\Claude Comms and Packages\Scope Files\PRE_LIVE_PUSH.md"
rows = {r[1]: r for r in json.load(io.open(os.path.join(OUT, "sort_sheet.json"), encoding="utf-8"))}
dec = json.load(io.open(os.path.join(OUT, "decisions.json"), encoding="utf-8"))
kd = json.load(io.open(os.path.join(OUT, "kyle_decisions.json"), encoding="utf-8"))

MUST_CAT = {  # from the approved MUST groups
 "L": ["rm:21.1.a", "rm:21-3a", "P19-B6.10", "rm:21-3c", "rm:21-3d", "KRAKEN-LIVE-KEY", "B-SEC-HARDEN", "#615", "B-SSH-KEY-CENSUS",
       "rm:21.1", "rm:21.2", "rm:21.3", "#322", "#517", "rm:19-10", "LIVE-FEE-SCHEDULE",
       "B-KILLSWITCH-DENOMINATOR", "B-TOTAL-DRAWDOWN-WARNING", "#519", "#634", "#632", "25-11a", "rm:25-16", "B-VENUE-RESTING-EXITS", "rm:19-9",
       "#935", "B-DASHBOARD-AUTH-RACE", "#296", "#681", "#168", "#521", "B-ENGINE-STOP-DURATION-COLUMN", "DISK-HEADROOM", "B-TEC-PRIME-BOOT-RACE", "#619"],
 "P": ["B-PRICE-SIDE-BY-JOB", "B-PRICE-STALENESS-BOUND", "row:6", "B-EQUITY-RECONNECT-STALL-TIMER", "B-XSTOCK-LIVE-FEED", "B-WS-SUBSCRIBE-CLASS-FILTER",
       "B-OHLC-FRAME-GUARD", "B-REST-SIDES-TO-CACHE", "B-BOOK-SUBSCRIPTION-REACH", "#506", "F-G-1-REOPEN"],
 "M": ["B-EXIT-TRIGGER-FILL-PARITY", "B-EXIT-TICKER-LEG-ADAPTER-SIDES", "B-XSTOCK-BID-TRIGGER-RELAND", "B-BOOK-STATE-RING-INDEPENDENT-BOUND",
       "B-BOOK-STATE-RESTART-DURABLE", "B-ENTRY-LEVEL-RECHECK", "B-GRID-LIVE-PATH-PARITY", "B-INTENT-ENTRY-PARITY", "row:3h.b", "DEAD-CODE-REACHABILITY",
       "B-TARGET-FABRICATION", "#204", "#233", "B-CLOSE-WRITER-COSTS", "B-EXIT-LATCH-INVESTIGATION", "#630", "RESTING-ORDER-DEADLINE",
       "B-SYMBOL-CLASS-IDENTITY", "B-UNIVERSE-REFRESH-ACTS", "B-RTB-SIGNAL-IDENTITY", "B-MODE-PREDICATE-SWEEP", "B-SIZING-DEC-RESTORE",
       "B-NONFIAT-QUOTE-DENOMINATION", "#235", "B-RTB-REFRESH-CONSOLIDATE", "B-LEARNING-SYSTEM-CENSUS"],
 "T": ["row:8", "B-CLOSE-WRITER-COSTS"],
 "D": ["B-OUTCOME-CORPUS-CAPTURE"],
 "C": ["rm:25-19"],
 "R": ["rm:19-11"],
}
# Judged one by one against Kyle's criteria (was HELPFUL / AFTER / DECIDE)
J = {
 # mechanics
 "#1033": "M", "#166": "M", "#199": "M", "#522": "M", "#566": "M", "#570": "M", "#574": "M", "#585": "M", "#628": "M", "#699": "M",
 "#972": "M", "B-GUARD-COVERAGE-AUDIT": "M", "B-QUOTE-ADMISSION-LEGACY-SWEEP": "M", "B-QUOTE-LEG-INTEGRITY": "M", "B-SCAN-BREADTH-DECLINE": "M",
 "B-SCHEDULER-FIRST-TICK": "M", "B-SILENT-STRATEGY-CENSUS": "M", "B-STRING-TRUTHINESS-GUARDS": "M", "B-VENUE-PAIRS-REINIT": "M",
 "EXIT-PATH-AUDIT-MAP": "M", "row:3m-ENUM": "M", "NONFIAT-FORK": "M",
 # prices
 "B-CRYPTO-MARK-AGE-GATE": "P", "B-DECIDED-INTENT-INDEX": "P", "B-POST-GRID-MUTATION-CENSUS": "P", "B-XSTOCK-ENTRY-COMPARATOR": "P",
 "B-XSTOCK-SESSION-FRESHNESS": "P", "CODEX-PRICING-REVIEW": "P", "row:7": "P",
 # paper tells the truth
 "#527": "T", "#547": "T", "#549": "T", "#561": "T", "#664": "T", "#419": "T", "B-COST-MATH-CONSOLIDATION": "T", "B-FILTER-DIAG-XSTOCK": "T",
 "B-GRID-REFUSAL-RATE": "T", "B-IMPLEMENTATION-SHORTFALL": "T", "B-VALIDATE-OBSERVABILITY": "T", "B-DIAG-READ-INTEGRITY": "T",
 # learning data
 "#1072": "D", "#220": "D", "#504": "D", "#515": "D", "#590": "D", "#631": "D", "#658": "D", "#231": "D", "B-ARCHIVE-WRITER-LIFECYCLE": "D",
 "B-CLOSED-TRADES-CLASS-BACKFILL": "D", "B-DECISION-INSTANT-QUOTE": "D", "B-EPOCH-PARITY-FENCE": "D", "B-EXIT-DECISION-RUNG-STAMP": "D",
 "B-OBS-WINDOW-EVIDENCE-CAPTURE": "D", "B-PAPER-LANE-PROVENANCE": "D", "B-PROVENANCE-LOSS-CENSUS": "D", "B-ROLLBACK-EPOCH-FORWARD": "D",
 "B-TRADE-RECORD-JOINABILITY": "D", "B-VPNL-WRITER-BOUND": "D", "B-VTS-CLASS-LABEL-INTEGRITY": "D", "B-VTS-MARK-SIDE": "D",
 "T-W20C-SCALAR-LEG": "D", "rm:25-9": "D", "row:9": "D", "B-VTS-NO-DECISION-VALVE": "D",
 # calibration
 "#149": "C", "#201": "C", "#529": "C", "#588": "C", "#645": "C", "#648": "C", "#914": "C", "#644": "C", "B-EXCURSION-RECORD": "C",
 "B-EXIT-MAKER-VS-TAKER-REVIEW": "C", "B-FAMILY-POOL-REACHABILITY": "C", "B-IDEAL-POOL-STARVATION": "C", "rm:16.7": "C", "rm:19.2": "C",
 "rm:25-10": "C", "rm:25-12": "C", "rm:25-13": "C", "rm:25-14": "C", "rm:25-15": "C", "rm:25-17": "C", "rm:25-17b": "C", "rm:25-18": "C",
 "rm:25-2": "C", "rm:25-20": "C", "rm:25-26": "C", "rm:25-3": "C", "rm:25-4": "C", "rm:25-7": "C", "B-PRICE-FLOOR-REVIEW": "C",
 "B-TARGET-MULTIPLE-VS-HORIZON": "C",
 # live readiness
 "B-KRAKEN-FEE-WATCH": "L", "P19-B12": "L", "rm:21-3b": "L", "DAY-ONE-NUMBERS": "L", "PROCESS-DEATH-FORM": "L", "rm:19-17b": "L",
 # profitability evidence
 "PAPER-STANDARD": "R",
 # Kyle 2026-09-28: the three flagged items join the push
 "RULINGS-DURABILITY": "L", "COLTRANE-PARITY": "L", "#221": "C",
 # Kyle 2026-09-28: legacy code that could still reach a trade is removed BEFORE live (gated on DEAD-CODE-REACHABILITY);
 # pure tidying (database structure, tests, screens) stays after. Operator alerting joins too.
 "B-TRADING-ENGINE-REMOVAL": "M", "B-SQE-DEADCODE-PURGE": "M", "rm:16.6": "M", "#589": "M", "B-WS-V1-RESIDUE-SWEEP": "M",
 "B-VENUE-QUIET-ALERTING": "L", "#692": "L",
 "B-LIVE-PROCESS-SPLIT": "L", "STAGING-RESIZE": "L", "B-PLAN-CURRENCY-CHECK": "L",
 # the reorganisation itself
 "PLAN-ID-COLLISIONS": "M",
 # decided / confirmed by Kyle — no work
 "#323": "DONE", "rm:19-18": "DONE", "B-BALANCE-TRUTH": "DONE",
}
EXCEPTION_CANDIDATES = {"RULINGS-DURABILITY": "cheap, and a lost file cannot be rebuilt (Langston placed it FIRST BREAK)",
                        "COLTRANE-PARITY": "needed only if the Coltrane implementor trial goes ahead",
                        "#221": "parked by Kyle — but both asset classes launch together, so how the RTB ranks crypto against xStock signals may matter for selection"}
LABEL = {"M": "1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close)",
         "C": "2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores",
         "P": "3. Prices — the feed is correct and paper uses the right price for each job",
         "T": "4. Paper tells the truth — no mistake that makes results look better or worse than they are",
         "D": "5. Learning data — capturing what we intend to learn from",
         "L": "6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment",
         "R": "7. The evidence — trading profitably and consistently in paper"}
OWNER = {"B-KILLSWITCH-DENOMINATOR": "CC-C", "rm:21.1.a": "CC-C", "rm:21-3c": "CC-C", "B-XSTOCK-SESSION-FRESHNESS": "CC-C", "B-SEC-HARDEN": "CC-A",
         "B-TSC-GUARD-CWD": "CC-B", "B-GDRIVE-UNMOUNT": "Infra Claude", "B-RULES-1E-LANGSTON-SLIM": "Infra Claude", "#570": "CC-C", "#608": "CC-B",
         "#609": "CC-B", "#610": "CC-B", "#611": "CC-B", "#612": "CC-B", "#972": "CC-B", "#1026": "Infra Claude", "#1035": "Infra Claude",
         "B-VTS-CLASS-LABEL-INTEGRITY": "CC-B", "#634": "CC-B", "B-NONFIAT-QUOTE-DENOMINATION": "CC-C", "B-PRICE-FLOOR-REVIEW": "CC-C",
         "B-TARGET-MULTIPLE-VS-HORIZON": "CC-B", "PAPER-STANDARD": "CC-C + Langston", "rm:21-3b": "CC-C + Langston", "B-VTS-NO-DECISION-VALVE": "CC-C + Langston",
         "B-EXIT-TRIGGER-FILL-PARITY": "CC-C"}
WHY = {"B-NONFIAT-QUOTE-DENOMINATION": "Kyle decided 2026-09-28: exclude plain currency pairs and non-dollar-priced crypto now, keep dollar-pegged coins — if the exclusion is small; the proper conversion goes after live",
       "B-SIZING-DEC-RESTORE": "paper sizing to Kyle's intent: balance = Kraken balance, up to 100% in trades, a consistent ~$140-150 per trade, 15-20 trades able to open; half-live today (obj-1/10/11 live, obj-2..5 not built). Analyst answering which setting caps slots now",
       "PAPER-STANDARD": "Kyle's shape: profitable consistently over a sustained period, the major tuning done, the mechanics confirmed end to end; CC-C + Langston propose the numbers for his approval",
       "B-PRICE-FLOOR-REVIEW": "Kyle decided 2026-09-28: replace the $0.25 floor with a real market-depth test (traded volume, number of trades, book depth, price step) so low-priced coins are not shut out; VTS shows them no worse than dearer coins",
       "B-TARGET-MULTIPLE-VS-HORIZON": "the strategy floor/ceiling/reward-risk review is done (09-13, 09-20); what remains is moving the targets of strategies whose targets sit too far — tuning, no Kyle decision",
       "DAY-ONE-NUMBERS": "Kyle 2026-09-28: live settings stay as they are until the live-mode work; set them then",
       "PROCESS-DEATH-FORM": "parked with the live-mode work: resting stops at the exchange vs a flatten-on-death watchdog",
       "rm:19-17b": "the go-live switch itself — the last step",
       "rm:21-3b": "Kyle delegated 2026-09-28 to CC-C + Langston: the go-live price-feed reliability threshold",
       "B-VTS-NO-DECISION-VALVE": "Kyle delegated 2026-09-28 to CC-C + Langston under the 09-03 price-side delegation; before live only if quick",
       "#632": "the daily-loss count restarts at zero on every restart — Kyle 2026-09-28: fix now, the fix carries to production"}
cat = {}
for c, ks in MUST_CAT.items():
    for k in ks: cat.setdefault(k, c)
for k, c in J.items(): cat[k] = c
push, after, parked, obs, missing = collections.defaultdict(list), [], [], [], []
for k, r in rows.items():
    b = r[0]
    if b == "OBSERVATION": obs.append(r); continue
    if b == "KYLE-PARKED" and k not in cat: parked.append(r); continue
    c = cat.get(k)
    if c == "DONE": continue
    if c: push[c].append(r); continue
    if b == "MUST": missing.append(k); continue
    after.append(r)
assert not missing, f"MUST items without a push category: {missing}"
# the push key set order.py asserts against — written here so the two can never drift
json.dump(sorted(r[1] for v in push.values() for r in v), open(os.path.join(OUT, "push_keys.json"), "w"), indent=0)
unjudged = [r[1] for r in after if rows[r[1]][0] in ("HELPFUL", "DECIDE")]
def c_(x): return str(x).replace("|", "/").replace("\n", " ").strip()
def why(r):
    if r[1] in WHY: return c_(WHY[r[1]])
    return c_(r[4]) if r[4] else c_((dec.get(r[1]) or ["", ""])[1])
def own(r): return OWNER.get(r[1], r[3])
L = []; A = L.append
total_push = sum(len(v) for v in push.values())
A("# THE PUSH TO LIVE — the re-sorted list (Kyle's go-live rules, 2026-09-28)")
A("")
A("**Kyle's rule:** everything needed to get paper to the point where the mechanics are sound and working as intended, the thresholds / gates / regimes / strategies / scores are tuned, the prices are right, paper tells the truth, we capture the data we mean to learn from, and paper trades profitably and consistently — plus the live-mode fixes, mixed into the same push. **Everything else goes after live.** No phase names: one list, prioritised next.")
A("")
A(f"**In the push: {total_push}** · **After live: {len(after)}** · **Running now (observation windows): {len(obs)}** · **Parked by Kyle: {len(parked)}** · awaiting owner confirmation: see the draft's UNCONFIRMED section.")
A("")
A("| category | items |"); A("|---|---:|")
for c in "MCPTDLR": A(f"| {LABEL[c]} | {len(push[c])} |")
A("")
A("> Source: `PRE_LIVE_INVENTORY_DRAFT.md` (Langston-approved r8) re-sorted by `scripts/inventory/sort.py`; the working order is `scripts/inventory/order.py` (asserts every push item appears exactly once); Kyle's decisions in `scripts/inventory/kyle_decisions.json`. The order is CC-B's draft for Langston's review; owners are provisional until the session assignment.")
A("")
from order import WAVES
TAG = {"M": "mechanics", "C": "tuning", "P": "prices", "T": "paper truth", "D": "learning data", "L": "live readiness", "R": "evidence"}
A("## THE WORKING ORDER")
A("")
A("Two tracks run side by side and meet at go-live. **Track A** is the trading system: foundations first (the things that corrupt everything downstream), then the mechanics stage by stage with the learning-data work alongside, then tuning on the clean data, then the evidence. **Track B** is live-mode readiness: safety work that can start now, risk controls and restart safety, the live engine (after your production-environment decision), and go-live preparation. **Wave 0** is this week. Within a wave the numbers are the working order; 'after X' means it waits for X.")
A("")
n = 0
for wid, title, items in WAVES:
    A(f"### Wave {wid} — {title}")
    A("")
    for k, note in items:
        n += 1
        r = rows.get(k)
        nm = c_(r[2]) if r else k
        A(f"{n}. **{nm}** ({c_(own(r)) if r else '—'}) · *{TAG.get(cat.get(k, ''), '')}* — {c_(note)}")
    A("")
A(f"## Running now — observation windows ({len(obs)})")
A("")
for r in obs: A(f"- **{c_(r[2])}** ({c_(r[3]) or '—'}) — {why(r)}")
A("")
A(f"## After live — {len(after)}")
A("")
theme = collections.defaultdict(list)
for r in after:
    k, w = r[1], (r[4] or "").lower()
    if "amr" in w or k.startswith(("B-AMR", "rm:25-6")) or k in ("#608", "#609", "#610", "#611", "#612"): t = "AMR and machine learning"
    elif k.startswith(("rm:17", "rm:18", "rm:25-1", "rm:25-2")) or "ml" in w.split(): t = "AMR and machine learning"
    elif k in ("BE-MOONBAG", "SHADOW-BE-MOONBAG", "B-TEC-STATE-DURABILITY", "row:3n.c") or "trailing" in w or "moonbag" in w: t = "Break-even, trailing and moonbag exits"
    elif "perp" in w or k in ("#144",): t = "Perpetual futures"
    elif any(s in w for s in ("rule 18", "dead", "legacy", "delete", "remove", "orphan")) or k.startswith("rm:16"): t = "Legacy and dead-code cleanup (the reachability census may pull some forward)"
    elif any(s in w for s in ("reviewer", "langston", "crew", "governance", "checker", "alert", "comms", "hook", "tooling", "process", "coltrane", "discord", "wake", "memory")): t = "Crew, reviewer, governance and alert tooling"
    elif any(s in w for s in ("storage", "disk", "retention", "tier", "database")) or k.startswith("rm:20"): t = "Storage, database and production hardening"
    else: t = "Other (research, UI, refactors)"
    theme[t].append(r)
for t in sorted(theme):
    A(f"### {t} — {len(theme[t])}")
    A("")
    for r in sorted(theme[t], key=lambda r: r[1]): A(f"- {c_(r[2])} ({c_(own(r)) or '—'}) — {why(r)[:160]}")
    A("")
A(f"## Parked by Kyle — {len(parked)} (unchanged)")
A("")
for r in parked: A(f"- {c_(r[2])} — {why(r)}")
A("")
io.open(DEST, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("push", {c: len(push[c]) for c in "MCPTDLR"}, "total", total_push, "after", len(after), "obs", len(obs), "parked", len(parked))
print("HELPFUL/DECIDE sent after live:", len(unjudged), unjudged)
