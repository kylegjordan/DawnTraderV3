# PM slot check — CC-B

- ref: origin/migration/aws-supabase
- ref-sha: a959cc3435c3762fd5fdabdcd28a17c3f2c64094
- origin-head: a959cc3435c3762fd5fdabdcd28a17c3f2c64094
- freshness: FRESH
- owner: CC-B
- item: Two items from the 11-16 staging database outage (Langston ruled separate): (1) un-park row 59g4 B-DB-REACHABILITY-ALERT (#1217) as filed - page someone when the database is unreachable; (2) new item B-DB-UNREACHABLE-POSTURE (#1260) - what the engine may do on settings or positions it cannot check while the database is down, Step 1 an options paper for Kyle incl. whether live stops rest at the venue. Both placed before live, after B-ENTRY-GATE's xStock week read (11-20) and after CC-B list items 2a (row 9j pool fix) and 2b (row 172)
- generated: 2026-11-16T05:45:01.392Z

## 1. Open plan rows (plan order)

- section 4 row 2a0 (line 244) [queued] B-ENGINE-STOP-DURATION-COLUMN (`#1067`) — An engine stop must not crash on a long-running session: it stores elapsed time in a whole-number field that overflows after ~24.8 days — status: QUEUED — FIRST
- section 4 row 2a0i (line 247) [queued] B-WS-STATUS-PAYLOAD-COMPLETE — Every engine-status update sent to the dashboard carries BOTH engines' on/off state (or the dashboard merges updates instead of replacing them), so a paper upd… — status: QUEUED
- section 4 row 2a0j (line 248) [queued] B-SYSTEM-CONTEXT-ROW-INVARIANT — The engine on/off record for each mode must exist before it is written: today a missing record makes the write silently do nothing, so a start or stop is lost … — status: QUEUED
- section 4 row 3a2 (line 252) [queued] B-WS-RECONNECT-BACKOFF-RESET (`#1209`) — The Kraken WebSocket's heartbeat-timeout backoff never resets, so after about six lifetime reconnects it always waits the full 60 s cap — status: QUEUED
- section 4 row 2a0e (line 255) [queued] B-CLUSTER-LAYER-REACHABILITY — Find out whether the old multi-server coordination services (node registry, task router, rebalancer, per-server circuit breaker, learning/model sync) can run a… — status: QUEUED
- section 4 row 2a0f (line 256) [queued] R-XSTOCK-PATTERN-TYPE (review) — Review: xStock trades never record which candle pattern they traded on (every crypto pattern-strategy trade does) — decide whether that is by design or a gap, … — status: QUEUED
- section 4 row 2a1 (line 257) [queued] B-ADX-TRUE-RANGE-SHARED — The regime's trend-strength reading (ADX) uses the same shared true range as the ATR — status: QUEUED
- section 4 row 2a1a (line 258) [queued] B-RISK-INDEX-ORPHAN-REMOVAL — Remove the orphaned risk-index module (zero importers; a dead duplicate of the live correlation/concentration code) and the docs that still call it active — status: QUEUED
- section 4 row 2a2 (line 259) [queued] B-VOLATILITY-CACHE-RETIRE — Retire the dead volatility cache and its 0.015 fallback (B-REGIME-INPUTS-LIVE's OBJ-4, rule 18) — status: QUEUED
- section 4 row 2b (line 260) [parked] B-CROWDING-CRITERION-OBJECT (`#1095`, widened) — Paper trade turnover becomes a governed quantity: nothing bounds one strategy's share of what opens or of the money-hours it holds, and nothing governs trades … — status: HELD — Kyle 2026-10-05 objects to speed-based limits; scope re-decided after th…
- section 4 row 3c (line 263) [queued] B-DISPLAY-TRIGGER-PRICE (`#1152`) — Show the price that decides the trade: the Open Trades price, distance to stop/target and unrealized P&L read the exit trigger's price (the bid for crypto), an… — status: QUEUED
- section 4 row 9i (line 285) [queued] B-EXPOSURE-CLASS-ALLOCATION (`#1135`) — Give xStock a real share of the paper pot, if Kyle's one shared pot still starves it after the sizing change — status: QUEUED — opens after deploy B
- section 4 row 9j (line 286) [queued] B-RTB-PROMOTION-RETRY-STORM (`#1136`) — Stop a guardrail-refused promotion from re-minting every cycle, or count it once — status: QUEUED — re-scoped by Kyle 2026-11-16 to carry the KD-84 pool fix (money checke…
- section 4 row 39a (line 326) [queued] B-CRYPTO-BIRTH-FEED (`#1060` am. 4; the Kyle scope call rid… — Crypto signal birth reads a stale quote — status: QUEUED
- section 4 row 46 (line 332) [queued] #972 — batch named at Step 1 — #972 — status: QUEUED
- section 4 row 47 (line 333) [queued] #566 — batch named at Step 1 — #566 — status: QUEUED
- section 4 row 49 (line 340) [queued] #233 — batch named at Step 1 — #233 — status: QUEUED
- section 4 row 50 (line 341) [queued] #199 — batch named at Step 1 — #199 — status: QUEUED
- section 4 row 51 (line 342) [in_progress] plan row 3m-ENUM · hotfix `B-PATTERN-ENUM-DRIFT` — volatility_edge's pattern path is silently dead — status: hotfix `B-PATTERN-ENUM-DRIFT` ✅ DEPLOYED with deploy B (2026-10-06) and ✅ CLOSE…
- section 4 row 51c (line 345) [queued] B-DUP-ROUTE-SHADOW (`#1150`) — The same API path is registered more than once, so the later handlers are dead (one returns hardcoded "all fine" health values) — status: QUEUED
- section 4 row 52 (line 346) [observation] B-SILENT-STRATEGY-CENSUS — B-SILENT-STRATEGY-CENSUS — status: ⏳ IN OBSERVATION — day-21 ruled 2026-11-06 (Langston + Coltrane): the structura…
- section 4 row 52a (line 347) [queued] B-NULL-REASON-LOCAL (`#1178`) — The "why no signal" reason the crypto VTS records can belong to another evaluation: one shared value, and the VTS reads it across an `await` — correct the thre… — status: QUEUED
- section 4 row 52b (line 348) [queued] B-XSTOCK-EQUITY-BAR-DETECTION — dhma and abcd_long detect on 15-minute xStock bars: a detection test before either can be a candidate to switch on (Kyle 2026-09-30) — status: QUEUED
- section 4 row 52c (line 349) [queued] B-STRATEGY-NAME-ALIAS — One strategy, two spellings: the SSOT already maps `range_trading` → `range_trade` (`normalizeStrategy`), but the deletion log still says it does not (`DELETED… — status: QUEUED
- section 4 row 54 (line 351) [queued] #574 — batch named at Step 1 — #574 — status: QUEUED
- section 4 row 55 (line 352) [in_progress] B-RTB-REFRESH-CONSOLIDATE — B-RTB-REFRESH-CONSOLIDATE — status: OBJ-1 done; `#535` and OBJ-2b-6 (`#532`) open
- section 4 row 56 (line 353) [queued] #570 — batch named at Step 1 — #570 — status: QUEUED
- section 4 row 57 (line 354) [queued] #699 — batch named at Step 1 — #699 — status: QUEUED
- section 4 row 59 (line 356) [in_progress] B-ENTRY-LEVEL-RECHECK — B-ENTRY-LEVEL-RECHECK — status: increment 1 `B-ENTRY-DISTANCE-GUARD` ✅ CLOSED 2026-10-12 — deployed `a52f16a52`…
- section 4 row 59g3 (line 364) [parked] B-DUP-HEALTH-ROUTE-SHADOW (`#1212`) — The server's health check address is registered three times, so only the first answers and the other two — including the only one that requires a login — never… — status: ⏸ PARKED 2026-10-19 (Kyle: no batch off the agreed list) — cleanup phase
- section 4 row 59g4 (line 365) [parked] B-DB-REACHABILITY-ALERT (`#1217`) — Nothing raises an alert when the database stops answering: the health monitor checks it on a timer but pages no one, and the database monitor only checks its s… — status: ⏸ PARKED 2026-10-19 (Kyle: no batch off the agreed list) — cleanup phase unless…
- section 4 row 59g5 (line 366) [parked] B-CRON-SUBGRACE-CADENCE (`#1218`) — The cron verifier can never judge the two jobs that run every five minutes (they always sit inside its ten-minute grace, so a stopped one is never flagged), an… — status: ⏸ PARKED 2026-10-19 (Kyle: no batch off the agreed list) — cleanup phase unless…
- section 4 row 59b (line 368) [queued] B-MAKER-CANCEL-ON-STOP (`#1184`) — Decide whether a resting entry order is cancelled when the market passes through its stop before it fills — ⚠️ rider from row 59a: moving crypto to `maker_pref… — status: QUEUED
- section 4 row 59c (line 369) [queued] B-ENTRY-BAND-SHADOW (`#1186`) — Log, at every taker open, how far the fill landed from the plan against the market's own noise (spread and ATR) — the check that could later move before the or… — status: QUEUED
- section 4 row 59d (line 370) [queued] B-NO-TARGET-FAIL-CLOSED (`#1187`) — A signal with no target is given a made-up 2 % target at three places; make all three refuse it instead — status: QUEUED
- section 4 row 80 (line 389) [queued] B-SQE-DEADCODE-PURGE — B-SQE-DEADCODE-PURGE — status: QUEUED
- section 4 row 80a (line 390) [queued] B-NORMALIZER-RETIRE (`#371`, `#373`, `#374` OBJ-C, `#376`) — Retire the signal-target normalizer — status: QUEUED
- section 4 row 97a (line 411) [queued] B-PAPER-LEGACY-TABLE-REWIRE (`#573`) — Paper screens read the retired paper_trades table — status: QUEUED — its pre-sprint home (the §0a "main Dashboard 0-trades read") was WITHD…
- section 4 row 99 (line 413) [queued] B-EPOCH-PARITY-FENCE — B-EPOCH-PARITY-FENCE — status: QUEUED
- section 4 row 100 (line 415) [queued] plan row 9 — The learning-record restart — status: QUEUED
- section 4 row 103 (line 423) [queued] B-OUTCOME-CORPUS-CAPTURE — B-OUTCOME-CORPUS-CAPTURE — status: QUEUED
- section 4 row 104 (line 424) [queued] B-EXCURSION-RECORD — B-EXCURSION-RECORD — status: QUEUED
- section 4 row 106 (line 426) [queued] B-PAPER-LANE-PROVENANCE — B-PAPER-LANE-PROVENANCE — status: QUEUED
- section 4 row 107 (line 427) [queued] T-W20C-SCALAR-LEG — T-W20C-SCALAR-LEG — status: QUEUED
- section 4 row 107a (line 428) [queued] B-FEE-BASIS-STAMP (`#1097`) — Record which fee each xStock maker/taker decision used — status: QUEUED
- section 4 row 108 (line 429) [queued] #515 — batch named at Step 1 — #515 — status: QUEUED
- section 4 row 109 (line 430) [queued] #631 — batch named at Step 1 — #631 — status: QUEUED
- section 4 row 110 (line 431) [queued] #504 — batch named at Step 1 — #504 — status: QUEUED
- section 4 row 114 (line 435) [queued] B-TRADE-RECORD-JOINABILITY — B-TRADE-RECORD-JOINABILITY — status: QUEUED
- section 4 row 115 (line 436) [queued] B-VPNL-WRITER-BOUND — B-VPNL-WRITER-BOUND — status: QUEUED
- section 4 row 116 (line 437) [queued] #658 — batch named at Step 1 — #658 — status: QUEUED
- section 4 row 117 (line 438) [queued] #220 — batch named at Step 1 — #220 — status: QUEUED
- section 4 row 119 (line 440) [queued] B-ARCHIVE-WRITER-LIFECYCLE — B-ARCHIVE-WRITER-LIFECYCLE — status: QUEUED
- section 4 row 120 (line 441) [queued] B-ARCHIVE-FLUSH-DRAIN-ORDER (`#1078`) — B-ARCHIVE-FLUSH-DRAIN-ORDER — status: QUEUED
- section 4 row 121 (line 442) [queued] B-ROLLBACK-EPOCH-FORWARD — B-ROLLBACK-EPOCH-FORWARD — status: QUEUED
- section 4 row 122 (line 443) [queued] #590 — batch named at Step 1 — #590 — status: QUEUED
- section 4 row 123 (line 444) [queued] B-PROVENANCE-LOSS-CENSUS — B-PROVENANCE-LOSS-CENSUS — status: QUEUED
- section 4 row 124 (line 445) [queued] #231 — batch named at Step 1 — #231 — status: QUEUED
- section 4 row 125 (line 454) [queued] — batch named at Step 1 — Accumulation gate between the clean learning-record restart and tuning — status: QUEUED
- section 4 row 129 (line 458) [queued] roadmap 25-17 — batch named at Step 1 — 25-17 TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, B — status: QUEUED
- section 4 row 130 (line 459) [queued] roadmap 25-17b — batch named at Step 1 — 25-17b CRYPTO reach_atr_max DECISION — the reachability-ceiling que — status: QUEUED
- section 4 row 131 (line 460) [queued] roadmap 25-20 — batch named at Step 1 — 25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALI — status: QUEUED
- section 4 row 132 (line 461) [queued] B-TARGET-MULTIPLE-VS-HORIZON — B-TARGET-MULTIPLE-VS-HORIZON — status: QUEUED
- section 4 row 133 (line 462) [queued] roadmap 25-26 — batch named at Step 1 — 25-26 Trade HOLD-TIME / timeframe study — do slower (multi-day) tr — status: QUEUED
- section 4 row 133a (line 463) [queued] B-BLUECHIP-TRADEABILITY (`#1149`) — Why the large coins (BTC, ETH, SOL …) almost never pass the profit check, though they move plenty — status: QUEUED
- section 4 row 134 (line 464) [queued] B-EXIT-MAKER-VS-TAKER-REVIEW — B-EXIT-MAKER-VS-TAKER-REVIEW — status: QUEUED
- section 4 row 134a (line 465) [queued] #1124 — batch named at Step 1 — Should shadow-trade outcomes carry trading costs? Today the shadow sink's net profit is gross — and (item added 2026-10-17, row 59g §13) its `promoted_trade_id… — status: QUEUED
- section 4 row 135 (line 466) [queued] #221 — batch named at Step 1 — #221 — status: QUEUED
- section 4 row 136 (line 469) [queued] #149 — batch named at Step 1 — #149 — status: QUEUED
- section 4 row 137 (line 470) [queued] B-FAMILY-POOL-REACHABILITY — B-FAMILY-POOL-REACHABILITY — status: QUEUED
- section 4 row 138 (line 471) [queued] B-IDEAL-POOL-STARVATION — B-IDEAL-POOL-STARVATION — status: QUEUED
- section 4 row 139 (line 473) [queued] #648 — batch named at Step 1 — #648 — status: QUEUED
- section 4 row 140 (line 474) [queued] #201 — batch named at Step 1 — #201 — status: QUEUED
- section 4 row 141 (line 475) [queued] #529 — batch named at Step 1 — #529 — status: QUEUED
- section 4 row 164a (line 520) [queued] B-ROLLBACK-LEDGER-CLEAR (`#1129`) — Every rollback file clears its own migration-ledger row — status: QUEUED
- section 4 row 166b (line 529) [queued] B-XSTOCK-WEEKEND-POSTURE (`#531`, folding `#583`(a)) — xStock weekend posture: stop opening new positions before a scheduled closure — status: QUEUED — evidence leg due after 2026-11-13 close (KD-74)
- section 4 row 172 (line 535) [queued] B-TEC-PRIME-BOOT-RACE (`#1053`) — B-TEC-PRIME-BOOT-RACE — status: QUEUED — placed on the CC-B list as item 2b, after the pool fix (row 9j, item 2…
- section 5 (line 587) B-FEED-MISMATCH-FIX — closes: 300 taker closes or 2026-10-10 (paused for the sprint start, Kyle 2026-09-30)
- section 5 (line 588) B-XSTOCK-FEE-CONTRACT — closes: 2026-10-02T20:09:47Z, not extended (Langston 2026-09-29)

## 2. Pre-sprint rows

- stage 0 — reset safety order 2 (line 26) B-ENGINE-STOP-DURATION-COLUMN (row 173 is an alias) — plan row 2a0 — status: row — waiting on: nothing
- stage CC-B list order 2 (line 33) B-ENTRY-GATE — status: ⏳ OPEN — increment A verified through S… — waiting on: Increment A: worse-side 25% window live; cheaper-side 40% f…
- stage CC-B list order 2a (line 34) B-RTB-PROMOTION-RETRY-STORM, re-scoped to carry the KD-84 pool fix: check free slots AND … — plan row 9j — status: row — waiting on: B-ENTRY-GATE
- stage CC-B list order 2b (line 35) B-TEC-PRIME-BOOT-RACE (folds CC-C's `3n.c` boot half) — plan row 172 — status: row — waiting on: 2a
- stage CC-B list order 3 (line 36) B-PRICE-FEED-COVERAGE — status: IN FLIGHT — increment 0 Step 6; byte-id… — waiting on: nothing
- stage CC-B list order 4 (line 37) B-PLAN-PRICE-BASIS — status: QUEUED (absorbs B-STRATEGY-INPUT-FIXES) — waiting on: nothing
- stage CC-B list order 5 (line 38) B-BOOK-TRUST-FLEET-GUARD — status: QUEUED — waiting on: nothing
- stage 2 — exit, in order order 8 (line 50) B-DISPLAY-TRIGGER-PRICE — plan row 3c — status: row — waiting on: nothing
- stage 5 — the reset, both halves order 1 (line 60) PAPER-RESET-3000 at $820 and a new dashboard epoch — status: QUEUED — waiting on: Kyle (it runs only by his deliberate decision)
- stage 5 — the reset, both halves order 2 (line 61) the learning-record restart (plan row 9 in the pre-sprint plan) — plan row 100 — status: row — waiting on: nothing
- stage 0 — clear the plates (CC-B) order 2 (line 68) B-FEED-MISMATCH-FIX — status: PARKED by Kyle 2026-09-30 (its window e… — waiting on: CC-B
- stage 0 — clear the plates (CC-B) order 5 (line 71) T-W20C-SCALAR-LEG — plan row 107 — status: row — waiting on: nothing

## 3. Task list

task-list: UNPARSEABLE (| batch | step | waiting on |)

First table, verbatim:

| batch | step | waiting on |
|---|---|---|
| **`B-PRICE-FEED-COVERAGE` increment 0** (`#1222`) | **STEP 7 of 11 IN PROGRESS** — the exact dispatch instrument is reviewed, landed and deployed; Step 8 is forbidden | the registered 2026-11-12 14:30–21:00Z full-session read with uninterrupted process continuity and a positive exact dispatch delta, plus a natural `cold_tick` depth carrier; zero or broken continuity requires another full session |
| **`B-B75-SCRIPT-TEST-HARNESS`** (stage 3, `#1208`) | **✅ CLOSED 2026-11-11 at Step 11** — all 7/7 objectives green; Coltrane confirmed exact completion ref `86d0c8377995532de6e986915eb36ceabea377cf` | separate `#169` stays open |
| **`B-ENTRY-GATE`** (pre-sprint item 2, `#1224`) | **STEP 10 of 11 — both increments live and verified; parent OPEN (Observation)** — increment A `957b13fde` (Coltrane `56509024d`); increment B `77f6fd598` 2026-11-13, 24 h read Langston Step-8 PROCEED; progress report `Batch Completion/B_ENTRY_GATE_PROGRESS_REPORT.md` | the xStock week read on 2026-11-20 (alert `7de9caf9`: P7 seed vs its prediction, plus the EntryWindow judged arm and the P6 taker arm), then convert to the completion report; exact live `ev_reject` drift event remains UNVERIFIED |
| **`B-CRYPTO-FEED-WATCHDOG`** (row 33a, `#1232`) | **✅ CLOSED 2026-11-07 at Step 11, Langston confirmed** — deployed `b8685a453` 2026-11-04; Step 9 (objective 4's display half) `c0fe598a0` deployed 2026-11-07 13:35Z, Step 8 PROCEED 13:55Z; report `Batch Completion/B_CRYPTO_FEED_WATCHDOG_COMPLETION_REPORT.md` | Langston's Step-11 confirm. Carried on `#1232`: leg 3, the acting half and the silent panel arms never fired live (successor: the first real half-open connection); the recorder-arm carrier gap, the 6 h witness ceiling and objective 6's STATUS line (proposals for Kyle's list, not placed) |
| **`B-ENGINE-STOP-DURATION-COLUMN`** (row 2a0, `#1067`) | **deployed 2026-10-07 — STEP 7** | the engine stop, run as the pre-sprint reset's first act (Langston ruled; five conditions in `Change Lists/RELEASE_DEPLOY_2026-10-07_PLAN.md`) |
| **`B-RTB-ADMISSION-TIEBREAK-LIVE`** (row 59f) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~08:47Z)** | carried: `#1204` row 59g, `#378`; the legacy tail drains |
| **`B-RTB-QUEUED-STATUS-SWEEP`** (row 59g, `#1204`) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~15:30Z)** | carried: `#1124` row 134a, `#1006` |
| **`B-ORCHESTRATOR-ROUTES-REMOVAL`** (row 59g1, `#1210`) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11)** | carried: `#1212` row 59g3, `#1214` row 59g1a, `#1213` row 59g1b (CC-C) |
| **`B-FORMULA-HEALTH-AUDIT-FRESHNESS`** (row 59g1a, `#1214`) | ✅ **CLOSED 2026-11-10** — Coltrane confirmed Step 11 at `6b43579c3`; deployed `ee0a3b0e4`; report `Batch Completion/B_FORMULA_HEALTH_AUDIT_FRESHNESS_COMPLETION_REPORT.md` | Historical UI/restart leg remains unread, not a pass; no deferred batch |
| **`B-CRON-VERIFIER-QUERY-FAIL`** (row 59g2, `#1211`) | ✅ CLOSED 2026-10-18 (Langston confirmed Step 11, ~06:05Z) | carried: forward read on `#1211`, `#1217` row 59g4, `#1218` row 59g5 |
| **`B-RR-FLOOR-HEADROOM`** (row 59a) | **✅ CLOSED 2026-11-07 Langston confirmed Steps 10-11, 2026-11-07** — FAIL (b) / INSUFFICIENT (a): the fill-time RR check stays in shadow; report `Batch Completion/B_RR_FLOOR_HEADROOM_COMPLETION_REPORT.md` | Langston's Step-11 confirm, then resolve whichever of alerts `07df291f` / `20bba77f` is still open (and any open-max-age nag, `#1074`). Carried: the floor question on `#372` (row 131) with the 1.54 % figure; crypto's own read starts if row 59b moves crypto to `maker_preferred`; Step 7's archive → log arm reconciliation NOT RUN (for Langston's ruling) |
| **`B-SILENT-STRATEGY-CENSUS`** (row 52) | **STEP 10 — progress report, card Observation** | day-21 ruled 2026-11-06: replacement window from 2026-11-05T05:36:24Z, 20 filled closes or 2026-11-26 (11-06 21:31Z: EARLY STOP CROSSED, 14 closes −1.5645 %, reported to Kyle — **KD-61: Kyle chose (A), leave it on, no setting changes, read again at the fence**; window RE-BASED at the inc-A deploy (Langston + Coltrane); FENCE READ 11-07 (deploy `e0e68dfdb` 13:20:59Z): pre-change cohort 14 closes −1.5645 %, the diagnostic; RE-BASED window from 13:20:59Z, carriers `edd68d5a` (daily, first 11-09 21:30Z) + `0fd961b1` (backstop 11-28); every end ⇒ report to Kyle, no switch-off); then O3's four candidates, each with a feasibility read and its own pass/fail |
| **`B-FEED-HEALTH-GRADE-ARM`** (row 3a) | **✅ CLOSED 2026-11-06** (Langston confirmed Step 11) | leg 3 carried in row 33a `#1232`; reconnect thresholds in row 3a2 |
| **`B-VENUE-QUIET-ALERTING`** (row 3a1) | ✅ **CLOSED 2026-10-17 (Langston confirmed Step 11, ~05:45Z)**; F1 deployed `7600476c5` | carried: the genuine-`firstJoin` read on alert `5b71b7ab` (2026-10-18 02:00Z, pre-registered); criterion 4 (duration page) unproven |
| hotfix **`B-PATTERN-ENUM-DRIFT`** (row 51, `#1063`) | **✅ CLOSED 2026-11-06** (Langston confirmed the close 2026-11-06 (Discord `1568207436995760219`)) — first ABCD-labelled `volatility_edge` paper open 2026-10-12T11:47:28Z | row 51's remainder stays queued (raw-vs-canonical labels, `'UNKNOWN'` fallback, TRI_STAR calibration watch) |
| **`B-FEED-MISMATCH-FIX`** (row `3n.u`) | **STEP 10 of 11 — observation window · ⏸ PAUSED for the sprint start (Kyle 2026-09-30)** | the data: 300 taker closes or 2026-10-10T00:02:43Z, whichever first. How it is read (per side of each boundary, the short-n rule, the reset excluded) is fixed in amendment 4a (`0c8918c5d`), Langston-confirmed. Then the progress report converts to the completion report. |
| **`T-W20C-SCALAR-LEG`** (sprint row 107) | **scope r1 drafted 2026-09-13 (`6e97a8f1c`), never ruled** | its turn in the sprint, after row 106 `B-PAPER-LANE-PROVENANCE` |

## 4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)

- KD-87 (2026-11-16) [LAST 48 H] status DECIDED — **The KD-84 ready-to-buy pool fix folds into row 9j `B-RTB-PROMOTION-RETRY-STORM` (#1136)**, re-scoped at its Step 1 with Kyle's design intent (check free slots AND money at promotion; never consume …
- KD-86 (2026-11-16) [LAST 48 H] status DECIDED — **The Guardrail Max slot count is recalculated from money held**: the $820 anchor plus closed-trade profit and loss, without open-trade swings (~$567 on 11-15), the same figure sizing and the money c…
- KD-84 (2026-11-15) [LAST 48 H] status DECIDED — **NEW Claude investigates the ready-to-buy pool collapse now** (weekday median 30-145 signals Oct 12-Nov 6, 1-2 from Nov 9; before B-ENTRY-GATE incs A/B; lead, untested: the 11-08 01:31Z deploy that …
- KD-82 (2026-11-15) [LAST 48 H] status DECIDED — **Row 172 `B-TEC-PRIME-BOOT-RACE` (#1053) moves from Infra Claude to NEW Claude, run right after B-ENTRY-GATE increment B**, folding CC-C's 3n.c boot half (group recommendation NEW + Langston + Coltr…
- KD-78 (2026-11-14) [LAST 48 H] status DECIDED — **NEW starts `B-ALERT-INSERT-CONTRACT` now** (the feed-health monitor crashes while saving its own alerts: 42 aborted checks on 6 of 14 days; owner NEW, fix settled by NEW + Langston + ANALYST on 11-…
- KD-77 (2026-11-13) status DECIDED — **Close the 7 xStock paper positions open more than 7 days tonight, before the 01:00Z xStock weekend shutdown (5 vwap_pullback, 2 strong_bull_trend, all in profit, +$5.63 together at Infra's 21:01Z r…
- KD-76 (2026-11-13) status DECIDED — **strong_bull_trend on xStock stays ON after its second test window ended in a registered FAIL (first 20 filled closes since the 11-07 entry-gate change averaged -0.56 %, 4 winners and 16 losers; -0.…
- KD-75 (2026-11-13) status RELAYED — **A timed observation never leaves an owner idle.** After safely arming the boundary capture or watcher, the owner moves to its next independent recorded batch; if the nominal next item depends on th…
- KD-74 (2026-11-13) status RELAYED — **NEW Claude retains technical/policy ownership of existing row 166b, `B-XSTOCK-WEEKEND-POSTURE`; INFRA Claude collects its bounded read-only weekend evidence immediately after Friday's close and han…
- KD-73 (2026-11-12) status RELAYED [also: PM Codex] — **Preserve KD-57, O3, the active strong_bull_trend xStock observation and every live setting. Add `R-SBT-XSTOCK-PUBLISHED-BASELINE` as a named prerequisite to sprint row 129 / roadmap 25-17 and as a …
- KD-71 (2026-11-10) status IN WORK [also: PM Codex] — **Keep the Codex crew working until the weekly account meter reaches 92% used, then stop all Codex-side allowance consumers at safe boundaries and keep them stopped through the weekly reset. PM Codex…
- KD-64 (2026-11-09) status DECIDED — **The whole building crew switches to ChatGPT (Codex) now, not after PM Codex is built, because the Claude crew is stopped until the 11-12 23:00Z reset. OLD Codex builds PM Codex first and coordinate…
- KD-61 (2026-11-06) status ACKED (CC-B bf8f5c731) — **strong_bull_trend on xStock stays ON after crossing its -1.5 % early-stop line (14 closed paper trades, all stopped out, 0 winners, average -1.56 %), with no setting changes, until its window close…
- KD-57 (2026-11-06) status ACKED (CC-B ~17:0xZ) — **Amends KD-7's timing: xStock's four strategy switch-ons (adaptive_flow, reverse_impulse, volatility_edge, support_bounce; B-SILENT-STRATEGY-CENSUS O3, row 52) wait until B-ENTRY-GATE increment A is…
- KD-56 (2026-11-06) status ACKED (INFRA ~13:3xZ, CC-B 51… — **B-DEPLOY-WINDOW-GUARD (#1249), option A: built BEFORE live, Infra Claude, after the KD-50 pair (B-AGENT-INVOKE-FAILURE-NOTICE, then B-SIZE-WATCH-BREACH-ALARM).** A register of open test windows rea…
- KD-43 (2026-11-05) status IN PROGRESS — **Every batch closes with proper and complete governance. PM Claude checks each completion report's governance-files-changed list against the batch's class doc set (`workflow-10-governance`) before c…
- KD-38 (2026-11-05) status DECIDED — **xStock's assumed 60% win chance is NOT patched on its own. The win chance is measured from real outcomes for both crypto and xStock (row 148a, B-PWIN-CALIBRATION), after the confidence audit (row 1…
- KD-36 (2026-11-05) status DECIDED — **Trailing exits and break-even exits stay OFF in paper mode and the VTS until after live mode is running normally; work on them waits until then.** The dormant VTS-to-paper trailing write (`PRICING_…
- KD-34 (2026-11-05) status DECIDED — **Technical decisions are made by the owning session + Langston + Coltrane to consensus, on a full provenance pack PM Claude assembles (original intent back to the pre-governance records, what is bui…
- KD-31 (2026-11-05) status DECIDED — **The entry gate (B-ENTRY-GATE) and price-feed coverage (B-PRICE-FEED-COVERAGE, `#1222`) stay separate batches.** The entry gate keeps each checkpoint's existing freshness limit until `#1222` sets on…
- KD-11 (2026-11-04) status ACKED — Entry gate profit test: a trade must make money after real fees, with no assumed win rate when data is missing (Langston's Reply A); the profit-to-cost minimum stays watch-only until measured.
- KD-10 (2026-11-04) status ACKED — Entry gate window: check only fills worse than planned, plus a cheaper-side floor keeping about 40% of the planned room to the stop; watch-only until measured.
- KD-9 (2026-11-04) status ACKED — Filter Diagnostics stays in scope (not hands-off) and stays later in the sprint: useful for seeing what the entry gate keeps and refuses, not critical.
- KD-7 (2026-11-04) status ACKED — Switch on the four xStock strategies still off (adaptive_flow, reverse_impulse, volatility_edge, support_bounce) right after the direction-score fix, each after a check that its targets are reachable…
- KD-4 (2026-11-04) status IN PLAN — **Kyle works through PM Claude; PM Claude relays decisions, records them here and makes sure they are implemented where and when agreed.**
- KD-2 (2026-11-04) status ACKED — **Five data-truth fixes lead the pre-sprint table, in order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch, guard the shared database connections, owner …

## 5. Plan vs task list disagreements

NOT COMPARABLE: the task list is UNPARSEABLE, so nothing was compared (this is not an agreement).


## Push-back analysis (PM candidate position)

Placement read as CC-B list position 2c, after 2a (row 9j) and 2b (row 172), so CC-B list orders 3, 4 and 5 move one slot later.

Ranked push-back:
1. Open trades: the CC-B list does not name any batch that protects open trades during a database outage. Item 2 (#1260, options paper) adds a Step 1 paper only, no code, so it protects nothing until Kyle chooses an option and a later batch builds it. Item 1 (59g4) only pages someone. Placing both late delays that protection.
2. Faulty closes: no row between 2b and order 5 is a close fix. Row 172 (boot race) sits ahead. Push-back: none readable.
3. Calibration data: rows 100, 103, 104 and the stage 5 reset are not on the CC-B list before order 5. Push-back: none readable, apart from CC-B time.
4. KD-2 data truth: order 3 B-PRICE-FEED-COVERAGE (#1222, in flight, Step 7) is the item pushed back if it is not already running in parallel. A Step 1 paper is small, so it need not stop it.
5. Everything else: order 4 B-PLAN-PRICE-BASIS, order 5 B-BOOK-TRUST-FLEET-GUARD, row 59g5.

Could not read: effort size of 59g4, the owner of 59g4, whether row 59g4 or #1260 overlaps row 5 B-BOOK-TRUST-FLEET-GUARD, and the task list (unparseable), so CC-B's real current step is unconfirmed.
