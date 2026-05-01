# BATCH 68.3 — Pair Correlation as Confidence Dimension

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-02
**Status:** Step 1 — scope drafted, awaiting Langston review
**Parent program:** Phase 15c — B67/B68 Regime-Confidence Overhaul
**Predecessor:** B68.2 Volume Regime SHIPPED 2026-05-02 (PM2 #128). B68.2 mini-window Day 0 of 14.
**Successor:** B68.1 Multi-TF agreement (~2 weeks, leverages B74's 1-min crypto OHLC archive)
**Window dependency:** B68.3 ships into the running B67.4 + B68.2 calibration windows. Per master plan §0.11.C step 5, ablation framework attributes per-factor independently — B68.3's `b68_3_pair_correlation` row type is observed against trades in the 14 days following B68.3 deploy (its own mini-window).

---

## Why this lever exists (master plan §5.4 #5 + §5.2)

> "Pair-correlation context. Small-cap alt moving up purely because BTC is moving up has no idiosyncratic edge — the trade adds no value over just buying BTC. Classifier doesn't know correlated-drift vs idiosyncratic moves." (§5.2 #5)

> "Cross-pair correlation gate. Distinguishes idiosyncratic alt moves from BTC-correlated drift. Own batch. Needs cross-pair correlation matrix infrastructure. Builds on existing per-pair BTC correlation in `defensive-hedge.ts`." (§0.11.B)

The current regime classifier reads volatility, momentum, ADX, DBS — all per-pair, all price-derived. The B67/B68 chain has now added macro context (B67.1), phase (B67.2), freshness (B68.4), outcome feedback (B67.4), Path B sustainability (B68.5), and volume regime (B68.2). What's still missing: **whether a pair is moving independently of the broader market, or just riding BTC.**

A small-cap alt classified as TFS while BTC is also TFS may have zero idiosyncratic alpha — the trade is just a leveraged BTC bet. A pair classified TFS while BTC is RBS or HVU has a real signal. The classifier doesn't see this distinction.

**B68.3 closes that gap** by adding a per-pair **decorrelation score** derived from rolling Spearman rank correlation between the pair's returns and BTC's returns, then applying it as a multiplicative confidence modifier — same architectural pattern as B67.4 / B68.4 / B68.2.

**Scope distinction from Phase 19.5 AMR:** Phase 19.5 is a UNIVERSE-level concentration gate (hostile-window detection across the cohort). B68.3 is a PER-PAIR confidence dimension. Different abstraction levels, different scopes, complementary signals. Confirmed by Langston cc-inbox #846 / master plan §0.11.B.

---

## Scope summary

Single lever, single batch. Mirrors B68.2 architectural pattern exactly.

| Component | What it adds |
|---|---|
| **`pair-correlation.ts`** | New per-pair rolling computation. Outputs `correlationToBtc` ∈ [−1, +1] and `decorrelationScore` ∈ [0, 1]. Reuses existing `spearmanRankCorrelation` from `strategy-helpers.ts` (already used by `defensive-hedge.ts`). Pure function. |
| **`computePairCorrelationFactor`** | Pure function: `factor = clamp(min, max, 1.0 + decorrelationScore × sensitivity)`. Cold-start floor on min-sample count returns factor=1.0. |
| **B68.3 ablation row** | `factor_name = 'b68_3_pair_correlation'` emitted on every signal evaluation alongside the existing 8 factor types. |
| **Modulation chain extension** | `raw × macro × phase × freshness × outcome × volume_regime × pair_correlation → clamp [0.4, 1.0]`. 6 chain modulators after this batch. |
| **MCE 8th refresh sub-method** | `refreshPairCorrelationConfig()`. Same orchestrator pattern. |
| **BTC reference data** | Fetched from `ohlcCache.getOHLCData('XBT/USD', 60)` once per signal eval. The pair's own OHLC is already in scope (function-scope `ohlcData` in vts-runner). |
| **Module constants (7)** | New `pair_correlation` module. Lookback / decorrelation threshold / factor min/max / sensitivity / min samples / btc reference symbol. |

---

## §A. Numbered Objectives

### A.1 Correlation score formula

For each pair eval, compute Spearman rank correlation between the pair's returns and BTC's returns over the same N-bar lookback.

```
pairReturns = [(close[i] − close[i-1]) / close[i-1] for i in 1..N]
btcReturns  = [(btcClose[i] − btcClose[i-1]) / btcClose[i-1] for i in 1..N]
correlationToBtc = spearmanRankCorrelation(pairReturns, btcReturns)
decorrelationScore = 1 - |correlationToBtc|
```

Spearman (rank-based) is preferred over Pearson because crypto returns are non-normal (heavy tails, non-linear relationships). Already used by `defensive-hedge.ts` for the same reason.

`correlationToBtc` ∈ [−1, +1]. `decorrelationScore` ∈ [0, 1] (high = idiosyncratic, low = correlated drift).

**A.1.1** Cold-start when `pairOhlcData.length < min_samples` OR `btcOhlcData.length < min_samples`: return correlationToBtc=0, decorrelationScore=0, factor=1.0, coldStart=true. Both pair and BTC must have ≥ N bars.

**A.1.2** When BTC reference is the pair itself (i.e., pair = `XBT/USD`): decorrelationScore=0, factor=1.0, label=`SELF_REFERENCE`. The trade-on-BTC case is degenerate; ablation row still emits with explicit metadata flag.

**A.1.3** `correlationToBtc` is signed; `decorrelationScore` is unsigned. Correlation sign captures direction-agnostic alpha. A pair perfectly anti-correlated (-1) has decorrelationScore=0 too — it's still tightly linked to BTC, just inversely. Both directions represent "no idiosyncratic edge".

### A.2 Confidence factor mapping

```
factor = clamp(b68_3_factor_min, b68_3_factor_max, 1.0 + decorrelationScore × b68_3_sensitivity)
```

Seed values:
- `b68_3_factor_min = 0.95`
- `b68_3_factor_max = 1.05`
- `b68_3_sensitivity = 0.05`

With seed sensitivity 0.05 and decorrelationScore ∈ [0, 1]: raw range [1.00, 1.05]. Asymmetric — only POSITIVE modulation. Rationale: a highly-correlated pair gets factor=1.0 (no boost, no penalty); a fully-decorrelated pair gets factor=1.05 (small boost). We're not penalizing correlation — we're rewarding decorrelation.

Floor at 0.95 is decorative at seed values (raw can't go below 1.00). Future-proof for if calibration shows we should also penalize high correlation.

**A.2.1** Cold-start (sample_count < min_samples or BTC reference unavailable) returns factor=1.0 + coldStart=true.

**A.2.2** All clamp bounds + sensitivity from `module_constants`. No hardcoded constants per Kyle's §0.9 directive.

### A.3 Modulation chain integration

After this batch, the chain becomes:

```
raw × macro × phase_weight × freshness × outcome × volume_regime × pair_correlation → clamp [0.4, 1.0]
```

Order: pair_correlation goes LAST in the chain, after volume_regime. Rationale matches B68.2's: volume_regime captures pair's current state on its own; pair_correlation captures pair's relationship to the broader market — even more "current snapshot".

**A.3.1** vts-runner emit hook updates `openTrade.regimeConfidenceModulated` to reflect the **6-modulator** chain. Active-path orchestrator continues to compute the chain for B68.3 ablation metadata; per-trade persist hook still deferred to B67.5 (carries with B68.2 / B68.5 deferrals).

### A.4 Ablation row shape

```jsonb
{
  "factor_name": "b68_3_pair_correlation",
  "factor_state": "alternate_disabled",
  "alternate_decision": {
    "regime_label": "<regime>",
    "confidence": <confidence_without_correlation_factor>,
    "admission_possible": true,
    "metadata": {
      "correlation_to_btc": <-1..+1>,
      "decorrelation_score": <0..1>,
      "pair_correlation_factor": <factor>,
      "confidence_with_factor": <real>,
      "confidence_without_factor": <real / factor>,
      "lookback_bars": <N>,
      "sample_count": <bars actually available>,
      "cold_start": <bool>,
      "btc_reference_available": <bool>,
      "is_btc_self_reference": <bool>,
      "label": "IDIOSYNCRATIC | DRIFTING | NEUTRAL | SELF_REFERENCE"
    }
  }
}
```

Confidence-counterfactual semantic mirrors B68.2 (divide-out approximation). Same documented limitation as the existing chain factors.

### A.5 Tests

10+ cases minimum:
- Pure correlation (corr=+1) → decorrelation=0, factor=1.0
- Pure anti-correlation (corr=-1) → decorrelation=0, factor=1.0
- Zero correlation → decorrelation=1, factor=1.05 (ceiling)
- Cold-start: pair OHLC < min_samples
- Cold-start: BTC OHLC missing
- Self-reference (pair=BTC): factor=1.0, label=SELF_REFERENCE
- Factor clamps when sensitivity is widened
- Spearman handles non-monotonic relationships correctly (already tested in strategy-helpers — sanity-check it here too)
- Label thresholds: corr ≥ 0.70 → DRIFTING, |corr| ≤ 0.30 → IDIOSYNCRATIC, else NEUTRAL
- Counterfactual divide-out

### A.6 Module constants — 8 in `pair_correlation` module (§D.1 Langston cc-inbox #883)

| Constant | Seed | Purpose |
|---|---|---|
| `b68_3_lookback_bars` | 30 | Number of recent OHLC bars |
| `b68_3_btc_reference_symbol` | `"XBT/USD"` | BTC pair symbol for correlation reference |
| `b68_3_factor_min` | 0.95 | Lower clamp |
| `b68_3_factor_max` | 1.05 | Upper clamp |
| `b68_3_sensitivity` | 0.05 | Slope of factor vs decorrelation score |
| `b68_3_min_samples` | 30 | Cold-start floor |
| `b68_3_drifting_threshold` | 0.70 | `\|corr\|` above which metadata flags `label = "DRIFTING"` |
| `b68_3_idiosyncratic_threshold` | 0.30 | `\|corr\|` below which metadata flags `label = "IDIOSYNCRATIC"` (Langston §D.1) |

Note: `b68_3_btc_reference_symbol` stored as JSONB string. Matches existing string-valued module_constants pattern.

§D.2 (Langston cc-inbox #883): both `drifting_threshold` and `idiosyncratic_threshold` use `|correlationToBtc|` (absolute value) so both highly-positive AND highly-negative correlation flag as DRIFTING (anti-correlated pairs are also "no idiosyncratic edge" per §A.1.3).

### A.7 Observability

- `[B68.3][correlation] pair=X corr=Y decorr=Z factor=F label=<idio|drift|neutral|self>` emitted on first signal-eval per pair per cycle.
- B68.3 ablation row count visible in dashboard per-factor breakdown (UI auto-extends).
- Factor Calibration UI panel automatically picks up the new row type once n ≥ 150 per bucket.

---

## §B. Open design questions for Langston (Step 1 review)

1. **BTC reference symbol**: I have `XBT/USD` (Kraken canonical for BTC). Alternative: use the BTC pair that matches the universe quote currency (so a USDT-quoted pair correlates against BTC/USDT). Adds complexity (per-pair reference resolution) but is more apples-to-apples. Lean toward XBT/USD universal reference for v1?

2. **Spearman vs Pearson**: I picked Spearman per `defensive-hedge.ts` precedent (rank-based, robust to non-normal returns). Alternative: Pearson is cheaper and more familiar. Lean Spearman?

3. **Asymmetric factor range [0.95, 1.05]** (boost only, no penalty for high correlation): scope §A.2 reasoning is "we're rewarding decorrelation, not penalizing correlation". Alternative: symmetric [0.92, 1.08] — penalize highly-correlated pairs explicitly. Lean asymmetric for v1?

4. **Lookback N=30**: matches B68.2 + HF7 momentum + B62 DBS lookbacks. Consistency argument. Alternative: 60 bars (slower, smoother). Lean 30 for consistency?

5. **Per-quote-currency BTC reference vs single XBT/USD**: re-asking #1 in different framing. If we're trading SOL/USDT, do we correlate against BTC/USDT or BTC/USD? In practice the two BTC quotes are nearly identical, so either works. v1 simplest: just XBT/USD. Acceptable?

6. **Self-reference label (when pair = BTC)**: I have factor=1.0 + label=SELF_REFERENCE. The trade is degenerate (BTC trading BTC) but the eval can still happen. Acceptable, or want to skip-emit entirely?

7. **Anything missing or wrongly scoped?**

---

## §C. Risks + Mitigations

**R1: 6-multiplier chain compound penalty stack.** Worst case adds another 0.95 multiplier (B68.3 floor at minimum decorrelation) on top of the 5-modulator stack. Per scope §C analysis: `0.85 × 0.85 × 0.92 × 0.85 × 0.92 × 0.95 ≈ 0.455` — still above 0.4 floor but tighter. **Same B67.5 pre-registration concern** carried from B68.2. Non-blocking for B68.3 — observational only pre-B67.5.

**R2: BTC OHLC may not be in `ohlcCache` when emit hook fires.** XBT/USD is a primary pair; Kraken WS subscription always includes it; `ohlcCache.getOHLCData('XBT/USD', 60)` should succeed unless the cache is cold-starting. Mitigation: emit hook checks `btcOhlc.length >= min_samples`; if not, factor=1.0 + `btc_reference_available: false` metadata flag. Calibration data filters these out.

**R3: Spearman correlation on N=30 noisy crypto returns may be unstable cycle-to-cycle.** Two consecutive ticks could produce significantly different correlation values if a single bar shifts the rank ordering. Mitigation: smoothing is a v2 follow-up if calibration shows high noise; v1 ships raw correlation per cycle and observes whether the noise is meaningful in the tertile WR analysis.

**R4: BTC self-reference (pair = XBT/USD) is degenerate.** Trading BTC vs itself doesn't make sense. Per A.1.2, factor=1.0 + `is_btc_self_reference: true` flag. Calibration cohort can filter these rows.

**R5: Pearson alternative simpler but biased on heavy-tailed distributions.** Spearman picked for robustness. v2 calibration follow-up if Spearman underperforms.

**R6: Per-quote-currency BTC reference adds infrastructure** (need to map "USDT-quoted pair" → "BTC/USDT" lookup). v1 ships single XBT/USD reference. Acceptable approximation since BTC/USD ≈ BTC/USDT correlation-wise.

---

## §D. Out of Scope

- **Per-quote-currency BTC reference** — v1 single reference; v2 if calibration shows it matters.
- **Cross-pair correlation matrix** (pair-to-pair, not pair-to-BTC) — separate scope; not what master plan §0.11.B specified for B68.3.
- **Smoothed correlation (e.g., EMA over rolling correlation)** — v2 follow-up if v1 shows noise issues.
- **Per-regime correlation interpretation** — v1 ships regime-agnostic. Calibration cohorts will reveal whether per-regime interpretation matters.
- **Active-trading per-trade persist hook** — same deferral as B67.4 / B68.2 / B68.5 (active trading off; chain in ablation metadata only).
- **Phase 19.5 AMR concentration gate** — universe-level concentration is a different scope per master plan §5.2 / Langston cc-inbox #846.

---

## §E. Verification Criteria (Step 11 closure)

- [ ] `regime_factor_alternates.factor_name = 'b68_3_pair_correlation'` rows appearing within 1h post-deploy
- [ ] `[B68.3][correlation]` log lines appearing in PM2 logs within 1h
- [ ] Distribution non-degenerate: at least two of {IDIOSYNCRATIC, DRIFTING, NEUTRAL} represented across pairs in first hour
- [ ] No `[B68.3]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column on closed VTS trades reflects 6-multiplier chain (variance vs pre-B68.3 5-multiplier baseline)
- [ ] `is_btc_self_reference: true` row present (XBT/USD pair self-correlates) — sanity check
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.3 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B sequence marker, this scope file → APPROVED, BATCH_68_PROGRESS_REPORT B68.3 closure section appended
- [ ] Tier 2 governance: SIM (new component) + RUNNING_ISSUES (calibration window observation entry)

---

## §F. Module-Constants Migration

```sql
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_lookback_bars',         '30'::jsonb,         'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_btc_reference_symbol',  '"XBT/USD"'::jsonb,  'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_factor_min',            '0.95'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_factor_max',            '1.05'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_sensitivity',           '0.05'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_min_samples',           '30'::jsonb,         'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_drifting_threshold',    '0.70'::jsonb,       'b68.3-pair-correlation'),
  ('pair_correlation', '*', '*', '*', '*', 'b68_3_idiosyncratic_threshold','0.30'::jsonb,       'b68.3-pair-correlation')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();
```

---

## §G. Workflow position

Step 1 of 11. After Langston review + sign-off:
- Step 2 — Pre-implementation audit (SIM consultation for pair-correlation.ts, MCE, signal-orchestrator, vts-runner, ohlc-cache).
- Step 3 — Implementation.
- Steps 4-11 — Code review, push, CI, deploy, verify, governance, completion.

Estimated effort: ~1 week per master plan §0.11.B.

---

*End of B68.3 Step 1 scope. Awaiting Langston review.*
