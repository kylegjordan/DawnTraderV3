# THE PUSH TO LIVE — the re-sorted list (Kyle's go-live rules, 2026-09-28)

**Kyle's rule:** everything needed to get paper to the point where the mechanics are sound and working as intended, the thresholds / gates / regimes / strategies / scores are tuned, the prices are right, paper tells the truth, we capture the data we mean to learn from, and paper trades profitably and consistently — plus the live-mode fixes, mixed into the same push. **Everything else goes after live.** No phase names: one list, prioritised next.

**In the push: 182** · **After live: 217** · **Running now (observation windows): 7** · **Parked by Kyle: 7** · awaiting owner confirmation: see the draft's UNCONFIRMED section.

| category | items |
|---|---:|
| 1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close) | 49 |
| 2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores | 32 |
| 3. Prices — the feed is correct and paper uses the right price for each job | 18 |
| 4. Paper tells the truth — no mistake that makes results look better or worse than they are | 13 |
| 5. Learning data — capturing what we intend to learn from | 26 |
| 6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment | 42 |
| 7. The evidence — trading profitably and consistently in paper | 2 |

> Source: `PRE_LIVE_INVENTORY_DRAFT.md` (Langston-approved r8) re-sorted by `scripts/inventory/sort.py`; the working order is `scripts/inventory/order.py` (asserts every push item appears exactly once); Kyle's decisions in `scripts/inventory/kyle_decisions.json`. The order is CC-B's draft for Langston's review; owners are provisional until the session assignment.

## THE WORKING ORDER

Two tracks run side by side and meet at go-live. **Track A** is the trading system: foundations first (the things that corrupt everything downstream), then the mechanics stage by stage with the learning-data work alongside, then tuning on the clean data, then the evidence. **Track B** is live-mode readiness: safety work that can start now, risk controls and restart safety, the live engine (after your production-environment decision), and go-live preparation. **Wave 0** is this week. Within a wave the numbers are the working order; 'after X' means it waits for X.

### Wave 0 — NOW — urgent, cheap, or already in flight (this week)

1. **12.1 rulings-durability fix** (CC-A) · *live readiness* — cheap and irreversible if lost: copy Langston's rulings file to a read-only replica
2. **Months of database headroom** (?) · *live readiness* — database at 81% (critical): confirm the October move to warm storage lands, then measure months of headroom
3. **Define 'comfortable in paper' in numbers** (CC-C + Langston) · *evidence* — set the numbers for 'comfortable in paper' BEFORE the evidence comes in
4. **Fix duplicated plan ids** (CC-A) · *mechanics* — part of rewriting the plan: no two items share a number
5. **B-OHLC-FRAME-GUARD** (CC-C) · *prices* — in flight: only the on-screen check is left
6. **B-REST-SIDES-TO-CACHE** (CC-C) · *prices* — built and reviewed: deploy after the 2026-09-30 VTS window closes
7. **B-BOOK-STATE-RESTART-DURABLE** (CC-C) · *mechanics* — built and reviewed: deploy with the one above
8. **F-G-1 reopens: the OHLC writer can write an older bar over a newer one** (CC-C) · *prices* — the OHLC writer can put an older bar over a newer one — it feeds the bars signals are built from
9. **B-PRICE-SIDE-BY-JOB** (CC-C) · *prices* — in flight: its xStock increments follow the 09-30 window

### Wave A1 — TRACK A · Foundations — the things that corrupt everything downstream

10. **B-UNIVERSE-REFRESH-ACTS** (CC-C) · *mechanics* — first link of the identity chain
11. **B-SYMBOL-CLASS-IDENTITY** (CC-C) · *mechanics* — after B-UNIVERSE-REFRESH-ACTS: a ticker shared by a coin and a stock becomes two instruments
12. **B-RTB-SIGNAL-IDENTITY** (CC-B) · *mechanics* — after B-SYMBOL-CLASS-IDENTITY
13. **B-VTS-CLASS-LABEL-INTEGRITY** (CC-B) · *learning data* — after B-SYMBOL-CLASS-IDENTITY: correct the mislabelled VTS rows
14. **B-CLOSED-TRADES-CLASS-BACKFILL** (CC-B) · *learning data* — after B-SYMBOL-CLASS-IDENTITY
15. **Exclude plain-currency and non-dollar pairs** (Kyle) · *mechanics* — Kyle's decision: exclude plain currency pairs and non-dollar crypto now
16. **B-NONFIAT-QUOTE-DENOMINATION** (CC-C) · *mechanics* — the exclusion itself, if small
17. **B-QUOTE-ADMISSION-LEGACY-SWEEP** (Kyle) · *mechanics* — with the exclusion: what the old allowed-pairs list is for
18. **B-QUOTE-LEG-INTEGRITY** (CC-C) · *mechanics* — with the exclusion
19. **B-PRICE-FLOOR-REVIEW** (CC-C) · *tuning* — replace the $0.25 floor with a real market-depth test
20. **B-VENUE-PAIRS-REINIT** (CC-C) · *mechanics* — a changed exchange price step must not refuse orders
21. **B-SCAN-BREADTH-DECLINE** (CC-C) · *mechanics* — why the scanner sees so few pairs — breadth feeds selection
22. **B-XSTOCK-LIVE-FEED** (CC-C) · *prices* — the xStock feed became our trading feed without a decision — decide and fix
23. **row:6** () · *prices* — a bound on how old a price may be when used
24. **B-PRICE-STALENESS-BOUND** (CC-C) · *prices* — the last-known-good price is re-served with no age bound
25. **B-EQUITY-RECONNECT-STALL-TIMER** (CC-C) · *prices* — a stalled xStock reconnect leaves positions unwatched
26. **B-WS-SUBSCRIBE-CLASS-FILTER** (CC-A) · *prices* — the crypto subscribe set is not class-filtered
27. **#506** (CC-B) · *prices* — book subscriptions never unsubscribe
28. **B-BOOK-SUBSCRIPTION-REACH** (CC-C) · *prices* — after #506: subscribe the order book for the whole pool, not ~3 coins
29. **B-CRYPTO-MARK-AGE-GATE** (CC-C) · *prices* — crypto mark age
30. **B-XSTOCK-SESSION-FRESHNESS** (CC-C) · *prices* — xStock entry-age limit vs the exit standard Kyle ruled
31. **B-XSTOCK-ENTRY-COMPARATOR** (CC-C) · *prices* — xStock entry-price cross-check
32. **B-DECIDED-INTENT-INDEX** (CC-C) · *prices* — xStock's three definitions of 'the price' from one frame
33. **B-POST-GRID-MUTATION-CENSUS** (Kyle) · *prices* — what changes a stop after it is rounded
34. **row:7** () · *prices* — the VTS reads prices through the shared accessor
35. **#1033** (CC-C) · *mechanics* — an absent volume is stored as zero and the liquidity filter reads it
36. **#972** (CC-B) · *mechanics* — xStock ATR reads empty around the open and close
37. **#566** (CC-B) · *mechanics* — volatility measured with a lag
38. **Independent review of the pricing architecture (Codex)** (CC-C) · *prices* — after the price items: an independent review of the whole price layer
39. **B-SIZING-DEC-RESTORE** (CC-C) · *mechanics* — paper sizing to Kyle's intent (~$140-150 a trade, 15-20 open)
40. **#628** (CC-C) · *mechanics* — with B-SIZING-DEC-RESTORE: its two sizing sites

### Wave A2 — TRACK A · Mechanics, stage by stage — can start as A1's pieces land

41. **#233** () · *mechanics* — signals: drift and volume inputs fed as fixed defaults
42. **#199** () · *mechanics* — strategies: xStock volume confirmation removed for lack of an honest feed
43. **row:3m-ENUM** (CC-C) · *mechanics* — strategies: volatility_edge's pattern path is silently dead
44. **B-SILENT-STRATEGY-CENSUS** (CC-B) · *mechanics* — strategies: three wired strategies never evaluated
45. **B-TARGET-FABRICATION** (CC-C) · *mechanics* — signals: default targets the strategy never chose
46. **#574** (CC-A) · *mechanics* — SQE: a made-up volatility input in the ranker
47. **B-RTB-REFRESH-CONSOLIDATE** (CC-A) · *mechanics* — RTB: the net-EV backstop removed on thin evidence
48. **#570** (CC-C) · *mechanics* — RTB: one refresh bucket fires but does not refresh
49. **#699** (CC-C) · *mechanics* — RTB: does promotion evict, or is the screen stale
50. **19.2 Audit & Debug — - Verify FinalScore, Hybrid Score, Confidenc** () · *tuning* — SQE: verify every score calculates correctly
51. **B-ENTRY-LEVEL-RECHECK** (CC-B) · *mechanics* — open: re-check a signal's levels against the current price before the fill
52. **B-INTENT-ENTRY-PARITY** (CC-C) · *mechanics* — open: two entry routes bypass the price grid
53. **B-GRID-LIVE-PATH-PARITY** (CC-C) · *mechanics* — open: grid rounding on the live order path
54. **A resting order's deadline must run whether or not a price is usable** (CC-C) · *mechanics* — open: a resting order's deadline runs even when no price is usable
55. **#630** (CC-A) · *mechanics* — open: exercise the maker-order deadline once
56. **B-EXIT-TRIGGER-FILL-PARITY** (CC-C) · *mechanics* — close: exits fire on the price they would fill at
57. **B-EXIT-TICKER-LEG-ADAPTER-SIDES** (CC-C) · *mechanics* — close: the exit path sees both price sides
58. **B-XSTOCK-BID-TRIGGER-RELAND** (CC-C) · *mechanics* — close: xStock triggers back on the bid
59. **B-BOOK-STATE-RING-INDEPENDENT-BOUND** (CC-C) · *mechanics* — close: xStock exit plausibility bound
60. **#204** () · *mechanics* — close: xStock stop prices at the wrong scale
61. **row:3h.b** (CC-C) · *mechanics* — close: remove the second exit implementation
62. **B-EXIT-LATCH-INVESTIGATION** (CC-A) · *mechanics* — close: is the hold-past-target a label or a real exit defect
63. **Map EXIT_PATH_MACHINERY_AUDIT §10 items to their homes** (CC-C) · *mechanics* — close: map the exit audit's items to homes
64. **#166** () · *mechanics* — close: the TEC stale-cache fence keeps firing
65. **B-CLOSE-WRITER-COSTS** (CC-B) · *mechanics* — close: no close without a trade record, no invented zero fees
66. **B-SCHEDULER-FIRST-TICK** (CC-A) · *mechanics* — restarts: every scheduled job runs twice after a restart
67. **#585** (CC-B) · *mechanics* — restarts: auto-resume skips a malformed session
68. **B-STRING-TRUTHINESS-GUARDS** (CC-C) · *mechanics* — hygiene: guards that treat '0' as true
69. **B-GUARD-COVERAGE-AUDIT** (CC-C) · *mechanics* — hygiene: which guards cover which paths
70. **B-LEARNING-SYSTEM-CENSUS** (Kyle) · *mechanics* — hygiene: old learning systems still wired
71. **Dead-code reachability census** (?) · *mechanics* — hygiene: which dead code a trade can still reach (pulls items forward if any)
72. **B-MODE-PREDICATE-SWEEP** (CC-C) · *mechanics* — hygiene: readers that would mix live and paper P&L
73. **row:8** () · *paper truth* — paper truth: fill-integrity detector
74. **B-COST-MATH-CONSOLIDATION** (CC-C) · *paper truth* — paper truth: one home for cost maths
75. **#527** (CC-B) · *paper truth* — paper truth: xStock friction components
76. **B-IMPLEMENTATION-SHORTFALL** (CC-C) · *paper truth* — paper truth: separate stale-signal cost from execution cost
77. **B-GRID-REFUSAL-RATE** (CC-C) · *paper truth* — paper truth: how often the grid refuses
78. **B-VALIDATE-OBSERVABILITY** (CC-C) · *paper truth* — paper truth: make validation failures visible
79. **B-DIAG-READ-INTEGRITY** (CC-C) · *paper truth* — paper truth: diagnostics that read a status code as data
80. **B-FILTER-DIAG-XSTOCK** (CC-B) · *paper truth* — paper truth: the empty xStock decline table
81. **#664** (CC-B) · *paper truth* — paper truth: a hardcoded 'strategies evaluated'
82. **#419** (CC-B) · *paper truth* — paper truth: funnel counts under errors
83. **#549** (CC-B) · *paper truth* — paper truth: Open Trades field gaps
84. **#561** (Kyle) · *paper truth* — paper truth: volume / order book columns in Open Trades
85. **#547** (CC-B) · *paper truth* — paper truth: the Analyst's July findings (owner reads)
86. **#522** (Kyle) · *mechanics* — LAST in A2: the full runtime pipeline audit, both classes, end to end
87. **#235** (Kyle) · *mechanics* — with #522: the crypto pipeline validated end to end

### Wave A3 — TRACK A · Learning data — alongside A2; must finish before tuning reads the data

88. **B-OUTCOME-CORPUS-CAPTURE** (?) · *learning data* — what each VTS trade earned, recorded durably, with a measured/defaulted flag on its inputs. NOT a deletion clock: the 90-day delete was fixed 2026-07-30/08-06 (365 days, archive before delete); nothing is due for deletion before 2027-05
89. **B-PAPER-LANE-PROVENANCE** (CC-B) · *learning data* — paper records its decision inputs
90. **T-W20C-SCALAR-LEG** (CC-B) · *learning data* — after B-PAPER-LANE-PROVENANCE: the parity harness proves recorded history replays
91. **#515** (CC-B) · *learning data* — remaining learning columns on the active path
92. **#631** (CC-A) · *learning data* — entry-mode fields on the active archive
93. **#504** (CC-A) · *learning data* — regime on maker/taker shadow rows
94. **B-DECISION-INSTANT-QUOTE** (CC-C) · *learning data* — the exact quote at decision time
95. **B-EXIT-DECISION-RUNG-STAMP** (CC-C) · *learning data* — which price rung an exit used
96. **B-TRADE-RECORD-JOINABILITY** (CC-B) · *learning data* — trade records join across stores
97. **B-VPNL-WRITER-BOUND** (CC-B) · *learning data* — an unbounded learning column
98. **B-VTS-MARK-SIDE** (CC-C) · *learning data* — the VTS marks on the right side
99. **B-VTS-NO-DECISION-VALVE** (CC-C + Langston) · *learning data* — only if quick (Kyle): VTS trades stuck with no usable sell price
100. **#658** (CC-C) · *learning data* — VTS posture multipliers contaminating learning rows
101. **#220** () · *learning data* — an error thrown 64,494 times in VTS strategy runs
102. **#1072** (CC-C) · *learning data* — the price-history recorder's frozen symbol set
103. **B-ARCHIVE-WRITER-LIFECYCLE** (CC-C) · *learning data* — the archive writer's lifecycle
104. **B-EPOCH-PARITY-FENCE** (CC-C) · *learning data* — one home for the calibration epoch
105. **B-ROLLBACK-EPOCH-FORWARD** (CC-B) · *learning data* — epochs across a rollback
106. **#590** (CC-A) · *learning data* — calibration store reset at the formula change
107. **B-OBS-WINDOW-EVIDENCE-CAPTURE** (CC-C) · *learning data* — capture window evidence at the event
108. **B-PROVENANCE-LOSS-CENSUS** (CC-C) · *learning data* — where decision provenance is lost
109. **#231** () · *learning data* — ablation record id gap
110. **25-9 xStock pair_correlation per-pair WR data accumulation (B68.3** () · *learning data* — xStock per-pair correlation data
111. **row:9** () · *learning data* — LAST in A3: the gate for restarting the learning record clean after the fixes

### Wave A4 — TRACK A · Tuning — reads the clean data; costs -> geometry -> strategies -> regimes -> scores -> gates -> ranking

112. **#914** (CC-C) · *tuning* — costs: the per-leg cost term
113. **25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe** () · *tuning* — costs: the per-class safety margin
114. **#645** (CC-C) · *tuning* — costs: a crypto-era net-EV floor applied to xStocks
115. **B-EXCURSION-RECORD** (CC-B) · *tuning* — geometry: record how far trades travel
116. **25-17 TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, B** () · *tuning* — after B-EXCURSION-RECORD: target geometry for all strategies
117. **25-17b CRYPTO reach_atr_max DECISION — the reachability-ceiling que** () · *tuning* — geometry: crypto reach ceilings
118. **25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALI** () · *tuning* — geometry: per-strategy minimum reward-to-risk
119. **B-TARGET-MULTIPLE-VS-HORIZON** (CC-B) · *tuning* — geometry: move targets that sit too far
120. **25-26 Trade HOLD-TIME / timeframe study — do slower (multi-day) tr** () · *tuning* — geometry: do slower trades clear the fee wall
121. **B-EXIT-MAKER-VS-TAKER-REVIEW** (CC-B) · *tuning* — geometry: maker exits profitable, taker target exits negative
122. **#648** (CC-A) · *tuning* — strategies: six never traded
123. **#201** () · *tuning* — strategies: range_trade starved
124. **#529** (Kyle) · *tuning* — strategies: the strategy-weighting chain
125. **B-FAMILY-POOL-REACHABILITY** (CC-C) · *tuning* — strategies: reachability in the family pool
126. **B-IDEAL-POOL-STARVATION** (CC-A) · *tuning* — strategies: the ideal pool gets 4-5% of slots
127. **25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: entry-trigger sweep
128. **25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: geometry reconstruction
129. **25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** () · *tuning* — xStock: per-strategy entry re-fit
130. **25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW** () · *tuning* — regimes: confidence-chain calibration
131. **25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice** () · *tuning* — regimes: crypto confidence modifiers
132. **25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier** () · *tuning* — regimes: xStock macro modifiers
133. **B-RETIRED-SCORE-REMOVAL** () · *tuning* — scores: retire the retired scores
134. **#588** (CC-A) · *tuning* — scores: a validated quality term in the ranking
135. **25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh** () · *tuning* — scores: SQE recalibration
136. **25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib** () · *tuning* — gates: the sustainability gate
137. **25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar** () · *tuning* — gates: does the Net Expectancy gate reject winners
138. **25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0** () · *tuning* — gates: the Net Expectancy gate's measured judgement
139. **#644** (CC-C) · *tuning* — gates: the exploration subsidy decision
140. **#221** (Kyle) · *tuning* — ranking: crypto vs xStock signals in one queue
141. **#149** () · *tuning* — ranking: per-class RTB refresh cadence

### Wave A5 — TRACK A · The evidence — runs continuously; judged at the end

142. **19-11 §19.1 Paper Trading Run The act of actually running paper-ac** () · *evidence* — the paper run judged against Kyle's standard

### Wave B1 — TRACK B · Safety now — can start immediately, in parallel with Track A

143. **B-SEC-HARDEN** (CC-A) · *live readiness* — rotate the public owner password first (Kyle), then route authorisation
144. **B-SSH-KEY-CENSUS (investigation)** (?) · *live readiness* — whose are the two unknown keys
145. **#615** (CC-A) · *live readiness* — the reviewer identity must not read the secrets file
146. **Coltrane parity: a privacy check like Langston's** (Infra Claude) · *live readiness* — before the Coltrane trial: a privacy check like Langston's
147. **#681** (CC-B) · *live readiness* — a deploy must not outrun CI
148. **#168** () · *live readiness* — with #681: CI catches a build that crashes on boot
149. **P19-B12** (CC-B) · *live readiness* — the deploy tool's own executable comes from the reviewed code

### Wave B2 — TRACK B · Risk controls and restart safety — fixed in paper, carried to live

150. **#634** (CC-B) · *live readiness* — the kill switch must not fail open
151. **#632** (CC-C) · *live readiness* — the daily-loss count survives a restart
152. **B-KILLSWITCH-DENOMINATOR** (CC-C) · *live readiness* — the kill switch's remaining legs
153. **B-TOTAL-DRAWDOWN-WARNING** (CC-C) · *live readiness* — a mark-to-market drawdown warning
154. **#519** (CC-B) · *live readiness* — the daily-loss trip fails loud
155. **B-TEC-PRIME-BOOT-RACE** (CC-B) · *live readiness* — restarts: the exit loop throws for a tick on open positions
156. **#521** (CC-B) · *live readiness* — restarts: nothing notices a dead engine
157. **B-ENGINE-STOP-DURATION-COLUMN** (CC-B) · *live readiness* — an engine stop reports failure when it worked
158. **#619** (CC-A) · *live readiness* — a restore from backup lacks seeded config
159. **B-DASHBOARD-AUTH-RACE** (CC-C) · *live readiness* — the portfolio card never recovers from a 401
160. **#296** (Kyle) · *live readiness* — one rate-limited path for placing and cancelling orders

### Wave B3 — TRACK B · The live engine — after Kyle's production-environment decision

161. **B-LEGACY-LIVE-EXIT-PATH** (CC-C) · *live readiness* — hard blocker: the legacy live exit route
162. **21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi** (CC-C) · *live readiness* — the engine-start health gate refuses live
163. **21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B-** () · *live readiness* — reset functions must not delete both modes' data
164. **19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr** () · *live readiness* — throwing asset-class lookups on the live path
165. **21.1 Live Mode Engine — - Create Live Mode trading engine based o** () · *live readiness* — build live on the paper engine (Option A)
166. **#322** (Kyle) · *live readiness* — test-in-paper / bypass-in-live switches
167. **P19-B6.10 retire the old per-mode guardrails table** (?) · *live readiness* — one source of guardrail values
168. **21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the "** () · *live readiness* — after P19-B6.10: the Live Guardrails tab
169. **#517** (CC-B) · *live readiness* — after rm:21.1: the live trade tables
170. **21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 —** () · *live readiness* — the live guardrails umbrella
171. **19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci** () · *live readiness* — entry-side failure modes (halts, splits, earnings)
172. **25-11a refuse a position larger than the visible book** (?) · *live readiness* — refuse a position larger than the visible book
173. **Protect live positions if our server dies** (Kyle) · *live readiness* — decide how live positions are protected if the server dies
174. **B-VENUE-RESTING-EXITS** (Kyle) · *live readiness* — after PROCESS-DEATH-FORM: build that protection
175. **B-KRAKEN-FEE-WATCH** (CC-B) · *live readiness* — notice when the exchange changes fees

### Wave B4 — TRACK B · Go-live preparation — last

176. **Provision the live Kraken API key** (Kyle) · *live readiness* — the live key: trade-only, no withdrawals, locked to the server
177. **Confirm the live fee schedule** (?) · *live readiness* — after KRAKEN-LIVE-KEY: confirm live fees
178. **25-16 Trade-size / concurrency / win-rate dynamic + starting-balan** () · *live readiness* — the trade-size / concurrency study at the real balance
179. **Day-one live money settings** (Kyle) · *live readiness* — after rm:25-16: Kyle sets the live money settings
180. **21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calib** (CC-C + Langston) · *live readiness* — the feed-reliability threshold (Analyst + Langston)
181. **21.2 Paper-to-Live Transition Testing — - Run parallel paper+live** () · *live readiness* — paper-to-live testing at small size
182. **19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M** () · *live readiness* — LAST: the go-live switch

## Running now — observation windows (7)

- **F-G-1** (Kyle) — venue price grid — deployed 2026-08-28, observation window open
- **B-FEED-MISMATCH-FIX** (CC-B) — deployed 2026-09-19; 300 taker closes or 21 days
- **B-REACH-BASELINE-ADJUST** (Kyle) — deployed 2026-09-20; 7-day rollback window
- **B-XSTOCK-FEE-CONTRACT** (Kyle) — deployed 2026-09-11; its 21-day window closes it
- **B-DEPLOY-DRIFT-LINE** (CC-A) — plan row 4.55 reads OPEN — OBSERVATION WINDOW (criterion 4 satisfied 2026-09-09)
- **B-INSTRUMENTS-OVER-RULES** (CC-A) — the code-search-tool usage measure runs 2026-09-18 → 10-02 (pre-registered)
- **8a-P4c increment 1 — the VTS xStock price instrument** (CC-C) — deployed bc199185e; window to 2026-09-30T00:00Z; pre-registered rules A-D then decide increments 2-3

## After live — 217

### AMR and machine learning — 31

- #608 (CC-B) — AMR work after live (Kyle 2026-09-28)
- #609 (CC-B) — AMR work after live (Kyle 2026-09-28)
- #610 (CC-B) — AMR stays watch-only until after live (Kyle 2026-09-28) — its sizing cannot touch trades before then
- #611 (CC-B) — AMR work after live (Kyle 2026-09-28)
- #612 (CC-B) — AMR work after live (Kyle 2026-09-28)
- B-AMR-CONTEXT-BONUS-REWIRE (CC-A) — Kyle 2026-09-28: all AMR work after live
- B-AMR-INPUT-INTEGRITY-ARC (CC-C) — Kyle 2026-09-28: AMR fixes after live; stalled since 2026-07-30 with no plan row — place it in the post-live section
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

### Break-even, trailing and moonbag exits — 5

- B-TEC-STATE-DURABILITY (?) — on restart the engine reads every open position's trailing progress from one /tmp file inside a catch-and-continue — a corrupt file boots with zero trailing pro
- Break-even stop + moonbag exits ((none)) — 
- Shadow break-even and moonbag calculations (paper now, live later) (?) — Kyle: launch with both off, but compute what break-even stops and moonbags WOULD have done on every paper trade (and live trades once live), so we can analyse w
- 16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directiv (—) — purge legacy trailing-percent exit code so it cannot re-enter a live exit
- row:3n.c (CC-C) — trailing-exit state lost on restart — becomes MUST the moment trailing exits are switched on (see BE-MOONBAG)

### Crew, reviewer, governance and alert tooling — 66

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
- #692 (CC-C) — Kyle 2026-09-28: not a defect (slots shrink with the balance by design; the 08-12 freeze was a one-step manual reset). Build instead an alert when no new trade 
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
- B-GOV-REPORTING (CC-A) — Langston memory size
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
- B-READ-MODEL-BLOB-VERIFY (Infra Claude) — the reviewer's pinned reads served the wrong file twice — a reviewer reading the wrong object weakens every review before live (Infra)
- B-REVIEWER-LOOP (CC-A) — plan row 4, PLACED 2026-08-28, open (CC-A lane reply) — governance tooling
- B-RULES-LAYER (CC-A) — Kyle-directed: move behavioural rules to a stronger layer — crew process
- B-SCRIPTS-TSC-COVERAGE (CC-B) — type-checking coverage for the scripts folder — tooling
- B-SHARED-TMP-ISOLATION (CC-B) — sessions share /tmp so a commit message can be another session's — crew tooling
- B-STATE-ASSERTION-LINT (CC-A) — sentences true when written and wrong now — governance tooling
- B-TOKENWATCH-OBSERVED-AT (CC-INFRA) — token watch tooling
- B-TOKENWATCH-PAIR-SELECT (CC-INFRA) — token watch tooling
- B-TSC-COVERS-TESTS (CC-C) — type-checking coverage for test files — tooling
- B-TSC-GUARD-DETERMINISM (CC-A) — CI type-check guard determinism — tooling
- B-UMBRELLA-OPEN-STATE (CC-B) — governance checker state for umbrella batches
- B-VENUE-QUIET-ALERTING (Kyle) — alert when a venue goes quiet — observability that matters once capital is exposed
- B-WAKE-SOURCE-TRUTH (CC-INFRA) — crew wake-source documentation
- B-WRITER-ACTOR-ALLOWLIST (CC-B) — Langston memory-tool actor names — reviewer tooling
- Stop appending closed-batch history to Langston's memory (Infra Claude) — every batch close appends to his memory and nothing evicts; keep current state and generalising rulings, evict by supersession
- 12.2 lookalike register (CC-A) — one page of the pairs that already caused wrong calls — FIRST BREAK by Langston's ruling
- 20.3 Test Infrastructure — - Add unified test runner scripts ( te (—) — test runner and frontend test tooling
- row:1 (CC-A) — crew-process rule mechanisms (B-RULES-1e) — governance tooling, no effect on trading

### Legacy and dead-code cleanup (the reachability census may pull some forward) — 21

- #1055 (—) — delete a dead legacy write on Langston's box
- #154 (—) — dead optional constructor argument
- #218 (—) — dead function carrying a hardcoded fee default
- #518 (CC-B) — delete a dormant commented-out guardrail block (rule 18)
- #528 (CC-B) — delete an unused 1,376-line trades page (rule 18)
- #537 (CC-B) — untracked orphan script
- #625 (CC-B) — orphan sweep lacks a branch for deadline keys
- #686 (CC-C) — relocate a runtime file out of bridge/canonical; its reader's scheduler is dead — no live effect (CC-C)
- B-ASSET-CAPS-REMOVAL (—) — open: delete an orphaned pre-governance service (orphan premise confirmed by census) — the dead-code reachability census decides if it moves
- B-ORPHAN-ROOT-SCANNER (CC-C) — dead code (disposition 5) — legacy removal, no live effect
- B-SCANNER-DEDUPE-DEAD-TABLE (CC-C) — dead table cleanup
- B-SQE-DEADCODE-PURGE (CC-A) — a dead SQE evaluator with a SHORTER gate list — delete before anything can call it
- B-TRADING-ENGINE-REMOVAL (CC-A) — delete the legacy TradingEngine that runs in neither mode (Kyle-ruled). The dead-code reachability census decides whether it is MUST
- B-WS-V1-RESIDUE-SWEEP (CC-C) — dead Kraken v1 ticker handler (rule 18)
- 16.2 Database Phase A-B: Isolation & Modularization — - Confirm w (—) — database isolation and modularisation — no live-safety effect (a proposed deferral: the run order puts Phase 16 before live)
- 16.3 Database Phase C: Schema Simplification — - Drop Wave 3 tabl (—) — drop legacy tables and enums — proposed deferral
- 16.4 Wave 7: Post-L-Series Cleanup — - SafetyGuardrails service r (—) — remove the old SafetyGuardrails service — only matters if any live path still consults it
- 16.5 LSP Error Resolution — - Delete legacy files causing LSP err (—) — editor/type error cleanup
- 16.8 Predictive-Learning / ML-Era Teardown REMAINDER (added 2026- (—) — ML-era teardown remainder — Kyle decided REMOVE
- 16.9 resetRateLimiter() — INERT ON THE ONLY ENVIRONMENT WE RUN (a (—) — inert rate-limiter reset — Kyle slotted it in Phase 16
- row:3n.b (CC-C) — orphan level tables (disposition 5) — legacy removal

### Other (research, UI, refactors) — 77

- #1020 (CC-A) — push guard inherits the previous call's working directory and refuses on a false zero (hit again building this draft)
- #148 (—) — health check permission error on a Replit-era path
- #150 (—) — make the RTB asset-class column NOT NULL after a zero-null soak
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
- #513 (CC-B) — maker target exits in the VTS lane
- #589 (CC-A) — the rule-18 cut never happened: getCalibratedProfit still defined, zero callers (CC-A, at the ref)
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
- B-GATE-GUARD (CC-A) — issue-number blocks
- B-GATE-WILDCARD-REFUSE (CC-B) — code-side guard behind a migration invariant that already refuses the bad row
- B-GDRIVE-UNMOUNT (Infra Claude) — placed 2026-08-28, not parked; owner Infra Claude; absorbs #921
- B-GOV-INTEGRITY-3 (CC-A) — message id spans
- B-HORIZON-GRID-COMPARABILITY (CC-B) — makes holding-horizon numbers comparable — precondition for the exit-policy evaluator
- B-LANGSTON-QUEUE-2 (CC-A) — review queue lock
- B-PRICE-DOC-CONSOLIDATE (Kyle) — merge two price documents into one — Kyle wants it done, but it is documentation
- B-QUOTE-PEG-DEVIATION-WATCH (CC-C) — watch for quote-peg deviation; its row says it gates nothing
- B-SLOT-PLACEMENT-CHECK (CC-A) — Kyle's own ask: a newly slotted item reaches the plan and the owning task list at the moment it is slotted — the failure this inventory is repairing by hand
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
- B-GOV-INTEGRITY-2 — parked by Kyle, deliberately undated
- B-RULES-1E-LANGSTON-SLIM — parked by Kyle, deliberately undated
- #392 — parked by Kyle, deliberately undated
- #668 — the governance-standardisation arc — a DIFFERENT thing from B-SIZING-DEC-RESTORE, which only cites it
- #693 — parked by Kyle, deliberately undated
- #741 — parked by Kyle, deliberately undated

