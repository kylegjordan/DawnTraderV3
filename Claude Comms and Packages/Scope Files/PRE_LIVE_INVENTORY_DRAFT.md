# PRE-LIVE INVENTORY — CATEGORISED DRAFT (for Langston's review, then Kyle)

**Kyle, 2026-09-23:** everything left in Phase 19 and planned for 25, 16, 20 and 21, deduped, then bucketed MUST before live / EXTREMELY HELPFUL before live / AFTER live. Kyle picks the pre-live set; then the roadmap and all four task lists are reorganised and every item assigned a session, including a trial of Coltrane as an implementor.

**Home:** `PHASE_19_PLAN` row 3n.x (owner CC-B). **Working file (raw extraction):** `PRE_LIVE_INVENTORY_WORKING.md`.

## HOW TO READ THIS
- **The run order already puts everything before live (Kyle 2026-06-08: 19 → 25 → 16+20 → 21, strictly sequential).** So `AFTER` here is a **proposed deferral** that Kyle has to approve, not a default. The burden is on the deferral (Langston's framing, adopted).
- **`MUST` is anchored to roadmap §3.5's own hard-blocker list (group A), then extended to what must be true for (1) Kyle to judge paper honestly and (2) real capital not to be at risk on day one.** Every MUST beyond group A is my judgement and says why in one line.
- **`HELPFUL` = extremely helpful before live.** Mostly calibration and selection quality (paper still loses; these are how it stops), plus visibility.
- **`DECIDE` = not work until Kyle rules.** **`OBSERVATION` = already deployed; its window closes it.** **`MERGE` = the same work as another item.** **`PRUNE` = done, superseded, withdrawn, or an umbrella heading.**
- **⚠️ verify** = my read of the record; the owning session must confirm before the item moves.
- **Not yet in:** replies from OLD, ANALYST and Infra Claude (lane review, items never written down, and what Coltrane can actually touch), and Langston's full archive sweep. First tranche of his archive is in.

| bucket | items |
|---|---:|
| MUST | 66 |
| DECIDE | 6 |
| OBSERVATION | 4 |
| HELPFUL | 127 |
| AFTER | 150 |
| KYLE-PARKED | 10 |
| MERGE | 53 |
| PRUNE | 192 |
| **total** | **608** |

## MUST BEFORE LIVE — 66 items, as a Phase-21 entry gate (PHASE_19_PLAN §6 form)

> ⚠️ Roadmap §3.5's preamble still lists #213 as pending; it was resolved 2026-06-13 (`59d501fc4`). Not carried.

### A. Roadmap hard blockers — already written as blockers, in those words (roadmap §3.5)

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 1 | **B-LEGACY-LIVE-EXIT-PATH** `21.1.a` #953 | — | a live exit route places a real market order outside the governed path — the roadmap's own words: NO REAL CAPITAL TRADES UNTIL THIS IS CLOSED (#953, owner CC-C) | ⏳ |
| 2 | **21-3a Live Guardrails tab** #401 | — | the Live Guardrails tab — live guardrail values in the database that no screen shows or edits today (#401, #667) | ⏳ |
| 3 | **21-3b go-live WebSocket-uptime threshold** #398 | — | set the go-live WebSocket-uptime threshold against the rolling window it is measured over — a calibration call | ⏳ |
| 4 | **21-3c engine-start health gate refuses live** #734 | — | the engine-start health gate refuses to start in live, for two independent reasons; fixing one alone leaves live blocked (#734) | ⏳ |
| 5 | **21-3d B-MODE-DELETE-SCOPE** | — | the reset functions delete BOTH modes' data — must be scoped to one mode before live data exists (B-MODE-DELETE-SCOPE) | ⏳ |
| 6 | **19-17b live_engine_enabled switch-on** | — | switch live_engine_enabled on as a number at go-live — the live start path is gated on it | ⏳ |

### B. Building live mode itself

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 7 | **21.1 Live Mode Engine** | — | the live mode engine itself | ⏳ |
| 8 | **21.2 Paper-to-Live Transition Testing** | — | paper-to-live transition testing with small sizes | ⏳ |
| 9 | **21.3 Live Mode Guardrails** | — | live mode guardrails — umbrella; its sub-items 21-3a..d are listed separately | ⏳ |
| 10 | **#322** | Kyle | test-in-paper / bypass-in-live capability gating — Kyle's live-mode creation requirement | ⏳ |
| 11 | **#517** | CC-B | the Live page's open and closed trade tabs are stubs — the operator must be able to see live trades | ⏳ |
| 12 | **19-10 #139 vts-runner throwing resolveAssetClass call sites 10+ pre-existing** #139 | — | throwing asset-class resolution call sites would break a live path IF still present ⚠️ *verify* | ⏳ |

### C. Risk controls on real capital

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 13 | **B-KILLSWITCH-DENOMINATOR** `4.b` #618 | Kyle | the kill switch's remaining legs — Kyle placed it himself; the kill switch is the last line of capital protection | ⏳ |
| 14 | **B-TOTAL-DRAWDOWN-WARNING** `3z` | CC-C | a mark-to-market total-drawdown warning — Kyle-ruled 2026-09-09; a risk control on real capital | ⏳ |
| 15 | **#519** | CC-B | confirm the runtime daily-loss kill-switch trip fails loud, not silent | ⏳ |
| 16 | **B-SIZING-DEC-RESTORE** #665 #666 #668 | CC-C | paper per-trade allocation is 20% where the governed decision says 6.67%, and Kyle did not know — position sizing on real capital | ⏳ |
| 17 | **25-8 #153 xStock pattern_max_position_pct 0.50 placeholder validation The 0** #153 | — | xStock position cap 0.50 is an inherited PLACEHOLDER — a position-size limit on real capital cannot be a placeholder | ⏳ |
| 18 | **25-11 Order-book / liquidity-aware position sizing + thin-market exit** | — | size to the order book and exit a thin market — with real capital a position larger than the book cannot be exited at the modelled price; a risk control, not an edge | ⏳ |
| 19 | **25-16 Trade-size / concurrency / win-rate dynamic + starting-balance sensiti** #408 | — | trade size, concurrency and STARTING BALANCE — its own row calls it a go-live prerequisite: the day-one balance and concurrency must be evidence-backed | ⏳ |
| 20 | **B-VENUE-RESTING-EXITS** #563 | Kyle | our protective stop exists only while our process runs — if the server dies, a live position has no stop at the exchange | ⏳ |
| 21 | **19-9 B79.x failure-mode taxonomy** | — | entry-side failure modes (LULD halts, circuit breakers, splits, dividends, earnings) — its own text says required before live | ⏳ |
| 22 | **B-NONFIAT-QUOTE-DENOMINATION** `5.a` #966 | Kyle | pairs quoted in a non-fiat currency — sizing and P&L are wrong if treated as USD, unless such pairs are excluded from trading ⚠️ *verify* | ⏳ |
| 23 | **20.4.6 TRADEABLE-UNIVERSE BOUNDARY** #937 | — | pure fiat currency pairs (USD/CAD, EUR/USD) are admitted to the crypto universe — its own row calls it a pre-live guardrail | ⏳ |

### D. Price truth — how old, which side, is the feed alive

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 24 | **B-PRICE-AGE-TRUTH** `3b.f` #951 | CC-C | an honest age on every price — acting on a stale price in live is a real-money error | ⏳ |
| 25 | **B-PRICE-AGE-REFUSAL** `3b.f-b` | CC-C | refuse to act on a price that is too old — the live counterpart of the age stamp | ⏳ |
| 26 | **B-TWO-CACHE-INTENT** `3b.l` #971 | Kyle | decide what the two price caches are for — it gates B-PRICE-AGE-REFUSAL, which is MUST | ⏳ |
| 27 | **B-PRICE-STALENESS-BOUND** #743 | CC-C | the last-known-good price is re-served with no age bound and re-stamped as fresh | ⏳ |
| 28 | **row:6** | — | F-C staleness bound — a bound on how old a price may be when it is used | ⏳ |
| 29 | **B-OPENTRADE-REFRESH-LANE** `3b.f-a` #977 | CC-C | open positions' prices must refresh — Kyle placed it himself, 2026-08-31 | ⏳ |
| 30 | **B-XSTOCK-SESSION-FRESHNESS** `3b.f-c` | Kyle | exit checks outside US regular hours are skipped on a flat ceiling, leaving positions unwatched; the ENTRY half is a Kyle decision (trade outside regular hours or not) | ⏳ |
| 31 | **B-EQUITY-RECONNECT-STALL-TIMER** `3b.f-e` | CC-C | a stalled xStock feed reconnect leaves live positions unwatched | ⏳ |
| 32 | **B-XSTOCK-LIVE-FEED** `3b.e` #950 | CC-C | both classes launch live together (D5); xStock live trading needs a correct live feed ⚠️ *verify* | ⏳ |
| 33 | **B-WS-SUBSCRIBE-CLASS-FILTER** #559 | CC-A | xStock positions reported 'unmanageable' because the crypto subscribe set is not class-filtered ⚠️ *verify* | ⏳ |
| 34 | **B-OHLC-FRAME-GUARD** `3b.h-6` #1028 #1029 #1030 | CC-C | validate price bars at every producer — opened from a CRITICAL alert; a bad bar feeds every indicator | ⏳ |
| 35 | **B-PRICE-SIDE-BY-JOB** `3n` | CC-C | buy on the ask, sell on the bid, for every job a price does — Kyle's test is fidelity to live trading | ⏳ |
| 36 | **B-REST-SIDES-TO-CACHE** `3n.l` #1056 | CC-C | the REST adapter parses bid and ask and then stores only the midpoint — the price-side rule needs the sides | ⏳ |
| 37 | **B-BOOK-SUBSCRIPTION-REACH** `3n.m` #1060 | CC-C | the order book is the preferred price source but is subscribed for ~3 coins a day against a 35-41 symbol pool (Kyle directive 2026-09-13) | ⏳ |
| 38 | **B-TICKER-BBO-TRIGGER** `3b.h-1` #1017 | CC-C | trigger exits on the ticker's best bid/ask — prerequisite for the price-side rule | ⏳ |

### E. Entry and exit correctness

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 39 | **B-EXIT-TRIGGER-FILL-PARITY** `3b.c` #954 #959 | Kyle | exits must fire on the price they would actually fill at — its own row says CRITICAL; wrong in live = wrong real exits | ⏳ |
| 40 | **F-G-2** `3c` #915 | Kyle | exits booked on the side a counterparty fills — crypto half shipped (8a-P3); the xStock half is still open | ⏳ |
| 41 | **B-EXIT-TICKER-LEG-ADAPTER-SIDES** `3n.p` | CC-C | the exit path carries both sides of the price and cannot see them — needed to exit on the transactable side | ⏳ |
| 42 | **B-XSTOCK-BID-TRIGGER-RELAND** `3n.q7` | CC-C | put the xStock stop/target trigger back on the transactable bid — price-side fidelity for xStock exits | ⏳ |
| 43 | **B-BOOK-STATE-RING-INDEPENDENT-BOUND** `3n.q5` | CC-C | xStock exit plausibility bound — a false stop in live is a real loss (#1065 was one) | ⏳ |
| 44 | **B-BOOK-STATE-RESTART-DURABLE** `3n.q8` #1066 | CC-C | a restart empties the xStock guard and a false stop fired 12 seconds after a deploy — every live restart would risk one | ⏳ |
| 45 | **B-ENTRY-LEVEL-RECHECK** `3n.u2` | CC-B | nothing re-checks a signal's levels against the current price before the fill, on either class — in live a stale signal fills at a moved price | ⏳ |
| 46 | **B-GRID-LIVE-PATH-PARITY** `3g` #939 | CC-C | venue-grid rounding on the LIVE order path — the grid today covers the orchestrator path; an off-grid live order is rejected by the venue | ⏳ |
| 47 | **B-INTENT-ENTRY-PARITY** `3h` #928 #929 | CC-C | two other entry routes bypass the grid, and #953 is the same two routes on the exit side | ⏳ |
| 48 | **row:3h.b** | CC-C | delete the dead exit limb before live so it cannot be reached — same family as the #953 hard blocker ⚠️ *verify* | ⏳ |
| 49 | **B-TARGET-FABRICATION** `3i` #927 #930 | CC-C | signals given a default target the strategy never chose — trades on invented geometry | ⏳ |
| 50 | **#204** | — | xStock corrupt stop prices (units/scale) at 45 times the crypto rate — a live stop at a wrong scale is a real loss; may be fixed by the venue grid ⚠️ *verify* | ⏳ |
| 51 | **#233** | — | drift score and volume z-score fed as fixed defaults on the active path — its own row says pre-go-live verification; Kyle's rule is no hardcoded fallbacks ⚠️ *verify* | ⏳ |
| 52 | **row:8** | — | F-E fill-integrity detector — catches a bad fill before it is booked | ⏳ |
| 53 | **B-CLOSE-WRITER-COSTS** `3n.u3` | CC-B | a close can delete a position with no trade record, and one path books invented zero fees — the record Kyle judges by, and live accounting | ⏳ |

### F. Knowing which instrument and which mode a record belongs to

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 54 | **B-SYMBOL-CLASS-IDENTITY** `3b.h-4` #1006 #1024 | CC-C | a ticker shared by a coin and an equity is one key today; DASH has real trades across both classes — Kyle-ruled 2026-09-09 | ⏳ |
| 55 | **B-UNIVERSE-REFRESH-ACTS** `3b.h-2` #1018 | CC-C | blocks B-SYMBOL-CLASS-IDENTITY, which is MUST | ⏳ |
| 56 | **B-RTB-SIGNAL-IDENTITY** `2.4c` #1006 #1046 | CC-B | the ready-to-buy queue's identity carries no asset class — with tickers shared across classes (STX, STRK, DASH) the queue can confuse two instruments; takes its key from #1024 | ⏳ |
| 57 | **B-MODE-PREDICATE-SWEEP** #736 | CC-C | three readers query closed trades directly and will mix live and paper P&L once live exists | ⏳ |

### G. The evidence Kyle's comfortable-in-paper judgement rests on

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 58 | **19-11 §19.1 Paper Trading Run The act of actually running paper-active for a** | — | THE PAPER RUN ITSELF — it is the evidence Kyle's comfortable-in-paper gate is judged on | ⏳ |
| 59 | **#235** | Kyle | the full end-to-end runtime audit of the crypto active pipeline — rule 23's closing step of Phase 19 | ⏳ |
| 60 | **25-19 Net-Expectancy gate JUDGMENT-QUALITY validation (Kyle 2026-06-21; RUNN** #370 | — | validate the Net Expectancy gate's judgement — it is the gate that decides which trades get real money (Kyle: 'we have to look at its judgment skills') | ⏳ |
| 61 | **B-RTB-REFRESH-CONSOLIDATE** #535 | CC-A | the net-EV backstop was removed on an incomplete evidence base — its own row says SAFETY-RELEVANT | ⏳ |

### H. Security and operations

| # | gate | owner | why it must be true before live | status |
|---:|---|---|---|---|
| 62 | **B-SEC-HARDEN** #1022 #1023 | CC-INFRA | 157 of 216 state-changing routes have no authorisation check — security before real capital | ⏳ |
| 63 | **#935** | CC-C | any five failed logins lock EVERY user out — in live that includes Kyle reaching the stop controls ⚠️ *verify* | ⏳ |
| 64 | **#296** | Kyle | 35 separate Kraken clients instead of one rate-limited client — live orders must not trip the venue's rate limit | ⏳ |
| 65 | **#681** | CC-B | a deploy can outrun CI — in live, a deploy restarts real trading on code that has not passed | ⏳ |
| 66 | **B-ENGINE-STOP-DURATION-COLUMN** `3n.u4` #1067 | CC-B | an engine stop returns an error after 25 days of session even though it flattened — in live an operator must be able to trust a stop's report; a small fix | ⏳ |

## DECIDE — Kyle rules before these become work — 6

**Phase 19**

- **B-VTS-NO-DECISION-VALVE** `3n.q3` #1073 (CC-C) — Kyle's policy call: time-bound a refused learning-lane exit, or loosen the spread ceiling (Langston recommends time-bound)
- **B-PRICE-FLOOR-REVIEW** `5.b` #967 (Kyle) — minimum-price floor for tradeable symbols — its row says the decision is Kyle's
- **19-18 NEW** (unowned) — live-mode build approach (copy of paper + switch, or other) — a decision that must land before Phase 21
- **Break-even stop + moonbag trailing exits** ((none)) — Config-locked OFF on all four classes by two independent switches; 542 active closes, 0 ever latched. Kyle's 2026-06-11 directive wants a per-mode, per-class set — it has no plan row and no owner. Decide: launch live with them OFF (plain stop and target), or build and switch them on first.

**Task list only**

- **B-TARGET-MULTIPLE-VS-HORIZON** (CC-B) — row 2.4g-5 — Kyle decides, gated on 2.4g-3

**Open issue with no plan row**

- **#323** (Kyle) — Kyle: should the daily-loss budget auto-stop, only alert, or be user-set

## OBSERVATION — deployed, running out their windows — 4

**Phase 19**

- **F-G-1** `3` #918 #921 (Kyle) — venue price grid — deployed 2026-08-28, observation window open
- **B-FEED-MISMATCH-FIX** `3n.u` (CC-B) — deployed 2026-09-19; 300 taker closes or 21 days
- **B-REACH-BASELINE-ADJUST** `3n.v` (Kyle) — deployed 2026-09-20; 7-day rollback window
- **B-XSTOCK-FEE-CONTRACT** `2.4-FEE` #1010 #1041 (Kyle) — deployed 2026-09-11; its 21-day window closes it

## EXTREMELY HELPFUL BEFORE LIVE — 127

**Phase 19**

- **B-ROLLBACK-EPOCH-FORWARD** `3b.b-c` #1045 (CC-B) — calibration-epoch bookkeeping across a rollback — keeps learning data unmixed
- **B-OBS-WINDOW-EVIDENCE-CAPTURE** `3b.f-d` #1044 (CC-C) — capture observation-window evidence at the event — measurement quality
- **B-XSTOCK-ENTRY-COMPARATOR** `3b.b-b` #996 (CC-C) — xStock entry-price comparator — price-truth lane ⚠️ *verify*
- **B-VENUE-QUIET-ALERTING** `3b.f-d` #526 (Kyle) — alert when a venue goes quiet — observability that matters once capital is exposed
- **B-DECIDED-INTENT-INDEX** `3b.g` #956 (CC-C) — index of decided intents — groundwork for the exit-path redesign
- **B-EXIT-BOOK-AGE-STAMP** `3b.h` #961 (CC-C) — stamp the exit book's age — changes no behaviour, measurement only
- **B-VTS-MARK-SIDE** `3n.0` (CC-C) — the learning lane's mark side — VTS is not live, but it is the calibration record
- **B-FUTURES-BAR-FINAL** `3b.h-7` #1030 (CC-C) — futures bar finality — perps are post-live, but check whether any live-class signal reads these bars ⚠️ *verify*
- **B-ARCHIVE-WRITER-LIFECYCLE** `3b.h-8` #1032 #1034 #1036 (CC-C) — archive-writer lifecycle — integrity of the recorded history
- **B-PROVENANCE-LOSS-CENSUS** `3b.m` #976 (CC-C) — where decision provenance is lost — measurement integrity
- **B-GUARD-COVERAGE-AUDIT** `3e` #919 (CC-C) — audit which guards cover which paths
- **B-VALIDATE-OBSERVABILITY** `3f` #922 (CC-C) — make validation failures visible
- **B-POST-GRID-MUTATION-CENSUS** `3f.b` #923 (Kyle) — investigation (no code): do stops get mutated off the grid after rounding
- **B-STRING-TRUTHINESS-GUARDS** `3i.b` #930 (CC-C) — the class of guards that treat the string '0' as true — correctness hygiene
- **B-VENUE-PAIRS-REINIT** `3k` #933 #934 (CC-C) — re-read venue pair rules when they change — else a changed tick size refuses orders
- **row:3m-ENUM** (CC-C) — volatility_edge's pattern-confirmed path is rejected by both sinks — a strategy path silently dead
- **row:3n.c** (CC-C) — trailing-exit state lost on restart — becomes MUST the moment trailing exits are switched on (see BE-MOONBAG)
- **B-GRID-REFUSAL-RATE** `3n.d` (CC-C) — how often the venue grid refuses a signal — a symptom measurement
- **B-QUOTE-PEG-DEVIATION-WATCH** `3n.g` (CC-C) — watch for quote-peg deviation; its row says it gates nothing
- **B-QUOTE-LEG-INTEGRITY** `3n.h` #1050 (CC-C) — writer-side assertion that quote legs are sane
- **B-QUOTE-ADMISSION-LEGACY-SWEEP** `3n.i` #937 (Kyle) — decide what the legacy allowed-pairs list is for
- **B-HORIZON-GRID-COMPARABILITY** `3n.j` (CC-B) — makes holding-horizon numbers comparable — precondition for the exit-policy evaluator
- **B-FAMILY-POOL-REACHABILITY** `3n.k` #1052 (CC-C) — reachability inside the family pool
- **B-DECISION-INSTANT-QUOTE** `3n.n` #1060 (CC-C) — record the exact quote at the decision instant — measurement
- **B-EXIT-LINE-IDENTITY** `3n.q4` (CC-C) — trade id and class on the exit log line, so a close is read by identity
- **B-EXIT-DECISION-RUNG-STAMP** `3n.q6` #1064 (CC-C) — stamp which price rung an exit decision used — provenance
- **B-VTS-CLASS-LABEL-INTEGRITY** `3n.v2` #1068 (CC-C) — backfill of mislabelled learning rows — only after the MUST key fix (#1024)
- **B-GATE-WILDCARD-REFUSE** `3n.v3` #1069 (CC-B) — code-side guard behind a migration invariant that already refuses the bad row
- **B-SILENT-STRATEGY-CENSUS** `3n.v4` #1070 (CC-B) — three wired strategies have never been evaluated — more strategies alive means better selection
- **B-EXIT-MAKER-VS-TAKER-REVIEW** `3n.w` (CC-B) — Kyle's observation: maker exits profitable, taker target exits negative — possibly a large P&L lever
- **B-CRYPTO-MARK-AGE-GATE** `3n.o` (CC-C) — crypto mark-age gate — its original premise was withdrawn; the rewritten row survives
- **row:7** (unowned) — F-D learning-lane accessor and isolation
- **row:9** (unowned) — F-F(b) the reset gate — when the learning record restarts clean after the price fixes ⚠️ *verify*
- **B-KRAKEN-FEE-WATCH** `2.4-FEE-b` #1011 (CC-B) — the venue changed fees on 07-09 and we noticed on 09-06 — in live, a stale fee is a wrong EV gate
- **T-W20C-SCALAR-LEG** `2.4-FEE-c` (CC-B) — the parity harness — gates Phase 25's use of recorded decision history (25-12)
- **B-PAPER-LANE-PROVENANCE** `2.4-FEE-c-ii` #1059 (CC-B) — paper lane records no decision inputs, so it cannot be replayed — pairs with the parity harness
- **B-FILTER-DIAG-XSTOCK** `2.4-FEE-d` #682 #684 (CC-B) — xStock per-strategy decline table is empty — visibility into why xStock signals die
- **19-13 §19.3 Performance Validation Latency, throughput, queue depth, cadence** (unowned) — latency / throughput / cadence under load — matters more as volume grows than on day one
- **19-16 B79.6 sector-aware portfolio-cluster prevention Equities cluster by se** (unowned) — sector-cluster prevention — correlated xStock positions multiply risk; concurrency caps bound it today
- **19-17 NEW** (unowned) — active-trading simulations — more learning data per day for Phase 25; not a live-safety need
- **19.2 Audit & Debug** (unowned) — verify the scoring stack calculates correctly (FinalScore, Hybrid, Confidence, Regime Weight) — umbrella; split into concrete checks
- **19.6 External Source Connection & Capacity Diagnostics Dashboard (NEW 2026-** (unowned) — external-source and capacity diagnostics dashboard — visibility that catches a live problem fast
- **19.6.6 Internal subsystem health + EARLY-FAILURE detection (NEW 2026-06-12, K** (unowned) — early-failure detection — catch failures in progress; high value once real capital is exposed
- **B-VOLATILITY-CACHE-RETIRE** `2.10 / status board` (CC-B) — Retire the dead volatility cache and its 0.015 fallback (rule 18). Two riders from Langston: the live fail-loud path has never been exercised, and a `?? 0.5` default in the RTB service is an untested hypothesis.
- **P19-B6.10 — retire the old per-mode guardrails table** `plan history table` (?) — The old guardrails table and its deprecated endpoint are superseded by the new one; before live there should be exactly one source of guardrail values. ⚠️ *verify*
- **Two plan-identity collisions** (CC-A) — Row 3b.f-d names two different batches, and P19-B12 is both the §19.6 dashboard container and the dt-deploy executable issue. Fix during the reorganisation step, or items get lost.

**Phase 25**

- **25-2 §19.0.A Regime classifier confidence-chain calibration B-NEW-33/36/37/** (unowned) — regime confidence-chain calibration
- **25-3 §19.0.3 TFS sustainability gate value-scope decision Recalibrate / re-** (unowned) — sustainability gate: recalibrate, re-target or retire
- **25-4 §19.4 SQE Recalibration (B66 conditional) Rebuild SQE thresholds with** #502 (unowned) — SQE recalibration, with named sub-items
- **25-7 #94 B79.3 xStock equity-equivalent macro confidence modifiers xStock e** (unowned) — xStock macro confidence modifiers (Kyle settled #94 here)
- **25-9 xStock pair_correlation per-pair WR data accumulation (B68.3 calibrati** (unowned) — xStock per-pair correlation data accumulation
- **25-10 Crypto confidence-modifier calibration Kyle 2026-05-27 voice flagged c** (unowned) — crypto confidence-modifier calibration
- **25-17 TARGET-GEOMETRY CALIBRATION** #336 (unowned) — target geometry calibration across all 19 strategies, both classes
- **25-12 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206)** #206 (unowned) — xStock entry-trigger sweep (data-capture gap #206)
- **25-13 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206)** #206 (unowned) — xStock faithful geometry reconstruction + stop-anchor replay
- **25-14 PHASE-24 xSTOCK CALIBRATION BLOCK (data-capture gap #206)** #206 (unowned) — xStock per-strategy entry re-fit, ORB edge, vwap_bounce power test
- **25-15 DATA-BLOCKED STUDY (intraday-coverage gap)** #205 (unowned) — does the Net Expectancy gate reject signals that would have won — was data-blocked; the learning lane's refused-signal record found in 3n.v may now unblock it ⚠️ *verify*
- **25-17b CRYPTO reach_atr_max DECISION** #371 (unowned) — crypto reach ceiling decision — strong_bull_trend was set in 3n.v; the remaining strategies are untested ⚠️ *verify*
- **25-18 friction_safety_buffer per-class evaluation (reorg-B2 deliberate-globa** #337 (unowned) — per-class safety margin on the friction model
- **25-20 Per-strategy × per-class minRR (reward-vs-risk floor) RECALIBRATION fr** #372 (unowned) — per-strategy, per-class minimum reward-to-risk from win rates — partly delivered by 2.4g and 3n.v ⚠️ *verify*
- **25-26 Trade HOLD-TIME / timeframe study** #501 (unowned) — do slower trades clear the fee wall — the fee wall is the main reason paper loses
- **25-27 Profitable-signal PROFILE → reverse-engineer a scanner PRE-SCREEN for** #399 (unowned) — profile of a profitable signal, reversed into a scanner pre-screen

**Phase 16**

- **16.4 Wave 7** (unowned) — remove the old SafetyGuardrails service — only matters if any live path still consults it ⚠️ *verify*
- **B-RETIRED-SCORE-REMOVAL** `16.7` #558 (unowned) — remove retired scores — confirm nothing on the live ranking path still reads one ⚠️ *verify*
- **16.6 Trailing-Percent Code Purge (added 2026-04-25, Kyle directive)** (unowned) — purge legacy trailing-percent exit code so it cannot re-enter a live exit
- **16.8 Predictive-Learning / ML-Era Teardown REMAINDER (added 2026-07-28, Kyl** (unowned) — ML-era teardown remainder — Kyle decided REMOVE

**Phase 20**

- **20.2 Database Phase E** (unowned) — index and retention hygiene — database at 72% of plan (Kyle: August moves to warm storage in October)
- **20.4.5 Observability hardening (NEW 2026-06-12** (unowned) — observability hardening

**Task list only**

- **B-SCHEDULER-FIRST-TICK** (CC-A) — row 4.58 — scheduler first-tick behaviour; with a pre-read of ten unread market-scanner helpers ⚠️ *verify*
- **B-EXCURSION-RECORD** (CC-B) — row 2.4g-3 — record how far each trade travelled, needed to set the remaining reach ceilings from evidence
- **B-TRADE-RECORD-JOINABILITY** (CC-B) — row 2.4g-4 — trade records that cannot be joined across stores, missing DI and a zero ATR on every xStock shadow row: the learning record Phase 25 calibrates from

**Open issue with no plan row**

- **#648** (CC-A) — six of nineteen strategies have never traded (renumbered from #594) — part of the #596 ordering constraint
- **#590** (CC-A) — calibration store reset at the formula change
- **#588** (CC-A) — put a validated quality term back into the ranking — the ranking is the edge
- **#585** (CC-B) — the engine's auto-resume skips a malformed session row — exits keep running
- **B-IDEAL-POOL-STARVATION** #597 #598 (CC-A) — #597: the ideal pool gets ~4-5% of slots against a nominal 70% — travels with #596 and #648 as a Phase 25 ordering constraint
- **#596** (CC-A) — the outcome record is not representative of all strategies — Langston: this BLOCKS any outcome-sourced ranking, so it sets the ORDER of Phase 25, not just its content
- **#570** (CC-A) — one RTB refresh bucket fires but does not refresh its signals ⚠️ *verify*
- **#566** (CC-B) — volatility measured with a lag
- **#561** (Kyle) — volume / order book not filling in Open Trades; rename the column for xStocks
- **#549** (CC-B) — four gaps in Open Trades fields
- **#547** (CC-B) — Analyst's July soak findings — contents need the owner's read ⚠️ *verify*
- **#527** (CC-B) — xStock eval cycle should pass friction components ⚠️ *verify*
- **B-SQE-DEADCODE-PURGE** #533 (CC-A) — a dead SQE evaluator with a SHORTER gate list — delete before anything can call it
- **#521** (CC-B) — the engine heartbeat is structurally dead — nothing notices a dead engine
- **#518** (CC-B) — delete a dormant commented-out guardrail block (rule 18)
- **#515** (CC-B) — capture the remaining learning-record columns on the active path
- **B-TSC-BASELINE-TS2345-AUDIT** #510 (CC-B) — 32 suppressed type errors in the routes file, one tied to the balance ⚠️ *verify*
- **#506** (CC-B) — order-book subscriptions accumulate with no unsubscribe
- **B-CLOSED-TRADES-CLASS-BACKFILL** #505 (CC-B) — historical closed trades all carry the default class — backfill after #1024
- **#504** (CC-A) — stamp regime on maker/taker shadow rows — learning record
- **B-LEARNING-SYSTEM-CENSUS** #661 (Kyle) — at least three older learning systems still wired, disposition unknown — anything that could still steer a decision must be known before live
- **#658** (CC-C) — VTS applying posture multipliers that were pinned off
- **#645** (CC-C) — the net-EV floor is one crypto-era constant exported to xStock
- **#630** (CC-A) — the maker deadline was untested — the maker population was empty ⚠️ *verify*
- **#628** (CC-C) — a 50000 constant defeats a working fail-safe ⚠️ *verify*
- **#149** (unowned) — per-class RTB refresh cadence calibration
- **#166** (unowned) — TEC stale-cache fence still firing thousands of times ⚠️ *verify*
- **#168** (unowned) — CI cannot catch a production build that crashes on boot — in live that deploy leaves positions unmanaged
- **#169** (unowned) — the context-bridge-log retention job: a latent out-of-memory and (per Langston's archive) never installed
- **#199** (unowned) — no honest xStock volume feed, so volume confirmation was removed from xStock strategies
- **#201** (unowned) — range_trade is starved at the decision substrate
- **#610** (CC-A) — AMR EV-gap ring needs a staleness bound — AMR scales position size
- **#612** (CC-A) — AMR consumer cannot tell a clamped value from a real one
- **#619** (CC-A) — a schema dump does not capture seed data — rebuilding from backup would lose it
- **B-COST-MATH-CONSOLIDATION** #614 #627 (CC-C) — one home for cost math
- **#626** (CC-C) — an open question shipped in a user-facing string
- **B-AMR-INPUT-INTEGRITY-ARC** #616 (CC-C) — AMR's friction input is half a constant — gates every AMR weight change
- **#609** (CC-A) — 4,408 AMR rows with null score and inputs
- **#220** (unowned) — an undefined-function error logged 64,494 times in VTS strategy execution ⚠️ *verify*
- **#229** (Kyle) — four symbol-format modules that accept different forms — consolidate
- **#320** (unowned) — RTB should reject a queued signal whose class is inactive
- **#391** (CC-B) — monitor the xStock in-hours flat-price block rate
- **#664** (CC-B) — a diagnostic computes 'strategies evaluated' from a hardcoded 9
- **B-EXIT-PATH-TYPING** #676 (CC-A) — the exit path is untyped
- **#699** (CC-C) — does RTB promotion evict, or is the UI stale
- **B-DAILY-CUTOVER-SWEEP** #688 (CC-C) — four tables idle 29 nights then sweep everything at once
- **#686** (CC-C) — rewritten 08-17 — contents need the owner's read ⚠️ *verify*
- **B-BALANCE-TRUTH** #737 (CC-C) — four closed trades with null P&L that pass every check — Step F sequencing lives with 21-3d
- **#685** (CC-C) — crypto 1-minute bars cannot be tiered to warm storage
- **B-EPOCH-PARITY-FENCE** #901 #902 #910 (CC-C) — the epoch value still has two homes — learning-data integrity
- **B-DASHBOARD-AUTH-RACE** #903 (CC-C) — the portfolio card 401s on page load and never recovers — in live the operator sees no balance
- **#914** (CC-C) — SPLIT: the price half is retired; the COST half (0.05% per leg) is Phase 25 work
- **P19-B12** #1004 #1042 (CC-B) — the deploy tool's own executable is not derived from the reviewed ref
- **#1027** (CC-C) — Coltrane cannot read the repository — a PREREQUISITE for the Coltrane implementor trial ⚠️ *verify*
- **#1033** (CC-C) — an absent volume is stored as zero — indistinguishable from a minute that genuinely traded nothing; the liquidity filter reads it
- **#1072** (CC-C) — the crypto price-history recorder's symbol set is frozen — the same blind spot Langston hit today: not one euro-priced pair ever recorded

## AFTER LIVE — proposed deferrals (Kyle approves each) — 150

Phases 17, 18, 22 and the post-live 21.4/21.5 sections are already placed after live by the roadmap and are listed here without comment.

**Phase 19**

- **B-TSC-GUARD-DETERMINISM** `3b.h-3` #1019 (CC-A) — CI type-check guard determinism — tooling
- **B-DISPATCH-STAGING-VERIFY** `3b.i` #964 (CC-C) — its own row says it blocks nothing
- **B-SCANNER-DEDUPE-DEAD-TABLE** `3b.j` #965 (CC-C) — dead table cleanup
- **B-CHANGE-CLASS-PARSER** `3b.k` #968 (CC-C) — governance-checker parser
- **B-CHECKER-CORE-PATHS** `3b.k-a` #993 (CC-A) — governance-checker core paths
- **B-DEPLOY-REF-DECLARATION** `3c.a` #988 (CC-C) — deploy-tool declaration
- **B-CANONICAL-FREEZE** `3i.c` #948 (CC-C) — its own row says governance hygiene, not on the trading path
- **B-VPG-ROW-ALIGN** `3l` #934 (CC-C) — its own row says display-only
- **B-ORPHAN-ROOT-SCANNER** `3n.a` (CC-C) — dead code (disposition 5) — legacy removal, no live effect
- **row:3n.b** (CC-C) — orphan level tables (disposition 5) — legacy removal
- **B-CANONICAL-CORPUS-ACCURACY** `3n.e` #733 (CC-C) — accuracy of the pre-governance reference corpus
- **B-DIAG-READ-INTEGRITY** `3n.f` #1008 #1014 (CC-C) — diagnostics reads that took a status code for a body
- **B-PRICE-DOC-CONSOLIDATE** `3n.s` (Kyle) — merge two price documents into one — Kyle wants it done, but it is documentation
- **B-OPEN-OBLIGATION-SWEEP** `3n.v5` #1071 (CC-B) — process instrument for homed-but-unwatched items
- **B-TSC-COVERS-TESTS** `3n.r` (CC-C) — type-checking coverage for test files — tooling
- **B-ALERT-LIFECYCLE** `10` #1005 #443 #912 (unowned) — alert-tooling quality of life; its own row says it does not block the trading sequence
- **row:1** #739 (CC-A) — crew-process rule mechanisms (B-RULES-1e) — governance tooling, no effect on trading
- **B-SCRIPTS-TSC-COVERAGE** `2.4-FEE-e` #1058 (CC-B) — type-checking coverage for the scripts folder — tooling
- **B-WRITER-ACTOR-ALLOWLIST** `2.4d` #1046 (CC-B) — Langston memory-tool actor names — reviewer tooling
- **B-PYCACHE-PREFIX-INVOCATION** `2.4e` #1048 (unowned) — reviewer-tooling hardening on the Helsinki box; not the trading path (a planted-cache execution vector — worth doing, not a live blocker)
- **B-WAKE-SOURCE-TRUTH** `2.4g` #1054 (CC-INFRA) — crew wake-source documentation
- **B-ARCHIVE-RETENTION-SIZING** `2.4f` #592 (Kyle) — Kyle decided 2026-09-23: no action, August tiers to warm in October; the uninstalled context_bridge_log TTL job is a separate small defect
- **19-5 §19.x Boot Readiness Coordinator Unify the patchwork boot sequence** (unowned) — boot readiness coordinator — conditional on boot cascades, which have not recurred
- **19-15 #97 xStock asset-specific characteristics inventory Earnings calendar** (unowned) — xStock fundamentals enrichment (earnings, P/E, ratings) — plumbing, not a live-safety need
- **19.6.4 Forward role** (unowned) — forward role for the ML conversational layer — Phase 17/18
- **System Manual row conflict left by B-CROSS-SESSION-BLEED** (CC-B) — A required governance row cannot take N/A, and re-declaring the class lower would downgrade reviewed work. Governance only.

**Phase 25**

- **25-1 B79.0n.ML-CALIBRATION T2 (umbrella v4 #15) Tier 2 ML calibration** (unowned) — ML calibration tier 2 — its own row says it needs live evidence
- **25-6 AMR posture-model M2 calibration (post-launch** (unowned) — AMR posture model calibration — its own row says post-launch
- **25-22 Edge-decay monitor** #441 (unowned) — edge-decay monitor — research idea; most valuable once live
- **25-23 Probabilistic hidden-state (HMM-style) regime inference → regime-condi** (unowned) — hidden-state regime inference — research idea
- **25-24 Orthogonal weak-feature enrichment of the per-cycle selection ranking,** (unowned) — weak-feature ranking enrichment — research idea
- **25-25 Cross-instrument / relative-value (statistical-arbitrage) signals (Ren** (unowned) — cross-instrument / relative-value signals — research idea

**Phase 16**

- **16.2 Database Phase A-B** (unowned) — database isolation and modularisation — no live-safety effect (a proposed deferral: the run order puts Phase 16 before live)
- **16.3 Database Phase C** (unowned) — drop legacy tables and enums — proposed deferral
- **16.5 LSP Error Resolution** (unowned) — editor/type error cleanup
- **16.9 resetRateLimiter()** (unowned) — inert rate-limiter reset — Kyle slotted it in Phase 16

**Phase 20**

- **20.1 Database Phase D** (unowned) — migration rebaseline
- **20.3 Test Infrastructure** (unowned) — test runner and frontend test tooling
- **20.5 Architecture Cleanup** (unowned) — decompose large pages and route files
- **20.3.1 — Unit/integration test-tier separation (RUNNING_ISSUES #226; HOMED HE** #226 (unowned) — unit / integration test-tier separation

**Phase 21**

- **21.4 POST-LAUNCH REVISIT** (unowned) — already placed post-live in the roadmap
- **21.4.1 8-module extraction** (unowned) — already placed post-live in the roadmap
- **21.4.3 storage.ts modularization (folded in from Phase 16.2)** (unowned) — already placed post-live in the roadmap
- **21.5.2 Perpetual Futures Integration** (unowned) — already placed post-live in the roadmap
- **21.5.3 Cross-Asset Infrastructure** (unowned) — already placed post-live in the roadmap

**Task list only**

- **B-DECISION-RECORDS** (CC-A) — decision-history durability and catalogues (CC-A governance lane)
- **B-LANGSTON-LEDGER-SPLIT** (CC-B) — Langston's memory file size — reviewer tooling

**Open issue with no plan row**

- **#606** (CC-B) — a method note filed as its own entry ⚠️ *verify*
- **B-VERIFY-DISCIPLINE** #545 #568 (CC-C) — absence-reads-as-pass defect class
- **#528** (CC-B) — delete an unused 1,376-line trades page (rule 18) ⚠️ *verify*
- **B-EOL-POLICY** #539 (unowned) — line-ending policy
- **#537** (CC-B) — untracked orphan script ⚠️ *verify*
- **#513** (CC-B) — maker target exits in the VTS lane
- **B-GOV-INTEGRITY-0** #455 #490 #491 (CC-A) — reviewer frozen rulebook
- **B-DISCORD-CONNECT-RESILIENCE** #465 (CC-A) — Discord library crash on outage
- **#463** (unowned) — bridge code reviewed by documentation, not diff
- **B-LANGSTON-QUEUE-2** #484 #487 #488 (CC-A) — review queue lock
- **B-GOV-INTEGRITY-3** #452 #453 #492 (CC-A) — message id spans
- **#449** (CC-B) — governance checker read a frozen rulebook ⚠️ *verify*
- **B-ALERT-TAXONOMY** #446 (CC-A) — alert categories
- **#419** (CC-B) — funnel counter will not balance under error rows
- **B-DISAGREEMENT-FINDER** #975 (CC-A) — mistake-pattern tooling
- **#970** (CC-A) — multi-homed decisions in our records
- **B-GOV-REPORTING** #747 #752 #946 (CC-A) — Langston memory size
- **#660** (Kyle) — trade tables' 365-day hot window never re-asked
- **#646** (CC-C) — resolved_by not populated on manual resolve
- **B-MEASURE-GATE** #622 #629 #984 (CC-A) — re-surfacing alerts re-emit old measurements
- **#144** (unowned) — perpetual-futures activation checklist — perps come after live
- **#147** (unowned) — per-class telemetry disk persistence
- **#148** (unowned) — health check permission error on a Replit-era path ⚠️ *verify*
- **#150** (unowned) — make the RTB asset-class column NOT NULL after a zero-null soak ⚠️ *verify*
- **#151** (unowned) — Phase 16 register entry
- **#152** (unowned) — document the locked-module override boundary
- **#154** (unowned) — dead optional constructor argument
- **#155** (unowned) — perp reason truncated in a diagnostic endpoint
- **#156** (unowned) — audit candidate for per-class consumer swaps
- **#157** (unowned) — line-number drift in a diagnostic payload
- **#158** (unowned) — inefficient 24h filter at volume ⚠️ *verify*
- **#159** (unowned) — log volume gating for a canary line
- **#171** (unowned) — corrupt manifest needs a manual runbook
- **#172** (unowned) — stale duplicate retention keys
- **#173** (unowned) — a recurring zero-null guard once Phase 25 reads the dataset
- **#198** (unowned) — cron-evidence verifier edge case
- **#202** (unowned) — study scripts leave files on staging that block the next pull
- **#615** (CC-A) — reviewer identity is the app's secret-holding account
- **#613** (CC-A) — a read-only diagnostics credential for the reviewer
- **#625** (CC-B) — orphan sweep lacks a branch for deadline keys
- **#621** (CC-C) — code-review gate grades a diff by mechanism
- **B-STORAGE-CATALOG** #601 (CC-A) — unmanaged app-local file store
- **#209** (unowned) — ratchet the type-check baseline down
- **#217** (unowned) — RTB context bonus in shadow
- **#218** (unowned) — dead function carrying a hardcoded fee default
- **#219** (unowned) — dormant flip-rate governance input
- **#231** (unowned) — ablation record id gap
- **#234** (unowned) — 390 non-active-path type errors, each homed
- **#298** (Kyle) — ticker shown instead of company name
- **#321** (Kyle) — an uncalled witness method
- **B-GOV-2** #324 (unowned) — checker always-on gate
- **B-ALERT-OWNERSHIP-REGISTER** #642 (CC-B) — alert ownership transfer
- **B-ALERT-ACK-PROCEDURE-DOCFIX** #646 (CC-B) — alert procedure doc
- **B-CATALOG-1** #672 (Kyle) — table catalogue + lookalike register
- **#669** (CC-B) — Langston Step-4 finding (B) — contents need the owner's read ⚠️ *verify*
- **#670** (unowned) — crew-status cold hand-off
- **#673** (CC-A) — desktop sessions and the CLI are different versions
- **#679** (CC-B) — persistent threshold alerts re-fire forever once resolved
- **#680** (CC-B) — type-check gate at push time
- **#697** (Kyle) — storage overview UI page (Kyle directive)
- **#689** (CC-C) — storage-fraction numerator/denominator mismatch
- **B-WS-V1-RESIDUE-SWEEP** #742 (CC-C) — dead Kraken v1 ticker handler (rule 18)
- **B-CHUNK-ADDRESSING** #761 (CC-A) — comms outage cause
- **#746** (CC-A) — Langston's second model site has no repo source
- **B-GATE-GUARD** #744 #745 (CC-A) — issue-number blocks
- **#740** (CC-A) — skill description colon trap
- **#702** (CC-A) — issue-number minting
- **#700** (CC-A) — crew process
- **#701** (CC-A) — crew process
- **#694** (CC-A) — coordination noise — B-WAKE-QUIET closed; B-RULES-LAYER queued
- **B-GOV-4** #904 (CC-C) — checker entry test
- **B-HELSINKI-MOUNT-WATCH** #921 #924 (CC-INFRA) — wedged mount detection on the reviewer box
- **#920** (unowned) — reviewer grep returns zero on a bad flag
- **#942** (CC-C) — info alerts outside the no-silent-drop guarantee
- **B-TSC-GUARD-CWD** #926 (CC-INFRA) — push guard working directory
- **B-REVIEWER-LOOP-AVAILABILITY** #931 (CC-INFRA) — fresh-reviewer availability
- **#981** (CC-A) — wrong-object re-derivation mechanism
- **B-TOKENWATCH-OBSERVED-AT** #986 (CC-INFRA) — token watch tooling
- **B-TOKENWATCH-PAIR-SELECT** #984 (CC-INFRA) — token watch tooling
- **#998** (CC-A) — rules layer (B-RULES-LAYER)
- **#999** (CC-A) — heartbeat task wording
- **#1026** (CC-C) — chunked Langston dispatch leaks parts into the channel — comms
- **#1035** (CC-C) — Langston's alert prompt lists only three owners
- **#1043** (CC-INFRA) — a pinned GitHub read served the wrong file — reviewer tooling
- **#1055** (unowned) — delete a dead legacy write on Langston's box
- **#1074** (CC-C) — the governance checker's open-batch alerts have no clear path

**Phase 22**

- **22.1 Build & Deploy Pipeline** (unowned) — already placed post-live in the roadmap
- **22.2 Monitoring & Observability** (unowned) — already placed post-live in the roadmap

**Phase 17**

- **17.1 Scope & Grounding (Week 23)** (unowned) — already placed post-live in the roadmap
- **17.2 ML Touchpoint & Influence Mapping (Weeks 24-25)** (unowned) — already placed post-live in the roadmap
- **17.3 Infrastructure Design (Weeks 25-26)** (unowned) — already placed post-live in the roadmap
- **17.4 Research & Feature Engineering (Weeks 26-27)** (unowned) — already placed post-live in the roadmap
- **17.5 Blueprint Assembly (Weeks 27-28)** (unowned) — already placed post-live in the roadmap
- **17.6 Trend Mining Engine** (unowned) — already placed post-live in the roadmap
- **17.5.1 Rules-Based Policy Engine** (unowned) — already placed post-live in the roadmap
- **17.5.2 Predictive Adjustment Execution** (unowned) — already placed post-live in the roadmap
- **17.5.3 Calibration Execution** (unowned) — already placed post-live in the roadmap
- **17.5.4 Regime-Aware Adaptation** (unowned) — already placed post-live in the roadmap

**Phase 18**

- **18.1 Crawl** (unowned) — already placed post-live in the roadmap
- **18.2 Walk** (unowned) — already placed post-live in the roadmap
- **18.3 Run** (unowned) — already placed post-live in the roadmap
- **18.4 Fly** (unowned) — already placed post-live in the roadmap
- **18.5 Trend Mining Engine** (unowned) — already placed post-live in the roadmap

## PARKED BY KYLE — deliberately undated; not re-scored — 10

**Open issue with no plan row**

- **B-ALERT-DEDUPE-REASON-DRIFT** #572 #638 #643 (CC-B) — parked by Kyle, deliberately undated
- **B-GOV-INTEGRITY-2** #454 #480 #481 (CC-B) — parked by Kyle, deliberately undated
- **B-RULES-1E-LANGSTON-SLIM** #974 (CC-A) — parked by Kyle, deliberately undated
- **#221** (Kyle) — parked by Kyle, deliberately undated
- **#392** (CC-B) — parked by Kyle, deliberately undated
- **#668** (Kyle) — parked by Kyle, deliberately undated
- **#671** (Kyle) — parked by Kyle, deliberately undated
- **#693** (CC-C) — parked by Kyle, deliberately undated
- **#741** (CC-A) — parked by Kyle, deliberately undated
- **B-GDRIVE-UNMOUNT** #757 #759 (CC-A) — parked by Kyle, deliberately undated

## MERGED INTO ANOTHER ITEM — 53

| item | merged into | why |
|---|---|---|
| **B-RATE-LIMITER-RESET-DISPOSITION** `3m` #936 | `rm:16.9` | Kyle decided REMOVE IN PHASE 16 (roadmap 16.9) |
| **19-3 §19.0.5 Full data-capture coverage for paper-active path Active-path S** | `B-PAPER-LANE-PROVENANCE` | paper-lane capture coverage — the measured gap is that paper writes NO provenance |
| **19-14 §19.3.5 Trailing-exit live verification (B65.3 folded in) Verify ATR T** | `BE-MOONBAG` | trailing-exit verification is moot while break-even and moonbag exits are config-locked OFF |
| **19.0.5 — Full data-capture coverage for paper-active path (HARD requirement,** | `B-PAPER-LANE-PROVENANCE` | duplicate of 19-3 |
| **19.1 Paper Trading Run** | `rm:19-11` | duplicate of the paper run |
| **19.3 Performance Validation** | `rm:19-11` | performance validation = judging the paper run |
| **19.3.5 Trailing-exit live verification (folded-in B65.3, 2026-04-25)** | `BE-MOONBAG` | trailing-exit live verification — same item |
| **19.6.1 External-Source Connection Dashboard** | `rm:19.6` | part of the diagnostics dashboard |
| **19.6.2 CPU / Process Capacity Dashboard** | `rm:19.6` | part of the diagnostics dashboard |
| **19.6.3 Alert integration** | `rm:19.6` | part of the diagnostics dashboard |
| **19.6.5 Scope shape & sequencing** | `rm:19.6` | scope-and-sequencing note for the dashboard |
| **25-21 The sub-1.0-RR strategy EV-SURVIVAL audit (morning_star / support_boun** #375 | `rm:25-19` | folded into 25-19 by Kyle 2026-06-23 |
| **19.0.A — Regime classifier confidence-chain calibration (MOVED HERE 2026-05-2** | `rm:25-2` | regime confidence-chain calibration — moved to Phase 25 item 25-2 |
| **19.0.3 — TFS sustainability gate value-scope decision (NEW 2026-05-17, Kyle d** | `rm:25-3` | TFS sustainability gate value-scope — moved to Phase 25 item 25-3 |
| **19.4 SQE Recalibration (B66, conditional)** | `rm:25-4` | SQE recalibration — moved to Phase 25 item 25-4 |
| **20.4 Security Finalization** | `B-SEC-HARDEN` | security finalisation — same work; login tokens out of browser storage belongs with it |
| **B-FINALSCORE-TELEMETRY-RETIRE** #586 | `rm:16.7` | finalScore call deletion |
| **#587** | `rm:16.7` | retire the expectedEdge field |
| **B-VTS-CLUSTER-RETIRE** #584 | `rm:16.7` | VTS retired-score cluster |
| **#583** | `B-XSTOCK-SESSION-FRESHNESS` | xStock trading window / exit policy ⚠️ *verify* |
| **#578** | `rm:21.1` | the legacy trading engine is dead in both modes — Kyle ruled removal; part of building the live engine |
| **#571** | `B-WS-SUBSCRIBE-CLASS-FILTER` | thread the asset class through the crypto subscribe boundary |
| **B-RETIRED-SCORE-REMOVAL** #558 | `rm:16.7` | the same batch — Kyle moved it to Phase 16 on 2026-09-02 |
| **B-OPEN-TRADE-MANAGEMENT** #551 | `B-OPENTRADE-REFRESH-LANE` | refresh open trades as RTB refreshes queued signals ⚠️ *verify* |
| **#525** | `rm:16.7` | finalScore full purge |
| **#393** | `B-XSTOCK-SESSION-FRESHNESS` | the xStock stall alarm fires every off-hours stretch — Kyle ruled keep the block, stop the alarm |
| **#953** | `rm:21.1.a` | same item as B-LEGACY-LIVE-EXIT-PATH |
| **#636** | `B-PRICE-AGE-TRUTH` | snapshot arrival is not mark freshness |
| **#650** | `B-SIZING-DEC-RESTORE` | every trade sized in defensive mode |
| **#160** | `rm:25-3` | sustainability-formula momentum saturates on xStock — a Phase 25 calibration input |
| **#203** | `rm:25-14` | ORB is ready but disabled pending its own validation |
| **#620** | `B-COST-MATH-CONSOLIDATION` | the one P&L invariant |
| **#211** | `rm:16.7` | two drifted finalScore implementations — retired-score removal |
| **#212** | `B-PAPER-LANE-PROVENANCE` | paper orchestrator records no pre-gate rejects |
| **#214** | `rm:21.1` | health broadcast reads the never-initialised engine global and reports isRunning:false — same family as the live engine placeholder |
| **#226** | `rm:20.3.1` | unit / integration test-tier separation |
| **#227** | `rm:21.2` | does Kraken's spot test environment simulate fills — part of paper-to-live testing |
| **#228** | `rm:19-10` | the remaining throwing asset-class resolution sites |
| **#230** | `B-VTS-CLASS-LABEL-INTEGRITY` | tag fallback-classified learning rows |
| **#237** | `#150` | same NOT NULL step |
| **#297** | `rm:21.1` | a never-initialised engine global — part of replacing the live engine placeholder |
| **#303** | `B-KILLSWITCH-DENOMINATOR` | the kill switch counts realised P&L only — unrealised drawdown never trips it ⚠️ *verify* |
| **#678** | `row:3n.c` | all TEC trailing state lives in one temporary file |
| **#677** | `row:3n.c` | trailing-state rehydrate seed missing two of three fields |
| **#667** | `rm:21-3a` | live guardrail values in the database no screen can show or edit — the Live Guardrails tab |
| **#675** | `B-FILTER-DIAG-XSTOCK` | paper xStock decline table empty |
| **#691** | `B-SCHEDULER-FIRST-TICK` | two daily scheduled tasks silently stopped firing (incl. xStock universe discovery) ⚠️ *verify* |
| **#900** | `B-EPOCH-PARITY-FENCE` | epoch parity fence |
| **#916** | `F-G-1` | stop and target not venue-accepted — the venue grid |
| **#994** | `B-XSTOCK-SESSION-FRESHNESS` | Langston routes its implementation to row 3b.f-c; plan row 3b.f-d says it was folded into B-VENUE-QUIET-ALERTING — the two records disagree ⚠️ *verify* |
| **#1039** | `B-SCHEDULER-FIRST-TICK` | every scheduled task runs twice after a restart — same item |
| **P19-B6.5g** `plan history table` | `#233` | its core is #233 ⚠️ *verify* |
| **P19-B15 — live and paper share one pipeline** `plan history table` | `#322` | same work as #322 |

## PRUNED — 192

### Judged — 40

- **B-EXIT-PROVENANCE-TICKER-RETENTION** `2` #911 — landed ed86a758e, gate discharged, closed 2026-08-30
- **row:3b.b** #943 #958 #960 — B-XSTOCK-FEED-SANITY closed 2026-09-11 (inconclusive); its acceptance re-arms under 3n OBJ-7
- **B-BOOK-BBO-DIVERGENCE** `~~3b.c~~` — withdrawn by its author 2026-08-29 — a timing artifact
- **row:3b.f-c-a** #992 — absorbed into B-XSTOCK-FEED-SANITY 2026-09-03 on Kyle's option-(D) ruling
- **B-MAKER-FILL-TRANSACTABLE-SIDE** `3n.q` #741 — built as 8a-P3 (crypto) and 8a-P4b (paper xStock); window closed 2026-09-22
- **B-FEED-BY-SITUATION-AUDIT** `3n.t` — done 2026-09-18 — the per-situation feed audit and its determinations
- **row:4** — F-5 per-strategy reach structure — delivered by B-GEOMETRY-REACH-BASELINE and B-REACH-BASELINE-ADJUST ⚠️ *verify*
- **B-SCANNER-EGRESS-NORMALISE** `5` — closed 2026-08-30
- **B-CROSS-SESSION-BLEED** `2` #753 — closed; its residual System-Manual rule conflict is governance, AFTER ⚠️ *verify*
- **row:2.4a** #656 — its own row says CLOSED 2026-09-04
- **B-ALERT-QUEUE-INTEGRITY** `2.4b` #647 — its remaining leg was folded 2026-09-03, explicitly not its own batch ⚠️ *verify*
- **19.0.C — Tiered fee-model accuracy fix (NEW 2026-06-08, Kyle directive** — tiered fee-model accuracy fix — superseded by the fee contract and fee ladder work ⚠️ *verify*
- **19-1 B79.0n.WIRE-IN (umbrella v4 #14) xStock active-trading wire-in** — xStock active wire-in — xStock paper trades open and close today ⚠️ *verify*
- **19-2 B79.0n.OBSERVABILITY T2 + active-trading flip (umbrella v4 #16) The ac** — paper-active flip — paper active trading is ON
- **19-6 #137 active-trading-path restoration intake list TypeScript baseline f** #137 — June active-path restoration intake list — superseded by the Phase 19 queue ⚠️ *verify*
- **19-7 #92 wire xstockSpotScanner through signal-orchestration Pre-existing w** — xstockSpotScanner wiring — xStock signals reach the active path today ⚠️ *verify*
- **19-8 B79.5 xStock real-time WebSocket pricing adapter wss://ws-equities.kra** — xStock WebSocket pricing adapter ⚠️ *verify*
- **19-12 §19.2 Audit & Debug Fix structural bugs surfaced during the paper run.** — umbrella heading — its content is the individual debug items
- **19-19 NEW** — AMR body — landed as the last pre-Phase-19 batch ⚠️ *verify*
- **19-20 DONE 2026-06-08** #206 — decision-provenance capture — its own row says DONE 2026-06-08
- **25-5 §19.4.5 Observational Decision Gate Pre-launch reordering decision bas** — observational decision gate — superseded by this inventory (same as 19.4.5)
- **19.4.5 Observational Decision Gate** — observational decision gate — superseded by THIS inventory (row 3n.x)
- **19.5 — anchor stub (superseded section)** — anchor stub for a superseded section
- **#554** — no push coordination across sessions — solved by separate clones
- **#542** — Google Drive mount git crashes — sessions moved to local clones 2026-07-23
- **B-SHARED-TREE-COMMIT-ATOMICITY** #557 #559 — shared working tree — solved by separate clones ⚠️ *verify*
- **#544** — July xStock price-capture stop — incident record ⚠️ *verify*
- **B-MBIM-SWITCH-ON** #507 — closed 2026-08-24 with its retention flip armed ⚠️ *verify*
- **B-CC-WORKTREE-ISOLATION** #460 — two sessions sharing one working tree — solved by separate clones
- **#496** — an orphaned bridge process from July ⚠️ *verify*
- **#143** — May runtime observation of the SQE evaluation — superseded by active paper running ⚠️ *verify*
- **#146** — deploy-sha verification — delivered by dt-deploy ⚠️ *verify*
- **#232** — confirm the netEV floor value before active paper turned on — active paper is on ⚠️ *verify*
- **#238** — strategy-gate seed before activation — activation happened ⚠️ *verify*
- **#663** — Kyle decision on the July migration — past; Kyle 2026-09-23: August moves to warm storage in October
- **#692** — the 08-12 balance re-anchor froze opens for four days — incident record ⚠️ *verify*
- **#1001** — staging behind the review branch on one day — its follow-up B-DEPLOY-DRIFT-LINE shipped ⚠️ *verify*
- **B-DEPLOY-DRIFT-LINE** #1002 — closed 2026-09-07 ⚠️ *verify*
- **B-GEOMETRY-REACH-BASELINE** — closed 2026-09-13; the task-list line is stale
- **P19-B8.5** — umbrella; Kyle ruled it stays open until Phase 19 closes — not work in itself

### By the issue's own wording — 152 ⚠️ owners confirm

> These were pruned because the issue body says withdrawn / resolved / folded / superseded. **That rule is known to leak:** three of Langston's items (#596, #914, #994) were pruned by it and are live, and have been reinstated above. Each owner should scan their own.

| item | owner | rule |
|---|---|---|
| **B-EXIT-PROVENANCE** `1` #913 | — | own status cell reads done/closed/absorbed |
| **B-ASSET-CAPS-REMOVAL** `3b` #917 | — | own status cell reads done/closed/absorbed |
| **B-XSTOCK-BOOK-LADDER** `3b.d` #949 | Kyle | own status cell reads done/closed/absorbed |
| **B-TSC-GUARD-NONCODE-EXEMPT** `~~3b.h-5~~` #1025 | CC-A | own status cell reads done/closed/absorbed |
| **B-MIN-STOP-DISTANCE** `3d` | CC-C | own status cell reads done/closed/absorbed |
| **B-FUNNEL-PERP-CLASSES** `3j` #925 | CC-C | own status cell reads done/closed/absorbed |
| **row:3n.x** | Kyle | own status cell reads done/closed/absorbed |
| **B-ALERT-ACTOR-ALLOWLIST** `2.4` #987 | Kyle | own status cell reads done/closed/absorbed |
| **19.0.B — Daily loss-budget service + kill-switch auto-trip ( SHIPPED 2026-06-** | — | own status cell reads done/closed/absorbed |
| **16.1 Wave 6** | — | own status cell reads done/closed/absorbed |
| **21.4.2 Comprehensive lever-to- module_constants migration** | — | own status cell reads done/closed/absorbed |
| **21.5.1 Kraken XStocks Integration** | — | own status cell reads done/closed/absorbed |
| **B-VTS-FRICTIONCOST-NAN** #607 | CC-B | issue body records it resolved-in-body |
| **B-AMR-EVGAP-DROP-VISIBILITY** #604 | CC-B | issue body records it resolved-in-body |
| **B-IMPLEMENTATION-SHORTFALL** #603 | CC-C | issue body records it withdrawn |
| **B-AMR-CONTEXT-BONUS-REWIRE** #593 | CC-A | issue body records it withdrawn |
| **B-CALIBRATION-QUALITY-WEIGHT** #591 | CC-A | issue body records it withdrawn |
| **#589** | CC-A | issue body records it folded |
| **B-AMR-DOCTRINE-COMMENT-CORRECT** #600 | CC-B | issue body records it withdrawn |
| **#599** | CC-A | issue body records it resolved-in-body |
| **#595** | CC-A | issue body records it folded |
| **#582** | CC-A | issue body records it folded |
| **#580** | CC-A | issue body records it folded |
| **#576** | CC-C | issue body records it resolved-in-body |
| **#575** | CC-A | issue body records it folded |
| **#574** | CC-A | issue body records it folded |
| **B-PAPER-LEGACY-TABLE-REWIRE** #573 | CC-B | issue body records it folded |
| **B-OFFHOURS-BEHAVIOUR** #569 | CC-B | issue body records it withdrawn |
| **#553** | CC-C | issue body records it resolved-in-body |
| **B-REPO-RELOCATE** #567 | CC-C | issue body records it folded |
| **B-COMMS-RESTART-DURABILITY** #565 | CC-C | issue body records it withdrawn |
| **B-CLAUDEMD-PLACEMENT** #564 | CC-C | issue body records it resolved-in-body |
| **#562** | Kyle | issue body records it resolved-in-body |
| **B-RANKING-COMPONENT-CAPTURE** #555 | CC-A | issue body records it resolved-in-body |
| **#531** | Kyle | issue body records it resolved-in-body |
| **B-ATR-TRAILING-DECISION** #556 | CC-B | issue body records it withdrawn |
| **#550** | CC-B | issue body records it folded |
| **B-REGIME-INPUTS-LIVE** #546 | CC-B | own status cell reads done/closed/absorbed |
| **#543** | CC-A | issue body records it resolved-in-body |
| **#541** | CC-A | issue body records it folded |
| **#529** | Kyle | issue body records it withdrawn |
| **B-TRENDSTRENGTH-SOURCE** #538 | CC-A | issue body records it resolved-in-body |
| **#536** | CC-B | issue body records it resolved-in-body |
| **#524** | CC-B | issue body records it resolved-in-body |
| **#523** | CC-B | issue body records it resolved-in-body |
| **#522** | Kyle | issue body records it folded |
| **#520** | CC-B | issue body records it resolved-in-body |
| **#516** | CC-B | issue body records it resolved-in-body |
| **#514** | CC-B | issue body records it withdrawn |
| **#512** | CC-B | issue body records it resolved-in-body |
| **#509** | CC-B | issue body records it superseded |
| **B-PROMOTION-RACE-FIX** #508 | CC-B | issue body records it resolved-in-body |
| **#511** | CC-A | issue body records it resolved-in-body |
| **#503** | CC-B | issue body records it resolved-in-body |
| **#498** | CC-B | issue body records it resolved-in-body |
| **B-OPS-PM2-LOG** #499 | CC-B | issue body records it resolved-in-body |
| **#500** | Kyle | issue body records it resolved-in-body |
| **B-GOV-ORPHAN-CLASS** #352 #497 | CC-B | issue body records it resolved-in-body |
| **#445** | CC-B | issue body records it folded |
| **B-GOV-CLASSOVERRIDE-WIRE** #464 | CC-A | issue body records it folded |
| **#462** | CC-A | issue body records it resolved-in-body |
| **B-QUEUE-DEBT** #482 | CC-B | issue body records it withdrawn |
| **B-GOV-INTEGRITY-1** #448 | CC-A | issue body records it folded |
| **#444** | CC-B | issue body records it resolved-in-body |
| **#422** | CC-B | issue body records it withdrawn |
| **B-GOV-5** #341 | CC-A | issue body records it folded |
| **#979** | CC-B | issue body records it folded |
| **#978** | CC-A | issue body records it withdrawn |
| **B-TOKEN-WATCH** #973 #989 | CC-INFRA | issue body records it folded/withdrawn |
| **#972** | CC-A | issue body records it withdrawn |
| **#962** | CC-C | issue body records it withdrawn |
| **#957** | CC-C | issue body records it withdrawn |
| **#955** | CC-C | issue body records it withdrawn |
| **#952** | CC-C | issue body records it withdrawn |
| **B-GOV-CLASS-PARSE** #947 | CC-INFRA | issue body records it withdrawn |
| **#635** | CC-B | issue body records it withdrawn |
| **#659** | CC-C | issue body records it folded |
| **#644** | CC-C | issue body records it withdrawn |
| **#634** | CC-C | issue body records it withdrawn |
| **#633** | CC-C | issue body records it folded |
| **#632** | CC-C | issue body records it withdrawn |
| **#631** | CC-A | issue body records it withdrawn |
| **#170** | — | issue body records it withdrawn |
| **#174** | — | issue body records it withdrawn |
| **#200** | — | issue body records it withdrawn |
| **#611** | CC-A | issue body records it withdrawn |
| **B-TRADE-RECORD-RETENTION** #617 | CC-A | issue body records it withdrawn |
| **#624** | CC-C | issue body records it withdrawn |
| **#623** | CC-A | issue body records it withdrawn |
| **#608** | CC-A | issue body records it withdrawn |
| **#225** | Kyle | issue body records it resolved-in-body |
| **#236** | — | issue body records it resolved-in-body |
| **#299** | Kyle | issue body records it resolved-in-body |
| **#295** | Kyle | issue body records it resolved-in-body |
| **#300** | — | issue body records it resolved-in-body |
| **P19-B6.7** #301 | Kyle | issue body records it resolved-in-body |
| **P19-B6.8** #302 | Kyle | issue body records it resolved-in-body |
| **#325** | — | issue body records it resolved-in-body |
| **#326** | Kyle | issue body records it resolved-in-body |
| **#327** | — | issue body records it resolved-in-body |
| **B-VTS-SETNULLREASON** #395 | CC-B | issue body records it resolved-in-body |
| **B-FEED-WS-SUBERR** #396 | Kyle | issue body records it resolved-in-body |
| **P19-B6.9** #398 | CC-B | issue body records it resolved-in-body |
| **#397** | CC-B | issue body records it resolved-in-body |
| **B-GOV-HEARTBEAT-REPAIR** #637 | CC-B | issue body records it resolved-in-body |
| **#639** | CC-B | issue body records it withdrawn |
| **#640** | CC-B | issue body records it withdrawn |
| **#642** | CC-A | issue body records it withdrawn |
| **B-LATCH-DOC-DIVERGENCE** #641 | CC-B | issue body records it withdrawn |
| **B-DEPLOY-LOCK** #649 | Kyle | issue body records it resolved-in-body |
| **#652** | CC-B | issue body records it folded |
| **#653** | CC-B | issue body records it folded |
| **#655** | CC-A | issue body records it withdrawn |
| **#654** | CC-B | issue body records it resolved-in-body |
| **B-STORAGE-CAP-RUNWAY** #660 | CC-B | issue body records it withdrawn |
| **#662** | CC-B | issue body records it folded |
| **#683** | CC-A | issue body records it withdrawn |
| **#674** | CC-A | issue body records it withdrawn |
| **#705** | CC-C | issue body records it withdrawn |
| **#703** | Kyle | issue body records it superseded |
| **#696** | CC-C | issue body records it folded |
| **#687** | CC-C | issue body records it withdrawn |
| **#762** | — | issue body records it withdrawn |
| **B-REVIEWER-LOOP** #758 | CC-A | issue body records it withdrawn |
| **#756** | CC-A | issue body records it folded |
| **#754** | Kyle | issue body records it resolved-in-body |
| **#751** | — | issue body records it folded |
| **B-CLAUDEMD-SLIM** #749 #750 | CC-A | issue body records it folded/resolved-in-body |
| **#748** | CC-A | issue body records it folded |
| **B-RULES** #739 | CC-A | issue body records it resolved-in-body |
| **B-MAKER-PFILL-CALIBRATION** #738 | CC-C | issue body records it resolved-in-body |
| **#734** | CC-C | issue body records it folded |
| **#732** | CC-A | issue body records it withdrawn |
| **B-LIQUIDITY-UNIT-AUDIT** #906 #907 #908 | CC-C | own status cell reads done/closed/absorbed |
| **B-BTC-HISTORY-SYMBOL-FIX** #909 | CC-C | issue body records it withdrawn |
| **#945** | CC-C | issue body records it withdrawn |
| **B-UNIVERSE-BOUNDARY-FIAT** #938 | CC-C | issue body records it folded |
| **B-BURN-THRESHOLD-BASIS** #932 | CC-INFRA | issue body records it withdrawn |
| **#980** | CC-A | issue body records it resolved-in-body |
| **#997** | CC-A | issue body records it withdrawn |
| **#1021** | CC-A | issue body records it folded |
| **#1020** | CC-A | issue body records it folded |
| **#1038** | CC-A | issue body records it folded |
| **#1057** | CC-INFRA | issue body records it folded |
| **#1047** | CC-C | issue body records it folded |
| **#1051** | CC-B | issue body records it withdrawn |
| **#1063** | CC-B | issue body records it resolved-in-body |
| **#1065** | CC-C | issue body records it folded |
| **#1075** | CC-C | issue body records it folded |
| **B-TASK-LIST-SLOT** | CC-A | own status cell reads done/closed/absorbed |
| **B-CANONICAL-BRIDGE-CHURN** | CC-A | own status cell reads done/closed/absorbed |
| **B-WAKE-QUIET** | CC-A | own status cell reads done/closed/absorbed |

## ADDED BY HAND — no file extraction reached these

- **Break-even stop + moonbag trailing exits** — Langston archive; roadmap §3.1 (Kyle 2026-06-11)
- **B-VOLATILITY-CACHE-RETIRE** — PHASE_19_PLAN:231 (queued; my extractor read that table as history)
- **P19-B6.10 — retire the old per-mode guardrails table** — PHASE_19_PLAN:227 (queued)
- **P19-B6.5g** — PHASE_19_PLAN:222 (queued)
- **P19-B15 — live and paper share one pipeline** — PHASE_19_PLAN:240 (queued, last)
- **System Manual row conflict left by B-CROSS-SESSION-BLEED** — Langston archive
- **Two plan-identity collisions** — Langston 2026-09-22; found again building this draft

