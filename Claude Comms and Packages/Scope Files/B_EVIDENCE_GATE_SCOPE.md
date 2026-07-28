# B-EVIDENCE-GATE — Scope (Step 1)

**change-class: non_architecture**
**Owner:** CC-A · **Date:** 2026-07-28 · **Status:** ★★ **REV 5 — CURRENT. Langston APPROVED the interval-based shape 2026-07-28 (three conditions + two precision fixes, all discharged in §8).** ⚠️ **THE DOC CARRIED THREE DIFFERENT REV NUMBERS AT ONCE (status said REV 2, §3 said REV 3, §7 said REV 4) and had TWO sections numbered `## 7` — the second retiring the framing the first still asked about. Both defects were Langston's find; fixed here. ONE rev number lives on this line and nowhere else.** Earlier rev history is preserved in place below (nothing deleted) — read §8 as current, §7-superseded as the record of how the shape changed. ★ **Kyle's condition met:** he delegated the method decision to the crew and Langston agrees with the direction. ⚠️ His agreement on the LITERATURE half remains RULED ON REPORTED FACT (he re-read the code, not the papers).
**Parent finding:** #591 · **Research basis:** `Langston Design Asks/B_CALIBRATION_QUALITY_WEIGHT_RESEARCH_SYNTHESIS_r1.md` (`0d2939c2c`)

> ⚠️ **THIS BATCH DOES NOT FIX THE CALIBRATION WEIGHTING. The pinned multiplier (#591 limb b) and the win-rate reward problem REMAIN until the follow-on design batch.** This batch only stops both consumers acting on evidence that cannot support a decision. It is deliberately the narrow, uncontroversial half.

---

## 1. WHY THIS IS SPLIT OUT AND GOES FIRST

Kyle's standing rule 23 is fix-on-find, and Kyle restated it 2026-07-28: *"When we find broken or buggy code, we fix it right away."*

The research produced one finding that is **correct under every option Kyle might choose** for the wider redesign, and one that is **a live defect by any reading**:

★ **`ml-calibration.ts` HAS NO ***PER-BUCKET*** EVIDENCE GATE.** ⚠️ **CORRECTED at REV 5 (Langston precision-fix (a)) — the original wording, "no minimum-sample gate AT ALL," was WRONG and is left visible rather than silently edited.** A **window-level** gate exists and always has: `ml-calibration-scheduler.ts:29` `MIN_TRADES_FOR_CALIBRATION = 10`, applied `:68` against `report.analyzedTrades`. **The defect is the LEVEL, not the absence:** 50 trades clears 10 comfortably, then splits three-plus ways and each bucket is judged with no gate of its own. *(Stated this way so a later reader who greps the `10` does not conclude we shipped a duplicate.)* The only guard in `analyzePerformance` is `if (total === 0) continue` (**`:172`** — rev 1 mis-cited this as `:151`; Langston corrected it at the ref, and independently confirmed the OBJ-1 defect: *"analyzePerformance has no minimum-sample gate of any kind."*). A pattern with **one** closed trade that happened to win therefore reports `winRate = 100%`, clears `WIN_RATE_INCREASE_THRESHOLD = 55` (`:190`), and emits an INCREASE recommendation. That is not a tuning disagreement; it is a guard that was never written.

**Everything else in #591 is a genuine scope call and is NOT in this batch.** What replaces the quality term, whether the reward becomes net log-growth, whether we adapt at all — all deferred. **This batch makes no formula change whatsoever.**

---

## 2. THE EVIDENCE (from the research synthesis; full citations there)

Two-proportion power analysis, α=0.05 two-sided, 80% power:

| True win-rate gap | Trades needed per group |
|---|---|
| 20 pp | ~98 |
| **10 pp (our 55/45 thresholds)** | **~393** |
| 5 pp | ~1,570 |

★ **The settling arithmetic:** at n=50 with 55% observed, the 95% **Wilson** interval is ≈ **[0.40, 0.66]** — it **contains the 45% DECREASE threshold**. The rule fires "increase this pattern" on evidence statistically indistinguishable from evidence that would justify decreasing it.

Corroborated three independent ways — textbook power analysis; Bacidore (ex-Head of Algorithmic Trading, ITG) computing ~1,537 orders to detect a 5 bp difference at 50 bp SD, calling anything less *"no better than… spinning a wheel of fortune"*; and bandit best-arm-identification lower bounds scaling as **1/gap²** (Mannor & Tsitsiklis 2004; Kaufmann/Cappé/Garivier, JMLR 2016).

**Michaud (FAJ 1989), the "estimation-error maximizer":** allocating on *estimated* performance systematically over-weights whichever group drew the luckiest estimate, **because a high estimate and a high estimation error are the same event.** Below the power threshold these systems are not learning — they are amplifying noise, with a known directional bias.

**CFA Standard V(A), Diligence and Reasonable Basis** is the governance framing: acting on a signal you cannot show is distinguishable from noise is acting without a reasonable basis.

---

## 3. NUMBERED OBJECTIVES

> ★★ **REV 3 — SCOPE NARROWED TO OBJ-1 ONLY (Langston BLOCKER-1). OBJ-2 / OBJ-2b / OBJ-3 / OBJ-4 ARE STRUCK AS SUPERSEDED BY `B-ARM-REMOVAL`.**
> **CC-A's error:** those four objectives all land **inside `adaptive-ratio-manager.ts`** — the exact file `B-ARM-REMOVAL` deletes. I wrote two live scopes, same owner, same date, in direct contradiction, and told CC-B *"B-ARM-REMOVAL blocks nobody"* when it in fact **voids half of this one.** ⇒ **OBJ-2b's Step-2 measurement is CANCELLED — do not spend effort measuring a counter we are deleting.** What survives is **OBJ-1 only: the missing minimum-sample gate at `ml-calibration.ts:172`**, which is untouched by the removal and remains the correct fix-on-find. **OBJ-3/OBJ-4 survive ONLY as they apply to `ml-calibration`, not to the ARM.**

**OBJ-1 — `ml-calibration.ts`: add the missing minimum-sample gate.** Below threshold, the pattern produces **no recommendation** — `suggestion = 'HOLD'`, `adjustment = 0` — and the reason is stamped so a reader can tell "insufficient evidence" from "evidence says hold." **Not** a silent skip: the report must say *why*.

**~~OBJ-2 / OBJ-2b~~ — ★ STRUCK. SUPERSEDED BY `B-ARM-REMOVAL` (Langston BLOCKER-6).**
  Both edited `adaptive-ratio-manager.ts` — **the file `B-ARM-REMOVAL` deletes** — and OBJ-2b's measurement targeted `getPoolPerformanceComparison`, **the very symbol that batch removes (its OBJ-3b)**. Measuring a counter we are deleting is wasted Step-2 effort, and a scope that still describes edits to a deleted file misleads whoever reads it next.
  ⚠️ **The findings those objectives produced are NOT lost — they are recorded where they belong:** the third-state/`:147` bound-slamming trace and the `computeConfidence` no-op are in `B_ARM_REMOVAL_SCOPE.md` §2; the clamp measurement that made the whole question moot is there too.

**~~OBJ-3~~ — ★ STRUCK AS WRITTEN; SURVIVES ONLY FOR `ml-calibration`.** The DB-tunable-with-loud-failure requirement (no silent fallback; **fail CLOSED** — gate everything, never fall through to ungated behaviour; resolve the setting OUTSIDE `computeAdaptiveRatio`'s `try/catch`) applied to the **ARM's** threshold. **For this batch it applies to OBJ-1's `ml-calibration` threshold only.**

**~~OBJ-4~~ — ★ STRUCK AS WRITTEN; SURVIVES ONLY FOR `ml-calibration`.** *"the ratio-manager log line must state sample count vs. requirement"* describes a log line in a **deleted component**. **For this batch: the calibration report must state sample count vs. requirement**, so "nothing is adjusting" reads as *"not enough evidence yet"* and never as agreement or breakage. (`sampleCount: total` is already carried at `ml-calibration.ts:213`, so this is nearly free.)

**OBJ-5 — do NOT touch:** the composite formula, the weights, the reward metric, the `[0.3,0.9]` bounds, the confidence shrink, `CONTEXT_BONUS`, or anything in `B-AMR-CONTEXT-BONUS-REWIRE` (CC-B's live batch — **coordinate before editing any shared file**).

---

## 4. THE OPEN QUESTION THIS SCOPE DOES NOT PRESUME

**What number?** The power analysis says ~393 per group for a 10 pp gap. Our actual per-pattern volumes may be far below that. **That is exactly the point** — and it forces the honest question the research raised (§5 of the synthesis):

> If per-group counts cannot realistically reach the hundreds, the answer is not a better algorithm — it is a **fixed split / no adaptation** (DeMiguel/Garlappi/Uppal 2009; Goyal & Wahal 2008 found reallocating toward observed outperformers added nothing at all).

⇒ **PRE-IMPLEMENTATION MEASUREMENT REQUIRED (Step 2):** measure the ACTUAL distribution of closed trades per pattern and per pool over a representative window **before** choosing the threshold. If the honest number silences these systems permanently, **that is a finding to put to Kyle, not a number to quietly soften.** ★ **Do not pick a threshold that lets the existing behaviour continue.**

---

## 4a. ★ MEASURED VOLUMES (done 2026-07-28, prompted by Kyle's question) — AND ONE UNTESTED OBSERVATION

**Kyle asked whether the trade results must come from the active path, or whether VTS counts. Verified in code: BOTH consumers are ALREADY VTS-fed, and neither has ever read active-path trades.** `ml-calibration` ← `vts-service.getRecentTrades` ← `loadHistoricalTrades` (VTS log JSON, last 30 files) + the in-session `closedTrades`, `source: 'simulation'`. `adaptive-ratio-manager` ← `telemetry.recordPairTelemetry` from `vts-runner.ts:3267/:4964`, which carries the explicit **M70 invariant: "VTS is the only authorized writer."**

★ **This RESOLVES §4's feasibility worry — it was measured against the wrong population.** Live DB, 2026-07-28:

| Population | Closed trades |
|---|---|
| **VTS** (`vts_open_trades`) | **39,036 total · 31,558 in 30d · 19,936 in 7d** |
| Active path (`closed_trades`) | **372 total** (364 in 30d) |

≈**100:1.** On active data alone an honest threshold was hopeless; on VTS it is comfortable. **Per-strategy, last 30d:** support_bounce 10,819 · morning_star 4,619 · pivot_shift 4,125 · inside_bar_reversal 2,611 · reverse_impulse 2,333 · volatility_edge 1,831 · sma_trend_ride 1,302 · vwap_pullback 1,244 · strong_bull_trend 1,152 · vwap_bounce 926 · defensive_hedge 572 · **range_trade 14 · mean_reversion 10**. ⇒ 11 of 13 clear the ~393 (10pp) bar; ~6 clear ~1,570 (5pp); the last two get correctly silenced — **the gate working, not a failure**. Also backtestable: every row carries strategy/pool/asset_class.

★★ **THE BINDING CONSTRAINT IS THE POOL SPLIT, AND IT LIMITS OBJ-2 SPECIFICALLY:** last 30d **rotational 31,101 vs ideal 457** (crypto 29,998 / xstock 1,560). **A two-group comparison is only as strong as its SMALLER side**, so the ratio manager can honestly detect a LARGE pool difference (~10pp) but never a subtle one, no matter how much rotational data accumulates. ⇒ **OBJ-2's threshold must be set against 457, not against the 31k — and if it is set above ~457 the balancer will hold its default indefinitely.** State that consequence explicitly rather than discovering it post-deploy.

⚠️ **UNTESTED OBSERVATION — recorded as an OBSERVATION, NOT a diagnosis (rule 24.a), because I tried to test it and FAILED.** The ideal pool is allocated 30–90% of scanning attention yet accounts for ~1.4% of closed trades. Plausible innocent explanation: `getNextScanBatch` sources ideal from `telemetry.getTopPairs()` ("top performers only") and has explicit **UNDERFLOW PROTECTION** handing any ideal deficit to rotational — so the ratio may be a TARGET that is chronically unmet, making the adaptive ratio largely nominal. **If true it would mean OBJ-2 tunes a knob that does not move anything — which is why it belongs in this scope.**
★ **WHY IT IS UNTESTED, stated so nobody mistakes silence for a negative result:** two pm2 log windows (2,136 and 20,166 lines) contained **ZERO scanner activity** — the capture is saturated by websocket/cache traffic (`[COLLISION_RESOLVE]`, `[I7-WS-D]`, `[CACHE_UPDATE]`), so the "0 UNDERFLOW hits" result is **uninformative, not negative**. A validity control (does the window contain ANY scanner line?) returned 0 and is what caught it — **the same absence-control failure recorded in #593, avoided this time only because the control was run.** And `getAdaptiveRatioState`/`idealRatio` appear in **no API route** (Grep-verified: services + one test only), so there is no direct read instrument either. **HOME: measure this at Step 2 by a DB/telemetry route or by adding observability — do NOT set OBJ-2's threshold until the allocation side is measured, and do NOT report the hypothesis either way until it is.**

## 5. VERIFICATION CRITERIA

1. Untruncated `tsc` clean on edited files + `check-tsc-baseline` PASS.
2. A test proving a below-threshold group yields `HOLD`/`adjustment = 0` **with the insufficient-evidence reason** — and ★ **mutation-proven**: remove the gate, confirm the test goes RED, restore, confirm green. A green suite proves nothing if nothing in it would catch the regression.
3. The measured per-pattern/per-pool sample distribution recorded in the pre-audit with the threshold decision derived from it.
4. All 4 CI jobs green on the head commit (rule 19).
5. §9.3 staging UI verification of any surface showing calibration/ratio state.
6. Deployed, and a staging log line showing the gate's reason string in real operation.

---

## 6. RISK

**Primary risk: this batch makes both systems adjust LESS, possibly not at all.** That is the intended effect and it must be stated plainly to Kyle rather than discovered later — *"the adaptation stopped"* will otherwise read as a regression. Per §9.1 the completion report will carry that in bold.

~~**Secondary:** the ratio manager's `score === 0` branch slams the ratio to a bound…~~ ★★ **STRUCK 2026-07-28 (Langston) — THIS RISK DESCRIBES A FILE THAT NO LONGER EXISTS.** `server/services/adaptive-ratio-manager.ts` is **404 at `795d8c92`**; `B-ARM-REMOVAL` landed and archived it at `1-system-manual/_archive/deleted-code/b-arm-removal-adaptive-ratio-manager.ts.removed` (he verified both the 404 and the 200). **There is no bound-slamming branch left to reach, so there is no `null`-return path to verify.** Struck for the same reason OBJ-2/2b/3/4 were struck — not because the risk was wrong when written, but because its subject was deleted underneath it.

---

## 7-SUPERSEDED. QUESTIONS FOR LANGSTON — ⚠️ **ANSWERED AND PARTLY STRUCK; DO NOT ACT ON THIS SECTION.** Q1 answered (§8a), Q2 answered (§8b), **Q3 STRUCK AS MOOT (§8c)**. Retained as record, renumbered because it previously shared the number `7` with the measurement section that RETIRES its framing — a reader hitting this one first got the superseded shape.

1. Agree this splits out and ships ahead of the formula redesign?
2. Is the DB-tunable-with-loud-failure shape right, or is a constant acceptable for a guard?
3. On the ratio manager, does returning `null` below the raised threshold hold the ratio steady, or does it reach the bound-slamming branch? I have not yet traced it and will not claim either way.

---

## 7A. ★ STEP-2 MEASUREMENT (2026-07-28) — THE GATE SHOULD BE INTERVAL-BASED, NOT COUNT-BASED. REV 4.

**Read site established first (rule: name the population, cite the read site).** `ml-calibration-scheduler.ts` runs on cron **`0 0,8,16 * * *`** (every 8h) — **it is NOT in the active trading path; not TCL, not TEC, not RTB.** It calls `analyzePerformance(50)` → `vts-service.getRecentTrades` → `loadHistoricalTrades()` (last 30 VTS log files) + in-session `closedTrades`. **The window is 50 trades TOTAL, sliced BEFORE grouping.** Grouping key (`ml-calibration.ts:~128`): **`t.patternType || t.strategy || 'UNKNOWN'`**. Output → `logPredictiveAdjustment` → a dated JSON file, read only by `/api/vts/predictive-adjustments/*` display routes. ★ **Census: NOTHING reads those adjustments back into trading. It is a write-only recommendation record.**

**Measured on the live corpus (2,423 closed records in the 30-file window):** `patternType` is present on **72 of 2,423 (3%)** — so grouping falls through to `strategy` for ~97%. ⚠️ I nearly reported *"97% lands in one UNKNOWN bucket"*; **the `|| t.strategy` fallback prevents that** — checked before claiming.

**THE LIVE 50-TRADE WINDOW — 3 buckets, all three firing DECREASE:**
| bucket | n | wins | winRate | 95% Wilson CI | sound? |
|---|---|---|---|---|---|
| `sma_trend_ride` | 21 | 3 | 14.3% | **[5.0%, 34.6%]** | ★ **entirely below 45% ⇒ DECREASE IS JUSTIFIED** |
| `vwap_pullback` | 17 | 4 | 23.5% | [9.6%, **47.3%**] | ⚠️ **straddles 45% ⇒ NOT justified** |
| `strong_bull_trend` | 12 | 2 | 16.7% | [4.7%, 44.8%] | ★ entirely below ⇒ justified |

★★ **THIS OVERTURNS OBJ-1's SHAPE. A flat minimum-sample gate is the WRONG FIX and would have been actively harmful:** at n=21/3-wins the effect is large enough that the call is statistically sound — a count-based gate set high enough to block the single-trade case (`n=1`, CI **[20.7%, 100%]**) would ALSO have blocked this legitimate one. **Sample size is a proxy; the thing we actually care about is whether the evidence excludes the threshold.**
⇒ **REVISED OBJ-1: gate on the WILSON SCORE INTERVAL, not on `n`.** Fire `DECREASE` only when the interval's **upper** bound < 45%; fire `INCREASE` only when the **lower** bound > 55%; otherwise `HOLD` with an *insufficient-evidence* reason stamped. **No arbitrary threshold to tune — `n` enters naturally through the interval width.** Blocks n=1 (CI [20.7%,100%] straddles both), n=2 ([34.2%,100%]), 3-of-4 ([30.1%,95.4%]) — every case the count-gate was meant to catch — while permitting large-effect calls on modest samples.
**Basis:** Brown/Cai/DasGupta (2001) recommend Wilson for small n; the Wald interval's coverage is "chaotic". ⚠️ **Honest limit carried from the research: Wilson-gating of a trading parameter change is a defensible engineering application, NOT documented industry practice** — presented as such, not as precedent.
**Unchanged:** still no formula change; the pinned multiplier (#591 limb b) and the win-rate-vs-expectancy question remain OUT and stay with the design batch.

---

## 8. REV 5 — LANGSTON APPROVED THE SHAPE (2026-07-28), THREE CONDITIONS + TWO PRECISION FIXES, ALL DISCHARGED BELOW

He re-read `ml-calibration.ts:85-87,114,128,152-156,170-196` + `ml-calibration-scheduler.ts:29-30,66-78,82-95` at `cf0e88cf7` and reproduced all three Wilson intervals to the decimal. **APPROVE, on the structural argument: a count is blind to effect size BY CONSTRUCTION, so the case does not depend on today's window.**

### ★ PRECISION FIX (a) — "NO MINIMUM-SAMPLE GATE AT ALL" WAS WRONG. THERE IS ONE; IT IS AT THE WRONG LEVEL.
**Verified at the ref:** `ml-calibration-scheduler.ts:29` `MIN_TRADES_FOR_CALIBRATION = 10`, applied `:68` as `if ((report.analyzedTrades || 0) < MIN_TRADES_FOR_CALIBRATION)`. ⇒ **a WINDOW-level gate exists and always has.** The defect is that it is **per-RUN, not per-BUCKET**: 50 trades clears 10 comfortably, then splits 3+ ways and each bucket is judged with **no gate of its own**. **Correct statement, to be used everywhere from now on: "no PER-BUCKET evidence gate; the existing gate is window-level at 10."** *(Left uncorrected, a later reader greps the 10 and concludes we shipped a duplicate.)*

### ★ PRECISION FIX (b) — THE WINDOW IS HYBRID-ONLY.
**Verified at the ref:** `:114` `getRecentTradesFn(windowSize, 'HYBRID')`. The three buckets are **HYBRID trades only**; "the live window" without that qualifier **overstates coverage**. All figures in §7 carry this qualifier.

### ★★ C1 — z IS THE ARBITRARY CONSTANT I CLAIMED NOT TO HAVE, AND IT IS LOAD-BEARING. HE IS RIGHT.
I said the interval gate "has no arbitrary constant to tune." **False — I moved the constant from `n` to `z`.** Reproduced on `vwap_pullback` (n=17, w=4):

| z | one-sided level | upper | verdict |
|---|---|---|---|
| 1.645 | 95% | **43.3** | **DECREASE FIRES** |
| **1.96** | **97.5%** | **47.3** | **HOLD** |
| 2.326 | 99% | 51.7 | HOLD |

**Same data, opposite verdict.** ⇒ **DECISION: z = 1.96, and the rule is ONE-SIDED (`upper < 45`), so this is a 97.5% one-sided test — NOT the 95% the number colloquially implies. Stated explicitly because the colloquial reading is wrong.**
**JUSTIFICATION (not taste):** ★ Langston verified the consumer is `logRecommendations` + `logPredictiveAdjustment` with **nothing auto-applying** (`scheduler:82,89-95`). **The costs are asymmetric: over-suppression costs LOG LINES; under-suppression puts a parameter recommendation into the record on noise.** Conservative tail is therefore nearly free. **REMEDY for "illegible": `z` becomes a NAMED, COMMENTED constant carrying this table** — the fix for an illegible constant is to make it legible, not to pretend it is absent.

### ★ C2 — THE KNIFE-EDGE CRITIQUE APPLIES TO MY OWN GATE. CLAIM CORRECTED.
`strong_bull_trend` clears at **44.80 vs 45.00 — a 0.20pp margin.** My rev-4 critique of the count gate ("would flip with one more trade") is **true of the interval gate at that bucket too.** **Honest claim, replacing the overstated one: NOT "no knife-edge" — "knife-edge on EVIDENCE instead of on COUNT."** Still the better quantity, because the edge now sits on the thing we care about. *(Margins: sma_trend_ride +10.36pp, strong_bull_trend +0.20pp, vwap_pullback −2.26pp.)*

### ★★ C3 — DESIGNED BEHAVIOR, STATED UP FRONT SO NOBODY DISCOVERS IT AT STEP-8. **THE INCREASE SIDE IS THE BIGGER FINDING AND HE DID NOT ASK ABOUT IT.**
The 50-trade window is sliced **before** grouping, so bucket n is **12–21 by construction**. At z=1.96:

| n | DECREASE needs | INCREASE needs |
|---|---|---|
| 12 | p ≤ 16.7% | p ≥ **83.3%** |
| 17 | p ≤ 17.6% | p ≥ **82.4%** |
| 21 | p ≤ 19.0% | p ≥ **81.0%** |
| 50 *(unreachable — window splits)* | p ≤ 30.0% | p ≥ 70.0% |

- **DECREASE fires only on EGREGIOUS buckets** (≈≤19% win rate at achievable n). A mediocre 30–40% bucket will **essentially never fire**. Langston's p=0.30/n=50 check reproduces (upper **43.8**, fires) — **but n=50 is not achievable post-split**, so at real n even 30% does not fire. **His point holds and is sharper at real n than at his illustrative one.**
- ★★ **THE CONSEQUENCE HE DID NOT ASK FOR, WHICH I AM SURFACING BECAUSE IT IS LARGER: at achievable n the INCREASE side is effectively UNREACHABLE — it needs an 81–83% win rate.** ⇒ **the calibration becomes able to recommend REDUCING but essentially never INCREASING.** That is a real directional asymmetry introduced by this gate. It is **acceptable ONLY because nothing auto-applies** (log-only consumer, verified). **It is NOT acceptable to leave undocumented**, and it must be re-examined before anything ever consumes these recommendations. **Filed as a named follow-up rather than buried in this scope.**

### HIS ANSWERS TO MY THREE QUESTIONS, ACCEPTED
1. **One window suffices for the SHAPE, not for the RATE.** ⇒ shape accepted now; **NO expected-firing-rate figure will be reported** — measuring duration before naming it.
2. **The pre-grouping slice is my strongest argument, not a weakness:** if bucket n is an artifact of where the 50-slice falls, any threshold expressed in n is calibrated against an artifact and an interval is invariant to it. It also **CAPS achievable n** ⇒ stated as a bound (C3).
3. **"Fires less often" is an OUTPUT, not a target.** ⇒ **SUCCESS CRITERION: every EMITTED recommendation survives the evidence test, and every SUPPRESSED one carries a stamped reason recording n, w and the interval.**

**Provenance:** my rev-4 dispatch reached him with the commit ref **empty** (shell-quoting fault, re-sent), so **he ruled on the dispatch BODY, not on the file** — recorded because a later reader would otherwise assume he read §7. He also flags the n/w counts and the 3% `patternType` figure as **RULED ON REPORTED FACT** (he verified the arithmetic, not the trade store).

### ★ §8a — Q1 ANSWERED: SHIP AHEAD OF THE REDESIGN — **BUT THIS IS NOT A TRADING FIX, AND MUST NOT BE DESCRIBED AS ONE**
**Langston: yes, ship it ahead of the redesign.** ★★ **AND THE FRAMING CORRECTION THAT MUST REACH THE COMPLETION REPORT AND KYLE:** he spot-checked the consumer set at head — the only readers of `/api/vts/predictive-adjustments/*` are **display queries in `client/src/pages/machine-learning.tsx:436-1131`**, and he found **no trading-path caller**. ⇒ **this is fix-on-find on a WRITE-ONLY RECOMMENDATION RECORD, not a live trading defect. Correct to fix; WRONG to describe as stopping bad trades.** His words: *say that plainly or Kyle will read it as a trading fix.* **Adopted verbatim as a reporting requirement** — the recommendation this job emits is read by a screen, not by the engine, so a bad recommendation has never moved a position.

### ★ §8b — Q2 ANSWERED: `z` IS A CODE CONSTANT, **NOT** A DB SETTING
**Do NOT add a DB setting + loud-failure machinery for the confidence level** — that is scaffolding for a number nobody will change. The only tunables that remain are `WIN_RATE_INCREASE_THRESHOLD = 55` / `..._DECREASE_THRESHOLD = 45` (`ml-calibration.ts:85-86`), already constants and explicitly OUT per OBJ-5.
⚠️ **This SITS BESIDE C1, it does not contradict it** — worth stating, because read alone the two sound opposed. **C1 = NAME and JUSTIFY `z` (it is load-bearing; it flips `vwap_pullback`). §8b = do NOT make it DB-tunable.** Both are satisfied by the same thing: **a named, commented code constant carrying the flip table.**
★ **FAIL-CLOSED AS A CODE PROPERTY (his requirement):** if the interval cannot be computed for any reason, the bucket returns **HOLD with the reason stamped — never falls through** to an emitted recommendation.

### ★★ §8c — Q3 **STRUCK AS MOOT**: ITS SUBJECT WAS DELETED WHILE THE QUESTION WAS IN FLIGHT
Q3 asked to trace the ratio manager's `score === 0` bound-slam. **`server/services/adaptive-ratio-manager.ts` is 404 at `795d8c92`** — `B-ARM-REMOVAL` landed; archived at `1-system-manual/_archive/deleted-code/b-arm-removal-adaptive-ratio-manager.ts.removed` (Langston verified the 404 **and** the archive 200). **There is no branch left to trace.** Struck together with §6's "Secondary" risk paragraph, which described the same dead code. **This is the third thing in this scope struck for the same reason** (OBJ-2/2b/3/4 first) — ⚠️ **the pattern is worth naming: a scope written against a file another live batch is deleting will keep rotting under you, and each strike was found by a reader rather than by me.**

### ★ §8d — SUCCESS CRITERION, RESTATED PER HIS Q3-ANSWER
**NOT "fires less often"** — that is an output, not a target. **The criterion:** every **emitted** recommendation survives the evidence test, and every **suppressed** one carries a stamped reason recording `n`, `w` and the interval bounds. **No expected-firing-rate figure will be reported** until several windows are sampled (his Q1 ruling: one window is enough for the SHAPE, not for the RATE).
