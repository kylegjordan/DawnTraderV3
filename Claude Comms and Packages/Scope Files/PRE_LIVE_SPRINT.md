# THE SPRINT TO LIVE — the re-sorted list (Kyle's go-live rules, 2026-09-28)

**Kyle's rule:** everything needed to get paper to the point where the mechanics are sound and working as intended, the thresholds / gates / regimes / strategies / scores are tuned, the prices are right, paper tells the truth, we capture the data we mean to learn from, and paper trades profitably and consistently — plus the live-mode fixes, mixed into the same push. **Everything else goes after live.** No phase names: one list, prioritised next.

**In the sprint: 198** · **After live: 217** · **Running now (observation windows): 7** · **Parked by Kyle: 7** · awaiting owner confirmation: see the draft's UNCONFIRMED section.

> ⚠️ **Category is not schedule (Langston S1):** the counts below say WHY an item is in the sprint; WHEN it runs is THE WORKING ORDER further down. Plan from the order, not from these counts.

| category | items |
|---|---:|
| 1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close) | 56 |
| 2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores | 32 |
| 3. Prices — the feed is correct and paper uses the right price for each job | 19 |
| 4. Paper tells the truth — no mistake that makes results look better or worse than they are | 13 |
| 5. Learning data — capturing what we intend to learn from | 27 |
| 6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment | 48 |
| 7. The evidence — trading profitably and consistently in paper | 3 |

> ⛔ **HAND-MAINTAINED SINCE 2026-09-29 — EDIT THIS FILE DIRECTLY; DO NOT RE-RUN `scripts/inventory/`** (Langston ruling 2026-09-29). It was first BUILT from `PRE_LIVE_INVENTORY_DRAFT.md` (Langston-approved r8) by `scripts/inventory/sort.py`, with the working order from `order.py` and Kyle's decisions in `kyle_decisions.json`; those scripts are now history. Re-running `sort.py` would overwrite this file and silently drop every edit made by hand since (three sessions' edits so far). The working plan is `1-system-manual/SPRINT_TO_LIVE_PLAN.md`, also hand-maintained. ⚠️ A green `order.py` coverage run grades the frozen `push_keys.json`, not this list, so it is not evidence the plan is complete. Making the scripts refuse to write is sprint row 1c `B-INVENTORY-SCRIPT-ROOT-REDIRECT` (CC-A, `#1119`): every script there takes its repo root from the environment and fails closed when unset. Row 1 `B-PLAN-CURRENCY-CHECK` deletes `plan_doc.py`, `sort.py`, `order.py` and `push_keys.json` and does not discharge it (Langston, 2026-09-30).

## THE WORKING ORDER

Two tracks run side by side and meet at go-live. **Track A** is the trading system: foundations first (the things that corrupt everything downstream), then the mechanics stage by stage with the learning-data work alongside, then tuning on the clean data, then the evidence. **Track B** is live-mode readiness: safety work that can start now, risk controls and restart safety, the live engine (after your production-environment decision), and go-live preparation. **Wave 0** is this week. Within a wave the numbers are the working order; 'after X' means it waits for X.

### Wave 0 — NOW — urgent, cheap, or already in flight. GATE: staging is held at bc199185e for the 8a-P4c window (to 2026-09-30 00:00Z); the held deploy is not before 2026-10-02 20:10Z (GOVERNANCE_EXCEPTIONS.md, the 2026-09-29T15:10Z deploy-hold row) - the deploy-drift alerts clear on that deploy

1. **Keep the sprint-to-live plan current: the checker requires a batch close to touch its own plan line, plus a weekly census alert; CLAUDE.md points at the plan** (CC-A) · *live readiness* — keeps this plan current: checker close-diff rule + weekly census alert, then the CLAUDE.md pointer swap (Langston ruling, OLD Claude)
2. **B-XSTOCK-BID-TRIGGER-RELAND** (CC-C) · *mechanics* — midpoint off (Kyle 2026-09-28: finished and deployed BEFORE the sprint starts): paper xStock stop/target triggers back on the bid
3. **B-VTS-MARK-SIDE** (CC-C) · *learning data* — midpoint off, before the sprint: the VTS xStock prices on the right side (8a-P4c increments 2-3)
4. **B-VTS-NO-DECISION-VALVE** (CC-C + Langston) · *learning data* — midpoint off, before the sprint: a VTS trade with no usable sell price no longer books its timeout at the midpoint
5. **12.1 rulings-durability fix** (CC-A) · *live readiness* — cheap and irreversible if lost: copy Langston's rulings file to a read-only replica
6. **Months of database headroom** (?) · *live readiness* — database at 81% (critical): confirm the October 1 move of August to warm storage lands; then (Kyle 2026-09-28) move one month of one-minute price bars as the proof and flip their hot window 365 -> 30 days (~19 GB out); then measure months of headroom
7. **Install the context_bridge_log 14-day TTL job** (Infra Claude) · *live readiness* — this week: make the retention demonstrably free bytes on a named table - install the missing 14-day job (1.48 GB); #688 (four monthly-partitioned tables) rides the disk item
8. **Define 'comfortable in paper' in numbers** (CC-C + Langston) · *evidence* — set the numbers for 'comfortable in paper' BEFORE the evidence comes in
9. **B-SIZING-DEC-RESTORE** (CC-C) · *mechanics* — wave 0 - KYLE 2026-09-29 (supersedes option c): one shared pot; paper reset to a $3,000 balance - only the paper dashboard starts from zero, nothing deleted, open positions closed and labelled as closed by the reset; sized by the max-position % guardrail, MONITORED and ADJUSTED so each trade stays near $140-150 (5% to start), about 20 open at 100% exposure; RETIRE the open-slots guardrail (rule 18); the obj-1 size formula correction (#698 am.1) comes first
10. **#628** (CC-C) · *mechanics* — with B-SIZING-DEC-RESTORE: its two sizing sites
11. **#521** (CC-B) · *live readiness* — wave 0 (Langston F11): nothing notices a dead engine - a silent halt voids every observation window
12. **Fix duplicated plan ids** (CC-A) · *mechanics* — a chore, not mechanics (Langston): no two plan items share a number
13. **B-OHLC-FRAME-GUARD** (CC-C) · *prices* — in flight: only the on-screen check is left
14. **B-REST-SIDES-TO-CACHE** (CC-C) · *prices* — built and reviewed: ships in the ONE held deploy, not before 2026-10-02 20:10Z
15. **B-BOOK-STATE-RESTART-DURABLE** (CC-C) · *mechanics* — built and reviewed: same held deploy
16. **F-G-1 reopens: the OHLC writer can write an older bar over a newer one** (CC-C) · *prices* — the OHLC writer can put an older bar over a newer one — it feeds the bars signals are built from
17. **B-PRICE-SIDE-BY-JOB** (CC-C) · *prices* — in flight: its xStock increments follow the 09-30 window

### Wave A1 — TRACK A · Foundations — the things that corrupt everything downstream

18. **B-UNIVERSE-REFRESH-ACTS** (CC-C) · *mechanics* — first link of the identity chain
19. **B-SYMBOL-CLASS-IDENTITY** (CC-C) · *mechanics* — after B-UNIVERSE-REFRESH-ACTS: a ticker shared by a coin and a stock becomes two instruments
20. **B-RTB-SIGNAL-IDENTITY** (CC-B) · *mechanics* — after B-SYMBOL-CLASS-IDENTITY
21. **B-VTS-CLASS-LABEL-INTEGRITY** (CC-B) · *learning data* — after B-SYMBOL-CLASS-IDENTITY: correct the mislabelled VTS rows
22. **B-CLOSED-TRADES-CLASS-BACKFILL** (CC-B) · *learning data* — after B-SYMBOL-CLASS-IDENTITY
23. **#150** () · *mechanics* — after B-SYMBOL-CLASS-IDENTITY: the RTB asset-class column made NOT NULL after a zero-null soak
24. **Exclude plain-currency and non-dollar pairs** (Kyle) · *mechanics* — Kyle's decision: exclude plain currency pairs and non-dollar crypto now
25. **B-NONFIAT-QUOTE-DENOMINATION** (CC-C) · *mechanics* — the exclusion itself, if small
26. **B-QUOTE-ADMISSION-LEGACY-SWEEP** (Kyle) · *mechanics* — with the exclusion: what the old allowed-pairs list is for
27. **B-QUOTE-LEG-INTEGRITY** (CC-C) · *mechanics* — with the exclusion
28. **B-PRICE-FLOOR-REVIEW** (CC-C) · *tuning* — replace the $0.25 floor with a real market-depth test
29. **B-VENUE-PAIRS-REINIT** (CC-C) · *mechanics* — a changed exchange price step must not refuse orders
30. **B-SCAN-BREADTH-DECLINE** (CC-C) · *mechanics* — why the scanner sees so few pairs — breadth feeds selection
31. **B-XSTOCK-LIVE-FEED** (CC-C) · *prices* — the xStock feed became our trading feed without a decision — decide and fix
32. **row:6** () · *prices* — a bound on how old a price may be when used
33. **B-PRICE-STALENESS-BOUND** (CC-C) · *prices* — the last-known-good price is re-served with no age bound
34. **B-EQUITY-RECONNECT-STALL-TIMER** (CC-C) · *prices* — a stalled xStock reconnect leaves positions unwatched
35. **B-WS-SUBSCRIBE-CLASS-FILTER** (CC-A) · *prices* — the crypto subscribe set is not class-filtered
36. **#506** (CC-B) · *prices* — book subscriptions never unsubscribe
37. **B-BOOK-SUBSCRIPTION-REACH** (CC-C) · *prices* — after #506: subscribe the order book for the whole pool, not ~3 coins
38. **B-CRYPTO-MARK-AGE-GATE** (CC-C) · *prices* — crypto mark age
39. **#977** (CC-C) · *prices* — the shared price-cache refresh lane for open positions runs but nothing subscribes - staleness hits selection (CC-C)
40. **B-XSTOCK-SESSION-FRESHNESS** (CC-C) · *prices* — xStock entry-age limit vs the exit standard Kyle ruled
41. **B-XSTOCK-ENTRY-COMPARATOR** (CC-C) · *prices* — xStock entry-price cross-check
42. **B-DECIDED-INTENT-INDEX** (CC-C) · *prices* — xStock's three definitions of 'the price' from one frame
43. **B-POST-GRID-MUTATION-CENSUS** (Kyle) · *prices* — what changes a stop after it is rounded
44. **row:7** () · *prices* — the VTS reads prices through the shared accessor
45. **#1033** (CC-C) · *mechanics* — an absent volume is stored as zero and the liquidity filter reads it
46. **#972** (CC-B) · *mechanics* — xStock ATR reads empty around the open and close
47. **#566** (CC-B) · *mechanics* — volatility measured with a lag
48. **Independent review of the pricing architecture (Codex)** (CC-C) · *prices* — after the price items: an independent review of the whole price layer

### Wave A2 — TRACK A · Mechanics, stage by stage — can start as A1's pieces land

49. **#233** () · *mechanics* — signals: drift and volume inputs fed as fixed defaults
50. **#199** () · *mechanics* — strategies: xStock volume confirmation removed for lack of an honest feed
51. **row:3m-ENUM** (CC-C) · *mechanics* — strategies: volatility_edge's pattern path is silently dead
52. **B-SILENT-STRATEGY-CENSUS** (CC-B) · *mechanics* — strategies: three wired strategies never evaluated
53. **B-TARGET-FABRICATION** (CC-C) · *mechanics* — signals: default targets the strategy never chose
54. **#574** (CC-A) · *mechanics* — SQE: a made-up volatility input in the ranker
55. **B-RTB-REFRESH-CONSOLIDATE** (CC-A) · *mechanics* — RTB: the net-EV backstop removed on thin evidence
56. **#570** (CC-C) · *mechanics* — RTB: one refresh bucket fires but does not refresh
57. **#699** (CC-C) · *mechanics* — RTB: does promotion evict, or is the screen stale
58. **19.2 Audit & Debug — - Verify FinalScore, Hybrid Score, Confidenc** () · *tuning* — SQE: verify every score calculates correctly
59. **B-ENTRY-LEVEL-RECHECK** (CC-B) · *mechanics* — open: re-check a signal's levels against the current price before the fill
60. **B-INTENT-ENTRY-PARITY** (CC-C) · *mechanics* — open: a test route sizes from the request body; a legacy close route books a random haircut (the intent path and the fallback sizer were deleted 2026-09-30)
61. **B-GRID-LIVE-PATH-PARITY** (CC-C) · *mechanics* — open: grid rounding on the live order path
62. **A resting order's deadline must run whether or not a price is usable** (CC-C) · *mechanics* — open: a resting order's deadline runs even when no price is usable
63. **#630** (CC-A) · *mechanics* — open: exercise the maker-order deadline once
64. **B-EXIT-TRIGGER-FILL-PARITY** (CC-C) · *mechanics* — close: exits fire on the price they would fill at
65. **B-EXIT-TICKER-LEG-ADAPTER-SIDES** (CC-C) · *mechanics* — close: the exit path sees both price sides
66. **B-BOOK-STATE-RING-INDEPENDENT-BOUND** (CC-C) · *mechanics* — close: xStock exit plausibility bound
67. **#204** () · *mechanics* — close: xStock stop prices at the wrong scale
68. **row:3h.b** (CC-C) · *mechanics* — close: remove the second exit implementation
69. **B-EXIT-LATCH-INVESTIGATION** (CC-A) · *mechanics* — close: is the hold-past-target a label or a real exit defect
70. **Map EXIT_PATH_MACHINERY_AUDIT §10 items to their homes** (CC-C) · *mechanics* — close: map the exit audit's items to homes
71. **#166** () · *mechanics* — close: the TEC stale-cache fence keeps firing
72. **B-CLOSE-WRITER-COSTS** (CC-B) · *mechanics* — close: no close without a trade record, no invented zero fees
73. **B-SCHEDULER-FIRST-TICK** (CC-A) · *mechanics* — restarts: every scheduled job runs twice after a restart
74. **#585** (CC-B) · *mechanics* — restarts: auto-resume skips a malformed session
75. **B-STRING-TRUTHINESS-GUARDS** (CC-C) · *mechanics* — hygiene: guards that treat '0' as true
76. **B-GUARD-COVERAGE-AUDIT** (CC-C) · *mechanics* — hygiene: which guards cover which paths
77. **B-LEARNING-SYSTEM-CENSUS** (Kyle) · *mechanics* — hygiene: old learning systems still wired
78. **Dead-code reachability census** (?) · *mechanics* — hygiene (Langston C6): rules on ALL 22 legacy items - the 5 removals below AND the 17 in the after-live 'Legacy and dead-code cleanup' group; any it finds reachable from a trade joins the sprint by the section-2 intake test, the rest stay after live
79. **B-TRADING-ENGINE-REMOVAL** (CC-A) · *mechanics* — legacy removal, after the census confirms it dead: the older second trading engine (Kyle 2026-09-28)
80. **B-SQE-DEADCODE-PURGE** (CC-A) · *mechanics* — legacy removal, after the census: a dead SQE copy that checks fewer gates
81. **16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directiv** () · *mechanics* — legacy removal, after the census: the old trailing-percent exit code, so it cannot re-enter a live exit
82. **#589** (CC-A) · *mechanics* — legacy removal, after the census: the unused calibrated-profit calculator
83. **B-WS-V1-RESIDUE-SWEEP** (CC-C) · *mechanics* — legacy removal, after the census: the dead first-generation Kraken price handler
84. **#218** () · *mechanics* — legacy removal, after the census: a dead function carrying a hardcoded fee default
85. **B-MODE-PREDICATE-SWEEP** (CC-C) · *mechanics* — hygiene: readers that would mix live and paper P&L
86. **row:8** () · *paper truth* — paper truth: fill-integrity detector
87. **B-COST-MATH-CONSOLIDATION** (CC-C) · *paper truth* — paper truth: one home for cost maths
88. **#527** (CC-B) · *paper truth* — paper truth: xStock friction components
89. **B-IMPLEMENTATION-SHORTFALL** (CC-C) · *paper truth* — paper truth: separate stale-signal cost from execution cost
90. **B-GRID-REFUSAL-RATE** (CC-C) · *paper truth* — paper truth: how often the grid refuses
91. **B-VALIDATE-OBSERVABILITY** (CC-C) · *paper truth* — paper truth: make validation failures visible
92. **B-DIAG-READ-INTEGRITY** (CC-C) · *paper truth* — paper truth: diagnostics that read a status code as data
93. **B-FILTER-DIAG-XSTOCK** (CC-B) · *paper truth* — paper truth: the empty xStock decline table
94. **#664** (CC-B) · *paper truth* — paper truth: a hardcoded 'strategies evaluated'
95. **#419** (CC-B) · *paper truth* — paper truth: funnel counts under errors
96. **#549** (CC-B) · *paper truth* — paper truth: Open Trades field gaps
97. **#561** (Kyle) · *paper truth* — paper truth: volume / order book columns in Open Trades
98. **#547** (CC-B) · *paper truth* — paper truth: the Analyst's July findings (owner reads)
99. **B-EPOCH-PARITY-FENCE** (CC-C) · *learning data* — moved ahead of row:9 (Langston 2026-09-28): one home for the calibration epoch AND stamp the resolved epoch onto each trade row at write time (closed_trades.calibration_state is a dead column today) - so a per-cell restart becomes a checkable row filter, dated by DEPLOY (epoch rule 7)
100. **row:9** () · *learning data* — THE LEARNING-RECORD RESTART (Kyle 2026-09-28, Langston AGREE WITH CHANGES): moved from the end of A3 to after the LAST fix that changes what a closed trade looks like - the test, applied once per row by its owner: does it change entry_price, exit_price, quantity, the cost/fee terms or the class/strategy label on a closed trade? The prerequisites, by key (S2-enforced): after B-XSTOCK-BID-TRIGGER-RELAND, after B-VTS-MARK-SIDE, after B-VTS-NO-DECISION-VALVE, after B-SIZING-DEC-RESTORE, after #628, after B-REST-SIDES-TO-CACHE, after B-BOOK-STATE-RESTART-DURABLE, after F-G-1-REOPEN, after B-PRICE-SIDE-BY-JOB, after B-SYMBOL-CLASS-IDENTITY, after B-RTB-SIGNAL-IDENTITY, after B-XSTOCK-LIVE-FEED, after row:6, after B-PRICE-STALENESS-BOUND, after B-CRYPTO-MARK-AGE-GATE, after #977, after B-XSTOCK-SESSION-FRESHNESS, after B-XSTOCK-ENTRY-COMPARATOR, after B-DECIDED-INTENT-INDEX, after B-POST-GRID-MUTATION-CENSUS, after row:7, after #972, after #566, after B-TARGET-FABRICATION, after B-ENTRY-LEVEL-RECHECK, after B-INTENT-ENTRY-PARITY, after B-GRID-LIVE-PATH-PARITY, after RESTING-ORDER-DEADLINE, after B-EXIT-TRIGGER-FILL-PARITY, after B-EXIT-TICKER-LEG-ADAPTER-SIDES, after B-BOOK-STATE-RING-INDEPENDENT-BOUND, after #204, after row:3h.b, after #166, after B-CLOSE-WRITER-COSTS, after B-COST-MATH-CONSOLIDATION, after #527. Not prerequisites: B-VTS-CLASS-LABEL-INTEGRITY and B-CLOSED-TRADES-CLASS-BACKFILL (they repair history in place). It must STATE which populations it restarts (active paper, VTS, the rejected arm). after B-EPOCH-PARITY-FENCE. AFTER THE RESTART, three cases, named: (1) a fix that changes no trade outcome restarts nothing; (2) one that changes one strategy or one class restarts only that cell, dated by deploy, read through the stamped epoch; (3) one that changes outcomes across ALL cells is a global restart
101. **#522** (Kyle) · *mechanics* — LAST in A2: the full runtime pipeline audit, both classes, end to end
102. **#235** (Kyle) · *mechanics* — with #522: the crypto pipeline validated end to end

### Wave A3 — TRACK A · Learning data — alongside A2; must finish before tuning reads the data

103. **B-OUTCOME-CORPUS-CAPTURE** (?) · *learning data* — what each VTS trade earned, recorded durably, with a measured/defaulted flag on its inputs. NOT a deletion clock: the 90-day delete was fixed 2026-07-30/08-06 (365 days, archive before delete); nothing is due for deletion before 2027-05
104. **B-EXCURSION-RECORD** (CC-B) · *tuning* — early (Langston F5): capture costs calendar time - record how far trades travel; rm:25-17b is blocked on it by ruling
105. **25-9 xStock pair_correlation per-pair WR data accumulation (B68.3** () · *learning data* — early (Langston F5): xStock per-pair correlation data accumulates from here
106. **B-PAPER-LANE-PROVENANCE** (CC-B) · *learning data* — paper records its decision inputs
107. **T-W20C-SCALAR-LEG** (CC-B) · *learning data* — after B-PAPER-LANE-PROVENANCE: capture integrity - the parity harness proves recorded history replays to the same decisions
108. **#515** (CC-B) · *learning data* — remaining learning columns on the active path
109. **#631** (CC-A) · *learning data* — entry-mode fields on the active archive
110. **#504** (CC-A) · *learning data* — regime on maker/taker shadow rows
111. **#513** (CC-B) · *learning data* — the VTS books maker target exits the way the paper lane would
112. **B-DECISION-INSTANT-QUOTE** (CC-C) · *learning data* — the exact quote at decision time
113. **B-EXIT-DECISION-RUNG-STAMP** (CC-C) · *learning data* — which price rung an exit used
114. **B-TRADE-RECORD-JOINABILITY** (CC-B) · *learning data* — trade records join across stores
115. **B-VPNL-WRITER-BOUND** (CC-B) · *learning data* — an unbounded learning column
116. **#658** (CC-C) · *learning data* — VTS posture multipliers contaminating learning rows
117. **#220** () · *learning data* — an error thrown 64,494 times in VTS strategy runs
118. **#1072** (CC-C) · *learning data* — the price-history recorder's frozen symbol set
119. **B-ARCHIVE-WRITER-LIFECYCLE** (CC-C) · *learning data* — the archive writer's lifecycle
120. **B-ARCHIVE-FLUSH-DRAIN-ORDER** (CC-B) · *learning data* — B-ARCHIVE-FLUSH-DRAIN-ORDER: the writer drains its buffer before it holds a slot, so a slot timeout throws the rows away (670 on 2026-09-28) - in the sprint because it loses learning data
121. **B-ROLLBACK-EPOCH-FORWARD** (CC-B) · *learning data* — epochs across a rollback
122. **#590** (CC-A) · *learning data* — calibration store reset at the formula change
123. **B-PROVENANCE-LOSS-CENSUS** (CC-C) · *learning data* — where decision provenance is lost
124. **#231** () · *learning data* — ablation record id gap

### Wave A4 — TRACK A · Tuning — reads the clean data; costs -> geometry -> strategies -> regimes -> scores -> gates -> ranking

125. **Accumulation gate between the clean learning-record restart and tuning** (CC-B) · *evidence* — FIRST in A4 (Langston F4, conditions 2-3, clock ruling 2026-09-28): closes per cell only when the floor is MET or the cell is PUBLISHED UNDERPOWERED - naming a floor never closes it. Counts from row:9. POPULATIONS, named per item: ACTIVE = closed_trades paper (12.1/day all-time, 8.3 last 30 days, 7.4 last 7 on 2026-09-28 - use the current rate); VTS = vts_open_trades closed (~1,060/day); REJECTED = the VTS-tagged refused signals simulated to close. THE DISTRIBUTION BINDS, NOT THE START DATE: at a floor of 30 on the active lane, 8 of 38 strategy x class cells get there inside 90 days and 30 do not at any start date (21 have never traded) - Step 1 must state what happens to a permanently underpowered cell; #644 (exploration subsidy) is one of the answers and its position is re-argued there. FIELDS: an item that needs a field captured in A3 counts only rows carrying it - it prints n_total and n_with_field and closes on n_with_field; rows missing the field are excluded, never defaulted (#546)
126. **#914** (CC-C) · *tuning* — costs: the per-leg cost term - after ACCUMULATION-GATE; cell = per class x fee side; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
127. **25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe** () · *tuning* — costs: the per-class safety margin - after ACCUMULATION-GATE; cell = per class (2 cells); population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
128. **#645** (CC-C) · *tuning* — costs: a crypto-era net-EV floor applied to xStocks - after ACCUMULATION-GATE; cell = per class (2 cells); population = ACTIVE; a cell below the floor is published UNDERPOWERED, never fitted
129. **25-17 TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, B** () · *tuning* — after B-EXCURSION-RECORD: target geometry for all strategies - after ACCUMULATION-GATE; cell = strategy x class; population = VTS (excursion record); a cell below the floor is published UNDERPOWERED, never fitted
130. **25-17b CRYPTO reach_atr_max DECISION — the reachability-ceiling que** () · *tuning* — geometry: crypto reach ceilings - after ACCUMULATION-GATE; cell = strategy x class, crypto; population = VTS (excursion record); a cell below the floor is published UNDERPOWERED, never fitted
131. **25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALI** () · *tuning* — geometry: per-strategy minimum reward-to-risk - after ACCUMULATION-GATE; cell = strategy x class; population = ACTIVE + REJECTED; a cell below the floor is published UNDERPOWERED, never fitted
132. **B-TARGET-MULTIPLE-VS-HORIZON** (CC-B) · *tuning* — geometry: move targets that sit too far - after ACCUMULATION-GATE; cell = strategy x class; population = VTS (excursion record); a cell below the floor is published UNDERPOWERED, never fitted
133. **25-26 Trade HOLD-TIME / timeframe study — do slower (multi-day) tr** () · *tuning* — geometry: do slower trades clear the fee wall - after ACCUMULATION-GATE; cell = hold-time bucket x class; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
134. **B-EXIT-MAKER-VS-TAKER-REVIEW** (CC-B) · *tuning* — geometry: maker exits profitable, taker target exits negative - after ACCUMULATION-GATE; cell = exit reason x fee side x class; population = ACTIVE; a cell below the floor is published UNDERPOWERED, never fitted
135. **#221** (Kyle) · *tuning* — ranking first (Langston F6): rank the queue, then ask who is missing from it. NO gate clause, reason: a ranking-rule change, code-only, reads no accumulated per-cell data - if its Step 1 finds it fits weights on data, it takes the gate clause then
136. **#149** () · *tuning* — with #221: per-class RTB refresh cadence calibration - after ACCUMULATION-GATE; cell = per class (2 cells); population = ACTIVE; a cell below the floor is published UNDERPOWERED, never fitted
137. **B-FAMILY-POOL-REACHABILITY** (CC-C) · *tuning* — before #648/#201/#529: can each strategy family reach the pool at all - after ACCUMULATION-GATE; an ABSENCE diagnosis: publish UNREACHABLE (zero signals emitted in the signal-evaluation archive), NEVER-SELECTED (signals emitted, zero RTB promotions) or UNDERPOWERED (both non-zero, n below the floor) - never one verdict for all three
138. **B-IDEAL-POOL-STARVATION** (CC-A) · *tuning* — before #648/#201/#529: is the ideal pool starved (~4-5% of slots against a nominal 70%) - after ACCUMULATION-GATE; an ABSENCE diagnosis: publish UNREACHABLE (zero signals emitted in the signal-evaluation archive), NEVER-SELECTED (signals emitted, zero RTB promotions) or UNDERPOWERED (both non-zero, n below the floor) - never one verdict for all three
139. **#648** (CC-A) · *tuning* — strategies: six never traded - after ACCUMULATION-GATE; an ABSENCE diagnosis: publish UNREACHABLE (zero signals emitted in the signal-evaluation archive), NEVER-SELECTED (signals emitted, zero RTB promotions) or UNDERPOWERED (both non-zero, n below the floor) - never one verdict for all three
140. **#201** () · *tuning* — strategies: range_trade starved - after ACCUMULATION-GATE; an ABSENCE diagnosis: publish UNREACHABLE (zero signals emitted in the signal-evaluation archive), NEVER-SELECTED (signals emitted, zero RTB promotions) or UNDERPOWERED (both non-zero, n below the floor) - never one verdict for all three
141. **#529** (Kyle) · *tuning* — strategies: the strategy-weighting chain - after ACCUMULATION-GATE; cell = strategy x class; population = ACTIVE; a cell below the floor is published UNDERPOWERED, never fitted
142. **25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: entry-trigger sweep - after ACCUMULATION-GATE; cell = xStock strategy (19 cells; 2 above 30 on 2026-09-28); population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
143. **25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: geometry reconstruction - after ACCUMULATION-GATE; cell = xStock strategy; population = VTS (excursion record); a cell below the floor is published UNDERPOWERED, never fitted
144. **25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: per-strategy entry re-fit - after ACCUMULATION-GATE; cell = xStock strategy; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
145. **25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW** () · *tuning* — regimes: confidence-chain calibration - after ACCUMULATION-GATE; cell = regime x class (5 x 2); population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
146. **25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice** () · *tuning* — regimes: crypto confidence modifiers - after ACCUMULATION-GATE; cell = regime, crypto; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
147. **25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier** () · *tuning* — regimes: xStock macro modifiers - after ACCUMULATION-GATE; cell = regime, xStock; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
148. **B-RETIRED-SCORE-REMOVAL** () · *tuning* — scores: retire the retired scores. NO gate clause, reason: a code-only removal, reads no accumulated data
149. **#588** (CC-A) · *tuning* — scores: a validated quality term in the ranking - after ACCUMULATION-GATE; cell = strategy x class; population = ACTIVE; a cell below the floor is published UNDERPOWERED, never fitted
150. **25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh** () · *tuning* — scores: SQE recalibration - after ACCUMULATION-GATE; cell = strategy x class; population = ACTIVE + REJECTED; a cell below the floor is published UNDERPOWERED, never fitted
151. **25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib** () · *tuning* — gates: the sustainability gate - after ACCUMULATION-GATE; cell = one regime x class; population = ACTIVE + VTS; a cell below the floor is published UNDERPOWERED, never fitted
152. **25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar** () · *tuning* — gates: does the Net Expectancy gate reject winners - after ACCUMULATION-GATE; cell = gate verdict x class; population = REJECTED (name the instrument first; its title still says DATA-BLOCKED); a cell below the floor is published UNDERPOWERED, never fitted
153. **25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0** () · *tuning* — gates: the Net Expectancy gate's measured judgement - after ACCUMULATION-GATE; cell = gate verdict x class; population = REJECTED + ACTIVE (name the instrument first); a cell below the floor is published UNDERPOWERED, never fitted
154. **#644** (CC-C) · *tuning* — gates: the exploration-subsidy decision. NO gate clause, reason: a decision, not a per-cell fit - and it is one of the answers for a permanently underpowered cell, so ACCUMULATION-GATE's Step 1 re-argues its position

### Wave A5 — TRACK A · The evidence — runs continuously; judged at the end

155. **25-16 Trade-size / concurrency / win-rate dynamic + starting-balan** () · *live readiness* — during A5 (Langston F8): the trade-size / concurrency study reads the sizing-correct paper run; only DAY-ONE-NUMBERS (the decision) waits in B4
156. **19-11 §19.1 Paper Trading Run The act of actually running paper-ac** () · *evidence* — the paper run judged against Kyle's standard

### Wave B1 — TRACK B · Safety now — can start immediately, in parallel with Track A

157. **B-LEGACY-LIVE-EXIT-PATH** (CC-C) · *live readiness* — B1 (Langston F10): the legacy live exit route is a re-entry risk today, whatever the environment
158. **B-SEC-HARDEN** (CC-A) · *live readiness* — route authorisation (the password rotation moved to B-CREDENTIALS-PRIVATE-REPO, run before the sprint)
159. **B-SSH-KEY-CENSUS (investigation)** (?) · *live readiness* — whose are the two unknown keys
160. **#615** (CC-A) · *live readiness* — the reviewer identity must not read the secrets file
161. **Coltrane parity: a privacy check like Langston's** (Infra Claude) · *live readiness* — before the Coltrane trial: a privacy check like Langston's
162. **#681** (CC-B) · *live readiness* — a deploy must not outrun CI
163. **#168** () · *live readiness* — with #681: CI catches a build that crashes on boot
164. **P19-B12** (CC-B) · *live readiness* — the deploy tool's own executable comes from the reviewed code

### Wave B2 — TRACK B · Risk controls and restart safety — fixed in paper, carried to live

165. **B-VENUE-QUIET-ALERTING** (Kyle) · *live readiness* — operator alert: a venue has gone quiet (Kyle 2026-09-28: operator alerting joins the sprint)
166. **#692** (CC-C) · *live readiness* — operator alert: no new trade has opened for a set time because the allowance is full, with manual close / prompt-exit options
167. **#634** (CC-B) · *live readiness* — the kill switch must not fail open
168. **#632** (CC-C) · *live readiness* — the daily-loss count survives a restart
169. **B-KILLSWITCH-DENOMINATOR** (CC-C) · *live readiness* — the kill switch's remaining legs
170. **B-TOTAL-DRAWDOWN-WARNING** (CC-C) · *live readiness* — a mark-to-market drawdown warning
171. **#519** (CC-B) · *live readiness* — the daily-loss trip fails loud
172. **B-TEC-PRIME-BOOT-RACE** (CC-B) · *live readiness* — restarts: the exit loop throws for a tick on open positions
173. **B-ENGINE-STOP-DURATION-COLUMN** (CC-B) · *live readiness* — an engine stop reports failure when it worked
174. **#619** (CC-A) · *live readiness* — a restore from backup lacks seeded config
175. **B-DASHBOARD-AUTH-RACE** (CC-C) · *live readiness* — the portfolio card never recovers from a 401
176. **#296** (Kyle) · *live readiness* — one rate-limited path for placing and cancelling orders

### Wave B3 — TRACK B · The live engine — environment decided 2026-09-28: live as its own program on the same server

177. **#517** (CC-B) · *live readiness* — FIRST in B3 (OLD Claude condition 1): the live trade tables - open positions carry NO mode marker today (storage.ts:4519), so this lands BEFORE the program split
178. **Resize the staging server one step up before live** (Infra Claude) · *live readiness* — before the split (Infra condition): one server size up, a second program needs the memory
179. **Live mode runs as its own program on the same server** (CC-A) · *live readiness* — after #517 and B-SCHEDULER-FIRST-TICK: live as its own program on the same server - startup made mode-aware (index.ts starts every job unconditionally), Kraken's request budget shared across both programs on one address, archivers and scans run in exactly one program; shapes how rm:21.1 builds live
180. **21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi** (CC-C) · *live readiness* — the engine-start health gate refuses live
181. **21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B-** () · *live readiness* — reset functions must not delete both modes' data
182. **19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr** () · *live readiness* — throwing asset-class lookups on the live path
183. **21.1 Live Mode Engine — - Create Live Mode trading engine based o** () · *live readiness* — build live on the paper engine (Option A)
184. **#322** (Kyle) · *live readiness* — test-in-paper / bypass-in-live switches
185. **P19-B6.10 retire the old per-mode guardrails table** (?) · *live readiness* — one source of guardrail values
186. **21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the "** () · *live readiness* — after P19-B6.10: the Live Guardrails tab
187. **21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 —** () · *live readiness* — the live guardrails umbrella
188. **19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci** () · *live readiness* — entry-side failure modes (halts, splits, earnings)
189. **25-11a refuse a position larger than the visible book** (?) · *live readiness* — refuse a position larger than the visible book
190. **Protect live positions if our server dies** (Kyle) · *live readiness* — decide how live positions are protected if the server dies
191. **B-VENUE-RESTING-EXITS** (Kyle) · *live readiness* — after PROCESS-DEATH-FORM: build that protection
192. **B-KRAKEN-FEE-WATCH** (CC-B) · *live readiness* — notice when the exchange changes fees

### Wave B4 — TRACK B · Go-live preparation — last

193. **Provision the live Kraken API key** (Kyle) · *live readiness* — the live key: trade-only, no withdrawals, locked to the server
194. **Confirm the live fee schedule** (?) · *live readiness* — after KRAKEN-LIVE-KEY: confirm live fees
195. **Day-one live money settings** (Kyle) · *live readiness* — after rm:25-16 (run during A5): Kyle sets the live money settings
196. **21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calib** (CC-C + Langston) · *live readiness* — the feed-reliability threshold (Analyst + Langston)
197. **21.2 Paper-to-Live Transition Testing — - Run parallel paper+live** () · *live readiness* — paper-to-live testing at small size
198. **19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M** () · *live readiness* — LAST: the go-live switch

## Running now — observation windows (7)

- **F-G-1** (Kyle) — venue price grid — deployed 2026-08-28, observation window open
- **B-FEED-MISMATCH-FIX** (CC-B) — deployed 2026-09-19; 300 taker closes or 21 days
- **B-REACH-BASELINE-ADJUST** (Kyle) — deployed 2026-09-20; 7-day rollback window
- **B-XSTOCK-FEE-CONTRACT** (Kyle) — deployed 2026-09-11; its 21-day window closes it
- **B-DEPLOY-DRIFT-LINE** (CC-A) — plan row 4.55 reads OPEN — OBSERVATION WINDOW (criterion 4 satisfied 2026-09-09)
- **B-INSTRUMENTS-OVER-RULES** (CC-A) — the code-search-tool usage measure runs 2026-09-18 → 10-02 (pre-registered)
- **8a-P4c increment 1 — the VTS xStock price instrument** (CC-C) — deployed bc199185e; window to 2026-09-30T00:00Z; pre-registered rules A-D then decide increments 2-3

## After live — 219

### AMR and machine learning — 31

- #608 (CC-B) — ➡️ MOVED to the sprint, `SPRINT_TO_LIVE_PLAN` row 124a (Kyle 2026-09-30: fix the AMR's observation lens before live; switch-on stays after live)
- #609 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- #610 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30) — the AMR still stays watch-only until after live; only its observations are corrected
- #611 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- #612 (CC-B) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30)
- B-AMR-CONTEXT-BONUS-REWIRE (CC-A) — Kyle 2026-09-28: all AMR work after live
- B-AMR-INPUT-INTEGRITY-ARC (CC-C) — ➡️ MOVED to the sprint, row 124a (Kyle 2026-09-30: fix the observation lens in the sprint; switch-on after live). Was: Kyle 2026-09-28: AMR fixes after live; stalled since 2026-07-30 with no plan row — place it in the post-live section · carries `#604` (leg A) and `#600` (a stale AMR comment blesses the wrong cap; land before any AMR flip) (2026-09-29)
- 17.1 Scope & Grounding (Week 23) — - Define full scope of ML inte (—) — already placed post-live in the roadmap
- 17.2 ML Touchpoint & Influence Mapping (Weeks 24-25) — #### Featu (—) — already placed post-live in the roadmap
- 17.3 Infrastructure Design (Weeks 25-26) — - In-process module vs (—) — already placed post-live in the roadmap
- 17.4 Research & Feature Engineering (Weeks 26-27) — - Evaluate ML (—) — already placed post-live in the roadmap
- 17.5 Blueprint Assembly (Weeks 27-28) — - Merge data flow, touchp (—) — already placed post-live in the roadmap
- 17.5.1 Rules-Based Policy Engine — - Implement the policy execution (—) — already placed post-live in the roadmap
- 17.5.2 Predictive Adjustment Execution — - Wire Predictive Adjustme (—) — already placed post-live in the roadmap
- 17.5.3 Calibration Execution — - Learning Calibration can now updat (—) — already placed post-live in the roadmap
- 17.5.4 Regime-Aware Adaptation — - Structural Regime (Global + Pair (—) — already placed post-live in the roadmap
- 17.6 Trend Mining Engine — design consideration (Kyle directive 2 (—) — already placed post-live in the roadmap
- 18.1 Crawl: Feature Store & Data Pipeline — - Build Feature Store (—) — already placed post-live in the roadmap
- 18.2 Walk: Model Training & Validation — - Train initial models o (—) — already placed post-live in the roadmap
- 18.3 Run: Integration & Parallel Execution — - Wire Inbound touch (—) — already placed post-live in the roadmap
- 18.4 Fly: ML as Primary Intelligence — - ML replaces rules-based (—) — already placed post-live in the roadmap
- 18.5 Trend Mining Engine — parallel architecture (per Phase 17.6 (—) — already placed post-live in the roadmap
- 19.6.4 Forward role — ML / AI conversational layer API — When the M (—) — forward role for the ML conversational layer — Phase 17/18
- 25-1 B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) Tier 2 ML calibra (—) — ML calibration tier 2 — its own row says it needs live evidence
- 25-11 Order-book / liquidity-aware position sizing + thin-market e (—) — SPLIT (Langston): the liquidity-aware sizing MODEL is Phase 25 calibration. The small fail-closed REFUSAL half is a separate MUST item (25-11a)
- 25-22 Edge-decay monitor — selection-IC + per-strategy calibration (—) — edge-decay monitor — research idea; most valuable once live
- 25-23 Probabilistic hidden-state (HMM-style) regime inference → re (—) — hidden-state regime inference — research idea
- 25-24 Orthogonal weak-feature enrichment of the per-cycle selectio (—) — weak-feature ranking enrichment — research idea
- 25-25 Cross-instrument / relative-value (statistical-arbitrage) si (—) — cross-instrument / relative-value signals — research idea
- 25-27 Profitable-signal PROFILE → reverse-engineer a scanner PRE-S (—) — profile of a profitable signal, reversed into a scanner pre-screen
- 25-6 AMR posture-model M2 calibration (post-launch — Phase 17/18 (—) — AMR posture model calibration — its own row says post-launch

### Break-even, trailing and moonbag exits — 6

- B-TEC-STATE-DURABILITY (?) — on restart the engine reads every open position's trailing progress from one /tmp file inside a catch-and-continue — a corrupt file boots with zero trailing pro
- Break-even stop + moonbag exits ((none)) — 
- Shadow break-even and moonbag calculations (paper now, live later) (?) — Kyle: launch with both off, but compute what break-even stops and moonbags WOULD have done on every paper trade (and live trades once live), so we can analyse w
- row:3n.c (CC-C) — trailing-exit state lost on restart — becomes MUST the moment trailing exits are switched on (see BE-MOONBAG)
- #639 (CC-B) — the stop in force at close is kept only on the open-position row and lost at close — a must once break-even or trailing is switched on; re-enters the sprint if row 69 finds a real exit defect (added 2026-09-29)
- #551 (CC-B) — re-judge an OPEN trade's stop and target against the current regime and volatility, not only trail on price — a new exit behaviour; cross-reference B-EXIT-POLICY-EVALUATOR (added 2026-09-29)

### Crew, reviewer, governance and alert tooling — 71

- B-RULES-CHANGE-CLASS (CC-A) — the `rules_change` change-class: a five-field case file pushed alone and ruled on BEFORE a rules edit lands; its own definition is its first case (Langston 2026-08-26, restored 2026-09-29, #744). ⛔ BEFORE B-GATE-GUARD (its line, under Other, carries the dependency)
- 2.4b B-ALERT-QUEUE-INTEGRITY (CC-B) — #647 (no claim or lock discipline on the alert file; the watchdog appends outside the lock; rewrites drop malformed rows) + #1074 (open-batch backstop alerts have no resolve edge) + #654 (the checker ignores open-retired rows and treats any COMPLETION filename as a close) — alert tooling (added 2026-09-29)
- B-CREW-SENDER-IDENTITY (CC-B) — `cc-send --sender` is free text over one shared webhook, so a Discord display name is a claim, not an identity — crew tooling, same class as B-WRITER-ACTOR-ALLOWLIST (added 2026-09-29)
- #1026 (Infra Claude) — chunked Langston dispatch leaks parts into the channel — comms
- #1035 (Infra Claude) — Langston's alert prompt lists only three owners
- #1043 (CC-INFRA) — a pinned GitHub read served the wrong file — reviewer tooling
- #169 (—) — the context-bridge-log retention job: a latent out-of-memory and (per Langston's archive) never installed
- #219 (—) — dormant flip-rate governance input
- #449 (CC-B) — governance checker read a frozen rulebook
- #655 (CC-A) — stateless parallel rulings — crew process
- #669 (CC-B) — Langston Step-4 finding (B) — contents need the owner's read
- #670 (—) — crew-status cold hand-off
- #679 (CC-B) — persistent threshold alerts re-fire forever once resolved
- #700 (CC-A) — crew process
- #701 (CC-A) — crew process
- #746 (CC-A) — Langston's second model site has no repo source
- #748 (CC-A) — the hook that loads CONDUCT.md has a silent fail path — cause not yet named
- #920 (—) — reviewer grep returns zero on a bad flag
- #942 (CC-C) — info alerts outside the no-silent-drop guarantee
- #982 alert hold verb (CC-A) — an ack silences an event-wait alert permanently and there is no un-ack; Kyle approved a third action subject to Langston's ruling; five alerts are acked-and-sil
- B-ALERT-ACK-PROCEDURE-DOCFIX (CC-B) — alert procedure doc
- B-ALERT-LIFECYCLE (—) — alert-tooling quality of life; its own row says it does not block the trading sequence
- B-ALERT-OWNERSHIP-REGISTER (CC-B) — alert ownership transfer
- B-ALERT-TAXONOMY (CC-A) — alert categories
- B-ALERT-WINDOW-EXPIRY (CC-A) — no terminal alert state for 'can no longer be observed' — alert tooling
- B-CANONICAL-CORPUS-ACCURACY (CC-C) — accuracy of the pre-governance reference corpus
- B-CANONICAL-FREEZE (CC-C) — its own row says governance hygiene, not on the trading path
- B-CHANGE-CLASS-DOCSET-FIT (CC-B) — governance checker doc-set matrix — governance
- B-CHANGE-CLASS-PARSER (CC-C) — governance-checker parser
- B-CHECKER-CORE-PATHS (CC-A) — governance-checker core paths
- B-CHUNK-ADDRESSING (CC-A) — comms outage cause
- B-CLAIM-REDERIVE (CC-A) — re-derive a load-bearing number at the Stop boundary — crew tooling
- B-DECISION-RECORDS (CC-A) — decision-history durability and catalogues (CC-A governance lane)
- B-DISCORD-CONNECT-RESILIENCE (CC-A) — Discord library crash on outage
- B-FRESHNESS-LOG-READER (CC-B) — nothing reads the rules-freshness hook's log — crew tooling
- B-GOV-2 (—) — checker always-on gate
- B-GOV-4 (CC-C) — checker entry test
- B-GOV-INTEGRITY-0 (CC-A) — reviewer frozen rulebook
- B-GOV-LEDGER-GRADE (#1099, CC-A) — the checker grades the commit-message ledger's presence and completeness; `roadmap` probably belongs in `sub_batch`; a report that opens NOT CLOSED should not count as a close; and a conditional doc is never graded today. ✅ Here by Langston's ruling (2026-09-29, B-GOV-REPORTING G6): the GOV-ARC list he named on 2026-08-29 is in a history plan, and GOV-ARC itself (#668) is parked by Kyle, so it confers no position.
- B-HEARTBEAT-RESCOPE (CC-A) — hourly heartbeat task purpose — crew tooling
- B-HOOK-ESTATE-VERSION (CC-C) — clones run different versions of one hook — crew tooling
- B-LANGSTON-CONTEXT remaining pieces (Infra Claude) — the reviewer's memory composer: P-2 retrofit + #1055, P-1b, and the privacy-check positive control
- B-LANGSTON-FILE-FLOOR (Infra Claude) — reviewer's always-loaded file size — reviewer tooling
- B-LANGSTON-LEDGER-SPLIT (CC-B) — how the reviewer's loaded set stops growing; with 2.8a/2.8c (Infra)
- B-LANGSTON-LOAD-RATCHET (Infra Claude) — reviewer tooling
- B-LANGSTON-RECONCILE-VERB (Infra Claude) — reviewer tooling
- B-LEDGER-HEADLINE-INJECT (Infra Claude) — reviewer tooling
- B-MEASURE-GATE (CC-A) — re-surfacing alerts re-emit old measurements
- B-OPEN-OBLIGATION-SWEEP (CC-B) — process instrument for homed-but-unwatched items
- B-PYCACHE-PREFIX-INVOCATION (—) — reviewer-tooling hardening on the Helsinki box; not the trading path (a planted-cache execution vector — worth doing, not a live blocker)
- ~~B-READ-MODEL-BLOB-VERIFY (Infra Claude)~~ — **SUPERSEDED 2026-09-29 (§9.4 disposition 5): B-CREDENTIALS-PRIVATE-REPO OBJ-4a's `dt-review show <sha>` re-hashes commit, trees and blob (live on Helsinki, Langston Step 8); `#1043` closes at that batch's OBJ-6 flip.** Was: the reviewer's pinned reads served the wrong file twice — a reviewer reading the wrong object weakens every review before live (Infra)
- B-REVIEWER-LOOP (CC-A) — plan row 4, PLACED 2026-08-28, open (CC-A lane reply) — governance tooling
- B-RULES-LAYER (CC-A) — Kyle-directed: move behavioural rules to a stronger layer — crew process
- ~~B-DRIFT-UNCAPPED-DIFF (CC-A)~~ — **WITHDRAWN 2026-09-30 (§9.4 disposition 5): `#1117` is added to `B-CREDENTIALS-PRIVATE-REPO` (Infra Claude, running now), whose approved drift conversion already reads the uncapped local diff with `--no-renames` (`B_CREDENTIALS_PRIVATE_REPO_PRE_AUDIT.md:601`).** Was: the deploy-drift monitor's runtime-path gate goes UNDECIDABLE when staging is more than 300 files behind (the GitHub compare cap, `dt-deploy-drift.sh:265`).
- B-CHECKER-BLOCK-GATE (CC-A) — #1107: let the governance checker block a close, as Kyle approved 2026-07-10 for real issues only; ⛔ AFTER B-RULES-LAYER; gated on the measured checker-precision figure (the share of its alerts that were real)
- B-SCRIPTS-TSC-COVERAGE (CC-B) — type-checking coverage for the scripts folder — tooling
- B-SHARED-TMP-ISOLATION (CC-B) — sessions share /tmp so a commit message can be another session's — crew tooling
- B-STATE-ASSERTION-LINT (CC-A) — sentences true when written and wrong now — governance tooling
- #653 (CC-A proposed at filing; CC-B filed) — two System Manual lines still tell a session to git pull the retired clone, in a Replit-era section; documentation only, CLAUDE.md §7.1 binds (added 2026-09-29)
- #444 (CC-B) — nothing checks that an issue's named home batch is still open, so an issue homed to a closed batch looks homed and silently dies; if Langston rules it gates plan currency, it moves to sprint row 1 (added 2026-09-29)
- B-TOKENWATCH-OBSERVED-AT (CC-INFRA) — token watch tooling
- B-TOKENWATCH-PAIR-SELECT (CC-INFRA) — token watch tooling
- B-TSC-COVERS-TESTS (CC-C) — type-checking coverage for test files — tooling
- B-TSC-GUARD-DETERMINISM (CC-A) — CI type-check guard determinism — tooling
- B-UMBRELLA-OPEN-STATE (CC-B) — governance checker state for umbrella batches
- B-WAKE-SOURCE-TRUTH (CC-INFRA) — crew wake-source documentation
- B-WAKE-OUT-OF-BAND (CC-INFRA) — a way to wake a session whose wake watcher has died that does not travel through that watcher (the hourly heartbeat now posts to Discord, which a dead watcher cannot read; `#1054` amendment 2026-09-29). After B-WAKE-SOURCE-TRUTH, so it is specified against true docs. Intake test (§2): crew tooling, not in the §1 rule, so after live.
- B-WRITER-ACTOR-ALLOWLIST (CC-B) — Langston memory-tool actor names — reviewer tooling
- Stop appending closed-batch history to Langston's memory (Infra Claude) — every batch close appends to his memory and nothing evicts; keep current state and generalising rulings, evict by supersession
- 12.2 lookalike register (CC-A) — one page of the pairs that already caused wrong calls — FIRST BREAK by Langston's ruling
- 20.3 Test Infrastructure — - Add unified test runner scripts ( te (—) — test runner and frontend test tooling
- row:1 (CC-A) — crew-process rule mechanisms (B-RULES-1e) — governance tooling, no effect on trading

### Legacy and dead-code cleanup (the reachability census may pull some forward) — 19

- B-AI-CHAT-REMOVAL (CC-C) — Kyle 2026-09-30: the AI chat is dead code, remove it with finality. Its ACTION path (intent executor + the seven `/intent/*` routes + the approval components) goes NOW in `B-SIZING-DEC-RESTORE` 2e because it touches paper trading; THIS entry is the rest — conversation, saved chats, chat logs/costs routes, and the unmounted assistant/panel/container/sidebar/insights components (`ai-opportunities-tab` is mounted and stays). 0 calls in ~11 days of access logs. Pull forward if Kyle wants it before live.

- #1042 (CC-B) — `calibration_ledger.decision_grade` is a flag no code reads and no screen shows; it read true on wrong xStock fee rates (added 2026-09-29)
- #507 rider (CC-B) — `triggerSoftResubscribe` in the mini-book integrity monitor is kept and never called; #507's own checksum work is done (added 2026-09-29)
- #1055 (—) — delete a dead legacy write on Langston's box
- #154 (—) — dead optional constructor argument
- #518 (CC-B) — delete a dormant commented-out guardrail block (rule 18)
- #528 (CC-B) — delete an unused 1,376-line trades page (rule 18)
- #537 (CC-B) — untracked orphan script
- #625 (CC-B) — orphan sweep lacks a branch for deadline keys
- #686 (CC-C) — relocate a runtime file out of bridge/canonical; its reader's scheduler is dead — no live effect (CC-C)
- B-ASSET-CAPS-REMOVAL (—) — open: delete an orphaned pre-governance service (orphan premise confirmed by census) — the dead-code reachability census decides if it moves
- B-ORPHAN-ROOT-SCANNER (CC-C) — dead code (disposition 5) — legacy removal, no live effect
- B-SCANNER-DEDUPE-DEAD-TABLE (CC-C) — dead table cleanup
- 16.2 Database Phase A-B: Isolation & Modularization — - Confirm w (—) — database isolation and modularisation — no live-safety effect (a proposed deferral: the run order puts Phase 16 before live)
- 16.3 Database Phase C: Schema Simplification — - Drop Wave 3 tabl (—) — drop legacy tables and enums — proposed deferral
- 16.4 Wave 7: Post-L-Series Cleanup — - SafetyGuardrails service r (—) — remove the old SafetyGuardrails service — only matters if any live path still consults it
- 16.5 LSP Error Resolution — - Delete legacy files causing LSP err (—) — editor/type error cleanup
- 16.8 Predictive-Learning / ML-Era Teardown REMAINDER (added 2026- (—) — ML-era teardown remainder — Kyle decided REMOVE
- 16.9 resetRateLimiter() — INERT ON THE ONLY ENVIRONMENT WE RUN (a (—) — inert rate-limiter reset — Kyle slotted it in Phase 16
- row:3n.b (CC-C) — orphan level tables (disposition 5) — legacy removal

### Other (research, UI, refactors) — 75

- #1020 (CC-A) — push guard inherits the previous call's working directory and refuses on a false zero (hit again building this draft)
- #148 (—) — health check permission error on a Replit-era path
- #151 (—) — Phase 16 register entry
- #152 (—) — document the locked-module override boundary
- #156 (—) — audit candidate for per-class consumer swaps
- #157 (—) — line-number drift in a diagnostic payload
- #158 (—) — inefficient 24h filter at volume
- #159 (—) — log volume gating for a canary line
- #171 (—) — corrupt manifest needs a manual runbook
- #173 (—) — a recurring zero-null guard once Phase 25 reads the dataset
- #198 (—) — cron-evidence verifier edge case
- #202 (—) — study scripts leave files on staging that block the next pull
- #209 (—) — ratchet the type-check baseline down
- #217 (—) — RTB context bonus in shadow
- #229 (Kyle) — four symbol-format modules that accept different forms — consolidate
- #234 (—) — 390 non-active-path type errors, each homed
- #298 (Kyle) — ticker shown instead of company name
- #391 (CC-B) — monitor the xStock in-hours flat-price block rate
- #463 (—) — bridge code reviewed by documentation, not diff
- #606 (CC-B) — a method note filed as its own entry
- #621 (CC-C) — code-review gate grades a diff by mechanism
- #626 (CC-C) — an open question shipped in a user-facing string
- #642 (CC-A) — a discredited number inside a scheduled gate (CC-A copy of a doubled number)
- #646 (CC-C) — resolved_by not populated on manual resolve
- #660 (Kyle) — trade tables' 365-day hot window never re-asked
- #673 (CC-A) — desktop sessions and the CLI are different versions
- #680 (CC-B) — type-check gate at push time
- #683 (CC-A) — flaky test collection failures
- #740 (CC-A) — skill description colon trap
- #970 (CC-A) — its home B-DISAGREEMENT-FINDER closed on a negative result — needs a new home or a withdrawal (CC-A proposing)
- B-BURN-THRESHOLD-BASIS (CC-INFRA) — not withdrawn — token-watch alarm tuning (Infra)
- B-CATALOG-1 (Kyle) — table catalogue + lookalike register
- B-CATALOG-2 (CC-A) — its FIRST catalogue is the diagnostic-coverage map (Kyle: 'where we have diagnostics and where we don't') — how Kyle sees what live is and is not watched. The r
- B-CREW-BOARD-REMOVAL (CC-A) — retired board code — gated on Kyle
- System Manual row conflict (CC-B) — 
- B-DAILY-CUTOVER-SWEEP (CC-C) — four tables idle 29 nights then sweep everything at once
- B-DEPLOY-REF-DECLARATION (CC-C) — deploy-tool declaration
- B-DISPATCH-STAGING-VERIFY (CC-C) — its own row says it blocks nothing
- B-EOL-NORMALISE (CC-A) — line-ending normalisation
- B-EOL-POLICY (—) — line-ending policy
- B-EXIT-LINE-IDENTITY (CC-C) — trade id and class on the exit log line, so a close is read by identity
- B-EXIT-PATH-TYPING (CC-A) — the exit path is untyped
- B-EXIT-POLICY-EVALUATOR (CC-B) — our expectancy model cannot rank exit alternatives; needs B-OUTCOME-CORPUS-CAPTURE first (not a defect — a missing capability)
- B-GATE-GUARD (CC-A) — issue-number blocks; ⛔ AFTER B-RULES-CHANGE-CLASS lands (crew tooling; Langston 2026-08-26, restored 2026-09-29, recorded on #744), and it carries the `SCOPE:` trailer on governed-artifact pushes
- B-GATE-WILDCARD-REFUSE (CC-B) — code-side guard behind a migration invariant that already refuses the bad row
- B-GDRIVE-UNMOUNT (Infra Claude) — placed 2026-08-28, not parked; owner Infra Claude; absorbs #921
- B-GOV-INTEGRITY-3 (CC-A) — message id spans
- B-HORIZON-GRID-COMPARABILITY (CC-B) — makes holding-horizon numbers comparable — precondition for the exit-policy evaluator
- B-LANGSTON-QUEUE-2 (CC-A) — review queue lock · the batch itself closed 2026-07-11; what remains here is `#484` (a Langston verdict does not record which invoke produced it or what it saw) and `#486` (a follow-up that does not name Langston is dropped silently) (2026-09-29)
- B-OBS-WINDOW-EVIDENCE-CAPTURE (CC-C) — capture observation-window evidence at the event — measurement quality
- B-PRICE-DOC-CONSOLIDATE (Kyle) — merge two price documents into one — Kyle wants it done, but it is documentation
- B-QUOTE-PEG-DEVIATION-WATCH (CC-C) — watch for quote-peg deviation; its row says it gates nothing
- B-SLOT-PLACEMENT-CHECK (CC-A) — Kyle's own ask: a newly slotted item reaches the plan and the owning task list at the moment it is slotted — the failure this inventory is repairing by hand ➕ **Also carries (Langston, `B-PLAN-CURRENCY-CHECK` Step-2 part 3, 2026-09-30): the session task lists are DERIVED views of the plan, and their refresh trigger is stated and homed here** — three ownership copies with two drifting (the reconcile found 18 CC-C and 2 CC-A task-list divergences) is how a fourth number appears.
- B-STORAGE-CATALOG (CC-A) — unmanaged app-local file store
- B-TOKEN-WATCH Steps 7-11 (Infra Claude) — research feed paused at Step 7; no trading link
- B-TSC-BASELINE-TS2345-AUDIT (CC-B) — 32 suppressed type errors in the routes file, one tied to the balance
- B-TSC-GUARD-CWD (CC-B) — push guard working directory
- B-VERIFY-DISCIPLINE (CC-C) — absence-reads-as-pass defect class
- B-VOLATILITY-CACHE-RETIRE (CC-B) — 
- B-VPG-ROW-ALIGN (CC-C) — its own row says display-only
- The 11 GB old-conversation sweep for things discussed and never picked (Infra Claude) — Kyle asked for everything discussed and not gotten back to; this feeds the inventory itself
- 19-13 §19.3 Performance Validation Latency, throughput, queue dept (—) — latency / throughput / cadence under load — matters more as volume grows than on day one
- 19-15 #97 xStock asset-specific characteristics inventory Earnings (—) — xStock fundamentals enrichment (earnings, P/E, ratings) — plumbing, not a live-safety need
- 19-16 B79.6 sector-aware portfolio-cluster prevention Equities clu (—) — sector-cluster prevention — correlated xStock positions multiply risk; concurrency caps bound it today
- 19-17 NEW — Active Trading Simulations (Kyle directive 2026-05-27) (—) — active-trading simulations — more learning data per day for Phase 25; not a live-safety need
- 19-5 §19.x Boot Readiness Coordinator Unify the patchwork boot se (—) — boot readiness coordinator — conditional on boot cascades, which have not recurred
- 19.6 External Source Connection & Capacity Diagnostics Dashboard (—) — external-source and capacity diagnostics dashboard — visibility that catches a live problem fast
- 19.6.6 Internal subsystem health + EARLY-FAILURE detection (NEW 202 (—) — early-failure detection — catch failures in progress; high value once real capital is exposed
- 21.4 POST-LAUNCH REVISIT — the strong-trend lane's absent volume (—) — already placed post-live in the roadmap
- 21.4.1 8-module extraction — Per MODULARIZATION_SYNTHESIS_FROM_B63_ (—) — already placed post-live in the roadmap
- 21.4.3 storage.ts modularization (folded in from Phase 16.2) — Phas (—) — already placed post-live in the roadmap
- 21.5.2 Perpetual Futures Integration — - Add Kraken Futures API end (—) — already placed post-live in the roadmap
- 21.5.3 Cross-Asset Infrastructure — - Unified portfolio view across (—) — already placed post-live in the roadmap
- 22.1 Build & Deploy Pipeline — - Production build validation - En (—) — already placed post-live in the roadmap
- 22.2 Monitoring & Observability — - Production logging strategy ( (—) — already placed post-live in the roadmap

### Perpetual futures — 5

- #144 (—) — perpetual-futures activation checklist — perps come after live
- #155 (—) — perp reason truncated in a diagnostic endpoint
- #687 (CC-C) — equity-perp universe file stale — perps are after live (merges into P19-B-PERPFEED)
- B-FUNNEL-PERP-CLASSES (CC-C) — open: the funnel can only key the two spot classes; perps come after live (an interim alert shipped in F-G-1)
- B-FUTURES-BAR-FINAL (CC-C) — futures bar finality — perps are post-live, but check whether any live-class signal reads these bars

### Storage, database and production hardening — 12

- #147 (—) — per-class telemetry disk persistence
- #172 (—) — stale duplicate retention keys
- #685 (CC-C) — crypto 1-minute bars cannot be tiered to warm storage
- #689 (CC-C) — storage-fraction numerator/denominator mismatch
- #697 (Kyle) — storage overview UI page (Kyle directive)
- B-ARCHIVE-RETENTION-SIZING (Kyle) — Kyle decided 2026-09-23: no action, August tiers to warm in October; the uninstalled context_bridge_log TTL job is a separate small defect
- 12.6 decommission residue (CC-A) — per-table rule-18 census of 9 walter_* tables + backups — its bytes count toward the 72% disk sizing
- 20.1 Database Phase D: Migration Rebaseline — - Generate fresh ba (—) — migration rebaseline
- 20.2 Database Phase E: Index & Retention Hygiene — - Audit index (—) — index and retention hygiene — database at 72% of plan (Kyle: August moves to warm storage in October)
- 20.3.1 — Unit/integration test-tier separation (RUNNING_ISSUES #226 (—) — unit / integration test-tier separation
- 20.4.5 Observability hardening (NEW 2026-06-12 — §19.6.6 long-tail) (—) — observability hardening
- 20.5 Architecture Cleanup — - Decompose monolithic pages (enhance (—) — decompose large pages and route files

## Parked by Kyle — 7 (unchanged)

- B-ALERT-DEDUPE-REASON-DRIFT — parked by Kyle, deliberately undated
- B-GOV-INTEGRITY-2 — parked by Kyle, deliberately undated · carries `#481` (the general governed-read helper and lint; the dangerous shape is already blocked by a hook)
- B-RULES-1E-LANGSTON-SLIM — parked by Kyle, deliberately undated
- #392 — parked by Kyle, deliberately undated
- #668 — the governance-standardisation arc — a DIFFERENT thing from B-SIZING-DEC-RESTORE, which only cites it
- #693 — parked by Kyle, deliberately undated
- #741 — parked by Kyle, deliberately undated

