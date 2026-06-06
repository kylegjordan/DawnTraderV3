# B.5 W2.0b — Gate-zero features-completeness probe — RESULTS (report BEFORE building Step C, per Langston Step-2 condition)

**Date:** 2026-06-06. Read-only probe (static detect-fn input enumeration + staging archive contents query). **For Langston — this is the probe table you asked for before any sweep infra. There's a structural finding that changes the harness viability framing; I want your read before I build.** INFRASTRUCTURE NOTE: this file is on your LOCAL inbox; do NOT touch the gdrive mount.

---

## 1. THE HEADLINE FINDING (changes the framing)

**`signal_eval_archive` does NOT store the detection inputs.** I queried the live xstock_spot rows (last 30d). The `features` JSONB top-level keys are entirely SCORING / post-decision metadata:
`decayPenalty, detailReason, hybridScore, macroModifier, patternType, pool, positionSize, predictiveConfidence, regimeWeight, schema_version, signalType, sourcePool`.
The `gate_decision` JSONB keys are the decision OUTCOME:
`accepted, finalScoreMin, gate, isPostSignalRejection, netEv, netEvFloor, reason, regimeWeightMin, schema_version`.

**There is NO indicators snapshot, NO OHLC snapshot, NO resolved-constants snapshot, NO pattern bounds (compressionRatio/parentHigh/parentLow/hasGap/recoveryRatio), NO range-detection bounds.** So your (a)/(b)/(c) bucketing collapses to a single answer for the detection inputs:

- **(a) carried-in-archive:** NONE of the load-bearing detection inputs. (Only scoring metadata, which the detect functions do not read.)
- **(b) recomputable via the engine's OWN code path:** ALL detection inputs, IF the harness recomputes them from the historical 15m bars using the engine's own compute functions — `market-context-engine` `calculateVWAP/calculateSMA/calculateATR/computeHigh24h/computeLow24h` (the same functions the live `computeContext()` used) for the indicator-driven strategies, and the REAL pattern recognizer (`scanPatterns`) for the pattern-driven ones. **NOT a reimplementation** — I invoke the production functions.
- **(c) not faithfully recomputable:** the RISK that determines whether (b) actually hits parity — see §3.

**This is structurally the W2.0a Mode-A situation one layer up:** the thing we need wasn't persisted, so we recompute it via real engine code, and the parity gate is the proof the recompute reproduces the live decision. If parity passes, we sweep; if not, INCONCLUSIVE-by-data. The whole batch's integrity rests on the parity gate — exactly as you framed it.

## 2. Per-strategy decision-row counts (last 30d, xstock_spot) — N floor + admit reality

| strategy | total decision rows | admitted | parity N≥200? |
|---|---|---|---|
| vwap_pullback | ~884k | 1,230 | YES |
| morning_star | ~4.40M | 778 | YES |
| sma_trend_ride | ~122k | 279 | YES |
| vwap_bounce | ~122k | 114 | YES |
| pivot_shift | ~1.04M | 109 | YES |
| range_trade | ~19.9k | 71 | YES |
| mean_reversion | ~60.8k | 4 | YES (rows) but admits too thin to tune |
| **breakout** | 122,245 | **0** | YES (rows) — zero admits |
| **inside_bar_reversal** | 1,087,588 | **0** | YES (rows) — zero admits |

All strategies clear the N≥200 decision-row floor easily. The parity gate (Tier-1 admit-vs-not binary) is computable for all. But the SWEEP is only meaningful where admits (or near-admits) exist — mean_reversion (4 admits) is effectively untunable; breakout/inside_bar have 0 admits (the RI-b case, §4).

## 3. The reconstruction RISK (category c) — the real question for you

Since nothing is archived, parity hinges entirely on whether the harness can recompute the EXACT decision context the live engine saw at each `captured_at`. The risks, in priority order:

1. **Forming-bar state (the big one).** B.3 regime audit + B3.1a established the live system decides on the IN-PROGRESS (forming) 15m bar, not the settled bar. To hit parity the harness must reconstruct the forming-bar OHLC as it stood at `captured_at` (1-min precision) — i.e. the partial 15m bucket built from 1m bars up to that minute, NOT the settled 15m bar. The `xstock_spot_ohlc_15m_snapshot` stores settled buckets; the forming state must be rebuilt from `xstock_spot_ohlc_1m` up to `captured_at`. This is feasible but it IS the fidelity crux — if I can't reproduce the forming bar, the indicator values drift and parity fails.
2. **As-of-time bar availability.** Does `xstock_spot_ohlc_1m` retain enough history back through the study window to rebuild every decision's lookback (vwap_pullback ~25 bars, breakout/range/mean ~50 bars)? 1m retention is ~limited (B.0 noted ~1-day ticker retention; the 1m OHLC archive is the B74 partition — need to confirm depth).
3. **Session-anchored VWAP.** vwap_bounce/vwap_pullback read `vwap`. If the live VWAP is session-anchored (intraday cumulative) rather than a rolling-window VWAP over the bar series, reproducing it needs the session anchor, not just the bars. Need to confirm which `calculateVWAP` does.
4. **Pattern recognizer determinism.** For morning_star/pivot_shift/inside_bar, invoking the real `scanPatterns` over the recomputed bars should be deterministic IF fed the same bars — so this reduces to risk (1)+(2). No separate reimplementation risk as long as I call the real recognizer.

**My proposal:** build the harness to recompute via engine code, but run the **Tier-1 parity gate as the FIRST output per strategy**, and report parity BEFORE any sweep — and if forming-bar reconstruction can't clear Tier-1 ≥99%, that strategy is INCONCLUSIVE-by-data and I say so (same honesty as W2.0a Mode-A). I will NOT force a sweep on a strategy that fails parity.

## 4. RI-b — breakout + inside_bar zero-fire reason distribution (7d, xstock_spot)

| strategy | terminal reason | n | share |
|---|---|---|---|
| **breakout** | range_not_found | 41,879 | 79% |
| | breakout_fail | 11,002 | 21% |
| **inside_bar_reversal** | breakout_fail | 247,882 | 54% |
| | no_pattern | 214,795 | 46% |

**This REVISED my prior hypothesis (good — the instrumentation did its job):**
- **breakout** is range_not_found-dominant (79%) — but it DOES find ranges 21% of the time and then the breakout doesn't confirm. range_not_found is governed by `range_detection_max_width` / `min_boundary_touches` / `touch_tolerance_atr_divisor` — entry-trigger knobs that could be crypto-tuned-too-tight for xStock's wider 15m bars. **Not pure true-no-setup → a legitimate sweep candidate** (does loosening range detection admit tradeable setups?).
- **inside_bar_reversal** is breakout_fail-dominant (54%), NOT no_pattern as I'd predicted. The INSIDE_BAR pattern IS detected ~54% of the time; the post-pattern breakout confirmation (price beyond parent ± buffer) never triggers. That's the `breakout_buffer` / confirmation knob — an entry-trigger knob. **Also a sweep candidate**, not pure true-no-setup.

So per your Q4 branch rule: both land in "placeholder/gating-knob" territory rather than "true-no-setup" — i.e. they're sweep candidates (subject to the parity gate + the no-loosen-until-it-fires discipline: I sweep the real gate within a sane range, I do NOT search for any-threshold-that-admits-something). The granularity question (do these patterns need 5m/1m on xStock) stays Kyle's call only if a sane-range sweep still yields nothing.

## 5. Questions for you before I build the harness

1. **Given NOTHING is archived** (everything is recompute-via-engine-code), are you comfortable proceeding on the parity-gate-proves-the-recompute basis — or do you want a smaller scoped first cut: build the forming-bar reconstruction + Tier-1 parity for ONE well-populated strategy (vwap_pullback, 1,230 admits) as a feasibility spike, prove parity clears ≥99%, and only then generalize to the rest? My lean: the spike-first approach — it de-risks the forming-bar reconstruction before I invest in all 9.
2. **Forming-bar reconstruction:** agree the harness must rebuild the partial 15m bucket from 1m up to `captured_at` (not use the settled snapshot)? Any fidelity concern you'd add?
3. **1m retention depth** — if `xstock_spot_ohlc_1m` doesn't reach back across the full B3.1a-comparable window, the primary window may have to be whatever 1m depth supports. Acceptable, or do you want me to confirm depth first and report it?
4. **RI-b:** agree breakout + inside_bar are sweep candidates (gating-knob, not true-no-setup), swept within a sane range only?

**On your answers I build — spike-first on vwap_pullback if you agree — and report Tier-1 parity before any sweep number.**
