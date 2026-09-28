"""Generate the governed push plan, 1-system-manual/PUSH_TO_LIVE_PLAN.md, from order.py + assignments.
Owners are CC-B's proposal (2026-09-28, Kyle-directed); each owning session confirms on its first touch."""
import io, json, os, collections
from importlib import util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = util.spec_from_file_location("order", os.path.join(HERE, "order.py")); o = util.module_from_spec(spec); spec.loader.exec_module(o)
rows = {r[1]: r for r in json.load(io.open(os.path.join(HERE, "sort_sheet.json"), encoding="utf-8"))}
DEST = r"C:\DawnTraderV3-new\1-system-manual\PUSH_TO_LIVE_PLAN.md"

OWN = {
 # Wave 0
 "B-OUTCOME-CORPUS-CAPTURE": "CC-B", "RULINGS-DURABILITY": "Infra", "DISK-HEADROOM": "Infra", "PAPER-STANDARD": "CC-C + Langston",
 "PLAN-ID-COLLISIONS": "CC-B", "B-OHLC-FRAME-GUARD": "CC-C", "B-REST-SIDES-TO-CACHE": "CC-C", "B-BOOK-STATE-RESTART-DURABLE": "CC-C",
 "F-G-1-REOPEN": "CC-C", "B-PRICE-SIDE-BY-JOB": "CC-C",
 # A1
 "B-UNIVERSE-REFRESH-ACTS": "CC-C", "B-SYMBOL-CLASS-IDENTITY": "CC-C", "B-RTB-SIGNAL-IDENTITY": "CC-B", "B-VTS-CLASS-LABEL-INTEGRITY": "CC-B",
 "B-CLOSED-TRADES-CLASS-BACKFILL": "CC-B", "NONFIAT-FORK": "CC-C", "B-NONFIAT-QUOTE-DENOMINATION": "CC-C", "B-QUOTE-ADMISSION-LEGACY-SWEEP": "CC-C",
 "B-QUOTE-LEG-INTEGRITY": "CC-C", "B-PRICE-FLOOR-REVIEW": "CC-C", "B-VENUE-PAIRS-REINIT": "CC-C", "B-SCAN-BREADTH-DECLINE": "CC-C",
 "B-XSTOCK-LIVE-FEED": "CC-C", "row:6": "CC-C", "B-PRICE-STALENESS-BOUND": "CC-C", "B-EQUITY-RECONNECT-STALL-TIMER": "CC-C",
 "B-WS-SUBSCRIBE-CLASS-FILTER": "CC-A", "#506": "CC-C", "B-BOOK-SUBSCRIPTION-REACH": "CC-C", "B-CRYPTO-MARK-AGE-GATE": "CC-C",
 "B-XSTOCK-SESSION-FRESHNESS": "CC-C", "B-XSTOCK-ENTRY-COMPARATOR": "CC-C", "B-DECIDED-INTENT-INDEX": "CC-C", "B-POST-GRID-MUTATION-CENSUS": "CC-C",
 "row:7": "CC-C", "#1033": "CC-C", "#972": "CC-B", "#566": "CC-B", "CODEX-PRICING-REVIEW": "CC-C + Coltrane", "B-SIZING-DEC-RESTORE": "CC-C", "#628": "CC-C",
 # A2
 "#233": "CC-B", "#199": "CC-B", "row:3m-ENUM": "CC-B", "B-SILENT-STRATEGY-CENSUS": "CC-B", "B-TARGET-FABRICATION": "CC-C", "#574": "CC-A",
 "B-RTB-REFRESH-CONSOLIDATE": "CC-A", "#570": "CC-C", "#699": "CC-C", "rm:19.2": "CC-A", "B-ENTRY-LEVEL-RECHECK": "CC-B",
 "B-INTENT-ENTRY-PARITY": "CC-C", "B-GRID-LIVE-PATH-PARITY": "CC-C", "RESTING-ORDER-DEADLINE": "CC-C", "#630": "CC-A",
 "B-EXIT-TRIGGER-FILL-PARITY": "CC-C", "B-EXIT-TICKER-LEG-ADAPTER-SIDES": "CC-C", "B-XSTOCK-BID-TRIGGER-RELAND": "CC-C",
 "B-BOOK-STATE-RING-INDEPENDENT-BOUND": "CC-C", "#204": "CC-C", "row:3h.b": "CC-C", "B-EXIT-LATCH-INVESTIGATION": "CC-A", "EXIT-PATH-AUDIT-MAP": "CC-C",
 "#166": "CC-B", "B-CLOSE-WRITER-COSTS": "CC-B", "B-SCHEDULER-FIRST-TICK": "CC-A", "#585": "CC-B", "B-STRING-TRUTHINESS-GUARDS": "CC-A",
 "B-GUARD-COVERAGE-AUDIT": "CC-A", "B-LEARNING-SYSTEM-CENSUS": "CC-A", "DEAD-CODE-REACHABILITY": "CC-A", "B-MODE-PREDICATE-SWEEP": "CC-C",
 "row:8": "CC-C", "B-COST-MATH-CONSOLIDATION": "CC-C", "#527": "CC-B", "B-IMPLEMENTATION-SHORTFALL": "CC-C", "B-GRID-REFUSAL-RATE": "CC-C",
 "B-VALIDATE-OBSERVABILITY": "CC-C", "B-DIAG-READ-INTEGRITY": "CC-B", "B-FILTER-DIAG-XSTOCK": "CC-B", "#664": "CC-B", "#419": "CC-B",
 "#549": "CC-B", "#561": "CC-B", "#547": "CC-C", "#522": "CC-A + Langston (+ Coltrane)", "#235": "CC-A + Langston",
 # A3
 "B-PAPER-LANE-PROVENANCE": "CC-B", "T-W20C-SCALAR-LEG": "CC-B", "#515": "CC-B", "#631": "CC-B", "#504": "CC-B", "B-DECISION-INSTANT-QUOTE": "CC-C",
 "B-EXIT-DECISION-RUNG-STAMP": "CC-C", "B-TRADE-RECORD-JOINABILITY": "CC-B", "B-VPNL-WRITER-BOUND": "CC-B", "B-VTS-MARK-SIDE": "CC-C",
 "B-VTS-NO-DECISION-VALVE": "CC-C + Langston", "#658": "CC-C", "#220": "CC-B", "#1072": "CC-C", "B-ARCHIVE-WRITER-LIFECYCLE": "CC-C",
 "B-EPOCH-PARITY-FENCE": "CC-C", "B-ROLLBACK-EPOCH-FORWARD": "CC-B", "#590": "CC-A", "B-OBS-WINDOW-EVIDENCE-CAPTURE": "CC-C",
 "B-PROVENANCE-LOSS-CENSUS": "CC-C", "#231": "CC-B", "rm:25-9": "CC-C", "row:9": "CC-C",
 # A4
 "#914": "CC-C", "rm:25-18": "CC-C", "#645": "CC-C", "B-EXCURSION-RECORD": "CC-B", "rm:25-17": "CC-B", "rm:25-17b": "CC-B", "rm:25-20": "CC-B",
 "B-TARGET-MULTIPLE-VS-HORIZON": "CC-B", "rm:25-26": "CC-B", "B-EXIT-MAKER-VS-TAKER-REVIEW": "CC-B", "#648": "CC-B", "#201": "CC-B", "#529": "CC-B",
 "B-FAMILY-POOL-REACHABILITY": "CC-C", "B-IDEAL-POOL-STARVATION": "CC-A", "rm:25-12": "CC-C", "rm:25-13": "CC-C", "rm:25-14": "CC-C",
 "rm:25-2": "CC-A", "rm:25-10": "CC-A", "rm:25-7": "CC-A", "rm:16.7": "CC-A", "#588": "CC-A", "rm:25-4": "CC-A", "rm:25-3": "CC-C",
 "rm:25-15": "CC-C", "rm:25-19": "CC-C", "#644": "CC-C", "#221": "CC-A", "#149": "CC-B",
 # A5
 "rm:19-11": "CC-C + Langston",
 # B
 "B-SEC-HARDEN": "CC-A (Kyle rotates the password first)", "B-SSH-KEY-CENSUS": "Infra", "#615": "Infra", "COLTRANE-PARITY": "Infra",
 "#681": "Infra", "#168": "Infra", "P19-B12": "Infra",
 "#634": "CC-B", "#632": "CC-C", "B-KILLSWITCH-DENOMINATOR": "CC-C", "B-TOTAL-DRAWDOWN-WARNING": "CC-C", "#519": "CC-B", "B-TEC-PRIME-BOOT-RACE": "CC-B",
 "#521": "CC-B", "B-ENGINE-STOP-DURATION-COLUMN": "CC-B", "#619": "CC-A", "B-DASHBOARD-AUTH-RACE": "CC-C", "#296": "CC-A",
 "rm:21.1.a": "CC-C", "rm:21-3c": "CC-C", "rm:21-3d": "CC-A", "rm:19-10": "CC-A", "rm:21.1": "CC-A", "#322": "CC-A", "P19-B6.10": "CC-A",
 "rm:21-3a": "CC-A", "#517": "CC-A", "rm:21.3": "CC-A", "rm:19-9": "CC-A", "25-11a": "CC-A", "PROCESS-DEATH-FORM": "Kyle (CC-A + Langston propose)",
 "B-VENUE-RESTING-EXITS": "CC-A", "B-KRAKEN-FEE-WATCH": "CC-B",
 "KRAKEN-LIVE-KEY": "Kyle + Infra", "LIVE-FEE-SCHEDULE": "CC-C", "rm:25-16": "CC-C", "DAY-ONE-NUMBERS": "Kyle", "rm:21-3b": "CC-C + Langston",
 "rm:21.2": "CC-A", "rm:19-17b": "Kyle",
}
OWN.update({k: "CC-A" for k in ["#632", "B-KILLSWITCH-DENOMINATOR", "B-TOTAL-DRAWDOWN-WARNING", "rm:21.1.a", "rm:21-3c", "B-SCAN-BREADTH-DECLINE",
    "B-PRICE-FLOOR-REVIEW", "B-VENUE-PAIRS-REINIT", "rm:25-3", "rm:25-15", "rm:25-19", "#644", "LIVE-FEE-SCHEDULE", "rm:25-16"]})
OWN.update({"B-DASHBOARD-AUTH-RACE": "Infra", "B-GRID-REFUSAL-RATE": "CC-B", "B-VALIDATE-OBSERVABILITY": "CC-B"})
STATUS = {"B-OHLC-FRAME-GUARD": "IN FLIGHT — Step 7", "B-REST-SIDES-TO-CACHE": "BUILT — deploy after 2026-09-30", "B-BOOK-STATE-RESTART-DURABLE": "BUILT — deploy after 2026-09-30",
          "F-G-1-REOPEN": "REOPENED — Step 3", "B-PRICE-SIDE-BY-JOB": "IN FLIGHT — 8a-P4c window to 2026-09-30", "B-SIZING-DEC-RESTORE": "IN FLIGHT — half live",
          "B-EXIT-LATCH-INVESTIGATION": "QUEUED", "B-SCHEDULER-FIRST-TICK": "QUEUED — next in CC-A's list"}
def c_(x): return str(x).replace("|", "/").replace("\n", " ").strip()
def ref(k):
    if k.startswith(("B-", "P19-", "F-G-")): return k
    if k.startswith("#"): return f"{k} — batch named at Step 1"
    if k.startswith("rm:"): return f"roadmap {k[3:]} — batch named at Step 1"
    if k.startswith("row:"): return f"plan row {k[4:]}"
    return "— batch named at Step 1"
L = []; A = L.append
A("# PUSH TO LIVE — THE PLAN (governed, Tier 1)")
A("")
A("> **Kyle, 2026-09-28.** This document is the working plan from here to live trading. It replaces phase names: one list, in order. It is the **active phase plan** for `CLAUDE.md` §9.4 purposes — a new item's HOME is a placed row here. `PHASE_19_PLAN.md` stays as history and for the detail each row links to.")
A("")
A("## 1. The rule — what is in the push")
A("")
A("An item is in the push **only** if it serves one of these (Kyle's words, condensed):")
A("")
A("1. **Mechanics** — the pipeline works as intended: filtering, pattern detection, DBS, regime classification, strategy selection and signal generation, SQE evaluation, the RTB pool and its refresh, opening and closing trades.")
A("2. **Tuning** — thresholds, ranges, gates, regime classification, strategies, and the confidence and prediction scores.")
A("3. **Prices** — the feed is correct and paper uses the right price for each job.")
A("4. **Paper tells the truth** — no mistake that makes paper look better or worse than it is.")
A("5. **Learning data** — we capture what we currently intend to learn from.")
A("6. **Live-mode readiness** — the live engine, risk controls on real money, security, the live key, the environment.")
A("7. **The evidence** — paper trading profitably and consistently, judged against Kyle's standard.")
A("")
A("**Everything else goes after live** — machine learning, the AMR, break-even / trailing / moonbag exits, the non-US-dollar currency conversion, crew and reviewer tooling, legacy cleanup that no live path can reach, research ideas. The after-live list is `Claude Comms and Packages/Scope Files/PRE_LIVE_PUSH.md`.")
A("")
A("## 2. New discoveries — the intake test (Kyle, 2026-09-28)")
A("")
A("Anything found while working — a bug, an issue, a needed fix — gets the same test **in the same turn it is found** (this is the §9.4 disposition, applied to this plan):")
A("- **Meets the rule in §1** → it gets a row here, placed in the right wave, with an owner and a batch reference. It is part of the push.")
A("- **Does not** → it goes to the after-live list, with a one-line reason.")
A("- ⛔ A discovery that can stop trading or lose money now is still a hotfix, and the hotfix path applies first.")
A("")
A("## 3. How this plan is kept current")
A("")
A("- **Every item is a batch** (or a hotfix, investigation or sub-batch), run through the normal eleven-step workflow; its report is linked from its row.")
A("- **The owner updates its row at every batch close** (status + report link), in the same governance turn — and adds any discovery that passes §2. ⏳ **To be made a Tier-1 ledger row in `workflow-10-governance` and graded by the governance checker** (proposed below — Langston to rule).")
A("- **Finish what is in flight** (Kyle): work already under way is completed, including any follow-on it was leading up to; a clean break is taken at the next batch boundary.")
A("- **Owners are proposals** (CC-B, 2026-09-28) until each session confirms on first touch; reassign by editing the row.")
A("")
A("## 4. The plan")
A("")
A("Status: `QUEUED` · `IN FLIGHT — Step N` · `BUILT` · `OBSERVATION` · `DONE — report`. Two tracks run side by side and meet at go-live; Wave 0 is this week.")
A("")
n = 0; load = collections.Counter()
for wid, title, items in o.WAVES:
    A(f"### Wave {wid} — {title}")
    A("")
    A("| # | item | batch / reference | owner | status | report | note |")
    A("|---:|---|---|---|---|---|---|")
    for k, note in items:
        n += 1
        r = rows.get(k); nm = c_(r[2]) if r else k
        ow = OWN.get(k, "?")
        for s in ("CC-A", "CC-B", "CC-C", "Infra", "Kyle"):
            if ow.startswith(s): load[s] += 1
        A(f"| {n} | {nm} | {ref(k)} | {ow} | {STATUS.get(k, 'QUEUED')} | — | {c_(note)} |")
    A("")
A("## 5. Running now — observation windows")
A("")
A("| item | owner | closes |"); A("|---|---|---|")
for k, own, closes in [("8a-P4c (VTS xStock price instrument)", "CC-C", "2026-09-30T00:00Z"), ("B-FEED-MISMATCH-FIX", "CC-B", "300 taker closes or 2026-10-10"),
                       ("B-REACH-BASELINE-ADJUST", "CC-B", "7-day review due 2026-09-27 — overdue"), ("B-XSTOCK-FEE-CONTRACT", "CC-B", "21 days from 2026-09-11"),
                       ("F-G-1 (venue price grid)", "CC-C", "window closed 2026-09-04 — conversion owed; reopened, see Wave 0"),
                       ("B-DEPLOY-DRIFT-LINE", "CC-A", "observation window open"), ("B-INSTRUMENTS-OVER-RULES", "CC-A", "2026-10-02")]:
    A(f"| {k} | {own} | {closes} |")
A("")
A("## 6. Load per session (proposed)")
A("")
A("| session | items |"); A("|---|---:|")
for s, v in load.most_common(): A(f"| {s} | {v} |")
A("")
A("## 7. Coltrane — proposed role (for Langston's view, then Kyle)")
A("")
A("- **Not an implementer in this push.** Making him one is its own setup batch: he cannot push to the review branch (his key reaches only the agent-work repo, so a session must pull, review and push his work), his clone has no installed packages so he cannot run the type check or tests, and a full build on the shared 3 GB reviewer box is unmeasured. Kyle: *don't spend a long batch setting him up.*")
A("- **A second, independent reviewer on the batches where a miss costs most** — a different model family reading the same diff after Langston's code review: the price layer (§1.3), risk controls and the live engine (§1.6), security, and the end-to-end runtime audit (`#522`). Read-only; his review goes in the channel and the batch report.")
A("- **Two preconditions:** his privacy check (`COLTRANE-PARITY`, Wave B1) and Kyle allowing sessions to call him for those batch types (today only Kyle may).")
A("")
io.open(DEST, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("rows", n, dict(load))
