# CC-B (NEW Claude) — SESSION TASK LIST — plain language, as of 2026-09-29

> **Rebuilt 2026-09-29 from `SPRINT_TO_LIVE_PLAN.md`, which is the authority: if this list and the plan disagree, this list is stale.** The previous version (as of 2026-09-13, with the original 2026-09-01 census) is in git history at `23b4700b2`. Every row points at its record (plan row, `RUNNING_ISSUES` number, alert id); the record is the truth, this file is the index. Kyle 2026-09-05: every slotted task lands here in the same turn.

## ⛔ OPEN AND STALLED — every batch I have opened and not closed, the step it stalled at, and what it waits on

| batch | step | waiting on |
|---|---|---|
| **`B-FEED-MISMATCH-FIX`** (row `3n.u`) | **STEP 10 of 11 — observation window** | the data: 300 taker closes or 2026-10-10T00:02:43Z, whichever first. How it is read (per side of each boundary, the short-n rule, the reset excluded) is fixed in amendment 4a (`0c8918c5d`), Langston-confirmed. Then the progress report converts to the completion report. |
| **`B-XSTOCK-FEE-CONTRACT`** (`#1010`, row 2.4-FEE) | **closed batch, observation still open** | 2026-10-02T20:09:47Z: P8 closes INCONCLUSIVE (Langston 2026-09-29 — PASS was unreachable by construction); Arm B's verdict of record is re-run after the window and Langston re-derives it. The held deploy may go at or after 20:10Z. Successor: `B-FEE-BASIS-STAMP` (`#1097`, sprint row 107a). |
| **`T-W20C-SCALAR-LEG`** (sprint row 107) | **scope r1 drafted 2026-09-13 (`6e97a8f1c`), never ruled** | its turn in the sprint, after row 106 `B-PAPER-LANE-PROVENANCE` |
| **`B-FEED-BY-SITUATION-AUDIT`** (row `3n.t`) | **held since 2026-09-15** | a placement: it was held behind `3n.s`, which is now after live, and it sits in neither list — asked of Langston 2026-09-29 |

## Checks I hold (alerts)

| alert | when | what |
|---|---|---|
| `c25e722d` | 2026-10-02T08:00Z | the pre-registered 52.24 GiB reclaim from the October 1 archive move (Langston's; I follow through). A no-op sweep is a defect at sprint row 6. |
| `ac32818d` | 2026-10-06T07:00Z | the weekly `dt-deploy` observation; re-mint on each resolve |

## THE QUEUE, in working order — my rows in `SPRINT_TO_LIVE_PLAN.md` (51)

**Wave A1 — foundations:** 39a `B-CRYPTO-BIRTH-FEED` (⭐ Kyle decision rides `#977`) · 46 `#972` xStock ATR empty around the open and close · 47 `#566` volatility measured with a lag.

**Wave A2 — mechanics, stage by stage:** 49 `#233` drift and volume inputs fed as fixed defaults (+ `#514`) · 50 `#199` xStock volume confirmation · 51 `3m-ENUM` volatility_edge's pattern path · 52 `B-SILENT-STRATEGY-CENSUS` (`#1070`) · 54 `#574` a made-up volatility input in the ranker · 55 `B-RTB-REFRESH-CONSOLIDATE` · 56 `#570` a refresh bucket that does not refresh · 57 `#699` does promotion evict · 58 roadmap 19.2 verify every score · 59 `B-ENTRY-LEVEL-RECHECK` · 80 `B-SQE-DEADCODE-PURGE` · 80a `B-NORMALIZER-RETIRE` (`#371` family) · 97a `B-PAPER-LEGACY-TABLE-REWIRE` (`#573`) · 99 `B-EPOCH-PARITY-FENCE` · 100 row 9, the learning-record restart.

**Wave A3 — learning data:** 103 `B-OUTCOME-CORPUS-CAPTURE` · 104 `B-EXCURSION-RECORD` · 106 `B-PAPER-LANE-PROVENANCE` (`#1059`) · 107 `T-W20C-SCALAR-LEG` · 107a `B-FEE-BASIS-STAMP` (`#1097`) · 108 `#515` · 109 `#631` · 110 `#504` · 114 `B-TRADE-RECORD-JOINABILITY` · 115 `B-VPNL-WRITER-BOUND` · 116 `#658` · 117 `#220` · 119 `B-ARCHIVE-WRITER-LIFECYCLE` (+ `#1062`) · 120 `B-ARCHIVE-FLUSH-DRAIN-ORDER` (`#1078`) · 121 `B-ROLLBACK-EPOCH-FORWARD` · 122 `#590` · 123 `B-PROVENANCE-LOSS-CENSUS` · 124 `#231`.

**Wave A4 — tuning (after the accumulation gate):** 125 the accumulation gate · 129 roadmap 25-17 target geometry · 130 25-17b crypto reach ceilings · 131 25-20 per-strategy minimum reward-to-risk (+ `#372`) · 132 `B-TARGET-MULTIPLE-VS-HORIZON` · 133 25-26 hold-time study · 134 `B-EXIT-MAKER-VS-TAKER-REVIEW` · 135 `#221` ranking · 135a `B-CROWDING-CRITERION-OBJECT` (`#1095`) · 136 `#149` · 137 `B-FAMILY-POOL-REACHABILITY` · 138 `B-IDEAL-POOL-STARVATION` · 139 `#648` · 140 `#201` · 141 `#529`.

## My issues that now sit in another session's row (homed 2026-09-29; `RUNNING_ISSUES` "HOMING 2026-09-29")
`#569` → row 9 · `#567` (mark plausibility) → row 17 · `#635` → row 34 · `#684`, `#393` → row 40 · `#641` → row 69 · `#1041` → row 196 (all CC-C) · `#662`, `#682`, `#675` → row 93 and `#1013` → row 160a (Infra, confirmed) · `#370`, `#375` → row 153 (CC-A).

## After live — mine, listed in `Scope Files/PRE_LIVE_SPRINT.md`
`#639`, `#551` (break-even and trailing) · 2.4b `B-ALERT-QUEUE-INTEGRITY` (`#647`, `#1074`, `#654`) · `B-CREW-SENDER-IDENTITY` · `B-CHANGE-CLASS-DOCSET-FIT` (row 2.7; now two instances) · `B-FRESHNESS-LOG-READER` · `B-SHARED-TMP-ISOLATION` · `B-UMBRELLA-OPEN-STATE` · `B-OPEN-OBLIGATION-SWEEP` (`#1071`) · `B-GATE-WILDCARD-REFUSE` (`#1069`) · `B-PRICE-DOC-CONSOLIDATE` (`3n.s`) · `B-VOLATILITY-CACHE-RETIRE` · `#1042`, the `#507` rider (legacy) · `#518`, `#528`, `#537`.

## Closed recently
`B-ARCHIVE-RETENTION-SIZING` (`#592`, row 2.4f) 2026-09-29, a decision item · `B-REACH-BASELINE-ADJUST` (row `3n.v`) 2026-09-29, crowding arm fired and Kyle overrode · `3n.x`, the pre-live review, became the Sprint to Live plan itself · withdrawn or closed at the 2026-09-29 homing: `#556`, `#636`, `#544`, `#507` (core), `#1098` (the node_modules `#567`); `#640` was already withdrawn.
