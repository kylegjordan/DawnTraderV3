# B.5 W2.0b — Detect-replay harness BUILT + parity RAN — the spike does NOT clear ≥99%; your call on the path

**Date:** 2026-06-06. Reporting Tier-1 parity BEFORE any sweep number, exactly as you required. The spike is built and runs clean; the parity gate is doing its job and is telling us the backward replay can't faithfully reproduce the live entry decisions. I want your architectural call before I either chase one more reconstruction fix or declare INCONCLUSIVE. **No gdrive — read this local inbox file; staging-only diagnostic, read-only, no writes, no deploy.**

## What I built
`scripts/b5-w20b-entry-replay.ts` (read-only, vwap_pullback spike). Per decision in `signal_eval_archive`: reconstruct the forming 15m series from `xstock_spot_ohlc_1m` up to `captured_at` (closed 1m bars only; look-ahead guard asserted, 0 violations across all runs) → call the REAL `getMarketContextEngine().computeContext(...)` → REAL `new StrategyEngine().detectVWAPPullback(...)` → compare to the archive. In-memory 1m reconstruction (b31a pattern; gentle on the live pool). Purity preconditions you asked for all held (computeVWAP rolling not session-anchored; scanPatterns pure; bucketing epoch-floor /900).

**Parity definition (refined during the build — flag for you):** the harness re-runs ONLY the detect fn, so it reproduces the **strategy_internal gate** (does the strategy FIRE), which IS the entry-trigger boundary the sweep perturbs. Tier-1 = harness-fired vs archive(`reject_stage != 'strategy_internal'`). The downstream sqe/rtb/tcl funnel is not re-run (not what W2.0b tunes). I think this is the right boundary — confirm you agree.

## The parity journey (5 runs, all the same gap)
| run | window | currentPrice source | TIER-1 |
|---|---|---|---|
| 1 | full (05-12→06-05) | 1m forming-close | **46–50%** |
| 2 | 15m-era only (06-05+) | 1m forming-close | **62%** |
| 3 | 15m-era + ticker `last` | ticker `last` | **57%** |

Target ≥99%. **In every run, ~100% of the misses are: archive FIRED, harness did NOT, and the harness rejects at the `price_position` gate.** Not boundary-aliasing (only ~12–18% near a 15m boundary). Tier-2 (reason within no-fire) ~93%.

## What I ruled IN and OUT
- **60m→15m straddle: REAL, partial.** Restricting to the pure 15m era (post-B.4) lifted parity 46→62% — pre-06-04 decisions were made on 60m bars, unreproducible by a 15m rebuild. So the study window can only ever be the 15m era forward. But it only explains ~16pp.
- **currentPrice (sub-minute): RULED OUT.** The ticker `last` (= the live `priceData.price`, retained 06-02→06-07) is *fresher* than my 1m close, yet feeding it did NOT help (62→57%). So the live-tick-vs-1m-close price is not the cause.
- **VWAP bar-COUNT: ruled out.** Live and harness both cap at ~240 bars (15m snapshot has 376 available by 06-05).
- **Remaining cause = the VWAP / bar-SET values.** Since `price_position` compares currentPrice to VWAP and currentPrice is now ruled out, the VWAP itself differs. The live engine fed `getOHLCDataBatch(15)` = the **`xstock_spot_ohlc_15m_snapshot` table + a narrow live overlay**, NOT a 1m rebuild. **The ~15-minute 1m persistence lag (you flagged this risk) is the likely mechanism:** when the live aggregator built each 15m snapshot bar in real time, the 1m rows for recent buckets had not yet been written (they land ~15 min late), so the live snapshot bars were built from incomplete data and differ from my now-complete 1m rebuild → different rolling VWAP → `price_position` flips.

## The two paths — your call
1. **Try one more reconstruction fix:** feed the harness the **15m snapshot bars** (`xstock_spot_ohlc_15m_snapshot`, the exact bars the live engine cached) instead of rebuilding from 1m. This should match the settled-bar VWAP much better. **Caveat:** the live *forming* bar came from the live overlay (live ticks) which the snapshot may not capture, so even this may cap below 99%. Cheap to test (one harness change + run).
2. **Declare Mode-A INCONCLUSIVE-by-data and pivot to FORWARD instrumentation.** This is structurally the same wall W2.0a's Mode-A hit: the live real-time inputs (the exact bar set + forming bar the engine saw at decision time) were never persisted, so no backward rebuild reproduces them to ≥99%. The faithful answer is to **persist the exact detect inputs going forward** (the `ohlcData` array + resolved constants on each archived decision) — a small Phase-19 instrumentation batch — then replay becomes exact. This mirrors the RI-a stop-anchor-persistence gap we already logged. It means W2.0b's entry-trigger sweep can't run trustworthy NOW, only after forward instrumentation accrues.

## My recommendation
Try path 1 once (it's cheap and might get us to a defensible parity for the settled-bar decisions), but I am **not optimistic it clears 99%** because of the forming-bar/overlay gap — and I will NOT run a sweep on sub-99% parity (same discipline as W2.0a Mode-A; a sweep on a 62%-faithful reconstruction is exactly the "edge is an approximation artifact" trap the harness exists to prevent). If path 1 doesn't clear it, I recommend we **log W2.0b as INCONCLUSIVE-by-backward-data, spec the forward-instrumentation as the Phase-19 item, and (per the original spine) treat entry-trigger calibration as gated on that instrumentation** — geometry was already keep-baseline, so the net is that xStock per-strategy calibration is largely **data-blocked until forward instrumentation**, which is itself a clean, honest result for Kyle.

**Your call: try the snapshot-bars fix, or go straight to INCONCLUSIVE + forward-instrument? And do you agree the strategy_internal gate is the right parity boundary?**
