# BATCH 68.2 — Volume Regime as Second Confidence Dimension

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-01
**Status:** Step 1 — scope drafted, awaiting Langston review
**Parent program:** Phase 15c — B67/B68 Regime-Confidence Overhaul
**Predecessor:** B67.4 cheap-tier bundle SHIPPED 2026-05-01 (PM2 #126/#127). Calibration window for B67.4 running Day 0 of 14.
**Successor:** B68.3 Pair correlation gate (own batch + own ~14d mini-window)
**Window dependency:** B68.2 ships into the running B67.4 calibration window. The ablation framework attributes per-factor independently — B68.2's `b68_2_volume_regime` row type is observed against trades in the 14 days following B68.2 deploy (its own mini-window). Earlier factors' calibration data is unaffected. Per master plan §0.11.C step 5.

---

## Why this lever exists (master plan §5.4 #4)

> "**Volume regime as second dimension** — Accumulation/distribution as a second confidence multiplier. Expected impact: 2-4pp on trend-rider WR. Effort: ~1 week."

The current regime classifier (`market-regime.ts:calculatePairRegime`) reads four inputs: volatility, momentum, ADX, DBS. **All four are derived from price.** Volume only enters the FX5 scanner as a minimum-volume gate — it does NOT enter regime classification.

**The signal we're missing:**
- Rising prices on **rising** volume → healthy trend (accumulation pressure)
- Rising prices on **declining** volume → exhaustion (distributors bailing into demand)
- Falling prices on **rising** volume → distribution (sellers in control)
- Falling prices on **declining** volume → washout / capitulation pending

The classifier sees price moving up but cannot tell which of the four scenarios is producing that move. Two pairs in the same TFS regime can have catastrophically different forward outcomes if one is accumulating and the other is distributing.

**B68.2 closes that gap** by adding a per-pair **volume regime score** derived from the correlation between price changes and volume, then applying it as a multiplicative confidence modifier — same architectural pattern as B67.4 (outcome feedback), B68.4 (freshness), and B67.1 (macro modifier).

---

## Scope summary

Single lever, single batch (NOT bundled). Mirrors the B67.4 / B68.4 architectural pattern so the ablation framework, modulation chain, and configuration scheme all extend uniformly.

| Component | What it adds |
|---|---|
| **`volume-regime.ts`** | New per-pair rolling computation. Outputs `volumeRegimeScore` ∈ [−1, +1] (−1 = strong distribution, +1 = strong accumulation). Pure function over OHLC. |
| **`volume-regime-store`** | Optional warm-up persistence (mirrors `directional-bias-store` pattern). v1 may omit if cold-start latency is acceptable; flag in §C. |
| **`computeVolumeRegimeFactor`** | Pure function: `factor = clamp(min, max, 1.0 + volumeRegimeScore × sensitivity)`. Cold-start floor on min-sample count returns factor=1.0. |
| **B68.2 ablation row** | `factor_name = 'b68_2_volume_regime'` emitted on every signal evaluation alongside the existing 7 factor types. |
| **Modulation chain extension** | `raw × macro × phase × freshness × outcome × **volume_regime** → clamp [0.4, 1.0]`. The chain is the only logical place this multiplier slots; every prior factor is similar. |
| **MCE 7th refresh sub-method** | `refreshVolumeRegimeConfig()`. Same orchestrator pattern from §D.4 — first refresh hard-fail in try/catch, subsequent refreshes per-group fault tolerance. |
| **Module constants (7)** | New `volume_regime` module. Lookback / accumulation threshold / distribution threshold / factor min/max / sensitivity / min samples. |

---

## §A. Numbered Objectives

### A.1 Volume regime score formula

Per-pair, per-tick (computed lazily from cached OHLC; no additional WS subscription needed — Kraken OHLC stream already includes volume on every candle).

```
score(N) = SUM_i=1..N (volume[i] × sign(close[i] − close[i-1])) / SUM_i=1..N volume[i]
```

Where N is the lookback count (`b68_2_lookback_bars`, seed 30). Score is bounded `[−1, +1]`:
- +1 = every volume bar in the lookback was on an up-close (pure accumulation)
- −1 = every volume bar on a down-close (pure distribution)
- 0 = balanced (no directional volume bias)

This is a **simplified Chaikin Money Flow / OBV-style** signal, chosen for:
- Bounded output (clean clamp behavior in the multiplicative chain)
- Single tunable lookback parameter (no smoothing constant to fight)
- No EMA initialization fragility (unlike OBV which is path-dependent)
- Pure function over the same `OHLCData[]` we already pass to `calculatePairRegime`

**A.1.1** When `ohlcData.length < b68_2_min_samples` (seed 30): return score=0, coldStart=true. Identical pattern to B67.4 / B68.4.

**A.1.2** When `SUM volume[i] = 0` (zero-volume edge case, e.g., illiquid pair): return score=0, coldStart=false. Don't divide by zero; report as neutral.

**A.1.3** All signed-volume + raw-volume sums use the lookback's most recent N bars.

### A.2 Confidence factor mapping

```
factor = clamp(b68_2_factor_min, b68_2_factor_max, 1.0 + score × b68_2_sensitivity)
```

Seed values:
- `b68_2_factor_min = 0.92`
- `b68_2_factor_max = 1.05`
- `b68_2_sensitivity = 0.05`

With seed sensitivity 0.05, score=+1 → raw 1.05 (hits ceiling), score=−1 → raw 0.95 (above floor 0.92, so clamps don't engage). Score around ±0.6 gives meaningful but bounded modulation. Asymmetric range mirrors B68.4 freshness.

**A.2.1** Cold-start (sample_count < min_samples) returns factor=1.0 + coldStart=true. No silent-fallback violation per CLAUDE.md §11.

**A.2.2** All clamp bounds + sensitivity from `module_constants`. No hardcoded constants per Kyle's §0.9 directive.

### A.3 Modulation chain integration

After this batch, the chain becomes:

```
raw × macro × phase_weight × freshness × outcome_feedback × volume_regime → clamp [0.4, 1.0]
```

Order discussion:
- **Position chosen: last (after outcome feedback).** Volume is the most pair-state-derived signal (price + volume on this pair right now). Macro / phase / freshness / outcome are increasingly local to pair history; volume is the most "current snapshot" of pair behavior. Putting it last keeps the chain semantically ordered macro → pair-history → pair-current.
- **Order does not affect arithmetic** (multiplication commutative + same clamp). Order DOES affect counterfactual ablation interpretation when reading the metadata fields, so we'll document the chain explicitly in System Manual on close.

**A.3.1** vts-runner emit hook updates `openTrade.regimeConfidenceModulated` to reflect the **5-modulator** chain. Active-path orchestrator continues to compute the chain for B68.2 ablation metadata; per-trade persist hook still deferred to B67.5.

### A.4 Ablation row shape

```jsonb
{
  "factor_name": "b68_2_volume_regime",
  "factor_state": "alternate_disabled",
  "alternate_decision": {
    "regime_label": "<regime>",
    "confidence": <confidence_without_volume_factor>,
    "admission_possible": true,
    "metadata": {
      "volume_regime_score": <-1..+1>,
      "volume_regime_factor": <factor>,
      "confidence_with_factor": <real>,
      "confidence_without_factor": <real / factor>,
      "lookback_bars": <N>,
      "sample_count": <bars actually available>,
      "cold_start": <bool>,
      "regime_at_eval": "<regime label>"
    }
  }
}
```

**Confidence-counterfactual semantic** mirrors B67.4 (divide-out approximation). Same documented limitation as the existing chain factors.

### A.5 Tests

3 new test cases minimum:
- `b68-2-volume-regime.test.ts` covering: score math (pure-up, pure-down, balanced, zero-volume), factor clamps, cold-start floor, monotonicity.
- Augmented modulation-chain integration test verifying the 5-modulator clamp behavior on extreme stack.
- (Optional) Symbol-isolated test confirming volume regime score per pair doesn't leak across pairs.

### A.6 Module constants — 7 new in `volume_regime` module

| Constant | Seed | Purpose |
|---|---|---|
| `b68_2_lookback_bars` | 30 | Number of recent OHLC bars for the score computation |
| `b68_2_accumulation_threshold` | 0.40 | Score above which metadata flags `regime_volume = 'ACCUMULATION'` (informational only — does NOT affect factor math, used for log lines + metadata) |
| `b68_2_distribution_threshold` | -0.40 | Score below which metadata flags `regime_volume = 'DISTRIBUTION'` |
| `b68_2_factor_min` | 0.92 | Lower clamp |
| `b68_2_factor_max` | 1.05 | Upper clamp |
| `b68_2_sensitivity` | 0.05 | Slope of factor vs score |
| `b68_2_min_samples` | 30 | Cold-start floor (matches lookback — score is meaningless below lookback bars) |

### A.7 Observability

- `[B68.2][volume] pair=X score=Y factor=Z label=<accum|dist|neutral>` emitted on first signal-eval per pair per cycle (suppressed on stable label across consecutive cycles to avoid log spam — same pattern as B67.2 phase transitions).
- B68.2 ablation row count visible in dashboard per-factor breakdown (UI auto-extends).
- Factor Calibration UI panel automatically picks up the new `b68_2_volume_regime` row in the tertile WR + predictive lift section once data accumulates past the n=150-per-bucket gate per Langston cc-inbox #856.

---

## §B. Open design questions for Langston (Step 1 review)

1. **Score formula choice**: I proposed signed-volume / total-volume sum over rolling N bars. Alternative: rolling Chaikin Money Flow (`((close − low) − (high − close)) / (high − low) × volume`, summed over N, divided by SUM(volume)). Chaikin uses intra-bar position too which can capture wick-heavy distribution. Trade-off: more sensitive but adds an `(high − low) → 0` divide-zero edge case. **My pick: signed-volume (simpler) for v1; CMF as a v2 calibration follow-up if signed-volume's predictive lift underperforms.**

2. **Lookback N=30**: with 1m candles → 30 minutes; with 15m candles → 7.5h. The classifier currently uses 30-period lookback for momentum (HF7 in market-regime.ts). Consistency argument says match. Alternative: separate volume-regime lookback (longer, e.g., 60 bars) since accumulation/distribution is a slower process than momentum. Lean?

3. **Volume regime store / persistence**: B62/B63's directional-bias-store warms up over restart and persists to `/tmp`. Volume score is a pure function over recent OHLC — no warmup needed if we have ≥ 30 bars in cache. **Proposal: skip the store for v1.** OHLC cache already provides 30+ bars via `ohlcCache.getOHLCData(symbol, 60)`. If signal flicker on cold-pair entry becomes a problem in calibration, add the store in v2.

4. **Sensitivity 0.05**: with score range [−1, +1] this gives raw range [0.95, 1.05]. Clamps engage only at score=−1.6 (impossible, score is bounded). So clamps are essentially decorative at seed values. Want me to widen sensitivity to 0.10 (range [0.90, 1.10] → clamps engage near ±1) or keep narrow band per "small adjustments compound" doctrine?

5. **Asymmetry of metadata thresholds (±0.40)**: my proposal has symmetric +/−0.40 for ACCUMULATION/DISTRIBUTION labels in metadata. Some literature suggests distribution shows up earlier in price action than accumulation (sellers more decisive than accumulators). Want asymmetric thresholds (+0.30 / −0.50)?

6. **Anything missing or wrongly scoped?**

---

## §C. Risks + Mitigations

**R1: Volume regime adds another multiplier to an already 5-stage chain.** Compounded penalty stack: `0.85 × 0.85 × 0.92 × 0.85 × 0.92 = 0.521` (below pre-B67 0.4 floor). Same pre-B67.5 post-composition-floor pre-registration concern flagged in B67.4 §R3 — **must be defined before B67.5 wiring**, not before B68.2 ship. B68.2 modulates `regime_confidence_modulated` which is still decorative pre-B67.5. Mitigation: documentation in System Manual + persistent reminder in MEMORY for B67.5 scope.

**R2: Volume on Kraken can spike on liquidations.** A single liquidation candle has 5-10× normal volume. With score weighted by raw volume, one liquidation candle can dominate the rolling sum and pin the score near 0 (because liquidations happen on both up and down sides). Mitigation: this is informational only at calibration window — the ablation framework will surface whether volume regime predicts WR even with liquidation noise. If signal-to-noise is bad, calibration check fails → recalibrate score formula in v2 (volume capping, log scaling, or volume-percentile rather than raw sums).

**R3: Score interpretation may be regime-dependent.** Accumulation in TFS = continuation; accumulation in HVU = climactic top. v1 ships regime-agnostic per A.3 to keep scope tight. Calibration data will reveal whether per-regime sensitivity is needed. Tracked as v2 follow-up.

**R4: New lever expands ablation row volume by ~14% per cycle** (one new factor type per signal eval). Current per-cycle volume from B67.4 closure: 7 factor types × ~110 evals = ~770 rows. Adding B68.2: ~880 rows. Trivial at VTS scale (per master plan §0.10.F retention policy + 90-day sweep cron).

**R5: signed-volume on illiquid pairs may produce noisy scores.** Pairs with sparse volume (single trade per minute) could swing wildly between +1 and −1 on small price oscillations. Mitigation: existing FX5 minimum-volume gate filters most of these out before VTS scans them. If a few slip through, calibration will show wide variance on the volume_regime tertile WR for those pairs — informational, not blocking.

**R6: Cold-start factor=1.0 same-as-cold-start contamination risk.** With a 30-bar floor on a 60-second OHLC cache TTL, a fresh pair may take a few cycles to accumulate enough samples. During cold-start, factor=1.0 (no modulation). Mitigation: existing pattern from B67.4 / B68.4 — cold-start metadata flag visible in ablation row's `cold_start: true`; calibration check should filter cold-start-contaminated rows for the actual decision-grade analysis.

---

## §D. Out of Scope

- **Per-regime sensitivity tuning** — v1 ships regime-agnostic. Per-regime sensitivity calibrated in v2 if calibration data shows it's needed.
- **Volume-profile distribution / VPVR** — totally separate architecture (price-level volume buckets); useful for support/resistance detection. Out of scope; future batch.
- **Cross-pair volume comparison** — relative volume normalization (this pair vs universe avg) deferred to B68.3 or later.
- **Active-trading per-trade persist hook** — same deferral as B67.4 (active trading off; chain captured in ablation metadata only).
- **Liquidation-aware volume capping** — v2 follow-up if R2 evidence shows it's needed.
- **CMF vs OBV vs signed-volume formula comparison** — v1 picks one (signed-volume per §B.1); v2 iterates if calibration says otherwise.

---

## §E. Verification Criteria (Step 11 closure)

- [ ] `regime_factor_alternates.factor_name = 'b68_2_volume_regime'` rows appearing within 1h post-deploy (n > 0 in 1-hour window)
- [ ] `[B68.2][volume]` log lines appearing in PM2 logs within 1h
- [ ] Score distribution non-degenerate: at least two of {ACCUMULATION, DISTRIBUTION, neutral} represented across pairs in first hour
- [ ] No `[B68.2]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column on closed VTS trades reflects 5-multiplier chain (variance increased vs pre-B68.2 4-multiplier baseline)
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.2 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B sequence marker, this scope file → APPROVED
- [ ] Tier 2 governance: SIM (new component) + CHANGES_AND_FIXES (one entry) + RUNNING_ISSUES (calibration window observation entry)

---

## §F. Module-Constants Migration

```sql
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('volume_regime', '*', '*', '*', '*', 'b68_2_lookback_bars',           '30'::jsonb,    'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_accumulation_threshold',  '0.40'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_distribution_threshold', '-0.40'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_factor_min',              '0.92'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_factor_max',              '1.05'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_sensitivity',             '0.05'::jsonb,  'b68.2-volume-regime'),
  ('volume_regime', '*', '*', '*', '*', 'b68_2_min_samples',             '30'::jsonb,    'b68.2-volume-regime')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();
```

---

## §G. Workflow position

Step 1 of 11. After Langston review + sign-off:

- **Step 2 — Pre-implementation audit.** Will consult SYSTEM_IMPACT_MAP for affected components (signal-orchestrator, vts-runner, MCE, market-regime types, regime-phase, factor-ablation-emitter). Map upstream/downstream/blast.
- **Step 3 — Implementation.** Mirror B67.4's file-by-file approach.
- **Steps 4-11** — Code review, push, CI, deploy, verify, governance, completion.

Estimated effort: ~1 week per master plan §5.4 #4.

---

*End of B68.2 Step 1 scope. Awaiting Langston review.*
