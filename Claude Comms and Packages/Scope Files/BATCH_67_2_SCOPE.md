# Batch 67.2 — Scope (Phase Dimension EARLY/PRIME/LATE)

**Sub-deliverable:** B67.2 — Phase Dimension on existing 5 regimes (4 of 6 in B67 chain)
**Author:** Claude Code
**Date:** 2026-04-28
**Status:** APPROVED 2026-04-28 by Langston (cc-inbox #844, Telegram #3230). STEP-1 + STEP-2 complete.
**Parent:** `BATCH_67_SCOPE.md` §7 (this doc supersedes that section as the binding sub-deliverable scope)
**Sequencing:** Ships AFTER B67.1's 24h shadow soak per Option A serial (cc-inbox #842, Telegram #3225). Both feed the calibration check that gates B67.5.

---

## 1. Why this batch exists

Per master plan §0 + §5.3: the per-pair regime classifier has no notion of regime AGE. A pair that just entered TFS (impulse capture phase) is treated identically to a pair that's been TFS for 6+ hours (exhaustion-prone). The 04-22 hostile-day cohort showed strong-bull-trend trades on 12h+ aged TFS regimes catastrophically underperforming fresh-entry TFS — the canonical exhaustion failure mode the system can't currently see.

B67.2 sub-classifies the existing 5 regimes by phase dimension: **EARLY (0–2h since regime entry) / PRIME (2–12h) / LATE (12h+).** Phase preference modulates each strategy's effective regime confidence on signal admission via a per-strategy-per-phase weight from a 54-cell table (approved cc-inbox #843).

Architecture: Langston's recommendation, withdrew CC's original "add new top-level regimes" proposal. Cheaper, easier to validate, doesn't expand regime taxonomy footprint.

---

## 2. Operating-mode context

Same as B67.1: active trading STOPPED; VTS continues; B67.0 ablation hooks fire on every signal. B67.2 ships in **shadow mode** (`b67_2_enabled=false`) for ≥24h after deploy, then activated via `module_constants` flip.

**Sequencing note:** B67.2 begins implementation only after B67.1 has been in shadow ≥24h. This is per Option A serial — clean per-factor attribution if either misbehaves.

---

## 3. Numbered objectives

1. **Per-pair regime age tracked** with persistence across cycles. Age resets on regime transition. Stored in a singleton `regimePhaseStore` keyed by symbol.
2. **Phase computed per pair every MCE cycle.** Output: `'EARLY' | 'PRIME' | 'LATE'`. Boundaries seeded at 2h / 12h, configurable via `module_constants`.
3. **Phase preference applied at signal admission.** When `b67_2_enabled=true`, the strategy's `(strategy, phase)` weight from the JSONB blob multiplies the strategy's effective regime confidence on admission — NOT a hard gate, NOT a FinalScore weight (per scope §7.2 continuous-scoring invariant).
4. **54-cell strategy-phase weight table seeded** per the approved seeds in `B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md`. Single JSONB blob `b67_2_strategy_phase_weights` keyed `<strategy>_<phase>`. Default fallback for missing key: 1.00 (neutral) with loud `[B67.2][missing-weight]` PM2 log.
5. **B67.0 ablation hook fires per signal evaluation with the agreed JSONB shape.** `factor_name='b67_2_phase_dimension'`, `alternate_decision = { confidence_with_phase_pref, confidence_without_phase_pref, phase, phase_age_seconds, strategy_phase_weight, regime_label }`. Per Langston cc-inbox #842 (regime_label addition for future (strategy, regime, phase) tuple analysis).
6. **Phase transition logging.** When a pair transitions from one regime to another OR crosses a phase boundary, log to PM2 with `[B67.2][transition]` prefix. Useful for debugging phase boundary timing in calibration.
7. **`/api/vts/regime-state` endpoint exposes phase + age fields.** Per scope §7.7. Read-only diagnostic.
8. **Shadow-mode default at deploy.** `b67_2_enabled=false`. Activation via `module_constants` flip.
9. **All new constants in `module_constants`** per §0.9 governance rule.
10. **Calibration check ready post-deploy.** Calibration script (separate deliverable in B67) will compute regime-age-conditional WR curves bucketed by strategy family — see scope §8 of master.

---

## 4. module_constants entries (4 rows in `regime_phase` module)

| Constant | Type | Default | Notes |
|---|---|---|---|
| `b67_2_enabled` | bool | `false` | SHADOW at deploy. Flip after 24h soak + Langston Step-7 ack. |
| `b67_2_early_phase_max_hours` | float | `2.0` | EARLY → PRIME boundary. SEED — recalibrate after 14d. |
| `b67_2_prime_phase_max_hours` | float | `12.0` | PRIME → LATE boundary. SEED — recalibrate after 14d. |
| `b67_2_strategy_phase_weights` | jsonb | (54-cell blob) | Approved cc-inbox #843. SEEDS — recalibrate after 14d from regime-age-conditional WR. |

The JSONB blob is keyed `<strategy_key>_<phase>` (e.g. `vwap_pullback_PRIME`, `strong_bull_trend_LATE`). 54 cells = 18 strategies × 3 phases.

**Inline migration comment:** `-- B67.2 SEED VALUES — recalibrate after 14d from B67.0 ablation rows. Boundaries calibrated from regime-age-conditional WR curves bucketed by strategy family per Langston cc-inbox #842. Strategy-phase weights from B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md (Langston-approved cc-inbox #843).`

---

## 5. Files affected

### New files (3)

| File | Purpose | Approx lines |
|---|---|---:|
| `drizzle/migrations/2026-04-29-b67-2-phase-dimension.sql` | 4 module_constants seeds (3 scalar + 1 JSONB blob with all 54 cells) | ~120 |
| `drizzle/migrations/2026-04-29-b67-2-rollback.sql` | Symmetric rollback | ~15 |
| `server/core/metrics/regime-phase.ts` | `computePhase(symbol, currentRegime, lastRegimeChangeMs, now): 'EARLY' \| 'PRIME' \| 'LATE'` + `regimePhaseStore` singleton | ~150 |
| `server/tests/unit/b67-2-phase-dimension.test.ts` | Unit tests: phase boundaries, regime transition resets age, missing-weight fallback, JSONB lookup | ~200 |

### Modified files (5)

| File | Change |
|---|---|
| `server/types/market-context.ts` | Extend `RegimeContext`: add `phase: 'EARLY' \| 'PRIME' \| 'LATE'` + `phaseAgeSeconds: number` |
| `server/services/market-context-engine.ts` | After `calculatePairRegime`, call `computePhase()` and `regimePhaseStore.update(symbol, regime, now)`; attach phase + age to MarketContext.regime |
| `server/services/signal-orchestrator.ts` | Apply phase preference to admission. Multiplier looked up from JSONB blob via `(strategy, phase)`; multiplied into the strategy's effective regime confidence value used in admission. NOT FinalScore. NOT a hard gate. |
| `server/services/vts-runner.ts` | Same phase-preference multiplier on the VTS mirror path so VTS-recorded confidences reflect the same modulation |
| `server/services/factor-ablation-emitter.ts` (call sites) | Populate `alternate_decision` JSONB at the existing B67.0 hook with B67.2 shape |
| `server/config/canonical-regime-strategy-map.ts` | OPTIONAL: phase-preference annotations as inline comments on strategy entries for documentation. No code change to the map itself — the JSONB is the source of truth. |
| `server/routes.ts` | Extend `/api/vts/regime-state` to include phase + age per pair |

---

## 6. Architecture

```
Per MCE cycle, per pair:
  1. calculatePairRegime(ohlcData, dbsScore, macroModifier?)  → { regime, confidence }
  2. regimePhaseStore.tick(symbol, regime, now)                → returns ageMs since regime entry
  3. computePhase(ageMs, earlyMaxHours, primeMaxHours)         → 'EARLY' | 'PRIME' | 'LATE'
  4. Attach { phase, phaseAgeSeconds } to MarketContext.regime

At signal admission (signal-orchestrator + vts-runner):
  weight = b67_2_strategy_phase_weights[strategy + '_' + phase]    (default 1.00 if missing)
  effective_regime_confidence = real_confidence × weight
  // continues into existing admission logic with the modulated value
  // NOT a hard gate, NOT a FinalScore weight
```

Phase transitions:
- Regime change (TFS → IE etc.) → `regimePhaseStore` resets `lastRegimeChangeMs` to now → next cycle recomputes phase from age 0 (back to EARLY).
- No regime change but age crosses 2h or 12h boundary → phase value changes; logged.

Persistence: `regimePhaseStore` is in-memory only for B67.2 v1 (cold-start warmup acceptable). Pattern matches `directional-bias-store` from B63 Item 16. DB persistence deferred unless calibration check requires it.

---

## 7. Verification criteria

| Check | Pass criterion |
|---|---|
| TypeScript clean | `npx tsc --noEmit` zero new errors |
| CI green | All 4 checks |
| Migration applied | `npm run db:migrate` clean; 4 rows in `regime_phase` module; JSONB blob has 54 keys |
| Phase computed every MCE cycle | PM2 logs show phase distribution at startup |
| Phase transition logged | `[B67.2][transition]` lines on regime change AND on age boundary cross |
| Per-pair age field visible | `GET /api/vts/regime-state` returns `phase` + `phaseAgeSeconds` per pair |
| Strategy-phase weight applied | Unit test verifying multiplier applied during admission |
| Missing-weight fallback | Unit test: unknown `<strategy>_<phase>` key returns 1.00 + loud log |
| Ablation rows populated | After 1h shadow run, `regime_factor_alternates` has rows with `factor_name='b67_2_phase_dimension'` and the agreed shape |
| `b67_2_enabled=false` at deploy | No application of phase preference until DB flip |
| Active activation cycle | After flip, first ablation row shows `confidence_with_phase_pref !== confidence_without_phase_pref` |

---

## 8. Pre-registered success thresholds

After 14d post-activation:

1. Calibration check (master scope §8) passes tertile-monotonic WR(HIGH) − WR(LOW) ≥ 7pp at p<0.05 — **shared with B67.1**, both must contribute meaningfully.
2. B67.0 counterfactual on the `b67_2_phase_dimension` factor shows the LATE-penalized cohort (e.g. `breakout/LATE` with weight 0.85) has measurably lower WR than the LATE-neutral counterfactual would have.
3. `strong_bull_trend/LATE=0.85` cohort specifically shows reduced 04-22-style exhaustion losses — direct test of the canonical failure mode this batch targets.

If none pass after 30d → tune boundaries (2h / 12h may be wrong); if 60d → revisit per-cell weights from realized data; if 90d → escalate to Kyle.

---

## 9. Out of scope (deferred)

- **B68.4 regime-age first-class metric** — B67.2 lays the groundwork; B68.4 promotes it to first-class signal in the classifier itself.
- **Phase boundary calibration script** — separate deliverable in the calibration-check workstream.
- **Per-(strategy, regime, phase) tuple weights** — Langston's regime_label addition to the ablation row enables FUTURE analysis of whether phase prefs should be tuple-keyed. Not in B67.2.
- **DB persistence of regimePhaseStore** — deferred unless calibration check needs it.
- **B67.5 post-composition floor for Kelly/EV consumers** — pre-registered note (Langston cc-inbox #844): B67.1 × B67.2 composition produces an effective admission-confidence range of `[0.32, 1.10]` (= `[0.4 × 0.80, 1.0 × 1.10]`). The 0.32 lower bound is below the pre-B67 0.4 floor. Decorative today (no consumer reads confidence as a gate). When B67.5 wires consumers, B67.5 scope MUST define a post-composition floor so Kelly sizing and EV gate don't see sub-0.4 inputs. Not blocking B67.2 ship.

---

## 10. Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ⏳ This document. Pending Langston review. |
| 2 — Pre-audit | ⏳ See `BATCH_67_2_PRE_AUDIT.md`. Pending Langston review. |
| 3 — Implementation | After B67.1 24h shadow soak + Steps 1+2 sign-off. |
| 4 — Code review | Will package the diff for Langston. |
| 5 — GitHub push + CI | Push only after Step 4. |
| 6 — Staging deploy | PM2 restart in shadow mode. |
| 7 — First-pass verification (CC) | 1h+ shadow log review + JSONB blob spot check. |
| 8 — Second-pass verification (Langston) | UI + log review + ablation row inspection. |
| 9 — Iterate | If phase boundaries or weight application semantics surprise. |
| 10 — Governance | BATCH_CATALOG, PHASE_HISTORY, SIM (§4.1, §5.2.5, §7.1 deltas), SYSTEM_MANUAL (phase dimension addition), CHANGES_AND_FIXES, MEMORY, change list, completion report. |
| 11 — Completion ack | Kyle. |

---

## 11. Cross-references

- `B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md` — 54-cell weight table (Langston-approved cc-inbox #843)
- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0.2, §5.3
- `BATCH_67_SCOPE.md` §7 — original sub-deliverable carve-out (this doc supersedes)
- `BATCH_67_1_SCOPE.md` — sister sub-deliverable scope
- `BATCH_67_PRE_AUDIT.md` V2 — macro-B67 SIM
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §4.1, §5.1, §5.2.5, §7.1

*End of B67.2 scope.*
