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

**OBJ-2 — ★ RE-SCOPED AT REV 2. IT IS NOT A VALUE CHANGE. IT NEEDS A THIRD STATE, AND REV 1'S VERSION WOULD HAVE MADE THINGS WORSE.**
  ⚠️ **REV 1 SAID "raise `minSamples` and hold the default." LANGSTON TRACED IT AND §6 HAD IT BACKWARDS — `null` does NOT route to the hold path in the case that matters:** `:128` `if (!idealPerf && !rotationalPerf)` requires **BOTH** null to hold, and the admission gate at `:107-109` is an **`||`** — one pool over threshold admits the whole branch. **The asymmetric case is ours:** rotational ≥ threshold, ideal < threshold ⇒ `aggregateToPoolPerformance` returns null for ideal only (`:198`) ⇒ sails past `:128` ⇒ `computePoolScore(null) = 0` (`:213`) ⇒ **`:147` fires — `targetIdealRatio = minIdealRatio` = 0.3, reasoning "Ideal pool inactive, maximizing rotational allocation"** ⇒ `smoothAdjustment` walks it 0.1/cycle to the floor and **pins it there.** Same outcome on the SQL path, since `computePoolScore` re-checks `minSamples` itself and a thin-but-non-null `PoolPerformance` also scores 0.
  ⇒ ★★ **RAISING `minSamples` ABOVE THE IDEAL POOL'S REALISTIC COUNT DOES NOT HOLD 0.7 — IT DRIVES SCAN ALLOCATION TO ITS 0.3 FLOOR AND KEEPS IT THERE.** Given §4a's measured ideal 457 vs rotational 31,101, that is **exactly** the configuration we would have created: a "safety guard" that silently and permanently re-allocates live scanning. **A guard must not change behaviour in a direction; it must decline to act.**
  ⇒ **REQUIRED SHAPE: gate BEFORE `computePoolScore`, adding a third state so "insufficient evidence" is distinguishable from "pool inactive."** Insufficient-evidence must hold the current/default ratio and say so; "inactive" keeps its existing meaning. **Re-estimate the work — this is new machinery, not a constant.**
  ⚠️ **DO NOT REUSE THE EXISTING SHRINKAGE MACHINERY (Langston):** `computeConfidence` (`:235`) caps at `totalSamples/100`, so **at any threshold in the hundreds it is pinned at 1.0 and `applyConfidenceAdjustment` (`:242-244`) is a NO-OP.** The shrink rev 1 praised as "a near-miss of something principled" **exists in name and is dead in fact at the new scale.**

**★ OBJ-2b (REV 2, Langston-required) — MEASURE THE POPULATION THE GATE ACTUALLY READS, WHICH IS *NOT* THE ONE §4a MEASURED.** The admission gate at `:108` reads `telemetry.getPoolPerformanceComparison()` — an **IN-MEMORY counter** incremented at `telemetry-aggregator.ts:334`, initialised to 0 at `:151-152`, and **zeroed by `flushStaleTelemetry`/`resetPoolAggregates` (`:671-674`). That is a PROCESS-LIFETIME count, not a 30-day window.** §4a's 31,558/457 are DB rows and **do not tell us what the gate sees between restarts** — after a deploy it starts from zero. ⇒ **Measure the live in-memory aggregates AND the `getPoolComparison` SQL window at Step 2 before choosing any number.** ⚠️ A threshold in the hundreds against a counter that resets on every restart could mean the gate is *never* satisfied in normal operation — check the restart cadence too.
  ★ **FIRST MEASUREMENTS TOWARD OBJ-2b (2026-07-28) — one solid, one self-caught before it became a false finding.**
  **SOLID:** staging `pm2 jlist` — **`restart_time` = 535**, `unstable_restarts` = 0, **current uptime 64 minutes**. Since the gate's counter is **process-lifetime and resets on every restart**, restart cadence is a first-class input to whether ANY threshold is reachable — not a footnote.
  **DB-derived rates (30d):** ideal pool **0.63 closed trades/hour** (457/30d), rotational **43.2/hour**. On a closed-trade-only basis that implies **~15.8 h of CONTINUOUS uptime to reach even the EXISTING `minSamples = 10`**, and **~619 h ≈ 25.8 days continuous to reach 393.**
  ⚠️ **SELF-CAUGHT CORRECTION — DO NOT USE THOSE HOURS AS THE ANSWER.** They assume the counter tracks closed trades. It does **not** only do that: `recordPairTelemetry` fires at **TWO** sites — `vts-runner.ts:3267` (closed trade) **and `:4964` (signal generation during the eval cycle**, in the `vtsEvalCounters.signalsGenerated++` block). Generated signals vastly outnumber closed trades, so **the true increment rate is HIGHER and those hour figures are an UPPER BOUND on the time, not an estimate of it.** ⇒ **Measure the counter directly; do not extrapolate from DB closed-trade rows.** (Applying a closed-trade rate to a counter that also counts signals would have been the SAME wrong-population error a fourth time — caught this once by asking which events increment it *before* publishing the number.)
  ⚠️ **`pm2` `created_at` is USELESS for restart cadence — it resets on restart** (it returned "0.0 days" against 535 restarts, which is what exposed it). A different instrument is needed for the uptime distribution.
  ⚠️ **ALSO NOTED, NOT CHASED:** because `:4964` passes a `success` derived from `tradeRecord.profit` on a *signal-generation* event, the aggregate's `winRate` may be mixing signal-level and trade-level semantics. **Observation only — out of scope here; do not act on it in this batch.**
  ★★★ **OBJ-2b ANSWERED FOR THE SQL PATH, AND THE ANSWER IS THAT THE SQL PATH HAS NO DATA AT ALL. `telemetry_history` IS EMPTY — ZERO ROWS, EVER.**
  **How the SQL path actually works (asked BEFORE measuring this time):** `adaptive-ratio-manager.ts:121` → `getPoolComparison(regime, mode)` (`telemetry-repository.ts:429`) → `getPerformanceByPool(pool, regime, mode, hoursBack = 24)` (`:371`) → `.from(telemetryHistory).where(… gte(telemetryHistory.timestamp, cutoff))`. ⇒ **the population is `telemetry_history` rows, PER POOL, PER REGIME, over a 24-HOUR window — NOT the 30-day `vts_open_trades` figures in §4a.** (Those 457/31,101 numbers describe a different table entirely. Fourth wrong-population error avoided by checking the read site first.)
  ★ **MEASURED (live DB, 2026-07-28): `SELECT max(timestamp), count(*) FROM telemetry_history` → `NULL`, `0`. The UNFILTERED count is the control — this is not an empty window, the table has NEVER been written.** Per pool × regime over 24h: 0 rows. Totals by pool: 0 rows.
  ⇒ **`getPoolComparison` can only ever return zero-sample pools, so the ratio manager's SQL evidence path contributes NOTHING and always has.** The component therefore depends **entirely** on the in-memory aggregates — which reset on every restart, and the process shows **535 restarts**. **Both of its evidence sources are structurally compromised: one is empty, the other is amnesiac.**
  ⚠️ **CAUSE NOT ESTABLISHED (rule 24.a).** A writer DOES exist — `cost-telemetry.ts:97` inserts into `telemetryHistory` — but it writes `mode='system', symbol='COST_METRICS'` rows, **a different shape from the per-pair pool/regime rows `getPerformanceByPool` queries**, and there is also a retention `.delete()` at `:145`. So candidate causes — the cost writer never fires; retention prunes everything; the per-pair pool/regime writer was never built — are **not yet discriminated. Do not report a cause until they are.**
  ★★ **PHASE-B IMPLICATION, RECORDED BECAUSE IT CONTRADICTS A STANDING NOTE:** #558's Phase-B plan carries `telemetry_history.final_score` (NOT NULL) + `hybrid_score` as the **"BUCKET-B LANDMINE — holds COST DATA — HARD EXCLUSION from the drop set."** **The table is EMPTY, so that exclusion rests on INTENT, not on data at risk.** It may make those columns trivially droppable from a data-loss standpoint — **subject to the writer census, which still governs.** Re-derive that exclusion at Phase B rather than inheriting it (**exactly the inherited-claim-with-a-timestamp rule from #593**).
  ★★ **PATTERN, NAMED BECAUSE IT IS NOW THREE-FOR-THREE TONIGHT — CC-A KEEPS MEASURING THE WRONG POPULATION:** (1) assumed the calibration population was the active path when it has always been VTS (Kyle's question caught it); (2) concluded "no underflow" from two pm2 windows containing **zero scanner lines** (my own validity control caught it); (3) measured 30-day DB rows for a gate that reads a process-lifetime in-memory counter (**Langston caught it**). **The failure is not carelessness about numbers — it is failing to ask WHICH POPULATION THE CODE ACTUALLY READS before measuring anything. Ask that first, every time, and cite the read site.**

**OBJ-3 — make the threshold DB-tunable, not hardcoded** (per §5 rule 15's per-asset-class/DB-resolved default), with **no silent fallback**: if the setting is absent, fail loudly rather than quietly reverting to a permissive number. ⚠️ Kyle's standing preference: *no hard-coded fallbacks for DB-governed settings.*
  ★ **REV 2, two Langston-required conditions.** (a) ⚠️ **`computeAdaptiveRatio` is wrapped in a `try/catch` at `:188-191` that returns `this.currentRatio` — a thrown "setting absent" would be SILENTLY SWALLOWED, turning our loud failure into exactly the quiet fallback we are forbidding.** Resolve the setting **outside** that catch, or emit to the §10.5 alert queue. (b) ★ **For a GUARD, absent-config must fail CLOSED — gate everything, produce no recommendations — and must NEVER fall through to ungated behaviour.** State it in the objective, not just the intent.

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
