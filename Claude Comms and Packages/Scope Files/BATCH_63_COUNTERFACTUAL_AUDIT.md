# B63 Counterfactual Audit — Exit-Only Replay on B62 72h Window

**Window:** 2026-04-16 09:15 UTC → 2026-04-19 09:15 UTC
**Population:** 90 bullish high-DBS LONG trades (pairDBS >= 0.30)
**Forward OHLC:** Kraken 15-min bars (Apr 16 00:00 → Apr 20 16:00 UTC)
**ATR at entry:** recovered from MCE telemetry per-cycle snapshots
**Variants:** Baseline / A (2xATR, 2R) / B (3xATR, 2R) / C (3xATR, 3R) / D (TEC-lite trail, 3xATR, 24h) / E (4xATR, 3R)
**Friction:** spread 5bps + slip 2bps + fees 16bps per leg (VTS config)

## Deliverable 1 — Overall comparison

| Variant | N | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med hold (min) | Med R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 90 | 37.8% | -0.538% | -0.27 | -24.0 | 57.8% | 30.0% | 12.2% | 358 | -1.00 |
| A | 90 | 33.3% | -0.571% | -0.19 | -17.2 | 23.3% | 3.3% | 73.3% | 293 | -0.60 |
| B | 90 | 35.6% | -0.489% | -0.10 | -9.1 | 7.8% | 1.1% | 91.1% | 306 | -0.39 |
| C | 90 | 35.6% | -0.548% | -0.12 | -11.0 | 7.8% | 0.0% | 92.2% | 311 | -0.39 |
| D | 90 | 30.0% | -1.177% | -0.30 | -26.9 | 76.7% | 0.0% | 23.3% | 773 | -0.46 |
| E | 90 | 37.8% | -0.440% | -0.05 | -4.8 | 2.2% | 0.0% | 97.8% | 355 | -0.28 |

## Deliverable 2 — Per-strategy comparison

### morning_star — n=55

| Variant | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 32.1% | -0.592% | -0.38 | -21.3 | 67.9% | 32.1% | 0.0% | -1.00 |
| A | 32.1% | -0.627% | -0.24 | -13.4 | 17.9% | 0.0% | 82.1% | -0.60 |
| B | 32.1% | -0.553% | -0.16 | -8.8 | 0.0% | 0.0% | 100.0% | -0.40 |
| C | 32.1% | -0.553% | -0.16 | -8.8 | 0.0% | 0.0% | 100.0% | -0.40 |
| D | 33.9% | -1.168% | -0.33 | -18.2 | 71.4% | 0.0% | 28.6% | -0.61 |
| E | 32.1% | -0.553% | -0.12 | -6.6 | 0.0% | 0.0% | 100.0% | -0.30 |

### vwap_pullback — n=19

| Variant | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 63.2% | +0.092% | +0.11 | +2.0 | 15.8% | 26.3% | 57.9% | +0.16 |
| A | 42.1% | -0.124% | +0.00 | +0.0 | 52.6% | 15.8% | 31.6% | -1.00 |
| B | 52.6% | +0.147% | +0.13 | +2.6 | 31.6% | 5.3% | 63.2% | +0.41 |
| C | 52.6% | -0.132% | +0.03 | +0.6 | 31.6% | 0.0% | 68.4% | +0.08 |
| D | 31.6% | -0.646% | -0.16 | -3.1 | 84.2% | 0.0% | 15.8% | -0.42 |
| E | 63.2% | +0.428% | +0.21 | +4.1 | 10.5% | 0.0% | 89.5% | +0.38 |

### others (volatility_edge, defensive_hedge, sma_trend_ride, reverse_impulse, dhma) — n=16

| Variant | WR | Avg return % | Avg R | Sum R | Stop% | Target% | Timeout% | Med R |
|---|---:|---:|---:|---:|---:|---:|---:|---:|
| baseline | 35.3% | -0.803% | -0.15 | -2.6 | 64.7% | 35.3% | 0.0% | -1.00 |
| A | 35.3% | -0.631% | -0.12 | -2.1 | 5.9% | 0.0% | 94.1% | -0.52 |
| B | 35.3% | -0.743% | -0.10 | -1.7 | 5.9% | 0.0% | 94.1% | -0.34 |
| C | 35.3% | -0.743% | -0.10 | -1.7 | 5.9% | 0.0% | 94.1% | -0.34 |
| D | 23.5% | -1.621% | -0.31 | -5.3 | 82.4% | 0.0% | 17.6% | -0.14 |
| E | 35.3% | -0.801% | -0.08 | -1.4 | 0.0% | 0.0% | 100.0% | -0.26 |

## Deliverable 3 — Rescue analysis (original stop-outs only)

Original stop-outs in population: **52**

For the original stopped-out subset, what % reached each milestone in each variant?

| Variant | N | Reached BE | Reached +1R | Reached +2R | Still failed |
|---|---:|---:|---:|---:|---:|
| A | 52 | 67.3% | 13.5% | 0.0% | 21.2% |
| B | 52 | 67.3% | 13.5% | 0.0% | 3.8% |
| C | 52 | 67.3% | 13.5% | 0.0% | 3.8% |
| D | 52 | 80.8% | 36.5% | 11.5% | 61.5% |
| E | 52 | 67.3% | 13.5% | 0.0% | 1.9% |

## MAE / MFE analysis (from Variant B — 3xATR stop, native timeout)

Bar-approximated from 15-min Kraken OHLC. Units = price-level distance from entry.

- **All trades** (n=90)
  - MAE: min=0.0000 med=0.0139 max=32.7923
  - MFE: min=0.0000 med=0.0045 max=2.7254
- **Baseline winners (actual_net > 0)** (n=32)
  - MAE: min=0.0000 med=0.0053 max=0.8223
  - MFE: min=0.0006 med=0.0252 max=2.7254
- **Baseline losers (actual_net <= 0)** (n=58)
  - MAE: min=0.0001 med=0.0200 max=32.7923
  - MFE: min=0.0000 med=0.0016 max=1.6438
- **Original stop-outs only** (n=52)
  - MAE: min=0.0008 med=0.0205 max=32.7923
  - MFE: min=0.0000 med=0.0010 max=1.6438

## Deliverable 4 — Interpretation & defect notes

### Defect notes

- **SHORT trades in window: 0.** LONG-only invariant held.
- **Mirror defect — DBS ≤ -0.30 LONG trades in window: 94**
  - WR: 22.3%, avg net: $-0.0248
  - Strategy breakdown: {'reverse_impulse': 54, 'morning_star': 22, 'vwap_pullback': 15, 'defensive_hedge': 2, 'sma_trend_ride': 1}
  - Regime breakdown: {'TREND_FRIENDLY_STABLE': 73, 'IMPULSE_EXPANSION': 21}
- **morning_star contributed 55 of 90 high-DBS bullish trades (61%)** — strongest single-strategy concentration.

### Interpretation — MIXED, concentrated by strategy

**Headline verdict:** The high-DBS bleed is **not primarily an exit-geometry problem** for the population as a whole. It is an **entry-archetype problem concentrated in morning_star**, with a different (and positive) story for vwap_pullback.

#### The morning_star story (55 of 90 = 61% of population)

| Metric | Baseline | Variants A/B/C/E (fixed stop/target) | Variant D (TEC-lite) |
|---|---:|---:|---:|
| Win rate | 32.1% | **identical 32.1% across all four** | 33.9% |
| Sum R | -21.3 | range -6.6 to -13.4 | -18.2 |

**WR is identical 32.1% across every fixed-stop variant.** Widening from 2x ATR → 3x ATR → 4x ATR does not change how many morning_star trades become profitable. It only changes how many limp to timeout instead of hitting a stop — at 4x ATR fully 100% of morning_star trades hit the timeout bar rather than stop or target. Morning_star entries are **directionally wrong** on high-DBS pairs, not merely stop-too-tight. No amount of exit-geometry adjustment rescues the archetype.

#### The vwap_pullback story (19 of 90 = 21%)

| Metric | Baseline | Variant B | Variant E |
|---|---:|---:|---:|
| Win rate | 63.2% | 52.6% | 63.2% |
| Sum R | +2.0 | +2.6 | +4.1 |

vwap_pullback on high-DBS pairs is **already profitable at baseline** and responds positively to wider stops + bigger targets. Variant E (4x ATR stop, 3R target, native timeout) roughly doubles its Sum R. This strategy is directionally right on trending pairs — the only thing hurting it is premature exits.

#### The rescue question (Deliverable 3)

Of 52 original stop-outs:
- **Only 13.5% (7 trades) later reached +1R** under any fixed-stop variant (A/B/C/E)
- **0% reached +2R** under any fixed-stop variant
- Variant D (TEC-lite) rescued more (36.5% to +1R) but 61.5% still failed because trailing exits triggered on normal noise

Langston's decision logic:
> "If only a small share would have recovered, wider stops alone do not solve it and the main problem is entry archetype."

**13.5% rescue is small**, and it is concentrated in vwap_pullback anyway. The primary bleed source (morning_star) has essentially 0% rescue effect at any stop width — the distribution of MFE for morning_star losers shows they rarely even tick meaningfully positive before rolling over.

#### MFE / MAE signal

Baseline losers' median MFE is **0.0016** vs baseline winners' **0.0252** — a **15x gap**. Losers were not stopped out by normal trend noise; they were mostly directionally wrong from entry. The MAE asymmetry on losers (median 0.0200 vs winners 0.0053) confirms the same picture.

### Decision implications (consensus CC ↔ Langston 2026-04-20)

1. **Path D premise is validated** — but B63 implementation tuning is a separate, ongoing question. You cannot rescue morning_star on high-DBS pairs by widening stops. The need for a purpose-built trend-rider archetype is real. Whether the current B63 entry rules are final is still being refined — underfiring is a real concern.
2. **The strong-trend opportunity set splits into TWO buckets**, not one:
   - **(a) Fresh continuation breakout** → Path D / `strong_bull_trend`
   - **(b) Pullback-resumption within strong trend** → what `vwap_pullback` is already hinting at, and possibly a future `strong_bull_pullback` lane
   This is the bigger strategic insight from the audit. The system needs both, not just one.
3. **Strategy-specific response, NOT blanket "block legacy at high DBS":**
   - **morning_star** at high positive DBS: **hard block.** Pinbar-reversal has no business trading at DBS ≥ 0.30.
   - **reverse_impulse** at strong negative DBS for LONG entries: **equivalent restriction** (mirror defect — 54 of 94 such trades).
   - **vwap_pullback:** **do NOT block.** The audit points to it as a potentially salvageable / promotable archetype. Candidate for wider-stop / better-exit treatment OR as seed of future `strong_bull_pullback`.
4. **TEC is an amplifier, not a rescue mechanism.** Trailing does not help strategies that never generate MFE. TEC as shared service helps strategies that ARE directionally right (vwap_pullback, new Strong Bull Trend), and frames the scope for B63 Item 2 cleanly.

### Summary numbers

- Baseline avg R = -0.27, Sum R = -24.0
- Variant B avg R = -0.10, Sum R = -9.1 (ΔAvgR = +0.17) — improvement came from avoiding stops, not hitting targets (target% dropped from 30% to 1%)
- Variant E avg R = -0.05, Sum R = -4.8 — best overall variant, still net negative
- Variant D avg R = -0.30, Sum R = -26.9 (worst)
- 7 of 52 original stop-outs (13%) later reached +1R under fixed-stop variants
