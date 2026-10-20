# CC-B (NEW Claude) — SESSION TASK LIST — plain language, as of 2026-10-12

> **Rebuilt 2026-09-29 from `SPRINT_TO_LIVE_PLAN.md`, which is the authority: if this list and the plan disagree, this list is stale.** The previous version (as of 2026-09-13, with the original 2026-09-01 census) is in git history at `23b4700b2`. Every row points at its record (plan row, `RUNNING_ISSUES` number, alert id); the record is the truth, this file is the index. Kyle 2026-09-05: every slotted task lands here in the same turn.

## ⛔ OPEN AND STALLED — every batch I have opened and not closed, the step it stalled at, and what it waits on

| batch | step | waiting on |
|---|---|---|
| **`B-ENGINE-STOP-DURATION-COLUMN`** (row 2a0, `#1067`) | **deployed 2026-10-07 — STEP 7** | the engine stop, run as the pre-sprint reset's first act (Langston ruled; five conditions in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`) |
| **`B-RTB-ADMISSION-TIEBREAK-LIVE`** (row 59f) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~08:47Z)** | carried: `#1204` row 59g, `#378`; the legacy tail drains |
| **`B-RTB-QUEUED-STATUS-SWEEP`** (row 59g, `#1204`) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~15:30Z)** | carried: `#1124` row 134a, `#1006` |
| **`B-ORCHESTRATOR-ROUTES-REMOVAL`** (row 59g1, `#1210`) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11)** | carried: `#1212` row 59g3, `#1214` row 59g1a, `#1213` row 59g1b (CC-C) |
| **`B-FORMULA-HEALTH-AUDIT-FRESHNESS`** (row 59g1a, `#1214`) | ⏸ **PARKED 2026-10-19 (Kyle: AI pages off-limits)** — deployed `ee0a3b0e4`, harmless | the cleanup phase; its Step-7 read lapsed unread 2026-10-20T03:00Z |
| **`B-CRON-VERIFIER-QUERY-FAIL`** (row 59g2, `#1211`) | ✅ CLOSED 2026-10-18 (Langston confirmed Step 11, ~06:05Z) | carried: forward read on `#1211`, `#1217` row 59g4, `#1218` row 59g5 |
| **`B-RR-FLOOR-HEADROOM`** (row 59a) | **STEP 10 — progress report, card Observation** | the 21-day pre-registered read of the fill check from 2026-10-17T13:03:42Z (alert `07df291f`, weekly); Step 7's first taker rows come with Monday's session |
| **`B-SILENT-STRATEGY-CENSUS`** (row 52) | **STEP 10 — progress report, card Observation** | strong_bull_trend's xStock verdict (alert `dd588f0d`, 20 filled closes or 2026-11-06T10:47:40Z), then O3's four candidates, each with a feasibility read and its own pass/fail |
| **`B-FEED-HEALTH-GRADE-ARM`** (row 3a) | **STEP 10 — progress report, card Observation** | Langston ruled the control 2026-10-10 (four conditions): the leg-1 test before close, relabel the real cycle as leg-3 evidence, a dated scope amendment; then one weekday (Mon 10-12) and the first real recovery — one extension at most |
| **`B-VENUE-QUIET-ALERTING`** (row 3a1) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~05:45Z)**; F1 deployed `7600476c5` | carried: the genuine-`firstJoin` read on alert `5b71b7ab` (2026-10-18 02:00Z, pre-registered); criterion 4 (duration page) unproven |
| hotfix **`B-PATTERN-ENUM-DRIFT`** (row 51, `#1063`) | **verification half-done** — ABCD insert failures 0 since deploy B | the first `volatility_edge` open after deploy B, to read its `pattern_type` |
| **`B-FEED-MISMATCH-FIX`** (row `3n.u`) | **STEP 10 of 11 — observation window · ⏸ PAUSED for the sprint start (Kyle 2026-09-30)** | the data: 300 taker closes or 2026-10-10T00:02:43Z, whichever first. How it is read (per side of each boundary, the short-n rule, the reset excluded) is fixed in amendment 4a (`0c8918c5d`), Langston-confirmed. Then the progress report converts to the completion report. |
| **`T-W20C-SCALAR-LEG`** (sprint row 107) | **scope r1 drafted 2026-09-13 (`6e97a8f1c`), never ruled** | its turn in the sprint, after row 106 `B-PAPER-LANE-PROVENANCE` |

## Checks I hold (alerts)

| alert | when | what |
|---|---|---|
| `be06cec8` | 2026-10-13T07:00Z | the weekly `dt-deploy` observation (10-06 run: all four PASS at `ea456ad40`); re-mint on each resolve |

## ★ MY PRE-SPRINT LIST — Kyle-assigned 2026-10-20, re-ordered and LOCKED by Kyle the same evening (Desktop). Nothing else starts until these are done; anything new is asked first. The plan's §0a row is the authority.
1. `B-BOOK-CHECKSUM-CIRCUIT-BREAKER` (`#1220`) — catch an order book that no longer matches Kraken's checksum and stop that symbol's requests straight away; never let a reconnect leave a second connection running beside the first (the 2026-10-13 storm). **✅ CLOSED 2026-10-20 — deployed `725a7f3f5`, Langston Step 8 + 11 CONFIRMED; report `Batch Completion/B_BOOK_CHECKSUM_CIRCUIT_BREAKER_COMPLETION_REPORT.md`.**
2. `B-ENTRY-GATE` (`#1224`) — 25 % window both sides; at the SQE (birth + every refresh) and at promotion/fill incl. resting orders; the economic test (floor being settled by Langston and Coltrane); a valid target as a hard SQE rule and the three 2 % fallbacks deleted; the refresh re-prices the fixed plan and never retires on a missing price; reward-to-risk ahead of the queue write (`#1051`); the refresh's dead SQE log fixed. Its freshness check switches on when item 3 lands. Filter Diagnostics later in the sprint.
3. `B-PRICE-FEED-COVERAGE` (`#1222`) — FIRST a measured minimum freshness standard, one rule for all symbols and both classes (the market could not plausibly have moved the entry out of the 25 % window during the price's age; derived per symbol from recorded price movement, checked against planned-vs-filled outcomes, method reviewed by Langston and Coltrane); THEN fresh prices meeting it at the SQE, the refresh, promotion, resting-order fills and the price-driven strategies; symbols that cannot meet it are rejected. The definition covers crypto on the live feed, crypto on the REST fallback, and xStock on Kraken's xStock live feed.
4. `B-PLAN-PRICE-BASIS` (`#1223` + `#1221`, combined by Kyle) — how, what and when each strategy prices its plan; defensive_hedge's missing BTC bars, DHMA's math, xStock's 6-hour "24-hour" range, the volume check, the stale docs; switching on the remaining xStock strategies. Kyle decides the plan basis.
5. `B-BOOK-TRUST-FLEET-GUARD` (`#1226`, slotted by CC-B on Kyle's delegation 2026-10-20) — the breaker as a fleet: one aggregate alert, a cap or pause on concurrent untrust episodes, a bulk re-check. After item 4, before live mode.
Also mine at the reset: 2a0's engine stop exercised; row 100 the learning-record restart. **The $820 balance fix (`B-BALANCE-SESSION-PAIRING`, owner CC-C) waits behind all of these.** The status board moved to OLD Claude (Kyle, 2026-10-20 evening). Still with Kyle, awaiting his slot: `#1230` the Paper Trading page's Source column mislabelling the feed both ways; `#1229` 39 Kraken pairs filed under two names (dormant, fail-safe).

## THE QUEUE, in working order — my rows in `SPRINT_TO_LIVE_PLAN.md` (66)

- ⭐ **PRE-SPRINT (Kyle 2026-10-07, `Scope Files/PRE_SPRINT_SIMULATION_TRUTH_PLAN.md`) — mine:** Stage 0 = the engine-stop exercise as the reset's own first act (five pre-registered conditions in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`) · **P1a = row 59, increment 1 `B-ENTRY-DISTANCE-GUARD`** (live: refuse a taker open at/through stop or target + the RR floor; shadow: the distance band), then 39a, the minimum stop vs the live spread, L/USD's 0.059 % stop vs row 2a, the RTB refresh latch (Coltrane C1) · Stage 4 = main Dashboard 0 trades / $0 vs the Paper page · Stage 5 = row 100 with the reset.
- ⭐ **PRE-SPRINT stage 3 — `B-B75-SCRIPT-TEST-HARNESS` (`#1208`, accepted 2026-10-17; Langston's placement at OLD Claude's B-B75-EXPORT-COMPLETENESS gate C):** a harness that EXECUTES the four B75 archive scripts' gate wiring (sweep, ctx lane, rotator, rehydrate) against fake clients — today they run `main()` at import, so they are tested by structure only. Placed in `SPRINT_TO_LIVE_PLAN` §0a stage 3, after B-B75-EXPORT-COMPLETENESS (CC-A); starts when that batch closes.
- 2a0 `B-ENGINE-STOP-DURATION-COLUMN` (`#1067`, moved from Infra's row 173): an engine stop crashes on a session older than ~24.8 days — it halted the 10-06 reset. Stop storing elapsed (both write sites), no migration. FIRST, after the 24 h no-deploy window.
- ✅ 2a `B-ATR-BAD-PRINT` (`#1153`) — CLOSED 2026-10-10 (Langston Step 11). Its clip-observability field rides 2a1.
- 2a0b `B-ENGINE-HEARTBEAT-DEAD-PATHS` (`#1158`): remove the heartbeat's dead check/recovery, keep the heal + bus event, settle the `/status` contract (Langston 10-06).
- 3a `B-FEED-HEALTH-GRADE-ARM` (`#1123`) + 3a1 `B-VENUE-QUIET-ALERTING` (`#526` + `#994`) — PAIRED, moved up to run right after 2a0b (Kyle 2026-10-06): arm the per-symbol feed-liveness grade, then use it to stop paging on a quiet market while still alerting on our own feed failing.
- 3a2 `B-WS-RECONNECT-BACKOFF-RESET` (`#1209`, placed 2026-10-17 by Langston's 3a Step-9 ruling): the heartbeat-timeout backoff counter never resets, so after ~6 lifetime reconnects the WebSocket always waits the 60 s cap. After row 3a.
- ✅ 2a0c `B-CLUSTER-BUS-PERSIST-DISPOSITION` (`#1159`) — CLOSED 2026-10-11 (Langston Step 11): the cluster bus is in-memory only; its table, enum and retention entry are dropped.
- ✅ 2a0d `B-ROOT-DUPLICATE-SCANNER-RETIRE` (`#1161`) — CLOSED 2026-10-10 (Langston Step 11).
- ✅ 59 inc 1 `B-ENTRY-DISTANCE-GUARD` (`#915`, `#1168`) — CLOSED 2026-10-12 (Langston Step 11): a taker fill at or through its stop or target is refused; reward-to-risk at the fill logged in shadow.
- ✅ 59e `B-RTB-REFRESH-LIVE-PRICE` (`#1168`, `#1189`) — CLOSED 2026-10-12 (Langston Step 11): the RTB refresh reads the live ask and retires a signal past its stop or target; a rejected signal can no longer be opened.
- 59f `B-RTB-ADMISSION-TIEBREAK-LIVE` (`#1190`) — the queue's R-multiple tiebreak never runs; restore it with a decision on which copy should win.
- 59g1 `B-ORCHESTRATOR-ROUTES-REMOVAL` (`#1210`, placed 2026-10-17 after 59g): four orchestrator routes load a module deleted in 2025 and fail — telemetry, analysis, re-analyse, formula audit; the learning-summary and logs routes are alive and stay. Census per section of the AI Command Center first.
- 59g1a `B-FORMULA-HEALTH-AUDIT-FRESHNESS` (`#1214`, placed 2026-10-17 after 59g1, Langston): the Formula Health card's "last audit" always reads "just now" because the page load runs the audit — decide whether it reads the last scheduled result.
- 59g3 `B-DUP-HEALTH-ROUTE-SHADOW` (`#1212`, placed 2026-10-17 after 59g2): `GET /system/health` registered three times; only the first answers — read all three and their callers, then keep one.
- 59g4 `B-DB-REACHABILITY-ALERT` (`#1217`, placed 2026-10-18 after 59g3, Langston): nothing pages when the database stops answering — the health monitor's `SELECT 1` raises no alert.
- 59g5 `B-CRON-SUBGRACE-CADENCE` (`#1218`, placed 2026-10-18 after 59g4, Langston): the cron verifier never judges the two five-minute jobs (always inside its ten-minute grace) and a restart delays its next check — decide how a sub-grace job is judged.
- 59a `B-RR-FLOOR-HEADROOM` (`#1183`) — the reward-to-risk floors sit inside float-noise of the strategies' own RR; recalibrate with margin (row 59 increment 2).
- 59b `B-MAKER-CANCEL-ON-STOP` (`#1184`) — a resting entry that fills after the market crossed its stop (row 59 increment 3).
- 59c `B-ENTRY-BAND-SHADOW` (`#1186`) — log the fill's distance from the plan against spread and ATR at every taker open; ATR absent on xStock ⇒ log the inputs and refuse the leg (row 59 increment 4).
- 59d `B-NO-TARGET-FAIL-CLOSED` (`#1187`) — the made-up 2 % target at three sites; all three refuse a no-target signal together (row 59 increment 5).
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
