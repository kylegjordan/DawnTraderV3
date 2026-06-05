# Hidden-Contextual-Edge Study — Admitted-Arm Findings (S2–S5)

> **Status:** S2–S5 complete on the admitted (VTS-taken) trades. Engine: `scripts/hce/hce_study.py` (re-runnable, stdlib). Data: 22,810 VTS closed trades 2026-01→06-05; 25 units-bug trades excluded; crypto 20,515 / xStock 2,295 (never pooled). Outcome = realized net-of-friction `netProfit` (Gate (a) verified). **This is the WITHIN-ADMITTED descriptive layer — NOT selection-controlled** (admitted = trades that already passed SQE; see Langston D3). The causal layer is the rejected arm (next phase).
> Author: Claude Code (overnight autonomous, 2026-06-05). Reviewer: Langston.

## Headline (plain)

Across every strategy, **no robust, generalizable contextual condition lifts a losing strategy to net-positive within the trades the system actually took.** Each strategy stays net-negative even when sliced by its most-favorable regime / directional-bias / confidence / phase, and a strategy's winners and losers look almost identical on the logged context. The two apparent exceptions are both verified artifacts. The practical implication: context-gating the strategies *as currently admitted* will not manufacture a win-rate or expectancy lift — the existing gates have already homogenized the survivor population. The leverage is in the **admission boundary** (which trades to admit vs reject), which is the rejected-arm analysis + Phase 25 calibration.

## S2 — headline grid (units-bug-excluded)

| class | N | win% | mean net% | PF |
|---|---|---|---|---|
| crypto_spot | 20,511 | 34.4 | −0.89 | 0.55 |
| xstock_spot | 2,274 | 28.2 | −0.64 | 0.55 |

Both classes net-negative on average (the VTS baseline — VTS deliberately generates many losing virtual trades for learning). Best win-rate regime: crypto STRUCTURAL_TRANSITION 44.1% (still −0.90% net). No regime or strategy is net-positive standalone except the artifacts below.

## S3 — context does not separate winners from losers (within admitted)

- **Directional bias has no standalone predictive power within admitted:** AUC(DBS→win) = 0.499 crypto / 0.514 xStock; AUC(global DBS→win) = 0.466 / 0.481. Essentially coin-flip.
- **continuation vs reversal:** crypto continuation −1.04% vs reversal −1.33% (both negative; no flip to positive). xStock continuation −0.68% vs reversal −0.62%.
- **Winner-vs-loser profiles are near-identical.** Example (crypto strong_bull_trend): winners cont%=100 / DBS +0.50 / conf 0.26 vs losers cont%=100 / DBS +0.52 / conf 0.29. The contextual features we log do not discriminate the outcome.
- Mild, non-decisive tilts: HYBRID signals beat QUANT (crypto 39.2% vs 31.4% win); higher confidence band marginally better. Neither flips a strategy positive.

> **Why context doesn't separate here (the key interpretation):** the admitted population is conditioned on having passed SQE/EV gating, which already removed the contextually-poor setups. Within survivors, little exploitable context remains. This is consistent with the pattern-study precedent (which found a continuation+high-vol edge) being measured on **raw detections**, not the admitted subset. So the within-admitted null does not contradict a pre-gate edge — it points to it living in the admitted-vs-rejected difference.

## S4 — best-gate hunt: the only net-positive gates are artifacts

The FDR-significant net-positive gates were all `volatility_edge` and `liquidity_trap`+range-bound. Both fail generalization:

**`volatility_edge` (crypto, N=212, 92% win, +3.54%) — DOCUMENTED NEGATIVE FINDING (artifact).**
- Lived entirely in **Mar (+3.3%) + Apr (+4.3%)**; **collapsed in May to −1.1% / 36% win** (most recent month with data).
- A two-month momentum episode concentrated in alt names (FET/RENDER/ALGO). Older-sim path. Will not generalize; do NOT treat as an edge.

**`liquidity_trap` + global RANGE_BOUND regime (N=120, 97.5% win, +0.78%) — NON-GENERALIZABLE.**
- **PAXG/USD = 63 of 120 (52%)** — PAX *Gold*, an ultra-low-volatility gold-pegged token that mean-reverts structurally. Mar–Apr only; no recent data; +0.78% expectancy is barely above friction.
- This is "liquidity_trap scalped one gold token in a calm window," not a strategy-level contextual edge. Note as a narrow instrument-specific observation.

**Worst contexts (consistent, to avoid):** pivot_shift in STRUCTURAL_TRANSITION (−2.24%), strong_bull_trend in IMPULSE_EXPANSION (−1.74% to −5.0% when stacked), mean_reversion in BEAR_VOLATILE (−1.83%), reverse_impulse in IMPULSE_EXPANSION (−3.18%).

## S5 — robustness

`volatility_edge` and the `liquidity_trap`+PAXG cluster both fail the generalization bar (temporal collapse / single-instrument). For the broad strategies, split-half temporal tests show **stable losers** (sign holds across halves) — i.e. the negative expectancy is consistent, not noise. Note: continuation/DBS-based robustness on crypto is limited because those fields exist only May+ while crypto volume is Jan–Apr; this is addressed by the OHLC raw-feature recompute (next phase).

## Caveats (honest scope of this null result)

1. **Logged-feature scope.** This tested the context features present in the trade logs (regime, global regime, DBS score, continuation, confidence, phase, signalType, pool). It did NOT yet test **raw OHLC-derived features** (realized vol / ATR%, trend-strength, distance-from-high, momentum, time-of-day) — exactly the features that carried the pattern-study edge. Those require recomputing market state from 1-min OHLC as-of each entry (OHLC available Apr+). **This is the immediate next build** and tests the plan §1a calibration-robust raw-feature hypothesis on the admitted arm.
2. **Within-admitted, not causal.** Per Langston D3, every number here is conditional on SQE survival. The rejected arm (`net_ev_rejected`, scoped per Langston Q4) is what makes the study causal.
3. **VTS-derived.** All outcomes are VTS-simulated fills; re-validate at Phase 19 before anything gates live.
4. **Deep-context tier is May–June** (~6.3k); older backbone uses regime/strategy/confidence only.

## Next phases

- **P1 — OHLC raw-feature context engine (`hce_ohlc_context.py`):** for each Apr–Jun trade, recompute raw realized-vol / trend-strength / continuation-from-raw-price / distance-from-high as-of entry; re-run S3/S4 on these absolute-binned raw features (calibration-robust). Doubles as the Gate (c) reconstruction infrastructure.
- **P2 — Gate (c) validation:** blind-reconstruct a sample of admitted trades (known `netProfit`) from `originalStopPrice` + OHLC; confirm the modeled managed-exit tracks observed within tolerance.
- **P3 — Rejected arm (`net_ev_rejected`, 5,068; May–Jun):** if Gate (c) validates, reconstruct rejected-signal outcomes and compare admitted vs rejected on the matched window — the causal selection-bias layer.
- **P4 — S6 productionization + governance.**

*Run: `python3 scripts/hce/hce_study.py --logs-dir <vts-logs> --xstock-universe <dump> --min-cell 50 --section all`*
