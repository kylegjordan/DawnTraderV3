# Batch 67.2 — Pre-Implementation Audit

**Sub-deliverable:** B67.2 — Phase Dimension EARLY/PRIME/LATE
**Author:** Claude Code
**Date:** 2026-04-28
**Status:** APPROVED 2026-04-28 by Langston (cc-inbox #844). All 4 open questions resolved — see §5.
**Companion to:** `BATCH_67_2_SCOPE.md`
**Methodology:** SIM consultation per CLAUDE.md §9 + code-level inspection of every affected file + coexistence reconfirmation.

---

## 1. SIM consultation — components affected

### 1.1 SIM §5.1 — `calculatePairRegime()` (`server/core/metrics/market-regime.ts`)

**No B67.2 change.** B67.2 does NOT modify `calculatePairRegime`. Phase is computed alongside regime in MCE, not inside the classifier function. Classifier output (regime + confidence) is unchanged by B67.2.

### 1.2 SIM §5.1c — Directional Bias Store (precedent for `regimePhaseStore`)

The `regimePhaseStore` planned in B67.2 follows the EXACT pattern established by `directionalBiasStore` (B63 Item 16):
- Singleton in-memory store
- Per-pair entry with timestamp
- Cold-start acceptable
- Hard expiry sweep
- Behavior spec for null / stale / fresh states

This pattern is well-established and SIM-documented. No new architectural pattern.

### 1.3 SIM §5.2.5 — Market Context Engine

| Dimension | Today | Post-B67.2 |
|---|---|---|
| **Upstream** | OHLC; `calculatePairRegime`; canonical map | + `regimePhaseStore.tick()` returns ageMs (NEW) |
| **Downstream** | Signal Orchestrator; VTS Runner; market-indicators | All unchanged structurally. RegimeContext gains `phase` + `phaseAgeSeconds` fields (additive). |
| **Shared state** | Per-symbol context cache; singleton | + `regimePhaseStore` singleton (separate cache) |
| **Background execution** | Per-symbol per cycle, synchronous | Unchanged. Phase computation is O(1) per pair. |
| **Blast radius** | HIGH | HIGH unchanged. Two new optional fields added; consumers that don't read them are unaffected. |

**Code-level inspection:** `computeContext` at `market-context-engine.ts:124-180`. After `calculatePairRegime()` (line 162), insert: `const ageMs = regimePhaseStore.tick(symbol, regimeResult.regime, now); const phase = computePhase(ageMs, ...);`. Phase computation does NOT change the regime result; it's an additive layer.

### 1.4 SIM §4.1 — Signal Orchestrator (THIS IS WHERE THE GATING APPLIES)

| Dimension | Today | Post-B67.2 |
|---|---|---|
| **Upstream** | MCE context; SQE; canonical map | + `b67_2_strategy_phase_weights` JSONB lookup at admission |
| **Downstream** | RTB queue; trade execution path | Unchanged structurally |
| **Shared state** | None at admission | None at admission. `regimePhaseStore` is read-only at this stage. |
| **Background execution** | Per-signal evaluation | Unchanged |
| **Blast radius** | HIGH per SIM | HIGH unchanged. **But scoped:** phase preference modulates a continuous-scoring confidence value, not a hard gate. A signal in slightly-off phase still admits if other factors are strong (per scope §7.2 invariant). |

**Code-level inspection:** signal-orchestrator.ts queueSQESignal flow. Phase weight lookup happens just before the SQE call, with the modulated effective regime confidence threaded into the SQE input. Need to confirm at Step 3 the exact field name SQE consumes — the relevant struct is `SQESignalInput` per the B67.0 emit comment at line ~617.

**Critical invariant:** B63 Item 18 confirmed FinalScore does NOT consume `RegimeClassification.confidence` today. So multiplying confidence by a phase weight at admission does NOT cascade into FinalScore. The phase weight modulates **only** the confidence value used as one input to the SQE/admission gate, not FinalScore. Verified again 2026-04-28.

### 1.5 SIM §7.1 — VTS Runner

VTS mirror path. Same phase-weight application as signal-orchestrator. Required for VTS-recorded confidences to reflect the same modulation.

| Dimension | Today | Post-B67.2 |
|---|---|---|
| **Upstream** | MCE; FX5; family-eligibility gate; canonical map | + same phase weight lookup as orchestrator |
| **Downstream** | VTS trade record; ML calibration training data | VTS trade record carries the modulated confidence. ML training data inherits the new value. |
| **Blast radius** | HIGH | HIGH. Note: VTS broadness is the design (per Kyle directive). B67.2 does NOT narrow VTS admission — phase weight is continuous-scoring, max −20% confidence (LATE 0.80 cells), still admits if other factors compensate. |

**No `--paper-only` exclusion needed** (unlike B67.3). Phase weight applies uniformly across VTS + paper paths. Both want consistent confidence-value computation.

### 1.6 SIM §6.5 — Trailing Exit Controller

**Not touched in B67.2.** TEC modulation by phase is a B67.5 #5 consumer concern (and gated on sourcePool there, not here). B67.2 only modulates the confidence VALUE — consumers handle their own gating.

### 1.7 SIM §10.2 — REST API Routes

`/api/vts/regime-state` extended with phase + age fields. Additive; existing consumers see new optional fields. No breaking change.

---

## 2. Coexistence requirements

### 2.1 B62 DBS-integrated classifier

Phase computed alongside regime; does NOT modify classification logic. **No conflict.**

### 2.2 B63 mode-overlay-bypass for `sourcePool='quant-strong_trend'`

Already established: B67.2 modulates confidence VALUE only. Consumption-side bypass (TEC mode overlay) is B67.5 #5 territory. **No B67.2 sourcePool gate needed.** Reconfirmed Langston cc-inbox #842.

### 2.3 B63 Item 11 — strong_bull_trend + vwap_pullback in strong-trend lane

Both strategies have phase-preference weights in the 54-cell table:
- `vwap_pullback` EARLY=0.90, PRIME=1.10, LATE=0.95 (cell #2)
- `strong_bull_trend` EARLY=1.05, PRIME=1.10, **LATE=0.85** (cell #18)

Strong-trend lane participants get the SAME phase modulation as their normal-lane counterparts. **The strong-trend lane bypass is an EXIT-side behavior** (mode overlay) — entry-side admission still applies all confidence modulators. So phase-preference applies to strong-trend-lane entries. This is intentional and addresses the canonical 04-22 case (LATE strong_bull_trend = exhaustion).

**Caveat:** the phase weight is a multiplier on confidence used at admission. Strong-trend-lane signals have their own confidence math (Path D, B63 Item 12 native geometry); the phase multiplier sits on top of MCE's regime confidence, which strong-trend signals consume same as everyone else. **Verified at Step 3 that the modulation point is upstream of strong-trend-lane geometry override** — geometry override changes stops/targets, not the confidence number.

### 2.4 Pattern Pool guardrails (FINAL_SCORE_FLOOR=0.45, MAX_POSITION_PCT=15)

Pattern Pool sits in FinalScore + position sizing. B67.2 does NOT touch FinalScore (regime confidence is not a FinalScore input today, B63 Item 18). **No conflict.** Reconfirmed.

### 2.5 B67.0 ablation framework

Standard wire-up: populate `alternate_decision` JSONB at the existing B67.0 hook with B67.2 shape. **No emitter API change.**

### 2.6 B67.1 (sister sub-deliverable)

B67.1 modulates `RegimeClassification.confidence` post-classification (in `calculatePairRegime`). B67.2 multiplies the (possibly B67.1-modulated) confidence by a phase weight at admission. The two compose:

```
classifier_confidence_raw      (from calculatePairRegime input branches)
× macro_modifier               (B67.1)        ← applied inside calculatePairRegime
× strategy_phase_weight        (B67.2)        ← applied at signal-orchestrator admission
= effective_admission_confidence
```

When both `b67_1_enabled=false` AND `b67_2_enabled=false`: identity (modifier=1.0, weight=1.0). No effect.

When one is enabled: that one's effect only. Clean per-factor attribution via B67.0 ablation rows.

When both enabled: effects compose multiplicatively. Bounds: B67.1 ∈ [0.85, 1.05], B67.2 ∈ [0.80, 1.10] → composed range ∈ [0.68, 1.155]. Composed clamp NOT needed because confidence will already be clamped post-B67.1 (to [0.4, 1.0]) and phase-weight composition happens at admission, not in confidence storage. **No double-clamp issue.**

**B67.5 pre-registration note (Langston cc-inbox #844):** Effective admission-confidence range under both factors is `[0.4 × 0.80, 1.0 × 1.10] = [0.32, 1.10]`. The 0.32 lower bound is below the pre-B67 0.4 floor. **Decorative today** (no consumer reads confidence as a gate, per B63 Item 18). Becomes material when B67.5 wires consumers — B67.5 scope must define a post-composition floor so Kelly sizing and EV gate don't see sub-0.4 inputs. Not blocking B67.2 ship; documented here and in B67.2 scope §9 for downstream batch.

### 2.7 B65.1 `module_constants` infrastructure

4 rows under `regime_phase` module (3 scalar + 1 JSONB blob). Existing infrastructure handles JSONB constants transparently. **No conflict.**

### 2.8 B71 Drift Dashboard (Analytics page)

Drift dashboard already shows regime distribution. Adding phase distribution is a future UI improvement, not in B67.2 scope. **No conflict.**

---

## 3. Blast radius summary

| Component | Pre-B67.2 | Post-B67.2 | Net change |
|---|---|---|---|
| `calculatePairRegime` | HIGH | HIGH | Zero — not modified |
| `MCE.computeContext` | HIGH | HIGH | Two additive fields on RegimeContext |
| Signal Orchestrator admission | HIGH | HIGH | Phase-weight multiplier on regime confidence (continuous-scoring, not a gate) |
| VTS Runner mirror | HIGH | HIGH | Same multiplier |
| FinalScore / Kelly / EV / TEC / RankingScore | NOT TOUCHED | NOT TOUCHED | Zero — B67.5 territory |
| Pattern Pool guardrails | NOT TOUCHED | NOT TOUCHED | Zero |
| Strong-trend lane (B63) entry side | applies confidence | applies same confidence multiplied by phase weight | Confidence value modulated; geometry override unchanged |
| Strong-trend lane EXIT side (mode overlay) | bypassed | bypassed | Zero — B67.5 #5 territory |
| `regimePhaseStore` (NEW singleton) | n/a | in-memory only | Cold-start warmup acceptable, pattern from B63 Item 16 |
| API: `/api/vts/regime-state` | regime fields | regime + phase + age fields | Additive |

---

## 4. Code-level inspection summary (files to be modified)

| File | Lines inspected | Modification scope confirmed |
|---|---|---|
| `server/core/metrics/market-regime.ts` | n/a | NOT modified by B67.2 |
| `server/services/market-context-engine.ts` | 124-180 | Insert `regimePhaseStore.tick + computePhase` after `calculatePairRegime`; attach phase + age to MarketContext |
| `server/types/market-context.ts` | 51-70 (`RegimeContext` interface) | Extend with `phase: 'EARLY' \| 'PRIME' \| 'LATE'` + `phaseAgeSeconds: number` |
| `server/services/signal-orchestrator.ts` | line 617 (B67.0 hook), admission flow upstream | Phase weight lookup + multiplication on regime confidence used in SQE input. Exact field name confirmed at Step 3. |
| `server/services/vts-runner.ts` | line ~1349 (B67.0 hook), confidence flow upstream | Same multiplication on VTS mirror path |
| `server/services/factor-ablation-emitter.ts` (call sites) | (not yet inspected) | Populate `alternate_decision` JSONB with B67.2 shape — no API change |
| `server/routes.ts` | `/api/vts/regime-state` handler | Extend response with phase + age per pair |
| `server/config/canonical-regime-strategy-map.ts` | 147-335 (per-regime strategy lists) | OPTIONAL doc comments. JSONB is source of truth. No code change in v1. |

---

## 5. Open questions — resolved (Langston cc-inbox #844)

1. **§5.1 — Phase weight multiplicative on confidence:** RESOLVED. Confirmed multiplicative, not additive. The §0.10.B "REPLACES not multiplied" rule is about FinalScore RegimeWeight removal, not confidence modulation. Two different levels.
2. **§5.2 — Shared utility `applyPhasePreference()` in `regime-phase.ts`:** RESOLVED. Yes — shared function called from both signal-orchestrator and vts-runner. Inlining the same logic in two files violates the lockstep-parity discipline from B67 V2 pre-audit §3.3.
3. **§5.3 — `regimePhaseStore` cold-start:** RESOLVED. Tolerable. Same pattern as `directional-bias-store` (B63 Item 16). Worst-case post-restart distortion: 0.80 vs 1.10 = 30% confidence swing for ~2h. PM2 auto-restarts are rare on staging; production restarts are planned. No deploy-side seed mechanism for v1.
4. **§5.4 — Phase-transition log volume:** RESOLVED. Fine. ~2.5 lines/min during boundary-cross bursts is trivial for PM2. Transitions ARE operationally interesting — exactly what to eyeball during the first 24h shadow soak.

---

## 6. Verification plan (Step 7 first-pass)

After staging deploy in shadow mode:

1. PM2 logs grep `[B67.2][transition]` — confirm transitions emit on regime change AND on age boundary cross
2. `GET /api/vts/regime-state` — every pair has `phase` + `phaseAgeSeconds` fields
3. `psql ... 'select alternate_decision from regime_factor_alternates where alternate_decision->>''factor_name'' = ''b67_2_phase_dimension'' limit 5'` — JSONB shape populated even in shadow
4. `select value from module_constants where module_name='regime_phase'` — 4 rows, JSONB blob has 54 keys
5. After 24h: flip `b67_2_enabled=true`. Confirm modulation appears in PM2 logs; ablation row shows `confidence_with_phase_pref !== confidence_without_phase_pref`
6. Sanity check: 04-22-style aged TFS pair (regime age > 12h) shows phase=LATE; weight lookup for `strong_bull_trend_LATE` returns 0.85; effective confidence is reduced

---

## 7. Cross-references

- `BATCH_67_2_SCOPE.md` (companion)
- `B67_2_STRATEGY_PHASE_WEIGHT_SEEDS.md` — 54-cell weight table (Langston-approved cc-inbox #843)
- `BATCH_67_PRE_AUDIT.md` V2 (macro-B67 SIM)
- `BATCH_67_1_PRE_AUDIT.md` — sister sub-deliverable, B67.1 ↔ B67.2 composition documented in §2.6
- `REGIME_OVERHAUL_AND_EXTERNAL_DATA_PLAN_2026_04_27.md` §0.2, §5.3
- `1-system-manual/SYSTEM_IMPACT_MAP.md` §4.1, §5.1c (regimePhaseStore precedent), §5.2.5, §7.1, §10.2

*End of B67.2 pre-audit.*
