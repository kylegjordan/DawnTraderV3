# Batch 68 — Progress Report (OPEN)

**Author:** Claude Code
**Opened:** 2026-05-02 (with B68.2 closure)
**Status:** OPEN — B68.2 closed (LIVE PM2 #128). B68.3 + B68.1 remaining.

> Batch 68 is the structural-classifier-improvements track per master plan §0.11.B. Three sub-batches sequentially after B67.4 cheap-tier bundle: B68.2 Volume → B68.3 Pair correlation → B68.1 Multi-TF agreement. Each gets its own ~14d mini-window via the existing ablation framework.

---

# B68.2 — Volume Regime — CLOSURE 2026-05-02

**Status:** SHIPPED. PM2 #128. **B68.2 mini-window started — Day 0 of 14 (ends 2026-05-16).**

## Commit

`50670465` — B68.2 v1: 7 files. No hotfixes required this batch (Langston Steps 1/2/4 caught what would have been issues at the scope/pre-audit stage).

## Lever shipped (single, not bundled)

**B68.2 — Volume regime as second confidence dimension.** Adds accumulation/distribution as orthogonal signal to the price-derived regime classifier (which reads vol/momentum/ADX/DBS — all four price-derived). Pure-function score + narrow-band confidence factor + ablation row architecture mirrors B67.4 / B68.4 exactly.

### Score formula (Langston cc-inbox #880 §B.1 pick)

```
score = SUM(volume[i] × sign(close[i] - close[i-1])) / SUM(volume[i])
```

Bounded `[-1, +1]`. +1 = pure accumulation (volume rises on up-closes), -1 = pure distribution (volume rises on down-closes), 0 = balanced. Lookback N=30 bars matches HF7 momentum lookback per Langston §B.2. Total-volume=0 edge → score=0 (no NaN). Cold-start (`ohlcData.length < min_samples`) → score=0, factor=1.0, coldStart=true.

### Factor mapping

```
factor = clamp(0.92, 1.05, 1.0 + score × 0.05)
```

Sensitivity 0.05 narrow band per Langston §B.4 (clamps decorative at v1, future-proofing for widening via DB UPDATE post-calibration). Symmetric ±0.40 ACCUMULATION/DISTRIBUTION metadata thresholds per Langston §B.5.

### Modulation chain extension

```
raw × macro × phase_weight × freshness × outcome × volume_regime → clamp [0.4, 1.0]
```

5 chain modulators now (was 4 with B67.4). vts-runner emit hook updates `openTrade.regimeConfidenceModulated` so closed VTS trades carry full composite. Active-path orchestrator computes chain for B68.2 ablation metadata only (active trading off; persist hook deferred to B67.5).

## Refinements (Langston cc-inbox #880 / #881 / #882)

### §D.1 — `has_liquidation_spike` metadata flag (Step 1 review)

For each pair-eval, compute median of volumes in the lookback. Flag `has_liquidation_spike = true` if any single bar has `volume > multiplier × median`. Pure pass-through compute on the same N-bar slice already loaded for the score. Single boolean in metadata; segments calibration cohorts into clean vs liquidation-contaminated post-deploy without recomputation.

### §D.2 — Liquidation-spike multiplier as module_constant from v1 (Step 2 review)

Promoted `b68_2_liquidation_spike_multiplier = 5.0` to the migration as the 8th `volume_regime` module_constant. DB-tunable post-deploy without code redeploy per Kyle §0.9 directive.

### §D.3 — vts-runner verification (Step 4 review)

Langston flagged GDrive timeout reading vts-runner; CC verified pre-push that the hook uses function-scope `ohlcData` (correct path from B67.4 hotfix #3), not the `MarketContext` any-cast.

## Module constants (8 in `volume_regime` module)

| Constant | Seed |
|---|---|
| `b68_2_lookback_bars` | 30 |
| `b68_2_accumulation_threshold` | 0.40 |
| `b68_2_distribution_threshold` | -0.40 |
| `b68_2_factor_min` | 0.92 |
| `b68_2_factor_max` | 1.05 |
| `b68_2_sensitivity` | 0.05 |
| `b68_2_min_samples` | 30 |
| `b68_2_liquidation_spike_multiplier` | 5.0 |

## MCE refresh refactor

7-group orchestrator (was 6 from B67.4). Added `refreshVolumeRegimeConfig()` resolving 8 keys; both first-refresh `Promise.all` and subsequent-refresh per-group try/catch arrays extended. B67.4 hotfix-#2 first-refresh try/catch wrapper inherited unchanged. `assembleRegimeConfig` unchanged (volume regime is chain-only, not part of `RegimeConfig`). 1 new public accessor `getCurrentVolumeRegimeConfig()`.

## Verification (Step 8)

- All 8 expected factor types emitting in `regime_factor_alternates`: b67_1_btc_dominance / funding_rates / mcap_momentum / b67_2_phase_preference / b67_4_outcome_feedback / b68_4_regime_age / b68_5_path_b_sustainability / **b68_2_volume_regime (NEW)** ✓
- First B68.2 row metadata correctly populated: score=0.358 / factor=1.018 / label=NEUTRAL / has_liquidation_spike=true / cold_start=false / samples=30 ✓
- Migration applied successfully (8 keys in `volume_regime` module)
- PM2 #128 stable post-restart

## Workflow log

- Step 1 (scope): Langston-approved cc-inbox #880 (2026-05-01) with §D.1 refinement
- Step 2 (pre-audit): Langston-approved cc-inbox #881 (2026-05-02) with §D.2 8th constant
- Step 3 (implementation): 2026-05-02
- Step 4 (code review): Langston-approved cc-inbox #882 (2026-05-02) — verified vts-runner uses function-scope ohlcData
- Step 5 (push): commit `50670465`
- Step 6 (CI): 3 of 4 green (TS Check legacy baseline)
- Step 7 (deploy): PM2 #128 on Hetzner staging; migration applied
- Step 8 (CC verify): all 8 factor types emitting + metadata shape correct
- Step 9 (Langston verify): notification pending
- Step 10 (governance): BATCH_CATALOG + MEMORY truth+repo + master plan §0.11.B SHIPPED marker + this closure section
- Step 11 (closure): this section

## Active-path deferred items (carried in RUNNING_ISSUES #44)

- Active-path orchestrator emit hook OHLC any-cast — silent-skip when undefined. Active trading off so observational-only impact. Wire alongside B67.5 consumer wiring when active reactivates.

## What's next

- **B68.2 mini-window observation Day 0–14** (ends 2026-05-16). Watch ablation rows accumulate to n ≥ 150 per (factor, tertile) bucket. B68.2's calibration uses only `factor_name = 'b68_2_volume_regime'` rows over the 14d window per master plan §0.11.C step 5 — independent of B67.4's running window.
- **B68.3 Pair correlation** queued next (~1 week, builds on existing per-pair BTC correlation in `defensive-hedge.ts`).
- **B68.1 Multi-TF agreement** after B68.3 (~2 weeks, needs higher-TF OHLC pipeline — B74's 1-min crypto OHLC archive will provide the data path).

---

*B68.2 closure section complete 2026-05-02. Report stays OPEN until B68.3 + B68.1 also close.*
