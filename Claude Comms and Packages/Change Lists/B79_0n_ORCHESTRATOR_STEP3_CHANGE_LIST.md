# B79.0n.ORCHESTRATOR Step 4 — Code Review Change List (embedded-diff)

**Sub-batch:** 12 of 16 in B79.0n umbrella v4 arc
**HEAD:** `5e08568` (rebased on `77d0dd0` RTB close)
**Author:** CC
**Reviewer:** Langston (Step 4)
**Date:** 2026-05-27
**Scope:** `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_SCOPE.md` v1 ACK clean
**Pre-audit:** `Claude Comms and Packages/Scope Files/B79_0n_ORCHESTRATOR_PRE_AUDIT.md` ACK clean (after Probes 7+8 reply)

---

## Embedded-diff per §6.5.0.a discipline

**INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. DO NOT run git status/log on the FUSE-mounted repo. Use `ssh staging` for any inspection beyond the diffs embedded below. Local Read against `/home/langston/inbox/b79-0n-orchestrator/` files only.**

All 11 chunks (A-K) implementation summary + load-bearing diff snippets follow.

---

## Files changed

| # | Change | File |
|---|---|---|
| 1 | NEW | `server/asset_classes/pattern-pool-dispatch.ts` |
| 2 | MODIFIED | `server/services/paper-position-sizing.ts` (Chunk B import + signature + usage) |
| 3 | MODIFIED | `server/services/paper-execution-engine.ts:2529` (Chunk B caller threading) |
| 4 | MODIFIED | `server/services/signal-orchestrator.ts:432` (Chunk B caller threading) |
| 5 | MODIFIED | `server/services/signal-orchestrator.ts:101` (Chunk E dead-import cleanup) |
| 6 | MODIFIED | `server/core/filters/signal_quality_evaluator.ts:28,285` (Chunk C swap) |
| 7 | MODIFIED | `server/routes.ts:12640+, 12676+` (Chunk D diagnostic swap + Chunk J new endpoint) |
| 8 | MODIFIED | `server/services/asset-class-instances.ts` (Chunk F POOL ARM cleanup) |
| 9 | DELETED | `server/tests/unit/b79-0n-telemetry-arm-injection.test.ts` (Chunk G disposition) |
| 10 | MODIFIED | `server/tests/unit/b79-0a-arm-injection.test.ts` (Chunk G refactor) |
| 11 | MODIFIED | `server/tests/unit/b79-0b-asset-class-instances.test.ts` (Chunk G refactor) |
| 12 | MODIFIED | `server/tests/unit/b79-0n-telemetry-factory.test.ts` (collateral .ratioManager removal) |
| 13 | NEW | `server/tests/unit/b79-0n-orchestrator-dispatcher.test.ts` (Chunk H: 11 tests) |
| 14 | NEW | `server/tests/unit/b79-0n-orchestrator-consumer-swaps.test.ts` (Chunk H: 7 tests) |
| 15 | NEW | `server/tests/integration/b79-0n-orchestrator-cascade.test.ts` (Chunk I: 8 tests) |

Net production: +148 LOC / -67 LOC. Test code: +338 LOC / -54 LOC (net). One file deletion (95 LOC).

---

## Chunk A — NEW `server/asset_classes/pattern-pool-dispatch.ts`

Domain-specific dispatcher mirrors B79.0n.MCE `getFrictionForAssetClass` in `cost-model.ts`. Co-located by domain (not central SSOT) per §4 of pre-audit.

```typescript
// FULL FILE (~80 LOC including header + comments)
import type { AssetClass } from '../../shared/asset-classes.js';
import { PATTERN_POOL_GUARDRAILS } from './crypto_spot/pattern-pool-filters.js';
import { XSTOCK_PATTERN_POOL_GUARDRAILS } from './xstock_spot/pattern-pool-filters.js';

export interface PatternPoolGuardrails {
  readonly FINAL_SCORE_FLOOR: number;
  readonly MAX_POSITION_PCT: number;
}

export function getPatternPoolGuardrailsForAssetClass(
  assetClass: AssetClass,
): PatternPoolGuardrails {
  switch (assetClass) {
    case 'crypto_spot':
      return PATTERN_POOL_GUARDRAILS;
    case 'xstock_spot':
      return XSTOCK_PATTERN_POOL_GUARDRAILS;
    case 'crypto_perp':
    case 'xstock_perp':
    case 'equity_spot':
    case 'equity_futures':
    case 'commodity_futures':
    case 'fx_spot':
      throw new Error(
        `[B79.0n.ORCHESTRATOR][CLASS_NOT_WIRED] assetClass='${assetClass}' has no pattern-pool guardrails wired. ` +
        `Pattern-pool gates are not configured for perpetual futures or reserved-future classes in the ` +
        `current B79.0n umbrella arc. If activating: (1) create server/asset_classes/${assetClass}/pattern-pool-filters.ts ` +
        `with the same FINAL_SCORE_FLOOR + MAX_POSITION_PCT contract; (2) seed module_constants ` +
        `pattern_pool_gates rows for the new class; (3) add a case here. See ` +
        `ASSET_CLASS_ONBOARDING_WORKFLOW.md §4.22 for the per-class consumer-site swap pattern.`,
      );
    default: {
      const _exhaustive: never = assetClass;
      throw new Error(
        `[B79.0n.ORCHESTRATOR][dispatch] unreachable assetClass=${String(_exhaustive)}`,
      );
    }
  }
}
```

**Discipline (Langston §6 ACK):**
- ✅ Exhaustive switch over all 8 AssetClass members (4 active + 4 reserved-future)
- ✅ `_exhaustive: never` in default branch
- ✅ `[CLASS_NOT_WIRED]` throws for 6 non-spot classes
- ✅ Return type explicitly `PatternPoolGuardrails` (not inferred)

---

## Chunk B — paper-position-sizing.ts swap + 2 caller threads

### File 1: `server/services/paper-position-sizing.ts`

**Import swap:**
```diff
-// Phase 14.5: Pattern pool position sizing guardrails
-import { PATTERN_POOL_GUARDRAILS } from '../asset_classes/crypto_spot/pattern-pool-filters.js';
+// B79.0n.ORCHESTRATOR (2026-05-27): per-asset-class pattern pool guardrails
+// dispatcher. Replaces the prior class-bound `PATTERN_POOL_GUARDRAILS` import
+// from `crypto_spot/pattern-pool-filters.js`. xstock pattern signals now
+// correctly read XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved 0.50 cap vs
+// crypto's literal 0.15) via the dispatcher.
+import { getPatternPoolGuardrailsForAssetClass } from '../asset_classes/pattern-pool-dispatch.js';
+import type { AssetClass } from '../../shared/asset-classes.js';
```

**Interface signature update (PaperPositionSizingParams):**
```diff
   sourcePool?: string;
+  /**
+   * B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class pattern pool guardrails
+   * dispatcher key. Resolved deterministically by callers via
+   * `resolveAssetClass(symbol, 'kraken')` per Langston Step 2 no-silent-fallback
+   * disposition. No default — explicit class required. xstock pattern signals
+   * route to XSTOCK_PATTERN_POOL_GUARDRAILS (0.50 cap, DB-resolved); crypto
+   * signals route to PATTERN_POOL_GUARDRAILS (0.15 cap, literal).
+   */
+  assetClass: AssetClass;
 }
```

**Usage swap at line 145:**
```diff
   if (signalSourcePool === 'pattern') {
-    const patternMaxPct = PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT * 100; // 15
+    // B79.0n.ORCHESTRATOR: resolve per-class pattern pool cap via dispatcher.
+    // Crypto returns 0.15 literal (unchanged); xstock returns 0.50 DB-resolved.
+    const guardrails = getPatternPoolGuardrailsForAssetClass(params.assetClass);
+    const patternMaxPct = guardrails.MAX_POSITION_PCT * 100;
     if (effectiveMaxPositionPct > patternMaxPct) {
       effectiveMaxPositionPct = patternMaxPct;
-      console.log(`[14.5][SIZING] Pattern pool signal — capping position at ${patternMaxPct}% (vs ${safeMaxPositionPct}% quant)`);
+      console.log(`[14.5][SIZING][B79.0n.ORCHESTRATOR] Pattern pool signal — capping position at ${patternMaxPct}% (vs ${safeMaxPositionPct}% quant) assetClass=${params.assetClass}`);
     }
   }
```

### File 2: `server/services/paper-execution-engine.ts:2529`

```diff
         if (portfolioValue > 0) {
           const sizingResult = sizePaperPositionForSignal({
             portfolioValue,
             guardrails,
             entryPrice: signal.entryPrice,
             stopPrice: signal.stopPrice,
             symbol: signal.symbol,
             strategy: signal.strategy as any,
             sourcePool: (signal as any)?.metadata?.sourcePool,
+            // B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class dispatch key.
+            // Deterministic from symbol (resolveAssetClass) — no silent fallback
+            // to crypto_spot per Langston Step 2 Probe 8 ACK. Throws on B69-
+            // unregistered symbols (correct fail-fast behavior at sizing boundary).
+            assetClass: resolveAssetClass(signal.symbol, 'kraken'),
           });
```

`resolveAssetClass` already imported at line 57.

### File 3: `server/services/signal-orchestrator.ts:432`

```diff
     const sizingResult = sizePaperPositionForSignal({
       portfolioValue: sizingContext.portfolioValue,
       guardrails: sizingContext.guardrails,
       entryPrice: rawSignal.entryPrice,
       stopPrice: rawSignal.stopPrice,
       symbol: rawSignal.symbol,
       strategy: strategyId,
       sourcePool: rawSignal.metadata?.sourcePool,
+      // B79.0n.ORCHESTRATOR (2026-05-27): REQUIRED per-class dispatch key.
+      // Deterministic from symbol (resolveAssetClass) per Langston Step 2
+      // Probe 8 ACK — single source of truth, no silent crypto_spot fallback.
+      assetClass: resolveAssetClass(rawSignal.symbol, 'kraken'),
     });
```

`resolveAssetClass` already imported at line 33.

---

## Chunk C — signal_quality_evaluator.ts swap

### Import swap (line 28):

```diff
-// Phase 14.5: Pattern pool elevated quality floor
-import { PATTERN_POOL_GUARDRAILS } from '../../asset_classes/crypto_spot/pattern-pool-filters.js';
+// B79.0n.ORCHESTRATOR (2026-05-27): per-asset-class pattern pool guardrails
+// dispatcher. Replaces direct PATTERN_POOL_GUARDRAILS import — xstock pattern
+// signals now route through XSTOCK_PATTERN_POOL_GUARDRAILS (DB-resolved 0.45
+// floor) instead of crypto's 0.45 literal. Same value today (placeholder-clone)
+// but per-class plumbing operational for future xstock calibration via
+// module_constants.pattern_pool_gates.xstock_spot.pattern_final_score_min UPDATE.
+import { getPatternPoolGuardrailsForAssetClass } from '../../asset_classes/pattern-pool-dispatch.js';
```

### Usage swap (line 285):

```diff
   const effectiveMinFinalScore = input.sourcePool === 'pattern'
-    ? PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR  // 0.45 for pattern pool
+    ? getPatternPoolGuardrailsForAssetClass(input.assetClass).FINAL_SCORE_FLOOR
     : thresholds.finalScoreMin;                    // 0.35 for quant (default)
```

`input.assetClass` is REQUIRED on SQEInput per B79.0n.STORAGE — no fallback needed.

---

## Chunk D — routes.ts diagnostic swap (existing `/pattern-pool` endpoint)

```diff
   apiRouter.get('/pattern-pool', authenticateToken, async (req: AuthenticatedRequest, res) => {
     try {
       const mode = (req.query.mode as 'paper' | 'live') || 'paper';
+      const requestedAssetClass = (req.query.assetClass as string) || 'crypto_spot';
       const { activeFilterPool } = await import('./services/active-filter-pool.js');
-      const { PATTERN_POOL_THRESHOLDS, PATTERN_POOL_GUARDRAILS, PATTERN_POOL_STRATEGIES } = await import('./asset_classes/crypto_spot/pattern-pool-filters.js');
+      const { PATTERN_POOL_THRESHOLDS, PATTERN_POOL_STRATEGIES } = await import('./asset_classes/crypto_spot/pattern-pool-filters.js');
+      const { getPatternPoolGuardrailsForAssetClass } = await import('./asset_classes/pattern-pool-dispatch.js');
+      const { ASSET_CLASSES } = await import('../shared/asset-classes.js');
+
+      const validClasses = Object.values(ASSET_CLASSES);
+      if (!validClasses.includes(requestedAssetClass as any)) {
+        return res.status(400).json({
+          ok: false,
+          error: `Invalid assetClass='${requestedAssetClass}'. Valid: ${validClasses.join(', ')}`,
+        });
+      }
+      const guardrails = getPatternPoolGuardrailsForAssetClass(requestedAssetClass as any);
+
       const patternPool = activeFilterPool.getPatternPool(mode);
       // ...
       res.json({
         ok: true,
         data: {
+          assetClass: requestedAssetClass,
           patternPool: ...,
           thresholds: PATTERN_POOL_THRESHOLDS,
-          guardrails: PATTERN_POOL_GUARDRAILS,
+          guardrails,
           strategies: PATTERN_POOL_STRATEGIES,
         },
       });
     } catch (error) {
-      console.error('[19C] Pattern pool endpoint error:', error);
-      res.status(500).json({ ok: false, error: 'Failed to fetch pattern pool data' });
+      console.error('[19C][B79.0n.ORCHESTRATOR] Pattern pool endpoint error:', error);
+      res.status(500).json({ ok: false, error: error instanceof Error ? error.message : 'Failed to fetch pattern pool data' });
     }
   });
```

---

## Chunk E — signal-orchestrator.ts:101 dead-import cleanup

```diff
-import { PATTERN_POOL_STRATEGIES, PATTERN_POOL_GUARDRAILS, DEFAULT_ASSET_CLASS } from '../asset_classes/crypto_spot/pattern-pool-filters.js';
+// B79.0n.ORCHESTRATOR (2026-05-27): dead-import cleanup. Pre-batch this line
+// imported PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS + DEFAULT_ASSET_CLASS.
+// Step 1.a probe confirmed PATTERN_POOL_STRATEGIES + PATTERN_POOL_GUARDRAILS are
+// NOT referenced anywhere in this file's body. DEFAULT_ASSET_CLASS IS still
+// referenced at lines 670 and 1397 (fallback for the crypto-only path per the
+// docstring at lines 1377-1379). Cleaned to import only the live symbol.
+import { DEFAULT_ASSET_CLASS } from '../asset_classes/crypto_spot/pattern-pool-filters.js';
```

---

## Chunk F — asset-class-instances.ts POOL ARM cleanup

### Interface field deletion (line 92):

```diff
 export interface AssetClassInstances {
   telemetry: TelemetryAggregatorService;
-  ratioManager: AdaptiveRatioManager;
+  // B79.0n.ORCHESTRATOR (2026-05-27): `ratioManager` field deleted per POOL
+  // skip — no factory consumer reads it; only test files referenced it.
   failureTracker: PairFailureTracker;
   scanManager: AdaptiveScanManager;
   inMemoryOnly: boolean;
 }
```

### Import deletion (line 86):

```diff
 import { TelemetryAggregatorService, peekTelemetryInstance } from './telemetry-aggregator.js';
-import { AdaptiveRatioManager } from './adaptive-ratio-manager.js';
+// B79.0n.ORCHESTRATOR (2026-05-27): POOL skip cleanup. AdaptiveRatioManager
+// import removed — the 3 dead factory ARM constructions (xstock_spot at line
+// 144 pre-batch, xstock_perp at 167, crypto_perp at 183) deleted per umbrella
+// v4 POOL skip directive. Crypto's module-level singleton at adaptive-ratio-
+// manager.ts:307 remains untouched as the live ARM for crypto.
 import { AdaptiveScanManager, PairFailureTracker } from './adaptive-scan-manager.js';
```

### 3 ARM construction deletions (lines 144, 167, 183):

```diff
 function bootstrapXstockSpotInstances(): AssetClassInstances {
   const telemetry = new TelemetryAggregatorService();
   const failureTracker = new PairFailureTracker();
-  // B79.0a (2026-05-08): ARM constructor takes injected telemetry — the
-  // xstock ARM consumes its own per-class TelemetryAggregator instance so
-  // pool-performance reads NEVER bleed into the global crypto telemetry.
-  const ratioManager = new AdaptiveRatioManager({}, telemetry);
+  // B79.0n.ORCHESTRATOR (2026-05-27): ARM construction deleted per POOL skip.
   const scanManager = new AdaptiveScanManager(telemetry, failureTracker);

   console.log('[B79.0n.TELEMETRY][BOOT] xstock_spot AssetClassInstances bootstrapped (in-memory only; Variant C)');

-  return { telemetry, ratioManager, failureTracker, scanManager, inMemoryOnly: true };
+  return { telemetry, failureTracker, scanManager, inMemoryOnly: true };
 }
```

Identical pattern for `bootstrapXstockPerpInstances` + `bootstrapCryptoPerpInstances`.

---

## Chunk G — 3 POOL test file dispositions

### DELETE `server/tests/unit/b79-0n-telemetry-arm-injection.test.ts`

Entire file (95 LOC) tested the xstock_perp `ratioManager` injection contract being removed. File no longer relevant.

### REFACTOR `server/tests/unit/b79-0a-arm-injection.test.ts`

```diff
-  it('config + injected telemetry constructor accepts both args', () => {
-    const customTelemetry = new TelemetryAggregatorService();
-    const arm = new AdaptiveRatioManager({}, customTelemetry);
-    expect(arm).toBeDefined();
-  });
+  // B79.0n.ORCHESTRATOR (2026-05-27): test for `new AdaptiveRatioManager({}, customTelemetry)`
+  // removed per POOL skip — no production caller injects telemetry into ARM. The
+  // constructor signature still accepts the optional arg for back-compat (light
+  // dead code), but no factory path exercises it. Crypto ARM at the module-level
+  // singleton (`adaptive-ratio-manager.ts:307`) uses default-arg + global singleton
+  // fallback (still tested at lines 34-38 above).
```

### REFACTOR `server/tests/unit/b79-0b-asset-class-instances.test.ts` + `b79-0n-telemetry-factory.test.ts`

Removed 4+3=7 `.ratioManager` references from these 2 test files. Substitute assertions on `.failureTracker` / `.scanManager` / `.telemetry` (still present).

---

## Chunk H — 2 NEW unit test files (18 tests)

### `server/tests/unit/b79-0n-orchestrator-dispatcher.test.ts` (11 tests)

Tests the dispatcher itself:
- §1 Active classes: 3 tests (crypto returns crypto guardrails, xstock returns xstock guardrails, both differ by MAX_POSITION_PCT 0.15 vs 0.50)
- §2 Perp CLASS_NOT_WIRED: 3 tests (crypto_perp throws, xstock_perp throws, error message includes activation breadcrumbs)
- §3 Reserved-future CLASS_NOT_WIRED: 4 tests via `it.each` (equity_spot, equity_futures, commodity_futures, fx_spot)
- §4 PatternPoolGuardrails return-type shape: 3 tests (keys present, FINAL_SCORE_FLOOR is number, MAX_POSITION_PCT is number)
- §5 Compile-time exhaustiveness lock (no runtime — just type assertion at file scope)

### `server/tests/unit/b79-0n-orchestrator-consumer-swaps.test.ts` (7 tests)

Tests the consumer-site swaps via source-file inspection (string assertions):
- paper-position-sizing.ts: 2 tests (sizing fn exported, imports dispatcher not direct)
- signal_quality_evaluator.ts: 1 test (imports dispatcher not direct)
- signal-orchestrator.ts: 2 tests (cleaned import keeps DEFAULT_ASSET_CLASS only; DEFAULT_ASSET_CLASS still referenced in body)
- asset-class-instances.ts: 1 test (interface no longer has ratioManager + no AdaptiveRatioManager imports + no `new AdaptiveRatioManager(` calls in code paths)
- generic: imports + structure assertions

---

## Chunk I — 1 NEW integration test file (8 tests)

### `server/tests/integration/b79-0n-orchestrator-cascade.test.ts`

End-to-end cascade tests with key-aware DB mock to catch wrong-value-threaded-correctly bug class (Langston Q1):
- §1 Sizing cascade (3 tests): xstock sized against xstock 0.50 cap; crypto against crypto 0.15 cap; xstock allows LARGER position than crypto for same risk inputs
- §2 SQE cascade (3 tests): xstock + crypto both read 0.45 FINAL_SCORE_FLOOR today; source-file verifies dispatcher consumed
- §3 Dispatcher resilience (2 tests): unknown class throws; consumer-without-catch fails cleanly (no silent fallback)

---

## Chunk J — NEW `/api/diagnostics/orchestrator-per-class-state` endpoint in routes.ts

```typescript
apiRouter.get('/diagnostics/orchestrator-per-class-state', async (_req, res) => {
  const { getPatternPoolGuardrailsForAssetClass } = await import('./asset_classes/pattern-pool-dispatch.js');
  const perClass = {};
  const activeClasses = ['crypto_spot', 'crypto_perp', 'xstock_spot', 'xstock_perp'];
  for (const cls of activeClasses) {
    try {
      const g = getPatternPoolGuardrailsForAssetClass(cls);
      perClass[cls] = { patternPoolGuardrails: { FINAL_SCORE_FLOOR: g.FINAL_SCORE_FLOOR, MAX_POSITION_PCT: g.MAX_POSITION_PCT } };
    } catch (err) {
      perClass[cls] = { status: 'CLASS_NOT_WIRED', reason: ... };
    }
  }
  res.json({ ts: new Date().toISOString(), batch: 'B79.0n.ORCHESTRATOR', perClass });
});
```

No-auth public (B79.0a pattern). Step 8 verify-gate target.

---

## Chunk K — Local tsc + vitest verification

- `node scripts/check-tsc-baseline.mjs` → **494 = 494, OK — no regressions above baseline**
- `npx vitest run server/tests/unit/b79-0n- server/tests/unit/b79-0a- server/tests/unit/b79-0b- server/tests/integration/b79-0n-` → **47 test files / 342 passed / 6 skipped / 0 failed**
- 27 of those tests are new (this batch's chunks H + I).

---

## §6 Asks for Langston

1. **Chunk A dispatcher discipline** — exhaustive switch + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws + explicit return type as specified. Verify pattern matches B79.0n.MCE `getFrictionForAssetClass`.
2. **Chunk B caller-thread sites** — `resolveAssetClass(signal.symbol, 'kraken')` deterministic pattern (Probe 8 ACK) at paper-execution-engine.ts:2529 + signal-orchestrator.ts:432.
3. **Chunk E dead-import cleanup** — confirm `PATTERN_POOL_GUARDRAILS` + `PATTERN_POOL_STRATEGIES` removal is safe (Step 1.a probe showed zero body refs); `DEFAULT_ASSET_CLASS` preserved.
4. **Chunk F POOL cleanup** — `ratioManager` field + 3 constructions + import all deleted; crypto module-level singleton at adaptive-ratio-manager.ts:307 untouched.
5. **Chunk G test dispositions** — delete one, refactor two; assertion adjustments don't lose coverage on the still-live fields.
6. **Chunk H + I tests** — 27 new tests; key-aware mock pattern at section §1 of dispatcher.test.ts catches the wrong-value-threaded-correctly bug class (your Q1 refinement).
7. **Chunk J endpoint** — JSON shape matches scope §6.4; no-auth public mirrors B79.0a precedent.

**Reply:** ACK clean → Step 5 CI confirmation → Step 6 deploy. Or specific revisions.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive. Use `ssh staging` for any inspection beyond the diffs above. This file lives at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_STEP3_CHANGE_LIST.md` after SCP.
