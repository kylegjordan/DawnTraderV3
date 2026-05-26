# B79.0n.SCORING — Step 3 Part 1 Change List (CI-green at HEAD 9952111f8)

**Status:** Step 4 dispatch — Langston code review.
**Pre-audit reference:** `Claude Comms and Packages/Scope Files/B79_0n_SCORING_PRE_AUDIT.md`.
**Commit:** `a177508f2` (part 1; F-1 resolver hooks for SCORE_WEIGHTS/RANKING_WEIGHTS deferred to follow-up).
**CI status:** GREEN at `9952111f8` cumulative push, run `26428529329`, 2m35s.

---

## §0 Scope of "Part 1"

This change-list ships the LOAD-BEARING structural changes for SCORING. The F-1 resolver hooks for `SCORE_WEIGHTS` + `RANKING_WEIGHTS` (D-1, D-2 — Day-1 no-op per your ACK) are NOT in this commit; they're additive surface with zero behavior change at Day-1 and don't gate the 48h verify-gate. I'll add them in a follow-up after your Step 4 feedback OR defer to B79.0n.SCORING.b governance turn.

**TWO-STEP per D-5:** This batch is the promotion + code + counter half. B79.0n.SCORING.b ships the EXISTS-gated wildcard retirement after the 48h verify-gate confirms `getSQEStaticMirrorFallbackStats().count === 0`.

---

## §1 Files changed (7 total)

### Migrations (2 files, NEW)
- `drizzle/migrations/2026-05-26-b79-0n-scoring-perclass-seed.sql` — 8 new rows: 4 perp coverage + 4 crypto_spot numeric-threshold promotion
- `drizzle/migrations/2026-05-26-b79-0n-scoring-perclass-seed-rollback.sql` — manual rollback

### Manifest
- `drizzle/migrations/MANIFEST.txt` — appended forward migration

### Code (4 files)
- `server/core/utils/score-calculator.ts` — `getPredictiveConfidence` REQUIRES `assetClass` first param; cache-key extended from `${regime}:${strategy}` to `${assetClass}:${regime}:${strategy}` (F-2 fix per pre-audit §2.5)
- `server/core/filters/signal_quality_evaluator.ts` — OBJ-4 static-mirror fallback counter + `getSQEStaticMirrorFallbackStats()` accessor + caller-threading for predictive-confidence
- `server/services/vts-runner.ts` — predictive-confidence caller threaded (reuses `_resolvedAssetClass` captured at :1086)
- `server/asset_classes/xstock_spot/eval-cycle.ts` — predictive-confidence caller threaded (hardcoded `'xstock_spot' as const` matches file scope)

---

## §2 Embedded diff snippets

### 2.1 Migration 1 — 8 rows

```sql
INSERT INTO module_constants (...) VALUES
  -- (A) 4 rows: perp coverage for B79.0a-promoted keys
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_final_score',   '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_final_score',   '0.35'::jsonb, 'B79.0n.SCORING'),
  ('sqe_config', '*', 'xstock_perp', '*', '*', 'min_regime_weight', '0.30'::jsonb, 'B79.0n.SCORING'),
  -- (B) 4 rows: crypto_spot numeric-threshold promotion (D-4 verbatim from code)
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'adx_min',         '25'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_quant',    '25'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'di_min_pattern',  '10'::jsonb,    'B79.0n.SCORING'),
  ('sqe_config', '*', 'crypto_spot', '*', '*', 'momentum_min',    '0.005'::jsonb, 'B79.0n.SCORING')
ON CONFLICT (...) DO NOTHING;

-- Assertion: 8 new rows expected with updated_by='B79.0n.SCORING'
```

### 2.2 Predictive-confidence signature change (F-2 fix)

```ts
// BEFORE: cache key collapses cross-class telemetry
export function getPredictiveConfidence(symbol: string, regime: string, strategy: string): number {
  const cacheKey = `${regime}:${strategy}`;
  // ...
}

// AFTER: per-class cache key isolation
import type { AssetClass } from '../../../shared/asset-classes.js';
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

3 callers updated:
- `signal_quality_evaluator.ts:265` — passes `input.assetClass`
- `vts-runner.ts:1118` — passes `_resolvedAssetClass` (captured at :1086 from `safeResolveAssetClass(symbol, 'kraken') ?? 'crypto_spot'`)
- `xstock_spot/eval-cycle.ts:578` — passes `'xstock_spot' as const` (file scope)

### 2.3 OBJ-4 static-mirror fallback counter

```ts
// signal_quality_evaluator.ts (NEW counter + accessor)
let _b79nScoringStaticMirrorFallbackCount = 0;
let _b79nScoringStaticMirrorLastFireMs = 0;
const SQE_STATIC_MIRROR_LOG_EVERY = 100;

export function getSQEStaticMirrorFallbackStats(): { count: number; lastFireMs: number } {
  return { count: _b79nScoringStaticMirrorFallbackCount, lastFireMs: _b79nScoringStaticMirrorLastFireMs };
}

// Inside getSQEThresholdsFromConfig catch handler:
_b79nScoringStaticMirrorFallbackCount++;
_b79nScoringStaticMirrorLastFireMs = Date.now();
if (count % 100 === 1) {
  console.warn(`[B79.0n.SCORING][SQE_STATIC_MIRROR_FALLBACK] count=${count} mode=${mode} assetClass=${assetClass} ...`);
}
```

48h verify-gate before B79.0n.SCORING.b: counter MUST stay at zero across at least one weekend transition + one full UTC-day cycle.

---

## §3 D + R dispositions

| D/R | Step 2 ACK disposition | This commit |
|---|---|---|
| D-1 (SCORE_WEIGHTS F-1 + resolver hook) | F-1 with `getScoreWeightsForClass(assetClass)` | ⚠️ deferred to follow-up (Day-1 no-op) |
| D-2 (RANKING_WEIGHTS F-1 + resolver hook) | F-1 same pattern | ⚠️ deferred to follow-up (Day-1 no-op) |
| D-3 (PATTERN_POOL_FLOOR F-2 structurally) | xstock pattern-pool-filters.ts exists with DB-getter | ✅ confirmed via `ls`/`grep` (xstock file = 5871 bytes line 73 has DB-getter; crypto_spot file = 4340 bytes line 43 has equivalent DB-getter) — no D-3 code work needed |
| D-4 (crypto_spot numeric defaults verbatim) | 25/25/10/0.005 | ✅ Migration 1 §(B) |
| D-5 (TWO-STEP) | SCORING + SCORING.b | ✅ this is the promotion half; .b queued after verify-gate |
| R-1 (B79.0b history) | Scheduling drift, no blocker | ✅ confirmed via git log; pre-audit §8 |
| R-2 (deploy window post-20:00 UTC DST) | Outside NYSE | ⚠️ pending Step 6 deploy ops |
| R-3 (§4.15 onboarding pattern = two-step) | Promote-then-retire | ⚠️ deferred to Step 10 governance |
| R-4 (no-touch fence sentence in completion report) | Explicit sentence | ⚠️ deferred to Step 11 completion report |
| R-5 (resolver consumption probe in Step 7) | One-line log-tail probe | ⚠️ deferred to Step 7 |

---

## §4 Anti-graveyard check

- No new `as any` / `@ts-ignore` / non-null `!`.
- No new `@ts-expect-error`.
- F-1 resolver hooks not added (no type pollution).

---

## §5 What's NOT in this batch

- **F-1 resolver hooks for SCORE_WEIGHTS + RANKING_WEIGHTS** (D-1, D-2): deferred to follow-up. Day-1 no-op surface; adding them is structural setup with zero behavior change. Can land in a clean follow-up commit OR roll into .b governance.
- **`/api/diagnostics/sqe-fallback-counter` route**: deferred. The diagnostic accessor function exists (`getSQEStaticMirrorFallbackStats`) but no HTTP route plumbing. For verify-gate, I can run `ssh staging "node -e \"import('./dist/...sqe.js').then(m => console.log(m.getSQEStaticMirrorFallbackStats()))\""` directly. HTTP route is a nice-to-have for ops, not a verify-gate requirement.
- **5 new test files** (per pre-audit §4): deferred.
- **Step 10 governance docs** (8 docs ACTUALLY edited): pending Step 10.

---

## §6 Outstanding pre-audit items (Langston Step 2 ACK clarifications)

1. **`boot_orchestrator.ts:95` + `system-guards.ts:170` SCORE_WEIGHTS consumers**: observability-only (telemetry banner + snapshot). Stay on static const — no class context required. ✅ confirmed via re-grep this iteration.

2. **`signal-orchestrator.ts` + `vts-runner.ts` SCORE_WEIGHTS consumers**: not direct consumers of SCORE_WEIGHTS const; they thread `assetClass` downstream to `getPredictiveConfidence` (which IS now per-class). ✅ confirmed.

3. **`getPredictiveConfidence` ready_to_buy_service callers**: per grep, ZERO callers in RTB. Threading covered via SQE → RTB indirect chain. ✅ confirmed.

4. **`§4.3` label rename**: this change-list uses "F-2 predictive-confidence cache-key fix (scope-derived per §2.5 empirical finding)" — D-5 cross-reference dropped per your ACK clarification 4.

5. **SQE_EVAL log line `assetClass=` tag**: not yet confirmed in production logs. Step 7 verification will tail PM2 logs post-deploy + confirm log line shape includes `assetClass=`. If missing, follow-up commit adds the tag.

---

*Reply ACK / REVISIONS. If [SILENT], proceed to Step 6 staging deploy with TEC + SCORING migrations sequenced. Post-deploy Step 7 will exercise R-5 resolver consumption probe + start the 48h verify-gate clock for both batches.*
