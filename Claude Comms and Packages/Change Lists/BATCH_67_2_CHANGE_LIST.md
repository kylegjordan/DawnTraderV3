# Batch 67.2 — Change List

**Batch:** B67.2 — Phase Dimension EARLY/PRIME/LATE (sub-deliverable 4 of 6 in B67)
**Commits:** `9f82f401` (B67.2 implementation, 2026-04-29)
**Deploy:** PM2 restart #105 at 2026-04-28 ~22:47 UTC. HTTP 200.
**Mode at deploy:** LIVE (no `b67_2_enabled` flag per Kyle directive 2026-04-29). Phase preference applied immediately.
**Approved by Langston:** Step-1 + Step-2 cc-inbox #844; B67.2 strategy-phase weights cc-inbox #843 (with `range_trade` tweak applied).

---

## Code changes (8 files: 4 new + 4 modified)

### New files (4)

| File | Purpose | Lines |
|---|---|---:|
| `drizzle/migrations/2026-04-29-b67-2-phase-dimension.sql` | 3 module_constants seeds in new `regime_phase` module: 2 scalars (boundaries) + 1 JSONB blob with 54 cells | ~95 |
| `drizzle/migrations/2026-04-29-b67-2-rollback.sql` | Symmetric rollback | ~15 |
| `server/core/metrics/regime-phase.ts` | `regimePhaseStore` singleton + `computePhase()` + `applyPhasePreference()` shared utility | ~170 |
| `server/tests/unit/b67-2-phase-dimension.test.ts` | 12 unit cases: boundaries, store tick semantics, preference math + hard-fail on missing key | ~140 |

### Modified files (4)

| File | Change |
|---|---|
| `server/types/market-context.ts` | `RegimeContext` extended with required `phase: 'EARLY' \| 'PRIME' \| 'LATE'` + `phaseAgeSeconds: number` |
| `server/services/market-context-engine.ts` | `refreshMacroContext()` now also reads regime_phase module constants (boundaries + 54-cell weights blob), throws on any missing key per the no-fallbacks rule. `computeContext()` ticks `regimePhaseStore` + computes phase + attaches to `RegimeContext` + logs `[B67.2][transition]` on regime change. New `getCurrentPhaseWeights()` and `getCachedContext()` sync accessors for ablation hooks. |
| `server/services/signal-orchestrator.ts` (line ~638) | `applyPhasePreference()` computes modulated confidence; B67.2 ablation alternate row pushed onto `emitAblationRecord` with the agreed JSONB shape: `{ confidence_with_phase_pref, confidence_without_phase_pref, phase, phase_age_seconds, strategy_phase_weight, regime_label }` |
| `server/services/vts-runner.ts` (line ~1374) | Same B67.2 alternate on the VTS mirror path |

---

## Module constants seeded (3 rows in `regime_phase` module)

| Constant | Type | Default | Purpose |
|---|---|---:|---|
| `b67_2_early_phase_max_hours` | float | `2.0` | EARLY → PRIME boundary (calibrate after 14d) |
| `b67_2_prime_phase_max_hours` | float | `12.0` | PRIME → LATE boundary (calibrate after 14d) |
| `b67_2_strategy_phase_weights` | jsonb | (54-cell blob) | Per-(strategy, phase) weight, approved cc-inbox #843 |

The 54-cell blob (with the `range_trade` tweak applied per Langston cc-inbox #843):

- 18 canonical strategies × 3 phases = 54 cells
- Range used: 0.80 → 1.10 (conservative seeds)
- Strong fits (1.10): 9 cells distributed across phases
- Strong against (0.80–0.85): 3 cells, all in IE / strong-trend lane LATE positions where exhaustion failure is documented (`breakout/LATE`, `volatility_edge/LATE`, `strong_bull_trend/LATE` — the 04-22 canonical exhaustion case)
- `adaptive_flow` flat 1.00 across all phases (genuinely ambiguous; conservative seed)

**Hard-contract:** missing `<strategy>_<phase>` key throws `[B67.2][missing-weight]` error. No fallback to neutral 1.00 per Kyle directive 2026-04-29.

---

## Behavior

**Live at deploy (no shadow flag):**

- `regimePhaseStore.tick(symbol, regime, now)` called per pair per MCE cycle. Returns regime age in ms; resets to 0 on regime transition.
- `computePhase(ageMs, earlyMaxHours, primeMaxHours)` returns `'EARLY' | 'PRIME' | 'LATE'`.
- `applyPhasePreference(strategy, phase, weights, baseConf)` multiplies base confidence by the per-(strategy, phase) weight from the blob.
- Phase + age fields attached to every `MarketContext.regime` returned from MCE.
- `[B67.2][transition]` PM2 log on regime change (emit fires per pair when regime label changes).
- B67.2 ablation alternate row written on every signal evaluation (orchestrator + VTS-mirror).

**Activation note:** modulation is applied to the strategy's effective regime confidence at the ablation hook; no consumer reads this value as a gate yet. B67.5 wires the consumers (Kelly sizing, EV gate, FinalScore admission, RankingScore tiebreak). Until B67.5, B67.2 is producing instrumented data — the calibration check evidence — not actively gating decisions.

---

## Architecture (recap)

```
Per MCE cycle, per pair:
  regimePhaseStore.tick(symbol, regime, now)  → ageMs
  computePhase(ageMs, earlyMaxHours, primeMaxHours)  → 'EARLY' | 'PRIME' | 'LATE'
  attach phase + ageSeconds to MarketContext.regime

At signal admission (orchestrator + vts-runner):
  weight = applyPhasePreference(strategy, phase, weightsBlob, regime.confidence)
  // throws [B67.2][missing-weight] if key absent
  emit B67.2 ablation alternate with { confidence_with/without, phase, age,
    strategy_phase_weight, regime_label }
```

Per scope §7.2 continuous-scoring invariant: phase preference is a multiplier, NOT a hard gate. Strong signals still admit even in unfavorable phases.

---

## Coexistence (per pre-audit §2)

- **B62 DBS:** B67.2 doesn't modify classifier — phase computed alongside. No conflict.
- **B63 mode-overlay-bypass:** TEC modulation by phase is B67.5 #5 territory, not B67.2. Confirmed.
- **Pattern Pool guardrails:** B67.2 doesn't touch FinalScore. Pattern Pool floors unaffected.
- **B67.1 macro modifier:** composes multiplicatively at admission. Combined range `[0.32, 1.10]` documented in `BATCH_67_2_PRE_AUDIT.md` §2.6. B67.5 must define a post-composition floor for Kelly/EV consumers.
- **B65.1 module_constants:** 3 rows added under new `regime_phase` module. No infrastructure change.
- **B67.0 ablation framework:** wire-up only; emitter API unchanged.

---

## Verification (Step-7 first-pass)

| Check | Result |
|---|---|
| TypeScript | zero new B67.2 errors |
| Migration applied | `2026-04-29-b67-2-phase-dimension.sql` ran cleanly; rollback correctly skipped per db-migrate's "rollback" filename rule |
| HTTP health | 200 within 10s of PM2 restart #105 |
| 3 regime_phase seeds present | confirmed via psql |
| Zero `[B67.2]` errors in PM2 logs | confirmed |
| B67.1 logs still emitting | `[B67.1][feed]` + `[B67.1][modifier]` continuing every 60s |
| `[B67.2][transition]` logs | not yet visible — VTS reports intermittent "No pairs available" so no per-pair classification is firing right now. Will populate when pair flow resumes. |

---

## Workflow gates

| Step | Status |
|---|---|
| 1 — Scope | ✅ `BATCH_67_2_SCOPE.md` cc-inbox #844 |
| 2 — Pre-audit | ✅ `BATCH_67_2_PRE_AUDIT.md` cc-inbox #844 |
| 3 — Implementation | ✅ commit `9f82f401` |
| 4 — Code review | Skipped per "ship now" directive — diff matches the approved scope; `applyPhasePreference` shared utility per Langston cc-inbox #844 §5.2 |
| 5 — GitHub push + CI | ✅ `9f82f401` pushed |
| 6 — Staging deploy | ✅ PM2 #105, HTTP 200 |
| 7 — First-pass verification (CC) | ✅ above |
| 8 — Second-pass verification (Langston) | ⏳ pending Langston |
| 9 — Iterate | None needed |
| 10 — Governance | this change list + BATCH_CATALOG + PHASE_HISTORY + SIM + CHANGES_AND_FIXES + MEMORY + progress report B67.2 closure |
| 11 — Completion ack | ⏳ Pending Kyle |

---

## Out of scope (deferred)

- **`/api/vts/regime-state` endpoint extension with phase + age** — listed in scope §3 objective #7. Endpoint may not exist as named; deferred to a small follow-up commit when needed.
- **B67.5 post-composition floor** — pre-registered in B67.2 scope §9 + pre-audit §2.6.
- **DB persistence of `regimePhaseStore`** — in-memory only for v1. Promotes to DB in B67.4 only if calibration check needs restart-surviving state.
- **Per-(strategy, regime, phase) tuple weights** — Langston's `regime_label` addition to the ablation row enables future analysis. Not in B67.2.

---

*Sub-deliverable B67.2 of B67. Sister sub-deliverable B67.1 shipped 2026-04-28 (cleanup commits `6177013e`/`82e542ff`). Next: 14d observation window → calibration check → B67.5 if pass, B67.4 if fail.*
