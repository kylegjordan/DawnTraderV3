# THE PUSH TO LIVE — the re-sorted list (Kyle's go-live rules, 2026-09-28)

**Kyle's rule:** everything needed to get paper to the point where the mechanics are sound and working as intended, the thresholds / gates / regimes / strategies / scores are tuned, the prices are right, paper tells the truth, we capture the data we mean to learn from, and paper trades profitably and consistently — plus the live-mode fixes, mixed into the same push. **Everything else goes after live.** No phase names: one list, prioritised next.

**In the push: 179** · **After live: 219** · **Running now (observation windows): 7** · **Parked by Kyle: 8** · awaiting owner confirmation: see the draft's UNCONFIRMED section.

| category | items |
|---|---:|
| 1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close) | 49 |
| 2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores | 31 |
| 3. Prices — the feed is correct and paper uses the right price for each job | 18 |
| 4. Paper tells the truth — no mistake that makes results look better or worse than they are | 13 |
| 5. Learning data — capturing what we intend to learn from | 26 |
| 6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment | 40 |
| 7. The evidence — trading profitably and consistently in paper | 2 |

> Source: `PRE_LIVE_INVENTORY_DRAFT.md` (Langston-approved r8) re-sorted by `scripts/inventory/sort.py`; Kyle's decisions in `scripts/inventory/kyle_decisions.json`. The order WITHIN each category is not yet the working order — prioritising the whole push is the next step.

## 1. Mechanics — the pipeline works as intended (filters, patterns, DBS, regimes, strategies, signals, SQE, RTB pool + refresh, open and close) — 49

- ★ **#204** (unowned) — xStock corrupt stop prices (units/scale) at 45 times the crypto rate — a live stop at a wrong scale is a real loss; may be fixed by the venue grid
- ★ **#233** (unowned) — drift score and volume z-score fed as fixed defaults on the active path — its own row says pre-go-live verification; Kyle's rule is no hardcoded fallbacks
- ★ **#235** (Kyle) — the full end-to-end runtime audit of the crypto active pipeline — rule 23's closing step of Phase 19
- ★ **#630** (CC-A) — the maker-order deadline has NEVER fired — the maker population in its proof window was empty. Live places resting maker orders with a deadline; exercise it once in paper before real capital (CC-A)
- ★ **B-BOOK-STATE-RESTART-DURABLE** (CC-C) — a restart empties the xStock guard and a false stop fired 12 seconds after a deploy — every live restart would risk one
- ★ **B-BOOK-STATE-RING-INDEPENDENT-BOUND** (CC-C) — xStock exit plausibility bound — a false stop in live is a real loss (#1065 was one)
- ★ **B-CLOSE-WRITER-COSTS** (CC-B) — a close can delete a position with no trade record, and one path books invented zero fees — the record Kyle judges by, and live accounting
- ★ **B-ENTRY-LEVEL-RECHECK** (CC-B) — nothing re-checks a signal's levels against the current price before the fill, on either class — in live a stale signal fills at a moved price
- ★ **B-EXIT-LATCH-INVESTIGATION** (CC-A) — AN INVESTIGATION: is the hold-past-target Kyle saw a labelling artefact or a live exit-evaluation defect? Kyle: 'make sure it's not a symptom of a much bigger and uglier problem' — the exit defect cannot be bucketed with
- ★ **B-EXIT-TICKER-LEG-ADAPTER-SIDES** (CC-C) — the exit path carries both sides of the price and cannot see them — needed to exit on the transactable side
- ★ **B-EXIT-TRIGGER-FILL-PARITY** (CC-C) — exits must fire on the price they would actually fill at — its own row says CRITICAL; wrong in live = wrong real exits
- ★ **B-GRID-LIVE-PATH-PARITY** (CC-C) — venue-grid rounding on the LIVE order path — the grid today covers the orchestrator path; an off-grid live order is rejected by the venue
- ★ **B-INTENT-ENTRY-PARITY** (CC-C) — two other entry routes bypass the grid, and #953 is the same two routes on the exit side
- ★ **B-LEARNING-SYSTEM-CENSUS** (Kyle) — #661: at least three older learning systems still wired, disposition unknown — anything that could still steer a live decision must be known before live (its own reason is a MUST predicate — Langston)
- ★ **B-MODE-PREDICATE-SWEEP** (CC-C) — three readers query closed trades directly and will mix live and paper P&L once live exists
- ★ **B-NONFIAT-QUOTE-DENOMINATION** (CC-C) — Kyle decided 2026-09-28: exclude plain currency pairs and non-dollar-priced crypto now, keep dollar-pegged coins — if the exclusion is small; the proper conversion goes after live
- ★ **B-RTB-REFRESH-CONSOLIDATE** (CC-A) — the net-EV backstop was removed on an incomplete evidence base — its own row says SAFETY-RELEVANT
- ★ **B-RTB-SIGNAL-IDENTITY** (CC-B) — the ready-to-buy queue's identity carries no asset class — with tickers shared across classes (STX, STRK, DASH) the queue can confuse two instruments; takes its key from #1024
- ★ **B-SIZING-DEC-RESTORE** (CC-C) — paper sizing to Kyle's intent: balance = Kraken balance, up to 100% in trades, a consistent ~$140-150 per trade, 15-20 trades able to open; half-live today (obj-1/10/11 live, obj-2..5 not built). Analyst answering which setting caps slots now
- ★ **B-SYMBOL-CLASS-IDENTITY** (CC-C) — a ticker shared by a coin and an equity is one key today; DASH has real trades across both classes — Kyle-ruled 2026-09-09
- ★ **B-TARGET-FABRICATION** (CC-C) — signals given a default target the strategy never chose — trades on invented geometry
- ★ **B-UNIVERSE-REFRESH-ACTS** (CC-C) — blocks B-SYMBOL-CLASS-IDENTITY, which is MUST
- ★ **B-XSTOCK-BID-TRIGGER-RELAND** (CC-C) — put the xStock stop/target trigger back on the transactable bid — price-side fidelity for xStock exits
- ★ **Dead-code reachability census** (?) — 
- ★ **A resting order's deadline must run whether or not a price is usable** (CC-C) — on the PAPER lane, both classes, every price-refusal path skips the resting-order deadline check, so a rest can fill after a real system would have cancelled it; in live the order rests at the venue and a cancel needs no
- ★ **row:3h.b** (CC-C) — delete the dead exit limb before live so it cannot be reached — same family as the #953 hard blocker
- **#1033** (CC-C) — an absent volume is stored as zero — indistinguishable from a minute that genuinely traded nothing; the liquidity filter reads it
- **#166** (unowned) — TEC stale-cache fence still firing thousands of times
- **#199** (unowned) — no honest xStock volume feed, so volume confirmation was removed from xStock strategies
- **#522** (Kyle) — catch-site audit homed from the #530 fix — open
- **#566** (CC-B) — volatility measured with a lag
- **#570** (CC-C) — one RTB refresh bucket fires but does not refresh its signals
- **#574** (CC-A) — a fabricated VolNoise=0.3 in the live ranker's expectancy kernel — HELPFUL if still live; the 07-13 fix may or may not have covered it
- **#585** (CC-B) — the engine's auto-resume skips a malformed session row — exits keep running
- **#628** (CC-C) — its two SIZING sites ride B-SIZING-DEC-RESTORE; display sites can wait (CC-C)
- **#699** (CC-C) — does RTB promotion evict, or is the UI stale
- **#972** (CC-B) — owner CC-B per its own head
- **B-GUARD-COVERAGE-AUDIT** (CC-C) — audit which guards cover which paths
- **B-QUOTE-ADMISSION-LEGACY-SWEEP** (Kyle) — decide what the legacy allowed-pairs list is for
- **B-QUOTE-LEG-INTEGRITY** (CC-C) — writer-side assertion that quote legs are sane
- **B-SCAN-BREADTH-DECLINE** (CC-C) — a scheduled review of why the scanner sees so few pairs — breadth feeds selection
- **B-SCHEDULER-FIRST-TICK** (CC-A) — row 4.58 — scheduler first-tick behaviour; with a pre-read of ten unread market-scanner helpers
- **B-SILENT-STRATEGY-CENSUS** (CC-B) — three wired strategies have never been evaluated — more strategies alive means better selection
- **B-STRING-TRUTHINESS-GUARDS** (CC-C) — the class of guards that treat the string '0' as true — correctness hygiene
- **B-VENUE-PAIRS-REINIT** (CC-C) — re-read venue pair rules when they change — else a changed tick size refuses orders
- **Map EXIT_PATH_MACHINERY_AUDIT §10 items to their homes** (CC-C) — its surviving items are believed absorbed into 3n, 3h/3h.b and 3i; full coverage not yet proved; map item by item
- **Exclude plain-currency and non-dollar pairs** (Kyle) — 
- **Fix duplicated plan ids** (CC-A) — 
- **row:3m-ENUM** (CC-C) — volatility_edge's pattern-confirmed path is rejected by both sinks — a strategy path silently dead

## 2. Tuning — thresholds, gates, ranges, regimes, strategies, confidence and prediction scores — 31

- ★ **25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-0** (unowned) — NARROWED (Langston): state the Net Expectancy gate's measured accept/reject outcome on the population it actually ran on, population named. A full judgement verdict needs #596 first and is Phase 25
- **#149** (unowned) — per-class RTB refresh cadence calibration
- **#201** (unowned) — range_trade is starved at the decision substrate
- **#529** (Kyle) — B-STRATEGY-WEIGHT-INVESTIGATION — Kyle wanted it before the runtime audit; open
- **#588** (CC-A) — put a validated quality term back into the ranking — the ranking is the edge
- **#644** (CC-C) — a finding, not work; its decision (whether the exploration subsidy ending on its own is wanted) must be visible in calibration (CC-C)
- **#645** (CC-C) — the net-EV floor is one crypto-era constant exported to xStock
- **#648** (CC-A) — six of nineteen strategies have never traded (renumbered from #594) — part of the #596 ordering constraint
- **#914** (CC-C) — SPLIT: the price half is retired; the COST half (0.05% per leg) is Phase 25 work
- **B-EXCURSION-RECORD** (CC-B) — row 2.4g-3 — record how far each trade travelled, needed to set the remaining reach ceilings from evidence
- **B-EXIT-MAKER-VS-TAKER-REVIEW** (CC-B) — Kyle's observation: maker exits profitable, taker target exits negative — possibly a large P&L lever
- **B-FAMILY-POOL-REACHABILITY** (CC-C) — reachability inside the family pool
- **B-IDEAL-POOL-STARVATION** (CC-A) — #597: the ideal pool gets ~4-5% of slots against a nominal 70% — travels with #596 and #648 as a Phase 25 ordering constraint
- **B-PRICE-FLOOR-REVIEW** (CC-C) — Kyle decided 2026-09-28: replace the $0.25 floor with a real market-depth test (traded volume, number of trades, book depth, price step) so low-priced coins are not shut out; VTS shows them no worse than dearer coins
- **B-TARGET-MULTIPLE-VS-HORIZON** (CC-B) — the strategy floor/ceiling/reward-risk review is done (09-13, 09-20); what remains is moving the targets of strategies whose targets sit too far — tuning, no Kyle decision
- **B-RETIRED-SCORE-REMOVAL** (unowned) — remove retired scores — confirm nothing on the live ranking path still reads one
- **19.2 Audit & Debug — - Verify FinalScore, Hybrid Score, Confidenc** (unowned) — verify the scoring stack calculates correctly (FinalScore, Hybrid, Confidence, Regime Weight) — umbrella; split into concrete checks
- **25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice** (unowned) — crypto confidence-modifier calibration
- **25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** (unowned) — xStock entry-trigger sweep (data-capture gap #206)
- **25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** (unowned) — xStock faithful geometry reconstruction + stop-anchor replay
- **25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206) —** (unowned) — xStock per-strategy entry re-fit, ORB edge, vwap_bounce power test
- **25-15 DATA-BLOCKED STUDY (intraday-coverage gap) — HCE rejected-ar** (unowned) — does the Net Expectancy gate reject signals that would have won — was data-blocked; the learning lane's refused-signal record found in 3n.v may now unblock it
- **25-17 TARGET-GEOMETRY CALIBRATION — ALL 19 CANONICAL STRATEGIES, B** (unowned) — target geometry calibration across all 19 strategies, both classes
- **25-17b CRYPTO reach_atr_max DECISION — the reachability-ceiling que** (unowned) — crypto reach ceiling decision — strong_bull_trend was set in 3n.v; the remaining strategies are untested
- **25-18 friction_safety_buffer per-class evaluation (reorg-B2 delibe** (unowned) — per-class safety margin on the friction model
- **25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW** (unowned) — regime confidence-chain calibration
- **25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALI** (unowned) — per-strategy, per-class minimum reward-to-risk from win rates — partly delivered by 2.4g and 3n.v
- **25-26 Trade HOLD-TIME / timeframe study — do slower (multi-day) tr** (unowned) — do slower trades clear the fee wall — the fee wall is the main reason paper loses
- **25-3 §19.0.3 TFS sustainability gate value-scope decision Recalib** (unowned) — sustainability gate: recalibrate, re-target or retire
- **25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresh** (unowned) — SQE recalibration, with named sub-items
- **25-7 #94 B79.3 xStock equity-equivalent macro confidence modifier** (unowned) — xStock macro confidence modifiers (Kyle settled #94 here)

## 3. Prices — the feed is correct and paper uses the right price for each job — 18

- ★ **#506** (CC-B) — order-book subscriptions accumulate with no unsubscribe — a DEPENDENCY of B-BOOK-SUBSCRIPTION-REACH, which takes subscriptions from ~3 a day to a 35-41 symbol pool (Langston)
- ★ **B-BOOK-SUBSCRIPTION-REACH** (CC-C) — the order book is the preferred price source but is subscribed for ~3 coins a day against a 35-41 symbol pool (Kyle directive 2026-09-13)
- ★ **B-EQUITY-RECONNECT-STALL-TIMER** (CC-C) — a stalled xStock feed reconnect leaves live positions unwatched
- ★ **B-OHLC-FRAME-GUARD** (CC-C) — validate price bars at every producer — opened from a CRITICAL alert; a bad bar feeds every indicator
- ★ **B-PRICE-SIDE-BY-JOB** (CC-C) — buy on the ask, sell on the bid, for every job a price does — Kyle's test is fidelity to live trading. Since 2026-09-11 (r5) it CONTAINS the age-truth refusal, open-trade refresh, ticker trigger, two-cache decision and F
- ★ **B-PRICE-STALENESS-BOUND** (CC-C) — the last-known-good price is re-served with no age bound and re-stamped as fresh
- ★ **B-REST-SIDES-TO-CACHE** (CC-C) — the REST adapter parses bid and ask and then stores only the midpoint — the price-side rule needs the sides
- ★ **B-WS-SUBSCRIBE-CLASS-FILTER** (CC-A) — xStock positions reported 'unmanageable' because the crypto subscribe set is not class-filtered
- ★ **B-XSTOCK-LIVE-FEED** (CC-C) — both classes launch live together (D5); xStock live trading needs a correct live feed
- ★ **F-G-1 reopens: the OHLC writer can write an older bar over a newer one** (CC-C) — F-G-1's window closed 2026-09-04 (crypto PASS n=24, xStock underpowered n=19) and it REOPENS at Step 3: the OHLC writer's retry can write an OLDER bar over a NEWER one, and xStock 1-minute bars roll into the 15-minute sn
- ★ **row:6** (unowned) — F-C staleness bound — a bound on how old a price may be when it is used
- **B-CRYPTO-MARK-AGE-GATE** (CC-C) — crypto mark-age gate — its original premise was withdrawn; the rewritten row survives
- **B-DECIDED-INTENT-INDEX** (CC-C) — index of decided intents — groundwork for the exit-path redesign
- **B-POST-GRID-MUTATION-CENSUS** (Kyle) — investigation (no code): do stops get mutated off the grid after rounding
- **B-XSTOCK-ENTRY-COMPARATOR** (CC-C) — xStock entry-price comparator — price-truth lane
- **B-XSTOCK-SESSION-FRESHNESS** (CC-C) — CORRECTED (Langston): Kyle ruled 2026-09-03 — off-hours entries allowed at the same bar; exit freshness the same standard round the clock, 'we just hold'. Exit side: change nothing. Remaining: keep the alert's record but
- **Independent review of the pricing architecture (Codex)** (CC-C) — an independent review of the price layer before real capital; brief, prompt and findings register (r14) ready; was held for #1027, which is now fixed
- **row:7** (unowned) — F-D learning-lane accessor and isolation

## 4. Paper tells the truth — no mistake that makes results look better or worse than they are — 13

- ★ **row:8** (unowned) — F-E fill-integrity detector — catches a bad fill before it is booked
- **#419** (CC-B) — funnel counter will not balance under error rows
- **#527** (CC-B) — xStock eval cycle should pass friction components
- **#547** (CC-B) — Analyst's July soak findings — contents need the owner's read
- **#549** (CC-B) — four gaps in Open Trades fields
- **#561** (Kyle) — volume / order book not filling in Open Trades; rename the column for xStocks
- **#664** (CC-B) — a diagnostic computes 'strategies evaluated' from a hardcoded 9
- **B-COST-MATH-CONSOLIDATION** (CC-C) — one home for cost math
- **B-DIAG-READ-INTEGRITY** (CC-C) — diagnostics reads that took a status code for a body
- **B-FILTER-DIAG-XSTOCK** (CC-B) — xStock per-strategy decline table is empty — visibility into why xStock signals die
- **B-GRID-REFUSAL-RATE** (CC-C) — how often the venue grid refuses a signal — a symptom measurement
- **B-IMPLEMENTATION-SHORTFALL** (CC-C) — #603: no arrival price is persisted, so measured slippage mixes a stale signal with execution cost; 24 closed trades show a >1% intended-vs-fill gap (CC-C)
- **B-VALIDATE-OBSERVABILITY** (CC-C) — make validation failures visible

## 5. Learning data — capturing what we intend to learn from — 26

- ★ **B-OUTCOME-CORPUS-CAPTURE** (?) — 
- **#1072** (CC-C) — the crypto price-history recorder's symbol set is frozen — the same blind spot Langston hit today: not one euro-priced pair ever recorded
- **#220** (unowned) — an undefined-function error logged 64,494 times in VTS strategy execution
- **#231** (unowned) — ablation record id gap
- **#504** (CC-A) — stamp regime on maker/taker shadow rows — learning record
- **#515** (CC-B) — capture the remaining learning-record columns on the active path
- **#590** (CC-A) — calibration store reset at the formula change
- **#631** (CC-A) — should the active path archive the four entry-mode fields VTS does — a decision owed; the active lane is what goes live
- **#658** (CC-C) — VTS applying posture multipliers that were pinned off
- **B-ARCHIVE-WRITER-LIFECYCLE** (CC-C) — archive-writer lifecycle — integrity of the recorded history
- **B-CLOSED-TRADES-CLASS-BACKFILL** (CC-B) — historical closed trades all carry the default class — backfill after #1024
- **B-DECISION-INSTANT-QUOTE** (CC-C) — record the exact quote at the decision instant — measurement
- **B-EPOCH-PARITY-FENCE** (CC-C) — the epoch value still has two homes — learning-data integrity
- **B-EXIT-DECISION-RUNG-STAMP** (CC-C) — stamp which price rung an exit decision used — provenance
- **B-OBS-WINDOW-EVIDENCE-CAPTURE** (CC-C) — capture observation-window evidence at the event — measurement quality
- **B-PAPER-LANE-PROVENANCE** (CC-B) — paper lane records no decision inputs, so it cannot be replayed — pairs with the parity harness
- **B-PROVENANCE-LOSS-CENSUS** (CC-C) — where decision provenance is lost — measurement integrity
- **B-ROLLBACK-EPOCH-FORWARD** (CC-B) — calibration-epoch bookkeeping across a rollback — keeps learning data unmixed
- **B-TRADE-RECORD-JOINABILITY** (CC-B) — row 2.4g-4 — trade records that cannot be joined across stores, missing DI and a zero ATR on every xStock shadow row: the learning record Phase 25 calibrates from
- **B-VPNL-WRITER-BOUND** (CC-B) — a learning-record column is written unbounded and a mean taken from it reversed a published conclusion — calibration-record integrity
- **B-VTS-CLASS-LABEL-INTEGRITY** (CC-B) — backfill of mislabelled learning rows — only after the MUST key fix (#1024)
- **B-VTS-MARK-SIDE** (CC-C) — the learning lane's mark side — VTS is not live, but it is the calibration record
- **B-VTS-NO-DECISION-VALVE** (CC-C + Langston) — Kyle delegated 2026-09-28 to CC-C + Langston under the 09-03 price-side delegation; before live only if quick
- **T-W20C-SCALAR-LEG** (CC-B) — the parity harness — gates Phase 25's use of recorded decision history (25-12)
- **25-9 xStock pair_correlation per-pair WR data accumulation (B68.3** (unowned) — xStock per-pair correlation data accumulation
- **row:9** (unowned) — F-F(b) the reset gate — when the learning record restarts clean after the price fixes

## 6. Live-mode readiness — the live engine, risk controls on real money, security, the key, the environment — 40

- ★ **#168** (unowned) — CI cannot catch a build that crashes on boot — a live deploy that boots into a crash leaves positions unmanaged; same family as #681 (Langston)
- ★ **#296** (Kyle) — NARROWED (Langston): a shared rate budget and backoff on the order-PLACING and order-CANCELLING paths — a rate-limit rejection on an exit costs money. Consolidating the 35 clients is a refactor, AFTER
- ★ **#322** (Kyle) — test-in-paper / bypass-in-live capability gating — Kyle's live-mode creation requirement
- ★ **#517** (CC-B) — the Live page's open and closed trade tabs are stubs — the operator must be able to see live trades
- ★ **#519** (CC-B) — confirm the runtime daily-loss kill-switch trip fails loud, not silent
- ★ **#521** (CC-B) — the engine heartbeat is structurally dead — nothing notices a dead engine; in live that is real positions with no manager (Langston)
- ★ **#615** (CC-A) — the reviewer's verification identity can read the app's secrets file, and the live Kraken key will sit on that box (CC-A, Langston re-derived the read)
- ★ **#619** (CC-A) — a restore from backup silently lacks seeded config, including risk config — found only at the worst time (CC-A)
- ★ **#632** (CC-C) — the daily-loss count restarts at zero on every restart — Kyle 2026-09-28: fix now, the fix carries to production
- ★ **#634** (CC-B) — the daily-loss evaluator's failure counter has no reader: a persistent fault stops the kill switch evaluating while trading continues — fails open on a risk boundary (CC-C, re-derived at the ref). Owner CC-B
- ★ **#681** (CC-B) — a deploy can outrun CI — in live, a deploy restarts real trading on code that has not passed
- ★ **25-11a refuse a position larger than the visible book** (?) — 
- ★ **B-DASHBOARD-AUTH-RACE** (CC-C) — #903: the portfolio card 401s on load and never recovers — in live, an operator with no balance. Operator-reach family with #401, #517, #935 (Langston)
- ★ **B-ENGINE-STOP-DURATION-COLUMN** (CC-B) — an engine stop returns an error after 25 days of session even though it flattened — in live an operator must be able to trust a stop's report; a small fix
- ★ **B-KILLSWITCH-DENOMINATOR** (CC-C) — the kill switch's remaining legs — Kyle placed it himself; the kill switch is the last line of capital protection
- ★ **B-SEC-HARDEN** (CC-A) — 157 of 216 state-changing routes carry no authorisation check (Infra count, NOT re-derived — it sizes the batch, not its placement). REACHABILITY re-derived by Langston on the box: the login is public (internet → Caddy :
- ★ **B-SSH-KEY-CENSUS (investigation)** (?) — two ungoverned SSH keys can log in as the account that owns the trading application; nobody knows whose they are. Kyle placed it at Phase-19 end: Phase 21 turns that box into the live path, and it is an hour. Remediation
- ★ **B-TEC-PRIME-BOOT-RACE** (CC-B) — On every restart the crypto exit loop throws on open positions for a tick — in live, every deploy leaves real positions unevaluated for that tick
- ★ **B-TOTAL-DRAWDOWN-WARNING** (CC-C) — a mark-to-market total-drawdown warning — Kyle-ruled 2026-09-09; a risk control on real capital
- ★ **B-VENUE-RESTING-EXITS** (Kyle) — a live position must have a protective mechanism that survives our process dying. The FORM is Kyle's decision (resting venue stops vs a flatten-on-death watchdog)
- ★ **Months of database headroom** (?) — 
- ★ **Provision the live Kraken API key** (Kyle) — 
- ★ **Confirm the live fee schedule** (?) — 
- ★ **P19-B6.10 retire the old per-mode guardrails table** (?) — 
- ★ **19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pr** (unowned) — throwing asset-class resolution call sites would break a live path IF still present
- ★ **19-9 B79.x failure-mode taxonomy — entry-side gap LULD halts / ci** (unowned) — entry-side failure modes (LULD halts, circuit breakers, splits, dividends, earnings) — its own text says required before live
- ★ **21-3a (NEW, P19-B6.8a 2026-06-30 — RUNNING_ISSUES #401): add the "** (unowned) — the Live Guardrails tab — and what it would show: the live guardrail row is an ELEVEN-MONTH-OLD DEFAULT (2025-10-29) that differs from paper on six fields (per-trade 30%, exposure 25%, 12 slots, kill switch 15%, risk per
- ★ **21-3c (NEW, KYLE-RULED 2026-08-21 — RUNNING_ISSUES #734): the engi** (CC-C) — the engine-start health gate refuses to start in live, for two independent reasons; fixing one alone leaves live blocked (#734)
- ★ **21-3d (NEW, KYLE-DIRECTED 2026-08-21 — B-BALANCE-TRUTH Step G / B-** (unowned) — the reset functions delete BOTH modes' data — must be scoped to one mode before live data exists (B-MODE-DELETE-SCOPE)
- ★ **21.1 Live Mode Engine — - Create Live Mode trading engine based o** (unowned) — the live mode engine itself
- ★ **B-LEGACY-LIVE-EXIT-PATH** (CC-C) — a live exit route places a real market order outside the governed path — the roadmap's own words: NO REAL CAPITAL TRADES UNTIL THIS IS CLOSED (#953, owner CC-C)
- ★ **21.2 Paper-to-Live Transition Testing — - Run parallel paper+live** (unowned) — paper-to-live transition testing with small sizes
- ★ **21.3 Live Mode Guardrails — - 21-3a (NEW, P19-B6.8a 2026-06-30 —** (unowned) — live mode guardrails — umbrella; its sub-items 21-3a..d are listed separately
- ★ **25-16 Trade-size / concurrency / win-rate dynamic + starting-balan** (unowned) — the evidence study for trade size, concurrency and starting balance — its own row calls it a go-live prerequisite. The NUMBERS it informs are Kyle's (a DECIDE)
- **B-KRAKEN-FEE-WATCH** (CC-B) — the venue changed fees on 07-09 and we noticed on 09-06 — in live, a stale fee is a wrong EV gate
- **Day-one live money settings** (Kyle) — Kyle 2026-09-28: live settings stay as they are until the live-mode work; set them then
- **P19-B12** (CC-B) — the deploy tool's own executable is not derived from the reviewed ref
- **Protect live positions if our server dies** (Kyle) — parked with the live-mode work: resting stops at the exchange vs a flatten-on-death watchdog
- **19-17b ITEM-4 step 3 standing note (2026-06-10): Phase-21 go-live M** (unowned) — the go-live switch itself — the last step
- **21-3b (NEW, P19-B6.9 2026-06-30 — RUNNING_ISSUES #398/#396): calib** (CC-C + Langston) — Kyle delegated 2026-09-28 to CC-C + Langston: the go-live price-feed reliability threshold

## 7. The evidence — trading profitably and consistently in paper — 2

- ★ **19-11 §19.1 Paper Trading Run The act of actually running paper-ac** (unowned) — THE PAPER RUN ITSELF — it is the evidence Kyle's comfortable-in-paper gate is judged on
- **Define 'comfortable in paper' in numbers** (CC-C + Langston) — Kyle's shape: profitable consistently over a sustained period, the major tuning done, the mechanics confirmed end to end; CC-C + Langston propose the numbers for his approval

★ = was on the must-before-live list; the rest were 'extremely helpful' or moved up by your rules.

## Running now — observation windows (7)

- **F-G-1** (Kyle) — venue price grid — deployed 2026-08-28, observation window open
- **B-FEED-MISMATCH-FIX** (CC-B) — deployed 2026-09-19; 300 taker closes or 21 days
- **B-REACH-BASELINE-ADJUST** (Kyle) — deployed 2026-09-20; 7-day rollback window
- **B-XSTOCK-FEE-CONTRACT** (Kyle) — deployed 2026-09-11; its 21-day window closes it
- **B-DEPLOY-DRIFT-LINE** (CC-A) — plan row 4.55 reads OPEN — OBSERVATION WINDOW (criterion 4 satisfied 2026-09-09)
- **B-INSTRUMENTS-OVER-RULES** (CC-A) — the code-search-tool usage measure runs 2026-09-18 → 10-02 (pre-registered)
- **8a-P4c increment 1 — the VTS xStock price instrument** (CC-C) — deployed bc199185e; window to 2026-09-30T00:00Z; pre-registered rules A-D then decide increments 2-3

## Worth a second look before they go after live

- **RULINGS-DURABILITY** — cheap, and a lost file cannot be rebuilt (Langston placed it FIRST BREAK)
- **COLTRANE-PARITY** — needed only if the Coltrane implementor trial goes ahead
- **#221** — parked by Kyle — but both asset classes launch together, so how the RTB ranks crypto against xStock signals may matter for selection

## After live — 219

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

### Crew, reviewer, governance and alert tooling — 68

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
- Coltrane parity: a privacy check like Langston's (Infra Claude) — no Coltrane privacy check exists; a precondition for the implementor trial
- Stop appending closed-batch history to Langston's memory (Infra Claude) — every batch close appends to his memory and nothing evicts; keep current state and generalising rulings, evict by supersession
- 12.2 lookalike register (CC-A) — one page of the pairs that already caused wrong calls — FIRST BREAK by Langston's ruling
- 12.1 rulings-durability fix (CC-A) — Langston's ~3,028 rulings sit in one file on one box outside git — Langston placed it FIRST BREAK: irreversible loss, cheapest row on the list
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

## Parked by Kyle — 8 (unchanged)

- B-ALERT-DEDUPE-REASON-DRIFT — parked by Kyle, deliberately undated
- B-GOV-INTEGRITY-2 — parked by Kyle, deliberately undated
- B-RULES-1E-LANGSTON-SLIM — parked by Kyle, deliberately undated
- #221 — parked by Kyle, deliberately undated
- #392 — parked by Kyle, deliberately undated
- #668 — the governance-standardisation arc — a DIFFERENT thing from B-SIZING-DEC-RESTORE, which only cites it
- #693 — parked by Kyle, deliberately undated
- #741 — parked by Kyle, deliberately undated

