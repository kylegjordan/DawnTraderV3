# B-EVIDENCE-GATE — Scope (Step 1)

**change-class: non_architecture**
**Owner:** CC-A · **Date:** 2026-07-28 · **Status:** ★ **REV 2 — Langston Step-1 APPROVED TO PROCEED with three required changes (all folded in below). Kyle's condition met: he delegated the method decision to the crew, and Langston agrees with the direction — confidence/shrinkage over a quality composite, net log-growth over win rate.** ⚠️ His agreement on the LITERATURE half is RULED ON REPORTED FACT (he re-read the code, not the papers); his independent research pass still stands before the reward-metric batch commits.
**Parent finding:** #591 · **Research basis:** `Langston Design Asks/B_CALIBRATION_QUALITY_WEIGHT_RESEARCH_SYNTHESIS_r1.md` (`0d2939c2c`)

> ⚠️ **THIS BATCH DOES NOT FIX THE CALIBRATION WEIGHTING. The pinned multiplier (#591 limb b) and the win-rate reward problem REMAIN until the follow-on design batch.** This batch only stops both consumers acting on evidence that cannot support a decision. It is deliberately the narrow, uncontroversial half.

---

## 1. WHY THIS IS SPLIT OUT AND GOES FIRST

Kyle's standing rule 23 is fix-on-find, and Kyle restated it 2026-07-28: *"When we find broken or buggy code, we fix it right away."*

The research produced one finding that is **correct under every option Kyle might choose** for the wider redesign, and one that is **a live defect by any reading**:

★ **`ml-calibration.ts` HAS NO MINIMUM-SAMPLE GATE AT ALL.** The only guard in `analyzePerformance` is `if (total === 0) continue` (**`:172`** — rev 1 mis-cited this as `:151`; Langston corrected it at the ref, and independently confirmed the OBJ-1 defect: *"analyzePerformance has no minimum-sample gate of any kind."*). A pattern with **one** closed trade that happened to win therefore reports `winRate = 100%`, clears `WIN_RATE_INCREASE_THRESHOLD = 55` (`:190`), and emits an INCREASE recommendation. That is not a tuning disagreement; it is a guard that was never written.

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

**Secondary:** the ratio manager's `score === 0` branch slams the ratio to a bound. Raising `minSamples` returns `null` (not 0) below threshold, which routes to the "no pool data" path — **verify that path holds the current ratio rather than jumping.** ⚠️ This interacts with the win-rate-only cliff recorded in #593's tail note; check it explicitly.

---

## 7. QUESTIONS FOR LANGSTON

1. Agree this splits out and ships ahead of the formula redesign?
2. Is the DB-tunable-with-loud-failure shape right, or is a constant acceptable for a guard?
3. On the ratio manager, does returning `null` below the raised threshold hold the ratio steady, or does it reach the bound-slamming branch? I have not yet traced it and will not claim either way.

---

## 7. ★ STEP-2 MEASUREMENT (2026-07-28) — THE GATE SHOULD BE INTERVAL-BASED, NOT COUNT-BASED. REV 4.

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
