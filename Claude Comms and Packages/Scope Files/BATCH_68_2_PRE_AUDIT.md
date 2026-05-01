# BATCH 68.2 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_68_2_SCOPE.md` (commit `053fa90a` + §D.1 refinement)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** Drafted, awaiting Langston Step-2 review

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

Per CLAUDE.md §9: every component the batch touches gets upstream/downstream/shared-state/background-execution/blast-radius analysis. **B68.2 is LOWER blast radius than B67.4** because: no classifier formula change, no new persistent state, no new trade-close hooks, no `calculatePairRegime` signature change. Pure additive — one new chain multiplier + one new ablation row type.

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | Volume regime computation | `server/core/metrics/volume-regime.ts` (NEW) | Pure-function score + factor + ablation builder. No state. | LOW (new isolated module) |
| 2 | MCE 7th refresh sub-method | `server/services/market-context-engine.ts` | Add `refreshVolumeRegimeConfig()` to the 6-method orchestrator (becomes 7-method); add `volumeRegimeConfig` private field + `getCurrentVolumeRegimeConfig()` accessor. No threading into `calculatePairRegime` (volume is chain-only, not classifier-input). | MEDIUM — orchestrator is critical infra; same try/catch fault tolerance pattern from B67.4 §D.4. |
| 3 | Signal-orchestrator emit hook | `server/services/signal-orchestrator.ts` (line ~770 active hook) | Push `b68_2_volume_regime` ablation row + apply factor in chain. Mirror exact pattern of B67.4's outcome feedback hook. | MEDIUM — every signal evaluated in active path. Pre-B67.5 active trading is OFF, so behavior change is observational only. |
| 4 | VTS-runner emit hook | `server/services/vts-runner.ts` (line ~1480) | Same pattern as orchestrator, plus update `openTrade.regimeConfidenceModulated` to reflect 5-modulator chain (was 4 in B67.4). | MEDIUM — every VTS signal. Persisted column reflects extended chain. |
| 5 | Module constants | `module_constants` table | Add 7 new keys in `volume_regime` module (additive, no schema change). | LOW. |
| 6 | Tests | `server/tests/unit/b68-2-volume-regime.test.ts` (NEW) | Pure-function tests (score math, clamps, cold-start, monotonicity) + liquidation-spike detection. | NONE. |

**Upstream feeders unchanged:**
- OHLC cache (`ohlcCache.getOHLCData`) — already provides 30+ bars; volume field on each OHLCData is already populated by the FX5 pipeline
- B67.1 macro modifier — unchanged
- B67.2 phase weights — unchanged
- B67.3.5 RegimeConfig — unchanged
- B67.4 OutcomeFeedbackStore — unchanged
- B68.4 regime age accessor — unchanged
- B68.5 Path B classifier gate — unchanged

**Downstream consumers — IMPACTED:**
- `applyPhasePreference` — receives modulated confidence; output unchanged. No interaction with volume.
- B67.0 ablation framework emitter — receives ONE new factor type in alternates array; emitter is generic, accepts any JSONB shape per factor.
- `paper_sim_trades.regime_confidence_modulated` column — reflects 5-multiplier chain (was 4). Other columns unchanged.
- `replay-ablation.ts` — generic; processes `b68_2_volume_regime` rows alongside the existing 7 factor types. Same `replay_completed_at` flag mechanic. No code change needed in replay job.
- `computeFactorCalibration()` aggregator (drift-dashboard-aggregator.ts) — generic; will surface `b68_2_volume_regime` automatically once n ≥ 150 per bucket per Langston cc-inbox #856. No code change needed.
- `FactorCalibrationSection` UI — same generic auto-extension as for B67.4 / B68.4 / B68.5.
- B67.5 future consumer wiring — will read more meaningful (one more dimension of) confidence post-calibration. Volume regime sits in the chain alongside the other factors.

**Shared state:**
- No new persistent state. Pure-function score over OHLC cache.
- `module_constants` — 7 new rows, no schema change.

**Background execution:**
- No new timers / intervals.
- MCE refresh adds 7 more constant resolutions to the per-cycle cache (negligible).
- Score computation is on the per-eval hot path (signal-orchestrator + vts-runner emit hooks). Cost: one O(N) reduce over 30 bars per signal eval. Trivial vs. existing classifier work.

### §A.2 System Manual sections to update on close

- Modulation chain ordering: `raw × macro × phase_weight × freshness × outcome × **volume_regime** → clamp [0.4, 1.0]` (one new term appended; rationale per scope §A.3).
- New §"Volume Regime (B68.2)": score formula, factor mapping, liquidation-spike metadata flag (Langston §D.1).
- B68.2 ablation row shape (extends the ablation row catalog).
- Calibration-window note: B68.2's 14d mini-window starts at deploy; runs in parallel with B67.4's window (separate factor row type).

### §A.3 Cascade risk check

Reviewed each downstream consumer for SIM-style failure modes:

| Risk | Verdict | Mitigation |
|---|---|---|
| 5-modulator chain compound extreme drops below pre-B67 0.4 floor | Worst-case stack: `0.85 × 0.85 × 0.92 × 0.85 × 0.92 × 0.92 ≈ 0.479` per Langston O.1 (cc-inbox #880) — still above 0.4 but tight. | **Pre-registered for B67.5** — must define post-composition floor before consumer wiring. Logged in MEMORY + System Manual as a deferred concern. Non-blocking for B68.2. |
| Score formula degenerate on illiquid pairs (sparse volume → wild swings ±1) | Possible. FX5 minimum-volume gate filters most out. Stragglers will surface in calibration tertile WR variance. | Calibration data segments will reveal — `has_liquidation_spike` metadata flag + low `sample_count` flag will surface contaminated cohorts cleanly. Per Langston §D.1. |
| MCE 7th sub-method failure cascades | If `refreshVolumeRegimeConfig()` throws on first refresh, the new try/catch wrapper from B67.4 hotfix #2 logs + retries. `firstRefreshPending` stays true → orchestrator reattempts on next 60s tick. No unhandled rejection. | Inherits B67.4's fix. Validated in CI on B67.4 hotfix #2 (commit `f5fe7e71`). |
| Ablation row volume up ~14% per cycle (8 factor types vs 7) | ~880 rows/cycle → ~1000 rows/cycle. Trivial at VTS scale; 90-day retention sweep already in `replay-ablation.ts`. | No mitigation needed. |
| Volume liquidation-spike contamination | R2 from scope. Detected via `has_liquidation_spike` flag in metadata; calibration will show whether spike-contaminated cohorts have meaningfully different lift than clean cohorts. If yes → v2 capping. | Observational only at v1. Per Langston §D.1. |

**Net:** the only behavioral risk is volume regime contributing to a deeper compound penalty stack, but B67.5 is the gating problem for that — B68.2 is observational pre-B67.5 (no consumer reads as gate). Behavioral risk for current calibration window: ZERO.

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1 (NEW):** `server/core/metrics/volume-regime.ts`

Three exports + module-level config interface.

```typescript
import type { OHLCData } from '../../types/market-regime.types.js';
import type { FactorAlternate, RegimeDecision } from '../../services/factor-ablation-emitter.js';

export interface VolumeRegimeConfig {
  lookbackBars: number;
  accumulationThreshold: number;
  distributionThreshold: number;
  factorMin: number;
  factorMax: number;
  sensitivity: number;
  minSamples: number;
}

export interface VolumeRegimeResult {
  score: number;        // [-1, +1]
  factor: number;       // [factorMin, factorMax]
  coldStart: boolean;
  sampleCount: number;
  hasLiquidationSpike: boolean;  // Langston §D.1
  label: 'ACCUMULATION' | 'DISTRIBUTION' | 'NEUTRAL';
}

export function computeVolumeRegime(
  ohlcData: OHLCData[],
  config: VolumeRegimeConfig,
): VolumeRegimeResult {
  // 1. Cold-start guard
  // 2. Slice last N bars
  // 3. Score = signed-volume sum / total-volume sum
  // 4. Factor = clamp(min, max, 1 + score × sensitivity)
  // 5. Liquidation spike = any single bar volume > 5 × median(volumes)
  // 6. Label from score vs accumulation/distribution thresholds
}

export function buildB68_2Alternate(
  realConfidence: number,
  realRegimeLabel: string,
  result: VolumeRegimeResult,
  config: VolumeRegimeConfig,
): FactorAlternate {
  // Counterfactual: divide-out factor to recover what confidence would have
  // been without B68.2. Same divide-out approximation as B67.4 / B68.4.
}
```

Pure functions — no class, no state, no persistence.

#### **File 2:** `server/services/market-context-engine.ts`

Edits:
1. Import `VolumeRegimeConfig` type from `volume-regime.js`
2. Export `VolumeRegimeConfig` re-export interface (mirrors `RegimeAgeConfig` / `PathBSustainabilityConfig` re-exports already in this file)
3. Add private field: `private volumeRegimeConfig: VolumeRegimeConfig | null = null`
4. Add to `stop()`: `this.volumeRegimeConfig = null`
5. New sub-method `refreshVolumeRegimeConfig()` — resolves 7 keys from `volume_regime` module with hard-fail on missing
6. Add to `refreshAllConfigs` orchestrator's groups array (becomes 7 groups)
7. New accessor `getCurrentVolumeRegimeConfig(): VolumeRegimeConfig | null`

Mirror the exact same pattern as `refreshOutcomeFeedbackConfig()` from B67.4.

#### **File 3:** `server/services/signal-orchestrator.ts`

Edits:
1. Import `computeVolumeRegime` and `buildB68_2Alternate` from `volume-regime.js`
2. In emit hook (line ~770 area, after the B67.4 outcome feedback block):
   ```typescript
   // ── B68.2 volume regime ─────────────────────────────────────
   if (volumeRegimeConfig !== null && symbolCtx !== null) {
     const ohlc = (rawSignal as any).ohlcData ?? (symbolCtx as any).ohlcData;
     if (ohlc && Array.isArray(ohlc) && ohlc.length >= volumeRegimeConfig.minSamples) {
       const result = computeVolumeRegime(ohlc, volumeRegimeConfig);
       modulatedConfChain *= result.factor;
       ablationAlternates.push(
         buildB68_2Alternate(modulatedConfChain, regimeLabel, result, volumeRegimeConfig),
       );
       console.log(
         `[B68.2][volume] pair=${rawSignal.symbol} score=${result.score.toFixed(3)} ` +
           `factor=${result.factor.toFixed(4)} label=${result.label}` +
           (result.hasLiquidationSpike ? ' (liquidation_spike)' : ''),
       );
     }
   } else {
     console.warn('[B68.2][orchestrator] volume regime config null at ablation hook — cold-start race');
   }
   ```
3. Same pattern as B67.4's emit hook. Active-path orchestrator's any-cast on `MarketContext.ohlcData` is still the same B67.4-deferred issue (#44 in RUNNING_ISSUES) — accept silent-skip for B68.2 active path same as for B68.5; deferred to B67.5 fix.

#### **File 4:** `server/services/vts-runner.ts`

Same edits as signal-orchestrator at the vts-runner emit hook (line ~1480 area). Uses function-scope `ohlcData` parameter directly (no any-cast issue — fixed in B67.4 hotfix #3).

#### **File 5 (NEW):** `drizzle/migrations/2026-05-02-b68-2-volume-regime.sql`

7 INSERTs in `volume_regime` module per scope §F.

#### **File 6 (NEW):** `drizzle/migrations/2026-05-02-b68-2-volume-regime-rollback.sql`

DELETE the 7 keys.

#### **File 7 (NEW):** `server/tests/unit/b68-2-volume-regime.test.ts`

Cases:
- Score=+1 when all up-close bars (pure accumulation)
- Score=-1 when all down-close bars (pure distribution)
- Score=0 when zero net signed volume
- Cold-start: ohlcData.length < minSamples → score=0, coldStart=true
- Zero-volume edge: total volume=0 → score=0, no NaN
- Factor clamp: extreme score out of clamp range hits min/max
- Liquidation spike detection: bar at 5.1× median → flag=true
- No spike: bar at 4.9× median → flag=false
- Median computation correctness on small N
- Labels: score > 0.40 → ACCUMULATION; score < -0.40 → DISTRIBUTION; else NEUTRAL

### §B.2 Order of operations (Step 3)

1. Migration SQL (7 module_constants seeds in `volume_regime` module)
2. New `volume-regime.ts` (pure functions + interfaces)
3. `market-context-engine.ts` — add 7th refresh sub-method + accessor + state field, register in orchestrator
4. `signal-orchestrator.ts` — emit hook addition (active path)
5. `vts-runner.ts` — emit hook addition (VTS path)
6. New unit test file — at least 10 cases per §B.1 File 7
7. `npm run check` clean (no new TS errors); `npm test` clean
8. Bring diff to Langston (Step 4) BEFORE push

### §B.3 Risks I'm explicitly accepting

- **Pre-B67.5 the volume regime modulation is decorative.** B68.2 modulates `regime_confidence_modulated` which has no consumer gate. Behavior change in B68.2 is strictly observational — ablation rows + `regime_confidence_modulated` column reflect the new chain.
- **Active-path orchestrator emit hook will silent-skip B68.2 ablation.** Same any-cast on `MarketContext.ohlcData` (undefined at hook) → ohlc.length check fails → no row emitted on active path. Active trading is OFF. Deferred to B67.5 alongside B68.5 OHLC fix per RUNNING_ISSUES #44.
- **Volume regime score regime-agnostic v1.** Per scope §A.3 / R3. Per-regime sensitivity tuning calibrated in v2 if data warrants.
- **Liquidation-spike threshold (5×) is a v1 seed.** Promote to module_constant if calibration shows it needs tuning. Logged as v2 follow-up in CHANGES_AND_FIXES on close.
- **Compound penalty stack.** Per Langston O.1 — non-blocking for B68.2; B67.5 problem.

### §B.4 Rollback plan

- DB-only neutralization: `UPDATE module_constants SET value = '0.0'::jsonb WHERE constant_name = 'b68_2_sensitivity'` → factor always = 1.0 (no modulation). All other constants stay; ablation rows still emit at factor=1.0 for the calibration framework.
- Full rollback: `git revert <commit>` and redeploy. Drop migration with rollback SQL. Module constants in `volume_regime` module become unused but harmless.
- Ablation rows already emitted stay in `regime_factor_alternates` — no cleanup needed. Calibration framework just stops generating new rows.

---

## §C. Verification Criteria (Step 11 closure — copy of scope §E)

- [ ] `regime_factor_alternates.factor_name = 'b68_2_volume_regime'` rows appearing within 1h post-deploy (n > 0 in 1-hour window)
- [ ] `[B68.2][volume]` log lines appearing in PM2 logs within 1h
- [ ] Score distribution non-degenerate: at least two of {ACCUMULATION, DISTRIBUTION, NEUTRAL} represented across pairs in first hour
- [ ] No `[B68.2]` errors in PM2 logs
- [ ] `regime_confidence_modulated` column on closed VTS trades reflects 5-multiplier chain (variance increased vs pre-B68.2 4-multiplier baseline)
- [ ] Liquidation-spike flag visible in metadata of at least some rows (depends on universe; expect mostly false on benign days)
- [ ] All 4 CI checks GREEN (TS Check legacy baseline acceptable)
- [ ] PM2 dawntrader running clean ≥ 24h post-deploy
- [ ] B68.2 mini-window officially starts (Day 0 of 14)
- [ ] Tier 1 governance updated: BATCH_CATALOG, MEMORY (truth + repo), master plan §0.11.B sequence marker, this scope file → APPROVED, BATCH_68_2_PROGRESS_REPORT.md (or appended to BATCH_68_PROGRESS_REPORT.md)
- [ ] Tier 2 governance: SIM (new component) + CHANGES_AND_FIXES (one entry) + RUNNING_ISSUES (calibration window observation entry)

---

## §D. Open questions for Langston (Step 2 review)

1. **Active-path emit hook fix in this batch?** B67.4 deferred fixing the orchestrator any-cast on `MarketContext.ohlcData` to B67.5 (RUNNING_ISSUES #44). Active trading is off so no behavioral impact, but B68.2 inherits the same silent-skip. Want to fix it now (one-line change to plumb OHLC through the active-path emit context) so future factors don't keep accumulating the deferred fix? Or leave for B67.5?

2. **Liquidation-spike threshold (5×) as a module_constant from v1?** I have it as a v1 hardcoded seed with promotion-to-module_constant noted as a v2 follow-up. Same pattern was used for B67.4's `b67_4_min_samples` etc. Alternative: ship as `b68_2_liquidation_spike_multiplier` module_constant from v1 (8th constant in `volume_regime` module). Marginal cost to add now; saves a v2 migration. Lean?

3. **Anything missing or wrongly scoped in this pre-audit?**

---

*End of B68.2 Step 2 pre-audit. Awaiting Langston review.*
