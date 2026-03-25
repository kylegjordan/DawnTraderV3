# Batch 10 Scope — Directive 12.2.8: Wave 8 — Walter-Era Learning Services + Residual Cleanup

**Directive**: 12.2.8 (expanded to include orphaned residuals from Batches 7-9)
**Type**: Dead code removal + bug fix
**Baseline Commit**: `19e2c376` (Batch 9B governance)
**Risk**: LOW

---

## Scope

### Part 1: Dead Service Files (3 deletions, ~1,363 lines)

| File | Lines | Why Dead |
|------|-------|----------|
| `server/services/cognitive-interpreter.ts` | 589 | Learning persistence broken (learningBob removed in Batch 7). Only consumer is event-broker.ts which is itself orphaned. |
| `server/services/event-broker.ts` | 247 | Zero importers in entire codebase. Orphaned after cognitive-interpreter became dead. |
| `server/services/phase-8.6.5-enhancements.ts` | 527 | Zero importers in main branch. 4 exported services fully disconnected. 5 Directive 12.2.3 markers showing gutted code. |

### Part 2: Bug Fix — autonomy-controller.ts (1 surgical edit)

**File**: `server/services/autonomy-controller.ts`
**Bug**: `performStrategicCalibration()` (line 1087) calls `learningBridge.getLearningStats()` — method does not exist.
**Fix**:
- Line 1087: `getLearningStats()` → `generateLearningSummary()` (correct method name)
- Line 1088: Remove `'TradingBob'` from `agentsToCalibrate` array (Bob deleted in Batch 7)
- Line 1096: `.byAgent` → `.agentMetrics` (correct property name)
- Line 1098: `.total` → `.feedbackCount` (correct property name)

### Part 3: LATTi Lazy-Loader Stub Removal (1 surgical edit, resolves RISK-044)

**File**: `server/startup/lazy-loader.ts`
**Lines 37-41**: Empty async stub that logs "LATTi system fully removed" and returns null. Safe to delete — it occupies a slot in the critical services `Promise.all()` but does no work.

### Part 4: Misleading Log Prefix Cleanup (2 surgical edits)

**File**: `server/routes.ts`
- Line 9615: `[LATTIManager]` log prefix → `[PaperSimReset]` (not a LATTi operation)
- Line 9848: `[LATTIManager]` log prefix → `[PaperSimReset]` (same)

### Part 5: Orphaned Walter Storage Methods (2 surgical edits)

**File**: `server/storage.ts`
- Interface declaration: lines 682-684 — Remove 3 Walter method signatures (`getWalterActions`, `getWalterActionById`, `updateWalterAction`)
- Implementation: lines 4160-4221 — Remove 2 orphaned methods (`getWalterActions`, `getWalterActionById`). No callers exist in codebase.

---

## Impact Summary

| Metric | Value |
|--------|-------|
| Files deleted | 3 |
| Files surgically edited | 4 |
| Total lines removed | ~1,500 |
| Bugs fixed | 1 (autonomy-controller broken method call) |
| Risks resolved | RISK-044 (LATTi lazy-loader stub) |
| Risk level | LOW |

---

## Test Baseline
Expected: 800/81 unchanged (no test files affected)
