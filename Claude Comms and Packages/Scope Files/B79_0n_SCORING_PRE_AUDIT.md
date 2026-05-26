# B79.0n.SCORING — Step 2 Pre-Audit

**Status:** Step 2 draft, post Langston Step 1 ACK incorporating D-1..D-5 + R-1..R-5.
**Date:** 2026-05-25 evening (overnight autonomous run).
**Author:** Claude Code.

---

## §1 Langston dispositions incorporated

| D/R | Langston disposition | This pre-audit |
|---|---|---|
| D-1 (SCORE_WEIGHTS F-1 vs F-2) | **F-1** with resolver hook | §3.1 caller surface; resolver-hook design §4.1 |
| D-2 (RANKING_WEIGHTS F-1 vs F-2) | **F-1** same hook | §3.2 caller surface; resolver-hook design §4.2 |
| D-3 (PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR) | **F-2 structurally, F-1 value-wise**; pre-audit must confirm xstock-side file existence + import shape | §3.3 — **xstock_spot/pattern-pool-filters.ts EXISTS** (5871 bytes), already DB-resolved via `getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min')` getter. D-3 structurally already done. |
| D-4 (crypto_spot numeric promotion values) | **Code defaults verbatim** | §5 migration 1 spec uses crypto-side hardcoded baselines (25/25/10/0.005) |
| D-5 (single-batch vs two-step) | **TWO-STEP**: B79.0n.SCORING + B79.0n.SCORING.b after 48h verify-gate | §6 sequencing: this batch ships promotion + code + counter only. Wildcard retirement deferred to B79.0n.SCORING.b. |
| R-1 (B79.0a/B79.0b history) | Investigate why retirement never landed | §2 finding: B79.0a Step 3 (commit `a327964a5`, migration `2026-05-08-b79-0a-sqe-wildcard-promotion.sql`) landed. B79.0b RETIREMENT MIGRATION WAS NEVER WRITTEN — no commit matches `*b79-0b*sqe*` or `*b79-0b*wildcard*`. Conclusion: scheduling drift only, no counter event blocker. Filing RUNNING_ISSUES note to that effect. |
| R-2 (deploy outside NYSE 13:30 UTC) | Schedule deploy outside window | §6 deploy-window constraint logged. |
| R-3 (§4.15 onboarding pattern = two-step) | Pattern must reflect two-step | §7 governance plan: onboarding §4.15 entry explicitly codifies "promote-then-retire two-step." |
| R-4 (No-touch fence wording in completion report) | One explicit sentence | §7 governance plan: completion report `§structural-vs-tuning` paragraph drafted. |
| R-5 (Resolver consumption verification probe) | One-line probe in Step 7 | §6 Step 7 verification: dedicated probe `signal-orchestrator` log tail confirming per-class threshold-values. |

---

## §2 Architectural baseline (deeper than Step 1.a)

### 2.1 SQE thresholds resolver — 3-layer cascade

`signal_quality_evaluator.ts:128-165` `getSQEThresholdsFromConfig(mode, assetClass)`:
1. **Layer 1 — `storage.getScreenerFilters({ mode, assetClass })`** (per-class since B79.0n.STORAGE)
2. **Layer 2 — `getCachedNumberRequired('sqe_config', 'min_final_score', _SQE_GK)`** with wildcard key — THE GAP THIS BATCH CLOSES
3. **Layer 3 — `SQE_DEFAULT_THRESHOLDS` static const mirror** — fired ONLY when Layer 2 cache cold

### 2.2 Per-class threshold cache (`SignalQualityEvaluatorService.cachedThresholds`)

Cache key `${mode}:${assetClass}` (B79.0n.STORAGE) — already class-isolated. No work required.

### 2.3 FinalScore composition path

| Layer | File | Role |
|---|---|---|
| Definition | `server/config/score-weights.config.ts` | `SCORE_WEIGHTS.FINAL_SCORE = { HYBRID: 0.4, CONFIDENCE: 0.3, REGIME: 0.2, DECAY: 0.1 }` — `Object.freeze`d |
| Primary composer | `server/core/utils/score-calculator.ts` | `calculateFinalScore(metrics)` — single-shape, no class param |
| Volatility-adjusted | `server/core/metrics/adaptive-goals-weight.ts` | `adjustWeightsForVolatility()` adds/subtracts boost — no class param |
| Quality-index re-composer | `server/core/metrics/quality_index.ts:303` | Calls `calculateFinalScore` for the quality_index composition |
| Inline re-composer | `server/core/rtb/ready_to_buy_service.ts:643, 867, 1097` | Reads `SCORE_WEIGHTS.FINAL_SCORE` directly for inline composition + calls `calculateFinalScore` |

### 2.4 RankingScore composition (RTB queue ordering, NOT SQE gate)

`server/config/ranking-weights.ts` — `RANKING_WEIGHTS[QUANT|PATTERN|HYBRID]` profiles. Used by `computeRankingScore(finalScore, normalizedNetReturn, frictionPenalty, contextBonus, signalType)` — signalType-keyed, no class param.

Caller (per grep): `server/core/rtb/ready_to_buy_service.ts` ×3.

### 2.5 PredictiveConfidence cache (telemetry-derived)

`server/core/utils/score-calculator.ts:21` `predictiveConfidenceCache: Map<string, ...>` with key `${regime}:${strategy}` — **NOT per-class**. xstock + crypto telemetry winRate collapse to same cache slot. F-2 fix required (D-5 question moot — empirically wrong).

Callers (per grep):
- `signal_quality_evaluator.ts:264` — ROI gate computation
- `server/core/rtb/ready_to_buy_service.ts` (need exact line numbers in implementation; not blocking pre-audit)

### 2.6 D-3 confirmation: xstock_spot/pattern-pool-filters.ts EXISTS

`server/asset_classes/xstock_spot/pattern-pool-filters.ts` (5871 bytes, last modified May 25 — same day as PATTERN-DETECT close). Inspected for `FINAL_SCORE_FLOOR`:

- Line 72: `export const XSTOCK_PATTERN_POOL_GUARDRAILS = { ... }`
- Line 73: `get FINAL_SCORE_FLOOR(): number { return getCachedNumberRequired('pattern_pool_gates', 'pattern_final_score_min', _PATTERN_KEY); }`
- Line 88-96: deprecated `XSTOCK_SPOT_PATTERN_FINAL_SCORE_FLOOR = 0.45` + `XSTOCK_SPOT_PATTERN_POOL_GUARDRAILS` (Phase 16 removal target)

**Conclusion:** D-3 is already structurally per-class. Both file ownership + DB resolution are in place. The remaining work for SCORING is:
- Verify crypto_spot side has equivalent structure (likely YES via similar B79.0n.PATTERN-DETECT migration); if so, no D-3 code work needed.
- F-1 value-wise both = 0.45 (no value change).

### 2.7 SQE module_constants DB state (probed 2026-05-25 evening)

Already enumerated in scope §0. Repeating for completeness — 10 rows total, gaps:
- crypto_perp + xstock_perp: 0 sqe_config rows
- crypto_spot: only min_final_score + min_regime_weight
- xstock_spot: 6 rows (the 2 promoted + 4 xstock-specific scaled-down)
- wildcard: 2 rows (min_final_score=0.35, min_regime_weight=0.30)

---

## §3 Per-component upstream + downstream + blast-radius (SIM-style)

### 3.1 `SCORE_WEIGHTS.FINAL_SCORE` (4-weight constant)

- **Upstream:** none (`Object.freeze` constant)
- **Downstream:** `calculateFinalScore` + `adjustWeightsForVolatility` + `ready_to_buy_service.ts` ×3 + `boot_orchestrator.ts:95` (telemetry banner) + `system-guards.ts:170` (snapshot)
- **Shared state:** the const itself
- **Blast radius:** CRITICAL — FinalScore is THE ranking authority (SIM §1.1)
- **F-1 disposition:** keep `Object.freeze`d shape; add `getScoreWeightsForClass(assetClass)` resolver that returns wildcard until DB row exists (Day-1 = identical). All callers receive AssetClass-aware resolver instead of static const.

### 3.2 `RANKING_WEIGHTS[QUANT|PATTERN|HYBRID]`

- **Upstream:** none (constant)
- **Downstream:** `computeRankingScore` → RTB queue ordering
- **Blast radius:** MEDIUM (RTB ordering, NOT gate)
- **F-1 disposition:** same as 3.1 — resolver hook accepts `(signalType, assetClass)`, returns class-aware profile

### 3.3 `getPredictiveConfidence(symbol, regime, strategy)` — F-2 (cache key fix)

- **Upstream:** `getRegimePerformance(regime, strategy)` from `vts-telemetry.ts`
- **Downstream:** SQE ROI gate, RTB cost-aware checks
- **Blast radius:** MEDIUM (ROI threshold, not signal-quality)
- **F-2 disposition:** signature `getPredictiveConfidence(assetClass, symbol, regime, strategy)`; cache key `${assetClass}:${regime}:${strategy}`; downstream `getRegimePerformance(assetClass, regime, strategy)` audit needed (may already be per-class or may need extension).

### 3.4 SQE Layer 2 module_constants (sqe_config)

- **Upstream:** module_constants table + DB seed migrations
- **Downstream:** `getSQEThresholdsFromConfig` → SQE evaluate path → RTB
- **Blast radius:** CRITICAL — SQE gate authority
- **Disposition:** Migration 1 seeds crypto_perp + xstock_perp + crypto_spot 4 quant/pattern thresholds. Migration 2 (split to B79.0n.SCORING.b per D-5) retires wildcard after 48h.

---

## §4 Code design (chunks)

### 4.1 Score-weights resolver (D-1 F-1 hook)

```ts
// score-weights.config.ts
export function getScoreWeightsForClass(assetClass: AssetClass): typeof SCORE_WEIGHTS.FINAL_SCORE {
  // Day-1: F-1 (class-invariant). Future operator-flip via module_constants 'score_weights' insert.
  // Resolver shape: try per-class row → wildcard row → static const mirror.
  const KEY = { exchange: '*', assetClass, strategy: '*', regime: '*' };
  try {
    return {
      HYBRID: getCachedNumberRequired('score_weights', 'hybrid', KEY),
      CONFIDENCE: getCachedNumberRequired('score_weights', 'confidence', KEY),
      REGIME: getCachedNumberRequired('score_weights', 'regime', KEY),
      DECAY: getCachedNumberRequired('score_weights', 'decay', KEY),
    };
  } catch {
    return SCORE_WEIGHTS.FINAL_SCORE; // wildcard or static-mirror fallback
  }
}
```

Decision: do NOT seed `module_constants.score_weights.*` rows in this batch. Caller threading happens (all consumers gain `assetClass` param), but at Day-1 zero rows means resolver returns static-mirror = F-1.

### 4.2 Ranking-weights resolver (D-2 F-1 hook)

Same pattern as 4.1: `getRankingWeightsForClass(signalType: string, assetClass: AssetClass)`. Day-1 returns static `RANKING_WEIGHTS[signalType]`.

### 4.3 Predictive-confidence cache-key fix (D-5/F-2)

```ts
const predictiveConfidenceCache = new Map<string, { value: number; timestamp: number }>();
// OLD: key = `${regime}:${strategy}`
// NEW: key = `${assetClass}:${regime}:${strategy}`

export function getPredictiveConfidence(
  assetClass: AssetClass,  // NEW REQUIRED param
  symbol: string,
  regime: string,
  strategy: string,
): number {
  const cacheKey = `${assetClass}:${regime}:${strategy}`;
  // ... rest unchanged
}
```

Caller threading: `signal_quality_evaluator.ts:264` + `ready_to_buy_service.ts` (audit count).

### 4.4 SQE static-mirror fallback counter (OBJ-4)

```ts
let _sqeStaticMirrorFallbackCount = 0;
const SQE_STATIC_MIRROR_LOG_EVERY = 100;  // log every 100 fires

// Inside getSQEThresholdsFromConfig catch handler:
_sqeStaticMirrorFallbackCount++;
if (_sqeStaticMirrorFallbackCount % SQE_STATIC_MIRROR_LOG_EVERY === 1) {
  console.warn(
    `[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK] count=${_sqeStaticMirrorFallbackCount} ` +
    `mode=${mode} assetClass=${assetClass} — module_constants cold or row missing`,
  );
}
```

Diagnostic accessor `/api/diagnostics/sqe-fallback-counter` exposing count + most-recent-fire-ts for the 48h verify-gate.

---

## §5 Migration design

### 5.1 Migration 1 — per-class promotion (lands with B79.0n.SCORING)

```sql
-- B79.0n.SCORING — SQE per-class promotion (Migration 1 of 2; the .b sister migration retires wildcards after 48h)
BEGIN;

INSERT INTO module_constants (module_name, exchange, asset_class, strategy, regime, constant_name, value, updated_by)
VALUES
  -- crypto_perp + xstock_perp coverage for the 2 promoted keys
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_final_score', '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),
  -- crypto_spot numeric thresholds (code defaults verbatim per Langston D-4)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'adx_min', '25'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_quant', '25'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_pattern', '10'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'momentum_min', '0.005'::jsonb, 'B79.0n.SCORING')
ON CONFLICT (module_name, exchange, asset_class, strategy, regime, constant_name) DO NOTHING;

-- 8 new rows expected
DO $$
DECLARE
  expected_new int := 8;
  actual_total int;
BEGIN
  SELECT COUNT(*) INTO actual_total FROM module_constants
   WHERE module_name='sqe_config' AND updated_by='B79.0n.SCORING';
  IF actual_total != expected_new THEN
    RAISE EXCEPTION 'B79.0n.SCORING Migration 1 assertion failed: expected % new rows, found %', expected_new, actual_total;
  END IF;
END $$;

COMMIT;
```

### 5.2 Migration 2 — wildcard retirement (DEFERRED to B79.0n.SCORING.b)

Not landing in this batch per D-5. Drafted for context only:

```sql
-- B79.0n.SCORING.b (NEXT BATCH after 48h verify-gate)
DO $$ ... EXISTS-gated delete of (asset_class='*') for min_final_score + min_regime_weight ... $$;
```

---

## §6 Implementation plan + sequencing

Sequencing (per D-5 two-step):

| Chunk | Files | Purpose |
|---|---|---|
| 1 | `drizzle/migrations/2026-05-26-b79-0n-scoring-perclass-seed.sql` + rollback + MANIFEST | Migration 1 only (no wildcard retire yet) |
| 2 | `server/config/score-weights.config.ts` | New `getScoreWeightsForClass(assetClass)` resolver |
| 3 | `server/config/ranking-weights.ts` | New `getRankingWeightsForClass(signalType, assetClass)` resolver |
| 4 | `server/core/utils/score-calculator.ts` | `getPredictiveConfidence` signature change + cache-key fix |
| 5 | `server/core/filters/signal_quality_evaluator.ts` | OBJ-4 static-mirror counter + plumb threaded params |
| 6 | `server/core/rtb/ready_to_buy_service.ts` + `server/services/signal-orchestrator.ts` + `server/services/vts-runner.ts` + `server/core/metrics/adaptive-goals-weight.ts` + `server/core/metrics/quality_index.ts` | Caller threading for resolver hooks + new `assetClass` predictive-confidence param |
| 7 | `server/routes.ts` | New `/api/diagnostics/sqe-fallback-counter` endpoint |
| 8 | `server/tests/unit/b79-0n-scoring-*.test.ts` (5 new files) | Per §4 test plan |
| 9 | Local `npx tsc --noEmit` + `npx vitest run` + `gh run watch` | CI all-4-green |

**Deploy window (R-2):** outside NYSE 13:30 UTC open. Specifically: deploy in the 18:00-23:00 UTC window or weekend.

**Step 7 verification probe (R-5):** after deploy, `ssh staging 'pm2 logs dawntrader --lines 200 --nostream | grep -E "\[SQE_EVAL\].*assetClass=(crypto_spot|xstock_spot)" | head -10'`. Confirm thresholds printed match per-class DB rows.

---

## §7 Step 10 governance plan (ALL 8 docs ACTUALLY edited)

| Doc | Edit |
|---|---|
| BATCH_CATALOG.md | New row for B79.0n.SCORING |
| PHASE_HISTORY.md | New row referencing umbrella v4 row 8 close (partial — .b follow-up pending) |
| SYSTEM_IMPACT_MAP.md | New "Recent Additions (B79.0n.SCORING)" section: resolver hooks + predictive-confidence cache-key extension + static-mirror counter |
| SYSTEM_MANUAL.md | Chapter 2 (SQE) — note Layer 2 module_constants per-class extension + 3-layer cascade preserved + Day-1 F-1 disposition for SCORE_WEIGHTS / RANKING_WEIGHTS |
| ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.15 | NEW entry: "Promote-then-retire two-step pattern" — explicitly codified per Langston R-3 |
| MULTI_ASSET_VTS_EXPANSION_PLAN.md | New row reflecting SCORING partial close (.b follow-up Tier-3 noted) |
| CHANGES_AND_FIXES.md | New entry: B79.0n.SCORING shipped + R-1 finding (B79.0b retirement scheduling drift filed) + R-2 NYSE-window deploy constraint codified |
| RUNNING_ISSUES.md | New entry: B79.0n.SCORING.b deferred — wildcard retirement after 48h verify-gate; close as B79.0n.SCORING.b ships |

**Phase 24 §4.15 entry shape:**

> §4.15 — Promote-then-retire two-step pattern for module_constants wildcard retirement
> 
> When promoting a wildcard module_constants row to per-class rows AND retiring the wildcard:
> 1. Ship Migration 1 (promotion) + code (resolver) + observability counter (static-mirror-fallback) in batch X.
> 2. Wait 48h post-deploy. Observe counter stays at zero across at least one weekend transition and one full UTC day cycle.
> 3. If counter remains zero: ship Migration 2 (EXISTS-gated wildcard delete) as batch X.b.
> 4. If counter has fired: investigate root cause (cache-key bug, asset-class string mismatch, dropped param in cascade) BEFORE retiring wildcard.
> 
> The 48h gap buys RESOLVER correctness verification (per-class rows present AND code actually reads them), not just DELETE safety.
> Source: B79.0n.SCORING Langston D-5 disposition. Prior arc: B79.TEC / B79.TEC.b pattern.

**Completion-report no-touch-fence sentence (R-4):**

> Although Migration 1 inserts new crypto_spot rows (adx_min / di_min_quant / di_min_pattern / momentum_min), this IS within no-touch fence: values are identical to the in-code hardcoded defaults at the time of promotion (25/25/10/0.005). Structural promotion only — no value tuning. Any future value change is a separate batch with its own empirical justification.

---

## §8 R-1 finding for RUNNING_ISSUES

**B79.0b SQE wildcard-retirement scheduling drift:**

B79.0a Step 3 (commit `a327964a5`, migration `2026-05-08-b79-0a-sqe-wildcard-promotion.sql`) planned a 48h-gated follow-up B79.0b retirement migration. The follow-up migration was never written — no commit matches `*b79-0b*sqe*` or `*b79-0b*wildcard*`. Counter event did NOT block the retirement; this was scheduling drift only. The current B79.0n.SCORING batch ships the equivalent infrastructure for the new keys (perp + crypto_spot numeric thresholds) and explicitly schedules B79.0n.SCORING.b as the retirement step, codifying the pattern in ASSET_CLASS_ONBOARDING_WORKFLOW §4.15.

Disposition: file as resolved (re-acted in this batch). Add explicit "B79.0n.SCORING.b — wildcard retirement deferred to <date+48h>" entry.

---

## §9 Out of scope (preserved from scope §7)

- TEC surface (separate batch #9, parallel)
- Hybrid-score composition (consumed BY calculateFinalScore via hybridScore input)
- Quality_index pipeline (touched only by import-shape verification)
- xstock active-trading flip (sub-batch 18)
- SQE algorithm-level changes (sigmoid, winRate source)

---

*Ready for Step 4 dispatch after implementation. Pre-audit will be referenced by Langston Step 4 code review.*
