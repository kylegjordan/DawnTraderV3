# B-PRICE-SIDE-BY-JOB — PRE-IMPLEMENTATION AUDIT **AND** IMPLEMENTATION PLAN (Step 2)

**change-class: architecture** · **Owner:** CC-C · **Reviewer:** Langston · **Plan row:** `3n` · **Scope:** `B_PRICE_SIDE_BY_JOB_SCOPE.md` (approved r4 + C1, `c9146ac09`)

> **ONE document. The AUDIT comes first and the PLAN falls out of it.** Every plan item back-references the finding it derives from; anything unaudited is flagged `UNAUDITED`.

---

## 0. ⛔ PREVIOUSLY STATED / NOW — every number that moved since the scope

> **At the TOP, not in a footnote: the reader is deciding whether to approve a plan built on these.**

| # | PREVIOUSLY STATED (scope / my messages) | NOW | REASON |
|---|---|---|---|
| 1 | *"Signal generation reads a mid"* (scope §2, job 1) | **Signal generation reads a KALMAN-SMOOTHED mid whose gain has a median of 0.0952** — each new tick moves the estimate by <10% | measured, `n=104,465` (A-4). The scope's own OBJ-2 taxonomy could not classify it (Langston FINDING-1); the audit now quantifies how far from a mid it is |
| 2 | *"the level-setting sites"*, illustrated by 2 line numbers | **70 construction sites across 19 files, 10 of them individual strategies** | the census (A-2). The scope's citations were the pattern-lane fallback and were demoted to illustration at r2 |
| 3 | MCE pass-through **UNVERIFIED**, and r1 then over-generalised the answer to *all* strategies (Langston's stated limit, carried verbatim into the scope) | ✅ **CONFIRMED PASS-THROUGH, verbatim** — `market-context-engine.ts:1431-1434` places the parameter into `indicators` by shorthand, untransformed | A-3. His open limit is discharged, by me, at the object |
| 4 | *"the damage is DELAY, not the half-spread"* → then corrected to *"a STATIC OFFSET, not lag"* (Langston Q3c) | **BOTH are second-order on the LEVEL side.** The dominant term there is a **real** lag — the filter's, ~10-observation memory — which is a different mechanism from either | A-4/A-5. Stated so the two corrections are not read as converging on one cause |
| 5 | — (not previously stated) | **`clearKalmanFilter` and `restoreState` have ZERO production callers** | A-5 census |
| 6 | r1 A-3: *"the strategies build levels from the smoothed value, verbatim"* | ⛔ **FALSE for the PATTERN lane — its basis is a BAR CLOSE (`:2207`), reached through a SECOND `computeContext` at `:2233`** | Langston BLOCKER-1, re-derived by me. **The sentence P3/P4 were sized against.** |
| 7 | r1: chain refs `:2456`, `:2513`; RTB fabrication `:1789` | **`:2450`, `:2515`, `:1788`** | checked line-by-line at the object; `:2456` and `:2513` are a comment and `vwap` |
| 8 | r1 unsettled #3: *"K measured on ~6 h only"* | ⭐ **STRUCK — it generalises BY CONSTRUCTION; `R`/`Q` carry no price quantity** | A-4. **I hedged a result that was stronger than stated** |
| 9 | r1 A-5: restart-wipe INFERRED from a zero-caller census | ✅ **MEASURED with a control: 190 cold seeds in the 10 min after the restart vs 6 in a no-restart control window** | A-5. `[9.3][RESET]=0` is corroboration only — `reset()` is reachable solely from the zero-caller function |

---

# PART A — THE AUDIT

## A-1. ⛔ ENTRY POINTS ENUMERATED FIRST, REPO-WIDE, BEFORE ANY TRACE (§9.5(a-ii))

**Tracing forward from one entry point structurally cannot discover a second.** Enumerated before tracing, tests excluded:

**SIX clock subscribers** — `centralClock.subscribe`: `XstockSpotScanner` (`xstock_spot/scanner.ts:251`) · `TCL_<mode>` (`core/rtb/tcl_watchdog.ts:126`) · `trading_scheduler.ts:66` · `FX5Scanner` (`fx5-scanner.ts:611`) · `RTBRefreshService` (`rtb-refresh-service.ts:214`) · `MarketEventScheduler` (`utils/market-events.ts:411`).
**PLUS two own-timer entry points** in `signal-orchestrator.ts` — `:414` `evaluationTimer`, `:419` `weightsRefreshTimer`.

⇒ ⭐ **THE PAYOFF, AND IT IS EXACTLY WHAT THE RULE EXISTS FOR: `RTBRefreshService` IS AN ENTRY POINT A FORWARD TRACE FROM THE SCANNER NEVER VISITS.** It re-confirms and re-ranks already-generated signals on its own clock tick. **A trace that started at the scanner and followed the signal would have concluded that levels are set once, at generation.**
✅ **CHECKED AT THE OBJECT: the refresh path does NOT re-derive entry/stop/target.** `core/rtb/ready_to_buy_service.ts:776-778` **parses** the stored values (`parseFloat(signal.entryPrice…)`) — it is a READER. **Stated explicitly because an asserted absence needs presence-evidence (rule 22).**
⚠️ **BUT IT DOES FABRICATE ONE:** `:1788`, inside `rMultipleCore` (the RANKING path), `const target = (p.target != null && Number.isFinite(p.target)) ? p.target : p.entry * 1.02` — commented *"mirror executePromotedSignal default"*. **A ranking input invented from a constant** — the `#927` target-fabrication class, reached on the ranking leg. **Carried to OBJ-5, which is the ranking objective.**

### A-1b. ⛔⛔ AND A-1's OWN ENUMERATION DID NOT REACH THE SECOND LANE — THE GAP IS IN THE RULE'S SHAPE, NOT MY EXECUTION OF IT

**§9.5(a-ii) says: enumerate every SCHEDULER, TIMER, CLOCK SUBSCRIPTION, `.start()`, BOOTSTRAP and CRON, repo-wide, before tracing.** I did, and it is complete: six subscribers, two timers.
⇒ ⛔ **THE PATTERN LANE IS NOT AN ENTRY POINT. IT IS A SECOND PASS INSIDE ONE ENTRY POINT'S OWN FUNCTION** — so a correct, exhaustive entry-point enumeration cannot surface it, and mine did not.
★ **THE GENERAL LESSON, AND IT BELONGS IN THE LEDGER RATHER THAN IN THIS BATCH: `9.5(a-ii)` FINDS UNREACHED HOPS; `9.5(a)` FINDS SECOND ACTORS AT A VISITED HOP. NEITHER ASKS "DOES THIS ONE FUNCTION CARRY TWO BASES?"** ⇒ the discriminator that would have caught it is **not** a census of callers but a census of **ASSIGNMENTS TO THE VARIABLE THE HOP CONSUMES** — which is what BLOCKER-2's lane column and the sink-inversion below now institutionalise.

## A-2. THE LEVEL-CONSTRUCTION CENSUS — 70 SITES, 19 FILES

**Repo-wide, production only, `_archive` and tests excluded:** 70 sites computing an `entryPrice` / `stopPrice` / `targetPrice` / `stopLoss` / `takeProfit` from arithmetic, across **19 files** — `ready_to_buy_service.ts`, `routes.ts`, `active-execution-engine.ts`, `pattern-recognizer.ts`, `signal-orchestrator.ts`, `strategy-engine.ts`, `vts-runner.ts`, `vts-service.ts`, `export-csv.ts`, and **10 individual strategies** (`adaptive-flow`, `defensive-hedge`, `inside-bar-reversal`, `morning-star`, `orb`, `pivot-shift`, `reverse-impulse`, `strong-bull-trend`, `support-bounce`, `volatility-edge`).

⇒ **The scope's estimate of the surface was an order of magnitude low**, and its two illustrative citations were the pattern-lane fallback (demoted at r2). **This is the number the plan is sized against.**

## A-3. ✅ THE CHAIN, ESTABLISHED END TO END — AND LANGSTON'S OPEN LIMIT IS DISCHARGED

`signal-orchestrator.ts:2400` `getSmoothedPrice(symbol, rawPrice, ER, VolNoise)` → `:2425` `const currentPrice = smoothedPrice` → `:2450` `mce.computeContext(…, currentPrice, …)` → `market-context-engine.ts:1225` (param; **its own doc at `:1218` says *"Smoothed current price (from Kalman filter or raw)"***) → **`:1431-1434` `const indicators: MarketIndicators = { vwap, sma, currentPrice, … }`** → `signal-orchestrator.ts:2515` `currentPrice: mceContext.indicators.currentPrice` → the 19-strategy dispatch → the 70 sites of A-2.

⛔ **THE VERIFICATION LANGSTON EXPLICITLY LEFT OPEN — *"I did NOT verify MCE passes it through unchanged"* — IS CLOSED: it is a SHORTHAND PROPERTY at `:1434`. No transformation, no re-derivation, no fallback.**

⛔⛔ **BUT r1's HEADLINE — *"the value the strategies build levels from is the smoothed value, verbatim"* — WAS FALSE, AND IT IS THE SENTENCE P3 AND P4 WERE SIZED AGAINST (Langston BLOCKER-1, re-derived by me at the object).** ★ **THERE ARE TWO `mce.computeContext` CALLS IN THE SAME FILE, WITH TWO DIFFERENT BASES:**

| lane | call site | its basis | verified |
|---|---|---|---|
| **QUANT** | `signal-orchestrator.ts:2450` | `:2425` `currentPrice = smoothedPrice` ⇒ **a FILTERED mid** | the chain above |
| ⛔ **PATTERN** (Phase 14.5) | `signal-orchestrator.ts:2233` | **`:2207` `const currentPrice = parseFloat(ohlcData[ohlcData.length - 1].close)`** ⇒ **a BAR CLOSE. Never smoothed, never a mid.** | read at the object |

**The pattern lane flows through the SAME `:1434` shorthand and reaches level construction at `:2269` (`patternToTradeSignal(patternSig, currentPrice, atr, …)`) and `:2276-2278`.**
⇒ ★★ **"SHARED PIPELINE" IS NOT A BOOLEAN — NAME THE SEAM.** Shared **from `computeContext` down**; **NOT shared at the basis assignment above it.** *(Langston's own `#675` retraction shape, and he named it as such.)*
⚠️ **AND THIS LANE HAS FORM: `#581` / `B-ATR-SOURCE-FIX` was this same pass failing to re-stamp `sizingContext.atr`, and the surviving comment at `:2303-2307` is its scar tissue. A lane with a documented history of basis-mismatch was the last one to leave untraced.**

## A-4. ⭐⭐ THE MEASUREMENT THAT REFRAMES THE BATCH — THE LEVEL BASIS IS A **HEAVILY DAMPED** PRICE

**OBJECT:** the Kalman gain `K`, from every `[9.3][KALMAN]` line. **POPULATION:** the current `out.log`, **n = 104,465**.
**POSITIVE CONTROL:** the `[9.3]` emitter is demonstrably live — **208,662 lines in `out.log`, 0 in `error.log`** (a `console.log` emitter, correct stream per the PM2 split).

| min | p10 | **p50** | p90 | max |
|---|---|---|---|---|
| 0.0241 | 0.0821 | **0.0952** | 0.1094 | 0.5000 |

**64.9% of ticks have `K < 0.10`; 99.7% have `K < 0.25`; 0.0% exceed 0.90.**

⇒ ★★ **EACH NEW OBSERVATION MOVES THE LEVEL BASIS BY UNDER 10% OF ITS INNOVATION — AN EFFECTIVE MEMORY OF ROUGHLY 1/K ≈ 10 OBSERVATIONS.** The scope's *"signal generation reads a mid"* is materially understated: it reads a mid through a filter that discards ~90% of each tick.
⇒ ⛔ **AND THIS IS A GENUINE LAG, WHICH NEITHER OF MY TWO EARLIER MECHANISM CLAIMS WAS.** *"The mid lags the bid"* was wrong (a static half-spread offset — Langston Q3c). **The FILTER's lag is real, is on the level side, and is the larger term.** ⇒ **the two corrections do not converge on one cause and must not be reported as if they do.**
⇒ ⛔⛔ **IT ALSO KILLS THE NAIVE IMPLEMENTATION.** Swapping the filter's input from mid to bid does **not** move the level by half a spread — it moves it by `K ×` half a spread per tick, over ~10 ticks, **so for the whole convergence period every level is derived from a basis that is neither the old one nor the new one.**

⭐⭐ **AND THE DISTRIBUTION GENERALISES BY CONSTRUCTION — MY OWN STATED LIMITATION WAS TOO WEAK (Langston, tested rather than accepted; re-derived by me at `adaptive-kalman.ts:74-78`).** `R = max(1, min(50, 1 + (1−ER)·50))` and `Q = max(0.1, VolNoise·0.5)`: **NEITHER CARRIES A PRICE QUANTITY.** `K = P/(P+R)` with `P ← (1−K)P + Q`. ⇒ **`K` is SCALE-FREE — a function of two hardcoded constants and `ER` alone, independent of the symbol's price and of the market.** Steady state `K = (−Q+√(Q²+4RQ))/2R` ⇒ ≈0.061 at `R=25`, ≈0.27 at `R=1`. **The measured p10–p90 of 0.082–0.109 is what the constants PREDICT, not what this session happened to sample.**
⇒ ✅ **SO LIMITATION #3 BELOW IS STRUCK AS TOO WEAK: this is not a ~6-hour observation, it is a property of the code.**
⇒ ⭐ **AND `max = 0.5000` EXACTLY IS THE COLD-START VALUE** (`P=1`, `ER=1 ⇒ R=1 ⇒ K=0.5`). With 596 restarts, that tail is **restart signature, not market** ⇒ **steady-state damping is at least as heavy as measured. The direction of the error is favourable to the finding.**

⛔⛔ **AND P4 MUST NOT ARGUE THIS AGAINST KALMAN OPTIMALITY (Langston, and he is right):** there is no measured noise model here. **This is an adaptive EMA with an ER-driven α wearing a Kalman name** — the `SYSTEM_MANUAL` wording in P2 must say so rather than *"Kalman filter"* unqualified.
⇒ ✅ **THE DISCRIMINATOR P4 SHOULD MEASURE INSTEAD, STATED SO IT CANNOT DRIFT INTO ARGUMENT: an entry or a stop is a price the market must TOUCH; a smoothed price is an ESTIMATE of where price IS. A lagging basis makes REALISED trigger distance differ systematically from INTENDED trigger distance — and ASYMMETRICALLY with trend direction. That is measurable, and P4 measures it rather than reasoning about it.**

## A-5. ⛔ THE REGISTRY IS A CROSS-CUTTING SINGLETON THAT NOTHING PERSISTS, EVICTS, OR REGISTERS

**§9.5(a) census on `filterRegistry` (`utils/adaptive-kalman.ts:175`, a module-level `Map<string, AdaptiveKalmanFilter>`):**

| question | answer | evidence |
|---|---|---|
| who **writes**? | ⭐ **EXACTLY ONE** — `signal-orchestrator.ts:2400`. **Stated explicitly per rule 22.** | census |
| who **imports** it at all, in production? | ⭐ **EXACTLY ONE FILE** — `signal-orchestrator.ts:131` (`getSmoothedPrice`, `getKalmanFilter`) | census |
| who **deletes**? | ⛔ **NOBODY.** `clearKalmanFilter` (`:200`) is exported with **ZERO production callers** | census |
| who **persists / restores**? | ⛔ **NOBODY.** `getState`/`restoreState` (`:111`/`:134`) have **ZERO production callers** | census |
| does it **survive a restart**? | ⛔ **NO** | measured below |

⚠️ **`[9.3][RESET]` = 0 IS CORROBORATION, NOT A SECOND INDEPENDENT MEASUREMENT (Langston, and the ledger must not read it as two):** `reset()` is reachable **only** from `clearKalmanFilter`, so a zero-caller census already implies a zero count. `[9.3][RESTORE]` = 0 against **208,662 live `[9.3]` lines** is the real observation on that leg.

✅ **THE RESTART WIPE IS NOW MEASURED DIRECTLY, WITH A CONTROL — replacing the inference.** The filter emits `[9.3][INIT] <sym> seeding Kalman with first price …` on a cold seed (`adaptive-kalman.ts:70`). In `out__2026-09-04_00-00-00.log` (spanning 13:36→00:00, i.e. **covering both of tonight's deploys**), **448 `INIT` lines total**:

| window | `[9.3][INIT]` lines |
|---|---|
| **the 10 min after the 19:28:48 restart** | **190** |
| ⭐ **a no-restart 10-min control (17:00–17:10)** | **6** |

⇒ **A 32× SPIKE AT THE RESTART, AGAINST A CONTROL FROM THE SAME FILE AND THE SAME DAY.** The registry does not survive a restart: every symbol re-seeds cold, and **the FIRST post-restart observation is returned RAW and unsmoothed** (`:70-71` seeds and returns `price`), so the level basis is discontinuous at every deploy before it re-damps.
⚠️ **`restart_time=596` at tonight's deploy.** This is verbatim the class the deploy step warns about — *"a deploy wipes every in-memory rolling window… the component then reports its COLD behaviour while presenting as normal"* — with the AMR EV-gap window as the measured precedent.
⇒ ⭐ **AND `clearKalmanFilter` IS THE EXACT MECHANISM A BASIS CHANGE NEEDS, SITTING UNUSED.** It is not dead code to delete under rule 18; it is **dead code this batch has a use for**. Disposition **(3) — disconnected, should be RECONNECTED.**

## A-6. THE PROVENANCE READ — **THREE COMPONENTS, THREE READS, ONE SHAPE**

**CORPORA SEARCHED:** `git log -S`, not path-limited (survives the P19-B-RENAME family rename) · `RUNNING_ISSUES` · `BATCH_CATALOG` · the completion reports · `SYSTEM_MANUAL` · `SYSTEM_IMPACT_MAP` · `bridge/canonical/`.

| component | introducing commit, **quoted** | stated intent | disposition |
|---|---|---|---|
| **crypto mid** (`kraken-v2-translator`) | `b4c0d2d67` 2025-12-30 — *"implement midpoint pricing for improved accuracy on low-volume pairs"* | a better **MARK** than a stale last trade | **(2)** |
| **xStock mid** (`equity-spot-archiver:104`) | `P19-B8.5`, *"Langston design-APPROVED 2026-07-16"* | a better **MARK**; `markKindOf` falls back to `last` when **either** side is missing | **(2)**, with §9.5(b-ii) caution — an approved decision |
| **the Kalman filter** (`adaptive-kalman`) | `8b6a18ba9` 2026-01-01 — *"Implement Adaptive Kalman Filter class and Efficiency Ratio calculator, **integrating them into core metrics and system diagnostics**"* | ⭐ **"CORE METRICS AND SYSTEM DIAGNOSTICS" — NOT LEVELS** | **(2)** |

⇒ ★★ **THE THESIS OF THIS BATCH, NOW EVIDENCED THREE TIMES FROM THREE INDEPENDENT PROVENANCE READS: EVERY PRICE COMPONENT ON THIS PATH WAS CHOSEN FOR AN *ESTIMATION* JOB AND SILENTLY INHERITED A *DECISION* JOB.** Not one of the three is a defect. **The defect is the inheritance, and it is invisible at every individual site.**

**⛔ RECORDING RULE — A MEASURED ABSENCE, WITH ITS CONTROL:** `bridge/canonical/` contains **14 files** and matches *"regime"* in **10** of them (the positive control), and matches *"kalman"* in **ZERO**. ⇒ **the pre-governance corpus does not document the smoothing at all**, so its original intent is recoverable **only** from the commit above. **That silence is itself the finding**, per the rule.

## A-7. ⛔ GOVERNANCE GAPS — BOTH MAPS ARE SILENT ON A COMPONENT THAT SETS EVERY CRYPTO LEVEL

- **`SYSTEM_IMPACT_MAP.md`: ONE mention of "kalman", at `:475`, incidental (inside an LQ/VN/DI entry).** ⇒ **`filterRegistry` is NOT in the Cross-Cutting Runtime State registry** — despite being a module singleton, per-symbol, mode-invariant, never persisted, wiped on restart, and feeding the level basis of every crypto signal. **That is precisely the class `S25`, `S2` and `S24` are registered under.** §9 rule 5 breach.
- **`SYSTEM_MANUAL.md`: 4 mentions, all incidental** — a tuning aside (`:900`), a phase index (`:10132`), a strengths table (`:10443`), and a **TEST-INVENTORY row (`:10000`)** listing the Kalman tests as covering *"filter registry, state persistence."* ⚠️ ★ **THE MANUAL ADVERTISES COVERAGE OF A CAPABILITY THE SYSTEM DOES NOT USE** — A-5 measured zero production callers for persistence. **No architectural section anywhere states that the signal pipeline's level basis is a filtered price.** §9 rule 4 breach.

---

# PART B — THE IMPLEMENTATION PLAN

> **Every item back-references its audit finding. `UNAUDITED` is flagged.** ⛔ **The scope's deploy gate binds all of it: NO CRYPTO DEPLOY BEFORE `F-G-2`'s DISPOSITION IS RECORDED AT THE REF.** Items P1-P4 are read/write-to-docs and run now.

| # | item | from | gate |
|---|---|---|---|
| **P1** | **Register `filterRegistry` in the SIM as a cross-cutting singleton** — one writer, no eviction, no persistence, restart-cold, feeds every crypto level. | **A-5, A-7** | none — do now |
| **P2** | **System Manual: state that the crypto QUANT-lane level basis is a SMOOTHED price** (gain, ~10-observation memory) **and that the PATTERN lane's is a BAR CLOSE**; correct the test-inventory row advertising unused persistence. ⛔ **It must NOT say *"Kalman filter"* unqualified — there is no measured noise model; it is an ADAPTIVE EMA with an ER-driven α (A-4).** | **A-3, A-4, A-7** | none — do now |
| **P3** | ⛔⛔ **REBUILT BY SINK-INVERSION, AND IT CARRIES A LANE COLUMN (Langston BLOCKER-2 + attack-1).** **Price-kind is not a property of a SITE; it is a property of `(site, lane)`** — one file carries two bases (A-3), so 70 rows with a bare price-kind column would be **70 assertions I cannot ground.** ⇒ **Do NOT try to prove the census complete by grepping harder — that is unprovable.** ★ **INVERT IT: every level is ultimately WRITTEN to a persisted `entryPrice`/`stopPrice`/`targetPrice` field. Census the WRITE sites and walk BACKWARD.** That set is closed and checkable, so the census is **complete BY CONSTRUCTION OVER THE SINK** rather than lower-bounded by a pattern — **and the lane column falls out of the same walk.** | **A-2, A-3, A-1b** | none — do now |
| **P4** | **OBJ-2's rule against a FOUR-kind taxonomy** (transactable side / mid / bar close / **filtered**), re-tested against all 70 rows. ⛔ **DRAFTED against crypto-quant; it CANNOT CLOSE while any row is unclassifiable — which is my own falsification clause, held against me rather than a new gate (Langston).** **THREE lanes remain untraced: crypto-PATTERN, xStock-active, xStock-VTS.** ⛔ **And it argues the DISCRIMINATOR in A-4 — realised vs intended trigger distance, asymmetric with trend — NEVER Kalman optimality.** | **A-2, A-3, A-4** | none — do now |
| **P5** | **Reconnect `clearKalmanFilter` as the basis-change mechanism** — a basis change MUST flush the registry, or every symbol spends ~10 observations on a mixed basis. Disposition (3), not rule-18 deletion. | **A-4, A-5** | ⛔ deploy-gated |
| **P6** | **OBJ-3a** per-leg transactability fence + positive control. | scope OBJ-3a | ⛔ deploy-gated |
| **P7** | **OBJ-3b** counter/assertion, form chosen at deploy from `F-G-2`'s recorded disposition. ⭐ **ITS NAMED READER AND POSITIVE CONTROL ALREADY EXIST AND ARE DEAD: `getAllKalmanDiagnostics` and `getActiveFilterCount`, zero production callers — disposition (3) RECONNECT, same as `clearKalmanFilter` (Langston fold-in).** The counter ships with reader, cadence and control or not at all. | scope OBJ-3b, **A-5** | ⛔ deploy-gated |
| **P8** | **OBJ-5 ranking argument** — disposing of `rMultipleCore`'s `entry * 1.02` fabricated RANKING target (`:1788`) **AND of `signal-orchestrator.ts:2277-2278`'s `currentPrice*0.97` / `*1.03`, because the `#927` fabrication class is on the SIGNAL-BIRTH leg too, not only ranking (Langston fold-in).** | **A-1, A-3** | none — do now |
| **P9** | **OBJ-6** — fix the System Manual siting of the 8.9.1 adjudication. | scope OBJ-6 | none — do now |

## ⛔ WHAT THE AUDIT DID **NOT** SETTLE, STATED AS UNSETTLED

1. **Whether the filter should sit in front of the LEVEL at all.** Its provenance says *core metrics and system diagnostics*; nothing establishes that a damped price is the right basis for a stop. **That is the real question P4 must answer, and the audit does not pre-judge it** — measured via A-4's discriminator, never argued.
2. ⛔ **THREE LANES REMAIN UNTRACED, NOT ONE (corrected from r1, which named only xStock):** **crypto-PATTERN** (found at A-3 and NOT traced beyond its basis assignment), **xStock-active** and **xStock-VTS**. **Stated as gaps rather than assumed symmetric** — the two mid producers already differ in fallback (A-6), and the two crypto lanes already differ in basis (A-3).
3. ✅ **STRUCK — r1 SAID `K`'s DISTRIBUTION WAS *"a ~6-hour observation, not a claim about all time."* THAT WAS TOO WEAK AND UNDER-CLAIMED THE FINDING.** `R` and `Q` carry no price quantity, so `K` is scale-free and the distribution **generalises by construction** (A-4). ★ **Recorded because the error ran in the unusual direction: I hedged a result that was stronger than I said.**
4. **The `n=104,465` K distribution and the 208,662/0 line counts are staging-log measurements Langston did NOT re-run** — he tagged that leg `RULED ON REPORTED FACT` and said the verdict does not turn on it. **Carried here so a later reader does not mistake it fortwo-party-verified.** The A-5 `INIT` 190-vs-6 control is likewise mine alone.

---

## STATUS

**Step 2 — audit + plan written, dispatched to Langston.** Board card `Pre-Audit`, `Blocked on = Langston`.
