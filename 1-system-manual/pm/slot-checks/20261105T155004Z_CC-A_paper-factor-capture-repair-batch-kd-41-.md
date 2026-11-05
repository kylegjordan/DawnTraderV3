# PM slot check — CC-A

- ref: origin/migration/aws-supabase
- ref-sha: ea6d0af6ed94e27fb12414f2ff1bf88a349ff71a
- origin-head: ea6d0af6ed94e27fb12414f2ff1bf88a349ff71a
- freshness: FRESH
- owner: CC-A
- item: Paper factor-capture repair batch (KD-41: #231/#1244 - new admission-path signal writer, identity link, writer then replay landing dark, switch-on after B-CONFIDENCE-AUDIT names the consumer) placed directly after B-CONFIDENCE-AUDIT row 141a; and archival-health schedule check against the root-crontab snapshot (KD-39 item 2 half 2)
- generated: 2026-11-05T15:50:04.407Z

## 1. Open plan rows (plan order)

- section 4 row 1a (line 205) [queued] B-PRUNE-REASON-AUDIT — The inventory's UNCONFIRMED prune reasons, audited item by item: 69 auto-prunes (63 by an issue-body word match, 6 by a status cell) plus 5 whose later decisio… — status: QUEUED
- section 4 row 1b (line 206) [queued] B-BATCH-ID-ALIAS-GRAMMAR — One naming source for batch ids: the alias table (`EQUIV` in `scripts/inventory/unify.py`, e.g. `B-GRID-REPRESENTABILITY` ↔ `F-G-1`) becomes the single SSOT th… — status: QUEUED
- section 4 row 1f (line 207) [queued] B-ISSUE-ID-COLLISION — Reused issue numbers renumbered: at least 6 numbers in `RUNNING_ISSUES.md` each carry two different issues (`#559`, `#642`, `#646`, `#648`, `#741`, `#921`; pro… — status: QUEUED
- section 4 row 1j (line 208) [queued] B-GOV-ENROLMENT-WINDOW-OBJECT — The governance checker's enrolment window becomes a chosen object: it grades the last 300 commits, a proxy for time whose reach is set by commit velocity (abou… — status: QUEUED
- section 4 row 1j1 (line 209) [queued] B-EXCEPTIONS-CONFIRMER-GRAMMAR (`#1203`) — The checker's exceptions parser honours a `pending` confirmer whenever the cell carries an annotation (an exact-string test, `poller.mjs:711`), while the dorma… — status: QUEUED
- section 4 row 1c (line 210) [queued] B-INVENTORY-SCRIPT-ROOT-REDIRECT — Every repo-tracked script in `scripts/inventory/` takes its repo root from the environment and FAILS CLOSED when unset (`DT_REPO` in `scripts/inventory/status_… — status: QUEUED
- section 4 row 1d (line 211) [queued] B-PLAN-WINDOW-EXPIRY — Finished lines leave §5: a line under *Running now — observation windows* whose window has ended or whose batch is closed is flagged, because the report-link c… — status: QUEUED
- section 4 row 1e (line 212) [queued] B-TRADE-RECORD-RETENTION — Close out the trade-record retention batch: its first two legs are live (the one-year window, entry details kept in the archive) and were never written up. Rew… — status: QUEUED
- section 4 row 1g (line 213) [queued] B-P19-PLAN-TO-HISTORY — Flip `PHASE_19_PLAN.md` to history when its last in-flight row closes: its header, `CLAUDE.md` §9.4 and `workflow-10-governance` say history; Langston's `CLAUD… — status: QUEUED
- section 4 row 1k (line 214) [queued] B-PLAN-ROW-DISAPPEARANCE — Deleting a batch's row from this plan must not silently resolve its plan-currency alert: the plan-state check treats an id that has left the plan as not requir… — status: QUEUED
- section 4 row 1l (line 219) [queued] B-ALERT-OWNER-ON-ROW (`#1137`) — Each alert's owner lives on the alert itself: Langston routes every due alert by writing an owner into a message, and because he keeps no memory between messag… — status: QUEUED
- section 4 row 1i (line 220) [queued] B-FEATURE-WATCH-ROUTING — A daily feature-watch finding that changes how a session operates gets a disposition the day it is surfaced: the 2026-09-15 finding that watches now expire eve… — status: QUEUED
- section 4 row 1z (line 230) [queued] B-CODEX-FAILOVER-AUTOMATION (`#731`) — Replace the Codex failover's manual substitutes with measured automation: automatic wake/alert delivery (incl. Kyle 2026-10-16: the switch itself must wake eve… — status: QUEUED
- section 4 row 1za (line 231) [queued] B-CENSUS-PRESPRINT-LIST (`#1200`) — The weekly plan census reads the sprint table and the after-live list as placement lists but not the §0a pre-sprint stage table, so issues placed only there re… — status: QUEUED
- section 4 row 1qa (line 233) [queued] B-WAKE-LOG-BOUND (`#1202`) — The wake log (`/var/log/cc-wake.log`, the summon and daily-check-in channel) grows forever: two writers, no rotation, no deleter, and row 1q adds re-issues. Gi… — status: QUEUED
- section 4 row 18 (line 295) [queued] B-UNIVERSE-REFRESH-ACTS — B-UNIVERSE-REFRESH-ACTS — status: QUEUED
- section 4 row 19 (line 296) [queued] B-SYMBOL-CLASS-IDENTITY — B-SYMBOL-CLASS-IDENTITY — status: QUEUED
- section 4 row 72 (line 373) [queued] B-CLOSE-WRITER-COSTS — B-CLOSE-WRITER-COSTS — status: QUEUED
- section 4 row 79 (line 380) [queued] B-TRADING-ENGINE-REMOVAL — B-TRADING-ENGINE-REMOVAL — status: QUEUED
- section 4 row 82 (line 384) [queued] #589 — batch named at Step 1 — #589 — status: QUEUED
- section 4 row 84 (line 386) [queued] #218 — batch named at Step 1 — #218 — status: QUEUED
- section 4 row 84a (line 387) [queued] B-DIRECTIVE-PURGE-ROUTE-RETIRE (`#1236`) — Retire the one-time Directive-11.6A purge route — status: QUEUED
- section 4 row 101m (line 406) [queued] #522 — batch named at Step 1 — #522 + #235(a) — the mechanics audit (KD-22) — status: QUEUED
- section 4 row 101 (line 408) [queued] #522 — batch named at Step 1 — #522 — status: QUEUED
- section 4 row 102 (line 409) [queued] #235 — batch named at Step 1 — #235 — status: QUEUED
- section 4 row 105 (line 417) [in_progress] B-XSTOCK-CORRELATION-COLLECT (roadmap 25-9) — 25-9 xStock pair_correlation per-pair WR data accumulation (B68.3 — status: IN FLIGHT — Step 1 (scope r1, `Scope Files/B_XSTOCK_CORRELATION_COLLECT_SCOPE.m…
- section 4 row 126 (line 447) [queued] #914 — batch named at Step 1 — #914 — status: QUEUED
- section 4 row 127 (line 448) [queued] roadmap 25-18 — batch named at Step 1 — 25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe — status: QUEUED
- section 4 row 128 (line 449) [queued] #645 — batch named at Step 1 — #645 — status: QUEUED
- section 4 row 141a (line 468) [queued] B-CONFIDENCE-AUDIT (`#1244` waits on it; KD-30, KD-33) — Audit the confidence score and design a trustworthy replacement (KD-30): provenance of the stored confidence (what writes it, whether paper and VTS store the s… — status: QUEUED
- section 4 row 142 (line 469) [queued] roadmap 25-12 — batch named at Step 1 — 25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 143 (line 470) [queued] roadmap 25-13 — batch named at Step 1 — 25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 144 (line 471) [queued] roadmap 25-14 — batch named at Step 1 — 25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) — — status: QUEUED
- section 4 row 144a (line 472) [queued] `#399` (c) — Close the xStock DBS-score gap (strong-trend xStock reaches the Net Expectancy kernel with no DBS score, so pWin floors at 0.40) — status: QUEUED
- section 4 row 145 (line 473) [queued] roadmap 25-2 — batch named at Step 1 — 25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW — status: QUEUED
- section 4 row 146 (line 474) [queued] roadmap 25-10 — batch named at Step 1 — 25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice — status: QUEUED
- section 4 row 147 (line 475) [queued] roadmap 25-7 — batch named at Step 1 — 25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier — status: QUEUED
- section 4 row 148 (line 476) [queued] B-RETIRED-SCORE-REMOVAL (roadmap 16.7) — B-RETIRED-SCORE-REMOVAL — status: QUEUED
- section 4 row 148a (line 477) [queued] B-PWIN-CALIBRATION (`#399` (a) + (e)) — Rebuild predictive confidence as a calibrated probability of winning, together with the model score it calibrates (Kyle ratified 2026-07-13: a REBUILD, not a r… — status: QUEUED
- section 4 row 148b (line 478) [queued] `#399` (d) — Selection-IC go / no-go on the ranker — status: QUEUED
- section 4 row 149 (line 480) [queued] #588 — batch named at Step 1 — #588 — status: QUEUED
- section 4 row 149a (line 481) [queued] #541 — batch named at Step 1 — #541 — status: QUEUED
- section 4 row 150 (line 482) [queued] roadmap 25-4 — batch named at Step 1 — 25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh — status: QUEUED
- section 4 row 151 (line 483) [queued] roadmap 25-3 — batch named at Step 1 — 25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib — status: QUEUED
- section 4 row 152 (line 484) [queued] roadmap 25-15 — batch named at Step 1 — 25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar — status: QUEUED
- section 4 row 153 (line 485) [queued] roadmap 25-19 — batch named at Step 1 — 25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0 — status: QUEUED
- section 4 row 154 (line 486) [queued] #644 — batch named at Step 1 — #644 — status: QUEUED
- section 4 row 155 (line 493) [queued] roadmap 25-16 — batch named at Step 1 — 25-16 Trade-size / concurrency / win-rate dynamic + starting-balan — status: QUEUED
- section 4 row 157 (line 500) [queued] B-LEGACY-LIVE-EXIT-PATH (roadmap 21.1.a) — B-LEGACY-LIVE-EXIT-PATH — status: QUEUED
- section 4 row 167 (line 521) [queued] #634 — batch named at Step 1 — #634 — status: QUEUED
- section 4 row 168 (line 522) [queued] #632 — batch named at Step 1 — #632 — status: QUEUED
- section 4 row 169 (line 523) [queued] B-KILLSWITCH-DENOMINATOR — B-KILLSWITCH-DENOMINATOR — status: QUEUED
- section 4 row 170 (line 524) [queued] B-TOTAL-DRAWDOWN-WARNING — B-TOTAL-DRAWDOWN-WARNING — status: QUEUED
- section 4 row 171 (line 525) [queued] #519 — batch named at Step 1 — #519 — status: QUEUED
- section 4 row 177 (line 536) [queued] #517 — batch named at Step 1 — #517 — status: QUEUED
- section 4 row 179 (line 538) [queued] B-LIVE-PROCESS-SPLIT — Live mode runs as its own program on the same server — status: QUEUED
- section 4 row 179b (line 539) [queued] B-DRIFT-HOLD-AWARE (`#1091`) — The deploy-drift line learns a sanctioned hold, per program — status: QUEUED
- section 4 row 180 (line 540) [queued] roadmap 21-3c — batch named at Step 1 — 21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi — status: QUEUED
- section 4 row 181 (line 541) [queued] roadmap 21-3d — batch named at Step 1 — 21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B- — status: QUEUED
- section 4 row 182 (line 542) [queued] roadmap 19-10 — batch named at Step 1 — 19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr — status: QUEUED
- section 4 row 183 (line 543) [queued] roadmap 21.1 — batch named at Step 1 — 21.1 Live Mode Engine — - Create Live Mode trading engine based o — status: QUEUED
- section 4 row 184 (line 550) [queued] #322 — batch named at Step 1 — #322 — status: QUEUED
- section 4 row 185 (line 551) [queued] P19-B6.10 — P19-B6.10 retire the old per-mode guardrails table — status: QUEUED
- section 4 row 186 (line 552) [queued] roadmap 21-3a — batch named at Step 1 — 21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the " — status: QUEUED
- section 4 row 187 (line 553) [queued] roadmap 21.3 — batch named at Step 1 — 21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 — — status: QUEUED
- section 4 row 188 (line 554) [queued] roadmap 19-9 — batch named at Step 1 — 19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci — status: QUEUED
- section 4 row 189 (line 555) [queued] — batch named at Step 1 — 25-11a refuse a position larger than the visible book — status: QUEUED
- section 4 row 190 (line 557) [queued] — batch named at Step 1 — Protect live positions if our server dies — status: QUEUED
- section 4 row 191 (line 558) [queued] B-VENUE-RESTING-EXITS — B-VENUE-RESTING-EXITS — status: QUEUED
- section 4 row 195 (line 567) [queued] — batch named at Step 1 — Day-one live money settings — status: QUEUED
- section 4 row 197 (line 569) [queued] roadmap 21.2 — batch named at Step 1 — 21.2 Paper-to-Live Transition Testing — - Run parallel paper+live — status: QUEUED
- section 4 row 101r (line 571) [queued] #522 — batch named at Step 1 — #522 re-confirmation (KD-22) — status: QUEUED
- section 4 row 198 (line 572) [queued] roadmap 19-17b — batch named at Step 1 — 19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M — status: QUEUED

## 2. Pre-sprint rows

- stage 00 — data truth first (Kyle 2026-11-04, KD-2) order 3 (line 19) B-DB-POOL-GUARD (guard the 10 shared database connections: a time limit to get one, a pag… — status: IN FLIGHT — Step 9 (2026-11-05: the poo… — waiting on: data — 48 h of pool readings to ~2026-11-07 08:10Z
- stage 00 — data truth first (Kyle 2026-11-04, KD-2) order 5a (line 21) B-DISK-FILE-TIERING (+ the price-feed debug-log trim, `#1240`, KD-2) — status: IN FLIGHT — Step 7 (deployed 2026-11-04… — waiting on: nothing
- stage CC-A list order 2 (line 37) B-STATUS-BOARD — status: IN FLIGHT — Step 7 (page live on stagin… — waiting on: Langston
- stage 0 — clear the plates (CC-A) order 1 (line 59) B-RULES-1e — status: PARKED (crew tooling, after live) — waiting on: nothing
- stage 0 — clear the plates (CC-A) order 2 (line 60) B-MEASURE-GATE — status: IN OBSERVATION — leg 2 built and CLOSED… — waiting on: data — OBJ-4: at least 50 enumerated real fires, precision …

## 3. Task list (parsed: CC-A section 00 order table)

- 1. `B-DB-POOL-GUARD` (`#1239`, absorbs `#1062`) — guard the app's 10 shared database connections — status: IN FLIGHT, Step 9 (measurement live 2026-11-05; 48 h readings to ~11-07 08:10Z,… — decision: KD-2 order 3
- 2. `B-DISK-FILE-TIERING` (`#1233`) with the price-feed debug-log trim (`#1240`) folded in — status: IN FLIGHT, Step 9 (trim deployed + verified; trace archived; cold-path memory f… — decision: KD-2 order 5
- 3. `B-STATUS-BOARD` (`#1227`) — Kyle's phone check, then Steps 10-11 — status: IN FLIGHT, Step 8 (old crew-status page retired 2026-11-05; Langston's second p… — decision: already agreed
- 4. `#527` — the xStock VTS records carry their cost split (fee, slippage, spread) — status: ✅ CLOSED 2026-11-05: already done 2026-07-17, measured complete since 2026-09-03 [closed] — decision: KD-13
- 5. Roadmap `25-9` — start collecting xStock pair-correlation data (collection only) — status: QUEUED, before live, after items 1-2 — decision: KD-14
- 6. Dead or one-time code removals (sprint rows 79, 82, 84, 84a) — status: after live ONLY if the reachability census (row 78, Infra Claude) shows each ca… — decision: KD-16
- —. Crew-tooling and governance-checker improvements — status: after live — decision: KD-15
- 7. End-to-end pipeline audit, split (`#522`, `#235`): row 101m mechanics — BEFORE row 100's learning-record restart, once row 100's other prer… — status: QUEUED — decision: KD-22
- 8. `B-CLOSE-WRITER-COSTS` (row 72): the close finds its record by symbol + asset class + mode; the open-side duplicate guard per mode (paper n… — status: IN FLIGHT, Step 2 (r2 amendment with Langston, 2026-11-05; order after items 4-… — decision: KD-17, KD-24, KD-27
- 9. `B-UNIVERSE-REFRESH-ACTS` (row 18, `#1018`): the daily coin-list re-check acts on what it finds — status: QUEUED, straight after item 8 — decision: KD-26
- 10. `B-SYMBOL-CLASS-IDENTITY` (row 19, `#1024`): a ticker shared by a coin and an xStock becomes two instruments; closes with KD-25 (both may b… — status: QUEUED, after item 9 — decision: KD-26, KD-25
- ?. `#914` (row 126) — status: open with Kyle via PM Claude — decision: pending

## 4. Decisions binding the owner and not DONE (newest first; last 48 h flagged)

- KD-38 (2026-11-05) [LAST 48 H] status DECIDED — **xStock's assumed 60% win chance is NOT patched on its own. The win chance is measured from real outcomes for both crypto and xStock (row 148a, B-PWIN-CALIBRATION), after the confidence audit (row 1…
- KD-36 (2026-11-05) [LAST 48 H] status DECIDED — **Trailing exits and break-even exits stay OFF in paper mode and the VTS until after live mode is running normally; work on them waits until then.** The dormant VTS-to-paper trailing write (`PRICING_…
- KD-35 (2026-11-05) [LAST 48 H] status DECIDED — **The phone status board (B-STATUS-BOARD) is no longer maintained, and sessions no longer keep their own task lists: PM Claude keeps ONE master task list of every batch, sub-batch, hotfix, investigat…
- KD-34 (2026-11-05) [LAST 48 H] status DECIDED — **Technical decisions are made by the owning session + Langston + Coltrane to consensus, on a full provenance pack PM Claude assembles (original intent back to the pre-governance records, what is bui…
- KD-33 (2026-11-05) [LAST 48 H] status DECIDED — **The confidence audit is B-CONFIDENCE-AUDIT, owner OLD Claude, placed at `SPRINT_TO_LIVE_PLAN` row 141a: the first OLD Claude item of the Phase 25 calibration block, after row 125 and before row 142…
- KD-32 (2026-11-05) [LAST 48 H] status DECIDED — **Backblaze: do not raise the daily download cap yet.** Plan cold-archive downloads in daily chunks that stay under the free daily limit; raise the cap only when storage need requires it.
- KD-30 (2026-11-05) [LAST 48 H] status DECIDED — **No confidence data is captured until the confidence score is audited and redesigned.** The fix for paper trades not saving confidence-factor records (`#1244`) waits behind a thorough audit (provena…
- KD-27 (2026-11-05) [LAST 48 H] status ACKED — **OLD Claude's order stands:** after his in-flight items, `#527` (xStock paper costs) and the 25-9 correlation collection come BEFORE `B-CLOSE-WRITER-COSTS` and rows 18-19. Reason: the first two fix …
- KD-26 (2026-11-04) [LAST 48 H] status RELAYED — **OLD Claude (CC-A) owns rows 18 and 19 — B-UNIVERSE-REFRESH-ACTS (`#1018`: the daily coin-list re-check acts on what it finds, instead of waiting for a restart) then B-SYMBOL-CLASS-IDENTITY (`#1024`…
- KD-25 (2026-11-04) [LAST 48 H] status RELAYED — **Intended behaviour: within one mode, a crypto coin and an xStock sharing a ticker (e.g. DASH) may be open at the same time.** Kyle delegated the slot to PM Claude: it is the CLOSING objective of `B…
- KD-24 (2026-11-04) [LAST 48 H] status ACKED [also: Langston] — The trade-record batch (`B-CLOSE-WRITER-COSTS`, OLD Claude) also makes **the VTS, paper and live fully independent**: the same symbol, even the same symbol and asset class, may trade in all three at …
- KD-23 (2026-11-04) [LAST 48 H] status RELAYED — `#1242` (record more raw order-book messages than the 20-minute daily sample) goes on the after-live list, **only if a need appears**: nothing has needed it, trading does not use it, and price histor…
- KD-22 (2026-11-04) [LAST 48 H] status IN PLAN — The end-to-end pipeline audit (`#522`, `#235`) is split, per Langston's ruling: **101-M**, the mechanics audit, blocking, runs BEFORE the learning-record restart (row 100), so a mechanical fault is f…
- KD-18 (2026-11-04) [LAST 48 H] status ACKED — `#914` keeps its slot; first confirm what the VTS now books at exit (exit-pricing work), so the cost study measures real slippage instead of assuming it.
- KD-17 (2026-11-04) [LAST 48 H] status ACKED — `B-CLOSE-WRITER-COSTS` keeps its slot, with **no fallbacks**: first measure how often a close fails to write its trade record and how often a fee is unknown, find why each happens, and fix the cause …
- KD-16 (2026-11-04) [LAST 48 H] status ACKED — Dead or one-time code may wait until after live **only if** it is shown isolated so it cannot affect paper or live trading; the dead-code reachability census (sprint, Infra Claude) decides, and anyth…
- KD-15 (2026-11-04) [LAST 48 H] status ACKED — Crew-tooling and checker improvements wait until after live.
- KD-14 (2026-11-04) [LAST 48 H] status ACKED — Start collecting xStock pair-correlation data before live (roadmap 25-9, collection only), after OLD Claude's stage-00 items.
- KD-4 (2026-11-04) [LAST 48 H] status IN PLAN — **Kyle works through PM Claude; PM Claude relays decisions, records them here and makes sure they are implemented where and when agreed.**
- KD-2 (2026-11-04) [LAST 48 H] status ACKED — **Five data-truth fixes lead the pre-sprint table, in order:** (1) finish the crypto price-feed watchdog; (2) finish the xStock bar check; (3) new batch, guard the shared database connections, owner …

## 5. Plan vs task list disagreements

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
- plan row 105 (B-XSTOCK-CORRELATION-COLLECT) is open for CC-A and is on no line of the task-list order table
- plan row 141a (B-CONFIDENCE-AUDIT) is open for CC-A and is on no line of the task-list order table
- plan row 148 (B-RETIRED-SCORE-REMOVAL) is open for CC-A and is on no line of the task-list order table
- plan row 148a (B-PWIN-CALIBRATION) is open for CC-A and is on no line of the task-list order table
- plan row 157 (B-LEGACY-LIVE-EXIT-PATH) is open for CC-A and is on no line of the task-list order table
- plan row 169 (B-KILLSWITCH-DENOMINATOR) is open for CC-A and is on no line of the task-list order table
- plan row 170 (B-TOTAL-DRAWDOWN-WARNING) is open for CC-A and is on no line of the task-list order table
- plan row 179 (B-LIVE-PROCESS-SPLIT) is open for CC-A and is on no line of the task-list order table
- plan row 179b (B-DRIFT-HOLD-AWARE) is open for CC-A and is on no line of the task-list order table
- plan row 185 (P19-B6.10) is open for CC-A and is on no line of the task-list order table
- plan row 191 (B-VENUE-RESTING-EXITS) is open for CC-A and is on no line of the task-list order table


## Push-back: Position A (repair batch directly after row 141a, before row 142)

Ranking used: open trades, faulty closes, calibration data, KD-2 data truth first, then everything else.
- Open trades: nothing pushed back. Rows 167-171 (kill-switch/drawdown) sit after it and are live-mode, not open-trade fixes.
- Faulty closes: row 72 B-CLOSE-WRITER-COSTS (queued, ahead of 141a) is not pushed back.
- Calibration data: rows 142-148b (Phase 25 calibration block) each slip by one batch. Row 141a itself and rows 105/126-128 are not pushed back. Capture is already held by KD-30 until the audit names the consumer, so no extra loss beyond what KD-30 already accepts; the repair lands dark (writer + replay) so switch-on follows the audit.
- KD-2 data truth: nothing pushed back (stage 00 is ahead).
- Everything else: rows 149-198 (SQE, TFS, live-mode block 179-198) slip by one batch.
- Retention note: each day the capture stays broken loses paper calibration data (90-day retention); A is the earliest slot consistent with KD-30.

## Push-back: Position B (repair batch near row 105, ahead of the calibration block)

- Open trades / faulty closes: rows 126-128 (#914 cost study, 25-18, #645) and 72 are pushed back if B sits ahead of them; #914 has KD-18 ordering conditions.
- Calibration data: the whole calibration block (141a audit, 142-148b) slips by one batch, including the audit itself that KD-30 says must precede capture. B conflicts with KD-30 (capture waits behind the audit) unless it lands fully dark; the writer then risks being built against an unaudited score.
- KD-2 data truth: row 105 (KD-14 collection) is adjacent; B must not displace it (KD-14, KD-27 ordering).
- Everything else slips by one batch.
- Retention: gains the most days of recovered paper calibration data (90-day retention), but only worth it if switch-on is still gated on the audit.

## Push-back: Position C (archival-health half 2, small item right after B-DISK-FILE-TIERING closes)

- Open trades / faulty closes / calibration: pushes back item 5 (25-9 collection, row 105, KD-14), item 7 (101m mechanics, KD-22), item 8 B-CLOSE-WRITER-COSTS (KD-17, KD-24, KD-27) and rows 18-19 (KD-26) by one small item each.
- KD-2 data truth: B-DB-POOL-GUARD (order 3) and the disk-tiering batch itself are ahead and unaffected; it is a check against the root-crontab snapshot, small, and protects the archive that stage 00 produces.
- Everything else: crew-tooling (KD-15) stays after live.
- No paper calibration data is lost by this slot.
