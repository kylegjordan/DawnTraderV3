# B-EVIDENCE-GATE — Scope (Step 1)

**change-class: non_architecture**
**Owner:** CC-A · **Date:** 2026-07-28 · **Status:** DRAFT — awaiting Kyle's go + Langston Step-1
**Parent finding:** #591 · **Research basis:** `Langston Design Asks/B_CALIBRATION_QUALITY_WEIGHT_RESEARCH_SYNTHESIS_r1.md` (`0d2939c2c`)

> ⚠️ **THIS BATCH DOES NOT FIX THE CALIBRATION WEIGHTING. The pinned multiplier (#591 limb b) and the win-rate reward problem REMAIN until the follow-on design batch.** This batch only stops both consumers acting on evidence that cannot support a decision. It is deliberately the narrow, uncontroversial half.

---

## 1. WHY THIS IS SPLIT OUT AND GOES FIRST

Kyle's standing rule 23 is fix-on-find, and Kyle restated it 2026-07-28: *"When we find broken or buggy code, we fix it right away."*

The research produced one finding that is **correct under every option Kyle might choose** for the wider redesign, and one that is **a live defect by any reading**:

★ **`ml-calibration.ts` HAS NO MINIMUM-SAMPLE GATE AT ALL.** The only guard in `analyzePerformance` is `if (total === 0) continue` (`:151`). A pattern with **one** closed trade that happened to win therefore reports `winRate = 100%`, clears `WIN_RATE_INCREASE_THRESHOLD = 55` (`:190`), and emits an INCREASE recommendation. That is not a tuning disagreement; it is a guard that was never written.

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

**OBJ-1 — `ml-calibration.ts`: add the missing minimum-sample gate.** Below threshold, the pattern produces **no recommendation** — `suggestion = 'HOLD'`, `adjustment = 0` — and the reason is stamped so a reader can tell "insufficient evidence" from "evidence says hold." **Not** a silent skip: the report must say *why*.

**OBJ-2 — `adaptive-ratio-manager.ts`: raise `minSamples` from 10 toward the power-analysis number, and hold the default ratio until met.** The gate already exists (`aggregateToPoolPerformance` returns null; `computePoolScore` returns 0) — this is a **value change plus an honest reason string**, not new machinery.

**OBJ-3 — make the threshold DB-tunable, not hardcoded** (per §5 rule 15's per-asset-class/DB-resolved default), with **no silent fallback**: if the setting is absent, fail loudly rather than quietly reverting to a permissive number. ⚠️ Kyle's standing preference: *no hard-coded fallbacks for DB-governed settings.*

**OBJ-4 — surface the gate state.** Whatever a human reads (the calibration report / the ratio-manager log line) must state sample count vs. requirement, so "nothing is adjusting" is visibly *"not enough evidence yet,"* never mistaken for *"the system is broken"* or *"the system agrees."*

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
