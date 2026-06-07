# B.5 W2.0b — Entry-trigger / admission sweep — CONCLUSION: INCONCLUSIVE-by-backward-data; forward decision-provenance instrumentation specced

**Date:** 2026-06-06. Read-only study; nothing deployed; active trading OFF. Langston Step-2 gate + parity-findings call both signed off; this records the conclusion + the forward fix.

## TL;DR
W2.0b set out to sweep each xStock strategy's **entry-trigger** thresholds via a detect-replay harness, behind a hard parity gate (the replay must reproduce the live system's fire/no-fire decision to ≥99% before any swept number is trusted). **The harness was built and runs correctly, but it cannot clear the parity gate on historical data** — the live system's exact decision-time inputs were never persisted, and no backward rebuild reproduces them to ≥99%. **W2.0b is INCONCLUSIVE-by-backward-data.** Combined with W2.0a (geometry = keep-baseline), **xStock per-strategy calibration is data-blocked** until a one-time, general **decision-provenance instrumentation** lands and accrues a few weeks of forward data.

## What was built
`scripts/b5-w20b-entry-replay.ts` (read-only). Per archived decision in `signal_eval_archive`: reconstruct the 15m bar context as of `captured_at` → call the REAL `marketContextEngine.computeContext(...)` → REAL `StrategyEngine.detectVWAPPullback(...)` → compare the replay's fire/no-fire to the archived `reject_stage`. Look-ahead guard asserted (0 violations every run). Parity boundary = the **strategy_internal gate** (does the strategy fire) — the exact boundary the entry-trigger sweep would move (Langston-confirmed). Spike target: vwap_pullback (1,230 admits, the most-populated strategy).

## The parity evidence (the gate did its job)
| run | settled bars | currentPrice | window | TIER-1 fired/no-fire |
|---|---|---|---|---|
| 1 | 1m rebuild | 1m close | full (05-12→06-05) | 46–50% |
| 2 | 1m rebuild | 1m close | 15m era (06-05) | 62% |
| 3 | 1m rebuild | ticker `last` | 15m era | 57% |
| 4 | **live 15m snapshot** | 1m close | 15m era | **80%** |

Target ≥99%. Diagnosis, step by step:
- **60m→15m bar-switch straddle** (B.4, 06-04): pre-06-04 decisions used 60m bars, unreproducible by a 15m rebuild. Restricting to the 15m era: 46→62%.
- **currentPrice RULED OUT:** the live ticker `last` (= `priceData.price`) is fresher than the 1m close, yet did not help (62→57%).
- **Settled-bar VWAP CONFIRMED as the major contributor:** feeding the engine's actual cached `xstock_spot_ohlc_15m_snapshot` settled bars (instead of a 1m rebuild) lifted parity 62→**80%**. This is the hard-diagnosed proof — the live snapshot bars differ from a now-complete 1m rebuild because the **~15-minute 1m persistence lag** meant the live real-time aggregator built each 15m bar from incomplete 1m data.
- **Residual ~20% = the FORMING bar (irreducible):** at 80%, the misses became two-directional (119 vs 92, vs the prior ~100% one-directional) — i.e. noise consistent with the in-progress forming bar, which the live engine built from a live tick overlay that was **never persisted**. Per the pre-committed stop (Langston), we do NOT chase this further (reconstructing an un-persisted input is the patch trap, §8 #11). Proving the forming bar is the irreducible gap **is** the result.
- **Constants confound CLOSED:** the `price_position` gate constants (`bullish_reversal_near_vwap_atr`=2.0, `bullish_reversal_above_low_atr`=0.5, pullback 3%) were last updated 2026-05-05 — stable through the 06-05 decision window and now. "The gate moved under us" is ruled out, leaving the bar-set/forming-bar gap as the sole cause.

## Why this is the third time at this wall
This is the **same root cause** as two prior studies: **W2.0a Mode-A** (geometry anchors not persisted → pivoted to Mode-B) and **RUNNING_ISSUES RI-a / stop-anchor-persistence gap**. Three studies, one missing layer: **the engine's exact decision-time inputs are not persisted**, so no backward replay reproduces them faithfully. That is a structural gap, not three coincidences.

## The forward fix (general, NOT a vwap_pullback patch) — Langston-directed
Spec a one-time **decision-provenance capture on `signal_eval_archive`**: every archived decision records the exact `ohlcData` array the engine evaluated (settled bars **and** the forming bar) plus the resolved `module_constants` it used, as of decision time. Done once at the archive layer, **every future parity / calibration study — every strategy, every asset class — becomes exact-replayable.** This is the NO-PATCHES move: solve the class, not the instance. Open design question (settle at spec, do not balloon scope): storage (240 bars × OHLCV/decision isn't free) — hash-and-reference against a canonical bar store, or persist forming-bar + bar-set-ids. Logged as RUNNING_ISSUES #206 + a Phase-19 instrumentation item.

## Consequence for the B.5 calibration arc
- **W2.1 (hold-time ms):** CLOSED (correctness fix).
- **W2.0a (geometry):** CLOSED — keep-baseline, no generalizing edge (only a thin vwap_bounce pre-register candidate).
- **W2.0b (entry trigger):** INCONCLUSIVE-by-backward-data → **data-blocked** pending the decision-provenance instrument.
- **W2.2 (per-strategy re-fit) + W3 (ORB):** downstream of W2.0b's entry evidence → also data-blocked for the entry-trigger dimension.
- **Net:** xStock per-strategy calibration is **largely data-blocked** until forward decision-provenance accrues. Geometry was already keep-baseline, so the honest summary is: *the levers we could test backward (geometry) showed no edge; the lever where the edge would be (entry-trigger / selectivity) can't be tested faithfully on past data — here is the one-time instrumentation that unblocks all future calibration.* That is a cleaner, more honest result than a sweep run on a 62–80%-faithful reconstruction would ever have been.

## Method captured for onboarding
The two-tier parity gate + "report parity before any sweep number" + "if it can't clear the bar, declare INCONCLUSIVE rather than force a result" is the standard discipline for any future replay-based calibration. To be folded into ASSET_CLASS_ONBOARDING_WORKFLOW as part of the B.5 governance.
