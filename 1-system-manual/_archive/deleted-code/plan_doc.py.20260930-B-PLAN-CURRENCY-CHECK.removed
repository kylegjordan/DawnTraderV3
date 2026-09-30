"""Generate the governed push plan, 1-system-manual/SPRINT_TO_LIVE_PLAN.md, from order.py + assignments.
Owners are CC-B's proposal (2026-09-28, Kyle-directed); each owning session confirms on its first touch."""
import io, json, os, collections
from importlib import util
HERE = os.path.dirname(os.path.abspath(__file__))
spec = util.spec_from_file_location("order", os.path.join(HERE, "order.py")); o = util.module_from_spec(spec); spec.loader.exec_module(o)
rows = {r[1]: r for r in json.load(io.open(os.path.join(HERE, "sort_sheet.json"), encoding="utf-8"))}
DEST = r"C:\DawnTraderV3-new\1-system-manual\SPRINT_TO_LIVE_PLAN.md"

from clusters import CLUSTERS
SHORT = {"CC-A": "CC-A (Old Claude)", "CC-B": "CC-B (New Claude)", "CC-C": "CC-C (Analyst Claude)", "Infra": "Infra Claude"}
OWN = {k: SHORT[s] for s, _, ks in CLUSTERS for k in ks}
PLUS = {"PAPER-STANDARD": " + Langston", "rm:21-3b": " + Langston", "B-VTS-NO-DECISION-VALVE": " + Langston", "rm:19-11": " + Langston",
        "#522": " + Langston (+ Coltrane)", "#235": " + Langston", "CODEX-PRICING-REVIEW": " (+ Coltrane)"}
for k, v in PLUS.items(): OWN[k] += v
PLATES = [
 ("CC-A (Old Claude)", "B-GOV-REPORTING — pushed, the review gate never ran", "FINISH: its rules are in use by all four sessions; run Langston's gate"),
 ("CC-A (Old Claude)", "B-RULES-1e — Step 2", "PAUSE cleanly: crew tooling, after live"),
 ("CC-A (Old Claude)", "B-MEASURE-GATE beyond leg 2 — Step 2", "PAUSE cleanly: after live"),
 ("CC-A (Old Claude)", "B-INSTRUMENTS-OVER-RULES — usage measure to 2026-10-02", "FINISH the measure, then close"),
 ("CC-A (Old Claude)", "B-DEPLOY-DRIFT-LINE — observation window", "FINISH: convert when its criterion is read"),
 ("CC-A (Old Claude)", "B-SCHEDULER-FIRST-TICK — next up, not started", "HAND to Infra (its sprint row)"),
 ("CC-B (New Claude)", "B-REACH-BASELINE-ADJUST — 7-day review read 2026-09-28", "✅ CLOSED 2026-09-29: the crowding arm fired; Kyle overrode the rollback and kept the rows"),
 ("CC-B (New Claude)", "B-FEED-MISMATCH-FIX — observation to ~2026-10-10", "FINISH: convert at close"),
 ("CC-B (New Claude)", "B-XSTOCK-FEE-CONTRACT — observation (~21 days from 09-11)", "FINISH: convert at close"),
 ("CC-B (New Claude)", "B-ARCHIVE-RETENTION-SIZING — was waiting on Kyle", "CLOSE: Kyle decided 2026-09-23 (August moves to warm storage in October)"),
 ("CC-B (New Claude)", "T-W20C-SCALAR-LEG — not started", "stays as its sprint row (Wave A3)"),
 ("CC-C (Analyst Claude)", "B-OHLC-FRAME-GUARD — Step 7", "FINISH (Wave 0)"),
 ("CC-C (Analyst Claude)", "F-G-1 — conversion owed, reopened", "FINISH (Wave 0)"),
 ("CC-C (Analyst Claude)", "B-PRICE-SIDE-BY-JOB — 8a-P4c window to 09-30, then increments 2-3; plus B-XSTOCK-BID-TRIGGER-RELAND, B-VTS-NO-DECISION-VALVE and 8c per-leg levels on the crypto quant lane (needs Langston's hold re-ruled); CC-C estimate 2026-09-28: plate clear ~10-12 to 10-14, three deploys", "FINISH AND DEPLOY before the sprint starts (Kyle 2026-09-28: no trigger, fill or booking left on the midpoint)"),
 ("CC-C (Analyst Claude)", "B-REST-SIDES-TO-CACHE, B-BOOK-STATE-RESTART-DURABLE — built", "FINISH: deploy after 09-30 (Wave 0)"),
 ("CC-C (Analyst Claude)", "B-SIZING-DEC-RESTORE — half live", "FINISH: stays with CC-C (in flight); now placed in the sprint"),
 ("CC-C (Analyst Claude)", "B-XSTOCK-SESSION-FRESHNESS — open", "continues as its sprint row"),
 ("CC-C (Analyst Claude)", "F-G-2 — window void since 09-05", "absorbed into B-PRICE-SIDE-BY-JOB; close as absorbed"),
 ("Infra Claude", "B-LANGSTON-CONTEXT increment 2 — chunk 1 Step 7, chunk 2 part 1 Step 3", "FINISH the chunks in flight, then PAUSE the rest (after live)"),
 ("Infra Claude", "B-WAKE-LEAD-NAME — Step 10", "FINISH"),
 ("Infra Claude", "B-CREDENTIALS-PRIVATE-REPO (#1023) — NEW, Kyle 2026-09-28: (1) Kyle changes the two test-user passwords and the owner password himself; (2) no password in the repo again: sessions read it from a server-only file; (3) document-only pushes skip the CI check while the deploy gate still finds a green check for the code it deploys; (4) give Langston's review reads, the Helsinki backup mirror and every other reader a read key; (5) then make the repo private (GitHub Pro $4/month if the minutes need it)", "RUN NOW, while the other plates clear (Kyle 2026-09-28)"),
 ("Infra Claude", "B-TOKEN-WATCH — Step 7, paused", "stays PAUSED: research, after live"),
 ("Infra Claude", "#670, B-CREW-STATUS-2, #974", "stay parked / after live"),
]
KYLE_ACT = {"KRAKEN-LIVE-KEY": "Kyle creates the key on Kraken; Infra sets it up", "DAY-ONE-NUMBERS": "Kyle sets the numbers; CC-A brings the evidence",
            "PROCESS-DEATH-FORM": "Kyle picks; CC-A + Langston propose", "rm:19-17b": "Kyle approves the switch", "B-SEC-HARDEN": "Kyle rotates the password first",
            "PAPER-STANDARD": "Kyle approves the numbers"}
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
A("# SPRINT TO LIVE — THE PLAN (governed, Tier 1)")
A("")
A("> **Kyle, 2026-09-28.** This document is the working plan from here to live trading. It replaces phase names: one list, in order. **Renamed 2026-09-29 (Kyle): the \"push to live\" is now the SPRINT TO LIVE; this file was `PUSH_TO_LIVE_PLAN.md`.** It is the **active phase plan** for `CLAUDE.md` §9.4 purposes — a new item's HOME is a placed row here. `PHASE_19_PLAN.md` stays as history and for the detail each row links to.")
A("")
A("## 0. Clear the plates first (Kyle, 2026-09-28)")
A("")
A("Before any session starts its sprint rows, everything it has in flight is **finished** (if it is in the sprint, or nearly done, or leads to something that must be finished) or **paused cleanly** at a batch boundary and moved to the after-live list. Each session confirms its own lines; this table is CC-B's read of the four task lists at 2026-09-28.")
A("")
A("| session | in flight now | disposition |"); A("|---|---|---|")
for row in PLATES: A("| " + " | ".join(row) + " |")
A("")
A("## 1. The rule — what is in the sprint")
A("")
A("An item is in the sprint **only** if it serves one of these (Kyle's words, condensed):")
A("")
A("1. **Mechanics** — the pipeline works as intended: filtering, pattern detection, DBS, regime classification, strategy selection and signal generation, SQE evaluation, the RTB pool and its refresh, opening and closing trades.")
A("2. **Tuning** — thresholds, ranges, gates, regime classification, strategies, and the confidence and prediction scores.")
A("3. **Prices** — the feed is correct and paper uses the right price for each job.")
A("4. **Paper tells the truth** — no mistake that makes paper look better or worse than it is.")
A("5. **Learning data** — we capture what we currently intend to learn from.")
A("6. **Live-mode readiness** — the live engine, risk controls on real money, security, the live key, the environment.")
A("7. **The evidence** — paper trading profitably and consistently, judged against Kyle's standard.")
A("")
A("**Everything else goes after live** — machine learning, the AMR, break-even / trailing / moonbag exits, the non-US-dollar currency conversion, crew and reviewer tooling, legacy cleanup that no live path can reach, research ideas. The after-live list is `Claude Comms and Packages/Scope Files/PRE_LIVE_SPRINT.md` (208 items on 2026-09-28: 167 judged after-live in the Langston-approved r8 inventory + 41 judged after-live against these rules; the '172' in earlier review notes was a count from before later moves).")
A("")
A("**Tooling boundary (Langston, 2026-09-28):** crew and reviewer tooling is in the sprint ONLY if it gates the sprint's own correctness (e.g. `B-PLAN-CURRENCY-CHECK`, which keeps this plan true). Everything else in that group waits for live.")
A("")
A("## 2. New discoveries — the intake test (Kyle, 2026-09-28)")
A("")
A("Anything found while working — a bug, an issue, a needed fix — gets the same test **in the same turn it is found** (this is the §9.4 disposition, applied to this plan):")
A("- **Meets the rule in §1** → it gets a row here, placed in the right wave, with an owner and a batch reference. It is part of the sprint.")
A("- **Does not** → it goes to the after-live list, with a one-line reason.")
A("- ⛔ A discovery that can stop trading or lose money now is still a hotfix, and the hotfix path applies first.")
A("")
A("## 3. How this plan is kept current")
A("")
A("- **Every item is a batch** (or a hotfix, investigation or sub-batch), run through the normal eleven-step workflow; its report is linked from its row.")
A("- **The owner updates its row at every batch close** (status + report link), in the same governance turn — and adds any discovery that passes §2. ⏳ **To be made a Tier-1 ledger row in `workflow-10-governance` and graded by the governance checker** (proposed below — Langston to rule).")
A("- **Finish what is in flight** (Kyle): work already under way is completed, including any follow-on it was leading up to; a clean break is taken at the next batch boundary.")
A("- **Clear plates first** (Kyle): before any session starts its sprint rows, it finishes or cleanly pauses everything it has in flight — see section 0.")
A("- **Owners** are assigned by connected group (section 6); reassign by editing the row and saying why.")
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
        for s in ("CC-A", "CC-B", "CC-C", "Infra"):
            if ow.startswith(s): load[s] += 1
        kn = f" ⭐ {KYLE_ACT[k]}." if k in KYLE_ACT else ""
        A(f"| {n} | {nm} | {ref(k)} | {ow} | {STATUS.get(k, 'QUEUED')} | — | {c_(note)}{kn} |")
    A("")
A("## 5. Running now — observation windows")
A("")
A("| item | owner | closes |"); A("|---|---|---|")
for k, own, closes in [("8a-P4c (VTS xStock price instrument)", "CC-C", "2026-09-30T00:00Z"), ("B-FEED-MISMATCH-FIX", "CC-B", "300 taker closes or 2026-10-10"),
                       ("B-REACH-BASELINE-ADJUST", "CC-B", "✅ closed 2026-09-29"), ("B-XSTOCK-FEE-CONTRACT", "CC-B", "21 days from 2026-09-11"),
                       ("F-G-1 (venue price grid)", "CC-C", "window closed 2026-09-04 — conversion owed; reopened, see Wave 0"),
                       ("B-DEPLOY-DRIFT-LINE", "CC-A", "observation window open"), ("B-INSTRUMENTS-OVER-RULES", "CC-A", "2026-10-02")]:
    A(f"| {k} | {own} | {closes} |")
A("")
A("## 6. Who owns what — grouped so connected work stays with one session")
A("")
A("> The numbers below are an item TALLY, not effort — items differ in size by an order of magnitude (Langston).")
A("")
A("Kyle 2026-09-28: an even split by connected groups; earlier ownership is not a factor; Kyle owns no rows — his decisions and actions are marked ⭐ inside the owning session's row.")
A("")
A("| session | group | items |"); A("|---|---|---:|")
_push = set(json.load(io.open(os.path.join(HERE, "push_keys.json"), encoding="utf-8")))
for s, title, ks in CLUSTERS: A(f"| {SHORT[s]} | {title} | {len([k for k in ks if k in _push])} |")
_stale = sorted(k for _, _, ks in CLUSTERS for k in ks if k not in _push)
if _stale: print("cluster keys not in the sprint (not counted):", _stale)
A("")
A("## 7. Coltrane — proposed role (for Langston's view, then Kyle)")
A("")
A("- **Not an implementer in this sprint.** Making him one is its own setup batch: he cannot push to the review branch (his key reaches only the agent-work repo, so a session must pull, review and push his work), his clone has no installed packages so he cannot run the type check or tests, and a full build on the shared 3 GB reviewer box is unmeasured. Kyle: *don't spend a long batch setting him up.*")
A("- **A second, independent reviewer on the batches where a miss costs most** — a different model family reading the same diff after Langston's code review: the price layer (§1.3), risk controls and the live engine (§1.6), security, and the end-to-end runtime audit (`#522`). Read-only; his review goes in the channel and the batch report.")
A("- **Two preconditions:** his privacy check (`COLTRANE-PARITY`, Wave B1) and Kyle allowing sessions to call him for those batch types (today only Kyle may).")
A("")
io.open(DEST, "w", encoding="utf-8", newline="\n").write("\n".join(L) + "\n")
print("rows", n, dict(load))
