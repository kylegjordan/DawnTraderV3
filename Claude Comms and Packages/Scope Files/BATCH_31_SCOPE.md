# BATCH 31 SCOPE: Strategy Null Reason Infrastructure

**Phase:** 14.6
**Date:** 2026-03-26
**Approved by:** Kyle (autonomous directive — Option A full reason codes), Langston (technical review)

## Context
Kyle wants full visibility into WHY each strategy returns null. Currently 64% of nulls are "Strategy Conditions Not Met" — a catch-all. This batch adds the infrastructure to track granular null reasons per strategy. Batch 32 will instrument all 17 strategies with specific reason codes.

## Changes

### 1. New file: `server/utils/null-reason-tracker.ts`
Global context tracker (safe in single-threaded Node.js). Three functions:
- `setNullReason(reason: string)` — called by strategy before returning null
- `getNullReason(): string` — called by VTS runner after detect returns null
- `resetNullReason()` — called before each strategy detect call

### 2. Modify `server/types/virtual-trade.interface.ts`
Add `nullReasonDetail?: Record<string, number>` to VTSEvalSnapshot interface.

### 3. Modify `server/services/vts-runner.ts`
- Import null-reason-tracker
- In counter init: add `nullReasonDetail: {}`
- Before each `callStrategyDetect` call: `resetNullReason()`
- After detect returns null: `const reason = getNullReason(); vtsEvalCounters.nullReasonDetail[reason] = (vtsEvalCounters.nullReasonDetail[reason] ?? 0) + 1;`
- In aggregation function: merge nullReasonDetail across snapshots

### 4. Modify `client/src/pages/machine-learning.tsx`
Add "Strategy Null Reason Detail" subsection after the Strategy-Level Null Reasons table, showing top reasons with counts and percentages.

## Desired Outcomes
1. nullReasonDetail counter tracks per-reason counts
2. UI shows breakdown (initially all "unknown" until Batch 32 instruments strategies)
3. After Batch 32, Kyle can see exactly which gating condition kills most opportunities
4. No strategy function signatures changed — uses global context

## Verification Plan
1. Code review: verify tracker, counter, aggregation, UI
2. Preview site: "Strategy Null Reason Detail" section shows "unknown" with count matching conditionsNotMet
