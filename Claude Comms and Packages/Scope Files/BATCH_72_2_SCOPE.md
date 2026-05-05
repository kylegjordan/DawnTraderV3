# BATCH_72_2_SCOPE.md — In-Class Quant Strategy Lever Migration

**Status:** Step 1/2 — drafted 2026-05-06. Pending Langston review.
**Branch:** `migration/aws-supabase`.
**Owner:** Claude Code, Step 4+ co-owned with Langston.
**Trigger:** B72.1 closure audit (2026-05-06) refuted my prior "9 active strategies / no levers escaped audit" finding. Live universe is 18 canonical strategies; B72 main migrated only the 9 file-based ones; the 9 in-class quant strategies in `server/services/strategy-engine.ts` were missed.

---

## §A. Why this batch

`server/config/canonical-regime-strategy-map.ts:365–385` defines 18 canonical strategies via `STRATEGY_DISPLAY_NAMES`. `module_constants` on staging contains `strategy.*` rows for exactly the 9 file-based strategies in `server/strategies/`; the 9 in-class strategies (`vwap_pullback, abcd_long, sma_trend_ride, breakout, mean_reversion, range_trade, vwap_bounce, dhma, liquidity_trap`) have **zero** rows.

Their parameters live as hardcoded literals in two surfaces:
1. **Detector method bodies** in `strategy-engine.ts` (lines 87–1344) — `detect*` functions read `params.X` with `||` fallbacks to literals.
2. **Dispatcher param-object literals** at `vts-runner.ts:766–820`, `signal-orchestrator.ts:1535–1638`, `stage-b-validator.ts:308–396`, `paper-sim-diagnostic.ts:461–463`, `historic-signal-generator.ts:290–294`, `strategy-validator.ts:246–382`, `routes.ts:9437–9461`.

Production DB shows these strategies are highly active — `vwap_pullback` alone produces 26,540 evaluations / 7d (highest in the system). B72's claim of "comprehensive lever sweep" is materially incomplete; B72.2 closes the gap.

---

## §B. Inventory summary

| Strategy | detect line | PROMOTE rows | HIGH | MED | LOW |
|---|---|---|---|---|---|
| vwap_pullback | 87 | 16 | 7 | 7 | 2 |
| abcd_long | 222 | 12 | 5 | 5 | 2 |
| sma_trend_ride | 340 | 12 | 6 | 4 | 2 |
| breakout | 455 | 13 | 4 | 6 | 3 |
| mean_reversion | 541 | 13 | 5 | 7 | 1 |
| range_trade | 625 | 15 | 8 | 6 | 1 |
| vwap_bounce | 719 | 11 | 5 | 5 | 1 |
| liquidity_trap | 804 | 13 | 5 | 7 | 1 |
| dhma | 1156 | 24 | 12 | 11 | 1 |
| **Total** | | **129** | **57** | **58** | **14** |

(Full lever tables inlined below in §F.1–§F.9; same format as `LEVER_INVENTORY.md`.)

`STRATEGY_CALL_SETTINGS` (vts-runner.ts:146) — all 7 keys are already DB-governed via `trading_settings` / `guardrails` and stay KEEP.

---

## §C. Architectural pattern

Same as B72 main:
1. INSERT 129 rows into `module_constants` under `module_name='strategy.<key>'`, scope `(*, *, <key>, *)`.
2. At top of each `detect*` method:
   ```ts
   const c = getCachedNumbersForModule('strategy.<key>', { exchange:'*', assetClass:'*', strategy: '<key>', regime:'*' });
   ```
   String-enum levers use `getCachedConstant<string>(...)` per B72 precedent.
3. Extend `server/startup/b72-warmup.ts` `PREFETCH_MODULES` with the 9 new module names. Boot hard-fails if any module has zero rows.
4. Strip dispatcher param-object literals so the detector resolves authority entirely from `module_constants`. `vts-runner.ts` and `signal-orchestrator.ts` discrepancies (see §D) collapse to a single canonical value.

---

## §D. Discrepancies that must be resolved before SQL seed

Three production paths have been running with **different parameter values** between `vts-runner.ts` and `signal-orchestrator.ts`. B72.2 must pick a canonical value per lever:

| Lever | vts-runner value | signal-orchestrator value | Recommendation |
|---|---|---|---|
| `breakout.volumeMultiplier` | 1.5 | 2.0 | **1.5** — matches detector internal default + HF8 calibration comment |
| `mean_reversion.deviationThreshold` | 2.0 | 2.5 | **2.0** — vts is active passive-learning surface |
| `range_trade.minRangeDurationHours` | 7 | 12 | **7** — vts canonical |
| `range_trade.minRangeWidth` | 2 | 3 | **2** — vts canonical |
| `range_trade.minBoundaryTouches` | 1 | 3 | **1** — vts canonical |

**Why vts wins:** vts-runner is the active passive-learning loop generating production signals (26.5k vwap_pullback evals / 7d on staging). `signal-orchestrator.ts` is the deferred live path. Calibration evidence rolls up via VTS, so promoting orchestrator's stricter values would invalidate B67.x calibration windows. Confirm in Step 4.

---

## §E. Implementation slices

| Slice | Scope | Files | Risk |
|---|---|---|---|
| 1 | Seed 129 `module_constants` rows + extend PREFETCH_MODULES + deploy + verify boot warmup logs | 1 SQL migration + `server/startup/b72-warmup.ts` | LOW |
| 2 | Refactor `vwap_pullback`, `abcd_long`, `sma_trend_ride` (already accept `settings` from `trading_settings`) — replace `||` fallbacks with `getCachedNumbersForModule()`. Per-row unit tests for HIGH-risk geometry. | `strategy-engine.ts` lines 87–438 | MED |
| 3 | Refactor `breakout`, `mean_reversion`, `range_trade`, `vwap_bounce`, `dhma` detectors. Resolve §D discrepancies first. Per-row unit tests. | `strategy-engine.ts` lines 455–1344 | HIGH |
| 4 | Strip dispatcher param-object literals from `vts-runner.ts:766–820`, `signal-orchestrator.ts:1535–1638`, `stage-b-validator.ts:308–396`, `routes.ts:9437–9461`. Detectors now ignore the param arg or accept it as override-only. | 4 dispatcher files | HIGH |
| 5 | `liquidity_trap` migration — same pattern as Slice 3 — detector reachable only via `stage-b-validator.ts:384` (production paths block via `UNIVERSALLY_DISABLED_STRATEGIES`). | `strategy-engine.ts:804`, `stage-b-validator.ts:384` | LOW |
| 6 | Tier 2 governance: SYSTEM_MANUAL Configuration Surface appendix update; ADJUSTMENT_FRAMEWORK strategy table extension; BATCH_CATALOG B72.2 row; PHASE_HISTORY entry; MEMORY.md sync; **revert/correct B72.1 §13.1 + completion-report §K.3 wrong "9 active / 8 dead" conclusion**; LEVER_INVENTORY.md updated; CHANGES_AND_FIXES bug entry for the 17-vs-9 governance gap that B72 main shipped. | governance docs | LOW |

---

## §F. Lever tables (full per-strategy)

> Convention: `Module = strategy.<key>` · `Scope = (*, *, <key>, *)` · constant names in `lower_snake_case`.

### §F.1 vwap_pullback (16 rows · `detectVWAPPullback` — strategy-engine.ts:87)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-VP-001 | 102 | counter-trend LONG DBS exclusion | -0.35 | counter_trend_long_dbs_floor | HIGH |
| B72-2-VP-002 | 109 | settings fallback `vwapPullbackThreshold` | 3.0 (%) | pullback_threshold_pct_default | MED |
| B72-2-VP-003 | 110 | settings fallback `vwapVolumeMultiplier` | 1.5 | volume_multiplier_default | MED |
| B72-2-VP-004 | 111 | settings fallback `vwapMaxHoldingPeriod` | 24 | max_holding_period_bars_default | LOW |
| B72-2-VP-005 | 122 | min priceHistory length for vol confirm | 10 | volume_confirm_min_history | LOW |
| B72-2-VP-006 | 129 | volume avg lookback | 20 | volume_avg_lookback | MED |
| B72-2-VP-007 | 149 | ATR fallback fraction of (h24-l24) | 0.10 | atr_fallback_daily_range_frac | LOW |
| B72-2-VP-008 | 150 | entry premium ATR multiplier | 0.10 | entry_atr_premium | HIGH |
| B72-2-VP-009 | 166 | default stop ATR mult (vwap-side) | 0.5 | stop_atr_mult_vwap | HIGH |
| B72-2-VP-010 | 166 | default stop ATR mult (low24-side) | 0.10 | stop_atr_mult_low24h | HIGH |
| B72-2-VP-011 | 167 | default target ATR offset (high24) | 0.25 | target_atr_offset_high24h | HIGH |
| B72-2-VP-012 | 170 | default 2R-target risk multiple | 2 | target_r_multiple_default | HIGH |
| B72-2-VP-013 | 189 | base confidence | 0.7 | base_confidence | MED |
| B72-2-VP-014 | 189 | reversal-pattern bump | 0.2 | reversal_confidence_bonus | MED |
| B72-2-VP-015 | 1027 | (helper detectBullishReversal) nearVwap ATR cap | 2.0 | bullish_reversal_near_vwap_atr | MED |
| B72-2-VP-016 | 1029 | (helper) above-low ATR threshold | 0.5 | bullish_reversal_above_low_atr | MED |

### §F.2 abcd_long (12 rows · `detectABCDLong` — strategy-engine.ts:222)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-AB-001 | 227 | settings fallback `abcdMinConsolidation` | 10 | min_consolidation_bars_default | MED |
| B72-2-AB-002 | 228 | settings fallback `abcdBreakoutThreshold` | 1.5 (%) | breakout_threshold_pct_default | MED |
| B72-2-AB-003 | 229 | settings fallback `abcdVolumeMultiplier` | 1.5 | volume_multiplier_default | MED |
| B72-2-AB-004 | 230 | settings fallback `abcdExitType` | 'target' | exit_type_default | LOW |
| B72-2-AB-005 | 231 | settings fallback `abcdTargetPercent` | 3.0 (%) | target_percent_default | HIGH |
| B72-2-AB-006 | 232 | settings fallback `abcdTrailingStopPercent` | 2.0 (%) | trailing_stop_pct_default | MED |
| B72-2-AB-007 | 244 | A-point spike search slice | 10 | a_point_search_window | MED |
| B72-2-AB-008 | 247 | B-point pullback search slice | 5,15 | b_point_search_start / b_point_search_end | MED |
| B72-2-AB-009 | 273 | entry ATR buffer | 0.3 | entry_atr_buffer | HIGH |
| B72-2-AB-010 | 274 | stop ATR buffer | 0.5 | stop_atr_buffer | HIGH |
| B72-2-AB-011 | 290 | trailing-exit 2R risk multiple | 2 | trailing_target_r_multiple | HIGH |
| B72-2-AB-012 | 304 | base confidence | 0.75 | base_confidence | MED |

### §F.3 sma_trend_ride (12 rows · `detectSMATrendRide` — strategy-engine.ts:340)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-SMA-001 | 351 | counter-trend LONG DBS exclusion | -0.35 | counter_trend_long_dbs_floor | HIGH |
| B72-2-SMA-002 | 359 | settings fallback `smaEntryCondition` | 'above' | entry_condition_default | LOW |
| B72-2-SMA-003 | 360 | settings fallback `smaExitCondition` | 'break' | exit_condition_default | LOW |
| B72-2-SMA-004 | 361 | settings fallback `smaTrailingStopPercent` | 2.0 (%) | trailing_stop_pct_default | MED |
| B72-2-SMA-005 | 362 | settings fallback `smaLength` | 20 | sma_length_default | MED |
| B72-2-SMA-006 | 366 | min priceHistory length | 10 | min_history_bars | LOW |
| B72-2-SMA-007 | 393 | entry premium multiplier | 1.002 | entry_premium_mult | HIGH |
| B72-2-SMA-008 | 395 | swing-low stop multiplier | 0.998 | swing_low_stop_mult | HIGH |
| B72-2-SMA-009 | 395 | SMA-relative stop multiplier | 0.995 | sma_stop_mult | HIGH |
| B72-2-SMA-010 | 403 | trailing-strength target factor | 0.03 | trailing_strength_factor | HIGH |
| B72-2-SMA-011 | 409 | break-exit 2R risk multiple | 2 | break_target_r_multiple | HIGH |
| B72-2-SMA-012 | 422 | base confidence | 0.65 | base_confidence | MED |

### §F.4 breakout (13 rows · `detectBreakout` — strategy-engine.ts:455)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-BO-001 | 459 | param fallback `minConsolidationBars` | 10 | min_consolidation_bars | MED |
| B72-2-BO-002 | 460 | param fallback `breakoutBuffer` | 1 (%) | breakout_buffer_pct | HIGH |
| B72-2-BO-003 | 461 | param fallback `volumeMultiplier` | 1.5 | volume_multiplier | MED |
| B72-2-BO-004 | 462 | param fallback `maxHoldingHours` | 12 | max_holding_hours | LOW |
| B72-2-BO-005 | 470 | maxRangeWidth ATR floor | 7 | max_range_width_floor_pct | MED |
| B72-2-BO-006 | 470 | maxRangeWidth ATR mult | 5.0 | max_range_width_atr_mult | MED |
| B72-2-BO-007 | 471 | touch tolerance ATR divisor | 4 | touch_tolerance_atr_divisor | MED |
| B72-2-BO-008 | 471 | touch tolerance fallback | 0.003 | touch_tolerance_fallback | LOW |
| B72-2-BO-009 | 474 | detectRange minBoundaryTouches | 2 | min_boundary_touches | MED |
| B72-2-BO-010 | 491 | volume avg lookback | 10 | volume_avg_lookback | LOW |
| B72-2-BO-011 | 496 | entry premium multiplier | 1.002 | entry_premium_mult | HIGH |
| B72-2-BO-012 | 497 | stop multiplier (below range low) | 0.998 | stop_below_low_mult | HIGH |
| B72-2-BO-013 | 509 | base confidence | 0.75 | base_confidence | MED |

### §F.5 mean_reversion (13 rows · `detectMeanReversion` — strategy-engine.ts:541)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-MR-001 | 546 | param fallback `meanType` | 'vwap' | mean_type_default | LOW |
| B72-2-MR-002 | 547 | param fallback `smaLength` | 20 | sma_length_default | MED |
| B72-2-MR-003 | 552 | ATR-mult deviation floor | 0.03 | deviation_threshold_floor | HIGH |
| B72-2-MR-004 | 552 | ATR-mult deviation multiplier | 1.5 | deviation_threshold_atr_mult | HIGH |
| B72-2-MR-005 | 553 | param fallback `partialExitPercent` | 50 | partial_exit_percent | MED |
| B72-2-MR-006 | 554 | param fallback `stopLossBuffer` | 1 (%) | stop_loss_buffer_pct | HIGH |
| B72-2-MR-007 | 556 | min priceHistory length | 20 | min_history_bars | MED |
| B72-2-MR-008 | 565 | midpoint detectRange minRangeBars | 10 | midpoint_range_min_bars | MED |
| B72-2-MR-009 | 565 | midpoint detectRange maxRangePct | 8 | midpoint_range_max_pct | MED |
| B72-2-MR-010 | 565 | midpoint detectRange minTouches | 2 | midpoint_range_min_touches | MED |
| B72-2-MR-011 | 582 | entry premium multiplier | 1.001 | entry_premium_mult | HIGH |
| B72-2-MR-012 | 584 | target mult (below mean) | 0.998 | target_below_mean_mult | HIGH |
| B72-2-MR-013 | 594 | base confidence | 0.7 | base_confidence | MED |

### §F.6 range_trade (15 rows · `detectRangeTrading` — strategy-engine.ts:625)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-RT-001 | 629 | param fallback `minRangeDurationHours` | 7 | min_range_duration_hours | MED |
| B72-2-RT-002 | 630 | param fallback `minBoundaryTouches` | 1 | min_boundary_touches | MED |
| B72-2-RT-003 | 634 | param fallback `entryZoneWidth` | 1.5 (%) | entry_zone_width_pct | HIGH |
| B72-2-RT-004 | 635 | param fallback `stopLossBeyond` | 1 (%) | stop_loss_beyond_pct | HIGH |
| B72-2-RT-005 | 637 | min priceHistory length | 30 | min_history_bars | LOW |
| B72-2-RT-006 | 645 | minRangeWidth ATR floor | 0.015 | min_range_width_floor | MED |
| B72-2-RT-007 | 645 | minRangeWidth ATR mult | 2.0 | min_range_width_atr_mult | MED |
| B72-2-RT-008 | 646 | touch tolerance ATR divisor | 4 | touch_tolerance_atr_divisor | MED |
| B72-2-RT-009 | 652 | detectRange maxRangeWidth | 20 | range_detection_max_width | MED |
| B72-2-RT-010 | 669 | entry-zone bottom-fraction | 0.25 | entry_zone_bottom_frac | HIGH |
| B72-2-RT-011 | 670 | entry-zone cap fraction of range | 0.4 | entry_zone_cap_frac | HIGH |
| B72-2-RT-012 | 676 | entry ATR premium | 0.1 | entry_atr_premium | HIGH |
| B72-2-RT-013 | 677 | stop ATR mult below range-low | 0.5 | stop_atr_below_low | HIGH |
| B72-2-RT-014 | 678 | target ATR offset below range-high | 0.25 | target_atr_below_high | HIGH |
| B72-2-RT-015 | 688 | base confidence | 0.72 | base_confidence | MED |

### §F.7 vwap_bounce (11 rows · `detectVWAPBounce` — strategy-engine.ts:719)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-VB-001 | 724 | param fallback `vwapProximity` | 1.5 (%) | vwap_proximity_pct | HIGH |
| B72-2-VB-002 | 725 | param fallback `minVWAPSlope` | 0.3 (%) | min_vwap_slope_pct | HIGH |
| B72-2-VB-003 | 726 | param fallback `volumeMultiplier` | 1.3 | volume_multiplier | MED |
| B72-2-VB-004 | 727 | param fallback `maxPullbackBars` | 5 | max_pullback_bars | MED |
| B72-2-VB-005 | 728 | param fallback `partialExitR` | 1.5 | partial_exit_r | MED |
| B72-2-VB-006 | 730 | min priceHistory length | 20 | min_history_bars | LOW |
| B72-2-VB-007 | 737 | vwap slope lookback | 10 | vwap_slope_lookback | MED |
| B72-2-VB-008 | 760 | entry premium multiplier | 1.001 | entry_premium_mult | HIGH |
| B72-2-VB-009 | 761 | stop multiplier (below VWAP) | 0.997 | stop_below_vwap_mult | HIGH |
| B72-2-VB-010 | 763 | target risk-multiple | 2 | target_r_multiple | HIGH |
| B72-2-VB-011 | 773 | base confidence | 0.73 | base_confidence | MED |

### §F.8 liquidity_trap (13 rows · `detectLiquidityTrap` — strategy-engine.ts:804)

> Operationally disabled (production dispatch blocks at `vts-runner.ts:449–452` and `signal-orchestrator.ts:1621–1627`). Reachable only via `stage-b-validator.ts:384`. Migration includes it so that re-enabling is purely a DB flip.

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-LT-001 | 808 | param fallback `maxTrapExtension` | 1.2 (%) | max_trap_extension_pct | HIGH |
| B72-2-LT-002 | 809 | param fallback `trapReturnBars` | 2 | trap_return_bars | MED |
| B72-2-LT-003 | 810 | param fallback `minStopZoneSize` | 'medium' | min_stop_zone_size | LOW |
| B72-2-LT-004 | 811 | param fallback `minLevelTouches` | 2 | min_level_touches | MED |
| B72-2-LT-005 | 812 | param fallback `volumeRatio` | 1.5 | volume_ratio | MED |
| B72-2-LT-006 | 814 | min priceHistory length | 30 | min_history_bars | LOW |
| B72-2-LT-007 | 817 | detectRange maxRangePct | 5 | range_detection_max_pct | MED |
| B72-2-LT-008 | 817 | detectRange minBars | 10 | range_detection_min_bars | MED |
| B72-2-LT-009 | 823 | stopZone lookback | 20 | stop_zone_lookback | MED |
| B72-2-LT-010 | 845 | entry multiplier (on return) | 0.999 | entry_on_return_mult | HIGH |
| B72-2-LT-011 | 846 | stop multiplier (above trap) | 1.005 | stop_above_trap_mult | HIGH |
| B72-2-LT-012 | 847 | target multiplier (range support) | 1.002 | target_range_low_mult | HIGH |
| B72-2-LT-013 | 857 | base confidence | 0.68 | base_confidence | MED |

### §F.9 dhma (24 rows · `detectDHMA` — strategy-engine.ts:1156)

| Lever ID | Line | Symbol/context | Value | Constant name | Risk |
|---|---|---|---|---|---|
| B72-2-DH-001 | 1161 | param fallback `theta_OBI` | 0.3 | theta_obi | HIGH |
| B72-2-DH-002 | 1162 | param fallback `epsilon_micro` | 0.2 | epsilon_micro | HIGH |
| B72-2-DH-003 | 1163 | param fallback `tau_toxicity` | 0.7 | tau_toxicity | HIGH |
| B72-2-DH-004 | 1164 | param fallback `maxSpread` | 5 | max_spread_ticks | HIGH |
| B72-2-DH-005 | 1165 | param fallback `k_tp` | 1.5 | k_tp | HIGH |
| B72-2-DH-006 | 1166 | param fallback `N_flow` | 50 | n_flow | MED |
| B72-2-DH-007 | 1167 | param fallback `N_burst` | 10 | n_burst | MED |
| B72-2-DH-008 | 1168 | param fallback `window_session` | 20 | window_session | MED |
| B72-2-DH-009 | 1182 | recent OBI lookback | 5 | obi_lookback_bars | MED |
| B72-2-DH-010 | 1205 | microprice tilt normalization | 10 | microprice_tilt_norm | MED |
| B72-2-DH-011 | 1227 | recent volatility lookback | 10 | recent_vol_lookback | MED |
| B72-2-DH-012 | 1242–1243 | burstReturn long/short threshold | ±0.01 | burst_return_threshold | HIGH |
| B72-2-DH-013 | 1256–1257 | sessionSlope up/down threshold | ±0.02 | session_slope_threshold | HIGH |
| B72-2-DH-014 | 1293 | signedFlowRatio long threshold | 0.2 | signed_flow_long_threshold | HIGH |
| B72-2-DH-015 | 1302 | signedFlowRatio short threshold | -0.2 | signed_flow_short_threshold | HIGH |
| B72-2-DH-016 | 1320 | entry premium multiplier | 1.001 | entry_premium_mult | HIGH |
| B72-2-DH-017 | 1325 | base confidence | 0.6 | base_confidence | MED |
| B72-2-DH-018 | 1326 | OBI confidence weight | 0.15 | confidence_weight_obi | MED |
| B72-2-DH-019 | 1327 | flow confidence weight | 0.1 | confidence_weight_flow | MED |
| B72-2-DH-020 | 1328 | toxicity confidence penalty | 0.15 | confidence_penalty_toxicity | MED |
| B72-2-DH-021 | 1329 | confidence floor / ceiling | 0.3 / 0.9 | confidence_floor / confidence_ceiling | MED |
| B72-2-DH-022 | 1338–1339 | MTF confidence adjustment ±0.10 | 0.10 | mtf_confidence_adjustment | MED |
| B72-2-DH-023 | 1341 | post-MTF confidence ceiling | 0.95 | post_mtf_confidence_ceiling | LOW |
| B72-2-DH-024 | 1344 | valid threshold | 0.5 | valid_confidence_threshold | HIGH |

---

## §G. Open questions for Langston

1. **`detectBullishReversal` helper (lines 1016–1031)** is shared between `vwap_pullback` and `mean_reversion`. Scope places its 2 literals under `strategy.vwap_pullback`. Acceptable, or split into `strategy.shared.bullish_reversal`?
2. **Module key for range_trade.** Canonical map says `range_trade`; emitted strategy field says `range_trading`. Module name = `strategy.range_trade` (matches canonical). Confirm.
3. **breakout.volumeMultiplier discrepancy** (vts=1.5, orchestrator=2.0). Recommendation: 1.5. Confirm.
4. **mean_reversion.deviationThreshold + range_trade triplet** (vts vs orchestrator). Recommendation: vts canonical. Confirm.
5. **String-enum levers** via `getCachedConstant<string>()` per B72 precedent. Confirm OK or prefer separate enum table.
6. **stage-b-validator relaxedMode literals.** Recommendation: keep hardcoded (test fixture, not operator-tunable).
7. **routes.ts admin diagnostic literals.** Recommendation: remove and read from module_constants.
8. **Total +129 rows.** Boot warmup time impact expected negligible; verify in Slice 1 deploy.

---

## §H. Verification plan

**Step 7 (CC first-pass, post-deploy):**
1. PM2 boot logs show `[B72][warmup]` lines for all 9 new modules with rows>0 (16/12/12/13/13/15/11/13/24).
2. `[B72][INIT_OK] (pre-orchestrator)` final line clean.
3. No `module ... not warm` errors in error.log.
4. `signal_eval_archive` last-1h shows admit counts >= prior-1h baseline for vwap_pullback, abcd_long, sma_trend_ride (no behavior regression — every literal-replacement value matches the seeded DB row exactly).
5. SQL `SELECT module_name, COUNT(*) FROM module_constants WHERE module_name LIKE 'strategy.%' GROUP BY 1` returns 18 rows (was 9).

**Step 8 (Langston second-pass):** independent verification of any of the above + spot-check that one HIGH-risk lever change (e.g. `strategy.vwap_pullback.entry_atr_premium` 0.10 → 0.15) propagates within 60s into the next signal evaluation cycle.

---

## §I. Governance corrections (Slice 6)

The B72.1 closure shipped the wrong "9 active strategies / no levers escaped audit" conclusion in:
- `LEVER_INVENTORY.md §13.1`
- `BATCH_72_COMPLETION_REPORT.md §K.3`
- `BATCH_CATALOG.md` Batch 72.1 row
- `PHASE_HISTORY.md` 2026-05-05 B72.1 entry
- `MEMORY.md` (truth + repo persistence)

These need correction as part of B72.2 closure. Also add a `CHANGES_AND_FIXES.md` entry documenting that B72 main shipped without covering the 9 in-class quant strategies (root-cause: the lever-inventory pass searched only `server/strategies/` filesystem and missed in-class methods).

---

*End of BATCH_72_2_SCOPE.md (Step 1/2 draft).*
