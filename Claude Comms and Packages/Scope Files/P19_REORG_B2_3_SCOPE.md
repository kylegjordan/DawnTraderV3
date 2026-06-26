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

### OBJ-4 — Governance
SIM (the per-strategy resolution + the module_constants key change), System Manual (the per-strategy minRR calibration — content), BATCH_CATALOG, PHASE_HISTORY, PHASE_19_PLAN §1/§5, RUNNING_ISSUES (#372 baseline-set half RESOLVED; the win-rate recalibration stays homed at Phase-25 25-20), completion report, migration+MANIFEST.

## 4. Calibration formula — PROPOSED (the design decisions for Langston/Kyle)
**Proposed default (open to Langston):**
- **A. The notch.** For a strategy with **spread** (rrMax−rrMin meaningfully > 0): `min_rr = round(meanRR − 0.25, 2)`, i.e., a notch below mean to trim only the thin bottom. For a **fixed-RR** strategy (rrMin≈rrMax≈mean, near-zero variance): `min_rr = meanRR − 0.05` (just below the fixed value so its by-design signals pass — e.g., a 2.00 strategy floors at 1.95).
- **B. Absolute floor (DECISION — flag).** Several means are < 1.0 (morning_star xStock 0.94, support_bounce crypto 0.86, volatility_edge crypto 0.69) → a notch below admits reward<risk setups. **Proposed `min_rr` never below 1.0** (don't admit sub-1.0-RR setups even when the mean is low; the EV gate still judges those that pass). Langston/Kyle: is 1.0 the right absolute floor, or lower (trust the EV gate fully) / higher?
- **C. Thin-data threshold + conservative default (DECISION — flag).** **Proposed: a strategy with < 200 evals in its class gets NO per-strategy row → uses the per-class `*` conservative default.** Proposed conservative default = **2.0** (un-strangles from 2.5 to the design-typical, but stays a real bar where data is insufficient to justify lower). Langston/Kyle: is 200 the right thin cutoff, and is 2.0 the right conservative default (vs. keep 2.5 / vs. lower)?
- **D. Philosophy flag (Kyle).** The low-mean high-volume strategies (esp. morning_star xStock, 0.94 mean / 35k evals) are mostly sub-1.0-RR by nature — with the 1.0 floor they stay largely suppressed (correct?), vs. lowering the floor to actually trade them (more throughput, leans on the EV gate). This is a trading-philosophy call; surfacing it explicitly.

## 5. Out of scope
- The WIN-RATE recalibration (set floors from realized active-paper outcomes) — stays homed at Phase-25 **25-20**, gated behind paper-active turn-on (#372 win-rate half). This batch sets the RR-distribution baseline from VTS data only.
- `floorPct` / `reach_atr_max` per-strategy (stay per-class).

## 6. Workflow
Full 11-step. Bench (tsc baseline + vitest) before push; CI 4-green before deploy; Langston Step-1 (this scope — esp. §4 decisions), Step-2 (pre-audit: confirm the strategy-engine `applyGlobalGuards` gate path + the VTS resolution site + the exact strategy-name token at each + the canonical strategy list for seeding), Step-4 (migration + resolution diff), Step-8 (independent verify the suppression drop + fallback). Deploy + post-deploy guard-eval-stats read.
