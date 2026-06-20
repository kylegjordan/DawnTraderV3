# reorg-B2.1 OBJ-4 — Per-Strategy Guard-Wiring Verification + the minRR-Suppression Finding

> CC-B analysis 2026-06-21 (read-only, code-derived). Feeds OBJ-4 (wire the 11 into `applyGlobalGuards`) + surfaces a decision-grade calibration finding. All 11 ALREADY pass through the normalizer (minRR=2.5 + reachability) downstream today, so wiring is NET-NEUTRAL on pass/fail — EXCEPT the ATR-source divergence (decision 1). The value of the analysis is what it reveals about the 2.5 seed.

## ★ HEADLINE FINDING (decision-grade) — minRR=2.5 suppresses most of the strategy suite
The reorg-B2 per-class `min_rr=2.5` seed is **higher than most strategies' designed reward-to-risk**, so the normalizer is dropping them TODAY (in VTS; active is dormant). reorg-B2 RAISED the effective RR floor from 1.5 (file-based via `applyGlobalGuards`) / none (in-class) → 2.5 (all, via the normalizer), which is what introduced the suppression.

**Hard-suppressed (fixed RR < 2.5, dropped on EVERY signal):**
- `strong_bull_trend` — stop −3×ATR, target +6×ATR → **RR 2.0**.
- `vwap_bounce` — target = entry + 2R → **RR 2.0**.
- `sma_trend_ride` (break leg) — 2R → **RR 2.0**.
- `dhma` — symmetric k_tp×vol around currentPrice (not entry) → **RR ≈ 1.0**.

**Runtime-suppression-prone (RR frequently < 2.5 by construction):** `orb` (~1.3 realized, documented), `breakout` (measured-move, usually < 1.5), `range_trading`, `mean_reversion`, `abcd_long` (fixed-3% / 2R-trailing legs). Pass only on favorable geometry.

**Implication:** the 2.5 "placeholder" is not a mild quality bar — it switches off a large fraction of the suite. This corroborates the confidence/RR-inversion thesis (Phase-25 25-2/3/10) and means the per-class (likely per-strategy) minRR needs calibration to the strategies' actual design (~2.0), NOT a one-size 2.5. **Decision for Kyle:** trading philosophy — only-high-RR signals trade (keep 2.5, accept most strategies suppressed) vs trade-the-strategies-as-designed (lower minRR toward 2.0, or per-strategy minRR). Recommend instrumenting the guard-drop `rr` per strategy to measure the suppression rate before setting values.

## Three OBJ-4 decisions (CC-B recommendations, for Langston)
1. **ATR source (the ONE genuine non-net-neutral).** Guard reachability uses `getEffectiveATR` (clamped `min(ATR, price×0.10)`, rejects `ATR < price×0.001`); the normalizer uses raw `mceContext.indicators.atr`; the in-class detectors compute raw `computeATR`. Where raw ATR > price×10%, the guard's clamped ATR is smaller → `atrsToTarget` larger → guard can over-reject vs the normalizer. **Recommend: feed `getEffectiveATR(candles, entry)` to the guard at every wire site** (clamp-parity is the guard's own contract; the rare high-vol divergence is the measured #371 delta), and accept it explicitly. Alternative (bit-identical): pass the same raw `indicators.atr` — but that bypasses the guard's ATR-sanity floor, so I lean `getEffectiveATR`.
2. **liquidity_trap — SKIP wiring.** It's DISABLED at orchestrator+VTS (`strategy-engine.ts:930-931`) and has SHORT/inverted geometry (target below entry, stop above) → `applyGlobalGuards` (long-only RR/stop-distance) would compute nonsense. Do not wire it; leave behind the disable flag.
3. **Dual-target branches** (vwap_pullback override-vs-default, sma break-vs-trailing, abcd fixed-vs-trailing): insert the guard AFTER the final target is resolved (post-resolution, pre-return) so it gates the chosen target, not an intermediate. Insert points enumerated per strategy (table below).

## Insert points (post-resolution, pre-return) + assetClass confirmed in scope
strong_bull_trend `strong-bull-trend.ts` after :149 / orb `orb.ts` after :279 / vwap_pullback after :255 (pre :291) / abcd_long after :380 / sma_trend_ride after :504 / breakout after :607 / mean_reversion after :697 / range_trading after :793 / vwap_bounce after :883 / dhma after :1456 / liquidity_trap SKIP. `assetClass` is a param on all 11 detect signatures.

## Net for OBJ-4
Wiring is net-neutral on RR (normalizer already gates at 2.5), so it's safe to proceed mechanically EXCEPT decisions 1-3. But the analysis surfaced that the **2.5 seed itself is the live issue** — that's a calibration decision (Kyle) separate from the wiring, homed alongside 25-2/3/10 / #336.
