# P19-reorg-B2.3 — Per-(strategy × asset_class) minRR baseline-set

change-class: architecture

**Batch:** reorg-B2.3 · **Author:** Claude New (CC-B) · **Date:** 2026-06-27 · **Issue:** #372 (the baseline-set half) · **Owner-decision:** Kyle 2026-06-23
**Predecessor:** reorg-B2 seeded the per-CLASS `expectancy_gates.min_rr` (one `*` row per class, both = 2.5); reorg-B2.1/B2.2 re-keyed the guard-eval tracker to (strategy × asset_class) so per-class data accrues. **Soak satisfied:** tracker window open since 2026-06-23 19:51 UTC (>48h, persisted across restarts); both classes now carry real per-strategy RR data.

---

## 1. Why
The single global `min_rr = 2.5` (carried into both per-class `*` rows) is **higher than most strategies' DESIGNED reward-to-risk** (many are ~2.0 by construction, some ~1.0 — `REORG_B2_1_OBJ4_PER_STRATEGY_ANALYSIS`). Live VTS measurement confirms it suppresses **62–100% of every strategy** per class. The fix (Kyle 2026-06-23): replace the one-size 2.5 with a **per-(strategy × asset_class) floor set a notch BELOW each strategy's OWN-class mean RR** (Langston: anchoring AT the mean suppresses ~50% by construction; minRR is a coarse proxy — the Net-Expectancy gate downstream is the real judge). **xStock baselines come from xStock's OWN data, NOT a crypto borrow** (Kyle decision); thin-data strategies get a conservative default, not a derived value.

## 2. Measured per-class mean RR (live guard-eval-stats, window from 2026-06-23 19:51 UTC)
**crypto_spot:** morning_star 1.53 (7022 ev) · range_trade 1.90 (4523) · strong_bull_trend 2.00 (2456) · vwap_pullback 2.70 (1357) · support_bounce 0.86 (844) · reverse_impulse 2.64 (525) · mean_reversion 3.20 (258) · volatility_edge 0.69 (233) · **thin:** pivot_shift 2.58 (73) · vwap_bounce 2.00 (48) · defensive_hedge 1.18 (12) · inside_bar_reversal 1.04 (8).
**xstock_spot:** morning_star 0.94 (35170 ev) · vwap_pullback 2.18 (11016) · sma_trend_ride 2.00 (4532) · pivot_shift 2.40 (846) · vwap_bounce 2.00 (833) · **thin:** range_trade 2.19 (77) · mean_reversion 2.67 (2).
(Several strategies are FIXED-RR by design — rrMin≈rrMax≈2.00, near-zero variance: strong_bull_trend, sma_trend_ride, vwap_bounce.)

## 3. Objectives

### OBJ-1 — Per-strategy minRR resolution (mechanism)
Extend `getPerClassTargetGate(assetClass)` → `getPerClassTargetGate(assetClass, strategy?)` (`expectancy.ts:194`): resolve `min_rr` on key `{exchange:'*', assetClass, strategy, regime:'*'}` — most-specific-wins, so a `(assetClass, strategy)` row is used when present, else the per-class `(assetClass, '*')` row (the conservative DEFAULT). Thread the strategy name at the convergence points: the active path (`signal-orchestrator.ts:1224`, `strategyId` is in scope) + the VTS path (`vts-runner` normalizer call) + verify the `strategy-engine.ts` `applyGlobalGuards` sites resolve the same gate (Step-2 pre-audit confirms whether they share this path or a separate one). `floorPct`/`reach_atr_max` stay per-class (not per-strategy) — only `min_rr` goes per-strategy.
**Verify:** unit test — a seeded `(xstock_spot, morning_star)` row resolves for that strategy; an unseeded strategy falls back to the `(xstock_spot, '*')` default; crypto unaffected.

### OBJ-2 — Calibration migration (the baseline-set)
Migration seeds per-`(strategy × asset_class)` `expectancy_gates.min_rr` rows from §2 measured means via the §4 formula, for both classes; sets the per-class `*` fallback to the §4 conservative default (replacing 2.5). Rollback file OUT (consistent with prior). Fail-closed boot assertion unchanged (the per-class `*` rows still exist → no resolution can throw).
**Verify:** post-deploy, the live guard-eval-stats suppression rate drops materially for the calibrated strategies (and stays sane — not 0% across the board); the `*` fallback resolves for any strategy without a row.

### OBJ-3 — Visibility (no hidden gates, Kyle standing rule)
Confirm the per-strategy floor + its drop-by-reason surface in the Filter Diagnostics tabs (both classes) — the guard-eval-stats endpoint already carries `statsByClass`; ensure the per-strategy minRR value is visible where the gate's drops are shown (extend if needed).

### OBJ-5 — Strategy-name canonicalization SSOT + LOUD unknown-strategy fallback (the token-identity closure, Langston #1 risk)
Single shared `canonicalizeStrategyName()` SSOT (absorbs the inline `signal-orchestrator.ts:467` `range_trading→range_trade` alias + every sibling Step-2 enumerates) applied at the gate-resolution sites (orchestrator :1224 + VTS vts-runner :1465; strategy-engine sites already pass canonical literals — Step-2 confirms). **★ LOUD fallback (Langston NO-PATCHES):** when `getPerClassTargetGate` resolves a strategy key with no per-strategy row AND the strategy is not a known-canonical name, emit a warn + telemetry counter (do NOT throw — never break the eval cycle) so the next token-drift is DETECTED, not silently absorbed into the `*` default. §13 home: in THIS batch.
**Verify:** OBJ-1 unit test drives a REAL `range_trade` signal through the LIVE orchestrator path and asserts the resolved `min_rr` == the seeded per-strategy row (NOT the `*` fallback) — a regression to the silent-fallback bug fails the test (an isolated `canonicalizeStrategyName('range_trading')==='range_trade'` assertion would NOT catch a bypassed call site, so the test must drive the real path).

### OBJ-6 — Begin persisting `rrSumSq` in the guard-eval tracker (the dispersion instrumentation for 25-20)
The tracker persists `rrSum` (→ mean) but NO sum-of-squares → σ is unrecoverable from the existing window, forcing the coarse-v1 notch (§4-A). **BEGIN PERSISTING `rrSumSq` THIS batch** (not "add the column later") so the variance window is WARM by Phase-25; it must share the EXACT rolling-window eviction/reset semantics of `rrSum` (a Step-4 check — if they drift, the reconstructed σ is computed over a different sample set than the mean = garbage). Named consumer: **POST_AUDIT_ROADMAP 25-20** (the dispersion-aware recalibration: mean−0.5σ / P20, replacing the coarse v1).
**Verify:** post-deploy, `rrSumSq` accumulates alongside `rrSum` per (strategy×class); a unit test that `rrSumSq` and `rrSum` evict together over the window cap.

### OBJ-4 — Governance
SIM (the per-strategy resolution + the module_constants key change), System Manual (the per-strategy minRR calibration — content), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES (#372 baseline-set half RESOLVED; the win-rate recalibration stays homed at Phase-25 25-20), completion report, migration+MANIFEST.

## 4. Calibration formula — RESOLVED (Langston Step-1 consensus 2026-06-27)
- **A. The notch (coarse v1).** Spread strategy: `min_rr = round(meanRR × 0.90, 2)` (a magnitude-scaling 10% haircut). Fixed-RR strategy (`rrMin≈rrMax`, near-zero variance — strong_bull_trend, sma_trend_ride, vwap_bounce): `min_rr = round(meanRR − 0.05, 2)` (float a hair below the by-design value). **★ Documented honestly: `mean×0.90` is MAGNITUDE-AWARE but DISPERSION-BLIND — it assumes constant CV (σ ∝ mean), which is false; it is NOT a percentile/quantile lower-tail floor. It only beats a flat −0.25 because it scales with magnitude. It is acceptable as v1 ONLY because it's bounded below by the 1.0 floor (B) AND scheduled for replacement by the dispersion-aware recalibration at Phase-25 25-20.** Apply the 1.0 floor (B) AFTER the notch.
- **B. Absolute floor = 1.0 (LOCKED).** `min_rr = max(1.0, notch)`. Rationale (Langston): minRR is reward GEOMETRY, not realized win-rate; a sub-1.0-RR setup only clears Net-Expectancy if the win-rate beats ~1/(1+RR)+friction, and we have ZERO realized win-rate data (that's Phase-25, gated behind paper-active). Admitting sub-1.0 RR on VTS RR-distributions alone bets on an ESTIMATED-not-measured win-rate. Not higher than 1.0 either (re-strangles the 1.0–2.0-mean strategies the notch frees).
- **C. Thin cutoff 200 + `*` default 2.0 (LOCKED).** A strategy with < 200 evals in its class gets NO per-strategy row → resolves to the per-class `*` default = **2.0** (un-strangles from 2.5 to design-typical; a thin strategy earns its own lower row once evals accrue). **v1 casualty (named, completion-report limitations block):** a thin FIXED-RR strategy lands on 2.0 despite a reliable mean — `vwap_bounce` crypto (48 ev) → 2.0. **HOME = 25-20:** it's accumulating (~12/day, NOT structurally starved — 833 ev on xStock), and the Phase-25 dispersion-aware recalibration re-reads ALL strategies from the then-warm window, so it earns its proper floor there automatically (no separate auto-resolve mechanism).
- **D. morning_star-xStock / sub-1.0-mean throughput → KYLE's call, recommend KEEP SUPPRESSED.** 0.94 mean / 35k ev can't be adjudicated on RR alone (high-win-rate scalp vs low-win-rate dud — the RR floor can't tell them apart). This batch HOLDS it at the 1.0 floor (RR-distribution baseline, VTS only); the throughput decision is ROUTED to Phase-25 **25-20** (realized outcomes settle it). Escalated to Kyle 2026-06-27 — the keep-suppressed RECOMMENDATION is Langston's + CC-B's (CC-A concurs ONLY that the disposition is KYLE's call to make, NOT a sign-off on "suppress"). **The morning_star / sub-1.0-mean throughput disposition is OPEN pending Kyle's decision.** **Do NOT unsuppress as a side effect of this calibration** (this batch holds it at the 1.0 floor regardless; the trade-it-as-designed question is separate and Kyle's).

## 5. Out of scope
- The WIN-RATE recalibration (set floors from realized active-paper outcomes) — stays homed at Phase-25 **25-20**, gated behind paper-active turn-on (#372 win-rate half). This batch sets the RR-distribution baseline from VTS data only.
- `floorPct` / `reach_atr_max` per-strategy (stay per-class).

## 6. Workflow
Full 11-step. Bench (tsc baseline + vitest) before push; CI 4-green before deploy; Langston Step-1 (this scope — esp. §4 decisions), Step-2 (pre-audit: confirm the strategy-engine `applyGlobalGuards` gate path + the VTS resolution site + the exact strategy-name token at each + the canonical strategy list for seeding), Step-4 (migration + resolution diff), Step-8 (independent verify the suppression drop + fallback). Deploy + post-deploy guard-eval-stats read.
