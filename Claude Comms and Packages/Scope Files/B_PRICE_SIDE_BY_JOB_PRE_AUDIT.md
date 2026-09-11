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
| 10 | r2 A-1b: *"a correct entry-point enumeration structurally cannot surface the pattern lane"* | ⛔ **FALSE — `evaluateMarket` (`:1973`) CALLS `evaluateSymbol` (`:2106`), and the pattern basis is in `evaluateMarket`'s own body. The entry point DOES reach it; I stopped reading at the call I was following.** | Langston BLOCKER-3. **An execution gap, not a rule-shape gap — and it must not be filed as a §9.5 defect** |
| 11 | r2 A-4: *"`K` is a function of two hardcoded constants and `ER` alone"* | **drops `Q`, which is `VolNoise`-driven.** Conclusion survives: `VolNoise` is MAD/median of ABSOLUTE LOG RETURNS ⇒ dimensionless ⇒ `K = f(ER, VolNoise)`, both dimensionless | Langston, who verified the reason rather than leaving a right answer on a wrong derivation |
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

### A-1b. ⛔⛔ WHY I MISSED THE SECOND LANE — AND r2's ANSWER TO THAT QUESTION WAS ITSELF FALSE

⚠️⚠️ **r2 CLAIMED THE GAP WAS IN THE RULE'S SHAPE — *"the pattern lane is not an entry point, so a correct enumeration structurally cannot surface it."* THAT IS FALSE AT THE OBJECT (Langston BLOCKER-3, re-derived by me), AND IT IS THE PARAGRAPH I HAD ASKED HIM TO PUT IN THE LEDGER.**

**MEASURED:** `signal-orchestrator.ts:1973 private async evaluateMarket()` · `:2360 private async evaluateSymbol(` · **`:2106` — `evaluateMarket` CALLS `evaluateSymbol`** (`:2366-2367` says so verbatim: *"evaluateSymbol was extracted out of evaluateMarket"*). The pattern basis `:2207` is in **`evaluateMarket`'s own top-level body**; the quant basis `:2425` is inside `evaluateSymbol`.
⇒ ⛔ **SO THE ENTRY POINT `:415` → `evaluateMarket` DOES REACH IT. A forward trace from my own enumerated entry point that READ THAT FUNCTION TO ITS END hits the Phase-14.5 loop.** I followed the `:2106` call into `evaluateSymbol` and stopped. **AN EXECUTION GAP, NOT A RULE-SHAPE GAP.**
⇒ ⛔⛔ **AND r2's PROPOSED DISCRIMINATOR — *"does this ONE FUNCTION carry TWO BASES?"* — WOULD NOT HAVE CAUGHT IT EITHER: NO FUNCTION DOES.** The two bases live in two different functions.
✅ **THE DISCRIMINATOR THAT ACTUALLY FIRES IS THE ONE P3 ALREADY IMPLEMENTS: a census of ASSIGNMENTS TO THE CONSUMED IDENTIFIER.** `const currentPrice =` occurs **exactly twice in this file — `:2207` and `:2425`** — and that two-line census settles it instantly.

⛔ **THIS IS NOT FILED AS A §9.5 GAP. Filing *"the rule could not reach this"* on a case the rule DOES reach would erode the rule on a false premise — the `#453` shape, aimed at our own governance.** ⇒ **It is filed as a new instance of `enumerator-blind-spot` with the corrected diagnosis: I stopped reading a function at the call I was following.**

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

⭐⭐ **AND THE DISTRIBUTION GENERALISES BY CONSTRUCTION — MY OWN STATED LIMITATION WAS TOO WEAK (Langston, tested rather than accepted; re-derived by me at `adaptive-kalman.ts:74-78`).** `R = max(1, min(50, 1 + (1−ER)·50))` and `Q = max(0.1, VolNoise·0.5)`: **NEITHER CARRIES A PRICE QUANTITY.** `K = P/(P+R)` with `P ← (1−K)P + Q`. ⇒ **`K` is SCALE-FREE — independent of the symbol's price and of the market.**
⚠️ **r2 SAID *"a function of two hardcoded constants and `ER` alone"*, WHICH DROPPED `Q` — and `Q` is `VolNoise`-driven, not a constant (Langston).** ✅ **THE CONCLUSION SURVIVES, and he verified WHY rather than letting me keep a right answer for a wrong reason: `calculateVolNoise` (`analysis-utils.ts:139-169`) is the MAD-over-median of **ABSOLUTE LOG RETURNS** ⇒ itself dimensionless ⇒ `Q` carries no price quantity either.** ⇒ **scale-free stands, now on the full derivation: `K = f(ER, VolNoise)`, both dimensionless.** Steady state `K = (−Q+√(Q²+4RQ))/2R` ⇒ ≈0.061 at `R=25`, ≈0.27 at `R=1`. **The measured p10–p90 of 0.082–0.109 is what the constants PREDICT, not what this session happened to sample.**
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

### A-6b. ⛔⛔ THE FULL CORPUS SEARCH KYLE ASKED FOR — AND IT SETTLES THE INTENT QUESTION OUTRIGHT

**KYLE, 2026-09-04:** *"confirm that you already did look through all of the batch reports, the archival reports, and governance documents that describe this and explain the intention… does that intention still have relevance in what we're trying to do now? My guess is it does not."*

**RUN, NOT ASSERTED. Every governance and batch corpus, for `kalman|getSmoothedPrice|smoothedPrice`, with `regime` as the positive control on the same corpora:**

| corpus | smoothing | **`regime` (control)** |
|---|---|---|
| `1-system-manual/` | **4** | 69 |
| `Claude Comms and Packages/` | **3** *(two of which are THIS BATCH's own documents ⇒ **1 genuine prior**)* | **763** |
| `bridge/canonical/` | **0** | 10 |
| `1-system-manual/_archive/` | **0** | — |

⇒ ★★ **THE ENTIRE PRIOR RECORD IS FIVE FILES, AND NOT ONE OF THEM CONNECTS THE SMOOTHED PRICE TO A TRADE LEVEL.** Read at the object:
- **`sections/PHASE1_CORE_MATH_AND_SCORING.md:453`** — *"ER … Used by Adaptive Kalman Filter for tuning"*. A **metrics** context.
- **`Scope Files/BATCH_19G_VN_SCOPE.md:76,:120`** — the filter appears in a **blast-radius table** beside *Trailing Exit Controller*, *Expectancy Scoring* and *Filter Insights*, and its only stated risk is *"Kalman filter becomes too responsive"*. A **noise-tuning** concern.
- **SIM `:475`** — incidental, inside an LQ/VN/DI entry. **System Manual** — a tuning aside, a phase index, a strengths table, and a test-inventory row.

⇒ ⛔⛔ **KYLE'S GUESS IS CONFIRMED AT THE OBJECT: THE ORIGINAL INTENT HAS NO RELEVANCE TO LEVEL-SETTING, BECAUSE LEVEL-SETTING WAS NEVER IN THE INTENT.** The commit says *"core metrics and system diagnostics"*; five years of governance documents say metrics, tuning and noise. **Nothing anywhere claims it should price a stop.** ⇒ **the level-setting use is not a decision anyone made and defended. It is an inheritance, and it has never been argued for in writing.**

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
| **P3** | ⛔⛔ **REBUILT BY SINK-INVERSION, AND IT CARRIES A LANE COLUMN (Langston BLOCKER-2 + attack-1).** **Price-kind is not a property of a SITE; it is a property of `(site, lane)`** — one file carries two bases (A-3), so 70 rows with a bare price-kind column would be **70 assertions I cannot ground.** ⇒ **Do NOT try to prove the census complete by grepping harder — that is unprovable.** ★ **INVERT IT: every level is ultimately WRITTEN to a persisted `entryPrice`/`stopPrice`/`targetPrice` field. Census the WRITE sites and walk BACKWARD.** That set is closed and checkable, so the census is **complete BY CONSTRUCTION OVER THE SINK** rather than lower-bounded by a pattern — **and the lane column falls out of the same walk.** ⛔⛔ **CONDITION (Langston, approved-as-designed with one addition): *complete by construction over the sink* IS ONLY AS COMPLETE AS THE SINK ENUMERATION.** ⇒ **(i) NAME THE SINK SET EXPLICITLY**, and **(ii) USE THE 70-SITE GREP CENSUS AS THE POSITIVE CONTROL FOR THE BACKWARD WALK — every site the walk fails to recover is enumerated as DEAD or as a MISSED SINK, never silently dropped.** ⛔ **The class to look for FIRST, because it is invisible to the walk by construction: a level that gates a trigger IN MEMORY and is never written to a persisted `entryPrice`/`stopPrice`/`targetPrice` column — trailing / TEC recomputation.** | **A-2, A-3, A-1b** | none — do now |
| **P4** | **OBJ-2's rule against a FOUR-kind taxonomy**, re-tested against all 70 rows. ⛔ **DRAFTED against crypto-quant; CANNOT CLOSE while any row is unclassifiable** — my own falsification clause. **THREE lanes untraced: crypto-PATTERN, xStock-active, xStock-VTS.** ⛔⛔ **AND THE SMOOTHED PRICE IS NOT AN OPEN QUESTION FOR THIS OBJECTIVE — KYLE CORRECTED ME AND HE IS RIGHT (2026-09-04).** r3 said the audit *"deliberately does not pre-judge"* whether a damped price is the right basis for a stop. ★ **THAT WAS OVER-CAUTION THAT BECAME ITS OWN ERROR: THE RULE ALREADY ANSWERS IT.** A level must be a price we could TRANSACT at; **a smoothed average of past prices is BY CONSTRUCTION not transactable — no counterparty ever offered it.** ⇒ **it is DISQUALIFIED AS A LEVEL BASIS BY THE RULE, and there is nothing to observe to decide that.** ⚠️ **Kyle's own words, and they are the argument: *"if it's an average and acts as a midpoint or similar to a midpoint, then we shouldn't be using smoothing averages"*.** ⇒ **What A-4's discriminator now measures is the SIZE OF THE DAMAGE, not the decision** — and it is not a gate on the fix. | **A-2, A-3, A-4, A-6b** | none — do now |
| **P5** | ⭐⭐ **SIMPLIFIED BY KYLE'S CORRECTION, AND THE SIMPLER FIX IS THE SAFER ONE.** r3 planned to **change what feeds the filter** (mid → bid), which then REQUIRED a registry flush or every symbol would spend ~10 observations on a mixed basis. ⇒ ⛔ **THAT WAS SOLVING A PROBLEM THE WRONG FIX CREATED.** Under P4 we do **not** change the filter's input at all: **the LEVEL CONSTRUCTORS stop reading the filter's output** and read the transactable side instead. **No mixed-basis window, no flush, no convergence period — the failure mode is designed out rather than mitigated.** ⇒ ✅ **`clearKalmanFilter` is NOT reconnected for this. It returns to disposition (5): dead, and a candidate for `B-ORPHAN-ROOT-SCANNER`'s class of lingering legacy.** ⛔ **AND THE FILTER IS NOT REMOVED — see the boundary note below.** | **A-4, A-5, A-6b** | ⛔ deploy-gated |
| **P6** | **OBJ-3a** per-leg transactability fence + positive control. | scope OBJ-3a | ⛔ deploy-gated |
| **P7** | **OBJ-3b** counter/assertion, form chosen at deploy from `F-G-2`'s recorded disposition. ⭐ **ITS NAMED READER AND POSITIVE CONTROL ALREADY EXIST AND ARE DEAD: `getAllKalmanDiagnostics` and `getActiveFilterCount`, zero production callers — disposition (3) RECONNECT, same as `clearKalmanFilter` (Langston fold-in).** The counter ships with reader, cadence and control or not at all. | scope OBJ-3b, **A-5** | ⛔ deploy-gated |
| **P8** | **OBJ-5 ranking argument** — disposing of `rMultipleCore`'s `entry * 1.02` fabricated RANKING target (`:1788`) **AND of `signal-orchestrator.ts:2277-2278`'s `currentPrice*0.97` / `*1.03`, because the `#927` fabrication class is on the SIGNAL-BIRTH leg too, not only ranking (Langston fold-in).** ➕ **AND IT CORRECTS THE DRIFTED CITATIONS IN THE SAME BLOCK, found by Langston while checking mine (§9.4 disposition 1, fold):** the scar comment at `:2299-2307` (and `:1443`) cites **`:2165`** for the quant `atr` stamp — **the assignment is at `:2531`** (`sizingContext.atr = mceContext.indicators.atr`, verified) — and `:1949` / `:1905` / `:1548` have drifted too. **P8 already edits this block; the refs are corrected there rather than left for a later reader to trip on.** ⛔⛔ **AND P8 STATES THE CLASS, NOT JUST THE INSTANCES (Langston CONDITION-2 — his own `fix-follows-pointer` mechanism, applied to the batch that named the pattern).** **LANDED 2026-09-04: 3 stale refs corrected across 5 comment lines (1226, 1447, 2300, 2302, 2307) — `:2165`→`:2531`, `:1548`→`:1898`, `:1662`→`:1888`. All three verified at the object first: `:1548` is a BLANK LINE, `:1662` is a `btcOhlc` map, `:2165` is `quantStrategy:`. Post-fix control: each stale ref now returns 0 in comments; each replacement returns >0.**
⚠️⚠️ **THE CLASS IS NOT CLEARED, AND THE TWO CENSUSES DISAGREE — STATED RATHER THAN RECONCILED AWAY.** Langston enumerated **24 in-comment line citations**; my own pattern returns **15 DISTINCT cited line numbers** (`:1207 :1548 :1662 :1846 :1905 :2165 :464 :496 :531 :546 :581 :671 :764 :783 :788`). **The likely difference is occurrences vs distinct — but I have NOT reconciled it, and an unreconciled instrument disagreement is itself part of the residue.** ⇒ **7 were verified drifted (his 5 + the 2 he found while checking me); 3 are fixed here; the remainder are ENUMERATED AND UNVERIFIED — neither he nor I read each comment intent, and neither of us is fixing refs on the other's unverified enumeration.** ★ **Recorded because fixing the instance while leaving the class unstated is precisely the defect this fold was raised under.** | **A-1, A-3** | none — do now |
| **P9** | **OBJ-6** — fix the System Manual siting of the 8.9.1 adjudication. | scope OBJ-6 | none — do now |

## ⛔⛔ THE BOUNDARY THAT MUST NOT BE OVER-CUT — THE FILTER KEEPS ITS OWN JOB

⚠️ **"STOP USING THE SMOOTHED PRICE" IS RIGHT FOR LEVELS AND WOULD BE A RULE-24 OUTCOME-(1)-FOR-A-(3) ERROR IF APPLIED WHOLESALE.** `computeContext` produces **two different things** from that one input:

| what it produces | is smoothing right? |
|---|---|
| **the ESTIMATES** — ATR, VWAP, SMA, the regime classification, the noise metrics | ✅ **YES. This is exactly what the filter was built for** (A-6b: *"core metrics and system diagnostics"*), and a damped input is the CORRECT choice for a noise-sensitive estimator. **Untouched by this batch.** |
| **`indicators.currentPrice`** — which flows on to the 70 level constructors | ⛔ **NO. Disqualified by the rule (P4).** |

⇒ ✅ **THE CHANGE IS A SEVERANCE, NOT A REMOVAL: the filter keeps estimating; it stops pricing.** ★ **That is also why the fix is low-risk — nothing that currently consumes the filter for its designed purpose changes at all.**

## ⛔ WHAT THE AUDIT DID **NOT** SETTLE, STATED AS UNSETTLED

1. ✅ **STRUCK — r3 LISTED *"whether the filter should sit in front of the LEVEL at all"* AS UNSETTLED. KYLE CORRECTED IT AND HE IS RIGHT: THE RULE ALREADY SETTLES IT** (P4). ★ **Recorded because the error is instructive and it is mine: I deferred to an observation period a question that a rule we had already agreed answers outright — which is the exact treadmill Kyle has spent the day objecting to, reproduced inside the batch built to end it.** **What remains genuinely open is the SIZE of the damage, not the disposition.**
2. ⛔ **THREE LANES REMAIN UNTRACED, NOT ONE (corrected from r1, which named only xStock):** **crypto-PATTERN** (found at A-3 and NOT traced beyond its basis assignment), **xStock-active** and **xStock-VTS**. **Stated as gaps rather than assumed symmetric** — the two mid producers already differ in fallback (A-6), and the two crypto lanes already differ in basis (A-3).
3. ✅ **STRUCK — r1 SAID `K`'s DISTRIBUTION WAS *"a ~6-hour observation, not a claim about all time."* THAT WAS TOO WEAK AND UNDER-CLAIMED THE FINDING.** `R` and `Q` carry no price quantity, so `K` is scale-free and the distribution **generalises by construction** (A-4). ★ **Recorded because the error ran in the unusual direction: I hedged a result that was stronger than I said.**
4. **The `n=104,465` K distribution and the 208,662/0 line counts are staging-log measurements Langston did NOT re-run** — he tagged that leg `RULED ON REPORTED FACT` and said the verdict does not turn on it. **Carried here so a later reader does not mistake it for two-party-verified.** The A-5 `INIT` 190-vs-6 control is likewise mine alone.

---

## STATUS

**Step 2 — audit + plan written, dispatched to Langston.** Board card `Pre-Audit`, `Blocked on = Langston`.

---

## A-8. ⭐⭐ OBJ-5 — RANKING. **THE "NO CHANGE" ANSWER IS CORRECT AND ITS STATED REASON IS NOT**

**OBJ-5 required the no-change argument be made OUT LOUD rather than skipped by default (§9 anti-pattern), and it attached a trap-door clause: *"If ranking also sets a level, it is an OBJ-1 site and the rule governs it."*** ⇒ ⛔ **THE CLAUSE FIRES. It was not decoration.**

### ✅ THE ARGUMENT, MADE — AND IT SURVIVES
**A mid is the right basis for RANKING, and the reason is that ranking is a RELATIVE comparison.** Every candidate is scored on the same construction, so a bias common to all of them shifts every score by roughly the same amount and **does not reorder the pool.** ⇒ **Paying a half-spread of accuracy to buy a less noisy comparator is a good trade when the output is an ORDER rather than a price.** ★ **This is the same reasoning that keeps the smoothed value in the estimator job — and it is why the severance is a severance and not a removal.**
⛔ **AND ITS LIMIT, STATED: the argument is about a bias that is COMMON. It says nothing about a term applied to SOME candidates and not others.**

### ⛔⛔ WHICH IS EXACTLY WHAT THE POOL DOES — `ready_to_buy_service.ts:1789`
```
const target = (p.target != null && Number.isFinite(p.target)) ? p.target : p.entry * 1.02; // mirror executePromotedSignal default
```
**This sits inside `rMultipleCore`, whose output `r` IS the sort key**, and it feeds `evaluateTradeExpectancy` directly. ⇒ ⛔ **A candidate WITH geometry is ranked on its own measured target; a candidate WITHOUT one is ranked on a flat 2%. Two sub-populations, two rules, one ordering.**
⇒ ★★ **SO THE NO-CHANGE VERDICT SURVIVES AND ITS JUSTIFICATION DOES NOT COVER THE POOL AS IT ACTUALLY IS.** The mid is applied identically; **the fabricated target is not**, and the identity clause was doing all the work.
⚠️ **THIS DOES NOT MAKE THE MID WRONG FOR RANKING.** It removes ONE thing from the set that argument was protecting. **Stated precisely because the tempting move is to let a real finding widen a settled verdict.**

### ✅ ALREADY FILED — THIS IS A CROSS-REFERENCE, NOT A FINDING (§9.5(b-ii), and the check WORKED)
**`RUNNING_ISSUES` `#927` OPEN 2026-08-28 — *"THE PROMOTION PATH INVENTS A TARGET PRICE IN THREE PLACES, AND ONE OF THEM IS THE RANKING KEY."*** ⛔ **Mine, filed a week ago, and it names `ready_to_buy_service.ts:1788` and the ranking key explicitly.** ★ **The ledger search found it by the SYMBOL, not by the symptom — the search discipline that took seven weeks to find `#174` the other way round.**
⇒ ✅ **NO NEW ISSUE. The two new arguments are recorded ON `#927`:** (i) the P4 rule disqualifies `entry × 1.02` on a second independent ground — **it is not a price at all**, never printed, never quoted, carrying no age because nothing observed it; (ii) the identity-clause breakage above. **Home unchanged: `B-TARGET-FABRICATION`, owner CC-C.**
⚠️ **THE LIVE SIBLING IS CONFIRMED AT THE OBJECT, since `#927` cites a line number that has moved:** `active-execution-engine.ts:3315` — `const targetPrice = signal.targetPrice ? parseFloat(signal.targetPrice) : entryPrice * 1.02; // Default 2% target`. ⇒ **the ranking fallback's comment (*"mirror executePromotedSignal default"*) is ACCURATE, and the promotion-path twin is live.**

### ⛔ SIZING ATTEMPTED, NOT ESTABLISHED — AND THE ZERO IS DELIBERATELY NOT REPORTED AS A RESULT
**I tried to measure the share of ranked candidates that hit the fallback. `rtb_signals` returned `0.00%` — on `n = 1`.** ⛔ **That number is discarded, not carried.** **CONTROL RUN BEFORE DRAWING ANY CONCLUSION:** the table holds **exactly one row in total**, `MIN(queued_at) = MAX(queued_at) = 2026-09-04 20:10:26.943+00`, **0 promoted, 0 expired** ⇒ **it is a LIVE QUEUE that drains, not a history table.**
★ **A `0%` read off a drained queue is `#661` leg 3 wearing a new costume: an instrument with no reach reporting a clean result.** ⇒ **the rate is UNSIZED, the right population is whatever durably records what the pool ranked, and finding it belongs to `B-TARGET-FABRICATION` — not to this batch.**

### ✅ DISPOSITION
**OBJ-5 ANSWERED: ranking keeps the mid. Argument stated, its limit stated, and the one site where the limit bites is cross-referenced to `#927` with two new arguments recorded there.** **No scope change to this batch.**


---

# r5 ADDENDUM — AUDIT AND PLAN FOR SCOPE §7 (2026-09-11)

- **Scope:** `B_PRICE_SIDE_BY_JOB_SCOPE.md` §7, approved as r5 by Langston at 15:02Z with five conditions.
- **Decisions:** `Scope Files/PRICING_DECISIONS_2026-09-11.md`.
- **Code read at:** `origin/migration/aws-supabase`, `bf11b34e9` or later.
- **Order:** the audit comes first, and the plan falls out of it. Each plan item names the finding it rests on.

## A-9.0 PREVIOUSLY STATED / NOW

| # | previously stated | now | reason |
|---|---|---|---|
| 1 | §1.1: "two midpoint producers". Langston r5 finding A: "a THIRD" | **Five price-bearing midpoint sites**, plus seven value-estimate uses that D4 permits (A-9.1) | A repo-wide pattern census |
| 2 | F-G-2's rider commits `f36c8f496` and `f2cc6ee29` were "undeployed, on hold" (Langston r5 finding C) | **Both are ancestors of the deployed head `29cce1076`** (`git merge-base --is-ancestor`, run on each). The shadow instrument, riders included, is LIVE | A check at the object |
| 3 | D3's basis enum has four values: `book_top`, `ticker_bbo`, `ticker_default`, `venue_close` | **It needs a fifth value, `rest_ticker`.** Two REST paths produce prices (A-9.1 rows 3-4) | The census |
| 4 | `#971` cites the gate as `aee:1277`, the else-arm as `:1289-1300`, and the limiter as `live-pricing-adapter.ts:627` | The gate is `aee:1493`, the else-arm `:1505-1532`, and the limiter `:714` | Re-derived; corrected on `#971` in this commit |
| 5 | Scope §7.3 row 7h: the limiter goes "on the direct REST call path" | The limiter must reach the **engine's** leg: `aee:1516` → `kraken.ts:259 getTicker` → a bare `fetch`. The adapter's leg at `:714` is already limited | Langston finding B, re-derived at the object |

## A-9.1 CENSUS — EVERY SITE THAT COMPUTES A MIDPOINT

**Method:** a repo-wide search, tests excluded, for `(bid+ask)/2` written in either order (including the `bestBid`/`bestAsk` forms), and for `markKindOf(`.
**Positive control:** the search returns the already-known translator site (row 1), so the instrument can see this form.

| # | site (origin) | what it produces | consumer | rule | plan |
|---|---|---|---|---|---|
| 1 | `market-data/kraken-v2-translator.ts:72-73` (Directive 8.9.1) | the crypto WS ticker `c` field: the midpoint, or `last` when a side is missing. `a`/`b` carry ask/bid | v1-format consumers | D4: `c` stops being a level or trigger price. The venue `last` is kept in its own field | P-7i, P-7c |
| 2 | `passive-archive/equity-spot-archiver.ts:209` (P19-B8.5, Langston design-approved 2026-07-16) | the xStock mark | the xStock exit path (`xstock_spot/book-state.ts:9`) | D1/D3: exits read the bid. The mark stays as a valuation, with a basis label (D4-legal) | P-7c, P-8a |
| 3 | `active-execution-engine.ts:1531-1532` (8.9.2) | the exit REST-fallback price | that tick's exit decision | D1: a sell reads REST `b[0]`, not the midpoint. Basis `rest_ticker`. It is limited by P-7h | P-7h, P-8a |
| 4 | `live-pricing-adapter.ts:831` (8.9.2) | the REST poller price (`[8.8.3-I6][REST_FALLBACK]`) | the adapter's private cache | D3/D7: keep bid, ask and last separately, with basis `rest_ticker`. The midpoint is a valuation only | P-7c, P-7i |
| 5 | `kraken-websocket-adapter.ts:1063` → `emitPriceTick({ price: midpoint, producer: 'kraken_ws_book_mid', … })` (8.9.4-Patch; `#741`) | a book-derived midpoint emitted as `price`. The sides already travel with it | the live pricing cache | D3: the touch price is the book-top **sides**. `price` is a valuation only | P-7c, P-7d |
| 6 | `kraken-websocket-adapter.ts:3385` `getLatestPriceData` → `{ bid, ask, mid }` | an accessor | **one** caller: `monitoring/mini-book-integrity-monitor.ts:154` | not a trading consumer | no change |

**Value-estimate uses, which D4 permits (no change):**
- `xstock_spot/book-state.ts:169` (a metric);
- `xstock_spot/qd-probe-metrics.ts:110` (a probe);
- `xstock_spot/scanner.ts:661` (spread %);
- `core/metrics/cost-metrics.ts:68`;
- `strategy-features.ts:151` (a feature);
- `verification-test-protocol.ts:199`;
- `server/scripts/audit_friction_balance.ts:75`.

⛔ **`enumerator-blind-spot`, again.** §1.1 said two sites, and Langston's r5 said three. Only the pattern census, which does not depend on already knowing the sites, finds five.

## A-9.2 THE SMOOTHER — condition D

**What the code shows:**
- `getSmoothedPrice` has **one** caller: `signal-orchestrator.ts:2417`, the crypto quant lane.
- MCE passes the price through unchanged. `market-context-engine.ts:1431-1434` reads, verbatim, `const indicators: MarketIndicators = { vwap, sma, currentPrice, …`, and `computeContext`'s parameter is documented at `:1218` as *"Smoothed current price (from Kalman filter or raw)"*.
- That confirms the census row at `B_PRICE_SIDE_BY_JOB_LEVEL_CENSUS.md:198` at the object.
- ⛔ **Corrected in r6 (Langston C4).** r5 said *"two `computeContext` calls"*. That is two **in `signal-orchestrator.ts`**. Repo-wide, tests excluded, there are **five** call sites:

  | site | price passed | job | anchor changes? |
  |---|---|---|---|
  | `signal-orchestrator.ts:2250` | bar close | crypto pattern lane | no — `venue_close` passes D4 |
  | `signal-orchestrator.ts:2467` | Kalman-smoothed price | crypto quant lane | **yes** |
  | `vts-runner.ts:1429` | cache price (a midpoint on crypto) | VTS level lane (A-9.15) | **yes** |
  | `vts-runner.ts:4822` | cache price | VTS pair regime and strategy mapping | no — value estimate |
  | `xstock_spot/eval-cycle.ts:381` | `lastPrice`, a bar close | xStock | no — `venue_close` passes D4 |

⇒ **DISPOSITION: convert at the level site.**
- The smoothed series stays a detection feature, which D4 permits.
- Quant-lane level construction reads the live transactable side from D3's touch selection, with its age: the ask for a taker entry; the bid for a resting maker entry and for stop and target.
- Structural geometry (ATR, extremes, support) is computed as today. Only the anchor changes.
- **Not "smooth the ask".** A smoothed ask lags the quote, so it is neither printed nor transactable. It would fail the 2026-09-04 rule exactly as the smoothed midpoint does, and it would add new state with its own re-warm.

## A-9.3 THE BOOK UNSUBSCRIBE — condition 2: three paths, and the fix already exists

**The three paths:**
- **`unsubscribeFromSymbols`** (`kraken-websocket-adapter.ts:1480`) sends `channel: 'ticker'` only.
- **`clearAllSubscriptions`** (`:2032-2041`) calls `unsubscribeFromSymbols` (ticker only) when connected, then clears `subscribedSymbols`, `pendingSubscriptions` and `symbolStats` unconditionally. Book streams stay live at Kraken while local state forgets them.
- **`refreshChannel`** (`:3218-3221`) calls `unsubscribeFromSymbols`, then `subscribeToSymbols` after a timeout. That re-subscribes the ticker **and** the book when only the ticker was cancelled, so book subscriptions stack.

**The fix already exists:** the correct raw book unsubscribe is at `:3540-3546`, in the 8.9.5 soft resubscribe, and its own comment says *"unsubscribeFromSymbols only does ticker"*.

**Plan P-7b:**
- Hoist the book unsubscribe into `unsubscribeFromSymbols`, so every caller inherits it.
- Delete the duplicate raw send at `:3540-3546`, leaving one home.
- In `clearAllSubscriptions`, the local clears run after both channel unsubscribes are sent. When disconnected, today's behaviour is kept, because the venue drops subscriptions with the socket.

## A-9.4 THE ENGINE'S UNLIMITED REST LEG, AND THE `#951` AGE HALF — condition B

**The code path:**
- The engine venue gate is at `aee:1493`, and the non-venue branch at `:1505`.
- The REST fallback (`:1510-1532`) calls `this.krakenService.getTicker(restPair)` at `:1516`. That reaches `kraken.ts:259` and then a bare `fetch` (`:187` / `:217`).
- `restRateLimiter.check` has **one** production caller: `live-pricing-adapter.ts:714`.

**Runtime, with its reach:**
- Instrument: staging `out.log`, which rotates by size. Window: 14:29:50Z → 15:06Z, about 37 minutes.
- `[I7][REST_FALLBACK]` count: **0**.
- Controls in the same file and window: `REST_BLOCKED` 1,331 lines; `batch-writer` 1,161.
- ⛔ The zero says this leg was quiet in that window. **It does not say the leg is safe.** `#971` amendment 1 records that the leg is suppressed by the `#951` mislabel, which this batch fixes.

**Plan P-7h:**
- Route the engine leg through the rate-governed layer, in the **same commit as, or before,** the re-serve age rule.
- Verification needs a positive control: a fixture that forces the WS price stale so the engine takes `:1510`, then asserts that the limiter is consulted, and that a blocked call yields a refused action rather than a bare fetch.

## A-9.5 F-G-2's LIVE SHADOW INSTRUMENT — condition C, with a correction

**What it is:** `fg2Shadow` is written at `aee:1867-2030`, into `closed_trades.metadata.fg2Shadow` / `fg2ShadowSkip` and the cycle counters. **It is deployed** (A-9.0 row 2).

**Deletion-time state-write census:**
- Readers of `fg2Shadow` outside the engine: **none**.
- Searched: `server`, `scripts`, `client` and `shared`, in `.ts`, `.tsx`, `.mjs`, `.sql`, `.py` and `.sh`.
- Control: the same search finds 16 sites inside the engine.
- Its only reader is the progress report's hand-run queries.

⇒ **DISPOSITION (§15): (4) connected, should be removed — at OBJ-8a.**
- It goes in the same commit that moves the exit trigger to the bid. From that commit on, the shadow compares the bid with the bid, and its rows would read as agreement.
- The before-record (24/24) stays in the progress report.
- At removal: an entry in `DELETED_COMPONENTS_LOG` and the archive copy.
- Until then it runs unchanged. It never closes a position.

**r6, Langston C2 — what the removal must NOT take with it.**
- The close-record carry at `active-execution-engine.ts:2680-2692` holds `if (_pm.fg2Shadow) _carry.fg2Shadow = _pm.fg2Shadow;` at `:2684`. The `bookState` carry sits directly beneath it (`:2685-2689`), and it was generalised from that line.
- OBJ-8a deletes **only** the `fg2Shadow` line and its F-G-2 OBJ-0 comment (`:2681-2682`).
- It rewrites the `B-XSTOCK-FEED-SANITY` comment at `:2686-2687`, so that it no longer cites `fg2Shadow`.
- A test pins that the `bookState` carry survives.

**OBJ-8a's live proof.** The only live bid-versus-mid instrument dies in the same commit, so the proof has to come from somewhere else. The **first crypto exit after the switch** must carry P-7c's basis and side stamp on its closed row: basis `book_top` or `ticker_bbo`, side `bid`. It is read at Step 7.

## A-9.6 3b.l — WHY THERE ARE TWO CACHES — condition 3

**The introducing commit:**
- Search: `git log -S "private priceCache: Map<string, CachedPrice>" --reverse -- server`.
- Result: **`f60f958c0`**, 2025-10-25, the Replit Agent.
- Subject, verbatim: *"Add real-time price updates and improve AI module caching"*.
- Body, verbatim: *"Integrate LivePricingAdapter for real-time price fetching and broadcasting, and update AI module memory snapshots to reflect new cache sizes and hit rates."*
- It added the whole of `live-pricing-adapter.ts`, 400 lines.

**The original design:** `bridge/canonical/DawnTrader_System_Architecture_Execution_Flow.md:194` / `:257` / `:633` specified **one** rate-governed cache, with no direct venue calls.

**Recorded decision:** none — not in the commit, the ledger, or the SIM.

⇒ **DISPOSITION: `INFERRED-FROM-CODE`, not established.**
- The private map arrived whole with the real-time broadcast adapter, in the Replit era, before governance. Nothing records why it was not wired to the unified cache.
- D7 keeps both caches going forward.
- The WHY becomes Step 10 content, in the SIM and the System Manual.

## A-9.7 THE D3 DISAGREEMENT THRESHOLD — condition 1 (rewritten in r6, Langston C1 and judgement 2)

**Instrument:** `scripts/analysis/book_ticker_alignment_probe.mjs`, run from the laptop on 2026-09-11 against public feeds only, with a 250 ms alignment window.

⛔ **The first run is discarded as an instrument defect.** r1 (20 minutes) never truncated the book to the subscribed depth, so ghost levels stayed in the maintained top — the `#741` shape. r2 truncates after every update and excludes crossed books, counting them.

⚠️ **What the crypto result means — exact by construction.**
- The probe's crypto ticker **was** subscribed with `event_trigger: bbo`, and Kraken emits that ticker from the same top of book.
- So r2's **46,344 of 46,344 aligned pairs exact (max 0 bps, 0 crossed books)** is agreement **by construction**, not evidence that two independent feeds agree.
- ⇒ **The alert's real subject is our local book maintenance, not venue disagreement.**
  - A fire means our maintained book has drifted from the venue's own top: a desynced, untruncated or stale book.
  - **The alert body must say exactly that.**

**The positive control — a known non-zero, not a repeat.**
- r5 cited a 30-second run as a control. It is a repeatability check, and nothing more.
- The control is `--inject-every 5`, a 1-minute run that perturbs the BTC/USD ticker bid by one tick (0.1) on every 5th aligned BTC/USD pair.
- **Result:** 199 perturbations injected into 998 aligned BTC/USD pairs, and **199 non-exact BTC/USD pairs detected** (BTC p99 0.013 bps, one tick). The other 15 symbols showed **0** non-exact pairs.
- ⇒ The instrument sees a one-tick disagreement, and reports nothing where none was injected.

✅ **Crypto threshold.**
- **Rule:** a symbol fires when its disagreement is **one tick or more on either side, on 3 consecutive aligned pairs**.
- **Why one tick:** it sits just outside the observed distribution, which is exactly zero.
- **Why 3 consecutive pairs:** that absorbs a single asynchronous delivery.
- ⛔ **Alert only.** If this number ever gates a price-dependent refusal, it becomes a trading knob and needs its own argument.
- P-7e ships it in record-only mode, and its first real fire is read before it is armed.

⛔ **xStock threshold — not derived, because the instrument is not yet valid for xStock.**
- Crossed books dominate the xStock pairs: 10,944 excluded against 328 aligned in the 5-minute run, and 1,952 against 165 in the 1-minute run.
- **That is a property of this probe's book maintenance on the equities feed, NOT a property of the equities feed.** Recorded as such so it cannot become a false premise for the next decision.
- ⇒ **P-7d keeps the xStock touch price on the ticker** until P-7b's maintained xStock book passes a checksum-validated control with no crossed books. The xStock disagreement alert stays record-only until then.

## A-9.8 THE BASIS ENUM GAP

D3 lists four bases, but A-9.1 rows 3 and 4 are REST ticker prices — a fifth source. The plan uses **`rest_ticker`** for them. This is a mechanical addition, not a reopened decision, and it is recorded here for Langston and Coltrane.

## A-9.9 DEPLOY ORDERING AND THE WINDOWS

- **`#943`:** Langston's read (alert `0fe4912e`, 17:00Z) lands **before** OBJ-7 deploys, because P-7b and P-7d touch `book-state-tracker.ts`.
- **F-G-2:** Langston's read (alert `cbb55dc9`); the shadow is removed at OBJ-8a.
- **`#951` — option (b), AGREED by Langston: READ, THEN DEPLOY.**
  - `0db25f1d` is the second and final window, and its stopping rule is binding: an empty arm at that point is the result, not another extension.
  - **Immediately before OBJ-7 deploys**, take the terminal read at the **pre-deploy sha**.
  - **Copy the two producer literals from the alert body**, `kraken_rest_poller` and `kraken_rest_rate_limited_reserve`. Never retype them: this gate saw three wrong-object misses in one hour.
  - In the same turn, execute §9 item 2's conversion.
  - Then **resolve** `0db25f1d`, citing the read. **Never ack it.**
  - Ending a window without discharging its stopping rule is the `#1005` shape.

## A-9.11 MAKER FILL EVIDENCE — for P-8b

**The rule today.** `pending-maker-logic.ts:20-23`, `tradedThrough(side, currentPrice, limit)`, compares **one** price: a resting buy fills when that price is at or below the limit, and a resting sell when it is at or above.

**What the callers pass.** All three fill-monitor sites pass a single mark:
- **Paper maker entry:** `active-execution-engine.ts:1115-1118`. `safePrice` comes from the position's `currentPrice`, which is *"passed, not re-derived"*.
- **Paper maker exit rest:** `:1760-1762`. `currentPrice` comes from the exit loop — the cache mark, or the REST-fallback midpoint (A-9.1 row 3).
- **VTS maker resolve:** `vts-runner.ts:3115-3131`, `priceData.price`.

**Placement checks.**
- `aee:3834` already reads the best ask, which is the correct side.
- `vts-runner.ts:2187` (`currentMarketPrice`), `xstock_spot/eval-cycle.ts:956` (`lastPrice`) and `pending-maker-logic.ts:136` (`currentMarketPrice`) do not.

⛔ **Preserve `aee:1753-1758`.** It is a Langston-approved, intentional divergence: an exit rests the marketable price and needs a **later** venue tick at or through the limit, so a same-tick place-and-fill is prohibited. That is D2's "after resting".

⚠️ **Limit.** D2's arm for a trade strictly through the limit needs trade prints, and we subscribe to no trade channel. P-8b therefore builds the quote arm only. The trade arm is recorded as not built, rather than invented.

⇒ **P-8b:**
- The three monitor sites pass the opposite side from D3's touch selection — the ask for a resting buy, the bid for a resting sell — instead of the mark.
- The three placement sites that read a mark or a last price read the opposite side too.

## A-9.12 VTS EXIT BOOKING — for P-8d

- **Booking site:** `vts-runner.ts:3352-3355`, `exitPrice: resolveVtsBookedExitPrice(trade.assetClass, currentPrice, decision.exitPrice)`. Under F-G-2 OBJ-5a it books the observed mark (`currentPrice`) for crypto, and keeps TEC's clamp (`decision.exitPrice`) for xStock.
- **Epochs:** these come from `core/metrics/calibration-epoch.ts` (SIM `:3468`). The current per-class values are read from `module_constants` at implementation, not asserted here.

⇒ **P-8d:**
- For crypto, the resolver receives the D1 sell-side price (the valid bid) instead of the mark.
- The crypto VTS epoch increments by one, keyed through `calibration-epoch.ts`.
- Rows from before the boundary carry the mid-triggered label.
- xStock is unchanged: the clamp stays (D5).

## A-9.13 THE CLOSE SPLIT — for P-8e

- **`order-placer.ts:98-121`, `closeOrder`, has three branches:**
  1. walk — `closeFillFull`, `:102-103`;
  2. cold book — `requestedPrice × (1 − penalty)`, `:104-109`;
  3. missing config — `requestedPrice` with zero modelled slippage, `:110-116`.

  It books only `avgFillPrice`.
- **`execution/depth-walk.ts:82-97`, `closeFillFull`,** already computes `walked.filledQty` and `remainder = orderQty − walked.filledQty`. **The split already exists, and is discarded.**

⇒ **P-8e:**
- `closeOrder` returns `{ branch, walkedQty, extrapolatedQty }`, and the close records it.
- A cold book records walked 0 and extrapolated equal to the full quantity.
- A missing config records the estimate as invalid, never as zero slippage.

## A-9.14 NON-USD QUOTES — for P-8f

**`#966` amendment 1, re-read:**
- `market-scanner.ts:820`, `volume24h = volume24hCoins * currentPrice`, is in the quote currency, but it is compared against thresholds in USD. The comment at `:818` states the invariant it breaks.
- The minimum-price floor has the same shape.
- `quote_currencies` is `[]` on every live `screener_filters` row, so there is no quote restriction at all.

**The quote is available at admission:** `utils/symbol-canonicalizer.ts:118-123` normalizes BASE/QUOTE.

⇒ **P-8f:**
- At scanner admission, before the volume and minimum-price gates, a pair whose normalized quote is not `USD` is refused with the reason `non_usd_quote`.
- ⚠️ **Consequence, stated:** stablecoin quotes (`USDT`, `USDC`) are refused too, until a conversion exists. That follows D9's "any pair not quoted in USD".
- Open positions keep their quote-currency exits, and their USD P&L is marked unavailable.

**r6, Langston C3 — the magnitude, measured.**

**Object:** staging `pair_scan_archive`, `asset_class = 'crypto_spot'`, over the last 24 h (2026-09-10 15:44Z → 2026-09-11 15:44Z). **Population:** 103,469 rows, every one admitted to MCE (`scan_stage_decision.admitted = true`).

| measure | USD quote | non-USD quote |
|---|---|---|
| distinct admitted **symbols** | 67 | **52** (EUR 16, GBP 7, USDT 6, CHF 6, USDC 6, CAD 5, AUD 4, JPY 2) — **43.7% of 119** |
| distinct **base assets** lost if refused | — | **3 of 70 (4.3%)** — `USD`, `USDC`, `USDT` only |
| closed active-path trades, last 30 days | 182 | **28 (13.3% of 210)** — EUR 19, USDT 3, USDC 3, GBP 2, CAD 1 |
| open positions now | 5 | 0 |

**The ten symbols with no USD-quoted twin** are USD/CAD, USD/CHF, USDC/AUD, USDC/CAD, USDC/CHF, USDC/GBP, USDT/AUD, USDT/CHF, USDT/GBP and USDT/JPY. All are stablecoin or FX pairs. Every other refused symbol is a second quote on a coin that already trades against USD.

⇒ **Measured by symbols the cut is large (43.7%); measured by tradeable assets it is small (3 bases, all stablecoin/FX).**
- 13.3% of recent closed trades were on non-USD quotes. Their gates and P&L ran on `#966`'s units error.
- **Recommendation:** refuse, as D9 decided.
- ⚠️ **Langston ruled that a material universe cut is Kyle's decision.** This goes to Kyle with the numbers above and the recommendation. It does not block commit 1: P-8f is in commit 2.

## A-9.15 THE VTS LEVEL HAND-OFF — BLOCKER-1 (added in r6)

**Langston's finding, re-derived at the object:**
- `vts-runner.ts:1429` passes `priceData.price` into MCE. That is the cache price, and on crypto it is a midpoint.
- `vts-runner.ts:1595` hands `currentPrice: mceContext.indicators.currentPrice` to strategy detection. **That is the VTS lane's level hand-off** — the census's `vts-runner.ts:1520` (`B_PRICE_SIDE_BY_JOB_LEVEL_CENSUS.md:351`), since drifted.
- `vts-runner.ts:1528` holds OBJ-3a's level-basis shadow arm for the VTS lane, keyed `lane: 'vts'`. It is built and counted, and consumed by nothing.

**Precision.** The VTS lane anchors on the **raw cache midpoint**, not the Kalman-smoothed one: `getSmoothedPrice` has one caller, `signal-orchestrator.ts:2417`. The census wording *"smoothed mid"* is loose on this point. **It fails D4 either way, because neither price is transactable.**

⛔ **The parity consequence.** Moving only the active quant lane would leave VTS — the learning population — on mid-anchored levels while live-path levels sit on the transactable side. **That is a sim-to-live divergence, not a tidy-up**, and it is `fix-follows-pointer` exactly (census `:355`).

⇒ **P-8c covers BOTH hand-offs.**
- The two hand-offs are the active quant lane (`signal-orchestrator.ts`) and the VTS level lane (`vts-runner.ts:1595`).
- They go through **one** shared per-leg conversion in `level-basis.ts`, switched on in the same commit.
- The VTS shadow arm at `:1528` becomes the live path at that switch.
- P-8d's epoch boundary then covers both the VTS booking change and the VTS level-basis change, so there is one boundary and not two.
- The other three call sites keep their anchors (see the table in A-9.2).

## A-9.10 THE SIX SOURCES, NAMED

1. **Code:** every site above, at the ref.
2. **Runtime:** staging `out.log`, with its reach stated in A-9.4, and the alerts file. **The DB was not queried: no number in this addendum rests on it.**
3. **SIM:** `:305`, `:324`, `:349`, `:377`, `:322-325`, `:3468`, `:946`, `:163`, `:77`.
4. **System Manual:** `:632`, `:642`, `:666`, `:555`.
   - ⛔ **Gaps:** there is no passage on the ticker `event_trigger` (0 hits; the same search found "Kalman" 7 times), and none on the book-unsubscribe path. Both are Step 10 content.
5. **Ledger:** `#971`, `#951`, `#952`, `#966`, `#977`, `#1017`, `#949`, `#927`, PR-A13, and the F-G-2 progress report.
6. **Canonical:** the one-cache intent (A-9.6).

---

# r5 PLAN

## COMMIT 1 — OBJ-7, FEED AND PLUMBING

This commit lands **after** Langston's `#943` read, and is proven live before commit 2.

| P | what | falls out of | verification |
|---|---|---|---|
| P-7b | Hoist the book unsubscribe into `unsubscribeFromSymbols`; remove the duplicate raw send at `:3540`; clears run after the unsubscribes | A-9.3 | a churn fixture per channel; the pre-fix code fails it (0 book unsubscribes) |
| P-7a | Crypto ticker uses `event_trigger: bbo` | D3; `bbo_trigger_ack_probe.mjs` | live ack; Step-8 message rate and event-loop lag before/after; the revert is to drop the field |
| P-7c | A basis field on every level, trigger and mark: `book_top`, `ticker_bbo`, `ticker_default`, `rest_ticker`, `venue_close` | A-9.1, A-9.8 | a fixture per basis; dropping the field fails a test |
| P-7d | Touch-price selection: a valid fresh book top, then a valid ticker within D6's age, otherwise refuse | D3; A-9.1 row 5 | a fixture per branch, including "neither qualifies" |
| P-7e | The disagreement alert records only until its first reads, then arms at the A-9.7 threshold. **Alert only.** Its body states that its subject is **local book maintenance** (the best-bid/offer ticker agrees with the book by construction) | A-9.7 | the one-tick injection control (199 of 199 detected, 0 false); a negative control on normal delivery; its first fire is read before the number is trusted |
| P-7f | A clock-basis field; the query on 15 s against 14.3 s | D6 | a fixture per basis; the query result recorded in this document |
| P-7g | Open positions enrolled in the 2-second lane; queued and held symbols carry their own subscription reasons | D7; `#977` am. 6 | the health line's `open=` equals the open-position count; a reason-removal fixture |
| P-7h | The engine REST leg goes through the limiter, in the same commit as the re-serve age rule | A-9.4 | the forced-stale positive control |
| P-7i | Keep the true last trade: the translator's `c` field and the adapter's REST path | A-9.1 rows 1 and 4 | a captured-message fixture |
| P-7j | The smoother advances once per observation, with an explicit re-warm | D7; SIM S26 | repeated-read and restart fixtures |
| P-7k | **Record-only, added at Step 4.** `price-cache.ts` records which quantity each writer stored as `price` (last trade or midpoint) and the last-trade pair, reusing P-7i's names and carry rule. Deploys ahead of OBJ-8, not a gate on OBJ-7 | F1 (`PRICING_DATA_ARCHITECTURE.md` §3.2); Langston chunk 3 (2) | a writer census; one fixture per writer; the mixture ratio read before P-8c |

## COMMIT 2 — OBJ-8, DECISION LAYER

This commit comes after commit 1 is proven live.

| P | what | falls out of | verification |
|---|---|---|---|
| P-8a | Exits on the bid, per direction, including the REST fallback reading `b[0]` (A-9.1 row 3). The shadow instrument is removed — **only** the `fg2Shadow` carry line and its comment, keeping the `bookState` carry (A-9.5 C2) | D1; A-9.1 row 3; A-9.5 | fixtures per direction and order type; a mutation to the midpoint fails; a test pins the `bookState` carry; **live proof:** the first post-switch crypto exit carries P-7c's basis and `bid` stamp; **the window is sized on the measured stamped-close rate** (Langston's F-G-2 closing read: about 5 crypto closes a day, 14 days about 70, against the 2x2 floor of 30 and the brake floor of 52); ⚠️ **carried from Step 4 (Langston chunk-3 C3):** `selectTouchPrice` applies ONE `maxAgeMs` to the book leg and the ticker leg, so the fallback can be accepted at an age the book was refused for (live crypto book ceiling 5,000 ms; the ticker has none today). P-8a passes per-leg ages, or states in its commit, with the number, that one ceiling governs both |
| P-8c | Level anchors converted at the level site for **both** hand-offs — the crypto quant lane (`signal-orchestrator.ts`) and the VTS level lane (`vts-runner.ts:1595`) — through one shared conversion in `level-basis.ts`; the OBJ-3b coherence assertion | D4; A-9.2; **A-9.15** | fixtures on both hand-offs; the coherence assertion; a mutation that changes only one lane fails a parity test |
| P-8b | Maker fills read the opposite side (ask for a resting buy, bid for a resting sell) at the three monitor sites and the three placement sites that read a mark; the later-tick exit rule is preserved | D2; A-9.11 | a midpoint-touch fixture does not fill; an opposite-quote fixture does; the later-tick rule's existing test still passes |
| P-8d | VTS crypto booking receives the D1 bid; the crypto VTS epoch increments by one; the pre-switch label is added | D5; A-9.12 | the epoch value on rows after deploy; the label present; xStock rows unchanged |
| P-8e | `closeOrder` returns and records `{ branch, walkedQty, extrapolatedQty }`; a missing config is an invalid estimate | D8; A-9.13 | all three branches write the field; a missing config never records zero slippage |
| P-8f | Scanner admission refuses non-USD quotes (`non_usd_quote`) before the volume and price gates; USD P&L shown as unavailable for open non-USD positions (currently 0). ⚠️ **The universe cut goes to Kyle first:** 52 of 119 symbols, but 3 of 70 bases, all stablecoin/FX | D9; A-9.14 (with the r6 magnitude) | a BTC-quoted and a USDT-quoted fixture are refused with the reason; a USD pair is unaffected |
| P-8g | **Added at Step 4.** The crypto exit age check: every exit action rechecks the retained `observedAt` against D6's exit ceiling; `AGE_EXEMPTION_BY_PRODUCER` producers exempt by declaration and counted | D6; D7; scope 7h; Langston chunk-2 FINDING-4 | a re-serve past the ceiling holds; a genuine read inside it proceeds; exempt use counted |
| P-8g-bis | **Added 2026-09-11 from `#951`'s retirement (Langston 20:33Z, condition 1).** The stored-row tripwire: a standing check on WRITTEN `closed_trades` rows with `exit_price_producer = 'kraken_rest_rate_limited_reserve'` that fires on (a) a null `exit_observed_at_ms`, (b) `exit_observed_at_ms` equal to the close instant, or (c) an `exit_price_source` other than `kraken_rest`. A different object from P-8g's runtime gate: P-8g decides an exit, P-8g-bis audits what was written | `Batch Completion/B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md` section 0 and 9b; scope row 8g-bis; the reserve producer is constructed at exactly one site, `live-pricing-adapter.ts:817` (the finite-stamp guard `:816-818`, the `kraken_rest` source literal `:668`), re-derived at head 2026-09-11 | a stored fixture row for each of (a), (b) and (c) fires; a reserve row with an older stamp and `source = kraken_rest` does not; the check reads stored columns, never a log line |
| P-8h | **Added at Step 4.** The price-skip dedupe key carries a reason term (proposed: the copy's fact class); the `price-skip-<mode>-<symbol>` prefix kept; the copy ranks by fact class, then by reason (chunk-2 r2 condition 5) | Langston chunk-2 FINDING-2 (`aee:416`, `system-alerts.ts:504-509`) | an open row under one class does not block another class's raise; a prefix fence |
| P-8i | **Approved by Langston 2026-09-11 (rule 18 (b)).** Delete the dead depth-1 book path (`switchToBookChannel`, `scheduleBookChannelRevert`, the `prefer_book` hint); in the same change, narrow or delete `currentChannel` with its diagnostics reader (`:2868`), state the channel-hints route's new shape with `low_liquidity` kept, and name the RESUBSCRIBE-only behaviour change | Langston chunk-1 r2 observation; the change list's measurement | rule-18 census; tsc; `DELETED_COMPONENTS_LOG` |

✅ **No plan item is UNAUDITED.** P-8b, P-8d, P-8e and P-8f were read in A-9.11 to A-9.14 before dispatch. P-8g-bis falls out of `#951`'s section 9b, whose construction lines Langston re-derived at head on 2026-09-11.

---

## PLAIN-LANGUAGE SUMMARY

**What the audit found:**
- **More midpoint calculations.** There are five places that turn the bid and ask into a midpoint and use it as a price, not three. Two are REST fallbacks, so the price label needs one more value.
- **The price smoother** stays as a way to spot setups. Entry, stop and target prices will read the real bid or ask instead.
- **Order-book cleanup.** When the system stops watching a coin, it tells Kraken to stop the ticker but not the order book, so abandoned book feeds pile up. The correct code already exists elsewhere in the same file; it gets moved to the one place every caller uses.
- **An unthrottled REST call.** One of the engine's backup price calls to Kraken bypasses the rate limiter. It gets throttled in the same change that fixes the price-age labelling.
- **The F-G-2 comparison tool** is already live. It is removed when exits switch to the bid, because it would then be comparing the bid with itself.
- **Nobody ever recorded why there are two price caches.** The second one arrived with a Replit-era feature. We keep both, and write the reason down.

- **The simulated trading lane (VTS)** also sets entry, stop and target from a midpoint. It gets the same fix, in the same step, so our learning data keeps matching real trading.

**The plan:** first the feed plumbing, proven live. Then the switch to the bid, which covers maker fills that need a real buyer or seller, VTS booking, the close split, and refusing pairs not priced in US dollars.

---

## r6 — LANGSTON'S STEP-2 r5 CHANGES, APPLIED (2026-09-11)

| item | where it is answered |
|---|---|
| **BLOCKER-1**, the VTS level hand-off | A-9.15; P-8c now covers both hand-offs |
| **C1**, the alert's meaning and its positive control | A-9.7, rewritten: exact by construction; the one-tick injection detects 199 of 199; P-7e body |
| **C2**, the carry block and the live proof | A-9.5 amendment; P-8a |
| **C3**, the P-8f magnitude | A-9.14 amendment: 52 of 119 symbols, 3 of 70 bases, 28 of 210 recent trades; goes to Kyle |
| **C4**, the `computeContext` census | A-9.2: five call sites repo-wide |
| **Judgement 1**, `#951` | A-9.9: read-then-deploy; resolve `0db25f1d`, never ack |
| **Judgement 2**, the xStock wording | A-9.7: the instrument is not yet valid for xStock; not a feed property |

## ✅ STEP 2 r6 — APPROVED by Langston, 2026-09-11 15:58Z

He re-derived the code facts himself at `9ceaf73e1`; board card Review = Approved.

**Two conditions carry to Step 4. Both are ordering rules, and neither adds work:**
1. **OBJ-8a does not deploy until F-G-2's window is discharged against its own §4 stopping rule.** That means reading A1-A4 and writing either a verdict or a formal EXTEND. It follows the same form as `#951`:
   - take the terminal read at the pre-deploy sha;
   - write the disposition;
   - then **resolve** `cbb55dc9` — never ack.
2. **A-9.5's line citations drift by one or two lines at the ref.**
   - F-G-2 OBJ-0 comment: `:2679-2680`.
   - `B-XSTOCK-FEED-SANITY` comment: `:2685-2686`.
   - `bookState` carry: `:2685-2690`.
   - The `fg2Shadow` line at `:2684` is correct.

   Fix these in the Step 4 diff description.

**STEP: 3 of 11** (implementation, commit layer 1 = OBJ-7) · NEXT STEP: 4 of 11.

## STEP 3 RECORD — P-7f: THE 15 s vs 14.3 s QUERY (2026-09-11, CC-C)

**PREVIOUSLY STATED** (D6 in `PRICING_DECISIONS_2026-09-11.md`, and this plan's P-7f row): `active_fill_max_age_ms` is live at 15,000 and the re-serve sawtooth's densest rung is 14.3 s, so once a re-serve keeps its original age, that rung becomes visible in entry fill-age.
**NOW:** no gate compares a re-served price's age to 15 s, and no closed trade in the provenance era entered on a re-served price.
**REASON:** the 15 s gate and the 14.3 s rung sit on different price paths.

**The code, read at the ref:**
- The 15 s gate is xStock-only. `asset_classes/xstock_spot/active-dispatch.ts:181-182` compares `active_fill_max_age_ms` with `getLatestTickAgeMs` (`:74`), which is `NOW() - MAX(captured_at)` on the `xstock_spot_ticker_snap` archive table. It never reads the live-pricing adapter, so an adapter re-serve cannot reach it.
- The 14.3 / 29.3 / 44.3 / 59.3 s sawtooth is the crypto adapter's rate-limited re-serve (`B_PRICE_AGE_TRUTH_COMPLETION_REPORT.md` §3, n=975).
- Crypto entries gate freshness on the order book's age (`fill_depth_gate.warmth_max_age_ms`, 5,000 ms for crypto; `execution/depth-source.ts:154`), not on the adapter quote's age.

**The query:** `scripts/analysis/b_price_side_p7f_entry_age_rung.sql`, run on staging 2026-09-11.
- **Q1, entry producers on closed trades opened since 2026-08-26** (when the provenance columns were created). crypto_spot: `crypto_ws_book_walk` 48, `kraken_ws_book_mid` 27, `kraken_rest_poller` 1, null 1. xstock_spot: `xstock_ticker_snap_walk` 27, null 2, `kraken_equities_ws_mid` 2, `kraken_equities_ws` 1. **Entries on `kraken_rest_rate_limited_reserve`: 0 of 109.**
- **Q2, positive control:** the same column holds one `kraken_rest_poller` entry, so an adapter REST producer can reach it. The zero in Q1 is not a column that cannot hold the value.
- **Q3, the instrument that looks right and is not:** `opened_at - entry_observed_at_ms` since the #951 deploy is negative for 22 of 24 crypto rows (p50 -30,382 ms; min -3,334,879 ms) and for 2 of 2 xStock rows. `opened_at` precedes the entry price read (an order can rest before it fills), so this is not an entry fill age. My first run bucketed it around 14.3 s and 15 s; those buckets are discarded.

⚠️ **Limits, stated:** closed trades only; 109 rows carry a producer; the xStock gate's own age is not persisted (it reaches only the stale-fill alert and a skip counter), so its distribution near 15 s is not in the database.

**Disposition:** no code change. The D6 knife-edge note describes a coupling the code does not have; it is **raised with Langston at Step 4** rather than edited in the consensus record.
**Where the clock basis now lives:** on every quote the touch-price rule returns (`core/calculations/touch-price.ts`). The existing age recorders already keep the clocks apart: the side-age recorder derives ages from our receipt stamp only and counts the venue stamp as present or absent (`level-basis.ts` `recordSideAgeAttempt`), and both entry freshness gates above measure receipt clocks (the archive `captured_at`; the book's `bookUpdatedAt`, stamped at apply).

## STEP 3 RECORD — THE STEP-2 CONDITIONS, AS THEY STAND (2026-09-11, CC-C)

1. **F-G-2 — DISCHARGED.** Langston resolved `cbb55dc9` at 17:28:11Z with his closing read: F-G-2 is retired as a deploy gate and its window stays VOID (D10); the before-record is confirmed (24 of 24 below stop, extended by him to 62 of 63 below, 1 at, 0 above). **OBJ-8a's gate is lifted.** His read homes one item on OBJ-8a — size the post-switch window on the measured stamped-close rate — now written into P-8a's verification above and scope row 8a.
2. **A-9.5 citations** — re-derived at HEAD in the Step 4 change list (the carry block is byte-identical, shifted +68 lines).
3. **`#943` — DISCHARGED.** Langston's closing read at 17:23Z (INCONCLUSIVE, stopped); `0fe4912e` resolved with the completion report's §4k.
4. **`#951`** — still owed: the terminal read immediately before OBJ-7 deploys (A-9.9), then resolve `0db25f1d`.
