# BATCH 68.1 — Multi-Timeframe Agreement as Confidence Dimension

**Owner:** Kyle (decisions), Claude Code (implementation), Langston (review)
**Date opened:** 2026-05-03
**Status:** Step 1 — APPROVED by Langston (cc-inbox #887, 2026-05-03). Refinement D.1 incorporated. Proceeding to Step 2.
**Parent program:** Phase 15c — B67/B68 Regime-Confidence Overhaul
**Predecessor:** B67.5-prep SHIPPED 2026-05-03 (PM2 #130). Three calibration windows running (B67.4 / B68.2 / B68.3).
**Successor:** B67.5 consumer wiring (gated on calibration check 2026-05-15) → B69 ML-light.
**Window dependency:** B68.1 ships into the running B67.4 + B68.2 + B68.3 calibration windows. Per master plan §0.11.C step 5, ablation framework attributes per-factor independently — B68.1's `b68_1_multi_tf_agreement` row type is observed against trades in the 14 days following B68.1 deploy (its own mini-window). 7th and final B68.x chain modulator.

---

## Why this lever exists (master plan §5.4 #3 + §0.10.G + §0.11.B)

> "Multi-timeframe agreement | 3-5pp on trend-rider signals | ~1 week (after B67) | Blocked by B67 because it requires higher-TF OHLC. 1h regime as confirming filter on 1m signals." (§5.4 row 3)

> "Multi-TF agreement (5m sign matches 1h sign) catches this directly when the lower TF reverses while the higher TF is still positive." (§0.10.G — Path B four-case prediction)

> "B68.1 — Multi-timeframe agreement | 1h regime confirming 1m signals. Higher-TF OHLC pipeline. ~2 weeks. Own batch. Needs new higher-TF OHLC data path — real new infrastructure." (§0.11.B)

The current regime classifier reads a single timeframe. The B67/B68 chain has now added macro context (B67.1), phase (B67.2), freshness (B68.4), outcome feedback (B67.4), Path B sustainability (B68.5), volume regime (B68.2), and pair-correlation idiosyncrasy (B68.3). What's still missing: **whether the regime classification holds when viewed from a slower timeframe, or is local-window noise that the higher TF doesn't confirm.**

The dominant 04-22 hostile-day failure mode (per §0.10.G) was *"DBS ≥ 0.30 from a recent move, but the move was already exhausted."* B67.2 phase + B68.5 DBS slope partially address this by detecting LATE-phase admission and decaying-DBS admission. **B68.1 closes the remaining gap** by checking whether the higher-timeframe regime confirms the lower-timeframe regime — a pair classified TFS at the active TF that is RBS or HVU at the higher TF has a much weaker trend-rider thesis than one with TFS-on-TFS agreement.

**Architecture mirrors B67.4 / B68.2 / B68.4 / B68.3 pattern** — pure-function chain modulator, MCE-orchestrated config refresh, ablation row per signal evaluation.

---

## §A. Numbered Objectives

### A.1 Active timeframe + higher timeframe definitions

The live regime classification path operates on **60-min (1h) candles** — confirmed by `ohlcCache.getOHLCData(symbol, 60)` calls in `signal-orchestrator.ts:1201,1309` and `vts-runner.ts:666`. We treat **1h as the ACTIVE TF** for B68.1 purposes (the TF whose regime decisions need confirming).

The **HIGHER TF is 240-min (4h) candles**. Rationale:
- Kraken native OHLC supports interval `240` directly — **no aggregation infrastructure needed**, no B74 DB query path required at signal-eval time. The existing `ohlcCache` accepts any Kraken-supported interval as a cache key (`${symbol}_${interval}`).
- 4h is one full "regime step up" from 1h — enough separation to materially differ from 1h, not so wide that the higher TF is stale relative to the trade horizon (which is hours-to-days).
- ~177 pairs × 240-min cache fetch every 5min TTL = trivial Kraken API + memory cost (each cached series is ~720 candles × 80 bytes = 60KB; 177 pairs = ~10MB total).

This **simplifies the master plan §0.11.B characterization** ("Needs new higher-TF OHLC data path — real new infrastructure") — Kraken already serves 4h candles and `ohlcCache` already supports them. **Open Q B.1 for Langston: confirm 4h vs alternative (1d / 30min as faster).**

### A.2 Higher-TF regime computation

For each pair eval, compute a **second `calculatePairRegime` call** using the 4h OHLC series. We reuse the existing classifier function unchanged — no new regime logic, just fed a different candle series. Inputs:

```
higherTfRegime = calculatePairRegime(
  higherTfOhlc,         // 240-min candles from ohlcCache.getOHLCData(symbol, 240)
  higherTfDbsScore,     // see A.2.1
  higherTfDbsSlope,     // see A.2.1
  1.0,                  // macroModifier — no compounding (macro applied once at active TF)
  regimeConfig          // same config (TFS desat min/max, etc. — semantic match)
)
```

**A.2.1 Higher-TF DBS handling.** DBS is a B62 metric requiring its own state. Computing 4h DBS from 4h OHLC requires non-trivial wiring into the DBS calculator. **For v1, we pass `higherTfDbsScore=0` and `higherTfDbsSlope=0`**, which means the higher-TF classifier uses Path A (mom + ADX) only — Path B (DBS-driven) is disabled at the higher TF. This is acceptable because:
- The higher TF's role is regime-LABEL confirmation, not its own decision authority.
- 4h Path A (mom + ADX over 30 candles = 5 days of price action) is a strong directional trend detector by itself.
- v2 follow-up: optionally wire 4h DBS once we observe whether v1 label agreement is sufficient signal.

**Open Q B.2 for Langston: confirm higher-TF DBS=0 acceptable for v1, or require 4h DBS pipeline in this batch.**

**A.2.2 Cold-start.** When higher-TF OHLC has fewer than `b68_1_min_higher_tf_samples` (default 30 = 5 days of 4h) bars: return `agreementScore=0`, `factor=1.0`, `coldStart=true`, `label=COLD_START`. Higher-TF cache cold-starts are inevitable for newly-listed pairs.

### A.3 Agreement scoring

Three-state classification:

```
if (higherTfRegime.regime === activeTfRegime) {
  agreement = 'CONFIRMED';
  agreementScore = 1.0;
} else if (sameDirectionalFamily(higherTfRegime.regime, activeTfRegime)) {
  agreement = 'COMPATIBLE';
  agreementScore = 0.5;
} else {
  agreement = 'CONFLICTED';
  agreementScore = 0.0;
}
```

Where `sameDirectionalFamily` groups regimes by directional intent:
- **Directional family**: `TREND_FRIENDLY_STABLE`, `IMPULSE_EXPANSION` (both express directional movement)
- **Range family**: `RANGE_BOUND_STABLE` (no directional intent)
- **Volatile family**: `HIGH_VOLATILITY_UNSTABLE` (directional but unstable)
- **Transition family**: `STRUCTURAL_TRANSITION` (uncertain — pairs with anything as COMPATIBLE)

So TFS-at-1h paired with IE-at-4h is COMPATIBLE (both directional) but not CONFIRMED. TFS-at-1h paired with RBS-at-4h is CONFLICTED. ST is universally COMPATIBLE because it's "I don't know" — never escalates to CONFLICTED, never qualifies as CONFIRMED.

**A.3.1 Family map sourced from `module_constants` or hardcoded?** Family grouping is **logic, not a tunable threshold** — proposed to live in the source as a constant map (parallels how `REGIMES` itself lives in `canonical-regime-strategy-map.ts`). **Open Q B.3 for Langston: confirm family map in source vs DB.**

### A.4 Confidence factor mapping

```
factor = clamp(b68_1_factor_min, b68_1_factor_max, 1.0 + (agreementScore - 0.5) × b68_1_sensitivity × 2)
```

Translated for the three states:
- CONFIRMED (score 1.0) → raw `1.0 + 0.5 × sens × 2 = 1.0 + sens`
- COMPATIBLE (score 0.5) → raw `1.0 + 0 = 1.0`
- CONFLICTED (score 0.0) → raw `1.0 - sens`

Seed values:
- `b68_1_factor_min = 0.92` (CONFLICTED penalty floor)
- `b68_1_factor_max = 1.05` (CONFIRMED boost ceiling)
- `b68_1_sensitivity = 0.05` → CONFIRMED → 1.05, COMPATIBLE → 1.00, CONFLICTED → 0.95

**Symmetric range [0.92, 1.05]** — wider penalty than B68.3 because conflicted higher-TF is a stronger negative signal than just-correlated-to-BTC. Penalty floor (0.92) leaves headroom below CONFLICTED's 0.95 raw output for future calibration to widen the penalty if data warrants.

**A.4.1** Cold-start (sample_count < min_samples) returns factor=1.0 + coldStart=true.

**A.4.2** All clamp bounds + sensitivity from `module_constants`. No hardcoded constants per Kyle's §0.9 directive.

### A.5 Modulation chain integration

After this batch, the chain becomes (the **7th and final B68.x chain modulator**, completing the chain per master plan §0.11.B):

```
raw × macro × phase_weight × freshness × outcome × volume_regime × pair_correlation
    × multi_tf_agreement → clamp [b67_5_post_composition_floor (0.45), 1.0]
```

Order: `multi_tf_agreement` goes LAST. Rationale: it's the most "structural" signal (slow-changing, slow-moving over 4h windows), so it modulates the result of all the faster, more-immediate signals already in the chain. Parallels how pair_correlation followed volume_regime in B68.3.

**A.5.1** vts-runner emit hook updates `openTrade.regimeConfidenceModulated` to reflect the **7-modulator** chain. Active-path orchestrator continues to compute the chain for B68.1 ablation metadata; per-trade persist hook still deferred to B67.5 (carries with B68.2 / B68.5 / B68.3 deferrals).

### A.6 Ablation row shape

```jsonb
{
  "factor_name": "b68_1_multi_tf_agreement",
  "factor_state": "alternate_disabled",
  "alternate_decision": {
    "regime_label": "<active_tf_regime>",
    "confidence": <confidence_without_multi_tf_factor>,
    "admission_possible": true,
    "metadata": {
      "active_tf_regime": "<TFS|HVU|RBS|IE|ST>",
      "higher_tf_regime": "<TFS|HVU|RBS|IE|ST|null_when_cold>",
      "higher_tf_interval_minutes": 240,
      "higher_tf_sample_count": <bars actually available>,
      "agreement": "CONFIRMED | COMPATIBLE | CONFLICTED | COLD_START",
      "agreement_score": <0.0 | 0.5 | 1.0>,
      "multi_tf_factor": <factor>,
      "confidence_with_factor": <real>,
      "confidence_without_factor": <real / factor>,
      "cold_start": <bool>,
      "higher_tf_volatility": <number>,
      "higher_tf_momentum": <number>,
      "higher_tf_adx": <number>,
      "higher_tf_confidence": <number>,
      "higher_tf_dbs_score": 0,
      "higher_tf_dbs_slope": 0
    }
  }
}
```

Counterfactual semantic mirrors B68.2 / B68.3 (divide-out approximation). Same documented limitation as the existing chain factors.

### A.7 Tests

12+ cases minimum:
- CONFIRMED — TFS at 1h + TFS at 4h → factor = 1.05
- CONFIRMED — RBS at 1h + RBS at 4h → factor = 1.05
- COMPATIBLE — TFS at 1h + IE at 4h (both directional family) → factor = 1.00
- COMPATIBLE — TFS at 1h + ST at 4h (ST is universal-compatible) → factor = 1.00
- CONFLICTED — TFS at 1h + RBS at 4h → factor = 0.95
- CONFLICTED — TFS at 1h + HVU at 4h → factor = 0.95
- Cold-start: higher-TF OHLC < min_samples → factor = 1.0
- Cold-start: higher-TF OHLC missing entirely (cache cold-start) → factor = 1.0
- Family map: every regime maps to exactly one family, ST maps to "transition" with universal-compatible behavior
- Counterfactual divide-out preserves identity (`confidence / factor × factor === confidence` within rounding)
- Factor clamps engage when sensitivity widened
- Higher-TF regime uses Path A only (DBS=0 verified — Path A still classifies meaningfully on 4h)

### A.8 Module constants — 8 in new `multi_tf_agreement` module

| Constant | Seed | Purpose |
|---|---|---|
| `b68_1_higher_tf_interval_minutes` | 240 | Kraken interval for higher TF (60→4h step up) |
| `b68_1_min_higher_tf_samples` | 30 | Cold-start floor — 30 × 4h = 5 days |
| `b68_1_factor_min` | 0.92 | Lower clamp (CONFLICTED penalty floor) |
| `b68_1_factor_max` | 1.05 | Upper clamp (CONFIRMED boost ceiling) |
| `b68_1_sensitivity` | 0.05 | Slope of factor vs (agreementScore - 0.5) |
| `b68_1_compatible_score` | 0.5 | Score when families match but labels differ |
| `b68_1_confirmed_score` | 1.0 | Score when labels match exactly |
| `b68_1_conflicted_score` | 0.0 | Score when families conflict |

(The 3 *_score constants exist primarily for ablation experimentation — e.g., setting compatible_score=1.0 collapses to a binary CONFIRMED/CONFLICTED gate. Default values produce the three-state behavior described above.)

### A.9 Observability

- `[B68.1][multi-tf] pair=X active=<reg> higher=<reg> agree=<state> factor=F` emitted on first signal-eval per pair per cycle.
- B68.1 ablation row count visible in dashboard per-factor breakdown (UI auto-extends — no UI changes needed; the Factor Calibration table queries `factor_name` distinct values dynamically).
- Factor Calibration UI panel automatically picks up the new row type once n ≥ 150 per bucket.
- New 4h cache-key memory growth visible in OHLCCache logs (`[OHLCCache] Initialized` count).

---

## §B. Open design questions for Langston (Step 1 review)

1. **Higher-TF interval = 240 min (4h)?** Alternatives: 1440 (1d, slower confirmation but very slow-changing) or 30 (faster, but "higher TF" loses its meaning). Lean 240 — it's one regime-step above the 60-min active TF and Kraken serves it natively.

2. **Higher-TF DBS = 0 for v1?** Path A (mom + ADX) sufficient for the higher-TF classifier in v1. Wiring 4h DBS would require a parallel B62 DBS pipeline at 4h, which is heavier than the rest of B68.1 combined. Lean v1 accept Path A only; v2 can add 4h DBS if calibration shows the agreement signal is too noisy without it.

3. **Family map in source vs `module_constants`?** Family grouping is a logic mapping (5 regimes → 4 families), not a tunable. Proposed to live in source as a const next to `REGIMES`. Lean source.

4. **Symmetric factor range [0.92, 1.05]?** Slight asymmetry: penalty floor 0.92 is wider than boost ceiling +0.05. Rationale: confirmed higher-TF is a small confidence boost; conflicted higher-TF is a stronger negative signal because trends should be visible at multiple TFs. Lean asymmetric.

5. **Order in chain (last vs second-to-last)?** Proposed last because slowest-changing and most structural. Alternative: second-to-last with pair_correlation last (pair_correlation is also "snapshot-ish"). Lean last.

6. **Is "regime label agreement" the right measurement, or should we use something quantitative like DBS sign match?** Master plan §0.10.G mentioned "5m sign matches 1h sign" — DBS-sign-based. Label-agreement is broader (uses the full classifier output) but coarser. Lean label-agreement v1 because it leverages the full B62 + B67.3.5 classifier work; sign-match-only is a smaller signal. v2 can layer DBS-sign as a secondary check if label-agreement is too noisy.

7. **BTC universal reference applicability?** Unlike B68.3 which needs ONE BTC reference, B68.1 is per-pair (each pair has its own higher-TF series). No universal reference needed. Confirmed.

8. **Anything missing or wrongly scoped?**

---

## §C. Risks + Mitigations

**R1: 7-multiplier chain compound penalty stack.** Worst case after B68.1 is `0.85 × 0.85 × 0.92 × 0.85 × 0.92 × 0.95 × 0.92 ≈ 0.419` — still above the new 0.45 floor by a hair, meaning the floor will engage in compound-worst-case scenarios. **This is exactly why B67.5-prep raised the floor from 0.40 to 0.45 in advance.** The floor engaging means the chain is now constraint-binding, which is observational signal in itself (logged in ablation metadata). Non-blocking — observational only pre-B67.5.

**R2: Higher-TF cache cold-start on newly-listed pairs.** A pair listed today has no 4h history; cold-start path returns factor=1.0 + coldStart=true. ~5 days to warm up to min_samples. Acceptable — B68.4 freshness factor already handles per-pair freshness independently. Calibration cohort can filter cold-start rows.

**R3: Kraken API load increase from 4h cache fetches.** Adds one cache key per pair. 5min TTL ⇒ 12 fetches/hr/pair × 177 pairs = 2,124 additional Kraken calls/hr. Within Kraken's tier-2 rate limits (we operate well below). Same TTL as 1h cache keeps load symmetric.

**R4: Higher-TF Path-A-only classification may misclassify pairs with strong DBS but weak mom/ADX.** Pairs in DBS-driven directional moves at 4h would land in ST (transition) under Path A only. ST is universally COMPATIBLE so we never falsely CONFLICTED-flag a real higher-TF directional pair. Worst case: factor=1.00 instead of 1.05 (missed boost), not factor=0.95 (false penalty). v2 4h DBS upgrade would lift these into proper TFS classification.

**R5: 4h candle close timing creates "stale higher TF" windows.** Between 4h candle closes, the higher-TF series doesn't update. Cache TTL 5min keeps the latest closed candle fresh; the in-progress 4h candle is reflected in the most recent series element via Kraken's API behavior (returns the partial current candle as the last element). Standard treatment — same as 1h.

**R6: COMPATIBLE state does no modulation (factor=1.0), making it identical to cold-start in confidence terms.** Agreed and intentional — the LABEL semantic difference (`COMPATIBLE` vs `COLD_START`) preserves the calibration cohort segmentation even when the factor itself is identical. Ablation row metadata distinguishes them clearly.

**R7: "Higher-TF agreement" is conceptually correlated with B68.5 Path B sustainability** (both check whether a recent move has structural support beyond the immediate). Risk: chain double-counts. Mitigation: ablation framework attributes them as separate factors over the same trades — calibration data will reveal whether the marginal signal of B68.1 ON TOP of B68.5 is meaningful. If correlation is too tight, post-window analysis can recommend dropping one or merging.

---

## §D. Out of Scope

- **4h DBS pipeline** — v1 ships higher-TF Path A only. v2 follow-up if calibration shows label-agreement is too noisy.
- **Triple-TF agreement** (e.g., 1h + 4h + 1d) — v1 ships dual-TF only. v2 follow-up.
- **DB-archive higher-TF aggregation** — the B74 crypto_spot_ohlc_1m archive is NOT a runtime dependency for B68.1. Higher-TF source is Kraken native 240-min via existing `ohlcCache`. (B74 archive remains the long-term canonical OHLC store for backtesting and future ML training.)
- **Active-trading per-trade persist hook** — same deferral as B67.4 / B68.2 / B68.5 / B68.3 (active trading off; chain in ablation metadata only).
- **DBS-sign matching as the agreement primitive** — v1 uses regime-label agreement; v2 may layer DBS-sign as a secondary factor.
- **Per-quote-currency higher-TF reference** — not applicable; per-pair higher-TF is the same pair.

---

## §D-refinements (Langston cc-inbox #887)

**REFINEMENT D.1 — explicit zero higher-TF DBS fields in ablation metadata.** Even though v1 hardcodes `higher_tf_dbs_score=0` and `higher_tf_dbs_slope=0`, both fields are emitted in the ablation row metadata (per A.6 above). When v2 wires 4h DBS, the metadata schema is unchanged — the values just stop being zero. Zero cost now, no schema migration later.

---

## §E. Verification Criteria (Step 11 closure)

- [ ] `regime_factor_alternates.factor_name = 'b68_1_multi_tf_agreement'` rows appearing within 1h post-deploy
- [ ] `[B68.1][multi-tf]` log lines appearing in PM2 logs within 1h
- [ ] Distribution non-degenerate: at least two of {CONFIRMED, COMPATIBLE, CONFLICTED} represented across pairs in first hour
- [ ] No `[B68.1]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column on closed VTS trades reflects 7-multiplier chain (variance vs pre-B68.1 6-multiplier baseline)
- [ ] OHLC cache shows new 240-min cache keys populated for active universe within first cycle (cache logs)
- [ ] Factor Calibration UI panel rendering `b68_1_multi_tf_agreement` rows once n ≥ 150 per bucket (auto via dynamic factor_name extraction)
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable per RUNNING_ISSUES #39)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.1 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B sequence marker, this scope file → APPROVED, BATCH_68_PROGRESS_REPORT B68.1 closure section appended
- [ ] Tier 2 governance: SIM (new component + ohlc-cache key expansion + chain extension), RUNNING_ISSUES (calibration window observation entry — own ID), CHANGES_AND_FIXES (B68.1 entry)

---

## §F. Module-Constants Migration

```sql
INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by) VALUES
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_higher_tf_interval_minutes', '240'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_min_higher_tf_samples',      '30'::jsonb,   'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_factor_min',                 '0.92'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_factor_max',                 '1.05'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_sensitivity',                '0.05'::jsonb, 'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_compatible_score',           '0.5'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_confirmed_score',            '1.0'::jsonb,  'b68.1-multi-tf-agreement'),
  ('multi_tf_agreement', '*', '*', '*', '*', 'b68_1_conflicted_score',           '0.0'::jsonb,  'b68.1-multi-tf-agreement')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name)
DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = NOW();
```

Plus standard rollback companion file.

---

## §G. Architectural footprint (preview for Step 2 pre-audit)

| File | Change |
|---|---|
| `server/core/metrics/multi-tf-agreement.ts` | NEW — pure functions `computeMultiTfAgreement`, `buildB68_1Alternate`, family map, config interface |
| `server/services/market-context-engine.ts` | NEW 9th refresh sub-method `refreshMultiTfAgreementConfig()` + included in `Promise.all` |
| `server/services/signal-orchestrator.ts` | Higher-TF cache fetch + `computeMultiTfAgreement` call + emit hook for ablation row |
| `server/services/vts-runner.ts` | Same hook in VTS path |
| `server/types/market-regime.types.ts` | (Possibly) — only if we surface the family enum publicly. Likely not. |
| `drizzle/migrations/2026-05-XX-b68-1-multi-tf-agreement.sql` + rollback | Module-constants seed |
| `server/tests/unit/b68-1-multi-tf-agreement.test.ts` | NEW — 12+ unit cases per A.7 |

Estimated effort: **~1 week implementation + ~1 day governance** (lighter than the master plan's 2-week estimate because we avoid the DB-archive aggregation path that drove that estimate).

---

## §H. Workflow position

Step 1 of 11. After Langston review + sign-off:
- Step 2 — Pre-implementation audit (SIM consultation for multi-tf-agreement.ts, MCE, signal-orchestrator, vts-runner, ohlc-cache, market-regime classifier reuse).
- Step 3 — Implementation.
- Steps 4-11 — Code review, push, CI, deploy, verify, governance, completion.

---

*End of B68.1 Step 1 scope. Awaiting Langston review.*
