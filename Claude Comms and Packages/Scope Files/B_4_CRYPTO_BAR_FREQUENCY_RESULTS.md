# B.4-CRYPTO bar-frequency — exploratory results (read-only)

> **Kyle directive 2026-06-03 (exploratory, "just to see what it says"):** mirror the xStock W1 bar-frequency study against crypto, change nothing, decide nothing — generate a head-start data point for the post-Phase-24 crypto re-validation arc.
>
> **Method:** identical engine to `scripts/b4-bar-frequency-study.ts`, retargeted at `crypto_spot_ohlc_1m`. 24/7 (no session boundaries, no opening-range / weekend-gap segmentation). Forward-EXCESS-return AUC, de-meaned vs the cross-sectional crypto-spot universe, clock-anchored 2h horizon. Engine: `scripts/b4-crypto-bar-frequency-study.ts`. Source: `crypto_spot_ohlc_1m` (Kraken). 7 live days; 802,012 1m bars; 562 symbols. **No `crypto_perp_ohlc_1m` archive exists**, so this is spot-only (perp can't be studied with this method until/unless a 1m perp archive is added).

---

## §0 — Headline / recommendation

**No data signal to change the crypto bar size. STAY at 60m for now.** Revisit only inside the post-Phase-24 crypto re-validation arc (Phase 24 close → before AMR), and only if strategy-fit work then surfaces a bar-size-shaped problem the way it did for xStocks.

Three reasons:

1. **Edge is weak-to-inverted at every bar size.** No frequency clears AUC ≥ 0.55 on patterns or generic setups; several setups land slightly *below* 0.50 (i.e., present underperforms vs the universe). No frequency "unlocks" an edge that another suppresses.
2. **The structural argument that drove the xStock 15m recommendation doesn't push the same way here.** xStock's 60m → 15m case rested on (a) coarser-bar regime *stability* being mostly an artifact of bar-count lookbacks, and (b) a clean structural payoff (2 → 8 bars per 2h hold). For crypto the regime-flip rate is roughly flat across F (38.8% → 42.7%, only ~4pp) — bar size is doing much less work, the artifact framing applies the same way but the payoff for paying its cost is smaller.
3. **The same "interval change = foundation change" caveat applies to crypto.** Crypto's regime classifier shares the same hard-coded 30-bar momentum / 14-bar ADX lookbacks and bar-count windows as xStock (`market-regime.ts:108-119` says this invariant breaks at non-60m), and crypto regime thresholds are calibrated to 60m per-bar return scale. Switching frequencies would require the same paired regime-threshold recalibration + time-anchored lookbacks + DBS backfill recompute the xStock B.4 foundation sub-batch is going to do. We should not pay that cost without a clear payoff, and the data here doesn't show one.

---

## §1 — Pattern availability + edge per frequency

| F (min) | F-bars  | MORNING_STAR rate | MS-AUC (2h) | INSIDE_BAR rate | IB-AUC (2h) | regime-flip% | bars/2h-hold |
|---------|---------|-------------------|-------------|-----------------|-------------|--------------|--------------|
| 5       | 353,518 | 2.045%            | 0.495       | 35.94%          | 0.496       | 42.69%       | 24 |
| 15      | 171,659 | 2.324%            | 0.487       | 30.36%          | 0.500       | 41.50%       | 8  |
| 30      | 101,032 | 2.439%            | 0.467       | 28.03%          | 0.513       | 40.73%       | 4  |
| 60      | 55,995  | 2.609%            | 0.502       | 26.36%          | 0.522       | 38.79%       | 2  |

Excess-return detail:
- MORNING_STAR present vs absent: 5m −0.099% / −0.007%; 15m +0.144% / −0.012%; 30m −0.221% / +0.005%; 60m +0.108% / −0.003%. Sign flips across F — no consistent direction; absolute magnitudes ≤0.22% are within 7-day noise; combined with low-N (216–1,771 present cases) the AUC numbers are not decision-grade.
- INSIDE_BAR present vs absent: 5m −0.112% / +0.068%; 15m −0.095% / +0.036%; 30m +0.001% / −0.003%; 60m +0.043% / −0.014%. IB is INVERTED-to-flat at finer F, mildly positive only at 60m, AUC 0.522. Same story as xStock W1: IB is common but not predictive at any size.
- MS base rate **rises coarser** (2.0% → 2.6%); IB base rate **rises finer** (26% → 36%). No clean availability winner.

## §2 — Generic non-pattern setup edge per frequency

| F (min) | momentum-up AUC | uptrend > SMA20 AUC | pullback-in-uptrend AUC |
|---------|------------------|---------------------|--------------------------|
| 5       | 0.486            | 0.473               | 0.478                    |
| 15      | 0.477            | 0.475               | 0.494                    |
| 30      | 0.480            | 0.477               | 0.493                    |
| 60      | 0.483            | 0.490               | 0.509                    |

- All three setups are **at or below 0.50** at every bar size — momentum-up and uptrend>SMA20 do NOT predict crypto forward-excess in this window; pullback-in-uptrend only reaches 0.509 at 60m (within noise).
- **Trend setups marginally improve coarser** (uptrend AUC 0.473 → 0.490; pullback 0.478 → 0.509). The gradient is small (<0.04 across the entire 5m→60m range), but it goes the wrong way for a finer-bar argument: if anything, the data favors staying at 60m or going coarser, not finer.
- This is a notable contrast with xStock W1, where the same uptrend AUC went 0.509 → 0.537 (positive everywhere). For crypto, trend-style setups are weaker than xStock at every F, across the board.

## §3 — Comparing crypto to xStock (head-start observation, not a decision input)

| Metric (at 60m baseline) | Crypto (this study)        | xStock (W1)                |
|---|---|---|
| MORNING_STAR rate                 | 2.609% | 2.73% (≈same) |
| MS-AUC                            | 0.502  | 0.523         |
| INSIDE_BAR rate                   | 26.36% | 40.0%         |
| IB-AUC                            | 0.522  | 0.500         |
| momentum-up AUC                   | 0.483  | 0.506         |
| uptrend>SMA20 AUC                 | 0.490  | 0.537         |
| pullback-in-uptrend AUC           | 0.509  | 0.528         |
| regime-flip% (5m → 60m range)     | 38.8–42.7% | 34.4–40.7% |

- Crypto's setup-edge curve sits **below** xStock at every comparable bar size. The shape (trend-edge slightly rising coarser) is similar, but the level is lower.
- Crypto's regime read is **less sensitive to bar size** than xStock — the 5m→60m flip-rate delta is ~4pp for crypto vs ~6pp for xStock. So the "switching to finer makes the read jumpier" cost is smaller for crypto, but so is any "the artifact is masking real stability" upside.
- This is consistent with Kyle's directive note (the crypto re-validation): the strategy signal / indicator / pattern settings were likely **never empirically calibrated for crypto either**, inherited from pre-crypto-data strategy design. The absence of a clear bar-size winner here means bar-frequency is probably NOT the dominant lever — the strategy-fit / threshold work will be.

## §4 — Method caveats

- Edge = forward EXCESS return (de-meaned vs the cross-sectional crypto-spot universe at the same decision minute), 2h clock-anchored, AUC primary. 7 live days. Generic setups (momentum / uptrend / pullback) are proxies for the trend strategies, not the strategies themselves.
- Regime-flip% uses the same lightweight ATR-normalized 3-bar directional proxy as xStock W1 — directionally valid for comparing flip-rate across F, **not** the production regime classifier. Crypto's production regime classifier shares the same bar-count lookbacks but uses **different threshold constants** (crypto and xStock thresholds are independent in `regime-thresholds.ts`).
- **The bar-count-lookback artifact applies identically to crypto.** If crypto ever switched off 60m, the 30-bar momentum / 14-bar ADX / SMA-20 / ATR-14 / slice(-24) windows would compress in wall-clock, the regime mix would shift silently, and the regime thresholds would need to be re-derived just like the xStock B.4 plan calls for. Same foundation-change burden.
- **Spot-only.** No `crypto_perp_ohlc_1m` archive exists. If a perp 1m archive is added later, this engine retargets trivially; perp may behave differently because of funding-rate dynamics and the deeper liquidity stack on Kraken Futures.
- Active trading OFF. This is a forward-return-proxy diagnostic, not a live-trading test.

## §5 — Does the "interval change = foundation change" caveat apply to crypto?

**Yes, with the same severity.** Switching crypto's bar size would require all of:

1. Crypto regime-threshold recalibration (the crypto rows in `regime-thresholds.ts` are 60m-calibrated).
2. Per-class time-anchored lookbacks (the shared hard-coded 30-bar momentum / 14-bar ADX / SMA-20 / ATR-14 / slice(-24) windows currently span 30 hours, 14 hours, etc. at 60m — at 15m they would span 7.5h, 3.5h, 5h, 6h — semantics shift silently).
3. A DBS backfill recompute at the new interval (split-brain training data if not).
4. A regime-label parity report old-vs-new (Langston's xStock binding addition #1 applies identically here).
5. Aggregator interval typing + a new crypto 15m (or whichever) snapshot path.
6. Per-strategy crypto signal re-tuning at the new bar size.

Same gates, same risks. So the "no signal to motivate a switch" finding in §0 also means "no data justification to incur the foundation-change cost."

## §6 — Disposition / recommendation

- **STAY at 60m for crypto. No B.4-CRYPTO sub-batch.** Park this evidence; the post-Phase-24 crypto re-validation arc inherits it as the bar-frequency baseline (similar to how xStock B.0 was a read-only baseline).
- **If, during the post-Phase-24 crypto re-validation, the strategy-fit / threshold work surfaces a bar-size-shaped problem** (e.g., a strategy whose entry trigger can't time inside 2 bars), revisit with a focused study at that point. The current data does not point at one.
- **Do NOT consume this in any live config decision.** Per Kyle's framing, the goal is "trade as best as possible and as profitably as possible within risk limits" — and a 7-day study showing no decision-grade edge at any frequency is not grounds for a foundation change.
- Engine is committable to the repo for re-runs (no DB writes, parameterized window) — `scripts/b4-crypto-bar-frequency-study.ts`. Currently scp'd to staging only (not pushed to GitHub) per Kyle's "do not push" directive on this exploratory run.

---

*Exploratory companion to `B_4_BAR_FREQUENCY_RESULTS_REPORT.md` (xStock W1). 7 live days, crypto_spot only, 24/7 window. Read-only. No code change; no governance change; no roadmap change. Stamped 2026-06-03.*
