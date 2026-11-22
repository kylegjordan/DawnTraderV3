# PM slot check — CC-A

- ref: origin/migration/aws-supabase
- ref-sha: 377147369b96af37d5349a0d79f31c7174bb30b2
- origin-head: 377147369b96af37d5349a0d79f31c7174bb30b2
- freshness: FRESH
- owner: CC-A
- item: B-XSTOCK-CORRELATION-COLLECT follow-on: fix VTS replay mislabelling ~38-40% of new records as real trade rejected (and re-check the old rows), and count skipped correlation records; Kyle chose to place it after CC-A's current agreed list
- generated: 2026-11-22T18:49:55.624Z

## 1. Open plan rows (plan order)

- section 4 row 1a (line 225) [queued] B-PRUNE-REASON-AUDIT — The inventory's UNCONFIRMED prune reasons, audited item by item: 69 auto-prunes (63 by an issue-body word match, 6 by a status cell) plus 5 whose later decisio… — status: QUEUED
- section 4 row 1b (line 226) [queued] B-BATCH-ID-ALIAS-GRAMMAR — One naming source for batch ids: the alias table (`EQUIV` in `scripts/inventory/unify.py`, e.g. `B-GRID-REPRESENTABILITY` ↔ `F-G-1`) becomes the single SSOT th… — status: QUEUED
- section 4 row 1f (line 227) [queued] B-ISSUE-ID-COLLISION — Reused issue numbers renumbered: at least 6 numbers in `RUNNING_ISSUES.md` each carry two different issues (`#559`, `#642`, `#646`, `#648`, `#741`, `#921`; pro… — status: QUEUED
- section 4 row 1j (line 228) [queued] B-GOV-ENROLMENT-WINDOW-OBJECT — The governance checker's enrolment window becomes a chosen object: it grades the last 300 commits, a proxy for time whose reach is set by commit velocity (abou… — status: QUEUED
- section 4 row 1j1 (line 229) [queued] B-EXCEPTIONS-CONFIRMER-GRAMMAR (`#1203`) — The checker's exceptions parser honours a `pending` confirmer whenever the cell carries an annotation (an exact-string test, `poller.mjs:711`), while the dorma… — status: QUEUED
- section 4 row 1c (line 230) [queued] B-INVENTORY-SCRIPT-ROOT-REDIRECT — Every repo-tracked script in `scripts/inventory/` takes its repo root from the environment and FAILS CLOSED when unset (`DT_REPO` in `scripts/inventory/status_… — status: QUEUED
- section 4 row 1d (line 231) [queued] B-PLAN-WINDOW-EXPIRY — Finished lines leave §5: a line under *Running now — observation windows* whose window has ended or whose batch is closed is flagged, because the report-link c… — status: QUEUED
- section 4 row 1e (line 232) [queued] B-TRADE-RECORD-RETENTION — Close out the trade-record retention batch: its first two legs are live (the one-year window, entry details kept in the archive) and were never written up. Rew… — status: QUEUED
- section 4 row 1g (line 233) [queued] B-P19-PLAN-TO-HISTORY — Flip `PHASE_19_PLAN.md` to history when its last in-flight row closes: its header, `CLAUDE.md` §9.4 and `workflow-10-governance` say history; Langston's `CLAUD… — status: QUEUED
- section 4 row 1k (line 234) [queued] B-PLAN-ROW-DISAPPEARANCE — Deleting a batch's row from this plan must not silently resolve its plan-currency alert: the plan-state check treats an id that has left the plan as not requir… — status: QUEUED
- section 4 row 1l (line 239) [queued] B-ALERT-OWNER-ON-ROW (`#1137`) — Each alert's owner lives on the alert itself: Langston routes every due alert by writing an owner into a message, and because he keeps no memory between messag… — status: QUEUED
- section 4 row 1i (line 240) [queued] B-FEATURE-WATCH-ROUTING — A daily feature-watch finding that changes how a session operates gets a disposition the day it is surfaced: the 2026-09-15 finding that watches now expire eve… — status: QUEUED
- section 4 row 1z (line 250) [queued] B-CODEX-FAILOVER-AUTOMATION (`#731`) — Replace the Codex failover's manual substitutes with measured automation: automatic wake/alert delivery (incl. Kyle 2026-10-16: the switch itself must wake eve… — status: QUEUED
- section 4 row 1za (line 251) [queued] B-CENSUS-PRESPRINT-LIST (`#1200`) — The weekly plan census reads the sprint table and the after-live list as placement lists but not the §0a pre-sprint stage table, so issues placed only there re… — status: QUEUED
- section 4 row 1qa (line 253) [queued] B-WAKE-LOG-BOUND (`#1202`) — The wake log (`/var/log/cc-wake.log`, the summon and daily-check-in channel) grows forever: two writers, no rotation, no deleter, and row 1q adds re-issues. Gi… — status: QUEUED
- section 4 row 18 (line 315) [in_progress] B-UNIVERSE-REFRESH-ACTS — B-UNIVERSE-REFRESH-ACTS — status: IN FLIGHT — Step 1 (scope `Scope Files/B_UNIVERSE_REFRESH_ACTS_SCOPE.md`, 2026-…
- section 4 row 19 (line 316) [queued] B-SYMBOL-CLASS-IDENTITY — B-SYMBOL-CLASS-IDENTITY — status: QUEUED
- section 4 row 79 (line 400) [queued] B-TRADING-ENGINE-REMOVAL — B-TRADING-ENGINE-REMOVAL — status: QUEUED
- section 4 row 82 (line 404) [queued] #589 — batch named at Step 1 — #589 — status: QUEUED
- section 4 row 84 (line 406) [queued] #218 — batch named at Step 1 — #218 — status: QUEUED
- section 4 row 84a (line 407) [queued] B-DIRECTIVE-PURGE-ROUTE-RETIRE (`#1236`) — Retire the one-time Directive-11.6A purge route — status: QUEUED
- section 4 row 101m (line 426) [queued] #522 — batch named at Step 1 — #522 + #235(a) — the mechanics audit (KD-22) — status: QUEUED
- section 4 row 101 (line 428) [queued] #522 — batch named at Step 1 — #522 — status: QUEUED
- section 4 row 102 (line 429) [queued] #235 — batch named at Step 1 — #235 — status: QUEUED
- section 4 row 119a (line 453) [queued] B-TICKER-OUTAGE-HOLD — B-TICKER-OUTAGE-HOLD — status: QUEUED
- section 4 row 126 (line 468) [queued] #914 — batch named at Step 1 — #914 — status: QUEUED
- section 4 row 127 (line 469) [queued] roadmap 25-18 — batch named at Step 1 — 25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe — status: QUEUED
- section 4 row 128 (line 470) [queued] #645 — batch named at Step 1 — #645 — status: QUEUED
- section 4 row 141a (line 489) [queued] B-CONFIDENCE-AUDIT (`#1244` waits on it; KD-30, KD-33) — Audit the confidence score and design a trustworthy replacement (KD-30): provenance of the stored confidence (what writes it, whether paper and VTS store the s… — status: QUEUED
- section 4 row 141b (line 490) [queued] B-PAPER-FACTOR-CAPTURE-REPAIR (KD-41) — Repair paper factor capture (`#231`, `#1244`): a new admission-path signal writer (nothing writes the signal table today; its id is a UUID while the factor tab… — status: QUEUED
- section 4 row 142 (line 491) [queued] roadmap 25-12 — batch named at Step 1 — 25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 143 (line 492) [queued] roadmap 25-13 — batch named at Step 1 — 25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 144 (line 493) [queued] roadmap 25-14 — batch named at Step 1 — 25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 144a (line 494) [queued] `#399` (c) — Close the xStock DBS-score gap (strong-trend xStock reaches the Net Expectancy kernel with no DBS score, so pWin floors at 0.40) — status: QUEUED
- section 4 row 145 (line 495) [queued] roadmap 25-2 — batch named at Step 1 — 25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW — status: QUEUED
- section 4 row 146 (line 496) [queued] roadmap 25-10 — batch named at Step 1 — 25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice — status: QUEUED
- section 4 row 147 (line 497) [queued] roadmap 25-7 — batch named at Step 1 — 25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier — status: QUEUED
- section 4 row 148 (line 498) [queued] B-RETIRED-SCORE-REMOVAL (roadmap 16.7) — B-RETIRED-SCORE-REMOVAL — status: QUEUED
- section 4 row 148a (line 499) [queued] B-PWIN-CALIBRATION (`#399` (a) + (e)) — Rebuild predictive confidence as a calibrated probability of winning, together with the model score it calibrates (Kyle ratified 2026-07-13: a REBUILD, not a r… — status: QUEUED
- section 4 row 148b (line 500) [queued] `#399` (d) — Selection-IC go / no-go on the ranker — status: QUEUED
- section 4 row 149 (line 502) [queued] #588 — batch named at Step 1 — #588 — status: QUEUED
- section 4 row 149a (line 503) [queued] #541 — batch named at Step 1 — #541 — status: QUEUED
- section 4 row 150 (line 504) [queued] roadmap 25-4 — batch named at Step 1 — 25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh — status: QUEUED
- section 4 row 151 (line 505) [queued] roadmap 25-3 — batch named at Step 1 — 25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib — status: QUEUED
- section 4 row 152 (line 506) [queued] roadmap 25-15 — batch named at Step 1 — 25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar — status: QUEUED
- section 4 row 153 (line 507) [queued] roadmap 25-19 — batch named at Step 1 — 25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0 — status: QUEUED
- section 4 row 154 (line 508) [queued] #644 — batch named at Step 1 — #644 — status: QUEUED
- section 4 row 155 (line 515) [queued] roadmap 25-16 — batch named at Step 1 — 25-16 Trade-size / concurrency / win-rate dynamic + starting-balan — status: QUEUED
- section 4 row 157 (line 522) [queued] B-LEGACY-LIVE-EXIT-PATH (roadmap 21.1.a) — B-LEGACY-LIVE-EXIT-PATH — status: QUEUED
- section 4 row 167 (line 543) [queued] #634 — batch named at Step 1 — #634 — status: QUEUED
- section 4 row 168 (line 544) [queued] #632 — batch named at Step 1 — #632 — status: QUEUED
- section 4 row 169 (line 545) [queued] B-KILLSWITCH-DENOMINATOR — B-KILLSWITCH-DENOMINATOR — status: QUEUED
- section 4 row 170 (line 546) [queued] B-TOTAL-DRAWDOWN-WARNING — B-TOTAL-DRAWDOWN-WARNING — status: QUEUED
- section 4 row 171 (line 547) [queued] #519 — batch named at Step 1 — #519 — status: QUEUED
- section 4 row 177 (line 558) [queued] #517 — batch named at Step 1 — #517 — status: QUEUED
- section 4 row 179 (line 560) [queued] B-LIVE-PROCESS-SPLIT — Live mode runs as its own program on the same server — status: QUEUED
- section 4 row 179b (line 561) [queued] B-DRIFT-HOLD-AWARE (`#1091`) — The deploy-drift line learns a sanctioned hold, per program — status: QUEUED
- section 4 row 180 (line 562) [queued] roadmap 21-3c — batch named at Step 1 — 21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi — status: QUEUED
- section 4 row 181 (line 563) [queued] roadmap 21-3d — batch named at Step 1 — 21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B- — status: QUEUED
- section 4 row 182 (line 564) [queued] roadmap 19-10 — batch named at Step 1 — 19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr — status: QUEUED
- section 4 row 183 (line 565) [queued] roadmap 21.1 — batch named at Step 1 — 21.1 Live Mode Engine — - Create Live Mode trading engine based o — status: QUEUED
- section 4 row 184 (line 572) [queued] #322 — batch named at Step 1 — #322 — status: QUEUED
- section 4 row 185 (line 573) [queued] P19-B6.10 — P19-B6.10 retire the old per-mode guardrails table — status: QUEUED
- section 4 row 186 (line 574) [queued] roadmap 21-3a — batch named at Step 1 — 21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the " — status: QUEUED
- section 4 row 187 (line 575) [queued] roadmap 21.3 — batch named at Step 1 — 21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 — — status: QUEUED
- section 4 row 188 (line 576) [queued] roadmap 19-9 — batch named at Step 1 — 19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci — status: QUEUED
- section 4 row 189 (line 577) [queued] — batch named at Step 1 — 25-11a refuse a position larger than the visible book — status: QUEUED
- section 4 row 190 (line 579) [queued] — batch named at Step 1 — Protect live positions if our server dies — status: QUEUED
- section 4 row 191 (line 580) [queued] B-VENUE-RESTING-EXITS — B-VENUE-RESTING-EXITS — status: QUEUED
- section 4 row 195 (line 589) [queued] — batch named at Step 1 — Day-one live money settings — status: QUEUED
- section 4 row 197 (line 592) [queued] roadmap 21.2 — batch named at Step 1 — 21.2 Paper-to-Live Transition Testing — - Run parallel paper+live — status: QUEUED
- section 4 row 101r (line 594) [queued] #522 — batch named at Step 1 — #522 re-confirmation (KD-22) — status: QUEUED
- section 4 row 198 (line 595) [queued] roadmap 19-17b — batch named at Step 1 — 19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M — status: QUEUED

## 2. Pre-sprint rows

- stage 00 — data truth first (Kyle 2026-11-04, KD-2) order 5c (line 23) B-DB-SIZE-RELIEF (KD-32 A1 then A2: signal_eval_archive hot window 30 -> 15 days, ~20 GB … — status: 🟨 IN OBSERVATION 2026-11-15 — Steps 1-… — waiting on: CC-A (Old Claude)
- stage 0 — clear the plates (CC-A) order 1 (line 69) B-RULES-1e — status: PARKED (crew tooling, after live) — waiting on: nothing
- stage 0 — clear the plates (CC-A) order 2 (line 70) B-MEASURE-GATE — status: IN OBSERVATION — leg 2 built and CLOSED… — waiting on: data — OBJ-4: at least 50 enumerated real fires, precision …

## 3. Task list (parsed: CC-A section 00 order table)

- 1. `B-DB-POOL-GUARD` (`#1239`, absorbs `#1062`) — guard the app's 10 shared database connections — status: AT STEP 10 (2026-11-21). Increments 1-3b, P5 and r4 = B-DB-APP-TLS (KD-100) all… — decision: KD-2 order 3, KD-100
- 2. `B-DISK-FILE-TIERING` (`#1233`) with the price-feed debug-log trim (`#1240`) folded in — status: CLOSED 2026-11-22 (Langston confirmed Step 11): report `Batch Completion/B_DISK… [closed] — decision: KD-2 order 5
- 3. `B-STATUS-BOARD` (`#1227`) — RETIRED under Kyle's KD-35 (the phone board is not kept) — status: ✅ CLOSED 2026-11-13 (Step 11 CONFIRMED by Langston; report `Claude Comms and Pa… [closed] — decision: already agreed
- 4. `#527` — the xStock VTS records carry their cost split (fee, slippage, spread) — status: ✅ CLOSED 2026-11-05: already done 2026-07-17, measured complete since 2026-09-03 [closed] — decision: KD-13
- 5. Roadmap `25-9` — start collecting xStock pair-correlation data (collection only) — status: ✅ CLOSED 2026-11-22: `B-XSTOCK-CORRELATION-COLLECT` — Langston Step 11 CONFIRME… [closed] — decision: KD-14
- 6. Dead or one-time code removals (sprint rows 79, 82, 84, 84a) — status: after live ONLY if the reachability census (row 78, Infra Claude) shows each ca… — decision: KD-16
- —. Crew-tooling and governance-checker improvements — status: after live — decision: KD-15
- 7. End-to-end pipeline audit, split (`#522`, `#235`): row 101m mechanics — BEFORE row 100's learning-record restart, once row 100's other prer… — status: QUEUED — decision: KD-22
- 8. `B-CLOSE-WRITER-COSTS` (row 72): the close finds its record by symbol + asset class + mode; the open-side duplicate guard per mode (paper n… — status: ✅ CLOSED 2026-11-14 (Step 8 PROCEED by Langston; Step 11 report `Claude Comms a… [closed] — decision: KD-17, KD-24, KD-27
- 9. `B-UNIVERSE-REFRESH-ACTS` (row 18, `#1018`): the daily coin-list re-check acts on what it finds — status: QUEUED, straight after item 8 — decision: KD-26
- 10. `B-SYMBOL-CLASS-IDENTITY` (row 19, `#1024`): a ticker shared by a coin and an xStock becomes two instruments; closes with KD-25 (both may b… — status: QUEUED, after item 9 — decision: KD-26, KD-25
- 11. `#441` — the weekly xStock opportunity-loss watch, built by me as an item of ANALYST's `B-XSTOCK-SESSION-FRESHNESS` (row 3b.f-c); `B-XSTOCK… — status: ACKED 2026-11-06; build order is CC-C's batch, to the round-4 consensus in `pm/… — decision: KD-48
- 12. The cold-archive key: the staging app holds an account-wide Backblaze key; replace it with a bucket-restricted key that cannot delete, and … — status: DONE in `B-DISK-FILE-TIERING` OBJ-3 (2026-11-20): the app runs on the narrow no… [closed] — decision: KD-32
- 13. `B-ARCHIVE-NETWORK-RETRY` (`#705`): the price recorders keep a batch when the database refuses or cannot be reached, and alert when an over… — status: ✅ CLOSED 2026-11-20 (Langston Step 11 CONFIRMED 2026-11-20 (Discord `1573136535… [closed] — decision: KD-97 (plan §0a CC-A item 3)
- 13. `B-DB-SIZE-RELIEF` (sprint stage 00, order 5c): A1 signal_eval_archive hot window 30 -> 15 days; A2 the two monthly tables onto daily parti… — status: IN OBSERVATION from 2026-11-15 (Steps 1-9 done; Langston Step 8 CONFIRMED the p… — decision: KD-60
- ?. `#914` (row 126) — status: open with Kyle via PM Claude — decision: pending

## 4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)

- KD-113 (2026-11-22) [LAST 48 H] status DECIDED — **KD-75 restated and made always-loaded: a pause is not a stop.** During any wait (observation window, xStock trading, reviewer, timed read) the owner arms what the wait needs, moves to its next agre…
- KD-107 (2026-11-20) [LAST 48 H] status DECIDED — **Delete the wide (all-bucket) Backblaze key once the new restricted key has been shown working (B-DISK-FILE-TIERING 3d, KD-89).** OLD Claude shows the evidence, then deletes the wide key and records…
- KD-106 (2026-11-20) [LAST 48 H] status DECIDED — **Weekly Claude usage rule (replaces KD-99's 90% line): at 85% weekly, PM tells every session to finish what it is working on and reach a clean stop (pm-usage-stop); everyone is stopped by 90% (endin…
- KD-104 (2026-11-20) [LAST 48 H] status DECIDED — **`B-TICKER-OUTAGE-HOLD`, owner OLD Claude: raise the xStock ticker recorder's outage hold from 9 to 60 minutes (about 196 MB worst case). Placed directly after row 119 (the `#1032` fix it depends on…
- KD-100 (2026-11-16) status DECIDED — **Three database security items go on the list, all before live (Infra + Langston settled): (1) `B-DB-APP-TLS`, OLD Claude: encrypt the app's Supabase connections and verify Supabase's certificate (K…
- KD-99 (2026-11-16) status REPLACED by KD-106 — **This week's Claude usage stop line is 90% (raised from 85%).** Sessions keep working, reach a safe stopping point as 90% nears, then everything that bills Claude stops (pm-usage-stop) while Kyle de…
- KD-98 (2026-11-16) status DECIDED — **Amends KD-92: a session may verify any KD row against Kyle's own words in the PM Claude transcript (path in the row) and act on it without asking him again.** The safety-rule exceptions stay (creat…
- KD-97 (2026-11-16) status DECIDED — **#705 archive-writer retry fix now, standalone, by OLD Claude**: connection refused / host or network unreachable / temporary DNS failure become retryable (not-found stays permanent), a per-class al…
- KD-93 (2026-11-16) status DECIDED — **Root-cause investigation of the 11-16 staging database ban (#1259) NOW, urgent: why Supabase banned staging's address, whether we are triggering it (failed logins, connection churn, rate limits), w…
- KD-92 (2026-11-16) status DECIDED — **Kyle's decisions given to PM Claude bind the crew: a session acts on a KD row in this ledger (Kyle's verbatim, time, chat) without asking Kyle again in its own chat.** Stated limit: the Claude safe…
- KD-89 (2026-11-16) status DECIDED — **Reverses KD-85: the restricted Backblaze key is created.** B-DISK-FILE-TIERING 3d steps 3-5 (mint a list/read/write-only key, swap it in, prove it, retire the wide key) are back in. Kyle decided af…
- KD-85 (2026-11-16) status DECIDED — **No narrow Backblaze key.** B-DISK-FILE-TIERING 3d steps 3-5 (mint a list/read/write-only key, swap it in, retire the wide key) are dropped; the server keeps its existing key. OLD re-plans the batch…
- KD-80 (2026-11-14) status DECIDED — **The Data Archive page fix goes into B-DB-SIZE-RELIEF now, as a Step-9 iterate under Langston's conditions** (show the database's row estimates labelled approximate, or "at least N" where a month pa…
- KD-79 (2026-11-14) status DECIDED — **Permanently delete the two leftover cold-archive (Backblaze) versions named by OLD's cold-bind report** (deploy 7c5b45c67): (1) the 170,761,082 B phase-41F-L-trace copy uploaded 2026-11-05, id 4_za…
- KD-75 (2026-11-13) status RELAYED — **A timed observation never leaves an owner idle.** After safely arming the boundary capture or watcher, the owner moves to its next independent recorded batch; if the nominal next item depends on th…
- KD-71 (2026-11-10) status IN WORK [also: PM Codex] — **Keep the Codex crew working until the weekly account meter reaches 92% used, then stop all Codex-side allowance consumers at safe boundaries and keep them stopped through the weekly reset. PM Codex…
- KD-65 (2026-11-09) status DECIDED — **PM Codex is built directly, not as a batch: no eleven workflow steps, scope, audit or step reviews. OLD Codex writes the files, pushes, tells Kyle how to open PM Codex, then proves one handover. Th…
- KD-64 (2026-11-09) status DECIDED — **The whole building crew switches to ChatGPT (Codex) now, not after PM Codex is built, because the Claude crew is stopped until the 11-12 23:00Z reset. OLD Codex builds PM Codex first and coordinate…
- KD-63 (2026-11-09) status DECIDED — **A crew switch between Claude and ChatGPT starts when Kyle tells the PM in its chat; the PM then issues the order itself (crew-switch start), with no Discord line from Kyle. PM Claude runs the move …
- KD-62 (2026-11-09) status DECIDED — **PM Codex (the ChatGPT stand-in for PM Claude, planned in B-PM-CLAUDE P4 but never built) is built by OLD Codex as the first job of the Codex shift, reviewed by Coltrane, from the brief at 1-system-…
- KD-60 (2026-11-06) status ACKED (CC-A bd76a274d) — **B-DB-SIZE-RELIEF (CC-A, KD-32 A1 then A2) placed in stage 00 at order 5c: the signal-evaluation archive's live window goes from a rolling 30 days to a rolling 15 (~20 GB freed for good, database ~6…
- KD-54 (2026-11-06) status ACKED (CC-A ~11:5xZ) — **Backblaze key narrowing approved:** the staging app's wide `dt-cold-archive` key (all buckets, 29 rights incl. deleteBuckets/deleteKeys/writeKeys) is replaced by a key limited to `dt-archive-cold` …
- KD-53 (2026-11-06) status ACKED (INFRA ~11:4xZ, CC-A ~1… — **Backblaze B2 is paid, pay-as-you-go (no package). FINAL SETTINGS, READ BACK by PM Claude in Kyle's dashboard 11-06 ~12:1xZ: payment method on; Daily STORAGE = No Cap with an alert email at $0.10/da…
- KD-48 (2026-11-06) status ACKED (CC-A ~11:1xZ, CC-C ~11… — **#441, Kyle's July xStock capture-rate condition: option A.** The weekly xStock opportunity-loss watch is built as an item of ANALYST's `B-XSTOCK-SESSION-FRESHNESS` (row 3b.f-c), CC-A building it, C…
- KD-45 (2026-11-05) status ACKED (OLD 22:5xZ) — **The Active Trades "Clear stranded" button is folded into "Close all"**, since after B-CLOSE-WRITER-COSTS both close every open position through the normal close. Done inside B-CLOSE-WRITER-COSTS (O…
- KD-43 (2026-11-05) status IN PROGRESS — **Every batch closes with proper and complete governance. PM Claude checks each completion report's governance-files-changed list against the batch's class doc set (`workflow-10-governance`) before c…
- KD-42 (2026-11-05) status ACKED (INFRA 19:4xZ, OLD 21:3… — **The two small Infra items of KD-39 are placed on the after-live list (`PRE_LIVE_SPRINT.md`, after B-REVIEW-REF-READ) as B-PUSH-GUARD-ROOT (Infra Claude) and B-CRONTAB-SNAPSHOT (Infra Claude half 1,…
- KD-41 (2026-11-05) status ACKED (OLD 21:3xZ) — **B-PAPER-FACTOR-CAPTURE-REPAIR (OLD Claude) is placed at `SPRINT_TO_LIVE_PLAN` row 141b, directly after the confidence audit (141a) and before row 142.** Repair order: new admission-path signal writ…
- KD-40 (2026-11-05) status DECIDED — **The three live-mode gaps from KD-37 fold into the live build's existing rows (group decision under KD-34: OLD Claude, Coltrane, Langston): (1) paper and live running together, with two-way isolatio…
- KD-39 (2026-11-05) status DECIDED (technical) — awaitin… — **Two small Infra items are technically agreed (owner + Langston + Coltrane, KD-34), NOT yet placed: (1) the push-guard type-check runs and keys every error from the repo root, with four fast tests, …
- KD-38 (2026-11-05) status DECIDED — **xStock's assumed 60% win chance is NOT patched on its own. The win chance is measured from real outcomes for both crypto and xStock (row 148a, B-PWIN-CALIBRATION), after the confidence audit (row 1…
- KD-36 (2026-11-05) status DECIDED — **Trailing exits and break-even exits stay OFF in paper mode and the VTS until after live mode is running normally; work on them waits until then.** The dormant VTS-to-paper trailing write (`PRICING_…
- KD-35 (2026-11-05) status DECIDED — **The phone status board (B-STATUS-BOARD) is no longer maintained, and sessions no longer keep their own task lists: PM Claude keeps ONE master task list of every batch, sub-batch, hotfix, investigat…
- KD-34 (2026-11-05) status DECIDED — **Technical decisions are made by the owning session + Langston + Coltrane to consensus, on a full provenance pack PM Claude assembles (original intent back to the pre-governance records, what is bui…
- KD-33 (2026-11-05) status DECIDED — **The confidence audit is B-CONFIDENCE-AUDIT, owner OLD Claude, placed at `SPRINT_TO_LIVE_PLAN` row 141a: the first OLD Claude item of the Phase 25 calibration block, after row 125 and before row 142…
- KD-32 (2026-11-05) status DECIDED — **Backblaze: do not raise the daily download cap yet.** Plan cold-archive downloads in daily chunks that stay under the free daily limit; raise the cap only when storage need requires it. **Amended 2…
- KD-30 (2026-11-05) status DECIDED — **No confidence data is captured until the confidence score is audited and redesigned.** The fix for paper trades not saving confidence-factor records (`#1244`) waits behind a thorough audit (provena…
- KD-27 (2026-11-05) status ACKED — **OLD Claude's order stands:** after his in-flight items, `#527` (xStock paper costs) and the 25-9 correlation collection come BEFORE `B-CLOSE-WRITER-COSTS` and rows 18-19. Reason: the first two fix …
- KD-26 (2026-11-04) status RELAYED — **OLD Claude (CC-A) owns rows 18 and 19 — B-UNIVERSE-REFRESH-ACTS (`#1018`: the daily coin-list re-check acts on what it finds, instead of waiting for a restart) then B-SYMBOL-CLASS-IDENTITY (`#1024`…
- KD-25 (2026-11-04) status RELAYED — **Intended behaviour: within one mode, a crypto coin and an xStock sharing a ticker (e.g. DASH) may be open at the same time.** Kyle delegated the slot to PM Claude: it is the CLOSING objective of `B…
- KD-24 (2026-11-04) status ACKED [also: Langston] — The trade-record batch (`B-CLOSE-WRITER-COSTS`, OLD Claude) also makes **the VTS, paper and live fully independent**: the same symbol, even the same symbol and asset class, may trade in all three at …
- KD-23 (2026-11-04) status RELAYED — `#1242` (record more raw order-book messages than the 20-minute daily sample) goes on the after-live list, **only if a need appears**: nothing has needed it, trading does not use it, and price histor…
- KD-22 (2026-11-04) status IN PLAN — The end-to-end pipeline audit (`#522`, `#235`) is split, per Langston's ruling: **101-M**, the mechanics audit, blocking, runs BEFORE the learning-record restart (row 100), so a mechanical fault is f…
- KD-18 (2026-11-04) status ACKED — `#914` keeps its slot; first confirm what the VTS now books at exit (exit-pricing work), so the cost study measures real slippage instead of assuming it.
- KD-17 (2026-11-04) status ACKED — `B-CLOSE-WRITER-COSTS` keeps its slot, with **no fallbacks**: first measure how often a close fails to write its trade record and how often a fee is unknown, find why each happens, and fix the cause …
- KD-16 (2026-11-04) status ACKED — Dead or one-time code may wait until after live **only if** it is shown isolated so it cannot affect paper or live trading; the dead-code reachability census (sprint, Infra Claude) decides, and anyth…
- KD-15 (2026-11-04) status ACKED — Crew-tooling and checker improvements wait until after live.
- KD-14 (2026-11-04) status ACKED — Start collecting xStock pair-correlation data before live (roadmap 25-9, collection only), after OLD Claude's stage-00 items.
- KD-4 (2026-11-04) status IN PLAN — **Kyle works through PM Claude; PM Claude relays decisions, records them here and makes sure they are implemented where and when agreed.**
- KD-2 (2026-11-04) status ACKED — **Five data-truth fixes lead the pre-sprint table, in order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch, guard the shared database connections, owner …

## 5. Plan vs task list disagreements

- task-list item 11 names B-XSTOCK-SESSION-FRESHNESS, which is in no plan row and no pre-sprint row
- task-list item 11 names B-XSTOCK-FRESHNESS-MONITOR, which is in no plan row and no pre-sprint row
- plan row 1a (B-PRUNE-REASON-AUDIT) is open for CC-A and is on no line of the task-list order table
- plan row 1b (B-BATCH-ID-ALIAS-GRAMMAR) is open for CC-A and is on no line of the task-list order table
- plan row 1f (B-ISSUE-ID-COLLISION) is open for CC-A and is on no line of the task-list order table
- plan row 1j (B-GOV-ENROLMENT-WINDOW-OBJECT) is open for CC-A and is on no line of the task-list order table
- plan row 1j1 (B-EXCEPTIONS-CONFIRMER-GRAMMAR) is open for CC-A and is on no line of the task-list order table
- plan row 1c (B-INVENTORY-SCRIPT-ROOT-REDIRECT) is open for CC-A and is on no line of the task-list order table
- plan row 1d (B-PLAN-WINDOW-EXPIRY) is open for CC-A and is on no line of the task-list order table
- plan row 1e (B-TRADE-RECORD-RETENTION) is open for CC-A and is on no line of the task-list order table
- plan row 1g (B-P19-PLAN-TO-HISTORY) is open for CC-A and is on no line of the task-list order table
- plan row 1k (B-PLAN-ROW-DISAPPEARANCE) is open for CC-A and is on no line of the task-list order table
- plan row 1l (B-ALERT-OWNER-ON-ROW) is open for CC-A and is on no line of the task-list order table
- plan row 1i (B-FEATURE-WATCH-ROUTING) is open for CC-A and is on no line of the task-list order table
- plan row 1z (B-CODEX-FAILOVER-AUTOMATION) is open for CC-A and is on no line of the task-list order table
- plan row 1za (B-CENSUS-PRESPRINT-LIST) is open for CC-A and is on no line of the task-list order table
- plan row 1qa (B-WAKE-LOG-BOUND) is open for CC-A and is on no line of the task-list order table
- plan row 79 (B-TRADING-ENGINE-REMOVAL) is open for CC-A and is on no line of the task-list order table
- plan row 84a (B-DIRECTIVE-PURGE-ROUTE-RETIRE) is open for CC-A and is on no line of the task-list order table
- plan row 119a (B-TICKER-OUTAGE-HOLD) is open for CC-A and is on no line of the task-list order table
- plan row 141a (B-CONFIDENCE-AUDIT) is open for CC-A and is on no line of the task-list order table
- plan row 141b (B-PAPER-FACTOR-CAPTURE-REPAIR) is open for CC-A and is on no line of the task-list order table
- plan row 148 (B-RETIRED-SCORE-REMOVAL) is open for CC-A and is on no line of the task-list order table
- plan row 148a (B-PWIN-CALIBRATION) is open for CC-A and is on no line of the task-list order table
- plan row 157 (B-LEGACY-LIVE-EXIT-PATH) is open for CC-A and is on no line of the task-list order table
- plan row 169 (B-KILLSWITCH-DENOMINATOR) is open for CC-A and is on no line of the task-list order table
- plan row 170 (B-TOTAL-DRAWDOWN-WARNING) is open for CC-A and is on no line of the task-list order table
- plan row 179 (B-LIVE-PROCESS-SPLIT) is open for CC-A and is on no line of the task-list order table
- plan row 179b (B-DRIFT-HOLD-AWARE) is open for CC-A and is on no line of the task-list order table
- plan row 185 (P19-B6.10) is open for CC-A and is on no line of the task-list order table
- plan row 191 (B-VENUE-RESTING-EXITS) is open for CC-A and is on no line of the task-list order table


## 6. Candidate position push-back (sonnet helper, judgement)

Candidate: after CC-A's current agreed list items (section 3 items 1, 7, 9, 10, 13), before its next unlisted work (the section 5 rows on no task-list line). Pushed back, ranked (hypothesis from row titles, not code reads):

1. Open trades: row 157 B-LEGACY-LIVE-EXIT-PATH (live-only; no paper open trade is touched). Rows 169 B-KILLSWITCH-DENOMINATOR and 170 B-TOTAL-DRAWDOWN-WARNING (risk limits).
2. Faulty closes: none among the unlisted rows (B-CLOSE-WRITER-COSTS is closed). Row 191 B-VENUE-RESTING-EXITS is live-only.
3. Calibration data: 141a B-CONFIDENCE-AUDIT, 141b B-PAPER-FACTOR-CAPTURE-REPAIR, 148a B-PWIN-CALIBRATION, 148 B-RETIRED-SCORE-REMOVAL.
4. KD-2 data truth: 119a B-TICKER-OUTAGE-HOLD (KD-104, xStock ticker recorder hold 9 to 60 min).
5. Everything else: 1a, 1b, 1f, 1j, 1j1, 1c, 1d, 1e, 1g, 1k, 1l, 1i, 1z, 1za, 1qa, 79, 84a, 179, 179b, 185.

Not pushed back: the five agreed items. This follow-on is itself a data-truth fix (replay mislabelling), so it ranks above 3 to 5. Note 119a (KD-104) sits in the push-back set although it is a KD-2-class item; flag for Kyle.
