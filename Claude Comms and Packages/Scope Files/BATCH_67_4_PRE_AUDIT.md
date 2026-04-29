# BATCH 67.4 — Pre-Implementation Audit + Implementation Plan

**Companion to:** `BATCH_67_4_SCOPE.md` (commit `276ab697`)
**Step:** 2 of 11 per CLAUDE.md §2 workflow
**SIM consulted:** YES — see §A.1 below
**System Manual consulted:** YES — see §A.2 below
**Status:** APPROVED at Step 2 (Langston cc-inbox #857). 4 refinements folded in below — see §D Refinements.

---

## §A. SIM + System Manual Consultation

### §A.1 SIM-mapped components affected

Per CLAUDE.md §9: every component the batch touches gets upstream/downstream/shared-state/background-execution/blast-radius analysis. **This is a HIGHER-blast batch than B67.3.5** because it touches: (a) signal evaluation hooks, (b) trade-close hooks, (c) classifier label semantics (B68.5 Path B gate), (d) modulation chain order.

| # | Component | File | Change | Blast |
|---|---|---|---|---|
| 1 | New OutcomeFeedbackStore | `server/core/metrics/outcome-feedback-store.ts` (NEW) | Singleton + persistence + EMA update + accessor | LOW (new isolated module) |
| 2 | Regime classifier — B68.5 Path B gate | `server/core/metrics/market-regime.ts:177-195` | New `else if` branch using DBS slope; existing Path A branch unchanged | **HIGH** — TFS classification rate may shift; `b68_5_dbs_slope_min=0.0` initially conservative |
| 3 | calculatePairRegime signature | `server/core/metrics/market-regime.ts:144` | Add `dbsSlope` 5th param (or extend `regimeConfig` with slope_min only and pass slope inside config) | MEDIUM — 4 callers (3 tests + diagnostic) need updates |
| 4 | regime-phase exposure | `server/core/metrics/regime-phase.ts` | Add `peekAgeMs(symbol, now)` accessor for B68.4 to read age without ticking | LOW |
| 5 | MCE wiring | `server/services/market-context-engine.ts` | Resolve 10 new module_constants in `refreshMacroContext`; thread `dbsSlope` into classifier; expose new accessors `getCurrentOutcomeFeedbackConfig()` + `getCurrentRegimeAgeConfig()` + `getCurrentPathBSustainabilityConfig()` | MEDIUM — all in same refresh path |
| 6 | Signal evaluation hook (active path) | `server/services/signal-orchestrator.ts:~638` (B67.1 emit hook line) | Push 3 new alternate rows: `b67_4_outcome_feedback`, `b68_4_regime_age`, `b68_5_path_b_sustainability`. Apply B68.4 + B67.4 modulation to confidence used in admission. | **HIGH** — every signal evaluated in active path |
| 7 | Signal evaluation hook (VTS path) | `server/services/vts-runner.ts:~638` + `~1374` | Same hook updates as active path | **HIGH** — every VTS signal |
| 8 | Trade-close hook (active) | `server/services/paper-execution-engine.ts` (close logic) | On trade close, update OutcomeFeedbackStore EMA with `(regime, strategy, netPnlPercent)` | MEDIUM |
| 9 | Trade-close hook (VTS) | `server/services/vts-service.ts:persistRealPriceTrade` or wherever VTS trade-close persists | Same EMA update as active path | MEDIUM |
| 10 | Module constants | `module_constants` table | Add 10 new keys across 3 modules (`outcome_feedback`, `regime_age`, `path_b_sustainability`) | LOW (additive) |
| 11 | DBS slope plumbing | propagatedDbs object → MCE → classifier | Already exists per B62/B63 — `propagatedDbs.slope` available. Just use it. | LOW |
| 12 | Tests | New: `b67-4-outcome-feedback.test.ts`, `b68-4-regime-age.test.ts`, `b68-5-path-b-sustainability.test.ts` + augment existing classifier tests | NONE | NONE |

**Upstream feeders unchanged:**
- DBS (B62) — `propagatedDbs.score` and `.slope` both already computed
- B67.1 macro modifier — output unchanged
- B67.2 phase boundaries / weights — unchanged
- B67.3.5 desat formula — unchanged (B68.5 changes which BRANCH fires, not the desat formula inside the branch)
- Phase store age — already tracked, just expose

**Downstream consumers — IMPACTED:**
- `applyPhasePreference` — receives modulated confidence; sees same input shape, output unchanged
- B67.0 ablation framework — receives 3 new factor types in alternates array; emitter is generic, accepts any JSONB shape per factor
- B67.2.1 trade record persistence — `regime_confidence_modulated` column reflects full chain (now 5-multiplier instead of 3); other columns unchanged
- B67.3 cohort A/B cap — unchanged
- Dashboard rendering — per-factor table will show 3 new row types; aggregator query likely needs no change since it groups by `factor_name`
- B67.5 (future) — will read more meaningful (more dimensions of) confidence

**Shared state:**
- `regimePhaseStore` — read-only access for B68.4; no modifications to write path
- `OutcomeFeedbackStore` (new) — own persistence file `/tmp/b67-4-outcome-feedback.json`; trade-close path writes; signal-eval path reads
- `module_constants` — 10 new rows, no schema change

**Background execution:**
- No new timers/intervals
- MCE refresh adds 10 more constant resolutions (negligible)
- OutcomeFeedbackStore writes synchronously on each trade close (low frequency, low cost)

### §A.2 System Manual sections to update on close

- Modulation chain ordering documented: `raw × macro × phase_weight × freshness × outcome → clamp` with rationale per Langston cc-inbox #856 Q5
- TFS branch diagram: Path A (mom + ADX) and Path B (DBS-strength) both feed regime=TFS, but Path B now requires DBS slope ≥ 0
- B67.4 EMA formula + α + sensitivity rationale
- B68.4 freshness factor formula
- B68.5 Path B gate + DBS slope source (B62/B63)
- B67.5 post-composition floor pre-registration note (per Langston Q6) — must define before B67.5 wiring

### §A.3 Cascade risk check

Reviewed each downstream consumer for SIM-style failure modes:

| Risk | Verdict | Mitigation |
|---|---|---|
| B68.5 gate over-rejects, signal volume drops | **Possible** with `b68_5_dbs_slope_min = 0.0` | Tunable via DB; raise to slightly negative if too aggressive. Calibration window will quantify. |
| B68.5 changes regime LABEL distribution → downstream strategy routing flips | **Yes — this is the point.** Aged-out Path B classifications now go to ST (or HVU) instead of TFS. Catches the 04-22 hostile-day failure mode. | Ablation row captures the LABEL counterfactual for forensics. Strategy-routing impact is the design intent. |
| OutcomeFeedbackStore staleness if trade-close hook misses | New entries cap at 24h `last_update`; missing updates → entry expires → cold-start path | Stale-eviction is a self-healing mechanism. |
| 5-factor modulation chain compound extreme drops below pre-B67 0.4 floor | Penalty-stacked 0.566 (per scope §R3) — below 0.4 in some configurations | **Pre-registered** for B67.5 — must define post-composition floor before consumer wiring. Logged in System Manual + RUNNING_ISSUES. |
| Ablation row volume up 60% (3 new factor types per signal) | ~10K alternate rows/day → ~16K/day | Trivial at VTS scale (per §0.10.F retention policy). 90-day retention sweep already in `replay-ablation.ts`. |

**Net:** the only HIGH-blast change with active behavioral effect is **B68.5 Path B label flip**. B67.4 + B68.4 modulate confidence which is still decorative pre-B67.5 (no consumer reads as gate). B68.5 changes regime classification, which IS consumed by strategy routing — that's the intended effect, captured in ablation.

---

## §B. Implementation Plan

### §B.1 File-by-file edit map

#### **File 1 (NEW):** `server/core/metrics/outcome-feedback-store.ts`

```typescript
export interface OutcomeFeedbackEntry {
  ema_pnl_pct: number;
  sample_count: number;
  last_update: number; // epoch ms
}

export interface OutcomeFeedbackConfig {
  alpha: number;
  sensitivity: number;
  minSamples: number;
  factorMin: number;
  factorMax: number;
}

class OutcomeFeedbackStore {
  // Map<"<regime>_<strategy>", entry>
  private entries: Map<string, OutcomeFeedbackEntry> = new Map();
  // Pattern matches regimePhaseStore exactly:
  // - constructor calls loadFromDisk()
  // - tick equivalent: updateEma(regime, strategy, netPnlPct, now)
  // - on each updateEma → entries.set + saveToDisk
  // - peek(regime, strategy) → entry | undefined (read accessor)
  // - 24h hard-expiry on stale last_update
}

export function computeOutcomeFeedbackFactor(
  entry: OutcomeFeedbackEntry | undefined,
  config: OutcomeFeedbackConfig,
): { factor: number; coldStart: boolean } {
  if (!entry || entry.sample_count < config.minSamples) {
    return { factor: 1.0, coldStart: true };
  }
  const raw = 1.0 + entry.ema_pnl_pct * config.sensitivity / 100; // pct → fraction
  const clamped = Math.max(config.factorMin, Math.min(config.factorMax, raw));
  return { factor: clamped, coldStart: false };
}

export function buildB67_4Alternate(
  preFactorConfidence: number,
  feedbackResult: { factor: number; coldStart: boolean },
  context: { regime: string; strategy: string; entry: OutcomeFeedbackEntry | undefined },
): FactorAlternate {
  return {
    factor_name: 'b67_4_outcome_feedback',
    factor_value_with: feedbackResult.factor,
    factor_value_without: 1.0,
    confidence_with_factor: preFactorConfidence * feedbackResult.factor,
    confidence_without_factor: preFactorConfidence,
    metadata: {
      regime: context.regime,
      strategy: context.strategy,
      ema_pnl_pct: context.entry?.ema_pnl_pct ?? 0,
      sample_count: context.entry?.sample_count ?? 0,
      cold_start: feedbackResult.coldStart,
    },
  };
}
```

Persistence file: `/tmp/b67-4-outcome-feedback.json`. Pattern matches `regimePhaseStore` exactly.

#### **File 2:** `server/core/metrics/regime-phase.ts`

**Add** read accessor:
```typescript
peekAgeMs(symbol: string, now: number): number | undefined {
  const entry = this.entries.get(symbol);
  if (!entry) return undefined;
  return now - entry.enteredAt;
}
```

No modifications to existing `tick()` or `backfillFromHistory()`.

#### **File 3:** `server/core/metrics/market-regime.ts`

**Modify** TFS branch + add B68.5 gate. Current line 177-195 has Path A + Path B + HVU branches:

```typescript
// CURRENT B67.3.5:
} else if ((mom > 0.003 && dx > 50) || absDbs >= 0.30) {
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // ... B67.3.5 continuous formula
}
```

**New B67.4 / B68.5:**

```typescript
} else if (mom > 0.003 && dx > 50) {
  // Path A — momentum + ADX, unchanged
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // ... B67.3.5 desat formula
} else if (absDbs >= 0.30 && dbsSlope >= regimeConfig.b68_5DbsSlopeMin) {
  // Path B — DBS-strength gated by sustainability (B68.5 NEW)
  regime = REGIMES.TREND_FRIENDLY_STABLE;
  // ... same B67.3.5 desat formula
} else if (absDbs >= 0.30 && dbsSlope < regimeConfig.b68_5DbsSlopeMin) {
  // Path B rejected — DBS strong but slope negative
  // Fall through to ST/HVU based on existing branches below
} else if ((vol > 0.015 && mom < -0.003) || (dx > 60 && mom < -0.005)) {
  regime = REGIMES.HIGH_VOLATILITY_UNSTABLE;
  // ... existing
}
```

**Signature:** add `dbsSlope` to `RegimeConfig` interface OR as 5th param. Recommend: extend `RegimeConfig` with `b68_5DbsSlopeMin` (a threshold), keep `dbsSlope` as a separate function param (it's per-pair, not config). New signature:

```typescript
export function calculatePairRegime(
  ohlcData: OHLCData[],
  dbsScore: number,
  dbsSlope: number,           // NEW
  macroModifier: number,
  regimeConfig: RegimeConfig, // extended with b68_5DbsSlopeMin
): RegimeCalculationResult { ... }
```

Update all 4 callers (MCE + diagnostic + 2 unit tests) with the new param.

#### **File 4:** `server/services/market-context-engine.ts`

- Add 10 new constant resolutions in `refreshMacroContext` (alongside existing macro/phase/desat resolutions)
- Add 3 new state fields: `outcomeFeedbackConfig`, `regimeAgeConfig`, `pathBSustainabilityConfig`
- Add 3 new accessors: `getCurrentOutcomeFeedbackConfig()`, etc.
- Thread `dbsSlope` from `propagatedDbs.slope` into `calculatePairRegime` call (line ~408)
- Cleared on `MCE.stop()`

Hard-fail on missing keys per established pattern.

#### **File 5:** `server/services/signal-orchestrator.ts` (line ~638 emit hook)

Existing emit hook builds `b67_1` per-input alternates + `b67_2_phase_preference` alternate. Augment with:

1. Read regimePhaseStore age via new `peekAgeMs(symbol, now)` accessor
2. Read OutcomeFeedbackStore entry via `OutcomeFeedbackStore.peek(regime, strategy)`
3. Compute B68.4 freshness factor (bounded calc)
4. Compute B67.4 outcome feedback factor (via `computeOutcomeFeedbackFactor`)
5. Apply both to confidence in modulation chain BEFORE clamp
6. Push 3 new alternates: `buildB68_4Alternate`, `buildB67_4Alternate`, `buildB68_5Alternate` (the last one captures the LABEL counterfactual)

#### **File 6:** `server/services/vts-runner.ts` (lines ~638 + ~1374)

Same augmentation as signal-orchestrator. Both paths must apply identical logic for parity (per existing `applyPhasePreference` shared-utility precedent).

#### **File 7:** `server/services/paper-execution-engine.ts` (close logic)

On trade-close path, after `netPnlPercent` is computed, call:
```typescript
outcomeFeedbackStore.updateEma(
  trade.regime,
  trade.strategy_name,
  trade.net_pnl_percent,
  Date.now(),
);
```

#### **File 8:** `server/services/vts-service.ts` (`persistRealPriceTrade`)

Same `updateEma` call as active-path close.

#### **File 9 (NEW):** `drizzle/migrations/2026-04-30-b67-4-cheap-tier.sql`

10 INSERTs across 3 module names:
```sql
INSERT INTO module_constants (...) VALUES
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_alpha', '0.10'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_sensitivity', '4.0'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_min_samples', '5'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_factor_min', '0.85'::jsonb, 'b67.4-cheap-tier'),
  ('outcome_feedback', '*', '*', '*', '*', 'b67_4_factor_max', '1.05'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_target_age_hours', '6.0'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_sensitivity', '0.10'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_min', '0.92'::jsonb, 'b67.4-cheap-tier'),
  ('regime_age', '*', '*', '*', '*', 'b68_4_max', '1.05'::jsonb, 'b67.4-cheap-tier'),
  ('path_b_sustainability', '*', '*', '*', 'TREND_FRIENDLY_STABLE', 'b68_5_dbs_slope_min', '0.0'::jsonb, 'b67.4-cheap-tier');
```

Plus rollback file deleting these 10 keys.

#### **File 10–12 (NEW tests):**

- `server/tests/unit/b67-4-outcome-feedback.test.ts` — EMA math, cold-start, persistence round-trip, factor clamp, alpha decay rate
- `server/tests/unit/b68-4-regime-age.test.ts` — freshness factor at age=0, 6h, 12h, 24h; clamps; integration with regimePhaseStore
- `server/tests/unit/b68-5-path-b-sustainability.test.ts` — Path A unchanged, Path B with positive slope admits, Path B with negative slope rejected, Path A independent of slope, ablation row LABEL counterfactual correct

### §B.2 Seed value derivation

All seeds approved by Langston cc-inbox #856 (Q2-Q4):
- `b67_4_alpha = 0.10` — 10-trade EMA half-life (Langston Q2)
- `b67_4_sensitivity = 4.0` — 1% EMA → 0.04 factor delta, asymmetric clamp at −3.75% / +1.25% intentional (Langston Q3)
- `b67_4_min_samples = 5` — cold-start floor
- `b67_4_factor_min/max = 0.85 / 1.05` — match B67.1 modifier band
- `b68_4_target_age_hours = 6.0` — middle of PRIME band (Langston Q4)
- `b68_4_sensitivity = 0.10` — slope of factor vs age
- `b68_4_min/max = 0.92 / 1.05` — narrower than B67.4's [0.85, 1.05]; freshness is a softer signal
- `b68_5_dbs_slope_min = 0.0` — non-negative slope to admit Path B; conservative starting threshold

### §B.3 Order of operations (Step 3 — TOMORROW per Kyle directive)

1. **Verification gate first:** check ~6 UTC tomorrow morning that B67.3.5 verification gates pass (backfill log lines, TFS distribution shift, phase mix shift, replay cron run). Report status to Kyle BEFORE proceeding with implementation.
2. Migration SQL (10 module_constants seeds across 3 modules)
3. New `outcome-feedback-store.ts` file (mirror regimePhaseStore pattern)
4. `regime-phase.ts` — add `peekAgeMs` accessor
5. `market-regime.ts` — restructure TFS branch into Path A / Path B-with-gate / Path B-rejected; extend `RegimeConfig` with `b68_5DbsSlopeMin`; add `dbsSlope` 3rd param
6. `market-context-engine.ts` — resolve 10 new constants, add 3 state fields + 3 accessors, thread `dbsSlope` into classifier
7. Update 4 existing callers of `calculatePairRegime` (3 tests + diagnostic-11.4G)
8. `signal-orchestrator.ts` + `vts-runner.ts` — apply B68.4 + B67.4 modulation, push 3 new alternate types
9. `paper-execution-engine.ts` + `vts-service.ts` — trade-close `updateEma` calls
10. 3 new test files + augmented existing classifier tests
11. `npm run check` clean (zero new TS errors); `npm test` clean
12. Bring diff to Langston (Step 4) BEFORE push

### §B.4 Risks I'm explicitly accepting

- **B68.5 changes regime label distribution.** Aged-out Path B classifications now route to ST/HVU instead of TFS. This affects strategy admission (different strategies map per regime). Decorative impact on confidence pre-B67.5; LABEL impact is real and intended.
- **`OutcomeFeedbackStore` is per-process.** Active-path and VTS-path share the same singleton (one process). If we ever split active and VTS into separate processes, this needs DB-backed storage. Out of scope for B67.4.
- **5-factor modulation chain compound extreme drops below pre-B67 0.4 floor.** Pre-registered for B67.5 — Langston cc-inbox #856 Q6 reinforced this. Documented in System Manual update on close.
- **No active gating on confidence pre-B67.5.** B67.4 + B68.4 modulate confidence which is still decorative. The behavior change is strictly observational (ablation rows + trade record column).

### §B.5 Rollback plan

- DB-only rollback: `UPDATE module_constants SET value=...` to neutralize factors (set sensitivity=0 + factor_min/max=1.0 → freshness/outcome=1.0 always; set b68_5_dbs_slope_min=−1000 → Path B always admits)
- Full rollback: `git revert <commit>` and redeploy. Module_constants stay (harmless after revert). Drop migration with rollback SQL if desired.
- `OutcomeFeedbackStore` disk file `/tmp/b67-4-outcome-feedback.json` retains data across rollback — re-applying the change later picks up where it left off.

---

## §C. Open questions for Langston (Step 2 review)

1. **`dbsSlope` as 3rd function param vs in `RegimeConfig`** — I went separate param (per-pair, not config). Agree, or want to bundle into the config object even though it's per-pair? Pattern question.
2. **Persistence file `/tmp/b67-4-outcome-feedback.json` 24h hard-expiry on `last_update`** — same as regimePhaseStore. Concern: if a (regime, strategy) tuple goes 24h+ without trades, EMA expires and resets to cold-start. Acceptable, or want longer window (e.g. 7d)?
3. **B68.4 freshness factor reads `regimePhaseStore` age directly** — that age may be from B67.3.5 backfill OR natural accrual. Both should be acceptable for the freshness signal. Agree?
4. **B68.5 ablation row factor_value_with/without are STRINGS (regime labels)**, all other factor types are NUMBERS (confidence factors). The dashboard renderer may need a special-case for string values. Acceptable, or restructure B68.5 to encode label-flip as a 0/1 numeric (1 = label-changed-by-gate)?
5. **EMA initialization — first sample case.** When `sample_count=0` and we call `updateEma(regime, strategy, pnl, now)`, the first sample becomes `ema_pnl_pct = pnl` directly (no decay applied). Or do we want to seed `ema_pnl_pct = 0` and then decay from there? Trade-off: first-sample-as-EMA reacts faster but is noisier; seed-zero is more conservative but takes 5+ samples to reach a meaningful value. I leaned first-sample-as-EMA. OK?
6. **`refreshMacroContext` is now resolving 5+5+10=20 constants per refresh cycle** — getting heavy. Would you prefer splitting into separate refresh methods (`refreshRegimeConfig`, `refreshOutcomeFeedbackConfig`, etc.) or keep monolithic for now?
7. **Anything missing or wrongly scoped?**

---

## §D. Refinements from Langston Step 2 review (cc-inbox #857)

These 4 deltas supersede the original §B specs. Implementation must follow the refined version:

### §D.1 OutcomeFeedbackStore expiry: **7 days, not 24h** (Q2)

Rare-regime tuples (IE, ST fire <5% of the time) need a longer window between bursts. Change:
- Add `b67_4_expiry_hours` module_constant (seed `168` = 7 days)
- Use this in the hard-expiry sweep on disk-load (drop entries where `now - last_update > expiry_hours × 3600 × 1000`)
- 11 module_constants total now (was 10)

### §D.2 B68.5 ablation row: **numeric 0/1, not strings** (Q4)

For dashboard consistency, factor_value_with/without are numeric:
- `factor_value_with: 0 or 1` (1 = gate flipped the label)
- `factor_value_without: 0` (no gate = no flip)
- `metadata`: still carries `regime_with_gate`, `regime_without_gate`, `dbs_score`, `dbs_slope`, `path_a_triggered` for forensics

This keeps aggregation queries (AVG, SUM) working uniformly across all factor types.

### §D.3 EMA first-sample: **first sample AS EMA** (Q5)

Confirmed approach. First trade's PnL becomes ema_pnl_pct directly (no decay applied). Cold-start floor at 5 samples means the first 4 EMA values aren't consumed for confidence modulation anyway, so first-sample-as-EMA noisiness doesn't propagate.

### §D.4 Split `refreshMacroContext` into 6 methods + orchestrator (Q6)

Replace the monolithic `refreshMacroContext` with:
- `refreshMacroConfig()` — B67.1 macro modifier (7 constants)
- `refreshPhaseConfig()` — B67.2 phase boundaries + weights (3 constants)
- `refreshRegimeConfig()` — B67.3.5 TFS desat (5 constants)
- `refreshOutcomeFeedbackConfig()` — B67.4 outcome feedback (5 + 1 = 6 constants per §D.1)
- `refreshRegimeAgeConfig()` — B68.4 regime age (4 constants)
- `refreshPathBConfig()` — B68.5 path B sustainability (1 constant)

Plus a `refreshAllConfigs()` orchestrator called on the 60s timer. Each sub-method:
- Hard-fails on missing constant with explicit identifier list
- Returns a clean error message naming the specific config group that failed

Orchestrator behavior:
- **First refresh at startup**: hard-fail (we can't run without config). Throw and let MCE.start fail.
- **Subsequent refreshes**: catch errors per sub-method, log which group failed, keep prior cached config for that group. Don't let one missing constant in B68.5 take down the entire MCE refresh.

Rationale: tighter error attribution, independent unit testability per sub-method, fault tolerance for runtime config-update issues.

### §D.5 Module constants count update

11 total (was 10): 5 outcome_feedback + 4 regime_age + 1 path_b_sustainability + 1 outcome_feedback expiry-hours = 11.

Migration SQL `2026-04-30-b67-4-cheap-tier.sql` adds 11 INSERTs.

---

*End of B67.4 pre-audit. APPROVED at Step 2. Hold for ~6 UTC verification gate check, then proceed to Step 3 implementation per §D refinements.*
