# Batch 4 Scope: Directive 12.2.7 — NLAI System Removal (Wave 4.7)

> **Date**: 2026-02-23
> **Baseline**: SNAPSHOT-007 (post-Batch 3B, commit `b52e40ea`)
> **Type**: Dead code removal — file deletions + import cleanup
> **Registry Items**: RISK-037 (NLAI deprecated), partially addresses RISK-048 (routes.ts monolith reduction)
> **Estimated Blast Radius**: LOW — NLAI does NOT touch signal pipeline, execution math, VTS, or trading logic

---

## Why NLAI Next (Not Wave 1 or Wave 3)

### Wave 1 (12.2.1) is largely already done
Investigation confirmed that the ~12 LATTi files referenced in the LEGACY_DEPRECATION_PLAN have **already been deleted** in a prior cleanup. Only one component remains (`client/src/components/system/latti-safety-monitor.tsx`) plus schema/route residuals. This is cleanup work, not a full wave. It can be folded into a future governance batch or combined with another wave.

### Wave 3 (12.2.3) Walter/Bob is too large for one batch
Walter/Bob/Cortex spans ~40+ files, ~16,800 lines, across server services, middleware, routes, and client components. This needs to be broken into multiple batches with careful dependency ordering. NLAI removal is a natural prerequisite — it removes the Walter command bridge before removing Walter itself.

### NLAI (Wave 4.7 / 12.2.7) is the right size and the right order
- 5 file deletions, 6 file modifications — fits in one batch
- ~2,100 lines of dead code removed
- Confirmed deprecated by Kyle (Phase 5 Addendum, 2026-02-16)
- Architecturally safe: NLAI does NOT inject signals, modify scoring, alter VTS, or override execution math
- Removes the Walter command bridge BEFORE we remove Walter (logical ordering)
- Sets the pattern and proves the workflow for the larger Wave 3 removal

---

## What Gets Removed

### 5 Files to DELETE (complete file removal)

| File | Lines | What It Does |
|------|-------|-------------|
| `server/services/nlai-interpreter.ts` | ~733 | Core NLAI interpreter — parses chat commands into intents |
| `server/services/contextual-nlai-interpreter.ts` | ~311 | Contextual variant with system state awareness |
| `server/services/nlai-execution-broker.ts` | ~477 | Action dispatch — routes intents through policy controller |
| `server/services/nlai-action-registry.ts` | ~2 (re-exports) | Registered action definitions |
| `server/services/execution-policy-controller.ts` | ~309 | Approval hooks and execution gating — verified NLAI-only consumer |

**Total deleted: ~1,832 lines across 5 files**

### 6 Files to MODIFY (import/reference cleanup)

| File | Change Type | Details |
|------|-------------|---------|
| `server/routes.ts` | **Import removal + code removal** | Lines 34-36: Remove 3 NLAI imports. Lines 111-113: Remove ExecutionPolicyController initialization + nlaiExecutionBroker.initialize(). Lines ~17419-17464: Remove NLAI chat handler block (the `nlaiInterpreter.interpret()` call and response handling). |
| `server/services/live-trading-service.ts` | **Import removal** | Line 13-14: Remove `import ExecutionPolicyController` and `import type { ActionResult }`. Line 22: Remove ExecutionPolicyController instantiation. Remove any ExecutionPolicyController usage in the file. |
| `server/services/auto_test_harness.ts` | **Import removal** | Line 10: Remove `import { nlaiActionRegistry }`. Line 212: Remove dynamic import of nlai-execution-broker. Lines ~216, ~294: Remove NLAI dispatch test code and ExecutionPolicyController references. |
| `server/services/paper-sim-service.ts` | **Comment cleanup** | Line 5: Remove comment reference to ExecutionPolicyController. No functional code changes. |
| `server/services/config-update-service.ts` | **Comment + string cleanup** | Line 4: Remove NLAI comment reference. Line 136: Remove `'Updated via Walter NLAI'` string literal (replace with neutral string or remove field). |
| `server/services/cognitive-tuner.ts` | **Comment + test reference cleanup** | Lines 115, 150, 162: Remove NLAI accuracy test references and domain accuracy objects. |

---

## What Is NOT Touched

- **Signal Orchestrator** — NLAI has no connection to signal generation
- **TradeSafety / Guardrails** — NLAI does not modify risk checks
- **VTS / Strategy Engine** — NLAI does not affect ML or strategy evaluation
- **DSE / Execution Engine** — NLAI does not touch order execution
- **Frontend** — NLAI has no frontend components (Walter's chat UI handles the frontend; that's a separate Wave 3 item)
- **Database schema** — No NLAI-specific tables to remove
- **Walter/Bob files** — Those are Wave 3 (12.2.3), not this batch

---

## Verification Checklist

After applying changes:
1. `grep -r "nlai" server/ --include="*.ts"` should return ZERO results (excluding docs/comments we intentionally left)
2. `grep -r "execution-policy-controller" server/ --include="*.ts"` should return ZERO results
3. `grep -r "NlaiInterpreter\|NlaiExecutionBroker\|NlaiActionRegistry\|ExecutionPolicyController" server/ --include="*.ts"` should return ZERO results
4. TSC compilation: error count should not increase (baseline: 20 pre-existing errors in files not modified by any directive)
5. Vitest: 816 pass / 81 fail baseline should hold
6. Server startup: should succeed without the NLAI imports (they were lazy-loaded / not critical path)

---

## Risk Assessment

| Risk | Likelihood | Mitigation |
|------|-----------|-----------|
| live-trading-service.ts breaks without ExecutionPolicyController | LOW | ExecutionPolicyController was a safety gate for autonomous actions — live mode is deferred and not in active use |
| auto_test_harness.ts NLAI tests fail | EXPECTED | These tests test NLAI functionality — they should be removed alongside the code |
| Chat handler in routes.ts breaks Walter chat | EXPECTED | Walter is deprecated and targeted for removal in Wave 3 — the chat handler falls through to the existing non-NLAI response path |
| Unexpected ExecutionPolicyController consumer | LOW | Grep verified only NLAI files + live-trading-service.ts consume it |

---

## Implementation Notes

- For `routes.ts` changes: the NLAI chat handler block (~lines 17419-17464) is inside a larger chat message handler. The removal should preserve the surrounding try/catch and the fallback response path. After removing the NLAI block, chat messages will go directly to the existing Walter/AI response handler (which will itself be removed in Wave 3).
- For `live-trading-service.ts`: if removing ExecutionPolicyController causes structural issues (e.g., the service expects a policy check), replace the policy check with a simple `true` pass-through or inline the approval logic. But based on the code, this service is deferred (live mode not in scope), so removal should be clean.
- The `auto_test_harness.ts` NLAI test section can be deleted entirely — it tests deprecated functionality.

---

## Batch 4 Deliverables

1. **5 deleted files** (staged as DELETE instructions in INSTRUCTIONS.md)
2. **6 modified files** (staged with exact find/replace instructions or full replacement files)
3. **README.md** documenting the batch
4. **INSTRUCTIONS.md** for Replit with autonomy constraints
5. **Zip**: `BATCH_4-DIR_12.2.7_NLAI_SYSTEM_REMOVAL.zip`

---

## Post-Batch 4: What Comes Next

With NLAI removed, the path clears for:
- **Batch 5: 12.2.3 (Wave 3 Part 1)** — Walter/Bob server-side service files (~27 files, ~9,500 lines)
- **Batch 6: 12.2.3 (Wave 3 Part 2)** — Cortex + middleware + route cleanup + Walter client components
- **Batch 7: 12.2.4 (Wave 3.1)** — Frontend Walter cleanup (walter.tsx, floating assistant, hooks)

NLAI is the bridge between the Walter AI system and the rest of DawnTrader. Removing it first ensures that when we delete Walter's files, there are no dangling command dispatch paths.
