# B79.0n.SCORING — Signal Quality Evaluator + FinalScore Composition per-class

**Status:** Step 1 draft, awaiting Langston ACK.
**Sub-batch:** #8 of 18 in B79.0n umbrella v4 arc. Parallel-eligible with TEC (#9).
**Date:** 2026-05-25 evening (overnight autonomous run per Kyle directive).
**Author:** Claude Code.

---

## §-1 Prior arc & framing

The B79 / B79.0n arc has progressively pushed `assetClass: AssetClass` through every component in the active-trading pipeline (STORAGE → MCE → PATTERN-DETECT → STRATEGY → CONFIDENCE-CHAIN). Per umbrella v4 row 8, this batch is the **signal-quality + final-score composition** surface. Three architectural truths shape the scope:

1. **SQE input gate is already type-locked per-class.** `SQEInput.assetClass: AssetClass` is REQUIRED (B79.0n.STORAGE 2026-05-21). `signalQualityEvaluator.getThresholds(mode, assetClass)` caches per `${mode}:${assetClass}` (no cross-class leak).
2. **Layer 2 `module_constants 'sqe_config'` is EXPLICITLY DEFERRED.** Code comment at `signal_quality_evaluator.ts:128`: *"Layer 2 (module_constants 'sqe_config') stays wildcard for this batch (per-class deferred to SCORING — see RUNNING_ISSUES module_constants asymmetry)."* THIS IS THE LOAD-BEARING GAP.
3. **FinalScore composition itself (`calculateFinalScore` + `SCORE_WEIGHTS` + `RANKING_WEIGHTS` + `getPredictiveConfidence`) is class-invariant.** Multiple F-1/F-2 lever decisions are open and Langston-eligible.

Crypto baseline NOT touched (no-touch fence). xstock_spot active-trading wire-in (sub-batch 18 of umbrella v4) DEPENDS on this batch correctly resolving per-class SQE thresholds, otherwise the xstock active-trading flip would inherit crypto thresholds silently.

---

## §0 Live DB state (probed 2026-05-25 evening via staging psql)

```
 sqe_config | *           | min_final_score   | 0.35     ← wildcard still present
 sqe_config | *           | min_regime_weight | 0.30     ← wildcard still present
 sqe_config | crypto_spot | min_final_score   | 0.35     ← B79.0a promotion
 sqe_config | crypto_spot | min_regime_weight | 0.30     ← B79.0a promotion
 sqe_config | xstock_spot | min_final_score   | 0.35     ← B79.0a promotion
 sqe_config | xstock_spot | min_regime_weight | 0.30     ← B79.0a promotion
 sqe_config | xstock_spot | adx_min           | 18       ← B79 xstock-specific
 sqe_config | xstock_spot | di_min_pattern    | 10       ← B79 xstock-specific (= crypto code-default)
 sqe_config | xstock_spot | di_min_quant      | 18       ← B79 xstock-specific (crypto=25 in code)
 sqe_config | xstock_spot | momentum_min      | 0.002    ← B79 xstock-specific (crypto=0.005 in code)
```

**Gaps:**
- No `crypto_perp` or `xstock_perp` rows for ANY sqe_config key.
- No `crypto_spot` rows for `adx_min` / `di_min_quant` / `di_min_pattern` / `momentum_min` — code-side hardcoded baselines (25/10/25/0.005); not promoted to DB.
- Wildcard `(*, *, *, *)` rows for `min_final_score` / `min_regime_weight` STILL PRESENT — B79.0a planned to retire them in B79.0b "after 48h verify gate" but the retirement never landed.

---

## §1 Scope objectives (numbered, verification-criterion each)

### A. Per-class promotion of all SQE keys (DB)

1. **OBJ-1 (Migration 1):** Seed explicit `crypto_perp` + `xstock_perp` rows for `min_final_score` (Day-1 default 0.35, identical to wildcard) and `min_regime_weight` (Day-1 default 0.30, identical to wildcard). Idempotent `INSERT … ON CONFLICT DO NOTHING`. Verification: `SELECT COUNT(*) FROM module_constants WHERE module_name='sqe_config' AND asset_class IN ('crypto_perp','xstock_perp')` returns ≥ 4.

2. **OBJ-2 (Migration 1):** Promote `crypto_spot` rows for the 4 quant/pattern numeric thresholds (`adx_min`, `di_min_quant`, `di_min_pattern`, `momentum_min`) from CODE-side hardcoded defaults to EXPLICIT DB rows. Day-1 values: `adx_min=25`, `di_min_quant=25`, `di_min_pattern=10`, `momentum_min=0.005` (current code-defaults at `signal-orchestrator.ts` quant gate). Verification: 4 new crypto_spot rows present.

3. **OBJ-3 (Migration 2):** Retire `sqe_config` wildcard `(*, *, *, *)` rows for `min_final_score` + `min_regime_weight`. **EXISTS-gated DELETE** confirms crypto_spot + xstock_spot + crypto_perp + xstock_perp explicit rows are all present BEFORE wildcard deletion (same two-step pattern as B79.TEC/B79.0a). Verification: only per-class rows remain; wildcard absent.

### B. Code-side HARD-FAIL doctrine (signal_quality_evaluator.ts)

4. **OBJ-4:** Tighten `getSQEThresholdsFromConfig(mode, assetClass)` precedence chain. The 3-layer cascade (screener_filters → module_constants → static mirror) is intentional for warmup, but the `module_constants` layer should HARD-FAIL on missing per-class row at steady-state. Add observability counter `[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK]` that increments every time the static-mirror layer fires; emit a per-minute log if >0. Verification: zero fallback events expected post-warmup.

5. **OBJ-5:** Type-lock `SQEInput.assetClass` with an `@ts-expect-error` unit test confirming the type system rejects omission. Adds regression-protection for B79.0n.STORAGE's REQUIRED-assetClass discipline.

### C. FinalScore composition class-invariant audit (score-calculator.ts + score-weights.config.ts)

6. **OBJ-6 (F-1/F-2 decision pending):** Audit `SCORE_WEIGHTS.FINAL_SCORE = { HYBRID: 0.4, CONFIDENCE: 0.3, REGIME: 0.2, DECAY: 0.1 }` for class-dependence. Two options:
   - **F-1 (class-invariant, recommended for Day-1):** weights identical for all classes; module_constants `score_weights.<class>.*` row only seeded when class-specific override needed. Caller passes `assetClass` but resolver returns the wildcard.
   - **F-2 (per-class from Day-1):** every class has its own 4 weight rows in `module_constants`. xstock_spot may want different HYBRID weight if pattern signals are noisier (lower-frequency vs crypto cadence).
   - **Decision requested:** D-1 (Langston) — F-1 or F-2 at Day-1?

7. **OBJ-7 (F-1/F-2 decision pending):** Audit `RANKING_WEIGHTS[QUANT|PATTERN|HYBRID]` (signalType-keyed, used by RTB queue ordering via `computeRankingScore`). Currently class-invariant. Same F-1/F-2 question.
   - **Decision requested:** D-2 (Langston) — same.

8. **OBJ-8 (cache-key fix, F-2):** `getPredictiveConfidence(symbol, regime, strategy)` uses cache key `${regime}:${strategy}` — NOT per-class. xstock BULL_STABLE/momentum_breakout winRate is structurally distinct from crypto BULL_STABLE/momentum_breakout winRate. Fix: thread `assetClass: AssetClass` REQUIRED into the signature; cache key `${assetClass}:${regime}:${strategy}`. Caller threading at `signal_quality_evaluator.ts:264` + `rtb/ready_to_buy_service.ts` (locate via grep). Confirmed F-2 (cross-class telemetry contamination is observably wrong).

9. **OBJ-9 (F-1/F-2 decision pending):** Audit `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR = 0.45` (`asset_classes/crypto_spot/pattern-pool-filters.ts`). Universal currently. xstock pattern pool will have different liquidity + signal cadence profile.
   - **Decision requested:** D-3 (Langston) — F-1 or F-2? Note: xstock has its own pattern-pool-filters file at `asset_classes/xstock_spot/pattern-pool-filters.ts` per B78 (verify path); the guardrail constant may already be per-file but const-imported via `crypto_spot/`. Need confirmation.

### D. VTS Runner mirror-scoring parity (vts-runner.ts)

10. **OBJ-10:** SIM §1.1 documents "VTS Runner mirrors this logic" referring to FinalScore composition. Audit the mirror path in `server/services/vts-runner.ts` to confirm per-class `assetClass` threading is identical to signal-orchestrator's primary path. Capture caller-surface table in pre-audit.

### E. Per-batch invariants (CLAUDE.md §5)

11. **OBJ-11:** All 4 GitHub Actions checks GREEN at head commit (TypeScript Check / Test Suite / Build / Docker Build) per §5 #19.

12. **OBJ-12:** No new `as any` / `@ts-ignore` / non-null `!` in production files. `@ts-expect-error` confined to dedicated type-lock test harness (`b79-0n-scoring-required-assetclass.test.ts`).

13. **OBJ-13:** Local tsc baseline `494` unchanged. Local vitest passes all new + existing tests.

14. **OBJ-14:** Crypto regression check vs pre-deploy 24h baseline post-staging-deploy: FX5 pool size, signal generation rate, VTS trade rate all within ±5%.

### F. Phase 24 standing rule (CLAUDE.md §3.3)

15. **OBJ-15:** Completion report includes "Asset-class onboarding workflow learnings" 4-section block (what worked, what surprised us, recurring patterns, concrete edits to `ASSET_CLASS_ONBOARDING_WORKFLOW.md` — specifically a new §4.15 entry codifying the SQE-per-class promotion pattern).

### G. Step 10 governance (all 8 docs ACTUALLY edited)

16. **OBJ-16:** `BATCH_CATALOG.md` + `PHASE_HISTORY.md` + `SIM` (new "Recent Additions (B79.0n.SCORING)" section) + `SYSTEM_MANUAL.md` (per-class SQE addendum) + `ASSET_CLASS_ONBOARDING_WORKFLOW.md` §4.15 + `MULTI_ASSET_VTS_EXPANSION_PLAN.md` + `CHANGES_AND_FIXES.md` + `RUNNING_ISSUES.md` (close out the SQE-per-class deferred-from-STORAGE issue).

---

## §2 F-1 / F-2 lever inventory

| Lever | Current state | Recommended Day-1 | Rationale |
|---|---|---|---|
| `min_final_score` | DB per-class (crypto_spot + xstock_spot = 0.35) | **F-1 (identical 0.35 for all 4 active classes)** | No empirical reason to differ pre-evidence; B79.0a left them aligned. |
| `min_regime_weight` | DB per-class (0.30) | **F-1 (identical 0.30 for all 4)** | Same. |
| `adx_min` | xstock_spot=18; crypto code-default=25 | **F-2 (xstock=18 / crypto=25)** | Equity ADX magnitude ~half crypto's per xstock seed migration comments. |
| `di_min_quant` | xstock=18 ; crypto code-default=25 | **F-2 (xstock=18 / crypto=25)** | Same — equity DI magnitude regime. |
| `di_min_pattern` | xstock=10 ; crypto code-default=10 | **F-1 (identical 10)** | Pattern DI threshold class-invariant by current data. |
| `momentum_min` | xstock=0.002 ; crypto code-default=0.005 | **F-2 (xstock=0.002 / crypto=0.005)** | Scaled by ATR% ratio. |
| `SCORE_WEIGHTS.FINAL_SCORE` | Code constant, frozen | **D-1 requested** | Likely F-1 at Day-1 with operator-flip hook. |
| `RANKING_WEIGHTS` profiles | Code constant, signalType-keyed | **D-2 requested** | Likely F-1 at Day-1. |
| `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` | 0.45 universal | **D-3 requested** | Possible F-2 (xstock pattern liquidity differs). |
| `getPredictiveConfidence` cache key | `${regime}:${strategy}` | **F-2 (`${assetClass}:${regime}:${strategy}`)** | Cross-class telemetry contamination is observably wrong; not a real D-decision. |

---

## §3 Hostile-scenario sim (red-team)

**Q1:** What if Langston says "drop OBJ-2 — code-side hardcoded defaults are fine"?
**A:** Argue against. Per CLAUDE.md §11 "No hard-coded fallbacks for DB-governed settings. If it should come from the DB, fail hard if DB is empty — don't silently use a default." The promotion is a NO-PATCHES discipline alignment, not a feature change.

**Q2:** What if `score_weights` module never gets a per-class override in practice?
**A:** Acceptable. The F-1 default with operator-flip is the right Day-1; we only pay implementation cost for the resolver hook + caller threading. If F-2 is never needed, the hook is dormant. If F-2 IS needed in B81 or later, the surface is already type-locked.

**Q3:** What if predictive-confidence cache key change breaks an in-flight ROI gate?
**A:** ROI gate at `signal_quality_evaluator.ts:264` consults `getPredictiveConfidence(canonicalSymbol, input.regime, input.strategy)`. Threading `input.assetClass` is a 1-line caller edit. The cache contents reset on signature change (key shape diff) — first-cycle behavior degrades to neutral 0.5 fallback for ~60s, then warms up. Acceptable transient.

**Q4:** What if wildcard SQE row retirement triggers a no-row error on a refresh?
**A:** Migration 2 EXISTS-gates the DELETE on per-class rows existing first. If a future SQE caller passes an unknown asset class, `getCachedNumberRequired` throws → SQE falls back to static mirror (intentional warmup defense). The static-mirror fallback observability counter (OBJ-4) surfaces any unexpected use.

---

## §4 Test plan

1. **`b79-0n-scoring-required-assetclass.test.ts`** — type-lock tests: `@ts-expect-error` on `SQEInput` omitting `assetClass`, on `getSQEThresholdsFromConfig` omitting it, on `getPredictiveConfidence` omitting it.
2. **`b79-0n-scoring-perclass-resolve.test.ts`** — verify `getSQEThresholdsFromConfig('paper', 'crypto_perp')` returns DB row (post-migration) NOT static mirror.
3. **`b79-0n-scoring-static-mirror-counter.test.ts`** — confirm `[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK]` counter increments only when `module_constants` cache is cold.
4. **`b79-0n-scoring-predictive-confidence-isolation.test.ts`** — verify `${assetClass}:${regime}:${strategy}` cache key isolates crypto vs xstock predictions.
5. **Update existing `finalscore-equivalence.test.ts`** — confirm F-1 default works for all 4 active classes (identical FinalScore for identical inputs).
6. **Update `b79-0n-storage-sqe-asset-class-routing.test.ts`** — extend coverage to crypto_perp + xstock_perp post-migration.

---

## §5 Implementation chunks (preview — final shape pending Langston Step 1 ACK)

| Chunk | Files | Purpose |
|---|---|---|
| 1 | `drizzle/migrations/2026-05-26-b79-0n-scoring-perclass-seed.sql` + rollback + `drizzle/migrations/MANIFEST.txt` | Migration 1: per-class promotion (perp + crypto_spot numeric thresholds). |
| 2 | `drizzle/migrations/2026-05-26-b79-0n-scoring-wildcard-retire.sql` + rollback + MANIFEST | Migration 2: EXISTS-gated wildcard delete. |
| 3 | `server/core/filters/signal_quality_evaluator.ts` + `server/core/utils/score-calculator.ts` | OBJ-4 (static-mirror counter), OBJ-5 (type-locks), OBJ-8 (predictive-confidence assetClass threading). |
| 4 | `server/services/vts-runner.ts` + `server/services/signal-orchestrator.ts` + `server/core/rtb/ready_to_buy_service.ts` | OBJ-10 (mirror parity), OBJ-8 caller threading. |
| 5 | `server/config/score-weights.config.ts` + `server/config/ranking-weights.ts` (conditional on D-1/D-2/D-3) | F-1 vs F-2 resolver hooks per Langston decisions. |
| 6 | `server/tests/unit/b79-0n-scoring-*.test.ts` (3-5 new) + existing updates | OBJ-5 + OBJ-12 + regression coverage. |
| 7 | Local `npx tsc --noEmit` + `npx vitest run` + `gh run watch` (CI all-4-green) | OBJ-11 + OBJ-13. |

---

## §6 Open clarifications for Langston (D-decisions)

- **D-1:** F-1 or F-2 for `SCORE_WEIGHTS.FINAL_SCORE` weights at Day-1?
- **D-2:** F-1 or F-2 for `RANKING_WEIGHTS` QUANT/PATTERN/HYBRID profiles at Day-1?
- **D-3:** F-1 or F-2 for `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR`? (Need xstock pattern-pool-filters file path confirmation as part of this.)
- **D-4:** OK with crypto_spot numeric-threshold promotion to DB (OBJ-2) at Day-1 = current code defaults, OR seed slightly different values to reflect any in-flight tuning evidence?
- **D-5:** OK with EXISTS-gated wildcard retirement (OBJ-3) shipping in the SAME batch as the promotion (Migration 1 + Migration 2 sequenced in one deploy), OR split into B79.0n.SCORING + B79.0n.SCORING.b two-step like B79.TEC / B79.TEC.b?

---

## §7 Out of scope

- TEC surface (separate batch #9, parallel-eligible).
- `getPredictiveConfidence` algorithm-level changes (sigmoid coefficient, winRate source). This batch is structural / type-system only.
- xstock active-trading flip (sub-batch 18 of umbrella v4).
- Hybrid-score composition (consumed BY `calculateFinalScore` via `hybridScore` input; not the same surface).
- Quality_index pipeline (separate concern; touched only by import-shape verification).

---

## §8 Workflow disposition

After Step 1 ACK from Langston with D-1..D-5 dispositions, Step 2 pre-audit goes DEEPER on caller surfaces (compile-driven probe for all `calculateFinalScore` + `SCORE_WEIGHTS` + `RANKING_WEIGHTS` + `getPredictiveConfidence` consumers). Implementation chunks 1-7 sequenced; CI must remain GREEN. Standard close: Step 4 dispatch / Step 5 push / Step 6 deploy / Steps 7-8 verification / Step 10 governance (ALL 8 docs ACTUALLY edited) / Step 11 completion report.

Sequencing with B79.0n.TEC: separate batches, separate commits, separate CI confirmations per CLAUDE.md §5 #19. No file overlap expected (SCORING touches `core/filters/` + `core/utils/` + `config/` + `core/rtb/`; TEC touches `services/trailing-exit-controller.ts` + `services/tec-evaluator.ts`). Pre-audit Step 2 will confirm no overlap.

---

*Reply ACK / REVISIONS / D-1..D-5 dispositions. If [SILENT], CC proceeds with recommended Day-1 dispositions per §2 (F-1 for D-1/D-2; F-2 for D-3 with own-file check; default values for D-4; single-batch sequencing for D-5).*
