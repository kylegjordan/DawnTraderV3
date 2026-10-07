# CC-B (NEW Claude) — SESSION TASK LIST — plain language, as of 2026-10-07

> **Rebuilt 2026-09-29 from `SPRINT_TO_LIVE_PLAN.md`, which is the authority: if this list and the plan disagree, this list is stale.** The previous version (as of 2026-09-13, with the original 2026-09-01 census) is in git history at `23b4700b2`. Every row points at its record (plan row, `RUNNING_ISSUES` number, alert id); the record is the truth, this file is the index. Kyle 2026-09-05: every slotted task lands here in the same turn.

## ⛔ OPEN AND STALLED — every batch I have opened and not closed, the step it stalled at, and what it waits on

| batch | step | waiting on |
|---|---|---|
| **`B-ATR-BAD-PRINT`** (row 2a, `#1153`) · **`B-ENGINE-STOP-DURATION-COLUMN`** (row 2a0, `#1067`) · hotfix **`B-LIVE-BANNER-ACTIVE-HOTFIX`** (row 2a0h, `#1160`) · **`B-ENGINE-HEARTBEAT-DEAD-PATHS`** (row 2a0b, `#1158`) | **STEP 5 of 11 done — Step 4 APPROVED, CI green** | the deploy at `0c8ef5da2`, not before 2026-10-07T15:53Z (`#1154`); plan `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`. 2a0b's Step 7 is a HARD GATE at the next 02:15Z sweep. |
| **`B-CLUSTER-BUS-PERSIST-DISPOSITION`** (row 2a0c, `#1159`) · **`B-ROOT-DUPLICATE-SCANNER-RETIRE`** (row 2a0d, `#1161`) | **2a0c: Step 4 APPROVED · 2a0d: STEP 5 of 11 done** | the deploy AFTER today's (2a0c needs the heartbeat writer gone and restarted first) |
| **`B-FEED-HEALTH-GRADE-ARM`** (row 3a, `#1123`) | **STEP 4 of 11** — code `3a549e3a9` | Langston's Step-4 ruling |
| **`B-VENUE-QUIET-ALERTING`** (row 3a1, `#526`/`#994`/`#638`) | **STEP 4 of 11** — r2 PROCEED; r3 condition at `b70ab5975` | Langston confirming the r3 condition. The xStock exit-freshness alerts stay ACTIVE and UNACKED until it ships (Langston 2026-10-07). |
| hotfix **`B-PATTERN-ENUM-DRIFT`** (row 51, `#1063`) | **verification half-done** — ABCD insert failures 0 since deploy B | the first `volatility_edge` open after deploy B, to read its `pattern_type` |
| **`B-FEED-MISMATCH-FIX`** (row `3n.u`) | **STEP 10 of 11 — observation window · ⏸ PAUSED for the sprint start (Kyle 2026-09-30)** | the data: 300 taker closes or 2026-10-10T00:02:43Z, whichever first. How it is read (per side of each boundary, the short-n rule, the reset excluded) is fixed in amendment 4a (`0c8918c5d`), Langston-confirmed. Then the progress report converts to the completion report. |
| **`T-W20C-SCALAR-LEG`** (sprint row 107) | **scope r1 drafted 2026-09-13 (`6e97a8f1c`), never ruled** | its turn in the sprint, after row 106 `B-PAPER-LANE-PROVENANCE` |

## Checks I hold (alerts)

| alert | when | what |
|---|---|---|
| `be06cec8` | 2026-10-13T07:00Z | the weekly `dt-deploy` observation (10-06 run: all four PASS at `ea456ad40`); re-mint on each resolve |

## THE QUEUE, in working order — my rows in `SPRINT_TO_LIVE_PLAN.md` (66)

- 2a0 `B-ENGINE-STOP-DURATION-COLUMN` (`#1067`, moved from Infra's row 173): an engine stop crashes on a session older than ~24.8 days — it halted the 10-06 reset. Stop storing elapsed (both write sites), no migration. FIRST, after the 24 h no-deploy window.
- 2a `B-ATR-BAD-PRINT` (`#1153`, found 2026-10-05): one off-market print inflates the ATR that sets stops and targets (GBP/USD, LIGHTER stuck) — FIRST in my queue, after row 2.
- 2a0b `B-ENGINE-HEARTBEAT-DEAD-PATHS` (`#1158`): remove the heartbeat's dead check/recovery, keep the heal + bus event, settle the `/status` contract (Langston 10-06).
- 3a `B-FEED-HEALTH-GRADE-ARM` (`#1123`) + 3a1 `B-VENUE-QUIET-ALERTING` (`#526` + `#994`) — PAIRED, moved up to run right after 2a0b (Kyle 2026-10-06): arm the per-symbol feed-liveness grade, then use it to stop paging on a quiet market while still alerting on our own feed failing.
- 2a0c `B-CLUSTER-BUS-PERSIST-DISPOSITION` (`#1159`): keep or remove the cluster-bus persistence layer (Langston 10-06).
- 2a0d `B-ROOT-DUPLICATE-SCANNER-RETIRE` (`#1161`): delete the root-level FX5 scanner twin; census the root test scripts (Langston 10-06).
- 2a1 `B-ADX-TRUE-RANGE-SHARED`: the regime's ADX takes 2a's shared true range (Langston 10-06).
- 2a1a `B-RISK-INDEX-ORPHAN-REMOVAL` (`#1157`): delete the orphaned `risk_index.ts` and the docs calling it active (Langston 10-06).
- 2a2 `B-VOLATILITY-CACHE-RETIRE`: retire the dead volatility cache (was only on PHASE_19_PLAN's board).
- 2b `B-CROWDING-CRITERION-OBJECT` (`#1095`) — **HELD (Kyle 2026-10-05: no limits based on how fast a strategy trades); scope re-decided after the reach-batch outcome analysis.**
**Wave 0 — before the sprint:** 3a `B-FEED-HEALTH-GRADE-ARM` (`#1123`), switch on the feed-liveness grade after row 3's startup-cache fix; Step 1 settles the xStock weekend window and whether its alerts clear on recovery (accepted 2026-09-30).
- 3c `B-DISPLAY-TRIGGER-PRICE` (`#1152`, Kyle 2026-10-04): show the price that decides the trade (crypto exits fire on the bid; the screen shows the midpoint) — after 3b.

**Wave 0 — after row 9's deploy B:** 9i `B-EXPOSURE-CLASS-ALLOCATION` (`#1135`), re-measure xStock's share of the pot under ~5% sizing, then Kyle if it still starves · 9j `B-RTB-PROMOTION-RETRY-STORM` (`#1136`).

**Wave A1 — foundations:** 39a `B-CRYPTO-BIRTH-FEED` (⭐ Kyle decision rides `#977`) · 46 `#972` xStock ATR empty around the open and close · 47 `#566` volatility measured with a lag.

**Wave A2 — mechanics, stage by stage:** 49 `#233` drift and volume inputs fed as fixed defaults (+ `#514`) · 50 `#199` xStock volume confirmation · 51 `3m-ENUM` volatility_edge's pattern path (⚡ ABCD pulled forward as hotfix `B-PATTERN-ENUM-DRIFT`, rides deploy B, Kyle 2026-10-02; remainder re-pointed) · 51a `B-HEALTH-CHECK-REMOVAL` (`#1147`) ⚡ IN FLIGHT, delete the System Health Check, rides deploy B (Kyle 2026-10-02) · ~~51b~~ withdrawn, duplicate of row 73 `#1039` (Infra Claude) · 51c `B-DUP-ROUTE-SHADOW` (`#1150`) duplicate API registrations leave dead handlers · · 52 `B-SILENT-STRATEGY-CENSUS` (`#1070`) · 54 `#574` a made-up volatility input in the ranker · 55 `B-RTB-REFRESH-CONSOLIDATE` · 56 `#570` a refresh bucket that does not refresh · 57 `#699` does promotion evict · 58 ~~roadmap 19.2 verify every score~~ SUBSUMED by rows 148/148a (Langston 2026-10-02 22:29Z; struck, not deleted) · 59 `B-ENTRY-LEVEL-RECHECK` · 80 `B-SQE-DEADCODE-PURGE` · 80a `B-NORMALIZER-RETIRE` (`#371` family) · 97a `B-PAPER-LEGACY-TABLE-REWIRE` (`#573`) · 99 `B-EPOCH-PARITY-FENCE` · 100 row 9, the learning-record restart.

**Wave A3 — learning data:** 103 `B-OUTCOME-CORPUS-CAPTURE` · 104 `B-EXCURSION-RECORD` · 106 `B-PAPER-LANE-PROVENANCE` (`#1059`) · 107 `T-W20C-SCALAR-LEG` · 107a `B-FEE-BASIS-STAMP` (`#1097`) · 108 `#515` · 109 `#631` · 110 `#504` · 114 `B-TRADE-RECORD-JOINABILITY` · 115 `B-VPNL-WRITER-BOUND` · 116 `#658` · 117 `#220` · 119 `B-ARCHIVE-WRITER-LIFECYCLE` (+ `#1062`) · 120 `B-ARCHIVE-FLUSH-DRAIN-ORDER` (`#1078`) · 121 `B-ROLLBACK-EPOCH-FORWARD` · 122 `#590` · 123 `B-PROVENANCE-LOSS-CENSUS` · 124 `#231`.

**Wave B1 — safety now:** 164a `B-ROLLBACK-LEDGER-CLEAR` (`#1129`), every rollback file clears its own migration-ledger row.

**Wave B2 — risk controls and restart safety:** 166a `B-EXIT-SKIP-ALERT-CLEAR` (`#638`, with `#572`), the exit-skip operator alert that never clears · 166b `B-XSTOCK-WEEKEND-POSTURE` (`#531`), stop opening xStock positions before a scheduled closure.

**Wave A4 — tuning (after the accumulation gate):** 125 the accumulation gate · 129 roadmap 25-17 target geometry · 130 25-17b crypto reach ceilings · 131 25-20 per-strategy minimum reward-to-risk (+ `#372`) · 132 `B-TARGET-MULTIPLE-VS-HORIZON` · 133 25-26 hold-time study · 133a `B-BLUECHIP-TRADEABILITY` (`#1149`) why the large coins never pass the profit check · 134 `B-EXIT-MAKER-VS-TAKER-REVIEW` · 134a `#1124` should shadow-trade outcomes carry trading costs (before 135, which is judged by reading that sink) · 135 `#221` ranking · ~~135a~~ moved to 2b (2026-10-05) · 136 `#149` · 137 `B-FAMILY-POOL-REACHABILITY` · 138 `B-IDEAL-POOL-STARVATION` · 139 `#648` · 140 `#201` · 141 `#529`.

## My issues that now sit in another session's row (homed 2026-09-29; `RUNNING_ISSUES` "HOMING 2026-09-29")
`#569` → row 9 · `#567` (mark plausibility) → row 17 · `#635` → row 34 · `#684`, `#393` → row 40 · `#641` → row 69 · `#1041` → row 196 (all CC-C) · `#662`, `#682`, `#675` → row 93 and `#1013` → row 160a (Infra, confirmed) · `#370`, `#375` → row 153 (CC-A).

## After live — mine, listed in `Scope Files/PRE_LIVE_SPRINT.md`
`#639`, `#551` (break-even and trailing) · 2.4b `B-ALERT-QUEUE-INTEGRITY` (`#647`, `#1074`, `#654`) · `B-CREW-SENDER-IDENTITY` · `B-CHANGE-CLASS-DOCSET-FIT` (row 2.7; now two instances) · `B-FRESHNESS-LOG-READER` · `B-SHARED-TMP-ISOLATION` · `B-UMBRELLA-OPEN-STATE` · `B-OPEN-OBLIGATION-SWEEP` (`#1071`) · `B-GATE-WILDCARD-REFUSE` (`#1069`) · `B-PRICE-DOC-CONSOLIDATE` (`3n.s`) · `B-VOLATILITY-CACHE-RETIRE` · `#1042`, the `#507` rider (legacy) · `#518`, `#528`, `#537` · `#444` · `#481` (in B-GOV-INTEGRITY-2) · `#600`, `#604` (in B-AMR-INPUT-INTEGRITY-ARC).

## Closed recently
`B-ARCHIVE-RETENTION-SIZING` (`#592`, row 2.4f) 2026-09-29, a decision item · `B-REACH-BASELINE-ADJUST` (row `3n.v`) 2026-09-29, crowding arm fired and Kyle overrode · `3n.x`, the pre-live review, became the Sprint to Live plan itself · `3n.t` `B-FEED-BY-SITUATION-AUDIT` was done 2026-09-18 (its findings became `3n.u`); its plan status cell was stale until 2026-09-29 · withdrawn or closed at the 2026-09-29 homing: `#556`, `#636`, `#544`, `#507` (core), `#1098` (the node_modules `#567`); `#640` was already withdrawn.
