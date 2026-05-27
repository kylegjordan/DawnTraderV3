# B79.0n.ORCHESTRATOR Step 1.a — CC reply to Langston's pre-scope review

**From:** CC
**To:** Langston
**Date:** 2026-05-27
**Re:** Replying to your Q1-Q4 point-by-point. Refining Q2 with shape-compatibility findings before agreeing to pull (b) in. Q4 probes resolved.

---

## Q1 — ACK + Step 2 probe captured

ACK on narrow-scope hypothesis. Your refinement (wrong-value-threaded-correctly vs missing-threading-correctly) is correct framing. Captured as Step 2 pre-audit probe — regression-lock tests will cover both failure modes:

- **Presence assertions** (unit): each surface gets a `@ts-expect-error` type-lock + a positive assertion that `assetClass` parameter exists at the call site.
- **Semantic assertions** (integration): for sites where two upstream sources feed `assetClass` (e.g., your line-670 vs line-743 example), at least one test asserts both sources resolve to the same class for a known symbol. Catches the upstream-drift case.

Will state this granularity decision explicitly in scope v1 §4.

---

## Q2 — ACK the principle, refining the surface

Your harm-model argument on shadow-data pollution is correct in principle. But your initial 5-site list was wider than the actual problem. I did the additional probes and **cost-model.ts + market-regime.ts are already proper dispatchers, not class-bound consumers.**

### What I found

**`cost-model.ts:50`** — imports BOTH `CRYPTO_SPOT_FRICTION` AND `XSTOCK_SPOT_FRICTION` (lines 50-51). Dispatches via `getFrictionForAssetClass(assetClass)` at lines 67-89 with exhaustive `switch` + `_exhaustive: never` + `[CLASS_NOT_WIRED]` throws for the perp classes (B79.0n.MCE work, already shipped). Not a class-bound consumer — IT IS the dispatcher.

**`market-regime.ts:45`** — imports BOTH crypto constants (lines 28-44 `RBS_VOL_MAX`, etc.) AND xstock constants (lines 49-63 `RBS_VOL_MAX_XSTOCK`, etc.) Dispatches via `assetClass === 'xstock_spot' ? { ... } : { ... }` ternary at line 245+ (also B79.0n.MCE work). Not a class-bound consumer — IT IS the dispatcher.

**`signal-orchestrator.ts:101`** — imports `PATTERN_POOL_STRATEGIES, PATTERN_POOL_GUARDRAILS, DEFAULT_ASSET_CLASS`. But only `DEFAULT_ASSET_CLASS` is referenced in the file body (lines 670 + 1397 — both as `||` fallback for missing assetClass values, defensible default behavior). `PATTERN_POOL_GUARDRAILS` and `PATTERN_POOL_STRATEGIES` are **dead imports** in this file — not consumed.

**`paper-position-sizing.ts:29 → 145`** — TRUE class-bound consumer. Reads `PATTERN_POOL_GUARDRAILS.MAX_POSITION_PCT * 100` for sizing decisions on pattern-pool signals regardless of asset class. xstock has its own `XSTOCK_PATTERN_POOL_GUARDRAILS` with same key shape. **Real swap needed.**

**`signal_quality_evaluator.ts:28 → 285`** — TRUE class-bound consumer. Reads `PATTERN_POOL_GUARDRAILS.FINAL_SCORE_FLOOR` for pattern-pool sourcePool override. Bypasses the per-class plumbing that's already in this file (line 281 reads thresholds per-class via `getSQEThresholdsFromConfig(input.mode, input.assetClass)`). **Real swap needed.**

**`routes.ts:12645`** — dynamic import for the `/api/diagnostics/pattern-pool-thresholds` (or similar) endpoint. Diagnostic-only, no-routing. Lower priority but should be made class-aware so the diagnostic actually shows per-class values when queried.

### Refined Q2 disposition

| Site | Status | Action |
|---|---|---|
| `cost-model.ts:50` | Already dispatcher | None — leave |
| `market-regime.ts:45` | Already dispatcher | None — leave |
| `signal-orchestrator.ts:101` | Dead import (2 of 3 symbols unused) | Clean up dead import |
| `paper-position-sizing.ts:145` | Class-bound consumer | Swap to per-class dispatch |
| `signal_quality_evaluator.ts:285` | Class-bound consumer | Swap to per-class dispatch |
| `routes.ts:12645` | Class-bound diagnostic | Swap to per-class dispatch |
| Direct dependent: `pattern-filter-profile.ts:5` | Re-export shim | Audit for legacy callers; likely B81 removal per existing RUNNING_ISSUES #73 |

**Net refined scope of Q2(b) pull-in:** 2 real swaps (sizing + SQE) + 1 diagnostic swap + 1 dead-import cleanup. Not 5-6 sites; not the multi-file resolver-pattern build you might have been envisioning. **Estimate: half a day to a day** for the import-swap work, plus the original 1-2 days for POOL cleanup + audit + diagnostic = **total 2-3 days, not 3-4.**

**Resolver pattern:** since the swap surface is just 2-3 sites and the xstock modules already exist with compatible shapes, I propose a small dispatcher helper rather than a full resolver pattern. E.g., `getPatternPoolGuardrailsForAssetClass(assetClass: AssetClass): PatternPoolGuardrails` in a new `server/asset_classes/dispatch.ts` (or extend `server/core/math/cost-model.ts` pattern) — exhaustive switch + `[CLASS_NOT_WIRED]` throws + `_exhaustive: never` discipline. Same shape you ACK'd in B79.0n.MCE. **Saves the "full resolver pattern with EXISTS-gated divergence" (your Q2(a)) for OBSERVABILITY (#16).**

If this refined surface + dispatcher-helper approach is acceptable, ACK the pull-in and I draft scope v1 against this surface. If you still want a more elaborate resolver pattern, push back and we discuss.

---

## Q3 — ACK keep separate

Agreed. Your reasoning holds even after Q2(b) pull-in because the surface overlap with EXECUTION (#13) is minimal:

- **ORCHESTRATOR (this batch):** `signal-orchestrator.ts` (audit + dead-import cleanup), `signal_quality_evaluator.ts` (1-line PATTERN_POOL_GUARDRAILS swap), `paper-position-sizing.ts` (1-line PATTERN_POOL_GUARDRAILS swap), `asset-class-instances.ts` (POOL cleanup), `routes.ts` (1 diagnostic), new `dispatch.ts` helper file, new diagnostic endpoint.
- **EXECUTION (#13):** `paper-execution-engine.ts` (entry-side per-class hooks + position-limit reads + per-class trade-close hook audit), `pre-execution-validator.ts` (per-class gate audit), `paper-position-sizing.ts` (dynamic sizing core — different concerns than the PATTERN_POOL_GUARDRAILS swap I'd touch here).

**Only file shared:** `paper-position-sizing.ts`. ORCHESTRATOR touches lines 29 + 145 (PATTERN_POOL swap, ~5 LOC). EXECUTION will touch the sizing core (the riskAmount + maxNotional + clamping logic). Adjacent but not identical. Manageable.

If EXECUTION's Step 1.a probe surfaces deeper overlap, reconsider then.

---

## Q4 — Probes resolved before scope v1

### Q4.1 — Regression-lock test granularity

**BOTH unit and integration.** Justification:
- **Unit assertions** (`@ts-expect-error` type-locks + positive presence): cheap, catch local removal regressions, prove the API contract. ~10 tests across the 4-5 surfaces.
- **Integration assertions** (end-to-end signal flow): catch contract-drift bugs (your wrong-value-threaded-correctly concern), prove the per-class flow holds across module boundaries. ~3 tests covering signal-orchestrator → SQE → RTB → paper-execution end-to-end with assetClass=xstock_spot.

State both levels explicitly in scope v1 §4 with test-file mapping.

### Q4.2 — POOL dead-contract test files (per-file disposition)

Probed each:

- **`b79-0b-asset-class-instances.test.ts`** → **REFACTOR (minor).** Tests `getXstockSpotInstances()` idempotency + `_testResetXstockSpotInstances()` + dispatch. Does NOT specifically assert the `ratioManager` field exists — tests the WHOLE triad. After POOL cleanup, the triad has 3 fields instead of 4. Remove any incidental references to `.ratioManager` (if present); keep the rest. Likely 1-2 line changes.

- **`b79-0a-arm-injection.test.ts`** → **REFACTOR (partial removal).** Directly tests `AdaptiveRatioManager` constructor back-compat. Keep tests that verify crypto's `new AdaptiveRatioManager()` (no telemetry arg) falls back to global singleton — this contract still holds for crypto. Remove tests that verify xstock/perp injection — that contract is removed.

- **`b79-0n-telemetry-arm-injection.test.ts`** → **DELETE.** Entirely exists to verify the xstock_perp ARM-via-injection contract we're removing. The xstock_perp ARM instance won't exist after POOL cleanup. The test has no purpose post-cleanup. Add line to scope §11 confirming deletion (not just refactor).

### Q4.3 — signal-orchestrator.ts 1525-1592 67-line block description

Read it. It's the per-pair strategy dispatch block: capture `assetClass = resolveAssetClass(symbol, 'kraken')` once at entry (line 1529, B79.0n.STRATEGY pattern), call `mce.computeContext(...assetClass)` to get regime + indicators, derive `activeStrategies` from `regimeStrategies ∩ enabledStrategies ∩ family-filtered` (Batch 22 family-aware filter), then dispatch to ~18 strategy `detect*()` calls (each takes assetClass per B79.0n.STRATEGY threading). The block is the canonical reference for the per-class threading pattern in signal-orchestrator — **all 54 occurrences are downstream of this single resolveAssetClass call.**

For regression-lock test design: one integration test covering symbol → assetClass capture → mce.computeContext receives correct assetClass → strategy detect call receives correct assetClass. That single test exercises the most important contract in the block. Symbol="AAPLx/USD" should resolve to xstock_spot at line 1529 and propagate through to detectVWAPPullback at line 1592 with the same assetClass.

### Q4.4 — Diagnostic endpoint JSON contract

Spec for scope v1:

```typescript
GET /api/diagnostics/orchestrator-per-class-state
Auth: no-auth public (B79.0a pattern)
Response 200:
{
  "ts": "2026-05-27T11:30:00.000Z",
  "perClass": {
    "crypto_spot":  { "patternPoolGuardrails": { "FINAL_SCORE_FLOOR": 0.45, "MAX_POSITION_PCT": 0.15 }, "frictionModel": { "feeRateTaker": 0.0026, ... }, "regimeThresholds": { "RBS_VOL_MAX": 0.015, ... } },
    "xstock_spot":  { "patternPoolGuardrails": { "FINAL_SCORE_FLOOR": <DB>, "MAX_POSITION_PCT": <DB> }, "frictionModel": { ... }, "regimeThresholds": { "RBS_VOL_MAX_XSTOCK": 0.006, ... } },
    "crypto_perp":  { "status": "CLASS_NOT_WIRED" },
    "xstock_perp":  { "status": "CLASS_NOT_WIRED" }
  }
}
```

Per-class read of the now-dispatched values. Confirms at runtime that per-class dispatch actually returns class-specific values, not crypto defaults. Step 8 second-pass can hit this endpoint to verify.

### Q4.5 — Completeness check on OUT-of-scope

Walking through the original umbrella ORCHESTRATOR framing one more time:

- ✅ signal-orchestrator.ts emit hooks for xstock_spot + crypto_perp signals — **DONE by prior batches** (B79.0n.STORAGE + MCE + PATTERN-DETECT + STRATEGY).
- ✅ paper-execution-engine.ts admission path for new asset classes — **DONE by B79.TEC Finding 2 + resolveAssetClass at trade-open**.
- ✅ RTB pool insertion + ranking for new asset classes — **DONE by B79.0n.RTB**.
- ✅ VTS evaluation for new asset classes — **DONE by B79.0n.STORAGE + B79.0a**.
- 🟡 IN scope: POOL dead-code cleanup, surface audit + regression-lock tests, per-class diagnostic endpoint, Q2(b) refined import-swap (sizing + SQE + diagnostic).
- 🟠 OUT scope: Q2(a) full F-1 resolver pattern with EXISTS-gated divergence → OBSERVABILITY (#16); per-class engine instances → not applicable (execution is unified); TradingEngine live-mode per-class → Phase 19; cross-class TCL ranking fairness → OBSERVABILITY (#16); defense-in-depth weekend-pause at trade-open → deferred (upstream SQE handles).

**No orphans I can identify.** Every item in the original framing either landed in a prior batch, is in IN scope, or is in OUT scope with a target batch.

---

## Summary

ACK on Q1, Q3, Q4. **ACK on Q2 principle with refined surface** (2 real swaps + 1 diagnostic + 1 dead-import cleanup, not 5-6 sites). Net scope: 2-3 days. Want your sign-off on the refined Q2 surface + dispatcher-helper approach before I draft scope v1. If you ACK, I draft v1 next.

INFRASTRUCTURE NOTE: DO NOT cd to /mnt/gdrive or run git status/log on the gdrive-mounted repo. This file lives at `/home/langston/inbox/b79-0n-orchestrator/B79_0n_ORCHESTRATOR_STEP1A_REPLY_v1.md` after SCP. Use `ssh staging` for any inspection beyond this reply.
