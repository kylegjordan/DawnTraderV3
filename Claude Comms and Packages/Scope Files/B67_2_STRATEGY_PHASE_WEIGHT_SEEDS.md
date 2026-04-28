# B67.2 Strategy-Phase Preference Weight Seeds — Draft for Review

**Date:** 2026-04-28
**Author:** Claude Code (draft for Langston review per Telegram #3225 + cc-inbox #842)
**Status:** APPROVED 2026-04-28 by Langston (cc-inbox #843, Telegram #3227) with one cell tweak applied (`range_trade`: EARLY 0.95→0.90, LATE 1.00→1.05). SEEDS — recalibrate from VTS data after 14d post-deploy per scope §7.4 + Langston ack.

---

## Scope-discrepancy note (flag for Langston)

Scope §7.4 says "17 strategies × 3 phases = 51 weights". Canonical strategy set today is **18**, not 17 — `strong_bull_trend` (B63 Path D, registered in TFS + IE via the strong-trend lane) was added after the original `STRATEGIES` const in `canonical-regime-strategy-map.ts` line 345-363. So the JSONB blob will be **54 cells**, not 51.

If you'd rather defer phase preference for `strong_bull_trend` to a B63-aware separate handling (since it bypasses mode-overlay anyway via `sourcePool='quant-strong_trend'` per B63 Item 14), I can drop it back to 51. Default plan: include it.

---

## Phase definitions (from scope §7.1)

- **EARLY** = 0–2h since the pair's last regime transition. Regime is fresh; signals depend on the new condition having stabilized.
- **PRIME** = 2–12h. Regime is confirmed and mid-life. Most reliable window for strategies designed around an established regime.
- **LATE** = 12h+. Regime is aged; exhaustion-prone; reversal-mode strategies favored.

Multiplier range: **0.80 (strong against) → 1.10 (strong fit)** with a conservative-seed bias — most cells fall within ±0.10 of 1.00. Ambiguous strategies seeded at flat 1.00 across all phases per your directive.

---

## Seed table (54 cells)

| # | Strategy | Family | Reg. regimes | EARLY | PRIME | LATE | Rationale (one sentence) |
|---|---|---|---|---:|---:|---:|---|
| 1 | `sma_trend_ride` | trend | IE | 0.95 | **1.10** | 0.90 | SMA(50/100) crossover needs the trend regime to mature past initial impulse; PRIME is canonical, LATE is exhaustion-prone for trend continuation. |
| 2 | `vwap_pullback` | trend (+ strong_trend) | TFS | 0.90 | **1.10** | 0.95 | Pullback archetype requires an established trend to pull back from; mid-trend is canonical fit, LATE keeps mild penalty since pullbacks can still resolve cleanly. |
| 3 | `morning_star` | pattern | TFS, ST | 1.00 | 1.00 | **1.05** | Reversal pattern at trend exhaustion is its strongest setup, but it can fire any time so seeded near-flat with mild LATE preference. |
| 4 | `pivot_shift` | hybrid (trend + pattern) | TFS, ST | **1.05** | 1.00 | **1.05** | Designed for regime-boundary transitions — fits both fresh entries (EARLY) and exhausted setups (LATE), neutral mid-life. |
| 5 | `mean_reversion` | reversal | HVU | 0.90 | 1.00 | **1.10** | Canonical exhaustion fade — needs the move to have stretched (LATE-leaning); penalize EARLY where price has not extended yet. |
| 6 | `reverse_impulse` | hybrid (reversal + pattern) | HVU | 0.95 | 1.00 | **1.10** | Counter-trend impulse fade fires best at exhaustion zones; LATE HVU is its canonical setup. |
| 7 | `defensive_hedge` | hybrid (reversal + breakout) | HVU | 0.95 | 1.00 | **1.05** | Defensive plays a bit better when the trend is over-extended; conservative seed otherwise. |
| 8 | `inside_bar_reversal` | pattern | HVU | 1.00 | 1.00 | **1.05** | Reversal pattern with mild LATE preference (exhaustion bias) — seeded conservative since pattern detection drives it more than regime age. |
| 9 | `range_trade` | reversal | RBS | 0.90 | **1.10** | **1.05** | Fresh RBS classification might be a brief consolidation within a trend, not a true range — stronger EARLY penalty (0.90); PRIME RBS is canonical fit; LATE bonus (1.05) rewards the persistence signal — ranges that survive 12h+ are MORE confirmed, and range_trade is itself a boundary-fading strategy, consistent with mean_reversion LATE=1.10. (Per Langston review cc-inbox #843.) |
| 10 | `support_bounce` | pattern | RBS | 1.00 | **1.05** | 0.95 | Support levels validate as range matures (PRIME), but LATE RBS becomes breakout-prone making support-bounce more likely to fail. |
| 11 | `abcd_long` | pattern | RBS | 1.00 | **1.05** | 0.95 | Harmonic ABCD setup needs range-time to develop legs; LATE penalty matches range-breakout risk. |
| 12 | `adaptive_flow` | hybrid (trend + reversal) | RBS | 1.00 | 1.00 | 1.00 | **Ambiguous strategy** — momentum-inversion + volatility-percentile setup fires across regime ages without a clear age-prior. Conservative flat seed. |
| 13 | `breakout` | breakout | IE | **1.10** | 1.00 | 0.85 | Fresh impulse is canonical breakout fuel; LATE breakouts are the failure-prone "chase mode" cohort that B65.5 surfaced. |
| 14 | `vwap_bounce` | breakout | IE | **1.05** | 1.00 | 0.95 | Bounce-off-VWAP after an impulse fires best when the impulse is fresh; LATE penalty mirrors breakout family logic. |
| 15 | `volatility_edge` | hybrid (breakout + reversal) | IE | **1.10** | 1.00 | 0.85 | Volatility-percentile-driven; vol typically expands then contracts, so EARLY (vol just expanded) is canonical and LATE (vol contracting) is anti-fit. |
| 16 | `dhma` | trend | IE | 0.95 | **1.05** | 0.95 | HMA cross trend continuation — mild PRIME preference, conservative on the edges since HMA filters its own staleness via slope. |
| 17 | `liquidity_trap` | reversal | ST | **1.10** | 1.00 | 0.90 | Liquidity sweep + reversal is an EARLY-of-transition setup; LATE ST means the transition has dragged and the sweep is stale. |
| 18 | `strong_bull_trend` | strong_trend | TFS, IE | **1.05** | **1.10** | 0.85 | Strong-trend lane just confirmed (EARLY) is a good entry; mid-trend (PRIME) is canonical; LATE is the **04-22 canonical failure mode** — strong-trend regimes that have run for 12h+ are exhaustion-prone, this is exactly the cohort the macro modifier + phase dimension is designed to penalize. |

---

## Distribution check

- **Strong fits (1.10):** 9 cells — `sma_trend_ride/PRIME`, `vwap_pullback/PRIME`, `mean_reversion/LATE`, `reverse_impulse/LATE`, `range_trade/PRIME`, `breakout/EARLY`, `volatility_edge/EARLY`, `liquidity_trap/EARLY`, `strong_bull_trend/PRIME`. Roughly even across phases — 3 EARLY-favored, 4 PRIME-favored, 2 LATE-favored.
- **Strong against (0.80–0.85):** 3 cells — `breakout/LATE`, `volatility_edge/LATE`, `strong_bull_trend/LATE`. All in IE / strong-trend lane where LATE-regime exhaustion is the documented failure mode.
- **Mild fits/penalties (0.85–1.05 inclusive):** ~30 cells.
- **Flat 1.00:** 12 cells — most in PRIME (canonical neutral) plus the fully-ambiguous `adaptive_flow` row.

---

## Production-value override mechanism

`module_constants` JSONB blob `b67_2_strategy_phase_weights` keyed `<strategy>_<phase>` (per scope §7.4). Tunable at runtime without code redeploy.

**No fallback** per CLAUDE.md §11 + Kyle directive 2026-04-29: missing key throws hard at the lookup site (same pattern as B63 DBS hard-contract `throw new Error(...)`). Loud and visible in PM2. Forces migration fix rather than silently shipping neutral 1.00. The migration MUST seed all 54 cells; if a future batch adds a new canonical strategy, that batch's migration is responsible for seeding its 3 phase rows (`<new_strategy>_EARLY/PRIME/LATE`).

---

## Open questions for Langston

1. **Include `strong_bull_trend` (54 cells) or defer to separate B63-aware handling (51 cells)?** My default: include — it's the highest-leverage row given 04-22.
2. **EARLY/PRIME/LATE multiplier band: 0.80–1.10 acceptable?** Or do you want a tighter conservative band for the initial seed (e.g. 0.90–1.05) so the phase dimension does less while we collect calibration data?
3. **Any specific cell you want flipped before this enters the migration?**

Once you sign off I'll write the migration with these values and the inline "values are seeds, recalibrate from B67.0 ablation data after 14d" note.
