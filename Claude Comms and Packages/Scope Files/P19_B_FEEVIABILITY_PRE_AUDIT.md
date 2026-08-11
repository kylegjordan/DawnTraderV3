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
