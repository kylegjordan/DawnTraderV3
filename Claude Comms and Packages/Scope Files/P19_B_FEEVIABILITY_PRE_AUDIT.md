# P19-B-FEEVIABILITY — PRE-IMPLEMENTATION AUDIT

**CC-C, 2026-08-11. Kyle-directed, emphatic: full code review of everything the batch touches, plus SIM, System Manual, the Phase-19 active-trading-path audit, batch completion reports, batch history, and the pre-governance corpus in `bridge/canonical/`. Understand intent, original purpose, decisions made, and why.**

> **PART 1 OF 2 — SOURCES COMPLETED: `SYSTEM_IMPACT_MAP.md`, `RUNNING_ISSUES.md`, direct code read.**
> **STILL OUTSTANDING (part 2): `SYSTEM_MANUAL.md`, `ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`, the reorg-B2/B2.1/B2.2/B2.3 completion reports, `bridge/canonical/`, and the pre-governance batch folders.** Stated so no reader mistakes this for the finished article.

---

## ⛔ HEADLINE: **OBJ-3 CANNOT BE DONE AS SCOPED.** The reachability ceiling is a DOUBLE gate over two DIFFERENT ATR values.

The scope treats `reach_atr_max` as one uncalibrated number. **It is one number read by two independent gates that feed it two different ATR inputs**, with a documented one-directional over-rejection between them, on a component already scheduled for deletion, and with the measurement that would quantify the bias **unbuilt and unowned**.

### A.1 The two gates — both verified in code

| | site | ATR it uses |
|---|---|---|
| **GUARD-5** (signal-gen) | `strategy-helpers.ts:386` `validateReachability(entry, target, effectiveATR, reachAtrMax)`, called from `applyGlobalGuards:422` | **`effectiveATR`** — the strategy's own **clamped** ATR |
| **The normalizer** (downstream bridge) | `signal-target-normalizer.ts` `normalizeAndGateTarget` | **`mceContext.indicators.atr`** |

Both compare against the **same** `expectancy_gates.reach_atr_max` (`expectancy.ts:204-211`, per-class, `strategy:'*'`).
**SIM:232 states the relationship verbatim:** *"`signal-target-normalizer.ts` KEPT as a NET-NEUTRAL downstream bridge (no longer lifts; RR/reachability there are now **redundant double-gates**), to be **RETIRED in reorg-B2.2 OBJ-C**."*

### A.2 The divergence is KNOWN, DOCUMENTED, and points at our own candidate — **#371**
Verbatim from `RUNNING_ISSUES:1932`: GUARD-5 uses `getEffectiveATR` (clamped) *"while the normalizer's reachability uses `mceContext.indicators.atr`… the risk is **one-directional over-rejection** where `effectiveATR < mceContext.atr` makes `atrsToTarget` larger → **a signal GUARD-5 drops that the normalizer would have passed**."*
**★ AND IT NAMES OUR STRATEGY:** *"this divergence covers ALL guard-wired in-class strategies — including the 3 non-ATR-geometry ones (**`sma_trend_ride`**, `vwap_bounce`, `dhma`) which feed the reachability a **`computeATR(priceHistory)` pair-ATR** (their geometry is SMA/VWAP/realizedVol-based; reachability is a path-invariant PAIR property)."*
⇒ **`sma_trend_ride` builds its target as an R-multiple off a STRUCTURAL stop, then has that target judged against a PAIR ATR it never used.** This is the most likely mechanism behind the **926 `sma_trend_ride` unreachable drops in 5.2h** recorded at scope §1.3 — **a candidate cause, not an established one; the divergence has never been measured** (§A.3).

### A.3 ★ THE LEDGER SAYS THE MEASUREMENT IS IMPOSSIBLE. **IT IS NOT — it is a two-argument change.** (CC-C, new finding)
`RUNNING_ISSUES:1935` (#373) records condition (1) as **never built**, concluding *"condition (3) 'divergence QUANTIFIED' is **unreachable by construction**."* Its evidence: `recordGuardEval(strategy, rr, pass, dropReason, assetClass)` takes **no ATR parameters**. That is true.
**⚠️ BUT THE VALUES ARE ALREADY COMPUTED AND IN SCOPE AT EVERY CALL SITE.** Verified at `strategies/morning-star.ts:177-180` and the ~18 in-class sites (`strategy-engine.ts:302/437/571/683/…`), the shape is uniformly:
```ts
const _gr = applyGlobalGuards(entryPrice, stopPrice, targetPrice, effectiveATR, gate);
recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason, assetClass);
```
`GuardResult.atrsToTarget` is returned by `applyGlobalGuards` and is commented at `strategy-helpers.ts:398` **"reachability metric (for the #371 ATR-divergence measurement)"** — i.e. it was *built for this exact purpose* — and `effectiveATR` is a local one line above. **Both are dropped at the recording boundary.**
⇒ **#371 is a signature widening plus two arguments at ~18 sites, not a build.** *"Unreachable by construction" overstates it and should be corrected in the ledger.* **Recommend CC-C owns #371 and lands it as part of this batch** — it is the instrument OBJ-3 needs anyway, and it simultaneously unblocks #373 → reorg-B2.2 OBJ-C.
⚠️ **NOT ASSERTED:** I checked the tracker signature and a sample of call sites; I have **not** proven no other route already captures the magnitude. Same caveat CC-B recorded.

### A.4 What this does to OBJ-3
**Changing `reach_atr_max` changes BOTH gates at once**, and they will still disagree with each other by an unmeasured amount, biased in one direction. **A recalibrated ceiling on an unreconciled pair of inputs is not a calibration — it is a second guess on top of the first.**
**⇒ OBJ-3 MUST BE RE-SEQUENCED:** (i) land the #371 magnitude capture; (ii) read the divergence over a real window — *note the persisted tracker already holds* **576,787 evals across 6+ strategies since 2026-06-23**, so a window exists the moment the magnitudes are recorded; (iii) reconcile the ATR source **or** accept one as canonical **with evidence**; (iv) only then set the value.
**⚠️ AND OBJ-3 TOUCHES A COMPONENT WITH A PENDING DELETION** (`signal-target-normalizer.ts`, reorg-B2.2 OBJ-C). Whether we tune a gate inside a file scheduled for retirement is a sequencing question for Langston.
**★ OWNERSHIP GAP, §9.4:** `RUNNING_ISSUES:1935` states #371 is *"Pending Langston's assignment; until it has one, #373 CANNOT open."* **It has been unowned since 2026-06-21.** This batch is the natural home.

---

## ⛔⛔ A.5 — **THE SCOPE'S §1.3 REACHABILITY MEASUREMENT IS RETRACTED. I COUNTED THE WRONG LANE.** (Kyle-directed re-check, 2026-08-11)

**WHAT I CLAIMED (scope §1.3, and part 1 of this audit built on it):** *"`unreachable` 1,452 drops in 5.2h — falling on `sma_trend_ride` 926, `vwap_pullback` 512."*

**⛔ FALSE. Every one of those lines is a VTS TAG, not a drop.** Verified: **100% of `unreachable` occurrences in the log carry the marker `[reorg-B3.3x][VTS][TAG_NO_DROP]`**, whose own text reads:
> *"`VIA/USD/sma_trend_ride would-gate=unreachable rr=2.00 — simulating anyway for learning data (active path still suppresses)`."*

The crypto VTS lane runs `gateDisposition='tag'` (SIM:241 — *"ONLY the crypto VTS path passes `'tag'`"*), so it **marks and simulates anyway**. **Active-path drops surface as `Global guards failed` and carry no reason on that line.** ⇒ **I measured a lane that by construction does not drop, and reported it as the drop rate.** Same wrong-population class as the four earlier corrections; the log-grep was never the right instrument.

### ★ THE RIGHT INSTRUMENT EXISTS AND IS PURPOSE-BUILT — `GET /api/diagnostics/guard-eval-stats` (schema `guard-eval-stats/v3`)
**OBJECT:** the persisted `guard-eval-tracker`. **POPULATION:** every guard evaluation since `trackerStartedAt = 2026-06-23T19:51:53Z` — **a seven-week window, persisted across restarts** (#374 OBJ-A), **not a 5-hour log slice.**

| strategy | evals | passes | **reachDrops** | **reach %** | rrDrops | meanRR |
|---|---|---|---|---|---|---|
| **`sma_trend_ride`** | 97,975 | 12,002 | **80,233** | **81.9%** | 4,869 (5.0%) | **2.00** (rrMin=rrMax=2.00) |
| **`vwap_pullback`** | 241,263 | 13,254 | **129,628** | **53.7%** | 88,043 (36.5%) | 2.21 |
| **`morning_star`** | 503,233 | 168,779 | **0** | **0%** | **333,566 (66.3%)** | **1.05** |

### ★★ THE CORRECTED FINDING IS **STRONGER** THAN THE ONE IT REPLACES — and it re-points the batch again
1. **The reachability ceiling drops 82% of `sma_trend_ride` and 54% of `vwap_pullback`** — the two strategies carrying the largest targets — measured over seven weeks on the instrument built for it. **My retracted figure understated this by orders of magnitude while attributing it to the wrong lane.**
2. **`morning_star` has ZERO reachability drops.** It is killed **entirely by the RR floor** — 333,566 drops, and its **meanRR is 1.05** against a floor of 2.5. ⇒ **it is not remotely near viable on reward-to-risk**, a *third* independent instrument agreeing with the 2.0% hit rate and the 68% suppression rate. **The retire-or-rebuild question is now firmly evidenced.**
3. **`sma_trend_ride`'s RR is invariant at exactly 2.00** (`rrMin == rrMax == 2.0`) — it is the 2R-off-structural-stop construction, confirmed empirically. Its rrDrops are only 5%, so **its per-`(strategy×class)` minRR was already recalibrated below 2.0 at reorg-B2.3** — consistent with §B and further reason not to touch `min_rr`.

### WHAT SURVIVES OF §A.1–A.4, AND WHAT DOES NOT
- **SURVIVES:** the double-gate itself (`strategy-helpers.ts:386` vs the normalizer, two ATR sources, one constant), the #371 divergence, and the finding that **#371's capture is a two-argument change, not a build** (§A.3). Those are code reads, not log counts.
- **SURVIVES AND STRENGTHENS:** the OBJ-3 re-sequencing argument. The ceiling is now shown to suppress **82%/54%** of our two best-target strategies on a seven-week instrument — so recalibrating it matters *more*, and doing it on an unreconciled ATR pair matters more too.
- **DOES NOT SURVIVE:** any figure sourced from the `unreachable` log grep, in the scope or in this document. **`reachDrops` from the tracker is the only admissible number.**
- ⚠️ **STILL UNKNOWN:** whether these `reachDrops` are attributable to GUARD-5, to the normalizer, or to both. The tracker records the **guard's** verdict. **The normalizer-side count remains unmeasured — which is exactly #371.**

---

## A.6 — **THE CORRECTED FIGURE HAS THE SAME FLAW. Retracted a second time, and the honest position is that the live reachability rate is UNMEASURED BY DESIGN.** (Kyle-directed re-check #2)

**The tracker records the guard's VERDICT, not an enforced drop.** Verified at `strategies/morning-star.ts:179-180`:
```ts
recordGuardEval('morning_star', _gr.rr, _gr.pass, _gr.dropReason, assetClass);   // ← records FIRST
if (guardForcesDrop(_gr, gateDisposition)) { … }                                  // ← decides SECOND
```
And `guardForcesDrop` (`strategy-helpers.ts:454-458`) returns **false** under `disposition='tag'` for taggable reasons — **VTS does not drop, but the counter has already scored it as a drop.** ⇒ **`reachDrops` = "times the guard said unreachable, across BOTH lanes", and VTS supplies most of the volume.**
⛔ **So §A.5's 81.9% / 53.7% are NOT active-path drop rates either. Retracted.** *(Second instance of the same error in one hour, on the instrument I introduced to fix the first.)*

### ★ AND THERE IS NO ACTIVE-PATH SOURCE — IT IS INTENTIONAL, NOT A GAP
`signal_eval_archive` `strategy_internal` rows, crypto, 24h: **every source is `vts-runner`** (`breakout_fail` 9,161 · `indicator_filter` 4,129 · … · `guard_fail` 654). And `stage-attrition-cache.ts:25` states the design verbatim:
> *"`strategy_internal` has **no active-path writer at all — it is a VTS-only stage. A blank active cell there is correct**, and the client says so rather than rendering a bare 0."*
⇒ **Working-as-designed (rule 24 outcome 2), NOT a defect and NOT a recording gap to fix.** My "second recording gap" hypothesis is **refuted before it was filed** — §9.5(b-ii) doing its job.

### ★★ THE USABLE CONSEQUENCE — OBJ-3 does not need the drop count
We cannot count what the ceiling rejects on the live path. **We do not need to.** The stage *after* it **is** recorded: `signal_eval_archive`, `source='signal-orchestrator'`, `reject_stage IN ('sqe','admitted')`. **A ceiling change shows up as PASS-THROUGH VOLUME arriving at the SQE.**
⇒ **OBJ-3's verification criterion is rewritten: measure the change in signals REACHING the SQE (per strategy, `source='signal-orchestrator'`), not the change in drops.** Same effect, a recorded object, no new instrumentation.
⚠️ **AND THIS WEAKENS THE #371 ARGUMENT AT §A.3** — the divergence capture is still worth having for the normalizer retirement, but **OBJ-3 no longer depends on it**, so it should not gate this batch. **Downgrade from blocker to recommendation.**

## A.7 — **`morning_star`: "BROKEN" WITHDRAWN. It is a COST MISMATCH, and it may be fine on xStock.**

Its target is volatility-scaled (`entry + 2.5×ATR`), but **its stop is STRUCTURAL** — `morning-star.ts:173`: `stopPrice = Math.min(c2Low, c1Low) * (1 − 0.003)`, i.e. **the low of the two prior candles**, minus a hardcoded 0.3% buffer *(one of the nine B72 "KEEP — geometric buffer" constants)*.
⇒ **On crypto those pattern lows sit far below entry, so reward-to-risk lands near 1:1 (measured meanRR 1.05).** At 1:1 you need >50% wins to break even **before** costs; after 0.80% round-trip, far more.
**⇒ NOT a malfunction — a mismatch between a pattern-defined stop and our cost base.** And **not dial-fixable**: the stop is the pattern. Moving it changes what the strategy *is*.
**⇒ CORRECT DISPOSITION: not "retire", but "does not fit crypto's cost structure — test whether it fits xStock's",** where the same patterns are tighter. Scope §4.2 amended.

---

## B. CORROBORATION FOUND IN THE LEDGER FOR SCOPE FINDINGS (§9.5(b-ii) — search before filing)

- **`morning_star` independently confirmed broken.** `RUNNING_ISSUES:1935` records the persisted tracker at **272,758 evals / 186,096 `rrDrops` — a 68% reward-to-risk drop rate.** That is an *entirely different instrument* from the scope's hit-rate replay (2.0% hit rate over 553 trades) and it points the same way. **Two independent measurements; the retire-or-rebuild question at scope §4.2 is well-founded.**
- **The RR floor's own history.** `min_rr = 2.5` was **already recalibrated once** — reorg-B2.3 set per-`(strategy × asset_class)` baselines off this same persisted window (`expectancy.ts:205`: *"floorPct + reachAtrMax stay PER-CLASS (strategy:'*'); only min_rr goes per-(strategy×class)"*). ⇒ **the scope's out-of-scope ruling on `min_rr` is right for a second reason: it is the ONE knob of the three that has already had a data-driven pass.**

---

## C. WHAT PART 2 MUST STILL COVER — named now so it cannot be quietly skipped

1. **`SYSTEM_MANUAL.md`** — target-setting + reachability math sections (SIM points at them for reorg-B2).
2. **`ACTIVE_TRADING_PIPELINE_AUDIT_AS_OF_2026-06-18.md`** — the Phase-19-opening audit Kyle named specifically.
3. **Completion reports:** reorg-B2, B2.1, B2.2, B2.3 (the constants' birth + the one recalibration that happened), P19-B7.1 (the ranker), reorg-B4 (shadow layer), P19-B8.5a/b/c (gate topology + the deleted kernel calls).
4. **`bridge/canonical/`** — pre-governance intent for anything predating 2026-01/02, per §9.5(b). **Record the result even if it is "no coverage" — that is itself a finding.**
5. **The pre-governance batch folders** (`Archived Reports - Pre-Phase 12 Governance Implementation/`).
6. **§9.5(a) COMPONENT CENSUS at every hop** — writers / readers / mutators / **deleters** / schedulers, per component. **Not a path trace**: the scope's funnel was redrawn three times precisely because forward-tracing stops at the first sufficient explanation.
7. **§9.5(a-ii) DELETION-TIME STATE-WRITE CENSUS** — OBJ-1 may re-scope toward *why `rtb_signals.block_reason` is empty*; if anything is removed, enumerate the state it writes and grep for surviving readers.
